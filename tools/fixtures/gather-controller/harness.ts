import { createGather, type Gather, type GatherEvent, type GatherPorts, type GatherTarget } from "../../../src/background/gather/gather"
import type { GatherNativePort, GatherTab, Requester } from "../../../src/background/tabs/ports"
import { isRouteId } from "../../../src/shared/contracts"
import { isPlaylistId, isVideoId, type Settings, type VideoId } from "../../../src/shared/model"
import type { GatherLanguage } from "../../../src/shared/rules/gather"
import { brand, harness as addFlowHarness } from "../add-flow/harness"
import { a, nativeTab, settle, signedOut, tabsFixture } from "../tabs/harness"

export const later = brand(isPlaylistId, "WL")
export const video = (n: number): VideoId => brand(isVideoId, `gat${String(n).padStart(8, "0")}`)
export const watch = (id: VideoId) => `https://www.youtube.com/watch?v=${id}`
export const normalWindow: Requester = { windowId: 1, incognito: false, activeTabId: 10 }
export const privateWindow: Requester = { windowId: 2, incognito: true, activeTabId: 20 }
export const route = brand(isRouteId, "gather-fixture-route")

export type BrowserCall =
  | { kind: "query"; windowId: number | null; patterns: readonly string[] }
  | { kind: "read"; tabId: number }
  | { kind: "create"; windowId: number; url: string; active: boolean; index?: number }
  | { kind: "create-window"; urls: readonly string[] }
  | { kind: "remove"; tabIds: readonly number[] }
type Row = { -readonly [K in keyof GatherTab]: GatherTab[K] } & { status: "loading" | "complete" }

// The lowest browser boundary: one fake tab strip per window. Everything above it is the real constructor chain.
export function browser(fixture: ReturnType<typeof tabsFixture>) {
  const rows = new Map<number, Row>()
  const windows = new Set([1, 2])
  const calls: BrowserCall[] = []
  let serial = 100
  const behaviour = { listAfter: 1_500 as number | null, loadAfter: 500 as number | null,
    // Partial native removal: these tabs survive the one remove call. `removeRejects` makes the call itself report failure.
    survives: new Set<number>(), removeRejects: false, unreadable: new Set<number>() }
  const reopenTitles: { url: string; title: string }[] = []
  const strip = ({ status: _status, ...tab }: Row): GatherTab => tab
  const inWindow = (windowId: number | null) => [...rows.values()].filter(row => windowId === null || row.windowId === windowId).sort((x, y) => x.windowId - y.windowId || x.index - y.index)
  const matches = (url: string, pattern: string) => url.startsWith(pattern.slice(0, -1))
  const native: GatherNativePort = {
    async queryVideos(windowId, patterns) {
      calls.push({ kind: "query", windowId, patterns })
      return { kind: "tabs", tabs: inWindow(windowId).filter(row => patterns.some(pattern => matches(row.url, pattern))).map(strip) }
    },
    async read(tabId) {
      calls.push({ kind: "read", tabId })
      if (behaviour.unreadable.has(tabId)) return { kind: "unavailable" }
      const row = rows.get(tabId)
      return row ? { kind: "tab", tab: strip(row), status: row.status } : { kind: "gone" }
    },
    async create(props, reopened) {
      calls.push({ kind: "create", ...props })
      if (reopened) reopenTitles.push({ url: props.url, title: reopened.title })
      if (!windows.has(props.windowId)) return { kind: "window-gone" }
      const tabId = ++serial
      const index = props.index ?? inWindow(props.windowId).length
      for (const row of inWindow(props.windowId)) if (row.index >= index) row.index++
      const created: Row = { tabId, windowId: props.windowId, index, url: props.url, title: "", lastAccessed: fixture.clock.now(),
        incognito: props.windowId === 2, active: props.active, pinned: false, audible: false, status: "loading" }
      rows.set(tabId, created)
      fixture.seedTab(nativeTab(tabId, { windowId: props.windowId, incognito: created.incognito, active: props.active }), signedOut())
      const list = props.url.startsWith("https://www.youtube.com/watch_videos?video_ids=")
      if (list && behaviour.listAfter !== null) {
        const first = new URL(props.url).searchParams.get("video_ids")?.split(",")[0] ?? ""
        fixture.clock.after(behaviour.listAfter, () => { created.url = `https://www.youtube.com/watch?v=${first}&list=TLGGfixture`; created.status = "complete" })
      }
      if (!list && behaviour.loadAfter !== null) fixture.clock.after(behaviour.loadAfter, () => { created.status = "complete" })
      return { kind: "created", tabId }
    },
    async createWindow(urls) {
      calls.push({ kind: "create-window", urls })
      const windowId = Math.max(...windows) + 1
      windows.add(windowId)
      const tabIds = urls.map((url, index) => {
        const tabId = ++serial
        rows.set(tabId, { tabId, windowId, index, url, title: "", lastAccessed: 0, incognito: false, active: false, pinned: false, audible: false, status: "loading" })
        return tabId
      })
      return { kind: "created", tabIds }
    },
    async remove(tabIds) {
      calls.push({ kind: "remove", tabIds: [...tabIds] })
      for (const tabId of tabIds) if (!behaviour.survives.has(tabId)) { rows.delete(tabId); fixture.tabs.delete(tabId) }
      return behaviour.removeRejects ? { kind: "unavailable" } : { kind: "removed" }
    }
  }
  return {
    native, calls, rows, windows, behaviour, reopenTitles,
    removeCalls: () => calls.flatMap(call => call.kind === "remove" ? [call.tabIds] : []),
    open(tabId: number, url: string, title: string, patch: Partial<Row> = {}) {
      const windowId = patch.windowId ?? 1
      rows.set(tabId, { tabId, windowId, index: patch.index ?? inWindow(windowId).length, url, title, lastAccessed: patch.lastAccessed ?? tabId,
        incognito: windowId === 2, active: false, pinned: false, audible: false, status: "complete", ...patch })
    },
    navigate(tabId: number, url: string) { const row = rows.get(tabId); if (row) row.url = url },
    closeWindow(windowId: number) { windows.delete(windowId); for (const row of inWindow(windowId)) rows.delete(row.tabId) },
    removed: () => calls.flatMap(call => call.kind === "remove" ? call.tabIds : []),
    created: () => calls.flatMap(call => call.kind === "create" || call.kind === "create-window" ? [call] : [])
  }
}

export type Options = {
  settings?: Partial<Settings["gather"]>
  target?: GatherTarget
  health?: Partial<Record<Settings["gather"]["to"], "working" | "not-working">>
  languages?: Record<string, GatherLanguage>
}

// Canonical owner → Tabs → AddFlow → Gather, sharing one session owner and one clock. Only the browser and YouTube's jobs are fakes.
export function gatherFixture(options: Options = {}) {
  const tabs = tabsFixture()
  const yt = addFlowHarness({ session: tabs.session, clock: 1_700_000_000_000 })
  yt.tab(1, a)
  const window = browser(tabs)
  const events: GatherEvent[] = []
  const settings: Settings["gather"] = { on: true, feedback: true, to: "player", order: "left-to-right", close: true,
    auto: { unvisited: false, after: "1d", background: false, count: false, n: 10 }, ...options.settings }
  let random = 0
  const ports = (flow = yt.flow, engine = tabs.engine): GatherPorts => ({
    native: window.native, addFlow: flow, tabs: engine, session: tabs.session,
    settings: () => settings,
    access: () => ({ www: true, music: true, musicSection: false }),
    target: async () => options.target ?? { kind: "playlist", acct: a, playlist: later, title: "Watch later" },
    health: to => options.health?.[to] ?? "working",
    language: async title => options.languages?.[title] ?? "no-answer",
    random: () => (random = (random + 0.37) % 1),
    clock: { now: () => tabs.clock.now(), after: (ms, run) => tabs.clock.after(ms, run) },
    observe: event => { events.push(event) }
  })
  const gather: Gather = createGather(ports())
  return {
    tabs, yt, window, events, settings, gather, ports,
    restart(): Gather { return createGather(ports(yt.engine(tabs.session, "restarted"), tabs.restart())) },
    // Drives the shared clock until the work settles, at most 30 s of fake time.
    async drive<T>(work: Promise<T>): Promise<T> {
      let done = false
      void work.then(() => { done = true }, () => { done = true })
      const turn = async () => { await settle(); await new Promise<void>(resolve => setTimeout(resolve, 0)); await settle() }
      for (let step = 0; step < 60 && !done; step++) {
        await turn()
        if (!done) tabs.clock.advance(500)
      }
      await turn()
      return work
    },
    ok: <T>(data: T) => ({ ok: true as const, data, route })
  }
}
