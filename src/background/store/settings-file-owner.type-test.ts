import type { createStartingLocalFilterWriter } from "./local-filter-writer"
import type { SettingsFileOwner } from "./settings-file-read"
import type { ImportPlan } from "../../shared/settings-file"
import type { Origin } from "../../shared/contracts/results"

type Owner = ReturnType<typeof createStartingLocalFilterWriter>
export function ownerTypeChecks(owner: Owner, plan: ImportPlan, tab: Extract<Origin, { kind: "tab" }>) {
  const bound: SettingsFileOwner = owner
  const normal = { kind: "ui", windowId: 7, incognito: false } as const
  const exported = bound.exportSettings(normal), checked = bound.importCheck(normal, "{}")
  // @ts-expect-error negative: tab-cannot-call-owner-export
  owner.exportSettings(tab)
  // @ts-expect-error negative: file-plan-is-not-native-origin
  owner.importCheck(plan, "{}")
  // @ts-expect-error negative: payload-privacy-is-not-native-origin
  owner.importCheck({ incognito: false }, "{}")
  // @ts-expect-error negative: import-application-is-not-authorized
  owner.changeImport(normal, { kind: "import", text: "{}" })
  return { exported, checked }
}

export function invocationTypeChecks(owner: Owner, plan: ImportPlan) {
  const normal = { kind: "ui", windowId: 7, incognito: false } as const
  // @ts-expect-error negative: export-has-no-consent-parameter
  owner.exportSettings(normal, { consent: true })
  // @ts-expect-error negative: imported-plan-cannot-select-check-privacy
  owner.importCheck(plan.header, "{}")
}
