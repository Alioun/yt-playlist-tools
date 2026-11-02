import type { JobOf, Origin } from "../../shared/contracts"
import type { AccountKey, PlaylistId, Settings, VideoId } from "../../shared/model"
import { languageTitle, order, videoOf, type GatherAccess, type GatherLanguage, type GatherOrderedVideo } from "../../shared/rules/gather"
import type { Deadline } from "../../shared/rpc/rpc"
import type { AddFlow, BatchOutcomes, BatchRecord, VideoOutcome } from "../add-flow/add-flow"
import { sessionAccountCurrent, type GatherClosedTab, type GatherClosing, type GatherRecord, type SessionEdit, type SessionPort, type SessionRevision } from "../store/session-memory"
import type { GatherNativePort, GatherTab, Requester, Tabs } from "../tabs/ports"

export const PLAYER_LIMIT = 50
export const GATHER_LIMIT = 200
export const CONFIRM_MS = [2_000, 10_000] as const
export const LOAD_MS = [1_000, 3_000, 10_000] as const
export const PROGRESS_MS = 250
export const KEPT_GATHERS = 5
// Automatic gathering takes at most 50 videos a gather; more wait for the next one (YT-GT-27).
export const AUTO_LIMIT = 50

export type Destination = Settings["gather"]["to"]
export type Scope = "normal" | "private"
// The playlist gather's account and its gather playlist, resolved from the account in view of the authenticated popup window.
export type GatherTarget =
  | { readonly kind: "playlist"; readonly acct: AccountKey; readonly playlist: PlaylistId; readonly title: string }
  | { readonly kind: "choose"; readonly acct: AccountKey }
  | { readonly kind: "signed-out" | "no-tab" }
export type GatherPorts = {
  readonly native: GatherNativePort
  readonly addFlow: Pick<AddFlow, "batch" | "undo" | "settle">
  readonly tabs: Pick<Tabs, "runIn">
  // The canonical owner. Normal gathers' records, `paced` and `kept` go through it; a private window's stay in this module's memory.
  readonly session: Pick<SessionPort, "read" | "change">
  settings(): Readonly<Settings["gather"]>
  access(): GatherAccess
  target(req: Requester): Promise<GatherTarget>
  health(to: Destination): "working" | "not-working"
  // The browser's own detection (i18n.detectLanguage) for a title without YouTube's ending or count. Never a character test.
  language(title: string): Promise<GatherLanguage>
  random(): number
  readonly clock: { now(): number; readonly after: Deadline }
  observe(event: GatherEvent): void
}

// The tab automatic gathering saves from and its account's gather playlist (ARC-ACC-73), picked by the triggers.
export type AutomaticServing = { readonly tabId: number; readonly acct: AccountKey; readonly playlist: PlaylistId; readonly title: string }
export type AutomaticRun = { readonly windowId: number; readonly tabIds: readonly number[]; readonly serving: AutomaticServing }

export type Failed = { readonly video: VideoId; readonly failure: Extract<VideoOutcome, { kind: "failed" }>["failure"] }
// `auto` marks a gather automatic gathering ran (YT-GT-22). `served` is the tab a playlist gather saved from, where its toast shows.
export type GatherResult = { readonly id: string; readonly windowId: number; readonly scope: Scope; readonly at: number; readonly auto?: true } & (
  | { readonly kind: "off" | "busy" | "no-videos" | "unavailable" | "stopped" | "signed-out" | "no-tab" }
  | { readonly kind: "choose"; readonly acct: AccountKey }
  | { readonly kind: "unhealthy"; readonly to: Destination }
  | { readonly kind: "player"; readonly count: number; readonly confirmed: boolean; readonly closed: number; readonly navigated: number; readonly unconfirmed?: number }
  | { readonly kind: "queue"; readonly count: number; readonly why: "chosen" | "player-takes-50"; readonly left: number
      readonly outcome: "confirmed" | "not-loaded" | "not-confirmed"; readonly closed: number; readonly navigated: number; readonly unconfirmed?: number }
  | { readonly kind: "playlist"; readonly acct: AccountKey; readonly playlist: PlaylistId; readonly title: string
      readonly saved: number; readonly already: number; readonly failed: readonly Failed[]; readonly closed: number; readonly navigated: number
      readonly kept: boolean; readonly undo: string | null; readonly retry: boolean; readonly unconfirmed?: number; readonly served?: number })
// `unconfirmed` counts tabs the one remove call may not have closed: still open or unreadable afterwards. `unopened` counts tabs Undo could not reopen.
export type GatherUndoResult =
  | { readonly kind: "undone"; readonly reopened: number; readonly unopened?: number }
  | { readonly kind: "undo-failed" | "expired" | "no-tab" | "signed-out" | "stopped" }
export type GatherEvent =
  | { readonly kind: "progress"; readonly id: string; readonly windowId: number; readonly scope: Scope; readonly done: number; readonly total: number }
  | { readonly kind: "result"; readonly result: GatherResult }
  | { readonly kind: "undo"; readonly id: string; readonly scope: Scope; readonly result: GatherUndoResult }
  | { readonly kind: "signal"; readonly scope: Scope; readonly destination: "player"; readonly signal: "no-effect" }
// `history` is the canonical record for the normal realm, so it survives a worker restart; `last` is this worker's own results.
export type GatherState = { readonly last: readonly GatherResult[]; readonly undoable: readonly string[]; readonly kept: readonly number[]; readonly history: readonly GatherRecord[] }

export type Gather = {
  now(req: Requester): Promise<GatherResult>
  // An automatic gather of the tabs the triggers picked: into the serving account's gather playlist, always closing what it saved.
  automatic(run: AutomaticRun): Promise<GatherResult>
  retry(id: string, req: Requester): Promise<GatherResult>
  undo(id: string, req: Requester): Promise<GatherUndoResult>
  last(scope: Scope): Promise<GatherState>
  // The activation seam DATA-58 needs: a reopened tab the user switched to leaves `kept`. No trigger calls it yet.
  activated(tabId: number, scope: Scope): Promise<void>
  dispose(): void
}

type Source = { readonly tab: GatherTab; readonly video: VideoId }
type Retry = { readonly acct: AccountKey; readonly playlist: PlaylistId; readonly revision: SessionRevision; readonly videos: readonly VideoId[]; readonly sources: readonly Source[] }
type Planned = GatherClosing & { readonly windowId: number }
type Closing = { readonly plan: readonly Planned[]; readonly navigated: number }
type Closed = { readonly closed: readonly GatherClosedTab[]; readonly navigated: number; readonly unconfirmed: number }

const patterns = (access: GatherAccess) => [
  ...access.www ? ["https://www.youtube.com/watch*", "https://www.youtube.com/live/*"] : [],
  ...access.music && access.musicSection ? ["https://music.youtube.com/watch*"] : []
]
const scopeOf = (req: Requester): Scope => req.incognito ? "private" : "normal"
const originOf = (req: Requester): Origin => ({ kind: "ui", windowId: req.windowId, incognito: req.incognito })
const watchUrl = (video: VideoId) => `https://www.youtube.com/watch?v=${video}`
const listUrl = (videos: readonly VideoId[]) => `https://www.youtube.com/watch_videos?video_ids=${videos.join(",")}`

// YouTube's temporary list is confirmed only by the new tab's own address naming a list, never by the create callback.
function showsList(url: string): boolean {
  try {
    const address = new URL(url)
    return address.hostname === "www.youtube.com" && address.pathname === "/watch" && (address.searchParams.get("list") ?? "") !== ""
  } catch { return false }
}

export function createGather(ports: GatherPorts): Gather {
  const instance = `${ports.clock.now()}:${Math.floor(ports.random() * 1e9)}`
  let serial = 0
  let disposed = false
  const busy = new Set<number>()
  const timers = new Set<() => void>()
  const results: Record<Scope, GatherResult[]> = { normal: [], private: [] }
  const retries = new Map<string, Retry & { scope: Scope }>()
  const kept: Record<Scope, Set<number>> = { normal: new Set(), private: new Set() }

  function emit(event: GatherEvent): void {
    if (disposed) return
    try { ports.observe(event) } catch {}
  }
  function finish(result: GatherResult): GatherResult {
    if (disposed) return result
    const list = results[result.scope]
    list.unshift(result)
    list.splice(KEPT_GATHERS)
    emit({ kind: "result", result })
    return result
  }
  // One-shot checks set together; the first decisive answer cancels the rest, and disposal cancels all of them.
  function checks<T>(delays: readonly number[], check: () => Promise<T | null>, none: T): Promise<T> {
    return new Promise(resolve => {
      let settled = false, left = delays.length
      const cancels: (() => void)[] = []
      const done = (value: T) => {
        if (settled) return
        settled = true
        for (const cancel of cancels) { cancel(); timers.delete(cancel) }
        timers.delete(stop)
        resolve(value)
      }
      const stop = () => done(none)
      timers.add(stop)
      for (const ms of delays) {
        const cancel = ports.clock.after(ms, () => {
          if (settled) return
          void check().then(found => {
            left--
            if (found !== null) done(found)
            else if (left === 0) done(none)
          }, () => { left--; if (left === 0) done(none) })
        })
        cancels.push(cancel)
        timers.add(cancel)
      }
    })
  }

  async function capture(req: Requester): Promise<readonly Source[] | null> {
    const access = ports.access()
    const queried = await ports.native.queryVideos(req.windowId, patterns(access))
    if (queried.kind !== "tabs") return null
    return queried.tabs.flatMap(tab => {
      const video = tab.windowId === req.windowId && tab.incognito === req.incognito ? videoOf(tab.url, access) : null
      return video ? [{ tab, video }] : []
    })
  }

  async function arrange(sources: readonly Source[]): Promise<readonly GatherOrderedVideo[]> {
    const gatherOrder = ports.settings().order
    const languages = new Map<number, GatherLanguage>()
    if (gatherOrder === "english" || gatherOrder === "non-english") {
      for (const { tab } of sources) languages.set(tab.tabId, await ports.language(languageTitle(tab.title)))
    }
    return order(sources.map(({ tab, video }) => ({ id: tab.tabId, index: tab.index, video, lastAccessed: tab.lastAccessed })), gatherOrder, languages, ports.random)
  }

  // A tab closes only while it still shows the video it was gathered for, in the window it was gathered from.
  async function recheck(sources: readonly Source[], videos: ReadonlySet<VideoId>): Promise<Closing> {
    const access = ports.access()
    const plan: Planned[] = []
    let navigated = 0
    for (const { tab, video } of [...sources].sort((a, b) => a.tab.index - b.tab.index)) {
      if (!videos.has(video)) continue
      const now = await ports.native.read(tab.tabId)
      if (now.kind !== "tab" || now.tab.windowId !== tab.windowId || videoOf(now.tab.url, access) !== video) { navigated++; continue }
      plan.push({ tabId: tab.tabId, video, windowId: tab.windowId, tab: { url: now.tab.url, index: now.tab.index, title: now.tab.title } })
    }
    return { plan, navigated }
  }

  // Each tab is read again right before the one remove call, and again after it. Only a tab read back as gone is closed:
  // a tab still open, navigated or unreadable afterwards is not, and no removal is ever retried.
  async function close(closing: Closing, served: number | null = null): Promise<Closed> {
    const access = ports.access()
    const still: Planned[] = []
    let navigated = closing.navigated, unconfirmed = 0
    for (const planned of closing.plan) {
      if (disposed) break
      const now = await ports.native.read(planned.tabId)
      if (now.kind === "tab" && now.tab.windowId === planned.windowId && videoOf(now.tab.url, access) === planned.video) still.push(planned)
      else if (now.kind === "unavailable") unconfirmed++
      else navigated++
    }
    // A serving source tab closes last, in the same call.
    const ordered = [...still.filter(({ tabId }) => tabId !== served), ...still.filter(({ tabId }) => tabId === served)]
    const [first, ...rest] = ordered.map(({ tabId }) => tabId)
    if (first === undefined || disposed) return { closed: [], navigated, unconfirmed: unconfirmed + (disposed ? still.length : 0) }
    try { await ports.native.remove([first, ...rest]) } catch {}
    const closed: GatherClosedTab[] = []
    for (const planned of ordered) {
      const after = await ports.native.read(planned.tabId)
      if (after.kind === "gone") closed.push(planned.tab)
      else unconfirmed++
    }
    return { closed: [...closed].sort((a, b) => a.index - b.index), navigated, unconfirmed }
  }
  const nothingClosed = (closing: Closing): Closed => ({ closed: [], navigated: closing.navigated, unconfirmed: 0 })

  // A normal gather's record goes through the canonical owner under the revision read when it began; a private one never leaves memory.
  async function write(scope: Scope, revision: SessionRevision | null, edit: SessionEdit): Promise<boolean> {
    if (scope !== "normal" || revision === null || disposed) return false
    try {
      const written = await ports.session.change({ revision, now: ports.clock.now(), edits: [edit] })
      return written.kind === "committed"
    } catch { return false }
  }
  async function revisionNow(scope: Scope): Promise<SessionRevision | null> {
    if (scope !== "normal") return null
    const read = await ports.session.read()
    return read.kind === "memory" ? read.revision : null
  }
  const revisions = new WeakMap<Base, SessionRevision | null>()
  async function sent(base: Base, to: "player" | "queue", count: number): Promise<void> {
    if (count === 0) return
    await write(base.scope, revisions.get(base) ?? null, { kind: "gather-sent", record: { id: base.id, at: base.at, auto: false, to, windowId: base.windowId, count } })
  }

  async function player(base: Base, ordered: readonly GatherOrderedVideo[], sources: readonly Source[]): Promise<GatherResult> {
    const videos = ordered.map(({ video }) => video)
    const created = await ports.native.create({ windowId: base.windowId, url: listUrl(videos), active: true })
    if (created.kind !== "created") return { ...base, kind: "player", count: videos.length, confirmed: false, closed: 0, navigated: 0 }
    const confirmed = await checks(CONFIRM_MS, async () => {
      const read = await ports.native.read(created.tabId)
      return read.kind === "tab" && showsList(read.tab.url) ? true : null
    }, false)
    if (disposed) return { ...base, kind: "stopped" }
    if (!confirmed) {
      emit({ kind: "signal", scope: base.scope, destination: "player", signal: "no-effect" })
      return { ...base, kind: "player", count: videos.length, confirmed, closed: 0, navigated: 0 }
    }
    await sent(base, "player", videos.length)
    if (!ports.settings().close) return { ...base, kind: "player", count: videos.length, confirmed, closed: 0, navigated: 0 }
    const done = await close(await recheck(sources, new Set(videos)))
    return { ...base, kind: "player", count: videos.length, confirmed, closed: done.closed.length, navigated: done.navigated,
      ...done.unconfirmed ? { unconfirmed: done.unconfirmed } : {} }
  }

  async function queue(base: Base, req: Requester, ordered: readonly GatherOrderedVideo[], sources: readonly Source[], why: "chosen" | "player-takes-50"): Promise<GatherResult> {
    const taken = ordered.slice(0, GATHER_LIMIT)
    const left = ordered.slice(GATHER_LIMIT).reduce((count, { tabIds }) => count + tabIds.length, 0)
    const [first, ...rest] = taken.map(({ video }) => video)
    const report = (outcome: "confirmed" | "not-loaded" | "not-confirmed", done: Closed = { closed: [], navigated: 0, unconfirmed: 0 }): GatherResult =>
      ({ ...base, kind: "queue", count: taken.length, why, left, outcome, closed: done.closed.length, navigated: done.navigated,
        ...done.unconfirmed ? { unconfirmed: done.unconfirmed } : {} })
    if (first === undefined) return { ...base, kind: "no-videos" }
    const created = await ports.native.create({ windowId: base.windowId, url: watchUrl(first), active: true })
    if (created.kind !== "created") return report("not-loaded")
    const loaded = await checks(LOAD_MS, async () => {
      const read = await ports.native.read(created.tabId)
      return read.kind === "tab" && read.status === "complete" && videoOf(read.tab.url, ports.access()) === first ? true : null
    }, false)
    if (disposed) return { ...base, kind: "stopped" }
    if (!loaded) return report("not-loaded")
    if (rest.length) {
      const answer = await ports.tabs.runIn<JobOf<"queueAddList">>(created.tabId, { job: { kind: "queueAddList", videoIds: rest } }, { site: "www", req, account: { kind: "any" } })
      if (disposed) return { ...base, kind: "stopped" }
      // Only the queue panel's own data holding every submitted occurrence confirms; a delivered call or a partial count does not.
      const whole = answer.kind === "result" && answer.result.ok && answer.result.data.confirmed && answer.result.data.count === rest.length
      if (!whole) return report("not-confirmed")
    }
    await sent(base, "queue", taken.length)
    if (!ports.settings().close) return report("confirmed")
    return report("confirmed", await close(await recheck(sources, new Set(taken.map(({ video }) => video)))))
  }

  async function playlist(base: Base, origin: Origin, sources: readonly Source[], videos: readonly VideoId[],
    target: Extract<GatherTarget, { kind: "playlist" }>): Promise<GatherResult> {
    const scope = base.scope
    const auto = base.auto === true
    const titles = new Map<VideoId, string>()
    for (const { tab, video } of sources) if (!titles.has(video)) titles.set(video, languageTitle(tab.title))
    let closing: Closing = { plan: [], navigated: 0 }
    let lastProgress = -Infinity
    const progress = (done: number, total: number) => {
      const now = ports.clock.now()
      if (done !== total && now - lastProgress < PROGRESS_MS) return
      lastProgress = now
      emit({ kind: "progress", id: base.id, windowId: base.windowId, scope, done, total })
    }
    const record = async (outcomes: BatchOutcomes): Promise<BatchRecord> => {
      const settled = new Set(outcomes.flatMap(({ video, outcome }) => outcome.kind === "added" || outcome.kind === "already-in" ? [video] : []))
      closing = auto || ports.settings().close ? await recheck(sources, settled) : closing
      const [firstAdded, ...moreAdded] = outcomes.flatMap(({ video, outcome }) => outcome.kind === "added" ? [{ id: video, title: titles.get(video) ?? "" }] : [])
      const recent: BatchRecord["recent"] = firstAdded ? { playlist: { id: target.playlist, title: target.title }, videos: [firstAdded, ...moreAdded] } : null
      // Only YouTube refusing a video is taken as lasting here. Which other failures are lasting is the automatic unit's open rule.
      const refused = outcomes.flatMap(({ video, outcome }) => outcome.kind === "failed" && outcome.failure === "refused" ? [video] : [])
      return { windowId: base.windowId, closed: closing.plan.map(({ tab }) => tab), recent,
        closing: closing.plan.map(({ tabId, video, tab }) => ({ tabId, video, tab })), ...refused.length ? { refused } : {} }
    }
    const report = await ports.addFlow.batch({ playlist: target.playlist, videos, auto, acct: target.acct, progress, record }, origin)
    if (disposed || report.kind === "stopped") return { ...base, kind: "stopped" }
    if (report.kind === "signed-out" || report.kind === "no-tab") return { ...base, kind: report.kind }
    const count = (kind: VideoOutcome["kind"]) => report.outcomes.filter(({ outcome }) => outcome.kind === kind).length
    const failed = report.outcomes.flatMap(({ video, outcome }) => outcome.kind === "failed" ? [{ video, failure: outcome.failure }] : [])
    // Tabs close only once the record that can reopen them is remembered. With nothing planned to close, no record is needed.
    const keptRecord = report.undo !== null || closing.plan.length === 0
    const done = keptRecord ? await close(closing, report.served ?? null) : nothingClosed(closing)
    let settledRecord = true
    if (report.undo && closing.plan.length && !disposed) {
      const settledWrite = await ports.addFlow.settle(report.undo, done.closed, origin)
      settledRecord = settledWrite.kind === "remembered"
    }
    const id = report.undo?.id ?? base.id
    if (failed.length) {
      const read = await ports.session.read()
      const failing = new Set(failed.map(({ video }) => video))
      if (read.kind === "memory" && !disposed) retries.set(id, { scope, acct: target.acct, playlist: target.playlist, revision: read.revision,
        videos: failed.map(({ video }) => video), sources: sources.filter(({ video }) => failing.has(video)) })
    }
    return { ...base, id, kind: "playlist", acct: target.acct, playlist: target.playlist, title: target.title, saved: count("added"), already: count("already-in"),
      failed, closed: done.closed.length, navigated: done.navigated, kept: keptRecord && settledRecord, undo: report.undo?.id ?? null, retry: retries.has(id),
      ...done.unconfirmed ? { unconfirmed: done.unconfirmed } : {}, ...typeof report.served === "number" ? { served: report.served } : {} }
  }

  type Base = { readonly id: string; readonly windowId: number; readonly scope: Scope; readonly at: number; readonly auto?: true }

  async function run(req: Requester, work: (base: Base) => Promise<GatherResult>, auto = false): Promise<GatherResult> {
    const base: Base = { id: `${instance}:${++serial}`, windowId: req.windowId, scope: scopeOf(req), at: ports.clock.now(), ...auto ? { auto: true } : {} }
    if (disposed) return { ...base, kind: "stopped" }
    if (busy.has(req.windowId)) return { ...base, kind: "busy" }
    busy.add(req.windowId)
    try {
      revisions.set(base, await revisionNow(base.scope))
      return finish(await work(base))
    } finally {
      busy.delete(req.windowId)
    }
  }

  function now(req: Requester): Promise<GatherResult> {
    return run(req, async base => {
      const settings = ports.settings()
      if (!settings.on) return { ...base, kind: "off" }
      const sources = await capture(req)
      if (disposed) return { ...base, kind: "stopped" }
      if (!sources) return { ...base, kind: "unavailable" }
      if (!sources.length) return { ...base, kind: "no-videos" }
      const ordered = await arrange(sources)
      const to: Destination = settings.to === "player" && ordered.length > PLAYER_LIMIT ? "queue" : settings.to
      if (ports.health(to) === "not-working") return { ...base, kind: "unhealthy", to }
      if (to === "player") return player(base, ordered, sources)
      if (to === "queue") return queue(base, req, ordered, sources, settings.to === "player" ? "player-takes-50" : "chosen")
      const target = await ports.target(req)
      if (disposed) return { ...base, kind: "stopped" }
      if (target.kind === "choose") return { ...base, kind: "choose", acct: target.acct }
      if (target.kind !== "playlist") return { ...base, kind: target.kind }
      return playlist(base, originOf(req), sources, ordered.map(({ video }) => video), target)
    })
  }

  // Automatic gathering never runs in a private window, and saves from the tab the triggers picked, as that tab's account.
  function automatic(job: AutomaticRun): Promise<GatherResult> {
    const req: Requester = { windowId: job.windowId, incognito: false, activeTabId: null }
    return run(req, async base => {
      if (!ports.settings().on) return { ...base, kind: "off" }
      const picked = new Set(job.tabIds)
      const captured = await capture(req)
      if (disposed) return { ...base, kind: "stopped" }
      if (!captured) return { ...base, kind: "unavailable" }
      const sources = captured.filter(({ tab }) => picked.has(tab.tabId) && tab.tabId !== job.serving.tabId)
      if (!sources.length) return { ...base, kind: "no-videos" }
      const videos = (await arrange(sources)).slice(0, AUTO_LIMIT).map(({ video }) => video)
      if (ports.health("playlist") === "not-working") return { ...base, kind: "unhealthy", to: "playlist" }
      const taken = new Set(videos)
      return playlist(base, { kind: "tab", tabId: job.serving.tabId, incognito: false }, sources.filter(({ video }) => taken.has(video)), videos,
        { kind: "playlist", ...job.serving })
    }, true)
  }

  function retry(id: string, req: Requester): Promise<GatherResult> {
    return run(req, async base => {
      const scope = scopeOf(req)
      const found = retries.get(id)
      if (!found || found.scope !== scope) return { ...base, kind: "unavailable" }
      retries.delete(id)
      const read = await ports.session.read()
      if (disposed) return { ...base, kind: "stopped" }
      if (read.kind !== "memory" || !sessionAccountCurrent(found.revision, read.revision, found.acct)) return { ...base, kind: "unavailable" }
      if (ports.health("playlist") === "not-working") return { ...base, kind: "unhealthy", to: "playlist" }
      const target = await ports.target(req)
      if (target.kind !== "playlist" || target.acct !== found.acct || target.playlist !== found.playlist) {
        return target.kind === "playlist" ? { ...base, kind: "unavailable" } : target.kind === "choose" ? { ...base, kind: "choose", acct: target.acct } : { ...base, kind: target.kind }
      }
      return playlist(base, originOf(req), found.sources, found.videos, target)
    })
  }

  // A plan whose after-close readback was never saved, because the worker stopped or the save failed: each planned tab whose ID
  // no longer exists was closed. A tab still open is left as it is, so nothing is reopened twice. An unreadable one is not reopened.
  async function reconcile(plan: readonly GatherClosing[]): Promise<{ readonly gone: readonly GatherClosedTab[]; readonly unreadable: number }> {
    const gone: GatherClosedTab[] = []
    let unreadable = 0
    for (const { tabId, tab } of plan) {
      const now = await ports.native.read(tabId)
      if (now.kind === "gone") gone.push(tab)
      else if (now.kind === "unavailable") unreadable++
    }
    return { gone, unreadable }
  }

  // One background tab per closed tab, in their old order and places; if the window has closed, one new unfocused window holds the rest.
  async function reopen(windowId: number, closed: readonly GatherClosedTab[]): Promise<{ readonly tabIds: readonly number[]; readonly unopened: number }> {
    const ordered = [...closed].sort((a, b) => a.index - b.index)
    const tabIds: number[] = []
    let unopened = 0
    for (const [at, tab] of ordered.entries()) {
      if (disposed) return { tabIds, unopened: unopened + ordered.length - at }
      const created = await ports.native.create({ windowId, url: tab.url, active: false, index: tab.index }, { title: tab.title })
      if (created.kind === "created") { tabIds.push(created.tabId); continue }
      if (created.kind !== "window-gone") { unopened++; continue }
      const rest = ordered.slice(at)
      const [first, ...more] = rest.map(({ url }) => url)
      if (first === undefined) break
      const made = await ports.native.createWindow([first, ...more])
      if (made.kind === "created") { tabIds.push(...made.tabIds); unopened += Math.max(0, rest.length - made.tabIds.length) }
      else unopened += rest.length
      break
    }
    return { tabIds, unopened }
  }

  async function undo(id: string, req: Requester): Promise<GatherUndoResult> {
    const scope = scopeOf(req)
    const answer = async (): Promise<GatherUndoResult> => {
      if (disposed) return { kind: "stopped" }
      const revision = await revisionNow(scope)
      const report = await ports.addFlow.undo({ kind: "gather", id }, originOf(req))
      if (disposed || report.kind === "stopped") return { kind: "stopped" }
      if (report.kind === "expired" || report.kind === "no-tab" || report.kind === "signed-out") return { kind: report.kind }
      // A failed or partial removal reopens nothing.
      if (report.kind !== "undone") return { kind: "undo-failed" }
      retries.delete(id)
      if (!report.reopen) return { kind: "undone", reopened: 0 }
      const planned = await reconcile(report.reopen.closing ?? [])
      const opened = await reopen(report.reopen.windowId, [...report.reopen.closed, ...planned.gone])
      for (const tabId of opened.tabIds) kept[scope].add(tabId)
      // Reopened tabs stay out of automatic gathering until switched to, across a worker restart too.
      const [first] = opened.tabIds
      if (first !== undefined) await write(scope, revision, { kind: "gather-kept", add: opened.tabIds, remove: [] })
      const unopened = opened.unopened + planned.unreadable
      return { kind: "undone", reopened: opened.tabIds.length, ...unopened ? { unopened } : {} }
    }
    const result = await answer()
    emit({ kind: "undo", id, scope, result })
    return result
  }

  async function last(scope: Scope): Promise<GatherState> {
    const own = results[scope]
    let undoable = own.flatMap(result => result.kind === "playlist" && result.undo ? [result.undo] : [])
    let history: readonly GatherRecord[] = []
    const keptIds = new Set(kept[scope])
    if (scope === "normal") {
      // A restarted worker recognises the normal gathers, their Undo and the reopened tabs from the canonical session record.
      const read = await ports.session.read()
      if (read.kind === "memory") {
        history = read.memory.gather.last
        undoable = history.flatMap(record => record.kind === "sent" ? [] : [record.record.id])
        for (const tabId of read.memory.gather.kept) keptIds.add(tabId)
      }
    }
    return { last: [...own], undoable, kept: [...keptIds], history }
  }

  async function activated(tabId: number, scope: Scope): Promise<void> {
    if (disposed) return
    kept[scope].delete(tabId)
    if (scope !== "normal") return
    const read = await ports.session.read()
    if (read.kind !== "memory" || !read.memory.gather.kept.has(tabId)) return
    await write(scope, read.revision, { kind: "gather-kept", add: [], remove: [tabId] })
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    for (const stop of [...timers]) stop()
    timers.clear()
    retries.clear()
    results.normal = []
    results.private = []
    kept.normal.clear()
    kept.private.clear()
  }

  return { now, automatic, retry, undo, last, activated, dispose }
}
