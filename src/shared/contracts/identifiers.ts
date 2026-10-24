export type RouteId = string & { readonly __brand: "RouteId" }
export type SetVideoId = string & { readonly __brand: "SetVideoId" }
export type QueueListId = string & { readonly __brand: "QueueListId" }
export type QueueItemId = (string | number) & { readonly __brand: "QueueItemId" }
export type PageType = string & { readonly __brand: "PageType" }
export type MusicType = string & { readonly __brand: "MusicType" }

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}
export function isRouteId(value: unknown): value is RouteId { return nonempty(value) }
export function isSetVideoId(value: unknown): value is SetVideoId { return nonempty(value) }
export function isQueueListId(value: unknown): value is QueueListId { return nonempty(value) }
export function isPageType(value: unknown): value is PageType { return nonempty(value) }
export function isMusicType(value: unknown): value is MusicType { return nonempty(value) }
export function isQueueItemId(value: unknown): value is QueueItemId {
  return nonempty(value) || typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}
