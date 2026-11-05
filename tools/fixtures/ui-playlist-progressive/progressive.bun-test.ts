import { expect, test } from "bun:test"
import { flushSync } from "svelte"
import { PickerModel } from "../../../src/shared/picker/model.svelte"
import type { Listing } from "../../../src/shared/picker/source"
import { isListOperationId } from "../../../src/shared/contracts/ui-playlists"
import { isAccountKey } from "../../../src/shared/model/validation"
import { pendingLists, pickerFixture, bridgeHarness, popup, a, alpha, beta, check, settle } from "./harness"
import { consumerSeed, nativeTab, signedIn } from "../ui-read-playlist-bridge/harness"
import { epoch, oldCache } from "../playlists-cache/harness"
import { WATCH_LATER } from "../../../src/shared/model/account-cache"

const identity = "00000000-0000-4000-8000-000000000002"
check(isListOperationId(identity), "list operation identity")
const otherAccount = "CCCCCCCCCCCCCCCC"
check(isAccountKey(otherAccount), "other account identity")

test("cached rows reach the actual PickerModel while refresh and membership remain withheld", async () => {
  const h = pendingLists(),
    backend = h.open(popup(), 1),
    operation = backend.playlistList({ acct: a, site: "www" })
  const fixture = pickerFixture(operation, h.h.clock.wallNow)
  const picker = new PickerModel({ source: fixture.source, site: "www", mode: "save" })
  let cached: Listing | null | undefined
  void operation.cachedList().then(value => {
    cached = value
  })
  try {
    await h.entered
    await settle()
    flushSync()
    expect(h.resolved).toBe(false)
    expect(cached?.rows.map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
    expect(cached?.at).toBe(epoch - 300_001)
    expect(picker.rows.map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
    expect(picker.membership).toEqual({ kind: "checking" })
    expect(await picker.tick(beta)).toEqual({ kind: "already-in" })
    expect(fixture.added).toBe(1)
    expect(h.h.runs("playlists")).toHaveLength(1)
    const refresh = operation.freshList()
    h.resolve()
    expect(await refresh).toMatchObject({ kind: "listed", listing: { at: epoch } })
    await settle()
    flushSync()
    expect(picker.rows.map(row => row.title)).toEqual(["Watch later", "Alpha refreshed"])
    expect(h.h.runs("playlists")).toHaveLength(1)
  } finally {
    picker.close()
    operation.dispose()
    fixture.membership.resolve({ kind: "unreadable" })
    await h.dispose()
  }
  expect(h.network.listening()).toBe(0)
  expect(h.counts().localListeners).toBe(0)
  expect(h.h.clock.pending).toBe(0)
})

test("concurrent opens and numbered refresh requests share one native job", async () => {
  const h = pendingLists()
  h.h.seedTab(nativeTab(9, { windowId: 2, incognito: true, active: true }), signedIn())
  const backend = h.open(popup(2), 2)
  try {
    const payload = { action: "open", operation: identity, acct: a, site: "www", refresh: false } as const
    const first = backend.call("ui.playlists", payload),
      second = backend.call("ui.playlists", payload)
    await h.entered
    expect(await first).toEqual(await second)
    const waits = [backend.call("ui.playlists", { action: "await", operation: identity, generation: 0 }), backend.call("ui.playlists", { action: "refresh", operation: identity, generation: 0 })]
    await settle()
    expect(h.h.runs("playlists")).toHaveLength(1)
    h.resolve()
    const [one, two] = await Promise.all(waits)
    check(one !== undefined && two !== undefined, "both refresh requests answer")
    expect(one).toEqual(two)
    expect(one).toMatchObject({ kind: "answered", result: { kind: "refreshed", generation: 0, refresh: { kind: "listed" } } })
    const same = await backend.call("ui.playlists", { action: "refresh", operation: identity, generation: 0 })
    expect(same).toEqual(one)
    expect(h.h.runs("playlists")).toHaveLength(1)
    await backend.call("ui.playlists", { action: "release", operation: identity })
  } finally {
    await h.dispose()
  }
})

test("one Backend operation shares its pending freshList calls", async () => {
  const h = pendingLists(),
    operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
  try {
    await h.entered
    const first = operation.refresh(),
      second = operation.refresh()
    expect(first).toBe(second)
    const third = operation.freshList()
    h.resolve()
    expect(await first).toEqual(await second)
    expect(await third).toMatchObject({ kind: "listed" })
    expect(h.h.runs("playlists")).toHaveLength(1)
  } finally {
    operation.dispose()
    await h.dispose()
  }
})

test("the real service honors the five-minute boundary and explicit refresh", async () => {
  for (const age of [299_999, 300_000, 300_001]) {
    const seed = consumerSeed()
    seed.local[`cache:${a}`] = { ...oldCache, listAt: epoch - age }
    const h = bridgeHarness({ initial: seed }),
      operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
    try {
      const opened = await operation.opened
      expect(opened).toMatchObject({ kind: "answered", result: { kind: "open", freshness: age > 300_000 ? "stale" : "fresh" } })
      await settle()
      expect(h.h.runs("playlists")).toHaveLength(age > 300_000 ? 1 : 0)
      expect(await operation.freshList()).toMatchObject({ kind: "listed" })
      expect(h.h.runs("playlists")).toHaveLength(1)
      expect(await operation.freshList()).toMatchObject({ kind: "listed" })
      expect(h.h.runs("playlists")).toHaveLength(2)
    } finally {
      operation.dispose()
      await h.dispose()
    }
  }
})

test("another account or native document cannot reuse a pending list operation", async () => {
  const h = pendingLists(),
    backend = h.open(popup(), 1)
  try {
    const opened = backend.call("ui.playlists", { action: "open", operation: identity, acct: a, site: "www", refresh: false })
    await h.entered
    await opened
    expect(await backend.call("ui.playlists", { action: "open", operation: identity, acct: otherAccount, site: "www", refresh: false })).toEqual({
      kind: "answered",
      result: { kind: "unavailable", reason: "operation" }
    })
    expect(await backend.call("ui.playlists", { action: "open", operation: identity, acct: a, site: "music", refresh: false })).toEqual({
      kind: "answered",
      result: { kind: "unavailable", reason: "operation" }
    })
    const foreign = h.open({ ...popup(), documentId: "another-document" }, 1)
    expect(await foreign.call("ui.playlists", { action: "await", operation: identity, generation: 0 })).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "operation" } })
    expect(h.h.runs("playlists")).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})

for (const change of ["account", "native-tab", "privacy", "consent", "setup", "release", "backend-dispose", "router-dispose"] as const) {
  test(`pending refresh withholds old rows after ${change}`, async () => {
    const h = pendingLists(),
      backend = h.open(popup(), 1),
      operation = backend.playlistList({ acct: a, site: "www" })
    try {
      await h.entered
      await operation.opened
      const refreshed = operation.refresh()
      await settle()
      if (change === "account") h.h.pings.set(1, signedIn(otherAccount))
      if (change === "native-tab") {
        h.h.tabs.delete(1)
        h.h.seedTab(nativeTab(3), signedIn())
      }
      if (change === "privacy") h.privacy.set(1, true)
      if (change === "consent") await h.h.removal.deps.local.set({ device: { id: "fixture", consent: null, syncOn: false } })
      if (change === "setup") await h.h.removal.deps.local.set({ [`doc:setup:${a}`]: { v: 1, gen: "removed", at: 2, by: "fixture", deleted: true } })
      if (change === "release") operation.dispose()
      if (change === "backend-dispose") backend.dispose()
      if (change === "router-dispose") h.router.dispose()
      h.resolve()
      const result = await refreshed
      expect(result.kind !== "answered" || result.result.kind !== "refreshed" || result.result.refresh.kind !== "listed").toBe(true)
      expect(JSON.stringify(result)).not.toContain("Alpha refreshed")
    } finally {
      operation.dispose()
      await h.dispose()
    }
  })
}

test("private and no-Setup refreshes remain caller-owned and never persist", async () => {
  const h = bridgeHarness()
  try {
    h.h.seedTab(nativeTab(9, { windowId: 2, incognito: true, active: true }), signedIn())
    const privateList = h.open(popup(2), 2).playlistList({ acct: a, site: "music" })
    const noSetup = h.open(popup(), 1).playlistList({ acct: otherAccount, site: "www" })
    h.h.seedTab(nativeTab(3, { active: false }), signedIn(otherAccount))
    const before = h.h.cacheWrites
    expect((await privateList.cachedList())?.rows.map(row => row.id)).toEqual([alpha, beta])
    expect(await noSetup.cachedList()).toBeNull()
    expect(await privateList.refresh()).toMatchObject({ kind: "answered", result: { kind: "refreshed", refresh: { kind: "listed", cache: { kind: "caller-owned", reason: "private" } } } })
    expect(await noSetup.refresh()).toMatchObject({ kind: "answered", result: { kind: "refreshed", refresh: { kind: "listed", cache: { kind: "caller-owned", reason: "no-setup" } } } })
    expect(h.h.cacheWrites).toBe(before)
    privateList.dispose()
    noSetup.dispose()
  } finally {
    await h.dispose()
  }
})

test("refresh failure retains cached rows and reports no-tab and native uncertainty", async () => {
  const h = bridgeHarness()
  try {
    h.h.tabs.clear()
    const missing = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
    expect((await missing.cachedList())?.rows.map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
    expect(await missing.freshList()).toEqual({ kind: "noTab" })
    expect((await missing.cachedList())?.rows.map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
    missing.dispose()
    h.h.seedTab()
    h.h.script(async () => {
      throw Error("Synthetic native uncertainty")
    })
    const uncertain = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
    expect(await uncertain.refresh()).toMatchObject({ kind: "answered", result: { kind: "refreshed", refresh: { kind: "not-listed", outcome: { kind: "transport", delivery: "unknown" } } } })
    expect((await uncertain.cachedList())?.rows).toHaveLength(3)
    uncertain.dispose()
  } finally {
    await h.dispose()
  }
})

for (const fault of ["rejected-unchanged", "resolved-unchanged", "unreadable"] as const) {
  test(`confirmed native rows do not claim cache persistence after ${fault}`, async () => {
    const h = pendingLists(),
      operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
    try {
      await h.entered
      await operation.opened
      h.h.fault(fault)
      const result = operation.refresh()
      await settle()
      h.resolve()
      const answer = await result
      check(answer.kind === "answered" && answer.result.kind === "refreshed", "separate native and cache outcome")
      const refresh = answer.result.refresh
      expect(refresh.kind === "listed" || refresh.kind === "withheld").toBe(true)
      if (refresh.kind === "listed" || refresh.kind === "withheld") {
        expect(refresh.cache?.kind).toBe(fault === "rejected-unchanged" ? "failed" : "unconfirmed")
        expect(refresh.cache?.kind).not.toBe("committed")
      }
      if (refresh.kind === "withheld") {
        expect(refresh.confirmed).toBe(true)
        expect(JSON.stringify(refresh)).not.toContain("Alpha refreshed")
      }
    } finally {
      operation.dispose()
      await h.dispose()
    }
  })
}

test("release tombstone refuses a delayed list open without starting a job", async () => {
  const h = bridgeHarness({ delivery: "queued" }),
    backend = h.open(popup(), 1)
  try {
    const open = backend.call("ui.playlists", { action: "open", operation: identity, acct: a, site: "www", refresh: false })
    const release = backend.call("ui.playlists", { action: "release", operation: identity })
    const queue = h.network.queued(),
      opened = queue[0],
      released = queue[1]
    check(opened && released, "two finite messages queued")
    released.deliver()
    await settle()
    await release
    opened.deliver()
    await settle()
    expect(await open).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "operation" } })
    expect(h.h.runs("playlists")).toHaveLength(0)
  } finally {
    await h.dispose()
  }
})

test("lost list answers recover the same generation without another refresh job", async () => {
  const h = bridgeHarness({ delivery: "queued" }),
    backend = h.open(popup(), 1)
  try {
    const open = backend.call("ui.playlists", { action: "open", operation: identity, acct: a, site: "www", refresh: false })
    await h.flush()
    await open
    const lostAnswer = backend.call("ui.playlists", { action: "await", operation: identity, generation: 0 })
    await settle()
    const delivery = h.network.queued()[0]
    check(delivery, "await answer can be lost")
    delivery.lose()
    expect((await lostAnswer).kind).toBe("failed")
    const status = backend.call("ui.playlists", { action: "await", operation: identity, generation: 0 })
    await h.flush()
    expect(await status).toMatchObject({ kind: "answered", result: { kind: "refreshed", generation: 0 } })
    expect(h.h.runs("playlists")).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})

test("disposed Backend and released list methods start no new work", async () => {
  const h = bridgeHarness(),
    backend = h.open(popup(), 1)
  backend.dispose()
  const operation = backend.playlistList({ acct: a, site: "www" })
  try {
    expect(await operation.cachedList()).toBeNull()
    expect(await operation.freshList()).toEqual({ kind: "failed" })
    expect(await operation.refresh()).toEqual({ kind: "failed", failure: "disposed" })
    expect(h.h.runs("playlists")).toHaveLength(0)
  } finally {
    operation.dispose()
    await h.dispose()
  }
})

test("unknown cached timestamps retain rows and stay stale in the existing PickerSource", async () => {
  const seed = consumerSeed()
  seed.local[`cache:${a}`] = { ...oldCache, listAt: null }
  const h = pendingLists({ initial: seed }),
    operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
  try {
    await h.entered
    expect(await operation.opened).toMatchObject({ kind: "answered", result: { kind: "open", cached: { at: null } } })
    expect(await operation.cachedList()).toMatchObject({ at: 0 })
    expect((await operation.cachedList())?.rows.map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
  } finally {
    operation.dispose()
    await h.dispose()
  }
})

test("the Backend bounds live list operations and frees the shared local listener on release", async () => {
  const h = bridgeHarness({ unavailable: true }),
    backend = h.open(popup(), 1)
  const operations = Array.from({ length: 256 }, () => backend.playlistList({ acct: a, site: "www" }))
  try {
    await Promise.all(operations.map(operation => operation.opened))
    const overflow = backend.playlistList({ acct: a, site: "www" })
    expect(await overflow.opened).toEqual({ kind: "answered", result: { kind: "unavailable", reason: "capacity" } })
    expect(h.counts().localListeners).toBe(1)
    for (const operation of operations) operation.dispose()
    expect(h.counts().localListeners).toBe(0)
    const next = backend.playlistList({ acct: a, site: "www" })
    expect(await next.opened).toMatchObject({ kind: "answered", result: { kind: "unavailable", reason: "collaborator" } })
    next.dispose()
    overflow.dispose()
  } finally {
    await h.dispose()
  }
})

test("local authority changes close the Backend adapter before a late refresh answer", async () => {
  const h = pendingLists(),
    operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
  try {
    await h.entered
    await operation.opened
    const fresh = operation.refresh()
    await settle()
    h.emitLocal({ device: { newValue: { consent: null } } })
    h.resolve()
    expect(await fresh).toEqual({ kind: "failed", failure: "disposed" })
    expect(await operation.cachedList()).toBeNull()
    expect(h.counts().localListeners).toBe(0)
  } finally {
    operation.dispose()
    await h.dispose()
  }
})

test("the Backend re-awaits a lost generation instead of issuing another native refresh", async () => {
  const h = bridgeHarness({ delivery: "queued" }),
    operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
  try {
    await h.flush()
    await operation.opened
    const lost = operation.refresh()
    await settle()
    const delivery = h.network.queued()[0]
    check(delivery, "Backend wait can lose its answer")
    delivery.lose()
    expect((await lost).kind).toBe("failed")
    const recovered = operation.refresh()
    await h.flush()
    expect(await recovered).toMatchObject({ kind: "answered", result: { kind: "refreshed", generation: 0 } })
    expect(h.h.runs("playlists")).toHaveLength(1)
    operation.dispose()
    await h.flush()
  } finally {
    operation.dispose()
    await h.dispose()
  }
})

test("an immediately unconfirmed refresh preserves its already-authorized cached rows", async () => {
  const h = bridgeHarness()
  h.h.fault("unreadable")
  const operation = h.open(popup(), 1).playlistList({ acct: a, site: "www" })
  try {
    expect((await operation.cachedList())?.rows.map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
    expect(await operation.refresh()).toMatchObject({ kind: "answered", result: { kind: "refreshed", refresh: { kind: "withheld", confirmed: true, cache: { kind: "unconfirmed" } } } })
    expect((await operation.cachedList())?.rows.map(row => row.id)).toEqual([WATCH_LATER, beta, alpha])
  } finally {
    operation.dispose()
    await h.dispose()
  }
})
