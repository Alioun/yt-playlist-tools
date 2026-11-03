import type { ItemInfo, JobOf, LibraryEndpoint } from "../../shared/contracts"
import type { PageJobResult } from "../../shared/contracts/page"
import { field, queueRenderer } from "../read-parsers"
import type { JobScope } from "./lanes"
import { failed, unavailable } from "./music-queue"
import type { MusicContext } from "./music-queue"

export function createMusicLibrary(ctx: MusicContext, options: { item(target: Element): ItemInfo | undefined; location(): unknown }) {
  async function like(job: JobOf<"like">, scope: JobScope): Promise<PageJobResult<JobOf<"like">>> {
    const route = ctx.handlers("like")[0]
    if (!route || !ctx.present(route)) return unavailable
    const status = field(job.endpoint, "likeEndpoint", "status"),
      videoId = field(job.endpoint, "likeEndpoint", "target", "videoId")
    if (!ctx.fire(route, () => ctx.port.service(job.endpoint))) return unavailable
    const done = { ok: true as const, data: null, route: route.id }
    if (typeof status !== "string" || typeof videoId !== "string") {
      ctx.notice("cannot-measure", route)
      return done
    }
    let readable = false
    const confirmed = await ctx.until(
      scope,
      () => {
        const value = field(ctx.state(route), "likeStatus", "videos", videoId)
        readable ||= value !== undefined
        return value === status
      },
      false
    )
    if (confirmed) return done
    if (!scope.active) return { ok: false, reason: "unconfirmed" }
    if (!readable) {
      ctx.notice("cannot-measure", route)
      return done
    }
    ctx.notice("no-effect", route)
    return failed
  }

  function inLibraryAfter(endpoint: LibraryEndpoint, target: Element | undefined): boolean | undefined {
    const status = field(endpoint, "likeEndpoint", "status")
    if (status !== undefined) return status === "LIKE" ? true : status === "INDIFFERENT" ? false : undefined
    const slot = target ? options.item(target)?.endpoints.library : undefined
    return slot && JSON.stringify(slot.endpoint) === JSON.stringify(endpoint) ? !slot.inLibrary : undefined
  }
  async function library(job: JobOf<"library">, target: Element | undefined): Promise<PageJobResult<JobOf<"library">>> {
    const route = ctx.handlers("library")[0]
    if (!route || !ctx.present(route)) return unavailable
    const inLibrary = inLibraryAfter(job.endpoint, target)
    if (inLibrary === undefined || !ctx.fire(route, () => ctx.port.service(job.endpoint))) return unavailable
    return { ok: true, data: { inLibrary }, route: route.id }
  }

  async function navigate(job: JobOf<"navigate">, scope: JobScope): Promise<PageJobResult<JobOf<"navigate">>> {
    const route = ctx.handlers("navigate")[0]
    if (!route || !ctx.present(route)) return unavailable
    const mix = Object.hasOwn(job.endpoint, "watchEndpoint") || Object.hasOwn(job.endpoint, "watchPlaylistEndpoint")
    if (mix && ctx.casting()) return unavailable
    const where = () => {
      let queue: unknown
      try {
        queue = ctx.port.items()
      } catch {}
      const ids = Array.isArray(queue) ? queue.map(item => String(field(queueRenderer(item), "navigationEndpoint", "watchEndpoint", "index"))) : []
      return JSON.stringify([options.location(), ids])
    }
    const before = where()
    if (!ctx.fire(route, () => ctx.port.navigate(job.endpoint))) return unavailable
    const changed = await ctx.until(scope, () => where() !== before, false)
    if (changed) return { ok: true, data: { navigated: true }, route: route.id }
    if (!scope.active) return { ok: false, reason: "unconfirmed" }
    ctx.notice("no-effect", route)
    return failed
  }
  return { like, library, navigate }
}
