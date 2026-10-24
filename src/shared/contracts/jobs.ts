import type { AccountKey, AccountLabel, ChannelId, PlaylistId, VideoId } from "../model"
import { isAccountKey, isChannelId, isPlaylistId, isVideoId } from "../model/validation"
import type { JobId, Privacy, Site } from "./vocabulary"
import { isJobId, isPrivacy } from "./vocabulary"
import type { RouteId, SetVideoId, QueueListId, QueueItemId } from "./identifiers"
import { isRouteId, isSetVideoId, isQueueListId, isQueueItemId } from "./identifiers"
import type { QueueInsertEndpoint, LikeEndpoint, LibraryEndpoint, NavigationEndpoint } from "./endpoints"
import { isQueueInsertEndpoint, isLikeEndpoint, isLibraryEndpoint, isNavigationEndpoint } from "./endpoints"
import type { VideoInfo, NowPlaying, ItemInfo } from "./media"
import { isVideoInfo, isNowPlaying, isItemInfo } from "./media"
import { isJsonValue } from "./json"
import type { JsonObject } from "./json"
import type { JobFailure } from "./results"
import { isJobFailure } from "./results"

type EmptyInput = Record<never, never>
export type JobInputById = {
  account: EmptyInput
  accountLabel: EmptyInput
  membership: { videoId: VideoId }
  playlists: EmptyInput
  add: { playlistId: PlaylistId; videoId: VideoId }
  remove: { playlistId: PlaylistId; setVideoId: SetVideoId }
  addBatch: { playlistId: PlaylistId; videoIds: VideoId[] }
  removeBatch: { playlistId: PlaylistId; setVideoIds: SetVideoId[] }
  save: { playlistId: PlaylistId; videoId: VideoId }
  unsave: { playlistId: PlaylistId; setVideoId: SetVideoId }
  create: { title: string; privacy: Privacy; videoId?: VideoId }
  channelOf: { videoId: VideoId }
  resolveChannel: { input: string }
  videoInfo: EmptyInput
  queueAdd: EmptyInput
  queueUndo: { listId: QueueListId; setVideoId: SetVideoId }
  queueAddList: { videoIds: VideoId[] }
  openCardMenu: EmptyInput
  itemInfo: EmptyInput
  queueInsert: { endpoint: QueueInsertEndpoint; position: "next" | "end" }
  queueRemove: { id: QueueItemId }
  queueRemoveIds: { ids: QueueItemId[] }
  queueMove: { id: QueueItemId; to: "next" | "end" | number }
  queueReinsert: { videoId: VideoId; index: number }
  like: { endpoint: LikeEndpoint }
  library: { endpoint: LibraryEndpoint }
  navigate: { endpoint: NavigationEndpoint }
  nowPlaying: EmptyInput
  castState: EmptyInput
}
export type JobById = { [K in JobId]: { kind: K } & JobInputById[K] }
export type Job = JobById[JobId]
export type JobOf<K extends JobId> = JobById[K]
export type MembershipRow = { id: PlaylistId; title: string; privacy?: Privacy; count?: number; contains: boolean }
export type PlaylistRow = { id: PlaylistId; title: string; privacy?: Privacy; count?: number; thumb?: string }
export type BatchAddResult =
  | { videoId: VideoId; setVideoId: SetVideoId; failure?: never }
  | { videoId: VideoId; failure: JobFailure; setVideoId?: never }
export type AccountData = { signedIn: true; acct: AccountKey } | { signedIn: false; acct: null }
export type QueueAddData =
  | { confirmed: false; quiet: boolean }
  | { confirmed: true; quiet: boolean; undo?: { listId: QueueListId; setVideoId: SetVideoId } }
export type JobDataById = {
  account: AccountData
  accountLabel: AccountLabel
  membership: MembershipRow[]
  playlists: PlaylistRow[]
  add: { setVideoId: SetVideoId }
  remove: null
  addBatch: { results: BatchAddResult[] }
  removeBatch: { removed: number }
  save: { setVideoId: SetVideoId }
  unsave: null
  create: { playlistId: PlaylistId }
  channelOf: { channelId: null } | { channelId: ChannelId; title?: string; handle?: string }
  resolveChannel: { channelId: ChannelId; title: string; handle?: string }
  videoInfo: VideoInfo
  queueAdd: QueueAddData
  queueUndo: null
  queueAddList: { confirmed: boolean; count: number }
  openCardMenu: null
  itemInfo: ItemInfo
  queueInsert: { ids: QueueItemId[] }
  queueRemove: { index: number }
  queueRemoveIds: { removed: number }
  queueMove: { from: number }
  queueReinsert: { id: QueueItemId }
  like: null
  library: { inLibrary: boolean }
  navigate: { navigated: true }
  nowPlaying: NowPlaying | null
  castState: { casting: boolean }
}
export type JobData<J extends Job> = JobDataById[J["kind"]]
export type JobResult<J extends Job = Job> = { ok: true; data: JobData<J>; route: RouteId } | JobFailure
export type AccountJobId =
  | "accountLabel" | "membership" | "playlists" | "add" | "remove" | "addBatch"
  | "removeBatch" | "save" | "unsave" | "create" | "like" | "library"
export type AccountJob = JobOf<AccountJobId>
export type JobInvocation<J extends Job = Job> = {
  [K in J["kind"]]: K extends AccountJobId
    ? { job: J & JobOf<K>; acct: AccountKey }
    : { job: J & JobOf<K>; acct?: never }
}[J["kind"]]

type Check = (value: unknown) => boolean
type Fields = Record<string, Check>
const text: Check = value => typeof value === "string"
const nonempty: Check = value => typeof value === "string" && value.length > 0
const boolean: Check = value => typeof value === "boolean"
const integer: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const noData: Check = value => value === null
function shape(value: unknown, required: Fields, optional: Fields = {}): value is JsonObject {
  try {
    if (value === null || typeof value !== "object" || !isJsonValue(value) || Array.isArray(value)) return false
    for (const key of Object.keys(required)) {
      if (!Object.hasOwn(value, key) || !required[key]?.(value[key])) return false
    }
    return Object.keys(value).every(key => Object.hasOwn(required, key) ||
      Object.hasOwn(optional, key) && optional[key]?.(value[key]))
  } catch { return false }
}
function list(value: unknown, check: Check, min = 0, max = Infinity): value is unknown[] {
  return Array.isArray(value) && isJsonValue(value) && value.length >= min && value.length <= max && value.every(check)
}
function queueIds(value: unknown, min = 0): boolean {
  return list(value, isQueueItemId, min) && new Set(value).size === value.length
}
const inputFields = {
  account: {}, accountLabel: {}, membership: { videoId: isVideoId }, playlists: {},
  add: { playlistId: isPlaylistId, videoId: isVideoId },
  remove: { playlistId: isPlaylistId, setVideoId: isSetVideoId },
  addBatch: { playlistId: isPlaylistId, videoIds: v => list(v, isVideoId, 1, 50) },
  removeBatch: { playlistId: isPlaylistId, setVideoIds: v => list(v, isSetVideoId, 1, 50) },
  save: { playlistId: isPlaylistId, videoId: isVideoId },
  unsave: { playlistId: isPlaylistId, setVideoId: isSetVideoId },
  create: { title: text, privacy: isPrivacy }, channelOf: { videoId: isVideoId },
  resolveChannel: { input: text }, videoInfo: {}, queueAdd: {},
  queueUndo: { listId: isQueueListId, setVideoId: isSetVideoId },
  queueAddList: { videoIds: v => list(v, isVideoId, 1, 199) }, openCardMenu: {}, itemInfo: {},
  queueInsert: { endpoint: isQueueInsertEndpoint, position: v => v === "next" || v === "end" },
  queueRemove: { id: isQueueItemId }, queueRemoveIds: { ids: v => list(v, isQueueItemId) },
  queueMove: { id: isQueueItemId, to: v => v === "next" || v === "end" || integer(v) },
  queueReinsert: { videoId: isVideoId, index: integer }, like: { endpoint: isLikeEndpoint },
  library: { endpoint: isLibraryEndpoint }, navigate: { endpoint: isNavigationEndpoint }, nowPlaying: {}, castState: {}
} satisfies Record<JobId, Fields>
export function isJob(value: unknown): value is Job {
  try {
    if (value === null || typeof value !== "object" || !isJsonValue(value) || Array.isArray(value) || !Object.hasOwn(value, "kind") || !isJobId(value.kind)) return false
    if (!shape(value, { kind: isJobId, ...inputFields[value.kind] }, value.kind === "create" ? { videoId: isVideoId } : {})) return false
    if (value.kind !== "queueInsert") return true
    const endpoint = value.endpoint
    if (!isQueueInsertEndpoint(endpoint)) return false
    const body = endpoint.queueAddEndpoint
    return body !== null && typeof body === "object" && !Array.isArray(body) &&
      body.queueInsertPosition === (value.position === "next" ? "INSERT_AFTER_CURRENT_VIDEO" : "INSERT_AT_END")
  } catch { return false }
}
function membershipRow(value: unknown): boolean {
  return shape(value, { id: isPlaylistId, title: text, contains: boolean }, { privacy: isPrivacy, count: integer })
}
function playlistRow(value: unknown): boolean {
  return shape(value, { id: isPlaylistId, title: text }, { privacy: isPrivacy, count: integer, thumb: nonempty })
}
function batchEntry(value: unknown): boolean {
  return shape(value, { videoId: isVideoId, setVideoId: isSetVideoId }) ||
    shape(value, { videoId: isVideoId, failure: isJobFailure })
}
function removed(value: unknown, maximum: number): boolean {
  return shape(value, { removed: integer }) && typeof value.removed === "number" && value.removed <= maximum
}
const dataGuards = {
  account: v => shape(v, { signedIn: x => x === true, acct: isAccountKey }) || shape(v, { signedIn: x => x === false, acct: noData }),
  accountLabel: v => shape(v, { name: text }, { handle: text, avatar: nonempty }),
  membership: v => list(v, membershipRow), playlists: v => list(v, playlistRow),
  add: v => shape(v, { setVideoId: isSetVideoId }), remove: noData,
  addBatch: (v, job) => job.kind === "addBatch" && shape(v, { results: x => list(x, batchEntry) }) &&
    Array.isArray(v.results) && v.results.length === job.videoIds.length &&
    v.results.every((entry, index) => entry !== null && typeof entry === "object" && !Array.isArray(entry) && entry.videoId === job.videoIds[index]),
  removeBatch: (v, job) => job.kind === "removeBatch" && removed(v, job.setVideoIds.length),
  save: v => shape(v, { setVideoId: isSetVideoId }), unsave: noData,
  create: v => shape(v, { playlistId: isPlaylistId }),
  channelOf: v => shape(v, { channelId: noData }) || shape(v, { channelId: isChannelId }, { title: text, handle: text }),
  resolveChannel: v => shape(v, { channelId: isChannelId, title: text }, { handle: text }), videoInfo: isVideoInfo,
  queueAdd: v => shape(v, { confirmed: x => x === false, quiet: boolean }) ||
    shape(v, { confirmed: x => x === true, quiet: boolean }, { undo: x => shape(x, { listId: isQueueListId, setVideoId: isSetVideoId }) }),
  queueUndo: noData,
  queueAddList: (v, job) => job.kind === "queueAddList" && shape(v, { confirmed: boolean, count: integer }) &&
    typeof v.count === "number" && v.count <= job.videoIds.length && (!v.confirmed || v.count === job.videoIds.length),
  openCardMenu: noData, itemInfo: isItemInfo,
  queueInsert: v => shape(v, { ids: x => queueIds(x, 1) }),
  queueRemove: v => shape(v, { index: integer }),
  queueRemoveIds: (v, job) => job.kind === "queueRemoveIds" && removed(v, job.ids.length),
  queueMove: v => shape(v, { from: integer }), queueReinsert: v => shape(v, { id: isQueueItemId }),
  like: noData, library: v => shape(v, { inLibrary: boolean }), navigate: v => shape(v, { navigated: x => x === true }),
  nowPlaying: v => v === null || isNowPlaying(v), castState: v => shape(v, { casting: boolean })
} satisfies Record<JobId, (value: unknown, job: Job) => boolean>
export function isJobDataFor<J extends Job>(job: J, value: unknown): value is JobData<J> {
  try { return isJob(job) && dataGuards[job.kind](value, job) }
  catch { return false }
}
export function isJobResultFor<J extends Job>(job: J, value: unknown): value is JobResult<J> {
  try {
    return isJob(job) && (isJobFailure(value) || shape(value, {
      ok: v => v === true, route: isRouteId, data: v => isJobDataFor(job, v)
    }))
  } catch { return false }
}
const accountJobs = {
  accountLabel: true, membership: true, playlists: true, add: true, remove: true, addBatch: true,
  removeBatch: true, save: true, unsave: true, create: true, like: true, library: true
} satisfies Record<AccountJobId, true>
export function isJobInvocation(value: unknown): value is JobInvocation {
  try {
    if (!shape(value, { job: isJob }, { acct: isAccountKey }) || !isJob(value.job)) return false
    return Object.hasOwn(accountJobs, value.job.kind) === Object.hasOwn(value, "acct")
  } catch { return false }
}
const jobSites = {
  account: ["www", "music"], accountLabel: ["www", "music"], membership: ["www", "music"], playlists: ["www"],
  add: ["www"], remove: ["www"], addBatch: ["www"], removeBatch: ["www"], save: ["music"], unsave: ["music"],
  create: ["www", "music"], channelOf: ["www"], resolveChannel: ["www"], videoInfo: ["www"], queueAdd: ["www"],
  queueUndo: ["www"], queueAddList: ["www"], openCardMenu: ["www"], itemInfo: ["music"], queueInsert: ["music"],
  queueRemove: ["music"], queueRemoveIds: ["music"], queueMove: ["music"], queueReinsert: ["music"], like: ["music"],
  library: ["music"], navigate: ["music"], nowPlaying: ["music"], castState: ["music"]
} satisfies Record<JobId, readonly Site[]>
export function supportsJob(site: Site, job: JobId): boolean {
  return jobSites[job].some(supported => supported === site)
}
