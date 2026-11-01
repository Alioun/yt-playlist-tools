import type { FeatureId, JobData, JobInvocation, JobOf, JobResult, MembershipRow, Origin, RemovalIdentity, Site } from "../../shared/contracts"
import type { AccountKey, ChannelId, Filter, PlaylistId, ShortcutId, VideoId } from "../../shared/model"
import { decide } from "../../shared/rules/channel-filter"
import { failureOf, toastPlan, type ExplicitFailure, type ExplicitOutcome, type Failure, type Outcome, type ToastPlan } from "../../shared/rules/outcomes"
import { applySessionEdits, emptySessionMemory, live, PAUSE_MS, RECENT_MS, sessionAccountCurrent, sessionEditAccount, type GatherClosedTab, type GatherClosing, type GatherRecentAdd, type GatherReopen, type GatherUndo,
  type SessionEdit, type SessionMemory, type SessionPort, type SessionRead, type SessionWrite, type SessionRevision, type Skip } from "../store/session-memory"
import { isTabPing, type TabPing } from "../../shared/contracts/tabs"

// Facts the gateway recognised that JobResult can't carry. Each is a YT-ADD-28 row or YT-ADD-05's duplicate rejection.
type WriteFact = "not-sent" | "duplicate" | "missing" | "full" | "refused" | "account-refused"
type RemoveFact = "not-sent" | "account-refused"
export type Facts = {
  membership: "not-sent" | "unreadable" | "account-refused"
  add: WriteFact
  save: WriteFact
  remove: RemoveFact
  unsave: RemoveFact
  addBatch: "not-sent" | "missing" | "full" | "account-refused"
  removeBatch: RemoveFact
}
export type FlowJob = keyof Facts
export type BatchObservation = JobData<JobOf<"addBatch">>["results"][number] |
  { videoId: VideoId; fact: "duplicate" | "refused"; setVideoId?: never; failure?: never }
export type Answer<K extends FlowJob> =
  | { kind: "result"; result: JobResult<JobOf<K>> }
  | { kind: "fact"; fact: Facts[K] }
  | (K extends "addBatch" ? { kind: "observed"; results: readonly BatchObservation[] } : never)
export type Execution = {
  lane: string
  acct: AccountKey | null
  run: { [K in FlowJob]: (call: JobInvocation<JobOf<K>>) => Promise<Answer<K>> }
  // The tab that answered this execution's latest job, when the adapter knows it. A gather closes it last.
  served?: () => number | null
}

export type Feature =
  | { kind: "auto-add" }
  | { kind: "shortcut"; shortcut: ShortcutId }
  | { kind: "quick-save"; site: Site; opener: FeatureId }
  | { kind: "picker"; opener: FeatureId }
export type Target = { playlist: PlaylistId; filter?: Filter }
export type Shared = { on: boolean; feedback: boolean }
export type AccountSettings = { targets: readonly Target[]; created: Readonly<Partial<Record<PlaylistId, number>>> }
export type Mark = { acct: AccountKey; playlist: PlaylistId; mark: "missing" | "full" | "clear" }
export type Owner = {
  shared(feature: Feature): Shared
  account(feature: Feature, acct: AccountKey): AccountSettings
  writable(): boolean
  mark(change: Mark, origin: Origin): void
}
// `now` is wall time, because persisted deadlines must compare across workers. `generation` names this engine so no handle outlives it by accident.
export type Ports = {
  execution(origin: Origin, site: Site): Promise<Execution | null>
  owner: Owner
  session: SessionPort
  now(): number
  wait(ms: number): Promise<void>
  generation(): string
}

export type AddRequest = { site: Site; video: VideoId } & (
  | { via: "auto-add"; playlists: readonly PlaylistId[]; channel: ChannelId | null }
  | { via: "shortcut"; shortcut: ShortcutId }
  | { via: "quick-save"; opener: FeatureId }
  | { via: "picker" | "choose-quick-save" | "choose-shortcut"; opener: FeatureId; playlist: PlaylistId }
)
export type RemoveRequest = { site: Site; video: VideoId; playlist: PlaylistId; opener: FeatureId; tick: UndoHandle | null }
export type BatchOutcomes = readonly { video: VideoId; outcome: VideoOutcome }[]
// A gather's own facts for its Undo record. They are planned once the outcomes are known, inside the batch's hold, and written in the record's one change.
// The Recent entry takes the record's own time, so both name one moment.
export type BatchRecord = { readonly windowId: number; readonly closed: readonly GatherClosedTab[]; readonly recent: Omit<GatherRecentAdd, "at"> | null
  // The tabs about to close, kept as a plan until the after-close check (`settle`) names those that are gone.
  readonly closing?: readonly GatherClosing[]
  // Videos YouTube refused this session (DATA-58 `refused`), written in the record's own change.
  readonly refused?: readonly VideoId[] }
export type BatchRequest = {
  playlist: PlaylistId; videos: readonly VideoId[]; auto: boolean
  // The account the caller chose the playlist for. Another serving account writes nothing.
  acct?: AccountKey
  progress?: (done: number, total: number) => void
  record?: (outcomes: BatchOutcomes) => Promise<BatchRecord>
}

export type UndoHandle = { kind: "add" | "gather" | "remove"; id: string }
// The later tab router resolves `acct` from its authenticated registry, never from a page message.
export type SkipRequest = { acct: AccountKey; video: VideoId } & ({ kind: "skip"; playlists: Skip } | { kind: "unskip" })
export type MemoryReport =
  | { kind: "remembered"; scope: "normal" | "private" }
  | { kind: "stopped" }
  | Exclude<SessionWrite, { kind: "committed" }>
export type MemoryFailure = Exclude<MemoryReport, { kind: "remembered" | "stopped" }>
export type PrivateSkipChange = { readonly acct: AccountKey; readonly scope: "private" }
export type PrivateSkipRequest = {
  readonly context: {
    readonly tab: { readonly tabId: number; readonly incognito: true; readonly site: Site }
    readonly info: Extract<TabPing, { signedIn: true }>
  }
  readonly revision: SessionRevision
}
export type PrivateSkipRead =
  | { readonly kind: "skips"; readonly entries: readonly (readonly [VideoId, Skip])[] }
  | { readonly kind: "unavailable"; readonly reason: "context" | "held" | "revision" | "session" | "disposed" }
type MemoryStatus = { readonly memory?: readonly MemoryFailure[] }
type Ended = { kind: "no-tab" }
export type AddReport = MemoryStatus & (
  | { kind: "report"; outcomes: Readonly<Record<PlaylistId, Outcome>>; toast: ToastPlan | null; feedback: boolean; undo: UndoHandle | null }
  | { kind: "stopped"; outcomes: Readonly<Record<PlaylistId, Outcome>>; pending: readonly PlaylistId[]; feedback: boolean; toast: null; undo: null }
  | { kind: "choose" }
  | { kind: "signed-out" }
  | Ended)
export type RemoveReport = MemoryStatus & (
  | { kind: "removed"; playlist: PlaylistId; video: VideoId; feedback: boolean; toast: ToastPlan | null; undo: UndoHandle | null }
  | { kind: "failed"; failure: ExplicitFailure }
  | { kind: "stopped"; removed: boolean; playlist: PlaylistId; video: VideoId; undo: null }
  | { kind: "signed-out" }
  | Ended)
export type VideoOutcome = Extract<Outcome, { kind: "added" | "already-in" | "failed" }>
export type BatchReport = MemoryStatus & (
  | { kind: "report"; outcomes: BatchOutcomes; undo: UndoHandle | null; served?: number | null }
  | { kind: "stopped"; outcomes: BatchOutcomes; pending: readonly VideoId[]; undo: null }
  | { kind: "signed-out" }
  | Ended)
// `reopen` is present only for a gather whose record names the tabs it closed, once every entry is confirmed removed.
// `closed` is evidence only. `unresolved` counts planned tabs no after-close check confirmed; they never reopen.
export type UndoReport = MemoryStatus & (
  | { kind: "undone"; reopen?: { readonly windowId: number; readonly closed: readonly GatherClosedTab[]; readonly unresolved?: number } }
  | { kind: "failed"; completed: number; of: number; failure: ExplicitFailure; toast: ToastPlan | null }
  | { kind: "stopped"; completed: number; of: number }
  | { kind: "signed-out" }
  | { kind: "expired" }
  | Ended)

export type AddFlow = {
  add(request: AddRequest, origin: Origin): Promise<AddReport>
  remove(request: RemoveRequest, origin: Origin): Promise<RemoveReport>
  undo(handle: UndoHandle, origin: Origin): Promise<UndoReport>
  batch(request: BatchRequest, origin: Origin): Promise<BatchReport>
  // Records which of a gather's planned tabs the after-close check read back as gone, in the record's own scope.
  settle(handle: UndoHandle, closed: readonly GatherClosedTab[], origin: Origin): Promise<MemoryReport>
  pause(paused: boolean): Promise<MemoryReport>
  skip(request: SkipRequest, origin: Origin): Promise<MemoryReport>
  subscribePrivateSkips(changed: (event: PrivateSkipChange) => void, revoked?: () => void): () => void
  readPrivateSkips(request: PrivateSkipRequest): Promise<PrivateSkipRead>
  release(handle: UndoHandle): void
  releaseTab(lane: string): void
  quiesce(): Promise<void>
}

export { RECENT_MS, PAUSE_MS, GATHERS } from "../store/session-memory"
export const CREATED_MS = 30_000
export const CHUNK = 50

type Entry = { playlist: PlaylistId; video: VideoId; identity: RemovalIdentity }
type Scope = "normal" | "private"
type Undo = { kind: UndoHandle["kind"]; acct: AccountKey; site: Site; auto: boolean; entries: Entry[] }
type Ordinary = Undo & { kind: "add" | "remove"; scope: Scope; lane: string }
type Pending = { readonly revision: SessionRevision; readonly at: number; edits: readonly SessionEdit[]; failure: MemoryFailure | null }
type Read = { kind: "rows"; rows: readonly MembershipRow[] } | { kind: "unreadable" } | { kind: "failed"; failure: ExplicitFailure }
type Written = { outcomes: Record<PlaylistId, ExplicitOutcome>; held: PlaylistId[]; entries: Entry[] }

class Stopped extends Error {}

export function createAddFlow(ports: Ports): AddFlow {
  const instance = ports.generation()
  const tuples = new Map<string, Promise<void>>()
  const lanes = new Map<string, Promise<void>>()
  const tripped = new Set<string>()
  const refused = new Set<string>()
  const shownTabs = new Map<string, Set<string>>()
  const undos = new Map<string, Ordinary>()
  const running = new Set<Promise<unknown>>()
  // Rejected facts remain local evidence, never confirmed session progress. Private memory never leaves these variables.
  let normal: { memory: SessionMemory; revision: SessionRevision; sequence: number } | null = null
  const pending = new Set<Pending>()
  const notes = new Set<Promise<void>>()
  const authorities = new WeakMap<Execution, SessionRevision>()
  const privateSkipListeners = new Set<(event: PrivateSkipChange) => void>()
  const privateSkipRevocations = new Set<() => void>()
  function revokePrivateSkips() {
    privateSkipListeners.clear()
    const stops = [...privateSkipRevocations]
    privateSkipRevocations.clear()
    for (const stop of stops) { try { stop() } catch {} }
  }
  let privateMemory = emptySessionMemory
  let serial = 0
  let halted = false
  let draining: Promise<void> | null = null
  let halt = () => {}
  const stopping = new Promise<void>(resolve => { halt = resolve })

  const tuple = (acct: AccountKey, playlist: PlaylistId, video: VideoId) => `${acct} ${playlist} ${video}`
  const scopeOf = (origin: Origin): Scope => "incognito" in origin && origin.incognito ? "private" : "normal"

  function memory(scope: Scope): SessionMemory {
    if (scope === "private") return privateMemory
    pruneFacts()
    let current = normal?.memory ?? emptySessionMemory
    for (const { edits } of pending) {
      const [first, ...rest] = edits
      if (first) current = applySessionEdits(current, [first, ...rest], ports.now())
    }
    return current
  }

  const factKey = (edit: SessionEdit): string | null => edit.kind === "recent" ? tuple(edit.tuple.acct, edit.tuple.playlist, edit.tuple.video)
    : edit.kind === "forget" ? tuple(edit.acct, edit.playlist, edit.video) : edit.kind === "cooldown" ? `cooldown ${edit.acct}` : null

  function pruneFacts(): void {
    const now = ports.now()
    for (const entry of pending) {
      if (entry.failure) entry.edits = entry.edits.filter(edit => edit.kind === "recent" ? live(edit.tuple.at, RECENT_MS, now)
        : edit.kind === "cooldown" ? live(edit.until - PAUSE_MS, PAUSE_MS, now) : edit.kind === "forget" && live(entry.at, RECENT_MS, now))
      if (!entry.edits.length) pending.delete(entry)
    }
  }

  function adopt(view: Extract<SessionRead, { kind: "memory" }> | Extract<SessionWrite, { kind: "committed" }>): void {
    if (normal && view.sequence <= normal.sequence) return
    if (normal) {
      const before = normal.revision
      const current = (acct: AccountKey) => sessionAccountCurrent(before, view.revision, acct)
      for (const [id, undo] of undos) if (!current(undo.acct)) undos.delete(id)
      privateMemory = before.reset !== view.revision.reset ? emptySessionMemory : {
        ...privateMemory,
        recent: privateMemory.recent.filter(row => current(row.acct)),
        cooldowns: new Map([...privateMemory.cooldowns].filter(([acct]) => current(acct))),
        skips: new Map([...privateMemory.skips].filter(([acct]) => current(acct))),
        shown: { global: privateMemory.shown.global, accounts: new Map([...privateMemory.shown.accounts].filter(([acct]) => current(acct))) },
        gathers: privateMemory.gathers.filter(record => current(record.acct)),
        gather: { ...privateMemory.gather, last: privateMemory.gather.last.filter(record => record.kind === "sent" || current(record.record.acct)),
          refused: new Map([...privateMemory.gather.refused].filter(([acct]) => current(acct))) }
      }
      for (const entry of pending) {
        entry.edits = entry.edits.filter(edit => sessionAccountCurrent(entry.revision, view.revision, sessionEditAccount(edit)))
        if (!entry.edits.length) pending.delete(entry)
      }
    }
    normal = { memory: view.memory, revision: view.revision, sequence: view.sequence }
    pruneFacts()
  }

  async function load(): Promise<Exclude<SessionWrite, { kind: "committed" | "failed" }> | null> {
    let read: SessionRead
    try { read = await ports.session.read() } catch (error) { return { kind: "unconfirmed", cause: { kind: "read-failed", error } } }
    if (read.kind === "memory") {
      adopt(read)
      return null
    }
    if (read.reason === "disposed" || read.reason === "consent-held") stop()
    return read
  }

  async function remember(scope: Scope, edits: readonly [SessionEdit, ...SessionEdit[]], revision = normal?.revision): Promise<MemoryReport> {
    const now = ports.now()
    if (!normal || !revision) return { kind: "unavailable", reason: "stale" }
    const current = normal.revision
    if (!edits.every(edit => sessionAccountCurrent(revision, current, sessionEditAccount(edit)))) return { kind: "unavailable", reason: "revision" }
    if (scope === "private") {
      if (halted) return { kind: "stopped" }
      const changesSkips = edits.some(edit => edit.kind === "skip" || edit.kind === "unskip")
      // Confirmed request facts must be visible to queued work before the fresh read finishes.
      if (!changesSkips) privateMemory = applySessionEdits(privateMemory, edits, now)
      const unloaded = await load()
      if (unloaded) return unloaded
      active()
      const observed = normal.revision
      if (!edits.every(edit => sessionAccountCurrent(revision, observed, sessionEditAccount(edit)))) return { kind: "unavailable", reason: "revision" }
      if (!changesSkips) return { kind: "remembered", scope }
      const before = privateMemory.skips
      privateMemory = applySessionEdits(privateMemory, edits, ports.now())
      const accounts = new Set(edits.flatMap(edit => edit.kind === "skip" || edit.kind === "unskip" ? [edit.acct] : []))
      const value = (rows: ReadonlyMap<VideoId, Skip> | undefined) => JSON.stringify([...rows ?? []].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      for (const acct of accounts) if (value(before.get(acct)) !== value(privateMemory.skips.get(acct))) {
        for (const listener of [...privateSkipListeners]) if (privateSkipListeners.has(listener)) {
          try { listener({ acct, scope: "private" }) } catch {}
        }
      }
      return { kind: "remembered", scope }
    }
    // Confirmed facts from requests still draining are kept. The owner refuses them itself once withdrawal or disposal stops it.
    const keys = new Set(edits.map(factKey).filter((key): key is string => key !== null))
    for (const entry of pending) entry.edits = entry.edits.filter(edit => {
      const key = factKey(edit)
      return key === null || !keys.has(key)
    })
    const entry: Pending = { revision, at: now, edits, failure: null }
    pending.add(entry)
    let result: SessionWrite
    try {
      result = await ports.session.change({ revision, now, edits })
      if (result.kind === "committed") {
        adopt(result)
        pending.delete(entry)
        return { kind: "remembered", scope }
      }
    } catch (error) {
      result = { kind: "unconfirmed", cause: { kind: "read-failed", error } }
    }
    entry.failure = result
    entry.edits = entry.edits.filter(edit => factKey(edit) !== null)
    pruneFacts()
    if (result.kind === "unavailable" && result.reason === "revision") await load()
    return result
  }

  // For memory a report does not depend on. The write still joins `running`, so quiesce drains it.
  function note(scope: Scope, edits: readonly [SessionEdit, ...SessionEdit[]], revision?: SessionRevision): void {
    const write = remember(scope, edits, revision).then(() => {})
    notes.add(write)
    running.add(write)
    const forget = () => { notes.delete(write); running.delete(write) }
    void write.then(forget, forget)
  }

  function isRecent(scope: Scope, acct: AccountKey, playlist: PlaylistId, video: VideoId): boolean {
    const now = ports.now()
    return memory(scope).recent.some(row => row.acct === acct && row.playlist === playlist && row.video === video && live(row.at, RECENT_MS, now))
  }

  function skipped(scope: Scope, acct: AccountKey, playlist: PlaylistId, video: VideoId): boolean {
    const skip = memory(scope).skips.get(acct)?.get(video)
    return skip === "all" || skip?.includes(playlist) === true
  }

  async function hold<T>(tails: Map<string, Promise<void>>, keys: readonly string[], work: () => Promise<T>): Promise<T> {
    let release = () => {}
    const done = new Promise<void>(resolve => { release = resolve })
    const prior = [...new Set(keys)].map(key => {
      const before = tails.get(key) ?? Promise.resolve()
      const tail = before.then(() => done)
      tails.set(key, tail)
      void tail.then(() => { if (tails.get(key) === tail) tails.delete(key) })
      return before
    })
    try {
      await Promise.all(prior)
      return await work()
    } finally {
      release()
    }
  }

  // Worker teardown revokes this engine's authority only. Normal gather history stays in the session for the next engine.
  function stop(): never {
    halted = true
    halt()
    undos.clear()
    revokePrivateSkips()
    privateMemory = emptySessionMemory
    pending.clear()
    throw new Stopped()
  }

  function active(): void {
    if (!halted && ports.owner.writable()) return
    stop()
  }

  function track<T extends object>(work: () => Promise<T>, stopped: () => T, context?: () => { scope: Scope; acct: AccountKey | null }): Promise<T> {
    const action = (async () => {
      active()
      const result = await work()
      if (!context) return result
      await Promise.all([...notes])
      pruneFacts()
      const { scope, acct } = context()
      const issues = scope === "normal" ? [...pending].flatMap(entry => entry.failure && entry.edits.some(edit => sessionEditAccount(edit) === acct) ? [entry.failure] : []) : []
      return issues.length ? { ...result, memory: issues } : result
    })().catch((error: unknown) => {
      if (error instanceof Stopped) return stopped()
      throw error
    })
    const forget = () => { running.delete(action) }
    running.add(action)
    void action.then(forget, forget)
    return action
  }

  function send<T>(exec: Execution, acct: AccountKey, scope: Scope, request: () => Promise<T>, authorized = () => true): Promise<T | { kind: "held"; failure: ExplicitFailure }> {
    if (!authorities.has(exec) && normal) authorities.set(exec, normal.revision)
    return hold<T | { kind: "held"; failure: ExplicitFailure }>(lanes, [exec.lane], () => {
      active()
      const revision = authorities.get(exec)
      const failure = !authorized() || !revision || !normal || !sessionAccountCurrent(revision, normal.revision, acct) ? "not-sent" : exec.acct === acct ? blocked(exec, acct, scope) : "account-changed"
      if (failure) return Promise.resolve({ kind: "held", failure: observe(exec, acct, scope, failure) } as const)
      return request()
    })
  }

  function mark(change: Mark, origin: Origin): void {
    if (!halted && ports.owner.writable()) ports.owner.mark(change, origin)
  }

  function observe(exec: Execution, acct: AccountKey, scope: Scope, failure: Failure): ExplicitFailure {
    if (failure === "rate-limited") note(scope, [{ kind: "cooldown", acct, until: ports.now() + PAUSE_MS }], authorities.get(exec))
    if (failure === "account-changed") tripped.add(exec.lane)
    if (failure === "account-refused") refused.add(`${exec.lane} ${acct}`)
    // failureOf never yields membership-unreadable, but its type can't say so.
    return failure === "membership-unreadable" ? "unrecognised" : failure
  }

  function blocked(exec: Execution, acct: AccountKey, scope: Scope): ExplicitFailure | null {
    if (tripped.has(exec.lane)) return "account-changed"
    if (refused.has(`${exec.lane} ${acct}`)) return "account-refused"
    const until = memory(scope).cooldowns.get(acct)
    if (until !== undefined && live(until - PAUSE_MS, PAUSE_MS, ports.now())) return "paused"
    return null
  }

  async function read(exec: Execution, acct: AccountKey, scope: Scope, video: VideoId): Promise<Read> {
    const answer = await send(exec, acct, scope, () => exec.run.membership({ job: { kind: "membership", videoId: video }, acct }))
    if (answer.kind === "held") return { kind: "failed", failure: answer.failure }
    if (answer.kind === "fact") {
      return answer.fact === "unreadable" ? { kind: "unreadable" } : { kind: "failed", failure: observe(exec, acct, scope, answer.fact) }
    }
    if (answer.result.ok) return { kind: "rows", rows: answer.result.data }
    return { kind: "failed", failure: observe(exec, acct, scope, failureOf(answer.result)) }
  }

  const holds = (membership: Read, playlist: PlaylistId) => membership.kind === "rows" && membership.rows.some(row => row.id === playlist && row.contains)
  const lacks = (membership: Read, playlist: PlaylistId) => membership.kind === "rows" && membership.rows.some(row => row.id === playlist && !row.contains)

  async function addOne(exec: Execution, site: Site, acct: AccountKey, scope: Scope, playlist: PlaylistId, video: VideoId, origin: Origin, authorized = () => true): Promise<[ExplicitOutcome, Entry | null]> {
    const answer = site === "www"
      ? await send(exec, acct, scope, () => exec.run.add({ job: { kind: "add", playlistId: playlist, videoId: video }, acct }), authorized)
      : await send(exec, acct, scope, () => exec.run.save({ job: { kind: "save", playlistId: playlist, videoId: video }, acct }), authorized)
    if (answer.kind === "held") return [{ kind: "failed", failure: answer.failure }, null]
    if (answer.kind === "fact") {
      if (answer.fact === "duplicate") return [{ kind: "already-in" }, null]
      if (answer.fact === "missing" || answer.fact === "full") mark({ acct, playlist, mark: answer.fact }, origin)
      return [{ kind: "failed", failure: observe(exec, acct, scope, answer.fact) }, null]
    }
    if (!answer.result.ok) return [{ kind: "failed", failure: observe(exec, acct, scope, failureOf(answer.result)) }, null]
    note(scope, [{ kind: "recent", tuple: { acct, playlist, video, at: ports.now() } }], authorities.get(exec))
    mark({ acct, playlist, mark: "clear" }, origin)
    const id = answer.result.data.setVideoId
    // Success means a confirmed new addition. Known membership and duplicate facts never reach this branch.
    const identity: RemovalIdentity = id !== null ? { setVideoId: id } : { videoId: video }
    return [{ kind: "added" }, { playlist, video, identity }]
  }

  async function removeOne(exec: Execution, site: Site, acct: AccountKey, scope: Scope, entry: Entry, authorized = () => true): Promise<ExplicitFailure | null> {
    const call = { playlistId: entry.playlist, ...entry.identity }
    const answer = site === "www"
      ? await send(exec, acct, scope, () => exec.run.remove({ job: { kind: "remove", ...call }, acct }), authorized)
      : await send(exec, acct, scope, () => exec.run.unsave({ job: { kind: "unsave", ...call }, acct }), authorized)
    if (answer.kind === "held") return answer.failure
    if (answer.kind === "fact") return observe(exec, acct, scope, answer.fact)
    if (!answer.result.ok) return observe(exec, acct, scope, failureOf(answer.result))
    note(scope, [{ kind: "forget", acct, playlist: entry.playlist, video: entry.video }], authorities.get(exec))
    return null
  }

  async function ripen(createdAt: number | undefined): Promise<void> {
    const wait = createdAt === undefined ? 0 : createdAt + CREATED_MS - ports.now()
    if (wait > 0) await Promise.race([ports.wait(wait), stopping])
  }

  async function write(exec: Execution, request: AddRequest, acct: AccountKey, scope: Scope, targets: readonly PlaylistId[], created: AccountSettings["created"], origin: Origin, written: Written): Promise<Written> {
    const early = blocked(exec, acct, scope)
    if (early) {
      for (const playlist of targets) written.outcomes[playlist] = { kind: "failed", failure: early }
      return written
    }
    const pendingTargets = targets.filter(playlist => {
      if (!isRecent(scope, acct, playlist, request.video)) return true
      written.outcomes[playlist] = { kind: "already-in" }
      return false
    })
    if (!pendingTargets.length) return written
    const membership = await read(exec, acct, scope, request.video)
    if (membership.kind === "failed") {
      for (const playlist of pendingTargets) written.outcomes[playlist] = { kind: "failed", failure: membership.failure }
      return written
    }
    if (membership.kind === "unreadable" && request.via === "auto-add") {
      written.held = pendingTargets
      return written
    }
    for (const playlist of pendingTargets) {
      if (holds(membership, playlist)) {
        written.outcomes[playlist] = { kind: "already-in" }
        continue
      }
      await ripen(created[playlist])
      const stop = blocked(exec, acct, scope)
      if (stop) {
        written.outcomes[playlist] = { kind: "failed", failure: stop }
        continue
      }
      const [outcome, entry] = await addOne(exec, request.site, acct, scope, playlist, request.video, origin)
      written.outcomes[playlist] = outcome
      if (entry) written.entries.push(entry)
    }
    return written
  }

  function keep(undo: Undo & { kind: "add" | "remove" }, scope: Scope, lane: string, revision: SessionRevision | undefined): UndoHandle | null {
    if (!undo.entries.length || !revision || !normal || !sessionAccountCurrent(revision, normal.revision, undo.acct)) return null
    const id = `${instance}:${++serial}`
    undos.set(id, { ...undo, scope, lane })
    return { kind: undo.kind, id }
  }

  // Gather Undo exists only once its record is remembered in its own scope, so a handle never outlives an unsaved record.
  async function keepGather(scope: Scope, acct: AccountKey, playlist: PlaylistId, entries: readonly Entry[], revision: SessionRevision | undefined,
    auto: boolean, plan: BatchRecord | null): Promise<UndoHandle | null> {
    const [first, ...rest] = entries.map(entry => ({ video: entry.video, setVideoId: entry.identity.setVideoId ?? null }))
    const refused = plan?.refused?.length ? { refused: plan.refused } : {}
    if (!first) {
      // Nothing was added, so there is nothing to remove. The tabs it is about to close still need a record that can reopen them.
      const [closing, ...more] = plan?.closing ?? []
      if (!plan || !closing) return null
      const id = `${instance}:${++serial}`
      const record: Omit<GatherReopen, "seq"> = { id, at: ports.now(), auto, acct, playlist, windowId: plan.windowId, closing: [closing, ...more] }
      const kept = await remember(scope, [{ kind: "gather-reopen", record, ...refused }], revision)
      return kept.kind === "remembered" ? { kind: "gather", id } : null
    }
    const id = `${instance}:${++serial}`
    // With a plan, the record keeps the planned tabs apart from `closed`, which only the after-close check fills.
    const closedFacts = !plan ? {} : !plan.closing ? { windowId: plan.windowId, closed: plan.closed }
      : plan.closing.length ? { windowId: plan.windowId, closing: plan.closing } : { windowId: plan.windowId }
    const record = { id, at: ports.now(), auto, acct, playlist, added: [first, ...rest] as const, ...closedFacts }
    // A private gather is never listed in Recent adds.
    const recent = scope === "normal" && plan?.recent ? { recent: { ...plan.recent, at: record.at } } : {}
    const kept = await remember(scope, [{ kind: "gather", record, ...recent, ...refused }], revision)
    return kept.kind === "remembered" ? { kind: "gather", id } : null
  }

  function reopenRecord(scope: Scope, id: string): GatherReopen | undefined {
    return memory(scope).gather.last.flatMap(record => record.kind === "reopen" && record.record.id === id ? [record.record] : [])[0]
  }

  // A reopen-only gather removes no playlist entry, so it needs no serving tab. It ends its record, then hands back what it can reopen.
  async function undoReopen(scope: Scope, record: GatherReopen): Promise<UndoReport> {
    const left = await remember(scope, [{ kind: "gather-left", id: record.id, acct: record.acct, added: [] }], normal?.revision)
    active()
    if (left.kind !== "remembered") return { kind: "failed", completed: 0, of: 0, failure: "not-sent", toast: toastPlan({ kind: "undo-failed" }, true) }
    return { kind: "undone", reopen: { windowId: record.windowId, closed: record.closed ?? [], unresolved: record.closing?.length ?? 0 } }
  }

  function settle(handle: UndoHandle, closed: readonly GatherClosedTab[], origin: Origin) {
    const scope = scopeOf(origin)
    return track<MemoryReport>(async () => {
      const unloaded = await load()
      if (unloaded) return unloaded
      if (handle.kind !== "gather") return { kind: "unavailable", reason: "stale" }
      const acct = reopenRecord(scope, handle.id)?.acct ?? memory(scope).gathers.find(gather => gather.id === handle.id)?.acct
      if (!acct) return { kind: "unavailable", reason: "stale" }
      return remember(scope, [{ kind: "gather-closed", id: handle.id, acct, closed }])
    }, () => ({ kind: "stopped" }))
  }

  function gatherUndo(scope: Scope, id: string): (Undo & { record: GatherUndo }) | undefined {
    const record = memory(scope).gathers.find(gather => gather.id === id)
    if (!record) return
    return { kind: "gather", acct: record.acct, site: "www", auto: record.auto, record,
      entries: record.added.map(({ video, setVideoId }) => ({ playlist: record.playlist, video, identity: setVideoId !== null ? { setVideoId } : { videoId: video } })) }
  }

  function featureOf(request: AddRequest): Feature {
    switch (request.via) {
      case "auto-add": return { kind: "auto-add" }
      case "shortcut": return { kind: "shortcut", shortcut: request.shortcut }
      case "quick-save": return { kind: "quick-save", site: request.site, opener: request.opener }
      default: return { kind: "picker", opener: request.opener }
    }
  }

  function add(request: AddRequest, origin: Origin) {
    const progress: Written = { outcomes: {}, held: [], entries: [] }
    const early: Record<PlaylistId, Outcome> = {}
    const scope = scopeOf(origin)
    let feedback = false
    let reportingAccount: AccountKey | null = null
    let playlists: readonly PlaylistId[] = []
    return track<AddReport>(async () => {
      const feature = featureOf(request)
      const shared = ports.owner.shared(feature)
      feedback = shared.feedback
      const quiet: AddReport = { kind: "report", outcomes: {}, toast: null, feedback, undo: null }
      if (!shared.on) return quiet
      const exec = await ports.execution(origin, request.site)
      if (!exec) return { kind: "no-tab" }
      const acct = exec.acct
      if (acct === null) return request.via === "auto-add" ? quiet : { kind: "signed-out" }
      reportingAccount = acct
      const settings = ports.owner.account(feature, acct)
      const targets: readonly Target[] = "playlist" in request
        ? [{ playlist: request.playlist }]
        : request.via === "auto-add"
          ? settings.targets.filter(({ playlist }) => request.playlists.includes(playlist))
          : settings.targets
      if (!targets.length) {
        if (request.via === "auto-add") return quiet
        if (request.via === "quick-save") return { kind: "choose" }
        return { ...quiet, toast: toastPlan({ kind: "no-playlist" }, feedback) }
      }
      const unloaded = await load()
      active()
      if (unloaded) {
        if (request.via === "auto-add") return quiet
        const outcomes: Record<PlaylistId, ExplicitOutcome> = {}
        for (const { playlist } of targets) outcomes[playlist] = { kind: "failed", failure: "not-sent" }
        const toast = request.via === "choose-quick-save" || request.via === "choose-shortcut" ? null : toastPlan({ kind: request.via, outcomes }, feedback)
        return { kind: "report", outcomes, toast, feedback, undo: null }
      }
      if (normal) authorities.set(exec, normal.revision)
      // Pause is the shared session switch, so a private window obeys it without reading any normal account record.
      if (request.via === "auto-add" && memory("normal").paused) return quiet
      const remaining = request.via !== "auto-add" ? targets : targets.filter(({ playlist, filter }) => {
        if (skipped(scope, acct, playlist, request.video)) {
          early[playlist] = { kind: "skipped" }
          return false
        }
        const decision = decide(filter, request.channel)
        if (decision === "pass") return true
        early[playlist] = { kind: "filtered", decision }
        return false
      })
      playlists = remaining.map(({ playlist }) => playlist)
      const written = await hold(tuples, playlists.map(playlist => tuple(acct, playlist, request.video)), () => {
        const ready = scope !== "private" || request.via !== "auto-add" ? playlists : playlists.filter(playlist => {
          if (!skipped(scope, acct, playlist, request.video)) return true
          early[playlist] = { kind: "skipped" }
          return false
        })
        return write(exec, request, acct, scope, ready, settings.created, origin, progress)
      })
      active()
      const undo = keep({ kind: "add", acct, site: request.site, auto: request.via === "auto-add", entries: written.entries }, scope, exec.lane, authorities.get(exec))
      if (request.via === "auto-add") {
        const outcomes: Record<PlaylistId, Outcome> = { ...early, ...written.outcomes }
        for (const playlist of written.held) outcomes[playlist] = { kind: "failed", failure: "membership-unreadable" }
        const tab = shownTabs.get(exec.lane) ?? new Set<string>()
        const once = memory(scope).shown
        const session = new Set([...once.global, ...once.accounts.get(acct) ?? []])
        const toast = toastPlan({ kind: "auto-add", outcomes, shown: { tab, session } }, feedback)
        for (const key of toast?.remember.tab ?? []) shownTabs.set(exec.lane, tab.add(key))
        const [first, ...rest] = toast?.remember.session ?? []
        if (first !== undefined) note(scope, [{ kind: "shown", acct, keys: [first, ...rest] }], authorities.get(exec))
        return { kind: "report", outcomes, toast, feedback, undo }
      }
      // A choose-mode pick also sets a destination, which the picker owns, so the picker plans that toast once its choice settles.
      const toast = request.via === "choose-quick-save" || request.via === "choose-shortcut"
        ? null
        : toastPlan({ kind: request.via, outcomes: written.outcomes }, feedback)
      return { kind: "report", outcomes: written.outcomes, toast, feedback, undo }
    }, () => ({
      kind: "stopped", outcomes: { ...early, ...progress.outcomes },
      pending: playlists.filter(playlist => !Object.hasOwn(progress.outcomes, playlist)), feedback, toast: null, undo: null
    }), () => ({ scope, acct: reportingAccount }))
  }

  function remove(request: RemoveRequest, origin: Origin) {
    let removed = false
    let reportingAccount: AccountKey | null = null
    const scope = scopeOf(origin)
    return track<RemoveReport>(async () => {
      const { feedback } = ports.owner.shared({ kind: "picker", opener: request.opener })
      const exec = await ports.execution(origin, request.site)
      if (!exec) return { kind: "no-tab" }
      const acct = exec.acct
      if (acct === null) return { kind: "signed-out" }
      reportingAccount = acct
      const autoAdd = ports.owner.account({ kind: "auto-add" }, acct).targets
      if (await load()) return { kind: "failed", failure: "not-sent" }
      if (normal) authorities.set(exec, normal.revision)
      const key = tuple(acct, request.playlist, request.video)
      return hold(tuples, [key], async (): Promise<RemoveReport> => {
        const found = request.tick?.kind === "add" ? undos.get(request.tick.id) : undefined
        const undo = found?.scope === scope ? found : undefined
        if (undo && undo.acct !== acct) return { kind: "failed", failure: "account-changed" }
        const entry = undo?.acct === acct ? undo.entries.find(({ playlist, video }) => playlist === request.playlist && video === request.video) : undefined
        const stop = blocked(exec, acct, scope)
        if (stop) return { kind: "failed", failure: stop }
        const membership = await read(exec, acct, scope, request.video)
        if (membership.kind === "failed") return { kind: "failed", failure: membership.failure }
        if (!lacks(membership, request.playlist)) {
          const failure = await removeOne(exec, request.site, acct, scope, entry ?? {
            playlist: request.playlist, video: request.video, identity: { videoId: request.video }
          })
          if (failure) return { kind: "failed", failure }
        }
        removed = true
        note(scope, [{ kind: "forget", acct, playlist: request.playlist, video: request.video }], authorities.get(exec))
        if (undo && entry) undo.entries = undo.entries.filter(item => item !== entry)
        if (autoAdd.some(({ playlist }) => playlist === request.playlist)) {
          const edits = [{ kind: "skip", acct, video: request.video, playlists: [request.playlist] }] as const
          if (scope === "private") await remember(scope, edits, authorities.get(exec))
          else note(scope, edits, authorities.get(exec))
        }
        active()
        // Already absent is settled, but creates no inverse write authority.
        const handle = lacks(membership, request.playlist) ? null : keep({
          kind: "remove", acct, site: request.site, auto: false,
          entries: [{ playlist: request.playlist, video: request.video, identity: { videoId: request.video } }]
        }, scope, exec.lane, authorities.get(exec))
        const toast = handle ? toastPlan({ kind: "removed", playlist: request.playlist }, feedback) : null
        return { kind: "removed", playlist: request.playlist, video: request.video, feedback, toast, undo: handle }
      })
    }, () => ({ kind: "stopped", removed, playlist: request.playlist, video: request.video, undo: null }), () => ({ scope, acct: reportingAccount }))
  }

  function undo(handle: UndoHandle, origin: Origin) {
    const progress = { completed: 0, of: 0 }
    let reportingAccount: AccountKey | null = null
    const scope = scopeOf(origin)
    const failed = (failure: ExplicitFailure): UndoReport => ({
      kind: "failed", ...progress, failure, toast: toastPlan({ kind: "undo-failed" }, true)
    })
    return track<UndoReport>(async () => {
      if (await load()) return failed("not-sent")
      const ordinary = handle.kind === "gather" ? undefined : undos.get(handle.id)
      const reopenOnly = handle.kind === "gather" ? reopenRecord(scope, handle.id) : undefined
      if (reopenOnly) return undoReopen(scope, reopenOnly)
      const record = handle.kind === "gather" ? gatherUndo(scope, handle.id) : ordinary?.kind === handle.kind && ordinary.scope === scope ? ordinary : undefined
      if (!record) return { kind: "expired" }
      reportingAccount = record.acct
      progress.of = record.entries.length
      const exec = await ports.execution(origin, record.site)
      if (!exec) return { kind: "no-tab" }
      if (exec.acct === null) return { kind: "signed-out" }
      if (normal) authorities.set(exec, normal.revision)
      const stop = exec.acct === record.acct ? blocked(exec, record.acct, scope) : "account-changed"
      if (stop) return failed(stop)
      return hold(tuples, record.entries.map(({ playlist, video }) => tuple(record.acct, playlist, video)), async (): Promise<UndoReport> => {
        active()
        const current = handle.kind === "gather" ? gatherUndo(scope, handle.id) : undos.get(handle.id)
        if (!current || handle.kind !== "gather" && current !== record) return { kind: "expired" }
        const work = handle.kind === "gather" ? current : record
        const closed = "record" in current ? current.record : undefined
        progress.of = work.entries.length
        const authorized = handle.kind === "gather"
          ? () => memory(scope).gathers.some(gather => gather.id === handle.id)
          : () => undos.get(handle.id) === record
        if (work.auto) for (const { playlist, video } of work.entries) {
          const edits = [{ kind: "skip", acct: work.acct, video, playlists: [playlist] }] as const
          if (scope === "private") await remember(scope, edits, authorities.get(exec))
          else note(scope, edits, authorities.get(exec))
        }
        const failure = work.kind === "remove"
          ? await undoRemoval(exec, work, scope, origin, progress, authorized)
          : work.kind === "gather"
            ? await undoGather(exec, work, scope, progress, authorized)
            : await undoAdd(exec, work, scope, progress, authorized)
        if (handle.kind === "gather" && authorized()) {
          await remember(scope, [{ kind: "gather-left", id: handle.id, acct: work.acct,
            added: work.entries.map(({ video, identity }) => ({ video, setVideoId: identity.setVideoId ?? null })) }], authorities.get(exec))
        }
        active()
        if (failure) return failed(failure)
        undos.delete(handle.id)
        const unresolved = closed?.closing?.length ?? 0
        return (closed?.closed?.length || unresolved) && closed?.windowId !== undefined
          ? { kind: "undone", reopen: { windowId: closed.windowId, closed: closed.closed ?? [], ...unresolved ? { unresolved } : {} } }
          : { kind: "undone" }
      })
    }, () => ({ kind: "stopped", ...progress }), () => ({ scope, acct: reportingAccount }))
  }

  async function undoRemoval(exec: Execution, record: Undo, scope: Scope, origin: Origin, progress: { completed: number }, authorized: () => boolean): Promise<ExplicitFailure | null> {
    const entry = record.entries[0]
    if (!entry) return null
    const membership = await read(exec, record.acct, scope, entry.video)
    if (membership.kind === "failed") return membership.failure
    if (!holds(membership, entry.playlist)) {
      const [outcome] = await addOne(exec, record.site, record.acct, scope, entry.playlist, entry.video, origin, authorized)
      if (outcome.kind === "failed") return outcome.failure
    }
    record.entries = []
    progress.completed++
    return null
  }

  async function undoAdd(exec: Execution, record: Undo, scope: Scope, progress: { completed: number }, authorized: () => boolean): Promise<ExplicitFailure | null> {
    const first = record.entries[0]
    if (!first) return null
    const membership = await read(exec, record.acct, scope, first.video)
    if (membership.kind === "failed") return membership.failure
    let failure: ExplicitFailure | null = null
    for (const entry of [...record.entries]) {
      const result = lacks(membership, entry.playlist) ? null : await removeOne(exec, record.site, record.acct, scope, entry, authorized)
      if (result) failure ??= result
      else {
        note(scope, [{ kind: "forget", acct: record.acct, playlist: entry.playlist, video: entry.video }], authorities.get(exec))
        record.entries = record.entries.filter(item => item !== entry)
        progress.completed++
      }
    }
    return failure
  }

  async function undoGather(exec: Execution, record: Undo, scope: Scope, progress: { completed: number }, authorized: () => boolean): Promise<ExplicitFailure | null> {
    const first = record.entries[0]
    if (!first) return null
    const membership = await read(exec, record.acct, scope, first.video)
    if (membership.kind === "failed") return membership.failure
    while (record.entries.length) {
      const next = record.entries[0]
      if (!next) break
      if (next.identity.setVideoId === undefined) {
        const fresh = next === first ? membership : await read(exec, record.acct, scope, next.video)
        if (fresh.kind === "failed") return fresh.failure
        const failure = lacks(fresh, next.playlist) ? null : await removeOne(exec, record.site, record.acct, scope, next, authorized)
        if (failure) return failure
        note(scope, [{ kind: "forget", acct: record.acct, playlist: next.playlist, video: next.video }], authorities.get(exec))
        record.entries.shift()
        progress.completed++
        continue
      }
      const chunk: Entry[] = []
      for (const entry of record.entries) {
        if (chunk.length === CHUNK || entry.identity.setVideoId === undefined) break
        chunk.push(entry)
      }
      const setVideoIds = chunk.flatMap(entry => entry.identity.setVideoId === undefined ? [] : [entry.identity.setVideoId])
      const answer = await send(exec, record.acct, scope, () => exec.run.removeBatch({
        job: { kind: "removeBatch", playlistId: next.playlist, setVideoIds }, acct: record.acct
      }), authorized)
      if (answer.kind === "held") return answer.failure
      if (answer.kind === "fact") return observe(exec, record.acct, scope, answer.fact)
      if (!answer.result.ok) return observe(exec, record.acct, scope, failureOf(answer.result))
      progress.completed += answer.result.data.removed
      if (answer.result.data.removed < chunk.length) return "unconfirmed"
      for (const entry of chunk) note(scope, [{ kind: "forget", acct: record.acct, playlist: entry.playlist, video: entry.video }], authorities.get(exec))
      record.entries = record.entries.slice(chunk.length)
    }
    return null
  }

  function batch(request: BatchRequest, origin: Origin) {
    let reportingAccount: AccountKey | null = null
    const videos = [...new Set(request.videos)]
    const outcomes = new Map<VideoId, VideoOutcome>()
    const scope = scopeOf(origin)
    const observed = () => videos.flatMap(video => {
      const outcome = outcomes.get(video)
      return outcome ? [{ video, outcome }] : []
    })
    return track<BatchReport>(async () => {
      const exec = await ports.execution(origin, "www")
      if (!exec) return { kind: "no-tab" }
      const acct = exec.acct
      if (acct === null) return { kind: "signed-out" }
      reportingAccount = acct
      if (request.acct !== undefined && request.acct !== acct) {
        for (const video of videos) outcomes.set(video, { kind: "failed", failure: "account-changed" })
        return { kind: "report", outcomes: observed(), undo: null }
      }
      if (await load()) {
        for (const video of videos) outcomes.set(video, { kind: "failed", failure: "not-sent" })
        return { kind: "report", outcomes: observed(), undo: null }
      }
      if (normal) authorities.set(exec, normal.revision)
      return hold(tuples, videos.map(video => tuple(acct, request.playlist, video)), async (): Promise<BatchReport> => {
        const fail = (list: readonly VideoId[], failure: Failure) => { for (const video of list) outcomes.set(video, { kind: "failed", failure }) }
        const sending: VideoId[] = []
        const checked = (done: number) => { try { request.progress?.(done, videos.length) } catch {} }
        for (const [done, video] of videos.entries()) {
          const stop = blocked(exec, acct, scope)
          if (stop) fail([video], stop)
          else if (isRecent(scope, acct, request.playlist, video)) outcomes.set(video, { kind: "already-in" })
          else {
            const membership = await read(exec, acct, scope, video)
            if (membership.kind === "failed") fail([video], membership.failure)
            else if (membership.kind === "unreadable" && request.auto) fail([video], "membership-unreadable")
            else if (holds(membership, request.playlist)) outcomes.set(video, { kind: "already-in" })
            else {
              sending.push(video)
            }
          }
          checked(done + 1)
        }
        const entries: Entry[] = []
        for (let start = 0; start < sending.length; start += CHUNK) {
          const chunk = sending.slice(start, start + CHUNK)
          const later = sending.slice(start + CHUNK)
          const stop = blocked(exec, acct, scope)
          if (stop) {
            fail([...chunk, ...later], stop)
            break
          }
          const answer = await send(exec, acct, scope, () => exec.run.addBatch({ job: { kind: "addBatch", playlistId: request.playlist, videoIds: chunk }, acct }))
          const failure = answer.kind === "held" ? answer.failure : answer.kind === "fact" ? answer.fact : answer.kind === "result" && !answer.result.ok ? failureOf(answer.result) : null
          if (failure !== null) {
            if (failure === "missing" || failure === "full") mark({ acct, playlist: request.playlist, mark: failure }, origin)
            const seen = observe(exec, acct, scope, failure)
            fail(chunk, seen)
            fail(later, unsent(seen))
            break
          }
          const results = answer.kind === "observed" ? answer.results : answer.kind === "result" && answer.result.ok ? answer.result.data.results : []
          // Normalized observations still have to answer this exact request in its order.
          if (results.length !== chunk.length || results.some((result, index) => result.videoId !== chunk[index])) {
            fail(chunk, "unrecognised")
            fail(later, "not-sent")
            break
          }
          for (const result of results) {
            if ("fact" in result) {
              outcomes.set(result.videoId, result.fact === "duplicate" ? { kind: "already-in" } : { kind: "failed", failure: "refused" })
            } else if (result.setVideoId === undefined) {
              outcomes.set(result.videoId, { kind: "failed", failure: observe(exec, acct, scope, failureOf(result.failure)) })
            } else {
              outcomes.set(result.videoId, { kind: "added" })
              const identity: RemovalIdentity = result.setVideoId !== null ? { setVideoId: result.setVideoId } : { videoId: result.videoId }
              entries.push({ playlist: request.playlist, video: result.videoId, identity })
              note(scope, [{ kind: "recent", tuple: { acct, playlist: request.playlist, video: result.videoId, at: ports.now() } }], authorities.get(exec))
            }
          }
          if (results.some(result => result.setVideoId !== undefined)) mark({ acct, playlist: request.playlist, mark: "clear" }, origin)
        }
        active()
        const plan = request.record ? await request.record(observed()) : null
        active()
        const undo = await keepGather(scope, acct, request.playlist, entries, authorities.get(exec), request.auto, plan)
        return { kind: "report", outcomes: observed(), undo, ...exec.served ? { served: exec.served() } : {} }
      })
    }, () => ({ kind: "stopped", outcomes: observed(), pending: videos.filter(video => !outcomes.has(video)), undo: null }), () => ({ scope, acct: reportingAccount }))
  }

  function pause(paused: boolean) {
    return track<MemoryReport>(async () => (await load()) ?? remember("normal", [{ kind: "pause", paused }]), () => ({ kind: "stopped" }))
  }

  function skip(request: SkipRequest, origin: Origin) {
    const scope = scopeOf(origin)
    return track<MemoryReport>(async () => {
      const revision = scope === "private" ? normal?.revision : undefined
      return (await load()) ?? remember(scope, [request.kind === "skip"
        ? { kind: "skip", acct: request.acct, video: request.video, playlists: request.playlists }
        : { kind: "unskip", acct: request.acct, video: request.video }], revision ?? normal?.revision)
    }, () => ({ kind: "stopped" }))
  }

  function release(handle: UndoHandle): void {
    if (handle.kind !== "gather" && undos.get(handle.id)?.kind === handle.kind) undos.delete(handle.id)
  }

  function readPrivateSkips(request: PrivateSkipRequest): Promise<PrivateSkipRead> {
    const { context, revision } = request
    if (context.tab.incognito !== true || !Number.isSafeInteger(context.tab.tabId) || context.tab.tabId < 0 ||
      !isTabPing(context.info) || !context.info.signedIn || context.info.site !== context.tab.site) {
      return Promise.resolve({ kind: "unavailable", reason: "context" })
    }
    const acct = context.info.acct
    return track<PrivateSkipRead>(async () => {
      if (await load()) return { kind: "unavailable", reason: "session" }
      if (halted) return { kind: "unavailable", reason: "disposed" }
      if (!ports.owner.writable()) return { kind: "unavailable", reason: "held" }
      if (!normal || !sessionAccountCurrent(revision, normal.revision, acct)) return { kind: "unavailable", reason: "revision" }
      const entries = [...privateMemory.skips.get(acct) ?? []]
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([video, skip]): readonly [VideoId, Skip] => [video, skip === "all" ? "all" : [...skip]])
      return { kind: "skips", entries }
    }, () => ({ kind: "unavailable", reason: "disposed" }))
  }

  // The later tab registry calls this when a page load ends. Its toasts and once-per-tab memory end with it.
  function releaseTab(lane: string): void {
    shownTabs.delete(lane)
    tripped.delete(lane)
    for (const key of refused) if (key.startsWith(`${lane} `)) refused.delete(key)
    for (const [id, record] of undos) if (record.lane === lane) undos.delete(id)
  }

  function quiesce(): Promise<void> {
    if (!draining) {
      halted = true
      halt()
      undos.clear()
      revokePrivateSkips()
      privateMemory = emptySessionMemory
      pending.clear()
      draining = Promise.allSettled([...running]).then(() => undefined)
    }
    return draining
  }

  return { add, remove, undo, batch, settle, pause, skip, readPrivateSkips, release, releaseTab, quiesce,
    subscribePrivateSkips(changed, revoked = () => {}) {
      if (halted) { try { revoked() } catch {} return () => {} }
      const registered = (event: PrivateSkipChange) => changed(event)
      const stop = () => revoked()
      privateSkipListeners.add(registered)
      privateSkipRevocations.add(stop)
      return () => { privateSkipListeners.delete(registered); privateSkipRevocations.delete(stop) }
    }
  }
}

// What a failed chunk means for the chunks behind it, which were never sent.
function unsent(failure: ExplicitFailure): ExplicitFailure {
  switch (failure) {
    case "rate-limited": return "paused"
    case "unconfirmed":
    case "unrecognised": return "not-sent"
    default: return failure
  }
}
