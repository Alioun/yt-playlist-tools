import { describe, expect, test } from "bun:test"
import {
  defaultDevice, defaultSettings, defaultSetup, isAccountKey, isPlaylistId, type Unclaimed
} from "../../shared/model"
import type { JsonValue } from "../../shared/contracts/json"
import type { ClaimAuthority, ClaimAuthorityState, ClaimOwnership } from "./local-claim-writer"
import { createLocalFilterWriter } from "./local-filter-writer"

const acct = "synthetic_acct01"
const owned = (() => { const value = "PLowned"; if (!isPlaylistId(value)) throw new Error("Invalid synthetic playlist"); return value })()
if (!isAccountKey(acct) || !isPlaylistId(owned)) throw new Error("Invalid synthetic IDs")
const active: ClaimAuthority = { acct, lease: "lease", browserSession: "session", consentGeneration: "consent", signedIn: true, incognito: false }
const source: Unclaimed = { from: "1.5.0", autoAdd: [owned, "PLdrop", "PLdrop"], shortcutPlaylist: owned,
  originalShortcutId: "orig01", filters: { [owned]: { mode: "allow", on: false, channels: [] } }, at: 1 }
const notice = { acct, dropped: 1, claim: { autoAddAdded: 1, filtersAdded: 1, shortcut: { kind: "filled" as const, shortcut: "orig01" } } }
const envelope = (data: unknown) => ({ v: 1, gen: "old", at: 1, by: "fixture", extension: "keep", data })
function host() {
  const settings = defaultSettings()
  settings.shortcuts.list = [{ id: "orig01", key: null, label: "Renamed", watchLaterOnEveryAccount: true }]
  let records: Record<string, unknown> = { schema: 1,
    device: { ...defaultDevice("fixture"), consent: { v: 1, at: 1 }, extension: "keep" },
    "doc:settings": envelope(settings), unclaimed: source,
    sync: { joined: "history", pushed: {}, status: "off", editedSinceOff: false, extension: "keep" } }
  let authority: ClaimAuthorityState = { kind: "ready", authority: active }
  let ownership: ClaimOwnership = { kind: "fixture-owned", authority: active, lineage: "local-migration-only", ownedPlaylistIds: new Set([owned]) }
  const ledger = new Set<string>(), batches: Readonly<Record<string, JsonValue>>[] = []
  let reads = 0, lookups = 0, generations = 0, authorityReads = 0
  const hooks = {
    read: async (_count: number) => {}, authority: async (_count: number) => {},
    lookup: async () => {}, take: async () => {},
    set: async (items: Readonly<Record<string, JsonValue>>) => { records = { ...records, ...items } }
  }
  const deps = {
    local: { async get() { await hooks.read(++reads); return structuredClone(records) },
      async set(items: Readonly<Record<string, JsonValue>>) { batches.push(structuredClone(items)); await hooks.set(items) } },
    claim: { kind: "fixture" as const,
      authority: { async read() { await hooks.authority(++authorityReads); return authority } },
      session: { async takeLookup(a: ClaimAuthority) {
        const key = `${a.acct}:${a.browserSession}`
        if (ledger.has(key)) return false
        ledger.add(key); await hooks.take(); return true
      } },
      ownership: { async lookup() { lookups++; await hooks.lookup(); return ownership } }
    },
    sync: { async get() { throw Error("Forbidden claim sync") }, async set() { throw Error("Forbidden claim sync") }, subscribe() { throw Error("Forbidden claim subscribe") } },
    syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Forbidden claim timer") } },
    onSyncResult() {},
    now: () => 100, generation: () => `new-${++generations}`
  }
  return { deps, hooks, batches, writer: () => createLocalFilterWriter(deps),
    get records() { return records }, set records(value) { records = value },
    set authority(value: ClaimAuthorityState) { authority = value },
    set ownership(value: ClaimOwnership) { ownership = value },
    get stats() { return { reads, lookups, generations } } }
}

describe("exclusive fixture claim transaction", () => {
  test("one literal atomic batch, serialized restart and exact saved notice", async () => {
    const h = host(), writer = h.writer()
    expect(await writer.claim()).toEqual({ kind: "committed", notice, write: { kind: "resolved" } })
    expect(h.batches).toEqual([{
      device: { ...defaultDevice("fixture"), consent: { v: 1, at: 1 }, extension: "keep", claimNotice: notice }, unclaimed: null,
      [`doc:setup:${acct}`]: { v: 1, gen: "new-1", at: 100, by: "fixture", data: {
        label: null, autoAdd: [{ pl: owned, takes: "videos" }], targets: { orig01: owned },
        quickSave: null, musicSave: null, gather: null, marks: {} } },
      [`doc:filter:${acct}:${owned}`]: { v: 1, gen: "new-2", at: 100, by: "fixture", data: { mode: "allow", on: false, channels: [] } },
      sync: { joined: "history", pushed: {}, status: "off", editedSinceOff: true, everEdited: true, extension: "keep" }
    }])
    await writer.dispose()
    h.records = JSON.parse(JSON.stringify(h.records))
    const restarted = h.writer()
    expect(await restarted.claim()).toEqual({ kind: "consumed" })
    expect(h.stats).toEqual({ reads: 4, lookups: 1, generations: 2 })
    expect(h.batches).toHaveLength(1)
    expect(h.records.device).toEqual(h.batches[0]?.device)
    await restarted.dispose()
  })
  test.each(["absent", "consumed", "empty-source"] as const)("%s never looks up", async kind => {
    const h = host()
    if (kind === "absent") delete h.records.unclaimed
    else h.records.unclaimed = kind === "consumed" ? null : { ...source, autoAdd: [], shortcutPlaylist: null, filters: {} }
    const writer = h.writer(); expect(await writer.claim()).toEqual({ kind }); await writer.dispose()
    expect(h.stats.lookups).toBe(0); expect(h.batches).toEqual([])
  })
  test.each(["authority", "consent", "sync-on", "schema", "interim", "notice", "orphan", "tombstone", "future", "invalid-source", "sync"])("refuses %s before lookup", async which => {
    const h = host(), device = { ...defaultDevice("fixture"), consent: { v: 1, at: 1 } }
    if (which === "authority") h.authority = { kind: "unavailable" }
    if (which === "consent") h.records.device = { ...device, consent: null }
    if (which === "sync-on") h.records.device = { ...device, syncOn: true }
    if (which === "schema") h.records.schema = 2
    if (which === "interim") h.records.legacyClaimed = false
    if (which === "notice") h.records.device = { ...device, claimNotice: { acct, dropped: 0 } }
    if (which === "orphan") h.records[`doc:filter:${acct}:${owned}`] = envelope({ mode: "allow", on: false, channels: [] })
    if (which === "tombstone") h.records[`doc:setup:${acct}`] = { v: 1, gen: "old", at: 1, by: "fixture", deleted: true }
    if (which === "future") h.records["doc:settings"] = { ...envelope(defaultSettings()), v: 2 }
    if (which === "invalid-source") h.records.unclaimed = { ...source, originalShortcutId: "bad" }
    if (which === "sync") h.records.sync = { status: "off" }
    const old = structuredClone(h.records), writer = h.writer(), result = await writer.claim()
    expect(["invalid", "unavailable"]).toContain(result.kind)
    expect(h.records).toEqual(old); expect(h.batches).toEqual([]); expect(h.stats.lookups).toBe(0)
    await writer.dispose()
  })
  test("no-match and failed lookup spend session budget across leases and recreation", async () => {
    for (const reject of [false, true]) {
      const h = host(); h.ownership = { kind: "fixture-owned", authority: active, lineage: "local-migration-only", ownedPlaylistIds: new Set() }
      if (reject) h.hooks.lookup = async () => { throw new Error("synthetic lookup rejection") }
      const first = h.writer(); expect((await first.claim()).kind).toBe(reject ? "failed" : "no-match"); await first.dispose()
      h.authority = { kind: "ready", authority: { ...active, lease: "another-tab" } }
      const second = h.writer(); expect(await second.claim()).toEqual({ kind: "unavailable", reason: "checked-this-session" }); await second.dispose()
      h.authority = { kind: "ready", authority: { ...active, browserSession: "new-session" } }
      const third = h.writer(); await third.claim(); await third.dispose(); expect(h.stats.lookups).toBe(2)
    }
  })
  test.each(["source", "settings", "filter", "device", "sync"])("raw %s extension/inventory change invalidates preflight", async which => {
    const h = host()
    h.hooks.lookup = async () => {
      if (which === "filter") h.records[`doc:filter:${acct}:PLnew`] = envelope({ mode: "allow", on: false, channels: [] })
      else {
        const key = which === "source" ? "unclaimed" : which === "settings" ? "doc:settings" : which
        const raw = h.records[key]; h.records[key] = { ...(typeof raw === "object" ? raw : {}), future: true }
      }
    }
    const writer = h.writer(); expect(await writer.claim()).toEqual({ kind: "unavailable", reason: "stale" }); await writer.dispose()
    expect(h.batches).toEqual([])
  })
  test.each([1, 2, 3, 4, 5, 6])("revocation at authority observation %s never commits", async count => {
    const h = host(); h.hooks.authority = async n => { if (n === count) h.authority = { kind: "unavailable" } }
    const writer = h.writer(); expect((await writer.claim()).kind).toBe("unavailable"); await writer.dispose(); expect(h.batches).toEqual([])
  })
  test.each(["none", "complete", "partial", "newer", "authority", "read-failed", "resolved-bad"])("uncertain set %s has truthful outcome", async mode => {
    const h = host(), error = new Error("synthetic lost reply"), old = structuredClone(h.records)
    h.hooks.set = async items => {
      if (mode === "complete" || mode === "newer" || mode === "authority" || mode === "read-failed") h.records = { ...h.records, ...items }
      if (mode === "partial") h.records.unclaimed = null
      if (mode === "newer") h.records.unrelated = "arrived"
      if (mode === "authority") h.authority = { kind: "unavailable" }
      if (mode === "read-failed") h.hooks.read = async () => { throw error }
      if (mode !== "resolved-bad") throw error
    }
    const writer = h.writer(), queued = writer.claim(), next = writer.claim(), result = await queued
    if (mode === "complete") expect(result).toEqual({ kind: "committed", notice, write: { kind: "rejected", error } })
    else if (mode === "none") { expect(result).toEqual({ kind: "failed", stage: "set-not-observed", error }); expect(h.records).toEqual(old) }
    else {
      expect(result.kind).toBe("unconfirmed")
      expect(await next).toEqual({ kind: "unavailable", reason: "stale" })
      const stats = h.stats
      expect(await writer.claim()).toEqual({ kind: "unavailable", reason: "stale" }); expect(h.stats).toEqual(stats)
    }
    await next; expect(h.batches).toHaveLength(1); await writer.dispose()
  })
  test("disposal closes admission immediately and drains accepted work", async () => {
    const h = host(); let release = () => {}; const paused = new Promise<void>(resolve => { release = resolve })
    h.hooks.lookup = () => paused
    const writer = h.writer(), accepted = writer.claim(), disposed = writer.dispose()
    await expect(writer.claim()).rejects.toThrow("Writer disposed")
    release(); expect((await accepted).kind).toBe("committed"); await disposed
    await expect(writer.claim()).rejects.toThrow("Writer disposed")
  })
  test("semantic removal is refused without partial effects", async () => {
    const h = host(); h.records.unclaimed = { ...source, autoAdd: [], filters: {}, originalShortcutId: "gone01" }
    h.records[`doc:setup:${acct}`] = envelope(defaultSetup())
    const writer = h.writer(); expect(await writer.claim()).toEqual({ kind: "unavailable", reason: "removal-required" }); await writer.dispose()
    expect(h.batches).toEqual([]); expect(h.records.unclaimed).not.toBeNull()
  })
})

describe("claim boundaries during awaited work", () => {
  test.each(["take", "lookup", "read"] as const)("authority loss during %s is stale before invocation", async stage => {
    const h = host(), revoke = async () => { h.authority = { kind: "unavailable" } }
    if (stage === "take") h.hooks.take = revoke
    if (stage === "lookup") h.hooks.lookup = revoke
    if (stage === "read") h.hooks.read = async count => { if (count === 2) await revoke() }
    const writer = h.writer(); expect(await writer.claim()).toEqual({ kind: "unavailable", reason: "stale" }); await writer.dispose()
    expect(h.batches).toEqual([])
  })
  test("a newer source arriving during readback survives the old continuation", async () => {
    const h = host(), newer = { ...source, at: 200, extension: "newer" }
    h.hooks.read = async count => { if (count === 3) h.records.unclaimed = newer }
    const writer = h.writer(); expect(await writer.claim()).toEqual({ kind: "unconfirmed", write: { kind: "resolved" }, cause: { kind: "readback" } })
    await writer.dispose(); expect(h.records.unclaimed).toEqual(newer); expect(h.batches).toHaveLength(1)
  })
  test("unsafe data descriptors refuse without invoking a getter", async () => {
    const h = host(); let calls = 0
    const raw = { ...h.records }
    Object.defineProperty(raw, "device", { enumerable: true, get() { calls++; throw new Error("getter invoked") } })
    const writer = createLocalFilterWriter({ ...h.deps, local: { get: async () => raw, set: h.deps.local.set } })
    expect(await writer.claim()).toEqual({ kind: "invalid", field: "snapshot" }); expect(calls).toBe(0); expect(h.batches).toEqual([])
    await writer.dispose()
  })
  test("raw existing envelope extensions and tuples survive while changed Setup is stamped once", async () => {
    const h = host()
    const setup = { ...defaultSetup(), autoAdd: [{ pl: owned, takes: "shorts", pct: 0 }], targets: {},
      marks: { WL: "full" }, extension: { retained: true } }
    const filter = { ...envelope({ mode: "deny", on: true, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "T".repeat(120), null, { future: true }]], extension: "raw" }), extension: { raw: true } }
    h.records[`doc:setup:${acct}`] = { ...envelope(setup), toJSON: "inert", ...JSON.parse('{"__proto__":{"own":true}}') }
    h.records[`doc:filter:${acct}:${owned}`] = filter
    const writer = h.writer(), result = await writer.claim(); expect(result.kind).toBe("committed"); await writer.dispose()
    expect(h.batches).toHaveLength(1)
    const batch = h.batches[0]
    expect(batch).not.toHaveProperty(`doc:filter:${acct}:${owned}`)
    expect(h.records[`doc:filter:${acct}:${owned}`]).toEqual(filter)
    expect(batch?.[`doc:setup:${acct}`]).toEqual({ ...envelope({ ...setup, targets: { orig01: owned }, marks: {} }),
      gen: "new-1", at: 100, toJSON: "inert", ...JSON.parse('{"__proto__":{"own":true}}') })
    expect(h.stats.generations).toBe(1)
  })
})

test.each(["missing-filter-id", "extra-setup-segment", "invalid-filter", "newer-filter", "deleted-filter"])("complete inventory refuses %s", async kind => {
  const h = host()
  h.records[`doc:setup:${acct}`] = envelope({ ...defaultSetup(), quickSave: owned })
  const filter = envelope({ mode: "deny", on: false, channels: [] })
  if (kind === "missing-filter-id") h.records[`doc:filter:${acct}`] = filter
  else if (kind === "extra-setup-segment") h.records[`doc:setup:${acct}:extra`] = envelope(defaultSetup())
  else h.records[`doc:filter:${acct}:${owned}`] = kind === "invalid-filter" ? envelope({ mode: "other" })
    : kind === "newer-filter" ? { ...filter, v: 2 } : { v: 1, gen: "old", at: 1, by: "fixture", deleted: true }
  const writer = h.writer(), old = structuredClone(h.records), result = await writer.claim()
  expect(["unavailable", "invalid"]).toContain(result.kind); expect(h.records).toEqual(old)
  expect(h.stats.lookups).toBe(0); expect(h.batches).toEqual([]); await writer.dispose()
})

test.each(["now", "generation"] as const)("injected %s failure occurs before set and preserves spent session lookup", async stage => {
  const h = host(), error = new Error("synthetic stamp failure")
  h.deps[stage] = () => { throw error }
  const writer = h.writer()
  expect(await writer.claim()).toEqual({ kind: "failed", stage: "before-set", error })
  expect(await writer.claim()).toEqual({ kind: "unavailable", reason: "checked-this-session" })
  expect(h.records.unclaimed).toEqual(source); expect(h.batches).toEqual([]); await writer.dispose()
})
