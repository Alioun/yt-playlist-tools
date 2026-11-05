import { CONSENT_VERSION, DecodeError, STORAGE_SCHEMA_VERSION, decodeDevice } from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import type { DeviceSettingChange, DeviceSettingAnswer } from "../../shared/contracts/ui-pages"
import type { LocalWriteStorage } from "./local-filter-writer"
import { sameSyncJson } from "./sync-write-admission"

function jsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}

/**
 * One of this browser's own choices in `device` (DATA-12): recent adds, the detailed console log, the picker's
 * Sort A–Z and the last new-playlist visibility. They never sync. The write is confirmed by reading it back, and
 * a record changed meanwhile refuses the write rather than overwrite it.
 */
export async function executeDeviceSetting(deps: { readonly local: LocalWriteStorage; readonly change: DeviceSettingChange; readonly isStopped: () => boolean }): Promise<DeviceSettingAnswer> {
  const unavailable = { kind: "refused", reason: "unavailable" } as const
  if (deps.isStopped()) return unavailable
  const loaded = await deps.local.get(["schema", "device"])
  if (deps.isStopped()) return unavailable
  if (loaded.schema !== STORAGE_SCHEMA_VERSION || !jsonObject(loaded.device)) return unavailable
  const raw = structuredClone(loaded.device)
  try {
    const device = decodeDevice(raw)
    if (!device.consent || device.consent.v > CONSENT_VERSION) return unavailable
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "refused", reason: "invalid" }
    throw error
  }
  if (raw[deps.change.field] === deps.change.value) return { kind: "confirmed", change: deps.change }
  const next: JsonObject = { ...raw, [deps.change.field]: deps.change.value }
  const preflight = await deps.local.get(["device"])
  if (deps.isStopped() || !jsonObject(preflight.device) || !sameSyncJson(preflight.device, loaded.device)) return unavailable
  try {
    await deps.local.set({ device: next })
  } catch {
    return { kind: "refused", reason: "unconfirmed" }
  }
  const readback = await deps.local.get(["device"]).catch(() => ({}))
  return jsonObject(readback) && jsonObject(readback.device) && sameSyncJson(readback.device, next) ? { kind: "confirmed", change: deps.change } : { kind: "refused", reason: "unconfirmed" }
}
