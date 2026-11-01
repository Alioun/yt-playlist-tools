import { Scope } from "../../../src/site/core/scope"
import { Keys } from "../../../src/site/core/keys"
import { createFeedback, type FeedbackLabels } from "../../../src/site/kit/feedback"
import { englishI18n } from "../localization/scripted"
import type { TabFeature, TabView } from "../../../src/shared/contracts/tab-view"
import { isPlaylistId } from "../../../src/shared/model"

export const labels: FeedbackLabels = {
  actions: { undo: "Undo", "try-again": "Try again", settings: "Settings", choose: "Choose", "sign-in": "Sign in", reload: "Reload" },
  nothingToUndo: "Nothing to undo."
}
export const undoKey: NonNullable<TabView["undoKey"]> = { code: "KeyU", char: "u", ctrl: false, alt: true, shift: false, meta: false }
export const shortcut: TabFeature<"shortcuts"> = {
  id: "shortcuts", options: { on: true, feedback: true, music: true, preset: true, picker: null, list: [] }
}
export function raw(target: object, name: string, value: unknown) {
  const old = Object.getOwnPropertyDescriptor(target, name)
  Object.defineProperty(target, name, { configurable: true, value })
  return () => { if (old) Object.defineProperty(target, name, old); else Reflect.deleteProperty(target, name) }
}
export function clock() {
  let at = 0, serial = 0
  const pending = new Map<number, { due: number; run(): void }>()
  const restoreSet = raw(window, "setTimeout", (handler: TimerHandler, ms = 0, ...args: unknown[]) => {
    const id = ++serial
    pending.set(id, { due: at + ms, run() { if (typeof handler === "function") Reflect.apply(handler, window, args) } })
    return id
  })
  const restoreClear = raw(window, "clearTimeout", (id: number) => { pending.delete(id) })
  return {
    now: () => at,
    advance(ms: number) {
      const until = at + ms
      for (let n = 0; n < 1000; n++) {
        const next = [...pending].sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]
        if (!next || next[1].due > until) { at = until; return }
        at = next[1].due; pending.delete(next[0]); next[1].run()
      }
      throw new Error("Synthetic clock exceeded bounded delivery count")
    },
    get count() { return pending.size },
    restore() { restoreSet(); restoreClear(); pending.clear() }
  }
}
export function fixture(site: "www" | "music" = "www") {
  const errors: unknown[] = []; const cosmetics: string[] = []
  const restoreHidden = raw(document, "hidden", false)
  const restoreFull = raw(document, "fullscreenElement", null)
  const timers = clock()
  const scope = new Scope({ document, onError: error => { errors.push(error) } })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError: error => { errors.push(error) } })
  scope.add(() => keys.dispose())
  const feedback = createFeedback({ scope, document, keys, site, i18n: englishI18n(), labels,
    initial: { undoKey, features: [] }, now: timers.now, onError: error => { errors.push(error) } })
  return {
    ...feedback, scope, keys, timers, errors, cosmetics,
    present() { const view = feedback.toaster.read(); if (view) feedback.toaster.presented(view) },
    hidden(value: boolean) { Object.defineProperty(document, "hidden", { configurable: true, value }); document.dispatchEvent(new Event("visibilitychange")) },
    fullscreen(value: Element | null) { Object.defineProperty(document, "fullscreenElement", { configurable: true, value }); document.dispatchEvent(new Event("fullscreenchange")) },
    dispose() { scope.dispose(); timers.restore(); restoreHidden(); restoreFull() }
  }
}
export function playlist() { const id = "PLmusic"; if (!isPlaylistId(id)) throw Error("Invalid synthetic playlist"); return id }
export const titles = () => ({ video: "Song", playlists: { [playlist()]: "Music" } })
export function press(init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "u", code: "KeyU", altKey: true, bubbles: true, cancelable: true, composed: true, ...init })
  const modifier = event.getModifierState.bind(event)
  // happy-dom reports AltGraph whenever Alt is held; a browser's Alt+U does not.
  Object.defineProperty(event, "getModifierState", { value: (name: string) => name !== "AltGraph" && modifier(name) })
  document.body.dispatchEvent(event)
  return event
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export async function settle() { for (let n = 0; n < 20; n++) await Promise.resolve() }
