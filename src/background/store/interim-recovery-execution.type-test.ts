import type { Filter, AccountKey, PlaylistId } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import type { UiOrigin } from "./account-removal-execution"
import type { RetainedAgreementV2 } from "./interim-persistence"
import type { RetainedInstallationV3 } from "./interim-installation"
import type { RecoveryItemId } from "./interim-recovery-review"
import type { RecoveryCapture, FilterReplacementConfirmation, RecoveryHost, RecoveryOwnership, RecoveryRead, RecoveryPreparation,
  RecoveryTransactionResult, RetainedRecoveryV4, RecoveryLocator, FilterReplacementEffect, RecoveryStoredObject } from "./interim-recovery-execution"
import { createStartingLocalFilterWriter, createLocalFilterWriter } from "./local-filter-writer"
import { retainedRecoveryDifference } from "./interim-recovery-execution"
import type { InterimPersistenceSnapshot } from "./interim-persistence"
import type { PlaylistDestinationChoice, PlaylistRestoreEffect, PlaylistRestorePreparation } from "./interim-recovery-execution"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Owner = ReturnType<typeof createStartingLocalFilterWriter>
export type RecoveryProofs = [
  Check<Equal<RetainedRecoveryV4["v"], 4>>,
  Check<Equal<RetainedRecoveryV4["basis"]["checkpoint"]["v"], 2 | 3>>,
  Check<Equal<Extract<RetainedRecoveryV4["basis"]["checkpoint"], { v: 2 }>["agreement"]["kind"], "confirmed">>,
  Check<Equal<Extract<RetainedRecoveryV4["basis"]["checkpoint"], { v: 3 }>["installation"]["kind"], "installed">>,
  Check<Equal<RetainedRecoveryV4["resolutions"][number]["kind"], "filter-replaced" | "playlist-restored" | "discarded">>,
  Check<Equal<RetainedRecoveryV4["pending"]["kind"], "none" | "filter-replacement" | "playlist-restore">>,
  Check<Equal<RecoveryLocator, Pick<RecoveryItemId, "sourceKey" | "path">>>,
  Check<Equal<Owner["readInterimRecovery"], () => Promise<RecoveryRead>>>,
  Check<Equal<Owner["prepareInterimPlaylistRestore"], (origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }) => Promise<PlaylistRestorePreparation>>>,
  Check<Equal<Owner["restoreInterimPlaylist"], (origin: UiOrigin, input: { readonly choice: PlaylistDestinationChoice; readonly acct: AccountKey }) => Promise<RecoveryTransactionResult>>>,
  Check<Equal<Owner["resumeInterimPlaylistRestore"], (origin: UiOrigin) => Promise<RecoveryTransactionResult>>>,
  Check<Equal<Owner["cancelInterimPlaylistRestore"], (origin: UiOrigin, choice: PlaylistDestinationChoice) => void>>,
  Check<Equal<Extract<RecoveryHost, { kind: "fixture" }>["accounts"]["read"], () => Promise<readonly import("./local-claim-writer").ClaimAuthority[]>>>,
  Check<Equal<Owner["discardInterimItem"], (origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }) => Promise<RecoveryTransactionResult>>>,
  Check<Equal<Extract<RecoveryRead, { kind: "review" }>["discarded"], readonly RecoveryItemId[]>>,
  Check<Equal<Owner["prepareInterimFilterReplacement"], (origin: UiOrigin, input: { readonly capture: RecoveryCapture; readonly item: RecoveryItemId }) => Promise<RecoveryPreparation>>>,
  Check<Equal<Owner["replaceInterimFilter"], (origin: UiOrigin, confirmation: FilterReplacementConfirmation) => Promise<RecoveryTransactionResult>>>,
  Check<Equal<Owner["cancelInterimFilterReplacement"], (origin: UiOrigin, confirmation: FilterReplacementConfirmation) => void>>,
  Check<Equal<Owner["resumeInterimFilterReplacement"], (origin: UiOrigin) => Promise<RecoveryTransactionResult>>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readInterimRecovery"], Owner["readInterimRecovery"]>>,
  Check<Equal<Extract<RecoveryPreparation, { kind: "confirmation-required" }>["current"], Snapshot<Filter>>>,
  Check<Equal<Extract<RecoveryPreparation, { kind: "confirmation-required" }>["acct"], AccountKey>>,
  Check<Equal<Extract<RecoveryPreparation, { kind: "confirmation-required" }>["playlist"], PlaylistId>>,
  Check<Equal<Extract<RecoveryTransactionResult, { kind: "committed" }>["activation"], "held" | "canonical">>,
  Check<Equal<"lineage" extends keyof Extract<RecoveryOwnership, { kind: "fixture-owned" }> ? true : false, false>>,
  Check<Equal<Parameters<typeof createStartingLocalFilterWriter>[0]["recovery"], RecoveryHost | undefined>>
]
function negative(owner: Owner, origin: UiOrigin, capture: RecoveryCapture, confirmation: FilterReplacementConfirmation, checkpoint: Snapshot<RetainedRecoveryV4>, record: RetainedRecoveryV4,
  v2: RetainedAgreementV2, v3: RetainedInstallationV3, current: InterimPersistenceSnapshot, effect: FilterReplacementEffect, history: RecoveryStoredObject) {
  // @ts-expect-error Discard requires the owner-private capture.
  owner.discardInterimItem(origin, { item: { captureId: "display", sourceKey: "playlists", path: [0] } })
  // @ts-expect-error Discard does not choose a destination.
  owner.discardInterimItem(origin, { capture, item: { captureId: "display", sourceKey: "playlists", path: [0] }, destination: "AAAAAAAAAAAAAAAA" })
  // @ts-expect-error Discard receipts have no document effect.
  const discardEffect: Extract<RetainedRecoveryV4["resolutions"][number], { kind: "discarded" }> = { kind: "discarded", item: effect.item, effect }
  void discardEffect
  // @ts-expect-error A display item cannot replace the private confirmation capability.
  owner.replaceInterimFilter(origin, { captureId: "display", sourceKey: "playlists", path: [0] })
  // @ts-expect-error Recovery selection is separate from replacement confirmation.
  owner.replaceInterimFilter(origin, capture)
  // @ts-expect-error Confirmation cannot supply an arbitrary destination.
  confirmation.acct = "AAAAAAAAAAAAAAAA"
  // @ts-expect-error An accepted V2 cannot be used as a confirmed immutable basis.
  const acceptedBasis: RetainedRecoveryV4["basis"]["checkpoint"] = v2
  // @ts-expect-error An accepted V3 cannot be used as an installed immutable basis.
  const pendingBasis: RetainedRecoveryV4["basis"]["checkpoint"] = v3
  // @ts-expect-error V4 cannot recursively embed itself.
  const recursive: RetainedRecoveryV4["basis"]["checkpoint"] = record
  // @ts-expect-error Recovery comparison requires explicit observed history.
  const observed: Pick<Parameters<typeof retainedRecoveryDifference>[0], "current" | "history"> = { current }
  // @ts-expect-error Completed evidence is deeply immutable.
  checkpoint.resolutions.push({ kind: "filter-replaced", effect })
  // @ts-expect-error A global filter has no destination authority in this unit.
  const globalDestination: FilterReplacementEffect["key"] = { kind: "global-filter", playlist: effect.key.playlist }
  if (history.kind === "absent") {
    // @ts-expect-error Absent history cannot supply invented raw values.
    history.raw = {}
  }
  void acceptedBasis; void pendingBasis; void recursive; void observed; void globalDestination
}
void negative

function playlistNegative(owner: Owner, origin: UiOrigin, choice: PlaylistDestinationChoice, acct: AccountKey, effect: PlaylistRestoreEffect, host: Extract<RecoveryHost, { kind: "fixture" }>) {
  // @ts-expect-error Restore requires an explicit selected account.
  owner.restoreInterimPlaylist(origin, { choice })
  // @ts-expect-error A display capture cannot select a destination.
  owner.restoreInterimPlaylist(origin, { choice: { kind: "interim-recovery-capture" }, acct })
  // @ts-expect-error Choice cannot supply an arbitrary Setup body.
  owner.restoreInterimPlaylist(origin, { choice, acct, data: {} })
  // @ts-expect-error A playlist receipt has no display capture identifier.
  effect.item.captureId = "display"
  // @ts-expect-error Playlist restoration cannot address a filter document.
  const filterKey: PlaylistRestoreEffect["key"] = { kind: "filter", acct, playlist: "PL_GLOBAL" }
  // @ts-expect-error A retained effect stores no live authority capability.
  effect.authority = { acct }
  // @ts-expect-error Plural account observations are a required fixture contract.
  const single: RecoveryHost = { kind: "fixture", snapshot: host.snapshot, authority: host.authority, ownership: host.ownership }
  // @ts-expect-error A read-only display item cannot execute restoration.
  const readOnly: RecoveryItemId = { sourceKey: "playlists", path: [0], captureId: "display", restore: owner.restoreInterimPlaylist }
  // @ts-expect-error Destination status has no cross-occurrence consumption variant.
  const status: Extract<PlaylistRestorePreparation, { kind: "destination-required" }>["owners"][number]["status"] = "restored-elsewhere"
  void single; void readOnly; void status; void filterKey
}
void playlistNegative
