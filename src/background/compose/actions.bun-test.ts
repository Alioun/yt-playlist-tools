import { afterEach, expect, test } from "bun:test"
import { composeActions, createAddFlowOwner } from "./actions"
import { composeMonitor } from "./monitor"
import { createMusicMembershipHealth } from "./services"
import { parseSessionMemory } from "../store/session-memory"
import { defaultSettings } from "../../shared/model/defaults"
import { createPlayingSave, createPlayingUndo, createPopupItem } from "./playing-now"
import { createPageReceiver, type PageReceiverPorts } from "../router/ui-pages"
import { runtimeTransport } from "../adapters/runtime"
import { createAutoAddTabRouter } from "../router/tab-auto-add"
import { createTabViewProducer } from "../tab-view/producer"
import { createTabActions } from "../../site/core/actions"
import type { SiteView } from "../../site/core/feature-host"
import { Scope } from "../../site/core/scope"
import { autoAdd } from "../../site/features/auto-add"
import type { Feedback } from "../../site/kit/feedback"
import type { ToastContent } from "../../site/kit/toaster/types"
import type { NavData, PlayerData } from "../../shared/contracts/streams"
import type { ToastPlan } from "../../shared/rules/outcomes"
import type { Playlists } from "../playlists/playlists"
import type { RoutingNeed, Tabs, TabJobOutcome, ViewTarget } from "../tabs/ports"
import type { KnownTab } from "../tabs/tabs"
import type { NativeSender } from "../adapters/sender-origin"
import type { Job, JobInvocation, JobResult, MembershipRow, RouteId, SetVideoId } from "../../shared/contracts"
import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import { projectionSeed, projectionWorld, document as doc, a, b, alpha, beta, video } from "../../../tools/fixtures/tab-projection/harness"
import { build } from "../../../tools/fixtures/page-link/support"
import { syntheticHealth, tabContext } from "../../../tools/fixtures/tab-view/harness"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"

type Listener = (message: unknown, sender: NativeSender, respond: (answer?: unknown) => void) => boolean
const route = "fixture-route" as RouteId
const disposers: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
})

function seed(settings: Record<string, unknown> = {}) {
  const initial = projectionSeed()
  initial.local["doc:settings"] = doc({
    shortcuts: {
      on: true,
      feedback: true,
      list: [
        { id: "orig01", label: "Alpha shortcut", key: null, watchLaterOnEveryAccount: false },
        { id: "later1", label: "Later", key: null, watchLaterOnEveryAccount: true }
      ]
    },
    quickSave: { on: true, feedback: true, shortsShelves: false },
    ...settings
  })
  return initial
}

function youtube() {
  const lists = new Map<PlaylistId, Set<VideoId>>([
    [alpha, new Set()],
    [beta, new Set()],
    ["WL" as PlaylistId, new Set()]
  ])
  const jobs: string[] = []
  let entry = 0
  function answer<J extends Job>(invocation: JobInvocation<J>): JobResult<J> {
    const job = invocation.job as Job
    jobs.push(job.kind)
    switch (job.kind) {
      case "membership":
        return { ok: true, route, data: [...lists].map(([id, videos]) => ({ id, title: id, contains: videos.has(job.videoId) })) } as unknown as JobResult<J>
      case "add":
      case "save":
        lists.get(job.playlistId)?.add(job.videoId)
        return { ok: true, route, data: { setVideoId: `entry-${++entry}` as SetVideoId } } as unknown as JobResult<J>
      case "remove":
      case "unsave":
        return { ok: true, route, data: null } as unknown as JobResult<J>
      default:
        return { ok: false, reason: "unavailable" } as unknown as JobResult<J>
    }
  }
  return { lists, jobs, answer }
}

type Seed = ReturnType<typeof seed>
function world(
  options: {
    settings?: Record<string, unknown>
    tabAccount?: AccountKey | null
    pageAccount?: AccountKey | null
    prepare?: (initial: Seed) => void
    /** `rows`: YouTube Music's own answer, or how its read failed. `fallback`: the YouTube tab's answer, absent when no YouTube tab is open. */
    /** `youtube`: the account of a YouTube tab the registry holds, which the lookup tries and gets no answer from. */
    music?: { rows: MembershipRow[] | "unavailable" | "unconfirmed" | "timeout"; fallback?: MembershipRow[] | "failed"; incognito?: boolean; youtube?: AccountKey }
    /** Where the Music picker's health records go, beside the list the world keeps. */
    health?: ReturnType<typeof createMusicMembershipHealth>
  } = {}
) {
  const initial = seed(options.settings)
  options.prepare?.(initial)
  const store = projectionWorld(initial)
  const site = youtube()
  const listeners = new Set<Listener>()
  const ensured: unknown[] = [],
    ticks: string[] = [],
    opened: unknown[] = [],
    logs: string[] = []
  const known = { tabId: 9, acct: options.tabAccount === undefined ? a : options.tabAccount, privateTab: options.music?.incognito ?? false } as unknown as KnownTab
  const fallbackNeeds: RoutingNeed[] = []
  const membershipHealth: string[] = []
  const tabs = {
    async known(target: ViewTarget) {
      const youtube = options.music?.youtube
      const held = youtube ? [known, { tabId: 10, acct: youtube, privateTab: known.privateTab } as unknown as KnownTab] : [known]
      return target.kind === "account" ? held.filter(row => row.acct === target.acct) : [known]
    },
    async runIn<J extends Job>(tabId: number, invocation: JobInvocation<J>): Promise<TabJobOutcome<J>> {
      if (options.music && invocation.job.kind === "membership") {
        const { rows } = options.music
        if (rows === "timeout") return { kind: "transport", tabId, failure: "timeout", delivery: "unknown" }
        return { kind: "result", tabId, result: typeof rows === "string" ? { ok: false, reason: rows } : { ok: true, route, data: rows } } as never
      }
      return { kind: "result", tabId, result: site.answer(invocation) }
    },
    async serve(_invocation: unknown, need: RoutingNeed) {
      fallbackNeeds.push(need)
      const fallback = options.music?.fallback
      if (options.music?.youtube) return { kind: "no-tab", attempted: [10] }
      if (fallback === "failed") return { kind: "result", tabId: 10, result: { ok: false, reason: "unavailable" } }
      if (fallback) return { kind: "result", tabId: 10, result: { ok: true, route, data: fallback } }
      return { kind: "no-tab", attempted: [] }
    },
    async accountInView() {
      return { kind: "none" }
    }
  } as unknown as Tabs
  const playlists = {
    async list() {
      return { kind: "open", cached: null, freshness: "absent", refresh: Promise.resolve({ kind: "listed", listing: { rows: [{ id: alpha, title: "Alpha" }], at: 5 } }) }
    }
  } as unknown as Playlists
  const native = {
    runtime: {
      id: "perchling",
      getURL: (path: string) => `chrome-extension://perchling${path}`,
      async sendMessage() {},
      onMessage: {
        addListener: (listener: Listener) => {
          listeners.add(listener)
        },
        removeListener: (listener: Listener) => {
          listeners.delete(listener)
        }
      }
    },
    windows: {
      async get(id: number) {
        return { id, incognito: known.privateTab }
      }
    }
  }
  const actions = composeActions({
    native: native as never,
    build,
    owner: store.owner,
    tabs,
    playlists,
    async musicMembershipHealth(tab, acct, record) {
      membershipHealth.push(record.checks)
      await options.health?.(tab, acct, record)
    },
    writable: () => true,
    registrar: {
      async ensure(tabId, what) {
        ensured.push({ tabId, what })
      }
    },
    requester: async () => null,
    log: line => {
      logs.push(line)
    },
    ticked: tabId => {
      ticks.push(`tick ${tabId}`)
    },
    openSettings: (hash, tabId) => {
      opened.push({ hash, tabId })
    }
  })
  const sender = {
    id: "perchling",
    frameId: 0,
    url: `https://${options.music ? "music" : "www"}.youtube.com/watch?v=aaaaaaaaaaa`,
    tab: { id: 9, windowId: 3, incognito: known.privateTab }
  } as NativeSender
  const transport = {
    send: (message: unknown) =>
      new Promise<unknown>(resolve => {
        let claimed = false
        for (const listener of [...listeners]) claimed = listener(message, sender, resolve) || claimed
        if (!claimed) resolve(undefined)
      })
  }
  const deadline = (ms: number, expire: () => void) => {
    const t = setTimeout(expire, ms)
    return () => clearTimeout(t)
  }
  const progress = createAutoAddTabRouter({
    transport: runtimeTransport(native.runtime as never),
    senders: native as never,
    build,
    deadline,
    tabs,
    owner: store.owner,
    untick: tabId => {
      ticks.push(`untick ${tabId}`)
    },
    now: () => Date.now()
  })
  const page = createTabActions({ transport, build, deadline, account: () => (options.pageAccount !== undefined ? options.pageAccount : known.acct) })
  const health = syntheticHealth()
  const producer = createTabViewProducer({ owner: store.owner, addFlow: actions.flow, statuses: health.statuses, notices: health.notices, build })
  async function view(): Promise<SiteView<"www">> {
    const produced = await producer.produce(tabContext())
    if (produced.kind !== "view" || produced.view.site !== "www") throw Error("Expected the store's www tab view")
    return produced.view
  }
  disposers.push(
    () => page.dispose(),
    () => progress.dispose(),
    () => producer.dispose(),
    () => actions.dispose(),
    () => store.owner.dispose()
  )
  function recentAdds(): readonly unknown[] {
    const rows = store.removal.state().session.recentAdds
    return Array.isArray(rows) ? rows : []
  }
  return { store, site, page, actions, tabs, ensured, ticks, view, recentAdds, opened, logs, fallbackNeeds, membershipHealth }
}

const musicRows = [
  { id: beta, title: "B in Music", contains: null },
  { id: alpha, title: "A in Music", contains: null }
]
const youtubeRows = [
  { id: alpha, title: "A", contains: true },
  { id: beta, title: "B", contains: false },
  { id: "WL" as PlaylistId, title: "Watch later", contains: false }
]
const popupTab = { tabId: 9, incognito: false, site: "music" } as const
const popupReq = { windowId: 3, activeTabId: 9, incognito: false }

test("the Music picker gets Music's own rows without asking YouTube, then YouTube's check marks for the same account and window kind", async () => {
  const w = world({ music: { rows: musicRows, fallback: youtubeRows, incognito: true } })
  expect(await w.page.membership(video)).toEqual({ kind: "read", rows: musicRows })
  expect(w.fallbackNeeds).toEqual([])
  expect(w.membershipHealth).toEqual([])
  expect(await w.page.membership(video, { need: [beta, alpha] })).toEqual({ kind: "read", rows: youtubeRows.slice(0, 2) })
  expect(w.fallbackNeeds).toEqual([{ site: "www", req: { windowId: 3, activeTabId: 9, incognito: true }, account: { kind: "account", acct: a, signedIn: true } }])
  expect(w.membershipHealth).toEqual(["complete"])
})

test("a Music answer that carries every check mark is complete by itself", async () => {
  const rows = [{ id: alpha, title: "A in Music", contains: true }]
  const w = world({ music: { rows } })
  expect(await w.page.membership(video)).toEqual({ kind: "read", rows })
  expect(w.fallbackNeeds).toEqual([])
  expect(w.membershipHealth).toEqual(["complete"])
})

test("with no YouTube tab open the Music picker hears that, and the health record names the limit", async () => {
  const w = world({ music: { rows: musicRows } })
  expect(await w.page.membership(video, { need: [beta, alpha] })).toEqual({ kind: "noYouTubeTab" })
  expect(w.membershipHealth).toEqual(["noYouTubeTab"])
})

test("a YouTube tab of the account that was asked and didn't answer is a failed lookup, not a missing tab (YM-PICK-6)", async () => {
  const w = world({ music: { rows: musicRows, youtube: a } })
  expect(await w.page.membership(video, { need: [beta, alpha] })).toEqual({ kind: "unreadable" })
  expect(w.membershipHealth).toEqual(["incomplete"])
})

test("a YouTube tab that was tried and belongs to another account still counts as no YouTube tab", async () => {
  const w = world({ music: { rows: musicRows, youtube: b } })
  expect(await w.page.membership(video, { need: [beta, alpha] })).toEqual({ kind: "noYouTubeTab" })
  expect(w.membershipHealth).toEqual(["noYouTubeTab"])
})

test("the Music popup reads the same two parts, as the account its row named", async () => {
  const w = world({ music: { rows: musicRows } })
  expect(await w.actions.membershipFromPopup(popupTab, b, video, popupReq)).toEqual({ kind: "account-changed" })
  expect(await w.actions.membershipFromPopup(popupTab, b, video, popupReq, { need: null })).toEqual({ kind: "account-changed" })
  expect(w.fallbackNeeds).toEqual([])
  expect(await w.actions.membershipFromPopup(popupTab, a, video, popupReq)).toEqual({ kind: "read", rows: musicRows })
  expect(await w.actions.membershipFromPopup(popupTab, a, video, popupReq, { need: [beta, alpha] })).toEqual({ kind: "no-youtube-tab" })
  expect(w.membershipHealth).toEqual(["noYouTubeTab"])
})

test.each(["unavailable", "unconfirmed", "timeout"] as const)("a Music read that ends as %s still gets its list from a same-account YouTube tab", async rows => {
  const w = world({ music: { rows, fallback: youtubeRows } })
  expect(await w.page.membership(video)).toEqual({ kind: "unreadable" })
  expect(await w.page.membership(video, { need: null })).toEqual({ kind: "read", rows: youtubeRows.slice(0, 2) })
  expect(w.fallbackNeeds).toHaveLength(1)
  expect(w.membershipHealth).toEqual(["complete"])
})

test("a YouTube lookup that fails, or that misses a row Music listed, leaves the check marks incomplete", async () => {
  const failed = world({ music: { rows: musicRows, fallback: "failed" } })
  expect(await failed.page.membership(video, { need: [beta, alpha] })).toEqual({ kind: "unreadable" })
  expect(failed.membershipHealth).toEqual(["incomplete"])
  const short = world({ music: { rows: musicRows, fallback: youtubeRows.slice(0, 1) } })
  expect(await short.page.membership(video, { need: [beta, alpha] })).toEqual({ kind: "read", rows: youtubeRows.slice(0, 1) })
  expect(short.membershipHealth).toEqual(["incomplete"])
})

test("an older YouTube lookup that fails after a newer one answered leaves the newer check marks' health alone (YM-PICK-6)", async () => {
  const memory = parseSessionMemory({})
  if (!memory) throw Error("no empty session")
  let now = 1000
  const wallClock = Date.now
  Date.now = () => now
  const monitor = composeMonitor({
    owner: { readSession: async () => ({ kind: "memory", memory, revision: { reset: 0, accounts: new Map() }, sequence: 0 }), changeSession: async () => ({ kind: "unavailable", reason: "stale" }), subscribeView: () => () => {} },
    clock: { now: () => now, after: () => () => {} },
    sites: { www: { vocabulary: { routes: [], watchIds: [], schemaKeys: [] }, routes: {} }, music: { vocabulary: { routes: [route], watchIds: [], schemaKeys: [] }, routes: { membership: [route] } } }
  })
  disposers.push(() => { Date.now = wallClock }, () => monitor.dispose())
  const musicTab = { tabId: 9, windowId: 3, incognito: false, site: "music", lastAccessed: 0, active: true, discarded: false, frozen: false } as const
  const w = world({ music: { rows: musicRows }, health: createMusicMembershipHealth({ tab: async () => ({ kind: "tab", tab: musicTab }), monitor, build, route }) })
  const lookups: ((outcome: unknown) => void)[] = []
  w.tabs.serve = (() => new Promise(resolve => lookups.push(resolve))) as never
  const asked = async (count: number) => { while (lookups.length < count) await new Promise(resolve => setTimeout(resolve)) }
  // Opening the picker asks YouTube, and Refresh asks again before the first lookup answers.
  const opened = w.page.membership(video, { need: [beta, alpha] })
  await asked(1)
  const refreshed = w.page.membership(video, { need: [beta, alpha] })
  await asked(2)
  now = 2000
  lookups[1]?.({ kind: "result", tabId: 10, result: { ok: true, route, data: youtubeRows } })
  expect(await refreshed).toEqual({ kind: "read", rows: youtubeRows.slice(0, 2) })
  now = 3000
  lookups[0]?.({ kind: "result", tabId: 10, result: { ok: false, reason: "unavailable" } })
  expect(await opened).toEqual({ kind: "unreadable" })
  const status = await monitor.statusProducer.read({ tab: musicTab, info: { site: "music", build, signedIn: true, acct: a } }, [{ id: "music-actions", options: { ...defaultSettings().musicActions, on: true } }] as never)
  expect(status.kind === "statuses" && status.statuses.map(row => row.state)).toEqual(["working"])
})

test("an older failed lookup whose health record is still on its way can't land after a newer read's in the same millisecond (YM-PICK-6)", async () => {
  const memory = parseSessionMemory({})
  if (!memory) throw Error("no empty session")
  const wallClock = Date.now
  Date.now = () => 1000
  const monitor = composeMonitor({
    owner: { readSession: async () => ({ kind: "memory", memory, revision: { reset: 0, accounts: new Map() }, sequence: 0 }), changeSession: async () => ({ kind: "unavailable", reason: "stale" }), subscribeView: () => () => {} },
    clock: { now: () => 1000, after: () => () => {} },
    sites: { www: { vocabulary: { routes: [], watchIds: [], schemaKeys: [] }, routes: {} }, music: { vocabulary: { routes: [route], watchIds: [], schemaKeys: [] }, routes: { membership: [route] } } }
  })
  disposers.push(() => { Date.now = wallClock }, () => monitor.dispose())
  const musicTab = { tabId: 9, windowId: 3, incognito: false, site: "music", lastAccessed: 0, active: true, discarded: false, frozen: false } as const
  // The older read's record waits for the browser to say where its tab is.
  const slow = Promise.withResolvers<{ kind: "tab"; tab: typeof musicTab }>(), waiting = Promise.withResolvers<void>()
  let lookups = 0
  const health = createMusicMembershipHealth({
    async tab() {
      if (++lookups > 1) return { kind: "tab", tab: musicTab }
      waiting.resolve()
      return slow.promise
    },
    monitor,
    build,
    route
  })
  const w = world({ music: { rows: musicRows, fallback: "failed" }, health })
  const older = w.page.membership(video, { need: [beta, alpha] })
  await waiting.promise
  w.tabs.serve = (async () => ({ kind: "result", tabId: 10, result: { ok: true, route, data: youtubeRows } })) as never
  expect(await w.page.membership(video, { need: [beta, alpha] })).toEqual({ kind: "read", rows: youtubeRows.slice(0, 2) })
  slow.resolve({ kind: "tab", tab: musicTab })
  expect(await older).toEqual({ kind: "unreadable" })
  const status = await monitor.statusProducer.read({ tab: musicTab, info: { site: "music", build, signedIn: true, acct: a } }, [{ id: "music-actions", options: { ...defaultSettings().musicActions, on: true } }] as never)
  expect(status.kind === "statuses" && status.statuses.map(row => row.state)).toEqual(["working"])
})

for (const first of ["older", "newer"] as const) {
  test(`an older failed lookup and a newer read both write their health, and the newer read's stands when the ${first} one's write lands first (YM-PICK-6)`, async () => {
    const memory = parseSessionMemory({})
    if (!memory) throw Error("no empty session")
    const read = { kind: "memory", memory, revision: { reset: 0, accounts: new Map() }, sequence: 0 } as const
    const wallClock = Date.now
    Date.now = () => 1000
    // The Monitor reads the session before it writes. Holding each record's read puts both records inside the Monitor at once.
    const reading = [Promise.withResolvers<void>(), Promise.withResolvers<void>()] as const
    const held = [Promise.withResolvers<typeof read>(), Promise.withResolvers<typeof read>()] as const
    let reads = 0
    const monitor = composeMonitor({
      owner: {
        async readSession() {
          const turn = reads++
          if (turn > 1) return read
          reading[turn as 0 | 1].resolve()
          return held[turn as 0 | 1].promise
        },
        changeSession: async () => ({ kind: "unavailable", reason: "stale" }),
        subscribeView: () => () => {}
      },
      clock: { now: () => 1000, after: () => () => {} },
      sites: {
        www: { vocabulary: { routes: [], watchIds: [], schemaKeys: [] }, routes: {} },
        music: { vocabulary: { routes: [route], watchIds: [], schemaKeys: [] }, routes: { membership: [route] } }
      }
    })
    disposers.push(
      () => {
        Date.now = wallClock
      },
      () => monitor.dispose()
    )
    const musicTab = { tabId: 9, windowId: 3, incognito: false, site: "music", lastAccessed: 0, active: true, discarded: false, frozen: false } as const
    const w = world({ music: { rows: musicRows, fallback: "failed" }, health: createMusicMembershipHealth({ tab: async () => ({ kind: "tab", tab: musicTab }), monitor, build, route }) })
    const older = w.page.membership(video, { need: [beta, alpha] })
    await reading[0].promise
    w.tabs.serve = (async () => ({ kind: "result", tabId: 10, result: { ok: true, route, data: youtubeRows } })) as never
    const newer = w.page.membership(video, { need: [beta, alpha] })
    await reading[1].promise
    held[first === "older" ? 0 : 1].resolve(read)
    await (first === "older" ? older : newer)
    held[first === "older" ? 1 : 0].resolve(read)
    expect(await older).toEqual({ kind: "unreadable" })
    expect(await newer).toEqual({ kind: "read", rows: youtubeRows.slice(0, 2) })
    const status = await monitor.statusProducer.read({ tab: musicTab, info: { site: "music", build, signedIn: true, acct: a } }, [
      { id: "music-actions", options: { ...defaultSettings().musicActions, on: true } }
    ] as never)
    expect(status.kind === "statuses" && status.statuses.map(row => row.state)).toEqual(["working"])
  })
}

test("when Music's own read and the YouTube lookup both fail, the lookup records nothing more", async () => {
  const w = world({ music: { rows: "unavailable", fallback: "failed" } })
  expect(await w.page.membership(video, { need: null })).toEqual({ kind: "unreadable" })
  expect(w.membershipHealth).toEqual([])
})

test("a playlist shortcut saves the pointed video to this account's shortcut playlist, with Undo", async () => {
  const { page, site } = world()
  const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })
  expect(report.kind).toBe("report")
  if (report.kind !== "report") return
  expect(report.outcomes).toEqual({ [beta]: { kind: "added" } })
  expect(report.toast?.message).toEqual({ kind: "saved", playlists: [beta] })
  expect(report.undo?.kind).toBe("add")
  expect(site.lists.get(beta)?.has(video)).toBe(true)
  const undone = await page.undo(report.undo!)
  expect(undone).toEqual({ kind: "undone" })
  expect(site.jobs).toContain("remove")
})

test("a failure toast's Settings opens Settings at that feature's playlist, beside the tab that asked (YT-ADD-29)", async () => {
  const { page, opened } = world()
  page.settings({ feature: "shortcuts", playlist: beta })
  await until(() => opened.length === 1, "Settings opened")
  expect(opened).toEqual([{ hash: `feature-shortcuts&playlist=${beta}`, tabId: 9 }])
})

test("a not-working notice's Details opens Settings at Diagnostics, beside the tab that asked (UI-TOAST-15)", async () => {
  const { page, opened } = world()
  page.settings({ section: "diagnostics" })
  await until(() => opened.length === 1, "Settings opened")
  expect(opened).toEqual([{ hash: "diagnostics", tabId: 9 }])
})

test("the watch-page menu skips the video, pauses auto-add and lists this channel, as the tab's account (UI-YT-22)", async () => {
  const w = world()
  expect(await w.page.skip(video, true)).toBe(true)
  expect(await w.page.pause(true)).toBe(true)
  expect(await w.page.filterChannel({ playlist: alpha, channel: ["UCbbbbbbbbbbbbbbbbbbbbbb" as never, "Band"], action: "list", mode: null, clearListed: false, expectedGeneration: null })).toBe(true)
  const view = await w.view()
  expect(view.paused).toBe(true)
  expect(view.skips?.entries.find(([id]) => id === video)?.[1]).toBe("all")
  const filter = view.filters.find(row => row.playlist === alpha)?.state.filter
  expect(filter?.channels.some(([id]) => id === "UCbbbbbbbbbbbbbbbbbbbbbb")).toBe(true)
  expect(await world({ pageAccount: b }).page.skip(video, true)).toBe(false)
})

test("an Undo handle stops working once the page releases it or the tab loads a new page", async () => {
  for (const end of ["release", "new page"] as const) {
    const { page, site, actions } = world()
    const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })
    if (report.kind !== "report" || !report.undo) throw Error("Expected an add with Undo")
    if (end === "release") {
      page.release(report.undo)
      await new Promise(resolve => setTimeout(resolve, 0))
    } else actions.pageStarted(9)
    expect(await page.undo(report.undo)).toEqual({ kind: "expired" })
    expect(site.jobs).not.toContain("remove")
  }
})

test("another tab's new page load leaves this tab's Undo working", async () => {
  const { page, actions } = world()
  const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })
  if (report.kind !== "report" || !report.undo) throw Error("Expected an add with Undo")
  actions.pageStarted(10)
  expect(await page.undo(report.undo)).toEqual({ kind: "undone" })
})

test("a confirmed add to a playlist marked Missing clears its mark in the store (YT-ADD-36)", async () => {
  const { page, store } = world()
  const report = await page.add({ site: "www", video, via: "quick-save", opener: "quick-save" })
  expect(report.kind === "report" && report.outcomes[alpha]).toEqual({ kind: "added" })
  let marks: unknown
  for (let turn = 0; turn < 50; turn++) {
    const read = await store.owner.readSetup(a)
    marks = read.kind === "value" && read.view.kind === "live" ? read.view.setup.marks : undefined
    if (marks && Object.keys(marks).length === 0) break
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  expect(marks).toEqual({})
})

test("AddFlow learns when this browser created a playlist, so an add to it waits until it's 30 s old (YT-ADD-39)", async () => {
  // The fixture store's clock reads 100, so a playlist created at 90 is 10 ms old to it.
  const at = 90
  const { store } = world({
    prepare: initial => {
      initial.local[`cache:${a}`] = { listAt: null, playlists: [], order: {}, created: [{ id: beta, title: "New one", privacy: "PRIVATE", at }], labelAt: null }
    }
  })
  const view = createAddFlowOwner(store.owner, () => true)
  await view.load(false, a, "www")
  expect(view.port.account({ kind: "shortcut", shortcut: "orig01" as never }, a)).toEqual({ targets: [{ playlist: beta }], created: { [beta]: at } })
})

test("the page picker saves this browser's Sort A–Z and last visibility through the store", async () => {
  const { page, store } = world()
  expect(await page.device({ field: "pickerSortAZ", value: false })).toEqual({ kind: "confirmed" })
  expect(await page.device({ field: "newPlaylistVisibility", value: "UNLISTED" })).toEqual({ kind: "confirmed" })
  const device = store.removal.state().local.device as Record<string, unknown>
  expect([device.pickerSortAZ, device.newPlaylistVisibility]).toEqual([false, "UNLISTED"])
})

test("a channel label the page read afresh is written into the account's filter as that tab's account", async () => {
  const { page, store } = world()
  page.channelLabel(["UCAAAAAAAAAAAAAAAAAAAAAA" as never, "Alpha, renamed", "@alpha"])
  let row: unknown
  for (let turn = 0; turn < 50 && !(Array.isArray(row) && row[1] === "Alpha, renamed"); turn++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    row = (store.removal.state().local[`doc:filter:${a}:${alpha}`] as { data: { channels: unknown[] } }).data.channels[0]
  }
  expect(row).toEqual(["UCAAAAAAAAAAAAAAAAAAAAAA", "Alpha, renamed", "@alpha", "never-send"])
})

test("Watch later on every account saves to Watch later whatever the account's own target", async () => {
  const { page, site } = world()
  const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "later1" as never })
  expect(report.kind === "report" && report.outcomes).toEqual({ ["WL" as PlaylistId]: { kind: "added" } })
  expect(site.lists.get("WL" as PlaylistId)?.has(video)).toBe(true)
})

test("a video already in the playlist answers already-in and writes nothing", async () => {
  const { page, site } = world()
  site.lists.get(alpha)?.add(video)
  const report = await page.add({ site: "www", video, via: "quick-save", opener: "quick-save" })
  expect(report.kind === "report" && report.outcomes).toEqual({ [alpha]: { kind: "already-in" } })
  expect(site.jobs).not.toContain("add")
})

test("quick-save on an account with no quick-save playlist asks the page to open choose mode", async () => {
  const { page, site } = world({ tabAccount: b })
  expect(await page.add({ site: "www", video, via: "quick-save", opener: "quick-save" })).toEqual({ kind: "choose" })
  expect(site.jobs).toEqual([])
})

test("a feature that is off adds nothing", async () => {
  const { page, site } = world({ settings: { quickSave: { on: false, feedback: true, shortsShelves: false } } })
  const report = await page.add({ site: "www", video, via: "quick-save", opener: "quick-save" })
  expect(report).toEqual({ kind: "report", outcomes: {}, toast: null, feedback: true, undo: null, titles: {} })
  expect(site.jobs).toEqual([])
})

test("a request naming another account than the tab's registry entry is refused before anything runs (ARC-ACC-49)", async () => {
  const { page, site } = world({ tabAccount: b, pageAccount: a })
  expect(await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })).toEqual({ kind: "no-tab" })
  expect(site.jobs).toEqual([])
})

test("an untick removes the entry and offers Undo, and a pick in choose mode stores the quick-save playlist", async () => {
  const { page, store, site } = world()
  site.lists.get(beta)?.add(video)
  const removed = await page.remove({ site: "www", video, playlist: beta, opener: "quick-save", tick: null })
  expect(removed.kind).toBe("removed")
  const answer = await page.destination({ destination: { kind: "quick-save" }, expected: { setup: "live", playlist: alpha }, playlist: beta })
  expect(answer).toEqual({ kind: "confirmed", playlist: beta })
  const setup = await store.owner.readSetup(a)
  expect(setup.kind === "value" && setup.view.kind === "live" && setup.view.setup.quickSave).toBe(beta)
})

test("the picker's cached list never reaches YouTube, a refresh does, and popovers and the jobs file load through the Registrar", async () => {
  const { page, ensured, site } = world()
  expect(await page.playlists(false)).toEqual({ kind: "cached", listing: null })
  expect(await page.playlists(true)).toEqual({ kind: "listed", listing: { rows: [{ id: alpha, title: "Alpha" }], at: 5 } })
  expect(site.jobs).toEqual([])
  expect(await page.need()).toBe(true)
  expect(await page.loadJobs()).toBe(true)
  expect(ensured).toEqual([
    { tabId: 9, what: { popovers: true } },
    { tabId: 9, what: { jobs: true } }
  ])
})

const allowed = "UCAAAAAAAAAAAAAAAAAAAAAA",
  elsewhere = `UC${"B".repeat(22)}`
// Playback isn't paused, the video has no session skip, Recent adds starts empty, and the account's playlist cache names both playlists.
function autoAddSeed(initial: Seed) {
  initial.session.paused = false
  delete initial.session[`skips:${a}`]
  delete initial.session.recentAdds
  initial.local[`cache:${a}`] = {
    listAt: 5,
    playlists: [
      { id: alpha, title: "Alpha mix" },
      { id: beta, title: "Beta talks" }
    ],
    order: {},
    created: [],
    labelAt: null
  }
}
const autoAddWorld = (prepare: (initial: Seed) => void = autoAddSeed) => world({ settings: { autoAdd: { on: true, feedback: true, pct: 73 } }, prepare })
async function drain(rounds = 40) {
  for (let n = 0; n < rounds; n++) await new Promise(resolve => setTimeout(resolve, 0))
}
async function until(check: () => boolean, what: string) {
  for (let n = 0; n < 400 && !check(); n++) await new Promise(resolve => setTimeout(resolve, 0))
  if (!check()) throw Error(`Timed out waiting for ${what}`)
}

/** One visit to the watch page: the player's readings drive the real auto-add feature, which reaches the background through the tab client. */
async function watchPage(w: ReturnType<typeof world>, channel: string) {
  const scope = new Scope({
    document,
    onError: error => {
      throw error
    }
  })
  const view = await w.view()
  const streams: { player?: (data: PlayerData) => void; nav?: (data: NavData) => void } = {}
  const toasts: ToastContent[] = [],
    states: unknown[] = [],
    answers: unknown[] = []
  let now = 0
  const feedback = {
    toaster: {
      show(content: ToastContent) {
        toasts.push(content)
        return { replace: () => true, release() {} }
      }
    },
    format: (plan: ToastPlan, titles: { video?: string; playlists?: Record<string, string> }, action: unknown) => ({
      text: `${plan.message.kind}:${titles.video ?? ""}:${Object.values(titles.playlists ?? {}).join(",")}`,
      tone: plan.tone,
      auto: plan.auto,
      action
    }),
    action: (kind: string, run: () => unknown) => ({ kind, label: kind, run })
  } as unknown as Feedback
  const actions = {
    ...w.page,
    async add(request: Parameters<typeof w.page.add>[0]) {
      const answer = await w.page.add(request)
      answers.push(answer)
      return answer
    }
  }
  void autoAdd.start({
    site: "www",
    scope,
    document,
    actions,
    feedback: { use: () => feedback },
    view: { read: () => view, subscribe: () => () => {} },
    page: {
      watch(stream: "player" | "nav", callback: (data: never) => void) {
        streams[stream] = callback as never
        return () => {
          delete streams[stream]
        }
      },
      onState(listener: (state: unknown) => void) {
        listener({ kind: "ready", snapshot: { signedIn: true, acct: a, pageType: "watch", startedHidden: false, navType: "navigate" } })
        return () => {}
      },
      run: async () => ({ ok: true, data: { channelId: channel } })
    } as never,
    text: { cantMeasure: title => `cant-measure:${title ?? ""}` },
    clock: { now: () => now },
    status: state => {
      states.push(state)
    }
  })
  disposers.push(() => scope.dispose())
  streams.nav?.({ pageType: "watch" as NavData["pageType"], video: { videoId: video, title: "First video", length: 100, kind: "video" }, navigation: { kind: "watch", videoId: video } })
  return {
    scope,
    toasts,
    states,
    answers,
    navigate(to: VideoId) {
      streams.nav?.({ pageType: "watch" as NavData["pageType"], video: { videoId: to, title: "Next video", length: 100, kind: "video" }, navigation: { kind: "watch", videoId: to } })
    },
    async play(from: number, to: number) {
      for (let pos = from; pos <= to; pos++) {
        streams.player?.({
          ad: false,
          at: now,
          player: "watch",
          videoId: video,
          pos,
          len: 100,
          listedLength: 100,
          rate: 1,
          playing: true,
          seeking: false,
          content: "video",
          isPostLiveDvr: false,
          isLive: false,
          isUpcoming: false,
          isLiveContent: false
        })
        now += 1000
        await drain(2)
      }
    }
  }
}

test("every add is listed in Recent adds with its video and playlist titles, and none is while Keep a list of recent adds is off", async () => {
  const on = world({ prepare: autoAddSeed })
  const report = await on.page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never, title: "First video" })
  expect(report.kind === "report" && report.titles).toEqual({ [beta]: "Beta talks" })
  await until(() => on.recentAdds().length === 1, "the Recent adds entry")
  expect(on.recentAdds()).toEqual([
    {
      kind: "single",
      acct: a,
      at: expect.any(Number),
      source: { kind: "feature", feature: "shortcuts" },
      video: { id: video, title: "First video" },
      playlists: [{ id: beta, title: "Beta talks" }],
      undo: expect.any(String)
    }
  ])
  const off = world({
    prepare: initial => {
      autoAddSeed(initial)
      Object.assign(initial.local.device as object, { recentAdds: false })
    }
  })
  expect((await off.page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never, title: "First video" })).kind).toBe("report")
  await drain()
  expect(off.site.lists.get(beta)?.has(video)).toBe(true)
  expect(off.recentAdds()).toEqual([])
})

test("auto-add: a video played to its playlist's goal is added by the background, named in its toast and Recent adds, and Undo takes it back", async () => {
  const w = autoAddWorld()
  const tab = await watchPage(w, allowed)
  await tab.play(0, 20)
  expect(w.site.jobs).not.toContain("add")
  await tab.play(21, 30)
  await until(() => tab.toasts.length > 0, "the auto-add toast")
  expect(w.site.lists.get(alpha)?.has(video)).toBe(true)
  expect(tab.toasts.map(toast => [toast.text, toast.action?.kind ?? null])).toEqual([["saved:First video:Alpha mix", "undo"]])
  expect(tab.states.at(-1)).toEqual({ kind: "added", playlists: [alpha] })
  expect(w.recentAdds()).toEqual([
    {
      kind: "single",
      acct: a,
      at: expect.any(Number),
      source: { kind: "feature", feature: "auto-add" },
      video: { id: video, title: "First video" },
      playlists: [{ id: alpha, title: "Alpha mix" }],
      undo: expect.any(String)
    }
  ])
  await tab.toasts[0]?.action?.run()
  await until(() => w.recentAdds().length === 0, "Undo to drop the Recent adds entry")
  expect(w.site.jobs.filter(job => job === "add" || job === "remove")).toEqual(["add", "remove"])
})

test("auto-add: an add ticks that tab's toolbar icon, and the tab clears the tick when its video changes in-app", async () => {
  const w = autoAddWorld()
  const tab = await watchPage(w, allowed)
  await tab.play(0, 30)
  await until(() => w.ticks.length > 0, "the tick")
  expect(w.ticks).toEqual(["tick 9"])
  tab.navigate("bbbbbbbbbbb" as VideoId)
  await until(() => w.ticks.length > 1, "the untick")
  expect(w.ticks).toEqual(["tick 9", "untick 9"])
  const shortcut = world({ prepare: autoAddSeed })
  expect((await shortcut.page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })).kind).toBe("report")
  expect(shortcut.ticks).toEqual([])
})

test("auto-add: the background applies the playlist's channel filter, so another channel's video is filtered, toasted as such and never written", async () => {
  const w = autoAddWorld()
  const tab = await watchPage(w, elsewhere)
  await tab.play(0, 30)
  await until(() => tab.answers.length > 0, "the background's answer")
  expect(tab.answers).toEqual([expect.objectContaining({ kind: "report", outcomes: { [alpha]: { kind: "filtered", decision: "filtered" } }, undo: null, titles: { [alpha]: "Alpha mix" } })])
  await drain()
  expect(w.site.jobs).not.toContain("add")
  expect(w.recentAdds()).toEqual([])
  expect(tab.toasts.map(toast => [toast.text, toast.action?.kind ?? null])).toEqual([["filtered:First video:Alpha mix", null]])
})

test("auto-add: each filter decision reaches the add's console log, with its playlist, mode, channel and verdict (YT-CF-18)", async () => {
  const cases = [
    [allowed, "allowed", `add (auto-add) ${alpha}=added`],
    [elsewhere, "filtered", `add (auto-add) ${alpha}=filtered`]
  ] as const
  for (const [channel, verdict, add] of cases) {
    const w = autoAddWorld()
    const tab = await watchPage(w, channel)
    await tab.play(0, 30)
    await until(() => tab.answers.length > 0, "the background's answer")
    expect(w.logs).toEqual([`filter ${alpha} allow ${channel} ${verdict}`, add])
  }
})

test("auto-add: progress saved when the page is left counts on the next visit, through the store", async () => {
  const w = autoAddWorld()
  const first = await watchPage(w, allowed)
  await first.play(0, 12)
  first.scope.dispose()
  await until(() => w.store.writes().some(row => row.kind.startsWith("local.set")), "the progress checkpoint")
  const saved = await w.store.owner.loadProgress({ acct: a, video, private: false })
  expect(saved.kind === "progress" && saved.progress !== null).toBe(true)
  const second = await watchPage(w, allowed)
  await second.play(13, 26)
  await until(() => w.site.lists.get(alpha)?.has(video) === true, "the add from both visits' progress")
})

// Account b's YouTube Music tab reads Playing now; its quick-save playlist is beta, and b's cache names it.
function playingNowSeed(initial: Seed) {
  autoAddSeed(initial)
  initial.local[`cache:${b}`] = { listAt: 5, playlists: [{ id: beta, title: "Beta talks" }], order: {}, created: [], labelAt: null }
}
const popupWindow = { windowId: 3, incognito: false, activeTabId: 9 }
const song = { site: "music", video, title: "First song", via: "quick-save", opener: "playing-now" } as const

test("Playing now's Save runs through AddFlow in the tab it read with Quick actions off, and the popup's Recent adds lists it", async () => {
  const w = world({ tabAccount: b, settings: { musicActions: { on: false, feedback: true } }, prepare: playingNowSeed })
  const save = createPlayingSave({ actions: w.actions, i18n: englishI18n(), consented: () => true })
  const answer = await save(popupWindow, { tabId: 9, acct: b, request: song })
  expect(answer).toEqual({ kind: "added", text: expect.stringContaining("Beta talks"), undo: { kind: "add", id: expect.any(String) } })
  expect(w.site.jobs).toContain("save")
  expect(w.site.lists.get(beta)?.has(video)).toBe(true)
  await until(() => w.recentAdds().length === 1, "the Recent adds entry")
  const pages = createPageReceiver({ session: { get: async () => w.recentAdds() } } as unknown as PageReceiverPorts)
  const ui = { ui: { kind: "ui", page: "popup", origin: { kind: "ui", windowId: 3, incognito: false } }, requester: popupWindow, principal: "p" }
  expect(await pages["ui.recentAdds"]({ acct: b }, { ui, current: async () => ui } as never)).toEqual({
    kind: "recent",
    entries: [
      { at: expect.any(Number), source: { kind: "feature", feature: "playing-now" }, playlists: [{ id: beta, title: "Beta talks" }], videos: [{ id: video, title: "First song" }], gather: false }
    ]
  })
  expect(await save(popupWindow, { tabId: 9, acct: b, request: song })).toEqual({ kind: "already-in", text: expect.stringContaining("Beta talks") })
})

test("Playing now's save carries its Undo, which takes the song back in that tab while it shows the same account (YM-POP-3)", async () => {
  const w = world({ tabAccount: b, settings: { musicActions: { on: false, feedback: true } }, prepare: playingNowSeed })
  const answer = await createPlayingSave({ actions: w.actions, i18n: englishI18n(), consented: () => true })(popupWindow, { tabId: 9, acct: b, request: song })
  if (answer.kind !== "added" || !answer.undo) throw Error("Expected a save with Undo")
  const undo = createPlayingUndo({ actions: w.actions, i18n: englishI18n(), consented: () => true })
  expect(await undo(popupWindow, { tabId: 9, acct: a, handle: answer.undo })).toEqual({ kind: "account-changed" })
  expect(await undo(popupWindow, { tabId: 9, acct: b, handle: answer.undo })).toEqual({ kind: "undone" })
  expect(w.site.jobs).toContain("unsave")
  expect(await undo(popupWindow, { tabId: 9, acct: b, handle: answer.undo })).toEqual({ kind: "expired" })
})

test("the popup's picker sheet reads membership, saves and unticks in the tab's own account, whatever feature switches say (UI-POP-14)", async () => {
  const w = world({ settings: { quickSave: { on: false, feedback: true } } })
  const item = createPopupItem({ actions: w.actions, consented: () => true })
  const save = createPlayingSave({ actions: w.actions, i18n: englishI18n(), consented: () => true })
  const request = { site: "www", video, opener: "popup", title: "First video" } as const
  expect(await item.membership(popupWindow, { tabId: 9, acct: a, site: "www", video })).toMatchObject({ kind: "read" })
  const added = await save(popupWindow, { tabId: 9, acct: a, request: { ...request, via: "picker", playlist: beta } })
  if (added.kind !== "added" || !added.undo) throw Error("Expected a save with its handle")
  expect(w.site.lists.get(beta)?.has(video)).toBe(true)
  expect(await item.remove(popupWindow, { tabId: 9, acct: a, request: { site: "www", video, playlist: beta, opener: "popup", tick: added.undo } })).toEqual({
    kind: "removed",
    undo: { kind: "remove", id: expect.any(String) }
  })
  expect(w.site.jobs).toContain("remove")
  expect(await item.remove(popupWindow, { tabId: 9, acct: b, request: { site: "www", video, playlist: beta, opener: "popup", tick: null } })).toEqual({ kind: "account-changed" })
})

test("Playing now's Save refuses once the tab shows another account or the section switch is off, and writes nothing", async () => {
  const changed = world({ tabAccount: a, prepare: playingNowSeed })
  const save = createPlayingSave({ actions: changed.actions, i18n: englishI18n(), consented: () => true })
  expect(await save(popupWindow, { tabId: 9, acct: b, request: song })).toEqual({ kind: "account-changed" })
  expect(await save({ ...popupWindow, incognito: true }, { tabId: 9, acct: a, request: song })).toEqual({ kind: "account-changed" })
  expect(changed.site.jobs).toEqual([])
  const off = world({ tabAccount: b, settings: { musicSection: false }, prepare: playingNowSeed })
  const offSave = createPlayingSave({ actions: off.actions, i18n: englishI18n(), consented: () => true })
  expect((await offSave(popupWindow, { tabId: 9, acct: b, request: song })).kind).toBe("failed")
  expect(off.site.jobs).toEqual([])
})
