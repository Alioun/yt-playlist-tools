import { afterEach, expect, test } from "bun:test"
import { isTabView, type TabView } from "../../shared/contracts/tab-view"
import { tabHelloMessages, tabMessages, type TabHelloMessages, type TabMessages } from "../../shared/contracts/tabs"
import { tabActionContract, tabAskContract, type TabActionMessages, type TabAskMessages } from "../../shared/contracts/tab-actions"
import { tabHealthContract, type TabHealthMessages, type TabNoticeClaim } from "../../shared/contracts/tab-health"
import { createMemoryNetwork } from "../../shared/rpc/memory"
import { createDirectPageChannel, pageJobsPresenceEvent } from "../../shared/rpc/page-channel"
import { createRpc, createRpcCaller } from "../../shared/rpc/rpc"
import { createLiveWwwJobs } from "../../page/adapters/live-www-jobs"
import { createLiveWwwReads } from "../../page/adapters/live-www-reads"
import { offerJobs } from "../../page/jobs-port"
import { vocabularyFor } from "../../page/gateway/port"
import { wwwRoutes } from "../../page/routes/www"
import { startPage } from "../../page/start"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { build, rawIdentity } from "../../../tools/fixtures/page-link/support"
import { hitStack } from "../../../tools/fixtures/pointer-keys/harness"
import { card, queueView } from "../../../tools/fixtures/site-queue-button/harness"
import cardMenuEntry from "../../entrypoints/feature-card-menu"
import queueButtonEntry from "../../entrypoints/feature-queue-button"
import autoAddEntry from "../../entrypoints/feature-auto-add"
import { pageGlobal } from "../global"
import { startKit } from "../kit/start"
import { createOverlayKit } from "../kit/overlay"
import { emptyTabView } from "../../background/tabs/teardown"
import { composeMonitor } from "../../background/compose/monitor"
import { parseSessionMemory } from "../../background/store/session-memory"
import { startSiteCore } from "./core"
import { WwwItems } from "./items-www"

type Sender = { readonly id: string }
const extensionId = "synthetic-extension"
const settle = async () => { for (let turn = 0; turn < 20; turn++) await new Promise(resolve => setTimeout(resolve, 0)) }
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  Reflect.deleteProperty(globalThis, "__pp")
  Reflect.deleteProperty(window, "ytcfg")
  document.body.replaceChildren()
})

function withCardMenu(view: TabView): TabView {
  if (view.site !== "www") throw new Error("www view expected")
  const value = { ...view, features: [...view.features, { id: "card-menu", options: { on: true, keepLinkMenu: false } }],
    statuses: [...view.statuses, { feature: "card-menu", state: "working", jobs: [], anchors: [], actions: [], kinds: [] }] }
  if (!isTabView(value)) throw new Error("Invalid card-menu view")
  return value
}

function brokenCardMenu(view: TabView): TabView {
  const value = { ...withCardMenu(view), notices: [] as unknown[] }
  value.statuses = value.statuses.map(status => status.feature === "card-menu" ? { ...status, state: "not-working", jobs: ["openCardMenu"], kinds: ["missing"] } : status) as never
  if (!isTabView(value)) throw new Error("Invalid broken card-menu view")
  return value
}
type NoticeMessages = Pick<TabHealthMessages, "tab.wouldAct" | "tab.claimNotice" | "tab.noticeShown" | "tab.noticeReleased">
function shadowText(): string {
  return [...document.querySelectorAll("*")].map(element => element.shadowRoot?.textContent ?? "").join(" ")
}

async function startTab(view: TabView, monitor?: { claim(): TabNoticeClaim | null | Promise<TabNoticeClaim | null>; heard: string[]; released?(token: string): Promise<void> }) {
  Object.assign(window, { ytcfg: { get: (key: string) => ({ LOGGED_IN: true, DATASYNC_ID: rawIdentity } as Record<string, unknown>)[key] } })
  const channel = createDirectPageChannel()
  const page = startPage({ site: "www", build, window, document, channel, createReads: createLiveWwwReads })
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const background = network.connect({ id: extensionId })
  const tab = network.connect({ id: extensionId })
  const deadline = (ms: number, expire: () => void) => { const timer = setTimeout(expire, ms); return () => clearTimeout(timer) }
  let current = view
  const hello = createRpc<TabHelloMessages<TabView>, Sender>(background, { build, deadline, contract: tabHelloMessages(isTabView) })
  hello.handle({ authenticate: () => ({ kind: "accepted", context: null }), handlers: { "tab.hello": () => current } })
  // The background's tab.need: Registrar.ensure injects the jobs file unless the probe finds it, then confirms with the probe.
  let needs = 0, injections = 0
  const here = () => !document.dispatchEvent(new CustomEvent(pageJobsPresenceEvent, { detail: build, cancelable: true }))
  const actions = createRpc<Pick<TabActionMessages, "tab.need" | "tab.settings">, Sender>(background, { build, deadline,
    contract: { "tab.need": tabActionContract["tab.need"], "tab.settings": tabActionContract["tab.settings"] } })
  actions.handle({ authenticate: () => ({ kind: "accepted", context: null }), handlers: { "tab.settings": target => { monitor?.heard.push(`settings ${JSON.stringify(target)}`); return null }, "tab.need": request => {
    needs++
    if (!("jobs" in request)) return { kind: "failed" }
    if (!here()) { injections++; offerJobs(document, { site: "www", build, create: createLiveWwwJobs }) }
    return { kind: here() ? "ok" : "failed" }
  } } })
  const notices = createRpc<NoticeMessages, Sender>(background, { build, deadline, contract: {
    "tab.wouldAct": tabHealthContract["tab.wouldAct"], "tab.claimNotice": tabHealthContract["tab.claimNotice"], "tab.noticeShown": tabHealthContract["tab.noticeShown"],
    "tab.noticeReleased": tabHealthContract["tab.noticeReleased"] } })
  notices.handle({ authenticate: () => ({ kind: "accepted", context: null }), handlers: {
    "tab.wouldAct": ({ request }) => { monitor?.heard.push(`would-act ${request.feature}`); return null },
    "tab.claimNotice": () => { monitor?.heard.push("claim"); return monitor?.claim() ?? null },
    "tab.noticeShown": ({ request }) => { monitor?.heard.push(`shown ${request.token}`); return null },
    "tab.noticeReleased": async ({ request }) => { monitor?.heard.push(`released ${request.token}`); await monitor?.released?.(request.token); return null }
  } })
  const push = createRpcCaller<TabMessages<TabView>>(background, { build, deadline, contract: tabMessages(isTabView) })
  const core = startSiteCore({
    site: "www", build, document, channel, i18n: englishI18n(), vocabulary: vocabularyFor(wwwRoutes), deadline,
    items: options => new WwwItems(options),
    runtime: { transport: tab, identity: () => extensionId, senderId: sender => sender.id }
  })
  pageGlobal().core = core
  const stack = hitStack()
  cleanups.push(() => page.dispose(), () => core.dispose(), () => hello.dispose(), () => actions.dispose(), () => notices.dispose(), () => push.dispose(), () => stack.restore())
  await core.page.hello
  await settle()
  const asks = createRpcCaller<TabAskMessages>(background, { build, deadline, contract: tabAskContract })
  cleanups.push(() => asks.dispose())
  return {
    core, stack, asks, needs: () => needs, injections: () => injections, here,
    async publish(next: TabView) { current = next; await push.call("bg.view", next); await settle() },
    button() {
      const found = document.querySelector("pp-overlay")?.shadowRoot?.querySelector("[data-slot=queue] button")
      return found instanceof HTMLButtonElement && !found.closest("[hidden]") ? found : null
    }
  }
}

test("the assembled core runs the real queue-button and card-menu files once the tab view switches them on", async () => {
  const tab = await startTab(withCardMenu(queueView()))
  expect(tab.core.link.state.kind).toBe("ready")
  startKit("www", {}, {}, { overlay: createOverlayKit })
  queueButtonEntry.main()
  cardMenuEntry.main()
  await settle()
  expect([...pageGlobal().loaded.keys()].sort()).toEqual(["feature-card-menu", "feature-queue-button", "kit-www"])

  const first = card()
  tab.stack.set([first.thumbnail, first.element])
  first.thumbnail.dispatchEvent(new PointerEvent("pointerover", { clientX: 12, clientY: 18, bubbles: true, composed: true }))
  await settle()
  expect(tab.button()?.getAttribute("aria-label")).toBe("Add to queue")

  const menu = document.createElement("ytd-menu-renderer")
  menu.innerHTML = `<yt-icon-button id="button"><button aria-haspopup="true"></button></yt-icon-button>`
  first.element.append(menu)
  const rightClick = new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true })
  first.heading.dispatchEvent(rightClick)
  expect(rightClick.defaultPrevented).toBe(true)

  await tab.publish(queueView({ on: false }))
  expect(tab.button()).toBeNull()
  const plain = new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true })
  first.heading.dispatchEvent(plain)
  expect(plain.defaultPrevented).toBe(false)
})

test("the view the background sends at withdrawal or Clear all removes every feature the tab drew", async () => {
  const view = withCardMenu(queueView())
  const tab = await startTab(view)
  startKit("www", {}, {}, { overlay: createOverlayKit })
  queueButtonEntry.main()
  cardMenuEntry.main()
  await settle()
  const first = card()
  tab.stack.set([first.thumbnail, first.element])
  first.thumbnail.dispatchEvent(new PointerEvent("pointerover", { clientX: 12, clientY: 18, bubbles: true, composed: true }))
  await settle()
  expect(tab.button()).not.toBeNull()

  await tab.publish(emptyTabView(view.signedIn ? { site: "www", build: view.build, signedIn: true, acct: view.acct } : { site: "www", build: view.build, signedIn: false, acct: null }, view.private))
  expect(tab.core.link.view?.features).toEqual([])
  expect(tab.button()).toBeNull()
  const rightClick = new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true })
  first.heading.dispatchEvent(rightClick)
  expect(rightClick.defaultPrevented).toBe(false)
})

test("the background's bg.query reads auto-add's view of the playing video from the page, and nothing without one", async () => {
  const tab = await startTab(queueView())
  expect(await tab.asks.call("bg.query", { name: "auto-add" })).toEqual({ kind: "answered", result: null })
  const view = { video: "aaaaaaaaaaa" as never, title: "First video", state: { kind: "counting", goal: 50, watched: 20 } as const, watched: 20,
    playlists: [{ pl: "PL_music" as never, pct: 50, outcome: "waiting" as const }], channel: null }
  tab.core.thisVideo.publish(view)
  expect(await tab.asks.call("bg.query", { name: "auto-add" })).toEqual({ kind: "answered", result: view })
})

test("bg.query with channel: false answers without reading the channel, which the popup asks for next (YT-CF-15)", async () => {
  const tab = await startTab(queueView())
  const view = { video: "aaaaaaaaaaa" as never, title: "First video", state: { kind: "counting", goal: 50, watched: 20 } as const, watched: 20,
    playlists: [{ pl: "PL_music" as never, pct: 50, outcome: "waiting" as const }], channel: null }
  tab.core.thisVideo.publish(view)
  expect(await tab.asks.call("bg.query", { name: "auto-add", channel: false })).toEqual({ kind: "answered", result: view })
  expect(tab.needs()).toBe(0)
  await tab.asks.call("bg.query", { name: "auto-add" })
  expect(tab.needs()).toBe(1)
})

test("the core's first job asks the background for the jobs file once, and later jobs reuse it", async () => {
  const tab = await startTab(queueView())
  const videoId = "aaaaaaaaaaa" as never
  expect(await tab.core.page.run({ job: { kind: "videoInfo" } })).toMatchObject({ ok: false })
  expect([tab.needs(), tab.here()]).toEqual([0, false])
  await tab.core.page.run({ job: { kind: "channelOf", videoId } })
  await tab.core.page.run({ job: { kind: "channelOf", videoId } })
  expect([tab.needs(), tab.injections(), tab.here()]).toEqual([1, 1, true])
})

test("a feature file whose feature isn't built records itself and draws nothing", async () => {
  await startTab(queueView())
  autoAddEntry.main()
  expect(pageGlobal().loaded.has("feature-auto-add")).toBe(true)
  expect(document.querySelector("pp-overlay")).toBeNull()
})

test("feature files that run before their core define nothing and record nothing", () => {
  queueButtonEntry.main()
  expect(pageGlobal().loaded.size).toBe(0)
})

test("a broken card menu tells the background at a right-click, and the notice it batches shows once in the core's own notice (YT-BRK-02, UI-TOAST-16)", async () => {
  const broken = brokenCardMenu(queueView({ on: false }))
  const heard: string[] = []
  let owed: TabNoticeClaim | null = { token: "0000000000000001:7", due: { kind: "not-working", features: ["card-menu"] } }
  const tab = await startTab(broken, { heard, claim() { const claim = owed; owed = null; return claim } })
  // happy-dom leaves this undefined; a browser reports null outside fullscreen.
  Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true })
  cleanups.push(() => Reflect.deleteProperty(document, "fullscreenElement"))
  cardMenuEntry.main()
  await settle()
  const first = card()
  first.element.insertAdjacentHTML("beforeend", `<ytd-menu-renderer><yt-icon-button id="button"><button aria-haspopup="true"></button></yt-icon-button></ytd-menu-renderer>`)
  const rightClick = new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true })
  first.heading.dispatchEvent(rightClick)
  first.heading.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, composed: true, cancelable: true }))
  await settle()
  expect(rightClick.defaultPrevented).toBe(false)
  expect(heard).toEqual(["would-act card-menu"])
  expect(shadowText()).not.toContain("isn't working")

  const due = { ...broken, notices: [{ kind: "not-working", features: ["card-menu"] }] }
  if (!isTabView(due)) throw new Error("Invalid due view")
  await tab.publish(due)
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(shadowText()).toContain("isn't working right now because YouTube changed something.")
  expect(shadowText()).toContain("Details")
  expect(heard).toEqual(["would-act card-menu", "claim", "shown 0000000000000001:7"])
  const details = [...document.querySelector("pp-toast-layer")?.shadowRoot?.querySelectorAll("button") ?? []].find(button => button.textContent === "Details")
  details?.click()
  await settle()
  expect(heard.at(-1)).toBe(`settings {"section":"diagnostics"}`)
  expect(shadowText()).not.toContain("isn't working")

  await tab.publish(due)
  await settle()
  expect(shadowText()).not.toContain("isn't working")
  expect(heard.filter(entry => entry.startsWith("shown"))).toEqual(["shown 0000000000000001:7"])
})

test("a notice this page showed isn't claimed or shown again when the background lists it once more (YT-BRK-02)", async () => {
  const broken = brokenCardMenu(queueView({ on: false }))
  const heard: string[] = []
  let claims = 0
  // A background that lost the page's report offers the same notice again.
  const tab = await startTab(broken, { heard, claim: () => ({ token: `0000000000000001:${++claims}`, due: { kind: "not-working", features: ["card-menu"] } }) })
  Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true })
  cleanups.push(() => Reflect.deleteProperty(document, "fullscreenElement"))
  tab.core.notices.wouldAct("card-menu")
  const due = { ...broken, notices: [{ kind: "not-working", features: ["card-menu"] }] }
  if (!isTabView(due)) throw new Error("Invalid due view")
  await tab.publish(due)
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(shadowText()).toContain("isn't working")
  const dismiss = [...document.querySelector("pp-toast-layer")?.shadowRoot?.querySelectorAll("button") ?? []].find(button => button.getAttribute("aria-label"))
  dismiss?.click()
  await settle()
  expect(shadowText()).not.toContain("isn't working")
  await tab.publish(broken)
  await tab.publish(due)
  tab.core.notices.wouldAct("card-menu")
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(shadowText()).not.toContain("isn't working")
  expect(heard).toEqual(["would-act card-menu", "claim", "shown 0000000000000001:1"])
})

test("a hidden or fullscreen tab leaves the due notice for a visible one, and takes it once it is shown (YT-BRK-02)", async () => {
  const broken = brokenCardMenu(queueView({ on: false }))
  const heard: string[] = []
  const tab = await startTab(broken, { heard, claim: () => ({ token: "0000000000000001:7", due: { kind: "not-working", features: ["card-menu"] } }) })
  const seen = { hidden: true, fullscreen: null as Element | null }
  Object.defineProperty(document, "hidden", { get: () => seen.hidden, configurable: true })
  Object.defineProperty(document, "visibilityState", { get: () => (seen.hidden ? "hidden" : "visible"), configurable: true })
  Object.defineProperty(document, "fullscreenElement", { get: () => seen.fullscreen, configurable: true })
  cleanups.push(() => { for (const name of ["hidden", "visibilityState", "fullscreenElement"]) Reflect.deleteProperty(document, name) })
  tab.core.notices.wouldAct("card-menu")
  const due = { ...broken, notices: [{ kind: "not-working", features: ["card-menu"] }] }
  if (!isTabView(due)) throw new Error("Invalid due view")
  await tab.publish(due)
  await settle()
  expect(heard).toEqual(["would-act card-menu"])

  seen.hidden = false
  seen.fullscreen = document.body
  document.dispatchEvent(new Event("visibilitychange"))
  await settle()
  expect(heard).toEqual(["would-act card-menu"])

  seen.fullscreen = null
  document.dispatchEvent(new Event("fullscreenchange"))
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(heard).toEqual(["would-act card-menu", "claim", "shown 0000000000000001:7"])
  expect(shadowText()).toContain("isn't working")
})

function visibility() {
  const seen = { hidden: false, fullscreen: null as Element | null }
  Object.defineProperty(document, "hidden", { get: () => seen.hidden, configurable: true })
  Object.defineProperty(document, "visibilityState", { get: () => (seen.hidden ? "hidden" : "visible"), configurable: true })
  Object.defineProperty(document, "fullscreenElement", { get: () => seen.fullscreen, configurable: true })
  cleanups.push(() => { for (const name of ["hidden", "visibilityState", "fullscreenElement"]) Reflect.deleteProperty(document, name) })
  return {
    hide() { seen.hidden = true; document.dispatchEvent(new Event("visibilitychange")) },
    show() { seen.hidden = false; document.dispatchEvent(new Event("visibilitychange")) },
    set hidden(value: boolean) { seen.hidden = value }
  }
}
async function dueCardMenu(tab: Awaited<ReturnType<typeof startTab>>, broken: TabView) {
  tab.core.notices.wouldAct("card-menu")
  const due = { ...broken, notices: [{ kind: "not-working", features: ["card-menu"] }] }
  if (!isTabView(due)) throw new Error("Invalid due view")
  await tab.publish(due)
}

test("a tab hidden while its claim is on its way gives the notice back, and claims it again once it is shown (YT-BRK-02)", async () => {
  const broken = brokenCardMenu(queueView({ on: false }))
  const heard: string[] = []
  const asked = Promise.withResolvers<void>(), reply = Promise.withResolvers<void>()
  let claims = 0
  const tab = await startTab(broken, { heard, async claim() {
    const token = `0000000000000001:${++claims}`
    if (claims === 1) { asked.resolve(); await reply.promise }
    return { token, due: { kind: "not-working", features: ["card-menu"] } }
  } })
  const page = visibility()
  await dueCardMenu(tab, broken)
  await asked.promise
  page.hide()
  reply.resolve()
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(heard).toEqual(["would-act card-menu", "claim", "released 0000000000000001:1"])
  expect(shadowText()).not.toContain("isn't working")

  page.show()
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(heard).toEqual(["would-act card-menu", "claim", "released 0000000000000001:1", "claim", "shown 0000000000000001:2"])
  expect(shadowText()).toContain("isn't working")
})

test("a tab hidden while its claimed notice is being drawn gives the notice back, and claims it again once it is shown (YT-BRK-02)", async () => {
  const broken = brokenCardMenu(queueView({ on: false }))
  const heard: string[] = []
  let claims = 0
  const tab = await startTab(broken, { heard, claim: () => ({ token: `0000000000000001:${++claims}`, due: { kind: "not-working", features: ["card-menu"] } }) })
  const page = visibility()
  // The notice's layer is built over a few turns. The tab is hidden before it is on screen.
  const create = document.createElement
  let hides = 0
  document.createElement = function (this: Document, name: string, ...rest: unknown[]) {
    if (name === "pp-toast-layer" && hides++ === 0) page.hidden = true
    return Reflect.apply(create, this, [name, ...rest])
  } as typeof document.createElement
  cleanups.push(() => { document.createElement = create })
  await dueCardMenu(tab, broken)
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(hides).toBeGreaterThan(0)
  page.hide()
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(heard).toEqual(["would-act card-menu", "claim", "released 0000000000000001:1"])
  expect(shadowText()).not.toContain("isn't working")

  page.show()
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(heard).toEqual(["would-act card-menu", "claim", "released 0000000000000001:1", "claim", "shown 0000000000000001:2"])
  expect(shadowText()).toContain("isn't working")
})

test("the Monitor hands a notice to a visible tab once the tab that claimed it was hidden before showing it (YT-BRK-02)", async () => {
  const memory = parseSessionMemory({})
  if (!memory) throw new Error("No session memory")
  let now = 100
  const monitor = composeMonitor({
    owner: {
      readSession: async () => ({ kind: "memory", memory, revision: { reset: 0, accounts: new Map() }, sequence: 0 }) as never,
      changeSession: async () => ({ kind: "unavailable", reason: "stale" }) as never,
      subscribeView: () => () => {}
    },
    clock: { now: () => now, after: () => () => {} }
  })
  cleanups.push(() => monitor.dispose())
  const broken = brokenCardMenu(queueView({ on: false }))
  // Two private tabs with the same broken card menu. A private claim is held in the Monitor's memory alone.
  const context = (tabId: number) => ({
    tab: { tabId, windowId: 1, incognito: true, site: "www", lastAccessed: tabId, active: true, discarded: false, frozen: false },
    info: { site: "www", build, signedIn: true, acct: "AAAAAAAAAAAAAAAA" }
  }) as never
  for (const tabId of [4, 5]) {
    await monitor.observeAnchor(context(tabId), {
      anchor: "www-cards",
      signal: { site: "www", feature: null, job: null, route: null, kind: "anchor-missing", watchId: null, shape: null, clientVersion: null, pageType: "watch", count: 1, firstSeen: now, lastSeen: now },
      observation: { kind: "content", relevant: true, visible: true, navigationAt: 0, observedAt: 3000, distinctMainLinks: 8, recognised: 1 }
    } as never)
    await monitor.wouldAct(context(tabId), broken.features, "card-menu")
  }
  now += 61
  async function claimFor(tabId: number) {
    const read = await monitor.statusProducer.read(context(tabId), broken.features)
    if (read.kind !== "statuses") throw new Error(read.kind)
    return monitor.claimNotice(context(tabId), read)
  }
  const heard: string[] = []
  const asked = Promise.withResolvers<void>(), reply = Promise.withResolvers<void>()
  const tab = await startTab(broken, {
    heard,
    async claim() {
      const claim = await claimFor(4)
      asked.resolve()
      await reply.promise
      return claim.kind === "delivery" ? { token: `${claim.token.instance}:${claim.token.sequence}`, due: { kind: "not-working", features: ["card-menu"] } } : null
    },
    async released(token) {
      const [instance, sequence] = token.split(":")
      await monitor.releaseNotice(context(4), { instance, sequence: Number(sequence) } as never)
    }
  })
  const page = visibility()
  await dueCardMenu(tab, broken)
  await asked.promise
  expect((await claimFor(5)).kind).toBe("none")
  page.hide()
  reply.resolve()
  for (let turn = 0; turn < 10; turn++) await settle()
  expect(heard.filter(row => row.startsWith("shown"))).toEqual([])
  expect((await claimFor(5)).kind).toBe("delivery")
})

test("a broken queue button tells the background at the first hover and draws nothing (YT-Q-10)", async () => {
  const heard: string[] = []
  const tab = await startTab({ ...queueView({ state: "not-working" }), notices: [] }, { heard, claim: () => null })
  startKit("www", {}, {}, { overlay: createOverlayKit })
  queueButtonEntry.main()
  await settle()
  const first = card()
  tab.stack.set([first.thumbnail, first.element])
  first.thumbnail.dispatchEvent(new PointerEvent("pointerover", { clientX: 12, clientY: 18, bubbles: true, composed: true }))
  await settle()
  expect(tab.button()).toBeNull()
  expect(heard).toEqual(["would-act queue-button"])
})
