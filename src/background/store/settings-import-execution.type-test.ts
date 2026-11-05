import { createSettingsImportExecution, type SettingsImportConfirmation, type SettingsImportDependencies, type SettingsImportOwner, type SettingsImportResult } from "./settings-import-execution"
import type { SettingsImportPlan } from "./settings-import-plan"
import type { AcceptedSettingsImport, SettingsImportContinuation } from "./settings-import-persistence"
import type { ExactSettingsImportPermit } from "./settings-import-recovery"
import type { ExactRemovalPermit } from "./consent-recovery"
import type { BrowserStartingOwner } from "../adapters/starting-owner"

function negatives(
  owner: SettingsImportOwner,
  deps: SettingsImportDependencies,
  confirmation: SettingsImportConfirmation,
  accepted: AcceptedSettingsImport,
  recovery: ExactSettingsImportPermit,
  removal: ExactRemovalPermit,
  native: BrowserStartingOwner
) {
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  // @ts-expect-error A file check cannot mint owner capture authority.
  const forged: SettingsImportConfirmation = { kind: "import-plan" }
  // @ts-expect-error A mutation requires an explicit replacement confirmation.
  owner.importSettings(origin, { confirmation })
  const { cleanup: _cleanup, ...withoutCleanup } = deps
  // @ts-expect-error Every executor requires the complete cleanup collaborator.
  createSettingsImportExecution(withoutCleanup)
  // @ts-expect-error A full admitted changed-document batch cannot be empty.
  const empty: SettingsImportPlan["documents"]["changes"] = []
  // @ts-expect-error Continuations require the accepted import effect, not recovery authority.
  const mixed: SettingsImportContinuation = { v: 1, kind: "settings-import-continuation", accepted: recovery, next: 0 }
  // @ts-expect-error Account-removal authority cannot recover a multi-account import.
  createSettingsImportExecution(deps).recover(removal)
  // @ts-expect-error Accepted JSON is not a one-use recovery permit.
  createSettingsImportExecution(deps).recover(accepted)
  // @ts-expect-error Partial results cannot become terminal receipts.
  const early: Extract<SettingsImportResult, { kind: "committed" }> = { kind: "failed", stage: "documents", applied: true, error: null }
  const { importSettings: _importSettings, ...withoutImport } = native
  // @ts-expect-error The derived native owner must forward the final mutation API.
  const missingForwarding: SettingsImportOwner = withoutImport
  void [forged, empty, mixed, early, missingForwarding]
}
void negatives
