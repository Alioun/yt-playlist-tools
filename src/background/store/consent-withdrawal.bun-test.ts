import { expect, test } from "bun:test"
import { readConsentDevice, parseConsentState, withdrawalItems, withdrawalIntentItems, agreementItems } from "./consent-withdrawal"
import { createStoreLifecycle } from "./store-lifecycle"
import { sameSyncJson } from "./sync-write-admission"
import { createLifecycleHarness, lifecycleSeeds, settingsOrigin, unticked, runConsentWithdrawalFaults } from "../../../tools/fixtures/device-lifecycle/run"
import { accepted } from "../../../tools/fixtures/consent-recovery/cases"

const device = { id: "withdrawal-device", consent: { v: 1, at: 10 }, syncOn: false, extension: { kept: true } }
test("withdrawal preserves raw Device omissions and extensions and advances a durable generation", () => {
  const read = readConsentDevice({ schema: 1, device })
  expect(read.kind).toBe("supported")
  if (read.kind !== "supported") throw Error("Missing supported Device")
  const items = withdrawalItems(read)
  if (!items) throw Error("Missing withdrawal")
  expect(items.device).toEqual({ ...device, consent: null })
  expect(items["consent:state"].generation).toBe(1)
  const held = readConsentDevice({ schema: 1, ...items })
  if (held.kind !== "supported") throw Error("Missing withdrawn Device")
  const agreed = agreementItems(held, 10)
  expect(agreed?.device.consent).toEqual({ v: 1, at: 11 })
  expect(agreed?.["consent:state"].generation).toBe(2)
})

test("partial, malformed, newer and exhausted control cannot normalize Device", () => {
  const read = readConsentDevice({ schema: 1, device })
  if (read.kind !== "supported") throw Error("Missing Device")
  const items = withdrawalItems(read)
  if (!items) throw Error("Missing withdrawal")
  expect(readConsentDevice({ schema: 1, device, "consent:state": items["consent:state"] }).kind).toBe("mismatched")
  expect(readConsentDevice({ schema: 2, device }).kind).toBe("newer-layout")
  expect(readConsentDevice({ schema: 1, device, "consent:state": { v: 2 } }).kind).toBe("newer-control")
  const full = { schema: 1, ...items, "consent:state": { ...items["consent:state"], generation: Number.MAX_SAFE_INTEGER } }
  const exhausted = readConsentDevice(full)
  expect(exhausted.kind).toBe("supported")
  if (exhausted.kind === "supported") expect(agreementItems(exhausted, 20)).toBeUndefined()
})

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}
for (const stage of ["observation", "mutation"] as const)
  test(`Clear all supersedes withdrawal during ${stage}`, async () => {
    const h = createLifecycleHarness(lifecycleSeeds.current()),
      deps = h.deps(),
      entered = deferred(),
      gate = deferred()
    if (!deps.consentDevice) throw Error("Missing named consent port")
    const port = deps.consentDevice
    let first = true,
      admitted = false
    const supervisor = createStoreLifecycle({
      ...deps,
      consentDevice: {
        async get(keys) {
          if (admitted && stage === "observation" && first) {
            first = false
            entered.resolve()
            await gate.promise
          }
          return port.get(keys)
        },
        async set(items) {
          if (stage === "mutation") {
            entered.resolve()
            await gate.promise
          }
          await port.set(items)
        }
      }
    })
    await supervisor.ready()
    const seed = readConsentDevice(h.stores().local)
    if (seed.kind !== "supported") throw Error("Missing supported Device")
    admitted = true
    const pending = supervisor.withdrawConsent(settingsOrigin, seed.device.consent)
    expect(supervisor.owner()).toBeUndefined()
    expect(supervisor.withdrawConsent(settingsOrigin, seed.device.consent)).toBe(pending)
    await entered.promise
    const clearing = supervisor.clearAll(settingsOrigin, unticked)
    expect(await pending).toEqual({ kind: "superseded", by: "clear-all" })
    if (stage === "observation") {
      expect((await clearing).kind).toBe("cleared")
      gate.resolve()
    } else {
      for (let turn = 0; turn < 15; turn++) await Promise.resolve()
      expect(h.calls.some(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set")).toBe(false)
      gate.resolve()
      expect((await clearing).kind).toBe("cleared")
    }
    await supervisor.dispose()
    expect(h.stores()).toEqual({ local: { schema: 1 }, session: {}, database: "absent" })
  })

test("withdrawal stops both producers before the first hanging Device read and disposal settles it", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()),
    deps = h.deps(),
    gate = deferred(),
    entered = deferred(),
    order: string[] = []
  let admitted = false
  const supervisor = createStoreLifecycle({
    ...deps,
    startOwner() {
      const owner = deps.startOwner()
      return {
        ...owner,
        dispose() {
          order.push("dispose")
          return owner.dispose()
        }
      }
    },
    producers: {
      quiesce() {
        order.push("quiesce")
        return deps.producers.quiesce()
      }
    },
    consentDevice: {
      async get() {
        if (!admitted) return {}
        order.push("read")
        entered.resolve()
        await gate.promise
        return {}
      },
      async set() {
        throw Error("Unexpected write")
      }
    }
  })
  await supervisor.ready()
  admitted = true
  const withdrawal = supervisor.withdrawConsent(settingsOrigin, { v: 1, at: 1 })
  await entered.promise
  expect(order).toEqual(["dispose", "quiesce", "read"])
  await supervisor.dispose()
  expect(await withdrawal).toEqual({ kind: "superseded", by: "dispose" })
  gate.resolve()
})

for (const mode of ["exact", "applied-reject", "unchanged-reject", "partial", "read-failed"] as const)
  test(`withdrawal reports exact persistence separately, ${mode}`, async () => {
    const h = createLifecycleHarness(lifecycleSeeds.current()),
      deps = h.deps(),
      original = deps.consentDevice
    if (!original) throw Error("Missing consent port")
    let written = false
    const supervisor = createStoreLifecycle({
      ...deps,
      consentDevice: {
        get(keys) {
          if (written && mode === "read-failed") return Promise.reject(Error("Synthetic readback failure"))
          return original.get(keys)
        },
        async set(items) {
          if (!("device" in items)) return original.set(items)
          written = true
          if (mode === "unchanged-reject") throw Error("Synthetic unchanged rejection")
          if (mode === "partial") {
            await original.set(items)
            return original.set({ ...items, device: { ...items.device, consent: { v: 1, at: 1 } } })
          }
          await original.set(items)
          if (mode === "applied-reject") throw Error("Synthetic applied rejection")
        }
      }
    })
    await supervisor.ready()
    const read = readConsentDevice(h.stores().local)
    if (read.kind !== "supported") throw Error("Missing Device")
    const before = h.stores(),
      events: unknown[] = []
    supervisor.subscribe(event => {
      events.push(event)
    })
    const result = await supervisor.withdrawConsent(settingsOrigin, read.device.consent)
    expect(result.kind).toBe(mode === "exact" || mode === "applied-reject" ? "withdrawn" : mode === "unchanged-reject" ? "failed" : "unconfirmed")
    if (result.kind === "withdrawn") {
      expect(supervisor.state().kind).toBe("held")
      expect(result.write.kind).toBe(mode === "applied-reject" ? "rejected" : "resolved")
      const after = h.stores(),
        projected = { ...after.local }
      projected.device = before.local.device!
      delete projected["consent:state"]
      expect({ ...after, local: projected }).toEqual(before)
    } else {
      expect(events).toEqual([])
      expect(supervisor.owner()).toBeUndefined()
    }
    expect(h.ledger.syncCalls).toBe(0)
    await supervisor.dispose()
  })

test("repeated withdrawal and agreement advance generation while preserving the first historical basis", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()),
    supervisor = createStoreLifecycle(h.deps())
  await supervisor.ready()
  const first = readConsentDevice(h.stores().local)
  if (first.kind !== "supported" || !first.device.consent) throw Error("Missing Device")
  expect((await supervisor.withdrawConsent(settingsOrigin, first.device.consent)).kind).toBe("withdrawn")
  for (let round = 0; round < 2; round++) {
    const owner = supervisor.owner()
    if (!owner) throw Error("Missing held owner")
    const review = await owner.readAgreement({ kind: "ui", windowId: 1, incognito: false })
    if (review.kind !== "review") throw Error("Missing held agreement")
    expect((await owner.agree({ kind: "ui", windowId: 1, incognito: false }, { review: review.review, displayedVersion: 1, choice: { kind: "disclosure" }, access: new Promise(() => {}) })).kind).toBe(
      "committed"
    )
    const current = readConsentDevice(h.stores().local)
    if (current.kind !== "supported") throw Error("Missing current Device")
    expect((await supervisor.withdrawConsent(settingsOrigin, current.device.consent)).kind).toBe("withdrawn")
  }
  const final = readConsentDevice(h.stores().local)
  if (final.kind !== "supported") throw Error("Missing final Device")
  expect(final.control?.generation).toBe(5)
  expect(final.control?.legacyBasis).toEqual({ kind: "observed", agreement: first.device.consent })
  await supervisor.dispose()
})

test("a failed owner stop writes no consent and an explicit Clear all retries its stop", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "owner.dispose", occurrence: 1, mode: "reject" }] })
  const supervisor = createStoreLifecycle(h.deps())
  await supervisor.ready()
  const before = h.stores(),
    read = readConsentDevice(before.local)
  if (read.kind !== "supported") throw Error("Missing Device")
  expect(await supervisor.withdrawConsent(settingsOrigin, read.device.consent)).toMatchObject({ kind: "failed", stage: "stop", shutdown: { kind: "unconfirmed" } })
  expect(h.stores()).toEqual(before)
  h.heal()
  expect((await supervisor.clearAll(settingsOrigin, unticked)).kind).toBe("cleared")
  await supervisor.dispose()
})

test("a first Device-only final effect retains confirmed withdrawal intent across a real restart", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()),
    deps = h.deps(),
    port = deps.consentDevice
  if (!port) throw Error("Missing consent port")
  const writes: string[][] = [],
    confirmations: unknown[] = []
  const supervisor = createStoreLifecycle({
    ...deps,
    consentDevice: {
      async get(keys) {
        const records = await port.get(keys)
        confirmations.push(records)
        return records
      },
      async set(items) {
        writes.push(Object.keys(items))
        if ("device" in items) {
          expect(confirmations.some(records => typeof records === "object" && records !== null && "consent:state" in records && JSON.stringify(records).includes('"withdrawing"'))).toBe(true)
          const current = await port.get(["schema", "device", "consent:state"])
          const control = parseConsentState(current["consent:state"])
          if (!control) throw Error("Missing confirmed intent")
          await port.set({ ...items, "consent:state": control })
        } else await port.set(items)
      }
    }
  })
  await supervisor.ready()
  const before = h.stores(),
    parsed = readConsentDevice(before.local)
  if (parsed.kind !== "supported") throw Error("Missing Device")
  const result = await supervisor.withdrawConsent(settingsOrigin, parsed.device.consent)
  expect(writes[0]).toEqual(["consent:state"])
  expect(result.kind).toBe("unconfirmed")
  await supervisor.dispose()
  const persisted = h.stores(),
    restart = createLifecycleHarness(persisted),
    next = createStoreLifecycle(restart.deps())
  await next.ready()
  expect(next.state().kind).toBe("held")
  expect(restart.stores()).toEqual(persisted)
  expect(restart.ledger.hostCalls).toBe(0)
  await next.dispose()
})

test("actual intent and final fault histories hold at every serialized restart boundary", async () => {
  const observations = await runConsentWithdrawalFaults()
  expect(observations.cases).toBe(20)
  expect(observations.restartCount).toBeGreaterThan(200)
})

for (const target of ["initial-read", "baseline-read", "intent-write", "intent-readback", "final-baseline", "final-write", "final-readback"] as const) {
  for (const action of ["clear-all", "dispose"] as const)
    test(`${action} supersedes a hanging ${target} without a later effect`, async () => {
      const h = createLifecycleHarness(lifecycleSeeds.current()),
        deps = h.deps(),
        port = deps.consentDevice,
        entered = deferred(),
        gate = deferred()
      if (!port) throw Error("Missing consent port")
      let reads = 0,
        writes = 0,
        erased = false,
        disposed = false,
        admitted = false
      const targetRead = target === "initial-read" ? 1 : target === "baseline-read" ? 2 : target === "intent-readback" ? 3 : target === "final-baseline" ? 4 : target === "final-readback" ? 5 : 0
      const targetWrite = target === "intent-write" ? 1 : target === "final-write" ? 2 : 0
      const supervisor = createStoreLifecycle({
        ...deps,
        consentDevice: {
          async get(keys) {
            const records = await port.get(keys)
            if (admitted && ++reads === targetRead) {
              entered.resolve()
              await gate.promise
            }
            return records
          },
          async set(items) {
            if (++writes === targetWrite) {
              entered.resolve()
              await gate.promise
            }
            expect(erased).toBe(false)
            await port.set(items)
          }
        }
      })
      await supervisor.ready()
      admitted = true
      const read = readConsentDevice(h.stores().local)
      if (read.kind !== "supported") throw Error("Missing Device")
      const pending = supervisor.withdrawConsent(settingsOrigin, read.device.consent)
      expect(supervisor.withdrawConsent(settingsOrigin, read.device.consent)).toBe(pending)
      expect(await supervisor.withdrawConsent(settingsOrigin, { v: 1, at: 999 })).toEqual({ kind: "unavailable", reason: "withdrawal-in-progress" })
      await entered.promise
      const invoked = writes
      const completion =
        action === "clear-all"
          ? supervisor.clearAll(settingsOrigin, unticked).then(result => {
              expect(result.kind).toBe("cleared")
              erased = true
            })
          : supervisor.dispose().then(() => {
              disposed = true
            })
      expect(await pending).toEqual({ kind: "superseded", by: action })
      if (targetWrite) {
        for (let turn = 0; turn < 20; turn++) await Promise.resolve()
        expect(erased).toBe(false)
        expect(disposed).toBe(false)
        expect(h.calls.some(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set")).toBe(false)
        gate.resolve()
        await completion
      } else {
        await completion
        gate.resolve()
      }
      await supervisor.dispose()
      for (let turn = 0; turn < 20; turn++) await Promise.resolve()
      expect(writes).toBe(invoked)
      if (action === "clear-all") expect(h.stores()).toEqual({ local: { schema: 1 }, session: {}, database: "absent" })
      expect(h.ledger.liveOwners).toBe(0)
      expect(h.ledger.exclusionViolations).toBe(0)
    })
}

test("a confirmed withdrawal event can reenter Clear all without reviving either consent record", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()),
    supervisor = createStoreLifecycle(h.deps())
  await supervisor.ready()
  const read = readConsentDevice(h.stores().local)
  if (read.kind !== "supported") throw Error("Missing Device")
  let clearing: ReturnType<typeof supervisor.clearAll> | undefined
  supervisor.subscribe(event => {
    if (event.kind === "consent-withdrawn") clearing = supervisor.clearAll(settingsOrigin, unticked)
  })
  const result = await supervisor.withdrawConsent(settingsOrigin, read.device.consent)
  expect(result).toEqual({ kind: "superseded", by: "clear-all" })
  expect((await clearing)?.kind).toBe("cleared")
  await supervisor.dispose()
  expect(h.stores()).toEqual({ local: { schema: 1 }, session: {}, database: "absent" })
  expect(h.ledger.exclusionViolations).toBe(0)
})

for (const deviceApplied of [false, true])
  test(`explicit retry completes the same intent with ${deviceApplied ? "null" : "original"} Device consent`, async () => {
    const h = createLifecycleHarness(lifecycleSeeds.current()),
      deps = h.deps(),
      port = deps.consentDevice
    if (!port) throw Error("Missing port")
    const supervisor = createStoreLifecycle({
      ...deps,
      consentDevice: {
        get: keys => port.get(keys),
        async set(items) {
          if (!("device" in items)) return port.set(items)
          if (deviceApplied) {
            const read = readConsentDevice(await port.get(["schema", "device", "consent:state"]))
            if (read.kind !== "supported" || !read.control) throw Error("Missing intent")
            await port.set({ device: items.device, "consent:state": read.control })
          }
          throw Error("Synthetic incomplete final write")
        }
      }
    })
    await supervisor.ready()
    const original = readConsentDevice(h.stores().local)
    if (original.kind !== "supported" || !original.device.consent) throw Error("Missing original agreement")
    expect((await supervisor.withdrawConsent(settingsOrigin, original.device.consent)).kind).toBe(deviceApplied ? "unconfirmed" : "failed")
    await supervisor.dispose()
    const seed = h.stores(),
      intent = readConsentDevice(seed.local)
    if (intent.kind !== "supported" || intent.control?.state.kind !== "withdrawing") throw Error("Missing persisted intent")
    expect(agreementItems(intent, 1000)).toBeUndefined()
    expect(sameSyncJson(withdrawalIntentItems(intent)?.["consent:state"] ?? null, intent.control)).toBe(true)
    const restarted = createLifecycleHarness(seed),
      next = createStoreLifecycle(restarted.deps())
    await next.ready()
    expect(next.state().kind).toBe("held")
    const owner = next.owner()
    if (!owner) throw Error("Missing held owner")
    expect(await owner.readAgreement({ kind: "ui", windowId: 1, incognito: false })).toEqual({ kind: "unavailable", reason: "consent-held" })
    expect(restarted.stores()).toEqual(seed)
    expect(restarted.calls.filter(call => Array.isArray(call) && call.includes("local.set"))).toEqual([])
    const result = await next.withdrawConsent(settingsOrigin, original.device.consent)
    expect(result.kind).toBe("withdrawn")
    const final = readConsentDevice(restarted.stores().local)
    if (final.kind !== "supported") throw Error("Invalid final pair")
    expect(final.control?.state.kind).toBe("withdrawn")
    expect(final.control?.generation).toBe(intent.control.generation)
    expect(final.device.consent).toBeNull()
    await next.dispose()
  })

const ui = { kind: "ui", windowId: 1, incognito: false } as const
async function agreeWhileHeld(owner: ReturnType<typeof createStoreLifecycle>["owner"] extends () => infer O ? NonNullable<O> : never) {
  const review = await owner.readAgreement(ui)
  if (review.kind !== "review" || review.presentation.kind !== "held") throw Error("Missing held agreement")
  expect((await owner.agree(ui, { review: review.review, displayedVersion: 1, choice: { kind: "disclosure" }, access: new Promise(() => {}) })).kind).toBe("committed")
}

test("after agreeing again while held, one activation replaces the held owner with one that runs, and repeat or concurrent calls start no other (R167)", async () => {
  const h = createLifecycleHarness(lifecycleSeeds.current()),
    supervisor = createStoreLifecycle(h.deps())
  await supervisor.ready()
  const first = readConsentDevice(h.stores().local)
  if (first.kind !== "supported" || !first.device.consent) throw Error("Missing Device")
  expect((await supervisor.withdrawConsent(settingsOrigin, first.device.consent)).kind).toBe("withdrawn")
  const events: string[] = []
  supervisor.subscribe(event => events.push(event.kind))
  expect((await supervisor.activate()).kind, "without a new agreement the fresh owner stays held").toBe("held")
  const held = supervisor.owner()
  if (!held) throw Error("Missing held owner")
  await agreeWhileHeld(held)
  const started = h.ledger.ownersStarted

  const [one, two] = await Promise.all([supervisor.activate(), supervisor.activate()])
  expect(one.kind).toBe("active")
  expect(two).toBe(one)
  const active = supervisor.owner()
  expect(active === held, "the held owner is replaced").toBe(false)
  expect(h.ledger.ownersStarted, "concurrent calls share one replacement").toBe(started + 1)
  expect(await supervisor.activate()).toEqual({ kind: "active", owner: active! })
  expect(h.ledger.ownersStarted, "an active store starts no owner").toBe(started + 1)
  expect(h.ledger.maxLiveOwners, "two owners never share the store").toBe(1)
  expect(events).toEqual(["reactivating", "reactivating"])
  await supervisor.dispose()
})

test("with a removal withdrawal paused, activation after agreeing again keeps the fresh owner held with the removal waiting (R167)", async () => {
  const withdrawn = await accepted()
  const h = createLifecycleHarness({ local: withdrawn.local, session: withdrawn.session, database: "present" }),
    supervisor = createStoreLifecycle(h.deps())
  expect((await supervisor.ready()).kind).toBe("held")
  const held = supervisor.owner()
  if (!held) throw Error("Missing held owner")
  await agreeWhileHeld(held)

  const after = await supervisor.activate()
  expect(after.kind).toBe("held")
  const fresh = supervisor.owner()
  if (!fresh || fresh === held) throw Error("The held owner was not replaced")
  const work = await fresh.readWithdrawnWork(ui)
  expect(work.kind === "held" ? work.work.map(view => view.kind) : work).toEqual(["account-removal"])
  expect(h.ledger.hostCalls, "Agree alone continues no removal").toBe(0)
  await supervisor.dispose()
})
