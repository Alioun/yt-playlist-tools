import { isAccountKey, isChannelId, isPlaylistId, isShortcutId, isVideoId, type AccountKey, type ChannelId, type PlaylistId, type ShortcutId, type VideoId } from "../model/validation"
import { isOutcome, isToastPlan, type Outcome, type ToastPlan } from "../rules/outcomes"
import { isJsonValue } from "./json"
import { objectShape } from "./object-shape"
import { isFeatureId, isSite, type FeatureId, type Site } from "./vocabulary"

/** What a page asks the add flow for (06 §6.8.2 `tab.add`). The background checks `acct` against its tab registry (ARC-ACC-49). */
export type TabAddRequest = { readonly site: Site; readonly video: VideoId } & (
  | { readonly via: "auto-add"; readonly playlists: readonly PlaylistId[]; readonly channel: ChannelId | null }
  | { readonly via: "shortcut"; readonly shortcut: ShortcutId }
  | { readonly via: "quick-save"; readonly opener: FeatureId }
  | { readonly via: "picker" | "choose-quick-save" | "choose-shortcut"; readonly opener: FeatureId; readonly playlist: PlaylistId }
)
export type TabAdd = { readonly acct: AccountKey; readonly request: TabAddRequest; readonly title?: string }
export type TabUndoHandle = { readonly kind: "add" | "gather" | "remove"; readonly id: string }
type Outcomes = Readonly<Partial<Record<PlaylistId, Outcome>>>
/** The add flow's report, with the titles of the playlists it names so the page can word the toast. */
export type TabAddReport =
  | { readonly kind: "report"; readonly outcomes: Outcomes; readonly toast: ToastPlan | null; readonly feedback: boolean
      readonly undo: TabUndoHandle | null; readonly titles: Readonly<Partial<Record<PlaylistId, string>>> }
  | { readonly kind: "stopped"; readonly outcomes: Outcomes; readonly pending: readonly PlaylistId[]; readonly feedback: boolean; readonly toast: null; readonly undo: null }
  | { readonly kind: "choose" | "signed-out" | "no-tab" }
/** Watch progress at DATA-27's checkpoints. A private tab keeps its own and never sends these (DATA-28). */
export type TabProgress = { readonly len: number; readonly parts: readonly (readonly [number, number])[] }
export type TabProgressLoad = { readonly acct: AccountKey; readonly video: VideoId }
export type TabProgressSave = TabProgressLoad & TabProgress

export type TabAddMessages = {
  "tab.add": { payload: TabAdd; result: TabAddReport }
  "tab.progress.load": { payload: TabProgressLoad; result: TabProgress | null }
  "tab.progress.save": { payload: TabProgressSave; result: null }
  /** YT-AA-41: only the first playback per browser session that can't be measured gets a toast. */
  "tab.cantMeasure": { payload: { readonly acct: AccountKey }; result: { readonly show: boolean } }
}

type Check = (value: unknown) => boolean
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check)
const record = (key: Check, entry: Check): Check => value => value !== null && typeof value === "object" && !Array.isArray(value) &&
  isJsonValue(value) && Object.entries(value).every(([name, field]) => key(name) && entry(field))
const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0
const part: Check = value => Array.isArray(value) && value.length === 2 && nonnegative(value[0]) && nonnegative(value[1]) && value[1] > value[0]

export function isTabAddRequest(value: unknown): value is TabAddRequest {
  const base = { site: isSite, video: isVideoId }
  return objectShape(value, { ...base, via: v => v === "auto-add", playlists: list(isPlaylistId), channel: v => v === null || isChannelId(v) }) ||
    objectShape(value, { ...base, via: v => v === "shortcut", shortcut: isShortcutId }) ||
    objectShape(value, { ...base, via: v => v === "quick-save", opener: isFeatureId }) ||
    objectShape(value, { ...base, via: v => v === "picker" || v === "choose-quick-save" || v === "choose-shortcut", opener: isFeatureId, playlist: isPlaylistId })
}
export function isTabUndoHandle(value: unknown): value is TabUndoHandle {
  return objectShape(value, { kind: v => v === "add" || v === "gather" || v === "remove", id: v => typeof v === "string" && v.length > 0 })
}
export function isTabAddReport(value: unknown): value is TabAddReport {
  const outcomes = record(isPlaylistId, isOutcome)
  return objectShape(value, { kind: v => v === "report", outcomes, toast: v => v === null || isToastPlan(v), feedback: v => typeof v === "boolean",
    undo: v => v === null || isTabUndoHandle(v), titles: record(isPlaylistId, v => typeof v === "string") }) ||
    objectShape(value, { kind: v => v === "stopped", outcomes, pending: list(isPlaylistId), feedback: v => typeof v === "boolean", toast: v => v === null, undo: v => v === null }) ||
    objectShape(value, { kind: v => v === "choose" || v === "signed-out" || v === "no-tab" })
}
export function isTabProgress(value: unknown): value is TabProgress {
  return objectShape(value, { len: v => typeof v === "number" && Number.isFinite(v) && v > 0, parts: v => Array.isArray(v) && v.length <= 1_000 && v.every(part) })
}

export function tabAddMessages() {
  const load = { acct: isAccountKey, video: isVideoId }
  return {
    "tab.add": {
      payload: (v: unknown): v is TabAdd => objectShape(v, { acct: isAccountKey, request: isTabAddRequest }, { title: t => typeof t === "string" }),
      result: isTabAddReport, timeoutMs: 60_000
    },
    "tab.progress.load": {
      payload: (v: unknown): v is TabProgressLoad => objectShape(v, load),
      result: (v: unknown): v is TabProgress | null => v === null || isTabProgress(v), timeoutMs: 5_000
    },
    "tab.progress.save": {
      payload: (v: unknown): v is TabProgressSave => objectShape(v, { ...load, len: v => typeof v === "number" && Number.isFinite(v) && v > 0,
        parts: v => Array.isArray(v) && v.length <= 1_000 && v.every(part) }),
      result: (v: unknown): v is null => v === null, timeoutMs: 5_000
    },
    "tab.cantMeasure": {
      payload: (v: unknown): v is { readonly acct: AccountKey } => objectShape(v, { acct: isAccountKey }),
      result: (v: unknown): v is { readonly show: boolean } => objectShape(v, { show: s => typeof s === "boolean" }), timeoutMs: 5_000
    }
  }
}
