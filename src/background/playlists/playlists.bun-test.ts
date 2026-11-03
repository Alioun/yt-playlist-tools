import { expect, test } from "bun:test"
import type { AccountKey } from "../../shared/model"
import type { ListOpen, PlaylistRequest } from "./playlists"
import {
  a,
  b,
  alpha,
  beta,
  created,
  video,
  epoch,
  oldCache,
  world,
  seed,
  nativeTab,
  signedIn,
  normalRequest,
  privateRequest,
  origin,
  deferred,
  success
} from "../../../tools/fixtures/playlists-cache/harness"

async function open(h: ReturnType<typeof world>, acct: AccountKey = a, options: PlaylistRequest & { refresh?: boolean } = normalRequest) {
  const answer = await h.playlists.list(acct, options)
  if (answer.kind !== "open") throw Error("Expected list open")
  return answer
}
async function refreshed(answer: Extract<ListOpen, { kind: "open" }>) {
  if (!answer.refresh) throw Error("Expected a refresh")
  return answer.refresh
}
const cachedRows = [
  { id: "WL", title: "Watch later" },
  { id: beta, title: "Beta", privacy: "UNLISTED", count: 8 },
  { id: alpha, title: "Alpha", privacy: "PRIVATE", count: 4, thumb: "https://img.test/alpha.jpg" }
]

test("cached rows are available before a pending answer and two opens coalesce one normal refresh", async () => {
  const h = world(),
    entered = deferred<void>(),
    pending = deferred<unknown>()
  try {
    h.seedTab()
    h.script(async () => {
      entered.resolve()
      return pending.promise
    })
    const first = await open(h)
    expect<unknown>(first.cached).toEqual({ rows: cachedRows, at: epoch - 300_001 })
    await entered.promise
    const second = await open(h, a, { ...normalRequest, refresh: true })
    expect<unknown>(second.cached).toEqual({ rows: cachedRows, at: epoch - 300_001 })
    expect(h.runs("playlists")).toHaveLength(1)
    expect(h.cacheWrites).toBe(0)
    pending.resolve(success([{ id: alpha, title: "Refreshed", count: 2 }]))
    const [one, two] = await Promise.all([refreshed(first), refreshed(second)])
    expect(h.runs("playlists")).toHaveLength(1)
    expect(one).toEqual(two)
    if (one.kind !== "listed") throw Error("Expected fresh list")
    expect<unknown>(one.listing).toEqual({
      rows: [
        { id: "WL", title: "Watch later" },
        { id: alpha, title: "Refreshed", count: 2 }
      ],
      at: epoch
    })
    expect(one.present).toEqual({ kind: "list-present", acct: a, site: "www", private: false, at: epoch, ids: [alpha] })
    expect(h.cacheWrites).toBe(1)
    expect(h.stored()[`cache:${a}`]).toEqual({ listAt: epoch, playlists: [{ id: alpha, title: "Refreshed", count: 2 }], order: { www: [beta, alpha], music: [alpha, beta] }, created: [], labelAt: 42 })
    const firstRow = one.listing.rows[0]
    expect(firstRow).not.toBe(two.kind === "listed" ? two.listing.rows[0] : null)
  } finally {
    pending.resolve({ ok: false, reason: "failed" })
    await h.dispose()
  }
})
for (const age of [299_999, 300_000])
  test(`a ${age}ms cache is fresh and does not fetch`, async () => {
    const initial = seed()
    initial.local[`cache:${a}`] = { ...oldCache, listAt: epoch - age }
    const h = world(initial)
    try {
      h.seedTab()
      expect((await open(h)).refresh).toBeNull()
      expect(h.runs("playlists")).toEqual([])
      expect(h.cacheWrites).toBe(0)
    } finally {
      await h.dispose()
    }
  })
for (const at of [epoch - 300_001, epoch + 1, -1, "unusable", null])
  test(`an unusable or stale timestamp ${String(at)} refreshes once`, async () => {
    const initial = seed()
    initial.local[`cache:${a}`] = { ...oldCache, listAt: at }
    const h = world(initial)
    try {
      h.seedTab()
      h.script(async () => success([{ id: alpha, title: "Read" }]))
      expect((await refreshed(await open(h))).kind).toBe("listed")
      expect(h.runs("playlists")).toHaveLength(1)
    } finally {
      await h.dispose()
    }
  })
test("explicit refresh reads a fresh cache and no-tab preserves saved rows with their stamp", async () => {
  const initial = seed()
  initial.local[`cache:${a}`] = { ...oldCache, listAt: epoch }
  const h = world(initial)
  try {
    const opened = await open(h, a, { ...normalRequest, refresh: true })
    expect<unknown>(await refreshed(opened)).toEqual({ kind: "not-listed", outcome: { kind: "no-tab", attempted: [] }, cached: { rows: cachedRows, at: epoch } })
    expect(h.stored()).toEqual(initial.local)
    expect(h.cacheWrites).toBe(0)
  } finally {
    await h.dispose()
  }
})
test("different accounts refresh independently and Music uses its own saved order without Watch later", async () => {
  const initial = seed()
  initial.local[`cache:${b}`] = { listAt: 1, playlists: [{ id: beta, title: "Other account" }], order: {}, created: [], labelAt: null }
  const h = world(initial),
    enteredA = deferred<void>(),
    enteredB = deferred<void>(),
    waitA = deferred<unknown>(),
    waitB = deferred<unknown>()
  try {
    h.seedTab()
    h.seedTab(nativeTab(2), signedIn(b))
    h.script(async (_tab, invocation) => {
      if (invocation.acct === a) {
        enteredA.resolve()
        return waitA.promise
      }
      enteredB.resolve()
      return waitB.promise
    })
    const one = await open(h, a, { ...normalRequest, site: "music" })
    const two = await open(h, b)
    await Promise.all([enteredA.promise, enteredB.promise])
    expect<unknown>(one.cached).toEqual({ rows: [cachedRows[2], cachedRows[1]], at: epoch - 300_001 })
    expect(h.runs("playlists")).toHaveLength(2)
    waitA.resolve(
      success([
        { id: beta, title: "A beta" },
        { id: alpha, title: "A alpha" }
      ])
    )
    waitB.resolve(success([{ id: beta, title: "B beta" }]))
    const resultA = await refreshed(one),
      resultB = await refreshed(two)
    if (resultA.kind !== "listed" || resultB.kind !== "listed") throw Error("Expected both lists")
    expect(resultA.listing).toEqual({
      rows: [
        { id: alpha, title: "A alpha" },
        { id: beta, title: "A beta" }
      ],
      at: epoch
    })
    expect<unknown>(resultB.listing).toEqual({
      rows: [
        { id: "WL", title: "Watch later" },
        { id: beta, title: "B beta" }
      ],
      at: epoch
    })
  } finally {
    waitA.resolve({ ok: false, reason: "failed" })
    waitB.resolve({ ok: false, reason: "failed" })
    await h.dispose()
  }
})
test("private fetches do not join or populate a normal refresh and persist no private rows or session entries", async () => {
  const h = world(),
    normalEntered = deferred<void>(),
    normalWait = deferred<unknown>()
  try {
    h.seedTab()
    h.seedTab(nativeTab(9, { incognito: true, windowId: 2 }), signedIn())
    h.script(async tab => {
      if (tab === 9) return success([{ id: beta, title: "Private only" }])
      normalEntered.resolve()
      return normalWait.promise
    })
    const normalOpen = await open(h)
    await normalEntered.promise
    const beforePrivate = h.removal.state()
    const privateAnswer = await refreshed(await open(h, a, { ...privateRequest, refresh: true }))
    if (privateAnswer.kind !== "listed") throw Error("Expected private list")
    expect(privateAnswer.cache).toEqual({ kind: "caller-owned", reason: "private" })
    expect<unknown>(privateAnswer.listing).toEqual({
      rows: [
        { id: "WL", title: "Watch later" },
        { id: beta, title: "Private only" }
      ],
      at: epoch
    })
    expect(h.removal.state()).toEqual(beforePrivate)
    expect(h.cacheWrites).toBe(0)
    expect(h.runs("playlists")).toHaveLength(2)
    normalWait.resolve(success([{ id: alpha, title: "Normal only" }]))
    expect((await refreshed(normalOpen)).kind).toBe("listed")
    expect(h.stored()[`cache:${a}`]).toEqual({ listAt: epoch, playlists: [{ id: alpha, title: "Normal only" }], order: { www: [beta, alpha], music: [alpha, beta] }, created: [], labelAt: 42 })
  } finally {
    normalWait.resolve({ ok: false, reason: "failed" })
    await h.dispose()
  }
})
test("an account without Setup fetches for each open and leaves orphan cache, labels and Device untouched", async () => {
  const initial = seed()
  delete initial.local[`doc:setup:${a}`]
  const h = world(initial)
  try {
    h.seedTab()
    h.script(async () => success([{ id: alpha, title: "Caller-owned" }]))
    for (let n = 0; n < 2; n++) {
      const opened = await open(h)
      expect(opened.cached).toBeNull()
      const answer = await refreshed(opened)
      if (answer.kind !== "listed") throw Error("Expected caller list")
      expect(answer.cache).toEqual({ kind: "caller-owned", reason: "no-setup" })
    }
    expect(h.runs("playlists")).toHaveLength(2)
    expect(h.stored()).toEqual(initial.local)
    expect(h.cacheWrites).toBe(0)
    expect(h.removal.counts().generations).toBe(0)
  } finally {
    await h.dispose()
  }
})
test("a delayed list cannot recreate an actually removed account's cache", async () => {
  const h = world(),
    entered = deferred<void>(),
    pending = deferred<unknown>()
  try {
    h.seedTab()
    h.script(async () => {
      entered.resolve()
      return pending.promise
    })
    const opened = await open(h)
    await entered.promise
    const confirmation = await h.owner.prepareAccountRemoval(origin, a)
    if (confirmation.kind !== "confirmation-required") throw Error("Expected removal confirmation")
    expect(await h.owner.removeAccountSetup(origin, confirmation.confirmation)).toEqual({ kind: "committed" })
    pending.resolve(success([{ id: alpha, title: "Late answer" }]))
    const answer = await refreshed(opened)
    expect(h.stored()[`cache:${a}`]).toBeUndefined()
    expect(h.stored()[`doc:setup:${a}`]).toBeUndefined()
    if (answer.kind === "listed") expect(answer.cache.kind).toBe("refused")
    else expect(answer.outcome.kind).toBe("session")
    expect(h.cacheWrites).toBe(0)
  } finally {
    pending.resolve({ ok: false, reason: "failed" })
    await h.dispose()
  }
})
test("service disposal during a fetch discards persistence and owner disposal stays explicit", async () => {
  const h = world(),
    entered = deferred<void>(),
    pending = deferred<unknown>()
  try {
    h.seedTab()
    h.script(async () => {
      entered.resolve()
      return pending.promise
    })
    const opened = await open(h)
    await entered.promise
    h.playlists.dispose()
    pending.resolve(success([{ id: alpha, title: "Late" }]))
    const answer = await refreshed(opened)
    if (answer.kind !== "listed") throw Error("Expected preserved actual outcome")
    expect(answer.cache).toEqual({ kind: "caller-owned", reason: "disposed" })
    expect(h.cacheWrites).toBe(0)
    await h.owner.dispose()
    expect(await h.owner.readPlaylistCache({ acct: a, private: false })).toEqual({ kind: "unavailable", reason: "disposed" })
    expect(await h.playlists.list(a, normalRequest)).toEqual({ kind: "unavailable", read: { kind: "unavailable", reason: "disposed" } })
  } finally {
    pending.resolve({ ok: false, reason: "failed" })
    await h.dispose()
  }
})
test("creation submits once with the original trimmed title and exposes failed cache persistence after confirmation", async () => {
  const h = world()
  try {
    h.seedTab()
    h.fault("rejected-unchanged")
    h.script(async () => success({ playlistId: created }))
    const creation = h.playlists.create(a, normalRequest)
    const result = await creation.submit({ title: "  Created title  ", privacy: "PRIVATE", videoId: video })
    expect<unknown>(result).toEqual({ kind: "created", id: created, outcome: { kind: "result", tabId: 1, result: success({ playlistId: created }) }, cache: { kind: "failed", stage: "set" } })
    h.fault("none")
    expect(await creation.submit({ title: "Retry", privacy: "PUBLIC" })).toEqual(result)
    expect(h.runs("create")).toEqual([{ kind: "run", tabId: 1, milliseconds: 10_000, invocation: { acct: a, job: { kind: "create", title: "Created title", privacy: "PRIVATE", videoId: video } } }])
    expect(h.stored()[`cache:${a}`]).toEqual(oldCache)
  } finally {
    await h.dispose()
  }
})
test("one uncertain creation preserves delivery uncertainty and repeated submit never retries it", async () => {
  const h = world()
  try {
    h.seedTab()
    h.script(async () => {
      throw Error("Synthetic response lost")
    })
    const creation = h.playlists.create(a, normalRequest)
    const result = await creation.submit({ title: "One request", privacy: "PRIVATE" })
    expect(result).toEqual({ kind: "not-created", outcome: { kind: "transport", tabId: 1, failure: "transport", delivery: "unknown" } })
    expect(await creation.submit({ title: "One request", privacy: "PRIVATE" })).toEqual(result)
    expect(h.runs("create")).toHaveLength(1)
    expect(h.cacheWrites).toBe(0)
  } finally {
    await h.dispose()
  }
})
test("original-tab creation never borrows another matching tab", async () => {
  const h = world()
  try {
    h.seedTab(nativeTab(1), signedIn(b))
    h.seedTab(nativeTab(2), signedIn(a))
    const creation = h.playlists.create(a, { ...normalRequest, originalTab: 1 })
    expect(await creation.submit({ title: "Pinned", privacy: "PRIVATE" })).toEqual({ kind: "not-created", outcome: { kind: "guard", reason: "accountChanged" } })
    expect(h.runs("create")).toEqual([])
  } finally {
    await h.dispose()
  }
})
test("invalid titles never submit, Unicode length uses code points, and creation does not change choices or marks", async () => {
  const initial = seed(),
    h = world(initial)
  try {
    h.seedTab()
    h.script(async () => success({ playlistId: created }))
    const creation = h.playlists.create(a, normalRequest)
    expect(await creation.submit({ title: " ", privacy: "PRIVATE" })).toEqual({ kind: "invalid", problem: "required" })
    expect(await creation.submit({ title: "<bad>", privacy: "PRIVATE" })).toEqual({ kind: "invalid", problem: "angle-brackets" })
    expect(await creation.submit({ title: "😀".repeat(151), privacy: "PRIVATE" })).toEqual({ kind: "invalid", problem: "too-long" })
    expect(h.runs("create")).toEqual([])
    expect((await creation.submit({ title: "😀".repeat(150), privacy: "PUBLIC" })).kind).toBe("created")
    expect(h.stored()[`doc:setup:${a}`]).toEqual(initial.local[`doc:setup:${a}`])
    expect(h.stored().device).toEqual(initial.local.device)
  } finally {
    await h.dispose()
  }
})
test("the actual channel job accepts signed-out tabs, returns failures unchanged and retains no channel cache", async () => {
  const initial = seed(),
    h = world(initial)
  try {
    h.seedTab(nativeTab(1), { site: "www", build: signedIn().build, signedIn: false, acct: null })
    h.script(async () => success({ channelId: "UCAAAAAAAAAAAAAAAAAAAAAA", title: "Channel", handle: "@channel" }))
    expect<unknown>(await h.playlists.resolveChannel(" @channel ", normalRequest.req)).toEqual({
      kind: "result",
      tabId: 1,
      result: success({ channelId: "UCAAAAAAAAAAAAAAAAAAAAAA", title: "Channel", handle: "@channel" })
    })
    h.script(async () => ({ ok: false, reason: "failed", http: 404, status: "NOT_FOUND" }))
    expect(await h.playlists.resolveChannel("@channel", normalRequest.req)).toEqual({ kind: "result", tabId: 1, result: { ok: false, reason: "failed", http: 404, status: "NOT_FOUND" } })
    expect(h.runs("resolveChannel")).toHaveLength(2)
    expect(h.stored()).toEqual(initial.local)
    expect(h.cacheWrites).toBe(0)
  } finally {
    await h.dispose()
  }
})
test("execution-boundary membership absorption is one-use and returns no mark success", async () => {
  const h = world()
  try {
    const captured = await h.playlists.capture(a, normalRequest)
    if (captured.kind !== "eligible") throw Error("Expected eligible scope")
    const answer = { kind: "membership", rows: [{ id: alpha, title: "Fresh membership", contains: true }] } as const
    const result = await h.playlists.absorb(captured, answer)
    expect(result).toEqual({
      kind: "membership",
      cache: {
        kind: "committed",
        cache: {
          listAt: epoch,
          playlists: [{ id: alpha, title: "Fresh membership", count: 4, thumb: "https://img.test/alpha.jpg" }],
          order: { www: [alpha], music: [alpha, beta] },
          created: [],
          labelAt: 42
        }
      }
    })
    expect(await h.playlists.absorb(captured, answer)).toEqual({ kind: "membership", cache: { kind: "refused", reason: "capture" } })
    expect(h.stored()[`doc:setup:${a}`]).toEqual(seed().local[`doc:setup:${a}`])
  } finally {
    await h.dispose()
  }
})

test("two sites for one account join one www read and receive their independent display orders", async () => {
  const h = world(),
    entered = deferred<void>(),
    pending = deferred<unknown>()
  try {
    h.seedTab()
    h.script(async () => {
      entered.resolve()
      return pending.promise
    })
    const www = await open(h)
    await entered.promise
    const music = await open(h, a, { ...normalRequest, site: "music" })
    expect(h.runs("playlists")).toHaveLength(1)
    pending.resolve(
      success([
        { id: alpha, title: "Alpha" },
        { id: beta, title: "Beta" }
      ])
    )
    const [one, two] = await Promise.all([refreshed(www), refreshed(music)])
    if (one.kind !== "listed" || two.kind !== "listed") throw Error("Expected lists")
    expect<unknown>(one.listing.rows).toEqual([
      { id: "WL", title: "Watch later" },
      { id: beta, title: "Beta" },
      { id: alpha, title: "Alpha" }
    ])
    expect(two.listing.rows).toEqual([
      { id: alpha, title: "Alpha" },
      { id: beta, title: "Beta" }
    ])
    expect(h.cacheWrites).toBe(1)
  } finally {
    pending.resolve({ ok: false, reason: "failed" })
    await h.dispose()
  }
})
test("failed list results retain exact YouTube failure fields and never destroy cached rows", async () => {
  const initial = seed(),
    h = world(initial)
  try {
    h.seedTab()
    h.script(async () => ({ ok: false, reason: "failed", http: 429, status: "RATE_LIMITED" }))
    expect<unknown>(await refreshed(await open(h))).toEqual({
      kind: "not-listed",
      outcome: { kind: "result", tabId: 1, result: { ok: false, reason: "failed", http: 429, status: "RATE_LIMITED" } },
      cached: { rows: cachedRows, at: epoch - 300_001 }
    })
    expect(h.stored()).toEqual(initial.local)
    expect(h.runs("playlists")).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})
test("confirmed creation with uncertain cache readback remains created and cannot resubmit", async () => {
  const h = world()
  try {
    h.seedTab()
    h.fault("rejected-applied")
    h.script(async () => success({ playlistId: created }))
    const creation = h.playlists.create(a, normalRequest)
    const answer = await creation.submit({ title: "Confirmed", privacy: "UNLISTED" })
    expect<unknown>(answer).toEqual({
      kind: "created",
      id: created,
      outcome: { kind: "result", tabId: 1, result: success({ playlistId: created }) },
      cache: { kind: "unconfirmed", write: "rejected", cause: "readback" }
    })
    expect(await creation.submit({ title: "Retry", privacy: "PUBLIC" })).toEqual(answer)
    expect(h.runs("create")).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})
test("private creation keeps confirmed facts caller-owned and never saves Device visibility or cache", async () => {
  const initial = seed(),
    h = world(initial)
  try {
    h.seedTab(nativeTab(9, { windowId: 2, incognito: true }), signedIn())
    h.script(async () => success({ playlistId: created }))
    const answer = await h.playlists.create(a, privateRequest).submit({ title: "Private created", privacy: "PUBLIC" })
    expect<unknown>(answer).toEqual({
      kind: "created",
      id: created,
      outcome: { kind: "result", tabId: 9, result: success({ playlistId: created }) },
      cache: { kind: "caller-owned", reason: "private" }
    })
    expect(h.removal.state()).toEqual(initial)
    expect(h.cacheWrites).toBe(0)
  } finally {
    await h.dispose()
  }
})
test("a recreated account's new open waits for its own read rather than joining a revoked result", async () => {
  const initial = seed(),
    h = world(initial),
    entered = deferred<void>(),
    pending = deferred<unknown>()
  let first = true
  try {
    h.seedTab()
    h.script(async () => {
      if (first) {
        first = false
        entered.resolve()
        return pending.promise
      }
      return success([{ id: beta, title: "New lifetime" }])
    })
    const old = await open(h)
    await entered.promise
    const prepared = await h.owner.prepareAccountRemoval(origin, a)
    if (prepared.kind !== "confirmation-required") throw Error("Expected removal")
    expect(await h.owner.removeAccountSetup(origin, prepared.confirmation)).toEqual({ kind: "committed" })
    h.removal.foreign(state => {
      state.local[`doc:setup:${a}`] = structuredClone(initial.local[`doc:setup:${a}`]!)
    })
    const recreated = await open(h)
    expect(recreated.cached).toBeNull()
    pending.resolve(success([{ id: alpha, title: "Old lifetime" }]))
    await refreshed(old)
    const answer = await refreshed(recreated)
    if (answer.kind !== "listed") throw Error("Expected new result")
    expect<unknown>(answer.listing).toEqual({
      rows: [
        { id: "WL", title: "Watch later" },
        { id: beta, title: "New lifetime" }
      ],
      at: epoch
    })
    expect(h.runs("playlists")).toHaveLength(2)
    expect(h.stored()[`cache:${a}`]).toEqual({ listAt: epoch, playlists: [{ id: beta, title: "New lifetime" }], order: {}, created: [], labelAt: null })
  } finally {
    pending.resolve({ ok: false, reason: "failed" })
    await h.dispose()
  }
})

test("a private no-Setup list absorption retains its authenticated privacy fact", async () => {
  const initial = seed()
  delete initial.local[`doc:setup:${a}`]
  const h = world(initial)
  try {
    const scope = await h.playlists.capture(a, privateRequest)
    if (scope.kind !== "caller-owned") throw Error("Expected caller-owned scope")
    expect(await h.playlists.absorb(scope, { kind: "list", rows: [{ id: alpha, title: "Private" }] })).toEqual({
      kind: "list",
      cache: { kind: "caller-owned", reason: "private" },
      present: { kind: "list-present", acct: a, site: "www", private: true, at: epoch, ids: [alpha] }
    })
    expect(h.removal.state()).toEqual(initial)
  } finally {
    await h.dispose()
  }
})
