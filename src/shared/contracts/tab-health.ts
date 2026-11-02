import type { BreakageSignal } from "./diagnostics"
import { objectShape } from "./object-shape"
import { isJobId, type JobId } from "./vocabulary"
import { isAccountKey, type AccountKey } from "../model/validation"
import type { AnchorId } from "../features/registry"
import type { RpcContract } from "../rpc/rpc"

/** An anchor check once the page settled (HEALTH-02): how many distinct video links the main content has, and how many were recognised. */
export type TabAnchorObservation = {
  readonly relevant: boolean; readonly visible: boolean; readonly settledMs: number; readonly distinctMainLinks: number; readonly recognised: number
}
/**
 * What a tab tells the Monitor (HEALTH-01, HEALTH-28): breakage signals, an anchor found missing, and successes and
 * measurable playbacks that clear earlier evidence. Signals name no video, playlist, channel or account (HEALTH-03).
 */
export type TabHealthReport =
  | { readonly kind: "signal"; readonly signal: BreakageSignal; readonly evidence: "job"; readonly online: boolean; readonly answered: boolean }
  | { readonly kind: "signal"; readonly signal: BreakageSignal; readonly evidence: "playback" | "diagnostic" }
  | { readonly kind: "anchor"; readonly anchor: AnchorId; readonly observation: TabAnchorObservation; readonly signal: BreakageSignal }
  | { readonly kind: "success"; readonly job: JobId }
  | { readonly kind: "measured" }
export type TabHealthMessages = {
  "tab.health": { payload: { readonly acct: AccountKey | null; readonly request: { readonly reports: readonly TabHealthReport[] } }; result: null }
}
export const HEALTH_REPORTS = 40

const bool = (value: unknown) => typeof value === "boolean"
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
// The Monitor checks each signal against the diagnostics vocabulary itself; the wire only bounds its shape.
const signal = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
export function isTabHealthReport(value: unknown): value is TabHealthReport {
  return objectShape(value, { kind: v => v === "signal", signal, evidence: v => v === "job", online: bool, answered: bool })
    || objectShape(value, { kind: v => v === "signal", signal, evidence: v => v === "playback" || v === "diagnostic" })
    // The background checks the anchor against the registry; the wire keeps the tab's bundle free of it.
    || objectShape(value, { kind: v => v === "anchor", anchor: v => typeof v === "string" && v.length <= 40, signal, observation: v => objectShape(v, {
      relevant: bool, visible: bool, settledMs: count, distinctMainLinks: count, recognised: count }) })
    || objectShape(value, { kind: v => v === "success", job: isJobId })
    || objectShape(value, { kind: v => v === "measured" })
}
export const tabHealthContract: RpcContract<TabHealthMessages> = {
  "tab.health": {
    payload: (v): v is TabHealthMessages["tab.health"]["payload"] => objectShape(v, { acct: a => a === null || isAccountKey(a),
      request: r => objectShape(r, { reports: list => Array.isArray(list) && list.length > 0 && list.length <= HEALTH_REPORTS && list.every(isTabHealthReport) }) }),
    result: (v): v is null => v === null, timeoutMs: 5_000
  }
}
