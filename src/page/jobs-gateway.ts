import { isJob, isJobFailureFor, isJsonValue, makeShapeOutline, supportsJob } from "../shared/contracts"
import type { BreakageSignal, DiagnosticVocabulary, ItemInfo, Job, JobFailure, JobId, JobOf, ProbeReport, Site } from "../shared/contracts"
import { isPageJobResultFor } from "../shared/contracts/page"
import type { PageJobResult } from "../shared/contracts/page"
import { readRoutes, readVocabulary, readWatches } from "./read-port"
import type { PageReads } from "./read-gateway"
import { field, parseChannel, parseItem, parseTargetVideo } from "./read-parsers"
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
import type { createWwwQueue, WwwQueuePort } from "./gateway/www-queue"
import type { createMusicContext, createMusicQueue, MusicPagePort } from "./gateway/music-queue"
import type { createMusicQueueEdits } from "./gateway/music-queue-edit"
import type { createMusicLibrary } from "./gateway/music-library"
import type { Jobs, JobContext } from "./jobs-port"

type QueueJobId = "queueAdd" | "queueUndo" | "queueAddList" | "openCardMenu"
const queueJobs: readonly QueueJobId[] = ["queueAdd", "queueUndo", "queueAddList", "openCardMenu"]
type MusicJobId = "queueInsert" | "queueRemove" | "queueRemoveIds" | "queueMove" | "queueReinsert" | "like" | "library" | "navigate"
const musicJobs: readonly MusicJobId[] = ["queueInsert", "queueRemove", "queueRemoveIds", "queueMove", "queueReinsert", "like", "library", "navigate"]

type TargetReadId = "videoInfo" | "channelOf" | "itemInfo"
const targetReads: readonly TargetReadId[] = ["videoInfo", "channelOf", "itemInfo"]

type MusicJobs = ReturnType<typeof createMusicQueue> & ReturnType<typeof createMusicQueueEdits> & ReturnType<typeof createMusicLibrary>
/** What one site brings to the gateway: its route table and its own job builders, so each jobs file bundles only its site's. */
export type SiteGateway = {
  readonly id: Site
  readonly table: RouteTable
  readonly queue?: typeof createWwwQueue
  readonly music?: (context: Parameters<typeof createMusicContext>[0], reads: Parameters<typeof createMusicLibrary>[1]) => MusicJobs
}

/**
 * The jobs half of the gateway (G42): requests, queue and YouTube Music jobs and the probe. It runs on the read half's
 * port and pinned identity, so a jobs file that loads after an account switch still answers `accountChanged`.
 */
export function createJobsGateway(options: {
  site: SiteGateway; reads: PageReads; requests?: GatewayRequestPort; queue?: WwwQueuePort; music?: MusicPagePort; clock?: GatewayClock
  now?: () => number
}): Jobs {
  const { reads } = options
  const { page } = reads
  const { id: site, table } = options.site
  const now = options.now ?? Date.now
  const clock = options.clock ?? { ...systemClock, now }
  const lanes = createLanes(clock)
  const vocabulary: DiagnosticVocabulary = options.requests || options.queue || options.music ? vocabularyFor(table) : readVocabulary
  const lastPrivacy = new Map<string, "PRIVATE" | "UNLISTED" | "PUBLIC" | undefined>()
  const guard = createAccountGuard(page, reads.account ?? undefined)
  let disposed = false

  function stamp(): number {
    try { const at = now(); return Number.isSafeInteger(at) && at >= 0 ? at : 0 } catch { return 0 }
  }
  function requestSignal(kind: BreakageSignal["kind"], route: RequestRoute | PageUiRoute | HandlerRoute, job: JobId, raw?: unknown): void {
    if (disposed) return
    const at = stamp()
    reads.emit({
      site, feature: null, job, route: route.id, kind, watchId: route.watchId,
      shape: kind === "unrecognised" ? makeShapeOutline(isJsonValue(raw) ? raw : null, vocabulary.schemaKeys) : null,
      clientVersion: null, pageType: "other", count: 1, firstSeen: at, lastSeen: at
    })
  }
  function item(target: Element | undefined): ItemInfo | undefined {
    if (!target) return undefined
    const raw = reads.read("targetData", "itemInfo", target)
    const contextRaw = reads.read("targetContext", "itemInfo", target)
    const inAutomix = reads.parsed(readWatches.targetContext, contextRaw, "itemInfo", () => {
      const value = field(contextRaw, "inAutomix")
      return typeof value === "boolean" ? value : undefined
    })
    if (inAutomix === undefined) return undefined
    return reads.parsed(readWatches.targetData, raw, "itemInfo", () => parseItem(raw, inAutomix))
  }
  /** The reads the streams don't need: a pointed card's video or item, and the playing video's channel. */
  function targetRead(job: JobOf<TargetReadId>, target: Element | undefined) {
    switch (job.kind) {
      case "videoInfo": {
        if (!target) return undefined
        const raw = reads.read("targetData", "videoInfo", target)
        return reads.parsed(readWatches.targetData, raw, "videoInfo", () => parseTargetVideo(raw))
      }
      case "itemInfo": return item(target)
      case "channelOf": {
        const { nav, raw, source } = reads.current("channelOf")
        const playerId = field(raw, "videoData", "video_id")
        const currentId = playerId ?? (nav && nav.navigation.kind !== "other" ? nav.navigation.videoId : undefined)
        if (currentId !== job.videoId || !reads.agrees(nav, currentId)) return undefined
        return parseChannel(nav?.response, job.videoId) ?? reads.parsed(readWatches[source], raw, "channelOf",
          () => parseChannel(field(raw, "response"), job.videoId))
      }
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
  const queue = options.queue && routesForQueue && options.site.queue ? options.site.queue({
    port: options.queue, clock, routes: routesForQueue,
    card: target => page.read("targetData", target),
    check: () => guard.check(false),
    notice(kind, route, raw) {
      requestSignal(kind, route, queueJobs.find(id => table[id].some(entry => entry.id === route.id)) ?? "queueAdd", raw)
    }
  }) : undefined
  async function queueJob(job: JobOf<QueueJobId>, target: Element | undefined, budget: number | undefined): Promise<PageJobResult> {
    if (!queue) return { ok: false, reason: "unavailable" }
    const blocked = guard.check(needsAccount(job))
    if (blocked) return blocked
    switch (job.kind) {
      case "openCardMenu": return queue.menu(job, target)
      case "queueAdd": return lanes.run("app-state", scope => queue.add(target, scope), budget)
      case "queueUndo": return lanes.run("app-state", scope => queue.undo(job, scope), budget)
      case "queueAddList": return lanes.run("app-state", scope => queue.addList(job, scope), budget)
    }
  }
  const music = site === "music" && options.music && options.site.music ? options.site.music({
    port: options.music, page, clock, table,
    casting: () => reads.casting(),
    notice(kind, route, raw) {
      requestSignal(kind, route, musicJobs.find(id => table[id].some(entry => entry.id === route.id)) ?? "queueInsert", raw)
    }
  }, {
    item,
    location: () => reads.read("location")
  }) : undefined
  async function musicJob(job: JobOf<MusicJobId>, target: Element | undefined, budget: number | undefined): Promise<PageJobResult> {
    if (!music) return { ok: false, reason: "unavailable" }
    const blocked = guard.check(needsAccount(job))
    if (blocked) return blocked
    return lanes.run("app-state", async (scope): Promise<PageJobResult> => {
      const result = await musicStep(music, job, target, scope)
      return guard.check(needsAccount(job)) ?? result
    }, budget)
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
    const location = reads.read("location", job.kind)
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

  return {
    vocabulary,
    async run<J extends Job>(job: J, ctx?: JobContext): Promise<PageJobResult<J>> {
      try {
        if (disposed || !isJob(job) || !supportsJob(site, job.kind)) return { ok: false, reason: "unavailable" }
        if (isTargetRead(job)) {
          const data = targetRead(job, ctx?.target)
          const result: unknown = isJobFailureFor(job, data) ? data : { ok: true, data, route: readRoutes[job.kind] }
          if (isPageJobResultFor<J>(job, result)) return result
        }
        if (isQueueJob(job)) {
          const result = await queueJob(job, ctx?.target, ctx?.budget)
          return isPageJobResultFor<J>(job, result) ? result : { ok: false, reason: "unavailable" }
        }
        if (isMusicJob(job)) {
          const result = await musicJob(job, ctx?.target, ctx?.budget)
          return isPageJobResultFor<J>(job, result) ? result : { ok: false, reason: "unavailable" }
        }
        if (!table[job.kind].some(route => route.kind === "request")) return { ok: false, reason: "unavailable" }
        const blocked = guard.check(needsAccount(job))
        if (blocked) return blocked
        const result: unknown = await lanes.run("playlist", scope => requestJob(job, scope), ctx?.budget)
        return isPageJobResultFor<J>(job, result) ? result : { ok: false, reason: "unavailable" }
      } catch { return { ok: false, reason: "unavailable" } }
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
        } else found = !disposed && reads.present(id)
        return { id, present: found }
      }) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      queue?.dispose()
      lanes.dispose()
      lastPrivacy.clear()
    }
  }
}

function isTargetRead(job: Job): job is JobOf<TargetReadId> { return (targetReads as readonly string[]).includes(job.kind) }
function isQueueJob(job: Job): job is JobOf<QueueJobId> { return (queueJobs as readonly string[]).includes(job.kind) }
function isMusicJob(job: Job): job is JobOf<MusicJobId> { return (musicJobs as readonly string[]).includes(job.kind) }
