import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { createConsentRecovery, parseConsentJobs, consentJobsKey } from "./consent-recovery"
import { consentObject, readConsentDevice } from "./consent-withdrawal"
import { isAcceptedFilterRecord, completedFilterRecord, executeExactRetainedFilter, readExactFilterSync, type ExactRetainedFilterPermit, type RetainedFilterView } from "./withdrawn-document-recovery"
import { readRetainedRecovery } from "./interim-recovery-execution"
import { createStoreLifecycle } from "./store-lifecycle"
import { createLifecycleHarness, settingsOrigin } from "../../../tools/fixtures/device-lifecycle/run"
import { createRecoveryHarness, recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot, renewWithdrawalAgreement } from "../../../tools/fixtures/interim-conversion/run"
import { createWithdrawnFilterInput, createWithdrawnFilterHarness, heldReady, selectFilter, submittedStage, copy } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import type { JsonObject } from "../../shared/contracts/json"
import { isAccountKey } from "../../shared/model"
import { stages, fixture, open, execution, recover } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

for (const [documentAfter, historyAfter] of [[false, false], [true, false], [false, true], [true, true]]) test(`complete fixed-image combination document=${documentAfter} history=${historyAfter}`, async () => {
  const source = await fixture(), stores = copy(source.stores), effect = source.accepted.pending.effect
  if (documentAfter) stores.local["doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT"] = copy(effect.after)
  if (historyAfter && effect.history.after.kind === "present") stores.local.sync = copy(effect.history.after.raw)
  const f = await open(stores), before = f.h.records()
  const clock = Date.now; let allocated = 0
  Date.now = () => { allocated++; return 123 }
  let result
  try { result = await recover(f) } finally { Date.now = clock }
  const ran = execution(result)
  expect(allocated).toBe(0)
  expect(result.kind).toBe("recovered")
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.filter(stage => stage !== "documents" || !documentAfter || !historyAfter))
  expect(f.h.writes.filter(batch => Object.hasOwn(batch, "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT"))).toHaveLength(documentAfter && historyAfter ? 0 : 1)
  expect(f.h.records().device).toEqual(before.device)
  expect(f.h.records()["consent:state"]).toEqual(before["consent:state"])
  expect(f.h.effects.filter(value => ["stamp", "generation", "sync-set", "timer", "sync-subscribe"].includes(String(value)))).toEqual([])
  await f.owner.dispose()
}, 500000)

test("current Device extension outside the historical consent projection refuses even before capture", async () => {
  const source = await fixture(), stores = copy(source.stores)
  if (!consentObject(stores.local.device)) throw new Error("Missing Device")
  stores.local.device.addedAfterAcceptance = { nested: [false, null] }
  const f = createWithdrawnFilterHarness(stores), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-filter-replacement")).toBe(false)
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

test("every persisted recovery permission uses the exact current numeric consent generation", async () => {
  const f = await open(), current = readConsentDevice(f.h.records())
  if (current.kind !== "supported" || !current.control || !current.device.consent) throw new Error("Missing numeric current generation")
  expect((await recover(f)).kind).toBe("recovered")
  const permissions = f.h.writes.flatMap(batch => {
    const job = parseConsentJobs(batch[consentJobsKey])?.jobs.find(job => job.identity.operation.kind === "retained-filter-replacement")
    return job && "generation" in job.permission ? [job.permission] : []
  })
  expect(permissions).toHaveLength(3)
  for (const permission of permissions) {
    expect(permission.generation).toBe(current.control.generation)
    expect(permission.current).toEqual(current.device.consent)
  }
  await f.owner.dispose()
})

for (const channel of ["explicit", "startup"] as const) test(`${channel} snapshot observed ABA invalidates its old selection`, async () => {
  const source = await fixture(), f = createWithdrawnFilterHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing explicit host")
  let changed = false
  const adjust = (snapshot: ReturnType<typeof interimSnapshot>) => changed ? { ...snapshot, source: { ...snapshot.source, playlists: ["PL_OBSERVED_B"] } } : snapshot
  const owner = createStartingLocalFilterWriter({ ...f.h.deps,
    startup: { ...f.h.deps.startup, async readInterimSnapshot() { const value = await f.h.deps.startup.readInterimSnapshot(); return channel === "startup" ? adjust(value) : value } },
    recovery: { ...host, snapshot: { async read() { const value = await host.snapshot.read(); return channel === "explicit" ? { ...value, retained: adjust(value.retained) } : value } } }
  })
  await heldReady(owner); const selected = await selectFilter(owner)
  changed = true; await owner.readWithdrawnWork(recoveryUi)
  changed = false; await owner.readWithdrawnWork(recoveryUi)
  const result = execution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
  expect(result.kind).toBe("unavailable")
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

for (const drift of ["repair", "newer-addressed", "quota", "new-debt", "read-failure"] as const) test(`synced fixed admission refuses ${drift} and never invokes outbound work`, async () => {
  const source = await createWithdrawnFilterInput(true), f = createWithdrawnFilterHarness(source.stores), h = f.h
  if (drift === "repair") h.remote(records => { const name = "s:settings"; if (!consentObject(records[name])) throw new Error("Missing remote repair document"); records[name].extension = "remote-drift" })
  if (drift === "newer-addressed") h.remote(records => { records["s:filter:AAAAAAAAAAAAAAAA:PL_KEPT"] = { v: 99 } })
  if (drift === "quota") h.remote(records => { records.padding = "x".repeat(105000) })
  if (drift === "new-debt") h.remote(records => { for (const name of Object.keys(records)) delete records[name] })
  const owner = createStartingLocalFilterWriter({ ...h.deps, sync: { ...h.deps.sync, async get() { if (drift === "read-failure") throw new Error("remote-read-failure"); return h.deps.sync.get() } } })
  await heldReady(owner); const selected = await selectFilter(owner)
  const result = execution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
  expect(result.kind).toBe("unconfirmed")
  expect(result.kind === "unconfirmed" && result.stage).toBe("authorize")
  expect(h.writes.some(batch => submittedStage(batch) === "documents")).toBe(false)
  expect(h.effects.filter(value => ["sync-set", "sync-subscribe", "timer", "generation", "stamp"].includes(String(value)))).toEqual([])
  await owner.dispose()
})

test("synced repair drift while done applies cannot report a completed recovery", async () => {
  const source = await createWithdrawnFilterInput(true), f = await open(source.stores)
  f.h.write(async (batch, apply) => {
    apply(batch)
    if (submittedStage(batch) === "done") f.h.remote(records => { records["s:settings"] = { v: 99 } })
  })
  const result = await recover(f), ran = execution(result)
  expect(result.kind).toBe("authorized-pending")
  expect(ran.kind).toBe("unconfirmed")
  expect(ran.kind === "unconfirmed" && ran.stage).toBe("done")
  expect(ran.mutations.map(m => m.stage)).toEqual([...stages])
  expect(f.h.effects.filter(value => ["sync-set", "sync-subscribe", "timer", "generation", "stamp"].includes(String(value)))).toEqual([])
  await f.owner.dispose()
})

test("documents partial outcomes close execution and fresh owners finish only the fixed after-values", async () => {
  for (const part of ["document", "history"]) for (const rejected of [false, true]) {
    const f = await open()
    const error = new Error(`partial-${part}`)
    f.h.write(async (items, apply) => {
      if (submittedStage(items) !== "documents") { apply(items); return }
      const key = part === "document" ? "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT" : "sync"
      apply({ [key]: items[key]! })
      if (rejected) throw error
    })
    const result = execution(await recover(f))
    expect(result.kind).toBe("unconfirmed")
    if (result.kind !== "unconfirmed") throw new Error("Partial write cannot confirm")
    expect(result.write).toEqual(rejected ? { kind: "rejected", error } : { kind: "resolved" })
    expect(f.h.writes.at(-1) && submittedStage(f.h.writes.at(-1)!)).toBe("documents")
    const saved = f.stores(); await f.owner.dispose()
    const next = await open(JSON.parse(JSON.stringify(saved)))
    expect((await recover(next)).kind).toBe("recovered")
    expect(next.h.writes.filter(batch => submittedStage(batch) === "documents")).toHaveLength(1)
    await next.owner.dispose()
  }
}, 30000)

for (const stage of stages) for (const channel of ["explicit", "startup", "authority", "ownership"] as const) test(`${stage} preserves its resolved write when ${channel} post-write observation fails`, async () => {
  const source = await fixture(), f = createWithdrawnFilterHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing concrete host")
  let faulted = false
  const error = new Error(`post-write-${channel}-${stage}`)
  function failure() { if (faulted) throw error }
  const owner = createStartingLocalFilterWriter({ ...f.h.deps,
    startup: { ...f.h.deps.startup, async readInterimSnapshot() { if (channel === "startup") failure(); return f.h.deps.startup.readInterimSnapshot() } },
    recovery: { ...host, snapshot: { async read() { if (channel === "explicit") failure(); return host.snapshot.read() } }, authority: { async read() { if (channel === "authority") failure(); return host.authority.read() } }, ownership: { async lookup(authority) { if (channel === "ownership") failure(); return host.ownership.lookup(authority) } } }
  })
  await heldReady(owner); const selected = await selectFilter(owner)
  f.h.write(async (batch, apply) => { apply(batch); if (submittedStage(batch) === stage) faulted = true })
  const ran = execution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
  expect(ran.kind).toBe("unconfirmed")
  if (ran.kind !== "unconfirmed") throw new Error("Incomplete post-write observation cannot confirm")
  expect(ran.stage).toBe(stage)
  expect(ran.write).toEqual({ kind: "resolved" })
  expect(ran.observation).toEqual({ kind: "read-failed", error })
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.slice(0, stages.indexOf(stage)))
  expect(f.h.writes.map(submittedStage)).toEqual(stages.slice(0, stages.indexOf(stage) + 1))
  await owner.dispose()
})

test("terminal continuation cannot rewrite document or history and never duplicates a resolution", async () => {
  for (const boundary of ["retire", "record"] as const) {
    const f = await open()
    f.h.write(async (items, apply) => {
      apply(items)
      if (submittedStage(items) === boundary) f.h.get(async () => { throw f.h.readError })
    })
    expect(execution(await recover(f)).kind).toBe("unconfirmed")
    f.h.get(undefined)
    const saved = f.stores(); await f.owner.dispose()
    const next = await open(saved)
    expect(next.view.progress).toBe("terminal")
    expect((await recover(next)).kind).toBe("recovered")
    expect(next.h.writes.some(batch => submittedStage(batch) === "documents")).toBe(false)
    expect(next.h.writes.filter(batch => submittedStage(batch) === "record")).toHaveLength(boundary === "record" ? 0 : 1)
    const parsed = readRetainedRecovery(next.h.records().interimConversion)
    expect(parsed.kind === "recovery" && parsed.checkpoint.resolutions.length).toBe(1)
    await next.owner.dispose()
    const regressed = copy(saved), source = await fixture()
    regressed.local["doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT"] = copy(source.accepted.pending.effect.before)
    const held = createWithdrawnFilterHarness(regressed), owner = createStartingLocalFilterWriter(held.h.deps)
    await heldReady(owner)
    const review = await owner.readWithdrawnWork(recoveryUi)
    expect(review.kind === "held" && review.work.some(view => view.kind === "retained-filter-replacement")).toBe(false)
    expect(held.h.writes).toEqual([])
    await owner.dispose()
  }
})

test("done recurrence refuses an identical accepted pending identity without a new occurrence", async () => {
  const f = await open()
  expect((await recover(f)).kind).toBe("recovered")
  const done = f.stores(), accepted = f.view.identity.operation.record
  await f.owner.dispose()
  done.local.interimConversion = copy(accepted)
  const next = createWithdrawnFilterHarness(done), owner = createStartingLocalFilterWriter(next.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-filter-replacement")).toBe(false)
  expect(parseConsentJobs(next.h.records()[consentJobsKey])?.next).toBe(1)
  expect(next.h.writes).toEqual([])
  await owner.dispose()
})

for (const drift of ["device-extension", "canonical-key", "parent", "history", "source", "control-generation", "effect", "join", "removal"] as const) test(`complete projection refuses ${drift} after capture`, async () => {
  const f = await open()
  f.h.foreign(records => {
    if (drift === "device-extension" && consentObject(records.device)) records.device.extensionAfterCapture = { full: [false, null] }
    if (drift === "canonical-key") records["cache:AAAAAAAAAAAAAAAA"] = { extra: true }
    if (drift === "parent" && consentObject(records["doc:setup:AAAAAAAAAAAAAAAA"])) records["doc:setup:AAAAAAAAAAAAAAAA"].extension = "drift"
    if (drift === "history" && consentObject(records.sync)) records.sync.extension = "drift"
    if (drift === "source" && consentObject(records["account:AAAAAAAAAAAAAAAA"])) records["account:AAAAAAAAAAAAAAAA"].extension = "drift"
    if (drift === "control-generation" && consentObject(records["consent:state"]) && typeof records["consent:state"].generation === "number") records["consent:state"].generation++
    if (drift === "effect" && isAcceptedFilterRecord(records.interimConversion)) {
      const next: unknown = { ...records.interimConversion, pending: { ...records.interimConversion.pending, effect: { ...records.interimConversion.pending.effect, parent: { altered: true } } } }
      if (!consentObject(next)) throw new Error("Invalid composed negative effect")
      records.interimConversion = next
    }
    if (drift === "join") records["pending:sync-join"] = { v: 99 }
    if (drift === "removal") records["pending:account-removal"] = { v: 99 }
  })
  const after = f.stores()
  expect((await recover(f)).kind).toBe("authorized-pending")
  expect(f.h.writes).toEqual([])
  expect(f.stores()).toEqual(after)
  await f.owner.dispose()
})

test("a current generation change after documents preserves the attempted stage and stops before retirement", async () => {
  const f = await open()
  f.h.write(async (items, apply) => {
    apply(items)
    if (submittedStage(items) === "documents") {
      const renewal = await renewWithdrawalAgreement(f.stores())
      f.h.foreign(records => { Object.assign(records, renewal.stores.local) })
    }
  })
  const actual = execution(await recover(f))
  expect(actual.kind).toBe("unconfirmed")
  expect(actual.kind === "unconfirmed" && actual.stage).toBe("documents")
  expect(f.h.writes.map(submittedStage)).toEqual(["register", "prepare", "authorize", "documents"])
  await f.owner.dispose()
})

test("copy, foreign owner, private origin, changed origin and consumption refuse public selections", async () => {
  const f = await open(), foreign = await open()
  expect(await f.owner.recoverWithdrawnWork(recoveryUi, { review: { ...f.review.review }, job: f.view.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await foreign.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await f.owner.recoverWithdrawnWork({ ...recoveryUi, incognito: true }, { review: f.review.review, job: f.view.selection })).toEqual({ kind: "refused", reason: "private" })
  expect(await recover(f)).toEqual({ kind: "unavailable", reason: "stale" })
  const next = await selectFilter(f.owner)
  const changed = await f.owner.recoverWithdrawnWork({ ...recoveryUi, windowId: 77 }, { review: next.review.review, job: next.view.selection })
  expect(execution(changed).kind).toBe("unavailable")
  const copied = await selectFilter(f.owner)
  expect(await f.owner.recoverWithdrawnWork(recoveryUi, { review: copied.review.review, job: { ...copied.view.selection } })).toEqual({ kind: "unavailable", reason: "unsupported-recovery" })
  expect(f.h.writes).toEqual([])
  await f.owner.dispose(); await foreign.owner.dispose()
})

test("observed local ABA invalidates capture while repeated equal reads stay stable", async () => {
  const f = await open(), original = f.h.records().unrelated
  await f.owner.readWithdrawnWork(recoveryUi)
  f.h.foreign(records => { records.unrelated = { observed: "B" } })
  await f.owner.readWithdrawnWork(recoveryUi)
  f.h.foreign(records => { records.unrelated = copy(original!) })
  expect(execution(await recover(f)).kind).toBe("unavailable")
  expect(f.h.writes).toEqual([])
  const fresh = await selectFilter(f.owner)
  expect((await f.owner.recoverWithdrawnWork(recoveryUi, { review: fresh.review.review, job: fresh.view.selection })).kind).toBe("recovered")
  await f.owner.dispose()
})

for (const fault of ["account", "lease", "session", "host-generation", "ownership", "lineage"] as const) test(`fresh singular account authority rejects ${fault} drift`, async () => {
  const source = await fixture(), f = createWithdrawnFilterHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing host")
  let lookups = 0
  const owner = createStartingLocalFilterWriter({ ...f.h.deps, recovery: { ...host, ownership: { async lookup(authority) {
    const result = await host.ownership.lookup(authority)
    lookups++
    if (lookups === 5) {
      if (fault === "ownership") f.h.ownership(false)
      else if (fault !== "lineage") {
        const other = "BBBBBBBBBBBBBBBB"
        if (!isAccountKey(other)) throw new Error("Invalid synthetic second account")
        f.h.authority({ kind: "ready", authority: { ...authority, acct: fault === "account" ? other : authority.acct, lease: fault === "lease" ? "rotated" : authority.lease, browserSession: fault === "session" ? "rotated" : authority.browserSession, consentGeneration: fault === "host-generation" ? "rotated" : authority.consentGeneration } })
      }
      if (fault === "lineage") return { ...result, lineage: "forbidden" }
    }
    return result
  } } } })
  await heldReady(owner); const selected = await selectFilter(owner)
  const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
  expect(result.kind).toBe("authorized-pending")
  expect(f.h.writes.some(batch => submittedStage(batch) === "documents")).toBe(false)
  await owner.dispose()
})

test("registered exhaustion finishes, unregistered exhaustion refuses, and old ledger witnesses survive", async () => {
  const f = await open()
  f.h.write(async (items, apply) => { apply(items); if (submittedStage(items) === "register") f.h.get(async () => { throw f.h.readError }) })
  await recover(f); f.h.get(undefined)
  const registered = f.stores(); await f.owner.dispose()
  const ledger = parseConsentJobs(registered.local[consentJobsKey])
  if (!ledger) throw new Error("Missing registered ledger")
  registered.local[consentJobsKey] = { ...ledger, next: Number.MAX_SAFE_INTEGER }
  const resumed = await open(registered)
  expect((await recover(resumed)).kind).toBe("recovered")
  expect(parseConsentJobs(resumed.h.records()[consentJobsKey])?.next).toBe(Number.MAX_SAFE_INTEGER)
  await resumed.owner.dispose()
  const max = copy((await fixture()).stores)
  max.local[consentJobsKey] = { v: 1, kind: "consent-jobs", deviceId: "synthetic-device", next: Number.MAX_SAFE_INTEGER, jobs: [] }
  const blocked = createWithdrawnFilterHarness(max), owner = createStartingLocalFilterWriter(blocked.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-filter-replacement")).toBe(false)
  expect(blocked.h.writes).toEqual([])
  await owner.dispose()
})

test("filter ledger rejects missing, duplicated and mismatched immutable registration witnesses", async () => {
  const f = await open(); await recover(f)
  const raw = copy(f.h.records()[consentJobsKey])
  if (!consentObject(raw) || !Array.isArray(raw.retainedDocuments) || !Array.isArray(raw.jobs)) throw new Error("Missing filter ledger")
  expect(parseConsentJobs(raw)).toBeDefined()
  const missing = copy(raw); delete missing.retainedDocuments
  expect(parseConsentJobs(missing)).toBeUndefined()
  expect(parseConsentJobs({ ...raw, retainedDocuments: [...raw.retainedDocuments, ...raw.retainedDocuments] })).toBeUndefined()
  const witness = copy(raw.retainedDocuments[0])
  if (!consentObject(witness) || !consentObject(witness.registration)) throw new Error("Missing witness")
  witness.registration.occurrence = 99
  expect(parseConsentJobs({ ...raw, retainedDocuments: [witness] })).toBeUndefined()
  expect(parseConsentJobs({ ...raw, jobs: [...raw.jobs, ...raw.jobs] })).toBeUndefined()
  await f.owner.dispose()
})

for (const forged of [false, true]) test(`private one-use filter authority and independent completion reject forged callback=${forged}`, async () => {
  const f = createWithdrawnFilterHarness((await fixture()).stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing concrete authority")
  let view: RetainedFilterView | undefined, savedPermit: ExactRetainedFilterPermit | undefined, closed = 0
  const ports = {
    async setLedger(ledger: Parameters<Parameters<typeof executeExactRetainedFilter>[1]["setLedger"]>[0]) { await f.h.deps.local.set({ [consentJobsKey]: ledger }) },
    async setCompleted(record: Parameters<Parameters<typeof executeExactRetainedFilter>[1]["setCompleted"]>[0]) { await f.h.deps.local.set({ interimConversion: record }) },
    async setFilter(effect: Parameters<Parameters<typeof executeExactRetainedFilter>[1]["setFilter"]>[0]) {
      const batch: JsonObject = { "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT": effect.after }
      if (effect.history.after.kind === "present") batch.sync = effect.history.after.raw
      await f.h.deps.local.set(batch)
    }
  }
  const controller = createConsentRecovery({
    observe: async () => f.h.records(), set: items => f.h.deps.local.set(items), revision: () => 0, stopped: () => false,
    observeRetainedAgreement: async () => interimSnapshot(f.h.records()), onRetainedV1Uncertainty() {}, onFilterUncertainty() { closed++ },
    async execute() { throw new Error("No removal authority") },
    filterRecovery: { host, readSync: permit => readExactFilterSync(permit, async () => f.stores().sync), async execute(permit) {
      savedPermit = permit
      await expect(executeExactRetainedFilter({ ...permit }, ports)).rejects.toThrow("Invalid or consumed")
      await expect(readExactFilterSync(permit, async () => ({}))).rejects.toThrow("No live exact")
      if (!view) throw new Error("Missing exact selected view")
      if (forged) return { kind: "confirmed", identity: view.identity, original: view.identity.original, current: view.current, activation: "held", mutations: [] }
      const result = await executeExactRetainedFilter(permit, ports)
      await expect(executeExactRetainedFilter(permit, ports)).rejects.toThrow("Invalid or consumed")
      return result
    } }
  })
  const review = await controller.read(recoveryUi)
  if (review.kind !== "held") throw new Error("Missing held review")
  view = review.work.find(item => item.kind === "retained-filter-replacement")
  if (!view) throw new Error("Missing explicit filter")
  const result = await controller.recover(recoveryUi, { review: review.review, job: view.selection })
  expect(result.kind).toBe(forged ? "authorized-pending" : "recovered")
  expect(closed).toBe(forged ? 1 : 0)
  expect(f.h.writes.map(submittedStage)).toEqual(forged ? ["register", "prepare", "authorize"] : [...stages])
  if (!savedPermit) throw new Error("Missing executed permit")
  await expect(executeExactRetainedFilter(savedPermit, ports)).rejects.toThrow("Invalid or consumed")
  await expect(readExactFilterSync(savedPermit, async () => ({}))).rejects.toThrow("No live exact")
})

test("preflight authority failure after registration retains the last write and confirmed prefix", async () => {
  const source = await fixture(), f = createWithdrawnFilterHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing authority")
  let lookups = 0
  const error = new Error("after-confirmed-registration")
  const owner = createStartingLocalFilterWriter({ ...f.h.deps, recovery: { ...host, ownership: { async lookup(authority) {
    if (++lookups === 5) throw error
    return host.ownership.lookup(authority)
  } } } })
  await heldReady(owner); const selected = await selectFilter(owner)
  const ran = execution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
  expect(ran.kind).toBe("unconfirmed")
  if (ran.kind !== "unconfirmed") throw new Error("Missing post-IO interruption")
  expect(ran.stage).toBe("register")
  expect(ran.write).toEqual({ kind: "resolved" })
  expect(ran.observation).toEqual({ kind: "read-failed", error })
  expect(ran.mutations.map(item => item.stage)).toEqual(["register"])
  expect(f.h.writes.map(submittedStage)).toEqual(["register"])
  await owner.dispose()
})

test("composed stable completed sibling retains the complete old job and witness in original order", async () => {
  const previous = await open()
  await recover(previous)
  const raw = copy(previous.h.records()[consentJobsKey])
  if (!consentObject(raw) || !Array.isArray(raw.jobs) || !Array.isArray(raw.retainedDocuments)) throw new Error("Missing actual completed ledger")
  const originalJob = copy(raw.jobs[0]), originalWitness = copy(raw.retainedDocuments[0]), nextInput = await createWithdrawnFilterInput(false, true)
  await previous.owner.dispose()
  const composed = copy(nextInput.stores)
  composed.local[consentJobsKey] = raw
  const f = await open(composed)
  expect(f.view.identity.occurrence).toBe(1)
  expect((await recover(f)).kind).toBe("recovered")
  const final = f.h.records()[consentJobsKey]
  if (!consentObject(final) || !Array.isArray(final.jobs) || !Array.isArray(final.retainedDocuments)) throw new Error("Missing final ledger")
  expect(final.jobs[0]).toEqual(originalJob)
  expect(final.retainedDocuments[0]).toEqual(originalWitness)
  expect(final.jobs).toHaveLength(2)
  expect(final.retainedDocuments).toHaveLength(2)
  expect(final.next).toBe(2)
  expect(f.h.records().interimConversion).toEqual(completedFilterRecord(f.view.identity))
  await f.owner.dispose()
})

test("composed active filter occurrence sharing the selected fixed destination stays held", async () => {
  const previous = await open()
  previous.h.write(async (batch, apply) => { apply(batch); if (submittedStage(batch) === "register") previous.h.get(async () => { throw previous.h.readError }) })
  await recover(previous); previous.h.get(undefined)
  const ledger = copy(previous.h.records()[consentJobsKey]), nextInput = await createWithdrawnFilterInput(false, true)
  if (!consentObject(ledger) || !parseConsentJobs(ledger)) throw new Error("Missing actual active registration")
  await previous.owner.dispose()
  const composed = copy(nextInput.stores); composed.local[consentJobsKey] = ledger
  const f = createWithdrawnFilterHarness(composed), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-filter-replacement")).toBe(false)
  expect(f.stores()).toEqual(composed)
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

for (const stopping of ["withdrawal", "disposal"] as const) for (const boundary of [...stages, "lookup", "lookup-register", "lookup-documents", "lookup-record", "lookup-completion"] as const) test(`actual same-owner lifecycle ${stopping} drains suspended ${boundary} and starts no later recovery stage`, async () => {
  const source = await fixture(), host = createRecoveryHarness(source.stores.local).deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing recovery host")
  let signalStop = () => {}; const stopEntered = new Promise<void>(resolve => { signalStop = resolve })
  const writes: JsonObject[] = []
  const lookup = boundary.startsWith("lookup"), occurrence = boundary === "lookup-register" ? 4 : boundary === "lookup-documents" ? 11 : boundary === "lookup-record" ? 18 : boundary === "lookup-completion" ? 22 : 1
  const stageIndex = stages.findIndex(stage => stage === boundary)
  const harness = createLifecycleHarness({ local: copy(source.stores.local), session: copy(source.stores.session), database: "present" }, {
    faults: [{ port: lookup ? "owner.recovery-lookup" : "owner.local.set", occurrence: lookup ? occurrence : stageIndex + 1, mode: "hold" }], onStop: signalStop,
    configureOwner(deps, stores, lookupBoundary) {
      return { ...deps, now() { throw new Error("Recovery cannot allocate time") }, generation() { throw new Error("Recovery cannot allocate generation") }, local: { ...deps.local, async set(items) { if (!consentObject(items)) throw new Error("Non-JSON batch"); writes.push(copy(items)); await deps.local.set(items) } },
        recovery: { ...host, snapshot: { async read() { const local = stores().local; return { retained: interimSnapshot(local), history: Object.hasOwn(local, "sync") ? { kind: "present", raw: local.sync } : { kind: "absent" } } } },
          ownership: { async lookup(authority) { await lookupBoundary(); return host.ownership.lookup(authority) } } } }
    }
  })
  const lifecycle = createStoreLifecycle(harness.deps())
  await lifecycle.ready()
  const owner = lifecycle.owner()
  if (!owner) throw new Error("Lifecycle did not expose its held owner")
  const selected = await selectFilter(owner), heldPort = lookup ? "owner.recovery-lookup" : "owner.local.set", arrival = harness.arrival(heldPort, lookup ? occurrence : stageIndex + 1)
  const recovering = owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
  await arrival
  const read = readConsentDevice(harness.stores().local)
  if (read.kind !== "supported" || !read.device.consent) throw new Error("Missing current agreement")
  const withdrawing = stopping === "withdrawal" ? lifecycle.withdrawConsent(settingsOrigin, read.device.consent) : lifecycle.dispose()
  await stopEntered
  const beforeRelease = writes.length
  harness.release(heldPort)
  const result = await recovering, withdrawn = await withdrawing
  if (stopping === "withdrawal") expect(withdrawn).toMatchObject({ kind: "withdrawn" })
  expect(writes.length).toBe(beforeRelease)
  if (!lookup) {
    const ran = execution(result)
    expect(ran.kind).toBe("unconfirmed")
    expect(ran.kind === "unconfirmed" && ran.stage).toBe(stages[stageIndex]!)
    expect(ran.mutations.map(m => m.stage)).toEqual(stages.slice(0, stageIndex))
  } else if (occurrence > 1) {
    const ran = execution(result)
    if (boundary === "lookup-completion") {
      expect(ran.kind).toBe("confirmed")
      expect(result.kind).toBe("authorized-pending")
    } else {
      expect(ran.kind).toBe("unconfirmed")
      expect(ran.kind === "unconfirmed" && ran.stage).toBe(boundary === "lookup-register" ? "register" : boundary === "lookup-documents" ? "documents" : "record")
    }
  }
  expect(harness.ledger.exclusionViolations).toBe(0)
  expect(harness.ledger.syncCalls).toBe(0)
  await lifecycle.dispose()
})
