import type { JobOf, NavData } from "../../../shared/contracts"
import type { AutoAddState, ThisVideo } from "../../../shared/contracts/this-video"
import { watchStateText } from "../../../shared/copy/watch"
import type { I18n } from "../../../shared/i18n"
import { display } from "../../../shared/keys/policy"
import type { Key, PlaylistId } from "../../../shared/model"
import type { TabActions } from "../../core/actions"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { PageLink } from "../../core/page-link"
import type { Dispose } from "../../core/scope"
import type { Popovers } from "../../popovers/types"
import type { ThisVideoChannel } from "../../core/this-video"

export type WatchButtonServices = {
  readonly document: Document
  readonly page: Pick<PageLink, "watch" | "run" | "onState">
  readonly actions: Pick<TabActions, "playlists">
  readonly i18n: I18n
  readonly notices: { wouldAct(feature: "watch-button"): void }
  readonly popovers: () => Promise<Popovers | null>
  /** Auto-add's view of the playing video (YT-AA-38). With none, the button is the untracked icon. */
  readonly thisVideo: Pick<ThisVideoChannel, "read" | "subscribe">
  readonly os: "macos" | "windows" | "linux"
}

export const row = "ytd-watch-metadata ytd-menu-renderer #top-level-buttons-computed"
/** Bounded re-placement after a navigation, while YouTube draws the action row (YT-WB-02). */
export const retryMs = [0, 250, 1_000, 2_500] as const
const mark = "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm-4 11h-2v-2H9v-2h2V8h2v2h2v2h-2v2z"
// Material Symbols paths for UI-YT-18's state glyphs.
const glyphs: Readonly<Partial<Record<AutoAddState["kind"], string>>> = {
  added: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  "already-in": "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  failed: "M11 15h2v2h-2zm0-8h2v6h-2zm1-5C6.47 2 2 6.5 2 12a10 10 0 1 0 10-10zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z",
  skipped: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z",
  paused: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  live: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm-8 4a8 8 0 0 1 2.34-5.66L4.93 4.93A10 10 0 0 0 2 12c0 2.76 1.12 5.26 2.93 7.07l1.41-1.41A7.97 7.97 0 0 1 4 12zm16 0a7.97 7.97 0 0 1-2.34 5.66l1.41 1.41A10 10 0 0 0 22 12c0-2.76-1.12-5.26-2.93-7.07l-1.41 1.41A7.97 7.97 0 0 1 20 12z",
  "cant-measure": "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"
}
/** How far toward its next goal the counting pie is (UI-YT-19): a pie inside a full outline, never a partial ring. */
export function pieShare(view: ThisVideo | null): number | null {
  const state = view?.state
  if (state?.kind !== "counting" && state?.kind !== "partly") return null
  const goal = state.goal
  return goal > 0 ? Math.min(1, Math.max(0, (view?.watched ?? 0) / goal)) : 0
}
function piePath(share: number): string {
  if (share >= 1) return "M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0"
  const angle = share * 2 * Math.PI, x = 12 + 7 * Math.sin(angle), y = 12 - 7 * Math.cos(angle)
  return share <= 0 ? "" : `M12 12V5A7 7 0 ${share > .5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`
}
const skin = `
:host { all: initial; display: inline-flex; margin-left: 8px; }
button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; min-width: 36px;
  padding: 0 6px; border-radius: 18px; cursor: pointer; background: rgba(0,0,0,.05); color: #0f0f0f; font: 500 14px/36px Roboto, Arial, sans-serif; }
:host([dark]) button { background: rgba(255,255,255,.1); color: #f1f1f1; }
button:hover { background: rgba(0,0,0,.1); }
:host([dark]) button:hover { background: rgba(255,255,255,.2); }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
svg { width: 24px; height: 24px; fill: currentColor; }
.ring { fill: none; stroke: currentColor; stroke-width: 2; }
.label:empty { display: none; }
`

function options(view: SiteView<"www"> | null) {
  const feature = view?.features.find(entry => entry.id === "watch-button")
  if (!view || feature?.id !== "watch-button") return null
  const setup = view.setup?.kind === "live" ? view.setup.setup : null
  const shortcuts = view.features.find(entry => entry.id === "shortcuts")
  return {
    working: view.statuses.find(status => status.feature === "watch-button")?.state !== "not-working",
    quickSave: (setup?.quickSave ?? null) as PlaylistId | null,
    pickerKey: shortcuts?.id === "shortcuts" && shortcuts.options.picker ? shortcuts.options.picker as Key : null
  }
}

/**
 * The watch-page button (YT-WB): after Share and before Save in the watch page's action row, placed again after
 * each navigation and whenever YouTube drops it, and never drawn in the miniplayer or fullscreen. Its menu lives
 * in popovers.js.
 */
function start(context: FeatureContext<"www", WatchButtonServices>): void {
  const { scope, view, document, page, i18n, notices } = context
  const host = document.createElement("pp-watch-button")
  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style"); style.textContent = skin
  const button = document.createElement("button"); button.type = "button"
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true")
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", mark); svg.append(path)
  const label = document.createElement("span"); label.className = "label"
  button.append(svg, label)
  shadow.append(style, button)
  for (const type of ["click", "pointerdown", "pointerup", "mousedown", "mouseup", "keydown"]) scope.on<EventTarget, string>(host, type, event => event.stopPropagation())
  scope.add(() => host.remove())
  let onWatch = false
  let noticed = false
  let names: ReadonlyMap<string, string> | null = null
  let naming = false
  let watchRow: Dispose = () => {}
  let retries: Dispose[] = []

  // Playlist names come from the cached list, read once the state names any (UI-YT-18).
  async function loadNames() {
    if (names !== null || naming) return
    naming = true
    const listing = await context.actions.playlists(false)
    names = new Map(listing.kind === "cached" || listing.kind === "listed" ? (listing.listing?.rows ?? []).map(row => [row.id, row.title]) : [])
    if (!scope.disposed) render()
  }
  function text(view: ThisVideo | null) {
    if (!view) return { label: null, status: i18n.message("watchState_untracked") }
    const named = view.state.kind === "partly" || view.state.kind === "added" || view.state.kind === "already-in" || view.state.kind === "failed"
    if (named && names === null) void loadNames()
    return watchStateText(view.state, { name: id => names?.get(id) ?? (id === "WL" ? i18n.message("picker_watchLater") : i18n.message("copy_missingPlaylist")), title: view.title }, i18n)
  }
  function render() {
    const view = context.thisVideo.read()
    const shown = text(view)
    label.textContent = shown.label ?? ""
    button.setAttribute("aria-label", shown.status)
    button.title = shown.status
    const share = pieShare(view)
    svg.replaceChildren()
    if (share !== null) {
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle"); ring.setAttribute("class", "ring")
      ring.setAttribute("cx", "12"); ring.setAttribute("cy", "12"); ring.setAttribute("r", "9")
      const pie = document.createElementNS("http://www.w3.org/2000/svg", "path"); pie.setAttribute("d", piePath(share)); pie.setAttribute("data-pie", String(Math.round(share * 100)))
      svg.append(ring, pie)
    } else {
      path.setAttribute("d", view ? glyphs[view.state.kind] ?? mark : mark)
      svg.append(path)
    }
    host.toggleAttribute("dark", document.documentElement.hasAttribute("dark"))
  }
  function place(): boolean {
    const current = options(view.read())
    if (!current || !onWatch || document.fullscreenElement) { host.remove(); return true }
    const target = document.querySelector(row)
    if (!target) return false
    if (!current.working) {
      host.remove()
      if (!noticed) { noticed = true; notices.wouldAct("watch-button") }
      return true
    }
    if (host.parentElement !== target) {
      target.append(host)
      watchRow()
      // YouTube re-renders the row; one childList observer on it puts the button back (UI-YT-16).
      watchRow = scope.observe(target, { childList: true }, () => { if (onWatch && !host.isConnected) place() })
    }
    render()
    return true
  }
  function navigated(nav: NavData | null) {
    for (const cancel of retries) cancel()
    retries = []
    onWatch = nav?.navigation.kind === "watch"
    if (!onWatch) { watchRow(); host.remove(); return }
    for (const ms of retryMs) retries.push(scope.timeout(() => { if (host.isConnected) return; place() }, ms))
  }
  // The menu's auto-add rows: each playlist's goal or outcome, Don't auto-add, Pause and this channel's chips (UI-YT-22, YT-CF-15).
  async function autoAddRows(shown: ThisVideo) {
    const current = view.read()
    const answer = await page.run<JobOf<"channelOf">>({ job: { kind: "channelOf", videoId: shown.video } })
    const found = answer.ok && answer.data.channelId !== null ? answer.data : null
    await loadNames()
    return { view: { ...shown, channel: found?.channelId ? { id: found.channelId, title: found.title ?? "", handle: found.handle ?? null } : null },
      names: names ?? new Map<string, string>(), paused: current?.paused === true, filters: current?.filters ?? [] }
  }
  async function open() {
    const current = options(view.read())
    if (!current?.working) return
    const popovers = await context.popovers()
    const video = await page.run<JobOf<"videoInfo">>({ job: { kind: "videoInfo" } })
    if (scope.disposed || !popovers || !video.ok) return
    let name: string | null = null
    if (current.quickSave) {
      const listing = await context.actions.playlists(false)
      name = listing.kind === "cached" ? listing.listing?.rows.find(row => row.id === current.quickSave)?.title ?? null : null
    }
    const shown = context.thisVideo.read()
    const autoAdd = shown && shown.video === video.data.videoId && shown.playlists.length ? await autoAddRows(shown) : null
    if (scope.disposed) return
    popovers.openWatchMenu({ video: video.data.videoId, ...(video.data.title ? { title: video.data.title } : {}), anchor: host,
      status: text(shown).status, share: pieShare(shown), autoAdd,
      quickSave: current.quickSave ? { playlist: current.quickSave, name } : null,
      pickerKey: current.pickerKey ? display(current.pickerKey, context.os) : null })
  }

  let stopNav: Dispose = () => {}
  scope.add(page.onState(state => {
    stopNav(); stopNav = () => {}
    if (scope.disposed || state.kind !== "ready") { navigated(null); return }
    stopNav = scope.add(page.watch("nav", navigated))
  }))
  scope.add(() => { stopNav(); watchRow(); for (const cancel of retries) cancel() })
  view.subscribe(() => { if (onWatch) place() })
  scope.add(context.thisVideo.subscribe(() => { if (host.isConnected) render() }))
  scope.on(document, "fullscreenchange", () => { if (onWatch) place() })
  scope.on(button, "pointerenter", () => { void context.popovers() }, { once: true })
  scope.on(button, "click", () => { void open() })
}

export const watchButton: FeatureDefinition<"www", WatchButtonServices> = { id: "watch-button", start }
