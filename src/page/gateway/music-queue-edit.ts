import type { JobFailure, JobOf, QueueItemId } from "../../shared/contracts"
import type { PageJobResult } from "../../shared/contracts/page"
import { indexOf, parseQueueSnapshot } from "../parsers/music-queue"
import { field } from "../read-parsers"
import type { JobScope } from "./lanes"
import { failed, unavailable } from "./music-queue"
import type { MusicContext } from "./music-queue"
import type { HandlerRoute } from "./port"

type Moved = { ok: true; from: number; moved: boolean } | JobFailure

export function createMusicQueueEdits(ctx: MusicContext) {
  async function remove(job: JobOf<"queueRemove">, scope: JobScope): Promise<PageJobResult<JobOf<"queueRemove">>> {
    const route = ctx.handlers("queueRemove")[0]
    if (!route || ctx.casting() || !ctx.present(route)) return unavailable
    const before = ctx.snapshot(route)
    if (!before) return unavailable
    const index = indexOf(before, job.id)
    if (index < 0) return failed
    const noisy = ctx.quiet(scope)
    if (!ctx.fire(route, () => ctx.port.remove(String(job.id)))) return unavailable
    const gone = await ctx.until(scope, () => {
      const now = ctx.snapshot(route)
      return now !== undefined && indexOf(now, job.id) < 0
    }, true)
    if (!gone) { ctx.notice("no-effect", route); return failed }
    if (noisy()) ctx.notice("quiet-route-noisy", route)
    return { ok: true, data: { index }, route: route.id }
  }

  function readPanel(route: HandlerRoute): { data: unknown; current: unknown; fresh: boolean } | undefined {
    try {
      const data = ctx.port.panel()
      return { data, current: ctx.port.current(), fresh: Array.isArray(data) && data === field(ctx.port.state(), "queue", "items") }
    } catch { ctx.notice("threw", route); return undefined }
  }
  async function moveEntry(route: HandlerRoute, id: QueueItemId, to: JobOf<"queueMove">["to"], scope: JobScope, settle = false): Promise<Moved> {
    if (settle) await ctx.until(scope, () => readPanel(route)?.fresh === true, false)
    const read = readPanel(route)
    if (!read) return unavailable
    if (!read.fresh) return failed
    const panel = parseQueueSnapshot(read.data, read.current)
    if (!panel) { ctx.notice("unrecognised", route, read.data); return unavailable }
    const from = indexOf(panel, id)
    if (from < 0 || from === panel.current) return failed
    const target = to === "next" ? from > panel.current ? panel.current + 1 : panel.current : to === "end" ? panel.entries.length - 1 : to
    const entry = panel.entries[from]
    if (!entry || target < 0 || target >= panel.entries.length) return failed
    if (target === from) return { ok: true, from, moved: false }
    if (!ctx.fire(route, () => ctx.port.drop(entry.raw, target))) return unavailable
    const moved = await ctx.until(scope, () => {
      const now = ctx.snapshot(route)
      return now !== undefined && indexOf(now, id) === target
    }, true)
    if (!moved) { ctx.notice("no-effect", route); return failed }
    return { ok: true, from, moved: true }
  }

  async function move(job: JobOf<"queueMove">, scope: JobScope): Promise<PageJobResult<JobOf<"queueMove">>> {
    const route = ctx.handlers("queueMove")[0]
    if (!route || ctx.casting() || !ctx.present(route)) return unavailable
    const moved = await moveEntry(route, job.id, job.to, scope)
    return moved.ok ? { ok: true, data: { from: moved.from, moved: moved.moved }, route: route.id } : moved
  }

  async function reinsert(job: JobOf<"queueReinsert">, scope: JobScope): Promise<PageJobResult<JobOf<"queueReinsert">>> {
    const route = ctx.handlers("queueReinsert")[0], mover = ctx.handlers("queueMove")[0]
    if (!route || !mover || ctx.casting() || !ctx.present(route) || !ctx.present(mover)) return unavailable
    const before = ctx.snapshot(route)
    if (!before) return unavailable
    if (before.entries.length === 0) return failed
    const sent = await ctx.replay(route, { queueTarget: { videoId: job.videoId }, queueInsertPosition: "INSERT_AT_END" }, scope)
    if (sent === "not-sent") return unavailable
    if (sent !== "sent") return sent
    const grown = await ctx.grown(route, before, scope, job.videoId)
    if (!grown.ok) return grown
    const entry = grown.entries[0]
    if (!entry) return failed
    const moved = await moveEntry(mover, entry.id, Math.min(job.index, before.entries.length), scope, true)
    if (moved.ok) return { ok: true, data: { id: entry.id }, route: route.id }
    ctx.fire(route, () => ctx.port.remove(String(entry.id)))
    return failed
  }
  return { remove, move, reinsert }
}
