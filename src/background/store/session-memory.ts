import { isAccountKey, isPlaylistId, isVideoId, type AccountKey, type PlaylistId, type VideoId } from "../../shared/model"
import { isSetVideoId, type SetVideoId } from "../../shared/contracts"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import type { RemovalSessionCollection, RemovalSessionKey } from "./account-removal-session"
import type { AccountRemovalHost } from "./account-removal-execution"
import { isTabId, isTabRecord, parseTabRecords, replaceTab, sameTabRecord, tabRecordsJson, type TabRecord } from "../tabs/records"
import type { DiagnosticVocabulary } from "../../shared/contracts/diagnostics"
import { isMonitorOperation, readMonitorBucket, applyMonitorOperation, monitorJson, isMonitorWriteTime, type MonitorOperation } from "./monitor-session"
import { MONITOR_SIGNALS, MONITOR_WRITE_MS } from "../monitor/thresholds"
import { applyMonitorNotice, noticeClaims, type MonitorNoticeChange } from "./monitor-notice"

export const RECENT_MS = 60_000
export const PAUSE_MS = 60_000
export const GATHERS = 5

// A persisted window counts only while wall time sits inside it. Wall time that moves backwards ends it early, never extends it.
export function live(start: number, length: number, now: number): boolean {
  return start <= now && now < start + length
}

export type RecentTuple = { readonly acct: AccountKey; readonly playlist: PlaylistId; readonly video: VideoId; readonly at: number }
export type Skip = "all" | readonly PlaylistId[]
export type GatherEntry = { readonly video: VideoId; readonly setVideoId: SetVideoId | null }
// What Undo reopens: the closed tab's address, place and title, never its tab ID or any other browser state.
export type GatherClosedTab = { readonly url: string; readonly index: number; readonly title: string }
// A tab a gather is about to close: its identity for the check after the one remove call, and what Undo would reopen.
// It is a plan, never evidence. Only the after-close check turns it into `closed`.
export type GatherClosing = { readonly tabId: number; readonly video: VideoId; readonly tab: GatherClosedTab }
export type GatherUndo = {
  readonly id: string; readonly seq: number; readonly at: number; readonly auto: boolean
  readonly acct: AccountKey; readonly playlist: PlaylistId; readonly added: readonly [GatherEntry, ...GatherEntry[]]
  readonly windowId?: number; readonly closed?: readonly GatherClosedTab[]; readonly closing?: readonly GatherClosing[]
}
// A playlist gather whose every video was already in. Its Undo can only reopen the tabs it closed; it removes no playlist entry.
export type GatherReopen = {
  readonly id: string; readonly seq: number; readonly at: number; readonly auto: boolean
  readonly acct: AccountKey; readonly playlist: PlaylistId; readonly windowId: number
  readonly closed?: readonly GatherClosedTab[]; readonly closing?: readonly GatherClosing[]
}
// A gather into YouTube's player or queue. It has no Undo; it is the window's last result only.
export type GatherSent = {
  readonly id: string; readonly seq: number; readonly at: number; readonly auto: boolean
  readonly to: "player" | "queue"; readonly windowId: number; readonly count: number
}
export type GatherRecord =
  | { readonly to: "playlist"; readonly kind: "undo"; readonly record: GatherUndo }
  | { readonly to: "playlist"; readonly kind: "reopen"; readonly record: GatherReopen }
  | { readonly to: "player" | "queue"; readonly kind: "sent"; readonly record: GatherSent }
// DATA-58's `gather` session record. Newest first, at most GATHERS records across every kind and account.
export type GatherMemory = {
  readonly last: readonly GatherRecord[]
  readonly paced: ReadonlyMap<number, number>
  readonly kept: ReadonlySet<number>
  readonly refused: ReadonlyMap<AccountKey, ReadonlySet<VideoId>>
}
export const emptyGatherMemory: GatherMemory = { last: [], paced: new Map(), kept: new Set(), refused: new Map() }
export const PACED_WINDOWS = 50
export const KEPT_TABS = 200
// DATA-52's entry for one gather, committed in the same change as its DATA-58 record.
export type GatherRecentAdd = {
  readonly at: number; readonly playlist: { readonly id: PlaylistId; readonly title: string }
  readonly videos: readonly [{ readonly id: VideoId; readonly title: string }, ...{ readonly id: VideoId; readonly title: string }[]]
}
export const RECENT_ADDS = 50
export type SessionMemory = {
  readonly tabs: ReadonlyMap<number, TabRecord>
  readonly paused: boolean
  readonly recent: readonly RecentTuple[]
  readonly cooldowns: ReadonlyMap<AccountKey, number>
  readonly skips: ReadonlyMap<AccountKey, ReadonlyMap<VideoId, Skip>>
  readonly shown: { readonly global: ReadonlySet<string>; readonly accounts: ReadonlyMap<AccountKey, ReadonlySet<string>> }
  readonly gathers: readonly GatherUndo[]
  readonly gather: GatherMemory
  readonly breakage: { readonly global: JsonObject; readonly accounts: ReadonlyMap<AccountKey, JsonObject> }
  readonly monitorClaims: ReadonlyMap<string, { readonly token: string; readonly until: number }>
}

export type SessionEdit =
  | { readonly kind: "tab-seen"; readonly tabId: number; readonly info: TabRecord }
  | { readonly kind: "tab-forget"; readonly tabId: number; readonly expected: TabRecord }
  | { readonly kind: "pause"; readonly paused: boolean }
  | { readonly kind: "recent"; readonly tuple: RecentTuple }
  | { readonly kind: "forget"; readonly acct: AccountKey; readonly playlist: PlaylistId; readonly video: VideoId }
  | { readonly kind: "cooldown"; readonly acct: AccountKey; readonly until: number }
  | { readonly kind: "skip"; readonly acct: AccountKey; readonly video: VideoId; readonly playlists: Skip }
  | { readonly kind: "unskip"; readonly acct: AccountKey; readonly video: VideoId }
  | { readonly kind: "shown"; readonly acct: AccountKey; readonly keys: readonly string[] }
  | { readonly kind: "shown-global"; readonly acct: AccountKey | null; readonly scope: "normal"; readonly keys: readonly string[] }
  | { readonly kind: "monitor"; readonly acct: AccountKey | null; readonly scope: "normal"; readonly vocabulary: DiagnosticVocabulary; readonly operations: readonly MonitorOperation[] }
  | ({ readonly kind: "monitor-notice"; readonly acct: AccountKey | null; readonly scope: "normal" } & MonitorNoticeChange)
  | { readonly kind: "gather"; readonly record: Omit<GatherUndo, "seq">; readonly recent?: GatherRecentAdd; readonly refused?: readonly VideoId[] }
  | { readonly kind: "gather-left"; readonly id: string; readonly acct: AccountKey; readonly added: readonly GatherEntry[] }
  | { readonly kind: "gather-reopen"; readonly record: Omit<GatherReopen, "seq">; readonly refused?: readonly VideoId[] }
  | { readonly kind: "gather-sent"; readonly record: Omit<GatherSent, "seq"> }
  // The after-close check: `closed` holds only the planned tabs read back as gone. The plan ends with it.
  | { readonly kind: "gather-closed"; readonly id: string; readonly acct: AccountKey | null; readonly closed: readonly GatherClosedTab[] }
  | { readonly kind: "gather-kept"; readonly add: readonly number[]; readonly remove: readonly number[] }
// `now` prunes recent rows; one change commits in one native set() so a later Gather caller can add its recentAdds entry beside its gather.
// One counter per removed account, rather than a growing removal event log. Reset revokes every account.
export type SessionRevision = { readonly reset: number; readonly accounts: ReadonlyMap<AccountKey, number> }
export const emptySessionRevision: SessionRevision = { reset: 0, accounts: new Map() }
export type SessionChange = { readonly revision: SessionRevision; readonly now: number; readonly edits: readonly [SessionEdit, ...SessionEdit[]] }
export type SessionStorage = Extract<AccountRemovalHost, { kind: "fixture" }>["session"]

export function sessionEditAccount(edit: SessionEdit): AccountKey | null {
  switch (edit.kind) {
    case "tab-seen": return edit.info.acct
    case "tab-forget": return edit.expected.acct
    case "pause": return null
    case "recent": return edit.tuple.acct
    case "gather": return edit.record.acct
    case "gather-reopen": return edit.record.acct
    case "gather-sent":
    case "gather-kept": return null
    default: return edit.acct
  }
}

export function sessionAccountCurrent(captured: SessionRevision, current: SessionRevision, acct: AccountKey | null): boolean {
  return captured.reset === current.reset && (acct === null || (captured.accounts.get(acct) ?? 0) === (current.accounts.get(acct) ?? 0))
}
export type SessionPlan = {
  readonly items: Readonly<Partial<Record<RemovalSessionCollection, JsonValue>>>
  readonly remove: readonly RemovalSessionKey[]
  readonly expected: JsonObject
}

export type SessionUnavailableReason = "consent-held" | "startup" | "newer-layout" | "disposed" | "stale" | "session-host" | "session-layout" | "revision"
export type SessionRead =
  | { readonly kind: "memory"; readonly memory: SessionMemory; readonly revision: SessionRevision; readonly sequence: number }
  | { readonly kind: "unavailable"; readonly reason: SessionUnavailableReason }
export type SessionWrite =
  | { readonly kind: "committed"; readonly memory: SessionMemory; readonly revision: SessionRevision; readonly sequence: number }
  | { readonly kind: "failed"; readonly applied: boolean; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly cause: { readonly kind: "readback" } | { readonly kind: "read-failed"; readonly error: unknown } }
  | { readonly kind: "unavailable"; readonly reason: SessionUnavailableReason }
export type SessionPort = {
  read(): Promise<SessionRead>
  change(change: SessionChange): Promise<SessionWrite>
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
function natural(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 }
function copy(raw: JsonObject): JsonObject {
  const value: unknown = JSON.parse(JSON.stringify(raw))
  if (!object(value)) throw new TypeError("Invalid session snapshot")
  return value
}
const ONCE_PER_ACCOUNT = /^(missing|full):/

function envelope(raw: JsonValue | undefined): { v: 1; global: JsonObject; accounts: JsonObject } & JsonObject | undefined {
  if (raw === undefined) return { v: 1, global: {}, accounts: {} }
  if (!object(raw) || raw.v !== 1 || !object(raw.global) || !object(raw.accounts) ||
    !Object.entries(raw.accounts).every(([acct, bucket]) => isAccountKey(acct) && object(bucket))) return
  return { ...raw, v: 1, global: raw.global, accounts: raw.accounts }
}
function strings(raw: JsonValue | undefined): readonly string[] | undefined {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return
  const found = raw.filter((item): item is string => typeof item === "string")
  return found.length === raw.length ? found : undefined
}
function entry(raw: JsonValue): GatherEntry | undefined {
  if (!object(raw) || !isVideoId(raw.video)) return
  if (raw.setVideoId === null) return { video: raw.video, setVideoId: null }
  if (isSetVideoId(raw.setVideoId)) return { video: raw.video, setVideoId: raw.setVideoId }
}
function closedTab(raw: JsonValue): GatherClosedTab | undefined {
  if (!object(raw) || typeof raw.url !== "string" || !raw.url.startsWith("https://") || !natural(raw.index) || typeof raw.title !== "string") return
  return { url: raw.url, index: raw.index, title: raw.title }
}
function gatherRecord(raw: JsonValue, acct: AccountKey): GatherUndo | undefined {
  if (!object(raw) || typeof raw.id !== "string" || !natural(raw.seq) || !natural(raw.at) || typeof raw.auto !== "boolean" ||
    raw.to !== "playlist" || raw.acct !== acct || !isPlaylistId(raw.playlist) || !Array.isArray(raw.added)) return
  const added = raw.added.map(entry).filter((item): item is GatherEntry => item !== undefined)
  const [first, ...rest] = added
  if (!first || added.length !== raw.added.length || raw.count !== added.length) return
  if (raw.windowId !== undefined && !natural(raw.windowId)) return
  if (raw.closed !== undefined && !Array.isArray(raw.closed)) return
  const closed = raw.closed?.map(closedTab).filter((item): item is GatherClosedTab => item !== undefined)
  if (Array.isArray(raw.closed) && closed?.length !== raw.closed.length) return
  const closing = closingTabs(raw.closing)
  if (closing === null) return
  return { id: raw.id, seq: raw.seq, at: raw.at, auto: raw.auto, acct, playlist: raw.playlist, added: [first, ...rest],
    ...(natural(raw.windowId) ? { windowId: raw.windowId } : {}), ...(closed ? { closed } : {}), ...(closing ? { closing } : {}) }
}
function closingTabs(raw: JsonValue | undefined): readonly GatherClosing[] | undefined | null {
  if (raw === undefined) return
  if (!Array.isArray(raw)) return null
  const rows = raw.flatMap(row => {
    const tab = object(row) ? closedTab(row.tab ?? null) : undefined
    return object(row) && isTabId(row.tabId) && isVideoId(row.video) && tab ? [{ tabId: row.tabId, video: row.video, tab }] : []
  })
  return rows.length === raw.length && new Set(rows.map(row => row.tabId)).size === rows.length ? rows : null
}
function closedTabs(raw: JsonValue | undefined): readonly GatherClosedTab[] | undefined | null {
  if (raw === undefined) return
  if (!Array.isArray(raw)) return null
  const rows = raw.map(closedTab).filter((item): item is GatherClosedTab => item !== undefined)
  return rows.length === raw.length ? rows : null
}
function reopenRecord(raw: JsonValue, acct: AccountKey): GatherReopen | undefined {
  if (!object(raw) || typeof raw.id !== "string" || !natural(raw.seq) || !natural(raw.at) || typeof raw.auto !== "boolean" ||
    raw.to !== "playlist" || raw.acct !== acct || !isPlaylistId(raw.playlist) || !Array.isArray(raw.added) || raw.added.length !== 0 ||
    raw.count !== 0 || !natural(raw.windowId)) return
  const closed = closedTabs(raw.closed), closing = closingTabs(raw.closing)
  if (closed === null || closing === null || !closed?.length && !closing?.length) return
  return { id: raw.id, seq: raw.seq, at: raw.at, auto: raw.auto, acct, playlist: raw.playlist, windowId: raw.windowId,
    ...(closed ? { closed } : {}), ...(closing ? { closing } : {}) }
}
function sentRecord(raw: JsonValue): GatherSent | undefined {
  if (!object(raw) || typeof raw.id !== "string" || !natural(raw.seq) || !natural(raw.at) || typeof raw.auto !== "boolean" ||
    raw.to !== "player" && raw.to !== "queue" || !natural(raw.windowId) || !natural(raw.count) || raw.count === 0 ||
    raw.acct !== undefined || raw.added !== undefined || raw.closed !== undefined || raw.closing !== undefined) return
  return { id: raw.id, seq: raw.seq, at: raw.at, auto: raw.auto, to: raw.to, windowId: raw.windowId, count: raw.count }
}
// `paced`, `kept` and the sent records are not account data. `refused` and playlist records live in their account's bucket, so removal ends them.
function gatherMemory(outer: { global: JsonObject; accounts: JsonObject }): GatherMemory | undefined {
  const last: GatherRecord[] = []
  const global = outer.global
  if (global.last !== undefined) {
    if (!Array.isArray(global.last)) return
    for (const row of global.last) {
      const record = sentRecord(row)
      if (!record) return
      last.push({ to: record.to, kind: "sent", record })
    }
  }
  const paced = new Map<number, number>()
  if (global.paced !== undefined) {
    if (!object(global.paced)) return
    for (const [windowId, at] of Object.entries(global.paced)) {
      const id = Number(windowId)
      if (String(id) !== windowId || !isTabId(id) || !natural(at)) return
      paced.set(id, at)
    }
  }
  const kept = new Set<number>()
  if (global.kept !== undefined) {
    if (!Array.isArray(global.kept) || !global.kept.every(isTabId)) return
    for (const tabId of global.kept) if (isTabId(tabId)) kept.add(tabId)
  }
  const refused = new Map<AccountKey, ReadonlySet<VideoId>>()
  for (const [acct, bucket] of Object.entries(outer.accounts)) {
    if (!object(bucket) || !isAccountKey(acct)) return
    if (bucket.refused !== undefined) {
      if (!Array.isArray(bucket.refused) || !bucket.refused.every(isVideoId)) return
      refused.set(acct, new Set(bucket.refused.filter(isVideoId)))
    }
    if (bucket.last === undefined) continue
    if (!Array.isArray(bucket.last)) return
    for (const row of bucket.last) {
      const undo = gatherRecord(row, acct)
      const reopen = undo ? undefined : reopenRecord(row, acct)
      if (undo) last.push({ to: "playlist", kind: "undo", record: undo })
      else if (reopen) last.push({ to: "playlist", kind: "reopen", record: reopen })
      else return
    }
  }
  last.sort((a, b) => b.record.seq - a.record.seq)
  return { last, paced, kept, refused }
}
function sentJson(record: GatherSent): JsonObject {
  return { id: record.id, seq: record.seq, at: record.at, auto: record.auto, to: record.to, windowId: record.windowId, count: record.count }
}
function closingJson(closing: readonly GatherClosing[]): JsonValue {
  return closing.map(({ tabId, video, tab }) => ({ tabId, video, tab: { url: tab.url, index: tab.index, title: tab.title } }))
}
function reopenJson(record: GatherReopen): JsonObject {
  return { id: record.id, seq: record.seq, at: record.at, auto: record.auto, to: "playlist", count: 0, acct: record.acct, playlist: record.playlist,
    added: [], windowId: record.windowId, ...(record.closed ? { closed: record.closed.map(({ url, index, title }) => ({ url, index, title })) } : {}),
    ...(record.closing ? { closing: closingJson(record.closing) } : {}) }
}
function gatherRecordJson(record: GatherRecord): JsonObject {
  switch (record.kind) {
    case "undo": return gatherJson(record.record)
    case "reopen": return reopenJson(record.record)
    case "sent": return sentJson(record.record)
  }
}
function recordAccount(record: GatherRecord): AccountKey | null {
  return record.kind === "sent" ? null : record.record.acct
}
// The after-close check replaces the plan with what it read back as gone.
function settled(found: Extract<GatherRecord, { kind: "undo" | "reopen" }>, closed: readonly GatherClosedTab[]): GatherRecord {
  if (found.kind === "undo") {
    const { closing: _plan, ...record } = found.record
    return { ...found, record: { ...record, closed } }
  }
  const { closing: _plan, ...record } = found.record
  return { ...found, record: { ...record, closed } }
}
// Writes a whole gather memory into the envelope, keeping unknown fields of every bucket it does not own.
function gatherEnvelope(raw: JsonValue | undefined, memory: GatherMemory): JsonObject | undefined {
  const outer = envelope(raw)
  if (!outer) return
  const last = [...memory.last].sort((a, b) => b.record.seq - a.record.seq).slice(0, GATHERS)
  const global: JsonObject = { ...outer.global }
  const sent = last.filter(record => recordAccount(record) === null).map(gatherRecordJson)
  if (sent.length || Object.hasOwn(global, "last")) global.last = sent
  const paced = [...memory.paced].sort((a, b) => b[1] - a[1]).slice(0, PACED_WINDOWS)
  if (paced.length || Object.hasOwn(global, "paced")) global.paced = Object.fromEntries(paced.map(([windowId, at]) => [String(windowId), at]))
  const kept = [...memory.kept].slice(-KEPT_TABS)
  if (kept.length || Object.hasOwn(global, "kept")) global.kept = kept
  const accounts: JsonObject = { ...outer.accounts }
  const named = new Set([...Object.keys(accounts), ...last.flatMap(record => recordAccount(record) ?? []), ...memory.refused.keys()])
  for (const acct of named) {
    const inner = accounts[acct]
    const bucket: JsonObject = object(inner) ? { ...inner } : {}
    const rows = last.filter(record => recordAccount(record) === acct).map(gatherRecordJson)
    if (rows.length || Object.hasOwn(bucket, "last")) bucket.last = rows
    const refused = isAccountKey(acct) ? [...memory.refused.get(acct) ?? []] : []
    if (refused.length || Object.hasOwn(bucket, "refused")) bucket.refused = refused
    if (Object.keys(bucket).length || object(inner)) accounts[acct] = bucket
  }
  return { ...outer, global, accounts }
}

// Parses the names AddFlow owns. Unknown names and unknown fields stay untouched in the raw record.
export function parseSessionMemory(raw: unknown): SessionMemory | undefined {
  if (!object(raw)) return
  const tabs = parseTabRecords(raw.tabs)
  if (!tabs) return
  if (raw.paused !== undefined && typeof raw.paused !== "boolean") return
  const recent: RecentTuple[] = []
  if (raw.recent !== undefined) {
    if (!Array.isArray(raw.recent)) return
    for (const row of raw.recent) {
      if (!object(row) || !isAccountKey(row.acct) || !isPlaylistId(row.playlist) || !isVideoId(row.video) || !natural(row.at)) return
      recent.push({ acct: row.acct, playlist: row.playlist, video: row.video, at: row.at })
    }
  }
  const cooldowns = new Map<AccountKey, number>(), skips = new Map<AccountKey, Map<VideoId, Skip>>()
  for (const [name, value] of Object.entries(raw)) {
    const [kind, acct, ...extra] = name.split(":")
    if (extra.length || acct === undefined || kind !== "skips" && kind !== "cooldown") continue
    if (!isAccountKey(acct)) return
    if (kind === "cooldown") {
      if (!natural(value)) return
      cooldowns.set(acct, value)
      continue
    }
    if (!object(value)) return
    const videos = new Map<VideoId, Skip>()
    for (const [video, playlists] of Object.entries(value)) {
      if (!isVideoId(video)) return
      if (playlists === "all") videos.set(video, "all")
      else if (Array.isArray(playlists) && playlists.every(isPlaylistId)) videos.set(video, playlists.filter(isPlaylistId))
      else return
    }
    skips.set(acct, videos)
  }
  const shownRaw = envelope(raw.shown), gatherRaw = envelope(raw.gather), breakageRaw = envelope(raw.breakage)
  if (!shownRaw || !gatherRaw || !breakageRaw || !isMonitorWriteTime(breakageRaw.global.monitorWrittenAt)) return
  const globalShown = strings(shownRaw.global.once)
  const monitorClaims = noticeClaims(shownRaw.global)
  if (!globalShown || !monitorClaims) return
  const accountsShown = new Map<AccountKey, ReadonlySet<string>>()
  for (const [acct, bucket] of Object.entries(shownRaw.accounts)) {
    const once = object(bucket) && isAccountKey(acct) ? strings(bucket.once) : undefined
    if (!once || !isAccountKey(acct)) return
    accountsShown.set(acct, new Set(once))
  }
  const gather = gatherMemory(gatherRaw)
  if (!gather) return
  const gathers = gather.last.flatMap(record => record.kind === "undo" ? [record.record] : [])
  const breakageAccounts = new Map<AccountKey, JsonObject>()
  for (const [acct, value] of Object.entries(breakageRaw.accounts)) {
    if (!isAccountKey(acct) || !object(value)) return
    breakageAccounts.set(acct, copy(value))
  }
  return { tabs, paused: raw.paused === true, recent, cooldowns, skips, shown: { global: new Set(globalShown), accounts: accountsShown }, gathers, gather,
    breakage: { global: copy(breakageRaw.global), accounts: breakageAccounts }, monitorClaims }
}

function gatherJson(record: GatherUndo): JsonObject {
  return { id: record.id, seq: record.seq, at: record.at, auto: record.auto, to: "playlist", count: record.added.length,
    acct: record.acct, playlist: record.playlist, added: record.added.map(({ video, setVideoId }) => ({ video, setVideoId })),
    ...(record.windowId !== undefined ? { windowId: record.windowId } : {}),
    ...(record.closed ? { closed: record.closed.map(({ url, index, title }) => ({ url, index, title })) } : {}),
    ...(record.closing ? { closing: closingJson(record.closing) } : {}) }
}

function recentAddJson(acct: AccountKey, recent: GatherRecentAdd): JsonObject {
  return { kind: "gather", acct, at: recent.at, source: { kind: "feature", feature: "gather" },
    playlists: [{ id: recent.playlist.id, title: recent.playlist.title }], videos: recent.videos.map(({ id, title }) => ({ id, title })) }
}

// Applies edits to a fresh raw record and names only the touched keys, so a commit never rewrites unrelated names or other accounts' fields.
export function planSessionChange(raw: unknown, change: Omit<SessionChange, "revision">): SessionPlan | undefined {
  const memory = parseSessionMemory(raw)
  if (!memory || !object(raw)) return
  const next = copy(raw), touched = new Set<RemovalSessionCollection>(), removed = new Map<string, RemovalSessionKey>()
  const set = (name: RemovalSessionCollection, value: JsonValue) => {
    next[name] = value
    touched.add(name)
    removed.delete(name)
  }
  const drop = (key: RemovalSessionKey) => {
    const name: RemovalSessionCollection = `${key.kind}:${key.acct}`
    delete next[name]
    touched.delete(name)
    removed.set(name, key)
  }
  const bucket = (name: "shown" | "gather", acct: AccountKey) => {
    const outer = envelope(next[name])
    if (!outer) throw new TypeError("Parsed session envelope changed")
    const inner = object(outer.accounts[acct]) ? outer.accounts[acct] : {}
    return { outer, inner }
  }
  for (const edit of change.edits) {
    switch (edit.kind) {
      case "tab-seen": {
        if (!isTabId(edit.tabId) || !isTabRecord(edit.info)) return
        const rows = parseTabRecords(next.tabs)
        if (!rows) return
        if (sameTabRecord(rows.get(edit.tabId), edit.info)) break
        set("tabs", tabRecordsJson(replaceTab(rows, edit.tabId, edit.info)))
        break
      }
      case "tab-forget": {
        if (!isTabId(edit.tabId) || !isTabRecord(edit.expected)) return
        const rows = parseTabRecords(next.tabs)
        if (!rows) return
        if (!sameTabRecord(rows.get(edit.tabId), edit.expected)) break
        const kept = new Map(rows)
        kept.delete(edit.tabId)
        set("tabs", tabRecordsJson(kept))
        break
      }
      case "pause": set("paused", edit.paused); break
      case "recent":
      case "forget": {
        const match = edit.kind === "recent" ? edit.tuple : edit
        const kept = (Array.isArray(next.recent) ? next.recent : []).filter(row => object(row) && natural(row.at) && live(row.at, RECENT_MS, change.now) &&
          !(row.acct === match.acct && row.playlist === match.playlist && row.video === match.video))
        set("recent", edit.kind === "recent" ? [...kept, { acct: match.acct, playlist: match.playlist, video: match.video, at: edit.tuple.at }] : kept)
        break
      }
      case "cooldown": {
        const previous = next[`cooldown:${edit.acct}`]
        const until = natural(previous) && live(previous - PAUSE_MS, PAUSE_MS, change.now) ? Math.max(edit.until, previous) : edit.until
        set(`cooldown:${edit.acct}`, until)
        break
      }
      case "skip":
      case "unskip": {
        const name: RemovalSessionCollection = `skips:${edit.acct}`
        const current = object(next[name]) ? { ...next[name] } : {}
        if (edit.kind === "unskip") delete current[edit.video]
        else {
          const before = current[edit.video]
          current[edit.video] = edit.playlists === "all" || before === "all" ? "all"
            : [...new Set([...(Array.isArray(before) ? before.filter(isPlaylistId) : []), ...edit.playlists])]
        }
        if (Object.keys(current).length) set(name, current)
        else if (Object.hasOwn(next, name)) drop({ kind: "skips", acct: edit.acct })
        break
      }
      case "shown": {
        const keys = { global: edit.keys.filter(key => !ONCE_PER_ACCOUNT.test(key)), account: edit.keys.filter(key => ONCE_PER_ACCOUNT.test(key)) }
        const { outer, inner } = bucket("shown", edit.acct)
        const global = { ...outer.global, once: [...new Set([...(strings(outer.global.once) ?? []), ...keys.global])] }
        const accounts = keys.account.length ? { ...outer.accounts, [edit.acct]: { ...inner, once: [...new Set([...(strings(inner.once) ?? []), ...keys.account])] } } : outer.accounts
        set("shown", { ...outer, global, accounts })
        break
      }
      case "shown-global": {
        if (edit.scope !== "normal" || edit.keys.some(key => !/^monitor:(www|music):(auto-add|shortcuts|quick-save|queue-button|watch-button|card-menu|gather|music-actions|music-keys|browser-menu|any-tab-keys)$/.test(key))) return
        const outer = envelope(next.shown)
        if (!outer) return
        set("shown", { ...outer, global: { ...outer.global, once: [...new Set([...(strings(outer.global.once) ?? []), ...edit.keys])] } })
        break
      }
      case "monitor-notice": {
        if (edit.scope !== "normal") return
        const outer = envelope(next.shown)
        if (!outer) return
        const global = applyMonitorNotice(outer.global, edit, change.now)
        if (!global) return
        set("shown", { ...outer, global })
        break
      }
      case "monitor": {
        if (edit.scope !== "normal" || !edit.operations.every(operation => isMonitorOperation(operation, edit.vocabulary))) return
        const outer = envelope(next.breakage)
        if (!outer) return
        const last = outer.global.monitorWrittenAt
        if (!isMonitorWriteTime(last) || last !== undefined && (change.now < last || change.now - last < MONITOR_WRITE_MS)) return
        const accountBucket = edit.acct === null ? undefined : outer.accounts[edit.acct]
        const inner: JsonObject = edit.acct === null ? outer.global : object(accountBucket) ? accountBucket : {}
        let journal = readMonitorBucket(inner, edit.vocabulary)
        if (!journal) return
        for (const operation of edit.operations) {
          if (!Object.hasOwn(journal.seen, operation.instance) && Object.keys(journal.seen).length >= MONITOR_SIGNALS) return
          journal = applyMonitorOperation(journal, operation)
        }
        let global: JsonObject = { ...outer.global, monitorWrittenAt: change.now }
        const accounts: JsonObject = { ...outer.accounts }
        if (edit.acct === null) global.monitor = monitorJson(journal)
        else accounts[edit.acct] = { ...inner, monitor: monitorJson(journal) }
        const buckets: JsonObject[] = [global, ...Object.values(accounts).filter(object)]
        const rows: { bucket: JsonObject; journal: NonNullable<ReturnType<typeof readMonitorBucket>> }[] = []
        for (const current of buckets) {
          const parsed = readMonitorBucket(current, edit.vocabulary)
          if (!parsed) return
          rows.push({ bucket: current, journal: parsed })
        }
        const ordered = rows.flatMap((row, bucket) => row.journal.signals.map((signal, index) => ({ bucket, index, at: signal.signal.firstSeen })))
          .sort((a, b) => a.at - b.at || a.bucket - b.bucket || a.index - b.index)
        const evicted = ordered.slice(0, Math.max(0, ordered.length - MONITOR_SIGNALS))
        for (const [index, row] of rows.entries()) {
          const indices = new Set(evicted.filter(item => item.bucket === index).map(item => item.index))
          if (indices.size) row.bucket.monitor = monitorJson({ ...row.journal, signals: row.journal.signals.filter((_, at) => !indices.has(at)) })
        }
        set("breakage", { ...outer, global, accounts })
        break
      }
      case "gather":
      case "gather-left":
      case "gather-reopen":
      case "gather-sent":
      case "gather-closed":
      case "gather-kept": {
        const current = parseSessionMemory(next)
        if (!current) throw new TypeError("Planned session record no longer parses")
        const before = current.gather
        let last = [...before.last]
        const paced = new Map(before.paced), kept = new Set(before.kept), refused = new Map(before.refused)
        const seq = last.reduce((top, record) => Math.max(top, record.record.seq), 0) + 1
        const refuse = (acct: AccountKey, videos: readonly VideoId[] | undefined) => {
          if (videos?.length) refused.set(acct, new Set([...refused.get(acct) ?? [], ...videos]))
        }
        if (edit.kind === "gather") {
          last.unshift({ to: "playlist", kind: "undo", record: { ...edit.record, seq } })
          if (edit.record.windowId !== undefined) paced.set(edit.record.windowId, edit.record.at)
          refuse(edit.record.acct, edit.refused)
        } else if (edit.kind === "gather-reopen") {
          if (!edit.record.closing?.length && !edit.record.closed?.length) return
          last.unshift({ to: "playlist", kind: "reopen", record: { ...edit.record, seq } })
          paced.set(edit.record.windowId, edit.record.at)
          refuse(edit.record.acct, edit.refused)
        } else if (edit.kind === "gather-sent") {
          if (edit.record.count === 0) return
          last.unshift({ to: edit.record.to, kind: "sent", record: { ...edit.record, seq } })
          paced.set(edit.record.windowId, edit.record.at)
        } else if (edit.kind === "gather-left") {
          const index = last.findIndex(record => record.kind !== "sent" && record.record.id === edit.id && record.record.acct === edit.acct)
          // A record that removal, eviction or another Undo already ended is never recreated.
          const found = last[index]
          if (index < 0 || !found || found.kind === "sent") break
          const [first, ...rest] = edit.added
          last = first && found.kind === "undo"
            ? last.map((record, at) => at === index ? { ...found, record: { ...found.record, added: [first, ...rest] } } : record)
            : last.filter((_, at) => at !== index)
        } else if (edit.kind === "gather-closed") {
          const index = last.findIndex(record => record.kind !== "sent" && record.record.id === edit.id && record.record.acct === edit.acct)
          const found = last[index]
          if (index < 0 || !found || found.kind === "sent" || !found.record.closing) break
          // Evidence can only narrow the plan: a tab outside it, or one named twice, is refused.
          const planned = found.record.closing.map(({ tab }) => JSON.stringify([tab.url, tab.index, tab.title]))
          const named = edit.closed.map(tab => JSON.stringify([tab.url, tab.index, tab.title]))
          if (new Set(named).size !== named.length || named.some(key => !planned.includes(key))) return
          const closed = edit.closed.map(({ url, index, title }) => ({ url, index, title }))
          last = found.kind === "reopen" && !closed.length ? last.filter((_, at) => at !== index)
            : last.map((record, at) => at === index ? settled(found, closed) : record)
        } else {
          if (![...edit.add, ...edit.remove].every(isTabId)) return
          for (const tabId of edit.remove) kept.delete(tabId)
          for (const tabId of edit.add) { kept.delete(tabId); kept.add(tabId) }
        }
        const written = gatherEnvelope(next.gather, { last: last.slice(0, GATHERS), paced, kept, refused })
        if (!written) throw new TypeError("Parsed session envelope changed")
        set("gather", written)
        if (edit.kind === "gather" && edit.recent) {
          const rows = Array.isArray(next.recentAdds) ? next.recentAdds : []
          set("recentAdds", [recentAddJson(edit.record.acct, edit.recent), ...rows].slice(0, RECENT_ADDS))
        }
        break
      }
      default: {
        const _exhaustive: never = edit
        return _exhaustive
      }
    }
  }
  const items: Partial<Record<RemovalSessionCollection, JsonValue>> = {}
  for (const name of touched) {
    const value = next[name]
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(raw[name])) items[name] = value
  }
  if (!parseSessionMemory(next)) return
  return { items, remove: [...removed.values()], expected: next }
}

export const emptySessionMemory: SessionMemory = {
  tabs: new Map(),
  paused: false, recent: [], cooldowns: new Map(), skips: new Map(), shown: { global: new Set(), accounts: new Map() }, gathers: [], gather: emptyGatherMemory, breakage: { global: {}, accounts: new Map() }, monitorClaims: new Map()
}

// The canonical record for the names AddFlow owns, so private memory and pending normal edits use the same edit rules as the owner.
export function sessionRecord(memory: SessionMemory): JsonObject {
  const record: JsonObject = {
    tabs: tabRecordsJson(memory.tabs),
    paused: memory.paused,
    breakage: { v: 1, global: copy(memory.breakage.global), accounts: Object.fromEntries([...memory.breakage.accounts].map(([acct, bucket]) => [acct, copy(bucket)])) },
    recent: memory.recent.map(({ acct, playlist, video, at }) => ({ acct, playlist, video, at })),
    shown: { v: 1, global: { once: [...memory.shown.global], monitorPending: Object.fromEntries([...memory.monitorClaims].map(([key, claim]) => [key, { ...claim }])) }, accounts: Object.fromEntries([...memory.shown.accounts].map(([acct, once]) => [acct, { once: [...once] }])) }
  }
  for (const [acct, until] of memory.cooldowns) record[`cooldown:${acct}`] = until
  for (const [acct, videos] of memory.skips) record[`skips:${acct}`] = Object.fromEntries([...videos].map(([video, skip]) => [video, skip === "all" ? "all" : [...skip]]))
  // `gathers` stays the authority for Undo records, so a caller that filters it also filters the whole gather memory.
  const last = [...memory.gathers.map((gather): GatherRecord => ({ to: "playlist", kind: "undo", record: gather })),
    ...memory.gather.last.filter(gather => gather.kind !== "undo")]
  const gather = gatherEnvelope(undefined, { ...memory.gather, last })
  if (!gather) throw new TypeError("Invalid gather memory")
  record.gather = gather
  return record
}

export function applySessionEdits(memory: SessionMemory, edits: readonly [SessionEdit, ...SessionEdit[]], now: number): SessionMemory {
  const plan = planSessionChange(sessionRecord(memory), { now, edits })
  const next = plan && parseSessionMemory(plan.expected)
  if (!next) throw new TypeError("Session edits produced an invalid record")
  return next
}
