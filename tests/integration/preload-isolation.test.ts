import { expect, test } from "bun:test"
import { browser } from "wxt/browser"

test("each isolated test file gets a clean DOM and fake browser", async () => {
  expect(document.body.children).toHaveLength(0)
  expect(document.head.querySelector("style")).toBeNull()
  expect(await browser.storage.local.get()).toEqual({})
})
