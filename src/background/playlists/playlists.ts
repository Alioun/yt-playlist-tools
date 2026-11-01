import { cacheIsFresh, cacheRows, type AccountCache, type AccountKey, type CacheSite,
  type PlaylistId, type VideoId } from "../../shared/model"
import type { Job, JobData, JobInvocation, JobOf } from "../../shared/contracts/jobs"
import type { Privacy } from "../../shared/contracts/vocabulary"
import type { Listing } from "../../shared/picker/source"
import type { Requester, RoutingNeed, TabJobOutcome, Tabs } from "../tabs/ports"
import { planCacheAbsorption, type CacheAbsorption, type PlaylistCacheOwner, type PlaylistCacheRead,
  type PlaylistCacheWrite, type PlaylistCacheCapture } from "../store/playlist-cache"

export type PlaylistRequest = {
  readonly site: CacheSite
  readonly req: Requester
  readonly originalTab?: number
}
export type CachedListing = Omit<Listing, "at"> & { readonly at: number | null }
export type CacheDisposition = PlaylistCacheWrite | { readonly kind: "caller-owned"; readonly reason: "private" | "no-setup" | "disposed" }
export type ListPresent = {
  readonly kind: "list-present"
  readonly acct: AccountKey
  readonly site: CacheSite
  readonly private: boolean
  readonly at: number
  readonly ids: readonly PlaylistId[]
}
type ListJob = JobOf<"playlists">
type CreateJob = JobOf<"create">
export type ListRefresh =
  | { readonly kind: "listed"; readonly listing: Listing; readonly outcome: TabJobOutcome<ListJob>; readonly cache: CacheDisposition; readonly present: ListPresent }
  | { readonly kind: "not-listed"; readonly outcome: TabJobOutcome<ListJob>; readonly cached: CachedListing | null }
export type ListOpen =
  | { readonly kind: "open"; readonly cached: CachedListing | null; readonly freshness: "fresh" | "stale" | "absent"; readonly refresh: Promise<ListRefresh> | null }
  | { readonly kind: "unavailable"; readonly read: Exclude<PlaylistCacheRead, { kind: "cache" }> }
export type NewPlaylist = { readonly title: string; readonly privacy: Privacy; readonly videoId?: VideoId }
export type CreationAnswer =
  | { readonly kind: "invalid"; readonly problem: "required" | "angle-brackets" | "too-long" }
  | { readonly kind: "created"; readonly id: PlaylistId; readonly outcome: TabJobOutcome<CreateJob>; readonly cache: CacheDisposition }
  | { readonly kind: "not-created"; readonly outcome: TabJobOutcome<CreateJob> }
  | { readonly kind: "unavailable"; readonly read: Exclude<PlaylistCacheRead, { kind: "cache" }> }
export type Creation = { submit(playlist: NewPlaylist): Promise<CreationAnswer> }
export type AbsorbScope =
  | { readonly kind: "eligible"; readonly capture: PlaylistCacheCapture; readonly acct: AccountKey; readonly site: CacheSite; readonly private: false }
  | { readonly kind: "caller-owned"; readonly reason: "private" | "no-setup"; readonly acct: AccountKey; readonly site: CacheSite; readonly private: boolean }
export type AbsorbAnswer = { readonly kind: "list"; readonly rows: Readonly<JobData<ListJob>> } |
  { readonly kind: "membership"; readonly rows: Readonly<JobData<JobOf<"membership">>> }
export type AbsorbReceipt = { readonly kind: "membership"; readonly cache: CacheDisposition } |
  { readonly kind: "list"; readonly cache: CacheDisposition; readonly present: ListPresent }
export type Playlists = {
  list(acct: AccountKey, options: PlaylistRequest & { readonly refresh?: boolean }): Promise<ListOpen>
  create(acct: AccountKey, options: PlaylistRequest): Creation
  resolveChannel(input: string, req: Requester, originalTab?: number): Promise<TabJobOutcome<JobOf<"resolveChannel">>>
  capture(acct: AccountKey, request: PlaylistRequest): Promise<AbsorbScope | Exclude<PlaylistCacheRead, { kind: "cache" }>>
  absorb(scope: AbsorbScope, answer: AbsorbAnswer): Promise<AbsorbReceipt>
  dispose(): void
}
type RefreshWork = { readonly outcome: TabJobOutcome<ListJob> } & (
  | { readonly kind: "listed"; readonly snapshot: AccountCache; readonly at: number; readonly cache: CacheDisposition; readonly ids: readonly PlaylistId[] }
  | { readonly kind: "not-listed" }
)
type RefreshSlot = { readonly capture: PlaylistCacheCapture; readonly originalTab: number | undefined; readonly work: Promise<RefreshWork> }

function copyRequest(request: PlaylistRequest): PlaylistRequest {
  return { site: request.site, req: { ...request.req }, ...(request.originalTab === undefined ? {} : { originalTab: request.originalTab }) }
}
function cachedListing(cache: AccountCache | null, site: CacheSite): CachedListing | null {
  return cache === null ? null : { rows: cacheRows(cache, site), at: cache.listAt }
}
function titleProblem(title: string): Extract<CreationAnswer, { kind: "invalid" }>["problem"] | null {
  const trimmed = title.trim()
  if (!trimmed) return "required"
  if (/[<>]/.test(trimmed)) return "angle-brackets"
  return [...trimmed].length > 150 ? "too-long" : null
}

export function createPlaylists(ports: {
  readonly owner: PlaylistCacheOwner
  readonly tabs: Pick<Tabs, "serve" | "runIn">
  readonly now: () => number
}): Playlists {
  let disposed = false
  const refreshing = new Map<AccountKey, RefreshSlot>()
  const scopes = new WeakSet<AbsorbScope>()
  function run<J extends Job>(invocation: JobInvocation<J>, request: PlaylistRequest, need: RoutingNeed): Promise<TabJobOutcome<J>> {
    if (disposed) return Promise.resolve({ kind: "guard", reason: "disposed" })
    return request.originalTab === undefined ? ports.tabs.serve<J>(invocation, need) : ports.tabs.runIn<J>(request.originalTab, invocation, need)
  }
  function accountNeed(acct: AccountKey, request: PlaylistRequest, site: CacheSite = request.site): RoutingNeed {
    return { site, req: request.req, account: { kind: "account", acct, signedIn: true } }
  }
  function scopeOf(acct: AccountKey, request: PlaylistRequest, read: Extract<PlaylistCacheRead, { kind: "cache" }>): AbsorbScope {
    const scope: AbsorbScope = request.req.incognito
      ? Object.freeze({ kind: "caller-owned", reason: "private", acct, site: request.site, private: true })
      : read.authority.kind === "eligible"
        ? Object.freeze({ kind: "eligible", capture: read.authority.capture, acct, site: request.site, private: false })
        : Object.freeze({ kind: "caller-owned", reason: read.authority.reason, acct, site: request.site, private: false })
    scopes.add(scope)
    return scope
  }
  async function persist(scope: AbsorbScope, input: CacheAbsorption): Promise<CacheDisposition> {
    if (disposed) return { kind: "caller-owned", reason: "disposed" }
    if (!scopes.delete(scope) || scope.acct !== input.acct || scope.site !== input.site) return { kind: "refused", reason: "capture" }
    if (scope.kind === "caller-owned") return { kind: "caller-owned", reason: scope.reason }
    return ports.owner.absorbPlaylistCache(scope.capture, input)
  }
  async function fetchList(acct: AccountKey, request: PlaylistRequest, read: Extract<PlaylistCacheRead, { kind: "cache" }>): Promise<RefreshWork> {
    const scope = scopeOf(acct, { ...request, site: "www" }, read)
    // The existing playlists job is supported on www only. Display order remains scoped to the caller's site.
    const outcome = await run<ListJob>({ job: { kind: "playlists" }, acct }, request, accountNeed(acct, request, "www"))
    if (outcome.kind !== "result" || !outcome.result.ok) { scopes.delete(scope); return { kind: "not-listed", outcome } }
    const at = ports.now()
    const input: CacheAbsorption = { kind: "list", acct, site: "www", at, rows: outcome.result.data }
    const cache = await persist(scope, input)
    const snapshot = cache.kind === "committed" || cache.kind === "unchanged" ? cache.cache : planCacheAbsorption(read.cache, input, at)
    return { kind: "listed", outcome, at, cache, snapshot, ids: outcome.result.data.map(row => row.id) }
  }
  function refresh(acct: AccountKey, request: PlaylistRequest, read: Extract<PlaylistCacheRead, { kind: "cache" }>): Promise<RefreshWork> {
    if (request.req.incognito || read.authority.kind !== "eligible") return fetchList(acct, request, read)
    const pending = refreshing.get(acct)
    if (pending) {
      if (pending.capture.sharesAuthority(read.authority.capture) && (request.originalTab === undefined || request.originalTab === pending.originalTab)) return pending.work
      return pending.work.then(() => refresh(acct, request, read))
    }
    const work = fetchList(acct, request, read)
    const slot: RefreshSlot = { capture: read.authority.capture, originalTab: request.originalTab, work }
    refreshing.set(acct, slot)
    const clear = () => { if (refreshing.get(acct) === slot) refreshing.delete(acct) }
    void work.then(clear, clear)
    return work
  }
  const service: Playlists = {
    async list(acct, options) {
      if (disposed) return { kind: "unavailable", read: { kind: "unavailable", reason: "disposed" } }
      const request = copyRequest(options), explicit = options.refresh === true
      const read = await ports.owner.readPlaylistCache({ acct, private: request.req.incognito })
      if (read.kind !== "cache") return { kind: "unavailable", read }
      const cached = cachedListing(read.cache, request.site)
      const freshness = read.cache === null ? "absent" : cacheIsFresh(read.cache, ports.now()) ? "fresh" : "stale"
      if (disposed) return { kind: "unavailable", read: { kind: "unavailable", reason: "disposed" } }
      if (!explicit && freshness === "fresh") return { kind: "open", cached, freshness, refresh: null }
      const answer = refresh(acct, request, read).then((work): ListRefresh => work.kind === "not-listed"
        ? { kind: "not-listed", outcome: work.outcome, cached }
        : { kind: "listed", listing: { rows: cacheRows(work.snapshot, request.site), at: work.at }, outcome: work.outcome, cache: work.cache,
          present: { kind: "list-present", acct, site: "www", private: request.req.incognito, at: work.at, ids: [...work.ids] } })
      return { kind: "open", cached, freshness, refresh: answer }
    },
    create(acct, options) {
      const request = copyRequest(options)
      let submitted: Promise<CreationAnswer> | undefined
      return { submit(playlist) {
        if (submitted) return submitted
        const problem = titleProblem(playlist.title)
        if (problem) return Promise.resolve({ kind: "invalid", problem })
        const job: CreateJob = { kind: "create", title: playlist.title.trim(), privacy: playlist.privacy,
          ...(playlist.videoId === undefined ? {} : { videoId: playlist.videoId }) }
        submitted = (async (): Promise<CreationAnswer> => {
          const read = await ports.owner.readPlaylistCache({ acct, private: request.req.incognito })
          if (read.kind !== "cache") return { kind: "unavailable", read }
          const scope = scopeOf(acct, request, read)
          const outcome = await run<CreateJob>({ job, acct }, request, accountNeed(acct, request))
          if (outcome.kind !== "result" || !outcome.result.ok) { scopes.delete(scope); return { kind: "not-created", outcome } }
          const id = outcome.result.data.playlistId
          const cache = await persist(scope, { kind: "created", acct, site: request.site, at: ports.now(), row: { id, title: job.title, privacy: job.privacy } })
          return { kind: "created", id, outcome, cache }
        })()
        return submitted
      } }
    },
    resolveChannel(input, req, originalTab) {
      const request: PlaylistRequest = { site: "www", req: { ...req }, ...(originalTab === undefined ? {} : { originalTab }) }
      return run<JobOf<"resolveChannel">>({ job: { kind: "resolveChannel", input: input.trim() } }, request,
        { site: "www", req: request.req, account: { kind: "any" } })
    },
    async capture(acct, request) {
      if (disposed) return { kind: "unavailable", reason: "disposed" }
      const copy = copyRequest(request)
      const read = await ports.owner.readPlaylistCache({ acct, private: copy.req.incognito })
      return disposed ? { kind: "unavailable", reason: "disposed" } : read.kind === "cache" ? scopeOf(acct, copy, read) : read
    },
    async absorb(scope, answer) {
      const at = ports.now(), captured = structuredClone(answer)
      const cache = await persist(scope, { ...captured, acct: scope.acct, site: scope.site, at })
      return captured.kind === "membership" ? { kind: "membership", cache } : { kind: "list", cache,
        present: { kind: "list-present", acct: scope.acct, site: scope.site, private: scope.private, at, ids: captured.rows.map(row => row.id) } }
    },
    dispose() { disposed = true; refreshing.clear() }
  }
  return service
}
