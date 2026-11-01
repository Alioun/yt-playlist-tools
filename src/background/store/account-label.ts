import { decodeAccountCache, decodeDocument, decodeSetup, emptyAccountCache, isAccountKey, isPlaylistId,
  type AccountKey, type AccountLabel } from "../../shared/model"
import { readSettingsView } from "../../shared/model/settings-view"
import { isJobDataFor, type JobData, type JobOf } from "../../shared/contracts/jobs"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { cacheSetupState, type PlaylistCacheCapture } from "./playlist-cache"
import { readAccountSetup, type SetupDestinationPlan } from "./setup-edit"
import type { SetupDestinationResult } from "./setup-edit-execution"
import type { TabProjectionInvalid, TabProjectionUnavailable } from "./tab-projection"

export const ACCOUNT_LABEL_MS = 24 * 60 * 60 * 1_000
export type LabelJob = JobOf<"accountLabel">
export type AccountLabelSeen =
  | { readonly kind: "no-setup" }
  | { readonly kind: "current"; readonly capture: PlaylistCacheCapture; readonly label: AccountLabel | null; readonly checkedAt: number; readonly lastAccount: "committed" | "unchanged" }
  | { readonly kind: "lookup"; readonly capture: PlaylistCacheCapture; readonly label: AccountLabel | null; readonly checkedAt: number; readonly lastAccount: "committed" | "unchanged" }
  | { readonly kind: "refused"; readonly reason: "private" | "invalid" | "revoked" }
  | { readonly kind: "failed"; readonly stage: "read" | "set" }
  | { readonly kind: "unconfirmed"; readonly write: "resolved" | "rejected" }
  | { readonly kind: "invalid"; readonly part: "cache" | "setup" }
  | TabProjectionUnavailable | TabProjectionInvalid
export type AccountLabelWrite =
  | { readonly kind: "committed" | "current"; readonly label: AccountLabel; readonly checkedAt: number }
  | { readonly kind: "stale" }
  | { readonly kind: "setup"; readonly result: Exclude<SetupDestinationResult, { kind: "committed" | "unchanged" }> }
export type AccountLabelsOwner = {
  seeAccountLabel(request: { readonly acct: AccountKey; readonly private: false; readonly at: number }): Promise<AccountLabelSeen>
  completeAccountLabel<A extends AccountKey>(capture: PlaylistCacheCapture<A>, input: { readonly acct: NoInfer<A>; readonly label: JobData<LabelJob> }): Promise<AccountLabelWrite>
}

export function labelCheckDue(at: number | null, now: number): boolean {
  return at === null || now >= at && now - at >= ACCOUNT_LABEL_MS
}

export function sameAccountLabel(left: AccountLabel | null, right: AccountLabel | null): boolean {
  return left === null || right === null ? left === right : left.name === right.name && left.handle === right.handle && left.avatar === right.avatar
}

export function checkedAccountLabel(raw: unknown): AccountLabel | undefined {
  if (!isJobDataFor<LabelJob>({ kind: "accountLabel" }, raw) ||
    raw === null || typeof raw !== "object" || !("name" in raw) || typeof raw.name !== "string") return
  const handle = "handle" in raw ? raw.handle : undefined
  const avatar = "avatar" in raw ? raw.avatar : undefined
  if (handle !== undefined && (typeof handle !== "string" || handle !== "" && !/^@[\p{L}\p{N}_.-]+$/u.test(handle))) return
  if (avatar !== undefined) {
    if (typeof avatar !== "string") return
    try { const url = new URL(avatar); if (url.protocol !== "https:" || url.username || url.password) return } catch { return }
  }
  return { name: Array.from(raw.name).slice(0, 100).join(""),
    ...(typeof handle === "string" ? { handle: Array.from(handle).slice(0, 30).join("") } : {}),
    ...(typeof avatar === "string" ? { avatar } : {}) }
}

export function accountLabelState(records: Readonly<Record<string, unknown>>, acct: AccountKey):
  | { readonly kind: "label"; readonly label: AccountLabel | null; readonly checkedAt: number | null }
  | { readonly kind: "no-setup" | "invalid" | "newer-version" } {
  const state = cacheSetupState(records, acct)
  if (state !== "live") return { kind: state === "none" ? "no-setup" : state }
  const read = readAccountSetup(records, acct)
  if (read.kind !== "value") return { kind: read.kind }
  if (read.view.kind !== "live") return { kind: "no-setup" }
  try { return { kind: "label", label: structuredClone(read.view.setup.label), checkedAt: decodeAccountCache(records[`cache:${acct}`] ?? emptyAccountCache()).labelAt } }
  catch { return { kind: "invalid" } }
}

export function planAccountLabel(records: JsonObject, acct: AccountKey, expected: AccountLabel | null, label: AccountLabel): SetupDestinationPlan {
  if (!isAccountKey(acct)) return { kind: "invalid" }
  const state = accountLabelState(records, acct)
  if (state.kind !== "label") return state.kind === "newer-version" ? { kind: "update-needed" }
    : state.kind === "invalid" ? { kind: "invalid" } : { kind: "stale", reason: "setup" }
  if (!sameAccountLabel(state.label, expected)) return { kind: "stale", reason: "setup" }
  if (sameAccountLabel(state.label, label)) return { kind: "unchanged" }
  const raw = records[`doc:setup:${acct}`]
  if (!isJsonValue(raw)) return { kind: "invalid" }
  const document = decodeDocument(raw, decodeSetup), settings = readSettingsView(records["doc:settings"])
  if (document.kind !== "value" || settings.kind === "invalid") return { kind: "invalid" }
  const setup = document.document.data
  const nextLabel = { ...setup.label, ...label }
  if (label.handle === undefined) delete nextLabel.handle
  if (label.avatar === undefined) delete nextLabel.avatar
  const shortcutIds = new Set(settings.kind === "newer-version" ? Object.keys(setup.targets) : settings.settings.shortcuts.list.map(row => row.id))
  const additionalChosenPlaylists = settings.kind === "newer-version" ? new Set(Object.keys(setup.marks).filter(isPlaylistId))
    : new Set(settings.settings.shortcuts.list.some(row => row.watchLaterOnEveryAccount && !Object.hasOwn(setup.targets, row.id)) ? ["WL"] : [])
  return { kind: "save", key: { kind: "setup", acct }, setup: { ...setup, label: nextLabel }, context: { shortcutIds, additionalChosenPlaylists } }
}
