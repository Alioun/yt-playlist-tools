import type { AccountKey, Settings, VideoId } from "../../shared/model"
import { pick, videoOf, type GatherAccess, type GatherAutoTab, type GatherChecks, type GatherStart } from "../../shared/rules/gather"
import type { Deadline } from "../../shared/rpc/rpc"
import type { SessionPort } from "../store/session-memory"
import type { GatherNativePort, GatherTab } from "../tabs/ports"
import type { AutomaticServing, Gather, GatherResult } from "./gather"

export const QUIET_MS = 1_000
export const BURST_CAP_MS = 10_000
export const CHECK_EVERY_MS = 60_000
export const STARTUP_MS = 60_000

// A video tab's `tab.hello`: where it loaded and how its page started (ARC-MSG-15).
export type SeenTab = { readonly tabId: number; readonly windowId: number; readonly incognito: boolean; readonly hidden: boolean; readonly fresh: boolean }
export type WakeReason = "hello" | "ui" | "startup"
export type TriggerPorts = {
  // The shared settings, read once per wake. Null when the store can't answer, which runs nothing.
  settings(): Promise<Readonly<Settings["gather"]> | null>
  access(): Promise<GatherAccess>
  readonly native: Pick<GatherNativePort, "queryVideos">
  readonly session: Pick<SessionPort, "read">
  // ARC-ACC-73's serving tab for a gather in `windowId`, never one of `exclude`. Null when no signed-in tab with a gather playlist answers.
  serving(windowId: number, exclude: ReadonlySet<number>): Promise<AutomaticServing | null>
  readonly gather: Pick<Gather, "automatic">
  readonly clock: { now(): number; readonly after: Deadline }
  // The popup row's "Waiting for a signed-in YouTube tab to save from." (YT-GT-28) starts and ends here.
  waiting(waiting: boolean): void
}
export type GatherTriggers = {
  // A video tab's `tab.hello` in a normal window, for triggers 2 and 3. The caller also wakes trigger 1 for every `tab.hello`.
  seen(tab: SeenTab): void
  // Any wake: trigger 1's check at most once a minute, and the windows the minute's pace held back.
  woke(reason: WakeReason): void
  waiting(): boolean
  dispose(): void
}

// One window's burst (YT-GT-27): the background tabs it saw, whether a video tab loaded (trigger 3), and its one quiet timer.
type Burst = { readonly first: number; readonly background: Set<number>; count: boolean; cancel: () => void }
// What a window still owes once its minute's pace allows it.
type Owed = { readonly background: ReadonlySet<number>; readonly count: boolean; readonly unvisited: boolean }

const anyTrigger = (settings: Readonly<Settings["gather"]>) => settings.on && (settings.auto.unvisited || settings.auto.background || settings.auto.count)
const patterns = (access: GatherAccess) => [
  ...access.www ? ["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"] : [],
  ...access.music && access.musicSection ? ["https://music.youtube.com/watch*"] : []
]

/**
 * Automatic gathering's three triggers (YT-GT-22 to 29, ARC-MOD-40). No timer looks for tabs: trigger 1 checks when the
 * background is woken anyway, at most once a minute, and triggers 2 and 3 gather a burst a quiet second after its last
 * video tab, at most 10 s after its first. Each window gathers at most once a minute; a window held back by that pace
 * gathers at the next wake after it. Nothing here runs in a private window or touches a tab it doesn't gather.
 */
export function createGatherTriggers(ports: TriggerPorts): GatherTriggers {
  const bursts = new Map<number, Burst>()
  const owed = new Map<number, Owed>()
  const running = new Set<number>()
  let lastCheck: number | null = null
  let startedAt: number | null = null
  let waiting = false
  let disposed = false

  function setWaiting(next: boolean) {
    if (waiting === next || disposed) return
    waiting = next
    try { ports.waiting(next) } catch {}
  }

  function start(tab: GatherTab, row: { readonly hidden?: boolean; readonly fresh?: boolean; readonly at?: number } | undefined): GatherStart {
    if (row?.hidden === undefined || row.fresh === undefined || row.at === undefined) return { kind: "unobserved" }
    return { kind: "observed", hidden: row.hidden, fresh: row.fresh,
      // How the browser's restored tabs report themselves is PROVISIONAL (G6); the startup minute covers them meanwhile.
      restored: false,
      loadedInStartupMinute: startedAt !== null && row.at - startedAt < STARTUP_MS,
      switchedToSincePageStart: tab.lastAccessed > row.at }
  }

  async function gatherIn(windowId: number, due: Owed, settings: Readonly<Settings["gather"]>, tabs: readonly GatherTab[] | null): Promise<GatherResult | null> {
    if (running.has(windowId)) {
      owed.set(windowId, merge(owed.get(windowId), due))
      return null
    }
    running.add(windowId)
    try {
      const access = await ports.access()
      const listed = tabs ?? await (async () => {
        const queried = await ports.native.queryVideos(windowId, patterns(access))
        return queried.kind === "tabs" ? queried.tabs : null
      })()
      const read = await ports.session.read()
      if (disposed || !listed || read.kind !== "memory") return null
      const memory = read.memory
      const window = listed.filter(tab => tab.windowId === windowId)
      if (window.some(tab => tab.incognito)) return null
      const autoTabs: GatherAutoTab[] = window.flatMap(tab => {
        const video = videoOf(tab.url, access)
        return video ? [{ id: tab.tabId, index: tab.index, video, lastAccessed: tab.lastAccessed, active: tab.active, pinned: tab.pinned,
          audible: tab.audible, incognito: tab.incognito, start: start(tab, memory.tabs.get(tab.tabId)) }] : []
      })
      const now = ports.clock.now()
      const checks: GatherChecks = { unvisited: due.unvisited ? "due" : "not-due", background: due.background, count: due.count ? "due" : "not-due" }
      const lastGatherAt = memory.gather.paced.get(windowId) ?? null
      const choose = (account: AccountKey | null, refused: ReadonlySet<VideoId>) =>
        pick({ windowId, incognito: false, tabs: autoTabs }, settings, now, { account, refused, kept: memory.gather.kept, lastGatherAt, checks })
      // The serving account isn't known until a tab outside the gather answers, so its lasting failures narrow the second pick.
      const first = choose(null, new Set())
      if (!first.selected.length) return null
      if (first.pace.kind === "wait") {
        owed.set(windowId, merge(owed.get(windowId), due))
        return null
      }
      const serving = await ports.serving(windowId, new Set(first.selected))
      if (disposed) return null
      if (!serving) { setWaiting(true); return null }
      const picked = choose(serving.acct, memory.gather.refused.get(serving.acct) ?? new Set()).selected
      if (!picked.length) return null
      const result = await ports.gather.automatic({ windowId, tabIds: picked, serving })
      if (result.kind === "playlist") setWaiting(false)
      return result
    } finally {
      running.delete(windowId)
    }
  }

  function merge(before: Owed | undefined, due: Owed): Owed {
    if (!before) return due
    return { background: new Set([...before.background, ...due.background]), count: before.count || due.count, unvisited: before.unvisited || due.unvisited }
  }

  // Trigger 1 reads every window at once and drops private ones (ARC-ACC-72).
  async function unvisited(settings: Readonly<Settings["gather"]>): Promise<void> {
    const queried = await ports.native.queryVideos(null, patterns(await ports.access()))
    if (disposed || queried.kind !== "tabs") return
    const windows = new Map<number, GatherTab[]>()
    for (const tab of queried.tabs) {
      if (tab.incognito) continue
      windows.set(tab.windowId, [...windows.get(tab.windowId) ?? [], tab])
    }
    for (const [windowId, tabs] of windows) {
      if (disposed) return
      await gatherIn(windowId, { background: new Set(), count: false, unvisited: true }, settings, tabs)
    }
  }

  async function wake(): Promise<void> {
    const settings = await ports.settings()
    if (disposed || !settings) return
    if (!anyTrigger(settings)) { owed.clear(); setWaiting(false); return }
    const now = ports.clock.now()
    if (settings.auto.unvisited && (lastCheck === null || now - lastCheck >= CHECK_EVERY_MS)) {
      lastCheck = now
      await unvisited(settings)
    }
    for (const [windowId, due] of [...owed]) {
      if (disposed) return
      owed.delete(windowId)
      await gatherIn(windowId, due, settings, null)
    }
  }

  async function fire(windowId: number, burst: Burst): Promise<void> {
    if (bursts.get(windowId) === burst) bursts.delete(windowId)
    const settings = await ports.settings()
    if (disposed || !settings || !anyTrigger(settings)) return
    await gatherIn(windowId, { background: burst.background, count: burst.count, unvisited: false }, settings, null)
  }

  function seen(tab: SeenTab): void {
    if (disposed || tab.incognito) return
    const now = ports.clock.now()
    let burst = bursts.get(tab.windowId)
    if (!burst) {
      burst = { first: now, background: new Set(), count: false, cancel: () => {} }
      bursts.set(tab.windowId, burst)
    }
    burst.count = true
    if (tab.hidden && tab.fresh) burst.background.add(tab.tabId)
    burst.cancel()
    const current = burst
    current.cancel = ports.clock.after(Math.max(0, Math.min(QUIET_MS, current.first + BURST_CAP_MS - now)), () => { void fire(tab.windowId, current).catch(() => {}) })
  }

  let waking: Promise<void> | null = null
  function woke(reason: WakeReason): void {
    if (disposed) return
    if (reason === "startup") startedAt = ports.clock.now()
    if (waking) return
    waking = wake().catch(() => {}).finally(() => { waking = null })
  }

  return {
    seen, woke,
    waiting: () => waiting,
    dispose() {
      if (disposed) return
      disposed = true
      for (const burst of bursts.values()) burst.cancel()
      bursts.clear()
      owed.clear()
    }
  }
}
