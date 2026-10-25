import { expect, test } from "bun:test"
import { executeLegacyStartup } from "./legacy-execution"
import { planLegacyStartup, type StartupSnapshot, type MigrationContext } from "./legacy-startup"
import { LEGACY_DELETE_KEYS, UPGRADE_TRIGGER_KEYS, DEVELOPER_KEYS, type LegacyEvidence } from "./legacy"
import type { JsonValue } from "../../shared/contracts/json"

export async function executionAcceptance(api: {
  execute: typeof executeLegacyStartup; plan: typeof planLegacyStartup
  keys: typeof LEGACY_DELETE_KEYS; triggers: typeof UPGRADE_TRIGGER_KEYS; developer: typeof DEVELOPER_KEYS
}) {
  const observations: unknown[] = []
  let checks = 0
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown): string => JSON.stringify(value, (_, child: unknown) => child && typeof child === "object" && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child)
  function equal(actual: unknown, expected: unknown, label: string) {
    checks++
    if (stable(actual) !== stable(expected)) throw Error(label)
  }
  function check(value: unknown, label: string): asserts value { checks++; if (!value) throw Error(label) }
  const context: MigrationContext = { deviceId: "device", settingsGen: "migration", at: 7,
    shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] }
  function harness(seed: Record<string, unknown> = { playlists: ["PLabcdefghijklmnop"], watchLaterShortcut: "k" }) {
    let records = copy(seed)
    const effects: unknown[] = []
    let set: ((items: Readonly<Record<string, JsonValue>>) => Promise<void>) | undefined
    let remove: (() => Promise<void>) | undefined
    let database = async () => {}
    let session = async () => {}
    const snapshot = (): StartupSnapshot => {
      const values: LegacyEvidence["values"] = {}
      for (const key of ["playlists", "addToPlaylistID", "watchLaterShortcut", "requiredWatchPercentage", "toastEnabled", "channelFilters", "channelLabels"] as const) {
        if (Object.hasOwn(records, key)) values[key] = copy(records[key])
      }
      return { schema: records.schema, device: copy(records.device ?? null) ?? undefined,
        settingsDocument: records["doc:settings"] === undefined ? undefined : copy(records["doc:settings"]),
        unclaimed: records.unclaimed === undefined ? undefined : copy(records.unclaimed),
        legacy: { presentKeys: api.keys.filter(key => Object.hasOwn(records, key)), values,
          refreshTokenWasNonempty: Object.hasOwn(records, "refreshToken") },
        interimKeysPresent: Object.keys(records).filter(key => key.startsWith("account:") || ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].includes(key)) }
    }
    const local = { async set(items: Readonly<Record<string, JsonValue>>) {
      effects.push({ set: copy(items) }); if (set) await set(items); else records = { ...records, ...copy(items) }
    } }
    const host = { context: { ...context }, async readSnapshot() { effects.push("read"); return snapshot() },
      async removeLocal(keys: readonly (typeof api.keys[number])[]) {
        effects.push({ remove: [...keys] }); if (remove) await remove(); else for (const key of keys) delete records[key]
      },
      async deleteDatabase(name: "yt-playlist-tools") { effects.push({ database: name }); await database(); effects.push("database-done") },
      async removeSession(keys: readonly ["channelCache"]) { effects.push({ session: keys }); await session(); effects.push("session-done") }
    }
    return { local, host, effects, snapshot, run: () => api.execute({ local, host }), records: () => copy(records),
      replace: (next: Record<string, unknown>) => { records = copy(next) },
      set: (fn: typeof set) => { set = fn }, remove: (fn: typeof remove) => { remove = fn },
      database: (fn: typeof database) => { database = fn }, session: (fn: typeof session) => { session = fn } }
  }
  function save(label: string, h: ReturnType<typeof harness>, result: unknown) { observations.push({ label, result, effects: h.effects, records: h.records() }) }
  function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
  async function turns() { for (let i = 0; i < 40; i++) await Promise.resolve() }
  const fresh = harness({})
  equal(await fresh.run(), { kind: "ok" }, "fresh ready")
  equal(fresh.effects, ["read", { set: { schema: 1 } }, "read"], "fresh only schema")
  equal(fresh.records(), { schema: 1 }, "fresh has no user records")
  save("fresh", fresh, "ok")
  const noConfirm = harness({}); noConfirm.set(async () => {})
  equal(await noConfirm.run(), { kind: "unconfirmed", stage: "schema" }, "fresh readback required")
  for (const key of api.developer) {
    const h = harness({ [key]: key === "channelFilters" || key === "channelLabels" ? {} : false })
    equal(await h.run(), { kind: "ok" }, "developer alone fresh")
    equal(h.records(), { [key]: key === "channelFilters" || key === "channelLabels" ? {} : false, schema: 1 }, "developer alone retained")
    save(key, h, "fresh")
  }
  for (const key of api.triggers) for (const schema of [undefined, 1]) {
    const h = harness({ [key]: key === "playlists" ? [] : key === "toastEnabled" ? false : "", ...(schema ? { schema } : {}) })
    equal(await h.run(), { kind: "ok" }, "every released trigger upgrades")
    const writes = h.effects.filter(item => typeof item === "object" && item && "set" in item)
    const first = writes[0]
    check(first && typeof first === "object" && "set" in first && first.set && typeof first.set === "object", "upgrade batch exists")
    equal(Object.keys(first.set).sort(), ["device", "doc:settings", "unclaimed"], "exact upgrade three-key batch")
    equal(writes.length, schema ? 1 : 2, "schema existing skips only set")
    equal(h.effects.filter(item => typeof item === "object" && item && "remove" in item), [{ remove: [...api.keys] }], "all seventeen removed once")
    save(`${key}-${schema}`, h, "ok")
  }
  for (const marker of ["account:synthetic", "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]) {
    const h = harness({ playlists: [], [marker]: null }); equal(await h.run(), { kind: "unsupported-state", reason: "interim-profile" }, "interim refused")
    equal(h.effects, ["read"], "interim inert"); save(marker, h, "refused")
  }
  const newer = harness({ schema: 2, device: "bad" }); equal(await newer.run(), { kind: "newer-layout", version: 2 }, "newer first")
  equal(newer.effects, ["read"], "newer inert")
  for (const first of ["database", "session"]) {
    const h = harness(), db = deferred(), session = deferred()
    h.database(() => db.promise); h.session(() => session.promise)
    const planned = api.plan(h.snapshot(), context); check(planned.kind === "upgrade", "upgrade planned")
    const pending = h.run(); let released = false; void pending.then(() => { released = true })
    await turns()
    equal(h.effects, ["read", { set: planned.write }, "read", { remove: [...api.keys] }, "read", { database: "yt-playlist-tools" }, { session: ["channelCache"] }], "batch and exact ordered cleanup")
    const durable = h.records()
    equal(durable, { ...planned.write }, "all complete canonical values before cleanup completion")
    if (first === "database") db.resolve(); else session.resolve()
    await turns(); equal(released, false, "both effects required"); equal(h.records().schema, undefined, "schema last waits")
    if (first === "database") session.resolve(); else db.resolve()
    equal(await pending, { kind: "ok" }, "both release")
    equal(h.records(), { ...planned.write, schema: 1 }, "complete final canonical state")
    save(first, h, "ok")
  }
  for (const boundary of ["before-batch", "after-batch", "after-local", "after-database", "after-session", "after-schema"]) {
    const h = harness(), crash = Error(boundary), plan = api.plan(h.snapshot(), context)
    check(plan.kind === "upgrade", "crash plan")
    if (boundary === "before-batch") h.set(async () => { throw crash })
    if (boundary === "after-batch" || boundary === "after-schema") h.set(async items => {
      h.replace({ ...h.records(), ...items })
      if (boundary === "after-batch" || "schema" in items) throw crash
    })
    if (boundary === "after-local") h.remove(async () => {
      h.replace(Object.fromEntries(Object.entries(h.records()).filter(([key]) => !api.keys.some(legacy => legacy === key))))
      throw crash
    })
    if (boundary === "after-database") h.session(async () => { throw crash })
    if (boundary === "after-session") h.database(async () => { throw crash })
    try { await h.run(); throw Error("crash did not interrupt") } catch (error) { check(error === crash, "injected boundary interruption") }
    const durable = JSON.stringify(h.records())
    const restarted = harness(JSON.parse(durable))
    if (boundary !== "before-batch") { restarted.host.context.settingsGen = "not-used"; restarted.host.context.at = 999 }
    equal(await restarted.run(), { kind: "ok" }, "actual interrupted execution restart")
    equal(restarted.records(), { ...plan.write, schema: 1 }, "durable original identity survives boundary restart")
    save(`executed-${boundary}`, restarted, "ok")
  }
  const migration = harness(); const planned = api.plan(migration.snapshot(), context)
  check(planned.kind === "upgrade", "seed upgrade")
  const raw = { ...copy(planned.write),
    device: { id: planned.write.device.id, upgradeNote: copy(planned.write.device.upgradeNote), extension: { keep: [1, null] } },
    "doc:settings": { ...copy(planned.write["doc:settings"]), data: { theme: "dark", future: { keep: true } }, extension: [null, "keep"] },
    unclaimed: { ...copy(planned.write.unclaimed), extension: { keep: true } }
  }
  const pendingSeeds = [
    { ...raw, playlists: ["PLabcdefghijklmnop"] }, { ...raw }, { ...raw, schema: 1 }
  ]
  // Serialized durable boundaries after batch, removal, either cleanup and schema use the same pending records.
  for (const [boundary, seed] of ["after-batch", "after-local", "after-database", "after-session", "after-schema"].map((name, i) => [name, pendingSeeds[i === 0 ? 0 : i === 4 ? 2 : 1]] as const)) {
    check(seed, "boundary seed")
    const h = harness(copy(seed)); h.host.context.settingsGen = "unused"; h.host.context.at = 999
    equal(await h.run(), { kind: "ok" }, "restart resumes")
    equal(h.records(), { ...raw, schema: 1 }, "resume preserves raw IDs stamps extensions")
    equal(h.effects.filter(item => typeof item === "object" && item && "set" in item), boundary === "after-schema" ? [] : [{ set: { schema: 1 } }], "resume never rewrites batch")
    save(boundary, h, "ok")
  }
  for (const missing of ["device", "doc:settings", "unclaimed"]) {
    const seed: Record<string, unknown> = { ...raw, schema: 1, playlists: [] }; delete seed[missing]
    const h = harness(seed); const result = await h.run()
    check(result.kind === "invalid" || result.kind === "unsupported-state", "torn refused")
    equal(h.effects, ["read"], "torn no cleanup"); save(`torn-${missing}`, h, result)
  }
  for (const unclaimed of [null, { ...raw.unclaimed, autoAdd: [] }]) {
    const h = harness({ ...raw, unclaimed, schema: 1 })
    check((await h.run()).kind !== "ok", "null pending or mismatched facts refused"); equal(h.effects, ["read"], "invalid pending inert")
  }
  const consumed = harness({ schema: 1, unclaimed: null })
  equal(await consumed.run(), { kind: "ok" }, "consumed current"); equal(consumed.records(), { schema: 1, unclaimed: null }, "null retained")
  const collision = harness({ schema: 1, unclaimed: null, playlists: [] })
  equal(await collision.run(), { kind: "unsupported-state", reason: "canonical-collision" }, "consumed collision")
  const partial = harness({ unclaimed: null }); equal(await partial.run(), { kind: "unconfirmed", stage: "schema" }, "partial current no repair")
  equal(partial.effects, ["read"], "partial no schema repair")
  for (const defect of ["partial", "divergent", "legacy", "interim", "schema", "rejected-committed"]) {
    const h = harness(); const failure = Error("original batch rejection")
    h.set(async items => {
      const saved = h.records()
      h.replace({ ...saved, ...items })
      const changed = h.records()
      if (defect === "partial") delete changed.unclaimed
      if (defect === "divergent") changed.unclaimed = null
      if (defect === "legacy") changed.playlists = []
      if (defect === "interim") changed.sessionConsent = true
      if (defect === "schema") changed.schema = 1
      h.replace(changed)
      if (defect === "rejected-committed") throw failure
    })
    let result
    try { result = await h.run() } catch (error) { check(error === failure, "original batch error"); result = "rejected" }
    equal(result, defect === "rejected-committed" ? "rejected" : { kind: "unconfirmed", stage: "canonical-batch" }, "full batch confirmation")
    check(!h.effects.some(item => typeof item === "object" && item && "remove" in item), "unconfirmed batch never cleans")
    save(defect, h, result)
    if (defect === "rejected-committed") { const restarted = harness(h.records()); equal(await restarted.run(), { kind: "ok" }, "committed rejection resumes next owner") }
  }
  const omitted = harness(); omitted.remove(async () => {})
  equal(await omitted.run(), { kind: "unconfirmed", stage: "local-remove" }, "omitted local removal detected")
  check(!omitted.effects.some(item => typeof item === "object" && item && "database" in item), "failed remove no database")
  for (const stage of ["local-remove", "database", "session", "schema"]) {
    const h = harness(), error = Error(stage), held = deferred()
    if (stage === "local-remove") h.remove(async () => { throw error })
    if (stage === "database") { h.database(async () => { throw error }); h.session(() => held.promise) }
    if (stage === "session") { h.session(async () => { throw error }); h.database(() => held.promise) }
    if (stage === "schema") h.set(async items => { if ("schema" in items) throw error; h.replace({ ...h.records(), ...items }) })
    let settled = false
    const result = h.run().then(() => { throw Error("failure released") }, caught => { settled = true; check(caught === error, "native error identity"); return "rejected" })
    await turns()
    if (stage === "database" || stage === "session") { equal(settled, false, "failure drains sibling cleanup"); held.resolve() }
    equal(await result, "rejected", "cleanup failure closed")
    equal(h.records().schema, undefined, "failed cleanup cannot publish schema"); save(stage, h, "rejected")
  }
  return { checks, observations }
}

test("executes the exact startup and restart contract", async () => {
  const result = await executionAcceptance({ execute: executeLegacyStartup, plan: planLegacyStartup,
    keys: LEGACY_DELETE_KEYS, triggers: UPGRADE_TRIGGER_KEYS, developer: DEVELOPER_KEYS })
  expect(result.checks).toBeGreaterThan(180)
})
