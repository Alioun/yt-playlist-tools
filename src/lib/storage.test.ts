import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { openDB } from "idb"
import * as store from "@/lib/storage"

const first = { accountKey: "account0000000001", incognito: false, consentGeneration: "generation-1" }
const second = { accountKey: "account0000000002", incognito: false, consentGeneration: "generation-1" }
beforeEach(async () => {
  await store.sessionGeneration.setValue("generation-1")
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
})

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
  it("never persists private setup or cache writes", async () => {
    const privateContext = { ...first, incognito: true }
    const write = vi.spyOn(fakeBrowser.storage.local, "set")
    await expect(store.saveAccountSetup(privateContext, { ...store.emptySetup(), playlists: ["PLprivate"] })).rejects.toThrow(/private/)
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
  it("preserves legacy choices and shared settings when saving an account", async () => {
    await store.watchLaterShortcut.setValue("Control+Shift+S")
    await store.requiredWatchPercentage.setValue(82)
    await store.theme.setValue("dark")
    await store.playlists.setValue(["PL1"])
    await store.saveAccountSetup(first, { ...store.emptySetup(), playlists: ["PLnew"] })
    expect(await store.playlists.getValue()).toEqual(["PL1"])
    expect(await store.watchLaterShortcut.getValue()).toBe("Control+Shift+S")
    expect(await store.requiredWatchPercentage.getValue()).toBe(82)
    expect(await store.theme.getValue()).toBe("dark")
  })
})

it("removes the retired video history when clearing all data", async () => {
  const db = await openDB("yt-playlist-tools", 1, { upgrade(db) { db.createObjectStore("cachedVideos") } })
  await db.put("cachedVideos", { playlistId: "PLold", videoId: "oldvideo001", addedAt: 1 }, "old")
  db.close()
  await store.clearAll()
  expect((await indexedDB.databases()).some(database => database.name === "yt-playlist-tools")).toBe(false)
})

it("keeps the save lane closed until history deletion settles after a sibling fails", async () => {
  const remove = indexedDB.deleteDatabase.bind(indexedDB)
  let release: (() => void) | undefined
  vi.spyOn(indexedDB, "deleteDatabase").mockImplementationOnce(name => {
    const request = remove(name)
    request.addEventListener("success", event => {
      event.stopImmediatePropagation()
      release = () => request.onsuccess?.call(request, event)
    }, { once: true })
    return request
  })
  vi.spyOn(fakeBrowser.storage.sync, "clear").mockRejectedValueOnce(new Error("Synthetic deletion failure"))
  let cleared = false
  const clearing = store.clearAll().catch(error => { cleared = true; return error })
  await vi.waitFor(() => expect(release).toBeTypeOf("function"))
  await store.sessionGeneration.setValue("generation-2")
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  let saved = false
  const saving = store.saveAccountSetup({ ...first, consentGeneration: "generation-2" }, { ...store.emptySetup(), playlists: ["PLnew"] }).then(() => { saved = true })
  try {
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(cleared).toBe(false)
    expect(saved).toBe(false)
  } finally {
    release?.()
    await saving
  }
  await expect(clearing).resolves.toMatchObject({ message: "Synthetic deletion failure" })
  expect((await store.getAccountSetup(first)).playlists).toEqual(["PLnew"])
})

it("lists saved account caches only for a consenting normal window", async () => {
  await store.saveAccountSetup(first, { ...store.emptySetup(), playlists: ["PL1"] })
  await store.cacheAccountPlaylists(first, [{ id: "PL1", title: "Saved playlist" }])
  expect(await store.getSavedAccounts(false)).toEqual([{ accountKey: first.accountKey, setup: await store.getAccountSetup(first) }])
  expect(await store.getSavedAccounts(true)).toEqual([])
  await store.sessionConsent.setValue(-1)
  expect(await store.getSavedAccounts(false)).toEqual([])
})

it("refuses an old generation after revoke and regrant", async () => {
  await store.sessionGeneration.setValue("generation-2")
  await expect(store.saveAccountSetup(first, { ...store.emptySetup(), playlists: ["PLold"] })).rejects.toThrow(/revoked/)
  expect(await store.getAccountSetup(first)).toEqual(store.emptySetup())
})
