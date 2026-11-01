import { expect, test } from "bun:test"
import { createStoreLifecycle, clearMarkerKey } from "./store-lifecycle"
import { clearFixture } from "../../../tools/fixtures/clear-all/harness"
import { createLifecycleHarness, lifecycleSeeds, openLifecycle, reopen, runDeviceLifecycle, settingsOrigin, summarize, unknownWindowOrigin, unticked } from "../../../tools/fixtures/device-lifecycle/run"

function deferred() {
  let resolve = () => {}, reject = (_: unknown) => {}
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

test("actual device lifecycle command clears every seed, fault, crash boundary and race", async () => {
  const result = await runDeviceLifecycle()
  expect(result.observations).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "fresh-readiness-duplicates-and-listener" }),
    expect.objectContaining({ id: "superseded-bootstrap-readiness" }),
    expect.objectContaining({ id: "throwing-inventory-getter" })
  ]))
}, 60000)

test("fence starts owner disposal and producer quiescence together before either settles", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current())
  const deps = h.deps(), dispose = deferred(), quiesce = deferred(), order: string[] = []
  const supervisor = createStoreLifecycle({ ...deps,
    startOwner() {
      const owner = deps.startOwner()
      return { ...owner, async dispose() { order.push("dispose"); await dispose.promise; await owner.dispose() } }
    },
    producers: { async quiesce() { order.push("quiesce"); await quiesce.promise; await deps.producers.quiesce() } } })
  await supervisor.ready()
  const pending = supervisor.clearAll(settingsOrigin, unticked)
  expect(order).toEqual(["dispose", "quiesce"])
  expect(supervisor.owner()).toBeUndefined()
  expect(supervisor.state()).toEqual({ kind: "clearing" })
  quiesce.resolve()
  for (let turn = 0; turn < 20; turn++) await Promise.resolve()
  expect(h.calls.some(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set")).toBe(false)
  dispose.resolve()
  expect((await pending).kind).toBe("cleared")
  expect(h.stores()).toEqual({ local: { schema: 1 }, session: {}, database: "absent" })
  await supervisor.dispose()
})

test("a rejected or malformed marker read holds startup without an owner, and Clear all still admits", async () => {
  const rejected = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "local.get", occurrence: 1, mode: "reject" }] })
  const held = await openLifecycle(rejected)
  expect(held.started).toEqual({ kind: "blocked", reason: "marker-read-failed", read: { kind: "rejected", error: { name: "LifecycleFault", message: "Synthetic lifecycle fault" } } })
  expect(held.supervisor.owner()).toBeUndefined()
  expect(rejected.ledger.ownersStarted).toBe(0)
  expect((await held.supervisor.clearAll(unknownWindowOrigin, unticked)).kind).toBe("cleared")
  await held.supervisor.dispose()

  const h = createLifecycleHarness(lifecycleSeeds.current()), deps = h.deps()
  const invalid = createStoreLifecycle({ ...deps, local: { ...deps.local, get: () => Promise.resolve(JSON.parse("null")) } })
  expect(summarize(await invalid.ready())).toEqual({ kind: "blocked", reason: "marker-read-failed", read: { kind: "invalid" } })
  expect(h.ledger.ownersStarted).toBe(0)
  await invalid.dispose()
})

test("any present marker holds restart, including a newer marker beside credential names", async () => {
  const opened = await reopen(lifecycleSeeds.credentialsMarker())
  expect(opened.started).toEqual({ kind: "blocked", reason: "clear-pending" })
  expect(opened.h.supervisorReads).toEqual([[clearMarkerKey]])
  expect(opened.h.ledger.ownersStarted).toBe(0)
  const result = await opened.supervisor.clearAll(settingsOrigin, unticked)
  if (result.kind !== "cleared") throw Error("Marker store did not clear")
  expect(result.effects.filter(effect => effect.effect === "local-remove").map(effect => "count" in effect ? effect.count : 0)).toEqual([32, 12])
  expect(opened.h.supervisorReads).toEqual([[clearMarkerKey], [clearMarkerKey]])
  expect(opened.h.ledger.credentialReads).toBe(0)
  await opened.supervisor.dispose()
})

test("arguments are validated from a detached copy and accessors are never invoked", async () => {
  const opened = await reopen(lifecycleSeeds.current())
  let reads = 0
  const accessor = { kind: "ui", page: "settings", get origin() { reads++; return { kind: "ui", windowId: 1, incognito: false } } }
  // @ts-expect-error An accessor-bearing origin is untrusted input.
  expect(await opened.supervisor.clearAll(accessor, unticked)).toEqual({ kind: "unavailable", reason: "invalid-origin" })
  expect(reads).toBe(0)
  const origin = { kind: "ui" as const, page: "settings" as const, origin: { kind: "ui" as const, windowId: 1, incognito: false } }
  const options = { alsoSynced: false }
  const pending = opened.supervisor.clearAll(origin, options)
  origin.origin.windowId = -1
  options.alsoSynced = true
  expect((await pending).kind).toBe("cleared")
  expect(opened.h.ledger.syncCalls).toBe(0)
  await opened.supervisor.dispose()
})

test("an owner factory failure after confirmed erasure reports erasure separately and stays blocked", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.credentialsMarker()), deps = h.deps(), failure = Error("Synthetic factory failure")
  let starts = 0
  const supervisor = createStoreLifecycle({ ...deps, startOwner() { starts++; throw failure } })
  await supervisor.ready()
  const result = await supervisor.clearAll(settingsOrigin, unticked)
  expect(result).toMatchObject({ kind: "cleared", next: "first-run", readiness: { kind: "rejected", error: failure } })
  expect(supervisor.state()).toEqual({ kind: "blocked", reason: "owner-start-failed", error: failure })
  expect(supervisor.owner()).toBeUndefined()
  expect(h.stores()).toEqual({ local: {}, session: {}, database: "absent" })
  expect(starts).toBe(1)
  await supervisor.dispose()
})

test("disposal is stable, blocks admission and drops subscriptions", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current())
  const supervisor = createStoreLifecycle(h.deps()), events: unknown[] = []
  supervisor.subscribe(event => { events.push(event) })
  await supervisor.ready()
  const first = supervisor.dispose()
  expect(supervisor.dispose()).toBe(first)
  await first
  expect(h.ledger.liveOwners).toBe(0)
  expect(supervisor.state()).toEqual({ kind: "disposed" })
  expect(await supervisor.clearAll(settingsOrigin, unticked)).toEqual({ kind: "unavailable", reason: "disposed" })
  supervisor.subscribe(event => { events.push(event) })()
  expect(events).toEqual([])
})

test("a missing key-name provider never becomes an empty inventory", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current(), { names: { local: false, session: true } })
  const opened = await openLifecycle(h)
  const result = await opened.supervisor.clearAll(settingsOrigin, unticked)
  expect(result).toMatchObject({ kind: "unconfirmed", stage: "local", inventory: { kind: "unavailable" } })
  expect(Object.hasOwn(h.stores().local, clearMarkerKey)).toBe(true)
  expect(h.stores().local.device).toEqual(lifecycleSeeds.current().local.device)
  expect(summarize(opened.supervisor.state())).toMatchObject({ kind: "blocked", reason: "clear-incomplete" })
  await opened.supervisor.dispose()
})

const malformedMarkerReads: readonly [string, () => unknown][] = [
  ["empty array", () => []],
  ["array with a marker", () => Object.assign([], { [clearMarkerKey]: null })],
  ["date", () => new Date(0)],
  ["map", () => new Map()],
  ["custom prototype", () => Object.create({ inherited: true })],
  ["unexpected name", () => ({ device: null })],
  ["symbol name", () => ({ [Symbol("unexpected")]: true })],
  ["throwing proxy", () => new Proxy({}, { getPrototypeOf() { throw Error("Synthetic boundary failure") } })]
]
for (const [label, response] of malformedMarkerReads) test(`malformed named marker read holds startup: ${label}`, async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()), deps = h.deps()
  let first = true
  const supervisor = createStoreLifecycle({ ...deps, local: { ...deps.local,
    // @ts-expect-error A malformed port response crosses the runtime boundary.
    get(keys) { if (first) { first = false; return Promise.resolve(response()) } return deps.local.get(keys) }
  } })
  const observed = summarize(await supervisor.ready()), starts = h.ledger.ownersStarted
  const cleared = await supervisor.clearAll(unknownWindowOrigin, unticked)
  await supervisor.dispose()
  expect(observed).toEqual({ kind: "blocked", reason: "marker-read-failed", read: { kind: "invalid" } })
  expect(starts).toBe(0)
  expect(cleared.kind).toBe("cleared")
})

test("duplicates share the clear through actual fresh readiness and a synchronous cleared listener", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()), opened = await openLifecycle(h)
  h.holdNext("owner.snapshot")
  const arrived = h.arrival("owner.snapshot")
  let reentered: ReturnType<typeof opened.supervisor.clearAll> | undefined
  let events = 0
  opened.supervisor.subscribe(() => {
    if (++events === 1) reentered = opened.supervisor.clearAll(settingsOrigin, unticked)
  })
  const first = opened.supervisor.clearAll(settingsOrigin, unticked)
  await arrived
  const duplicate = opened.supervisor.clearAll(unknownWindowOrigin, unticked)
  const during = summarize(opened.supervisor.state()), exposed = opened.supervisor.owner()
  const markerWrites = h.calls.filter(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set").length
  h.release("owner.snapshot")
  await Promise.all([first, duplicate, reentered])
  await opened.supervisor.dispose()
  expect(duplicate).toBe(first)
  expect(reentered).toBe(first)
  expect(during).toEqual({ kind: "clearing" })
  expect(exposed).toBeUndefined()
  expect(markerWrites).toBe(1)
  expect(h.ledger.ownersStarted).toBe(2)
  expect(h.ledger.exclusionViolations).toBe(0)
})

test("disposal during actual fresh readiness drains the fresh owner and never reactivates it", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()), opened = await openLifecycle(h)
  h.holdNext("owner.snapshot")
  const arrived = h.arrival("owner.snapshot")
  const clear = opened.supervisor.clearAll(settingsOrigin, unticked)
  await arrived
  const disposed = opened.supervisor.dispose()
  h.release("owner.snapshot")
  const result = await clear
  await disposed
  expect(result.kind === "cleared" && result.readiness.kind).toBe("disposed")
  expect(opened.supervisor.state()).toEqual({ kind: "disposed" })
  expect(opened.supervisor.owner()).toBeUndefined()
  expect(h.ledger.liveOwners).toBe(0)
  expect(h.ledger.ownersStarted).toBe(2)
})

test("clear completion settles public readiness while the superseded bootstrap read is still held", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.heldRemovalMarker(), { faults: [{ port: "local.get", occurrence: 1, mode: "hold" }] })
  const arrived = h.arrival("local.get"), supervisor = createStoreLifecycle(h.deps())
  let observed: unknown
  const ready = supervisor.ready().then(value => { observed = summarize(value) })
  await arrived
  const result = await supervisor.clearAll(settingsOrigin, unticked)
  const beforeRelease = observed
  h.release("local.get")
  await ready
  await supervisor.dispose()
  expect(result.kind).toBe("cleared")
  expect(beforeRelease).toEqual({ kind: "active" })
  expect(h.ledger.ownersStarted).toBe(1)
})

test("disposal settles readiness without waiting for a superseded bootstrap read", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "local.get", occurrence: 1, mode: "hold" }] })
  const arrived = h.arrival("local.get"), supervisor = createStoreLifecycle(h.deps())
  await arrived
  let disposed = false, observed: unknown
  const ready = supervisor.ready().then(value => { observed = summarize(value) })
  const stop = supervisor.dispose().then(() => { disposed = true })
  for (let turn = 0; turn < 20; turn++) await Promise.resolve()
  const beforeRelease = { disposed, observed }
  h.release("local.get")
  await Promise.all([ready, stop])
  expect(beforeRelease).toEqual({ disposed: true, observed: { kind: "disposed" } })
  expect(h.ledger.ownersStarted).toBe(0)
})

test("a throwing inventory boundary settles the clear and leaves an explicit retry", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.credentialsMarker()), deps = h.deps()
  let broken = true
  const supervisor = createStoreLifecycle({ ...deps, session: { ...deps.session,
    get names() { if (broken) throw Error("Synthetic inventory boundary failure"); return deps.session.names }
  } })
  await supervisor.ready()
  let outcome: unknown
  const pending = supervisor.clearAll(settingsOrigin, unticked).then(value => { outcome = value })
  for (let turn = 0; turn < 80; turn++) await Promise.resolve()
  expect(outcome).toMatchObject({ kind: "unconfirmed", stage: "session", inventory: { kind: "rejected" } })
  await pending
  expect(supervisor.owner()).toBeUndefined()
  expect(h.stores().local[clearMarkerKey]).toEqual({ v: 1, kind: "clear-all" })
  broken = false
  expect((await supervisor.clearAll(settingsOrigin, unticked)).kind).toBe("cleared")
  await supervisor.dispose()
})


test("producer quiescence must settle before the marker even after the owner drains", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()), opened = await openLifecycle(h)
  h.holdNext("producers.quiesce")
  const arrived = h.arrival("producers.quiesce"), pending = opened.supervisor.clearAll(settingsOrigin, unticked)
  await arrived
  for (let turn = 0; turn < 80; turn++) await Promise.resolve()
  const stopped = h.ledger.liveOwners, calls = [...h.calls]
  h.release("producers.quiesce")
  await pending
  await opened.supervisor.dispose()
  expect(stopped).toBe(0)
  expect(calls.some(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set")).toBe(false)
})

test("an unconfirmed final inventory emits no cleared event and acquires no fresh owner", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.credentialsMarker(), { faults: [{ port: "local.names", occurrence: 3, mode: "reject" }] })
  const opened = await openLifecycle(h), events: unknown[] = []
  opened.supervisor.subscribe(event => { events.push(event) })
  const result = await opened.supervisor.clearAll(settingsOrigin, unticked)
  const eventsAtResult = [...events], ownersAtResult = h.ledger.ownersStarted
  h.heal()
  const retry = await opened.supervisor.clearAll(settingsOrigin, unticked)
  await opened.supervisor.dispose()
  expect(result.kind).toBe("unconfirmed")
  expect(eventsAtResult).toEqual([])
  expect(ownersAtResult).toBe(0)
  expect(retry.kind).toBe("cleared")
  expect(events).toEqual([{ kind: "cleared", next: "first-run" }])
})

test("under a newer layout a ticked Clear all clears local data only and never touches synced settings", async () => {
  const h = clearFixture({ schema: 2, future: { keep: true } })
  try {
    const synced = h.shared.records()
    const result = await h.clear({ alsoSynced: true })
    expect(result).toMatchObject({ kind: "cleared", synced: "kept-newer-layout" })
    expect(h.records()).toEqual({ schema: 1 })
    expect(h.session()).toEqual({})
    expect(h.shared.records()).toEqual(synced)
    expect(h.calls.filter(call => call.operation.startsWith("sync."))).toEqual([])
  } finally { await h.dispose() }
})

test("under a supported layout a ticked Clear all still resets synced settings", async () => {
  const h = clearFixture({ schema: 1, device: { id: "starting-fixture", consent: null, syncOn: false } })
  try {
    let result = await h.clear({ alsoSynced: true })
    for (let event = 0; event < 20 && result.kind === "reset-held" && result.result.kind === "deferred"; event++) {
      h.advance(Math.max(5000, result.result.notBefore - h.time()))
      result = await h.clear({ alsoSynced: true })
    }
    expect(result.kind).toBe("cleared")
    expect(result.kind === "cleared" && result.synced).toBe("reset")
    expect(Object.keys(h.shared.records())).toEqual(["s:meta"])
  } finally { await h.dispose() }
})
