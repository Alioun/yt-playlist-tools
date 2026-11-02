import { objectShape } from "./object-shape"
import { isFeatureId, isSite, type FeatureId, type Privacy, type Site } from "./vocabulary"
import { isUiUnavailable, type UiUnavailable } from "./ui-playlists"
import { isAccountKey, isPlaylistId, isVideoId, type AccountKey, type PlaylistId, type VideoId } from "../model/validation"
import { isKey } from "../model/keys"
import type { Key } from "../model/types"
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

export type PageMessages = {
  readonly "ui.status": { readonly payload: WindowClaim; readonly result: UiStatus }
  readonly "ui.pause": { readonly payload: WindowClaim & { readonly paused: boolean }; readonly result: UiPauseAnswer }
  readonly "ui.recentAdds": { readonly payload: WindowClaim & { readonly acct: AccountKey }; readonly result: UiRecentAdds }
  readonly "ui.device": { readonly payload: WindowClaim & { readonly change: DeviceSettingChange }; readonly result: DeviceSettingAnswer | UiUnavailable }
}
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
export function isDeviceSettingAnswer(value: unknown): value is DeviceSettingAnswer {
  return objectShape(value, { kind: v => v === "confirmed", change: isDeviceSettingChange })
    || objectShape(value, { kind: v => v === "refused", reason: oneOf("private", "invalid", "unavailable", "unconfirmed") })
}

export const pageContract: RpcContract<PageMessages> = {
  "ui.status": { payload: (v): v is PageMessages["ui.status"]["payload"] => objectShape(v, {}, windowClaim), result: isUiStatus, timeoutMs: 8_000 },
  "ui.pause": { payload: (v): v is PageMessages["ui.pause"]["payload"] => objectShape(v, { paused: bool }, windowClaim),
    result: (v): v is UiPauseAnswer => isUiUnavailable(v) || objectShape(v, { kind: x => x === "paused", paused: bool })
      || objectShape(v, { kind: x => x === "refused", reason: oneOf("unavailable", "unconfirmed") }), timeoutMs: 8_000 },
  "ui.recentAdds": { payload: (v): v is PageMessages["ui.recentAdds"]["payload"] => objectShape(v, { acct: isAccountKey }, windowClaim),
    result: (v): v is UiRecentAdds => isUiUnavailable(v) || objectShape(v, { kind: x => x === "recent", entries: list(isRecentEntry, 50) }), timeoutMs: 8_000 },
  "ui.device": { payload: (v): v is PageMessages["ui.device"]["payload"] => objectShape(v, { change: isDeviceSettingChange }, windowClaim),
    result: (v): v is DeviceSettingAnswer | UiUnavailable => isUiUnavailable(v) || isDeviceSettingAnswer(v), timeoutMs: 8_000 }
}
export function isPageCall(kind: string): kind is PageCall {
  return Object.hasOwn(pageContract, kind)
}
