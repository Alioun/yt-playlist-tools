import { prepareFirstEditHistory } from "./first-edit-provenance"
import { DOCUMENT_VERSION, decodeDocument, decodeSettings, type Device } from "../../shared/model"
import { readSettingsView } from "../../shared/model/settings-view"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { ChangeResult } from "../../shared/contracts/results"
import type { LocalWriteStorage, SyncStorage } from "./local-filter-writer"
import { changeSharedSetting, type SharedSettingChange } from "./settings-edit"
import { planSyncWrite, sameSyncJson, type SyncDocumentRecord } from "./sync-write-admission"

export type LocalSettingsWriteResult =
  | { readonly kind: "committed" }
  | { readonly kind: "unchanged" }
  | { readonly kind: "result"; readonly result: Extract<ChangeResult, { refused: string }> }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "sync-writer-required" | "stale" | "disposed" }
  | { readonly kind: "failed"; readonly stage: "before-set" | "set"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly cause: { readonly kind: "authority" | "readback" } | { readonly kind: "read-failed"; readonly error: unknown } }

type Authority =
  | {
      readonly kind: "ready"
      readonly device: Device
      readonly rawDevice: JsonObject
      readonly history: { readonly raw: JsonObject; readonly editedSinceOff: boolean; readonly joined: string | null } | undefined
    }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "sync-writer-required" | "account-context" | "stale" }

function jsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

export async function executeSharedSetting(
  deps: {
    readonly local: LocalWriteStorage
    readonly sync: Pick<SyncStorage, "get">
    readonly authority: (records: Readonly<Record<string, unknown>>) => Authority
    readonly repairHistory: (raw: JsonObject, repairs: readonly SyncDocumentRecord[]) => JsonObject | undefined
    readonly disposed: () => boolean
    readonly now: () => number
    readonly generation: () => string
  },
  change: SharedSettingChange
): Promise<LocalSettingsWriteResult> {
  const invalid = { kind: "result", result: { refused: "invalid" } } as const
  const unavailable = { kind: "unavailable", reason: "sync-writer-required" } as const
  try {
    let records = await deps.local.get(null)
    if (deps.disposed()) return { kind: "unavailable", reason: "disposed" }
    const ready = deps.authority(records)
    if (ready.kind !== "ready") return { kind: "unavailable", reason: ready.reason === "account-context" ? "sync-writer-required" : ready.reason }
    const view = readSettingsView(records["doc:settings"])
    if (view.kind === "newer-version") return { kind: "result", result: { refused: "update-needed" } }
    if (view.kind !== "value") return invalid
    if (!jsonObject(records)) return invalid
    const baseline = readSettingsSnapshot(records)
    const edit = changeSharedSetting({ current: view.settings, change })
    if (edit.kind === "unchanged") {
      if (!ready.device.syncOn) return { kind: "unchanged" }
      const complete = await deps.local.get(null)
      if (deps.disposed()) return { kind: "unavailable", reason: "disposed" }
      if (!jsonObject(complete) || !sameSyncJson(readSettingsSnapshot(complete), baseline)) return { kind: "unavailable", reason: "stale" }
      const admission = planSyncWrite({ local: copyObject(complete), sync: await deps.sync.get(), intent: { kind: "unchanged", key: { kind: "settings" } } })
      if (deps.disposed()) return { kind: "unavailable", reason: "disposed" }
      if (admission.kind === "unavailable") return unavailable
      if (admission.kind === "refused") return { kind: "result", result: { refused: admission.reason } }
      return { kind: "unchanged" }
    }
    if (edit.kind === "invalid") return invalid
    const settings = { ...edit.settings, shortcuts: { ...edit.settings.shortcuts, list: view.settings.shortcuts.list } }
    if (!jsonObject(settings)) return invalid
    if (ready.device.syncOn) {
      records = await deps.local.get(null)
      if (deps.disposed()) return { kind: "unavailable", reason: "disposed" }
      if (!jsonObject(records) || !sameSyncJson(readSettingsSnapshot(records), baseline)) return { kind: "unavailable", reason: "stale" }
    }
    records = copyObject(records)
    const raw = baseline["doc:settings"]
    const envelope = { ...(jsonObject(raw) ? raw : {}), v: DOCUMENT_VERSION, gen: deps.generation(), at: deps.now(), by: ready.device.id, data: settings }
    if ("deleted" in envelope) delete envelope.deleted
    if (!jsonObject(envelope) || decodeDocument(envelope, decodeSettings).kind !== "value") return invalid
    const items: JsonObject = { "doc:settings": envelope }
    if (ready.device.syncOn) {
      const admission = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "changed", key: { kind: "settings" }, document: envelope } })
      if (admission.kind === "unavailable") return unavailable
      if (admission.kind === "refused") return { kind: "result", result: { refused: admission.reason } }
      if (admission.kind === "planned" && ready.history) {
        if (!jsonObject(baseline.sync)) return unavailable
        const repaired = deps.repairHistory(baseline.sync, admission.repairs)
        if (repaired) items.sync = repaired
      }
    }
    const effective = items.sync ?? baseline.sync
    const patch = prepareFirstEditHistory({ history: Object.hasOwn(baseline, "sync") ? { kind: "present", raw: effective } : { kind: "absent" }, syncOn: ready.device.syncOn })
    if (patch.kind === "unavailable") return unavailable
    if (patch.kind === "set") items.sync = patch.sync
    if (deps.disposed()) return { kind: "unavailable", reason: "disposed" }
    const before = await deps.local.get(["schema", "device", "sync", "doc:settings"])
    if (!jsonObject(before) || !sameSyncJson(readSettingsSnapshot(before), baseline)) return { kind: "unavailable", reason: "stale" }
    if (deps.disposed()) return { kind: "unavailable", reason: "disposed" }
    try {
      await deps.local.set(items)
    } catch (error) {
      return { kind: "failed", stage: "set", error }
    }
    try {
      const confirmed = await deps.local.get(["schema", "device", "sync", "doc:settings"])
      if (deps.disposed()) return { kind: "unconfirmed", cause: { kind: "authority" } }
      if (!jsonObject(confirmed) || !sameSyncJson(readSettingsSnapshot(confirmed), { ...baseline, ...items })) return { kind: "unconfirmed", cause: { kind: "readback" } }
      return { kind: "committed" }
    } catch (error) {
      return { kind: "unconfirmed", cause: { kind: "read-failed", error } }
    }
  } catch (error) {
    return { kind: "failed", stage: "before-set", error }
  }
}

function copy(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  return Array.isArray(value) ? value.map(copy) : copyObject(value)
}

function copyObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
}

function readSettingsSnapshot(records: JsonObject): JsonObject {
  return copyObject(Object.fromEntries(Object.entries(records).filter(([key]) => ["schema", "device", "sync", "doc:settings"].includes(key))))
}
