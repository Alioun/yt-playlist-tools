import { defineRaw } from "../../../src/page/live-read.specimens"
import { rawSong, syntheticVideo, syntheticNextVideo, syntheticChannel } from "../../../src/page/gateway.specimens"

export { syntheticVideo as firstVideo, syntheticNextVideo as secondVideo }
export const albumId = "MPREsyntheticAlbum"
export const playlistId = "PLsyntheticPlaylist"

export function row(tag = "ytmusic-responsive-list-item-renderer", videoId = syntheticVideo, options: {
  selected?: boolean; id?: number; autoplay?: boolean; parent?: Element; link?: boolean
} = {}) {
  const element = document.createElement(tag), anchor = document.createElement("a"), button = document.createElement("button")
  anchor.href = `/watch?v=${videoId}`
  anchor.textContent = "Synthetic song"
  button.textContent = "Synthetic action"
  element.append(button)
  if (options.link !== false) element.append(anchor)
  let parent = options.parent ?? document.body
  if (options.autoplay) {
    const automix = document.createElement("div")
    automix.id = "automix-contents"
    parent.append(automix)
    parent = automix
  }
  parent.append(element)
  const data = { ...rawSong(videoId, options.id ?? 7), selected: options.selected ?? false, longBylineText: { runs: [{ text: "Synthetic artist" }] } }
  defineRaw(element, "data", data)
  return { element, anchor, button, data,
    update(next: unknown) { defineRaw(element, "data", next) }
  }
}

export function collection(kind: "album" | "playlist" | "artist", tag = "ytmusic-responsive-header-renderer") {
  const id = kind === "album" ? albumId : kind === "playlist" ? `VL${playlistId}` : syntheticChannel
  const element = document.createElement(tag), anchor = document.createElement("a"), button = document.createElement("button")
  anchor.href = `/browse/${id}`
  anchor.textContent = `Synthetic ${kind}`
  element.append(anchor, button); document.body.append(element)
  const data = {
    title: { runs: [{ text: `Synthetic ${kind}` }] }, selected: false,
    navigationEndpoint: { browseEndpoint: { browseId: id,
      browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: {
        pageType: kind === "album" ? "MUSIC_PAGE_TYPE_ALBUM" : kind === "playlist" ? "MUSIC_PAGE_TYPE_PLAYLIST" : "MUSIC_PAGE_TYPE_ARTIST"
      } }
    } }
  }
  defineRaw(element, "data", data)
  return { element, anchor, button, data }
}

export function unknownItem(videoId = syntheticVideo, parent: Element = document.body) {
  const element = document.createElement("section"), anchor = document.createElement("a"), button = document.createElement("button")
  anchor.href = `/watch?v=${videoId}`
  element.append(anchor, button); parent.append(element)
  return { element, anchor, button }
}
