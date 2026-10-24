import { DecodeError, decodeFilter, isChannelId, isPlaylistId, normalizeFilterForWrite } from "../../shared/model"
import type { Filter, Unclaimed, UpgradeDetails } from "../../shared/model"
import { isRecord } from "../../shared/model/codec"

export const UPGRADE_TRIGGER_KEYS = [
  "playlists", "addToPlaylistID", "watchLaterShortcut", "requiredWatchPercentage", "toastEnabled",
  "clientID", "clientSecret", "accessToken", "refreshToken"
] as const
export const DEVELOPER_KEYS = [
  "authMode", "authServerURL", "cachedPlaylists", "preventDuplicates", "queueButtonEnabled",
  "cardContextMenu", "channelFilters", "channelLabels"
] as const
export const LEGACY_DELETE_KEYS = [...UPGRADE_TRIGGER_KEYS, ...DEVELOPER_KEYS] as const
export const CREDENTIAL_KEYS = ["clientID", "clientSecret", "accessToken", "refreshToken"] as const
const valueKeys = ["playlists", "addToPlaylistID", "watchLaterShortcut", "requiredWatchPercentage", "toastEnabled", "channelFilters", "channelLabels"] as const
export type LegacyKey = typeof LEGACY_DELETE_KEYS[number]
type LegacyValueKey = typeof valueKeys[number]
export type LegacyEvidence = {
  presentKeys: readonly LegacyKey[]
  values: Partial<Record<LegacyValueKey, unknown>>
  refreshTokenWasNonempty: boolean
}

export function validateLegacyEvidence(raw: LegacyEvidence): void {
  if (!isRecord(raw) || !Array.isArray(raw.presentKeys) ||
    Array.from(raw.presentKeys).some((key: unknown) => !LEGACY_DELETE_KEYS.some(known => known === key)) ||
    !isRecord(raw.values) || Object.keys(raw.values).some(key => !valueKeys.some(known => known === key)) ||
    typeof raw.refreshTokenWasNonempty !== "boolean" ||
    (raw.refreshTokenWasNonempty && !raw.presentKeys.includes("refreshToken"))) {
    throw new DecodeError("legacy", "sanitized legacy evidence")
  }
  for (const key of valueKeys) {
    if (raw.values[key] !== undefined && !raw.presentKeys.includes(key)) throw new DecodeError("legacy.values", "values for observed keys only")
  }
}

function cleanPlaylist(raw: string): string | null {
  const match = /(?:[?&]|\b)list=([^&#]*)/.exec(raw)
  let value = match?.[1] ?? raw
  if (match) {
    try { value = decodeURIComponent(value.replace(/\+/g, " ")) }
    catch { return null }
  }
  value = value.trim()
  return /^PL[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null
}

function filters(raw: unknown, labels: unknown): Record<string, Filter> {
  if (raw === undefined) raw = {}
  if (labels === undefined) labels = {}
  if (!isRecord(raw)) throw new DecodeError("legacy.values.channelFilters", "a filter map")
  if (!isRecord(labels)) throw new DecodeError("legacy.values.channelLabels", "a label map")
  const result: [string, Filter][] = []
  for (const [playlist, filter] of Object.entries(raw)) {
    if (!isPlaylistId(playlist) || !isRecord(filter) || (filter.mode !== "allow" && filter.mode !== "deny") ||
      typeof filter.enabled !== "boolean" || !Array.isArray(filter.channels) || !filter.channels.every(isChannelId)) {
      throw new DecodeError("legacy.values.channelFilters", "valid playlist filters")
    }
    const channels: Filter["channels"] = filter.channels.map((id: string) => {
      const label = labels[id]
      const title = isRecord(label) && typeof label.title === "string" ? label.title : ""
      const handle = isRecord(label) && typeof label.handle === "string" ? label.handle : undefined
      return handle === undefined ? [id, title] : [id, title, handle]
    })
    result.push([playlist, normalizeFilterForWrite(decodeFilter({ mode: filter.mode, on: filter.enabled, channels }))])
  }
  return Object.fromEntries(result)
}

export function convertLegacy(evidence: LegacyEvidence): {
  from: Unclaimed["from"]
  autoAdd: string[]
  dropped: number
  shortcutPlaylist: string | null
  rawShortcut: string
  pct: UpgradeDetails["pct"]
  feedback: boolean
  filters: Record<string, Filter>
} {
  const values = evidence.values
  const entries = values.playlists === undefined ? [] : values.playlists
  if (!Array.isArray(entries) || !Array.from(entries).every((entry: unknown) => typeof entry === "string")) throw new DecodeError("legacy.values.playlists", "an array of strings")
  for (const key of ["addToPlaylistID", "watchLaterShortcut"] as const) {
    if (values[key] !== undefined && typeof values[key] !== "string") throw new DecodeError(`legacy.values.${key}`, "a string")
  }
  const autoAdd = new Set<string>()
  let dropped = 0
  for (const entry of entries) {
    const playlist = cleanPlaylist(entry)
    if (playlist !== null) autoAdd.add(playlist)
    else if (entry.trim() !== "") dropped++
  }
  const rawPct = values.requiredWatchPercentage
  const numeric = typeof rawPct === "number" ? rawPct
    : typeof rawPct === "string" && rawPct.trim() !== "" ? Number(rawPct) : NaN
  const wasUnset = !Number.isFinite(numeric)
  const authorised = evidence.refreshTokenWasNonempty
  return {
    from: evidence.presentKeys.some(key => DEVELOPER_KEYS.some(developer => developer === key)) ? "1.5.0" : "1.4.5",
    autoAdd: [...autoAdd], dropped,
    shortcutPlaylist: typeof values.addToPlaylistID === "string" ? cleanPlaylist(values.addToPlaylistID) : null,
    rawShortcut: typeof values.watchLaterShortcut === "string" ? values.watchLaterShortcut : "",
    pct: { value: wasUnset ? authorised ? 0 : 50 : Math.min(100, Math.max(0, Math.round(numeric))), wasUnset, authorised },
    feedback: values.toastEnabled === true,
    filters: filters(values.channelFilters, values.channelLabels)
  }
}
