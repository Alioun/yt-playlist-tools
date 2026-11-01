import {
  isJob, isJobFailureFor, isJsonValue, isStreamData, makeShapeOutline, supportsJob, supportsStream
} from "../shared/contracts"
import type {
  BreakageSignal, DiagnosticVocabulary, Job, JobFailure, JobFailureFor, JobId, JobOf, NavData, ProbeReport, Site, Stream, StreamData, WatchId
} from "../shared/contracts"
import { isPageJobResultFor } from "../shared/contracts/page"
import type { PageAccountData, PageJobData, PageJobResult } from "../shared/contracts/page"
import type { PageGatewayOperations } from "./channel"
import type { PageEvent, PageRead, PageReadPort } from "./read-port"
import { readRoutes, readVocabulary, readWatches } from "./read-port"
import {
  field, parseChannel, parseItem, parseNavigation, parseMusicPlayback, parsePlayer, parseQueue,
  parseTargetVideo, parseVideoResponse
} from "./read-parsers"
import type { Navigation } from "./read-parsers"
import { wwwRoutes } from "./routes/www"
import { musicRoutes } from "./routes/music"
import { handlerWatches, musicHandlers, requestWatches, vocabularyFor } from "./gateway/port"
import type { GatewayRequestPort, HandlerRoute, PageUiRoute, RequestRoute, RequestSpec, RouteTable } from "./gateway/port"
import { createLanes, systemClock } from "./gateway/lanes"
import type { GatewayClock, JobScope } from "./gateway/lanes"
import { createAccountGuard } from "./gateway/account"
import { requestFor, isWrite, needsAccount } from "./gateway/requests"
import { attempt } from "./gateway/attempt"
import { requestAnswer } from "./gateway/answers"
import type { AnswerStep, ParsedJob } from "./gateway/answers"
import { answerFailure } from "./parsers/playlists"
import { createWwwQueue } from "./gateway/www-queue"
import type { WwwQueuePort } from "./gateway/www-queue"
import { createMusicContext, createMusicQueue } from "./gateway/music-queue"
import type { MusicPagePort } from "./gateway/music-queue"
import { createMusicQueueEdits } from "./gateway/music-queue-edit"
import { createMusicLibrary } from "./gateway/music-library"

type ReadJobId = keyof typeof readRoutes
type ReadContext = { job: Job; target?: Element }
type ReadRoute<K extends ReadJobId> = {
  id: typeof readRoutes[K]
  read(context: ReadContext): PageJobData<JobOf<K>> | JobFailureFor<JobOf<K>> | undefined
}
type StreamSlot = {
  subscribers: Set<(raw: unknown) => void>
  stop: (() => void) | undefined
}
type PageLoadAccount = { kind: "known"; data: PageAccountData } | { kind: "unavailable" }
type QueueJobId = "queueAdd" | "queueUndo" | "queueAddList" | "openCardMenu"
const queueJobs: readonly QueueJobId[] = ["queueAdd", "queueUndo", "queueAddList", "openCardMenu"]
type MusicJobId = "queueInsert" | "queueRemove" | "queueRemoveIds" | "queueMove" | "queueReinsert" | "like" | "library" | "navigate"
const musicJobs: readonly MusicJobId[] = ["queueInsert", "queueRemove", "queueRemoveIds", "queueMove", "queueReinsert", "like", "library", "navigate"]

export interface ReadGateway extends PageGatewayOperations {
  readonly disposed: boolean
  readonly vocabulary: DiagnosticVocabulary
  onSignal(listener: (signal: BreakageSignal) => void): () => void
  dispose(): void
}

export function createGateway(options: {
  site: Site; page: PageReadPort; requests?: GatewayRequestPort; queue?: WwwQueuePort; music?: MusicPagePort; clock?: GatewayClock;
  signals?: (signal: BreakageSignal) => void; now?: () => number
}): ReadGateway {
  const { site, page } = options
  const now = options.now ?? Date.now
  const clock = options.clock ?? { ...systemClock, now }
  const lanes = createLanes(clock)
  const table: RouteTable = site === "www" ? wwwRoutes : musicRoutes
  const vocabulary = options.requests || options.queue || options.music ? vocabularyFor(table) : readVocabulary
  const lastPrivacy = new Map<string, "PRIVATE" | "UNLISTED" | "PUBLIC" | undefined>()
  const signalSinks = new Set<(signal: BreakageSignal) => void>()
  if (options.signals) signalSinks.add(options.signals)
  const slots: Record<Stream, StreamSlot> = {
    nav: { subscribers: new Set(), stop: undefined }, player: { subscribers: new Set(), stop: undefined },
    nowPlaying: { subscribers: new Set(), stop: undefined }, queue: { subscribers: new Set(), stop: undefined }
  }
  let disposed = false
  let confirmedMiniplayerVideo: unknown

  function stamp(): number {
    try { const at = now(); return Number.isSafeInteger(at) && at >= 0 ? at : 0 } catch { return 0 }
  }
  function signal(kind: "missing" | "threw" | "unrecognised", watchId: WatchId, job: JobId | null, raw?: unknown): void {
    if (disposed) return
    const at = stamp()
    const event: BreakageSignal = {
      site, feature: null, job, route: job !== null && job in readRoutes ? routeId(job) : null,
      kind, watchId, shape: kind === "unrecognised" ? makeShapeOutline(isJsonValue(raw) ? raw : null, readVocabulary.schemaKeys) : null,
      clientVersion: null, pageType: "other", count: 1, firstSeen: at, lastSeen: at
    }
    for (const sink of [...signalSinks]) {
      if (!signalSinks.has(sink) || disposed) continue
      try { sink(event) } catch {}
    }
  }
  function routeId(job: JobId) {
    return isReadJob(job) ? readRoutes[job] : null
  }
  function read(what: PageRead, job: JobId | null = null, target?: Element): unknown {
    try {
      const value = page.read(what, target)
      if (value === undefined) signal("missing", readWatches[what], job)
      return value
    } catch { signal("threw", readWatches[what], job); return undefined }
  }
  function parsed<T>(watchId: WatchId, raw: unknown, job: JobId | null, parse: () => T | undefined): T | undefined {
    try {
      const value = parse()
      if (value === undefined && raw !== undefined) signal("unrecognised", watchId, job, raw)
      return value
    } catch { signal("threw", watchId, job); return undefined }
  }
  function pinAccount(): PageLoadAccount {
    try {
      const loggedIn = page.config("LOGGED_IN")
      if (loggedIn === false) return { kind: "known", data: { signedIn: false, datasyncId: null } }
      const id = page.config("DATASYNC_ID")
      if (loggedIn === true && typeof id === "string" && id.length > 0) return { kind: "known", data: { signedIn: true, datasyncId: id } }
      signal("missing", readWatches.identity, "account")
    } catch { signal("threw", readWatches.identity, "account") }
    return { kind: "unavailable" }
  }
  const account = pinAccount()
  const guard = createAccountGuard(page, account.kind === "known" ? account.data : undefined)

  function requestSignal(kind: BreakageSignal["kind"], route: RequestRoute | PageUiRoute | HandlerRoute, job: JobId, raw?: unknown): void {
    if (disposed) return
    const at = stamp()
    const event: BreakageSignal = {
      site, feature: null, job, route: route.id, kind, watchId: route.watchId,
      shape: kind === "unrecognised" ? makeShapeOutline(isJsonValue(raw) ? raw : null, vocabulary.schemaKeys) : null,
      clientVersion: null, pageType: "other", count: 1, firstSeen: at, lastSeen: at
    }
    for (const sink of [...signalSinks]) {
      if (disposed || !signalSinks.has(sink)) continue
      try { sink(event) } catch {}
    }
  }
  function commandRoute(job: QueueJobId): RequestRoute | undefined {
    return table[job].find((route): route is RequestRoute => route.kind === "request" && route.via === "command")
  }
  function queueRoutes() {
    const add = commandRoute("queueAdd"), undo = commandRoute("queueUndo"), list = commandRoute("queueAddList")
    const menu = table.openCardMenu.find((route): route is PageUiRoute => route.kind === "page-ui")
    return add && undo && list && menu ? { add, undo, list, menu } : undefined
  }
  const routesForQueue = site === "www" ? queueRoutes() : undefined
  const queue = options.queue && routesForQueue ? createWwwQueue({
    port: options.queue, clock, routes: routesForQueue,
    card: target => page.read("targetData", target),
    check: () => guard.check(false),
    notice(kind, route, raw) {
      requestSignal(kind, route, queueJobs.find(id => table[id].some(entry => entry.id === route.id)) ?? "queueAdd", raw)
    }
  }) : undefined
  async function queueJob(job: JobOf<QueueJobId>, target: Element | undefined): Promise<PageJobResult> {
    if (!queue) return { ok: false, reason: "unavailable" }
    const blocked = guard.check(needsAccount(job))
    if (blocked) return blocked
    switch (job.kind) {
      case "openCardMenu": return queue.menu(job, target)
      case "queueAdd": return lanes.run("app-state", scope => queue.add(target, scope))
      case "queueUndo": return lanes.run("app-state", scope => queue.undo(job, scope))
      case "queueAddList": return lanes.run("app-state", scope => queue.addList(job, scope))
    }
  }
  const musicContext = site === "music" && options.music ? createMusicContext({
    port: options.music, page, clock, table,
    casting: () => routes.castState.read()?.casting === true,
    notice(kind, route, raw) {
      requestSignal(kind, route, musicJobs.find(id => table[id].some(entry => entry.id === route.id)) ?? "queueInsert", raw)
    }
  }) : undefined
  const music = musicContext ? {
    ...createMusicQueue(musicContext), ...createMusicQueueEdits(musicContext),
    ...createMusicLibrary(musicContext, {
      item: target => routes.itemInfo.read({ job: { kind: "itemInfo" }, target }),
      location: () => read("location")
    })
  } : undefined
  async function musicJob(job: JobOf<MusicJobId>, target: Element | undefined): Promise<PageJobResult> {
    if (!music) return { ok: false, reason: "unavailable" }
    const blocked = guard.check(needsAccount(job))
    if (blocked) return blocked
    return lanes.run("app-state", async (scope): Promise<PageJobResult> => {
      const result = await musicStep(music, job, target, scope)
      return guard.check(needsAccount(job)) ?? result
    })
  }
  function musicStep(jobs: NonNullable<typeof music>, job: JobOf<MusicJobId>, target: Element | undefined, scope: JobScope): Promise<PageJobResult> {
    switch (job.kind) {
      case "queueInsert": return jobs.insert(job, scope)
      case "queueRemove": return jobs.remove(job, scope)
      case "queueRemoveIds": return jobs.removeIds(job, scope)
      case "queueMove": return jobs.move(job, scope)
      case "queueReinsert": return jobs.reinsert(job, scope)
      case "like": return jobs.like(job, scope)
      case "library": return jobs.library(job, target)
      case "navigate": return jobs.navigate(job, scope)
    }
  }
  async function send(job: Job, spec: RequestSpec, scope: JobScope): Promise<AnswerStep> {
    const candidates = table[job.kind].filter((route): route is RequestRoute => route.kind === "request")
    const fail = (failure: JobFailure): AnswerStep => ({ kind: "failure", failure })
    const check = () => guard.check(needsAccount(job)) ??
      (!scope.active || disposed ? { ok: false as const, reason: "unconfirmed" as const } : null)
    for (let index = 0; index < candidates.length; index++) {
      const route = candidates[index]
      if (!route) continue
      const blocked = check()
      if (blocked) return fail(blocked)
      const port = options.requests
      if (!port) return fail({ ok: false, reason: "unavailable" })
      let present = false
      try { present = port.has(route.via) } catch { requestSignal("threw", route, job.kind) }
      if (!present) { requestSignal("missing", route, job.kind); continue }
      const result = await attempt({
        port, route, spec, scope, clock, budget: scope.remaining() / Math.max(1, candidates.length - index),
        context: { check, notice: kind => requestSignal(kind, route, job.kind), observe: body => guard.observe(body) },
        observe: body => guard.observe(body)
      })
      const changed = guard.check(needsAccount(job))
      if (changed) return fail(changed)
      if (!scope.active || disposed) return fail({ ok: false, reason: "unconfirmed" })
      if (result.kind === "blocked") return fail(result.failure)
      if (result.kind === "not-sent") { requestSignal(result.cause === "missing" ? "missing" : "threw", route, job.kind); continue }
      if (result.kind === "lost" || result.kind === "timeout") {
        requestSignal(result.kind === "timeout" ? "timeout" : "threw", route, job.kind)
        if (isWrite(job)) return fail({ ok: false, reason: "unconfirmed" })
        continue
      }
      const { http, body } = result.answer
      const identityFailure = guard.response(needsAccount(job), body, site === "music" || job.kind !== "membership" && job.kind !== "playlists")
      if (identityFailure) return fail(identityFailure)
      const failure = answerFailure(http, body)
      const correlatedBatch = job.kind === "addBatch" && http >= 200 && http < 300 &&
        field(body, "error") === undefined && Array.isArray(field(body, "playlistEditResults"))
      if (failure && !(correlatedBatch && failure.reason === "failed" && failure.status === "STATUS_FAILED")) {
        requestSignal("rejected", route, job.kind); return fail(failure)
      }
      if (index > 0) requestSignal("fell-back", route, job.kind)
      return { kind: "answer", answer: result.answer, route }
    }
    return fail({ ok: false, reason: "unavailable" })
  }
  async function requestJob(job: Job, scope: JobScope): Promise<PageJobResult> {
    const blocked = guard.check(needsAccount(job))
    if (blocked) return blocked
    const location = read("location", job.kind)
    const first = requestFor(job, typeof field(location, "pathname") === "string" && String(field(location, "pathname")).startsWith("/shorts/"))
    if (!first) return { ok: false, reason: "failed" }
    let parsed: ParsedJob
    try {
      parsed = await requestAnswer({ job, first, send: spec => send(job, spec, scope), privacy: lastPrivacy,
        unrecognised: (route, body) => requestSignal("unrecognised", route, job.kind, body) })
    } catch { return { ok: false, reason: isWrite(job) ? "unconfirmed" : "unavailable" } }
    const changed = guard.check(needsAccount(job))
    if (changed) return changed
    if (!scope.active || disposed) return { ok: false, reason: "unconfirmed" }
    if (parsed.kind === "failure") {
      const fallback = table[job.kind].find(route => route.kind === "label-default")
      if (job.kind === "accountLabel" && options.requests && fallback && parsed.failure.reason === "unavailable") {
        return { ok: true, data: { name: "Unnamed account" }, route: fallback.id }
      }
      return parsed.failure
    }
    const result = { ok: true, data: parsed.data, route: parsed.route.id }
    if (isPageJobResultFor(job, result)) return result
    requestSignal("unrecognised", parsed.route, job.kind)
    return { ok: false, reason: isWrite(job) ? "unconfirmed" : "unavailable" }
  }

  function navigation(job: JobId | null): Navigation | undefined {
    const raw = read("navigation", job)
    return parsed(readWatches.navigation, raw, job, () => parseNavigation(raw))
  }
  function locationAgrees(nav: Navigation | undefined, id: unknown): boolean {
    const raw = read("location")
    const pathname = field(raw, "pathname"), search = field(raw, "search")
    if (typeof pathname !== "string" || typeof search !== "string") return false
    if (nav && nav.navigation.kind !== "other" && nav.navigation.videoId !== id) return false
    if (pathname === "/watch") return new URLSearchParams(search).get("v") === id
    if (pathname.startsWith("/shorts/")) return pathname.slice(8).split("/")[0] === id
    return nav?.navigation.kind === "other"
  }
  function current(job: JobId | null) {
    const nav = navigation(job)
    const location = read("location", job)
    const shorts = nav?.navigation.kind === "shorts" || typeof field(location, "pathname") === "string" && String(field(location, "pathname")).startsWith("/shorts/")
    const source: "watchPlayer" | "shortsPlayer" = shorts ? "shortsPlayer" : "watchPlayer"
    return { nav, raw: read(source, job), source, player: shorts ? "shorts" as const : "watch" as const }
  }
  function video(context: ReadContext) {
    if (context.target) {
      const raw = read("targetData", "videoInfo", context.target)
      return parsed(readWatches.targetData, raw, "videoInfo", () => parseTargetVideo(raw))
    }
    const { nav, raw, source, player } = current("videoInfo")
    const kind = player === "shorts" ? "short" : "video"
    const ad = field(raw, "adShowing") === true || field(raw, "adActive") === true ||
      field(raw, "presentingPlayerType") === 2 || player === "shorts" && nav?.ad === true
    if (ad) {
      if (player !== "watch" || nav?.navigation.kind !== "watch") return undefined
      const content = parseVideoResponse(nav.response, "video")
      return content?.videoId === nav.navigation.videoId && locationAgrees(nav, content.videoId) ? content : undefined
    }
    const playerId = field(raw, "videoData", "video_id")
    if (nav?.navigation.kind === "other" && (confirmedMiniplayerVideo === undefined || confirmedMiniplayerVideo !== playerId)) return undefined
    const currentId = playerId ?? (nav && nav.navigation.kind !== "other" ? nav.navigation.videoId : undefined)
    if (!locationAgrees(nav, currentId)) return undefined
    const fromNavigation = parseVideoResponse(nav?.response, kind)
    if (fromNavigation && fromNavigation.videoId === currentId) return fromNavigation
    return parsed(readWatches[source], raw, "videoInfo", () => {
      const value = parseVideoResponse(field(raw, "response"), kind)
      return value?.videoId === playerId ? value : undefined
    })
  }
  function nowPlaying() {
    const metadata = read("mediaMetadata", "nowPlaying")
    const player = read("watchPlayer", "nowPlaying")
    const queue = read("musicQueue", "nowPlaying")
    return parsed(readWatches.mediaMetadata, metadata, "nowPlaying", () => parseMusicPlayback({ metadata, player, queue }))
  }
  const routes = {
    account: { id: readRoutes.account, read: () => account.kind === "known" ? account.data : undefined },
    videoInfo: { id: readRoutes.videoInfo, read: video },
    channelOf: { id: readRoutes.channelOf, read(context: ReadContext) {
      if (context.job.kind !== "channelOf") return undefined
      const { nav, raw, source } = current("channelOf")
      const playerId = field(raw, "videoData", "video_id")
      const currentId = playerId ?? (nav && nav.navigation.kind !== "other" ? nav.navigation.videoId : undefined)
      if (currentId !== context.job.videoId || !locationAgrees(nav, currentId)) return undefined
      return parseChannel(nav?.response, context.job.videoId) ?? parsed(readWatches[source], raw, "channelOf",
        () => parseChannel(field(raw, "response"), context.job.kind === "channelOf" ? context.job.videoId : undefined))
    } },
    itemInfo: { id: readRoutes.itemInfo, read(context: ReadContext) {
      if (!context.target) return undefined
      const raw = read("targetData", "itemInfo", context.target)
      const contextRaw = read("targetContext", "itemInfo", context.target)
      const inAutomix = parsed(readWatches.targetContext, contextRaw, "itemInfo", () => {
        const value = field(contextRaw, "inAutomix")
        return typeof value === "boolean" ? value : undefined
      })
      if (inAutomix === undefined) return undefined
      return parsed(readWatches.targetData, raw, "itemInfo", () => parseItem(raw, inAutomix))
    } },
    nowPlaying: { id: readRoutes.nowPlaying, read: nowPlaying },
    castState: { id: readRoutes.castState, read() {
      const state = read("musicState", "castState")
      const primary = parsed(readWatches.musicState, state, "castState", () => {
        const casting = field(state, "castStatus")
        return typeof casting === "boolean" ? { casting } : undefined
      })
      if (primary !== undefined) return primary
      const fallback = read("castPlayer", "castState")
      if (typeof fallback === "boolean") return { casting: fallback }
      if (fallback !== undefined) signal("unrecognised", readWatches.castPlayer, "castState", fallback)
      return undefined
    } }
  } satisfies { [K in ReadJobId]: ReadRoute<K> }

  function streamReading(stream: Stream): unknown {
    switch (stream) {
      case "nav": {
        const nav = navigation(null)
        if (!nav) return undefined
        const value: NavData = { pageType: nav.pageType, video: video({ job: { kind: "videoInfo" } }) ?? null, navigation: nav.navigation }
        return value
      }
      case "player": {
        const { nav, raw, source, player } = current(null)
        return parsed(readWatches[source], raw, null, () => {
          const isAd = field(raw, "adShowing") === true || field(raw, "adActive") === true ||
            field(raw, "presentingPlayerType") === 2 || player === "shorts" && nav?.ad === true
          const id = isAd ? undefined : field(raw, "videoData", "video_id") ??
            (player === "shorts" ? field(nav?.response, "videoDetails", "videoId") : undefined)
          if (!isAd && !locationAgrees(nav, id)) return undefined
          return parsePlayer({ raw, navigation: nav, player, at: stamp(), miniplayerConfirmed: confirmedMiniplayerVideo !== undefined && confirmedMiniplayerVideo === id })
        })
      }
      case "nowPlaying": return nowPlaying()
      case "queue": {
        const raw = read("musicQueue")
        return parsed(readWatches.musicQueue, raw, null, () => parseQueue(raw))
      }
    }
  }
  function publish(stream: Stream): void {
    const slot = slots[stream]
    if (disposed || slot.subscribers.size === 0) return
    let data: unknown
    try { data = streamReading(stream) } catch { return }
    if (!isStreamData(stream, data)) return
    for (const sink of [...slot.subscribers]) {
      if (disposed || !slot.subscribers.has(sink)) continue
      try { sink(data) } catch {}
    }
  }
  function present(id: WatchId): boolean {
    try { return page.has(id) } catch { signal("threw", id, null); return false }
  }
  function attach(stream: Stream): () => void {
    const releases: (() => void)[] = []
    let active = true
    let attaching: WatchId = readWatches.navigation
    const add = (event: PageEvent) => {
      attaching = event === "queue" ? readWatches.queueChanges : event === "music" ? readWatches.mediaMetadata :
        event === "navigation" ? readWatches.navigation : readWatches.watchPlayer
      const changed = (detail: unknown) => {
        if (!active || disposed) return
        if (event === "navigation") confirmedMiniplayerVideo = undefined
        if (event === "playerIdentity" && field(detail, "id") === "movie_player") confirmedMiniplayerVideo = field(read("watchPlayer"), "videoData", "video_id")
        publish(stream)
      }
      releases.push(page.on(event, changed))
    }
    const stop = () => {
      if (!active) return
      active = false
      for (const release of releases.splice(0)) { try { release() } catch {} }
    }
    try {
      if (stream === "nav") { add("navigation"); add("playerIdentity") }
      if (stream === "player") { add("navigation"); add("playerIdentity"); add("player") }
      if (stream === "nowPlaying") { add("playerIdentity"); add("music"); if (present(readWatches.queueChanges)) add("queue") }
      if (stream === "queue") {
        if (!present(readWatches.queueChanges)) { signal("missing", readWatches.queueChanges, null); return stop }
        add("queue")
      }
    } catch { stop(); signal("threw", attaching, null) }
    return stop
  }
  function releaseAll(): void {
    if (disposed) return
    disposed = true
    queue?.dispose()
    lanes.dispose()
    lastPrivacy.clear()
    signalSinks.clear()
    for (const slot of Object.values(slots)) {
      slot.subscribers.clear()
      const stop = slot.stop
      slot.stop = undefined
      stop?.()
    }
  }
  return {
    get disposed() { return disposed },
    vocabulary,
    async run<J extends Job>(job: J, ctx?: { target?: Element }): Promise<PageJobResult<J>> {
      try {
        if (disposed || !isJob(job) || !supportsJob(site, job.kind)) return { ok: false, reason: "unavailable" }
        if (isReadJob(job.kind)) {
          const route = routes[job.kind]
          const data = route.read({ job, ...ctx })
          const result: unknown = isJobFailureFor(job, data) ? data : { ok: true, data, route: route.id }
          if (isPageJobResultFor(job, result)) return result
        }
        if (isQueueJob(job)) {
          const result = await queueJob(job, ctx?.target)
          return isPageJobResultFor<J>(job, result) ? result : { ok: false, reason: "unavailable" }
        }
        if (isMusicJob(job)) {
          const result = await musicJob(job, ctx?.target)
          return isPageJobResultFor<J>(job, result) ? result : { ok: false, reason: "unavailable" }
        }
        if (!table[job.kind].some(route => route.kind === "request")) return { ok: false, reason: "unavailable" }
        const blocked = guard.check(needsAccount(job))
        if (blocked) return blocked
        const result: unknown = await lanes.run("playlist", scope => requestJob(job, scope))
        return isPageJobResultFor<J>(job, result) ? result : { ok: false, reason: "unavailable" }
      } catch { return { ok: false, reason: "unavailable" } }
    },
    watch<S extends Stream>(stream: S, onData: (data: StreamData<S>) => void): () => void {
      if (disposed || !supportsStream(site, stream)) return () => {}
      const slot = slots[stream]
      const sink = (raw: unknown) => { if (isStreamData(stream, raw)) onData(raw) }
      slot.subscribers.add(sink)
      if (slot.subscribers.size === 1) {
        const stop = attach(stream)
        if (disposed || !slot.subscribers.has(sink)) stop()
        else slot.stop = stop
      }
      let active = true
      return () => {
        if (!active) return
        active = false
        slot.subscribers.delete(sink)
        if (slot.subscribers.size === 0) { const stop = slot.stop; slot.stop = undefined; stop?.() }
      }
    },
    async probe(): Promise<ProbeReport> {
      return { site, entries: vocabulary.watchIds.map(id => {
        const transport = Object.entries(requestWatches).find(([, watch]) => watch === id)
        const handler = musicHandlers.find(name => handlerWatches[name] === id)
        let found = false
        if (handler) {
          try { found = !disposed && options.music?.has(handler) === true } catch {}
        } else if (transport) {
          const via = transport[0]
          if (via === "command" || via === "service" || via === "signed" || via === "plain" || via === "music") {
            try { found = !disposed && options.requests?.has(via) === true } catch {}
          }
        } else found = !disposed && present(id)
        return { id, present: found }
      }) }
    },
    onSignal(listener) {
      if (disposed) return () => {}
      const sink = (event: BreakageSignal) => listener(event)
      signalSinks.add(sink)
      return () => { signalSinks.delete(sink) }
    },
    dispose: releaseAll
  }
}

function isReadJob(job: JobId): job is ReadJobId { return Object.hasOwn(readRoutes, job) }
function isQueueJob(job: Job): job is JobOf<QueueJobId> { return (queueJobs as readonly string[]).includes(job.kind) }
function isMusicJob(job: Job): job is JobOf<MusicJobId> { return (musicJobs as readonly string[]).includes(job.kind) }
