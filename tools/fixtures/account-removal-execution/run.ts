import { isInterimSourceKey, isInterimCanonicalKey } from "../../../src/background/store/interim-persistence"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "../../../src/background/store/local-filter-writer"
import { accountRemovalLocalName, parsePendingAccountRemoval, pendingAccountRemovalKey,
  type AccountRemovalHost, type RemovalLocalKey } from "../../../src/background/store/account-removal-execution"
import { isAccountKey, isPlaylistId, type AccountKey } from "../../../src/shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../../src/shared/contracts/json"
import type { RemovalSessionKey } from "../../../src/background/store/account-removal-session"

function object(value: unknown): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value) && isJsonValue(value) }
function json(value: unknown): JsonObject { if (!object(value)) throw Error("Fixture requires JSON own data"); return value }
function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }
function account(value: string): AccountKey { if (!isAccountKey(value)) throw Error("Invalid synthetic account"); return value }
const acct = account("AAAAAAAAAAAAAAAA"), other = account("BBBBBBBBBBBBBBBB")
const ui = { kind: "ui", windowId: 1, incognito: false } as const
const setupName = `doc:setup:${acct}`
const documents = [setupName, ...["selected", "kept", "orphan", "off", "empty", "deleted"].map(name => `doc:filter:${acct}:PL_${name}`)]
const video = "aaaaaaaaaaa", otherVideo = "bbbbbbbbbbb"
export type RemovalFixtureState = { local: JsonObject; session: JsonObject; sync: JsonObject }
export function removalFixture(synced = false): RemovalFixtureState {
  const stamp = (data: JsonObject, gen: string): JsonObject => ({ v: 1, gen, at: 1, by: "old", envelope: { keep: [null, 1] }, data })
  const local: JsonObject = {
    schema: 1, device: { id: "fixture", consent: { v: 1, at: 1, extension: true }, syncOn: synced, lastAccount: acct, extension: { keep: 1 } },
    sync: { joined: "history", pushed: {}, status: synced ? "ok" : "off", editedSinceOff: false, extension: "history",
      opaqueWrite: { gate: null, diagnostic: { name: "Original", message: "opaque", extension: true } } },
    [setupName]: stamp({ label: { name: "Synthetic account", extension: 1 }, autoAdd: [{ pl: "PL_selected", takes: "both" }, { pl: "PL_off", takes: "videos" }],
      targets: { orig01: "PL_target" }, quickSave: "PL_quick", marks: { PL_missing: "missing" }, extension: { untouched: true } }, "setup-old"),
    "doc:settings": stamp({ shortcuts: { list: [{ id: "orig01", label: "Shortcut", key: null, watchLaterOnEveryAccount: false }] }, extension: true }, "settings-pending"),
    [`doc:setup:${other}`]: stamp({ gather: "PL_restore" }, "other-restoration"),
    [`cache:${acct}`]: { created: [{ id: "PL_created", title: "Created", privacy: "PRIVATE", at: 1 }], playlists: [{ id: "PL_selected", title: "Selected" }] },
    [`cache:${other}`]: { keep: true }, unclaimed: null, registry: { global: true }, unrelated: { extension: [null, 1] }
  }
  for (const name of documents.slice(1)) local[name] = stamp(name.endsWith("empty") ? {} : { mode: "allow", on: !name.endsWith("off"), channels: [] }, `before-${name.split(":").at(-1)}`)
  const deleted = json(local[documents.at(-1)!]); delete deleted.data; deleted.deleted = true
  for (let shard = 0; shard < 16; shard++) local[`progress:${acct}:${shard}`] = { [video]: { len: 60, parts: [[1, 2]], at: 1, shard } }
  local[`progress:${other}:15`] = { keep: true }
  const sync: JsonObject = { "s:meta": { v: 1, id: "history", created: 1, extension: true }, unknown: { occupancy: true }, "s:filter:AAAAAAAAAAAAAAAA:PL_selected@old.0": "retained chunk" }
  const pushed: JsonObject = {}
  for (const name of documents) { sync[`s:${name.slice(4)}`] = copy(local[name]!); pushed[name] = json(local[name]).gen! }
  pushed[`doc:setup:${other}`] = "other-restoration"
  json(local.sync).pushed = pushed
  const row = (owner: AccountKey, id: string): JsonObject => ({ acct: owner, playlist: "PL_selected", video: id, at: 1, extension: { acct, keep: true } })
  const add = (owner: AccountKey, kind: "single" | "gather"): JsonObject => ({ acct: owner, kind, at: 1,
    playlists: [{ id: "PL_selected", title: "Playlist", extension: true }], source: { kind: "feature", feature: kind === "gather" ? "gather" : "quick-save" },
    ...(kind === "single" ? { video: { id: owner === acct ? video : otherVideo, title: "Video" } } : { videos: [{ id: otherVideo, title: "Gathered" }] }), extension: { keep: [null] } })
  const partition = (): JsonObject => ({ v: 1, global: { keep: true, accountLookingExtension: { acct, keep: true }, paced: { "1": 10 } },
    accounts: { [acct]: { owned: true }, [other]: { extension: { keep: true } } }, extension: [null, 1] })
  return { local, sync, session: { paused: true, tabs: { "1": { acct, site: "www" } }, unknown: { acct, keep: true },
    [`skips:${acct}`]: { [video]: "all" }, [`skips:${other}`]: { [otherVideo]: ["PL_other"] }, [`cooldown:${acct}`]: 100,
    [`cooldown:${other}`]: 200, recent: [row(other, otherVideo), row(acct, video), row(other, otherVideo)],
    recentAdds: [add(acct, "single"), add(other, "single"), add(acct, "gather"), add(other, "gather")],
    shown: partition(), breakage: partition(), gather: partition() } }
}

type Fault = { readonly at: number; readonly when: "before" | "after"; readonly kind: "interrupt" | "reject" | "ignore" | "partial"; readonly members?: number }
type Io = { n: number; kind: string; phase: string; value?: unknown }
export function createRemovalHarness(initial: RemovalFixtureState = removalFixture(), options: { fault?: Fault; details?: boolean; host?: boolean } = {}) {
  let state = copy(initial), ordinal = 0, dead = false, mono = 0, gen = 0, stamps = 0, subscriptions = 0
  let fault = options.fault, hook: ((kind: string) => void) | undefined
  const error = new Error("Synthetic IO rejection"), io: Io[] = [], mutations: { n: number; kind: string; before?: RemovalFixtureState; after?: RemovalFixtureState }[] = []
  const schedules: number[] = [], events: unknown[] = [], automatic: unknown[] = []
  async function port<T>(kind: string, read: () => T, apply?: (partial: boolean) => void): Promise<T> {
    const n = ++ordinal
    io.push({ n, kind, phase: "invoked" })
    const hit = fault?.at === n ? fault : undefined
    if (dead || hit?.when === "before" && (hit.kind === "interrupt" || hit.kind === "reject")) {
      if (hit?.kind === "interrupt") dead = true
      io.push({ n, kind, phase: "rejected", value: error.message }); throw error
    }
    if (apply && hit?.kind !== "ignore") {
      const before = options.details ? copy(state) : undefined
      apply(hit?.kind === "partial")
      mutations.push({ n, kind, ...(options.details ? { before, after: copy(state) } : {}) })
    }
    hook?.(kind)
    const result = read()
    if (hit?.when === "after" && (hit.kind === "interrupt" || hit.kind === "reject" || hit.kind === "partial")) {
      if (hit.kind === "interrupt") dead = true
      io.push({ n, kind, phase: "rejected", value: error.message }); throw error
    }
    io.push({ n, kind, phase: "resolved" })
    return result
  }
  const local = {
    async get(keys: readonly string[] | null) { return port("local.get", () => copy(keys === null ? state.local : Object.fromEntries(keys.filter(key => Object.hasOwn(state.local, key)).map(key => [key, state.local[key]])))) },
    async set(items: Readonly<Record<string, JsonValue>>) { return port(`local.set:${Object.keys(items).join(",")}`, () => {}, partial => {
      const entries = Object.entries(items); for (const [key, value] of partial ? entries.slice(0, fault?.members ?? 1) : entries) Object.defineProperty(state.local, key, { value: copy(value), enumerable: true, writable: true, configurable: true })
    }) }
  }
  const removal: AccountRemovalHost = options.host === false ? { kind: "unavailable" } : { kind: "fixture",
    async removeLocal(keys: readonly RemovalLocalKey[]) { return port(`local.remove:${keys.map(key => accountRemovalLocalName(key, acct)).join(",")}`, () => {}, () => { for (const key of keys) delete state.local[accountRemovalLocalName(key, acct)] }) },
    session: {
      async get() { return port("session.get", () => copy(state.session)) },
      async set(items) { return port(`session.set:${Object.keys(items).join(",")}`, () => {}, () => { state.session = { ...state.session, ...copy(items) } }) },
      async remove(keys: readonly RemovalSessionKey[]) { return port(`session.remove:${keys.map(key => `${key.kind}:${key.acct}`).join(",")}`, () => {}, () => { for (const key of keys) delete state.session[`${key.kind}:${key.acct}`] }) }
    } }
  const deps = { local, removal, claim: { kind: "unavailable" as const },
    sync: { async get() { return port("sync.get", () => copy(state.sync)) }, async set(items: Readonly<Record<string, JsonValue>>) { return port("sync.set", () => {}, () => { state.sync = { ...state.sync, ...copy(items) } }) }, subscribe() { subscriptions++; return () => { subscriptions-- } } },
    syncClock: { now: () => mono, wallNow: () => 1000000 + mono, after(ms: number) { schedules.push(ms); return () => { schedules.push(-ms) } } },
    now() { stamps++; return 100 }, generation() { return `removed-${++gen}` }, onSyncResult(result: unknown) { automatic.push(result) }
  }
  const startup = {
    context: { deviceId: "fixture", settingsGen: "startup-only", at: 1, shortcutId: "orig01", platform: { browser: "chrome" as const, os: "linux" as const }, commands: [] },
    async readInterimSnapshot() {
      const saved = copy(state.local)
      return { source: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimSourceKey(key))),
        canonical: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimCanonicalKey(key))),
        checkpoint: Object.hasOwn(saved, "interimConversion") ? { kind: "present" as const, value: saved.interimConversion } : { kind: "absent" as const },
        historicalAuthorization: { kind: "unknown" as const }, priorCredentialPresence: { kind: "unknown" as const } }
    },
    async readSnapshot() { return { schema: state.local.schema, device: copy(state.local.device), settingsDocument: copy(state.local["doc:settings"]), unclaimed: state.local.unclaimed,
      legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [] } },
    async removeLocal() { throw Error("Legacy remove forbidden") }, async deleteDatabase() { throw Error("Database delete forbidden") }, async removeSession() { throw Error("Legacy session remove forbidden") }
  }
  return { deps, startup, io, mutations, events, automatic, schedules, error, state: () => copy(state), counts: () => ({ generations: gen, stamps, subscriptions }),
    time(value: number) { mono = value }, fault(value?: Fault) { fault = value; dead = false }, hook(value?: typeof hook) { hook = value },
    foreign(change: (state: RemovalFixtureState) => void) { change(state) } }
}

export async function runAccountRemovalExecution(api = { create: createLocalFilterWriter, starting: createStartingLocalFilterWriter }) {
  let assertions = 0
  const observations: unknown[] = []
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item instanceof Error ? { name: item.name, message: item.message }
    : item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function check(value: unknown, label: string): asserts value { assertions++; if (!value) throw Error(label) }
  function equal(actual: unknown, expected: unknown, label: string) { check(stable(actual) === stable(expected), label) }
  const isMutation = (kind: string) => /^(local|session)\.(set|remove):/.test(kind)
  function expected(seed: RemovalFixtureState, synced: boolean): RemovalFixtureState {
    const state = copy(seed)
    for (const [index, name] of [setupName, ...documents.slice(1).sort()].entries()) {
      if (!synced) delete state.local[name]
      else { const tombstone: JsonObject = { ...json(state.local[name]), gen: `removed-${index + 1}`, at: 100, by: "fixture", deleted: true }; delete tombstone.data; state.local[name] = tombstone }
    }
    delete state.local[`cache:${acct}`]
    for (let shard = 0; shard < 16; shard++) delete state.local[`progress:${acct}:${shard}`]
    if (object(state.local.sync) && !synced && state.local.sync.editedSinceOff === false) state.local.sync.editedSinceOff = true
    if (json(state.local.device).lastAccount === acct) json(state.local.device).lastAccount = null
    delete state.session[`skips:${acct}`]; delete state.session[`cooldown:${acct}`]
    for (const key of ["recent", "recentAdds"]) if (Array.isArray(state.session[key])) state.session[key] = state.session[key].filter(row => object(row) && row.acct !== acct)
    for (const key of ["shown", "breakage", "gather"]) if (object(state.session[key])) delete json(state.session[key].accounts)[acct]
    return state
  }
  async function action(h: ReturnType<typeof createRemovalHarness>) {
    const writer = api.create(h.deps)
    writer.subscribe(event => h.events.push(event))
    const preparation = await writer.prepareAccountRemoval(ui, acct)
    const result = preparation.kind === "confirmation-required" ? await writer.removeAccountSetup(ui, preparation.confirmation) : preparation
    return { writer, preparation, result }
  }
  const baselines: { synced: boolean; seed: RemovalFixtureState; trace: Io[]; result: RemovalFixtureState; accepted: RemovalFixtureState }[] = []
  for (const synced of [false, true]) {
    const seed = removalFixture(synced), h = createRemovalHarness(seed, { details: true }), { writer, preparation, result } = await action(h)
    equal(h.mutations[0]?.kind, `local.set:${pendingAccountRemovalKey}`, "durable intent precedes every destructive effect")
    check(!Object.keys(h.state().local).some(key => key.startsWith(`progress:${acct}:`)), "all sixteen progress shards are removed")
    equal(h.state().session.paused, seed.session.paused, "global Pause survives account cleanup")
    equal(result, { kind: "committed" }, "actual owner commits complete account removal")
    check(preparation.kind === "confirmation-required", "actual owner requires explicit confirmation")
    equal(preparation.scope, synced ? { kind: "syncing-browsers", joined: "history" } : { kind: "this-browser" }, "displayed scope matches destructive authority")
    equal(preparation.label, "Synthetic account", "displayed account label captured")
    equal(h.state(), expected(seed, synced), "complete local/session/sync preservation")
    equal(h.events, [], "account removal emits no Settings success event")
    equal(h.counts().generations, synced ? documents.length : 0, "sync off allocates no document generation")
    equal(h.counts().stamps, synced ? 1 : 0, "sync off allocates no document time")
    check(!h.io.some(entry => entry.kind === "sync.set") && h.counts().subscriptions === 0, "removal never transmits or subscribes")
    check(synced || !h.io.some(entry => entry.kind === "sync.get"), "sync off performs zero sync IO")
    equal(h.schedules, [], "removal on inactive owner schedules no timer")
    const accepted = h.mutations.find(entry => entry.kind.startsWith("local.set:"))
    check(accepted?.after, "actual accepted intermediate state retained")
    equal(accepted.kind, `local.set:${pendingAccountRemovalKey}`, "pending intent is the first and only acceptance write")
    const record = json(accepted.after.local[pendingAccountRemovalKey]), parsed = parsePendingAccountRemoval(record)
    check(parsed && parsed.record.documents.length === documents.length, "accepted manifest covers every physical Filter")
    equal(accepted.before, seed, "acceptance precedes destructive effects")
    check(!JSON.stringify(record).includes('"cache:') && !JSON.stringify(record).includes('"progress:') && !JSON.stringify(record).includes('"recent"'), "durable record contains no local dependency or session payload")
    equal(h.mutations.at(-1)?.kind, `local.remove:${pendingAccountRemovalKey}`, "pending intent retires last")
    baselines.push({ synced, seed, trace: copy(h.io), result: h.state(), accepted: accepted.after })
    observations.push({ case: synced ? "synced" : "local", before: seed, preparation, result, intermediate: accepted.after, after: h.state(), io: h.io, mutations: h.mutations, counts: h.counts() })
    if (synced) {
      equal((await writer.flushSync()).kind, "deferred", "actual flush waits for current shared opportunity")
      h.time(5000)
      const flushed = await writer.flushSync()
      check(flushed.kind === "pushed", "actual existing owner flushes the accepted tombstones")
      equal(flushed.sent.map(item => item.name).sort(), [...documents, "doc:settings", `doc:setup:${other}`].sort(), "flush includes ordinary pending and restoration")
      equal(flushed.sent.length, documents.length + 2, "one combined push includes all pending and restoration documents")
      equal(h.state().sync["s:filter:AAAAAAAAAAAAAAAA:PL_selected@old.0"], seed.sync["s:filter:AAAAAAAAAAAAAAAA:PL_selected@old.0"], "unproven physical chunks retained")
      for (const name of documents) equal(json(json(h.state().local.sync).pushed)[name], json(h.state().local[name]).gen, "actual acknowledgement records exact fixed generation")
      observations.push({ case: "combined-flush", result: flushed, after: h.state(), io: h.io.slice(baselines.at(-1)!.trace.length) })
      const restarted = createRemovalHarness(JSON.parse(JSON.stringify(h.state()))), next = api.starting({ ...restarted.deps, startup: restarted.startup })
      equal(await next.ready(), "ok", "acknowledged restart releases readiness")
      equal(await next.flushSync(), { kind: "idle" }, "acknowledged restart is idle")
      equal(restarted.mutations, [], "completed restart performs zero duplicate mutation")
      await next.dispose()
    }
    await writer.dispose()
  }
  for (const history of ["absent", "false", "true"] as const) {
    const seed = removalFixture(); if (history === "absent") delete seed.local.sync; else json(seed.local.sync).editedSinceOff = history === "true"
    for (const last of [acct, other, null]) {
      json(seed.local.device).lastAccount = last
      const h = createRemovalHarness(seed), operation = await action(h)
      equal(operation.result.kind, "committed", "off-history variant commits")
      equal(h.state(), expected(seed, false), "history and Device omissions and unrelated values preserved")
      equal(h.counts().generations, 0, "off-history variants never generate")
      equal(h.io.filter(item => item.kind === "sync.get").length, 0, "off-history variants never read sync")
      observations.push({ case: `off-history-${history}-${last === acct ? "matching" : last === other ? "other" : "null"}`, before: seed, after: h.state(), result: operation.result, mutations: h.mutations })
      await operation.writer.dispose()
    }
  }
  for (const invalid of ["private", "unknown-window", "forged", "cloned", "other-owner", "other-window", "mode", "history", "label", "setup", "filter", "filter-keyset"] as const) {
    const h = createRemovalHarness(), writer = api.create(h.deps)
    const prepared = await writer.prepareAccountRemoval(ui, acct)
    check(prepared.kind === "confirmation-required", "stale-control preparation succeeds")
    let token = prepared.confirmation
    let origin: typeof ui | { kind: "ui"; windowId: number; incognito: boolean } = ui
    if (invalid === "private") origin = { ...ui, incognito: true }
    if (invalid === "unknown-window") origin = { ...ui, windowId: -1 }
    if (invalid === "other-window") origin = { ...ui, windowId: 2 }
    if (invalid === "forged") token = { kind: "account-removal-confirmation" }
    if (invalid === "cloned") token = { ...token }
    if (invalid === "other-owner") {
      const otherOwner = api.create(h.deps), otherPrepared = await otherOwner.prepareAccountRemoval(ui, acct)
      check(otherPrepared.kind === "confirmation-required", "other owner prepares its distinct capability")
      token = otherPrepared.confirmation; await otherOwner.dispose()
    }
    h.foreign(state => {
      if (invalid === "mode") { json(state.local.device).syncOn = true; json(state.local.sync).status = "ok" }
      if (invalid === "history") json(state.local.sync).joined = "changed-history"
      if (invalid === "label") json(json(state.local[setupName]).data).label = { name: "Changed label" }
      if (invalid === "setup") json(state.local[setupName]).gen = "new-lifetime"
      if (invalid === "filter") json(state.local[documents[1]!]).extension = "changed"
      if (invalid === "filter-keyset") state.local[`doc:filter:${acct}:PL_new`] = { v: 1, gen: "new", at: 1, by: "other", data: {} }
    })
    const before = h.state(), result = await writer.removeAccountSetup(origin, token)
    check(result.kind !== "committed", "private or stale confirmation refuses")
    equal(h.state(), before, "private or stale confirmation has zero mutation")
    equal(h.mutations, [], "private and stale capabilities write no intent")
    equal(h.counts().generations, 0, "private and stale capabilities create no stamp")
    equal(h.events, [], "private and stale capabilities emit no Settings event")
    observations.push({ case: `confirmation-${invalid}`, before, result, after: h.state(), io: h.io })
    await writer.dispose()
  }
  for (const invalid of ["preconsent", "note", "interim", "future-schema", "malformed-history", "future-history", "future-filter", "null-filter", "unsupported-session", "noncanonical-filter", "noncanonical-setup", "future-progress", "orphaned", "absent"] as const) {
    const seed = removalFixture()
    if (invalid === "preconsent") json(seed.local.device).consent = null
    if (invalid === "note") json(seed.local.device).upgradeNote = { state: "pending" }
    if (invalid === "interim") seed.local.sessionConsent = false
    if (invalid === "future-schema") seed.local.schema = 2
    if (invalid === "malformed-history") json(seed.local.sync).status = "unknown"
    if (invalid === "future-history") json(seed.local.sync).opaqueWrite = { gate: { kind: "future", notBefore: 1 }, diagnostic: null }
    if (invalid === "future-filter") json(seed.local[documents[1]!]).v = 2
    if (invalid === "null-filter") seed.local[documents[1]!] = null
    if (invalid === "unsupported-session") seed.session.gather = { entries: [] }
    if (invalid === "noncanonical-filter") seed.local[`doc:filter:${acct}`] = {}
    if (invalid === "noncanonical-setup") seed.local[`doc:setup:${acct}:extra`] = {}
    if (invalid === "future-progress") seed.local[`progress:${acct}:16`] = {}
    if (invalid === "orphaned") delete seed.local[setupName]
    if (invalid === "absent") {
      for (const name of documents) delete seed.local[name]
      delete seed.local[`cache:${acct}`]; for (let i = 0; i < 16; i++) delete seed.local[`progress:${acct}:${i}`]
      json(seed.local.device).lastAccount = null
      seed.session = { paused: true, tabs: {} }
    }
    const h = createRemovalHarness(seed), writer = api.create(h.deps), result = await writer.prepareAccountRemoval(ui, acct)
    check(result.kind !== "confirmation-required", "unsupported inventory cannot reach confirmation")
    if (invalid === "absent") equal(result, { kind: "unchanged" }, "genuinely absent account is a no-op")
    if (invalid === "orphaned") equal(result, { kind: "unavailable", reason: "inventory" }, "orphaned physical dependencies cannot authorize a new removal")
    equal(h.state(), seed, "refusal preserves full state")
    equal(h.mutations, [], "refusal writes no pending record")
    equal(h.counts().generations, 0, "refusal allocates no stamp")
    observations.push({ case: `prepare-${invalid}`, before: seed, result, after: h.state(), io: h.io })
    await writer.dispose()
  }
  for (const invalid of ["future", "null", "incomplete", "conflict", "full"] as const) {
    const seed = removalFixture(true), name = `s:${documents[1]!.slice(4)}`
    if (invalid === "future") seed.sync[name] = { v: 2, gen: "future", at: 1, by: "other", data: {} }
    if (invalid === "null") seed.sync[name] = null
    if (invalid === "incomplete") seed.sync[name] = { v: 1, gen: "parts", at: 1, by: "other", n: 2 }
    if (invalid === "conflict") seed.sync[name] = { ...json(seed.sync[name]), extension: "same-generation-divergence" }
    if (invalid === "full") for (let n = 0; n < 480; n++) seed.sync[`unknown-${n}`] = "occupancy"
    const h = createRemovalHarness(seed), operation = await action(h)
    check(operation.result.kind !== "committed", "whole synced removal refuses remote debt or quota")
    equal(h.state(), seed, "failed admission stages no record and preserves full state")
    equal(h.mutations, [], "failed admission mutates nothing")
    observations.push({ case: `admission-${invalid}`, before: seed, result: operation.result, after: h.state(), io: h.io })
    await operation.writer.dispose()
  }
  {
    const h = createRemovalHarness(), host = h.deps.removal
    check(host.kind === "fixture", "disposal fixture owns canonical removal")
    let release = () => {}, entered = () => {}
    const held = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    const writer = api.create({ ...h.deps, removal: { ...host, async removeLocal(keys) {
      if (keys.some(key => key.kind === "cache")) { entered(); await held }
      await host.removeLocal(keys)
    } } })
    const preparation = await writer.prepareAccountRemoval(ui, acct)
    check(preparation.kind === "confirmation-required", "disposal prepares explicit intent")
    const work = writer.removeAccountSetup(ui, preparation.confirmation)
    await started
    const queued = writer.read("settings"), draining = writer.dispose()
    check(Object.hasOwn(h.state().local, pendingAccountRemovalKey), "accepted operation keeps its intent while disposal drains")
    release()
    equal(await work, { kind: "committed" }, "disposal drains an accepted operation to exact completion")
    await draining
    equal(await queued, { kind: "unavailable", reason: "disposed" }, "queued read cannot expose disposed owner")
    equal(h.state(), baselines[0]!.result, "drained removal completes all dependencies")
    equal((await writer.prepareAccountRemoval(ui, acct)).kind, "unavailable", "disposed owner accepts no new action")
    observations.push({ case: "disposal-drain", preparation, after: h.state(), io: h.io, schedules: h.schedules })
  }
  for (const gate of ["pending", "held"] as const) {
    const seed = removalFixture(true)
    json(seed.local.sync).opaqueWrite = { gate: { kind: gate, notBefore: 1060000, extension: true }, diagnostic: { name: "Original", message: "opaque", extension: true }, extension: true }
    const h = createRemovalHarness(seed), operation = await action(h)
    equal(operation.result, { kind: "committed" }, "removal preserves opaque recovery while committing local facts")
    equal(h.state().local.sync, seed.local.sync, "prepare and removal preserve exact R155 pending/held diagnostics and deadline")
    equal(h.schedules, [], "removal creates no opaque-recovery retry timer")
    h.time(5000)
    equal((await operation.writer.flushSync()).kind, "deferred", "current external flush imports the minimum restart hold")
    check(!h.io.some(item => item.kind === "sync.set"), "prepare and removal grant no recovery attempt")
    h.time(65000)
    equal((await operation.writer.flushSync()).kind, "pushed", "one later external event uses normal fresh-admission recovery")
    const opaque = json(json(h.state().local.sync).opaqueWrite)
    equal(opaque.gate, null, "successful normal flush retires hold")
    equal(opaque.diagnostic, json(json(seed.local.sync).opaqueWrite).diagnostic, "original opaque diagnostic survives successful acknowledgement")
    observations.push({ case: `opaque-${gate}`, before: seed, result: operation.result, after: h.state(), io: h.io, schedules: h.schedules })
    await operation.writer.dispose()
  }
  for (const repairedName of [setupName, "doc:settings"]) {
    const seed = removalFixture(true), pushed = json(json(seed.local.sync).pushed)
    delete pushed[repairedName]
    if (repairedName === "doc:settings") seed.sync["s:settings"] = copy(seed.local[repairedName]!)
    const h = createRemovalHarness(seed, { details: true }), operation = await action(h)
    const completed = expected(seed, true)
    json(json(completed.local.sync).pushed)[repairedName] = json(seed.local[repairedName]).gen!
    equal(operation.result, { kind: "committed" }, "removal commits with current acknowledged repair")
    equal(h.state(), completed, "complete repaired removal preserves full state")
    const materialization = h.mutations.find(entry => entry.kind.startsWith(`local.set:${setupName}`))
    check(materialization?.kind.endsWith(",sync"), "fixed tombstones and legitimate repair share one materialization batch")
    h.time(5000)
    const flushed = await operation.writer.flushSync()
    check(flushed.kind === "pushed", "repaired removal remains admissible to ordinary combined flush")
    equal(flushed.sent.length, documents.length + (repairedName === "doc:settings" ? 1 : 2), "flush sends pending and restoration without resending repaired unchanged Settings")
    observations.push({ case: "acknowledged-repair", repairedName, before: seed, result: operation.result, afterRemoval: completed, flushed, after: h.state(), io: h.io, mutations: h.mutations })
    await operation.writer.dispose()
    if (repairedName === setupName) {
      check(materialization, "repair materialization boundary retained")
      const torn = createRemovalHarness(seed, { fault: { at: materialization.n, when: "after", kind: "partial", members: 1 } }), work = await action(torn)
      check(work.result.kind === "unconfirmed", "torn repair materialization cannot commit")
      const interrupted = torn.state(); await work.writer.dispose()
      const resumed = createRemovalHarness(interrupted), next = api.starting({ ...resumed.deps, startup: resumed.startup })
      let failure: unknown
      try { await next.ready() } catch (error) { failure = error }
      check(failure instanceof Error && failure.name === "StartupReadinessError", "unresolved torn repair debt blocks readiness without choosing a winner")
      equal(resumed.state(), interrupted, "torn repair debt preserves fixed record and every remaining dependency")
      equal(resumed.counts().generations, 0, "torn repair recovery never restamps")
      observations.push({ case: "torn-repair", before: seed, result: work.result, interrupted, after: resumed.state(), error: failure, io: torn.io, restartIo: resumed.io })
      await next.dispose()
    }
  }
  for (const synced of [false, true]) {
    const baseline = baselines.find(item => item.synced === synced)!
    for (const first of ["read", "notice", "acknowledge", "settings", "claim", "filter", "receive", "flush", "start"] as const) {
      const seed = copy(baseline.accepted), h = createRemovalHarness(seed, { host: false })
      const writer = api.create({ ...h.deps, claim: { kind: "fixture",
        authority: { async read() { return { kind: "ready", authority: { acct, lease: "fixture", browserSession: "fixture", consentGeneration: "fixture", signedIn: true, incognito: false } } } },
        session: { async takeLookup() { throw Error("Pending removal must block claim lookup") } },
        ownership: { async lookup() { throw Error("Pending removal must block ownership lookup") } }
      } })
      let result: unknown
      switch (first) {
        case "read": result = await writer.read("settings"); break
        case "notice": result = await writer.readClaimNotice(); break
        case "acknowledge": result = await writer.acknowledgeClaimNotice(ui, { acct, dropped: 1 }); break
        case "settings": result = await writer.changeSharedSetting(ui, { kind: "theme", value: "dark" }); break
        case "claim": result = await writer.claim(); break
        case "filter": {
          const playlist = "PL_selected"
          if (!isPlaylistId(playlist)) throw Error("Invalid synthetic playlist")
          result = await writer.change(ui, { acct, playlist, desired: { mode: "deny", on: true }, clearListedChannels: "confirmed", expectedGeneration: "before-PL_selected" }); break
        }
        case "receive": result = await writer.receiveSyncDocument({ kind: "settings" }); break
        case "flush": result = await writer.flushSync(); break
        case "start": await writer.startSync(); break
      }
      if (first !== "start") check(object(result) && result.kind === "unavailable", "first owner operation cannot bypass pending removal")
      equal(h.state(), seed, "first owner operation preserves blocked pending state")
      equal(h.mutations, [], "first owner operation cannot write through pending removal")
      equal(h.counts().subscriptions, 0, "first owner operation cannot subscribe through pending removal")
      observations.push({ case: `pending-first-${first}`, synced, before: seed, result: result ?? null, after: h.state(), io: h.io })
      await writer.dispose()
    }
    for (const invalid of ["new-lifetime", "same-gen-divergence", "different-account", "unexpected-filter", "mode", "revoked-consent", "history", "future-record", "future-session", "missing-host"] as const) {
      if (!synced && invalid === "history") continue
      const seed = copy(baseline.accepted)
      if (invalid === "new-lifetime") { json(seed.local[setupName]).gen = "recreated"; seed.local[`cache:${acct}`] = { newLifetime: true } }
      if (invalid === "same-gen-divergence") { json(seed.local[setupName]).newLifetime = true; seed.local[`progress:${acct}:15`] = { newLifetime: true } }
      if (invalid === "different-account") json(seed.local[pendingAccountRemovalKey]).acct = other
      if (invalid === "unexpected-filter") seed.local[`doc:filter:${acct}:PL_unexpected`] = { v: 1, gen: "unexpected", at: 1, by: "other", data: {} }
      if (invalid === "mode") json(seed.local.device).syncOn = !synced
      if (invalid === "revoked-consent") json(seed.local.device).consent = null
      if (invalid === "history") json(seed.local.sync).joined = "new-history"
      if (invalid === "future-record") json(seed.local[pendingAccountRemovalKey]).v = 2
      if (invalid === "future-session") seed.session.shown = { v: 2, global: {}, accounts: {} }
      const h = createRemovalHarness(seed, { host: invalid !== "missing-host" }), writer = api.starting({ ...h.deps, startup: h.startup })
      let failure: unknown
      try { await writer.ready() } catch (error) { failure = error }
      check(failure instanceof Error && failure.name === "StartupReadinessError", "invalid pending facts block readiness")
      equal(h.state(), seed, "stale accepted removal preserves recreated and unrelated state")
      equal(h.mutations, [], "stale accepted removal never touches dependencies")
      equal((await writer.read("settings")).kind, "unavailable", "blocked pending startup never exposes a view")
      equal((await writer.flushSync()).kind, "unavailable", "blocked pending startup cannot flush")
      const rawOwner = api.create(h.deps)
      equal((await rawOwner.read("settings")).kind, "unavailable", "preinitialized constructor cannot bypass pending detection")
      equal((await rawOwner.changeSharedSetting(ui, { kind: "theme", value: "dark" })).kind, "unavailable", "pending record blocks new shared writes")
      observations.push({ case: `pending-${invalid}`, synced, before: seed, after: h.state(), error: failure, readinessResult: failure instanceof Error && "result" in failure ? failure.result : null, io: h.io })
      await rawOwner.dispose(); await writer.dispose()
    }
    for (const change of ["recreated", "record-replaced", "record-transient", "record-replaced-in-session", "recreated-in-session", "device-extension", "session-extension", "other-account"] as const) {
      const h = createRemovalHarness(baseline.seed)
      let inserted = false
      h.hook(kind => {
        if (change === "record-transient" && inserted && kind === "session.get") h.foreign(state => { delete json(state.local[pendingAccountRemovalKey]).extension })
        if (inserted || kind !== (change.endsWith("-in-session") ? "session.get" : "local.get") || !h.mutations.some(entry => entry.kind.includes(synced ? `local.set:${setupName}` : `local.remove:${setupName}`))) return
        inserted = true
        h.foreign(state => {
          if (change === "recreated" || change === "recreated-in-session") { state.local[setupName] = { ...json(baseline.seed.local[setupName]), gen: "recreated" }; state.local[`cache:${acct}`] = { newLifetime: true } }
          if (change === "record-replaced" || change === "record-transient" || change === "record-replaced-in-session") json(state.local[pendingAccountRemovalKey]).extension = { replaced: true }
          if (change === "device-extension") json(state.local.device).newUnrelatedField = true
          if (change === "session-extension") json(state.session.gather).newUnrelatedField = true
          if (change === "other-account") json(state.local[`cache:${other}`]).newUnrelatedField = true
        })
      })
      const operation = await action(h)
      check(inserted, "foreign change occurs between awaited document and cleanup operations")
      check(operation.result.kind === "unconfirmed", "changed authority or full state stops cleanup")
      check(Object.hasOwn(h.state().local, `cache:${acct}`), "new lifetime and account dependencies survive stale cleanup")
      if (change === "device-extension") equal(json(h.state().local.device).newUnrelatedField, true, "stale whole Device write cannot erase unrelated changes")
      if (change === "session-extension") equal(json(h.state().session.gather).newUnrelatedField, true, "stale whole session write cannot erase unrelated changes")
      observations.push({ case: `between-awaits-${change}`, synced, before: baseline.seed, result: operation.result, after: h.state(), io: h.io })
      await operation.writer.dispose()
    }
  }
  {
    const baseline = baselines.find(item => item.synced)!, batch = baseline.trace.find(entry => entry.phase === "invoked" && entry.kind.startsWith(`local.set:${setupName}`))!
    for (let members = 1; members < documents.length; members++) {
      const h = createRemovalHarness(baseline.seed, { fault: { at: batch.n, when: "after", kind: "partial", members } }), operation = await action(h)
      check(operation.result.kind === "unconfirmed", "torn document batch is never committed")
      const torn = h.state(); check(Object.hasOwn(torn.local, pendingAccountRemovalKey), "torn batch retains fixed intent")
      await operation.writer.dispose()
      const h2 = createRemovalHarness(torn), next = api.starting({ ...h2.deps, startup: h2.startup })
      equal(await next.ready(), "ok", "fresh admission completes every torn document boundary before readiness")
      equal(h2.state(), baseline.result, "torn batch resume retains exact fixed tombstones")
      equal(h2.counts().generations, 0, "partial resume never restamps")
      observations.push({ case: "torn-documents", members, before: baseline.seed, result: operation.result, torn, after: h2.state(), io: h.io, restartIo: h2.io })
      await next.dispose()
    }
  }
  for (const synced of [false, true]) {
    const baseline = baselines.find(item => item.synced === synced)!
    const invoked = baseline.trace.filter(entry => entry.phase === "invoked")
    const boundaries = invoked.filter((entry, index) => isMutation(entry.kind) || index > 0 && isMutation(invoked[index - 1]!.kind) || index >= invoked.length - 13)
    for (const boundary of boundaries) for (const when of ["before", "after"] as const) for (const browserRestart of [false, true]) {
      const h = createRemovalHarness(baseline.seed, { fault: { at: boundary.n, when, kind: "interrupt" } }), operation = await action(h)
      const interrupted = h.state(), accepted = Object.hasOwn(interrupted.local, pendingAccountRemovalKey)
      if (!accepted && Object.hasOwn(interrupted.local, setupName) && json(interrupted.local[setupName]).deleted !== true) equal(interrupted, baseline.seed, "no destructive effect before accepted pending record")
      await operation.writer.dispose()
      const serialized = JSON.stringify(interrupted), restored: RemovalFixtureState = JSON.parse(serialized)
      if (browserRestart) restored.session = {}
      const restarted = createRemovalHarness(restored), next = api.starting({ ...restarted.deps, startup: restarted.startup })
      equal(await next.ready(), "ok", "interrupted actual owner completes before readiness")
      if (accepted || !Object.hasOwn(interrupted.local, setupName) || synced && json(interrupted.local[setupName]).deleted === true) {
        const completed = copy(baseline.result); if (browserRestart) completed.session = {}
        equal(restarted.state(), completed, "restart uses fixed accepted facts and preserves unrelated complete state")
      } else equal(restarted.state(), restored, "unaccepted restart never synthesizes removal")
      check(!Object.hasOwn(restarted.state().local, pendingAccountRemovalKey), "ready state has no incomplete record")
      equal(restarted.counts().generations, 0, "restart never restamps fixed documents")
      check(!restarted.io.some(entry => entry.kind === "sync.set"), "startup completion never transmits")
      const idle = createRemovalHarness(restarted.state()), idleOwner = api.starting({ ...idle.deps, startup: idle.startup })
      equal(await idleOwner.ready(), "ok", "completed second restart releases")
      equal(idle.mutations, [], "completed second restart is idempotent")
      observations.push({ case: "interrupt", synced, at: boundary.n, operation: boundary.kind, when, browserRestart, preparation: operation.preparation, result: operation.result,
        interrupted, serialized, after: restarted.state(), io: h.io, restartIo: restarted.io, restartMutations: restarted.mutations })
      await idleOwner.dispose(); await next.dispose()
    }
    for (const boundary of invoked.filter(entry => isMutation(entry.kind))) for (const mode of ["reject-before", "reject-after", "ignored", "readback-failed"] as const) {
      const fault: Fault = mode === "readback-failed" ? { at: boundary.n + 1, when: "before", kind: "reject" } :
        { at: boundary.n, when: mode === "reject-before" ? "before" : "after", kind: mode === "ignored" ? "ignore" : "reject" }
      const h = createRemovalHarness(baseline.seed, { fault }), operation = await action(h)
      check(operation.result.kind !== "committed", "failed or ignored IO never reports commitment")
      if (mode.startsWith("reject")) check(operation.result.kind === "failed" && operation.result.error === h.error || operation.result.kind === "unconfirmed" && operation.result.mutation.kind === "rejected" && operation.result.mutation.error === h.error, "original mutation rejection retained")
      if (mode === "ignored") check(operation.result.kind === "unconfirmed", "resolved ignored effect is unconfirmed")
      if (mode === "readback-failed") check(operation.result.kind === "unconfirmed" && operation.result.cause.kind === "read-failed" && operation.result.cause.error === h.error, "original readback error retained")
      const beforeBlocked = copy(h.mutations)
      check((await operation.writer.read("settings")).kind === "unavailable", "uncertain cleanup blocks later read")
      check((await operation.writer.flushSync()).kind === "unavailable", "uncertain cleanup blocks flush")
      check((await operation.writer.receiveSyncDocument({ kind: "settings" })).kind === "unavailable", "uncertain cleanup blocks receive")
      equal(h.mutations, beforeBlocked, "uncertain owner performs no later mutation")
      const interrupted = h.state(); await operation.writer.dispose()
      const restarted = createRemovalHarness(interrupted), next = api.starting({ ...restarted.deps, startup: restarted.startup })
      equal(await next.ready(), "ok", "known fixed continuation recovers rejected and ignored effects")
      if (Object.hasOwn(interrupted.local, pendingAccountRemovalKey)) equal(restarted.state(), baseline.result, "recovery after failed mutation completes exact account lifetime")
      observations.push({ case: "io-failure", synced, operation: boundary.kind, at: boundary.n, mode, result: operation.result, before: baseline.seed, interrupted, after: restarted.state(), io: h.io, restartIo: restarted.io })
      await next.dispose()
    }
  }
  return { assertions, cases: observations.length, observations }
}

if (import.meta.main) process.stdout.write(JSON.stringify(await runAccountRemovalExecution(), (_, value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value) + "\n")
