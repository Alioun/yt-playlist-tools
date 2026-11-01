import type { ItemInfo, JobFailure, MusicAdEvidence, NowPlaying } from "../../shared/contracts"
import { isMusicAdFailure } from "../../shared/contracts"
import { isChannelId, isPlaylistId, isVideoId } from "../../shared/model/validation"
import type { VideoId, PlaylistId } from "../../shared/model"
import type { PageLink } from "./page-link"
import type { Pointer, PointerFacts } from "./pointer"
import { Scope, type Dispose, type ScopeOptions } from "./scope"

export type MusicFamily = "responsive-row" | "two-row-card" | "queue-item" | "header"
export type MusicLinkIdentity =
  | { readonly kind: "watch"; readonly videoId: VideoId; readonly origin: string }
  | { readonly kind: "playlist"; readonly playlistId: PlaylistId; readonly origin: string }
  | { readonly kind: "browse"; readonly browseId: string; readonly origin: string }
const targetAuthority: unique symbol = Symbol("Music item target")
export type MusicItemTarget = {
  readonly [targetAuthority]: true
  readonly element: Element
  readonly family: MusicFamily
  readonly identity: MusicLinkIdentity | { readonly kind: "queue" }
  readonly signature: string
}
export type MusicPointed =
  | { readonly kind: "pointed-item"; readonly target: MusicItemTarget }
  | { readonly kind: "unrecognised-item"; readonly element: Element }
  | { readonly kind: "no-pointed-item"; readonly reason: "ordinary" | "outside" | "player" | "fullscreen" | "inactive" }
export type MusicPlayback =
  | { readonly kind: "song"; readonly song: NowPlaying }
  | { readonly kind: "nothing-playing" }
  | { readonly kind: "ad-playing"; readonly evidence: MusicAdEvidence }
  | { readonly kind: "unavailable"; readonly failure: JobFailure }
export type MusicAction = "save" | "playlist-shortcut" | "next" | "end" | "remove" | "move" | "like" | "library" | "mix" | "album" | "artist"
export type MusicQueueDisposition = "insert-copy" | "move-existing"
export type MusicUnsupported = "queue-only" | "autoplay" | "songs-only" | "action-unavailable"
export type MusicResolution =
  | { readonly kind: "pointed-item"; readonly target: MusicItemTarget; readonly item: ItemInfo; readonly queueDisposition: MusicQueueDisposition }
  | { readonly kind: "unsupported-item"; readonly target: MusicItemTarget; readonly item: ItemInfo; readonly action: MusicAction; readonly reason: MusicUnsupported }
  | { readonly kind: "unrecognised-item"; readonly element: Element }
  | { readonly kind: "current-song"; readonly song: NowPlaying; readonly queueDisposition: "insert-copy" }
  | Exclude<MusicPlayback, { kind: "song" }>
  | { readonly kind: "detail-failed"; readonly target: MusicItemTarget; readonly failure: JobFailure }
  | { readonly kind: "no-queue-target" }
  | { readonly kind: "stale-target"; readonly reason: "lifetime" | "navigation" | "identity" | "page-state" }
  | { readonly kind: "inactive" }
export type MusicItemFailure = {
  readonly kind: "item-unrecognised"
  readonly site: "music"
  readonly source: PointerFacts["kind"]
  readonly element: Element
}
export interface MusicItemReporter { itemUnrecognised(facts: MusicItemFailure): void }
export type MusicItemsOptions = ScopeOptions & {
  readonly pointer: Pick<Pointer, "track" | "read">
  readonly page: Pick<PageLink, "run" | "watch" | "onState" | "state">
  readonly report: MusicItemReporter
}

const families: readonly { selector: string; family: MusicFamily }[] = [
  { selector: "ytmusic-responsive-list-item-renderer", family: "responsive-row" },
  { selector: "ytmusic-two-row-item-renderer", family: "two-row-card" },
  { selector: "ytmusic-player-queue-item", family: "queue-item" },
  { selector: "ytmusic-responsive-header-renderer", family: "header" }
]
const boundaries = "html, body, main, [role='main'], ytmusic-app, ytmusic-browse-response, ytmusic-search-page, ytmusic-section-list-renderer, ytmusic-shelf-renderer, ytmusic-playlist-shelf-renderer, #contents, #content, #items"
const queuePanel = "ytmusic-player-queue"
const playerBar = "ytmusic-player-bar"
const nothing: Dispose = () => {}
const unavailable: JobFailure = { ok: false, reason: "unavailable" }

function identityKey(identity: MusicLinkIdentity): string {
  return JSON.stringify(identity)
}
function linkIdentity(element: Element, artists: boolean): MusicLinkIdentity | undefined {
  const href = element.getAttribute("href")
  if (href === null) return undefined
  let url: URL
  try { url = new URL(href, "https://music.youtube.com/") } catch { return undefined }
  if (url.protocol !== "https:" || url.port || url.username || url.password ||
      !["music.youtube.com", "www.youtube.com", "youtube.com"].includes(url.hostname)) return undefined
  const origin = url.origin
  if (url.pathname === "/watch") {
    const videoId = url.searchParams.get("v")
    const list = url.searchParams.get("list")
    if (url.searchParams.getAll("v").length !== 1 || !isVideoId(videoId) ||
        url.searchParams.getAll("list").length > 1 || list !== null && !isPlaylistId(list)) return undefined
    return { kind: "watch", videoId, origin }
  }
  if (url.pathname === "/playlist") {
    const playlistId = url.searchParams.get("list")
    return url.searchParams.getAll("list").length === 1 && isPlaylistId(playlistId) ? { kind: "playlist", playlistId, origin } : undefined
  }
  const match = /^\/browse\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)
  const browseId = match?.[1]
  if (!browseId || browseId.length > 102) return undefined
  if (/^MPRE[A-Za-z0-9_-]+$/.test(browseId) || browseId.startsWith("VL") && isPlaylistId(browseId.slice(2)) || artists && isChannelId(browseId)) {
    return { kind: "browse", browseId, origin }
  }
  return undefined
}
function linkCensus(element: Element, artists = false) {
  const identities = new Map<string, MusicLinkIdentity>()
  const hrefs: string[] = []
  let malformed = false
  for (const link of [element, ...element.querySelectorAll("a[href]")]) {
    const href = link.getAttribute("href")
    if (href === null) continue
    hrefs.push(href)
    const identity = linkIdentity(link, artists)
    if (identity) identities.set(identityKey(identity), identity)
    else if (/watch(?:\?|$)|playlist(?:\?|$)|\/browse\/(?:MPRE|VL)/.test(href)) malformed = true
  }
  return { identities: [...identities.values()], hrefs: hrefs.sort(), malformed }
}
function looksLikeMusicItem(element: Element): boolean {
  if (element.closest(queuePanel)) return true
  let ancestor: Element | null = element
  for (let depth = 0; ancestor && depth <= 6; depth++, ancestor = ancestor.parentElement) {
    if (ancestor.matches(boundaries)) break
    if (linkCensus(ancestor).identities.length === 1) return true
  }
  return false
}
export function recogniseMusicItem(element: Element): MusicPointed {
  if (element.closest(playerBar)) return { kind: "no-pointed-item", reason: "player" }
  let ancestor: Element | null = element
  while (ancestor && !ancestor.matches(boundaries)) {
    const row = families.find(candidate => ancestor?.matches(candidate.selector))
    if (row) {
      const census = linkCensus(ancestor, true)
      const watches = census.identities.filter(identity => identity.kind === "watch")
      const content = census.identities.filter(identity => identity.kind !== "browse" || !isChannelId(identity.browseId))
      const identities = watches.length ? watches : content.length ? content : census.identities
      const identity = identities[0]
      if (census.malformed || identities.length > 1 || !identity && row.family !== "queue-item") {
        return { kind: "unrecognised-item", element: ancestor }
      }
      const admitted: MusicItemTarget["identity"] = identity ?? { kind: "queue" }
      return { kind: "pointed-item", target: {
        [targetAuthority]: true, element: ancestor, family: row.family, identity: admitted,
        signature: JSON.stringify([row.family, admitted, census.hrefs])
      } }
    }
    ancestor = ancestor.parentElement
  }
  return looksLikeMusicItem(element) ? { kind: "unrecognised-item", element } : { kind: "no-pointed-item", reason: "ordinary" }
}
function itemAgrees(target: MusicItemTarget, item: ItemInfo): boolean {
  if (target.family === "queue-item" && item.queueItemId === undefined) return false
  switch (target.identity.kind) {
    case "watch": return item.videoId === target.identity.videoId
    case "playlist": return item.kind === "playlist"
    case "browse": return target.identity.browseId.startsWith("MPRE") ? item.kind === "album"
      : target.identity.browseId.startsWith("VL") ? item.kind === "playlist" : item.kind === "artist"
    case "queue": return item.queueItemId !== undefined && item.videoId !== undefined
  }
}
function sameItem(left: ItemInfo, right: ItemInfo): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
export function musicUnsupported(item: ItemInfo, family: MusicFamily, action: MusicAction): MusicUnsupported | undefined {
  if (action === "remove" && (family !== "queue-item" || !item.endpoints.remove)) return "queue-only"
  if ((action === "next" || action === "end" || action === "move") && item.autoplay) return "autoplay"
  if ((action === "save" || action === "playlist-shortcut") && (item.kind === "album" || item.kind === "playlist" || item.kind === "artist")) {
    return "songs-only"
  }
  const available = action === "playlist-shortcut" ? item.endpoints.save !== undefined
    : action === "move" ? family === "queue-item" && !item.selected && !item.autoplay
    : item.endpoints[action] !== undefined
  return available ? undefined : "action-unavailable"
}

type Tracking = { readonly scope: Scope; revision: number; playbackRevision: number; navigation: Dispose | undefined }
type Lease = { release: Dispose }
type Authority = { readonly tracking: Tracking; readonly revision: number; readonly item: ItemInfo }

export class MusicItems {
  private readonly leases = new Set<Lease>()
  private readonly authorities = new WeakMap<MusicItemTarget, Authority>()
  private tracking: Tracking | undefined
  private ended = false

  constructor(private readonly options: MusicItemsOptions) {}

  track(owner: Scope): Dispose {
    if (this.ended || owner.disposed) return nothing
    const lease: Lease = { release: nothing }
    this.leases.add(lease)
    lease.release = owner.add(() => {
      this.leases.delete(lease)
      if (this.leases.size === 0) this.stop()
    })
    if (!this.tracking && this.leases.has(lease)) {
      try { this.start() } catch (error) { lease.release(); throw error }
    }
    return lease.release
  }
  private live(tracking: Tracking): boolean {
    return !this.ended && this.tracking === tracking && !tracking.scope.disposed
  }
  private start(): void {
    const tracking: Tracking = { scope: new Scope(this.options), revision: 0, playbackRevision: 0, navigation: undefined }
    this.tracking = tracking
    try {
      this.options.pointer.track(tracking.scope)
      tracking.scope.add(this.options.page.watch("nowPlaying", () => {
        if (this.live(tracking)) tracking.playbackRevision++
      }))
      tracking.scope.add(this.options.page.onState(state => {
        if (!this.live(tracking)) return
        tracking.revision++
        if (state.kind !== "ready") {
          const stop = tracking.navigation
          tracking.navigation = undefined
          stop?.()
        } else if (!tracking.navigation) {
          tracking.navigation = tracking.scope.add(this.options.page.watch("nav", () => {
            if (this.live(tracking)) tracking.revision++
          }))
        }
      }))
    } catch (error) {
      this.stop()
      throw error
    }
  }
  private stop(): void {
    const tracking = this.tracking
    this.tracking = undefined
    tracking?.scope.dispose()
  }
  private pointed(facts: PointerFacts): MusicPointed {
    if (this.options.document.fullscreenElement) return { kind: "no-pointed-item", reason: "fullscreen" }
    if (facts.kind === "none") return { kind: "no-pointed-item", reason: facts.reason === "inactive" ? "inactive" : "outside" }
    for (const element of facts.stack) {
      const result = recogniseMusicItem(element)
      if (result.kind !== "no-pointed-item" || result.reason === "player") return result
    }
    return { kind: "no-pointed-item", reason: "ordinary" }
  }
  readPointed(): MusicPointed {
    return this.tracking && this.live(this.tracking) ? this.pointed(this.options.pointer.read()) : { kind: "no-pointed-item", reason: "inactive" }
  }
  private stale(tracking: Tracking, revision: number, target?: MusicItemTarget): Extract<MusicResolution, { kind: "stale-target" }> | undefined {
    if (!this.live(tracking)) return { kind: "stale-target", reason: "lifetime" }
    if (tracking.revision !== revision) return { kind: "stale-target", reason: "navigation" }
    if (this.options.page.state.kind !== "ready") return { kind: "stale-target", reason: "page-state" }
    if (target) {
      if (!target.element.isConnected || target.element.ownerDocument !== this.options.document) return { kind: "stale-target", reason: "identity" }
      const fresh = recogniseMusicItem(target.element)
      if (fresh.kind !== "pointed-item" || fresh.target.element !== target.element || fresh.target.signature !== target.signature) {
        return { kind: "stale-target", reason: "identity" }
      }
    }
    return undefined
  }
  private async details(tracking: Tracking, revision: number, target: MusicItemTarget, action?: MusicAction): Promise<MusicResolution> {
    const playbackRevision = tracking.playbackRevision
    const scope = new Scope(this.options)
    const release = tracking.scope.add(() => scope.dispose())
    let changed = false
    try {
      scope.observe(target.element, { attributes: true, childList: true, subtree: true, characterData: true }, () => { changed = true })
      const parent = target.element.parentElement
      if (parent) scope.observe(parent, { childList: true }, records => {
        if (records.some(record => [...record.removedNodes].includes(target.element))) changed = true
      })
      const first = await this.options.page.run({ job: { kind: "itemInfo" } }, { target: target.element })
      const stale = this.stale(tracking, revision, target)
      if (stale) return stale
      if (changed) return { kind: "stale-target", reason: "identity" }
      if (!first.ok) return { kind: "detail-failed", target, failure: first }
      if (!itemAgrees(target, first.data)) return { kind: "stale-target", reason: "identity" }
      const fresh = await this.options.page.run({ job: { kind: "itemInfo" } }, { target: target.element })
      const staleAgain = this.stale(tracking, revision, target)
      if (staleAgain) return staleAgain
      if (changed) return { kind: "stale-target", reason: "identity" }
      if (!fresh.ok) return { kind: "detail-failed", target, failure: fresh }
      if (!sameItem(first.data, fresh.data) || !itemAgrees(target, fresh.data)) return { kind: "stale-target", reason: "identity" }
      const item = fresh.data
      if (action) {
        const reason = musicUnsupported(item, target.family, action)
        if (reason) {
          this.authorities.set(target, { tracking, revision, item })
          return { kind: "unsupported-item", target, item, action, reason }
        }
      }
      if (target.family === "queue-item" && item.selected) {
        const playback = await this.options.page.run({ job: { kind: "nowPlaying" } })
        const stalePlayback = this.stale(tracking, revision, target)
        if (stalePlayback) return stalePlayback
        if (changed) return { kind: "stale-target", reason: "identity" }
        if (!playback.ok && !isMusicAdFailure(playback)) return { kind: "detail-failed", target, failure: playback }
        if (playback.ok && (playback.data === null || playback.data.videoId !== item.videoId)) return { kind: "detail-failed", target, failure: unavailable }
        const final = await this.options.page.run({ job: { kind: "itemInfo" } }, { target: target.element })
        const staleFinal = this.stale(tracking, revision, target)
        if (staleFinal) return staleFinal
        if (changed || tracking.playbackRevision !== playbackRevision || !final.ok || !sameItem(item, final.data)) return { kind: "stale-target", reason: "identity" }
        const confirmed = await this.options.page.run({ job: { kind: "nowPlaying" } })
        const staleConfirmed = this.stale(tracking, revision, target)
        if (staleConfirmed) return staleConfirmed
        if (changed || tracking.playbackRevision !== playbackRevision) return { kind: "stale-target", reason: "identity" }
        if (!playback.ok) {
          if (!isMusicAdFailure(confirmed) || confirmed.detail.evidence !== playback.detail.evidence) return { kind: "stale-target", reason: "identity" }
          return { kind: "ad-playing", evidence: confirmed.detail.evidence }
        }
        if (!confirmed.ok || JSON.stringify(playback.data) !== JSON.stringify(confirmed.data)) return { kind: "stale-target", reason: "identity" }
      }
      this.authorities.set(target, { tracking, revision, item })
      return { kind: "pointed-item", target, item,
        queueDisposition: target.family === "queue-item" && !item.selected ? "move-existing" : "insert-copy" }
    } finally { release() }
  }
  async resolve(action?: MusicAction): Promise<MusicResolution> {
    const tracking = this.tracking
    if (!tracking || !this.live(tracking)) return { kind: "inactive" }
    if (this.options.page.state.kind !== "ready") return { kind: "unavailable", failure: unavailable }
    const revision = tracking.revision
    const playbackRevision = tracking.playbackRevision
    const facts = this.options.pointer.read()
    const pointed = this.pointed(facts)
    if (pointed.kind === "unrecognised-item") {
      this.options.report.itemUnrecognised({ kind: "item-unrecognised", site: "music", source: facts.kind, element: pointed.element })
      return pointed
    }
    if (pointed.kind === "pointed-item") return this.details(tracking, revision, pointed.target, action)
    if (action === "remove") return { kind: "no-queue-target" }
    const answer = await this.options.page.run({ job: { kind: "nowPlaying" } })
    const stale = this.stale(tracking, revision)
    if (stale) return stale
    if (!answer.ok && !isMusicAdFailure(answer)) return { kind: "unavailable", failure: answer }
    const fresh = await this.options.page.run({ job: { kind: "nowPlaying" } })
    const staleAgain = this.stale(tracking, revision)
    if (staleAgain) return staleAgain
    if (!fresh.ok) {
      if (!isMusicAdFailure(fresh)) return { kind: "unavailable", failure: fresh }
      if (tracking.playbackRevision !== playbackRevision || answer.ok || answer.detail.evidence !== fresh.detail.evidence) return { kind: "stale-target", reason: "identity" }
      return { kind: "ad-playing", evidence: fresh.detail.evidence }
    }
    if (!answer.ok || tracking.playbackRevision !== playbackRevision || JSON.stringify(answer.data) !== JSON.stringify(fresh.data)) return { kind: "stale-target", reason: "identity" }
    return fresh.data === null ? { kind: "nothing-playing" } : { kind: "current-song", song: fresh.data, queueDisposition: "insert-copy" }
  }
  async refresh(target: MusicItemTarget, action?: MusicAction): Promise<MusicResolution> {
    const authority = this.authorities.get(target)
    const tracking = this.tracking
    if (!tracking || !this.live(tracking)) return { kind: "inactive" }
    if (!authority || authority.tracking !== tracking || authority.revision !== tracking.revision) return { kind: "stale-target", reason: "lifetime" }
    const stale = this.stale(tracking, tracking.revision, target)
    if (stale) return stale
    const fresh = await this.details(tracking, tracking.revision, target, action)
    if ((fresh.kind === "pointed-item" || fresh.kind === "unsupported-item") &&
        (fresh.item.kind !== authority.item.kind || fresh.item.videoId !== authority.item.videoId || JSON.stringify(fresh.item.type) !== JSON.stringify(authority.item.type))) {
      this.authorities.delete(target)
      return { kind: "stale-target", reason: "identity" }
    }
    return fresh
  }
  dispose(): void {
    if (this.ended) return
    this.ended = true
    for (const lease of [...this.leases]) lease.release()
    this.stop()
  }
}
