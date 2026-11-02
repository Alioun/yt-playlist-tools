import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { createConsentRecovery, parseConsentJobs, consentJobsKey } from "./consent-recovery"
import { consentObject } from "./consent-withdrawal"
import { readRetainedRecovery } from "./interim-recovery-execution"
import { recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot, renewWithdrawalAgreement } from "../../../tools/fixtures/interim-conversion/run"
import { heldReady, copy, createWithdrawnPlaylistHarness, selectPlaylist, submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import type { JsonObject } from "../../shared/contracts/json"
import { isAcceptedPlaylistRecord, executeExactRetainedPlaylist, readExactPlaylistSync, type ExactRetainedPlaylistPermit, type RetainedPlaylistView } from "./withdrawn-document-recovery"
import { stages, playlistFixture, openPlaylist, recoverPlaylist, playlistExecution } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

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
