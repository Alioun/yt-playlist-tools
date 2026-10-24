import { isPlaylistId, isVideoId } from "../model/validation"
import { isJsonValue } from "./json"
import type { JsonObject } from "./json"

export type QueueInsertEndpoint = JsonObject & { readonly __brand: "QueueInsertEndpoint" }
export type LikeEndpoint = JsonObject & { readonly __brand: "LikeEndpoint" }
export type LibraryEndpoint = JsonObject & { readonly __brand: "LibraryEndpoint" }
export type NavigationEndpoint = JsonObject & { readonly __brand: "NavigationEndpoint" }
export type AddToPlaylistEndpoint = JsonObject & { readonly __brand: "AddToPlaylistEndpoint" }
export type RemoveFromQueueEndpoint = JsonObject & { readonly __brand: "RemoveFromQueueEndpoint" }

const families = ["queueAddEndpoint", "likeEndpoint", "feedbackEndpoint", "watchEndpoint",
  "watchPlaylistEndpoint", "browseEndpoint", "addToPlaylistEndpoint", "removeFromQueueEndpoint"]

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
function family(value: unknown, allowed: readonly string[], check: (key: string, body: JsonObject) => boolean): boolean {
  try {
    if (!object(value)) return false
    const present = families.filter(key => Object.hasOwn(value, key))
    const key = present[0]
    if (present.length !== 1 || !key || !allowed.includes(key)) return false
    const body = value[key]
    return object(body) && Object.keys(body).length > 0 && check(key, body)
  } catch { return false }
}
function target(value: unknown, exclusive: boolean): boolean {
  if (!object(value)) return false
  const video = Object.hasOwn(value, "videoId")
  const playlist = Object.hasOwn(value, "playlistId")
  return (exclusive ? video !== playlist : video || playlist) &&
    (!video || isVideoId(value.videoId)) && (!playlist || isPlaylistId(value.playlistId))
}
export function isQueueInsertEndpoint(value: unknown): value is QueueInsertEndpoint {
  return family(value, ["queueAddEndpoint"], (_, body) =>
    (body.queueInsertPosition === "INSERT_AFTER_CURRENT_VIDEO" || body.queueInsertPosition === "INSERT_AT_END") &&
    target(body.queueTarget, true))
}
export function isLikeEndpoint(value: unknown): value is LikeEndpoint {
  return family(value, ["likeEndpoint"], () => true)
}
export function isLibraryEndpoint(value: unknown): value is LibraryEndpoint {
  return family(value, ["feedbackEndpoint", "likeEndpoint"], () => true)
}
export function isNavigationEndpoint(value: unknown): value is NavigationEndpoint {
  return family(value, ["watchEndpoint", "watchPlaylistEndpoint", "browseEndpoint"], (key, body) => {
    switch (key) {
      case "watchEndpoint": return target(body, false)
      case "watchPlaylistEndpoint": return isPlaylistId(body.playlistId)
      case "browseEndpoint": return typeof body.browseId === "string" && body.browseId.length > 0
      default: return false
    }
  })
}
export function isAddToPlaylistEndpoint(value: unknown): value is AddToPlaylistEndpoint {
  return family(value, ["addToPlaylistEndpoint"], () => true)
}
export function isRemoveFromQueueEndpoint(value: unknown): value is RemoveFromQueueEndpoint {
  return family(value, ["removeFromQueueEndpoint"], () => true)
}
