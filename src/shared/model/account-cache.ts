import { checked, DecodeError, isRecord, natural, nullable, oneOf, text } from "./codec"
import { isPlaylistId, type PlaylistId } from "./validation"

export type CachePrivacy = "PRIVATE" | "UNLISTED" | "PUBLIC"
export type CacheSite = "www" | "music"
type NoMembership = { readonly contains?: never; readonly videoId?: never; readonly setVideoId?: never; readonly occurrences?: never; readonly setVideoIds?: never; readonly videoIds?: never; readonly membership?: never; readonly video?: never; readonly videos?: never }
export type CachePlaylist = NoMembership & {
  readonly id: PlaylistId
  readonly title: string
  readonly privacy?: CachePrivacy
  readonly count?: number
  readonly thumb?: string
}
export type CreatedPlaylist = NoMembership & {
  readonly id: PlaylistId
  readonly title: string
  readonly privacy: CachePrivacy
  readonly at: number
}
export type AccountCache = {
  readonly listAt: number | null
  readonly playlists: readonly CachePlaylist[]
  readonly order: { readonly www?: readonly PlaylistId[]; readonly music?: readonly PlaylistId[] }
  readonly created: readonly CreatedPlaylist[]
  readonly labelAt: number | null
}

const playlistId = checked(isPlaylistId, "a playlist ID")
const privacy = oneOf("PRIVATE", "UNLISTED", "PUBLIC")
export const WATCH_LATER = playlistId("WL")
export const CREATED_PLAYLIST_MS = 24 * 60 * 60 * 1000
export const PLAYLIST_FRESH_MS = 5 * 60 * 1000

// Unknown codec extensions survive only after removing history and identity-bearing branches.
const forbidden = /contains|member|video|occurrence|account|(^|[_-])acct($|[_-])|request|identity|image|bytes|base64/i
function extensions(raw: Record<string, unknown>, known: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !known.includes(key) && !forbidden.test(key)).flatMap(([key, value]) => {
    const safe = extension(value)
    return safe === undefined ? [] : [[key, safe]]
  }))
}
function extension(raw: unknown): unknown {
  if (raw === null || typeof raw === "string" || typeof raw === "boolean" || typeof raw === "number" && Number.isFinite(raw)) return raw
  if (Array.isArray(raw)) return raw.map(extension).filter(value => value !== undefined)
  if (isRecord(raw)) return extensions(raw, [])
  return undefined
}
function record(raw: unknown, path: string): Record<string, unknown> {
  if (!isRecord(raw)) throw new DecodeError(path, "an object")
  return raw
}
function rows<T extends { readonly id: PlaylistId }>(raw: unknown, path: string, decode: (raw: unknown, path: string) => T): T[] {
  if (!Array.isArray(raw)) throw new DecodeError(path, "an array")
  const result = raw.map((row: unknown, index) => decode(row, `${path}[${index}]`))
  if (new Set(result.map(row => row.id)).size !== result.length) throw new DecodeError(path, "unique playlist IDs")
  return result
}
function thumb(raw: unknown, path: string): string {
  const value = text(raw, path)
  let url: URL
  try { url = new URL(value) } catch { throw new DecodeError(path, "an HTTP thumbnail URL") }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new DecodeError(path, "an HTTP thumbnail URL")
  return value
}
function decodePlaylist(raw: unknown, path: string): CachePlaylist {
  const row = record(raw, path)
  return {
    ...extensions(row, ["id", "title", "privacy", "count", "thumb"]),
    id: playlistId(row.id, `${path}.id`), title: text(row.title, `${path}.title`),
    ...(row.privacy === undefined ? {} : { privacy: privacy(row.privacy, `${path}.privacy`) }),
    ...(row.count === undefined ? {} : { count: natural(row.count, `${path}.count`) }),
    ...(row.thumb === undefined ? {} : { thumb: thumb(row.thumb, `${path}.thumb`) })
  }
}
function decodeCreated(raw: unknown, path: string): CreatedPlaylist {
  const row = record(raw, path)
  return { ...extensions(row, ["id", "title", "privacy", "at"]), id: playlistId(row.id, `${path}.id`),
    title: text(row.title, `${path}.title`), privacy: privacy(row.privacy, `${path}.privacy`), at: natural(row.at, `${path}.at`) }
}
export function emptyAccountCache(): AccountCache {
  return { listAt: null, playlists: [], order: {}, created: [], labelAt: null }
}
export function decodeAccountCache(raw: unknown, path = "cache"): AccountCache {
  const value = record(raw, path), order = record(value.order ?? {}, `${path}.order`)
  const siteOrder = (site: CacheSite) => {
    const ids = order[site]
    if (ids === undefined) return undefined
    if (!Array.isArray(ids)) throw new DecodeError(`${path}.order.${site}`, "an array")
    const decoded = ids.map((id: unknown) => playlistId(id, `${path}.order.${site}`))
    if (new Set(decoded).size !== decoded.length) throw new DecodeError(`${path}.order.${site}`, "unique playlist IDs")
    return decoded
  }
  const www = siteOrder("www"), music = siteOrder("music")
  return { ...extensions(value, ["listAt", "playlists", "order", "created", "labelAt"]),
    listAt: typeof value.listAt === "number" && Number.isSafeInteger(value.listAt) && value.listAt >= 0 ? value.listAt : null,
    playlists: rows(value.playlists ?? [], `${path}.playlists`, decodePlaylist),
    order: { ...extensions(order, ["www", "music"]), ...(www === undefined ? {} : { www }), ...(music === undefined ? {} : { music }) },
    created: rows(value.created ?? [], `${path}.created`, decodeCreated),
    labelAt: nullable(natural)(value.labelAt ?? null, `${path}.labelAt`) }
}
export function visibleAccountCache(cache: AccountCache, now: number): AccountCache {
  return decodeAccountCache({ ...cache, created: cache.created.filter(row => row.at <= now && now - row.at < CREATED_PLAYLIST_MS && !cache.playlists.some(playlist => playlist.id === row.id)) })
}
export function cacheIsFresh(cache: AccountCache | null, now: number): boolean {
  const at = cache?.listAt
  return typeof at === "number" && Number.isSafeInteger(now) && now >= at && now - at <= PLAYLIST_FRESH_MS
}
export function cacheRows(cache: AccountCache, site: CacheSite): CachePlaylist[] {
  const rows = new Map<PlaylistId, CachePlaylist>()
  for (const row of [...cache.playlists, ...cache.created]) {
    if (site === "music" && row.id === WATCH_LATER || rows.has(row.id)) continue
    rows.set(row.id, { id: row.id, title: row.title, ...(row.privacy === undefined ? {} : { privacy: row.privacy }),
      ...("count" in row && typeof row.count === "number" ? { count: row.count } : {}),
      ...("thumb" in row && typeof row.thumb === "string" ? { thumb: row.thumb } : {}) })
  }
  const result: CachePlaylist[] = []
  if (site === "www") { result.push(rows.get(WATCH_LATER) ?? { id: WATCH_LATER, title: "Watch later" }); rows.delete(WATCH_LATER) }
  for (const id of cache.order[site] ?? []) { const row = rows.get(id); if (row) { result.push(row); rows.delete(id) } }
  return [...result, ...rows.values()]
}
