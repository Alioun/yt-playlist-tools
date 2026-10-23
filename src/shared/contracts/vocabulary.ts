import type { Device } from "../model"

export type Site = "www" | "music"
export type FeatureId =
  | "auto-add" | "shortcuts" | "quick-save" | "queue-button"
  | "watch-button" | "card-menu" | "browser-menu" | "music-actions"
  | "music-keys" | "any-tab-keys" | "gather" | "sync"
export type JobId =
  | "account" | "accountLabel" | "membership" | "playlists"
  | "add" | "remove" | "addBatch" | "removeBatch" | "save" | "unsave"
  | "create" | "channelOf" | "resolveChannel" | "videoInfo"
  | "queueAdd" | "queueUndo" | "queueAddList" | "openCardMenu"
  | "itemInfo" | "queueInsert" | "queueRemove" | "queueRemoveIds"
  | "queueMove" | "queueReinsert" | "like" | "library" | "navigate"
  | "nowPlaying" | "castState"
export type Stream = "player" | "nav" | "nowPlaying" | "queue"
export type BreakageKind =
  | "missing" | "threw" | "timeout" | "rejected" | "unrecognised"
  | "no-effect" | "anchor-missing" | "item-unrecognised" | "cosmetic"
  | "cannot-measure" | "fell-back" | "quiet-route-noisy"
  | "resolver-ambiguous"
export type Privacy = NonNullable<Device["newPlaylistVisibility"]>
export type BuildId = string & { readonly __brand: "BuildId" }

const sites = { www: true, music: true } satisfies Record<Site, true>
const features = {
  "auto-add": true, shortcuts: true, "quick-save": true, "queue-button": true,
  "watch-button": true, "card-menu": true, "browser-menu": true, "music-actions": true,
  "music-keys": true, "any-tab-keys": true, gather: true, sync: true
} satisfies Record<FeatureId, true>
const jobs = {
  account: true, accountLabel: true, membership: true, playlists: true,
  add: true, remove: true, addBatch: true, removeBatch: true, save: true, unsave: true,
  create: true, channelOf: true, resolveChannel: true, videoInfo: true,
  queueAdd: true, queueUndo: true, queueAddList: true, openCardMenu: true,
  itemInfo: true, queueInsert: true, queueRemove: true, queueRemoveIds: true,
  queueMove: true, queueReinsert: true, like: true, library: true, navigate: true,
  nowPlaying: true, castState: true
} satisfies Record<JobId, true>
const streams = { player: true, nav: true, nowPlaying: true, queue: true } satisfies Record<Stream, true>
const breakageKinds = {
  missing: true, threw: true, timeout: true, rejected: true, unrecognised: true,
  "no-effect": true, "anchor-missing": true, "item-unrecognised": true, cosmetic: true,
  "cannot-measure": true, "fell-back": true, "quiet-route-noisy": true,
  "resolver-ambiguous": true
} satisfies Record<BreakageKind, true>
const privacy = { PRIVATE: true, UNLISTED: true, PUBLIC: true } satisfies Record<Privacy, true>

export function isSite(value: unknown): value is Site {
  return typeof value === "string" && Object.hasOwn(sites, value)
}
export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === "string" && Object.hasOwn(features, value)
}
export function isJobId(value: unknown): value is JobId {
  return typeof value === "string" && Object.hasOwn(jobs, value)
}
export function isStream(value: unknown): value is Stream {
  return typeof value === "string" && Object.hasOwn(streams, value)
}
export function isBreakageKind(value: unknown): value is BreakageKind {
  return typeof value === "string" && Object.hasOwn(breakageKinds, value)
}
export function isPrivacy(value: unknown): value is Privacy {
  return typeof value === "string" && Object.hasOwn(privacy, value)
}
export function isBuildId(value: unknown): value is BuildId {
  return typeof value === "string" && value.length > 0
}
