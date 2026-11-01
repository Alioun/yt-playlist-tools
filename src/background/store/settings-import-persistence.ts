import { documentKey, type DocumentKey } from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { createImportPlanner } from "../../shared/settings-file"
import { isAgreement, parseConsentState, type Agreement, type ConsentStateV1 } from "./consent-withdrawal"
import { planSettingsImport, type SettingsImportPlan } from "./settings-import-plan"
import { sameSyncJson } from "./sync-write-admission"

export const settingsImportKey = "pending:settings-import"
export type AcceptedSettingsImport = {
  readonly v: 1
  readonly kind: "settings-import"
  readonly occurrence: number
  readonly original: Agreement
  readonly control: ConsentStateV1
  readonly source: string
  readonly plan: SettingsImportPlan
}
export type SettingsImportContinuation = {
  readonly v: 1; readonly kind: "settings-import-continuation"
  readonly accepted: AcceptedSettingsImport; readonly next: number
}
export type SettingsImportRetired = { readonly v: 1; readonly kind: "settings-import-retired"; readonly occurrence: number }
export type SettingsImportRead =
  | { readonly kind: "absent" }
  | { readonly kind: "valid"; readonly continuation: SettingsImportContinuation }
  | { readonly kind: "retired"; readonly receipt: SettingsImportRetired }
  | { readonly kind: "invalid" | "newer-version"; readonly inspection: unknown }

export function importObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
function exact(value: JsonObject, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
export function importCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}
export function importJson(value: unknown): JsonObject {
  if (!importObject(value)) throw new TypeError("Settings import must be JSON")
  return structuredClone(value)
}
export function parseAcceptedSettingsImport(raw: unknown): AcceptedSettingsImport | undefined {
  try {
  if (!importObject(raw) || !exact(raw, ["v", "kind", "occurrence", "original", "control", "source", "plan"]) ||
    raw.v !== 1 || raw.kind !== "settings-import" || !importCounter(raw.occurrence) || !isAgreement(raw.original) ||
    typeof raw.source !== "string" || !importObject(raw.plan)) return
  const control = parseConsentState(raw.control), saved = raw.plan
  if (!control || control.state.kind !== "agreed" || !sameSyncJson(control.state.current, raw.original) ||
    !importObject(saved.capture) || !importObject(saved.capture.local) || !importObject(saved.capture.session) ||
    !importObject(saved.capture.sync) || !importObject(saved.documents) || !Array.isArray(saved.documents.changes)) return
  const parsed = createImportPlanner("normal").importFile(raw.source)
  if (parsed.kind !== "import-plan") return
  const generations = new Map<string, string>()
  let at: number | undefined
  for (const change of saved.documents.changes) {
    if (!importObject(change) || !importObject(change.key)) return
    if (change.kind !== "put") continue
    if (!importObject(change.document) || typeof change.document.gen !== "string" || !importCounter(change.document.at)) return
    const key = change.key
    let name: string
    if (key.kind === "settings") name = "doc:settings"
    else if ((key.kind === "setup" || key.kind === "filter") && typeof key.acct === "string") {
      name = `doc:${key.kind}:${key.acct}${key.kind === "filter" ? `:${key.playlist}` : ""}`
    } else return
    if (generations.has(name) || at !== undefined && at !== change.document.at) return
    generations.set(name, change.document.gen); at = change.document.at
  }
  if (at === undefined) return
  const sync = saved.capture.sync
  if (sync.kind !== "off" && !(sync.kind === "on" && importObject(sync.records))) return
  const facts = sync.kind === "off" ? { kind: "off" } as const : { kind: "on", records: importJson(sync.records) } as const
  const plan = planSettingsImport({ parsed, local: saved.capture.local, session: saved.capture.session, sync: facts, at,
    generation(key: DocumentKey) { const gen = generations.get(documentKey(key)); if (!gen) throw Error("Missing accepted import stamp"); return gen } })
  if (plan.kind !== "planned" || !isJsonValue(plan) || !sameSyncJson(plan, saved) ||
    plan.capture.binding.deviceId !== control.deviceId || !sameSyncJson(plan.capture.binding.consent, raw.original) ||
    !isJsonValue(plan.capture.binding.consentControl) || !sameSyncJson(plan.capture.binding.consentControl, control)) return
  return { v: 1, kind: "settings-import", occurrence: raw.occurrence, original: { ...raw.original }, control,
    source: raw.source, plan }
  } catch { return }
}
export function readSettingsImport(raw: unknown): SettingsImportRead {
  if (raw === undefined) return { kind: "absent" }
  if (importObject(raw) && typeof raw.v === "number" && raw.v > 1) return { kind: "newer-version", inspection: structuredClone(raw) }
  if (importObject(raw) && raw.v === 1 && raw.kind === "settings-import-retired" && exact(raw, ["v", "kind", "occurrence"]) && importCounter(raw.occurrence)) {
    return { kind: "retired", receipt: { v: 1, kind: "settings-import-retired", occurrence: raw.occurrence } }
  }
  if (importObject(raw) && raw.v === 1 && raw.kind === "settings-import-continuation" && exact(raw, ["v", "kind", "accepted", "next"]) && importCounter(raw.next)) {
    if (importObject(raw.accepted) && typeof raw.accepted.v === "number" && raw.accepted.v > 1) return { kind: "newer-version", inspection: structuredClone(raw) }
    const accepted = parseAcceptedSettingsImport(raw.accepted)
    if (accepted) {
      const count = 1 + (accepted.plan.documents.changes.some(change => change.kind === "remove") || accepted.plan.cleanup.accounts.length > 0 ? 1 : 0) +
        accepted.plan.cleanup.sessionEffects.length
      if (raw.next <= count) return { kind: "valid", continuation: { v: 1, kind: "settings-import-continuation", accepted, next: raw.next } }
    }
  }
  return { kind: "invalid", inspection: isJsonValue(raw) ? structuredClone(raw) : null }
}
