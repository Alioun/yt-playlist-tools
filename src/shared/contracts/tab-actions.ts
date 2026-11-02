import type { ExplicitFailure, Outcome, ToastPlan } from "../rules/outcomes"
import { isAccountKey, isChannelId, isPlaylistId, isShortcutId, isVideoId, type AccountKey, type ChannelId, type PlaylistId, type ShortcutId, type VideoId } from "../model/validation"
import type { RpcContract } from "../rpc/rpc"
import { isDestinationExpectation, isSetupDestination, isDestinationAnswer, type DestinationAnswer, type DestinationExpectation, type SetupDestination } from "./first-run"
import type { PlaylistRow } from "./jobs"
import { objectShape } from "./object-shape"
import { isFeatureId, isPrivacy, isSite, type FeatureId, type Privacy, type Site } from "./vocabulary"

/**
 * What a page asks the background to do for a user action (06 §6.8.2). The background resolves the tab's
 * account from its registry and refuses a request whose `acct` differs (ARC-ACC-49).
 */
export type UndoHandle = { readonly kind: "add" | "gather" | "remove"; readonly id: string }
export type TabAddRequest = { readonly site: Site; readonly video: VideoId } & (
  | { readonly via: "auto-add"; readonly playlists: readonly PlaylistId[]; readonly channel: ChannelId | null }
  | { readonly via: "shortcut"; readonly shortcut: ShortcutId }
  | { readonly via: "quick-save"; readonly opener: FeatureId }
  | { readonly via: "picker" | "choose-quick-save" | "choose-shortcut"; readonly opener: FeatureId; readonly playlist: PlaylistId }
)
export type TabRemoveRequest = {
  readonly site: Site; readonly video: VideoId; readonly playlist: PlaylistId; readonly opener: FeatureId; readonly tick: UndoHandle | null
}
type Ended = { readonly kind: "signed-out" | "no-tab" }
/** The cached titles of the playlists a report names, so the page's toast can name them (YT-ADD-23). */
export type PlaylistTitles = Readonly<Record<PlaylistId, string>>
export type TabAddReport =
  | { readonly kind: "report"; readonly outcomes: Readonly<Record<PlaylistId, Outcome>>; readonly toast: ToastPlan | null; readonly feedback: boolean; readonly undo: UndoHandle | null; readonly titles: PlaylistTitles }
  | { readonly kind: "stopped"; readonly outcomes: Readonly<Record<PlaylistId, Outcome>>; readonly pending: readonly PlaylistId[]; readonly feedback: boolean; readonly toast: null; readonly undo: null; readonly titles: PlaylistTitles }
  | { readonly kind: "choose" }
  | Ended
export type TabRemoveReport =
  | { readonly kind: "removed"; readonly playlist: PlaylistId; readonly video: VideoId; readonly feedback: boolean; readonly toast: ToastPlan | null; readonly undo: UndoHandle | null; readonly titles: PlaylistTitles }
  | { readonly kind: "failed"; readonly failure: ExplicitFailure }
  | { readonly kind: "stopped"; readonly removed: boolean; readonly playlist: PlaylistId; readonly video: VideoId; readonly undo: null }
  | Ended
export type TabUndoReport =
  | { readonly kind: "undone" }
  | { readonly kind: "failed"; readonly completed: number; readonly of: number; readonly failure: ExplicitFailure; readonly toast: ToastPlan | null }
  | { readonly kind: "stopped"; readonly completed: number; readonly of: number }
  | { readonly kind: "expired" }
  | Ended
export type TabListing = { readonly rows: readonly PlaylistRow[]; readonly at: number }
/** `cached` answers a read without YouTube; `listed`, `noTab` and `failed` answer a refresh. */
export type TabPlaylists =
  | { readonly kind: "cached"; readonly listing: TabListing | null }
  | { readonly kind: "listed"; readonly listing: TabListing }
  | { readonly kind: "noTab" | "failed" }
export type TabCreateFailure = "rateLimited" | "publicCap" | "noChannel" | "notAllowed" | "failed"
export type TabCreated = { readonly kind: "created"; readonly id: PlaylistId } | { readonly kind: "failed"; readonly reason: TabCreateFailure }
export type TabDestinationChange = { readonly destination: SetupDestination; readonly expected: DestinationExpectation; readonly playlist: PlaylistId | null }

type Pinned<T> = { readonly acct: AccountKey | null; readonly request: T }
export type TabActionMessages = {
  "tab.add": { payload: Pinned<TabAddRequest>; result: TabAddReport }
  "tab.remove": { payload: Pinned<TabRemoveRequest>; result: TabRemoveReport }
  "tab.undo": { payload: Pinned<UndoHandle>; result: TabUndoReport }
  "tab.release": { payload: { readonly handle: UndoHandle }; result: null }
  "tab.need": { payload: { readonly popovers: true }; result: { readonly kind: "ok" | "failed" } }
  "tab.playlists": { payload: Pinned<{ readonly refresh: boolean }>; result: TabPlaylists }
  "tab.create": { payload: Pinned<{ readonly title: string; readonly privacy: Privacy; readonly video: VideoId | null }>; result: TabCreated }
  "tab.destination": { payload: Pinned<TabDestinationChange>; result: DestinationAnswer }
}
/**
 * Auto-add's routes besides `tab.add`. YT-AA-41: only the first playback per browser session that can't be measured gets a toast.
 * `tab.videoChanged` clears this tab's toolbar tick, sent once when the video it ticked for changes in-app (ARC-MOD-38).
 */
export type TabProgressMessages = {
  "tab.progress.load": { payload: Pinned<{ readonly video: VideoId }>; result: TabProgress | null }
  "tab.progress.save": { payload: Pinned<{ readonly video: VideoId; readonly progress: TabProgress }>; result: null }
  "tab.cantMeasure": { payload: Pinned<null>; result: { readonly show: boolean } }
  "tab.videoChanged": { payload: Pinned<null>; result: null }
}

type Check = (value: unknown) => boolean
const bool: Check = value => typeof value === "boolean"
const count: Check = value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const oneOf = (...values: readonly unknown[]): Check => value => values.includes(value)
const nullable = (check: Check): Check => value => value === null || check(value)
const record = (value: unknown, entry: Check) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.entries(value).every(([key, item]) => isPlaylistId(key) && entry(item))
const playlists: Check = value => Array.isArray(value) && value.length <= 200 && value.every(isPlaylistId)
const kinded: Check = value => value !== null && typeof value === "object" && typeof Reflect.get(value, "kind") === "string"
const plan: Check = value => value !== null && typeof value === "object" && typeof Reflect.get(value, "tone") === "string" && kinded(Reflect.get(value, "message"))
export const TITLE_LIMIT = 1000
const title: Check = value => typeof value === "string" && value.length <= TITLE_LIMIT

export function isUndoHandle(value: unknown): value is UndoHandle {
  return objectShape(value, { kind: oneOf("add", "gather", "remove"), id: v => typeof v === "string" && v.length > 0 && v.length <= 200 })
}
export function isTabAddRequest(value: unknown): value is TabAddRequest {
  const base = { site: isSite, video: isVideoId }
  return objectShape(value, { ...base, via: oneOf("auto-add"), playlists, channel: nullable(isChannelId) })
    || objectShape(value, { ...base, via: oneOf("shortcut"), shortcut: isShortcutId })
    || objectShape(value, { ...base, via: oneOf("quick-save"), opener: isFeatureId })
    || objectShape(value, { ...base, via: oneOf("picker", "choose-quick-save", "choose-shortcut"), opener: isFeatureId, playlist: isPlaylistId })
}
export function isTabRemoveRequest(value: unknown): value is TabRemoveRequest {
  return objectShape(value, { site: isSite, video: isVideoId, playlist: isPlaylistId, opener: isFeatureId, tick: nullable(isUndoHandle) })
}
function pinned(request: Check): Check {
  return value => objectShape(value, { acct: nullable(isAccountKey), request })
}
const undo = nullable(isUndoHandle)
const titles: Check = value => record(value, item => typeof item === "string")
export function isTabAddReport(value: unknown): value is TabAddReport {
  return objectShape(value, { kind: oneOf("report"), outcomes: v => record(v, kinded), toast: nullable(plan), feedback: bool, undo, titles })
    || objectShape(value, { kind: oneOf("stopped"), outcomes: v => record(v, kinded), pending: playlists, feedback: bool, toast: v => v === null, undo: v => v === null, titles })
    || objectShape(value, { kind: oneOf("choose", "signed-out", "no-tab") })
}
export function isTabRemoveReport(value: unknown): value is TabRemoveReport {
  return objectShape(value, { kind: oneOf("removed"), playlist: isPlaylistId, video: isVideoId, feedback: bool, toast: nullable(plan), undo, titles })
    || objectShape(value, { kind: oneOf("failed"), failure: v => typeof v === "string" })
    || objectShape(value, { kind: oneOf("stopped"), removed: bool, playlist: isPlaylistId, video: isVideoId, undo: v => v === null })
    || objectShape(value, { kind: oneOf("signed-out", "no-tab") })
}
export function isTabUndoReport(value: unknown): value is TabUndoReport {
  return objectShape(value, { kind: oneOf("failed"), completed: count, of: count, failure: v => typeof v === "string", toast: nullable(plan) })
    || objectShape(value, { kind: oneOf("stopped"), completed: count, of: count })
    || objectShape(value, { kind: oneOf("undone", "expired", "signed-out", "no-tab") })
}
function isRow(value: unknown): value is PlaylistRow {
  return objectShape(value, { id: isPlaylistId, title: v => typeof v === "string" }, { privacy: isPrivacy, count, thumb: v => typeof v === "string" })
}
function isListing(value: unknown): value is TabListing {
  return objectShape(value, { rows: v => Array.isArray(v) && v.every(isRow), at: count })
}
export function isTabPlaylists(value: unknown): value is TabPlaylists {
  return objectShape(value, { kind: oneOf("cached"), listing: nullable(isListing) })
    || objectShape(value, { kind: oneOf("listed"), listing: isListing })
    || objectShape(value, { kind: oneOf("noTab", "failed") })
}
export function isTabCreated(value: unknown): value is TabCreated {
  return objectShape(value, { kind: oneOf("created"), id: isPlaylistId })
    || objectShape(value, { kind: oneOf("failed"), reason: oneOf("rateLimited", "publicCap", "noChannel", "notAllowed", "failed") })
}

const title: Check = value => typeof value === "string" && value.length <= 1000
export const tabActionContract: RpcContract<TabActionMessages> = {
  "tab.add": { payload: (v): v is TabActionMessages["tab.add"]["payload"] => pinned(isTabAddRequest)(v), result: isTabAddReport, timeoutMs: 60_000 },
  "tab.remove": { payload: (v): v is TabActionMessages["tab.remove"]["payload"] => pinned(isTabRemoveRequest)(v), result: isTabRemoveReport, timeoutMs: 60_000 },
  "tab.undo": { payload: (v): v is TabActionMessages["tab.undo"]["payload"] => pinned(isUndoHandle)(v), result: isTabUndoReport, timeoutMs: 60_000 },
  "tab.release": { payload: (v): v is TabActionMessages["tab.release"]["payload"] => objectShape(v, { handle: isUndoHandle }), result: (v): v is null => v === null, timeoutMs: 2_000 },
  "tab.need": { payload: (v): v is TabActionMessages["tab.need"]["payload"] => objectShape(v, { popovers: v => v === true }),
    result: (v): v is TabActionMessages["tab.need"]["result"] => objectShape(v, { kind: oneOf("ok", "failed") }), timeoutMs: 5_000 },
  "tab.playlists": { payload: (v): v is TabActionMessages["tab.playlists"]["payload"] => pinned(r => objectShape(r, { refresh: bool }))(v), result: isTabPlaylists, timeoutMs: 45_000 },
  "tab.create": { payload: (v): v is TabActionMessages["tab.create"]["payload"] => pinned(r => objectShape(r, { title, privacy: isPrivacy, video: nullable(isVideoId) }))(v),
    result: isTabCreated, timeoutMs: 45_000 },
  "tab.destination": { payload: (v): v is TabActionMessages["tab.destination"]["payload"] => pinned(r => objectShape(r, {
    destination: isSetupDestination, expected: isDestinationExpectation, playlist: nullable(isPlaylistId) }))(v), result: isDestinationAnswer, timeoutMs: 15_000 }
}

const position = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0
const part: Check = value => Array.isArray(value) && value.length === 2 && position(value[0]) && position(value[1]) && value[1] > value[0]
export function isTabProgress(value: unknown): value is TabProgress {
  return objectShape(value, { len: v => typeof v === "number" && Number.isFinite(v) && v > 0, parts: v => Array.isArray(v) && v.length <= 1_000 && v.every(part) })
}
export const tabProgressContract: RpcContract<TabProgressMessages> = {
  "tab.progress.load": { payload: (v): v is TabProgressMessages["tab.progress.load"]["payload"] => pinned(r => objectShape(r, { video: isVideoId }))(v),
    result: (v): v is TabProgress | null => v === null || isTabProgress(v), timeoutMs: 5_000 },
  "tab.progress.save": { payload: (v): v is TabProgressMessages["tab.progress.save"]["payload"] => pinned(r => objectShape(r, { video: isVideoId, progress: isTabProgress }))(v),
    result: (v): v is null => v === null, timeoutMs: 5_000 },
  "tab.cantMeasure": { payload: (v): v is TabProgressMessages["tab.cantMeasure"]["payload"] => pinned(r => r === null)(v),
    result: (v): v is { readonly show: boolean } => objectShape(v, { show: bool }), timeoutMs: 5_000 },
  "tab.videoChanged": { payload: (v): v is TabProgressMessages["tab.videoChanged"]["payload"] => pinned(r => r === null)(v),
    result: (v): v is null => v === null, timeoutMs: 5_000 }
}

/**
 * What the background asks of a tab it acted in for keys from any tab and the browser's menu (YT-ANY-06,
 * YT-BM-04): show an add's answer as that tab's toast, or open the picker there.
 */
export type TabAskMessages = {
  "bg.toast": { payload: { readonly answer: TabAddReport; readonly video: VideoId; readonly title: string | null; readonly opener: FeatureId }; result: null }
  "bg.picker": { payload: { readonly video: VideoId; readonly title: string | null; readonly choose: boolean; readonly opener: FeatureId }; result: { readonly kind: "opened" | "failed" } }
  /** A YouTube Music key from any tab: save or like the playing song here, as its Save or Like key would (YM-ANY-2, YM-ANY-3). */
  "bg.music": { payload: { readonly action: "save" | "like"; readonly feedback: boolean }; result: MusicAskAnswer }
}
/** `done` is the ✓ and `failed` the ✕ on the toolbar icon; `text` is the answer's tooltip (YM-ANY-4). */
export type MusicAskAnswer = { readonly kind: "done" | "failed"; readonly text: string | null }
export const tabAskContract: RpcContract<TabAskMessages> = {
  "bg.toast": { payload: (v): v is TabAskMessages["bg.toast"]["payload"] => objectShape(v, { answer: isTabAddReport, video: isVideoId, title: nullable(title), opener: isFeatureId }),
    result: (v): v is null => v === null, timeoutMs: 2_000 },
  "bg.picker": { payload: (v): v is TabAskMessages["bg.picker"]["payload"] => objectShape(v, { video: isVideoId, title: nullable(title), choose: bool, opener: isFeatureId }),
    result: (v): v is TabAskMessages["bg.picker"]["result"] => objectShape(v, { kind: oneOf("opened", "failed") }), timeoutMs: 8_000 },
  "bg.music": { payload: (v): v is TabAskMessages["bg.music"]["payload"] => objectShape(v, { action: oneOf("save", "like"), feedback: bool }),
    result: (v): v is MusicAskAnswer => objectShape(v, { kind: oneOf("done", "failed"), text: nullable(title) }), timeoutMs: 30_000 }
}
