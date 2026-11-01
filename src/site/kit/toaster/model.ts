import type { Dispose, Scope } from "../../core/scope"
import type { NoticeContent, Operation, ToastAction, ToastContent, ToastHandle, ToastView } from "./types"

type Entry = {
  readonly id: number
  generation: number
  kind: "transient" | "pending" | "notice"
  content: ToastContent
  remaining: number
  busy: boolean
  spent: boolean
  dismiss: NoticeContent["dismiss"] | null
  presented: (() => void) | null
}
export type ToasterOptions = {
  readonly scope: Scope
  readonly document: Document
  now(): number
  actionFailed(): ToastContent
  nothingToUndo(): ToastContent
  onError(error: unknown): void
}

export function createToaster(options: ToasterOptions) {
  const { scope, document } = options
  let sequence = 0
  let revision = 0
  let current: Entry | null = null
  let queued: Entry | null = null
  let notice: Entry | null = null
  let operation: object | null = null
  let pendingTimer: Dispose = () => {}
  let delayed: { readonly token: object; readonly due: number; show(): void } | null = null
  let timer: Dispose = () => {}
  let since: number | null = null
  let hidden = document.hidden
  let fullscreen = document.fullscreenElement !== null
  let shortcutEnabled = false
  let rendered: { readonly entry: Entry; readonly content: ToastContent; readonly generation: number } | null = null
  const pauses = new Set<"hover" | "focus">()
  const listeners = new Set<(view: ToastView | null) => void>()
  const consumedUndo = new WeakSet<ToastAction>()
  function available(content: ToastContent): ToastContent {
    return content.action?.kind === "undo" && consumedUndo.has(content.action) ? { ...content, action: null } : content
  }
  function report(error: unknown) { try { options.onError(error) } catch {} }
  const live = () => !scope.disposed
  const eligible = (entry: Entry) => !hidden && (!fullscreen || !entry.content.auto)
  const visible = () => live() && current !== null && eligible(current)
  function stopClock() {
    timer(); timer = () => {}
    if (since !== null && current) current.remaining = Math.max(0, current.remaining - Math.max(0, options.now() - since))
    since = null
  }
  function queue(entry: Entry) {
    if (!queued || entry.content.tone === "failure" || queued.content.tone !== "failure") queued = entry
  }
  function select() {
    if (current && !eligible(current)) {
      if (current.kind !== "notice") queue(current)
      current = null
    }
    if (!current && queued && eligible(queued)) { current = queued; queued = null }
    if (!current && notice && eligible(notice)) current = notice
  }
  function view(): ToastView | null {
    const entry = current
    if (!entry || !visible()) return null
    const version = revision
    return {
      id: entry.id, generation: entry.generation, content: entry.content, kind: entry.kind, busy: entry.busy, remaining: entry.remaining,
      act: () => act(entry, version),
      dismiss: entry.dismiss ? { label: entry.dismiss.label, run: () => {
        if (!live() || current !== entry || revision !== version || !visible()) return
        const dismiss = entry.dismiss
        notice = null; current = null; changed()
        try { dismiss?.run() } catch (error) { report(error) }
      } } : null
    }
  }
  function notify() {
    const next = view()
    for (const listener of [...listeners]) {
      try { listener(next) } catch (error) { report(error) }
    }
  }
  function changed(resetPause = false) {
    stopClock(); revision++
    if (resetPause) pauses.clear()
    select()
    if (visible() && current && current.kind === "transient" && pauses.size === 0 && !current.busy) {
      const entry = current
      const version = revision
      since = options.now()
      timer = scope.timeout(() => {
        if (current !== entry || revision !== version || !visible()) return
        current = null; since = null; changed()
      }, entry.remaining)
    }
    notify()
  }
  function entry(content: ToastContent, kind: Entry["kind"] = "transient", dismiss: Entry["dismiss"] = null): Entry {
    return { id: ++sequence, generation: 0, content: available(content), kind, remaining: 6000, busy: false, spent: false, dismiss, presented: null }
  }
  function install(next: Entry) {
    stopClock()
    if (eligible(next)) current = next
    else {
      if (current && current.kind !== "notice") queue(current)
      current = null; queue(next)
    }
    changed()
  }
  function schedulePending() {
    pendingTimer(); pendingTimer = () => {}
    const next = delayed
    if (!next || hidden || !live() || operation !== next.token) return
    pendingTimer = scope.timeout(() => {
      if (!live() || hidden || delayed !== next || operation !== next.token) return
      delayed = null; next.show()
    }, Math.max(0, next.due - options.now()))
  }
  function contains(next: Entry) { return current === next || queued === next }
  async function act(target: Entry, version: number): Promise<void> {
    const action = target.content.action
    if (!live() || revision !== version || current !== target || !visible() || target.busy || target.spent || !action) return
    if (action.kind === "undo" && consumedUndo.has(action)) return
    if (action.kind === "undo") consumedUndo.add(action)
    target.busy = true; target.spent = true
    changed(false)
    const actionGeneration = target.generation
    try {
      const result = await action.run()
      if (!live() || !contains(target) || target.generation !== actionGeneration) return
      target.busy = false
      if (result) { target.content = available(result); target.spent = false; target.remaining = 6000 }
      else if (target.kind === "notice") target.spent = false
      else target.content = { ...target.content, action: null }
      target.generation++
      changed(false)
    } catch (error) {
      report(error)
      if (!live() || !contains(target) || target.generation !== actionGeneration) return
      target.busy = false
      if (action.kind === "undo") target.content = options.actionFailed()
      else if (target.kind === "notice") target.spent = false
      else target.content = { ...target.content, action: null }
      target.remaining = 6000
      target.generation++
      changed(false)
    }
  }
  const api = {
    show(content: ToastContent): ToastHandle {
      operation = null; delayed = null; pendingTimer(); pendingTimer = () => {}
      const next = entry(content)
      if (live()) install(next)
      return {
        replace(content) {
          if (!live() || !contains(next)) return false
          stopClock(); next.generation++; next.content = available(content); next.remaining = 6000; next.busy = false; next.spent = false
          changed(); return true
        },
        release() {
          if (!live() || !contains(next)) return
          stopClock()
          if (current === next) current = null
          if (queued === next) queued = null
          changed()
        }
      }
    },
    notice(content: NoticeContent): Dispose {
      const next = entry(content, "notice", content.dismiss)
      next.presented = content.presented
      if (live()) { stopClock(); if (current === notice) current = null; notice = next; changed() }
      return () => {
        if (!live() || notice !== next) return
        stopClock(); if (current === next) current = null; notice = null; changed()
      }
    },
    begin(input: { readonly pending: ToastContent | null; readonly keyWithoutButton: boolean }): Operation {
      pendingTimer(); pendingTimer = () => {}
      const token = {}; operation = token
      delayed = null
      if (current?.kind === "pending") { stopClock(); current = null }
      if (queued?.kind === "pending") queued = null
      let shown: Entry | null = null
      if (live() && input.keyWithoutButton && input.pending) {
        const pending = input.pending
        delayed = { token, due: options.now() + 1000, show() { shown = entry(pending, "pending"); install(shown) } }
        schedulePending()
      }
      changed()
      return {
        finish(content) {
          if (!live() || operation !== token) return
          operation = null; delayed = null; pendingTimer(); pendingTimer = () => {}
          if (shown && !contains(shown)) return
          if (shown && content) {
            stopClock(); shown.generation++; shown.kind = "transient"; shown.content = available(content); shown.remaining = 6000
            changed(); return
          }
          if (shown) { stopClock(); if (current === shown) current = null; if (queued === shown) queued = null }
          if (content) install(entry(content)); else changed()
        },
        cancel() {
          if (!live() || operation !== token) return
          operation = null; delayed = null; pendingTimer(); pendingTimer = () => {}
          if (shown) { stopClock(); if (current === shown) current = null; if (queued === shown) queued = null; changed() }
        }
      }
    },
    pause(reason: "hover" | "focus", on: boolean) {
      if (!live()) return
      if (pauses.has(reason) === on) return
      stopClock(); if (on) pauses.add(reason); else pauses.delete(reason)
      changed(false)
    },
    read: view,
    presented(snapshot: Pick<ToastView, "id" | "content" | "generation">) {
      if (!visible() || !current || current.id !== snapshot.id || current.content !== snapshot.content || current.generation !== snapshot.generation) return
      if (rendered?.entry === current && rendered.content === current.content && rendered.generation === current.generation) return
      rendered = { entry: current, content: current.content, generation: current.generation }
      const callback = current.presented; current.presented = null
      if (callback) { try { callback() } catch (error) { report(error) } }
      notify()
    },
    unpresented() { if (rendered) { rendered = null; notify() } },
    hasUndo() { return visible() && current !== null && rendered?.entry === current && rendered.content === current.content && rendered.generation === current.generation && current.content.action?.kind === "undo" && !current.busy && !current.spent },
    async undoCurrent() {
      if (api.hasUndo() && current) await act(current, revision)
      else if (live() && shortcutEnabled && !current?.busy) api.show(options.nothingToUndo())
    },
    setShortcutEnabled(value: boolean) { shortcutEnabled = value },
    subscribe(listener: (view: ToastView | null) => void): Dispose {
      if (!live()) return () => {}
      listeners.add(listener); listener(view())
      return scope.add(() => { listeners.delete(listener) })
    }
  }
  scope.on(document, "visibilitychange", () => {
    stopClock(); hidden = document.hidden; schedulePending(); changed()
  })
  scope.on(document, "fullscreenchange", () => {
    stopClock(); fullscreen = document.fullscreenElement !== null
    if (!fullscreen && queued && eligible(queued)) { current = queued; queued = null }
    changed()
  })
  scope.add(() => {
    stopClock(); pendingTimer(); operation = null; delayed = null; current = queued = notice = null; rendered = null; revision++
    notify(); listeners.clear()
  })
  return api
}
export type Toaster = ReturnType<typeof createToaster>
