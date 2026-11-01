import { expect, test } from "bun:test"
import { createLocalFilterWriter, type LocalFilterChange, type LocalWriteStorage, type SyncAutomaticResult } from "./local-filter-writer"
import type { ClaimAuthority, ClaimAuthorityState } from "./local-claim-writer"
import { isAccountKey, isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model"
import type { JsonValue } from "../../shared/contracts/json"

async function compositionAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  let assertions = 0
  const observations: unknown[] = []
  function check(value: unknown, message: string): asserts value {
    assertions++
    if (!value) throw Error(message)
  }
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, message: string) {
    check(stable(actual) === stable(expected), `${message}: ${stable(actual)} != ${stable(expected)}`)
  }
  function gate() {
    let release = () => {}, enter = () => {}
    const held = new Promise<void>(done => { release = done })
    let reached = false
    const entered = new Promise<void>(done => { enter = done })
    return { release, get reached() { return reached }, entered, async wait() { reached = true; enter(); await held } }
  }
  async function settle() { for (let i = 0; i < 100; i++) await Promise.resolve() }
  const S = `doc:setup:${acct}`, F = `doc:filter:${acct}:${playlist}`, Q = `doc:filter:${acct}:PL_Q`
  const active: ClaimAuthority = { acct, lease: "fixture", browserSession: "session", consentGeneration: "consent", signedIn: true, incognito: false }
  const stamp = { v: 1, gen: "old", at: 1, by: "fixture", extension: { keep: true } }
  const notice = { acct, dropped: 0, claim: { autoAddAdded: 1, filtersAdded: 1, shortcut: { kind: "not-carried" } } }
  function seed(): Record<string, unknown> {
    return {
      schema: 1,
      device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, upgradeNote: null, claimNotice: null,
        newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: true, extension: [1, null] },
      "doc:settings": { ...stamp, data: {} },
      [S]: { ...stamp, data: { autoAdd: [{ pl: "PL_Q", takes: "shorts", pct: 0 }], extension: "setup" } },
      [Q]: { ...stamp, data: { mode: "deny", on: true, channels: [], extension: "filter" } },
      unclaimed: { from: "1.5.0", at: 1, autoAdd: [playlist], shortcutPlaylist: null, filters: { [playlist]: { mode: "allow", on: false, channels: [] } } },
      sync: { joined: "H", pushed: { "doc:settings": "old", [S]: "old", [Q]: "old" }, status: "off", editedSinceOff: false,
        extension: [null, { keep: true }], opaqueWrite: { gate: { kind: "held", notBefore: 90000, extra: "gate" }, diagnostic: { name: "original", message: "opaque", extra: 1 }, extra: "recovery" } },
      other: { retained: true }
    }
  }
  function harness(initial = seed()) {
    let records = copy(initial), mono = 0, wall = 1000000, reads = 0, authorityReads = 0, lookups = 0, generations = 0, clockReads = 0, nativeActive = 0, maximumNative = 0
    let authority: ClaimAuthorityState = { kind: "ready", authority: active }
    let listener: (() => void) | undefined
    const ledger = new Set<string>(), batches: unknown[] = [], effects: string[] = [], results: SyncAutomaticResult[] = [], timers: { run: () => void; cancelled: boolean }[] = []
    let remote: Record<string, unknown> = { "s:meta": { v: 1, id: "H", created: 1 } }
    for (const [key, value] of Object.entries(records)) if (key.startsWith("doc:")) remote[key.replace("doc:", "s:")] = copy(value)
    const hooks = { read: async (_count: number) => {}, lookup: async () => {}, set: async (items: Readonly<Record<string, JsonValue>>) => { records = { ...records, ...copy(items) } }, syncSet: async (items: Readonly<Record<string, JsonValue>>) => { remote = { ...remote, ...copy(items) } } }
    const local: LocalWriteStorage = {
      async get(keys) { effects.push("local.get"); await hooks.read(++reads); return copy(Object.fromEntries((keys ?? Object.keys(records)).filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]]))) },
      async set(items) { nativeActive++; maximumNative = Math.max(maximumNative, nativeActive); effects.push("local.set"); batches.push(copy(items)); try { await hooks.set(items) } finally { nativeActive-- } }
    }
    const deps = { local, claim: { kind: "fixture" as const,
      authority: { async read() { authorityReads++; effects.push("authority"); return authority } },
      session: { async takeLookup(a: ClaimAuthority) { const key = a.acct + a.browserSession; if (ledger.has(key)) return false; ledger.add(key); return true } },
      ownership: { async lookup(a: ClaimAuthority) { lookups++; effects.push("lookup"); await hooks.lookup(); return { kind: "fixture-owned" as const, authority: a, lineage: "local-migration-only" as const, ownedPlaylistIds: new Set([playlist]) } } } },
      sync: { async get() { effects.push("sync.get"); return copy(remote) }, async set(items: Readonly<Record<string, JsonValue>>) { nativeActive++; maximumNative = Math.max(maximumNative, nativeActive); effects.push("sync.set"); try { await hooks.syncSet(items) } finally { nativeActive-- } }, subscribe(changed: () => void) { effects.push("subscribe"); listener = changed; return () => { effects.push("unsubscribe"); listener = undefined } } },
      syncClock: { now() { clockReads++; return mono }, wallNow() { clockReads++; return wall }, after(_ms: number, run: () => void) { effects.push("timer"); const ticket = { run, cancelled: false }; timers.push(ticket); return () => { ticket.cancelled = true } } },
      now() { effects.push("stamp"); return 100 }, generation() { return `G${++generations}` }, onSyncResult(result: SyncAutomaticResult) { results.push(result) } }
    return { deps, hooks, batches, effects, results, timers, make: () => create(deps),
      get records() { return records }, set records(value) { records = value },
      get authority() { return authority }, set authority(value) { authority = value },
      get stats() { return { reads, authorityReads, lookups, generations, clockReads, maximumNative } },
      get listener() { return listener }, move(m: number, w = 1000000 + m) { mono = m; wall = w } }
  }
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const edit: LocalFilterChange = { acct, playlist, desired: { mode: "allow", on: true }, clearListedChannels: "not-confirmed" }
  {
    const h = harness(), w = create({ ...h.deps, claim: { kind: "unavailable" } }), before = copy(h.stats)
    equal(await w.claim(), { kind: "unavailable", reason: "authority" }, "disabled claim refuses")
    equal(h.stats, before, "disabled claim has no dependency calls"); equal(h.effects, [], "disabled claim has no effects"); await w.dispose()
  }
  {
    const h = harness(), pause = gate(), w = h.make()
    h.hooks.lookup = pause.wait
    const claiming = w.claim(); await settle(); check(pause.reached, "joint claim reaches held lookup"); await pause.entered
    const before = copy(h.stats), effects = h.effects.length
    const editing = w.change(origin, edit), receiving = w.receiveSyncDocument({ kind: "settings" }), flushing = w.flushSync(), starting = w.startSync()
    await settle()
    equal(h.stats.reads, before.reads, "held claim blocks queued reads"); equal(h.batches, [], "held claim blocks queued native writes")
    equal(h.effects.slice(effects), ["stamp"], "queued work performs only admission stamp")
    pause.release(); equal(await claiming, { kind: "committed", notice, write: { kind: "resolved" } }, "joint claim commits")
    equal(await editing, { kind: "result", result: { ok: true } }, "queued edit observes claimed selection")
    equal(await receiving, { kind: "unavailable", reason: "authority" }, "off receive refuses")
    equal(await flushing, { kind: "idle" }, "off flush stays idle"); await starting
    const old = seed(), rawDevice = old.device
    equal(h.batches, [{ device: { ...(typeof rawDevice === "object" ? rawDevice : {}), claimNotice: notice }, unclaimed: null,
      [S]: { ...stamp, gen: "G1", at: 100, data: { label: null, autoAdd: [{ pl: "PL_Q", takes: "shorts", pct: 0 }, { pl: playlist, takes: "videos" }], targets: {}, quickSave: null, musicSave: null, gather: null, marks: {}, extension: "setup" } },
      [F]: { v: 1, gen: "G2", at: 100, by: "fixture", data: { mode: "allow", on: false, channels: [] } },
      sync: { ...(typeof old.sync === "object" ? old.sync : {}), editedSinceOff: true, everEdited: true }
    }, { [F]: { v: 1, gen: "G3", at: 100, by: "fixture", data: { mode: "allow", on: true, channels: [] } } }], "claim exact notice/null batch then Filter-only edit")
    equal(h.stats.maximumNative, 1, "joint native invocations do not overlap")
    await w.dispose(); h.records = copy(h.records); const saved = copy(h.records), stats = copy(h.stats), restart = h.make()
    equal(await restart.claim(), { kind: "consumed" }, "serialized shared owner restart consumed")
    equal(h.records, saved, "restart retains exact saved notice/null"); equal(h.stats.lookups, stats.lookups, "restart has no lookup"); equal(h.stats.generations, stats.generations, "restart has no stamp")
    await restart.dispose(); observations.push({ kind: "joint", saved, batches: h.batches })
  }
  {
    const h = harness(), pause = gate(), w = h.make(), original = h.hooks.set
    h.hooks.set = async items => { await pause.wait(); await original(items) }
    h.records[S] = { ...stamp, data: { autoAdd: [{ pl: playlist }] } }
    const editing = w.change(origin, { ...edit, playlist, desired: { mode: "allow", on: true } }); await settle(); check(pause.reached, "Filter reaches held set"); await pause.entered
    const before = copy(h.stats), claiming = w.claim(); await settle()
    equal(h.stats, before, "claim waits for Filter native set before authority/read/lookup")
    pause.release(); await editing; equal((await claiming).kind, "committed", "claim follows Filter commit"); equal(h.stats.maximumNative, 1, "reverse Filter native invocations do not overlap"); await w.dispose()
  }
  for (const stage of ["prearm", "ack"] as const) {
    const h = harness(), pause = gate(), base = seed()
    const history = { joined: "H", pushed: { "doc:settings": "old", [S]: "old", [Q]: "old" }, status: "ok", editedSinceOff: false }
    h.records = { ...base, device: { ...(typeof base.device === "object" ? base.device : {}), syncOn: true }, sync: history, [Q]: { ...stamp, gen: "pending", at: 2, data: { mode: "deny", on: false, channels: [] } } }
    const original = h.hooks.set; let calls = 0
    h.hooks.set = async items => { if (++calls === (stage === "prearm" ? 1 : 2)) await pause.wait(); await original(items) }
    const w = h.make(); h.move(5000); const flushing = w.flushSync(); await settle(); check(pause.reached, "sync reaches held " + stage); await pause.entered
    const before = copy(h.stats), claiming = w.claim(); await settle(); equal(h.stats, before, "claim waits for sync " + stage)
    pause.release(); equal((await flushing).kind, "pushed", "held sync confirms " + stage)
    const effects = h.effects.length; equal(await claiming, { kind: "unavailable", reason: "sync-on" }, "queued sync-on claim refuses before lookup " + stage)
    check(!h.effects.slice(effects).some(effect => effect.startsWith("sync.")), "claim has zero native sync effects " + stage)
    equal(h.stats.lookups, 0, "sync-on never looks up " + stage); equal(h.stats.maximumNative, 1, "sync and claim do not overlap " + stage); await w.dispose()
  }
  for (const mode of ["partial", "read-failed", "authority", "resolved-bad", "complete", "none", "before-set"] as const) {
    const h = harness(), pause = gate(), w = h.make(), marker = { error: "synthetic" }, original = h.hooks.set
    h.hooks.lookup = pause.wait
    let injected = false
    if (mode === "before-set") h.deps.generation = () => { if (!injected) { injected = true; throw marker }; return "after-failure" }
    else h.hooks.set = async items => {
      if (injected) return original(items)
      injected = true
      if (mode === "complete" || mode === "authority" || mode === "read-failed") await original(items)
      if (mode === "partial") h.records.unclaimed = null
      if (mode === "authority") h.authority = { kind: "unavailable" }
      if (mode === "read-failed") h.hooks.read = async () => { throw marker }
      if (mode !== "resolved-bad") throw marker
    }
    const claiming = w.claim(); await settle(); check(pause.reached, "claim reaches held lookup " + mode); await pause.entered
    const editing = w.change(origin, edit), receiving = w.receiveSyncDocument({ kind: "settings" }), flushing = w.flushSync(), starting = w.startSync(), nextClaim = w.claim()
    pause.release(); const result = await claiming
    if (["complete", "none", "before-set"].includes(mode)) {
      equal(result.kind, mode === "complete" ? "committed" : "failed", "deterministic claim outcome " + mode)
      if (result.kind === "failed") check(result.error === marker, "original failure identity " + mode)
      check((await nextClaim).kind !== "unavailable" || mode === "none" || mode === "before-set", "deterministic outcome keeps claim admission")
      await editing; await receiving; await flushing; await starting
      check(h.effects.filter(effect => effect === "local.get").length > 3, "deterministic outcome keeps Filter ingress " + mode)
    } else {
      equal(result.kind, "unconfirmed", "uncertain result " + mode)
      const effects = h.effects.length, stats = copy(h.stats)
      equal(await editing, { kind: "unavailable", reason: "stale" }, "queued edit blocked by uncertainty " + mode)
      equal(await receiving, { kind: "unavailable", reason: "authority" }, "queued receive blocked by uncertainty " + mode)
      equal(await flushing, { kind: "unavailable" }, "queued flush blocked by uncertainty " + mode); await starting
      equal(await nextClaim, { kind: "unavailable", reason: "stale" }, "queued claim blocked by uncertainty " + mode)
      h.hooks.read = async () => {}; h.authority = { kind: "ready", authority: active }
      equal(await w.change(origin, edit), { kind: "unavailable", reason: "stale" }, "new edit blocked by uncertainty " + mode)
      equal(await w.receiveSyncDocument({ kind: "settings" }), { kind: "unavailable", reason: "authority" }, "new receive blocked by uncertainty " + mode)
      equal(await w.flushSync(), { kind: "unavailable" }, "manual success cannot revive uncertain owner " + mode); await w.startSync()
      equal(await w.claim(), { kind: "unavailable", reason: "stale" }, "new claim blocked by uncertainty " + mode)
      equal(h.stats, stats, "uncertainty closes all dependency calls " + mode); equal(h.effects.length, effects, "uncertainty closes all effects " + mode)
      equal(h.batches.length, 1, "uncertainty never rolls back or recomputes notice " + mode)
    }
    await w.dispose(); let rejected = false; try { await w.claim() } catch (error) { rejected = error instanceof Error && error.message === "Writer disposed" }
    check(rejected, "disposed precedence over uncertainty " + mode)
    observations.push({ kind: mode, result: result.kind, batches: h.batches })
  }
  {
    const h = harness(), pause = gate(), w = h.make(); h.hooks.lookup = pause.wait
    const first = w.claim(); await settle(); check(pause.reached, "draining claim reaches held lookup"); await pause.entered
    const preserved = copy(h.records), batches = copy(h.batches), lookups = h.stats.lookups
    const second = w.claim(); let drained = false; const disposal = w.dispose().then(() => { drained = true })
    await settle(); equal(drained, false, "disposal waits for held claim")
    let rejected = false; try { await w.claim() } catch (error) { rejected = error instanceof Error && error.message === "Writer disposed" }
    check(rejected, "disposal closes new claim immediately"); pause.release()
    equal(await first, { kind: "unavailable", reason: "stale" }, "stopped accepted claim cannot commit")
    equal(await second, { kind: "unavailable", reason: "startup" }, "stopped queued claim cannot consume work")
    await disposal; equal(drained, true, "disposal fulfills after held lookup drains")
    equal(h.records, preserved, "stopping preserves the complete store")
    equal(h.batches, batches, "stopping invokes no claim write after lookup")
    equal(h.stats.lookups, lookups, "queued claim invokes no successor lookup")
  }
  {
    const h = harness(), base = seed(), marker = { name: "opaque", message: "original" }
    h.records = { ...base, device: { ...(typeof base.device === "object" ? base.device : {}), syncOn: true }, sync: { joined: "H", pushed: { "doc:settings": "old", [S]: "old", [Q]: "old" }, status: "ok", editedSinceOff: false }, [Q]: { ...stamp, gen: "pending", at: 2, data: { mode: "deny", on: false, channels: [] } } }
    const w = h.make(); await w.startSync(); h.move(5000); h.hooks.syncSet = async () => { throw marker }
    const result = await w.flushSync(); check(result.kind === "sync-set-failed" && result.error === marker, "R155 retains original rejection")
    const invocations = h.effects.filter(effect => effect === "sync.set").length, tickets = h.timers.length
    h.move(65001); const before = h.stats.clockReads
    equal(await w.claim(), { kind: "unavailable", reason: "sync-on" }, "held sync-on claim refuses")
    equal(h.stats.clockReads, before, "claim creates no R155 clock/event grant")
    await settle(); equal(h.effects.filter(effect => effect === "sync.set").length, invocations, "claim completion creates no recovery attempt"); equal(h.timers.length, tickets, "claim creates no recovery timer")
    h.hooks.syncSet = async items => { const remote = await h.deps.sync.get(); h.deps.sync.get = async () => ({ ...remote, ...items }) }
    equal((await w.flushSync()).kind, "pushed", "later real event recovers existing R155 owner"); await w.dispose()
    observations.push({ kind: "R155", invocations, results: h.results.map(result => result.kind), saved: h.records })
  }
  {
    const h = harness(), base = seed(), pause = gate()
    const readyHistory = { joined: "H", pushed: { "doc:settings": "old", [S]: "old", [Q]: "old" }, status: "ok", editedSinceOff: false }
    h.records = { ...base, device: { ...(typeof base.device === "object" ? base.device : {}), syncOn: true }, sync: readyHistory, [Q]: { ...stamp, gen: "pending", at: 2, data: { mode: "deny", on: false, channels: [] } } }
    const w = h.make(); await w.startSync()
    const listener = h.listener, timer = h.timers[0]
    check(listener && timer, "active owner has subscription and one-shot resource")
    h.records = { ...h.records, device: base.device, sync: { ...readyHistory, status: "off" } }
    h.hooks.lookup = pause.wait
    h.hooks.set = async () => { h.records.unclaimed = null; throw Error("partial fixture batch") }
    const claiming = w.claim(); await settle(); check(pause.reached, "active claim reaches held lookup")
    listener(); timer.run(); await settle()
    const before = h.stats.reads; equal(h.batches.length, 0, "subscription and timer cannot overtake claim")
    pause.release(); equal((await claiming).kind, "unconfirmed", "active claim uncertainty")
    await settle(); equal(h.listener, undefined, "uncertainty cancels active subscription"); check(timer.cancelled, "uncertainty cancels one-shot resource")
    const stats = copy(h.stats), effects = h.effects.length
    listener(); timer.run(); await w.startSync(); await settle()
    equal(h.stats, stats, "stale subscription and timer callbacks cannot revive IO"); equal(h.effects.length, effects, "stale callbacks cannot recreate resources")
    equal(h.stats.reads, before + 2, "only claim preflight/readback serviced before latch")
    await w.dispose()
  }
  return { assertions, observations }
}

test("shared claim, Filter and sync owner preserves serialization, uncertainty and recovery", async () => {
  const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_P"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid fixture IDs")
  expect((await compositionAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(90)
})


test("real first-edit transactions, global Filter uncertainty and fixed removal restarts", async () => {
  const { runFirstEditOwnerFixture } = await import("../../../tools/fixtures/first-edit-owner/run")
  const result = await runFirstEditOwnerFixture()
  expect(result.cases).toBeGreaterThan(100)
  expect(result.assertions).toBeGreaterThan(500)
  expect(result.production).toBe("not-connected")
  expect(result.positiveInitialization).toBe("pending")
})

test("same-owner Setup destination reads and edits hold authority, refuse private and stale choices, and confirm before events", async () => {
  const { runSetupDestinationFixture } = await import("../../../tools/fixtures/setup-destination/run")
  const result = await runSetupDestinationFixture()
  expect(result.cases).toBe(49)
  expect(result.assertions).toBeGreaterThan(300)
  expect(result.production).toBe("not-connected")
}, 180000)
