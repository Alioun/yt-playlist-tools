import { expect, test } from "bun:test"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import { consentObject, readConsentDevice, withdrawalItems } from "./consent-withdrawal"
import { parseConsentJobs, acceptedRemovalLedger, createConsentRecovery, executeExactRetainedV1Acceptance, executeExactRetainedAgreement, type ExactRetainedV1AcceptancePermit } from "./consent-recovery"
import { pendingAccountRemovalKey } from "./account-removal-execution"
import { createRemovalHarness, removalFixture, withdrawRemovalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import type { JsonObject } from "../../shared/contracts/json"
import { isAccountKey } from "../../shared/model"

const origin = { kind: "ui", windowId: 1, incognito: false } as const
function account(value: string) { if (!isAccountKey(value)) throw Error("Invalid synthetic account"); return value }
const acct = account("AAAAAAAAAAAAAAAA")

async function accepted(synced = false) {
  const h = createRemovalHarness(removalFixture(synced), { details: true })
  const writer = createLocalFilterWriter(h.deps)
  const preparation = await writer.prepareAccountRemoval(origin, acct)
  if (preparation.kind !== "confirmation-required") throw Error("Missing real removal confirmation")
  await writer.removeAccountSetup(origin, preparation.confirmation)
  await writer.dispose()
  const seed = h.mutations[0]?.after
  if (!seed || !seed.local[pendingAccountRemovalKey]) throw Error("Missing accepted removal seed")
  return (await withdrawRemovalFixture(seed)).state
}

async function agreed(synced = false) {
  const h = createRemovalHarness(await accepted(synced), { details: true })
  const writer = createStartingLocalFilterWriter({ ...h.deps, startup: h.startup })
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  expect(h.mutations).toEqual([])
  const review = await writer.readAgreement(origin)
  if (review.kind !== "review" || review.presentation.kind !== "held") throw Error("Missing held disclosure")
  const result = await writer.agree(origin, { review: review.review, choice: { kind: "disclosure" }, displayedVersion: 1, access: new Promise(() => {}) })
  expect(result.kind).toBe("committed")
  expect(h.mutations.length).toBe(1)
  return { h, writer }
}

for (const synced of [false, true]) test(`held agreement and exact removal preserve current consent, ${synced ? "synced" : "local"}`, async () => {
  const { h, writer } = await agreed(synced), before = h.state()
  const review = await writer.readWithdrawnWork(origin)
  if (review.kind !== "held") throw Error("Missing exact review")
  const job = review.work.find(view => view.kind === "account-removal")
  if (!job || job.kind !== "account-removal") throw Error("Missing exact selection")
  const recovered = await writer.recoverWithdrawnWork(origin, { review: review.review, job: job.selection })
  expect(recovered.kind).toBe("recovered")
  expect(h.state().local.device).toEqual(before.local.device)
  expect(h.state().local.lastAccount).toBeNull()
  expect(h.state().sync).toEqual(before.sync)
  expect(h.state().local[pendingAccountRemovalKey]).toBeUndefined()
  expect(parseConsentJobs(h.state().local["consent:jobs"])?.jobs[0]?.permission.kind).toBe("done")
  expect(await writer.recoverWithdrawnWork(origin, { review: review.review, job: job.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.counts().subscriptions).toBe(0)
  await writer.dispose()
})

test("copied and private reviews cannot authorize removal and every attempted confirmation is consumed", async () => {
  const { h, writer } = await agreed(), before = h.state()
  const read = await writer.readWithdrawnWork(origin)
  if (read.kind !== "held") throw Error("Missing review")
  const selected = read.work.find(view => view.kind === "account-removal")
  if (selected?.kind !== "account-removal") throw Error("Missing selection")
  expect(await writer.recoverWithdrawnWork(origin, { review: { ...read.review }, job: selected.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await writer.recoverWithdrawnWork({ ...origin, incognito: true }, { review: read.review, job: selected.selection })).toEqual({ kind: "refused", reason: "private" })
  expect(await writer.recoverWithdrawnWork(origin, { review: read.review, job: selected.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.state()).toEqual(before)
  await writer.dispose()
})

test("a later identical acceptance allocates a greater occurrence and retains terminal entries", async () => {
  const { h, writer } = await agreed(), before = h.state(), raw = before.local[pendingAccountRemovalKey]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Missing record")
  const first = acceptedRemovalLedger(before.local, raw)
  if (!first) throw Error("Missing first registration")
  const ledger = parseConsentJobs(first["consent:jobs"])
  if (!ledger?.jobs[0]) throw Error("Missing occurrence")
  const done = { ...ledger, jobs: [{ ...ledger.jobs[0], progress: { kind: "terminal" }, permission: { kind: "done" } }] }
  const second = acceptedRemovalLedger({ ...before.local, "consent:jobs": done }, raw)
  expect(parseConsentJobs(second?.["consent:jobs"])?.jobs.map(job => job.identity.occurrence)).toEqual([0, 1])
  await writer.dispose()
})

test("held startup leaves malformed pending work intact and all resume APIs unavailable", async () => {
  const seed = await accepted()
  seed.local["pending:sync-join"] = { v: 99 }
  seed.local.interimConversion = { v: 99 }
  const h = createRemovalHarness(seed), writer = createStartingLocalFilterWriter({ ...h.deps, startup: h.startup })
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const before = h.state()
  for (const result of await Promise.all([writer.resumeRetainedAgreement(origin), writer.resumeInterimInstallation(origin), writer.resumeRetainedAuthority(origin), writer.resumeSyncJoin(origin), writer.cancelSyncJoin(origin), writer.resumeInterimFilterReplacement(origin), writer.resumeInterimPlaylistRestore(origin), writer.beginSyncJoin(origin).result])) expect(result).toEqual({ kind: "unavailable", reason: "consent-held" })
  expect(h.state()).toEqual(before)
  expect(h.mutations).toEqual([])
  await writer.dispose()
})

for (const permission of ["prepared", "armed"] as const) for (const mode of ["ignore", "reject", "read-failed", "applied-reject"] as const) test(`${permission} ${mode} never borrows an unconfirmed permission`, async () => {
  const { h, writer } = await agreed(), original = h.deps.local.set, get = h.deps.local.get
  let readFails = false, fired = false
  h.deps.local.set = async items => {
    const ledger = parseConsentJobs(items["consent:jobs"])
    if (!fired && ledger?.jobs[0]?.permission.kind === permission) {
      fired = true
      if (mode === "reject") throw Error("Synthetic unchanged rejection")
      if (mode === "ignore") return
      await original(items)
      if (mode === "read-failed") readFails = true
      if (mode === "applied-reject") throw Error("Synthetic applied rejection")
    } else await original(items)
  }
  h.deps.local.get = async keys => { if (readFails) { readFails = false; throw Error("Synthetic failed permission readback") }; return get(keys) }
  const read = await writer.readWithdrawnWork(origin)
  if (read.kind !== "held") throw Error("Missing review")
  const job = read.work.find(view => view.kind === "account-removal")
  if (job?.kind !== "account-removal") throw Error("Missing selection")
  const before = h.state(), result = await writer.recoverWithdrawnWork(origin, { review: read.review, job: job.selection })
  expect(fired).toBe(true)
  if (mode === "applied-reject") expect(result.kind).toBe("recovered")
  else {
    expect(result.kind).toBe(mode === "reject" ? "failed" : "unconfirmed")
    const after = h.state(), projected = { ...after.local }
    delete projected["consent:jobs"]
    expect({ ...after, local: projected }).toEqual(before)
  }
  await writer.dispose()
})

test("recovery leaves simultaneous join work held", async () => {
  const { h, writer } = await agreed()
  h.foreign(state => { state.local["pending:sync-join"] = { v: 99, future: true } })
  const read = await writer.readWithdrawnWork(origin)
  if (read.kind !== "held") throw Error("Missing review")
  const job = read.work.find(view => view.kind === "account-removal")
  if (job?.kind !== "account-removal") throw Error("Missing selection")
  const result = await writer.recoverWithdrawnWork(origin, { review: read.review, job: job.selection })
  expect(result.kind).toBe("recovered")
  if (result.kind === "recovered") expect(result.remaining.some(view => view.kind === "unsupported" && view.operation === "join")).toBe(true)
  expect(await writer.resumeSyncJoin(origin)).toEqual({ kind: "unavailable", reason: "consent-held" })
  expect(h.state().local["pending:sync-join"]).toEqual({ v: 99, future: true })
  await writer.dispose()
})

test("a new agreement invalidates an old exact review even when the wall clock repeats", async () => {
  const { h, writer } = await agreed()
  const read = await writer.readWithdrawnWork(origin)
  if (read.kind !== "held") throw Error("Missing review")
  const job = read.work.find(view => view.kind === "account-removal")
  if (job?.kind !== "account-removal") throw Error("Missing selection")
  const agreement = await writer.readAgreement(origin)
  if (agreement.kind !== "review") throw Error("Missing disclosure")
  const before = readConsentDevice(h.state().local)
  expect((await writer.agree(origin, { review: agreement.review, choice: { kind: "disclosure" }, displayedVersion: 1, access: new Promise(() => {}) })).kind).toBe("committed")
  const after = readConsentDevice(h.state().local)
  if (before.kind !== "supported" || after.kind !== "supported") throw Error("Missing controls")
  expect(after.control?.generation).toBe((before.control?.generation ?? 0) + 1)
  expect(after.device.consent?.at).toBe((before.device.consent?.at ?? 0) + 1)
  expect(await writer.recoverWithdrawnWork(origin, { review: read.review, job: job.selection })).toEqual({ kind: "unavailable", reason: "stale" })
  await writer.dispose()
})

test("disposal after accepted removal drains its invoked write and invokes no document effect", async () => {
  const h = createRemovalHarness(removalFixture(), { details: true }), set = h.deps.local.set
  let entered = () => {}, release = () => {}
  const arrival = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  h.deps.local.set = async items => { await set(items); if (Object.hasOwn(items, pendingAccountRemovalKey)) { entered(); await gate } }
  const writer = createLocalFilterWriter(h.deps), prepared = await writer.prepareAccountRemoval(origin, acct)
  if (prepared.kind !== "confirmation-required") throw Error("Missing confirmation")
  const pending = writer.removeAccountSetup(origin, prepared.confirmation)
  await arrival
  const stopped = writer.dispose()
  release()
  expect((await pending).kind).toBe("unconfirmed")
  await stopped
  expect(h.mutations.length).toBe(1)
  expect(h.state().local[pendingAccountRemovalKey]).toBeDefined()
  expect(h.state().local[`doc:setup:${acct}`]).toEqual(removalFixture().local[`doc:setup:${acct}`])
})

test("later identical real removals allocate new occurrences in their accept batches", async () => {
  const { h, writer: heldOwner } = await agreed(), original = h.state()
  const held = await heldOwner.readWithdrawnWork(origin)
  if (held.kind !== "held") throw Error("Missing review")
  const selected = held.work.find(job => job.kind === "account-removal")
  if (selected?.kind !== "account-removal") throw Error("Missing exact selection")
  expect((await heldOwner.recoverWithdrawnWork(origin, { review: held.review, job: selected.selection })).kind).toBe("recovered")
  await heldOwner.dispose()
  const writer = createStartingLocalFilterWriter({ ...h.deps, startup: h.startup })
  expect(await writer.ready()).toBe("ok")
  const acceptedRecords: unknown[] = []
  for (let occurrence = 1; occurrence <= 2; occurrence++) {
    h.foreign(state => {
      for (const [name, value] of Object.entries(original.local)) if (name === `doc:setup:${acct}` || name.startsWith(`doc:filter:${acct}:`)) state.local[name] = value
    })
    const preparation = await writer.prepareAccountRemoval(origin, acct)
    if (preparation.kind !== "confirmation-required") throw Error("Missing later real confirmation")
    const start = h.mutations.length
    const result = await writer.removeAccountSetup(origin, preparation.confirmation)
    expect(result.kind).toBe("committed")
    const batch = h.mutations[start]?.after?.local
    expect(parseConsentJobs(batch?.["consent:jobs"])?.jobs.at(-1)?.identity.occurrence).toBe(occurrence)
    acceptedRecords.push(batch?.[pendingAccountRemovalKey])
  }
  expect(acceptedRecords[0]).toEqual(acceptedRecords[1])
  expect(parseConsentJobs(h.state().local["consent:jobs"])?.jobs.map(job => [job.identity.occurrence, job.permission.kind])).toEqual([[0, "done"], [1, "done"], [2, "done"]])
  await writer.dispose()
})

test("ordinary feature agreement after recovery keeps Device and its control paired", async () => {
  const { h, writer: held } = await agreed()
  const review = await held.readWithdrawnWork(origin)
  if (review.kind !== "held") throw Error("Missing review")
  const job = review.work.find(view => view.kind === "account-removal")
  if (job?.kind !== "account-removal") throw Error("Missing removal")
  expect((await held.recoverWithdrawnWork(origin, { review: review.review, job: job.selection })).kind).toBe("recovered")
  await held.dispose()
  const writer = createStartingLocalFilterWriter({ ...h.deps, startup: h.startup })
  expect(await writer.ready()).toBe("ok")
  const shown = await writer.readAgreement(origin)
  if (shown.kind !== "review") throw Error("Missing ordinary agreement")
  const before = readConsentDevice(h.state().local)
  const result = await writer.agree(origin, { review: shown.review, displayedVersion: 1, choice: { kind: "feature", feature: "music-keys" }, access: Promise.resolve({ www: true, music: true, browserMenu: true }) })
  expect(result.kind).toBe("committed")
  const after = readConsentDevice(h.state().local)
  expect(after.kind).toBe("supported")
  if (before.kind !== "supported" || after.kind !== "supported") throw Error("Invalid consent pair")
  expect(after.control?.generation).toBe((before.control?.generation ?? 0) + 1)
  expect(after.device.consent?.at).toBeGreaterThan(before.device.consent?.at ?? 0)
  await writer.dispose()
})

for (const terminal of [false, true]) test(`a restarted ${terminal ? "terminal" : "orphaned accepted"} occurrence stays held across a fresh agreement`, async () => {
  const { h, writer } = await agreed()
  const review = await writer.readWithdrawnWork(origin)
  if (review.kind !== "held") throw Error("Missing review")
  const job = review.work.find(view => view.kind === "account-removal")
  if (job?.kind !== "account-removal") throw Error("Missing removal")
  expect((await writer.recoverWithdrawnWork(origin, { review: review.review, job: job.selection })).kind).toBe("recovered")
  const seed = h.mutations.find(mutation => {
    const entry = parseConsentJobs(mutation.after?.local["consent:jobs"])?.jobs[0]
    return entry?.progress.kind === (terminal ? "terminal" : "accepted")
  })?.after
  if (!seed) throw Error("Missing actual progression boundary")
  await writer.dispose()
  const serialized = JSON.parse(JSON.stringify(seed)) as typeof seed
  if (!terminal) delete serialized.local[pendingAccountRemovalKey]
  const restarted = createRemovalHarness(serialized, { details: true })
  const next = createStartingLocalFilterWriter({ ...restarted.deps, startup: restarted.startup })
  await expect(next.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  expect(restarted.mutations).toEqual([])
  const disclosure = await next.readAgreement(origin)
  if (disclosure.kind !== "review") throw Error("Missing held disclosure")
  expect((await next.agree(origin, { review: disclosure.review, displayedVersion: 1, choice: { kind: "disclosure" }, access: new Promise(() => {}) })).kind).toBe("committed")
  const work = await next.readWithdrawnWork(origin)
  if (work.kind !== "held") throw Error("Missing held work")
  const selected = work.work.find(view => view.kind === "account-removal")
  if (terminal) {
    if (selected?.kind !== "account-removal") throw Error("Missing retirement selection")
    const before = restarted.state()
    expect((await next.recoverWithdrawnWork(origin, { review: work.review, job: selected.selection })).kind).toBe("recovered")
    const after = restarted.state()
    for (const [name, value] of Object.entries(before.local)) if (name !== "consent:jobs" && name !== pendingAccountRemovalKey) expect(after.local[name]).toEqual(value)
    expect(after.sync).toEqual(before.sync)
    expect(after.session).toEqual(before.session)
  } else {
    expect(selected).toBeUndefined()
    expect(work.work).toContainEqual({ kind: "unsupported", operation: "removal", reason: "invalid", inspection: { occurrence: 0, reason: "marker-missing" } })
    expect(restarted.mutations).toHaveLength(1)
  }
  await next.dispose()
})

for (const permission of ["prepared", "armed", "done"] as const) test(`withdrawal intent invalidates actual ${permission} recovery without rewriting its receipt`, async () => {
  const { h, writer } = await agreed(), review = await writer.readWithdrawnWork(origin)
  if (review.kind !== "held") throw Error("Missing review")
  const selected = review.work.find(view => view.kind === "account-removal")
  if (selected?.kind !== "account-removal") throw Error("Missing selected occurrence")
  expect((await writer.recoverWithdrawnWork(origin, { review: review.review, job: selected.selection })).kind).toBe("recovered")
  const seed = h.mutations.find(mutation => parseConsentJobs(mutation.after?.local["consent:jobs"])?.jobs[0]?.permission.kind === permission)?.after
  if (!seed) throw Error("Missing actual recovery boundary")
  await writer.dispose()
  const previous = readConsentDevice(seed.local), withdrawal = await withdrawRemovalFixture(seed)
  if (previous.kind !== "supported" || !previous.control) throw Error("Missing current agreement")
  expect(withdrawal.writes).toHaveLength(2)
  for (const boundary of withdrawal.writes) {
    const persisted = { local: boundary.after.local, session: boundary.after.session, sync: seed.sync }, parsed = readConsentDevice(persisted.local)
    if (parsed.kind !== "supported" || !parsed.control) throw Error("Invalid actual protocol boundary")
    expect(parsed.control.generation).toBe(previous.control.generation + 1)
    expect(persisted.local["consent:jobs"]).toEqual(seed.local["consent:jobs"])
    const restarted = createRemovalHarness(persisted, { details: true }), next = createStartingLocalFilterWriter({ ...restarted.deps, startup: restarted.startup })
    await expect(next.ready()).rejects.toBeInstanceOf(StartupReadinessError)
    const work = await next.readWithdrawnWork(origin)
    if (work.kind !== "held") throw Error("Missing held inspection")
    const job = work.work.find(view => view.kind === "account-removal")
    if (permission !== "done") {
      if (job?.kind !== "account-removal") throw Error("Missing still-held exact record")
      expect(await next.recoverWithdrawnWork(origin, { review: work.review, job: job.selection })).toEqual({ kind: "refused", reason: "not-agreed" })
    }
    if (parsed.control.state.kind === "withdrawing") expect(await next.readAgreement(origin)).toEqual({ kind: "unavailable", reason: "consent-held" })
    for (const result of await Promise.all([next.resumeRetainedAgreement(origin), next.resumeInterimInstallation(origin), next.resumeRetainedAuthority(origin), next.resumeSyncJoin(origin), next.cancelSyncJoin(origin), next.resumeInterimFilterReplacement(origin), next.resumeInterimPlaylistRestore(origin), next.beginSyncJoin(origin).result])) expect(result).toEqual({ kind: "unavailable", reason: "consent-held" })
    expect(restarted.mutations).toEqual([])
    expect(restarted.state()).toEqual(persisted)
    expect(restarted.counts().subscriptions).toBe(0)
    await next.dispose()
  }
})

import { withdrawalRetainedAgreementFixture, withdrawalRetainedV1Fixture, renewWithdrawalAgreement, createInterimHarness, interimSnapshot, runWithdrawalRetainedAgreement } from "../../../tools/fixtures/interim-conversion/run"
import { consentJobsKey, classifyConsentWork } from "./consent-recovery"
import { readRetainedCheckpoint, recoveredRetainedAgreementDifference, retainedCheckpointDifference } from "./interim-persistence"
import { sameSyncJson } from "./sync-write-admission"

let retainedSeed: ReturnType<typeof withdrawalRetainedAgreementFixture> | undefined
async function retained() {
  const fixture = await (retainedSeed ??= withdrawalRetainedAgreementFixture())
  const h = createInterimHarness(fixture.stores.local), writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  return { h, writer, fixture }
}
async function retainedSelection(writer: ReturnType<typeof createStartingLocalFilterWriter>, ui = origin) {
  const review = await writer.readWithdrawnWork(ui)
  if (review.kind !== "held") throw Error("Missing retained review")
  const selected = review.work.find(view => view.kind === "retained-agreement")
  if (selected?.kind !== "retained-agreement") throw Error("Missing retained selection")
  return { review: review.review, job: selected.selection }
}

test("actual withdrawal V2 observer covers exact receipt stages, faults, private origins and serialized restarts", async () => {
  const observed = await runWithdrawalRetainedAgreement()
  expect(observed.v3Installation.cases).toBe(55)
  expect(observed.v3Installation.newAcceptance.cases).toBe(80)
  expect(observed.v3Installation.subsets.length).toBe(8)
  expect(observed.cases).toBe(42)
  expect(observed.assertions).toBeGreaterThanOrEqual(410)
  expect(observed.restarts.length).toBe(5)
  expect(observed.v1Acceptance.cases).toBe(64)
  expect(observed.v1Acceptance.subsets.length).toBe(8)
  expect(observed.v1Acceptance.renewals.length).toBe(6)
  expect(observed.v1Acceptance.restarts.length).toBe(6)
}, 300000)

for (const fault of ["copied-review", "copied-selection", "foreign-owner", "wrong-origin", "serialized"]) test(`retained ${fault} confirmation grants no authority and consumes attempted owner review`, async () => {
  const { h, writer } = await retained(), selected = await retainedSelection(writer), before = h.records()
  const foreign = createStartingLocalFilterWriter(h.deps)
  await expect(foreign.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const input = fault === "copied-review" ? { ...selected, review: { ...selected.review } } : fault === "copied-selection" ? { ...selected, job: { ...selected.job } } : fault === "serialized" ? JSON.parse(JSON.stringify(selected)) : selected
  const result = await (fault === "foreign-owner" ? foreign : writer).recoverWithdrawnWork(fault === "wrong-origin" ? { ...origin, windowId: 2 } : origin, input)
  expect(result.kind).not.toBe("recovered"); expect(h.writes).toEqual([]); expect(h.records()).toEqual(before)
  if (fault === "copied-selection" || fault === "wrong-origin") expect(await writer.recoverWithdrawnWork(origin, selected)).toEqual({ kind: "unavailable", reason: "stale" })
  await foreign.dispose(); await writer.dispose()
})

import { withdrawalConfirmedInstallationFixture, newInstallationStage } from "../../../tools/fixtures/interim-conversion/run"
import { interimConversionKey } from "./interim-persistence"
import { executeExactRetainedInstallationAcceptance, type ExactRetainedInstallationAcceptancePermit } from "./consent-recovery"
import { sameConsentValue } from "./consent-recovery"
test("complete consent equality preserves JSON semantics and rejects non-plain data without getters", () => {
  const values: import("../../shared/contracts/json").JsonValue[] = [null,false,true,0,1,"",[],{},[null,false,{ nested:[1,"x"] }],{ a:1,b:[null,false] },{ b:[null,false],a:1 },{ "__proto__":null,other:1 }]
  for(const left of values)for(const right of values)expect(sameConsentValue(left,right)).toBe(sameSyncJson(left,right))
  let invoked=0
  const getter=Object.defineProperty({},"value",{ enumerable:true,get(){ invoked++;throw Error("Getter called") } })
  for(const invalid of [undefined,NaN,Infinity,()=>{},getter,Object.create({ inherited:true }),{ value:undefined }])expect(sameConsentValue(invalid,invalid)).toBe(false)
  expect(invoked).toBe(0)
})
let newInstallationSeed: ReturnType<typeof withdrawalConfirmedInstallationFixture> | undefined
async function newInstallationOwner(raw?: JsonObject) {
  const fixture = await (newInstallationSeed ??= withdrawalConfirmedInstallationFixture())
  const h = createInterimHarness(raw ?? fixture.stores.local), writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  expect(h.writes).toEqual([])
  return { h, writer, fixture }
}
async function newInstallationInput(writer: ReturnType<typeof createStartingLocalFilterWriter>) {
  const read = await writer.readWithdrawnWork(origin)
  if (read.kind !== "held") throw Error("Missing new installation read")
  const view = read.work.find(view => view.kind === "retained-installation-acceptance")
  if (view?.kind !== "retained-installation-acceptance") throw Error("Missing new installation selection")
  expect(read.work.some(view => view.kind === "retained-installation")).toBe(false)
  return { input: { review: read.review, job: view.selection }, view }
}
async function completedNewInstallation() {
  const { h, writer } = await newInstallationOwner(), { input, view } = await newInstallationInput(writer), before = h.records(), states: JsonObject[] = [], batches: JsonObject[] = []
  h.write(async (items, apply) => { apply(items); states.push(h.records()); batches.push(items) })
  const result = await writer.recoverWithdrawnWork(origin, input)
  expect(result.kind).toBe("recovered")
  await writer.dispose()
  return { before, view, result, states, batches, records: h.records() }
}
test("new installation draft allocates only in the exact two-key acceptance and finishes installed done held", async () => {
  const { before, view, result, states, batches, records } = await completedNewInstallation()
  expect(batches.map(newInstallationStage)).toEqual(["prepare", "authorize", "accept", "documents", "retire", "record", "done"])
  for (const state of states.slice(0,2)) {
    const ledger = parseConsentJobs(state[consentJobsKey])
    expect(ledger?.next).toBe(0); expect(ledger?.jobs).toEqual([])
    expect(ledger?.retainedInstallation?.registration).toEqual({ kind: "unregistered", expectedNext: 0 })
  }
  expect(Object.keys(batches[2]!)).toEqual([interimConversionKey, consentJobsKey])
  expect(parseConsentJobs(states[2]![consentJobsKey])?.next).toBe(1)
  expect(parseConsentJobs(records[consentJobsKey])?.retainedInstallation?.registration).toEqual({ kind: "registered", occurrence: 0 })
  expect(parseConsentJobs(records[consentJobsKey])?.jobs[0]?.permission.kind).toBe("done")
  expect(records.device).toEqual(before.device)
  expect(rawObject(records.interimConversion).agreed).toEqual(before.interimConversion)
  expect(view.descriptor.accepted.agreed.agreement.effect.consent.at).toBe(200)
  expect(view.current.at).toBe(300)
  expect(result.kind === "recovered" && result.completion.operation === "retained-installation-acceptance" && result.completion.result.installation.activation).toBe("held")
})
for (const rejected of [false,true]) for (const mask of [0,1,2,3]) test(`new installation exact acceptance subset ${mask}, rejection ${rejected}`, async () => {
  const { h, writer, fixture } = await newInstallationOwner(), { input } = await newInstallationInput(writer)
  h.write(async (items, apply) => {
    if (newInstallationStage(items) !== "accept") { apply(items); return }
    apply(Object.fromEntries([interimConversionKey,consentJobsKey].filter((_,index) => mask & 2 ** index).map(key => [key,items[key]!])) )
    if (rejected) throw h.error
  })
  const result = await writer.recoverWithdrawnWork(origin,input)
  expect(result.kind).toBe(mask === 3 ? "recovered" : mask === 0 && rejected ? "failed" : "unconfirmed")
  if (mask !== 3) expect(h.writes.map(newInstallationStage)).toEqual(["prepare","authorize","accept"])
  if (result.kind === "failed" || result.kind === "unconfirmed") expect("confirmedPermissionWrites" in result && result.confirmedPermissionWrites.length).toBe(2)
  expect(parseConsentJobs(h.records()[consentJobsKey])?.next).toBe(mask & 2 ? 1 : 0)
  if (mask === 1 || mask === 2 || mask === 0 && !rejected) {
    const read = await writer.readWithdrawnWork(origin)
    expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation" || view.kind === "retained-installation-acceptance")).toBe(false)
  }
  const captured = h.records(); await writer.dispose()
  if (mask === 1 || mask === 2) {
    const renewal = await renewWithdrawalAgreement({ ...fixture.stores, local: captured }), restart = await newInstallationOwner(renewal.stores.local), fresh = await newInstallationInput(restart.writer)
    expect(fresh.view.registration.kind).toBe(mask === 1 ? "unregistered" : "registered")
    expect((await restart.writer.recoverWithdrawnWork(origin,fresh.input)).kind).toBe("recovered")
    expect(parseConsentJobs(restart.h.records()[consentJobsKey])?.next).toBe(1)
    expect(restart.h.writes.map(newInstallationStage)).toContain("accept")
    expect(rawObject(restart.h.records().interimConversion).agreed).toEqual(rawObject(captured.interimConversion).v === 3 ? rawObject(captured.interimConversion).agreed : captured.interimConversion)
    await restart.writer.dispose()
  }
})
for (const kind of ["receipt","v1"] as const) test(`actual completed ${kind} permits a separate installation occurrence and preserves history`, async () => {
  const fixture = await withdrawalConfirmedInstallationFixture(kind), before = parseConsentJobs(fixture.stores.local[consentJobsKey]), { h, writer } = await newInstallationOwner(fixture.stores.local), { input,view } = await newInstallationInput(writer)
  expect(before?.next).toBe(1)
  expect((await writer.recoverWithdrawnWork(origin,input)).kind).toBe("recovered")
  const after = parseConsentJobs(h.records()[consentJobsKey])
  expect(after?.next).toBe(2); expect(after?.jobs[0]).toEqual(before?.jobs[0]); expect(after?.retainedV1).toEqual(before?.retainedV1)
  expect(after?.jobs[1]?.identity.original).toEqual(view.descriptor.accepted.agreed.agreement.effect.consent)
  if (kind === "v1") { expect(view.current.at).toBe(301); expect(view.descriptor.accepted.agreed.agreement.effect.consent.at).toBe(300) }
  await writer.dispose()
})
test("installation witness parser rejects malformed and non-plain drafts without invoking accessors", async () => {
  const { states } = await completedNewInstallation(), valid = rawObject(states[0]![consentJobsKey])
  expect(parseConsentJobs(valid)).toBeDefined()
  for (const mutate of [
    (raw: JsonObject) => { raw.extra = true },
    (raw: JsonObject) => { rawObject(raw.retainedInstallation).extra = true },
    (raw: JsonObject) => { rawObject(rawObject(raw.retainedInstallation).registration).expectedNext = -1 },
    (raw: JsonObject) => { rawObject(rawObject(raw.retainedInstallation).descriptor).effect = {} },
    (raw: JsonObject) => { rawObject(rawObject(raw.retainedInstallation).descriptor).deviceId = "foreign" },
    (raw: JsonObject) => { rawObject(raw.retainedInstallation).registration = { kind:"registered", occurrence:0 } },
    (raw: JsonObject) => { rawObject(rawObject(raw.retainedInstallation).permission).kind = "done" }
  ]) { const raw = rawObject(JSON.parse(JSON.stringify(valid))); mutate(raw); expect(parseConsentJobs(raw)).toBeUndefined() }
  let invoked = 0
  const accessor = rawObject(JSON.parse(JSON.stringify(valid)))
  Object.defineProperty(rawObject(accessor.retainedInstallation),"descriptor",{ enumerable:true,get(){ invoked++; throw Error("Getter called") } })
  expect(parseConsentJobs(accessor)).toBeUndefined(); expect(invoked).toBe(0)
})
test("new installation V3-only counter drift suppresses old-V3 fallback", async () => {
  const { before,states,batches } = await completedNewInstallation(), ledger = rawObject(JSON.parse(JSON.stringify(states[1]![consentJobsKey])))
  ledger.next = 1
  const { h,writer } = await newInstallationOwner({ ...before,interimConversion:batches[2]!.interimConversion!,[consentJobsKey]:ledger })
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation" || view.kind === "retained-installation-acceptance")).toBe(false)
  expect(h.writes).toEqual([]); await writer.dispose()
})
test("new installation done history blocks identical V2 or accepted V3 reappearance", async () => {
  const { records,before,batches } = await completedNewInstallation()
  for (const checkpoint of [before.interimConversion,batches[2]!.interimConversion]) {
    const { h,writer } = await newInstallationOwner({ ...records,interimConversion:checkpoint! }), read = await writer.readWithdrawnWork(origin)
    expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation" || view.kind === "retained-installation-acceptance")).toBe(false)
    expect(h.writes).toEqual([]); await writer.dispose()
  }
})
test("new installation private confirmation consumes review and writes nothing", async () => {
  const { h,writer } = await newInstallationOwner(), { input } = await newInstallationInput(writer)
  expect(await writer.recoverWithdrawnWork({ ...origin,incognito:true },input)).toEqual({ kind:"refused",reason:"private" })
  expect(await writer.recoverWithdrawnWork(origin,input)).toEqual({ kind:"unavailable",reason:"stale" })
  expect(h.writes).toEqual([]); await writer.dispose()
})

for (const stage of ["prepare","authorize","accept","documents","retire","record","done"] as const) test(`new installation ${stage} stops after actual withdrawal and re-agreement`, async () => {
  const { h,writer,fixture } = await newInstallationOwner(), { input } = await newInstallationInput(writer)
  let fired = false
  const queued: Promise<unknown>[] = []
  h.write(async (items,apply) => {
    apply(items)
    if (newInstallationStage(items) !== stage || fired) return
    fired = true
    queued.push(writer.resumeInterimInstallation(origin),writer.changeSharedSetting(origin,{ kind:"theme",value:"dark" }),writer.recoverWithdrawnWork(origin,input))
    const renewal = await renewWithdrawalAgreement({ ...fixture.stores,local:h.records() })
    h.foreign(records => { for (const key of Object.keys(records)) delete records[key]; Object.assign(records,renewal.stores.local) })
  })
  expect((await writer.recoverWithdrawnWork(origin,input)).kind).not.toBe("recovered")
  expect(fired).toBe(true)
  expect(h.writes.map(newInstallationStage)).toEqual((["prepare","authorize","accept","documents","retire","record","done"] as const).slice(0,["prepare","authorize","accept","documents","retire","record","done"].indexOf(stage)+1))
  for (const value of await Promise.all(queued)) expect(rawObject(value).kind).not.toBe("committed")
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
  await writer.dispose()
})
for (const rejected of [false,true]) for (let mask=0;mask<64;mask++) test(`new installation fixed documents subset ${mask}, rejection ${rejected}`, async () => {
  const { h,writer } = await newInstallationOwner(), { input } = await newInstallationInput(writer)
  h.write(async (items,apply) => {
    if (newInstallationStage(items) !== "documents") { apply(items); return }
    const entries = Object.entries(items)
    expect(entries.length).toBe(6)
    apply(Object.fromEntries(entries.filter((_,index) => mask & 2 ** index)))
    if (rejected) throw h.error
  })
  expect((await writer.recoverWithdrawnWork(origin,input)).kind).toBe(mask === 63 ? "recovered" : "authorized-pending")
  if (mask !== 63) expect(h.writes.map(newInstallationStage)).toEqual(["prepare","authorize","accept","documents"])
  const partial = h.records(); await writer.dispose()
  if (mask !== 63) {
    const restart = await newInstallationOwner(partial), fresh = await newInstallationInput(restart.writer)
    expect((await restart.writer.recoverWithdrawnWork(origin,fresh.input)).kind).toBe("recovered")
    expect(restart.h.writes.filter(items => newInstallationStage(items) === "documents").length).toBe(1)
    expect(parseConsentJobs(restart.h.records()[consentJobsKey])?.next).toBe(1)
    await restart.writer.dispose()
  }
})
test("new installation terminal continuation preserves progress and never repairs documents", async () => {
  const { states } = await completedNewInstallation(), fixture = await (newInstallationSeed ??= withdrawalConfirmedInstallationFixture())
  const renewed = await renewWithdrawalAgreement({ ...fixture.stores,local:states[4]! }), { h,writer } = await newInstallationOwner(renewed.stores.local), { input } = await newInstallationInput(writer)
  expect((await writer.recoverWithdrawnWork(origin,input)).kind).toBe("recovered")
  expect(h.writes.map(newInstallationStage)).toEqual(["prepare","authorize","retire","record","done"])
  for (const items of h.writes.filter(items => Object.hasOwn(items,consentJobsKey))) expect(parseConsentJobs(items[consentJobsKey])?.jobs[0]?.progress.kind).toBe("terminal")
  await writer.dispose()
  const missing = rawObject(JSON.parse(JSON.stringify(renewed.stores.local))), documents = Object.keys(states[3]!).filter(key => key.startsWith("doc:"))
  delete missing[documents[0]!]
  const invalid = await newInstallationOwner(missing), read = await invalid.writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
  expect(invalid.h.writes).toEqual([]); await invalid.writer.dispose()
})
test("new installation independent completion retains a confirmed executor and independent read failure", async () => {
  const { h,writer } = await newInstallationOwner(), { input } = await newInstallationInput(writer)
  let done = false, reads = 0
  h.write(async (items,apply) => { apply(items); if (newInstallationStage(items) === "done") done = true })
  h.get(async () => { if (done && ++reads === 5) { h.get(undefined); throw h.readError } })
  const result = await writer.recoverWithdrawnWork(origin,input)
  if (result.kind !== "authorized-pending" || !("completionCheck" in result)) throw Error("Missing independent acceptance completion")
  expect(result.observation.kind).toBe("confirmed"); expect(result.completionCheck).toEqual({ kind:"read-failed",error:h.readError })
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
  await writer.dispose()
})
for (const target of ["device-extension","device-id","history","source","canonical","checkpoint"] as const) test(`new installation complete ${target} drift invalidates its review`, async () => {
  const { h,writer } = await newInstallationOwner(), { input } = await newInstallationInput(writer)
  h.foreign(records => {
    if (target === "device-extension") rawObject(records.device).future = { changed:true }
    else if (target === "device-id") rawObject(records.device).id = "foreign"
    else if (target === "history") rawObject(records.sync).extra = { changed:true }
    else if (target === "source") records.toastEnabled = true
    else if (target === "canonical") records["doc:settings"] = { v:99 }
    else rawObject(records.interimConversion).future = { changed:true }
  })
  const before = h.records()
  expect((await writer.recoverWithdrawnWork(origin,input)).kind).toBe("unavailable")
  expect(h.records()).toEqual(before); expect(h.writes).toEqual([]); await writer.dispose()
})
test("new installation observed Device A-B-A during acceptance closes its owner", async () => {
  const { h,writer } = await newInstallationOwner(), { input } = await newInstallationInput(writer)
  h.write(async (items,apply) => {
    apply(items)
    if (newInstallationStage(items) !== "accept") return
    const actual = h.records()
    h.get(async () => {
      h.foreign(records => { rawObject(records.device).future = { changed:true } })
      h.get(async () => { h.get(undefined); h.foreign(records => { records.device=actual.device! }) })
    })
  })
  expect((await writer.recoverWithdrawnWork(origin,input)).kind).toBe("unconfirmed")
  h.get(undefined)
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation-acceptance")).toBe(false)
  expect(h.writes.map(newInstallationStage)).toEqual(["prepare","authorize","accept"]); await writer.dispose()
})
test("installation acceptance permits are separate one-use references and revoked before executor authority", async () => {
  const fixture = await (newInstallationSeed ??= withdrawalConfirmedInstallationFixture()), h = createInterimHarness(fixture.stores.local)
  let captured: ExactRetainedInstallationAcceptancePermit | undefined, accepted = 0
  const acceptancePorts = { async setAccepted(batch: import("./consent-recovery").RetainedInstallationAcceptanceBatch) {
    accepted++
    if (!captured) throw Error("Missing acceptance permit")
    expect(await executeExactRetainedInstallationAcceptance(captured,acceptancePorts)).toEqual({ kind:"unavailable",reason:"stale" })
    if (!consentObject(batch)) throw Error("Invalid batch JSON")
    await h.deps.local.set(batch)
  } }
  const recovery = createConsentRecovery({ observe:() => h.deps.local.get(null),observeRetainedAgreement:async () => interimSnapshot(h.records()),revision:() => 0,stopped:() => false,set:items => h.deps.local.set(items),onRetainedV1Uncertainty(){},onRetainedInstallationUncertainty(){},async execute(){ throw Error("Unexpected removal") },
    async executeRetainedInstallationAcceptance(permit) {
      captured=permit
      expect(await executeExactRetainedInstallationAcceptance({ ...permit },acceptancePorts)).toEqual({ kind:"unavailable",reason:"stale" })
      return executeExactRetainedInstallationAcceptance(permit,acceptancePorts)
    },
    async executeRetainedInstallation(permit) {
      if (!captured) throw Error("Missing prior acceptance")
      expect(await executeExactRetainedInstallationAcceptance(captured,acceptancePorts)).toEqual({ kind:"unavailable",reason:"stale" })
      return executeExactRetainedInstallation(permit,{ async setDocuments(effect){ const items:JsonObject=Object.fromEntries([...effect.documents.map(x=>[x.path,x.document]),...effect.caches.map(x=>[x.path,x.data])]); if(effect.schema.kind==="set")items.schema=effect.schema.value; await h.deps.local.set(items) },setLedger:ledger=>h.deps.local.set({ [consentJobsKey]:ledger }),async setInstalled(record){ if(!consentObject(record))throw Error("Invalid receipt"); await h.deps.local.set({ interimConversion:record }) } })
    }
  })
  const read=await recovery.read(origin)
  if(read.kind!=="held")throw Error("Missing acceptance review")
  const view=read.work.find(view=>view.kind==="retained-installation-acceptance")
  if(view?.kind!=="retained-installation-acceptance")throw Error("Missing acceptance selection")
  expect((await recovery.recover(origin,{ review:read.review,job:view.selection })).kind).toBe("recovered")
  expect(accepted).toBe(1)
  if(!captured)throw Error("Missing consumed permit")
  expect(await executeExactRetainedInstallationAcceptance(captured,acceptancePorts)).toEqual({ kind:"unavailable",reason:"stale" })
})

for (const drift of ["device-extension", "source", "tombstone", "unrelated", "checkpoint", "control"]) test(`retained ${drift} drift never borrows a captured review`, async () => {
  const { h, writer } = await retained(), selected = await retainedSelection(writer)
  h.foreign(records => {
    if (drift === "device-extension" && records.device && typeof records.device === "object" && !Array.isArray(records.device)) records.device.foreign = true
    if (drift === "source") records.sessionConsent = 0
    if (drift === "tombstone") records["doc:settings"] = { v: 1, gen: "later", at: 999, by: "other", deleted: true }
    if (drift === "unrelated") records.unrelated = { drift: true }
    if (drift === "checkpoint" && records.interimConversion && typeof records.interimConversion === "object" && !Array.isArray(records.interimConversion)) records.interimConversion.extra = true
    if (drift === "control" && records["consent:state"] && typeof records["consent:state"] === "object" && !Array.isArray(records["consent:state"])) records["consent:state"].generation = 4
  })
  const before = h.records(), result = await writer.recoverWithdrawnWork(origin, selected)
  expect(result.kind).not.toBe("recovered"); expect(h.writes).toEqual([]); expect(h.records()).toEqual(before)
  await writer.dispose()
})

test("observed changed-back Device and historical facts invalidate the old retained review", async () => {
  for (const drift of ["device", "history"]) {
    const fixture = await (retainedSeed ??= withdrawalRetainedAgreementFixture()), h = createInterimHarness(fixture.stores.local)
    let changed = false
    const writer = createStartingLocalFilterWriter({ ...h.deps, startup: { ...h.deps.startup, async readInterimSnapshot() {
      const source = await h.deps.startup.readInterimSnapshot()
      return changed ? { ...source, historicalAuthorization: { kind: "known", value: true } } : source
    } } })
    await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
    const selected = await retainedSelection(writer), before = h.records()
    if (drift === "device") h.foreign(records => { if (records.device && typeof records.device === "object" && !Array.isArray(records.device)) records.device.foreign = true })
    else changed = true
    await writer.readWithdrawnWork(origin)
    changed = false; h.foreign(records => Object.assign(records, before))
    expect(await writer.recoverWithdrawnWork(origin, selected)).toEqual({ kind: "unavailable", reason: "stale" })
    expect(h.writes).toEqual([]); await writer.dispose()
  }
})

for (const counter of ["occurrence", "generation", "time"]) test(`exhausted ${counter} cannot authorize retained receipt writes`, async () => {
  const { h, writer } = await retained()
  h.foreign(records => {
    if (counter === "occurrence") records[consentJobsKey] = { v: 1, kind: "consent-jobs", deviceId: "synthetic-device", next: Number.MAX_SAFE_INTEGER, jobs: [] }
    else if (records["consent:state"] && typeof records["consent:state"] === "object" && !Array.isArray(records["consent:state"])) records["consent:state"][counter === "generation" ? "generation" : "lastAgreementAt"] = Number.MAX_SAFE_INTEGER
  })
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind).toBe("held")
  if (read.kind === "held") expect(read.work.some(view => view.kind === "retained-agreement")).toBe(false)
  expect(h.writes).toEqual([]); await writer.dispose()
})

test("fresh agreement with repeated clocks invalidates older authority and leaves the original receipt unchanged", async () => {
  const { h, writer, fixture } = await retained(), selected = await retainedSelection(writer), shown = await writer.readAgreement(origin)
  if (shown.kind !== "review") throw Error("Missing actual repeated agreement")
  expect((await writer.agree(origin, { review: shown.review, displayedVersion: shown.version, choice: { kind: "disclosure" }, access: new Promise(() => {}) })).kind).toBe("committed")
  const read = readConsentDevice(h.records())
  expect(read.kind === "supported" && read.device.consent?.at).toBe(301)
  expect(await writer.recoverWithdrawnWork(origin, selected)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.records().interimConversion).toEqual(fixture.stores.local.interimConversion)
  const fresh = await retainedSelection(writer)
  expect((await writer.recoverWithdrawnWork(origin, fresh)).kind).toBe("recovered")
  expect(h.records().device).toEqual({ ...fixture.stores.local.device as object, consent: { v: 1, at: 301 } })
  await writer.dispose()
})

test("complete receipt plus done occurrence cannot authorize identical reappearing acceptance", async () => {
  const { h, writer, fixture } = await retained(), input = await retainedSelection(writer)
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
  const completed = h.records(), writes = h.writes.length
  h.foreign(records => { records.interimConversion = fixture.stores.local.interimConversion! })
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-agreement")).toBe(false)
  expect(h.writes.length).toBe(writes)
  expect(h.records()[consentJobsKey]).toEqual(completed[consentJobsKey])
  await writer.dispose()
})

test("retained work without a sanitized source host remains inspection-only", async () => {
  const fixture = await (retainedSeed ??= withdrawalRetainedAgreementFixture()), h = createInterimHarness(fixture.stores.local), writer = createLocalFilterWriter(h.deps)
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-agreement")).toBe(false)
  expect(h.writes).toEqual([]); await writer.dispose()
})

test("the public comparison permits only current consent and exact terminal receipt progression", async () => {
  const fixture = await (retainedSeed ??= withdrawalRetainedAgreementFixture()), parsed = readRetainedCheckpoint(fixture.stores.local.interimConversion)
  if (parsed.kind !== "agreement") throw Error("Generated accepted V2 invalid")
  const snapshot = interimSnapshot(fixture.stores.local), current = { v: 1, at: 300 }
  expect(retainedCheckpointDifference(parsed.checkpoint, snapshot)).toBe("canonical")
  expect(recoveredRetainedAgreementDifference(parsed.checkpoint, snapshot, current, "accepted")).toBeUndefined()
  const raw = fixture.stores.local.interimConversion
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !raw.agreement || typeof raw.agreement !== "object" || Array.isArray(raw.agreement)) throw Error("Generated raw V2 missing")
  const confirmed = { ...raw, agreement: { ...raw.agreement, kind: "confirmed" } }, terminal = { ...snapshot, checkpoint: { kind: "present" as const, value: confirmed } }
  expect(recoveredRetainedAgreementDifference(parsed.checkpoint, terminal, current, "accepted")).toBe("checkpoint")
  expect(recoveredRetainedAgreementDifference(parsed.checkpoint, terminal, current, "terminal")).toBeUndefined()
  expect(recoveredRetainedAgreementDifference(parsed.checkpoint, { ...snapshot, canonical: { ...snapshot.canonical, device: { ...fixture.stores.local.device as object, foreign: true } } }, current, "terminal")).toBe("canonical")
  expect(recoveredRetainedAgreementDifference(parsed.checkpoint, { ...snapshot, priorCredentialPresence: { kind: "known", value: false } }, current, "terminal")).toBe("history")
})

test("strict retained ledger parsing preserves order and rejects mismatched identity, fields and progression", async () => {
  const fixture = await (retainedSeed ??= withdrawalRetainedAgreementFixture()), record = fixture.stores.local.interimConversion
  if (!record || typeof record !== "object" || Array.isArray(record)) throw Error("Missing generated raw accepted receipt")
  const identity = { deviceId: "synthetic-device", occurrence: 4, operation: { kind: "retained-agreement", record }, original: { v: 1, at: 100 } }
  const entry = { identity, progress: { kind: "accepted" }, permission: { kind: "held" } }
  const ledger = { v: 1, kind: "consent-jobs", deviceId: "synthetic-device", next: 5, jobs: [entry, { ...entry, identity: { ...identity, occurrence: 2 } }] }
  expect(parseConsentJobs(ledger)?.jobs.map(job => job.identity.occurrence)).toEqual([4, 2])
  const invalid = [
    { ...ledger, next: 4 }, { ...ledger, jobs: [entry, entry] }, { ...ledger, extra: true },
    { ...ledger, jobs: [{ ...entry, identity: { ...identity, original: { v: 1, at: 300 } } }] },
    { ...ledger, jobs: [{ ...entry, identity: { ...identity, deviceId: "foreign" } }] },
    { ...ledger, jobs: [{ ...entry, permission: { kind: "retiring", generation: 2, current: { v: 1, at: 300 } } }] },
    { ...ledger, jobs: [{ ...entry, progress: { kind: "terminal" } }] },
    { ...ledger, jobs: [{ ...entry, permission: { kind: "prepared", generation: 2, current: { v: 1, at: 300 }, extra: true } }] }
  ]
  for (const value of invalid) expect(parseConsentJobs(value)).toBeUndefined()
})

test("terminal receipt recovery after actual rewithdrawal and repeated-clock agreement never returns to accepted progress", async () => {
  const { h, writer, fixture } = await retained()
  h.write(async (items, apply) => {
    if (Object.hasOwn(items, "interimConversion")) throw h.error
    apply(items)
  })
  const selected = await retainedSelection(writer), interrupted = await writer.recoverWithdrawnWork(origin, selected)
  expect(interrupted.kind).toBe("authorized-pending")
  expect(parseConsentJobs(h.records()[consentJobsKey])?.jobs[0]?.permission.kind).toBe("retiring")
  const terminal = { ...fixture.stores, local: h.records() }
  await writer.dispose()
  const withdrawal = await withdrawRemovalFixture(terminal), fresh = createInterimHarness(withdrawal.state.local), owner = createStartingLocalFilterWriter(fresh.deps)
  await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const shown = await owner.readAgreement(origin)
  if (shown.kind !== "review") throw Error("Missing terminal held agreement")
  expect((await owner.agree(origin, { review: shown.review, displayedVersion: shown.version, choice: { kind: "disclosure" }, access: new Promise(() => {}) })).kind).toBe("committed")
  const consent = readConsentDevice(fresh.records())
  expect(consent.kind === "supported" && consent.device.consent?.at).toBe(301)
  const start = fresh.writes.length, input = await retainedSelection(owner), result = await owner.recoverWithdrawnWork(origin, input)
  expect(result.kind).toBe("recovered")
  for (const batch of fresh.writes.slice(start).filter(batch => Object.hasOwn(batch, consentJobsKey))) expect(parseConsentJobs(batch[consentJobsKey])?.jobs[0]?.progress.kind).toBe("terminal")
  expect(fresh.writes.slice(start).some(batch => Object.hasOwn(batch, "device"))).toBe(false)
  const ledger = parseConsentJobs(fresh.records()[consentJobsKey])
  expect(ledger?.next).toBe(1); expect(ledger?.jobs[0]?.identity).toEqual(parseConsentJobs(terminal.local[consentJobsKey])?.jobs[0]?.identity)
  await owner.dispose()
})

for (const drift of ["snapshot-store", "history"]) test(`retained ${drift} disagreement offers inspection without an executable selection`, async () => {
  const fixture = await (retainedSeed ??= withdrawalRetainedAgreementFixture()), h = createInterimHarness(fixture.stores.local)
  const owner = createStartingLocalFilterWriter({ ...h.deps, startup: { ...h.deps.startup, async readInterimSnapshot() {
    const source = await h.deps.startup.readInterimSnapshot()
    return drift === "snapshot-store" ? { ...source, source: {} } : { ...source, historicalAuthorization: { kind: "known", value: true } }
  } } })
  await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const read = await owner.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-agreement")).toBe(false)
  expect(h.writes).toEqual([]); await owner.dispose()
})

test("a final read failure after confirmed done remains authorized-pending with its completed executor observation", async () => {
  const { h, writer } = await retained(), input = await retainedSelection(writer)
  let done = false, reads = 0
  h.write(async (items, apply) => { apply(items); if (parseConsentJobs(items[consentJobsKey])?.jobs[0]?.permission.kind === "done") done = true })
  h.get(async () => { if (done && ++reads === 3) throw h.readError })
  const result = await writer.recoverWithdrawnWork(origin, input)
  expect(result.kind).toBe("authorized-pending")
  if (result.kind !== "authorized-pending" || !("completionCheck" in result)) throw Error("Missing retained final observation")
  expect(result.observation.kind).toBe("confirmed")
  expect(result.completionCheck).toEqual({ kind: "read-failed", error: h.readError })
  expect(h.writes.length).toBe(5)
  expect(parseConsentJobs(h.records()[consentJobsKey])?.jobs[0]?.permission.kind).toBe("done")
  await writer.dispose()
})

test("retained drift during the executor preflight permits no terminal or receipt write", async () => {
  const { h, writer } = await retained(), input = await retainedSelection(writer)
  let armed = false, reads = 0
  h.write(async (items, apply) => { apply(items); if (parseConsentJobs(items[consentJobsKey])?.jobs[0]?.permission.kind === "armed") armed = true })
  h.get(async () => { if (armed && ++reads === 3) h.foreign(records => { if (records.device && typeof records.device === "object" && !Array.isArray(records.device)) records.device.later = true }) })
  const result = await writer.recoverWithdrawnWork(origin, input)
  expect(result.kind).toBe("authorized-pending")
  expect(h.writes.length).toBe(2)
  expect(readRetainedCheckpoint(h.records().interimConversion).kind).toBe("agreement")
  const raw = h.records().interimConversion
  expect(raw && typeof raw === "object" && !Array.isArray(raw) && raw.agreement && typeof raw.agreement === "object" && !Array.isArray(raw.agreement) && raw.agreement.kind).toBe("accepted")
  await writer.dispose()
})

test("retained owner reviews are consumed even by malformed confirmation shapes", async () => {
  const { h, writer } = await retained(), input = await retainedSelection(writer), malformed = { ...input, extra: true }
  expect(await writer.recoverWithdrawnWork(origin, malformed)).toEqual({ kind: "refused", reason: "invalid-input" })
  expect(await writer.recoverWithdrawnWork(origin, input)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.writes).toEqual([]); await writer.dispose()
})

test("retained authorize preflight drift preserves a confirmed applied prepare rejection", async () => {
  const { h, writer } = await retained(), input = await retainedSelection(writer)
  let prepared = false, reads = 0
  h.write(async (items, apply) => { apply(items); if (parseConsentJobs(items[consentJobsKey])?.jobs[0]?.permission.kind === "prepared") { prepared = true; throw h.error } })
  h.get(async () => { if (prepared && ++reads === 3) h.foreign(records => { records.unrelated = { later: true } }) })
  const result = await writer.recoverWithdrawnWork(origin, input)
  expect(result.kind).toBe("failed")
  if (result.kind !== "failed" || !("confirmedPermissionWrites" in result)) throw Error("Missing retained permission prefix")
  expect(result.stage).toBe("authorize")
  expect(result.confirmedPermissionWrites).toEqual([{ stage: "prepare", write: { kind: "rejected", error: h.error } }])
  expect(h.writes.length).toBe(1); await writer.dispose()
})

let v1Seed: ReturnType<typeof withdrawalRetainedV1Fixture> | undefined
async function v1Owner() {
  const fixture = await (v1Seed ??= withdrawalRetainedV1Fixture()), h = createInterimHarness(fixture.stores.local), writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  return { fixture, h, writer }
}
async function v1Selection(writer: ReturnType<typeof createStartingLocalFilterWriter>, ui = origin) {
  const read = await writer.readWithdrawnWork(ui)
  if (read.kind !== "held") throw Error("V1 review missing")
  const selected = read.work.find(view => view.kind === "retained-v1-acceptance")
  if (!selected || selected.kind !== "retained-v1-acceptance") throw Error("V1 selection missing")
  return { review: read.review, job: selected.selection }
}
function rawObject(raw: unknown): JsonObject { if (!consentObject(raw)) throw Error("Expected complete JSON object"); return raw }
function v1Stage(items: JsonObject) {
  if (Object.hasOwn(items, "interimConversion")) return Object.hasOwn(items, consentJobsKey) ? "accept" : "record"
  const ledger = parseConsentJobs(items[consentJobsKey]), witness = ledger && "retainedV1" in ledger ? ledger.retainedV1 : undefined
  const permission = witness && "permission" in witness ? witness.permission.kind : ledger?.jobs[0]?.permission.kind
  return permission === "prepared" ? "prepare" : permission === "armed" ? "authorize" : permission === "retiring" ? "retire" : "done"
}
const v1Stages = ["prepare", "authorize", "accept", "retire", "record", "done"] as const
let v1Completed: Promise<{ batches: JsonObject[]; records: JsonObject }> | undefined
function completedV1() {
  return v1Completed ??= (async () => {
    const { h, writer } = await v1Owner(), input = await v1Selection(writer)
    const result = await writer.recoverWithdrawnWork(origin, input)
    expect(result.kind).toBe("recovered")
    await writer.dispose()
    return { batches: h.writes, records: h.records() }
  })()
}

for (const fault of ["copied-review", "copied-selection", "foreign-owner", "wrong-origin", "serialized", "malformed"]) test(`V1 ${fault} consumes the attempted review without effects`, async () => {
  const { h, writer } = await v1Owner(), input = await v1Selection(writer), before = h.records()
  const other = await v1Owner()
  const used = fault === "copied-review" ? { ...input, review: { ...input.review } } : fault === "copied-selection" ? { ...input, job: { ...input.job } } : fault === "serialized" ? JSON.parse(JSON.stringify(input)) : fault === "malformed" ? { ...input, extra: true } : input
  const result = await (fault === "foreign-owner" ? other.writer : writer).recoverWithdrawnWork(fault === "wrong-origin" ? { ...origin, windowId: 2 } : origin, used)
  expect(result.kind).not.toBe("recovered")
  expect(h.writes).toEqual([]); expect(other.h.writes).toEqual([]); expect(h.records()).toEqual(before)
  if (["copied-selection", "wrong-origin", "malformed"].includes(fault)) expect(await writer.recoverWithdrawnWork(origin, input)).toEqual({ kind: "unavailable", reason: "stale" })
  await writer.dispose(); await other.writer.dispose()
})

for (const drift of ["device-extension", "source", "canonical", "checkpoint", "unrelated", "generation", "time"]) test(`V1 complete ${drift} drift denies the captured selection`, async () => {
  const { h, writer } = await v1Owner(), input = await v1Selection(writer)
  h.foreign(records => {
    if (drift === "device-extension") rawObject(records.device).future = { changed: true }
    if (drift === "source") records.sessionConsent = 2
    if (drift === "canonical") records["doc:settings"] = { v: 1, gen: "later", at: 400, by: "foreign", data: null }
    if (drift === "checkpoint") rawObject(records.interimConversion).extension = true
    if (drift === "unrelated") records.unrelated = { changed: true }
    if (drift === "generation") rawObject(records["consent:state"]).generation = 3
    if (drift === "time") rawObject(records["consent:state"]).lastAgreementAt = Number.MAX_SAFE_INTEGER
  })
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("unavailable")
  expect(h.writes).toEqual([])
  await writer.dispose()
})

for (const prior of ["prepare", "authorize", "accept", "retire", "record"] as const) for (const invalidation of ["stop", "device", "generation", "actual-agreement", "actual-withdrawal"] as const) test(`V1 ${invalidation} after confirmed ${prior} blocks the next effect`, async () => {
  const { h, writer, fixture } = await v1Owner(), input = await v1Selection(writer)
  let afterStage: string | undefined, gets = 0, fired = false, stop: Promise<void> | undefined
  h.write(async (items, apply) => { apply(items); afterStage = v1Stage(items); gets = 0 })
  h.get(async () => {
    if (afterStage !== prior || ++gets !== 3 || fired) return
    fired = true
    if (invalidation === "stop") { stop = writer.dispose(); return }
    if (invalidation === "device") h.foreign(records => { rawObject(records.device).future = { changed: true } })
    else if (invalidation === "generation") h.foreign(records => { rawObject(records["consent:state"]).generation = 3 })
    else {
      const renewed = await renewWithdrawalAgreement({ ...fixture.stores, local: h.records() })
      const records = invalidation === "actual-agreement" ? renewed.stores.local : renewed.withdrawal.stores.local
      h.foreign(current => { for (const key of Object.keys(current)) delete current[key]; Object.assign(current, records) })
    }
  })
  const result = await writer.recoverWithdrawnWork(origin, input)
  await stop
  expect(fired).toBe(true); expect(result.kind).not.toBe("recovered")
  expect(h.writes.map(v1Stage)).toEqual(v1Stages.slice(0, v1Stages.indexOf(prior) + 1))
  expect(h.writes.some(items => Object.hasOwn(items, "device"))).toBe(false)
  await writer.dispose()
})

test("V1 observed Device and history ABA invalidates earlier authority", async () => {
  for (const drift of ["device", "history"] as const) {
    const fixture = await (v1Seed ??= withdrawalRetainedV1Fixture()), h = createInterimHarness(fixture.stores.local)
    let history = false
    const startup = { ...h.deps.startup, async readInterimSnapshot() { const value = await h.deps.startup.readInterimSnapshot(); return history ? { ...value, historicalAuthorization: { kind: "known" as const, value: true } } : value } }
    const writer = createStartingLocalFilterWriter({ ...h.deps, startup })
    await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
    const input = await v1Selection(writer), saved = h.records()
    if (drift === "device") h.foreign(records => { rawObject(records.device).future = { different: true } }); else history = true
    await writer.readWithdrawnWork(origin)
    h.foreign(records => { records.device = saved.device! }); history = false
    expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("unavailable")
    expect(h.writes).toEqual([])
    await writer.dispose()
  }
})

test("strict V1 proposal parsing rejects malformed wrappers without invoking accessors", async () => {
  const produced = await completedV1(), prepared = produced.batches[0]![consentJobsKey], registered = produced.batches[2]![consentJobsKey]
  expect(parseConsentJobs(prepared)).toBeDefined(); expect(parseConsentJobs(registered)).toBeDefined()
  const changes: ((ledger: JsonObject) => void)[] = [
    ledger => { rawObject(ledger.retainedV1).extra = true },
    ledger => { rawObject(rawObject(ledger.retainedV1).registration).occurrence = 0 },
    ledger => { rawObject(rawObject(ledger.retainedV1).permission).kind = "retiring" },
    ledger => { rawObject(rawObject(ledger.retainedV1).permission).generation = -1 },
    ledger => { rawObject(rawObject(ledger.retainedV1).descriptor).deviceId = "other" },
    ledger => { rawObject(rawObject(rawObject(ledger.retainedV1).descriptor).proposedUnder).current = { v: 1, at: 301 } },
    ledger => { rawObject(rawObject(rawObject(ledger.retainedV1).descriptor).retained).extra = true },
    ledger => { rawObject(rawObject(ledger.retainedV1).descriptor).accepted = {} },
    ledger => { rawObject(ledger.retainedV1).permission = { kind: "armed", generation: Infinity, current: { v: 1, at: 300 } } },
    ledger => { rawObject(ledger.retainedV1).self = ledger },
    ledger => { Object.defineProperty(rawObject(ledger.retainedV1), Symbol("invalid"), { value: true }) },
    ledger => { Object.defineProperty(rawObject(ledger.retainedV1), "callback", { value: () => {}, enumerable: true }) },
    ledger => { const permission = rawObject(rawObject(ledger.retainedV1).permission); delete permission.generation; Object.setPrototypeOf(permission, { generation: 2 }) }
  ]
  for (const change of changes) { const value = JSON.parse(JSON.stringify(prepared)); change(value); expect(parseConsentJobs(value)).toBeUndefined() }
  for (const change of ["missing-job", "duplicate", "wrong-record", "permission-on-registered"]) {
    const value = rawObject(JSON.parse(JSON.stringify(registered))), jobs = value.jobs
    if (!Array.isArray(jobs)) throw Error("Actual registered jobs absent")
    if (change === "missing-job") jobs.pop()
    if (change === "duplicate") jobs.push(jobs[0]!)
    if (change === "wrong-record") rawObject(rawObject(rawObject(jobs[0]).identity).operation).record = {}
    if (change === "permission-on-registered") rawObject(value.retainedV1).permission = { kind: "done" }
    expect(parseConsentJobs(value)).toBeUndefined()
  }
  let hooks = 0
  const accessor = JSON.parse(JSON.stringify(prepared))
  Object.defineProperty(accessor.retainedV1, "permission", { enumerable: true, get() { hooks++; throw Error("Accessor invoked") } })
  expect(parseConsentJobs(accessor)).toBeUndefined(); expect(hooks).toBe(0)
  const stale = rawObject(JSON.parse(JSON.stringify(prepared))); rawObject(rawObject(stale.retainedV1).registration).expectedNext = 9
  expect(parseConsentJobs(stale)).toBeDefined()
})

test("V1 accepted history never grants a done occurrence to reappearing work", async () => {
  const { records } = await completedV1(), fixture = await (v1Seed ??= withdrawalRetainedV1Fixture())
  const ledger = rawObject(records[consentJobsKey]), descriptor = rawObject(rawObject(ledger.retainedV1).descriptor)
  for (const checkpoint of [fixture.stores.local.interimConversion, descriptor.accepted]) {
    const seed = { ...records, interimConversion: checkpoint! }, h = createInterimHarness(seed), writer = createStartingLocalFilterWriter(h.deps)
    await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
    const read = await writer.readWithdrawnWork(origin)
    expect(read.kind === "held" && read.work.some(view => view.kind !== "unsupported")).toBe(false)
    expect(h.records()).toEqual(seed); expect(h.writes).toEqual([])
    await writer.dispose()
  }
})

for (const counter of ["occurrence", "generation", "time"] as const) test(`V1 exhausted ${counter} stays inspectable without an executable selection`, async () => {
  const fixture = await (v1Seed ??= withdrawalRetainedV1Fixture()), { batches } = await completedV1(), seed = rawObject(JSON.parse(JSON.stringify(fixture.stores.local)))
  if (counter === "occurrence") { const ledger = rawObject(JSON.parse(JSON.stringify(batches[0]![consentJobsKey]))); ledger.next = Number.MAX_SAFE_INTEGER; seed[consentJobsKey] = ledger }
  else rawObject(seed["consent:state"])[counter === "generation" ? "generation" : "lastAgreementAt"] = Number.MAX_SAFE_INTEGER
  const h = createInterimHarness(seed), owner = createStartingLocalFilterWriter(h.deps)
  await expect(owner.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const read = await owner.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind !== "unsupported")).toBe(false)
  expect(h.writes).toEqual([]); expect(h.records()).toEqual(seed)
  await owner.dispose()
})

test("V2-only acceptance with a changed counter pin cannot use receipt fallback", async () => {
  const { batches } = await completedV1(), fixture = await (v1Seed ??= withdrawalRetainedV1Fixture())
  const ledger = rawObject(JSON.parse(JSON.stringify(batches[1]![consentJobsKey]))); ledger.next = 1
  const seed = { ...fixture.stores.local, interimConversion: batches[2]!.interimConversion!, [consentJobsKey]: ledger }
  expect(parseConsentJobs(ledger)).toBeDefined()
  const h = createInterimHarness(seed), writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind !== "unsupported")).toBe(false)
  expect(h.writes).toEqual([]); expect(h.records()).toEqual(seed)
  await writer.dispose()
})

test("V1 V2-only acceptance ends its attempt before any retry or receipt set", async () => {
  const { h, writer } = await v1Owner(), input = await v1Selection(writer)
  h.write(async (items, apply) => { apply(v1Stage(items) === "accept" ? { interimConversion: items.interimConversion! } : items) })
  const result = await writer.recoverWithdrawnWork(origin, input)
  expect(result.kind).toBe("unconfirmed")
  expect(h.writes.map(v1Stage)).toEqual(["prepare", "authorize", "accept"])
  const inspection = await writer.readWithdrawnWork(origin)
  expect(inspection.kind === "held" && inspection.work.some(view => view.kind === "retained-v1-acceptance")).toBe(false)
  expect(parseConsentJobs(h.records()[consentJobsKey])?.jobs).toEqual([])
  await writer.dispose()
})

test("V1 confirmed prepare cannot invoke acceptance without confirmed armed permission", async () => {
  const { h, writer } = await v1Owner(), input = await v1Selection(writer)
  h.write(async (items, apply) => { if (v1Stage(items) === "authorize") throw h.error; apply(items) })
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("failed")
  expect(h.writes.filter(items => Object.hasOwn(items, "interimConversion"))).toEqual([])
  expect(h.writes.map(v1Stage)).toEqual(["prepare", "authorize"])
  expect(parseConsentJobs(h.records()[consentJobsKey])?.next).toBe(0)
  expect(parseConsentJobs(h.records()[consentJobsKey])?.jobs).toEqual([])
  await writer.dispose()
})

for (const unavailable of ["snapshot", "executor", "history", "snapshot-store"] as const) test(`V1 missing or different ${unavailable} permits inspection only`, async () => {
  const fixture = await (v1Seed ??= withdrawalRetainedV1Fixture()), h = createInterimHarness(fixture.stores.local)
  let barriers = 0
  const recovery = createConsentRecovery({ observe: () => h.deps.local.get(null), revision: () => 0, stopped: () => false, set: items => h.deps.local.set(items),
    observeRetainedAgreement: async () => {
      if (unavailable === "snapshot") return undefined
      const value = interimSnapshot(h.records())
      return unavailable === "history" ? { ...value, historicalAuthorization: { kind: "known" as const, value: true } } : unavailable === "snapshot-store" ? { ...value, source: {} } : value
    },
    executeRetainedV1Acceptance: unavailable === "executor" ? undefined : async () => { throw Error("Inspection acceptance executed") },
    async executeRetainedAgreement() { throw Error("Inspection receipt executed") }, async execute() { throw Error("Inspection removal executed") }, onRetainedV1Uncertainty() { barriers++ } })
  const read = await recovery.read(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-v1-acceptance")).toBe(false)
  expect(h.writes).toEqual([]); expect(barriers).toBe(0)
})

for (const stage of v1Stages) test(`V1 known unchanged ${stage} rejection permits only a fresh explicit review`, async () => {
  const { h, writer } = await v1Owner(), input = await v1Selection(writer)
  h.write(async (items, apply) => { if (v1Stage(items) === stage) throw h.error; apply(items) })
  const failed = await writer.recoverWithdrawnWork(origin, input)
  expect(failed.kind).not.toBe("recovered")
  expect(await writer.recoverWithdrawnWork(origin, input)).toEqual({ kind: "unavailable", reason: "stale" })
  const again = await v1Selection(writer)
  h.write(async (items, apply) => { apply(items) })
  expect((await writer.recoverWithdrawnWork(origin, again)).kind).toBe("recovered")
  await writer.dispose()
})

test("V1 acceptance permits are one-use references and remain separate from receipt authority", async () => {
  const fixture = await (v1Seed ??= withdrawalRetainedV1Fixture()), h = createInterimHarness(fixture.stores.local)
  let permit: ExactRetainedV1AcceptancePermit | undefined, barriers = 0, acceptedSets = 0
  const deps = { observe: () => h.deps.local.get(null), observeRetainedAgreement: async () => interimSnapshot(h.records()), revision: () => 0, stopped: () => false,
    set: (items: JsonObject) => h.deps.local.set(items), onRetainedV1Uncertainty() { barriers++ }, async execute() { return { kind: "unavailable" as const, reason: "startup" as const } },
    executeRetainedAgreement: (value: Parameters<typeof executeExactRetainedAgreement>[0]) => executeExactRetainedAgreement(value, { setLedger: ledger => h.deps.local.set({ [consentJobsKey]: ledger }), setConfirmed: async record => { if (!consentObject(record)) throw Error("Invalid confirmed JSON"); await h.deps.local.set({ interimConversion: record }) } }),
    async executeRetainedV1Acceptance(value: ExactRetainedV1AcceptancePermit) {
      permit = value
      expect(await executeExactRetainedV1Acceptance({ ...value }, { async setAccepted() { throw Error("Copied capability executed") } })).toEqual({ kind: "unavailable", reason: "stale" })
      const result = await executeExactRetainedV1Acceptance(value, { async setAccepted(batch) {
        acceptedSets++
        expect(await executeExactRetainedV1Acceptance(value, { async setAccepted() { throw Error("Reentrant capability executed") } })).toEqual({ kind: "unavailable", reason: "stale" })
        expect(await executeExactRetainedAgreement(value as unknown as Parameters<typeof executeExactRetainedAgreement>[0], { async setLedger() { throw Error("V1 receipt authority") }, async setConfirmed() { throw Error("V1 Device authority") } })).toEqual({ kind: "unavailable", reason: "stale" })
        if (!consentObject(batch)) throw Error("Invalid acceptance JSON")
        await h.deps.local.set(batch)
      } })
      expect(await executeExactRetainedV1Acceptance(value, { async setAccepted() { throw Error("Consumed capability executed") } })).toEqual({ kind: "unavailable", reason: "stale" })
      return result
    } }
  const recovery = createConsentRecovery(deps), read = await recovery.read(origin)
  if (read.kind !== "held") throw Error("Direct V1 read missing")
  const selected = read.work.find(view => view.kind === "retained-v1-acceptance")
  if (!selected || selected.kind !== "retained-v1-acceptance") throw Error("Direct V1 selection missing")
  expect((await recovery.recover(origin, { review: read.review, job: selected.selection })).kind).toBe("recovered")
  expect(permit).toBeDefined(); expect(acceptedSets).toBe(1); expect(barriers).toBe(0)
})

test("V1 final independent completion failure preserves the confirmed receipt and closes the owner", async () => {
  const { h, writer } = await v1Owner(), input = await v1Selection(writer)
  let done = false, reads = 0
  h.write(async (items, apply) => { apply(items); if (v1Stage(items) === "done") done = true })
  h.get(async () => { if (done && ++reads === 3) throw h.readError })
  const result = await writer.recoverWithdrawnWork(origin, input)
  if (result.kind !== "authorized-pending" || !("completionCheck" in result)) throw Error("V1 completion result absent")
  expect(result.observation.kind).toBe("confirmed"); expect(result.completionCheck).toEqual({ kind: "read-failed", error: h.readError })
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-v1-acceptance")).toBe(false)
  expect(parseConsentJobs(h.records()[consentJobsKey])?.jobs[0]?.permission.kind).toBe("done")
  await writer.dispose()
})


import { withdrawalRetainedInstallationFixture } from "../../../tools/fixtures/interim-conversion/run"
import { executeExactRetainedInstallation, type ExactRetainedInstallationPermit } from "./consent-recovery"
function installationRawJob(ledger: JsonObject): JsonObject {
  if (!Array.isArray(ledger.jobs)) throw Error("Expected jobs array")
  return rawObject(ledger.jobs[0])
}
let installationSeed: ReturnType<typeof withdrawalRetainedInstallationFixture> | undefined
async function installation(seed?: JsonObject) {
  const fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture())
  if (fixture.kind !== "ready") throw Error("Old accepted V3 fixture unreachable")
  const h = createInterimHarness(seed ?? fixture.stores.local), writer = createStartingLocalFilterWriter(h.deps)
  await expect(writer.ready()).rejects.toBeInstanceOf(StartupReadinessError)
  return { h, writer, fixture }
}
async function installationInput(writer: ReturnType<typeof createStartingLocalFilterWriter>, ui: Parameters<typeof writer.readWithdrawnWork>[0] = origin) {
  const read = await writer.readWithdrawnWork(ui)
  if (read.kind !== "held") throw Error("Installation work not held")
  const view = read.work.find(view => view.kind === "retained-installation")
  if (view?.kind !== "retained-installation") throw Error("Installation selection absent")
  return { input: { review: read.review, job: view.selection }, view }
}
let installationDone: Promise<{ records: JsonObject; states: JsonObject[]; batches: JsonObject[] }> | undefined
async function completedInstallation() {
  return installationDone ??= (async () => {
    const { h, writer } = await installation(), states: JsonObject[] = []
    h.write(async (items, apply) => { apply(items); states.push(h.records()) })
    const { input } = await installationInput(writer)
    expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
    const records = h.records(); await writer.dispose()
    return { records, states, batches: h.writes }
  })()
}

test("installation captures reject copied, foreign, consumed and malformed recognized reviews", async () => {
  const { h, writer } = await installation(), foreign = await installation(), before = h.records(), { input } = await installationInput(writer)
  expect(await writer.recoverWithdrawnWork(origin, { review: { ...input.review }, job: input.job })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await foreign.writer.recoverWithdrawnWork(origin, input)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await writer.recoverWithdrawnWork(origin, { ...input, job: { ...input.job } })).toEqual({ kind: "unavailable", reason: "unsupported-recovery" })
  expect(await writer.recoverWithdrawnWork(origin, input)).toEqual({ kind: "unavailable", reason: "stale" })
  const next = await installationInput(writer)
  expect(await writer.recoverWithdrawnWork(origin, { ...next.input, extra: true } as unknown as typeof input)).toEqual({ kind: "refused", reason: "invalid-input" })
  expect(await writer.recoverWithdrawnWork(origin, next.input)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.records()).toEqual(before); expect(h.writes).toEqual([])
  await writer.dispose(); await foreign.writer.dispose()
})

test("private installation inspection never authorizes and the attempted review is consumed", async () => {
  const { h, writer } = await installation(), privateUi = { ...origin, incognito: true }, { input } = await installationInput(writer, privateUi)
  expect(await writer.recoverWithdrawnWork(privateUi, input)).toEqual({ kind: "refused", reason: "private" })
  expect(await writer.recoverWithdrawnWork(origin, input)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.writes).toEqual([]); await writer.dispose()
})

for (const field of ["device", "source", "history"] as const) test(`installation observed ${field} ABA invalidates an older capture`, async () => {
  const { h, writer } = await installation(), { input } = await installationInput(writer), before = h.records()
  h.foreign(records => {
    if (field === "device") rawObject(records.device).future = { drift: true }
    if (field === "source") records.sessionConsent = 2
    if (field === "history") rawObject(records.sync).future = { drift: true }
  })
  await writer.readWithdrawnWork(origin)
  h.foreign(records => { for (const key of Object.keys(records)) delete records[key]; Object.assign(records, before) })
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("unavailable")
  expect(h.writes).toEqual([]); await writer.dispose()
})

for (const counter of ["next", "generation", "lastAgreementAt"] as const) test(`installation exhausted ${counter} remains held`, async () => {
  const fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture()), raw = rawObject(JSON.parse(JSON.stringify(fixture.stores.local)))
  if (counter === "next") raw[consentJobsKey] = { v: 1, kind: "consent-jobs", deviceId: "synthetic-device", next: Number.MAX_SAFE_INTEGER, jobs: [] }
  else rawObject(raw["consent:state"])[counter] = Number.MAX_SAFE_INTEGER
  const { h, writer } = await installation(raw), read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation")).toBe(false)
  expect(h.records()).toEqual(raw); expect(h.writes).toEqual([]); await writer.dispose()
})

test("installation strict parsing binds effect, history, original agreement and terminal progress", async () => {
  const { batches } = await completedInstallation(), accepted = rawObject(batches[0]![consentJobsKey]), terminal = rawObject(batches[3]![consentJobsKey])
  const changes: ((raw: JsonObject) => void)[] = [
    raw => { raw.extra = true },
    raw => { rawObject(installationRawJob(raw)).extra = true },
    raw => { rawObject(rawObject(installationRawJob(raw)).identity).extra = true },
    raw => { rawObject(rawObject(rawObject(installationRawJob(raw)).identity).operation).extra = true },
    raw => { rawObject(rawObject(rawObject(installationRawJob(raw)).identity).operation).effect = {} },
    raw => { rawObject(rawObject(installationRawJob(raw)).identity).original = { v: 1, at: 301 } },
    raw => { rawObject(rawObject(installationRawJob(raw)).identity).occurrence = raw.next! },
    raw => { rawObject(installationRawJob(raw)).permission = { kind: "done" } },
    raw => { rawObject(installationRawJob(raw)).permission = { kind: "retiring", generation: 2, current: { v: 1, at: 300 } } },
    raw => { rawObject(rawObject(rawObject(installationRawJob(raw)).identity).operation).kind = "retained-agreement" },
    raw => { rawObject(rawObject(rawObject(rawObject(installationRawJob(raw)).identity).operation).record).installation = { kind: "installed", history: { kind: "absent" } } },
    raw => { raw.jobs = [installationRawJob(raw)!, installationRawJob(raw)!] },
    raw => { raw.next = Number.MAX_SAFE_INTEGER + 1 }
  ]
  for (const change of changes) {
    const candidate = rawObject(JSON.parse(JSON.stringify(accepted))); change(candidate)
    expect(parseConsentJobs(candidate)).toBeUndefined()
  }
  const heldTerminal = rawObject(JSON.parse(JSON.stringify(terminal))); rawObject(installationRawJob(heldTerminal)).permission = { kind: "held" }
  expect(parseConsentJobs(heldTerminal)).toBeUndefined()
  let hooks = 0
  const accessor = rawObject(JSON.parse(JSON.stringify(accepted)))
  Object.defineProperty(rawObject(rawObject(installationRawJob(accessor)).identity), "original", { enumerable: true, get() { hooks++; throw Error("Getter invoked") } })
  expect(parseConsentJobs(accessor)).toBeUndefined(); expect(hooks).toBe(0)
  for (const raw of [accepted, terminal]) expect(parseConsentJobs(raw)).toBeDefined()
})

test("terminal installation cannot repair a missing, edited or tombstoned document", async () => {
  const { states } = await completedInstallation(), terminal = states[3]!
  for (const change of ["absent", "tombstone", "generation", "extra"] as const) {
    const raw = rawObject(JSON.parse(JSON.stringify(terminal)))
    if (change === "absent") delete raw["doc:settings"]
    if (change === "tombstone") raw["doc:settings"] = { ...rawObject(raw["doc:settings"]), data: null }
    if (change === "generation") rawObject(raw["doc:settings"]).gen = "foreign"
    if (change === "extra") raw["doc:filter:AAAAAAAAAAAAAAAA:PL_EXTRA"] = raw["doc:settings"]!
    const { h, writer } = await installation(raw), read = await writer.readWithdrawnWork(origin)
    expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation")).toBe(false)
    expect(h.records()).toEqual(raw); expect(h.writes).toEqual([]); await writer.dispose()
  }
})

test("terminal installation reauthorization retains progress under a later actual agreement", async () => {
  const { states } = await completedInstallation(), fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture())
  const renewed = await renewWithdrawalAgreement({ ...fixture.stores, local: states[3]! }), { h, writer } = await installation(renewed.stores.local)
  const { input, view } = await installationInput(writer)
  expect(view.progress).toBe("terminal"); expect(view.current.at).toBe(301)
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
  expect(h.writes.map(batch => Object.keys(batch))).toEqual([[consentJobsKey], [consentJobsKey], [consentJobsKey], ["interimConversion"], [consentJobsKey]])
  expect(h.writes.filter(batch => Object.hasOwn(batch, consentJobsKey)).every(batch => parseConsentJobs(batch[consentJobsKey])?.jobs[0]?.progress.kind === "terminal")).toBe(true)
  expect(h.records().device).toEqual(renewed.stores.local.device); await writer.dispose()
})

test("done installation suppresses fallback for identical accepted V3 reappearance", async () => {
  const { records } = await completedInstallation(), fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture())
  const reappeared = { ...records, interimConversion: fixture.stores.local.interimConversion! }, { h, writer } = await installation(reappeared)
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation")).toBe(false)
  expect(h.writes).toEqual([]); expect(h.records()).toEqual(reappeared); await writer.dispose()
})

test("installation permit is distinct, one use, and unavailable after its attempt", async () => {
  const fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture()), h = createInterimHarness(fixture.stores.local)
  let saved: ExactRetainedInstallationPermit | undefined
  const ports = { setDocuments: async () => { throw Error("Copied permit executed documents") }, setInstalled: async () => { throw Error("Copied permit executed receipt") }, setLedger: async () => { throw Error("Copied permit executed ledger") } }
  const recovery = createConsentRecovery({ observe: () => h.deps.local.get(null), observeRetainedAgreement: () => h.deps.startup.readInterimSnapshot(), revision: () => 0, stopped: () => false,
    set: items => h.deps.local.set(items), onRetainedV1Uncertainty() {}, onRetainedInstallationUncertainty() {}, async execute() { throw Error("Removal invoked") },
    async executeRetainedInstallation(permit) {
      saved = permit
      expect(await executeExactRetainedInstallation({ ...permit }, ports)).toEqual({ kind: "unavailable", reason: "stale", mutations: [] })
      const result = await executeExactRetainedInstallation(permit, {
        async setDocuments(effect) {
          expect(await executeExactRetainedInstallation(permit, ports)).toEqual({ kind: "unavailable", reason: "stale", mutations: [] })
          const batch: JsonObject = Object.fromEntries([...effect.documents.map(x => [x.path, x.document]), ...effect.caches.map(x => [x.path, x.data])])
          if (effect.schema.kind === "set") batch.schema = effect.schema.value
          await h.deps.local.set(batch)
        },
        async setLedger(ledger) { await h.deps.local.set({ [consentJobsKey]: ledger }) },
        async setInstalled(record) { if (!consentObject(record)) throw Error("Non-JSON receipt"); await h.deps.local.set({ interimConversion: record }) }
      })
      expect(await executeExactRetainedInstallation(permit, ports)).toEqual({ kind: "unavailable", reason: "stale", mutations: [] })
      return result
    } })
  const read = await recovery.read(origin)
  if (read.kind !== "held") throw Error("Missing direct installation read")
  const view = read.work.find(view => view.kind === "retained-installation")
  if (view?.kind !== "retained-installation") throw Error("Missing direct installation view")
  expect((await recovery.recover(origin, { review: read.review, job: view.selection })).kind).toBe("recovered")
  if (!saved) throw Error("Permit not observed")
  expect(await executeExactRetainedInstallation(saved, ports)).toEqual({ kind: "unavailable", reason: "stale", mutations: [] })
})


for (const stage of ["prepare", "authorize", "documents", "retire", "record", "done"] as const) test(`installation ${stage} drains its invoked setter and refuses queued effects after actual withdrawal`, async () => {
  const { h, writer, fixture } = await installation(), { input } = await installationInput(writer)
  let fired = false, withdrawal: Awaited<ReturnType<typeof renewWithdrawalAgreement>> | undefined
  const queued: Promise<unknown>[] = []
  h.write(async (items, apply) => {
    const ledger = parseConsentJobs(items[consentJobsKey]), permission = ledger?.jobs.find(job => job.identity.operation.kind === "retained-installation")?.permission.kind
    const current = Object.hasOwn(items, "interimConversion") ? "record" : permission === "prepared" ? "prepare" : permission === "armed" ? "authorize" : permission === "retiring" ? "retire" : permission === "done" ? "done" : "documents"
    apply(items)
    if (current !== stage || fired) return
    fired = true
    queued.push(writer.resumeInterimInstallation(origin), writer.changeSharedSetting(origin, { kind: "theme", value: "dark" }), writer.recoverWithdrawnWork(origin, input))
    withdrawal = await renewWithdrawalAgreement({ ...fixture.stores, local: h.records() })
    const actual = withdrawal.stores.local
    h.foreign(records => { for (const key of Object.keys(records)) delete records[key]; Object.assign(records, actual) })
  })
  const result = await writer.recoverWithdrawnWork(origin, input)
  expect(fired).toBe(true); expect(withdrawal).toBeDefined(); expect(result.kind).not.toBe("recovered")
  const inspection = await writer.readWithdrawnWork(origin)
  expect(inspection.kind === "held" && inspection.work.some(view => view.kind === "retained-installation")).toBe(false)
  expect(h.writes.length).toBe(["prepare", "authorize", "documents", "retire", "record", "done"].indexOf(stage) + 1)
  for (const result of await Promise.all(queued)) expect(rawObject(result).kind).not.toBe("committed")
  expect(h.records().interimConversion).toEqual(withdrawal!.stores.local.interimConversion)
  await writer.dispose()
})

test("installation snapshot origin is fixed before a queued caller changes it", async () => {
  const { h, writer } = await installation(), { input } = await installationInput(writer)
  let enter = () => {}, release = () => {}
  const entered = new Promise<void>(done => { enter = done }), pause = new Promise<void>(done => { release = done })
  h.get(async () => { h.get(undefined); enter(); await pause })
  const blocking = writer.readWithdrawnWork(origin)
  await entered
  const caller = { kind: "ui" as const, windowId: 1, incognito: true }, queued = writer.recoverWithdrawnWork(caller, input)
  caller.incognito = false; release(); await blocking
  expect(await queued).toEqual({ kind: "refused", reason: "private" })
  expect(h.writes).toEqual([]); await writer.dispose()
})

test("installation unexpected changed-back readback closes execution even after final bytes match", async () => {
  const { h, writer } = await installation(), { input } = await installationInput(writer)
  let once = false
  h.write(async (items, apply) => {
    apply(items)
    if (once) return
    once = true
    const actual = h.records()
    h.get(async () => {
      h.foreign(records => { rawObject(records.device).future = { unexpected: true } })
      h.get(async () => { h.get(undefined); h.foreign(records => { records.device = actual.device! }) })
    })
  })
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("unconfirmed")
  h.get(undefined)
  const fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture())
  h.foreign(records => { records.device = fixture.stores.local.device! })
  const read = await writer.readWithdrawnWork(origin)
  expect(h.records().device).toEqual(fixture.stores.local.device)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation")).toBe(false)
  expect(h.writes.length).toBe(1); await writer.dispose()
})


for (const unavailable of ["source", "executor", "facts"] as const) test(`installation missing ${unavailable} permits inspection only`, async () => {
  const fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture()), h = createInterimHarness(fixture.stores.local)
  const recovery = createConsentRecovery({ observe: () => h.deps.local.get(null), revision: () => 0, stopped: () => false, set: items => h.deps.local.set(items), onRetainedV1Uncertainty() {},
    observeRetainedAgreement: unavailable === "source" ? undefined : async () => { const source = await h.deps.startup.readInterimSnapshot(); return unavailable === "facts" ? { ...source, priorCredentialPresence: { kind: "known", value: true } } : source },
    executeRetainedInstallation: unavailable === "executor" ? undefined : async () => { throw Error("Inspection executed installation") }, async execute() { throw Error("Inspection executed removal") } })
  const read = await recovery.read(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-installation")).toBe(false)
  expect(h.writes).toEqual([])
})

test("composed compatible V3 and V2 root extensions survive the exact installed receipt", async () => {
  const fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture()), records = rawObject(JSON.parse(JSON.stringify(fixture.stores.local)))
  const raw = rawObject(records.interimConversion), agreed = rawObject(raw.agreed)
  raw.future = { root: [null, false] }; agreed.future = { v2: [false, null] }
  const { h, writer } = await installation(records), { input } = await installationInput(writer)
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
  const receipt = rawObject(h.records().interimConversion)
  expect(receipt).toEqual({ ...raw, installation: { ...rawObject(raw.installation), kind: "installed" } })
  expect(rawObject(receipt.agreed).future).toEqual(agreed.future); await writer.dispose()
})

test("composed old V1 witness and sibling job bytes survive installation ledger parsing and replacement", async () => {
  const old = await completedV1(), current = await completedInstallation(), fixture = await (installationSeed ??= withdrawalRetainedInstallationFixture())
  const prior = rawObject(old.records[consentJobsKey]), base = rawObject(current.states[0]![consentJobsKey])
  const job = rawObject(JSON.parse(JSON.stringify(installationRawJob(base)))), identity = rawObject(job.identity)
  identity.occurrence = 1
  const combined = { ...prior, next: 2, jobs: [installationRawJob(prior), job] }
  expect(parseConsentJobs(combined)).toBeDefined()
  const records = { ...fixture.stores.local, [consentJobsKey]: combined }, { h, writer } = await installation(records), { input } = await installationInput(writer)
  expect((await writer.recoverWithdrawnWork(origin, input)).kind).toBe("recovered")
  for (const batch of h.writes) if (Object.hasOwn(batch, consentJobsKey)) {
    const ledger = rawObject(batch[consentJobsKey])
    expect(ledger.retainedV1).toEqual(prior.retainedV1)
    expect(installationRawJob(ledger)).toEqual(installationRawJob(prior))
  }
  await writer.dispose()
})
