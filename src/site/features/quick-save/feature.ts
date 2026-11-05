import type { TabAddReport } from "../../../shared/contracts/tab-actions"
import type { I18n } from "../../../shared/i18n"
import type { Key, PlaylistId, VideoId } from "../../../shared/model"
import type { TabActions, Unanswered } from "../../core/actions"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { WwwItems, WwwItemTarget, WwwPointed } from "../../core/items-www"
import type { PageLink } from "../../core/page-link"
import type { Dispose, Scope } from "../../core/scope"
import type { Feedback } from "../../kit/feedback"
import type { OverlayKit } from "../../kit/overlay"
import type { Popovers } from "../../popovers/types"
import type { ExplicitContext } from "../../explicit"
import { display, explicitAdd, explicitContent } from "$kit"
import { glyph as stateGlyph } from "../queue-button/glyphs"

export type QuickSaveServices = {
  readonly document: Document
  readonly items: Pick<WwwItems, "track" | "readPointed" | "recognise">
  readonly page: Pick<PageLink, "watch" | "onState">
  readonly actions: TabActions
  readonly feedback: { use(owner: Scope): Feedback | null }
  readonly overlay: Pick<OverlayKit, "use">
  readonly i18n: I18n
  readonly notices: { wouldAct(feature: "quick-save"): void }
  /** Loads `popovers.js`. A hover preload ignores a failure (UI-PICK-17). */
  readonly popovers: () => Promise<Popovers | null>
  readonly location: Pick<Location, "href" | "assign">
  readonly os: "macos" | "windows" | "linux"
}
/** YT-QS-06: done shows ✓ for 1.5 s, then saved for the page view; failed shows for 1.5 s, then idle. */
export type QuickSaveState = "idle" | "busy" | "done" | "saved" | "failed"
export const settleMs = 1_500

type Options = { readonly feedback: boolean; readonly shorts: boolean; readonly working: boolean; readonly playlist: PlaylistId | null }
type Shown = { readonly target: WwwItemTarget; readonly link: HTMLElement; readonly title: string | undefined }

const thumbnails = "a#thumbnail, a.yt-lockup-view-model__content-image, a.ytLockupViewModelContentImage, a.ytd-thumbnail, a.reel-item-endpoint, a.shortsLockupViewModelHostEndpoint"
const titles = "#video-title, #video-title-link, .ytLockupMetadataViewModelTitle, .yt-lockup-metadata-view-model__title, h3"
const players = "#movie_player, #shorts-player, ytd-player, ytd-miniplayer, .html5-video-player"
const bookmark = "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z"
const filled = "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"
const caret = "M7 10l5 5 5-5z"
const nothing: Dispose = () => {}
const unavailable = (): never => { throw new Error("Quick-save overlay slot is unavailable") }

function optionsOf(view: SiteView<"www"> | null): Options | null {
  const feature = view?.features.find(entry => entry.id === "quick-save")
  if (!view || feature?.id !== "quick-save") return null
  const setup = view.setup?.kind === "live" ? view.setup.setup : null
  return { feedback: feature.options.feedback, shorts: feature.options.shortsShelves,
    working: view.statuses.find(status => status.feature === "quick-save")?.state !== "not-working",
    playlist: (setup?.quickSave ?? null) as PlaylistId | null }
}
function pickerKey(view: SiteView<"www"> | null): Key | null {
  const feature = view?.features.find(entry => entry.id === "shortcuts")
  return feature?.id === "shortcuts" && feature.options.picker ? feature.options.picker as Key : null
}
function supported(pointed: WwwPointed, shorts: boolean): WwwItemTarget | null {
  if (pointed.kind !== "pointed-item") return null
  return pointed.target.family !== "shorts" || shorts ? pointed.target : null
}
function sameItem(a: WwwItemTarget, b: WwwItemTarget): boolean {
  return a.element === b.element && a.identity.videoId === b.identity.videoId && a.identity.signature === b.identity.signature
}
function thumbnailOf(target: WwwItemTarget): HTMLElement | null {
  const realm = target.element.ownerDocument.defaultView
  if (!realm) return null
  for (const link of target.element.querySelectorAll(thumbnails)) {
    if (link.closest(players) || !(link instanceof realm.HTMLElement)) continue
    const href = link.getAttribute("href")
    if (href === null) continue
    try {
      const url = new URL(href, "https://www.youtube.com/")
      const id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.startsWith("/shorts/") ? url.pathname.slice(8) : null
      if (id === target.identity.videoId) return link
    } catch { continue }
  }
  return null
}
function svg(document: Document, path: string): Element {
  const element = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  element.setAttribute("class", "glyph"); element.setAttribute("viewBox", "0 0 24 24"); element.setAttribute("aria-hidden", "true")
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path")
  shape.setAttribute("d", path)
  element.append(shape)
  return element
}

function start(context: FeatureContext<"www", QuickSaveServices>): void {
  const { scope, view, document, items, page, overlay, actions, i18n, notices } = context
  const lease = overlay.use(scope, "quick-save") ?? unavailable()
  items.track(scope)
  const states = new Map<VideoId, QuickSaveState>()
  let revision = 0
  let names: ReadonlyMap<PlaylistId, string> | null = null
  const split = document.createElement("div")
  split.style.cssText = "display: inline-flex; gap: 2px; pointer-events: auto;"
  const main = document.createElement("button"), more = document.createElement("button")
  main.type = more.type = "button"
  main.className = more.className = "button"
  more.style.width = "24px"
  split.append(main, more)
  lease.slot.append(split)
  let shown: Shown | null = null
  let noticed = false

  function feedbackSession(): Feedback | null { return context.feedback.use(scope) }
  function explicit(feedback: Feedback): ExplicitContext { return { session: feedback, actions, i18n, location: context.location } }
  function listName(playlist: PlaylistId | null): string | null {
    if (playlist === null) return null
    return names?.get(playlist) ?? (playlist === "WL" ? i18n.message("picker_watchLater") : null)
  }
  async function loadNames() {
    if (names !== null) return
    names = new Map()
    const answer = await actions.playlists(false)
    if (answer.kind === "cached" && answer.listing) names = new Map(answer.listing.rows.map(row => [row.id, row.title]))
    render()
  }
  function conceal() { shown = null; lease.hideTooltip(); lease.place(null) }
  function current(): Shown | null {
    const value = shown
    if (!value) return null
    const options = optionsOf(view.read())
    const fresh = value.target.element.isConnected ? supported(items.recognise(value.target.element), options?.shorts ?? false) : null
    if (!fresh || !sameItem(fresh, value.target) || !value.link.isConnected) { conceal(); return null }
    return value
  }
  function label(state: QuickSaveState, playlist: PlaylistId | null): string {
    const list = listName(playlist)
    switch (state) {
      case "busy": return i18n.message("quickSave_busy")
      case "failed": return i18n.message("quickSave_failed")
      case "done":
      case "saved": return list ? i18n.message("quickSave_saved", { list }) : i18n.message("quickSave_more")
      case "idle": return list ? i18n.message("quickSave_idle", { list }) : i18n.message("quickSave_more")
    }
  }
  function moreLabel(): string {
    const key = pickerKey(view.read())
    return key ? i18n.message("quickSave_moreKey", { key: display(key, context.os) }) : i18n.message("quickSave_more")
  }
  function render() {
    const value = current()
    const options = optionsOf(view.read())
    if (!value || !options) return
    const state = states.get(value.target.identity.videoId) ?? "idle"
    main.dataset.state = state
    // No quick-save playlist yet: one "Save to…" button that opens choose mode (YT-QS-04).
    more.hidden = options.playlist === null
    main.setAttribute("aria-label", options.playlist === null ? i18n.message("quickSave_more") : label(state, options.playlist))
    main.setAttribute("aria-disabled", String(state === "busy"))
    main.replaceChildren(state === "busy" ? stateGlyph(document, "spinner") : state === "done" ? stateGlyph(document, "check")
      : state === "failed" ? stateGlyph(document, "error") : svg(document, state === "saved" ? filled : bookmark))
    more.setAttribute("aria-label", moreLabel())
    more.replaceChildren(svg(document, caret))
  }
  function show(target: WwwItemTarget) {
    conceal()
    const link = thumbnailOf(target)
    if (!link) return
    shown = { target, link, title: target.element.querySelector(titles)?.textContent?.trim() || undefined }
    lease.place({ kind: "thumbnail", link, corner: "top-left" })
    void loadNames()
    render()
  }
  function refresh() {
    if (scope.disposed) return
    const options = optionsOf(view.read())
    const target = options ? supported(items.readPointed(), options.shorts) : null
    if (!options || !target) { conceal(); return }
    if (!options.working) {
      conceal()
      if (!noticed) { noticed = true; notices.wouldAct("quick-save") }
      return
    }
    if (shown && sameItem(shown.target, target) && current()) return
    show(target)
  }
  function set(video: VideoId, state: QuickSaveState, at: number) {
    if (at !== revision) return
    states.set(video, state)
    render()
  }
  function settle(video: VideoId, answer: TabAddReport | Unanswered, playlist: PlaylistId | null, at: number) {
    const outcome = answer.kind === "report" && playlist ? answer.outcomes[playlist] : undefined
    if (answer.kind === "choose") { set(video, "idle", at); return }
    if (outcome?.kind === "added") {
      set(video, "done", at)
      scope.timeout(() => { if (states.get(video) === "done") set(video, "saved", at) }, settleMs)
      return
    }
    if (outcome?.kind === "already-in") { set(video, "saved", at); return }
    set(video, "failed", at)
    scope.timeout(() => { if (states.get(video) === "failed") set(video, "idle", at) }, settleMs)
  }
  async function openPicker(target: Shown, choose: boolean) {
    const feedback = feedbackSession()
    const popovers = await context.popovers()
    if (scope.disposed || !feedback) return
    if (!popovers) {
      feedback.toaster.show({ text: i18n.message("picker_loadFailed"), tone: "failure", auto: false, action: null })
      return
    }
    popovers.openPicker({ video: target.target.identity.videoId, ...(target.title ? { title: target.title } : {}),
      anchor: { kind: "below", element: split }, mode: choose ? { kind: "choose", shortcut: null } : { kind: "save" }, opener: "quick-save" })
  }
  async function save() {
    const value = current(), options = optionsOf(view.read())
    const feedback = feedbackSession()
    if (!value || !options?.working || !feedback) return
    const video = value.target.identity.videoId
    if (states.get(video) === "busy") return
    if (view.read()?.signedIn && options.playlist === null) { void openPicker(value, true); return }
    const at = revision
    set(video, "busy", at)
    const answer = await explicitAdd(explicit(feedback), {
      feedback: options.feedback, keyWithoutButton: false, pending: options.playlist ? [options.playlist] : [],
      titles: value.title ? { video: value.title } : {},
      handlers: { choose: () => { void openPicker(value, true) }, retry: () => { void save() } }
    }, () => actions.add({ site: "www", video, via: "quick-save", opener: "quick-save", ...(value.title ? { title: value.title } : {}) }))
    if (!scope.disposed) settle(video, answer, options.playlist, at)
  }
  function pick() {
    const value = current()
    const feedback = feedbackSession()
    if (!value || !feedback) return
    if (!view.read()?.signedIn) {
      const signedOut = explicitContent(explicit(feedback), { kind: "signed-out" }, {}, {})
      if (signedOut) feedback.toaster.show(signedOut)
      return
    }
    void openPicker(value, false)
  }
  function preload() { void context.popovers() }

  let stopNav: Dispose = nothing
  scope.add(page.onState(state => {
    if (scope.disposed) return
    if (state.kind !== "ready") { stopNav(); stopNav = nothing; states.clear(); revision++; conceal(); return }
    if (stopNav === nothing) stopNav = scope.add(page.watch("nav", () => { states.clear(); revision++; render() }))
  }))
  scope.add(() => { stopNav(); conceal() })
  view.subscribe(() => { names = null; render() })
  lease.tooltip(main, () => main.getAttribute("aria-label") ?? "")
  lease.tooltip(more, () => more.getAttribute("aria-label") ?? "")
  scope.on(main, "click", () => { void save() })
  scope.on(more, "click", pick)
  scope.on(split, "pointerenter", preload, { once: true })
  scope.on(document, "pointerover", refresh, { capture: true, passive: true })
  scope.on(document, "focusin", refresh, true)
  scope.on(document, "pointerout", event => { if (event.relatedTarget === null) conceal() }, true)
}

export const quickSave: FeatureDefinition<"www", QuickSaveServices> = { id: "quick-save", start }
