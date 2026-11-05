import {
  isAddToPlaylistEndpoint,
  isItemInfo,
  isLibraryEndpoint,
  isLikeEndpoint,
  isMusicType,
  isNavigationEndpoint,
  isPageType,
  isQueueInsertEndpoint,
  isRemoveFromQueueEndpoint,
  isMusicAdFailure,
  isStreamData,
  isVideoInfo
} from "../shared/contracts"
import type { ItemEndpoints, ItemInfo, ItemKind, ItemType, JobDataById, MusicAdEvidence, MusicAdFailure, NavData, NowPlaying, PlayerData, QueueData, VideoInfo } from "../shared/contracts"
import { isChannelId, isVideoId } from "../shared/model/validation"

export function field(value: unknown, ...keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    if (current === null || typeof current !== "object" || !(key in current)) return undefined
    current = Reflect.get(current, key)
  }
  return current
}
function list(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}
function text(value: unknown): string | undefined {
  if (typeof value === "string") return value
  const simple = field(value, "simpleText")
  if (typeof simple === "string") return simple
  const runs = list(field(value, "runs"))
  if (!runs || !runs.every(run => typeof field(run, "text") === "string")) return undefined
  return runs.map(run => field(run, "text")).join("")
}
function duration(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined
  return value
}
function seconds(value: unknown): number | null | undefined {
  if (typeof value === "string" && /^[0-9]+(?:\.[0-9]+)?$/.test(value)) return duration(Number(value))
  return duration(value)
}

export type Navigation = {
  pageType: NavData["pageType"]
  navigation: NavData["navigation"]
  ad: boolean
  response: unknown
}

export function parseNavigation(raw: unknown): Navigation | undefined {
  const pageType = field(raw, "pageType") ?? field(raw, "pageData", "page")
  if (!isPageType(pageType)) return undefined
  const endpoint = field(raw, "endpoint") ?? raw
  const watch = field(endpoint, "watchEndpoint")
  const reel = field(endpoint, "reelWatchEndpoint")
  if (watch !== undefined && reel !== undefined) return undefined
  const id = field(reel ?? watch, "videoId")
  if (watch !== undefined || reel !== undefined) {
    if (!isVideoId(id)) return undefined
    const ad = field(reel, "adClientParams", "isAd")
    if (ad !== undefined && typeof ad !== "boolean") return undefined
    return { pageType, navigation: { kind: reel !== undefined ? "shorts" : "watch", videoId: id }, ad: ad === true, response: field(raw, "response", "playerResponse") ?? field(raw, "playerResponse") }
  }
  return { pageType, navigation: { kind: "other" }, ad: false, response: undefined }
}

export function parseVideoResponse(raw: unknown, kind: VideoInfo["kind"]): VideoInfo | undefined {
  const details = field(raw, "videoDetails")
  const title = field(details, "title")
  const videoId = field(details, "videoId")
  const rawLength = field(details, "lengthSeconds")
  const length = rawLength === undefined ? null : seconds(rawLength)
  const value = { videoId, title, length, kind }
  return isVideoInfo(value) ? value : undefined
}

export function parseChannel(raw: unknown, videoId: unknown): JobDataById["channelOf"] | undefined {
  const details = field(raw, "videoDetails")
  if (field(details, "videoId") !== videoId) return undefined
  const channelId = field(details, "channelId")
  if (!isChannelId(channelId)) return undefined
  const title = field(details, "author")
  return { channelId, ...(typeof title === "string" ? { title } : {}) }
}

function targetEndpoint(raw: unknown): Pick<VideoInfo, "videoId" | "kind"> | undefined {
  if (
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    field(raw, "browseEndpoint") !== undefined ||
    field(raw, "watchPlaylistEndpoint") !== undefined ||
    field(raw, "adClientParams") !== undefined
  )
    return undefined
  const watch = field(raw, "watchEndpoint"),
    reel = field(raw, "reelWatchEndpoint")
  if ((watch === undefined) === (reel === undefined)) return undefined
  const body = reel ?? watch
  if (field(body, "adClientParams") !== undefined || (field(body, "isAd") !== undefined && field(body, "isAd") !== false)) return undefined
  const videoId = field(body, "videoId")
  return isVideoId(videoId) ? { videoId, kind: reel === undefined ? "video" : "short" } : undefined
}

function sameTargetIdentity(raw: unknown, identity: Pick<VideoInfo, "videoId" | "kind">): boolean {
  for (const key of ["videoId", "contentId"]) {
    const candidate = field(raw, key)
    if (candidate !== undefined && candidate !== identity.videoId) return false
  }
  const navigation = field(raw, "navigationEndpoint")
  if (navigation !== undefined) {
    const parsed = targetEndpoint(navigation)
    if (!parsed || parsed.videoId !== identity.videoId || parsed.kind !== identity.kind) return false
  }
  return true
}

export function parseTargetVideo(raw: unknown): VideoInfo | undefined {
  if (
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    (field(raw, "isAd") !== undefined && field(raw, "isAd") !== false) ||
    ["adClientParams", "adSlotRenderer", "promotedSparklesWebRenderer", "browseEndpoint", "watchPlaylistEndpoint"].some(key => field(raw, key) !== undefined)
  )
    return undefined
  const lockup = field(raw, "metadata", "lockupMetadataViewModel")
  const shorts = field(raw, "overlayMetadata")
  const contentType = field(raw, "contentType")
  const modern =
    lockup !== undefined ||
    shorts !== undefined ||
    contentType !== undefined ||
    field(raw, "contentId") !== undefined ||
    field(raw, "rendererContext") !== undefined ||
    field(raw, "onTap") !== undefined
  if (modern) {
    if (lockup !== undefined && shorts !== undefined) return undefined
    if (contentType !== undefined && contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return undefined
    let identity: Pick<VideoInfo, "videoId" | "kind"> | undefined
    let title: unknown
    if (lockup !== undefined && contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      identity = targetEndpoint(field(raw, "rendererContext", "commandContext", "onTap", "innertubeCommand"))
      if (!identity || !isVideoId(field(raw, "contentId"))) return undefined
      title = field(lockup, "title", "content")
      if (field(raw, "onTap") !== undefined) return undefined
    } else if (shorts !== undefined && lockup === undefined) {
      identity = targetEndpoint(field(raw, "onTap", "innertubeCommand"))
      if (identity?.kind !== "short" || field(raw, "rendererContext") !== undefined) return undefined
      title = field(shorts, "primaryText", "content")
    } else return undefined
    if (!identity || !sameTargetIdentity(raw, identity) || typeof title !== "string" || !title.trim()) return undefined
    const rawLength = field(raw, "lengthSeconds")
    const value = { ...identity, title, length: rawLength === undefined ? null : seconds(rawLength) }
    return isVideoInfo(value) ? value : undefined
  }
  const endpoint = field(raw, "navigationEndpoint")
  const identity = endpoint === undefined ? undefined : targetEndpoint(endpoint)
  if (endpoint !== undefined && !identity) return undefined
  const videoId = field(raw, "videoId") ?? identity?.videoId
  if (identity && videoId !== identity.videoId) return undefined
  const title = text(field(raw, "title"))
  const length = field(raw, "lengthSeconds") === undefined ? null : seconds(field(raw, "lengthSeconds"))
  const value = { videoId, title, length, kind: identity?.kind ?? "video" }
  return isVideoInfo(value) ? value : undefined
}

export function parsePlayer(args: { raw: unknown; navigation: Navigation | undefined; player: "watch" | "shorts"; at: number; miniplayerConfirmed: boolean }): PlayerData | undefined {
  const { raw, navigation, player, at } = args
  if (field(raw, "adShowing") === true || field(raw, "adActive") === true || (player === "shorts" && navigation?.ad === true) || field(raw, "presentingPlayerType") === 2) {
    const value = { ad: true, at, player }
    return isStreamData("player", value) ? value : undefined
  }
  const response = field(raw, "response") ?? (player === "shorts" ? navigation?.response : undefined)
  const videoId = field(raw, "videoData", "video_id") ?? (player === "shorts" ? field(response, "videoDetails", "videoId") : undefined)
  if (!isVideoId(videoId)) return undefined
  if (navigation?.navigation.kind === "watch" || navigation?.navigation.kind === "shorts") {
    if (navigation.navigation.videoId !== videoId || (player === "shorts") !== (navigation.navigation.kind === "shorts")) return undefined
  } else if (player !== "watch" || !navigation || !args.miniplayerConfirmed) return undefined
  if (field(response, "videoDetails", "videoId") !== videoId) return undefined
  const details = field(response, "videoDetails")
  const flags = ["isPostLiveDvr", "isLive", "isUpcoming", "isLiveContent"]
  if (flags.some(key => field(details, key) !== undefined && typeof field(details, key) !== "boolean")) return undefined
  const rawListed = field(details, "lengthSeconds")
  const listedLength = rawListed === undefined ? null : seconds(rawListed)
  const rawLength = field(raw, "duration") ?? (player === "shorts" ? field(raw, "video", "duration") : undefined)
  const len = rawLength === undefined || rawLength === null ? null : duration(rawLength)
  const pos = field(raw, "currentTime") ?? (player === "shorts" ? field(raw, "video", "currentTime") : undefined)
  const rate = field(raw, "video", "playbackRate")
  const paused = field(raw, "video", "paused")
  const seeking = field(raw, "video", "seeking")
  const clip = field(response, "clipConfig")
  if (clip !== undefined && clip !== null) {
    const start = field(clip, "startTimeMs"),
      end = field(clip, "endTimeMs")
    if (typeof start !== "number" || !Number.isFinite(start) || start < 0 || typeof end !== "number" || !Number.isFinite(end) || end <= start) return undefined
  }
  const kids = field(response, "playabilityStatus", "miniplayer", "miniplayerRenderer", "playbackMode") === "PLAYBACK_MODE_PAUSED_ONLY"
  const value = {
    ad: false,
    at,
    player,
    videoId,
    pos,
    len,
    listedLength,
    rate,
    playing: typeof paused === "boolean" ? !paused : undefined,
    seeking,
    content: clip !== undefined && clip !== null ? "clip" : kids ? "made-for-kids" : "video",
    isPostLiveDvr: field(details, "isPostLiveDvr") === true,
    isLive: field(details, "isLive") === true,
    isUpcoming: field(details, "isUpcoming") === true,
    isLiveContent: field(details, "isLiveContent") === true
  }
  return isStreamData("player", value) ? value : undefined
}

export function queueRenderer(item: unknown): unknown {
  return field(item, "playlistPanelVideoRenderer") ?? field(item, "playlistPanelVideoWrapperRenderer", "primaryRenderer", "playlistPanelVideoRenderer")
}
export function parseQueue(raw: unknown): QueueData | undefined {
  const items = list(raw)?.map(queueRenderer)
  if (!items) return undefined
  const ids = items.map(item => field(item, "navigationEndpoint", "watchEndpoint", "index"))
  const value = { ids }
  return isStreamData("queue", value) ? value : undefined
}

export function parseMusicPlayback(args: { metadata: unknown; player: unknown; queue: unknown }): NowPlaying | null | MusicAdFailure | undefined {
  const { metadata, player, queue } = args
  if (player !== undefined && (player === null || typeof player !== "object" || Array.isArray(player))) return undefined
  for (const key of ["adShowing", "adActive"]) {
    const value = field(player, key)
    if (value !== undefined && typeof value !== "boolean") return undefined
  }
  const presenting = field(player, "presentingPlayerType")
  if (presenting !== undefined && (typeof presenting !== "number" || !Number.isSafeInteger(presenting) || presenting < 0)) return undefined
  if (presenting !== undefined && presenting !== 0 && presenting !== 1 && presenting !== 2) return undefined
  const evidence: MusicAdEvidence | undefined =
    field(player, "adShowing") === true ? "adShowing" : field(player, "adActive") === true ? "adActive" : presenting === 2 ? "presentingPlayerType" : undefined
  const items = list(queue)?.map(queueRenderer)
  const selected = items?.filter(item => field(item, "selected") === true)
  if (!evidence && metadata === null && items?.length === 0 && field(player, "videoData") === undefined) return null
  const fallback = selected?.length === 1 ? selected[0] : undefined
  const primaryId = field(player, "videoData", "video_id")
  const fallbackId = field(fallback, "navigationEndpoint", "watchEndpoint", "videoId")
  const videoId = primaryId ?? fallbackId
  if (!isVideoId(videoId) || (fallback !== undefined && primaryId !== undefined && fallbackId !== primaryId)) return undefined
  const pos = field(player, "video", "currentTime")
  const rawLen = field(player, "video", "duration")
  const len = rawLen === null ? null : duration(rawLen)
  if (evidence) {
    const responseId = field(player, "response", "videoDetails", "videoId")
    if (
      !items ||
      !parseQueue(queue) ||
      items.some(item => item === null || typeof item !== "object" || Array.isArray(item) || (field(item, "selected") !== undefined && typeof field(item, "selected") !== "boolean")) ||
      (selected && selected.length > 1) ||
      metadata === undefined ||
      (metadata !== null && (typeof metadata !== "object" || Array.isArray(metadata) || typeof field(metadata, "title") !== "string" || typeof field(metadata, "artist") !== "string")) ||
      (responseId !== undefined && responseId !== videoId) ||
      typeof pos !== "number" ||
      !Number.isFinite(pos) ||
      pos < 0 ||
      len === undefined ||
      typeof field(player, "video", "paused") !== "boolean"
    )
      return undefined
    return { ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence } }
  }
  const metadataTitle = field(metadata, "title"),
    metadataArtist = field(metadata, "artist")
  const hasMetadata = typeof metadataTitle === "string" && typeof metadataArtist === "string"
  const title = hasMetadata ? metadataTitle : text(field(fallback, "title"))
  const artist = hasMetadata ? metadataArtist : text(field(fallback, "longBylineText"))
  const album = hasMetadata ? field(metadata, "album") : undefined
  const artwork = hasMetadata ? list(field(metadata, "artwork")) : undefined
  let largest: { src: string; area: number } | undefined
  for (const art of artwork ?? []) {
    const src = field(art, "src"),
      sizes = field(art, "sizes")
    if (typeof src !== "string" || !src || typeof sizes !== "string") continue
    let area = 0
    for (const size of sizes.split(/\s+/)) {
      const match = /^([0-9]+)x([0-9]+)$/.exec(size)
      if (match) {
        const next = Number(match[1]) * Number(match[2])
        if (Number.isSafeInteger(next)) area = Math.max(area, next)
      }
    }
    if (!largest || area > largest.area) largest = { src, area }
  }
  const value = { videoId, title, artist, pos, len, ...(typeof album === "string" && album ? { album } : {}), ...(largest ? { artwork: largest.src } : {}) }
  return isStreamData("nowPlaying", value) ? value : undefined
}

export function parseNowPlaying(args: Parameters<typeof parseMusicPlayback>[0]): NowPlaying | null | undefined {
  const result = parseMusicPlayback(args)
  return isMusicAdFailure(result) ? undefined : result
}

function itemType(raw: unknown): { kind: ItemKind; type: ItemType } | undefined {
  const endpoint = field(raw, "navigationEndpoint")
  if (endpoint !== undefined && !isNavigationEndpoint(endpoint)) return undefined
  const music = field(raw, "musicVideoType") ?? field(endpoint, "watchEndpoint", "watchEndpointMusicSupportedConfigs", "watchEndpointMusicConfig", "musicVideoType")
  if (isMusicType(music)) {
    const kinds: Record<string, ItemKind> = {
      MUSIC_VIDEO_TYPE_ATV: "song",
      MUSIC_VIDEO_TYPE_OMV: "video",
      MUSIC_VIDEO_TYPE_UGC: "video",
      MUSIC_VIDEO_TYPE_PODCAST_EPISODE: "episode",
      MUSIC_VIDEO_TYPE_PRIVATELY_OWNED_TRACK: "upload"
    }
    const kind = kinds[music]
    return kind ? { kind, type: { kind: "music-video", musicVideoType: music } } : undefined
  }
  const pageType = field(endpoint, "browseEndpoint", "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig", "pageType")
  if (!isPageType(pageType)) return undefined
  const kinds: Record<string, ItemKind> = {
    MUSIC_PAGE_TYPE_ALBUM: "album",
    MUSIC_PAGE_TYPE_PLAYLIST: "playlist",
    MUSIC_PAGE_TYPE_ARTIST: "artist"
  }
  const kind = kinds[pageType]
  return kind ? { kind, type: { kind: "browse", pageType } } : undefined
}

export function parseItem(raw: unknown, inAutomix: boolean): ItemInfo | undefined {
  const declaredVideo = field(raw, "videoId")
  const endpointVideo = field(raw, "navigationEndpoint", "watchEndpoint", "videoId")
  if (declaredVideo !== undefined && endpointVideo !== undefined && declaredVideo !== endpointVideo) return undefined
  const classified = itemType(raw)
  const title = text(field(raw, "title"))
  if (!classified || title === undefined) return undefined
  const endpoints: ItemEndpoints = {}
  const items = list(field(raw, "menu", "menuRenderer", "items")) ?? []
  for (const item of items) {
    const renderer = field(item, "menuServiceItemRenderer")
    const endpoint = field(renderer, "serviceEndpoint")
    if (endpoint !== undefined) {
      if (isQueueInsertEndpoint(endpoint)) {
        if (field(endpoint, "queueAddEndpoint", "queueInsertPosition") === "INSERT_AFTER_CURRENT_VIDEO") endpoints.next = endpoint
        else endpoints.end = endpoint
      } else if (isRemoveFromQueueEndpoint(endpoint)) endpoints.remove = endpoint
      else if (isAddToPlaylistEndpoint(endpoint)) endpoints.save = endpoint
      else if (isLikeEndpoint(endpoint)) endpoints.like = endpoint
      else if (["queueAddEndpoint", "removeFromQueueEndpoint", "addToPlaylistEndpoint", "likeEndpoint"].some(key => field(endpoint, key) !== undefined)) return undefined
    }
    const nav = field(item, "menuNavigationItemRenderer", "navigationEndpoint")
    if (nav !== undefined) {
      if (isNavigationEndpoint(nav)) {
        if (field(nav, "watchEndpoint") !== undefined || field(nav, "watchPlaylistEndpoint") !== undefined) endpoints.mix = nav
        const type = field(nav, "browseEndpoint", "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig", "pageType")
        if (type === "MUSIC_PAGE_TYPE_ALBUM") endpoints.album = nav
        if (type === "MUSIC_PAGE_TYPE_ARTIST") endpoints.artist = nav
      } else if (["watchEndpoint", "watchPlaylistEndpoint", "browseEndpoint"].some(key => field(nav, key) !== undefined)) return undefined
    }
    const toggle = field(item, "toggleMenuServiceItemRenderer")
    if (toggle !== undefined) {
      const selected = field(toggle, "isToggled")
      const active = field(toggle, selected === true ? "toggledServiceEndpoint" : "defaultServiceEndpoint")
      if (typeof selected !== "boolean" || !isLibraryEndpoint(active)) return undefined
      endpoints.library = { inLibrary: selected, endpoint: active }
    }
  }
  const like = field(raw, "likeStatus")
  const likeState = like === "LIKE" ? "liked" : like === "DISLIKE" ? "disliked" : like === "INDIFFERENT" ? "not-liked" : null
  if (like !== undefined && likeState === null) return undefined
  const rawSelected = field(raw, "selected")
  if (rawSelected !== undefined && typeof rawSelected !== "boolean") return undefined
  const videoId = field(raw, "videoId") ?? field(raw, "navigationEndpoint", "watchEndpoint", "videoId")
  const queueItemId = field(raw, "navigationEndpoint", "watchEndpoint", "index")
  const value = {
    ...classified,
    title,
    selected: rawSelected === true,
    autoplay: inAutomix,
    hasOwnLike: like !== undefined,
    likeState,
    endpoints,
    ...(videoId !== undefined ? { videoId } : {}),
    ...(queueItemId !== undefined ? { queueItemId } : {})
  }
  return isItemInfo(value) ? value : undefined
}
