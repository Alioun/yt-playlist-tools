import { expect, test } from "bun:test"
import { createStartingLocalFilterWriter, createLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import { isAccountKey, isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model"
import type { JsonValue } from "../../shared/contracts/json"
import { isInterimSourceKey, isInterimCanonicalKey, type StoreStartupHost } from "./interim-persistence"

export async function readinessAcceptance(api: {
  create: typeof createStartingLocalFilterWriter; preinitialized: typeof createLocalFilterWriter; Error: typeof StartupReadinessError
}, acct: AccountKey, playlist: PlaylistId) {
  let checks = 0
  const observations: unknown[] = []
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  function equal(actual: unknown, expected: unknown, label: string) { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(label) }
  function check(value: unknown, label: string): asserts value { checks++; if (!value) throw Error(label) }
  function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
  async function turns() { for (let i = 0; i < 40; i++) await Promise.resolve() }
  const device = { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, upgradeNote: null, claimNotice: null,
    lastAccount: null, newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: true, extension: [null] }
  const seed = () => ({ schema: 1, device, unclaimed: null, "doc:settings": { v: 1, gen: "settings", at: 1, by: "old", data: {} },
    [`doc:setup:${acct}`]: { v: 1, gen: "setup", at: 1, by: "old", data: { autoAdd: [{ pl: playlist, takes: "videos" }] } },
    [`doc:filter:${acct}:${playlist}`]: { v: 1, gen: "filter", at: 1, by: "old", data: { mode: "deny", on: true, channels: [] } },
    sync: { joined: "history", pushed: {}, status: "off", editedSinceOff: false, extension: { keep: true },
      opaqueWrite: { gate: { kind: "held", notBefore: 1060000, extension: "gate" }, diagnostic: { name: "Original", message: "opaque", extension: "diagnostic" } } } })
  function harness(initial: Record<string, unknown> = seed()) {
    let records = copy(initial)
    const effects: unknown[] = []
    let mono = 0, wall = 1000000
    let read: (() => Promise<void>) | undefined
    let failure: unknown
    let db = async () => {}, session = async () => {}
    let partialSet = false
    let allowLookup = false
    let syncSets = 0
    let remote: Record<string, unknown> = { "s:meta": { v: 1, id: "history", created: 0 } }
    const authority = { acct, lease: "lease", browserSession: "session", consentGeneration: "consent", signedIn: true, incognito: false } as const
    const startup: StoreStartupHost = {
      context: { deviceId: "fixture", settingsGen: "migration", at: 1, shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] },
      async readInterimSnapshot() {
        effects.push("interim-snapshot"); if (read) await read(); if (failure) throw failure
        const saved = copy(records)
        return { source: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimSourceKey(key))),
          canonical: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimCanonicalKey(key))),
          checkpoint: Object.hasOwn(saved, "interimConversion") ? { kind: "present" as const, value: saved.interimConversion } : { kind: "absent" as const },
          historicalAuthorization: { kind: "unknown" as const }, priorCredentialPresence: { kind: "unknown" as const } }
      },
      async readSnapshot() {
        effects.push("snapshot"); if (read) await read(); if (failure) throw failure
        const saved = copy(records)
        return { schema: saved.schema, device: saved.device, settingsDocument: saved["doc:settings"], unclaimed: saved.unclaimed,
          legacy: { presentKeys: Object.hasOwn(saved, "playlists") ? ["playlists"] : [], values: Object.hasOwn(saved, "playlists") ? { playlists: saved.playlists } : {}, refreshTokenWasNonempty: false },
          interimKeysPresent: Object.hasOwn(saved, "sessionConsent") ? ["sessionConsent"] : [] }
      },
      async removeLocal(keys) { effects.push({ remove: keys }); for (const key of keys) delete records[key] },
      async deleteDatabase() { effects.push("database"); await db(); effects.push("database-done") },
      async removeSession() { effects.push("session"); await session(); effects.push("session-done") }
    }
    const deps = { startup,
      local: { async get() { effects.push("local-get"); return copy(records) }, async set(items: Readonly<Record<string, JsonValue>>) { effects.push({ set: copy(items) }); records = { ...records, ...copy(partialSet ? { device: items.device } : items) } } },
      claim: { kind: "fixture" as const, authority: { async read() { effects.push("authority"); return { kind: "ready" as const, authority } } },
        session: { async takeLookup() { effects.push("lookup-budget"); return true } },
        ownership: { async lookup() {
          if (!allowLookup) throw Error("Consumed null performed ownership lookup")
          return { kind: "fixture-owned" as const, authority, lineage: "local-migration-only" as const, ownedPlaylistIds: new Set([playlist]) }
        } } },
      sync: { async get() { effects.push("sync-get"); return copy(remote) },
        async set(items: Readonly<Record<string, JsonValue>>) { effects.push("sync-set"); syncSets++; remote = { ...remote, ...copy(items) } }, subscribe() { effects.push("subscribe"); return () => { effects.push("unsubscribe") } } },
      syncClock: { now() { effects.push("mono"); return mono }, wallNow() { effects.push("wall"); return wall }, after() { effects.push("timer"); return () => {} } },
      now() { effects.push("stamp"); return 100 }, generation() { effects.push("generation"); return "new-generation" }, onSyncResult(result: unknown) { effects.push({ automatic: result }) }
    }
    return { deps, effects, records: () => copy(records), holdRead(fn: typeof read) { read = fn }, fail(error: unknown) { failure = error },
      database(fn: typeof db) { db = fn }, session(fn: typeof session) { session = fn }, time(m: number, w: number) { mono = m; wall = w }, syncSets: () => syncSets, uncertainClaim() { partialSet = true; allowLookup = true } }
  }
  const change = { acct, playlist, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" } as const
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  async function closed(writer: ReturnType<typeof api.create>, h: ReturnType<typeof harness>, newer = false) {
    const before = copy(h.effects)
    equal(await writer.claim(), { kind: "unavailable", reason: "startup" }, "closed claim")
    equal(await writer.change(origin, change), { kind: "unavailable", reason: newer ? "newer-layout" : "startup" }, "closed edit")
    equal(await writer.receiveSyncDocument({ kind: "settings" }), { kind: "unavailable", reason: "authority" }, "closed receive")
    equal(await writer.flushSync(), { kind: "unavailable" }, "closed flush")
    await writer.startSync()
    equal(h.effects, before, "closed operations have zero dependency effects or grants")
  }
  {
    const complete = { ...seed(), device: { ...device,
      upgradeNote: { state: "done", opened: true, seen: true, reopened: false,
        details: { from: "1.4.5", autoAdd: { kept: 0, dropped: 0 }, pct: { value: 50, wasUnset: true, authorised: false },
          feedback: false, shortcut: { raw: "", key: null, playlist: false, note: "none" }, credentialsDeleted: false } },
      claimNotice: { acct, dropped: 0, extension: ["exact-notice"] }
    } }
    const h = harness(complete), gate = deferred(); h.holdRead(() => gate.promise)
    const writer = api.create(h.deps)
    check(writer.ready() === writer.ready(), "stable ready promise")
    await turns(); await closed(writer, h)
    equal(h.effects, ["interim-snapshot"], "startup first lane only")
    gate.resolve(); equal(await writer.ready(), "ok", "current release")
    const before = h.records(); equal(await writer.claim(), { kind: "consumed" }, "null is consumed")
    equal(h.records(), before, "consumed notice raw state unchanged")
    check(!h.effects.includes("stamp") && !h.effects.includes("generation") && !h.effects.includes("lookup-budget") && !h.effects.some(item => item && typeof item === "object" && "set" in item), "completed note and consumed null do no lookup merge stamp or write")
    const result = await writer.change(origin, change)
    equal(result, { kind: "result", result: { ok: true } }, "same owner supports filter edit after ready")
    const saved = h.records()
    check(saved.unclaimed === null, "edit preserves consumed null")
    const sync = saved.sync
    check(sync && typeof sync === "object" && "editedSinceOff" in sync, "saved history")
    equal(sync, { ...seed().sync, editedSinceOff: true, everEdited: true }, "only existing history edit bit changes")
    equal(h.syncSets(), 0, "startup and claims create no sync write")
    await writer.dispose(); observations.push({ label: "current-consumed-edit", effects: h.effects, records: h.records() })
    const replacement = harness(JSON.parse(JSON.stringify(h.records()))), next = api.create(replacement.deps)
    equal(await next.ready(), "ok", "drained replacement ready"); equal(await next.claim(), { kind: "consumed" }, "serialized null remains consumed")
    equal(replacement.records(), h.records(), "restart notice state exact"); await next.dispose()
  }
  {
    const h = harness({ ...seed(), unclaimed: { from: "1.4.5", autoAdd: [playlist], shortcutPlaylist: null, filters: {}, at: 1 } })
    const writer = api.create(h.deps); equal(await writer.ready(), "ok", "pending claim canonical startup")
    h.uncertainClaim()
    equal((await writer.claim()).kind, "unconfirmed", "actual claim partial batch latches uncertainty")
    const before = copy(h.effects)
    equal(await writer.claim(), { kind: "unavailable", reason: "stale" }, "claim uncertainty remains global")
    equal(await writer.change(origin, change), { kind: "unavailable", reason: "stale" }, "uncertain owner refuses edit")
    equal(await writer.receiveSyncDocument({ kind: "settings" }), { kind: "unavailable", reason: "authority" }, "uncertain receive closed")
    equal(await writer.flushSync(), { kind: "unavailable" }, "uncertain flush closed")
    await writer.startSync(); equal(h.effects, before, "ready cannot revive uncertain owner")
    await writer.dispose(); observations.push({ label: "claim-uncertainty", effects: h.effects, records: h.records() })
  }
  for (const fault of ["read", "interim", "partial", "cleanup"]) {
    const h = harness(fault === "cleanup" ? { playlists: [] } : fault === "partial" ? { unclaimed: null } : fault === "interim" ? { sessionConsent: null } : seed())
    const original = Error("synthetic original")
    if (fault === "read") h.fail(original)
    if (fault === "cleanup") h.database(async () => { throw original })
    const writer = api.create(h.deps)
    let error: unknown
    try { await writer.ready() } catch (caught) { error = caught }
    check(error, "initialization failed")
    if (fault === "read" || fault === "cleanup") check(error === original, "original native error retained")
    else check(error instanceof api.Error, "structured readiness refusal")
    await closed(writer, h); await closed(writer, h)
    try { await writer.ready(); throw Error("failed owner revived") } catch (caught) { check(caught === error, "failure latched separately from lane") }
    await writer.dispose(); observations.push({ label: fault, effects: h.effects, records: h.records() })
  }
  {
    const h = harness({ schema: 2 }), writer = api.create(h.deps)
    equal(await writer.ready(), "newer-layout", "newer readiness"); await closed(writer, h, true)
    equal(h.effects, ["interim-snapshot"], "newer performs no clock or effects"); await writer.dispose()
  }
  for (const first of ["database", "session"]) {
    const h = harness({ playlists: [] }), db = deferred(), session = deferred()
    h.database(() => db.promise); h.session(() => session.promise)
    const writer = api.create(h.deps), ready = writer.ready()
    let released = false; void ready.then(() => { released = true }, () => {})
    await turns(); await closed(writer, h)
    const drain = writer.dispose(); let drained = false; void drain.then(() => { drained = true })
    if (first === "database") db.resolve(); else session.resolve()
    await turns(); equal(drained, false, "dispose drains both accepted cleanup effects"); equal(released, false, "disposed never releases early")
    if (first === "database") session.resolve(); else db.resolve()
    let error: unknown; try { await ready } catch (caught) { error = caught }
    check(error instanceof api.Error && error.result.kind === "disposed", "disposed startup rejects release")
    await drain; equal(released, false, "disposed never ready ok")
    equal(h.records().schema, 1, "accepted startup IO drains honestly")
    observations.push({ label: `dispose-${first}`, effects: h.effects, records: h.records() })
  }
  {
    const current = seed(); current.device = { ...device, syncOn: true }; current.sync = { ...current.sync, status: "ok" }
    const h = harness(current), gate = deferred(); h.holdRead(() => gate.promise)
    const writer = api.create(h.deps); await turns(); await closed(writer, h)
    h.time(70000, 1070000); gate.resolve(); equal(await writer.ready(), "ok", "held current startup")
    equal(h.records(), current, "startup preserves raw recovery bookkeeping")
    check(!h.effects.includes("subscribe") && !h.effects.includes("timer") && !h.effects.includes("sync-get"), "readiness grants no sync work")
    const held = await writer.flushSync(); equal(held.kind, "deferred", "first actual external event reconstructs fresh hold")
    equal(h.syncSets(), 0, "pre-readiness events cannot later retry")
    h.time(129999, 1129999); equal((await writer.flushSync()).kind, "deferred", "later early event still held")
    h.time(130000, 1130000); const attempt = await writer.flushSync()
    equal(h.syncSets(), 1, "one later eligible event admits current pass")
    equal(attempt.kind, "pushed", "later current pass confirms complete readback")
    await writer.dispose(); observations.push({ label: "recovery", effects: h.effects, records: h.records() })
  }
  const old = api.preinitialized(harness().deps)
  check(!("ready" in old), "old constructor retains API without fabricated readiness"); await old.dispose()
  return { checks, observations }
}

test("readiness belongs to the shared first-lane owner", async () => {
  const acct = "synthetic_acct01", playlist = "PLowned"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid synthetic brands")
  const result = await readinessAcceptance({ create: createStartingLocalFilterWriter, preinitialized: createLocalFilterWriter, Error: StartupReadinessError }, acct, playlist)
  expect(result.checks).toBeGreaterThan(100)
})

test("accepted account removal drains before readiness and closes every early owner operation", async () => {
  const { createRemovalHarness, removalFixture } = await import("../../../tools/fixtures/account-removal-execution/run")
  const h = createRemovalHarness(removalFixture(), { details: true }), origin = { kind: "ui", windowId: 1, incognito: false } as const
  const acct = "AAAAAAAAAAAAAAAA"
  if (!isAccountKey(acct)) throw Error("Invalid synthetic account")
  const original = createLocalFilterWriter(h.deps), prepared = await original.prepareAccountRemoval(origin, acct)
  if (prepared.kind !== "confirmation-required") throw Error("Missing explicit confirmation")
  expect(await original.removeAccountSetup(origin, prepared.confirmation)).toEqual({ kind: "committed" })
  const accepted = h.mutations[0]?.after
  if (!accepted) throw Error("Missing actual accepted state")
  await original.dispose()
  const resumed = createRemovalHarness(JSON.parse(JSON.stringify(accepted))), host = resumed.deps.removal
  if (host.kind !== "fixture") throw Error("Missing removal fixture")
  let enter = () => {}, release = () => {}
  const entered = new Promise<void>(resolve => { enter = resolve }), gate = new Promise<void>(resolve => { release = resolve })
  const owner = createStartingLocalFilterWriter({ ...resumed.deps, startup: resumed.startup, removal: { ...host, async removeLocal(keys) {
    if (keys.some(key => key.kind === "cache")) { enter(); await gate }
    await host.removeLocal(keys)
  } } })
  await entered
  expect(owner.ready()).toBe(owner.ready())
  const before = resumed.state(), mutations = [...resumed.mutations]
  expect(await owner.read("settings")).toEqual({ kind: "unavailable", reason: "startup" })
  expect(await owner.readClaimNotice()).toEqual({ kind: "unavailable", reason: "startup" })
  expect(await owner.prepareAccountRemoval(origin, acct)).toEqual({ kind: "unavailable", reason: "startup" })
  expect(await owner.claim()).toEqual({ kind: "unavailable", reason: "startup" })
  expect(await owner.receiveSyncDocument({ kind: "settings" })).toEqual({ kind: "unavailable", reason: "authority" })
  expect(await owner.flushSync()).toEqual({ kind: "unavailable" })
  await owner.startSync()
  expect(resumed.state()).toEqual(before)
  expect(resumed.mutations).toEqual(mutations)
  release()
  expect(await owner.ready()).toBe("ok")
  expect(resumed.state()).toEqual(h.state())
  expect(resumed.counts().generations).toBe(0)
  await owner.dispose()
})

test("retained canonical agreement never changes the stable rejected readiness promise", async () => {
  const { createInterimHarness } = await import("../../../tools/fixtures/interim-conversion/run")
  const h = createInterimHarness({ schema: 1, sessionConsent: 1 })
  const owner = createStartingLocalFilterWriter(h.deps), readiness = owner.ready()
  await expect(readiness).rejects.toBeInstanceOf(StartupReadinessError)
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const read = await owner.readAgreement(origin)
  if (read.kind !== "review") throw Error("No review")
  const result = await owner.agree(origin, { review: read.review, displayedVersion: read.version, choice: { kind: "retained-disclosure" }, access: Promise.resolve({ www: true, music: true, browserMenu: true }) })
  expect(result.kind).toBe("committed")
  expect(owner.ready()).toBe(readiness)
  await expect(readiness).rejects.toBeInstanceOf(StartupReadinessError)
  expect(await owner.read("settings")).toEqual({ kind: "unavailable", reason: "startup" })
  await owner.dispose()
})
