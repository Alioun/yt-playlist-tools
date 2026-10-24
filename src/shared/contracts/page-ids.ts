export type PageRequestId = string & { readonly __brand: "PageRequestId" }
export type PageWatchId = string & { readonly __brand: "PageWatchId" }

export function isPageRequestId(value: unknown): value is PageRequestId {
  return typeof value === "string" && value.length > 0
}
export function isPageWatchId(value: unknown): value is PageWatchId {
  return typeof value === "string" && value.length > 0
}
