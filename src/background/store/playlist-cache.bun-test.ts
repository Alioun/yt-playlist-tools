import { expect, test } from "bun:test"
import { PlaylistCacheCapture } from "./playlist-cache"
import { pendingAccountRemovalKey } from "./account-removal-execution"
import { decodeAccountCache, cacheRows, WATCH_LATER, CREATED_PLAYLIST_MS, type AccountKey } from "../../shared/model"
import { a, b, alpha, beta, created, epoch, oldCache, seed, world, origin, video, type CacheFault } from "../../../tools/fixtures/playlists-cache/harness"

async function capture(h: ReturnType<typeof world>, acct: AccountKey = a) {
  const read = await h.owner.readPlaylistCache({ acct, private: false })
  if (read.kind !== "cache" || read.authority.kind !== "eligible") throw Error("Expected eligible owner capture")
  return read.authority.capture
}
const membershipCache = {
  listAt: epoch,
  playlists: [
    { id: beta, title: "Beta updated", privacy: "PUBLIC", count: 8 },
    { id: created, title: "New member" }
  ],
  order: { www: [beta, created], music: [alpha, beta] },
  created: [],
  labelAt: 42
}
test("membership stores only addable playlist facts and preserves complete unrelated storage", async () => {
  const initial = seed(),
    h = world(initial)
  try {
    const rows = [
      {
        id: beta,
        title: "Beta updated",
        privacy: "PUBLIC" as const,
        count: 999,
        contains: true,
        videoId: video,
        setVideoIds: ["secret-occurrence"],
        occurrences: [{ videoId: video }],
        request: { acct: a }
      },
      { id: created, title: "New member", contains: false, count: 123 }
    ]
    const result = await h.owner.absorbPlaylistCache(await capture(h), { kind: "membership", acct: a, site: "www", at: epoch, rows })
    expect<unknown>(result).toEqual({ kind: "committed", cache: membershipCache })
    expect<unknown>(h.stored()).toEqual({ ...initial.local, [`cache:${a}`]: membershipCache })
    expect(h.removal.state().sync).toEqual(initial.sync)
    expect(h.removal.state().session).toEqual(initial.session)
    expect(h.removal.io.filter(io => io.kind === "sync.get" || io.kind === "sync.set")).toEqual([])
    expect(h.removal.counts()).toEqual({ generations: 0, stamps: 0, subscriptions: 0 })
  } finally {
    await h.dispose()
  }
})
test("list replaces count and thumb metadata while each membership owns only its site's order", async () => {
  const h = world()
  try {
    await h.owner.absorbPlaylistCache(await capture(h), {
      kind: "list",
      acct: a,
      site: "music",
      at: epoch,
      rows: [
        { id: beta, title: "Beta list", thumb: "https://img.test/beta.jpg" },
        { id: alpha, title: "Alpha list", count: 6 }
      ]
    })
    expect(h.stored()[`cache:${a}`]).toEqual({
      listAt: epoch,
      playlists: [
        { id: beta, title: "Beta list", thumb: "https://img.test/beta.jpg" },
        { id: alpha, title: "Alpha list", count: 6 }
      ],
      order: { www: [beta, alpha], music: [alpha, beta] },
      created: [],
      labelAt: 42
    })
    await h.owner.absorbPlaylistCache(await capture(h), {
      kind: "membership",
      acct: a,
      site: "music",
      at: epoch + 1,
      rows: [
        { id: beta, title: "Beta music", contains: false },
        { id: alpha, title: "Alpha music", contains: true, count: 900 }
      ]
    })
    expect(h.stored()[`cache:${a}`]).toEqual({
      listAt: epoch + 1,
      playlists: [
        { id: beta, title: "Beta music", thumb: "https://img.test/beta.jpg" },
        { id: alpha, title: "Alpha music", count: 6 }
      ],
      order: { www: [beta, alpha], music: [beta, alpha] },
      created: [],
      labelAt: 42
    })
    const cache = decodeAccountCache(h.stored()[`cache:${a}`])
    expect(cacheRows(cache, "www").map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
    expect(cacheRows(cache, "music").map(row => row.id)).toEqual([beta, alpha])
  } finally {
    await h.dispose()
  }
})
test("unchanged facts do not write a freshness stamp and captures cannot be reused", async () => {
  const h = world()
  try {
    const saved = await capture(h)
    const input = {
      kind: "list",
      acct: a,
      site: "www",
      at: epoch,
      rows: [
        { id: alpha, title: "Alpha", privacy: "PRIVATE", count: 4, thumb: "https://img.test/alpha.jpg" },
        { id: beta, title: "Beta", privacy: "UNLISTED", count: 8 }
      ]
    } as const
    expect<unknown>(await h.owner.absorbPlaylistCache(saved, input)).toEqual({ kind: "unchanged", cache: oldCache })
    expect(await h.owner.absorbPlaylistCache(saved, input)).toEqual({ kind: "refused", reason: "capture" })
    expect(h.cacheWrites).toBe(0)
    expect(h.stored()[`cache:${a}`]).toEqual(oldCache)
    expect(await h.owner.absorbPlaylistCache(new PlaylistCacheCapture(a), input)).toEqual({ kind: "refused", reason: "capture" })
  } finally {
    await h.dispose()
  }
})
test("private, absent and empty Setup reads mint no cache authority or local writes", async () => {
  const h = world()
  try {
    const privateRead = await h.owner.readPlaylistCache({ acct: a, private: true })
    expect<unknown>(privateRead).toEqual({ kind: "cache", cache: oldCache, authority: { kind: "caller-owned", reason: "private" } })
    h.removal.foreign(state => {
      delete state.local[`doc:setup:${a}`]
    })
    expect(await h.owner.readPlaylistCache({ acct: a, private: false })).toEqual({ kind: "cache", cache: null, authority: { kind: "caller-owned", reason: "no-setup" } })
    h.removal.foreign(state => {
      state.local[`doc:setup:${a}`] = { v: 1, gen: "empty", at: 2, by: "fixture", data: { label: { name: "Label only" } } }
      for (const key of Object.keys(state.local)) if (key.startsWith(`doc:filter:${a}:`)) delete state.local[key]
    })
    expect(await h.owner.readPlaylistCache({ acct: a, private: false })).toEqual({ kind: "cache", cache: null, authority: { kind: "caller-owned", reason: "no-setup" } })
    expect(h.cacheWrites).toBe(0)
    expect(h.removal.mutations).toEqual([])
    expect(h.removal.counts()).toEqual({ generations: 0, stamps: 0, subscriptions: 0 })
  } finally {
    await h.dispose()
  }
})
test("newer unrelated synced documents and an intervening unrelated edit do not block local cache facts", async () => {
  const initial = seed()
  initial.local["doc:settings"] = { v: 99, gen: "future", at: 3, by: "future", data: {} }
  initial.local[`doc:setup:${b}`] = { v: 99, gen: "future-other", at: 3, by: "future", data: {} }
  const h = world(initial)
  try {
    const saved = await capture(h)
    h.removal.foreign(state => {
      state.local.unrelated = { changed: "queued edit" }
    })
    expect((await h.owner.absorbPlaylistCache(saved, { kind: "list", acct: a, site: "www", at: epoch, rows: [{ id: alpha, title: "New title" }] })).kind).toBe("committed")
    expect(h.stored()).toEqual({
      ...initial.local,
      unrelated: { changed: "queued edit" },
      [`cache:${a}`]: {
        listAt: epoch,
        playlists: [{ id: alpha, title: "New title" }],
        order: { www: [beta, alpha], music: [alpha, beta] },
        created: [],
        labelAt: 42
      }
    })
  } finally {
    await h.dispose()
  }
})
test("confirmed creation rows expire on read without a timer or storage write and disappear when listed", async () => {
  const h = world()
  try {
    await h.owner.absorbPlaylistCache(await capture(h), { kind: "created", acct: a, site: "www", at: epoch, row: { id: created, title: "Created", privacy: "PRIVATE" } })
    expect(h.stored()[`cache:${a}`]).toEqual({ ...oldCache, created: [{ id: created, title: "Created", privacy: "PRIVATE", at: epoch }] })
    h.clock.advance(CREATED_PLAYLIST_MS - 1)
    const before = await h.owner.readPlaylistCache({ acct: a, private: true })
    if (before.kind !== "cache") throw Error("Expected read")
    expect(before.cache?.created).toEqual([{ id: created, title: "Created", privacy: "PRIVATE", at: epoch }])
    h.clock.advance(1)
    const expired = await h.owner.readPlaylistCache({ acct: a, private: true })
    if (expired.kind !== "cache") throw Error("Expected read")
    expect(expired.cache?.created).toEqual([])
    expect(h.cacheWrites).toBe(1)
    await h.owner.absorbPlaylistCache(await capture(h), { kind: "created", acct: a, site: "www", at: epoch + CREATED_PLAYLIST_MS, row: { id: created, title: "Created again", privacy: "PUBLIC" } })
    await h.owner.absorbPlaylistCache(await capture(h), { kind: "list", acct: a, site: "www", at: epoch + CREATED_PLAYLIST_MS, rows: [{ id: created, title: "Observed", privacy: "PUBLIC" }] })
    expect(h.stored()[`cache:${a}`]).toEqual({
      listAt: epoch + CREATED_PLAYLIST_MS,
      playlists: [{ id: created, title: "Observed", privacy: "PUBLIC" }],
      order: { www: [beta, alpha], music: [alpha, beta] },
      created: [],
      labelAt: 42
    })
  } finally {
    await h.dispose()
  }
})
for (const [fault, expected] of [
  ["rejected-unchanged", { kind: "failed", stage: "set" }],
  ["rejected-applied", { kind: "unconfirmed", write: "rejected", cause: "readback" }],
  ["resolved-unchanged", { kind: "unconfirmed", write: "resolved", cause: "readback" }],
  ["mismatched", { kind: "unconfirmed", write: "resolved", cause: "readback" }],
  ["unreadable", { kind: "unconfirmed", write: "resolved", cause: "stopped" }]
] satisfies readonly [CacheFault, unknown][])
  test(`cache readback is truthful for ${fault}`, async () => {
    const initial = seed(),
      h = world(initial)
    try {
      h.fault(fault)
      const result = await h.owner.absorbPlaylistCache(await capture(h), { kind: "list", acct: a, site: "www", at: epoch, rows: [{ id: alpha, title: "Changed" }] })
      expect<unknown>(result).toEqual(expected)
      expect(h.cacheWrites).toBe(1)
      const stored =
        fault === "rejected-unchanged" || fault === "resolved-unchanged"
          ? oldCache
          : {
              listAt: epoch,
              playlists: [{ id: alpha, title: "Changed" }],
              order: { www: [beta, alpha], music: [alpha, beta] },
              created: [],
              labelAt: fault === "mismatched" ? 999 : 42
            }
      expect<unknown>(h.stored()).toEqual({ ...initial.local, [`cache:${a}`]: stored })
      if (fault === "rejected-unchanged") expect(h.stored()[`cache:${a}`]).toEqual(oldCache)
      else expect(await h.owner.readPlaylistCache({ acct: a, private: false })).toEqual({ kind: "unavailable", reason: "stale" })
    } finally {
      await h.dispose()
    }
  })
test("removal revokes a pending capture even when the same account is recreated", async () => {
  const initial = seed(),
    h = world(initial)
  try {
    const saved = await capture(h)
    const removal = await h.owner.prepareAccountRemoval(origin, a)
    if (removal.kind !== "confirmation-required") throw Error("Expected actual removal confirmation")
    expect(await h.owner.removeAccountSetup(origin, removal.confirmation)).toEqual({ kind: "committed" })
    h.removal.foreign(state => {
      state.local[`doc:setup:${a}`] = structuredClone(initial.local[`doc:setup:${a}`]!)
    })
    expect(await h.owner.absorbPlaylistCache(saved, { kind: "list", acct: a, site: "www", at: epoch, rows: [{ id: alpha, title: "Old answer" }] })).toEqual({ kind: "refused", reason: "revoked" })
    expect(h.stored()[`cache:${a}`]).toBeUndefined()
    expect((await h.owner.absorbPlaylistCache(await capture(h), { kind: "list", acct: a, site: "www", at: epoch, rows: [{ id: alpha, title: "New authority" }] })).kind).toBe("committed")
  } finally {
    await h.dispose()
  }
})
test("withdrawal observed through the real owner revokes a capture after re-agreement with identical consent bytes", async () => {
  const initial = seed(),
    h = world(initial)
  try {
    const saved = await capture(h)
    h.removal.foreign(state => {
      state.local.device = { id: "fixture", consent: null, syncOn: false }
    })
    expect(await h.owner.readPlaylistCache({ acct: a, private: false })).toEqual({ kind: "unavailable", reason: "consent-held" })
    h.removal.foreign(state => {
      state.local.device = structuredClone(initial.local.device!)
    })
    expect(await h.owner.absorbPlaylistCache(saved, { kind: "list", acct: a, site: "www", at: epoch, rows: [{ id: alpha, title: "Revoked" }] })).toEqual({ kind: "refused", reason: "revoked" })
    expect(h.cacheWrites).toBe(0)
  } finally {
    await h.dispose()
  }
})
test("reading pending-removal evidence never resumes or writes it", async () => {
  const h = world()
  try {
    h.removal.foreign(state => {
      state.local[pendingAccountRemovalKey] = { pending: true }
    })
    expect(await h.owner.readPlaylistCache({ acct: a, private: false })).toEqual({ kind: "unavailable", reason: "pending-removal" })
    expect(h.removal.mutations).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("cache snapshots detach and a wrong account cannot use a valid capture", async () => {
  const h = world()
  try {
    const first = await h.owner.readPlaylistCache({ acct: a, private: false })
    if (first.kind !== "cache" || !first.cache || first.authority.kind !== "eligible") throw Error("Expected cache")
    Object.defineProperty(first.cache.playlists[0], "title", { value: "Caller mutation" })
    const next = await h.owner.readPlaylistCache({ acct: a, private: true })
    if (next.kind !== "cache") throw Error("Expected detached read")
    expect<unknown>(next.cache).toEqual(oldCache)
    expect(await h.owner.absorbPlaylistCache(first.authority.capture, { kind: "list", acct: b, site: "www", at: epoch, rows: [] })).toEqual({ kind: "refused", reason: "capture" })
    expect(h.cacheWrites).toBe(0)
  } finally {
    await h.dispose()
  }
})
test("an actual queued Settings edit survives a cache absorption captured before it", async () => {
  const h = world()
  try {
    const saved = await capture(h)
    expect((await h.owner.changeSharedSetting(origin, { kind: "theme", value: "dark" })).kind).toBe("committed")
    const afterSetting = h.stored()["doc:settings"]
    expect((await h.owner.absorbPlaylistCache(saved, { kind: "list", acct: a, site: "www", at: epoch, rows: [{ id: alpha, title: "After queued setting" }] })).kind).toBe("committed")
    expect(h.stored()["doc:settings"]).toEqual(afterSetting)
    expect(h.stored()[`cache:${a}`]).toEqual({
      listAt: epoch,
      playlists: [{ id: alpha, title: "After queued setting" }],
      order: { www: [beta, alpha], music: [alpha, beta] },
      created: [],
      labelAt: 42
    })
  } finally {
    await h.dispose()
  }
})
test("emptying through the actual Setup operation revokes old capture authority after a new Setup is saved", async () => {
  const initial = seed()
  initial.local[`doc:setup:${a}`] = { v: 1, gen: "one-choice", at: 1, by: "fixture", data: { quickSave: alpha } }
  for (const key of Object.keys(initial.local)) if (key.startsWith(`doc:filter:${a}:`)) delete initial.local[key]
  const h = world(initial)
  try {
    const saved = await capture(h)
    expect((await h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "quick-save" }, expected: { setup: "live", playlist: alpha }, playlist: null })).kind).toBe("committed")
    expect(h.stored()[`cache:${a}`]).toBeUndefined()
    expect((await h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "quick-save" }, expected: { setup: "none" }, playlist: alpha })).kind).toBe("committed")
    expect(await h.owner.absorbPlaylistCache(saved, { kind: "list", acct: a, site: "www", at: epoch, rows: [{ id: alpha, title: "Old" }] })).toEqual({ kind: "refused", reason: "revoked" })
    expect(h.stored()[`cache:${a}`]).toBeUndefined()
  } finally {
    await h.dispose()
  }
})
