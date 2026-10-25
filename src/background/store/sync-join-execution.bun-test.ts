import { expect, test } from "bun:test"
import { createLocalFilterWriter, createStartingLocalFilterWriter } from "./local-filter-writer"
import { runSyncJoinObservations, syncJoinHarness } from "../../../tools/fixtures/account-removal-admission/run"
import { encodeSyncDocument } from "./sync-codec"
import type { UiOrigin } from "./sync-join-execution"
import { pendingSyncJoinKey, joinJson } from "./sync-join-persistence"
import type { JsonObject } from "../../shared/contracts/json"

const ui = { kind: "ui", windowId: 1, incognito: false } as const
const local = (): JsonObject => ({ schema: 1, device: { id: "L", consent: { v: 1, at: 1 }, syncOn: false }, "doc:settings": { v: 1, gen: "L", at: 1, by: "L", data: { theme: "light", autoAdd: { on: true } } } })
const remote = (): JsonObject => ({ "s:meta": { v: 1, id: "H", created: 0 }, "s:settings": { v: 1, gen: "R", at: 2, by: "R", data: { theme: "dark", autoAdd: { on: false } } } })

test("actual admission command executes both literal sides, every accepted stage and discarded-state restarts", async () => {
  const result = await runSyncJoinObservations()
  expect(result.observations.length).toBeGreaterThan(70)
  expect(result.assertions.length).toBeGreaterThan(450)
  expect(result.productionConnected).toBe(false)
}, 30000)

test("boundary inventories distinguish reset, future, null, fragments, orphans and all quota bounds before effects", async () => {
  const cases: { name: string; sync: JsonObject; expected: unknown }[] = [
    { name: "reset", sync: { "s:meta": { v: 1, id: "H", created: 0, reset: true } }, expected: { kind: "unavailable", reason: "reset" } },
    { name: "future", sync: { "s:meta": { v: 2, id: "H", created: 0 } }, expected: { kind: "refused", reason: "update-needed" } },
    { name: "metadata-null", sync: { "s:meta": null }, expected: { kind: "refused", reason: "invalid" } },
    { name: "fragments", sync: { "s:settings@partial.0": "fragment" }, expected: { kind: "unavailable", reason: "ambiguous-history" } },
    { name: "orphan", sync: { "s:meta": { v: 1, id: "H", created: 0 }, "s:filter:AAAAAAAAAAAAAAAA:PL_orphan": { v: 1, gen: "orphan", at: 1, by: "R", data: {} } }, expected: { kind: "unavailable", reason: "inventory" } },
    { name: "document-null", sync: { "s:meta": { v: 1, id: "H", created: 0 }, "s:settings": null }, expected: { kind: "unavailable", reason: "incomplete" } },
    { name: "future-document", sync: { "s:meta": { v: 1, id: "H", created: 0 }, "s:settings": { v: 2, gen: "R", at: 2, by: "R", data: {} } }, expected: { kind: "refused", reason: "update-needed" } },
    { name: "incomplete", sync: { "s:meta": { v: 1, id: "H", created: 0 }, "s:settings": { v: 1, gen: "partial", at: 1, by: "R", n: 2 }, "s:settings@partial.1": "}" }, expected: { kind: "unavailable", reason: "incomplete" } }
  ]
  for (const fixture of cases) {
    const h = syncJoinHarness({ local: local(), sync: fixture.sync }), owner = h.owner(); await owner.ready()
    const operation = owner.beginSyncJoin(ui)
    await h.drain(); await h.tick(10000)
    expect<unknown>(await operation.result, fixture.name).toEqual(fixture.expected)
    expect(h.localSets).toEqual([]); expect(h.nativeSets).toEqual([])
    await owner.dispose()
  }
  for (const bound of ["items", "bytes", "item-bytes"] as const) {
    const sync = remote()
    if (bound === "items") for (let i = 0; i < 480; i++) sync[`unknown-${i}`] = true
    if (bound === "bytes") for (let i = 0; i < 15; i++) sync[`unknown-${i}`] = "x".repeat(7000)
    if (bound === "item-bytes") sync.unknown = "x".repeat(8192)
    const h = syncJoinHarness({ local: local(), sync }), owner = h.owner(); await owner.ready()
    const review = await owner.beginSyncJoin(ui).result; expect(review.kind).toBe("choice-required")
    if (review.kind !== "choice-required") throw Error("Missing quota review")
    const result = await owner.applySyncJoin(ui, { kind: "choice", review: review.review, choice: "use-synced" })
    expect(result.kind).toBe("refused")
    if (result.kind !== "refused") throw Error("Quota accepted")
    expect(result.quota?.exceeded).toContain(bound)
    expect(result.quota?.largest.kind).toBe("other")
    expect(result.quota?.largest.bytes).toBeGreaterThan(0)
    expect(h.localSets).toEqual([]); expect(h.nativeSets).toEqual([]); await owner.dispose()
  }
})

test("tokens bind owner, origin, classification and queued caller values", async () => {
  const h = syncJoinHarness({ local: local(), sync: remote() }), owner = h.owner(); await owner.ready()
  const review = await owner.beginSyncJoin(ui).result
  if (review.kind !== "choice-required") throw Error("Missing review")
  expect(await owner.applySyncJoin(ui, { kind: "choice", review: { ...review.review }, choice: "use-synced" })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await owner.applySyncJoin({ ...ui, incognito: true }, { kind: "choice", review: review.review, choice: "use-synced" })).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await owner.applySyncJoin(ui, { kind: "automatic", review: review.review })).toEqual({ kind: "unavailable", reason: "stale" })
  const other = createLocalFilterWriter(h.deps)
  expect(await other.applySyncJoin(ui, { kind: "choice", review: review.review, choice: "use-synced" })).toEqual({ kind: "unavailable", reason: "stale" })
  const input = { kind: "choice", review: review.review, choice: "use-synced" } as const
  const first = owner.applySyncJoin(ui, input), second = owner.applySyncJoin(ui, input)
  expect((await first).kind).toBe("committed"); expect(await second).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.localSets.filter(x => Object.hasOwn(x,"device"))).toHaveLength(1)
  expect(h.state().local["progress:AAAAAAAAAAAAAAAA:0"]).toBeUndefined()
  await owner.dispose(); await other.dispose()
})

test("empty preparation yields the lane, keeps one original deadline and invalidates late reads", async () => {
  const h = syncJoinHarness({ local: local(), sync: {} }), owner = h.owner(); await owner.ready()
  let resolve!: (value: JsonObject) => void
  h.deps.sync.get = () => new Promise(done => { resolve = done })
  const operation = owner.beginSyncJoin(ui)
  expect(await owner.readSyncJoin(ui)).toEqual({ kind: "off" })
  await h.tick(10000)
  expect(await operation.result).toEqual({ kind: "unavailable", reason: "incomplete" })
  resolve(remote()); await h.drain()
  expect(h.localSets).toEqual([]); expect(h.counters().timers).toBe(0); expect(h.counters().listeners).toBe(0)
  await owner.dispose()
})

test("adopting auto-add off clears every recognized shard and preserves unrelated local keys", async () => {
  const initial = local(); for (let shard = 0; shard < 16; shard++) initial[`progress:AAAAAAAAAAAAAAAA:${shard}`] = { remembered: shard }; initial["progress:BBBBBBBBBBBBBBBB:15"] = { remembered: 2 }; initial.unclaimed = null
  const h = syncJoinHarness({ local: initial, sync: remote() }), owner = h.owner(); await owner.ready()
  const review = await owner.beginSyncJoin(ui).result
  if (review.kind !== "choice-required") throw Error("Missing review")
  expect((await owner.applySyncJoin(ui, { kind: "choice", review: review.review, choice: "use-synced" })).kind).toBe("committed")
  for (let shard = 0; shard < 16; shard++) expect(h.state().local[`progress:AAAAAAAAAAAAAAAA:${shard}`]).toEqual({}); expect(h.state().local["progress:BBBBBBBBBBBBBBBB:15"]).toEqual({})
  expect(h.state().local.unclaimed).toBeNull(); expect(joinJson(h.state().local.sync).everEdited).toBeUndefined()
  await owner.dispose()
})

test("accepted checkpoints gate the real starting owner before schema and ordinary startup writes", async () => {
  const h = syncJoinHarness({ local: local(), sync: remote() }), owner = h.owner(); await owner.ready(); h.fault("materialize", "rejected-unchanged")
  const review = await owner.beginSyncJoin(ui).result
  if (review.kind !== "choice-required") throw Error("Missing review")
  await owner.applySyncJoin(ui, { kind: "choice", review: review.review, choice: "use-synced" }); const serialized = JSON.stringify(h.state()); await owner.dispose()
  const fresh = syncJoinHarness(JSON.parse(serialized), "unused-restart"), restarted = createStartingLocalFilterWriter(fresh.deps)
  await expect(restarted.ready()).rejects.toMatchObject({ result: { kind: "pending-join", observation: "accepted" } })
  expect(fresh.localSets).toEqual([]); expect(fresh.counters().gen).toBe(0); expect(fresh.counters().nowCalls).toBe(0)
  expect(await restarted.readSyncJoin(ui)).toEqual({ kind: "pending", action: "resume-join" })
  expect(fresh.state().local[pendingSyncJoinKey]).toBeDefined(); await restarted.dispose()
})


test("delayed reordered chunks keep one preparation and creation metadata consumes its physical item", async () => {
  const document: JsonObject = { v: 1, gen: "chunked", at: 2, by: "R", data: { theme: "dark" }, extension: "x".repeat(17000) }
  const encoded = encodeSyncDocument({ key: { kind: "settings" }, document })
  if (encoded.kind !== "encoded" || encoded.encoded.mode !== "chunked") throw Error("No chunked fixture")
  const parts = [...encoded.encoded.items].reverse()
  const h = syncJoinHarness({ local: local(), sync: { "s:meta": { v: 1, id: "H", created: 0 } } }), owner = h.owner(); await owner.ready()
  const operation = owner.beginSyncJoin(ui); await h.drain()
  h.remote(raw => { parts.forEach(item => { raw[item.key] = item.value }) }); await h.event()
  const stale = await operation.result
  if (stale.kind !== "choice-required") throw Error("Missing initial full review")
  expect(await owner.applySyncJoin(ui, { kind: "choice", review: stale.review, choice: "use-synced" })).toEqual({ kind: "unavailable", reason: "stale" })
  const current = await owner.beginSyncJoin(ui).result
  if (current.kind !== "choice-required") throw Error("Missing complete chunk review")
  expect((await owner.applySyncJoin(ui, { kind: "choice", review: current.review, choice: "use-synced" })).kind).toBe("committed")
  expect(h.state().local["doc:settings"]).toEqual(document); await owner.dispose()
  const occupied = Object.fromEntries(Array.from({ length: 479 }, (_, i) => [`other-${i}`, true]))
  const full = syncJoinHarness({ local: local(), sync: occupied }), fresh = full.owner(); await fresh.ready()
  const pending = fresh.beginSyncJoin(ui); await full.drain(); await full.tick(10000)
  const review = await pending.result
  if (review.kind !== "automatic") throw Error("No create review")
  expect(await fresh.applySyncJoin(ui, { kind: "automatic", review: review.review })).toMatchObject({ kind: "refused", reason: "sync-full", quota: { items: 481, exceeded: ["items"] } })
  expect(full.localSets).toEqual([]); await fresh.dispose()
})

test("later metadata persists before document assembly and repeated histories keep bounded suspended debt", async () => {
  const h = syncJoinHarness({ local: local(), sync: remote() }), owner = h.owner(); await owner.ready()
  const preparation = await owner.beginSyncJoin(ui).result
  if (preparation.kind !== "choice-required") throw Error("Missing initial review")
  expect((await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-this-browser" })).kind).toBe("committed")
  await owner.startSync()
  for (const id of ["H2", "H3", "H4"]) {
    h.remote(raw => { raw["s:meta"] = { v: 1, id, created: 3 }; raw["s:settings"] = { v: 1, gen: "delayed", at: 3, by: "R", n: 2 } })
    await h.event()
    expect(await owner.readSyncJoin(ui)).toEqual({ kind: "waiting", action: "review-join" })
    expect(h.state().local[pendingSyncJoinKey]).toMatchObject({ phase: "choice", observedMetadata: { id }, suspended: { kind: "outbound" } })
    expect(h.nativeSets).toEqual([])
  }
  const serialized = JSON.stringify(h.state()); await owner.dispose()
  const fresh = syncJoinHarness(JSON.parse(serialized)), restarted = fresh.owner(); await expect(restarted.ready()).rejects.toMatchObject({ result: { kind: "pending-join", observation: "choice" } })
  expect(await restarted.readSyncJoin(ui)).toEqual({ kind: "waiting", action: "review-join" })
  expect(await restarted.cancelSyncJoin(ui)).toEqual({ kind: "cancelled" })
  expect(fresh.state().local[pendingSyncJoinKey]).toMatchObject({ phase: "off", unfinishedTarget: "H" }); expect(fresh.nativeSets).toEqual([])
  expect((await restarted.changeSharedSetting(ui, { kind: "theme", value: "dark" })).kind).toBe("committed")
  await restarted.dispose()
})

test("incomplete chunks settle on an event within the original deadline without extending it", async () => {
  const document: JsonObject = { v: 1, gen: "chunked", at: 2, by: "R", data: { theme: "dark" }, extension: "x".repeat(17000) }
  const encoded = encodeSyncDocument({ key: { kind: "settings" }, document })
  if (encoded.kind !== "encoded" || encoded.encoded.mode !== "chunked") throw Error("Missing chunk fixture")
  const items = encoded.encoded.items
  const h = syncJoinHarness({ local: local(), sync: { "s:meta": remote()["s:meta"]!, [items[0]!.key]: items[0]!.value } }), owner = h.owner(); await owner.ready()
  const operation = owner.beginSyncJoin(ui); await h.drain()
  expect(h.counters().timers).toBe(1)
  await h.tick(9000)
  h.remote(raw => { for (const item of [...items].reverse()) raw[item.key] = item.value }); await h.event()
  const preparation = await operation.result
  expect(preparation.kind).toBe("choice-required"); expect(h.counters().timers).toBe(0)
  expect(h.localSets).toEqual([])
  await owner.dispose()
})

test("standalone Filter tombstones survive the complete account union", async () => {
  const initial = local(), name = "doc:filter:AAAAAAAAAAAAAAAA:PL_removed"
  initial[name] = { v: 1, gen: "removed", at: 3, by: "L", deleted: true, extension: { keep: true } }
  const h = syncJoinHarness({ local: initial, sync: remote() }), owner = h.owner(); await owner.ready()
  const preparation = await owner.beginSyncJoin(ui).result
  if (preparation.kind !== "choice-required") throw Error("Missing choice")
  expect((await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-synced" })).kind).toBe("committed")
  expect(h.state().local[name]).toEqual(initial[name]); await h.tick(5000, false)
  expect((await owner.flushSync()).kind).toBe("pushed")
  expect(h.state().sync["s:filter:AAAAAAAAAAAAAAAA:PL_removed"]).toEqual(initial[name])
  await owner.dispose()
})

test("an accepted session snapshot failure retains its error and closes all ordinary ingress", async () => {
  const initial = local(), sync = remote(), acct = "AAAAAAAAAAAAAAAA"
  initial[`doc:setup:${acct}`] = { v: 1, gen: "setup-L", at: 1, by: "L", data: { gather: "PL_target" } }
  sync[`s:setup:${acct}`] = { v: 1, gen: "setup-deleted", at: 2, by: "R", deleted: true }
  const h = syncJoinHarness({ local: initial, sync }), owner = h.owner(); await owner.ready()
  const error = new Error("Synthetic session snapshot failure")
  h.deps.join.session.get = async () => { throw error }
  const preparation = await owner.beginSyncJoin(ui).result
  if (preparation.kind !== "choice-required") throw Error("Missing choice")
  const result = await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-synced" })
  expect(result).toMatchObject({ kind: "unconfirmed", stage: "session-cleanup", cause: { kind: "read-failed", error } })
  const counters = h.counters()
  expect(await owner.readAgreement(ui)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await owner.flushSync()).toEqual({ kind: "unavailable" })
  expect((await owner.changeSharedSetting(ui, { kind: "theme", value: "dark" })).kind).toBe("unavailable")
  await h.event(); expect(h.counters()).toEqual(counters)
  await owner.dispose()
})

test("a later-history cancellation refuses an unavailable retirement host before acceptance", async () => {
  const initial = local(); initial.device = { id: "L", consent: { v: 1, at: 1 }, syncOn: true }
  initial.sync = { joined: "old", pushed: { "doc:settings": "L" }, status: "ok", editedSinceOff: false }
  const h = syncJoinHarness({ local: initial, sync: remote() }), owner = h.owner(); await owner.ready(); await owner.startSync()
  expect(await owner.readSyncJoin(ui)).toEqual({ kind: "waiting", action: "review-join" })
  const bytes = JSON.stringify(h.state()); await owner.dispose()
  const fresh = syncJoinHarness(JSON.parse(bytes)), restarted = createStartingLocalFilterWriter({ ...fresh.deps, join: { kind: "unavailable" } })
  await expect(restarted.ready()).rejects.toMatchObject({ result: { kind: "pending-join" } })
  expect(await restarted.cancelSyncJoin(ui)).toEqual({ kind: "unavailable", reason: "join-host" })
  expect(fresh.localSets).toEqual([]); expect(JSON.stringify(fresh.state())).toBe(bytes)
  await restarted.dispose()
})

test("a suspended accepted effect must finish before a fresh history question can replace it", async () => {
  const h = syncJoinHarness({ local: local(), sync: remote() }), owner = h.owner(); await owner.ready()
  h.fault("materialize", "rejected-unchanged")
  const preparation = await owner.beginSyncJoin(ui).result
  if (preparation.kind !== "choice-required") throw Error("Missing choice")
  expect((await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-this-browser" })).kind).toBe("failed")
  await owner.dispose()
  const state = h.state(), accepted = joinJson(state.local[pendingSyncJoinKey])
  state.local[pendingSyncJoinKey] = { v: 1, kind: "sync-join", phase: "choice", lastJoined: null, observedMetadata: { v: 1, id: "H2", created: 5 }, suspended: { kind: "accepted", effect: accepted.effect! }, extension: { keep: true } }
  state.sync["s:meta"] = { v: 1, id: "H2", created: 5 }
  const fresh = syncJoinHarness(JSON.parse(JSON.stringify(state)), "different"), restarted = fresh.owner()
  await expect(restarted.ready()).rejects.toMatchObject({ result: { kind: "pending-join", observation: "choice" } })
  expect(await restarted.beginSyncJoin(ui).result).toEqual({ kind: "unavailable", reason: "pending-join" })
  expect(fresh.localSets).toEqual([])
  expect((await restarted.resumeSyncJoin(ui)).kind).toBe("committed")
  expect(fresh.counters().gen).toBe(0); expect(fresh.nativeSets).toEqual([])
  expect(fresh.state().local[pendingSyncJoinKey]).toMatchObject({ phase: "choice", observedMetadata: { id: "H2" }, suspended: { kind: "outbound" }, extension: { keep: true } })
  expect((await restarted.beginSyncJoin(ui).result).kind).toBe("choice-required")
  await restarted.dispose()
})

test("queued caller and port aliases cannot change an accepted join", async () => {
  const h = syncJoinHarness({ local: local(), sync: remote() }), owner = h.owner(); await owner.ready()
  const preparation = await owner.beginSyncJoin(ui).result
  if (preparation.kind !== "choice-required") throw Error("Missing choice")
  const input: { kind: "choice"; review: typeof preparation.review; choice: "use-synced" | "use-this-browser" } = { kind: "choice", review: preparation.review, choice: "use-synced" }
  const origin: UiOrigin = { ...ui }, pending = owner.applySyncJoin(origin, input)
  input.choice = "use-this-browser"; origin.windowId = 99
  expect((await pending).kind).toBe("committed")
  expect(h.state().local["doc:settings"]).toEqual(remote()["s:settings"])
  await owner.dispose()
})


test("known unchanged materialization rejection can resume on the same owner without new stamps", async () => {
  const h = syncJoinHarness({ local: local(), sync: remote() }), owner = h.owner()
  await owner.ready()
  const preparation = await owner.beginSyncJoin(ui).result
  if (preparation.kind !== "choice-required") throw Error("Missing choice")
  h.fault("materialize", "rejected-unchanged")
  const result = await owner.applySyncJoin(ui, { kind: "choice", review: preparation.review, choice: "use-this-browser" })
  expect(result).toMatchObject({ kind: "failed", stage: "materialize", write: { kind: "rejected", error: h.writeError } })
  expect(await owner.readSyncJoin(ui)).toEqual({ kind: "pending", action: "resume-join" })
  expect((await owner.changeSharedSetting(ui, { kind: "theme", value: "dark" })).kind).toBe("unavailable")
  const before = h.counters()
  expect((await owner.resumeSyncJoin(ui)).kind).toBe("committed")
  expect(h.counters().gen).toBe(before.gen)
  expect(h.counters().nowCalls).toBe(before.nowCalls)
  expect(h.nativeSets).toEqual([])
  await owner.dispose()
})
