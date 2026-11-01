import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { createConsentRecovery, parseConsentJobs, sameConsentValue, consentJobsKey } from "./consent-recovery"
import { consentObject, readConsentDevice } from "./consent-withdrawal"
import { isAcceptedFilterRecord, completedFilterRecord, executeExactRetainedFilter, readExactFilterSync, type ExactRetainedFilterPermit, type RetainedFilterExecution, type FilterRecoveryStage, type RetainedFilterView } from "./withdrawn-document-recovery"
import { readRetainedRecovery } from "./interim-recovery-execution"
import { createStoreLifecycle } from "./store-lifecycle"
import { createLifecycleHarness, settingsOrigin } from "../../../tools/fixtures/device-lifecycle/run"
import { createRecoveryHarness, recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot, renewWithdrawalAgreement } from "../../../tools/fixtures/interim-conversion/run"
import { createWithdrawnFilterInput, createWithdrawnFilterHarness, heldReady, selectFilter, submittedStage, copy, observeWithdrawnFilterV2, type FilterStores } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import type { JsonObject } from "../../shared/contracts/json"
import { isAccountKey } from "../../shared/model"
import { createWithdrawnPlaylistInput, createWithdrawnPlaylistHarness, selectPlaylist, submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import { completedPlaylistRecord, isAcceptedPlaylistRecord, executeExactRetainedPlaylist, readExactPlaylistSync, type ExactRetainedPlaylistPermit, type RetainedPlaylistExecution, type RetainedPlaylistView, type AcceptedPlaylistRecord, parseRetainedPlaylistIdentity } from "./withdrawn-document-recovery"
import { createInstalledPlaylistInput } from "../../../tools/fixtures/withdrawn-document-recovery/v3-playlist"

const stages = ["register", "prepare", "authorize", "documents", "retire", "record", "done"] as const
let playlistInput: ReturnType<typeof createWithdrawnPlaylistInput> | undefined
function playlistFixture() { return playlistInput ??= createWithdrawnPlaylistInput() }
async function openPlaylist(stores?: FilterStores) {
  const f = createWithdrawnPlaylistHarness(stores ?? (await playlistFixture()).stores), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  return { ...f, owner, ...await selectPlaylist(owner) }
}
async function recoverPlaylist(f: Awaited<ReturnType<typeof openPlaylist>>) { return f.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection }) }
function playlistExecution(result: Awaited<ReturnType<typeof recoverPlaylist>>): RetainedPlaylistExecution {
  if (result.kind === "recovered" && result.completion.operation === "retained-playlist-restore") return result.completion.result
  if (result.kind === "authorized-pending" && "identity" in result.observation && result.observation.identity.operation.kind === "retained-playlist-restore") {
    const identity = { ...result.observation.identity, operation: result.observation.identity.operation }
    const execution = result.observation
    if (execution.kind === "confirmed") return { ...execution, identity }
    if (execution.kind === "failed") return { ...execution, identity }
    if (execution.kind === "unconfirmed") return { ...execution, identity }
    if (execution.kind === "unavailable") return { ...execution, identity }
    if (execution.kind === "preflight-failed") return { ...execution, identity }
  }
  throw new Error("Missing operation-correlated playlist execution")
}
for (const syncing of [false, true]) for (const images of [[false, false], [true, false], [false, true], [true, true]] as const) test(`playlist exact actual IO images syncing=${syncing} document=${images[0]} history=${images[1]}`, async () => {
  const source = await createWithdrawnPlaylistInput(syncing, false, { images }), f = await openPlaylist(source.stores), before = f.stores()
  const clock = Date.now; let allocations = 0
  Date.now = () => { allocations++; return 123 }
  let result
  try { result = await recoverPlaylist(f) } finally { Date.now = clock }
  const ran = playlistExecution(result)
  expect(allocations).toBe(0)
  expect(result.kind).toBe("recovered")
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.filter(stage => stage !== "documents" || !images[0] || !images[1]))
  expect(f.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents")).toHaveLength(images[0] && images[1] ? 0 : 1)
  expect(f.h.records().device).toEqual(before.local.device)
  expect(f.h.records()["consent:state"]).toEqual(before.local["consent:state"])
  expect(f.h.records().interimConversion).toEqual(completedPlaylistRecord(f.view.identity))
  expect(f.stores().sync).toEqual(before.sync)
  expect(f.h.effects.filter(value => ["stamp", "generation", "sync-set", "sync-subscribe", "timer"].includes(String(value)))).toEqual([])
  await heldReady(f.owner)
  await f.owner.dispose()
})
test("playlist equal numeric occurrences retain the actual A prefix and immutable B destination", async () => {
  const source = await createWithdrawnPlaylistInput(false, false, { siblings: true }), f = await openPlaylist(source.stores), before = f.stores()
  expect(source.accepted.resolutions).toHaveLength(1)
  expect(source.accepted.pending.effect.item).toEqual({ sourceKey: "playlists", path: [1] })
  expect(String(source.accepted.pending.effect.key.acct)).toBe("BBBBBBBBBBBBBBBB")
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  expect(f.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(before.local["doc:setup:AAAAAAAAAAAAAAAA"])
  expect(f.h.records().playlists).toEqual(["PL_GLOBAL", "PL_GLOBAL"])
  await f.owner.dispose()
})
let input: ReturnType<typeof createWithdrawnFilterInput> | undefined
function fixture() { return input ??= createWithdrawnFilterInput() }
async function open(stores?: FilterStores) {
  const f = createWithdrawnFilterHarness(stores ?? (await fixture()).stores), owner = createStartingLocalFilterWriter(f.h.deps)
  const readiness = await heldReady(owner), selected = await selectFilter(owner)
  return { ...f, owner, readiness, ...selected }
}
function execution(result: Awaited<ReturnType<ReturnType<typeof createStartingLocalFilterWriter>["recoverWithdrawnWork"]>>) {
  if (result.kind === "recovered" && result.completion.operation === "retained-filter-replacement") return result.completion.result
  if (result.kind === "authorized-pending" && result.job.operation.kind === "retained-filter-replacement" && "mutations" in result.observation) return result.observation
  throw new Error("Missing operation-correlated filter execution")
}
async function recover(f: Awaited<ReturnType<typeof open>>) { return f.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection }) }

test("operation-produced filter and every serialized boundary finish exactly under current consent", async () => {
  const result = await observeWithdrawnFilterV2()
  expect(result.reconstruction.complete).toBe(true)
  expect(result.events.filter(event => event.kind === "restart-read-only")).toHaveLength(16)
  expect(result.events.filter(event => event.kind === "completion")).toHaveLength(2)
}, 180000)

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

for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error", "resolved-read-error"] as const) test(`${stage} retains actual ${mode} outcome and its confirmed prefix`, async () => {
  const f = await open(), before = f.stores(), writeError = new Error(`write-${stage}`), readError = new Error(`read-${stage}`)
  let invoked = false
  f.h.write(async (items, apply) => {
    if (submittedStage(items) !== stage) { apply(items); return }
    invoked = true
    if (mode === "rejected-applied" || mode === "resolved-read-error") apply(items)
    if (mode === "divergent") { apply(items); f.h.foreign(records => { records.unrelated = { drift: stage } }) }
    if (mode === "write-and-read-error" || mode === "resolved-read-error") f.h.get(async () => { throw readError })
    if (mode.startsWith("rejected") || mode === "write-and-read-error") throw writeError
  })
  const result = await recover(f), actual = execution(result)
  expect(invoked).toBe(true)
  if (mode === "rejected-applied") {
    expect(result.kind).toBe("recovered")
    expect(actual.kind).toBe("confirmed")
    const mutation = actual.mutations.find(m => m.stage === stage)
    expect(mutation?.write).toEqual({ kind: "rejected", error: writeError })
  } else {
    expect(result.kind).toBe("authorized-pending")
    expect(actual.kind).toBe(mode === "rejected-unchanged" ? "failed" : "unconfirmed")
    if (actual.kind !== "failed" && actual.kind !== "unconfirmed") throw new Error("Expected attempted-stage result")
    expect(actual.stage).toBe(stage)
    expect(actual.mutations.map(m => m.stage)).toEqual(stages.slice(0, stages.indexOf(stage)))
    expect(f.h.writes.at(-1) && submittedStage(f.h.writes.at(-1)!)).toBe(stage)
    if (mode === "write-and-read-error") {
      expect(actual.write).toEqual({ kind: "rejected", error: writeError })
      expect(actual.kind === "unconfirmed" && actual.observation).toEqual({ kind: "read-failed", error: readError })
    }
    if (mode === "ignored" && stage === "documents") expect(f.h.records().interimConversion).toEqual(before.local.interimConversion)
    f.h.get(undefined)
    if (mode !== "rejected-unchanged") expect((await f.owner.readWithdrawnWork(recoveryUi)).kind === "held" && (await f.owner.readWithdrawnWork(recoveryUi))).not.toHaveProperty("work", expect.arrayContaining([expect.objectContaining({ kind: "retained-filter-replacement" })]))
  }
  await f.owner.dispose()
}, 10000)

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
})

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
}, 10000)

test("playlist current Device extension outside the historical consent projection refuses even before capture", async () => {
  const source = await playlistFixture(), stores = copy(source.stores)
  if (!consentObject(stores.local.device)) throw new Error("Missing Device")
  stores.local.device.addedAfterAcceptance = { nested: [false, null] }
  const f = createWithdrawnPlaylistHarness(stores), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")).toBe(false)
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

test("playlist every persisted recovery permission uses the exact current numeric consent generation", async () => {
  const f = await openPlaylist(), current = readConsentDevice(f.h.records())
  if (current.kind !== "supported" || !current.control || !current.device.consent) throw new Error("Missing numeric current generation")
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  const permissions = f.h.writes.flatMap(batch => {
    const job = parseConsentJobs(batch[consentJobsKey])?.jobs.find(job => job.identity.operation.kind === "retained-playlist-restore")
    return job && "generation" in job.permission ? [job.permission] : []
  })
  expect(permissions).toHaveLength(3)
  for (const permission of permissions) {
    expect(permission.generation).toBe(current.control.generation)
    expect(permission.current).toEqual(current.device.consent)
  }
  await f.owner.dispose()
})

for (const channel of ["explicit", "startup"] as const) test(`playlist ${channel} snapshot observed ABA invalidates its old selection`, async () => {
  const source = await playlistFixture(), f = createWithdrawnPlaylistHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing explicit host")
  let changed = false
  const adjust = (snapshot: ReturnType<typeof interimSnapshot>) => changed ? { ...snapshot, source: { ...snapshot.source, playlists: ["PL_OBSERVED_B"] } } : snapshot
  const owner = createStartingLocalFilterWriter({ ...f.h.deps,
    startup: { ...f.h.deps.startup, async readInterimSnapshot() { const value = await f.h.deps.startup.readInterimSnapshot(); return channel === "startup" ? adjust(value) : value } },
    recovery: { ...host, snapshot: { async read() { const value = await host.snapshot.read(); return channel === "explicit" ? { ...value, retained: adjust(value.retained) } : value } } }
  })
  await heldReady(owner); const selected = await selectPlaylist(owner)
  changed = true; await owner.readWithdrawnWork(recoveryUi)
  changed = false; await owner.readWithdrawnWork(recoveryUi)
  const result = playlistExecution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
  expect(result.kind).toBe("unavailable")
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

for (const drift of ["repair", "newer-addressed", "quota", "new-debt", "read-failure"] as const) test(`playlist synced fixed admission refuses ${drift} and never invokes outbound work`, async () => {
  const source = await createWithdrawnPlaylistInput(true), f = createWithdrawnPlaylistHarness(source.stores), h = f.h
  if (drift === "repair") h.remote(records => { const name = "s:settings"; if (!consentObject(records[name])) throw new Error("Missing remote repair document"); records[name].extension = "remote-drift" })
  if (drift === "newer-addressed") h.remote(records => { records["s:setup:AAAAAAAAAAAAAAAA"] = { v: 99 } })
  if (drift === "quota") h.remote(records => { records.padding = "x".repeat(105000) })
  if (drift === "new-debt") h.remote(records => { for (const name of Object.keys(records)) delete records[name] })
  const owner = createStartingLocalFilterWriter({ ...h.deps, sync: { ...h.deps.sync, async get() { if (drift === "read-failure") throw new Error("remote-read-failure"); return h.deps.sync.get() } } })
  await heldReady(owner); const selected = await selectPlaylist(owner)
  const result = playlistExecution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
  expect(result.kind).toBe(drift === "read-failure" ? "preflight-failed" : "unavailable")
  if (result.kind === "preflight-failed") expect(result.error).toHaveProperty("message", "remote-read-failure")
  expect(h.writes).toEqual([])
  expect(h.writes.some(batch => submittedPlaylistStage(batch) === "documents")).toBe(false)
  expect(h.effects.filter(value => ["sync-set", "sync-subscribe", "timer", "generation", "stamp"].includes(String(value)))).toEqual([])
  await owner.dispose()
})

test("playlist synced repair drift while done applies cannot report a completed recovery", async () => {
  const source = await createWithdrawnPlaylistInput(true), f = await openPlaylist(source.stores)
  f.h.write(async (batch, apply) => {
    apply(batch)
    if (submittedPlaylistStage(batch) === "done") f.h.remote(records => { records["s:settings"] = { v: 99 } })
  })
  const result = await recoverPlaylist(f), ran = playlistExecution(result)
  expect(result.kind).toBe("authorized-pending")
  expect(ran.kind).toBe("unconfirmed")
  expect(ran.kind === "unconfirmed" && ran.stage).toBe("done")
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.slice(0, -1))
  expect(parseConsentJobs(f.h.records()[consentJobsKey])?.jobs.at(-1)?.permission.kind).toBe("done")
  expect(f.h.effects.filter(value => ["sync-set", "sync-subscribe", "timer", "generation", "stamp"].includes(String(value)))).toEqual([])
  await f.owner.dispose()
})

for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error", "resolved-read-error"] as const) test(`playlist ${stage} retains actual ${mode} outcome and its confirmed prefix`, async () => {
  const f = await openPlaylist(), before = f.stores(), writeError = new Error(`write-${stage}`), readError = new Error(`read-${stage}`)
  let invoked = false
  f.h.write(async (items, apply) => {
    if (submittedPlaylistStage(items) !== stage) { apply(items); return }
    invoked = true
    if (mode === "rejected-applied" || mode === "resolved-read-error") apply(items)
    if (mode === "divergent") { apply(items); f.h.foreign(records => { records.unrelated = { drift: stage } }) }
    if (mode === "write-and-read-error" || mode === "resolved-read-error") f.h.get(async () => { throw readError })
    if (mode.startsWith("rejected") || mode === "write-and-read-error") throw writeError
  })
  const result = await recoverPlaylist(f), actual = playlistExecution(result)
  expect(invoked).toBe(true)
  if (mode === "rejected-applied") {
    expect(result.kind).toBe("recovered")
    expect(actual.kind).toBe("confirmed")
    const mutation = actual.mutations.find(m => m.stage === stage)
    expect(mutation?.write).toEqual({ kind: "rejected", error: writeError })
  } else {
    expect(result.kind).toBe("authorized-pending")
    expect(actual.kind).toBe(mode === "rejected-unchanged" ? "failed" : "unconfirmed")
    if (actual.kind !== "failed" && actual.kind !== "unconfirmed") throw new Error("Expected attempted-stage result")
    expect(actual.stage).toBe(stage)
    expect(actual.mutations.map(m => m.stage)).toEqual(stages.slice(0, stages.indexOf(stage)))
    expect(f.h.writes.at(-1) && submittedPlaylistStage(f.h.writes.at(-1)!)).toBe(stage)
    if (mode === "write-and-read-error") {
      expect(actual.write).toEqual({ kind: "rejected", error: writeError })
      expect(actual.kind === "unconfirmed" && actual.observation).toEqual({ kind: "read-failed", error: readError })
    }
    if (mode === "ignored" && stage === "documents") expect(f.h.records().interimConversion).toEqual(before.local.interimConversion)
    f.h.get(undefined)
    if (mode !== "rejected-unchanged") expect((await f.owner.readWithdrawnWork(recoveryUi)).kind === "held" && (await f.owner.readWithdrawnWork(recoveryUi))).not.toHaveProperty("work", expect.arrayContaining([expect.objectContaining({ kind: "retained-playlist-restore" })]))
  }
  await f.owner.dispose()
}, 10000)

for (const part of ["document", "history"]) for (const rejected of [false, true]) test(`playlist documents partial ${part} rejected=${rejected} closes execution and fresh owners finish only the fixed after-values`, async () => {
    const f = await openPlaylist()
    const error = new Error(`partial-${part}`)
    f.h.write(async (items, apply) => {
      if (submittedPlaylistStage(items) !== "documents") { apply(items); return }
      const key = part === "document" ? "doc:setup:AAAAAAAAAAAAAAAA" : "sync"
      apply({ [key]: items[key]! })
      if (rejected) throw error
    })
    const result = playlistExecution(await recoverPlaylist(f))
    expect(result.kind).toBe("unconfirmed")
    if (result.kind !== "unconfirmed") throw new Error("Partial write cannot confirm")
    expect(result.write).toEqual(rejected ? { kind: "rejected", error } : { kind: "resolved" })
    expect(f.h.writes.at(-1) && submittedPlaylistStage(f.h.writes.at(-1)!)).toBe("documents")
    const saved = f.stores(); await f.owner.dispose()
    const next = await openPlaylist(JSON.parse(JSON.stringify(saved)))
    expect((await recoverPlaylist(next)).kind).toBe("recovered")
    expect(next.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents")).toHaveLength(1)
    await next.owner.dispose()
})

for (const stage of stages) for (const channel of ["explicit", "startup", "accounts", "ownership"] as const) test(`playlist ${stage} preserves its resolved write when ${channel} post-write observation fails`, async () => {
  const source = await playlistFixture(), f = createWithdrawnPlaylistHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing concrete host")
  let faulted = false
  const error = new Error(`post-write-${channel}-${stage}`)
  function failure() { if (faulted) throw error }
  const owner = createStartingLocalFilterWriter({ ...f.h.deps,
    startup: { ...f.h.deps.startup, async readInterimSnapshot() { if (channel === "startup") failure(); return f.h.deps.startup.readInterimSnapshot() } },
    recovery: { ...host, snapshot: { async read() { if (channel === "explicit") failure(); return host.snapshot.read() } }, accounts: { async read() { if (channel === "accounts") failure(); return host.accounts.read() } }, ownership: { async lookup(authority) { if (channel === "ownership") failure(); return host.ownership.lookup(authority) } } }
  })
  await heldReady(owner); const selected = await selectPlaylist(owner)
  f.h.write(async (batch, apply) => { apply(batch); if (submittedPlaylistStage(batch) === stage) faulted = true })
  const ran = playlistExecution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection }))
  expect(ran.kind).toBe("unconfirmed")
  if (ran.kind !== "unconfirmed") throw new Error("Incomplete post-write observation cannot confirm")
  expect(ran.stage).toBe(stage)
  expect(ran.write).toEqual({ kind: "resolved" })
  expect(ran.observation).toEqual({ kind: "read-failed", error })
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.slice(0, stages.indexOf(stage)))
  expect(f.h.writes.map(submittedPlaylistStage)).toEqual(stages.slice(0, stages.indexOf(stage) + 1))
  await owner.dispose()
})

test("playlist terminal continuation cannot rewrite document or history and never duplicates a resolution", async () => {
  for (const boundary of ["retire", "record"] as const) {
    const f = await openPlaylist()
    f.h.write(async (items, apply) => {
      apply(items)
      if (submittedPlaylistStage(items) === boundary) f.h.get(async () => { throw f.h.readError })
    })
    expect(playlistExecution(await recoverPlaylist(f)).kind).toBe("unconfirmed")
    f.h.get(undefined)
    const saved = f.stores(); await f.owner.dispose()
    const next = await openPlaylist(saved)
    expect(next.view.progress).toBe("terminal")
    expect((await recoverPlaylist(next)).kind).toBe("recovered")
    expect(next.h.writes.some(batch => submittedPlaylistStage(batch) === "documents")).toBe(false)
    expect(next.h.writes.filter(batch => submittedPlaylistStage(batch) === "record")).toHaveLength(boundary === "record" ? 0 : 1)
    const parsed = readRetainedRecovery(next.h.records().interimConversion)
    expect(parsed.kind === "recovery" && parsed.checkpoint.resolutions.length).toBe(1)
    await next.owner.dispose()
    const regressed = copy(saved), source = await playlistFixture()
    regressed.local["doc:setup:AAAAAAAAAAAAAAAA"] = copy(source.accepted.pending.effect.before)
    const held = createWithdrawnPlaylistHarness(regressed), owner = createStartingLocalFilterWriter(held.h.deps)
    await heldReady(owner)
    const review = await owner.readWithdrawnWork(recoveryUi)
    expect(review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")).toBe(false)
    expect(held.h.writes).toEqual([])
    await owner.dispose()
  }
})

test("playlist done recurrence refuses an identical accepted pending identity without a new occurrence", async () => {
  const f = await openPlaylist()
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  const done = f.stores(), accepted = f.view.identity.operation.record
  await f.owner.dispose()
  done.local.interimConversion = copy(accepted)
  const next = createWithdrawnPlaylistHarness(done), owner = createStartingLocalFilterWriter(next.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")).toBe(false)
  expect(parseConsentJobs(next.h.records()[consentJobsKey])?.next).toBe(1)
  expect(next.h.writes).toEqual([])
  await owner.dispose()
})


for (const drift of ["device-extension", "canonical-key", "parent", "history", "source", "control-generation", "effect", "join", "removal"] as const) test(`playlist complete projection refuses ${drift} after capture`, async () => {
  const f = await openPlaylist()
  f.h.foreign(records => {
    if (drift === "device-extension" && consentObject(records.device)) records.device.extensionAfterCapture = { full: [false, null] }
    if (drift === "canonical-key") records["cache:AAAAAAAAAAAAAAAA"] = { extra: true }
    if (drift === "parent" && consentObject(records["doc:setup:AAAAAAAAAAAAAAAA"])) records["doc:setup:AAAAAAAAAAAAAAAA"].extension = "drift"
    if (drift === "history" && consentObject(records.sync)) records.sync.extension = "drift"
    if (drift === "source" && consentObject(records["account:AAAAAAAAAAAAAAAA"])) records["account:AAAAAAAAAAAAAAAA"].extension = "drift"
    if (drift === "control-generation" && consentObject(records["consent:state"]) && typeof records["consent:state"].generation === "number") records["consent:state"].generation++
    if (drift === "effect" && isAcceptedPlaylistRecord(records.interimConversion)) {
      const next: unknown = { ...records.interimConversion, pending: { ...records.interimConversion.pending, effect: { ...records.interimConversion.pending.effect, parent: { altered: true } } } }
      if (!consentObject(next)) throw new Error("Invalid composed negative effect")
      records.interimConversion = next
    }
    if (drift === "join") records["pending:sync-join"] = { v: 99 }
    if (drift === "removal") records["pending:account-removal"] = { v: 99 }
  })
  const after = f.stores()
  expect((await recoverPlaylist(f)).kind).toBe("authorized-pending")
  expect(f.h.writes).toEqual([])
  expect(f.stores()).toEqual(after)
  await f.owner.dispose()
})

test("playlist a current generation change after documents preserves the attempted stage and stops before retirement", async () => {
  const f = await openPlaylist()
  f.h.write(async (items, apply) => {
    apply(items)
    if (submittedPlaylistStage(items) === "documents") {
      const renewal = await renewWithdrawalAgreement(f.stores())
      f.h.foreign(records => { Object.assign(records, renewal.stores.local) })
    }
  })
  const actual = playlistExecution(await recoverPlaylist(f))
  expect(actual.kind).toBe("unconfirmed")
  expect(actual.kind === "unconfirmed" && actual.stage).toBe("documents")
  expect(f.h.writes.map(submittedPlaylistStage)).toEqual(["register", "prepare", "authorize", "documents"])
  await f.owner.dispose()
})

test("playlist copy, foreign owner, private origin, changed origin and consumption refuse public selections", async () => {
  const f = await openPlaylist(), foreign = await openPlaylist()
  expect(await f.owner.recoverWithdrawnWork(recoveryUi, { review: { ...f.review.review }, job: f.view.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await foreign.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await f.owner.recoverWithdrawnWork({ ...recoveryUi, incognito: true }, { review: f.review.review, job: f.view.selection })).toEqual({ kind: "refused", reason: "private" })
  expect(await recoverPlaylist(f)).toEqual({ kind: "unavailable", reason: "stale" })
  const next = await selectPlaylist(f.owner)
  const changed = await f.owner.recoverWithdrawnWork({ ...recoveryUi, windowId: 77 }, { review: next.review.review, job: next.view.selection })
  expect(playlistExecution(changed).kind).toBe("unavailable")
  const copied = await selectPlaylist(f.owner)
  expect(await f.owner.recoverWithdrawnWork(recoveryUi, { review: copied.review.review, job: { ...copied.view.selection } })).toEqual({ kind: "unavailable", reason: "unsupported-recovery" })
  expect(f.h.writes).toEqual([])
  await f.owner.dispose(); await foreign.owner.dispose()
})

test("playlist observed local ABA invalidates capture while repeated equal reads stay stable", async () => {
  const f = await openPlaylist(), original = f.h.records().unrelated
  await f.owner.readWithdrawnWork(recoveryUi)
  f.h.foreign(records => { records.unrelated = { observed: "B" } })
  await f.owner.readWithdrawnWork(recoveryUi)
  f.h.foreign(records => { records.unrelated = copy(original!) })
  expect(playlistExecution(await recoverPlaylist(f)).kind).toBe("unavailable")
  expect(f.h.writes).toEqual([])
  const fresh = await selectPlaylist(f.owner)
  expect((await f.owner.recoverWithdrawnWork(recoveryUi, { review: fresh.review.review, job: fresh.view.selection })).kind).toBe("recovered")
  await f.owner.dispose()
})


test("playlist registered exhaustion finishes, unregistered exhaustion refuses, and old ledger witnesses survive", async () => {
  const f = await openPlaylist()
  f.h.write(async (items, apply) => { apply(items); if (submittedPlaylistStage(items) === "register") f.h.get(async () => { throw f.h.readError }) })
  await recoverPlaylist(f); f.h.get(undefined)
  const registered = f.stores(); await f.owner.dispose()
  const ledger = parseConsentJobs(registered.local[consentJobsKey])
  if (!ledger) throw new Error("Missing registered ledger")
  registered.local[consentJobsKey] = { ...ledger, next: Number.MAX_SAFE_INTEGER }
  const resumed = await openPlaylist(registered)
  expect((await recoverPlaylist(resumed)).kind).toBe("recovered")
  expect(parseConsentJobs(resumed.h.records()[consentJobsKey])?.next).toBe(Number.MAX_SAFE_INTEGER)
  await resumed.owner.dispose()
  const max = copy((await playlistFixture()).stores)
  max.local[consentJobsKey] = { v: 1, kind: "consent-jobs", deviceId: "synthetic-device", next: Number.MAX_SAFE_INTEGER, jobs: [] }
  const blocked = createWithdrawnPlaylistHarness(max), owner = createStartingLocalFilterWriter(blocked.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")).toBe(false)
  expect(blocked.h.writes).toEqual([])
  await owner.dispose()
})

test("playlist filter ledger rejects missing, duplicated and mismatched immutable registration witnesses", async () => {
  const f = await openPlaylist(); await recoverPlaylist(f)
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

for (const forged of [false, true]) test(`playlist private one-use filter authority and independent completion reject forged callback=${forged}`, async () => {
  const f = createWithdrawnPlaylistHarness((await playlistFixture()).stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing concrete authority")
  let view: RetainedPlaylistView | undefined, savedPermit: ExactRetainedPlaylistPermit | undefined, closed = 0
  const ports = {
    async setLedger(ledger: Parameters<Parameters<typeof executeExactRetainedPlaylist>[1]["setLedger"]>[0]) { await f.h.deps.local.set({ [consentJobsKey]: ledger }) },
    async setCompleted(record: Parameters<Parameters<typeof executeExactRetainedPlaylist>[1]["setCompleted"]>[0]) { await f.h.deps.local.set({ interimConversion: record }) },
    async setPlaylist(effect: Parameters<Parameters<typeof executeExactRetainedPlaylist>[1]["setPlaylist"]>[0]) {
      const batch: JsonObject = { "doc:setup:AAAAAAAAAAAAAAAA": effect.after }
      if (effect.history.after.kind === "present") batch.sync = effect.history.after.raw
      await f.h.deps.local.set(batch)
    }
  }
  const controller = createConsentRecovery({
    observe: async () => f.h.records(), set: items => f.h.deps.local.set(items), revision: () => 0, stopped: () => false,
    observeRetainedAgreement: async () => interimSnapshot(f.h.records()), onRetainedV1Uncertainty() {}, onPlaylistUncertainty() { closed++ },
    async execute() { throw new Error("No removal authority") },
    playlistRecovery: { host, readSync: permit => readExactPlaylistSync(permit, async () => f.stores().sync), async execute(permit) {
      savedPermit = permit
      await expect(executeExactRetainedPlaylist({ ...permit }, ports)).rejects.toThrow("Invalid or consumed")
      expect(await readExactPlaylistSync(permit, async () => ({}))).toEqual({})
      if (!view) throw new Error("Missing exact selected view")
      if (forged) return { kind: "confirmed", identity: view.identity, original: view.identity.original, current: view.current, activation: "held", mutations: [] }
      const result = await executeExactRetainedPlaylist(permit, ports)
      await expect(executeExactRetainedPlaylist(permit, ports)).rejects.toThrow("Invalid or consumed")
      return result
    } }
  })
  const review = await controller.read(recoveryUi)
  if (review.kind !== "held") throw new Error("Missing held review")
  view = review.work.find(item => item.kind === "retained-playlist-restore")
  if (!view) throw new Error("Missing explicit filter")
  const result = await controller.recover(recoveryUi, { review: review.review, job: view.selection })
  expect(result.kind).toBe(forged ? "authorized-pending" : "recovered")
  expect(closed).toBe(forged ? 1 : 0)
  expect(f.h.writes.map(submittedPlaylistStage)).toEqual(forged ? ["register", "prepare", "authorize"] : [...stages])
  if (!savedPermit) throw new Error("Missing executed permit")
  await expect(executeExactRetainedPlaylist(savedPermit, ports)).rejects.toThrow("Invalid or consumed")
  await expect(readExactPlaylistSync(savedPermit, async () => ({}))).rejects.toThrow("No live exact")
})


test("playlist composed stable completed sibling retains the complete old job and witness in original order", async () => {
  const previous = await open()
  await recover(previous)
  const raw = copy(previous.h.records()[consentJobsKey])
  if (!consentObject(raw) || !Array.isArray(raw.jobs) || !Array.isArray(raw.retainedDocuments)) throw new Error("Missing actual completed ledger")
  const originalJob = copy(raw.jobs[0]), originalWitness = copy(raw.retainedDocuments[0]), nextInput = await createWithdrawnPlaylistInput(false, true)
  await previous.owner.dispose()
  const composed = copy(nextInput.stores)
  composed.local[consentJobsKey] = raw
  const f = await openPlaylist(composed)
  expect(f.view.identity.occurrence).toBe(1)
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  const final = f.h.records()[consentJobsKey]
  if (!consentObject(final) || !Array.isArray(final.jobs) || !Array.isArray(final.retainedDocuments)) throw new Error("Missing final ledger")
  expect(final.jobs[0]).toEqual(originalJob)
  expect(final.retainedDocuments[0]).toEqual(originalWitness)
  expect(final.jobs).toHaveLength(2)
  expect(final.retainedDocuments).toHaveLength(2)
  expect(final.next).toBe(2)
  expect(f.h.records().interimConversion).toEqual(completedPlaylistRecord(f.view.identity))
  await f.owner.dispose()
})

test("playlist composed active filter occurrence sharing the selected fixed destination stays held", async () => {
  const previous = await open()
  previous.h.write(async (batch, apply) => { apply(batch); if (submittedStage(batch) === "register") previous.h.get(async () => { throw previous.h.readError }) })
  await recover(previous); previous.h.get(undefined)
  const ledger = copy(previous.h.records()[consentJobsKey]), nextInput = await createWithdrawnPlaylistInput(false, true)
  if (!consentObject(ledger) || !parseConsentJobs(ledger)) throw new Error("Missing actual active registration")
  await previous.owner.dispose()
  const composed = copy(nextInput.stores); composed.local[consentJobsKey] = ledger
  const f = createWithdrawnPlaylistHarness(composed), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")).toBe(false)
  expect(f.stores()).toEqual(composed)
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

for (const mode of ["reorder", "singular-other"] as const) test(`playlist fresh plural chosen owner accepts ${mode} without singular authority`, async () => {
  const source = await createWithdrawnPlaylistInput(false, false, { siblings: true }), f = createWithdrawnPlaylistHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing plural host")
  const rows = await host.accounts.read()
  let reads = 0, lookups = 0
  const owner = createStartingLocalFilterWriter({ ...f.h.deps, recovery: { ...host,
    authority: { async read() { throw new Error("Playlist must use plural authority") } },
    accounts: { async read() { reads++; return mode === "reorder" && reads % 2 ? [...copy(rows)].reverse() : copy(rows) } },
    ownership: { async lookup(authority) { lookups++; expect(authority.acct).toBe(source.accepted.pending.effect.key.acct); return host.ownership.lookup(authority) } }
  } })
  await heldReady(owner); const selected = await selectPlaylist(owner)
  expect(lookups).toBe(0)
  const result = await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
  expect(result.kind).toBe("recovered")
  expect(lookups).toBeGreaterThan(1)
  expect(f.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(source.stores.local["doc:setup:AAAAAAAAAAAAAAAA"])
  await owner.dispose()
})

for (const fault of ["duplicate", "chosen-missing", "chosen-unowned", "lineage", "wrong-returned-owner", "signed-out", "incognito", "empty-lease"] as const) test(`playlist plural chosen authority refuses ${fault} before IO`, async () => {
  const source = await playlistFixture(), f = createWithdrawnPlaylistHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing plural host")
  const rows = await host.accounts.read(), chosen = rows[0]
  if (!chosen) throw new Error("Missing chosen account")
  const other = "BBBBBBBBBBBBBBBB"
  if (!isAccountKey(other)) throw new Error("Invalid synthetic account")
  const b = { ...chosen, acct: other }
  const owner = createStartingLocalFilterWriter({ ...f.h.deps, recovery: { ...host,
    accounts: { async read() {
      const next = copy(fault === "chosen-missing" ? [b] : fault === "duplicate" ? [chosen, chosen] : [chosen, b])
      if (fault === "signed-out") Reflect.set(next[0]!, "signedIn", false)
      if (fault === "incognito") Reflect.set(next[0]!, "incognito", true)
      if (fault === "empty-lease") Reflect.set(next[0]!, "lease", " ")
      return next
    } },
    ownership: { async lookup(authority) {
      const result = await host.ownership.lookup(authority)
      if (fault === "chosen-unowned" && authority.acct === chosen.acct) return { kind: "unavailable" }
      if (fault === "lineage") return { ...result, lineage: "composed-negative" }
      if (fault === "wrong-returned-owner" && result.kind === "fixture-owned") return { ...result, authority: b }
      return result
    } }
  } })
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  if (review.kind === "held") {
    const view = review.work.find(view => view.kind === "retained-playlist-restore")
    if (view) expect((await owner.recoverWithdrawnWork(recoveryUi, { review: review.review, job: view.selection })).kind).toBe("authorized-pending")
  }
  expect(f.h.writes).toEqual([])
  expect(f.stores()).toEqual(source.stores)
  await owner.dispose()
})

test("playlist plural observations invalidate captured ABA while equal normalized sets remain valid", async () => {
  const source = await playlistFixture(), f = createWithdrawnPlaylistHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing plural host")
  let changed = false
  const owner = createStartingLocalFilterWriter({ ...f.h.deps, recovery: { ...host, accounts: { async read() { const rows = await host.accounts.read(); return changed ? rows.map(row => ({ ...row, lease: "observed-B" })) : rows } } } })
  await heldReady(owner); const selected = await selectPlaylist(owner)
  changed = true; await owner.readWithdrawnWork(recoveryUi)
  changed = false; await owner.readWithdrawnWork(recoveryUi)
  expect(playlistExecution(await owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })).kind).toBe("unavailable")
  expect(f.h.writes).toEqual([])
  await owner.dispose()
})

for (const image of ["missing", "deleted", "newer", "third", "settings"] as const) test(`playlist live Setup protection refuses ${image} before capture`, async () => {
  const source = await playlistFixture(), stores = copy(source.stores), effect = source.accepted.pending.effect
  if (image === "missing") delete stores.local["doc:setup:AAAAAAAAAAAAAAAA"]
  if (image === "deleted") stores.local["doc:setup:AAAAAAAAAAAAAAAA"] = { v: 1, gen: "deleted", at: 201, by: "synthetic-device", deleted: true }
  if (image === "newer") stores.local["doc:setup:AAAAAAAAAAAAAAAA"] = { v: 99 }
  if (image === "third") stores.local["doc:setup:AAAAAAAAAAAAAAAA"] = { ...effect.after, gen: "different-envelope" }
  if (image === "settings") stores.local["doc:settings"] = { v: 99 }
  const f = createWithdrawnPlaylistHarness(stores), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner); const review = await owner.readWithdrawnWork(recoveryUi)
  expect(review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore")).toBe(false)
  expect(f.h.writes).toEqual([])
  expect(f.stores()).toEqual(stores)
  await owner.dispose()
})

for (const path of [["0"], [-1], [0.5], [Number.MAX_SAFE_INTEGER + 1], [0, 1]] as const) test(`playlist exact numeric occurrence refuses composed locator ${JSON.stringify(path)}`, async () => {
  const source = await playlistFixture(), raw = copy(source.accepted)
  const invalid: unknown = { ...raw, pending: { ...raw.pending, effect: { ...raw.pending.effect, item: { sourceKey: "playlists", path } } } }
  expect(isAcceptedPlaylistRecord(invalid)).toBe(false)
})

test("playlist actual absent-history acceptance allocates history only through its fixed ordinary effect", async () => {
  const source = await createWithdrawnPlaylistInput(false, false, { absentHistory: true }), f = await openPlaylist(source.stores)
  expect(source.accepted.pending.effect.history.before).toEqual({ kind: "absent" })
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  expect(f.h.records().sync).toEqual({ joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true })
  await f.owner.dispose()
})

test("playlist final controller synced admission detects drift after executor confirmation", async () => {
  const source = await createWithdrawnPlaylistInput(true), f = createWithdrawnPlaylistHarness(source.stores), host = f.h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing synced host")
  let completed: RetainedPlaylistExecution | undefined
  const controller = createConsentRecovery({
    observe: async () => f.h.records(), set: items => f.h.deps.local.set(items), revision: () => 0, stopped: () => false,
    observeRetainedAgreement: async () => interimSnapshot(f.h.records()), onRetainedV1Uncertainty() {}, onPlaylistUncertainty() {},
    async execute() { throw new Error("No removal authority") },
    playlistRecovery: { host, readSync: permit => readExactPlaylistSync(permit, async () => f.stores().sync), async execute(permit) {
      completed = await executeExactRetainedPlaylist(permit, {
        async setLedger(ledger) { await f.h.deps.local.set({ [consentJobsKey]: ledger }) },
        async setCompleted(record) { await f.h.deps.local.set({ interimConversion: record }) },
        async setPlaylist(effect) { const batch: JsonObject = { "doc:setup:AAAAAAAAAAAAAAAA": effect.after }; if (effect.history.after.kind === "present") batch.sync = effect.history.after.raw; await f.h.deps.local.set(batch) }
      })
      f.h.remote(records => { records["s:settings"] = { v: 99 } })
      return completed
    } }
  })
  const review = await controller.read(recoveryUi)
  if (review.kind !== "held") throw new Error("Missing held synced review")
  const view = review.work.find(view => view.kind === "retained-playlist-restore")
  if (!view) throw new Error("Missing selected synced playlist")
  const result = await controller.recover(recoveryUi, { review: review.review, job: view.selection })
  expect(completed?.kind).toBe("confirmed")
  expect(result.kind).toBe("authorized-pending")
  expect(result.kind === "authorized-pending" && "completionCheck" in result && result.completionCheck.kind).toBe("different")
  expect(parseConsentJobs(f.h.records()[consentJobsKey])?.jobs.at(-1)?.permission.kind).toBe("done")
})


let installedInput: ReturnType<typeof createInstalledPlaylistInput> | undefined
function installedFixture() { return installedInput ??= createInstalledPlaylistInput() }
function installedBasis(record: AcceptedPlaylistRecord) {
  const basis = record.basis.checkpoint
  if (basis.v !== 3) throw new Error("Installed-V3 basis required")
  return basis
}
function contractCompleted(accepted: AcceptedPlaylistRecord): JsonObject {
  const value: unknown = { ...accepted, resolutions: [...accepted.resolutions, { kind: "playlist-restored", effect: accepted.pending.effect }], pending: { kind: "none" } }
  if (!consentObject(value)) throw new Error("Completed playlist must be JSON")
  return value
}
function fixedDocuments(accepted: AcceptedPlaylistRecord): JsonObject {
  const effect = accepted.pending.effect
  return { [`doc:setup:${effect.key.acct}`]: effect.after, ...(effect.history.after.kind === "present" ? { sync: effect.history.after.raw } : {}) }
}
function offersPlaylist(review: Awaited<ReturnType<ReturnType<typeof createStartingLocalFilterWriter>["readWithdrawnWork"]>>) { return review.kind === "held" && review.work.some(view => view.kind === "retained-playlist-restore") }
const outbound = ["stamp", "generation", "sync-get", "sync-set", "sync-subscribe", "timer"]

for (const images of [[false, false], [true, false], [false, true], [true, true]] as const) test(`installed-V3 playlist exact actual IO images document=${images[0]} history=${images[1]}`, async () => {
  const source = await createInstalledPlaylistInput({ images }), basis = installedBasis(source.accepted), effect = source.accepted.pending.effect, destination = `doc:setup:${effect.key.acct}`
  expect(source.installed[destination]).toEqual(effect.before)
  expect([effect.scope, effect.admission]).toEqual([{ kind: "this-browser" }, { kind: "off" }])
  const f = await openPlaylist(source.stores), before = f.stores(), current = readConsentDevice(before.local)
  if (current.kind !== "supported" || !current.control || !current.device.consent) throw new Error("Missing renewed agreement")
  expect(f.view.registration).toBe("unregistered")
  expect(f.view.identity.operation.record).toEqual(source.accepted)
  expect(f.view.identity.original).toEqual(basis.agreed.agreement.effect.consent)
  expect(f.view.identity.original).not.toEqual(current.device.consent)
  expect(f.view.current).toEqual(current.device.consent)
  const result = await recoverPlaylist(f), ran = playlistExecution(result), after = f.h.records()
  expect(result.kind).toBe("recovered")
  expect(ran.kind === "confirmed" && ran.original).toEqual(basis.agreed.agreement.effect.consent)
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.filter(stage => stage !== "documents" || !images[0] || !images[1]))
  expect(f.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents")).toEqual(images[0] && images[1] ? [] : [fixedDocuments(source.accepted)])
  expect(after[destination]).toEqual(effect.after)
  expect(after.interimConversion).toEqual(contractCompleted(source.accepted))
  const changed = Object.keys({ ...before.local, ...after }).filter(key => !sameConsentValue(before.local[key], after[key])).sort()
  expect(changed).toEqual([consentJobsKey, "interimConversion", ...(images[0] ? [] : [destination]), ...(images[1] ? [] : ["sync"])].sort())
  const permissions = f.h.writes.flatMap(batch => {
    const job = parseConsentJobs(batch[consentJobsKey])?.jobs.find(job => job.identity.operation.kind === "retained-playlist-restore")
    return job && "generation" in job.permission ? [job.permission] : []
  })
  expect(sameConsentValue(permissions, ["prepared", "armed", "retiring"].map(kind => ({ kind, generation: current.control?.generation, current: current.device.consent })))).toBe(true)
  expect(f.h.effects.filter(value => outbound.includes(String(value)))).toEqual([])
  await heldReady(f.owner)
  await f.owner.dispose()
}, 120000)

test("installed-V3 playlist equal numeric occurrences keep the actual A prefix and immutable B destination", async () => {
  const source = await createInstalledPlaylistInput({ siblings: true }), f = await openPlaylist(source.stores), before = f.stores()
  expect(source.accepted.resolutions).toHaveLength(1)
  expect(source.accepted.pending.effect.item).toEqual({ sourceKey: "playlists", path: [1] })
  expect(String(source.accepted.pending.effect.key.acct)).toBe("BBBBBBBBBBBBBBBB")
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  expect(f.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(before.local["doc:setup:AAAAAAAAAAAAAAAA"])
  expect(f.h.records()["doc:setup:BBBBBBBBBBBBBBBB"]).toEqual(source.accepted.pending.effect.after)
  expect(f.h.records().playlists).toEqual(["PL_GLOBAL", "PL_GLOBAL"])
  expect(f.h.records().interimConversion).toEqual(contractCompleted(source.accepted))
  await f.owner.dispose()
}, 120000)

for (const stage of stages) test(`installed-V3 playlist restart after ${stage} replays nothing until a fresh explicit recover`, async () => {
  const source = await installedFixture(), f = await openPlaylist(source.stores)
  f.h.write(async (items, apply) => { apply(items); if (submittedPlaylistStage(items) === stage) f.h.get(async () => { throw f.h.readError }) })
  const first = await recoverPlaylist(f), ran = playlistExecution(first)
  expect(first.kind).toBe("authorized-pending")
  expect(ran.kind === "unconfirmed" && [ran.stage, ran.write.kind, ran.observation.kind]).toEqual([stage, "resolved", "read-failed"])
  f.h.get(undefined)
  const saved = f.stores(); await f.owner.dispose()
  const idle = createWithdrawnPlaylistHarness(copy(saved)), owner = createStartingLocalFilterWriter(idle.h.deps)
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi)
  expect(idle.h.writes).toEqual([])
  expect(idle.h.effects.filter(value => outbound.includes(String(value)))).toEqual([])
  expect(idle.stores()).toEqual(saved)
  await owner.dispose()
  const view = review.kind === "held" ? review.work.find(view => view.kind === "retained-playlist-restore") : undefined
  if (stage === "done") {
    expect(view).toBeUndefined()
    expect(saved.local.interimConversion).toEqual(contractCompleted(source.accepted))
    return
  }
  const terminal = stages.indexOf(stage) >= stages.indexOf("retire")
  expect(view?.kind === "retained-playlist-restore" && [view.registration, view.progress, view.checkpoint]).toEqual(["registered", terminal ? "terminal" : "accepted", stage === "record" ? "completed" : "pending"])
  const next = await openPlaylist(copy(saved))
  expect((await recoverPlaylist(next)).kind).toBe("recovered")
  expect([...f.h.writes, ...next.h.writes].filter(batch => submittedPlaylistStage(batch) === "documents")).toEqual([fixedDocuments(source.accepted)])
  expect(next.h.writes.map(submittedPlaylistStage)).not.toContain("register")
  expect(next.h.records().interimConversion).toEqual(contractCompleted(source.accepted))
  expect(parseConsentJobs(next.h.records()[consentJobsKey])?.next).toBe(1)
  await next.owner.dispose()
}, 120000)

test("installed-V3 playlist terminal continuation keeps a regressed Setup held", async () => {
  const source = await installedFixture(), effect = source.accepted.pending.effect, f = await openPlaylist(source.stores)
  f.h.write(async (items, apply) => { apply(items); if (submittedPlaylistStage(items) === "retire") f.h.get(async () => { throw f.h.readError }) })
  expect(playlistExecution(await recoverPlaylist(f)).kind).toBe("unconfirmed")
  f.h.get(undefined)
  const regressed = f.stores(); await f.owner.dispose()
  regressed.local[`doc:setup:${effect.key.acct}`] = copy(effect.before)
  const held = createWithdrawnPlaylistHarness(regressed), owner = createStartingLocalFilterWriter(held.h.deps)
  await heldReady(owner)
  expect(offersPlaylist(await owner.readWithdrawnWork(recoveryUi))).toBe(false)
  expect(held.h.writes).toEqual([])
  await owner.dispose()
}, 120000)

test("installed-V3 playlist done recurrence refuses the identical accepted record without a new occurrence", async () => {
  const source = await installedFixture(), f = await openPlaylist(source.stores)
  expect((await recoverPlaylist(f)).kind).toBe("recovered")
  const done = f.stores(); await f.owner.dispose()
  done.local.interimConversion = copy(source.accepted)
  const next = createWithdrawnPlaylistHarness(done), owner = createStartingLocalFilterWriter(next.h.deps)
  await heldReady(owner)
  expect(offersPlaylist(await owner.readWithdrawnWork(recoveryUi))).toBe(false)
  expect(parseConsentJobs(next.h.records()[consentJobsKey])?.next).toBe(1)
  expect(next.h.writes).toEqual([])
  await owner.dispose()
}, 120000)

test("installed-V3 playlist ledger keeps the accepting agreement and device", async () => {
  const source = await installedFixture(), basis = installedBasis(source.accepted), f = await openPlaylist(source.stores)
  f.h.write(async (items, apply) => { apply(items); if (submittedPlaylistStage(items) === "register") f.h.get(async () => { throw f.h.readError }) })
  await recoverPlaylist(f); f.h.get(undefined)
  const raw = copy(f.h.records()[consentJobsKey]), job = consentObject(raw) && Array.isArray(raw.jobs) ? raw.jobs[0] : undefined
  if (!consentObject(raw) || !consentObject(job) || !consentObject(job.identity)) throw new Error("Missing registered installed-V3 job")
  const identity = job.identity
  expect(parseConsentJobs(raw)?.jobs[0]?.identity.original).toEqual(basis.agreed.agreement.effect.consent)
  expect(parseConsentJobs(raw)?.retainedDocuments).toHaveLength(1)
  expect(parseRetainedPlaylistIdentity(identity)?.operation.record).toEqual(source.accepted)
  expect(parseRetainedPlaylistIdentity({ ...identity, original: f.view.current })).toBeUndefined()
  expect(parseRetainedPlaylistIdentity({ ...identity, deviceId: "other-device" })).toBeUndefined()
  expect(parseConsentJobs({ ...raw, jobs: [{ ...job, identity: { ...identity, original: f.view.current } }] })).toBeUndefined()
  const missing = copy(raw); delete missing.retainedDocuments
  expect(parseConsentJobs(missing)).toBeUndefined()
  const uninstalled: unknown = { ...source.accepted, basis: { ...source.accepted.basis, checkpoint: { ...basis, installation: { ...basis.installation, kind: "accepted" } } } }
  expect(isAcceptedPlaylistRecord(source.accepted)).toBe(true)
  expect(isAcceptedPlaylistRecord(uninstalled)).toBe(false)
  await f.owner.dispose()
}, 120000)

for (const drift of ["installed-settings", "installed-sibling-setup", "schema", "unrelated-canonical", "destination-tombstone", "source", "basis-installation", "basis-agreement", "uninstalled-basis", "effect", "device-extension", "control-generation", "join", "removal"] as const) test(`installed-V3 playlist refuses ${drift} after capture without writes`, async () => {
  const source = await installedFixture(), acct = source.accepted.pending.effect.key.acct, f = await openPlaylist(source.stores)
  for (const key of ["doc:settings", "doc:setup:BBBBBBBBBBBBBBBB", "schema"]) expect(Object.hasOwn(source.installed, key)).toBe(true)
  f.h.foreign(records => {
    const raw = records.interimConversion
    const checkpoint = consentObject(raw) && consentObject(raw.basis) && consentObject(raw.basis.checkpoint) ? raw.basis.checkpoint : undefined
    if (drift === "installed-settings" && consentObject(records["doc:settings"])) records["doc:settings"].extension = "drift"
    if (drift === "installed-sibling-setup" && consentObject(records["doc:setup:BBBBBBBBBBBBBBBB"])) records["doc:setup:BBBBBBBBBBBBBBBB"].extension = "drift"
    if (drift === "schema") records.schema = 99
    if (drift === "unrelated-canonical") records["doc:filter:BBBBBBBBBBBBBBBB:PL_TWO"] = { v: 1, gen: "foreign", at: 1, by: "foreign-device", data: { mode: "deny", on: false, channels: [] } }
    if (drift === "destination-tombstone") records[`doc:setup:${acct}`] = { v: 1, gen: "deleted", at: 201, by: "synthetic-device", deleted: true }
    if (drift === "source" && consentObject(records["account:AAAAAAAAAAAAAAAA"])) records["account:AAAAAAAAAAAAAAAA"].extension = "drift"
    if (drift === "basis-installation" && checkpoint && consentObject(checkpoint.installation)) checkpoint.installation.extension = "drift"
    if (drift === "uninstalled-basis" && checkpoint && consentObject(checkpoint.installation)) checkpoint.installation.kind = "accepted"
    if (drift === "basis-agreement" && checkpoint && consentObject(checkpoint.agreed) && consentObject(checkpoint.agreed.agreement)) checkpoint.agreed.agreement.extension = "drift"
    if (drift === "effect" && consentObject(raw) && consentObject(raw.pending) && consentObject(raw.pending.effect) && consentObject(raw.pending.effect.after)) raw.pending.effect.after.gen = "drift"
    if (drift === "device-extension" && consentObject(records.device)) records.device.extensionAfterCapture = { full: [false, null] }
    if (drift === "control-generation" && consentObject(records["consent:state"]) && typeof records["consent:state"].generation === "number") records["consent:state"].generation++
    if (drift === "join") records["pending:sync-join"] = { v: 99 }
    if (drift === "removal") records["pending:account-removal"] = { v: 99 }
  })
  const after = f.stores()
  expect(after.local).not.toEqual(source.stores.local)
  expect((await recoverPlaylist(f)).kind).toBe("authorized-pending")
  expect(f.h.writes).toEqual([])
  expect(f.stores()).toEqual(after)
  await f.owner.dispose()
}, 120000)

for (const image of ["missing", "deleted", "newer", "third", "uninstalled-basis"] as const) test(`installed-V3 playlist offers no selection for ${image} before capture`, async () => {
  const source = await installedFixture(), stores = copy(source.stores), effect = source.accepted.pending.effect, destination = `doc:setup:${effect.key.acct}`
  if (image === "missing") delete stores.local[destination]
  if (image === "deleted") stores.local[destination] = { v: 1, gen: "deleted", at: 201, by: "synthetic-device", deleted: true }
  if (image === "newer") stores.local[destination] = { v: 99 }
  if (image === "third") stores.local[destination] = { ...effect.after, gen: "different-envelope" }
  if (image === "uninstalled-basis") {
    const basis = installedBasis(source.accepted)
    stores.local.interimConversion = JSON.parse(JSON.stringify({ ...source.accepted, basis: { ...source.accepted.basis, checkpoint: { ...basis, installation: { ...basis.installation, kind: "accepted" } } } }))
  }
  const f = createWithdrawnPlaylistHarness(stores), owner = createStartingLocalFilterWriter(f.h.deps)
  await heldReady(owner)
  expect(offersPlaylist(await owner.readWithdrawnWork(recoveryUi))).toBe(false)
  expect(f.h.writes).toEqual([])
  expect(f.stores()).toEqual(stores)
  await owner.dispose()
}, 120000)

for (const change of ["reordered", "chosen-missing", "chosen-unowned", "lineage"] as const) test(`installed-V3 playlist plural chosen authority ${change}`, async () => {
  const source = await installedFixture(), f = createWithdrawnPlaylistHarness(source.stores), host = f.h.deps.recovery, acct = String(source.accepted.pending.effect.key.acct)
  if (host.kind !== "fixture") throw new Error("Missing plural host")
  const owner = createStartingLocalFilterWriter({ ...f.h.deps, recovery: { ...host,
    accounts: { async read() { const rows = await host.accounts.read(); return change === "reordered" ? [...rows].reverse() : change === "chosen-missing" ? rows.filter(row => String(row.acct) !== acct) : rows } },
    ownership: { async lookup(authority) {
      const result = await host.ownership.lookup(authority)
      if (change === "chosen-unowned" && String(authority.acct) === acct) return { kind: "unavailable" }
      return change === "lineage" ? { ...result, lineage: "composed-negative" } : result
    } }
  } })
  await heldReady(owner)
  const review = await owner.readWithdrawnWork(recoveryUi), view = review.kind === "held" ? review.work.find(view => view.kind === "retained-playlist-restore") : undefined
  if (change === "reordered") {
    if (review.kind !== "held" || view?.kind !== "retained-playlist-restore") throw new Error("Reordered rows keep the selection")
    expect((await owner.recoverWithdrawnWork(recoveryUi, { review: review.review, job: view.selection })).kind).toBe("recovered")
  } else {
    if (review.kind === "held" && view?.kind === "retained-playlist-restore") expect((await owner.recoverWithdrawnWork(recoveryUi, { review: review.review, job: view.selection })).kind).toBe("authorized-pending")
    expect(f.h.writes).toEqual([])
    expect(f.stores()).toEqual(source.stores)
  }
  await owner.dispose()
}, 120000)

test("installed-V3 playlist copied, foreign-owner, private, invalid-origin and stale captures refuse", async () => {
  const source = await installedFixture(), f = await openPlaylist(source.stores), foreign = await openPlaylist(source.stores)
  expect(await f.owner.recoverWithdrawnWork(recoveryUi, { review: { ...f.review.review }, job: f.view.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await foreign.owner.recoverWithdrawnWork(recoveryUi, { review: f.review.review, job: f.view.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await f.owner.recoverWithdrawnWork({ ...recoveryUi, incognito: true }, { review: f.review.review, job: f.view.selection })).toEqual({ kind: "refused", reason: "private" })
  expect(await recoverPlaylist(f)).toEqual({ kind: "unavailable", reason: "stale" })
  const invalid = await selectPlaylist(f.owner)
  expect(await f.owner.recoverWithdrawnWork({ ...recoveryUi, windowId: -1 }, { review: invalid.review.review, job: invalid.view.selection })).toEqual({ kind: "refused", reason: "invalid-origin" })
  const stale = await selectPlaylist(f.owner), original = f.h.records().unrelated
  expect(original).toBeDefined()
  f.h.foreign(records => { records.unrelated = { observed: "B" } })
  await f.owner.readWithdrawnWork(recoveryUi)
  f.h.foreign(records => { records.unrelated = copy(original!) })
  expect(playlistExecution(await f.owner.recoverWithdrawnWork(recoveryUi, { review: stale.review.review, job: stale.view.selection })).kind).toBe("unavailable")
  expect(f.h.writes).toEqual([])
  expect(foreign.h.writes).toEqual([])
  const fresh = await selectPlaylist(f.owner)
  expect((await f.owner.recoverWithdrawnWork(recoveryUi, { review: fresh.review.review, job: fresh.view.selection })).kind).toBe("recovered")
  await f.owner.dispose(); await foreign.owner.dispose()
}, 120000)

for (const stage of stages) for (const mode of ["rejected-unchanged", "rejected-applied", "ignored", "divergent", "write-and-read-error"] as const) test(`installed-V3 playlist ${stage} keeps actual ${mode} outcome and its confirmed prefix`, async () => {
  const f = await openPlaylist((await installedFixture()).stores), writeError = new Error(`write-${stage}`)
  f.h.write(async (items, apply) => {
    if (submittedPlaylistStage(items) !== stage) { apply(items); return }
    if (mode === "rejected-applied" || mode === "divergent") apply(items)
    if (mode === "divergent") f.h.foreign(records => { records.unrelated = { drift: stage } })
    if (mode === "write-and-read-error") f.h.get(async () => { throw f.h.readError })
    if (mode === "rejected-unchanged" || mode === "rejected-applied" || mode === "write-and-read-error") throw writeError
  })
  const result = await recoverPlaylist(f), actual = playlistExecution(result)
  if (mode === "rejected-applied") {
    expect(result.kind).toBe("recovered")
    expect(actual.mutations.find(m => m.stage === stage)?.write).toEqual({ kind: "rejected", error: writeError })
  } else {
    expect(result.kind).toBe("authorized-pending")
    expect(actual.kind).toBe(mode === "rejected-unchanged" ? "failed" : "unconfirmed")
    if (actual.kind !== "failed" && actual.kind !== "unconfirmed") throw new Error("Expected attempted-stage result")
    expect(actual.stage).toBe(stage)
    expect(actual.write).toEqual(mode === "ignored" || mode === "divergent" ? { kind: "resolved" } : { kind: "rejected", error: writeError })
    expect(actual.mutations.map(m => m.stage)).toEqual(stages.slice(0, stages.indexOf(stage)))
    if (mode === "write-and-read-error") expect(actual.kind === "unconfirmed" && actual.observation).toEqual({ kind: "read-failed", error: f.h.readError })
  }
  f.h.get(undefined)
  await f.owner.dispose()
}, 120000)

for (const part of ["document", "history", "corrupt"] as const) for (const rejected of [false, true]) test(`installed-V3 playlist documents ${part} partial rejected=${rejected} stays unconfirmed and a fresh owner writes only the fixed images`, async () => {
  const source = await installedFixture(), effect = source.accepted.pending.effect, destination = `doc:setup:${effect.key.acct}`, f = await openPlaylist(source.stores), error = new Error(`partial-${part}`)
  f.h.write(async (items, apply) => {
    if (submittedPlaylistStage(items) !== "documents") { apply(items); return }
    if (part === "corrupt") apply({ [destination]: { ...effect.after, gen: "corrupt-third-image" } })
    else { const key = part === "document" ? destination : "sync"; apply({ [key]: items[key]! }) }
    if (rejected) throw error
  })
  const ran = playlistExecution(await recoverPlaylist(f))
  expect(ran.kind === "unconfirmed" && [ran.stage, ran.write]).toEqual(["documents", rejected ? { kind: "rejected", error } : { kind: "resolved" }])
  const saved = f.stores(); await f.owner.dispose()
  if (part === "corrupt") {
    const held = createWithdrawnPlaylistHarness(copy(saved)), owner = createStartingLocalFilterWriter(held.h.deps)
    await heldReady(owner)
    expect(offersPlaylist(await owner.readWithdrawnWork(recoveryUi))).toBe(false)
    expect(held.h.writes).toEqual([])
    await owner.dispose()
    return
  }
  const next = await openPlaylist(copy(saved))
  expect((await recoverPlaylist(next)).kind).toBe("recovered")
  expect(next.h.writes.filter(batch => submittedPlaylistStage(batch) === "documents")).toEqual([fixedDocuments(source.accepted)])
  await next.owner.dispose()
}, 120000)

test("installed-V3 playlist lost ownership after documents keeps the attempted stage and writes no retirement", async () => {
  const f = await openPlaylist((await installedFixture()).stores)
  f.h.write(async (items, apply) => { apply(items); if (submittedPlaylistStage(items) === "documents") f.h.ownership(false) })
  const ran = playlistExecution(await recoverPlaylist(f))
  expect(ran.kind === "unconfirmed" && [ran.stage, ran.observation.kind]).toEqual(["documents", "authority"])
  expect(f.h.writes.map(submittedPlaylistStage)).toEqual(["register", "prepare", "authorize", "documents"])
  await f.owner.dispose()
}, 120000)

for (const stopping of ["withdrawal", "disposal"] as const) for (const boundary of stages) test(`installed-V3 playlist same-owner ${stopping} drains suspended ${boundary} and starts no later stage`, async () => {
  const source = await installedFixture(), host = createWithdrawnPlaylistHarness(source.stores).h.deps.recovery
  if (host.kind !== "fixture") throw new Error("Missing installed-V3 host")
  let signalStop = () => {}; const stopEntered = new Promise<void>(resolve => { signalStop = resolve })
  const writes: JsonObject[] = [], stageIndex = stages.indexOf(boundary)
  const harness = createLifecycleHarness({ local: copy(source.stores.local), session: copy(source.stores.session), database: "present" }, {
    faults: [{ port: "owner.local.set", occurrence: stageIndex + 1, mode: "hold" }], onStop: signalStop,
    configureOwner(deps, stores) {
      return { ...deps, now() { throw new Error("Recovery cannot allocate time") }, generation() { throw new Error("Recovery cannot allocate generation") }, local: { ...deps.local, async set(items) { if (!consentObject(items)) throw new Error("Non-JSON batch"); writes.push(copy(items)); await deps.local.set(items) } },
        recovery: { ...host, snapshot: { async read() { const local = stores().local; return { retained: interimSnapshot(local), history: Object.hasOwn(local, "sync") ? { kind: "present", raw: local.sync } : { kind: "absent" } } } } } }
    }
  })
  const lifecycle = createStoreLifecycle(harness.deps())
  await lifecycle.ready()
  const owner = lifecycle.owner()
  if (!owner) throw new Error("Lifecycle did not expose its held owner")
  const selected = await selectPlaylist(owner), arrival = harness.arrival("owner.local.set", stageIndex + 1)
  const recovering = owner.recoverWithdrawnWork(recoveryUi, { review: selected.review.review, job: selected.view.selection })
  await arrival
  const read = readConsentDevice(harness.stores().local)
  if (read.kind !== "supported" || !read.device.consent) throw new Error("Missing current agreement")
  const stopped = stopping === "withdrawal" ? lifecycle.withdrawConsent(settingsOrigin, read.device.consent) : lifecycle.dispose()
  await stopEntered
  const beforeRelease = writes.length
  harness.release("owner.local.set")
  const result = await recovering, stopResult = await stopped
  if (stopping === "withdrawal") expect(stopResult).toMatchObject({ kind: "withdrawn" })
  expect(result.kind).not.toBe("recovered")
  expect(writes.length).toBe(beforeRelease)
  const ran = playlistExecution(result)
  expect(ran.kind === "unconfirmed" && ran.stage).toBe(boundary)
  expect(ran.mutations.map(m => m.stage)).toEqual(stages.slice(0, stageIndex))
  expect(harness.ledger.exclusionViolations).toBe(0)
  expect(harness.ledger.syncCalls).toBe(0)
  await lifecycle.dispose()
}, 10000)
