import type { ChannelQuery } from "@/lib/channel-input"
import { refreshAccessToken } from "@/utils"

const API_BASE = "https://www.googleapis.com/youtube/v3"

export interface YouTubePlaylist {
  id: string
  title: string
}

/**
 * Remembers the last refresh so a token that has already been replaced is not
 * re-refreshed by every subsequent call. Without this, an expired token costs
 * one refresh per page of results and one per playlist in the background loop;
 * with Google's refresh-token rotation each redundant exchange also invalidates
 * the previous refresh token.
 *
 * Keyed by the stale token it replaced, so a genuinely new token (after a
 * sign-out and sign-in) is never shadowed by a stale mapping.
 */
let refreshedFrom: string | null = null
let refreshedTo: string | null = null

/** The token to actually send: the refreshed replacement when one is known. */
function effectiveToken(accessToken: string): string {
  return accessToken === refreshedFrom && refreshedTo ? refreshedTo : accessToken
}

/** Test seam: forget the remembered refresh. */
export function __resetTokenCacheForTests(): void {
  refreshedFrom = null
  refreshedTo = null
}

/**
 * Fetch wrapper that retries once with a refreshed token on a 401.
 */
async function authedFetch(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const withAuth = (token: string): RequestInit => {
    // Headers rather than a spread: spreading a Headers instance yields {} and
    // would silently drop Content-Type from the POST body requests.
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${token}`)
    return { ...init, headers }
  }

  const current = effectiveToken(accessToken)
  const response = await fetch(url, withAuth(current))
  if (response.status !== 401) return response

  const refreshed = await refreshAccessToken()
  if (!refreshed) return response

  refreshedFrom = accessToken
  refreshedTo = refreshed
  return fetch(url, withAuth(refreshed))
}

/** Every playlist owned by the signed-in user, following pagination. */
export async function fetchUserPlaylists(
  accessToken: string
): Promise<YouTubePlaylist[]> {
  const playlists: YouTubePlaylist[] = []
  let pageToken = ""

  do {
    const url = new URL(`${API_BASE}/playlists`)
    url.searchParams.set("part", "snippet")
    url.searchParams.set("mine", "true")
    url.searchParams.set("maxResults", "50")
    if (pageToken) url.searchParams.set("pageToken", pageToken)

    const response = await authedFetch(url.toString(), accessToken)
    if (!response.ok) {
      throw new Error(
        `Failed to fetch playlists (${response.status} ${response.statusText})`
      )
    }

    const data = await response.json()
    for (const item of data.items ?? []) {
      playlists.push({ id: item.id, title: item.snippet.title })
    }
    pageToken = data.nextPageToken ?? ""
  } while (pageToken)

  return playlists
}

/** Adds a video to a playlist. Resolves to true when the API accepted it. */
export async function addVideoToPlaylist(
  playlistId: string,
  videoId: string,
  accessToken: string
): Promise<boolean> {
  const response = await authedFetch(
    `${API_BASE}/playlistItems?part=snippet`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: "youtube#video", videoId }
        }
      })
    }
  )

  if (!response.ok) {
    console.error(
      "[YT Playlist Tools]: Failed to add video to playlist:",
      response.status,
      await response.text().catch(() => response.statusText)
    )
    return false
  }

  return true
}

export interface VideoChannelInfo {
  channelId: string
  title: string
}

/**
 * The channel that uploaded a video, from `videos.list?part=snippet` (1 unit).
 * Resolves to null for any failure, including a private, deleted or
 * region-blocked video, which comes back as an empty result.
 */
export async function fetchVideoChannel(
  videoId: string,
  accessToken: string
): Promise<VideoChannelInfo | null> {
  const url = new URL(`${API_BASE}/videos`)
  url.searchParams.set("part", "snippet")
  url.searchParams.set("id", videoId)

  try {
    const response = await authedFetch(url.toString(), accessToken)
    if (!response.ok) {
      console.error(
        "[YT Playlist Tools]: Failed to look up the video's channel:",
        response.status
      )
      return null
    }

    const data = await response.json()
    const snippet = data.items?.[0]?.snippet
    if (!snippet?.channelId) return null
    return { channelId: snippet.channelId, title: snippet.channelTitle ?? "" }
  } catch (error) {
    console.error("[YT Playlist Tools]: Failed to look up the video's channel:", error)
    return null
  }
}

export interface ChannelInfo {
  channelId: string
  title: string
  handle?: string
}

export type ChannelLookup =
  | { status: "found"; channel: ChannelInfo }
  | { status: "not-found" }
  | { status: "failed" }

/**
 * A typed channel, from `channels.list?part=snippet` (1 unit) by ID, handle or
 * legacy username. The handle comes from `snippet.customUrl` when that holds
 * one; otherwise a handle lookup keeps the handle as typed. Never throws.
 */
export async function fetchChannel(
  query: ChannelQuery,
  accessToken: string
): Promise<ChannelLookup> {
  const url = new URL(`${API_BASE}/channels`)
  url.searchParams.set("part", "snippet")
  if (query.by === "id") url.searchParams.set("id", query.id)
  if (query.by === "handle") url.searchParams.set("forHandle", query.handle)
  if (query.by === "username") url.searchParams.set("forUsername", query.username)

  try {
    const response = await authedFetch(url.toString(), accessToken)
    if (!response.ok) {
      console.error(
        "[YT Playlist Tools]: Failed to look up the channel:",
        response.status
      )
      return { status: "failed" }
    }

    const data = await response.json()
    const item = data.items?.[0]
    if (!item?.id) return { status: "not-found" }

    const customUrl: unknown = item.snippet?.customUrl
    const handle =
      typeof customUrl === "string" && customUrl.startsWith("@")
        ? customUrl
        : query.by === "handle"
          ? query.handle
          : undefined
    return {
      status: "found",
      channel: {
        channelId: item.id,
        title: item.snippet?.title ?? "",
        ...(handle ? { handle } : {})
      }
    }
  } catch (error) {
    console.error("[YT Playlist Tools]: Failed to look up the channel:", error)
    return { status: "failed" }
  }
}
