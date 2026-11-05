import type { JobOf, NavData } from "../../../shared/contracts"
import type { AutoAddState, ThisVideo } from "../../../shared/contracts/this-video"
import { watchStateText } from "../../../shared/copy/watch"
import type { I18n } from "../../../shared/i18n"
import { display } from "$kit"
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
/** The active Short's action column and its sound button, which ours sits before (UI-YT-23). PROVISIONAL until a live check. */
export const shortsColumn = "ytd-reel-video-renderer[is-active] reel-action-bar-view-model, ytd-reel-video-renderer[is-active] #actions"
const shortsSound = "pivot-button-view-model, #pivot-button"
/** Bounded re-placement after a navigation, while YouTube draws the action row (YT-WB-02). */
export const retryMs = [0, 250, 1_000, 2_500] as const
const mark = "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm-4 11h-2v-2H9v-2h2V8h2v2h2v2h-2v2z"
// UI-YT-18's state glyphs, drawn in the 24-unit box like the mark.
const check = "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"
const glyphs: Readonly<Partial<Record<AutoAddState["kind"], string>>> = {
  added: check, "already-in": check,
  failed: "M11 7h2v6h-2zm0 8h2v2h-2zM12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z",
  skipped: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM5.7 16.9A8 8 0 0 1 16.9 5.7zM7.1 18.3 18.3 7.1A8 8 0 0 1 7.1 18.3z",
  paused: "M6 5h4v14H6zm8 0h4v14h-4z",
  live: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  "cant-measure": "M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"
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
:host([kind=shorts]) { display: flex; margin: 0 0 16px; }
:host([kind=shorts]) button { flex-direction: column; gap: 4px; width: 48px; height: 78px; padding: 0; border-radius: 0; background: none; font: 400 12px/18px Roboto, Arial, sans-serif; }
:host([kind=shorts]) svg { box-sizing: content-box; padding: 12px; border-radius: 50%; background: rgba(0,0,0,.05); }
:host([kind=shorts][dark]) svg { background: rgba(255,255,255,.1); }
.ring { fill: none; stroke: currentColor; stroke-width: 2; }
.label:empty { display: none; }
:host([fit=icon]) .label { display: none; }
:host([fit=hidden]) { display: none; }
`

function options(view: SiteView<"www"> | null) {
  const feature = view?.features.find(entry => entry.id === "watch-button")
  if (!view || feature?.id !== "watch-button") return null
  const setup = view.setup?.kind === "live" ? view.setup.setup : null
  const shortcuts = view.features.find(entry => entry.id === "shortcuts")
  return {
    working: view.statuses.find(status => status.feature === "watch-button")?.state !== "not-working",
    shorts: feature.options.shorts,
    quickSave: (setup?.quickSave ?? null) as PlaylistId | null,
    pickerKey: shortcuts?.id === "shortcuts" && shortcuts.options.picker ? shortcuts.options.picker as Key : null
  }
}

/** The button's width state in a narrow row (UI-YT-20, UI-YT-21). */
export type Fit = "full" | "icon" | "hidden"
export const unfoldSlack = 16
const iconWidth = 40
/**
 * How the button fits beside YouTube's own buttons: the full pill, icon-only, or hidden where even the icon would push
 * YouTube's Save into "…". `space` is what the row leaves once YouTube's buttons, Save included, have their room. The
 * pill unfolds only with 16 px to spare. Where YouTube folds Save on its own, the icon stays.
 */
export function fit(input: { readonly space: number; readonly full: number; readonly current: Fit; readonly saveFolded: boolean }): Fit {
  if (input.space >= input.full + (input.current === "full" ? 0 : unfoldSlack)) return "full"
  if (input.space >= iconWidth || input.saveFolded) return "icon"
  return "hidden"
}
/** YouTube's Save in the action row and the row's own "…" overflow. PROVISIONAL until a live check. */
const saveButton = "yt-button-view-model button[aria-label*='Save' i], ytd-button-renderer button[aria-label*='Save' i]"

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
  let onShorts = false
  let noticed = false
  let names: ReadonlyMap<string, string> | null = null
  let naming = false
  let watchRow: Dispose = () => {}
  let retries: Dispose[] = []
  let width: Fit = "full"
  let fullWidth = 0
  let nudged = false

  // A capture-phase resize runs before YouTube's own fold logic, so YouTube measures the row with our button already sized (UI-YT-20).
  function relayout() {
    const row = host.parentElement, menu = row?.closest("ytd-menu-renderer")
    if (!row || !menu) return
    if (width === "full" && label.textContent) fullWidth = host.getBoundingClientRect().width || fullWidth
    const others = [...row.children].filter(child => child !== host).reduce((sum, child) => sum + child.getBoundingClientRect().width, 0)
      + [...menu.children].filter(child => child !== row).reduce((sum, child) => sum + child.getBoundingClientRect().width, 0)
    const available = menu.getBoundingClientRect().width
    if (available <= 0) return
    const saveFolded = row.querySelector(saveButton) === null
    const next = !label.textContent ? fit({ space: available - others, full: iconWidth, current: width, saveFolded }) === "hidden" ? "hidden" : "icon"
      : fit({ space: available - others, full: fullWidth || iconWidth, current: width, saveFolded })
    if (next !== width) { width = next; host.setAttribute("fit", next) }
    // On a narrow first load YouTube has already folded Save, so the pill folds and YouTube measures once more.
    if (saveFolded && width !== "full" && !nudged) { nudged = true; document.defaultView?.dispatchEvent(new Event("resize")) }
  }
  const win = document.defaultView
  if (win) scope.on(win, "resize", () => { if (host.isConnected) relayout() }, { capture: true, passive: true })

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
  // The Shorts column's short labels: Save, the share watched beside the pie, Added, Paused, Skipped (UI-YT-23).
  function shortsLabel(view: ThisVideo | null): string {
    switch (view?.state.kind) {
      case "counting": case "partly": return i18n.message("watchShorts_percent", { percent: i18n.number(view.watched ?? 0) })
      case "added": case "already-in": return i18n.message("watchShorts_added")
      case "paused": return i18n.message("watchShorts_paused")
      case "skipped": return i18n.message("watchShorts_skipped")
      default: return i18n.message("watchShorts_save")
    }
  }
  function render() {
    const view = context.thisVideo.read()
    const shown = text(view)
    label.textContent = onShorts ? shortsLabel(view) : shown.label ?? ""
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
    if (host.isConnected && !onShorts) relayout()
  }
  function place(): boolean {
    const current = options(view.read())
    if (!current || !(onWatch || onShorts && current.shorts) || document.fullscreenElement) { host.remove(); return true }
    host.setAttribute("kind", onShorts ? "shorts" : "row")
    const target = document.querySelector(onShorts ? shortsColumn : row)
    if (!target) return false
    if (!current.working) {
      host.remove()
      if (!noticed) { noticed = true; notices.wouldAct("watch-button") }
      return true
    }
    if (host.parentElement !== target) {
      const sound = onShorts ? target.querySelector(shortsSound) : null
      if (sound?.parentElement === target) target.insertBefore(host, sound)
      else target.append(host)
      watchRow()
      // YouTube re-renders the row; one childList observer on it puts the button back (UI-YT-16).
      watchRow = scope.observe(target, { childList: true }, () => { if ((onWatch || onShorts) && !host.isConnected) place() })
    }
    render()
    if (!onShorts) relayout()
    return true
  }
  function navigated(nav: NavData | null) {
    for (const cancel of retries) cancel()
    retries = []
    onWatch = nav?.navigation.kind === "watch"
    onShorts = nav?.navigation.kind === "shorts"
    if (!onWatch && !onShorts) { watchRow(); host.remove(); return }
    nudged = false
    for (const ms of retryMs) retries.push(scope.timeout(() => { if (host.isConnected) return; place() }, ms))
  }
  // The menu's auto-add rows: each playlist's goal or outcome, Don't auto-add, Pause and this channel's chips (UI-YT-22, YT-CF-15).
  // The menu opens while the channel is read, so its chips show the lookup (YT-CF-15).
  async function autoAddRows(shown: ThisVideo) {
    const current = view.read()
    const channel = page.run<JobOf<"channelOf">>({ job: { kind: "channelOf", videoId: shown.video } })
      .then(answer => answer.ok && answer.data.channelId ? { id: answer.data.channelId, title: answer.data.title ?? "", handle: answer.data.handle ?? null } : null)
    await loadNames()
    return { view: shown, channel, names: names ?? new Map<string, string>(), paused: current?.paused === true, filters: current?.filters ?? [] }
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
      status: text(shown).status, share: pieShare(shown), autoAdd, ...onShorts ? { side: "left" as const } : {},
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
  view.subscribe(() => { if (onWatch || onShorts) place() })
  scope.add(context.thisVideo.subscribe(() => { if (host.isConnected) render() }))
  scope.on(document, "fullscreenchange", () => { if (onWatch || onShorts) place() })
  scope.on(button, "pointerenter", () => { void context.popovers() }, { once: true })
  scope.on(button, "click", () => { void open() })
}

export const watchButton: FeatureDefinition<"www", WatchButtonServices> = { id: "watch-button", start }
