import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter, createLocalFilterWriter } from "./local-filter-writer"
import { classifyRetainedAuthority, readCanonicalAuthorityRecord } from "./interim-canonical-authority"
import { readRetainedCheckpoint, isInterimSourceKey, projectInterimNote } from "./interim-persistence"
import { readJoinLocal } from "./sync-join-execution"
import { projectClaimNotice } from "./claim-notice"
import {
  createAuthorityHarness,
  installAuthorityFixture,
  releaseAuthorityFixture,
  observeCanonicalAuthorityExecution,
  authorityAcceptanceFixture as fixture,
  recoveryUi as ui,
  recoveryEqual,
  recoveryDiscardSelection
} from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot } from "../../../tools/fixtures/interim-conversion/run"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { isPlaylistId } from "../../shared/model/validation"

const name = "doc:filter:AAAAAAAAAAAAAAAA:PL_ONE"
const copy = <T>(raw: T): T => JSON.parse(JSON.stringify(raw))
function object(raw: unknown): raw is JsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
}
function gate() {
  let release = () => {}
  const promise = new Promise<void>(resolve => {
    release = resolve
  })
  return { promise, release }
}
async function installed(seed?: JsonObject) {
  const h = createAuthorityHarness(seed)
  return { h, ...(await installAuthorityFixture(h)) }
}
async function released(seed?: JsonObject) {
  const p = await installed(seed)
  expect((await releaseAuthorityFixture(p.h, p.owner)).kind).toBe("restart-required")
  await p.owner.dispose()
  const fresh = createStartingLocalFilterWriter(p.h.actor("fresh"))
  expect(await fresh.ready()).toBe("ok")
  return { ...p, fresh }
}
async function review(owner: ReturnType<typeof createStartingLocalFilterWriter>) {
  const read = await owner.readCanonicalAuthority(ui)
  if (read.kind !== "review") throw Error("No authority review " + JSON.stringify(read))
  return read.review
}
async function pending() {
  const p = await installed()
  p.h.retire(async () => {
    throw p.h.error
  })
  expect(await p.owner.releaseRetainedAuthority(ui, await review(p.owner))).toEqual({ kind: "failed", stage: "retire", write: { kind: "rejected", error: p.h.error } })
  p.h.retire(undefined)
  const records = p.h.records(),
    supervisor = p.h.supervisor()
  await p.owner.dispose()
  return { records, supervisor }
}

test("discard requires a live exclusive capability before and after its single write", async () => {
  for (const when of ["before", "after"] as const) {
    const p = await released(),
      selection = await recoveryDiscardSelection(p.fresh, "playlists", [0]),
      writes = p.h.writes.length
    if (when === "before") p.h.revoke()
    else
      p.h.write(async (items, apply) => {
        apply(items)
        p.h.revoke()
      })
    const result = await p.fresh.discardInterimItem(ui, { capture: selection.opened.capture, item: selection.item.id })
    expect(result.kind).toBe(when === "before" ? "unavailable" : "unconfirmed")
    expect(p.h.writes.length).toBe(writes + (when === "after" ? 1 : 0))
    expect((await p.fresh.read("settings")).kind).toBe("unavailable")
    await p.fresh.dispose()
    expect(p.h.resources()).toEqual({ pending: 0, listeners: 0, timers: 0, reservation: "none" })
  }
}, 60000)

test("mixed V5 receipts reject cross-kind, archive, suffix and pending duplicates with normalized locators", async () => {
  const p = await released(),
    playlist = "PL_ONE"
  if (!isPlaylistId(playlist)) throw Error("Invalid test playlist")
  p.h.allocateReplacement()
  p.h.replacementGeneration("discard-before-restore")
  expect(await p.fresh.change(ui, { acct: p.h.account, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" })).toEqual({ kind: "result", result: { ok: true } })
  p.h.replacementGeneration("discard-restored")
  const filter = await recoveryDiscardSelection(p.fresh, "account:AAAAAAAAAAAAAAAA", ["filters", "PL_ONE"])
  const prepared = await p.fresh.prepareInterimFilterReplacement(ui, { capture: filter.opened.capture, item: filter.item.id })
  if (prepared.kind !== "confirmation-required") throw Error("No actual V5 replacement")
  expect((await p.fresh.replaceInterimFilter(ui, prepared.confirmation)).kind).toBe("committed")
  const selected = await recoveryDiscardSelection(p.fresh, "playlists", [0])
  expect((await p.fresh.discardInterimItem(ui, { capture: selected.opened.capture, item: selected.item.id })).kind).toBe("committed")
  const records = p.h.records(),
    raw = records.interimConversion
  if (!object(raw) || !Array.isArray(raw.resolutions) || !object(raw.resolutions[0]) || !object(raw.resolutions[0].effect)) throw Error("No mixed V5")
  const first = raw.resolutions[0],
    effect = first.effect
  if (!object(effect)) throw Error("No validated fixture effect")
  const discardFilter = { kind: "discarded", item: effect.item },
    discardGlobal = { kind: "discarded", item: { path: [0], sourceKey: "playlists" } }
  expect(readCanonicalAuthorityRecord({ ...raw, resolutions: [first, discardGlobal] }).kind).toBe("authority")
  for (const resolutions of [
    [first, discardFilter],
    [discardFilter, first],
    [...raw.resolutions, discardGlobal]
  ]) {
    expect(readCanonicalAuthorityRecord({ ...raw, resolutions })).toEqual({ kind: "invalid" })
  }
  expect(readCanonicalAuthorityRecord({ ...raw, resolutions: [discardFilter], pending: { kind: "filter-replacement", effect } })).toEqual({ kind: "invalid" })
  expect(readCanonicalAuthorityRecord({ ...raw, resolutions: [], pending: discardGlobal })).toEqual({ kind: "invalid" })
  for (const receipt of [
    { ...discardGlobal, effect },
    { kind: "discarded", item: { sourceKey: "playlists", path: [] } },
    { kind: "discarded", item: { sourceKey: "playlists", path: ["0"] } },
    { kind: "discarded", item: { sourceKey: "playlists", path: [0], captureId: "durable-forgery" } }
  ]) {
    expect(readCanonicalAuthorityRecord({ ...raw, resolutions: [receipt] })).toEqual({ kind: "invalid" })
  }
  const prefix = await installed(),
    prefixSelection = await recoveryDiscardSelection(prefix.owner, "playlists", [0])
  expect((await prefix.owner.discardInterimItem(ui, { capture: prefixSelection.opened.capture, item: prefixSelection.item.id })).kind).toBe("committed")
  const checkpoint = prefix.h.records().interimConversion
  expect(readCanonicalAuthorityRecord({ ...raw, archive: { kind: "completed-v4", checkpoint }, resolutions: [first] }).kind).toBe("authority")
  expect(readCanonicalAuthorityRecord({ ...raw, archive: { kind: "completed-v4", checkpoint } })).toEqual({ kind: "invalid" })
  const filterPrefix = await recoveryDiscardSelection(prefix.owner, "account:AAAAAAAAAAAAAAAA", ["filters", "PL_ONE"])
  expect((await prefix.owner.discardInterimItem(ui, { capture: filterPrefix.opened.capture, item: filterPrefix.item.id })).kind).toBe("committed")
  expect(readCanonicalAuthorityRecord({ ...raw, archive: { kind: "completed-v4", checkpoint: prefix.h.records().interimConversion }, resolutions: [first] })).toEqual({ kind: "invalid" })
  await prefix.owner.dispose()
  await p.fresh.dispose()
}, 60000)

test("real release, consumer restart, ordinary edit and account removal preserve the entire archive", async () => {
  const result = await observeCanonicalAuthorityExecution()
  expect(result.maximumWriters).toBe(1)
  expect(result.resources).toEqual({ pending: 0, listeners: 0, timers: 0, reservation: "none" })
  expect(result.restartResources).toEqual(result.resources)
  expect(result.handoffEffects.filter(x => typeof x === "string")).toEqual([])
}, 60000)

test("accepted restart is read-only and explicit resume reuses the exact epoch and handoff id", async () => {
  const saved = await pending(),
    h = createAuthorityHarness(copy(saved.records), saved.supervisor)
  h.stopPriorProducers()
  h.forbidAllocation()
  const owner = createStartingLocalFilterWriter(h.actor("resume"))
  await expect(owner.ready()).rejects.toMatchObject({ result: { kind: "interim-held", result: { kind: "pending-authority" } } })
  expect(h.writes).toEqual([])
  expect(await owner.readCanonicalAuthority(ui)).toEqual({ kind: "pending", action: "resume-retained-authority", activation: "held" })
  const result = await owner.resumeRetainedAuthority(ui)
  expect(result).toMatchObject({ kind: "restart-required", activation: "held" })
  expect(result.kind === "restart-required" && result.mutations.map(x => x.stage)).toEqual(["retire", "record"])
  const read = readRetainedCheckpoint(h.records().interimConversion)
  expect<unknown>(read.kind === "authority" && read.checkpoint.handoff.handoffId).toBe(saved.supervisor.handoffId)
  expect(h.trace.filter(x => object(x) && x.kind === "begin")).toEqual([
    { kind: "begin", actor: "resume", input: { kind: "resume", sourceEpoch: saved.supervisor.sourceEpoch, handoffId: saved.supervisor.handoffId }, handoffId: saved.supervisor.handoffId }
  ])
  await owner.dispose()
  const fresh = createStartingLocalFilterWriter(h.actor("canonical"))
  expect(await fresh.ready()).toBe("ok")
  await fresh.dispose()
}, 60000)

test("pre-release edits, tombstones, history and source drift refuse accepted continuation", async () => {
  const saved = await pending()
  for (const change of ["edit", "delete", "source", "history"] as const) {
    const seed = copy(saved.records)
    if (change === "edit") seed[name] = { ...fixture.laterOrdinaryEdit.expectedFilter }
    if (change === "delete") seed[name] = { ...fixture.laterCanonicalTombstone.expectedRestart.filter }
    if (change === "source") seed.playlists = ["CHANGED"]
    if (change === "history") seed.sync = { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
    const h = createAuthorityHarness(seed, saved.supervisor)
    h.stopPriorProducers()
    const owner = createStartingLocalFilterWriter(h.actor(change))
    await owner.ready().catch(() => {})
    expect((await owner.resumeRetainedAuthority(ui)).kind).toBe("unavailable")
    expect(h.writes).toEqual([])
    expect(h.records()).toEqual(seed)
    await owner.dispose()
  }
}, 60000)

test("after release, edited documents and tombstones win across serialized restart without cleanup", async () => {
  const p = await released(),
    canonical = p.h.records()
  await p.fresh.dispose()
  for (const filter of [fixture.laterOrdinaryEdit.expectedFilter, fixture.laterCanonicalTombstone.expectedRestart.filter]) {
    const seed: JsonObject = { ...copy(canonical), [name]: copy(filter) }
    const h = createAuthorityHarness(seed, p.h.supervisor())
    h.stopPriorProducers()
    h.forbidAllocation()
    const fresh = createStartingLocalFilterWriter(h.actor("restart"))
    expect(await fresh.ready()).toBe("ok")
    expect(h.records()).toEqual(seed)
    expect(h.writes).toEqual([])
    expect(projectInterimNote({ checkpoint: seed.interimConversion, current: interimSnapshot(seed) })).toMatchObject({ kind: "canonical-archive", activation: "canonical" })
    expect(await fresh.readInterimNote()).toMatchObject({ kind: "canonical-archive", activation: "canonical" })
    await fresh.dispose()
  }
}, 60000)

test("a receipt grants no live ownership before disposal, against competitors or after revocation", async () => {
  const p = await installed()
  expect((await releaseAuthorityFixture(p.h, p.owner)).kind).toBe("restart-required")
  const early = createStartingLocalFilterWriter(p.h.actor("early"))
  await expect(early.ready()).rejects.toBeDefined()
  await early.dispose()
  await p.owner.dispose()
  const first = createStartingLocalFilterWriter(p.h.actor("first"))
  expect(await first.ready()).toBe("ok")
  const second = createStartingLocalFilterWriter(p.h.actor("second"))
  await expect(second.ready()).rejects.toBeDefined()
  await second.dispose()
  const preinitialized = createLocalFilterWriter(p.h.actor("escape"))
  expect((await preinitialized.read("settings")).kind).toBe("unavailable")
  await preinitialized.dispose()
  const before = p.h.records(),
    writes = p.h.writes.length
  p.h.revoke()
  expect((await first.read("settings")).kind).toBe("unavailable")
  expect((await first.claim()).kind).toBe("unavailable")
  expect(await first.flushSync()).toEqual({ kind: "unavailable" })
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(writes)
  await first.dispose()
  expect(p.h.resources().reservation).toBe("none")
}, 60000)

test("the synthetic supervisor drains delayed old callbacks and rejects all competing producer ports", async () => {
  const p = await installed(),
    shown = await review(p.owner)
  const unblock = gate(),
    retiring = gate()
  const delayed = p.h.delayedProducer("delayed-old", unblock.promise, { unrelated: false })
  p.h.retire(async () => {
    retiring.release()
  })
  const release = p.owner.releaseRetainedAuthority(ui, shown)
  await retiring.promise
  const contender = p.h.actor("other-retained")
  await expect(contender.local.set({ unrelated: false })).rejects.toThrow("fenced")
  const raw = p.h.records().interimConversion
  expect(object(raw) && object(raw.handoff) && raw.handoff.kind).toBe("accepted")
  const fresh = createStartingLocalFilterWriter(p.h.actor("too-soon"))
  await expect(fresh.ready()).rejects.toBeDefined()
  await fresh.dispose()
  expect(p.h.resources().pending).toBe(1)
  unblock.release()
  expect(await delayed).toEqual({ kind: "fenced" })
  expect((await release).kind).toBe("restart-required")
  expect(p.h.records().unrelated).toEqual(fixture.seed.unrelated)
  expect(p.h.maximumWriters()).toBe(1)
  await p.owner.dispose()
  expect(p.h.resources().pending).toBe(0)
}, 60000)

test("copied, foreign, consumed, wrong-origin and observed A-B-A review capabilities cannot release", async () => {
  const p = await installed(),
    token = await review(p.owner),
    before = p.h.records(),
    writes = p.h.writes.length
  expect(await p.owner.releaseRetainedAuthority({ ...ui, incognito: true }, token)).toEqual({ kind: "refused", reason: "private" })
  expect(await p.owner.releaseRetainedAuthority({ ...ui, windowId: 9 }, token)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await p.owner.releaseRetainedAuthority(ui, { ...token })).toEqual({ kind: "unavailable", reason: "stale" })
  const other = createStartingLocalFilterWriter(p.h.actor("foreign"))
  await other.ready().catch(() => {})
  expect(await other.releaseRetainedAuthority(ui, token)).toEqual({ kind: "unavailable", reason: "stale" })
  await other.dispose()
  p.h.foreign(records => {
    records.unrelated = true
  })
  await p.owner.readCanonicalAuthority(ui)
  p.h.foreign(records => {
    records.unrelated = copy(before.unrelated!)
  })
  await p.owner.readCanonicalAuthority(ui)
  expect(await p.owner.releaseRetainedAuthority(ui, token)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(writes)
  const current = await review(p.owner)
  expect((await p.owner.releaseRetainedAuthority(ui, current)).kind).toBe("restart-required")
  expect((await p.owner.releaseRetainedAuthority(ui, current)).kind).toBe("unavailable")
  await p.owner.dispose()
}, 60000)

for (const stage of ["accept", "record"] as const)
  for (const mode of ["rejected-unchanged", "rejected-applied", "resolved-missing", "resolved-partial", "divergent", "read-failed"] as const) {
    test(`${stage} ${mode} preserves the actual write observation and closes uncertain results`, async () => {
      const p = await installed(),
        token = await review(p.owner),
        before = p.h.records()
      let attempts = 0
      p.h.write(async (items, apply) => {
        const raw = items.interimConversion
        const current = object(raw) && object(raw.handoff) && raw.handoff.kind === "accepted" ? "accept" : "record"
        if (current !== stage) {
          apply(items)
          return
        }
        attempts++
        if (mode === "rejected-unchanged") throw p.h.error
        if (mode === "resolved-missing") return
        if (mode === "resolved-partial") {
          apply({ interimConversion: { v: 5 } })
          return
        }
        apply(items)
        if (mode === "divergent")
          p.h.foreign(records => {
            records.unrelated = false
          })
        if (mode === "read-failed")
          p.h.get(async () => {
            throw p.h.readError
          })
        if (mode === "rejected-applied") throw p.h.error
      })
      const result = await p.owner.releaseRetainedAuthority(ui, token)
      expect(attempts).toBe(1)
      if (mode === "rejected-applied") {
        expect(result.kind).toBe("restart-required")
        if (result.kind !== "restart-required") throw Error("No confirmed applied result")
        const observed = result.mutations.find(x => x.stage === stage)?.write
        expect(observed?.kind === "rejected" && observed.error === p.h.error).toBe(true)
      } else if (mode === "rejected-unchanged") {
        expect(result.kind).toBe("failed")
        expect("write" in result && result.write.kind === "rejected" && result.write.error === p.h.error).toBe(true)
        if (stage === "accept") expect(p.h.records()).toEqual(before)
      } else {
        expect(result).toMatchObject({ kind: "unconfirmed", stage })
        if (mode === "read-failed") expect(result.kind === "unconfirmed" && result.cause.kind === "read-failed" && result.cause.error === p.h.readError).toBe(true)
        p.h.get(undefined)
        const writes = p.h.writes.length
        expect((await p.owner.claim()).kind).toBe("unavailable")
        expect(await p.owner.flushSync()).toEqual({ kind: "unavailable" })
        expect(p.h.writes.length).toBe(writes)
      }
      await p.owner.dispose()
    }, 60000)
  }

test("retirement failure and disposal at retirement never record canonical authority", async () => {
  for (const mode of ["reject", "dispose", "revoke"] as const) {
    const p = await installed(),
      token = await review(p.owner)
    let drain: Promise<void> | undefined
    p.h.retire(async () => {
      if (mode === "reject") throw p.h.error
      if (mode === "dispose") drain = p.owner.dispose()
      if (mode === "revoke") p.h.revoke()
    })
    const result = await p.owner.releaseRetainedAuthority(ui, token)
    expect(result).toMatchObject({ kind: mode === "reject" ? "failed" : "unconfirmed", stage: "retire" })
    const raw = p.h.records().interimConversion
    expect(object(raw) && object(raw.handoff) && raw.handoff.kind).toBe("accepted")
    await (drain ?? p.owner.dispose())
  }
}, 60000)

test("past opaque gates, sync-on, pending work and unrelated legacy keys stay held without release IO", async () => {
  const p = await installed(),
    baseline = p.h.records()
  await p.owner.dispose()
  for (const fault of ["opaque", "sync-on", "removal", "join", "legacy"] as const) {
    const seed = copy(baseline)
    if (fault === "opaque") seed.sync = { joined: null, pushed: {}, status: "off", editedSinceOff: false, opaqueWrite: { gate: { kind: "held", notBefore: 0 }, diagnostic: null } }
    if (fault === "sync-on" && object(seed.device)) seed.device.syncOn = true
    if (fault === "removal") seed["pending:account-removal"] = { v: 1 }
    if (fault === "join") seed["pending:sync-join"] = { v: 1 }
    if (fault === "legacy") seed.authMode = "synthetic-unclassified"
    const h = createAuthorityHarness(seed),
      owner = createStartingLocalFilterWriter(h.actor("held"))
    await owner.ready().catch(() => {})
    expect((await owner.readCanonicalAuthority(ui)).kind).toBe("unavailable")
    expect(h.writes).toEqual([])
    expect(h.records()).toEqual(seed)
    expect(h.effects.filter(x => ["sync-get", "sync-set", "timer", "stamp", "generation"].includes(String(x)))).toEqual([])
    await owner.dispose()
  }
}, 60000)

test("malformed V5 never exempts raw keys or invokes legacy cleanup", async () => {
  const p = await released(),
    baseline = p.h.records()
  await p.fresh.dispose()
  for (const fault of ["accepted", "source", "retirement", "nested", "unknown-resolution", "future"] as const) {
    const seed = copy(baseline),
      raw = seed.interimConversion
    if (!object(raw) || !object(raw.handoff) || !object(raw.archive)) throw Error("No V5 literal")
    if (fault === "accepted") {
      raw.handoff.kind = "accepted"
      delete raw.handoff.retirement
    }
    if (fault === "source") seed.savedAccountKeys = []
    if (fault === "retirement") raw.handoff.retirement = { kind: "fixture-producers-retired", handoffId: "wrong", sourceEpoch: "wrong" }
    if (fault === "nested") raw.archive = { kind: "installed-v3", checkpoint: copy(raw) }
    if (fault === "unknown-resolution") raw.resolutions = [{ kind: "unknown-resolution", item: { sourceKey: "playlists", path: [0] } }]
    if (fault === "future") raw.v = 6
    expect(classifyRetainedAuthority(seed).kind).toBe("held")
    const h = createAuthorityHarness(seed, p.h.supervisor())
    h.stopPriorProducers()
    const owner = createStartingLocalFilterWriter(h.actor("invalid"))
    await expect(owner.ready()).rejects.toBeDefined()
    expect((await owner.read("settings")).kind).toBe("unavailable")
    expect(h.writes).toEqual([])
    await owner.dispose()
  }
  expect(
    readRetainedCheckpoint({
      v: 6,
      get payload() {
        throw Error("Future payload read")
      }
    })
  ).toEqual({ kind: "newer-version", version: 6 })
}, 60000)

test("all independent guards admit only exact released source coverage", async () => {
  const p = await released(),
    records = p.h.records()
  expect(readJoinLocal(records).kind).toBe("local")
  expect(projectClaimNotice({ records })).toEqual({ kind: "empty" })
  expect((await p.fresh.claim()).kind).not.toBe("unavailable")
  expect((await p.fresh.readAgreement(ui)).kind).toBe("review")
  expect(await p.fresh.readCanonicalAuthority(ui)).toEqual({ kind: "canonical", recovery: "retained-inactive" })
  p.h.foreign(raw => {
    raw.playlists = ["changed"]
  })
  expect((await p.fresh.read("settings")).kind).toBe("unavailable")
  await p.fresh.dispose()
}, 60000)

test("eligible completed V4 archive preserves its exact installed V3 basis and unresolved source", async () => {
  const p = await installed(),
    installedRecords = p.h.records()
  await p.owner.dispose()
  if (!object(installedRecords.interimConversion)) throw Error("No installed checkpoint")
  const completed = {
    v: 4,
    kind: "retained-interim",
    basis: { checkpoint: installedRecords.interimConversion, history: { kind: "absent" } },
    resolutions: [],
    pending: { kind: "none" },
    extension: { keep: [null, false] }
  }
  const h = createAuthorityHarness({ ...installedRecords, interimConversion: completed }),
    owner = createStartingLocalFilterWriter(h.actor("retained"))
  await owner.ready().catch(() => {})
  expect((await releaseAuthorityFixture(h, owner)).kind).toBe("restart-required")
  const read = readRetainedCheckpoint(h.records().interimConversion)
  expect<unknown>(read.kind === "authority" && read.checkpoint.archive).toEqual({ kind: "completed-v4", checkpoint: completed })
  await owner.dispose()
  const fresh = createStartingLocalFilterWriter(h.actor("canonical"))
  expect(await fresh.ready()).toBe("ok")
  await fresh.dispose()
}, 60000)

test("archived replacement uses current canonical state and appends one flat suffix without replay", async () => {
  const p = await released(),
    historical = p.h.records().interimConversion
  const playlist = "PL_ONE"
  if (!isPlaylistId(playlist)) throw Error("Bad fixture")
  p.h.allocateReplacement()
  p.h.replacementGeneration("ordinary-001")
  expect((await p.fresh.change(ui, { acct: p.h.account, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" })).kind).toBe("result")
  const opened = await p.fresh.readInterimRecovery()
  if (opened.kind !== "review") throw Error("No archived review " + JSON.stringify(opened))
  expect(opened.activation).toBe("canonical")
  const item = opened.view.items.find(x => x.kind === "filter" && x.id.sourceKey === "account:AAAAAAAAAAAAAAAA")
  if (!item) throw Error("No retained filter")
  const prepared = await p.fresh.prepareInterimFilterReplacement(ui, { capture: opened.capture, item: item.id })
  if (prepared.kind !== "confirmation-required") throw Error("No archived confirmation " + JSON.stringify(prepared))
  p.h.replacementGeneration("restored-001")
  const result = await p.fresh.replaceInterimFilter(ui, prepared.confirmation)
  expect(result).toMatchObject({ kind: "committed", activation: "canonical" })
  const saved = p.h.records(),
    read = readRetainedCheckpoint(saved.interimConversion)
  if (read.kind !== "authority" || !object(historical)) throw Error("V5 downgraded")
  expect<unknown>(read.checkpoint.archive).toEqual(historical.archive)
  expect<unknown>(read.checkpoint.handoff).toEqual(historical.handoff)
  expect(read.checkpoint.resolutions.length).toBe(1)
  expect(read.checkpoint.pending.kind).toBe("none")
  const receipt: unknown = read.checkpoint.resolutions[0]
  if (!object(receipt) || !object(receipt.effect) || !object(receipt.effect.before) || !object(receipt.effect.after)) throw Error("No fixed suffix receipt")
  expect(receipt.effect.before.gen).toBe("ordinary-001")
  expect(receipt.effect.after.gen).toBe("restored-001")
  const after = await p.fresh.readInterimRecovery()
  expect(after.kind === "review" && after.resolved.length).toBe(1)
  expect(after.kind === "review" && after.view.items.some(x => recoveryEqualLocator(x.id, item.id))).toBe(false)
  await p.fresh.dispose()
  saved[name] = copy(fixture.laterCanonicalTombstone.expectedRestart.filter)
  const h = createAuthorityHarness(saved, p.h.supervisor())
  h.stopPriorProducers()
  h.forbidAllocation()
  const fresh = createStartingLocalFilterWriter(h.actor("restart"))
  expect(await fresh.ready()).toBe("ok")
  expect(h.records()).toEqual(saved)
  expect(h.writes).toEqual([])
  expect((await fresh.readInterimRecovery()).kind).toBe("review")
  await fresh.dispose()
}, 60000)
function recoveryEqualLocator(a: { readonly sourceKey: string; readonly path: readonly (string | number)[] }, b: typeof a) {
  return a.sourceKey === b.sourceKey && JSON.stringify(a.path) === JSON.stringify(b.path)
}

async function pendingArchived() {
  const p = await released(),
    playlist = "PL_ONE"
  if (!isPlaylistId(playlist)) throw Error("Bad fixture playlist")
  p.h.allocateReplacement()
  p.h.replacementGeneration("ordinary-before-recovery")
  await p.fresh.change(ui, { acct: p.h.account, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" })
  const opened = await p.fresh.readInterimRecovery()
  if (opened.kind !== "review") throw Error("No archived capture")
  const item = opened.view.items.find(x => x.kind === "filter")
  if (!item) throw Error("No occurrence")
  const prepared = await p.fresh.prepareInterimFilterReplacement(ui, { capture: opened.capture, item: item.id })
  if (prepared.kind !== "confirmation-required") throw Error("No confirmation")
  p.h.replacementGeneration("fixed-archived-replacement")
  let sets = 0
  p.h.write(async (items, apply) => {
    if (++sets === 1) apply(items)
    else throw p.h.error
  })
  expect(await p.fresh.replaceInterimFilter(ui, prepared.confirmation)).toMatchObject({ kind: "failed", stage: "documents" })
  const records = p.h.records(),
    supervisor = p.h.supervisor()
  await p.fresh.dispose()
  return { records, supervisor }
}

test("pending V5 replacements block ordinary writers and resume fixed effects after every torn document/history combination", async () => {
  const saved = await pendingArchived(),
    raw = saved.records.interimConversion
  if (!object(raw) || !object(raw.pending) || !object(raw.pending.effect) || !object(raw.pending.effect.history)) throw Error("No V5 fixed pending effect")
  const effect = raw.pending.effect,
    history = raw.pending.effect.history
  for (const filterState of ["before", "after"] as const)
    for (const historyState of ["before", "after"] as const) {
      const seed = copy(saved.records),
        storedHistory = history[historyState]
      seed[name] = copy(effect[filterState]!)
      if (!object(storedHistory)) throw Error("No fixed history")
      if (storedHistory.kind === "present") seed.sync = copy(storedHistory.raw!)
      else delete seed.sync
      const h = createAuthorityHarness(seed, saved.supervisor)
      h.stopPriorProducers()
      h.forbidAllocation()
      const owner = createStartingLocalFilterWriter(h.actor("resume"))
      expect(await owner.ready()).toBe("ok")
      expect(h.writes).toEqual([])
      expect((await owner.read("settings")).kind).toBe("unavailable")
      expect((await owner.readInterimRecovery()).kind).toBe("pending")
      const result = await owner.resumeInterimFilterReplacement(ui)
      expect(result).toMatchObject({ kind: "committed", activation: "canonical" })
      const completed = h.records().interimConversion
      if (!object(completed)) throw Error("No final V5")
      expect(completed.v).toBe(5)
      expect(completed.archive).toEqual(raw.archive)
      expect(completed.handoff).toEqual(raw.handoff)
      expect(h.records()[name]).toEqual(effect.after)
      await owner.dispose()
    }
}, 60000)

test("V5 archives preserve compatible root extensions and reject owned-stage extensions and unknown receipts", async () => {
  const p = await released(),
    raw = p.h.records().interimConversion
  if (!object(raw) || !object(raw.handoff) || !object(raw.archive)) throw Error("No V5")
  const extended = { ...raw, extension: { retained: [null, false] } }
  const read = readCanonicalAuthorityRecord(extended)
  expect(read.kind).toBe("authority")
  expect<unknown>(read.kind === "authority" && read.checkpoint).toEqual(extended)
  for (const variant of [
    { ...raw, handoff: { ...raw.handoff, undocumented: true } },
    { ...raw, pending: { kind: "none", effect: null } },
    { ...raw, archive: { ...raw.archive, authority: true } },
    { ...raw, resolutions: [{ kind: "restored", item: { sourceKey: "playlists", path: [0] } }] }
  ])
    expect(readCanonicalAuthorityRecord(variant)).toEqual({ kind: "invalid" })
  await p.fresh.dispose()
}, 60000)

test("post-release actual join acceptance survives restart and resumes under a fresh exclusive owner", async () => {
  const p = await released(),
    baseline = p.h.records(),
    settings = baseline["doc:settings"]
  if (!object(settings) || !object(settings.data)) throw Error("Missing settings")
  p.h.remote({ "s:meta": { v: 1, id: "joined-after-archive", created: 0 }, "s:settings": { ...settings, gen: "remote-settings", data: { ...settings.data, theme: "dark" } } })
  const preparation = await p.fresh.beginSyncJoin(ui).result
  if (preparation.kind !== "choice-required") throw Error("No explicit choice " + JSON.stringify(preparation))
  p.h.replacementGeneration("joined-001")
  let sets = 0
  p.h.write(async (items, apply) => {
    if (++sets === 1) apply(items)
    else throw p.h.error
  })
  const accepted = await p.fresh.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-this-browser" })
  expect(accepted).toMatchObject({ kind: "failed", stage: "materialize" })
  const records = p.h.records(),
    supervisor = p.h.supervisor()
  await p.fresh.dispose()
  const h = createAuthorityHarness(records, supervisor)
  h.stopPriorProducers()
  h.forbidAllocation()
  h.remote({ "s:meta": { v: 1, id: "joined-after-archive", created: 0 }, "s:settings": { ...settings, gen: "remote-settings", data: { ...settings.data, theme: "dark" } } })
  const fresh = createStartingLocalFilterWriter(h.actor("join-resume"))
  await expect(fresh.ready()).rejects.toMatchObject({ result: { kind: "pending-join" } })
  expect(h.writes).toEqual([])
  expect(await fresh.readSyncJoin(ui)).toEqual({ kind: "pending", action: "resume-join" })
  expect((await fresh.resumeSyncJoin(ui)).kind).toBe("committed")
  expect(h.records().interimConversion).toEqual(baseline.interimConversion)
  recoveryEqual(
    Object.fromEntries(Object.entries(h.records()).filter(([key]) => isInterimSourceKey(key))),
    Object.fromEntries(Object.entries(baseline).filter(([key]) => isInterimSourceKey(key))),
    "Join resumes without archive cleanup"
  )
  await fresh.dispose()
}, 60000)

test("multiple archived occurrences append flat suffixes and reject duplicate or pending resolved locators", async () => {
  const seed: JsonObject = copy(fixture.seed),
    body = seed["account:AAAAAAAAAAAAAAAA"]
  if (!object(body) || !object(body.filters)) throw Error("No retained account")
  body.filters.PL_SECOND = copy(body.filters.PL_ONE!)
  body.playlists = ["PL_ONE", "PL_SECOND"]
  const p = await released(seed),
    original = p.h.records().interimConversion
  p.h.allocateReplacement()
  p.h.allowPlaylist("PL_SECOND")
  for (const [index, playlist] of ["PL_ONE", "PL_SECOND"].entries()) {
    if (!isPlaylistId(playlist)) throw Error("Bad playlist")
    p.h.replacementGeneration(`ordinary-${index}`)
    expect((await p.fresh.change(ui, { acct: p.h.account, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" })).kind).toBe("result")
    const opened = await p.fresh.readInterimRecovery()
    if (opened.kind !== "review") throw Error("No archive review")
    const item = opened.view.items.find(x => x.kind === "filter" && x.facts.playlist === playlist)
    if (!item) throw Error("No offered occurrence")
    const prepared = await p.fresh.prepareInterimFilterReplacement(ui, { capture: opened.capture, item: item.id })
    if (prepared.kind !== "confirmation-required") throw Error("No confirmation")
    p.h.replacementGeneration(`restored-${index}`)
    expect(await p.fresh.replaceInterimFilter(ui, prepared.confirmation)).toMatchObject({ kind: "committed", activation: "canonical" })
  }
  const raw = p.h.records().interimConversion
  if (!object(raw) || !Array.isArray(raw.resolutions) || !object(original)) throw Error("No suffixes")
  expect(raw.resolutions.length).toBe(2)
  expect(raw.archive).toEqual(original.archive)
  expect(raw.handoff).toEqual(original.handoff)
  const first = raw.resolutions[0]
  if (!object(first)) throw Error("No first receipt")
  expect(readCanonicalAuthorityRecord({ ...raw, resolutions: [...raw.resolutions, first] })).toEqual({ kind: "invalid" })
  expect(readCanonicalAuthorityRecord({ ...raw, pending: { kind: "filter-replacement", effect: first.effect } })).toEqual({ kind: "invalid" })
  expect(readCanonicalAuthorityRecord(raw).kind).toBe("authority")
  const opened = await p.fresh.readInterimRecovery()
  expect(opened.kind === "review" && opened.resolved.length).toBe(2)
  expect(opened.kind === "review" && opened.view.items.filter(x => x.kind === "filter")).toEqual([])
  await p.fresh.dispose()
}, 60000)

for (const stage of ["accept", "record"] as const)
  test(`disposal during ${stage} readback keeps the shared barrier closed and drains controller ownership`, async () => {
    const p = await installed(),
      token = await review(p.owner)
    let disposal: Promise<void> | undefined
    p.h.write(async (items, apply) => {
      apply(items)
      const raw = items.interimConversion
      const attempted = object(raw) && object(raw.handoff) && raw.handoff.kind === "accepted" ? "accept" : "record"
      if (attempted === stage) disposal = p.owner.dispose()
    })
    const result = await p.owner.releaseRetainedAuthority(ui, token)
    expect(result).toMatchObject({ kind: "unconfirmed", stage, cause: { kind: "stopped" } })
    const writes = p.h.writes.length
    await expect(p.owner.claim()).rejects.toThrow("Writer disposed")
    expect((await p.owner.readSyncJoin(ui)).kind).toBe("unavailable")
    await expect(p.owner.flushSync()).rejects.toThrow("Writer disposed")
    expect(p.h.writes.length).toBe(writes)
    await disposal
    expect(p.h.resources().reservation).toBe("none")
  }, 60000)

test("release detaches caller origin before queued reads and refuses changed host facts", async () => {
  const p = await installed(),
    caller: { kind: "ui"; windowId: number; incognito: false } = { ...ui },
    token = await review(p.owner),
    block = gate(),
    entered = gate()
  let once = true
  p.h.get(async () => {
    if (once) {
      once = false
      entered.release()
      await block.promise
    }
  })
  const action = p.owner.releaseRetainedAuthority(caller, token)
  await entered.promise
  caller.windowId = 2
  block.release()
  expect((await action).kind).toBe("restart-required")
  await p.owner.dispose()
  const next = await installed(),
    before = next.h.records()
  await next.owner.dispose()
  const deps = next.h.actor("changed-facts"),
    original = deps.startup.readInterimSnapshot
  let factsChanged = false
  deps.startup.readInterimSnapshot = async () => {
    const read = await original()
    return factsChanged ? { ...read, historicalAuthorization: { kind: "known", value: true } } : read
  }
  const owner = createStartingLocalFilterWriter(deps)
  await owner.ready().catch(() => {})
  const shown = await review(owner)
  factsChanged = true
  expect((await owner.releaseRetainedAuthority(ui, shown)).kind).toBe("unavailable")
  expect(next.h.records()).toEqual(before)
  await owner.dispose()
}, 60000)
