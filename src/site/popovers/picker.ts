import { createIsolatedElement } from "@webext-core/isolated-element"
import type { FeatureId } from "../../shared/contracts"
import type { TabView } from "../../shared/contracts/tab-view"
import type { Titles } from "../../shared/copy"
import type { PlaylistId } from "../../shared/model"
import { PickerModel, type Picked, type UntickOutcome } from "../../shared/picker/model.svelte"
import type { ToastPlan } from "../../shared/rules/outcomes"
import type { AnySiteCore, SiteCore } from "../core/core"
import type { Kit } from "../kit/install"
import { placePicker, type PlacementAnchor } from "./placement"
import { pagePickerSource } from "./source"
import { createWatchMenu } from "./watch-menu"
import type { OpenPicker, PickerRenderer, PickerViewEvent, Popovers } from "./types"

const panelWidth = 320
const nothing = { tab: [], session: [] }

/** The feature's Show feedback that governs a picker's toasts (YT-PK-09's list). */
export function feedbackFor(view: TabView, opener: FeatureId): boolean {
  if (opener === "browser-menu" || opener === "any-tab-keys") return true
  const feature = view.features.find(entry => entry.id === opener)
  return feature !== undefined && "feedback" in feature.options ? feature.options.feedback !== false : true
}

function anchorBox(request: OpenPicker): PlacementAnchor {
  if (request.anchor.kind === "window" || !request.anchor.element.isConnected) return { kind: "window" }
  const rect = request.anchor.element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return { kind: "window" }
  return { kind: request.anchor.kind, box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
}

/**
 * `popovers.js`'s picker (06 §6.4.2's Popovers): `PickerPanel` over the page source, in its own isolated host,
 * closed by Esc, a click outside or ✕. Shortcut keys stay off while it's open, and the host keeps every key
 * away from YouTube's hotkeys (YT-PK-10).
 */
export function createPopovers(options: {
  readonly core: () => AnySiteCore | undefined
  readonly kit: () => Kit | undefined
  readonly document: Document
  readonly os: "macos" | "windows" | "linux"
  readonly renderer: PickerRenderer
}): Popovers {
  const { document } = options
  let open: { close(): void } | null = null

  function openPicker(request: OpenPicker): void {
    const core = options.core(), kit = options.kit()
    const view = core?.link.view
    if (!core || !kit || !view || view.site !== core.site || !view.signedIn) return
    open?.close()
    const account = view.acct
    const source = pagePickerSource({
      actions: core.actions, page: core.page, view, request, now: () => Date.now(),
      live: () => { const current = core.link.view; return !core.disposed && current?.signedIn === true && current.acct === account }
    })
    // No check marks on YouTube Music until ticket 25's M2 check (G35, R191).
    const marks = view.site === "www"
    const picker = request.mode.kind === "save"
      ? new PickerModel({ source, site: view.site, mode: "save", marks })
      : new PickerModel({ source, site: view.site, mode: "choose", marks })
    const purpose = request.mode.kind === "save" ? "save" : request.mode.shortcut ? "shortcut" : "quickSave"
    const feedback = feedbackFor(view, request.opener)
    const shortcutId = request.mode.kind === "choose" ? request.mode.shortcut : null
    const shortcut = shortcutId === null ? undefined
      : view.features.flatMap(feature => feature.id === "shortcuts" ? feature.options.list : []).find(entry => entry.id === shortcutId)?.label
    const titles = (id: PlaylistId): Titles => ({
      ...(request.title ? { video: request.title } : {}), ...(shortcut ? { shortcut } : {}),
      playlists: { [id]: picker.rows.find(row => row.id === id)?.title ?? undefined }
    })
    let closed = false
    let release = () => {}
    let stopOutside = () => {}

    function close() {
      if (closed) return
      closed = true
      if (open === handle) open = null
      stopOutside()
      picker.close()
      release()
    }
    const handle = { close }
    open = handle

    function confirm(plan: ToastPlan, id: PlaylistId, undo: (() => Promise<{ kind: "undone" | "failed" }>) | null) {
      const session = kit!.feedback.use(core!.root)
      if (!session) return
      const action = undo && plan.action?.kind === "undo" ? session.action("undo", async () => {
        const answer = await undo()
        return answer.kind === "undone" ? null : session.format({ tone: "failure", auto: false, message: { kind: "undo-failed" }, action: null, remember: nothing }, {}, null)
      }) : null
      session.toaster.show(session.format(plan, titles(id), action))
    }
    function picked(outcome: Picked) {
      const choice = outcome.choice
      if ("skipped" in choice && choice.skipped === "private") {
        const session = kit!.feedback.use(core!.root)
        session?.toaster.show({ text: options.renderer.pickedPrivate(core!.i18n), tone: "confirmation", auto: false, action: null })
        close()
        return
      }
      if ("refused" in choice) return
      if (feedback) {
        const message = shortcutId
          ? { kind: "shortcut-set" as const, playlist: outcome.id }
          : { kind: "first-pick" as const, playlists: [outcome.id] }
        confirm({ tone: "confirmation", auto: false, message, action: outcome.undo ? { kind: "undo" } : null, remember: nothing }, outcome.id, outcome.undo)
      }
      close()
    }
    function onoutcome(event: PickerViewEvent) {
      if (event.kind === "tick" && event.outcome.kind === "picked") picked(event.outcome as Picked)
      else if (event.kind === "untick" && event.outcome.kind === "removed" && event.id !== undefined && feedback) {
        const { undo } = event.outcome as UntickOutcome & { readonly kind: "removed" }
        confirm({ tone: "confirmation", auto: false, message: { kind: "removed", playlist: event.id }, action: { kind: "undo" }, remember: nothing }, event.id, undo)
      }
    }

    void createIsolatedElement({ name: "pp-picker", mode: "open", isolateEvents: true }).then(({ parentElement: host, isolatedElement, shadow }) => {
      if (closed) return
      host.style.cssText = "all: initial; position: fixed; z-index: 2310; left: 0; top: 0; visibility: hidden;"
      // YouTube Music is always dark (UI-YM-03); YouTube marks its dark theme on <html>.
      const dark = core.site === "music" || document.documentElement.hasAttribute("dark")
      host.toggleAttribute("dark", dark)
      const style = document.createElement("style"); style.textContent = options.renderer.css; shadow.prepend(style)
      const frame = document.createElement("div")
      frame.className = dark ? "dark" : ""
      frame.style.cssText = `width: ${panelWidth}px; display: flex; flex-direction: column;`
      isolatedElement.append(frame)
      const full = document.fullscreenElement
      ;(full && !full.contains(document.body) ? full : document.body).append(host)
      for (const type of ["click", "pointerdown", "pointerup", "mousedown", "mouseup", "contextmenu", "keydown", "keyup", "keypress"]) {
        host.addEventListener(type, event => event.stopPropagation())
      }
      host.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); close() } })
      const unmount = options.renderer.mount(frame, { picker, purpose, i18n: core.i18n, os: options.os, onoutcome, onrequestclose: close })
      const view = document.defaultView
      const place = () => {
        const rect = frame.getBoundingClientRect()
        const at = placePicker(anchorBox(request), { width: panelWidth, height: rect.height || 400 },
          { width: view?.innerWidth ?? 1280, height: view?.innerHeight ?? 800 })
        host.style.left = `${at.left}px`; host.style.top = `${at.top}px`
        frame.style.maxHeight = `${at.maxHeight}px`
        host.style.visibility = "visible"
      }
      place()
      const outside = (event: Event) => { if (!event.composedPath().includes(host)) close() }
      document.addEventListener("pointerdown", outside, true)
      stopOutside = () => document.removeEventListener("pointerdown", outside, true)
      release = () => { unmount(); host.remove() }
      if (closed) release()
    }, () => close())
  }

  const menu = createWatchMenu({ document, core: () => { const core = options.core(); return core?.site === "www" ? core as SiteCore<"www"> : undefined },
    kit: options.kit, picker: openPicker })
  return {
    openPicker,
    openWatchMenu: request => { open?.close(); menu.open(request) },
    isOpen: () => open !== null || menu.isOpen(),
    close: () => { open?.close(); menu.close() }
  }
}
