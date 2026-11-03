import type { Job } from "../../../shared/contracts/jobs"
import type { UiCacheStatus, UiCacheReadFailure, UiJobOutcome, UiListing, UiListRefresh, UiCreationAnswer } from "../../../shared/contracts/ui-playlists"
import type { CachedListing, CacheDisposition, ListRefresh, CreationAnswer } from "../../playlists/playlists"
import type { TabJobOutcome } from "../../tabs/ports"
import type { PlaylistCacheRead } from "../../store/playlist-cache"

export function listing(value: CachedListing | null): UiListing | null {
  return value === null
    ? null
    : {
        at: value.at,
        rows: value.rows.map(row => ({
          id: row.id,
          title: row.title,
          ...(row.privacy === undefined ? {} : { privacy: row.privacy }),
          ...(row.count === undefined ? {} : { count: row.count }),
          ...(row.thumb === undefined ? {} : { thumb: row.thumb })
        }))
      }
}
export function cacheStatus(value: Exclude<PlaylistCacheRead, { kind: "cache" }>): UiCacheReadFailure
export function cacheStatus(value: CacheDisposition): UiCacheStatus
export function cacheStatus(value: CacheDisposition): UiCacheStatus {
  switch (value.kind) {
    case "committed":
    case "unchanged":
      return { kind: value.kind }
    case "caller-owned":
      return { kind: "caller-owned", reason: value.reason }
    case "refused":
      return { kind: "refused", reason: value.reason }
    case "unavailable":
      return { kind: "unavailable", reason: value.reason }
    case "failed":
      return { kind: "failed", stage: value.stage }
    case "unconfirmed":
      return { kind: "unconfirmed", write: value.write, cause: value.cause }
    case "invalid":
      return { kind: "invalid", part: value.part }
  }
}
export function jobOutcome<J extends Job>(value: TabJobOutcome<J>): UiJobOutcome<J> {
  switch (value.kind) {
    case "result":
      return { kind: "result", tabId: value.tabId, result: structuredClone(value.result) }
    case "transport":
      return { kind: "transport", tabId: value.tabId, failure: value.failure, delivery: "unknown", ...(value.cleanup === undefined ? {} : { cleanup: value.cleanup.kind }) }
    case "session":
      return { kind: "session", status: value.result.kind }
    case "no-tab":
      return { kind: "no-tab", attempted: [...value.attempted] }
    case "guard":
      return { kind: "guard", reason: value.reason }
  }
}
export function listRefresh(value: ListRefresh): UiListRefresh {
  if (value.kind === "not-listed") return { kind: "not-listed", outcome: jobOutcome(value.outcome), cached: listing(value.cached) }
  const copied = listing(value.listing)
  if (copied === null) throw Error("Missing refreshed listing")
  return {
    kind: "listed",
    listing: { ...copied, at: value.listing.at },
    outcome: jobOutcome(value.outcome),
    cache: cacheStatus(value.cache),
    present: { kind: "list-present", acct: value.present.acct, site: value.present.site, private: value.present.private, at: value.present.at, ids: [...value.present.ids] }
  }
}
export function creationAnswer(value: CreationAnswer): UiCreationAnswer {
  switch (value.kind) {
    case "invalid":
      return { kind: "invalid", problem: value.problem }
    case "unavailable":
      return { kind: "unavailable", read: cacheStatus(value.read) }
    case "not-created":
      return { kind: "not-created", outcome: jobOutcome(value.outcome) }
    case "created":
      return { kind: "created", id: value.id, outcome: jobOutcome(value.outcome), cache: cacheStatus(value.cache) }
  }
}
