import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { createConsentRecovery, parseConsentJobs, consentJobsKey } from "./consent-recovery"
import { consentObject } from "./consent-withdrawal"
import { recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot } from "../../../tools/fixtures/interim-conversion/run"
import { heldReady, submittedStage, copy, createWithdrawnPlaylistInput, createWithdrawnPlaylistHarness, selectPlaylist } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import type { JsonObject } from "../../shared/contracts/json"
import { isAccountKey } from "../../shared/model"
import { completedPlaylistRecord, isAcceptedPlaylistRecord, executeExactRetainedPlaylist, readExactPlaylistSync, type RetainedPlaylistExecution } from "./withdrawn-document-recovery"
import { playlistFixture, openPlaylist, recoverPlaylist, playlistExecution, open, recover } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

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
