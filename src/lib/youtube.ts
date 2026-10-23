import type { ChannelQuery } from "@/lib/channel-input"
import { runSessionJob, SessionFailure, type SessionSnapshot } from "@/lib/session"
import type { SessionPlaylist, SessionChannel } from "@/lib/session-types"

export type YouTubePlaylist = SessionPlaylist
export type ChannelInfo = SessionChannel
export type VideoChannelInfo = SessionChannel
export type ChannelLookup =
  | { status: "found"; channel: ChannelInfo }
  | { status: "not-found" }
  | { status: "failed" }

export async function fetchUserPlaylists(session: SessionSnapshot): Promise<YouTubePlaylist[]> {
  const reply = await runSessionJob(session, { kind: "playlists", accountKey: session.accountKey })
  if (reply.kind !== "playlists") throw new SessionFailure("unavailable")
  return reply.playlists
}

export async function addVideoToPlaylist(session: SessionSnapshot, playlistId: string, videoId: string, expiresAt?: number) {
  const reply = await runSessionJob(session, { kind: "add", accountKey: session.accountKey, playlistId, videoId }, expiresAt)
  if (reply.kind !== "add") throw new SessionFailure("unconfirmed")
  return { alreadyIn: reply.alreadyIn }
}

export async function fetchVideoChannel(session: SessionSnapshot, videoId: string): Promise<VideoChannelInfo | null> {
  const reply = await runSessionJob(session, { kind: "videoChannel", videoId })
  if (reply.kind !== "channel") throw new SessionFailure("unavailable")
  return reply.channel
}

export async function fetchChannel(session: SessionSnapshot, query: ChannelQuery): Promise<ChannelLookup> {
  const reply = await runSessionJob(session, { kind: "resolveChannel", query })
  if (reply.kind !== "channel") return { status: "failed" }
  return reply.channel ? { status: "found", channel: reply.channel } : { status: "not-found" }
}
