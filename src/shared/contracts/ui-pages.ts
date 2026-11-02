import { objectShape } from "./object-shape"
import { isBreakageKind, isFeatureId, isJobId, isSite, type BreakageKind, type FeatureId, type JobId, type Privacy, type Site } from "./vocabulary"
import { isUiUnavailable, type UiUnavailable } from "./ui-playlists"
import { isAccountKey, isChannelId, isPlaylistId, isVideoId, type AccountKey, type ChannelId, type PlaylistId, type VideoId } from "../model/validation"
import { isKey } from "../model/keys"
import { isAgreementAnswer, isFeatureSelection } from "./first-run"
import type { Key } from "../model/types"
import { isNowPlaying, type NowPlaying } from "./media"
import type { RpcContract } from "../rpc/rpc"

type WindowClaim = { readonly windowId?: number }
export type HealthState = "working" | "partly-working" | "not-working"
/** What a partly working feature can't do (UI-SET-09): the copy names the gap. */
export type HealthGap = "membership" | "actions" | "measure" | "player" | "queue" | "playlist"
export type UiFeatureHealth = { readonly feature: FeatureId; readonly site: Site; readonly state: HealthState; readonly gaps: readonly HealthGap[] }
/** The popup's tab: a YouTube or YouTube Music tab our site core answered from, or any other tab. */
export type UiTabFacts =
  | { readonly kind: "site"; readonly site: Site; readonly tabId: number; readonly signedIn: boolean; readonly acct: AccountKey | null }
  | { readonly kind: "other" }
/**
 * The live facts the popup and settings can't read from storage (UI-POP-09, UI-POP-23): Pause, the requester's
 * tab, and feature health from the Monitor, for that tab or, over any other tab, for every open tab of each site.
 */
export type UiStatus = { readonly kind: "status"; readonly paused: boolean; readonly tab: UiTabFacts; readonly health: readonly UiFeatureHealth[] } | UiUnavailable
export type UiPauseAnswer = { readonly kind: "paused"; readonly paused: boolean } | { readonly kind: "refused"; readonly reason: "unavailable" | "unconfirmed" } | UiUnavailable

export type RecentSource = { readonly kind: "feature"; readonly feature: string } | { readonly kind: "shortcut"; readonly key: Readonly<Key> }
export type RecentEntry = {
  readonly at: number
  readonly source: RecentSource
  readonly playlists: readonly { readonly id: PlaylistId; readonly title: string }[]
  readonly videos: readonly { readonly id: VideoId; readonly title: string }[]
  readonly gather: boolean
}
export type UiRecentAdds = { readonly kind: "recent"; readonly entries: readonly RecentEntry[] } | UiUnavailable

export type DeviceSettingChange =
  | { readonly field: "recentAdds" | "detailedLog" | "pickerSortAZ"; readonly value: boolean }
  | { readonly field: "newPlaylistVisibility"; readonly value: Privacy }
export type DeviceSettingAnswer =
  | { readonly kind: "confirmed"; readonly change: DeviceSettingChange }
  | { readonly kind: "refused"; readonly reason: "private" | "invalid" | "unavailable" | "unconfirmed" }

export type FilterSettingChange = {
  readonly acct: AccountKey
  readonly playlist: PlaylistId
  readonly desired: { readonly mode: "allow" | "deny"; readonly on: boolean }
  /** A mode switch with channels listed clears them only once the user confirmed it (UI-PICK-21). */
  readonly clearListed: boolean
  readonly expectedGeneration: string | null
}
export type FilterSettingAnswer =
  | { readonly kind: "confirmed" }
  | { readonly kind: "refused"; readonly reason: "private" | "sync-full" | "update-needed" | "invalid" | "unavailable" | "unconfirmed" }
  | UiUnavailable

/** Lists or unlists one channel in a filter (YT-CF-14, YT-CF-15). `mode` is a "this channel" control's; the editor sends null. */
export type FilterChannelChange = {
  readonly acct: AccountKey
  readonly playlist: PlaylistId
  readonly channel: readonly [id: ChannelId, title: string, handle?: string]
  readonly action: "list" | "unlist"
  readonly mode: "allow" | "deny" | null
  readonly clearListed: boolean
  readonly expectedGeneration: string | null
}
/** SYNC-14's Remove kept filters: the filters of playlists no account auto-adds to any more. */
export type UiKeptFilters = { readonly kind: "removed"; readonly filters: number } | { readonly kind: "refused"; readonly reason: "private" | "unavailable" | "unconfirmed" } | UiUnavailable
/** One breakage signal as Diagnostics' report shows it (HEALTH-24). It names no video, playlist, channel or account (HEALTH-03). */
export type UiSignal = {
  readonly site: Site; readonly feature: FeatureId | null; readonly job: JobId | null; readonly route: string | null; readonly kind: BreakageKind
  readonly pageType: string; readonly clientVersion: string | null; readonly shape: string | null; readonly count: number; readonly firstSeen: number; readonly lastSeen: number
}
/** Check now's answer for one site's serving tab: each read job and whether it answered (HEALTH-23). */
export type UiCheck = { readonly site: Site; readonly at: number; readonly jobs: readonly { readonly job: JobId; readonly ok: boolean }[] }
export type UiDiagnostics =
  | { readonly kind: "diagnostics"; readonly checks: readonly UiCheck[]; readonly signals: readonly UiSignal[]; readonly tabs: { readonly www: boolean; readonly music: boolean } }
  | { readonly kind: "refused"; readonly reason: "consent" | "no-tab" }
  | UiUnavailable

export type UiWithdrawal = { readonly kind: "withdrawn" } | { readonly kind: "refused"; readonly reason: "not-agreed" | "failed" | "unconfirmed" | "unavailable" } | UiUnavailable
export type RemovalPayload = { readonly action: "prepare"; readonly acct: AccountKey } | { readonly action: "confirm"; readonly token: string }
export type UiRemoval =
  | { readonly kind: "confirm"; readonly token: string; readonly scope: "this-browser" | "syncing-browsers" }
  | { readonly kind: "removed" | "unchanged" }
  | { readonly kind: "refused"; readonly reason: "failed" | "unconfirmed" | "unavailable" | "private" | "sync-full" | "update-needed" | "invalid" }
  | UiUnavailable
export type UiExport = { readonly kind: "file"; readonly filename: string; readonly text: string } | { readonly kind: "refused" } | UiUnavailable
export type ImportPayload = { readonly action: "prepare"; readonly text: string } | { readonly action: "confirm"; readonly token: string }
export type UiImport =
  | { readonly kind: "confirm"; readonly token: string; readonly accounts: number }
  | { readonly kind: "imported" }
  | { readonly kind: "refused"; readonly reason: "private" | "newer-format" | "invalid-file" | "failed" | "unavailable" }
  | UiUnavailable

export type NotePercentage = "keep" | "immediate" | "half"
export type NoteAgreeChange = {
  readonly displayedVersion: number; readonly attempt: number; readonly selected: readonly import("./first-run").FirstRunFeature[]
  readonly syncOn: boolean; readonly percentage: NotePercentage
}


export type PageMessages = {
  readonly "ui.status": { readonly payload: WindowClaim; readonly result: UiStatus }
  readonly "ui.pause": { readonly payload: WindowClaim & { readonly paused: boolean }; readonly result: UiPauseAnswer }
  readonly "ui.recentAdds": { readonly payload: WindowClaim & { readonly acct: AccountKey }; readonly result: UiRecentAdds }
  readonly "ui.device": { readonly payload: WindowClaim & { readonly change: DeviceSettingChange }; readonly result: DeviceSettingAnswer | UiUnavailable }
  readonly "ui.filter": { readonly payload: WindowClaim & { readonly change: FilterSettingChange }; readonly result: FilterSettingAnswer }
  readonly "ui.filterChannel": { readonly payload: WindowClaim & { readonly change: FilterChannelChange }; readonly result: FilterSettingAnswer }
  readonly "ui.removeKeptFilters": { readonly payload: WindowClaim; readonly result: UiKeptFilters }
  /** Diagnostics' session evidence; `check` runs Check now first (HEALTH-22, HEALTH-23). */
  readonly "ui.diagnostics": { readonly payload: WindowClaim & { readonly check: boolean }; readonly result: UiDiagnostics }
  readonly "ui.withdraw": { readonly payload: WindowClaim & { readonly expected: { readonly v: number; readonly at: number } }; readonly result: UiWithdrawal }
  readonly "ui.removeSetup": { readonly payload: WindowClaim & RemovalPayload; readonly result: UiRemoval }
  readonly "ui.exportSettings": { readonly payload: WindowClaim; readonly result: UiExport }
  readonly "ui.importSettings": { readonly payload: WindowClaim & ImportPayload; readonly result: UiImport }
  /** The upgrade note was on screen (REL-CON-25). */
  readonly "ui.noteSeen": { readonly payload: WindowClaim; readonly result: { readonly kind: "noted" | "unavailable" } }
  /** The upgrade note's Agree, with its one question's answer (REL-CON-05). */
  readonly "ui.noteAgree": { readonly payload: WindowClaim & { readonly change: NoteAgreeChange }; readonly result: import("./first-run").AgreementAnswer }
  /** The popup's one-time claim result was dismissed with OK, for the account it named (ACC-32, UI-POP-10 row 12). */
  readonly "ui.claimSeen": { readonly payload: WindowClaim & { readonly acct: AccountKey }; readonly result: { readonly kind: "noted" | "unavailable" } }
  /** Discard deletes the unclaimed 1.x setup (ACC-33, DATA-42). */
  readonly "ui.discardUnclaimed": { readonly payload: WindowClaim; readonly result: UiDiscard }
  /** Work that withdrawal paused, which only an explicit Continue resumes (R167, UI-SET-16). */
  readonly "ui.pausedWork": { readonly payload: WindowClaim & ({ readonly action: "read" } | { readonly action: "continue"; readonly id: string }); readonly result: UiPausedWork }
}
/** One paused job as Privacy & data names it: bringing over 1.x settings, removing a setup, joining sync, a settings change or an import. */
export type UiPausedJob = { readonly id: string; readonly job: "migration" | "removal" | "sync" | "settings" | "import"; readonly acct: AccountKey | null }
export type UiPausedWork =
  | { readonly kind: "work" | "continued"; readonly jobs: readonly UiPausedJob[] }
  | { readonly kind: "refused"; readonly reason: "failed" | "unconfirmed" | "unavailable" | "private" }
export type UiDiscard = { readonly kind: "discarded" | "absent" } | { readonly kind: "refused"; readonly reason: "private" | "failed" | "unavailable" }
export type PageCall = keyof PageMessages

const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const bool = (value: unknown): value is boolean => typeof value === "boolean"
const text = (value: unknown): value is string => typeof value === "string"
const oneOf = <T extends string>(...values: readonly T[]) => (value: unknown): value is T => typeof value === "string" && values.some(item => item === value)
const list = <T>(check: (value: unknown) => value is T, max = 200) => (value: unknown): value is readonly T[] =>
  Array.isArray(value) && value.length <= max && value.every(check)
const windowClaim = { windowId: natural }
const gap = oneOf<HealthGap>("membership", "actions", "measure", "player", "queue", "playlist")

export function isUiFeatureHealth(value: unknown): value is UiFeatureHealth {
  return objectShape(value, { feature: isFeatureId, site: isSite, state: oneOf<HealthState>("working", "partly-working", "not-working"), gaps: list(gap, 6) })
}
export function isUiTabFacts(value: unknown): value is UiTabFacts {
  return objectShape(value, { kind: v => v === "other" })
    || objectShape(value, { kind: v => v === "site", site: isSite, tabId: natural, signedIn: v => v === true, acct: isAccountKey })
    || objectShape(value, { kind: v => v === "site", site: isSite, tabId: natural, signedIn: v => v === false, acct: v => v === null })
}
export function isUiStatus(value: unknown): value is UiStatus {
  return isUiUnavailable(value) || objectShape(value, { kind: v => v === "status", paused: bool, tab: isUiTabFacts, health: list(isUiFeatureHealth) })
}
const titled = <T>(id: (value: unknown) => value is T) => (value: unknown): value is { readonly id: T; readonly title: string } =>
  objectShape(value, { id, title: text })
export function isRecentEntry(value: unknown): value is RecentEntry {
  const source = (v: unknown): v is RecentSource => objectShape(v, { kind: x => x === "feature", feature: text }) || objectShape(v, { kind: x => x === "shortcut", key: isKey })
  return objectShape(value, { at: natural, source, playlists: list(titled(isPlaylistId), 50), videos: list(titled(isVideoId), 200), gather: bool })
}
export function isDeviceSettingChange(value: unknown): value is DeviceSettingChange {
  return objectShape(value, { field: oneOf("recentAdds", "detailedLog", "pickerSortAZ"), value: bool })
    || objectShape(value, { field: v => v === "newPlaylistVisibility", value: oneOf("PRIVATE", "UNLISTED", "PUBLIC") })
}
export function isFilterSettingChange(value: unknown): value is FilterSettingChange {
  return objectShape(value, { acct: isAccountKey, playlist: isPlaylistId, clearListed: bool,
    desired: v => objectShape(v, { mode: oneOf("allow", "deny"), on: bool }),
    expectedGeneration: v => v === null || typeof v === "string" && v.length > 0 && v.length <= 128 })
}
export function isFilterChannelChange(value: unknown): value is FilterChannelChange {
  const channel = (v: unknown) => Array.isArray(v) && (v.length === 2 || v.length === 3) && isChannelId(v[0]) && typeof v[1] === "string" && v[1].length <= 1000 &&
    (v.length === 2 || typeof v[2] === "string" && v[2].length <= 1000)
  return objectShape(value, { acct: isAccountKey, playlist: isPlaylistId, channel, action: oneOf("list", "unlist"), mode: v => v === null || v === "allow" || v === "deny",
    clearListed: bool, expectedGeneration: v => v === null || typeof v === "string" && v.length > 0 && v.length <= 128 })
}
function isUiSignal(value: unknown): value is UiSignal {
  const nullableText = (v: unknown) => v === null || typeof v === "string" && v.length <= 2048
  return objectShape(value, { site: isSite, feature: v => v === null || isFeatureId(v), job: v => v === null || isJobId(v), route: nullableText, kind: isBreakageKind,
    pageType: text, clientVersion: nullableText, shape: nullableText, count: natural, firstSeen: natural, lastSeen: natural })
}
function isUiCheck(value: unknown): value is UiCheck {
  return objectShape(value, { site: isSite, at: natural, jobs: list(v => objectShape(v, { job: isJobId, ok: bool }), 40) })
}
export function isUiDiagnostics(value: unknown): value is UiDiagnostics {
  return isUiUnavailable(value) || objectShape(value, { kind: v => v === "refused", reason: oneOf("consent", "no-tab") })
    || objectShape(value, { kind: v => v === "diagnostics", checks: list(isUiCheck, 2), signals: list(isUiSignal), tabs: v => objectShape(v, { www: bool, music: bool }) })
}
export function isDeviceSettingAnswer(value: unknown): value is DeviceSettingAnswer {
  return objectShape(value, { kind: v => v === "confirmed", change: isDeviceSettingChange })
    || objectShape(value, { kind: v => v === "refused", reason: oneOf("private", "invalid", "unavailable", "unconfirmed") })
}

const token = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64
const refusal = <T extends string>(...reasons: readonly T[]) => (v: unknown) => objectShape(v, { kind: x => x === "refused", reason: oneOf(...reasons) })
function isNoteAgreeChange(value: unknown): value is NoteAgreeChange {
  return objectShape(value, { displayedVersion: v => natural(v) && v > 0, attempt: v => natural(v) && v > 0, selected: isFeatureSelection, syncOn: bool,
    percentage: oneOf<NotePercentage>("keep", "immediate", "half") })
}
export const pageContract: RpcContract<PageMessages> = {
  "ui.status": { payload: (v): v is PageMessages["ui.status"]["payload"] => objectShape(v, {}, windowClaim), result: isUiStatus, timeoutMs: 8_000 },
  "ui.pause": { payload: (v): v is PageMessages["ui.pause"]["payload"] => objectShape(v, { paused: bool }, windowClaim),
    result: (v): v is UiPauseAnswer => isUiUnavailable(v) || objectShape(v, { kind: x => x === "paused", paused: bool })
      || objectShape(v, { kind: x => x === "refused", reason: oneOf("unavailable", "unconfirmed") }), timeoutMs: 8_000 },
  "ui.recentAdds": { payload: (v): v is PageMessages["ui.recentAdds"]["payload"] => objectShape(v, { acct: isAccountKey }, windowClaim),
    result: (v): v is UiRecentAdds => isUiUnavailable(v) || objectShape(v, { kind: x => x === "recent", entries: list(isRecentEntry, 50) }), timeoutMs: 8_000 },
  "ui.device": { payload: (v): v is PageMessages["ui.device"]["payload"] => objectShape(v, { change: isDeviceSettingChange }, windowClaim),
    result: (v): v is DeviceSettingAnswer | UiUnavailable => isUiUnavailable(v) || isDeviceSettingAnswer(v), timeoutMs: 8_000 },
  "ui.filter": { payload: (v): v is PageMessages["ui.filter"]["payload"] => objectShape(v, { change: isFilterSettingChange }, windowClaim),
    result: (v): v is FilterSettingAnswer => isUiUnavailable(v) || objectShape(v, { kind: x => x === "confirmed" })
      || objectShape(v, { kind: x => x === "refused", reason: oneOf("private", "sync-full", "update-needed", "invalid", "unavailable", "unconfirmed") }), timeoutMs: 12_000 },
  "ui.filterChannel": { payload: (v): v is PageMessages["ui.filterChannel"]["payload"] => objectShape(v, { change: isFilterChannelChange }, windowClaim),
    result: (v): v is FilterSettingAnswer => isUiUnavailable(v) || objectShape(v, { kind: x => x === "confirmed" })
      || objectShape(v, { kind: x => x === "refused", reason: oneOf("private", "sync-full", "update-needed", "invalid", "unavailable", "unconfirmed") }), timeoutMs: 12_000 },
  "ui.removeKeptFilters": { payload: (v): v is PageMessages["ui.removeKeptFilters"]["payload"] => objectShape(v, {}, windowClaim),
    result: (v): v is UiKeptFilters => isUiUnavailable(v) || objectShape(v, { kind: x => x === "removed", filters: natural }) || refusal("private", "unavailable", "unconfirmed")(v), timeoutMs: 30_000 },
  "ui.diagnostics": { payload: (v): v is PageMessages["ui.diagnostics"]["payload"] => objectShape(v, { check: bool }, windowClaim), result: isUiDiagnostics, timeoutMs: 45_000 },
  "ui.withdraw": { payload: (v): v is PageMessages["ui.withdraw"]["payload"] => objectShape(v, { expected: x => objectShape(x, { v: natural, at: natural }) }, windowClaim),
    result: (v): v is UiWithdrawal => isUiUnavailable(v) || objectShape(v, { kind: x => x === "withdrawn" }) || refusal("not-agreed", "failed", "unconfirmed", "unavailable")(v), timeoutMs: 30_000 },
  "ui.removeSetup": { payload: (v): v is PageMessages["ui.removeSetup"]["payload"] => objectShape(v, { action: x => x === "prepare", acct: isAccountKey }, windowClaim)
      || objectShape(v, { action: x => x === "confirm", token }, windowClaim),
    result: (v): v is UiRemoval => isUiUnavailable(v) || objectShape(v, { kind: x => x === "confirm", token, scope: oneOf("this-browser", "syncing-browsers") })
      || objectShape(v, { kind: oneOf("removed", "unchanged") }) || refusal("failed", "unconfirmed", "unavailable", "private", "sync-full", "update-needed", "invalid")(v), timeoutMs: 30_000 },
  "ui.exportSettings": { payload: (v): v is PageMessages["ui.exportSettings"]["payload"] => objectShape(v, {}, windowClaim),
    result: (v): v is UiExport => isUiUnavailable(v) || objectShape(v, { kind: x => x === "refused" })
      || objectShape(v, { kind: x => x === "file", filename: text, text: x => typeof x === "string" && x.length <= 4_000_000 }), timeoutMs: 20_000 },
  "ui.importSettings": { payload: (v): v is PageMessages["ui.importSettings"]["payload"] => objectShape(v, { action: x => x === "prepare", text: x => typeof x === "string" && x.length <= 4_000_000 }, windowClaim)
      || objectShape(v, { action: x => x === "confirm", token }, windowClaim),
    result: (v): v is UiImport => isUiUnavailable(v) || objectShape(v, { kind: x => x === "confirm", token, accounts: natural }) || objectShape(v, { kind: x => x === "imported" })
      || refusal("private", "newer-format", "invalid-file", "failed", "unavailable")(v), timeoutMs: 60_000 },
  "ui.noteSeen": { payload: (v): v is PageMessages["ui.noteSeen"]["payload"] => objectShape(v, {}, windowClaim),
    result: (v): v is PageMessages["ui.noteSeen"]["result"] => objectShape(v, { kind: oneOf("noted", "unavailable") }), timeoutMs: 8_000 },
  "ui.noteAgree": { payload: (v): v is PageMessages["ui.noteAgree"]["payload"] => objectShape(v, { change: isNoteAgreeChange }, windowClaim),
    result: isAgreementAnswer, timeoutMs: 60_000 },
  "ui.claimSeen": { payload: (v): v is PageMessages["ui.claimSeen"]["payload"] => objectShape(v, { acct: isAccountKey }, windowClaim),
    result: (v): v is PageMessages["ui.claimSeen"]["result"] => objectShape(v, { kind: oneOf("noted", "unavailable") }), timeoutMs: 8_000 },
  "ui.pausedWork": { payload: (v): v is PageMessages["ui.pausedWork"]["payload"] => objectShape(v, { action: x => x === "read" }, windowClaim)
      || objectShape(v, { action: x => x === "continue", id: token }, windowClaim),
    result: (v): v is UiPausedWork => objectShape(v, { kind: oneOf("work", "continued"), jobs: list(job => objectShape(job, { id: token,
      job: oneOf("migration", "removal", "sync", "settings", "import"), acct: a => a === null || isAccountKey(a) }), 50) })
      || refusal("failed", "unconfirmed", "unavailable", "private")(v), timeoutMs: 60_000 },
  "ui.discardUnclaimed": { payload: (v): v is PageMessages["ui.discardUnclaimed"]["payload"] => objectShape(v, {}, windowClaim),
    result: (v): v is UiDiscard => objectShape(v, { kind: oneOf("discarded", "absent") }) || refusal("private", "failed", "unavailable")(v), timeoutMs: 12_000 }
}
export function isPageCall(kind: string): kind is PageCall {
  return Object.hasOwn(pageContract, kind)
}
