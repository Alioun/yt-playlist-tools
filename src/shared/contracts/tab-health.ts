import type { BreakageSignal } from "./diagnostics"
import { objectShape } from "./object-shape"
import { isJobId, type JobId } from "./vocabulary"
import { isAccountKey, type AccountKey } from "../model/validation"
import type { AnchorId } from "../features/registry"
import { isDueNotice, isPageFeatureId, type DueNotice, type PageFeatureId } from "./tab-view"
import type { RpcContract } from "../rpc/rpc"

/** An anchor check once the page settled (HEALTH-02): how many distinct video links the main content has, and how many were recognised. */
export type TabAnchorObservation =
  | {
      readonly relevant: boolean
      readonly visible: boolean
      readonly settledMs: number
      readonly distinctMainLinks: number
      readonly recognised: number
    }
  | {
      /** YouTube Music's player bar drew no like for the player-bar Save where it should have (YM-FAIL-8, YM-FAIL-10). */
      readonly kind: "player-bar"
      readonly requiredHere: boolean
      readonly visible: boolean
      readonly settledMs: number
      readonly present: boolean
    }
/**
 * What a tab tells the Monitor (HEALTH-01, HEALTH-28): breakage signals, an anchor found missing, and successes and
 * measurable playbacks that clear earlier evidence. Signals name no video, playlist, channel or account (HEALTH-03).
 */
export type TabHealthReport =
  | { readonly kind: "signal"; readonly signal: BreakageSignal; readonly evidence: "job"; readonly online: boolean; readonly answered: boolean }
  | { readonly kind: "signal"; readonly signal: BreakageSignal; readonly evidence: "playback" | "diagnostic" }
  | { readonly kind: "anchor"; readonly anchor: AnchorId; readonly observation: TabAnchorObservation; readonly signal: BreakageSignal }
  | { readonly kind: "success"; readonly job: JobId; readonly at?: number }
  | { readonly kind: "measured" }
/** A not-working notice the Monitor handed this tab, and the token the tab hands back once it is on screen (YT-BRK-02). */
export type TabNoticeClaim = { readonly token: string; readonly due: DueNotice }
type Pinned<T> = { readonly acct: AccountKey | null; readonly request: T }
export type TabHealthMessages = {
  "tab.health": { payload: Pinned<{ readonly reports: readonly TabHealthReport[] }>; result: boolean }
  /** A feature that isn't working was about to act here: draw its buttons, place its button or take a right-click (YT-BRK-02). */
  "tab.wouldAct": { payload: Pinned<{ readonly feature: PageFeatureId }>; result: null }
  /** Takes the notice this tab's view says is due, or null when another tab took it or none is due. */
  "tab.claimNotice": { payload: Pinned<null>; result: TabNoticeClaim | null }
  /** The claimed notice is on screen, so it isn't shown again this browser session. */
  "tab.noticeShown": { payload: Pinned<{ readonly token: string }>; result: null }
  /** The tab was hidden or went fullscreen before the claimed notice was on screen, so a visible tab may take it. */
  "tab.noticeReleased": { payload: Pinned<{ readonly token: string }>; result: null }
}
export const HEALTH_REPORTS = 40

const bool = (value: unknown) => typeof value === "boolean"
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
// The Monitor checks each signal against the diagnostics vocabulary itself; the wire only bounds its shape.
const signal = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value)
export function isTabHealthReport(value: unknown): value is TabHealthReport {
  return (
    objectShape(value, { kind: v => v === "signal", signal, evidence: v => v === "job", online: bool, answered: bool }) ||
    objectShape(value, { kind: v => v === "signal", signal, evidence: v => v === "playback" || v === "diagnostic" }) ||
    // The background checks the anchor against the registry; the wire keeps the tab's bundle free of it.
    objectShape(value, {
      kind: v => v === "anchor",
      anchor: v => typeof v === "string" && v.length <= 40,
      signal,
      observation: v =>
        objectShape(v, {
          relevant: bool,
          visible: bool,
          settledMs: count,
          distinctMainLinks: count,
          recognised: count
        }) || objectShape(v, { kind: k => k === "player-bar", requiredHere: bool, visible: bool, settledMs: count, present: bool })
    }) ||
    objectShape(value, { kind: v => v === "success", job: isJobId }, { at: count }) ||
    objectShape(value, { kind: v => v === "measured" })
  )
}
const acct = (value: unknown) => value === null || isAccountKey(value)
const token = (value: unknown) => typeof value === "string" && value.length <= 40
export const tabHealthContract: RpcContract<TabHealthMessages> = {
  "tab.health": {
    payload: (v): v is TabHealthMessages["tab.health"]["payload"] =>
      objectShape(v, {
        acct,
        request: r => objectShape(r, { reports: list => Array.isArray(list) && list.length > 0 && list.length <= HEALTH_REPORTS && list.every(isTabHealthReport) })
      }),
    result: (v): v is boolean => bool(v),
    timeoutMs: 5_000
  },
  "tab.wouldAct": {
    payload: (v): v is TabHealthMessages["tab.wouldAct"]["payload"] => objectShape(v, { acct, request: r => objectShape(r, { feature: isPageFeatureId }) }),
    result: (v): v is null => v === null,
    timeoutMs: 5_000
  },
  "tab.claimNotice": {
    payload: (v): v is TabHealthMessages["tab.claimNotice"]["payload"] => objectShape(v, { acct, request: r => r === null }),
    result: (v): v is TabNoticeClaim | null => v === null || objectShape(v, { token, due: isDueNotice }),
    timeoutMs: 5_000
  },
  "tab.noticeShown": {
    payload: (v): v is TabHealthMessages["tab.noticeShown"]["payload"] => objectShape(v, { acct, request: r => objectShape(r, { token }) }),
    result: (v): v is null => v === null,
    timeoutMs: 5_000
  },
  "tab.noticeReleased": {
    payload: (v): v is TabHealthMessages["tab.noticeReleased"]["payload"] => objectShape(v, { acct, request: r => objectShape(r, { token }) }),
    result: (v): v is null => v === null,
    timeoutMs: 5_000
  }
}
