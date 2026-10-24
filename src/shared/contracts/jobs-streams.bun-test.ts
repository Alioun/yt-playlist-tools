import { describe, expect, test } from "bun:test"
import {
  isRouteId, isSetVideoId, isQueueListId, isQueueItemId, isPageType, isMusicType,
  isQueueInsertEndpoint, isLikeEndpoint, isLibraryEndpoint, isNavigationEndpoint,
  isAddToPlaylistEndpoint, isRemoveFromQueueEndpoint, isVideoInfo, isNowPlaying,
  isItemInfo, isLikeState, isJob, isJobDataFor, isJobResultFor, isJobInvocation,
  isStreamData, supportsJob, supportsStream
} from "./index"
import type { JobId, Job, JobOf, JobData, Stream, StreamData, ItemInfo, PlayerData } from "./index"
import { isPageJobDataFor, isPageJobResultFor } from "./page"
import { isVideoId, isPlaylistId, isChannelId, isAccountKey } from "../model/validation"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error("Invalid synthetic fixture")
  return value
}
function roundTrip(value: unknown): unknown { return JSON.parse(JSON.stringify(value)) }
const video = checked(isVideoId, "synthetic01")
const video2 = checked(isVideoId, "synthetic02")
const playlist = checked(isPlaylistId, "WL")
const channel = checked(isChannelId, `UC${"a".repeat(22)}`)
const acct = checked(isAccountKey, "synthetic_acct01")
const route = checked(isRouteId, "synthetic-test-route-unregistered")
const setId = checked(isSetVideoId, "synthetic-entry")
const listId = checked(isQueueListId, "synthetic-list")
const queueId = checked(isQueueItemId, "synthetic-queue-entry")
const numericId = checked(isQueueItemId, 7)
const pageType = checked(isPageType, "synthetic-page-type")
const musicType = checked(isMusicType, "synthetic-music-type")
const next = checked(isQueueInsertEndpoint, {
  queueAddEndpoint: { queueInsertPosition: "INSERT_AFTER_CURRENT_VIDEO", queueTarget: { videoId: video }, onEmptyQueue: { native: true } },
  clickTrackingParams: "synthetic", extraNative: [null, { preserved: true }]
})
const end = checked(isQueueInsertEndpoint, {
  queueAddEndpoint: { queueInsertPosition: "INSERT_AT_END", queueTarget: { playlistId: playlist, native: 1 } }
})
const like = checked(isLikeEndpoint, { likeEndpoint: { nativeAction: "synthetic" } })
const library = checked(isLibraryEndpoint, { feedbackEndpoint: { nativeAction: "synthetic" } })
const mix = checked(isNavigationEndpoint, { watchEndpoint: { videoId: video, native: { opaque: true } } })
const browse = checked(isNavigationEndpoint, { browseEndpoint: { browseId: "synthetic-browse" } })
const save = checked(isAddToPlaylistEndpoint, { addToPlaylistEndpoint: { native: true } })
const remove = checked(isRemoveFromQueueEndpoint, { removeFromQueueEndpoint: { native: true } })
const videoInfo = { videoId: video, title: "", length: null, kind: "video" } satisfies JobData<JobOf<"videoInfo">>
const song = { videoId: video, title: "Synthetic song", artist: "", album: "", artwork: "synthetic-artwork", pos: 1.5, len: null }
const item = {
  kind: "song", type: { kind: "music-video", musicVideoType: musicType }, title: "",
  videoId: video, queueItemId: queueId, count: 0, selected: true, autoplay: false,
  hasOwnLike: false, likeState: null,
  endpoints: { next, end, remove, save, like, library: { inLibrary: true, endpoint: library }, mix, album: browse, artist: browse }
} satisfies ItemInfo
const fixtures = {
  account: { job: { kind: "account" }, data: { signedIn: true, acct } },
  accountLabel: { job: { kind: "accountLabel" }, data: { name: "", handle: "", avatar: "synthetic-avatar" } },
  membership: { job: { kind: "membership", videoId: video }, data: [{ id: playlist, title: "", privacy: "PRIVATE", count: 0, contains: true }] },
  playlists: { job: { kind: "playlists" }, data: [{ id: playlist, title: "", thumb: "synthetic-thumb", count: 0 }] },
  add: { job: { kind: "add", playlistId: playlist, videoId: video }, data: { setVideoId: setId } },
  remove: { job: { kind: "remove", playlistId: playlist, setVideoId: setId }, data: null },
  addBatch: { job: { kind: "addBatch", playlistId: playlist, videoIds: [video, video2] }, data: {
    results: [{ videoId: video, setVideoId: setId }, { videoId: video2, failure: { ok: false, reason: "failed", http: 429, status: "synthetic" } }]
  } },
  removeBatch: { job: { kind: "removeBatch", playlistId: playlist, setVideoIds: [setId] }, data: { removed: 1 } },
  save: { job: { kind: "save", playlistId: playlist, videoId: video }, data: { setVideoId: setId } },
  unsave: { job: { kind: "unsave", playlistId: playlist, setVideoId: setId }, data: null },
  create: { job: { kind: "create", title: "", privacy: "UNLISTED", videoId: video }, data: { playlistId: playlist } },
  channelOf: { job: { kind: "channelOf", videoId: video }, data: { channelId: null } },
  resolveChannel: { job: { kind: "resolveChannel", input: "synthetic free text" }, data: { channelId: channel, title: "", handle: "" } },
  videoInfo: { job: { kind: "videoInfo" }, data: videoInfo },
  queueAdd: { job: { kind: "queueAdd" }, data: { confirmed: false, quiet: true } },
  queueUndo: { job: { kind: "queueUndo", listId, setVideoId: setId }, data: null },
  queueAddList: { job: { kind: "queueAddList", videoIds: [video, video2] }, data: { confirmed: false, count: 1 } },
  openCardMenu: { job: { kind: "openCardMenu" }, data: null },
  itemInfo: { job: { kind: "itemInfo" }, data: item },
  queueInsert: { job: { kind: "queueInsert", endpoint: next, position: "next" }, data: { ids: [queueId, numericId] } },
  queueRemove: { job: { kind: "queueRemove", id: queueId }, data: { index: 0 } },
  queueRemoveIds: { job: { kind: "queueRemoveIds", ids: [queueId, numericId] }, data: { removed: 2 } },
  queueMove: { job: { kind: "queueMove", id: numericId, to: "next" }, data: { from: 2 } },
  queueReinsert: { job: { kind: "queueReinsert", videoId: video, index: 0 }, data: { id: numericId } },
  like: { job: { kind: "like", endpoint: like }, data: null },
  library: { job: { kind: "library", endpoint: library }, data: { inLibrary: false } },
  navigate: { job: { kind: "navigate", endpoint: browse }, data: { navigated: true } },
  nowPlaying: { job: { kind: "nowPlaying" }, data: song },
  castState: { job: { kind: "castState" }, data: { casting: false } }
} satisfies { [K in JobId]: { job: JobOf<K>; data: JobData<JobOf<K>> } }
const player = {
  ad: false, at: 10.5, player: "watch", videoId: video, pos: 5.25, len: 10, listedLength: null,
  rate: 1.25, playing: true, seeking: false, content: "video", isPostLiveDvr: false,
  isLive: false, isUpcoming: false, isLiveContent: false
} satisfies PlayerData
const streamFixtures = {
  player,
  nav: { pageType, video: videoInfo, navigation: { kind: "watch", videoId: video2 } },
  nowPlaying: song,
  queue: { ids: [queueId, numericId] }
} satisfies { [S in Stream]: StreamData<S> }
function success(data: unknown): unknown { return { ok: true, data, route } }

for (const [kind, fixture] of Object.entries(fixtures)) {
  describe(kind, () => {
    test("accepts the complete public job and its correlated result before and after JSON", () => {
      expect(isJob(fixture.job)).toBe(true)
      expect(isJob(roundTrip(fixture.job))).toBe(true)
      expect(isJobDataFor(fixture.job, fixture.data)).toBe(true)
      expect(isJobResultFor(fixture.job, success(fixture.data))).toBe(true)
      expect(isJobResultFor(fixture.job, roundTrip(success(fixture.data)))).toBe(true)
      if (kind !== "account") expect(isPageJobResultFor(fixture.job, success(fixture.data))).toBe(true)
    })
    test("rejects unknown, missing, extra and non-JSON input fields", () => {
      expect(isJob({ ...fixture.job, kind: "unknown" })).toBe(false)
      expect(isJob({ ...fixture.job, extra: true })).toBe(false)
      expect(isJob({ ...fixture.job, target: { nodeType: 1 } })).toBe(false)
      expect(isJob({ ...fixture.job, target: new Date() })).toBe(false)
      for (const [key, field] of Object.entries(fixture.job)) {
        const invalidRepresentations: Record<string, unknown> = {
          kind: "unknown", videoId: "bad", playlistId: "", setVideoId: "", listId: "", id: -1,
          videoIds: ["bad"], setVideoIds: [""], ids: [-1], endpoint: { unknownEndpoint: { native: true } },
          privacy: "unknown", position: "unknown", to: -1, index: 0.5, title: false, input: false
        }
        expect(isJob({ ...fixture.job, [key]: invalidRepresentations[key] })).toBe(false)
        const missing: Record<string, unknown> = { ...fixture.job }
        delete missing[key]
        if (!(kind === "create" && key === "videoId")) expect(isJob(missing)).toBe(false)
        expect(isJob({ ...fixture.job, [key]: undefined })).toBe(false)
        expect(isJob({ ...fixture.job, [key]: Array.isArray(field) ? {} : [] })).toBe(false)
      }
    })
    test("requires an exact success envelope and accepts only C0 failures", () => {
      for (const raw of [
        { ok: true, data: fixture.data }, { ok: true, route }, { ok: 1, data: fixture.data, route },
        { ok: true, data: fixture.data, route: "" }, { ok: true, data: { unrelated: true }, route },
        { ok: true, data: fixture.data, route, reason: "failed" },
        { ok: true, data: undefined, route }, { ok: false, reason: "unknown" },
        { ok: false, reason: "failed", data: fixture.data }, { ok: false, reason: "failed", http: 99 }
      ]) expect(isJobResultFor(fixture.job, raw)).toBe(false)
      for (const reason of ["signedOut", "accountChanged", "unavailable", "unconfirmed", "failed"]) {
        expect(isJobResultFor(fixture.job, { ok: false, reason })).toBe(true)
        expect(isPageJobResultFor(fixture.job, { ok: false, reason })).toBe(true)
      }
    })
  })
}
for (const [stream, data] of Object.entries(streamFixtures)) {
  test(`stream ${stream} accepts the public data and its JSON round trip`, () => {
    const id = checked((v): v is Stream => v === "player" || v === "nav" || v === "nowPlaying" || v === "queue", stream)
    expect(isStreamData(id, data)).toBe(true)
    expect(isStreamData(id, roundTrip(data))).toBe(true)
    expect(isStreamData(id, { ...data, extra: true })).toBe(false)
    expect(isStreamData(id, { ok: true, data, route })).toBe(false)
  })
}

describe("pending job correlation and bounded batches", () => {
  test("unrelated successful data cannot resolve a pending job", () => {
    expect(isJobResultFor(fixtures.membership.job, success({ ids: [queueId] }))).toBe(false)
    expect(isJobResultFor(fixtures.queueInsert.job, success(fixtures.membership.data))).toBe(false)
    expect(isJobResultFor(fixtures.account.job, success(song))).toBe(false)
  })
  test("enforces add/remove batch limits without a universal array limit", () => {
    for (const size of [0, 1, 50, 51]) {
      expect(isJob({ kind: "addBatch", playlistId: playlist, videoIds: Array(size).fill(video) })).toBe(size >= 1 && size <= 50)
      expect(isJob({ kind: "removeBatch", playlistId: playlist, setVideoIds: Array(size).fill(setId) })).toBe(size >= 1 && size <= 50)
    }
    for (const size of [0, 1, 199, 200]) {
      expect(isJob({ kind: "queueAddList", videoIds: Array(size).fill(video) })).toBe(size >= 1 && size <= 199)
    }
    expect(isJob({ kind: "queueRemoveIds", ids: [] })).toBe(true)
    expect(isJob({ kind: "queueRemoveIds", ids: Array(250).fill(queueId) })).toBe(true)
    expect(isJobDataFor({ kind: "queueRemoveIds", ids: [] }, { removed: 0 })).toBe(true)
  })
  test("requires one ordered exclusive add result per submitted occurrence", () => {
    const { job, data } = fixtures.addBatch
    expect(isJobDataFor(job, data)).toBe(true)
    for (const results of [
      [...data.results].reverse(), data.results.slice(1), [...data.results, data.results[0]],
      [data.results[0], data.results[0]], [{ videoId: video2, setVideoId: setId }, data.results[1]],
      [{ videoId: video, setVideoId: setId, failure: { ok: false, reason: "failed" } }, data.results[1]],
      [{ videoId: video }, data.results[1]], [{ videoId: video, failure: { ok: true } }, data.results[1]]
    ]) expect(isJobDataFor(job, { results })).toBe(false)
    const repeated = { kind: "addBatch", playlistId: playlist, videoIds: [video, video, video2] } satisfies Job
    expect(isJobDataFor(repeated, { results: [data.results[0], data.results[0], data.results[1]] })).toBe(true)
    expect(isJobDataFor(repeated, data)).toBe(false)
    expect(isJobResultFor(job, { ok: false, reason: "failed" })).toBe(true)
    const fifty = { kind: "addBatch", playlistId: playlist, videoIds: Array(50).fill(video) } satisfies Job
    expect(isJobDataFor(fifty, { results: Array(50).fill(data.results[0]) })).toBe(true)
  })
  test("bounds removed and count against the pending input", () => {
    for (const [count, bounded, complete] of [
      [0, true, false], [1, true, false], [2, true, true], [3, false, false],
      [-1, false, false], [0.5, false, false], [NaN, false, false], [Infinity, false, false], [-Infinity, false, false]
    ] satisfies [number, boolean, boolean][]) {
      expect(isJobDataFor(fixtures.queueRemoveIds.job, { removed: count })).toBe(bounded)
      expect(isJobDataFor(fixtures.queueAddList.job, { confirmed: false, count })).toBe(bounded)
      expect(isJobDataFor(fixtures.queueAddList.job, { confirmed: true, count })).toBe(complete)
    }
    for (const count of [0, 1, 2, -1, 0.5]) {
      expect(isJobDataFor(fixtures.removeBatch.job, { removed: count })).toBe(count === 0 || count === 1)
    }
    const fifty = { kind: "removeBatch", playlistId: playlist, setVideoIds: Array(50).fill(setId) } satisfies Job
    expect(isJobDataFor(fifty, { removed: 50 })).toBe(true)
    expect(isJobDataFor(fifty, { removed: 51 })).toBe(false)
  })
  test("represents no-data success as an explicit null", () => {
    for (const job of [fixtures.remove.job, fixtures.unsave.job, fixtures.queueUndo.job, fixtures.openCardMenu.job, fixtures.like.job]) {
      expect(isJobResultFor(job, roundTrip(success(null)))).toBe(true)
      for (const data of [undefined, {}, false, 0, ""]) expect(isJobResultFor(job, success(data))).toBe(false)
      expect(isJobResultFor(job, { ok: true, route })).toBe(false)
    }
  })
  test("preserves unconfirmed queue results and complete undo pairs", () => {
    const job = fixtures.queueAdd.job
    for (const quiet of [true, false]) {
      expect(isJobDataFor(job, { confirmed: false, quiet })).toBe(true)
      expect(isJobDataFor(job, { confirmed: true, quiet })).toBe(true)
      expect(isJobDataFor(job, { confirmed: true, quiet, undo: { listId, setVideoId: setId } })).toBe(true)
      expect(isJobDataFor(job, { confirmed: false, quiet, undo: { listId, setVideoId: setId } })).toBe(false)
      expect(isJobDataFor(job, { confirmed: true, quiet, undo: { listId } })).toBe(false)
      expect(isJobDataFor(job, { confirmed: true, quiet, undo: { setVideoId: setId } })).toBe(false)
    }
    expect(isJobDataFor(fixtures.navigate.job, { navigated: false })).toBe(false)
  })
})

describe("opaque identifiers and native command slots", () => {
  test("keeps source scalar forms and validates only representations", () => {
    expect(isRouteId("unregistered-and-unknown")).toBe(true)
    for (const guard of [isRouteId, isSetVideoId, isQueueListId, isPageType, isMusicType]) {
      for (const value of ["", 1, null, {}, []]) expect(guard(value)).toBe(false)
      expect(guard("synthetic-opaque")).toBe(true)
    }
    for (const value of ["entry", 0, 1, Number.MAX_SAFE_INTEGER]) {
      expect(isQueueItemId(value)).toBe(true)
      expect(roundTrip(value)).toBe(value)
    }
    for (const value of ["", -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(isQueueItemId(value)).toBe(false)
    for (const job of [
      { kind: "membership", videoId: "bad" }, { kind: "add", playlistId: "", videoId: video },
      { kind: "queueUndo", listId: "", setVideoId: setId }, { kind: "remove", playlistId: playlist, setVideoId: "" },
      { kind: "queueMove", id: -1, to: "next" }, { kind: "queueMove", id: queueId, to: 0.5 },
      { kind: "queueReinsert", videoId: video, index: -1 }
    ]) expect(isJob(job)).toBe(false)
    expect(isJob({ kind: "queueMove", id: queueId, to: 0 })).toBe(true)
    expect(isJob({ kind: "queueMove", id: queueId, to: "end" })).toBe(true)
  })
  test("preserves native JSON extras while rejecting wrong and ambiguous families", () => {
    const cases = [
      [isQueueInsertEndpoint, next, "queueAddEndpoint"], [isLikeEndpoint, like, "likeEndpoint"],
      [isLibraryEndpoint, library, "feedbackEndpoint"], [isNavigationEndpoint, browse, "browseEndpoint"],
      [isAddToPlaylistEndpoint, save, "addToPlaylistEndpoint"], [isRemoveFromQueueEndpoint, remove, "removeFromQueueEndpoint"]
    ] satisfies [(v: unknown) => boolean, unknown, string][]
    for (const [guard, valid, family] of cases) {
      expect(guard(valid)).toBe(true)
      expect(guard(roundTrip(valid))).toBe(true)
      for (const value of ["native", [], {}, { [family]: {} }, { [family]: [] }, { unknownEndpoint: { native: true } },
        { [family]: { native: true }, extra: () => 1 }, { [family]: { native: new Date() } }]) expect(guard(value)).toBe(false)
      expect(guard({ ...checked((v): v is Record<string, unknown> => typeof v === "object" && v !== null, valid), extra: { preserved: [1, null, true] } })).toBe(true)
    }
    expect(isLikeEndpoint({ ...like, feedbackEndpoint: { native: true } })).toBe(false)
    expect(isQueueInsertEndpoint({ ...next, watchEndpoint: { videoId: video } })).toBe(false)
    expect(isLibraryEndpoint(like)).toBe(true)
    expect(isNavigationEndpoint({ watchEndpoint: { playlistId: playlist } })).toBe(true)
    expect(isNavigationEndpoint({ watchEndpoint: { videoId: video, playlistId: playlist } })).toBe(true)
    expect(isNavigationEndpoint({ watchPlaylistEndpoint: { playlistId: playlist, opaque: 1 } })).toBe(true)
    expect(isNavigationEndpoint({ browseEndpoint: { browseId: "" } })).toBe(false)
    expect(isNavigationEndpoint({ watchPlaylistEndpoint: { videoId: video } })).toBe(false)
    expect(isQueueInsertEndpoint({ queueAddEndpoint: { queueInsertPosition: "INSERT_AT_END", queueTarget: { videoId: video, playlistId: playlist } } })).toBe(false)
    expect(isQueueInsertEndpoint({ queueAddEndpoint: { queueInsertPosition: "INSERT_AT_END", queueTarget: { videoId: "bad" } } })).toBe(false)
    expect(roundTrip(next)).toEqual(next)
  })
  test("checks native insert positions and navigation slot families", () => {
    expect(isJob({ kind: "queueInsert", endpoint: next, position: "end" })).toBe(false)
    expect(isJob({ kind: "queueInsert", endpoint: end, position: "next" })).toBe(false)
    expect(isJob({ kind: "queueInsert", endpoint: end, position: "end" })).toBe(true)
    expect(isJob({ kind: "queueInsert", endpoint: like, position: "next" })).toBe(false)
    for (const endpoints of [{ next: end }, { end: next }, { mix: browse }, { album: mix }, { artist: mix }]) {
      expect(isItemInfo({ ...item, endpoints })).toBe(false)
    }
    expect(isItemInfo({ ...item, endpoints: { mix: { watchPlaylistEndpoint: { playlistId: playlist } } } })).toBe(true)
  })
})

describe("media facts without invented capabilities", () => {
  test("preserves source labels, states, counts and optional menu capabilities", () => {
    for (const likeState of [null, "liked", "not-liked", "disliked"]) expect(isItemInfo({ ...item, likeState })).toBe(true)
    for (const state of ["liked", "not-liked", "disliked"]) expect(isLikeState(state)).toBe(true)
    expect(isLikeState(false)).toBe(false)
    for (const kind of ["song", "video", "episode", "upload", "album", "playlist", "artist", "other"]) {
      expect(isItemInfo({ kind, type: { kind: "unclassified" }, title: "", selected: false, autoplay: true, hasOwnLike: true, likeState: null, endpoints: {} })).toBe(true)
    }
    expect(isItemInfo({ ...item, type: { kind: "browse", pageType } })).toBe(true)
    expect(isItemInfo({ ...item, endpoints: { library: { endpoint: library } } })).toBe(false)
    expect(isItemInfo({ ...item, endpoints: { library: { inLibrary: true } } })).toBe(false)
    expect(isItemInfo({ ...item, endpoints: { library } })).toBe(false)
    const { queueItemId: omitted, ...withoutQueue } = item
    expect(omitted).toBe(queueId)
    expect(isItemInfo({ ...withoutQueue, selected: false, endpoints: {} })).toBe(true)
    expect(isItemInfo({ ...withoutQueue, selected: true, endpoints: {} })).toBe(false)
    expect(isItemInfo({ ...withoutQueue, selected: false, endpoints: { remove } })).toBe(false)
    for (const count of [-1, 0.1, Infinity]) expect(isItemInfo({ ...item, count })).toBe(false)
    expect(isItemInfo({ ...item, count: undefined })).toBe(false)
    expect(isItemInfo({ ...item, type: { kind: "unclassified", pageType } })).toBe(false)
    expect(isJobDataFor(fixtures.channelOf.job, { channelId: channel, title: "", handle: "" })).toBe(true)
    expect(isJobDataFor(fixtures.channelOf.job, { channelId: null, title: "invented" })).toBe(false)
  })
  test("checks row metadata, account labels, and nullable channel branches exactly", () => {
    for (const [count, valid] of [
      [0, true], [1, true], [0.5, false], [-1, false], [Number.MAX_SAFE_INTEGER + 1, false], [NaN, false], [Infinity, false]
    ] satisfies [number, boolean][]) {
      expect(isJobDataFor(fixtures.membership.job, [{ id: playlist, title: "", contains: false, count }])).toBe(valid)
      expect(isJobDataFor(fixtures.playlists.job, [{ id: playlist, title: "", count }])).toBe(valid)
    }
    expect(isJobDataFor(fixtures.membership.job, [])).toBe(true)
    expect(isJobDataFor(fixtures.playlists.job, [])).toBe(true)
    expect(isJobDataFor(fixtures.accountLabel.job, { name: "" })).toBe(true)
    for (const data of [{ name: "", avatar: "" }, { name: "", handle: null }, { name: "", extra: true }]) {
      expect(isJobDataFor(fixtures.accountLabel.job, data)).toBe(false)
    }
    expect(isJobDataFor(fixtures.playlists.job, [{ id: playlist, title: "", thumb: "" }])).toBe(false)
    expect(isJobDataFor(fixtures.membership.job, [{ id: playlist, title: "", contains: false, privacy: "unknown" }])).toBe(false)
    expect(isJobDataFor(fixtures.channelOf.job, { channelId: "bad" })).toBe(false)
    expect(isJobDataFor(fixtures.resolveChannel.job, { channelId: channel })).toBe(false)
  })
  test("keeps ad interruptions free of media fields and requires every content fact", () => {
    const ad = { ad: true, at: 0, player: "shorts" }
    expect(isStreamData("player", ad)).toBe(true)
    for (const [key, value] of [["videoId", video], ["pos", 0], ["len", null], ["playing", false]]) {
      expect(isStreamData("player", { ...ad, [String(key)]: value })).toBe(false)
    }
    for (const key of Object.keys(player)) {
      const missing: Record<string, unknown> = { ...player }
      delete missing[key]
      expect(isStreamData("player", missing)).toBe(false)
    }
    for (const facts of [
      {}, { isLive: true, isLiveContent: true }, { isLive: true, isLiveContent: false },
      { isUpcoming: true }, { isPostLiveDvr: true }, { isLiveContent: true, len: 120 },
      { content: "clip" }, { content: "made-for-kids" }, { player: "shorts" }
    ]) expect(isStreamData("player", { ...player, ...facts })).toBe(true)
    expect(isStreamData("player", { ...player, player: "preview" })).toBe(false)
  })
  test("validates seconds, finite positions, multipliers and nullable positive durations", () => {
    for (const [value, nonnegative, positive] of [
      [-1, false, false], [0, true, false], [0.25, true, true], [2, true, true],
      [NaN, false, false], [Infinity, false, false], [-Infinity, false, false], [undefined, false, false]
    ] satisfies [number | undefined, boolean, boolean][]) {
      for (const field of ["at", "pos"]) expect(isStreamData("player", { ...player, [field]: value })).toBe(nonnegative)
      expect(isNowPlaying({ ...song, pos: value })).toBe(nonnegative)
      expect(isStreamData("player", { ...player, rate: value })).toBe(positive)
      for (const field of ["len", "listedLength"]) expect(isStreamData("player", { ...player, [field]: value })).toBe(positive)
      expect(isNowPlaying({ ...song, len: value })).toBe(positive)
      expect(isVideoInfo({ ...videoInfo, length: value })).toBe(positive)
    }
    for (const at of [-1, NaN, Infinity, -Infinity]) expect(isStreamData("player", { ad: true, at, player: "watch" })).toBe(false)
    expect(isStreamData("player", { ...player, len: null, listedLength: null, pos: 999, rate: 1000 })).toBe(true)
    expect(isNowPlaying({ ...song, len: 1, pos: 999 })).toBe(true)
    expect(isVideoInfo(roundTrip(videoInfo))).toBe(true)
    expect(isNowPlaying(roundTrip(song))).toBe(true)
    expect(isStreamData("nowPlaying", null)).toBe(true)
    expect(isJobDataFor(fixtures.nowPlaying.job, null)).toBe(true)
    expect(isJobResultFor(fixtures.nowPlaying.job, roundTrip(success(null)))).toBe(true)
    expect(isNowPlaying(null)).toBe(false)
    expect(isNowPlaying({ ...song, artwork: "" })).toBe(false)
  })
  test("separates navigation identity from settling video and miniplayer content", () => {
    expect(isStreamData("nav", { pageType, video: videoInfo, navigation: { kind: "watch", videoId: video2 } })).toBe(true)
    expect(isStreamData("nav", { pageType, video: videoInfo, navigation: { kind: "shorts", videoId: video2 } })).toBe(true)
    expect(isStreamData("nav", { pageType, video: videoInfo, navigation: { kind: "other" } })).toBe(true)
    expect(isStreamData("nav", { pageType, video: null, navigation: { kind: "other" } })).toBe(true)
    expect(isStreamData("nav", { pageType, video: null, navigation: { kind: "other", videoId: video } })).toBe(false)
    expect(isStreamData("queue", { ids: [] })).toBe(true)
    expect(isStreamData("queue", { ids: [7, "7"] })).toBe(true)
    expect(isStreamData("queue", { ids: [queueId, queueId] })).toBe(false)
    expect(isJobDataFor(fixtures.queueInsert.job, { ids: [] })).toBe(false)
    expect(isJobDataFor(fixtures.queueInsert.job, { ids: [numericId, numericId] })).toBe(false)
  })
})

describe("account boundary and catalogue support", () => {
  test("requires a pin on precisely the twelve account jobs", () => {
    const accountJobs = new Set(["accountLabel", "membership", "playlists", "add", "remove", "addBatch", "removeBatch", "save", "unsave", "create", "like", "library"])
    for (const [kind, { job }] of Object.entries(fixtures)) {
      expect(isJobInvocation({ job, acct })).toBe(accountJobs.has(kind))
      expect(isJobInvocation({ job })).toBe(!accountJobs.has(kind))
      expect(isJobInvocation({ job, acct: "too-short" })).toBe(false)
      expect(isJobInvocation({ job, acct, settings: {} })).toBe(false)
      expect(isJob({ ...job, acct })).toBe(false)
    }
  })
  test("isolates synthetic raw identity and projects only an account key", () => {
    const job = fixtures.account.job
    const raw = { signedIn: true, datasyncId: "synthetic-raw-identity-only" }
    const safe = { signedIn: true, acct }
    expect(isPageJobDataFor(job, raw)).toBe(true)
    expect(isPageJobResultFor(job, roundTrip(success(raw)))).toBe(true)
    expect(isJobDataFor(job, raw)).toBe(false)
    expect(isJobResultFor(job, success(raw))).toBe(false)
    expect(isJobResultFor(job, success(safe))).toBe(true)
    expect(isPageJobResultFor(job, success(safe))).toBe(false)
    expect(isJobResultFor(job, success({ ...safe, datasyncId: raw.datasyncId }))).toBe(false)
    expect(isPageJobResultFor(job, success({ ...raw, acct }))).toBe(false)
    expect(isPageJobDataFor(job, { signedIn: false, datasyncId: null })).toBe(true)
    expect(isJobDataFor(job, { signedIn: false, acct: null })).toBe(true)
    expect(isPageJobDataFor(job, { signedIn: false, datasyncId: "synthetic-visitor" })).toBe(false)
    expect(isPageJobDataFor(job, { signedIn: true, datasyncId: "" })).toBe(false)
    expect(isPageJobDataFor(job, { signedIn: true, datasyncId: null })).toBe(false)
    expect(isJobDataFor(job, { signedIn: true, acct: "x".repeat(17) })).toBe(false)
    const opaqueIdentity = "  synthetic-identity|unparsed  "
    expect(isPageJobDataFor(job, { signedIn: true, datasyncId: opaqueIdentity })).toBe(true)
  })
  test("reports catalogue support independently of routes and availability", () => {
    const both = new Set(["account", "accountLabel", "membership", "create"])
    const www = new Set(["playlists", "add", "remove", "addBatch", "removeBatch", "channelOf", "resolveChannel", "videoInfo", "queueAdd", "queueUndo", "queueAddList", "openCardMenu"])
    for (const { job } of Object.values(fixtures)) {
      expect(supportsJob("www", job.kind)).toBe(both.has(job.kind) || www.has(job.kind))
      expect(supportsJob("music", job.kind)).toBe(both.has(job.kind) || !www.has(job.kind))
    }
    expect(supportsStream("www", "player")).toBe(true)
    expect(supportsStream("music", "player")).toBe(false)
    expect(supportsStream("www", "nav")).toBe(true)
    expect(supportsStream("music", "nav")).toBe(true)
    for (const stream of ["queue", "nowPlaying"] satisfies Stream[]) {
      expect(supportsStream("www", stream)).toBe(false)
      expect(supportsStream("music", stream)).toBe(true)
    }
  })
})

describe("descriptor safety through public boundaries", () => {
  test("rejects malformed objects without getters, toJSON or browser globals", () => {
    let calls = 0
    const accessor = Object.defineProperty({}, "kind", { enumerable: true, get() { calls++; return "account" } })
    const nested = Object.defineProperty({}, "native", { enumerable: true, get() { calls++; return true } })
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    class NonData { native = true }
    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    const hostile = new Proxy({}, { ownKeys() { throw new Error("synthetic reflection error") } })
    const malformed = [undefined, null, [], new Date(), new NonData(), cycle, [1, , 2], accessor, hostile, revoked.proxy,
      { toJSON() { calls++; return {} } }, { hidden: undefined }, { native: () => true }, { native: 1n }, { native: Symbol("synthetic") }]
    const guards = [
      isJob, isJobInvocation, isVideoInfo, isNowPlaying, isItemInfo,
      isQueueInsertEndpoint, isLikeEndpoint, isLibraryEndpoint, isNavigationEndpoint, isAddToPlaylistEndpoint, isRemoveFromQueueEndpoint,
      (v: unknown) => isJobResultFor(fixtures.membership.job, v),
      (v: unknown) => isPageJobResultFor(fixtures.account.job, v),
      (v: unknown) => isPageJobDataFor(fixtures.account.job, v),
      (v: unknown) => isStreamData("player", v), (v: unknown) => isStreamData("nav", v), (v: unknown) => isStreamData("queue", v)
    ]
    for (const guard of guards) for (const value of malformed) expect(guard(value)).toBe(false)
    for (const value of [nested, new NonData(), cycle, hostile, revoked.proxy]) {
      expect(isLikeEndpoint({ likeEndpoint: { native: true }, extra: value })).toBe(false)
      expect(isJobResultFor(fixtures.membership.job, success(value))).toBe(false)
    }
    expect(isJob(Object.create({ kind: "account" }))).toBe(false)
    expect(isJobResultFor(fixtures.membership.job, Object.create({ ok: true, data: [], route }))).toBe(false)
    expect(isPageJobDataFor(fixtures.account.job, Object.create({ signedIn: true, datasyncId: "synthetic" }))).toBe(false)
    expect(calls).toBe(0)
  })
  test("rejects undefined before JSON can remove it and treats prototype keys as data", () => {
    const missing = { kind: "account", extra: undefined }
    expect(isJob(missing)).toBe(false)
    expect(isJob(roundTrip(missing))).toBe(true)
    const unsafe = { ...song, album: undefined }
    expect(isNowPlaying(unsafe)).toBe(false)
    expect(isNowPlaying(roundTrip(unsafe))).toBe(true)
    const endpoint: unknown = JSON.parse('{"likeEndpoint":{"native":true},"__proto__":{"synthetic":true}}')
    expect(isLikeEndpoint(endpoint)).toBe(true)
    expect(isLikeEndpoint(roundTrip(endpoint))).toBe(true)
    expect(Object.getPrototypeOf(endpoint)).toBe(Object.prototype)
    expect(Object.hasOwn(Object.prototype, "synthetic")).toBe(false)
    expect(isJob(JSON.parse('{"kind":"account","__proto__":{"synthetic":true}}'))).toBe(false)
    const hidden = Object.defineProperty({ kind: "account" }, "hidden", { value: 1 })
    expect(isJob(hidden)).toBe(false)
  })
})
