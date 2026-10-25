import { DecodeError, isRecord } from "./codec"
import { decodeDocument, decodeStamp, DOCUMENT_VERSION } from "./documents"
import { decodeSettings } from "./decodeSettings"
import { defaultSettings } from "./defaults"
import { isJsonValue, type JsonValue } from "../contracts/json"
import type { Settings } from "./types"

export type Snapshot<T> = T extends object ? { readonly [P in keyof T]: Snapshot<T[P]> } : T
export type SettingsView =
  | { readonly kind: "value"; readonly settings: Snapshot<Settings> }
  | { readonly kind: "newer-version"; readonly version: number }
  | { readonly kind: "invalid" }

function detach(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(detach)
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, detach(child)]))
}

export function readSettingsView(rawDocument: unknown): SettingsView {
  try {
    if (rawDocument === undefined || rawDocument === null) return { kind: "value", settings: defaultSettings() }
    if (!isRecord(rawDocument)) return { kind: "invalid" }
    const stamp = decodeStamp(Object.fromEntries(["v", "gen", "at", "by"].map(key => [key, Object.getOwnPropertyDescriptor(rawDocument, key)?.value])))
    if (stamp.v > DOCUMENT_VERSION) return { kind: "newer-version", version: stamp.v }
    if (!isJsonValue(rawDocument) || Object.keys(Object.prototype).length > 0) return { kind: "invalid" }
    const document = decodeDocument(detach(rawDocument), decodeSettings)
    switch (document.kind) {
      case "absent":
      case "deleted": return { kind: "value", settings: defaultSettings() }
      case "value": return { kind: "value", settings: document.document.data }
      case "newer-version": return { kind: "newer-version", version: document.version }
    }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "invalid" }
    throw error
  }
}
