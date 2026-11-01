import type { AddFlow } from "../add-flow/add-flow"
import type { TabView } from "../../shared/contracts/tab-view"
import type { ConfirmedViewChange, createLocalFilterWriter } from "../store/local-filter-writer"
import type { Monitor } from "../monitor/monitor"
import type { Tabs, TabViewProducer, ViewTarget } from "../tabs/ports"
import { matchesViewTarget, type KnownTab } from "../tabs/tabs"

export const VIEW_PUBLICATION_MS = 250
export type PublicationPorts = {
  readonly owner: Pick<ReturnType<typeof createLocalFilterWriter>, "subscribeView">
  readonly tabs: Pick<Tabs, "known" | "publish" | "subscribeLifetime">
  readonly monitor: Pick<Monitor, "subscribeView">
  readonly privateSkips: Pick<AddFlow, "subscribePrivateSkips">
  readonly producer: TabViewProducer<TabView>
  readonly clock: { now(): number; after(milliseconds: number, run: () => void): () => void }
}
export type ViewPublication = { readonly ready: Promise<void>; dispose(): void }

export function viewChangeTarget(event: ConfirmedViewChange): ViewTarget {
  switch (event.kind) {
    case "settings-changed": case "pause-changed": return { kind: "all" }
    case "setup-changed": case "filter-changed": case "account-removed": return { kind: "account", acct: event.acct, scope: "all" }
    case "skips-changed": return { kind: "account", acct: event.acct, scope: event.scope }
  }
}

export function createViewPublication(ports: PublicationPorts): ViewPublication {
  type Pending = {
    tab: KnownTab; version: number; dirtyAt: number | undefined; lastSend: number | undefined
    running: boolean; cancel: (() => void) | undefined
  }
  const pending = new Map<number, Pending>(), subscriptions: (() => void)[] = []
  const lifetime = new AbortController()
  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    lifetime.abort()
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe()
    for (const row of pending.values()) row.cancel?.()
    pending.clear()
  }
  function subscribe(unsubscribe: () => void) {
    if (disposed) unsubscribe()
    else subscriptions.push(unsubscribe)
  }
  function arm(row: Pending) {
    if (disposed || row.running || row.cancel || row.dirtyAt === undefined) return
    const due = Math.max(row.dirtyAt + VIEW_PUBLICATION_MS, row.lastSend === undefined ? 0 : row.lastSend + VIEW_PUBLICATION_MS)
    if (due <= ports.clock.now()) { void deliver(row); return }
    row.cancel = ports.clock.after(Math.max(0, due - ports.clock.now()), () => {
      row.cancel = undefined
      if (!disposed) void deliver(row)
    })
  }
  function mark(row: Pending, at = ports.clock.now()) {
    row.version++
    row.dirtyAt ??= at
    arm(row)
  }
  async function deliver(row: Pending) {
    if (disposed || row.running || row.dirtyAt === undefined) return
    row.running = true
    row.dirtyAt = undefined
    const version = row.version, tab = row.tab
    try {
      await ports.tabs.publish(tab, ports.producer, lifetime.signal, () => {
        if (disposed || row.version !== version || row.tab !== tab) return false
        row.lastSend = ports.clock.now()
        return true
      })
    } catch { /* A failed attempt is not a receipt or a reason to poll. */ }
    finally {
      row.running = false
      arm(row)
    }
  }
  function request(target: ViewTarget) {
    if (disposed) return
    const at = ports.clock.now(), marked = new Set<Pending>()
    for (const row of pending.values()) if (matchesViewTarget(row.tab, target)) { mark(row); marked.add(row) }
    void ports.tabs.known(target, lifetime.signal).then(tabs => {
      if (disposed) return
      for (const tab of tabs) {
        let row = pending.get(tab.tabId)
        if (!row) {
          row = { tab, version: 0, dirtyAt: undefined, lastSend: undefined, running: false, cancel: undefined }
          pending.set(tab.tabId, row)
        } else if (row.tab !== tab) {
          row.tab = tab
          row.version++
        }
        if (!marked.has(row)) mark(row, at)
      }
    }, () => {})
  }
  // The read joins the owner's lane before a caller can enqueue a removal.
  const ready = ports.tabs.known({ kind: "all" }, lifetime.signal).then(() => {}, () => {})
  subscribe(ports.owner.subscribeView(event => request(viewChangeTarget(event)), dispose))
  subscribe(ports.monitor.subscribeView(event => request(event), dispose))
  subscribe(ports.privateSkips.subscribePrivateSkips(event => request({ kind: "account", acct: event.acct, scope: event.scope }), dispose))
  subscribe(ports.tabs.subscribeLifetime(dispose))
  return { ready, dispose }
}
