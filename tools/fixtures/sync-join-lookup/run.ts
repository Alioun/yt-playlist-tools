import { beginSyncedChoicesLookup, type SyncedChoicesLookup, type SyncedChoicesResult } from "../../../src/background/store/sync-join-lookup"
import { encodeSyncDocument } from "../../../src/background/store/sync-codec"
import { defaultSettings } from "../../../src/shared/model/defaults"
import type { SyncStorage } from "../../../src/background/store/local-filter-writer"

type Records = Readonly<Record<string, unknown>>

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

export async function drainLookup(): Promise<void> {
  for (let turn = 0; turn < 16; turn++) await Promise.resolve()
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function lookupSnapshot(input: { history?: string; generation?: string; chunked?: boolean } = {}): Records {
  const settings = defaultSettings()
  settings.autoAdd.on = true
  settings.shortcuts.on = true
  settings.browserMenu.on = true
  settings.musicActions.on = true
  settings.gather.on = true
  settings.musicSection = false
  const encoded = encodeSyncDocument({
    key: { kind: "settings" },
    document: {
      v: 1, gen: input.generation ?? "settings-a", at: 100, by: "synthetic-device", data: settings,
      extension: input.chunked ? "synthetic extension ".repeat(1_000) : { label: "not part of the review" }
    }
  })
  if (encoded.kind !== "encoded") throw Error("Synthetic Settings must encode")
  return Object.fromEntries([
    ["s:meta", { v: 1, id: input.history ?? "synthetic-history-a", created: 50 }],
    ...encoded.encoded.items.map(item => [item.key, item.value])
  ])
}

export function createLookupFixture(initial: Records = {}) {
  let records = initial
  let now = 500
  let current = true
  let activeReads = 0
  const delays: number[] = []
  const forbidden: string[] = []
  const effects = {
    reads: 0, subscriptions: 0, unsubscriptions: 0, delays, timerCancellations: 0,
    maxConcurrentReads: 0, forbidden
  }
  const listeners = new Set<() => void>()
  const savedListeners: (() => void)[] = []
  const timers: { at: number; run: () => void; cancelled: boolean }[] = []
  const queuedReads: (() => Promise<Records>)[] = []
  const sync: Pick<SyncStorage, "get" | "subscribe"> = {
    async get() {
      effects.reads++
      activeReads++
      effects.maxConcurrentReads = Math.max(effects.maxConcurrentReads, activeReads)
      try {
        const queued = queuedReads.shift()
        return await (queued ? queued() : records)
      } finally {
        activeReads--
      }
    },
    subscribe(changed) {
      effects.subscriptions++
      listeners.add(changed)
      savedListeners.push(changed)
      return () => { effects.unsubscriptions++; listeners.delete(changed) }
    }
  }
  const clock = {
    now: () => now,
    after(milliseconds: number, run: () => void) {
      effects.delays.push(milliseconds)
      const timer = { at: now + milliseconds, run, cancelled: false }
      timers.push(timer)
      return () => { effects.timerCancellations++; timer.cancelled = true }
    }
  }
  const deps = { sync, clock, isCurrent: () => current }
  for (const [target, names] of [
    [deps, ["local", "session", "identity", "claim", "permissions", "registration", "owner"]],
    [sync, ["set", "remove", "clear", "claim", "permissions", "register"]],
    [clock, ["wallNow", "random"]]
  ] satisfies [object, string[]][]) {
    for (const name of names) Object.defineProperty(target, name, { get() {
      effects.forbidden.push(name)
      throw Error(`Prohibited injected port ${name}`)
    } })
  }
  return {
    deps, effects, queuedReads,
    begin: () => beginSyncedChoicesLookup(deps),
    replaceRecords(next: Records) { records = next },
    change(next: Records = records) {
      records = next
      for (const changed of [...listeners]) changed()
    },
    loseLifetime() { current = false },
    advance(milliseconds: number, fire = true) {
      now += milliseconds
      if (fire) for (const timer of timers) if (!timer.cancelled && timer.at <= now) timer.run()
    },
    savedChange() { for (const changed of savedListeners) changed() },
    savedDeadline() { for (const timer of timers) timer.run() },
    observation() { return { ...copy(effects), activeListeners: listeners.size, activeTimers: timers.filter(timer => !timer.cancelled).length } }
  }
}

type Fixture = ReturnType<typeof createLookupFixture>
type Case = { name: string; result: SyncedChoicesResult; effects: ReturnType<Fixture["observation"]> }

export async function runSyncJoinLookupFixture() {
  const cases: Case[] = []
  async function record(name: string, fixture: Fixture, lookup: SyncedChoicesLookup) {
    const result = await lookup.result
    await drainLookup()
    const effects = fixture.observation()
    if (effects.forbidden.length || effects.activeListeners || effects.activeTimers ||
        effects.delays.length !== 1 || effects.delays[0] !== 10_000 || effects.timerCancellations !== 1 ||
        effects.subscriptions !== 1 || effects.unsubscriptions !== 1 || effects.maxConcurrentReads !== 1) {
      throw Error(`Lookup lifetime or capability violation in ${name}`)
    }
    cases.push({ name, result, effects })
    return result
  }

  const remote = lookupSnapshot()
  const immediate = createLookupFixture(remote)
  const immediateLookup = immediate.begin()
  const found = await record("complete", immediate, immediateLookup)
  if (found.kind !== "found") throw Error("Complete Settings must produce review choices")
  let reviewed: { kind: "draft"; label: "From sync"; features: { -readonly [K in keyof typeof found.features]: boolean } } | null = {
    kind: "draft", label: "From sync", features: { ...found.features }
  }
  const displayed = copy(reviewed)
  reviewed.features.autoAdd = false
  reviewed = null
  immediateLookup.cancel()
  const unchanged = createLookupFixture(remote)
  await record("detached-later-read", unchanged, unchanged.begin())

  const delivered = createLookupFixture()
  const delivery = delivered.begin()
  await drainLookup()
  delivered.advance(9_999)
  delivered.change(remote)
  await record("delivery-before-deadline", delivered, delivery)

  const during = createLookupFixture()
  const initial = deferred<Records>()
  during.queuedReads.push(() => initial.promise)
  const duringLookup = during.begin()
  during.change(lookupSnapshot({ history: "synthetic-history-b", generation: "settings-b" }))
  during.change()
  during.change()
  initial.resolve(remote)
  await record("change-during-get-and-burst", during, duringLookup)

  const queued = createLookupFixture()
  const pending = deferred<Records>()
  const queuedLookup = queued.begin()
  await drainLookup()
  queued.queuedReads.push(() => pending.promise)
  queued.change(remote)
  queued.change(lookupSnapshot({ history: "synthetic-history-c", generation: "settings-c" }))
  pending.resolve(remote)
  await record("queued-stale-read", queued, queuedLookup)

  const empty = createLookupFixture()
  const emptyLookup = empty.begin()
  await drainLookup()
  empty.advance(10_000)
  await record("empty-deadline", empty, emptyLookup)

  const hung = createLookupFixture()
  const never = deferred<Records>()
  hung.queuedReads.push(() => never.promise)
  const hungLookup = hung.begin()
  hung.advance(10_000)
  await record("hung-read-deadline", hung, hungLookup)
  never.resolve(remote)
  hung.savedChange()
  hung.savedDeadline()
  await drainLookup()

  const chunked = lookupSnapshot({ chunked: true })
  const pointer = Object.fromEntries(Object.entries(chunked).filter(([key]) => !key.includes("@")))
  const chunks = Object.fromEntries(Object.entries(chunked).filter(([key]) => key.includes("@")))
  for (const [name, first] of [["pointer-first", pointer], ["chunks-first", { "s:meta": chunked["s:meta"], ...chunks }]] as const) {
    const fixture = createLookupFixture(first)
    const lookup = fixture.begin()
    await drainLookup()
    fixture.change(Object.fromEntries(Object.entries(chunked).reverse()))
    await record(name, fixture, lookup)
  }
  const reversed = createLookupFixture(Object.fromEntries(Object.entries(chunked).reverse()))
  await record("reversed-chunks", reversed, reversed.begin())

  const stamp = { v: 1, gen: "settings-a", at: 100, by: "synthetic-device" }
  const meta = remote["s:meta"]
  const mismatched = { ...chunked, "s:settings": { ...stamp, gen: "different-generation", n: Object.keys(chunks).length } }
  const deadlineInputs: [string, Records][] = [
    ["missing-chunks", pointer],
    ["mismatched-generation-chunks", mismatched],
    ["embedded-stamp-mismatch", { "s:meta": meta, "s:settings": { ...stamp, n: 1 }, "s:settings@settings-a.0": JSON.stringify({ ...stamp, gen: "other", data: defaultSettings() }) }],
    ["missing-metadata", { "s:settings": remote["s:settings"] }],
    ["orphan-chunks-without-metadata", chunks],
    ["unknown-occupancy-without-metadata", { unknown: { synthetic: true } }],
    ["metadata-without-settings", { "s:meta": meta }],
    ["null-settings", { "s:meta": meta, "s:settings": null }],
    ["reset", { ...remote, "s:meta": { v: 1, id: "synthetic-reset", created: 50, reset: true } }],
    ["future-metadata", { ...remote, "s:meta": { v: 2, id: "synthetic-newer", created: 50 } }],
    ["future-settings", { "s:meta": meta, "s:settings": { ...stamp, v: 2, data: {} } }],
    ["malformed-chunk-json", { "s:meta": meta, "s:settings": { ...stamp, n: 1 }, "s:settings@settings-a.0": "{not json" }],
    ["malformed-settings", { "s:meta": meta, "s:settings": { ...stamp, data: { autoAdd: { on: "yes" } } } }],
    ["deleted-settings", { "s:meta": meta, "s:settings": { ...stamp, deleted: true } }],
    ["invalid-metadata", { ...remote, "s:meta": null }],
    ["non-json-occupancy", { ...remote, unknown: undefined }]
  ]
  for (const [name, input] of deadlineInputs) {
    const fixture = createLookupFixture(input)
    const lookup = fixture.begin()
    await drainLookup()
    fixture.advance(10_000)
    await record(name, fixture, lookup)
  }

  const overBudget = createLookupFixture({ ...remote, ...Object.fromEntries(Array.from({ length: 481 }, (_, index) => [`unknown-${index}`, "x".repeat(220)])) })
  await record("over-budget-readable", overBudget, overBudget.begin())
  const overItem = createLookupFixture({ ...remote, unknown: "x".repeat(9_000) })
  await record("over-budget-item-readable", overItem, overItem.begin())

  const cancelled = createLookupFixture()
  const late = deferred<Records>()
  cancelled.queuedReads.push(() => late.promise)
  const cancelledLookup = cancelled.begin()
  cancelledLookup.cancel()
  cancelledLookup.cancel()
  cancelled.advance(10_000)
  cancelled.savedChange()
  cancelled.savedDeadline()
  late.resolve(remote)
  await record("cancel-before-read", cancelled, cancelledLookup)

  const deadlineCancel = createLookupFixture()
  const deadlineCancelLookup = deadlineCancel.begin()
  await drainLookup()
  deadlineCancel.advance(10_000, false)
  deadlineCancelLookup.cancel()
  deadlineCancel.savedDeadline()
  await record("cancel-at-deadline", deadlineCancel, deadlineCancelLookup)

  const deadlineWins = createLookupFixture()
  const deadlineWinsLookup = deadlineWins.begin()
  await drainLookup()
  deadlineWins.advance(10_000)
  deadlineWinsLookup.cancel()
  await record("deadline-before-cancel", deadlineWins, deadlineWinsLookup)

  const lifetime = createLookupFixture()
  const stale = deferred<Records>()
  lifetime.queuedReads.push(() => stale.promise)
  const lifetimeLookup = lifetime.begin()
  lifetime.loseLifetime()
  stale.resolve(remote)
  await record("lost-lifetime", lifetime, lifetimeLookup)

  const lateCompletion = createLookupFixture()
  const atDeadline = deferred<Records>()
  lateCompletion.queuedReads.push(() => atDeadline.promise)
  const lateLookup = lateCompletion.begin()
  lateCompletion.advance(10_000, false)
  atDeadline.resolve(remote)
  await record("completion-at-deadline", lateCompletion, lateLookup)

  const invalidated = createLookupFixture()
  const unresolved = deferred<Records>()
  const invalidatedLookup = invalidated.begin()
  await drainLookup()
  invalidated.queuedReads.push(() => unresolved.promise)
  invalidated.change(remote)
  invalidated.advance(10_000)
  await record("change-invalidates-empty-at-deadline", invalidated, invalidatedLookup)
  unresolved.resolve(remote)
  await drainLookup()

  const replacement = createLookupFixture()
  const oldRead = deferred<Records>()
  replacement.queuedReads.push(() => oldRead.promise)
  const preceding = replacement.begin()
  preceding.cancel()
  await record("replaced-lookup", replacement, preceding)
  replacement.replaceRecords(lookupSnapshot({ history: "synthetic-history-d", generation: "settings-d" }))
  const next = replacement.begin()
  const replacementResult = await next.result
  oldRead.resolve(remote)
  replacement.savedChange()
  replacement.savedDeadline()
  await drainLookup()
  if (replacementResult.kind !== "found") throw Error("A new explicit lookup must observe the current history")

  const persisted = { local: {}, session: {} }
  const serialized = JSON.stringify(persisted)
  const restarted = createLookupFixture(lookupSnapshot({ history: "synthetic-history-restart", generation: "settings-restart" }))
  const beforeExplicitLookup = restarted.observation()
  const afterExplicitLookup = await record("restart-explicit-lookup", restarted, restarted.begin())
  return {
    kind: "synthetic-first-run-review",
    cases,
    firstRun: { displayed, afterClose: reviewed, saved: JSON.parse(serialized), beforeExplicitLookup, afterExplicitLookup },
    replacement: { result: replacementResult, effects: replacement.observation() },
    writes: cases.reduce((total, observation) => total + observation.effects.forbidden.filter(name => ["set", "remove", "clear"].includes(name)).length, 0),
    join: "not-implemented",
    agree: "not-implemented",
    productionRoute: "not-installed"
  }
}

if (import.meta.main) console.log(JSON.stringify(await runSyncJoinLookupFixture(), null, 2))
