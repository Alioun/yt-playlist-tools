import { isRouteId, isWatchId } from "../shared/contracts"
import type { DiagnosticVocabulary, RouteId, WatchId } from "../shared/contracts"

export type PageRead = "navigation" | "location" | "watchPlayer" | "shortsPlayer" | "targetData" | "targetContext" | "mediaMetadata" | "musicQueue" | "musicState" | "castPlayer"
export type PageEvent = "navigation" | "playerIdentity" | "player" | "music" | "queue"

export interface PageReadPort {
  config(key: string): unknown
  read(what: PageRead, target?: Element): unknown
  on(event: PageEvent, changed: (detail: unknown) => void): () => void
  has(id: WatchId): boolean
}

function watch(value: string): WatchId {
  if (!isWatchId(value)) throw new Error("Invalid read watch ID")
  return value
}
function route(value: string): RouteId {
  if (!isRouteId(value)) throw new Error("Invalid read route ID")
  return value
}

export const readWatches = {
  identity: watch("read.config.identity"),
  navigation: watch("read.navigation"),
  location: watch("read.location"),
  watchPlayer: watch("read.player.watch"),
  shortsPlayer: watch("read.player.shorts"),
  targetData: watch("read.target.data"),
  targetContext: watch("read.target.context"),
  mediaMetadata: watch("read.music.metadata"),
  musicQueue: watch("read.music.queue"),
  musicState: watch("read.music.state"),
  castPlayer: watch("read.music.cast-player"),
  queueChanges: watch("read.music.queue-changes")
} satisfies Record<PageRead | "identity" | "queueChanges", WatchId>

export const readRoutes = {
  account: route("page-read.account"),
  videoInfo: route("page-read.video-info"),
  channelOf: route("page-read.channel"),
  itemInfo: route("page-read.item-info"),
  nowPlaying: route("page-read.now-playing"),
  castState: route("page-read.cast-state")
}

export const readVocabulary: DiagnosticVocabulary = {
  routes: Object.values(readRoutes),
  watchIds: Object.values(readWatches),
  schemaKeys: [
    "endpoint",
    "watchEndpoint",
    "reelWatchEndpoint",
    "videoId",
    "pageType",
    "page",
    "pageData",
    "response",
    "playerResponse",
    "videoDetails",
    "video_id",
    "title",
    "lengthSeconds",
    "channelId",
    "author",
    "adClientParams",
    "isAd",
    "clipConfig",
    "isLive",
    "isUpcoming",
    "isLiveContent",
    "isPostLiveDvr",
    "castStatus",
    "navigationEndpoint",
    "musicVideoType",
    "menu",
    "items",
    "queueAddEndpoint",
    "queueInsertPosition",
    "queueTarget",
    "browseEndpoint",
    "selected",
    "index",
    "currentTime",
    "duration",
    "playbackRate",
    "paused",
    "seeking",
    "artwork",
    "src",
    "sizes",
    "contentId",
    "contentType",
    "metadata",
    "lockupMetadataViewModel",
    "content",
    "rendererContext",
    "commandContext",
    "onTap",
    "innertubeCommand",
    "overlayMetadata",
    "primaryText",
    "adSlotRenderer",
    "promotedSparklesWebRenderer",
    "watchPlaylistEndpoint"
  ]
}
