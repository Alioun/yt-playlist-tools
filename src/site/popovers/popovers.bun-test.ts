import { afterEach, expect, test } from "bun:test"
import { pageGlobal } from "../global"
import { announcePopovers, loadPopovers, popoversTimeoutMs } from "./loader"
import { placePicker } from "./placement"
import type { Popovers } from "./types"

const viewport = { width: 1280, height: 800 }
const panel = { width: 320, height: 400 }
const fake: Popovers = { openPicker() {}, isOpen: () => false, close() {} }
afterEach(() => { const global = pageGlobal(); delete global.popovers; global.popoverWaiters?.clear() })

test("from ▾ the picker opens below the split button, and above it when there's no room below", () => {
  expect(placePicker({ kind: "below", box: { left: 100, top: 100, width: 40, height: 36 } }, panel, viewport)).toEqual({ left: 100, top: 144, maxHeight: 560 })
  const low = placePicker({ kind: "below", box: { left: 100, top: 700, width: 40, height: 36 } }, panel, viewport)
  expect(low.top + panel.height).toBeLessThanOrEqual(700)
})

test("from the picker key it opens beside the card, on its left when the right has no room, and never off screen", () => {
  expect(placePicker({ kind: "beside", box: { left: 100, top: 50, width: 300, height: 170 } }, panel, viewport).left).toBe(408)
  expect(placePicker({ kind: "beside", box: { left: 900, top: 50, width: 300, height: 170 } }, panel, viewport).left).toBe(572)
  const corner = placePicker({ kind: "beside", box: { left: -50, top: 780, width: 20, height: 20 } }, panel, viewport)
  expect(corner.left).toBeGreaterThanOrEqual(8)
  expect(corner.top + Math.min(panel.height, corner.maxHeight)).toBeLessThanOrEqual(viewport.height)
})

test("over the player it opens at the player's top centre, and with no anchor at the window's top centre", () => {
  expect(placePicker({ kind: "player", box: { left: 0, top: 56, width: 1280, height: 720 } }, panel, viewport)).toEqual({ left: 480, top: 64, maxHeight: 560 })
  expect(placePicker({ kind: "window" }, panel, viewport)).toEqual({ left: 480, top: 8, maxHeight: 560 })
})

test("an open waits for popovers.js to announce itself, and gives up after 5 s", async () => {
  let expire = () => {}
  let needed = 0
  const pending = loadPopovers(async () => { needed++; return true }, (ms, done) => { expect(ms).toBe(popoversTimeoutMs); expire = done; return () => {} })
  announcePopovers(fake)
  expect(await pending).toBe(fake)
  expect(needed).toBe(1)
  expect(await loadPopovers(async () => { needed++; return true }, () => () => {})).toBe(fake)
  expect(needed).toBe(1)
  delete pageGlobal().popovers
  const late = loadPopovers(async () => true, (_ms, done) => { expire = done; return () => {} })
  expire()
  expect(await late).toBeNull()
})

test("a refused injection fails at once instead of waiting out the timeout", async () => {
  expect(await loadPopovers(async () => false, () => () => {})).toBeNull()
})
