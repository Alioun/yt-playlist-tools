import { isAccountKey, isChannelId, isPlaylistId, isVideoId, type AccountKey, type ChannelId, type PlaylistId, type VideoId } from "../model/validation"
import { objectShape } from "./object-shape"
import type { RpcContract } from "../rpc/rpc"

/**
 * YT-AA-38's one state per playback, which the watch-page button, its menu and the popup's This video show.
 * Percentages are whole numbers. An ad changes nothing, because the tracker keeps its counts while one plays.
 */
export type AutoAddState =
  | { readonly kind: "not-tracked" | "paused" | "live" | "cant-measure" | "skipped" }
  | { readonly kind: "counting"; readonly goal: number; readonly watched: number | null }
  | { readonly kind: "partly"; readonly added: readonly string[]; readonly pending: readonly string[]; readonly goal: number }
  | { readonly kind: "added" | "already-in"; readonly playlists: readonly string[] }
  | { readonly kind: "failed"; readonly playlists: readonly string[]; readonly offline: boolean }
/** One auto-add playlist that takes this video: its goal and what happened (UI-POP-13, UI-POP-14, UI-YT-22). */
export type PlaylistProgress = {
  readonly pl: PlaylistId
  readonly pct: number
  readonly outcome: "waiting" | "added" | "already-in" | "filtered" | "failed" | "skipped"
}
export type VideoChannel = { readonly id: ChannelId; readonly title: string; readonly handle: string | null }
/** What auto-add knows about the video playing in a YouTube tab. `channel` is read when the popup or the menu asks. */
export type ThisVideo = {
  readonly video: VideoId
  readonly title: string | null
  readonly state: AutoAddState
  readonly watched: number | null
  readonly playlists: readonly PlaylistProgress[]
  readonly channel: VideoChannel | null
}
/** The popup's This video (UI-POP-12): the active YouTube tab's video, as that tab's account (UI-POP-08). */
export type ThisTab = { readonly kind: "video"; readonly tabId: number; readonly acct: AccountKey; readonly video: ThisVideo } | { readonly kind: "none" | "unavailable" }
/** Don't auto-add this video, and its Undo, for the tab's own account (UI-POP-14, R23). */
export type ThisVideoSkip = { readonly tabId: number; readonly acct: AccountKey; readonly video: VideoId; readonly skip: boolean }
export type ThisVideoSkipAnswer = { readonly kind: "skipped" | "unskipped" } | { readonly kind: "refused"; readonly reason: "account-changed" | "unavailable" }

type WindowClaim = { readonly windowId?: number }
export type ThisVideoMessages = {
  readonly "ui.thisTab": { readonly payload: WindowClaim; readonly result: ThisTab }
  readonly "ui.skip": { readonly payload: WindowClaim & ThisVideoSkip; readonly result: ThisVideoSkipAnswer }
}

const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const percent = (value: unknown): value is number => natural(value) && value <= 100
const oneOf =
  (...values: readonly string[]) =>
  (value: unknown) =>
    typeof value === "string" && values.includes(value)
const ids = (value: unknown) => Array.isArray(value) && value.length <= 200 && value.every(isPlaylistId)
const text = (max: number) => (value: unknown) => typeof value === "string" && value.length <= max
export function isAutoAddState(value: unknown): value is AutoAddState {
  return (
    objectShape(value, { kind: oneOf("not-tracked", "paused", "live", "cant-measure", "skipped") }) ||
    objectShape(value, { kind: oneOf("counting"), goal: percent, watched: v => v === null || percent(v) }) ||
    objectShape(value, { kind: oneOf("partly"), added: ids, pending: ids, goal: percent }) ||
    objectShape(value, { kind: oneOf("added", "already-in"), playlists: ids }) ||
    objectShape(value, { kind: oneOf("failed"), playlists: ids, offline: v => typeof v === "boolean" })
  )
}
export function isThisVideo(value: unknown): value is ThisVideo {
  return objectShape(value, {
    video: isVideoId,
    title: v => v === null || text(500)(v),
    state: isAutoAddState,
    watched: v => v === null || percent(v),
    playlists: v =>
      Array.isArray(v) && v.length <= 200 && v.every(row => objectShape(row, { pl: isPlaylistId, pct: percent, outcome: oneOf("waiting", "added", "already-in", "filtered", "failed", "skipped") })),
    channel: v => v === null || objectShape(v, { id: isChannelId, title: text(200), handle: h => h === null || text(100)(h) })
  })
}
export function isThisTab(value: unknown): value is ThisTab {
  return objectShape(value, { kind: oneOf("video"), tabId: natural, acct: isAccountKey, video: isThisVideo }) || objectShape(value, { kind: oneOf("none", "unavailable") })
}
export const thisVideoContract: RpcContract<ThisVideoMessages> = {
  "ui.thisTab": {
    payload: (value): value is ThisVideoMessages["ui.thisTab"]["payload"] => objectShape(value, {}, { windowId: natural }),
    result: isThisTab,
    // An answer waits for the tab's page to read its video and, for the menu's channel rows, the channel.
    timeoutMs: 12_000
  },
  "ui.skip": {
    payload: (value): value is ThisVideoMessages["ui.skip"]["payload"] =>
      objectShape(value, { tabId: natural, acct: isAccountKey, video: isVideoId, skip: v => typeof v === "boolean" }, { windowId: natural }),
    result: (value): value is ThisVideoSkipAnswer =>
      objectShape(value, { kind: oneOf("skipped", "unskipped") }) || objectShape(value, { kind: oneOf("refused"), reason: oneOf("account-changed", "unavailable") }),
    timeoutMs: 8_000
  }
}
