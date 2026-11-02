import { expect, test } from "bun:test"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import { readConsentDevice } from "./consent-withdrawal"
import { parseConsentJobs, consentJobsKey } from "./consent-recovery"
import { withdrawRemovalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { createInterimHarness, interimSnapshot, runWithdrawalRetainedAgreement } from "../../../tools/fixtures/interim-conversion/run"
import { readRetainedCheckpoint, recoveredRetainedAgreementDifference, retainedCheckpointDifference } from "./interim-persistence"
import { origin, retained, retainedSelection, retainedAgreementSeed } from "../../../tools/fixtures/consent-recovery/cases"

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
    const fixture = await retainedAgreementSeed(), h = createInterimHarness(fixture.stores.local)
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
  const fixture = await retainedAgreementSeed(), h = createInterimHarness(fixture.stores.local), writer = createLocalFilterWriter(h.deps)
  const read = await writer.readWithdrawnWork(origin)
  expect(read.kind === "held" && read.work.some(view => view.kind === "retained-agreement")).toBe(false)
  expect(h.writes).toEqual([]); await writer.dispose()
})

test("the public comparison permits only current consent and exact terminal receipt progression", async () => {
  const fixture = await retainedAgreementSeed(), parsed = readRetainedCheckpoint(fixture.stores.local.interimConversion)
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
  const fixture = await retainedAgreementSeed(), record = fixture.stores.local.interimConversion
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
  const fixture = await retainedAgreementSeed(), h = createInterimHarness(fixture.stores.local)
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
