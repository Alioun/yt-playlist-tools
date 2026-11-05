import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { DecodeError } from "../../shared/model/codec"
import { decodeSyncState } from "../../shared/model/decodeSyncState"
import type { SyncState } from "../../shared/model/types"

export type StoredEditHistory = { readonly kind: "absent" } | { readonly kind: "present"; readonly raw: unknown }

export type FirstEditProvenance = { readonly kind: "unedited" } | { readonly kind: "edited" } | { readonly kind: "unknown" } | { readonly kind: "invalid" }

export type FirstEditHistoryPatch = { readonly kind: "unchanged" } | { readonly kind: "set"; readonly sync: JsonObject } | { readonly kind: "unavailable"; readonly reason: "history" }

function copy(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  return Array.isArray(value) ? value.map(copy) : copyObject(value)
}

function copyObject(value: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
}

function supported(raw: unknown): { raw: JsonObject; state: SyncState } | null {
  if (!isJsonValue(raw) || raw === null || typeof raw !== "object" || Array.isArray(raw)) return null
  const detached = copyObject(raw)
  try {
    const state = decodeSyncState(detached)
    if (state.everEdited === false && state.editedSinceOff) return null
    return { raw: detached, state }
  } catch (error) {
    if (error instanceof DecodeError) return null
    throw error
  }
}

export function readFirstEditProvenance(history: StoredEditHistory): FirstEditProvenance {
  if (history.kind === "absent") return { kind: "unknown" }
  const parsed = supported(history.raw)
  if (!parsed) return { kind: "invalid" }
  if (parsed.state.everEdited === true || parsed.state.editedSinceOff) return { kind: "edited" }
  if (parsed.state.everEdited === false) return { kind: "unedited" }
  return { kind: "unknown" }
}

// Call only for an admitted actual changed-document transaction.
export function prepareFirstEditHistory(input: { readonly history: StoredEditHistory; readonly syncOn: boolean }): FirstEditHistoryPatch {
  if (input.history.kind === "absent") {
    return input.syncOn
      ? { kind: "unavailable", reason: "history" }
      : {
          kind: "set",
          sync: { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
        }
  }
  const parsed = supported(input.history.raw)
  if (!parsed) return { kind: "unavailable", reason: "history" }
  if (parsed.state.everEdited === true && (input.syncOn || parsed.state.editedSinceOff)) return { kind: "unchanged" }
  return {
    kind: "set",
    sync: { ...parsed.raw, everEdited: true, ...(!input.syncOn ? { editedSinceOff: true } : {}) }
  }
}
