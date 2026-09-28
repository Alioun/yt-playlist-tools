import { openDB, type DBSchema, type IDBPDatabase } from "idb"

/**
 * Records which videos have already been added to which playlist, so
 * "prevent duplicates" can suppress a repeat add.
 *
 * Previously this was a single JSON blob in localStorage. That had two
 * problems: localStorage does not exist in a Chrome MV3 service worker (it
 * threw outright), and the whole blob was re-serialised on every single add.
 *
 * IndexedDB is available in both a Chrome MV3 service worker and a Firefox
 * event page. With a compound [playlistId, videoId] key an add is one small
 * put and a lookup is one get -- no whole-set serialisation, ever.
 */

const DB_NAME = "yt-playlist-tools"
const DB_VERSION = 1
const STORE = "cachedVideos"

interface CacheEntry {
  playlistId: string
  videoId: string
  addedAt: number
}

interface CacheDB extends DBSchema {
  [STORE]: {
    key: [string, string]
    value: CacheEntry
    indexes: { byPlaylist: string }
  }
}

let dbPromise: Promise<IDBPDatabase<CacheDB>> | null = null

function getDB(): Promise<IDBPDatabase<CacheDB>> {
  if (dbPromise) return dbPromise

  dbPromise = openDB<CacheDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Must be idempotent across versions: on a DB_VERSION bump this runs
      // again against an existing database, and an unguarded
      // createObjectStore would throw ConstraintError -- which, combined with
      // the memoisation below, would silently disable the cache forever.
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: ["playlistId", "videoId"]
        })
        store.createIndex("byPlaylist", "playlistId")
      }
    },
    terminated() {
      // The connection died (browser reclaimed it, or a versionchange from
      // another extension context). Drop the handle so the next call reopens.
      dbPromise = null
    }
  })

  // Never memoise a rejection: one transient failure (quota, private-browsing
  // IDB block, blocked upgrade) would otherwise disable the cache for the rest
  // of the service worker's life.
  dbPromise.catch(() => {
    dbPromise = null
  })

  return dbPromise
}

/** Test seam: forget the cached connection. */
export function __resetForTests(): void {
  dbPromise = null
}

export async function isVideoCached(
  playlistId: string,
  videoId: string
): Promise<boolean> {
  try {
    const db = await getDB()
    return (await db.get(STORE, [playlistId, videoId])) !== undefined
  } catch (error) {
    // Never let a cache failure block adding a video.
    console.error("[YT Playlist Tools]: cache lookup failed", error)
    return false
  }
}

export async function cacheVideo(
  playlistId: string,
  videoId: string
): Promise<void> {
  try {
    const db = await getDB()
    await db.put(STORE, { playlistId, videoId, addedAt: Date.now() })
  } catch (error) {
    console.error("[YT Playlist Tools]: cache write failed", error)
  }
}

export async function clearCache(): Promise<void> {
  const db = await getDB()
  await db.clear(STORE)
}

export async function countCached(): Promise<number> {
  const db = await getDB()
  return db.count(STORE)
}
