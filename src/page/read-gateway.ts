import { isJob, isJobFailureFor, isJsonValue, isStreamData, makeShapeOutline, supportsJob, supportsStream } from "../shared/contracts"
import type { BreakageSignal, Job, JobFailureFor, JobId, JobOf, NavData, Site, Stream, StreamData, WatchId } from "../shared/contracts"
import { isPageJobResultFor } from "../shared/contracts/page"
import type { PageAccountData, PageJobData, PageJobResult } from "../shared/contracts/page"
import type { PageEvent, PageRead, PageReadPort } from "./read-port"
import { readRoutes, readVocabulary, readWatches } from "./read-port"
import { field, parseNavigation, parseMusicPlayback, parsePlayer, parseQueue, parseVideoResponse } from "./read-parsers"
import type { Navigation } from "./read-parsers"

export type ReadJobId = keyof typeof readRoutes
/** The reads the streams already carry the code for; a pointed card's video, its item and the channel load the jobs file. */
type OwnReadId = "account" | "videoInfo" | "nowPlaying" | "castState"
type ReadRoute<K extends ReadJobId> = {
  id: typeof readRoutes[K]
  read(): PageJobData<JobOf<K>> | JobFailureFor<JobOf<K>> | undefined
}
type StreamSlot = {
  subscribers: Set<(raw: unknown) => void>
  stop: (() => void) | undefined
}
type PageLoadAccount = { kind: "known"; data: PageAccountData } | { kind: "unavailable" }

/** What the read half lends the jobs half: the live port, the pinned identity, the guarded reads, and the signal sinks. */
export interface PageReads {
  readonly site: Site
  readonly page: PageReadPort
  /** The identity pinned when the read half was made, or null when the page config didn't name one. */
  readonly account: PageAccountData | null
  read(what: PageRead, job?: JobId | null, target?: Element): unknown
  /** Parses a raw read, and signals the read's watch when the page has a value the parser doesn't recognise. */
  parsed<T>(watchId: WatchId, raw: unknown, job: JobId | null, parse: () => T | undefined): T | undefined
  present(id: WatchId): boolean
  /** The navigation, location and counting player now, and whether the location shows the given video. */
  current(job: JobId | null): { nav: Navigation | undefined; raw: unknown; source: "watchPlayer" | "shortsPlayer"; player: "watch" | "shorts" }
  agrees(nav: Navigation | undefined, id: unknown): boolean
  casting(): boolean
  emit(signal: BreakageSignal): void
}
/** The page half's own gateway: the account, the read jobs and the streams, which exist from the core's first frame. */
export interface ReadGateway extends PageReads {
  readonly disposed: boolean
  /** Whether this half answers the job itself; every other job goes to the jobs half. */
  serves(job: Job, ctx?: { target?: Element }): boolean
  run<J extends Job>(job: J, ctx?: { target?: Element }): Promise<PageJobResult<J>>
  watch<S extends Stream>(stream: S, onData: (data: StreamData<S>) => void): () => void
  onSignal(listener: (signal: BreakageSignal) => void): () => void
  dispose(): void
}

export function isReadJob(job: JobId): job is ReadJobId { return Object.hasOwn(readRoutes, job) }
function isOwnRead(job: JobId): job is OwnReadId { return job === "account" || job === "videoInfo" || job === "nowPlaying" || job === "castState" }

export function createReadGateway(options: {
  site: Site; page: PageReadPort; signals?: (signal: BreakageSignal) => void; now?: () => number
}): ReadGateway {
  const { page, site } = options
  const now = options.now ?? Date.now
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
  function emit(event: BreakageSignal): void {
    for (const sink of [...signalSinks]) {
      if (!signalSinks.has(sink) || disposed) continue
      try { sink(event) } catch {}
    }
  }
  function signal(kind: "missing" | "threw" | "unrecognised", watchId: WatchId, job: JobId | null, raw?: unknown): void {
    if (disposed) return
    const at = stamp()
    emit({
      site, feature: null, job, route: job !== null && isReadJob(job) ? readRoutes[job] : null,
      kind, watchId, shape: kind === "unrecognised" ? makeShapeOutline(isJsonValue(raw) ? raw : null, readVocabulary.schemaKeys) : null,
      clientVersion: null, pageType: "other", count: 1, firstSeen: at, lastSeen: at
    })
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
  function video() {
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
  } satisfies { [K in OwnReadId]: ReadRoute<K> }

  function serves(job: Job, ctx?: { target?: Element }): boolean {
    return isJob(job) && isOwnRead(job.kind) && !(job.kind === "videoInfo" && ctx?.target)
  }

  function streamReading(stream: Stream): unknown {
    switch (stream) {
      case "nav": {
        const nav = navigation(null)
        if (!nav) return undefined
        const value: NavData = { pageType: nav.pageType, video: video() ?? null, navigation: nav.navigation }
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
  return {
    site, page,
    get disposed() { return disposed },
    account: account.kind === "known" ? Object.freeze({ ...account.data }) : null,
    read, parsed, present, current, agrees: locationAgrees,
    casting: () => routes.castState.read()?.casting === true,
    serves,
    emit(event) { if (!disposed) emit(event) },
    async run<J extends Job>(job: J, ctx?: { target?: Element }): Promise<PageJobResult<J>> {
      try {
        if (disposed || !isJob(job) || !supportsJob(site, job.kind) || !serves(job, ctx) || !isOwnRead(job.kind)) return { ok: false, reason: "unavailable" }
        const route = routes[job.kind]
        const data = route.read()
        const result: unknown = isJobFailureFor(job, data) ? data : { ok: true, data, route: route.id }
        if (isPageJobResultFor(job, result)) return result
      } catch {}
      return { ok: false, reason: "unavailable" }
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
    onSignal(listener) {
      if (disposed) return () => {}
      const sink = (event: BreakageSignal) => listener(event)
      signalSinks.add(sink)
      return () => { signalSinks.delete(sink) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      signalSinks.clear()
      for (const slot of Object.values(slots)) {
        slot.subscribers.clear()
        const stop = slot.stop
        slot.stop = undefined
        stop?.()
      }
    }
  }
}
