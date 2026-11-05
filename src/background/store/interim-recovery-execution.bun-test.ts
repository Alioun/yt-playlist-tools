import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter, createLocalFilterWriter } from "./local-filter-writer"
import { readRetainedCheckpoint, executeInterimRetention, projectInterimNote } from "./interim-persistence"
import { readRetainedRecovery, retainedRecoveryDifference } from "./interim-recovery-execution"
import {
  createRecoveryHarness,
  recoveryHeld,
  recoveryAgree,
  recoveryPrepare,
  recoveryUi,
  recoveryAcceptanceFixture as fixture,
  recoverySyncFixture as syncFixture,
  observeInterimRecoveryExecution,
  observeInterimRecoveryDiscard,
  recoveryDiscardSelection
} from "../../../tools/fixtures/interim-recovery-review/run"
import { interimSnapshot } from "../../../tools/fixtures/interim-conversion/run"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { encodeSyncDocument } from "./sync-codec"
import { isAccountKey, type AccountKey } from "../../shared/model/validation"
import {
  createGlobalPlaylistRestoreHarness,
  globalPlaylistRestoreSelection,
  observeGlobalPlaylistRestore,
  installAuthorityFixture,
  releaseAuthorityFixture
} from "../../../tools/fixtures/interim-recovery-review/run"

async function playlistCanonical() {
  const h = createGlobalPlaylistRestoreHarness(),
    installed = await installAuthorityFixture(h)
  expect((await releaseAuthorityFixture(h, installed.owner)).kind).toBe("restart-required")
  await installed.owner.dispose()
  const owner = createStartingLocalFilterWriter(h.actor("playlist-test"))
  expect(await owner.ready()).toBe("ok")
  h.allocateReplacement()
  h.replacementGeneration("restore-test-1")
  return { h, owner }
}

test("global playlist CLI restores B then A and independent equal siblings A then B with complete restart evidence", async () => {
  const result = await observeGlobalPlaylistRestore()
  expect(result.cases.map(row => row.order)).toEqual(["B-then-A", "A-then-B"])
  for (const row of result.cases) {
    expect(row.steps.map(step => step.result.kind)).toEqual(["committed", "committed"])
    expect(row.writes.map(write => Object.keys(write))).toEqual([
      ["interimConversion"],
      ["doc:setup:" + row.steps[0]!.acct, "sync"],
      ["interimConversion"],
      ["interimConversion"],
      ["doc:setup:" + row.steps[1]!.acct, "sync"],
      ["interimConversion"]
    ])
    expect(row.resources).toEqual({ pending: 0, listeners: 0, timers: 0, reservation: "none" })
  }
}, 60000)

test("playlist choice is private, explicit, consumed synchronously and bound to the detached origin", async () => {
  const p = await playlistCanonical(),
    other = await playlistCanonical(),
    selected = await globalPlaylistRestoreSelection(p.owner, 0)
  const before = p.h.records(),
    start = p.h.writes.length
  expect(await p.owner.restoreInterimPlaylist(recoveryUi, { choice: { ...selected.prepared.choice }, acct: p.h.accountB })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await other.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: other.h.accountB })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await Reflect.apply(p.owner.restoreInterimPlaylist, p.owner, [recoveryUi, { choice: selected.prepared.choice }])).toEqual({ kind: "refused", reason: "invalid" })
  expect(await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).toEqual({ kind: "unavailable", reason: "stale" })
  for (const mode of ["cancel", "private", "invalid-origin", "different-origin", "invalid-destination"] as const) {
    const absent = "CCCCCCCCCCCCCCCC"
    if (!isAccountKey(absent)) throw Error("Invalid absent account")
    const next = await globalPlaylistRestoreSelection(p.owner, 0)
    if (mode === "cancel") p.owner.cancelInterimPlaylistRestore(recoveryUi, next.prepared.choice)
    const result = await p.owner.restoreInterimPlaylist(
      mode === "private" ? { ...recoveryUi, incognito: true } : mode === "invalid-origin" ? { ...recoveryUi, windowId: -1 } : mode === "different-origin" ? { ...recoveryUi, windowId: 2 } : recoveryUi,
      { choice: next.prepared.choice, acct: mode === "invalid-destination" ? absent : p.h.accountB }
    )
    expect(result.kind === "unavailable" || result.kind === "refused").toBe(true)
    expect(await p.owner.restoreInterimPlaylist(recoveryUi, { choice: next.prepared.choice, acct: p.h.accountB })).toEqual({ kind: "unavailable", reason: "stale" })
  }
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(start)
  const ready = await globalPlaylistRestoreSelection(p.owner, 0),
    origin = { ...recoveryUi, incognito: false },
    input: { choice: typeof ready.prepared.choice; acct: AccountKey } = { choice: ready.prepared.choice, acct: p.h.accountB }
  const action = p.owner.restoreInterimPlaylist(origin, input)
  const duplicate = p.owner.restoreInterimPlaylist(recoveryUi, input)
  origin.incognito = true
  input.acct = p.h.account
  expect((await action).kind).toBe("committed")
  expect(await duplicate).toEqual({ kind: "unavailable", reason: "stale" })
  expect(p.h.records()[`doc:setup:${p.h.account}`]).toEqual(before[`doc:setup:${p.h.account}`])
  await p.owner.dispose()
  await other.owner.dispose()
}, 60000)

test("playlist preparation refuses unsupported rows, numeric-string paths and drift without changing retained data", async () => {
  const p = await playlistCanonical(),
    selected = await globalPlaylistRestoreSelection(p.owner, 0),
    before = p.h.records(),
    start = p.h.writes.length
  for (const locator of [
    { sourceKey: "playlists", path: ["0"] },
    { sourceKey: "playlists", path: [] },
    { sourceKey: "playlists", path: [0, 0] },
    { sourceKey: "playlists", path: [99] },
    { sourceKey: "account:AAAAAAAAAAAAAAAA", path: ["playlists", 0] },
    { sourceKey: "account:AAAAAAAAAAAAAAAA", path: ["filters", "PL_ONE"] },
    { sourceKey: "addToPlaylistID", path: [] },
    { sourceKey: "channelFilters", path: ["PL_GLOBAL"] }
  ]) {
    expect(await p.owner.prepareInterimPlaylistRestore(recoveryUi, { capture: selected.opened.capture, item: { ...selected.item.id, ...locator } })).toEqual({
      kind: "unavailable",
      reason: "unsupported-item"
    })
  }
  p.h.foreign(records => {
    records.playlists = ["PL_CHANGED", "PL_GLOBAL"]
  })
  expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("unavailable")
  expect(p.h.writes.length).toBe(start)
  expect(p.h.records()).toEqual({ ...before, playlists: ["PL_CHANGED", "PL_GLOBAL"] })
  await p.owner.dispose()
}, 60000)

test("playlist restore preserves Settings, shortcut context, targets, marks, extensions and every sibling", async () => {
  const p = await playlistCanonical(),
    name = `doc:setup:${p.h.accountB}`
  p.h.foreign(records => {
    const setup = records[name],
      settings = records["doc:settings"]
    if (!object(setup) || !object(setup.data) || !object(settings) || !object(settings.data) || !object(settings.data.autoAdd) || !object(settings.data.shortcuts))
      throw Error("No literal destination context")
    setup.extension = { keep: [null, false] }
    setup.data.extension = { untouched: true }
    setup.data.label = { name: "Synthetic B", extension: "kept" }
    setup.data.quickSave = "PL_QUICK"
    setup.data.musicSave = "PL_MUSIC"
    setup.data.gather = "PL_GATHER"
    setup.data.targets = { save01: "PL_TARGET" }
    setup.data.marks = { PL_TWO: "full", PL_TARGET: "missing", WL: "full" }
    settings.data.autoAdd.on = false
    settings.data.shortcuts.list = [
      { id: "save01", key: null, label: "Save", watchLaterOnEveryAccount: false },
      { id: "save02", key: null, label: "Watch later", watchLaterOnEveryAccount: true }
    ]
  })
  const before = p.h.records(),
    effects = p.h.effects.length,
    start = p.h.writes.length,
    events: unknown[] = [],
    stop = p.owner.subscribe(event => events.push(event))
  const selected = await globalPlaylistRestoreSelection(p.owner, 0)
  expect(p.h.effects.slice(effects).filter(effect => ["stamp", "generation"].includes(String(effect)))).toEqual([])
  expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("committed")
  const after = p.h.records(),
    setup = before[name],
    written = after[name]
  if (!object(setup) || !object(setup.data) || !Array.isArray(setup.data.autoAdd) || !object(written) || !object(written.data)) throw Error("No Setup")
  expect<unknown>(written.data).toEqual({ ...setup.data, autoAdd: [...setup.data.autoAdd, { pl: "PL_GLOBAL", takes: "videos" }] })
  expect<unknown>({ ...after, [name]: before[name], sync: before.sync, interimConversion: before.interimConversion }).toEqual(before)
  expect(events).toEqual([])
  const reopened = await p.owner.readInterimRecovery()
  if (reopened.kind !== "review") throw Error("No completed occurrence review")
  const attempt = await p.owner.prepareInterimPlaylistRestore(recoveryUi, { capture: reopened.capture, item: { captureId: reopened.view.captureId, sourceKey: "playlists", path: [0] } })
  expect(attempt).toEqual({ kind: "unavailable", reason: "already-present" })
  expect(p.h.writes.length - start).toBe(3)
  stop()
  await p.owner.dispose()
}, 60000)

test("verified owners need existing live compatible Setups with no matching playlist and no sanitation", async () => {
  for (const fault of ["missing", "deleted", "newer", "malformed", "same-videos", "same-shorts", "sanitation"] as const) {
    const p = await playlistCanonical(),
      name = `doc:setup:${p.h.accountB}`
    p.h.foreign(records => {
      const raw = records[name]
      if (!object(raw) || !object(raw.data)) throw Error("Missing Setup")
      if (fault === "missing") delete records[name]
      else if (fault === "deleted") records[name] = { v: 1, gen: "deleted", at: 201, by: "other", deleted: true }
      else if (fault === "newer") raw.v = 2
      else if (fault === "malformed") raw.data = { autoAdd: [] }
      else if (fault === "sanitation") raw.data.targets = { orphan: "PL_OTHER" }
      else raw.data.autoAdd = [{ pl: "PL_GLOBAL", takes: fault === "same-videos" ? "videos" : "shorts", pct: 17 }]
    })
    const before = p.h.records(),
      start = p.h.writes.length,
      selected = await globalPlaylistRestoreSelection(p.owner, 0)
    expect(selected.prepared.owners).toEqual([
      { acct: p.h.account, status: "available" },
      {
        acct: p.h.accountB,
        status: fault === "missing" ? "no-setup" : fault === "deleted" ? "deleted" : fault === "newer" ? "newer-version" : fault.startsWith("same") ? "already-present" : "invalid"
      }
    ])
    expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("unavailable")
    expect(p.h.records()).toEqual(before)
    expect(p.h.writes.length).toBe(start)
    await p.owner.dispose()
  }
}, 60000)

test("plural account order is stable while duplicate, private, unsigned and blank authority observations refuse", async () => {
  const p = await playlistCanonical(),
    selected = await globalPlaylistRestoreSelection(p.owner, 0)
  p.h.accounts([p.h.authorityB, p.h.authorityA])
  expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("committed")
  await p.owner.dispose()
  for (const fault of ["duplicate", "private", "unsigned", "lease", "browserSession", "consentGeneration", "identity"] as const) {
    const p = await playlistCanonical(),
      original = p.h.authorityB
    p.h.deps.recovery.accounts.read = async () =>
      JSON.parse(
        JSON.stringify(
          fault === "duplicate"
            ? [original, original]
            : [{ ...original, ...(fault === "private" ? { incognito: true } : fault === "unsigned" ? { signedIn: false } : fault === "identity" ? { acct: "broken" } : { [fault]: " " }) }]
        )
      )
    const before = p.h.records(),
      start = p.h.writes.length,
      selection = await recoveryDiscardSelection(p.owner, "playlists", [0])
    expect((await p.owner.prepareInterimPlaylistRestore(recoveryUi, { capture: selection.opened.capture, item: selection.item.id })).kind).toBe("unavailable")
    expect(p.h.records()).toEqual(before)
    expect(p.h.writes.length).toBe(start)
    await p.owner.dispose()
  }
}, 60000)

test("ownership requires fresh matching evidence without lineage and ignores canonical labels and caches", async () => {
  for (const fault of ["unavailable", "lineage", "wrong-authority", "not-owned"] as const) {
    const p = await playlistCanonical(),
      lookup = p.h.deps.recovery.ownership.lookup
    p.h.deps.recovery.ownership.lookup = async authority => {
      const observed = await lookup(authority)
      if (observed.kind !== "fixture-owned") throw Error("Missing fixture ownership")
      return fault === "unavailable"
        ? { kind: "unavailable" }
        : fault === "lineage"
          ? { ...observed, lineage: "local-migration-only" }
          : fault === "wrong-authority"
            ? { ...observed, authority: { ...authority, lease: "other" } }
            : { ...observed, ownedPlaylistIds: new Set() }
    }
    const before = p.h.records(),
      selected = await globalPlaylistRestoreSelection(p.owner, 0)
    expect(selected.prepared.owners).toEqual([])
    expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("unavailable")
    expect(p.h.records()).toEqual(before)
    await p.owner.dispose()
  }
}, 60000)

test("rotated plural authority, ownership evidence and observed ABA invalidate the complete choice", async () => {
  for (const fault of ["lease", "browserSession", "consentGeneration", "ownership", "account-aba", "ownership-aba", "store-aba"] as const) {
    const p = await playlistCanonical(),
      selected = await globalPlaylistRestoreSelection(p.owner, 0),
      before = p.h.records(),
      start = p.h.writes.length
    if (fault === "store-aba") {
      p.h.foreign(records => {
        records.unrelated = { changed: true }
      })
      await p.owner.readInterimRecovery()
      p.h.foreign(records => {
        records.unrelated = before.unrelated!
      })
      await p.owner.readInterimRecovery()
    } else if (fault === "ownership" || fault === "ownership-aba") {
      p.h.ownership(false)
      if (fault === "ownership-aba") {
        const observed = await recoveryDiscardSelection(p.owner, "playlists", [0])
        await p.owner.prepareInterimPlaylistRestore(recoveryUi, { capture: observed.opened.capture, item: observed.item.id })
        p.h.ownership(true)
      }
    } else {
      p.h.accounts([p.h.authorityA, { ...p.h.authorityB, [fault === "account-aba" ? "lease" : fault]: "rotated" }])
      if (fault === "account-aba") {
        const observed = await recoveryDiscardSelection(p.owner, "playlists", [0])
        await p.owner.prepareInterimPlaylistRestore(recoveryUi, { capture: observed.opened.capture, item: observed.item.id })
        p.h.accounts([p.h.authorityA, p.h.authorityB])
      }
    }
    expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("unavailable")
    expect(p.h.writes.length).toBe(start)
    expect(p.h.records()).toEqual(before)
    await p.owner.dispose()
  }
}, 60000)

test("playlist accept, documents and record require exact complete readback for every actual write", async () => {
  for (const stage of [1, 2, 3])
    for (const fault of [
      "rejected-before",
      "rejected-after",
      "false-success",
      "read-failed",
      "snapshot-failed",
      "snapshot-drift",
      "corrupt",
      "divergent",
      "dispose",
      "ownership",
      "authority"
    ] as const) {
      const p = await playlistCanonical(),
        selected = await globalPlaylistRestoreSelection(p.owner, 0),
        before = p.h.records(),
        start = p.h.writes.length
      const expectedStage = stage === 1 ? "accept" : stage === 2 ? "documents" : "record"
      let count = 0,
        disposed: Promise<void> | undefined
      p.h.write(async (items, apply) => {
        count++
        if (count !== stage) {
          apply(items)
          return
        }
        if (fault !== "rejected-before" && fault !== "false-success") apply(items)
        if (fault === "rejected-before" || fault === "rejected-after") throw p.h.error
        if (fault === "read-failed")
          p.h.get(async () => {
            throw p.h.readError
          })
        if (fault === "snapshot-failed")
          p.h.snapshot(async () => {
            throw p.h.readError
          })
        if (fault === "snapshot-drift") p.h.deps.recovery.snapshot.read = async () => ({ retained: interimSnapshot(p.h.records()), history: { kind: "present", raw: { changed: true } } })
        if (fault === "corrupt")
          p.h.foreign(records => {
            records.interimConversion = { v: 5, kind: "retained-interim" }
          })
        if (fault === "divergent")
          p.h.foreign(records => {
            records.unrelated = "foreign"
          })
        if (fault === "dispose") disposed = p.owner.dispose()
        if (fault === "ownership") p.h.ownership(false)
        if (fault === "authority") p.h.accounts([p.h.authorityA, { ...p.h.authorityB, lease: "rotated" }])
      })
      const result = await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })
      expect(result.kind).toBe(fault === "rejected-before" ? "failed" : fault === "rejected-after" ? "committed" : "unconfirmed")
      if (result.kind === "failed") expect(result).toEqual({ kind: "failed", stage: expectedStage, write: { kind: "rejected", error: p.h.error } })
      if (result.kind === "committed") expect(result.mutations[stage - 1]?.write).toEqual({ kind: "rejected", error: p.h.error })
      if (result.kind === "unconfirmed") {
        expect(result.stage).toBe(expectedStage)
        expect((await p.owner.readInterimRecovery()).kind).toBe("unavailable")
      }
      if (stage === 1 && fault === "rejected-before") expect(p.h.records()).toEqual(before)
      expect(p.h.writes.length - start).toBe(fault === "rejected-after" ? 3 : stage)
      p.h.get(undefined)
      await (disposed ?? p.owner.dispose())
      expect(p.h.resources()).toEqual({ pending: 0, listeners: 0, timers: 0, reservation: "none" })
    }
}, 180000)

test("every staged playlist image restarts read-only and resumes its fixed B effect without allocation", async () => {
  const p = await playlistCanonical(),
    selected = await globalPlaylistRestoreSelection(p.owner, 0),
    states = [p.h.records()]
  p.h.write(async (items, apply) => {
    apply(items)
    states.push(p.h.records())
  })
  expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("committed")
  const final = p.h.records(),
    supervisor = p.h.supervisor()
  await p.owner.dispose()
  const pending = states[1]!.interimConversion
  if (!object(pending) || !object(pending.pending) || !object(pending.pending.effect) || !object(pending.pending.effect.history)) throw Error("No fixed effect")
  const effect = pending.pending.effect,
    historyImages = effect.history
  if (!object(historyImages)) throw Error("No fixed history")
  const images = [...states]
  for (const documentAfter of [false, true])
    for (const historyAfter of [false, true]) {
      const raw = clone(states[1]!),
        history = historyImages[historyAfter ? "after" : "before"]
      if (!object(history)) throw Error("Missing history image")
      raw[`doc:setup:${p.h.accountB}`] = clone(effect[documentAfter ? "after" : "before"]!)
      if (history.kind === "present") raw.sync = clone(history.raw!)
      else delete raw.sync
      images.push(raw)
    }
  for (const [index, image] of images.entries()) {
    const h = createGlobalPlaylistRestoreHarness(JSON.parse(JSON.stringify(image)), supervisor)
    h.stopPriorProducers()
    h.forbidAllocation()
    const owner = createStartingLocalFilterWriter(h.actor("restore-stage-" + index))
    expect(await owner.ready()).toBe("ok")
    const opened = await owner.readInterimRecovery()
    expect(h.records()).toEqual(image)
    expect(h.writes).toEqual([])
    expect(h.effects.filter(effect => ["stamp", "generation", "recovery-ownership", "recovery-accounts"].includes(String(effect)))).toEqual([])
    expect(await owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: h.accountB })).toEqual({ kind: "unavailable", reason: "stale" })
    if (index !== 0 && index !== 3) {
      expect(opened.kind === "pending" && opened.action).toBe("resume-accepted-playlist-restore")
      expect(await owner.resumeInterimFilterReplacement(recoveryUi)).toEqual({ kind: "unavailable", reason: "pending-recovery" })
      expect((await owner.resumeInterimPlaylistRestore(recoveryUi)).kind).toBe("committed")
      expect(h.records()).toEqual(final)
    }
    expect(h.effects.filter(effect => ["stamp", "generation"].includes(String(effect)))).toEqual([])
    await owner.dispose()
  }
}, 120000)

test("V3 playlist restoration archives into nonempty V4 and allows a V5 suffix without historical replay", async () => {
  const h = createGlobalPlaylistRestoreHarness(),
    installed = await installAuthorityFixture(h)
  h.allocateReplacement()
  h.replacementGeneration("v4-playlist")
  const first = await globalPlaylistRestoreSelection(installed.owner, 0)
  expect((await installed.owner.restoreInterimPlaylist(recoveryUi, { choice: first.prepared.choice, acct: h.account })).kind).toBe("committed")
  const v4 = h.records().interimConversion
  expect(readRetainedCheckpoint(v4).kind).toBe("recovery")
  expect((await releaseAuthorityFixture(h, installed.owner)).kind).toBe("restart-required")
  await installed.owner.dispose()
  const owner = createStartingLocalFilterWriter(h.actor("mixed-playlist"))
  expect(await owner.ready()).toBe("ok")
  h.replacementGeneration("suffix-playlist")
  const second = await globalPlaylistRestoreSelection(owner, 1)
  expect(second.prepared.owners.find(row => row.acct === h.accountB)?.status).toBe("available")
  expect((await owner.restoreInterimPlaylist(recoveryUi, { choice: second.prepared.choice, acct: h.accountB })).kind).toBe("committed")
  const raw = h.records().interimConversion
  if (!object(raw) || !object(raw.archive) || !Array.isArray(raw.resolutions)) throw Error("No mixed archive")
  expect(raw.archive.checkpoint).toEqual(v4)
  expect(raw.resolutions).toHaveLength(1)
  expect(readRetainedCheckpoint({ ...raw, resolutions: [...raw.resolutions, { kind: "discarded", item: { path: [0], sourceKey: "playlists" } }] })).toEqual({ kind: "invalid" })
  for (const acct of [h.account, h.accountB])
    h.foreign(records => {
      records[`doc:setup:${acct}`] = { v: 1, gen: "current-" + acct, at: 500, by: "current-device", deleted: true }
    })
  const image = JSON.stringify(h.records()),
    supervisor = h.supervisor()
  await owner.dispose()
  const restart = createGlobalPlaylistRestoreHarness(JSON.parse(image), supervisor)
  restart.stopPriorProducers()
  restart.forbidAllocation()
  const current = createStartingLocalFilterWriter(restart.actor("later-tombstones"))
  expect(await current.ready()).toBe("ok")
  expect((await current.readInterimRecovery()).kind).toBe("review")
  expect(restart.records()).toEqual(JSON.parse(image))
  expect(restart.writes).toEqual([])
  await current.dispose()
}, 120000)

function playlistSync(p: Awaited<ReturnType<typeof playlistCanonical>>) {
  const remote: JsonObject = { "s:meta": { v: 1, id: "playlist-history", created: 1 } }
  p.h.foreign(records => {
    if (!object(records.device)) throw Error("No device")
    records.device.syncOn = true
    records.sync = { joined: "playlist-history", pushed: {}, status: "ok", editedSinceOff: false, everEdited: false, extension: { keep: [null, false] } }
  })
  p.h.remote(remote)
  return remote
}

test("playlist admission counts quota and newer addressed documents without a write or cleanup credit", async () => {
  for (const fault of ["quota", "newer", "reset", "debt"] as const) {
    const p = await playlistCanonical(),
      remote = playlistSync(p)
    if (fault === "quota") for (let index = 0; index < 510; index++) remote["occupied:" + index] = false
    if (fault === "newer") remote[`s:setup:${p.h.accountB}`] = { v: 2, gen: "newer", at: 500, by: "foreign", data: {} }
    if (fault === "reset") remote["s:meta"] = { v: 1, id: "playlist-history", created: 1, reset: true }
    if (fault === "debt")
      p.h.foreign(records => {
        if (object(records.sync)) records.sync.opaqueWrite = { gate: { kind: "held", notBefore: 1060000 }, diagnostic: null }
      })
    p.h.remote(remote)
    const selected = await globalPlaylistRestoreSelection(p.owner, 0),
      before = p.h.records(),
      start = p.h.writes.length
    const result = await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })
    expect(fault === "debt" ? result.kind === "committed" : result.kind === "refused" || result.kind === "unavailable").toBe(true)
    if (fault === "quota") expect(result).toEqual({ kind: "refused", reason: "sync-full" })
    if (fault === "newer") expect(result).toEqual({ kind: "refused", reason: "update-needed" })
    if (fault === "debt") {
      const after = p.h.records()
      expect(object(after.sync) && after.sync.opaqueWrite).toEqual(object(before.sync) && before.sync.opaqueWrite)
      expect(object(after.sync) && after.sync.extension).toEqual(object(before.sync) && before.sync.extension)
      expect(p.h.writes.length - start).toBe(3)
    } else {
      expect(p.h.records()).toEqual(before)
      expect(p.h.writes.length).toBe(start)
    }
    expect(p.h.effects.filter(effect => ["sync-set", "sync-subscribe", "timer"].includes(String(effect)))).toEqual([])
    await p.owner.dispose()
  }
}, 60000)

test("playlist fixed synced admission refuses new repair history after restart and preserves accepted repairs", async () => {
  const p = await playlistCanonical(),
    remote = playlistSync(p)
  const setup = p.h.records()[`doc:setup:${p.h.account}`]
  if (!object(setup)) throw Error("Missing repair Setup")
  remote[`s:setup:${p.h.account}`] = clone(setup)
  p.h.remote(remote)
  const selected = await globalPlaylistRestoreSelection(p.owner, 0)
  let count = 0
  p.h.write(async (items, apply) => {
    if (++count === 1) apply(items)
    else throw p.h.error
  })
  expect(await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).toEqual({
    kind: "failed",
    stage: "documents",
    write: { kind: "rejected", error: p.h.error }
  })
  const image = JSON.stringify(p.h.records()),
    supervisor = p.h.supervisor(),
    raw = readRetainedCheckpoint(p.h.records().interimConversion)
  if (raw.kind !== "authority" || raw.checkpoint.pending.kind !== "playlist-restore" || raw.checkpoint.pending.effect.admission.kind !== "synced") throw Error("No fixed synced restore")
  expect(raw.checkpoint.pending.effect.admission.requiredRepairs.map(row => row.name)).toEqual([`doc:setup:${p.h.account}`])
  await p.owner.dispose()
  for (const changed of [false, true]) {
    const h = createGlobalPlaylistRestoreHarness(JSON.parse(image), supervisor),
      observed = clone(remote)
    if (changed) observed["s:settings"] = clone(h.records()["doc:settings"]!)
    h.remote(observed)
    h.stopPriorProducers()
    h.forbidAllocation()
    const owner = createStartingLocalFilterWriter(h.actor("synced-restore-" + changed))
    expect(await owner.ready()).toBe("ok")
    const result = await owner.resumeInterimPlaylistRestore(recoveryUi)
    expect(result.kind).toBe(changed ? "unavailable" : "committed")
    if (changed) {
      expect(result).toEqual({ kind: "unavailable", reason: "admission-debt" })
      expect(h.records()).toEqual(JSON.parse(image))
      expect(h.writes).toEqual([])
    }
    expect(h.effects.filter(effect => ["stamp", "generation", "sync-set", "sync-subscribe", "timer"].includes(String(effect)))).toEqual([])
    await owner.dispose()
  }
}, 60000)

test("playlist restoration preserves destination-free discard and account filter replacement in either order", async () => {
  for (const restoreFirst of [false, true]) {
    const p = await playlistCanonical()
    p.h.foreign(records => {
      const filter = records["doc:filter:AAAAAAAAAAAAAAAA:PL_ONE"]
      if (!object(filter) || !object(filter.data)) throw Error("No filter")
      filter.data.mode = "allow"
      filter.data.on = true
    })
    const restore = async () => {
      p.h.replacementGeneration("mixed-restore")
      const selected = await globalPlaylistRestoreSelection(p.owner, 0)
      expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).kind).toBe("committed")
    }
    const replace = async () => {
      p.h.replacementGeneration("mixed-filter")
      const selection = await recoveryDiscardSelection(p.owner, "account:AAAAAAAAAAAAAAAA", ["filters", "PL_ONE"])
      const prepared = await p.owner.prepareInterimFilterReplacement(recoveryUi, { capture: selection.opened.capture, item: selection.item.id })
      if (prepared.kind !== "confirmation-required") throw Error("No account replacement " + JSON.stringify(prepared))
      expect((await p.owner.replaceInterimFilter(recoveryUi, prepared.confirmation)).kind).toBe("committed")
      const discard = await recoveryDiscardSelection(p.owner, "playlists", [1])
      expect((await p.owner.discardInterimItem(recoveryUi, { capture: discard.opened.capture, item: discard.item.id })).kind).toBe("committed")
    }
    if (restoreFirst) {
      await restore()
      await replace()
    } else {
      await replace()
      await restore()
    }
    const raw = readRetainedCheckpoint(p.h.records().interimConversion)
    if (raw.kind !== "authority") throw Error("No flat mixed receipts")
    expect(raw.checkpoint.resolutions.map(row => row.kind)).toEqual(restoreFirst ? ["playlist-restored", "filter-replaced", "discarded"] : ["filter-replaced", "discarded", "playlist-restored"])
    await p.owner.dispose()
  }
}, 60000)

test("V2 playlist restores remain held and pending join, removal or agreement blocks destination preparation", async () => {
  const p = await confirmed()
  p.h.allowPlaylist("PL_GLOBAL")
  p.h.replacementGeneration("v2-global")
  const selected = await globalPlaylistRestoreSelection(p.owner, 0)
  expect((await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.account })).kind).toBe("committed")
  expect((await p.owner.readCanonicalAuthority(recoveryUi)).kind).toBe("unavailable")
  expect((await p.owner.readInterimRecovery()).kind).toBe("review")
  await p.owner.dispose()
  for (const fault of ["join", "removal"] as const) {
    const p = await playlistCanonical(),
      selected = await globalPlaylistRestoreSelection(p.owner, 0),
      start = p.h.writes.length
    p.h.foreign(records => {
      records[fault === "join" ? "pending:sync-join" : "pending:account-removal"] = { unresolved: true }
    })
    expect(await p.owner.restoreInterimPlaylist(recoveryUi, { choice: selected.prepared.choice, acct: p.h.accountB })).toEqual({
      kind: "unavailable",
      reason: fault === "join" ? "pending-join" : "pending-removal"
    })
    expect(p.h.writes.length).toBe(start)
    await p.owner.dispose()
  }
}, 60000)

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const filterName = "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT"
function object(raw: unknown): raw is JsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
}
async function confirmed(seed: JsonObject = fixture.seed, remote?: JsonObject) {
  const h = createRecoveryHarness(clone(seed), remote),
    owner = createStartingLocalFilterWriter(h.deps)
  await recoveryAgree(owner, h)
  return { h, owner }
}

async function discardPrepared() {
  const p = await confirmed(),
    selection = await recoveryDiscardSelection(p.owner, "playlists", [0])
  return { ...p, ...selection }
}

test("actual discard command retains equal siblings, releases a nonempty V4 and reopens current V5 tombstones", async () => {
  const result = await observeInterimRecoveryDiscard()
  expect(result.held.firstResult.kind).toBe("committed")
  expect(result.canonical.suffixResult.kind).toBe("committed")
  expect(result.canonical.resources).toEqual({ pending: 0, listeners: 0, timers: 0, reservation: "none" })
}, 60000)

test("discard validates each literal raw occurrence and records no destination or first edit", async () => {
  const seed: JsonObject = clone(fixture.seed),
    body = seed["account:AAAAAAAAAAAAAAAA"]
  if (!object(body)) throw Error("No account fixture")
  body.playlists = ["PL_ONE"]
  body.shortcutPlaylistId = "PL_TARGET"
  if (!object(body.filters)) throw Error("No retained filters")
  body.filters.PL_ONE = { mode: "deny", enabled: false, channels: [] }
  seed.channelFilters = { PL_ONE: { mode: "deny", enabled: false, channels: [] } }
  seed.addToPlaylistID = "PL_GLOBAL_TARGET"
  const p = await confirmed(seed),
    original = p.h.records(),
    locators = [
      { sourceKey: "account:AAAAAAAAAAAAAAAA", path: ["playlists", 0] },
      { sourceKey: "account:AAAAAAAAAAAAAAAA", path: ["filters", "PL_ONE"] },
      { sourceKey: "account:AAAAAAAAAAAAAAAA", path: ["shortcutPlaylistId"] },
      { sourceKey: "channelFilters", path: ["PL_ONE"] },
      { sourceKey: "addToPlaylistID", path: [] },
      { sourceKey: "playlists", path: [0] },
      { sourceKey: "playlists", path: [1] }
    ]
  const writes = p.h.writes.length,
    effects = p.h.effects.length
  p.h.forbidAllocation()
  p.h.ownership(false)
  let previous = original.interimConversion
  for (const locator of locators) {
    const { opened, item } = await recoveryDiscardSelection(p.owner, locator.sourceKey, locator.path)
    expect(opened.view.execution).toBe("unavailable")
    expect(opened.view.items.every(row => row.intent === "none" && row.inactive)).toBe(true)
    const result = await p.owner.discardInterimItem(recoveryUi, { capture: opened.capture, item: item.id })
    expect(result).toEqual({ kind: "committed", item: item.id, activation: "held", mutations: [{ stage: "record", write: { kind: "resolved" } }] })
    const records = p.h.records(),
      raw = records.interimConversion
    if (!object(raw) || !Array.isArray(raw.resolutions)) throw Error("No completed discard")
    expect(raw.resolutions.at(-1)).toEqual({ kind: "discarded", item: locator })
    if (object(previous) && previous.v === 4) expect(JSON.stringify(raw.resolutions.slice(0, -1))).toBe(JSON.stringify(previous.resolutions))
    expect<unknown>({ ...records, interimConversion: original.interimConversion }).toEqual(original)
    previous = raw
  }
  expect(p.h.writes.slice(writes).map(write => Object.keys(write))).toEqual(locators.map(() => ["interimConversion"]))
  expect(p.h.effects.slice(effects).filter(x => ["recovery-ownership", "stamp", "generation", "sync-get", "sync-set", "timer"].includes(String(x)))).toEqual([])
  const final = await p.owner.readInterimRecovery()
  expect(final.kind === "review" && final.discarded.length).toBe(locators.length)
  await p.owner.dispose()
}, 60000)

test("discard confirms actual readback for applied rejection and consumes unchanged failed captures", async () => {
  for (const applied of [false, true]) {
    const p = await discardPrepared(),
      before = p.h.records(),
      writes = p.h.writes.length
    p.h.write(async (items, apply) => {
      if (applied) apply(items)
      throw p.h.error
    })
    const result = await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: p.item.id })
    if (applied) {
      expect(result.kind).toBe("committed")
      if (result.kind !== "committed") throw Error("No confirmed applied rejection")
      expect(result.mutations).toEqual([{ stage: "record", write: { kind: "rejected", error: p.h.error } }])
      expect(result.mutations[0]?.write.kind === "rejected" && result.mutations[0].write.error).toBe(p.h.error)
    } else {
      expect(result).toEqual({ kind: "failed", stage: "record", write: { kind: "rejected", error: p.h.error } })
      expect(p.h.records()).toEqual(before)
    }
    expect(await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: p.item.id })).toEqual({ kind: "unavailable", reason: "stale" })
    expect(p.h.writes.length).toBe(writes + 1)
    const serialized = JSON.stringify(p.h.records())
    await p.owner.dispose()
    const restarted = createRecoveryHarness(JSON.parse(serialized))
    restarted.forbidAllocation()
    const owner = createStartingLocalFilterWriter(restarted.deps)
    await recoveryHeld(owner)
    const read = await owner.readInterimRecovery()
    expect(read.kind === "review" && read.discarded.length).toBe(applied ? 1 : 0)
    expect(read.kind === "review" && read.view.items.some(row => row.id.sourceKey === "playlists" && row.id.path[0] === 0)).toBe(!applied)
    expect(restarted.writes).toEqual([])
    await owner.dispose()
  }
}, 60000)

test("missing, divergent, corrupt and failed discard readback close the barrier without before-set failure", async () => {
  for (const fault of ["missing", "divergent", "corrupt", "read-failed", "snapshot-failed", "snapshot-drift", "authority", "dispose"] as const) {
    const p = await discardPrepared()
    let disposed: Promise<void> | undefined
    p.h.write(async (items, apply) => {
      if (fault !== "missing") apply(items)
      if (fault === "divergent")
        p.h.foreign(records => {
          records.unrelated = { foreign: true }
        })
      if (fault === "corrupt")
        p.h.foreign(records => {
          records.interimConversion = { v: 4, kind: "retained-interim" }
        })
      if (fault === "read-failed")
        p.h.get(async () => {
          throw p.h.readError
        })
      if (fault === "snapshot-failed")
        p.h.snapshot(async () => {
          throw p.h.readError
        })
      if (fault === "snapshot-drift") p.h.deps.recovery.snapshot.read = async () => ({ retained: interimSnapshot(p.h.records()), history: { kind: "absent" } })
      if (fault === "authority") p.h.authority({ kind: "unavailable" })
      if (fault === "dispose") disposed = p.owner.dispose()
    })
    const result = await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: p.item.id })
    expect(result.kind).toBe("unconfirmed")
    if (result.kind !== "unconfirmed") throw Error("Discard uncertainty was lost " + fault)
    expect(result.stage).toBe("record")
    if (fault === "read-failed" || fault === "snapshot-failed") {
      expect(result.cause.kind).toBe("read-failed")
      if (result.cause.kind === "read-failed") expect(result.cause.error).toBe(p.h.readError)
    }
    expect((await p.owner.readInterimRecovery()).kind).toBe("unavailable")
    await (disposed ?? p.owner.dispose())
  }
}, 60000)

test("discard rejects copied, invented, foreign and private captures and preserves cancelled drafts", async () => {
  const p = await discardPrepared(),
    other = await confirmed(),
    before = p.h.records(),
    writes = p.h.writes.length
  expect(await p.owner.discardInterimItem(recoveryUi, { capture: { ...p.opened.capture }, item: p.item.id })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await other.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: p.item.id })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await p.owner.discardInterimItem({ ...recoveryUi, incognito: true }, { capture: p.opened.capture, item: p.item.id })).toEqual({ kind: "refused", reason: "private" })
  expect(await p.owner.discardInterimItem({ ...recoveryUi, windowId: -1 }, { capture: p.opened.capture, item: p.item.id })).toEqual({ kind: "refused", reason: "invalid" })
  expect(await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: { ...p.item.id, captureId: "invented" } })).toEqual({ kind: "unavailable", reason: "stale" })
  const selected = await recoveryPrepare(p.owner)
  if (selected.prepared.kind !== "confirmation-required") throw Error("No cancellable draft")
  p.owner.cancelInterimFilterReplacement(recoveryUi, selected.prepared.confirmation)
  expect(await p.owner.replaceInterimFilter(recoveryUi, selected.prepared.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(writes)
  await other.owner.dispose()
  await p.owner.dispose()
  const restart = createRecoveryHarness(before),
    owner = createStartingLocalFilterWriter(restart.deps)
  await recoveryHeld(owner)
  expect(await owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: p.item.id })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(restart.writes).toEqual([])
  await owner.dispose()
}, 60000)

test("discard requires numeric array paths and rejects containers and supporting evidence", async () => {
  const p = await discardPrepared(),
    before = p.h.records(),
    writes = p.h.writes.length
  for (const locator of [
    { sourceKey: "playlists", path: ["0"] },
    { sourceKey: "playlists", path: [] },
    { sourceKey: "playlists", path: [99] },
    { sourceKey: "savedAccountKeys", path: [0] },
    { sourceKey: "account:AAAAAAAAAAAAAAAA", path: ["labels"] }
  ]) {
    expect(await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: { ...p.item.id, ...locator } })).toEqual({ kind: "unavailable", reason: "unsupported-item" })
  }
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(writes)
  await p.owner.dispose()
})

test("discard detaches invocation arguments before its queued observations", async () => {
  const p = await discardPrepared(),
    item = { ...p.item.id, path: [...p.item.id.path] },
    origin: { kind: "ui"; windowId: number; incognito: boolean } = { ...recoveryUi }
  const result = p.owner.discardInterimItem(origin, { capture: p.opened.capture, item })
  origin.incognito = true
  item.path = [1]
  item.sourceKey = "savedAccountKeys"
  expect((await result).kind).toBe("committed")
  const raw = p.h.records().interimConversion
  expect(object(raw) && raw.resolutions).toEqual([{ kind: "discarded", item: { sourceKey: "playlists", path: [0] } }])
  await p.owner.dispose()
})

test("source drift and observed complete-store or owner A-B-A revoke discard captures", async () => {
  for (const fault of ["source", "store-aba", "owner-aba", "owner-lost"] as const) {
    const p = await discardPrepared(),
      before = p.h.records(),
      writes = p.h.writes.length
    if (fault === "source")
      p.h.foreign(records => {
        records.playlists = ["PL_CHANGED", "PL_GLOBAL"]
      })
    if (fault === "store-aba") {
      p.h.foreign(records => {
        records.unrelated = "B"
      })
      await p.owner.readInterimRecovery()
      p.h.foreign(records => {
        records.unrelated = before.unrelated!
      })
      await p.owner.readInterimRecovery()
    }
    if (fault === "owner-aba") {
      const host = p.h.deps.recovery,
        original = await host.authority.read()
      p.h.authority({ kind: "unavailable" })
      const fresh = await recoveryDiscardSelection(p.owner, "playlists", [0])
      await p.owner.discardInterimItem(recoveryUi, { capture: fresh.opened.capture, item: fresh.item.id })
      p.h.authority(original)
    }
    if (fault === "owner-lost") p.h.authority({ kind: "unavailable" })
    expect((await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: p.item.id })).kind).toBe("unavailable")
    expect(p.h.writes.length).toBe(writes)
    await p.owner.dispose()
  }
}, 60000)

test("mixed V4 receipts preserve replacement images and reject duplicate locators independent of field order", async () => {
  const p = await prepared()
  expect((await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).kind).toBe("committed")
  const before = p.h.records(),
    selected = await recoveryDiscardSelection(p.owner, "playlists", [0])
  expect((await p.owner.discardInterimItem(recoveryUi, { capture: selected.opened.capture, item: selected.item.id })).kind).toBe("committed")
  const after = p.h.records(),
    raw = after.interimConversion
  if (!object(raw) || !Array.isArray(raw.resolutions)) throw Error("No mixed V4")
  expect<unknown>({ ...after, interimConversion: before.interimConversion }).toEqual(before)
  expect(raw.resolutions.map(x => object(x) && x.kind)).toEqual(["filter-replaced", "discarded"])
  const receipt = { kind: "discarded", item: { sourceKey: "account:AAAAAAAAAAAAAAAA", path: ["filters", "PL_KEPT"] } }
  const reordered = { kind: "discarded", item: { path: [0], sourceKey: "playlists" } }
  for (const resolutions of [
    [...raw.resolutions, receipt],
    [receipt, ...raw.resolutions],
    [...raw.resolutions, reordered]
  ]) {
    expect(readRetainedRecovery({ ...raw, resolutions })).toEqual({ kind: "invalid" })
  }
  const valid = { ...raw, resolutions: [raw.resolutions[0], reordered] }
  expect(readRetainedRecovery(valid).kind).toBe("recovery")
  expect(readRetainedRecovery({ ...raw, resolutions: [receipt], pending: { kind: "filter-replacement", effect: fixture.expectedFixedEffect } })).toEqual({ kind: "invalid" })
  expect(await p.owner.prepareInterimFilterReplacement(recoveryUi, { capture: selected.opened.capture, item: p.item.id })).toEqual({ kind: "unavailable", reason: "stale" })
  const latest = await p.owner.readInterimRecovery()
  if (latest.kind !== "review") throw Error("No mixed review")
  const replacement = latest.view.items.find(row => row.id.sourceKey === "account:AAAAAAAAAAAAAAAA" && row.kind === "filter")
  if (!replacement) throw Error("V4 replacement presentation changed")
  expect(await p.owner.discardInterimItem(recoveryUi, { capture: latest.capture, item: replacement.id })).toEqual({ kind: "unavailable", reason: "already-present" })
  await p.owner.dispose()
}, 60000)

test("discard and subsequent replacement preserve prior receipt bytes with noncanonical property order and root extensions", async () => {
  const p = await discardPrepared()
  expect((await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: p.item.id })).kind).toBe("committed")
  const saved = p.h.records()
  await p.owner.dispose()
  const checkpoint = saved.interimConversion
  if (!object(checkpoint)) throw Error("No completed V4")
  checkpoint.resolutions = [{ item: { path: [0], sourceKey: "playlists" }, kind: "discarded" }]
  checkpoint.extension = { keep: [null, false] }
  const prior = JSON.stringify(checkpoint.resolutions),
    next = createRecoveryHarness(saved),
    owner = createStartingLocalFilterWriter(next.deps)
  await recoveryHeld(owner)
  const selection = await recoveryDiscardSelection(owner, "playlists", [1])
  expect((await owner.discardInterimItem(recoveryUi, { capture: selection.opened.capture, item: selection.item.id })).kind).toBe("committed")
  const after = next.records().interimConversion
  if (!object(after) || !Array.isArray(after.resolutions)) throw Error("No appended V4")
  expect(JSON.stringify(after.resolutions.slice(0, 1))).toBe(prior)
  expect(after.extension).toEqual(checkpoint.extension)
  expect(after.basis).toEqual(checkpoint.basis)
  const priorReceipts = JSON.stringify(after.resolutions),
    start = next.writes.length
  next.allocateReplacement()
  const replacement = await recoveryPrepare(owner)
  if (replacement.prepared.kind !== "confirmation-required") throw Error("No subsequent filter replacement")
  expect((await owner.replaceInterimFilter(recoveryUi, replacement.prepared.confirmation)).kind).toBe("committed")
  for (const write of next.writes.slice(start)) {
    const raw = write.interimConversion
    if (!object(raw) || !Array.isArray(raw.resolutions)) continue
    expect(JSON.stringify(raw.resolutions.slice(0, 2))).toBe(priorReceipts)
  }
  await owner.dispose()
}, 60000)

test("pending replacement, join and removal hold discard without another write", async () => {
  const p = await prepared(),
    row = p.opened.view.items.find(item => item.id.sourceKey === "playlists")
  if (!row) throw Error("No independently unresolved occurrence")
  let calls = 0
  p.h.write(async (items, apply) => {
    if (++calls === 1) apply(items)
    else throw p.h.error
  })
  expect((await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).kind).toBe("failed")
  const before = p.h.records(),
    writes = p.h.writes.length
  expect((await p.owner.discardInterimItem(recoveryUi, { capture: p.opened.capture, item: row.id })).kind).toBe("unavailable")
  expect(await p.owner.readInterimRecovery()).toMatchObject({ kind: "pending" })
  expect(p.h.writes.length).toBe(writes)
  expect(p.h.records()).toEqual(before)
  await p.owner.dispose()
  for (const name of ["pending:sync-join", "pending:account-removal"] as const) {
    const held = await discardPrepared(),
      count = held.h.writes.length
    held.h.foreign(records => {
      records[name] = { v: 1 }
    })
    expect((await held.owner.discardInterimItem(recoveryUi, { capture: held.opened.capture, item: held.item.id })).kind).toBe("unavailable")
    expect(held.h.writes.length).toBe(count)
    await held.owner.dispose()
  }
}, 30000)
async function prepared(seed: JsonObject = fixture.seed, remote?: JsonObject) {
  const current = await confirmed(seed, remote),
    selection = await recoveryPrepare(current.owner)
  if (selection.prepared.kind !== "confirmation-required") throw Error("No confirmation capability")
  return { ...current, ...selection, confirmation: selection.prepared.confirmation }
}
async function accepted() {
  const p = await prepared()
  let count = 0,
    saved: JsonObject | undefined
  p.h.write(async (items, apply) => {
    count++
    if (count === 1) {
      apply(items)
      saved = p.h.records()
    } else throw p.h.error
  })
  const result = await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)
  expect(result).toEqual({ kind: "failed", stage: "documents", write: { kind: "rejected", error: p.h.error } })
  await p.owner.dispose()
  if (!saved) throw Error("Acceptance was not saved")
  return saved
}
export async function recoveryCompletedStorage() {
  const p = await prepared(),
    result = await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)
  expect(result.kind).toBe("committed")
  const records = p.h.records()
  await p.owner.dispose()
  return records
}

test("actual off/on transactions compare every stage to literal effects and reopen serialized storage", async () => {
  const result = await observeInterimRecoveryExecution()
  expect(result.observations).toHaveLength(2)
  expect(result.activation).toBe("held")
}, 60000)

test("equal known fields with canonical extensions require no acceptance or restore receipt", async () => {
  const seed = clone(fixture.seed)
  seed[filterName].data = { ...seed[filterName].data, ...clone(fixture.equalKnownFieldsVariant.data) }
  const { h, owner } = await confirmed(seed),
    before = h.records(),
    writes = h.writes.length,
    effects = h.effects.length
  const { prepared: result } = await recoveryPrepare(owner)
  expect(result).toEqual({ kind: "unavailable", reason: "already-present" })
  expect(h.records()).toEqual(before)
  expect(h.writes.length).toBe(writes)
  expect(h.effects.slice(effects).filter(x => x === "stamp" || x === "generation")).toEqual([])
  expect(readRetainedCheckpoint(h.records().interimConversion).kind).toBe("agreement")
  await owner.dispose()
})

test("absent off history becomes true provenance only for an actual replacement", async () => {
  const seed: JsonObject = clone(fixture.seed)
  delete seed.sync
  const p = await prepared(seed)
  expect(p.h.records().sync).toBeUndefined()
  expect((await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).kind).toBe("committed")
  expect(p.h.records().sync).toEqual(fixture.expectedAbsentHistoryAfterChangedOffReplacement.raw)
  await p.owner.dispose()
})

test("all four torn Filter/history combinations resume the exact accepted bytes without allocation", async () => {
  const saved = await accepted()
  for (const filter of ["before", "after"] as const)
    for (const history of ["before", "after"] as const) {
      const seed = clone(saved)
      seed[filterName] = clone(fixture.expectedFixedEffect[filter])
      seed.sync = clone(fixture.expectedFixedEffect.history[history].raw)
      const serialized = JSON.stringify(seed),
        h = createRecoveryHarness(JSON.parse(serialized))
      h.forbidAllocation()
      const owner = createStartingLocalFilterWriter(h.deps),
        startup = await recoveryHeld(owner)
      expect(startup.kind).toBe("pending-recovery")
      expect(h.writes).toEqual([])
      const pending = await owner.readInterimRecovery()
      expect(pending.kind).toBe("pending")
      expect(h.writes).toEqual([])
      const result = await owner.resumeInterimFilterReplacement(recoveryUi)
      expect(result.kind).toBe("committed")
      expect(h.records()[filterName]).toEqual(fixture.expectedFixedEffect.after)
      expect(h.records().sync).toEqual(fixture.expectedFixedEffect.history.after.raw)
      const read = readRetainedCheckpoint(h.records().interimConversion)
      expect(read.kind).toBe("recovery")
      if (read.kind !== "recovery") throw Error("No completed V4")
      expect(read.checkpoint.pending.kind).toBe("none")
      expect(read.checkpoint.resolutions).toHaveLength(1)
      expect(h.writes.map(x => Object.keys(x).sort())).toEqual(filter === "after" && history === "after" ? [["interimConversion"]] : [[filterName, "sync"].sort(), ["interimConversion"]])
      expect(h.effects.filter(x => x === "generation" || x === "stamp" || x === "sync-get" || x === "sync-set" || x === "timer")).toEqual([])
      await owner.dispose()
    }
}, 30000)

test("each write stage preserves original rejection identity and confirms only complete applied readback", async () => {
  for (const stage of ["accept", "documents", "record"] as const)
    for (const applied of [false, true]) {
      const p = await prepared(),
        index = { accept: 1, documents: 2, record: 3 }[stage]
      let calls = 0
      p.h.write(async (items, apply) => {
        calls++
        if (calls !== index || applied) apply(items)
        if (calls === index) throw p.h.error
      })
      const result = await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)
      if (applied) {
        expect(result.kind).toBe("committed")
        if (result.kind !== "committed") throw Error("Applied rejection was not confirmed")
        const mutation = result.mutations.find(x => x.stage === stage)
        expect(mutation?.write.kind).toBe("rejected")
        if (mutation?.write.kind !== "rejected") throw Error("Original rejection missing")
        expect(mutation.write.error).toBe(p.h.error)
      } else {
        expect(result.kind).toBe("failed")
        if (result.kind !== "failed" || result.stage === "before-set") throw Error("Unchanged rejection was not failed")
        expect(result.stage).toBe(stage)
        expect(result.write.error).toBe(p.h.error)
      }
      expect(calls).toBe(applied ? 3 : index)
      await p.owner.dispose()
    }
}, 30000)

test("partial, divergent and unreadable stage observations close the lane before another item", async () => {
  for (const index of [1, 2, 3])
    for (const mode of ["missing", "divergent", "read-failed"]) {
      const p = await prepared()
      let calls = 0
      p.h.write(async (items, apply) => {
        calls++
        if (calls !== index) {
          apply(items)
          return
        }
        if (mode !== "missing") apply(items)
        if (mode === "divergent")
          p.h.foreign(records => {
            records.unrelated = { changed: true }
          })
        if (mode === "read-failed")
          p.h.get(async () => {
            throw p.h.readError
          })
      })
      const attempted = p.owner.replaceInterimFilter(recoveryUi, p.confirmation),
        queued = p.owner.readInterimRecovery(),
        result = await attempted
      expect(result.kind).toBe("unconfirmed")
      if (result.kind !== "unconfirmed") throw Error("Uncertain write escaped barrier")
      expect<unknown>(result.stage).toBe(["accept", "documents", "record"][index - 1])
      if (mode === "read-failed") {
        expect(result.cause.kind).toBe("read-failed")
        if (result.cause.kind === "read-failed") expect(result.cause.error).toBe(p.h.readError)
      }
      expect(await queued).toEqual({ kind: "unavailable", reason: "stale" })
      expect(calls).toBe(index)
      await p.owner.dispose()
    }
}, 30000)

test("cancelled, copied, wrong-origin, foreign and consumed confirmation capabilities cannot write", async () => {
  const p = await prepared(),
    before = p.h.records(),
    count = p.h.writes.length
  expect(await p.owner.replaceInterimFilter(recoveryUi, { ...p.confirmation })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await p.owner.replaceInterimFilter({ ...recoveryUi, windowId: 2 }, p.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  const other = await confirmed()
  expect(await other.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  p.owner.cancelInterimFilterReplacement(recoveryUi, p.confirmation)
  expect(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(count)
  const next = await recoveryPrepare(p.owner)
  if (next.prepared.kind !== "confirmation-required") throw Error("Reopened preparation missing")
  expect((await p.owner.replaceInterimFilter(recoveryUi, next.prepared.confirmation)).kind).toBe("committed")
  expect(await p.owner.replaceInterimFilter(recoveryUi, next.prepared.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  await p.owner.dispose()
  await other.owner.dispose()
}, 30000)

test("observed complete-store A-B-A permanently invalidates captures and confirmation", async () => {
  const p = await prepared(),
    original = p.h.records().unrelated,
    writes = p.h.writes.length
  p.h.foreign(records => {
    records.unrelated = "B"
  })
  await p.owner.readInterimRecovery()
  p.h.foreign(records => {
    records.unrelated = original!
  })
  await p.owner.readInterimRecovery()
  expect(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(p.h.writes.length).toBe(writes)
  await p.owner.dispose()
})

test("caller item and origin are detached before the queued preparation awaits", async () => {
  const p = await confirmed(),
    opened = await p.owner.readInterimRecovery()
  if (opened.kind !== "review") throw Error("No review")
  const row = opened.view.items.find(x => x.kind === "filter" && x.id.sourceKey === "account:AAAAAAAAAAAAAAAA")
  if (!row) throw Error("No source filter")
  const item = clone(row.id),
    origin = { ...recoveryUi, windowId: 1 }
  const requested = p.owner.prepareInterimFilterReplacement(origin, { capture: opened.capture, item })
  origin.windowId = 9
  ;(item as { sourceKey: string }).sourceKey = "playlists"
  const result = await requested
  expect(result.kind).toBe("confirmation-required")
  if (result.kind === "confirmation-required") p.owner.cancelInterimFilterReplacement(recoveryUi, result.confirmation)
  await p.owner.dispose()
})

test("fresh same-account authority and exact ownership are required after separate confirmation", async () => {
  for (const failure of ["ownership", "authority", "private"]) {
    const p = await prepared(),
      count = p.h.writes.length
    if (failure === "ownership") p.h.ownership(false)
    if (failure === "authority") p.h.authority({ kind: "unavailable" })
    const result = await p.owner.replaceInterimFilter({ ...recoveryUi, incognito: failure === "private" }, p.confirmation)
    expect(result.kind === "unavailable" || result.kind === "refused").toBe(true)
    expect(p.h.writes.length).toBe(count)
    await p.owner.dispose()
  }
}, 30000)

test("read-only recovery never performs ownership lookup and preinitialized construction cannot bypass startup", async () => {
  const { h, owner } = await confirmed(),
    at = h.effects.length
  expect((await owner.readInterimRecovery()).kind).toBe("review")
  expect(h.effects.slice(at).filter(x => x === "recovery-authority" || x === "recovery-ownership" || x === "stamp" || x === "generation")).toEqual([])
  const preinitialized = createLocalFilterWriter(h.deps)
  expect(await preinitialized.readInterimRecovery()).toEqual({ kind: "unavailable", reason: "startup" })
  await owner.dispose()
  await preinitialized.dispose()
})

test("explicit history and the dedicated recovery ownership port cannot be replaced by missing evidence or claim lineage", async () => {
  const p = await confirmed(),
    host = p.h.deps.recovery
  if (host.kind !== "fixture") throw Error("Missing recovery fixture host")
  const owner = createStartingLocalFilterWriter({
    ...p.h.deps,
    recovery: {
      ...host,
      snapshot: {
        async read() {
          return { retained: interimSnapshot(p.h.records()), history: { kind: "absent" } }
        }
      }
    }
  })
  await recoveryHeld(owner)
  expect(await owner.readInterimRecovery()).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await owner.resumeInterimFilterReplacement(recoveryUi)).toEqual({ kind: "unavailable", reason: "stale" })
  await owner.dispose()
  const claimOwner = createStartingLocalFilterWriter({
    ...p.h.deps,
    recovery: {
      ...host,
      ownership: {
        async lookup(authority) {
          return { kind: "fixture-owned", authority, ownedPlaylistIds: new Set([p.h.playlist]), lineage: "local-migration-only" }
        }
      }
    }
  })
  await recoveryHeld(claimOwner)
  const writes = p.h.writes.length,
    result = await recoveryPrepare(claimOwner)
  expect(result.prepared).toEqual({ kind: "unavailable", reason: "ownership" })
  expect(p.h.writes.length).toBe(writes)
  await claimOwner.dispose()
  await p.owner.dispose()
})

test("live destination and lossless retained body are mandatory, while unticked kept filters remain eligible", async () => {
  const variants: ((seed: JsonObject) => void)[] = [
    seed => {
      delete seed[filterName]
    },
    seed => {
      seed[filterName] = null
    },
    seed => {
      seed[filterName] = fixture.laterTombstone
    },
    seed => {
      seed[filterName] = { ...fixture.expectedFixedEffect.before, v: 2 }
    },
    seed => {
      seed["doc:setup:AAAAAAAAAAAAAAAA"] = fixture.laterTombstone
    },
    seed => {
      const body = seed["account:AAAAAAAAAAAAAAAA"]
      if (object(body) && object(body.labels)) body.labels.UCbbbbbbbbbbbbbbbbbbbbbb = { title: "x".repeat(101), handle: "@retained" }
    }
  ]
  for (const variant of variants) {
    const seed: JsonObject = clone(fixture.seed)
    variant(seed)
    const p = await confirmed(seed),
      before = p.h.records(),
      count = p.h.writes.length
    const result = await recoveryPrepare(p.owner)
    expect(result.prepared.kind).toBe("unavailable")
    expect(p.h.records()).toEqual(before)
    expect(p.h.writes.length).toBe(count)
    await p.owner.dispose()
  }
}, 30000)

test("sync admission refuses newer addressed versions and reset without continuation or history effects", async () => {
  for (const [override, expected] of [
    [syncFixture.addressedNewerVersionOverride, syncFixture.expectedNewerVersionResult],
    [syncFixture.resetMetadataOverride, syncFixture.expectedResetResult]
  ] as const) {
    const seed = { ...clone(fixture.seed), ...clone(syncFixture.seedOverrides) },
      remote = { ...clone(syncFixture.remoteInventory), ...clone(override) }
    const p = await prepared(seed, remote),
      before = p.h.records(),
      count = p.h.writes.length
    expect<unknown>(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual(expected)
    expect(p.h.records()).toEqual(before)
    expect(p.h.writes.length).toBe(count)
    await p.owner.dispose()
  }
}, 30000)

test("lost remote repair evidence leaves the accepted fixed operation pending without writing", async () => {
  const seed = { ...clone(fixture.seed), ...clone(syncFixture.seedOverrides) },
    p = await prepared(seed, syncFixture.remoteInventory)
  let count = 0
  p.h.write(async (items, apply) => {
    count++
    apply(items)
    if (count === 1)
      p.h.remote(remote => {
        delete remote["s:settings"]
      })
  })
  expect<unknown>(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual(syncFixture.repairDebtLostOnResume.expected)
  expect(count).toBe(1)
  const saved = JSON.stringify(p.h.records())
  await p.owner.dispose()
  const remote: JsonObject = clone(syncFixture.remoteInventory)
  delete remote["s:settings"]
  const h = createRecoveryHarness(JSON.parse(saved), remote)
  h.forbidAllocation()
  const owner = createStartingLocalFilterWriter(h.deps)
  await recoveryHeld(owner)
  expect(await owner.resumeInterimFilterReplacement(recoveryUi)).toEqual({ kind: "unavailable", reason: "admission-debt" })
  expect(h.writes).toEqual([])
  expect(h.records()).toEqual(JSON.parse(saved))
  await owner.dispose()
})

test("full sync admission counts retained chunks and unknown occupied items without cleanup credit", async () => {
  const seed = { ...clone(fixture.seed), ...clone(syncFixture.seedOverrides) }
  const h = createRecoveryHarness(seed, syncFixture.remoteInventory)
  const chunked = encodeSyncDocument({
    key: { kind: "filter", acct: h.account, playlist: h.playlist },
    document: {
      ...fixture.expectedFixedEffect.before,
      gen: "retained-chunk-generation",
      data: { ...fixture.expectedFixedEffect.before.data, future: "x".repeat(16000) }
    }
  })
  if (chunked.kind !== "encoded") throw Error("Could not encode retained occupancy fixture")
  const remote: JsonObject = {
    ...clone(syncFixture.remoteInventory),
    ...Object.fromEntries(chunked.encoded.items.filter(x => x.key !== "s:filter:AAAAAAAAAAAAAAAA:PL_KEPT").map(x => [x.key, x.value])),
    ...Object.fromEntries(Array.from({ length: 480 }, (_, i) => [`occupied:${i}`, false]))
  }
  const p = await prepared(seed, remote),
    before = p.h.records(),
    count = p.h.writes.length
  expect(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "refused", reason: "sync-full" })
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(count)
  expect(p.h.effects.filter(x => x === "sync-set" || x === "sync-subscribe" || x === "timer")).toEqual([])
  await p.owner.dispose()
})

test("loss of authority, ownership or disposal during attempted IO is unconfirmed at every stage", async () => {
  for (const stage of [1, 2, 3])
    for (const loss of ["authority", "ownership", "disposed"]) {
      const p = await prepared()
      let count = 0
      p.h.write(async (items, apply) => {
        count++
        apply(items)
        if (count === stage) {
          if (loss === "authority") p.h.authority({ kind: "unavailable" })
          else if (loss === "ownership") p.h.ownership(false)
          else void p.owner.dispose()
        }
      })
      const result = await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)
      expect(result.kind).toBe("unconfirmed")
      if (result.kind !== "unconfirmed") throw Error("Attempted write lost its authority observation")
      expect(result.cause.kind).toBe(loss === "disposed" ? "stopped" : "authority")
      expect(count).toBe(stage)
      await p.owner.dispose()
    }
}, 30000)

test("source capture and confirmation are foreign to a fresh owner after serialized restart", async () => {
  const p = await prepared(),
    serialized = JSON.stringify(p.h.records())
  await p.owner.dispose()
  const h = createRecoveryHarness(JSON.parse(serialized))
  h.forbidAllocation()
  const owner = createStartingLocalFilterWriter(h.deps)
  await recoveryHeld(owner)
  expect(await owner.prepareInterimFilterReplacement(recoveryUi, { capture: p.opened.capture, item: p.item.id })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.writes).toEqual([])
  expect(h.records()).toEqual(JSON.parse(serialized))
  await owner.dispose()
})

test("completed and accepted evidence never replays over later edits, deletion, changed parent or extra canonical records", async () => {
  for (const original of [await accepted(), await recoveryCompletedStorage()])
    for (const variant of ["edit", "deleted", "parent", "extra"]) {
      const seed = clone(original)
      if (variant === "edit") seed[filterName] = fixture.laterEdit
      if (variant === "deleted") seed[filterName] = fixture.laterTombstone
      if (variant === "parent") seed["doc:setup:AAAAAAAAAAAAAAAA"] = fixture.laterTombstone
      if (variant === "extra") seed["cache:AAAAAAAAAAAAAAAA"] = { playlists: [], at: 5 }
      const h = createRecoveryHarness(seed)
      h.forbidAllocation()
      const owner = createStartingLocalFilterWriter(h.deps)
      await recoveryHeld(owner)
      expect((await owner.readInterimRecovery()).kind).toBe("unavailable")
      expect((await owner.resumeInterimFilterReplacement(recoveryUi)).kind).toBe("unavailable")
      expect(h.records()).toEqual(seed)
      expect(h.writes).toEqual([])
      await owner.dispose()
    }
}, 30000)

test("V4 validates immutable source and outcomes, fixed images, flat occurrence receipts and explicit history", async () => {
  const records = await recoveryCompletedStorage(),
    raw = records.interimConversion
  if (!object(raw)) throw Error("No checkpoint")
  expect(readRetainedRecovery(raw).kind).toBe("recovery")
  const changes: ((value: JsonObject) => void)[] = [
    value => {
      value.basis = { checkpoint: clone(raw), history: { kind: "absent" } }
    },
    value => {
      if (Array.isArray(value.resolutions)) value.resolutions.push(clone(value.resolutions[0]!))
    },
    value => {
      value.pending = { kind: "unknown" }
    },
    value => {
      value.resolutions = [{ kind: "discarded", effect: fixture.expectedFixedEffect }]
    },
    value => {
      value.resolutions = [{ kind: "filter-replaced", effect: { ...fixture.expectedFixedEffect, item: { sourceKey: "playlists", path: [0] } } }]
    },
    value => {
      value.resolutions = [{ kind: "filter-replaced", effect: { ...fixture.expectedFixedEffect, after: { ...fixture.expectedFixedEffect.after, by: "foreign" } } }]
    },
    value => {
      value.resolutions = [{ kind: "filter-replaced", effect: { ...fixture.expectedFixedEffect, after: { ...fixture.expectedFixedEffect.after, data: fixture.expectedFixedEffect.before.data } } }]
    },
    value => {
      value.resolutions = [
        { kind: "filter-replaced", effect: { ...fixture.expectedFixedEffect, history: { ...fixture.expectedFixedEffect.history, after: fixture.expectedFixedEffect.history.before } } }
      ]
    },
    value => {
      if (object(value.basis) && object(value.basis.checkpoint) && object(value.basis.checkpoint.retained)) value.basis.checkpoint.retained.outcome = { kind: "blocked" }
    }
  ]
  for (const change of changes) {
    const altered = clone(raw)
    change(altered)
    expect(readRetainedCheckpoint(altered)).toEqual({ kind: "invalid" })
  }
  const valid = readRetainedRecovery(raw)
  if (valid.kind !== "recovery") throw Error("No valid V4")
  expect(retainedRecoveryDifference({ checkpoint: valid.checkpoint, current: interimSnapshot(records), history: { kind: "present", raw: records.sync as JsonObject } })).toBeUndefined()
  expect(projectInterimNote({ checkpoint: raw, current: interimSnapshot(records) })).toEqual({ kind: "held", reason: "history" })
})

test("V4 retention classifies pending and completed states before legacy execution or any writes", async () => {
  for (const seed of [await accepted(), await recoveryCompletedStorage()]) {
    const h = createRecoveryHarness(seed)
    const result = await executeInterimRetention({
      local: h.deps.local,
      snapshot: h.deps.startup.readInterimSnapshot,
      context() {
        throw Error("Existing V4 allocated conversion context")
      },
      isStopped: () => false
    })
    expect(["pending-recovery", "confirmed-recovery"]).toContain(result.kind)
    expect(h.writes).toEqual([])
  }
}, 30000)

test("v1 and accepted predecessors require their real explicit confirmation continuations", async () => {
  const h = createRecoveryHarness(),
    owner = createStartingLocalFilterWriter(h.deps)
  await recoveryHeld(owner)
  expect(await owner.readInterimRecovery()).toEqual({ kind: "unavailable", reason: "retention" })
  const review = await owner.readAgreement(recoveryUi)
  if (review.kind !== "review") throw Error("No retained disclosure")
  let writes = 0
  h.write(async (items, apply) => {
    if (++writes === 1) apply(items)
    else throw h.error
  })
  expect(
    (
      await owner.agree(recoveryUi, {
        review: review.review,
        displayedVersion: review.version,
        choice: { kind: "retained-disclosure" },
        access: Promise.resolve({ www: false, music: false, browserMenu: false })
      })
    ).kind
  ).toBe("failed")
  expect(await owner.readInterimRecovery()).toEqual({ kind: "unavailable", reason: "pending-agreement" })
  h.write(async (items, apply) => {
    apply(items)
  })
  expect((await owner.resumeRetainedAgreement(recoveryUi)).kind).toBe("committed")
  expect((await owner.readInterimRecovery()).kind).toBe("review")
  await owner.dispose()

  const installing = createRecoveryHarness({ sessionConsent: 1, "account:AAAAAAAAAAAAAAAA": clone(fixture.seed["account:AAAAAAAAAAAAAAAA"]) })
  const installedOwner = createStartingLocalFilterWriter(installing.deps)
  await recoveryAgree(installedOwner, installing)
  const installReview = await installedOwner.readInterimInstallation(recoveryUi)
  if (installReview.kind !== "review") throw Error("No full installation review")
  let stages = 0
  installing.write(async (items, apply) => {
    if (++stages === 1) apply(items)
    else throw installing.error
  })
  expect((await installedOwner.installInterimConversion(recoveryUi, installReview.review)).kind).toBe("failed")
  expect(await installedOwner.readInterimRecovery()).toEqual({ kind: "unavailable", reason: "pending-installation" })
  installing.write(async (items, apply) => {
    apply(items)
  })
  expect((await installedOwner.resumeInterimInstallation(recoveryUi)).kind).toBe("committed")
  const count = installing.writes.length,
    equal = await recoveryPrepare(installedOwner)
  expect(equal.prepared).toEqual({ kind: "unavailable", reason: "already-present" })
  expect(installing.writes.length).toBe(count)
  expect(readRetainedCheckpoint(installing.records().interimConversion).kind).toBe("installation")
  await installedOwner.dispose()
}, 30000)

test("multiple occurrences use flat resolutions and preserve predecessor and V4 root extensions", async () => {
  const seed: JsonObject = clone(fixture.seed),
    body = seed["account:AAAAAAAAAAAAAAAA"]
  if (!object(body) || !object(body.filters)) throw Error("No account filter fixture")
  body.filters.PL_SECOND = clone(body.filters.PL_KEPT!)
  seed["doc:filter:AAAAAAAAAAAAAAAA:PL_SECOND"] = { ...fixture.expectedFixedEffect.before, gen: "second-canonical" }
  const first = await confirmed(seed),
    agreed = first.h.records()
  await first.owner.dispose()
  if (!object(agreed.interimConversion)) throw Error("No agreement checkpoint")
  agreed.interimConversion.resolutions = { compatible: "predecessor-owned extension" }
  agreed.interimConversion.pending = "opaque predecessor pending extension"
  const h = createRecoveryHarness(JSON.parse(JSON.stringify(agreed)))
  h.allocateReplacement()
  h.allowPlaylist("PL_SECOND")
  const owner = createStartingLocalFilterWriter(h.deps)
  await recoveryHeld(owner)
  const selection = await recoveryPrepare(owner)
  if (selection.prepared.kind !== "confirmation-required") throw Error("No first confirmation")
  expect((await owner.replaceInterimFilter(recoveryUi, selection.prepared.confirmation)).kind).toBe("committed")
  const saved = h.records()
  await owner.dispose()
  if (!object(saved.interimConversion)) throw Error("No V4")
  saved.interimConversion.extension = { retained: [null, false] }
  const next = createRecoveryHarness(JSON.parse(JSON.stringify(saved)))
  next.allocateReplacement()
  next.allowPlaylist("PL_SECOND")
  next.replacementGeneration("recovery-002")
  const nextOwner = createStartingLocalFilterWriter(next.deps)
  await recoveryHeld(nextOwner)
  const opened = await nextOwner.readInterimRecovery()
  if (opened.kind !== "review") throw Error("No second recovery review")
  const item = opened.view.items.find(x => x.kind === "filter" && x.facts.playlist === "PL_SECOND")
  if (!item) throw Error("No second occurrence")
  const prepared = await nextOwner.prepareInterimFilterReplacement(recoveryUi, { capture: opened.capture, item: item.id })
  if (prepared.kind !== "confirmation-required") throw Error("No second confirmation")
  expect((await nextOwner.replaceInterimFilter(recoveryUi, prepared.confirmation)).kind).toBe("committed")
  const read = readRetainedCheckpoint(next.records().interimConversion)
  if (read.kind !== "recovery") throw Error("No flat recovery successor")
  expect(read.checkpoint.resolutions).toHaveLength(2)
  expect<unknown>(read.checkpoint.basis.checkpoint).toEqual(agreed.interimConversion)
  expect(Object.getOwnPropertyDescriptor(read.checkpoint, "extension")?.value).toEqual({ retained: [null, false] })
  expect(read.checkpoint.resolutions.map(x => (x.kind !== "discarded" ? x.effect.item.path : x.item.path))).toEqual([
    ["filters", "PL_KEPT"],
    ["filters", "PL_SECOND"]
  ])
  await nextOwner.dispose()
}, 30000)

test("pending removal and join continuations block recovery without settling, erasing or bypassing them", async () => {
  const p = await confirmed(),
    agreed = p.h.records()
  await p.owner.dispose()
  const continuations: [string, JsonObject][] = [
    ["pending:account-removal", { v: 1, kind: "account-removal", opaque: true }],
    ["pending:sync-join", { v: 1, kind: "sync-join", phase: "choice" }],
    ["pending:sync-join", { v: 99, kind: "sync-join" }]
  ]
  for (const [key, value] of continuations) {
    const seed: JsonObject = { ...clone(agreed), [key]: clone(value) }
    const h = createRecoveryHarness(clone(seed))
    h.forbidAllocation()
    const owner = createStartingLocalFilterWriter(h.deps)
    await owner.ready().catch(() => undefined)
    const reason = key === "pending:account-removal" ? "pending-removal" : "pending-join"
    expect(await owner.readInterimRecovery()).toEqual({ kind: "unavailable", reason })
    expect(await owner.resumeInterimFilterReplacement(recoveryUi)).toEqual({ kind: "unavailable", reason })
    expect(h.records()).toEqual(seed)
    expect(h.writes).toEqual([])
    expect(h.effects.filter(x => x === "recovery-ownership" || x === "stamp" || x === "generation" || x === "sync-get")).toEqual([])
    await owner.dispose()
  }
}, 30000)

test("wrong account and rotated lease, session or consent generation refuse before acceptance", async () => {
  const other = "BBBBBBBBBBBBBBBB"
  if (!isAccountKey(other)) throw Error("Invalid synthetic account")
  const changes = [
    [{ acct: other }, "authority"],
    [{ lease: "fixture-lease-2" }, "stale"],
    [{ browserSession: "fixture-browser-session-2" }, "stale"],
    [{ consentGeneration: "fixture-canonical-consent-2" }, "stale"]
  ] as const
  for (const [change, reason] of changes) {
    const p = await prepared(),
      before = p.h.records(),
      count = p.h.writes.length
    p.h.authority({
      kind: "ready",
      authority: {
        acct: p.h.account,
        lease: "fixture-lease-1",
        browserSession: "fixture-browser-session-1",
        consentGeneration: "fixture-canonical-consent-1",
        signedIn: true,
        incognito: false,
        ...change
      }
    })
    expect(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "unavailable", reason })
    expect(p.h.records()).toEqual(before)
    expect(p.h.writes.length).toBe(count)
    await p.owner.dispose()
  }
}, 30000)

test("a colliding replacement generation is refused before any write and consumes the confirmation", async () => {
  const p = await prepared(),
    before = p.h.records(),
    count = p.h.writes.length
  p.h.replacementGeneration("canonical-setup")
  expect(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "refused", reason: "invalid" })
  p.h.replacementGeneration("recovery-001")
  expect(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(p.h.records()).toEqual(before)
  expect(p.h.writes.length).toBe(count)
  await p.owner.dispose()
})

test("a pending replacement with third history or a changed parent Setup stays held without writes", async () => {
  const saved = await accepted(),
    setupName = "doc:setup:AAAAAAAAAAAAAAAA"
  const variants: ((seed: JsonObject) => void)[] = [
    seed => {
      const sync = seed.sync
      if (object(sync)) seed.sync = { ...sync, drift: true }
    },
    seed => {
      const setup = seed[setupName]
      if (object(setup)) seed[setupName] = { ...setup, gen: "changed-setup" }
    }
  ]
  for (const variant of variants) {
    const seed: JsonObject = clone(saved)
    variant(seed)
    expect(seed).not.toEqual(saved)
    const h = createRecoveryHarness(clone(seed))
    h.forbidAllocation()
    const owner = createStartingLocalFilterWriter(h.deps)
    await recoveryHeld(owner)
    expect((await owner.readInterimRecovery()).kind).toBe("unavailable")
    expect((await owner.resumeInterimFilterReplacement(recoveryUi)).kind).toBe("unavailable")
    expect(h.records()).toEqual(seed)
    expect(h.writes).toEqual([])
    await owner.dispose()
  }
}, 30000)

test("resume keeps the fixed operation pending when fresh admission needs repairs outside its history", async () => {
  const seed = { ...clone(fixture.seed), ...clone(syncFixture.seedOverrides) },
    partial: JsonObject = clone(syncFixture.remoteInventory)
  delete partial["s:settings"]
  const p = await prepared(seed, partial)
  let count = 0
  p.h.write(async (items, apply) => {
    if (++count === 1) apply(items)
    else throw p.h.error
  })
  expect(await p.owner.replaceInterimFilter(recoveryUi, p.confirmation)).toEqual({ kind: "failed", stage: "documents", write: { kind: "rejected", error: p.h.error } })
  const saved = JSON.stringify(p.h.records())
  await p.owner.dispose()
  const pending = readRetainedCheckpoint(JSON.parse(saved).interimConversion)
  if (pending.kind !== "recovery" || pending.checkpoint.pending.kind !== "filter-replacement" || pending.checkpoint.pending.effect.admission.kind !== "synced")
    throw Error("No synced pending replacement")
  expect(pending.checkpoint.pending.effect.admission.requiredRepairs.map(x => x.name)).toEqual(["doc:setup:AAAAAAAAAAAAAAAA", "doc:filter:AAAAAAAAAAAAAAAA:PL_KEPT"])
  const h = createRecoveryHarness(JSON.parse(saved), syncFixture.remoteInventory)
  h.forbidAllocation()
  const owner = createStartingLocalFilterWriter(h.deps)
  await recoveryHeld(owner)
  expect(await owner.resumeInterimFilterReplacement(recoveryUi)).toEqual({ kind: "unavailable", reason: "admission-debt" })
  expect(h.writes).toEqual([])
  expect(h.records()).toEqual(JSON.parse(saved))
  await owner.dispose()
}, 30000)
