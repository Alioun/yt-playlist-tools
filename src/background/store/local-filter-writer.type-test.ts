import type { SessionPort, SessionStorage, SessionRead, SessionWrite, SessionChange } from "./session-memory"
import type { TabProjectionRequest, TabProjectionRead, NormalWindowRouting, LastAccountRead } from "./tab-projection"
import type { RecoveryHost, RecoveryCapture, FilterReplacementConfirmation, RecoveryRead, RecoveryPreparation, RecoveryTransactionResult, PlaylistDestinationChoice, PlaylistRestorePreparation } from "./interim-recovery-execution"
import type { RecoveryItemId } from "./interim-recovery-review"
import type { CanonicalAuthorityHost, CanonicalAuthorityRead, CanonicalAuthorityReview, CanonicalAuthorityResult } from "./interim-canonical-authority"
import type { InterimInstallationReview, InterimInstallationStatus, InterimInstallationResult } from "./interim-installation"
import type { SyncJoinHost, SyncJoinOperation, SyncJoinReview, SyncJoinSide, SyncJoinResult, SyncJoinStatus } from "./sync-join-execution"
import type { ClaimHost, ClaimTransactionResult } from "./local-claim-writer"
import type { AccountKey, PlaylistId, DocumentKey, SyncOpaqueWrite } from "../../shared/model"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import type { JsonValue } from "../../shared/contracts/json"
import type { FilterSettingInput } from "./channel-filter-edit"
import { createLocalFilterWriter, type LocalFilterChange, type LocalFilterWriteResult, type LocalWriteStorage, type SyncStorage, type SyncClock, type SyncAutomaticResult, type SyncFlushResult, type SyncReceiveKey, type SyncReceiveResult } from "./local-filter-writer"
import type { SyncDocumentRecord } from "./sync-write-admission"
import type { createBrowserLocalFilterWriter } from "../adapters/local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type UiOrigin = Extract<Origin, { kind: "ui" }>
type ExpectedChange = {
  readonly acct: AccountKey
  readonly playlist: PlaylistId
  readonly desired: FilterSettingInput["desired"]
} & (
  | { readonly clearListedChannels: "not-confirmed" }
  | { readonly clearListedChannels: "confirmed"; readonly expectedGeneration: string | null }
)
type ExpectedResult =
  | { readonly kind: "unconfirmed"; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }
  | { readonly kind: "result"; readonly result: ChangeResult }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "sync-writer-required" | "account-context" | "stale" }
type ExpectedStorage = {
  get(keys: readonly string[] | null): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonValue>>): Promise<void>
}
import type { ClaimNotice } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import type { ClaimNoticeRead, ClaimNoticeAcknowledgement, NormalUiOrigin } from "./claim-notice"
import type { SettingsRead, SettingsEvent } from "./local-filter-writer"
import type { SharedSettingChange } from "./settings-edit"
import type { FeatureSettingChange } from "../../shared/contracts/shared-settings"
import type { FeatureSettingWriteResult } from "./feature-settings-execution"
import type { KeySettingChange, KeySettingAnswer } from "../../shared/contracts/key-settings"
import type { LocalSettingsWriteResult } from "./shared-setting-execution"
import type { SetupRead } from "./local-filter-writer"
import type { SetupDestinationChange, SetupEvent } from "./setup-edit"
import type { SetupDestinationResult } from "./setup-edit-execution"

import type { AccountRemovalHost, RemovalConfirmation, RemovalPreparation, RemovalResult } from "./account-removal-execution"

import type { InterimNoteRead } from "./interim-persistence"

import type { AgreementRead, AgreementInput, AgreementResult } from "./consent-agreement"

type ExpectedFactory = (deps: {
  readonly syncMutationPace?: import("./sync-mutation-pacing").SyncMutationPace
  readonly resetReceive?: import("./sync-reset-receive").SyncResetReceiveHost
  readonly settingsImport?: import("./settings-import-execution").SettingsImportHost
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
}) => { receiveSyncReset(): Promise<import("./sync-reset-receive").ReceivedResetResult>; changeKeySetting(origin: UiOrigin, change: KeySettingChange, principal: string | undefined): Promise<KeySettingAnswer>; changeFeatureSetting(origin: UiOrigin, change: FeatureSettingChange): Promise<FeatureSettingWriteResult>; readSession(): Promise<SessionRead>; changeSession(change: SessionChange): Promise<SessionWrite>; prepareInterimPlaylistRestore(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<PlaylistRestorePreparation>; restoreInterimPlaylist(origin: UiOrigin, input: { readonly choice: PlaylistDestinationChoice; readonly acct: AccountKey }): Promise<RecoveryTransactionResult>; cancelInterimPlaylistRestore(origin: UiOrigin, choice: PlaylistDestinationChoice): void; resumeInterimPlaylistRestore(origin: UiOrigin): Promise<RecoveryTransactionResult>; readCanonicalAuthority(origin: UiOrigin): Promise<CanonicalAuthorityRead>; releaseRetainedAuthority(origin: UiOrigin, review: CanonicalAuthorityReview): Promise<CanonicalAuthorityResult>; resumeRetainedAuthority(origin: UiOrigin): Promise<CanonicalAuthorityResult>; readInterimRecovery(): Promise<RecoveryRead>; discardInterimItem(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<RecoveryTransactionResult>; prepareInterimFilterReplacement(origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }): Promise<RecoveryPreparation>; replaceInterimFilter(origin: UiOrigin, confirmation: FilterReplacementConfirmation): Promise<RecoveryTransactionResult>; cancelInterimFilterReplacement(origin: UiOrigin, confirmation: FilterReplacementConfirmation): void; resumeInterimFilterReplacement(origin: UiOrigin): Promise<RecoveryTransactionResult>; readInterimInstallation(origin: UiOrigin): Promise<InterimInstallationStatus>; installInterimConversion(origin: UiOrigin, review: InterimInstallationReview): Promise<InterimInstallationResult>; resumeInterimInstallation(origin: UiOrigin): Promise<InterimInstallationResult>; beginSyncJoin(origin: UiOrigin): SyncJoinOperation; applySyncJoin(origin: UiOrigin, input: { readonly kind: "automatic"; readonly review: SyncJoinReview } | { readonly kind: "choice"; readonly review: SyncJoinReview; readonly choice: SyncJoinSide }): Promise<SyncJoinResult>; cancelSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>; readSyncJoin(origin: UiOrigin): Promise<SyncJoinStatus>; resumeSyncJoin(origin: UiOrigin): Promise<SyncJoinResult>; readAgreement(origin: UiOrigin): Promise<AgreementRead>; agree(origin: UiOrigin, input: AgreementInput): Promise<AgreementResult>; resumeRetainedAgreement(origin: UiOrigin): Promise<AgreementResult>; readInterimNote(): Promise<InterimNoteRead>; prepareAccountRemoval(origin: UiOrigin, acct: AccountKey): Promise<RemovalPreparation>; removeAccountSetup(origin: UiOrigin, confirmation: RemovalConfirmation): Promise<RemovalResult>; readClaimNotice(): Promise<ClaimNoticeRead>; acknowledgeClaimNotice(origin: NormalUiOrigin, expected: Snapshot<ClaimNotice>): Promise<ClaimNoticeAcknowledgement>; read(view: "settings"): Promise<SettingsRead>; subscribe(fn: (event: SettingsEvent) => void): () => void; changeSharedSetting(origin: UiOrigin, change: SharedSettingChange): Promise<LocalSettingsWriteResult>; readSetup(acct: AccountKey): Promise<SetupRead>; subscribeSetup(fn: (event: SetupEvent) => void): () => void; subscribeView(fn: (event: import("./local-filter-writer").ConfirmedViewChange) => void, revoked?: () => void): () => void; changeSetupDestination(origin: UiOrigin, change: SetupDestinationChange): Promise<SetupDestinationResult>; claim(): Promise<ClaimTransactionResult>; change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>; receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>; flushSync(): Promise<SyncFlushResult>; startSync(): Promise<void>; dispose(): Promise<void>; readPlaylistCache: import("./playlist-cache").PlaylistCacheOwner["readPlaylistCache"]; absorbPlaylistCache: import("./playlist-cache").PlaylistCacheOwner["absorbPlaylistCache"]; exportSettings: import("./settings-file-read").SettingsFileOwner["exportSettings"]; importCheck: import("./settings-file-read").SettingsFileOwner["importCheck"]; prepareSettingsImport: import("./settings-import-execution").SettingsImportOwner["prepareSettingsImport"]; importSettings: import("./settings-import-execution").SettingsImportOwner["importSettings"]; resumeSettingsImport: import("./settings-import-execution").SettingsImportOwner["resumeSettingsImport"]; seeAccountLabel: import("./account-label").AccountLabelsOwner["seeAccountLabel"]; completeAccountLabel: import("./account-label").AccountLabelsOwner["completeAccountLabel"] }
type NativeBrowser = Parameters<typeof createBrowserLocalFilterWriter>[0]
type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
type ExpectedAdapter = (nativeBrowser: NativeBrowser, options: { onSyncResult: (result: SyncAutomaticResult) => void }) => {
  session: SessionPort
  changeFromSettings(raw: unknown, sender: NativeSender): Promise<LocalFilterWriteResult>
  receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>
  flushSync(): Promise<SyncFlushResult>
  startSync(): Promise<void>
  dispose(): Promise<void>
}

type ExpectedReceive =
  | { readonly kind: "idle" }
  | { readonly kind: "adopted"; readonly received: SyncDocumentRecord }
  | { readonly kind: "unavailable"; readonly reason: "authority" | "history" | "account-context" | "document" | "pending" | "conflict" }
  | { readonly kind: "local-set-failed"; readonly error: unknown; readonly received: SyncDocumentRecord }
  | { readonly kind: "cleanup-failed"; readonly error: unknown; readonly received: SyncDocumentRecord }
  | { readonly kind: "unconfirmed"; readonly received: SyncDocumentRecord; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }

export type LocalWriterProofs = [
  Check<Equal<SyncOpaqueWrite, { gate: null | { kind: "pending" | "held"; notBefore: number }; diagnostic: null | { name: string | null; message: string | null } }>>,
  Check<Equal<Extract<SyncFlushResult, { kind: "sync-set-failed" }>, { kind: "sync-set-failed"; error: unknown; sent: readonly SyncDocumentRecord[]; recoveryPersistence?: { error: unknown } }>>,
  Check<Equal<SyncReceiveKey, Extract<DocumentKey, { kind: "settings" | "filter" | "setup" }>>>,
  Check<Equal<SyncReceiveResult, ExpectedReceive>>,
  Check<Equal<LocalFilterChange, ExpectedChange>>,
  Check<Equal<LocalFilterWriteResult, ExpectedResult>>,
  Check<Equal<LocalWriteStorage, ExpectedStorage>>,
  Check<Equal<SyncStorage, { get(): Promise<Readonly<Record<string, unknown>>>; set(items: Readonly<Record<string, JsonValue>>): Promise<void>; subscribe(changed: () => void): () => void }>>,
  Check<Equal<SyncClock, { now(): number; wallNow(): number; after(milliseconds: number, run: () => void): () => void }>>,
  Check<Equal<SyncAutomaticResult, SyncFlushResult | import("./local-filter-writer").SyncReconciliationNotice | import("./sync-reset-receive").ReceivedResetResult | { kind: "rejected"; error: unknown }>>,
  Check<Equal<Omit<ReturnType<typeof createLocalFilterWriter>, "readWithdrawnWork" | "recoverWithdrawnWork" | "readTabProjection" | "readLastAccount" | "readAutoAddChoice" | "changeAutoAddChoice">, ReturnType<ExpectedFactory>>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readTabProjection"], (request: TabProjectionRequest) => Promise<TabProjectionRead>>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readLastAccount"], (scope: NormalWindowRouting) => Promise<LastAccountRead>>>,
  Check<Equal<typeof createBrowserLocalFilterWriter, ExpectedAdapter>>,
  Check<Equal<keyof typeof import("./local-filter-writer"), "createLocalFilterWriter" | "createStartingLocalFilterWriter" | "StartupReadinessError">>,
  Check<Equal<keyof typeof import("../adapters/local-filter-writer"), "createBrowserLocalFilterWriter">>,
  Check<Equal<string extends LocalFilterChange["acct"] ? true : false, false>>,
  Check<Equal<string extends LocalFilterChange["playlist"] ? true : false, false>>,
  Check<Equal<Omit<Extract<LocalFilterChange, { clearListedChannels: "confirmed" }>, "expectedGeneration"> extends LocalFilterChange ? true : false, false>>,
  Check<Equal<Extract<Origin, { kind: "background" | "sync" | "tab" }> extends UiOrigin ? true : false, false>>,
  Check<Equal<LocalFilterChange["desired"], Readonly<LocalFilterChange["desired"]>>>
]

function receiveTypeBoundaries(writer: ReturnType<typeof createLocalFilterWriter>, adapter: ReturnType<typeof createBrowserLocalFilterWriter>, acct: AccountKey, playlist: PlaylistId, result: SyncReceiveResult) {
  void writer.receiveSyncDocument({ kind: "settings" })
  void adapter.receiveSyncDocument({ kind: "settings" })
  void writer.receiveSyncDocument({ kind: "filter", acct, playlist })
  void writer.receiveSyncDocument({ kind: "setup", acct })
  void adapter.receiveSyncDocument({ kind: "setup", acct })
  // @ts-expect-error Setup requires its account address.
  void writer.receiveSyncDocument({ kind: "setup" })
  // @ts-expect-error Setup accounts require the validated brand.
  void adapter.receiveSyncDocument({ kind: "setup", acct: "AAAAAAAAAAAAAAAA" })
  // @ts-expect-error Other document kinds are outside the receiver.
  void writer.receiveSyncDocument({ kind: "device", acct })
  // @ts-expect-error Filter addresses require a branded account value.
  void writer.receiveSyncDocument({ kind: "filter", acct: "AAAAAAAAAAAAAAAA", playlist })
  // @ts-expect-error Filter addresses require a branded playlist value.
  void writer.receiveSyncDocument({ kind: "filter", acct, playlist: "PL_P" })
  if (result.kind === "adopted") {
    // @ts-expect-error The adopted record cannot be replaced.
    result.received = result.received
  }
  // @ts-expect-error Receive outcomes are immutable.
  result.kind = "idle"
  const key: Readonly<SyncReceiveKey> = { kind: "filter", acct, playlist }
  void writer.receiveSyncDocument(key)
  // @ts-expect-error Immutable caller keys stay immutable.
  key.playlist = playlist
}
void receiveTypeBoundaries


function recoveryTypeBoundaries(clock: SyncClock) {
  void clock.wallNow()
  // @ts-expect-error Wall time is required independently of monotonic time.
  const incomplete: SyncClock = { now: () => 0, after: () => () => {} }
  // @ts-expect-error Durable deadlines are numeric Unix milliseconds.
  const invalid: SyncOpaqueWrite = { gate: { kind: "held", notBefore: "60000" }, diagnostic: null }
  void incomplete
  void invalid
}
void recoveryTypeBoundaries

function claimCapability(deps: Parameters<typeof createLocalFilterWriter>[0]) {
  const { claim, ...withoutClaim } = deps
  // @ts-expect-error Every core host must choose its claim capability.
  createLocalFilterWriter(withoutClaim)
  void claim
}
void claimCapability

function filterConfirmation(result: LocalFilterWriteResult) {
  if (result.kind === "unconfirmed") {
    if (result.cause.kind === "read-failed") void result.cause.error
    // @ts-expect-error Unconfirmed persistence cannot claim success.
    void result.result.ok
    // @ts-expect-error Readback cause is immutable.
    result.cause.kind = "authority"
  }
  // @ts-expect-error Read failure must retain its original error.
  const missing: LocalFilterWriteResult = { kind: "unconfirmed", cause: { kind: "read-failed" } }
  void missing
}
void filterConfirmation

function setupConfirmation(result: SetupDestinationResult, acct: AccountKey) {
  const absent: SetupDestinationResult = { kind: "committed", view: { kind: "none", acct } }
  const fromSync: SetupEvent = { kind: "setup-changed", source: "sync", acct }
  if (result.kind === "committed" && result.view.kind === "live") void result.view.setup.quickSave
  if (result.kind === "committed" && result.view.kind === "none") {
    // @ts-expect-error Confirmed deletion has no live Setup body.
    void result.view.setup
  }
  if (result.kind === "removal") {
    // @ts-expect-error A partial cleanup result never carries a committed view.
    void result.view
  }
  // @ts-expect-error Account-specific events require the validated account key.
  const unaddressed: SetupEvent = { kind: "setup-changed", source: "sync" }
  void [absent, fromSync, unaddressed]
}
void setupConfirmation

export type PlaylistCacheOwnerProofs = [
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readPlaylistCache"], import("./playlist-cache").PlaylistCacheOwner["readPlaylistCache"]>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["absorbPlaylistCache"], import("./playlist-cache").PlaylistCacheOwner["absorbPlaylistCache"]>>
]
async function cachePrivateBoundaries(writer: ReturnType<typeof createLocalFilterWriter>, acct: AccountKey) {
  const read = await writer.readPlaylistCache({ acct, private: true })
  if (read.kind === "cache" && read.authority.kind === "caller-owned") {
    // @ts-expect-error Caller-owned reads cannot authorize persistence.
    void writer.absorbPlaylistCache(read.authority.capture, { kind: "list", acct, site: "www", at: 1, rows: [] })
  }
  // @ts-expect-error Cache reads require the authenticated privacy fact.
  void writer.readPlaylistCache({ acct })
  // @ts-expect-error Cache writes require an owner-minted capture, never an account string.
  void writer.absorbPlaylistCache(acct, { kind: "list", acct, site: "www", at: 1, rows: [] })
}
void cachePrivateBoundaries

export type AutoAddOwnerProofs = [
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readAutoAddChoice"], (origin: UiOrigin, request: import("../../shared/contracts/auto-add-choice").AutoAddReadChange) => Promise<import("../../shared/contracts/auto-add-choice").AutoAddReadAnswer>>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["changeAutoAddChoice"], (origin: UiOrigin, change: import("../../shared/contracts/auto-add-choice").AutoAddChoiceChange) => Promise<import("./auto-add-choice").AutoAddChoiceResult>>>
]

function viewEventBoundaries(owner: ReturnType<typeof createLocalFilterWriter>, acct: AccountKey) {
  const stop: () => void = owner.subscribeView(event => { void event.kind }, () => {})
  const confirmed: import("./local-filter-writer").ConfirmedViewChange = { kind: "skips-changed", acct, scope: "normal" }
  // @ts-expect-error negative: owner-view-no-fake-account. Confirmed view events retain branded account identities.
  const fake: import("./local-filter-writer").ConfirmedViewChange = { kind: "account-removed", acct: "raw", source: "local" }
  // @ts-expect-error negative: owner-view-no-cache-event. Cache bookkeeping cannot become a confirmed view change.
  const cache: import("./local-filter-writer").ConfirmedViewChange = { kind: "cache-changed", acct }
  void [stop, confirmed, fake, cache]
}
void viewEventBoundaries

export type ReconciledOwnerProofs = [
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["exportSettings"], import("./settings-file-read").SettingsFileOwner["exportSettings"]>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["importCheck"], import("./settings-file-read").SettingsFileOwner["importCheck"]>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["seeAccountLabel"], import("./account-label").AccountLabelsOwner["seeAccountLabel"]>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["completeAccountLabel"], import("./account-label").AccountLabelsOwner["completeAccountLabel"]>>,
  Check<Equal<import("../adapters/starting-owner").BrowserStartingOwner["exportSettings"], import("./settings-file-read").SettingsFileOwner["exportSettings"]>>,
  Check<Equal<import("../adapters/starting-owner").BrowserStartingOwner["importCheck"], import("./settings-file-read").SettingsFileOwner["importCheck"]>>,
  Check<Equal<import("../adapters/starting-owner").BrowserStartingOwner["seeAccountLabel"], import("./account-label").AccountLabelsOwner["seeAccountLabel"]>>,
  Check<Equal<import("../adapters/starting-owner").BrowserStartingOwner["completeAccountLabel"], import("./account-label").AccountLabelsOwner["completeAccountLabel"]>>
]

function reconciledOwnerBoundaries(owner: ReturnType<typeof createLocalFilterWriter>, acct: AccountKey, capture: import("./playlist-cache").PlaylistCacheCapture) {
  const normal = { kind: "ui", windowId: 1, incognito: false } as const
  // @ts-expect-error negative: reconciliation-private-sighting
  void owner.seeAccountLabel({ acct, private: true, at: 1 })
  // @ts-expect-error negative: reconciliation-forged-capture
  void owner.completeAccountLabel({ kind: "playlist-cache-capture", acct }, { acct, label: { name: "Label" } })
  // @ts-expect-error negative: reconciliation-label-shape
  void owner.completeAccountLabel(capture, { acct, label: { name: 3 } })
  // @ts-expect-error negative: reconciliation-native-origin
  void owner.importCheck({ privacy: "normal" }, "{}")
  // @ts-expect-error negative: reconciliation-plan-no-write
  void owner.executeImport(normal, {})
}
