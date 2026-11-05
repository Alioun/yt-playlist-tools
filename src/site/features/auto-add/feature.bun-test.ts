import type { ThisVideo } from "../../../shared/contracts/this-video"
import { afterEach, expect, test } from "bun:test"
import { autoAdd, SAVE_AFTER_PAUSE_MS, SAVE_WHILE_PLAYING_MS, type AutoAddServices } from "./feature"
import type { AutoAddState } from "./state"
import { Scope } from "../../core/scope"
import type { SiteView } from "../../core/feature-host"
import type { Feedback } from "../../kit/feedback"
import type { ToastContent } from "../../kit/toaster/types"
import { isTabView } from "../../../shared/contracts/tab-view"
import type { NavData, PlayerData } from "../../../shared/contracts/streams"
import type { TabAddReport, TabAddRequest, TabProgress } from "../../../shared/contracts/tab-actions"
import { isBuildId } from "../../../shared/contracts/vocabulary"
import { isAccountKey, isPlaylistId, isVideoId, type PlaylistId, type VideoId } from "../../../shared/model"
import type { ToastPlan } from "../../../shared/rules/outcomes"

function id<T>(value: string, guard: (v: unknown) => v is T): T { if (!guard(value)) throw Error(`Invalid fixture ${value}`); return value }
const acct = id("AAAAAAAAAAAAAAAA", isAccountKey), build = id("test", isBuildId)
const music = id("PL_music", isPlaylistId), talks = id("PL_talks", isPlaylistId)
const first = id("aaaaaaaaaaa", isVideoId), second = id("bbbbbbbbbbb", isVideoId)

type ViewOptions = { pct?: number; paused?: boolean; private?: boolean; skip?: "all" | PlaylistId[]; playlists?: { pl: PlaylistId; takes: "videos" | "shorts" | "both"; pct?: number }[] }
function wwwView(options: ViewOptions = {}): SiteView<"www"> {
  const isPrivate = options.private ?? false
  const entries = options.skip ? [[first, options.skip]] : []
  const value = {
    site: "www", build, undoKey: null, pickerSortAZ: false, paused: options.paused ?? false, notices: [],
    statuses: [{ feature: "auto-add", state: "working", jobs: [], anchors: [], actions: [], kinds: [] }],
    features: [{ id: "auto-add", options: { on: true, feedback: true, pct: options.pct ?? 50, toolbarTick: true, toolbarPaused: true } }],
    signedIn: true, acct, private: isPrivate, filters: [],
    skips: { kind: isPrivate ? "private" : "normal", entries },
    setup: { kind: "live", setup: { label: null, autoAdd: options.playlists ?? [{ pl: music, takes: "videos" }], targets: {}, quickSave: null, musicSave: null, gather: null, marks: {} } }
  }
  if (!isTabView(value) || value.site !== "www") throw Error("Fixture view is not a valid www TabView")
  return value
}
const savedPlan: ToastPlan = { tone: "confirmation", auto: true, message: { kind: "saved", playlists: [music] }, action: { kind: "undo" }, remember: { tab: [], session: [] } }

const worlds: { scope: Scope }[] = []
afterEach(() => { for (const world of worlds.splice(0)) world.scope.dispose() })

function world(initial: SiteView<"www"> = wwwView(), options: { stored?: TabProgress; cantMeasure?: boolean[]; channel?: { channelId: string; title?: string; handle?: string } } = {}) {
  document.body.replaceChildren()
  const scope = new Scope({ document, onError: error => { throw error } })
  let current = initial, now = 0
  const listeners = new Set<(view: SiteView<"www">) => void>()
  const streams: { player?: (data: PlayerData) => void; nav?: (data: NavData) => void } = {}
  const adds: TabAddRequest[] = [], saves: { video: VideoId; progress: TabProgress }[] = []
  const toasts: ToastContent[] = [], logs: string[] = [], states: AutoAddState[] = [], views: (ThisVideo | null)[] = []
  const changed: number[] = [], released: string[] = [], labels: unknown[] = [], settings: unknown[] = []
  let answer: (request: TabAddRequest) => TabAddReport = request => ({ kind: "report", toast: savedPlan, feedback: true, undo: { kind: "add", id: "g:1" },
    titles: { [music]: "Music videos" }, outcomes: Object.fromEntries((request.via === "auto-add" ? request.playlists : []).map(pl => [pl, { kind: "added" }])) })
  const cantMeasure = [...options.cantMeasure ?? [true, false]]
  const feedback = {
    toaster: { show(content: ToastContent) { toasts.push(content); return { replace: () => true, release() {} } } },
    format: (plan: ToastPlan, titles: { video?: string }, action: unknown) => ({ text: `${plan.message.kind}:${titles.video ?? ""}`, tone: plan.tone, auto: plan.auto, action }),
    action: (kind: string, run: () => unknown) => ({ kind, label: kind, run })
  } as unknown as Feedback
  const services: AutoAddServices = {
    document,
    page: {
      watch(stream: "player" | "nav", callback: (data: never) => void) {
        streams[stream] = callback as never
        return () => { if (streams[stream] === (callback as never)) delete streams[stream] }
      },
      onState(listener: (state: unknown) => void) { listener({ kind: "ready", snapshot: { signedIn: true, acct, pageType: "watch", startedHidden: false, navType: "navigate" } } as never); return () => {} },
      run: async () => ({ ok: true, data: options.channel ?? { channelId: null } }) as never
    } as unknown as AutoAddServices["page"],
    actions: {
      async add(request) { adds.push(request); return answer(request) },
      async undo() { return { kind: "undone" } },
      release(handle) { released.push(handle.id) },
      channelLabel(channel) { labels.push(channel) },
      progress: { load: async video => video === first ? options.stored ?? null : null, async save(video, progress) { saves.push({ video, progress }) } },
      async cantMeasure() { return cantMeasure.shift() ?? false },
      videoChanged() { changed.push(Date.now()) },
      settings(target) { settings.push(target) }
    },
    feedback: { use: () => feedback },
    text: { cantMeasure: title => `cant-measure:${title ?? ""}` },
    clock: { now: () => now },
    status: state => { states.push(state) },
    thisVideo: view => { views.push(view) },
    log: message => { logs.push(message) }
  }
  void autoAdd.start({ ...services, site: "www", scope, view: {
    read: () => current,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } }
  } })
  const result = {
    scope, adds, saves, toasts, logs, states, views, changed, released, labels, settings,
    get watching() { return streams.player !== undefined },
    respond(next: typeof answer) { answer = next },
    publish(next: SiteView<"www">) { current = next; for (const listener of [...listeners]) listener(next) },
    navigate(video: VideoId, title = "First video", kind: "watch" | "shorts" | "other" = "watch") {
      streams.nav?.({ pageType: "watch" as NavData["pageType"], video: { videoId: video, title, length: 100, kind: kind === "shorts" ? "short" : "video" },
        navigation: kind === "other" ? { kind: "other" } : { kind, videoId: video } })
    },
    reading(pos: number, extra: Partial<Extract<PlayerData, { ad: false }>> = {}) {
      streams.player?.({ ad: false, at: now, player: "watch", videoId: first, pos, len: 100, listedLength: 100, rate: 1, playing: true, seeking: false,
        content: "video", isPostLiveDvr: false, isLive: false, isUpcoming: false, isLiveContent: false, ...extra })
    },
    async play(from: number, to: number, extra: Partial<Extract<PlayerData, { ad: false }>> = {}) {
      for (let pos = from; pos <= to; pos++) { result.reading(pos, extra); now += 1000; await settle() }
    },
    later(ms: number) { now += ms }
  }
  worlds.push(result)
  return result
}
async function settle() { for (let n = 0; n < 20; n++) await Promise.resolve() }

test("a video played to its playlist's goal is auto-added once, named, with the add flow's toast", async () => {
  const h = world()
  h.navigate(first, "First video")
  await h.play(0, 49)
  expect(h.adds).toEqual([])
  await h.play(50, 80)
  expect(h.adds).toEqual([{ site: "www", video: first, via: "auto-add", playlists: [music], channel: null, title: "First video" }])
  expect(h.toasts.map(toast => [toast.text, toast.tone, toast.action?.kind ?? null])).toEqual([["saved:First video", "confirmation", "undo"]])
  expect(h.states.at(-1)).toEqual({ kind: "added", playlists: [music] })
})

test("an auto-add into a Missing playlist toasts with Settings, which opens Settings at that playlist (YT-ADD-29)", async () => {
  const h = world()
  h.respond(() => ({ kind: "report", feedback: true, undo: null, titles: { [music]: "Music videos" }, outcomes: { [music]: { kind: "failed", failure: "missing" } },
    toast: { tone: "failure", auto: false, message: { kind: "failed", failure: "missing", playlists: [music] }, action: { kind: "settings", feature: "auto-add", playlist: music },
      remember: { tab: [], session: [] } } }))
  h.navigate(first, "First video")
  await h.play(0, 60)
  const action = h.toasts[0]?.action
  expect(action?.kind).toBe("settings")
  await action?.run()
  expect(h.settings).toEqual([{ feature: "auto-add", playlist: music }])
})

test("the playback shows as This video: its title, share watched, and each playlist's goal and outcome, and nothing once the feature stops", async () => {
  const h = world(wwwView({ playlists: [{ pl: music, takes: "videos" }, { pl: talks, takes: "both", pct: 90 }] }))
  h.navigate(first, "First video")
  await h.play(0, 30)
  expect(h.views.at(-1)).toEqual({ video: first, title: "First video", state: { kind: "counting", goal: 50, watched: 30 }, watched: 30, channel: null,
    playlists: [{ pl: music, pct: 50, outcome: "waiting" }, { pl: talks, pct: 90, outcome: "waiting" }] })
  await h.play(31, 60)
  expect(h.views.at(-1)?.playlists).toEqual([{ pl: music, pct: 50, outcome: "added" }, { pl: talks, pct: 90, outcome: "waiting" }])
  h.scope.dispose()
  expect(h.views.at(-1)).toBeNull()
})

test("an auto-add whose toast offers no Undo releases its handle at once; one with Undo leaves it to the toast", async () => {
  const quiet = world()
  quiet.respond(request => ({ kind: "report", toast: null, feedback: false, undo: { kind: "add", id: "g:quiet" }, titles: {},
    outcomes: Object.fromEntries((request.via === "auto-add" ? request.playlists : []).map(pl => [pl, { kind: "added" }])) }))
  quiet.navigate(first, "First video")
  await quiet.play(0, 60)
  expect(quiet.toasts).toEqual([])
  expect(quiet.released).toEqual(["g:quiet"])
  const shown = world()
  shown.navigate(first, "First video")
  await shown.play(0, 60)
  expect(shown.released).toEqual([])
  shown.toasts[0]?.action?.release?.()
  expect(shown.released).toEqual(["g:1"])
})

test("a read of a listed channel with a new title sends the label back once; an unchanged one sends nothing (YT-CF-10)", async () => {
  const channel = "UCAAAAAAAAAAAAAAAAAAAAAA"
  const filtered = (title: string) => ({ ...wwwView(), filters: [{ playlist: music, state: { kind: "value", filter: { mode: "deny", on: true, channels: [[channel, title, "@lofi"]] } } }] }) as SiteView<"www">
  const cases: [string, unknown[]][] = [["Old name", [[channel, "Lofi Girl", "@lofi"]]], ["Lofi Girl", []]]
  for (const [stored, expected] of cases) {
    const h = world(filtered(stored), { channel: { channelId: channel, title: "Lofi Girl", handle: "@lofi" } })
    h.navigate(first, "First video")
    await h.play(0, 60)
    expect(h.adds[0]).toMatchObject({ channel })
    expect(h.labels).toEqual(expected)
  }
})

test("after an add the tab tells the background once when its video changes in-app, so the toolbar tick clears", async () => {
  const h = world()
  h.navigate(first)
  await h.play(0, 52)
  h.navigate(first, "First video, renamed")
  h.navigate(first, "First video", "other")
  expect(h.changed).toHaveLength(0)
  h.navigate("secondvideo" as VideoId, "Second video")
  h.navigate("thirdvideo0" as VideoId, "Third video")
  expect(h.changed).toHaveLength(1)
  const off = world(wwwView())
  off.publish({ ...wwwView(), features: [{ id: "auto-add", options: { on: true, feedback: true, pct: 50, toolbarTick: false, toolbarPaused: true } }] } as SiteView<"www">)
  off.navigate(first)
  await off.play(0, 52)
  off.navigate("secondvideo" as VideoId, "Second video")
  expect([off.adds.length, off.changed.length]).toEqual([1, 0])
})

test("once auto-add has run the stored progress is dropped and the player is no longer followed", async () => {
  const h = world()
  h.navigate(first)
  await h.play(0, 52)
  expect(h.saves.at(-1)).toEqual({ video: first, progress: { len: 100, parts: [] } })
  expect(h.watching).toBe(false)
})

test("seeking ahead never counts towards the goal", async () => {
  const h = world()
  h.navigate(first)
  await h.play(0, 10)
  await h.play(70, 95)
  expect(h.adds).toEqual([])
  expect(h.states.at(-1)).toEqual({ kind: "counting", goal: 50, watched: 35 })
})

test("progress from an earlier visit adds up with this one", async () => {
  const h = world(wwwView(), { stored: { len: 100, parts: [[0, 40]] } })
  h.navigate(first)
  await h.play(40, 50)
  expect(h.adds.map(add => add.video)).toEqual([first])
})

test("nothing counts while YouTube's Continue watching? prompt shows", async () => {
  const container = () => {
    const popup = document.createElement("ytd-popup-container")
    const dialog = document.createElement("tp-yt-paper-dialog")
    dialog.append(document.createElement("yt-confirm-dialog-renderer"))
    popup.append(dialog)
    document.body.append(popup)
  }
  const h = world()
  container()
  h.navigate(second)
  h.navigate(first)
  await h.play(0, 80)
  expect(h.adds).toEqual([])
})

test("a private tab keeps progress for the tab's life and never sends it", async () => {
  const h = world(wwwView({ private: true }))
  h.navigate(first)
  await h.play(0, 30)
  h.navigate(second)
  h.navigate(first)
  await h.play(30, 50)
  expect(h.saves).toEqual([])
  expect(h.adds.map(add => add.video)).toEqual([first])
})

test("a playback that can't be measured warns once per browser session and adds nothing", async () => {
  const h = world()
  h.navigate(first, "Stitched")
  await h.play(0, 80, { listedLength: 130 })
  expect(h.toasts.map(toast => [toast.text, toast.tone])).toEqual([["cant-measure:Stitched", "failure"]])
  expect(h.states.at(-1)).toEqual({ kind: "cant-measure" })
  h.navigate(second, "Another")
  h.navigate(first, "Stitched")
  await h.play(0, 5, { listedLength: 130 })
  expect(h.toasts).toHaveLength(1)
  expect(h.logs).toEqual(["cant-measure:Stitched"])
  expect(h.adds).toEqual([])
})

test("a session skip keeps counting, and removing it adds at once from the progress so far", async () => {
  const h = world(wwwView({ skip: "all" }))
  h.navigate(first)
  await h.play(0, 70)
  expect(h.adds).toEqual([])
  expect(h.states.at(-1)).toEqual({ kind: "skipped" })
  h.publish(wwwView())
  await settle()
  expect(h.adds.map(add => add.via === "auto-add" ? add.playlists : [])).toEqual([[music]])
})

test("each playlist fires at its own goal, and lowering a goal below the progress adds at once", async () => {
  const h = world(wwwView({ playlists: [{ pl: music, takes: "videos", pct: 20 }, { pl: talks, takes: "both", pct: 90 }] }))
  h.navigate(first)
  await h.play(0, 30)
  expect(h.adds.map(add => add.via === "auto-add" ? add.playlists : [])).toEqual([[music]])
  expect(h.states.at(-1)).toEqual({ kind: "partly", added: [music], pending: [talks], goal: 90 })
  h.publish(wwwView({ playlists: [{ pl: music, takes: "videos", pct: 20 }, { pl: talks, takes: "both", pct: 25 }] }))
  await settle()
  expect(h.adds.map(add => add.via === "auto-add" ? add.playlists : [])).toEqual([[music], [talks]])
})

test("Pause and a missing Shorts playlist leave the player alone", async () => {
  const paused = world(wwwView({ paused: true }))
  paused.navigate(first)
  expect(paused.watching).toBe(false)
  expect(paused.states.at(-1)).toEqual({ kind: "paused" })
  const shorts = world()
  shorts.navigate(first, "A Short", "shorts")
  expect(shorts.watching).toBe(false)
})

test("checkpoints: a pause saves at most once a minute, plain playback every 5 minutes, and leaving always", async () => {
  const h = world(wwwView({ pct: 100 }))
  const long = { len: 1000, listedLength: 1000 }
  h.navigate(first)
  await h.play(0, 10, long)
  h.reading(10, { ...long, playing: false })
  await settle()
  expect(h.saves).toEqual([])
  h.later(SAVE_AFTER_PAUSE_MS)
  h.reading(10, { ...long, playing: false })
  await settle()
  expect(h.saves).toEqual([{ video: first, progress: { len: 1000, parts: [[0, 10]] } }])
  h.later(SAVE_AFTER_PAUSE_MS)
  h.reading(10, { ...long, playing: false })
  await settle()
  expect(h.saves).toHaveLength(1)
  await h.play(10, 10 + SAVE_WHILE_PLAYING_MS / 1000 + 1, long)
  expect(h.saves).toHaveLength(2)
  expect(h.saves[1]?.progress.parts[0]?.[1]).toBeGreaterThanOrEqual(SAVE_WHILE_PLAYING_MS / 1000)
  h.navigate(second)
  expect(h.saves).toHaveLength(3)
})
