import { isQueueListId, isSetVideoId, type Job } from "../../../src/shared/contracts"
import { isTabView, type FeatureStatus, type TabView } from "../../../src/shared/contracts/tab-view"
import { tabHelloMessages, tabMessages, type TabHelloMessages, type TabMessages } from "../../../src/shared/contracts/tabs"
import { queueButtonText } from "../../../src/shared/copy"
import { createMemoryNetwork } from "../../../src/shared/rpc/memory"
import { createRpc, createRpcCaller } from "../../../src/shared/rpc/rpc"
import { createExtLink } from "../../../src/site/core/extlink"
import { createFeatureHost, type SiteView } from "../../../src/site/core/feature-host"
import { WwwItems } from "../../../src/site/core/items-www"
import { Keys } from "../../../src/site/core/keys"
import { Pointer } from "../../../src/site/core/pointer"
import { Scope } from "../../../src/site/core/scope"
import { queueButton, type QueueButtonServices } from "../../../src/site/features/queue-button"
import { createFeedbackSession } from "../../../src/site/kit/feedback/session"
import { createOverlayKit } from "../../../src/site/kit/overlay"
import { englishI18n } from "../localization/scripted"
import { build, checked, deferred, expectedKey, harness as pageHarness, nav, rawIdentity, route, snapshot } from "../page-link/support"
import { focusVisibility, hitStack } from "../pointer-keys/harness"
import { settle } from "../extlink/harness"
import { clock, labels, raw, undoKey } from "../site-toaster/harness"
import { wireView } from "../tab-view/cases"

export { settle }
export const videoA = "AAAAAAAAAAA"
export const videoB = "BBBBBBBBBBB"
export const listId = checked(isQueueListId, "synthetic-queue-list")
export const entryA = checked(isSetVideoId, "synthetic-entry-a")
export const entryB = checked(isSetVideoId, "synthetic-entry-b")

const brokenJobs = { working: [], "partly-working": ["queueUndo"], "not-working": ["queueAdd"] } as const satisfies Record<FeatureStatus["state"], FeatureStatus["jobs"]>
export type QueueViewOptions = { readonly signedIn?: boolean; readonly feedback?: boolean; readonly state?: FeatureStatus["state"]; readonly on?: boolean }
export function queueView(options: QueueViewOptions = {}): SiteView<"www"> {
  const { signedIn = true, feedback = true, state = "working", on = true } = options
  const base = wireView("www", signedIn)
  if (base.site !== "www") throw Error("Expected a www specimen")
  const features = on ? base.features.flatMap(feature => feature.id === "queue-button" ? [{ ...feature, options: { ...feature.options, feedback } }] : []) : []
  const value = checked(isTabView, {
    ...base, ...(signedIn ? { acct: expectedKey(rawIdentity) } : {}), features,
    statuses: on ? base.statuses.flatMap(status => status.feature === "queue-button" ? [{ ...status, state, jobs: brokenJobs[state] }] : []) : [],
    notices: on && state === "not-working" ? [{ kind: "not-working", features: ["queue-button"] }] : []
  })
  if (value.site !== "www") throw Error("Expected a validated www view")
  return value
}

export function card(video = videoA, title = "First video", family = "ytd-rich-grid-media") {
  const element = document.createElement(family)
  const thumbnail = document.createElement("a")
  thumbnail.id = "thumbnail"
  thumbnail.setAttribute("href", `/watch?v=${video}`)
  const details = document.createElement("a")
  details.id = "video-title-link"
  details.setAttribute("href", `/watch?v=${video}`)
  const heading = document.createElement("span")
  heading.id = "video-title"
  heading.textContent = title
  details.append(heading)
  element.append(thumbnail, details)
  document.body.append(element)
  return { element, thumbnail, details, heading }
}
export function recycle(target: ReturnType<typeof card>, video: string, title: string) {
  target.thumbnail.setAttribute("href", `/watch?v=${video}`)
  target.details.setAttribute("href", `/watch?v=${video}`)
  target.heading.textContent = title
}

type Script = (job: Job, context?: { target?: Element }) => Promise<unknown>
export async function queueFixture(options: { readonly view?: SiteView<"www">; readonly signedInPage?: boolean } = {}) {
  let script: Script = async () => ({ ok: false, reason: "unavailable" })
  const page = pageHarness({
    run: (job, context) => script(job, context),
    pageSnapshot: () => snapshot(options.signedInPage === false ? null : rawIdentity)
  })
  type Sender = { readonly id: string }
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const background = network.connect({ id: "synthetic-queue-extension" })
  const siteEnd = network.connect({ id: "synthetic-queue-extension" })
  let current: TabView = options.view ?? queueView()
  const deadline = page.clock.after.bind(page.clock)
  const hello = createRpc<TabHelloMessages<TabView>, Sender>(background, { build, deadline, contract: tabHelloMessages(isTabView) })
  hello.handle({ authenticate: () => ({ kind: "accepted", context: null }), handlers: { "tab.hello": () => current } })
  const caller = createRpcCaller<TabMessages<TabView>>(background, { build, deadline, contract: tabMessages(isTabView) })
  const restoreHidden = raw(document, "hidden", false)
  const restoreFull = raw(document, "fullscreenElement", null)
  const timers = clock()
  const errors: unknown[] = [], failures: unknown[] = [], notices: string[] = []
  const onError = (error: unknown) => { errors.push(error) }
  const root = new Scope({ document, onError })
  const ext = createExtLink({
    build, site: "www", page: page.link, deadline, hiddenAtStart: false, isView: isTabView,
    runtime: { transport: siteEnd, identity: () => "synthetic-queue-extension", senderId: sender => sender.id }
  })
  const pointer = new Pointer({ document, onError })
  const items = new WwwItems({ document, onError, pointer, page: page.link, report: { itemUnrecognised: () => {}, pageSettled: () => {} } })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError })
  const i18n = englishI18n()
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "www", i18n, labels,
    initial: { undoKey, features: [] }, now: timers.now, onError, onCosmetic: () => {} })
  const overlay = createOverlayKit({ owner: root, document, onError })
  const services: QueueButtonServices = {
    document, items, page: page.link, feedback, overlay, text: queueButtonText(i18n),
    notices: { wouldAct: feature => { notices.push(feature) } }
  }
  const scopes: Scope[] = []
  const host = createFeatureHost<"www", QueueButtonServices>({
    site: "www",
    createScope() { const scope = new Scope({ document, onError }); scopes.push(scope); return scope },
    createContext: () => services,
    onEmpty: () => {}, onError: failure => { failures.push(failure) }
  })
  const stack = hitStack()
  host.define(queueButton)
  host.connect(ext)
  await page.link.hello
  await settle()
  return {
    page, ext, host, items, pointer, overlay, feedback, timers, errors, failures, notices, scopes, stack,
    respond(next: Script) { script = next },
    deferred,
    route,
    async publish(view: TabView) { current = view; await caller.call("bg.view", view); await settle() },
    hover(element: Element, under: readonly Element[] = []) {
      stack.set([element, ...under])
      element.dispatchEvent(new PointerEvent("pointerover", { clientX: 12, clientY: 18, bubbles: true, composed: true }))
    },
    focus(element: HTMLElement) {
      const visible = focusVisibility(element)
      element.tabIndex = 0
      element.focus()
      return visible
    },
    hostCount: () => document.querySelectorAll("pp-overlay").length,
    overlayHost: () => document.querySelector("pp-overlay"),
    button(): HTMLButtonElement | null {
      const found = document.querySelector("pp-overlay")?.shadowRoot?.querySelector("[data-slot=queue] button")
      return found instanceof HTMLButtonElement && !found.closest("[hidden]") ? found : null
    },
    toast: () => feedback.read()?.feedback.toaster.read() ?? null,
    present() { const toaster = feedback.read()?.feedback.toaster; const view = toaster?.read(); if (toaster && view) toaster.presented(view) },
    runs: (kind: Job["kind"]) => page.calls.filter(call => call.job.kind === kind),
    fullscreen(value: Element | null) { Object.defineProperty(document, "fullscreenElement", { configurable: true, value }); document.dispatchEvent(new Event("fullscreenchange")) },
    hidden(value: boolean) { Object.defineProperty(document, "hidden", { configurable: true, value }); document.dispatchEvent(new Event("visibilitychange")) },
    navigate() { for (const watcher of page.watchers) if (watcher.stream === "nav") watcher.emit(nav) },
    dispose() {
      host.dispose(); items.dispose(); pointer.dispose(); keys.dispose(); root.dispose(); ext.dispose(); caller.dispose(); hello.dispose(); page.dispose()
      stack.restore(); timers.restore(); restoreHidden(); restoreFull()
      document.body.replaceChildren()
    }
  }
}
export type QueueFixture = Awaited<ReturnType<typeof queueFixture>>
