import { afterEach, expect, test } from "bun:test"
import { composeActions, createAddFlowOwner } from "./actions"
import { createPlayingSave } from "./playing-now"
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
import type { Tabs, TabJobOutcome } from "../tabs/ports"
import type { KnownTab } from "../tabs/tabs"
import type { NativeSender } from "../adapters/sender-origin"
import type { Job, JobInvocation, JobResult, RouteId, SetVideoId } from "../../shared/contracts"
import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import { projectionSeed, projectionWorld, document as doc, a, b, alpha, beta, video } from "../../../tools/fixtures/tab-projection/harness"
import { build } from "../../../tools/fixtures/page-link/support"
import { syntheticHealth, tabContext } from "../../../tools/fixtures/tab-view/harness"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"

type Listener = (message: unknown, sender: NativeSender, respond: (answer?: unknown) => void) => boolean
const route = "fixture-route" as RouteId
const disposers: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose() })

function seed(settings: Record<string, unknown> = {}) {
  const initial = projectionSeed()
  initial.local["doc:settings"] = doc({
    shortcuts: { on: true, feedback: true, list: [
      { id: "orig01", label: "Alpha shortcut", key: null, watchLaterOnEveryAccount: false },
      { id: "later1", label: "Later", key: null, watchLaterOnEveryAccount: true }
    ] },
    quickSave: { on: true, feedback: true, shortsShelves: false }, ...settings
  })
  return initial
}

function youtube() {
  const lists = new Map<PlaylistId, Set<VideoId>>([[alpha, new Set()], [beta, new Set()], ["WL" as PlaylistId, new Set()]])
  const jobs: string[] = []
  let entry = 0
  function answer<J extends Job>(invocation: JobInvocation<J>): JobResult<J> {
    const job = invocation.job as Job
    jobs.push(job.kind)
    switch (job.kind) {
      case "membership": return { ok: true, route, data: [...lists].map(([id, videos]) => ({ id, title: id, contains: videos.has(job.videoId) })) } as unknown as JobResult<J>
      case "add": case "save": lists.get(job.playlistId)?.add(job.videoId); return { ok: true, route, data: { setVideoId: `entry-${++entry}` as SetVideoId } } as unknown as JobResult<J>
      case "remove": return { ok: true, route, data: null } as unknown as JobResult<J>
      default: return { ok: false, reason: "unavailable" } as unknown as JobResult<J>
    }
  }
  return { lists, jobs, answer }
}

type Seed = ReturnType<typeof seed>
function world(options: { settings?: Record<string, unknown>; tabAccount?: AccountKey | null; pageAccount?: AccountKey | null; prepare?: (initial: Seed) => void } = {}) {
  const initial = seed(options.settings)
  options.prepare?.(initial)
  const store = projectionWorld(initial)
  const site = youtube()
  const listeners = new Set<Listener>()
  const ensured: unknown[] = [], ticks: string[] = []
  const known = { tabId: 9, acct: options.tabAccount === undefined ? a : options.tabAccount, privateTab: false } as unknown as KnownTab
  const tabs = {
    async known() { return [known] },
    async runIn<J extends Job>(tabId: number, invocation: JobInvocation<J>): Promise<TabJobOutcome<J>> {
      return { kind: "result", tabId, result: site.answer(invocation) }
    },
    async serve() { return { kind: "no-tab", attempted: [] } },
    async accountInView() { return { kind: "none" } }
  } as unknown as Tabs
  const playlists = {
    async list() { return { kind: "open", cached: null, freshness: "absent",
      refresh: Promise.resolve({ kind: "listed", listing: { rows: [{ id: alpha, title: "Alpha" }], at: 5 } }) } }
  } as unknown as Playlists
  const native = {
    runtime: { id: "perchling", getURL: (path: string) => `chrome-extension://perchling${path}`, async sendMessage() {},
      onMessage: { addListener: (listener: Listener) => { listeners.add(listener) }, removeListener: (listener: Listener) => { listeners.delete(listener) } } },
    windows: { async get(id: number) { return { id, incognito: false } } }
  }
  const closedListeners = new Set<(tabId: number) => void>()
  const actions = composeActions({ native: native as never, build, owner: store.owner, tabs, playlists, writable: () => true,
    closed: listener => { closedListeners.add(listener); return () => { closedListeners.delete(listener) } },
    registrar: { async ensure(tabId, what) { ensured.push({ tabId, what }) } }, requester: async () => null, log: () => {},
    ticked: tabId => { ticks.push(`tick ${tabId}`) } })
  const sender = { id: "perchling", frameId: 0, url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    tab: { id: 9, windowId: 3, incognito: false } } as NativeSender
  const transport = { send: (message: unknown) => new Promise<unknown>(resolve => {
    let claimed = false
    for (const listener of [...listeners]) claimed = listener(message, sender, resolve) || claimed
    if (!claimed) resolve(undefined)
  }) }
  const deadline = (ms: number, expire: () => void) => { const t = setTimeout(expire, ms); return () => clearTimeout(t) }
  const progress = createAutoAddTabRouter({ transport: runtimeTransport(native.runtime as never), senders: native as never, build, deadline,
    tabs, owner: store.owner, untick: tabId => { ticks.push(`untick ${tabId}`) }, now: () => Date.now() })
  const page = createTabActions({ transport, build, deadline, account: () => options.pageAccount !== undefined ? options.pageAccount : known.acct })
  const health = syntheticHealth()
  const producer = createTabViewProducer({ owner: store.owner, addFlow: actions.flow, statuses: health.statuses, notices: health.notices, build })
  async function view(): Promise<SiteView<"www">> {
    const produced = await producer.produce(tabContext())
    if (produced.kind !== "view" || produced.view.site !== "www") throw Error("Expected the store's www tab view")
    return produced.view
  }
  disposers.push(() => page.dispose(), () => progress.dispose(), () => producer.dispose(), () => actions.dispose(), () => store.owner.dispose())
  function recentAdds(): readonly unknown[] {
    const rows = store.removal.state().session.recentAdds
    return Array.isArray(rows) ? rows : []
  }
  const closeTab = (tabId: number) => { for (const listener of [...closedListeners]) listener(tabId) }
  return { store, site, page, actions, ensured, ticks, view, recentAdds, closeTab }
}

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

test("an Undo handle stops working once the page releases it, its tab closes, or the tab loads a new page", async () => {
  for (const end of ["release", "close", "new page"] as const) {
    const { page, site, actions, closeTab } = world()
    const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })
    if (report.kind !== "report" || !report.undo) throw Error("Expected an add with Undo")
    if (end === "release") { page.release(report.undo); await new Promise(resolve => setTimeout(resolve, 0)) }
    else if (end === "close") closeTab(9)
    else actions.pageStarted(9)
    expect(await page.undo(report.undo)).toEqual({ kind: "expired" })
    expect(site.jobs).not.toContain("remove")
  }
})

test("closing another tab leaves this tab's Undo working", async () => {
  const { page, closeTab } = world()
  const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })
  if (report.kind !== "report" || !report.undo) throw Error("Expected an add with Undo")
  closeTab(10)
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
  const { store } = world({ prepare: initial => {
    initial.local[`cache:${a}`] = { listAt: null, playlists: [], order: {}, created: [{ id: beta, title: "New one", privacy: "PRIVATE", at }], labelAt: null }
  } })
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

test("the picker's cached list never reaches YouTube, a refresh does, and popovers load through the Registrar", async () => {
  const { page, ensured, site } = world()
  expect(await page.playlists(false)).toEqual({ kind: "cached", listing: null })
  expect(await page.playlists(true)).toEqual({ kind: "listed", listing: { rows: [{ id: alpha, title: "Alpha" }], at: 5 } })
  expect(site.jobs).toEqual([])
  expect(await page.need()).toBe(true)
  expect(ensured).toEqual([{ tabId: 9, what: { popovers: true } }])
})

const allowed = "UCAAAAAAAAAAAAAAAAAAAAAA", elsewhere = `UC${"B".repeat(22)}`
// Playback isn't paused, the video has no session skip, Recent adds starts empty, and the account's playlist cache names both playlists.
function autoAddSeed(initial: Seed) {
  initial.session.paused = false
  delete initial.session[`skips:${a}`]
  delete initial.session.recentAdds
  initial.local[`cache:${a}`] = { listAt: 5, playlists: [{ id: alpha, title: "Alpha mix" }, { id: beta, title: "Beta talks" }], order: {}, created: [], labelAt: null }
}
const autoAddWorld = (prepare: (initial: Seed) => void = autoAddSeed) => world({ settings: { autoAdd: { on: true, feedback: true, pct: 73 } }, prepare })
async function drain(rounds = 40) { for (let n = 0; n < rounds; n++) await new Promise(resolve => setTimeout(resolve, 0)) }
async function until(check: () => boolean, what: string) {
  for (let n = 0; n < 400 && !check(); n++) await new Promise(resolve => setTimeout(resolve, 0))
  if (!check()) throw Error(`Timed out waiting for ${what}`)
}

/** One visit to the watch page: the player's readings drive the real auto-add feature, which reaches the background through the tab client. */
async function watchPage(w: ReturnType<typeof world>, channel: string) {
  const scope = new Scope({ document, onError: error => { throw error } })
  const view = await w.view()
  const streams: { player?: (data: PlayerData) => void; nav?: (data: NavData) => void } = {}
  const toasts: ToastContent[] = [], states: unknown[] = [], answers: unknown[] = []
  let now = 0
  const feedback = {
    toaster: { show(content: ToastContent) { toasts.push(content); return { replace: () => true, release() {} } } },
    format: (plan: ToastPlan, titles: { video?: string; playlists?: Record<string, string> }, action: unknown) =>
      ({ text: `${plan.message.kind}:${titles.video ?? ""}:${Object.values(titles.playlists ?? {}).join(",")}`, tone: plan.tone, auto: plan.auto, action }),
    action: (kind: string, run: () => unknown) => ({ kind, label: kind, run })
  } as unknown as Feedback
  const actions = { ...w.page, async add(request: Parameters<typeof w.page.add>[0]) { const answer = await w.page.add(request); answers.push(answer); return answer } }
  void autoAdd.start({ site: "www", scope, document, actions, feedback: { use: () => feedback },
    view: { read: () => view, subscribe: () => () => {} },
    page: {
      watch(stream: "player" | "nav", callback: (data: never) => void) { streams[stream] = callback as never; return () => { delete streams[stream] } },
      onState(listener: (state: unknown) => void) {
        listener({ kind: "ready", snapshot: { signedIn: true, acct: a, pageType: "watch", startedHidden: false, navType: "navigate" } })
        return () => {}
      },
      run: async () => ({ ok: true, data: { channelId: channel } })
    } as never,
    text: { cantMeasure: title => `cant-measure:${title ?? ""}` }, clock: { now: () => now }, status: state => { states.push(state) } })
  disposers.push(() => scope.dispose())
  streams.nav?.({ pageType: "watch" as NavData["pageType"], video: { videoId: video, title: "First video", length: 100, kind: "video" },
    navigation: { kind: "watch", videoId: video } })
  return {
    scope, toasts, states, answers,
    navigate(to: VideoId) { streams.nav?.({ pageType: "watch" as NavData["pageType"], video: { videoId: to, title: "Next video", length: 100, kind: "video" }, navigation: { kind: "watch", videoId: to } }) },
    async play(from: number, to: number) {
      for (let pos = from; pos <= to; pos++) {
        streams.player?.({ ad: false, at: now, player: "watch", videoId: video, pos, len: 100, listedLength: 100, rate: 1, playing: true, seeking: false,
          content: "video", isPostLiveDvr: false, isLive: false, isUpcoming: false, isLiveContent: false })
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
  expect(on.recentAdds()).toEqual([{ kind: "single", acct: a, at: expect.any(Number), source: { kind: "feature", feature: "shortcuts" },
    video: { id: video, title: "First video" }, playlists: [{ id: beta, title: "Beta talks" }], undo: expect.any(String) }])
  const off = world({ prepare: initial => { autoAddSeed(initial); Object.assign(initial.local.device as object, { recentAdds: false }) } })
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
  expect(w.recentAdds()).toEqual([{ kind: "single", acct: a, at: expect.any(Number), source: { kind: "feature", feature: "auto-add" },
    video: { id: video, title: "First video" }, playlists: [{ id: alpha, title: "Alpha mix" }], undo: expect.any(String) }])
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
  expect(tab.answers).toEqual([expect.objectContaining({ kind: "report", outcomes: { [alpha]: { kind: "filtered", decision: "filtered" } }, undo: null,
    titles: { [alpha]: "Alpha mix" } })])
  await drain()
  expect(w.site.jobs).not.toContain("add")
  expect(w.recentAdds()).toEqual([])
  expect(tab.toasts.map(toast => [toast.text, toast.action?.kind ?? null])).toEqual([["filtered:First video:Alpha mix", null]])
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
  expect(answer).toEqual({ kind: "added", text: expect.stringContaining("Beta talks") })
  expect(w.site.jobs).toContain("save")
  expect(w.site.lists.get(beta)?.has(video)).toBe(true)
  await until(() => w.recentAdds().length === 1, "the Recent adds entry")
  const pages = createPageReceiver({ session: { get: async () => w.recentAdds() } } as unknown as PageReceiverPorts)
  const ui = { ui: { kind: "ui", page: "popup", origin: { kind: "ui", windowId: 3, incognito: false } }, requester: popupWindow, principal: "p" }
  expect(await pages["ui.recentAdds"]({ acct: b }, { ui, current: async () => ui } as never)).toEqual({ kind: "recent", entries: [{ at: expect.any(Number),
    source: { kind: "feature", feature: "playing-now" }, playlists: [{ id: beta, title: "Beta talks" }], videos: [{ id: video, title: "First song" }], gather: false }] })
  expect(await save(popupWindow, { tabId: 9, acct: b, request: song })).toEqual({ kind: "already-in", text: expect.stringContaining("Beta talks") })
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
