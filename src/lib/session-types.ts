import type { ChannelQuery } from "@/lib/channel-input"

export interface SessionPlaylist {
  id: string
  title: string
}

export interface SessionChannel {
  channelId: string
  title: string
  handle?: string
}

export type PageJob =
  | { kind: "account" }
  | { kind: "playlists"; accountKey: string }
  | { kind: "add"; accountKey: string; playlistId: string; videoId: string }
  | { kind: "videoChannel"; videoId: string }
  | { kind: "resolveChannel"; query: ChannelQuery }

export type SessionErrorCode =
  | "signedOut"
  | "unavailable"
  | "accountChanged"
  | "failed"
  | "unconfirmed"

export type PageReply =
  | { kind: "account"; signedIn: false }
  | { kind: "account"; signedIn: true; accountKey: string }
  | { kind: "playlists"; accountKey: string; playlists: SessionPlaylist[] }
  | { kind: "add"; accountKey: string; alreadyIn: boolean }
  | { kind: "channel"; channel: SessionChannel | null }
  | { kind: "error"; code: SessionErrorCode; message: string }
