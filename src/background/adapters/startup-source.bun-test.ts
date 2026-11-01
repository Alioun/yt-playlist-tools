import { expect, test } from "bun:test"
import { createStoreStartupHost, projectInterimSnapshot, StartupSourceRefusal, type SanitizedStartupInventory, type StartupSourceRefusalCode } from "./startup-source"
import type { StoreStartupHost } from "../store/interim-persistence"
import { LEGACY_DELETE_KEYS } from "../store/legacy"
import { createStartingLocalFilterWriter, StartupReadinessError } from "../store/local-filter-writer"
import type { JsonObject, JsonValue } from "../../shared/contracts/json"
import { createInterimHarness, interimFixture, syntheticStartupInventory } from "../../../tools/fixtures/interim-conversion/run"

const context: StoreStartupHost["context"] = {
  deviceId: "source-fixture", settingsGen: "source-generation", at: 123,
  shortcutId: "orig01", platform: { browser: "chrome", os: "linux" },
  commands: []
}
const unknownFact = { kind: "unknown" } as const
const observedFalse = { kind: "observed", refreshTokenWasNonempty: false } as const
const noCleanup = {
  async removeLocal() { throw Error("unexpected-local-cleanup") },
  async deleteDatabase() { throw Error("unexpected-database-cleanup") },
  async removeSession() { throw Error("unexpected-session-cleanup") }
}
function host(readInventory: () => Promise<SanitizedStartupInventory>) {
  return createStoreStartupHost({ context, source: { readInventory }, cleanup: noCleanup })
}
function observation(values: Record<string, unknown>): SanitizedStartupInventory {
  return {
    presentLocalKeys: Object.keys(values), values,
    legacyAuthorization: observedFalse,
    historicalAuthorization: unknownFact, priorCredentialPresence: unknownFact
  }
}
async function refusal(read: Promise<unknown>): Promise<StartupSourceRefusalCode> {
  const error = await read.then(() => undefined, (caught: unknown) => caught)
  if (!(error instanceof StartupSourceRefusal)) throw Error("Expected a fixed source refusal")
  expect(error.message).toBe(`Startup source refused: ${error.code}`)
  return error.code
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
async function turns() { for (let i = 0; i < 40; i++) await Promise.resolve() }

function startingOwner(initial: Record<string, unknown>, authorization: (records: Record<string, unknown>) => SanitizedStartupInventory["legacyAuthorization"] = () => observedFalse) {
  let records: Record<string, unknown> = copy(initial)
  let database = async () => {}, session = async () => {}, beforeRead: (() => void) | undefined
  let shape = (inventory: SanitizedStartupInventory) => inventory
  const effects: unknown[] = [], batches: JsonObject[] = []
  const startup = createStoreStartupHost({ context,
    source: { async readInventory() {
      effects.push("inventory"); beforeRead?.()
      return shape(syntheticStartupInventory(copy(records), { legacyAuthorization: authorization(records), historicalAuthorization: unknownFact, priorCredentialPresence: unknownFact }))
    } },
    cleanup: {
      async removeLocal(keys) { effects.push({ removeLocal: [...keys] }); for (const key of keys) delete records[key] },
      async deleteDatabase(name) { effects.push({ deleteDatabase: name }); await database(); effects.push("database-done") },
      async removeSession(keys) { effects.push({ removeSession: [...keys] }); await session(); effects.push("session-done") }
    } })
  const deps = { startup,
    local: { async get(keys: readonly string[] | null) { effects.push("local-get"); return copy(keys === null ? records : Object.fromEntries(keys.filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]]))) },
      async set(items: Readonly<Record<string, JsonValue>>) { batches.push(copy(items)); effects.push({ set: Object.keys(items) }); records = { ...records, ...copy(items) } } },
    claim: { kind: "unavailable" as const }, removal: { kind: "unavailable" as const },
    sync: { async get() { effects.push("sync-get"); throw Error("Startup read sync") }, async set() { effects.push("sync-set"); throw Error("Startup wrote sync") }, subscribe() { effects.push("sync-subscribe"); throw Error("Startup subscribed") } },
    syncClock: { now() { return 0 }, wallNow() { return 1000000 }, after() { effects.push("timer"); throw Error("Startup scheduled work") } },
    now() { effects.push("stamp"); return 100 }, generation() { effects.push("generation"); return "never" }, onSyncResult(result: unknown) { effects.push({ automatic: result }) }
  }
  return { owner: createStartingLocalFilterWriter(deps), deps, effects, batches, records: () => copy(records),
    database(fn: typeof database) { database = fn }, session(fn: typeof session) { session = fn }, sample(fn: typeof beforeRead) { beforeRead = fn },
    inventory(fn: typeof shape) { shape = fn }, foreign(fn: (records: Record<string, unknown>) => void) { fn(records) } }
}
function noAmbientWork(effects: readonly unknown[]) {
  for (const effect of ["sync-get", "sync-set", "sync-subscribe", "timer", "stamp", "generation"]) expect(effects).not.toContain(effect)
}
function noCleanupEffects(effects: readonly unknown[]) {
  expect(effects.some(effect => typeof effect === "object" && effect !== null && ("removeLocal" in effect || "deleteDatabase" in effect || "removeSession" in effect))).toBe(false)
}
const released = { playlists: ["PLabcdefghijklmnop"], watchLaterShortcut: "k" }

test("retains unindexed malformed source and consumed null without aliasing", async () => {
  const values = {
    schema: 1, sessionConsent: 0, savedAccountKeys: [], legacyClaimed: true,
    "account:malformed suffix": { arbitrary: [false, null] },
    "doc:setup:AAAAAAAAAAAAAAAA": { v: 1, gen: "saved", at: 1, by: "other", deleted: true },
    unclaimed: null
  }
  const h = host(async () => observation(values))
  const first = await h.readInterimSnapshot()
  values["account:malformed suffix"].arbitrary.push(true)
  expect(first.source["account:malformed suffix"]).toEqual({ arbitrary: [false, null] })
  expect(first.canonical.unclaimed).toBeNull()
  expect(first.canonical["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual({
    v: 1, gen: "saved", at: 1, by: "other", deleted: true
  })
  expect(first.historicalAuthorization).toEqual(unknownFact)
  expect(first.priorCredentialPresence).toEqual(unknownFact)
  expect((await h.readInterimSnapshot()).source["account:malformed suffix"])
    .toEqual({ arbitrary: [false, null, true] })
})

test("never evaluates a forbidden credential property", async () => {
  let touched = 0
  const values = Object.defineProperty({}, "refreshToken", {
    enumerable: true, get() { touched++; throw Error("forbidden-property-read") }
  })
  const h = host(async () => ({ ...observation(values), presentLocalKeys: ["refreshToken"] }))
  await expect(h.readSnapshot()).rejects.toThrow()
  expect(await refusal(h.readInterimSnapshot())).toBe("forbidden-value")
  expect(touched).toBe(0)
})

test("keeps unknown original authorization unavailable", async () => {
  const h = host(async () => ({
    ...observation({ playlists: ["PLABCDEFGHIJKLMNOP"] }),
    legacyAuthorization: { kind: "unavailable" }
  }))
  await expect(h.readSnapshot()).rejects.toThrow()
  expect(await refusal(h.readSnapshot())).toBe("authorization-unavailable")
  expect((await h.readInterimSnapshot()).source).toEqual({ playlists: ["PLABCDEFGHIJKLMNOP"] })
})

test("credential names stay names and the complete inventory reaches both snapshots", async () => {
  const values = { ...released, schema: 1, cachedPlaylists: [], "doc:settings": { v: 1, gen: "g", at: 1, by: "d", data: {} }, interimConversion: { v: 9 } }
  const names = ["clientID", "refreshToken", "authMode", "sync", "pending:sync-join", ...Object.keys(values), "account:AAAAAAAAAAAAAAAA", "sessionGeneration"]
  const inventory = { ...observation({ ...values, "account:AAAAAAAAAAAAAAAA": { playlists: [] }, sessionGeneration: "" }), presentLocalKeys: names,
    legacyAuthorization: { kind: "observed", refreshTokenWasNonempty: true } } as const
  const h = host(async () => inventory)
  expect(await h.readSnapshot()).toEqual({ schema: 1, device: undefined, settingsDocument: values["doc:settings"], unclaimed: undefined,
    legacy: { presentKeys: ["playlists", "watchLaterShortcut", "clientID", "refreshToken", "authMode", "cachedPlaylists"], values: released, refreshTokenWasNonempty: true },
    interimKeysPresent: ["account:AAAAAAAAAAAAAAAA", "sessionGeneration"] })
  const interim = await h.readInterimSnapshot()
  expect(Object.keys(interim.source)).toEqual(["playlists", "watchLaterShortcut", "cachedPlaylists", "account:AAAAAAAAAAAAAAAA", "sessionGeneration"])
  expect(Object.keys(interim.canonical)).toEqual(["schema", "doc:settings"])
  expect(interim.checkpoint).toEqual({ kind: "present", value: { v: 9 } })
})

test("invalid structure, incomplete values and contradictions refuse with fixed value-free codes", async () => {
  let hooks = 0
  const getter = (target: object, key: string) => Object.defineProperty(target, key, { enumerable: true, get() { hooks++; throw Error("Getter executed") } })
  const base = observation({ schema: 1, "account:AAAAAAAAAAAAAAAA": { playlists: [] } })
  const { priorCredentialPresence: _, ...missingFact } = base
  const cycle: Record<string, unknown> = {}; cycle.self = cycle
  const cases: [string, unknown, StartupSourceRefusalCode][] = [
    ["null inventory", null, "structure"],
    ["array inventory", [], "structure"],
    ["missing fact", missingFact, "structure"],
    ["extra field", { ...base, refreshToken: true }, "structure"],
    ["inventory accessor", getter({ ...base, values: undefined }, "values"), "accessor"],
    ["listed names accessor", { ...base, presentLocalKeys: getter([], "0") }, "accessor"],
    ["sparse names", { ...base, presentLocalKeys: Object.assign(Array(2), { 0: "schema" }) }, "structure"],
    ["non-string name", { ...base, presentLocalKeys: ["schema", 1] }, "structure"],
    ["duplicate name", { ...base, presentLocalKeys: ["schema", "account:AAAAAAAAAAAAAAAA", "schema"] }, "duplicate-name"],
    ["unrelated value field", { ...base, values: { ...base.values, sync: {} }, presentLocalKeys: [...base.presentLocalKeys, "sync"] }, "forbidden-value"],
    ["credential value field", { ...base, values: { ...base.values, clientSecret: true }, presentLocalKeys: [...base.presentLocalKeys, "clientSecret"] }, "forbidden-value"],
    ["value claims absent name", { ...base, presentLocalKeys: ["schema"] }, "absent-name"],
    ["omitted unindexed account body", { ...base, values: { schema: 1 } }, "incomplete"],
    ["omitted tombstone", { ...base, presentLocalKeys: [...base.presentLocalKeys, "doc:setup:AAAAAAAAAAAAAAAA"] }, "incomplete"],
    ["value accessor", { ...base, values: getter({ schema: 1 }, "account:AAAAAAAAAAAAAAAA") }, "accessor"],
    ["nested accessor", { ...base, values: { schema: 1, "account:AAAAAAAAAAAAAAAA": getter({}, "playlists") } }, "accessor"],
    ["nested function", { ...base, values: { schema: 1, "account:AAAAAAAAAAAAAAAA": { hook() {} } } }, "structure"],
    ["nested Map", { ...base, values: { schema: 1, "account:AAAAAAAAAAAAAAAA": new Map() } }, "structure"],
    ["cycle", { ...base, values: { schema: 1, "account:AAAAAAAAAAAAAAAA": cycle } }, "structure"],
    ["symbol key", { ...base, values: { ...base.values, [Symbol("hidden")]: true } }, "structure"],
    ["non-enumerable value", { ...base, values: Object.defineProperty({ schema: 1 }, "account:AAAAAAAAAAAAAAAA", { value: {}, enumerable: false }) }, "structure"],
    ["boolean authorization", { ...base, legacyAuthorization: false }, "structure"],
    ["incomplete observed authorization", { ...base, legacyAuthorization: { kind: "observed" } }, "structure"],
    ["unavailable authorization claims a value", { ...base, legacyAuthorization: { kind: "unavailable", refreshTokenWasNonempty: false } }, "structure"],
    ["true authorization without the current name", { ...base, legacyAuthorization: { kind: "observed", refreshTokenWasNonempty: true } }, "authorization-contradiction"],
    ["malformed known fact", { ...base, historicalAuthorization: { kind: "known" } }, "structure"],
    ["unknown fact with value", { ...base, priorCredentialPresence: { kind: "unknown", value: false } }, "structure"],
    ["fact accessor", { ...base, historicalAuthorization: getter({}, "kind") }, "accessor"]
  ]
  for (const [, inventory, code] of cases) {
    const h = host(async () => inventory as SanitizedStartupInventory)
    expect(await refusal(h.readInterimSnapshot())).toBe(code)
    expect(await refusal(h.readSnapshot())).toBe(code)
    expect(() => projectInterimSnapshot(inventory as SanitizedStartupInventory)).toThrow(StartupSourceRefusal)
  }
  expect(hooks).toBe(0)
  const original = Error("synthetic source read")
  const failing = host(async () => { throw original })
  await expect(failing.readSnapshot()).rejects.toBe(original)
  await expect(failing.readInterimSnapshot()).rejects.toBe(original)
})

test("raw fidelity keeps sparse, extended, inert and own __proto__ data without normalizing", async () => {
  const proto = Object.defineProperty({ keep: [null, false] }, "__proto__", { value: { own: true }, enumerable: true, writable: true, configurable: true })
  const bare = Object.assign(Object.create(null), { keep: true })
  const device = { id: "sparse", future: { nested: [{}, []] }, toJSON: "inert" }
  const values: Record<string, unknown> = { "account:AAAAAAAAAAAAAAAA": { playlists: [], undefinedField: undefined, proto, bare }, device, unclaimed: null, legacyClaimed: false, savedAccountKeys: [], schema: 1 }
  const inventory = { ...observation(values), presentLocalKeys: ["schema", "unclaimed", "device", "legacyClaimed", "savedAccountKeys", "account:AAAAAAAAAAAAAAAA"] }
  const snapshot = await host(async () => inventory).readInterimSnapshot()
  expect(Object.keys(snapshot.canonical)).toEqual(["schema", "unclaimed", "device"])
  expect(Object.keys(snapshot.source)).toEqual(["legacyClaimed", "savedAccountKeys", "account:AAAAAAAAAAAAAAAA"])
  expect(snapshot.canonical).toStrictEqual({ schema: 1, unclaimed: null, device: { id: "sparse", future: { nested: [{}, []] }, toJSON: "inert" } })
  const account = snapshot.source["account:AAAAAAAAAAAAAAAA"] as Record<string, unknown>
  expect(Object.hasOwn(account, "undefinedField") && account.undefinedField === undefined).toBe(true)
  const savedProto = account.proto as Record<string, unknown>
  expect(Object.getPrototypeOf(savedProto)).toBe(Object.prototype)
  expect(Object.getOwnPropertyDescriptor(savedProto, "__proto__")?.value).toEqual({ own: true })
  expect(Object.getPrototypeOf(account.bare)).toBeNull()
  expect(savedProto).not.toBe(proto)
  expect(snapshot.source.legacyClaimed).toBe(false)
  expect(snapshot.source.savedAccountKeys).toEqual([])
  device.future.nested.push([])
  expect((snapshot.canonical.device as typeof device).future.nested).toHaveLength(2)
})

test("checkpoint presence distinguishes absent, null, undefined, current and newer receipts", async () => {
  const project = (values: Record<string, unknown>) => projectInterimSnapshot(observation(values)).checkpoint
  expect(project({ schema: 1 })).toEqual({ kind: "absent" })
  expect(project({ interimConversion: null })).toEqual({ kind: "present", value: null })
  const undefinedPresent = project({ interimConversion: undefined })
  expect(undefinedPresent.kind === "present" && Object.hasOwn(undefinedPresent, "value") && undefinedPresent.value === undefined).toBe(true)
  expect(project({ interimConversion: { v: 1, kind: "retained-interim" } })).toEqual({ kind: "present", value: { v: 1, kind: "retained-interim" } })
  expect(project({ interimConversion: { v: 9, payload: { opaque: true } } })).toEqual({ kind: "present", value: { v: 9, payload: { opaque: true } } })
  for (const [checkpoint, held] of [[null, { kind: "invalid", reason: "checkpoint" }], [{ v: 9, payload: { opaque: true } }, { kind: "newer-checkpoint", version: 9 }]] as const) {
    const h = startingOwner({ schema: 1, interimConversion: checkpoint })
    const error = await h.owner.ready().then(() => undefined, (caught: unknown) => caught)
    expect(error instanceof StartupReadinessError && error.result).toEqual({ kind: "interim-held", result: held })
    expect(h.batches).toEqual([])
    expect(h.records()).toEqual({ schema: 1, interimConversion: checkpoint })
    noAmbientWork(h.effects)
    await h.owner.dispose()
  }
})

test("fresh startup through the source confirms only schema 1", async () => {
  const h = startingOwner({})
  expect(await h.owner.ready()).toBe("ok")
  expect(h.batches).toEqual([{ schema: 1 }])
  expect(h.records()).toEqual({ schema: 1 })
  expect(await h.owner.claim()).toEqual({ kind: "unavailable", reason: "authority" })
  noCleanupEffects(h.effects)
  noAmbientWork(h.effects)
  await h.owner.dispose()
})

test("original authorization branches keep 50 versus 0, the original shortcut ID and ordered cleanup", async () => {
  const outcomes = []
  for (const authorized of [false, true]) {
    const h = startingOwner(authorized ? { ...released, refreshToken: null } : released,
      records => ({ kind: "observed", refreshTokenWasNonempty: authorized && Object.hasOwn(records, "refreshToken") }))
    expect(await h.owner.ready()).toBe("ok")
    const [canonical, schema, ...rest] = h.batches
    expect(rest).toEqual([])
    expect(Object.keys(canonical ?? {}).sort()).toEqual(["device", "doc:settings", "unclaimed"])
    expect(schema).toEqual({ schema: 1 })
    const saved = h.records() as Record<string, any>
    expect(LEGACY_DELETE_KEYS.filter(key => Object.hasOwn(saved, key))).toEqual([])
    expect(saved["doc:settings"].data.autoAdd.pct).toBe(authorized ? 0 : 50)
    expect(saved.device.upgradeNote.details.pct).toEqual({ value: authorized ? 0 : 50, wasUnset: true, authorised: authorized })
    expect(saved.device.upgradeNote.details.credentialsDeleted).toBe(authorized)
    expect(saved.unclaimed.originalShortcutId).toBe("orig01")
    expect(saved["doc:settings"].data.shortcuts.list.map((row: { id: string }) => row.id)).toEqual(["orig01"])
    const at = (effect: unknown) => h.effects.findIndex(item => JSON.stringify(item) === JSON.stringify(effect))
    const batch = at({ set: Object.keys(canonical ?? {}) }), removal = at({ removeLocal: [...LEGACY_DELETE_KEYS] }), final = at({ set: ["schema"] })
    expect(batch).toBeGreaterThanOrEqual(0)
    expect(removal).toBeGreaterThan(batch)
    for (const cleanup of [{ deleteDatabase: "yt-playlist-tools" }, { removeSession: ["channelCache"] }]) expect(at(cleanup)).toBeGreaterThan(removal)
    expect(final).toBeGreaterThan(Math.max(at("database-done"), at("session-done")))
    noAmbientWork(h.effects)
    outcomes.push(saved)
    await h.owner.dispose()
  }
  expect(outcomes[0]?.unclaimed).toEqual(outcomes[1]?.unclaimed)
  const stale = startingOwner({ ...released, refreshToken: null }, () => ({ kind: "observed", refreshTokenWasNonempty: true }))
  const error = await stale.owner.ready().then(() => undefined, (caught: unknown) => caught)
  expect(error instanceof StartupSourceRefusal && error.code).toBe("authorization-contradiction")
  expect(stale.batches.map(batch => Object.keys(batch).sort())).toEqual([["device", "doc:settings", "unclaimed"]])
  await stale.owner.dispose()
})

test("unavailable original authorization rejects actual readiness before any set or cleanup", async () => {
  const h = startingOwner({ ...released, refreshToken: null }, () => ({ kind: "unavailable" }))
  const error = await h.owner.ready().then(() => undefined, (caught: unknown) => caught)
  expect(error instanceof StartupSourceRefusal && error.message).toBe("Startup source refused: authorization-unavailable")
  expect(h.batches).toEqual([])
  expect(h.records()).toEqual({ ...released, refreshToken: null })
  noCleanupEffects(h.effects)
  noAmbientWork(h.effects)
  await h.owner.dispose()
})

test("named inventory gaps and source read failures reject actual readiness before mutation", async () => {
  for (const missing of ["account:CCCCCCCCCCCCCCCC", "doc:setup:AAAAAAAAAAAAAAAA"]) {
    const records = { ...interimFixture(), "doc:setup:AAAAAAAAAAAAAAAA": { v: 1, gen: "g", at: 1, by: "other", deleted: true }, "account:CCCCCCCCCCCCCCCC": { playlists: ["PL_UNINDEXED"] } }
    const h = startingOwner(records)
    h.inventory(inventory => { const { [missing]: _, ...values } = inventory.values; return { ...inventory, values } })
    const error = await h.owner.ready().then(() => undefined, (caught: unknown) => caught)
    expect(error instanceof StartupSourceRefusal && error.code).toBe("incomplete")
    expect(h.batches).toEqual([])
    expect(h.records()).toEqual(copy(records))
    await h.owner.dispose()
  }
  const original = Error("synthetic native read")
  const h = startingOwner({ schema: 1 })
  h.inventory(() => { throw original })
  await expect(h.owner.ready()).rejects.toBe(original)
  expect(h.batches).toEqual([])
  await h.owner.dispose()
})

test("interim inventory is retained losslessly and held without legacy cleanup or activation", async () => {
  const records = { ...interimFixture(), legacyClaimed: true, sessionConsent: 0, sessionGeneration: "",
    "account:malformed suffix": { arbitrary: [null, false] }, "account:CCCCCCCCCCCCCCCC": { playlists: ["PL_UNINDEXED"] },
    "doc:setup:BBBBBBBBBBBBBBBB": { v: 1, gen: "g", at: 1, by: "other", deleted: true }, "doc:filter:AAAAAAAAAAAAAAAA:PL_NEWER": { v: 2, gen: "g", at: 1, by: "other", data: {} },
    "cache:DDDDDDDDDDDDDDDD": { future: [false] } }
  const h = startingOwner(records, () => ({ kind: "unavailable" }))
  const error = await h.owner.ready().then(() => undefined, (caught: unknown) => caught)
  expect(error instanceof StartupReadinessError && error.result.kind).toBe("interim-held")
  expect(h.batches.map(batch => Object.keys(batch))).toEqual([["interimConversion"]])
  const saved = h.records() as Record<string, any>
  const expected = projectInterimSnapshot(syntheticStartupInventory(copy(records), { legacyAuthorization: { kind: "unavailable" }, historicalAuthorization: unknownFact, priorCredentialPresence: unknownFact }))
  expect(saved.interimConversion.source).toEqual(expected.source)
  expect(saved.interimConversion.canonical).toEqual(expected.canonical)
  expect(saved.interimConversion.historicalAuthorization).toEqual(unknownFact)
  const { interimConversion: _, ...rest } = saved
  expect(rest).toEqual(copy(records))
  noCleanupEffects(h.effects)
  noAmbientWork(h.effects)
  await h.owner.dispose()
})

test("readback after the canonical batch samples the changed source again", async () => {
  const h = startingOwner(released)
  h.sample(() => { if (h.batches.length === 1) h.foreign(records => { records.device = { ...(records.device as JsonObject), foreign: true } }) })
  const error = await h.owner.ready().then(() => undefined, (caught: unknown) => caught)
  expect(error instanceof StartupReadinessError && error.result).toEqual({ kind: "unconfirmed", stage: "canonical-batch" })
  noCleanupEffects(h.effects)
  await h.owner.dispose()
})

test("database and session cleanup settle independently before readiness and schema", async () => {
  for (const first of ["database", "session"] as const) {
    const h = startingOwner(released), db = deferred(), session = deferred()
    h.database(() => db.promise); h.session(() => session.promise)
    let settled = false
    const ready = h.owner.ready().then(value => { settled = true; return value })
    await turns()
    expect(h.effects.filter(effect => effect === "database-done" || effect === "session-done")).toEqual([])
    if (first === "database") db.resolve(); else session.resolve()
    await turns()
    expect(settled).toBe(false)
    expect(h.batches).toHaveLength(1)
    if (first === "database") session.resolve(); else db.resolve()
    expect(await ready).toBe("ok")
    expect(h.batches.at(-1)).toEqual({ schema: 1 })
    await h.owner.dispose()
  }
  const h = startingOwner(released), original = Error("synthetic database cleanup"), session = deferred()
  h.database(async () => { throw original }); h.session(() => session.promise)
  let settled = false
  const ready = h.owner.ready().then(() => undefined, (caught: unknown) => { settled = true; return caught })
  await turns()
  expect(settled).toBe(false)
  session.resolve()
  expect(await ready).toBe(original)
  expect(h.effects).toContain("session-done")
  expect(h.batches).toHaveLength(1)
  await h.owner.dispose()
  const saved = h.records()
  expect(saved.schema).toBeUndefined()
  const restarted = startingOwner(saved)
  expect(await restarted.owner.ready()).toBe("ok")
  expect(restarted.batches).toEqual([{ schema: 1 }])
  expect(restarted.records()).toEqual({ ...saved, schema: 1 })
  noAmbientWork(restarted.effects)
  await restarted.owner.dispose()
})

test("disposal during held cleanup drains both effects and never releases", async () => {
  const h = startingOwner(released), db = deferred(), session = deferred()
  h.database(() => db.promise); h.session(() => session.promise)
  const ready = h.owner.ready().then(() => "ok", (caught: unknown) => caught)
  await turns()
  const preserved = h.records(), batches = copy(h.batches), effects = copy(h.effects)
  let drained = false
  const drain = h.owner.dispose().then(() => { drained = true })
  db.resolve(); await turns()
  expect(drained).toBe(false)
  session.resolve()
  const error = await ready
  expect(error instanceof StartupReadinessError && error.result.kind).toBe("disposed")
  await drain
  expect(drained).toBe(true)
  expect(h.records().schema).toBeUndefined()
  expect(h.records()).toEqual(preserved)
  expect(h.batches).toEqual(batches)
  expect(h.effects).toEqual([...effects, "database-done", "session-done"])
})

test("newer layout stays inert across construction and reads", async () => {
  const h = startingOwner({ schema: 2, ...released })
  expect(await h.owner.ready()).toBe("newer-layout")
  expect(h.batches).toEqual([])
  expect(h.records()).toEqual({ schema: 2, ...released })
  noCleanupEffects(h.effects)
  noAmbientWork(h.effects)
  await h.owner.dispose()
})

test("construction detaches context and delegates only the semantic cleanup operations", async () => {
  const supplied = { ...context, platform: { ...context.platform }, commands: [] as { key: unknown; command: string }[] }
  const calls: unknown[] = []
  let reads = 0
  const built = createStoreStartupHost({ context: supplied as StoreStartupHost["context"], source: { async readInventory() { reads++; return observation({}) } }, cleanup: {
    async removeLocal(keys) { calls.push({ removeLocal: keys }) }, async deleteDatabase(name) { calls.push({ deleteDatabase: name }) }, async removeSession(keys) { calls.push({ removeSession: keys }) } } })
  supplied.platform.browser = "firefox"; supplied.at = 999
  expect(built.context).toEqual(context)
  expect(reads).toBe(0); expect(calls).toEqual([])
  await built.readSnapshot(); await built.readInterimSnapshot()
  expect(reads).toBe(2); expect(calls).toEqual([])
  await built.removeLocal(["playlists"]); await built.deleteDatabase("yt-playlist-tools"); await built.removeSession(["channelCache"])
  expect(calls).toEqual([{ removeLocal: ["playlists"] }, { deleteDatabase: "yt-playlist-tools" }, { removeSession: ["channelCache"] }])
})

test("the interim command host keeps erased original authorization unavailable", async () => {
  const h = createInterimHarness({ schema: 1, sessionConsent: 1 })
  expect(await refusal(h.deps.startup.readSnapshot())).toBe("authorization-unavailable")
  expect(h.effects).toEqual([{ snapshot: 1 }])
  expect((await h.deps.startup.readInterimSnapshot()).source).toEqual({ sessionConsent: 1 })
})
