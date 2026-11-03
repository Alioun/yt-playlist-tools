import type { AccountKey, DocumentKey, PlaylistId } from "../../shared/model"
import type { ImportPlan } from "../../shared/settings-file"
import type { ImportSyncFacts, SettingsImportPlan, SettingsImportPlanInput, SettingsImportPlanResult, planSettingsImport } from "./settings-import-plan"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type ImportPlanProofs = [
  Check<Equal<typeof planSettingsImport, (input: SettingsImportPlanInput) => SettingsImportPlanResult>>,
  Check<Equal<SettingsImportPlanInput["parsed"], ImportPlan>>,
  Check<Equal<Extract<ImportSyncFacts, { kind: "off" }>, { readonly kind: "off" }>>,
  Check<Equal<SettingsImportPlan["documents"]["changes"][0]["key"], DocumentKey>>,
  Check<Equal<Extract<SettingsImportPlanResult, { kind: "refused" }> extends SettingsImportPlan ? true : false, false>>,
  Check<Equal<keyof typeof import("./settings-import-plan"), "planSettingsImport">>
]

export function intendedLineNegatives(acct: AccountKey, playlist: PlaylistId, key: DocumentKey, refusal: Extract<SettingsImportPlanResult, { kind: "refused" }>): void {
  // @ts-expect-error account identity cannot be a document address.
  const mixedAccount: AccountKey = key
  // @ts-expect-error a playlist identity cannot be an account identity.
  const mixedDocument: DocumentKey = { kind: "setup", acct: playlist }
  // @ts-expect-error parsed imports require fresh provenance.
  const provenance: ImportPlan["provenance"] = "retain-file-generations"
  // @ts-expect-error the executable document batch has a Settings member.
  const empty: SettingsImportPlan["documents"]["changes"] = []
  // @ts-expect-error refusal contains no executable document replacement.
  const executable: SettingsImportPlan = refusal
  // @ts-expect-error sync-off inputs carry no already-read remote inventory.
  const off: ImportSyncFacts = { kind: "off", records: {} }
  void [acct, mixedAccount, mixedDocument, provenance, empty, executable, off]
}
