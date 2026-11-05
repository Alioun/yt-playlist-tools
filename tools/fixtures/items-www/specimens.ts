import { defineRaw } from "../../../src/page/live-read.specimens"

export const firstVideo = "synthetic01"
export const secondVideo = "synthetic02"
export const shortVideo = "synthetic03"

export function legacyData(videoId = firstVideo) {
  return { videoId, title: { simpleText: "Synthetic legacy" }, lengthSeconds: "120", navigationEndpoint: { watchEndpoint: { videoId } } }
}
export function lockupData(videoId = secondVideo) {
  return {
    contentId: videoId,
    contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
    metadata: { lockupMetadataViewModel: { title: { content: "Synthetic lockup" } } },
    rendererContext: { commandContext: { onTap: { innertubeCommand: { watchEndpoint: { videoId } } } } }
  }
}
export function shortsData(videoId = shortVideo) {
  return { onTap: { innertubeCommand: { reelWatchEndpoint: { videoId } } }, overlayMetadata: { primaryText: { content: "Synthetic Short" } } }
}
export function card(tag = "ytd-video-renderer", videoId = firstVideo, parent: Element = document.body) {
  const element = document.createElement(tag)
  const anchor = document.createElement("a")
  anchor.href = tag === "ytm-shorts-lockup-view-model" ? `/shorts/${videoId}` : `/watch?v=${videoId}`
  anchor.textContent = "Synthetic title"
  anchor.id = tag === "ytd-playlist-panel-video-renderer" ? "wc-endpoint" : "video-title"
  if (tag === "yt-lockup-view-model") anchor.className = "ytLockupMetadataViewModelTitle"
  if (tag === "ytm-shorts-lockup-view-model") anchor.className = "shortsLockupViewModelHostEndpoint"
  const button = document.createElement("button")
  button.textContent = "Synthetic action"
  element.append(anchor, button)
  parent.append(element)
  defineRaw(element, "data", tag === "yt-lockup-view-model" ? lockupData(videoId) : tag === "ytm-shorts-lockup-view-model" ? shortsData(videoId) : legacyData(videoId))
  return { element, anchor, button }
}
export function unknownCard(videoId = firstVideo, parent: Element = document.body) {
  const element = document.createElement("article")
  const anchor = document.createElement("a")
  anchor.href = `/watch?v=${videoId}`
  anchor.textContent = "Unknown markup"
  const button = document.createElement("button")
  element.append(anchor, button)
  parent.append(element)
  return { element, anchor, button }
}
export function playlist(parent: Element = document.body) {
  const element = document.createElement("yt-lockup-view-model")
  const anchor = document.createElement("a")
  anchor.href = "/playlist?list=PLsynthetic"
  anchor.textContent = "Synthetic playlist"
  element.append(anchor)
  parent.append(element)
  return { element, anchor }
}
