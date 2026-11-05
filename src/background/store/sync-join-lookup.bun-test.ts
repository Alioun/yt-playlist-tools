import { beforeAll, describe, expect, test } from "bun:test"
import { beginSyncedChoicesLookup, type SyncedChoicesResult } from "./sync-join-lookup"
import { createLookupFixture, deferred, drainLookup, lookupSnapshot, runSyncJoinLookupFixture } from "../../../tools/fixtures/sync-join-lookup/run"

const features = {
  autoAdd: true,
  shortcuts: true,
  quickSave: false,
  queueButton: false,
  watchButton: false,
  cardMenu: false,
  browserMenu: true,
  musicActions: true,
  musicKeys: false,
  anyTabKeys: false,
  gather: true,
  musicSection: false
}
function found(historyId = "synthetic-history-a", settingsGeneration = "settings-a"): Extract<SyncedChoicesResult, { kind: "found" }> {
  return { kind: "found", historyId, settingsGeneration, features }
}

describe("synthetic first-run command", () => {
  let report: Awaited<ReturnType<typeof runSyncJoinLookupFixture>>
  beforeAll(async () => {
    report = await runSyncJoinLookupFixture()
  })

  const expected: [string, SyncedChoicesResult, number][] = [
    ["complete", found(), 1],
    ["detached-later-read", found(), 1],
    ["delivery-before-deadline", found(), 2],
    ["change-during-get-and-burst", found("synthetic-history-b", "settings-b"), 2],
    ["queued-stale-read", found("synthetic-history-c", "settings-c"), 3],
    ["empty-deadline", { kind: "not-found" }, 1],
    ["hung-read-deadline", { kind: "unavailable", reason: "stale" }, 1],
    ["pointer-first", found(), 2],
    ["chunks-first", found(), 2],
    ["reversed-chunks", found(), 1],
    ["missing-chunks", { kind: "unavailable", reason: "incomplete" }, 1],
    ["mismatched-generation-chunks", { kind: "unavailable", reason: "incomplete" }, 1],
    ["embedded-stamp-mismatch", { kind: "unavailable", reason: "invalid" }, 1],
    ["missing-metadata", { kind: "unavailable", reason: "ambiguous-history" }, 1],
    ["orphan-chunks-without-metadata", { kind: "unavailable", reason: "ambiguous-history" }, 1],
    ["unknown-occupancy-without-metadata", { kind: "unavailable", reason: "ambiguous-history" }, 1],
    ["metadata-without-settings", { kind: "unavailable", reason: "incomplete" }, 1],
    ["null-settings", { kind: "unavailable", reason: "incomplete" }, 1],
    ["reset", { kind: "unavailable", reason: "reset" }, 1],
    ["future-metadata", { kind: "update-needed", target: "metadata", version: 2 }, 1],
    ["future-settings", { kind: "update-needed", target: "settings", version: 2 }, 1],
    ["malformed-chunk-json", { kind: "unavailable", reason: "invalid" }, 1],
    ["malformed-settings", { kind: "unavailable", reason: "invalid" }, 1],
    ["deleted-settings", { kind: "unavailable", reason: "invalid" }, 1],
    ["invalid-metadata", { kind: "unavailable", reason: "invalid" }, 1],
    ["non-json-occupancy", { kind: "unavailable", reason: "invalid" }, 1],
    ["over-budget-readable", found(), 1],
    ["over-budget-item-readable", found(), 1],
    ["cancel-before-read", { kind: "cancelled" }, 1],
    ["cancel-at-deadline", { kind: "cancelled" }, 1],
    ["deadline-before-cancel", { kind: "not-found" }, 1],
    ["lost-lifetime", { kind: "unavailable", reason: "stale" }, 1],
    ["completion-at-deadline", { kind: "unavailable", reason: "stale" }, 1],
    ["change-invalidates-empty-at-deadline", { kind: "unavailable", reason: "stale" }, 2],
    ["replaced-lookup", { kind: "cancelled" }, 1],
    ["restart-explicit-lookup", found("synthetic-history-restart", "settings-restart"), 1]
  ]
  test.each(expected)("%s returns the complete observation and releases its resources", (name, result, reads) => {
    expect(report.cases.find(observation => observation.name === name)).toEqual({
      name,
      result,
      effects: {
        reads,
        subscriptions: 1,
        unsubscriptions: 1,
        delays: [10_000],
        timerCancellations: 1,
        maxConcurrentReads: 1,
        forbidden: [],
        activeListeners: 0,
        activeTimers: 0
      }
    })
  })
  test("the actual consumer discards its From sync draft without persisting choices or resuming", () => {
    expect(report.cases).toHaveLength(expected.length)
    expect(report.firstRun).toEqual({
      displayed: { kind: "draft", label: "From sync", features },
      afterClose: null,
      saved: { local: {}, session: {} },
      beforeExplicitLookup: {
        reads: 0,
        subscriptions: 0,
        unsubscriptions: 0,
        delays: [],
        timerCancellations: 0,
        maxConcurrentReads: 0,
        forbidden: [],
        activeListeners: 0,
        activeTimers: 0
      },
      afterExplicitLookup: found("synthetic-history-restart", "settings-restart")
    })
    expect(report.replacement).toEqual({
      result: found("synthetic-history-d", "settings-d"),
      effects: {
        reads: 2,
        subscriptions: 2,
        unsubscriptions: 2,
        delays: [10_000, 10_000],
        timerCancellations: 2,
        maxConcurrentReads: 2,
        forbidden: [],
        activeListeners: 0,
        activeTimers: 0
      }
    })
    expect([report.writes, report.join, report.agree, report.productionRoute]).toEqual([0, "not-implemented", "not-implemented", "not-installed"])
  })
})

test("returned switches are detached, frozen and limited to canonical feature choices", async () => {
  const source = lookupSnapshot()
  const sourceBefore = JSON.stringify(source)
  const fixture = createLookupFixture(source)
  const result = await fixture.begin().result
  expect(result).toEqual(found())
  if (result.kind !== "found") throw Error("Expected complete synced choices")
  expect(Object.isFrozen(result.features)).toBe(true)
  expect(Reflect.set(result.features, "autoAdd", false)).toBe(false)
  expect(JSON.stringify(source)).toBe(sourceBefore)
  expect(await fixture.begin().result).toEqual(found())
})

test("subscription is attached before get, including synchronous delivery during attachment", async () => {
  const fixture = createLookupFixture()
  const events: string[] = []
  const get = fixture.deps.sync.get
  const subscribe = fixture.deps.sync.subscribe
  fixture.deps.sync.subscribe = changed => {
    events.push("subscribe")
    const stop = subscribe(changed)
    fixture.change(lookupSnapshot())
    return stop
  }
  fixture.deps.sync.get = () => {
    events.push("get")
    return get()
  }
  expect(await fixture.begin().result).toEqual(found())
  expect(events).toEqual(["subscribe", "get"])
})

test("unusable delivery can become complete before the original deadline without another timer", async () => {
  const fixture = createLookupFixture({ "s:meta": { v: 2, id: "synthetic-future", created: 0 } })
  const lookup = fixture.begin()
  let completions = 0
  void lookup.result.then(() => completions++)
  await drainLookup()
  expect(completions).toBe(0)
  fixture.advance(9_000)
  fixture.change(lookupSnapshot())
  expect(await lookup.result).toEqual(found())
  fixture.savedDeadline()
  fixture.savedChange()
  await drainLookup()
  expect(completions).toBe(1)
  expect(fixture.effects.delays).toEqual([10_000])
})

test("event bursts cannot extend the deadline or preserve an invalidated empty observation", async () => {
  const fixture = createLookupFixture()
  const lookup = fixture.begin()
  await drainLookup()
  fixture.advance(9_999)
  fixture.change()
  fixture.change()
  await drainLookup()
  fixture.advance(1)
  expect(await lookup.result).toEqual({ kind: "not-found" })
  expect(fixture.effects.reads).toBe(3)
  expect(fixture.effects.delays).toEqual([10_000])
})

test("stale read rejection yields to a coalesced fresh snapshot", async () => {
  const fixture = createLookupFixture()
  const pending = deferred<Readonly<Record<string, unknown>>>()
  fixture.queuedReads.push(() => pending.promise)
  const lookup = fixture.begin()
  fixture.change(lookupSnapshot())
  pending.reject({ synthetic: "original stale rejection" })
  expect(await lookup.result).toEqual(found())
  expect(fixture.effects.reads).toBe(2)
})

test.each(["get", "subscribe", "now", "after"] as const)("%s exceptions keep the exact original local error", async port => {
  const fixture = createLookupFixture()
  const error = { synthetic: port, diagnostic: "local only" }
  if (port === "get") fixture.deps.sync.get = () => Promise.reject(error)
  if (port === "subscribe")
    fixture.deps.sync.subscribe = () => {
      throw error
    }
  if (port === "now")
    fixture.deps.clock.now = () => {
      throw error
    }
  if (port === "after")
    fixture.deps.clock.after = () => {
      throw error
    }
  const result = await fixture.begin().result
  expect(result).toEqual({ kind: "failed", stage: port === "get" ? "read" : port === "subscribe" ? "subscribe" : "clock", error })
  if (result.kind !== "failed") throw Error("Expected original port failure")
  expect(result.error).toBe(error)
  expect(fixture.observation().activeListeners).toBe(0)
  expect(fixture.observation().activeTimers).toBe(0)
})

test("synchronous read failure and later clock failure release the installed resources", async () => {
  const error = { synthetic: "synchronous read failure" }
  const fixture = createLookupFixture()
  fixture.deps.sync.get = () => {
    throw error
  }
  expect(await fixture.begin().result).toEqual({ kind: "failed", stage: "read", error })
  expect(fixture.observation()).toMatchObject({ unsubscriptions: 1, timerCancellations: 1, activeListeners: 0, activeTimers: 0 })
  const clockFailure = createLookupFixture()
  const lookup = clockFailure.begin()
  await drainLookup()
  clockFailure.deps.clock.now = () => {
    throw error
  }
  clockFailure.change(lookupSnapshot())
  expect(await lookup.result).toEqual({ kind: "failed", stage: "clock", error })
  expect(clockFailure.observation()).toMatchObject({ reads: 1, unsubscriptions: 1, timerCancellations: 1, activeListeners: 0, activeTimers: 0 })
})

test("cancellation suppresses a late rejection and retained callbacks exactly once", async () => {
  const fixture = createLookupFixture()
  const pending = deferred<Readonly<Record<string, unknown>>>()
  fixture.queuedReads.push(() => pending.promise)
  const lookup = fixture.begin()
  let completions = 0
  void lookup.result.then(() => completions++)
  lookup.cancel()
  pending.reject({ synthetic: "cancelled read" })
  fixture.savedChange()
  fixture.savedDeadline()
  lookup.cancel()
  await drainLookup()
  expect(await lookup.result).toEqual({ kind: "cancelled" })
  expect(completions).toBe(1)
  expect(fixture.observation()).toMatchObject({ reads: 1, unsubscriptions: 1, timerCancellations: 1, activeListeners: 0, activeTimers: 0 })
})

test("lost caller lifetime before subscription prevents reads and still cancels the deadline", async () => {
  const fixture = createLookupFixture()
  fixture.loseLifetime()
  expect(await fixture.begin().result).toEqual({ kind: "unavailable", reason: "stale" })
  expect(fixture.observation()).toEqual({
    reads: 0,
    subscriptions: 0,
    unsubscriptions: 0,
    delays: [10_000],
    timerCancellations: 1,
    maxConcurrentReads: 0,
    forbidden: [],
    activeListeners: 0,
    activeTimers: 0
  })
})

test("the deadline covers time spent installing the subscription", async () => {
  const fixture = createLookupFixture(lookupSnapshot())
  const subscribe = fixture.deps.sync.subscribe
  fixture.deps.sync.subscribe = changed => {
    const stop = subscribe(changed)
    fixture.advance(10_000)
    return stop
  }
  expect(await fixture.begin().result).toEqual({ kind: "unavailable", reason: "stale" })
  expect(fixture.observation()).toMatchObject({ reads: 0, subscriptions: 1, unsubscriptions: 1, timerCancellations: 1, activeListeners: 0, activeTimers: 0 })
})

test("the narrow port signature requires no mutation or native authority", async () => {
  const result = beginSyncedChoicesLookup({
    sync: { get: async () => lookupSnapshot(), subscribe: () => () => {} },
    clock: { now: () => 0, after: () => () => {} },
    isCurrent: () => true
  })
  expect(await result.result).toEqual(found())
})

test("malformed boundary values are rejected without invoking getters", async () => {
  let getterCalls = 0
  const raw = Object.defineProperty({}, "s:meta", {
    enumerable: true,
    get() {
      getterCalls++
      throw Error("must not execute")
    }
  })
  const fixture = createLookupFixture(raw)
  const lookup = fixture.begin()
  await drainLookup()
  fixture.advance(10_000)
  expect(await lookup.result).toEqual({ kind: "unavailable", reason: "invalid" })
  expect(getterCalls).toBe(0)
})

test.each(["subscribe", "clock"] as const)("%s teardown errors remain local and do not skip other cleanup", async stage => {
  const fixture = createLookupFixture(lookupSnapshot())
  const error = { synthetic: "cleanup", stage }
  if (stage === "subscribe") {
    const subscribe = fixture.deps.sync.subscribe
    fixture.deps.sync.subscribe = changed => {
      const stop = subscribe(changed)
      return () => {
        stop()
        throw error
      }
    }
  } else {
    const after = fixture.deps.clock.after
    fixture.deps.clock.after = (milliseconds, run) => {
      const stop = after(milliseconds, run)
      return () => {
        stop()
        throw error
      }
    }
  }
  expect(await fixture.begin().result).toEqual({ kind: "failed", stage, error })
  expect(fixture.observation()).toMatchObject({ unsubscriptions: 1, timerCancellations: 1, activeListeners: 0, activeTimers: 0 })
})

test("an original read failure survives a secondary teardown failure", async () => {
  const fixture = createLookupFixture()
  const error = { synthetic: "read" }
  fixture.deps.sync.get = () => Promise.reject(error)
  const subscribe = fixture.deps.sync.subscribe
  fixture.deps.sync.subscribe = changed => {
    const stop = subscribe(changed)
    return () => {
      stop()
      throw Error("secondary cleanup failure")
    }
  }
  expect(await fixture.begin().result).toEqual({ kind: "failed", stage: "read", error })
  expect(fixture.effects.timerCancellations).toBe(1)
})
