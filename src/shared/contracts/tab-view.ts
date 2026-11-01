import type { Filter, Key, MusicAction, Settings, Setup } from "../model/types"
import type { Snapshot } from "../model/settings-view"
import { isKey } from "../model/keys"
import { isAccountKey, isChannelId, isPercent, isPlaylistId, isShortcutId, isVideoId, type PlaylistId, type VideoId } from "../model/validation"
import { anchors, features, type AnchorId } from "../features/registry"
import { objectShape } from "./object-shape"
import { supportsJob, type AccountData } from "./jobs"
import type { TabPing } from "./tabs"
import { isBreakageKind, isBuildId, isJobId, isSite, type BreakageKind, type JobId, type Site } from "./vocabulary"

type FeatureOptions = {
  "auto-add": Settings["autoAdd"]
  shortcuts: Settings["shortcuts"]
  "quick-save": Settings["quickSave"]
  "queue-button": Settings["queueButton"]
  "watch-button": Settings["watchButton"]
  "card-menu": Settings["cardMenu"]
  gather: Settings["gather"]
  "music-actions": Settings["musicActions"]
  "music-keys": Settings["musicKeys"]
}
export type PageFeatureId = keyof FeatureOptions
export type TabFeature<Id extends PageFeatureId = PageFeatureId> = {
  [K in Id]: { readonly id: K; readonly options: Snapshot<FeatureOptions[K]> & { readonly on: true } }
}[Id]
export type WwwFeature = TabFeature<Exclude<PageFeatureId, "music-actions" | "music-keys">>
export type MusicFeature = TabFeature<"shortcuts" | "music-actions" | "music-keys">
export type FeatureStatus = {
  readonly feature: PageFeatureId
  readonly state: "working" | "partly-working" | "not-working"
  readonly jobs: readonly JobId[]
  readonly anchors: readonly AnchorId[]
  readonly actions: readonly MusicAction[]
  readonly kinds: readonly BreakageKind[]
}
export type DueNotice = { readonly kind: "not-working"; readonly features: readonly PageFeatureId[] }
export type TabSkip = readonly [video: VideoId, playlists: "all" | readonly PlaylistId[]]
export type TabFilter = { readonly playlist: PlaylistId; readonly state: { readonly kind: "value" | "default"; readonly filter: Snapshot<Filter> } }
export type TabSetup = { readonly kind: "none" } | { readonly kind: "live"; readonly setup: Snapshot<Setup> }
type ViewSite = { readonly site: "www"; readonly features: readonly WwwFeature[] } |
  { readonly site: "music"; readonly features: readonly MusicFeature[] }
type ViewAccount =
  | { readonly signedIn: false; readonly acct: null; readonly setup: null; readonly filters: readonly []; readonly skips: null; readonly private: boolean }
  | (Extract<AccountData, { signedIn: true }> & { readonly setup: TabSetup; readonly filters: readonly TabFilter[] } & (
    | { readonly private: false; readonly skips: { readonly kind: "normal"; readonly entries: readonly TabSkip[] } }
    | { readonly private: true; readonly skips: { readonly kind: "private"; readonly entries: readonly TabSkip[] } }
  ))
export type TabView = ViewSite & ViewAccount & {
  readonly build: TabPing["build"]
  readonly undoKey: Snapshot<Key> | null
  readonly pickerSortAZ: boolean
  readonly paused: boolean
  readonly statuses: readonly FeatureStatus[]
  readonly notices: readonly DueNotice[]
}
export type TabViewFacts = TabPing & { readonly tabId: number; readonly windowId: number; readonly private: boolean }

type Check = (value: unknown) => boolean
const bool: Check = value => typeof value === "boolean"
const text: Check = value => typeof value === "string"
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check)
const unique = (value: readonly unknown[]) => new Set(value).size === value.length
const oneOf = (...values: readonly unknown[]): Check => value => values.includes(value)
function dictionary(value: unknown, key: Check, entry: Check): boolean {
  return objectShape(value, {}, Object.fromEntries(value !== null && typeof value === "object"
    ? Object.keys(value).filter(key).map(name => [name, entry]) : []))
}
export function isTabKey(value: unknown): value is Key | null {
  return value === null || isKey(value) && objectShape(value,
    { code: text, ctrl: bool, alt: bool, shift: bool, meta: bool }, { char: text })
}
const shortcut: Check = value => objectShape(value, {
  id: isShortcutId, key: isTabKey, label: text, watchLaterOnEveryAccount: bool
})
const musicKeys = { next: isTabKey, queue: isTabKey, save: isTabKey, picker: isTabKey, like: isTabKey,
  remove: isTabKey, library: isTabKey, mix: isTabKey, album: isTabKey, artist: isTabKey }
const musicButtons = { next: bool, queue: bool, save: bool, like: bool, remove: bool, bar: bool,
  library: bool, mix: bool, album: bool, artist: bool }
const optionChecks = {
  "auto-add": (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool, pct: isPercent, toolbarTick: bool, toolbarPaused: bool }),
  shortcuts: (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool, music: bool, preset: bool, picker: isTabKey,
    list: rows => Array.isArray(rows) && rows.length <= 20 && rows.every(shortcut) && unique(rows.map(row => row.id)) }),
  "quick-save": (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool, shortsShelves: bool }),
  "queue-button": (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool }),
  "watch-button": (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool, shorts: bool }),
  "card-menu": (v: unknown) => objectShape(v, { on: v => v === true, keepLinkMenu: bool }),
  gather: (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool, to: oneOf("player", "queue", "playlist"),
    order: oneOf("newest", "oldest", "english", "non-english", "left-to-right", "right-to-left", "shuffled"), close: bool,
    auto: v => objectShape(v, { unvisited: bool, after: oneOf("1h", "1d", "1w"), background: bool, count: bool, n: oneOf(5, 10, 15, 20, 30, 50) }) }),
  "music-actions": (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool, preset: bool, buttons: v => objectShape(v, musicButtons) }),
  "music-keys": (v: unknown) => objectShape(v, { on: v => v === true, feedback: bool, preset: bool, keys: v => objectShape(v, musicKeys) })
} satisfies Record<PageFeatureId, Check>
export function isPageFeatureId(value: unknown): value is PageFeatureId {
  return typeof value === "string" && Object.hasOwn(optionChecks, value)
}
export function isTabFeature(value: unknown): value is TabFeature {
  return objectShape(value, { id: isPageFeatureId, options: v => v !== null && typeof v === "object" }) &&
    isPageFeatureId(value.id) && optionChecks[value.id](value.options)
}
export function isTabFeatureFor(site: Site, value: unknown): value is TabFeature {
  if (!isTabFeature(value) || !features.find(feature => feature.id === value.id)?.pages[site]) return false
  if (site === "music" && value.id === "shortcuts" && !value.options.music) return false
  return value.id !== "gather" || value.options.auto.background || value.options.auto.count
}
export function isTabSetup(value: unknown): value is TabSetup {
  return objectShape(value, { kind: v => v === "none" }) || objectShape(value, { kind: v => v === "live", setup: v => objectShape(v, {
    label: v => v === null || objectShape(v, { name: text }, { handle: text, avatar: text }),
    autoAdd: list(v => objectShape(v, { pl: isPlaylistId, takes: oneOf("videos", "shorts", "both") }, { pct: isPercent })),
    targets: v => dictionary(v, isShortcutId, isPlaylistId), quickSave: v => v === null || isPlaylistId(v),
    musicSave: v => v === null || isPlaylistId(v), gather: v => v === null || isPlaylistId(v),
    marks: v => dictionary(v, isPlaylistId, oneOf("missing", "full"))
  }) })
}
export function isTabFilter(value: unknown): value is TabFilter {
  const filter: Check = v => objectShape(v, { mode: oneOf("allow", "deny"), on: bool,
    channels: list(row => Array.isArray(row) && (row.length === 2 || row.length === 3) && isChannelId(row[0]) && text(row[1]) && (row.length === 2 || text(row[2]))) })
  return objectShape(value, { playlist: isPlaylistId, state: v =>
    objectShape(v, { kind: kind => kind === "value", filter }) ||
    objectShape(v, { kind: kind => kind === "default", filter: v => objectShape(v, {
      mode: mode => mode === "deny", on: on => on === false, channels: rows => Array.isArray(rows) && rows.length === 0
    }) }) })
}
export function isTabSkips(value: unknown): value is readonly TabSkip[] {
  return Array.isArray(value) && value.every(row => Array.isArray(row) && row.length === 2 && isVideoId(row[0]) &&
    (row[1] === "all" || Array.isArray(row[1]) && row[1].every(isPlaylistId) && unique(row[1]))) && unique(value.map(row => row[0]))
}
export function isFeatureStatusFor(site: Site, value: unknown): value is FeatureStatus {
  if (!objectShape(value, { feature: isPageFeatureId, state: oneOf("working", "partly-working", "not-working"),
    jobs: list(isJobId), anchors: list(v => typeof v === "string" && Object.hasOwn(anchors, v)),
    actions: list(oneOf("next", "queue", "save", "like", "remove", "library", "mix", "album", "artist")), kinds: list(isBreakageKind) })) return false
  if (!isPageFeatureId(value.feature) || !Array.isArray(value.jobs) || !Array.isArray(value.anchors) || !Array.isArray(value.actions) || !Array.isArray(value.kinds)) return false
  const health = features.find(feature => feature.id === value.feature)?.health[site]
  if (!health) return false
  const jobs = [...health.required, ...health.optional, ...Object.values(health.actions ?? {}).flat()]
  const allowedAnchors: readonly string[] = [...health.anchors, ...health.optionalAnchors ?? []]
  const allowedActions = Object.keys(health.actions ?? {})
  const size = value.jobs.length + value.anchors.length + value.actions.length + value.kinds.length
  return value.jobs.every(job => isJobId(job) && supportsJob(site, job) && jobs.includes(job)) &&
    value.anchors.every(anchor => typeof anchor === "string" && allowedAnchors.includes(anchor)) &&
    value.actions.every(action => typeof action === "string" && allowedActions.includes(action)) &&
    [value.jobs, value.anchors, value.actions, value.kinds].every(unique) && (value.state === "working" ? size === 0 : size > 0)
}
export function isDueNotice(value: unknown): value is DueNotice {
  return objectShape(value, { kind: v => v === "not-working", features: list(isPageFeatureId) }) &&
    Array.isArray(value.features) && value.features.length > 0 && unique(value.features)
}
export function isTabViewFacts(value: unknown): value is TabViewFacts {
  const natural: Check = v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0
  const common = { site: isSite, build: isBuildId, tabId: natural, windowId: natural, private: bool }
  return objectShape(value, { ...common, signedIn: v => v === true, acct: isAccountKey }) ||
    objectShape(value, { ...common, signedIn: v => v === false, acct: v => v === null })
}
export function sameTabViewFacts(left: TabViewFacts, right: TabViewFacts): boolean {
  return left.tabId === right.tabId && left.windowId === right.windowId && left.private === right.private &&
    left.site === right.site && left.build === right.build && left.signedIn === right.signedIn && left.acct === right.acct
}
export function isTabView(value: unknown): value is TabView {
  try {
    const common = { site: isSite, build: isBuildId, private: bool, pickerSortAZ: bool, paused: bool, undoKey: isTabKey,
      features: list(isTabFeature), statuses: list(v => v !== null && typeof v === "object"), notices: list(isDueNotice) }
    if (!(objectShape(value, { ...common, signedIn: v => v === false, acct: v => v === null, setup: v => v === null,
      filters: v => Array.isArray(v) && v.length === 0, skips: v => v === null }) ||
      objectShape(value, { ...common, signedIn: v => v === true, acct: isAccountKey, setup: isTabSetup, filters: list(isTabFilter),
        skips: v => objectShape(v, { kind: oneOf("normal", "private"), entries: isTabSkips }) }))) return false
    if (!isSite(value.site) || !Array.isArray(value.features) || !Array.isArray(value.statuses) || !Array.isArray(value.notices) || !Array.isArray(value.filters)) return false
    const site = value.site, skipKind = value.private ? "private" : "normal"
    const options: unknown[] = value.features, statuses: unknown[] = value.statuses,
      notices: unknown[] = value.notices, filters: unknown[] = value.filters
    if (!filters.every(isTabFilter) || !notices.every(isDueNotice)) return false
    if (!options.every(feature => isTabFeatureFor(site, feature)) || !unique(options.map(feature => feature.id)) ||
      !statuses.every(status => isFeatureStatusFor(site, status)) || !unique(statuses.map(status => status.feature)) ||
      statuses.length !== options.length || !options.every(feature => statuses.some(status => status.feature === feature.id)) ||
      !unique(filters.map(row => row.playlist))) return false
    const due = notices.flatMap(notice => notice.features)
    if (!unique(due) || !due.every(id => statuses.some(status => status.feature === id && status.state === "not-working"))) return false
    return value.signedIn === false || objectShape(value.skips, { kind: v => v === skipKind, entries: isTabSkips })
  } catch { return false }
}
export function isTabViewFor(facts: TabViewFacts, value: unknown): value is TabView {
  return isTabView(value) && value.site === facts.site && value.build === facts.build && value.private === facts.private &&
    value.signedIn === facts.signedIn && value.acct === facts.acct
}
