import { isRecord } from "./codec"
import { isAccountKey, isVideoId, type AccountKey, type VideoId } from "./validation"

/** Played stretches in seconds, `[start, end]` with `start < end`. */
export type ProgressParts = readonly (readonly [start: number, end: number])[]
/** One video's remembered watch progress (DATA-24): its length, the merged stretches played, and when it last played. */
export type ProgressEntry = { readonly len: number; readonly parts: ProgressParts; readonly at: number }
/** One `progress:<acct>:<n>` shard: about a sixteenth of the account's videos (DATA-56). */
export type Progress = Readonly<Partial<Record<VideoId, ProgressEntry>>>
export type ProgressShard = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15
export type ProgressShards = Readonly<Record<ProgressShard, Progress>>

export const PROGRESS_SHARDS: readonly ProgressShard[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
export const PROGRESS_PARTS = 100
export const PROGRESS_VIDEOS = 2_000
export const PROGRESS_KEEP_MS = 30 * 24 * 60 * 60 * 1000
export const PROGRESS_PRUNE_MS = 24 * 60 * 60 * 1000

/** FNV-1a over the ID's characters, low four bits: a video always lands in the same shard on every browser. */
export function progressShard(video: VideoId): ProgressShard {
  let hash = 0x811c9dc5
  for (let i = 0; i < video.length; i++) hash = Math.imul(hash ^ video.charCodeAt(i), 0x01000193)
  return PROGRESS_SHARDS[hash & 15] ?? 0
}
export function progressKey(acct: AccountKey, shard: ProgressShard): string {
  return `progress:${acct}:${shard}`
}
export function parseProgressKey(name: string): { readonly acct: AccountKey; readonly shard: ProgressShard } | null {
  const match = /^progress:([A-Za-z0-9_-]{16}):([0-9]|1[0-5])$/.exec(name)
  const shard = PROGRESS_SHARDS.find(value => String(value) === match?.[2])
  return match && isAccountKey(match[1]) && shard !== undefined ? { acct: match[1], shard } : null
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
function decodeEntry(raw: unknown): ProgressEntry | null {
  if (!isRecord(raw) || !finite(raw.len) || raw.len <= 0 || !finite(raw.at) || raw.at < 0 || !Array.isArray(raw.parts)) return null
  const len = raw.len
  const parts: [number, number][] = []
  for (const part of raw.parts) {
    if (!Array.isArray(part) || part.length !== 2) return null
    const [start, end] = part
    if (!finite(start) || !finite(end) || start < 0 || end <= start || end > len) return null
    parts.push([start, end])
  }
  return parts.length > 0 && parts.length <= PROGRESS_PARTS ? { len, parts, at: raw.at } : null
}

/**
 * Reads a stored shard. Progress can only ever undercount, so an entry that doesn't decode is dropped rather than
 * blocking the rest of the shard, and anything that isn't a shard at all reads as empty.
 */
export function decodeProgress(raw: unknown): Progress {
  if (!isRecord(raw)) return {}
  const result: Partial<Record<VideoId, ProgressEntry>> = {}
  for (const [video, value] of Object.entries(raw)) {
    const entry = isVideoId(video) ? decodeEntry(value) : null
    if (entry && isVideoId(video)) result[video] = entry
  }
  return result
}

/** An entry lasts 30 days after it last played (DATA-25). A clock that went backwards keeps it. */
export function progressLive(entry: ProgressEntry, now: number): boolean {
  return now - entry.at < PROGRESS_KEEP_MS
}

/**
 * The stored form of played stretches (DATA-24): clamped to the length, rounded inwards to 0.1 s, overlaps merged, and
 * at most 100 stretches, dropping the shortest. Every step can only shrink what's counted.
 */
export function storedParts(parts: ProgressParts, len: number): ProgressParts {
  const rounded = parts
    .map(([start, end]): [number, number] => [Math.max(0, Math.ceil(start * 10 - 1e-6) / 10), Math.floor(Math.min(end, len) * 10 + 1e-6) / 10])
    .filter(([start, end]) => finite(start) && finite(end) && end > start)
    .sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const [start, end] of rounded) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  if (merged.length <= PROGRESS_PARTS) return merged
  const kept = new Set([...merged].sort((a, b) => b[1] - b[0] - (a[1] - a[0]) || a[0] - b[0]).slice(0, PROGRESS_PARTS))
  return merged.filter(part => kept.has(part))
}

/** A save: the video's new length and stretches, or none at all once auto-add has run for it (DATA-25). */
export function rememberProgress(shard: Progress, video: VideoId, saved: { readonly len: number; readonly parts: ProgressParts }, now: number): Progress {
  const { [video]: _previous, ...rest } = shard
  const parts = saved.len > 0 && finite(saved.len) ? storedParts(saved.parts, saved.len) : []
  return parts.length === 0 ? rest : { ...rest, [video]: { len: saved.len, parts, at: now } }
}

/**
 * The daily prune and the 2,000-video cap (DATA-26) over an account's 16 shards: expired entries go, then the oldest
 * until 2,000 are left. Only shards that changed come back, so the caller rewrites nothing else.
 */
export function pruneProgress(shards: ProgressShards, now: number): Partial<Record<ProgressShard, Progress>> {
  const live: { shard: ProgressShard; video: VideoId; at: number }[] = []
  const changed = new Set<ProgressShard>()
  for (const shard of PROGRESS_SHARDS) {
    for (const [video, entry] of Object.entries(shards[shard])) {
      if (!entry || !isVideoId(video)) continue
      if (progressLive(entry, now)) live.push({ shard, video, at: entry.at })
      else changed.add(shard)
    }
  }
  live.sort((a, b) => b.at - a.at || (a.video < b.video ? -1 : a.video > b.video ? 1 : 0))
  const kept = new Set(live.slice(0, PROGRESS_VIDEOS).map(row => `${row.shard}:${row.video}`))
  for (const row of live.slice(PROGRESS_VIDEOS)) changed.add(row.shard)
  const result: Partial<Record<ProgressShard, Progress>> = {}
  for (const shard of changed) {
    const next: Partial<Record<VideoId, ProgressEntry>> = {}
    for (const [video, entry] of Object.entries(shards[shard])) {
      if (entry && isVideoId(video) && kept.has(`${shard}:${video}`)) next[video] = entry
    }
    result[shard] = next
  }
  return result
}

export function progressJson(shard: Progress): Record<string, { len: number; parts: [number, number][]; at: number }> {
  const result: Record<string, { len: number; parts: [number, number][]; at: number }> = {}
  for (const [video, entry] of Object.entries(shard)) {
    if (entry) result[video] = { len: entry.len, parts: entry.parts.map(([start, end]) => [start, end]), at: entry.at }
  }
  return result
}
