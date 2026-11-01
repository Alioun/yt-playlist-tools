import { isQueueItemId } from "../../shared/contracts"
import type { QueueItemId } from "../../shared/contracts"
import { isVideoId } from "../../shared/model/validation"
import type { VideoId } from "../../shared/model/validation"
import { field, queueRenderer } from "../read-parsers"

export type QueueEntry = { id: QueueItemId; videoId: VideoId | undefined; raw: unknown }
export type QueueSnapshot = { entries: QueueEntry[]; current: number }
export type QueueReplayAnswer = { items: unknown[]; params: unknown }

export function sameItem(a: QueueItemId, b: QueueItemId): boolean { return String(a) === String(b) }
export function indexOf(snapshot: QueueSnapshot, id: QueueItemId): number {
  return snapshot.entries.findIndex(entry => sameItem(entry.id, id))
}

export function parseQueueEntries(raw: unknown): QueueEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const entries: QueueEntry[] = []
  for (const item of raw) {
    const renderer = queueRenderer(item)
    const id = field(renderer, "navigationEndpoint", "watchEndpoint", "index")
    const videoId = field(renderer, "videoId")
    if (!isQueueItemId(id) || videoId !== undefined && !isVideoId(videoId)) return undefined
    entries.push({ id, videoId, raw: item })
  }
  return new Set(entries.map(entry => String(entry.id))).size === entries.length ? entries : undefined
}

export function parseQueueSnapshot(items: unknown, current: unknown): QueueSnapshot | undefined {
  const entries = parseQueueEntries(items)
  if (!entries || typeof current !== "number" || !Number.isSafeInteger(current) || current < -1 || current >= Math.max(1, entries.length)) return undefined
  return { entries, current: entries.length === 0 ? -1 : current }
}

export function parseQueueReplay(body: unknown): QueueReplayAnswer | undefined {
  const datas = field(body, "queueDatas")
  if (!Array.isArray(datas) || datas.length === 0) return undefined
  const items = datas.map(data => field(data, "content"))
  if (!items.every(item => isVideoId(field(queueRenderer(item), "videoId")))) return undefined
  return { items, params: field(body, "queueContextParams") }
}
