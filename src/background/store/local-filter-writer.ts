import { createKeySettingsExecution } from "./key-settings-execution"
import { keySettingsPending, keySettingsProgressKey, readKeySettingsProgress, recoverKeySettings, keySettingsAccounts } from "./key-settings-progress"
import { isKeySettingChange, type KeySettingChange, type KeySettingAnswer } from "../../shared/contracts/key-settings"
import { executeFeatureSetting, type FeatureSettingWriteResult } from "./feature-settings-execution"
import type { FeatureAccess } from "./feature-settings"
import { isFeatureSettingChange, type FeatureSettingChange } from "../../shared/contracts/shared-settings"
import { featureProgressPending, recoverFeatureProgress } from "./feature-settings-progress"
import { createSettingsImportExecution, type SettingsImportOwner, type SettingsImportResult, type SettingsImportHost } from "./settings-import-execution"
import { readSettingsImport, settingsImportKey } from "./settings-import-persistence"
import { parseConsentJobs } from "./consent-recovery"
import { readSettingsFile, checkSettingsFile, settingsFileWindow, type SettingsFileOwner, type SettingsFileUnavailable } from "./settings-file-read"
import { accountLabelState, checkedAccountLabel, labelCheckDue, planAccountLabel, sameAccountLabel, type AccountLabelsOwner, type AccountLabelSeen, type AccountLabelWrite } from "./account-label"
import { decodeAccountCache, decodeLastAccount, emptyAccountCache, LAST_ACCOUNT_KEY, type AccountLabel } from "../../shared/model"
import { PlaylistCacheCapture, cacheDeviceAuthority, cacheSetupState, readCacheRecord, planCacheAbsorption, cacheJson, validCacheInput, type PlaylistCacheOwner, type PlaylistCacheRead, type PlaylistCacheWrite, type CacheAbsorption } from "./playlist-cache"
import { executeExactRetainedPlaylist, readExactPlaylistSync } from "./withdrawn-document-recovery"
import { readConsentDevice, agreementItems } from "./consent-withdrawal"
import { freezeConsentValue, sameConsentValue, createConsentRecovery, executeExactRetainedAgreement, executeExactRetainedV1Acceptance, executeExactRetainedInstallation, executeExactRetainedInstallationAcceptance, consentJobsKey, type ExactRetainedAgreementPermit, type RetainedAgreementRecoveryExecution, classifyConsentWork, type HeldWorkRead, type HeldJobSelection, type WithdrawnWorkReview, type ExactRecoveryResult, type HeldWorkView } from "./consent-recovery"
import { deriveInterimInstallationEffect, readInterimInstallationHistory, retainedInstallationDifference,
  type ConfirmedRetainedAgreementV2, type RetainedInstallationV3, type RetainedInstallationHistory,
  type InterimInstallationReview, type InterimInstallationStatus, type InterimInstallationResult, type InterimInstallationUnavailable,
  type InterimInstallationWrite, type InterimInstallationStage, type InterimInstallationEffect } from "./interim-installation"
import { executeExactRetainedFilter, readExactFilterSync } from "./withdrawn-document-recovery"
import { createInterimRecoveryExecution, recoveryRetained, retainedRecoveryDifference, recoveryHistory as readRecoveryHistory, type RetainedRecoveryV4,
  type RecoveryHost, type RecoveryRead, type RecoveryCapture, type FilterReplacementConfirmation, type RecoveryPreparation,
  type PlaylistDestinationChoice, type PlaylistRestorePreparation, type RecoveryTransactionResult, type RecoveryUnavailable } from "./interim-recovery-execution"
import type { RecoveryItemId } from "./interim-recovery-review"
import { pendingSyncJoinKey, readSyncJoinCheckpoint, transitionSyncJoin, joinJson, joinStored, sameJoinStored,
  joinDocuments, selectJoinDocuments, type SyncJoinCheckpoint, type AcceptedJoinEffect, type JoinOutboundDebt, type JoinAgreementFacts } from "./sync-join-persistence"
import { readJoinLocal, readJoinRemote, classifySyncJoin, syncJoinDecision, prepareJoinEffect, prepareReconcileEffect, projectJoinDebt, joinUnavailable,
  finishJoinEffect, setJoinStage, retireJoin, type SyncJoinHost, type SyncJoinReview, type SyncJoinOperation, type SyncJoinPreparation,
  type SyncJoinResult, type SyncJoinStatus, type SyncJoinSide, type JoinRemote } from "./sync-join-execution"
import { agreementOrigin, agreementAccess, detachAgreement, freezeAgreement, parseAgreementChoice, readCanonicalAgreement, prepareCanonicalAgreement,
  type AgreementRead, type AgreementInput, type AgreementResult, type AgreementReview, type AgreementUnavailable, type AgreementStage, type AgreementWrite } from "./consent-agreement"
import { planLegacyStartup } from "./legacy-startup"
import { prepareFirstEditHistory, readFirstEditProvenance } from "./first-edit-provenance"
import {
  CONSENT_VERSION, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError,
  decodeDevice, decodeDocument, decodeFilter, decodeSettings, decodeSetup, decodeSyncState, decodeSyncMeta, documentKey, isAccountKey, parseDocumentKey,
  type AccountKey, type PlaylistId, type DocumentKey, type SyncOpaqueWrite
} from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import { changeFilterSetting, type FilterSettingInput } from "./channel-filter-edit"
import { planSyncWrite, sameSyncJson, type SyncDocumentRecord } from "./sync-write-admission"
import { readSyncDocument } from "./sync-codec"
import { readSyncInventory } from "./sync-inventory"
import { prepareDocumentBody } from "./write-preparation"
import { executeLocalClaim, type ClaimHost, type ClaimTransactionResult } from "./local-claim-writer"

import { executeLegacyStartup, type StartupExecutionResult } from "./legacy-execution"

import { readSettingsView, type SettingsView } from "../../shared/model/settings-view"
import { executeSharedSetting, type LocalSettingsWriteResult } from "./shared-setting-execution"
import { executeSetupDestination, executeSetupEdit, type SetupDestinationResult } from "./setup-edit-execution"
import { autoAddFact, planAutoAddChoice, type AutoAddChoiceResult } from "./auto-add-choice"
import { isAutoAddReadChange, isAutoAddChoiceChange, isAutoAddLifetime, type AutoAddReadChange, type AutoAddReadAnswer, type AutoAddChoiceChange, type AutoAddLifetime } from "../../shared/contracts/auto-add-choice"
import { parseSetupDestinationChange, readAccountSetup, type AccountSetupRead, type SetupDestinationChange, type SetupEvent } from "./setup-edit"
import type { SharedSettingChange } from "./settings-edit"
import type { ClaimNotice } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import { projectClaimNotice, executeClaimNoticeAcknowledgement, type ClaimNoticeRead, type ClaimNoticeAcknowledgement, type NormalUiOrigin } from "./claim-notice"

import { parseSessionMemory, planSessionChange, sessionAccountCurrent, sessionEditAccount, type SessionChange, type SessionRead, type SessionWrite, type SessionUnavailableReason, type SessionRevision, type SessionStorage } from "./session-memory"
import { isTabProjectionRequest, isNormalWindowRouting, readProjectionDevice, projectTabStorage, projectLastAccount,
  type TabProjectionRequest, type TabProjectionRead, type TabProjectionUnavailable, type TabProjectionInvalid, type NormalWindowRouting, type LastAccountRead } from "./tab-projection"
import { prepareAccountRemovalCapture, executeAccountRemoval, resumePendingAccountRemoval, parsePendingAccountRemoval, pendingAccountRemovalKey,
  type AccountRemovalHost, type AccountRemovalDependencies, type RemovalCapture, type RemovalConfirmation, type RemovalPreparation, type RemovalResult } from "./account-removal-execution"

import { classifyRetainedAuthority, coversArchivedSource, archiveRetained, archiveConsent, archivedKeys, archiveFor, currentAuthorityAnchor, isRetainedMarkerKey,
  type CanonicalAuthorityHost, type CanonicalOwnerCapability, type RetainedControllerCapability, type RetainedCanonicalAuthorityV5, type AuthorityAnchorV5, type RetainedArchiveV5,
  type CanonicalAuthorityRead, type CanonicalAuthorityReview, type CanonicalAuthorityResult, type CanonicalAuthorityUnavailable, type CanonicalAuthorityStage,
  type CanonicalAuthorityWrite } from "./interim-canonical-authority"
import { LEGACY_DELETE_KEYS } from "./legacy"
import type { SyncMutationPace } from "./sync-mutation-pacing"
import { cleanReceivedSetupRemoval } from "./received-setup-removal"
import { hasExpiryCandidate, planLocalTombstoneExpiry, planSyncTombstoneCleanup, withoutPushed } from "./tombstone-expiry"
import { receiveDeliberateReset, authorizeReceivedResetRecovery, receivedResetKey, type SyncResetReceiveHost, type ReceivedResetResult } from "./sync-reset-receive"
import { executeInterimRetention, projectInterimNote, projectInterimInstallationNote, interimConversionKey,
  readRetainedCheckpoint, retainedAgreementDevice, retainedCheckpointDifference, isInterimCanonicalKey, isInterimSourceKey,
  type RetainedAgreementV2, type RetainedInterim, type InterimPersistenceSnapshot,
  type StoreStartupHost, type InterimRetentionResult, type InterimNoteRead } from "./interim-persistence"

export type SettingsRead = SettingsView | { readonly kind: "unavailable"; readonly reason: "consent-held" | "startup" | "newer-layout" | "disposed" | "stale" }
export type SettingsEvent = { readonly kind: "settings-changed"; readonly source: "local" | "sync" }
export type ConfirmedViewChange = SettingsEvent | SetupEvent |
  { readonly kind: "filter-changed"; readonly source: "local" | "sync"; readonly acct: AccountKey; readonly playlist: PlaylistId } |
  { readonly kind: "account-removed"; readonly source: "local" | "sync"; readonly acct: AccountKey } |
  { readonly kind: "pause-changed" } |
  { readonly kind: "skips-changed"; readonly acct: AccountKey; readonly scope: "normal" }
export type SetupRead = AccountSetupRead | { readonly kind: "unavailable"; readonly reason: "consent-held" | "startup" | "newer-layout" | "disposed" | "stale" }

type UiOrigin = Extract<Origin, { kind: "ui" }>

export type LocalFilterChange = {
  readonly acct: AccountKey
  readonly playlist: PlaylistId
  readonly desired: FilterSettingInput["desired"]
} & (
  | { readonly clearListedChannels: "not-confirmed" }
  | { readonly clearListedChannels: "confirmed"; readonly expectedGeneration: string | null }
)

export type LocalFilterWriteResult =
  | { readonly kind: "unconfirmed"; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }
  | { readonly kind: "result"; readonly result: ChangeResult }
  | {
    readonly kind: "unavailable"
    readonly reason: "startup" | "newer-layout" | "sync-writer-required" | "account-context" | "stale"
  }

export type LocalWriteStorage = {
  get(keys: readonly string[] | null): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>
}

export type SyncClock = {
  now(): number
  wallNow(): number
  after(milliseconds: number, run: () => void): () => void
}

export type SyncStorage = {
  get(): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>
  remove?(keys: readonly string[]): Promise<void>
  subscribe(changed: () => void): () => void
}

type FlushSource =
  | { kind: "set"; sent: readonly SyncDocumentRecord[]; repairs: readonly SyncDocumentRecord[] }
  | { kind: "readback"; repairs: readonly SyncDocumentRecord[] }
export type SyncFlushResult =
  | { readonly kind: "reconciliation-held"; readonly result: Exclude<SyncJoinResult, { kind: "committed" | "cancelled" }> }
  | { kind: "deferred"; notBefore: number }
  | { kind: "idle" }
  | { kind: "reconciled"; repaired: readonly SyncDocumentRecord[]; mutations?: Extract<SyncJoinResult, { kind: "committed" }>["mutations"] }
  | { kind: "pushed"; sent: readonly SyncDocumentRecord[]; repaired: readonly SyncDocumentRecord[]; mutations?: Extract<SyncJoinResult, { kind: "committed" }>["mutations"] }
  | { kind: "unavailable"; reason?: "changed-generation" }
  | { kind: "blocked" }
  | { kind: "cleaned"; removed: readonly string[] }
  | { kind: "sync-set-failed"; error: unknown; sent: readonly SyncDocumentRecord[]; recoveryPersistence?: { error: unknown } }
  | { kind: "acknowledgement-failed"; error: unknown; source: FlushSource }
  | { kind: "unconfirmed"; sent: readonly SyncDocumentRecord[]; cause:
    | { kind: "authority" | "readback" }
    | { kind: "read-failed"; error: unknown }
  }

export type SyncReceiveKey = Extract<DocumentKey, { kind: "settings" | "filter" | "setup" }>

export type SyncReceiveResult =
  | { readonly kind: "idle" }
  | { readonly kind: "adopted"; readonly received: SyncDocumentRecord }
  | { readonly kind: "unavailable"; readonly reason: "authority" | "history" | "account-context" | "document" | "pending" | "conflict" }
  | { readonly kind: "local-set-failed"; readonly error: unknown; readonly received: SyncDocumentRecord }
  | { readonly kind: "cleanup-failed"; readonly error: unknown; readonly received: SyncDocumentRecord }
  | { readonly kind: "unconfirmed"; readonly received: SyncDocumentRecord; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }

export type SyncReconciliationNotice = {
  readonly kind: "reconciliation"; readonly adopted: readonly SyncDocumentRecord[]
  readonly reverted: readonly DocumentKey[]; readonly replication: "pending" | "confirmed"
  readonly mutations: Extract<SyncJoinResult, { kind: "committed" }>["mutations"]
}
export type SyncAutomaticResult = SyncFlushResult | SyncReconciliationNotice | ReceivedResetResult | { kind: "rejected"; error: unknown }

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

function hasInterimMarkers(records: Readonly<Record<string, unknown>>): boolean {
  return classifyRetainedAuthority(records).kind === "held"
}

function authority(records: Readonly<Record<string, unknown>>) {
  const unavailable = (reason: Extract<LocalFilterWriteResult, { kind: "unavailable" }>["reason"]) => ({ kind: "unavailable", reason } as const)
  if (records === null || typeof records !== "object" || Array.isArray(records) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(records)) || Reflect.ownKeys(records).some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(records, key)
      return typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable
    })) return unavailable("startup")
  const schema = records.schema
  if (typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION) return unavailable("newer-layout")
  if (!Object.hasOwn(records, "schema") || !Object.hasOwn(records, "device") || schema !== STORAGE_SCHEMA_VERSION ||
    !isJsonObject(records.device) || Object.keys(Object.prototype).length > 0) return unavailable("startup")
  const rawDevice = records.device
  if (!["id", "consent", "syncOn"].every(key => Object.hasOwn(rawDevice, key))) return unavailable("startup")
  try {
    const device = decodeDevice(rawDevice)
    if (device.consent?.v !== CONSENT_VERSION || device.upgradeNote?.state === "pending") return unavailable("startup")
    let history: { raw: JsonObject; editedSinceOff: boolean; joined: string | null } | undefined
    if (Object.hasOwn(records, "sync")) {
      if (!isJsonObject(records.sync) || readFirstEditProvenance({ kind: "present", raw: records.sync }).kind === "invalid") return unavailable("sync-writer-required")
      let decoded
      try { decoded = decodeSyncState(records.sync) } catch (error) {
        if (error instanceof DecodeError) return unavailable("sync-writer-required")
        throw error
      }
      if (device.syncOn ? decoded.joined === null || !["ok", "full", "update-needed"].includes(decoded.status) : decoded.status !== "off") return unavailable("sync-writer-required")
      history = { raw: records.sync, editedSinceOff: decoded.editedSinceOff, joined: decoded.joined }
    }
    if (device.syncOn && !history) return unavailable("sync-writer-required")
    return { kind: "ready", device, rawDevice, history } as const
  } catch (error) {
    if (error instanceof DecodeError) return unavailable("startup")
    throw error
  }
}

function repairedHistory(raw: JsonObject, repairs: readonly SyncDocumentRecord[]): JsonObject | undefined {
  const state = decodeSyncState(raw)
  const pending = repairs.filter(record => state.pushed[record.name] !== record.gen)
  if (pending.length === 0) return
  if (!isJsonObject(raw.pushed)) throw new TypeError("Missing raw pushed history")
  const pushed = { ...raw.pushed }
  for (const record of pending) Object.defineProperty(pushed, record.name, { value: record.gen, enumerable: true, writable: true, configurable: true })
  const next = { ...raw, pushed }
  if (!isJsonObject(next)) throw new TypeError("Writer produced a non-JSON history")
  decodeSyncState(next)
  return next
}

function snapshot(raw: JsonObject): JsonObject {
  const copy: JsonObject = {}
  const pending: { source: JsonObject | JsonValue[]; target: JsonObject | JsonValue[] }[] = [{ source: raw, target: copy }]
  while (pending.length > 0) {
    const entry = pending.pop()
    if (!entry) break
    for (const [name, value] of Object.entries(entry.source)) {
      const child: JsonValue = value !== null && typeof value === "object" ? Array.isArray(value) ? [] : {} : value
      Object.defineProperty(entry.target, name, { value: child, enumerable: true, writable: true, configurable: true })
      if (value !== null && typeof value === "object" && child !== null && typeof child === "object") {
        pending.push({ source: value, target: child })
      }
    }
  }
  return copy
}

function diagnostic(error: unknown): NonNullable<SyncOpaqueWrite["diagnostic"]> {
  if (typeof error === "string") return { name: null, message: error }
  if (error === null || (typeof error !== "object" && typeof error !== "function")) return { name: null, message: null }
  try {
    const name = Object.getOwnPropertyDescriptor(error, "name")
    const message = Object.getOwnPropertyDescriptor(error, "message")
    return {
      name: name && "value" in name && typeof name.value === "string" ? name.value : null,
      message: message && "value" in message && typeof message.value === "string" ? message.value : null
    }
  } catch { return { name: null, message: null } }
}

function recoveryHistory(raw: JsonObject, gate: SyncOpaqueWrite["gate"], error?: { value: unknown }): JsonObject {
  const previous = isJsonObject(raw.opaqueWrite) ? raw.opaqueWrite : undefined
  const savedDiagnostic = error ? { ...(isJsonObject(previous?.diagnostic) ? previous.diagnostic : {}), ...diagnostic(error.value) }
    : previous?.diagnostic ?? null
  const next = { ...raw }
  if (gate === null && savedDiagnostic === null) delete next.opaqueWrite
  else next.opaqueWrite = { ...previous, gate: gate === null ? null : {
    ...(isJsonObject(previous?.gate) ? previous.gate : {}), ...gate
  }, diagnostic: savedDiagnostic }
  decodeSyncState(next)
  return next
}

type SyncEvent = { readonly kind: "edit" | "start" | "sync" | "manual"; readonly mono: number; readonly wall: number; readonly epoch: number }

type LocalFilterWriterDependencies = {
  readonly resetReceive?: SyncResetReceiveHost
  readonly syncMutationPace?: SyncMutationPace
  readonly featureAccess?: FeatureAccess
  readonly allocateShortcut?: () => string
  readonly settingsImport?: SettingsImportHost
  readonly canonicalAuthority?: CanonicalAuthorityHost
  readonly recovery?: RecoveryHost
  readonly join?: SyncJoinHost
  readonly removal?: AccountRemovalHost
  readonly session?: SessionStorage
  readonly local: LocalWriteStorage
  readonly claim: ClaimHost
  readonly sync: SyncStorage
  readonly now: () => number
  readonly generation: () => string
  readonly syncClock: SyncClock
  readonly onSyncResult: (result: SyncAutomaticResult) => void
}

type LocalFilterWriter = PlaylistCacheOwner & SettingsFileOwner & SettingsImportOwner & AccountLabelsOwner & {
  receiveSyncReset(): Promise<ReceivedResetResult>
  readWithdrawnWork(origin: UiOrigin): Promise<HeldWorkRead>
  recoverWithdrawnWork(origin: UiOrigin, input: { readonly review: WithdrawnWorkReview; readonly job: HeldJobSelection }): Promise<ExactRecoveryResult>
  readCanonicalAuthority(origin: UiOrigin): Promise<CanonicalAuthorityRead>
  releaseRetainedAuthority(origin: UiOrigin, review: CanonicalAuthorityReview): Promise<CanonicalAuthorityResult>
  resumeRetainedAuthority(origin: UiOrigin): Promise<CanonicalAuthorityResult>
  readInterimRecovery(): Promise<RecoveryRead>
  discardInterimItem(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<RecoveryTransactionResult>
  prepareInterimPlaylistRestore(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<PlaylistRestorePreparation>
  restoreInterimPlaylist(origin: UiOrigin, input: { readonly choice: PlaylistDestinationChoice; readonly acct: AccountKey }): Promise<RecoveryTransactionResult>
  cancelInterimPlaylistRestore(origin: UiOrigin, choice: PlaylistDestinationChoice): void
  resumeInterimPlaylistRestore(origin: UiOrigin): Promise<RecoveryTransactionResult>
  prepareInterimFilterReplacement(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<RecoveryPreparation>
  replaceInterimFilter(origin: UiOrigin, confirmation: FilterReplacementConfirmation): Promise<RecoveryTransactionResult>
  cancelInterimFilterReplacement(origin: UiOrigin, confirmation: FilterReplacementConfirmation): void
  resumeInterimFilterReplacement(origin: UiOrigin): Promise<RecoveryTransactionResult>
  readInterimInstallation(origin: UiOrigin): Promise<InterimInstallationStatus>
  installInterimConversion(origin: UiOrigin, review: InterimInstallationReview): Promise<InterimInstallationResult>
  resumeInterimInstallation(origin: UiOrigin): Promise<InterimInstallationResult>
  beginSyncJoin(origin: UiOrigin): SyncJoinOperation
  applySyncJoin(origin: UiOrigin, input: { readonly kind: "automatic"; readonly review: SyncJoinReview } | { readonly kind: "choice"; readonly review: SyncJoinReview; readonly choice: SyncJoinSide }): Promise<SyncJoinResult>
  cancelSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>
  readSyncJoin(origin: UiOrigin): Promise<SyncJoinStatus>
  resumeSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>
  readAgreement(origin: UiOrigin): Promise<AgreementRead>
  agree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult>
  resumeRetainedAgreement(origin: UiOrigin): Promise<AgreementResult>
  readInterimNote(): Promise<InterimNoteRead>
  prepareAccountRemoval(origin: UiOrigin, acct: AccountKey): Promise<RemovalPreparation>
  removeAccountSetup(origin: UiOrigin, confirmation: RemovalConfirmation): Promise<RemovalResult>
  readSession(): Promise<SessionRead>
  readTabProjection(request: TabProjectionRequest): Promise<TabProjectionRead>
  readLastAccount(scope: NormalWindowRouting): Promise<LastAccountRead>
  changeSession(change: SessionChange): Promise<SessionWrite>
  readClaimNotice(): Promise<ClaimNoticeRead>
  acknowledgeClaimNotice(origin: NormalUiOrigin, expected: Snapshot<ClaimNotice>): Promise<ClaimNoticeAcknowledgement>
  read(view: "settings"): Promise<SettingsRead>
  subscribe(fn: (event: SettingsEvent) => void): () => void
  changeKeySetting(origin: UiOrigin, change: KeySettingChange, principal: string | undefined): Promise<KeySettingAnswer>
  changeFeatureSetting(origin: UiOrigin, change: FeatureSettingChange): Promise<FeatureSettingWriteResult>
  changeSharedSetting(origin: UiOrigin, change: SharedSettingChange): Promise<LocalSettingsWriteResult>
  readSetup(acct: AccountKey): Promise<SetupRead>
  subscribeSetup(fn: (event: SetupEvent) => void): () => void
  subscribeView(fn: (event: ConfirmedViewChange) => void, revoked?: () => void): () => void
  changeSetupDestination(origin: UiOrigin, change: SetupDestinationChange): Promise<SetupDestinationResult>
  readAutoAddChoice(origin: UiOrigin, request: AutoAddReadChange): Promise<AutoAddReadAnswer>
  changeAutoAddChoice(origin: UiOrigin, change: AutoAddChoiceChange): Promise<AutoAddChoiceResult>
  claim(): Promise<ClaimTransactionResult>
  change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>
  receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>
  flushSync(): Promise<SyncFlushResult>
  startSync(): Promise<void>
  dispose(): Promise<void>
}

export class StartupReadinessError extends Error {
  constructor(readonly result: Extract<ReceivedResetResult, { kind: "reset-held" }> | { readonly kind: "consent-held"; readonly work: readonly HeldWorkView[] } | { readonly kind: "pending-join"; readonly observation: "accepted" | "outbound" | "choice" | "invalid" | "newer-version" } | { readonly kind: "interim-held"; readonly result: Exclude<InterimRetentionResult, { kind: "not-interim" | "newer-layout" }> } | Exclude<StartupExecutionResult, { kind: "ok" | "newer-layout" }> | { readonly kind: "disposed" } | { readonly kind: "pending-removal"; readonly result: Exclude<RemovalResult, { kind: "committed" | "unchanged" }> }) {
    super("Local startup did not release this owner")
    this.name = "StartupReadinessError"
  }
}

export function createLocalFilterWriter(deps: LocalFilterWriterDependencies): LocalFilterWriter {
  return createOwner(deps).writer
}

export function createStartingLocalFilterWriter(deps: LocalFilterWriterDependencies & { readonly startup: StoreStartupHost }):
  LocalFilterWriter & { ready(): Promise<"ok" | "newer-layout"> } {
  const owner = createOwner(deps, deps.startup)
  return { ...owner.writer, ready: () => owner.readiness }
}

function createOwner(deps: LocalFilterWriterDependencies, startup?: StoreStartupHost) {
  let keyPending = false
  let inKeyExecution = false
  let keyExecution: ReturnType<typeof createKeySettingsExecution> | undefined
  let featurePending = false
  let inFeatureExecution = false
  let importPending = false
  let resetPending = false
  let inResetExecution = false
  let inImportExecution = false
  function recognizeImport(records: Readonly<Record<string, unknown>>) {
    keyPending = keySettingsPending(records)
    featurePending = featureProgressPending(records)
    resetPending = Object.hasOwn(records, receivedResetKey)
    const marker = readSettingsImport(records[settingsImportKey])
    const ledger = parseConsentJobs(records["consent:jobs"])
    importPending = marker.kind === "valid" || marker.kind === "invalid" || marker.kind === "newer-version" ||
      marker.kind === "retired" && !ledger?.jobs.some(job => job.identity.operation.kind === "settings-import" && job.identity.occurrence === marker.receipt.occurrence && job.permission.kind === "done") ||
      !!ledger?.jobs.some(job => job.identity.operation.kind === "settings-import" && job.permission.kind !== "done")
  }
  let protocolHeld = false
  let protocolClassified = false
  let agreementRevision = 0
  let joinHeld = false
  let joinRemoteRevision = 0
  let observedJoinRemote: JsonObject | undefined
  const rawStartup = startup
  let observedInterimSnapshot: InterimPersistenceSnapshot | undefined
  if (rawStartup) startup = { ...rawStartup, context: detachAgreement(rawStartup.context),
    async readInterimSnapshot() {
      const raw = await rawStartup.readInterimSnapshot()
      if (!isJsonValue(raw)) { agreementRevision++; return raw }
      const current = detachAgreement(raw)
      if (observedInterimSnapshot && !agreementSame(observedInterimSnapshot, current)) agreementRevision++
      observedInterimSnapshot = detachAgreement(current)
      return current
    }
  }
  const observedAgreementValues = new Map<string, JsonValue>()
  let observedComplete = false
  type CanonicalOwner = { readonly kind: "active"; readonly capability: CanonicalOwnerCapability; record: JsonValue; checkpoint: Snapshot<RetainedCanonicalAuthorityV5>; readonly keys: ReadonlySet<string> }
  let canonical: { readonly kind: "inactive" | "lost" } | CanonicalOwner = { kind: "inactive" }
  let inRecovery = false
  let expectedAuthorityRecord: JsonValue | undefined
  let retainedController: { readonly handoffId: string; readonly sourceEpoch: string; readonly capability: RetainedControllerCapability } | undefined
  const storage = deps.local
  // A released archive grants nothing by itself. Every read and write first proves the complete archived inventory and the live exclusive capability.
  async function canonicalCurrent(full: Readonly<Record<string, unknown>>): Promise<boolean> {
    const active = canonical
    if (active.kind !== "active") return false
    let valid = isJsonObject(full) && coversArchivedSource(full, active.checkpoint)
    if (valid && !sameSyncJson(full[interimConversionKey] as JsonValue, active.record as JsonValue)) {
      const read = readRetainedCheckpoint(full[interimConversionKey])
      valid = expectedAuthorityRecord !== undefined && agreementSame(full[interimConversionKey], expectedAuthorityRecord) && read.kind === "authority" && read.checkpoint.handoff.kind === "canonical" && agreementSame(read.checkpoint.archive, active.checkpoint.archive) &&
        agreementSame(read.checkpoint.handoff, active.checkpoint.handoff) && coversArchivedSource(full, read.checkpoint)
      if (valid && read.kind === "authority") { active.record = detachAgreement(full[interimConversionKey] as JsonValue); active.checkpoint = read.checkpoint; expectedAuthorityRecord = undefined }
    }
    if (valid && startup) {
      const raw = await startup.readInterimSnapshot(), original = archiveRetained(active.checkpoint.archive)
      valid = isJsonValue(raw) && agreementSame(raw.source, original.source) &&
        agreementSame(raw.canonical, Object.fromEntries(Object.entries(full).filter(([key]) => isInterimCanonicalKey(key)))) &&
        agreementSame(raw.checkpoint, { kind: "present", value: full[interimConversionKey] }) &&
        agreementSame(raw.historicalAuthorization, original.historicalAuthorization) && agreementSame(raw.priorCredentialPresence, original.priorCredentialPresence)
    }
    if (valid && (await active.capability.assertCurrent()) === "current" && canonical === active && agreementSame(full, await storage.get(null)) && !disposed()) return true
    loseCanonical()
    return false
  }
  function loseCanonical() {
    if (canonical.kind === "active") canonical = { kind: "lost" }
    agreementBarrier()
  }
  async function assertExternalAuthority() {
    if (keyPending && !inKeyExecution) throw new Error("Key settings cleanup is pending")
    if (featurePending && !inFeatureExecution) throw new Error("Feature progress cleanup is pending")
    if (resetPending && !inResetExecution) throw new Error("Deliberate reset continuation is pending")
    if (importPending && !inImportExecution) throw new Error("Settings import continuation is pending")
    if (disposed() || protocolHeld) throw new Error("Owner execution is stopped")
    if (canonical.kind !== "inactive" && !(await canonicalCurrent(await storage.get(null)))) throw new Error("Canonical authority is not current")
    if (!inRecovery && canonical.kind === "active" && canonical.checkpoint.pending.kind !== "none") throw new Error("Recovery continuation is pending")
  }
  const sync: SyncStorage = {
    async get() { await assertExternalAuthority(); if (disposed() || protocolHeld) throw new Error("Owner execution is stopped"); const result = await deps.sync.get(); if (!disposed() && !protocolHeld) await assertExternalAuthority(); return result },
    async set(items) { await assertExternalAuthority(); if (disposed() || protocolHeld) throw new Error("Owner execution is stopped"); return deps.sync.set(items) },
    subscribe: listener => { if (disposed() || protocolHeld) return () => {}; return deps.sync.subscribe(listener) }
  }
  const rawLocal: LocalWriteStorage = {
    async get(keys) {
      if (protocolHeld) {
        const full = await storage.get(null); recognizeImport(full)
        return keys === null ? full : Object.fromEntries(keys.filter(key => Object.hasOwn(full, key)).map(key => [key, full[key]]))
      }
      if (canonical.kind === "inactive") {
        const full = await storage.get(null)
        recognizeImport(full)
        if (!protocolClassified && (Object.hasOwn(full, "consent:state") || Object.hasOwn(full, "consent:jobs"))) {
          protocolClassified = true
          const read = readConsentDevice(full)
          protocolHeld = !isJsonObject(full) || read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || classifyConsentWork(full).some(view => view.kind !== "feature-settings" && ((view.kind !== "settings-import" && view.kind !== "sync-reset") || view.resume !== "current-agreement"))
          if (protocolHeld) { initialization = "consent-held"; return keys === null ? full : Object.fromEntries(keys.filter(key => Object.hasOwn(full, key)).map(key => [key, full[key]])) }
        }
        if (classifyRetainedAuthority(full).kind === "canonical-archive" && (!startup || initialization !== "pending") && (!retainedController || (await retainedController.capability.assertCurrent()) !== "current")) {
          loseCanonical()
          return {}
        }
        return keys === null ? full : Object.fromEntries(keys.filter(key => Object.hasOwn(full, key)).map(key => [key, full[key]]))
      }
      const full = await storage.get(null)
      recognizeImport(full)
      if (!(await canonicalCurrent(full))) return {}
      if (!inRecovery && canonical.kind === "active" && canonical.checkpoint.pending.kind !== "none") return {}
      return keys === null ? full : Object.fromEntries(keys.filter(key => Object.hasOwn(full, key)).map(key => [key, full[key]]))
    },
    async set(items) {
      if (keyPending && !inKeyExecution) throw new Error("Key settings cleanup is pending")
    if (featurePending && !inFeatureExecution) throw new Error("Feature progress cleanup is pending")
      if (resetPending && !inResetExecution) throw new Error("Deliberate reset continuation is pending")
      if (importPending && !inImportExecution) throw new Error("Settings import continuation is pending")
      if (disposed() || protocolHeld) throw new Error("Owner execution is stopped")
      if (canonical.kind !== "inactive" && !(await canonicalCurrent(await storage.get(null)))) throw new Error("Canonical authority is not current")
      if (canonical.kind === "active") {
        if (!inRecovery && canonical.checkpoint.pending.kind !== "none") throw new Error("Recovery continuation is pending")
        if (Object.hasOwn(items, interimConversionKey)) {
          if (!inRecovery) throw new Error("Only recovery may extend canonical evidence")
          expectedAuthorityRecord = items[interimConversionKey]
        }
      }
      if (disposed() || protocolHeld) throw new Error("Owner execution is stopped")
      try { return await storage.set(items) }
      finally {
        if (expectedAuthorityRecord !== undefined && canonical.kind === "active") {
          try { await canonicalCurrent(await storage.get(null)) } catch { loseCanonical() }
          expectedAuthorityRecord = undefined
        }
      }
    }
  }
  function retainedHold(records: Readonly<Record<string, unknown>>): boolean {
    if (!hasInterimMarkers(records)) return false
    const active = canonical
    return active.kind !== "active" || Object.keys(records).some(key => isRetainedMarkerKey(key) && !active.keys.has(key))
  }
  const local: LocalWriteStorage = {
    async get(keys) {
      const raw = await rawLocal.get(keys)
      if (!isJsonObject(raw)) { agreementRevision++; return raw }
      const records = snapshot(raw)
      if (keys === null || keys.includes(pendingSyncJoinKey)) {
        const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
        joinHeld = checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "off")
      }
      const names = keys === null ? new Set([...observedAgreementValues.keys(), ...Object.keys(records)]) : new Set(keys)
      for (const name of names) {
        const before = observedAgreementValues.get(name), present = Object.hasOwn(records, name)
        if (observedAgreementValues.has(name) ? !present || !sameConsentValue(before!, records[name]!) : observedComplete && present) agreementRevision++
        if (observedAgreementValues.has(name) && name === "device" && !sameSyncJson(cacheDeviceAuthority(before), cacheDeviceAuthority(records[name]))) sessionRevision++
        if (observedAgreementValues.has(name) && (name === "schema" || name === "consent:state") && !sameConsentValue(before!, records[name] ?? null)) sessionRevision++
        if (present) observedAgreementValues.set(name, snapshot({ value: records[name]! }).value!)
        else observedAgreementValues.delete(name)
      }
      if (keys === null) observedComplete = true
      return records
    },
    set: items => rawLocal.set(items)
  }
  let agreementContext: "first-run" | "upgrade-note" | "existing" = "existing"
  const agreementCreation = startup ? detachAgreement(startup.context) : undefined
  type ReviewCapture = {
    readonly origin: JsonObject; readonly records: JsonObject; readonly revision: number
    readonly retained: InterimPersistenceSnapshot | undefined
    readonly context: "first-run" | "upgrade-note" | "existing"
    terminal?: { readonly revision: number; readonly action: JsonObject; readonly after: JsonObject; readonly result: Extract<AgreementResult, { kind: "committed" | "unchanged" }> }
    consumed: boolean
  }
  const agreementReviews = new WeakMap<AgreementReview, ReviewCapture>()
  let initialization: "pending" | "ok" | "newer-layout" | "failed" | "interim-held" | "pending-join" | "consent-held" = startup ? "pending" : "ok"
  let interimResult: Exclude<InterimRetentionResult, { kind: "not-interim" | "newer-layout" }> | undefined
  let claimConfirmation: "ready" | "unconfirmed" = "ready"
  function fencedSession(session: Extract<AccountRemovalHost, { kind: "fixture" }>["session"]): typeof session {
    return {
      async get() { await assertExternalAuthority(); if (disposed() || protocolHeld) throw new Error("Owner execution is stopped"); const result = await session.get(); await assertExternalAuthority(); return result },
      async set(items) { await assertExternalAuthority(); if (disposed() || protocolHeld) throw new Error("Owner execution is stopped"); return session.set(items) },
      async remove(keys) { await assertExternalAuthority(); if (disposed() || protocolHeld) throw new Error("Owner execution is stopped"); return session.remove(keys) }
    }
  }
  const removalPort = deps.removal ?? { kind: "unavailable" }
  const removal: AccountRemovalHost = removalPort.kind === "unavailable" ? removalPort : { ...removalPort,
    session: fencedSession(removalPort.session), async removeLocal(keys) { await assertExternalAuthority(); if (disposed() || protocolHeld) throw new Error("Owner execution is stopped"); return removalPort.removeLocal(keys) }
  }
  const session = removal.kind !== "unavailable" ? removal.session : deps.session && fencedSession(deps.session)
  const joinPort = deps.join ?? { kind: "unavailable" }
  const join: SyncJoinHost = joinPort.kind !== "fixture" ? joinPort : { ...joinPort,
    session: fencedSession(joinPort.session), async removeLocal(keys) { await assertExternalAuthority(); if (disposed() || protocolHeld) throw new Error("Owner execution is stopped"); return joinPort.removeLocal(keys) }
  }
  const joinDeps = { local, host: join, stopped: () => disposed() || protocolHeld || claimConfirmation === "unconfirmed" }
  const removalLocal: LocalWriteStorage = {
    set: items => local.set(items),
    async get(keys) {
      const records = await local.get(keys)
      if (retainedHold(records)) {
        interimResult ??= { kind: "stale", reason: "checkpoint" }
        initialization = "interim-held"
        deactivate("stopped")
        listeners.clear(); revokeViews()
        return {}
      }
      return records
    }
  }
  let removalChecked = false
  // Recovery resets all authority. Ordinary removals revoke only their captured account.
  let sessionRevision = 0
  const sessionAccounts = new Map<AccountKey, number>()
  const sessionRevisionView = (): SessionRevision => ({ reset: sessionRevision, accounts: new Map(sessionAccounts) })
  const autoAddCaptures = new Map<AutoAddLifetime, { readonly origin: JsonObject; readonly acct: AccountKey; readonly playlist: PlaylistId; readonly revision: SessionRevision }>()
  function autoAddCurrent(origin: UiOrigin, change: AutoAddChoiceChange): boolean {
    const saved = autoAddCaptures.get(change.lifetime)
    return !!saved && saved.acct === change.acct && saved.playlist === change.playlist && sameSyncJson(saved.origin, origin) &&
      sessionAccountCurrent(saved.revision, sessionRevisionView(), change.acct)
  }
  const invalidateAccountSession = (acct: AccountKey) => { keyExecution?.invalidateAccount(acct); sessionAccounts.set(acct, (sessionAccounts.get(acct) ?? 0) + 1) }
  let sessionSequence = 0
  const confirmations = new WeakMap<RemovalConfirmation, { readonly origin: JsonObject; readonly capture: RemovalCapture }>()
  const listeners = new Set<(event: SettingsEvent | SetupEvent) => void>()
  const viewListeners = new Set<(event: ConfirmedViewChange) => void>()
  const viewRevocations = new Set<() => void>()
  let lane: Promise<void> = Promise.resolve()
  let lifetime: { kind: "inactive" | "stopped" | "disposed" } | { kind: "active"; unsubscribe: () => void } = { kind: "inactive" }
  let ticket: { event: SyncEvent; cancel: () => void } | undefined
  let quietUntil = 0
  const mutationPace = deps.syncMutationPace ?? (() => {
    const now = startup ? 0 : deps.syncClock.now()
    return { nextInvocation: now + 5000, lastMonotonic: now,
      invalid: !Number.isFinite(now) || now < 0 || now + 5000 > Number.MAX_SAFE_INTEGER }
  })()
  let epoch = 0
  let hold: { mono: number; wall: number } | undefined
  let observedGate: JsonValue | undefined

  const removalDependencies: AccountRemovalDependencies = {
    local: removalLocal, sync: sync, host: removal,
    authority: records => retainedHold(records) ? { kind: "unavailable", reason: "startup" } : authority(records),
    repairHistory: repairedHistory,
    isStopped: disposed, now: () => deps.now(), generation: () => deps.generation()
  }
  const importHost = deps.settingsImport ?? { kind: "unavailable" }
  const importExecution = importHost.kind === "fixture" ? createSettingsImportExecution({
    local: {
      async get(keys) { const records = await storage.get(keys); if (keys === null) recognizeImport(records); return records },
      async set(items) { if (disposed()) throw new Error("Writer disposed"); await storage.set(items) }
    },
    cleanup: importHost, sync: deps.sync, now: deps.now, generation: deps.generation, stopped: disposed,
    async authority() {
      if (disposed() || canonical.kind === "lost") return false
      const records = await storage.get(null)
      if (canonical.kind === "active") return canonicalCurrent(records)
      return !retainedHold(records) && readConsentDevice(records).kind === "supported"
    },
    accepted(record) {
      importPending = true; cancelTicket(); cancelJoinPreparations()
      const accounts = new Set([...record.plan.documents.changes.flatMap(change => change.key.kind === "settings" ? [] : [change.key.acct]),
        ...record.plan.cleanup.accounts.map(account => account.acct)])
      for (const acct of accounts) invalidateAccountSession(acct)
    },
    confirmed(record) {
      importPending = false
      const accounts = [...new Set([...record.plan.documents.changes.flatMap(change => change.key.kind === "settings" ? [] : [change.key.acct]),
        ...record.plan.cleanup.accounts.map(account => account.acct)])].sort()
      emitSettings("local")
      for (const acct of accounts) {
        if (record.plan.cleanup.accounts.some(account => account.acct === acct)) publishRemoval(acct, "local")
        else emit({ kind: "setup-changed", acct, source: "local" })
      }
    },
    uncertain() { importPending = true; cancelTicket(); sessionRevision++ }
  }) : undefined
  async function importTask<T>(run: () => Promise<T>): Promise<T> {
    inImportExecution = true
    try { return await run() } finally { inImportExecution = false }
  }
  async function resumeImportInLane(): Promise<SettingsImportResult | { readonly kind: "idle" }> {
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    const records = await storage.get(null); recognizeImport(records)
    if (!importPending) return { kind: "idle" }
    if (!importExecution) return { kind: "unavailable", reason: "cleanup-host" }
    return importTask(() => importExecution.resume())
  }
  async function runAccountRemoval(capture: RemovalCapture, expectedRecords?: JsonObject): Promise<RemovalResult> {
    cancelTicket()
    invalidateAccountSession(capture.acct)
    const result = await executeAccountRemoval(removalDependencies, capture, expectedRecords)
    let hasPending = false
    if (result.kind !== "committed" && result.kind !== "unchanged") {
      try { hasPending = Object.hasOwn(await removalLocal.get([pendingAccountRemovalKey]), pendingAccountRemovalKey) }
      catch { hasPending = true }
    }
    if (hasPending || result.kind === "unconfirmed" || result.kind === "failed" && result.stage !== "prepare") {
      claimConfirmation = "unconfirmed"
      deactivate("stopped")
    }

    return result
  }
  function publishRemoval(acct: AccountKey, source: "local" | "sync") {
    emit({ kind: "setup-changed", source, acct }, false)
    emitView({ kind: "account-removed", source, acct })
  }
  async function completePendingRemoval(): Promise<RemovalResult> {
    if (disposed() || protocolHeld) return { kind: "unavailable", reason: protocolHeld ? "consent-held" : "disposed" }
    let result: RemovalResult, removed: AccountKey | undefined
    try {
      const records = await removalLocal.get([pendingAccountRemovalKey])
      if (importPending) {
        const imported = await resumeImportInLane()
        if (imported.kind !== "idle" && imported.kind !== "committed") return { kind: "unavailable", reason: "stale" }
      }
      const pending = parsePendingAccountRemoval(records[pendingAccountRemovalKey])
      if (pending) { removed = pending.record.acct; invalidateAccountSession(pending.record.acct) }
      else if (Object.hasOwn(records, pendingAccountRemovalKey)) sessionRevision++
      result = await resumePendingAccountRemoval(removalDependencies)
    } catch (error) { result = { kind: "failed", stage: "prepare", error } }
    if (result.kind === "committed" && removed) publishRemoval(removed, "local")
    if (result.kind === "committed" || result.kind === "unchanged") removalChecked = true
    else {
      claimConfirmation = "unconfirmed"
      deactivate("stopped")
    }
    return result
  }
  const guardedLocal: LocalWriteStorage = {
    set: items => removalLocal.set(items),
    async get(keys) {
      let records = await removalLocal.get(keys)
      if (disposed() || protocolHeld || joinHeld || importPending || keyPending && !inKeyExecution || featurePending && !inFeatureExecution || resetPending && !inResetExecution) return {}
      if (removalChecked) return records
      if (keys !== null) {
        // Joined Filter edits already require a complete read before any successful outcome.
        if (isJsonObject(records.device) && records.device.syncOn === true) return records
        records = await removalLocal.get(null)
      }
      if (!Object.hasOwn(records, pendingAccountRemovalKey)) { removalChecked = true; return records }
      const result = await completePendingRemoval()
      return result.kind === "committed" ? removalLocal.get(keys) : {}
    }
  }

  keyExecution = createKeySettingsExecution({ local: guardedLocal, sync,
    authority: records => retainedHold(records) ? { kind: "unavailable", reason: "startup" } : authority(records),
    repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation,
    monotonic: () => deps.syncClock.now(), allocate: deps.allocateShortcut ?? (() => crypto.randomUUID().replaceAll("-", "").slice(0, 6)),
    resetRevision: () => sessionRevision, accountRevision: acct => sessionAccounts.get(acct) ?? 0 })

  const readiness: Promise<"ok" | "newer-layout"> = startup ? enqueue(async () => {
    try {
      const full = await local.get(null)
      if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
      const resetArchive = classifyRetainedAuthority(full)
      if (protocolHeld && Object.hasOwn(full, receivedResetKey) && resetArchive.kind === "canonical-archive") return await canonicalStartup(startup, full, resetArchive.checkpoint)
      if (protocolHeld) { initialization = "consent-held"; throw new StartupReadinessError({ kind: "consent-held", work: isJsonObject(full) ? classifyConsentWork(full) : [] }) }
      const archived = classifyRetainedAuthority(full)
      if (archived.kind === "canonical-archive") return await canonicalStartup(startup, full, archived.checkpoint)
      if (featurePending || keyPending) { initialization = "consent-held"; throw new StartupReadinessError({ kind: "consent-held", work: isJsonObject(full) ? classifyConsentWork(full) : [] }) }
      if (Object.hasOwn(full, receivedResetKey)) {
        const reset = await receiveResetInLane()
        if (reset.kind === "reset-held") throw new StartupReadinessError(reset)
      }
      if (Object.hasOwn(full, pendingSyncJoinKey)) {
        const check = readSyncJoinCheckpoint(full[pendingSyncJoinKey])
        if (!(check.kind === "valid" && check.checkpoint.phase === "off")) {
          const header = await startup.readInterimSnapshot()
          if (hasInterimMarkers(full) || header.checkpoint.kind !== "absent" || Object.keys(header.source).some(name => name.startsWith("account:") || ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].includes(name)) || typeof full.schema === "number" && full.schema > STORAGE_SCHEMA_VERSION) {
            initialization = "pending-join"
            throw new StartupReadinessError({ kind: "pending-join", observation: "invalid" })
          }
          initialization = "pending-join"
          throw new StartupReadinessError({ kind: "pending-join", observation: check.kind === "valid" ? check.checkpoint.phase === "off" ? "invalid" : check.checkpoint.phase : check.kind === "newer-version" ? "newer-version" : "invalid" })
        }
      }
      const retained = await executeInterimRetention({ local: local, snapshot: () => startup.readInterimSnapshot(), isStopped: disposed,
        context: initial => {
          const context = startup.context
          const paths = new Set(["doc:settings"])
          for (const [key, body] of Object.entries(initial.source)) {
            if (!key.startsWith("account:")) continue
            const acct = key.slice(8), setup = `doc:setup:${acct}`
            if (parseDocumentKey(setup)?.kind !== "setup") continue
            paths.add(setup)
            if (!isJsonObject(body) || !isJsonObject(body.filters)) continue
            for (const playlist of Object.keys(body.filters)) {
              const path = `doc:filter:${acct}:${playlist}`
              if (parseDocumentKey(path)?.kind === "filter") paths.add(path)
            }
          }
          return { deviceId: context.deviceId, at: context.at, platform: context.platform, commands: context.commands,
            interimShortcutId: context.shortcutId, documentGenerations: Object.fromEntries([...paths].map(path => [path, `${context.settingsGen}:${path}`])) }
        } })
      if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
      if (retained.kind === "failed" && retained.stage === "snapshot") throw retained.error
      if (retained.kind === "newer-layout") { initialization = "newer-layout"; return "newer-layout" }
      if (retained.kind !== "not-interim") {
        interimResult = retained
        initialization = "interim-held"
        deactivate("stopped")
        listeners.clear(); revokeViews()
        throw new StartupReadinessError({ kind: "interim-held", result: retained })
      }
      let classified = false
      const result = await executeLegacyStartup({ local: local, isStopped: () => disposed() || protocolHeld, host: { ...startup,
        async readSnapshot() {
          const current = await startup.readSnapshot()
          if (!classified) {
            classified = true
            const plan = planLegacyStartup(current, startup.context)
            agreementContext = plan.kind === "upgrade" || plan.kind === "resume" ? "upgrade-note"
              : plan.kind === "fresh" || plan.kind === "current" && current.device === undefined && current.settingsDocument === undefined && current.unclaimed === undefined && current.legacy.presentKeys.length === 0 ? "first-run" : "existing"
          }
          return current
        }
      } })
      if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
      if (result.kind !== "ok" && result.kind !== "newer-layout") throw new StartupReadinessError(result)
      if (result.kind === "ok") {
        const completion = await completePendingRemoval()
        if (interimResult) throw new StartupReadinessError({ kind: "interim-held", result: interimResult })
        if ("stage" in completion || completion.kind === "result" || completion.kind === "unavailable") throw new StartupReadinessError({ kind: "pending-removal", result: completion })
        if (!deps.syncMutationPace) {
          mutationPace.lastMonotonic = deps.syncClock.now()
          mutationPace.nextInvocation = mutationPace.lastMonotonic + 5000
          mutationPace.invalid = !Number.isFinite(mutationPace.lastMonotonic) || mutationPace.lastMonotonic < 0 || mutationPace.nextInvocation > Number.MAX_SAFE_INTEGER
        }
      }
      initialization = result.kind
      return result.kind
    } catch (error) {
      if (initialization !== "interim-held" && initialization !== "pending-join" && initialization !== "consent-held") initialization = "failed"
      throw error
    }
  }) : Promise.resolve("ok")
  // Construction may precede the consumer attaching its ready rejection handler.
  void readiness.catch(() => {})

  async function heldObservation(): Promise<JsonObject | undefined> {
    const first = await local.get(null)
    if (!isJsonObject(first) || disposed()) return
    const revision = agreementRevision, second = await local.get(null)
    if (!isJsonObject(second) || disposed() || revision !== agreementRevision || !sameSyncJson(first, second)) return
    return snapshot(second)
  }
  async function heldAgreement(origin: UiOrigin): Promise<AgreementRead> {
    if (!agreementOrigin(origin)) return { kind: "invalid", field: "records" }
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    try {
      const records = await heldObservation()
      if (!records) return { kind: "unavailable", reason: "stale" }
      const read = readConsentDevice(records)
      if (read.kind !== "supported" || read.control?.state.kind === "withdrawing") return { kind: "unavailable", reason: read.kind === "newer-layout" ? "newer-layout" : "consent-held" }
      const review: AgreementReview = Object.freeze({ kind: "agreement-review" })
      agreementReviews.set(review, { origin: snapshot(origin), records, revision: agreementRevision, retained: undefined, context: "existing", consumed: false })
      return { kind: "review", version: CONSENT_VERSION, review, presentation: freezeConsentValue({ kind: "held", consent: read.device.consent, work: classifyConsentWork(records), allowedChoice: "disclosure", activation: "held" }) }
    } catch { return { kind: "unavailable", reason: "stale" } }
  }
  function heldAgree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult> {
    if (!agreementOrigin(origin) || !input || typeof input !== "object" || Array.isArray(input) ||
      Reflect.ownKeys(input).length !== 4 || Reflect.ownKeys(input).some(key => typeof key !== "string" || !["review", "displayedVersion", "choice", "access"].includes(key) || !("value" in (Object.getOwnPropertyDescriptor(input, key) ?? {})))) return Promise.resolve({ kind: "refused", reason: "invalid" })
    const capture = agreementReviews.get(input.review), choice = parseAgreementChoice(input.choice), version = input.displayedVersion
    if (!capture || capture.consumed || !sameSyncJson(origin, capture.origin)) return Promise.resolve({ kind: "unavailable", reason: "stale" })
    capture.consumed = true
    if (choice.kind !== "disclosure") return Promise.resolve({ kind: "unavailable", reason: "consent-held" })
    return enqueue(async () => {
      try {
        const records = await heldObservation()
        if (!records || capture.revision !== agreementRevision || !sameSyncJson(records, capture.records)) return { kind: "unavailable", reason: "stale" }
        const read = readConsentDevice(records)
        if (read.kind !== "supported" || !read.control) return { kind: "unavailable", reason: "consent-held" }
        if (version !== CONSENT_VERSION) return { kind: "unavailable", reason: "newer-consent" }
        const items = agreementItems(read, deps.now())
        if (!items || !isJsonObject(items.device.consent)) return { kind: "unavailable", reason: "consent-held" }
        const consent = readConsentDevice({ schema: records.schema!, ...items })
        if (consent.kind !== "supported" || !consent.device.consent) return { kind: "unavailable", reason: "consent-held" }
        if (disposed()) return { kind: "unavailable", reason: "disposed" }
        let write: AgreementWrite = { kind: "resolved" }
        try { await storage.set(items) } catch (error) { write = { kind: "rejected", error } }
        let after
        try { after = await local.get(null) } catch (error) { return { kind: "unconfirmed", stage: "consent-only", write, cause: { kind: "read-failed", error } } }
        if (disposed()) return { kind: "unconfirmed", stage: "consent-only", write, cause: { kind: "stopped" } }
        if (!isJsonObject(after) || !sameSyncJson({ ...records, ...items }, after)) {
          if (write.kind === "rejected" && isJsonObject(after) && sameSyncJson(records, after)) return { kind: "failed", stage: "consent-only", write }
          return { kind: "unconfirmed", stage: "consent-only", write, cause: { kind: "readback" } }
        }
        return { kind: "committed", consent: consent.device.consent, settingsChanged: false, applications: [], blocked: [], mutations: [{ stage: "consent-only", write }], activation: "held" }
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    })
  }
  function confirmRetainedAgreementInLane(permit: ExactRetainedAgreementPermit): Promise<RetainedAgreementRecoveryExecution> {
    return executeExactRetainedAgreement(permit, {
      async setLedger(ledger) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [consentJobsKey]: ledger }) },
      async setConfirmed(record) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [interimConversionKey]: agreementJson(record) }) }
    })
  }
  const consentRecovery = createConsentRecovery({
    async executeKeySettings(expected) {
      keyExecution?.revoke()
      if (disposed() || importPending || featurePending || resetPending || retainedHold(expected) || canonical.kind === "lost") return { kind: "unavailable", reason: "stale" }
      if (canonical.kind === "active" && !(await canonicalCurrent(await storage.get(null)))) return { kind: "unavailable", reason: "stale" }
      const current = await storage.get(null)
      if (!isJsonObject(current) || !sameSyncJson(current, expected)) return { kind: "unavailable", reason: "stale" }
      const original = readKeySettingsProgress(expected[keySettingsProgressKey])
      if (original.kind !== "valid" || original.record.state !== "accepted") return { kind: "unavailable", reason: "stale" }
      const consent = readConsentDevice(expected)
      if (consent.kind !== "supported" || !consent.device.consent || consent.control && consent.control.state.kind !== "agreed") return { kind: "unavailable", reason: "startup" }
      const binding = { device: cacheDeviceAuthority(expected.device), state: expected["consent:state"] ?? null }
      const exact: LocalWriteStorage = {
        get: keys => storage.get(keys),
        async set(items) {
          const before = await storage.get(null)
          if (disposed() || !isJsonObject(before) || !sameSyncJson(binding, { device: cacheDeviceAuthority(before.device), state: before["consent:state"] ?? null }) ||
            canonical.kind === "active" && !(await canonicalCurrent(before))) throw Error("Key cleanup authority changed")
          if (Object.keys(items).some(name => name !== keySettingsProgressKey && name !== "sync" && !name.startsWith("doc:"))) throw Error("Key cleanup cannot write account authority")
          await storage.set(items)
        }
      }
      inKeyExecution = true
      try {
        const result = await recoverKeySettings({ local: exact, stopped: disposed }, expected, async record => {
          let history = record.before.sync
          if (consent.device.syncOn) {
            const remote = await sync.get()
            for (const name of Object.keys(remote)) {
              if (!name.startsWith("s:setup:")) continue
              const key = parseDocumentKey(`doc:${name.slice(2)}`)
              if (key?.kind === "setup" && !Object.hasOwn(record.before, documentKey(key))) return false
            }
            const documents = Object.entries(record.effect).flatMap(([name, document]) => {
              const key = parseDocumentKey(name)
              return key && (key.kind === "settings" || key.kind === "setup") && isJsonObject(document) ? [{ key, document }] : []
            })
            const first = documents[0]
            if (!first) return false
            const admission = planSyncWrite({ local: { ...record.before, device: expected.device! }, sync: remote,
              intent: { kind: "changed-batch", documents: [first, ...documents.slice(1)] } })
            if (admission.kind === "unavailable" || admission.kind === "refused") return false
            if (admission.kind === "planned") {
              if (!isJsonObject(history)) return false
              history = repairedHistory(history, admission.repairs) ?? history
            }
          }
          const patch = prepareFirstEditHistory({ history: Object.hasOwn(record.before, "sync") ? { kind: "present", raw: history } : { kind: "absent" }, syncOn: consent.device.syncOn })
          if (patch.kind === "unavailable") return false
          const desired = patch.kind === "set" ? patch.sync : history
          return desired !== undefined && sameSyncJson(desired, record.effect.sync ?? record.before.sync!)
        })
        if (result.kind === "committed") {
          keyPending = false
          const events: (SettingsEvent | SetupEvent)[] = [{ kind: "settings-changed", source: "local" },
            ...keySettingsAccounts(original.record).map(acct => ({ kind: "setup-changed", source: "local", acct } satisfies SetupEvent))]
          for (const event of events) {
            for (const listener of [...viewListeners]) { try { listener(event) } catch {} }
            for (const listener of [...listeners]) { try { listener(event) } catch {} }
          }
        }
        return result
      } finally { inKeyExecution = false }
    },
    async executeFeatureSettings(expected) {
      if (disposed() || importPending || resetPending || retainedHold(expected) || canonical.kind === "lost") return { kind: "unavailable", reason: "stale" }
      if (canonical.kind === "active" && !(await canonicalCurrent(await storage.get(null)))) return { kind: "unavailable", reason: "stale" }
      const current = await storage.get(null)
      if (!isJsonObject(current) || !sameSyncJson(current, expected)) return { kind: "unavailable", reason: "stale" }
      const agreement = readConsentDevice(expected)
      if (agreement.kind !== "supported" || !agreement.device.consent || agreement.control && agreement.control.state.kind !== "agreed") return { kind: "unavailable", reason: "startup" }
      const consent = { device: cacheDeviceAuthority(expected.device), state: expected["consent:state"] ?? null }
      const exact: LocalWriteStorage = {
        get: keys => storage.get(keys),
        async set(items) {
          const before = await storage.get(null)
          if (disposed() || !isJsonObject(before) || !sameSyncJson(consent, { device: cacheDeviceAuthority(before.device), state: before["consent:state"] ?? null }) ||
            canonical.kind === "active" && !(await canonicalCurrent(before))) throw Error("Feature cleanup authority changed")
          await storage.set(items)
        }
      }
      inFeatureExecution = true
      try {
        const result = await recoverFeatureProgress({ local: exact, stopped: disposed }, expected)
        if (result.kind === "committed") {
          featurePending = false
          // Recovery publishes a confirmed fact. Startup readiness remains held until reconstruction.
          for (const listener of [...viewListeners]) { try { listener({ kind: "settings-changed", source: "local" }) } catch {} }
          for (const listener of [...listeners]) { try { listener({ kind: "settings-changed", source: "local" }) } catch {} }
        }
        return result
      } finally { inFeatureExecution = false }
    },
    async executeSyncReset(input) {
      if (disposed() || importPending || keyPending || featurePending || canonical.kind !== "inactive" && !await canonicalCurrent(await storage.get(null)))
        return { kind: "reset-held", reason: "authority" }
      if (classifyRetainedAuthority(input.current).kind === "canonical-archive" && canonical.kind !== "active") return { kind: "reset-held", reason: "authority" }
      const authorized = await authorizeReceivedResetRecovery({ local: storage, ...input, stopped: disposed })
      if (authorized !== "authorized") return { kind: "reset-held", reason: "authority" }
      protocolHeld = false
      protocolClassified = true
      return receiveResetInLane()
    },
    executeSettingsImport: permit => importExecution ? importTask(() => importExecution.recover(permit)) : Promise.resolve({ kind: "unavailable", reason: "cleanup-host" }),
    filterRecovery: {
      host: deps.recovery ?? { kind: "unavailable" },
      readSync: permit => readExactFilterSync(permit, async () => { if (disposed()) throw new Error("Writer disposed"); const raw = await deps.sync.get(); if (disposed()) throw new Error("Writer disposed"); return raw }),
      execute: permit => executeExactRetainedFilter(permit, {
        async setFilter(effect) {
          if (disposed()) throw new Error("Writer disposed")
          const items: JsonObject = { [documentKey(effect.key)]: effect.after }
          if (effect.history.after.kind === "present") items.sync = effect.history.after.raw
          await storage.set(items)
        },
        async setLedger(ledger) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [consentJobsKey]: ledger }) },
        async setCompleted(record) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [interimConversionKey]: record }) }
      })
    },
    onFilterUncertainty: agreementBarrier,
    playlistRecovery: {
      host: deps.recovery ?? { kind: "unavailable" },
      readSync: permit => readExactPlaylistSync(permit, async () => { if (disposed()) throw new Error("Writer disposed"); const raw = await deps.sync.get(); if (disposed()) throw new Error("Writer disposed"); return raw }),
      execute: permit => executeExactRetainedPlaylist(permit, {
        async setPlaylist(effect) {
          if (disposed()) throw new Error("Writer disposed")
          const items: JsonObject = { [documentKey(effect.key)]: effect.after }
          if (effect.history.after.kind === "present") items.sync = effect.history.after.raw
          await storage.set(items)
        },
        async setLedger(ledger) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [consentJobsKey]: ledger }) },
        async setCompleted(record) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [interimConversionKey]: record }) }
      })
    },
    onPlaylistUncertainty: agreementBarrier,
    observeRetainedAgreement: () => startup?.readInterimSnapshot() ?? Promise.resolve(undefined),
    executeRetainedAgreement: confirmRetainedAgreementInLane,
    executeRetainedV1Acceptance: permit => executeExactRetainedV1Acceptance(permit, {
      async setAccepted(batch) { if (disposed()) throw new Error("Writer disposed"); await storage.set(agreementJson(batch)) }
    }),
    executeRetainedInstallation: permit => executeExactRetainedInstallation(permit, {
      async setDocuments(effect) {
        if (disposed()) throw new Error("Writer disposed")
        const items: JsonObject = Object.fromEntries([...effect.documents.map(x => [x.path, x.document]), ...effect.caches.map(x => [x.path, x.data])])
        if (effect.schema.kind === "set") items.schema = effect.schema.value
        await storage.set(items)
      },
      async setLedger(ledger) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [consentJobsKey]: ledger }) },
      async setInstalled(record) { if (disposed()) throw new Error("Writer disposed"); await storage.set({ [interimConversionKey]: agreementJson(record) }) }
    }),
    executeRetainedInstallationAcceptance: permit => executeExactRetainedInstallationAcceptance(permit, {
      async setAccepted(batch) { if (disposed()) throw new Error("Writer disposed"); await storage.set(agreementJson(batch)) }
    }),
    onRetainedInstallationUncertainty: agreementBarrier,
    onRetainedV1Uncertainty: agreementBarrier,
    observe: () => local.get(null), revision: () => agreementRevision, stopped: disposed,
    async set(items) { if (disposed()) throw new Error("Writer disposed"); await storage.set(items) },
    async execute(permit) {
      const exactLocal: LocalWriteStorage = {
        get: keys => local.get(keys),
        async set(items) { if (disposed()) throw new Error("Writer disposed"); await storage.set(items) }
      }
      const exactRemoval: AccountRemovalHost = removalPort.kind === "unavailable" ? removalPort : { ...removalPort,
        async removeLocal(keys) { if (disposed()) throw new Error("Writer disposed"); await removalPort.removeLocal(keys) },
        session: { get: () => removalPort.session.get(), async set(items) { if (disposed()) throw new Error("Writer disposed"); await removalPort.session.set(items) },
          async remove(keys) { if (disposed()) throw new Error("Writer disposed"); await removalPort.session.remove(keys) } }
      }
      sessionRevision++
      return resumePendingAccountRemoval({ ...removalDependencies, local: exactLocal, host: exactRemoval,
        sync: { async get() { if (disposed()) throw new Error("Writer disposed"); const raw = await deps.sync.get(); if (disposed()) throw new Error("Writer disposed"); return raw } },
        authority: records => authority(records), recoveryPermit: permit })
    }
  })

  function clock() {
    const mono = deps.syncClock.now(), wall = deps.syncClock.wallNow()
    if (!Number.isFinite(mono) || mono < mutationPace.lastMonotonic || mono < 0 || mono + 60000 > Number.MAX_SAFE_INTEGER) mutationPace.invalid = true
    if (mutationPace.invalid || !Number.isSafeInteger(wall) || wall < 0 || !Number.isSafeInteger(wall + 60000)) return
    mutationPace.lastMonotonic = mono
    return { mono, wall }
  }

  function ingress(kind: SyncEvent["kind"]): SyncEvent | undefined {
    const time = clock()
    return time ? { kind, ...time, epoch } : undefined
  }

  function admitted(event: SyncEvent | undefined, time: { mono: number; wall: number }) {
    return event !== undefined && event.epoch === epoch && (!hold ||
      event.mono >= hold.mono && event.wall >= hold.wall && time.mono >= hold.mono && time.wall >= hold.wall)
  }

  function recoveryDeferral(time: { mono: number; wall: number }): SyncFlushResult {
    const notBefore = Math.max(mutationPace.nextInvocation, quietUntil, hold?.mono ?? 0,
      time.mono + Math.max(0, (hold?.wall ?? 0) - time.wall))
    return Number.isFinite(notBefore) && notBefore <= Number.MAX_SAFE_INTEGER
      ? { kind: "deferred", notBefore } : { kind: "unavailable" }
  }

  async function loadRecovery(records: JsonObject): Promise<JsonObject | undefined> {
    const raw = records.sync
    if (!isJsonObject(raw)) return
    const gate = decodeSyncState(raw).opaqueWrite?.gate
    if (!gate || observedGate !== undefined && sameSyncJson(gate, observedGate)) return records
    const time = clock()
    if (!time) return
    epoch++
    cancelTicket()
    const floor = Math.max(time.mono + 60000, time.mono + Math.max(0, gate.notBefore - time.wall))
    if (!Number.isFinite(floor) || floor > Number.MAX_SAFE_INTEGER) { mutationPace.invalid = true; return }
    hold = { mono: floor, wall: gate.notBefore }
    if (gate.kind === "pending") {
      const next = recoveryHistory(raw, { kind: "held", notBefore: Math.max(gate.notBefore, time.wall + 60000) })
      const expected = { ...snapshot(records), sync: next }
      await local.set({ sync: next })
      const confirmed = await local.get(null)
      if (disposed() || !isJsonObject(confirmed) || !sameSyncJson(expected, confirmed)) return
      hold.wall = Math.max(hold.wall, time.wall + 60000)
      observedGate = isJsonObject(next.opaqueWrite) ? next.opaqueWrite.gate : undefined
      return expected
    }
    observedGate = { ...gate }
    return records
  }

  function settingsFileUnavailable(): SettingsFileUnavailable | undefined {
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (importPending || featurePending || keyPending || resetPending) return { kind: "unavailable", reason: "pending-recovery" }
    if (claimConfirmation === "unconfirmed" || canonical.kind === "lost") return { kind: "unavailable", reason: "stale" }
    if (initialization === "newer-layout") return { kind: "unavailable", reason: "newer-layout" }
    if (joinHeld || initialization === "pending-join" || initialization === "interim-held" ||
      canonical.kind === "active" && (protocolHeld || canonical.checkpoint.pending.kind !== "none")) return { kind: "unavailable", reason: "pending-recovery" }
    if (lifetime.kind === "stopped") return { kind: "unavailable", reason: "stale" }
    if (initialization !== "ok" && initialization !== "consent-held") return { kind: "unavailable", reason: "startup" }
  }

  function readSettingsFileInLane(): ReturnType<SettingsFileOwner["exportSettings"]> {
    let binding: JsonObject | undefined
    return readSettingsFile({
      local: rawLocal,
      unavailable: settingsFileUnavailable,
      unavailableRecords(records) {
        if (!isJsonObject(records)) return { kind: "unavailable", reason: "invalid-document" }
        if (retainedHold(records) || importPending || featurePending || keyPending || resetPending || Object.hasOwn(records, receivedResetKey) || Object.hasOwn(records, pendingAccountRemovalKey) ||
          (protocolHeld || Object.hasOwn(records, consentJobsKey)) && classifyConsentWork(records).length > 0) return { kind: "unavailable", reason: "pending-recovery" }
        const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
        if (join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")) return { kind: "unavailable", reason: "pending-recovery" }
        const current = { device: records.device ?? null, consent: records["consent:state"] ?? null }
        if (binding && !sameSyncJson(binding, current)) return { kind: "unavailable", reason: "stale" }
        binding = structuredClone(current)
      }
    })
  }

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const work = lane.then(run)
    lane = work.then(() => {}, () => {})
    return work
  }

  function emitSettings(source: SettingsEvent["source"]) {
    emit({ kind: "settings-changed", source })
  }

  function revokeViews() {
    keyExecution?.revoke()
    viewListeners.clear()
    const stops = [...viewRevocations]
    viewRevocations.clear()
    for (const stop of stops) { try { stop() } catch {} }
  }
  function sameViewValue(left: unknown, right: unknown): boolean {
    return isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right)
  }
  function emitView(event: ConfirmedViewChange) {
    for (const listener of [...viewListeners]) {
      if (disposed() || protocolHeld || claimConfirmation === "unconfirmed") break
      if (!viewListeners.has(listener)) continue
      try { void Promise.resolve(listener(event)).catch(() => {}) } catch {}
    }
  }

  function emit(event: SettingsEvent | SetupEvent, publishView = true) {
    if (publishView) emitView(event)
    for (const listener of [...listeners]) {
      if (disposed() || protocolHeld) break
      if (!listeners.has(listener)) continue
      try { void Promise.resolve(listener(event)).catch(() => {}) } catch {}
    }
  }

  function cancelTicket() {
    ticket?.cancel()
    ticket = undefined
  }

  function deactivate(kind: "inactive" | "stopped" | "disposed") {
    cancelTicket()
    if (kind === "stopped" || kind === "disposed") revokeViews()
    if (lifetime.kind === "active") lifetime.unsubscribe()
    if (lifetime.kind !== "disposed" && (lifetime.kind !== "stopped" || kind === "disposed")) lifetime = { kind }
  }

  function arm(notBefore: number, event: SyncEvent | undefined) {
    if (lifetime.kind !== "active") return
    cancelTicket()
    const time = clock()
    if (!time || !admitted(event, time)) return
    const milliseconds = Math.max(0, notBefore - time.mono)
    if (milliseconds > 25000) return
    if (!event) return
    const current = { event, cancel: () => {} }
    ticket = current
    current.cancel = deps.syncClock.after(milliseconds, () => {
      void enqueue(async () => {
        if (ticket !== current || lifetime.kind !== "active") return
        ticket = undefined
        await automatic(current.event, false)
      })
    })
  }

  async function automatic(event: SyncEvent | undefined, followup = true) {
    if (lifetime.kind !== "active") return
    let result: SyncAutomaticResult
    try {
      if (followup && (event?.kind === "start" || event?.kind === "sync") && deps.resetReceive) {
        const reset = await receiveResetInLane()
        if (reset.kind !== "ordinary") {
          if (reset.kind === "reset-held") deactivate("stopped")
          if (!disposed() && !protocolHeld) deps.onSyncResult(reset)
          return
        }
      }
      const incoming = followup && (event?.kind === "start" || event?.kind === "sync") ? await receiveIncomingDocuments() : undefined
      if (incoming) result = incoming
      else {
        if (lifetime.kind !== "active") return
        result = await attempt(event)
      }
    } catch (error) { result = { kind: "rejected", error } }
    if (result.kind === "rejected") deactivate("stopped")
    else if (followup && result.kind === "deferred") arm(result.notBefore, event)
    if (result.kind !== "deferred") cancelTicket()
    if (!disposed() && !protocolHeld) deps.onSyncResult(result)
  }

  async function receiveAttempt(key: SyncReceiveKey): Promise<SyncReceiveResult> {
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "authority" }
    try {
      const result = await receive(key)
      if (result.kind === "local-set-failed" || result.kind === "cleanup-failed" || result.kind === "unconfirmed") deactivate("stopped")
      if (key.kind === "settings" && result.kind === "adopted") emit({ kind: "settings-changed", source: "sync" }, false)
      if (key.kind === "setup" && result.kind === "adopted") { invalidateAccountSession(key.acct); emit({ kind: "setup-changed", source: "sync", acct: key.acct }, false) }
      return result
    } catch (error) { deactivate("stopped"); throw error }
  }

  async function receiveIncomingDocuments(): Promise<SyncAutomaticResult | undefined> {
    if (lifetime.kind !== "active") return
    const records = await (joinHeld ? local : guardedLocal).get(null)
    if (retainedHold(records)) return { kind: "unavailable" }
    const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    if (checkpoint.kind === "valid" && (checkpoint.checkpoint.phase === "outbound" || checkpoint.checkpoint.phase === "choice")) {
      const remote = await readJoinSync()
      if (isJsonObject(records) && isJsonObject(remote) && await signalJoinHistory(records, remote)) return { kind: "unavailable" }
      return checkpoint.checkpoint.phase === "choice" ? { kind: "unavailable" } : undefined
    }
    if (checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "off")) return { kind: "unavailable" }
    if (lifetime.kind !== "active") return
    const ready = authority(records)
    if (ready.kind !== "ready") return { kind: "unavailable" }
    observeOff(ready.device.syncOn)
    if (!ready.device.syncOn) return
    if (retainedHold(records)) return { kind: "unavailable" }
    const targets: SyncReceiveKey[] = []
    for (const name of Object.keys(records).sort()) {
      const key = parseDocumentKey(name)
      if ((key?.kind === "settings" || key?.kind === "filter" || key?.kind === "setup") && documentKey(key) === name) targets.push(key)
    }
    if (targets.length === 0 && isJsonObject(records)) {
      const remote = await readJoinSync()
      if (isJsonObject(remote) && await signalJoinHistory(records, remote)) return { kind: "unavailable" }
    }
    // Filters sort before their Setup, so a Setup that removes or restores its account revisits that account's Filters once.
    const removed = (raw: unknown) => isJsonObject(raw) && raw.deleted === true
    const queue = [...targets]
    for (let index = 0; index < queue.length; index++) {
      const key = queue[index]!
      if (lifetime.kind !== "active") return
      const result = await receiveAttempt(key)
      if (key.kind === "setup" && result.kind === "adopted" && removed(result.received.document) !== removed(records[documentKey(key)])) {
        queue.push(...targets.filter(target => target.kind === "filter" && target.acct === key.acct))
      }
      if (result.kind === "local-set-failed" || result.kind === "cleanup-failed") return { kind: "rejected", error: result.error }
      if (result.kind === "unconfirmed") return result.cause.kind === "read-failed"
        ? { kind: "rejected", error: result.cause.error } : { kind: "unavailable" }
      if (lifetime.kind !== "active") return
      if (result.kind === "unavailable" && (result.reason === "authority" || result.reason === "history")) {
        if (result.reason === "authority") {
          const current = authority(await guardedLocal.get(null))
          if (current.kind === "ready") observeOff(current.device.syncOn)
        }
        return { kind: "unavailable" }
      }
    }
    return await expireTombstones(records)
  }

  // The local turn of G18's expiry. The synced copies go later, in a cleanup opportunity of the outbound attempt.
  async function expireTombstones(pass: Readonly<Record<string, unknown>>): Promise<SyncAutomaticResult | undefined> {
    if (removal.kind === "unavailable" || lifetime.kind !== "active") return
    const time = clock()
    if (!time || !hasExpiryCandidate({ local: pass, wall: time.wall })) return
    const records = await guardedLocal.get(null), ready = authority(records)
    if (disposed() || ready.kind !== "ready" || !ready.device.syncOn || !ready.history || retainedHold(records) || !isJsonObject(records)) return
    const remote = await readJoinSync()
    if (disposed() || !isJsonObject(remote)) return
    const plan = planLocalTombstoneExpiry({ local: records, sync: remote, wall: time.wall })
    if (plan.pushed.length === 0) return
    const baseline = snapshot(records), remaining = snapshot(records)
    for (const key of plan.documents) delete remaining[documentKey(key)]
    const history = withoutPushed(snapshot(ready.history.raw), plan.pushed)
    try {
      const current = await guardedLocal.get(null), latest = await sync.get()
      if (disposed() || !isJsonObject(current) || !sameSyncJson(baseline, current) || !isJsonObject(latest) || !sameSyncJson(remote, latest)) return { kind: "unavailable" }
      // Documents go before their pushed entries, so a restart in between leaves entries the next pass recognizes and drops.
      if (plan.documents.length > 0) {
        await removal.removeLocal(plan.documents.map(key => ({ kind: "document", key })))
        const removed = await guardedLocal.get(null)
        if (disposed() || !isJsonObject(removed) || !sameSyncJson(remaining, removed)) { deactivate("stopped"); return { kind: "unavailable" } }
      }
      await guardedLocal.set({ sync: history })
      const confirmed = await guardedLocal.get(null)
      if (disposed() || !isJsonObject(confirmed) || !sameSyncJson({ ...remaining, sync: history }, confirmed)) { deactivate("stopped"); return { kind: "unavailable" } }
    } catch (error) {
      deactivate("stopped")
      return { kind: "rejected", error }
    }
  }

  // G18's cleanup turn: one paced remove of expired synced tombstones this browser no longer holds, never in a push's opportunity.
  async function cleanExpiredTombstones(event: SyncEvent | undefined, records: JsonObject, remote: JsonObject): Promise<SyncFlushResult> {
    const port = deps.sync
    if (!port.remove || event?.kind !== "start" && event?.kind !== "sync") return { kind: "idle" }
    const time = clock()
    if (!time) return { kind: "unavailable" }
    const keys = planSyncTombstoneCleanup({ local: records, sync: remote, wall: time.wall })
    if (keys.length === 0) return { kind: "idle" }
    if (!admitted(event, time)) return { kind: "unavailable" }
    const notBefore = Math.max(quietUntil, mutationPace.nextInvocation)
    if (time.mono < notBefore) return { kind: "deferred", notBefore }
    const current = await guardedLocal.get(null), latest = await sync.get()
    if (disposed() || !isJsonObject(current) || !sameSyncJson(records, current) || !isJsonObject(latest) || !sameSyncJson(remote, latest)) return { kind: "unavailable" }
    const invoked = clock()
    if (!invoked || !admitted(event, invoked)) return { kind: "unavailable" }
    if (invoked.mono < notBefore) return { kind: "deferred", notBefore }
    cancelTicket()
    mutationPace.nextInvocation = invoked.mono + 5000
    await assertExternalAuthority()
    await port.remove(keys)
    const after = await sync.get()
    if (disposed() || !isJsonObject(after) || keys.some(key => Object.hasOwn(after, key))) return { kind: "unavailable" }
    return { kind: "cleaned", removed: keys }
  }

  async function attempt(event: SyncEvent | undefined): Promise<SyncFlushResult> {
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable" }
    let result: SyncFlushResult
    try { result = await flush(event) } catch (error) { deactivate("stopped"); throw error }
    if (result.kind === "acknowledgement-failed" || result.kind === "unconfirmed") deactivate("stopped")
    if (result.kind !== "deferred") cancelTicket()
    return result
  }

  function observeOff(syncOn: boolean) {
    if (!syncOn) deactivate("inactive")
  }

  function disposed() { return lifetime.kind === "disposed" }

  async function receiveResetInLane(): Promise<ReceivedResetResult> {
    if (lifetime.kind === "disposed" || protocolHeld || importPending) return { kind: "reset-held", reason: "authority" }
    inResetExecution = true
    try {
      const host = deps.resetReceive ?? { kind: "unavailable" }
      const reset = await receiveDeliberateReset({
        local: rawLocal, host: host.kind === "available" ? {
          ...host,
          async removeLocal(names) { await assertExternalAuthority(); await host.removeLocal(names) },
          session: fencedSession(host.session)
        } : host,
        remote: () => sync.get(), stopped: () => lifetime.kind === "disposed" || protocolHeld,
        revoke(accounts) {
          resetPending = true
          cancelTicket()
          agreementRevision++
          keyExecution?.revoke()
          for (const acct of accounts) invalidateAccountSession(acct)
          autoAddCaptures.clear()
        }
      })
      resetPending = Object.hasOwn(await storage.get([receivedResetKey]), receivedResetKey)
      if (reset.kind === "reset-held" && resetPending) { initialization = "consent-held"; revokeViews() }
      if (reset.kind === "reset-received" && !protocolHeld) initialization = "ok"
      if (reset.kind === "reset-received") {
        emit({ kind: "settings-changed", source: "sync" }, false)
        emitView({ kind: "settings-changed", source: "sync" })
        for (const acct of reset.accounts) publishRemoval(acct, "sync")
      }
      return reset
    } finally { inResetExecution = false }
  }

  async function execute(change: LocalFilterChange, at: number, event: SyncEvent | undefined): Promise<LocalFilterWriteResult> {
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
    const invalid = { kind: "result", result: { refused: "invalid" } } as const
    const ok = { kind: "result", result: { ok: true } } as const
    const setupKey = documentKey({ kind: "setup", acct: change.acct })
    const filterKey = documentKey({ kind: "filter", acct: change.acct, playlist: change.playlist })
    const initial = await guardedLocal.get(["schema", "device", "sync", setupKey, filterKey])
    if (disposed()) return { kind: "unavailable", reason: "stale" }
    const initialAuthority = authority(initial)
    if (initialAuthority.kind !== "ready") return initialAuthority
    if (!isJsonObject(initial[setupKey])) return { kind: "unavailable", reason: "account-context" }
    if (Object.hasOwn(initial, filterKey) && !isJsonValue(initial[filterKey])) return invalid
    if (!isJsonObject(initial)) return initialAuthority.device.syncOn ? { kind: "unavailable", reason: "sync-writer-required" } : invalid
    let records = snapshot(initial)
    let exhaustive = false
    for (;;) {
      const ready = authority(records)
      if (ready.kind === "unavailable") return ready
      const { device, history } = ready
      observeOff(device.syncOn)

      const rawSetup = records[setupKey]
      if (!isJsonObject(rawSetup)) return { kind: "unavailable", reason: "account-context" }
      try {
        const setup = decodeDocument(rawSetup, decodeSetup)
        if (setup.kind !== "value" || !setup.document.data.autoAdd.some(entry => entry.pl === change.playlist)) {
          return { kind: "unavailable", reason: "account-context" }
        }
      } catch (error) {
        if (error instanceof DecodeError) return { kind: "unavailable", reason: "account-context" }
        throw error
      }

      const rawFilter = records[filterKey]
      if (Object.hasOwn(records, filterKey) && !isJsonValue(rawFilter)) return invalid
      let filter
      try { filter = decodeDocument(rawFilter, decodeFilter) } catch (error) {
        if (error instanceof DecodeError) return invalid
        throw error
      }
      if (filter.kind === "newer-version") return { kind: "result", result: { refused: "update-needed" } }
      if (device.syncOn) {
        if (!exhaustive) {
          const complete = await guardedLocal.get(null)
          if (disposed()) return { kind: "unavailable", reason: "stale" }
          if (Object.hasOwn(complete, filterKey) && !isJsonValue(complete[filterKey])) return invalid
          if (!isJsonObject(complete)) return device.syncOn ? { kind: "unavailable", reason: "sync-writer-required" } : invalid
          records = snapshot(complete)
          exhaustive = true
          continue
        }
      }

      const current = filter.kind === "value" ? filter.document.data : undefined
      const result = changeFilterSetting({ current, desired: change.desired, clearListedChannels: change.clearListedChannels })
      if (result.kind === "unchanged") {
        if (!device.syncOn) return ok
        const admission = planSyncWrite({ local: records, sync: await sync.get(),
          intent: { kind: "unchanged", key: { kind: "filter", acct: change.acct, playlist: change.playlist } } })
        if (admission.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
        return admission.kind === "refused" ? { kind: "result", result: { refused: admission.reason } } : ok
      }
      if (result.kind === "confirmation-required") return invalid
      if (filter.kind === "value" && current && current.mode !== change.desired.mode && current.channels.length > 0 &&
        (change.clearListedChannels !== "confirmed" || change.expectedGeneration !== filter.document.gen)) return invalid

      if (!exhaustive) {
        const complete = await guardedLocal.get(null)
        if (disposed()) return { kind: "unavailable", reason: "stale" }
        if (!isJsonObject(complete)) return device.syncOn ? { kind: "unavailable", reason: "sync-writer-required" } : invalid
        records = snapshot(complete)
        exhaustive = true
        continue
      }
      const prepared = prepareDocumentBody({ kind: "filter", data: result.filter })
      if (prepared.kind !== "prepared") return invalid
      const envelope = {
        ...(isJsonObject(rawFilter) ? rawFilter : {}),
        v: DOCUMENT_VERSION, gen: deps.generation(), at, by: device.id, data: prepared.data
      }
      if ("deleted" in envelope) delete envelope.deleted
      if (!isJsonObject(envelope)) throw new TypeError("Writer produced a non-JSON envelope")
      if (decodeDocument(envelope, decodeFilter).kind !== "value") throw new TypeError("Writer produced an unsupported Filter")
      const items: Record<string, JsonObject> = { [filterKey]: envelope }
      if (device.syncOn) {
        const admission = planSyncWrite({ local: records, sync: await sync.get(), intent: {
          kind: "changed", key: { kind: "filter", acct: change.acct, playlist: change.playlist }, document: envelope
        } })
        if (admission.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
        if (admission.kind === "refused") return { kind: "result", result: { refused: admission.reason } }
        if (admission.kind === "planned" && history) {
          const repaired = repairedHistory(history.raw, admission.repairs)
          if (repaired) items.sync = repaired
        }
      }
      const effective = items.sync ?? history?.raw
      const patch = prepareFirstEditHistory({ history: effective === undefined ? { kind: "absent" } : { kind: "present", raw: effective }, syncOn: device.syncOn })
      if (patch.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
      if (patch.kind === "set") items.sync = patch.sync
      if (disposed()) return { kind: "unavailable", reason: "stale" }
      const before = await guardedLocal.get(null)
      if (disposed()) return { kind: "unavailable", reason: "stale" }
      if (!isJsonObject(before) || !sameSyncJson(records, before)) return { kind: "unavailable", reason: "stale" }
      const expected = snapshot({ ...records, ...items })
      function uncertain(cause: Extract<LocalFilterWriteResult, { kind: "unconfirmed" }>["cause"]): LocalFilterWriteResult {
        claimConfirmation = "unconfirmed"
        deactivate("stopped")
        return { kind: "unconfirmed", cause }
      }
      try { await guardedLocal.set(items) } catch (error) {
        uncertain({ kind: "readback" })
        throw error
      }
      try {
        const confirmed = await guardedLocal.get(null)
        if (disposed()) return uncertain({ kind: "authority" })
        if (!isJsonObject(confirmed) || !sameSyncJson(expected, confirmed)) return uncertain({ kind: "readback" })
      } catch (error) { return uncertain({ kind: "read-failed", error }) }
      emitView({ kind: "filter-changed", source: "local", acct: change.acct, playlist: change.playlist })
      if (device.syncOn) {
        quietUntil = deps.syncClock.now() + 2000
        const gate = history && decodeSyncState(history.raw).opaqueWrite?.gate
        if (!gate || observedGate !== undefined) arm(Math.max(quietUntil, mutationPace.nextInvocation), event)
      }
      return ok
    }
  }

  function sameDocumentValue(key: SyncReceiveKey, before: JsonValue | undefined, after: JsonValue): boolean {
    try {
      if (key.kind === "settings") {
        const left = readSettingsView(before), right = readSettingsView(after)
        return left.kind === "value" && right.kind === "value" && sameViewValue(left.settings, right.settings)
      }
      const left = key.kind === "setup" ? decodeDocument(before, decodeSetup) : decodeDocument(before, decodeFilter)
      const right = key.kind === "setup" ? decodeDocument(after, decodeSetup) : decodeDocument(after, decodeFilter)
      if (left.kind === "value" && right.kind === "value") return sameViewValue(left.document.data, right.document.data)
      return (left.kind === "absent" || left.kind === "deleted") && (right.kind === "absent" || right.kind === "deleted")
    } catch { return false }
  }

  async function receive(key: SyncReceiveKey): Promise<SyncReceiveResult> {
    const unavailable = (reason: Extract<SyncReceiveResult, { kind: "unavailable" }>["reason"]) => ({ kind: "unavailable", reason } as const)
    const name = documentKey(key)
    function context(records: Readonly<Record<string, unknown>>) {
      const ready = authority(records)
      if (lifetime.kind === "disposed" || ready.kind !== "ready" || !ready.device.syncOn || !ready.history ||
        retainedHold(records)) return unavailable("authority")
      const raw = records[name]
      if (!Object.hasOwn(records, name) || !isJsonObject(raw)) return unavailable("document")
      let document
      try { document = key.kind === "settings" ? decodeDocument(raw, decodeSettings)
        : key.kind === "setup" ? decodeDocument(raw, decodeSetup) : decodeDocument(raw, decodeFilter) } catch (error) {
        if (error instanceof DecodeError) return unavailable("document")
        throw error
      }
      if (document.kind !== "value" && document.kind !== "deleted") return unavailable("document")
      const shared = { kind: "ready", device: ready.rawDevice, history: ready.history.raw, joined: ready.history.joined,
        raw, stamp: document.document, deleted: document.kind === "deleted" } as const
      if (key.kind === "settings") return { ...shared, selection: { kind: "settings" } } as const
      if (key.kind === "setup") return { ...shared, selection: { kind: "setup" } } as const
      const setupName = documentKey({ kind: "setup", acct: key.acct }), setup = records[setupName]
      if (!Object.hasOwn(records, setupName) || !isJsonObject(setup)) return unavailable("account-context")
      let removed
      try {
        const supported = decodeDocument(setup, decodeSetup)
        if (supported.kind !== "value" && supported.kind !== "deleted") return unavailable("account-context")
        removed = supported.kind === "deleted"
      } catch (error) {
        if (error instanceof DecodeError) return unavailable("account-context")
        throw error
      }
      return { ...shared, selection: { kind: "filter", setup, removed } } as const
    }
    function observation(records: Readonly<Record<string, unknown>>, joined: string | null) {
      if (records === null || typeof records !== "object" || Array.isArray(records) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(records)) || Reflect.ownKeys(records).some(key => {
          const descriptor = Object.getOwnPropertyDescriptor(records, key)
          return typeof key !== "string" || !descriptor || !("value" in descriptor) || !descriptor.enumerable
        })) return unavailable("document")
      const metadata = records["s:meta"]
      if (!Object.hasOwn(records, "s:meta") || !isJsonObject(metadata)) return unavailable("history")
      try {
        const meta = decodeSyncMeta(metadata)
        if (meta.v !== 1 || meta.id !== joined || meta.reset === true) return unavailable("history")
      } catch (error) {
        if (error instanceof DecodeError) return unavailable("history")
        throw error
      }
      const items = Object.entries(records).map(([key, value]) => ({ key, value }))
      const inventory = readSyncInventory({ items })
      if (inventory.kind !== "read") return unavailable("document")
      const candidate = inventory.documents.find(entry => entry.baseKey === `s:${name.slice(4)}`)?.result
      if (candidate?.kind === "deleted") return { kind: "ready", metadata, candidate } as const
      if (candidate?.kind !== "value" || candidate.value.kind !== key.kind) return unavailable("document")
      if (candidate.value.kind === "setup") {
        const setup = candidate.value.document.data
        if (!(setup.autoAdd.length > 0 || setup.quickSave !== null || setup.musicSave !== null || setup.gather !== null)) {
          return unavailable("account-context")
        }
      }
      return { kind: "ready", metadata, candidate } as const
    }
    const initial = context(await guardedLocal.get(null))
    if (initial.kind !== "ready") return initial
    if (initial.deleted && key.kind === "settings") return unavailable("document")
    const removedAccount = initial.selection.kind === "filter" && initial.selection.removed
    const baseline = { device: snapshot(initial.device), history: snapshot(initial.history), raw: snapshot(initial.raw),
      selection: initial.selection.kind === "filter" ? { kind: "filter", setup: snapshot(initial.selection.setup), removed: removedAccount } as const : initial.selection }
    const sameSelection = (current: typeof initial.selection) => current.kind !== "filter"
      ? baseline.selection.kind === current.kind
      : baseline.selection.kind === "filter" && sameSyncJson(current.setup, baseline.selection.setup)
    const unchanged = (current: ReturnType<typeof context>) => current.kind === "ready" &&
      sameSyncJson(current.device, baseline.device) && sameSyncJson(current.history, baseline.history) &&
      sameSelection(current.selection) && sameSyncJson(current.raw, baseline.raw)
    const observedRemote = await readJoinSync()
    const remote = observation(observedRemote, initial.joined)
    if (remote.kind === "unavailable" && remote.reason === "history" && isJsonObject(observedRemote)) {
      const records = await local.get(null)
      if (isJsonObject(records)) await signalJoinHistory(records, observedRemote)
    }
    if (disposed()) return unavailable("authority")
    if (remote.kind !== "ready") return remote
    // A removed Setup accepts only its Filters' tombstones. A live Setup takes a tombstone only through account cleanup.
    // A newer live Setup or Filter replaces a local tombstone, so an older edit is all a tombstone keeps out.
    const tombstone = remote.candidate.kind === "deleted"
    if (removedAccount && !tombstone) return unavailable("account-context")
    if (tombstone && (initial.deleted || !removedAccount && (key.kind !== "setup" || removal.kind === "unavailable"))) return unavailable("document")
    if (sameSyncJson(initial.raw, remote.candidate.json)) return { kind: "idle" }
    const history = decodeSyncState(initial.history)
    if (!Object.hasOwn(history.pushed, name) || history.pushed[name] !== initial.stamp.gen) return unavailable("pending")
    const incoming = remote.candidate.kind === "value" ? remote.candidate.value.document : remote.candidate.document
    if (incoming.gen === initial.stamp.gen || incoming.at <= initial.stamp.at) return unavailable("conflict")
    const metadata = snapshot(remote.metadata)
    const document = snapshot(remote.candidate.json)
    const received: SyncDocumentRecord = { key, name, gen: incoming.gen, document }
    const current = context(await guardedLocal.get(null))
    if (!unchanged(current)) return unavailable("authority")
    const preflight = observation(await sync.get(), initial.joined)
    if (disposed()) return unavailable("authority")
    if (preflight.kind !== "ready") return preflight
    if (!sameSyncJson(metadata, preflight.metadata)) return unavailable("history")
    if (!sameSyncJson(document, preflight.candidate.json)) return unavailable("document")
    const latestRecords = await guardedLocal.get(null), latest = context(latestRecords)
    if (latest.kind !== "ready" || !unchanged(latest)) return unavailable("authority")
    let clearsLastAccount = false
    if (tombstone && key.kind === "setup" && removal.kind !== "unavailable") {
      try { clearsLastAccount = decodeLastAccount(latestRecords) === key.acct } catch (error) {
        if (error instanceof DecodeError) return unavailable("account-context")
        throw error
      }
      const cleanup = await cleanReceivedSetupRemoval(key.acct, { host: removal, accepted: () => invalidateAccountSession(key.acct),
        async current() { const records = await guardedLocal.get(null); return unchanged(context(records)) ? records : undefined } })
      if (cleanup.kind === "session-layout") return unavailable("account-context")
      if (cleanup.kind === "rejected") return { kind: "cleanup-failed", received, error: cleanup.error }
      if (cleanup.kind === "unconfirmed") return { kind: "unconfirmed", received, cause: { kind: cleanup.cause } }
    }
    const next = repairedHistory(latest.history, [received])
    if (!next) throw new TypeError("Missing incoming acknowledgement")
    // The tombstone is the commit point, so the last account clears in the same set and a restart before it repeats both.
    try { await guardedLocal.set({ ...clearsLastAccount ? { [LAST_ACCOUNT_KEY]: null } : {}, [name]: document, sync: next }) } catch (error) {
      return { kind: "local-set-failed", received, error }
    }
    try {
      const records = await guardedLocal.get(null), post = context(records)
      if (post.kind === "unavailable" && post.reason === "authority" || disposed()) {
        return { kind: "unconfirmed", received, cause: { kind: "authority" } }
      }
      if (post.kind !== "ready" || post.joined !== initial.joined || !sameSyncJson(post.device, baseline.device) || !sameSelection(post.selection)) {
        return { kind: "unconfirmed", received, cause: { kind: post.kind === "ready" || post.reason === "account-context" ? "authority" : "readback" } }
      }
      if (!sameSyncJson(post.raw, document) || !sameSyncJson(post.history, next) || clearsLastAccount && records[LAST_ACCOUNT_KEY] !== null) {
        return { kind: "unconfirmed", received, cause: { kind: "readback" } }
      }
      const confirmed = observation(await sync.get(), initial.joined)
      if (disposed() || confirmed.kind === "unavailable" && confirmed.reason === "history" ||
        confirmed.kind === "ready" && !sameSyncJson(metadata, confirmed.metadata)) {
        return { kind: "unconfirmed", received, cause: { kind: "authority" } }
      }
      if (confirmed.kind !== "ready" || !sameSyncJson(document, confirmed.candidate.json)) {
        return { kind: "unconfirmed", received, cause: { kind: "readback" } }
      }
      const changed = !removedAccount && !sameDocumentValue(key, baseline.raw, document)
      if (changed) {
        if (key.kind === "settings") emitView({ kind: "settings-changed", source: "sync" })
        else if (key.kind === "setup") emitView(tombstone ? { kind: "account-removed", source: "sync", acct: key.acct } : { kind: "setup-changed", source: "sync", acct: key.acct })
        else emitView({ kind: "filter-changed", source: "sync", acct: key.acct, playlist: key.playlist })
      }
      return { kind: "adopted", received }
    } catch (error) {
      return { kind: "unconfirmed", received, cause: { kind: "read-failed", error } }
    }
  }


  async function flush(event: SyncEvent | undefined): Promise<SyncFlushResult> {
    let records = await (joinHeld ? local : guardedLocal).get(null)
    if (retainedHold(records)) return { kind: "unavailable" }
    const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "choice" && isJsonObject(records)) {
      const remote = await readJoinSync()
      if (isJsonObject(remote)) await signalJoinHistory(records, remote)
      return { kind: "unavailable" }
    }
    if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "outbound" && isJsonObject(records)) {
      const result = await flushJoin(event, records, checkpoint.checkpoint.debt)
      if (result.kind === "unconfirmed" || result.kind === "acknowledgement-failed") agreementBarrier()
      return result
    }
    if (checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "off")) return { kind: "unavailable" }
    let ready = authority(records)
    if (disposed() || ready.kind !== "ready") return { kind: "unavailable" }
    observeOff(ready.device.syncOn)
    if (!ready.device.syncOn) return { kind: "idle" }
    if (!isJsonObject(records)) return { kind: "unavailable" }
    const loaded = await loadRecovery(snapshot(records))
    if (!loaded || disposed()) return { kind: "unavailable" }
    records = loaded
    ready = authority(records)
    if (ready.kind !== "ready") return { kind: "unavailable" }
    const time = clock()
    if (!time) { cancelTicket(); return { kind: "unavailable" } }
    if (hold && !admitted(event, time)) { cancelTicket(); return recoveryDeferral(time) }
    const observedRemote = await readJoinSync()
    if (isJsonObject(records) && isJsonObject(observedRemote) && await signalJoinHistory(records, observedRemote)) return { kind: "unavailable" }
    let plan = planSyncWrite({ local: records, sync: observedRemote, intent: { kind: "flush" } })
    if (plan.kind === "refused") return plan.reason === "sync-full" ? { kind: "blocked" } : { kind: "unavailable" }
    if (plan.kind !== "planned") return { kind: "unavailable" }
    if (plan.sent.length + plan.repairs.length === 0 && isJsonObject(records) && isJsonObject(observedRemote)) {
      const cleanup = await cleanExpiredTombstones(event, records, observedRemote)
      if (cleanup.kind !== "idle") return cleanup
    }
    if (plan.sent.length === 0 && plan.repairs.length === 0) return { kind: "idle" }
    let prearmed: JsonObject | undefined
    if (plan.sent.length > 0) {
      const before = clock()
      if (!before || !admitted(event, before)) return { kind: "unavailable" }
      const notBefore = Math.max(quietUntil, mutationPace.nextInvocation)
      if (before.mono < notBefore) return { kind: "deferred", notBefore }
      if (!isJsonObject(records) || !isJsonObject(records.sync)) return { kind: "unavailable" }
      const baseline = snapshot(records)
      const current = await guardedLocal.get(null)
      if (disposed() || !isJsonObject(current) || !sameSyncJson(baseline, current)) return { kind: "unavailable" }
      const pending = recoveryHistory(records.sync, { kind: "pending", notBefore: before.wall + 60000 })
      prearmed = { ...baseline, sync: pending }
      await guardedLocal.set({ sync: pending })
      const confirmed = await guardedLocal.get(null)
      if (disposed() || !isJsonObject(confirmed) || !sameSyncJson(prearmed, confirmed)) return { kind: "unavailable" }
      observedGate = isJsonObject(pending.opaqueWrite) ? pending.opaqueWrite.gate : undefined
      const remote = await sync.get()
      const latest = await guardedLocal.get(null)
      if (disposed() || !isJsonObject(latest) || !sameSyncJson(prearmed, latest)) return { kind: "unavailable" }
      const currentReady = authority(latest)
      if (currentReady.kind !== "ready" || !currentReady.device.syncOn) return { kind: "unavailable" }
      const replanned = planSyncWrite({ local: latest, sync: remote, intent: { kind: "flush" } })
      if (replanned.kind === "refused") return replanned.reason === "sync-full" ? { kind: "blocked" } : { kind: "unavailable" }
      if (replanned.kind !== "planned" || !sameSyncJson(plan.metadata, replanned.metadata)) return { kind: "unavailable" }
      if (replanned.sent.length === 0 && replanned.repairs.length === 0) return { kind: "unavailable" }
      plan = replanned
    }
    const source: FlushSource = plan.sent.length > 0
      ? { kind: "set", sent: plan.sent, repairs: plan.repairs }
      : { kind: "readback", repairs: plan.repairs }
    if (source.kind === "set") {
      const invoked = clock()
      if (!invoked || !admitted(event, invoked)) return { kind: "unavailable" }
      const invokedAt = invoked.mono
      const notBefore = Math.max(quietUntil, mutationPace.nextInvocation)
      if (invokedAt < notBefore) return { kind: "deferred", notBefore }
      cancelTicket()
      mutationPace.nextInvocation = invokedAt + 5000
      try { await assertExternalAuthority() } catch { return { kind: "unavailable" } }
      try { await deps.sync.set(Object.fromEntries(plan.items.map(item => [item.key, item.value]))) } catch (error) {
        let rejected: ReturnType<typeof clock>
        let clockError: { error: unknown } | undefined
        try { rejected = clock() } catch (error) { clockError = { error } }
        epoch++
        cancelTicket()
        hold = rejected ? { mono: rejected.mono + 60000, wall: rejected.wall + 60000 }
          : { mono: Infinity, wall: Number.MAX_SAFE_INTEGER }
        try {
          if (clockError) throw clockError.error
          if (!rejected || !prearmed) throw new TypeError("Recovery clock unavailable")
          const current = await guardedLocal.get(null)
          if (disposed() || !isJsonObject(current) || !sameSyncJson(prearmed, current) || !isJsonObject(current.sync)) {
            throw new TypeError("Recovery authority changed")
          }
          const finalizing = clock()
          if (!finalizing) throw new TypeError("Recovery clock unavailable")
          hold.wall = Math.max(hold.wall, finalizing.wall + 60000)
          const held = recoveryHistory(current.sync, { kind: "held", notBefore: hold.wall }, { value: error })
          const expected = { ...snapshot(current), sync: held }
          await guardedLocal.set({ sync: held })
          const confirmed = await guardedLocal.get(null)
          if (!isJsonObject(confirmed) || !sameSyncJson(expected, confirmed)) throw new TypeError("Recovery persistence unconfirmed")
          observedGate = isJsonObject(held.opaqueWrite) ? held.opaqueWrite.gate : undefined
        } catch (persistenceError) {
          return { kind: "sync-set-failed", error, sent: plan.sent, recoveryPersistence: { error: persistenceError } }
        }
        return { kind: "sync-set-failed", error, sent: plan.sent }
      }
      hold = undefined
    }
    let latest, postflight, remoteSnapshot
    try {
      latest = await guardedLocal.get(null)
      const current = authority(latest)
      if (current.kind !== "ready" || !current.device.syncOn || !current.history ||
        current.history.joined !== ready.history?.joined || !sameSyncJson(current.rawDevice, ready.rawDevice)) {
        return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "authority" } } : { kind: "unavailable" }
      }
      remoteSnapshot = await sync.get()
      postflight = planSyncWrite({ local: latest, sync: remoteSnapshot, intent: { kind: "flush" } })
    } catch (error) {
      if (source.kind === "set") return { kind: "unconfirmed", sent: plan.sent, cause: { kind: "read-failed", error } }
      throw error
    }
    const captured = [...plan.sent, ...plan.repairs]
    const remoteItems = Object.entries(remoteSnapshot).map(([key, value]) => ({ key, value }))
    if (postflight.kind !== "planned" || !sameSyncJson(plan.metadata, postflight.metadata) ||
      captured.some(record => {
        const raw = latest[record.name]
        const remote = readSyncDocument({ key: record.key, items: remoteItems })
        return !isJsonObject(raw) || !sameSyncJson(record.document, raw) ||
          (remote.kind !== "value" && remote.kind !== "deleted") || !sameSyncJson(record.document, remote.json)
      })) {
      return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "readback" } } : { kind: "unavailable" }
    }
    const rawHistory = latest.sync
    if (!isJsonObject(rawHistory)) throw new TypeError("Missing current history")
    let next = repairedHistory(rawHistory, captured)
    if (prearmed || observedGate !== undefined) {
      const cleared = recoveryHistory(next ?? rawHistory, null)
      if (!sameSyncJson(cleared, rawHistory)) next = cleared
    }
    if (next) {
      try {
        const baseline = await guardedLocal.get(null)
        if (disposed() || !isJsonObject(baseline) || !isJsonObject(latest) || !sameSyncJson(latest, baseline)) {
          return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "authority" } } : { kind: "unavailable" }
        }
        await guardedLocal.set({ sync: next })
        const confirmed = await guardedLocal.get(null)
        if (disposed() || !isJsonObject(confirmed) || !sameSyncJson({ ...baseline, sync: next }, confirmed)) {
          return source.kind === "set" ? { kind: "unconfirmed", sent: plan.sent, cause: { kind: "readback" } } : { kind: "unavailable" }
        }
        observedGate = undefined
        hold = undefined
      } catch (error) {
        return { kind: "acknowledgement-failed", error, source }
      }
    }
    return source.kind === "set" ? { kind: "pushed", sent: plan.sent, repaired: plan.repairs }
      : next ? { kind: "reconciled", repaired: plan.repairs } : { kind: "idle" }
  }

  async function signalJoinHistory(records: JsonObject, remote: JsonObject): Promise<boolean> {
    const metadata = remote["s:meta"]
    if (!isJsonObject(metadata) || !isJsonObject(records.device) || !isJsonObject(records.sync)) return false
    try { const supported = decodeSyncMeta(metadata); if (supported.v !== 1 || supported.reset === true) return false } catch { return false }
    const device = decodeDevice(records.device), history = decodeSyncState(records.sync)
    if (!device.syncOn || device.consent?.v !== CONSENT_VERSION || history.joined === null) return false
    const read = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    const existing = read.kind === "valid" ? read.checkpoint : undefined
    if (read.kind !== "absent" && !existing) return true
    const expected = existing?.phase === "outbound" ? decodeSyncMeta(existing.debt.target.metadata).id : history.joined
    if (metadata.id === expected && existing?.phase !== "choice") return false
    if (existing?.phase === "accepted" || existing?.phase === "off") return true
    if (existing?.phase === "choice" && sameSyncJson(existing.observedMetadata, metadata)) return true
    const suspended = existing?.phase === "outbound" ? { kind: "outbound", debt: existing.debt } as const : existing?.phase === "choice" ? existing.suspended : { kind: "none" } as const
    const checkpoint: SyncJoinCheckpoint = { v: read.kind === "valid" ? 2 : 1, kind: "sync-join", phase: "choice", lastJoined: history.joined, observedMetadata: metadata, suspended }
    const record = transitionSyncJoin(read.kind === "valid" ? read.raw : undefined, checkpoint)
    cancelTicket()
    const write = await setJoinStage(joinDeps, "debt", records, { [pendingSyncJoinKey]: record })
    if (write.kind !== "resolved" && write.kind !== "rejected") joinOutcome(write)
    return true
  }
  async function flushJoin(event: SyncEvent | undefined, initial: JsonObject, debt: JoinOutboundDebt): Promise<SyncFlushResult> {
    const mutations: Extract<SyncJoinResult, { kind: "committed" }>["mutations"][number][] = []
    const valid = (records: JsonObject) => {
      const state = readJoinLocal(records)
      if (state.kind !== "local" || !isJsonObject(records.device) || !isJsonObject(records.sync)) return false
      const device = decodeDevice(records.device), history = decodeSyncState(records.sync)
      return device.syncOn && device.id === debt.deviceId && agreementSame(device.consent, debt.consent) && history.joined === decodeSyncMeta(debt.target.metadata).id && debt.selectedDocuments.length === state.documents.length && debt.selectedDocuments.every(x => sameJoinStored(records, documentKey(x.key), { kind: "present", value: x.document }))
    }
    if (!valid(initial)) return { kind: "unavailable" }
    let loaded: JsonObject | undefined
    try { loaded = await loadRecovery(snapshot(initial)) } catch (error) { agreementBarrier(); throw error }
    if (!loaded) agreementBarrier()
    if (!loaded || disposed()) return { kind: "unavailable" }
    let baseline = loaded
    const time = clock()
    if (!time) return { kind: "unavailable" }
    let remote = await readJoinSync()
    if (!isJsonObject(remote)) return { kind: "unavailable" }
    if (await signalJoinHistory(baseline, remote)) return { kind: "unavailable" }
    let plan = projectJoinDebt(debt, remote)
    if (plan.kind === "unavailable" && (plan.reason === "changed-generation" || plan.reason === "history")) {
      const observed = readJoinRemote(remote)
      if (observed.kind !== "remote") return { kind: "unavailable" }
      const current = await local.get(null)
      if (!isJsonObject(current) || !sameSyncJson(current, baseline) || !valid(current) || disposed()) return { kind: "unavailable" }
      const prepared = prepareReconcileEffect({ local: current, remote: observed, debt, at: deps.now(), generation: deps.generation })
      if (prepared.kind !== "prepared") return prepared.kind === "refused" && prepared.reason === "sync-full" ? { kind: "blocked" } : { kind: "unavailable", reason: "changed-generation" }
      const recheckedLocal = await local.get(null), recheckedRemote = await readJoinSync()
      if (!isJsonObject(recheckedLocal) || !sameSyncJson(recheckedLocal, current) || !isJsonObject(recheckedRemote) || !sameSyncJson(recheckedRemote, remote) || disposed()) return { kind: "unavailable" }
      const accepted: SyncJoinCheckpoint & { phase: "accepted" } = { v: 2, kind: "sync-join", phase: "accepted", effect: prepared.effect }
      const record = transitionSyncJoin(joinJson(current[pendingSyncJoinKey]), accepted)
      const write = await setJoinStage(joinDeps, "accept", current, { [pendingSyncJoinKey]: record })
      if (write.kind !== "resolved" && write.kind !== "rejected") return { kind: "reconciliation-held", result: joinOutcome(write) }
      const completed = await finishJoinEffect(joinDeps, { ...current, [pendingSyncJoinKey]: record }, accepted, [{ stage: "accept", write }])
      joinOutcome(completed)
      if (completed.kind !== "committed") return completed.kind === "cancelled" ? { kind: "unavailable" } : { kind: "reconciliation-held", result: completed }
      publishJoinCompletion(prepared.effect, completed)
      mutations.push(...completed.mutations)
      debt = prepared.effect.debt
      if (completed.replication === "confirmed") return { kind: "reconciled", repaired: debt.selectedDocuments.map(x => ({ key: x.key, name: documentKey(x.key), gen: String(x.document.gen), document: x.document })) }
      const completedLocal = await local.get(null)
      if (!isJsonObject(completedLocal) || !valid(completedLocal) || disposed()) { agreementBarrier(); return { kind: "unavailable" } }
      baseline = completedLocal
      remote = await readJoinSync()
      if (!isJsonObject(remote) || await signalJoinHistory(baseline, remote)) return { kind: "unavailable" }
      plan = projectJoinDebt(debt, remote)
    }
    if (hold && !admitted(event, time)) return recoveryDeferral(time)
    if (plan.kind !== "planned") return plan.kind === "refused" && plan.reason === "sync-full" ? { kind: "blocked" } : plan.kind === "unavailable" && plan.reason === "changed-generation" ? { kind: "unavailable", reason: "changed-generation" } : { kind: "unavailable" }
    if (plan.items.length) {
      const before = clock()
      if (!before || !admitted(event, before)) return recoveryDeferral(time)
      const notBefore = Math.max(mutationPace.nextInvocation, quietUntil)
      if (before.mono < notBefore) return { kind: "deferred", notBefore }
      if (!isJsonObject(baseline.sync)) return { kind: "unavailable" }
      const pending = recoveryHistory(baseline.sync, { kind: "pending", notBefore: before.wall + 60000 })
      const write = await setJoinStage(joinDeps, "debt", baseline, { sync: pending })
      if (write.kind !== "resolved" && write.kind !== "rejected") { joinOutcome(write); return { kind: "unavailable" } }
      mutations.push({ stage: "debt", write })
      baseline = { ...baseline, sync: pending }
      observedGate = isJsonObject(pending.opaqueWrite) ? pending.opaqueWrite.gate : undefined
      remote = await readJoinSync()
      const current = await local.get(null)
      if (disposed() || !isJsonObject(current) || !sameSyncJson(current, baseline) || !valid(current) || !isJsonObject(remote)) { agreementBarrier(); return { kind: "unavailable" } }
      if (await signalJoinHistory(baseline, remote)) return { kind: "unavailable" }
      plan = projectJoinDebt(debt, remote)
      if (plan.kind !== "planned") return plan.kind === "refused" && plan.reason === "sync-full" ? { kind: "blocked" } : plan.kind === "unavailable" && plan.reason === "changed-generation" ? { kind: "unavailable", reason: "changed-generation" } : { kind: "unavailable" }
    }
    const sent = plan.sent
    const expectedRemote = { ...remote, ...Object.fromEntries(plan.items.map(x => [x.key, x.value])) }
    if (plan.items.length) {
      const invoked = clock()
      if (!invoked || !admitted(event, invoked)) return { kind: "unavailable" }
      const notBefore = Math.max(mutationPace.nextInvocation, quietUntil)
      if (invoked.mono < notBefore) return { kind: "deferred", notBefore }
      mutationPace.nextInvocation = invoked.mono + 5000; cancelTicket()
      try { await sync.set(Object.fromEntries(plan.items.map(x => [x.key, x.value]))) }
      catch (error) {
        let rejected: ReturnType<typeof clock>
        let clockError: { error: unknown } | undefined
        try { rejected = clock() } catch (error) { clockError = { error } }
        epoch++; cancelTicket()
        hold = rejected ? { mono: rejected.mono + 60000, wall: rejected.wall + 60000 } : { mono: Infinity, wall: Number.MAX_SAFE_INTEGER }
        try {
          if (clockError) throw clockError.error
          if (!rejected || !isJsonObject(baseline.sync)) throw new TypeError("Join recovery clock unavailable")
          const finalizing = clock()
          if (!finalizing) throw new TypeError("Join recovery clock unavailable")
          hold.wall = Math.max(hold.wall, finalizing.wall + 60000)
          const held = recoveryHistory(baseline.sync, { kind: "held", notBefore: hold.wall }, { value: error })
          const write = await setJoinStage(joinDeps, "debt", baseline, { sync: held })
          if (write.kind !== "resolved" && write.kind !== "rejected") { joinOutcome(write); throw new TypeError("Join recovery persistence unconfirmed") }
          observedGate = isJsonObject(held.opaqueWrite) ? held.opaqueWrite.gate : undefined
        } catch (persistenceError) { agreementBarrier(); return { kind: "sync-set-failed", error, sent, recoveryPersistence: { error: persistenceError } } }
        return { kind: "sync-set-failed", error, sent }
      }
    }
    let confirmed: JsonObject, observed: JsonObject
    try {
      const current = await local.get(null), raw = await readJoinSync()
      if (!isJsonObject(current) || !sameSyncJson(baseline, current) || !valid(current) || disposed()) return { kind: "unconfirmed", sent, cause: { kind: "authority" } }
      if (!isJsonObject(raw)) return { kind: "unconfirmed", sent, cause: { kind: "readback" } }
      confirmed = current; observed = raw
    } catch (error) { agreementBarrier(); return { kind: "unconfirmed", sent, cause: { kind: "read-failed", error } } }
    const post = projectJoinDebt(debt, observed)
    if (post.kind !== "planned" || post.items.length || !sameSyncJson(expectedRemote, observed)) { agreementBarrier(); return { kind: "unconfirmed", sent, cause: { kind: "readback" } } }
    if (!isJsonObject(confirmed.sync)) return { kind: "unavailable" }
    const all = debt.selectedDocuments.map(x => ({ key: x.key, name: documentKey(x.key), gen: String(x.document.gen), document: x.document }))
    const acknowledged = repairedHistory(confirmed.sync, all) ?? confirmed.sync
    const next = { ...recoveryHistory(acknowledged, null), status: "ok" }
    const write = await setJoinStage(joinDeps, "acknowledge", confirmed, { sync: next })
    if (write.kind !== "resolved" && write.kind !== "rejected") {
      joinOutcome(write)
      return write.kind === "failed" ? { kind: "acknowledgement-failed", error: "write" in write ? write.write.error : write.error, source: { kind: "set", sent, repairs: [] } } : { kind: "unconfirmed", sent, cause: { kind: "readback" } }
    }
    mutations.push({ stage: "acknowledge", write })
    const retired = await retireJoin(joinDeps, { ...confirmed, sync: next })
    if (retired.kind !== "resolved" && retired.kind !== "rejected") {
      joinOutcome(retired)
      if (retired.kind === "failed") return { kind: "reconciliation-held", result: retired }
      agreementBarrier(); return { kind: "unconfirmed", sent, cause: { kind: "readback" } }
    }
    mutations.push({ stage: "retire", write: retired })
    observedGate = undefined; hold = undefined; if (!protocolHeld && !disposed()) initialization = "ok"
    const checkpoint = readSyncJoinCheckpoint(confirmed[pendingSyncJoinKey])
    const observations = checkpoint.kind === "valid" && checkpoint.checkpoint.v === 2 ? { mutations } : {}
    return sent.length ? { kind: "pushed", sent, repaired: [], ...observations } : { kind: "reconciled", repaired: all, ...observations }
  }

  function noticeUnavailable(): Extract<ClaimNoticeRead, { kind: "unavailable" }> | undefined {
    if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
    if (disposed() || importPending || claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
  }

  function setupUnavailable(): Extract<SetupDestinationResult, { kind: "unavailable" }> | undefined {
    if (importPending) return { kind: "unavailable", reason: "stale" }
    if (protocolHeld) return { kind: "unavailable", reason: "consent-held" }
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
  }
  function subscriptionsClosed() {
    return protocolHeld || claimConfirmation === "unconfirmed" || disposed() || initialization === "interim-held" || initialization === "failed" || initialization === "newer-layout"
  }
  function listen(listener: (event: SettingsEvent | SetupEvent) => void): () => void {
    if (subscriptionsClosed()) return () => {}
    // Each registration has an independent, idempotent lifetime.
    const registered = (event: SettingsEvent | SetupEvent) => listener(event)
    listeners.add(registered)
    return () => { listeners.delete(registered) }
  }
  function removalUnavailable(): Extract<RemovalResult, { kind: "unavailable" }> | undefined {
    if (importPending) return { kind: "unavailable", reason: "stale" }
    if (protocolHeld) return { kind: "unavailable", reason: "consent-held" }
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
    if (claimConfirmation === "unconfirmed" || joinHeld) return { kind: "unavailable", reason: "stale" }
  }
  function sessionUnavailable(): { readonly kind: "unavailable"; readonly reason: SessionUnavailableReason } | undefined {
    const blocked = removalUnavailable()
    if (blocked) return { kind: "unavailable", reason: blocked.reason === "newer-layout" || blocked.reason === "startup" || blocked.reason === "disposed" || blocked.reason === "consent-held" ? blocked.reason : "stale" }
    if (!session) return { kind: "unavailable", reason: "session-host" }
  }
  // Session work shares the owner lane, so removal, Setup and AddFlow never interleave their session reads and writes.
  async function readSessionInLane(): Promise<SessionRead> {
    const blocked = sessionUnavailable()
    if (blocked || !session) return blocked ?? { kind: "unavailable", reason: "session-host" }
    await guardedLocal.get([pendingAccountRemovalKey])
    const stopped = sessionUnavailable()
    if (stopped) return stopped
    return readSessionSnapshotInLane()
  }
  async function readSessionSnapshotInLane(): Promise<SessionRead> {
    const blocked = sessionUnavailable()
    if (blocked || !session) return blocked ?? { kind: "unavailable", reason: "session-host" }
    let raw
    try { raw = await session.get() } catch { return sessionUnavailable() ?? { kind: "unavailable", reason: "stale" } }
    const stopped = sessionUnavailable()
    if (stopped) return stopped
    const memory = parseSessionMemory(raw)
    if (!memory) return { kind: "unavailable", reason: "session-layout" }
    return { kind: "memory", memory, revision: sessionRevisionView(), sequence: ++sessionSequence }
  }
  function projectionUnavailable(): TabProjectionUnavailable | undefined {
    const blocked = removalUnavailable()
    if (blocked) return { kind: "unavailable", reason: blocked.reason === "consent-held" || blocked.reason === "startup" || blocked.reason === "newer-layout" || blocked.reason === "disposed" ? blocked.reason : "stale" }
  }
  async function readProjectionRecordsInLane(): Promise<
    | { readonly kind: "records"; readonly records: Readonly<Record<string, unknown>>; readonly device: Extract<ReturnType<typeof readProjectionDevice>, { kind: "ready" }> }
    | TabProjectionUnavailable | TabProjectionInvalid
  > {
    const blocked = projectionUnavailable()
    if (blocked) return blocked
    let records: Readonly<Record<string, unknown>>
    try { records = await removalLocal.get(null) }
    catch { return projectionUnavailable() ?? { kind: "unavailable", reason: "stale" } }
    const stopped = projectionUnavailable()
    if (stopped) return stopped
    // A read must not resume the transaction through guardedLocal.get().
    if (importPending) return { kind: "unavailable", reason: "stale" }
    if (Object.hasOwn(records, pendingAccountRemovalKey)) return { kind: "unavailable", reason: "pending-removal" }
    const device = readProjectionDevice(records)
    return device.kind === "ready" ? { kind: "records", records, device } : device
  }
  type CacheCaptureState = { readonly acct: AccountKey; readonly revision: SessionRevision; readonly device: JsonValue; consumed: boolean }
  const cacheOwner = Object.freeze({})
  const cacheCaptures = new WeakMap<PlaylistCacheCapture, CacheCaptureState>()
  const labelLookups = new WeakMap<PlaylistCacheCapture, { readonly label: AccountLabel | null; readonly checkedAt: number; completed: boolean }>()
  function labelCaptureCurrent(capture: PlaylistCacheCapture, records: Readonly<Record<string, unknown>>): boolean {
    const saved = cacheCaptures.get(capture)
    return !!saved && sessionAccountCurrent(saved.revision, sessionRevisionView(), saved.acct) &&
      sameSyncJson(saved.device, cacheDeviceAuthority(records.device)) && cacheSetupState(records, saved.acct) === "live"
  }
  async function seeAccountLabelInLane(request: Parameters<AccountLabelsOwner["seeAccountLabel"]>[0]): Promise<AccountLabelSeen> {
    try {
      const read = await readPlaylistCacheInLane(request)
      if (read.kind !== "cache") return read
      if (read.authority.kind !== "eligible") return { kind: "no-setup" }
      const capture = read.authority.capture, saved = cacheCaptures.get(capture)
      if (!saved) return { kind: "refused", reason: "revoked" }
      const current = await readProjectionRecordsInLane()
      if (current.kind !== "records") return current
      if (!labelCaptureCurrent(capture, current.records)) return { kind: "refused", reason: "revoked" }
      if (!isJsonObject(current.records) || !isJsonObject(current.records.device)) return { kind: "invalid", part: "device" }
      if (authority(current.records).kind !== "ready") return { kind: "unavailable", reason: "stale" }
      const state = accountLabelState(current.records, request.acct)
      if (state.kind !== "label") return state.kind === "no-setup" ? { kind: "no-setup" } : { kind: "unavailable", reason: "stale" }
      const due = labelCheckDue(state.checkedAt, request.at), items: JsonObject = {}
      const lastChanged = current.device.lastAccount !== request.acct
      if (lastChanged) items[LAST_ACCOUNT_KEY] = request.acct
      const key = `cache:${request.acct}`
      if (due) {
        const raw = current.records[key] ?? emptyAccountCache()
        decodeAccountCache(raw)
        if (!isJsonObject(raw)) return { kind: "invalid", part: "cache" }
        items[key] = { ...raw, labelAt: request.at }
      }
      const latest = await readProjectionRecordsInLane()
      if (latest.kind !== "records") return latest
      if (!labelCaptureCurrent(capture, latest.records) || !agreementSame(current.records, latest.records)) return { kind: "refused", reason: "revoked" }
      let write: "resolved" | "rejected" = "resolved"
      if (Object.keys(items).length) {
        try { await removalLocal.set(items) } catch { write = "rejected" }
        let after
        try { after = await readProjectionRecordsInLane() } catch { after = undefined }
        if (after?.kind === "records" && write === "rejected" && labelCaptureCurrent(capture, after.records) && agreementSame(after.records, current.records)) return { kind: "failed", stage: "set" }
        if (after?.kind !== "records" || write === "rejected" || !labelCaptureCurrent(capture, after.records) || !agreementSame(after.records, { ...current.records, ...items })) {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
          return { kind: "unconfirmed", write }
        }
      }
      saved.consumed = true
      const checkedAt = due ? request.at : state.checkedAt
      if (checkedAt === null) return { kind: "refused", reason: "invalid" }
      if (due) labelLookups.set(capture, { label: structuredClone(state.label), checkedAt, completed: false })
      return { kind: due ? "lookup" : "current", capture, label: structuredClone(state.label), checkedAt, lastAccount: lastChanged ? "committed" : "unchanged" }
    } catch { return { kind: "failed", stage: "read" } }
  }
  async function completeAccountLabelInLane(capture: PlaylistCacheCapture, input: Parameters<AccountLabelsOwner["completeAccountLabel"]>[1]): Promise<AccountLabelWrite> {
    const lookup = labelLookups.get(capture), saved = cacheCaptures.get(capture)
    if (!lookup || lookup.completed || !saved || saved.acct !== input.acct) return { kind: "stale" }
    lookup.completed = true
    const label = checkedAccountLabel(input.label)
    if (!label) return { kind: "setup", result: { kind: "result", result: { refused: "invalid" } } }
    const result = await executeSetupEdit({ local: guardedLocal, sync, authority: records => retainedHold(records) ? { kind: "unavailable", reason: "startup" } : authority(records), repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation, remove: runAccountRemoval }, input.acct,
      records => {
        const state = accountLabelState(records, input.acct)
        return labelCaptureCurrent(capture, records) && state.kind === "label" && state.checkedAt === lookup.checkedAt
          ? planAccountLabel(records, input.acct, lookup.label, label) : { kind: "stale", reason: "setup" }
      })
    if (result.kind === "unconfirmed" || result.kind === "failed" && result.stage === "set") {
      claimConfirmation = "unconfirmed"
      deactivate("stopped")
    }
    if (result.kind === "committed") {
      emit({ kind: "setup-changed", source: "local", acct: input.acct })
      quietUntil = deps.syncClock.now() + 2000
      if (lifetime.kind === "active") {
        const arrival = clock()
        const event: SyncEvent | undefined = arrival ? { kind: "edit", ...arrival, epoch } : undefined
        arm(Math.max(quietUntil, mutationPace.nextInvocation), event)
      }
      return { kind: "committed", label, checkedAt: lookup.checkedAt }
    }
    if (result.kind !== "unchanged") return result.kind === "stale" ? { kind: "stale" } : { kind: "setup", result }
    try {
      const current = await readProjectionRecordsInLane()
      if (current.kind !== "records" || !labelCaptureCurrent(capture, current.records)) return { kind: "stale" }
      const state = accountLabelState(current.records, input.acct)
      return state.kind === "label" && sameAccountLabel(state.label, label) && state.checkedAt === lookup.checkedAt
        ? { kind: "current", label, checkedAt: lookup.checkedAt } : { kind: "stale" }
    } catch { return { kind: "stale" } }
  }
  async function readPlaylistCacheInLane(request: { readonly acct: AccountKey; readonly private: boolean }): Promise<PlaylistCacheRead> {
    const first = await readProjectionRecordsInLane()
    if (first.kind !== "records") return first
    const setup = cacheSetupState(first.records, request.acct)
    if (setup === "invalid") return { kind: "invalid", part: "setup" }
    if (setup === "newer-version") return { kind: "unavailable", reason: "stale" }
    if (setup === "none") return { kind: "cache", cache: null, authority: { kind: "caller-owned", reason: "no-setup" } }
    let cache
    try { cache = readCacheRecord(first.records, request.acct, deps.now()) }
    catch { return { kind: "invalid", part: "cache" } }
    const latest = await readProjectionRecordsInLane()
    if (latest.kind !== "records") return latest
    if (cacheSetupState(latest.records, request.acct) !== "live" ||
      !sameSyncJson(cacheDeviceAuthority(first.records.device), cacheDeviceAuthority(latest.records.device)) ||
      !agreementSame(first.records[`cache:${request.acct}`] ?? null, latest.records[`cache:${request.acct}`] ?? null)) return { kind: "unavailable", reason: "stale" }
    if (request.private) return { kind: "cache", cache, authority: { kind: "caller-owned", reason: "private" } }
    const capture = new PlaylistCacheCapture(request.acct, { owner: cacheOwner, reset: sessionRevision, account: sessionAccounts.get(request.acct) ?? 0 })
    cacheCaptures.set(capture, { acct: request.acct, revision: sessionRevisionView(), device: cacheDeviceAuthority(latest.records.device), consumed: false })
    return { kind: "cache", cache, authority: { kind: "eligible", capture } }
  }
  async function absorbPlaylistCacheInLane(capture: PlaylistCacheCapture, input: CacheAbsorption): Promise<PlaylistCacheWrite> {
    const saved = cacheCaptures.get(capture)
    if (!saved || saved.consumed || saved.acct !== input.acct) return { kind: "refused", reason: "capture" }
    saved.consumed = true
    if (!validCacheInput(input)) return { kind: "refused", reason: "invalid" }
    if (!sessionAccountCurrent(saved.revision, sessionRevisionView(), saved.acct)) return { kind: "refused", reason: "revoked" }
    const current = await readProjectionRecordsInLane()
    if (current.kind !== "records") return current
    if (!sameSyncJson(saved.device, cacheDeviceAuthority(current.records.device))) return { kind: "refused", reason: "revoked" }
    const setup = cacheSetupState(current.records, saved.acct)
    if (setup !== "live") return setup === "invalid" ? { kind: "invalid", part: "setup" } : { kind: "refused", reason: "no-setup" }
    let planned
    try { planned = planCacheAbsorption(readCacheRecord(current.records, saved.acct, deps.now()), input, deps.now()) }
    catch { return { kind: "refused", reason: "invalid" } }
    const key = `cache:${saved.acct}`, value = cacheJson(planned)
    if (isJsonValue(current.records[key]) && sameSyncJson(current.records[key], value)) return { kind: "unchanged", cache: planned }
    const latest = await readProjectionRecordsInLane()
    if (latest.kind !== "records") return latest
    if (!sessionAccountCurrent(saved.revision, sessionRevisionView(), saved.acct) ||
      !sameSyncJson(saved.device, cacheDeviceAuthority(latest.records.device)) || cacheSetupState(latest.records, saved.acct) !== "live" ||
      !agreementSame(current.records[key] ?? null, latest.records[key] ?? null)) return { kind: "refused", reason: "revoked" }
    let write: "resolved" | "rejected" = "resolved"
    try { await removalLocal.set({ [key]: value }) } catch { write = "rejected" }
    const after = await readProjectionRecordsInLane()
    if (after.kind === "records" && write === "rejected" && agreementSame(current.records[key] ?? null, after.records[key] ?? null) &&
      sessionAccountCurrent(saved.revision, sessionRevisionView(), saved.acct) && cacheSetupState(after.records, saved.acct) === "live" &&
      sameSyncJson(saved.device, cacheDeviceAuthority(after.records.device))) return { kind: "failed", stage: "set" }
    if (after.kind !== "records" || write === "rejected" || !sessionAccountCurrent(saved.revision, sessionRevisionView(), saved.acct) ||
      cacheSetupState(after.records, saved.acct) !== "live" || !sameSyncJson(saved.device, cacheDeviceAuthority(after.records.device)) ||
      !agreementSame(after.records[key], value)) {
      claimConfirmation = "unconfirmed"
      deactivate("stopped")
      return { kind: "unconfirmed", write, cause: after.kind === "records" ? "readback" : "stopped" }
    }
    return { kind: "committed", cache: planned }
  }
  async function readTabProjectionInLane(request: TabProjectionRequest): Promise<TabProjectionRead> {
    const first = await readProjectionRecordsInLane()
    if (first.kind !== "records") return first
    const session = await readSessionSnapshotInLane()
    if (session.kind !== "memory") return session
    const projection = projectTabStorage({ records: first.records, request, memory: session.memory, pickerSortAZ: first.device.pickerSortAZ })
    const latest = await readProjectionRecordsInLane()
    if (latest.kind !== "records") return latest
    const current = projectTabStorage({ records: latest.records, request, memory: session.memory, pickerSortAZ: latest.device.pickerSortAZ })
    if (!isJsonValue(projection) || !isJsonValue(current) || !sameSyncJson(projection, current)) return { kind: "unavailable", reason: "stale" }
    return { kind: "projection", projection: current }
  }
  async function changeSessionInLane(change: SessionChange): Promise<SessionWrite> {
    const blocked = sessionUnavailable()
    if (blocked || !session) return blocked ?? { kind: "unavailable", reason: "session-host" }
    await guardedLocal.get([pendingAccountRemovalKey])
    const stopped = sessionUnavailable()
    if (stopped) return stopped
    const revision = sessionRevisionView()
    if (!change.edits.every(edit => sessionAccountCurrent(change.revision, revision, sessionEditAccount(edit)))) return { kind: "unavailable", reason: "revision" }
    let before
    try { before = await session.get() } catch { return sessionUnavailable() ?? { kind: "unavailable", reason: "stale" } }
    const plan = planSessionChange(before, change)
    if (!plan) return { kind: "unavailable", reason: "session-layout" }
    let rejected: { error: unknown } | undefined
    try {
      if (Object.keys(plan.items).length) await session.set(plan.items)
      if (plan.remove.length) await session.remove(plan.remove)
    } catch (error) { rejected = { error } }
    let after
    try { after = await session.get() } catch (error) {
      halt()
      return { kind: "unconfirmed", cause: { kind: "read-failed", error } }
    }
    const applied = isJsonValue(after) && sameSyncJson(after, plan.expected)
    if (rejected) {
      if (applied) halt()
      else if (!isJsonValue(after) || !isJsonValue(before) || !sameSyncJson(after, before)) { halt(); return { kind: "unconfirmed", cause: { kind: "readback" } } }
      return { kind: "failed", applied, error: rejected.error }
    }
    const memory = applied ? parseSessionMemory(after) : undefined
    if (!memory) { halt(); return { kind: "unconfirmed", cause: { kind: "readback" } } }
    const previous = parseSessionMemory(before)
    if (previous) {
      if (previous.paused !== memory.paused) emitView({ kind: "pause-changed" })
      const accounts = new Set(change.edits.flatMap(edit => edit.kind === "skip" || edit.kind === "unskip" ? [edit.acct] : []))
      for (const acct of accounts) {
        const entries = (rows: typeof memory.skips) => [...rows.get(acct) ?? []].sort(([left], [right]) => left.localeCompare(right))
        if (!sameViewValue(entries(previous.skips), entries(memory.skips))) emitView({ kind: "skips-changed", acct, scope: "normal" })
      }
    }
    return { kind: "committed", memory, revision: sessionRevisionView(), sequence: ++sessionSequence }
    function halt() {
      claimConfirmation = "unconfirmed"
      deactivate("stopped")
    }
  }
  function removalOrigin(origin: UiOrigin): Extract<RemovalResult, { kind: "result" }> | undefined {
    if (!isJsonObject(origin) || origin.kind !== "ui" || !Number.isSafeInteger(origin.windowId) || origin.windowId < 0) return { kind: "result", result: { refused: "invalid" } }
    if (origin.incognito !== false) return { kind: "result", result: { refused: "private" } }
  }

  function agreementJson(raw: unknown): JsonObject { if (!isJsonObject(raw)) throw new TypeError("Invalid agreement JSON"); return snapshot(raw) }
  function agreementSame(left: unknown, right: unknown): boolean { return isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right) }
  function agreementUnavailable(): AgreementUnavailable | undefined {
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (protocolHeld) return { kind: "unavailable", reason: "consent-held" }
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
    if (initialization === "newer-layout") return { kind: "unavailable", reason: "newer-layout" }
    if (initialization === "interim-held") {
      if (!startup || !interimResult || !["retained-but-held", "retained-agreement", "pending-agreement", "pending-installation", "installed-interim", "confirmed-recovery", "pending-recovery"].includes(interimResult.kind)) return { kind: "unavailable", reason: "retention" }
    } else if (initialization !== "ok") return { kind: "unavailable", reason: "startup" }
  }
  function agreementBarrier() {
    importExecution?.revoke()
    sessionRevision++
    cancelJoinPreparations()
    claimConfirmation = "unconfirmed"
    agreementRevision++
    deactivate("stopped")
    listeners.clear(); revokeViews()
  }
  type AgreementObservation = { readonly kind: "observation"; readonly records: JsonObject; readonly retained: InterimPersistenceSnapshot | undefined }
  async function observeAgreement(): Promise<AgreementObservation | Extract<AgreementRead, { kind: "invalid" }> | AgreementUnavailable> {
    const records = await local.get(null)
    const stopped = agreementUnavailable()
    if (stopped) return stopped
    if (!isJsonObject(records)) return { kind: "invalid", field: "records" }
    if (Object.hasOwn(records, pendingAccountRemovalKey)) return { kind: "unavailable", reason: "pending-removal" }
    if (joinHeld) return { kind: "unavailable", reason: "pending-join" }
    let retained: InterimPersistenceSnapshot | undefined
    if (startup) {
      const raw = await startup.readInterimSnapshot()
      if (!isJsonValue(raw)) { agreementRevision++; return { kind: "invalid", field: "records" } }
      retained = detachAgreement(raw)
      const selected = (keep: (name: string) => boolean) => Object.fromEntries(Object.entries(records).filter(([name]) => keep(name)))
      const checkpoint = Object.hasOwn(records, interimConversionKey) ? { kind: "present", value: records[interimConversionKey] } : { kind: "absent" }
      if (!sameSyncJson(selected(isInterimSourceKey), retained.source as JsonObject) || !sameSyncJson(selected(isInterimCanonicalKey), retained.canonical as JsonObject) || !sameSyncJson(checkpoint as JsonObject, retained.checkpoint as JsonObject)) {
        agreementRevision++
        return { kind: "unavailable", reason: "stale" }
      }
    }
    if (initialization === "interim-held") {
      if (!retained || !interimResult || !("checkpoint" in interimResult)) return { kind: "unavailable", reason: "retention" }
      const current = readRetainedCheckpoint(records[interimConversionKey])
      if (current.kind !== "valid" && current.kind !== "agreement" && current.kind !== "installation" && current.kind !== "recovery") return { kind: "unavailable", reason: "retention" }
      if (current.kind === "recovery") {
        const history = readRecoveryHistory(records)
        if (!history || retainedRecoveryDifference({ checkpoint: current.checkpoint, current: retained, history })) return { kind: "unavailable", reason: "retention" }
        if (!agreementSame(interimResult.checkpoint, current.checkpoint)) return { kind: "unavailable", reason: "stale" }
        return agreementUnavailable() ?? { kind: "observation", records, retained }
      }
      const history = current.kind === "installation" ? readInterimInstallationHistory(records) : undefined
      if (current.kind === "installation" ? !history || history.kind !== "history" || retainedInstallationDifference({ checkpoint: current.checkpoint, current: retained, history: history.history })
        : retainedCheckpointDifference(current.checkpoint, retained)) { agreementRevision++; return { kind: "unavailable", reason: "retention" } }
      if (!agreementSame(interimResult.checkpoint, current.checkpoint)) { agreementRevision++; return { kind: "unavailable", reason: "stale" } }
    } else if (retainedHold(records)) return { kind: "unavailable", reason: "retention" }
    return agreementUnavailable() ?? { kind: "observation", records, retained }
  }
  async function agreementSet(stage: AgreementStage, baseline: JsonObject, items: JsonObject): Promise<AgreementWrite | Exclude<AgreementResult, { kind: "committed" | "unchanged" }>> {
    const preflight = await observeAgreement()
    if (preflight.kind !== "observation" || !sameSyncJson(baseline, preflight.records)) return { kind: "unavailable", reason: "stale" }
    const stopped = agreementUnavailable()
    if (stopped) return stopped
    let write: AgreementWrite = { kind: "resolved" }
    try { await local.set(snapshot(items)) } catch (error) { write = { kind: "rejected", error } }
    let observed: Readonly<Record<string, unknown>>
    try {
      observed = await local.get(null)
      if (startup) {
        const host = await startup.readInterimSnapshot()
        if (!isJsonValue(host) || !isJsonObject(observed) ||
          !sameSyncJson(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimSourceKey(key))), host.source as JsonObject) ||
          !sameSyncJson(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimCanonicalKey(key))), host.canonical as JsonObject) ||
          !sameSyncJson((Object.hasOwn(observed, interimConversionKey) ? { kind: "present", value: observed[interimConversionKey] } : { kind: "absent" }) as JsonObject, host.checkpoint as JsonObject) ||
          initialization === "interim-held" && interimResult && "checkpoint" in interimResult &&
            (!sameSyncJson(retainedOriginal(interimResult.checkpoint).historicalAuthorization, host.historicalAuthorization) ||
             !sameSyncJson(retainedOriginal(interimResult.checkpoint).priorCredentialPresence, host.priorCredentialPresence))) {
          agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "readback" } }
        }
      }
    } catch (error) {
      agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "read-failed", error } }
    }
    if (disposed()) { agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "stopped" } } }
    if (isJsonObject(observed) && sameSyncJson({ ...baseline, ...items }, observed)) return write
    if (write.kind === "rejected" && isJsonObject(observed) && sameSyncJson(baseline, observed)) return { kind: "failed", stage, write }
    agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "readback" } }
  }
  function savedRetained(checkpoint: Snapshot<RetainedAgreementV2>) {
    interimResult = { kind: checkpoint.agreement.kind === "accepted" ? "pending-agreement" : "retained-agreement", checkpoint }
  }
  async function finishRetainedAgreement(baseline: JsonObject, checkpoint: Snapshot<RetainedAgreementV2>, mutations: { stage: AgreementStage; write: AgreementWrite }[]): Promise<AgreementResult> {
    const consent = checkpoint.agreement.effect.consent
    const device = agreementJson(Object.getOwnPropertyDescriptor(checkpoint.agreement.effect, "device")?.value)
    if (checkpoint.agreement.kind === "confirmed") return { kind: "unchanged", reason: "already-agreed", consent: { ...consent }, activation: "held" }

    if (!Object.hasOwn(baseline, "device") || !agreementSame(baseline.device, device)) {
      const write = await agreementSet("device", baseline, { device: snapshot(device) })
      if (write.kind !== "resolved" && write.kind !== "rejected") return write
      mutations.push({ stage: "device", write })
      baseline = { ...baseline, device: snapshot(device) }
    }
    const confirmed = { ...agreementJson(checkpoint), agreement: { kind: "confirmed", effect: { consent: { ...consent }, device } } }
    if (!isJsonObject(confirmed)) return { kind: "refused", reason: "invalid" }
    const write = await agreementSet("record", baseline, { [interimConversionKey]: confirmed })
    if (write.kind !== "resolved" && write.kind !== "rejected") return write
    mutations.push({ stage: "record", write })
    const read = readRetainedCheckpoint(confirmed)
    if (read.kind !== "agreement") throw new TypeError("Invalid confirmed agreement")
    savedRetained(read.checkpoint)
    return { kind: "committed", consent: { ...consent }, settingsChanged: false, blocked: [], applications: [], mutations, activation: "held" }
  }
  async function readAgreement(origin: UiOrigin): Promise<AgreementRead> {
    if (protocolHeld || featurePending || keyPending) return enqueue(() => heldAgreement(origin))
    const stopped = agreementUnavailable()
    if (stopped) return stopped
    if (!agreementOrigin(origin)) return { kind: "invalid", field: "records" }
    const caller = snapshot(origin)
    return enqueue(async () => {
      const stopped = agreementUnavailable()
      if (stopped) return stopped
      try {
        const current = await observeAgreement()
        if (protocolHeld) return heldAgreement(origin)
        if (current.kind !== "observation") return current
        const { records, retained } = current
        let presentation: Extract<AgreementRead, { kind: "review" }>["presentation"]
        if (initialization === "interim-held") {
          const read = readRetainedCheckpoint(records[interimConversionKey])
          if (read.kind === "recovery") return { kind: "unavailable", reason: "retention" }
          if (read.kind === "installation") {
            if (read.checkpoint.installation.kind !== "installed") return { kind: "unavailable", reason: "retention" }
            const next = await observeAgreement()
            const stopped = agreementUnavailable()
            if (stopped) return stopped
            if (next.kind !== "observation" || !agreementSame(current, next)) return { kind: "unavailable", reason: "stale" }
          }
          if (read.kind !== "valid" && read.kind !== "agreement" && read.kind !== "installation") return { kind: "unavailable", reason: "retention" }
          if (read.kind === "agreement" && read.checkpoint.agreement.kind === "accepted") return { kind: "pending", consent: freezeAgreement(read.checkpoint.agreement.effect.consent), action: "resume-retained-agreement", activation: "held" }
          const original = recoveryRetained(read.checkpoint)
          const device = Object.hasOwn(records, "device") ? records.device : undefined
          if (device !== undefined && (!isJsonObject(device) || !["id", "consent", "syncOn"].every(key => Object.hasOwn(device, key)))) return { kind: "invalid", field: "device" }
          let consent = null
          if (device !== undefined) {
            const decoded = decodeDevice(device)
            if (decoded.consent && decoded.consent.v > CONSENT_VERSION) return { kind: "unavailable", reason: "newer-consent" }
            consent = decoded.consent
          }
          const outcome = original.outcome
          presentation = { kind: "retained", consent, historicalAuthorization: original.historicalAuthorization, priorCredentialPresence: original.priorCredentialPresence,
            recovery: original.recovery, agreement: read.kind === "agreement" || read.kind === "installation" ? "confirmed" : "required", activation: "held",
            details: outcome.kind === "blocked" ? { kind: "blocked" } : { kind: "available", percentage: outcome.note.percentage, feedback: outcome.note.feedback, globals: outcome.note.globals.kind } }
        } else {
          const state = readCanonicalAgreement(records)
          if (state.kind !== "canonical-state") return state
          presentation = { kind: "canonical", consent: state.device?.consent ?? null, note: state.device?.upgradeNote ?? null, settings: state.settings, syncOn: state.device?.syncOn ?? false }
        }
        const review: AgreementReview = Object.freeze({ kind: "agreement-review" })
        agreementReviews.set(review, { origin: caller, records: snapshot(records), revision: agreementRevision, retained, context: agreementContext, consumed: false })
        return { kind: "review", version: CONSENT_VERSION, review, presentation: freezeAgreement(presentation) }
      } catch { return { kind: "unavailable", reason: "stale" } }
    })
  }
  function agree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult> {
    if (protocolHeld || featurePending || keyPending) return heldAgree(origin, input)
    const accessDescriptor = input && typeof input === "object" ? Object.getOwnPropertyDescriptor(input, "access") : undefined
    const access = Promise.resolve(accessDescriptor && "value" in accessDescriptor ? accessDescriptor.value : undefined).then(
      value => ({ kind: "observed", value: agreementAccess(value) ? detachAgreement(value) : undefined } as const), error => ({ kind: "rejected", error } as const))
    let at: number
    try { at = initialization === "interim-held" && interimResult && "checkpoint" in interimResult && interimResult.checkpoint.v === 3 ? interimResult.checkpoint.agreed.agreement.effect.consent.at : deps.now() } catch (error) { return Promise.resolve({ kind: "failed", stage: "before-set", error }) }
    const version = CONSENT_VERSION
    const stopped = agreementUnavailable()
    if (stopped) return Promise.resolve(stopped)
    if (!agreementOrigin(origin) || !Number.isSafeInteger(at) || at < 0 || !input || typeof input !== "object" || Array.isArray(input) ||
      Reflect.ownKeys(input).length !== 4 || Reflect.ownKeys(input).some(key => typeof key !== "string" || !["review", "displayedVersion", "choice", "access"].includes(key) || !("value" in (Object.getOwnPropertyDescriptor(input, key) ?? {})))) return Promise.resolve({ kind: "refused", reason: "invalid" })
    const choice = parseAgreementChoice(input.choice), displayedVersion = input.displayedVersion
    if (choice.kind === "unavailable" || choice.kind === "refused") return Promise.resolve(choice)
    const caller = snapshot(origin), captured = agreementReviews.get(input.review)
    if (!captured || !sameSyncJson(caller, captured.origin)) return Promise.resolve({ kind: "unavailable", reason: "stale" })
    if (Object.hasOwn(captured.records, "consent:state") && (choice.kind === "first-run" || choice.kind === "upgrade-note") && choice.syncOn) return Promise.resolve({ kind: "unavailable", reason: "consent-held" })
    const joining = (choice.kind === "first-run" || choice.kind === "upgrade-note") && choice.syncOn && choice.join.kind === "prepare" ? beginJoin(origin, true) : undefined
    return (joining ? joining.result : Promise.resolve(undefined)).then(joinPreparation => enqueue(async () => {
      const stopped = agreementUnavailable()
      if (stopped) return stopped
      const permission = await access
      if (permission.kind === "rejected") return { kind: "failed", stage: "before-set", error: permission.error }
      if (!agreementAccess(permission.value)) return { kind: "refused", reason: "invalid" }
      const observedAccess = detachAgreement(permission.value)
      const action = { choice, access: observedAccess, displayedVersion }
      if (!isJsonObject(action)) return { kind: "refused", reason: "invalid" }
      try {
        const current = await observeAgreement()
        if (current.kind !== "observation") return current.kind === "invalid" ? { kind: "refused", reason: "invalid" } : current
        if (captured.terminal) {
          if (captured.terminal.revision === agreementRevision && sameSyncJson(action, captured.terminal.action) && sameSyncJson(current.records, captured.terminal.after)) return { kind: "unchanged", reason: "already-agreed", consent: captured.terminal.result.consent, activation: captured.terminal.result.activation }
          return { kind: "unavailable", reason: "stale" }
        }
        if (captured.consumed || captured.revision !== agreementRevision || !sameSyncJson(captured.records, current.records) ||
          (captured.retained && (!current.retained || !isJsonValue(current.retained) || !sameSyncJson(captured.retained as JsonObject, current.retained)))) return { kind: "unavailable", reason: "stale" }
        if (displayedVersion !== version) return { kind: "unavailable", reason: "newer-consent" }
        if (!((choice.kind === "first-run" || choice.kind === "upgrade-note") && choice.syncOn)) captured.consumed = true
        const protocol = Object.hasOwn(current.records, "consent:state") ? readConsentDevice(current.records) : undefined
        const paired = protocol?.kind === "supported" ? agreementItems(protocol, at) : undefined
        if (protocol && !paired) return { kind: "unavailable", reason: "consent-held" }
        let consent = { v: version, at }
        if (paired?.["consent:state"].state.kind === "agreed") consent = paired["consent:state"].state.current
        let result: AgreementResult
        let terminalAfter: JsonObject | undefined
        if (initialization === "interim-held") {
          if (choice.kind !== "retained-disclosure") return { kind: "unavailable", reason: "retention" }
          const read = readRetainedCheckpoint(current.records[interimConversionKey])
          if (read.kind === "recovery") return { kind: "unavailable", reason: "retention" }
          if (read.kind === "installation") {
            const revision = agreementRevision, next = await observeAgreement()
            const stopped = agreementUnavailable()
            if (stopped) return stopped
            if (next.kind !== "observation" || revision !== agreementRevision || !agreementSame(current, next)) return { kind: "unavailable", reason: "stale" }
            return read.checkpoint.installation.kind === "installed" ? { kind: "unchanged", reason: "already-agreed", consent: freezeAgreement(read.checkpoint.agreed.agreement.effect.consent), activation: "held" } : { kind: "unavailable", reason: "retention" }
          }
          if (read.kind === "agreement") {
            if (read.checkpoint.agreement.kind !== "confirmed") return { kind: "unavailable", reason: "pending-agreement" }
            const result = { kind: "unchanged", reason: "already-agreed", consent: { ...read.checkpoint.agreement.effect.consent }, activation: "held" } as const
            captured.terminal = { revision: agreementRevision, action: snapshot(action), after: snapshot(current.records), result: freezeAgreement(result) }
            return result
          }
          if (read.kind !== "valid") return { kind: "unavailable", reason: "retention" }
          const device = retainedAgreementDevice(read.checkpoint, consent)
          if (!device) return { kind: "refused", reason: "invalid" }
          const accepted: JsonObject = { v: 2, kind: "retained-interim", retained: agreementJson(read.checkpoint), agreement: { kind: "accepted", effect: { consent, device } } }
          if (!isJsonObject(accepted)) return { kind: "refused", reason: "invalid" }
          const validated = readRetainedCheckpoint(accepted)
          if (validated.kind !== "agreement") return { kind: "refused", reason: "invalid" }
          const write = await agreementSet("accept", current.records, { [interimConversionKey]: accepted })
          if (write.kind !== "resolved" && write.kind !== "rejected") return write
          savedRetained(validated.checkpoint)
          result = await finishRetainedAgreement({ ...current.records, [interimConversionKey]: accepted }, validated.checkpoint, [{ stage: "accept", write }])
          if (result.kind === "committed") terminalAfter = { ...current.records, device, [interimConversionKey]: { ...accepted, agreement: { kind: "confirmed", effect: { consent, device } } } }
        } else {
          if (choice.kind === "retained-disclosure") return { kind: "unavailable", reason: "retention" }
          if (choice.kind === "first-run" && captured.context !== "first-run" || choice.kind === "upgrade-note" && captured.context !== "upgrade-note") return { kind: "unavailable", reason: "startup" }
          const state = readCanonicalAgreement(current.records)
          if (state.kind !== "canonical-state") return state.kind === "invalid" ? { kind: "refused", reason: "invalid" } : state
          if (state.device?.upgradeNote?.state === "pending" && choice.kind !== "upgrade-note") return { kind: "unavailable", reason: "upgrade-note" }
          if ((choice.kind === "first-run" || choice.kind === "upgrade-note") && choice.syncOn) {
            if (joinPreparation && joinPreparation.kind !== "automatic") return joinPreparation.kind === "cancelled" ? { kind: "unavailable", reason: "stale" } : joinPreparation
            const review = choice.join.kind === "answer" ? choice.join.review : joinPreparation?.kind === "automatic" ? joinPreparation.review : undefined
            if (!review || !agreementCreation) return { kind: "unavailable", reason: "creation-context" }
            const joinCapture = await validateJoinCapture(caller, review, true)
            if (!joinCapture || choice.join.kind === "answer" && joinCapture.classification !== "choice-required") return { kind: "unavailable", reason: "stale" }
            const side = choice.join.kind === "answer" ? choice.join.choice : undefined
            const decision = syncJoinDecision(classifySyncJoin(joinCapture.local, joinCapture.remote), side)
            if (!decision) return { kind: "unavailable", reason: "stale" }
            const selected = selectJoinDocuments({ localDocuments: joinDocuments(joinCapture.local), remoteDocuments: joinCapture.remote.documents, decision }, (_key, raw) => raw).find(x => x.key.kind === "settings")?.document
            const reviewed = { ...current.records }
            if (selected !== undefined) reviewed["doc:settings"] = selected
            const selectedState = readCanonicalAgreement(reviewed)
            if (selectedState.kind !== "canonical-state") return { kind: "refused", reason: "invalid" }
            const plan = prepareCanonicalAgreement({ records: reviewed, state: selectedState, choice, access: observedAccess, consent, context: agreementCreation })
            if (plan.kind !== "prepared") return plan
            const facts: JoinAgreementFacts = choice.kind === "first-run" ? { kind: choice.kind, selected: choice.selected, access: observedAccess, consent, context: agreementCreation, reservedUnclaimed: joinStored(current.records, "unclaimed") }
              : { kind: choice.kind, selected: choice.selected, percentage: choice.percentage, access: observedAccess, consent, context: agreementCreation, reservedUnclaimed: joinStored(current.records, "unclaimed") }
            const joined = await acceptJoin(joinCapture, side, facts, at)
            if (joined.kind === "cancelled") return { kind: "unavailable", reason: "stale" }
            if (joined.kind !== "committed") return joined
            captured.consumed = true
            return { kind: "joined", consent, join: joined, activation: "ordinary-gates", settingsChanged: plan.settings !== undefined, applications: plan.applications, blocked: plan.blocked }
          }
          const plan = prepareCanonicalAgreement({ records: current.records, state, choice, access: observedAccess, consent, context: agreementCreation })
          if (plan.kind !== "prepared") return plan
          const items: JsonObject = { device: plan.device }
          if (paired) items["consent:state"] = paired["consent:state"]
          if (plan.settings) {
            const raw = current.records["doc:settings"]
            const envelope: JsonObject = { ...(isJsonObject(raw) ? raw : {}), v: DOCUMENT_VERSION, gen: deps.generation(), at, by: plan.device.id!, data: plan.settings }
            delete envelope.deleted
            if (decodeDocument(envelope, decodeSettings).kind !== "value") return { kind: "refused", reason: "invalid" }
            items["doc:settings"] = envelope
            if (state.device?.syncOn) {
              const admission = planSyncWrite({ local: current.records, sync: await sync.get(), intent: { kind: "changed-batch", documents: [{ key: { kind: "settings" }, document: envelope }] } })
              if (admission.kind === "refused") return admission
              if (admission.kind !== "planned" || !isJsonObject(current.records.sync)) return { kind: "unavailable", reason: "sync-writer-required" }
              const repaired = repairedHistory(current.records.sync, admission.repairs)
              if (repaired) items.sync = repaired
            }
            const history = prepareFirstEditHistory({ history: Object.hasOwn(current.records, "sync") ? { kind: "present", raw: items.sync ?? current.records.sync } : { kind: "absent" }, syncOn: state.device?.syncOn ?? false })
            if (history.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
            if (history.kind === "set") items.sync = history.sync
          } else if (choice.kind !== "disclosure" && state.device?.syncOn) {
            const admission = planSyncWrite({ local: current.records, sync: await sync.get(), intent: { kind: "unchanged", key: { kind: "settings" } } })
            if (admission.kind === "refused") return admission
            if (admission.kind === "unavailable") return { kind: "unavailable", reason: "sync-writer-required" }
          }
          if (!plan.settings && state.device?.consent?.v === version && state.device.upgradeNote?.state !== "pending") {
            const result = { kind: "unchanged", reason: "already-agreed", consent: { ...state.device.consent }, activation: "ordinary-gates" } as const
            captured.terminal = { revision: agreementRevision, action: snapshot(action), after: snapshot(current.records), result: freezeAgreement(result) }
            return result
          }
          if (plan.clearProgress) for (const [key, value] of Object.entries(current.records)) {
            if (!key.startsWith("progress:")) continue
            if (!/^progress:[A-Za-z0-9_-]{16}:(?:[0-9]|1[0-5])$/.test(key) || !isJsonObject(value)) return { kind: "refused", reason: "invalid" }
            items[key] = {}
          }
          const write = await agreementSet("canonical", current.records, items)
          if (write.kind !== "resolved" && write.kind !== "rejected") return write
          result = { kind: "committed", consent, settingsChanged: plan.settings !== undefined, blocked: plan.blocked, applications: plan.applications,
            mutations: [{ stage: "canonical", write }], activation: "ordinary-gates" }
          terminalAfter = { ...current.records, ...items }
          if (plan.settings) emitSettings("local")
        }
        if (result.kind === "committed") {
          const after = terminalAfter
          if (!after || disposed()) { agreementBarrier(); return { kind: "unconfirmed", stage: initialization === "interim-held" ? "record" : "canonical", write: result.mutations.at(-1)?.write ?? { kind: "resolved" }, cause: { kind: "stopped" } } }
          captured.terminal = { revision: agreementRevision, action: snapshot(action), after: snapshot(after), result: freezeAgreement(result) }
        }
        return result
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    }))
  }
  function resumeRetainedAgreement(origin: UiOrigin): Promise<AgreementResult> {
    const blocked = agreementUnavailable()
    if (blocked) return Promise.resolve(blocked)
    if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
    if (!startup || initialization !== "interim-held") return Promise.resolve({ kind: "unavailable", reason: "retention" })
    return enqueue(async () => {
      const blocked = agreementUnavailable()
      if (blocked) return blocked
      try {
        const current = await observeAgreement()
        if (current.kind !== "observation") return current.kind === "invalid" ? { kind: "refused", reason: "invalid" } : current
        const read = readRetainedCheckpoint(current.records[interimConversionKey])
        if (read.kind === "recovery") return { kind: "unavailable", reason: "retention" }
        if (read.kind === "installation") {
          const next = await observeAgreement()
          const stopped = agreementUnavailable()
          if (stopped) return stopped
          if (next.kind !== "observation" || !agreementSame(current, next)) return { kind: "unavailable", reason: "stale" }
          return read.checkpoint.installation.kind === "installed" ? { kind: "unchanged", reason: "already-agreed", consent: freezeAgreement(read.checkpoint.agreed.agreement.effect.consent), activation: "held" } : { kind: "unavailable", reason: "retention" }
        }
        if (read.kind !== "agreement") return { kind: "unavailable", reason: "pending-agreement" }
        return await finishRetainedAgreement(current.records, read.checkpoint, [])
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    })
  }

  type InstallationObservation = {
    readonly kind: "installation-observation"; readonly records: JsonObject; readonly retained: InterimPersistenceSnapshot
    readonly checkpoint: Snapshot<ConfirmedRetainedAgreementV2 | RetainedInstallationV3>; readonly agreed: Snapshot<ConfirmedRetainedAgreementV2>
    readonly history: RetainedInstallationHistory; readonly effect: InterimInstallationEffect
  }
  type InstallationCapture = {
    readonly origin: JsonObject; readonly observation: InstallationObservation; readonly revision: number; consumed: boolean
    terminal?: { readonly revision: number; readonly after: JsonObject }
  }
  const installationReviews = new WeakMap<InterimInstallationReview, InstallationCapture>()
  function installationUnavailable(): InterimInstallationUnavailable | undefined {
    if (protocolHeld) return { kind: "unavailable", reason: "consent-held" }
    if (disposed()) return { kind: "unavailable", reason: "disposed" }
    if (protocolHeld) return { kind: "unavailable", reason: "consent-held" }
    if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
    if (joinHeld || initialization === "pending-join") return { kind: "unavailable", reason: "pending-join" }
    if (initialization === "newer-layout") return { kind: "unavailable", reason: "newer-layout" }
    if (initialization === "pending") return { kind: "unavailable", reason: "startup" }
    if (interimResult?.kind === "newer-checkpoint") return { kind: "unavailable", reason: "newer-version" }
    if (!startup || initialization !== "interim-held" || !interimResult || !("checkpoint" in interimResult)) return { kind: "unavailable", reason: "retention" }
  }
  function installationOrigin(origin: UiOrigin): Extract<InterimInstallationResult, { kind: "refused" }> | undefined {
    if (!agreementOrigin(origin)) return { kind: "refused", reason: "invalid" }
    if (origin.incognito) return { kind: "refused", reason: "private" }
  }
  async function observeInstallation(): Promise<InstallationObservation | InterimInstallationUnavailable> {
    const stopped = installationUnavailable()
    if (stopped) return stopped
    const observed = await observeAgreement()
    if (observed.kind !== "observation") {
      const reason = observed.kind === "unavailable" ? observed.reason : "retention"
      switch (reason) {
        case "pending-removal": case "pending-join": case "disposed": case "stale": case "newer-layout": return { kind: "unavailable", reason }
        default: return { kind: "unavailable", reason: "retention" }
      }
    }
    if (!observed.retained) return { kind: "unavailable", reason: "retention" }
    const read = readRetainedCheckpoint(observed.records[interimConversionKey])
    if (read.kind === "newer-version") return { kind: "unavailable", reason: "newer-version" }
    if (read.kind === "valid") return { kind: "unavailable", reason: "agreement-required" }
    if (read.kind !== "agreement" && read.kind !== "installation") return { kind: "unavailable", reason: "retention" }
    if (read.kind === "agreement" && read.checkpoint.agreement.kind !== "confirmed") return { kind: "unavailable", reason: "pending-agreement" }
    const agreed: Snapshot<ConfirmedRetainedAgreementV2> = read.kind === "installation" ? read.checkpoint.agreed : { ...read.checkpoint, agreement: { ...read.checkpoint.agreement, kind: "confirmed" } }
    const derived = deriveInterimInstallationEffect(agreed)
    if (derived.kind !== "effect") return derived
    const history = readInterimInstallationHistory(observed.records)
    if (history.kind !== "history") return history
    return { kind: "installation-observation", records: observed.records, retained: observed.retained,
      checkpoint: read.kind === "installation" ? read.checkpoint : agreed, agreed, history: history.history, effect: derived.effect }
  }
  async function stableInstallation(): Promise<InstallationObservation | InterimInstallationUnavailable> {
    const first = await observeInstallation(), revision = agreementRevision
    if (first.kind !== "installation-observation") return first
    const second = await observeInstallation()
    if (second.kind !== "installation-observation") return second
    if (revision !== agreementRevision || !agreementSame(first, second)) return { kind: "unavailable", reason: "stale" }
    return installationUnavailable() ?? second
  }
  async function readInterimInstallation(origin: UiOrigin): Promise<InterimInstallationStatus> {
    const blocked = installationUnavailable() ?? installationOrigin(origin)
    if (blocked) return blocked
    const caller = snapshot(origin)
    return enqueue(async () => {
      const blocked = installationUnavailable()
      if (blocked) return blocked
      try {
        const current = await stableInstallation()
        const stopped = installationUnavailable()
        if (stopped) return stopped
        if (current.kind !== "installation-observation") return current
        if (current.checkpoint.v === 3) return current.checkpoint.installation.kind === "accepted" ? { kind: "pending", action: "resume-interim-installation", activation: "held" } : { kind: "installed", activation: "held", recovery: "retained" }
        const outcome = current.agreed.retained.outcome
        if (outcome.kind !== "inactive-proposal") return { kind: "unavailable", reason: "blocked-source" }
        const review: InterimInstallationReview = Object.freeze({ kind: "interim-installation-review" })
        installationReviews.set(review, { origin: caller, observation: current, revision: agreementRevision, consumed: false })
        return Object.freeze({ kind: "review", review, documents: freezeAgreement(current.effect.documents.map(x => ({ kind: x.kind, path: x.path }))), caches: freezeAgreement(current.effect.caches.map(x => x.path)), note: outcome.note, consent: current.agreed.agreement.effect.consent, activation: "held" })
      } catch { return { kind: "unavailable", reason: "stale" } }
    })
  }
  async function installationSet(stage: InterimInstallationStage, baseline: JsonObject, items: JsonObject): Promise<InterimInstallationWrite | Exclude<InterimInstallationResult, { kind: "committed" | "unchanged" }>> {
    const preflight = await stableInstallation()
    if (preflight.kind !== "installation-observation" || !sameSyncJson(baseline, preflight.records)) return { kind: "unavailable", reason: "stale" }
    const stopped = installationUnavailable()
    if (stopped) return stopped
    let write: InterimInstallationWrite = { kind: "resolved" }
    try { await local.set(snapshot(items)) } catch (error) { write = { kind: "rejected", error } }
    let observed: Readonly<Record<string, unknown>>
    try {
      observed = await local.get(null)
      if (!startup) throw new TypeError("Installation requires retained startup")
      const host = await startup.readInterimSnapshot()
      const original = preflight.agreed.retained
      if (!isJsonObject(observed) || !isJsonValue(host) ||
        !agreementSame(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimSourceKey(key))), host.source) ||
        !agreementSame(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimCanonicalKey(key))), host.canonical) ||
        !agreementSame(Object.hasOwn(observed, interimConversionKey) ? { kind: "present", value: observed[interimConversionKey] } : { kind: "absent" }, host.checkpoint) ||
        !agreementSame(original.historicalAuthorization, host.historicalAuthorization) || !agreementSame(original.priorCredentialPresence, host.priorCredentialPresence)) {
        agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "readback" } }
      }
    } catch (error) { agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "read-failed", error } } }
    if (disposed()) { agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "stopped" } } }
    if (isJsonObject(observed) && sameSyncJson({ ...baseline, ...items }, observed)) {
      const read = readRetainedCheckpoint(observed[interimConversionKey])
      if (read.kind !== "installation") { agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "readback" } } }
      interimResult = { kind: read.checkpoint.installation.kind === "accepted" ? "pending-installation" : "installed-interim", checkpoint: read.checkpoint }
      return write
    }
    if (write.kind === "rejected" && isJsonObject(observed) && sameSyncJson(baseline, observed)) return { kind: "failed", stage, write }
    agreementBarrier(); return { kind: "unconfirmed", stage, write, cause: { kind: "readback" } }
  }
  async function finishInstallation(current: InstallationObservation, mutations: { stage: InterimInstallationStage; write: InterimInstallationWrite }[]): Promise<InterimInstallationResult> {
    const stopped = installationUnavailable()
    if (stopped) return stopped
    const checkpoint = current.checkpoint
    if (checkpoint.v !== 3) return { kind: "unavailable", reason: "pending-installation" }
    if (checkpoint.installation.kind === "installed") return { kind: "unchanged", reason: "already-installed", activation: "held" }
    let baseline = current.records
    const items: JsonObject = Object.fromEntries([...current.effect.documents.map(x => [x.path, x.document]), ...current.effect.caches.map(x => [x.path, x.data])])
    if (current.effect.schema.kind === "set") items.schema = current.effect.schema.value
    if (Object.entries(items).some(([key, value]) => !Object.hasOwn(baseline, key) || !agreementSame(baseline[key], value))) {
      const write = await installationSet("install", baseline, items)
      if (write.kind !== "resolved" && write.kind !== "rejected") return write
      mutations.push({ stage: "install", write }); baseline = { ...baseline, ...items }
    } else {
      const checked = await stableInstallation()
      if (checked.kind !== "installation-observation" || !agreementSame(checked.records, baseline)) return { kind: "unavailable", reason: "stale" }
    }
    const installed = { ...agreementJson(checkpoint), installation: { kind: "installed", history: agreementJson(checkpoint.installation.history) } }
    const write = await installationSet("confirm", baseline, { [interimConversionKey]: installed })
    if (write.kind !== "resolved" && write.kind !== "rejected") return write
    mutations.push({ stage: "confirm", write })
    if (disposed()) { agreementBarrier(); return { kind: "unconfirmed", stage: "confirm", write, cause: { kind: "stopped" } } }
    return { kind: "committed", activation: "held", mutations }
  }
  function installInterimConversion(origin: UiOrigin, review: InterimInstallationReview): Promise<InterimInstallationResult> {
    const blocked = installationUnavailable() ?? installationOrigin(origin)
    if (blocked) return Promise.resolve(blocked)
    const caller = snapshot(origin), captured = installationReviews.get(review)
    if (!captured || !sameSyncJson(caller, captured.origin)) return Promise.resolve({ kind: "unavailable", reason: "stale" })
    return enqueue(async () => {
      const blocked = installationUnavailable()
      if (blocked) return blocked
      try {
        const current = await stableInstallation()
        if (current.kind !== "installation-observation") return current
        if (captured.terminal) return captured.terminal.revision === agreementRevision && sameSyncJson(captured.terminal.after, current.records)
          ? { kind: "unchanged", reason: "already-installed", activation: "held" } : { kind: "unavailable", reason: "stale" }
        if (captured.consumed || captured.revision !== agreementRevision || !agreementSame(current, captured.observation)) return { kind: "unavailable", reason: "stale" }
        if (current.checkpoint.v !== 2) return { kind: "unavailable", reason: "pending-installation" }
        const accepted: RetainedInstallationV3 = { v: 3, kind: "retained-interim", agreed: agreementJson(current.agreed) as unknown as ConfirmedRetainedAgreementV2, installation: { kind: "accepted", history: current.history } }
        const read = readRetainedCheckpoint(accepted)
        if (read.kind !== "installation") return { kind: "unavailable", reason: "retention" }
        captured.consumed = true
        const write = await installationSet("accept", current.records, { [interimConversionKey]: agreementJson(accepted) })
        if (write.kind !== "resolved" && write.kind !== "rejected") return write
        const next = await stableInstallation()
        if (next.kind !== "installation-observation") { agreementBarrier(); return { kind: "unconfirmed", stage: "accept", write, cause: { kind: disposed() ? "stopped" : "readback" } } }
        const result = await finishInstallation(next, [{ stage: "accept", write }])
        if (result.kind === "committed") {
          if (disposed()) { agreementBarrier(); return { kind: "unconfirmed", stage: "confirm", write: result.mutations.at(-1)?.write ?? { kind: "resolved" }, cause: { kind: "stopped" } } }
          const after = { ...next.records, ...Object.fromEntries(next.effect.documents.map(x => [x.path, x.document])), ...Object.fromEntries(next.effect.caches.map(x => [x.path, x.data])),
            ...(next.effect.schema.kind === "set" ? { schema: next.effect.schema.value } : {}), [interimConversionKey]: { ...agreementJson(read.checkpoint), installation: { kind: "installed", history: agreementJson(current.history) } } }
          captured.terminal = { revision: agreementRevision, after: agreementJson(after) }
        }
        return result
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    })
  }
  function resumeInterimInstallation(origin: UiOrigin): Promise<InterimInstallationResult> {
    const blocked = installationUnavailable() ?? installationOrigin(origin)
    if (blocked) return Promise.resolve(blocked)
    return enqueue(async () => {
      const blocked = installationUnavailable()
      if (blocked) return blocked
      try {
        const current = await stableInstallation()
        if (current.kind !== "installation-observation") return current
        return await finishInstallation(current, [])
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    })
  }

  type JoinCapture = { readonly origin: JsonObject; readonly local: JsonObject; readonly remote: JoinRemote; readonly revision: number; readonly remoteRevision: number; readonly classification: Extract<SyncJoinPreparation, { kind: "automatic" | "choice-required" }>["kind"]; readonly agreementOnly: boolean; consumed: boolean; cancelled(): boolean; cancel(): void }
  const joinReviews = new WeakMap<SyncJoinReview, JoinCapture>()
  const joinPreparations = new Set<{ origin: JsonObject; cancel(): void }>()
  function cancelJoinPreparations() { for (const operation of [...joinPreparations]) operation.cancel() }
  async function readJoinSync() {
    const raw = await sync.get()
    if (!isJsonObject(raw)) { joinRemoteRevision++; return raw }
    const records = snapshot(raw)
    if (observedJoinRemote && !sameSyncJson(observedJoinRemote, records)) joinRemoteRevision++
    observedJoinRemote = snapshot(records)
    return records
  }
  function joinBlocked(allowPending = true) {
    if (protocolHeld) return joinUnavailable("consent-held")
    if (disposed()) return joinUnavailable("disposed")
    if (claimConfirmation === "unconfirmed") return joinUnavailable("stale")
    if (initialization === "interim-held") return joinUnavailable("retention")
    if (initialization === "newer-layout") return joinUnavailable("newer-layout")
    if (initialization !== "ok" && !(allowPending && initialization === "pending-join")) return joinUnavailable("startup")
  }
  function joinOutcome<T extends SyncJoinResult>(result: T): T {
    if (result.kind === "unconfirmed") agreementBarrier()
    return result
  }
  function publishJoinCompletion(effect: AcceptedJoinEffect, result: Extract<SyncJoinResult, { kind: "committed" }>) {
    if (disposed() || protocolHeld) return
    if (!protocolHeld && !disposed()) initialization = "ok"
    if (effect.kind === "cancel") return
    if (effect.documents.some(x => x.key.kind === "settings" && (x.before.kind === "absent" || !sameSyncJson(x.before.value, x.after)))) emit({ kind: "settings-changed", source: "sync" }, false)
    const setupAccounts = new Set(effect.removedAccounts)
    for (const acct of effect.removedAccounts) {
      invalidateAccountSession(acct)
      emitView({ kind: "account-removed", source: "sync", acct })
    }
    for (const member of effect.documents) {
      const before = member.before.kind === "present" ? member.before.value : undefined
      if (member.key.kind === "setup" && (member.before.kind === "absent" || !sameSyncJson(member.before.value, member.after))) setupAccounts.add(member.key.acct)
      if (sameDocumentValue(member.key, before, member.after)) continue
      if (member.key.kind === "settings") emitView({ kind: "settings-changed", source: "sync" })
      else if (member.key.kind === "setup") {
        if (!effect.removedAccounts.includes(member.key.acct)) emitView({ kind: "setup-changed", source: "sync", acct: member.key.acct })
      } else if (!effect.removedAccounts.includes(member.key.acct)) emitView({ kind: "filter-changed", source: "sync", acct: member.key.acct, playlist: member.key.playlist })
    }
    for (const acct of setupAccounts) emit({ kind: "setup-changed", source: "sync", acct }, false)
    if (effect.kind !== "reconcile") return
    const changed = effect.documents.filter(x => x.before.kind === "absent" || !sameSyncJson(x.before.value, x.after))
    const adopted = changed.filter(x => effect.basis.remoteDocuments.some(y => documentKey(y.key) === documentKey(x.key) && sameSyncJson(y.document, x.after)))
      .map(x => ({ key: x.key, name: documentKey(x.key), gen: String(x.after.gen), document: x.after }))
    deps.onSyncResult({ kind: "reconciliation", adopted, reverted: changed.filter(x => x.before.kind === "present").map(x => x.key), replication: result.replication, mutations: result.mutations })
  }
  function beginJoin(origin: UiOrigin, agreementOnly: boolean): SyncJoinOperation {
    if (!agreementOrigin(origin)) return { result: Promise.resolve({ kind: "refused", reason: "invalid" }), cancel() {} }
    const caller = snapshot(origin), blocked = joinBlocked()
    if (blocked) return { result: Promise.resolve(blocked), cancel() {} }
    if (join.kind !== "fixture") return { result: Promise.resolve(joinUnavailable("join-host")), cancel() {} }
    let resolve!: (value: SyncJoinPreparation) => void
    const result = new Promise<SyncJoinPreparation>(done => { resolve = done })
    let done = false, cancelled = false, reading = false, again = false, deadline = false
    let empty: JoinRemote | undefined, cancelDeadline = () => {}, unsubscribe = () => {}
    const operation = { origin: caller, cancel() {
      if (cancelled) return
      cancelled = true; cancelDeadline(); unsubscribe(); joinPreparations.delete(operation)
      if (!done) { done = true; resolve({ kind: "cancelled" }) }
    } }
    joinPreparations.add(operation)
    function finish(value: SyncJoinPreparation) {
      if (done || cancelled) return
      done = true; cancelDeadline()
      if (value.kind !== "automatic" && value.kind !== "choice-required") { unsubscribe(); joinPreparations.delete(operation) }
      resolve(value)
    }
    async function publish(remote: JoinRemote) {
      if (cancelled || done) return
      const blocked = joinBlocked(); if (blocked) { finish(blocked); return }
      const observedLocal = await local.get(null)
      const localRead = retainedHold(observedLocal) ? joinUnavailable("retention") : readJoinLocal(observedLocal, agreementOnly)
      if (cancelled || done) return
      if (localRead.kind !== "local") { finish(localRead); return }
      const checkpoint = readSyncJoinCheckpoint(localRead.records[pendingSyncJoinKey])
      if (checkpoint.kind !== "absent" && !(checkpoint.kind === "valid" && (checkpoint.checkpoint.phase === "choice" || checkpoint.checkpoint.phase === "off"))) { finish(joinUnavailable("pending-join")); return }
      if (checkpoint.kind === "valid" && checkpoint.checkpoint.phase === "choice" && checkpoint.checkpoint.suspended.kind === "accepted") { finish(joinUnavailable("pending-join")); return }
      const classification = classifySyncJoin(localRead.records, remote)
      if (classification.kind === "unavailable") { finish(classification); return }
      const review: SyncJoinReview = Object.freeze({ kind: "sync-join-review" })
      joinReviews.set(review, { origin: caller, local: snapshot(localRead.records), remote: detachAgreement(remote), revision: agreementRevision, remoteRevision: joinRemoteRevision, classification: classification.kind, agreementOnly, consumed: false, cancelled: () => cancelled, cancel: operation.cancel })
      finish(classification.kind === "automatic" ? { ...classification, review } : { ...classification, review, defaultChoice: "use-synced" })
    }
    async function observe() {
      if (cancelled || done) return
      if (reading) { again = true; return }
      reading = true
      try {
        const revision = joinRemoteRevision, raw = await readJoinSync()
        if (cancelled || done) return
        const remote = readJoinRemote(raw)
        if (remote.kind !== "remote") {
          empty = undefined
          if (remote.kind !== "unavailable" || remote.reason !== "incomplete" || deadline) finish(remote)
          return
        }
        if (remote.target.kind !== "empty") empty = undefined
        if (remote.target.kind === "empty" && !deadline) empty = remote
        else if (revision === joinRemoteRevision || !again) await enqueue(() => publish(remote))
      } catch (error) { finish({ kind: "failed", stage: "prepare", error }) }
      finally { reading = false; if (again && !cancelled && !done) { again = false; void observe() } }
    }
    try {
      unsubscribe = sync.subscribe(() => { if (disposed() || protocolHeld) return; joinRemoteRevision++; if (!done) void observe() })
      if (cancelled || disposed() || protocolHeld) { unsubscribe(); operation.cancel(); return { result, cancel: operation.cancel } }
      cancelDeadline = deps.syncClock.after(10000, () => {
        if (cancelled || done) return
        deadline = true
        if (reading || !empty) finish(joinUnavailable("incomplete"))
        else void enqueue(() => publish(empty!))
      })
      if (cancelled || disposed() || protocolHeld) { cancelDeadline(); unsubscribe(); operation.cancel() }
      else void observe()
    } catch (error) { finish({ kind: "failed", stage: "prepare", error }) }
    return { result, cancel: operation.cancel }
  }
  async function validateJoinCapture(origin: JsonObject, review: SyncJoinReview, agreementOnly: boolean) {
    const capture = joinReviews.get(review)
    if (!capture || capture.consumed || capture.cancelled() || capture.agreementOnly !== agreementOnly || !agreementSame(origin, capture.origin)) return
    const current = await local.get(null), remote = await readJoinSync()
    if (joinBlocked() || !isJsonObject(current) || !isJsonObject(remote) || capture.revision !== agreementRevision || capture.remoteRevision !== joinRemoteRevision || !sameSyncJson(capture.local, current) || !sameSyncJson(capture.remote.records, remote)) return
    return capture
  }
  async function acceptJoin(capture: JoinCapture, side: SyncJoinSide | undefined, facts: JoinAgreementFacts, at: number): Promise<SyncJoinResult> {
    if (join.kind !== "fixture") return joinUnavailable("join-host")
    const classification = classifySyncJoin(capture.local, capture.remote)
    if (classification.kind === "unavailable") return classification
    const decision = syncJoinDecision(classification, side)
    if (!decision || capture.classification !== classification.kind) return joinUnavailable("stale")
    const prepared = prepareJoinEffect({ local: capture.local, remote: capture.remote, decision, agreement: facts, at, generation: deps.generation })
    if (prepared.kind !== "prepared") return prepared
    const current = await local.get(null), remote = await readJoinSync()
    if (!isJsonObject(current) || !isJsonObject(remote) || capture.revision !== agreementRevision || capture.remoteRevision !== joinRemoteRevision || !sameSyncJson(capture.local, current) || !sameSyncJson(capture.remote.records, remote) || joinBlocked()) return joinUnavailable("stale")
    capture.consumed = true; capture.cancel(); cancelTicket()
    const accepted: SyncJoinCheckpoint & { phase: "accepted" } = { v: decision.kind === "same-history-no-edit" ? 2 : 1, kind: "sync-join", phase: "accepted", effect: prepared.effect }
    const old = Object.hasOwn(current, pendingSyncJoinKey) ? joinJson(current[pendingSyncJoinKey]) : undefined
    const record = transitionSyncJoin(old, accepted)
    const write = await setJoinStage(joinDeps, "accept", current, { [pendingSyncJoinKey]: record })
    if (write.kind !== "resolved" && write.kind !== "rejected") return joinOutcome(write)
    const result = await finishJoinEffect(joinDeps, { ...current, [pendingSyncJoinKey]: record }, accepted, [{ stage: "accept", write }])
    if (result.kind === "committed") publishJoinCompletion(prepared.effect, result)
    return joinOutcome(result)
  }
  function applySyncJoin(origin: UiOrigin, input: { readonly kind: "automatic"; readonly review: SyncJoinReview } | { readonly kind: "choice"; readonly review: SyncJoinReview; readonly choice: SyncJoinSide }): Promise<SyncJoinResult> {
    if (!agreementOrigin(origin) || !input || input.kind !== "automatic" && input.kind !== "choice" || input.kind === "choice" && input.choice !== "use-synced" && input.choice !== "use-this-browser") return Promise.resolve({ kind: "refused", reason: "invalid" })
    const caller = snapshot(origin), review = input.review, side = input.kind === "choice" ? input.choice : undefined
    let at: number
    try { at = deps.now() } catch (error) { return Promise.resolve({ kind: "failed", stage: "prepare", error }) }
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        const capture = await validateJoinCapture(caller, review, false)
        if (!capture || (side ? capture.classification !== "choice-required" : capture.classification !== "automatic")) return joinUnavailable("stale")
        return await acceptJoin(capture, side, { kind: "none" }, at)
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    })
  }
  function readSyncJoin(origin: UiOrigin): Promise<SyncJoinStatus> {
    if (!agreementOrigin(origin)) return Promise.resolve(joinUnavailable("stale"))
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        const raw = await local.get(null)
        if (disposed()) return joinUnavailable("disposed")
        if (!isJsonObject(raw)) return joinUnavailable("inventory")
        if (typeof raw.schema === "number" && raw.schema > STORAGE_SCHEMA_VERSION) return joinUnavailable("newer-layout")
        if (raw.schema !== STORAGE_SCHEMA_VERSION) return joinUnavailable("startup")
        if (retainedHold(raw)) return joinUnavailable("retention")
        if (Object.hasOwn(raw, pendingAccountRemovalKey)) return joinUnavailable("pending-removal")
        const read = readSyncJoinCheckpoint(raw[pendingSyncJoinKey])
        if (read.kind === "invalid" || read.kind === "newer-version") return joinUnavailable("pending-join")
        if (read.kind === "valid") {
          if (read.checkpoint.phase === "choice") return { kind: "waiting", action: "review-join" }
          if (read.checkpoint.phase === "accepted") return { kind: "pending", action: "resume-join" }
          if (read.checkpoint.phase === "outbound") return { kind: "joining" }
          return { kind: "off" }
        }
        const state = readJoinLocal(raw)
        if (state.kind !== "local") return state.kind === "refused" ? joinUnavailable("inventory") : state
        const device = decodeDevice(raw.device)
        if (!device.syncOn) return { kind: "off" }
        const history = decodeSyncState(raw.sync)
        return history.status === "ok" || history.status === "full" || history.status === "update-needed" ? { kind: "joined", status: history.status } : joinUnavailable("history")
      } catch { return joinUnavailable("inventory") }
    })
  }
  function resumeSyncJoin(origin: UiOrigin): Promise<SyncJoinResult> {
    if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        const raw = await local.get(null)
        if (!isJsonObject(raw) || raw.schema !== STORAGE_SCHEMA_VERSION || retainedHold(raw) || Object.hasOwn(raw, pendingAccountRemovalKey)) return joinUnavailable("inventory")
        const read = readSyncJoinCheckpoint(raw[pendingSyncJoinKey])
        if (read.kind !== "valid") return joinUnavailable("pending-join")
        const waiting = read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "accepted" ? read.checkpoint : undefined
        const accepted = read.checkpoint.phase === "accepted" ? read.checkpoint : read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "accepted" ? { v: read.checkpoint.v, kind: "sync-join", phase: "accepted", effect: read.checkpoint.suspended.effect } as const : undefined
        if (!accepted) return joinUnavailable("pending-join")
        const effect = accepted.effect
        if (effect.kind === "join" && effect.agreement.kind !== "none" && (!agreementCreation || (!agreementSame(effect.agreement.context.platform, agreementCreation.platform) || !agreementSame(effect.agreement.context.commands, agreementCreation.commands)))) return joinUnavailable("stale")
        const result = await finishJoinEffect(joinDeps, raw, accepted, [], waiting)
        if ((result.kind === "committed" || result.kind === "cancelled") && !protocolHeld && !disposed()) initialization = "ok"
        if (result.kind === "committed") publishJoinCompletion(effect, result)
        return joinOutcome(result)
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    })
  }
  function cancelSyncJoin(origin: UiOrigin): Promise<SyncJoinResult> {
    if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
    const caller = snapshot(origin)
    for (const operation of [...joinPreparations]) if (sameSyncJson(operation.origin, caller)) operation.cancel()
    return enqueue(async () => {
      const blocked = joinBlocked(); if (blocked) return blocked
      try {
        let records = joinJson(await local.get(null)), read = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
        if (read.kind === "absent" || read.kind === "valid" && read.checkpoint.phase === "off") return { kind: "cancelled" }
        if (retainedHold(records)) return joinUnavailable("retention")
        if (read.kind !== "valid") return joinUnavailable("pending-join")
        if (join.kind !== "fixture") return joinUnavailable("join-host")
        let unfinished: string | undefined
        const fixed = read.checkpoint.phase === "accepted" ? read.checkpoint : read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "accepted" ? { v: read.checkpoint.v, kind: "sync-join", phase: "accepted", effect: read.checkpoint.suspended.effect } as const : undefined
        if (fixed) {
          const result = await finishJoinEffect(joinDeps, records, fixed)
          if (result.kind !== "committed") {
            if (result.kind === "cancelled" && !protocolHeld && !disposed()) initialization = "ok"
            return joinOutcome(result)
          }
          if (result.replication === "pending") unfinished = result.historyId
          publishJoinCompletion(fixed.effect, result)
          records = joinJson(await local.get(null)); read = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
        }
        if (read.kind === "valid" && read.checkpoint.phase === "outbound") unfinished = decodeSyncMeta(read.checkpoint.debt.target.metadata).id
        if (read.kind === "valid" && read.checkpoint.phase === "choice" && read.checkpoint.suspended.kind === "outbound") unfinished = decodeSyncMeta(read.checkpoint.suspended.debt.target.metadata).id
        if (!isJsonObject(records.device) || !isJsonObject(records.sync)) return joinUnavailable("history")
        const effect = { kind: "cancel", unfinishedTarget: unfinished ? { kind: "present", id: unfinished } as const : { kind: "none" } as const, device: { before: joinStored(records, "device"), after: { ...records.device, syncOn: false } }, history: { before: joinStored(records, "sync"), after: { ...records.sync, status: "off", editedSinceOff: false } } } as const
        const checkpoint = { v: 1, kind: "sync-join", phase: "accepted", effect } as const
        const record = transitionSyncJoin(Object.hasOwn(records, pendingSyncJoinKey) ? joinJson(records[pendingSyncJoinKey]) : undefined, checkpoint)
        const write = await setJoinStage(joinDeps, "accept", records, { [pendingSyncJoinKey]: record })
        if (write.kind !== "resolved" && write.kind !== "rejected") return joinOutcome(write)
        deactivate("inactive")
        const result = await finishJoinEffect(joinDeps, { ...records, [pendingSyncJoinKey]: record }, checkpoint, [{ stage: "accept", write }])
        if (result.kind === "cancelled" && !protocolHeld && !disposed()) initialization = "ok"
        return joinOutcome(result)
      } catch (error) { return { kind: "failed", stage: "prepare", error } }
    })
  }

  function retainedOriginal(checkpoint: Snapshot<RetainedInterim | RetainedAgreementV2 | RetainedInstallationV3 | RetainedRecoveryV4 | RetainedCanonicalAuthorityV5>) {
    return checkpoint.v === 5 ? archiveRetained(checkpoint.archive) : recoveryRetained(checkpoint)
  }
  const ownedCapabilities: { release(): Promise<void> }[] = []
  async function releaseCapabilities() {
    const controller = retainedController
    retainedController = undefined
    if (canonical.kind === "active") canonical = { kind: "lost" }
    const owned = ownedCapabilities.splice(0)
    if (controller) await controller.capability.release()
    for (const capability of owned) await capability.release()
  }
  async function canonicalStartup(host: StoreStartupHost, full: Readonly<Record<string, unknown>>, checkpoint: Snapshot<RetainedCanonicalAuthorityV5>): Promise<"ok" | "newer-layout"> {
    const handoff = checkpoint.handoff, original = archiveRetained(checkpoint.archive), authorityHost = deps.canonicalAuthority ?? { kind: "unavailable" }
    async function hold(owner: "authority-host" | "controller" | "stale", capability?: CanonicalOwnerCapability): Promise<never> {
      if (capability) { ownedCapabilities.splice(ownedCapabilities.indexOf(capability), 1); await capability.release() }
      interimResult = { kind: "canonical-authority", checkpoint, owner }
      initialization = "interim-held"
      deactivate("stopped")
      listeners.clear(); revokeViews()
      throw new StartupReadinessError({ kind: "interim-held", result: interimResult })
    }
    if (authorityHost.kind !== "fixture") return hold("authority-host")
    if (disposed() || protocolHeld && !Object.hasOwn(full, receivedResetKey)) throw new StartupReadinessError({ kind: "disposed" })
    const epoch = await authorityHost.observeSource({ source: agreementJson(original.source) })
    if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
    if (epoch.kind !== "source-epoch" || epoch.sourceEpoch !== handoff.sourceEpoch) return hold("authority-host")
    const acquired = await authorityHost.acquire({ handoffId: handoff.handoffId, sourceEpoch: handoff.sourceEpoch })
    if (acquired.kind !== "exclusive") return hold("controller")
    const owned = acquired.capability
    ownedCapabilities.push(owned)
    if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
    const second = await local.get(null), raw = await host.readInterimSnapshot()
    if (disposed()) throw new StartupReadinessError({ kind: "disposed" })
    const selected = (keep: (key: string) => boolean) => Object.fromEntries(Object.entries(second).filter(([key]) => keep(key)))
    if (!isJsonObject(second) || !isJsonValue(raw) || !agreementSame(second[interimConversionKey], full[interimConversionKey]) || !coversArchivedSource(second, checkpoint) ||
      !agreementSame(selected(isInterimSourceKey), raw.source) || !agreementSame(selected(isInterimCanonicalKey), raw.canonical) ||
      !agreementSame({ kind: "present", value: second[interimConversionKey] }, raw.checkpoint) ||
      !agreementSame(original.historicalAuthorization, raw.historicalAuthorization) || !agreementSame(original.priorCredentialPresence, raw.priorCredentialPresence)) return hold("stale", owned)
    if ((await owned.assertCurrent()) !== "current" || disposed()) return hold("controller", owned)
    canonical = { kind: "active", capability: owned, record: agreementJson(second[interimConversionKey]), checkpoint, keys: archivedKeys(checkpoint) }
    if (protocolHeld || featurePending || keyPending) { initialization = "consent-held"; throw new StartupReadinessError({ kind: "consent-held", work: classifyConsentWork(second) }) }
    const join = readSyncJoinCheckpoint(second[pendingSyncJoinKey])
    if (join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")) {
      initialization = "pending-join"
      throw new StartupReadinessError({ kind: "pending-join", observation: join.kind === "valid" ? join.checkpoint.phase === "off" ? "invalid" : join.checkpoint.phase : join.kind === "newer-version" ? "newer-version" : "invalid" })
    }
    if (typeof second.schema === "number" && second.schema > STORAGE_SCHEMA_VERSION) { initialization = "newer-layout"; return "newer-layout" }
    if (Object.hasOwn(second, receivedResetKey)) {
      const reset = await receiveResetInLane()
      if (reset.kind === "reset-held") throw new StartupReadinessError(reset)
    }
    const completion = await completePendingRemoval()
    if ("stage" in completion || completion.kind === "result" || completion.kind === "unavailable") throw new StartupReadinessError({ kind: "pending-removal", result: completion })
    if (canonical.kind !== "active" || disposed()) throw new StartupReadinessError({ kind: "disposed" })
    if (!deps.syncMutationPace) {
      mutationPace.lastMonotonic = deps.syncClock.now()
      mutationPace.nextInvocation = mutationPace.lastMonotonic + 5000
      mutationPace.invalid = !Number.isFinite(mutationPace.lastMonotonic) || mutationPace.lastMonotonic < 0 || mutationPace.nextInvocation > Number.MAX_SAFE_INTEGER
    }
    if (!protocolHeld && !disposed()) initialization = "ok"
    return "ok"
  }

  type AuthorityObservation = {
    readonly kind: "authority-observation"; readonly records: JsonObject; readonly retained: InterimPersistenceSnapshot; readonly anchor: AuthorityAnchorV5
    readonly stage: { readonly kind: "archive"; readonly archive: RetainedArchiveV5 } | { readonly kind: "accepted"; readonly handoffId: string; readonly sourceEpoch: string } | { readonly kind: "canonical" }
  }
  type AuthorityCapture = { readonly origin: JsonObject; readonly observation: AuthorityObservation; readonly revision: number; readonly sourceEpoch: string; consumed: boolean }
  const authorityReviews = new WeakMap<CanonicalAuthorityReview, AuthorityCapture>()
  const authorityUnavailable = (reason: CanonicalAuthorityUnavailable["reason"]): CanonicalAuthorityUnavailable => ({ kind: "unavailable", reason })
  function authorityBlocked(): CanonicalAuthorityUnavailable | undefined {
    if (protocolHeld) return { kind: "unavailable", reason: "consent-held" }
    if (disposed()) return authorityUnavailable("disposed")
    if (claimConfirmation === "unconfirmed") return authorityUnavailable("uncertain")
    if (joinHeld || initialization === "pending-join") return authorityUnavailable("pending-join")
    if (initialization === "newer-layout") return authorityUnavailable("newer-layout")
    if (!startup || initialization === "pending") return authorityUnavailable("startup")
    if (interimResult?.kind === "newer-checkpoint") return authorityUnavailable("newer-version")
    if (interimResult?.kind === "stale") return authorityUnavailable("stale")
    if (initialization !== "interim-held" || !interimResult || !("checkpoint" in interimResult)) return authorityUnavailable("retention")
  }
  function authorityOrigin(origin: UiOrigin): Extract<CanonicalAuthorityRead, { kind: "refused" }> | undefined {
    if (!agreementOrigin(origin)) return { kind: "refused", reason: "invalid" }
    if (origin.incognito) return { kind: "refused", reason: "private" }
  }
  async function observeAuthority(): Promise<AuthorityObservation | CanonicalAuthorityUnavailable> {
    const stopped = authorityBlocked()
    if (stopped) return stopped
    if (!startup) return authorityUnavailable("startup")
    const records = await local.get(null), raw = await startup.readInterimSnapshot()
    const after = authorityBlocked()
    if (after) return after
    if (!isJsonObject(records) || !isJsonValue(raw)) return authorityUnavailable("inventory")
    const retained = detachAgreement(raw)
    const selected = (keep: (key: string) => boolean) => Object.fromEntries(Object.entries(records).filter(([key]) => keep(key)))
    const present = Object.hasOwn(records, interimConversionKey) ? { kind: "present", value: records[interimConversionKey] } : { kind: "absent" }
    if (!agreementSame(selected(isInterimSourceKey), retained.source) || !agreementSame(selected(isInterimCanonicalKey), retained.canonical) || !agreementSame(present, retained.checkpoint)) return authorityUnavailable("stale")
    if (Object.hasOwn(records, pendingAccountRemovalKey)) return authorityUnavailable("pending-removal")
    const join = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
    if (join.kind !== "absent" && !(join.kind === "valid" && join.checkpoint.phase === "off")) return authorityUnavailable("pending-join")
    const read = readRetainedCheckpoint(records[interimConversionKey])
    let stage: AuthorityObservation["stage"], archive: RetainedArchiveV5 | undefined
    if (read.kind === "newer-version") return authorityUnavailable("newer-version")
    if (read.kind === "valid") return authorityUnavailable("installation-required")
    if (read.kind === "agreement") return authorityUnavailable(read.checkpoint.agreement.kind === "accepted" ? "pending-agreement" : "installation-required")
    if (read.kind === "installation") {
      if (read.checkpoint.installation.kind !== "installed") return authorityUnavailable("pending-installation")
      const history = readInterimInstallationHistory(records)
      if (history.kind !== "history") return authorityUnavailable("history")
      if (retainedInstallationDifference({ checkpoint: read.checkpoint, current: retained, history: history.history })) return authorityUnavailable("stale")
      archive = archiveFor(records[interimConversionKey])
    } else if (read.kind === "recovery") {
      if (read.checkpoint.pending.kind !== "none") return authorityUnavailable("pending-recovery")
      if (read.checkpoint.basis.checkpoint.v !== 3) return authorityUnavailable("installation-required")
      const history = readRecoveryHistory(records)
      if (!history || retainedRecoveryDifference({ checkpoint: read.checkpoint, current: retained, history })) return authorityUnavailable("stale")
      archive = archiveFor(records[interimConversionKey])
    } else if (read.kind === "authority") {
      if (!coversArchivedSource(records, read.checkpoint)) return authorityUnavailable("stale")
      const archived: unknown = detachAgreement<unknown>(read.checkpoint.archive)
      archive = archived as RetainedArchiveV5
    } else return authorityUnavailable("retention")
    if (!archive) return authorityUnavailable("retention")
    const frozenArchive = freezeAgreement(archive), original = archiveRetained(frozenArchive)
    if (!agreementSame(original.historicalAuthorization, retained.historicalAuthorization) || !agreementSame(original.priorCredentialPresence, retained.priorCredentialPresence)) return authorityUnavailable("stale")
    if (LEGACY_DELETE_KEYS.some(key => Object.hasOwn(records, key) && !Object.hasOwn(original.source, key))) return authorityUnavailable("inventory")
    const ready = authority(records)
    if (ready.kind !== "ready") return authorityUnavailable(ready.reason === "newer-layout" || ready.reason === "sync-writer-required" ? ready.reason : "retention")
    if (ready.device.syncOn) return authorityUnavailable("sync-writer-required")
    if (!agreementSame(ready.device.consent, archiveConsent(frozenArchive))) return authorityUnavailable("retention")
    const anchor = currentAuthorityAnchor(records)
    if (!anchor) return authorityUnavailable("history")
    if (read.kind === "authority") {
      if (read.checkpoint.handoff.kind === "canonical") stage = { kind: "canonical" }
      else if (!agreementSame(anchor, read.checkpoint.handoff.anchor)) return authorityUnavailable("stale")
      else stage = { kind: "accepted", handoffId: read.checkpoint.handoff.handoffId, sourceEpoch: read.checkpoint.handoff.sourceEpoch }
    } else stage = { kind: "archive", archive }
    return authorityBlocked() ?? { kind: "authority-observation", records, retained, anchor, stage }
  }
  async function stableAuthority(): Promise<AuthorityObservation | CanonicalAuthorityUnavailable> {
    const first = await observeAuthority(), revision = agreementRevision
    if (first.kind !== "authority-observation") return first
    const second = await observeAuthority()
    if (second.kind !== "authority-observation") return second
    return revision !== agreementRevision || !agreementSame(first, second) ? authorityUnavailable("stale") : second
  }
  async function abandonController() {
    const controller = retainedController
    retainedController = undefined
    if (controller) await controller.capability.release()
  }
  async function authoritySet(stage: "accept" | "record", baseline: JsonObject, items: JsonObject): Promise<CanonicalAuthorityWrite | Exclude<CanonicalAuthorityResult, { kind: "restart-required" }>> {
    const preflight = await stableAuthority()
    if (preflight.kind !== "authority-observation") return preflight
    if (!sameSyncJson(baseline, preflight.records)) return authorityUnavailable("stale")
    const controller = retainedController
    if (!controller || (await controller.capability.assertCurrent()) !== "current") return authorityUnavailable("controller")
    const stopped = authorityBlocked()
    if (stopped) return stopped
    let write: CanonicalAuthorityWrite = { kind: "resolved" }
    try { await local.set(snapshot(items)) } catch (error) { write = { kind: "rejected", error } }
    const unconfirmed = (cause: Extract<CanonicalAuthorityResult, { kind: "unconfirmed" }>["cause"]): Extract<CanonicalAuthorityResult, { kind: "unconfirmed" }> => {
      agreementBarrier(); return { kind: "unconfirmed", stage, write, cause }
    }
    let observed: Readonly<Record<string, unknown>>
    try {
      observed = await local.get(null)
      if (!startup) throw new TypeError("Authority handoff requires retained startup")
      const host = await startup.readInterimSnapshot(), original = retainedOriginal(interimResult && "checkpoint" in interimResult ? interimResult.checkpoint : (() => { throw new TypeError("Missing retained checkpoint") })())
      if (!isJsonObject(observed) || !isJsonValue(host) ||
        !agreementSame(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimSourceKey(key))), host.source) ||
        !agreementSame(Object.fromEntries(Object.entries(observed).filter(([key]) => isInterimCanonicalKey(key))), host.canonical) ||
        !agreementSame(Object.hasOwn(observed, interimConversionKey) ? { kind: "present", value: observed[interimConversionKey] } : { kind: "absent" }, host.checkpoint) ||
        !agreementSame(original.historicalAuthorization, host.historicalAuthorization) || !agreementSame(original.priorCredentialPresence, host.priorCredentialPresence)) return unconfirmed({ kind: "readback" })
    } catch (error) { return unconfirmed({ kind: "read-failed", error }) }
    if (disposed()) return unconfirmed({ kind: "stopped" })
    if (retainedController !== controller || (await controller.capability.assertCurrent()) !== "current") return unconfirmed({ kind: "authority" })
    if (disposed()) return unconfirmed({ kind: "stopped" })
    try { if (!agreementSame(observed, await storage.get(null))) return unconfirmed({ kind: "readback" }) }
    catch (error) { return unconfirmed({ kind: "read-failed", error }) }
    if (disposed()) return unconfirmed({ kind: "stopped" })
    if (isJsonObject(observed) && sameSyncJson({ ...baseline, ...items }, observed)) {
      const read = readRetainedCheckpoint(observed[interimConversionKey])
      if (read.kind !== "authority") return unconfirmed({ kind: "readback" })
      interimResult = read.checkpoint.handoff.kind === "accepted" ? { kind: "pending-authority", checkpoint: read.checkpoint } : { kind: "canonical-authority", checkpoint: read.checkpoint, owner: "required" }
      return write
    }
    if (write.kind === "rejected" && isJsonObject(observed) && sameSyncJson(baseline, observed)) return { kind: "failed", stage, write }
    return unconfirmed({ kind: "readback" })
  }
  async function finishAuthority(baseline: JsonObject, mutations: { stage: CanonicalAuthorityStage; write: CanonicalAuthorityWrite }[]): Promise<CanonicalAuthorityResult> {
    const current = await stableAuthority()
    if (current.kind !== "authority-observation") return current
    if (current.stage.kind !== "accepted" || !sameSyncJson(current.records, baseline)) return authorityUnavailable("stale")
    const { handoffId, sourceEpoch } = current.stage, host = deps.canonicalAuthority, controller = retainedController
    if (host?.kind !== "fixture") return authorityUnavailable("authority-host")
    if (!controller || controller.handoffId !== handoffId || controller.sourceEpoch !== sourceEpoch || (await controller.capability.assertCurrent()) !== "current") return authorityUnavailable("controller")
    const revision = agreementRevision
    let write: CanonicalAuthorityWrite = { kind: "resolved" }, retired: Awaited<ReturnType<typeof host.retire>> | undefined
    if (disposed() || protocolHeld) return authorityUnavailable(disposed() ? "disposed" : "consent-held")
    try { retired = await host.retire({ handoffId, sourceEpoch }) } catch (error) { write = { kind: "rejected", error } }
    const unconfirmed = (cause: Extract<CanonicalAuthorityResult, { kind: "unconfirmed" }>["cause"]): Extract<CanonicalAuthorityResult, { kind: "unconfirmed" }> => {
      agreementBarrier(); return { kind: "unconfirmed", stage: "retire", write, cause }
    }
    if (disposed()) return unconfirmed({ kind: "stopped" })
    let after: AuthorityObservation | CanonicalAuthorityUnavailable
    try { after = await stableAuthority() } catch (error) { return unconfirmed({ kind: "read-failed", error }) }
    if (disposed()) return unconfirmed({ kind: "stopped" })
    if (after.kind !== "authority-observation" || revision !== agreementRevision || !agreementSame(after, current)) return unconfirmed({ kind: "readback" })
    if (retainedController !== controller || (await controller.capability.assertCurrent()) !== "current") return unconfirmed({ kind: "authority" })
    if (write.kind === "rejected") return { kind: "failed", stage: "retire", write }
    const receipt = { kind: "fixture-producers-retired", handoffId, sourceEpoch }
    if (retired?.kind !== "retired" || !agreementSame(retired.receipt, receipt)) return unconfirmed({ kind: "authority" })
    mutations.push({ stage: "retire", write })
    const accepted = agreementJson(baseline[interimConversionKey])
    const recorded = { ...accepted, handoff: { ...agreementJson(accepted.handoff), kind: "canonical", retirement: receipt } }
    if (!isJsonObject(recorded) || readRetainedCheckpoint(recorded).kind !== "authority") return authorityUnavailable("retention")
    const recordWrite = await authoritySet("record", baseline, { [interimConversionKey]: recorded })
    if (recordWrite.kind !== "resolved" && recordWrite.kind !== "rejected") return recordWrite
    mutations.push({ stage: "record", write: recordWrite })
    return { kind: "restart-required", activation: "held", mutations }
  }
  function readCanonicalAuthority(origin: UiOrigin): Promise<CanonicalAuthorityRead> {
    const refused = authorityOrigin(origin)
    if (refused) return Promise.resolve(refused)
    const caller = snapshot(origin)
    return enqueue<CanonicalAuthorityRead>(async (): Promise<CanonicalAuthorityRead> => {
      if (canonical.kind === "active" && !disposed() && claimConfirmation !== "unconfirmed") {
        if (!(await canonicalCurrent(await storage.get(null)))) return authorityUnavailable("stale")
        return { kind: "canonical", recovery: "retained-inactive" }
      }
      try {
        const current = await stableAuthority()
        if (current.kind !== "authority-observation") return current
        if (current.stage.kind === "canonical") return { kind: "canonical", recovery: "retained-inactive" }
        if (current.stage.kind === "accepted") return { kind: "pending", action: "resume-retained-authority", activation: "held" }
        const host = deps.canonicalAuthority, revision = agreementRevision
        if (host?.kind !== "fixture") return authorityUnavailable("authority-host")
        const blocked = authorityBlocked(); if (blocked) return blocked
        const epoch = await host.observeSource({ source: agreementJson(current.retained.source) })
        if (epoch.kind !== "source-epoch" || typeof epoch.sourceEpoch !== "string" || !epoch.sourceEpoch.trim()) return authorityUnavailable("authority-host")
        const after = await stableAuthority()
        if (after.kind !== "authority-observation") return after
        if (revision !== agreementRevision || !agreementSame(after, current)) return authorityUnavailable("stale")
        const review: CanonicalAuthorityReview = Object.freeze({ kind: "canonical-authority-review" })
        authorityReviews.set(review, { origin: caller, observation: after, revision: agreementRevision, sourceEpoch: epoch.sourceEpoch, consumed: false })
        const inventory: unknown = freezeAgreement<unknown>(after.anchor.canonical)
        return { kind: "review", review, canonical: inventory as Snapshot<JsonObject>, recovery: "retained-inactive", activation: "held" }
      } catch { return authorityUnavailable("stale") }
    })
  }
  function releaseRetainedAuthority(origin: UiOrigin, review: CanonicalAuthorityReview): Promise<CanonicalAuthorityResult> {
    const refused = authorityOrigin(origin)
    if (refused) return Promise.resolve(refused)
    const caller = snapshot(origin), captured = authorityReviews.get(review)
    if (!captured || !sameSyncJson(caller, captured.origin)) return Promise.resolve(authorityUnavailable("stale"))
    return enqueue(async () => {
      try {
        const blocked = authorityBlocked()
        if (blocked) return blocked
        if (captured.consumed || captured.revision !== agreementRevision) return authorityUnavailable("stale")
        const current = await stableAuthority()
        if (current.kind !== "authority-observation") return current
        if (current.stage.kind !== "archive" || captured.revision !== agreementRevision || !agreementSame(current, captured.observation)) return authorityUnavailable("stale")
        captured.consumed = true
        const host = deps.canonicalAuthority
        if (host?.kind !== "fixture") return authorityUnavailable("authority-host")
        if (retainedController) return authorityUnavailable("controller")
        const stopped = authorityBlocked(); if (stopped) return stopped
        const began = await host.begin({ kind: "new", sourceEpoch: captured.sourceEpoch })
        if (began.kind !== "controller") return authorityUnavailable("controller")
        retainedController = { handoffId: began.handoffId, sourceEpoch: began.sourceEpoch, capability: began.capability }
        if (disposed()) return authorityUnavailable("disposed")
        if (began.sourceEpoch !== captured.sourceEpoch || typeof began.handoffId !== "string" || !began.handoffId.trim()) { await abandonController(); return authorityUnavailable("controller") }
        const checked = await stableAuthority()
        if (checked.kind !== "authority-observation" || captured.revision !== agreementRevision || !agreementSame(checked, captured.observation)) {
          await abandonController(); return checked.kind === "authority-observation" ? authorityUnavailable("stale") : checked
        }
        if ((await began.capability.assertCurrent()) !== "current") { await abandonController(); return authorityUnavailable("controller") }
        const accepted = { v: 5, kind: "retained-interim", archive: agreementJson(current.stage.archive), handoff: { kind: "accepted", handoffId: began.handoffId, sourceEpoch: began.sourceEpoch, anchor: agreementJson(current.anchor) }, resolutions: [], pending: { kind: "none" } }
        if (!isJsonObject(accepted) || readRetainedCheckpoint(accepted).kind !== "authority") { await abandonController(); return authorityUnavailable("retention") }
        const write = await authoritySet("accept", current.records, { [interimConversionKey]: accepted })
        if (write.kind !== "resolved" && write.kind !== "rejected") {
          if (write.kind !== "unconfirmed") await abandonController()
          return write
        }
        return await finishAuthority({ ...current.records, [interimConversionKey]: accepted }, [{ stage: "accept", write }])
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    })
  }
  function resumeRetainedAuthority(origin: UiOrigin): Promise<CanonicalAuthorityResult> {
    const refused = authorityOrigin(origin)
    if (refused) return Promise.resolve(refused)
    return enqueue(async () => {
      try {
        const current = await stableAuthority()
        if (current.kind !== "authority-observation") return current
        if (current.stage.kind !== "accepted") return authorityUnavailable(current.stage.kind === "canonical" ? "stale" : "retention")
        const { handoffId, sourceEpoch } = current.stage, host = deps.canonicalAuthority
        if (host?.kind !== "fixture") return authorityUnavailable("authority-host")
        if (!retainedController) {
          const stopped = authorityBlocked(); if (stopped) return stopped
          const began = await host.begin({ kind: "resume", sourceEpoch, handoffId })
          if (began.kind !== "controller") return authorityUnavailable("controller")
          retainedController = { handoffId: began.handoffId, sourceEpoch: began.sourceEpoch, capability: began.capability }
        }
        if (retainedController.handoffId !== handoffId || retainedController.sourceEpoch !== sourceEpoch) return authorityUnavailable("controller")
        return await finishAuthority(current.records, [])
      } catch (error) { return { kind: "failed", stage: "before-set", error } }
    })
  }

  const retainedRecovery = createInterimRecoveryExecution({
    local, sync: sync, startup, host: deps.recovery ?? { kind: "unavailable" }, now: deps.now, generation: deps.generation,
    revision: () => agreementRevision, checkpoint: () => canonical.kind === "active" ? canonical.checkpoint : interimResult && "checkpoint" in interimResult ? interimResult.checkpoint : undefined,
    repairHistory: repairedHistory, barrier: agreementBarrier,
    save(checkpoint) {
      if (checkpoint.v === 5) {
        interimResult = { kind: "canonical-authority", checkpoint, owner: "required" }
      } else interimResult = { kind: checkpoint.pending.kind === "none" ? "confirmed-recovery" : "pending-recovery", checkpoint }
    },
    blocked(): RecoveryUnavailable | undefined {
      if (protocolHeld) return { kind: "unavailable", reason: "consent-held" }
      if (disposed()) return { kind: "unavailable", reason: "disposed" }
      if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
      if (joinHeld || initialization === "pending-join") return { kind: "unavailable", reason: "pending-join" }
      if (initialization === "newer-layout") return { kind: "unavailable", reason: "newer-layout" }
      if (!startup || initialization === "pending") return { kind: "unavailable", reason: "startup" }
      if (interimResult?.kind === "newer-checkpoint") return { kind: "unavailable", reason: "newer-version" }
      if (canonical.kind === "active" && initialization === "ok") return
      if (initialization !== "interim-held" || !interimResult || !("checkpoint" in interimResult)) return { kind: "unavailable", reason: "retention" }
    }
  })
  function recoveryTask<T>(action: () => Promise<T>): Promise<T> {
    return enqueue(async () => { inRecovery = true; try { return await action() } finally { inRecovery = false } })
  }
  const writer: LocalFilterWriter = {
    prepareSettingsImport(origin, text) {
      if (!agreementOrigin(origin) || origin.incognito) return Promise.resolve({ kind: "refused", reason: origin?.incognito ? "private" : "origin" })
      const caller = structuredClone(origin)
      return enqueue(async () => {
        if (initialization !== "ok") return { kind: "unavailable", reason: "startup" }
        return importExecution ? importTask(() => importExecution.prepare(caller, text)) : { kind: "unavailable", reason: "cleanup-host" }
      })
    },
    importSettings(origin, input) {
      if (!agreementOrigin(origin) || origin.incognito) return Promise.resolve({ kind: "refused", reason: origin?.incognito ? "private" : "origin" })
      const caller = structuredClone(origin), requested = input && { confirmation: input.confirmation, replace: input.replace }
      return enqueue(async () => {
        if (initialization !== "ok") return { kind: "unavailable", reason: "startup" }
        return importExecution ? importTask(() => importExecution.confirm(caller, requested)) : { kind: "unavailable", reason: "cleanup-host" }
      })
    },
    resumeSettingsImport(origin) {
      if (!agreementOrigin(origin) || origin.incognito) return Promise.resolve({ kind: "refused", reason: origin?.incognito ? "private" : "origin" })
      return enqueue(resumeImportInLane)
    },
    seeAccountLabel(request) {
      if (request.private !== false) return Promise.resolve({ kind: "refused", reason: "private" })
      if (!isAccountKey(request.acct) || !Number.isSafeInteger(request.at) || request.at < 0) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const captured = { ...request }
      return enqueue(() => seeAccountLabelInLane(captured))
    },
    completeAccountLabel(capture, input) {
      const captured = { acct: input.acct, label: structuredClone(input.label) }
      return enqueue(() => completeAccountLabelInLane(capture, captured))
    },
    exportSettings(origin) {
      if (settingsFileWindow(origin) === "unavailable") return Promise.resolve({ kind: "unavailable", reason: "origin" })
      return enqueue(readSettingsFileInLane)
    },
    importCheck(origin, text) {
      const window = settingsFileWindow(origin)
      if (window !== "normal") return Promise.resolve(checkSettingsFile(window, undefined))
      return enqueue(async () => {
        const plan = checkSettingsFile(window, text, settingsFileUnavailable())
        if (plan.kind !== "import-plan") return plan
        const current = await readSettingsFileInLane()
        return current.kind === "source" ? plan : current
      })
    },
    readWithdrawnWork(origin) {
      const caller = agreementOrigin(origin) ? freezeAgreement(origin) : origin
      return enqueue(() => consentRecovery.read(caller))
    },
    recoverWithdrawnWork(origin, input) {
      const caller = agreementOrigin(origin) ? freezeAgreement(origin) : origin
      return enqueue(() => consentRecovery.recover(caller, input))
    },
    readCanonicalAuthority, releaseRetainedAuthority, resumeRetainedAuthority,
    readInterimRecovery: () => recoveryTask(() => retainedRecovery.read()),
    discardInterimItem(origin, input) {
      if (!agreementOrigin(origin) || !input || !isJsonObject(input.item) || Object.keys(input.item).length !== 3 ||
        typeof input.item.captureId !== "string" || typeof input.item.sourceKey !== "string" || !Array.isArray(input.item.path) ||
        !input.item.path.every(part => typeof part === "string" || typeof part === "number" && Number.isSafeInteger(part) && part >= 0)) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const caller = detachAgreement(origin), requested = { capture: input.capture, item: detachAgreement(input.item) }
      return recoveryTask(() => retainedRecovery.discard(caller, requested))
    },
    prepareInterimPlaylistRestore(origin, input) {
      if (!agreementOrigin(origin) || !input || !isJsonObject(input.item) || Object.keys(input.item).length !== 3 || typeof input.item.captureId !== "string" ||
        typeof input.item.sourceKey !== "string" || !Array.isArray(input.item.path) || !input.item.path.every(part => typeof part === "string" || typeof part === "number" && Number.isSafeInteger(part) && part >= 0)) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const caller = detachAgreement(origin), requested = { capture: input.capture, item: detachAgreement(input.item) }
      return recoveryTask(() => retainedRecovery.preparePlaylist(caller, requested))
    },
    restoreInterimPlaylist(origin, input) {
      const captured = input && retainedRecovery.consumeChoice(input.choice)
      const key = input && typeof input.acct === "string" ? parseDocumentKey(`doc:setup:${input.acct}`) : undefined
      if (!agreementOrigin(origin) || key?.kind !== "setup") return Promise.resolve({ kind: "refused", reason: "invalid" })
      const caller = detachAgreement(origin), acct = key.acct
      return recoveryTask(() => retainedRecovery.restorePlaylist(caller, captured, acct))
    },
    cancelInterimPlaylistRestore: (_origin, choice) => retainedRecovery.cancelPlaylist(choice),
    resumeInterimPlaylistRestore(origin) {
      if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const caller = detachAgreement(origin)
      return recoveryTask(() => retainedRecovery.resume(caller, "playlist-restore"))
    },
    prepareInterimFilterReplacement(origin, input) {
      if (!agreementOrigin(origin) || !input || !isJsonValue(input.item)) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const caller = detachAgreement(origin), requested = { capture: input.capture, item: detachAgreement(input.item) }
      return recoveryTask(() => retainedRecovery.prepare(caller, requested))
    },
    replaceInterimFilter(origin, confirmation) {
      if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const caller = detachAgreement(origin)
      return recoveryTask(() => retainedRecovery.replace(caller, confirmation))
    },
    cancelInterimFilterReplacement: (origin, confirmation) => retainedRecovery.cancel(origin, confirmation),
    resumeInterimFilterReplacement(origin) {
      if (!agreementOrigin(origin)) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const caller = detachAgreement(origin)
      return recoveryTask(() => retainedRecovery.resume(caller))
    },
    beginSyncJoin: origin => beginJoin(origin, false), applySyncJoin, cancelSyncJoin, readSyncJoin, resumeSyncJoin,
    readAgreement, agree, resumeRetainedAgreement,
    readInterimInstallation, installInterimConversion, resumeInterimInstallation,
    readInterimNote() {
      if (canonical.kind === "active" && initialization === "ok") return enqueue(async () => {
        const full = await local.get(null)
        if (canonical.kind !== "active" || disposed() || claimConfirmation === "unconfirmed" || !startup || !coversArchivedSource(full, canonical.checkpoint)) return { kind: "unavailable", reason: disposed() ? "disposed" : "stale" }
        const current = await startup.readInterimSnapshot()
        if (!(await canonicalCurrent(await storage.get(null)))) return { kind: "unavailable", reason: "stale" }
        return projectInterimNote({ checkpoint: canonical.checkpoint, current })
      })
      const unavailable = (): InterimNoteRead | undefined => disposed() ? { kind: "unavailable", reason: "disposed" }
        : initialization !== "interim-held" ? { kind: "unavailable", reason: initialization === "pending" ? "startup" : "stale" }
        : claimConfirmation === "unconfirmed" || !startup || !interimResult || interimResult.kind === "failed" || interimResult.kind === "unconfirmed" || interimResult.kind === "unrepresentable" ? { kind: "unavailable", reason: "stale" } : undefined
      const blocked = unavailable()
      if (blocked) return Promise.resolve(blocked)
      return enqueue(async () => {
        const blocked = unavailable()
        if (blocked) return blocked
        if (!startup || !interimResult) return { kind: "unavailable", reason: "stale" }
        if (interimResult.kind === "invalid") return Object.freeze({ kind: "held", reason: "invalid" })
        if (interimResult.kind === "newer-checkpoint") return Object.freeze({ kind: "held", reason: "newer-version" })
        if (interimResult.kind === "stale") return interimResult.reason === "stopped" ? { kind: "unavailable", reason: "stale" } : Object.freeze({ kind: "held", reason: interimResult.reason })
        if (interimResult.kind === "pending-recovery" || interimResult.kind === "confirmed-recovery" || interimResult.kind === "pending-authority" || interimResult.kind === "canonical-authority") return { kind: "held", reason: "history" }
        if (interimResult.kind === "pending-installation" || interimResult.kind === "installed-interim") {
          try {
            const current = await stableInstallation()
            const stopped = unavailable()
            if (stopped) return stopped
            if (current.kind !== "installation-observation") return { kind: "unavailable", reason: "stale" }
            return projectInterimInstallationNote({ checkpoint: interimResult.checkpoint, current: current.retained, history: current.history })
          } catch { return { kind: "unavailable", reason: "stale" } }
        }
        if (interimResult.kind !== "retained-but-held" && interimResult.kind !== "retained-agreement" && interimResult.kind !== "pending-agreement") return { kind: "unavailable", reason: "stale" }
        const checkpoint = interimResult.checkpoint
        try {
          await local.get(null)
          const first = projectInterimNote({ checkpoint, current: await startup.readInterimSnapshot() })
          const stopped = unavailable()
          if (stopped) return stopped
          if (first.kind === "held") return first
          await local.get(null)
          const current = await startup.readInterimSnapshot()
          return unavailable() ?? projectInterimNote({ checkpoint, current })
        } catch { return { kind: "unavailable", reason: "stale" } }
      })
    },
    prepareAccountRemoval(origin, acct) {
      const blocked = removalUnavailable() ?? removalOrigin(origin)
      if (blocked) return Promise.resolve(blocked)
      const caller = snapshot(origin)
      return enqueue(async () => {
        const blocked = removalUnavailable()
        if (blocked) return blocked
        const pending = await completePendingRemoval()
        if (pending.kind !== "committed" && pending.kind !== "unchanged") return pending.kind === "failed"
          ? { kind: "failed", stage: "prepare", error: pending.error } : { kind: "unavailable", reason: "pending-removal" }
        const prepared = await prepareAccountRemovalCapture(removalDependencies, acct)
        if (prepared.kind !== "captured") return prepared
        const confirmation: RemovalConfirmation = Object.freeze({ kind: "account-removal-confirmation" })
        confirmations.set(confirmation, { origin: caller, capture: prepared.capture })
        return { kind: "confirmation-required", confirmation, acct, label: prepared.capture.label, scope: Object.freeze({ ...prepared.capture.scope }) }
      })
    },
    removeAccountSetup(origin, confirmation) {
      const blocked = removalUnavailable() ?? removalOrigin(origin)
      if (blocked) return Promise.resolve(blocked)
      const saved = confirmations.get(confirmation)
      if (!saved || !sameSyncJson(saved.origin, origin)) return Promise.resolve({ kind: "unavailable", reason: "stale" })
      confirmations.delete(confirmation)
      const arrivalEpoch = epoch
      const arrival = lifetime.kind === "active" ? clock() : undefined
      return enqueue(async () => {
        const blocked = removalUnavailable()
        if (blocked) return blocked
        const result = await runAccountRemoval(saved.capture)
        if (result.kind === "committed" && !disposed()) {
          publishRemoval(saved.capture.acct, "local")
          quietUntil = deps.syncClock.now() + 2000
          if (lifetime.kind === "active") arm(Math.max(quietUntil, mutationPace.nextInvocation), arrival ? { kind: "edit", ...arrival, epoch: arrivalEpoch } : undefined)
        }
        return result
      })
    },
    readPlaylistCache(request) {
      if (!isAccountKey(request.acct) || typeof request.private !== "boolean") return Promise.resolve({ kind: "invalid", part: "request" })
      const captured = { acct: request.acct, private: request.private }
      return enqueue(() => readPlaylistCacheInLane(captured))
    },
    absorbPlaylistCache(capture, input) {
      const requested = structuredClone(input)
      return enqueue(() => absorbPlaylistCacheInLane(capture, requested))
    },
    readTabProjection(request) {
      const blocked = projectionUnavailable()
      if (blocked) return Promise.resolve(blocked)
      if (!isTabProjectionRequest(request)) return Promise.resolve({ kind: "invalid", part: "request" })
      const captured: TabProjectionRequest = { private: request.private, account: { ...request.account } }
      return enqueue(() => readTabProjectionInLane(captured))
    },
    readLastAccount(scope) {
      const blocked = projectionUnavailable()
      if (blocked) return Promise.resolve(blocked)
      if (!isNormalWindowRouting(scope)) return Promise.resolve({ kind: "invalid", part: "request" })
      return enqueue(async () => {
        const read = await readProjectionRecordsInLane()
        return read.kind === "records" ? projectLastAccount(read.records, read.device.lastAccount) : read
      })
    },
    readSession() {
      const blocked = sessionUnavailable()
      return blocked ? Promise.resolve(blocked) : enqueue(readSessionInLane)
    },
    changeSession(change) {
      const blocked = sessionUnavailable()
      if (blocked) return Promise.resolve(blocked)
      const requested: SessionChange = { revision: { reset: change.revision.reset, accounts: new Map(change.revision.accounts) }, now: change.now, edits: [change.edits[0], ...change.edits.slice(1)] }
      return enqueue(() => changeSessionInLane(requested))
    },
    readClaimNotice() {
      if (disposed()) return Promise.reject(new Error("Writer disposed"))
      const blocked = noticeUnavailable()
      if (blocked) return Promise.resolve(blocked)
      return enqueue(async () => {
        const blocked = noticeUnavailable()
        if (blocked) return blocked
        const records = await guardedLocal.get(null)
        const stopped = noticeUnavailable()
        return stopped ?? projectClaimNotice({ records })
      })
    },
    acknowledgeClaimNotice(origin, expected) {
      if (disposed()) return Promise.reject(new Error("Writer disposed"))
      const blocked = noticeUnavailable()
      if (blocked) return Promise.resolve(blocked)
      if (!isJsonObject(origin) || origin.kind !== "ui" || origin.incognito !== false || !Number.isSafeInteger(origin.windowId) || typeof origin.windowId !== "number" || origin.windowId < 0) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const compare = projectClaimNotice({ records: { schema: STORAGE_SCHEMA_VERSION, device: {
        id: "notice-comparison", consent: { v: CONSENT_VERSION, at: 0 }, claimNotice: expected
      } } })
      if (compare.kind !== "pending") return Promise.resolve({ kind: "refused", reason: "invalid" })
      return enqueue(async () => {
        const blocked = noticeUnavailable()
        if (blocked) return blocked
        const result = await executeClaimNoticeAcknowledgement({ local: guardedLocal, expected: compare.notice, isStopped: () => noticeUnavailable() !== undefined })
        if (result.kind === "unconfirmed") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        return result
      })
    },
    read(_view) {
      const unavailable = (): SettingsRead | undefined => featurePending ? { kind: "unavailable", reason: "consent-held" } : disposed() ? { kind: "unavailable", reason: "disposed" }
        : initialization !== "ok" ? { kind: "unavailable", reason: protocolHeld ? "consent-held" : initialization === "newer-layout" ? "newer-layout" : "startup" }
        : claimConfirmation === "unconfirmed" ? { kind: "unavailable", reason: "stale" } : undefined
      const blocked = unavailable()
      if (blocked) return Promise.resolve(blocked)
      return enqueue(async () => {
        const blocked = unavailable()
        if (blocked) return blocked
        const records = await guardedLocal.get(["schema", "doc:settings"])
        const stale = unavailable()
        if (stale) return stale
        if (typeof records.schema === "number" && Number.isSafeInteger(records.schema) && records.schema > STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "newer-layout" }
        if (records.schema !== STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "startup" }
        return readSettingsView(records["doc:settings"])
      })
    },
    subscribe(fn) {
      return listen(event => event.kind === "settings-changed" ? fn(event) : undefined)
    },
    subscribeSetup(fn) {
      return listen(event => event.kind === "setup-changed" ? fn(event) : undefined)
    },
    subscribeView(fn, revoked = () => {}) {
      if (subscriptionsClosed()) return () => {}
      const registered = (event: ConfirmedViewChange) => fn(event)
      viewListeners.add(registered)
      const stop = () => revoked()
      viewRevocations.add(stop)
      return () => { viewListeners.delete(registered); viewRevocations.delete(stop) }
    },
    readSetup(acct) {
      const unavailable = (): SetupRead | undefined => disposed() ? { kind: "unavailable", reason: "disposed" }
        : initialization !== "ok" ? { kind: "unavailable", reason: protocolHeld ? "consent-held" : initialization === "newer-layout" ? "newer-layout" : "startup" }
        : claimConfirmation === "unconfirmed" ? { kind: "unavailable", reason: "stale" } : undefined
      const blocked = unavailable()
      if (blocked) return Promise.resolve(blocked)
      if (!isAccountKey(acct)) return Promise.resolve({ kind: "invalid" })
      return enqueue(async () => {
        const blocked = unavailable()
        if (blocked) return blocked
        const records = await guardedLocal.get(["schema", "doc:settings", documentKey({ kind: "setup", acct })])
        const stale = unavailable()
        if (stale) return stale
        if (typeof records.schema === "number" && Number.isSafeInteger(records.schema) && records.schema > STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "newer-layout" }
        if (records.schema !== STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "startup" }
        return readAccountSetup(records, acct)
      })
    },
    readAutoAddChoice(origin, request) {
      const refused = removalOrigin(origin)
      if (refused) return Promise.resolve({ kind: "refused", reason: refused.result.refused })
      if (setupUnavailable()) return Promise.resolve({ kind: "refused", reason: "unavailable" })
      if (!isAutoAddReadChange(request)) return Promise.resolve({ kind: "refused", reason: "invalid" })
      const requested = { ...request }, caller = snapshot(origin)
      return enqueue(async () => {
        if (setupUnavailable()) return { kind: "refused", reason: "unavailable" }
        try {
          const records = await guardedLocal.get(null)
          if (setupUnavailable() || authority(records).kind !== "ready") return { kind: "refused", reason: "unavailable" }
          const read = readAccountSetup(records, requested.acct)
          if (read.kind !== "value") return { kind: "refused", reason: read.kind === "newer-version" ? "update-needed" : "invalid" }
          const lifetime = crypto.randomUUID()
          if (!isAutoAddLifetime(lifetime)) return { kind: "refused", reason: "unavailable" }
          autoAddCaptures.set(lifetime, { origin: caller, acct: requested.acct, playlist: requested.playlist, revision: sessionRevisionView() })
          if (autoAddCaptures.size > 256) {
            const oldest = autoAddCaptures.keys().next()
            if (!oldest.done) autoAddCaptures.delete(oldest.value)
          }
          return { kind: "value", acct: requested.acct, playlist: requested.playlist, lifetime, fact: autoAddFact(read.view, requested.playlist) }
        } catch { return { kind: "refused", reason: "rejected" } }
      })
    },
    changeAutoAddChoice(origin, change) {
      const refused = removalOrigin(origin)
      if (refused) return Promise.resolve(refused)
      const blocked = setupUnavailable()
      if (blocked) return Promise.resolve(blocked)
      if (!isAutoAddChoiceChange(change)) return Promise.resolve({ kind: "result", result: { refused: "invalid" } })
      const requested = { ...change, edit: { ...change.edit } }, caller = { ...origin }
      return enqueue(async () => {
        const blocked = setupUnavailable()
        if (blocked) return blocked
        if (!autoAddCurrent(caller, requested)) return { kind: "stale", reason: "setup" }
        const result = await executeSetupEdit({ local: guardedLocal, sync: sync, authority: records => retainedHold(records) ? { kind: "unavailable", reason: "startup" } : authority(records), repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation, remove: runAccountRemoval }, requested.acct,
          records => autoAddCurrent(caller, requested) ? planAutoAddChoice(records, requested) : { kind: "stale", reason: "setup" })
        if (result.kind === "unconfirmed" || result.kind === "failed" && result.stage === "set") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        if (result.kind === "committed") {
          if (result.view.kind === "none") publishRemoval(requested.acct, "local")
          else emit({ kind: "setup-changed", source: "local", acct: requested.acct })
          quietUntil = deps.syncClock.now() + 2000
          if (lifetime.kind === "active") {
            const arrival = clock()
            const event: SyncEvent | undefined = arrival ? { kind: "edit", ...arrival, epoch } : undefined
            arm(Math.max(quietUntil, mutationPace.nextInvocation), event)
          }
        }
        if (result.kind !== "unchanged") return result
        try {
          const records = await guardedLocal.get(null)
          if (!isJsonObject(records) || setupUnavailable() || authority(records).kind !== "ready" || !autoAddCurrent(caller, requested)) return { kind: "unavailable", reason: "stale" }
          const plan = planAutoAddChoice(records, requested), read = readAccountSetup(records, requested.acct)
          return plan.kind === "unchanged" && read.kind === "value" ? { kind: "current", view: read.view } : { kind: "stale", reason: "destination" }
        } catch (error) { return { kind: "failed", stage: "before-set", error } }
      })
    },
    changeSetupDestination(origin, change) {
      if (disposed()) return Promise.resolve({ kind: "unavailable", reason: "disposed" })
      const refused = removalOrigin(origin)
      if (refused) return Promise.resolve(refused)
      const blocked = setupUnavailable()
      if (blocked) return Promise.resolve(blocked)
      const requested = parseSetupDestinationChange(change)
      if (!requested) return Promise.resolve({ kind: "result", result: { refused: "invalid" } })
      const arrivalEpoch = epoch
      const arrival = lifetime.kind === "active" ? clock() : undefined
      return enqueue(async () => {
        const blocked = setupUnavailable()
        if (blocked) return blocked
        const result = await executeSetupDestination({ local: guardedLocal, sync: sync, authority: records => retainedHold(records) ? { kind: "unavailable", reason: "startup" } : authority(records), repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation, remove: runAccountRemoval }, requested)
        if (result.kind === "unconfirmed" || result.kind === "failed" && result.stage === "set") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        if (result.kind === "committed") {
          if (result.view.kind === "none") publishRemoval(requested.acct, "local")
          else emit({ kind: "setup-changed", source: "local", acct: requested.acct })
          quietUntil = deps.syncClock.now() + 2000
          if (lifetime.kind === "active") {
            const event: SyncEvent | undefined = arrival ? { kind: "edit", ...arrival, epoch: arrivalEpoch } : undefined
            arm(Math.max(quietUntil, mutationPace.nextInvocation), event)
          }
        }
        return result
      })
    },
    async changeKeySetting(origin, change, principal) {
      if (!agreementOrigin(origin) || !isKeySettingChange(change)) return { kind: "refused", reason: "invalid" }
      const requested = structuredClone(change)
      return enqueue(async () => {
        if (disposed() || !keyExecution || initialization !== "ok" || protocolHeld || featurePending || importPending || keyPending || resetPending || claimConfirmation === "unconfirmed") return { kind: "refused", reason: "unavailable" }
        inKeyExecution = true
        try {
          const result = await keyExecution.change(requested, principal)
          const after = await storage.get(null); recognizeImport(after)
          if (result.uncertain || keyPending) {
            keyExecution.revoke(); cancelTicket(); revokeViews()
            if (!keyPending) { claimConfirmation = "unconfirmed"; deactivate("stopped") }
          }
          if (result.settingsChanged) {
            emitSettings("local")
            for (const acct of result.accounts) emit({ kind: "setup-changed", source: "local", acct })
            quietUntil = deps.syncClock.now() + 2000
            const event = ingress("edit")
            if (lifetime.kind === "active") arm(Math.max(quietUntil, mutationPace.nextInvocation), event)
          }
          return result.answer
        } catch {
          keyExecution.revoke(); claimConfirmation = "unconfirmed"; deactivate("stopped")
          return { kind: "refused", reason: "unconfirmed" }
        } finally { inKeyExecution = false }
      })
    },
    async changeFeatureSetting(origin, change) {
      if (disposed()) return { kind: "unavailable", reason: "disposed" }
      if (!agreementOrigin(origin) || !isFeatureSettingChange(change)) return { kind: "refused", reason: "invalid" }
      const requested = structuredClone(change)
      return enqueue(async () => {
        if (disposed()) return { kind: "unavailable", reason: "disposed" }
        if (initialization !== "ok" || protocolHeld || featurePending || importPending || keyPending || resetPending) return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
        if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
        inFeatureExecution = true
        try {
          const keyRecord = readKeySettingsProgress((await guardedLocal.get([keySettingsProgressKey]))[keySettingsProgressKey])
          const retired = new Set<string>(keyRecord.kind === "valid" ? keyRecord.record.retired : [])
          const allocate = deps.allocateShortcut ?? (() => crypto.randomUUID().replaceAll("-", "").slice(0, 6))
          const allocateUnretired = () => {
            for (let attempt = 0; attempt < 32; attempt++) {
              const id = allocate()
              if (!retired.has(id)) return id
            }
            return ""
          }
          const result = await executeFeatureSetting({ local: guardedLocal, sync,
            authority: records => retainedHold(records) ? { kind: "unavailable", reason: "startup" } : authority(records),
            repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation,
            access: deps.featureAccess, allocateShortcut: allocateUnretired }, requested)
          const after = await storage.get(null); recognizeImport(after)
          if (result.kind === "unconfirmed" || result.kind === "failed" && result.stage === "set") {
            cancelTicket(); revokeViews()
            if (!featurePending) { claimConfirmation = "unconfirmed"; deactivate("stopped") }
          }
          if (result.kind === "committed" || result.kind === "permission-release-unconfirmed" && result.settingsChanged) {
            emitSettings("local")
            quietUntil = deps.syncClock.now() + 2000
            const event = ingress("edit")
            if (lifetime.kind === "active") arm(Math.max(quietUntil, mutationPace.nextInvocation), event)
          }
          return result
        } catch (error) { claimConfirmation = "unconfirmed"; deactivate("stopped"); return { kind: "unconfirmed", cause: { kind: "read-failed", error } } }
        finally { inFeatureExecution = false }
      })
    },
    async changeSharedSetting(origin, change) {
      if (disposed()) return { kind: "unavailable", reason: "disposed" }
      if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
      if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
      if (origin.kind !== "ui" || !Number.isInteger(origin.windowId) || origin.windowId < 0 || typeof origin.incognito !== "boolean") return { kind: "result", result: { refused: "invalid" } }
      const requested = { ...change }
      const arrivalEpoch = epoch
      const arrival = lifetime.kind === "active" ? clock() : undefined
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
        const result = await executeSharedSetting({ local: guardedLocal, sync: sync, authority: records => retainedHold(records) ? { kind: "unavailable", reason: "startup" } : authority(records), repairHistory: repairedHistory, disposed, now: deps.now, generation: deps.generation }, requested)
        if (result.kind === "unconfirmed" || result.kind === "failed" && result.stage === "set") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        if (result.kind === "committed") {
          emitSettings("local")
          quietUntil = deps.syncClock.now() + 2000
          if (lifetime.kind === "active") {
            const event: SyncEvent | undefined = arrival ? { kind: "edit", ...arrival, epoch: arrivalEpoch } : undefined
            arm(Math.max(quietUntil, mutationPace.nextInvocation), event)
          }
        }
        return result
      })
    },
    claim() {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok") return Promise.resolve({ kind: "unavailable", reason: "startup" })
      if (claimConfirmation === "unconfirmed") return Promise.resolve({ kind: "unavailable", reason: "stale" })
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
        if (deps.claim.kind === "unavailable") return { kind: "unavailable", reason: "authority" }
        const result = await executeLocalClaim({ local: guardedLocal, host: deps.claim, now: deps.now, generation: deps.generation })
        if (result.kind === "unconfirmed") {
          claimConfirmation = "unconfirmed"
          deactivate("stopped")
        }
        return result
      })
    },
    receiveSyncReset() {
      if (lifetime.kind === "disposed") return Promise.resolve({ kind: "reset-held", reason: "disposed" })
      return enqueue(() => receiveResetInLane())
    },
    receiveSyncDocument(key) {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok") return Promise.resolve({ kind: "unavailable", reason: "authority" })
      if (claimConfirmation === "unconfirmed") return Promise.resolve({ kind: "unavailable", reason: "authority" })
      return enqueue(() => receiveAttempt(key))
    },
    flushSync() {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok" && initialization !== "pending-join") return Promise.resolve({ kind: "unavailable" })
      if (claimConfirmation === "unconfirmed") return Promise.resolve({ kind: "unavailable" })
      const event = ingress("manual")
      return enqueue(() => attempt(event))
    },
    startSync() {
      if (lifetime.kind === "disposed") return Promise.reject(new Error("Writer disposed"))
      if (initialization !== "ok" && initialization !== "pending-join") return Promise.resolve()
      if (claimConfirmation === "unconfirmed") return Promise.resolve()
      const event = ingress("start")
      return enqueue(async () => {
        if (claimConfirmation === "unconfirmed" || lifetime.kind === "stopped" || lifetime.kind === "disposed") return
        let ready
        try {
          const records = await (joinHeld ? local : guardedLocal).get(null)
          if (disposed()) return
          const checkpoint = readSyncJoinCheckpoint(records[pendingSyncJoinKey])
          const observingJoin = checkpoint.kind === "valid" && (checkpoint.checkpoint.phase === "outbound" || checkpoint.checkpoint.phase === "choice")
          ready = authority(records)
          if (observingJoin && isJsonObject(records.device) && decodeDevice(records.device).syncOn && decodeDevice(records.device).consent?.v === CONSENT_VERSION) ready = { kind: "ready", device: decodeDevice(records.device), rawDevice: records.device, history: undefined }
          if (ready.kind === "ready") {
            observeOff(ready.device.syncOn)
            if (retainedHold(records)) {
              if (!disposed() && !protocolHeld) deps.onSyncResult({ kind: "unavailable" })
              return
            }
            if (ready.device.syncOn && lifetime.kind === "inactive") {
              const unsubscribe = sync.subscribe(() => {
                if (claimConfirmation === "unconfirmed" || lifetime.kind !== "active") return
                const incoming = ingress("sync")
                void enqueue(() => automatic(incoming))
              })
              if (joinDeps.stopped()) { unsubscribe(); return }
              lifetime = { kind: "active", unsubscribe }
            }
          }
        } catch (error) {
          deactivate("stopped")
          if (!disposed() && !protocolHeld) deps.onSyncResult({ kind: "rejected", error })
          return
        }
        if (ready.kind !== "ready") { if (!disposed() && !protocolHeld) deps.onSyncResult({ kind: "unavailable" }); return }
        if (ready.device.syncOn) await automatic(event)
      })
    },
    dispose() {
      cancelJoinPreparations()
      autoAddCaptures.clear()
      agreementRevision++
      epoch++
      listeners.clear(); revokeViews()
      deactivate("disposed")
      return lane.then(releaseCapabilities)
    },
    async change(origin, change) {
      if (lifetime.kind === "disposed") throw new Error("Writer disposed")
      if (initialization !== "ok") return { kind: "unavailable", reason: initialization === "newer-layout" ? "newer-layout" : "startup" }
      if (claimConfirmation === "unconfirmed") return { kind: "unavailable", reason: "stale" }
      if (origin.kind !== "ui" || origin.incognito !== false || !Number.isInteger(origin.windowId) || origin.windowId < 0) {
        return { kind: "result", result: { refused: "private" } }
      }
      const at = deps.now()
      const event = ingress("edit")
      const requested: LocalFilterChange = { ...change, desired: { ...change.desired } }
      return enqueue(() => execute(requested, at, event))
    }
  }
  return { writer, readiness }
}
