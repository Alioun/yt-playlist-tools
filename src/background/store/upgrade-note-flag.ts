import { DecodeError, STORAGE_SCHEMA_VERSION, decodeDevice } from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import type { LocalWriteStorage } from "./local-filter-writer"
import { sameSyncJson } from "./sync-write-admission"

export type UpgradeNoteFlag = "opened" | "seen" | "reopened"
export type UpgradeNoteFlagResult = "set" | "unchanged" | "not-pending" | "unavailable" | "unconfirmed"
const jsonObject = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)

/**
 * Marks the pending upgrade note opened, seen or reopened (REL-CON-01, REL-CON-25). Each flag only turns on, so
 * the note opens once, and once more only if nobody saw it. A changed record refuses the write.
 */
export async function executeUpgradeNoteFlag(deps: { readonly local: LocalWriteStorage; readonly flag: UpgradeNoteFlag; readonly isStopped: () => boolean }): Promise<UpgradeNoteFlagResult> {
  if (deps.isStopped()) return "unavailable"
  const loaded = await deps.local.get(["schema", "device"])
  if (loaded.schema !== STORAGE_SCHEMA_VERSION || !jsonObject(loaded.device)) return "unavailable"
  try { decodeDevice(loaded.device) } catch (error) { if (error instanceof DecodeError) return "unavailable"; throw error }
  const note = loaded.device.upgradeNote
  if (!jsonObject(note) || note.state !== "pending") return "not-pending"
  if (note[deps.flag] === true) return "unchanged"
  const next: JsonObject = { ...loaded.device, upgradeNote: { ...note, [deps.flag]: true } }
  const preflight = await deps.local.get(["device"])
  if (deps.isStopped() || !jsonObject(preflight.device) || !sameSyncJson(preflight.device, loaded.device)) return "unavailable"
  try { await deps.local.set({ device: next }) } catch { return "unconfirmed" }
  const readback = await deps.local.get(["device"]).catch(() => ({}))
  return jsonObject(readback) && jsonObject(readback.device) && sameSyncJson(readback.device, next) ? "set" : "unconfirmed"
}
