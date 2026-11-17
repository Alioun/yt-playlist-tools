import { afterEach, expect, test } from "bun:test"
import { createLiveWwwQueue } from "./live-www-queue"
import { createWwwResolver } from "./www-resolver"

afterEach(() => document.body.replaceChildren())

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
  stop()
})
