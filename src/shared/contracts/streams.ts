import type { VideoId } from "../model"
import { isVideoId } from "../model/validation"
import type { PageType, QueueItemId } from "./identifiers"
import { isPageType, isQueueItemId } from "./identifiers"
import type { VideoInfo, NowPlaying } from "./media"
import { isVideoInfo, isNowPlaying } from "./media"
import type { Site, Stream } from "./vocabulary"
import { isStream } from "./vocabulary"
import { isJsonValue } from "./json"
import type { JsonObject } from "./json"

export type PlayerData =
  | { ad: true; at: number; player: "watch" | "shorts" }
  | {
      ad: false; at: number; player: "watch" | "shorts"; videoId: VideoId
      pos: number; len: number | null; listedLength: number | null; rate: number
      playing: boolean; seeking: boolean; content: "video" | "clip" | "made-for-kids"
      isPostLiveDvr: boolean; isLive: boolean; isUpcoming: boolean; isLiveContent: boolean
    }
export type NavData = {
  pageType: PageType
  video: VideoInfo | null
  navigation: { kind: "watch" | "shorts"; videoId: VideoId } | { kind: "other" }
}
export type QueueData = { ids: QueueItemId[] }
export type StreamDataById = { player: PlayerData; nav: NavData; nowPlaying: NowPlaying | null; queue: QueueData }
export type StreamData<S extends Stream> = StreamDataById[S]

type Check = (value: unknown) => boolean
const boolean: Check = value => typeof value === "boolean"
const nonnegative: Check = value => typeof value === "number" && Number.isFinite(value) && value >= 0
const positive: Check = value => typeof value === "number" && Number.isFinite(value) && value > 0
const duration: Check = value => value === null || positive(value)
const player: Check = value => value === "watch" || value === "shorts"
function shape(value: unknown, fields: Record<string, Check>): value is JsonObject {
  try {
    return value !== null && typeof value === "object" && isJsonValue(value) && !Array.isArray(value) &&
      Object.keys(value).length === Object.keys(fields).length &&
      Object.keys(fields).every(key => Object.hasOwn(value, key) && fields[key]?.(value[key]))
  } catch { return false }
}
function playerData(value: unknown): boolean {
  return shape(value, { ad: v => v === true, at: nonnegative, player }) || shape(value, {
    ad: v => v === false, at: nonnegative, player, videoId: isVideoId,
    pos: nonnegative, len: duration, listedLength: duration, rate: positive,
    playing: boolean, seeking: boolean, content: v => v === "video" || v === "clip" || v === "made-for-kids",
    isPostLiveDvr: boolean, isLive: boolean, isUpcoming: boolean, isLiveContent: boolean
  })
}
function navData(value: unknown): boolean {
  return shape(value, {
    pageType: isPageType, video: v => v === null || isVideoInfo(v),
    navigation: v => shape(v, { kind: x => x === "other" }) ||
      shape(v, { kind: x => x === "watch" || x === "shorts", videoId: isVideoId })
  })
}
function queueData(value: unknown): boolean {
  return shape(value, {
    ids: v => Array.isArray(v) && v.every(isQueueItemId) && new Set(v).size === v.length
  })
}
const streamGuards = {
  player: playerData, nav: navData, nowPlaying: v => v === null || isNowPlaying(v), queue: queueData
} satisfies Record<Stream, Check>
export function isStreamData<S extends Stream>(stream: S, value: unknown): value is StreamData<S> {
  try { return isStream(stream) && streamGuards[stream](value) }
  catch { return false }
}
const streamSites = {
  player: ["www"], nav: ["www", "music"], nowPlaying: ["music"], queue: ["music"]
} satisfies Record<Stream, readonly Site[]>
export function supportsStream(site: Site, stream: Stream): boolean {
  return streamSites[stream].some(supported => supported === site)
}
