import { isAccountKey, isPlaylistId, isVideoId, type AccountKey } from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"

export type RemovalSessionCollection = "recent" | "recentAdds" | "shown" | "breakage" | "gather"
export type RemovalSessionKey = { readonly kind: "skips" | "cooldown"; readonly acct: AccountKey }
export type RemovalSessionEffect =
  | { readonly kind: "set"; readonly key: RemovalSessionCollection; readonly value: JsonValue }
  | { readonly kind: "remove"; readonly key: RemovalSessionKey }
export type RemovalSessionPlan =
  | { readonly kind: "unsupported" }
  | { readonly kind: "supported"; readonly effects: readonly RemovalSessionEffect[]; readonly expected: JsonObject }

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value)
}
function natural(value: unknown): boolean { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 }
function titledVideo(value: unknown): boolean { return object(value) && isVideoId(value.id) && typeof value.title === "string" }
function titledPlaylist(value: unknown): boolean { return object(value) && isPlaylistId(value.id) && typeof value.title === "string" }
function recent(value: JsonValue): boolean {
  return object(value) && isAccountKey(value.acct) && isPlaylistId(value.playlist) && isVideoId(value.video) && natural(value.at)
}
function recentAdd(value: JsonValue): boolean {
  if (!object(value) || !isAccountKey(value.acct) || !natural(value.at) || !Array.isArray(value.playlists) ||
    value.playlists.length === 0 || !value.playlists.every(titledPlaylist) || !object(value.source)) return false
  if (value.source.kind === "feature") {
    if (typeof value.source.feature !== "string" || value.source.feature.length === 0) return false
  } else if (value.source.kind === "shortcut") {
    if (!object(value.source.key) || typeof value.source.key.code !== "string" ||
      !["ctrl", "alt", "shift", "meta"].every(key => typeof (object(value.source) && object(value.source.key) ? value.source.key[key] : undefined) === "boolean")) return false
  } else return false
  switch (value.kind) {
    case "single": return titledVideo(value.video)
    case "gather": return Array.isArray(value.videos) && value.videos.length > 0 && value.videos.every(titledVideo)
    default: return false
  }
}

export function planAccountSessionRemoval(acct: AccountKey, raw: unknown): RemovalSessionPlan {
  if (!isAccountKey(acct) || !object(raw)) return { kind: "unsupported" }
  const expected = { ...raw }, effects: RemovalSessionEffect[] = []
  for (const kind of ["skips", "cooldown"] as const) {
    const name = `${kind}:${acct}`
    if (!Object.hasOwn(raw, name)) continue
    const value = raw[name]
    if (kind === "cooldown" ? !natural(value) : !object(value) || !Object.entries(value).every(([video, playlists]) =>
      isVideoId(video) && (playlists === "all" || Array.isArray(playlists) && playlists.every(isPlaylistId)))) return { kind: "unsupported" }
    effects.push({ kind: "remove", key: { kind, acct } })
    delete expected[name]
  }
  for (const key of ["recent", "recentAdds"] as const) {
    if (!Object.hasOwn(raw, key)) continue
    const rows = raw[key]
    if (!Array.isArray(rows) || !rows.every(key === "recent" ? recent : recentAdd) || key === "recentAdds" && rows.length > 50) return { kind: "unsupported" }
    const value = rows.filter(row => object(row) && row.acct !== acct)
    if (value.length === rows.length) continue
    expected[key] = value
    effects.push({ kind: "set", key, value })
  }
  for (const key of ["shown", "breakage", "gather"] as const) {
    if (!Object.hasOwn(raw, key)) continue
    const value = raw[key]
    if (!object(value) || value.v !== 1 || !object(value.global) || !object(value.accounts) ||
      !Object.entries(value.accounts).every(([account, bucket]) => isAccountKey(account) && object(bucket))) return { kind: "unsupported" }
    if (!Object.hasOwn(value.accounts, acct)) continue
    const accounts = { ...value.accounts }
    delete accounts[acct]
    const next = { ...value, accounts }
    expected[key] = next
    effects.push({ kind: "set", key, value: next })
  }
  return { kind: "supported", effects, expected }
}
