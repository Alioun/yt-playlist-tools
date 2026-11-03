import { expect, test } from "bun:test"
import { cacheIsFresh, cacheRows, decodeAccountCache, emptyAccountCache, visibleAccountCache, WATCH_LATER } from "./account-cache"
import { DecodeError } from "./codec"
import { isPlaylistId } from "./validation"
const first = "PL_first",
  second = "PL_second"
if (!isPlaylistId(first) || !isPlaylistId(second)) throw Error("Invalid fixture IDs")

test("cache decoding detaches compatible unknown fields while removing nested history and identity", () => {
  const raw = {
    listAt: 10,
    playlists: [
      {
        id: first,
        title: "First",
        privacy: "PRIVATE",
        count: 2,
        thumb: "https://img.test/one.jpg",
        contains: true,
        videoIds: ["aaaaaaaaaaa"],
        occurrence: "entry",
        extension: { theme: "neutral", membership: ["video"], nested: { videoId: "aaaaaaaaaaa", keep: 1 } }
      }
    ],
    order: { www: [first], music: [second], extension: { keep: true, currentVideo: "aaaaaaaaaaa" } },
    created: [],
    labelAt: null,
    extension: { keep: [1, "future"], request: { acct: "AAAAAAAAAAAAAAAA" } },
    rawAccountIdentity: "not-kept"
  }
  const cache = decodeAccountCache(raw)
  expect<unknown>(cache).toEqual({
    listAt: 10,
    playlists: [{ id: first, title: "First", privacy: "PRIVATE", count: 2, thumb: "https://img.test/one.jpg", extension: { theme: "neutral", nested: { keep: 1 } } }],
    order: { www: [first], music: [second], extension: { keep: true } },
    created: [],
    labelAt: null,
    extension: { keep: [1, "future"] }
  })
  raw.playlists[0]!.extension.nested.keep = 9
  expect(decodeAccountCache(cache)).toEqual(cache)
  expect(cacheRows(cache, "www")).toEqual([
    { id: WATCH_LATER, title: "Watch later" },
    { id: first, title: "First", privacy: "PRIVATE", count: 2, thumb: "https://img.test/one.jpg" }
  ])
})
test("cache IDs, duplicate rows, counts and byte thumbnails are rejected at the storage boundary", () => {
  for (const row of [
    { id: "!", title: "Bad" },
    { id: first, title: "Bad", count: -1 },
    { id: first, title: "Bad", thumb: "data:image/png;base64,AA" },
    { id: first, title: "Bad", thumb: "blob:https://img.test/id" }
  ]) {
    expect(() => decodeAccountCache({ ...emptyAccountCache(), playlists: [row] })).toThrow(DecodeError)
  }
  expect(() =>
    decodeAccountCache({
      ...emptyAccountCache(),
      playlists: [
        { id: first, title: "One" },
        { id: first, title: "Two" }
      ]
    })
  ).toThrow(DecodeError)
})
test("www Watch later is fixed first, Music never invents it, and created rows merge once", () => {
  const cache = decodeAccountCache({
    listAt: 10,
    playlists: [
      { id: first, title: "First" },
      { id: "WL", title: "Watch later" }
    ],
    order: { www: [first, "WL"], music: ["WL", first] },
    created: [
      { id: first, title: "Duplicate", privacy: "PRIVATE", at: 9 },
      { id: second, title: "Created", privacy: "PRIVATE", at: 9 }
    ],
    labelAt: null
  })
  const visible = visibleAccountCache(cache, 10)
  expect(cacheRows(visible, "www")).toEqual([
    { id: WATCH_LATER, title: "Watch later" },
    { id: first, title: "First" },
    { id: second, title: "Created", privacy: "PRIVATE" }
  ])
  expect(cacheRows(visible, "music")).toEqual([
    { id: first, title: "First" },
    { id: second, title: "Created", privacy: "PRIVATE" }
  ])
  expect(cacheIsFresh({ ...cache, listAt: 1 }, 300_001)).toBe(true)
  expect(cacheIsFresh({ ...cache, listAt: 1 }, 300_002)).toBe(false)
  expect(cacheIsFresh({ ...cache, listAt: 11 }, 10)).toBe(false)
})
