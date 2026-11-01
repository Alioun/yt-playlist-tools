import { keySettingsProgressKey, keySettingsWork, readKeySettingsProgress, type KeySettingsWorkView } from "./key-settings-progress"
import { featureProgressKey, featureProgressWork, readFeatureProgress, type FeatureProgressView } from "./feature-settings-progress"
import type { LocalSettingsWriteResult } from "./shared-setting-execution"
import type { Origin } from "../../shared/contracts/results"
import type { Snapshot } from "../../shared/model/settings-view"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { freezeAgreement, agreementOrigin, type AgreementWrite } from "./consent-agreement"
import { consentObject, isAgreement, readConsentDevice, type Agreement } from "./consent-withdrawal"
import { parsePendingAccountRemoval, pendingAccountRemovalKey, type RemovalResult } from "./account-removal-execution"
import { sameSyncJson } from "./sync-write-admission"
import { readSyncJoinCheckpoint, pendingSyncJoinKey } from "./sync-join-persistence"
import { receivedResetKey, receivedResetResumable, readReceivedReset, type ReceivedResetResult } from "./sync-reset-receive"
import { interimConversionKey, readRetainedCheckpoint, readRetainedInterim, retainedAgreementDevice, isInterimSourceKey, isInterimCanonicalKey, recoveredRetainedAgreementDifference, recoveredRetainedV1AgreementDifference, type InterimPersistenceSnapshot, type RetainedInterim, type AcceptedRetainedAgreementV2 } from "./interim-persistence"

import { deriveInterimInstallationEffect, readInterimInstallationHistory, recoveredRetainedInstallationDifference, type ConfirmedRetainedAgreementV2, type AcceptedRetainedInstallationV3, type InstalledRetainedInstallationV3, type InterimInstallationEffect } from "./interim-installation"
import { createWithdrawnFilterRecovery, parseRetainedFilterIdentity, parseRegisteredDocumentWitnesses, withdrawnFilterSelection, type ConsentRetainedFilterJob, type RetainedFilterJobIdentity, type RegisteredDocumentWitness, type RetainedFilterView, type ExactRetainedFilterPermit, type RetainedFilterExecution, type FilterObservationFailure } from "./withdrawn-document-recovery"
import { createWithdrawnPlaylistRecovery, parseRetainedPlaylistIdentity, withdrawnPlaylistSelection, type ConsentRetainedPlaylistJob, type RetainedPlaylistJobIdentity, type RetainedPlaylistView, type ExactRetainedPlaylistPermit, type RetainedPlaylistExecution, type PlaylistObservationFailure } from "./withdrawn-document-recovery"
import type { RecoveryHost } from "./interim-recovery-execution"
import { parseSettingsImportIdentity, settingsImportWork, recoverSettingsImport, type SettingsImportIdentity, type ConsentSettingsImportJob, type SettingsImportView, type ExactSettingsImportPermit, type ImportRecoveryOutcome } from "./settings-import-recovery"
import type { SettingsImportResult } from "./settings-import-execution"
import { settingsImportKey } from "./settings-import-persistence"

type UiOrigin = Extract<Origin, { kind: "ui" }>
export function freezeConsentValue<T>(value: T): T {
  const pending: unknown[] = [value]
  while (pending.length) { const member = pending.pop(); if (member && typeof member === "object" && !Object.isFrozen(member)) { pending.push(...Object.values(member)); Object.freeze(member) } }
  return value
}
export const consentJobsKey = "consent:jobs"
export type RemovalJobIdentity = {
  readonly deviceId: string; readonly occurrence: number
  readonly operation: { readonly kind: "account-removal"; readonly record: JsonObject }
  readonly original: Agreement
}
type Permission = { readonly kind: "held" } | { readonly kind: "done" } |
  { readonly kind: "prepared"; readonly generation: number; readonly current: Agreement } |
  { readonly kind: "armed"; readonly generation: number; readonly current: Agreement } |
  { readonly kind: "retiring"; readonly generation: number; readonly current: Agreement }
export type RetainedAgreementJobIdentity = {
  readonly deviceId: string; readonly occurrence: number
  readonly operation: { readonly kind: "retained-agreement"; readonly record: JsonObject }
  readonly original: Agreement
}
export type ConsentRetainedAgreementJob =
  | { readonly identity: RetainedAgreementJobIdentity; readonly progress: { readonly kind: "accepted" }; readonly permission: Extract<Permission, { kind: "held" | "prepared" | "armed" }> }
  | { readonly identity: RetainedAgreementJobIdentity; readonly progress: { readonly kind: "terminal" }; readonly permission: Exclude<Permission, { kind: "held" }> }
export type RetainedInstallationJobIdentity = {
  readonly deviceId: string; readonly occurrence: number
  readonly operation: { readonly kind: "retained-installation"; readonly record: AcceptedRetainedInstallationV3 & JsonObject; readonly effect: InterimInstallationEffect & JsonObject }
  readonly original: Agreement
}
export type RetainedInstallationDescriptor = {
  readonly kind: "retained-installation"; readonly deviceId: string
  readonly accepted: AcceptedRetainedInstallationV3 & JsonObject; readonly effect: InterimInstallationEffect & JsonObject
}
export type ConsentRetainedInstallationJob =
  | { readonly identity: RetainedInstallationJobIdentity; readonly progress: { readonly kind: "accepted" }; readonly permission: Extract<Permission, { kind: "held" | "prepared" | "armed" }> }
  | { readonly identity: RetainedInstallationJobIdentity; readonly progress: { readonly kind: "terminal" }; readonly permission: Exclude<Permission, { kind: "held" }> }
export type ConsentJob = ConsentSettingsImportJob | ConsentRemovalJob | ConsentRetainedAgreementJob | ConsentRetainedInstallationJob | ConsentRetainedFilterJob | ConsentRetainedPlaylistJob
export type ConsentRemovalJob = {
  readonly identity: RemovalJobIdentity
  readonly progress: { readonly kind: "accepted" | "terminal" }
  readonly permission: Permission
}
export type RetainedV1Descriptor = {
  readonly kind: "retained-v1-acceptance"; readonly deviceId: string
  readonly retained: RetainedInterim & JsonObject; readonly accepted: AcceptedRetainedAgreementV2 & JsonObject
  readonly proposedUnder: { readonly generation: number; readonly current: Agreement }
}
export type ConsentRetainedV1Proposal =
  | { readonly descriptor: RetainedV1Descriptor; readonly registration: { readonly kind: "unregistered"; readonly expectedNext: number }; readonly permission: Extract<Permission, { kind: "prepared" | "armed" }> }
  | { readonly descriptor: RetainedV1Descriptor; readonly registration: { readonly kind: "registered"; readonly occurrence: number } }
type ConsentJobsBase = { readonly v: 1; readonly kind: "consent-jobs"; readonly deviceId: string; readonly next: number; readonly jobs: ConsentJob[] }
export type ConsentRetainedInstallationProposal =
  | { readonly descriptor: RetainedInstallationDescriptor; readonly registration: { readonly kind: "unregistered"; readonly expectedNext: number }; readonly permission: Extract<Permission, { kind: "prepared" | "armed" }> }
  | { readonly descriptor: RetainedInstallationDescriptor; readonly registration: { readonly kind: "registered"; readonly occurrence: number } }
export type ConsentJobs = ConsentJobsBase & { readonly retainedV1?: ConsentRetainedV1Proposal; readonly retainedInstallation?: ConsentRetainedInstallationProposal; readonly retainedDocuments?: RegisteredDocumentWitness[] }
export type HeldJobSelection = { readonly kind: "held-job-selection" }
export type WithdrawnWorkReview = { readonly kind: "withdrawn-work-review" }
export type HeldWorkView =
  | { readonly kind: "sync-reset"; readonly selection: HeldJobSelection; readonly record: JsonObject; readonly resume: "current-agreement" | "explicit-recovery" }
  | KeySettingsWorkView
  | FeatureProgressView
  | SettingsImportView
  | RetainedPlaylistView
  | RetainedFilterView
  | RetainedV1AcceptanceView
  | RetainedInstallationView
  | RetainedInstallationAcceptanceView
  | { readonly kind: "account-removal"; readonly selection: HeldJobSelection; readonly occurrence: number; readonly record: JsonObject; readonly original: Agreement; readonly recoverability: "exact-removal" }
  | { readonly kind: "retained-agreement"; readonly selection: HeldJobSelection; readonly occurrence: number; readonly record: JsonObject; readonly original: Agreement; readonly current: Agreement; readonly stages: readonly RetainedAgreementRecoveryStage[]; readonly recoverability: "exact-retained-agreement" }
  | { readonly kind: "unsupported"; readonly operation: "legacy" | "retained" | "join" | "control" | "removal"; readonly reason: "unsupported-recovery" | "invalid" | "newer-version"; readonly inspection?: JsonValue }
export type HeldWorkRead =
  | { readonly kind: "none" }
  | { readonly kind: "held"; readonly review: WithdrawnWorkReview; readonly work: readonly HeldWorkView[]; readonly consent: Agreement | null }
  | { readonly kind: "unavailable"; readonly reason: "disposed" | "startup" | "stale" | "newer-layout" | "invalid-origin" }
export type RetainedAgreementRecoveryStage = "retire" | "record" | "done"
export type RetainedAgreementRecoveryExecution =
  | { readonly kind: "confirmed"; readonly original: Agreement; readonly current: Agreement; readonly activation: "held"; readonly mutations: readonly { readonly stage: RetainedAgreementRecoveryStage; readonly write: AgreementWrite }[] }
  | { readonly kind: "unavailable"; readonly reason: "stale" | "disposed" | "consent-held" }
  | { readonly kind: "failed"; readonly stage: RetainedAgreementRecoveryStage; readonly write: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: RetainedAgreementRecoveryStage; readonly write: AgreementWrite; readonly cause: "different" | "read-failed" | "stopped"; readonly error?: unknown }
type ConfirmedPermissionWrite<S extends "prepare" | "authorize"> = { readonly stage: S; readonly write: AgreementWrite }
export type RetainedPermissionWrites = readonly [ConfirmedPermissionWrite<"prepare">, ConfirmedPermissionWrite<"authorize">]
type PermissionPrefix = readonly [] | readonly [ConfirmedPermissionWrite<"prepare">] | RetainedPermissionWrites
export type RetainedInstallationRecoveryStage = "documents" | "retire" | "record" | "done"
export type RetainedInstallationView = {
  readonly kind: "retained-installation"; readonly selection: HeldJobSelection; readonly identity: RetainedInstallationJobIdentity
  readonly registration: "unregistered" | "registered"; readonly checkpoint: "accepted" | "installed"; readonly progress: "accepted" | "terminal"
  readonly current: Agreement; readonly stages: readonly RetainedInstallationRecoveryStage[]; readonly recoverability: "exact-retained-installation"
}
type InstallationMutation = { readonly stage: RetainedInstallationRecoveryStage; readonly write: AgreementWrite }
type InstallationObservationFailure = { readonly kind: "different" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown }
export type RetainedInstallationExecution =
  | { readonly kind: "confirmed"; readonly original: Agreement; readonly current: Agreement; readonly activation: "held"; readonly mutations: readonly InstallationMutation[] }
  | { readonly kind: "unavailable"; readonly reason: "stale" | "disposed" | "consent-held"; readonly mutations: readonly InstallationMutation[] }
  | { readonly kind: "failed"; readonly stage: RetainedInstallationRecoveryStage; readonly write: Extract<AgreementWrite, { kind: "rejected" }>; readonly mutations: readonly InstallationMutation[] }
  | { readonly kind: "unconfirmed"; readonly stage: RetainedInstallationRecoveryStage; readonly write: AgreementWrite; readonly observation: InstallationObservationFailure; readonly mutations: readonly InstallationMutation[] }
type InstallationCompletionCheck = { readonly kind: "not-complete" | "different" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown }
type InstallationRecovered = {
  readonly kind: "recovered"; readonly job: RetainedInstallationJobIdentity
  readonly completion: { readonly operation: "retained-installation"; readonly result: Extract<RetainedInstallationExecution, { kind: "confirmed" }> }
  readonly permissionWrites: RetainedPermissionWrites; readonly remaining: readonly HeldWorkView[]
}
type InstallationAuthorizedPending = {
  readonly kind: "authorized-pending"; readonly job: RetainedInstallationJobIdentity; readonly reason: "executor"
  readonly observation: RetainedInstallationExecution; readonly permissionWrites: RetainedPermissionWrites; readonly completionCheck: InstallationCompletionCheck
}
type InstallationPermissionFault = {
  readonly job: RetainedInstallationJobIdentity; readonly registration: "unregistered" | "registered"; readonly confirmedPermissionWrites: PermissionPrefix
} & (
  | { readonly kind: "failed"; readonly operation: "retained-installation"; readonly stage: "prepare" | "authorize"; readonly error: unknown; readonly write?: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly operation: "retained-installation"; readonly stage: "prepare" | "authorize"; readonly write: AgreementWrite; readonly observation: InstallationObservationFailure }
)
export type RetainedInstallationAcceptanceView = {
  readonly kind: "retained-installation-acceptance"; readonly selection: HeldJobSelection; readonly descriptor: RetainedInstallationDescriptor
  readonly registration: ConsentRetainedInstallationProposal["registration"]; readonly checkpoint: "agreed" | "accepted" | "installed"
  readonly current: Agreement; readonly stages: readonly ("prepare" | "authorize" | "accept" | RetainedInstallationRecoveryStage)[]
  readonly recoverability: "exact-retained-installation-acceptance"
}
export type RetainedInstallationAcceptanceJob = {
  readonly deviceId: string; readonly occurrence: number
  readonly operation: { readonly kind: "retained-installation-acceptance"; readonly descriptor: RetainedInstallationDescriptor }; readonly original: Agreement
}
type InstallationAcceptanceObservation = { readonly kind: "confirmed"; readonly write: AgreementWrite } | { readonly kind: "already-present" }
type InstallationAcceptanceRecovered = {
  readonly kind: "recovered"; readonly job: RetainedInstallationAcceptanceJob
  readonly completion: { readonly operation: "retained-installation-acceptance"; readonly result: { readonly kind: "confirmed"; readonly acceptance: InstallationAcceptanceObservation; readonly installation: Extract<RetainedInstallationExecution, { kind: "confirmed" }>; readonly activation: "held" } }
  readonly permissionWrites: RetainedPermissionWrites; readonly remaining: readonly HeldWorkView[]
}
type InstallationAcceptancePending = {
  readonly kind: "authorized-pending"; readonly job: RetainedInstallationAcceptanceJob; readonly reason: "executor"
  readonly observation: RetainedInstallationExecution; readonly acceptance: InstallationAcceptanceObservation
  readonly permissionWrites: RetainedPermissionWrites; readonly completionCheck: InstallationCompletionCheck
}
type InstallationDraftProgress = { readonly descriptor: RetainedInstallationDescriptor; readonly registration: ConsentRetainedInstallationProposal["registration"]; readonly confirmedPermissionWrites: PermissionPrefix }
type InstallationAcceptanceFault = InstallationDraftProgress & (
  | { readonly kind: "failed"; readonly operation: "retained-installation-acceptance"; readonly stage: "prepare" | "authorize" | "accept"; readonly error: unknown; readonly write?: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly operation: "retained-installation-acceptance"; readonly stage: "prepare" | "authorize" | "accept"; readonly write: AgreementWrite; readonly observation: InstallationObservationFailure }
)
export type RetainedV1AcceptanceView = {
  readonly kind: "retained-v1-acceptance"; readonly selection: HeldJobSelection; readonly proposal: RetainedV1Descriptor
  readonly registration: ConsentRetainedV1Proposal["registration"]; readonly current: Agreement
  readonly checkpoint: "v1" | "accepted" | "confirmed"; readonly stages: readonly ("prepare" | "authorize" | "accept" | RetainedAgreementRecoveryStage)[]
  readonly recoverability: "exact-retained-v1-acceptance"
}
export type RetainedV1RecoveryJob = {
  readonly deviceId: string; readonly occurrence: number
  readonly operation: { readonly kind: "retained-v1-acceptance"; readonly proposal: RetainedV1Descriptor }; readonly original: Agreement
}
export type RetainedV1RecoveryCompletion = {
  readonly operation: "retained-v1-acceptance"
  readonly result: { readonly kind: "confirmed"; readonly acceptance: { readonly kind: "confirmed"; readonly write: AgreementWrite } | { readonly kind: "already-present" };
    readonly receipt: Extract<RetainedAgreementRecoveryExecution, { kind: "confirmed" }>; readonly activation: "held" }
}
type V1Progress = { readonly proposal: RetainedV1Descriptor; readonly registration: RetainedV1AcceptanceView["registration"]; readonly confirmedPermissionWrites: PermissionPrefix }
type V1Fault =
  | (V1Progress & { readonly kind: "failed"; readonly operation: "retained-v1-acceptance"; readonly stage: "prepare" | "authorize" | "accept"; readonly error: unknown; readonly write?: Extract<AgreementWrite, { kind: "rejected" }> })
  | (V1Progress & { readonly kind: "unconfirmed"; readonly operation: "retained-v1-acceptance"; readonly stage: "prepare" | "authorize" | "accept"; readonly write: AgreementWrite; readonly cause: "different" | "read-failed" | "stopped"; readonly error?: unknown })
export type ExactRecoveryResult =
  | { readonly kind: "recovered"; readonly job: { readonly kind: "sync-reset"; readonly id: string }; readonly completion: { readonly operation: "sync-reset"; readonly result: Extract<ReceivedResetResult, { kind: "reset-received" }> }; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "sync-reset-held"; readonly result: ReceivedResetResult }
  | { readonly kind: "key-settings-recovered"; readonly original: Agreement; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "key-settings-pending"; readonly original: Agreement; readonly result: LocalSettingsWriteResult }
  | { readonly kind: "feature-settings-recovered"; readonly original: Agreement; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "feature-settings-pending"; readonly original: Agreement; readonly result: LocalSettingsWriteResult }
  | ImportRecoveryOutcome
  | { readonly kind: "recovered"; readonly job: RetainedFilterJobIdentity; readonly completion: { readonly operation: "retained-filter-replacement"; readonly result: Extract<RetainedFilterExecution, { kind: "confirmed" }> }; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "authorized-pending"; readonly job: RetainedFilterJobIdentity; readonly reason: "executor"; readonly observation: RetainedFilterExecution; readonly completionCheck: FilterObservationFailure | { readonly kind: "not-complete" } }
  | { readonly kind: "recovered"; readonly job: RetainedPlaylistJobIdentity; readonly completion: { readonly operation: "retained-playlist-restore"; readonly result: Extract<RetainedPlaylistExecution, { kind: "confirmed" }> }; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "authorized-pending"; readonly job: RetainedPlaylistJobIdentity; readonly reason: "executor"; readonly observation: RetainedPlaylistExecution; readonly completionCheck: PlaylistObservationFailure | { readonly kind: "not-complete" } }
  | InstallationAcceptanceFault
  | InstallationAcceptanceRecovered
  | InstallationAcceptancePending
  | V1Fault
  | InstallationPermissionFault
  | InstallationRecovered
  | InstallationAuthorizedPending
  | { readonly kind: "recovered"; readonly job: RetainedV1RecoveryJob; readonly completion: RetainedV1RecoveryCompletion; readonly permissionWrites: RetainedPermissionWrites; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "authorized-pending"; readonly job: RetainedV1RecoveryJob; readonly reason: "executor"; readonly permissionWrites: RetainedPermissionWrites; readonly acceptance: RetainedV1RecoveryCompletion["result"]["acceptance"]; readonly observation: RetainedAgreementRecoveryExecution; readonly completionCheck: { readonly kind: "not-complete" | "different" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }
  | { readonly kind: "recovered"; readonly job: RetainedAgreementJobIdentity; readonly completion: { readonly operation: "retained-agreement"; readonly result: Extract<RetainedAgreementRecoveryExecution, { kind: "confirmed" }> }; readonly permissionWrites: RetainedPermissionWrites; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "authorized-pending"; readonly job: RetainedAgreementJobIdentity; readonly reason: "executor"; readonly observation: RetainedAgreementRecoveryExecution; readonly permissionWrites: RetainedPermissionWrites; readonly completionCheck: { readonly kind: "not-complete" | "different" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }
  | { readonly kind: "failed"; readonly job: RetainedAgreementJobIdentity; readonly confirmedPermissionWrites: PermissionPrefix; readonly stage: "prepare" | "authorize"; readonly error: unknown; readonly write?: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly job: RetainedAgreementJobIdentity; readonly confirmedPermissionWrites: PermissionPrefix; readonly stage: "prepare" | "authorize"; readonly write: AgreementWrite; readonly cause: "different" | "read-failed" | "stopped"; readonly error?: unknown }
  | { readonly kind: "recovered"; readonly job: RemovalJobIdentity; readonly completion: { readonly operation: "account-removal"; readonly result: Extract<RemovalResult, { kind: "committed" | "unchanged" }> }; readonly remaining: readonly HeldWorkView[] }
  | { readonly kind: "authorized-pending"; readonly job: RemovalJobIdentity; readonly reason: "executor"; readonly observation: RemovalResult }
  | { readonly kind: "refused"; readonly reason: "not-agreed" | "private" | "invalid-origin" | "invalid-input" }
  | { readonly kind: "unavailable"; readonly reason: "unsupported-recovery" | "stale" | "not-held" | "newer-layout" | "disposed" | "startup" }
  | { readonly kind: "failed"; readonly stage: "prepare" | "authorize"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly stage: "prepare" | "authorize"; readonly write: AgreementWrite; readonly cause: "different" | "read-failed" | "stopped" }

function integer(raw: unknown): raw is number { return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 }
function exact(raw: JsonObject, keys: readonly string[]): boolean { return keys.length === Object.keys(raw).length && keys.every(key => Object.hasOwn(raw, key)) }
export function parseConsentJobs(raw: unknown): ConsentJobs | undefined {
  if (!consentObject(raw) || !exact(raw, ["v", "kind", "deviceId", "next", "jobs", ...["retainedV1", "retainedInstallation", "retainedDocuments"].filter(key => Object.hasOwn(raw, key))]) || raw.v !== 1 || raw.kind !== "consent-jobs" ||
    typeof raw.deviceId !== "string" || !raw.deviceId || !integer(raw.next) || !Array.isArray(raw.jobs)) return
  const jobs: ConsentJob[] = [], occurrences = new Set<number>()
  for (const entry of raw.jobs) {
    if (!consentObject(entry) || !exact(entry, ["identity", "progress", "permission"]) || !consentObject(entry.identity) || !consentObject(entry.progress) || !consentObject(entry.permission)) return
    const id = entry.identity, progress = entry.progress, permission = entry.permission
    if (!exact(id, ["deviceId", "occurrence", "operation", "original"]) || id.deviceId !== raw.deviceId || !integer(id.occurrence) || id.occurrence >= raw.next || occurrences.has(id.occurrence) ||
      !consentObject(id.operation) || !exact(id.operation, id.operation.kind === "retained-installation" ? ["kind", "record", "effect"] : ["kind", "record"]) || !isAgreement(id.original)) return
    if (!exact(progress, ["kind"]) || (progress.kind !== "accepted" && progress.kind !== "terminal")) return
    let identity: SettingsImportIdentity | RemovalJobIdentity | RetainedAgreementJobIdentity | RetainedInstallationJobIdentity | RetainedFilterJobIdentity | RetainedPlaylistJobIdentity
    if (id.operation.kind === "settings-import") {
      const parsed = parseSettingsImportIdentity(id)
      if (!parsed) return
      identity = parsed
    } else if (id.operation.kind === "account-removal") {
      const parsed = parsePendingAccountRemoval(id.operation.record)
      if (!parsed || parsed.record.deviceId !== id.deviceId || !sameSyncJson(parsed.record.consent, id.original)) return
      identity = { deviceId: id.deviceId, occurrence: id.occurrence, operation: { kind: "account-removal", record: parsed.raw }, original: { ...id.original } }
    } else if (id.operation.kind === "retained-agreement") {
      const parsed = readRetainedCheckpoint(id.operation.record)
      if (!consentObject(id.operation.record) || parsed.kind !== "agreement" || parsed.checkpoint.agreement.kind !== "accepted" || !sameValue(Object.getOwnPropertyDescriptor(parsed.checkpoint.agreement.effect.device, "id")?.value, id.deviceId) || !sameSyncJson(parsed.checkpoint.agreement.effect.consent, id.original)) return
      identity = { deviceId: id.deviceId, occurrence: id.occurrence, operation: { kind: "retained-agreement", record: id.operation.record }, original: { ...id.original } }
    } else if (id.operation.kind === "retained-installation") {
      const record = id.operation.record
      if (!isAcceptedInstallation(record)) return
      const accepted = record as unknown as Snapshot<AcceptedRetainedInstallationV3>
      const derived = deriveInterimInstallationEffect(accepted.agreed)
      if (derived.kind !== "effect" || !consentObject(derived.effect) || !sameValue(derived.effect, id.operation.effect) || !sameValue(record.agreed.agreement.effect.device.id, id.deviceId) || !sameValue(record.agreed.agreement.effect.consent, id.original)) return
      identity = { deviceId: id.deviceId, occurrence: id.occurrence, operation: { kind: "retained-installation", record, effect: derived.effect }, original: { ...id.original } }
    } else if (id.operation.kind === "retained-filter-replacement") {
      const parsed = parseRetainedFilterIdentity(id)
      if (!parsed) return
      identity = parsed
    } else if (id.operation.kind === "retained-playlist-restore") {
      const parsed = parseRetainedPlaylistIdentity(id)
      if (!parsed) return
      identity = parsed
    } else return
    let permit: Permission
    if ((permission.kind === "held" || permission.kind === "done") && exact(permission, ["kind"])) permit = { kind: permission.kind }
    else if ((permission.kind === "prepared" || permission.kind === "armed" || permission.kind === "retiring") && exact(permission, ["kind", "generation", "current"]) && integer(permission.generation) && isAgreement(permission.current)) permit = { kind: permission.kind, generation: permission.generation, current: { ...permission.current } }
    else return
    if ((permit.kind === "done" || permit.kind === "retiring") && progress.kind !== "terminal" || permit.kind === "held" && progress.kind === "terminal") return
    occurrences.add(id.occurrence)
    if (identity.operation.kind === "settings-import") {
      jobs.push({ identity: { ...identity, operation: identity.operation }, progress: { kind: progress.kind }, permission: permit })
    } else if (identity.operation.kind === "account-removal") {
      jobs.push({ identity: { ...identity, operation: identity.operation }, progress: { kind: progress.kind }, permission: permit })
    } else if (identity.operation.kind === "retained-filter-replacement") {
      const filterIdentity = { ...identity, operation: identity.operation }
      if (progress.kind === "accepted" && (permit.kind === "held" || permit.kind === "prepared" || permit.kind === "armed")) jobs.push({ identity: filterIdentity, progress: { kind: "accepted" }, permission: permit })
      else if (progress.kind === "terminal" && permit.kind !== "held") jobs.push({ identity: filterIdentity, progress: { kind: "terminal" }, permission: permit })
      else return
    } else if (identity.operation.kind === "retained-playlist-restore") {
      const filterIdentity = { ...identity, operation: identity.operation }
      if (progress.kind === "accepted" && (permit.kind === "held" || permit.kind === "prepared" || permit.kind === "armed")) jobs.push({ identity: filterIdentity, progress: { kind: "accepted" }, permission: permit })
      else if (progress.kind === "terminal" && permit.kind !== "held") jobs.push({ identity: filterIdentity, progress: { kind: "terminal" }, permission: permit })
      else return
    } else if (identity.operation.kind === "retained-installation") {
      const installationIdentity = { ...identity, operation: identity.operation }
      if (progress.kind === "accepted" && (permit.kind === "held" || permit.kind === "prepared" || permit.kind === "armed")) jobs.push({ identity: installationIdentity, progress: { kind: "accepted" }, permission: permit })
      else if (progress.kind === "terminal" && permit.kind !== "held") jobs.push({ identity: installationIdentity, progress: { kind: "terminal" }, permission: permit })
      else return
    } else if (progress.kind === "accepted" && (permit.kind === "held" || permit.kind === "prepared" || permit.kind === "armed")) {
      jobs.push({ identity: { ...identity, operation: identity.operation }, progress: { kind: "accepted" }, permission: permit })
    } else if (progress.kind === "terminal" && permit.kind !== "held") {
      jobs.push({ identity: { ...identity, operation: identity.operation }, progress: { kind: "terminal" }, permission: permit })
    } else return
  }
  const base = { v: 1, kind: "consent-jobs", deviceId: raw.deviceId, next: raw.next, jobs } as const
  let ledger: ConsentJobs = base
  if (Object.hasOwn(raw, "retainedV1")) {
    const proposal = parseV1Proposal(raw.retainedV1, ledger)
    if (!proposal) return
    ledger = { ...ledger, retainedV1: proposal }
  }
  if (Object.hasOwn(raw, "retainedInstallation")) {
    const proposal = parseInstallationProposal(raw.retainedInstallation, ledger)
    if (!proposal) return
    ledger = { ...ledger, retainedInstallation: proposal }
  }
  if (Object.hasOwn(raw, "retainedDocuments")) {
    const witnesses = parseRegisteredDocumentWitnesses(raw.retainedDocuments, ledger)
    if (!witnesses) return
    ledger = { ...ledger, retainedDocuments: witnesses }
  } else if (jobs.some(job => job.identity.operation.kind === "retained-filter-replacement" || job.identity.operation.kind === "retained-playlist-restore")) return
  return ledger
}
function installationIdentity(descriptor: RetainedInstallationDescriptor, occurrence: number): RetainedInstallationJobIdentity {
  return { deviceId: descriptor.deviceId, occurrence, operation: { kind: "retained-installation", record: descriptor.accepted, effect: descriptor.effect }, original: descriptor.accepted.agreed.agreement.effect.consent }
}
function parseInstallationProposal(raw: unknown, ledger: ConsentJobs): ConsentRetainedInstallationProposal | undefined {
  if (!consentObject(raw) || !consentObject(raw.descriptor) || !consentObject(raw.registration)) return
  const descriptor = raw.descriptor, registration = raw.registration
  if (!exact(descriptor, ["kind", "deviceId", "accepted", "effect"]) || descriptor.kind !== "retained-installation" || descriptor.deviceId !== ledger.deviceId) return
  if (registration.kind === "registered") {
    if (!exact(raw, ["descriptor", "registration"]) || !exact(registration, ["kind", "occurrence"]) || !integer(registration.occurrence) || registration.occurrence >= ledger.next) return
    const entry = ledger.jobs.find(job => job.identity.occurrence === registration.occurrence)
    if (!entry || entry.identity.operation.kind !== "retained-installation" || !sameValue(entry.identity.operation.record, descriptor.accepted) || !sameValue(entry.identity.operation.effect, descriptor.effect) || ledger.jobs.filter(job => job.identity.operation.kind === "retained-installation" && sameValue(job.identity.operation.record, descriptor.accepted)).length !== 1) return
    const checked: RetainedInstallationDescriptor = { kind:"retained-installation",deviceId:ledger.deviceId,accepted:entry.identity.operation.record,effect:entry.identity.operation.effect }
    return { descriptor:checked,registration:{ kind:"registered",occurrence:registration.occurrence } }
  }
  if (!isAcceptedInstallation(descriptor.accepted)) return
  const accepted = descriptor.accepted as unknown as Snapshot<AcceptedRetainedInstallationV3>
  const derived = deriveInterimInstallationEffect(accepted.agreed)
  if (derived.kind !== "effect" || !consentObject(derived.effect) || !sameValue(derived.effect, descriptor.effect) || !sameValue(descriptor.accepted.agreed.agreement.effect.device.id, ledger.deviceId)) return
  const checked: RetainedInstallationDescriptor = { kind: "retained-installation", deviceId: ledger.deviceId, accepted: descriptor.accepted, effect: derived.effect }
  if (registration.kind === "unregistered") {
    const permission = raw.permission
    if (!exact(raw, ["descriptor", "registration", "permission"]) || !exact(registration, ["kind", "expectedNext"]) || !integer(registration.expectedNext) ||
      !consentObject(permission) || !exact(permission, ["kind", "generation", "current"]) || permission.kind !== "prepared" && permission.kind !== "armed" || !integer(permission.generation) || !isAgreement(permission.current)) return
    return { descriptor: checked, registration: { kind: "unregistered", expectedNext: registration.expectedNext }, permission: { kind: permission.kind, generation: permission.generation, current: permission.current } }
  }
}
function isV1(raw: unknown): raw is RetainedInterim & JsonObject { return consentObject(raw) && readRetainedInterim(raw).kind === "valid" }
function isAcceptedV2(raw: unknown): raw is AcceptedRetainedAgreementV2 & JsonObject {
  if (!consentObject(raw)) return false
  const parsed = readRetainedCheckpoint(raw)
  return parsed.kind === "agreement" && parsed.checkpoint.agreement.kind === "accepted"
}
function parseV1Proposal(raw: unknown, ledger: ConsentJobs): ConsentRetainedV1Proposal | undefined {
  if (!consentObject(raw) || !consentObject(raw.descriptor) || !consentObject(raw.registration)) return
  const descriptor = raw.descriptor, registration = raw.registration, under = descriptor.proposedUnder
  if (!exact(descriptor, ["kind", "deviceId", "retained", "accepted", "proposedUnder"]) || descriptor.kind !== "retained-v1-acceptance" || descriptor.deviceId !== ledger.deviceId ||
    !consentObject(under) || !exact(under, ["generation", "current"]) || !integer(under.generation) || !isAgreement(under.current) || !isV1(descriptor.retained) || !isAcceptedV2(descriptor.accepted)) return
  const retained = descriptor.retained, accepted = descriptor.accepted, parsedRetained = readRetainedInterim(retained)
  if (parsedRetained.kind !== "valid") return
  const device = retainedAgreementDevice(parsedRetained.checkpoint, under.current)
  if (!device || device.id !== ledger.deviceId || !sameValue(accepted, { v: 2, kind: "retained-interim", retained, agreement: { kind: "accepted", effect: { consent: under.current, device } } })) return
  const checked: RetainedV1Descriptor = { kind: "retained-v1-acceptance", deviceId: ledger.deviceId, retained, accepted, proposedUnder: { generation: under.generation, current: under.current } }
  if (registration.kind === "unregistered") {
    const permission = raw.permission
    if (!exact(raw, ["descriptor", "registration", "permission"]) || !exact(registration, ["kind", "expectedNext"]) || !integer(registration.expectedNext) ||
      !consentObject(permission) || !exact(permission, ["kind", "generation", "current"]) || permission.kind !== "prepared" && permission.kind !== "armed" || !integer(permission.generation) || !isAgreement(permission.current)) return
    return { descriptor: checked, registration: { kind: "unregistered", expectedNext: registration.expectedNext }, permission: { kind: permission.kind, generation: permission.generation, current: permission.current } }
  }
  if (registration.kind !== "registered" || !exact(raw, ["descriptor", "registration"]) || !exact(registration, ["kind", "occurrence"]) || !integer(registration.occurrence) || registration.occurrence >= ledger.next) return
  const identity = v1ReceiptIdentity(checked, registration.occurrence)
  if (ledger.jobs.filter(job => sameValue(job.identity, identity)).length !== 1) return
  return { descriptor: checked, registration: { kind: "registered", occurrence: registration.occurrence } }
}
function v1ReceiptIdentity(proposal: RetainedV1Descriptor, occurrence: number): RetainedAgreementJobIdentity {
  return { deviceId: proposal.deviceId, occurrence, operation: { kind: "retained-agreement", record: proposal.accepted }, original: proposal.accepted.agreement.effect.consent }
}
function jobsFor(records: JsonObject, deviceId: string): ConsentJobs | undefined {
  if (!Object.hasOwn(records, consentJobsKey)) return { v: 1, kind: "consent-jobs", deviceId, next: 0, jobs: [] }
  const jobs = parseConsentJobs(records[consentJobsKey])
  return jobs?.deviceId === deviceId ? jobs : undefined
}
function replace(ledger: ConsentJobs, entry: ConsentRemovalJob): ConsentJobs {
  return { ...ledger, jobs: [...ledger.jobs.filter(job => job.identity.occurrence !== entry.identity.occurrence), entry].sort((a, b) => a.identity.occurrence - b.identity.occurrence) }
}
export function acceptedRemovalLedger(records: JsonObject, raw: JsonObject): JsonObject | undefined {
  if (!Object.hasOwn(records, "consent:state")) return {}
  const read = readConsentDevice(records), parsed = parsePendingAccountRemoval(raw)
  if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !parsed) return
  const ledger = jobsFor(records, read.device.id)
  if (!ledger || ledger.next >= Number.MAX_SAFE_INTEGER) return
  const identity: RemovalJobIdentity = { deviceId: read.device.id, occurrence: ledger.next, operation: { kind: "account-removal", record: parsed.raw }, original: parsed.record.consent }
  return { [consentJobsKey]: { ...ledger, next: ledger.next + 1, jobs: [...ledger.jobs, { identity, progress: { kind: "accepted" }, permission: { kind: "held" } }] } }
}

const exactRemoval = Symbol("exact-removal")
export type ExactRemovalPermit = { readonly [exactRemoval]: true }
type Binding = { readonly job: ConsentRemovalJob; readonly generation: number; readonly current: Agreement; readonly device: JsonObject }
const permits = new WeakMap<ExactRemovalPermit, Binding>()
export function selectedRetiringRemoval(permit: ExactRemovalPermit | undefined, records: JsonObject): JsonObject | undefined {
  if (!permit) return
  const binding = permits.get(permit)
  if (!binding) return
  const raw = binding.job.identity.operation.record
  const ledger = parseConsentJobs(records[consentJobsKey])
  return ledger?.jobs.some(job => job.identity.operation.kind === "account-removal" && job.identity.occurrence === binding.job.identity.occurrence && job.progress.kind === "terminal" && (job.permission.kind === "retiring" || job.permission.kind === "armed")) && permitsExactRemoval(permit, records, raw) ? raw : undefined
}
export function permitsExactRemoval(permit: ExactRemovalPermit | undefined, records: JsonObject, raw: JsonObject): boolean {
  if (!permit) return false
  const binding = permits.get(permit), read = readConsentDevice(records)
  if (!binding || read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || read.control.generation !== binding.generation || !sameSyncJson(read.control.state.current, binding.current)) return false
  const ledger = jobsFor(records, read.device.id), entry = ledger?.jobs.find(job => job.identity.occurrence === binding.job.identity.occurrence)
  if (!entry || entry.identity.operation.kind !== "account-removal" || entry.permission.kind !== "armed" && entry.permission.kind !== "retiring" && entry.permission.kind !== "done" || (entry.permission.kind !== "done" && (entry.permission.generation !== binding.generation || !sameSyncJson(entry.permission.current, binding.current))) ||
    !sameSyncJson(entry.identity, binding.job.identity) || !sameSyncJson(raw, entry.identity.operation.record)) return false
  const expected = { ...binding.device }
  if (read.device.lastAccount === null) expected.lastAccount = null
  return sameSyncJson(expected, read.raw)
}
export function removalRetirementLedger(records: JsonObject, raw: JsonObject, stage: "retiring" | "done", permit?: ExactRemovalPermit): JsonObject | undefined {
  if (!Object.hasOwn(records, "consent:state")) return {}
  const read = readConsentDevice(records)
  if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed") return
  const ledger = jobsFor(records, read.device.id)
  if (!ledger) return
  const entry = [...ledger.jobs].reverse().find(job => job.identity.operation.kind === "account-removal" && job.permission.kind !== "done" && sameSyncJson(job.identity.operation.record, raw))
  if (!entry || entry.identity.operation.kind !== "account-removal" || permit && !permitsExactRemoval(permit, records, raw)) return
  if (stage === "done" && entry.permission.kind !== "retiring") return
  const permission: Permission = stage === "done" ? { kind: "done" } : { kind: "retiring", generation: read.control.generation, current: read.control.state.current }
  return { [consentJobsKey]: replace(ledger, { ...entry, identity: { ...entry.identity, operation: entry.identity.operation }, progress: { kind: "terminal" }, permission }) }
}

export function classifyConsentWork(records: JsonObject): readonly HeldWorkView[] {
  const work: HeldWorkView[] = [...keySettingsWork(records), ...featureProgressWork(records)], read = readConsentDevice(records)
  if (Object.hasOwn(records, receivedResetKey)) {
    const marker = readReceivedReset(records[receivedResetKey]), raw = records[receivedResetKey]
    if (marker && consentObject(raw)) work.push({ kind: "sync-reset", selection: Object.freeze({ kind: "held-job-selection" }),
      record: freezeConsentValue(raw), resume: receivedResetResumable(records) ? "current-agreement" : "explicit-recovery" })
    else work.push({ kind: "unsupported", operation: "control", reason: "invalid", inspection: { key: receivedResetKey } })
  }
  const keys = readKeySettingsProgress(records[keySettingsProgressKey])
  if (keys.kind === "invalid" || keys.kind === "newer-version") work.push({ kind: "unsupported", operation: "control", reason: keys.kind, inspection: { key: keySettingsProgressKey } })
  const feature = readFeatureProgress(records[featureProgressKey])
  if (feature.kind === "invalid" || feature.kind === "newer-version") work.push({ kind: "unsupported", operation: "control", reason: feature.kind === "invalid" ? "invalid" : "newer-version", inspection: { key: featureProgressKey } })
  if (read.kind === "supported" && !read.control && (feature.kind === "valid" || keys.kind === "valid")) return [...work, ...settingsImportWork(records, undefined)]
  if (read.kind !== "supported" || !read.control) return [...work, { kind: "unsupported", operation: "control", reason: "invalid" }, ...settingsImportWork(records, undefined)]
  if (read.control.state.kind === "withdrawing") work.push({ kind: "unsupported", operation: "control", reason: "unsupported-recovery", inspection: { state: "withdrawing", prior: read.control.state.prior } })
  const ledger = jobsFor(records, read.device.id)
  if (!ledger) work.push({ kind: "unsupported", operation: "control", reason: "invalid" })
  if (Object.hasOwn(records, pendingAccountRemovalKey)) {
    const parsed = parsePendingAccountRemoval(records[pendingAccountRemovalKey])
    if (parsed && parsed.record.deviceId === read.device.id && ledger && ledger.next < Number.MAX_SAFE_INTEGER) {
      const active = [...ledger.jobs].reverse().find(job => job.identity.operation.kind === "account-removal" && job.permission.kind !== "done" && sameSyncJson(job.identity.operation.record, parsed.raw))
      work.push({ kind: "account-removal", selection: Object.freeze({ kind: "held-job-selection" }), occurrence: active?.identity.occurrence ?? ledger.next, record: parsed.raw, original: parsed.record.consent, recoverability: "exact-removal" })
    } else work.push({ kind: "unsupported", operation: "removal", reason: "invalid" })
  }
  if (!Object.hasOwn(records, pendingAccountRemovalKey) && ledger) for (const job of ledger.jobs) {
    if (job.identity.operation.kind !== "account-removal") continue
    if (job.progress.kind === "terminal" && job.permission.kind !== "done") work.push({ kind: "account-removal", selection: Object.freeze({ kind: "held-job-selection" }), occurrence: job.identity.occurrence, record: job.identity.operation.record, original: job.identity.original, recoverability: "exact-removal" })
    else if (job.permission.kind !== "done") work.push({ kind: "unsupported", operation: "removal", reason: "invalid", inspection: { occurrence: job.identity.occurrence, reason: "marker-missing" } })
  }
  if (Object.hasOwn(records, pendingAccountRemovalKey) && ledger) for (const job of ledger.jobs) {
    if (job.identity.operation.kind === "account-removal" && job.permission.kind !== "done" && !sameSyncJson(job.identity.operation.record, records[pendingAccountRemovalKey] ?? null)) work.push({ kind: "unsupported", operation: "removal", reason: "invalid", inspection: { occurrence: job.identity.occurrence, reason: "marker-different" } })
  }
  work.push(...settingsImportWork(records, ledger))
  const checkpoint = readRetainedCheckpoint(records[interimConversionKey])
  const released = checkpoint.kind === "authority" && checkpoint.checkpoint.handoff.kind === "canonical" && checkpoint.checkpoint.pending.kind === "none"
  const v1 = retainedV1Selection(records, ledger)
  if (v1) work.push(v1)
  const retained = !v1Proposal(ledger) && checkpoint.kind === "agreement" ? retainedSelection(records, ledger) : undefined
  if (retained) work.push(retained)
  const installationAcceptance = installationAcceptanceSelection(records, ledger)
  if (installationAcceptance) work.push(installationAcceptance)
  const installation = !ledger?.retainedInstallation && installationSelection(records, ledger)
  if (installation) work.push(installation)
  const filter = withdrawnFilterSelection(records, ledger)
  if (filter) work.push(filter)
  const playlist = withdrawnPlaylistSelection(records, ledger)
  if (playlist) work.push(playlist)
  if (ledger) for (const job of ledger.jobs) {
    if (job.identity.operation.kind === "retained-agreement" && job.permission.kind !== "done" && (!retained || retained.occurrence !== job.identity.occurrence) && !(v1?.registration.kind === "registered" && v1.registration.occurrence === job.identity.occurrence)) work.push({ kind: "unsupported", operation: "retained", reason: "invalid", inspection: { occurrence: job.identity.occurrence, reason: "checkpoint-different" } })
  }
  if (Object.hasOwn(records, interimConversionKey) && !released && !retained && !v1 && !installation && !installationAcceptance && !filter && !playlist) work.push({ kind: "unsupported", operation: "retained", reason: checkpoint.kind === "newer-version" ? "newer-version" : "unsupported-recovery", inspection: { key: interimConversionKey, raw: records[interimConversionKey] ?? null } })
  if (!released && Object.keys(records).some(isInterimSourceKey) || read.device.upgradeNote?.state === "pending") work.push({ kind: "unsupported", operation: "legacy", reason: "unsupported-recovery", inspection: { names: Object.keys(records).filter(isInterimSourceKey), note: read.raw.upgradeNote ?? null } })
  const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
  if (join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")) work.push({ kind: "unsupported", operation: "join", reason: join.kind === "newer-version" ? "newer-version" : "unsupported-recovery", inspection: { key: pendingSyncJoinKey, raw: records[pendingSyncJoinKey] ?? null } })
  return work
}

type Capture = { readonly origin: UiOrigin; readonly records: JsonObject; readonly revision: number; readonly work: readonly HeldWorkView[]; readonly retained?: RetainedObservation; consumed: boolean }
type ConsentRecoveryDependencies = {
  executeSyncReset?(input: { readonly record: JsonObject; readonly current: JsonObject }): Promise<ReceivedResetResult>
  executeKeySettings?(expected: JsonObject): Promise<LocalSettingsWriteResult>
  executeFeatureSettings?(expected: JsonObject): Promise<LocalSettingsWriteResult>
  executeSettingsImport?(permit: ExactSettingsImportPermit): Promise<SettingsImportResult>
  readonly filterRecovery?: {
    readonly host: RecoveryHost
    readSync(permit: ExactRetainedFilterPermit): Promise<unknown>
    execute(permit: ExactRetainedFilterPermit): Promise<RetainedFilterExecution>
  }
  onFilterUncertainty?(): void
  readonly playlistRecovery?: {
    readonly host: RecoveryHost
    readSync(permit: ExactRetainedPlaylistPermit): Promise<unknown>
    execute(permit: ExactRetainedPlaylistPermit): Promise<RetainedPlaylistExecution>
  }
  onPlaylistUncertainty?(): void
  observe(): Promise<Readonly<Record<string, unknown>>>
  set(items: JsonObject): Promise<void>
  stopped(): boolean
  revision(): number
  observeRetainedAgreement?(): Promise<InterimPersistenceSnapshot | undefined>
  executeRetainedAgreement?(permit: ExactRetainedAgreementPermit): Promise<RetainedAgreementRecoveryExecution>
  executeRetainedV1Acceptance?(permit: ExactRetainedV1AcceptancePermit): Promise<RetainedV1AcceptanceExecution>
  onRetainedV1Uncertainty(): void
  executeRetainedInstallation?(permit: ExactRetainedInstallationPermit): Promise<RetainedInstallationExecution>
  executeRetainedInstallationAcceptance?(permit: ExactRetainedInstallationAcceptancePermit): Promise<RetainedInstallationAcceptanceExecution>
  onRetainedInstallationUncertainty?(): void
  execute(permit: ExactRemovalPermit): Promise<RemovalResult>
}
export function createConsentRecovery(deps: ConsentRecoveryDependencies) {
  const reviews = new WeakMap<WithdrawnWorkReview, Capture>()
  let v1Closed = false
  let installationClosed = false
  function closeInstallation() { installationClosed = true; deps.onRetainedInstallationUncertainty?.() }
  function closeV1() { v1Closed = true; deps.onRetainedV1Uncertainty() }
  const filterRecovery = deps.filterRecovery && createWithdrawnFilterRecovery({ ...deps, ...deps.filterRecovery, uncertainty: () => deps.onFilterUncertainty?.() })
  const playlistRecovery = deps.playlistRecovery && createWithdrawnPlaylistRecovery({ ...deps, ...deps.playlistRecovery, uncertainty: () => deps.onPlaylistUncertainty?.() })
  async function read(origin: UiOrigin): Promise<HeldWorkRead> {
    if (!agreementOrigin(origin)) return { kind: "unavailable", reason: "invalid-origin" }
    if (deps.stopped()) return { kind: "unavailable", reason: "disposed" }
    try {
      const records = await deps.observe()
      if (!consentObject(records)) return { kind: "unavailable", reason: "stale" }
      if (!Object.hasOwn(records, "consent:state") && !Object.hasOwn(records, settingsImportKey) && !Object.hasOwn(records, featureProgressKey) && !Object.hasOwn(records, keySettingsProgressKey) && !Object.hasOwn(records, receivedResetKey)) return { kind: "none" }
      const control = readConsentDevice(records)
      const classified = classifyConsentWork(records)
      const selectedFilter = classified.find(view => view.kind === "retained-filter-replacement")
      const filterReady = selectedFilter?.kind === "retained-filter-replacement" && await filterRecovery?.review(selectedFilter, records)
      const selectedPlaylist = classified.find(view => view.kind === "retained-playlist-restore")
      const playlistReady = selectedPlaylist?.kind === "retained-playlist-restore" && await playlistRecovery?.review(selectedPlaylist, records)
      let retained: RetainedObservation | undefined
      if (classified.some(view => view.kind === "retained-agreement" || view.kind === "retained-v1-acceptance" || view.kind === "retained-installation" || view.kind === "retained-installation-acceptance")) {
        try { retained = await observeRetained(deps) } catch { retained = undefined }
      }
      if (retained && !sameSyncJson(records, retained.records)) return { kind: "unavailable", reason: "stale" }
      const work = freezeConsentValue(classified.map(view => {
        if (view.kind === "retained-filter-replacement" && !filterReady) return { kind: "unsupported" as const, operation: "retained" as const, reason: "unsupported-recovery" as const, inspection: view.identity.operation.record }
        if (view.kind === "retained-playlist-restore" && !playlistReady) return { kind: "unsupported" as const, operation: "retained" as const, reason: "unsupported-recovery" as const, inspection: view.identity.operation.record }
        if (view.kind === "retained-installation-acceptance" && (installationClosed || !retained || !installationAcceptanceSnapshotMatches(view, retained) || !deps.executeRetainedInstallation || !deps.executeRetainedInstallationAcceptance)) return { kind: "unsupported" as const, operation: "retained" as const, reason: "unsupported-recovery" as const, inspection: view.descriptor.accepted }
        if (view.kind === "retained-installation" && (installationClosed || !retained || !installationSnapshotMatches(view, retained) || !deps.executeRetainedInstallation)) return { kind: "unsupported" as const, operation: "retained" as const, reason: "unsupported-recovery" as const, inspection: view.identity.operation.record }
        if (view.kind === "retained-v1-acceptance" && (v1Closed || !retained || !v1SnapshotMatches(view, retained.snapshot) || !deps.executeRetainedAgreement || !deps.executeRetainedV1Acceptance)) return { kind: "unsupported" as const, operation: "retained" as const, reason: "unsupported-recovery" as const, inspection: view.proposal }
        return view.kind === "retained-agreement" && (!retained || !retainedHistoryMatches(view.record, retained.snapshot) || !deps.executeRetainedAgreement) ? { kind: "unsupported" as const, operation: "retained" as const, reason: "unsupported-recovery" as const, inspection: view.record } : view
      }))
      if (deps.stopped()) return { kind: "unavailable", reason: "disposed" }
      const review: WithdrawnWorkReview = Object.freeze({ kind: "withdrawn-work-review" })
      reviews.set(review, { origin: freezeAgreement(origin), records: freezeConsentValue(records), revision: deps.revision(), work, retained, consumed: false })
      return { kind: "held", review, work, consent: control.kind === "supported" ? control.device.consent : null }
    } catch { return { kind: "unavailable", reason: "stale" } }
  }
  async function recover(origin: UiOrigin, input: { readonly review: WithdrawnWorkReview; readonly job: HeldJobSelection }): Promise<ExactRecoveryResult> {
    if (!input || typeof input !== "object" || Array.isArray(input) || Reflect.ownKeys(input).length !== 2 || !["review", "job"].every(key => "value" in (Object.getOwnPropertyDescriptor(input, key) ?? {}))) {
      const descriptor = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "review") : undefined
      const attempted = descriptor && "value" in descriptor ? reviews.get(descriptor.value) : undefined
      if (attempted?.work.some(view => view.kind === "retained-agreement" || view.kind === "retained-v1-acceptance" || view.kind === "retained-installation" || view.kind === "retained-installation-acceptance" || view.kind === "retained-filter-replacement" || view.kind === "retained-playlist-restore")) attempted.consumed = true
      return { kind: "refused", reason: "invalid-input" }
    }
    const capture = input && reviews.get(input.review)
    if (!capture || capture.consumed) return { kind: "unavailable", reason: "stale" }
    capture.consumed = true
    if (!agreementOrigin(origin)) return { kind: "refused", reason: "invalid-origin" }

    if (deps.stopped()) return { kind: "unavailable", reason: "disposed" }
    const selected = capture.work.find(view => view.kind !== "unsupported" && view.selection === input.job)
    if (selected?.kind === "sync-reset") {
      if (!sameSyncJson(capture.origin, origin)) return { kind: "unavailable", reason: "stale" }
      if (!deps.executeSyncReset) return { kind: "unavailable", reason: "unsupported-recovery" }
      const current = await deps.observe()
      if (!consentObject(current) || !sameSyncJson(current, capture.records) || !sameSyncJson(current[receivedResetKey] ?? null, selected.record)) return { kind: "unavailable", reason: "stale" }
      const result = await deps.executeSyncReset({ record: selected.record, current })
      if (result.kind !== "reset-received") return { kind: "sync-reset-held", result }
      const after = await deps.observe()
      return { kind: "recovered", job: { kind: "sync-reset", id: result.metadata.id }, completion: { operation: "sync-reset", result },
        remaining: consentObject(after) ? freezeConsentValue(classifyConsentWork(after)) : [] }
    }
    if (selected?.kind === "key-settings") {
      if (!deps.executeKeySettings) return { kind: "unavailable", reason: "unsupported-recovery" }
      const records = await deps.observe()
      if (!consentObject(records) || !sameSyncJson(origin, capture.origin) || capture.revision !== deps.revision() || !sameSyncJson(records, capture.records)) return { kind: "unavailable", reason: "stale" }
      const consent = readConsentDevice(records)
      if (consent.kind !== "supported" || !consent.device.consent || consent.control && consent.control.state.kind !== "agreed") return { kind: "refused", reason: "not-agreed" }
      const result = await deps.executeKeySettings(records)
      const after = await deps.observe()
      const marker = consentObject(after) && readKeySettingsProgress(after[keySettingsProgressKey])
      return result.kind === "committed" && consentObject(after) && marker && marker.kind === "valid" && marker.record.state === "terminal" && marker.record.id === selected.id
        ? { kind: "key-settings-recovered", original: selected.original, remaining: freezeConsentValue(classifyConsentWork(after)) }
        : { kind: "key-settings-pending", original: selected.original, result }
    }
    if (selected?.kind === "feature-settings") {
      if (!deps.executeFeatureSettings) return { kind: "unavailable", reason: "unsupported-recovery" }
      const records = await deps.observe()
      if (!consentObject(records) || !sameSyncJson(origin, capture.origin) || capture.revision !== deps.revision() || !sameSyncJson(records, capture.records)) return { kind: "unavailable", reason: "stale" }
      const consent = readConsentDevice(records)
      if (consent.kind !== "supported" || !consent.device.consent || consent.control && consent.control.state.kind !== "agreed") return { kind: "refused", reason: "not-agreed" }
      const result = await deps.executeFeatureSettings(records)
      const after = await deps.observe()
      const marker = consentObject(after) && readFeatureProgress(after[featureProgressKey])
      return result.kind === "committed" && consentObject(after) && marker && marker.kind === "valid" && marker.record.state === "terminal" && marker.record.id === selected.id
        ? { kind: "feature-settings-recovered", original: selected.original, remaining: freezeConsentValue(classifyConsentWork(after)) }
        : { kind: "feature-settings-pending", original: selected.original, result }
    }
    if (selected?.kind === "settings-import") return recoverSettingsImport(deps, origin, capture, selected)
    if (selected?.kind === "retained-filter-replacement") {
      if (origin.incognito) return { kind: "refused", reason: "private" }
      if (!filterRecovery) return { kind: "unavailable", reason: "unsupported-recovery" }
      const result = await filterRecovery.recover(origin, capture, selected)
      if (result.execution.kind === "confirmed" && result.completionCheck.kind === "complete" && result.records) return { kind: "recovered", job: selected.identity, completion: { operation: "retained-filter-replacement", result: result.execution }, remaining: freezeConsentValue(classifyConsentWork(result.records)) }
      return { kind: "authorized-pending", job: selected.identity, reason: "executor", observation: result.execution, completionCheck: result.completionCheck.kind === "complete" ? { kind: "different" } : result.completionCheck }
    }
    if (selected?.kind === "retained-playlist-restore") {
      if (origin.incognito) return { kind: "refused", reason: "private" }
      if (!playlistRecovery) return { kind: "unavailable", reason: "unsupported-recovery" }
      const result = await playlistRecovery.recover(origin, capture, selected)
      if (result.execution.kind === "confirmed" && result.completionCheck.kind === "complete" && result.records) return { kind: "recovered", job: selected.identity, completion: { operation: "retained-playlist-restore", result: result.execution }, remaining: freezeConsentValue(classifyConsentWork(result.records)) }
      return { kind: "authorized-pending", job: selected.identity, reason: "executor", observation: result.execution, completionCheck: result.completionCheck.kind === "complete" ? { kind: "different" } : result.completionCheck }
    }
    if (selected?.kind === "retained-installation-acceptance") {
      if (origin.incognito) return { kind: "refused", reason: "private" }
      return installationClosed ? { kind: "unavailable", reason: "stale" } : recoverInstallationAcceptance(deps, origin, capture, selected, closeInstallation)
    }
    if (selected?.kind === "retained-installation") {
      if (origin.incognito) return { kind: "refused", reason: "private" }
      return installationClosed ? { kind: "unavailable", reason: "stale" } : recoverInstallation(deps, origin, capture, selected, closeInstallation)
    }
    if (selected?.kind === "retained-v1-acceptance") return v1Closed ? { kind: "unavailable", reason: "stale" } : recoverRetainedV1(deps, origin, capture, selected, closeV1)
    if (selected?.kind === "retained-agreement") return recoverRetained(deps, origin, capture, selected)
    if (origin.incognito) return { kind: "refused", reason: "private" }
    if (!selected || selected.kind !== "account-removal") return { kind: "unavailable", reason: "unsupported-recovery" }
    let stage: "prepare" | "authorize" = "prepare"
    try {
      const initialRecords = await deps.observe()
      let records: JsonObject
      if (!consentObject(initialRecords)) return { kind: "unavailable", reason: "stale" }
      records = initialRecords
      if (!consentObject(records) || !sameSyncJson(origin, capture.origin) || capture.revision !== deps.revision() || !sameSyncJson(records, capture.records)) return { kind: "unavailable", reason: "stale" }
      const read = readConsentDevice(records)
      if (read.kind !== "supported" || !read.control) return { kind: "unavailable", reason: "newer-layout" }
      if (read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
      const ledger = jobsFor(records, read.device.id)
      if (!ledger || ledger.next >= Number.MAX_SAFE_INTEGER) return { kind: "unavailable", reason: "stale" }
      const existing = ledger.jobs.find(job => job.identity.operation.kind === "account-removal" && job.identity.occurrence === selected.occurrence && job.permission.kind !== "done" && sameSyncJson(job.identity.operation.record, selected.record))
      const identity: RemovalJobIdentity = existing?.identity.operation.kind === "account-removal" ? { ...existing.identity, operation: existing.identity.operation } : { deviceId: read.device.id, occurrence: ledger.next, operation: { kind: "account-removal", record: selected.record }, original: selected.original }
      let entry: ConsentRemovalJob = { identity, progress: existing?.progress ?? { kind: "accepted" }, permission: { kind: "prepared", generation: read.control.generation, current: read.device.consent } }
      const terminal = existing?.permission.kind === "retiring" && existing.permission.generation === read.control.generation && sameSyncJson(existing.permission.current, read.device.consent)
      if (terminal) entry = { ...existing, identity }
      let currentLedger = existing ? replace(ledger, entry) : { ...ledger, next: ledger.next + 1, jobs: [...ledger.jobs, entry] }
      for (const permission of terminal ? [] : ["prepared", "armed"] as const) {
        stage = permission === "prepared" ? "prepare" : "authorize"
        entry = { ...entry, permission: { kind: permission, generation: read.control.generation, current: read.device.consent } }
        currentLedger = replace(currentLedger, entry)
        const items = { [consentJobsKey]: currentLedger }, expected: JsonObject = { ...records, ...items }
        if (deps.stopped()) return { kind: "unavailable", reason: "disposed" }
        let write: AgreementWrite = { kind: "resolved" }
        try { await deps.set(items) } catch (error) { write = { kind: "rejected", error } }
        let observed
        try { observed = await deps.observe() } catch { return { kind: "unconfirmed", stage, write, cause: "read-failed" } }
        if (deps.stopped()) return { kind: "unconfirmed", stage, write, cause: "stopped" }
        if (!consentObject(observed) || !sameSyncJson(expected, observed)) {
          if (write.kind === "rejected" && consentObject(observed) && sameSyncJson(records, observed)) return { kind: "failed", stage, error: write.error }
          return { kind: "unconfirmed", stage, write, cause: "different" }
        }
        records = observed
      }
      const permit: ExactRemovalPermit = Object.freeze({ [exactRemoval]: true })
      permits.set(permit, { job: entry, generation: read.control.generation, current: read.device.consent, device: read.raw })
      let result: RemovalResult
      try { result = await deps.execute(permit) } finally { permits.delete(permit) }
      const after = await deps.observe()
      if (result.kind === "committed" && consentObject(after) && !Object.hasOwn(after, pendingAccountRemovalKey) &&
        parseConsentJobs(after[consentJobsKey])?.jobs.some(job => job.identity.occurrence === identity.occurrence && job.permission.kind === "done")) {
        return { kind: "recovered", job: freezeConsentValue(identity), completion: { operation: "account-removal", result }, remaining: freezeConsentValue(classifyConsentWork(after)) }
      }
      return { kind: "authorized-pending", job: freezeConsentValue(identity), reason: "executor", observation: result }
    } catch (error) { return { kind: "failed", stage, error } }
  }
  return { read, recover }
}

type RetainedObservation = { readonly records: JsonObject; readonly snapshot: InterimPersistenceSnapshot; readonly revision: number }
type RetainedObservers = {
  observe(): Promise<Readonly<Record<string, unknown>>>
  observeRetainedAgreement?(): Promise<InterimPersistenceSnapshot | undefined>
  revision(): number
  stopped(): boolean
}
export function sameConsentValue(left: unknown, right: unknown): boolean {
  if (!isJsonValue(left) || !isJsonValue(right)) return false
  const pending: [JsonValue, JsonValue][] = [[left, right]]
  while (pending.length) {
    const pair = pending.pop()
    if (!pair) break
    const [a, b] = pair
    if (a === b) continue
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
    const entries: [string, JsonValue][] = Object.entries(a), other = new Map<string, JsonValue>(Object.entries(b))
    if (entries.length !== other.size) return false
    for (const [key, value] of entries) {
      const counterpart = other.get(key)
      if (counterpart === undefined) return false
      pending.push([value, counterpart])
    }
  }
  return true
}
const sameValue = sameConsentValue
async function observeRetained(deps: RetainedObservers): Promise<RetainedObservation | undefined> {
  if (!deps.observeRetainedAgreement) return
  const first = await deps.observe(), source = await deps.observeRetainedAgreement(), revision = deps.revision(), second = await deps.observe()
  if (!consentObject(first) || !consentObject(second) || !source || !consentObject(source) || revision !== deps.revision() || !sameSyncJson(first, second)) return
  if (!sameValue(source.source, Object.fromEntries(Object.entries(second).filter(([key]) => isInterimSourceKey(key)))) ||
    !sameValue(source.canonical, Object.fromEntries(Object.entries(second).filter(([key]) => isInterimCanonicalKey(key)))) ||
    !sameValue(source.checkpoint, Object.hasOwn(second, interimConversionKey) ? { kind: "present", value: second[interimConversionKey] } : { kind: "absent" })) return
  return { records: freezeConsentValue(second), snapshot: freezeConsentValue(source), revision }
}
function isRetainedLedger(raw: unknown): raw is ConsentJobs & JsonObject { return parseConsentJobs(raw) !== undefined }
function retainedLedgerFor(records: JsonObject, deviceId: string): ConsentJobs | undefined {
  if (!Object.hasOwn(records, consentJobsKey)) return { v: 1, kind: "consent-jobs", deviceId, next: 0, jobs: [] }
  const raw = records[consentJobsKey]
  return isRetainedLedger(raw) && raw.deviceId === deviceId ? raw : undefined
}
function replaceRetained(ledger: ConsentJobs, entry: ConsentRetainedAgreementJob): ConsentJobs {
  const index = ledger.jobs.findIndex(job => job.identity.occurrence === entry.identity.occurrence)
  return index < 0 ? { ...ledger, next: ledger.next + 1, jobs: [...ledger.jobs, entry] } : { ...ledger, jobs: ledger.jobs.map((job, position) => position === index ? entry : job) }
}
function v1Proposal(ledger: ConsentJobs | undefined): ConsentRetainedV1Proposal | undefined { return ledger && "retainedV1" in ledger ? ledger.retainedV1 : undefined }
function v1SnapshotMatches(view: RetainedV1AcceptanceView, snapshot: InterimPersistenceSnapshot): boolean {
  const retained = readRetainedInterim(view.proposal.retained), accepted = readRetainedCheckpoint(view.proposal.accepted)
  return retained.kind === "valid" && accepted.kind === "agreement" && accepted.checkpoint.agreement.kind === "accepted" &&
    recoveredRetainedV1AgreementDifference(retained.checkpoint, { ...accepted.checkpoint, agreement: accepted.checkpoint.agreement }, snapshot, view.current, view.checkpoint) === undefined
}
function retainedV1Selection(records: JsonObject, ledger: ConsentJobs | undefined): RetainedV1AcceptanceView | undefined {
  const read = readConsentDevice(records), raw = records[interimConversionKey], checkpoint = readRetainedCheckpoint(raw)
  if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || read.control.generation >= Number.MAX_SAFE_INTEGER || read.control.lastAgreementAt >= Number.MAX_SAFE_INTEGER || !ledger || ledger.next >= Number.MAX_SAFE_INTEGER) return
  const saved = v1Proposal(ledger)
  let proposal: RetainedV1Descriptor, registration: ConsentRetainedV1Proposal["registration"], stage: RetainedV1AcceptanceView["checkpoint"]
  if (checkpoint.kind === "valid" && isV1(raw)) {
    if (saved && !sameValue(saved.descriptor.retained, raw)) return
    if (saved?.registration.kind === "registered") {
      const job = ledger.jobs.find(job => sameValue(job.identity, v1ReceiptIdentity(saved.descriptor, saved.registration.kind === "registered" ? saved.registration.occurrence : -1)))
      if (!job || job.progress.kind !== "accepted" || job.permission.kind === "done") return
      proposal = saved.descriptor; registration = saved.registration
    } else {
      if (ledger.jobs.some(job => job.identity.operation.kind === "retained-agreement" && sameValue(job.identity.operation.record.retained, raw))) return
      const device = retainedAgreementDevice(checkpoint.checkpoint, read.control.state.current)
      if (!device) return
      const accepted = { v: 2, kind: "retained-interim", retained: raw, agreement: { kind: "accepted", effect: { consent: read.control.state.current, device } } }
      if (!isAcceptedV2(accepted)) return
      proposal = { kind: "retained-v1-acceptance", deviceId: read.device.id, retained: raw, accepted, proposedUnder: { generation: read.control.generation, current: read.control.state.current } }
      registration = { kind: "unregistered", expectedNext: ledger.next }
    }
    stage = "v1"
  } else if (checkpoint.kind === "agreement" && saved) {
    proposal = saved.descriptor; registration = saved.registration; stage = checkpoint.checkpoint.agreement.kind
    if (!sameValue(raw, stage === "accepted" ? proposal.accepted : confirmedRecord(proposal.accepted))) return
    if (registration.kind === "unregistered") {
      if (stage !== "accepted" || registration.expectedNext !== ledger.next || ledger.jobs.some(job => sameValue(job.identity.operation.record, proposal.accepted))) return
    } else {
      const job = ledger.jobs.find(job => sameValue(job.identity, v1ReceiptIdentity(proposal, saved.registration.kind === "registered" ? saved.registration.occurrence : -1)))
      if (!job || job.permission.kind === "done" || stage === "confirmed" && job.progress.kind !== "terminal") return
    }
  } else return
  const original = readRetainedInterim(proposal.retained)
  if (original.kind !== "valid") return
  const projected = retainedAgreementDevice(original.checkpoint, read.control.state.current)
  if (!projected || !Object.hasOwn(proposal.retained.canonical, "device") || !sameValue(projected, read.raw) ||
    !sameValue(proposal.retained.source, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key)))) ||
    !sameValue({ ...proposal.retained.canonical, device: projected }, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key))))) return
  return { kind: "retained-v1-acceptance", selection: Object.freeze({ kind: "held-job-selection" }), proposal, registration, current: read.control.state.current, checkpoint: stage,
    stages: ["prepare", "authorize", ...(stage === "v1" || registration.kind === "unregistered" ? ["accept" as const] : []), "retire", ...(stage === "confirmed" ? [] : ["record" as const]), "done"], recoverability: "exact-retained-v1-acceptance" }
}
function retainedSelection(records: JsonObject, ledger: ConsentJobs | undefined): Extract<HeldWorkView, { kind: "retained-agreement" }> | undefined {
  const read = readConsentDevice(records), checkpoint = readRetainedCheckpoint(records[interimConversionKey])
  if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || read.control.generation >= Number.MAX_SAFE_INTEGER || read.control.lastAgreementAt >= Number.MAX_SAFE_INTEGER || !ledger || ledger.next >= Number.MAX_SAFE_INTEGER || checkpoint.kind !== "agreement") return
  const active = [...ledger.jobs].reverse().find(job => job.identity.operation.kind === "retained-agreement" && job.permission.kind !== "done" &&
    (sameSyncJson(job.identity.operation.record, records[interimConversionKey] ?? null) || job.progress.kind === "terminal" && sameValue(confirmedRecord(job.identity.operation.record), records[interimConversionKey])))
  if (checkpoint.checkpoint.agreement.kind === "confirmed" && !active) return
  if (!active && (ledger.next >= Number.MAX_SAFE_INTEGER || ledger.jobs.some(job => job.identity.operation.kind === "retained-agreement" && sameValue(job.identity.operation.record, records[interimConversionKey])))) return
  const record = active?.identity.operation.record ?? records[interimConversionKey]
  if (!consentObject(record)) return
  const accepted = readRetainedCheckpoint(record)
  if (accepted.kind !== "agreement" || accepted.checkpoint.agreement.kind !== "accepted" || !sameValue(Object.getOwnPropertyDescriptor(accepted.checkpoint.agreement.effect.device, "id")?.value, read.device.id)) return
  const original = accepted.checkpoint.retained
  const effectDevice: unknown = accepted.checkpoint.agreement.effect.device, canonical: unknown = original.canonical
  if (!consentObject(effectDevice) || !consentObject(canonical)) return
  if (!sameValue(read.raw, { ...effectDevice, consent: read.control.state.current }) ||
    !sameValue(original.source, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key)))) ||
    !sameValue({ ...canonical, device: read.raw }, Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key))))) return
  return { kind: "retained-agreement", selection: Object.freeze({ kind: "held-job-selection" }), occurrence: active?.identity.occurrence ?? ledger.next,
    record, original: accepted.checkpoint.agreement.effect.consent, current: { ...read.control.state.current }, stages: checkpoint.checkpoint.agreement.kind === "confirmed" ? ["retire", "done"] : ["retire", "record", "done"], recoverability: "exact-retained-agreement" }
}
function isConfirmedRecord(raw: JsonObject): raw is JsonObject & ConfirmedRetainedAgreementV2 {
  const parsed = readRetainedCheckpoint(raw)
  return parsed.kind === "agreement" && parsed.checkpoint.agreement.kind === "confirmed"
}
function confirmedRecord(record: JsonObject): (ConfirmedRetainedAgreementV2 & JsonObject) | undefined {
  const parsed = readRetainedCheckpoint(record), agreement = record.agreement
  if (parsed.kind !== "agreement" || parsed.checkpoint.agreement.kind !== "accepted" || !consentObject(agreement)) return
  const confirmed = { ...record, agreement: { ...agreement, kind: "confirmed" } }
  return isConfirmedRecord(confirmed) ? confirmed : undefined
}
function retainedHistoryMatches(record: JsonObject, current: InterimPersistenceSnapshot): boolean {
  const parsed = readRetainedCheckpoint(record)
  return parsed.kind === "agreement" && sameValue(parsed.checkpoint.retained.historicalAuthorization, current.historicalAuthorization) && sameValue(parsed.checkpoint.retained.priorCredentialPresence, current.priorCredentialPresence)
}
const exactRetainedAgreement = Symbol("exact-retained-agreement")
export type ExactRetainedAgreementPermit = { readonly [exactRetainedAgreement]: true }
type RetainedBinding = {
  readonly identity: RetainedAgreementJobIdentity; readonly current: Agreement; readonly generation: number; readonly device: JsonObject
  readonly deps: RetainedObservers
  observation: RetainedObservation
}
const retainedPermits = new WeakMap<ExactRetainedAgreementPermit, RetainedBinding>()
function permittedRetained(binding: RetainedBinding, observation: RetainedObservation): ConsentRetainedAgreementJob | undefined {
  const read = readConsentDevice(observation.records), ledger = parseConsentJobs(observation.records[consentJobsKey])
  if (binding.deps.stopped() || read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || read.control.generation !== binding.generation ||
    !sameValue(read.control.state.current, binding.current) || !sameValue(read.raw, binding.device)) return
  const job = ledger?.jobs.find(job => sameValue(job.identity, binding.identity))
  if (!job || job.identity.operation.kind !== "retained-agreement" || job.permission.kind !== "armed" && job.permission.kind !== "retiring" && job.permission.kind !== "done" ||
    job.permission.kind !== "done" && (job.permission.generation !== binding.generation || !sameValue(job.permission.current, binding.current))) return
  const checkpoint = readRetainedCheckpoint(binding.identity.operation.record)
  if (checkpoint.kind !== "agreement" || recoveredRetainedAgreementDifference(checkpoint.checkpoint, observation.snapshot, binding.current, job.progress.kind)) return
  if (job.progress.kind === "accepted" && job.permission.kind === "armed") return { ...job, identity: binding.identity, progress: { kind: "accepted" }, permission: job.permission }
  if (job.progress.kind === "terminal") return { ...job, identity: binding.identity, progress: { kind: "terminal" }, permission: job.permission }
}
export type RetainedAgreementRecoveryPorts = {
  setLedger(ledger: ConsentJobs): Promise<void>
  setConfirmed(record: ConfirmedRetainedAgreementV2): Promise<void>
}
export async function executeExactRetainedAgreement(permit: ExactRetainedAgreementPermit, ports: RetainedAgreementRecoveryPorts): Promise<RetainedAgreementRecoveryExecution> {
  const binding = retainedPermits.get(permit)
  retainedPermits.delete(permit)
  if (!binding) return { kind: "unavailable", reason: "stale" }
  const mutations: { stage: RetainedAgreementRecoveryStage; write: AgreementWrite }[] = []
  for (const stage of ["retire", "record", "done"] as const) {
    if (binding.deps.stopped()) return { kind: "unavailable", reason: "disposed" }
    let before: RetainedObservation | undefined
    try { before = await observeRetained(binding.deps) } catch { return { kind: "unavailable", reason: "stale" } }
    if (!before || before.revision !== binding.observation.revision || !sameValue(before.records, binding.observation.records) || !sameValue(before.snapshot, binding.observation.snapshot)) return { kind: "unavailable", reason: "stale" }
    const job = permittedRetained(binding, before), ledger = retainedLedgerFor(before.records, binding.identity.deviceId), confirmed = confirmedRecord(binding.identity.operation.record)
    if (!job || !ledger || !confirmed) return { kind: "unavailable", reason: "consent-held" }
    if (stage === "record" && sameValue(before.records[interimConversionKey], confirmed)) continue
    if (stage !== "retire" && (job.progress.kind !== "terminal" || job.permission.kind !== "retiring")) return { kind: "unavailable", reason: "stale" }
    if (stage === "done" && !sameValue(before.records[interimConversionKey], confirmed)) return { kind: "unavailable", reason: "stale" }
    const next: ConsentRetainedAgreementJob = { identity: binding.identity, progress: { kind: "terminal" }, permission: stage === "done" ? { kind: "done" } : { kind: "retiring", generation: binding.generation, current: binding.current } }
    const nextLedger = replaceRetained(ledger, next)
    const expected: JsonObject = { ...before.records, ...(stage === "record" ? { [interimConversionKey]: confirmed } : { [consentJobsKey]: nextLedger }) }
    if (binding.deps.stopped() || before.revision !== binding.deps.revision()) return { kind: "unavailable", reason: "disposed" }
    let write: AgreementWrite = { kind: "resolved" }
    try { if (stage === "record") await ports.setConfirmed(confirmed); else await ports.setLedger(nextLedger) } catch (error) { write = { kind: "rejected", error } }
    let after: RetainedObservation | undefined
    try { after = await observeRetained(binding.deps) } catch (error) { return { kind: "unconfirmed", stage, write, cause: "read-failed", error } }
    if (binding.deps.stopped()) return { kind: "unconfirmed", stage, write, cause: "stopped" }
    if (!after || !sameSyncJson(expected, after.records) || !retainedHistoryMatches(binding.identity.operation.record, after.snapshot) || !permittedRetained(binding, after)) {
      if (write.kind === "rejected" && after && sameSyncJson(before.records, after.records) && sameValue(before.snapshot, after.snapshot)) return { kind: "failed", stage, write }
      return { kind: "unconfirmed", stage, write, cause: "different" }
    }
    binding.observation = after
    mutations.push({ stage, write })
  }
  return { kind: "confirmed", original: binding.identity.original, current: binding.current, activation: "held", mutations }
}
async function recoverRetained(deps: RetainedObservers & { set(items: JsonObject): Promise<void>; executeRetainedAgreement?(permit: ExactRetainedAgreementPermit): Promise<RetainedAgreementRecoveryExecution> }, origin: UiOrigin, capture: Capture,
  selected: Extract<HeldWorkView, { kind: "retained-agreement" }>): Promise<ExactRecoveryResult> {
  let stage: "prepare" | "authorize" = "prepare", prefix: PermissionPrefix = []
  let identity: RetainedAgreementJobIdentity = { deviceId: "", occurrence: selected.occurrence, operation: { kind: "retained-agreement", record: selected.record }, original: selected.original }
  try {
    if (!deps.executeRetainedAgreement || !capture.retained || !sameValue(origin, capture.origin) || deps.revision() !== capture.revision) return { kind: "unavailable", reason: "stale" }
    let observation = await observeRetained(deps)
    if (!observation || deps.stopped() || observation.revision !== capture.revision || !sameValue(observation.records, capture.records) || !sameValue(observation.snapshot, capture.retained.snapshot) || !retainedHistoryMatches(selected.record, observation.snapshot)) return { kind: "unavailable", reason: "stale" }
    const read = readConsentDevice(observation.records)
    if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
    let ledger = retainedLedgerFor(observation.records, read.device.id)
    const again = retainedSelection(observation.records, ledger)
    if (!ledger || !again || again.occurrence !== selected.occurrence || !sameValue(again.record, selected.record)) return { kind: "unavailable", reason: "stale" }
    const existing = ledger.jobs.find(job => job.identity.operation.kind === "retained-agreement" && job.identity.occurrence === selected.occurrence)
    identity = { deviceId: read.device.id, occurrence: selected.occurrence, operation: { kind: "retained-agreement", record: selected.record }, original: selected.original }
    for (const permission of ["prepared", "armed"] as const) {
      stage = permission === "prepared" ? "prepare" : "authorize"
      const entry: ConsentRetainedAgreementJob = existing?.progress.kind === "terminal" ? { identity, progress: { kind: "terminal" }, permission: { kind: permission, generation: read.control.generation, current: read.device.consent } } : { identity, progress: { kind: "accepted" }, permission: { kind: permission, generation: read.control.generation, current: read.device.consent } }
      const next = replaceRetained(ledger, entry), expected: JsonObject = { ...observation.records, [consentJobsKey]: next }
      const before = await observeRetained(deps)
      if (!before || deps.stopped() || before.revision !== observation.revision || !sameValue(before.records, observation.records) || !sameValue(before.snapshot, observation.snapshot)) {
        if (prefix.length) return { kind: "failed", stage, job: identity, confirmedPermissionWrites: prefix, error: new Error("Retained authorization preflight is stale") }
        return { kind: "unavailable", reason: "stale" }
      }
      let write: AgreementWrite = { kind: "resolved" }
      try { await deps.set({ [consentJobsKey]: next }) } catch (error) { write = { kind: "rejected", error } }
      let after: RetainedObservation | undefined
      try { after = await observeRetained(deps) } catch (error) { return { kind: "unconfirmed", stage, job: identity, confirmedPermissionWrites: prefix, write, cause: "read-failed", error } }
      if (deps.stopped()) return { kind: "unconfirmed", stage, job: identity, confirmedPermissionWrites: prefix, write, cause: "stopped" }
      if (!after || !sameValue(expected, after.records) || !sameValue(observation.snapshot, after.snapshot)) {
        if (write.kind === "rejected" && after && sameValue(observation.records, after.records) && sameValue(observation.snapshot, after.snapshot)) return { kind: "failed", stage, job: identity, confirmedPermissionWrites: prefix, error: write.error, write }
        return { kind: "unconfirmed", stage, job: identity, confirmedPermissionWrites: prefix, write, cause: "different" }
      }
      if (stage === "prepare") prefix = [{ stage: "prepare", write }]
      else if (prefix.length === 1) prefix = [prefix[0], { stage: "authorize", write }]
      observation = after; ledger = next
    }
    if (prefix.length !== 2) return { kind: "unavailable", reason: "stale" }
    const permissionWrites = prefix, permit: ExactRetainedAgreementPermit = Object.freeze({ [exactRetainedAgreement]: true })
    const binding: RetainedBinding = { identity, generation: read.control.generation, current: read.device.consent, device: read.raw, observation, deps }
    retainedPermits.set(permit, binding)
    let result: RetainedAgreementRecoveryExecution
    try { result = await deps.executeRetainedAgreement(permit) } finally { retainedPermits.delete(permit) }
    let after: RetainedObservation | undefined
    try { after = await observeRetained(deps) } catch (error) { return { kind: "authorized-pending", job: identity, reason: "executor", observation: result, permissionWrites, completionCheck: { kind: "read-failed", error } } }
    const pending = (kind: "not-complete" | "different" | "stopped"): ExactRecoveryResult => ({ kind: "authorized-pending", job: identity, reason: "executor", observation: result, permissionWrites, completionCheck: { kind } })
    if (deps.stopped()) return pending("stopped")
    if (!after || after.revision !== binding.observation.revision || !sameValue(after.records, binding.observation.records) || !sameValue(after.snapshot, binding.observation.snapshot)) return pending("different")
    const completed = parseConsentJobs(after.records[consentJobsKey])?.jobs.find(job => sameValue(job.identity, identity))
    if (result.kind !== "confirmed" || completed?.permission.kind !== "done" || completed.progress.kind !== "terminal" || !sameValue(after.records[interimConversionKey], confirmedRecord(selected.record))) return pending("not-complete")
    return { kind: "recovered", job: freezeConsentValue(identity), completion: { operation: "retained-agreement", result }, permissionWrites, remaining: freezeConsentValue(classifyConsentWork(after.records)) }
  } catch (error) { return { kind: "failed", stage, job: identity, confirmedPermissionWrites: prefix, error } }
}

const exactRetainedV1Acceptance = Symbol("exact-retained-v1-acceptance")
export type ExactRetainedV1AcceptancePermit = { readonly [exactRetainedV1Acceptance]: true }
export type RetainedV1AcceptanceBatch = { readonly interimConversion: AcceptedRetainedAgreementV2; readonly "consent:jobs": ConsentJobs }
export type RetainedV1AcceptancePorts = { setAccepted(batch: RetainedV1AcceptanceBatch): Promise<void> }
export type RetainedV1AcceptanceExecution =
  | { readonly kind: "accepted"; readonly identity: RetainedAgreementJobIdentity; readonly write: AgreementWrite }
  | { readonly kind: "unavailable"; readonly reason: "stale" | "disposed" | "consent-held" }
  | { readonly kind: "failed"; readonly stage: "accept"; readonly write: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: "accept"; readonly write: AgreementWrite; readonly cause: "different" | "read-failed" | "stopped"; readonly error?: unknown }
type V1Binding = {
  readonly view: RetainedV1AcceptanceView; readonly generation: number; readonly current: Agreement; readonly device: JsonObject
  readonly deps: RetainedObservers; readonly attempt: { live: boolean }; readonly batch: RetainedV1AcceptanceBatch
  readonly identity: RetainedAgreementJobIdentity
  observation: RetainedObservation
}
const v1Permits = new WeakMap<ExactRetainedV1AcceptancePermit, V1Binding>()
async function v1Preflight(deps: RetainedObservers, baseline: RetainedObservation): Promise<RetainedObservation | undefined> {
  const revision = deps.revision()
  if (deps.stopped() || revision !== baseline.revision) return
  const observed = await observeRetained(deps)
  return observed && !deps.stopped() && observed.revision === revision && deps.revision() === revision && sameValue(observed.records, baseline.records) && sameValue(observed.snapshot, baseline.snapshot) ? observed : undefined
}
function v1Authority(binding: Pick<V1Binding, "current" | "generation" | "device">, observation: RetainedObservation): boolean {
  const read = readConsentDevice(observation.records)
  return read.kind === "supported" && read.control?.state.kind === "agreed" && read.control.generation === binding.generation &&
    sameValue(read.control.state.current, binding.current) && sameValue(read.raw, binding.device)
}
export async function executeExactRetainedV1Acceptance(permit: ExactRetainedV1AcceptancePermit, ports: RetainedV1AcceptancePorts): Promise<RetainedV1AcceptanceExecution> {
  const binding = v1Permits.get(permit)
  v1Permits.delete(permit)
  if (!binding || !binding.attempt.live) return { kind: "unavailable", reason: "stale" }
  try {
    const before = await v1Preflight(binding.deps, binding.observation)
    if (!before) return { kind: "unavailable", reason: binding.deps.stopped() ? "disposed" : "stale" }
    const ledger = retainedLedgerFor(before.records, binding.identity.deviceId), selected = retainedV1Selection(before.records, ledger)
    if (!v1Authority(binding, before) || !selected || !sameValue(selected.proposal, binding.view.proposal) || !sameValue(selected.registration, binding.view.registration) || !v1SnapshotMatches(selected, before.snapshot)) return { kind: "unavailable", reason: "consent-held" }
    const proposal = v1Proposal(ledger)
    const job = ledger?.jobs.find(job => sameValue(job.identity, binding.identity))
    const permission = proposal?.registration.kind === "unregistered" ? ("permission" in proposal ? proposal.permission : undefined) : job?.permission
    if (!permission || permission.kind !== "armed" || permission.generation !== binding.generation || !sameValue(permission.current, binding.current)) return { kind: "unavailable", reason: "stale" }
    const expected = { ...before.records, ...binding.batch }
    if (!binding.attempt.live || binding.deps.stopped() || binding.deps.revision() !== before.revision) return { kind: "unavailable", reason: "disposed" }
    let write: AgreementWrite = { kind: "resolved" }
    try { await ports.setAccepted(binding.batch) } catch (error) { write = { kind: "rejected", error } }
    let after: RetainedObservation | undefined
    try { after = await observeRetained(binding.deps) } catch (error) { return { kind: "unconfirmed", stage: "accept", write, cause: "read-failed", error } }
    if (binding.deps.stopped()) return { kind: "unconfirmed", stage: "accept", write, cause: "stopped" }
    const acceptedView = { ...binding.view, registration: { kind: "registered" as const, occurrence: binding.identity.occurrence }, checkpoint: "accepted" as const }
    if (!after || !sameValue(expected, after.records) || !v1Authority(binding, after) || !v1SnapshotMatches(acceptedView, after.snapshot)) {
      if (write.kind === "rejected" && after && sameValue(before.records, after.records) && sameValue(before.snapshot, after.snapshot)) return { kind: "failed", stage: "accept", write }
      return { kind: "unconfirmed", stage: "accept", write, cause: "different" }
    }
    binding.observation = after
    return { kind: "accepted", identity: binding.identity, write }
  } finally { v1Permits.delete(permit) }
}
async function recoverRetainedV1(deps: ConsentRecoveryDependencies, origin: UiOrigin, capture: Capture, selected: RetainedV1AcceptanceView, uncertainty: () => void): Promise<ExactRecoveryResult> {
  let stage: "prepare" | "authorize" | "accept" = "prepare", prefix: PermissionPrefix = []
  const attempt = { live: true }, proposal = selected.proposal
  let registration = selected.registration
  const progress = (): V1Progress => ({ proposal, registration, confirmedPermissionWrites: prefix })
  const uncertain = (fault: V1Fault): V1Fault => { uncertainty(); return fault }
  try {
    if (!deps.executeRetainedV1Acceptance || !deps.executeRetainedAgreement || !capture.retained || !sameValue(origin, capture.origin) || deps.revision() !== capture.revision) return { kind: "unavailable", reason: "stale" }
    let observation = await v1Preflight(deps, capture.retained)
    if (!observation || !sameValue(capture.records, observation.records) || !v1SnapshotMatches(selected, observation.snapshot)) return { kind: "unavailable", reason: "stale" }
    const read = readConsentDevice(observation.records)
    if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
    let ledger = retainedLedgerFor(observation.records, read.device.id)
    const again = retainedV1Selection(observation.records, ledger)
    if (!ledger || !again || !sameValue(again.proposal, proposal) || !sameValue(again.registration, registration)) return { kind: "unavailable", reason: "stale" }
    const authority = { current: read.device.consent, generation: read.control.generation, device: read.raw }
    for (const permission of ["prepared", "armed"] as const) {
      stage = permission === "prepared" ? "prepare" : "authorize"
      let next: ConsentJobs
      if (registration.kind === "unregistered") next = { ...ledger, retainedV1: { descriptor: proposal, registration, permission: { kind: permission, generation: authority.generation, current: authority.current } } }
      else {
        const identity = v1ReceiptIdentity(proposal, registration.occurrence), job = ledger.jobs.find(job => sameValue(job.identity, identity))
        if (!job || job.identity.operation.kind !== "retained-agreement" || job.permission.kind === "done") return { kind: "unavailable", reason: "stale" }
        const allowed = { kind: permission, generation: authority.generation, current: authority.current }
        const entry: ConsentRetainedAgreementJob = job.progress.kind === "terminal" ? { identity, progress: { kind: "terminal" }, permission: allowed } : { identity, progress: { kind: "accepted" }, permission: allowed }
        next = replaceRetained(ledger, entry)
      }
      const before = await v1Preflight(deps, observation)
      if (!before || !v1Authority(authority, before)) {
        if (!prefix.length) return { kind: "unavailable", reason: "stale" }
        uncertainty(); return { ...progress(), kind: "failed", operation: "retained-v1-acceptance", stage, error: new Error("V1 authorization preflight is stale") }
      }
      const expected = { ...before.records, [consentJobsKey]: next }
      let write: AgreementWrite = { kind: "resolved" }
      try { await deps.set({ [consentJobsKey]: next }) } catch (error) { write = { kind: "rejected", error } }
      let after: RetainedObservation | undefined
      try { after = await observeRetained(deps) } catch (error) { return uncertain({ ...progress(), kind: "unconfirmed", operation: "retained-v1-acceptance", stage, write, cause: "read-failed", error }) }
      if (deps.stopped()) return uncertain({ ...progress(), kind: "unconfirmed", operation: "retained-v1-acceptance", stage, write, cause: "stopped" })
      if (!after || !sameValue(expected, after.records) || !sameValue(before.snapshot, after.snapshot) || !v1Authority(authority, after)) {
        if (write.kind === "rejected" && after && sameValue(before.records, after.records) && sameValue(before.snapshot, after.snapshot)) return { ...progress(), kind: "failed", operation: "retained-v1-acceptance", stage, error: write.error, write }
        return uncertain({ ...progress(), kind: "unconfirmed", operation: "retained-v1-acceptance", stage, write, cause: "different" })
      }
      if (stage === "prepare") prefix = [{ stage: "prepare", write }]
      else if (prefix.length === 1) prefix = [prefix[0], { stage: "authorize", write }]
      observation = after; ledger = next
    }
    if (prefix.length !== 2) return { kind: "unavailable", reason: "stale" }
    const permissionWrites = prefix
    let acceptance: RetainedV1RecoveryCompletion["result"]["acceptance"] = { kind: "already-present" }
    const occurrence = registration.kind === "registered" ? registration.occurrence : registration.expectedNext
    const identity = v1ReceiptIdentity(proposal, occurrence)
    const job: RetainedV1RecoveryJob = { deviceId: proposal.deviceId, occurrence, operation: { kind: "retained-v1-acceptance", proposal }, original: identity.original }
    if (selected.checkpoint === "v1" || registration.kind === "unregistered") {
      stage = "accept"
      if (registration.kind === "unregistered" && (ledger.next !== registration.expectedNext || ledger.next >= Number.MAX_SAFE_INTEGER)) return { ...progress(), kind: "failed", operation: "retained-v1-acceptance", stage, error: new Error("V1 acceptance counter is stale") }
      const registered: ConsentRetainedV1Proposal = { descriptor: proposal, registration: { kind: "registered", occurrence } }
      const next: ConsentJobs = registration.kind === "registered" ? ledger : { ...ledger, next: occurrence + 1, retainedV1: registered, jobs: [...ledger.jobs,
        { identity, progress: { kind: "accepted" }, permission: { kind: "armed", generation: authority.generation, current: authority.current } }] }
      const permit: ExactRetainedV1AcceptancePermit = Object.freeze({ [exactRetainedV1Acceptance]: true })
      const binding: V1Binding = { view: selected, ...authority, deps, attempt, identity, observation, batch: freezeConsentValue({ interimConversion: proposal.accepted, [consentJobsKey]: next }) }
      v1Permits.set(permit, binding)
      let result: RetainedV1AcceptanceExecution
      try { result = await deps.executeRetainedV1Acceptance(permit) } finally { v1Permits.delete(permit) }
      if (result.kind === "failed") return { ...progress(), kind: "failed", operation: "retained-v1-acceptance", stage, error: result.write.error, write: result.write }
      if (result.kind === "unconfirmed") return uncertain({ ...progress(), ...result, operation: "retained-v1-acceptance" })
      if (result.kind !== "accepted") { uncertainty(); return { ...progress(), kind: "failed", operation: "retained-v1-acceptance", stage, error: new Error(`V1 acceptance is unavailable: ${result.reason}`) } }
      observation = binding.observation; registration = registered.registration
      acceptance = { kind: "confirmed", write: result.write }
    }
    const fresh = await v1Preflight(deps, observation)
    const currentView = fresh && retainedV1Selection(fresh.records, retainedLedgerFor(fresh.records, proposal.deviceId))
    if (!fresh || !currentView || currentView.registration.kind !== "registered" || !sameValue(currentView.proposal, proposal) || !v1Authority(authority, fresh) || !v1SnapshotMatches(currentView, fresh.snapshot)) {
      uncertainty()
      return { kind: "authorized-pending", job, reason: "executor", permissionWrites, acceptance, observation: { kind: "unavailable", reason: deps.stopped() ? "disposed" : "stale" }, completionCheck: { kind: deps.stopped() ? "stopped" : "different" } }
    }
    const receiptPermit: ExactRetainedAgreementPermit = Object.freeze({ [exactRetainedAgreement]: true })
    const receiptBinding: RetainedBinding = { identity, ...authority, deps, observation: fresh }
    retainedPermits.set(receiptPermit, receiptBinding)
    let result: RetainedAgreementRecoveryExecution
    try { result = await deps.executeRetainedAgreement(receiptPermit) } finally { retainedPermits.delete(receiptPermit) }
    const pending = (completionCheck: Extract<ExactRecoveryResult, { kind: "authorized-pending"; job: RetainedV1RecoveryJob }>["completionCheck"]): ExactRecoveryResult => {
      if (completionCheck.kind !== "not-complete" || result.kind !== "failed") uncertainty()
      return { kind: "authorized-pending", job, reason: "executor", permissionWrites, acceptance, observation: result, completionCheck }
    }
    let after: RetainedObservation | undefined
    try { after = await v1Preflight(deps, receiptBinding.observation) } catch (error) { return pending({ kind: "read-failed", error }) }
    if (deps.stopped()) return pending({ kind: "stopped" })
    if (!after || !v1Authority(authority, after)) return pending({ kind: "different" })
    const completed = parseConsentJobs(after.records[consentJobsKey])?.jobs.find(job => sameValue(job.identity, identity))
    if (result.kind !== "confirmed" || completed?.permission.kind !== "done" || completed.progress.kind !== "terminal" || !sameValue(after.records[interimConversionKey], confirmedRecord(proposal.accepted))) return pending({ kind: "not-complete" })
    return { kind: "recovered", job: freezeConsentValue(job), completion: { operation: "retained-v1-acceptance", result: { kind: "confirmed", acceptance, receipt: result, activation: "held" } }, permissionWrites, remaining: freezeConsentValue(classifyConsentWork(after.records)) }
  } catch (error) { uncertainty(); return { ...progress(), kind: "failed", operation: "retained-v1-acceptance", stage, error } }
  finally { attempt.live = false }
}


function isAcceptedInstallation(raw: unknown): raw is AcceptedRetainedInstallationV3 & JsonObject {
  if (!consentObject(raw)) return false
  const parsed = readRetainedCheckpoint(raw)
  return parsed.kind === "installation" && parsed.checkpoint.installation.kind === "accepted"
}
function installedInstallation(record: AcceptedRetainedInstallationV3 & JsonObject): InstalledRetainedInstallationV3 & JsonObject {
  const raw: JsonObject = record
  const installed = { ...raw, installation: { ...record.installation, kind: "installed" } }
  function valid(value: unknown): value is InstalledRetainedInstallationV3 & JsonObject {
    if (!consentObject(value)) return false
    const read = readRetainedCheckpoint(value)
    return read.kind === "installation" && read.checkpoint.installation.kind === "installed"
  }
  if (!valid(installed)) throw new Error("Invalid installed receipt")
  return installed
}
function installationSnapshotMatches(view: RetainedInstallationView, observed: Pick<RetainedObservation, "records" | "snapshot">): boolean {
  const history = readInterimInstallationHistory(observed.records)
  if (history.kind !== "history" || view.checkpoint === "installed" && view.progress !== "terminal") return false
  const expected = view.checkpoint === "installed" ? { checkpoint: "installed", progress: "terminal" } as const : { checkpoint: "accepted", progress: view.progress } as const
  const accepted = view.identity.operation.record as unknown as Snapshot<AcceptedRetainedInstallationV3>
  return recoveredRetainedInstallationDifference({ accepted, effect: view.identity.operation.effect, current: observed.snapshot, history: history.history, agreement: view.current, expected }) === undefined
}
function installationSelection(records: JsonObject, ledger: ConsentJobs | undefined): RetainedInstallationView | undefined {
  const read = readConsentDevice(records), raw = records[interimConversionKey], parsed = readRetainedCheckpoint(raw)
  if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || read.control.generation >= Number.MAX_SAFE_INTEGER || read.control.lastAgreementAt >= Number.MAX_SAFE_INTEGER || !ledger || ledger.retainedInstallation || ledger.next >= Number.MAX_SAFE_INTEGER || parsed.kind !== "installation") return
  if (Object.hasOwn(records, pendingAccountRemovalKey) || ledger.jobs.some(job => job.identity.operation.kind !== "retained-installation" && job.permission.kind !== "done")) return
  const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
  if (join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")) return
  const matches = ledger.jobs.filter(job => job.identity.operation.kind === "retained-installation" &&
    (sameValue(job.identity.operation.record, raw) || sameValue(installedInstallation(job.identity.operation.record), raw)))
  if (matches.length > 1 || matches.some(job => job.permission.kind === "done") || ledger.jobs.some(job => job.identity.operation.kind === "retained-installation" && job.permission.kind !== "done" && !matches.includes(job))) return
  const existing = matches[0]
  let identity: RetainedInstallationJobIdentity, progress: "accepted" | "terminal"
  if (existing?.identity.operation.kind === "retained-installation") {
    identity = { ...existing.identity, operation: existing.identity.operation }; progress = existing.progress.kind
  } else {
    if (!isAcceptedInstallation(raw)) return
    const derived = deriveInterimInstallationEffect(parsed.checkpoint.agreed)
    if (derived.kind !== "effect" || !consentObject(derived.effect)) return
    identity = { deviceId: read.device.id, occurrence: ledger.next, operation: { kind: "retained-installation", record: raw, effect: derived.effect }, original: raw.agreed.agreement.effect.consent }
    progress = "accepted"
  }
  if (identity.deviceId !== read.device.id || !sameValue(identity.operation.record.agreed.agreement.effect.device.id, read.device.id) || parsed.checkpoint.installation.kind === "installed" && progress !== "terminal") return
  const view: RetainedInstallationView = { kind: "retained-installation", selection: Object.freeze({ kind: "held-job-selection" }), identity,
    registration: existing ? "registered" : "unregistered", checkpoint: parsed.checkpoint.installation.kind, progress, current: read.control.state.current,
    stages: [...(progress === "accepted" ? ["documents" as const] : []), "retire", ...(parsed.checkpoint.installation.kind === "accepted" ? ["record" as const] : []), "done"], recoverability: "exact-retained-installation" }
  const snapshot: InterimPersistenceSnapshot = { source: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key))),
    canonical: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key))), checkpoint: { kind: "present", value: raw! },
    historicalAuthorization: identity.operation.record.agreed.retained.historicalAuthorization, priorCredentialPresence: identity.operation.record.agreed.retained.priorCredentialPresence }
  return installationSnapshotMatches(view, { records, snapshot }) ? view : undefined
}
function replaceInstallation(ledger: ConsentJobs, entry: ConsentRetainedInstallationJob): ConsentJobs {
  const index = ledger.jobs.findIndex(job => job.identity.occurrence === entry.identity.occurrence)
  return index < 0 ? { ...ledger, next: ledger.next + 1, jobs: [...ledger.jobs, entry] } : { ...ledger, jobs: ledger.jobs.map((job, position) => position === index ? entry : job) }
}
function installationAcceptanceSnapshotMatches(view: RetainedInstallationAcceptanceView, observed: Pick<RetainedObservation, "records" | "snapshot">): boolean {
  const history = readInterimInstallationHistory(observed.records)
  if (history.kind !== "history") return false
  const accepted = view.descriptor.accepted as unknown as Snapshot<AcceptedRetainedInstallationV3>
  const ledger = retainedLedgerFor(observed.records, view.descriptor.deviceId)
  const job = view.registration.kind === "registered" ? ledger?.jobs.find(job => sameValue(job.identity, installationIdentity(view.descriptor, view.registration.kind === "registered" ? view.registration.occurrence : -1))) : undefined
  const expected = view.checkpoint === "agreed" ? { checkpoint: "agreed", progress: "draft" } as const
    : view.checkpoint === "installed" ? { checkpoint: "installed", progress: "terminal" } as const
    : { checkpoint: "accepted", progress: view.registration.kind === "unregistered" ? "draft" : job?.progress.kind ?? "accepted" } as const
  if (view.checkpoint === "agreed" && job && job.progress.kind !== "accepted" || view.checkpoint === "installed" && job?.progress.kind !== "terminal") return false
  return recoveredRetainedInstallationDifference({ accepted, effect: view.descriptor.effect, current: observed.snapshot, history: history.history, agreement: view.current, expected }) === undefined
}
function installationAcceptanceSelection(records: JsonObject, ledger: ConsentJobs | undefined): RetainedInstallationAcceptanceView | undefined {
  const read = readConsentDevice(records), raw = records[interimConversionKey], parsed = readRetainedCheckpoint(raw)
  if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || read.control.generation >= Number.MAX_SAFE_INTEGER || read.control.lastAgreementAt >= Number.MAX_SAFE_INTEGER || !ledger || ledger.next >= Number.MAX_SAFE_INTEGER) return
  if (Object.hasOwn(records, pendingAccountRemovalKey) || ledger.jobs.some(job => job.identity.operation.kind !== "retained-installation" && job.permission.kind !== "done")) return
  const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
  if (join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")) return
  const saved = ledger.retainedInstallation
  let descriptor: RetainedInstallationDescriptor, registration: ConsentRetainedInstallationProposal["registration"], checkpoint: RetainedInstallationAcceptanceView["checkpoint"]
  if (isConfirmedRecordValue(raw)) {
    if (ledger.jobs.some(job => job.identity.operation.kind === "retained-installation" && sameValue(job.identity.operation.record.agreed, raw) && job.permission.kind === "done")) return
    if (saved?.registration.kind === "registered") {
      if (!sameValue(saved.descriptor.accepted.agreed, raw)) return
      descriptor = saved.descriptor; registration = saved.registration
    } else {
      const history = readInterimInstallationHistory(records)
      const accepted: unknown = history.kind === "history" ? { v: 3, kind: "retained-interim", agreed: raw, installation: { kind: "accepted", history: history.history } } : undefined
      if (!isAcceptedInstallation(accepted)) return
      const candidate = readRetainedCheckpoint(accepted)
      if (candidate.kind !== "installation") return
      const derived = deriveInterimInstallationEffect(candidate.checkpoint.agreed)
      if (derived.kind !== "effect" || !consentObject(derived.effect)) return
      descriptor = { kind: "retained-installation", deviceId: read.device.id, accepted, effect: derived.effect }
      registration = { kind: "unregistered", expectedNext: ledger.next }
      if (saved && sameValue(saved.descriptor.accepted.agreed, raw) && !sameValue(saved.descriptor, descriptor)) return
    }
    checkpoint = "agreed"
  } else if (parsed.kind === "installation" && saved) {
    descriptor = saved.descriptor; registration = saved.registration; checkpoint = parsed.checkpoint.installation.kind
    if (!sameValue(raw, checkpoint === "accepted" ? descriptor.accepted : installedInstallation(descriptor.accepted))) return
    if (registration.kind === "unregistered" && (checkpoint !== "accepted" || registration.expectedNext !== ledger.next)) return
  } else return
  if (descriptor.deviceId !== read.device.id || !sameValue(descriptor.accepted.agreed.agreement.effect.device.id, read.device.id)) return
  const matches = ledger.jobs.filter(job => job.identity.operation.kind === "retained-installation" && sameValue(job.identity.operation.record, descriptor.accepted))
  if (registration.kind === "unregistered" ? matches.length !== 0 : matches.length !== 1 || !sameValue(matches[0]?.identity, installationIdentity(descriptor, registration.occurrence))) return
  const job = matches[0]
  if (job?.permission.kind === "done" || ledger.jobs.some(job => job.identity.operation.kind === "retained-installation" && job.permission.kind !== "done" && !matches.includes(job))) return
  if (checkpoint === "agreed" && job?.progress.kind === "terminal" || checkpoint === "installed" && job?.progress.kind !== "terminal") return
  const view: RetainedInstallationAcceptanceView = { kind: "retained-installation-acceptance", selection: Object.freeze({ kind: "held-job-selection" }), descriptor, registration, checkpoint, current: read.control.state.current,
    stages: ["prepare", "authorize", ...(checkpoint === "agreed" || registration.kind === "unregistered" ? ["accept" as const] : []), ...(job?.progress.kind !== "terminal" ? ["documents" as const] : []), "retire", ...(checkpoint !== "installed" ? ["record" as const] : []), "done"], recoverability: "exact-retained-installation-acceptance" }
  const snapshot: InterimPersistenceSnapshot = { source: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key))), canonical: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key))),
    checkpoint: { kind: "present", value: raw! }, historicalAuthorization: descriptor.accepted.agreed.retained.historicalAuthorization, priorCredentialPresence: descriptor.accepted.agreed.retained.priorCredentialPresence }
  return installationAcceptanceSnapshotMatches(view, { records, snapshot }) ? view : undefined
}
function isConfirmedRecordValue(raw: unknown): raw is ConfirmedRetainedAgreementV2 & JsonObject { return consentObject(raw) && isConfirmedRecord(raw) }
function installationBatch(effect: InterimInstallationEffect): JsonObject {
  const batch: JsonObject = Object.fromEntries([...effect.documents.map(x => [x.path, x.document]), ...effect.caches.map(x => [x.path, x.data])])
  if (effect.schema.kind === "set") batch.schema = effect.schema.value
  return batch
}
function installationExpected(before: RetainedObservation, records: JsonObject): RetainedObservation {
  return { records, revision: before.revision, snapshot: { ...before.snapshot,
    source: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimSourceKey(key))),
    canonical: Object.fromEntries(Object.entries(records).filter(([key]) => isInterimCanonicalKey(key))),
    checkpoint: Object.hasOwn(records, interimConversionKey) ? { kind: "present", value: records[interimConversionKey]! } : { kind: "absent" } } }
}
async function installationObserve(deps: RetainedObservers, expected: RetainedObservation, afterWrite = false, unchanged?: RetainedObservation): Promise<RetainedObservation | undefined> {
  if (!deps.observeRetainedAgreement || deps.stopped()) return
  const revision = deps.revision()
  if (!afterWrite && revision !== expected.revision) return
  const first = await deps.observe()
  if (!sameValue(first, expected.records)) {
    if (!unchanged || !sameValue(first, unchanged.records) || revision !== unchanged.revision || deps.revision() !== revision) return
    expected = unchanged
  }
  const source = await deps.observeRetainedAgreement()
  if (!sameValue(source, expected.snapshot)) return
  const second = await deps.observe()
  if (!consentObject(second) || !source || !sameValue(second, expected.records)) return
  const observed = { records: freezeConsentValue(second), snapshot: freezeConsentValue(source), revision: deps.revision() }
  if (deps.stopped()) return
  if (afterWrite) return installationObserve(deps, observed)
  return observed.revision === revision ? observed : undefined
}
type InstallationAuthority = { readonly current: Agreement; readonly generation: number; readonly device: JsonObject }
type InstallationBindingBase = InstallationAuthority & {
  readonly origin: UiOrigin
  readonly identity: RetainedInstallationJobIdentity; readonly deps: RetainedObservers; readonly attempt: { live: boolean }
  observation: RetainedObservation
}
type InstallationBinding = InstallationBindingBase & ({ readonly kind: "accepted" } | { readonly kind: "terminal" })
const exactRetainedInstallation = Symbol("exact-retained-installation")
export type ExactRetainedInstallationPermit = { readonly [exactRetainedInstallation]: true }
const installationPermits = new WeakMap<ExactRetainedInstallationPermit, InstallationBinding>()
export type RetainedInstallationPorts = {
  setDocuments(effect: InterimInstallationEffect): Promise<void>
  setLedger(ledger: ConsentJobs): Promise<void>
  setInstalled(record: InstalledRetainedInstallationV3): Promise<void>
}
function installationAuthority(binding: InstallationAuthority, observed: RetainedObservation): boolean {
  const read = readConsentDevice(observed.records)
  return read.kind === "supported" && read.control?.state.kind === "agreed" && read.control.generation === binding.generation && sameValue(read.control.state.current, binding.current) && sameValue(read.raw, binding.device)
}
function installationJob(binding: InstallationBindingBase, observed: RetainedObservation): ConsentRetainedInstallationJob | undefined {
  if (!binding.attempt.live || binding.deps.stopped() || !installationAuthority(binding, observed)) return
  const ledger = parseConsentJobs(observed.records[consentJobsKey]), entry = ledger?.jobs.find(job => sameValue(job.identity, binding.identity))
  if (!entry || entry.identity.operation.kind !== "retained-installation" || entry.permission.kind === "held" || entry.permission.kind === "prepared" ||
    entry.permission.kind !== "done" && (entry.permission.generation !== binding.generation || !sameValue(entry.permission.current, binding.current))) return
  const parsed = readRetainedCheckpoint(observed.records[interimConversionKey])
  if (parsed.kind !== "installation") return
  const view: RetainedInstallationView = { kind: "retained-installation", selection: { kind: "held-job-selection" }, identity: binding.identity,
    registration: "registered", checkpoint: parsed.checkpoint.installation.kind, progress: entry.progress.kind, current: binding.current, stages: [], recoverability: "exact-retained-installation" }
  if (!installationSnapshotMatches(view, observed)) return
  if (entry.progress.kind === "accepted" && entry.permission.kind === "armed") return { identity: binding.identity, progress: { kind: "accepted" }, permission: entry.permission }
  if (entry.progress.kind === "terminal") return { identity: binding.identity, progress: { kind: "terminal" }, permission: entry.permission }
}
type InstallationSetResult = { readonly kind: "confirmed"; readonly write: AgreementWrite; readonly after: RetainedObservation }
  | { readonly kind: "failed"; readonly write: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly write: AgreementWrite; readonly observation: InstallationObservationFailure }
async function installationSet(deps: RetainedObservers, before: RetainedObservation, batch: JsonObject, setter: () => Promise<void>): Promise<InstallationSetResult> {
  let write: AgreementWrite = { kind: "resolved" }
  try { await setter() } catch (error) { write = { kind: "rejected", error } }
  let after: RetainedObservation | undefined
  try {
    after = await installationObserve(deps, installationExpected(before, { ...before.records, ...batch }), true, write.kind === "rejected" ? before : undefined)
    if (deps.stopped()) return { kind: "unconfirmed", write, observation: { kind: "stopped" } }
    if (after && sameValue(after.records, { ...before.records, ...batch })) return { kind: "confirmed", write, after }
    if (after && write.kind === "rejected" && sameValue(after.records, before.records)) return { kind: "failed", write }
    return { kind: "unconfirmed", write, observation: { kind: "different" } }
  } catch (error) { return { kind: "unconfirmed", write, observation: deps.stopped() ? { kind: "stopped" } : { kind: "read-failed", error } } }
}
async function installationEffect(binding: InstallationBindingBase, stage: RetainedInstallationRecoveryStage, batch: JsonObject, setter: () => Promise<void>, mutations: InstallationMutation[]): Promise<RetainedInstallationExecution | undefined> {
  let before: RetainedObservation | undefined
  try { before = await installationObserve(binding.deps, binding.observation) } catch { before = undefined }
  if (!before || !installationJob(binding, before)) return { kind: "unavailable", reason: binding.deps.stopped() ? "disposed" : "stale", mutations }
  if (!binding.attempt.live || binding.deps.stopped() || before.revision !== binding.deps.revision()) return { kind: "unavailable", reason: "disposed", mutations }
  const result = await installationSet(binding.deps, before, batch, setter)
  if (result.kind !== "confirmed") return { ...result, stage, mutations }
  if (binding.deps.stopped()) return { kind: "unconfirmed", stage, write: result.write, observation: { kind: "stopped" }, mutations }
  if (!installationJob(binding, result.after)) return { kind: "unconfirmed", stage, write: result.write, observation: { kind: "different" }, mutations }
  binding.observation = result.after
  mutations.push({ stage, write: result.write })
}
async function installationTerminal(binding: InstallationBindingBase & { readonly kind: "terminal" }, ports: Pick<RetainedInstallationPorts, "setLedger" | "setInstalled">, mutations: InstallationMutation[]): Promise<RetainedInstallationExecution> {
  for (const stage of ["retire", "record", "done"] as const) {
    const before = binding.observation, job = installationJob(binding, before), ledger = retainedLedgerFor(before.records, binding.identity.deviceId)
    if (!job || job.progress.kind !== "terminal" || !ledger) return { kind: "unavailable", reason: "stale", mutations }
    const installed = installedInstallation(binding.identity.operation.record)
    if (stage === "retire" && job.permission.kind === "retiring") continue
    if (stage === "record" && sameValue(before.records[interimConversionKey], installed)) continue
    if (stage !== "retire" && job.permission.kind !== "retiring") return { kind: "unavailable", reason: "stale", mutations }
    if (stage === "done" && !sameValue(before.records[interimConversionKey], installed)) return { kind: "unavailable", reason: "stale", mutations }
    const next: ConsentRetainedInstallationJob = { identity: binding.identity, progress: { kind: "terminal" }, permission: stage === "done" ? { kind: "done" } : { kind: "retiring", generation: binding.generation, current: binding.current } }
    const nextLedger = replaceInstallation(ledger, next)
    const batch: JsonObject = stage === "record" ? { [interimConversionKey]: installed } : { [consentJobsKey]: nextLedger }
    const failure = await installationEffect(binding, stage, batch, () => stage === "record" ? ports.setInstalled(installed) : ports.setLedger(nextLedger), mutations)
    if (failure) return failure
  }
  return { kind: "confirmed", original: binding.identity.original, current: binding.current, activation: "held", mutations }
}
export async function executeExactRetainedInstallation(permit: ExactRetainedInstallationPermit, ports: RetainedInstallationPorts): Promise<RetainedInstallationExecution> {
  const binding = installationPermits.get(permit)
  installationPermits.delete(permit)
  if (!binding || !binding.attempt.live) return { kind: "unavailable", reason: "stale", mutations: [] }
  const mutations: InstallationMutation[] = []
  try {
    if (binding.kind === "terminal") return await installationTerminal(binding, { setLedger: ports.setLedger, setInstalled: ports.setInstalled }, mutations)
    const batch = installationBatch(binding.identity.operation.effect)
    if (!Object.entries(batch).every(([key, value]) => Object.hasOwn(binding.observation.records, key) && sameValue(binding.observation.records[key], value))) {
      const failed = await installationEffect(binding, "documents", batch, () => ports.setDocuments(binding.identity.operation.effect), mutations)
      if (failed) return failed
    }
    const before = binding.observation, ledger = retainedLedgerFor(before.records, binding.identity.deviceId)
    const parsed = readRetainedCheckpoint(before.records[interimConversionKey]), history = readInterimInstallationHistory(before.records)
    if (!ledger || parsed.kind !== "installation" || parsed.checkpoint.installation.kind !== "accepted" || history.kind !== "history" ||
      recoveredRetainedInstallationDifference({ accepted: { ...parsed.checkpoint, installation: parsed.checkpoint.installation }, effect: binding.identity.operation.effect, current: before.snapshot, history: history.history, agreement: binding.current, expected: { checkpoint: "accepted", progress: "terminal" } })) return { kind: "unavailable", reason: "stale", mutations }
    const next = replaceInstallation(ledger, { identity: binding.identity, progress: { kind: "terminal" }, permission: { kind: "retiring", generation: binding.generation, current: binding.current } })
    const failed = await installationEffect(binding, "retire", { [consentJobsKey]: next }, () => ports.setLedger(next), mutations)
    if (failed) return failed
    const terminal: InstallationBindingBase & { readonly kind: "terminal" } = { ...binding, kind: "terminal" }
    const result = await installationTerminal(terminal, { setLedger: ports.setLedger, setInstalled: ports.setInstalled }, mutations)
    binding.observation = terminal.observation
    return result
  } finally { installationPermits.delete(permit) }
}
async function recoverInstallation(deps: ConsentRecoveryDependencies, origin: UiOrigin, capture: Capture, selected: RetainedInstallationView, uncertainty: () => void): Promise<ExactRecoveryResult> {
  const identity = selected.identity, attempt = { live: true }
  let stage: "prepare" | "authorize" = "prepare", prefix: PermissionPrefix = [], registration = selected.registration
  const progress = () => ({ job: identity, registration, confirmedPermissionWrites: prefix })
  try {
    if (!deps.executeRetainedInstallation || !capture.retained || !sameValue(origin, capture.origin) || capture.revision !== deps.revision()) return { kind: "unavailable", reason: "stale" }
    let observation = await installationObserve(deps, capture.retained)
    if (!observation || !sameValue(observation.records, capture.records) || !installationSnapshotMatches(selected, observation)) return { kind: "unavailable", reason: "stale" }
    const read = readConsentDevice(observation.records)
    if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
    const authority: InstallationAuthority = { current: read.device.consent, generation: read.control.generation, device: read.raw }
    let ledger = retainedLedgerFor(observation.records, read.device.id)
    const again = installationSelection(observation.records, ledger)
    if (!ledger || !again || !sameValue(again.identity, identity) || again.progress !== selected.progress || again.registration !== registration) return { kind: "unavailable", reason: "stale" }
    for (const permission of ["prepared", "armed"] as const) {
      stage = permission === "prepared" ? "prepare" : "authorize"
      const entry: ConsentRetainedInstallationJob = selected.progress === "terminal" ? { identity, progress: { kind: "terminal" }, permission: { kind: permission, generation: authority.generation, current: authority.current } } : { identity, progress: { kind: "accepted" }, permission: { kind: permission, generation: authority.generation, current: authority.current } }
      const next = replaceInstallation(ledger, entry), before = await installationObserve(deps, observation)
      if (!before || !installationAuthority(authority, before)) {
        if (!prefix.length) return { kind: "unavailable", reason: "stale" }
        uncertainty(); return { ...progress(), kind: "failed", operation: "retained-installation", stage, error: new Error("Installation authorization preflight is stale") }
      }
      const result = await installationSet(deps, before, { [consentJobsKey]: next }, () => deps.set({ [consentJobsKey]: next }))
      if (result.kind === "failed") return { ...progress(), kind: "failed", operation: "retained-installation", stage, write: result.write, error: result.write.error }
      if (result.kind === "unconfirmed") { uncertainty(); return { ...progress(), ...result, operation: "retained-installation", stage } }
      if (!installationAuthority(authority, result.after) || !installationSnapshotMatches(selected, result.after)) { uncertainty(); return { ...progress(), kind: "unconfirmed", operation: "retained-installation", stage, write: result.write, observation: { kind: "different" } } }
      registration = "registered"
      if (stage === "prepare") prefix = [{ stage: "prepare", write: result.write }]
      else if (prefix.length === 1) prefix = [prefix[0], { stage: "authorize", write: result.write }]
      observation = result.after; ledger = next
    }
    if (prefix.length !== 2) return { kind: "unavailable", reason: "stale" }
    const permissionWrites = prefix, permit: ExactRetainedInstallationPermit = Object.freeze({ [exactRetainedInstallation]: true })
    const binding: InstallationBinding = { ...authority, origin: freezeAgreement(origin), identity, deps, observation, attempt, kind: selected.progress }
    installationPermits.set(permit, binding)
    let result: RetainedInstallationExecution
    try { result = await deps.executeRetainedInstallation(permit) } finally { installationPermits.delete(permit) }
    const pending = (completionCheck: InstallationCompletionCheck): InstallationAuthorizedPending => {
      if (result.kind !== "failed" || completionCheck.kind !== "not-complete") uncertainty()
      return { kind: "authorized-pending", job: identity, reason: "executor", observation: result, permissionWrites, completionCheck }
    }
    let after: RetainedObservation | undefined
    try { after = await installationObserve(deps, binding.observation) } catch (error) { return pending({ kind: "read-failed", error }) }
    if (deps.stopped()) return pending({ kind: "stopped" })
    if (!after || !installationAuthority(authority, after)) return pending({ kind: "different" })
    const completed = installationJob(binding, after)
    if (result.kind !== "confirmed" || completed?.permission.kind !== "done" || completed.progress.kind !== "terminal" || !sameValue(after.records[interimConversionKey], installedInstallation(identity.operation.record))) return pending({ kind: "not-complete" })
    return { kind: "recovered", job: freezeConsentValue(identity), completion: { operation: "retained-installation", result }, permissionWrites, remaining: freezeConsentValue(classifyConsentWork(after.records)) }
  } catch (error) {
    if (prefix.length) uncertainty()
    return { ...progress(), kind: "failed", operation: "retained-installation", stage, error }
  } finally { attempt.live = false }
}

const exactRetainedInstallationAcceptance = Symbol("exact-retained-installation-acceptance")
export type ExactRetainedInstallationAcceptancePermit = { readonly [exactRetainedInstallationAcceptance]: true }
export type RetainedInstallationAcceptanceBatch = { readonly interimConversion: AcceptedRetainedInstallationV3; readonly "consent:jobs": ConsentJobs }
export type RetainedInstallationAcceptancePorts = { setAccepted(batch: RetainedInstallationAcceptanceBatch): Promise<void> }
export type RetainedInstallationAcceptanceExecution =
  | { readonly kind: "accepted"; readonly identity: RetainedInstallationJobIdentity; readonly write: AgreementWrite }
  | { readonly kind: "unavailable"; readonly reason: "stale" | "disposed" | "consent-held" }
  | { readonly kind: "failed"; readonly stage: "accept"; readonly write: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: "accept"; readonly write: AgreementWrite; readonly observation: InstallationObservationFailure }
type InstallationAcceptanceBinding = InstallationAuthority & {
  readonly view: RetainedInstallationAcceptanceView; readonly origin: UiOrigin; readonly identity: RetainedInstallationJobIdentity
  readonly deps: RetainedObservers; readonly attempt: { live: boolean }; readonly batch: RetainedInstallationAcceptanceBatch
  observation: RetainedObservation
}
const installationAcceptancePermits = new WeakMap<ExactRetainedInstallationAcceptancePermit, InstallationAcceptanceBinding>()
export async function executeExactRetainedInstallationAcceptance(permit: ExactRetainedInstallationAcceptancePermit, ports: RetainedInstallationAcceptancePorts): Promise<RetainedInstallationAcceptanceExecution> {
  const binding = installationAcceptancePermits.get(permit)
  installationAcceptancePermits.delete(permit)
  if (!binding || !binding.attempt.live) return { kind: "unavailable", reason: "stale" }
  try {
    const before = await installationObserve(binding.deps, binding.observation)
    if (!before) return { kind: "unavailable", reason: binding.deps.stopped() ? "disposed" : "stale" }
    const ledger = retainedLedgerFor(before.records, binding.identity.deviceId), proposal = ledger?.retainedInstallation
    const selected = installationAcceptanceSelection(before.records, ledger)
    if (!ledger || !proposal || !selected || !sameValue(selected.descriptor, binding.view.descriptor) || !sameValue(selected.registration, binding.view.registration) || !installationAuthority(binding, before) || !installationAcceptanceSnapshotMatches(selected, before)) return { kind: "unavailable", reason: "consent-held" }
    const job = ledger.jobs.find(job => sameValue(job.identity, binding.identity))
    const permission = "permission" in proposal ? proposal.permission : job?.permission
    if (!permission || permission.kind !== "armed" || permission.generation !== binding.generation || !sameValue(permission.current, binding.current)) return { kind: "unavailable", reason: "stale" }
    if (!binding.attempt.live || binding.deps.stopped() || binding.deps.revision() !== before.revision) return { kind: "unavailable", reason: "disposed" }
    const result = await installationSet(binding.deps, before, agreementJsonBatch(binding.batch), () => ports.setAccepted(binding.batch))
    if (result.kind !== "confirmed") return { ...result, stage: "accept" }
    const acceptedView: RetainedInstallationAcceptanceView = { ...selected, checkpoint: "accepted", registration: { kind: "registered", occurrence: binding.identity.occurrence } }
    if (!installationAuthority(binding, result.after) || !installationAcceptanceSnapshotMatches(acceptedView, result.after)) return { kind: "unconfirmed", stage: "accept", write: result.write, observation: { kind: "different" } }
    binding.observation = result.after
    return { kind: "accepted", identity: binding.identity, write: result.write }
  } finally { installationAcceptancePermits.delete(permit) }
}
function agreementJsonBatch(batch: RetainedInstallationAcceptanceBatch): JsonObject {
  if (!consentObject(batch)) throw new Error("Invalid installation acceptance batch")
  return batch
}
async function recoverInstallationAcceptance(deps: ConsentRecoveryDependencies, origin: UiOrigin, capture: Capture, selected: RetainedInstallationAcceptanceView, uncertainty: () => void): Promise<ExactRecoveryResult> {
  const descriptor = selected.descriptor, attempt = { live: true }
  let registration = selected.registration, prefix: PermissionPrefix = [], stage: "prepare" | "authorize" | "accept" = "prepare"
  const progress = (): InstallationDraftProgress => ({ descriptor, registration, confirmedPermissionWrites: prefix })
  try {
    if (!deps.executeRetainedInstallation || !deps.executeRetainedInstallationAcceptance || !capture.retained || !sameValue(origin, capture.origin) || capture.revision !== deps.revision()) return { kind: "unavailable", reason: "stale" }
    let observation = await installationObserve(deps, capture.retained)
    if (!observation || !sameValue(observation.records, capture.records) || !installationAcceptanceSnapshotMatches(selected, observation)) return { kind: "unavailable", reason: "stale" }
    const read = readConsentDevice(observation.records)
    if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
    const authority: InstallationAuthority = { current: read.device.consent, generation: read.control.generation, device: read.raw }
    let ledger = retainedLedgerFor(observation.records, read.device.id)
    const again = installationAcceptanceSelection(observation.records, ledger)
    if (!ledger || !again || !sameValue(again.descriptor, descriptor) || !sameValue(again.registration, registration)) return { kind: "unavailable", reason: "stale" }
    const occurrence = registration.kind === "registered" ? registration.occurrence : registration.expectedNext
    const identity = installationIdentity(descriptor, occurrence)
    for (const permission of ["prepared", "armed"] as const) {
      stage = permission === "prepared" ? "prepare" : "authorize"
      const allowed = { kind: permission, generation: authority.generation, current: authority.current }
      let next: ConsentJobs
      if (registration.kind === "unregistered") next = { ...ledger, retainedInstallation: { descriptor, registration, permission: allowed } }
      else {
        const job = ledger.jobs.find(job => sameValue(job.identity, identity))
        if (!job || job.permission.kind === "done") return { kind: "unavailable", reason: "stale" }
        next = replaceInstallation(ledger, job.progress.kind === "terminal" ? { identity, progress: { kind: "terminal" }, permission: allowed } : { identity, progress: { kind: "accepted" }, permission: allowed })
      }
      const before = await installationObserve(deps, observation)
      if (!before || !installationAuthority(authority, before)) {
        if (!prefix.length) return { kind: "unavailable", reason: "stale" }
        uncertainty(); return { ...progress(), kind: "failed", operation: "retained-installation-acceptance", stage, error: new Error("Installation acceptance preflight is stale") }
      }
      const result = await installationSet(deps, before, { [consentJobsKey]: next }, () => deps.set({ [consentJobsKey]: next }))
      if (result.kind === "failed") return { ...progress(), kind: "failed", operation: "retained-installation-acceptance", stage, write: result.write, error: result.write.error }
      if (result.kind === "unconfirmed") { uncertainty(); return { ...progress(), ...result, operation: "retained-installation-acceptance", stage } }
      if (!installationAuthority(authority, result.after) || !installationAcceptanceSnapshotMatches(selected, result.after)) { uncertainty(); return { ...progress(), kind: "unconfirmed", operation: "retained-installation-acceptance", stage, write: result.write, observation: { kind: "different" } } }
      if (stage === "prepare") prefix = [{ stage: "prepare", write: result.write }]
      else if (prefix.length === 1) prefix = [prefix[0], { stage: "authorize", write: result.write }]
      observation = result.after; ledger = next
    }
    if (prefix.length !== 2) return { kind: "unavailable", reason: "stale" }
    const permissionWrites = prefix
    let acceptance: InstallationAcceptanceObservation = { kind: "already-present" }
    if (selected.checkpoint === "agreed" || registration.kind === "unregistered") {
      stage = "accept"
      if (registration.kind === "unregistered" && (ledger.next !== registration.expectedNext || ledger.next >= Number.MAX_SAFE_INTEGER)) return { ...progress(), kind: "failed", operation: "retained-installation-acceptance", stage, error: new Error("Installation acceptance counter is stale") }
      const registered: ConsentRetainedInstallationProposal = { descriptor, registration: { kind: "registered", occurrence } }
      const next: ConsentJobs = registration.kind === "registered" ? ledger : { ...ledger, next: occurrence + 1, retainedInstallation: registered, jobs: [...ledger.jobs, { identity, progress: { kind: "accepted" }, permission: { kind: "armed", generation: authority.generation, current: authority.current } }] }
      const permit: ExactRetainedInstallationAcceptancePermit = Object.freeze({ [exactRetainedInstallationAcceptance]: true })
      const binding: InstallationAcceptanceBinding = { view: { ...selected, registration }, origin: freezeAgreement(origin), ...authority, deps, attempt, identity, observation, batch: freezeConsentValue({ interimConversion: descriptor.accepted, [consentJobsKey]: next }) }
      installationAcceptancePermits.set(permit, binding)
      let result: RetainedInstallationAcceptanceExecution
      try { result = await deps.executeRetainedInstallationAcceptance(permit) } finally { installationAcceptancePermits.delete(permit) }
      if (result.kind === "failed") return { ...progress(), kind: "failed", operation: "retained-installation-acceptance", stage, error: result.write.error, write: result.write }
      if (result.kind === "unconfirmed") { uncertainty(); return { ...progress(), ...result, operation: "retained-installation-acceptance" } }
      if (result.kind !== "accepted") { uncertainty(); return { ...progress(), kind: "failed", operation: "retained-installation-acceptance", stage, error: new Error(`Installation acceptance is unavailable: ${result.reason}`) } }
      observation = binding.observation; registration = registered.registration
      acceptance = { kind: "confirmed", write: result.write }
    }
    const job: RetainedInstallationAcceptanceJob = { deviceId: descriptor.deviceId, occurrence, operation: { kind: "retained-installation-acceptance", descriptor }, original: identity.original }
    const fresh = await installationObserve(deps, observation)
    const entry = fresh && retainedLedgerFor(fresh.records, descriptor.deviceId)?.jobs.find(job => sameValue(job.identity, identity))
    if (!fresh || !entry || entry.identity.operation.kind !== "retained-installation" || !installationAuthority(authority, fresh)) {
      uncertainty(); return { kind: "authorized-pending", job, reason: "executor", permissionWrites, acceptance, observation: { kind: "unavailable", reason: deps.stopped() ? "disposed" : "stale", mutations: [] }, completionCheck: { kind: deps.stopped() ? "stopped" : "different" } }
    }
    const permit: ExactRetainedInstallationPermit = Object.freeze({ [exactRetainedInstallation]: true })
    const binding: InstallationBinding = { ...authority, origin: freezeAgreement(origin), identity, deps, observation: fresh, attempt, kind: entry.progress.kind }
    if (!installationJob(binding, fresh)) { uncertainty(); return { kind: "unavailable", reason: "stale" } }
    installationPermits.set(permit, binding)
    let result: RetainedInstallationExecution
    try { result = await deps.executeRetainedInstallation(permit) } finally { installationPermits.delete(permit) }
    const pending = (completionCheck: InstallationCompletionCheck): InstallationAcceptancePending => {
      if (result.kind !== "failed" || completionCheck.kind !== "not-complete") uncertainty()
      return { kind: "authorized-pending", job, reason: "executor", observation: result, acceptance, permissionWrites, completionCheck }
    }
    let after: RetainedObservation | undefined
    try { after = await installationObserve(deps, binding.observation) } catch (error) { return pending({ kind: "read-failed", error }) }
    if (deps.stopped()) return pending({ kind: "stopped" })
    if (!after || !installationAuthority(authority, after)) return pending({ kind: "different" })
    const completed = installationJob(binding, after)
    if (result.kind !== "confirmed" || completed?.permission.kind !== "done" || completed.progress.kind !== "terminal" || !sameValue(after.records[interimConversionKey], installedInstallation(descriptor.accepted))) return pending({ kind: "not-complete" })
    return { kind: "recovered", job: freezeConsentValue(job), completion: { operation: "retained-installation-acceptance", result: { kind: "confirmed", acceptance, installation: result, activation: "held" } }, permissionWrites, remaining: freezeConsentValue(classifyConsentWork(after.records)) }
  } catch (error) {
    if (prefix.length) uncertainty()
    return { ...progress(), kind: "failed", operation: "retained-installation-acceptance", stage, error }
  } finally { attempt.live = false }
}
