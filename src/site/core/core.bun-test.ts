import { afterEach, expect, test } from "bun:test"
import { isTabView, type TabView } from "../../shared/contracts/tab-view"
import { tabHelloMessages, tabMessages, type TabHelloMessages, type TabMessages } from "../../shared/contracts/tabs"
import { tabActionContract, tabAskContract, type TabActionMessages, type TabAskMessages } from "../../shared/contracts/tab-actions"
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
import { emptyTabView } from "../../background/tabs/teardown"
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

async function startTab(view: TabView) {
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
  const actions = createRpc<Pick<TabActionMessages, "tab.need">, Sender>(background, { build, deadline, contract: { "tab.need": tabActionContract["tab.need"] } })
  actions.handle({ authenticate: () => ({ kind: "accepted", context: null }), handlers: { "tab.need": request => {
    needs++
    if (!("jobs" in request)) return { kind: "failed" }
    if (!here()) { injections++; offerJobs(document, { site: "www", build, create: createLiveWwwJobs }) }
    return { kind: here() ? "ok" : "failed" }
  } } })
  const push = createRpcCaller<TabMessages<TabView>>(background, { build, deadline, contract: tabMessages(isTabView) })
  const core = startSiteCore({
    site: "www", build, document, channel, i18n: englishI18n(), vocabulary: vocabularyFor(wwwRoutes), deadline,
    items: options => new WwwItems(options),
    runtime: { transport: tab, identity: () => extensionId, senderId: sender => sender.id }
  })
  pageGlobal().core = core
  const stack = hitStack()
  cleanups.push(() => page.dispose(), () => core.dispose(), () => hello.dispose(), () => actions.dispose(), () => push.dispose(), () => stack.restore())
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
  startKit("www", {}, {})
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
  startKit("www", {}, {})
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
