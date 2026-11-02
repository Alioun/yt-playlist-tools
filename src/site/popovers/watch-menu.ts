import type { PlaylistId, VideoId } from "../../shared/model"
import type { ThisVideo } from "../../shared/contracts/this-video"
import type { TabFilter } from "../../shared/contracts/tab-view"
import type { SiteCore } from "../core/core"
import { explicitContent } from "../explicit"
import type { Kit } from "../kit/install"
import { placePicker } from "./placement"
import type { OpenPicker } from "./types"
import { channelControls, type ChannelControl } from "../../shared/rules/channel-filter"

export type WatchMenuRequest = {
  readonly video: VideoId
  readonly title?: string
  readonly anchor: Element
  /** Auto-add's status line for this video, else the untracked line (YT-WB-07). */
  readonly status: string
  /** How far toward its next goal the pie beside the status line is, while counting (UI-YT-19). */
  readonly share: number | null
  /** Auto-add's rows, while it has playlists that take this video (UI-YT-22). */
  readonly autoAdd: {
    readonly view: ThisVideo
    readonly names: ReadonlyMap<string, string>
    readonly paused: boolean
    readonly filters: readonly TabFilter[]
  } | null
  readonly quickSave: { readonly playlist: PlaylistId; readonly name: string | null } | null
  /** The picker key's label while Playlist shortcuts has one (YT-KEY-34). */
  readonly pickerKey: string | null
  /** The Shorts column's menu opens to the left of the button (UI-YT-23). */
  readonly side?: "left"
}

const width = 280
const skin = `
:host { all: initial; }
.menu { box-sizing: border-box; width: ${width}px; padding: 8px 0; border-radius: 12px; background: var(--pp-menu, #fff); color: var(--pp-text, #0f0f0f);
  box-shadow: 0 4px 32px rgba(0,0,0,.1); font: 400 14px/20px Roboto, Arial, sans-serif; }
:host([dark]) .menu { --pp-menu: #282828; --pp-text: #f1f1f1; box-shadow: 0 4px 32px rgba(0,0,0,.5); }
.status { display: flex; align-items: center; gap: 8px; padding: 8px 16px; opacity: .7; }
.status svg { flex: none; width: 20px; height: 20px; fill: currentColor; }
.status .ring { fill: none; stroke: currentColor; stroke-width: 2; }
.goal { display: flex; justify-content: space-between; gap: 12px; padding: 4px 16px; }
.goal span:last-child { opacity: .7; }
.heading { padding: 8px 16px 4px; font-weight: 500; }
.chips { display: flex; align-items: center; gap: 6px; padding: 4px 16px; }
.chips span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chips button { width: auto; min-height: 28px; padding: 0 10px; border-radius: 14px; background: rgba(127,127,127,.15); }
.chips button[aria-pressed=true] { color: var(--pp-menu, #fff); background: var(--pp-text, #0f0f0f); }
.chips button[aria-disabled=true] { opacity: .4; cursor: default; }
.ask { padding: 4px 16px; font-size: 13px; }
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
    const status = document.createElement("div"); status.className = "status"
    if (request.share !== null) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true")
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle"); ring.setAttribute("class", "ring")
      ring.setAttribute("cx", "12"); ring.setAttribute("cy", "12"); ring.setAttribute("r", "9")
      const share = request.share, angle = share * 2 * Math.PI
      const pie = document.createElementNS("http://www.w3.org/2000/svg", "path")
      pie.setAttribute("d", share >= 1 ? "M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0" : share <= 0 ? "" : `M12 12V5A7 7 0 ${share > .5 ? 1 : 0} 1 ${(12 + 7 * Math.sin(angle)).toFixed(2)} ${(12 - 7 * Math.cos(angle)).toFixed(2)}Z`)
      svg.append(ring, pie); status.append(svg)
    }
    status.append(request.status)
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
    // Auto-add's rows answer in place, as this tab's account (UI-YT-22, YT-CF-15).
    const auto = request.autoAdd
    if (auto) {
      const name = (id: string) => auto.names.get(id) ?? (id === "WL" ? i18n.message("picker_watchLater") : i18n.message("copy_missingPlaylist"))
      const outcomes = { added: "thisVideo_outcome_added", "already-in": "thisVideo_outcome_alreadyIn", filtered: "thisVideo_outcome_filtered",
        failed: "thisVideo_outcome_failed", skipped: "thisVideo_outcome_skipped" } as const
      for (const goal of auto.view.playlists) {
        const line = document.createElement("div"); line.className = "goal"
        const title = document.createElement("span"); title.textContent = name(goal.pl)
        const result = document.createElement("span")
        result.textContent = goal.outcome === "waiting" ? i18n.message("thisVideo_outcome_waiting", { percent: i18n.number(goal.pct) }) : i18n.message(outcomes[goal.outcome])
        line.append(title, result); menu.append(line)
      }
      const toggle = (labels: readonly [string, string], start: boolean, act: (next: boolean) => Promise<boolean>) => {
        let on = start
        const button = row(labels[on ? 1 : 0], async () => {
          if (button.getAttribute("aria-busy") === "true") return
          button.setAttribute("aria-busy", "true")
          const done = await act(!on)
          button.removeAttribute("aria-busy")
          if (done) on = !on
          button.textContent = done ? labels[on ? 1 : 0] : i18n.message("thisVideo_skipFailed")
        })
      }
      toggle([i18n.message("thisVideo_dontAutoAdd"), i18n.message("thisVideo_autoAddAgain")], auto.view.state.kind === "skipped", next => core.actions.skip(request.video, next))
      toggle([i18n.message("watchMenu_pause"), i18n.message("watchMenu_resume")], auto.paused, next => core.actions.pause(next))
      const channel = auto.view.channel
      const heading = document.createElement("div"); heading.className = "heading"
      heading.textContent = channel ? i18n.message("thisVideo_channelFilters", { channel: channel.title || channel.handle || channel.id }) : i18n.message("channelFilter_unknown")
      menu.append(heading)
      if (channel) for (const goal of auto.view.playlists) {
        const line = document.createElement("div"); line.className = "chips"
        const title = document.createElement("span"); title.textContent = name(goal.pl)
        line.append(title)
        const stored = auto.filters.find(entry => entry.playlist === goal.pl)?.state
        let filter = stored?.filter
        const gen = stored?.kind === "value" ? stored.gen ?? null : null
        const draw = () => {
          line.replaceChildren(title)
          for (const control of channelControls(filter, channel.id)) line.append(chip(control))
        }
        const chip = (control: ChannelControl) => {
          const button = document.createElement("button"); button.type = "button"; button.setAttribute("role", "menuitemcheckbox")
          button.setAttribute("aria-pressed", String(control.state === "listed"))
          button.textContent = i18n.message(control.state === "listed" ? control.mode === "allow" ? "channelFilter_allowed" : "channelFilter_denied"
            : control.mode === "allow" ? "channelFilter_allowOnly" : "channelFilter_deny")
          if (control.state === "greyed") {
            button.setAttribute("aria-disabled", "true")
            button.title = i18n.message(control.mode === "allow" ? "channelFilter_usesDeny" : "channelFilter_usesAllow", { playlist: name(goal.pl) })
            return button
          }
          button.addEventListener("click", async () => {
            if (control.state === "confirm" && !line.nextElementSibling?.classList.contains("ask")) {
              const ask = document.createElement("div"); ask.className = "ask"
              ask.textContent = i18n.message(control.mode === "allow" ? i18n.plural(control.kept) === "one" ? "channelFilter_turnOnAllow_one" : "channelFilter_turnOnAllow_other"
                : i18n.plural(control.kept) === "one" ? "channelFilter_turnOnDeny_one" : "channelFilter_turnOnDeny_other", { playlist: name(goal.pl), count: i18n.number(control.kept) })
              line.after(ask)
              button.textContent = i18n.message("filter_switchMode")
              return
            }
            if (line.nextElementSibling?.classList.contains("ask")) line.nextElementSibling.remove()
            button.setAttribute("aria-busy", "true")
            const send = control.send
            const done = await core.actions.filterChannel({ playlist: goal.pl, channel: channel.handle ? [channel.id, channel.title, channel.handle] : [channel.id, channel.title],
              action: send.action, mode: send.mode, clearListed: send.clearListed, expectedGeneration: send.clearListed ? gen : null })
            if (!done) { button.removeAttribute("aria-busy"); button.textContent = i18n.message("filter_failed"); return }
            const current = filter ?? { mode: "deny" as const, on: false, channels: [] }
            const others = send.action === "unlist" ? current.channels.filter(([id]) => id !== channel.id) : [...send.clearListed ? [] : current.channels, [channel.id, channel.title] as const]
            filter = { mode: send.mode ?? current.mode, on: true, channels: others }
            draw()
          })
          return button
        }
        draw()
        menu.append(line)
      }
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
    row(i18n.message("watchMenu_settings"), () => { close(); core.actions.settings({ feature: "watch-button" }) })

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
    const box = request.side === "left" ? { left: rect.left - width - 8, top: rect.top, width, height: rect.height } : { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    const at = placePicker({ kind: request.side === "left" ? "on" : "below", box },
      { width, height: menu.getBoundingClientRect().height || 160 }, { width: view?.innerWidth ?? 1280, height: view?.innerHeight ?? 800 })
    host.style.left = `${at.left}px`; host.style.top = `${at.top}px`
    document.addEventListener("pointerdown", outside, true)
    document.addEventListener("keydown", escape, true)
  }
  return { open: openMenu, isOpen: () => open !== null, close: () => open?.close() }
}
