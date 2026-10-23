export type AccountKey = string & { readonly __brand: "AccountKey" }
export type PlaylistId = string & { readonly __brand: "PlaylistId" }
export type ChannelId = string & { readonly __brand: "ChannelId" }
export type VideoId = string & { readonly __brand: "VideoId" }
export type ShortcutId = string & { readonly __brand: "ShortcutId" }

export function isAccountKey(value: unknown): value is AccountKey {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16}$/.test(value)
}
export function isPlaylistId(value: unknown): value is PlaylistId {
  return typeof value === "string" && /^[A-Za-z0-9_-]{2,100}$/.test(value)
}
export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "string" && /^UC[A-Za-z0-9_-]{22}$/.test(value)
}
export function isVideoId(value: unknown): value is VideoId {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value)
}
export function isShortcutId(value: unknown): value is ShortcutId {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6}$/.test(value)
}
export function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100
}

export type DocumentKey =
  | { kind: "settings" }
  | { kind: "setup"; acct: AccountKey }
  | { kind: "filter"; acct: AccountKey; playlist: PlaylistId }

export function parseDocumentKey(value: unknown): DocumentKey | null {
  if (value === "doc:settings") return { kind: "settings" }
  if (typeof value !== "string") return null
  const [prefix, kind, acct, playlist, extra] = value.split(":")
  if (prefix !== "doc" || !isAccountKey(acct) || extra !== undefined) return null
  if (kind === "setup" && playlist === undefined) return { kind, acct }
  if (kind === "filter" && isPlaylistId(playlist)) return { kind, acct, playlist }
  return null
}

export function documentKey(document: DocumentKey): string {
  switch (document.kind) {
    case "settings": return "doc:settings"
    case "setup": return `doc:setup:${document.acct}`
    case "filter": return `doc:filter:${document.acct}:${document.playlist}`
  }
}
