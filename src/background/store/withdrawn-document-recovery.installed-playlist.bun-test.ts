import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import { parseConsentJobs, sameConsentValue, consentJobsKey } from "./consent-recovery"
import { consentObject, readConsentDevice } from "./consent-withdrawal"
import { recoveryUi } from "../../../tools/fixtures/interim-recovery-review/run"
import { heldReady, copy, createWithdrawnPlaylistHarness, selectPlaylist, submittedPlaylistStage } from "../../../tools/fixtures/withdrawn-document-recovery/run"
import { isAcceptedPlaylistRecord, parseRetainedPlaylistIdentity } from "./withdrawn-document-recovery"
import { createInstalledPlaylistInput } from "../../../tools/fixtures/withdrawn-document-recovery/v3-playlist"
import { stages, openPlaylist, recoverPlaylist, playlistExecution, installedFixture, installedBasis, contractCompleted, fixedDocuments, offersPlaylist, outbound } from "../../../tools/fixtures/withdrawn-document-recovery/cases"

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
