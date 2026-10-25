import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { isRecord } from "../../shared/model/codec"
import { isKey } from "../../shared/model/keys"
import { STORAGE_SCHEMA_VERSION } from "../../shared/model/documents"
import { isShortcutId, parseDocumentKey } from "../../shared/model/validation"
import type { Snapshot } from "../../shared/model/settings-view"
import type { StartupHost } from "./legacy-execution"
import type { LocalWriteStorage } from "./local-filter-writer"
import { planInterimConversion, type HistoricalFact, type InterimConversionContext, type InterimConversionInput, type InterimConversionPlan } from "./interim-conversion"
import { sameSyncJson } from "./sync-write-admission"

export const interimConversionKey = "interimConversion"
const markers = ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]
const globals = ["playlists", "addToPlaylistID", "watchLaterShortcut", "requiredWatchPercentage", "toastEnabled", "channelFilters", "channelLabels", "cachedPlaylists", "preventDuplicates", "queueButtonEnabled", "cardContextMenu"]
export function isInterimSourceKey(key: string): boolean { return key.startsWith("account:") || markers.includes(key) || globals.includes(key) }
export function isInterimCanonicalKey(key: string): boolean { return ["schema", "device", "unclaimed"].includes(key) || key.startsWith("doc:") || key.startsWith("cache:") }
export function hasInterimEvidence(source: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(source).some(key => key.startsWith("account:") || markers.includes(key))
}

export type InterimPersistenceSnapshot = {
  readonly source: Readonly<Record<string, unknown>>
  readonly canonical: Readonly<Record<string, unknown>>
  readonly checkpoint: { readonly kind: "absent" } | { readonly kind: "present"; readonly value: unknown }
  readonly historicalAuthorization: HistoricalFact
  readonly priorCredentialPresence: HistoricalFact
}
export type StoreStartupHost = StartupHost & { readInterimSnapshot(): Promise<InterimPersistenceSnapshot> }
type RetainedOutcome = Extract<InterimConversionPlan, { kind: "blocked" | "inactive-proposal" }>
export type RetainedInterim = {
  readonly v: 1
  readonly kind: "retained-interim"
  readonly source: JsonObject
  readonly canonical: JsonObject
  readonly historicalAuthorization: HistoricalFact
  readonly priorCredentialPresence: HistoricalFact
  readonly context: InterimConversionContext
  readonly outcome: RetainedOutcome
  readonly recovery: "available" | "unavailable"
}
export type RetainedInterimRead =
  | { readonly kind: "absent" }
  | { readonly kind: "valid"; readonly checkpoint: Snapshot<RetainedInterim> }
  | { readonly kind: "invalid" }
  | { readonly kind: "newer-version"; readonly version: number }

type WriteObservation = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
export type InterimRetentionResult =
  | { readonly kind: "not-interim" }
  | { readonly kind: "newer-layout"; readonly version: number }
  | { readonly kind: "retained-but-held"; readonly checkpoint: Snapshot<RetainedInterim>; readonly observation: WriteObservation | { readonly kind: "existing" } }
  | { readonly kind: "invalid"; readonly reason: "snapshot" | "checkpoint" | "context" }
  | { readonly kind: "newer-checkpoint"; readonly version: number }
  | { readonly kind: "unrepresentable"; readonly reason: "source" | "canonical" }
  | { readonly kind: "stale"; readonly reason: "source" | "canonical" | "history" | "checkpoint" | "stopped" }
  | { readonly kind: "failed"; readonly stage: "snapshot" | "preflight"; readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: "set"; readonly observation: Extract<WriteObservation, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly observation: WriteObservation; readonly cause: { readonly kind: "readback" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }
export type InterimNoteRead =
  | { readonly kind: "inactive-proposal"; readonly checkpoint: Snapshot<RetainedInterim>; readonly note: Snapshot<Extract<RetainedOutcome, { kind: "inactive-proposal" }>["note"]> }
  | { readonly kind: "blocked-source"; readonly checkpoint: Snapshot<RetainedInterim> }
  | { readonly kind: "held"; readonly reason: "absent" | "invalid" | "newer-version" | "newer-layout" | "source" | "canonical" | "history" | "checkpoint" }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "stale" | "disposed" }

function same(left: unknown, right: unknown): boolean { return isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right) }
function dataRecord(raw: unknown): raw is Record<string, unknown> {
  return isRecord(raw) && Reflect.ownKeys(raw).every(key => {
    const d = Object.getOwnPropertyDescriptor(raw, key)
    return typeof key === "string" && d && "value" in d && d.enumerable
  })
}
function jsonObject(raw: unknown): raw is JsonObject { return dataRecord(raw) && isJsonValue(raw) }
function fact(raw: unknown): raw is HistoricalFact {
  return dataRecord(raw) && (raw.kind === "unknown" && Object.keys(raw).length === 1 || raw.kind === "known" && Object.keys(raw).length === 2 && typeof raw.value === "boolean")
}
function conversionContext(raw: unknown): raw is InterimConversionContext {
  if (!jsonObject(raw) || Object.keys(raw).some(key => !["deviceId", "at", "platform", "commands", "interimShortcutId", "documentGenerations"].includes(key))) return false
  if (typeof raw.deviceId !== "string" || raw.deviceId.trim() === "" || typeof raw.at !== "number" || !Number.isSafeInteger(raw.at) || raw.at < 0 || !isShortcutId(raw.interimShortcutId)) return false
  if (!dataRecord(raw.platform) || Object.keys(raw.platform).some(key => !["browser", "os"].includes(key)) || !["chrome", "firefox"].includes(String(raw.platform.browser)) || !["macos", "windows", "linux"].includes(String(raw.platform.os))) return false
  if (!Array.isArray(raw.commands) || !raw.commands.every(command => dataRecord(command) && Object.keys(command).every(key => ["key", "command"].includes(key)) && isKey(command.key) && typeof command.command === "string" && command.command.trim() !== "")) return false
  return dataRecord(raw.documentGenerations) && Object.entries(raw.documentGenerations).every(([key, gen]) => parseDocumentKey(key) && typeof gen === "string" && gen.trim() !== "")
}
function copy<T>(value: T): T {
  // Callers validate JSON before copying, so no serialization hook can run.
  if (value === null || typeof value !== "object") return value
  const result = Array.isArray(value) ? value.map(child => copy(child)) : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
  return result as T
}
function frozen<T>(value: T): Snapshot<T> {
  const cloned = copy(value)
  const pending: unknown[] = [cloned]
  while (pending.length) {
    const next = pending.pop()
    if (next === null || typeof next !== "object") continue
    pending.push(...Object.values(next)); Object.freeze(next)
  }
  return cloned as Snapshot<T>
}
function inputFor(saved: Pick<RetainedInterim, "source" | "canonical" | "historicalAuthorization" | "priorCredentialPresence">): InterimConversionInput {
  return {
    schema: saved.canonical.schema,
    source: {
      accountBodies: Object.fromEntries(Object.entries(saved.source).filter(([key]) => key.startsWith("account:"))),
      ...Object.fromEntries(markers.filter(key => Object.hasOwn(saved.source, key)).map(key => [key, saved.source[key]])),
      globals: Object.fromEntries(Object.entries(saved.source).filter(([key]) => globals.includes(key)))
    },
    canonical: {
      documents: Object.fromEntries(Object.entries(saved.canonical).filter(([key]) => key.startsWith("doc:"))),
      caches: Object.fromEntries(Object.entries(saved.canonical).filter(([key]) => key.startsWith("cache:"))),
      device: saved.canonical.device, unclaimed: saved.canonical.unclaimed
    },
    historicalAuthorization: saved.historicalAuthorization, priorCredentialPresence: saved.priorCredentialPresence
  }
}
function selected(source: JsonObject, canonical: JsonObject): boolean {
  return Object.keys(source).every(isInterimSourceKey) && hasInterimEvidence(source) && Object.keys(canonical).every(isInterimCanonicalKey)
}
export function readRetainedInterim(raw: unknown): RetainedInterimRead {
  if (raw === undefined) return { kind: "absent" }
  if (!isRecord(raw)) return { kind: "invalid" }
  const version = Object.getOwnPropertyDescriptor(raw, "v")?.value
  if (typeof version === "number" && Number.isSafeInteger(version) && version > 1) return { kind: "newer-version", version }
  if (!dataRecord(raw)) return { kind: "invalid" }
  if (!jsonObject(raw) || raw.v !== 1 || raw.kind !== "retained-interim" || !jsonObject(raw.source) || !jsonObject(raw.canonical) || !selected(raw.source, raw.canonical) || !fact(raw.historicalAuthorization) || !fact(raw.priorCredentialPresence) || !conversionContext(raw.context)) return { kind: "invalid" }
  const base = { source: raw.source, canonical: raw.canonical, historicalAuthorization: raw.historicalAuthorization, priorCredentialPresence: raw.priorCredentialPresence }
  const outcome = planInterimConversion(inputFor(base), raw.context)
  if (outcome.kind !== "blocked" && outcome.kind !== "inactive-proposal") return { kind: "invalid" }
  const recovery = outcome.reviewFacts.conversionShortcut.kind === "validated-context" ? "available" : "unavailable"
  if (!isJsonValue(outcome) || !same(outcome, raw.outcome) || raw.recovery !== recovery) return { kind: "invalid" }
  // Full current-converter equality above validates the stored outcome, including reviewFacts.
  const context: InterimConversionContext = raw.context
  const checkpoint: RetainedInterim = { ...raw, ...base, v: 1, kind: "retained-interim", context, outcome, recovery }
  return { kind: "valid", checkpoint: frozen(checkpoint) }
}
function newer(current: unknown): number | undefined {
  if (!dataRecord(current) || !dataRecord(current.canonical)) return
  const schema = Object.getOwnPropertyDescriptor(current.canonical, "schema")?.value
  return typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION ? schema : undefined
}
function snapshotIssue(current: InterimPersistenceSnapshot): Extract<InterimRetentionResult, { kind: "invalid" | "unrepresentable" }> | undefined {
  if (!dataRecord(current) || !isRecord(current.source) || !isRecord(current.canonical) || !dataRecord(current.checkpoint) || !fact(current.historicalAuthorization) || !fact(current.priorCredentialPresence) || Object.keys(current.source).some(key => !isInterimSourceKey(key)) || Object.keys(current.canonical).some(key => !isInterimCanonicalKey(key)) ||
    !(current.checkpoint.kind === "absent" && Object.keys(current.checkpoint).length === 1 || current.checkpoint.kind === "present" && Object.hasOwn(current.checkpoint, "value") && Object.keys(current.checkpoint).length === 2)) return { kind: "invalid", reason: "snapshot" }
  if (!jsonObject(current.source)) return { kind: "unrepresentable", reason: "source" }
  if (!jsonObject(current.canonical)) return { kind: "unrepresentable", reason: "canonical" }
}
function difference(saved: { readonly source: unknown; readonly canonical: unknown; readonly historicalAuthorization: unknown; readonly priorCredentialPresence: unknown }, current: InterimPersistenceSnapshot): "source" | "canonical" | "history" | undefined {
  if (!same(saved.source, current.source)) return "source"
  if (!same(saved.canonical, current.canonical)) return "canonical"
  if (!same(saved.historicalAuthorization, current.historicalAuthorization) || !same(saved.priorCredentialPresence, current.priorCredentialPresence)) return "history"
}
export function projectInterimNote(input: { readonly checkpoint: unknown; readonly current: InterimPersistenceSnapshot }): InterimNoteRead {
  if (newer(input.current) !== undefined) return { kind: "held", reason: "newer-layout" }
  if (snapshotIssue(input.current)) return { kind: "held", reason: "invalid" }
  const read = readRetainedInterim(input.checkpoint)
  if (read.kind !== "valid") return { kind: "held", reason: read.kind }
  if (input.current.checkpoint.kind !== "present") return { kind: "held", reason: "checkpoint" }
  const present = readRetainedInterim(input.current.checkpoint.value)
  if (present.kind !== "valid") return { kind: "held", reason: present.kind }
  if (!same(input.checkpoint, input.current.checkpoint.value)) return { kind: "held", reason: "checkpoint" }
  const changed = difference(read.checkpoint, input.current)
  if (changed) return { kind: "held", reason: changed }
  return read.checkpoint.outcome.kind === "inactive-proposal"
    ? Object.freeze({ kind: "inactive-proposal", checkpoint: read.checkpoint, note: read.checkpoint.outcome.note })
    : Object.freeze({ kind: "blocked-source", checkpoint: read.checkpoint })
}
export async function executeInterimRetention(deps: {
  readonly local: Pick<LocalWriteStorage, "get" | "set">
  readonly snapshot: () => Promise<InterimPersistenceSnapshot>
  readonly context: (initial: InterimPersistenceSnapshot) => InterimConversionContext
  readonly isStopped: () => boolean
}): Promise<InterimRetentionResult> {
  let initial: InterimPersistenceSnapshot
  try { initial = await deps.snapshot() } catch (error) { return { kind: "failed", stage: "snapshot", error } }
  if (deps.isStopped()) return { kind: "stale", reason: "stopped" }
  const version = newer(initial)
  if (version !== undefined) return { kind: "newer-layout", version }
  const issue = snapshotIssue(initial)
  if (issue) return issue
  if (initial.checkpoint.kind === "present") {
    const read = readRetainedInterim(initial.checkpoint.value)
    if (read.kind === "newer-version") return { kind: "newer-checkpoint", version: read.version }
    if (read.kind !== "valid") return { kind: "invalid", reason: "checkpoint" }
    const changed = difference(read.checkpoint, initial)
    return changed ? { kind: "stale", reason: changed } : { kind: "retained-but-held", checkpoint: read.checkpoint, observation: { kind: "existing" } }
  }
  if (!hasInterimEvidence(initial.source)) return { kind: "not-interim" }
  initial = copy(initial)
  const suppliedContext = deps.context(initial)
  if (!conversionContext(suppliedContext)) return { kind: "invalid", reason: "context" }
  const context = copy(suppliedContext)
  if (!jsonObject(initial.source) || !jsonObject(initial.canonical)) return { kind: "invalid", reason: "snapshot" }
  const base = { source: initial.source, canonical: initial.canonical, historicalAuthorization: initial.historicalAuthorization, priorCredentialPresence: initial.priorCredentialPresence }
  const outcome = planInterimConversion(inputFor(base), context)
  if (outcome.kind !== "blocked" && outcome.kind !== "inactive-proposal") return { kind: "invalid", reason: "snapshot" }
  const intended = { v: 1, kind: "retained-interim", ...base, context, outcome, recovery: outcome.reviewFacts.conversionShortcut.kind === "validated-context" ? "available" : "unavailable" } satisfies RetainedInterim
  const read = readRetainedInterim(intended)
  if (read.kind !== "valid" || !isJsonValue(intended)) return { kind: "invalid", reason: "checkpoint" }
  const checkpoint = read.checkpoint
  let preflight: InterimPersistenceSnapshot
  try { preflight = await deps.snapshot() } catch (error) { return { kind: "failed", stage: "preflight", error } }
  if (deps.isStopped()) return { kind: "stale", reason: "stopped" }
  if (snapshotIssue(preflight)) return { kind: "stale", reason: "source" }
  const changed = difference(checkpoint, preflight)
  if (changed) return { kind: "stale", reason: changed }
  if (preflight.checkpoint.kind !== "absent") return { kind: "stale", reason: "checkpoint" }
  let observation: WriteObservation = { kind: "resolved" }
  try { await deps.local.set({ [interimConversionKey]: copy(intended) }) } catch (error) { observation = { kind: "rejected", error } }
  let observed: InterimPersistenceSnapshot
  try { observed = await deps.snapshot() } catch (error) { return { kind: "unconfirmed", observation, cause: { kind: "read-failed", error } } }
  if (deps.isStopped()) return { kind: "unconfirmed", observation, cause: { kind: "stopped" } }
  if (snapshotIssue(observed) || difference(checkpoint, observed)) return { kind: "unconfirmed", observation, cause: { kind: "readback" } }
  if (observed.checkpoint.kind === "present" && same(observed.checkpoint.value, intended)) return { kind: "retained-but-held", checkpoint, observation }
  if (observation.kind === "rejected" && observed.checkpoint.kind === "absent") return { kind: "failed", stage: "set", observation }
  return { kind: "unconfirmed", observation, cause: { kind: "readback" } }
}
