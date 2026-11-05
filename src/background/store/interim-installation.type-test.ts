import type {
  ConfirmedRetainedAgreementV2,
  RetainedInstallationV3,
  RetainedInstallationHistory,
  InterimInstallationReview,
  InterimInstallationResult,
  InterimInstallationStatus,
  InterimInstallationEffect
} from "./interim-installation"
import { deriveInterimInstallationEffect, retainedInstallationDifference } from "./interim-installation"
import { retainedCheckpointDifference, type RetainedAgreementV2, type InterimPersistenceSnapshot } from "./interim-persistence"
import { createStartingLocalFilterWriter, createLocalFilterWriter } from "./local-filter-writer"
import type { Snapshot } from "../../shared/model/settings-view"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type InstallationProofs = [
  Check<Equal<RetainedInstallationV3["v"], 3>>,
  Check<Equal<ConfirmedRetainedAgreementV2["agreement"]["kind"], "confirmed">>,
  Check<Equal<ReturnType<ReturnType<typeof createStartingLocalFilterWriter>["readInterimInstallation"]>, Promise<InterimInstallationStatus>>>,
  Check<Equal<ReturnType<ReturnType<typeof createLocalFilterWriter>["installInterimConversion"]>, Promise<InterimInstallationResult>>>,
  Check<Equal<Extract<InterimInstallationResult, { kind: "committed" }>["activation"], "held">>,
  Check<Equal<Extract<InterimInstallationStatus, { kind: "installed" }>["recovery"], "retained">>,
  Check<Equal<"device" extends keyof InterimInstallationEffect ? true : false, false>>
]
function negative(
  owner: ReturnType<typeof createStartingLocalFilterWriter>,
  checkpoint: Snapshot<RetainedInstallationV3>,
  current: InterimPersistenceSnapshot,
  v2: RetainedAgreementV2,
  review: InterimInstallationReview,
  history: RetainedInstallationHistory
) {
  // @ts-expect-error v3 comparison requires observed history.
  retainedCheckpointDifference({ ...v2, v: checkpoint.v }, current)
  // @ts-expect-error Pure installation comparison cannot waive history.
  const missingHistory: Pick<Parameters<typeof retainedInstallationDifference>[0], "history"> = {}
  // @ts-expect-error Accepted agreement is not confirmed installation authority.
  const unconfirmed: Parameters<typeof deriveInterimInstallationEffect>[0]["agreement"]["kind"] = v2.agreement.kind
  // @ts-expect-error Installation consumes a private review, not selected paths.
  owner.installInterimConversion({ kind: "ui", windowId: 1, incognito: false }, ["doc:settings"])
  // @ts-expect-error Tokens carry no caller effect.
  review.effect = {}
  // @ts-expect-error Immutable receipts cannot replace original agreement time.
  checkpoint.agreed.agreement.effect.consent.at = 999
  // @ts-expect-error Installed status grants no ordinary readiness result.
  const active: Extract<InterimInstallationResult, { kind: "committed" }> = { kind: "committed", activation: "ok", mutations: [] }
  if (history.kind === "absent") {
    // @ts-expect-error Missing history has no invented raw defaults.
    history.raw = {}
  }
  void [active, missingHistory, unconfirmed]
}
void negative

import { recoveredRetainedInstallationDifference, type AcceptedRetainedInstallationV3, type InstalledRetainedInstallationV3 } from "./interim-installation"
function recoveredPositive(accepted: Snapshot<AcceptedRetainedInstallationV3>, current: InterimPersistenceSnapshot, history: RetainedInstallationHistory, effect: InterimInstallationEffect) {
  void recoveredRetainedInstallationDifference({ accepted, current, history, effect, agreement: { v: 1, at: 300 }, expected: { checkpoint: "accepted", progress: "accepted" } })
  void recoveredRetainedInstallationDifference({ accepted, current, history, effect, agreement: { v: 1, at: 301 }, expected: { checkpoint: "installed", progress: "terminal" } })
}
function recoveredNegative(
  accepted: Snapshot<AcceptedRetainedInstallationV3>,
  installed: Snapshot<InstalledRetainedInstallationV3>,
  v2: Snapshot<ConfirmedRetainedAgreementV2>,
  current: InterimPersistenceSnapshot,
  history: RetainedInstallationHistory,
  effect: InterimInstallationEffect
) {
  const input = { accepted, current, history, effect, agreement: { v: 1 as const, at: 300 }, expected: { checkpoint: "accepted" as const, progress: "accepted" as const } }
  // @ts-expect-error Confirmed V2 is not an accepted installation.
  const wrongVersion: Parameters<typeof recoveredRetainedInstallationDifference>[0]["accepted"]["v"] = v2.v
  // @ts-expect-error Installed receipts cannot replace immutable accepted input.
  const wrongStage: Parameters<typeof recoveredRetainedInstallationDifference>[0]["accepted"]["installation"]["kind"] = installed.installation.kind
  // @ts-expect-error Installed progress requires terminal authority.
  const wrongProgress: Parameters<typeof recoveredRetainedInstallationDifference>[0]["expected"] = { checkpoint: "installed", progress: "accepted" }
  // @ts-expect-error Accepted history is immutable.
  accepted.installation.history.kind = "absent"
  // @ts-expect-error Recovery cannot rewrite historical accepting consent.
  accepted.agreed.agreement.effect.consent.at = 300
  // @ts-expect-error Fixed installation effect has no Device write.
  effect.device = {}
  void [input, wrongVersion, wrongStage, wrongProgress]
}
void [recoveredPositive, recoveredNegative]

function draftComparison(accepted: Snapshot<AcceptedRetainedInstallationV3>, current: InterimPersistenceSnapshot, history: RetainedInstallationHistory, effect: InterimInstallationEffect) {
  void recoveredRetainedInstallationDifference({ accepted, current, history, effect, agreement: { v: 1, at: 300 }, expected: { checkpoint: "agreed", progress: "draft" } })
  // @ts-expect-error A confirmed V2 has no accepted installation progress.
  const invalid: Parameters<typeof recoveredRetainedInstallationDifference>[0]["expected"] = { checkpoint: "agreed", progress: "accepted" }
  // @ts-expect-error Installed receipts cannot carry draft permission.
  const installedDraft: Parameters<typeof recoveredRetainedInstallationDifference>[0]["expected"] = { checkpoint: "installed", progress: "draft" }
  void [invalid, installedDraft]
}
void draftComparison
