import type { VideoId } from "../model"
import { isVideoId } from "../model/validation"
import type { QueueItemId, MusicType, PageType } from "./identifiers"
import { isQueueItemId, isMusicType, isPageType } from "./identifiers"
import type { QueueInsertEndpoint, LikeEndpoint, LibraryEndpoint, NavigationEndpoint, AddToPlaylistEndpoint, RemoveFromQueueEndpoint } from "./endpoints"
import { isQueueInsertEndpoint, isLikeEndpoint, isLibraryEndpoint, isNavigationEndpoint, isAddToPlaylistEndpoint, isRemoveFromQueueEndpoint } from "./endpoints"
import { isJsonValue } from "./json"
import type { JsonObject } from "./json"

export type VideoInfo = { videoId: VideoId; title: string; length: number | null; kind: "video" | "short" }
export type NowPlaying = {
  videoId: VideoId; title: string; artist: string; album?: string; artwork?: string
  pos: number; len: number | null
}
export type LikeState = "liked" | "not-liked" | "disliked"
export type ItemKind = "song" | "video" | "episode" | "upload" | "album" | "playlist" | "artist" | "other"
export type ItemType =
  | { kind: "music-video"; musicVideoType: MusicType }
  | { kind: "browse"; pageType: PageType }
  | { kind: "unclassified" }
export type ItemEndpoints = {
  next?: QueueInsertEndpoint
  end?: QueueInsertEndpoint
  remove?: RemoveFromQueueEndpoint
  save?: AddToPlaylistEndpoint
  like?: LikeEndpoint
  library?: { inLibrary: boolean; endpoint: LibraryEndpoint }
  mix?: NavigationEndpoint
  album?: NavigationEndpoint
  artist?: NavigationEndpoint
}
export type ItemInfo = {
  kind: ItemKind; type: ItemType; title: string
  videoId?: VideoId; queueItemId?: QueueItemId; count?: number
  selected: boolean; autoplay: boolean; hasOwnLike: boolean; likeState: LikeState | null
  endpoints: ItemEndpoints
}

type Check = (value: unknown) => boolean
const text: Check = value => typeof value === "string"
const nonempty: Check = value => typeof value === "string" && value.length > 0
const boolean: Check = value => typeof value === "boolean"
const position: Check = value => typeof value === "number" && Number.isFinite(value) && value >= 0
const duration: Check = value => value === null || typeof value === "number" && Number.isFinite(value) && value > 0
const count: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
function shape(value: unknown, required: Record<string, Check>, optional: Record<string, Check> = {}): value is JsonObject {
  try {
    if (value === null || typeof value !== "object" || !isJsonValue(value) || Array.isArray(value)) return false
    for (const key of Object.keys(required)) {
      if (!Object.hasOwn(value, key) || !required[key]?.(value[key])) return false
    }
    return Object.keys(value).every(key => Object.hasOwn(required, key) ||
      Object.hasOwn(optional, key) && optional[key]?.(value[key]))
  } catch { return false }
}
export function isVideoInfo(value: unknown): value is VideoInfo {
  return shape(value, { videoId: isVideoId, title: text, length: duration, kind: v => v === "video" || v === "short" })
}
export function isNowPlaying(value: unknown): value is NowPlaying {
  return shape(value, { videoId: isVideoId, title: text, artist: text, pos: position, len: duration }, { album: text, artwork: nonempty })
}
export function isLikeState(value: unknown): value is LikeState {
  return value === "liked" || value === "not-liked" || value === "disliked"
}
const itemKinds = {
  song: true, video: true, episode: true, upload: true, album: true, playlist: true, artist: true, other: true
} satisfies Record<ItemKind, true>
function itemType(value: unknown): boolean {
  return shape(value, { kind: v => v === "unclassified" }) ||
    shape(value, { kind: v => v === "music-video", musicVideoType: isMusicType }) ||
    shape(value, { kind: v => v === "browse", pageType: isPageType })
}
function insertAt(value: unknown, nativePosition: string): boolean {
  if (!isQueueInsertEndpoint(value)) return false
  const body = value.queueAddEndpoint
  return body !== null && typeof body === "object" && !Array.isArray(body) && body.queueInsertPosition === nativePosition
}
function navigationSlot(value: unknown, slot: "mix" | "browse"): boolean {
  return isNavigationEndpoint(value) && (slot === "mix"
    ? Object.hasOwn(value, "watchEndpoint") || Object.hasOwn(value, "watchPlaylistEndpoint")
    : Object.hasOwn(value, "browseEndpoint"))
}
function endpoints(value: unknown): boolean {
  return shape(value, {}, {
    next: v => insertAt(v, "INSERT_AFTER_CURRENT_VIDEO"),
    end: v => insertAt(v, "INSERT_AT_END"),
    remove: isRemoveFromQueueEndpoint, save: isAddToPlaylistEndpoint, like: isLikeEndpoint,
    library: v => shape(v, { inLibrary: boolean, endpoint: isLibraryEndpoint }),
    mix: v => navigationSlot(v, "mix"), album: v => navigationSlot(v, "browse"), artist: v => navigationSlot(v, "browse")
  })
}
export function isItemInfo(value: unknown): value is ItemInfo {
  try {
    if (!shape(value, {
      kind: v => typeof v === "string" && Object.hasOwn(itemKinds, v),
      type: itemType, title: text, selected: boolean, autoplay: boolean, hasOwnLike: boolean,
      likeState: v => v === null || isLikeState(v), endpoints
    }, { videoId: isVideoId, queueItemId: isQueueItemId, count })) return false
    const slots = value.endpoints
    return slots !== null && typeof slots === "object" && !Array.isArray(slots) &&
      (!(value.selected || Object.hasOwn(slots, "remove")) || Object.hasOwn(value, "queueItemId"))
  } catch { return false }
}
