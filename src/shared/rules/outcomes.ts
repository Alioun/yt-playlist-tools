import type { FeatureId, JobFailure } from "../contracts"
import type { PlaylistId } from "../model"
import { isPlaylistId } from "../model/validation"
import type { FilterDecision } from "./channel-filter"

const failures = [
  "signed-out", "not-sent", "unconfirmed", "missing", "full", "refused", "rate-limited", "paused",
  "account-changed", "account-refused", "membership-unreadable", "unrecognised"
] as const
export type Failure = typeof failures[number]
export type ExplicitFailure = Exclude<Failure, "membership-unreadable">

export type Outcome =
  | { kind: "added" }
  | { kind: "already-in" }
  | { kind: "filtered"; decision: Exclude<FilterDecision, "pass"> }
  | { kind: "skipped" }
  | { kind: "failed"; failure: Failure }
export type ExplicitOutcome =
  | { kind: "added" }
  | { kind: "already-in" }
  | { kind: "failed"; failure: ExplicitFailure }

export type Explicit = "shortcut" | "quick-save" | "picker" | "choose-quick-save" | "choose-shortcut"
export type Shown = { tab: ReadonlySet<string>; session: ReadonlySet<string> }
export type Remember = { tab: readonly string[]; session: readonly string[] }

export type Report =
  | { kind: "pending"; playlists: readonly PlaylistId[] }
  | { kind: "no-playlist" }
  | { kind: "removed"; playlist: PlaylistId }
  | { kind: "undo-failed" }
  | { kind: "auto-add"; outcomes: Readonly<Record<PlaylistId, Outcome>>; shown: Shown }
  | { kind: Explicit; outcomes: Readonly<Record<PlaylistId, ExplicitOutcome>> }

export type Message =
  | { kind: "pending"; playlists: readonly PlaylistId[] }
  | { kind: "saved"; playlists: readonly PlaylistId[] }
  | { kind: "first-pick"; playlists: readonly PlaylistId[] }
  | { kind: "shortcut-set"; playlist: PlaylistId }
  | { kind: "already-in"; playlists: readonly PlaylistId[] }
  | { kind: "no-playlist" }
  | { kind: "removed"; playlist: PlaylistId }
  | { kind: "undo-failed" }
  | { kind: "filtered"; playlists: readonly PlaylistId[] }
  | { kind: "unknown-channel"; playlists: readonly PlaylistId[] }
  | { kind: "saved-filtered"; saved: number; filtered: number }
  | { kind: "failed"; failure: Failure; playlists: readonly PlaylistId[] }
  | { kind: "saved-failed"; saved: readonly PlaylistId[]; failure: Failure; playlists: readonly PlaylistId[] }

export type Action =
  | { kind: "undo" }
  | { kind: "try-again"; playlists: readonly PlaylistId[] }
  | { kind: "settings"; feature: Extract<FeatureId, "auto-add" | "shortcuts">; playlist: PlaylistId }
  | { kind: "choose" }
  | { kind: "sign-in" }
  | { kind: "reload" }

export type ToastPlan = {
  tone: "progress" | "confirmation" | "hint" | "failure"
  auto: boolean
  message: Message
  action: Action | null
  remember: Remember
}

export function failureOf(answer: JobFailure): Failure {
  switch (answer.reason) {
    case "signedOut": return "signed-out"
    case "accountChanged": return "account-changed"
    case "unavailable": return "unrecognised"
    case "unconfirmed": return "unconfirmed"
    case "failed": return answer.http === 429 ? "rate-limited" : "unrecognised"
  }
}

const nothing: Remember = { tab: [], session: [] }

export function toastPlan(report: Report, featureFeedback: boolean): ToastPlan | null {
  switch (report.kind) {
    case "pending":
      return featureFeedback ? plan("progress", false, { kind: "pending", playlists: report.playlists }, null) : null
    case "no-playlist":
      return plan("hint", false, { kind: "no-playlist" }, { kind: "choose" })
    case "removed":
      return featureFeedback ? plan("confirmation", false, report, { kind: "undo" }) : null
    case "undo-failed":
      return plan("failure", false, report, null)
    case "auto-add":
      return autoAddPlan(report.outcomes, report.shown, featureFeedback)
    case "picker":
      return null
    default:
      return explicitPlan(report.kind, report.outcomes, featureFeedback)
  }
}

function plan(tone: ToastPlan["tone"], auto: boolean, message: Message, action: Action | null, remember = nothing): ToastPlan {
  return { tone, auto, message, action, remember }
}

type Limit = { per: keyof Remember; key: string } | "silent" | null

function autoAddLimit(failure: Failure, playlist: PlaylistId): Limit {
  switch (failure) {
    case "signed-out":
    case "paused": return "silent"
    case "missing":
    case "full": return { per: "session", key: `${failure}:${playlist}` }
    case "refused": return { per: "session", key: failure }
    case "account-changed":
    case "account-refused": return { per: "tab", key: failure }
    default: return null
  }
}

function autoAddPlan(outcomes: Readonly<Record<PlaylistId, Outcome>>, shown: Shown, feedback: boolean): ToastPlan | null {
  const added: PlaylistId[] = []
  const filtered: [PlaylistId, Exclude<FilterDecision, "pass">][] = []
  const failed: [PlaylistId, Failure, Limit][] = []
  for (const [playlist, outcome] of entries(outcomes)) {
    if (outcome.kind === "added") added.push(playlist)
    else if (outcome.kind === "filtered") filtered.push([playlist, outcome.decision])
    else if (outcome.kind === "failed") {
      const limit = autoAddLimit(outcome.failure, playlist)
      if (limit !== "silent" && !(limit && shown[limit.per].has(limit.key))) failed.push([playlist, outcome.failure, limit])
    }
  }
  const lead = leading(failed.map(([, failure]) => failure))
  if (lead) {
    const named = failed.filter(([, failure]) => failure === lead)
    const playlists = named.map(([playlist]) => playlist)
    const remember = { tab: keys(named, "tab"), session: keys(named, "session") }
    const message: Message = added.length
      ? { kind: "saved-failed", saved: added, failure: lead, playlists }
      : { kind: "failed", failure: lead, playlists }
    return plan("failure", true, message, autoAddFix(lead, playlists), remember)
  }
  if (added.length) {
    if (!feedback) return null
    const message: Message = filtered.length
      ? { kind: "saved-filtered", saved: added.length, filtered: filtered.length }
      : { kind: "saved", playlists: added }
    return plan("confirmation", true, message, { kind: "undo" })
  }
  const unknown = filtered.filter(([, decision]) => decision === "filtered-unknown-channel").map(([playlist]) => playlist)
  if (unknown.length) {
    if (shown.session.has("unknown-channel")) return null
    return plan("hint", true, { kind: "unknown-channel", playlists: unknown }, null, { tab: [], session: ["unknown-channel"] })
  }
  if (filtered.length && feedback) return plan("confirmation", true, { kind: "filtered", playlists: filtered.map(([playlist]) => playlist) }, null)
  return null
}

function autoAddFix(failure: Failure, playlists: readonly PlaylistId[]): Action | null {
  switch (failure) {
    case "not-sent":
    case "unconfirmed":
    case "unrecognised": return { kind: "try-again", playlists }
    case "missing":
    case "full": return playlists[0] ? { kind: "settings", feature: "auto-add", playlist: playlists[0] } : null
    case "account-changed": return { kind: "reload" }
    default: return null
  }
}

function explicitPlan(via: Explicit, outcomes: Readonly<Record<PlaylistId, ExplicitOutcome>>, feedback: boolean): ToastPlan | null {
  const added: PlaylistId[] = []
  const alreadyIn: PlaylistId[] = []
  const failed: [PlaylistId, ExplicitFailure][] = []
  for (const [playlist, outcome] of entries(outcomes)) {
    if (outcome.kind === "added") added.push(playlist)
    else if (outcome.kind === "already-in") alreadyIn.push(playlist)
    else failed.push([playlist, outcome.failure])
  }
  const lead = leading(failed.map(([, failure]) => failure))
  if (lead) {
    const playlists = failed.filter(([, failure]) => failure === lead).map(([playlist]) => playlist)
    const message: Message = added.length
      ? { kind: "saved-failed", saved: added, failure: lead, playlists }
      : { kind: "failed", failure: lead, playlists }
    return plan("failure", false, message, explicitFix(via, lead, playlists))
  }
  if (added.length) {
    if (!feedback) return null
    return plan("confirmation", false, confirmation(via, added), { kind: "undo" })
  }
  if (alreadyIn.length) return plan("hint", false, { kind: "already-in", playlists: alreadyIn }, null)
  return null
}

function confirmation(via: Explicit, added: readonly PlaylistId[]): Message {
  if (via === "choose-quick-save") return { kind: "first-pick", playlists: added }
  if (via === "choose-shortcut" && added[0]) return { kind: "shortcut-set", playlist: added[0] }
  return { kind: "saved", playlists: added }
}

function explicitFix(via: Explicit, failure: ExplicitFailure, playlists: readonly PlaylistId[]): Action | null {
  switch (failure) {
    case "signed-out": return { kind: "sign-in" }
    case "account-changed": return { kind: "reload" }
    case "missing":
    case "full":
      if (via === "quick-save") return { kind: "choose" }
      return via === "shortcut" && playlists[0] ? { kind: "settings", feature: "shortcuts", playlist: playlists[0] } : null
    default: return null
  }
}

function leading<F extends Failure>(found: readonly F[]): F | undefined {
  let lead: F | undefined
  for (const failure of found) {
    if (lead === undefined || failures.indexOf(failure) < failures.indexOf(lead)) lead = failure
  }
  return lead
}

function keys(named: readonly [PlaylistId, Failure, Limit][], per: keyof Remember): string[] {
  const found = new Set<string>()
  for (const [, , limit] of named) if (limit && limit !== "silent" && limit.per === per) found.add(limit.key)
  return [...found]
}

function entries<V>(record: Readonly<Record<PlaylistId, V>>): [PlaylistId, V][] {
  return Object.entries(record) as [PlaylistId, V][]
}

type Check = (value: unknown) => boolean
function shape(value: unknown, fields: Record<string, Check>): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === Object.keys(fields).length && keys.every(key => Object.hasOwn(fields, key) && fields[key]?.(Reflect.get(value, key)) === true)
}
const oneOf = (...values: readonly unknown[]): Check => value => values.includes(value)
const playlistList: Check = value => Array.isArray(value) && value.every(isPlaylistId)
const playlistId: Check = isPlaylistId
const count: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const failure: Check = value => failures.some(known => known === value)

/** Page data from the background is parsed, never trusted (ARC-MSG-02). */
export function isOutcome(value: unknown): value is Outcome {
  return shape(value, { kind: oneOf("added", "already-in", "skipped") }) ||
    shape(value, { kind: oneOf("filtered"), decision: oneOf("filtered", "filtered-unknown-channel") }) ||
    shape(value, { kind: oneOf("failed"), failure })
}
function isMessage(value: unknown): value is Message {
  const listed = { playlists: playlistList }
  return shape(value, { kind: oneOf("pending", "saved", "first-pick", "already-in", "filtered", "unknown-channel"), ...listed }) ||
    shape(value, { kind: oneOf("shortcut-set", "removed"), playlist: playlistId }) ||
    shape(value, { kind: oneOf("no-playlist", "undo-failed") }) ||
    shape(value, { kind: oneOf("saved-filtered"), saved: count, filtered: count }) ||
    shape(value, { kind: oneOf("failed"), failure, ...listed }) ||
    shape(value, { kind: oneOf("saved-failed"), saved: playlistList, failure, ...listed })
}
function isAction(value: unknown): value is Action {
  return shape(value, { kind: oneOf("undo", "choose", "sign-in", "reload") }) ||
    shape(value, { kind: oneOf("try-again"), playlists: playlistList }) ||
    shape(value, { kind: oneOf("settings"), feature: oneOf("auto-add", "shortcuts"), playlist: playlistId })
}
export function isToastPlan(value: unknown): value is ToastPlan {
  const keys: Check = item => Array.isArray(item) && item.every(key => typeof key === "string")
  return shape(value, { tone: oneOf("progress", "confirmation", "hint", "failure"), auto: v => typeof v === "boolean", message: isMessage,
    action: v => v === null || isAction(v), remember: v => shape(v, { tab: keys, session: keys }) })
}
