import type { Job, QueueListId, SetVideoId } from "../../shared/contracts"
import type { VideoId } from "../../shared/model/validation"
import type { RequestPath, RequestSpec } from "./port"

function spec(path: RequestPath, body: Record<string, unknown>, endpoint: string): RequestSpec {
  return { path, body, endpoint: { commandMetadata: { webCommandMetadata: { apiUrl: `/youtubei/v1/${path}`, sendPost: true } }, [endpoint]: body } }
}
export function requestFor(job: Job, shorts: boolean): RequestSpec | undefined {
  switch (job.kind) {
    case "accountLabel":
      return spec("account/account_menu", {}, "accountMenuEndpoint")
    case "membership":
      return spec("playlist/get_add_to_playlist", { videoIds: [job.videoId], excludeWatchLater: false }, "addToPlaylistServiceEndpoint")
    case "playlists":
      return spec("browse", { browseId: "FEplaylist_aggregation" }, "browseEndpoint")
    case "add":
    case "save":
      return edit(job.playlistId, [{ action: "ACTION_ADD_VIDEO", addedVideoId: job.videoId }])
    case "remove":
    case "unsave":
      return edit(job.playlistId, [{ action: "ACTION_REMOVE_VIDEO", ...(job.setVideoId !== undefined ? { setVideoId: job.setVideoId } : { removedVideoId: job.videoId }) }])
    case "addBatch":
      return edit(
        job.playlistId,
        job.videoIds.map(addedVideoId => ({ action: "ACTION_ADD_VIDEO", addedVideoId }))
      )
    case "removeBatch":
      return edit(
        job.playlistId,
        job.setVideoIds.map(setVideoId => ({ action: "ACTION_REMOVE_VIDEO", setVideoId }))
      )
    case "create": {
      const title = job.title.trim()
      if (!title || title.length > 150 || /[<>]/.test(title)) return undefined
      return spec("playlist/create", { title, privacyStatus: job.privacy, ...(job.videoId ? { videoIds: [job.videoId] } : {}) }, "createPlaylistServiceEndpoint")
    }
    case "channelOf":
      return shorts ? spec("reel/reel_item_watch", { playerRequest: { videoId: job.videoId } }, "reelWatchEndpoint") : spec("next", { videoId: job.videoId }, "watchEndpoint")
    case "resolveChannel": {
      const url = channelUrl(job.input)
      return url ? spec("navigation/resolve_url", { url }, "urlEndpoint") : undefined
    }
    default:
      return undefined
  }
}
function edit(playlistId: string, actions: Record<string, unknown>[]): RequestSpec {
  return spec("browse/edit_playlist", { playlistId, actions, params: "IAE%3D" }, "playlistEditEndpoint")
}
export type QueueCommand = { endpoint: Record<string, unknown> }
export function queueAddEdit(listId: QueueListId, videoId: VideoId): QueueCommand {
  return { endpoint: edit(listId, [{ action: "ACTION_ADD_VIDEO", addedVideoId: videoId }]).endpoint }
}
export function queueRemoveEdit(listId: QueueListId, setVideoId: SetVideoId): QueueCommand {
  return { endpoint: edit(listId, [{ action: "ACTION_REMOVE_VIDEO", setVideoId }]).endpoint }
}
export function queueRefresh(listId: QueueListId): QueueCommand {
  return { endpoint: { refreshPlaylistCommand: { listId } } }
}
export function queueList(videoIds: readonly VideoId[], open: boolean): QueueCommand {
  return {
    endpoint: {
      signalServiceEndpoint: {
        signal: "CLIENT_SIGNAL",
        actions: [
          {
            addToPlaylistCommand: {
              videoIds: [...videoIds],
              listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
              ...(!open ? { openMiniplayer: true, onCreateListCommand: { createPlaylistServiceEndpoint: { videoIds: [...videoIds], params: "CAQ%3D" } } } : {})
            }
          }
        ]
      }
    }
  }
}
export function continuationFor(path: "browse" | "playlist/get_add_to_playlist", token: string): RequestSpec {
  return spec(path, { continuation: token }, path === "browse" ? "browseEndpoint" : "addToPlaylistServiceEndpoint")
}
export function channelBrowse(channelId: string): RequestSpec {
  return spec("browse", { browseId: channelId }, "browseEndpoint")
}
export function channelResolve(url: string): RequestSpec {
  return spec("navigation/resolve_url", { url }, "urlEndpoint")
}
export function channelUrl(input: string): string | undefined {
  const value = input.trim()
  if (/^UC[A-Za-z0-9_-]{22}$/.test(value)) return `https://www.youtube.com/channel/${value}`
  if (/^@[A-Za-z0-9_.-]+$/.test(value)) return `https://www.youtube.com/${value}`
  // A bare handle is accepted as YT-CF-16 lists it; a handle has 3 to 30 of these characters.
  if (/^[A-Za-z0-9_.-]{3,30}$/.test(value)) return `https://www.youtube.com/@${value}`
  try {
    const url = new URL(/^(?:www\.|m\.)?youtube\.com\//.test(value) ? `https://${value}` : value, "https://www.youtube.com")
    if (url.protocol !== "https:" || url.username || url.password || !["www.youtube.com", "youtube.com", "m.youtube.com"].includes(url.hostname) || url.port) return undefined
    if (!/^\/(?:channel\/UC[A-Za-z0-9_-]{22}|@[\w.-]+|c\/[\w.-]+|user\/[\w.-]+)\/?$/.test(url.pathname)) return undefined
    return `https://www.youtube.com${url.pathname}`
  } catch {
    return undefined
  }
}
export function isWrite(job: Job): boolean {
  return ["add", "remove", "addBatch", "removeBatch", "save", "unsave", "create"].includes(job.kind)
}
export function needsAccount(job: Job): boolean {
  return !["channelOf", "resolveChannel", "queueAdd", "queueUndo", "queueAddList", "openCardMenu", "queueInsert", "queueRemove", "queueRemoveIds", "queueMove", "queueReinsert", "navigate"].includes(
    job.kind
  )
}
