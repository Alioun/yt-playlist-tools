import { prepareFirstEditHistory } from "./first-edit-provenance"
import { DOCUMENT_VERSION, decodeDocument, decodeSettings } from "../../shared/model"
import { readSettingsView } from "../../shared/model/settings-view"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { SharedSettingResult } from "./settings-edit"
import { planSyncWrite, sameSyncJson } from "./sync-write-admission"
import type { SettingsMutationDependencies } from "./feature-settings-mutation"

import type { LocalSettingsWriteResult } from "./shared-setting-execution"

function jsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

export async function executeKeySettingsMutation(
  deps: SettingsMutationDependencies,
  editSettings: (settings: ReturnType<typeof decodeSettings>, records: JsonObject) => SharedSettingResult
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
    const edit = editSettings(decodeSettings(view.settings), records)
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
    if (!jsonObject(edit.settings)) return invalid
    if (ready.device.syncOn) {
      records = await deps.local.get(null)
      if (deps.disposed()) return { kind: "unavailable", reason: "disposed" }
      if (!jsonObject(records) || !sameSyncJson(readSettingsSnapshot(records), baseline)) return { kind: "unavailable", reason: "stale" }
    }
    records = copyObject(records)
    const raw = baseline["doc:settings"]
    const envelope = { ...(jsonObject(raw) ? raw : {}), v: DOCUMENT_VERSION, gen: deps.generation(), at: deps.now(), by: ready.device.id, data: edit.settings }
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
