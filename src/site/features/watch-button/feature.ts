import type { JobOf, NavData } from "../../../shared/contracts"
import type { I18n } from "../../../shared/i18n"
import { display } from "../../../shared/keys/policy"
import type { Key, PlaylistId } from "../../../shared/model"
import type { TabActions } from "../../core/actions"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { PageLink } from "../../core/page-link"
import type { Dispose } from "../../core/scope"
import type { Popovers } from "../../popovers/types"

/** Auto-add's state for the current video, which the auto-add feature supplies (YT-AA-38). Null shows the untracked button. */
export type WatchStatus = { readonly label: string | null; readonly status: string }
export type WatchButtonServices = {
  readonly document: Document
  readonly page: Pick<PageLink, "watch" | "run" | "onState">
  readonly actions: Pick<TabActions, "playlists">
  readonly i18n: I18n
  readonly notices: { wouldAct(feature: "watch-button"): void }
  readonly popovers: () => Promise<Popovers | null>
  readonly status: () => WatchStatus | null
  readonly os: "macos" | "windows" | "linux"
}

export const row = "ytd-watch-metadata ytd-menu-renderer #top-level-buttons-computed"
/** Bounded re-placement after a navigation, while YouTube draws the action row (YT-WB-02). */
export const retryMs = [0, 250, 1_000, 2_500] as const
const mark = "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm-4 11h-2v-2H9v-2h2V8h2v2h2v2h-2v2z"
const skin = `
:host { all: initial; display: inline-flex; margin-left: 8px; }
button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; min-width: 36px;
  padding: 0 6px; border-radius: 18px; cursor: pointer; background: rgba(0,0,0,.05); color: #0f0f0f; font: 500 14px/36px Roboto, Arial, sans-serif; }
:host([dark]) button { background: rgba(255,255,255,.1); color: #f1f1f1; }
button:hover { background: rgba(0,0,0,.1); }
:host([dark]) button:hover { background: rgba(255,255,255,.2); }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
svg { width: 24px; height: 24px; fill: currentColor; }
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
  let watchRow: Dispose = () => {}
  let retries: Dispose[] = []

  function render() {
    const status = context.status()
    label.textContent = status?.label ?? ""
    const tip = status?.status ?? i18n.message("watchState_untracked")
    button.setAttribute("aria-label", tip)
    button.title = tip
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
    popovers.openWatchMenu({ video: video.data.videoId, ...(video.data.title ? { title: video.data.title } : {}), anchor: host,
      status: context.status()?.status ?? i18n.message("watchState_untracked"),
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
  scope.on(document, "fullscreenchange", () => { if (onWatch) place() })
  scope.on(button, "pointerenter", () => { void context.popovers() }, { once: true })
  scope.on(button, "click", () => { void open() })
}

export const watchButton: FeatureDefinition<"www", WatchButtonServices> = { id: "watch-button", start }
