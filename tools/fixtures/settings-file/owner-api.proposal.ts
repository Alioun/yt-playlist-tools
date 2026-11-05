import type { Origin, ChangeResult } from "../../../src/shared/contracts/results"
import type { ImportPlan, ImportResult, SettingsFileSource } from "../../../src/shared/settings-file"

export type SettingsFileImportChange = { readonly kind: "import"; readonly text: string }
export type SettingsFileImportExecution =
  | { readonly kind: "committed"; readonly accountCount: number }
  | { readonly kind: "refused"; readonly result: Extract<ChangeResult, { refused: string }> }
  | { readonly kind: "file-refused"; readonly result: Exclude<ImportResult, ImportPlan> }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unconfirmed" }

// This declaration proposes an adjoining owner API. It supplies no implementation or authority.
export interface ProposedSettingsFileOwner {
  exportSettings(origin: Extract<Origin, { kind: "ui" }>): Promise<{ readonly kind: "source"; readonly source: SettingsFileSource } | { readonly kind: "unavailable" }>
  importCheck(origin: Extract<Origin, { kind: "ui" }>, text: string): ImportResult
  changeImport(origin: Extract<Origin, { kind: "ui" }>, change: SettingsFileImportChange): Promise<SettingsFileImportExecution>
}

export type ProposedSettingsFileUiMessages = {
  "ui.exportSettings": {
    payload: Record<string, never>
    response: Awaited<ReturnType<ProposedSettingsFileOwner["exportSettings"]>>
  }
  "ui.importCheck": {
    payload: { readonly text: string }
    response: ImportResult
  }
}
