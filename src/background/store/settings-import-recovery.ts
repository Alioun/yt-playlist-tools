import type { Origin } from "../../shared/contracts/results"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { agreementOrigin } from "./consent-agreement"
import { readConsentDevice, type Agreement } from "./consent-withdrawal"
import { classifyConsentWork, parseConsentJobs, type ConsentJobs, type HeldJobSelection } from "./consent-recovery"
import { sameSyncJson } from "./sync-write-admission"
import { importCounter, importJson, importObject, parseAcceptedSettingsImport, readSettingsImport, settingsImportKey, type AcceptedSettingsImport } from "./settings-import-persistence"
import type { SettingsImportResult } from "./settings-import-execution"

export type SettingsImportIdentity = {
  readonly deviceId: string; readonly occurrence: number
  readonly operation: { readonly kind: "settings-import"; readonly record: JsonObject }
  readonly original: Agreement
}
export type ConsentSettingsImportJob = {
  readonly identity: SettingsImportIdentity
  readonly progress: { readonly kind: "accepted" | "terminal" }
  readonly permission: { readonly kind: "held" | "done" } |
    { readonly kind: "prepared" | "armed" | "retiring"; readonly generation: number; readonly current: Agreement }
}
export type SettingsImportView = {
  readonly kind: "settings-import"; readonly selection: HeldJobSelection
  readonly occurrence: number | null; readonly record: JsonObject | null; readonly original: Agreement | null
  readonly recoverability: "exact-settings-import" | "blocked"
  readonly resume: "current-agreement" | "held" | "blocked"
  readonly observation: "valid" | "invalid" | "newer-version"
  readonly inspection: JsonObject
}
export function parseSettingsImportIdentity(raw: unknown): SettingsImportIdentity | undefined {
  if (!importObject(raw) || Object.keys(raw).length !== 4 || typeof raw.deviceId !== "string" ||
    !importCounter(raw.occurrence) || !importObject(raw.operation) || Object.keys(raw.operation).length !== 2 || raw.operation.kind !== "settings-import") return
  const record = parseAcceptedSettingsImport(raw.operation.record)
  if (!record || record.occurrence !== raw.occurrence || record.control.deviceId !== raw.deviceId ||
    !isJsonValue(raw.original) || !sameSyncJson(record.original, raw.original)) return
  return { deviceId: raw.deviceId, occurrence: raw.occurrence, operation: { kind: "settings-import", record: importJson(record) }, original: record.original }
}
export function importJob(ledger: ConsentJobs, occurrence: number): ConsentSettingsImportJob | undefined {
  const job = ledger.jobs.find(entry => entry.identity.occurrence === occurrence)
  return job?.identity.operation.kind === "settings-import" ? { ...job, identity: { ...job.identity, operation: job.identity.operation } } : undefined
}
export function importPermissionCurrent(job: ConsentSettingsImportJob, records: JsonObject): boolean {
  const read = readConsentDevice(records), permission = job.permission
  return read.kind === "supported" && read.control !== null && read.control.state.kind === "agreed" &&
    read.device.id === job.identity.deviceId && (permission.kind === "armed" || permission.kind === "retiring") &&
    read.control.generation === permission.generation && sameSyncJson(read.control.state.current, permission.current)
}
export function settingsImportWork(records: JsonObject, ledger: ConsentJobs | undefined): SettingsImportView[] {
  const marker = readSettingsImport(records[settingsImportKey]), work: SettingsImportView[] = []
  const pending = ledger?.jobs.flatMap(job => job.identity.operation.kind === "settings-import" && job.permission.kind !== "done"
    ? [{ ...job, identity: { ...job.identity, operation: job.identity.operation } }] : []) ?? []
  for (const job of pending) {
    const exact = marker.kind === "valid" && sameSyncJson(importJson(marker.continuation.accepted), job.identity.operation.record) ||
      marker.kind === "retired" && marker.receipt.occurrence === job.identity.occurrence && job.progress.kind === "terminal"
    work.push({ kind: "settings-import", selection: Object.freeze({ kind: "held-job-selection" }),
      occurrence: job.identity.occurrence, record: job.identity.operation.record, original: job.identity.original,
      recoverability: exact ? "exact-settings-import" : "blocked", resume: exact ? importPermissionCurrent(job, records) ? "current-agreement" : "held" : "blocked",
      observation: exact ? "valid" : "invalid", inspection: { marker: isJsonValue(records[settingsImportKey]) ? records[settingsImportKey] : null } })
  }
  if ((marker.kind === "invalid" || marker.kind === "newer-version" || marker.kind === "valid" && !pending.length ||
    marker.kind === "retired" && !pending.length && !ledger?.jobs.some(job => job.identity.operation.kind === "settings-import" && job.identity.occurrence === marker.receipt.occurrence && job.permission.kind === "done"))) {
    work.push({ kind: "settings-import", selection: Object.freeze({ kind: "held-job-selection" }), occurrence: null,
      record: null, original: null, recoverability: "blocked", resume: "blocked",
      observation: marker.kind === "newer-version" ? "newer-version" : "invalid", inspection: { marker: isJsonValue(records[settingsImportKey]) ? records[settingsImportKey] : null } })
  }
  return work
}

const recoveryAuthority = Symbol("settings-import-recovery-authority")
export type ExactSettingsImportPermit = { readonly [recoveryAuthority]: true }
type RecoveryBinding = { readonly accepted: AcceptedSettingsImport; readonly records: JsonObject; readonly current: Agreement; readonly generation: number }
const permits = new WeakMap<ExactSettingsImportPermit, RecoveryBinding>()
export function consumeSettingsImportPermit(permit: ExactSettingsImportPermit): RecoveryBinding | undefined {
  const binding = permits.get(permit); permits.delete(permit); return binding
}
export type ImportRecoveryOutcome =
  | { readonly kind: "recovered"; readonly job: SettingsImportIdentity; readonly completion: { readonly operation: "settings-import"; readonly result: Extract<SettingsImportResult, { kind: "committed" }> }; readonly remaining: readonly import("./consent-recovery").HeldWorkView[] }
  | { readonly kind: "authorized-pending"; readonly job: SettingsImportIdentity; readonly reason: "executor"; readonly observation: SettingsImportResult }

export async function recoverSettingsImport(deps: {
  observe(): Promise<Readonly<Record<string, unknown>>>
  stopped(): boolean; revision(): number
  executeSettingsImport?(permit: ExactSettingsImportPermit): Promise<SettingsImportResult>
}, origin: Extract<Origin, { kind: "ui" }>, capture: { readonly origin: Extract<Origin, { kind: "ui" }>; readonly records: JsonObject; readonly revision: number },
selected: SettingsImportView): Promise<ImportRecoveryOutcome | { readonly kind: "unavailable"; readonly reason: "stale" | "disposed" | "unsupported-recovery" } | { readonly kind: "refused"; readonly reason: "private" | "not-agreed" }> {
  if (!agreementOrigin(origin) || origin.incognito) return { kind: "refused", reason: "private" }
  if (!deps.executeSettingsImport || selected.recoverability !== "exact-settings-import" || !selected.record) return { kind: "unavailable", reason: "unsupported-recovery" }
  try {
  const records = await deps.observe(), accepted = parseAcceptedSettingsImport(selected.record)
  if (deps.stopped()) return { kind: "unavailable", reason: "disposed" }
  if (!accepted || !importObject(records) || capture.revision !== deps.revision() || !sameSyncJson(origin, capture.origin) || !sameSyncJson(records, capture.records)) return { kind: "unavailable", reason: "stale" }
  const read = readConsentDevice(records)
  if (read.kind !== "supported" || !read.control || read.control.state.kind !== "agreed" || !read.device.consent) return { kind: "refused", reason: "not-agreed" }
  const permit: ExactSettingsImportPermit = Object.freeze({ [recoveryAuthority]: true })
  permits.set(permit, { accepted, records: importJson(records), current: read.device.consent, generation: read.control.generation })
  let result: SettingsImportResult
  try { result = await deps.executeSettingsImport(permit) }
  catch { result = { kind: "unconfirmed", stage: "authorize", cause: "read-failed", write: "rejected" } }
  finally { permits.delete(permit) }
  const job: SettingsImportIdentity = { deviceId: accepted.control.deviceId, occurrence: accepted.occurrence,
    operation: { kind: "settings-import", record: importJson(accepted) }, original: accepted.original }
  const after = await deps.observe()
  const terminal = importObject(after) && readSettingsImport(after[settingsImportKey])
  const ledger = importObject(after) && parseConsentJobs(after["consent:jobs"])
  const completed = ledger && importJob(ledger, accepted.occurrence)
  const current = readConsentDevice(after)
  if (!deps.stopped() && result.kind === "committed" && importObject(after) && terminal && terminal.kind === "retired" &&
    terminal.receipt.occurrence === accepted.occurrence && completed && completed.permission.kind === "done" &&
    sameSyncJson(completed.identity.operation.record, importJson(accepted)) && current.kind === "supported" && current.control?.state.kind === "agreed" &&
    current.control.generation === read.control.generation && sameSyncJson(current.control.state.current, read.device.consent)) {
    return { kind: "recovered", job, completion: { operation: "settings-import", result }, remaining: classifyConsentWork(after) }
  }
  return { kind: "authorized-pending", job, reason: "executor", observation: result }
  } catch { return { kind: "unavailable", reason: deps.stopped() ? "disposed" : "stale" } }
}
