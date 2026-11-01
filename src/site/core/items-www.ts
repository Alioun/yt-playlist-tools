import type { JobFailure, NavData, VideoInfo } from "../../shared/contracts"
import type { AnchorId } from "../../shared/features/registry"
import { isVideoId } from "../../shared/model/validation"
import type { PageLink } from "./page-link"
import type { Pointer, PointerFacts } from "./pointer"
import { Scope, type Dispose, type ScopeOptions } from "./scope"

export type WwwCardFamily = "lockup" | "video" | "rich-grid" | "grid" | "compact" | "playlist-panel" | "playlist-row" | "shorts"
export type WwwUnsupportedKind = "playlist" | "mix" | "channel" | "post" | "ad"
export type WwwNoPointReason = "ordinary" | "outside" | "player" | "fullscreen" | "inactive"
export type WwwItemTarget = {
  readonly element: Element
  readonly family: WwwCardFamily
  readonly identity: Readonly<Pick<VideoInfo, "videoId" | "kind">> & { readonly signature: string }
}
export type WwwPointed =
  | { readonly kind: "pointed-item"; readonly target: WwwItemTarget }
  | { readonly kind: "unsupported-item"; readonly element: Element; readonly reason: WwwUnsupportedKind }
  | { readonly kind: "unrecognised-item"; readonly element: Element }
  | { readonly kind: "no-pointed-item"; readonly reason: WwwNoPointReason }
export type WwwResolution = Exclude<WwwPointed, { kind: "pointed-item" | "no-pointed-item" }>
  | { readonly kind: "pointed-item"; readonly target: WwwItemTarget; readonly video: VideoInfo }
  | { readonly kind: "current-video"; readonly video: VideoInfo }
  | { readonly kind: "current-unavailable"; readonly failure: JobFailure }
  | { readonly kind: "detail-failed"; readonly target: WwwItemTarget; readonly failure: JobFailure }
  | { readonly kind: "stale-target"; readonly reason: "lifetime" | "navigation" | "identity" | "page-state" }
  | { readonly kind: "inactive" }
export type WwwItemFailure = {
  readonly kind: "item-unrecognised"
  readonly site: "www"
  readonly source: PointerFacts["kind"]
  readonly element: Element
}
export type WwwSettleObservation = {
  readonly kind: "page-settle"
  readonly site: "www"
  readonly anchor: Extract<AnchorId, "www-cards">
  readonly navigation: Pick<NavData, "pageType" | "navigation">
  readonly delayMs: 3000
  readonly relevant: boolean
  readonly visible: boolean
  readonly distinctMainLinks: number
  readonly recognised: number
  readonly anchorMissing: boolean
}
export interface WwwItemReporter {
  itemUnrecognised(facts: WwwItemFailure): void
  pageSettled(facts: WwwSettleObservation): void
}
export type WwwItemsOptions = ScopeOptions & {
  readonly pointer: Pick<Pointer, "track" | "read">
  readonly page: Pick<PageLink, "run" | "watch" | "onState" | "state">
  readonly report: WwwItemReporter
}

const families: readonly { selector: string; family: WwwCardFamily }[] = [
  { selector: "yt-lockup-view-model", family: "lockup" },
  { selector: "ytd-video-renderer", family: "video" },
  { selector: "ytd-rich-grid-media", family: "rich-grid" },
  { selector: "ytd-grid-video-renderer", family: "grid" },
  { selector: "ytd-compact-video-renderer", family: "compact" },
  { selector: "ytd-playlist-panel-video-renderer", family: "playlist-panel" },
  { selector: "ytd-playlist-video-renderer", family: "playlist-row" },
  { selector: "ytm-shorts-lockup-view-model", family: "shorts" }
]
const cards = families.map(row => row.selector).join(",")
const players = "#movie_player, #shorts-player, ytd-player, ytd-miniplayer, .html5-video-player"
const previews = "#video-preview, ytd-video-preview, #inline-preview-player"
const excluded = `${players}, #description, ytd-text-inline-expander, #comments, ytd-comments`
const boundaries = "html, body, main, [role='main'], ytd-app, ytd-page-manager, ytd-browse, ytd-search, ytd-watch-flexy, ytd-rich-grid-renderer, ytd-item-section-renderer, ytd-section-list-renderer, #contents, #content, #items, #primary, #secondary"
const ads = "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-sparkles-text-search-renderer"
const channels = "ytd-channel-renderer, ytd-grid-channel-renderer, ytd-compact-channel-renderer"
const posts = "ytd-backstage-post-renderer, ytd-post-renderer, ytd-post-thread-renderer, ytd-backstage-post-thread-renderer"
const collections = "ytd-playlist-renderer, ytd-grid-playlist-renderer, ytd-compact-playlist-renderer, ytd-radio-renderer, ytd-compact-radio-renderer"
const stacks = "yt-collection-thumbnail-view-model, yt-collections-stack, yt-collection-stack-view-model, .ytCollectionsStackHost, .ytLockupViewModelCollectionStack, .yt-lockup-view-model__collection-stack"
const nothing: Dispose = () => {}

function linkUrl(element: Element): URL | undefined {
  const href = element.getAttribute("href")
  if (href === null) return undefined
  try {
    const url = new URL(href, "https://www.youtube.com/")
    return url.protocol === "https:" && (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") ? url : undefined
  } catch { return undefined }
}
export function linkedVideo(element: Element): Pick<VideoInfo, "videoId" | "kind"> | undefined {
  const url = linkUrl(element)
  if (!url) return undefined
  const short = /^\/shorts\/([^/]+)\/?$/.exec(url.pathname)
  const videoId = url.pathname === "/watch" ? url.searchParams.get("v") : short?.[1]
  return isVideoId(videoId) ? { videoId, kind: short ? "short" : "video" } : undefined
}
function videoLinks(element: Element): Map<VideoInfo["videoId"], Pick<VideoInfo, "videoId" | "kind">> {
  const result = new Map<VideoInfo["videoId"], Pick<VideoInfo, "videoId" | "kind">>()
  for (const link of [element, ...element.querySelectorAll("a[href]")]) {
    if (link.closest(players)) continue
    const video = linkedVideo(link)
    if (video) result.set(video.videoId, video)
  }
  return result
}
function looksLikeItem(element: Element): boolean {
  if (element.closest(players)) return false
  const anchor = element.closest("a[href]")
  if (anchor && linkedVideo(anchor)) return true
  if (element.closest(excluded)) return false
  let local: Element | null = element
  for (let depth = 0; local && depth < 6; depth++, local = local.parentElement) {
    if (local.matches(boundaries)) break
    if (videoLinks(local).size === 1) return true
  }
  return false
}
function collectionKind(element: Element): "playlist" | "mix" | undefined {
  let kind: "playlist" | "mix" | undefined
  for (const link of element.querySelectorAll("a[href]")) {
    const url = linkUrl(link)
    if (url?.pathname !== "/playlist" || !url.searchParams.get("list")) continue
    kind = url.searchParams.get("list")?.startsWith("RD") ? "mix" : "playlist"
    if (kind === "mix") return kind
  }
  if (kind) return kind
  if (element.matches(collections) || element.querySelector(stacks) ||
      element.querySelector("[aria-label='Play all'], [aria-label='Play All'], [title='Play all']") ||
      [...element.querySelectorAll("ytd-thumbnail-overlay-hover-text-renderer, yt-thumbnail-overlay-hover-text-view-model")]
        .some(scrim => scrim.textContent?.trim().toLowerCase() === "play all")) return "playlist"
  return undefined
}

export function recogniseWwwItem(element: Element): WwwPointed {
  if (element.closest(previews)) return { kind: "no-pointed-item", reason: "ordinary" }
  if (element.closest(players)) return { kind: "no-pointed-item", reason: "player" }
  const ad = element.closest(ads)
  if (ad) return { kind: "unsupported-item", element: ad, reason: "ad" }
  const channel = element.closest(channels)
  if (channel) return { kind: "unsupported-item", element: channel, reason: "channel" }
  const post = element.closest(posts)
  if (post) return { kind: "unsupported-item", element: post, reason: "post" }
  const collectionCard = element.closest(collections)
  if (collectionCard) return { kind: "unsupported-item", element: collectionCard,
    reason: collectionCard.matches("ytd-radio-renderer, ytd-compact-radio-renderer") ? "mix" : collectionKind(collectionCard) ?? "playlist" }
  const card = element.closest(`${cards}, ${collections}`)
  if (card) {
    const collection = collectionKind(card)
    if (collection) return { kind: "unsupported-item", element: card, reason: collection }
    const linked = videoLinks(card)
    if (linked.size === 0 && [...card.querySelectorAll("a[href]")].some(link => {
      const url = linkUrl(link)
      return url?.pathname.startsWith("/@") || url?.pathname.startsWith("/channel/") || url?.pathname.startsWith("/c/")
    })) return { kind: "unsupported-item", element: card, reason: "channel" }
    if ([...card.querySelectorAll("a[href]")].some(link => linkUrl(link)?.pathname.startsWith("/post/"))) {
      return { kind: "unsupported-item", element: card, reason: "post" }
    }
    const video = linked.values().next().value
    const family = families.find(row => card.matches(row.selector))?.family
    if (linked.size !== 1 || !video || !family) return { kind: "unrecognised-item", element: card }
    const kind = family === "shorts" ? "short" : video.kind
    const signature = JSON.stringify({
      links: [...card.querySelectorAll("a[href]")].filter(link => linkedVideo(link)).map(link => [link.getAttribute("href"), link.textContent]),
      title: card.querySelector("#video-title, #video-title-link, .ytLockupMetadataViewModelTitle, .yt-lockup-metadata-view-model__title, h3")?.textContent ?? null
    })
    return { kind: "pointed-item", target: { element: card, family, identity: { ...video, kind, signature } } }
  }
  return looksLikeItem(element) ? { kind: "unrecognised-item", element } : { kind: "no-pointed-item", reason: "ordinary" }
}

type NavigationLease = { readonly scope: Scope; readonly release: Dispose }
type Tracking = { readonly scope: Scope; revision: number; navigation?: NavigationLease; cancelSettle: Dispose }
type Lease = { release: Dispose }

export class WwwItems {
  private readonly leases = new Set<Lease>()
  private tracking: Tracking | undefined
  private ended = false

  constructor(private readonly options: WwwItemsOptions) {}

  track(owner: Scope): Dispose {
    if (this.ended || owner.disposed) return nothing
    const lease: Lease = { release: nothing }
    this.leases.add(lease)
    lease.release = owner.add(() => {
      this.leases.delete(lease)
      if (this.leases.size === 0) this.stop()
    })
    if (!this.tracking && this.leases.has(lease) && !this.ended) {
      try { this.start() } catch (error) { lease.release(); throw error }
    }
    return lease.release
  }

  private live(tracking: Tracking): boolean {
    return !this.ended && this.tracking === tracking && !tracking.scope.disposed
  }

  private start(): void {
    const tracking: Tracking = { scope: new Scope(this.options), revision: 0, cancelSettle: nothing }
    this.tracking = tracking
    try {
      this.options.pointer.track(tracking.scope)
      tracking.scope.add(this.options.page.onState(state => {
        if (!this.live(tracking)) return
        if (state.kind !== "ready") {
          tracking.revision++
          tracking.cancelSettle()
          const navigation = tracking.navigation
          tracking.navigation = undefined
          navigation?.release()
        } else if (!tracking.navigation) {
          const scope = new Scope(this.options)
          const navigation = { scope, release: tracking.scope.add(() => scope.dispose()) }
          tracking.navigation = navigation
          scope.add(this.options.page.watch("nav", data => {
            if (!this.live(tracking) || tracking.navigation !== navigation || scope.disposed) return
            tracking.revision++
            tracking.cancelSettle()
            const revision = tracking.revision
            const facts = { pageType: data.pageType, navigation: data.navigation }
            tracking.cancelSettle = scope.timeout(() => {
              if (this.live(tracking) && tracking.revision === revision) this.settled(facts)
            }, 3000)
          }))
        }
      }))
    } catch (error) {
      if (this.tracking === tracking) this.tracking = undefined
      tracking.scope.dispose()
      throw error
    }
  }

  private stop(): void {
    const tracking = this.tracking
    this.tracking = undefined
    tracking?.scope.dispose()
  }

  private pointed(facts: PointerFacts): WwwPointed {
    if (this.options.document.fullscreenElement) return { kind: "no-pointed-item", reason: "fullscreen" }
    if (facts.kind === "none") return { kind: "no-pointed-item", reason: facts.reason === "inactive" ? "inactive" : "outside" }
    for (const element of facts.stack) {
      const result = recogniseWwwItem(element)
      if (result.kind !== "no-pointed-item" || result.reason === "player") return result
    }
    return { kind: "no-pointed-item", reason: "ordinary" }
  }

  readPointed(): WwwPointed {
    if (!this.tracking || !this.live(this.tracking)) return { kind: "no-pointed-item", reason: "inactive" }
    return this.pointed(this.options.pointer.read())
  }

  async resolve(): Promise<WwwResolution> {
    const tracking = this.tracking
    if (!tracking || !this.live(tracking)) return { kind: "inactive" }
    const revision = tracking.revision
    const facts = this.options.pointer.read()
    const pointed = this.pointed(facts)
    if (pointed.kind === "unsupported-item") return pointed
    if (pointed.kind === "unrecognised-item") {
      this.options.report.itemUnrecognised({ kind: "item-unrecognised", site: "www", source: facts.kind, element: pointed.element })
      return pointed
    }
    const target = pointed.kind === "pointed-item" ? pointed.target : undefined
    const answer = await this.options.page.run({ job: { kind: "videoInfo" } }, target ? { target: target.element } : undefined)
    if (!this.live(tracking)) return { kind: "stale-target", reason: "lifetime" }
    if (tracking.revision !== revision) return { kind: "stale-target", reason: "navigation" }
    if (this.options.page.state.kind !== "ready") return { kind: "stale-target", reason: "page-state" }
    if (target) {
      const fresh = target.element.isConnected && target.element.ownerDocument === this.options.document ? recogniseWwwItem(target.element) : undefined
      if (!fresh || fresh.kind !== "pointed-item" || fresh.target.element !== target.element ||
          fresh.target.family !== target.family || fresh.target.identity.signature !== target.identity.signature ||
          fresh.target.identity.videoId !== target.identity.videoId || fresh.target.identity.kind !== target.identity.kind ||
          answer.ok && (answer.data.videoId !== target.identity.videoId || answer.data.kind !== target.identity.kind)) {
        return { kind: "stale-target", reason: "identity" }
      }
      return answer.ok ? { kind: "pointed-item", target, video: answer.data } : { kind: "detail-failed", target, failure: answer }
    }
    return answer.ok ? { kind: "current-video", video: answer.data } : { kind: "current-unavailable", failure: answer }
  }

  private settled(navigation: Pick<NavData, "pageType" | "navigation">): void {
    const recognised = new Map<VideoInfo["videoId"], boolean>()
    for (const main of this.options.document.querySelectorAll("main, [role='main'], ytd-page-manager")) {
      if (main.closest("[hidden], [aria-hidden='true']")) continue
      for (const link of main.querySelectorAll("a[href]")) {
        if (link.closest(excluded) || link.closest("[hidden], [aria-hidden='true']")) continue
        const video = linkedVideo(link)
        if (!video) continue
        const item = recogniseWwwItem(link)
        recognised.set(video.videoId, recognised.get(video.videoId) === true ||
          item.kind === "pointed-item" && item.target.identity.videoId === video.videoId)
      }
    }
    const distinctMainLinks = recognised.size
    const count = [...recognised.values()].filter(Boolean).length
    this.options.report.pageSettled({ kind: "page-settle", site: "www", anchor: "www-cards", navigation,
      delayMs: 3000, visible: this.options.document.visibilityState !== "hidden", relevant: distinctMainLinks > 0,
      distinctMainLinks, recognised: count, anchorMissing: distinctMainLinks >= 6 && count < distinctMainLinks / 2 })
  }

  dispose(): void {
    if (this.ended) return
    this.ended = true
    for (const lease of [...this.leases]) lease.release()
    this.stop()
  }
}
