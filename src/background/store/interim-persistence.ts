import {
  deriveInterimInstallationEffect,
  readInterimInstallationHistory,
  retainedInstallationDifference,
  type RetainedInstallationV3,
  type RetainedInstallationHistory,
  type ConfirmedRetainedAgreementV2,
  type InterimInstallationDifference
} from "./interim-installation"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { readRetainedRecovery, retainedRecoveryDifference, recoveryHistory, type RetainedRecoveryV4 } from "./interim-recovery-execution"
import { archiveRetained, coversArchivedSource, currentAuthorityAnchor, readCanonicalAuthorityRecord, type RetainedCanonicalAuthorityV5 } from "./interim-canonical-authority"
import { isRecord } from "../../shared/model/codec"
import { isKey } from "../../shared/model/keys"
import { CONSENT_VERSION, STORAGE_SCHEMA_VERSION } from "../../shared/model/documents"
import { decodeDevice } from "../../shared/model/decodeDevice"
import type { Device } from "../../shared/model/types"
import { isShortcutId, parseDocumentKey } from "../../shared/model/validation"
import type { Snapshot } from "../../shared/model/settings-view"
import type { StartupHost } from "./legacy-execution"
import type { LocalWriteStorage } from "./local-filter-writer"
import { planInterimConversion, type HistoricalFact, type InterimConversionContext, type InterimConversionInput, type InterimConversionPlan } from "./interim-conversion"
import { sameSyncJson } from "./sync-write-admission"

export const interimConversionKey = "interimConversion"
const markers = ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]
const globals = [
  "playlists",
  "addToPlaylistID",
  "watchLaterShortcut",
  "requiredWatchPercentage",
  "toastEnabled",
  "channelFilters",
  "channelLabels",
  "cachedPlaylists",
  "preventDuplicates",
  "queueButtonEnabled",
  "cardContextMenu"
]
export function isInterimSourceKey(key: string): boolean {
  return key.startsWith("account:") || markers.includes(key) || globals.includes(key)
}
export function isInterimCanonicalKey(key: string): boolean {
  return ["schema", "device", "unclaimed"].includes(key) || key.startsWith("doc:") || key.startsWith("cache:")
}
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

export type RetainedAgreementEffect = {
  readonly consent: NonNullable<Device["consent"]>
  readonly device: JsonObject
}
export type RetainedAgreementV2 = {
  readonly v: 2
  readonly kind: "retained-interim"
  readonly retained: RetainedInterim
  readonly agreement: { readonly kind: "accepted"; readonly effect: RetainedAgreementEffect } | { readonly kind: "confirmed"; readonly effect: RetainedAgreementEffect }
}
export type AcceptedRetainedAgreementV2 = Omit<RetainedAgreementV2, "agreement"> & {
  readonly agreement: { readonly kind: "accepted"; readonly effect: RetainedAgreementEffect }
}
export type RetainedCheckpointRead =
  | RetainedInterimRead
  | { readonly kind: "agreement"; readonly checkpoint: Snapshot<RetainedAgreementV2> }
  | { readonly kind: "installation"; readonly checkpoint: Snapshot<RetainedInstallationV3> }
  | { readonly kind: "recovery"; readonly checkpoint: Snapshot<RetainedRecoveryV4> }
  | { readonly kind: "authority"; readonly checkpoint: Snapshot<RetainedCanonicalAuthorityV5> }

type WriteObservation = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
export type InterimRetentionResult =
  | { readonly kind: "not-interim" }
  | { readonly kind: "newer-layout"; readonly version: number }
  | { readonly kind: "retained-but-held"; readonly checkpoint: Snapshot<RetainedInterim>; readonly observation: WriteObservation | { readonly kind: "existing" } }
  | { readonly kind: "retained-agreement" | "pending-agreement"; readonly checkpoint: Snapshot<RetainedAgreementV2> }
  | { readonly kind: "pending-installation" | "installed-interim"; readonly checkpoint: Snapshot<RetainedInstallationV3> }
  | { readonly kind: "pending-recovery" | "confirmed-recovery"; readonly checkpoint: Snapshot<RetainedRecoveryV4> }
  | { readonly kind: "pending-authority"; readonly checkpoint: Snapshot<RetainedCanonicalAuthorityV5> }
  | { readonly kind: "canonical-authority"; readonly checkpoint: Snapshot<RetainedCanonicalAuthorityV5>; readonly owner: "required" | "authority-host" | "controller" | "stale" }
  | { readonly kind: "invalid"; readonly reason: "snapshot" | "checkpoint" | "context" }
  | { readonly kind: "newer-checkpoint"; readonly version: number }
  | { readonly kind: "unrepresentable"; readonly reason: "source" | "canonical" }
  | { readonly kind: "stale"; readonly reason: "source" | "canonical" | "history" | "checkpoint" | "stopped" }
  | { readonly kind: "failed"; readonly stage: "snapshot" | "preflight"; readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: "set"; readonly observation: Extract<WriteObservation, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly observation: WriteObservation; readonly cause: { readonly kind: "readback" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }
export type InterimNoteRead =
  | {
      readonly kind: "canonical-archive"
      readonly checkpoint: Snapshot<RetainedCanonicalAuthorityV5>
      readonly note: Snapshot<Extract<RetainedOutcome, { kind: "inactive-proposal" }>["note"]>
      readonly activation: "canonical"
      readonly recovery: "retained-inactive"
    }
  | {
      readonly kind: "pending-installation" | "installed-interim"
      readonly checkpoint: Snapshot<RetainedInstallationV3>
      readonly note: Snapshot<Extract<RetainedOutcome, { kind: "inactive-proposal" }>["note"]>
      readonly agreement: "confirmed"
      readonly activation: "held"
    }
  | {
      readonly kind: "inactive-proposal"
      readonly checkpoint: Snapshot<RetainedInterim>
      readonly note: Snapshot<Extract<RetainedOutcome, { kind: "inactive-proposal" }>["note"]>
      readonly agreement?: "confirmed"
    }
  | { readonly kind: "blocked-source"; readonly checkpoint: Snapshot<RetainedInterim>; readonly agreement?: "confirmed" }
  | { readonly kind: "pending-agreement"; readonly checkpoint: Snapshot<RetainedAgreementV2>; readonly activation: "held" }
  | { readonly kind: "held"; readonly reason: "absent" | "invalid" | "newer-version" | "newer-layout" | "source" | "canonical" | "history" | "checkpoint" }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "stale" | "disposed" }

function same(left: unknown, right: unknown): boolean {
  return isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right)
}
function dataRecord(raw: unknown): raw is Record<string, unknown> {
  return (
    isRecord(raw) &&
    Reflect.ownKeys(raw).every(key => {
      const d = Object.getOwnPropertyDescriptor(raw, key)
      return typeof key === "string" && d && "value" in d && d.enumerable
    })
  )
}
function jsonObject(raw: unknown): raw is JsonObject {
  return dataRecord(raw) && isJsonValue(raw)
}
function fact(raw: unknown): raw is HistoricalFact {
  return dataRecord(raw) && ((raw.kind === "unknown" && Object.keys(raw).length === 1) || (raw.kind === "known" && Object.keys(raw).length === 2 && typeof raw.value === "boolean"))
}
function conversionContext(raw: unknown): raw is InterimConversionContext {
  if (!jsonObject(raw) || Object.keys(raw).some(key => !["deviceId", "at", "platform", "commands", "interimShortcutId", "documentGenerations"].includes(key))) return false
  if (typeof raw.deviceId !== "string" || raw.deviceId.trim() === "" || typeof raw.at !== "number" || !Number.isSafeInteger(raw.at) || raw.at < 0 || !isShortcutId(raw.interimShortcutId)) return false
  if (
    !dataRecord(raw.platform) ||
    Object.keys(raw.platform).some(key => !["browser", "os"].includes(key)) ||
    !["chrome", "firefox"].includes(String(raw.platform.browser)) ||
    !["macos", "windows", "linux"].includes(String(raw.platform.os))
  )
    return false
  if (
    !Array.isArray(raw.commands) ||
    !raw.commands.every(
      command =>
        dataRecord(command) && Object.keys(command).every(key => ["key", "command"].includes(key)) && isKey(command.key) && typeof command.command === "string" && command.command.trim() !== ""
    )
  )
    return false
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
    pending.push(...Object.values(next))
    Object.freeze(next)
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
      device: saved.canonical.device,
      unclaimed: saved.canonical.unclaimed
    },
    historicalAuthorization: saved.historicalAuthorization,
    priorCredentialPresence: saved.priorCredentialPresence
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
  if (
    !jsonObject(raw) ||
    raw.v !== 1 ||
    raw.kind !== "retained-interim" ||
    !jsonObject(raw.source) ||
    !jsonObject(raw.canonical) ||
    !selected(raw.source, raw.canonical) ||
    !fact(raw.historicalAuthorization) ||
    !fact(raw.priorCredentialPresence) ||
    !conversionContext(raw.context)
  )
    return { kind: "invalid" }
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
export function retainedAgreementDevice(retained: Snapshot<RetainedInterim>, consent: NonNullable<Device["consent"]>): JsonObject | undefined {
  if (Object.hasOwn(retained.canonical, "schema") && Object.getOwnPropertyDescriptor(retained.canonical, "schema")?.value !== STORAGE_SCHEMA_VERSION) return
  if (consent.v !== CONSENT_VERSION || !Number.isSafeInteger(consent.at) || consent.at < 0) return
  if (!Object.hasOwn(retained.canonical, "device")) return { id: retained.context.deviceId, consent: { ...consent }, syncOn: false }
  const raw: unknown = Object.getOwnPropertyDescriptor(retained.canonical, "device")?.value
  if (!jsonObject(raw) || !["id", "consent", "syncOn"].every(key => Object.hasOwn(raw, key))) return
  try {
    const device = decodeDevice(raw)
    if (device.consent && device.consent.v > CONSENT_VERSION) return
    return { ...copy(raw), consent: { ...consent } }
  } catch {
    return
  }
}
export function readRetainedCheckpoint(raw: unknown): RetainedCheckpointRead {
  if (!isRecord(raw)) return readRetainedInterim(raw)
  const version = Object.getOwnPropertyDescriptor(raw, "v")?.value
  if (typeof version === "number" && Number.isSafeInteger(version) && version > 5) return { kind: "newer-version", version }
  if (version === 5) return readCanonicalAuthorityRecord(raw)
  if (version === 4) return readRetainedRecovery(raw)
  if (version === 3) {
    if (
      !jsonObject(raw) ||
      raw.kind !== "retained-interim" ||
      !dataRecord(raw.installation) ||
      Object.keys(raw.installation).length !== 2 ||
      !["accepted", "installed"].includes(String(raw.installation.kind)) ||
      !dataRecord(raw.installation.history)
    )
      return { kind: "invalid" }
    const nested = readRetainedCheckpoint(raw.agreed),
      history = raw.installation.history
    if (
      nested.kind !== "agreement" ||
      nested.checkpoint.agreement.kind !== "confirmed" ||
      !((history.kind === "absent" && Object.keys(history).length === 1) || (history.kind === "present" && Object.keys(history).length === 2 && jsonObject(history.raw)))
    )
      return { kind: "invalid" }
    const checked = readInterimInstallationHistory(history.kind === "absent" ? {} : { sync: history.raw as JsonObject })
    const agreed = { ...nested.checkpoint, agreement: { ...nested.checkpoint.agreement, kind: "confirmed" as const } }
    if (checked.kind !== "history" || deriveInterimInstallationEffect(agreed).kind !== "effect") return { kind: "invalid" }
    const checkpoint: RetainedInstallationV3 = {
      ...raw,
      v: 3,
      kind: "retained-interim",
      agreed: copy(raw.agreed as unknown as ConfirmedRetainedAgreementV2),
      installation: { kind: raw.installation.kind === "accepted" ? "accepted" : "installed", history: checked.history }
    }
    return { kind: "installation", checkpoint: frozen(checkpoint) }
  }
  if (version !== 2) return readRetainedInterim(raw)
  if (
    !jsonObject(raw) ||
    raw.kind !== "retained-interim" ||
    !dataRecord(raw.agreement) ||
    !["accepted", "confirmed"].includes(String(raw.agreement.kind)) ||
    Object.keys(raw.agreement).some(key => !["kind", "effect"].includes(key)) ||
    !dataRecord(raw.agreement.effect) ||
    Object.keys(raw.agreement.effect).some(key => !["consent", "device"].includes(key))
  )
    return { kind: "invalid" }
  const original = readRetainedInterim(raw.retained),
    effect = raw.agreement.effect
  if (
    original.kind !== "valid" ||
    !jsonObject(effect.consent) ||
    Object.keys(effect.consent).length !== 2 ||
    effect.consent.v !== CONSENT_VERSION ||
    typeof effect.consent.at !== "number" ||
    !Number.isSafeInteger(effect.consent.at) ||
    effect.consent.at < 0 ||
    !jsonObject(effect.device)
  )
    return { kind: "invalid" }
  const consent = { v: CONSENT_VERSION, at: effect.consent.at }
  const device = retainedAgreementDevice(original.checkpoint, consent)
  if (!device || !same(device, effect.device)) return { kind: "invalid" }
  const checkpoint: RetainedAgreementV2 = {
    ...raw,
    v: 2,
    kind: "retained-interim",
    retained: copy(raw.retained as unknown as RetainedInterim),
    agreement: { kind: raw.agreement.kind === "accepted" ? "accepted" : "confirmed", effect: { consent, device } }
  }
  return { kind: "agreement", checkpoint: frozen(checkpoint) }
}
function newer(current: unknown): number | undefined {
  if (!dataRecord(current) || !dataRecord(current.canonical)) return
  const schema = Object.getOwnPropertyDescriptor(current.canonical, "schema")?.value
  return typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION ? schema : undefined
}
function snapshotIssue(current: InterimPersistenceSnapshot): Extract<InterimRetentionResult, { kind: "invalid" | "unrepresentable" }> | undefined {
  if (
    !dataRecord(current) ||
    !isRecord(current.source) ||
    !isRecord(current.canonical) ||
    !dataRecord(current.checkpoint) ||
    !fact(current.historicalAuthorization) ||
    !fact(current.priorCredentialPresence) ||
    Object.keys(current.source).some(key => !isInterimSourceKey(key)) ||
    Object.keys(current.canonical).some(key => !isInterimCanonicalKey(key)) ||
    !(
      (current.checkpoint.kind === "absent" && Object.keys(current.checkpoint).length === 1) ||
      (current.checkpoint.kind === "present" && Object.hasOwn(current.checkpoint, "value") && Object.keys(current.checkpoint).length === 2)
    )
  )
    return { kind: "invalid", reason: "snapshot" }
  if (!jsonObject(current.source)) return { kind: "unrepresentable", reason: "source" }
  if (!jsonObject(current.canonical)) return { kind: "unrepresentable", reason: "canonical" }
}
function difference(
  saved: { readonly source: unknown; readonly canonical: unknown; readonly historicalAuthorization: unknown; readonly priorCredentialPresence: unknown },
  current: InterimPersistenceSnapshot
): "source" | "canonical" | "history" | undefined {
  if (!same(saved.source, current.source)) return "source"
  if (!same(saved.canonical, current.canonical)) return "canonical"
  if (!same(saved.historicalAuthorization, current.historicalAuthorization) || !same(saved.priorCredentialPresence, current.priorCredentialPresence)) return "history"
}
export function retainedCheckpointDifference(checkpoint: Snapshot<RetainedInterim | RetainedAgreementV2>, current: InterimPersistenceSnapshot): InterimInstallationDifference
export function retainedCheckpointDifference(checkpoint: Snapshot<RetainedInstallationV3>, current: InterimPersistenceSnapshot, history: RetainedInstallationHistory): InterimInstallationDifference
export function retainedCheckpointDifference(
  checkpoint: Snapshot<RetainedInterim | RetainedAgreementV2 | RetainedInstallationV3>,
  current: InterimPersistenceSnapshot,
  history?: RetainedInstallationHistory
): "source" | "canonical" | "history" | "checkpoint" | undefined {
  if (checkpoint.v === 3) return history === undefined ? "history" : retainedInstallationDifference({ checkpoint, current, history })
  if (snapshotIssue(current)) return "source"
  if (current.checkpoint.kind !== "present" || !same(checkpoint, current.checkpoint.value)) return "checkpoint"
  if (checkpoint.v === 1) return difference(checkpoint, current)
  const original = checkpoint.retained
  const canonical: unknown = original.canonical
  if (!jsonObject(canonical)) return "canonical"
  const after = { ...canonical, device: Object.getOwnPropertyDescriptor(checkpoint.agreement.effect, "device")?.value }
  if (checkpoint.agreement.kind === "accepted" && same(original.canonical, current.canonical)) return difference(original, current)
  return difference({ ...original, canonical: after }, current)
}
export function recoveredRetainedAgreementDifference(
  checkpoint: Snapshot<RetainedAgreementV2>,
  current: InterimPersistenceSnapshot,
  currentAgreement: NonNullable<Device["consent"]>,
  progress: "accepted" | "terminal"
): "source" | "canonical" | "history" | "checkpoint" | undefined {
  if (snapshotIssue(current)) return "source"
  if (checkpoint.agreement.kind !== "accepted") return "checkpoint"
  const confirmed = { ...checkpoint, agreement: { ...checkpoint.agreement, kind: "confirmed" } }
  if (current.checkpoint.kind !== "present" || !(same(checkpoint, current.checkpoint.value) || (progress === "terminal" && same(confirmed, current.checkpoint.value)))) return "checkpoint"
  const original = checkpoint.retained
  const effectDevice: unknown = checkpoint.agreement.effect.device,
    canonical: unknown = original.canonical
  if (!jsonObject(effectDevice) || !jsonObject(canonical)) return "canonical"
  return difference({ ...original, canonical: { ...canonical, device: { ...effectDevice, consent: { ...currentAgreement } } } }, current)
}
export function recoveredRetainedV1AgreementDifference(
  retained: Snapshot<RetainedInterim>,
  accepted: Snapshot<AcceptedRetainedAgreementV2>,
  current: InterimPersistenceSnapshot,
  currentAgreement: NonNullable<Device["consent"]>,
  checkpoint: "v1" | "accepted" | "confirmed"
): "source" | "canonical" | "history" | "checkpoint" | undefined {
  if (snapshotIssue(current)) return "source"
  const original = readRetainedInterim(retained),
    parsed = readRetainedCheckpoint(accepted)
  if (original.kind !== "valid" || parsed.kind !== "agreement" || parsed.checkpoint.agreement.kind !== "accepted" || !same(accepted.retained, retained)) return "checkpoint"
  const expected = checkpoint === "v1" ? retained : checkpoint === "accepted" ? accepted : { ...accepted, agreement: { ...accepted.agreement, kind: "confirmed" } }
  if (current.checkpoint.kind !== "present" || !same(expected, current.checkpoint.value)) return "checkpoint"
  const device = retainedAgreementDevice(retained, currentAgreement),
    canonical: unknown = retained.canonical
  if (!device || !jsonObject(canonical) || !Object.hasOwn(canonical, "device")) return "canonical"
  return difference({ ...retained, canonical: { ...canonical, device } }, current)
}
export function projectInterimNote(input: { readonly checkpoint: unknown; readonly current: InterimPersistenceSnapshot }): InterimNoteRead {
  if (newer(input.current) !== undefined) return { kind: "held", reason: "newer-layout" }
  if (snapshotIssue(input.current)) return { kind: "held", reason: "invalid" }
  const read = readRetainedCheckpoint(input.checkpoint)
  if (read.kind === "authority") {
    if (read.checkpoint.handoff.kind !== "canonical") return { kind: "held", reason: "history" }
    if (input.current.checkpoint.kind !== "present" || !same(input.checkpoint, input.current.checkpoint.value)) return { kind: "held", reason: "checkpoint" }
    const original = archiveRetained(read.checkpoint.archive)
    if (!same(original.source, input.current.source)) return { kind: "held", reason: "source" }
    if (!same(original.historicalAuthorization, input.current.historicalAuthorization) || !same(original.priorCredentialPresence, input.current.priorCredentialPresence))
      return { kind: "held", reason: "history" }
    if (original.outcome.kind !== "inactive-proposal") return { kind: "held", reason: "invalid" }
    return { kind: "canonical-archive", checkpoint: read.checkpoint, note: original.outcome.note, activation: "canonical", recovery: "retained-inactive" }
  }
  if (read.kind === "installation" || read.kind === "recovery") return { kind: "held", reason: "history" }
  if (read.kind !== "valid" && read.kind !== "agreement") return { kind: "held", reason: read.kind }
  if (input.current.checkpoint.kind !== "present") return { kind: "held", reason: "checkpoint" }
  const present = readRetainedCheckpoint(input.current.checkpoint.value)
  if (present.kind === "installation" || present.kind === "recovery" || present.kind === "authority") return { kind: "held", reason: "history" }
  if (present.kind !== "valid" && present.kind !== "agreement") return { kind: "held", reason: present.kind }
  if (!same(input.checkpoint, input.current.checkpoint.value)) return { kind: "held", reason: "checkpoint" }
  const changed = retainedCheckpointDifference(read.checkpoint, input.current)
  if (changed) return { kind: "held", reason: changed }
  if (read.kind === "agreement" && read.checkpoint.agreement.kind === "accepted") return Object.freeze({ kind: "pending-agreement", checkpoint: read.checkpoint, activation: "held" })
  const checkpoint = read.kind === "agreement" ? read.checkpoint.retained : read.checkpoint
  const status = read.kind === "agreement" ? { agreement: "confirmed" as const } : {}
  return checkpoint.outcome.kind === "inactive-proposal"
    ? Object.freeze({ kind: "inactive-proposal", checkpoint, note: checkpoint.outcome.note, ...status })
    : Object.freeze({ kind: "blocked-source", checkpoint, ...status })
}
export function projectInterimInstallationNote(input: { readonly checkpoint: unknown; readonly current: InterimPersistenceSnapshot; readonly history: RetainedInstallationHistory }): InterimNoteRead {
  if (newer(input.current) !== undefined) return { kind: "held", reason: "newer-layout" }
  if (snapshotIssue(input.current)) return { kind: "held", reason: "invalid" }
  const read = readRetainedCheckpoint(input.checkpoint)
  if (read.kind !== "installation") return { kind: "held", reason: read.kind === "newer-version" ? "newer-version" : "invalid" }
  const changed = retainedInstallationDifference({ checkpoint: read.checkpoint, current: input.current, history: input.history })
  if (changed) return { kind: "held", reason: changed }
  const outcome = read.checkpoint.agreed.retained.outcome
  if (outcome.kind !== "inactive-proposal") return { kind: "held", reason: "invalid" }
  return Object.freeze({
    kind: read.checkpoint.installation.kind === "accepted" ? "pending-installation" : "installed-interim",
    checkpoint: read.checkpoint,
    note: outcome.note,
    agreement: "confirmed",
    activation: "held"
  })
}
export async function executeInterimRetention(deps: {
  readonly local: Pick<LocalWriteStorage, "get" | "set">
  readonly snapshot: () => Promise<InterimPersistenceSnapshot>
  readonly context: (initial: InterimPersistenceSnapshot) => InterimConversionContext
  readonly isStopped: () => boolean
}): Promise<InterimRetentionResult> {
  let initial: InterimPersistenceSnapshot
  try {
    initial = await deps.snapshot()
  } catch (error) {
    return { kind: "failed", stage: "snapshot", error }
  }
  if (deps.isStopped()) return { kind: "stale", reason: "stopped" }
  const version = newer(initial)
  if (version !== undefined) return { kind: "newer-layout", version }
  const issue = snapshotIssue(initial)
  if (issue) return issue
  if (initial.checkpoint.kind === "present") {
    const read = readRetainedCheckpoint(initial.checkpoint.value)
    if (read.kind === "newer-version") return { kind: "newer-checkpoint", version: read.version }
    if (read.kind === "authority") {
      try {
        const raw = await deps.local.get(null)
        if (!jsonObject(raw)) return { kind: "invalid", reason: "snapshot" }
        const records = copy(raw),
          current = await deps.snapshot()
        if (deps.isStopped()) return { kind: "stale", reason: "stopped" }
        if (snapshotIssue(current)) return { kind: "invalid", reason: "snapshot" }
        const selectedMap = (keep: (key: string) => boolean) => Object.fromEntries(Object.entries(records).filter(([key]) => keep(key)))
        if (
          !same(initial, current) ||
          !same(selectedMap(isInterimSourceKey), current.source) ||
          !same(selectedMap(isInterimCanonicalKey), current.canonical) ||
          !same({ kind: "present", value: records[interimConversionKey] }, current.checkpoint)
        )
          return { kind: "stale", reason: "checkpoint" }
        const checkpoint = read.checkpoint,
          original = archiveRetained(checkpoint.archive)
        if (!coversArchivedSource(records, checkpoint)) return { kind: "stale", reason: "source" }
        if (!same(original.historicalAuthorization, current.historicalAuthorization) || !same(original.priorCredentialPresence, current.priorCredentialPresence))
          return { kind: "stale", reason: "history" }
        if (checkpoint.handoff.kind === "canonical") return { kind: "canonical-authority", checkpoint, owner: "required" }
        const anchor = currentAuthorityAnchor(records)
        if (!anchor || !same(anchor.history, checkpoint.handoff.anchor.history) || !same(anchor.join, checkpoint.handoff.anchor.join)) return { kind: "stale", reason: "history" }
        if (!same(anchor.canonical, checkpoint.handoff.anchor.canonical)) return { kind: "stale", reason: "canonical" }
        return { kind: "pending-authority", checkpoint }
      } catch (error) {
        return { kind: "failed", stage: "snapshot", error }
      }
    }
    if (read.kind === "recovery") {
      try {
        const raw = await deps.local.get(null)
        if (!jsonObject(raw)) return { kind: "invalid", reason: "snapshot" }
        const records = copy(raw),
          history = recoveryHistory(records),
          current = await deps.snapshot()
        if (deps.isStopped()) return { kind: "stale", reason: "stopped" }
        if (!history) return { kind: "stale", reason: "history" }
        if (snapshotIssue(current)) return { kind: "invalid", reason: "snapshot" }
        const selectedMap = (keep: (key: string) => boolean) => Object.fromEntries(Object.entries(records).filter(([key]) => keep(key)))
        if (
          !same(initial, current) ||
          !same(selectedMap(isInterimSourceKey), current.source) ||
          !same(selectedMap(isInterimCanonicalKey), current.canonical) ||
          !same({ kind: "present", value: records[interimConversionKey] }, current.checkpoint)
        )
          return { kind: "stale", reason: "checkpoint" }
        const changed = retainedRecoveryDifference({ checkpoint: read.checkpoint, current, history })
        if (changed) return { kind: "stale", reason: changed }
        return { kind: read.checkpoint.pending.kind === "none" ? "confirmed-recovery" : "pending-recovery", checkpoint: read.checkpoint }
      } catch (error) {
        return { kind: "failed", stage: "snapshot", error }
      }
    }
    if (read.kind === "installation") {
      try {
        const rawRecords = await deps.local.get(null)
        if (!jsonObject(rawRecords)) return { kind: "invalid", reason: "snapshot" }
        const records = copy(rawRecords)
        const history = readInterimInstallationHistory(records)
        if (history.kind !== "history") return { kind: "stale", reason: "history" }
        const selectedMap = (keep: (key: string) => boolean) => Object.fromEntries(Object.entries(records).filter(([key]) => keep(key)))
        const present = Object.hasOwn(records, interimConversionKey) ? { kind: "present", value: records[interimConversionKey] } : { kind: "absent" }
        const current = await deps.snapshot()
        if (deps.isStopped()) return { kind: "stale", reason: "stopped" }
        if (snapshotIssue(current)) return { kind: "invalid", reason: "snapshot" }
        if (!same(initial, current) || !same(selectedMap(isInterimSourceKey), current.source) || !same(selectedMap(isInterimCanonicalKey), current.canonical) || !same(present, current.checkpoint))
          return { kind: "stale", reason: "checkpoint" }
        const changed = retainedInstallationDifference({ checkpoint: read.checkpoint, current, history: history.history })
        if (changed) return { kind: "stale", reason: changed }
        return { kind: read.checkpoint.installation.kind === "accepted" ? "pending-installation" : "installed-interim", checkpoint: read.checkpoint }
      } catch (error) {
        return { kind: "failed", stage: "snapshot", error }
      }
    }
    if (read.kind !== "valid" && read.kind !== "agreement") return { kind: "invalid", reason: "checkpoint" }
    const changed = retainedCheckpointDifference(read.checkpoint, initial)
    if (changed) return { kind: "stale", reason: changed }
    return read.kind === "agreement"
      ? { kind: read.checkpoint.agreement.kind === "accepted" ? "pending-agreement" : "retained-agreement", checkpoint: read.checkpoint }
      : { kind: "retained-but-held", checkpoint: read.checkpoint, observation: { kind: "existing" } }
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
  const intended = {
    v: 1,
    kind: "retained-interim",
    ...base,
    context,
    outcome,
    recovery: outcome.reviewFacts.conversionShortcut.kind === "validated-context" ? "available" : "unavailable"
  } satisfies RetainedInterim
  const read = readRetainedInterim(intended)
  if (read.kind !== "valid" || !isJsonValue(intended)) return { kind: "invalid", reason: "checkpoint" }
  const checkpoint = read.checkpoint
  let preflight: InterimPersistenceSnapshot
  try {
    preflight = await deps.snapshot()
  } catch (error) {
    return { kind: "failed", stage: "preflight", error }
  }
  if (deps.isStopped()) return { kind: "stale", reason: "stopped" }
  if (snapshotIssue(preflight)) return { kind: "stale", reason: "source" }
  const changed = difference(checkpoint, preflight)
  if (changed) return { kind: "stale", reason: changed }
  if (preflight.checkpoint.kind !== "absent") return { kind: "stale", reason: "checkpoint" }
  let observation: WriteObservation = { kind: "resolved" }
  try {
    await deps.local.set({ [interimConversionKey]: copy(intended) })
  } catch (error) {
    observation = { kind: "rejected", error }
  }
  let observed: InterimPersistenceSnapshot
  try {
    observed = await deps.snapshot()
  } catch (error) {
    return { kind: "unconfirmed", observation, cause: { kind: "read-failed", error } }
  }
  if (deps.isStopped()) return { kind: "unconfirmed", observation, cause: { kind: "stopped" } }
  if (snapshotIssue(observed) || difference(checkpoint, observed)) return { kind: "unconfirmed", observation, cause: { kind: "readback" } }
  if (observed.checkpoint.kind === "present" && same(observed.checkpoint.value, intended)) return { kind: "retained-but-held", checkpoint, observation }
  if (observation.kind === "rejected" && observed.checkpoint.kind === "absent") return { kind: "failed", stage: "set", observation }
  return { kind: "unconfirmed", observation, cause: { kind: "readback" } }
}
