import { objectShape } from "./object-shape"
import { isJsonValue, type JsonValue } from "./json"
import type { RpcContract } from "../rpc/rpc"

export const clearAllText = "Clear all data? Perchling forgets everything it keeps in this browser: features, shortcuts, account setups, channel filters, cached playlists and watch progress. It starts again as if just installed. Your playlists on YouTube aren't touched."
export const clearAllCheckboxText = "Also delete synced settings from all your browsers"
export type ClearAllPayload =
  | { readonly action: "review"; readonly alsoSynced: boolean }
  | { readonly action: "confirm"; readonly review: string; readonly alsoSynced: boolean }
  | { readonly action: "cancel"; readonly review: string }
export type ClearAllAnswer =
  | { readonly kind: "reviewed"; readonly review: string; readonly alsoSynced: boolean; readonly text: typeof clearAllText; readonly button: "Clear" | "Clear here and everywhere" }
  | { readonly kind: "cancelled" }
  | { readonly kind: "unavailable"; readonly reason: "origin" | "confirmation" | "scope" | "disposed" | "capacity" | "collaborator" }
  | { readonly kind: "clear-result"; readonly scope: "local" | "synced"; readonly erasure: "confirmed" | "held";
    readonly outcome: "cleared" | "failed" | "partial" | "unconfirmed" | "deferred" | "unavailable";
    readonly stage: string; readonly readiness: "ready" | "held" | "not-started";
    readonly firstRun: "opened" | "unconfirmed" | "not-bound"; readonly progress: JsonValue
    /** A ticked clear under a newer layout cleared this browser only (R175). */
    readonly synced?: "kept-newer-layout" }
export type ClearAllMessages = { readonly "ui.clearAll": { readonly payload: ClearAllPayload; readonly result: ClearAllAnswer } }
const boolean = (raw: unknown) => typeof raw === "boolean"
const token = (raw: unknown): raw is string => typeof raw === "string" && raw.length > 0 && raw.length <= 256
export function isClearAllPayload(raw: unknown): raw is ClearAllPayload {
  return objectShape(raw, { action: v => v === "review", alsoSynced: boolean }) ||
    objectShape(raw, { action: v => v === "confirm", review: token, alsoSynced: boolean }) ||
    objectShape(raw, { action: v => v === "cancel", review: token })
}
export function isClearAllAnswer(raw: unknown): raw is ClearAllAnswer {
  if (objectShape(raw, { kind: v => v === "reviewed", review: token, alsoSynced: boolean, text: v => v === clearAllText,
    button: v => v === "Clear" || v === "Clear here and everywhere" }))
    return raw.button === (raw.alsoSynced ? "Clear here and everywhere" : "Clear")
  return objectShape(raw, { kind: v => v === "cancelled" }) ||
    objectShape(raw, { kind: v => v === "unavailable", reason: v => ["origin", "confirmation", "scope", "disposed", "capacity", "collaborator"].includes(String(v)) }) ||
    objectShape(raw, { kind: v => v === "clear-result", scope: v => v === "local" || v === "synced", erasure: v => v === "confirmed" || v === "held",
      outcome: v => ["cleared", "failed", "partial", "unconfirmed", "deferred", "unavailable"].includes(String(v)),
      stage: v => typeof v === "string" && v.length > 0 && v.length <= 128,
      readiness: v => v === "ready" || v === "held" || v === "not-started", firstRun: v => v === "opened" || v === "unconfirmed" || v === "not-bound", progress: isJsonValue },
      { synced: v => v === "kept-newer-layout" }) &&
      (raw.erasure === "confirmed" ? raw.outcome === "cleared" : raw.outcome !== "cleared") &&
      (raw.synced === undefined || raw.erasure === "confirmed" && raw.scope === "local")
}
export const clearAllContract: RpcContract<ClearAllMessages> = {
  "ui.clearAll": { payload: isClearAllPayload, result: isClearAllAnswer, timeoutMs: 60000 }
}
