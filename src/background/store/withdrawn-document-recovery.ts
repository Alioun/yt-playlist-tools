import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { documentKey, parseDocumentKey, decodeSyncState, decodeDocument, decodeSetup, isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model"
import type { Origin } from "../../shared/contracts/results"
import { agreementOrigin, detachAgreement, type AgreementWrite } from "./consent-agreement"
import { consentObject, readConsentDevice, type Agreement } from "./consent-withdrawal"
import { consentJobsKey, parseConsentJobs, sameConsentValue as same, freezeConsentValue, type ConsentJobs, type ConsentRetainedAgreementJob, type HeldJobSelection } from "./consent-recovery"
import {
  readRetainedRecovery,
  startingCanonical,
  recoveryRetained,
  recoveryHistory,
  documentResolution,
  type RetainedRecoveryV4,
  type PlaylistRestoreEffect,
  type FilterReplacementEffect,
  type RecoveryStoredObject,
  type RecoveryHost,
  type InstalledRetainedV3
} from "./interim-recovery-execution"
import type { ConfirmedRetainedAgreementV2 } from "./interim-installation"
import { interimConversionKey, isInterimSourceKey, isInterimCanonicalKey, type InterimPersistenceSnapshot } from "./interim-persistence"
import { pendingAccountRemovalKey } from "./account-removal-execution"
import { pendingSyncJoinKey, readSyncJoinCheckpoint } from "./sync-join-persistence"
import { planSyncWrite } from "./sync-write-admission"
import { readSyncDocument } from "./sync-codec"
import { prepareFirstEditHistory } from "./first-edit-provenance"
import type { ClaimAuthority } from "./local-claim-writer"

type UiOrigin = Extract<Origin, { kind: "ui" }>
export type AcceptedFilterRecord = Omit<RetainedRecoveryV4, "basis" | "pending"> & {
  readonly basis: { readonly checkpoint: ConfirmedRetainedAgreementV2; readonly history: RecoveryStoredObject }
  readonly pending: { readonly kind: "filter-replacement"; readonly effect: Omit<FilterReplacementEffect, "key"> & { readonly key: Readonly<FilterReplacementEffect["key"]> } }
} & JsonObject
export type CompletedFilterRecord = Omit<RetainedRecoveryV4, "basis" | "pending"> & { readonly basis: AcceptedFilterRecord["basis"]; readonly pending: { readonly kind: "none" } } & JsonObject
export type RetainedFilterJobIdentity = {
  readonly deviceId: string
  readonly occurrence: number
  readonly operation: { readonly kind: "retained-filter-replacement"; readonly record: AcceptedFilterRecord }
  readonly original: Agreement
}
export type RetainedFilterDescriptor = { readonly kind: "retained-filter-replacement"; readonly deviceId: string; readonly accepted: AcceptedFilterRecord }
export type RegisteredFilterWitness = { readonly descriptor: RetainedFilterDescriptor; readonly registration: { readonly kind: "registered"; readonly occurrence: number } }
type Permission = ConsentRetainedAgreementJob["permission"]
export type ConsentRetainedFilterJob =
  | { readonly identity: RetainedFilterJobIdentity; readonly progress: { readonly kind: "accepted" }; readonly permission: Extract<Permission, { kind: "held" | "prepared" | "armed" }> }
  | { readonly identity: RetainedFilterJobIdentity; readonly progress: { readonly kind: "terminal" }; readonly permission: Exclude<Permission, { kind: "held" }> }
export type RetainedFilterView = {
  readonly kind: "retained-filter-replacement"
  readonly selection: HeldJobSelection
  readonly identity: RetainedFilterJobIdentity
  readonly registration: "unregistered" | "registered"
  readonly checkpoint: "pending" | "completed"
  readonly progress: "accepted" | "terminal"
  readonly current: Agreement
  readonly recoverability: "exact-retained-document"
}
export type FilterRecoveryStage = "register" | "prepare" | "authorize" | "documents" | "retire" | "record" | "done"
type Revision = { readonly owner: number; readonly authority: number; readonly snapshot: number }
export type FilterRecoveryMutation = { readonly stage: FilterRecoveryStage; readonly write: AgreementWrite; readonly observed: { readonly before: Revision; readonly after: Revision } }
export type FilterObservationFailure = { readonly kind: "different" | "authority" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown }
export type RetainedFilterExecution =
  | {
      readonly kind: "confirmed"
      readonly identity: RetainedFilterJobIdentity
      readonly original: Agreement
      readonly current: Agreement
      readonly activation: "held"
      readonly mutations: readonly FilterRecoveryMutation[]
    }
  | {
      readonly kind: "failed"
      readonly identity: RetainedFilterJobIdentity
      readonly stage: FilterRecoveryStage
      readonly write: Extract<AgreementWrite, { kind: "rejected" }>
      readonly mutations: readonly FilterRecoveryMutation[]
    }
  | {
      readonly kind: "unconfirmed"
      readonly identity: RetainedFilterJobIdentity
      readonly stage: FilterRecoveryStage
      readonly write: AgreementWrite
      readonly observation: FilterObservationFailure
      readonly mutations: readonly FilterRecoveryMutation[]
    }
  | { readonly kind: "unavailable"; readonly identity: RetainedFilterJobIdentity; readonly reason: "stale" | "disposed"; readonly mutations: readonly [] }
  | { readonly kind: "preflight-failed"; readonly identity: RetainedFilterJobIdentity; readonly error: unknown; readonly mutations: readonly [] }
export type FilterTerminalPorts = { setLedger(ledger: ConsentJobs): Promise<void>; setCompleted(record: CompletedFilterRecord): Promise<void> }
export type FilterRecoveryPorts = FilterTerminalPorts & { setFilter(effect: FilterReplacementEffect): Promise<void> }
const exactFilter = Symbol("exact-retained-filter")
export type ExactRetainedFilterPermit = { readonly [exactFilter]: true }

type AcceptedPlaylistEffect = Omit<PlaylistRestoreEffect, "key" | "item"> & {
  readonly key: Readonly<PlaylistRestoreEffect["key"]>
  readonly item: { readonly sourceKey: "playlists"; readonly path: readonly [number] }
}
type PlaylistRecordAt<Basis extends ConfirmedRetainedAgreementV2 | InstalledRetainedV3> = Omit<RetainedRecoveryV4, "basis" | "pending"> & {
  readonly basis: { readonly checkpoint: Basis; readonly history: RecoveryStoredObject }
}
export type AcceptedPlaylistRecord =
  | (PlaylistRecordAt<ConfirmedRetainedAgreementV2> & { readonly pending: { readonly kind: "playlist-restore"; readonly effect: AcceptedPlaylistEffect } } & JsonObject)
  | (PlaylistRecordAt<InstalledRetainedV3> & {
      readonly pending: {
        readonly kind: "playlist-restore"
        readonly effect: AcceptedPlaylistEffect & { readonly scope: { readonly kind: "this-browser" }; readonly admission: { readonly kind: "off" } }
      }
    } & JsonObject)
export type CompletedPlaylistRecord = (PlaylistRecordAt<ConfirmedRetainedAgreementV2> | PlaylistRecordAt<InstalledRetainedV3>) & { readonly pending: { readonly kind: "none" } } & JsonObject
export type RetainedPlaylistJobIdentity = {
  readonly deviceId: string
  readonly occurrence: number
  readonly operation: { readonly kind: "retained-playlist-restore"; readonly record: AcceptedPlaylistRecord }
  readonly original: Agreement
}
export type RetainedPlaylistDescriptor = { readonly kind: "retained-playlist-restore"; readonly deviceId: string; readonly accepted: AcceptedPlaylistRecord }
export type RegisteredPlaylistWitness = { readonly descriptor: RetainedPlaylistDescriptor; readonly registration: { readonly kind: "registered"; readonly occurrence: number } }
export type ConsentRetainedPlaylistJob =
  | { readonly identity: RetainedPlaylistJobIdentity; readonly progress: { readonly kind: "accepted" }; readonly permission: Extract<Permission, { kind: "held" | "prepared" | "armed" }> }
  | { readonly identity: RetainedPlaylistJobIdentity; readonly progress: { readonly kind: "terminal" }; readonly permission: Exclude<Permission, { kind: "held" }> }
export type RetainedPlaylistView = {
  readonly kind: "retained-playlist-restore"
  readonly selection: HeldJobSelection
  readonly identity: RetainedPlaylistJobIdentity
  readonly current: Agreement
  readonly recoverability: "exact-retained-document"
} & (
  | { readonly registration: "unregistered"; readonly checkpoint: "pending"; readonly progress: "accepted" }
  | { readonly registration: "registered"; readonly checkpoint: "pending"; readonly progress: "accepted" | "terminal" }
  | { readonly registration: "registered"; readonly checkpoint: "completed"; readonly progress: "terminal" }
)
export type PlaylistRecoveryStage = "register" | "prepare" | "authorize" | "documents" | "retire" | "record" | "done"
export type PlaylistRecoveryMutation = { readonly stage: PlaylistRecoveryStage; readonly write: AgreementWrite; readonly observed: { readonly before: Revision; readonly after: Revision } }
export type PlaylistObservationFailure = { readonly kind: "different" | "authority" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown }
export type RetainedPlaylistExecution =
  | {
      readonly kind: "confirmed"
      readonly identity: RetainedPlaylistJobIdentity
      readonly original: Agreement
      readonly current: Agreement
      readonly activation: "held"
      readonly mutations: readonly PlaylistRecoveryMutation[]
    }
  | {
      readonly kind: "failed"
      readonly identity: RetainedPlaylistJobIdentity
      readonly stage: PlaylistRecoveryStage
      readonly write: Extract<AgreementWrite, { kind: "rejected" }>
      readonly mutations: readonly PlaylistRecoveryMutation[]
    }
  | {
      readonly kind: "unconfirmed"
      readonly identity: RetainedPlaylistJobIdentity
      readonly stage: PlaylistRecoveryStage
      readonly write: AgreementWrite
      readonly observation: PlaylistObservationFailure
      readonly mutations: readonly PlaylistRecoveryMutation[]
    }
  | { readonly kind: "unavailable"; readonly identity: RetainedPlaylistJobIdentity; readonly reason: "stale" | "disposed"; readonly mutations: readonly [] }
  | { readonly kind: "preflight-failed"; readonly identity: RetainedPlaylistJobIdentity; readonly error: unknown; readonly mutations: readonly [] }
export type PlaylistTerminalPorts = { setLedger(ledger: ConsentJobs): Promise<void>; setCompleted(record: CompletedPlaylistRecord): Promise<void> }
export type PlaylistRecoveryPorts = PlaylistTerminalPorts & { setPlaylist(effect: PlaylistRestoreEffect): Promise<void> }
const exactPlaylist = Symbol("exact-retained-playlist")
export type ExactRetainedPlaylistPermit = { readonly [exactPlaylist]: true }

export type RegisteredDocumentWitness = RegisteredFilterWitness | RegisteredPlaylistWitness

function integer(raw: unknown): raw is number {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
}
function exact(raw: JsonObject, keys: readonly string[]) {
  return Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key))
}
function json(raw: unknown): JsonObject {
  if (!consentObject(raw)) throw new TypeError("Expected complete JSON object")
  return detachAgreement(raw)
}
export function isAcceptedFilterRecord(raw: unknown): raw is AcceptedFilterRecord {
  if (!consentObject(raw)) return false
  const parsed = readRetainedRecovery(raw)
  return parsed.kind === "recovery" && parsed.checkpoint.basis.checkpoint.v === 2 && parsed.checkpoint.pending.kind === "filter-replacement" && same(raw, parsed.checkpoint)
}
function isCompletedFilterRecord(raw: unknown): raw is CompletedFilterRecord {
  if (!consentObject(raw)) return false
  const parsed = readRetainedRecovery(raw)
  return parsed.kind === "recovery" && parsed.checkpoint.basis.checkpoint.v === 2 && parsed.checkpoint.pending.kind === "none" && same(raw, parsed.checkpoint)
}
export function completedFilterRecord(identity: RetainedFilterJobIdentity): CompletedFilterRecord {
  const accepted = identity.operation.record
  const value = { ...accepted, resolutions: [...accepted.resolutions, documentResolution(parsedFilterKey(accepted).effect)], pending: { kind: "none" } }
  if (!isCompletedFilterRecord(value)) throw new TypeError("Invalid completed filter record")
  return value
}
function parsedFilterKey(record: AcceptedFilterRecord) {
  const saved = record.pending.effect
  const key = parseDocumentKey(`doc:filter:${saved.key.acct}:${saved.key.playlist}`)
  if (key?.kind !== "filter" || !same(key, saved.key)) throw new TypeError("Invalid fixed filter key")
  const effect: FilterReplacementEffect = { ...saved, item: { sourceKey: saved.item.sourceKey, path: [...saved.item.path] }, key }
  return { key, effect }
}
export function parseRetainedFilterIdentity(raw: unknown): RetainedFilterJobIdentity | undefined {
  if (
    !consentObject(raw) ||
    !exact(raw, ["deviceId", "occurrence", "operation", "original"]) ||
    typeof raw.deviceId !== "string" ||
    !integer(raw.occurrence) ||
    !consentObject(raw.operation) ||
    !exact(raw.operation, ["kind", "record"]) ||
    raw.operation.kind !== "retained-filter-replacement" ||
    !isAcceptedFilterRecord(raw.operation.record)
  )
    return
  const accepted = raw.operation.record,
    basis = accepted.basis.checkpoint
  if (basis.agreement.effect.device.id !== raw.deviceId || !same(raw.original, basis.agreement.effect.consent)) return
  return { deviceId: raw.deviceId, occurrence: raw.occurrence, operation: { kind: "retained-filter-replacement", record: accepted }, original: basis.agreement.effect.consent }
}
export function isAcceptedPlaylistRecord(raw: unknown): raw is AcceptedPlaylistRecord {
  if (!consentObject(raw)) return false
  const parsed = readRetainedRecovery(raw)
  if (parsed.kind !== "recovery" || parsed.checkpoint.pending.kind !== "playlist-restore" || !same(raw, parsed.checkpoint)) return false
  const effect = parsed.checkpoint.pending.effect
  return parsed.checkpoint.basis.checkpoint.v === 2 || (effect.scope.kind === "this-browser" && effect.admission.kind === "off")
}
function isCompletedPlaylistRecord(raw: unknown): raw is CompletedPlaylistRecord {
  if (!consentObject(raw)) return false
  const parsed = readRetainedRecovery(raw)
  return parsed.kind === "recovery" && parsed.checkpoint.pending.kind === "none" && same(raw, parsed.checkpoint)
}
function acceptingPlaylistAgreement(record: AcceptedPlaylistRecord) {
  const basis = record.basis.checkpoint
  return basis.v === 2 ? basis.agreement.effect : basis.agreed.agreement.effect
}
export function completedPlaylistRecord(identity: RetainedPlaylistJobIdentity): CompletedPlaylistRecord {
  const accepted = identity.operation.record
  const value = { ...accepted, resolutions: [...accepted.resolutions, documentResolution(parsedPlaylistKey(accepted).effect)], pending: { kind: "none" } }
  if (!isCompletedPlaylistRecord(value)) throw new TypeError("Invalid completed playlist record")
  return value
}
function parsedPlaylistKey(record: AcceptedPlaylistRecord) {
  const saved = record.pending.effect,
    key = parseDocumentKey(`doc:setup:${saved.key.acct}`)
  const before = decodeDocument(saved.before, decodeSetup),
    after = decodeDocument(saved.after, decodeSetup)
  if (key?.kind !== "setup" || !same(key, saved.key) || before.kind !== "value" || after.kind !== "value") throw new TypeError("Invalid fixed playlist key")
  const entries = after.document.data.autoAdd,
    previous = before.document.data.autoAdd,
    appended = entries.at(-1)
  if (!appended || !isPlaylistId(appended.pl) || entries.length !== previous.length + 1 || !same(entries.slice(0, -1), previous)) throw new TypeError("Invalid fixed playlist append")
  const effect: PlaylistRestoreEffect = { ...saved, item: { sourceKey: saved.item.sourceKey, path: [...saved.item.path] }, key }
  return { key, playlist: appended.pl, effect }
}
export function parseRetainedPlaylistIdentity(raw: unknown): RetainedPlaylistJobIdentity | undefined {
  if (
    !consentObject(raw) ||
    !exact(raw, ["deviceId", "occurrence", "operation", "original"]) ||
    typeof raw.deviceId !== "string" ||
    !integer(raw.occurrence) ||
    !consentObject(raw.operation) ||
    !exact(raw.operation, ["kind", "record"]) ||
    raw.operation.kind !== "retained-playlist-restore" ||
    !isAcceptedPlaylistRecord(raw.operation.record)
  )
    return
  const accepted = raw.operation.record,
    accepting = acceptingPlaylistAgreement(accepted)
  if (accepting.device.id !== raw.deviceId || !same(raw.original, accepting.consent)) return
  return { deviceId: raw.deviceId, occurrence: raw.occurrence, operation: { kind: "retained-playlist-restore", record: accepted }, original: accepting.consent }
}
export function parseRegisteredDocumentWitnesses(raw: unknown, ledger: ConsentJobs): RegisteredDocumentWitness[] | undefined {
  const jobs = ledger.jobs.filter(job => job.identity.operation.kind === "retained-filter-replacement" || job.identity.operation.kind === "retained-playlist-restore")
  if (!Array.isArray(raw) || raw.length !== jobs.length) return
  const witnesses: RegisteredDocumentWitness[] = [],
    occurrences = new Set<number>()
  for (const value of raw) {
    if (!consentObject(value) || !exact(value, ["descriptor", "registration"]) || !consentObject(value.descriptor) || !consentObject(value.registration)) return
    const d = value.descriptor,
      r = value.registration
    if (
      !exact(d, ["kind", "deviceId", "accepted"]) ||
      d.deviceId !== ledger.deviceId ||
      !exact(r, ["kind", "occurrence"]) ||
      r.kind !== "registered" ||
      !integer(r.occurrence) ||
      occurrences.has(r.occurrence)
    )
      return
    const job = jobs.find(job => job.identity.occurrence === r.occurrence)
    if (!job || job.identity.operation.kind !== d.kind || !same(job.identity.operation.record, d.accepted) || witnesses.some(w => same(w.descriptor, d))) return
    const registration = { kind: "registered", occurrence: r.occurrence } as const
    if (d.kind === "retained-filter-replacement" && isAcceptedFilterRecord(d.accepted)) witnesses.push({ descriptor: { kind: d.kind, deviceId: ledger.deviceId, accepted: d.accepted }, registration })
    else if (d.kind === "retained-playlist-restore" && isAcceptedPlaylistRecord(d.accepted))
      witnesses.push({ descriptor: { kind: d.kind, deviceId: ledger.deviceId, accepted: d.accepted }, registration })
    else return
    occurrences.add(r.occurrence)
  }
  return witnesses
}
function isLedger(raw: unknown): raw is ConsentJobs & JsonObject {
  return consentObject(raw) && parseConsentJobs(raw) !== undefined
}
function ledgerFor(records: JsonObject, deviceId: string): ConsentJobs {
  if (!Object.hasOwn(records, consentJobsKey)) return { v: 1, kind: "consent-jobs", deviceId, next: 0, jobs: [] }
  const raw = records[consentJobsKey]
  if (!isLedger(raw) || raw.deviceId !== deviceId) throw new TypeError("Invalid filter ledger")
  return raw
}
function filterJob(ledger: ConsentJobs, identity: RetainedFilterJobIdentity): ConsentRetainedFilterJob | undefined {
  for (const job of ledger.jobs)
    if (job.identity.operation.kind === "retained-filter-replacement" && same(job.identity, identity)) {
      const ownIdentity = { ...job.identity, operation: job.identity.operation }
      if (job.progress.kind === "accepted" && (job.permission.kind === "held" || job.permission.kind === "prepared" || job.permission.kind === "armed"))
        return { ...job, identity: ownIdentity, progress: { kind: "accepted" }, permission: job.permission }
      if (job.progress.kind === "terminal" && job.permission.kind !== "held") return { ...job, identity: ownIdentity, progress: { kind: "terminal" }, permission: job.permission }
    }
}
function replaceJob(ledger: ConsentJobs, entry: ConsentRetainedFilterJob): ConsentJobs {
  return { ...ledger, jobs: ledger.jobs.map(job => (job.identity.occurrence === entry.identity.occurrence ? entry : job)) }
}
function playlistJob(ledger: ConsentJobs, identity: RetainedPlaylistJobIdentity): ConsentRetainedPlaylistJob | undefined {
  for (const job of ledger.jobs)
    if (job.identity.operation.kind === "retained-playlist-restore" && same(job.identity, identity)) {
      const ownIdentity = { ...job.identity, operation: job.identity.operation }
      if (job.progress.kind === "accepted" && (job.permission.kind === "held" || job.permission.kind === "prepared" || job.permission.kind === "armed"))
        return { ...job, identity: ownIdentity, progress: { kind: "accepted" }, permission: job.permission }
      if (job.progress.kind === "terminal" && job.permission.kind !== "held") return { ...job, identity: ownIdentity, progress: { kind: "terminal" }, permission: job.permission }
    }
}
function replacePlaylistJob(ledger: ConsentJobs, entry: ConsentRetainedPlaylistJob): ConsentJobs {
  return { ...ledger, jobs: ledger.jobs.map(job => (job.identity.occurrence === entry.identity.occurrence ? entry : job)) }
}
function conflict(records: JsonObject): boolean {
  if (Object.hasOwn(records, pendingAccountRemovalKey)) return true
  const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
  return join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")
}
export function withdrawnFilterSelection(records: JsonObject, ledger: ConsentJobs | undefined): RetainedFilterView | undefined {
  const read = readConsentDevice(records)
  if (!ledger || read.kind !== "supported" || read.control?.state.kind !== "agreed" || !read.device.consent || conflict(records)) return
  const raw = records[interimConversionKey]
  const matches = ledger.jobs.filter(
    job =>
      job.identity.operation.kind === "retained-filter-replacement" &&
      (same(job.identity.operation.record, raw) || same(completedFilterRecord({ ...job.identity, operation: job.identity.operation }), raw))
  )
  if (matches.length > 1 || matches.some(job => job.permission.kind === "done")) return
  const existing = matches[0]
  let identity: RetainedFilterJobIdentity
  if (existing?.identity.operation.kind === "retained-filter-replacement") identity = { ...existing.identity, operation: existing.identity.operation }
  else {
    if (!isAcceptedFilterRecord(raw) || ledger.next >= Number.MAX_SAFE_INTEGER) return
    identity = { deviceId: read.device.id, occurrence: ledger.next, operation: { kind: "retained-filter-replacement", record: raw }, original: raw.basis.checkpoint.agreement.effect.consent }
  }
  if (identity.deviceId !== read.device.id || identity.operation.record.basis.checkpoint.agreement.effect.device.id !== read.device.id) return
  const effect = identity.operation.record.pending.effect
  if (
    ledger.jobs.some(job => {
      if (job.permission.kind === "done" || same(job.identity, identity)) return false
      const operation = job.identity.operation
      if (operation.kind === "retained-filter-replacement") return same(operation.record.pending.effect.key, effect.key) || same(operation.record.pending.effect.item, effect.item)
      if (operation.kind === "retained-playlist-restore") return operation.record.pending.effect.key.acct === effect.key.acct || same(operation.record.pending.effect.item, effect.item)
      if (operation.kind === "account-removal") return operation.record.acct === effect.key.acct
      if (operation.kind === "retained-installation")
        return operation.effect.documents.some(document => document.path === documentKey(effect.key) || document.path === documentKey({ kind: "setup", acct: effect.key.acct }))
      return false
    })
  )
    return
  const progress = existing?.progress.kind ?? "accepted",
    checkpoint = same(raw, identity.operation.record) ? "pending" : "completed"
  if (checkpoint === "completed" && progress !== "terminal") return
  const view: RetainedFilterView = {
    kind: "retained-filter-replacement",
    selection: Object.freeze({ kind: "held-job-selection" }),
    identity,
    registration: existing ? "registered" : "unregistered",
    checkpoint,
    progress,
    current: read.device.consent,
    recoverability: "exact-retained-document"
  }
  return withdrawnFilterDifference(view, records, localSnapshot(records, identity.operation.record)) ? undefined : view
}
export function withdrawnPlaylistSelection(records: JsonObject, ledger: ConsentJobs | undefined): RetainedPlaylistView | undefined {
  const read = readConsentDevice(records)
  if (!ledger || read.kind !== "supported" || read.control?.state.kind !== "agreed" || !read.device.consent || conflict(records)) return
  const raw = records[interimConversionKey]
  const matches = ledger.jobs.filter(
    job =>
      job.identity.operation.kind === "retained-playlist-restore" &&
      (same(job.identity.operation.record, raw) || same(completedPlaylistRecord({ ...job.identity, operation: job.identity.operation }), raw))
  )
  if (matches.length > 1 || matches.some(job => job.permission.kind === "done")) return
  const existing = matches[0]
  let identity: RetainedPlaylistJobIdentity
  if (existing?.identity.operation.kind === "retained-playlist-restore") identity = { ...existing.identity, operation: existing.identity.operation }
  else {
    if (!isAcceptedPlaylistRecord(raw) || ledger.next >= Number.MAX_SAFE_INTEGER) return
    identity = { deviceId: read.device.id, occurrence: ledger.next, operation: { kind: "retained-playlist-restore", record: raw }, original: acceptingPlaylistAgreement(raw).consent }
  }
  if (identity.deviceId !== read.device.id || acceptingPlaylistAgreement(identity.operation.record).device.id !== read.device.id) return
  const effect = identity.operation.record.pending.effect
  if (
    ledger.jobs.some(job => {
      if (job.permission.kind === "done" || same(job.identity, identity)) return false
      const operation = job.identity.operation
      if (operation.kind === "retained-playlist-restore") return same(operation.record.pending.effect.key, effect.key) || same(operation.record.pending.effect.item, effect.item)
      if (operation.kind === "retained-filter-replacement") return operation.record.pending.effect.key.acct === effect.key.acct || same(operation.record.pending.effect.item, effect.item)
      if (operation.kind === "account-removal") return operation.record.acct === effect.key.acct
      if (operation.kind === "retained-installation")
        return operation.effect.documents.some(document => document.path === documentKey(effect.key) || document.path === documentKey({ kind: "setup", acct: effect.key.acct }))
      return false
    })
  )
    return
  const progress = existing?.progress.kind ?? "accepted",
    checkpoint = same(raw, identity.operation.record) ? "pending" : "completed"
  if (checkpoint === "completed" && progress !== "terminal") return
  const base = {
    kind: "retained-playlist-restore",
    selection: Object.freeze({ kind: "held-job-selection" }),
    identity,
    current: read.device.consent,
    recoverability: "exact-retained-document"
  } as const
  let view: RetainedPlaylistView
  if (!existing) view = { ...base, registration: "unregistered", checkpoint: "pending", progress: "accepted" }
  else if (checkpoint === "completed") view = { ...base, registration: "registered", checkpoint, progress: "terminal" }
  else view = { ...base, registration: "registered", checkpoint, progress }
  return withdrawnPlaylistDifference(view, records, localSnapshot(records, identity.operation.record)) ? undefined : view
}
function localSnapshot(records: JsonObject, accepted: AcceptedFilterRecord | AcceptedPlaylistRecord): InterimPersistenceSnapshot {
  const parsed = readRetainedRecovery(accepted)
  if (parsed.kind !== "recovery") throw new TypeError("Invalid accepted filter checkpoint")
  const original = recoveryRetained(parsed.checkpoint)
  return {
    source: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key))),
    canonical: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key))),
    checkpoint: { kind: "present", value: records[interimConversionKey] },
    historicalAuthorization: original.historicalAuthorization,
    priorCredentialPresence: original.priorCredentialPresence
  }
}
export function withdrawnFilterDifference(view: Pick<RetainedFilterView, "identity" | "progress" | "current">, records: JsonObject, current: InterimPersistenceSnapshot): boolean {
  const accepted = view.identity.operation.record
  return (
    !isAcceptedFilterRecord(accepted) ||
    conflict(records) ||
    documentDifference({ deviceId: view.identity.deviceId, progress: view.progress, current: view.current }, accepted, completedFilterRecord(view.identity), records, current)
  )
}
export function withdrawnPlaylistDifference(view: Pick<RetainedPlaylistView, "identity" | "progress" | "current">, records: JsonObject, current: InterimPersistenceSnapshot): boolean {
  const accepted = view.identity.operation.record
  return (
    !isAcceptedPlaylistRecord(accepted) ||
    conflict(records) ||
    documentDifference({ deviceId: view.identity.deviceId, progress: view.progress, current: view.current }, accepted, completedPlaylistRecord(view.identity), records, current)
  )
}
function documentDifference(
  view: { readonly deviceId: string; readonly progress: "accepted" | "terminal"; readonly current: Agreement },
  accepted: AcceptedFilterRecord | AcceptedPlaylistRecord,
  completedRecord: CompletedFilterRecord | CompletedPlaylistRecord,
  records: JsonObject,
  current: InterimPersistenceSnapshot
): boolean {
  const parsed = readRetainedRecovery(accepted)
  if (parsed.kind !== "recovery") return true
  const read = readConsentDevice(records),
    original = recoveryRetained(parsed.checkpoint),
    canonical = startingCanonical(parsed.checkpoint.basis.checkpoint)
  if (
    read.kind !== "supported" ||
    read.control?.state.kind !== "agreed" ||
    read.device.id !== view.deviceId ||
    !same(read.device.consent, view.current) ||
    !same(read.control.state.current, view.current) ||
    !canonical ||
    !consentObject(canonical.device)
  )
    return true
  if (
    !same(current.source, original.source) ||
    !same(current.historicalAuthorization, original.historicalAuthorization) ||
    !same(current.priorCredentialPresence, original.priorCredentialPresence) ||
    current.checkpoint.kind !== "present" ||
    !same(current.checkpoint.value, records[interimConversionKey])
  )
    return true
  for (const resolution of accepted.resolutions)
    if (resolution.kind !== "discarded") {
      const key = resolution.effect.key,
        parsed = parseDocumentKey(key.kind === "setup" ? `doc:setup:${key.acct}` : `doc:filter:${key.acct}:${key.playlist}`)
      if (!parsed || !same(key, parsed)) return true
      canonical[documentKey(parsed)] = json(resolution.effect.after)
    }
  const effect = accepted.pending.effect,
    key = effect.key,
    name = documentKey(key),
    history = recoveryHistory(records)
  const pending = same(records[interimConversionKey], accepted),
    completed = same(records[interimConversionKey], completedRecord)
  if ((!pending && !completed) || (completed && view.progress !== "terminal")) return true
  if (view.progress === "terminal") {
    if (!same(records[name], effect.after) || !same(history, effect.history.after)) return true
  } else if ((!same(records[name], effect.before) && !same(records[name], effect.after)) || (!same(history, effect.history.before) && !same(history, effect.history.after))) return true
  canonical[name] = json(records[name])
  canonical.device = { ...canonical.device, consent: view.current }
  return (
    (effect.kind === "filter-replacement" && !same(records[documentKey({ kind: "setup", acct: key.acct })], effect.parent)) ||
    !same(current.canonical, canonical) ||
    !same(current.source, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key)))) ||
    !same(current.canonical, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key))))
  )
}

type Observation = { readonly records: JsonObject; readonly snapshot: InterimPersistenceSnapshot; readonly revision: number; readonly epoch: number }
type Dependencies = {
  observe(): Promise<Readonly<Record<string, unknown>>>
  observeRetainedAgreement?(): Promise<InterimPersistenceSnapshot | undefined>
  revision(): number
  stopped(): boolean
  uncertainty(): void
  set(items: JsonObject): Promise<void>
  readonly host: RecoveryHost
  readSync(permit: ExactRetainedFilterPermit): Promise<unknown>
  execute(permit: ExactRetainedFilterPermit): Promise<RetainedFilterExecution>
}
type Capture = { readonly origin: UiOrigin; readonly records: JsonObject; readonly revision: number }
type ObservedDependencies = Dependencies & { observationEpoch(): number; allowSnapshots(records?: JsonObject, accepted?: AcceptedFilterRecord): void }
class ObservationError extends Error {
  constructor(readonly observation: FilterObservationFailure) {
    super(observation.kind)
  }
}
function stop(deps: Pick<Dependencies, "stopped">) {
  if (deps.stopped()) throw new ObservationError({ kind: "stopped" })
}
async function observe(deps: Pick<ObservedDependencies, "observe" | "host" | "observeRetainedAgreement" | "revision" | "stopped" | "observationEpoch">): Promise<Observation> {
  stop(deps)
  const first = await deps.observe()
  stop(deps)
  if (!consentObject(first) || deps.host.kind !== "fixture" || !deps.observeRetainedAgreement) throw new ObservationError({ kind: "different" })
  const records = json(first),
    explicit = await deps.host.snapshot.read()
  stop(deps)
  const snapshot = await deps.observeRetainedAgreement()
  stop(deps)
  const revision = deps.revision(),
    second = await deps.observe()
  stop(deps)
  if (
    !snapshot ||
    !isJsonValue(explicit) ||
    !same(explicit, { retained: snapshot, history: recoveryHistory(records) }) ||
    !same(records, second) ||
    revision !== deps.revision() ||
    !same(snapshot.source, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key)))) ||
    !same(snapshot.canonical, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key)))) ||
    !same(snapshot.checkpoint, { kind: "present", value: records[interimConversionKey] })
  )
    throw new ObservationError({ kind: "different" })
  return { records: freezeConsentValue(records), snapshot: freezeConsentValue(snapshot), revision, epoch: deps.observationEpoch() }
}
type AuthorityTracker = { revision: number; authority?: unknown; ownership?: unknown }
async function authorize(deps: Dependencies, acct: AccountKey, playlist: PlaylistId, tracker: AuthorityTracker): Promise<ClaimAuthority> {
  const host = deps.host
  if (host.kind !== "fixture") throw new ObservationError({ kind: "authority" })
  async function read() {
    stop(deps)
    const raw: unknown = await (host.kind === "fixture" ? host.authority.read() : undefined)
    stop(deps)
    if (tracker.authority !== undefined && !same(tracker.authority, raw)) tracker.revision++
    tracker.authority = isJsonValue(raw) ? detachAgreement(raw) : null
    if (!consentObject(raw) || raw.kind !== "ready" || !consentObject(raw.authority)) throw new ObservationError({ kind: "authority" })
    const a = raw.authority,
      key = typeof a.acct === "string" ? parseDocumentKey(`doc:setup:${a.acct}`) : undefined
    if (
      key?.kind !== "setup" ||
      key.acct !== acct ||
      a.signedIn !== true ||
      a.incognito !== false ||
      typeof a.lease !== "string" ||
      !a.lease.trim() ||
      typeof a.browserSession !== "string" ||
      !a.browserSession.trim() ||
      typeof a.consentGeneration !== "string" ||
      !a.consentGeneration.trim()
    )
      throw new ObservationError({ kind: "authority" })
    return { acct: key.acct, lease: a.lease, browserSession: a.browserSession, consentGeneration: a.consentGeneration, signedIn: true, incognito: false } satisfies ClaimAuthority
  }
  const first = await read(),
    at = tracker.revision
  stop(deps)
  const owned = await host.ownership.lookup(detachAgreement(first))
  stop(deps)
  const evidence = owned.kind === "fixture-owned" ? { authority: json(owned.authority), ids: [...owned.ownedPlaylistIds].sort(), lineage: Object.hasOwn(owned, "lineage") } : { kind: "unavailable" }
  if (tracker.ownership !== undefined && !same(tracker.ownership, evidence)) tracker.revision++
  tracker.ownership = detachAgreement(evidence)
  const second = await read()
  if (
    owned.kind !== "fixture-owned" ||
    Object.hasOwn(owned, "lineage") ||
    !same(owned.authority, first) ||
    ![...owned.ownedPlaylistIds].includes(playlist) ||
    !same(first, second) ||
    at !== tracker.revision
  )
    throw new ObservationError({ kind: "authority" })
  return first
}
function failure(error: unknown): FilterObservationFailure {
  return error instanceof ObservationError ? error.observation : { kind: "read-failed", error }
}
function validateSyncedDocument(records: JsonObject, remote: JsonObject, effect: FilterReplacementEffect | PlaylistRestoreEffect) {
  if (effect.admission.kind !== "synced") return
  const key = effect.key
  const logical = { ...records, [documentKey(key)]: effect.before }
  if (effect.history.before.kind === "present") logical.sync = effect.history.before.raw
  else delete logical.sync
  const plan = planSyncWrite({ local: logical, sync: remote, intent: { kind: "changed-batch", documents: [{ key, document: effect.after }] } })
  if (plan.kind !== "planned" || effect.scope.kind !== "syncing-browsers" || effect.admission.joined !== effect.scope.joined || effect.history.before.kind !== "present")
    throw new ObservationError({ kind: "different" })
  const state = decodeSyncState(effect.history.before.raw)
  if (state.joined !== effect.admission.joined) throw new ObservationError({ kind: "different" })
  const pushed = { ...state.pushed }
  for (const repair of plan.repairs) Object.defineProperty(pushed, repair.name, { value: repair.gen, enumerable: true, configurable: true, writable: true })
  const repaired = { ...effect.history.before.raw, pushed },
    history = prepareFirstEditHistory({ history: { kind: "present", raw: repaired }, syncOn: true })
  const expected = history.kind === "set" ? { kind: "present", raw: history.sync } : history.kind === "unchanged" ? { kind: "present", raw: repaired } : undefined
  if (!same(expected, effect.history.after)) throw new ObservationError({ kind: "different" })
  for (const repair of effect.admission.requiredRepairs) {
    const repairKey = parseDocumentKey(repair.name)
    if (!repairKey || !same(repairKey, repair.key)) throw new ObservationError({ kind: "different" })
    const found = readSyncDocument({ key: repairKey, items: Object.entries(remote).map(([key, value]) => ({ key, value })) })
    if ((found.kind !== "value" && found.kind !== "deleted") || !same(found.json, repair.document) || found.json.gen !== repair.gen) throw new ObservationError({ kind: "different" })
  }
}
function confirmDocumentObservation(before: Observation, after: Observation, final: Observation, authority: ClaimAuthority, chosen: ClaimAuthority, revision: number, capturedRevision: number) {
  if (!same(authority, chosen) || revision !== capturedRevision) throw new ObservationError({ kind: "authority" })
  if (!same(after.records, final.records) || after.revision !== final.revision || after.epoch !== final.epoch || final.epoch !== before.epoch) throw new ObservationError({ kind: "different" })
}
const terminalStages = ["retire", "record", "done"] as const
type Attempted = { readonly stage: FilterRecoveryStage; readonly write: AgreementWrite }
class FilterAttempt {
  readonly mutations: FilterRecoveryMutation[] = []
  readonly identity: RetainedFilterJobIdentity
  readonly current: Agreement
  readonly generation: number
  readonly control: JsonObject
  readonly device: JsonObject
  readonly authorityRevision: number
  readonly origin: UiOrigin
  live = true
  last: Attempted | undefined
  remote: JsonObject | undefined
  constructor(
    readonly deps: ObservedDependencies,
    readonly selected: RetainedFilterView,
    public observation: Observation,
    readonly authority: ClaimAuthority,
    readonly tracker: AuthorityTracker,
    origin: UiOrigin
  ) {
    const read = readConsentDevice(observation.records)
    if (read.kind !== "supported" || read.control?.state.kind !== "agreed") throw new TypeError("Invalid current filter authority")
    this.generation = read.control.generation
    this.identity = selected.identity
    this.current = selected.current
    this.control = json(observation.records["consent:state"])
    this.device = json(observation.records.device)
    this.authorityRevision = tracker.revision
    this.origin = freezeConsentValue(detachAgreement(origin))
  }
  revision(): Revision {
    return { owner: this.deps.revision(), authority: this.tracker.revision, snapshot: this.deps.observationEpoch() }
  }
  stopped() {
    stop(this.deps)
    if (!this.live) throw new ObservationError({ kind: "stopped" })
  }
  progress(records = this.observation.records) {
    return filterJob(ledgerFor(records, this.identity.deviceId), this.identity)?.progress.kind ?? this.selected.progress
  }
  valid(observation: Observation) {
    const read = readConsentDevice(observation.records)
    return (
      read.kind === "supported" &&
      read.control?.state.kind === "agreed" &&
      read.control.generation === this.generation &&
      same(observation.records["consent:state"], this.control) &&
      same(read.raw, this.device) &&
      !withdrawnFilterDifference({ identity: this.identity, progress: this.progress(observation.records), current: this.current }, observation.records, observation.snapshot)
    )
  }
  async fresh() {
    this.stopped()
    if (this.observation.revision !== this.deps.revision() || this.observation.epoch !== this.deps.observationEpoch()) throw new ObservationError({ kind: "different" })
    const { key } = parsedFilterKey(this.identity.operation.record),
      authority = await authorize(this.deps, key.acct, key.playlist, this.tracker)
    this.stopped()
    const next = await observe(this.deps)
    this.stopped()
    if (!same(authority, this.authority) || this.authorityRevision !== this.tracker.revision) throw new ObservationError({ kind: "authority" })
    if (!same(next.records, this.observation.records) || next.revision !== this.observation.revision || next.epoch !== this.observation.epoch || !this.valid(next))
      throw new ObservationError({ kind: "different" })
    return next
  }
  interrupt(error: unknown): RetainedFilterExecution {
    if (this.last) {
      this.live = false
      this.deps.uncertainty()
      return { kind: "unconfirmed", identity: this.identity, ...this.last, observation: failure(error), mutations: [...this.mutations] }
    }
    if (error instanceof ObservationError) return { kind: "unavailable", identity: this.identity, reason: error.observation.kind === "stopped" ? "disposed" : "stale", mutations: [] }
    return { kind: "preflight-failed", identity: this.identity, error, mutations: [] }
  }
  async mutate(stage: FilterRecoveryStage, batch: JsonObject, setter: () => Promise<void>): Promise<RetainedFilterExecution | undefined> {
    try {
      await this.fresh()
    } catch (error) {
      return this.interrupt(error)
    }
    const before = this.observation,
      revision = this.revision()
    try {
      this.stopped()
    } catch (error) {
      return this.interrupt(error)
    }
    let write: AgreementWrite = { kind: "resolved" }
    this.last = { stage, write }
    this.deps.allowSnapshots({ ...before.records, ...batch }, this.identity.operation.record)
    try {
      await setter()
    } catch (error) {
      write = { kind: "rejected", error }
    }
    this.last = { stage, write }
    try {
      this.stopped()
      const after = await observe(this.deps)
      this.stopped()
      const { key } = parsedFilterKey(this.identity.operation.record),
        auth = await authorize(this.deps, key.acct, key.playlist, this.tracker)
      this.stopped()
      const final = await observe(this.deps)
      this.stopped()
      confirmDocumentObservation(before, after, final, auth, this.authority, this.tracker.revision, this.authorityRevision)
      if (!same(final.records, { ...before.records, ...batch }) || !this.valid(final)) {
        if (write.kind === "rejected" && same(final.records, before.records) && this.valid(final)) {
          this.live = false
          return { kind: "failed", identity: this.identity, stage, write, mutations: [...this.mutations] }
        }
        throw new ObservationError({ kind: "different" })
      }
      this.observation = final
      this.mutations.push({ stage, write, observed: { before: revision, after: this.revision() } })
    } catch (error) {
      return this.interrupt(error)
    } finally {
      this.deps.allowSnapshots()
    }
  }
  async admission(permit: ExactRetainedFilterPermit) {
    await this.fresh()
    this.stopped()
    const { effect } = parsedFilterKey(this.identity.operation.record)
    if (effect.admission.kind === "off") return
    const remote = await this.deps.readSync(permit)
    this.stopped()
    if (!consentObject(remote)) throw new ObservationError({ kind: "different" })
    if (this.remote && !same(this.remote, remote)) throw new ObservationError({ kind: "different" })
    this.remote = freezeConsentValue(json(remote))
    validateSyncedDocument(this.observation.records, remote, effect)
    await this.fresh()
    this.stopped()
  }
  confirmed(): Extract<RetainedFilterExecution, { kind: "confirmed" }> {
    return { kind: "confirmed", identity: this.identity, original: this.identity.original, current: this.current, activation: "held", mutations: [...this.mutations] }
  }
}
const permits = new WeakMap<ExactRetainedFilterPermit, FilterAttempt>()
const executing = new WeakMap<ExactRetainedFilterPermit, FilterAttempt>()
export async function readExactFilterSync(permit: ExactRetainedFilterPermit, read: () => Promise<unknown>): Promise<unknown> {
  const attempt = executing.get(permit)
  if (!attempt || !attempt.live) throw new Error("No live exact filter authority")
  attempt.stopped()
  const result = await read()
  attempt.stopped()
  return result
}
async function terminal(attempt: FilterAttempt, ports: FilterTerminalPorts, permit: ExactRetainedFilterPermit): Promise<RetainedFilterExecution> {
  for (const stage of terminalStages) {
    await attempt.admission(permit)
    const ledger = ledgerFor(attempt.observation.records, attempt.identity.deviceId),
      job = filterJob(ledger, attempt.identity),
      completed = completedFilterRecord(attempt.identity)
    if (!job || job.progress.kind !== "terminal" || job.permission.kind === "held" || job.permission.kind === "prepared") throw new ObservationError({ kind: "different" })
    if (stage === "retire" && job.permission.kind === "retiring") continue
    if (stage === "record" && same(attempt.observation.records[interimConversionKey], completed)) continue
    if (stage !== "retire" && job.permission.kind !== "retiring") throw new ObservationError({ kind: "different" })
    if (stage === "done" && !same(attempt.observation.records[interimConversionKey], completed)) throw new ObservationError({ kind: "different" })
    const next = replaceJob(ledger, {
      identity: attempt.identity,
      progress: { kind: "terminal" },
      permission: stage === "done" ? { kind: "done" } : { kind: "retiring", generation: attempt.generation, current: attempt.current }
    })
    const batch: JsonObject = stage === "record" ? { [interimConversionKey]: completed } : json({ [consentJobsKey]: next })
    const failed = await attempt.mutate(stage, batch, () => (stage === "record" ? ports.setCompleted(completed) : ports.setLedger(next)))
    if (failed) return failed
  }
  if (attempt.identity.operation.record.pending.effect.admission.kind === "synced") await attempt.admission(permit)
  return attempt.confirmed()
}
export async function executeExactRetainedFilter(permit: ExactRetainedFilterPermit, ports: FilterRecoveryPorts): Promise<RetainedFilterExecution> {
  const attempt = permits.get(permit)
  permits.delete(permit)
  if (!attempt || !attempt.live) throw new TypeError("Invalid or consumed exact filter permit")
  executing.set(permit, attempt)
  try {
    if (attempt.progress() === "terminal") return await terminal(attempt, { setLedger: ports.setLedger, setCompleted: ports.setCompleted }, permit)
    await attempt.admission(permit)
    const { key, effect } = parsedFilterKey(attempt.identity.operation.record)
    if (!same(attempt.observation.records[documentKey(key)], effect.after) || !same(recoveryHistory(attempt.observation.records), effect.history.after)) {
      const batch: JsonObject = { [documentKey(key)]: effect.after }
      if (effect.history.after.kind === "present") batch.sync = effect.history.after.raw
      const failed = await attempt.mutate("documents", batch, () => ports.setFilter(effect))
      if (failed) return failed
    }
    await attempt.admission(permit)
    const ledger = ledgerFor(attempt.observation.records, attempt.identity.deviceId)
    const next = replaceJob(ledger, { identity: attempt.identity, progress: { kind: "terminal" }, permission: { kind: "retiring", generation: attempt.generation, current: attempt.current } })
    const failed = await attempt.mutate("retire", json({ [consentJobsKey]: next }), () => ports.setLedger(next))
    if (failed) return failed
    return await terminal(attempt, { setLedger: ports.setLedger, setCompleted: ports.setCompleted }, permit)
  } catch (error) {
    return attempt.interrupt(error)
  } finally {
    permits.delete(permit)
    executing.delete(permit)
  }
}
export function createWithdrawnFilterRecovery(deps: Dependencies) {
  const tracker: AuthorityTracker = { revision: 0 }
  const reviews = new WeakMap<RetainedFilterView, number>()
  const snapshots = new Map<string, unknown>()
  let epoch = 0,
    expectedSnapshots: { readonly explicit: unknown; readonly startup: unknown } | undefined
  function observedSnapshot(kind: "explicit" | "startup", value: unknown) {
    if (snapshots.has(kind) && !same(snapshots.get(kind), value) && !(expectedSnapshots && same(expectedSnapshots[kind], value))) epoch++
    snapshots.set(kind, isJsonValue(value) ? detachAgreement(value) : null)
    return value
  }
  let closed = false
  const uncertainty = () => {
    closed = true
    deps.uncertainty()
  }
  const host = deps.host
  const ownedDeps: ObservedDependencies = {
    ...deps,
    uncertainty,
    host:
      host.kind !== "fixture"
        ? host
        : {
            ...host,
            snapshot: {
              async read() {
                const value = await host.snapshot.read()
                observedSnapshot("explicit", value)
                return value
              }
            }
          },
    async observeRetainedAgreement() {
      const value = await deps.observeRetainedAgreement?.()
      observedSnapshot("startup", value)
      return value
    },
    observationEpoch: () => epoch,
    allowSnapshots(records, accepted) {
      if (!records || !accepted) {
        expectedSnapshots = undefined
        return
      }
      const retained = localSnapshot(records, accepted)
      expectedSnapshots = { explicit: { retained, history: recoveryHistory(records) }, startup: retained }
    }
  }
  return {
    async review(view: RetainedFilterView, records: JsonObject): Promise<boolean> {
      if (closed) return false
      try {
        const current = await observe(ownedDeps)
        if (!same(records, current.records) || withdrawnFilterDifference(view, current.records, current.snapshot)) return false
        reviews.set(view, epoch)
        return true
      } catch {
        return false
      }
    },
    async recover(
      origin: UiOrigin,
      capture: Capture,
      selected: RetainedFilterView
    ): Promise<{
      readonly execution: RetainedFilterExecution
      readonly completionCheck: FilterObservationFailure | { readonly kind: "complete" } | { readonly kind: "not-complete" }
      readonly records?: JsonObject
    }> {
      let attempt: FilterAttempt | undefined
      const unavailable = (): RetainedFilterExecution => ({ kind: "unavailable", identity: selected.identity, reason: deps.stopped() ? "disposed" : "stale", mutations: [] })
      const incomplete = (execution: RetainedFilterExecution) => ({ execution, completionCheck: { kind: "not-complete" as const } })
      try {
        const capturedEpoch = reviews.get(selected)
        if (closed || capturedEpoch === undefined || capturedEpoch !== epoch || !agreementOrigin(origin) || origin.incognito || !same(origin, capture.origin) || capture.revision !== deps.revision())
          return incomplete(unavailable())
        const observation = await observe(ownedDeps)
        if (capturedEpoch !== epoch || capture.revision !== deps.revision() || !same(observation.records, capture.records)) return incomplete(unavailable())
        let ledger = ledgerFor(observation.records, selected.identity.deviceId)
        const again = withdrawnFilterSelection(observation.records, ledger)
        if (
          !again ||
          !same(again.identity, selected.identity) ||
          again.progress !== selected.progress ||
          again.registration !== selected.registration ||
          withdrawnFilterDifference(selected, observation.records, observation.snapshot)
        )
          return incomplete(unavailable())
        const { key } = parsedFilterKey(selected.identity.operation.record),
          auth = await authorize(ownedDeps, key.acct, key.playlist, tracker)
        attempt = new FilterAttempt(ownedDeps, selected, observation, auth, tracker, origin)
        await attempt.fresh()
        if (selected.registration === "unregistered") {
          const identity = selected.identity
          if (ledger.next >= Number.MAX_SAFE_INTEGER || identity.occurrence !== ledger.next) return incomplete(unavailable())
          const entry: ConsentRetainedFilterJob = { identity, progress: { kind: "accepted" }, permission: { kind: "held" } }
          const witness: RegisteredFilterWitness = {
            descriptor: { kind: "retained-filter-replacement", deviceId: identity.deviceId, accepted: identity.operation.record },
            registration: { kind: "registered", occurrence: identity.occurrence }
          }
          const next: ConsentJobs = { ...ledger, next: ledger.next + 1, jobs: [...ledger.jobs, entry], retainedDocuments: [...(ledger.retainedDocuments ?? []), witness] }
          const failed = await attempt.mutate("register", json({ [consentJobsKey]: next }), () => deps.set(json({ [consentJobsKey]: next })))
          if (failed) return incomplete(failed)
          ledger = next
        }
        for (const kind of ["prepared", "armed"] as const) {
          const permission = { kind, generation: attempt.generation, current: attempt.current }
          const entry: ConsentRetainedFilterJob =
            selected.progress === "terminal" ? { identity: selected.identity, progress: { kind: "terminal" }, permission } : { identity: selected.identity, progress: { kind: "accepted" }, permission }
          const next = replaceJob(ledger, entry)
          const failed = await attempt.mutate(kind === "prepared" ? "prepare" : "authorize", json({ [consentJobsKey]: next }), () => deps.set(json({ [consentJobsKey]: next })))
          if (failed) return incomplete(failed)
          ledger = next
        }
        const permit: ExactRetainedFilterPermit = Object.freeze({ [exactFilter]: true })
        permits.set(permit, attempt)
        let execution: RetainedFilterExecution
        try {
          execution = await deps.execute(permit)
        } catch (error) {
          execution = attempt.interrupt(error)
        } finally {
          permits.delete(permit)
          executing.delete(permit)
        }
        if (execution.kind !== "confirmed") return incomplete(execution)
        try {
          await attempt.fresh()
          const final = await observe(ownedDeps)
          attempt.stopped()
          const job = filterJob(ledgerFor(final.records, attempt.identity.deviceId), attempt.identity)
          const exactMutations =
            execution.mutations.length === attempt.mutations.length &&
            execution.mutations.every((mutation, index) => {
              const expected = attempt?.mutations[index]
              return (
                expected &&
                mutation.stage === expected.stage &&
                same(mutation.observed, expected.observed) &&
                mutation.write.kind === expected.write.kind &&
                (mutation.write.kind !== "rejected" || (expected.write.kind === "rejected" && mutation.write.error === expected.write.error))
              )
            })
          if (
            !same(execution.identity, attempt.identity) ||
            !same(execution.original, attempt.identity.original) ||
            !same(execution.current, attempt.current) ||
            execution.activation !== "held" ||
            !exactMutations ||
            !same(final.records, attempt.observation.records) ||
            final.revision !== attempt.observation.revision ||
            !attempt.valid(final) ||
            job?.permission.kind !== "done" ||
            job.progress.kind !== "terminal" ||
            !same(final.records[interimConversionKey], completedFilterRecord(attempt.identity))
          ) {
            uncertainty()
            return { execution, completionCheck: { kind: "different" } }
          }
          return { execution, completionCheck: { kind: "complete" }, records: final.records }
        } catch (error) {
          uncertainty()
          return { execution, completionCheck: failure(error) }
        }
      } catch (error) {
        return incomplete(attempt ? attempt.interrupt(error) : error instanceof ObservationError ? unavailable() : { kind: "preflight-failed", identity: selected.identity, error, mutations: [] })
      } finally {
        if (attempt) attempt.live = false
      }
    }
  }
}

type PlaylistRecoveryDependencies = {
  observe(): Promise<Readonly<Record<string, unknown>>>
  observeRetainedAgreement?(): Promise<InterimPersistenceSnapshot | undefined>
  revision(): number
  stopped(): boolean
  uncertainty(): void
  set(items: JsonObject): Promise<void>
  readonly host: RecoveryHost
  readSync(permit: ExactRetainedPlaylistPermit): Promise<unknown>
  execute(permit: ExactRetainedPlaylistPermit): Promise<RetainedPlaylistExecution>
}
type PlaylistCapture = { readonly origin: UiOrigin; readonly records: JsonObject; readonly revision: number }
type ObservedPlaylistDependencies = PlaylistRecoveryDependencies & { observationEpoch(): number; allowSnapshots(records?: JsonObject, accepted?: AcceptedPlaylistRecord): void }

type PlaylistAuthorityTracker = { revision: number; accounts?: readonly ClaimAuthority[] | null; ownership?: unknown }
async function readPlaylistAccounts(deps: PlaylistRecoveryDependencies, tracker: PlaylistAuthorityTracker): Promise<readonly ClaimAuthority[]> {
  stop(deps)
  if (deps.host.kind !== "fixture") throw new ObservationError({ kind: "authority" })
  const raw: unknown = await deps.host.accounts.read()
  stop(deps)
  const accounts: ClaimAuthority[] = [],
    ids = new Set<string>()
  let valid = Array.isArray(raw)
  if (Array.isArray(raw))
    for (const value of raw) {
      if (
        !consentObject(value) ||
        typeof value.acct !== "string" ||
        value.signedIn !== true ||
        value.incognito !== false ||
        typeof value.lease !== "string" ||
        !value.lease.trim() ||
        typeof value.browserSession !== "string" ||
        !value.browserSession.trim() ||
        typeof value.consentGeneration !== "string" ||
        !value.consentGeneration.trim() ||
        ids.has(value.acct)
      ) {
        valid = false
        break
      }
      const key = parseDocumentKey(`doc:setup:${value.acct}`)
      if (key?.kind !== "setup") {
        valid = false
        break
      }
      ids.add(value.acct)
      accounts.push({ acct: key.acct, lease: value.lease, browserSession: value.browserSession, consentGeneration: value.consentGeneration, signedIn: true, incognito: false })
    }
  accounts.sort((a, b) => (a.acct < b.acct ? -1 : a.acct > b.acct ? 1 : 0))
  const observed = valid ? accounts : null
  if (tracker.accounts !== undefined && !same(tracker.accounts, observed)) tracker.revision++
  tracker.accounts = detachAgreement(observed)
  if (!valid) throw new ObservationError({ kind: "authority" })
  return accounts
}
async function authorizePlaylist(deps: PlaylistRecoveryDependencies, acct: AccountKey, playlist: PlaylistId, tracker: PlaylistAuthorityTracker): Promise<ClaimAuthority> {
  const host = deps.host
  if (host.kind !== "fixture") throw new ObservationError({ kind: "authority" })
  const accounts = await readPlaylistAccounts(deps, tracker),
    first = accounts.find(row => row.acct === acct),
    revision = tracker.revision
  if (!first) throw new ObservationError({ kind: "authority" })
  stop(deps)
  const owned = await host.ownership.lookup(detachAgreement(first))
  stop(deps)
  const evidence = owned.kind === "fixture-owned" ? { authority: json(owned.authority), ids: [...owned.ownedPlaylistIds].sort(), lineage: Object.hasOwn(owned, "lineage") } : { kind: "unavailable" }
  if (tracker.ownership !== undefined && !same(tracker.ownership, evidence)) tracker.revision++
  tracker.ownership = detachAgreement(evidence)
  const second = await readPlaylistAccounts(deps, tracker)
  if (
    owned.kind !== "fixture-owned" ||
    Object.hasOwn(owned, "lineage") ||
    !same(owned.authority, first) ||
    ![...owned.ownedPlaylistIds].includes(playlist) ||
    !same(accounts, second) ||
    revision !== tracker.revision
  )
    throw new ObservationError({ kind: "authority" })
  return first
}

class PlaylistAttempt {
  readonly mutations: PlaylistRecoveryMutation[] = []
  readonly identity: RetainedPlaylistJobIdentity
  readonly current: Agreement
  readonly generation: number
  readonly control: JsonObject
  readonly device: JsonObject
  readonly authorityRevision: number
  readonly origin: UiOrigin
  live = true
  last: Attempted | undefined
  remote: JsonObject | undefined
  constructor(
    readonly deps: ObservedPlaylistDependencies,
    readonly selected: RetainedPlaylistView,
    public observation: Observation,
    readonly authority: ClaimAuthority,
    readonly tracker: PlaylistAuthorityTracker,
    origin: UiOrigin,
    readonly permit: ExactRetainedPlaylistPermit
  ) {
    const read = readConsentDevice(observation.records)
    if (read.kind !== "supported" || read.control?.state.kind !== "agreed") throw new TypeError("Invalid current playlist authority")
    this.generation = read.control.generation
    this.identity = selected.identity
    this.current = selected.current
    this.control = json(observation.records["consent:state"])
    this.device = json(observation.records.device)
    this.authorityRevision = tracker.revision
    this.origin = freezeConsentValue(detachAgreement(origin))
  }
  revision(): Revision {
    return { owner: this.deps.revision(), authority: this.tracker.revision, snapshot: this.deps.observationEpoch() }
  }
  stopped() {
    stop(this.deps)
    if (!this.live) throw new ObservationError({ kind: "stopped" })
  }
  progress(records = this.observation.records) {
    return playlistJob(ledgerFor(records, this.identity.deviceId), this.identity)?.progress.kind ?? this.selected.progress
  }
  valid(observation: Observation) {
    const read = readConsentDevice(observation.records)
    return (
      read.kind === "supported" &&
      read.control?.state.kind === "agreed" &&
      read.control.generation === this.generation &&
      same(observation.records["consent:state"], this.control) &&
      same(read.raw, this.device) &&
      !withdrawnPlaylistDifference({ identity: this.identity, progress: this.progress(observation.records), current: this.current }, observation.records, observation.snapshot)
    )
  }
  async fresh() {
    this.stopped()
    if (this.observation.revision !== this.deps.revision() || this.observation.epoch !== this.deps.observationEpoch()) throw new ObservationError({ kind: "different" })
    const { key, playlist } = parsedPlaylistKey(this.identity.operation.record),
      authority = await authorizePlaylist(this.deps, key.acct, playlist, this.tracker)
    this.stopped()
    const next = await observe(this.deps)
    this.stopped()
    if (!same(authority, this.authority) || this.authorityRevision !== this.tracker.revision) throw new ObservationError({ kind: "authority" })
    if (!same(next.records, this.observation.records) || next.revision !== this.observation.revision || next.epoch !== this.observation.epoch || !this.valid(next))
      throw new ObservationError({ kind: "different" })
    return next
  }
  interrupt(error: unknown): RetainedPlaylistExecution {
    if (this.last) {
      this.live = false
      this.deps.uncertainty()
      return { kind: "unconfirmed", identity: this.identity, ...this.last, observation: failure(error), mutations: [...this.mutations] }
    }
    if (error instanceof ObservationError) return { kind: "unavailable", identity: this.identity, reason: error.observation.kind === "stopped" ? "disposed" : "stale", mutations: [] }
    return { kind: "preflight-failed", identity: this.identity, error, mutations: [] }
  }
  async mutate(stage: PlaylistRecoveryStage, batch: JsonObject, setter: () => Promise<void>): Promise<RetainedPlaylistExecution | undefined> {
    try {
      await this.admission(this.permit)
    } catch (error) {
      return this.interrupt(error)
    }
    const before = this.observation,
      revision = this.revision()
    try {
      this.stopped()
    } catch (error) {
      return this.interrupt(error)
    }
    let write: AgreementWrite = { kind: "resolved" }
    this.last = { stage, write }
    this.deps.allowSnapshots({ ...before.records, ...batch }, this.identity.operation.record)
    try {
      await setter()
    } catch (error) {
      write = { kind: "rejected", error }
    }
    this.last = { stage, write }
    try {
      this.stopped()
      const after = await observe(this.deps)
      this.stopped()
      const { key, playlist } = parsedPlaylistKey(this.identity.operation.record),
        auth = await authorizePlaylist(this.deps, key.acct, playlist, this.tracker)
      this.stopped()
      const final = await observe(this.deps)
      this.stopped()
      confirmDocumentObservation(before, after, final, auth, this.authority, this.tracker.revision, this.authorityRevision)
      if (!same(final.records, { ...before.records, ...batch }) || !this.valid(final)) {
        if (write.kind === "rejected" && same(final.records, before.records) && this.valid(final)) {
          this.live = false
          return { kind: "failed", identity: this.identity, stage, write, mutations: [...this.mutations] }
        }
        throw new ObservationError({ kind: "different" })
      }
      this.observation = final
      await this.admission(this.permit)
      this.mutations.push({ stage, write, observed: { before: revision, after: this.revision() } })
    } catch (error) {
      return this.interrupt(error)
    } finally {
      this.deps.allowSnapshots()
    }
  }
  async admission(permit: ExactRetainedPlaylistPermit) {
    await this.fresh()
    this.stopped()
    const { effect } = parsedPlaylistKey(this.identity.operation.record)
    if (effect.admission.kind === "off") return
    const remote = await this.deps.readSync(permit)
    this.stopped()
    if (!consentObject(remote)) throw new ObservationError({ kind: "different" })
    if (this.remote && !same(this.remote, remote)) throw new ObservationError({ kind: "different" })
    this.remote = freezeConsentValue(json(remote))
    validateSyncedDocument(this.observation.records, remote, effect)
    await this.fresh()
    this.stopped()
  }
  confirmed(): Extract<RetainedPlaylistExecution, { kind: "confirmed" }> {
    return { kind: "confirmed", identity: this.identity, original: this.identity.original, current: this.current, activation: "held", mutations: [...this.mutations] }
  }
}
const playlistPermits = new WeakMap<ExactRetainedPlaylistPermit, PlaylistAttempt>()
const playlistExecuting = new WeakMap<ExactRetainedPlaylistPermit, PlaylistAttempt>()
export async function readExactPlaylistSync(permit: ExactRetainedPlaylistPermit, read: () => Promise<unknown>): Promise<unknown> {
  const attempt = playlistExecuting.get(permit)
  if (!attempt || !attempt.live) throw new Error("No live exact playlist authority")
  attempt.stopped()
  const result = await read()
  attempt.stopped()
  return result
}
async function terminalPlaylist(attempt: PlaylistAttempt, ports: PlaylistTerminalPorts, permit: ExactRetainedPlaylistPermit): Promise<RetainedPlaylistExecution> {
  for (const stage of terminalStages) {
    await attempt.admission(permit)
    const ledger = ledgerFor(attempt.observation.records, attempt.identity.deviceId),
      job = playlistJob(ledger, attempt.identity),
      completed = completedPlaylistRecord(attempt.identity)
    if (!job || job.progress.kind !== "terminal" || job.permission.kind === "held" || job.permission.kind === "prepared") throw new ObservationError({ kind: "different" })
    if (stage === "retire" && job.permission.kind === "retiring") continue
    if (stage === "record" && same(attempt.observation.records[interimConversionKey], completed)) continue
    if (stage !== "retire" && job.permission.kind !== "retiring") throw new ObservationError({ kind: "different" })
    if (stage === "done" && !same(attempt.observation.records[interimConversionKey], completed)) throw new ObservationError({ kind: "different" })
    const next = replacePlaylistJob(ledger, {
      identity: attempt.identity,
      progress: { kind: "terminal" },
      permission: stage === "done" ? { kind: "done" } : { kind: "retiring", generation: attempt.generation, current: attempt.current }
    })
    const batch: JsonObject = stage === "record" ? { [interimConversionKey]: completed } : json({ [consentJobsKey]: next })
    const failed = await attempt.mutate(stage, batch, () => (stage === "record" ? ports.setCompleted(completed) : ports.setLedger(next)))
    if (failed) return failed
  }
  if (attempt.identity.operation.record.pending.effect.admission.kind === "synced") await attempt.admission(permit)
  return attempt.confirmed()
}
export async function executeExactRetainedPlaylist(permit: ExactRetainedPlaylistPermit, ports: PlaylistRecoveryPorts): Promise<RetainedPlaylistExecution> {
  const attempt = playlistPermits.get(permit)
  playlistPermits.delete(permit)
  if (!attempt || !attempt.live) throw new TypeError("Invalid or consumed exact playlist permit")
  playlistExecuting.set(permit, attempt)
  try {
    if (attempt.progress() === "terminal") return await terminalPlaylist(attempt, { setLedger: ports.setLedger, setCompleted: ports.setCompleted }, permit)
    await attempt.admission(permit)
    const { key, effect } = parsedPlaylistKey(attempt.identity.operation.record)
    if (!same(attempt.observation.records[documentKey(key)], effect.after) || !same(recoveryHistory(attempt.observation.records), effect.history.after)) {
      const batch: JsonObject = { [documentKey(key)]: effect.after }
      if (effect.history.after.kind === "present") batch.sync = effect.history.after.raw
      const failed = await attempt.mutate("documents", batch, () => ports.setPlaylist(effect))
      if (failed) return failed
    }
    await attempt.admission(permit)
    const ledger = ledgerFor(attempt.observation.records, attempt.identity.deviceId)
    const next = replacePlaylistJob(ledger, { identity: attempt.identity, progress: { kind: "terminal" }, permission: { kind: "retiring", generation: attempt.generation, current: attempt.current } })
    const failed = await attempt.mutate("retire", json({ [consentJobsKey]: next }), () => ports.setLedger(next))
    if (failed) return failed
    return await terminalPlaylist(attempt, { setLedger: ports.setLedger, setCompleted: ports.setCompleted }, permit)
  } catch (error) {
    return attempt.interrupt(error)
  } finally {
    playlistPermits.delete(permit)
    playlistExecuting.delete(permit)
  }
}
export function createWithdrawnPlaylistRecovery(deps: PlaylistRecoveryDependencies) {
  const tracker: PlaylistAuthorityTracker = { revision: 0 }
  const reviews = new WeakMap<RetainedPlaylistView, { readonly epoch: number; readonly authority: number }>()
  const snapshots = new Map<string, unknown>()
  let epoch = 0,
    expectedSnapshots: { readonly explicit: unknown; readonly startup: unknown } | undefined
  function observedSnapshot(kind: "explicit" | "startup", value: unknown) {
    if (snapshots.has(kind) && !same(snapshots.get(kind), value) && !(expectedSnapshots && same(expectedSnapshots[kind], value))) epoch++
    snapshots.set(kind, isJsonValue(value) ? detachAgreement(value) : null)
    return value
  }
  let closed = false
  const uncertainty = () => {
    closed = true
    deps.uncertainty()
  }
  const host = deps.host
  const ownedDeps: ObservedPlaylistDependencies = {
    ...deps,
    uncertainty,
    host:
      host.kind !== "fixture"
        ? host
        : {
            ...host,
            snapshot: {
              async read() {
                const value = await host.snapshot.read()
                observedSnapshot("explicit", value)
                return value
              }
            }
          },
    async observeRetainedAgreement() {
      const value = await deps.observeRetainedAgreement?.()
      observedSnapshot("startup", value)
      return value
    },
    observationEpoch: () => epoch,
    allowSnapshots(records, accepted) {
      if (!records || !accepted) {
        expectedSnapshots = undefined
        return
      }
      const retained = localSnapshot(records, accepted)
      expectedSnapshots = { explicit: { retained, history: recoveryHistory(records) }, startup: retained }
    }
  }
  return {
    async review(view: RetainedPlaylistView, records: JsonObject): Promise<boolean> {
      if (closed) return false
      try {
        const current = await observe(ownedDeps)
        if (!same(records, current.records) || withdrawnPlaylistDifference(view, current.records, current.snapshot)) return false
        await readPlaylistAccounts(ownedDeps, tracker)
        reviews.set(view, { epoch, authority: tracker.revision })
        return true
      } catch {
        return false
      }
    },
    async recover(
      origin: UiOrigin,
      capture: PlaylistCapture,
      selected: RetainedPlaylistView
    ): Promise<{
      readonly execution: RetainedPlaylistExecution
      readonly completionCheck: PlaylistObservationFailure | { readonly kind: "complete" } | { readonly kind: "not-complete" }
      readonly records?: JsonObject
    }> {
      let attempt: PlaylistAttempt | undefined
      const permit: ExactRetainedPlaylistPermit = Object.freeze({ [exactPlaylist]: true })
      const unavailable = (): RetainedPlaylistExecution => ({ kind: "unavailable", identity: selected.identity, reason: deps.stopped() ? "disposed" : "stale", mutations: [] })
      const incomplete = (execution: RetainedPlaylistExecution) => ({ execution, completionCheck: { kind: "not-complete" as const } })
      try {
        const captured = reviews.get(selected),
          capturedEpoch = captured?.epoch
        if (
          closed ||
          !captured ||
          captured.authority !== tracker.revision ||
          capturedEpoch === undefined ||
          capturedEpoch !== epoch ||
          !agreementOrigin(origin) ||
          origin.incognito ||
          !same(origin, capture.origin) ||
          capture.revision !== deps.revision()
        )
          return incomplete(unavailable())
        const observation = await observe(ownedDeps)
        if (capturedEpoch !== epoch || capture.revision !== deps.revision() || !same(observation.records, capture.records)) return incomplete(unavailable())
        let ledger = ledgerFor(observation.records, selected.identity.deviceId)
        const again = withdrawnPlaylistSelection(observation.records, ledger)
        if (
          !again ||
          !same(again.identity, selected.identity) ||
          again.progress !== selected.progress ||
          again.registration !== selected.registration ||
          withdrawnPlaylistDifference(selected, observation.records, observation.snapshot)
        )
          return incomplete(unavailable())
        const { key, playlist } = parsedPlaylistKey(selected.identity.operation.record),
          auth = await authorizePlaylist(ownedDeps, key.acct, playlist, tracker)
        if (captured.authority !== tracker.revision) return incomplete(unavailable())
        attempt = new PlaylistAttempt(ownedDeps, selected, observation, auth, tracker, origin, permit)
        playlistExecuting.set(permit, attempt)
        await attempt.fresh()
        if (selected.registration === "unregistered") {
          const identity = selected.identity
          if (ledger.next >= Number.MAX_SAFE_INTEGER || identity.occurrence !== ledger.next) return incomplete(unavailable())
          const entry: ConsentRetainedPlaylistJob = { identity, progress: { kind: "accepted" }, permission: { kind: "held" } }
          const witness: RegisteredPlaylistWitness = {
            descriptor: { kind: "retained-playlist-restore", deviceId: identity.deviceId, accepted: identity.operation.record },
            registration: { kind: "registered", occurrence: identity.occurrence }
          }
          const next: ConsentJobs = { ...ledger, next: ledger.next + 1, jobs: [...ledger.jobs, entry], retainedDocuments: [...(ledger.retainedDocuments ?? []), witness] }
          const failed = await attempt.mutate("register", json({ [consentJobsKey]: next }), () => deps.set(json({ [consentJobsKey]: next })))
          if (failed) return incomplete(failed)
          ledger = next
        }
        for (const kind of ["prepared", "armed"] as const) {
          const permission = { kind, generation: attempt.generation, current: attempt.current }
          const entry: ConsentRetainedPlaylistJob =
            selected.progress === "terminal" ? { identity: selected.identity, progress: { kind: "terminal" }, permission } : { identity: selected.identity, progress: { kind: "accepted" }, permission }
          const next = replacePlaylistJob(ledger, entry)
          const failed = await attempt.mutate(kind === "prepared" ? "prepare" : "authorize", json({ [consentJobsKey]: next }), () => deps.set(json({ [consentJobsKey]: next })))
          if (failed) return incomplete(failed)
          ledger = next
        }
        playlistPermits.set(permit, attempt)
        let execution: RetainedPlaylistExecution
        try {
          execution = await deps.execute(permit)
        } catch (error) {
          execution = attempt.interrupt(error)
        } finally {
          playlistPermits.delete(permit)
        }
        if (execution.kind !== "confirmed") return incomplete(execution)
        try {
          playlistExecuting.set(permit, attempt)
          await attempt.admission(permit)
          const final = await observe(ownedDeps)
          attempt.stopped()
          const job = playlistJob(ledgerFor(final.records, attempt.identity.deviceId), attempt.identity)
          const exactMutations =
            execution.mutations.length === attempt.mutations.length &&
            execution.mutations.every((mutation, index) => {
              const expected = attempt?.mutations[index]
              return (
                expected &&
                mutation.stage === expected.stage &&
                same(mutation.observed, expected.observed) &&
                mutation.write.kind === expected.write.kind &&
                (mutation.write.kind !== "rejected" || (expected.write.kind === "rejected" && mutation.write.error === expected.write.error))
              )
            })
          if (
            !same(execution.identity, attempt.identity) ||
            !same(execution.original, attempt.identity.original) ||
            !same(execution.current, attempt.current) ||
            execution.activation !== "held" ||
            !exactMutations ||
            !same(final.records, attempt.observation.records) ||
            final.revision !== attempt.observation.revision ||
            !attempt.valid(final) ||
            job?.permission.kind !== "done" ||
            job.progress.kind !== "terminal" ||
            !same(final.records[interimConversionKey], completedPlaylistRecord(attempt.identity))
          ) {
            uncertainty()
            return { execution, completionCheck: { kind: "different" } }
          }
          return { execution, completionCheck: { kind: "complete" }, records: final.records }
        } catch (error) {
          uncertainty()
          return { execution, completionCheck: failure(error) }
        }
      } catch (error) {
        return incomplete(attempt ? attempt.interrupt(error) : error instanceof ObservationError ? unavailable() : { kind: "preflight-failed", identity: selected.identity, error, mutations: [] })
      } finally {
        playlistPermits.delete(permit)
        playlistExecuting.delete(permit)
        if (attempt) attempt.live = false
      }
    }
  }
}
