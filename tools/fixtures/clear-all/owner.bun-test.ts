import { expect, test } from "bun:test"
import { clearFixture, sharedSync, accountSeed, agreedSeed, settingsOrigin, account, otherAccount, check, copy, type Fault } from "./harness"
import { clearMarkerKey } from "../../../src/background/store/store-lifecycle"
import { readSyncedClearMarker } from "../../../src/background/store/sync-reset"
import { receivedResetKey, resetNoticeText } from "../../../src/background/store/sync-reset-receive"
import { gate } from "../starting-owner/support"

async function finishSynced(h: ReturnType<typeof clearFixture>) {
  for (let event = 0; event < 20; event++) {
    const result = await h.clear({ alsoSynced: true })
    if (result.kind === "cleared") return result
    check(result.kind === "reset-held" && result.result.kind === "deferred", "only an explicit deferred opportunity continues")
    h.advance(Math.max(5000, result.result.notBefore - h.time()))
  }
  throw Error("Finite reset opportunity budget exhausted")
}

for (const layout of [1, 2]) for (const consent of [false, true]) for (const privateWindow of [false, true, undefined]) {
  test(`unticked zero sync layout ${layout} consent ${consent} private ${String(privateWindow)}`, async () => {
    const seed = accountSeed(false)
    seed.schema = layout
    if (!consent && seed.device && typeof seed.device === "object" && !Array.isArray(seed.device)) seed.device.consent = null
    const h = clearFixture(seed)
    h.private(privateWindow)
    h.seedSession({ paused: true, dummy: "session" })
    try {
      const origin = privateWindow === undefined ? { kind: "unavailable", reason: "privacy", page: "settings" } as const
        : { kind: "ui", page: "settings", origin: { kind: "ui", windowId: 1, incognito: privateWindow } } as const
      const result = await h.lifecycle().clearAll(origin, { alsoSynced: false })
      expect(result.kind, "local erasure confirmed").toBe("cleared")
      expect(h.calls.filter(call => call.operation.startsWith("sync.")), "unticked zero sync access").toEqual([])
      expect(h.records(), "all local classes erased before fresh schema").toEqual({ schema: 1 })
      expect(h.session(), "session erased").toEqual({})
      expect(h.counts(), "database and actual first run").toEqual({ openings: 1, databases: 1 })
      const removals = h.calls.filter(call => call.operation === "local.remove")
      expect(removals.at(-1)?.names, "marker removed last").toEqual([clearMarkerKey])
    } finally { await h.dispose() }
  })
}

test("supported pre-consent sync-off reset leaves exactly codec metadata", async () => {
  const h = clearFixture({ schema: 1, device: { id: "starting-fixture", consent: null, syncOn: false }, unclaimed: { preserveUntilErase: true } })
  try {
    const result = await finishSynced(h)
    expect(result.kind).toBe("cleared")
    expect(h.shared.records(), "exact reset metadata and complete inventory").toEqual({ "s:meta": { v: 1, reset: true, id: "clear-generation-1", created: 1_000_000 } })
    const mutations = h.calls.filter(call => call.operation === "sync.set" || call.operation === "sync.remove")
    expect(mutations.map(call => call.operation), "one set and separate remove").toEqual(["sync.set", "sync.remove"])
    for (let index = 1; index < mutations.length; index++) expect(mutations[index]!.at - mutations[index - 1]!.at, "shared pacing across reset mutations").toBeGreaterThanOrEqual(5000)
    expect(h.records()).toEqual({ schema: 1 })
  } finally { await h.dispose() }
})

test("a ticked clear under a newer layout clears this browser and leaves synced settings for the newer version", async () => {
  const h = clearFixture({ schema: 2, future: { keep: true } })
  try {
    const before = h.shared.records()
    const result = await h.clear({ alsoSynced: true })
    expect(result).toMatchObject({ kind: "cleared", next: "first-run", synced: "kept-newer-layout" })
    expect(h.calls.filter(call => call.operation.startsWith("sync."))).toEqual([])
    expect(h.shared.records()).toEqual(before)
    expect(h.records()).toEqual({ schema: 1 })
  } finally { await h.dispose() }
})

test("clear deduplication binds exact checkbox scope", async () => {
  const h = clearFixture()
  try {
    const first = h.lifecycle().clearAll(settingsOrigin, { alsoSynced: false })
    const second = h.lifecycle().clearAll(settingsOrigin, { alsoSynced: false })
    expect(second, "same scope deduplicates").toBe(first)
    expect(await h.lifecycle().clearAll(settingsOrigin, { alsoSynced: true })).toEqual({ kind: "unavailable", reason: "scope-in-progress" })
    expect((await first).kind).toBe("cleared")
    expect(h.counts().databases).toBe(1)
  } finally { await h.dispose() }
})

for (const operation of ["sync.set", "sync.remove"]) for (const mode of ["before", "after", "ignore"] satisfies Fault[]) {
  test(`reset boundary ${operation} ${mode}`, async () => {
    const h = clearFixture()
    try {
      h.advance(5000)
      if (operation === "sync.remove") {
        expect((await h.clear({ alsoSynced: true })).kind).toBe("reset-held")
        h.advance(5000)
      }
      h.fault.set(operation, mode)
      const result = await h.clear({ alsoSynced: true })
      expect(result.kind, "fault cannot acknowledge reset").toBe("reset-held")
      const marker = readSyncedClearMarker(h.records()[clearMarkerKey])
      check(marker, "durable reset progress survives fault")
      expect(h.counts().databases, "no local erase before reset confirmation").toBe(0)
      if (mode !== "ignore") {
        expect(marker.wait, "opaque failure held durably").toBe("opaque")
        expect(marker.notBefore - h.clock.wallNow()).toBeGreaterThanOrEqual(60000)
        expect(marker.diagnostic, "original opaque diagnostic retained").not.toBeNull()
      }
    } finally { await h.dispose() }
  })
}

test("owner replacement retains the last invocation", async () => {
  const h = clearFixture()
  try {
    h.advance(5000)
    await h.clear({ alsoSynced: true })
    const invoked = h.calls.filter(call => call.operation === "sync.set" || call.operation === "sync.remove").length
    await h.restart()
    expect((await h.clear({ alsoSynced: true })).kind).toBe("reset-held")
    expect(h.calls.filter(call => call.operation === "sync.set" || call.operation === "sync.remove").length, "restart cannot forget pacing").toBe(invoked)
    await finishSynced(h)
    const times = h.calls.filter(call => call.operation === "sync.set" || call.operation === "sync.remove").map(call => call.at)
    expect(times).toEqual([5000, 10000])
  } finally { await h.dispose() }
})

test("opaque restart requires a fresh sixty-second hold and external event", async () => {
  const h = clearFixture()
  try {
    h.advance(5000); h.fault.set("sync.set", "after")
    await h.clear({ alsoSynced: true })
    h.advance(120000)
    await h.restart()
    const result = await h.clear({ alsoSynced: true })
    check(result.kind === "reset-held" && result.result.kind === "deferred", "restart holds uncertain invocation")
    expect(result.result.notBefore - h.time(), "restart-safe minimum opaque hold").toBeGreaterThanOrEqual(60000)
    expect(h.timers.filter(timer => !timer.cancelled), "reset adds no retry timer").toEqual([])
  } finally { await h.dispose() }
})

test("missing marker confirmation prevents destructive local work", async () => {
  const h = clearFixture(accountSeed())
  try {
    const before = h.records()
    h.fault.set("local.set", "ignore")
    const result = await h.clear({ alsoSynced: false })
    expect(result.kind, "marker loss cannot acknowledge clear").toBe("failed")
    expect(h.records()).toEqual(before)
    expect(h.calls.filter(call => ["session.clear", "database.delete", "local.remove"].includes(call.operation))).toEqual([])
  } finally { await h.dispose() }
})

test("inventory rejection is never emptiness", async () => {
  const h = clearFixture()
  try {
    h.fault.set("session.names", "before")
    expect((await h.clear({ alsoSynced: false })).kind).toBe("unconfirmed")
    expect(h.records()[clearMarkerKey]).toEqual({ v: 1, kind: "clear-all" })
  } finally { await h.dispose() }
})

test("first-run opening is separate from confirmed erase and readiness", async () => {
  const h = clearFixture()
  try {
    h.fault.set("first-run.open", "ignore")
    const result = await h.clear({ alsoSynced: false })
    check(result.kind === "cleared", "erasure confirmed separately")
    expect(result.opening).toEqual({ kind: "unconfirmed", reason: "not-opened" })
    expect(result.readiness.kind).toBe("ready")
  } finally { await h.dispose() }
})

test("late old session mutation cannot resurrect cleared memory", async () => {
  const h = clearFixture(agreedSeed()), hold = gate()
  try {
    await h.lifecycle().ready()
    const owner = h.lifecycle().owner(); check(owner, "old real owner")
    await owner.ready()
    const read = await owner.readSession(); check(read.kind === "memory", "captured real session revision")
    h.h.hooks.sessionRead = hold.wait
    const mutation = owner.changeSession({ revision: read.revision, now: 10, edits: [{ kind: "pause", paused: true }] })
    await hold.entered
    const clearing = h.clear({ alsoSynced: false })
    hold.release()
    await mutation
    expect((await clearing).kind).toBe("cleared")
    h.h.fireLate()
    expect(h.session(), "late callbacks cannot resurrect cleared session").toEqual({})
    expect(h.records()).toEqual({ schema: 1 })
  } finally { hold.release(); await h.dispose() }
})

test("two real browser owners receive reset and preserve local authority", async () => {
  const shared = sharedSync(), sender = clearFixture(agreedSeed(false), shared), receiver = clearFixture(accountSeed(true), shared)
  receiver.seedSession({ paused: true, [`skips:${account}`]: {}, [`cooldown:${otherAccount}`]: 5 })
  try {
    await receiver.lifecycle().ready()
    const owner = receiver.lifecycle().owner(); check(owner, "real receiving owner")
    await owner.ready()
    const before = receiver.records(), device = copy(before.device), unclaimed = copy(before.unclaimed)
    const events: unknown[] = []
    owner.subscribeView(event => events.push(event))
    await finishSynced(sender)
    await owner.startSync()
    const after = receiver.records()
    expect(after.device, "receiving browser keeps consent and sync switch").toEqual(device)
    expect(after.unclaimed, "receiving browser keeps unclaimed setup").toEqual(unclaimed)
    expect(Object.keys(after).filter(name => /^(doc:|cache:|progress:)/.test(name)), "all accounts and sixteen shards erased").toEqual([])
    expect(receiver.session(), "associated per-account session removed").toEqual({ paused: true })
    expect([...receiver.notices.values()], "exact reset notice published once").toEqual([{ id: "clear-generation-1", text: resetNoticeText }])
    expect(events, "final targeted publication").toEqual([{ kind: "settings-changed", source: "sync" },
      { kind: "account-removed", source: "sync", acct: account }, { kind: "account-removed", source: "sync", acct: otherAccount }])
    expect((await owner.receiveSyncReset()).kind).toBe("already-received")
    expect(receiver.notices.size).toBe(1)
  } finally { await sender.dispose(); await receiver.dispose() }
})

test("sync off ignores remote reset without reading payload or storage", async () => {
  const shared = sharedSync({ "s:meta": { v: 1, id: "reset", created: 1, reset: true } }), h = clearFixture(accountSeed(false), shared)
  try {
    await h.lifecycle().ready()
    const owner = h.lifecycle().owner(); check(owner, "off owner"); await owner.ready()
    const before = h.records()
    await owner.startSync(); shared.fire()
    expect((await owner.receiveSyncReset()).kind).toBe("ordinary")
    expect(h.calls.filter(call => call.operation.startsWith("sync.")), "off means zero sync access").toEqual([])
    expect(h.records()).toEqual(before)
  } finally { await h.dispose() }
})

for (const remote of [{}, { "s:meta": { v: 2, id: "newer", created: 1, reset: true } }, { "s:meta": { v: 1, reset: true } }]) {
  test(`vanishing copy or unsupported reset ${JSON.stringify(remote)}`, async () => {
    const h = clearFixture(accountSeed(true), sharedSync(remote))
    try {
      await h.lifecycle().ready(); const owner = h.lifecycle().owner(); check(owner, "receiving owner"); await owner.ready()
      const before = h.records(), result = await owner.receiveSyncReset()
      expect(result.kind).toBe(Object.keys(remote).length ? "reset-held" : "ordinary")
      expect(h.records(), "vanishing copy is never deletion").toEqual(before)
    } finally { await h.dispose() }
  })
}

test("fresh agreement cannot silently authorize admitted old reset cleanup", async () => {
  const h = clearFixture(accountSeed(true), sharedSync({ "s:meta": { v: 1, reset: true, id: "reset", created: 1 } }))
  try {
    await h.lifecycle().ready(); const owner = h.lifecycle().owner(); check(owner, "receiving owner"); await owner.ready()
    h.fault.set("local.remove", "before")
    expect((await owner.receiveSyncReset()).kind).toBe("reset-held")
    check(h.records()[receivedResetKey], "admitted receive marker retained")
    h.h.mutate(records => { const raw = records.device; check(raw !== null && typeof raw === "object" && !Array.isArray(raw), "device"); raw.consent = { v: 1, at: 2 } })
    const before = h.records()
    await h.restart()
    const next = h.lifecycle().owner(); check(next, "held owner remains inspectable")
    await expect(next.ready()).rejects.toBeDefined()
    expect((await next.receiveSyncReset()).kind).toBe("reset-held")
    expect(h.records(), "new agreement cannot resume original reset").toEqual(before)
  } finally { await h.dispose() }
})

export { finishSynced }

test("explicit fresh recovery preserves original reset authority and consumes the review", async () => {
  const h = clearFixture(accountSeed(true), sharedSync({ "s:meta": { v: 1, reset: true, id: "reset", created: 1 } }))
  try {
    check(settingsOrigin.kind === "ui", "known Settings recovery origin")
    await h.lifecycle().ready(); const owner = h.lifecycle().owner(); check(owner, "receiving owner"); await owner.ready()
    h.fault.set("local.remove", "before")
    expect((await owner.receiveSyncReset()).kind).toBe("reset-held")
    const admitted = h.records()[receivedResetKey]
    check(admitted !== null && typeof admitted === "object" && !Array.isArray(admitted), "admitted reset")
    const original = copy(admitted.originalAuthority)
    h.h.mutate(records => { const device = records.device; check(device !== null && typeof device === "object" && !Array.isArray(device), "device"); device.consent = { v: 1, at: 2 } })
    const review = await owner.readWithdrawnWork(settingsOrigin.origin)
    check(review.kind === "held", "reset-only evidence is reviewable")
    const selected = review.work.find(work => work.kind === "sync-reset")
    check(selected?.kind === "sync-reset" && selected.resume === "explicit-recovery", "fresh agreement requires explicit reset recovery")
    let authorizationObserved = false
    h.hook(async operation => {
      if (operation !== "local.remove") return
      const marker = h.records()[receivedResetKey]
      check(marker !== null && typeof marker === "object" && !Array.isArray(marker), "recovery marker exists before deletion")
      expect(marker.originalAuthority, "recovery keeps original authority").toEqual(original)
      expect(marker.recovery).toMatchObject({ kind: "authorized" })
      authorizationObserved = true
    })
    expect((await owner.recoverWithdrawnWork(settingsOrigin.origin, { review: review.review, job: selected.selection })).kind).toBe("recovered")
    expect(authorizationObserved, "durable authorization precedes recovery deletion").toBe(true)
    expect((await owner.recoverWithdrawnWork(settingsOrigin.origin, { review: review.review, job: selected.selection })).kind).toBe("unavailable")
    expect(h.records().device).toMatchObject({ consent: { v: 1, at: 2 }, syncOn: true })
    expect(h.records()[receivedResetKey]).toBeUndefined()
  } finally { await h.dispose() }
})

for (const operation of ["session.remove", "local.remove", "notice.publish"]) for (const mode of ["before", "ignore"] satisfies Fault[]) {
  test(`receive restart boundary ${operation} ${mode}`, async () => {
    const h = clearFixture(accountSeed(true), sharedSync({ "s:meta": { v: 1, reset: true, id: "reset", created: 1 } }))
    h.seedSession({ paused: true, [`skips:${account}`]: {} })
    try {
      await h.lifecycle().ready(); const owner = h.lifecycle().owner(); check(owner, "receiving owner"); await owner.ready()
      const before = h.records()
      h.fault.set(operation, mode)
      const result = await owner.receiveSyncReset()
      expect(result.kind, "interrupted reception remains held").toBe("reset-held")
      expect(h.records()[receivedResetKey], "restart evidence retained").toBeDefined()
      await h.restart()
      const resumed = h.lifecycle().owner(); check(resumed, "restarted real receiving owner"); await resumed.ready()
      expect(h.records().device).toEqual(before.device)
      expect(h.records().unclaimed).toEqual(before.unclaimed)
      expect(Object.keys(h.records()).filter(name => /^(doc:|cache:|progress:)/.test(name))).toEqual([])
      expect(h.session()).toEqual({ paused: true })
    } finally { await h.dispose() }
  })
}
