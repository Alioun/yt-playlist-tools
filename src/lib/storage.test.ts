import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import * as store from "@/lib/storage"

/**
 * These keys are a backwards-compatibility contract, not an implementation
 * detail. Every pre-WXT release wrote plain `browser.storage.local` keys, and
 * WXT maps "local:playlists" onto exactly the key "playlists". Renaming one
 * silently orphans that setting for every existing AMO user -- they would open
 * the popup after an update and find their playlists unselected, with no error.
 */

beforeEach(() => {
  fakeBrowser.reset()
})

describe("storage keys match what pre-WXT versions wrote", () => {
  const cases: Array<[string, { setValue: (v: never) => Promise<void> }, unknown]> = [
    ["playlists", store.playlists as never, ["PL1"]],
    ["addToPlaylistID", store.addToPlaylistID as never, "PL2"],
    ["watchLaterShortcut", store.watchLaterShortcut as never, "Control+S"],
    ["toastEnabled", store.toastEnabled as never, false],
    ["preventDuplicates", store.preventDuplicates as never, false],
    ["requiredWatchPercentage", store.requiredWatchPercentage as never, 75],
    ["accessToken", store.accessToken as never, "at"],
    ["refreshToken", store.refreshToken as never, "rt"],
    ["clientID", store.clientID as never, "cid"],
    ["clientSecret", store.clientSecret as never, "sec"]
  ]

  it.each(cases)("writes local storage key %s", async (key, item, value) => {
    await item.setValue(value as never)

    const raw = await fakeBrowser.storage.local.get(key)
    expect(raw).toHaveProperty(key)
    expect(raw[key]).toEqual(value)
  })

  it("reads a value written by an older version under the bare key", async () => {
    // The upgrade path: data already on disk from a pre-WXT install.
    await fakeBrowser.storage.local.set({ playlists: ["PL-legacy"] })

    await expect(store.playlists.getValue()).resolves.toEqual(["PL-legacy"])
  })

  it("keeps theme in sync storage, not local", async () => {
    // Deliberate: the theme should follow the user across profiles, and it is
    // the one value the content script also needs.
    await store.theme.setValue("dark")

    expect(await fakeBrowser.storage.sync.get("theme")).toEqual({ theme: "dark" })
    expect(await fakeBrowser.storage.local.get("theme")).toEqual({})
  })
})

describe("defaults", () => {
  it("returns sensible fallbacks on a fresh install", async () => {
    await expect(store.playlists.getValue()).resolves.toEqual([])
    await expect(store.addToPlaylistID.getValue()).resolves.toBe("")
    await expect(store.watchLaterShortcut.getValue()).resolves.toBe("")
    await expect(store.requiredWatchPercentage.getValue()).resolves.toBe(50)
    await expect(store.theme.getValue()).resolves.toBe("system")
  })

  it("defaults the two toggles to on", async () => {
    // Both are opt-out features; defaulting them off would quietly change
    // behaviour for existing users on upgrade.
    await expect(store.toastEnabled.getValue()).resolves.toBe(true)
    await expect(store.preventDuplicates.getValue()).resolves.toBe(true)
  })

  it("defaults authMode to server", async () => {
    await expect(store.authMode.getValue()).resolves.toBe("server")
  })
})

describe("clearAll", () => {
  it("empties both storage areas", async () => {
    await store.accessToken.setValue("at")
    await store.playlists.setValue(["PL1"])
    await store.theme.setValue("dark")

    await store.clearAll()

    await expect(store.accessToken.getValue()).resolves.toBe("")
    await expect(store.playlists.getValue()).resolves.toEqual([])
    // Theme lives in sync storage, so this proves both areas were cleared.
    await expect(store.theme.getValue()).resolves.toBe("system")
  })

  it("empties the session channel cache and the channel filters too", async () => {
    await store.channelCache.setValue({ vid: { channelId: "UC1", title: "One" } })
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UC1"] }
    })
    await store.channelLabels.setValue({ UC1: { title: "One" } })

    await store.clearAll()

    await expect(store.channelCache.getValue()).resolves.toEqual({})
    await expect(store.channelFilters.getValue()).resolves.toEqual({})
    await expect(store.channelLabels.getValue()).resolves.toEqual({})
  })

  it("keeps the channel cache in session storage", async () => {
    await store.channelCache.setValue({ vid: { channelId: "UC1", title: "One" } })

    expect(await fakeBrowser.storage.session.get("channelCache")).toHaveProperty(
      "channelCache"
    )
    expect(await fakeBrowser.storage.local.get("channelCache")).toEqual({})
  })
})
