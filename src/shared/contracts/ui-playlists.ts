import { objectShape } from "./object-shape"
import { isJobDataFor, isJobResultFor, type AccountData, type Job, type JobOf, type JobResult, type PlaylistRow } from "./jobs"
import { isPrivacy, isSite, type Site, type Privacy } from "./vocabulary"
import { isAccountKey, isPlaylistId, isVideoId, type AccountKey, type PlaylistId, type VideoId } from "../model/validation"
import type { RpcContract, RpcFailure } from "../rpc/rpc"

export type CreationId = string & { readonly __brand: "UiCreationId" }
export function isCreationId(value: unknown): value is CreationId {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
}
export type UiUnavailable = { readonly kind: "unavailable"; readonly reason: "disposed" | "collaborator" | "owner" | "operation" | "capacity" }
export type UiAccountInView =
  | ({ readonly kind: "account"; readonly source: "active" | "recent"; readonly tabId: number } & AccountData)
  | { readonly kind: "account"; readonly source: "last-account"; readonly acct: AccountKey }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable"; readonly reason: "held" | "disposed" | "native" | "session" }
  | UiUnavailable
export type UiListing = { readonly rows: readonly PlaylistRow[]; readonly at: number | null }
export type UiCacheStatus =
  | { readonly kind: "committed" | "unchanged" }
  | { readonly kind: "caller-owned"; readonly reason: "private" | "no-setup" | "disposed" }
  | { readonly kind: "refused"; readonly reason: "capture" | "revoked" | "no-setup" | "invalid" }
  | { readonly kind: "failed"; readonly stage: "set" }
  | { readonly kind: "unconfirmed"; readonly write: "resolved" | "rejected"; readonly cause: "readback" | "stopped" }
  | { readonly kind: "unavailable"; readonly reason: SessionReason | "pending-removal" }
  | { readonly kind: "invalid"; readonly part: "request" | "device" | "cache" | "setup" }
type SessionReason = "consent-held" | "startup" | "newer-layout" | "disposed" | "stale" | "session-host" | "session-layout" | "revision"
type SessionStatus = "memory" | "committed" | "failed" | "unavailable" | "unconfirmed"
export type UiCacheReadFailure = Extract<UiCacheStatus, { readonly kind: "unavailable" | "invalid" }>
export type UiJobOutcome<J extends Job> =
  | { readonly kind: "result"; readonly tabId: number; readonly result: JobResult<J> }
  | { readonly kind: "transport"; readonly tabId: number; readonly failure: RpcFailure | "gone"; readonly delivery: "unknown"; readonly cleanup?: SessionStatus }
  | { readonly kind: "session"; readonly status: SessionStatus }
  | { readonly kind: "no-tab"; readonly attempted: readonly number[] }
  | { readonly kind: "guard"; readonly reason: "held" | "disposed" | "site" | "privacy" | "accountChanged" | "signedOut" | "view" }
export type UiListRefresh =
  | {
      readonly kind: "listed"
      readonly listing: UiListing & { readonly at: number }
      readonly outcome: UiJobOutcome<JobOf<"playlists">>
      readonly cache: UiCacheStatus
      readonly present: { readonly kind: "list-present"; readonly acct: AccountKey; readonly site: Site; readonly private: boolean; readonly at: number; readonly ids: readonly PlaylistId[] }
    }
  | { readonly kind: "not-listed"; readonly outcome: UiJobOutcome<JobOf<"playlists">>; readonly cached: UiListing | null }
export type UiPlaylistList =
  | { readonly kind: "open"; readonly cached: UiListing | null; readonly freshness: "fresh" | "stale" | "absent"; readonly refresh: UiListRefresh | null }
  | { readonly kind: "unavailable"; readonly read: UiCacheReadFailure }
  | UiUnavailable
export type ListOperationId = string & { readonly __brand: "UiListOperationId" }
export function isListOperationId(value: unknown): value is ListOperationId {
  return isCreationId(value)
}
export type UiPlaylistOpen = {
  readonly kind: "open"
  readonly operation: ListOperationId
  readonly cached: UiListing | null
  readonly freshness: "fresh" | "stale" | "absent"
  readonly refresh: { readonly kind: "pending"; readonly generation: number } | null
}
export type UiListCompletion =
  | UiListRefresh
  | {
      readonly kind: "withheld"
      readonly confirmed: boolean
      readonly cache: UiCacheStatus | null
    }
export type UiPlaylistAnswer =
  | UiPlaylistOpen
  | { readonly kind: "refreshed"; readonly operation: ListOperationId; readonly generation: number; readonly refresh: UiListCompletion }
  | { readonly kind: "released"; readonly operation: ListOperationId }
  | { readonly kind: "unavailable"; readonly read: UiCacheReadFailure }
  | UiUnavailable
export type UiPlaylistPayload = WindowClaim &
  (
    | { readonly action: "open"; readonly operation: ListOperationId; readonly acct: AccountKey; readonly site: Site; readonly refresh: boolean }
    | { readonly action: "await" | "refresh"; readonly operation: ListOperationId; readonly generation: number }
    | { readonly action: "release"; readonly operation: ListOperationId }
  )
export type UiNewPlaylist = { readonly title: string; readonly privacy: Privacy; readonly videoId?: VideoId }
export type UiCreationAnswer =
  | { readonly kind: "opened" | "idle" | "released"; readonly operation: CreationId }
  | { readonly kind: "invalid"; readonly problem: "required" | "angle-brackets" | "too-long" }
  | { readonly kind: "created"; readonly id: PlaylistId; readonly outcome: UiJobOutcome<JobOf<"create">>; readonly cache: UiCacheStatus }
  | { readonly kind: "not-created"; readonly outcome: UiJobOutcome<JobOf<"create">> }
  | { readonly kind: "unavailable"; readonly read: UiCacheReadFailure }
  | UiUnavailable
type WindowClaim = { readonly windowId?: number }
export type UiCreationPayload = WindowClaim &
  (
    | { readonly action: "open"; readonly operation: CreationId; readonly acct: AccountKey; readonly site: Site }
    | ({ readonly action: "submit"; readonly operation: CreationId } & UiNewPlaylist)
    | { readonly action: "status" | "release"; readonly operation: CreationId }
  )
export type PlaylistUiMessages = {
  readonly "ui.accountInView": { readonly payload: WindowClaim; readonly result: UiAccountInView }
  readonly "ui.playlists": { readonly payload: UiPlaylistPayload; readonly result: UiPlaylistAnswer }
  readonly "ui.create": { readonly payload: UiCreationPayload; readonly result: UiCreationAnswer }
  readonly "ui.resolveChannel": { readonly payload: WindowClaim & { readonly input: string }; readonly result: UiJobOutcome<JobOf<"resolveChannel">> | UiUnavailable }
}

const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const bool = (value: unknown) => typeof value === "boolean"
const text = (value: unknown) => typeof value === "string"
const windowClaim = { windowId: natural }
const oneOf =
  <T extends string>(...values: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === "string" && values.some(item => item === value)
const sessionReason = oneOf("consent-held", "startup", "newer-layout", "disposed", "stale", "session-host", "session-layout", "revision", "pending-removal")
const sessionStatus = oneOf("memory", "committed", "failed", "unavailable", "unconfirmed")
export function isUiUnavailable(value: unknown): value is UiUnavailable {
  return objectShape(value, { kind: v => v === "unavailable", reason: oneOf("disposed", "collaborator", "owner", "operation", "capacity") })
}
export function isUiAccountInView(value: unknown): value is UiAccountInView {
  const tab = { kind: (v: unknown) => v === "account", source: oneOf("active", "recent"), tabId: natural }
  return (
    isUiUnavailable(value) ||
    objectShape(value, { ...tab, signedIn: v => v === true, acct: isAccountKey }) ||
    objectShape(value, { ...tab, signedIn: v => v === false, acct: v => v === null }) ||
    objectShape(value, { kind: v => v === "account", source: v => v === "last-account", acct: isAccountKey }) ||
    objectShape(value, { kind: v => v === "none" }) ||
    objectShape(value, { kind: v => v === "unavailable", reason: oneOf("held", "disposed", "native", "session") })
  )
}
export function isUiListing(value: unknown): value is UiListing {
  return objectShape(value, { rows: v => isJobDataFor({ kind: "playlists" }, v), at: v => v === null || natural(v) })
}
export function isUiCacheStatus(value: unknown): value is UiCacheStatus {
  return (
    objectShape(value, { kind: oneOf("committed", "unchanged") }) ||
    objectShape(value, { kind: v => v === "caller-owned", reason: oneOf("private", "no-setup", "disposed") }) ||
    objectShape(value, { kind: v => v === "refused", reason: oneOf("capture", "revoked", "no-setup", "invalid") }) ||
    objectShape(value, { kind: v => v === "failed", stage: v => v === "set" }) ||
    objectShape(value, { kind: v => v === "unconfirmed", write: oneOf("resolved", "rejected"), cause: oneOf("readback", "stopped") }) ||
    objectShape(value, { kind: v => v === "unavailable", reason: sessionReason }) ||
    objectShape(value, { kind: v => v === "invalid", part: oneOf("request", "device", "cache", "setup") })
  )
}
function isUiCacheReadFailure(value: unknown): value is UiCacheReadFailure {
  return isUiCacheStatus(value) && (value.kind === "invalid" || value.kind === "unavailable")
}
export function isUiJobOutcome<J extends Job>(job: J, value: unknown): value is UiJobOutcome<J> {
  return (
    objectShape(value, { kind: v => v === "result", tabId: natural, result: v => isJobResultFor(job, v) }) ||
    objectShape(
      value,
      { kind: v => v === "transport", tabId: natural, failure: oneOf("timeout", "transport", "invalid-answer", "receiver-failed", "disposed", "gone"), delivery: v => v === "unknown" },
      { cleanup: sessionStatus }
    ) ||
    objectShape(value, { kind: v => v === "session", status: sessionStatus }) ||
    objectShape(value, { kind: v => v === "no-tab", attempted: v => Array.isArray(v) && v.every(natural) }) ||
    objectShape(value, { kind: v => v === "guard", reason: oneOf("held", "disposed", "site", "privacy", "accountChanged", "signedOut", "view") })
  )
}
export function isUiListRefresh(value: unknown): value is UiListRefresh {
  const outcome = (v: unknown): v is UiJobOutcome<JobOf<"playlists">> => isUiJobOutcome({ kind: "playlists" }, v)
  return (
    objectShape(value, { kind: v => v === "not-listed", outcome: v => outcome(v) && (v.kind !== "result" || !v.result.ok), cached: v => v === null || isUiListing(v) }) ||
    objectShape(value, {
      kind: v => v === "listed",
      outcome: v => outcome(v) && v.kind === "result" && v.result.ok,
      listing: v => isUiListing(v) && v.at !== null,
      cache: isUiCacheStatus,
      present: v => objectShape(v, { kind: x => x === "list-present", acct: isAccountKey, site: isSite, private: bool, at: natural, ids: x => Array.isArray(x) && x.every(isPlaylistId) })
    })
  )
}
export function isUiPlaylistList(value: unknown): value is UiPlaylistList {
  return (
    isUiUnavailable(value) ||
    objectShape(value, { kind: v => v === "unavailable", read: isUiCacheReadFailure }) ||
    objectShape(value, { kind: v => v === "open", cached: v => v === null || isUiListing(v), freshness: oneOf("fresh", "stale", "absent"), refresh: v => v === null || isUiListRefresh(v) })
  )
}
export function isUiPlaylistPayload(value: unknown): value is UiPlaylistPayload {
  const operation = isListOperationId
  return (
    objectShape(value, { action: v => v === "open", operation, acct: isAccountKey, site: isSite, refresh: bool }, windowClaim) ||
    objectShape(value, { action: oneOf("await", "refresh"), operation, generation: natural }, windowClaim) ||
    objectShape(value, { action: v => v === "release", operation }, windowClaim)
  )
}
export function isUiListCompletion(value: unknown): value is UiListCompletion {
  return isUiListRefresh(value) || objectShape(value, { kind: v => v === "withheld", confirmed: bool, cache: v => v === null || isUiCacheStatus(v) })
}
export function isUiPlaylistAnswer(value: unknown): value is UiPlaylistAnswer {
  return (
    isUiUnavailable(value) ||
    objectShape(value, { kind: v => v === "unavailable", read: isUiCacheReadFailure }) ||
    objectShape(value, {
      kind: v => v === "open",
      operation: isListOperationId,
      cached: v => v === null || isUiListing(v),
      freshness: oneOf("fresh", "stale", "absent"),
      refresh: v => v === null || objectShape(v, { kind: x => x === "pending", generation: natural })
    }) ||
    objectShape(value, { kind: v => v === "refreshed", operation: isListOperationId, generation: natural, refresh: isUiListCompletion }) ||
    objectShape(value, { kind: v => v === "released", operation: isListOperationId })
  )
}
export function isUiCreationPayload(value: unknown): value is UiCreationPayload {
  const operation = isCreationId
  return (
    objectShape(value, { action: v => v === "open", operation, acct: isAccountKey, site: isSite }, windowClaim) ||
    objectShape(value, { action: v => v === "submit", operation, title: text, privacy: isPrivacy }, { ...windowClaim, videoId: isVideoId }) ||
    objectShape(value, { action: oneOf("status", "release"), operation }, windowClaim)
  )
}
export function isUiCreationAnswer(value: unknown): value is UiCreationAnswer {
  const job: JobOf<"create"> = { kind: "create", title: "", privacy: "PRIVATE" }
  const outcome = (v: unknown): v is UiJobOutcome<JobOf<"create">> => isUiJobOutcome(job, v)
  const created = (v: unknown, id: unknown) => outcome(v) && v.kind === "result" && v.result.ok && v.result.data.playlistId === id
  return (
    isUiUnavailable(value) ||
    objectShape(value, { kind: oneOf("opened", "idle", "released"), operation: isCreationId }) ||
    objectShape(value, { kind: v => v === "invalid", problem: oneOf("required", "angle-brackets", "too-long") }) ||
    (objectShape(value, { kind: v => v === "created", id: isPlaylistId, outcome, cache: isUiCacheStatus }) && created(value.outcome, value.id)) ||
    objectShape(value, { kind: v => v === "not-created", outcome: v => outcome(v) && (v.kind !== "result" || !v.result.ok) }) ||
    objectShape(value, { kind: v => v === "unavailable", read: isUiCacheReadFailure })
  )
}
export const playlistUiContract: RpcContract<PlaylistUiMessages> = {
  "ui.accountInView": { payload: (v): v is PlaylistUiMessages["ui.accountInView"]["payload"] => objectShape(v, {}, windowClaim), result: isUiAccountInView, timeoutMs: 12_000 },
  "ui.playlists": { payload: isUiPlaylistPayload, result: isUiPlaylistAnswer, timeoutMs: 45_000 },
  "ui.create": { payload: isUiCreationPayload, result: isUiCreationAnswer, timeoutMs: 45_000 },
  "ui.resolveChannel": {
    payload: (v): v is PlaylistUiMessages["ui.resolveChannel"]["payload"] => objectShape(v, { input: text }, windowClaim),
    result: (v): v is PlaylistUiMessages["ui.resolveChannel"]["result"] => isUiUnavailable(v) || isUiJobOutcome({ kind: "resolveChannel", input: "" }, v),
    timeoutMs: 45_000
  }
}
