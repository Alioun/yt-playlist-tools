import { isQueueListId, isSetVideoId } from "../../shared/contracts"
import type { QueueListId, SetVideoId } from "../../shared/contracts"
import { isVideoId } from "../../shared/model/validation"
import type { VideoId } from "../../shared/model/validation"
import { field, parseTargetVideo } from "../read-parsers"

export type QueueEntry = { videoId: VideoId; setVideoId: SetVideoId }
export type QueuePanel = { listId: QueueListId; entries: QueueEntry[] }
export type QueueCard = { videoId: VideoId; command: Record<string, unknown> }
export type QueueAnswer = { status: string | undefined; setVideoId: SetVideoId | undefined; noisy: boolean }

const queueList = "PLAYLIST_EDIT_LIST_TYPE_QUEUE"
const searchLimit = 4000

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
function panelEntry(raw: unknown): QueueEntry | undefined | null {
  const renderer = field(raw, "playlistPanelVideoRenderer")
  if (renderer === undefined) return null
  const videoId = field(renderer, "videoId"), setVideoId = field(renderer, "playlistSetVideoId")
  return isVideoId(videoId) && isSetVideoId(setVideoId) ? { videoId, setVideoId } : undefined
}
export function parseQueuePanel(candidates: unknown): QueuePanel | undefined {
  if (!Array.isArray(candidates)) return undefined
  for (const data of candidates) {
    const listId = field(data, "playlistId")
    if (typeof listId !== "string" || !listId.startsWith("TLPQ") || !isQueueListId(listId)) continue
    const contents = field(data, "contents")
    if (!Array.isArray(contents)) return undefined
    const entries: QueueEntry[] = []
    const seen = new Set<string>()
    for (const item of contents) {
      const entry = panelEntry(item)
      if (entry === null) continue
      if (!entry || seen.has(entry.setVideoId)) return undefined
      seen.add(entry.setVideoId)
      entries.push(entry)
    }
    return { listId, entries }
  }
  return undefined
}
export function hasQueueList(candidates: unknown): boolean {
  return Array.isArray(candidates) && candidates.some(data => {
    const listId = field(data, "playlistId")
    return typeof listId === "string" && listId.startsWith("TLPQ")
  })
}
export function parseMiniplayer(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined
}
function queueCommandFor(value: unknown, videoId: VideoId): boolean {
  const command = field(value, "addToPlaylistCommand")
  if (!record(command) || command.listType !== queueList) return false
  const ids = command.videoIds
  if (ids !== undefined) return Array.isArray(ids) && ids.length === 1 && ids[0] === videoId
  return command.videoId === videoId
}
export function parseQueueCard(raw: unknown): QueueCard | undefined {
  const video = parseTargetVideo(raw)
  if (!video) return undefined
  const pending: { value: unknown; owner: Record<string, unknown> | undefined }[] = [{ value: raw, owner: undefined }]
  for (let index = 0; index < pending.length; index++) {
    if (index >= searchLimit) return undefined
    const next = pending[index]
    if (!next) break
    const { value, owner } = next
    if (Array.isArray(value)) { for (const item of value) pending.push({ value: item, owner }); continue }
    if (!record(value)) continue
    if (queueCommandFor(value, video.videoId)) return { videoId: video.videoId, command: owner ?? value }
    const signal = Array.isArray(field(value, "signalServiceEndpoint", "actions"))
    for (const [key, child] of Object.entries(value)) {
      pending.push({ value: child, owner: key === "signalServiceEndpoint" && signal ? value : owner })
    }
  }
  return undefined
}
function toastIn(value: unknown, depth: number): boolean {
  if (depth > 8) return false
  if (Array.isArray(value)) return value.some(item => toastIn(item, depth + 1))
  if (!record(value)) return false
  if (value.addToToastAction !== undefined) return true
  if (field(value, "openPopupAction", "popupType") === "TOAST") return true
  return ["actions", "onResponseReceivedActions", "onResponseReceivedEndpoints", "clientActions", "command"]
    .some(key => toastIn(value[key], depth + 1))
}
export function parseQueueAnswer(body: unknown): QueueAnswer {
  const status = field(body, "status")
  const results = field(body, "playlistEditResults")
  let setVideoId: SetVideoId | undefined
  if (Array.isArray(results)) {
    for (const result of results) {
      const id = field(result, "playlistEditVideoAddedResultData", "setVideoId")
      if (isSetVideoId(id)) { setVideoId = id; break }
    }
  }
  return { status: typeof status === "string" ? status : undefined, setVideoId, noisy: toastIn(body, 0) }
}
export function isQueueToast(detail: unknown): boolean {
  if (field(detail, "actionName") !== "yt-open-popup-action") return false
  const args = field(detail, "args")
  return Array.isArray(args) && args.some(arg => field(arg, "openPopupAction", "popupType") === "TOAST")
}
export function isMenuPopup(detail: unknown): boolean {
  if (field(detail, "actionName") !== "yt-open-popup-action") return false
  const args = field(detail, "args")
  return Array.isArray(args) && args.some(arg => field(arg, "openPopupAction", "popupType") === "DROPDOWN")
}
