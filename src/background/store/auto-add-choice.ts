import type { AutoAddChoiceChange, AutoAddFact } from "../../shared/contracts/auto-add-choice"
import type { JsonObject } from "../../shared/contracts/json"
import type { AccountChoice } from "./accounts"
import { planSetupAccountChoice, readAccountSetup, type AccountSetupView, type SetupDestinationPlan } from "./setup-edit"
import type { SetupDestinationResult } from "./setup-edit-execution"

export type AutoAddChoiceResult = SetupDestinationResult | { readonly kind: "current"; readonly view: AccountSetupView }

export function autoAddFact(view: AccountSetupView, playlist: AutoAddChoiceChange["playlist"]): AutoAddFact {
  const entry = view.kind === "live" ? view.setup.autoAdd.find(row => row.pl === playlist) : undefined
  return entry ? { kind: "selected", takes: entry.takes, pct: entry.pct ?? null } : { kind: "absent" }
}

export function planAutoAddChoice(records: JsonObject, change: AutoAddChoiceChange): SetupDestinationPlan {
  const read = readAccountSetup(records, change.acct)
  if (read.kind !== "value") return { kind: read.kind === "newer-version" ? "update-needed" : "invalid" }
  const fact = autoAddFact(read.view, change.playlist),
    edit = change.edit
  const matches =
    edit.kind === "auto-add" ? (fact.kind === "selected") === edit.expected : fact.kind === "selected" && (edit.kind === "takes" ? fact.takes === edit.expected : fact.pct === edit.expected)
  if (!matches) return { kind: "stale", reason: "destination" }
  const choice: Extract<AccountChoice, { kind: "auto-add" | "takes" | "percentage" }> =
    edit.kind === "auto-add"
      ? { kind: "auto-add", playlist: change.playlist, chosen: edit.chosen }
      : edit.kind === "takes"
        ? { kind: "takes", playlist: change.playlist, takes: edit.takes }
        : { kind: "percentage", playlist: change.playlist, pct: edit.pct }
  return planSetupAccountChoice(records, change.acct, choice)
}
