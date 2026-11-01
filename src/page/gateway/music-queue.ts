import { isNavigationEndpoint } from "../../shared/contracts"
import type { BreakageKind, JobFailure, JobOf, JsonObject, QueueItemId } from "../../shared/contracts"
import type { PageJobResult } from "../../shared/contracts/page"
import type { VideoId } from "../../shared/model/validation"
import { indexOf, parseQueueReplay, parseQueueSnapshot } from "../parsers/music-queue"
import type { QueueEntry, QueueSnapshot } from "../parsers/music-queue"
import type { PageReadPort } from "../read-port"
import { readWatches } from "../read-port"
import { field } from "../read-parsers"
import type { GatewayClock, JobScope } from "./lanes"
import type { HandlerRoute, MusicHandler, RouteTable } from "./port"

export interface MusicPagePort {
  has(handler: MusicHandler): boolean
  items(): unknown
  current(): unknown
  state(): unknown
  onToast(seen: () => void): () => void
  menuItem(command: JsonObject): void
  fetchQueue(body: Record<string, unknown>): Promise<unknown>
  dispatch(action: { type: string; payload: unknown }): void
  remove(id: string): void
  panel(): unknown
  drop(entry: unknown, to: number): void
  service(endpoint: JsonObject): void
  navigate(endpoint: JsonObject): void
}
export type MusicContext = ReturnType<typeof createMusicContext>
type Answer = { kind: "answer"; body: unknown } | { kind: "lost"; error: unknown } | { kind: "timeout" }
type Grown = { ok: true; entries: QueueEntry[] } | JobFailure

export const growthWindow = 10_000
export const growthChecks = [0, 250, 750, 1_750, 3_750, 6_750, 9_750]
const laneMargin = 100
export const unavailable: JobFailure = { ok: false, reason: "unavailable" }
export const failed: JobFailure = { ok: false, reason: "failed" }
const unconfirmed: JobFailure = { ok: false, reason: "unconfirmed" }

export function createMusicContext(options: {
  port: MusicPagePort; page: PageReadPort; clock: GatewayClock; table: RouteTable
  casting(): boolean; notice(kind: BreakageKind, route: HandlerRoute, raw?: unknown): void
}) {
  const { port, page, clock, notice } = options
  function handlers(job: keyof RouteTable): HandlerRoute[] {
    return options.table[job].filter((route): route is HandlerRoute => route.kind === "handler")
  }
  function present(route: HandlerRoute): boolean {
    try { if (port.has(route.handler)) return true } catch { notice("threw", route); return false }
    notice("missing", route)
    return false
  }
  function snapshot(route: HandlerRoute): QueueSnapshot | undefined {
    let items: unknown, current: unknown
    try { items = port.items(); current = port.current() } catch { notice("threw", route); return undefined }
    const value = parseQueueSnapshot(items, current)
    if (!value) notice(items === undefined ? "missing" : "unrecognised", route, items)
    return value
  }
  function state(route: HandlerRoute): unknown {
    try { return port.state() } catch { notice("threw", route); return undefined }
  }
  function fire(route: HandlerRoute, act: () => void): boolean {
    try { act(); return true } catch { notice("threw", route); return false }
  }
  function quiet(scope: JobScope): () => boolean {
    let noisy = false
    let stop = () => {}
    try { stop = port.onToast(() => { noisy = true }) } catch {}
    scope.onClose(() => { try { stop() } catch {} })
    return () => noisy
  }
  function until(scope: JobScope, look: () => boolean, queueEvents: boolean): Promise<boolean> {
    return new Promise(resolve => {
      const start = clock.now()
      const end = Math.max(0, Math.min(growthWindow, scope.remaining() - laneMargin))
      let active = true
      let stopTimer = () => {}
      let stopEvents = () => {}
      let stopScope = () => {}
      const finish = (found: boolean) => {
        if (!active) return
        active = false
        stopTimer(); stopScope()
        try { stopEvents() } catch {}
        resolve(found)
      }
      const check = () => {
        if (!active) return
        if (!scope.active) { finish(false); return }
        let found = false
        try { found = look() } catch {}
        if (found) finish(true)
      }
      stopScope = scope.onClose(() => finish(false))
      if (!active) return
      let heard = false
      if (queueEvents) {
        try { if (page.has(readWatches.queueChanges)) { stopEvents = page.on("queue", check); heard = true } } catch {}
      }
      const timed = growthChecks.filter(offset => offset < end)
      const offsets = heard ? [0, end] : timed.length < growthChecks.length ? timed.concat(end) : timed
      let index = 0
      const step = () => {
        check()
        if (!active) return
        const next = offsets[++index]
        if (next === undefined) { finish(false); return }
        stopTimer = clock.after(Math.max(0, next - (clock.now() - start)), step)
      }
      step()
    })
  }
  function within(scope: JobScope, pending: Promise<unknown>): Promise<Answer> {
    return new Promise(resolve => {
      let active = true
      let stopTimer = () => {}
      let stopScope = () => {}
      const finish = (answer: Answer) => {
        if (!active) return
        active = false
        stopTimer(); stopScope()
        resolve(answer)
      }
      stopScope = scope.onClose(() => finish({ kind: "timeout" }))
      if (!active) return
      stopTimer = clock.after(Math.max(0, scope.remaining() - laneMargin), () => finish({ kind: "timeout" }))
      pending.then(body => finish({ kind: "answer", body }), error => finish({ kind: "lost", error }))
    })
  }
  async function grown(route: HandlerRoute, before: QueueSnapshot, scope: JobScope, videoId?: VideoId): Promise<Grown> {
    const known = new Set(before.entries.map(entry => String(entry.id)))
    let fresh: QueueEntry[] = []
    await until(scope, () => {
      const now = snapshot(route)
      fresh = now?.entries.filter(entry => !known.has(String(entry.id)) && (videoId === undefined || entry.videoId === videoId)) ?? []
      return fresh.length > 0
    }, true)
    if (!scope.active) return unconfirmed
    if (fresh.length === 0) { notice("no-effect", route); return failed }
    return { ok: true, entries: fresh }
  }
  async function replay(route: HandlerRoute, body: JsonObject, scope: JobScope): Promise<"sent" | "not-sent" | JobFailure> {
    const target = field(body, "queueTarget"), position = field(body, "queueInsertPosition")
    const videoId = field(target, "videoId"), playlistId = field(target, "playlistId"), params = field(target, "params")
    const now = snapshot(route)
    if (!now) return "not-sent"
    if (now.entries.length === 0) {
      const start = field(target, "onEmptyQueue")
      if (!isNavigationEndpoint(start)) return failed
      return fire(route, () => port.navigate(start)) ? "sent" : "not-sent"
    }
    const contextParams = field(state(route), "queue", "queueContextParams")
    const request = {
      ...(contextParams !== undefined ? { queueContextParams: contextParams } : {}), queueInsertPosition: position,
      ...(videoId !== undefined ? { videoIds: [videoId] } : { playlistId }), ...(params !== undefined ? { params } : {})
    }
    let pending: Promise<unknown>
    try { pending = Promise.resolve(port.fetchQueue(request)) } catch { notice("threw", route); return "not-sent" }
    const answer = await within(scope, pending)
    if (answer.kind !== "answer") {
      notice(answer.kind === "timeout" ? "timeout" : "rejected", route)
      const http = answer.kind === "lost" ? field(answer.error, "status") : undefined
      return typeof http === "number" && Number.isInteger(http) && http >= 400 && http <= 599 ? { ...failed, http } : failed
    }
    const parsed = parseQueueReplay(answer.body)
    if (!parsed) { notice("unrecognised", route, answer.body); return failed }
    const latest = snapshot(route)
    if (!latest || !scope.active) return failed
    const index = position === "INSERT_AFTER_CURRENT_VIDEO" ? latest.current + 1 : latest.entries.length
    const nextQueueItemId = field(state(route), "queue", "nextQueueItemId")
    return fire(route, () => {
      if (parsed.params !== undefined) port.dispatch({ type: "SET_QUEUE_CONTEXT_PARAMS", payload: parsed.params })
      port.dispatch({ type: "ADD_ITEMS", payload: { nextQueueItemId, index, items: parsed.items, shouldAssignIds: true } })
      port.dispatch({ type: "SET_IS_RAAR_ENABLED", payload: false })
    }) ? "sent" : failed
  }
  return { port, notice, casting: options.casting, handlers, present, snapshot, state, fire, quiet, until, grown, replay }
}

export function createMusicQueue(ctx: MusicContext) {
  async function insert(job: JobOf<"queueInsert">, scope: JobScope): Promise<PageJobResult<JobOf<"queueInsert">>> {
    const candidates = ctx.handlers("queueInsert")
    const first = candidates[0]
    if (!first || ctx.casting()) return unavailable
    const before = ctx.snapshot(first)
    if (!before) return unavailable
    const native = job.endpoint.queueAddEndpoint
    if (native === undefined || native === null || typeof native !== "object" || Array.isArray(native)) return unavailable
    const { commands: _toast, ...body } = native
    const noisy = ctx.quiet(scope)
    for (const route of candidates) {
      if (!ctx.present(route)) continue
      if (route.handler === "menu-item") {
        if (!ctx.fire(route, () => ctx.port.menuItem({ queueAddEndpoint: body }))) continue
      } else {
        const sent = await ctx.replay(route, body, scope)
        if (sent === "not-sent") continue
        if (sent !== "sent") return sent
      }
      const result = await ctx.grown(route, before, scope)
      if (!result.ok) return result
      if (noisy()) ctx.notice("quiet-route-noisy", route)
      return { ok: true, data: { ids: result.entries.map(entry => entry.id) }, route: route.id }
    }
    return unavailable
  }

  async function removeIds(job: JobOf<"queueRemoveIds">, scope: JobScope): Promise<PageJobResult<JobOf<"queueRemoveIds">>> {
    const route = ctx.handlers("queueRemoveIds")[0]
    if (!route || ctx.casting() || !ctx.present(route)) return unavailable
    const before = ctx.snapshot(route)
    if (!before) return unavailable
    const waiting = new Map<string, QueueItemId>()
    for (const id of job.ids) if (indexOf(before, id) > before.current) waiting.set(String(id), id)
    if (waiting.size === 0) return { ok: true, data: { removed: 0 }, route: route.id }
    const noisy = ctx.quiet(scope)
    for (const id of waiting.keys()) ctx.fire(route, () => ctx.port.remove(id))
    let gone = 0
    await ctx.until(scope, () => {
      const now = ctx.snapshot(route)
      if (now) gone = [...waiting.values()].filter(id => indexOf(now, id) < 0).length
      return gone === waiting.size
    }, true)
    if (gone < waiting.size) ctx.notice("no-effect", route)
    if (gone === 0) return failed
    if (noisy()) ctx.notice("quiet-route-noisy", route)
    return { ok: true, data: { removed: gone }, route: route.id }
  }
  return { insert, removeIds }
}
