// Runs under the full spike config, and also under the minimal one, which
// preloads only setup/fake-browser.ts:
//   bun test --config=bunfig.minimal.toml ./explicit-imports.test.ts
import { describe, expect, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { activeWatchUrl, shortcutPlaylist } from "./fixtures/explicit"

describe("a module with explicit WXT imports", () => {
  test("storage items go through fakeBrowser's storage.sync", async () => {
    await shortcutPlaylist.setValue("PL1")
    // Read into a variable first: inline in expect(), bun:test's typed
    // toEqual(expected: T) makes tsc pick the wrong storage.get overload.
    const raw = await fakeBrowser.storage.sync.get("shortcutPlaylist")
    expect(raw).toEqual({ shortcutPlaylist: "PL1" })
  })

  test("tabs.query is served by fakeBrowser's in-memory tabs", async () => {
    // After reset() no window is focused, so tabs.query({ currentWindow: true })
    // throws inside the fake, and windows.update() does not set focus. Only
    // windows.create({ focused: true }) does.
    await fakeBrowser.windows.create({ focused: true })
    await fakeBrowser.tabs.create({ url: "https://www.youtube.com/watch?v=abc", active: true })
    expect(await activeWatchUrl()).toBe("https://www.youtube.com/watch?v=abc")
  })
})
