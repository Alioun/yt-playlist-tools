import { expect, test } from "bun:test"
import { createBrowserLocalFilterWriter } from "./local-filter-writer"
import { createBrowserStartingLocalFilterWriter } from "./starting-owner"
import { StartupReadinessError } from "../store/local-filter-writer"
import { isAccountKey, isVideoId } from "../../shared/model"
import type { JsonObject } from "../../shared/contracts/json"
import { agreedSeed, check, gate, startingOwnerFixture } from "../../../tools/fixtures/starting-owner/support"
import { acct, one, ui, seed, captured, change } from "../../../tools/fixtures/auto-add-choice/harness"
import { runStartingOwnerConsumer } from "../../../tools/fixtures/starting-owner/run"
import { fileText as settingsImportFile, initial as importSeed } from "../../../tools/fixtures/settings-import-execution/harness"

function object(value: unknown): JsonObject {
  check(value !== null && typeof value === "object" && !Array.isArray(value), "a stored record")
  return value as JsonObject
}

test("the native owner imports a settings file through the browser's own cleanup host (UI-SET-22, DATA-55)", async () => {
  const h = startingOwnerFixture(importSeed().local as JsonObject), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(await owner.ready()).toBe("ok")
    const prepared = await owner.prepareSettingsImport(ui, settingsImportFile())
    if (prepared.kind !== "confirmation-required") throw Error(`Expected a confirmation, got ${prepared.kind}`)
    const writes = h.counts.localSet
    expect((await owner.importSettings(ui, { confirmation: prepared.confirmation, replace: "confirmed" })).kind).toBe("committed")
    expect(h.counts.localSet).toBeGreaterThan(writes)
    expect(await owner.resumeSettingsImport(ui)).toEqual({ kind: "idle" })
  } finally { await owner.dispose() }
})

test("the native owner joins another browser's synced settings and retires the join through the browser's own removal (SYNC-08)", async () => {
  const seed = agreedSeed()
  Object.assign(object(seed.sync), { everEdited: true })
  object(seed["doc:settings"]).data = { theme: "light" }
  const h = startingOwnerFixture(seed), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  const synced = { v: 1, gen: "elsewhere", at: 5, by: "other-browser", data: { theme: "dark" } }
  h.replaceRemote({ "s:meta": { v: 1, id: "other-history", created: 2 }, "s:settings": synced })
  try {
    expect(await owner.ready()).toBe("ok")
    const preparation = await owner.beginSyncJoin(ui).result
    if (preparation.kind !== "choice-required") throw Error(`Expected the join question, got ${JSON.stringify(preparation)}`)
    expect(preparation.reason).toBe("independent-settings")
    const result = await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-synced" })
    expect(result).toMatchObject({ kind: "committed", historyId: "other-history", replication: "confirmed" })
    const records = h.records()
    expect(records["doc:settings"]).toEqual(synced)
    expect(object(records.device).syncOn).toBe(true)
    expect(object(records.sync)).toMatchObject({ joined: "other-history", status: "ok" })
    expect(Object.hasOwn(records, "pending:sync-join")).toBe(false)
    expect(h.localRemovals).toEqual([["pending:sync-join"]])
    expect(h.counts.rawLocal).toBe(0)
  } finally { await owner.dispose() }
})

test("switching sync off deletes nothing, and switching it on again with no edits adopts the same history silently (SYNC-19, SYNC-20)", async () => {
  const h = startingOwnerFixture(agreedSeed(true)), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(await owner.ready()).toBe("ok")
    await owner.startSync()
    expect(h.listeners.size, "a syncing browser listens to the sync area").toBe(1)
    const before = h.records(), remote = h.remote(), sets = h.counts.syncSet
    expect(await owner.cancelSyncJoin(ui)).toEqual({ kind: "cancelled" })
    expect(h.listeners.size, "switched off, it stops listening").toBe(0)
    const off = h.records()
    expect(object(off.device).syncOn).toBe(false)
    expect(object(off.sync)).toEqual({ ...object(before.sync), status: "off", editedSinceOff: false })
    expect(off["doc:settings"]).toEqual(before["doc:settings"])
    expect(Object.hasOwn(off, "pending:sync-join")).toBe(false)
    expect(h.remote()).toEqual(remote)
    expect(h.counts.syncSet).toBe(sets)
    expect(await owner.cancelSyncJoin(ui), "a second switch-off has nothing to do").toEqual({ kind: "cancelled" })
    const preparation = await owner.beginSyncJoin(ui).result
    expect(preparation).toMatchObject({ kind: "automatic", reason: "proven-same-history-no-edit" })
    if (preparation.kind !== "automatic") return
    expect(await owner.applySyncJoin(ui, { kind: "automatic", review: preparation.review })).toMatchObject({ kind: "committed", historyId: "history" })
    expect(object(h.records().device).syncOn).toBe(true)
  } finally { await owner.dispose() }
})

test("starting construction confirms schema through the supplied local source", async () => {
  const h = startingOwnerFixture(), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    await expect(owner.ready()).resolves.toBe("ok")
    expect(h.records()).toEqual({ schema: 1 })
    expect(h.counts.localRead).toBeGreaterThan(0)
    expect(h.counts.rawLocal).toBe(0)
  } finally { await owner.dispose() }
})

test("held startup exposes pending readiness and has no native or automatic effects", async () => {
  const h = startingOwnerFixture(), hold = gate()
  h.hooks.localRead = hold.wait
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  let ready = false
  const readiness = owner.ready().then(value => { ready = true; return value })
  try {
    await hold.entered
    expect(ready).toBe(false)
    expect(await owner.read("settings")).toEqual({ kind: "unavailable", reason: "startup" })
    expect(await owner.session.read()).toEqual({ kind: "unavailable", reason: "startup" })
    await owner.startSync()
    expect(h.counts).toMatchObject({ rawLocal: 0, localSet: 0, sessionGet: 0, sessionSet: 0, syncGet: 0, syncSet: 0, adds: 0 })
    expect(h.timers).toEqual([])
    expect(h.results).toEqual([])
    hold.release()
    expect(await readiness).toBe("ok")
    expect(h.records()).toEqual({ schema: 1 })
    expect(h.counts.rawLocal).toBe(0)
    expect(h.counts.adds).toBe(0)
  } finally { hold.release(); await owner.dispose() }
})

test("startup failure stays observable and never opens canonical operations", async () => {
  const h = startingOwnerFixture({ schema: 0.5 })
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    let failure: unknown
    try { await owner.ready() } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(StartupReadinessError)
    check(failure instanceof StartupReadinessError, "structured startup failure")
    expect(failure.result.kind).toBe("invalid")
    await expect(owner.ready()).rejects.toBe(failure)
    expect(await owner.read("settings")).toEqual({ kind: "unavailable", reason: "startup" })
    expect(await owner.session.read()).toEqual({ kind: "unavailable", reason: "startup" })
    await owner.startSync()
    expect(h.counts).toMatchObject({ rawLocal: 0, localSet: 0, sessionGet: 0, syncGet: 0, adds: 0 })
  } finally { await owner.dispose() }
})

test("newer layout readiness remains distinct from healthy startup", async () => {
  const h = startingOwnerFixture({ schema: 2 }), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(await owner.ready()).toBe("newer-layout")
    expect(await owner.read("settings")).toEqual({ kind: "unavailable", reason: "newer-layout" })
    expect(await owner.session.read()).toEqual({ kind: "unavailable", reason: "newer-layout" })
    expect(h.counts.localSet).toBe(0)
  } finally { await owner.dispose() }
})

test("legacy and starting facades exclude each other and separate local areas remain independent", async () => {
  const h = startingOwnerFixture(agreedSeed()), other = startingOwnerFixture(agreedSeed())
  const legacy = createBrowserLocalFilterWriter(h.native, { onSyncResult() {} })
  expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  const independent = createBrowserStartingLocalFilterWriter(other.native, other.options)
  await legacy.dispose()
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(() => createBrowserLocalFilterWriter(h.native, { onSyncResult() {} })).toThrow("Local storage already owned")
    expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
    expect(await owner.ready()).toBe("ok")
    expect(await independent.ready()).toBe("ok")
  } finally { await owner.dispose(); await independent.dispose() }
  const replacement = createBrowserLocalFilterWriter(h.native, { onSyncResult() {} })
  await replacement.dispose()
  expect(h.counts.rawLocal).toBe(0)
})

test("synchronous constructor failure releases its shared ownership guard", async () => {
  const h = startingOwnerFixture(agreedSeed()), marker = Error("Synthetic context failure")
  const startup = new Proxy(h.options.startup, { get(target, key, receiver) {
    if (key === "context") throw marker
    return Reflect.get(target, key, receiver)
  } })
  expect(() => createBrowserStartingLocalFilterWriter(h.native, { ...h.options, startup })).toThrow(marker)
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try { expect(await owner.ready()).toBe("ok") } finally { await owner.dispose() }
})

test("session aliases persist only canonical batches and exact account removals through one owner", async () => {
  const h = startingOwnerFixture(agreedSeed()), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  const acct = "AAAAAAAAAAAAAAAA", video = "vid00000001"
  check(isAccountKey(acct) && isVideoId(video), "validated fixture identifiers")
  h.seedSession({ unknown: { kept: true } })
  try {
    await owner.ready()
    const read = await owner.session.read()
    check(read.kind === "memory", "canonical session read")
    const skip = await owner.changeSession({ revision: read.revision, now: 200, edits: [{ kind: "skip", acct, video, playlists: "all" }] })
    check(skip.kind === "committed", "canonical skip committed")
    const unskip = await owner.session.change({ revision: skip.revision, now: 201, edits: [{ kind: "unskip", acct, video }] })
    expect(unskip.kind).toBe("committed")
    expect(h.sessionBatches).toEqual([{ [`skips:${acct}`]: { [video]: "all" } }])
    expect(h.sessionRemovals).toEqual([[`skips:${acct}`]])
    expect(h.session()).toEqual({ unknown: { kept: true } })
    expect(owner.session.read).toBe(owner.readSession)
    expect(owner.session.change).toBe(owner.changeSession)
    expect(await owner.claim()).toEqual({ kind: "unavailable", reason: "authority" })
    expect(h.counts.rawLocal).toBe(0)
  } finally { await owner.dispose() }
})

test("native sync listener and timers leave through canonical idempotent disposal", async () => {
  const h = startingOwnerFixture(agreedSeed(true)), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  await owner.ready()
  expect(h.counts.syncGet).toBe(0)
  expect(h.listeners.size).toBe(0)
  h.mutate(records => { records["doc:settings"] = { v: 1, gen: "settings-1", at: 2, by: "starting-fixture", data: { theme: "dark" } } })
  await owner.startSync()
  expect(h.listeners.size).toBe(1)
  expect(h.timers.some(timer => !timer.cancelled)).toBe(true)
  const first = owner.dispose(), second = owner.dispose()
  expect(first).toBe(second)
  await first
  expect(h.counts.removes).toBe(1)
  expect(h.listeners.size).toBe(0)
  expect(h.timers.every(timer => timer.cancelled)).toBe(true)
  const before = { ...h.counts }, results = h.results.length
  h.fireLate()
  expect(h.counts).toEqual(before)
  expect(h.results).toHaveLength(results)
  await expect(owner.startSync()).rejects.toThrow("Writer disposed")
  const replacement = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try { expect(await replacement.ready()).toBe("ok") } finally { await replacement.dispose() }
})

test.each([false, true])("partial native listener registration retains unconfirmed teardown %s", async unconfirmed => {
  const h = startingOwnerFixture(agreedSeed(true)), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  await owner.ready()
  const add = Error("Synthetic partial registration"), remove = Error("Synthetic registration rollback failure")
  h.faults.addListener = add
  if (unconfirmed) h.faults.removeListener = remove
  await owner.startSync()
  expect(h.results).toEqual([{ kind: "rejected", error: add }])
  if (unconfirmed) {
    await expect(owner.dispose()).rejects.toBe(remove)
    expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  } else {
    await owner.dispose()
    expect(h.listeners.size).toBe(0)
    const replacement = createBrowserStartingLocalFilterWriter(h.native, h.options)
    try { expect(await replacement.ready()).toBe("ok") } finally { await replacement.dispose() }
  }
  const before = { ...h.counts }
  h.fireLate()
  expect(h.counts).toEqual(before)
})

test("failed timer cancellation retains exclusion and makes a late timer inert", async () => {
  const h = startingOwnerFixture(agreedSeed(true)), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  await owner.ready()
  h.mutate(records => { records["doc:settings"] = { v: 1, gen: "settings-1", at: 2, by: "starting-fixture", data: { theme: "dark" } } })
  await owner.startSync()
  expect(h.timers.some(timer => !timer.cancelled)).toBe(true)
  const marker = Error("Synthetic timer cancellation failure")
  h.faults.cancelTimer = marker
  const disposal = owner.dispose()
  await expect(disposal).rejects.toBe(marker)
  expect(owner.dispose()).toBe(disposal)
  expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  const before = { ...h.counts }
  h.fireLate()
  expect(h.counts).toEqual(before)
})

test("unconfirmed listener teardown preserves its rejection and excludes replacement owners", async () => {
  const h = startingOwnerFixture(agreedSeed(true)), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  await owner.ready(); await owner.startSync()
  const marker = Error("Synthetic listener removal failure")
  h.faults.removeListener = marker
  const first = owner.dispose()
  await expect(first).rejects.toBe(marker)
  expect(owner.dispose()).toBe(first)
  expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  expect(() => createBrowserLocalFilterWriter(h.native, { onSyncResult() {} })).toThrow("Local storage already owned")
  const before = { ...h.counts }, results = h.results.length
  h.fireLate()
  await expect(owner.startSync()).rejects.toBe(marker)
  expect(h.counts).toEqual(before)
  expect(h.results).toHaveLength(results)
})

test("late native sync answers drain without timers, writes or automatic callbacks after disposal", async () => {
  const h = startingOwnerFixture(agreedSeed(true)), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  await owner.ready()
  const hold = gate()
  h.hooks.syncRead = hold.wait
  const starting = owner.startSync()
  await hold.entered
  const disposal = owner.dispose(), before = h.counts.localSet
  expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  hold.release()
  await starting; await disposal
  expect(h.counts.localSet).toBe(before)
  expect(h.counts.syncSet).toBe(0)
  expect(h.results).toEqual([])
  expect(h.listeners.size).toBe(0)
  expect(h.timers.every(timer => timer.cancelled)).toBe(true)
})

test("disposal during pending startup drains before releasing the area and cannot revive it", async () => {
  const h = startingOwnerFixture(), hold = gate()
  h.hooks.localRead = hold.wait
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  await hold.entered
  const readiness = owner.ready().catch((error: unknown) => error)
  let drained = false
  const disposal = owner.dispose()
  void disposal.then(() => { drained = true })
  expect(drained).toBe(false)
  expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  hold.release()
  const failed = await readiness
  check(failed instanceof StartupReadinessError, "late startup keeps structured disposal")
  expect(failed.result).toEqual({ kind: "disposed" })
  await disposal
  expect(drained).toBe(true)
  expect(h.counts.localSet).toBe(0)
  expect(await owner.session.read()).toEqual({ kind: "unavailable", reason: "disposed" })
  const replacement = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try { expect(await replacement.ready()).toBe("ok") } finally { await replacement.dispose() }
})

test("late native session answers cannot commit or release an area before disposal drains", async () => {
  const h = startingOwnerFixture(agreedSeed()), owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  await owner.ready()
  const read = await owner.session.read()
  check(read.kind === "memory", "canonical session available")
  const hold = gate()
  h.hooks.sessionRead = hold.wait
  const write = owner.session.change({ revision: read.revision, now: 200, edits: [{ kind: "pause", paused: true }] })
  await hold.entered
  const disposal = owner.dispose()
  expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  hold.release()
  expect(await write).toEqual({ kind: "unavailable", reason: "disposed" })
  await disposal
  expect(h.sessionBatches).toEqual([])
  expect(h.counts.rawLocal).toBe(0)
})

test("the actual authenticated receiver consumes the starting facade without result adapters", async () => {
  const result = await runStartingOwnerConsumer()
  expect(result.initialReadiness).toBe("pending")
  expect(result.heldStartup).toBe(true)
  expect(result.confirmedChoice).toBe(true)
  expect(result.sessionPersisted).toBe(true)
  expect(result.duplicateRefused).toBe(true)
  expect(result.teardown).toBe(true)
})


test("complete facade commits real auto-add choices and shares the canonical session lane", async () => {
  const h = startingOwnerFixture(seed({ autoAdd: [] }))
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(await owner.ready()).toBe("ok")
    const first = captured(await owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    expect(first.fact).toEqual({ kind: "absent" })
    expect((await owner.changeAutoAddChoice(ui, change(first, { kind: "auto-add", expected: false, chosen: true }))).kind).toBe("committed")
    const setup = await owner.readSetup(acct)
    check(setup.kind === "value" && setup.view.kind === "live", "real auto-add setup persisted")
    expect(setup.view.setup.autoAdd).toEqual([{ pl: one, takes: "videos" }])
    const current = captured(await owner.readAutoAddChoice(ui, { kind: "auto-add-read", acct, playlist: one }))
    expect(current.fact).toEqual({ kind: "selected", takes: "videos", pct: null })
    const session = await owner.session.read()
    check(session.kind === "memory", "canonical session available through alias")
    expect((await owner.changeSession({ revision: session.revision, now: 200, edits: [{ kind: "pause", paused: true }] })).kind).toBe("committed")
    const paused = await owner.session.read()
    check(paused.kind === "memory", "same owner session reread")
    expect(paused.memory.paused).toBe(true)
    expect(h.session().paused).toBe(true)
    expect(h.sessionBatches).toEqual([{ paused: true }])
    expect(h.counts.rawLocal).toBe(0)
  } finally { await owner.dispose() }
})

test("disposal before readiness observation drains startup and repeated calls share one result", async () => {
  const h = startingOwnerFixture()
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  const readiness = owner.ready().catch((error: unknown) => error)
  const first = owner.dispose()
  expect(owner.dispose()).toBe(first)
  await first
  expect(await readiness).toEqual(new Error("Starting owner disposal requested"))
  expect(h.counts.localSet).toBe(0)
  expect(h.listeners.size).toBe(0)
  const replacement = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try { expect(await replacement.ready()).toBe("ok") } finally { await replacement.dispose() }
})

test("supplied local collaborators do not prove native-area correspondence", async () => {
  const first = startingOwnerFixture(agreedSeed()), second = startingOwnerFixture(agreedSeed())
  const owner = createBrowserStartingLocalFilterWriter(first.native, second.options)
  try {
    expect(await owner.ready()).toBe("ok")
    expect(second.counts.localRead).toBeGreaterThan(0)
    expect(first.counts.localRead).toBe(0)
    expect(() => createBrowserStartingLocalFilterWriter(first.native, first.options)).toThrow("Local storage already owned")
  } finally { await owner.dispose() }
})

function removalSeed() {
  const removed = "AAAAAAAAAAAAAAAA", kept = "BBBBBBBBBBBBBBBB"
  check(isAccountKey(removed) && isAccountKey(kept), "validated removal accounts")
  const stamp = { v: 1, at: 1, by: "starting-fixture" }
  const records: JsonObject = {
    ...agreedSeed(),
    [`doc:setup:${removed}`]: { ...stamp, gen: "setup-removed", data: { label: { name: "Removed account" }, quickSave: "PL_quick" } },
    [`doc:filter:${removed}:PL_quick`]: { ...stamp, gen: "filter-removed", data: { mode: "allow", on: true, channels: [] } },
    [`doc:setup:${kept}`]: { ...stamp, gen: "setup-kept", data: { quickSave: "PL_other" } },
    [`cache:${removed}`]: { playlists: [] }, [`cache:${kept}`]: { playlists: [] },
    [`progress:${removed}:0`]: { aaaaaaaaaaa: { len: 60, parts: [[1, 2]], at: 1 } },
    [`progress:${removed}:3`]: { aaaaaaaaaaa: { len: 60, parts: [[1, 2]], at: 1 } },
    [`progress:${kept}:0`]: { kept: true }, unrelated: { kept: true }
  }
  const session = { paused: true, [`skips:${removed}`]: { aaaaaaaaaaa: "all" }, [`cooldown:${removed}`]: 10, [`skips:${kept}`]: { bbbbbbbbbbb: "all" },
    tabs: { "1": { site: "www", signedIn: true, acct: removed }, "2": { site: "www", signedIn: true, acct: kept } } }
  const expected: JsonObject = { ...records }
  for (const name of [`doc:setup:${removed}`, `doc:filter:${removed}:PL_quick`, `cache:${removed}`, `progress:${removed}:0`, `progress:${removed}:3`]) delete expected[name]
  return { removed, records, session, expected: { local: expected,
    session: { paused: true, [`skips:${kept}`]: { bbbbbbbbbbb: "all" }, tabs: { "2": { site: "www", signedIn: true, acct: kept } } } } }
}

test("native owner removes an account through native local removal and the canonical session", async () => {
  const seeded = removalSeed(), h = startingOwnerFixture(seeded.records)
  h.seedSession(seeded.session)
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(await owner.ready()).toBe("ok")
    const preparation = await owner.prepareAccountRemoval(ui, seeded.removed)
    if (preparation.kind !== "confirmation-required") throw Error(`Expected native removal confirmation, got ${JSON.stringify(preparation)}`)
    expect(preparation.scope).toEqual({ kind: "this-browser" })
    expect(await owner.removeAccountSetup(ui, preparation.confirmation)).toEqual({ kind: "committed" })
    const { sync: _sync, ...local } = h.records()
    const { sync: _expectedSync, ...expectedLocal } = seeded.expected.local
    expect(local).toEqual(expectedLocal)
    expect(h.session()).toEqual(seeded.expected.session)
    expect(h.localRemovals.flat().sort()).toEqual([`cache:${seeded.removed}`, `doc:filter:${seeded.removed}:PL_quick`, `doc:setup:${seeded.removed}`,
      "pending:account-removal", `progress:${seeded.removed}:0`, `progress:${seeded.removed}:3`])
    expect(h.counts.rawLocal).toBe(0)
  } finally { await owner.dispose() }
})

test("a fresh native owner finishes an interrupted native account removal before readiness", async () => {
  const seeded = removalSeed(), h = startingOwnerFixture(seeded.records)
  h.seedSession(seeded.session)
  const interruption = Error("Synthetic native removal interruption")
  h.hooks.localRemove = async names => { if (names.includes(`progress:${seeded.removed}:3`)) throw interruption }
  const owner = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    await owner.ready()
    const preparation = await owner.prepareAccountRemoval(ui, seeded.removed)
    if (preparation.kind !== "confirmation-required") throw Error("Expected native removal confirmation")
    expect(await owner.removeAccountSetup(ui, preparation.confirmation)).toEqual({ kind: "failed", stage: "local-cleanup", error: interruption })
    expect(Object.hasOwn(h.records(), "pending:account-removal")).toBe(true)
    expect(h.records()[`progress:${seeded.removed}:3`]).toEqual(seeded.records[`progress:${seeded.removed}:3`])
  } finally { await owner.dispose() }
  h.hooks.localRemove = async () => {}
  const restarted = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(await restarted.ready()).toBe("ok")
    const { sync: _sync, ...local } = h.records()
    const { sync: _expectedSync, ...expectedLocal } = seeded.expected.local
    expect(local).toEqual(expectedLocal)
    expect(h.session()).toEqual(seeded.expected.session)
    expect(await restarted.readSetup(seeded.removed)).toEqual({ kind: "value", view: { kind: "none", acct: seeded.removed } })
  } finally { await restarted.dispose() }
})
