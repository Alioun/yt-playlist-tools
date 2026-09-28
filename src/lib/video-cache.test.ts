import { IDBFactory } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  __resetForTests,
  cacheVideo,
  clearCache,
  countCached,
  isVideoCached
} from "@/lib/video-cache"

beforeEach(() => {
  // A fresh in-memory IndexedDB per test, plus a fresh module-level handle.
  globalThis.indexedDB = new IDBFactory()
  __resetForTests()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("cacheVideo / isVideoCached", () => {
  it("reports an uncached video as absent", async () => {
    await expect(isVideoCached("PL1", "vid")).resolves.toBe(false)
  })

  it("round-trips a cached video", async () => {
    await cacheVideo("PL1", "vid")
    await expect(isVideoCached("PL1", "vid")).resolves.toBe(true)
  })

  it("scopes entries per playlist", async () => {
    // The same video may legitimately belong to several playlists; caching it
    // for one must not suppress adding it to another.
    await cacheVideo("PL1", "vid")

    await expect(isVideoCached("PL1", "vid")).resolves.toBe(true)
    await expect(isVideoCached("PL2", "vid")).resolves.toBe(false)
  })

  it("is idempotent", async () => {
    await cacheVideo("PL1", "vid")
    await cacheVideo("PL1", "vid")

    await expect(countCached()).resolves.toBe(1)
  })

  it("keeps distinct videos separate", async () => {
    await cacheVideo("PL1", "a")
    await cacheVideo("PL1", "b")
    await cacheVideo("PL2", "a")

    await expect(countCached()).resolves.toBe(3)
    await expect(isVideoCached("PL1", "a")).resolves.toBe(true)
    await expect(isVideoCached("PL2", "b")).resolves.toBe(false)
  })

  it("clears everything", async () => {
    await cacheVideo("PL1", "a")
    await cacheVideo("PL2", "b")

    await clearCache()

    await expect(countCached()).resolves.toBe(0)
    await expect(isVideoCached("PL1", "a")).resolves.toBe(false)
  })
})

describe("resilience", () => {
  it("fails open when the database cannot be opened", async () => {
    // Deliberate: a broken cache must not block adding a video. Better a
    // possible duplicate than a feature that silently stops working.
    vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
      throw new DOMException("blocked", "InvalidStateError")
    })

    await expect(isVideoCached("PL1", "vid")).resolves.toBe(false)
  })

  it("swallows write failures rather than breaking the add flow", async () => {
    vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
      throw new DOMException("blocked", "InvalidStateError")
    })

    await expect(cacheVideo("PL1", "vid")).resolves.toBeUndefined()
  })

  it("recovers after a transient open failure instead of memoising it", async () => {
    // `dbPromise ??= openDB(...)` used to cache the REJECTED promise, so a
    // single transient failure disabled the cache for the whole service
    // worker lifetime.
    const open = globalThis.indexedDB.open.bind(globalThis.indexedDB)
    const spy = vi
      .spyOn(globalThis.indexedDB, "open")
      .mockImplementationOnce(() => {
        throw new DOMException("transient", "UnknownError")
      })
      .mockImplementation(open as never)

    await expect(isVideoCached("PL1", "vid")).resolves.toBe(false)

    // Second call must reopen and actually work.
    await cacheVideo("PL1", "vid")
    await expect(isVideoCached("PL1", "vid")).resolves.toBe(true)
    expect(spy.mock.calls.length).toBeGreaterThan(1)
  })
})

describe("schema upgrades", () => {
  it("survives a version bump without throwing ConstraintError", async () => {
    // The upgrade callback runs again on an existing database when
    // DB_VERSION is raised. An unguarded createObjectStore throws
    // ConstraintError, which -- combined with the memoisation above -- used to
    // brick duplicate prevention permanently for every existing user.
    const { openDB } = await import("idb")

    // v1, exactly as the module creates it.
    const v1 = await openDB("upgrade-probe", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cachedVideos")) {
          const store = db.createObjectStore("cachedVideos", {
            keyPath: ["playlistId", "videoId"]
          })
          store.createIndex("byPlaylist", "playlistId")
        }
      }
    })
    await v1.put("cachedVideos", {
      playlistId: "PL1",
      videoId: "vid",
      addedAt: 1
    })
    v1.close()

    // Same guarded upgrade at v2 must not throw, and must keep the data.
    const v2 = await openDB("upgrade-probe", 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cachedVideos")) {
          const store = db.createObjectStore("cachedVideos", {
            keyPath: ["playlistId", "videoId"]
          })
          store.createIndex("byPlaylist", "playlistId")
        }
      }
    })

    await expect(v2.get("cachedVideos", ["PL1", "vid"])).resolves.toMatchObject({
      videoId: "vid"
    })
    v2.close()
  })
})
