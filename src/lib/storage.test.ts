import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import * as store from "@/lib/storage"

const first = { accountKey: "account0000000001", incognito: false }
const second = { accountKey: "account0000000002", incognito: false }
beforeEach(async () => { await store.sessionConsent.setValue(store.CONSENT_VERSION) })

describe("account setups", () => {
  it("separates each account's selections, shortcut and filters", async () => {
    const setup = { ...store.emptySetup(), playlists: ["PL1"], shortcutPlaylistId: "WL",
      filters: { PL1: { enabled: true, mode: "deny", channels: ["UC1"] } } } satisfies store.AccountSetup
    await store.saveAccountSetup(first, setup)
    expect(await store.getAccountSetup(first)).toEqual(setup)
    expect(await store.getAccountSetup(second)).toEqual(store.emptySetup())
  })
  it("does not assign old choices to an account on first read", async () => {
    await store.playlists.setValue(["PLold"])
    expect(await store.hasUnclaimedSetup()).toBe(true)
    expect(await store.getAccountSetup(first)).toEqual(store.emptySetup())
  })
  it("claims only verified IDs, preserves existing choices and keeps unmatched choices unclaimed", async () => {
    await store.playlists.setValue(["PL1", "PLother"])
    await store.addToPlaylistID.setValue("PLother")
    await store.channelFilters.setValue({ PL1: { mode: "deny", enabled: true, channels: ["UC1"] }, PLother: { mode: "allow", enabled: true, channels: [] } })
    await store.saveAccountSetup(first, { ...store.emptySetup(), playlists: ["PLexisting"], shortcutPlaylistId: "WL" })
    const claimed = await store.claimLegacySetup(first, [{ id: "PL1", title: "Verified" }])
    expect(claimed.playlists).toEqual(["PLexisting", "PL1"])
    expect(claimed.shortcutPlaylistId).toBe("WL")
    expect(Object.keys(claimed.filters)).toEqual(["PL1"])
    expect(await store.playlists.getValue()).toEqual(["PLother"])
    expect(await store.hasUnclaimedSetup()).toBe(true)
    expect((await store.claimLegacySetup(second, [{ id: "PLother", title: "Other" }])).playlists).toEqual(["PLother"])
    expect(await store.hasUnclaimedSetup()).toBe(false)
  })
  it("never persists private setup or cache writes", async () => {
    const privateContext = { ...first, incognito: true }
    const write = vi.spyOn(fakeBrowser.storage.local, "set")
    await expect(store.saveAccountSetup(privateContext, { ...store.emptySetup(), playlists: ["PLprivate"] })).rejects.toThrow(/private/)
    await expect(store.claimLegacySetup(privateContext, [])).rejects.toThrow(/normal window/)
    await store.cacheAccountPlaylists(privateContext, [{ id: "PLprivate", title: "Private" }])
    expect(write).not.toHaveBeenCalled()
  })
  it("does not create a saved account merely because playlists were read", async () => {
    await store.cacheAccountPlaylists(first, [{ id: "PL1", title: "One" }])
    expect(await fakeBrowser.storage.local.get(`account:${first.accountKey}`)).toEqual({})
  })
  it("stamps caches only for an account with choices", async () => {
    await store.saveAccountSetup(first, { ...store.emptySetup(), playlists: ["PL1"] })
    await store.cacheAccountPlaylists(first, [{ id: "PL1", title: "One" }])
    expect((await store.getAccountSetup(first)).cachedAt).toBeTypeOf("number")
    expect((await store.getAccountSetup(second)).cachedPlaylists).toEqual([])
  })
  it("removes legacy credential keys by name without reading values", async () => {
    const read = vi.spyOn(fakeBrowser.storage.local, "get")
    const remove = vi.spyOn(fakeBrowser.storage.local, "remove")
    await store.removeLegacyCredentials()
    expect(read).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(["accessToken", "refreshToken", "clientID", "clientSecret", "authMode", "authServerURL"])
  })
  it("preserves shared choices and theme through claiming", async () => {
    await store.watchLaterShortcut.setValue("Control+Shift+S")
    await store.requiredWatchPercentage.setValue(82)
    await store.theme.setValue("dark")
    await store.playlists.setValue(["PL1"])
    await store.claimLegacySetup(first, [{ id: "PL1", title: "One" }])
    expect(await store.watchLaterShortcut.getValue()).toBe("Control+Shift+S")
    expect(await store.requiredWatchPercentage.getValue()).toBe(82)
    expect(await store.theme.getValue()).toBe("dark")
  })
})
