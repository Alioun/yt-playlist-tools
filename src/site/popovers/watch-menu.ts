import type { PlaylistId, VideoId } from "../../shared/model"
import type { SiteCore } from "../core/core"
import { explicitContent } from "../explicit"
import type { Kit } from "../kit/install"
import { placePicker } from "./placement"
import type { OpenPicker } from "./types"

export type WatchMenuRequest = {
  readonly video: VideoId
  readonly title?: string
  readonly anchor: Element
  /** Auto-add's status line for this video, else the untracked line (YT-WB-07). */
  readonly status: string
  readonly quickSave: { readonly playlist: PlaylistId; readonly name: string | null } | null
  /** The picker key's label while Playlist shortcuts has one (YT-KEY-34). */
  readonly pickerKey: string | null
}

const width = 280
const skin = `
:host { all: initial; }
.menu { box-sizing: border-box; width: ${width}px; padding: 8px 0; border-radius: 12px; background: var(--pp-menu, #fff); color: var(--pp-text, #0f0f0f);
  box-shadow: 0 4px 32px rgba(0,0,0,.1); font: 400 14px/20px Roboto, Arial, sans-serif; }
:host([dark]) .menu { --pp-menu: #282828; --pp-text: #f1f1f1; box-shadow: 0 4px 32px rgba(0,0,0,.5); }
.status { padding: 8px 16px; opacity: .7; }
button { all: unset; box-sizing: border-box; display: flex; align-items: center; width: 100%; min-height: 40px; padding: 0 16px; cursor: pointer; }
button:hover, button:focus-visible { background: rgba(127,127,127,.15); }
button[aria-busy=true] { cursor: default; opacity: .7; }
`

/**
 * The watch-page button's menu (YT-WB-07 to YT-WB-10): the status line, then the Save rows, which answer in place.
 * A failed save also answers with the add flow's failure toast; a confirmed one raises none. Auto-add's own rows
 * join once its state model exists.
 */
export function createWatchMenu(options: {
  readonly document: Document
  readonly core: () => SiteCore<"www"> | undefined
  readonly kit: () => Kit | undefined
  readonly picker: (request: OpenPicker) => void
}) {
  const { document } = options
  let open: { close(): void } | null = null

  function openMenu(request: WatchMenuRequest): void {
    const core = options.core(), kit = options.kit()
    if (!core || !kit) return
    open?.close()
    const { i18n } = core
    const host = document.createElement("pp-watch-menu")
    const shadow = host.attachShadow({ mode: "open" })
    const style = document.createElement("style"); style.textContent = skin
    const menu = document.createElement("div"); menu.className = "menu"; menu.setAttribute("role", "menu")
    shadow.append(style, menu)
    host.style.cssText = "all: initial; position: fixed; z-index: 2305; left: 0; top: 0;"
    host.toggleAttribute("dark", document.documentElement.hasAttribute("dark"))
    for (const type of ["click", "pointerdown", "pointerup", "mousedown", "mouseup", "keydown", "keyup"]) host.addEventListener(type, event => event.stopPropagation())
    const status = document.createElement("div"); status.className = "status"; status.textContent = request.status
    menu.append(status)
    const row = (label: string, run: (button: HTMLButtonElement) => void) => {
      const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "menuitem"); button.textContent = label
      button.addEventListener("click", () => run(button))
      menu.append(button)
      return button
    }
    const picker = (choose: boolean) => {
      close()
      options.picker({ video: request.video, ...(request.title ? { title: request.title } : {}), anchor: { kind: "on", element: request.anchor },
        mode: choose ? { kind: "choose", shortcut: null } : { kind: "save" }, opener: "watch-button" })
    }
    const quick = request.quickSave
    const listed = quick?.name ?? (quick?.playlist === "WL" ? i18n.message("picker_watchLater") : null)
    if (!quick) row(i18n.message("watchMenu_choose"), () => picker(true))
    else row(listed ? i18n.message("quickSave_idle", { list: listed }) : i18n.message("quickSave_more"), async button => {
      if (button.getAttribute("aria-busy") === "true") return
      button.setAttribute("aria-busy", "true"); button.textContent = i18n.message("quickSave_busy")
      const answer = await core.actions.add({ site: "www", video: request.video, via: "quick-save", opener: "watch-button", ...(request.title ? { title: request.title } : {}) })
      button.removeAttribute("aria-busy")
      if (answer.kind === "choose") { picker(true); return }
      const outcome = answer.kind === "report" ? answer.outcomes[quick.playlist] : undefined
      const saved = outcome?.kind === "added" || outcome?.kind === "already-in"
      button.textContent = saved ? listed ? i18n.message("quickSave_saved", { list: listed }) : i18n.message("quickSave_saved", { list: i18n.message("copy_missingPlaylist") })
        : i18n.message("quickSave_failed")
      const session = kit.feedback.use(core.root)
      if (saved || !session) return
      const failure = explicitContent({ session, actions: core.actions, i18n, location: window.location }, answer, request.title ? { video: request.title } : {}, { choose: () => picker(true) })
      if (failure && failure.tone === "failure") session.toaster.show(failure)
    })
    row(request.pickerKey ? i18n.message("quickSave_moreKey", { key: request.pickerKey }) : i18n.message("quickSave_more"), () => picker(false))

    function close() {
      if (open !== handle) return
      open = null
      document.removeEventListener("pointerdown", outside, true)
      document.removeEventListener("keydown", escape, true)
      host.remove()
    }
    const outside = (event: Event) => { if (!event.composedPath().includes(host) && !event.composedPath().includes(request.anchor)) close() }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close() } }
    const handle = { close }
    open = handle
    document.body.append(host)
    const rect = request.anchor.getBoundingClientRect(), view = document.defaultView
    const at = placePicker({ kind: "below", box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } },
      { width, height: menu.getBoundingClientRect().height || 160 }, { width: view?.innerWidth ?? 1280, height: view?.innerHeight ?? 800 })
    host.style.left = `${at.left}px`; host.style.top = `${at.top}px`
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("keydown", escape, true)
  }
  return { open: openMenu, isOpen: () => open !== null, close: () => open?.close() }
}
