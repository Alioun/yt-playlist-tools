import { afterEach, expect, test } from "bun:test"
import { parseQueuePanel } from "../parsers/www-queue"
import { createLiveWwwQueue } from "./live-www-queue"
import { createWwwResolver } from "./www-resolver"

afterEach(() => document.body.replaceChildren())

test("the queue is read from YouTube's playlist manager where no panel holds it, as on a search page", () => {
  const queued = { playlistId: "TLPQsynthetic", contents: [{ playlistPanelVideoRenderer: { videoId: "queueVideoA", playlistSetVideoId: "entry-1" } }] }
  const manager = document.createElement("yt-playlist-manager")
  let held: unknown
  Reflect.set(manager, "getPlaylistData", () => held)
  document.body.append(manager)
  const queue = createLiveWwwQueue({ window, document, resolver: createWwwResolver(window) })
  expect(parseQueuePanel(queue.panel())).toBeUndefined()
  held = queued
  expect(parseQueuePanel(queue.panel())).toEqual<unknown>({ listId: "TLPQsynthetic", entries: [{ videoId: "queueVideoA", setVideoId: "entry-1" }] })
  const panel = document.createElement("ytd-playlist-panel-renderer")
  Reflect.set(panel, "data", {})
  document.body.append(panel)
  expect(parseQueuePanel(queue.panel())).toEqual<unknown>({ listId: "TLPQsynthetic", entries: [{ videoId: "queueVideoA", setVideoId: "entry-1" }] })
  manager.remove()
  expect(parseQueuePanel(queue.panel())).toBeUndefined()
})

test("the miniplayer reads as active once YouTube marks the app, as it does after a first queue add", () => {
  const app = document.createElement("ytd-app")
  app.append(document.createElement("ytd-miniplayer"))
  document.body.append(app)
  const queue = createLiveWwwQueue({ window, document, resolver: createWwwResolver(window) })
  expect(queue.miniplayer()).toBe(false)
  app.setAttribute("miniplayer-is-active", "")
  expect(queue.miniplayer()).toBe(true)
})

function dropdownAt(anchor: Element) {
  const dropdown = document.createElement("tp-yt-iron-dropdown")
  Reflect.set(dropdown, "positionTarget", anchor)
  document.body.append(dropdown)
  const opened = (value: boolean) => dropdown.dispatchEvent(new CustomEvent("opened-changed", { detail: { value } }))
  return { dropdown, opened }
}

test("the card's own menu opens at the right-click point and leaves no anchor behind once closed", () => {
  const card = document.createElement("ytd-video-renderer")
  const menuButton = document.createElement("button")
  card.append(menuButton)
  document.body.append(card)
  const queue = createLiveWwwQueue({ window, document, resolver: createWwwResolver(window) })
  const reports: string[] = []
  const stop = queue.onMenu(card, { x: 212, y: 148 }, () => reports.push("opened"))
  const other = dropdownAt(document.createElement("button"))
  other.opened(true)
  expect(reports).toEqual([])
  const own = dropdownAt(menuButton)
  own.opened(true)
  expect(reports).toEqual(["opened"])
  const anchor = Reflect.get(own.dropdown, "positionTarget") as HTMLElement
  expect(anchor).not.toBe(menuButton)
  expect([anchor.style.position, anchor.style.left, anchor.style.top]).toEqual(["fixed", "212px", "148px"])
  own.opened(false)
  expect(anchor.isConnected).toBe(false)
  expect(Reflect.get(own.dropdown, "positionTarget")).toBe(menuButton)
  const stopReopen = queue.onMenu(card, { x: 88, y: 96 }, () => reports.push("reopened"))
  own.opened(true)
  expect(reports).toEqual(["opened", "reopened"])
  expect(Reflect.get(own.dropdown, "positionTarget")).toMatchObject({ style: { left: "88px", top: "96px" } })
  own.opened(false)
  stopReopen()
  stop()
})
