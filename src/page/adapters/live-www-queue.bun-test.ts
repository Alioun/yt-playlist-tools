import { afterEach, expect, test } from "bun:test"
import { parseQueuePanel } from "../parsers/www-queue"
import { createLiveWwwQueue } from "./live-www-queue"
import { createWwwResolver } from "./www-resolver"

const restore: (() => void)[] = []
afterEach(() => {
  for (const undo of restore.splice(0)) undo()
  document.body.replaceChildren()
})

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
  expect(Reflect.get(own.dropdown, "avoidOuterEdge")).toBeUndefined()
  const stopReopen = queue.onMenu(card, { x: 88, y: 96 }, () => reports.push("reopened"))
  own.opened(true)
  expect(reports).toEqual(["opened", "reopened"])
  expect(Reflect.get(own.dropdown, "positionTarget")).toMatchObject({ style: { left: "88px", top: "96px" } })
  own.opened(false)
  stopReopen()
  stop()
})

/** Stands in for the browser's ResizeObserver, so a test can say when YouTube changed an element's size. */
function resizes() {
  const watching = new Map<Element, () => void>()
  const real = globalThis.ResizeObserver
  globalThis.ResizeObserver = class {
    constructor(private readonly changed: () => void) {}
    observe(element: Element) {
      watching.set(element, this.changed)
    }
    unobserve(element: Element) {
      watching.delete(element)
    }
    disconnect() {
      for (const [element, changed] of watching) if (changed === this.changed) watching.delete(element)
    }
  } as unknown as typeof ResizeObserver
  restore.push(() => {
    globalThis.ResizeObserver = real
  })
  return (element: Element) => watching.get(element)?.()
}

test("a menu YouTube resizes after opening is fitted again at the right-click point, with no gap to the point or to the window's edge", () => {
  const resized = resizes()
  const card = document.createElement("yt-lockup-view-model")
  const menuButton = document.createElement("button")
  card.append(menuButton)
  document.body.append(card)
  const queue = createLiveWwwQueue({ window, document, resolver: createWwwResolver(window) })
  const stop = queue.onMenu(card, { x: 640, y: 792 }, () => {})
  const own = dropdownAt(menuButton)
  const gaps = () => [Reflect.get(own.dropdown, "addSpacing"), Reflect.get(own.dropdown, "avoidOuterEdge")]
  const fits: unknown[][] = []
  Reflect.set(own.dropdown, "addSpacing", true)
  Reflect.set(own.dropdown, "avoidOuterEdge", true)
  Reflect.set(own.dropdown, "refit", () => {
    const anchor = Reflect.get(own.dropdown, "positionTarget") as HTMLElement
    fits.push([anchor.style.left, anchor.style.top, ...gaps()])
  })
  own.opened(true)
  resized(own.dropdown)
  expect(fits).toEqual([["640px", "792px", false, false]])
  own.opened(false)
  expect(gaps()).toEqual([true, true])
  resized(own.dropdown)
  expect(fits).toHaveLength(1)
  stop()
})
