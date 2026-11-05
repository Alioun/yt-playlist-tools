import {
  decodeAccountCache,
  decodeDocument,
  decodeSetup,
  decodeFilter,
  DecodeError,
  documentKey,
  emptyAccountCache,
  isAccountKey,
  isSetupEmpty,
  parseDocumentKey,
  visibleAccountCache,
  type AccountCache,
  type AccountKey,
  type CachePlaylist,
  type CacheSite,
  type CreatedPlaylist
} from "../../shared/model"
import type { JobData, JobOf } from "../../shared/contracts/jobs"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { sameSyncJson } from "./sync-write-admission"
import type { TabProjectionInvalid, TabProjectionUnavailable } from "./tab-projection"

export class PlaylistCacheCapture<A extends AccountKey = AccountKey> {
  readonly kind = "playlist-cache-capture"
  readonly #account: A
  readonly #authority: { readonly owner: object; readonly reset: number; readonly account: number } | undefined
  constructor(acct: A, authority?: { readonly owner: object; readonly reset: number; readonly account: number }) {
    this.#account = acct
    this.#authority = authority
  }
  get acct(): A {
    return this.#account
  }
  sharesAuthority(other: PlaylistCacheCapture): boolean {
    const own = this.#authority,
      compared = other.#authority
    return own !== undefined && compared !== undefined && own.owner === compared.owner && this.acct === other.acct && own.reset === compared.reset && own.account === compared.account
  }
}
export type CacheAuthority = { readonly kind: "eligible"; readonly capture: PlaylistCacheCapture } | { readonly kind: "caller-owned"; readonly reason: "private" | "no-setup" }
export type PlaylistCacheRead =
  | { readonly kind: "cache"; readonly cache: AccountCache | null; readonly authority: CacheAuthority }
  | TabProjectionUnavailable
  | TabProjectionInvalid
  | { readonly kind: "invalid"; readonly part: "cache" | "setup" }
export type CacheAbsorption<A extends AccountKey = AccountKey> = { readonly acct: A; readonly site: CacheSite; readonly at: number } & (
  | { readonly kind: "list"; readonly rows: Readonly<JobData<JobOf<"playlists">>> }
  | { readonly kind: "membership"; readonly rows: Readonly<JobData<JobOf<"membership">>> }
  | { readonly kind: "created"; readonly row: Omit<CreatedPlaylist, "at"> }
)
export type PlaylistCacheWrite =
  | { readonly kind: "committed" | "unchanged"; readonly cache: AccountCache }
  | { readonly kind: "refused"; readonly reason: "capture" | "revoked" | "no-setup" | "invalid" }
  | { readonly kind: "failed"; readonly stage: "set" }
  | { readonly kind: "unconfirmed"; readonly write: "resolved" | "rejected"; readonly cause: "readback" | "stopped" }
  | TabProjectionUnavailable
  | TabProjectionInvalid
  | { readonly kind: "invalid"; readonly part: "cache" | "setup" }
export type PlaylistCacheOwner = {
  readPlaylistCache(request: { readonly acct: AccountKey; readonly private: boolean }): Promise<PlaylistCacheRead>
  absorbPlaylistCache<A extends AccountKey>(capture: PlaylistCacheCapture<A>, input: CacheAbsorption<NoInfer<A>>): Promise<PlaylistCacheWrite>
}

export function cacheDeviceAuthority(value: unknown): JsonValue {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) return null
  return { id: value.id ?? null, consent: value.consent ?? null }
}
export function cacheSetupState(records: Readonly<Record<string, unknown>>, acct: AccountKey): "live" | "none" | "invalid" | "newer-version" {
  try {
    const raw = records[documentKey({ kind: "setup", acct })]
    if (raw !== undefined && !isJsonValue(raw)) return "invalid"
    const doc = decodeDocument(raw, decodeSetup)
    if (doc.kind === "newer-version") return "newer-version"
    if (doc.kind !== "value") return "none"
    if (!isSetupEmpty(doc.document.data, false)) return "live"
    for (const [name, value] of Object.entries(records)) {
      const key = parseDocumentKey(name)
      if (key?.kind !== "filter" || key.acct !== acct) continue
      const filter = decodeDocument(value, decodeFilter)
      if (filter.kind === "value" || filter.kind === "newer-version") return "live"
    }
    return "none"
  } catch (error) {
    if (error instanceof DecodeError) return "invalid"
    throw error
  }
}
export function readCacheRecord(records: Readonly<Record<string, unknown>>, acct: AccountKey, now: number): AccountCache | null {
  const raw = records[`cache:${acct}`]
  if (raw === undefined) return null
  if (!isJsonValue(raw)) throw new DecodeError("cache", "JSON data")
  return visibleAccountCache(decodeAccountCache(raw), now)
}
function thumbnail(value: string | undefined): string | undefined {
  if (value === undefined) return
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? value : undefined
  } catch {
    return
  }
}
function facts(row: Pick<CachePlaylist, "id" | "title" | "privacy">): CachePlaylist {
  return { id: row.id, title: row.title, ...(row.privacy === undefined ? {} : { privacy: row.privacy }) }
}
export function planCacheAbsorption(cache: AccountCache | null, input: CacheAbsorption, now: number): AccountCache {
  const previous = visibleAccountCache(cache ?? emptyAccountCache(), now)
  if (input.kind === "created") {
    const existing = previous.created.find(row => row.id === input.row.id)
    const row = { id: input.row.id, title: input.row.title, privacy: input.row.privacy, at: existing?.at ?? input.at }
    return decodeAccountCache({
      ...previous,
      created: previous.playlists.some(playlist => playlist.id === row.id) ? previous.created : [...previous.created.filter(saved => saved.id !== row.id), row]
    })
  }
  const seen = new Set<string>(),
    old = new Map(previous.playlists.map(row => [row.id, row]))
  const playlists: CachePlaylist[] = []
  for (const row of input.rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    const saved = old.get(row.id)
    const kept = Object.fromEntries(Object.entries(saved ?? {}).filter(([key]) => !["id", "title", "privacy", "count", "thumb"].includes(key)))
    playlists.push(
      input.kind === "membership"
        ? { ...kept, ...facts(row), ...(saved?.count === undefined ? {} : { count: saved.count }), ...(saved?.thumb === undefined ? {} : { thumb: saved.thumb }) }
        : {
            ...kept,
            ...facts(row),
            ...(row.count === undefined ? {} : { count: row.count }),
            ...("thumb" in row && typeof row.thumb === "string" && thumbnail(row.thumb) !== undefined ? { thumb: thumbnail(row.thumb) } : {})
          }
    )
  }
  const order = input.kind === "membership" ? { ...previous.order, [input.site]: playlists.map(row => row.id) } : previous.order
  const next = decodeAccountCache({ ...previous, playlists, order, created: previous.created.filter(row => !seen.has(row.id)) })
  // DATA-57 forbids a stamp-only write. DATA-20/21 stamp either read when it changes cache facts.
  return cache !== null && sameCache(previous, next) ? previous : { ...next, listAt: input.at }
}
export function sameCache(left: AccountCache, right: AccountCache): boolean {
  return isJsonValue(left) && isJsonValue(right) && sameSyncJson(left, right)
}
export function cacheJson(cache: AccountCache): JsonObject {
  if (!isJsonValue(cache) || cache === null || typeof cache !== "object" || Array.isArray(cache)) throw new DecodeError("cache", "JSON data")
  return cache
}
export function validCacheInput(input: CacheAbsorption): boolean {
  return isAccountKey(input.acct) && (input.site === "www" || input.site === "music") && Number.isSafeInteger(input.at) && input.at >= 0
}
