import { consentObject, readConsentDevice } from "../../../src/background/store/consent-withdrawal"
import { sameSyncJson } from "../../../src/background/store/sync-write-admission"
import { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { isInterimSourceKey, isInterimCanonicalKey, type StoreStartupHost } from "../../../src/background/store/interim-persistence"
import { pendingAccountRemovalKey } from "../../../src/background/store/account-removal-execution"
import { pendingSyncJoinKey } from "../../../src/background/store/sync-join-persistence"
import { createStoreLifecycle, clearMarkerKey, type ClearAllResult, type LifecycleState, type SettingsPageOrigin, type StartingOwner,
  type StoreLifecycle, type StoreLifecycleDependencies } from "../../../src/background/store/store-lifecycle"
import type { JsonObject, JsonValue } from "../../../src/shared/contracts/json"

export type LifecycleStores = { local: JsonObject; session: JsonObject; database: "present" | "absent" }
type SupervisorPort = "local.get" | "local.set" | "local.remove" | "local.names" | "session.clear" | "session.names" | "database.delete" | "producers.quiesce"
type OwnerPort = "owner.dispose" | "owner.local.get" | "owner.local.set" | "owner.snapshot" | "owner.interim" | "owner.remove" | "owner.database" | "owner.session" | "owner.recovery-lookup"
export type LifecyclePort = SupervisorPort | OwnerPort
export type LifecycleFault = {
  readonly port: LifecyclePort
  readonly occurrence: number
  readonly mode: "reject" | "applied-reject" | "partial-reject" | "crash-before" | "crash-after" | "hold"
}
type HarnessOptions = {
  readonly faults?: readonly LifecycleFault[]; readonly names?: { readonly local: boolean; readonly session: boolean }
  readonly configureOwner?: (deps: Parameters<typeof createStartingLocalFilterWriter>[0], stores: () => LifecycleStores, lookupBoundary: () => Promise<void>) => Parameters<typeof createStartingLocalFilterWriter>[0]
  readonly onStop?: () => void
}

const credentialNames = ["refreshToken", "clientSecret", "accessToken"]
export const settingsOrigin: SettingsPageOrigin = { kind: "ui", page: "settings", origin: { kind: "ui", windowId: 1, incognito: false } }
export const privateSettingsOrigin: SettingsPageOrigin = { kind: "ui", page: "settings", origin: { kind: "ui", windowId: 2, incognito: true } }
export const unknownWindowOrigin: SettingsPageOrigin = { kind: "unavailable", reason: "privacy", page: "settings" }
export const unticked = { alsoSynced: false } as const
const ui = { kind: "ui", windowId: 1, incognito: false } as const

function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) }
function never<T>(): Promise<T> { return new Promise<T>(() => {}) }
function pick(records: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(records, key)).map(key => [key, copy(records[key]!)]))
}

const device = { id: "fixture", consent: { v: 1, at: 1000 }, syncOn: false, upgradeNote: null, claimNotice: null,
  newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: true, x: "keep" }
const settingsDocument = { v: 1, gen: "settings", at: 1, by: "old", data: {} }
const heldSync = { joined: "history", pushed: {}, status: "off", editedSinceOff: false,
  opaqueWrite: { gate: { kind: "held", notBefore: 1060000 }, diagnostic: { name: "Original", message: "opaque" } } }
const progress = (count: number): JsonObject => Object.fromEntries(Array.from({ length: count }, (_, shard) => [`progress:AAAAAAAAAAAAAAAA:${shard}`, { aaaaaaaaaaa: { len: 60, parts: [[1, 2]], at: 1 } }]))
const marker = { [clearMarkerKey]: { v: 1, kind: "clear-all" } }
const session = (): JsonObject => ({ channelCache: { UC_synthetic: "Synthetic channel" }, tabRegistry: { 7: "watch" } })

export const lifecycleSeeds = {
  fresh: (): LifecycleStores => ({ local: {}, session: {}, database: "absent" }),
  current: (): LifecycleStores => ({ local: { schema: 1, device, unclaimed: null, "doc:settings": settingsDocument, sync: heldSync, ...progress(3) }, session: session(), database: "present" }),
  joined: (): LifecycleStores => ({ local: { schema: 1, device: { ...device, syncOn: true }, unclaimed: null, "doc:settings": settingsDocument,
    sync: { ...heldSync, status: "ok", opaqueWrite: { gate: null, diagnostic: null } } }, session: session(), database: "present" }),
  heldJoin: (): LifecycleStores => ({ local: { schema: 1, device, unclaimed: null, "doc:settings": settingsDocument, [pendingSyncJoinKey]: { v: 9, phase: "accepted" } }, session: session(), database: "present" }),
  malformed: (): LifecycleStores => ({ local: { schema: 1, device: "not-a-device", "doc:settings": [null] }, session: {}, database: "present" }),
  newer: (): LifecycleStores => ({ local: { schema: 2, device: { future: true }, "doc:future": { v: 7 }, ...progress(2) }, session: session(), database: "present" }),
  heldRemovalMarker: (): LifecycleStores => ({ local: { ...marker, schema: 1, device, unclaimed: null, "doc:settings": settingsDocument,
    [pendingAccountRemovalKey]: { v: 1, kind: "account-removal", acct: "AAAAAAAAAAAAAAAA" }, ...progress(2) }, session: session(), database: "present" }),
  credentialsMarker: (): LifecycleStores => ({ local: { [clearMarkerKey]: { v: 99, kind: "future-clear" }, schema: 2, refreshToken: "synthetic-refresh",
    clientSecret: "synthetic-secret", accessToken: "synthetic-access", ...progress(40) }, session: session(), database: "present" })
} as const

export function createLifecycleHarness(seed: LifecycleStores, options: HarnessOptions = {}) {
  const stores = copy(seed)
  let faults = [...options.faults ?? []]
  const error = Object.assign(new Error("Synthetic lifecycle fault"), { name: "LifecycleFault" })
  const calls: JsonValue[] = []
  const counts = new Map<LifecyclePort, number>()
  const holds = new Map<LifecyclePort, () => void>()
  const arrivals = new Map<LifecyclePort, () => void>()
  const arrivalsAt = new Map<string, () => void>()
  const completions = new Map<string, () => void>()
  let crashed = false
  let signalCrash = () => {}
  const crash = new Promise<void>(resolve => { signalCrash = resolve })
  const ledger = { ownersStarted: 0, liveOwners: 0, maxLiveOwners: 0, exclusionViolations: 0, syncCalls: 0, hostCalls: 0, wholeAreaSupervisorReads: 0, credentialReads: 0, timersArmed: 0 }
  const supervisorReads: string[][] = []
  let producers: "running" | "quiesced" = "running"
  const scheduled: { label: string; run: () => Promise<unknown> }[] = []
  const inflight = new Set<Promise<unknown>>()
  let generation = 0

  async function performPort<T>(name: LifecyclePort, actor: string, detail: readonly string[], apply: () => T, partial?: () => void): Promise<T> {
    if (crashed) return never()
    const occurrence = (counts.get(name) ?? 0) + 1
    counts.set(name, occurrence)
    calls.push([actor, name, ...detail])
    arrivals.get(name)?.()
    arrivalsAt.get(`${name}:${occurrence}`)?.()
    const fault = faults.find(entry => entry.port === name && entry.occurrence === occurrence)
    if (!fault) return apply()
    switch (fault.mode) {
      case "reject": throw error
      case "applied-reject": apply(); throw error
      case "partial-reject": partial?.(); throw error
      case "crash-before": crashed = true; signalCrash(); return never()
      case "crash-after": apply(); crashed = true; signalCrash(); return never()
      case "hold":
        await new Promise<void>(resolve => holds.set(name, resolve))
        if (crashed) return never()
        return apply()
    }
  }
  async function port<T>(name: LifecyclePort, actor: string, detail: readonly string[], apply: () => T, partial?: () => void): Promise<T> {
    const id = `${name}:${(counts.get(name) ?? 0) + 1}`
    try { return await performPort(name, actor, detail, apply, partial) }
    finally { completions.get(id)?.(); completions.delete(id) }
  }
  function exclusive() {
    if (ledger.liveOwners !== 0 || producers !== "quiesced") ledger.exclusionViolations++
  }
  function host<T>(label: string, value: T): Promise<T> {
    ledger.hostCalls++
    calls.push(["host", label])
    return Promise.resolve(value)
  }
  const hostSession = { get: () => host("session.get", {}), set: () => host("session.set", undefined), remove: () => host("session.remove", undefined) }

  function ownerDependencies(actor: string): Parameters<typeof createStartingLocalFilterWriter>[0] {
    const startup: StoreStartupHost = {
      context: { deviceId: "fixture", settingsGen: "migration", at: 1, shortcutId: "orig01", platform: { browser: "chrome", os: "linux" }, commands: [] },
      readInterimSnapshot: () => port("owner.interim", actor, [], () => {
        const saved = copy(stores.local)
        return { source: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimSourceKey(key))),
          canonical: Object.fromEntries(Object.entries(saved).filter(([key]) => isInterimCanonicalKey(key))),
          checkpoint: Object.hasOwn(saved, "interimConversion") ? { kind: "present" as const, value: saved.interimConversion } : { kind: "absent" as const },
          historicalAuthorization: { kind: "unknown" as const }, priorCredentialPresence: { kind: "unknown" as const } }
      }),
      readSnapshot: () => port("owner.snapshot", actor, [], () => {
        const saved = copy(stores.local)
        return { schema: saved.schema, device: saved.device, settingsDocument: saved["doc:settings"], unclaimed: saved.unclaimed,
          legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [] }
      }),
      removeLocal: keys => port("owner.remove", actor, [...keys], () => { for (const key of keys) delete stores.local[key] }),
      deleteDatabase: () => port("owner.database", actor, [], () => { stores.database = "absent" }),
      removeSession: keys => port("owner.session", actor, [...keys], () => { for (const key of keys) delete stores.session[key] })
    }
    return {
      startup,
      local: {
        get: keys => port("owner.local.get", actor, keys === null ? ["*"] : [...keys], () => keys === null ? copy(stores.local) : pick(stores.local, keys)),
        set: items => port("owner.local.set", actor, Object.keys(items), () => { Object.assign(stores.local, copy(items)) })
      },
      claim: { kind: "unavailable" },
      removal: { kind: "fixture", removeLocal: () => host("removal.removeLocal", undefined), session: hostSession },
      join: { kind: "fixture", removeLocal: () => host("join.removeLocal", undefined), session: hostSession },
      sync: {
        get: () => { ledger.syncCalls++; calls.push([actor, "sync.get"]); return Promise.resolve({}) },
        set: () => { ledger.syncCalls++; calls.push([actor, "sync.set"]); return Promise.resolve() },
        subscribe: () => { ledger.syncCalls++; calls.push([actor, "sync.subscribe"]); return () => {} }
      },
      syncClock: { now: () => 0, wallNow: () => 1000000, after: () => { ledger.timersArmed++; return () => {} } },
      now: () => 100,
      generation: () => `generation-${++generation}`,
      onSyncResult: () => { calls.push([actor, "sync-result"]) }
    }
  }

  const deps = (): StoreLifecycleDependencies => ({
    consentDevice: {
      get: keys => { calls.push(["consent", "get", [...keys]]); return Promise.resolve(pick(stores.local, keys)) },
      set: items => port("local.set", "consent", Object.keys(items), () => { exclusive(); Object.assign(stores.local, copy(items)) })
    },
    startOwner() {
      if (ledger.liveOwners !== 0) ledger.exclusionViolations++
      const actor = `owner${++ledger.ownersStarted}`
      ledger.liveOwners++
      ledger.maxLiveOwners = Math.max(ledger.maxLiveOwners, ledger.liveOwners)
      calls.push(["supervisor", "start-owner", actor])
      const defaults = ownerDependencies(actor)
      const owner = createStartingLocalFilterWriter(options.configureOwner?.(defaults, () => copy(stores), () => port("owner.recovery-lookup", actor, [], () => undefined)) ?? defaults)
      return { ...owner, async dispose() {
        await port("owner.dispose", actor, [], () => undefined)
        const draining = owner.dispose()
        options.onStop?.()
        await draining
        ledger.liveOwners--
        calls.push([actor, "drained"])
      } }
    },
    local: {
      get(keys) {
        const requested: readonly string[] | null = keys
        if (requested === null) ledger.wholeAreaSupervisorReads++
        else {
          supervisorReads.push([...requested])
          if (requested.some(key => credentialNames.includes(key))) ledger.credentialReads++
        }
        return port("local.get", "supervisor", requested ?? ["*"], () => pick(stores.local, requested ?? []))
      },
      set(items) {
        return port("local.set", "supervisor", Object.keys(items), () => { exclusive(); Object.assign(stores.local, copy(items)) })
      },
      remove(keys) {
        const names = [...keys]
        return port("local.remove", "supervisor", names, () => { exclusive(); for (const key of names) delete stores.local[key] },
          () => { exclusive(); for (const key of names.slice(0, Math.ceil(names.length / 2))) delete stores.local[key] })
      },
      ...options.names?.local === false ? {} : { names: () => port("local.names", "supervisor", [], () => Object.keys(stores.local)) }
    },
    session: {
      clear() {
        return port("session.clear", "supervisor", [], () => { exclusive(); for (const key of Object.keys(stores.session)) delete stores.session[key] },
          () => { exclusive(); const keys = Object.keys(stores.session); for (const key of keys.slice(0, Math.ceil(keys.length / 2))) delete stores.session[key] })
      },
      ...options.names?.session === false ? {} : { names: () => port("session.names", "supervisor", [], () => Object.keys(stores.session)) }
    },
    deleteDatabase: name => port("database.delete", "supervisor", [name], () => { exclusive(); stores.database = "absent" }),
    producers: {
      async quiesce() {
        await port("producers.quiesce", "supervisor", [], () => undefined)
        producers = "quiesced"
        for (const entry of scheduled.splice(0)) calls.push(["producer", entry.label, "cancelled"])
        await Promise.all([...inflight])
        calls.push(["producer", "quiesced"])
      }
    }
  })

  return {
    deps, error, calls, ledger, supervisorReads,
    stores: () => copy(stores),
    crashed: () => crashed,
    crash,
    arrival: (name: LifecyclePort, occurrence?: number) => new Promise<void>(resolve => { if (occurrence === undefined) arrivals.set(name, resolve); else arrivalsAt.set(`${name}:${occurrence}`, resolve) }),
    settlement: (name: LifecyclePort, occurrence: number) => new Promise<void>(resolve => completions.set(`${name}:${occurrence}`, resolve)),
    release(name: LifecyclePort) { const resolve = holds.get(name); holds.delete(name); resolve?.() },
    heal() { faults = [] },
    holdNext(name: LifecyclePort) { faults.push({ port: name, occurrence: (counts.get(name) ?? 0) + 1, mode: "hold" }) },
    producers: () => producers,
    schedule(label: string, run: () => Promise<unknown>) {
      if (producers === "quiesced") { calls.push(["producer", label, "refused"]); return }
      scheduled.push({ label, run })
    },
    fire(label: string) {
      const index = scheduled.findIndex(entry => entry.label === label)
      if (index < 0) { calls.push(["producer", label, "not-scheduled"]); return Promise.resolve(undefined) }
      const [entry] = scheduled.splice(index, 1)
      calls.push(["producer", label, "fire"])
      const running = entry!.run()
      const settled = () => { inflight.delete(running) }
      inflight.add(running)
      void running.then(settled, settled)
      return running
    }
  }
}
export type LifecycleHarness = ReturnType<typeof createLifecycleHarness>

const errorJson = (_: string, value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value
export function summarize(state: LifecycleState): JsonValue {
  if (state.kind === "active") return { kind: "active" }
  return JSON.parse(JSON.stringify(state, errorJson))
}
function resultJson(result: ClearAllResult): JsonValue { return JSON.parse(JSON.stringify(result, errorJson)) }
async function readiness(owner: StartingOwner | undefined): Promise<JsonValue> {
  if (!owner) return { kind: "no-owner" }
  try {
    return { kind: "ready", layout: await owner.ready() }
  } catch (error) {
    const result: unknown = error instanceof Error && "result" in error ? error.result : undefined
    return { kind: "rejected", name: error instanceof Error ? error.name : "unknown", result: result !== null && typeof result === "object" && "kind" in result && typeof result.kind === "string" ? result.kind : null }
  }
}

export async function openLifecycle(h: LifecycleHarness) {
  const supervisor = createStoreLifecycle(h.deps())
  const started = await supervisor.ready()
  return { supervisor, started: summarize(started), readiness: await readiness(supervisor.owner()) }
}

export async function reopen(stores: LifecycleStores) {
  const h = createLifecycleHarness(stores)
  const opened = await openLifecycle(h)
  return { h, ...opened }
}

export async function runDeviceLifecycle() {
  let assertions = 0
  const observations: JsonValue[] = []
  function check(value: unknown, label: string): asserts value { assertions++; if (!value) throw Error(label) }
  function equal(actual: unknown, expected: unknown, label: string) { check(JSON.stringify(actual) === JSON.stringify(expected), label) }
  function settledOwner(h: LifecycleHarness, label: string) {
    equal(h.ledger.exclusionViolations, 0, `${label}: no supervisor write or acquisition overlaps a live writer`)
    check(h.ledger.maxLiveOwners <= 1, `${label}: at most one admitted owner`)
    equal(h.ledger.syncCalls, 0, `${label}: unticked lifecycle performs no sync call`)
    equal(h.ledger.hostCalls, 0, `${label}: no pending removal or join continuation runs`)
    equal(h.ledger.wholeAreaSupervisorReads, 0, `${label}: the supervisor never reads the whole area`)
    equal(h.ledger.credentialReads, 0, `${label}: the supervisor never names a credential key`)
    check(h.supervisorReads.every(keys => keys.length === 1 && keys[0] === clearMarkerKey), `${label}: the supervisor reads only the marker`)
  }
  function erased(h: LifecycleHarness, label: string) {
    equal(h.stores(), { local: { schema: 1 }, session: {}, database: "absent" }, `${label}: confirmed erasure leaves only the fresh owner's schema`)
  }
  async function restart(h: LifecycleHarness, label: string) {
    const saved = h.stores(), next = await reopen(saved)
    const markerKept = Object.hasOwn(saved.local, clearMarkerKey)
    if (markerKept) {
      equal(next.started, { kind: "blocked", reason: "clear-pending" }, `${label}: a kept marker holds restart`)
      equal(next.h.ledger.ownersStarted, 0, `${label}: a held restart constructs no owner`)
      equal(next.h.ledger.hostCalls, 0, `${label}: a held restart continues no pending work`)
    }
    const retry = await next.supervisor.clearAll(settingsOrigin, unticked)
    if (markerKept) {
      check(retry.kind === "cleared" && retry.readiness.kind === "ready", `${label}: an explicit retry clears after restart`)
      erased(next.h, `${label} retry`)
    }
    settledOwner(next.h, `${label} restart`)
    await next.supervisor.dispose()
    return { saved, started: next.started, retry: resultJson(retry), after: next.h.stores(), calls: next.h.calls }
  }
  function intact(stores: LifecycleStores): LifecycleStores {
    const local = { ...stores.local }
    delete local[clearMarkerKey]
    return { ...stores, local }
  }
  async function scenario(id: string, seed: () => LifecycleStores, options: HarnessOptions & { origin?: SettingsPageOrigin; expect: ClearAllResult["kind"] | "crashed"; retry?: boolean }) {
    const h = createLifecycleHarness(seed(), options)
    const opened = await openLifecycle(h)
    const before = h.stores()
    const pending = opened.supervisor.clearAll(options.origin ?? settingsOrigin, unticked)
    const outcome = await Promise.race([pending, h.crash.then(() => undefined)])
    const incomplete = h.stores(), callsAtOutcome = [...h.calls]
    const observation: Record<string, JsonValue> = { id, seed: before, started: opened.started, readiness: opened.readiness,
      result: outcome ? resultJson(outcome) : { kind: "crashed" }, state: summarize(opened.supervisor.state()), after: incomplete, calls: callsAtOutcome }
    equal(outcome ? outcome.kind : "crashed", options.expect, `${id}: expected ${options.expect}`)
    if (outcome?.kind === "cleared") {
      if (outcome.readiness.kind === "ready") erased(h, id)
      else equal(h.stores(), { local: {}, session: {}, database: "absent" }, `${id}: erasure stays confirmed when fresh readiness fails`)
      if (options.faults?.some(fault => fault.mode === "applied-reject")) check(outcome.effects.some(effect => effect.effect !== "sync-reset" && effect.outcome.kind === "rejected"), `${id}: a rejected but applied effect keeps its original observation`)
    } else {
      check(opened.supervisor.owner() === undefined, `${id}: an incomplete clear exposes no owner`)
      if (outcome) equal(h.ledger.liveOwners, outcome.kind === "failed" && outcome.stage === "stop" && outcome.owner.kind === "rejected" ? 1 : 0, `${id}: no fresh owner after an incomplete clear`)
      if (outcome?.kind === "failed") {
        equal(intact(incomplete), intact(before), `${id}: a failed stop or marker changes no data`)
        check(!callsAtOutcome.some(call => Array.isArray(call) && ["session.clear", "database.delete", "local.remove"].includes(String(call[1]))), `${id}: a failed stop or marker runs no destructive effect`)
      } else check(Object.hasOwn(incomplete.local, clearMarkerKey) || Object.keys(incomplete.local).length === 0, `${id}: incomplete erasure keeps its marker until local is empty`)
    }
    observation.ledger = { ...h.ledger }
    settledOwner(h, id)
    if (outcome?.kind !== "cleared") observation.restart = await restart(h, id)
    if (outcome && outcome.kind !== "cleared" && options.retry) {
      h.heal()
      const retry = await opened.supervisor.clearAll(settingsOrigin, unticked)
      check(retry.kind === "cleared", `${id}: explicit retry on the same supervisor clears`)
      erased(h, `${id} retry`)
      settledOwner(h, `${id} retry`)
      observation.retry = resultJson(retry)
    }
    if (outcome) await opened.supervisor.dispose()
    else void opened.supervisor.dispose()
    observations.push(observation)
    return { h, outcome, incomplete }
  }

  for (const [name, seed] of Object.entries(lifecycleSeeds)) await scenario(`seed-${name}`, seed, { expect: "cleared" })
  await scenario("private-window", lifecycleSeeds.current, { origin: privateSettingsOrigin, expect: "cleared" })
  await scenario("unknown-window", lifecycleSeeds.current, { origin: unknownWindowOrigin, expect: "cleared" })

  const failures: readonly [string, LifecycleFault, ClearAllResult["kind"]][] = [
    ["quiesce-rejected", { port: "producers.quiesce", occurrence: 1, mode: "reject" }, "failed"],
    ["marker-set-rejected", { port: "local.set", occurrence: 1, mode: "reject" }, "failed"],
    ["marker-set-applied-rejected", { port: "local.set", occurrence: 1, mode: "applied-reject" }, "cleared"],
    ["marker-readback-rejected", { port: "local.get", occurrence: 2, mode: "reject" }, "failed"],
    ["session-partial", { port: "session.clear", occurrence: 1, mode: "partial-reject" }, "partial"],
    ["session-applied-rejected", { port: "session.clear", occurrence: 1, mode: "applied-reject" }, "cleared"],
    ["session-names-rejected", { port: "session.names", occurrence: 1, mode: "reject" }, "unconfirmed"],
    ["database-blocked", { port: "database.delete", occurrence: 1, mode: "reject" }, "partial"],
    ["local-names-rejected", { port: "local.names", occurrence: 1, mode: "reject" }, "unconfirmed"],
    ["local-remove-partial", { port: "local.remove", occurrence: 1, mode: "partial-reject" }, "partial"],
    ["local-remove-applied-rejected", { port: "local.remove", occurrence: 1, mode: "applied-reject" }, "cleared"],
    ["local-reenumeration-rejected", { port: "local.names", occurrence: 2, mode: "reject" }, "unconfirmed"],
    ["marker-remove-rejected", { port: "local.remove", occurrence: 3, mode: "reject" }, "partial"],
    ["marker-remove-applied-rejected", { port: "local.remove", occurrence: 3, mode: "applied-reject" }, "cleared"],
    ["final-names-rejected", { port: "local.names", occurrence: 3, mode: "reject" }, "unconfirmed"]
  ]
  for (const [id, fault, expect] of failures) await scenario(id, lifecycleSeeds.credentialsMarker, { faults: [fault], expect, retry: true })
  {
    const { outcome } = await scenario("dispose-rejected-live-owner", lifecycleSeeds.current, { faults: [{ port: "owner.dispose", occurrence: 1, mode: "reject" }], expect: "failed", retry: true })
    check(outcome?.kind === "failed" && outcome.stage === "stop" && outcome.owner.kind === "rejected", "a rejected owner stop is reported with its original error")
  }
  await scenario("session-names-missing", lifecycleSeeds.current, { names: { local: true, session: false }, expect: "unconfirmed" })
  await scenario("local-names-missing", lifecycleSeeds.current, { names: { local: false, session: true }, expect: "unconfirmed" })
  await scenario("fresh-readiness-rejected", lifecycleSeeds.credentialsMarker, { faults: [{ port: "owner.snapshot", occurrence: 1, mode: "reject" }], expect: "cleared" })

  const boundaries: readonly [string, LifecyclePort, number][] = [
    ["marker-set", "local.set", 1], ["session-clear", "session.clear", 1], ["database-delete", "database.delete", 1],
    ["local-batch-1", "local.remove", 1], ["local-batch-2", "local.remove", 2], ["marker-remove", "local.remove", 3]
  ]
  for (const [id, boundary, occurrence] of boundaries) for (const mode of ["crash-before", "crash-after"] as const) {
    const label = `crash-${mode}-${id}`
    const { h, incomplete } = await scenario(label, lifecycleSeeds.credentialsMarker, { faults: [{ port: boundary, occurrence, mode }], expect: "crashed" })
    check(h.crashed(), `${label}: the crash boundary was reached`)
    if (id === "marker-remove" && mode === "crash-after") equal(incomplete.local, {}, `${label}: a removed marker follows confirmed empty local data`)
    else check(Object.hasOwn(incomplete.local, clearMarkerKey), `${label}: every earlier crash leaves the marker`)
    if (!id.startsWith("local-batch") && id !== "marker-remove") equal(Object.hasOwn(incomplete.local, "refreshToken"), true, `${label}: original local data survives until named removal`)
  }
  for (const mode of ["crash-before", "crash-after"] as const) {
    const id = `crash-${mode}-marker-set-on-unmarked-store`
    const h = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "local.set", occurrence: 1, mode }] })
    const opened = await openLifecycle(h), before = h.stores()
    void opened.supervisor.clearAll(settingsOrigin, unticked)
    await h.crash
    void opened.supervisor.dispose()
    const saved = h.stores(), next = await reopen(saved)
    equal(intact(saved), intact(before), `${id}: no destructive step precedes the marker`)
    if (mode === "crash-before") {
      equal(next.started, { kind: "active" }, `${id}: an unmarked store restarts its ordinary owner`)
    } else equal(next.started, { kind: "blocked", reason: "clear-pending" }, `${id}: an applied marker holds restart`)
    observations.push({ id, saved, started: next.started, readiness: next.readiness })
    await next.supervisor.dispose()
  }

  {
    const id = "duplicates-and-invalid-calls"
    const h = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "session.clear", occurrence: 1, mode: "hold" }] })
    const opened = await openLifecycle(h), arrived = h.arrival("session.clear")
    const first = opened.supervisor.clearAll(settingsOrigin, unticked)
    const second = opened.supervisor.clearAll(privateSettingsOrigin, { alsoSynced: false })
    check(first === second, `${id}: duplicate valid calls share one promise`)
    const invalid: JsonValue[] = []
    const probes: [unknown, unknown][] = [
      [{ kind: "ui", page: "popup", origin: ui }, unticked], [{ kind: "ui", page: "settings", origin: { ...ui, windowId: -1 } }, unticked],
      [{ ...settingsOrigin, extra: true }, unticked], [{ kind: "tab", tabId: 1, incognito: false }, unticked], [settingsOrigin, { alsoSynced: "no" }],
      [settingsOrigin, { alsoSynced: false, extra: 1 }], [settingsOrigin, { alsoSynced: true }]
    ]
    for (const [origin, request] of probes) {
      // @ts-expect-error Untrusted message arguments reach the runtime validator.
      const result = opened.supervisor.clearAll(origin, request)
      check(result !== first, `${id}: an invalid or ticked call never joins the admitted clear`)
      invalid.push(resultJson(await result))
    }
    await arrived
    equal(h.calls.filter(call => Array.isArray(call) && call[1] === "session.clear").length, 1, `${id}: duplicates share one set of effects`)
    h.release("session.clear")
    const result = await first
    check(result.kind === "cleared", `${id}: the shared clear completes`)
    erased(h, id)
    settledOwner(h, id)
    observations.push({ id, invalid, result: resultJson(result), calls: h.calls })
    await opened.supervisor.dispose()
  }
  {
    const id = "ticked-clear-has-no-effect"
    const h = createLifecycleHarness(lifecycleSeeds.current())
    const opened = await openLifecycle(h), before = [...h.calls]
    const result = await opened.supervisor.clearAll(settingsOrigin, { alsoSynced: true })
    equal(result, { kind: "unavailable", reason: "synced-reset-unsupported" }, `${id}: ticked clear is unsupported`)
    equal(h.calls, before, `${id}: ticked clear performs no effect`)
    equal(summarize(opened.supervisor.state()), { kind: "active" }, `${id}: ticked clear leaves the owner active`)
    observations.push({ id, result: resultJson(result) })
    await opened.supervisor.dispose()
  }
  {
    const id = "late-bootstrap"
    const h = createLifecycleHarness(lifecycleSeeds.heldRemovalMarker(), { faults: [{ port: "local.get", occurrence: 1, mode: "hold" }] })
    const arrived = h.arrival("local.get"), supervisor = createStoreLifecycle(h.deps())
    equal(summarize(supervisor.state()), { kind: "starting" }, `${id}: construction returns before the marker read settles`)
    await arrived
    const result = await supervisor.clearAll(settingsOrigin, unticked)
    check(result.kind === "cleared", `${id}: Clear all is admitted while startup is pending`)
    const returned = h.settlement("local.get", 1)
    h.release("local.get")
    await returned
    const late = await supervisor.ready()
    equal(summarize(late), { kind: "active" }, `${id}: the late gate keeps the fresh owner`)
    equal(h.ledger.ownersStarted, 1, `${id}: late bootstrap completion starts no second owner`)
    equal(h.ledger.hostCalls, 0, `${id}: held removal receives no continuation call`)
    erased(h, id)
    settledOwner(h, id)
    observations.push({ id, result: resultJson(result), calls: h.calls })
    await supervisor.dispose()
  }
  {
    const id = "dispose-during-startup"
    const h = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "local.get", occurrence: 1, mode: "hold" }] })
    const arrived = h.arrival("local.get"), supervisor = createStoreLifecycle(h.deps())
    await arrived
    const disposed = supervisor.dispose()
    h.release("local.get")
    await disposed
    equal(h.ledger.ownersStarted, 0, `${id}: disposal prevents a later bootstrap owner`)
    equal(await supervisor.clearAll(settingsOrigin, unticked), { kind: "unavailable", reason: "disposed" }, `${id}: a disposed supervisor admits nothing`)
    observations.push({ id, state: summarize(supervisor.state()), calls: h.calls })
  }
  {
    const id = "dispose-during-clear"
    const h = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "session.clear", occurrence: 1, mode: "hold" }] })
    const opened = await openLifecycle(h), arrived = h.arrival("session.clear")
    const pending = opened.supervisor.clearAll(settingsOrigin, unticked)
    await arrived
    const disposed = opened.supervisor.dispose()
    h.release("session.clear")
    await disposed
    equal(await pending, { kind: "unavailable", reason: "disposed" }, `${id}: an interrupted clear reports disposal`)
    equal(h.ledger.ownersStarted, 1, `${id}: a disposed supervisor starts no fresh owner`)
    check(Object.hasOwn(h.stores().local, clearMarkerKey), `${id}: the marker survives an interrupted clear`)
    observations.push({ id, restart: await restart(h, id) })
  }
  {
    const id = "producers-and-delayed-callbacks"
    const h = createLifecycleHarness(lifecycleSeeds.current())
    const opened = await openLifecycle(h)
    h.holdNext("owner.local.set")
    const stale = opened.supervisor.owner()
    check(stale, `${id}: the current owner is active`)
    const outcomes: JsonValue[] = []
    h.schedule("routed", async () => { const owner = opened.supervisor.owner(); outcomes.push(owner ? (await owner.changeSharedSetting(ui, { kind: "theme", value: "light" })).kind : "no-owner") })
    h.schedule("stale", async () => { outcomes.push((await stale.changeSharedSetting(ui, { kind: "theme", value: "light" })).kind) })
    h.schedule("in-flight", async () => { outcomes.push((await stale.changeSharedSetting(ui, { kind: "theme", value: "dark" })).kind) })
    const arrived = h.arrival("owner.local.set")
    const inflight = h.fire("in-flight")
    await Promise.race([arrived, inflight])
    check(h.calls.some(call => Array.isArray(call) && call[1] === "owner.local.set"), `${id}: the in-flight producer reached the owner lane write`)
    const pending = opened.supervisor.clearAll(settingsOrigin, unticked)
    equal(opened.supervisor.owner(), undefined, `${id}: admission blocks owner acquisition at once`)
    check(!h.calls.some(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set"), `${id}: no marker while the owner lane holds a write`)
    h.release("owner.local.set")
    await inflight
    const result = await pending
    check(result.kind === "cleared", `${id}: the clear completes after the lane drains`)
    const markerAt = h.calls.findIndex(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set")
    const drainedAt = h.calls.findIndex(call => Array.isArray(call) && call[0] === "owner1" && call[1] === "drained")
    const writeAt = h.calls.findIndex(call => Array.isArray(call) && call[0] === "owner1" && call[1] === "owner.local.set")
    check(writeAt >= 0 && writeAt < drainedAt && drainedAt < markerAt, `${id}: the accepted lane write and drain precede the marker`)
    await h.fire("routed")
    outcomes.push((await stale.changeSharedSetting(ui, { kind: "theme", value: "light" })).kind)
    equal(outcomes.slice(-1), ["unavailable"], `${id}: a stale owner reference cannot write after the fence`)
    check(!h.calls.slice(markerAt).some(call => Array.isArray(call) && call[0] === "owner1" && call[1] === "owner.local.set"), `${id}: no retired owner write follows the marker`)
    erased(h, id)
    settledOwner(h, id)
    observations.push({ id, outcomes, result: resultJson(result), calls: h.calls })
    await opened.supervisor.dispose()
  }
  {
    const id = "cleared-event"
    const h = createLifecycleHarness(lifecycleSeeds.current(), { faults: [{ port: "session.clear", occurrence: 1, mode: "partial-reject" }] })
    const opened = await openLifecycle(h), events: JsonValue[] = []
    opened.supervisor.subscribe(event => { events.push({ ...event, owner: opened.supervisor.owner() ? "active" : "none" }) })
    const partial = await opened.supervisor.clearAll(settingsOrigin, unticked)
    equal(events, [], `${id}: an incomplete clear emits nothing`)
    h.heal()
    const result = await opened.supervisor.clearAll(settingsOrigin, unticked)
    equal(events, [{ kind: "cleared", next: "first-run", owner: "none" }], `${id}: confirmed erasure emits once while fresh readiness still fences access`)
    observations.push({ id, partial: resultJson(partial), result: resultJson(result), events })
    await opened.supervisor.dispose()
  }
  const malformedMarkerReads: readonly [string, unknown][] = [
    ["array", []], ["map", new Map()], ["custom-prototype", Object.create({ inherited: true })],
    ["extra-name", { device: null }], ["symbol-name", { [Symbol("unexpected")]: true }]
  ]
  for (const [label, raw] of malformedMarkerReads) {
    const id = `malformed-marker-read-${label}`, h = createLifecycleHarness(lifecycleSeeds.current()), deps = h.deps()
    let first = true
    const supervisor = createStoreLifecycle({ ...deps, local: { ...deps.local,
      // @ts-expect-error The fixture supplies a malformed named-read response.
      get(keys) { if (first) { first = false; return Promise.resolve(raw) } return deps.local.get(keys) }
    } })
    const started = summarize(await supervisor.ready())
    equal(started, { kind: "blocked", reason: "marker-read-failed", read: { kind: "invalid" } }, `${id}: malformed records hold startup`)
    equal(h.ledger.ownersStarted, 0, `${id}: no owner is acquired`)
    const result = await supervisor.clearAll(unknownWindowOrigin, unticked)
    check(result.kind === "cleared", `${id}: clear remains reachable`)
    erased(h, id); settledOwner(h, id)
    observations.push({ id, started, result: resultJson(result), calls: h.calls })
    await supervisor.dispose()
  }
  {
    const id = "fresh-readiness-duplicates-and-listener", h = createLifecycleHarness(lifecycleSeeds.current())
    const opened = await openLifecycle(h)
    h.holdNext("owner.snapshot")
    const arrived = h.arrival("owner.snapshot")
    let reentered: Promise<ClearAllResult> | undefined
    let events = 0
    opened.supervisor.subscribe(() => { if (++events === 1) reentered = opened.supervisor.clearAll(settingsOrigin, unticked) })
    const first = opened.supervisor.clearAll(settingsOrigin, unticked)
    await arrived
    const duplicate = opened.supervisor.clearAll(unknownWindowOrigin, unticked)
    check(first === duplicate && first === reentered, `${id}: the event and deferred readiness share the original operation`)
    equal(summarize(opened.supervisor.state()), { kind: "clearing" }, `${id}: fresh readiness retains the fence`)
    equal(opened.supervisor.owner(), undefined, `${id}: an unready fresh owner is not exposed`)
    equal(h.calls.filter(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set").length, 1, `${id}: only one marker write`)
    h.release("owner.snapshot")
    const result = await first
    equal(h.ledger.ownersStarted, 2, `${id}: exactly one fresh owner`)
    erased(h, id); settledOwner(h, id)
    observations.push({ id, result: resultJson(result), events, calls: h.calls })
    await opened.supervisor.dispose()
  }
  {
    const id = "dispose-during-fresh-readiness", h = createLifecycleHarness(lifecycleSeeds.current())
    const opened = await openLifecycle(h)
    h.holdNext("owner.snapshot")
    const arrived = h.arrival("owner.snapshot"), pending = opened.supervisor.clearAll(settingsOrigin, unticked)
    await arrived
    const disposed = opened.supervisor.dispose()
    h.release("owner.snapshot")
    const result = await pending
    await disposed
    check(result.kind === "cleared" && result.readiness.kind === "disposed", `${id}: erasure and disposal remain separate`)
    equal(h.ledger.liveOwners, 0, `${id}: the fresh owner drains`)
    equal(summarize(opened.supervisor.state()), { kind: "disposed" }, `${id}: completion never reactivates the owner`)
    equal(h.ledger.ownersStarted, 2, `${id}: disposal starts no replacement`)
    settledOwner(h, id)
    observations.push({ id, result: resultJson(result), stores: h.stores(), calls: h.calls })
  }
  {
    const id = "superseded-bootstrap-readiness", h = createLifecycleHarness(lifecycleSeeds.heldRemovalMarker(), { faults: [{ port: "local.get", occurrence: 1, mode: "hold" }] })
    const arrived = h.arrival("local.get"), supervisor = createStoreLifecycle(h.deps())
    let ready: JsonValue | undefined
    const startup = supervisor.ready().then(value => { ready = summarize(value) })
    await arrived
    const result = await supervisor.clearAll(settingsOrigin, unticked)
    equal(ready, { kind: "active" }, `${id}: clear settles readiness before the old read is released`)
    const returned = h.settlement("local.get", 1)
    h.release("local.get")
    await returned
    await startup
    await Promise.resolve()
    equal(h.ledger.ownersStarted, 1, `${id}: stale completion cannot acquire an owner`)
    erased(h, id); settledOwner(h, id)
    observations.push({ id, ready: ready ?? null, result: resultJson(result), calls: h.calls })
    await supervisor.dispose()
  }
  {
    const id = "throwing-inventory-getter", h = createLifecycleHarness(lifecycleSeeds.credentialsMarker()), deps = h.deps()
    let broken = true
    const supervisor = createStoreLifecycle({ ...deps, session: { ...deps.session,
      get names() { if (broken) throw Error("Synthetic inventory boundary failure"); return deps.session.names }
    } })
    await supervisor.ready()
    const result = await supervisor.clearAll(settingsOrigin, unticked)
    check(result.kind === "unconfirmed" && result.stage === "session" && result.inventory.kind === "rejected", `${id}: a throwing boundary settles unconfirmed`)
    equal(h.ledger.ownersStarted, 0, `${id}: no owner after incomplete cleanup`)
    check(Object.hasOwn(h.stores().local, clearMarkerKey), `${id}: the marker survives`)
    broken = false
    const retry = await supervisor.clearAll(settingsOrigin, unticked)
    check(retry.kind === "cleared", `${id}: retry is explicit`)
    erased(h, id); settledOwner(h, id)
    observations.push({ id, result: resultJson(result), retry: resultJson(retry), calls: h.calls })
    await supervisor.dispose()
  }
  for (const [label, raw] of [["null", null], ["object", {}], ["number", [1]], ["sparse", new Array(1)], ["exotic", new Set()]] as const) {
    const id = `malformed-inventory-${label}`, h = createLifecycleHarness(lifecycleSeeds.credentialsMarker()), deps = h.deps()
    const supervisor = createStoreLifecycle({ ...deps, session: { ...deps.session,
      // @ts-expect-error The fixture supplies an invalid name inventory.
      names: () => Promise.resolve(raw)
    } })
    await supervisor.ready()
    const result = await supervisor.clearAll(settingsOrigin, unticked)
    check(result.kind === "unconfirmed" && result.stage === "session" && result.inventory.kind === "invalid", `${id}: malformed inventory cannot authorize further erasure`)
    check(Object.hasOwn(h.stores().local, clearMarkerKey), `${id}: the marker remains`)
    equal(h.ledger.ownersStarted, 0, `${id}: no owner is acquired`)
    settledOwner(h, id)
    observations.push({ id, result: resultJson(result), stores: h.stores(), calls: h.calls })
    await supervisor.dispose()
  }
  {
    const id = "producer-stop-before-marker", h = createLifecycleHarness(lifecycleSeeds.current()), opened = await openLifecycle(h)
    h.holdNext("producers.quiesce")
    const arrived = h.arrival("producers.quiesce"), pending = opened.supervisor.clearAll(settingsOrigin, unticked)
    await arrived
    for (let turn = 0; turn < 80; turn++) await Promise.resolve()
    equal(h.ledger.liveOwners, 0, `${id}: the old owner has drained while the producer stop remains held`)
    check(!h.calls.some(call => Array.isArray(call) && call[0] === "supervisor" && call[1] === "local.set"), `${id}: a pending producer stop prevents marker writes`)
    h.release("producers.quiesce")
    const result = await pending
    check(result.kind === "cleared", `${id}: confirmed producer stop releases erasure`)
    erased(h, id); settledOwner(h, id)
    observations.push({ id, result: resultJson(result), calls: h.calls })
    await opened.supervisor.dispose()
  }
  {
    const id = "unconfirmed-final-inventory-event", h = createLifecycleHarness(lifecycleSeeds.credentialsMarker(), { faults: [{ port: "local.names", occurrence: 3, mode: "reject" }] })
    const opened = await openLifecycle(h), events: JsonValue[] = []
    opened.supervisor.subscribe(event => { events.push(event) })
    const result = await opened.supervisor.clearAll(settingsOrigin, unticked)
    check(result.kind === "unconfirmed" && result.stage === "marker", `${id}: final emptiness must be confirmed`)
    equal(events, [], `${id}: no cleared event for uncertain emptiness`)
    equal(h.ledger.ownersStarted, 0, `${id}: no fresh owner for uncertain emptiness`)
    settledOwner(h, id)
    observations.push({ id, result: resultJson(result), events, stores: h.stores(), calls: h.calls })
    await opened.supervisor.dispose()
  }
  return { assertions, cases: observations.length, observations }
}

if (import.meta.main) process.stdout.write(JSON.stringify(process.argv.includes("--withdrawal-only") ? await runConsentWithdrawalLifecycle() : await runDeviceLifecycle(), (_, value: unknown) => value instanceof Error ? { name: value.name, message: value.message } : value, 2) + "\n")

export async function runConsentWithdrawalLifecycle() {
  const observations: unknown[] = []
  const check = (value: unknown, message: string) => { if (!value) throw Error(message) }
  for (const origin of [settingsOrigin, privateSettingsOrigin, unknownWindowOrigin]) {
    const h = createLifecycleHarness(lifecycleSeeds.current()), supervisor = createStoreLifecycle(h.deps())
    await supervisor.ready()
    const before = h.stores(), read = readConsentDevice(before.local)
    if (read.kind !== "supported") throw Error("Invalid lifecycle Device")
    const result = await supervisor.withdrawConsent(origin, read.device.consent)
    check(result.kind === "withdrawn", "Exact withdrawal must confirm")
    check(supervisor.state().kind === "held", "Confirmed withdrawal must expose a classified held owner")
    check(h.ledger.syncCalls === 0, "Withdrawal must call no sync port")
    const after = h.stores()
    const restarted = createLifecycleHarness(after), next = createStoreLifecycle(restarted.deps())
    await next.ready()
    check(next.state().kind === "held", "Withdrawal restart must classify as held")
    check(restarted.ledger.hostCalls === 0, "Held restart must not resume any executor")
    const cleared = await next.clearAll(unknownWindowOrigin, unticked)
    check(cleared.kind === "cleared", "Unticked Clear all must remain available")
    await next.dispose(); await supervisor.dispose()
    observations.push({ origin, before, result, after, calls: h.calls, ledger: h.ledger,
      restart: { stores: restarted.stores(), calls: restarted.calls, ledger: restarted.ledger }, cleared })
  }
  return { cases: observations.length, observations, repair: await runConsentWithdrawalFaults() }
}

export async function runConsentWithdrawalFaults() {
  const modes = ["exact", "intent-reject", "intent-applied-reject", "intent-ignore", "intent-missing", "intent-malformed", "intent-different", "intent-read-failed",
    "baseline-different", "final-baseline-different", "final-baseline-read-failed", "final-reject", "final-applied-reject", "final-ignore", "final-device-only", "final-control-only",
    "final-missing", "final-malformed", "final-different", "final-read-failed"] as const
  const observations: unknown[] = []
  const check = (value: unknown, message: string) => { if (!value) throw Error(message) }
  let restartCount = 0
  let intentSeed: LifecycleStores | undefined
  for (const mode of modes) {
    const h = createLifecycleHarness(lifecycleSeeds.current()), deps = h.deps(), port = deps.consentDevice
    if (!port) throw Error("Missing named consent port")
    const boundaries: { boundary: string; stores: LifecycleStores }[] = [], effects: unknown[] = [], events: unknown[] = []
    let reads = 0, intentConfirmed = false, admitted = false
    const capture = (boundary: string) => { boundaries.push({ boundary, stores: h.stores() }) }
    const supervisor = createStoreLifecycle({ ...deps, consentDevice: {
      async get(keys) {
        if (!admitted) return port.get(keys)
        const index = ++reads
        capture(`read-${index}-before`)
        const records = await port.get(keys)
        capture(`read-${index}-after`)
        const target = index === 2 ? "baseline" : index === 3 ? "intent" : index === 4 ? "final-baseline" : index === 5 ? "final" : "none"
        if (mode === `${target}-read-failed`) throw Error("Synthetic confirmation read failure")
        if (mode === `${target}-missing`) { const missing = { ...records }; delete missing["consent:state"]; return missing }
        if (mode === `${target}-malformed`) return { ...records, "consent:state": { v: 1 } }
        if (mode === `${target}-different`) return { ...records, schema: 2 }
        if (index === 3) {
          const parsed = readConsentDevice(records), stored = h.stores().local
          intentConfirmed = consentObject(records) && parsed.kind === "supported" && parsed.control?.state.kind === "withdrawing" && sameSyncJson(records, pick(stored, keys))
        }
        return records
      },
      async set(items) {
        const stage = "device" in items ? "final" : "intent", before = h.stores()
        capture(`${stage}-write-before`)
        if (stage === "final") check(intentConfirmed, "Device mutation requires exact prior intent confirmation")
        check(stage !== "intent" || Object.keys(items).length === 1, "Intent may write only consent:state")
        const applied: string[] = []
        const effect = { stage, requested: copy(items), applied, before, after: before }
        effects.push(effect)
        if (mode === `${stage}-reject`) throw Error("Synthetic unchanged write rejection")
        if (mode !== `${stage}-ignore`) {
          if (mode === "final-device-only" && "device" in items) {
            const current = readConsentDevice(before.local)
            if (current.kind !== "supported" || !current.control) throw Error("Missing intent before Device-only effect")
            await port.set({ device: items.device, "consent:state": current.control })
            effect.applied = ["device"]
          } else if (mode === "final-control-only" && "device" in items) {
            const current = readConsentDevice(before.local)
            if (current.kind !== "supported") throw Error("Missing raw Device")
            await port.set({ device: current.raw, "consent:state": items["consent:state"] })
            effect.applied = ["consent:state"]
          } else { await port.set(items); effect.applied = Object.keys(items) }
        }
        effect.after = h.stores()
        if (stage === "intent" && mode === "exact") intentSeed = copy(effect.after)
        capture(`${stage}-write-after`)
        if (mode === `${stage}-applied-reject`) throw Error("Synthetic applied write rejection")
      }
    } })
    await supervisor.ready()
    admitted = true
    const before = h.stores(), read = readConsentDevice(before.local)
    if (read.kind !== "supported") throw Error("Invalid ordinary Device")
    supervisor.subscribe(event => { events.push(event) })
    const request = supervisor.withdrawConsent(settingsOrigin, read.device.consent)
    check(supervisor.withdrawConsent(settingsOrigin, read.device.consent) === request, "Exact duplicates must retain the same promise")
    const result = await request, after = h.stores()
    const complete = mode === "exact" || mode === "intent-applied-reject" || mode === "final-applied-reject"
    check((result.kind === "withdrawn") === complete, `${mode}: only exact final readback may report stored withdrawal`)
    check(events.length === (complete ? 1 : 0), "Intent alone must publish no stored-withdrawal event")
    if (result.kind === "withdrawn") {
      check(result.intent.write.kind === (mode === "intent-applied-reject" ? "rejected" : "resolved"), "Keep the intent promise outcome")
      check(result.write.kind === (mode === "final-applied-reject" ? "rejected" : "resolved"), "Keep the final promise outcome")
    }
    const preserved = copy(after)
    preserved.local.device = before.local.device!
    delete preserved.local["consent:state"]
    check(sameSyncJson(preserved, before), "Withdrawal preserves every unrelated store")
    await supervisor.dispose()
    const restarts: unknown[] = []
    for (const entry of boundaries) {
      const serialized = copy(entry.stores), restart = createLifecycleHarness(serialized), next = createStoreLifecycle(restart.deps())
      await next.ready()
      const protocol = Object.hasOwn(serialized.local, "consent:state"), phase = next.state().kind
      check(phase === (protocol ? "held" : "active"), "Every persisted protocol boundary must hold on restart")
      let work: unknown, agreement: Awaited<ReturnType<StartingOwner["readAgreement"]>> | undefined
      if (protocol) {
        const owner = next.owner()
        if (!owner) throw Error("Missing held inspection owner")
        work = await owner.readWithdrawnWork(ui)
        agreement = await owner.readAgreement(ui)
        const parsed = readConsentDevice(serialized.local)
        if (parsed.kind !== "supported" || parsed.control?.state.kind === "withdrawing") check(agreement.kind === "unavailable", "An incomplete intent cannot grant agreement")
      }
      check(sameSyncJson(restart.stores(), serialized), "Restart and inspection must preserve the complete store")
      check(restart.ledger.hostCalls === 0 && restart.ledger.syncCalls === 0 && restart.ledger.timersArmed === 0, "Held restart invokes no continuation or timer")
      await next.dispose()
      restarts.push({ boundary: entry.boundary, serialized, phase, parsed: readConsentDevice(serialized.local), work, agreement, after: restart.stores(), calls: restart.calls, ledger: restart.ledger })
      restartCount++
    }
    check(h.ledger.exclusionViolations === 0, "Both writes require owner and producer drain")
    let explicit: unknown
    const persisted = readConsentDevice(after.local)
    if (persisted.kind === "supported" && persisted.control?.state.kind === "withdrawing") {
      const retry = createLifecycleHarness(after), next = createStoreLifecycle(retry.deps())
      await next.ready()
      check(next.state().kind === "held" && sameSyncJson(retry.stores(), after), "Startup cannot complete an intent")
      const completion = await next.withdrawConsent(settingsOrigin, read.device.consent), finished = readConsentDevice(retry.stores().local)
      check(completion.kind === "withdrawn" && finished.kind === "supported" && finished.control?.state.kind === "withdrawn" && finished.control.generation === persisted.control.generation, "Explicit reconfirmation completes the same generation")
      await next.dispose()
      explicit = { kind: "reconfirm", seed: after, result: completion, after: retry.stores(), calls: retry.calls, ledger: retry.ledger }
    } else if (Object.hasOwn(after.local, "consent:state") && persisted.kind !== "supported") {
      const retry = createLifecycleHarness(after), next = createStoreLifecycle(retry.deps())
      await next.ready()
      check(next.state().kind === "held" && sameSyncJson(retry.stores(), after), "Divergent control stays held")
      const cleared = await next.clearAll(unknownWindowOrigin, unticked)
      check(cleared.kind === "cleared", "Clear all remains available for divergent control")
      await next.dispose()
      explicit = { kind: "clear-all", seed: after, result: cleared, after: retry.stores(), calls: retry.calls, ledger: retry.ledger }
    }
    observations.push({ mode, before, result, after, effects, events, calls: h.calls, ledger: h.ledger, restarts, explicit })
  }
  if (!intentSeed) throw Error("Missing actual intent seed")
  const parsed = readConsentDevice(intentSeed.local)
  if (parsed.kind !== "supported" || !parsed.control) throw Error("Invalid actual intent seed")
  const invalidRestarts: unknown[] = []
  const controls = [
    { label: "malformed-control", local: { ...intentSeed.local, "consent:state": { v: 1 } } },
    { label: "newer-control", local: { ...intentSeed.local, "consent:state": { v: 2 } } },
    { label: "different-device", local: { ...intentSeed.local, device: { ...parsed.raw, id: "different-device" } } },
    { label: "different-consent", local: { ...intentSeed.local, device: { ...parsed.raw, consent: { v: 1, at: 1001 } } } },
    { label: "newer-schema", local: { ...intentSeed.local, schema: 2 } },
    { label: "invalid-generation", local: { ...intentSeed.local, "consent:state": { ...parsed.control, generation: -1 } } }
  ]
  for (const entry of controls) {
    const serialized: LifecycleStores = { ...intentSeed, local: entry.local }, restart = createLifecycleHarness(serialized), next = createStoreLifecycle(restart.deps())
    await next.ready()
    check(next.state().kind === "held", "Malformed, newer and divergent control must hold")
    const owner = next.owner()
    if (!owner) throw Error("Missing held inspection owner")
    const work = await owner.readWithdrawnWork(ui), agreement = await owner.readAgreement(ui), beforeClear = restart.stores()
    check(agreement.kind === "unavailable" && sameSyncJson(beforeClear, serialized), "Invalid control cannot normalize or grant agreement")
    const cleared = await next.clearAll(unknownWindowOrigin, unticked)
    check(cleared.kind === "cleared", "Clear all remains available for every invalid control")
    await next.dispose()
    invalidRestarts.push({ label: entry.label, serialized, parsed: readConsentDevice(serialized.local), work, agreement, beforeClear, cleared, after: restart.stores(), calls: restart.calls, ledger: restart.ledger })
  }
  return { cases: observations.length, restartCount, observations, invalidRestarts }
}
