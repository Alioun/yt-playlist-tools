import { createIsolatedElement } from "@webext-core/isolated-element"
import type { Site } from "../../../shared/contracts"
import { Scope, type Dispose } from "../scope"
import { toastSkin } from "./skin"

export type LayerOptions = {
  readonly owner: Scope
  readonly document: Document
  readonly site: Site
  onError(error: unknown): void
  onCosmetic(variable: string): void
}

export async function createNoticeLayer(options: LayerOptions) {
  const { document, owner, site } = options
  if (owner.disposed || document.hidden) return null
  const { parentElement: host, shadow, isolatedElement } = await createIsolatedElement({
    name: "pp-toast-layer", mode: "open", isolateEvents: true
  })
  if (owner.disposed || document.hidden) { host.remove(); return null }
  const scope = new Scope({ document, onError: options.onError })
  const release = owner.add(() => scope.dispose())
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2300; pointer-events: none;"
  host.dataset.site = site
  const style = document.createElement("style"); style.textContent = toastSkin; shadow.prepend(style)
  const root = document.createElement("div"); isolatedElement.append(root)
  scope.add(() => host.remove())
  for (const type of ["click", "dblclick", "pointerdown", "pointerup", "mousedown", "mouseup", "contextmenu", "keydown", "keyup"]) {
    scope.on<EventTarget, string>(host, type, event => event.stopPropagation())
  }
  let active = false
  let observer: Dispose = () => {}
  let frame: Dispose = () => {}
  let measuring = false
  let followups: Dispose[] = []
  const reported = new Set<string>()
  function stop() {
    observer(); observer = () => {}; frame(); frame = () => {}; measuring = false
    for (const cancel of followups) cancel()
    followups = []
  }
  function place() {
    if (scope.disposed || document.hidden) return
    const full = document.fullscreenElement
    const parent = full && !full.contains(document.body) ? full : document.body
    if (host.parentElement !== parent) parent.append(host)
    host.toggleAttribute("dark", document.documentElement.hasAttribute("dark"))
    host.style.setProperty("--toast-left", site === "music" ? "12px" : full ? "24px" : "16px")
    let bottom = site === "music" ? 12 : full ? 88 : 16
    const win = document.defaultView
    if (win && site === "www" && active) {
      const style = win.getComputedStyle(document.documentElement)
      for (const variable of ["--yt-sys-color-baseline-inverse-surface", "--yt-sys-color-baseline-inverse-on-surface"]) {
        if (!style.getPropertyValue(variable).trim() && !reported.has(variable)) { reported.add(variable); options.onCosmetic(variable) }
      }
    }
    if (site === "music" && win && active) {
      for (const selector of ["ytmusic-player-bar", "ytmusic-miniplayer", "ytmusic-mealbar-promo-renderer", "tp-yt-paper-toast"]) {
        const element = document.querySelector(selector)
        if (!element) continue
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < win.innerHeight) bottom = Math.max(bottom, win.innerHeight - rect.top + 12)
      }
    }
    host.style.setProperty("--toast-bottom", `${bottom}px`)
  }
  function schedule() {
    const win = document.defaultView
    if (!active || document.hidden || scope.disposed || measuring || !win) return
    measuring = true
    const id = win.requestAnimationFrame(() => { frame(); frame = () => {}; measuring = false; place() })
    frame = scope.add(() => { win.cancelAnimationFrame(id); measuring = false })
  }
  function resume() {
    stop()
    if (!active || document.hidden || scope.disposed) return
    place()
    observer = scope.observe(document.documentElement, { attributes: true, attributeFilter: ["dark"] }, schedule)
    if (site === "music") followups = [400, 1200].map(ms => scope.timeout(place, ms))
  }
  function shown() {
    if (!active || document.hidden || scope.disposed) return
    for (const cancel of followups) cancel()
    followups = site === "music" ? [400, 1200].map(ms => scope.timeout(place, ms)) : []
    schedule()
  }
  scope.on(document, "visibilitychange", resume)
  scope.on(document, "fullscreenchange", () => { if (!document.hidden) { place(); schedule() } })
  const win = document.defaultView
  if (win) { scope.on(win, "resize", schedule, { passive: true }); scope.on(win, "scroll", schedule, { passive: true }) }
  scope.on<EventTarget, string>(document, "yt-navigate-finish", schedule)
  scope.on<EventTarget, string>(document, "ytmusic-navigate-finish", schedule)
  scope.add(stop)
  place()
  return { host, shadow, root, scope, setActive(value: boolean) { if (active === value) return; active = value; resume() }, remeasure: shown, dispose: release }
}
export type NoticeLayer = NonNullable<Awaited<ReturnType<typeof createNoticeLayer>>>
