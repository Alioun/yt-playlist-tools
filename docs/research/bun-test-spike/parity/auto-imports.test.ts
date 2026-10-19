import { expect, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"

import background, { counter } from "./fixtures/auto"

test("auto-imported storage, browser and defineBackground resolve", async () => {
  background.main()
  await fakeBrowser.runtime.onInstalled.trigger({ reason: "install" })
  expect(await counter.getValue()).toBe(1)
})
