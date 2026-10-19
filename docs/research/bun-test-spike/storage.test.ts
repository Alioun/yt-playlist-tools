import { describe, expect, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"

// The real 1.x module. It does `import { storage } from "#imports"`, and
// `@/` comes from the tsconfig paths `wxt prepare` writes.
import * as store from "@/lib/storage"

describe("@/lib/storage through #imports and fakeBrowser", () => {
  test("round-trips through browser.storage.local", async () => {
    await store.playlists.setValue(["PL1", "PL2"])
    expect(await store.playlists.getValue()).toEqual(["PL1", "PL2"])
    const raw = await fakeBrowser.storage.local.get("playlists")
    expect(raw).toEqual({ playlists: ["PL1", "PL2"] })
  })

  test("starts clean: the preload resets fakeBrowser before each test", async () => {
    expect(await store.playlists.getValue()).toEqual([])
  })

  test("watchers fire on fakeBrowser's storage.onChanged", async () => {
    const seen: string[][] = []
    const unwatch = store.playlists.watch((v) => seen.push(v))
    await store.playlists.setValue(["PL9"])
    unwatch()
    expect(seen).toEqual([["PL9"]])
  })
})
