import {
  executeInterimRetention,
  readRetainedInterim,
  projectInterimNote,
  type RetainedInterimRead,
  type InterimPersistenceSnapshot,
  type InterimRetentionResult,
  type InterimNoteRead,
  type StoreStartupHost
} from "./interim-persistence"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import type { StartupHost } from "./legacy-execution"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type InterimPersistenceProofs = [
  Check<Equal<typeof readRetainedInterim, (raw: unknown) => RetainedInterimRead>>,
  Check<Equal<ReturnType<typeof executeInterimRetention>, Promise<InterimRetentionResult>>>,
  Check<Equal<ReturnType<typeof projectInterimNote>, InterimNoteRead>>,
  Check<Equal<StoreStartupHost, StartupHost & { readInterimSnapshot(): Promise<InterimPersistenceSnapshot> }>>,
  Check<Equal<ReturnType<typeof createStartingLocalFilterWriter>["readInterimNote"], () => Promise<InterimNoteRead>>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readInterimNote"], () => Promise<InterimNoteRead>>>,
  Check<Equal<"remove" extends keyof Parameters<typeof executeInterimRetention>[0]["local"] ? true : false, false>>,
  Check<Equal<Extract<InterimRetentionResult, { kind: "ok" | "completed" }>, never>>,
  Check<Equal<Extract<InterimNoteRead, { kind: "inactive-proposal" }>["note"]["freshAgreementRequired"], true>>
]
function negative(deps: Parameters<typeof createLocalFilterWriter>[0], old: StartupHost, input: Parameters<typeof executeInterimRetention>[0], note: InterimNoteRead) {
  // @ts-expect-error A legacy-only host cannot omit the mandatory complete snapshot.
  createStartingLocalFilterWriter({ ...deps, startup: old })
  // @ts-expect-error The snapshot must include explicit checkpoint presence and historical facts.
  const incomplete: InterimPersistenceSnapshot = { source: {}, canonical: {} }
  // @ts-expect-error Retention has no delete port.
  void input.local.remove(["account:AAAAAAAAAAAAAAAA"])
  // @ts-expect-error A completed conversion is not an inactive retention result.
  const completed: InterimRetentionResult = { kind: "ok" }
  // @ts-expect-error Readiness error cannot present a non-interim route as held.
  const heldKind: Extract<ConstructorParameters<typeof StartupReadinessError>[0], { kind: "interim-held" }>["result"]["kind"] = "not-interim"
  if (note.kind === "inactive-proposal") {
    // @ts-expect-error Reads cannot grant agreement.
    note.note.freshAgreementRequired = false
    // @ts-expect-error Reads cannot replace the original checkpoint source.
    note.checkpoint.source = {}
    // @ts-expect-error Reads cannot allocate another conversion row.
    note.checkpoint.context.interimShortcutId = "other1"
  }
  void incomplete
  void completed
}
void negative

import { readRetainedCheckpoint, type RetainedAgreementV2, type RetainedAgreementEffect, type RetainedCheckpointRead, type RetainedInterim } from "./interim-persistence"
export type SuccessorProofs = [
  Check<Equal<typeof readRetainedCheckpoint, (raw: unknown) => RetainedCheckpointRead>>,
  Check<Equal<RetainedAgreementV2["v"], 2>>,
  Check<Equal<Extract<InterimRetentionResult, { kind: "pending-agreement" | "retained-agreement" }>["checkpoint"], import("../../shared/model/settings-view").Snapshot<RetainedAgreementV2>>>,
  Check<Equal<RetainedAgreementV2["agreement"]["effect"], RetainedAgreementEffect>>
]
function successorNegative(successor: RetainedAgreementV2, original: RetainedInterim) {
  // @ts-expect-error The v1 checkpoint arm cannot contain its successor.
  const wrong: Extract<RetainedInterimRead, { kind: "valid" }>["checkpoint"]["v"] = successor.v
  // @ts-expect-error Agreement is an explicit named receipt with a fixed effect.
  const missing: RetainedAgreementV2 = { v: 2, kind: "retained-interim", retained: original, agreement: { kind: "confirmed" } }
  // @ts-expect-error No conversion installation is authorized by v2.
  successor.agreement = { kind: "installed", effect: successor.agreement.effect }
  void wrong
  void missing
}
void successorNegative

import { recoveredRetainedV1AgreementDifference, type AcceptedRetainedAgreementV2 } from "./interim-persistence"
import type { Snapshot } from "../../shared/model/settings-view"
function v1ComparisonProof(retained: Snapshot<RetainedInterim>, accepted: Snapshot<AcceptedRetainedAgreementV2>, current: InterimPersistenceSnapshot, successor: RetainedAgreementV2) {
  const difference: "source" | "canonical" | "history" | "checkpoint" | undefined = recoveredRetainedV1AgreementDifference(retained, accepted, current, { v: 1, at: 300 }, "v1")
  // @ts-expect-error V1 comparison cannot authorize installation stages.
  recoveredRetainedV1AgreementDifference(retained, accepted, current, { v: 1, at: 300 }, "installed")
  // @ts-expect-error An arbitrary V2 may be confirmed and is not a fixed accepted V2.
  const fixed: AcceptedRetainedAgreementV2 = successor
  void [difference, fixed]
}
void v1ComparisonProof

import type { RetainedInstallationV3 } from "./interim-installation"
import { projectInterimInstallationNote } from "./interim-persistence"
export type InstallationPersistenceProofs = [
  Check<Equal<Extract<RetainedCheckpointRead, { kind: "installation" }>["checkpoint"], import("../../shared/model/settings-view").Snapshot<RetainedInstallationV3>>>,
  Check<Equal<Extract<InterimRetentionResult, { kind: "pending-installation" | "installed-interim" }>["checkpoint"], import("../../shared/model/settings-view").Snapshot<RetainedInstallationV3>>>,
  Check<Equal<ReturnType<typeof projectInterimInstallationNote>, InterimNoteRead>>
]
function installationNegative(current: InterimPersistenceSnapshot, checkpoint: unknown) {
  // @ts-expect-error An installation note needs an actual raw-history observation.
  projectInterimInstallationNote({ checkpoint, current })
  // @ts-expect-error The old held note cannot claim installation from an optional overlay.
  projectInterimNote({ checkpoint, current, installation: "installed" })
}
void installationNegative

import type { RetainedRecoveryV4 } from "./interim-recovery-execution"
export type RecoveryPersistenceProofs = [
  Check<Equal<Extract<RetainedCheckpointRead, { kind: "recovery" }>["checkpoint"], import("../../shared/model/settings-view").Snapshot<RetainedRecoveryV4>>>,
  Check<Equal<Extract<InterimRetentionResult, { kind: "confirmed-recovery" | "pending-recovery" }>["checkpoint"], import("../../shared/model/settings-view").Snapshot<RetainedRecoveryV4>>>
]

import { recoveredRetainedAgreementDifference } from "./interim-persistence"
function recoveredComparisonPositive(
  checkpoint: import("../../shared/model/settings-view").Snapshot<RetainedAgreementV2>,
  current: InterimPersistenceSnapshot,
  agreement: RetainedAgreementEffect["consent"]
) {
  void recoveredRetainedAgreementDifference(checkpoint, current, agreement, "terminal")
  // @ts-expect-error Comparison accepts only the selected accepted or terminal progression.
  recoveredRetainedAgreementDifference(checkpoint, current, agreement, "installed")
}
void recoveredComparisonPositive
