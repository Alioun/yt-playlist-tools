import { isPrivacy, isSetVideoId } from "../../shared/contracts"
import type { BatchAddResult, Job, JobDataById, JobFailure, MembershipRow, PlaylistRow, Privacy } from "../../shared/contracts"
import { isChannelId, isPlaylistId } from "../../shared/model/validation"
import { field, parseChannel } from "../read-parsers"

export function text(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw
  for (const key of ["simpleText", "content"]) { const value = field(raw, key); if (typeof value === "string") return value }
  const runs = field(raw, "runs")
  if (Array.isArray(runs) && runs.every(run => typeof field(run, "text") === "string")) return runs.map(run => field(run, "text")).join("")
  return undefined
}
export function nodes(raw: unknown): unknown[] {
  const result: unknown[] = [], pending = [{ raw, depth: 0 }], seen = new Set<object>()
  while (pending.length) {
    const next = pending.pop()
    if (!next) break
    const { raw: value, depth } = next
    if (value === null || typeof value !== "object" || seen.has(value)) continue
    if (depth > 32 || result.length >= 10_000) throw new Error("Answer shape exceeds bound")
    seen.add(value); result.push(value)
    const children = Array.isArray(value) ? value : Object.keys(value).filter(key => key !== "responseContext").map(key => field(value, key))
    for (let i = children.length - 1; i >= 0; i--) pending.push({ raw: children[i], depth: depth + 1 })
  }
  return result
}
function count(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) return raw
  const value = text(raw)
  if (value && /^\d[\d,]*(?:\s+(?:videos?|songs?|tracks?))?$/.test(value)) {
    const n = Number(value.replace(/,/g, "").split(" ")[0])
    if (Number.isSafeInteger(n) && n >= 0) return n
  }
  return undefined
}
function privacy(raw: unknown): Privacy | undefined {
  if (isPrivacy(raw)) return raw
  const icon = field(raw, "iconType")
  if (icon === "PRIVACY_PRIVATE") return "PRIVATE"
  if (icon === "PRIVACY_UNLISTED") return "UNLISTED"
  if (icon === "PRIVACY_PUBLIC") return "PUBLIC"
  return isPrivacy(icon) ? icon : undefined
}
function metadata(raw: unknown): { privacy?: Privacy; count?: number } {
  const visibility = privacy(field(raw, "privacy")) ?? privacy(field(raw, "privacyStatus")) ?? privacy(field(raw, "privacyIcon"))
  const size = count(field(raw, "videoCount")) ?? count(field(raw, "count")) ?? count(field(raw, "videoCountText")) ?? count(field(raw, "subtitle"))
  return { ...(visibility ? { privacy: visibility } : {}), ...(size !== undefined ? { count: size } : {}) }
}
function playlistId(raw: unknown) {
  const candidate = field(raw, "playlistId") ?? field(raw, "contentId") ?? field(raw, "navigationEndpoint", "browseEndpoint", "browseId")
  const id = typeof candidate === "string" && candidate.startsWith("VL") ? candidate.slice(2) : candidate
  return isPlaylistId(id) ? id : undefined
}
function entityIndex(all: unknown[]): Map<string, unknown> {
  const entities = new Map<string, unknown>()
  for (const node of all) {
    const key = field(node, "entityKey"), payload = field(node, "payload")
    if (typeof key === "string" && payload !== undefined) {
      entities.set(key, field(payload, "saveToPlaylistListEntity") ?? field(payload, "playlistEntity") ?? field(payload, "playlistStateEntity") ?? payload)
    }
    const saved = field(node, "saveToPlaylistListEntity"), savedKey = field(saved, "key")
    if (typeof savedKey === "string") entities.set(savedKey, saved)
  }
  return entities
}
export type PageRows<T> = { rows: T[]; continuation?: string }
function continuation(all: unknown[]): string | undefined | false {
  const tokens = new Set<string>()
  for (const node of all) {
    const token = field(node, "continuationCommand", "token") ?? field(node, "nextContinuationData", "continuation")
    if (token !== undefined && (typeof token !== "string" || token.length === 0 || token.length > 8192)) return false
    if (typeof token === "string") tokens.add(token)
  }
  return tokens.size > 1 ? false : [...tokens][0]
}
export function parseMembership(raw: unknown): PageRows<MembershipRow> | undefined {
  const all = nodes(raw), entities = entityIndex(all), rows: MembershipRow[] = []
  let recognised = false, explicitEmpty = false
  for (const node of all) {
    for (const key of ["playlistAddToPlaylistRenderer", "playlistAddToPlaylistViewModel"]) {
      const container = field(node, key)
      if (container === undefined) continue
      const items = field(container, "contents") ?? field(container, "items")
      if (!Array.isArray(items)) return undefined
      recognised = true
      if (items.length === 0) explicitEmpty = true
    }
    const renderer = field(node, "playlistAddToOptionRenderer") ?? field(node, "playlistAddToOptionViewModel") ?? field(node, "toggleableListItemViewModel")
    if (renderer === undefined) continue
    recognised = true
    const entityKey = field(renderer, "playlistEntityKey") ?? field(renderer, "playlistStateEntityKey") ?? field(renderer, "toggleStateKey")
    const entity = typeof entityKey === "string" ? entities.get(entityKey) : undefined
    if (entityKey !== undefined && !entity) return undefined
    const id = playlistId(renderer) ?? playlistId(entity) ?? playlistId(field(renderer, "defaultServiceEndpoint", "playlistEditEndpoint"))
    const title = text(field(renderer, "title")) ?? text(field(entity, "title"))
    const state = field(renderer, "containsSelectedVideos") ?? field(renderer, "playlistSelectionState") ?? field(renderer, "isSelected") ?? field(renderer, "isToggled") ??
      field(entity, "containsSelectedVideos") ?? field(entity, "isSelected") ?? field(entity, "selected") ?? field(entity, "playlistSelectionState")
    const contains = typeof state === "boolean" ? state : state === "ALL" || state === "SOME" || state === "PLAYLIST_SELECTION_STATE_SELECTED" ? true :
      state === "NONE" || state === "PLAYLIST_SELECTION_STATE_UNSELECTED" ? false : undefined
    if (!id || title === undefined || contains === undefined || rows.some(row => row.id === id)) return undefined
    rows.push({ id, title, ...metadata(entity), ...metadata(renderer), contains })
  }
  const token = continuation(all)
  if ((!recognised && !token) || token === false || rows.length === 0 && !explicitEmpty && !token) return undefined
  return { rows, ...(token ? { continuation: token } : {}) }
}
export function parsePlaylists(raw: unknown): PageRows<PlaylistRow> | undefined {
  const all = nodes(raw), rows: PlaylistRow[] = []
  let recognised = false, explicitEmpty = false
  for (const node of all) {
    for (const [key, fieldName] of [["gridRenderer", "items"], ["richGridRenderer", "contents"], ["sectionListRenderer", "contents"],
      ["playlistListViewModel", "items"], ["appendContinuationItemsAction", "continuationItems"], ["gridContinuation", "items"],
      ["reloadContinuationItemsCommand", "continuationItems"]] as const) {
      const container = field(node, key)
      if (container === undefined) continue
      const items = field(container, fieldName)
      if (!Array.isArray(items)) return undefined
      recognised = true
      if (items.length === 0) explicitEmpty = true
    }
    const renderer = field(node, "playlistRenderer") ?? field(node, "gridPlaylistRenderer") ?? field(node, "playlistViewModel") ?? field(node, "lockupViewModel")
    if (renderer === undefined) continue
    if (field(renderer, "contentType") !== undefined && field(renderer, "contentType") !== "LOCKUP_CONTENT_TYPE_PLAYLIST") continue
    const id = playlistId(renderer)
    const title = text(field(renderer, "title")) ?? text(field(renderer, "metadata", "lockupMetadataViewModel", "title"))
    if (!id || title === undefined) return undefined
    recognised = true
    const thumbnails = field(renderer, "thumbnail", "thumbnails") ?? field(renderer, "contentImage", "thumbnailViewModel", "image", "sources")
    const thumb = Array.isArray(thumbnails) ? field(thumbnails[thumbnails.length - 1], "url") : undefined
    rows.push({ id, title, ...metadata(renderer), ...(typeof thumb === "string" && thumb ? { thumb } : {}) })
  }
  const token = continuation(all)
  if ((!recognised && !token) || token === false || rows.length === 0 && !explicitEmpty && !token) return undefined
  return { rows, ...(token ? { continuation: token } : {}) }
}
export function parseLabel(raw: unknown): JobDataById["accountLabel"] | undefined {
  for (const node of nodes(raw)) {
    const renderer = field(node, "accountHeaderRenderer") ?? field(node, "activeAccountHeaderRenderer")
    if (renderer === undefined) continue
    const name = text(field(renderer, "accountName"))
    if (name === undefined) return undefined
    const handle = text(field(renderer, "channelHandle")), thumbs = field(renderer, "accountPhoto", "thumbnails")
    const avatar = Array.isArray(thumbs) ? field(thumbs[thumbs.length - 1], "url") : undefined
    return { name, ...(handle ? { handle } : {}), ...(typeof avatar === "string" && avatar ? { avatar } : {}) }
  }
  return undefined
}
const statuses = new Set(["STATUS_FAILED", "STATUS_SUCCEEDED", "STATUS_VIDEO_ALREADY_IN_PLAYLIST", "STATUS_PLAYLIST_NOT_FOUND",
  "STATUS_PLAYLIST_FULL", "STATUS_VIDEO_UNAVAILABLE", "STATUS_PERMISSION_DENIED", "STATUS_FEATURE_NOT_ENABLED",
  "STATUS_SIGNED_OUT", "STATUS_ACCOUNT_REFUSED", "STATUS_VIDEO_NOT_FOUND"])
export function knownStatus(raw: unknown): string | undefined { return typeof raw === "string" && statuses.has(raw) ? raw : undefined }
export function answerFailure(http: number, raw: unknown): JobFailure | undefined {
  const status = knownStatus(field(raw, "status"))
  if (status === "STATUS_SIGNED_OUT") return { ok: false, reason: "signedOut" }
  if (http < 200 || http >= 300 || field(raw, "error") !== undefined || status !== undefined && status !== "STATUS_SUCCEEDED") {
    return { ok: false, reason: "failed", ...(http >= 100 && http <= 599 ? { http } : {}), ...(status ? { status } : {}) }
  }
  return undefined
}
function added(job: Extract<Job, { kind: "add" | "save" }>, raw: unknown): { setVideoId: JobDataById["add"]["setVideoId"] } | undefined {
  const results = field(raw, "playlistEditResults")
  if (Array.isArray(results) && results.length > 1) return undefined
  if (Array.isArray(results) && results.length === 1) {
    const detail = field(results[0], "playlistEditVideoAddedResultData") ?? results[0]
    const status = field(detail, "status") ?? field(results[0], "status")
    if (status !== undefined && status !== "STATUS_SUCCEEDED" || field(results[0], "error") !== undefined) return undefined
  }
  const returnedVideo = field(raw, "videoId") ?? (Array.isArray(results) ? field(results[0], "playlistEditVideoAddedResultData", "videoId") : undefined)
  if (returnedVideo !== undefined && returnedVideo !== job.videoId) return undefined
  const fromResult = Array.isArray(results) && results.length === 1 ? field(results[0], "playlistEditVideoAddedResultData", "setVideoId") : undefined
  const id = field(raw, "setVideoId") ?? fromResult
  if (id !== undefined && id !== null && !isSetVideoId(id)) return undefined
  return { setVideoId: id === undefined || id === null ? null : id }
}
export function parseBatchAdd(job: Extract<Job, { kind: "addBatch" }>, raw: unknown): JobDataById["addBatch"] | undefined {
  const entries = field(raw, "playlistEditResults")
  if (!Array.isArray(entries) || entries.length > job.videoIds.length) return undefined
  const used = new Set<number>()
  const results: BatchAddResult[] = job.videoIds.map((videoId, index) => {
    const repeated = job.videoIds.indexOf(videoId) !== job.videoIds.lastIndexOf(videoId)
    const candidates = entries.flatMap((entry, i) => {
      const detail = field(entry, "playlistEditVideoAddedResultData") ?? field(entry, "playlistEditVideoResultData") ?? entry
      const id = field(detail, "videoId"), actionIndex = field(entry, "actionIndex") ?? field(detail, "actionIndex")
      const correlated = actionIndex === index && (id === undefined || id === videoId) || !repeated && actionIndex === undefined && id === videoId
      return !used.has(i) && correlated ? [{ entry, detail, i }] : []
    })
    const match = candidates[0]
    if (!match || candidates.length !== 1) {
      return { videoId, failure: { ok: false, reason: "unconfirmed" } }
    }
    used.add(match.i)
    const rawStatus = field(match.detail, "status") ?? field(match.entry, "status")
    const status = knownStatus(rawStatus)
    if (status && status !== "STATUS_SUCCEEDED") return { videoId, failure: { ok: false, reason: "failed", status } }
    if (field(match.entry, "error") !== undefined || field(match.detail, "error") !== undefined) return { videoId, failure: { ok: false, reason: "failed" } }
    if (rawStatus !== undefined && !status) return { videoId, failure: { ok: false, reason: "unconfirmed" } }
    const explicit = field(match.entry, "playlistEditVideoAddedResultData") !== undefined || status === "STATUS_SUCCEEDED"
    const id = field(match.detail, "setVideoId")
    if (!explicit || id !== undefined && id !== null && !isSetVideoId(id)) return { videoId, failure: { ok: false, reason: "unconfirmed" } }
    return { videoId, setVideoId: isSetVideoId(id) ? id : null }
  })
  return { results }
}
export function parseWrite(job: Job, raw: unknown): unknown {
  if (job.kind === "addBatch") return parseBatchAdd(job, raw)
  if (job.kind === "create") {
    if (field(raw, "status") !== undefined && field(raw, "status") !== "STATUS_SUCCEEDED") return undefined
    const id = field(raw, "playlistId")
    return isPlaylistId(id) ? { playlistId: id } : undefined
  }
  if (field(raw, "status") !== "STATUS_SUCCEEDED") return undefined
  switch (job.kind) {
    case "add": case "save": return added(job, raw)
    case "remove": case "unsave": return null
    case "removeBatch": {
      const results = field(raw, "playlistEditResults")
      if (!Array.isArray(results) || results.length !== job.setVideoIds.length) return undefined
      let removed = 0
      for (let index = 0; index < results.length; index++) {
        const entry = results[index], detail = field(entry, "playlistEditVideoRemovedResultData") ?? entry
        const id = field(detail, "setVideoId"), actionIndex = field(entry, "actionIndex")
        if (id !== job.setVideoIds[index] || actionIndex !== undefined && actionIndex !== index) return undefined
        const status = knownStatus(field(detail, "status") ?? field(entry, "status"))
        if (status === "STATUS_SUCCEEDED" || status === "STATUS_VIDEO_NOT_FOUND" || status === undefined && field(entry, "playlistEditVideoRemovedResultData") !== undefined) removed++
        else if (!status) return undefined
      }
      return { removed }
    }
    default: return undefined
  }
}
export function parseResolved(raw: unknown): { kind: "channel"; channelId: JobDataById["resolveChannel"]["channelId"] } | { kind: "hop"; url: string } | undefined {
  const endpoint = field(raw, "endpoint")
  const id = field(endpoint, "browseEndpoint", "browseId")
  if (isChannelId(id) && field(endpoint, "commandMetadata", "webCommandMetadata", "webPageType") === "WEB_PAGE_TYPE_CHANNEL") return { kind: "channel", channelId: id }
  const url = field(endpoint, "urlEndpoint", "url")
  return typeof url === "string" ? { kind: "hop", url } : undefined
}
export function parseChannelDetails(raw: unknown, id: JobDataById["resolveChannel"]["channelId"]): JobDataById["resolveChannel"] | undefined {
  for (const node of nodes(raw)) {
    const renderer = field(node, "channelMetadataRenderer")
    if (renderer === undefined) continue
    const title = field(renderer, "title"), ownId = field(renderer, "externalId")
    if (ownId !== id || typeof title !== "string" || !title) return undefined
    const url = field(renderer, "vanityChannelUrl")
    const handle = typeof url === "string" ? /\/@([^/?#]+)/.exec(url)?.[1] : undefined
    return { channelId: id, title, ...(handle ? { handle: `@${handle}` } : {}) }
  }
  return undefined
}
export function parseRequestedChannel(raw: unknown, videoId: Extract<Job, { kind: "channelOf" }>["videoId"]): JobDataById["channelOf"] | undefined {
  const player = field(raw, "playerResponse") ?? field(raw, "playerOverlays", "playerOverlayRenderer", "videoDetails")
  const direct = parseChannel(raw, videoId) ?? parseChannel(player, videoId)
  if (direct) return direct
  for (const node of nodes(raw)) {
    const owner = field(node, "videoOwnerRenderer"), id = field(owner, "navigationEndpoint", "browseEndpoint", "browseId")
    if (isChannelId(id)) { const title = text(field(owner, "title")); return { channelId: id, ...(title ? { title } : {}) } }
  }
  return undefined
}
