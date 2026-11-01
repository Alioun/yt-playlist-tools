import { isRouteId, isWatchId } from "../../shared/contracts"
import type { BreakageKind, DiagnosticVocabulary, Job, JobFailure, RouteId, WatchId } from "../../shared/contracts"
import { readVocabulary, readWatches } from "../read-port"

export type Transport = "command" | "service" | "signed" | "plain" | "music"
export type HttpAnswer = { http: number; body: unknown }
export type Dispatch =
  | { kind: "not-sent"; cause: "missing" | "preflight" }
  | { kind: "blocked"; failure: JobFailure }
  | { kind: "pending"; answer: Promise<HttpAnswer>; cancel(): void }
export type RequestSpec = { path: RequestPath; body: Record<string, unknown>; endpoint: Record<string, unknown> }
export type RequestPath = "account/account_menu" | "playlist/get_add_to_playlist" | "browse" |
  "browse/edit_playlist" | "playlist/create" | "next" | "reel/reel_item_watch" | "navigation/resolve_url"
export type AttemptContext = {
  check(): JobFailure | null
  notice(kind: "missing" | "threw" | "resolver-ambiguous"): void
  observe(body: unknown): void
}
export interface GatewayRequestPort {
  has(via: Transport): boolean
  send(via: Transport, spec: RequestSpec, context: AttemptContext): Dispatch | Promise<Dispatch>
}
export type RequestRoute = { kind: "request"; via: Transport; id: RouteId; watchId: WatchId }
export type PageRoute = { kind: "read"; id: RouteId }
export type PageUiRoute = { kind: "page-ui"; id: RouteId; watchId: WatchId }
export type Route = RequestRoute | PageRoute | PageUiRoute | { kind: "label-default"; id: RouteId }
export type RouteTable = { readonly [K in Job["kind"]]: readonly Route[] }
export type GatewayNotice = (kind: BreakageKind, route: RequestRoute, job: Job["kind"], raw?: unknown) => void

function routeId(value: string): RouteId {
  if (!isRouteId(value)) throw new Error("Invalid gateway route")
  return value
}
function watchId(value: string): WatchId {
  if (!isWatchId(value)) throw new Error("Invalid gateway watch")
  return value
}
export const labelDefaultRoute = { kind: "label-default" as const, id: routeId("page-read.account-label-default") }
export const requestWatches = {
  command: watchId("gateway.www.resolver"), service: watchId("gateway.www.service"),
  signed: watchId("gateway.www.signed-request"), plain: watchId("gateway.www.plain-request"),
  music: watchId("gateway.music.network-manager")
} satisfies Record<Transport, WatchId>
export function requestRoute(via: Transport, job: Job["kind"]): RequestRoute {
  return { kind: "request", via, id: routeId(`${via}.${job}`), watchId: requestWatches[via] }
}
export const cardMenuRoute: PageUiRoute = { kind: "page-ui", id: routeId("page-ui.openCardMenu"), watchId: readWatches.targetData }
export function vocabularyFor(table: RouteTable): DiagnosticVocabulary {
  return {
    routes: [...new Set([...readVocabulary.routes, ...Object.values(table).flatMap(row => row.map(route => route.id))])],
    watchIds: [...readVocabulary.watchIds, ...Object.values(requestWatches)],
    schemaKeys: [...readVocabulary.schemaKeys, "status", "error", "code", "playlistId", "setVideoId", "playlistEditResults",
      "playlistEditVideoAddedResultData", "playlistEditVideoRemovedResultData", "playlistAddToOptionRenderer",
      "playlistAddToOptionViewModel", "playlistAddToPlaylistRenderer", "playlistId", "containsSelectedVideos",
      "playlistSelectionState", "privacy", "videoCount", "continuationContents", "continuationItems", "contents",
      "continuationItemRenderer", "continuationEndpoint", "continuationCommand", "token", "frameworkUpdates",
      "entityBatchUpdate", "mutations", "entityKey", "payload", "playlistEntity", "playlistViewModel",
      "lockupViewModel", "metadata", "text", "runs", "simpleText", "accountHeaderRenderer"]
  }
}
