import { expect, test } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { isAccountKey, isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model"
import type { JsonObject } from "../../shared/contracts/json"
import { createLocalFilterWriter, type SyncAutomaticResult, type LocalFilterChange, type LocalWriteStorage } from "./local-filter-writer"

async function acceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId, FixtureDate = Date, controls = true) {
  let assertions = 0
  function check(value: unknown, message: string): asserts value {
    assertions++
    if (!value) throw new Error(message)
  }
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, message: string) {
    check(stable(actual) === stable(expected), `${message}: ${stable(actual)} != ${stable(expected)}`)
  }
  const filterKey = `doc:filter:${acct}:${playlist}`, setupKey = `doc:setup:${acct}`
  const row = ["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]
  const history = () => ({ joined: "history-id", pushed: { [filterKey]: "pushed-old", "unrecognized:key": "opaque-gen" },
    status: "off", editedSinceOff: false, future: { nested: [1, null] },
    ...JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert","v":99}') })
  function seed(): Record<string, unknown> {
    return {
      schema: 1,
      device: {
        id: "device-fixture", consent: { v: 1, at: 1 }, syncOn: false, upgradeNote: null,
        claimNotice: null, lastAccount: null, newPlaylistVisibility: null,
        pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: true, future: [1]
      },
      [setupKey]: { v: 1, gen: "setup", at: 1, by: "old", extra: "setup-envelope", data: {
        label: { name: "Account" }, autoAdd: [{ pl: playlist, takes: "videos", extra: 1 }, { pl: "PL_Q", takes: "both" }],
        targets: { abcdef: "PL_Q" }, quickSave: null, musicSave: null, gather: "PL_kept", marks: { PL_Q: "full" }, future: true
      } },
      [filterKey]: { v: 1, gen: "old", at: 1, by: "old", envelope: { keep: true }, data: {
        mode: "deny", on: true, channels: [row], future: { body: true }
      } },
      [`doc:filter:${acct}:PL_Q`]: { v: 99, gen: "Q", at: 1, by: "old", data: { future: true } },
      [`doc:filter:${acct}:PL_kept`]: { v: 1, gen: "kept", at: 1, by: "old", data: {} },
      "doc:setup:BBBBBBBBBBBBBBBB": { unrelated: true }, cache: { keep: true }
    }
  }
  function harness(records = seed()) {
    const reads: string[][] = [], sets: Readonly<Record<string, unknown>>[] = []
    let times = 0, generations = 0
    const local: LocalWriteStorage = {
      async get(keys) {
        reads.push([...(keys ?? Object.keys(records))])
        return Object.fromEntries((keys ?? Object.keys(records)).filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]]))
      },
      async set(items) { sets.push(items); Object.assign(records, items) }
    }
    const writer = create({ claim: { kind: "unavailable" }, syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local, sync: { subscribe() { throw Error("Inactive writer subscribed") }, async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => 100 + times++, generation: () => `g${++generations}` })
    const change = (desired: LocalFilterChange["desired"], expectedGeneration?: string | null) => writer.change(
      { kind: "ui", windowId: 1, incognito: false },
      expectedGeneration === undefined ? { acct, playlist, desired, clearListedChannels: "not-confirmed" }
        : { acct, playlist, desired, clearListedChannels: "confirmed", expectedGeneration })
    return { records, reads, sets, writer, change, local, counts: () => ({ times, generations }) }
  }
  const ok = { kind: "result", result: { ok: true } }, invalid = { kind: "result", result: { refused: "invalid" } }
  const h = harness()
  const untouched = Object.fromEntries(Object.entries(h.records).filter(([key]) => key !== filterKey))
  equal(await h.change({ mode: "deny", on: false }), ok, "off succeeds")
  const off = { v: 1, gen: "g1", at: 100, by: "device-fixture", envelope: { keep: true }, data: {
    mode: "deny", on: false, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]], future: { body: true }
  } }
  equal(h.sets, [{ [filterKey]: off }], "exact off write")
  equal(h.reads, [["schema", "device", "sync", setupKey, filterKey]], "one exact-key read")
  equal(Object.fromEntries(Object.entries(h.records).filter(([key]) => key !== filterKey)), untouched, "unrelated data untouched")
  equal(await h.change({ mode: "allow", on: true }), invalid, "off list still needs confirmation")
  equal(await h.change({ mode: "deny", on: true }), ok, "on succeeds")
  equal(h.records[filterKey], { ...off, gen: "g2", at: 102, data: { ...off.data, on: true } }, "on retains list")
  equal(await h.change({ mode: "allow", on: false }, "g1"), invalid, "stale confirmation refuses")
  equal(await h.change({ mode: "allow", on: false }, "g2"), ok, "current confirmation succeeds")
  equal(h.records[filterKey], { ...off, gen: "g3", at: 104, data: { ...off.data, mode: "allow", on: false, channels: [] } }, "confirmed mode clears with desired on")
  const before = stable(h.records)
  equal(await h.change({ mode: "allow", on: false }, "old"), ok, "achieved desired ignores old confirmation")
  equal(h.sets.length, 3, "no-op no set")
  equal(h.counts().generations, 3, "only mutations generate")
  equal(stable(h.records), before, "no-op exact values")

  for (const raw of [undefined, null, { v: 1, gen: "omitted", at: 2, by: "old", data: {} },
    { v: 1, gen: "long", at: 2, by: "old", data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "x".repeat(300), null, { future: true }]] } },
    { v: 1, gen: "dead", at: 2, by: "old", deleted: true, envelope: "kept" }]) {
    const x = harness()
    if (raw === undefined) delete x.records[filterKey]
    else x.records[filterKey] = raw
    const original = stable(x.records)
    equal(await x.change({ mode: "deny", on: false }), ok, "default no-op")
    equal(stable(x.records), original, "omissions/labels/tombstone unchanged")
    equal(x.sets.length, 0, "default no creation")
    equal(x.counts().generations, 0, "default no generation")
    equal(await x.change({ mode: "allow", on: true }, raw && typeof raw === "object" ? raw.gen : null), ok, "selected absent or tombstone can change")
    check(x.sets.length === 1, "one replacement set")
    const saved = x.records[filterKey]
    check(saved && typeof saved === "object" && !Object.hasOwn(saved, "deleted"), "replacement removes tombstone")
    if (raw && typeof raw === "object" && "deleted" in raw) {
      equal(saved, { v: 1, gen: "g1", at: 101, by: "device-fixture", envelope: "kept", data: {
        mode: "allow", on: true, channels: []
      } }, "literal tombstone replacement retains its envelope extension")
    }
  }
  for (const raw of [undefined, null, {}, { v: 2, gen: "new", at: 1, by: "x", data: {} },
    { v: 1, gen: "dead", at: 1, by: "x", deleted: true },
    { v: 1, gen: "other", at: 1, by: "x", data: { autoAdd: [{ pl: "PL_other" }] } }]) {
    const x = harness(); x.records[setupKey] = raw
    equal(await x.change({ mode: "deny", on: false }), { kind: "unavailable", reason: "account-context" }, "complete selected setup required even no-op")
    equal(x.sets.length, 0, "no setup bootstrap")
  }
  {
    const x = harness()
    delete x.records[setupKey]
    delete x.records[filterKey]
    const before = stable(x.records)
    equal(await x.change({ mode: "deny", on: true }), { kind: "unavailable", reason: "account-context" }, "bare IDs do not create a setup or filter")
    equal(stable(x.records), before, "bare context leaves every record unchanged")
    equal(x.sets.length, 0, "bare context no set")
  }
  for (const raw of [null, undefined, false, 0, "", [], {},
    ...["joined", "pushed", "status", "editedSinceOff"].map(key => Object.fromEntries(Object.entries(history()).filter(([field]) => field !== key))),
    { ...history(), joined: "" }, { ...history(), joined: 0 }, { ...history(), pushed: [] },
    { ...history(), pushed: { opaque: "" } }, { ...history(), pushed: { opaque: 2 } },
    { ...history(), editedSinceOff: "false" },
    ...["joining", "ok", "full", "update-needed", "waiting", "future"].map(status => ({ ...history(), status }))]) {
    const x = harness(); x.records.sync = raw
    equal(await x.change({ mode: "deny", on: false }), { kind: "unavailable", reason: "sync-writer-required" }, "unsupported present history blocks")
    equal(x.sets.length, 0, "history no set")
    equal(x.counts().generations, 0, "unsupported history no generation")
    check(Object.hasOwn(x.records, "sync") && x.records.sync === raw, "present history is never initialized")
  }
  for (const joined of ["history-id", null]) {
    const raw = { ...history(), joined }, next = { ...raw, editedSinceOff: true }
    const x = harness({ ...seed(), sync: raw })
    equal(await x.change({ mode: "deny", on: false }), ok, "supported off history admits")
    equal(x.sets, [{ [filterKey]: off, sync: next }], "one complete two-key batch changes only the bit")
    equal(x.records, { ...seed(), [filterKey]: off, sync: next }, "full local state retains every unrelated record")
    equal(x.reads, [["schema", "device", "sync", setupKey, filterKey]], "history uses same exact-key read")
    equal(await x.change({ mode: "deny", on: true }), ok, "editing back remains an edit")
    equal(x.sets[1], { [filterKey]: { ...off, gen: "g2", at: 101, data: { ...off.data, on: true } } }, "already-true history is not rewritten")
    equal(x.records.sync, next, "bit stays true and pushed generations remain unacknowledged")
  }
  {
    const raw = { ...history(), editedSinceOff: true }, x = harness({ ...seed(), sync: raw })
    equal(await x.change({ mode: "deny", on: false }), ok, "already true admits")
    equal(x.sets, [{ [filterKey]: off }], "already true writes only Filter")
    check(x.records.sync === raw, "already true retains history object")
  }
  for (const raw of [undefined, null, { v: 1, gen: "omitted", at: 1, by: "x", data: {} },
    { v: 1, gen: "long", at: 1, by: "x", data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]] } },
    { ...off, gen: "achieved" }]) {
    const x = harness({ ...seed(), sync: history() })
    if (raw === undefined) delete x.records[filterKey]
    else x.records[filterKey] = raw
    const before = stable(x.records)
    equal(await x.change({ mode: "deny", on: false }, "stale"), ok, "history no-op ignores stale confirmation")
    equal(x.sets, [], "no-op never writes the bit")
    equal(x.counts().generations, 0, "history no-op never generates")
    equal(stable(x.records), before, "history no-op preserves omitted defaults and labels")
  }
  {
    const x = harness({ ...seed(), [filterKey]: off, sync: history() })
    equal(await x.change({ mode: "allow", on: false }), invalid, "off Filter clearing requires confirmation")
    equal(await x.change({ mode: "allow", on: false }, "old"), invalid, "stale clearing with false flag refuses")
    equal(x.sets, [], "refused clearing leaves flag false without sets")
    equal(x.counts().generations, 0, "refused clearing never generates")
    equal(await x.change({ mode: "allow", on: false }, "g1"), ok, "fresh clearing with false flag admits")
    equal(x.sets, [{ [filterKey]: { ...off, gen: "g1", at: 102, data: { ...off.data, mode: "allow", channels: [] } },
      sync: { ...history(), editedSinceOff: true } }], "confirmed clearing and bit share one set")
  }
  {
    const x = harness(); const device = x.records.device
    check(device && typeof device === "object", "device fixture")
    x.records.device = { ...device, syncOn: true }
    equal(await x.change({ mode: "deny", on: false }), { kind: "unavailable", reason: "sync-writer-required" }, "sync on blocks")
  }
  for (const schema of [undefined, null, "1", 0, -1, 1.5, {}, 2]) {
    const x = harness(); x.records.schema = schema
    equal(await x.change({ mode: "deny", on: false }), { kind: "unavailable", reason: schema === 2 ? "newer-layout" : "startup" }, "layout blocks")
    equal(x.sets.length, 0, "layout inert")
  }
  for (const device of [undefined, null, {}, { id: "x" }, { id: "x", consent: null, syncOn: false },
    { id: "x", consent: { v: 2, at: 1 }, syncOn: false }, { id: "", consent: { v: 1, at: 1 }, syncOn: false },
    { id: "x", consent: { v: 1, at: 1 }, syncOn: "false" }]) {
    const x = harness(); x.records.device = device
    equal(await x.change({ mode: "deny", on: false }), { kind: "unavailable", reason: "startup" }, "initialized consented device required")
    equal(x.sets.length, 0, "device inert")
  }
  {
    const x = harness()
    x.records.device = { id: "x", consent: { v: 1, at: 1 }, syncOn: false, upgradeNote: {
      state: "pending", opened: true, seen: true, reopened: false, details: {
        from: "1.5.0", autoAdd: { kept: 0, dropped: 0 }, pct: { value: 50, wasUnset: false, authorised: true }, feedback: false,
        shortcut: { raw: "", key: null, playlist: false, note: "none" }, credentialsDeleted: true
      }
    } }
    equal(await x.change({ mode: "deny", on: false }), { kind: "unavailable", reason: "startup" }, "supported pending upgrade blocks")
    equal(x.sets.length, 0, "pending upgrade inert")
  }
  {
    const x = harness(); x.records[filterKey] = { v: 2, gen: "new", at: 1, by: "other", data: { future: true } }
    equal(await x.change({ mode: "deny", on: false }), { kind: "result", result: { refused: "update-needed" } }, "newer filter inert")
    equal(x.sets.length, 0, "newer filter not replaced")
  }
  {
    const x = harness()
    const own = JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}')
    x.records[filterKey] = { v: 1, gen: "old", at: 1, by: "other", ...own, data: { mode: "deny", on: true, channels: [row], ...own } }
    equal(await x.change({ mode: "deny", on: false }), ok, "own fields accepted")
    equal(x.records[filterKey], { v: 1, gen: "g1", at: 100, by: "device-fixture", ...own, data: { mode: "deny", on: false, channels: [row], ...own } }, "own proto/toJSON retained")
  }
  let getterCalls = 0
  const getter = Object.defineProperty({}, "bad", { enumerable: true, get() { getterCalls++; throw Error("getter executed") } })
  const hidden = Object.defineProperty({}, "bad", { value: 1 })
  const sparse = new Array(2)
  const cycle: Record<string, unknown> = {}; cycle.self = cycle
  for (const bad of [undefined, NaN, Infinity, BigInt(1), () => {}, Symbol("bad"), getter, hidden, sparse, new FixtureDate(0), cycle, new Map()]) {
    for (const raw of [{ ...history(), future: bad }, { ...history(), pushed: { opaque: bad } },
      Object.defineProperty(history(), "joined", { enumerable: true, get() { getterCalls++; throw Error("owned getter executed") } })]) {
      const x = harness({ ...seed(), sync: raw })
      equal(await x.change({ mode: "deny", on: false }), { kind: "unavailable", reason: "sync-writer-required" }, "strict raw history precedes semantic decoding")
      equal(x.sets, [], "invalid history no effects")
      equal(x.counts().generations, 0, "invalid history no generation")
    }
    for (const field of ["envelope", "body"]) {
      const x = harness()
      x.records[filterKey] = { v: 1, gen: "old", at: 1, by: "x", ...(field === "envelope" ? { bad } : {}), data: {
        mode: "deny", on: true, channels: [row], ...(field === "body" ? { bad } : {})
      } }
      equal(await x.change({ mode: "deny", on: true }), invalid, "strict invalid data refuses even no-op")
      equal(x.sets.length, 0, "invalid data no set")
      equal(x.counts().generations, 0, "invalid data no gen")
    }
  }
  equal(getterCalls, 0, "no getter execution")
  for (const raw of [{}, [], false, { v: 1, gen: "x", at: 1, by: "x", data: { mode: "other" } },
    { v: 1, gen: "x", at: 1, by: "x", data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "title", undefined, true]] } }]) {
    const x = harness(); x.records[filterKey] = raw
    equal(await x.change({ mode: "deny", on: false }), invalid, "malformed filter never overwritten")
  }
  {
    const x = harness({ ...seed(), sync: history() })
    equal(await x.writer.change({ kind: "ui", windowId: 1, incognito: true }, { acct, playlist, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }), { kind: "result", result: { refused: "private" } }, "private refused before read")
    equal(x.reads.length, 0, "private no storage read")
  }
  function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>(done => { resolve = done })
    return { promise, resolve }
  }
  {
    const x = harness({ ...seed(), sync: history() }), entered = deferred(), release = deferred()
    const original = x.local.set
    x.local.set = async items => { entered.resolve(); await release.promise; await original(items) }
    const first = x.change({ mode: "deny", on: false })
    await entered.promise
    const second = x.change({ mode: "deny", on: true })
    equal(x.reads.length, 1, "queued operation has no early read")
    equal(x.sets.length, 0, "pending set not acknowledged")
    release.resolve()
    equal(await first, ok, "first acknowledged after set")
    equal(await second, ok, "second observes committed first")
    equal(x.sets.length, 2, "second is actual mutation")
    equal(x.sets[0], { [filterKey]: off, sync: { ...history(), editedSinceOff: true } }, "queued first writes the full batch")
    equal(Object.keys(x.sets[1] ?? {}), [filterKey], "queued second reads accepted true bit")
    equal(x.records[filterKey], { ...off, gen: "g2", at: 101, data: { ...off.data, on: true } }, "admission time preserved behind lane")
  }
  {
    const x = harness({ ...seed(), sync: history() }), entered = deferred(), release = deferred(), original = x.local.set
    x.local.set = async items => { entered.resolve(); await release.promise; await original(items) }
    const first = x.change({ mode: "deny", on: false })
    await entered.promise
    const second = x.change({ mode: "deny", on: false })
    equal(x.reads.length, 1, "queued repeat waits before reading")
    release.resolve()
    equal(await first, ok, "first batch acknowledged")
    equal(await second, ok, "queued repeat observes achieved state")
    equal(x.sets.length, 1, "queued repeat no second write")
    equal(x.counts().generations, 1, "queued repeat no generation")
  }
  for (const failure of ["get", "set"] as const) {
    const x = harness({ ...seed(), sync: history() }), originalGet = x.local.get, originalSet = x.local.set, marker = new Error("native IO")
    const before = stable(x.records)
    if (failure === "get") x.local.get = async () => { throw marker }
    else x.local.set = async () => { throw marker }
    let rejected: unknown
    try { await x.change({ mode: "deny", on: false }) } catch (error) { rejected = error }
    check(rejected === marker, "IO rejects without fabricated result")
    equal(stable(x.records), before, "rejected batch leaves Filter and false flag intact")
    x.local.get = originalGet
    x.local.set = originalSet
    equal(await x.change({ mode: "deny", on: false }), ok, "lane recovers")
    equal(x.sets.length, 1, "no automatic retry")
    equal(x.sets[0]?.sync, { ...history(), editedSinceOff: true }, "explicit recovery commits complete history")
    equal(x.reads.length, failure === "get" ? 1 : 2, "explicit recovery rereads")
  }
  {
    const x = harness({ ...seed(), sync: history() }), original = x.local.set, marker = new Error("reply lost after persistence")
    x.local.set = async items => { await original(items); throw marker }
    let rejected: unknown
    try { await x.change({ mode: "deny", on: false }) } catch (error) { rejected = error }
    check(rejected === marker, "acknowledgement loss rejects separately from no-write failure")
    equal(x.sets, [{ [filterKey]: off, sync: { ...history(), editedSinceOff: true } }], "lost reply follows accepted full batch")
    const fresh = harness(x.records)
    equal(await fresh.change({ mode: "deny", on: false }), ok, "fresh writer rereads achieved state after lost reply")
    equal(fresh.sets, [], "fresh writer does not replay accepted batch")
    equal(fresh.counts().generations, 0, "lost reply convergence does not restamp")
  }
  {
    const x = harness({ ...seed(), sync: history() }), marker = new Error("programmer error")
    const writer = create({ claim: { kind: "unavailable" }, syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local: x.local, sync: { subscribe() { throw Error("Inactive writer subscribed") }, async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => 1, generation: () => { throw marker } })
    let rejected: unknown
    try { await writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }) } catch (error) { rejected = error }
    check(rejected === marker, "programmer exception propagates")
    equal(x.sets.length, 0, "programmer failure no set")
    equal(x.records.sync, history(), "pre-commit failure leaves full history false")
  }
  {
    const x = harness(), marker = new Error("clock failure")
    const writer = create({ claim: { kind: "unavailable" }, syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local: x.local, sync: { subscribe() { throw Error("Inactive writer subscribed") }, async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => { throw marker }, generation: () => "unused" })
    let rejected: unknown
    try { await writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }) } catch (error) { rejected = error }
    check(rejected === marker, "admission programmer exception rejects")
    equal(x.reads.length, 0, "clock failure has no reads")
  }
  {
    const x = harness()
    const refused = await x.change({ mode: "allow", on: true })
    if (refused.kind !== "result" || !("refused" in refused.result)) throw Error("Expected refusal fixture")
    refused.result.refused = "private"
    equal(await x.change({ mode: "allow", on: true }), invalid, "caller cannot corrupt a later refusal")
    const accepted = await x.change({ mode: "deny", on: true })
    if (accepted.kind !== "result") throw Error("Expected success fixture")
    Object.defineProperty(accepted.result, "ok", { value: false })
    equal(await x.change({ mode: "deny", on: true }), ok, "caller cannot corrupt a later success")
  }
  let caughtAlternatives = 0
  const alternativeFailures: { alternative: string; assertion: string }[] = []
  if (controls) {
    for (const wrong of ["split", "noop", "metadata", "pushed"]) {
      const broken: typeof create = deps => {
        let wrote = false
        const writer = create({ ...deps, local: { get: deps.local.get, async set(items) {
          wrote = true
          if (!Object.hasOwn(items, "sync")) return deps.local.set(items)
          const sync = items.sync
          if (!sync || typeof sync !== "object" || Array.isArray(sync)) throw Error("Missing control history")
          if (wrong === "split") { await deps.local.set({ [filterKey]: items[filterKey]! }); return deps.local.set({ sync }) }
          if (wrong === "metadata") return deps.local.set({ ...items, sync: { joined: sync.joined!, pushed: sync.pushed!, status: sync.status!, editedSinceOff: true } })
          if (wrong === "pushed") return deps.local.set({ ...items, sync: { ...sync, pushed: { [filterKey]: "g1" } } })
          return deps.local.set(items)
        } } })
        return { ...writer, async change(origin, change) {
          wrote = false
          const result = await writer.change(origin, change)
          if (wrong === "noop" && !wrote && result.kind === "result" && "ok" in result.result) {
            const records = await deps.local.get(["sync"]), sync = records.sync
            if (sync && typeof sync === "object" && !Array.isArray(sync)) {
              await deps.local.set({ sync: { ...sync, editedSinceOff: true } })
            }
          }
          return result
        } }
      }
      const assertion = wrong === "noop" ? "no-op never writes the bit" : "one complete two-key batch changes only the bit"
      let caught = false
      try { await acceptance(broken, acct, playlist, FixtureDate, false) } catch (error) {
        caught = error instanceof Error && error.message.startsWith(assertion + ":")
      }
      check(caught, `acceptance rejects wrong alternative ${wrong}`)
      caughtAlternatives++
      alternativeFailures.push({ alternative: wrong, assertion })
    }
  }
  return { assertions, caughtAlternatives, alternativeFailures }
}

const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_P"
if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw new Error("Invalid fixture IDs")

test("literal local writer acceptance, exact effects, freshness and recovery", async () => {
  const result = await acceptance(createLocalFilterWriter, acct, playlist)
  expect(result.assertions).toBeGreaterThan(450)
  expect(result.caughtAlternatives).toBe(4)
})

test("preparation refusal leaves false history untouched before generation in the emitted writer", async () => {
  const build = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "local-filter-writer.ts")], target: "browser", format: "cjs", minify: true,
    plugins: [{ name: "preparation-refusal", setup(builder) {
      builder.onLoad({ filter: /\/write-preparation\.ts$/ }, () => ({ loader: "ts", contents:
        'export function prepareDocumentBody() { globalThis.preparations++; return {kind:"invalid",reason:"json"} } export function materializeDocumentBody(){throw Error("Unexpected claim preparation")}' }))
    } }]
  })
  expect(build.success).toBe(true)
  const bytes = await build.outputs[0]!.text()
  const script = `(async()=>{
    globalThis.preparations=0;
    const module={exports:{}};${bytes};
    const records={schema:1, device:{id:"device",consent:{v:1,at:1},syncOn:false},
      sync:{joined:null,pushed:{opaque:"old"},status:"off",editedSinceOff:false,future:{keep:true}},
      "doc:setup:AAAAAAAAAAAAAAAA":{v:1,gen:"setup",at:1,by:"device",data:{autoAdd:[{pl:"PL_P"}]}},
      "doc:filter:AAAAAAAAAAAAAAAA:PL_P":{v:1,gen:"old",at:1,by:"device",data:{mode:"deny",on:true,channels:[]}}};
    const before=JSON.stringify(records);
    let generations=0,sets=0,reads=0;
    const writer=module.exports.createLocalFilterWriter({claim:{kind:"unavailable"},syncClock:{now:()=>0, wallNow: () => 1000000,after(){throw Error("timer")}},onSyncResult(){},sync:{subscribe(){throw Error("subscribe")},async get(){throw Error("Forbidden sync")}},local:{async get(){reads++;return records},async set(){sets++;throw Error("Unexpected set")}},now:()=>1,generation:()=>{generations++;return "unexpected"}});
    const result=await writer.change({kind:"ui",windowId:1,incognito:false},{acct:"AAAAAAAAAAAAAAAA",playlist:"PL_P",desired:{mode:"deny",on:false},clearListedChannels:"not-confirmed"});
    return {result,preparations,generations,sets,reads,unchanged:before===JSON.stringify(records)};
  })()`
  const result = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs"; import {runInNewContext} from "node:vm"; console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
  expect(result).toEqual({ result: { kind: "result", result: { refused: "invalid" } }, preparations: 1,
    generations: 0, sets: 0, reads: 1, unchanged: true })
})

test("actual browser artifact executes the acceptance matrix with injected effects only", async () => {
  const entry = resolve(import.meta.dir, "local-filter-writer.ts")
  const visited = new Set<string>()
  async function inspect(file: string): Promise<void> {
    if (visited.has(file)) return
    visited.add(file)
    expect(file.startsWith(resolve(import.meta.dir, "../../shared/model") + "/") ||
      file === resolve(import.meta.dir, "../../shared/contracts/json.ts") ||
      file.startsWith(resolve(import.meta.dir, "../../shared/keys") + "/") ||
      [entry, ...["claim-notice.ts", "shared-setting-execution.ts", "settings-edit.ts", "local-claim-writer.ts", "accounts.ts", "legacy.ts", "legacy-execution.ts", "legacy-startup.ts", "legacy-shortcut.ts"].map(name => resolve(import.meta.dir, name)), resolve(import.meta.dir, "write-preparation.ts"), resolve(import.meta.dir, "channel-filter-edit.ts"), resolve(import.meta.dir, "sync-write-admission.ts"), resolve(import.meta.dir, "sync-codec.ts"), resolve(import.meta.dir, "sync-inventory.ts")].includes(file)).toBe(true)
    for (const imported of new Bun.Transpiler({ loader: "ts" }).scanImports(await readFile(file, "utf8"))) {
      expect(imported.path.startsWith(".")).toBe(true)
      const base = resolve(dirname(file), imported.path)
      await inspect(await Bun.file(`${base}.ts`).exists() ? `${base}.ts` : resolve(base, "index.ts"))
    }
  }
  await inspect(entry)
  const build = await Bun.build({ entrypoints: [entry], target: "browser", format: "cjs", minify: true })
  expect(build.success).toBe(true)
  const bytes = await build.outputs[0]!.text()
  const script = `(async()=>{
    const FixtureDate = Date;
    let ambientReads = 0;
    const guarded = ["browser","chrome","fetch","localStorage","indexedDB","crypto","process","Bun","Date","performance","setTimeout","setInterval"];
    for (const name of guarded) Object.defineProperty(globalThis,name,{get(){ambientReads++;throw Error(name)}});
    Object.defineProperty(Math,"random",{get(){ambientReads++;throw Error("Math.random")}});
    const module = {exports:{}}; ${bytes};
    const result = await (${acceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P",FixtureDate);
    const syncResult = await (${syncAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");
    const flushResult = await (${flushAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");
    if(flushResult.assertions<130) throw Error("Flush matrix did not run");
    if(syncResult.assertions<200) throw Error("Sync matrix did not run");
    if(ambientReads!==0) throw Error("Unexpected ambient effects");
    const beforeControls = ambientReads;
    let positiveControls = 0;
    for(const name of guarded) { try {globalThis[name]} catch {positiveControls++} }
    try {Math.random} catch {positiveControls++}
    return {exports:Object.keys(module.exports),...result,beforeControls,positiveControls,positiveReads:ambientReads};
  })()`
  const result = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs"; import {runInNewContext} from "node:vm"; console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
  expect(result.exports).toEqual(["StartupReadinessError", "createLocalFilterWriter", "createStartingLocalFilterWriter"])
  expect(result.assertions).toBeGreaterThan(450)
  expect(result.caughtAlternatives).toBe(4)
  expect(result.beforeControls).toBe(0)
  expect(result.positiveControls).toBe(13)
  expect(result.positiveReads).toBeGreaterThanOrEqual(13)
})

async function syncAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  let assertions = 0
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, message: string) {
    assertions++
    if (stable(actual) !== stable(expected)) throw Error(message + ": " + stable(actual) + " != " + stable(expected))
  }
  const key = `doc:filter:${acct}:${playlist}`, base = `s:filter:${acct}:${playlist}`, setup = `doc:setup:${acct}`
  const kept = `doc:filter:${acct}:PL_kept`, keptBase = `s:filter:${acct}:PL_kept`, other = "doc:filter:BBBBBBBBBBBBBBBB:PL_T"
  const own = JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}')
  const stamp = { v: 1, gen: "old", at: 1, by: "old" }
  const original = { ...stamp, extra: { keep: true }, ...own, data: { mode: "deny", on: true,
    channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]], future: { body: true }, ...own } }
  const seed = (): Record<string, unknown> => ({ schema: 1, device: { id: "device-fixture", consent: { v: 1, at: 1 }, syncOn: true },
    sync: { joined: "history", pushed: { [key]: "old" }, status: "ok", editedSinceOff: false, future: { keep: true }, v: 99, ...own },
    "doc:settings": { ...stamp, gen: "settings-pending", data: {} },
    [setup]: { ...stamp, gen: "setup-pending", data: { autoAdd: [{ pl: playlist, takes: "videos" }] } },
    [key]: original, [kept]: { ...stamp, gen: "kept-pending", data: { mode: "allow", on: false, channels: [] } },
    [other]: { ...stamp, gen: "tomb-pending", deleted: true }, cache: { keep: true } })
  const remote = (): Record<string, unknown> => ({ "s:meta": { v: 1, id: "history", created: 0, future: { keep: true } },
    [base]: original, "unknown:occupied": "x", [`${base}@old-orphan.0`]: "old chunk" })
  function harness(records = seed(), syncRecords = remote()) {
    const reads: (readonly string[] | null)[] = [], sets: Readonly<Record<string, unknown>>[] = []
    let generations = 0, syncReads = 0
    const local: LocalWriteStorage = {
      async get(keys) { reads.push(keys); return keys === null ? { ...records } : Object.fromEntries(keys.filter(k => Object.hasOwn(records, k)).map(k => [k, records[k]])) },
      async set(items) { sets.push(items); Object.assign(records, items) }
    }
    const sync = { subscribe() { throw Error("Inactive writer subscribed") }, async get() { syncReads++; return syncRecords }, async set() { throw Error("Change wrote sync") } }
    const writer = create({ claim: { kind: "unavailable" }, syncClock: { now: () => 0, wallNow: () => 1000000, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local, sync, now: () => 100, generation: () => `g${++generations}` })
    const change = (on = false, mode: "deny" | "allow" = "deny", expectedGeneration?: string) => writer.change({ kind: "ui", windowId: 1, incognito: false },
      expectedGeneration === undefined ? { acct, playlist, desired: { mode, on }, clearListedChannels: "not-confirmed" }
        : { acct, playlist, desired: { mode, on }, clearListedChannels: "confirmed", expectedGeneration })
    return { records, syncRecords, reads, sets, local, sync, change, counts: () => ({ generations, syncReads }) }
  }
  const ok = { kind: "result", result: { ok: true } }, unavailable = { kind: "unavailable", reason: "sync-writer-required" }
  const refused = (reason: string) => ({ kind: "result", result: { refused: reason } })
  async function inert(h: ReturnType<typeof harness>, expected: unknown, on = false, message = "sync intent result") {
    const before = stable(h.records)
    equal(await h.change(on), expected, message)
    equal(h.sets, [], "refusal has zero local sets")
    equal(stable(h.records), before, "refusal retains raw local state")
  }
  for (const status of ["ok", "full", "update-needed"]) for (const editedSinceOff of [false, true]) {
    const records = seed(); records.sync = { joined: "history", pushed: { [key]: "old" }, status, editedSinceOff, future: { keep: true }, v: 99, ...own }
    const h = harness(records), before = { ...records }, syncBefore = stable(h.syncRecords)
    equal(await h.change(), ok, "fitting complete edit admitted regardless global status/flag")
    const expected = { ...original, gen: "g1", at: 100, by: "device-fixture", data: { ...original.data, on: false } }
    equal(h.sets, [{ [key]: expected }], "literal one Filter local set")
    equal(h.records, { ...before, [key]: expected }, "all raw records and history retained")
    equal(h.reads, [["schema", "device", "sync", setup, key], null], "full authoritative local read")
    equal(h.counts(), { generations: 1, syncReads: 1 }, "one candidate one full sync read")
    equal(stable(h.syncRecords), syncBefore, "no native sync mutation")
    equal(await h.change(), ok, "accepted pending generation achieved no-op")
    equal(h.sets.length, 1, "achieved no set")
    equal(h.counts().generations, 1, "achieved no stamp")
  }
  for (const meta of [undefined, null, {}, { id: "history", created: 0 }, { v: 1, created: 0 }, { v: 1, id: "history" },
    { v: "1", id: "history", created: 0 }, { v: 1, id: "history", created: -1 }, { reset: true, id: "history", created: 0 },
    { v: 1, id: "history", created: 0, reset: true }, { v: 2, id: "history", created: 0 }, { v: 1, id: "other", created: 0 }]) {
    const h = harness(); if (meta === undefined) delete h.syncRecords["s:meta"]; else h.syncRecords["s:meta"] = meta
    await inert(h, unavailable)
  }
  { const h = harness(); h.syncRecords["s:meta"] = { v: 1, id: "history", created: 0, reset: false }; equal(await h.change(), ok, "reset false ordinary metadata") }
  for (const status of ["off", "joining", "waiting", "unknown"]) {
    const h = harness(); h.records.sync = { joined: "history", pushed: {}, status, editedSinceOff: false }; await inert(h, unavailable)
    equal(h.counts().syncReads, 0, "not-ready history never reads sync")
  }
  for (const [name, raw] of [["doc:future:thing", original], [kept, null], [kept, undefined], [kept, {}], [kept, { ...stamp, data: { mode: "invalid" } }]] as const) {
    const h = harness(); h.records[name] = raw; await inert(h, unavailable)
  }
  for (const pushed of [{ opaque: "old" }, { "doc:settings": "old", "doc:filter:AAAAAAAAAAAAAAAA:PL_missing": "old" }]) {
    const h = harness(); h.records.sync = { joined: "history", pushed, status: "ok", editedSinceOff: false }; await inert(h, unavailable)
  }
  const large = (gen: string) => ({ ...stamp, gen, data: { mode: "deny", on: false, channels: [], future: "x".repeat(51000) } })
  {
    const h = harness(); h.records[kept] = large("pending-one"); h.records[other] = large("pending-two")
    await inert(h, refused("sync-full"), false, "complete pending set refuses combined quota")
  }
  {
    const h = harness(); h.records[kept] = large("pushed-restore"); h.records[other] = large("pending-two")
    h.records.sync = { joined: "history", pushed: { [key]: "old", [kept]: "pushed-restore" }, status: "ok", editedSinceOff: false }
    await inert(h, refused("sync-full"), false, "acknowledged disappearance restoration is charged")
  }
  {
    const h = harness(); h.records[kept] = large("superseded")
    h.syncRecords[keptBase] = { v: 2, gen: "protected", at: 2, by: "new", data: { future: true } }
    h.records[other] = large("pending")
    equal(await h.change(), ok, "unrelated newer remote protects large older pending from projection")
    equal(h.records[kept], large("superseded"), "protected local data retained")
  }
  for (const achieved of [false, true]) {
    const h = harness(); h.syncRecords[base] = { v: 2, gen: "new", at: 1, by: "other", data: {} }
    await inert(h, refused("update-needed"), achieved, achieved ? "achieved intent checks addressed newer remote" : "changed intent checks addressed newer remote")
    if (achieved) equal(h.counts().generations, 0, "no-op remote version check no generation")
  }
  {
    const h = harness(), future = { v: 2, gen: "new", at: 2, by: "future", data: { future: true } }
    h.records[kept] = future; h.syncRecords[keptBase] = future
    equal(await h.change(), ok, "represented unsupported local stays protected")
  }
  { const h = harness(); h.records[kept] = { v: 2, gen: "new", at: 2, by: "future", data: {} }; await inert(h, unavailable) }
  for (const raw of [null, {}, { ...stamp, n: 2 }, { ...original, data: { ...original.data, on: false } },
    { ...original, gen: "incoming" }, { ...stamp, gen: "incoming", deleted: true }]) {
    const h = harness(); h.syncRecords[base] = raw; await inert(h, unavailable)
  }
  { const h = harness(); h.syncRecords["s:filter:BBBBBBBBBBBBBBBB:PL_remote"] = original; await inert(h, unavailable) }
  { const h = harness(); delete h.syncRecords[base]; equal(await h.change(), ok, "missing base with orphan chunks restores in projection") }
  {
    const h = harness(); h.records[key] = { ...original, gen: "local-pending" }
    equal(await h.change(), ok, "acknowledged baseline plus local pending is classifiable")
  }
  {
    const h = harness(); h.records[key] = { ...original, gen: "never-pushed", extra: "x".repeat(110000), data: { mode: "deny", on: true, channels: [] } }
    delete h.syncRecords[base]
    h.local.get = async keys => { h.reads.push(keys); return keys === null ? { ...h.records, [key]: { ...original, gen: "fresh", data: {} } }
      : Object.fromEntries((keys ?? []).filter(k => Object.hasOwn(h.records, k)).map(k => [k, h.records[k]])) }
    equal(await h.change(), ok, "fresh achieved state overrides stale preliminary changed value")
    equal(h.counts().generations, 0, "authoritative no-op never prepares")
    equal(h.sets.length, 0, "authoritative no-op no set")
  }
  {
    const h = harness()
    h.records[key] = { ...original, gen: "superseded-large", data: { mode: "deny", on: true, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(99000)]] } }
    delete h.syncRecords[base]
    equal(await h.change(), ok, "superseded pending chunks never enter projection")
    equal(h.sets.length, 1, "replacement commits one small normalized candidate")
  }
  {
    const h = harness(), get = h.local.get
    h.local.get = async keys => keys === null ? { ...h.records, device: { id: "fresh-device", consent: { v: 1, at: 1 }, syncOn: true } } : get(keys)
    equal(await h.change(), ok, "authoritative Device supplies stamp identity")
    const saved = h.sets[0]?.[key]
    equal(saved && typeof saved === "object" && "by" in saved ? saved.by : undefined, "fresh-device", "no stale Device identity")
  }
  {
    const h = harness(), get = h.local.get
    h.local.get = async keys => keys === null ? { ...h.records, [key]: { ...original, gen: "fresh-local" } } : get(keys)
    equal(await h.change(false, "allow", "old"), refused("invalid"), "full snapshot invalidates stale destructive confirmation")
    equal(h.sets.length, 0, "stale full confirmation no set")
    equal(h.counts().generations, 0, "stale full confirmation no generation")
    equal(await h.change(false, "allow", "fresh-local"), ok, "fresh full confirmation clears")
  }
  for (const field of ["schema", "device", "sync", setup, key]) {
    const h = harness(), before = h.local.get
    h.local.get = async keys => keys === null ? { ...h.records, [field]: field === "schema" ? 2 : null } : before(keys)
    const expected = field === "schema" ? { kind: "unavailable", reason: "newer-layout" }
      : field === "device" ? { kind: "unavailable", reason: "startup" }
      : field === setup ? { kind: "unavailable", reason: "account-context" }
      : unavailable
    equal(await h.change(), expected, "full snapshot revalidates " + field)
    equal(h.sets.length, 0, "fresh invalid context no set")
  }
  {
    const h = harness(); h.records[key] = { ...original, gen: "superseded", data: { mode: "deny", on: true, channels: [] } }
    delete h.syncRecords[base]
    const beforeGet = h.local.get
    h.local.get = async keys => {
      const values = await beforeGet(keys)
      return { ...values, ...(Object.hasOwn(values, key) ? { [key]: { ...original, gen: "superseded", data: { mode: "deny", on: true, channels: [] }, discarded: undefined } } : {}) }
    }
    await inert(h, refused("invalid"))
  }
  for (const on of [false, true]) {
    const h = harness(); h.records[key] = { ...stamp, data: { channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(300), null, { future: true }]] } }
    h.syncRecords[base] = h.records[key]
    for (let i = 0; i < 481; i++) h.syncRecords["unknown:" + i] = "x"
    if (!on) { equal(await h.change(false, "deny", "stale"), ok, "omitted-default no-op bypasses overquota projection"); equal(h.counts().generations, 0, "no-op no normalization/stamp") }
    else await inert(h, refused("sync-full"), true)
  }
  {
    const h = harness(); equal(await h.change(false, "allow"), refused("invalid"), "unconfirmed destructive clearing")
    equal(await h.change(false, "allow", "stale"), refused("invalid"), "stale destructive clearing")
    equal(await h.change(false, "allow", "old"), ok, "fresh destructive clearing")
    equal(h.sets.length, 1, "only confirmed clearing persists")
  }
  for (const failure of ["exact", "full", "sync", "set"]) {
    const h = harness(), marker = Error("native " + failure), get = h.local.get, set = h.local.set, syncGet = h.sync.get
    h.local.get = async keys => { if ((failure === "full" && keys === null) || (failure === "exact" && keys !== null)) throw marker; return get(keys) }
    h.sync.get = async () => { if (failure === "sync") throw marker; return syncGet() }
    h.local.set = async items => { if (failure === "set") throw marker; return set(items) }
    let caught: unknown
    try { await h.change() } catch (error) { caught = error }
    equal(caught === marker, true, "native error identity propagates " + failure)
    equal(h.sets.length, 0, "no false success or automatic retry")
    h.local.get = get; h.local.set = set; h.sync.get = syncGet
    equal(await h.change(), ok, "lane recovers on explicit request " + failure)
    equal(h.sets.length, 1, "one explicit recovered write")
  }
  {
    const h = harness(), set = h.local.set, marker = Error("lost response")
    h.local.set = async items => { await set(items); throw marker }
    try { await h.change() } catch (error) { equal(error === marker, true, "accepted local set lost response rejects") }
    const fresh = harness(h.records, h.syncRecords)
    equal(await fresh.change(), ok, "fresh writer converges after lost response")
    equal(fresh.counts().generations, 0, "lost response no restamp")
    equal(fresh.sets, [], "lost response no replay")
  }
  {
    const h = harness(); let release!: () => void, enter!: () => void
    const blocked = new Promise<void>(done => { release = done }), entered = new Promise<void>(done => { enter = done }), set = h.local.set
    h.local.set = async items => { enter(); await blocked; await set(items) }
    const first = h.change(); await entered
    const second = h.change(true)
    equal(h.reads.length, 2, "second intent waits inside existing lane")
    release(); equal(await first, ok, "queued first commits"); equal(await second, ok, "queued next sees pending gen")
    equal(h.sets.length, 2, "two opposite explicit intents persist")
    equal(h.reads.length, 4, "queued next rereads complete local")
    equal(await h.change(true), ok, "queued achieved repeat no-op")
    equal(h.sets.length, 2, "achieved repeat no third set")
  }
  let getterCalls = 0
  const bad = Object.defineProperty({}, "bad", { enumerable: true, get() { getterCalls++; throw Error("getter") } })
  for (const location of ["local", "sync", "meta"]) {
    const h = harness()
    if (location === "local") h.records[kept] = { ...original, bad }
    if (location === "sync") h.syncRecords.unknown = bad
    if (location === "meta") h.syncRecords["s:meta"] = bad
    equal(await h.change(), unavailable, "descriptor-aware snapshot refusal")
    equal(h.sets, [], "accessor refusal has no effects")
  }
  equal(getterCalls, 0, "snapshot validation never invokes accessors")
  return { assertions }
}

test("joined sync writer consumes complete pending and restoration admission", async () => {
  expect((await syncAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(200)
})

test("actual browser artifact rejects six observable admission defects", async () => {
  const plannerPath = resolve(import.meta.dir, "sync-write-admission.ts"), writerPath = resolve(import.meta.dir, "local-filter-writer.ts")
  const planner = await readFile(plannerPath, "utf8"), writer = await readFile(writerPath, "utf8")
  const cases = [
    { name: "latest-only", assertion: "complete pending set refuses combined quota", path: plannerPath,
      source: planner.replace('if (intent.kind === "changed") {', 'if (intent.kind === "changed") { documents.clear();') },
    { name: "missing-restoration", assertion: "acknowledged disappearance restoration is charged", path: plannerPath,
      source: planner.replace('documents.set(name, record)\n      continue',
        'if (raw.gen !== state.pushed[name]) documents.set(name, record);\n      continue') },
    { name: "protected-overwrite", assertion: "unrelated newer remote protects large older pending from projection", path: plannerPath,
      source: planner.replace('if (remote.kind === "newer-version") continue',
        'if (remote.kind === "newer-version") { documents.set(name, {key, name, gen: raw.gen, document:raw}); continue }') },
    { name: "stale-full-read", assertion: "fresh achieved state overrides stale preliminary changed value", path: writerPath,
      source: writer.replace('          records = await deps.local.get(null)', 'const stale = records[filterKey]; records = { ...await deps.local.get(null), [filterKey]: stale }') },
    { name: "noop-newer-bypass", assertion: "achieved intent checks addressed newer remote", path: writerPath,
      source: writer.replace('if (!device.syncOn) return ok', 'return ok') },
    { name: "superseded-chunks", assertion: "superseded pending chunks never enter projection", path: plannerPath,
      source: planner.replace('if (intent.kind === "changed") {', 'const superseded = addressed === undefined ? undefined : documents.get(addressed); if (intent.kind === "changed") {')
        .replace('const set = new Map<string, JsonValue>()',
          'const set = new Map<string, JsonValue>(); if(superseded) { const old=encodeSyncDocument(superseded); if(old.kind==="encoded") for(const item of old.encoded.items) if(item.key!==old.encoded.baseKey) set.set(item.key,item.value) }') }
  ]
  for (const fault of cases) {
    expect(fault.source).not.toBe(fault.path === plannerPath ? planner : writer)
    const build = await Bun.build({ entrypoints: [writerPath], target: "browser", format: "cjs", minify: true,
      plugins: [{ name: fault.name, setup(builder) {
        builder.onLoad({ filter: /\/(?:sync-write-admission|local-filter-writer)\.ts$/ }, args => args.path === fault.path ? { loader: "ts", contents: fault.source } : undefined)
      } }] })
    expect(build.success).toBe(true)
    const bytes = await build.outputs[0]!.text()
    const script = `(async()=>{const module={exports:{}};${bytes};try {await (${syncAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");return {caught:false}} catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0]}}})()`
    const result = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect(result).toEqual({ caught: true, assertion: fault.assertion })
  }
})

test("actual browser artifact projects literal complete raw inventory exactly once per edit", async () => {
  const codecPath = resolve(import.meta.dir, "sync-codec.ts"), source = await readFile(codecPath, "utf8")
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "local-filter-writer.ts")], target: "browser", format: "cjs", minify: true,
    plugins: [{ name: "projection-observation", setup(builder) {
      builder.onLoad({ filter: /\/sync-codec\.ts$/ }, () => ({ loader: "ts", contents: source
        .replace("export function encodeSyncDocument(", "function actualEncodeSyncDocument(")
        .replace("export function projectSyncWrite(", "function actualProjectSyncWrite(") + `
        export function encodeSyncDocument(input: Parameters<typeof actualEncodeSyncDocument>[0]) {
          globalThis.encodedInputs.push(input); return actualEncodeSyncDocument(input)
        }
        export function projectSyncWrite(input: Parameters<typeof actualProjectSyncWrite>[0]) {
          if (!globalThis.firstProjection) globalThis.firstProjection = input
          globalThis.projections++; return actualProjectSyncWrite(input)
        }` }))
    } }] })
  expect(build.success).toBe(true)
  const bytes = await build.outputs[0]!.text()
  const script = `(async()=>{globalThis.projections=0;globalThis.firstProjection=null;globalThis.encodedInputs=[];
    const module={exports:{}};${bytes};
    const matrix=await (${syncAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");
    const first=globalThis.firstProjection,firstEncoded=globalThis.encodedInputs.slice(0,5),projections=globalThis.projections;
    const records={schema:1,device:{id:"d",consent:{v:1,at:1},syncOn:true},sync:{joined:"history",pushed:{},status:"ok",editedSinceOff:false},
      "doc:setup:AAAAAAAAAAAAAAAA":{v:1,gen:"s",at:1,by:"d",data:{autoAdd:[{pl:"PL_P"}]}},
      "doc:filter:AAAAAAAAAAAAAAAA:PL_P":{v:1,gen:"f",at:1,by:"d",data:{mode:"deny",on:true,channels:[]}}};
    let gens=0;globalThis.projections=0;globalThis.encodedInputs=[];
    const writer=module.exports.createLocalFilterWriter({claim:{kind:"unavailable"},syncClock:{now:()=>0, wallNow: () => 1000000,after(){throw Error("timer")}},onSyncResult(){},local:{async get(){return records},async set(items){Object.assign(records,items)}},sync:{subscribe(){throw Error("subscribe")},async get(){return {"s:meta":{v:1,id:"history",created:0}}}},now:()=>100,generation:()=>"g"+(++gens)});
    const change={acct:"AAAAAAAAAAAAAAAA",playlist:"PL_P",desired:{mode:"deny",on:false},clearListedChannels:"not-confirmed"};
    await writer.change({kind:"ui",windowId:1,incognito:false},change);
    const changedCount=globalThis.projections,changedEncodes=globalThis.encodedInputs.length;
    await writer.change({kind:"ui",windowId:1,incognito:false},change);
    return {matrix,first,firstEncoded,projections,changedCount,noopCount:globalThis.projections,changedEncodes,noopEncodes:globalThis.encodedInputs.length,gens};})()`
  const result = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
  const own = JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}')
  const original = { v: 1, gen: "old", at: 1, by: "old", extra: { keep: true }, ...own,
    data: { mode: "deny", on: true, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "Title", null, { future: true }]], future: { body: true }, ...own } }
  expect(result.first.current).toEqual([
    { key: "s:meta", value: { v: 1, id: "history", created: 0, future: { keep: true } } },
    { key: "s:filter:AAAAAAAAAAAAAAAA:PL_P", value: original },
    { key: "unknown:occupied", value: "x" }, { key: "s:filter:AAAAAAAAAAAAAAAA:PL_P@old-orphan.0", value: "old chunk" }
  ])
  const literal = [
    { key: "s:settings", value: { v: 1, gen: "settings-pending", at: 1, by: "old", data: {} } },
    { key: "s:setup:AAAAAAAAAAAAAAAA", value: { v: 1, gen: "setup-pending", at: 1, by: "old", data: { autoAdd: [{ pl: "PL_P", takes: "videos" }] } } },
    { key: "s:filter:AAAAAAAAAAAAAAAA:PL_kept", value: { v: 1, gen: "kept-pending", at: 1, by: "old", data: { mode: "allow", on: false, channels: [] } } },
    { key: "s:filter:BBBBBBBBBBBBBBBB:PL_T", value: { v: 1, gen: "tomb-pending", at: 1, by: "old", deleted: true } },
    { key: "s:filter:AAAAAAAAAAAAAAAA:PL_P", value: { ...original, gen: "g1", at: 100, by: "device-fixture", data: { ...original.data, on: false } } }
  ]
  expect(result.first.set).toEqual(literal)
  expect(result.firstEncoded.map((item: { document: unknown }) => item.document)).toEqual(literal.map(item => item.value))
  expect(result.projections).toBeGreaterThan(10)
  expect({ changed: result.changedCount, noop: result.noopCount, gens: result.gens }).toEqual({ changed: 1, noop: 1, gens: 1 })
  expect(result.noopEncodes).toBe(result.changedEncodes)
})

async function flushAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  let assertions = 0
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, message: string) {
    assertions++
    if (stable(actual) !== stable(expected)) throw Error(message + ": " + stable(actual) + " != " + stable(expected))
  }
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const key = `doc:filter:${acct}:${playlist}`, base = `s:filter:${acct}:${playlist}`, setup = `doc:setup:${acct}`
  const own = JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}')
  const g0 = { v: 1, gen: "g0", at: 1, by: "old", ...own, data: { mode: "deny", on: true, channels: [], future: { keep: true } } }
  const g1 = { ...g0, gen: "g1", at: 10, data: { ...g0.data, on: false } }
  const setupDoc = { v: 1, gen: "setup", at: 1, by: "old", data: { autoAdd: [{ pl: playlist, takes: "videos" }] } }
  const history = { joined: "H", pushed: { [key]: "g0", [setup]: "setup" }, status: "full", editedSinceOff: true, future: { keep: [1, null, own] }, v: 99, ...own }
  const meta = { v: 1, id: "H", created: 0, extra: own }
  const seed = (): Record<string, unknown> => ({ schema: 1, device: { id: "device", consent: { v: 1, at: 1 }, syncOn: true }, sync: clone(history), [setup]: setupDoc, [key]: g1 })
  const remote = (): Record<string, unknown> => ({ "s:meta": meta, [base]: g0, [`s:${setup.slice(4)}`]: setupDoc })
  function harness(records = seed(), syncRecords = remote()) {
    const reads: (readonly string[] | null)[] = [], sets: Readonly<Record<string, unknown>>[] = [], syncWrites: Readonly<Record<string, unknown>>[] = []
    let syncReads = 0, generations = 1
    const local: LocalWriteStorage = {
      async get(keys) { reads.push(keys); return clone(keys === null ? records : Object.fromEntries(keys.filter(k => Object.hasOwn(records, k)).map(k => [k, records[k]]))) },
      async set(items) { sets.push(clone(items)); Object.assign(records, clone(items)) }
    }
    const sync: Parameters<typeof create>[0]["sync"] = {
      subscribe() { throw Error("Inactive writer subscribed") },
      async get() { syncReads++; return clone(syncRecords) },
      async set(items) { syncWrites.push(clone(items)); Object.assign(syncRecords, clone(items)) }
    }
    let monotonic = 0
    const deps = { local, sync, syncClock: { now: () => monotonic, wallNow: () => 1000000 + monotonic, after() { throw Error("Inactive writer scheduled timer") } },
      onSyncResult() {}, now: () => 100, generation: () => `g${++generations}` }
    const core = create({ ...deps, claim: { kind: "unavailable" } })
    const writer = { ...core, flushSync() { monotonic += 5000; return core.flushSync() } }
    const change = (on = true) => writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on }, clearListedChannels: "not-confirmed" })
    return { advance: (ms: number) => { monotonic += ms }, records, syncRecords, reads, sets, syncWrites, local, sync, deps, writer, change, counts: () => ({ syncReads, generations }) }
  }
  const pending = (deadline: number, raw = history) => ({ sync: { ...raw, opaqueWrite: { gate: { kind: "pending", notBefore: deadline }, diagnostic: null } } })
  const captured = { key: { kind: "filter", acct, playlist }, name: key, gen: "g1", document: g1 }
  const ok = { kind: "result", result: { ok: true } }
  const ack = { ...history, pushed: { ...history.pushed, [key]: "g1" } }
  {
    const h = harness()
    equal(await h.writer.flushSync(), { kind: "pushed", sent: [captured], repaired: [] }, "exact captured push result")
    equal(h.syncWrites, [{ [base]: g1 }], "exact one complete remote set")
    equal(h.sets, [pending(1065000), { sync: ack }], "exact full raw acknowledgement")
    equal(h.records, { ...seed(), sync: ack }, "flush never restamps documents")
    equal(h.syncRecords, { ...remote(), [base]: g1 }, "complete remote readback")
    equal(h.reads, [null, null, null, null, null, null, null], "full flush local reads")
    equal(h.counts(), { syncReads: 3, generations: 1 }, "flush does not allocate a generation")
    equal(await h.writer.flushSync(), { kind: "idle" }, "duplicate suppression")
    equal(h.syncWrites, [{ [base]: g1 }], "duplicate never resends")
    equal(h.sets, [pending(1065000), { sync: ack }], "duplicate never reacknowledges")
    delete h.syncRecords[base]
    equal(await h.writer.flushSync(), { kind: "pushed", sent: [captured], repaired: [] }, "acknowledged vanished base restores")
    equal(h.syncWrites, [{ [base]: g1 }, { [base]: g1 }], "restoration sends complete unchanged generation")
    equal(h.sets, [pending(1065000), { sync: ack }, pending(1075000, ack), { sync: ack }], "restoration finalizes pending with no new generation")
  }
  {
    const h = harness(seed(), { ...remote(), [base]: g1, ...Object.fromEntries(Array.from({ length: 481 }, (_, i) => [`unknown:${i}`, 0])) })
    equal(await h.writer.flushSync(), { kind: "reconciled", repaired: [captured] }, "pure repair ignores unrelated overbudget occupancy")
    equal(h.syncWrites, [], "readback repair never resends")
    equal(h.sets, [{ sync: ack }], "readback repairs full raw history only")
  }
  {
    const h = harness(seed(), { ...remote(), [base]: g1 })
    equal(await h.change(false), ok, "achieved intent leaves debt alone")
    equal(h.sets, [], "no-op never repairs")
    equal(await h.change(), ok, "changed intent preserves represented evidence")
    const g2 = { ...g1, gen: "g2", at: 100, by: "device", data: { ...g1.data, on: true } }
    equal(h.sets, [{ [key]: g2, sync: ack }], "changed replacement and exact old repair share one batch")
    equal(h.syncWrites, [], "changed intent never pushes")
    equal(await h.writer.flushSync(), { kind: "pushed", sent: [{ ...captured, gen: "g2", document: g2 }], repaired: [] }, "repaired replacement remains classifiable")
  }
  {
    const settings = { v: 1, gen: "settings-pending", at: 1, by: "old", data: { future: "x".repeat(9000) } }
    const tombKey = "doc:filter:BBBBBBBBBBBBBBBB:PL_T", tomb = { v: 1, gen: "tomb", at: 0, by: "old", deleted: true }
    const protectedKey = `doc:filter:${acct}:PL_kept`, protectedDoc = { ...g0, gen: "protected-local" }
    const future = { v: 2, gen: "protected-newer", at: 20, by: "other", data: { future: true } }
    const records = { ...seed(), "doc:settings": settings, [tombKey]: tomb, [protectedKey]: protectedDoc }
    const syncRecords = { "s:meta": meta, [base]: g0, "s:settings@old.0": "old chunk", unknown: "occupied", [`s:${protectedKey.slice(4)}`]: future }
    const h = harness(records, syncRecords)
    const prefix = '{"v":1,"gen":"settings-pending","at":1,"by":"old","data":{"future":"'
    const items = { [`s:${setup.slice(4)}`]: setupDoc, [base]: g1,
      "s:settings": { v: 1, gen: "settings-pending", at: 1, by: "old", n: 2 },
      "s:settings@settings-pending.0": prefix + "x".repeat(8072),
      "s:settings@settings-pending.1": "x".repeat(928) + '"}}', "s:filter:BBBBBBBBBBBBBBBB:PL_T": tomb }
    const outcome = await h.writer.flushSync()
    equal(outcome.kind, "pushed", "whole inventory pushes")
    equal(h.syncWrites, [items], "literal six-item native batch")
    equal(h.syncRecords, { ...syncRecords, ...items }, "old chunks unknown occupancy and newer copy survive")
    equal(h.sets, [pending(1065000), { sync: { ...ack, pushed: { ...ack.pushed, "doc:settings": "settings-pending", [tombKey]: "tomb" } } }], "protected newer generation is never acknowledged")
    equal(await h.writer.flushSync(), { kind: "idle" }, "chunked whole repeat is idle")
    const single = { v: 1, gen: "small", at: 30, by: "device", data: {} }
    h.records["doc:settings"] = single
    equal((await h.writer.flushSync()).kind, "pushed", "chunked to single replacement")
    equal(h.syncWrites[1], { "s:settings": single }, "replacement uses only current complete envelope")
    equal(h.syncRecords["s:settings@settings-pending.0"], items["s:settings@settings-pending.0"], "superseded chunks remain occupied")
  }
  for (const stage of ["local-pre", "sync-pre", "sync-set", "local-post", "sync-post", "ack"]) {
    const h = harness(), marker = Error(stage), get = h.local.get, syncGet = h.sync.get
    let localReads = 0, remoteReads = 0
    h.local.get = async keys => { if (++localReads === (stage === "local-pre" ? 1 : stage === "local-post" ? 5 : -1)) throw marker; return get(keys) }
    h.sync.get = async () => { if (++remoteReads === (stage === "sync-pre" ? 1 : stage === "sync-post" ? 3 : -1)) throw marker; return syncGet() }
    if (stage === "sync-set") h.sync.set = async () => { throw marker }
    if (stage === "ack") { const set = h.local.set; h.local.set = async items => { if (JSON.stringify(items).includes('"kind":"pending"')) await set(items); else throw marker } }
    if (stage.endsWith("pre")) {
      let caught: unknown
      try { await h.writer.flushSync() } catch (error) { caught = error }
      equal(caught === marker, true, "preflight read preserves error identity")
    } else {
      const outcome = await h.writer.flushSync()
      equal(outcome, stage === "sync-set" ? { kind: "sync-set-failed", error: marker, sent: [captured] }
        : stage === "ack" ? { kind: "acknowledgement-failed", error: marker, source: { kind: "set", sent: [captured], repairs: [] } }
        : { kind: "unconfirmed", sent: [captured], cause: { kind: "read-failed", error: marker } }, "truthful stage result " + stage)
      if (outcome.kind === "acknowledgement-failed" || outcome.kind === "sync-set-failed") equal(outcome.error === marker, true, "original error object retained")
      if (outcome.kind === "unconfirmed" && outcome.cause.kind === "read-failed") equal(outcome.cause.error === marker, true, "post-set read error retained")
    }
    equal((h.records.sync as typeof history).pushed, history.pushed, "failure never acknowledges")
    equal(h.syncWrites.length, ["local-pre", "sync-pre", "sync-set"].includes(stage) ? 0 : 1, "resolved set evidence survives failed later stage")
    h.local.get = get; h.sync.get = syncGet; h.local.set = async items => { h.sets.push(clone(items)); Object.assign(h.records, clone(items)) }
    h.sync.set = async items => { h.syncWrites.push(clone(items)); Object.assign(h.syncRecords, clone(items)) }
    if (stage === "sync-set") h.advance(60000)
    equal((await h.writer.flushSync()).kind, ["local-pre", "sync-pre", "sync-set"].includes(stage) ? "pushed" : "reconciled", "same lane recovers explicitly")
  }
  {
    const h = harness(seed(), { ...remote(), [base]: g1 }), marker = Error("repair acknowledgement")
    h.local.set = async () => { throw marker }
    const outcome = await h.writer.flushSync()
    equal(outcome, { kind: "acknowledgement-failed", error: marker, source: { kind: "readback", repairs: [captured] } }, "readback-only acknowledgement failure")
    equal(h.syncWrites, [], "failed readback acknowledgement never pushes")
  }
  for (const lost of ["sync", "ack"]) {
    const h = harness(), marker = Error("lost reply"), remoteSet = h.sync.set, localSet = h.local.set
    if (lost === "sync") h.sync.set = async items => { await remoteSet(items); throw marker }
    else h.local.set = async items => { await localSet(items); if (!JSON.stringify(items).includes('"kind":"pending"')) throw marker }
    equal((await h.writer.flushSync()).kind, lost === "sync" ? "sync-set-failed" : "acknowledgement-failed", "lost reply reports actual failed stage")
    const fresh = harness(clone(h.records), clone(h.syncRecords))
    if (lost === "sync") { equal((await fresh.writer.flushSync()).kind, "deferred", "fresh owner retains opaque hold"); fresh.advance(60000) }
    equal((await fresh.writer.flushSync()).kind, lost === "sync" ? "reconciled" : "idle", "fresh owner reconstructs persisted outcome")
    equal(fresh.syncWrites, [], "lost reply never resends identical document")
    equal(fresh.counts().generations, 1, "lost reply never replays user intent")
  }
  for (const change of ["off", "consent", "device", "schema", "history", "meta", "reset", "newer", "divergent", "local-generation", "incomplete"]) {
    const h = harness(), set = h.sync.set
    h.sync.set = async items => {
      await set(items)
      if (change === "off") h.records.device = { id: "device", consent: { v: 1, at: 1 }, syncOn: false }
      if (change === "consent") h.records.device = { id: "device", consent: null, syncOn: true }
      if (change === "device") h.records.device = { id: "other", consent: { v: 1, at: 1 }, syncOn: true }
      if (change === "schema") h.records.schema = 2
      if (change === "history") h.records.sync = { ...history, joined: "other" }
      if (change === "meta") h.syncRecords["s:meta"] = { ...meta, extra: { changed: true } }
      if (change === "reset") h.syncRecords["s:meta"] = { reset: true, id: "H", created: 0 }
      if (change === "newer") h.syncRecords[base] = { ...g1, v: 2 }
      if (change === "divergent") h.syncRecords[base] = { ...g1, at: 11 }
      if (change === "local-generation") {
        h.records[key] = { ...g1, gen: "external-new", at: 50 }
        h.records.sync = ack
      }
      if (change === "incomplete") h.syncRecords[base] = { v: 1, gen: "g1", at: 10, by: "old", n: 2 }
    }
    equal((await h.writer.flushSync()).kind, "unconfirmed", "stale postflight authority declines " + change)
    equal(h.sets, [pending(1065000)], "unconfirmed retains only prearm history")
    equal(h.counts().syncReads, ["off", "consent", "device", "schema", "history"].includes(change) ? 2 : 3, "local authority checked before more sync access")
  }
  {
    const h = harness(), set = h.sync.set
    h.sync.set = async items => { await set(items); h.records.sync = { ...history, future: { concurrent: own } } }
    equal((await h.writer.flushSync()).kind, "pushed", "latest history extensions remain authoritative")
    equal(h.sets, [pending(1065000), { sync: { ...ack, future: { concurrent: own } } }], "acknowledgement merges latest full raw history")
  }
  {
    const h = harness(), remoteSet = h.sync.set, localSet = h.local.set
    let enterSet!: () => void, releaseSet!: () => void, enterAck!: () => void, releaseAck!: () => void
    const setEntered = new Promise<void>(done => { enterSet = done }), setHold = new Promise<void>(done => { releaseSet = done })
    const ackEntered = new Promise<void>(done => { enterAck = done }), ackHold = new Promise<void>(done => { releaseAck = done })
    h.sync.set = async items => { enterSet(); await setHold; await remoteSet(items) }
    h.local.set = async items => { if (!Object.hasOwn(items, key) && !JSON.stringify(items).includes('"kind":"pending"')) { enterAck(); await ackHold }; await localSet(items) }
    const flush = h.writer.flushSync(); await setEntered
    const edit = h.change()
    equal(h.reads, [null, null, null, null], "queued edit cannot read during sync set")
    releaseSet(); await ackEntered
    equal(h.reads, [null, null, null, null, null, null], "queued edit waits through acknowledgement")
    releaseAck(); equal((await flush).kind, "pushed", "held flush confirms")
    equal(await edit, ok, "queued edit sees confirmed baseline")
    equal(h.sets.length, 3, "prearm ack and new edit each write once")
    equal(h.sets[2] && Object.keys(h.sets[2]), [key], "acknowledged queued edit needs only Filter write")
    equal(h.records.sync, ack, "queued generation remains pending")
  }
  {
    const h = harness(), set = h.local.set, marker = Error("ack failed")
    h.local.set = async items => { if (!Object.hasOwn(items, key) && !JSON.stringify(items).includes('"kind":"pending"')) throw marker; await set(items) }
    const flush = h.writer.flushSync(), edit = h.change()
    equal((await flush).kind, "acknowledgement-failed", "queued edit follows truthful acknowledgement failure")
    equal(await edit, ok, "queued edit repairs acknowledgement debt")
    equal(h.sets, [pending(1065000), { [key]: { ...g1, gen: "g2", at: 100, by: "device", data: { ...g1.data, on: true } }, sync: { ...ack, opaqueWrite: { gate: { kind: "pending", notBefore: 1065000 }, diagnostic: null } } }], "failed ack then replacement is one exact batch")
    const fresh = harness(clone(h.records), clone(h.syncRecords))
    equal(await fresh.change(false), ok, "restart after combined repair remains classifiable")
  }
  {
    const h = harness(); h.records.device = { id: "device", consent: { v: 1, at: 1 }, syncOn: false }; h.records.sync = { ...history, status: "off" }
    equal(await h.writer.flushSync(), { kind: "idle" }, "off flush is idle")
    equal(h.counts().syncReads, 0, "off flush has zero sync access")
  }
  for (const fault of ["null", "incoming", "unknown-local", "unknown-pushed", "full"]) {
    const h = harness()
    if (fault === "null") h.syncRecords[base] = null
    if (fault === "incoming") h.syncRecords[base] = { ...g0, gen: "incoming" }
    if (fault === "unknown-local") h.records["doc:unknown"] = g1
    if (fault === "unknown-pushed") h.records.sync = { ...history, pushed: { opaque: "g0" } }
    if (fault === "full") h.syncRecords.occupied = "x".repeat(8192)
    equal(await h.writer.flushSync(), { kind: fault === "full" ? "blocked" : "unavailable" }, "whole batch refusal " + fault)
    equal(h.sets, [], "refused flush no history writes")
    equal(h.syncWrites, [], "refused flush no partial push")
  }
  {
    const h = harness()
    delete h.records[setup]
    delete h.syncRecords[`s:${setup.slice(4)}`]
    h.records.sync = { ...history, pushed: { [key]: "g0" } }
    equal(await h.writer.flushSync(), { kind: "pushed", sent: [captured], repaired: [] }, "flush needs no selected playlist or setup")
  }
  {
    const h = harness()
    h.records["doc:settings"] = { v: 1, gen: "restore", at: 1, by: "old", data: { future: "x".repeat(51000) } }
    h.records["doc:filter:BBBBBBBBBBBBBBBB:PL_T"] = { v: 1, gen: "pending", at: 1, by: "old", deleted: true, future: "x".repeat(51000) }
    h.records.sync = { ...history, pushed: { ...history.pushed, "doc:settings": "restore" } }
    equal(await h.writer.flushSync(), { kind: "blocked" }, "whole pending plus acknowledged restoration refuses together")
    equal(h.syncWrites, [], "whole pending refusal never partially pushes")
    equal(h.sets, [], "whole pending refusal never acknowledges")
  }
  return { assertions }
}


test("manual outbound flush owns exact native effects and acknowledgement recovery", async () => {
  expect((await flushAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(130)
})


test("actual browser artifact rejects five observable outbound defects", async () => {
  const plannerPath = resolve(import.meta.dir, "sync-write-admission.ts"), writerPath = resolve(import.meta.dir, "local-filter-writer.ts")
  const planner = await readFile(plannerPath, "utf8"), writer = await readFile(writerPath, "utf8")
  const cases = [
    { name: "duplicate-resend", assertion: "exact captured push result", path: plannerPath,
      source: planner.replace('if (raw.gen !== state.pushed[name]) repairs.push(record)', 'if (raw.gen !== state.pushed[name]) repairs.push(record); documents.set(name, record)') },
    { name: "current-generation-ack", assertion: "changed replacement and exact old repair share one batch", path: writerPath,
      source: writer.replace('repairedHistory(history.raw, admission.repairs)', 'repairedHistory(history.raw, admission.repairs.map(record => record.name === filterKey ? { ...record, gen: envelope.gen } : record))') },
    { name: "ack-debt-stranding", assertion: "changed replacement and exact old repair share one batch", path: writerPath,
      source: writer.replace('if (admission.kind === "planned" && history)', 'if (admission.kind === "planned" && history && false)') },
    { name: "stale-postflight", assertion: "stale postflight authority declines device", path: writerPath,
      source: writer.replace(' || !sameSyncJson(current.rawDevice, ready.rawDevice)', '') },
    { name: "split-replacement-repair", assertion: "changed replacement and exact old repair share one batch", path: writerPath,
      source: writer.replace('await deps.local.set(items)', 'if (items.sync) { const { sync, ...documents } = items; await deps.local.set(documents); await deps.local.set({ sync }) } else await deps.local.set(items)') }
  ]
  for (const fault of cases) {
    expect(fault.source).not.toBe(fault.path === plannerPath ? planner : writer)
    const build = await Bun.build({ entrypoints: [writerPath], target: "browser", format: "cjs", minify: true,
      plugins: [{ name: fault.name, setup(builder) {
        builder.onLoad({ filter: /\/(?:sync-write-admission|local-filter-writer)\.ts$/ }, args => args.path === fault.path ? { loader: "ts", contents: fault.source } : undefined)
      } }] })
    expect(build.success).toBe(true)
    const bytes = await build.outputs[0]!.text()
    const script = `(async()=>{const module={exports:{}};${bytes};try {await (${flushAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");return {caught:false}} catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0]}}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect({ name: fault.name, ...observed }).toEqual({ name: fault.name, caught: true, assertion: fault.assertion })
  }
})


async function driverAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  let assertions = 0
  const timing: { scenario: string; invocations: number[]; timers: { due: number; event: string }[] }[] = []
  const equal = (actual: unknown, expected: unknown, message: string) => {
    assertions++
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(message + ": " + JSON.stringify(actual))
  }
  const key = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", setup = "doc:setup:AAAAAAAAAAAAAAAA", base = "s:filter:AAAAAAAAAAAAAAAA:PL_P"
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const g0 = { v: 1, gen: "g0", at: 1, by: "synthetic-device", data: { mode: "deny", on: true, channels: [] }, future: { keep: 1 } }
  const setupDoc = { v: 1, gen: "S", at: 1, by: "synthetic-device", data: { autoAdd: [{ pl: "PL_P", takes: "videos" }] } }
  const settle = async () => { for (let i = 0; i < 120; i++) await Promise.resolve() }
  function harness(off = false, created = 0) {
    let time = created, generation = 0, wall = 700000, origin = "construction", subscriptions = 0, accesses = 0
    const timers = new Map<number, { due: number; run: () => void; event: string }>()
    const listener = new Set<() => void>(), scheduled: { due: number; event: string }[] = [], invocations: number[] = []
    const results: Parameters<Parameters<typeof create>[0]["onSyncResult"]>[0][] = []
    let serial = 0
    const records: Record<string, unknown> = { schema: 1, device: { id: "synthetic-device", consent: { v: 1, at: 0 }, syncOn: !off },
      sync: { joined: "H", pushed: { [key]: "g0", [setup]: "S" }, status: off ? "off" : "ok", editedSinceOff: false, future: { keep: true } },
      [setup]: clone(setupDoc), [key]: clone(g0) }
    const remote: Record<string, unknown> = { "s:meta": { v: 1, id: "H", created: 0 }, "s:setup:AAAAAAAAAAAAAAAA": clone(setupDoc), [base]: clone(g0) }
    const reads: unknown[] = [], writes: unknown[] = [], localSets: unknown[] = []
    const local: Parameters<typeof create>[0]["local"] = {
      async get(keys) { reads.push(keys); return clone(keys === null ? records : Object.fromEntries(keys.filter(k => Object.hasOwn(records, k)).map(k => [k, records[k]]))) },
      async set(items) { localSets.push(clone(items)); Object.assign(records, clone(items)) }
    }
    const sync: Parameters<typeof create>[0]["sync"] = {
      async get() { accesses++; return clone(remote) },
      async set(items) { accesses++; invocations.push(time); writes.push(clone(items)); Object.assign(remote, clone(items)); for (const changed of listener) changed() },
      subscribe(changed) { accesses++; subscriptions++; listener.add(changed); return () => { subscriptions--; listener.delete(changed) } }
    }
    const writer = create({ claim: { kind: "unavailable" }, local, sync, now: () => wall, generation: () => `g${++generation}`,
      syncClock: { now: () => time, wallNow: () => wall, after(milliseconds, run) {
        equal(milliseconds <= 25000, true, "bounded event timer")
        const id = ++serial, entry = { due: time + milliseconds, run, event: origin }
        timers.set(id, entry); scheduled.push({ due: entry.due, event: origin })
        return () => { timers.delete(id) }
      } }, onSyncResult: result => { results.push(result) } })
    const move = (at: number, event = "external") => { time = at; wall = 700000 + at; origin = event }
    const fire = async (at: number) => {
      move(at, "timer")
      for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.run() }
      await settle()
      origin = "external"
    }
    const change = (on: boolean) => writer.change({ kind: "ui", windowId: 1, incognito: false }, {
      acct, playlist, desired: { mode: "deny", on }, clearListedChannels: "not-confirmed"
    })
    const event = async () => { origin = "sync event"; for (const changed of listener) changed(); await settle() }
    return { writer, records, remote, results, reads, writes, localSets, local, sync, timers, scheduled, invocations, change, move, fire, event,
      counts: () => ({ subscriptions, accesses }) }
  }
  {
    const h = harness()
    equal(h.counts(), { subscriptions: 0, accesses: 0 }, "construction is lazy")
    await h.writer.startSync(); await h.writer.startSync()
    equal(h.counts().subscriptions, 1, "idempotent start owns one listener")
    h.move(1000, "edit g1"); await h.change(false)
    h.move(2000, "edit g2"); await h.change(true)
    h.move(3000, "no-op"); await h.change(true)
    h.move(4800, "late no-op"); await h.change(true)
    equal([...h.timers.values()].map(t => t.due), [5000], "no-op cannot postpone quiet deadline")
    equal(await h.writer.flushSync(), { kind: "deferred", notBefore: 5000 }, "manual cannot bypass initial pacing")
    await h.fire(4999); equal(h.invocations, [], "no native set before barrier")
    await h.fire(5000); equal(h.invocations, [5000], "first batch invokes at barrier")
    const g2 = { ...g0, gen: "g2", at: 702000 }
    equal(h.writes, [{ [base]: g2 }], "exact complete latest generation and original wall stamp")
    equal(h.records.sync, { joined: "H", pushed: { [key]: "g2", [setup]: "S" }, status: "ok", editedSinceOff: false, future: { keep: true } }, "exact raw history acknowledgement")
    equal(h.timers.size, 0, "own event terminal idle without timer")
    h.move(6000, "edit g3"); await h.change(false)
    h.move(6500, "no-op"); await h.change(false)
    h.move(7000); equal(await h.writer.flushSync(), { kind: "deferred", notBefore: 10000 }, "manual shares next invocation deadline")
    h.move(10000); const manual = h.writer.flushSync(); await h.fire(10000); await manual
    equal(h.invocations, [5000, 10000], "manual race produces one set")
    equal(h.timers.size, 0, "manual invalidates stale ticket")
    delete h.remote[base]; await h.event()
    equal(h.timers.size, 1, "vanished base event schedules restoration")
    await h.fire(15000); equal(h.invocations, [5000, 10000, 15000], "vanished base restores once")
    await h.event(); equal(h.timers.size, 0, "noisy identical event stays idle")
    timing.push({ scenario: "bursts-manual-race-restoration", invocations: [...h.invocations], timers: [...h.scheduled] })
    await h.writer.dispose(); equal(h.counts().subscriptions, 0, "dispose removes listener")
  }
  {
    const h = harness(); await h.writer.startSync(); h.move(1000); await h.change(false)
    let releaseSet!: () => void, releaseAck!: () => void
    const setGate = new Promise<void>(done => { releaseSet = done }), ackGate = new Promise<void>(done => { releaseAck = done })
    const set = h.sync.set, ack = h.local.set
    h.sync.set = async items => { await set(items); await setGate }
    h.local.set = async items => { if (Object.keys(items).join() === "sync" && !JSON.stringify(items).includes('"kind":"pending"')) await ackGate; await ack(items) }
    await h.fire(5000)
    h.move(6000, "queued edit"); const before = h.reads.length, edit = h.change(true)
    await settle(); equal(h.reads.length, before, "held native set blocks queued edit reads")
    h.move(12000); releaseSet(); await settle()
    equal(h.reads.length, before + 2, "held acknowledgement still blocks edit")
    h.move(13000, "queued edit commit"); releaseAck(); await edit; await settle()
    equal([...h.timers.values()].map(t => t.due), [15000], "queued real commit owns follow-up")
    equal(h.invocations, [5000], "captured old generation only")
    await h.fire(15000); equal(h.invocations, [5000, 15000], "queued generation gets its own set")
    equal(h.timers.size, 0, "held pass drains to terminal idle")
    timing.push({ scenario: "held-set-and-acknowledgement", invocations: [...h.invocations], timers: [...h.scheduled] })
    await h.writer.dispose()
  }
  {
    const h = harness(); await h.writer.startSync(); h.move(1000); await h.change(false); await h.fire(5000)
    h.move(6000); await h.change(true)
    const get = h.sync.get
    let delayed = false
    h.sync.get = async () => { if (!delayed) { delayed = true; h.move(11000, "timer") } return get() }
    await h.fire(10000); equal(h.invocations, [5000, 11000], "delayed preflight actual invocation")
    h.move(12000, "edit after delayed invocation"); await h.change(false)
    h.move(15000); equal(await h.writer.flushSync(), { kind: "deferred", notBefore: 16000 }, "spacing uses actual invocation rather than due time")
    await h.fire(16000); equal(h.invocations, [5000, 11000, 16000], "delayed invocation owns spacing")
    timing.push({ scenario: "actual-invocation-versus-due-time", invocations: [...h.invocations], timers: [...h.scheduled] })
    await h.writer.dispose()
  }
  {
    const old = harness(); await old.writer.dispose()
    const h = harness(false, 4900)
    h.records[key] = { ...g0, gen: "g1", at: 10, data: { ...g0.data, on: false } }
    await h.writer.startSync()
    equal(await h.writer.flushSync(), { kind: "deferred", notBefore: 9900 }, "fresh owner manual barrier")
    await h.fire(9899); equal(h.invocations, [], "fresh owner automatic barrier")
    await h.fire(9900); equal(h.invocations, [9900], "fresh owner first set")
    timing.push({ scenario: "stopped-owner-replacement-barrier", invocations: [...h.invocations], timers: [...h.scheduled] })
    await h.writer.dispose()
    const repair = harness(false, 4900)
    repair.records[key] = clone(h.records[key]); repair.remote[base] = clone(h.records[key])
    await repair.writer.startSync()
    equal(repair.results.map(r => r.kind), ["reconciled"], "accepted unacknowledged readback repairs during barrier")
    equal(repair.invocations, [], "repair consumes no push slot")
    await repair.writer.startSync(); equal(repair.results.at(-1)?.kind, "idle", "lost acknowledgement reply repeat idle")
    await repair.writer.dispose()
  }
  {
    const h = harness(true); await h.writer.startSync(); h.move(1000); await h.change(false); await h.event()
    equal(h.counts(), { subscriptions: 0, accesses: 0 }, "off start edit event have zero sync access")
    equal(h.timers.size, 0, "off has no timer")
    await h.writer.dispose()
    let rejected = false; try { await h.writer.startSync() } catch { rejected = true }
    equal(rejected, true, "disposed rejects new work")
    const active = harness(); await active.writer.startSync(); active.move(1000); await active.change(false)
    active.records.device = { id: "synthetic-device", consent: { v: 1, at: 0 }, syncOn: false }
    active.records.sync = { joined: "H", pushed: {}, status: "off", editedSinceOff: false }
    const before = active.counts().accesses; await active.event()
    equal(active.counts(), { subscriptions: 0, accesses: before }, "later off cancels without sync access")
    equal(active.timers.size, 0, "later off cancels ticket")
    await active.writer.dispose()
  }
  {
    const h = harness(); await h.writer.startSync(); h.move(1000); await h.change(false)
    const [id, timer] = [...h.timers.entries()][0]!
    h.timers.delete(id); h.move(4999, "timer"); timer.run(); await settle()
    equal(h.scheduled.filter(timer => timer.event === "timer").length, 0, "timer callback cannot rearm")
    equal(h.results.at(-1), { kind: "deferred", notBefore: 5000 }, "early callback reports deferral")
    equal(h.timers.size, 0, "deferred callback cannot rearm itself")
    h.move(5000); await h.event()
    equal(h.invocations, [5000], "independent event can consume deferred work")
    await h.writer.dispose()
  }
  {
    const h = harness(); await h.writer.startSync(); h.move(1000); await h.change(false)
    const scheduled = h.scheduled.length, deadline = [...h.timers.values()].map(timer => timer.due)
    h.move(2000)
    equal(await h.writer.change({ kind: "ui", windowId: 1, incognito: true }, { acct, playlist, desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }),
      { kind: "result", result: { refused: "private" } }, "refused edit remains public refusal")
    const set = h.local.set, marker = { commit: "failed" }
    h.local.set = async () => { throw marker }
    h.move(2500); let caught: unknown; try { await h.change(true) } catch (error) { caught = error }
    equal(caught === marker, true, "failed commit preserves original error")
    h.local.set = set
    const setupDoc = h.records[setup]; h.records[setup] = null
    h.move(3000)
    equal(await h.change(true), { kind: "unavailable", reason: "account-context" }, "unavailable edit remains unavailable")
    h.records[setup] = setupDoc
    equal(h.scheduled.length, scheduled, "refused unavailable failed commits create no ticket")
    equal([...h.timers.values()].map(timer => timer.due), deadline, "refused unavailable failed commits never postpone deadline")
    await h.fire(5000); equal(h.invocations, [5000], "accepted pending generation retains original due pass")
    await h.writer.dispose()
  }
  for (const fault of ["metadata", "incomplete", "incoming", "newer", "full"] as const) {
    const h = harness(); await h.writer.startSync(); h.move(1000); await h.change(false)
    const pending = clone(h.records[key])
    if (fault === "metadata") h.remote["s:meta"] = { v: 1, id: "other", created: 0 }
    if (fault === "incomplete") h.remote[base] = { v: 1, gen: "g0", at: 1, by: "synthetic-device", n: 1 }
    if (fault === "incoming") h.remote[base] = { ...g0, gen: "incoming", at: 20 }
    if (fault === "newer") h.remote[base] = { ...g0, v: 2, gen: "protected" }
    if (fault === "full") h.remote.occupied = "x".repeat(99000)
    h.move(2000); await h.event()
    equal(h.results.at(-1)?.kind, fault === "newer" ? "idle" : fault === "full" ? "blocked" : "unavailable", "automatic retains planner classification " + fault)
    equal(h.invocations, [], "automatic unavailable or blocked never partially pushes " + fault)
    equal(h.records[key], pending, "automatic unavailable or blocked preserves local document " + fault)
    equal(h.timers.size, 0, "unavailable or blocked waits for independent event " + fault)
    h.remote["s:meta"] = { v: 1, id: "H", created: 0 }; h.remote[base] = clone(g0); delete h.remote.occupied
    h.move(6000); await h.event()
    equal(h.invocations, [6000], "later changed inventory can recheck " + fault)
    equal(h.timers.size, 0, "rechecked classification ends idle " + fault)
    await h.writer.dispose()
  }
  for (const boundary of ["local-pre", "sync-pre", "set", "local-post", "sync-post", "ack"] as const) {
    const h = harness(); await h.writer.startSync(); h.move(1000); await h.change(false)
    const getLocal = h.local.get, getSync = h.sync.get, setSync = h.sync.set, setLocal = h.local.set
    let release!: () => void, entered = false, localReads = 0, syncReads = 0
    const gate = new Promise<void>(done => { release = done })
    const hold = async () => { entered = true; await gate }
    h.local.get = async keys => { localReads++; if (boundary === (localReads === 1 ? "local-pre" : "local-post")) await hold(); return getLocal(keys) }
    h.sync.get = async () => { syncReads++; if (boundary === (syncReads === 1 ? "sync-pre" : "sync-post")) await hold(); return getSync() }
    h.sync.set = async items => { if (boundary === "set") await hold(); await setSync(items) }
    h.local.set = async items => { if (boundary === "ack") await hold(); await setLocal(items) }
    await h.fire(5000); equal(entered, true, "real awaited IO boundary reached " + boundary)
    const reads = h.reads.length
    h.move(6000, "edit during " + boundary); const edit = h.change(true)
    void h.event()
    await settle(); equal(h.reads.length, reads, "queued edit and event cannot read across " + boundary)
    h.move(7000, "release " + boundary); release(); await edit; await settle()
    equal(h.records.sync, { joined: "H", pushed: { [key]: "g1", [setup]: "S" }, status: "ok", editedSinceOff: false, future: { keep: true } }, "acknowledge captured generation at " + boundary)
    equal(h.records[key], { ...g0, gen: "g2", at: 706000 }, "queued real edit keeps request wall stamp at " + boundary)
    h.local.get = getLocal; h.sync.get = getSync; h.sync.set = setSync; h.local.set = setLocal
    await h.fire(12000)
    equal(h.writes.length, 2, "fresh follow-up sends queued generation at " + boundary)
    equal(h.timers.size, 0, "IO boundary ends idle " + boundary)
    timing.push({ scenario: boundary, invocations: [...h.invocations], timers: [...h.scheduled] })
    await h.writer.dispose()
  }
  {
    const h = harness(); await h.writer.startSync(); h.move(1000); await h.change(false)
    let release!: () => void; const gate = new Promise<void>(done => { release = done }), set = h.sync.set
    h.sync.set = async items => { await set(items); await gate }
    await h.fire(5000)
    const disposed = h.writer.dispose(); let drained = false; void disposed.then(() => { drained = true })
    await settle(); equal(drained, false, "dispose waits for earlier accepted native work")
    equal(h.counts().subscriptions, 0, "dispose removes listener immediately")
    equal(h.timers.size, 0, "dispose cancels tickets immediately")
    let rejected = false; try { await h.change(true) } catch { rejected = true }
    equal(rejected, true, "dispose prevents new changes immediately")
    release(); await disposed; equal(drained, true, "dispose drains prior owner before replacement")
  }
  for (const stage of ["startup-read", "subscribe"] as const) {
    const h = harness(), marker = { start: stage }, get = h.local.get, subscribe = h.sync.subscribe
    if (stage === "startup-read") h.local.get = async () => { throw marker }
    else h.sync.subscribe = () => { throw marker }
    await h.writer.startSync()
    const outcome = h.results.at(-1)
    equal(outcome?.kind, "rejected", "startup failure reports original rejection " + stage)
    equal(outcome && "error" in outcome && outcome.error === marker, true, "startup failure preserves original identity " + stage)
    h.local.get = get; h.sync.subscribe = subscribe
    await h.writer.startSync(); h.move(1000); await h.change(false); await h.fire(10000)
    equal(h.invocations, [], "startup error cannot automatically restart " + stage)
    equal(h.timers.size, 0, "startup error retains no timer " + stage)
    await h.writer.dispose()
  }
  for (const stage of ["preflight", "set", "ack", "postflight"] as const) {
    const h = harness(), marker = { opaque: stage }
    await h.writer.startSync(); h.move(1000); await h.change(false)
    const get = h.sync.get, set = h.sync.set, ack = h.local.set
    if (stage === "preflight") h.sync.get = async () => { throw marker }
    if (stage === "set") h.sync.set = async items => { await set(items); throw marker }
    if (stage === "ack") h.local.set = async items => { if (Object.keys(items).join() === "sync" && !JSON.stringify(items).includes('"kind":"pending"')) throw marker; await ack(items) }
    if (stage === "postflight") h.sync.get = async () => { if (h.invocations.length) throw marker; return get() }
    await h.fire(5000)
    const outcome = stage === "set" ? h.results.findLast(r => r.kind === "sync-set-failed") : h.results.at(-1)
    equal(outcome?.kind, stage === "preflight" ? "rejected" : stage === "set" ? "sync-set-failed" : stage === "ack" ? "acknowledgement-failed" : "unconfirmed", "opaque original stage " + stage)
    const error = outcome && ("error" in outcome ? outcome.error : outcome.kind === "unconfirmed" && outcome.cause.kind === "read-failed" ? outcome.cause.error : undefined)
    equal(error === marker, true, "original opaque error identity " + stage)
    equal(h.counts().subscriptions, stage === "set" ? 1 : 0, "opaque failure retains only recoverable listener")
    equal(h.timers.size, 0, "opaque failure cancels tickets")
    h.sync.get = get; h.sync.set = set; h.local.set = ack
    const count = h.invocations.length, resultCount = h.results.length
    h.move(6000); await h.writer.startSync(); await h.change(true); await h.event()
    equal(h.invocations.length, count, "opaque stop survives start event and edit")
    h.move(7000)
    equal(await h.writer.flushSync(), { kind: "deferred", notBefore: stage === "preflight" ? 8000 : stage === "set" ? 65000 : 10000 }, "rejected attempts remain charged and manual stays paced " + stage)
    await h.fire(20000)
    equal(h.invocations.length, count, "opaque stop survives start event and edit")
    if (stage !== "set") equal(h.results.length, resultCount, "opaque stop never silently restarts")
    const currentResults = h.results.length
    await h.writer.flushSync(); equal(h.results.length, currentResults, "manual does not clear automatic stop")
    await h.writer.dispose()
  }
  return { assertions, timing }
}

test("event driver exact timing tickets and opaque stop", async () => {
  expect((await driverAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(180)
})

test("actual browser artifact executes event timing with guarded ambient globals", async () => {
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "local-filter-writer.ts")], target: "browser", format: "cjs", minify: true })
  expect(build.success).toBe(true)
  const bytes = await build.outputs[0]!.text()
  const script = `(async()=>{let reads=0;const names=["Date","performance","setTimeout","clearTimeout","setInterval","browser","chrome","fetch","crypto","Bun","process","localStorage","indexedDB"];for(const name of names)Object.defineProperty(globalThis,name,{get(){reads++;throw Error(name)}});Object.defineProperty(Math,"random",{get(){reads++;throw Error("random")}});const module={exports:{}};${bytes};const acct="AAAAAAAAAAAAAAAA",playlist="PL_P";const result=await (${driverAcceptance.toString()})(module.exports.createLocalFilterWriter,acct,playlist);if(reads)throw Error("ambient read");let controls=0;for(const name of names){try{globalThis[name]}catch{controls++}}try{Math.random}catch{controls++}return {...result,reads,controls};})()`
  const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
  expect(observed.assertions).toBeGreaterThan(180)
  expect(observed.controls).toBe(14)
  expect(observed.reads).toBeGreaterThanOrEqual(14)
})


test("actual browser artifact rejects six observable event driver defects", async () => {
  const path = resolve(import.meta.dir, "local-filter-writer.ts"), original = await readFile(path, "utf8")
  const cases = [
    { name: "no-op-postponement", assertion: "no-op cannot postpone quiet deadline", source: original.replace('if (result.kind === "unchanged") {', 'if (result.kind === "unchanged") { quietUntil = deps.syncClock.now() + 2000; arm(Math.max(quietUntil, nextInvocation), event);') },
    { name: "manual-bypass", assertion: "manual cannot bypass initial pacing", source: original.replace('return enqueue(() => attempt(event))', 'return enqueue(async () => { quietUntil = nextInvocation = 0; return attempt(event) })') },
    { name: "timer-instead-of-invocation", assertion: "spacing uses actual invocation rather than due time", source: original.replace('nextInvocation = invokedAt + 5000', 'nextInvocation += 5000') },
    { name: "self-rearming-callback", assertion: "timer callback cannot rearm", source: original.replace('await automatic(current.event, false)', 'await automatic(current.event, true)') },
    { name: "duplicate-own-event-set", assertion: "first batch invokes at barrier", source: original.replace('let quietUntil = 0', 'let duplicated = false; let quietUntil = 0').replace('if (plan.sent.length === 0 && plan.repairs.length === 0) return { kind: "idle" }', 'if (plan.sent.length === 0 && plan.repairs.length === 0) { if (nextInvocation > 5000 && !duplicated) { duplicated = true; await deps.sync.set(Object.fromEntries(Object.entries(records).filter(([key]) => key.startsWith("doc:")).map(([key,value]) => [key.replace(/^doc:/,"s:"),value]))) }; return { kind: "idle" } }') },
    { name: "automatic-restart-after-error", assertion: "startup error cannot automatically restart startup-read", source: original.replace('if (claimConfirmation === "unconfirmed" || lifetime.kind === "stopped" || lifetime.kind === "disposed") return', 'if (claimConfirmation === "unconfirmed" || lifetime.kind === "disposed") return; if (lifetime.kind === "stopped") lifetime = { kind: "inactive" }') }
  ]
  for (const fault of cases) {
    expect(fault.source).not.toBe(original)
    const build = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true,
      plugins: [{ name: fault.name, setup(builder) { builder.onLoad({ filter: /\/local-filter-writer\.ts$/ }, () => ({ loader: "ts", contents: fault.source })) } }] })
    expect(build.success).toBe(true)
    const bytes = await build.outputs[0]!.text()
    const script = `(async()=>{const module={exports:{}};${bytes};try {await (${driverAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");return {caught:false}}catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0]}}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect({ name: fault.name, ...observed }).toEqual({ name: fault.name, caught: true, assertion: fault.assertion })
  }
})

async function receiveAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  let assertions = 0
  function equal(actual: unknown, expected: unknown, message: string) {
    assertions++
    const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
    if (stable(actual) !== stable(expected)) throw Error(message + ": " + stable(actual) + " != " + stable(expected))
  }
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const key = { kind: "filter", acct, playlist } as const
  const F = `doc:filter:${acct}:${playlist}`, S = `doc:setup:${acct}`, Q = `doc:filter:${acct}:PL_Q`, B = `s:filter:${acct}:${playlist}`
  const old = { v: 1, gen: "f0", at: 10, by: "device-a", data: { mode: "deny", on: true, channels: [] }, oldOnly: "not merged" }
  const incoming = JSON.parse('{"v":1,"gen":"f1","at":20,"by":"device-b","envelope":{"future":true},"__proto__":{"keep":true},"toJSON":"inert","data":{"mode":"allow","on":false,"channels":[["UCaaaaaaaaaaaaaaaaaaaaaa","Title",null,{"future":1}]],"future":{"keep":[null,1]}}}')
  const setup = { v: 1, gen: "s0", at: 1, by: "device-a", data: { autoAdd: [{ pl: "PL_P", takes: "both" }, { pl: "PL_Q", takes: "videos" }] } }
  const pendingQ = { v: 1, gen: "q1", at: 15, by: "device-a", data: { on: true }, pending: { keep: true } }
  const history = { joined: "h", pushed: { [F]: "f0", [S]: "s0", [Q]: "q0" }, status: "ok", editedSinceOff: false, extra: { keep: true } }
  const device = { id: "device-a", consent: { v: 1, at: 1 }, syncOn: true, upgradeNote: null, claimNotice: null, lastAccount: null,
    newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: true }
  const local = { schema: 1, device, sync: history, [S]: setup, [F]: old, [Q]: pendingQ }
  const remote = { "s:meta": { v: 1, id: "h", created: 1, extension: { keep: true } }, [`s:setup:${acct}`]: setup,
    [B]: incoming, [`s:filter:${acct}:PL_Q`]: { v: 1, gen: "q0", at: 5, by: "device-a", data: {} } }
  const expectedSet = { [F]: incoming, sync: { ...history, pushed: { [F]: "f1", [S]: "s0", [Q]: "q0" } } }
  const received = { key, name: F, gen: "f1", document: incoming }, adopted = { kind: "adopted", received }
  const unavailable = (reason: string) => ({ kind: "unavailable", reason })
  const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve() }
  function harness(records: Record<string, unknown> = clone(local)) {
    const snapshot: Record<string, unknown> = clone(remote)
    const reads: string[] = [], sets: unknown[] = [], writes: unknown[] = [], results: unknown[] = []
    const timers = new Map<number, { due: number; run: () => void }>()
    let time = 0, generation = 0, wall = 0, clock = 0, subscriptions = 0, scheduled = 0, cancelled = 0, listener: (() => void) | undefined
    const io: LocalWriteStorage = {
      async get() { reads.push("local"); return { ...records } },
      async set(items) { sets.push(clone(items)); Object.assign(records, clone(items)) }
    }
    const sync = {
      async get() { reads.push("sync"); return { ...snapshot } },
      async set(items: Readonly<Record<string, unknown>>) { writes.push(clone(items)); Object.assign(snapshot, clone(items)); listener?.() },
      subscribe(run: () => void) { subscriptions++; listener = run; return () => { subscriptions--; listener = undefined } }
    }
    const writer = create({ claim: { kind: "unavailable" }, local: io, sync, now: () => { wall++; return 100 }, generation: () => `g${++generation}`,
      syncClock: { now: () => { clock++; return time }, wallNow: () => 1000000, after(ms, run) { const id = ++scheduled; timers.set(id, { due: time + ms, run }); return () => { cancelled++; timers.delete(id) } } },
      onSyncResult(result) { results.push(result) } })
    return { writer, records, remote: snapshot, reads, sets, writes, results, io, sync, timers,
      counts: () => ({ generation, wall, clock, subscriptions, scheduled, cancelled }), move: (at: number) => { time = at },
      event: async () => { listener?.(); await settle() },
      change: (mode: "allow" | "deny", on: boolean, confirm?: string) => writer.change({ kind: "ui", windowId: 1, incognito: false },
        confirm === undefined ? { acct, playlist, desired: { mode, on }, clearListedChannels: "not-confirmed" }
          : { acct, playlist, desired: { mode, on }, clearListedChannels: "confirmed", expectedGeneration: confirm }) }
  }
  const primary = harness(), counts = primary.counts()
  equal(await primary.writer.receiveSyncDocument(key), adopted, "raw adoption result")
  equal(primary.sets, [expectedSet], "one exact two-key set")
  equal(primary.records, { ...local, ...expectedSet }, "whole replacement preserves unrelated pending body")
  equal(primary.remote, remote, "receive never mutates remote")
  equal(primary.reads, ["local", "sync", "local", "sync", "local", "local", "sync"], "finite staged IO order")
  equal(primary.counts(), counts, "receive changes no clocks tickets subscriptions stamps")
  equal(primary.results, [], "manual receive emits no automatic result")
  equal(await primary.writer.receiveSyncDocument(key), { kind: "idle" }, "repeat receive idle")
  equal(primary.sets, [expectedSet], "idle receive never repairs or writes")
  equal(await primary.writer.flushSync(), { kind: "deferred", notBefore: 5000 }, "receive preserves initial outbound barrier")
  primary.move(5000)
  const q = { key: { kind: "filter", acct, playlist: "PL_Q" }, name: Q, gen: "q1", document: pendingQ }
  equal(await primary.writer.flushSync(), { kind: "pushed", sent: [q], repaired: [] }, "unchanged adopted filter never echoes")
  equal(primary.writes, [{ [`s:filter:${acct}:PL_Q`]: pendingQ }], "only unrelated pending Q sent")
  equal(await primary.writer.flushSync(), { kind: "idle" }, "repeat flush idle")
  const fresh = harness({ ...clone(local), ...clone(expectedSet) }); fresh.move(5000)
  equal(await fresh.writer.flushSync(), { kind: "pushed", sent: [q], repaired: [] }, "fresh owner sends only Q")

  const pointer = { v: 1, gen: "f1", at: 20, by: "device-b", n: 2 }
  const fragment0 = '{"v":1,"gen":"f1","at":20,"by":"device-b","data":'
  const fragment1 = '{"mode":"allow","on":false,"channels":[]},"chunkExtra":true}'
  {
    const h = harness(); h.remote[B] = pointer; h.remote[B + "@f1.0"] = fragment0; h.remote[B + "@f1.1"] = fragment1
    h.remote[B + "@old.0"] = "old fragment"; h.remote.unknown = { keep: true }
    const before = clone(h.remote), document = JSON.parse(fragment0 + fragment1)
    equal(await h.writer.receiveSyncDocument(key), { kind: "adopted", received: { ...received, document } }, "literal complete chunk adoption")
    equal(h.sets, [{ ...expectedSet, [F]: document }], "chunk suffix field retained")
    equal(h.remote, before, "chunks unknown items never cleaned")
  }
  for (const document of [
    { v: 1, gen: "f1", at: 20, by: "b", data: { future: [null, 1] }, extra: true },
    { ...incoming, data: { ...incoming.data, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "x".repeat(10000), null, { suffix: true }, 7]] } }
  ]) {
    const h = harness(); h.remote[B] = document
    equal(await h.writer.receiveSyncDocument(key), { kind: "adopted", received: { ...received, document } }, "raw omissions labels and tuple suffixes retained")
    equal(h.records[F], document, "decoded defaults never materialized")
  }
  {
    const h = harness(), own = JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}')
    h.records.sync = { ...history, ...own, pushed: { ...history.pushed, "unrecognized:key": "opaque-gen" } }
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "opaque history can receive")
    equal(h.records.sync, { ...expectedSet.sync, ...own, pushed: { ...expectedSet.sync.pushed, "unrecognized:key": "opaque-gen" } }, "opaque history exact preservation")
  }
  {
    const h = harness(); let calls = 0, result
    h.io.set = async items => { h.sets.push(items); Object.assign(h.records, items) }
    Object.defineProperty(Object.prototype, "toJSON", { configurable: true, value() { calls++; throw Error("inherited serializer invoked") } })
    try { result = await h.writer.receiveSyncDocument(key) } finally { Reflect.deleteProperty(Object.prototype, "toJSON") }
    equal(result, adopted, "raw snapshots never invoke inherited serialization hooks")
    equal(calls, 0, "inherited serializer stays inert")
    equal(h.sets, [expectedSet], "hook-safe snapshot preserves raw values")
  }
  for (const gen of ["fpending", "f1"]) {
    const h = harness(); h.records[F] = { ...old, gen }; h.remote[B] = { ...incoming, at: 200 }
    equal(await h.writer.receiveSyncDocument(key), unavailable("pending"), "target pending remains unavailable")
    equal(h.sets, [], "target pending body never overwritten")
  }
  {
    const h = harness(); h.records[F] = clone(incoming)
    equal(await h.writer.receiveSyncDocument(key), { kind: "idle" }, "exact debt stays idle")
    equal(h.sets, [], "exact debt not repaired by receive")
    h.records[Q] = clone(remote[`s:filter:${acct}:PL_Q`])
    equal((await h.writer.flushSync()).kind, "reconciled", "existing outbound exact debt repair remains available")
  }
  for (const patch of [{ at: 10, by: "device-a" }, { at: 10, by: "z" }, { at: 9 }, { gen: "f0", at: 10 }, { gen: "f0", at: 200 }]) {
    const h = harness(); h.remote[B] = { ...incoming, ...patch }
    equal(await h.writer.receiveSyncDocument(key), unavailable("conflict"), "equal lower same-generation conflict")
    equal(h.sets, [], "conflict no write")
  }
  for (const variant of ["future", "dead", "null", "absent", "incomplete", "index", "stamp", "invalid"]) {
    const h = harness()
    if (variant === "future") h.remote[B] = { v: 2, gen: "future", at: 30, by: "b", n: 99 }
    if (variant === "dead") h.remote[B] = { v: 1, gen: "dead", at: 30, by: "b", deleted: true }
    if (variant === "null") h.remote[B] = null
    if (variant === "absent") delete h.remote[B]
    if (["incomplete", "index", "stamp"].includes(variant)) {
      h.remote[B] = pointer; h.remote[B + "@f1.0"] = fragment0
      if (variant !== "incomplete") h.remote[B + "@f1.1"] = fragment1
      if (variant === "stamp") h.remote[B + "@f1.0"] = fragment0.replace('"f1"', '"wrong"')
      if (variant === "index") h.remote[B + "@f1.01"] = "invalid index"
    }
    if (variant === "invalid") h.remote[B] = { ...incoming, data: { mode: "invalid" } }
    equal(await h.writer.receiveSyncDocument(key), unavailable("document"), "unsupported incoming " + variant)
    equal(h.records, local, "unsupported incoming leaves local exact " + variant)
  }
  for (const value of [undefined, null, { ...old, v: 2 }, { v: 1, gen: "dead", at: 1, by: "b", deleted: true }, { ...old, data: { on: 2 } }]) {
    const h = harness(); if (value === undefined) delete h.records[F]; else h.records[F] = value
    equal(await h.writer.receiveSyncDocument(key), unavailable("document"), "unsupported local target")
    equal(h.writes, [], "unsupported local no outbound write")
  }
  for (const value of [undefined, null, { ...setup, v: 2 }, { ...setup, deleted: true }, { ...setup, data: { autoAdd: 2 } }]) {
    const h = harness(); if (value === undefined) delete h.records[S]; else h.records[S] = value
    equal(await h.writer.receiveSyncDocument(key), unavailable("account-context"), "target supported setup required")
    equal(h.sets, [], "no context no adoption")
  }
  for (const value of [{ v: 2, gen: "future", at: 1, by: "b", n: 99 }, { ...old, gen: "q2" }, { malformed: true }, { v: 1, gen: "dead", at: 30, by: "b", deleted: true }]) {
    const h = harness(); h.remote[`s:filter:${acct}:PL_Q`] = value
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "unrelated semantic observation does not veto target")
    equal(h.records[Q], pendingQ, "unrelated semantic document untouched")
  }
  for (const fault of ["off", "consent", "stale-consent", "upgrade", "history", "waiting", "joining", "unknown-status", "unjoined", "schema", "account:synthetic", "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]) {
    const h = harness()
    if (fault === "off") { h.records.device = { ...device, syncOn: false }; h.records.sync = { ...history, status: "off" } }
    if (fault === "consent") h.records.device = { ...device, consent: null }
    if (fault === "stale-consent") h.records.device = { ...device, consent: { v: 0, at: 1 } }
    if (fault === "upgrade") h.records.device = { ...device, upgradeNote: { state: "pending", opened: false, seen: false, reopened: false,
      details: { from: "1.5.0", autoAdd: { kept: 0, dropped: 0 }, pct: { value: 0, wasUnset: true, authorised: false }, feedback: false,
        shortcut: { raw: "", key: null, playlist: false, note: "none" }, credentialsDeleted: true } } }
    if (fault === "history") delete h.records.sync
    if (["waiting", "joining"].includes(fault)) h.records.sync = { ...history, status: fault }
    if (fault === "unknown-status") h.records.sync = { ...history, status: "future-status" }
    if (fault === "unjoined") h.records.sync = { ...history, joined: null }
    if (fault === "schema") h.records.schema = 2
    if (["account:synthetic", "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].includes(fault)) h.records[fault] = null
    equal(await h.writer.receiveSyncDocument(key), unavailable("authority"), "authority gate " + fault)
    equal(h.reads, ["local"], "authority before sync " + fault)
    equal(h.sets, [], "authority no set " + fault)
  }
  for (const value of [undefined, null, NaN, {}, { v: 1, id: "h", created: undefined }, { v: 2, id: "h", created: 1 }, { v: 1, id: "other", created: 1 }, { v: 1, id: "h", created: 1, reset: true }]) {
    const h = harness(); if (value === undefined) delete h.remote["s:meta"]; else h.remote["s:meta"] = value
    equal(await h.writer.receiveSyncDocument(key), unavailable("history"), "history choice unavailable")
    equal(h.sets, [], "no history writes")
  }
  {
    const h = harness(); for (let i = Object.keys(h.remote).length; i < 481; i++) h.remote[`unknown:${i}`] = null
    const before = clone(h.remote)
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "full physical inventory permits local adoption")
    equal(h.remote, before, "all 481 physical items unchanged")
  }
  {
    const h = harness(); h.remote.invalid = undefined
    equal(await h.writer.receiveSyncDocument(key), unavailable("document"), "physical invalidity blocks")
    equal(h.sets, [], "physical invalidity no set")
  }
  for (const status of ["full", "update-needed"]) {
    const h = harness(); h.records.sync = { ...history, status }
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "steady supported history " + status)
    equal(h.records.sync, { ...expectedSet.sync, status }, "receive preserves existing status " + status)
  }
  for (const n of [2, 3]) {
    const h = harness(), get = h.io.get; let reads = 0
    const pending = { ...pendingQ, gen: "q-external", external: { keep: true } }
    h.io.get = async keys => { if (++reads === n) h.records[Q] = pending; return get(keys) }
    equal(await h.writer.receiveSyncDocument(key), adopted, "unrelated body changed during receive")
    equal(h.records[Q], pending, "latest unrelated pending body never overwritten")
    equal(h.records.sync, expectedSet.sync, "unrelated changed body remains pending")
  }
  for (const n of [2, 3, 4]) for (const field of ["device", "schema", "sync", F, S]) {
    const h = harness(), get = h.io.get; let reads = 0
    h.io.get = async keys => {
      if (++reads === n) h.records[field] = field === "schema" ? 2 : field === "device" ? { ...device, syncOn: false }
        : field === "sync" ? { ...history, extra: { changed: true } } : field === S ? { ...setup, extra: true } : { ...old, extra: true }
      return get(keys)
    }
    const result = await h.writer.receiveSyncDocument(key)
    equal(result, n < 4 ? unavailable("authority") : { kind: "unconfirmed", received, cause: { kind: field === F || field === "sync" ? "readback" : "authority" } }, "local baseline stage " + n + field)
    equal(h.sets.length, n < 4 ? 0 : 1, "local change never overwritten before commit")
    if (n === 4 && ["device", "schema"].includes(field)) equal(h.reads.filter(x => x === "sync").length, 2, "post off no sync access")
  }
  for (const n of [2, 3]) for (const field of ["id", "created", "extension", "candidate", "incomplete", "same-gen"]) {
    const h = harness(), get = h.sync.get; let reads = 0
    h.sync.get = async () => {
      if (++reads === n) {
        if (field === "id") h.remote["s:meta"] = { v: 1, id: "other", created: 1 }
        if (field === "created") h.remote["s:meta"] = { ...remote["s:meta"], created: 2 }
        if (field === "extension") h.remote["s:meta"] = { ...remote["s:meta"], extension: { keep: false } }
        if (field === "candidate") h.remote[B] = { ...incoming, gen: "f2", at: 30 }
        if (field === "incomplete") h.remote[B] = pointer
        if (field === "same-gen") h.remote[B] = { ...incoming, extra: "changed" }
      }
      return get()
    }
    equal(await h.writer.receiveSyncDocument(key), n === 2 ? unavailable(["id", "created", "extension"].includes(field) ? "history" : "document")
      : { kind: "unconfirmed", received, cause: { kind: ["id", "created", "extension"].includes(field) ? "authority" : "readback" } }, "remote observation stage " + n + field)
    equal(h.sets.length, n === 2 ? 0 : 1, "remote changes never retried")
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(), get = h.io.get, syncGet = h.sync.get, set = h.io.set, marker = Error(stage)
    let lr = 0, rr = 0
    h.io.get = async keys => { if (["L0", "L1", "L2", "L3"][lr++] === stage) throw marker; return get(keys) }
    h.sync.get = async () => { if (["R0", "R1", "R2"][rr++] === stage) throw marker; return syncGet() }
    h.io.set = async items => { if (stage === "set") throw marker; return set(items) }
    let outcome: unknown, caught: unknown
    try { outcome = await h.writer.receiveSyncDocument(key) } catch (error) { caught = error }
    if (["L0", "R0", "L1", "R1", "L2"].includes(stage)) equal(caught === marker, true, "precommit original error " + stage)
    else equal(outcome, stage === "set" ? { kind: "local-set-failed", received, error: marker } : { kind: "unconfirmed", received, cause: { kind: "read-failed", error: marker } }, "staged IO failure " + stage)
    if (outcome && typeof outcome === "object" && "error" in outcome) equal(outcome.error === marker, true, "set error identity")
    if (outcome && typeof outcome === "object" && "cause" in outcome) equal((outcome.cause as { error: unknown }).error === marker, true, "post read error identity")
    h.io.get = get; h.sync.get = syncGet; h.io.set = set
    await h.writer.startSync(); equal(h.counts().subscriptions, 0, "failure keeps stopped lifetime " + stage)
    await h.writer.receiveSyncDocument(key); await h.writer.startSync()
    equal(h.counts().subscriptions, 0, "explicit successful receive never clears stop " + stage)
    equal(h.results, [], "receive failure no automatic callback")
  }
  {
    const h = harness(), set = h.io.set, marker = Error("apply then reject")
    h.io.set = async items => { await set(items); throw marker }
    const result = await h.writer.receiveSyncDocument(key)
    equal(result.kind, "local-set-failed", "unknown set rejection effects retained")
    equal(result.kind === "local-set-failed" && result.error === marker, true, "apply then reject original identity")
    equal(h.records, { ...local, ...expectedSet }, "apply then reject no rollback")
    equal(await h.writer.receiveSyncDocument(key), { kind: "idle" }, "explicit retry observes committed raw body")
  }
  for (const only of [F, "sync"]) {
    const h = harness()
    h.io.set = async items => { h.sets.push(items); h.records[only] = items[only] }
    equal(await h.writer.receiveSyncDocument(key), { kind: "unconfirmed", received, cause: { kind: "readback" } }, "torn set unconfirmed")
    equal(h.sets.length, 1, "torn set no rollback repair")
    const next = harness(h.records)
    equal(await next.writer.receiveSyncDocument(key), only === F ? { kind: "idle" } : unavailable("pending"), "fresh torn snapshot does not invent repair")
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(), get = h.io.get, syncGet = h.sync.get, set = h.io.set
    let release!: () => void, entered = false, resolved = false, lr = 0, rr = 0
    const gate = new Promise<void>(done => { release = done })
    const hold = async () => { entered = true; await gate }
    h.io.get = async keys => { if (["L0", "L1", "L2", "L3"][lr++] === stage) await hold(); return get(keys) }
    h.sync.get = async () => { if (["R0", "R1", "R2"][rr++] === stage) await hold(); return syncGet() }
    h.io.set = async items => { if (stage === "set") await hold(); return set(items) }
    const pending = h.writer.receiveSyncDocument(key); void pending.then(() => { resolved = true })
    await settle(); equal(entered, true, "held actual IO " + stage)
    const readCount = h.reads.length
    const second = h.writer.receiveSyncDocument(key), edit = h.change("deny", true, "f0"), flush = h.writer.flushSync(), toggle = h.change("allow", true)
    await settle(); equal(h.reads.length, readCount, "receive holds owner lane " + stage)
    equal(resolved, false, "receive cannot resolve before held IO " + stage)
    release(); equal(await pending, adopted, "held receive resolves after release " + stage)
    equal(await second, { kind: "idle" }, "queued receive rereads adopted state")
    equal(await edit, { kind: "result", result: { refused: "invalid" } }, "queued stale destructive confirmation rejected")
    await flush
    equal(await toggle, { kind: "result", result: { ok: true } }, "queued nondestructive toggle accepted")
    equal(h.records.sync, expectedSet.sync, "later edit not acknowledged by receive")
    equal(h.counts().generation, 1, "toggle has own generation")
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) for (const action of ["dispose", "off"]) {
    const h = harness(), get = h.io.get, syncGet = h.sync.get, set = h.io.set
    let release!: () => void, entered = false, lr = 0, rr = 0
    const gate = new Promise<void>(done => { release = done })
    const hold = async () => { entered = true; await gate }
    h.io.get = async keys => { if (["L0", "L1", "L2", "L3"][lr++] === stage) await hold(); return get(keys) }
    h.sync.get = async () => { if (["R0", "R1", "R2"][rr++] === stage) await hold(); return syncGet() }
    h.io.set = async items => { if (stage === "set") await hold(); return set(items) }
    const pending = h.writer.receiveSyncDocument(key); await settle(); equal(entered, true, "loss held stage " + stage)
    let disposed: Promise<void> | undefined
    if (action === "dispose") disposed = h.writer.dispose()
    else { h.records.device = { ...device, syncOn: false }; h.records.sync = { ...history, status: "off" } }
    release()
    const result = await pending
    // An external local change after L3 is beyond the last local observation.
    equal(result, action === "off" && stage === "R2" ? adopted : ["set", "L3", "R2"].includes(stage)
      ? { kind: "unconfirmed", received, cause: { kind: "authority" } } : unavailable("authority"), "observed loss stage " + action + stage)
    await disposed
    if (action === "dispose") {
      let rejected = false; try { await h.writer.receiveSyncDocument(key) } catch (error) { rejected = error instanceof Error && error.message === "Writer disposed" }
      equal(rejected, true, "disposed receive convention")
    }
  }
  {
    const h = harness(); h.remote[B] = clone(old); await h.writer.startSync(); h.remote[B] = clone(incoming)
    equal(h.timers.size, 1, "positive outbound ticket exists before receive")
    const before = h.counts(), results = clone(h.results)
    const timer = [...h.timers]
    equal(await h.writer.receiveSyncDocument(key), adopted, "active owner manual receive")
    equal(h.counts(), before, "active receive leaves outbound ticket exact")
    equal([...h.timers], timer, "active receive leaves deadline exact")
    equal(h.results, results, "active receive does not emit")
    await h.writer.dispose()
  }
  return { assertions, primary: { local, remote, expectedSet, received, result: adopted } }
}

test("manual incoming receiver preserves raw whole documents and finite staged ownership", async () => {
  expect((await receiveAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(300)
})

test("saved minified receiver bytes execute in a fresh guarded realm", async () => {
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "local-filter-writer.ts")], target: "browser", format: "cjs", minify: true })
  expect(build.success).toBe(true)
  const bytes = await build.outputs[0]!.text()
  const script = `(async()=>{let reads=0;const names=["Date","performance","setTimeout","clearTimeout","setInterval","clearInterval","browser","chrome","fetch","crypto","Bun","process","localStorage","indexedDB","navigator","WebSocket"];for(const name of names)Object.defineProperty(globalThis,name,{get(){reads++;throw Error(name)}});Object.defineProperty(Math,"random",{get(){reads++;throw Error("random")}});const module={exports:{}};${bytes};const result=await (${receiveAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");if(reads)throw Error("ambient read");let controls=0;for(const name of names){try{globalThis[name]}catch{controls++}}try{Math.random}catch{controls++}return {assertions:result.assertions,reads,controls};})()`
  const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
  expect(observed.assertions).toBeGreaterThan(300)
  expect(observed.controls).toBe(17)
  expect(observed.reads).toBeGreaterThanOrEqual(17)
})

test("receiver wrong alternatives fail at their intended observable assertions", async () => {
  const path = resolve(import.meta.dir, "local-filter-writer.ts"), original = await readFile(path, "utf8")
  const cases = [
    { name: "decoded-adoption", assertion: "raw omissions labels and tuple suffixes retained", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = snapshot(JSON.parse(JSON.stringify(remote.candidate.value.document)))') },
    { name: "split-sets", assertion: "one exact two-key set", source: original.replace('await deps.local.set({ [name]: document, sync: next })', 'await deps.local.set({ [name]: document }); await deps.local.set({ sync: next })') },
    { name: "pending-Q-acknowledgement", assertion: "one exact two-key set", source: original.replace('const next = repairedHistory(latest.history, [received])', 'const next = repairedHistory(latest.history, [received]); if (next && typeof next.pushed === "object" && next.pushed) Object.assign(next.pushed, { [`doc:filter:${key.acct}:PL_Q`]: "q1" })') },
    { name: "target-pending-overwrite", assertion: "target pending remains unavailable", source: original.replace('if (!Object.hasOwn(history.pushed, name) || history.pushed[name] !== initial.stamp.gen)', 'if (false)') },
    { name: "equal-stamp-tie", assertion: "equal lower same-generation conflict", source: original.replace('incoming.at <= initial.stamp.at', 'incoming.at < initial.stamp.at') },
    { name: "stale-metadata", assertion: "remote observation stage 2created", source: original.replace('if (!sameSyncJson(metadata, preflight.metadata))', 'if (false)') },
    { name: "outside-lane", assertion: "receive holds owner lane L0", source: original.replace('return enqueue(() => receiveAttempt(key))', 'return receiveAttempt(key)') },
    { name: "unchanged-echo", assertion: "unchanged adopted filter never echoes", source: original }
  ]
  for (const fault of cases) {
    if (fault.name !== "unchanged-echo") expect(fault.source).not.toBe(original)
    const build = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true, plugins: [{ name: fault.name, setup(builder) {
      builder.onLoad({ filter: /\/local-filter-writer\.ts$/ }, () => ({ loader: "ts", contents: fault.source }))
      if (fault.name === "unchanged-echo") builder.onLoad({ filter: /\/sync-write-admission\.ts$/ }, async args => ({ loader: "ts", contents:
        (await readFile(args.path, "utf8")).replace('if (raw.gen !== state.pushed[name]) repairs.push(record)', 'if (raw.gen !== state.pushed[name]) repairs.push(record); else if (raw.gen === "f1") documents.set(name, record)') }))
    } }] })
    expect(build.success).toBe(true)
    const bytes = await build.outputs[0]!.text()
    const script = `(async()=>{const module={exports:{}};${bytes};try{await (${receiveAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");return {caught:false}}catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0]}}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs";import {runInNewContext} from "node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{}, {timeout:30000})));'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect({ name: fault.name, ...observed }).toEqual({ name: fault.name, caught: true, assertion: fault.assertion })
  }
})

async function automaticIncomingAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  let assertions = 0
  const cases: string[] = []
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) {
    assertions++
    if (stable(actual) !== stable(expected)) throw Error(label + ": " + stable(actual) + " != " + stable(expected))
  }
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const F = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", Q = "doc:filter:AAAAAAAAAAAAAAAA:PL_Q", S = "doc:setup:AAAAAAAAAAAAAAAA"
  const B = F.replace("doc:", "s:"), C = Q.replace("doc:", "s:")
  const key = { kind: "filter", acct, playlist } as const
  const local = JSON.parse('{"schema":1,"device":{"id":"device-a","consent":{"v":1,"at":1},"syncOn":true},"sync":{"joined":"h","pushed":{"doc:filter:AAAAAAAAAAAAAAAA:PL_P":"f0","doc:setup:AAAAAAAAAAAAAAAA":"s0","doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q0"},"status":"ok","editedSinceOff":false,"extra":{"keep":true}},"doc:setup:AAAAAAAAAAAAAAAA":{"v":1,"gen":"s0","at":1,"by":"device-a","data":{"autoAdd":[{"pl":"PL_P","takes":"both"},{"pl":"PL_Q","takes":"videos"}]}},"doc:filter:AAAAAAAAAAAAAAAA:PL_P":{"v":1,"gen":"f0","at":10,"by":"device-a","data":{"mode":"deny","on":true,"channels":[]},"oldOnly":"discard"},"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":{"v":1,"gen":"q1","at":15,"by":"device-a","data":{"on":true},"pending":{"keep":true}}}')
  const remote = JSON.parse('{"s:meta":{"v":1,"id":"h","created":1,"extension":{"keep":true}},"s:setup:AAAAAAAAAAAAAAAA":{"v":1,"gen":"s0","at":1,"by":"device-a","data":{"autoAdd":[{"pl":"PL_P","takes":"both"},{"pl":"PL_Q","takes":"videos"}]}},"s:filter:AAAAAAAAAAAAAAAA:PL_P":{"v":1,"gen":"f1","at":20,"by":"device-b","envelope":{"future":true},"__proto__":{"keep":true},"toJSON":"inert","data":{"mode":"allow","on":false,"channels":[["UCaaaaaaaaaaaaaaaaaaaaaa","Title",null,{"future":1}]],"future":{"keep":[null,1]}}},"s:filter:AAAAAAAAAAAAAAAA:PL_Q":{"v":1,"gen":"q0","at":5,"by":"device-a","data":{}}}')
  const f0 = local[F], f1 = remote[B], q0 = remote[C], q1 = local[Q]
  const expectedSet = { [F]: f1, sync: { ...local.sync, pushed: { ...local.sync.pushed, [F]: "f1" } } }
  const settle = async () => { for (let i = 0; i < 700; i++) await Promise.resolve() }
  function harness(records = clone(local), synced = clone(remote)) {
    let time = 0, generation = 0, wall = 0, clock = 0, serial = 0, lr = 0, rr = 0, ls = 0
    const sets: unknown[] = [], writes: unknown[] = [], invocations: number[] = [], reads: string[] = []
    const results: Parameters<Parameters<typeof create>[0]["onSyncResult"]>[0][] = []
    const listeners = new Set<() => void>(), timers = new Map<number, { due: number; run: () => void }>()
    const hooks = { local: async (_n: number) => {}, remote: async (_n: number) => {}, set: async (_n: number, _items: unknown) => {}, afterSet: async (_n: number) => {}, snapshot: (value: typeof remote) => value }
    const writer = create({ claim: { kind: "unavailable" }, local: {
      async get() { reads.push("L" + ++lr); await hooks.local(lr); return clone(records) },
      async set(items) { const n = ++ls; sets.push(clone(items)); await hooks.set(n, items); Object.assign(records, clone(items)); await hooks.afterSet(n) }
    }, sync: {
      async get() { reads.push("R" + ++rr); await hooks.remote(rr); return hooks.snapshot(clone(synced)) },
      async set(items) { invocations.push(time); writes.push(clone(items)); Object.assign(synced, clone(items)); for (const run of listeners) run() },
      subscribe(run) { listeners.add(run); return () => { listeners.delete(run) } }
    }, now: () => { wall++; return 100 + time }, generation: () => { generation++; return generation === 1 ? "f2" : "q2" },
    syncClock: { now: () => { clock++; return time }, wallNow: () => 1000000, after(ms, run) { const id = ++serial; timers.set(id, { due: time + ms, run }); return () => { timers.delete(id) } } },
    onSyncResult: result => { results.push(result) } })
    return { writer, records, synced, sets, writes, invocations, results, listeners, timers, hooks, reads,
      counts: () => ({ generation, wall, clock }), move: (at: number) => { time = at },
      event: async () => { for (const run of listeners) run(); await settle() },
      fire: async (at: number) => { time = at; for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.run() } await settle() },
      change: (mode: "deny" | "allow", on: boolean, confirm?: string) => writer.change({ kind: "ui", windowId: 1, incognito: false },
        confirm === undefined ? { acct, playlist, desired: { mode, on }, clearListedChannels: "not-confirmed" }
          : { acct, playlist, desired: { mode, on }, clearListedChannels: "confirmed", expectedGeneration: confirm }) }
  }
  const first = harness()
  equal(first.reads, [], "construction has no IO")
  await first.writer.startSync()
  equal(first.writes, [], "no sync invocation before five-second barrier")
  equal(first.sets, [expectedSet], "automatic exact raw adoption before outbound")
  equal(first.reads, ["L1", "L2", "L3", "R1", "L4", "R2", "L5", "L6", "R3", "L7", "R4", "L8", "R5", "L9", "R6"], "incoming precedes outbound observations")
  equal(first.records, { ...local, ...expectedSet }, "automatic whole replacement and independent Q acknowledgement")
  equal(first.synced, remote, "automatic receive leaves remote exact")
  equal(first.results, [{ kind: "deferred", notBefore: 5000 }], "automatic primary callback")
  equal(first.counts().generation, 0, "incoming creates no generation")
  equal(first.counts().wall, 0, "incoming creates no edit stamp")
  equal([...first.timers.values()].map(t => t.due), [5000], "incoming does not reset quiet")
  await first.fire(4999); equal(first.writes, [], "five-second pacing before invocation")
  await first.fire(5000)
  equal(first.writes, [{ [C]: q1 }], "Q-only send without F echo")
  equal(first.invocations, [5000], "actual primary invocation time")
  equal(first.records.sync.pushed, { [F]: "f1", [S]: "s0", [Q]: "q1" }, "exact Q acknowledgement after readback")
  equal(first.results[1], { kind: "pushed", sent: [{ key: { kind: "filter", acct, playlist: "PL_Q" }, name: Q, gen: "q1", document: q1 }], repaired: [] }, "ordinary pushed result names exact Q")
  equal(first.results.at(-1), { kind: "idle" }, "own-write event idle")
  await first.event(); equal(first.writes.length, 1, "repeat event no echo")
  equal(first.timers.size, 0, "terminal attempt cancels ticket")
  const fresh = harness(clone(first.records), clone(first.synced)); await fresh.writer.startSync()
  equal(fresh.results, [{ kind: "idle" }], "fresh owner final snapshot idle"); equal(fresh.writes, [], "fresh owner no echo")
  await fresh.writer.dispose(); await first.writer.dispose(); cases.push("literal-start-Q-send-own-event-fresh-owner")
  {
    const h = harness(), omitted = { ...clone(f1), data: { future: true } }
    h.synced[B] = omitted
    Object.defineProperty(h.records.sync, "__proto__", { value: { keep: true }, enumerable: true, configurable: true })
    h.records.sync.toJSON = "inert"
    const rawHistory = clone(h.records.sync)
    await h.writer.startSync()
    equal(h.records[F], omitted, "automatic raw omissions preserved")
    equal(h.sets, [{ [F]: omitted, sync: { ...rawHistory, pushed: { ...rawHistory.pushed, [F]: "f1" } } }], "automatic own special history fields retained")
    await h.writer.dispose(); cases.push("raw-omissions-special-history")
  }
  {
    const h = harness(); h.records[Q] = clone(q0); await h.writer.startSync()
    equal(h.sets, [expectedSet], "incoming-only exact adoption"); equal(h.results, [{ kind: "idle" }], "incoming-only callback is outbound idle")
    equal(h.timers.size, 0, "incoming-only no timer"); await h.writer.dispose(); cases.push("incoming-only")
  }
  {
    const h = harness(); h.synced[B] = clone(f0); await h.writer.startSync()
    const ticket = [...h.timers][0], before = h.counts()
    h.move(1000); h.synced[B] = clone(f1)
    let receiverTicket: unknown, receiverCounts: unknown
    h.hooks.set = async () => { receiverTicket = [...h.timers.values()][0]; receiverCounts = h.counts() }
    await h.event()
    equal(receiverTicket === ticket?.[1], true, "receiver retains ticket identity")
    equal(receiverCounts, { ...before, clock: before.clock + 1 }, "receiver changes no scheduling clocks")
    equal(h.records[F], f1, "actual area event adopts")
    equal([...h.timers.values()].map(t => t.due), [5000], "area event preserves original deadline")
    h.hooks.set = async () => {}; await h.fire(5000); equal(h.writes, [{ [C]: q1 }], "event sends independent Q only")
    await h.writer.dispose(); cases.push("event-ticket-identity-deadline")
  }
  {
    const h = harness(); h.synced[B] = clone(f0); await h.writer.startSync()
    let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done })
    let once = true
    h.hooks.local = async () => { if (once) { once = false; entered = true; await gate } }
    const held = h.writer.flushSync(); await settle(); equal(entered, true, "burst owns lane")
    for (const [gen, at] of [["f1", 20], ["f2", 30], ["f3", 40]] as const) { h.synced[B] = { ...clone(f1), gen, at }; void h.event() }
    release(); await held; await settle()
    equal(h.records[F], { ...f1, gen: "f3", at: 40 }, "burst reads current complete snapshot")
    equal(h.sets.length, 1, "burst never echoes intermediate F")
    await h.fire(5000); equal(h.writes, [{ [C]: q1 }], "burst one Q set"); await h.writer.dispose(); cases.push("burst-current-snapshot")
  }
  const addR = (h: ReturnType<typeof harness>) => {
    const R = "doc:filter:AAAAAAAAAAAAAAAA:PL_R"
    const r0 = { v: 1, gen: "r0", at: 10, by: "device-a", data: {} }, r1 = { v: 1, gen: "r1", at: 30, by: "device-b", data: { on: true }, extra: "R" }
    h.records[S].data.autoAdd.push({ pl: "PL_R", takes: "both" }); h.synced[S.replace("doc:", "s:")] = clone(h.records[S])
    h.records[R] = r0; h.records.sync.pushed[R] = "r0"; h.synced[R.replace("doc:", "s:")] = r1
    return { R, r0, r1 }
  }
  {
    const h = harness(), { R, r1 } = addR(h)
    const T = "doc:setup:BBBBBBBBBBBBBBBB", U = "doc:filter:BBBBBBBBBBBBBBBB:PL_U"
    const u0 = { v: 1, gen: "u0", at: 1, by: "device-a", data: {} }, u1 = { v: 1, gen: "u1", at: 50, by: "device-b", data: { on: true } }
    h.records[T] = { v: 1, gen: "t0", at: 1, by: "device-a", data: { autoAdd: [{ pl: "PL_U", takes: "videos" }] } }
    h.records[U] = u0; Object.assign(h.records.sync.pushed, { [T]: "t0", [U]: "u0" })
    h.synced[T.replace("doc:", "s:")] = clone(h.records[T]); h.synced[U.replace("doc:", "s:")] = u1
    await h.writer.startSync()
    equal(h.sets, [
      { [F]: f1, sync: { ...h.records.sync, pushed: { ...local.sync.pushed, [R]: "r0", [T]: "t0", [U]: "u0", [F]: "f1" } } },
      { [R]: r1, sync: { ...h.records.sync, pushed: { ...local.sync.pushed, [R]: "r1", [T]: "t0", [U]: "u0", [F]: "f1" } } },
      { [U]: u1, sync: h.records.sync }
    ], "serial targets retain current history across accounts")
    equal(h.records[Q], q1, "serial adoption keeps pending Q"); await h.fire(5000); equal(h.writes, [{ [C]: q1 }], "serial whole flush Q only")
    await h.writer.dispose(); cases.push("serial-F-R-second-account")
  }
  for (const fault of ["pending", "equal", "lower", "same-generation", "future", "tombstone", "null", "missing", "incomplete", "missing-setup", "unselected", "absent-local", "local-future", "local-tombstone", "local-null", "local-malformed"]) {
    const h = harness(), { R, r1 } = addR(h)
    const excluded: Record<string, unknown> = {}
    for (const pl of ["PL_A", "PL_PP", "PL_Z"]) {
      const name = `doc:filter:${acct}:${pl}`, base = name.replace("doc:", "s:")
      const old = { v: 1, gen: pl + "0", at: 10, by: "device-a", data: {} }
      h.records[S].data.autoAdd.push({ pl, takes: "both" }); h.records[name] = clone(old); h.records.sync.pushed[name] = old.gen
      h.synced[base] = { ...old, gen: pl + "1", at: 20, data: { on: true } }
      if (fault === "pending") h.records[name].gen = pl + "pending"
      if (fault === "equal") h.synced[base].at = 10
      if (fault === "lower") h.synced[base].at = 5
      if (fault === "same-generation") h.synced[base].gen = old.gen
      if (fault === "future") h.synced[base].v = 2
      if (fault === "local-future") h.records[name].v = 2
      if (fault === "local-tombstone") h.records[name] = { v: 1, gen: old.gen, at: 10, by: "device-a", deleted: true }
      if (fault === "local-null") h.records[name] = null
      if (fault === "local-malformed") h.records[name] = { v: 1, data: {} }
      if (fault === "tombstone") h.synced[base] = { v: 1, gen: pl + "1", at: 20, by: "device-b", deleted: true }
      if (fault === "null") h.synced[base] = null
      if (fault === "missing") delete h.synced[base]
      if (fault === "incomplete") h.synced[base] = { v: 1, gen: pl + "1", at: 20, by: "device-b", n: 2 }
      if (fault === "unselected") h.records[S].data.autoAdd = h.records[S].data.autoAdd.filter((x: { pl: string }) => x.pl !== pl)
      if (fault === "absent-local") { delete h.records[name]; delete h.records.sync.pushed[name] }
      if (fault === "missing-setup") {
        const other = name.replace(acct, "CCCCCCCCCCCCCCCC"); h.records[other] = h.records[name]; delete h.records[name]; delete h.records.sync.pushed[name]; h.records.sync.pushed[other] = old.gen
        h.synced[other.replace("doc:", "s:")] = h.synced[base]; delete h.synced[base]; excluded[other] = clone(h.records[other])
      } else if (Object.hasOwn(h.records, name)) excluded[name] = clone(fault === "unselected" ? h.synced[base] : h.records[name])
    }
    h.synced[S.replace("doc:", "s:")] = clone(h.records[S])
    await h.writer.startSync()
    equal(h.records[F], f1, "exclusions continue to F " + fault); equal(h.records[R], r1, "exclusions continue to R " + fault)
    for (const [name, raw] of Object.entries(excluded)) equal(h.records[name], raw, "excluded target exact " + fault + name)
    if (fault === "absent-local") equal(Object.keys(h.records).filter(n => /PL_(A|PP|Z)$/.test(n)), [], "absent local never created")
    await h.writer.dispose(); cases.push("exclusions-" + fault)
  }
  for (const fault of ["pending", "disappeared", "future", "equal-divergence"]) {
    const h = harness()
    if (fault === "disappeared") delete h.synced[C]
    if (fault === "future") h.synced[C] = { ...q0, v: 2, gen: "protected" }
    if (fault === "equal-divergence") {
      const V = "doc:filter:AAAAAAAAAAAAAAAA:PL_V", v0 = { v: 1, gen: "v0", at: 10, by: "device-a", data: {} }
      h.records[V] = v0; h.records.sync.pushed[V] = "v0"; h.records[S].data.autoAdd.push({ pl: "PL_V", takes: "both" })
      h.synced[S.replace("doc:", "s:")] = clone(h.records[S]); h.synced[V.replace("doc:", "s:")] = { ...v0, gen: "v1", data: { on: true } }
    }
    await h.writer.startSync(); equal(h.records[F], f1, "independent F adoption " + fault)
    await h.fire(5000)
    equal(h.writes, fault === "pending" || fault === "disappeared" ? [{ [C]: q1 }] : [], "whole planner independent Q outcome " + fault)
    if (fault === "equal-divergence") { equal(h.results.at(-1), { kind: "unavailable" }, "global conflict no partial send"); equal(h.timers.size, 0, "global unavailable cancels ticket") }
    if (fault === "future") equal(h.records.sync.pushed[Q], "q0", "protected Q not acknowledged")
    await h.writer.dispose(); cases.push("independent-Q-" + fault)
  }
  const chunk0 = '{"v":1,"gen":"f1","at":20,"by":"device-b","data":'
  const chunk1 = '{"mode":"allow","on":false,"channels":[]},"chunkExtra":true}'
  for (const incomplete of [false, true]) {
    const h = harness(); h.synced[B] = { v: 1, gen: "f1", at: 20, by: "device-b", n: 2 }
    h.synced[B + "@f1.0"] = chunk0; if (!incomplete) h.synced[B + "@f1.1"] = chunk1
    h.synced[B + "@old.0"] = "retained"; h.synced.unknown = { keep: true }; const before = clone(h.synced)
    await h.writer.startSync(); equal(h.records[F], incomplete ? f0 : JSON.parse(chunk0 + chunk1), "complete chunk assembly " + incomplete)
    equal(h.synced, before, "chunks and unknown occupancy retained")
    equal(h.timers.size, incomplete ? 0 : 1, "incomplete assembly never retries on timer")
    if (incomplete) { h.synced[B + "@f1.1"] = chunk1; await h.event(); equal(h.records[F], JSON.parse(chunk0 + chunk1), "independent chunk arrival adopts") }
    await h.writer.dispose(); cases.push("chunks-" + incomplete)
  }
  for (const fault of ["opaque-pushed", "full", "orphan", "malformed"]) {
    const h = harness()
    if (fault === "opaque-pushed") h.records.sync.pushed.opaque = "opaque-generation"
    if (fault === "full") h.synced.occupancy = "x".repeat(99000)
    if (fault === "orphan") h.synced["s:filter:BBBBBBBBBBBBBBBB:PL_orphan@x.0"] = "unknown"
    if (fault === "malformed") h.hooks.snapshot = value => ({ ...value, bad: undefined })
    if (fault !== "malformed") {
      await h.writer.startSync(); equal(h.records[F], f1, "occupancy does not own adoption " + fault)
      if (fault === "opaque-pushed") equal(h.records.sync.pushed.opaque, "opaque-generation", "opaque pushed retained")
      if (fault === "full") equal(h.results.at(-1), { kind: "blocked" }, "full occupancy permits adoption but blocks outbound")
      equal(Object.hasOwn(h.records, "doc:filter:BBBBBBBBBBBBBBBB:PL_orphan"), false, "remote-only address never enumerates")
    }
    if (fault === "malformed") {
      await h.writer.startSync(); equal(h.records[F], f0, "malformed physical JSON remains unavailable")
      equal(h.results.at(-1), { kind: "unavailable" }, "malformed physical diagnostic"); equal(h.sets, [], "malformed physical no adoption")
    }
    await h.writer.dispose(); cases.push("raw-" + fault)
  }
  {
    const h = harness(), added = addR(h)
    delete h.records[added.R]; delete h.records.sync.pushed[added.R]
    h.hooks.remote = async n => { if (n === 1) h.records[added.R] = clone(added.r0) }
    await h.writer.startSync()
    equal(h.records[added.R], added.r0, "enumeration never rescans addresses during awaits")
    equal(h.sets.length, 1, "each captured address receives once")
    equal(h.results.at(-1), { kind: "unavailable" }, "new divergent address remains in complete outbound plan")
    h.records.sync.pushed[added.R] = "r0"
    await h.event(); equal(h.records[added.R], added.r1, "new address waits for independent event")
    await h.writer.dispose(); cases.push("finite-enumeration")
  }
  for (const field of ["device", "history", "setup", "target"]) for (const n of [4, 5, 6]) {
    const h = harness()
    h.hooks.local = async count => { if (count === n) {
      if (field === "device") h.records.device.extra = "changed"
      if (field === "history") h.records.sync.extra = { changed: true }
      if (field === "setup") h.records[S].extra = "changed"
      if (field === "target") h.records[F].extra = "changed"
    } }
    await h.writer.startSync()
    equal(h.results.at(-1), { kind: "unavailable" }, "local boundary diagnostic " + field + n)
    equal(h.sets.length, n === 6 ? 1 : 0, "local boundary commit stage " + field + n)
    equal(h.writes, [], "local stale no outbound " + field + n)
    if (n === 6) equal(h.listeners.size, 0, "uncertain local readback stops lifetime")
    await h.writer.dispose(); cases.push("local-mutation-" + field + n)
  }
  for (const field of ["id", "created", "additive", "generation", "body", "chunks"]) for (const n of [1, 2, 3]) {
    const h = harness()
    h.hooks.remote = async count => { if (count === n) {
      if (field === "id") h.synced["s:meta"].id = "other"
      if (field === "created") h.synced["s:meta"].created = 2
      if (field === "additive") h.synced["s:meta"].extra = true
      if (field === "generation") h.synced[B].gen = "fChanged"
      if (field === "body") h.synced[B].data.future = "changed"
      if (field === "chunks") h.synced[B] = { v: 1, gen: "f1", at: 20, by: "device-b", n: 2 }
    } }
    await h.writer.startSync()
    equal(h.sets.length, n === 3 || n === 1 && !["id", "chunks"].includes(field) ? 1 : 0, "remote mutation commit boundary " + field + n)
    if (n === 3) { equal(h.listeners.size, 0, "remote readback uncertainty stops"); equal(h.results.at(-1), { kind: "unavailable" }, "remote readback diagnostic") }
    if (n > 1 || field === "id" || field === "chunks") equal(h.writes, [], "stale remote never partially sends")
    await h.writer.dispose(); cases.push("remote-mutation-" + field + n)
  }
  {
    const h = harness(), { R, r0 } = addR(h)
    h.hooks.local = async n => { if (n === 9) h.records[R].extra = "changed" }
    await h.writer.startSync(); equal(h.records[F], f1, "prior F stays committed when R stale")
    equal(h.records[R], { ...r0, extra: "changed" }, "later stale R never rolled back")
    equal(h.sets.length, 1, "no all-pass rollback or retry"); await h.writer.dispose(); cases.push("later-target-stale")
  }
  for (const action of ["off", "dispose"]) {
    const h = harness(); let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done })
    h.hooks.local = async n => { if (n === 1) { entered = true; await gate } }
    const start = h.writer.startSync(); await settle(); equal(entered, true, "startup authority await entered")
    let disposed: Promise<void> | undefined
    if (action === "dispose") disposed = h.writer.dispose()
    else { h.records.device.syncOn = false; h.records.sync.status = "off" }
    release(); await start; await disposed
    equal(h.listeners.size, 0, "startup await loss before subscription " + action)
    equal(h.reads.filter(x => x.startsWith("R")), [], "startup await loss zero sync access " + action)
    await h.writer.dispose(); cases.push("startup-held-" + action)
  }
  for (const fault of ["authority", "history"]) {
    const h = harness(); addR(h)
    if (fault === "authority") h.hooks.local = async n => { if (n === 4) h.records.device.extra = "changed" }
    else h.hooks.remote = async n => { if (n === 2) h.synced["s:meta"].created = 2 }
    await h.writer.startSync()
    equal(h.sets, [], "common loss aborts entire pass " + fault)
    equal(h.reads.filter(x => x.startsWith("R")), fault === "authority" ? ["R1"] : ["R1", "R2"], "common loss begins no later target or outbound " + fault)
    equal(h.reads.filter(x => x.startsWith("L")).length, fault === "authority" ? 5 : 4, "common loss bounded local observation " + fault)
    equal(h.listeners.size, 1, "deterministic unavailable does not stop lifetime " + fault)
    await h.writer.dispose(); cases.push("common-abort-" + fault)
  }
  const boundaries = ["enumeration", "L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]
  for (const stage of boundaries) {
    const h = harness(); h.synced[B] = clone(f0); await h.writer.startSync(); h.synced[B] = clone(f1)
    const staleTimer = [...h.timers.values()][0]!
    let entered = false, release!: () => void, lr = 0, rr = 0
    const gate = new Promise<void>(done => { release = done })
    const hold = async () => { entered = true; await gate }
    h.hooks.local = async () => { if (["enumeration", "L0", "L1", "L2", "L3"][lr++] === stage) await hold() }
    h.hooks.remote = async () => { if (["R0", "R1", "R2"][rr++] === stage) await hold() }
    h.hooks.set = async () => { if (stage === "set") await hold() }
    void h.event(); await settle(); equal(entered, true, "automatic held boundary entered " + stage)
    const before = clone(h.reads)
    const destructive = h.change("deny", true, "f0"), manual = h.writer.receiveSyncDocument(key), flush = h.writer.flushSync(), start = h.writer.startSync()
    const edit = h.change("allow", true)
    const qAddress = JSON.parse('{"acct":"AAAAAAAAAAAAAAAA","playlist":"PL_Q"}')
    const editQ = h.writer.change({ kind: "ui", windowId: 1, incognito: false }, { ...qAddress, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" })
    void h.event(); h.move(5000); staleTimer.run()
    await settle(); equal(h.reads, before, "automatic held lane excludes all queued IO " + stage)
    release(); await destructive; await manual; await flush; await start; await edit; await editQ; await settle()
    equal(await destructive, { kind: "result", result: { refused: "invalid" } }, "stale f0 confirmation after f1 " + stage)
    equal(h.records[F].gen, "f2", "queued edit gets own generation " + stage)
    equal(h.records.sync.pushed[F], "f1", "receive never acknowledges queued f2 " + stage)
    equal(h.writes, [{ [C]: q1 }], "held Q captures exact body " + stage)
    equal(h.records.sync.pushed[Q], "q1", "held Q exact readback acknowledgement " + stage)
    equal(h.records[Q].gen, "q2", "queued Q edit remains unacknowledged " + stage)
    await h.writer.dispose(); cases.push("held-" + stage)
  }
  for (const stage of boundaries) for (const action of ["off", "dispose"]) {
    const h = harness(); let entered = false, release!: () => void
    const gate = new Promise<void>(done => { release = done })
    const hold = async () => { entered = true; await gate }
    h.hooks.local = async n => { if ({ enumeration: 2, L0: 3, L1: 4, L2: 5, L3: 6 }[stage] === n) await hold() }
    h.hooks.remote = async n => { if ({ R0: 1, R1: 2, R2: 3 }[stage] === n) await hold() }
    h.hooks.set = async () => { if (stage === "set") await hold() }
    const start = h.writer.startSync(); await settle(); equal(entered, true, "lifetime held boundary entered " + action + stage)
    let disposed: Promise<void> | undefined, drained = false
    if (action === "dispose") {
      disposed = h.writer.dispose(); void disposed.then(() => { drained = true })
      await settle(); equal(drained, false, "dispose waits for held incoming IO " + stage)
    }
    else { h.records.device.syncOn = false; h.records.sync.status = "off" }
    const remoteReads = h.reads.filter(x => x.startsWith("R")).length
    release(); await start; await disposed
    if (action === "dispose") equal(drained, true, "dispose drains accepted incoming IO " + stage)
    equal(h.writes, [], "lifetime loss prevents outbound " + action + stage)
    equal(h.listeners.size, 0, "lifetime loss removes listener " + action + stage)
    equal(h.timers.size, 0, "lifetime loss cancels ticket " + action + stage)
    equal(h.reads.filter(x => x.startsWith("R")).length, remoteReads, "no new sync access after observed loss " + action + stage)
    if (action === "off" && stage === "R2") equal(h.records[F], f1, "last R2 retains finite foreign-writer limit")
    if (action === "dispose") { let rejected = false; try { await h.writer.startSync() } catch { rejected = true }; equal(rejected, true, "disposed rejects new public work") }
    await h.writer.dispose(); cases.push("lifetime-" + action + stage)
  }
  for (const stage of ["enumeration", "L0", "R0", "L1", "R1", "L2", "set-before", "set-after", "L3", "R2", "torn", "contradict"]) {
    const h = harness(); h.synced[B] = clone(f0); await h.writer.startSync(); h.synced[B] = clone(f1)
    const { R, r0 } = addR(h), failureHistory = clone(h.records.sync)
    const stale = [...h.timers.values()][0]!, marker = Error("sentinel-" + stage)
    let lr = 0, rr = 0
    h.hooks.local = async () => { if (["enumeration", "L0", "L1", "L2", "L3"][lr++] === stage) throw marker }
    h.hooks.remote = async () => { if (["R0", "R1", "R2"][rr++] === stage) throw marker }
    h.hooks.set = async () => { if (stage === "set-before") throw marker }
    h.hooks.afterSet = async () => { if (stage === "set-after") throw marker; if (stage === "torn") h.records.sync = clone(failureHistory); if (stage === "contradict") h.records[F] = clone(f0) }
    await h.event()
    const result = h.results.at(-1)
    equal(result?.kind, ["torn", "contradict"].includes(stage) ? "unavailable" : "rejected", "automatic failure diagnostic " + stage)
    if (result?.kind === "rejected") equal(result.error === marker, true, "automatic retains original Error " + stage)
    equal(h.listeners.size, 0, "opaque failure stops listener " + stage); equal(h.timers.size, 0, "opaque failure cancels ticket " + stage)
    equal(h.writes, [], "failure stops before outbound " + stage)
    equal(h.records[R], r0, "failure skips remaining supported target " + stage)
    h.hooks.local = async () => {}; h.hooks.remote = async () => {}; h.hooks.set = async () => {}; h.hooks.afterSet = async () => {}
    await h.writer.receiveSyncDocument(key)
    await h.writer.receiveSyncDocument({ kind: "filter", ...JSON.parse('{"acct":"AAAAAAAAAAAAAAAA","playlist":"PL_R"}') })
    const before = h.reads.length, resultCount = h.results.length
    await h.writer.startSync(); await h.event(); stale.run(); await settle()
    equal(h.reads.length, before, "successful manual retry never restarts stopped lifetime " + stage)
    equal(h.results.length, resultCount, "stopped lifetime emits no new automatic result " + stage)
    equal(await h.writer.flushSync(), { kind: "deferred", notBefore: 5000 }, "stopped manual flush remains paced " + stage)
    await h.change("allow", true); await h.event(); stale.run(); await settle()
    equal(h.timers.size, 0, "later edit cannot restart automatic work " + stage)
    equal(h.results.length, resultCount, "later edit emits no automatic callback " + stage)
    await h.writer.dispose(); cases.push("failure-" + stage)
  }
  for (const guard of ["off", "consent", "upgrade", "schema", "history", "account:synthetic", "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]) {
    const h = harness()
    if (guard === "off") { h.records.device.syncOn = false; h.records.sync.status = "off" }
    else if (guard === "consent") h.records.device.consent = null
    else if (guard === "upgrade") h.records.device.upgradeNote = { state: "pending", from: "1.4.5" }
    else if (guard === "schema") h.records.schema = 2
    else if (guard === "history") h.records.sync.joined = null
    else h.records[guard] = null
    await h.writer.startSync(); equal(h.listeners.size, 0, "startup guard precedes subscription " + guard)
    equal(h.reads.filter(n => n.startsWith("R")), [], "startup guard zero sync reads " + guard)
    equal(h.sets, [], "startup guard zero writes " + guard); await h.writer.dispose(); cases.push("guard-" + guard)
  }
  {
    const h = harness(); h.synced[B] = clone(f0); await h.writer.startSync(); h.synced[B] = clone(f1)
    await h.fire(5000); equal(h.records[F], f0, "timer remains outbound-only")
    equal(h.writes, [], "timer cannot bypass incoming conflict"); equal(h.timers.size, 0, "timer never rearms")
    await h.writer.dispose(); cases.push("timer-outbound-only")
  }
  return { assertions, cases, primary: { local, remote, expectedSet, key, f1, q1 }, observed: { sets: first.sets, writes: first.writes, results: first.results, invocations: first.invocations } }
}

test("automatic incoming composition literal event lifetime and held IO matrix", async () => {
  const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_P"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid fixture")
  expect((await automaticIncomingAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(400)
})

test("saved browser composition executes in two fresh guarded realms", async () => {
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "local-filter-writer.ts")], target: "browser", format: "cjs", minify: true })
  expect(built.success).toBe(true)
  const bytes = await built.outputs[0]!.text()
  for (let realm = 0; realm < 2; realm++) {
    const script = `(async()=>{let accesses=0;const names=["Date","performance","setTimeout","clearTimeout","setInterval","clearInterval","browser","chrome","fetch","crypto","Bun","process","localStorage","indexedDB","navigator","WebSocket"];for(const name of names)Object.defineProperty(globalThis,name,{get(){accesses++;throw Error("guard "+name)}});Object.defineProperty(Math,"random",{get(){accesses++;throw Error("guard random")}});const module={exports:{}};${bytes};const result=await (${automaticIncomingAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");if(accesses)throw Error("ambient access");let controls=0;for(const name of [...names,"random"]){let caught;try{name==="random"?Math.random:globalThis[name]}catch(error){caught=error.message}if(caught!=="guard "+name)throw Error("inactive guard "+name);controls++}return {assertions:result.assertions,controls}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect(observed.assertions).toBeGreaterThan(400); expect(observed.controls).toBe(17)
  }
})

test("automatic composition wrong alternatives fail at intended observations", async () => {
  const path = resolve(import.meta.dir, "local-filter-writer.ts"), original = await readFile(path, "utf8")
  const cases = [
    { name: "flush-before-receive", assertion: "incoming precedes outbound observations", source: original.replace('followup && (event?.kind === "start" || event?.kind === "sync") ? await receiveIncomingDocuments() : undefined', 'followup && (event?.kind === "start" || event?.kind === "sync") ? (await attempt(event), await receiveIncomingDocuments()) : undefined') },
    { name: "decoded-adoption", assertion: "automatic raw omissions preserved", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = snapshot(JSON.parse(JSON.stringify(remote.candidate.value.document)))') },
    { name: "stale-history", assertion: "serial targets retain current history across accounts", source: original.replace('let lane: Promise<void>', 'let incomingHistory: JsonObject; let lane: Promise<void>').replace('const targets: SyncReceiveKey[] = []', 'incomingHistory = records.sync as JsonObject; const targets: SyncReceiveKey[] = []').replace('repairedHistory(latest.history, [received])', 'repairedHistory(incomingHistory, [received])') },
    { name: "pending-overwrite", assertion: "excluded target exact pendingdoc:filter:AAAAAAAAAAAAAAAA:PL_A", source: original.replace('if (!Object.hasOwn(history.pushed, name) || history.pushed[name] !== initial.stamp.gen)', 'if (false)') },
    { name: "premature-Q-ack", assertion: "automatic exact raw adoption before outbound", source: original.replace('const next = repairedHistory(latest.history, [received])', 'const next = repairedHistory(latest.history, [received]); if(next && typeof next.pushed === "object" && next.pushed) Object.assign(next.pushed, {"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q1"})') },
    { name: "incoming-quiet", assertion: "receiver changes no scheduling clocks", source: original.replace('const next = repairedHistory(latest.history, [received])', 'quietUntil = deps.syncClock.now() + 2000; const next = repairedHistory(latest.history, [received])') },
    { name: "bypassed-pacing", assertion: "no sync invocation before five-second barrier", source: original.replace('let nextInvocation = (startup ? 0 : deps.syncClock.now()) + 5000', 'let nextInvocation = (startup ? 0 : deps.syncClock.now())').replace('let lastMonotonic = nextInvocation - 5000', 'let lastMonotonic = nextInvocation') },
    { name: "timer-receives", assertion: "timer remains outbound-only", source: original.replace('await automatic(current.event, false)', 'await automatic(current.event, true)') },
    { name: "stopped-restart", assertion: "successful manual retry never restarts stopped lifetime enumeration", source: original.replace('if (claimConfirmation === "unconfirmed" || lifetime.kind === "stopped" || lifetime.kind === "disposed") return', 'if (claimConfirmation === "unconfirmed" || lifetime.kind === "disposed") return; if (lifetime.kind === "stopped") lifetime = {kind:"inactive"}') },
    { name: "second-owner", assertion: "receiver changes no scheduling clocks", source: original.replace('const result = await receiveAttempt(key)', 'const result = await createLocalFilterWriter(deps).receiveSyncDocument(key)') },
    { name: "F-echo", assertion: "Q-only send without F echo", source: original.replace('    let plan = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "flush" } })', '    const echo = await deps.sync.get(); let plan = planSyncWrite({ local: records, sync: Object.fromEntries(Object.entries(echo).filter(([name]) => name !== "s:filter:AAAAAAAAAAAAAAAA:PL_P")), intent: { kind: "flush" } })').replace('sync: remote, intent: { kind: "flush" }', 'sync: Object.fromEntries(Object.entries(remote).filter(([name]) => name !== "s:filter:AAAAAAAAAAAAAAAA:PL_P")), intent: { kind: "flush" }').replace('const replanned = planSyncWrite({ local: latest, sync: remote, intent: { kind: "flush" } })', 'const replanned = plan') },
    { name: "outside-lane", assertion: "automatic held lane excludes all queued IO enumeration", source: original.replace('return enqueue(() => receiveAttempt(key))', 'return receiveAttempt(key)') }
  ]
  for (const fault of cases) {
    expect(fault.source).not.toBe(original)
    const built = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true, plugins: [{ name: fault.name, setup(builder) {
      builder.onLoad({ filter: /\/local-filter-writer\.ts$/ }, () => ({ loader: "ts", contents: fault.source }))
    } }] })
    expect(built.success).toBe(true)
    const bytes = await built.outputs[0]!.text()
    const script = `(async()=>{const module={exports:{}};${bytes};try{await (${automaticIncomingAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");return {caught:false}}catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0]}}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect({ name: fault.name, ...observed }).toEqual({ name: fault.name, caught: true, assertion: fault.assertion })
  }
})


test("public re-enqueue deadlock is detected by an entered-lane external watchdog", async () => {
  const path = resolve(import.meta.dir, "local-filter-writer.ts"), original = await readFile(path, "utf8")
  for (const deadlock of [false, true]) {
    const source = deadlock ? original.replace("const result = await receiveAttempt(key)", "const result = await enqueue(() => receiveAttempt(key))") : original
    if (deadlock) expect(source).not.toBe(original)
    const built = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true, plugins: [{ name: "re-enqueue", setup(builder) {
      builder.onLoad({ filter: /\/local-filter-writer\.ts$/ }, () => ({ loader: "ts", contents: source }))
    } }] })
    expect(built.success).toBe(true)
    const bytes = await built.outputs[0]!.text()
    const script = `(async()=>{const module={exports:{}};${bytes};let signalled=false;const create=deps=>{let reads=0;const get=deps.local.get;deps.local.get=async keys=>{const result=await get(keys);if(++reads===2&&!signalled){signalled=true;entered()}return result};return module.exports.createLocalFilterWriter(deps)};return (${automaticIncomingAcceptance.toString()})(create,"AAAAAAAAAAAAAAAA","PL_P")})()`
    const runner = 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";const watchdog=setTimeout(()=>{console.error("entered-lane-watchdog");process.exit(124)},2000);try{await runInNewContext(readFileSync(0,"utf8"),{entered(){console.log("entered-lane")}},{timeout:30000});clearTimeout(watchdog);console.log("completed")}catch(error){clearTimeout(watchdog);console.error(error);process.exit(1)}'
    const observed = spawnSync("node", ["--input-type=module", "-e", runner], { input: script, encoding: "utf8", timeout: 5000 })
    expect(observed.error).toBeUndefined()
    expect(observed.status).toBe(deadlock ? 124 : 0)
    expect(observed.stdout).toBe(deadlock ? "entered-lane\n" : "entered-lane\ncompleted\n")
    expect(observed.stderr).toBe(deadlock ? "entered-lane-watchdog\n" : "")
  }
})

async function settingsIncomingAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  let assertions = 0
  const cases: string[] = []
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) {
    assertions++
    if (stable(actual) !== stable(expected)) throw Error(label + ": " + stable(actual) + " != " + stable(expected))
  }
  const literal = JSON.parse('{"local":{"schema":1,"device":{"id":"device-a","consent":{"v":1,"at":1},"syncOn":true,"pickerSortAZ":true,"detailedLog":false,"recentAdds":false,"newPlaylistVisibility":"PRIVATE"},"sync":{"joined":"h","pushed":{"doc:settings":"s0","doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q0","doc:setup:AAAAAAAAAAAAAAAA":"a0"},"status":"ok","editedSinceOff":false,"extra":{"keep":true}},"doc:settings":{"v":1,"gen":"s0","at":10,"by":"device-a","data":{"theme":"light"},"oldOnly":"discard"},"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":{"v":1,"gen":"q1","at":15,"by":"device-a","data":{"on":true},"pending":{"keep":true}},"doc:setup:AAAAAAAAAAAAAAAA":{"v":1,"gen":"a0","at":1,"by":"device-a","data":{"autoAdd":[{"pl":"PL_Q","takes":"videos"}]}}},"remote":{"s:meta":{"v":1,"id":"h","created":1,"extra":{"keep":true}},"s:settings":{"v":1,"gen":"s1","at":20,"by":"device-b","data":{"theme":"dark","undoKey":null,"autoAdd":{"on":true,"feedback":false,"pct":65,"toolbarTick":false,"toolbarPaused":true},"shortcuts":{"on":true,"feedback":true,"music":true,"preset":true,"picker":null,"list":[{"id":"ABCDEF","key":{"code":"KeyW","ctrl":false,"alt":true,"shift":false,"meta":false},"label":"  Keep label  ","watchLaterOnEveryAccount":true,"extra":{"keep":true}}]},"quickSave":{"on":true,"feedback":true,"shortsShelves":false},"queueButton":{"on":true,"feedback":false},"watchButton":{"on":false,"feedback":true,"shorts":true},"cardMenu":{"on":true,"keepLinkMenu":true},"browserMenu":{"on":true,"feedback":true},"musicSection":false,"musicActions":{"on":true,"feedback":true,"preset":true,"buttons":{"next":true,"queue":false,"save":true,"like":false,"remove":true,"bar":false,"library":true,"mix":false,"album":true,"artist":false}},"musicKeys":{"on":true,"feedback":false,"preset":true,"keys":{"next":null,"queue":null,"save":null,"picker":null,"like":null,"remove":null,"library":null,"mix":null,"album":null,"artist":null}},"anyTabKeys":{"on":true,"feedback":true},"gather":{"on":true,"feedback":true,"to":"playlist","order":"left-to-right","close":true,"auto":{"unvisited":true,"after":"1w","background":true,"count":true,"n":20}},"future":{"keep":[null,1]},"syncOn":false,"consent":{"v":999}},"envelope":{"keep":true},"__proto__":{"keep":true},"toJSON":"inert"},"s:filter:AAAAAAAAAAAAAAAA:PL_Q":{"v":1,"gen":"q0","at":5,"by":"device-a","data":{}},"s:setup:AAAAAAAAAAAAAAAA":{"v":1,"gen":"a0","at":1,"by":"device-a","data":{"autoAdd":[{"pl":"PL_Q","takes":"videos"}]}}},"incoming":{"v":1,"gen":"s1","at":20,"by":"device-b","data":{"theme":"dark","undoKey":null,"autoAdd":{"on":true,"feedback":false,"pct":65,"toolbarTick":false,"toolbarPaused":true},"shortcuts":{"on":true,"feedback":true,"music":true,"preset":true,"picker":null,"list":[{"id":"ABCDEF","key":{"code":"KeyW","ctrl":false,"alt":true,"shift":false,"meta":false},"label":"  Keep label  ","watchLaterOnEveryAccount":true,"extra":{"keep":true}}]},"quickSave":{"on":true,"feedback":true,"shortsShelves":false},"queueButton":{"on":true,"feedback":false},"watchButton":{"on":false,"feedback":true,"shorts":true},"cardMenu":{"on":true,"keepLinkMenu":true},"browserMenu":{"on":true,"feedback":true},"musicSection":false,"musicActions":{"on":true,"feedback":true,"preset":true,"buttons":{"next":true,"queue":false,"save":true,"like":false,"remove":true,"bar":false,"library":true,"mix":false,"album":true,"artist":false}},"musicKeys":{"on":true,"feedback":false,"preset":true,"keys":{"next":null,"queue":null,"save":null,"picker":null,"like":null,"remove":null,"library":null,"mix":null,"album":null,"artist":null}},"anyTabKeys":{"on":true,"feedback":true},"gather":{"on":true,"feedback":true,"to":"playlist","order":"left-to-right","close":true,"auto":{"unvisited":true,"after":"1w","background":true,"count":true,"n":20}},"future":{"keep":[null,1]},"syncOn":false,"consent":{"v":999}},"envelope":{"keep":true},"__proto__":{"keep":true},"toJSON":"inert"},"expectedSet":{"doc:settings":{"v":1,"gen":"s1","at":20,"by":"device-b","data":{"theme":"dark","undoKey":null,"autoAdd":{"on":true,"feedback":false,"pct":65,"toolbarTick":false,"toolbarPaused":true},"shortcuts":{"on":true,"feedback":true,"music":true,"preset":true,"picker":null,"list":[{"id":"ABCDEF","key":{"code":"KeyW","ctrl":false,"alt":true,"shift":false,"meta":false},"label":"  Keep label  ","watchLaterOnEveryAccount":true,"extra":{"keep":true}}]},"quickSave":{"on":true,"feedback":true,"shortsShelves":false},"queueButton":{"on":true,"feedback":false},"watchButton":{"on":false,"feedback":true,"shorts":true},"cardMenu":{"on":true,"keepLinkMenu":true},"browserMenu":{"on":true,"feedback":true},"musicSection":false,"musicActions":{"on":true,"feedback":true,"preset":true,"buttons":{"next":true,"queue":false,"save":true,"like":false,"remove":true,"bar":false,"library":true,"mix":false,"album":true,"artist":false}},"musicKeys":{"on":true,"feedback":false,"preset":true,"keys":{"next":null,"queue":null,"save":null,"picker":null,"like":null,"remove":null,"library":null,"mix":null,"album":null,"artist":null}},"anyTabKeys":{"on":true,"feedback":true},"gather":{"on":true,"feedback":true,"to":"playlist","order":"left-to-right","close":true,"auto":{"unvisited":true,"after":"1w","background":true,"count":true,"n":20}},"future":{"keep":[null,1]},"syncOn":false,"consent":{"v":999}},"envelope":{"keep":true},"__proto__":{"keep":true},"toJSON":"inert"},"sync":{"joined":"h","pushed":{"doc:settings":"s1","doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q0","doc:setup:AAAAAAAAAAAAAAAA":"a0"},"status":"ok","editedSinceOff":false,"extra":{"keep":true}}}}')
  const D = "doc:settings", Q = `doc:filter:${acct}:PL_Q`, S = `doc:setup:${acct}`, F = `doc:filter:${acct}:${playlist}`
  const key = { kind: "settings" } as const, filterKey = { kind: "filter", acct, playlist } as const
  const received = { key, name: D, gen: "s1", document: literal.incoming }
  const adopted = { kind: "adopted", received }, unavailable = (reason: string) => ({ kind: "unavailable", reason })
  const settle = async () => { for (let i = 0; i < 800; i++) await Promise.resolve() }
  function harness(records = clone(literal.local), remote = clone(literal.remote)) {
    let time = 0, serial = 0, lr = 0, rr = 0, generation = 0, wall = 0, clock = 0
    const reads: string[] = [], sets: unknown[] = [], writes: unknown[] = [], results: Parameters<Parameters<typeof create>[0]["onSyncResult"]>[0][] = []
    const timers = new Map<number, { at: number; run: () => void }>(), listeners = new Set<() => void>()
    const hooks = { local: async (_n: number) => {}, remote: async (_n: number) => {}, set: async (_items: unknown) => {}, afterSet: async () => {} }
    const writer = create({ claim: { kind: "unavailable" }, local: {
      async get() { reads.push("L" + lr); await hooks.local(lr++); return { ...records } },
      async set(items) { reads.push("set"); sets.push(clone(items)); await hooks.set(items); Object.assign(records, clone(items)); await hooks.afterSet() }
    }, sync: {
      async get() { reads.push("R" + rr); await hooks.remote(rr++); return { ...remote } },
      async set(items) { writes.push(clone(items)); Object.assign(remote, clone(items)); for (const f of listeners) f() },
      subscribe(f) { listeners.add(f); return () => { listeners.delete(f) } }
    }, now: () => { wall++; return 100 + time }, generation: () => { generation++; return "edited-filter" },
    syncClock: { now: () => { clock++; return time }, wallNow: () => 1000000, after(ms, run) { const id = ++serial; timers.set(id, { at: time + ms, run }); return () => { timers.delete(id) } } },
    onSyncResult: r => { results.push(r) } })
    return { writer, records, remote, reads, sets, writes, results, timers, listeners, hooks,
      counts: () => ({ generation, wall, clock }), resetReads() { lr = rr = 0; reads.length = 0 },
      async event() { for (const f of listeners) f(); await settle() },
      async fire(at: number) { time = at; for (const [id, t] of [...timers]) if (t.at <= at) { timers.delete(id); t.run() } await settle() },
      change: () => writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }) }
  }
  const first = harness()
  equal(await first.writer.receiveSyncDocument(key), adopted, "Settings raw adoption result")
  equal(first.sets, [literal.expectedSet], "Settings one exact local document-history batch")
  equal(first.reads, ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"], "Settings finite staged IO")
  equal(first.records, { ...literal.local, ...literal.expectedSet }, "Settings whole replacement and Device privacy exact")
  equal(first.remote, literal.remote, "Settings remote unchanged")
  equal(await first.writer.receiveSyncDocument(key), { kind: "idle" }, "Settings manual repeat idle")
  equal(first.writes, [], "Settings manual never writes sync")
  equal(first.counts().generation, 0, "Settings never allocates generation")
  equal(first.counts().wall, 0, "Settings never allocates stamp")
  await first.writer.dispose(); cases.push("full-literal-manual")
  for (const data of [{}, { shortcuts: { list: [{ id: "ABCDEF", key: null, watchLaterOnEveryAccount: false, label: "  " + "x".repeat(120) + "  " }] }, undoKey: null },
    { theme: "dark", shortcuts: { on: true, list: [{ id: "ABCDEF", key: { code: "KeyW", ctrl: false, alt: true, shift: false, meta: false }, watchLaterOnEveryAccount: true, label: "  Label  " }] } }]) {
    const h = harness(), incoming = { v: 1, gen: "s1", at: 20, by: "device-b", data, ...JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}') }
    h.remote["s:settings"] = incoming
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "sparse Settings accepted")
    equal(h.records[D], incoming, "sparse Settings omissions and labels exact")
    equal(Object.hasOwn(h.records[D].data, "autoAdd"), false, "sparse Settings no inserted defaults")
    equal(Object.hasOwn(h.records[D], "__proto__"), true, "sparse own special key retained")
    await h.writer.dispose()
  }
  for (const setup of [undefined, null, { malformed: true }, { v: 2, gen: "foreign", at: 1, by: "b", data: "future" }]) {
    const h = harness(); if (setup === undefined) delete h.records[S]; else h.records[S] = setup
    h.records[F] = { v: 1, gen: "f0", at: 1, by: "a", data: {} }; h.records.sync.pushed[F] = "f0"
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Settings needs no Setup")
    equal(await h.writer.receiveSyncDocument(filterKey), unavailable("account-context"), "Filter selected Setup remains required")
    await h.writer.dispose()
  }
  for (const stage of [1, 2, 3]) {
    const h = harness(); h.hooks.local = async n => { if (n === stage) { h.records[S] = { changed: true }; h.records[Q].data = { on: false, changed: true } } }
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Settings ignores unrelated Setup and Filter body changes")
    equal(h.records[Q].data, { on: false, changed: true }, "Settings preserves latest unrelated body")
    equal(h.records.sync.pushed[Q], "q0", "Settings never acknowledges unrelated pending Q")
    await h.writer.dispose()
  }
  for (const variant of ["pending", "missing", "mismatch", "equal", "lower", "same-gen"]) {
    const h = harness()
    if (variant === "pending") h.records[D].gen = "pending"
    if (variant === "missing") delete h.records.sync.pushed[D]
    if (variant === "mismatch") h.records.sync.pushed[D] = "other"
    if (variant === "equal") h.remote["s:settings"].at = 10
    if (variant === "lower") h.remote["s:settings"].at = 9
    if (variant === "same-gen") h.remote["s:settings"].gen = "s0"
    equal(await h.writer.receiveSyncDocument(key), unavailable(["pending", "missing", "mismatch"].includes(variant) ? "pending" : "conflict"), "Settings unavailable " + variant)
    equal(h.sets, [], "Settings no conflict writes " + variant); await h.writer.dispose()
  }
  {
    const h = harness(); h.records[D] = clone(literal.incoming); h.records.sync.pushed[D] = "debt"
    equal(await h.writer.receiveSyncDocument(key), { kind: "idle" }, "Settings exact debt idle before repair")
    equal(h.sets, [], "Settings receiver does not repair debt"); await h.writer.dispose()
  }
  for (const location of ["local", "remote"]) for (const value of [undefined, null, { v: 1, gen: "s1", at: 20, by: "b", deleted: true },
    { v: 2, gen: "s1", at: 20, by: "b", data: "foreign" }, { v: 1, gen: "s1", at: 20, by: "b", data: { theme: 42 } }, "invalid JSON", { data: {} }]) {
    const h = harness(), records = location === "local" ? h.records : h.remote, name = location === "local" ? D : "s:settings"
    if (value === undefined) delete records[name]; else records[name] = value
    equal(await h.writer.receiveSyncDocument(key), unavailable("document"), "Settings unsupported " + location + stable(value))
    equal(h.sets, [], "Settings unsupported no set"); await h.writer.dispose()
  }
  const text = JSON.stringify(literal.incoming), cut = Math.floor(text.length / 2)
  const pointer = { v: 1, gen: "s1", at: 20, by: "device-b", n: 2 }, fragments = [text.slice(0, cut), text.slice(cut)] as const
  for (const variant of ["complete", "incomplete", "index", "stamp"]) {
    const h = harness(); h.remote["s:settings"] = pointer; h.remote["s:settings@s1.0"] = fragments[0]
    h.remote["s:settings@old.0"] = "old orphan"
    if (variant !== "incomplete") h.remote["s:settings@s1.1"] = fragments[1]
    if (variant === "index") h.remote["s:settings@s1.01"] = "bad index"
    if (variant === "stamp") h.remote["s:settings@s1.0"] = fragments[0].replace('"s1"', '"wrong"')
    equal((await h.writer.receiveSyncDocument(key)).kind, variant === "complete" ? "adopted" : "unavailable", "Settings chunk assembly " + variant)
    if (variant === "complete") equal(h.sets, [literal.expectedSet], "Settings complete chunks raw exact")
    else equal(h.sets, [], "Settings incomplete no writes")
    await h.writer.dispose()
  }
  for (const fault of ["off", "consent", "stale-consent", "upgrade", "schema", "history", "joining", "waiting", "unjoined", "account:synthetic", "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"]) {
    const h = harness()
    if (fault === "off") { h.records.device.syncOn = false; h.records.sync.status = "off" }
    else if (fault === "consent") h.records.device.consent = null
    else if (fault === "stale-consent") h.records.device.consent.v = 0
    else if (fault === "upgrade") h.records.device.upgradeNote = { state: "pending" }
    else if (fault === "schema") h.records.schema = 2
    else if (fault === "history") delete h.records.sync
    else if (["joining", "waiting"].includes(fault)) h.records.sync.status = fault
    else if (fault === "unjoined") h.records.sync.joined = null
    else h.records[fault] = null
    equal(await h.writer.receiveSyncDocument(key), unavailable("authority"), "Settings authority " + fault)
    equal(h.reads, ["L0"], "Settings authority before remote access " + fault)
    equal(h.sets, [], "Settings authority no set"); await h.writer.dispose()
  }
  for (const value of [undefined, null, {}, { v: 2, id: "h", created: 1 }, { v: 1, id: "changed", created: 1 }, { v: 1, id: "h", created: 1, reset: true }]) {
    const h = harness(); if (value === undefined) delete h.remote["s:meta"]; else h.remote["s:meta"] = value
    equal(await h.writer.receiveSyncDocument(key), unavailable("history"), "Settings unsupported metadata")
    equal(h.sets, [], "Settings metadata no set"); await h.writer.dispose()
  }
  for (const n of [1, 2, 3]) for (const field of ["device", "schema", "sync", D]) {
    const h = harness(); h.hooks.local = async index => { if (index === n) {
      if (field === "schema") h.records.schema = 2
      else if (field === "device") h.records.device.pickerSortAZ = false
      else if (field === "sync") h.records.sync.extra.keep = false
      else h.records[D].data.theme = "system"
    } }
    equal((await h.writer.receiveSyncDocument(key)).kind, n < 3 ? "unavailable" : "unconfirmed", "Settings stale local " + n + field)
    equal(h.sets.length, n < 3 ? 0 : 1, "Settings stale local commit boundary"); await h.writer.dispose()
  }
  for (const n of [1, 2]) for (const field of ["id", "created", "extra", "body", "gen", "chunks"]) {
    const h = harness(); h.hooks.remote = async index => { if (index === n) {
      if (field === "id") h.remote["s:meta"].id = "other"
      else if (field === "created") h.remote["s:meta"].created = 2
      else if (field === "extra") h.remote["s:meta"].extra.keep = false
      else if (field === "body") h.remote["s:settings"].data.theme = "light"
      else if (field === "gen") h.remote["s:settings"].gen = "s2"
      else { h.remote["s:settings"] = pointer; h.remote["s:settings@s1.0"] = fragments[0] }
    } }
    equal((await h.writer.receiveSyncDocument(key)).kind, n === 1 ? "unavailable" : "unconfirmed", "Settings stale remote " + n + field)
    equal(h.sets.length, n === 1 ? 0 : 1, "Settings stale remote commit boundary"); await h.writer.dispose()
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "applied-reject", "L3", "R2", "torn"]) {
    const h = harness(), sentinel = Error("Settings sentinel " + stage)
    h.hooks.local = async n => { if (stage === "L" + n) throw sentinel }
    h.hooks.remote = async n => { if (stage === "R" + n) throw sentinel }
    if (stage === "set") h.hooks.set = async () => { throw sentinel }
    if (stage === "applied-reject") h.hooks.afterSet = async () => { throw sentinel }
    if (stage === "torn") h.hooks.afterSet = async () => { h.records.sync = clone(literal.local.sync) }
    let result: Awaited<ReturnType<typeof h.writer.receiveSyncDocument>> | undefined, caught: unknown
    try { result = await h.writer.receiveSyncDocument(key) } catch (error) { caught = error }
    if (["L0", "R0", "L1", "R1", "L2"].includes(stage)) equal(caught === sentinel, true, "Settings original precommit Error " + stage)
    else if (["set", "applied-reject"].includes(stage)) { equal(result?.kind, "local-set-failed", "Settings rejected set kind"); equal(result?.kind === "local-set-failed" && result.error === sentinel, true, "Settings original set Error") }
    else { equal(result?.kind, "unconfirmed", "Settings uncertain readback"); if (stage !== "torn") equal(result?.kind === "unconfirmed" && result.cause.kind === "read-failed" && result.cause.error === sentinel, true, "Settings original postflight Error") }
    h.hooks.local = h.hooks.remote = async () => {}; h.hooks.set = h.hooks.afterSet = async () => {}
    await h.writer.startSync(); equal(h.listeners.size, 0, "Settings opaque stop cannot restart " + stage)
    equal(h.writes, [], "Settings opaque failure no outbound"); await h.writer.dispose()
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); h.remote["s:settings"] = clone(literal.local[D]); await h.writer.startSync()
    h.remote["s:settings"] = clone(literal.incoming); h.resetReads()
    let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done })
    const hold = async () => { entered = true; await gate }
    h.hooks.local = async n => { if (stage === "L" + n) await hold() }
    h.hooks.remote = async n => { if (stage === "R" + n) await hold() }
    if (stage === "set") h.hooks.set = hold
    const receiving = h.writer.receiveSyncDocument(key); await settle(); equal(entered, true, "Settings held boundary entered " + stage)
    const before = [...h.reads], second = h.writer.receiveSyncDocument(key), filter = h.writer.receiveSyncDocument(filterKey), edit = h.change(), flush = h.writer.flushSync(), start = h.writer.startSync()
    void h.event(); await h.fire(5000)
    equal(h.reads, before, "Settings same lane excludes queued IO " + stage)
    h.hooks.local = h.hooks.remote = async () => {}; h.hooks.set = async () => {}; release()
    equal(await receiving, adopted, "Settings held receiver finishes " + stage)
    equal(await second, { kind: "idle" }, "Settings queued receive rereads committed value")
    await filter; await edit; await flush; await start; await settle()
    equal(h.records[D], literal.incoming, "Settings queued work preserves raw incoming")
    equal(h.records.sync.pushed[D], "s1", "Settings queued history retains exact generation"); await h.writer.dispose()
  }
  for (const action of ["off", "consent", "dispose"]) for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done }), hold = async () => { entered = true; await gate }
    h.hooks.local = async n => { if (stage === "L" + n) await hold() }
    h.hooks.remote = async n => { if (stage === "R" + n) await hold() }
    if (stage === "set") h.hooks.set = hold
    const receiving = h.writer.receiveSyncDocument(key); await settle(); equal(entered, true, "Settings held loss " + action + stage)
    if (action === "off") { h.records.device.syncOn = false; h.records.sync.status = "off" }
    if (action === "consent") h.records.device.consent = null
    const disposing = action === "dispose" ? h.writer.dispose() : undefined
    h.hooks.local = h.hooks.remote = async () => {}; h.hooks.set = async () => {}; release()
    const result = await receiving
    equal(result.kind, stage === "R2" && action !== "dispose" ? "adopted" : ["set", "L3", "R2"].includes(stage) ? "unconfirmed" : "unavailable", "Settings finite last local observation " + action + stage)
    await disposing; await h.writer.dispose()
  }
  const start = harness(); await start.writer.startSync()
  equal(start.sets, [literal.expectedSet], "Settings automatic exact batch")
  equal(start.results, [{ kind: "deferred", notBefore: 5000 }], "Settings automatic ordinary Q callback")
  await start.fire(4999); equal(start.writes, [], "Settings Q blocked at 4999")
  await start.fire(5000); equal(start.writes, [{ "s:filter:AAAAAAAAAAAAAAAA:PL_Q": literal.local[Q] }], "Settings Q-only outbound no echo")
  equal(start.records.sync.pushed, { ...literal.expectedSet.sync.pushed, [Q]: "q1" }, "Settings outbound independent acknowledgement")
  await start.event(); equal(start.writes.length, 1, "Settings own and repeat event idle")
  const fresh = harness(clone(start.records), clone(start.remote)); await fresh.writer.startSync(); equal(fresh.results, [{ kind: "idle" }], "Settings fresh owner final snapshot idle")
  await fresh.writer.dispose(); await start.writer.dispose()
  {
    const h = harness(); h.records[Q] = clone(h.remote["s:filter:AAAAAAAAAAAAAAAA:PL_Q"])
    await h.writer.startSync(); equal(h.results, [{ kind: "idle" }], "Settings incoming-only outbound idle"); equal(h.timers.size, 0, "Settings incoming-only no timer"); await h.writer.dispose()
  }
  for (const variant of ["supported", "pending", "invalid", "equal", "foreign"]) {
    const h = harness(), oldFilter = { v: 1, gen: "f0", at: 10, by: "a", data: {} }, incomingFilter = { v: 1, gen: "f1", at: 20, by: "b", data: { on: true } }
    h.records[F] = oldFilter; h.records.sync.pushed[F] = "f0"; h.records[S].data.autoAdd.push({ pl: playlist })
    h.remote[F.replace("doc:", "s:")] = incomingFilter; h.remote[S.replace("doc:", "s:")] = clone(h.records[S])
    if (variant === "pending") h.records[D].gen = "pending"
    if (variant === "invalid") h.remote["s:settings"].data.theme = 42
    if (variant === "equal") h.remote["s:settings"].at = 10
    if (variant === "foreign") h.remote["s:settings"].v = 2
    const originalHistory = clone(h.records.sync)
    await h.writer.startSync()
    equal(h.records[F], incomingFilter, "Settings unavailable permits independent Filter " + variant)
    equal(h.sets[0], { [F]: incomingFilter, sync: { ...originalHistory, pushed: { ...originalHistory.pushed, [F]: "f1" } } }, "Settings sorted Filter first " + variant)
    equal(h.records.sync.pushed[F], "f1", "Settings retains earlier Filter acknowledgement " + variant)
    equal(h.records.sync.pushed[Q], "q0", "Settings simultaneous pass keeps pending Q " + variant)
    if (variant === "supported") {
      equal(h.sets[1], { [D]: literal.incoming, sync: { ...originalHistory, pushed: { ...originalHistory.pushed, [F]: "f1", [D]: "s1" } } }, "Settings current history after Filter adoption")
      await h.fire(5000); equal(h.writes, [{ "s:filter:AAAAAAAAAAAAAAAA:PL_Q": literal.local[Q] }], "Settings mixed Q-only push")
    } else { equal(h.records[D].gen, variant === "pending" ? "pending" : "s0", "Settings withheld target exact"); equal(h.results, variant === "foreign" ? [{ kind: "deferred", notBefore: 5000 }] : [{ kind: "unavailable" }], "Settings existing whole planner result " + variant) }
    await h.writer.dispose()
  }
  {
    const h = harness(); h.remote["s:settings"] = pointer; h.remote["s:settings@s1.0"] = fragments[0]
    await h.writer.startSync(); equal(h.sets, [], "Settings incomplete startup no adoption"); equal(h.timers.size, 0, "Settings incomplete no timer retry")
    h.remote["s:settings@s1.1"] = fragments[1]; await h.event(); equal(h.sets, [literal.expectedSet], "Settings independent chunk arrival event adopts"); await h.writer.dispose()
  }
  {
    const h = harness(); h.remote["s:settings"] = clone(literal.local[D]); await h.writer.startSync()
    h.remote["s:settings"] = clone(literal.incoming); await h.fire(5000)
    equal(h.records[D], literal.local[D], "Settings timer remains outbound-only")
    equal(h.writes, [], "Settings timer no echo or partial Q push"); equal(h.timers.size, 0, "Settings timer never retries incoming"); await h.writer.dispose()
  }
  for (const status of ["full", "update-needed"]) {
    const h = harness(); h.records.sync.status = status
    for (let i = 0; i < 481; i++) h.remote["opaque:" + i] = null
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Settings overfull local-only receive " + status)
    equal(h.records.sync.status, status, "Settings retains sync status"); await h.writer.dispose()
  }
  {
    const h = harness()
    Object.assign(h.records.device, { upgradeNote: null, claimNotice: null, lastAccount: acct, legacyCleared: true, futureDevice: { keep: true } })
    h.records.sync = { ...h.records.sync, ...JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert","v":99}') }
    Object.defineProperty(h.records.sync.pushed, "__proto__", { value: "opaque-generation", enumerable: true })
    h.remote["s:meta"] = { ...h.remote["s:meta"], ...JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}') }
    const beforeDevice = clone(h.records.device), beforeHistory = clone(h.records.sync)
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Settings all Device fields and special history supported")
    equal(h.records.device, beforeDevice, "Settings every Device field exact")
    equal(h.records.sync, { ...beforeHistory, pushed: { ...beforeHistory.pushed, [D]: "s1" } }, "Settings own special pushed entries exact")
    await h.writer.dispose()
  }
  {
    const h = harness(); h.remote["s:settings"] = clone(literal.local[D]); await h.writer.startSync()
    const ticket = [...h.timers.values()][0], counts = h.counts()
    h.remote["s:settings"] = clone(literal.incoming)
    let duringTicket: unknown, duringCounts: unknown
    h.hooks.set = async () => { duringTicket = [...h.timers.values()][0]; duringCounts = h.counts() }
    await h.event()
    equal(duringTicket === ticket, true, "Settings incoming preserves existing ticket identity")
    equal(duringCounts, { ...counts, clock: counts.clock + 1 }, "Settings incoming receive changes no scheduling clocks")
    equal(h.timers.size, 1, "Settings event owns one outbound ticket")
    await h.fire(4999); equal(h.writes, [], "Settings incoming retains exact initial pacing")
    h.hooks.set = async () => {}; await h.fire(5000)
    equal(h.writes, [{ "s:filter:AAAAAAAAAAAAAAAA:PL_Q": literal.local[Q] }], "Settings incoming unchanged quiet and invocation deadline")
    await h.writer.dispose()
  }
  for (const boundary of ["enumeration", "L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); delete h.records[Q]; delete h.records[S]; delete h.records.sync.pushed[Q]; delete h.records.sync.pushed[S]
    delete h.remote[Q.replace("doc:", "s:")]; delete h.remote[S.replace("doc:", "s:")]
    let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done }), hold = async () => { entered = true; await gate }
    h.hooks.local = async n => { if (boundary === "enumeration" && n === 1 || boundary === "L" + (n - 2)) await hold() }
    h.hooks.remote = async n => { if (boundary === "R" + n) await hold() }
    if (boundary === "set") h.hooks.set = hold
    const starting = h.writer.startSync(); await settle(); equal(entered, true, "Settings automatic held " + boundary)
    const before = [...h.reads], manual = h.writer.receiveSyncDocument(key), filter = h.writer.receiveSyncDocument(filterKey), edit = h.change(), flush = h.writer.flushSync(), startAgain = h.writer.startSync()
    void h.event(); await settle(); equal(h.reads, before, "Settings automatic queue cannot read ahead " + boundary)
    h.hooks.local = h.hooks.remote = async () => {}; h.hooks.set = async () => {}; release()
    await starting; await manual; await filter; await edit; await flush; await startAgain; await settle()
    equal(h.records[D], literal.incoming, "Settings automatic held current target exact " + boundary)
    await h.writer.dispose()
  }
  for (const boundary of ["enumeration", "L0", "R0", "L1", "R1", "L2", "set", "applied-reject", "torn", "L3", "R2", "contradictory"]) {
    const h = harness(); delete h.records[Q]; delete h.records.sync.pushed[Q]; delete h.remote[Q.replace("doc:", "s:")]
    const sentinel = Error("Settings automatic sentinel " + boundary)
    h.hooks.local = async n => { if (boundary === "enumeration" && n === 1 || boundary === "L" + (n - 2)) throw sentinel }
    h.hooks.remote = async n => { if (boundary === "R" + n) throw sentinel }
    if (boundary === "set") h.hooks.set = async () => { throw sentinel }
    if (boundary === "applied-reject") h.hooks.afterSet = async () => { throw sentinel }
    if (boundary === "torn") h.hooks.afterSet = async () => { h.records.sync = clone(literal.local.sync); delete h.records.sync.pushed[Q] }
    if (boundary === "contradictory") h.hooks.remote = async n => { if (n === 2) h.remote["s:settings"].data.theme = "light" }
    await h.writer.startSync()
    const result = h.results.at(-1)
    equal(result?.kind, ["torn", "contradictory"].includes(boundary) ? "unavailable" : "rejected", "Settings automatic diagnostic " + boundary)
    if (result?.kind === "rejected") equal(result.error === sentinel, true, "Settings automatic original Error " + boundary)
    equal(h.listeners.size, 0, "Settings automatic opaque stop unsubscribes " + boundary)
    equal(h.timers.size, 0, "Settings automatic opaque stop cancels timer " + boundary)
    h.hooks.local = h.hooks.remote = async () => {}; h.hooks.set = h.hooks.afterSet = async () => {}
    h.records[D] = clone(literal.local[D]); h.records.sync.pushed[D] = "s0"; h.remote["s:settings"] = clone(literal.incoming)
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Settings manual success after opaque stop " + boundary)
    const reads = [...h.reads], resultCount = h.results.length
    await h.writer.startSync(); await h.event(); await h.fire(20000)
    equal(h.reads, reads, "Settings manual success cannot restart stopped automatic owner " + boundary)
    equal(h.results.length, resultCount, "Settings stopped owner emits no new result " + boundary)
    equal(h.writes, [], "Settings automatic failure skips whole outbound " + boundary); await h.writer.dispose()
  }
  {
    const h = harness(); let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done })
    h.hooks.local = async n => { if (n === 0) { entered = true; await gate } }
    const starting = h.writer.startSync(); await settle(); equal(entered, true, "Settings startup authority held")
    const disposing = h.writer.dispose(); release(); await starting; await disposing
    equal(h.listeners.size, 0, "Settings disposed held startup never subscribes"); equal(h.writes, [], "Settings disposed startup no remote write")
  }
  cases.push("sparse-context-conflicts-wire-authority-stale-errors-held-lane-loss-automatic-mixed-timers")
  return { assertions, cases, primary: literal }
}

test("shared Settings receives raw documents through the same staged owner and automatic pass", async () => {
  const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_P"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid synthetic address")
  expect((await settingsIncomingAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(300)
})

async function keptIncomingAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey) {
  let assertions = 0
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) {
    assertions++
    if (stable(actual) !== stable(expected)) throw Error(label + ": " + stable(actual) + " != " + stable(expected))
  }
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const S = "doc:setup:AAAAAAAAAAAAAAAA", K = "doc:filter:AAAAAAAAAAAAAAAA:PL_K", P = "doc:filter:AAAAAAAAAAAAAAAA:PL_P"
  const Q = "doc:filter:AAAAAAAAAAAAAAAA:PL_Q", T = "doc:settings", B = K.replace("doc:", "s:"), C = Q.replace("doc:", "s:")
  const keptPlaylist = "PL_K", selectedPlaylist = "PL_P"
  if (!isPlaylistId(keptPlaylist) || !isPlaylistId(selectedPlaylist)) throw Error("Invalid synthetic playlist")
  const key = { kind: "filter", acct, playlist: keptPlaylist } as const
  const pKey = { kind: "filter", acct, playlist: selectedPlaylist } as const
  const local = JSON.parse('{"schema":1,"device":{"id":"synthetic-local","consent":{"v":1,"at":0},"syncOn":true},"sync":{"joined":"synthetic-history","pushed":{"doc:setup:AAAAAAAAAAAAAAAA":"a0","doc:filter:AAAAAAAAAAAAAAAA:PL_K":"k0","doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q0"},"status":"ok","editedSinceOff":false,"extra":{"keep":true}},"doc:setup:AAAAAAAAAAAAAAAA":{"v":1,"gen":"a0","at":1,"by":"synthetic-local","data":{"autoAdd":[],"gather":"PL_G"},"extension":{"keep":true}},"doc:filter:AAAAAAAAAAAAAAAA:PL_K":{"v":1,"gen":"k0","at":10,"by":"synthetic-local","data":{"mode":"deny","on":false,"channels":[]},"oldOnly":true},"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":{"v":1,"gen":"q1","at":15,"by":"synthetic-local","data":{"on":true}}}')
  const incoming = JSON.parse('{"v":1,"gen":"k1","at":20,"by":"synthetic-remote","extension":{"keep":[null,1]},"data":{"mode":"allow","on":true,"channels":[["UCbbbbbbbbbbbbbbbbbbbbbb","  Kept channel  "]],"future":{"x":1}}}')
  const remote = { "s:meta": { v: 1, id: "synthetic-history", created: 0 }, [S.replace("doc:", "s:")]: clone(local[S]),
    [B]: incoming, [C]: { v: 1, gen: "q0", at: 5, by: "synthetic-local", data: {} } }
  const expectedSet = { [K]: incoming, sync: { ...local.sync, pushed: { ...local.sync.pushed, [K]: "k1" } } }
  const adopted = { kind: "adopted", received: { key, name: K, gen: "k1", document: incoming } }
  const settle = async () => { for (let i = 0; i < 1200; i++) await Promise.resolve() }
  function harness(records = clone(local), synced = clone(remote)) {
    let time = 0, generation = 0, wall = 0, clock = 0, serial = 0, lr = 0, rr = 0
    const reads: string[] = [], sets: unknown[] = [], writes: unknown[] = [], invocations: number[] = [], results: unknown[] = []
    const listeners = new Set<() => void>(), timers = new Map<number, { due: number; run: () => void }>()
    const hooks = { io: async (_stage: string) => {}, afterSet: async () => {} }
    const writer = create({ claim: { kind: "unavailable" }, local: {
      async get() { const stage = "L" + lr++; reads.push(stage); await hooks.io(stage); return clone(records) },
      async set(items) { reads.push("set"); await hooks.io("set"); sets.push(clone(items)); Object.assign(records, clone(items)); await hooks.afterSet() }
    }, sync: {
      async get() { const stage = "R" + rr++; reads.push(stage); await hooks.io(stage); return clone(synced) },
      async set(items) { invocations.push(time); writes.push(clone(items)); Object.assign(synced, clone(items)); for (const run of listeners) run() },
      subscribe(run) { listeners.add(run); return () => { listeners.delete(run) } }
    }, now: () => { wall++; return time + 100 }, generation: () => { generation++; return "unexpected-generation" },
    syncClock: { now: () => { clock++; return time }, wallNow: () => 1000000, after(ms, run) { const id = ++serial; timers.set(id, { due: time + ms, run }); return () => { timers.delete(id) } } },
    onSyncResult: result => { results.push(result) } })
    return { writer, records, synced, reads, sets, writes, invocations, results, listeners, timers, hooks,
      counts: () => ({ generation, wall, clock }), event: async () => { for (const run of listeners) run(); await settle() },
      fire: async (at: number) => { time = at; for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.run() } await settle() },
      change: () => writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist: key.playlist,
        desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }) }
  }
  {
    const h = harness(), counts = h.counts()
    equal(await h.writer.receiveSyncDocument(key), adopted, "kept manual raw adoption")
    equal(h.sets, [expectedSet], "kept one exact Filter-history batch")
    equal(h.records, { ...local, ...expectedSet }, "kept literal whole state")
    equal(h.reads, ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"], "kept finite IO trace")
    equal(h.counts(), counts, "kept receive no generation clock or stamp")
    equal(h.synced, remote, "kept raw remote unchanged")
    equal(h.writes, [], "kept receive no echo")
    equal(await h.writer.receiveSyncDocument(key), { kind: "idle" }, "kept repeat idle")
    equal(h.sets, [expectedSet], "kept repeat no set")
    const next = harness(clone(h.records)); equal(await next.writer.receiveSyncDocument(key), { kind: "idle" }, "kept fresh owner raw idle")
    await next.writer.dispose(); await h.writer.dispose()
  }
  {
    const h = harness(), sparse = { ...clone(incoming), data: { future: { raw: true } } }
    h.synced[B] = sparse
    const result = await h.writer.receiveSyncDocument(key)
    equal(h.records[K], sparse, "kept raw omitted defaults")
    equal(result.kind, "adopted", "kept sparse raw adoption")
    await h.writer.dispose()
  }
  {
    const h = harness(); delete h.records[Q]; delete h.records.sync.pushed[Q]; delete h.synced[C]; h.records[S].data = {}
    const before = clone(h.records[S])
    equal(h.records[K].data, { mode: "deny", on: false, channels: [] }, "only retained Filter is off and empty")
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "empty Setup retained only by kept Filter is sufficient")
    equal(h.records[S], before, "sole kept Filter causes no Setup lifecycle edit"); await h.writer.dispose()
  }
  for (const data of [{}, { autoAdd: [], marks: { PL_Unchosen: "full" }, targets: { gone99: "PL_Dangling" } }, { autoAdd: [{ pl: "PL_other" }] }]) {
    const h = harness(); h.records[S].data = clone(data)
    const rawSetup = clone(h.records[S]); equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "kept supported empty or dangling Setup")
    equal(h.records[S], rawSetup, "kept Setup remains raw"); await h.writer.dispose()
  }
  for (const value of [undefined, null, { ...local[S], v: 2 }, { v: 1, gen: "dead", at: 1, by: "synthetic-local", deleted: true }, { ...local[S], data: { autoAdd: 2 } }]) {
    const h = harness(); if (value === undefined) delete h.records[S]; else h.records[S] = value
    equal(await h.writer.receiveSyncDocument(key), { kind: "unavailable", reason: "account-context" }, "kept unsupported Setup refusal")
    equal(h.reads, ["L0"], "kept unsupported Setup before sync IO"); equal(h.sets, [], "kept unsupported Setup no set"); await h.writer.dispose()
  }
  for (const value of [undefined, null, { ...local[K], v: 2 }, { v: 1, gen: "dead", at: 1, by: "synthetic-local", deleted: true }, { ...local[K], data: { on: 2 } }]) {
    const h = harness(); if (value === undefined) delete h.records[K]; else h.records[K] = value
    equal(await h.writer.receiveSyncDocument(key), { kind: "unavailable", reason: "document" }, "kept unsupported local Filter")
    equal(h.reads, ["L0"], "kept unsupported Filter before sync IO"); equal(h.sets, [], "kept unavailable target never created"); await h.writer.dispose()
  }
  {
    const h = harness(); h.records[S].gen = "a-pending"; h.records[S].extension.pending = true
    const before = clone(h.records[S]); equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "kept accepts under pending Setup")
    equal(h.records[S], before, "pending Setup untouched"); equal(h.records.sync.pushed[S], "a0", "pending Setup acknowledgement untouched")
    equal(h.records[Q], local[Q], "pending Q body untouched"); equal(h.records.sync.pushed[Q], "q0", "pending Q acknowledgement untouched"); await h.writer.dispose()
  }
  {
    const h = harness(); h.records[K].gen = "k-pending"; const before = clone(h.records)
    equal(await h.writer.receiveSyncDocument(key), { kind: "unavailable", reason: "pending" }, "kept pending addressed target refused")
    equal(h.records, before, "kept pending exact state"); await h.writer.dispose()
  }
  {
    const h = harness(); equal(await h.change(), { kind: "unavailable", reason: "account-context" }, "kept UI selection remains required")
    equal(h.sets, [], "kept UI no write"); equal(h.counts().generation, 0, "kept UI no generation"); equal(h.synced, remote, "kept UI remote untouched"); await h.writer.dispose()
  }
  {
    const h = harness(); await h.writer.startSync()
    equal(h.sets, [expectedSet], "kept automatic start adoption")
    equal(h.results, [{ kind: "deferred", notBefore: 5000 }], "kept start Q deferred")
    await h.fire(4999); equal(h.writes, [], "kept Q pacing at 4999")
    await h.fire(5000); equal(h.writes, [{ [C]: local[Q] }], "kept Q-only send at 5000")
    equal(h.invocations, [5000], "kept exact outbound invocation")
    equal(h.records.sync, { ...expectedSet.sync, pushed: { ...expectedSet.sync.pushed, [Q]: "q1" } }, "kept acknowledgement survives Q repair")
    equal(h.counts().generation, 0, "kept automatic no generation"); equal(h.counts().wall, 0, "kept automatic no stamp"); await h.writer.dispose()
  }
  {
    const h = harness(); h.synced[B] = clone(local[K]); await h.writer.startSync(); equal(h.sets, [], "kept start exact idle")
    h.synced[B] = clone(incoming); await h.event(); equal(h.sets, [expectedSet], "kept genuine sync event adoption")
    h.synced[B] = { ...clone(incoming), gen: "k2", at: 30 }; const reads = h.reads.length
    await h.fire(5000); equal(h.records[K], incoming, "kept timer remains outbound-only")
    equal(h.writes, [], "kept timer cannot bypass incoming debt"); equal(h.reads.length - reads, 2, "kept timer has no incoming scan"); await h.writer.dispose()
  }
  {
    const h = harness(); h.synced[B] = clone(local[K]); await h.writer.startSync()
    const large = { ...clone(incoming), data: { ...clone(incoming.data), future: "x".repeat(9000) } }, text = JSON.stringify(large), midpoint = Math.floor(text.length / 2)
    h.synced[B] = { v: 1, gen: "k1", at: 20, by: "synthetic-remote", n: 2 }
    h.synced[B + "@k1.0"] = text.slice(0, midpoint); await h.event()
    equal(h.records[K], local[K], "kept incomplete chunks retain k0")
    h.synced[B + "@k1.1"] = text.slice(midpoint); await h.event()
    equal(h.records[K], large, "kept independent complete chunk event")
    equal(h.sets, [{ ...expectedSet, [K]: large }], "kept chunk exact batch"); await h.writer.dispose()
  }
  {
    const h = harness(), retained = Object.fromEntries([`cache:${acct}`, ...Array.from({ length: 16 }, (_, shard) => `progress:${acct}:${shard}`)].map(name => [name, { keep: true }]))
    Object.assign(h.records, clone(retained)); h.records.device.lastAccount = acct
    const device = clone(h.records.device)
    h.records[P] = { v: 1, gen: "p0", at: 10, by: "synthetic-local", data: {} }
    h.records[T] = { v: 1, gen: "t0", at: 10, by: "synthetic-local", data: {} }
    h.records[S].data.autoAdd = [{ pl: "PL_P", takes: "both" }]; h.synced[S.replace("doc:", "s:")] = clone(h.records[S])
    h.records.sync.pushed[P] = "p0"; h.records.sync.pushed[T] = "t0"
    const p1 = { ...clone(h.records[P]), gen: "p1", at: 20 }, t1 = { ...clone(h.records[T]), gen: "t1", at: 20 }
    h.synced[P.replace("doc:", "s:")] = p1; h.synced[T.replace("doc:", "s:")] = t1
    const history = clone(h.records.sync), pushed = history.pushed
    await h.writer.startSync()
    equal(h.sets, [
      { [K]: incoming, sync: { ...history, pushed: { ...pushed, [K]: "k1" } } },
      { [P]: p1, sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1" } } },
      { [T]: t1, sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1", [T]: "t1" } } }
    ], "kept selected Settings cumulative lexical batches")
    equal(h.records.sync.pushed[S], "a0", "mixed Setup acknowledgement exact"); equal(h.records.sync.pushed[Q], "q0", "mixed Q acknowledgement exact")
    h.records[S].data.autoAdd = [{ pl: "PL_K", takes: "both" }]
    h.synced[B] = { ...clone(incoming), gen: "k2", at: 30 }; h.synced[P.replace("doc:", "s:")] = { ...p1, gen: "p2", at: 30 }
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "kept now selected receives")
    equal((await h.writer.receiveSyncDocument(pKey)).kind, "adopted", "selected now kept receives")
    equal(h.records[S].data.autoAdd, [{ pl: "PL_K", takes: "both" }], "selection externally seeded only")
    equal(Object.keys(h.records).sort(), ["schema", "device", "sync", S, K, P, Q, T, ...Object.keys(retained)].sort(), "selection authorizes no removal")
    for (const [name, value] of Object.entries(retained)) equal(h.records[name], value, "selection keeps cache and progress " + name)
    equal(h.records.device, device, "selection changes no Device ownership or lastAccount"); await h.writer.dispose()
  }
  {
    const h = harness(); h.synced[S.replace("doc:", "s:")] = { ...clone(local[S]), gen: "a1", at: 30, data: {} }
    await h.writer.startSync()
    equal(h.sets, [expectedSet], "kept adopts despite unrelated Setup incoming debt")
    equal(h.results, [{ kind: "unavailable" }], "kept global attempt cannot bypass blocking document")
    await h.fire(5000); equal(await h.writer.flushSync(), { kind: "unavailable" }, "kept manual flush cannot bypass blocking document")
    equal(h.writes, [], "kept blocking debt sends nothing"); equal(h.records[S], local[S], "kept empty Setup remains deferred"); await h.writer.dispose()
  }
  for (const stage of ["R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done })
    h.hooks.io = async current => { if (current === stage) { entered = true; await gate } }
    const receiving = h.writer.receiveSyncDocument(key); await settle(); equal(entered, true, "kept held stale Setup entered " + stage)
    h.records[S].extension.concurrent = { supported: true }
    release(); const result = await receiving
    equal(result.kind, ["set", "L3"].includes(stage) ? "unconfirmed" : stage === "R2" ? "adopted" : "unavailable", "kept held stale Setup " + stage)
    equal(h.sets.length, ["set", "L3", "R2"].includes(stage) ? 1 : 0, "kept held stale Setup no precommit set " + stage)
    await h.writer.dispose()
  }
  for (const stage of ["R0", "L1", "R1", "L2", "set", "L3", "R2"]) for (const field of [S, "sync", "device", K]) {
    const h = harness(); let changed = false
    const mutate = () => { changed = true; h.records[field].unknown = { stale: true } }
    if (stage === "set") h.hooks.afterSet = async () => { mutate() }
    else h.hooks.io = async current => { if (!changed && current === stage) mutate() }
    const result = await h.writer.receiveSyncDocument(key)
    equal(changed, true, "kept stale boundary observed " + stage + field)
    equal(result.kind, ["set", "L3"].includes(stage) ? "unconfirmed" : stage === "R2" ? "adopted" : "unavailable", "kept raw stale guard " + stage + field)
    equal(h.sets.length, ["set", "L3", "R2"].includes(stage) ? 1 : 0, "kept stale precommit no overwrite " + stage + field)
    await h.writer.dispose()
  }
  for (const stage of ["R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(), pending = { ...clone(local[Q]), gen: "q-external", extra: { keep: true } }
    h.hooks.io = async current => { if (current === stage) h.records[Q] = clone(pending) }
    equal(await h.writer.receiveSyncDocument(key), adopted, "kept unrelated pending Q may change " + stage)
    equal(h.records[Q], pending, "kept unrelated pending Q never overwritten " + stage)
    equal(h.records.sync.pushed[Q], "q0", "kept unrelated Q acknowledgement exact " + stage)
    await h.writer.dispose()
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done })
    h.hooks.io = async current => { if (current === stage) { entered = true; await gate } }
    const receiving = h.writer.receiveSyncDocument(key); await settle(); equal(entered, true, "kept held IO entered " + stage)
    const before = [...h.reads], manual = h.writer.receiveSyncDocument(key), edit = h.change(), start = h.writer.startSync(), flush = h.writer.flushSync()
    await settle(); equal(h.reads, before, "kept same lane held IO " + stage)
    release(); equal(await receiving, adopted, "kept held adoption " + stage); await manual; await edit; await start; await flush
    equal(h.counts().generation, 0, "kept queued UI no generation " + stage)
    await h.writer.dispose()
  }
  for (const stage of ["enumeration", "set"]) {
    const h = harness(); h.synced[B] = clone(local[K]); await h.writer.startSync()
    const dueTimer = [...h.timers.values()][0]
    equal(Boolean(dueTimer), true, "kept healthy due timer before held event " + stage)
    const enumeration = "L" + h.reads.filter(name => name.startsWith("L")).length
    h.synced[B] = clone(incoming)
    let release!: () => void, entered = false
    const gate = new Promise<void>(done => { release = done })
    h.hooks.io = async current => { if (current === (stage === "enumeration" ? enumeration : stage)) { entered = true; await gate } }
    const event = h.event(); await settle(); equal(entered, true, "kept automatic held enumeration or set " + stage)
    const before = [...h.reads], manual = h.writer.receiveSyncDocument(key), edit = h.change(), flush = h.writer.flushSync(), again = h.writer.startSync()
    const secondEvent = h.event(); await h.fire(5000); equal(h.reads, before, "kept automatic excludes queued IO " + stage)
    release(); await manual; await edit; await flush; await again; await event; await secondEvent
    equal(h.records[K], incoming, "kept held event adopts before queued timer " + stage)
    equal(h.writes, [{ [C]: local[Q] }], "kept held event timer sends only Q " + stage)
    await h.writer.dispose()
  }
  return { assertions, literals: { local, remote, incoming, expectedSet }, protectedUi: true }
}

test("kept incoming Filters retain raw Setup context without local UI edit authority", async () => {
  expect((await keptIncomingAcceptance(createLocalFilterWriter, acct)).assertions).toBeGreaterThan(200)
})

async function keptFixtureAcceptance(input: Awaited<ReturnType<typeof keptIncomingAcceptance>>["literals"], mode: string, execute: () => void) {
  let assertions = 0, time = 0, serial = 0, lookups = 0, stamps = 0, generations = 0
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) { assertions++; if (stable(actual) !== stable(expected)) throw Error(label + ": " + stable(actual) + " != " + stable(expected)) }
  const K = "doc:filter:AAAAAAAAAAAAAAAA:PL_K", S = "doc:setup:AAAAAAAAAAAAAAAA", Q = "doc:filter:AAAAAAAAAAAAAAAA:PL_Q", P = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", T = "doc:settings"
  const B = K.replace("doc:", "s:"), local = clone(input.local), remote = clone(input.remote)
  const sets: unknown[] = [], writes: unknown[] = [], timers = new Map<number, { at: number; run: () => void }>()
  const settle = async () => { for (let i = 0; i < 1600; i++) await Promise.resolve() }
  function event() {
    const listeners = new Set<(...args: unknown[]) => void>()
    return { addListener: (run: (...args: unknown[]) => void) => { listeners.add(run) }, removeListener: (run: (...args: unknown[]) => void) => { listeners.delete(run) },
      emit: (...args: unknown[]) => { for (const run of listeners) run(...args) }, count: () => listeners.size }
  }
  const changed = event(), syncChanged = event()
  function area(records: Record<string, unknown>, calls: unknown[], sync = false) {
    return { onChanged: sync ? syncChanged : event(),
      async get(keys: readonly string[] | string | null) { const names = keys == null ? Object.keys(records) : typeof keys === "string" ? [keys] : keys; return clone(Object.fromEntries(names.filter(name => Object.hasOwn(records, name)).map(name => [name, records[name]]))) },
      async set(items: Record<string, unknown>) { calls.push(clone(items)); Object.assign(records, clone(items)); changed.emit({}, sync ? "sync" : "local"); if (sync) syncChanged.emit({}) },
      async remove() { throw Error("forbidden remove") }, async clear() { throw Error("forbidden clear") } }
  }
  if (["event", "chunks"].includes(mode)) remote[B] = clone(local[K])
  if (mode === "selected") { local[S].data.autoAdd = [{ pl: "PL_K", takes: "both" }]; remote[S.replace("doc:", "s:")] = clone(local[S]) }
  if (mode === "empty") { local[S].data = {}; remote[S.replace("doc:", "s:")] = clone(local[S]) }
  if (mode === "empty-only-kept") { local[S].data = {}; delete local[Q]; delete local.sync.pushed[Q]; delete remote[Q.replace("doc:", "s:")]; remote[S.replace("doc:", "s:")] = clone(local[S]) }
  if (mode === "pending-setup") local[S].gen = "a-pending"
  if (mode === "missing") delete local[S]
  if (mode === "future") local[S].v = 2
  if (mode === "deleted") local[S] = { v: 1, gen: "dead", at: 1, by: "synthetic-local", deleted: true }
  if (mode === "malformed") local[S].data.autoAdd = 2
  if (mode === "null") local[S] = null
  if (mode === "mixed") {
    local[S].data.autoAdd = [{ pl: "PL_P", takes: "both" }]
    local[P] = { v: 1, gen: "p0", at: 10, by: "synthetic-local", data: {} }; local[T] = { v: 1, gen: "t0", at: 10, by: "synthetic-local", data: {} }
    local.sync.pushed[P] = "p0"; local.sync.pushed[T] = "t0"
    remote[P.replace("doc:", "s:")] = { ...clone(local[P]), gen: "p1", at: 20 }
    remote[T.replace("doc:", "s:")] = { ...clone(local[T]), gen: "t1", at: 20 }
    remote[S.replace("doc:", "s:")] = { ...clone(local[S]), gen: "a1", at: 30, data: {} }
  }
  const before = clone(local), refused = ["missing", "future", "deleted", "malformed", "null"].includes(mode)
  Object.assign(globalThis, { chrome: { storage: { local: area(local, sets), sync: area(remote, writes, true), onChanged: changed },
    runtime: { id: "synthetic", getURL: (path: string) => "chrome-extension://synthetic" + path, onMessage: event() },
    windows: { async get() { lookups++; throw Error("account lookup forbidden") } }, extension: { async isAllowedIncognitoAccess() { throw Error("permission lookup forbidden") } } },
    performance: { now: () => time }, setTimeout(run: () => void, ms: number) { const id = ++serial; timers.set(id, { at: time + ms, run }); return id }, clearTimeout: (id: number) => { timers.delete(id) },
    addEventListener() {}, Date: { now() { stamps++; return 1000000 + time } }, crypto: { randomUUID() { generations++; throw Error("generation forbidden") } } })
  execute(); const fixture = Reflect.get(globalThis, "localFilterFixture")
  equal(fixture.syncReads, [], "actual kept fixture construction has no sync IO")
  if (mode === "manual" || refused) {
    const result = await fixture.receiveFilter(K)
    equal(result.kind, refused ? "unavailable" : "adopted", "actual manual kept adoption")
    if (refused) { equal(result.reason, "account-context", "actual unsupported Setup reason"); equal(fixture.syncReads, [], "actual unsupported Setup before sync IO") }
  }
  fixture.receiveFilter = () => { throw Error("manual Filter proxy forbidden") }
  fixture.receiveSettings = () => { throw Error("manual Settings proxy forbidden") }
  fixture.flush = () => { throw Error("manual flush proxy forbidden") }
  await fixture.start()
  if (["event", "chunks"].includes(mode)) {
    equal(sets, [], "actual kept initial idle")
    if (mode === "chunks") {
      const large = { ...clone(input.incoming), data: { ...clone(input.incoming.data), future: "x".repeat(9000) } }, text = JSON.stringify(large), half = Math.floor(text.length / 2)
      remote[B] = { v: 1, gen: "k1", at: 20, by: "synthetic-remote", n: 2 }; remote[B + "@k1.0"] = text.slice(0, half)
      syncChanged.emit({}); await settle(); equal(local[K], before[K], "actual incomplete kept chunks retain k0")
      remote[B + "@k1.1"] = text.slice(half); syncChanged.emit({}); await settle()
      equal(local[K], large, "actual complete kept chunk event")
    } else { remote[B] = clone(input.incoming); syncChanged.emit({}); await settle(); equal(local[K], input.incoming, "actual automatic kept event adoption") }
  } else equal(local[K], refused ? before[K] : input.incoming, "actual automatic kept start adoption")
  equal(local[S] ?? null, before[S] ?? null, "actual raw Setup exact throughout")
  equal(local.sync.pushed[S], "a0", "actual Setup never acknowledged")
  equal(local.sync.pushed[Q], mode === "empty-only-kept" ? undefined : "q0", "actual pending Q remains pending before timer")
  if (mode === "mixed") {
    const history = before.sync, pushed = history.pushed
    equal(sets, [
      { [K]: input.incoming, sync: { ...history, pushed: { ...pushed, [K]: "k1" } } },
      { [P]: remote[P.replace("doc:", "s:")], sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1" } } },
      { [T]: remote[T.replace("doc:", "s:")], sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1", [T]: "t1" } } }
    ], "actual mixed lexical cumulative batches")
    equal(fixture.automaticResults.at(-1).result, { kind: "unavailable" }, "actual whole flush blocked by Setup debt")
  } else if (!refused && mode !== "chunks") equal(sets, [{ [K]: input.incoming, sync: { ...before.sync, pushed: { ...before.sync.pushed, [K]: "k1" } } }], "actual kept exact two-key batch")
  equal(writes, [], "actual kept no early sync write")
  if (["start", "event", "manual", "selected", "empty"].includes(mode)) {
    const fire = async (at: number) => { time = at; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.run() } await settle() }
    await fire(4999); equal(writes, [], "actual kept Q pacing 4999")
    await fire(5000); equal(writes, [{ [Q.replace("doc:", "s:")]: before[Q] }], "actual kept Q-only outbound no echo")
    equal(local.sync.pushed[K], "k1", "actual kept acknowledgement survives Q repair")
  }
  equal(lookups, 0, "actual kept no account lookup"); equal(stamps > 0, true, "actual kept wall-clock bookkeeping observed with exact unchanged envelopes"); equal(generations, 0, "actual kept no generation")
  equal(local.device, before.device, "actual kept Device untouched")
  await fixture.dispose(); equal(syncChanged.count(), 0, "actual kept unsubscribed"); equal(timers.size, 0, "actual kept timers disposed")
  return { mode, assertions, sets, writes, final: local, callbacks: fixture.automaticResults }
}

test("actual unchanged fixture worker receives kept Filters manually on start and on area events", async () => {
  const literals = (await keptIncomingAcceptance(createLocalFilterWriter, acct)).literals
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../../../tools/fixtures/local-filter-writer/background.ts")], target: "browser", format: "cjs", minify: true })
  expect(built.success).toBe(true)
  const bytes = await built.outputs[0]!.text()
  for (const mode of ["manual", "start", "event", "chunks", "selected", "empty", "empty-only-kept", "pending-setup", "mixed", "missing", "future", "deleted", "malformed", "null"]) {
    const script = `(async()=>{return (${keptFixtureAcceptance.toString()})(JSON.parse(${JSON.stringify(JSON.stringify(literals))}),${JSON.stringify(mode)},()=>{const module={exports:{}};${bytes}})})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect(observed.assertions).toBeGreaterThan(10)
  }
})

function keptIncomingFaults(original: string) {
  return [
    { name: "selected-only", assertion: "kept manual raw adoption", source: original.replace('if (supported.kind !== "value")', 'if (supported.kind !== "value" || !supported.document.data.autoAdd.some(entry => entry.pl === key.playlist))') },
    { name: "no-Setup-validation", assertion: "kept unsupported Setup refusal", source: original.replace('if (key.kind === "settings") return { ...shared, selection: { kind: "settings" } } as const', 'if (true) return { ...shared, selection: { kind: "settings" } } as const') },
    { name: "no-raw-Setup-equality", assertion: "kept held stale Setup R0", source: original.replace('baseline.selection.kind === "filter" && sameSyncJson(current.setup, baseline.selection.setup)', 'baseline.selection.kind === "filter"') },
    { name: "editable-kept", assertion: "kept UI selection remains required", source: original.replace(' || !setup.document.data.autoAdd.some(entry => entry.pl === change.playlist)', '') },
    { name: "outside-kept-lane", assertion: "kept same lane held IO L0", source: original.replace('return enqueue(() => receiveAttempt(key))', 'return receiveAttempt(key)') },
    { name: "decoded-kept", assertion: "kept raw omitted defaults", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = snapshot(JSON.parse(JSON.stringify(remote.candidate.value.document)))') },
    { name: "prepared-kept", assertion: "kept raw omitted defaults", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = snapshot(remote.candidate.json); const prepared = prepareDocumentBody({ kind: "filter", data: document.data }); if (prepared.kind === "prepared") document.data = prepared.data') },
    { name: "split-kept-history", assertion: "kept one exact Filter-history batch", source: original.replace('await deps.local.set({ [name]: document, sync: next })', 'await deps.local.set({ [name]: document }); await deps.local.set({ sync: next })') },
    { name: "ack-pending-Q", assertion: "kept one exact Filter-history batch", source: original.replace('const next = repairedHistory(latest.history, [received])', 'const next = repairedHistory(latest.history, [received]); if (next && typeof next.pushed === "object" && next.pushed) Object.assign(next.pushed, {"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q1"})') },
    { name: "early-mixed-history", assertion: "kept selected Settings cumulative lexical batches", source: original.replace('let lane: Promise<void>', 'let incomingHistory: JsonObject | undefined; let lane: Promise<void>').replace('const targets: SyncReceiveKey[] = []', 'incomingHistory = records.sync as JsonObject; const targets: SyncReceiveKey[] = []').replace('repairedHistory(latest.history, [received])', 'repairedHistory(incomingHistory ?? latest.history, [received])') },
    { name: "kept-timer-incoming", assertion: "kept timer remains outbound-only", source: original.replace('await automatic(current.event, false)', 'await automatic(current.event, true)') },
    { name: "kept-echo", assertion: "kept Q-only send at 5000", source: original.replace('let plan = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "flush" } })', 'const echo = await deps.sync.get(); let plan = planSyncWrite({ local: records, sync: Object.fromEntries(Object.entries(echo).filter(([name]) => name !== "s:filter:AAAAAAAAAAAAAAAA:PL_K")), intent: { kind: "flush" } })').replace('const replanned = planSyncWrite({ local: latest, sync: remote, intent: { kind: "flush" } })', 'const replanned = plan') },
    { name: "bypass-blocking-Setup", assertion: "kept global attempt cannot bypass blocking document", source: original.replace('let plan = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "flush" } })', 'const bypass = await deps.sync.get(); let plan = planSyncWrite({ local: records, sync: Object.fromEntries(Object.entries(bypass).filter(([name, raw]) => !(name === "s:setup:AAAAAAAAAAAAAAAA" && raw && typeof raw === "object" && "gen" in raw && raw.gen === "a1"))), intent: { kind: "flush" } })').replace('const replanned = planSyncWrite({ local: latest, sync: remote, intent: { kind: "flush" } })', 'const replanned = plan') }
  ]
}

test("kept receiver wrong alternatives fail at intended observations without checkout mutations", async () => {
  const path = resolve(import.meta.dir, "local-filter-writer.ts"), original = await readFile(path, "utf8")
  for (const fault of keptIncomingFaults(original)) {
    expect(fault.source).not.toBe(original)
    const built = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true, plugins: [{ name: fault.name, setup(builder) {
      builder.onLoad({ filter: /\/local-filter-writer\.ts$/ }, () => ({ loader: "ts", contents: fault.source }))
    } }] })
    expect(built.success).toBe(true)
    const bytes = await built.outputs[0]!.text()
    const script = `(async()=>{const isPlaylistId=${isPlaylistId.toString()};const module={exports:{}};${bytes};try{await (${keptIncomingAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA");return {caught:false}}catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0],message:error.message}}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect({ name: fault.name, caught: observed.caught, assertion: observed.assertion }).toEqual({ name: fault.name, caught: true, assertion: fault.assertion })
  }
})

test("kept matrix executes saved minified core bytes in two fresh guarded Node realms", async () => {
  const source = await keptIncomingAcceptance(createLocalFilterWriter, acct)
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "local-filter-writer.ts")], target: "browser", format: "cjs", minify: true })
  expect(built.success).toBe(true)
  const bytes = await built.outputs[0]!.text()
  for (let realm = 0; realm < 2; realm++) {
    const script = `(async()=>{let accesses=0;const names=["Date","performance","setTimeout","clearTimeout","setInterval","clearInterval","browser","chrome","fetch","crypto","Bun","process","localStorage","indexedDB","navigator","WebSocket"];for(const name of names)Object.defineProperty(globalThis,name,{get(){accesses++;throw Error("guard "+name)}});Object.defineProperty(Math,"random",{get(){accesses++;throw Error("guard random")}});const isPlaylistId=${isPlaylistId.toString()};const module={exports:{}};${bytes};const result=await (${keptIncomingAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA");if(accesses)throw Error("ambient access");let controls=0;for(const name of [...names,"random"]){let caught;try{name==="random"?Math.random:globalThis[name]}catch(error){caught=error.message}if(caught!=="guard "+name)throw Error("inactive guard "+name);controls++}return {result,controls,accessesBeforeControls:0}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect(observed.result).toEqual(source); expect(observed.controls).toBe(17); expect(observed.accessesBeforeControls).toBe(0)
  }
})

async function setupIncomingAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey) {
  let assertions = 0
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) {
    assertions++
    if (stable(actual) !== stable(expected)) throw Error(label + ": " + stable(actual) + " != " + stable(expected))
  }
  const S = "doc:setup:AAAAAAAAAAAAAAAA", K = "doc:filter:AAAAAAAAAAAAAAAA:PL_K", P = "doc:filter:AAAAAAAAAAAAAAAA:PL_P"
  const Q = "doc:filter:AAAAAAAAAAAAAAAA:PL_Q", T = "doc:settings", B = S.replace("doc:", "s:"), C = Q.replace("doc:", "s:")
  const playlist = "PL_K"
  if (!isPlaylistId(playlist)) throw Error("Invalid synthetic playlist")
  const key = { kind: "setup", acct } as const, filterKey = { kind: "filter", acct, playlist } as const
  const local = JSON.parse('{"schema":1,"device":{"id":"synthetic-local","consent":{"v":1,"at":0},"syncOn":true,"lastAccount":"AAAAAAAAAAAAAAAA","extension":{"keep":true}},"sync":{"joined":"synthetic-history","pushed":{"doc:setup:AAAAAAAAAAAAAAAA":"a0","doc:filter:AAAAAAAAAAAAAAAA:PL_K":"k0","doc:filter:AAAAAAAAAAAAAAAA:PL_P":"p0","doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q0"},"status":"ok","editedSinceOff":false,"extension":{"keep":true}},"doc:setup:AAAAAAAAAAAAAAAA":{"v":1,"gen":"a0","at":10,"by":"synthetic-local","data":{"autoAdd":[{"pl":"PL_P","takes":"both"}],"gather":"PL_OLD"},"oldOnly":true},"doc:filter:AAAAAAAAAAAAAAAA:PL_K":{"v":1,"gen":"k0","at":10,"by":"synthetic-local","data":{"on":false,"channels":[]}},"doc:filter:AAAAAAAAAAAAAAAA:PL_P":{"v":1,"gen":"p0","at":10,"by":"synthetic-local","data":{}},"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":{"v":1,"gen":"q1","at":15,"by":"synthetic-local","data":{"on":true}},"cache:AAAAAAAAAAAAAAAA":{"fixture":"retain"},"progress:AAAAAAAAAAAAAAAA:0":{"fixture":"retain"}}')
  const incoming = JSON.parse('{"v":1,"gen":"a1","at":30,"by":"synthetic-remote","__proto__":{"keep":true},"extension":{"future":[null,1]},"data":{"autoAdd":[{"pl":"PL_N","takes":"shorts","pct":40}],"gather":"PL_G","targets":{"gone99":"PL_T"},"marks":{"PL_UNUSED":"full"},"future":{"constructor":{"keep":true},"__proto__":{"keep":true}}}}')
  const remote = { "s:meta": { v: 1, id: "synthetic-history", created: 0, extension: { keep: true } }, [B]: clone(incoming),
    [K.replace("doc:", "s:")]: clone(local[K]), [P.replace("doc:", "s:")]: clone(local[P]),
    [C]: { v: 1, gen: "q0", at: 5, by: "synthetic-local", data: {} } }
  const expectedSet = { [S]: incoming, sync: { ...local.sync, pushed: { ...local.sync.pushed, [S]: "a1" } } }
  const adopted = { kind: "adopted", received: { key, name: S, gen: "a1", document: incoming } }
  const unavailable = (reason: string) => ({ kind: "unavailable", reason })
  const settle = async () => { for (let i = 0; i < 1800; i++) await Promise.resolve() }
  function harness(records = clone(local), synced: Record<string, unknown> = clone(remote)) {
    let time = 0, generation = 0, wall = 0, clock = 0, serial = 0, lr = 0, rr = 0
    const reads: string[] = [], sets: unknown[] = [], writes: unknown[] = [], results: unknown[] = []
    const listeners = new Set<() => void>(), timers = new Map<number, { due: number; run: () => void }>()
    const hooks = { io: async (_stage: string) => {}, afterSet: async () => {}, snapshot: (raw: Record<string, unknown>) => clone(raw) }
    const writer = create({ claim: { kind: "unavailable" }, local: {
      async get() { const stage = "L" + lr++; reads.push(stage); await hooks.io(stage); return hooks.snapshot(records) },
      async set(items) { reads.push("set"); await hooks.io("set"); sets.push(clone(items)); Object.assign(records, clone(items)); await hooks.afterSet() }
    }, sync: {
      async get() { const stage = "R" + rr++; reads.push(stage); await hooks.io(stage); return hooks.snapshot(synced) },
      async set(items) { writes.push(clone(items)); Object.assign(synced, clone(items)); for (const run of listeners) run() },
      subscribe(run) { listeners.add(run); return () => { listeners.delete(run) } }
    }, now: () => { wall++; return time + 100 }, generation: () => { generation++; return "unexpected-generation" },
    syncClock: { now: () => { clock++; return time }, wallNow: () => 1000000, after(ms, run) { const id = ++serial; timers.set(id, { due: time + ms, run }); return () => { timers.delete(id) } } },
    onSyncResult: result => { results.push(result) } })
    return { writer, records, synced, reads, sets, writes, results, listeners, timers, hooks, counts: () => ({ generation, wall, clock }),
      event: async () => { for (const run of listeners) run(); await settle() },
      fire: async (at: number) => { time = at; for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.run() } await settle() },
      change: () => writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist: filterKey.playlist,
        desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }) }
  }
  const first = harness()
  {
    const h = first, counts = h.counts()
    const result = await h.writer.receiveSyncDocument(key)
    equal(h.records[S], incoming, "Setup raw special keys omissions and dangling references")
    equal(result.kind, "adopted", "Setup ordinary replacement adopted at L3")
    equal(result, adopted, "Setup exact received record")
    equal(h.sets, [expectedSet], "Setup one exact target-history batch")
    equal(h.records, { ...local, ...expectedSet }, "Setup raw special keys omissions and dangling references")
    equal(Object.hasOwn(h.records[S], "__proto__"), true, "Setup own special envelope key")
    equal(Object.hasOwn(h.records[S].data.future, "__proto__"), true, "Setup own nested special key")
    equal(h.reads, ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"], "Setup finite IO trace")
    equal(h.counts(), counts, "Setup no generation stamp or scheduling clock")
    equal(h.synced, remote, "Setup remote exact"); equal(h.writes, [], "Setup manual no echo")
    equal(await h.writer.receiveSyncDocument(key), { kind: "idle" }, "Setup immediate repeat idle")
    const next = harness(clone(h.records)); equal(await next.writer.receiveSyncDocument(key), { kind: "idle" }, "Setup fresh owner repeat idle")
    equal(h.sets, [expectedSet], "Setup repeat no set"); await h.writer.dispose(); await next.writer.dispose()
  }
  const empty = [{}, { label: null, autoAdd: [], targets: {}, quickSave: null, musicSave: null, gather: null, marks: {} },
    { label: { name: "Only label" } }, { marks: { PL_UNUSED: "full" } }, { targets: { gone99: "PL_T" } }, { targets: { valid1: "PL_T" } }]
  const positive = [{ gather: "PL_G" }, { quickSave: "WL" }, { musicSave: "PL_M" }, { autoAdd: [{ pl: "PL_N" }] }]
  const inventories = ["kept", "none", "future", "tombstone", "malformed", "incomplete"]
  function inventory(h: ReturnType<typeof harness>, kind: string) {
    for (const name of [K, P, Q]) { delete h.records[name]; delete h.records.sync.pushed[name]; delete h.synced[name.replace("doc:", "s:")] }
    if (kind !== "none") {
      const filter = kind === "future" ? { ...local[K], v: 2 } : kind === "tombstone" ? { v: 1, gen: "dead", at: 10, by: "b", deleted: true }
        : kind === "malformed" ? { ...local[K], data: { on: 2 } } : clone(local[K])
      h.records[K] = filter; h.synced[K.replace("doc:", "s:")] = kind === "incomplete" ? { v: 1, gen: "k0", at: 10, by: "b", n: 2 } : clone(filter)
    }
  }
  for (const [index, data] of empty.entries()) for (const kind of inventories) {
    const h = harness(); inventory(h, kind); h.synced[B] = { ...clone(incoming), data: clone(data) }
    h.records[T] = { v: 1, gen: "t0", at: 1, by: "b", data: { shortcuts: { list: [{ id: "valid1", key: null, label: "Valid", watchLaterOnEveryAccount: false }] } } }
    const before = clone(h.records)
    equal(await h.writer.receiveSyncDocument(key), unavailable("account-context"), "Setup deferred incoming " + index + kind)
    equal(h.reads, ["L0", "R0"], "Setup deferred stops at R0"); equal(h.records, before, "Setup deferred no acknowledgement or cascade")
    equal(h.sets, [], "Setup deferred no set"); await h.writer.dispose()
  }
  for (const data of empty) {
    const h = harness(); h.records[S].data = clone(data); h.synced[B] = clone(h.records[S])
    equal(await h.writer.receiveSyncDocument(key), unavailable("account-context"), "Setup deferred before exact-match idle")
    equal(h.sets, [], "Setup empty exact match no repair"); await h.writer.dispose()
  }
  for (const data of positive) for (const extension of [{}, { label: { name: "  Keep label  " }, marks: { PL_UNUSED: "full" }, targets: { gone99: "PL_T" }, extra: { keep: true } }]) {
    const h = harness(), raw = { ...clone(incoming), data: { ...clone(data), ...clone(extension) } }; h.synced[B] = raw
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Setup positive sparse adoption " + Object.keys(data)[0])
    equal(h.records[S], raw, "Setup positive sparse raw omissions"); await h.writer.dispose()
  }
  for (const data of [...empty, { gather: "PL_OLD" }]) for (const kind of inventories) {
    const h = harness(); inventory(h, kind); h.records[S].data = clone(data); h.synced[B] = { ...clone(incoming), data: { gather: "PL_G" } }
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Setup local sparse to incoming gather " + kind)
    equal(h.records[S], h.synced[B], "Setup no local retention prerequisite"); await h.writer.dispose()
  }
  {
    const h = harness(); delete h.records.device.lastAccount; inventory(h, "none"); h.synced[B] = { ...clone(incoming), data: { gather: "PL_G" } }
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Setup no live account requirement"); await h.writer.dispose()
  }
  for (const value of [undefined, null, { ...local[S], v: 2 }, { v: 1, gen: "dead", at: 1, by: "b", deleted: true }, { ...local[S], data: { autoAdd: 2 } }]) {
    const h = harness(); if (value === undefined) delete h.records[S]; else h.records[S] = value
    equal(await h.writer.receiveSyncDocument(key), unavailable("document"), "Setup unsupported local before sync")
    equal(h.reads, ["L0"], "Setup unsupported local no remote IO"); equal(h.sets, [], "Setup absent target never created"); await h.writer.dispose()
  }
  for (const fault of ["pending", "same-gen", "equal", "older", "future", "deleted", "malformed", "incomplete", "non-json", "reset", "history", "overbudget"]) {
    const h = harness()
    if (fault === "pending") h.records[S].gen = "pending"
    if (fault === "same-gen") h.synced[B] = { ...clone(incoming), gen: "a0" }
    if (fault === "equal" || fault === "older") h.synced[B] = { ...clone(incoming), at: fault === "equal" ? 10 : 9 }
    if (fault === "future") h.synced[B] = { ...clone(incoming), v: 2 }
    if (fault === "deleted") h.synced[B] = { v: 1, gen: "dead", at: 30, by: "b", deleted: true }
    if (fault === "malformed") h.synced[B] = { ...clone(incoming), data: { gather: 2 } }
    if (fault === "incomplete") h.synced[B] = { v: 1, gen: "a1", at: 30, by: "b", n: 2 }
    if (fault === "non-json") { h.synced.occupancy = undefined; h.hooks.snapshot = raw => raw }
    if (fault === "reset") h.synced["s:meta"] = { ...remote["s:meta"], reset: true }
    if (fault === "history") h.synced["s:meta"] = { ...remote["s:meta"], id: "other" }
    if (fault === "overbudget") h.synced.occupancy = "x".repeat(99000)
    const result = await h.writer.receiveSyncDocument(key)
    equal(result.kind, fault === "overbudget" ? "adopted" : "unavailable", "Setup conflict and inventory " + fault)
    if (fault !== "overbudget") equal(h.sets, [], "Setup conflict no set " + fault)
    if (fault === "pending") equal(result, unavailable("pending"), "Setup own pending reason")
    if (["same-gen", "equal", "older"].includes(fault)) equal(result, unavailable("conflict"), "Setup strict conflict reason")
    await h.writer.dispose()
  }
  {
    const h = harness(); await h.writer.startSync()
    equal(h.sets, [expectedSet], "Setup automatic start adoption")
    equal(h.results, [{ kind: "deferred", notBefore: 5000 }], "Setup global Q deferred")
    await h.fire(4999); equal(h.writes, [], "Setup Q pacing at 4999")
    await h.fire(5000); equal(h.writes, [{ [C]: local[Q] }], "Setup Q-only send no echo")
    equal(h.records.sync.pushed, { ...local.sync.pushed, [S]: "a1", [Q]: "q1" }, "Setup cumulative Q repair")
    await h.writer.dispose()
  }
  {
    const h = harness(); h.synced[B] = { ...clone(incoming), data: {} }; await h.writer.startSync(); await h.fire(5000)
    equal(h.records[S], local[S], "Setup deferred debt keeps old target"); equal(h.writes, [], "Setup global unresolved debt blocks Q")
    equal(h.sets, [], "Setup deferred debt no local effects"); equal(h.results.at(-1), { kind: "unavailable" }, "Setup global debt unavailable")
    await h.writer.dispose()
  }
  {
    const h = harness(); h.synced[B] = clone(local[S]); await h.writer.startSync(); h.synced[B] = clone(incoming)
    const reads = h.reads.length; await h.fire(5000)
    equal(h.records[S], local[S], "Setup timer remains outbound-only")
    equal(h.reads.length - reads, 2, "Setup timer no enumeration"); equal(h.writes, [], "Setup timer cannot bypass incoming debt")
    await h.event(); equal(h.records[S], incoming, "Setup genuine event adoption"); await h.writer.dispose()
  }
  {
    const h = harness(), k1 = { ...clone(local[K]), gen: "k1", at: 20 }, p1 = { ...clone(local[P]), gen: "p1", at: 20 }
    const t0 = { v: 1, gen: "t0", at: 10, by: "b", data: {} }, t1 = { ...t0, gen: "t1", at: 20, data: { theme: "dark" } }
    h.records[T] = t0; h.records.sync.pushed[T] = "t0"
    h.synced[K.replace("doc:", "s:")] = k1; h.synced[P.replace("doc:", "s:")] = p1; h.synced["s:settings"] = t1
    h.synced["s:setup:BBBBBBBBBBBBBBBB"] = clone(incoming); h.synced["s:filter:BBBBBBBBBBBBBBBB:PL_X"] = k1
    const history = clone(h.records.sync), pushed = history.pushed
    await h.writer.startSync()
    equal(h.sets, [
      { [K]: k1, sync: { ...history, pushed: { ...pushed, [K]: "k1" } } },
      { [P]: p1, sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1" } } },
      { [T]: t1, sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1", [T]: "t1" } } },
      { [S]: incoming, sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1", [T]: "t1", [S]: "a1" } } }
    ], "Setup K P T S cumulative lexical batches")
    equal(Object.hasOwn(h.records, "doc:setup:BBBBBBBBBBBBBBBB"), false, "Setup remote-only never created")
    equal(Object.hasOwn(h.records, "doc:filter:AAAAAAAAAAAAAAAA:PL_N"), false, "Setup newly selected missing Filter never created")
    equal(await h.change(), unavailable("account-context"), "Setup kept UI selection remains required")
    const pl = "PL_P"; if (!isPlaylistId(pl)) throw Error("Invalid fixture")
    equal(await h.writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist: pl, desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }), unavailable("account-context"), "Setup unticked P UI remains refused")
    await h.writer.dispose()
  }
  for (const reverse of [false, true]) {
    const h = harness(); h.synced[B] = clone(local[S])
    const k1 = { ...clone(local[K]), gen: "k1", at: 20 }; h.synced[K.replace("doc:", "s:")] = k1
    if (!reverse) equal((await h.writer.receiveSyncDocument(filterKey)).kind, "adopted", "Setup kept Filter arrives first")
    h.synced[B] = { ...clone(incoming), data: { autoAdd: [{ pl: "PL_K" }] } }
    equal((await h.writer.receiveSyncDocument(key)).kind, "adopted", "Setup selection event independent order")
    if (reverse) equal((await h.writer.receiveSyncDocument(filterKey)).kind, "adopted", "Setup kept Filter arrives later")
    const pl = "PL_P"; if (!isPlaylistId(pl)) throw Error("Invalid fixture")
    h.synced[P.replace("doc:", "s:")] = { ...clone(local[P]), gen: "p1", at: 20 }
    equal((await h.writer.receiveSyncDocument({ kind: "filter", acct, playlist: pl })).kind, "adopted", "Setup unticked P remains receivable")
    await h.writer.dispose()
  }
  for (const targetOnly of [false, true]) {
    const h = harness(); h.synced[B] = { ...clone(incoming), data: targetOnly ? { targets: { gone99: "PL_T" } } : { gather: "PL_G", targets: { gone99: "PL_T" } } }
    const raw = clone(h.synced[B]), initial = clone(h.records[S])
    h.records[T] = { v: 1, gen: "t0", at: 10, by: "b", data: {} }; h.records.sync.pushed[T] = "t0"
    equal((await h.writer.receiveSyncDocument(key)).kind, targetOnly ? "unavailable" : "adopted", "Setup before referenced Settings arrival")
    for (const [gen, at, list] of [["t1", 20, [{ id: "gone99", key: null, label: "Later", watchLaterOnEveryAccount: false }]], ["t2", 40, []]] as const) {
      h.synced["s:settings"] = { v: 1, gen, at, by: "b", data: { shortcuts: { list: clone(list) } } }
      equal((await h.writer.receiveSyncDocument({ kind: "settings" })).kind, "adopted", "Setup independent actual Settings arrival " + gen)
      equal((await h.writer.receiveSyncDocument(key)).kind, targetOnly ? "unavailable" : "idle", "Setup Settings arrival changes no intrinsic decision")
      equal(h.records[S], targetOnly ? initial : raw, "Setup dangling reference stays raw across Settings arrivals")
    }
    await h.writer.dispose()
  }
  for (const stage of ["R0", "L1", "R1", "L2", "set", "L3", "R2"]) for (const field of [S, "sync", "device"]) {
    const h = harness(); let changed = false
    const mutate = () => { changed = true; h.records[field].unknown = { stale: true } }
    if (stage === "set") h.hooks.afterSet = async () => { mutate() }
    else h.hooks.io = async current => { if (!changed && current === stage) mutate() }
    const result = await h.writer.receiveSyncDocument(key)
    equal(changed, true, "Setup stale stage reached " + stage + field)
    equal(result.kind, ["set", "L3"].includes(stage) ? "unconfirmed" : stage === "R2" ? "adopted" : "unavailable", "Setup target authority stale " + stage + field)
    equal(h.sets.length, ["set", "L3", "R2"].includes(stage) ? 1 : 0, "Setup no stale precommit overwrite " + stage + field)
    await h.writer.dispose()
  }
  for (const stage of ["R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); h.hooks.snapshot = raw => raw
    h.hooks.io = async current => { if (current === stage) h.records[S].extensionOnly = { changed: true } }
    const result = await h.writer.receiveSyncDocument(key)
    equal(result.kind, stage === "R2" ? "adopted" : stage === "L3" ? "unconfirmed" : stage === "set" ? "adopted" : "unavailable", "Setup independently captured mutable target " + stage)
    await h.writer.dispose()
  }
  for (const stage of ["R1", "R2"]) for (const field of ["metadata", "candidate"]) {
    const h = harness(); h.hooks.io = async current => { if (current === stage) {
      if (field === "metadata") h.synced["s:meta"] = { ...remote["s:meta"], extension: { keep: false } }
      else h.synced[B] = { ...clone(incoming), extension: { keep: false } }
    } }
    equal((await h.writer.receiveSyncDocument(key)).kind, stage === "R2" ? "unconfirmed" : "unavailable", "Setup exact remote baseline " + stage + field)
    await h.writer.dispose()
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(), marker = new Error("synthetic IO " + stage); h.hooks.io = async current => { if (current === stage) throw marker }
    let result, caught
    try { result = await h.writer.receiveSyncDocument(key) } catch (error) { caught = error }
    if (["L0", "R0", "L1", "R1", "L2"].includes(stage)) equal(caught === marker, true, "Setup original precommit Error " + stage)
    else {
      equal(result?.kind, stage === "set" ? "local-set-failed" : "unconfirmed", "Setup error category " + stage)
      equal(result && ("error" in result ? result.error === marker : "cause" in result && result.cause.kind === "read-failed" && result.cause.error === marker), true, "Setup original postcommit Error " + stage)
    }
    await h.writer.dispose()
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); let entered = false, release!: () => void
    const gate = new Promise<void>(done => { release = done })
    h.hooks.io = async current => { if (current === stage) { entered = true; await gate } }
    const receive = h.writer.receiveSyncDocument(key); await settle(); equal(entered, true, "Setup held IO entered " + stage)
    const before = [...h.reads], manual = h.writer.receiveSyncDocument(key), edit = h.change(), start = h.writer.startSync(), flush = h.writer.flushSync()
    await h.event(); await h.fire(5000); equal(h.reads, before, "Setup same lane held IO " + stage)
    release(); equal(await receive, adopted, "Setup held adoption " + stage); await manual; await edit; await start; await flush
    await h.writer.dispose()
  }
  for (const action of ["off", "dispose"]) for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); let entered = false, release!: () => void
    const gate = new Promise<void>(done => { release = done })
    h.hooks.io = async current => { if (current === stage) { entered = true; await gate } }
    const receive = h.writer.receiveSyncDocument(key); await settle(); equal(entered, true, "Setup authority held " + action + stage)
    let dispose: Promise<void> | undefined
    if (action === "dispose") dispose = h.writer.dispose()
    else { h.records.device.syncOn = false; h.records.sync.status = "off" }
    release(); const result = await receive; await dispose
    equal(result.kind, stage === "R2" && action === "off" ? "adopted" : ["set", "L3", "R2"].includes(stage) ? "unconfirmed" : "unavailable", "Setup finite off disposal boundary " + action + stage)
    await h.writer.dispose()
  }
  for (const stage of ["R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(), pending = { ...clone(local[Q]), gen: "q-external", extension: { keep: true } }
    h.hooks.io = async current => { if (current === stage) h.records[Q] = clone(pending) }
    equal(await h.writer.receiveSyncDocument(key), adopted, "Setup independent pending Q change " + stage)
    equal(h.records[Q], pending, "Setup pending Q never overwritten " + stage)
    equal(h.records.sync.pushed[Q], "q0", "Setup pending Q never acknowledged " + stage); await h.writer.dispose()
  }
  for (const stage of ["enumeration", "L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); h.synced[B] = clone(local[S])
    for (const name of [K, P]) { delete h.records[name]; delete h.records.sync.pushed[name]; delete h.synced[name.replace("doc:", "s:")] }
    await h.writer.startSync()
    const due = [...h.timers.values()][0]; equal(Boolean(due), true, "Setup healthy due timer before hold " + stage)
    const lr = h.reads.filter(name => name.startsWith("L")).length, rr = h.reads.filter(name => name.startsWith("R")).length
    const boundary = { enumeration: "L" + lr, L0: "L" + (lr + 2), R0: "R" + (rr + 1), L1: "L" + (lr + 3),
      R1: "R" + (rr + 2), L2: "L" + (lr + 4), set: "set", L3: "L" + (lr + 5), R2: "R" + (rr + 3) }[stage]
    let entered = false, release!: () => void
    const gate = new Promise<void>(done => { release = done })
    h.synced[B] = clone(incoming); h.hooks.io = async current => { if (current === boundary) { entered = true; await gate } }
    void h.event(); await settle(); equal(entered, true, "Setup automatic held IO entered " + stage)
    const before = [...h.reads], manual = h.writer.receiveSyncDocument(key), edit = h.change(), start = h.writer.startSync(), flush = h.writer.flushSync()
    void h.event(); await h.fire(5000); equal(h.reads, before, "Setup automatic same lane all queued IO " + stage)
    release(); await manual; await edit; await start; await flush; await settle()
    equal(h.records[S], incoming, "Setup automatic held adoption before timer " + stage)
    equal(h.writes, [{ [C]: local[Q] }], "Setup automatic held Q-only outbound " + stage); await h.writer.dispose()
  }
  for (const stage of ["R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(); for (const name of [K, P, Q]) { delete h.records[name]; delete h.records.sync.pushed[name]; delete h.synced[name.replace("doc:", "s:")] }
    h.synced[B] = clone(local[S]); await h.writer.startSync()
    const lr = h.reads.filter(name => name.startsWith("L")).length, rr = h.reads.filter(name => name.startsWith("R")).length
    const boundary = { R0: "R" + rr, L1: "L" + (lr + 2), R1: "R" + (rr + 1), L2: "L" + (lr + 3), set: "set", L3: "L" + (lr + 4), R2: "R" + (rr + 2) }[stage]
    const marker = new Error("automatic Setup failure " + stage)
    h.synced[B] = clone(incoming); h.hooks.io = async current => { if (current === boundary) throw marker }
    await h.event(); equal(h.listeners.size, 0, "Setup automatic failure unsubscribes " + stage); equal(h.timers.size, 0, "Setup automatic failure cancels ticket " + stage)
    h.hooks.io = async () => {}
    equal((await h.writer.receiveSyncDocument(key)).kind, ["L3", "R2"].includes(stage) ? "idle" : "adopted", "Setup stopped manual recovery " + stage)
    const reads = [...h.reads]; await h.writer.startSync(); await h.event(); await h.fire(5000)
    equal(h.reads, reads, "Setup manual success cannot restart automatic lifetime " + stage); await h.writer.dispose()
  }
  return { assertions, literals: { local, remote, incoming, expectedSet }, observed: { local: first.records, remote: first.synced, reads: first.reads, sets: first.sets, writes: first.writes } }
}

test("intrinsic incoming Setup preserves raw targets through the finite shared owner", async () => {
  expect((await setupIncomingAcceptance(createLocalFilterWriter, acct)).assertions).toBeGreaterThan(400)
})

async function setupFixtureAcceptance(input: Awaited<ReturnType<typeof setupIncomingAcceptance>>["literals"], mode: string, execute: () => void) {
  let assertions = 0, time = 0, serial = 0, lookups = 0, stamps = 0, generations = 0, sessionAccesses = 0
  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  function equal(actual: unknown, expected: unknown, label: string) { assertions++; if (stable(actual) !== stable(expected)) throw Error(label + ": " + stable(actual) + " != " + stable(expected)) }
  const S = "doc:setup:AAAAAAAAAAAAAAAA", K = "doc:filter:AAAAAAAAAAAAAAAA:PL_K", P = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", Q = "doc:filter:AAAAAAAAAAAAAAAA:PL_Q", T = "doc:settings"
  const B = S.replace("doc:", "s:"), local = clone(input.local), remote = clone(input.remote)
  const session = { skips: { AAAAAAAAAAAAAAAA: ["synthetic-video"] }, cooldown: { AAAAAAAAAAAAAAAA: 1 }, recent: { AAAAAAAAAAAAAAAA: ["synthetic"] }, gather: { AAAAAAAAAAAAAAAA: ["synthetic"] }, pause: true }
  const retained = Object.fromEntries(Array.from({ length: 16 }, (_, shard) => [`progress:AAAAAAAAAAAAAAAA:${shard}`, { fixture: "retain" }]))
  Object.assign(local, clone(retained))
  const sets: unknown[] = [], writes: unknown[] = [], timers = new Map<number, { at: number; run: () => void }>()
  const settle = async () => { for (let i = 0; i < 2200; i++) await Promise.resolve() }
  function event() {
    const listeners = new Set<(...args: unknown[]) => void>()
    return { addListener: (run: (...args: unknown[]) => void) => { listeners.add(run) }, removeListener: (run: (...args: unknown[]) => void) => { listeners.delete(run) },
      emit: (...args: unknown[]) => { for (const run of listeners) run(...args) }, count: () => listeners.size }
  }
  const changed = event(), syncChanged = event()
  function area(records: Record<string, unknown>, calls: unknown[], sync = false) {
    return { onChanged: sync ? syncChanged : event(),
      async get(keys: readonly string[] | string | null) { const names = keys == null ? Object.keys(records) : typeof keys === "string" ? [keys] : keys; return clone(Object.fromEntries(names.filter(name => Object.hasOwn(records, name)).map(name => [name, records[name]]))) },
      async set(items: Record<string, unknown>) { calls.push(clone(items)); Object.assign(records, clone(items)); changed.emit({}, sync ? "sync" : "local"); if (sync) syncChanged.emit({}) },
      async remove() { throw Error("forbidden remove") }, async clear() { throw Error("forbidden clear") } }
  }
  if (["event", "chunks", "timer"].includes(mode)) remote[B] = clone(local[S])
  if (mode === "sparse-local") local[S].data = {}
  if (mode === "deferred") remote[B] = { ...clone(input.incoming), data: {} }
  if (mode === "mixed") {
    local[T] = { v: 1, gen: "t0", at: 10, by: "b", data: {} }; local.sync.pushed[T] = "t0"
    remote["s:settings"] = { ...clone(local[T]), gen: "t1", at: 20 }
    for (const [name, gen] of [[K, "k1"], [P, "p1"]]) remote[name!.replace("doc:", "s:")] = { ...clone(local[name!]), gen, at: 20 }
  }
  const before = clone(local), beforeSession = clone(session)
  const storage = { local: area(local, sets), sync: area(remote, writes, true), onChanged: changed,
    get session(): never { sessionAccesses++; throw Error("session storage forbidden") } }
  Object.assign(globalThis, { chrome: { storage,
    runtime: { id: "synthetic", getURL: (path: string) => "chrome-extension://synthetic" + path, onMessage: event() },
    windows: { async get() { lookups++; throw Error("account lookup forbidden") } }, permissions: { async contains() { lookups++; throw Error("permission lookup forbidden") } }, extension: { async isAllowedIncognitoAccess() { lookups++; throw Error("permission lookup forbidden") } } },
    performance: { now: () => time }, setTimeout(run: () => void, ms: number) { const id = ++serial; timers.set(id, { at: time + ms, run }); return id }, clearTimeout: (id: number) => { timers.delete(id) },
    addEventListener() {}, Date: { now() { stamps++; return 1000000 + time } }, crypto: { randomUUID() { generations++; throw Error("generation forbidden") } } })
  execute(); const fixture = Reflect.get(globalThis, "localFilterFixture")
  equal(typeof fixture.receiveSetup, "function", "actual consumed receiveSetup exists")
  for (const name of ["doc:settings", K, "doc:setup:invalid", S + ":extra", "s:setup:AAAAAAAAAAAAAAAA"]) {
    let caught = false; try { await fixture.receiveSetup(name) } catch (error) { caught = error instanceof TypeError }
    equal(caught, true, "actual receiveSetup rejects noncanonical key"); equal(fixture.reads, [], "actual invalid Setup before IO")
  }
  if (mode === "manual" || mode === "sparse-local") {
    const result = await fixture.receiveSetup(S)
    equal(result.kind, "adopted", "actual manual Setup adoption")
    equal(await fixture.receiveSetup(S), { kind: "idle" }, "actual Setup manual repeat idle")
    await fixture.freshOwner(); equal(await fixture.receiveSetup(S), { kind: "idle" }, "actual Setup fresh owner idle")
  }
  fixture.receiveFilter = () => { throw Error("manual Filter proxy forbidden") }
  fixture.receiveSettings = () => { throw Error("manual Settings proxy forbidden") }
  fixture.receiveSetup = () => { throw Error("manual Setup proxy forbidden") }
  fixture.flush = () => { throw Error("manual flush proxy forbidden") }
  await fixture.start()
  const fire = async (at: number) => { time = at; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.run() } await settle() }
  let expected = clone(input.incoming)
  if (["event", "chunks", "timer"].includes(mode)) {
    equal(sets, [], "actual Setup initial idle")
    if (mode === "chunks") {
      expected = { ...clone(input.incoming), data: { ...clone(input.incoming.data), large: "x".repeat(9000) } }
      await fixture.seedSyncDocuments({ [S]: expected })
      const chunkName = Object.keys(remote).find(name => name.startsWith(B + "@a1.") && name.endsWith(".1"))
      if (!chunkName) throw Error("Missing actual encoded Setup chunk")
      const chunk = remote[chunkName]; delete remote[chunkName]; syncChanged.emit({}); await settle()
      equal(local[S], before[S], "actual incomplete Setup chunks keep a0")
      remote[chunkName] = chunk; syncChanged.emit({}); await settle()
      equal(local[S], expected, "actual complete encoded Setup chunk event")
    } else {
      remote[B] = clone(input.incoming)
      if (mode === "timer") { await fire(5000); equal(local[S], before[S], "actual Setup timer outbound-only"); equal(writes, [], "actual Setup timer cannot bypass debt") }
      syncChanged.emit({}); await settle(); equal(local[S], expected, "actual automatic Setup event adoption")
    }
  } else equal(local[S], mode === "deferred" ? before[S] : expected, "actual automatic Setup start adoption")
  if (mode === "mixed") {
    const history = before.sync, pushed = history.pushed
    equal(sets, [
      { [K]: remote[K.replace("doc:", "s:")], sync: { ...history, pushed: { ...pushed, [K]: "k1" } } },
      { [P]: remote[P.replace("doc:", "s:")], sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1" } } },
      { [T]: remote["s:settings"], sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1", [T]: "t1" } } },
      { [S]: expected, sync: { ...history, pushed: { ...pushed, [K]: "k1", [P]: "p1", [T]: "t1", [S]: "a1" } } }
    ], "actual Setup K P T S cumulative batches")
  } else if (mode === "deferred") {
    equal(sets, [], "actual deferred Setup no writes"); equal(fixture.automaticResults.at(-1).result, { kind: "unavailable" }, "actual deferred Setup global unavailable")
  } else {
    const expectedSets: unknown[] = [{ [S]: expected, sync: { ...before.sync, pushed: { ...before.sync.pushed, [S]: "a1" } } }]
    if (mode === "timer") expectedSets.push({ sync: { ...before.sync, pushed: { ...before.sync.pushed, [S]: "a1" }, opaqueWrite: { gate: { kind: "pending", notBefore: 1065000 }, diagnostic: null } } }, { sync: { ...before.sync, pushed: { ...before.sync.pushed, [S]: "a1", [Q]: "q1" } } })
    equal(sets, expectedSets, "actual Setup sole target-history batch")
    if (mode === "timer") equal(writes, [{ [Q.replace("doc:", "s:")]: before[Q] }], "actual Setup delayed event sends only Q")
  }
  if (mode !== "chunks" && mode !== "timer") {
    await fire(4999); equal(writes, [], "actual Setup Q pacing 4999")
    await fire(5000); equal(writes, mode === "deferred" ? [] : [{ [Q.replace("doc:", "s:")]: before[Q] }], "actual Setup Q-only send without echo or debt bypass")
  }
  equal(local.device, before.device, "actual Setup Device and lastAccount exact")
  equal(session, beforeSession, "actual Setup synthetic session sentinels exact"); equal(sessionAccesses, 0, "actual Setup no session storage access")
  for (const [name, value] of Object.entries(retained)) equal(local[name], value, "actual Setup sixteen progress shards exact " + name)
  equal(local["cache:AAAAAAAAAAAAAAAA"], before["cache:AAAAAAAAAAAAAAAA"], "actual Setup cache exact")
  if (mode !== "mixed") { equal(local[K], before[K], "actual Setup kept Filter exact"); equal(local[P], before[P], "actual Setup unticked Filter exact") }
  equal(Object.hasOwn(local, "doc:filter:AAAAAAAAAAAAAAAA:PL_N"), false, "actual Setup selected missing Filter stays absent")
  equal(lookups, 0, "actual Setup no account or permission lookup"); equal(stamps > 0, true, "actual Setup wall bookkeeping retains exact incoming envelope stamps"); equal(generations, 0, "actual Setup no generation")
  equal(fixture.unhandledRejections, [], "actual Setup no unhandled rejections")
  await fixture.dispose(); equal(syncChanged.count(), 0, "actual Setup unsubscribed"); equal(timers.size, 0, "actual Setup timers disposed")
  return { mode, assertions, sets, writes, final: local, callbacks: fixture.automaticResults }
}

test("actual fixture receiveSetup start events and encoded chunks consume the same owner", async () => {
  const literals = (await setupIncomingAcceptance(createLocalFilterWriter, acct)).literals
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../../../tools/fixtures/local-filter-writer/background.ts")], target: "browser", format: "cjs", minify: true })
  expect(built.success).toBe(true)
  const bytes = await built.outputs[0]!.text()
  for (const mode of ["manual", "start", "event", "chunks", "mixed", "deferred", "timer", "sparse-local"]) {
    const script = `(async()=>{return (${setupFixtureAcceptance.toString()})(JSON.parse(${JSON.stringify(JSON.stringify(literals))}),${JSON.stringify(mode)},()=>{const module={exports:{}};${bytes}})})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect(observed.assertions).toBeGreaterThan(35)
  }
})

function setupIncomingFaults(original: string) {
  const predicate = 'setup.autoAdd.length > 0 || setup.quickSave !== null || setup.musicSave !== null || setup.gather !== null'
  const flush = 'let plan = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "flush" } })'
  return [
    { name: "admit-all", assertion: "Setup deferred incoming 0kept", source: original.replace(predicate, 'true') },
    { name: "label-retains", assertion: "Setup deferred incoming 2kept", source: original.replace(predicate, predicate + ' || setup.label !== null') },
    { name: "marks-retain", assertion: "Setup deferred incoming 3kept", source: original.replace(predicate, predicate + ' || Object.keys(setup.marks).length > 0') },
    { name: "targets-retain", assertion: "Setup deferred incoming 4kept", source: original.replace(predicate, predicate + ' || Object.keys(setup.targets).length > 0') },
    { name: "Filter-key-retains", assertion: "Setup deferred incoming 0kept", source: original.replace(predicate, predicate + ' || Object.keys(records).some(name => name.startsWith("s:filter:"))') },
    { name: "future-Filter-retains", assertion: "Setup deferred incoming 0future", source: original.replace(predicate, predicate + ' || Object.values(records).some(raw => raw && typeof raw === "object" && "v" in raw && raw.v === 2)') },
    { name: "omit-gather", assertion: "Setup positive sparse adoption gather", source: original.replace(predicate, 'setup.autoAdd.length > 0 || setup.quickSave !== null || setup.musicSave !== null') },
    { name: "selection-required", assertion: "Setup positive sparse adoption gather", source: original.replace(predicate, 'setup.autoAdd.length > 0') },
    { name: "live-account-required", assertion: "Setup no live account requirement", source: original.replace('if (key.kind === "setup") return { ...shared, selection: { kind: "setup" } } as const', 'if (key.kind === "setup") { if (!Object.hasOwn(ready.rawDevice, "lastAccount")) return unavailable("account-context"); return { ...shared, selection: { kind: "setup" } } as const }') },
    { name: "local-retention-required", assertion: "Setup local sparse to incoming gather kept", source: original.replace('if (key.kind === "setup") return { ...shared, selection: { kind: "setup" } } as const', 'if (key.kind === "setup") { const old = decodeSetup(raw.data); if (!(old.autoAdd.length || old.quickSave || old.musicSave || old.gather)) return unavailable("account-context"); return { ...shared, selection: { kind: "setup" } } as const }') },
    { name: "decoded-Setup", assertion: "Setup raw special keys omissions and dangling references", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = snapshot(JSON.parse(JSON.stringify(remote.candidate.value.document)))') },
    { name: "normalized-Setup", assertion: "Setup raw special keys omissions and dangling references", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = snapshot(remote.candidate.json); if (key.kind === "setup") { const prepared = prepareDocumentBody({kind:"setup",data:decodeSetup(document.data),context:{shortcutIds:new Set(),additionalChosenPlaylists:new Set()}}); if (prepared.kind === "prepared") document.data = prepared.data }') },
    { name: "merged-Setup", assertion: "Setup raw special keys omissions and dangling references", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = { ...snapshot(initial.raw), ...snapshot(remote.candidate.json) }') },
    { name: "Setup-as-supporting-baseline", assertion: "Setup ordinary replacement adopted at L3", source: original.replace('!sameSelection(post.selection)', '(!sameSelection(post.selection) || key.kind === "setup" && !sameSyncJson(post.raw, baseline.raw))') },
    { name: "no-target-precommit-equality", assertion: "Setup target authority stale R0doc:setup:AAAAAAAAAAAAAAAA", source: original.replace('sameSelection(current.selection) && sameSyncJson(current.raw, baseline.raw)', 'sameSelection(current.selection)') },
    { name: "split-Setup-history", assertion: "Setup one exact target-history batch", source: original.replace('await deps.local.set({ [name]: document, sync: next })', 'await deps.local.set({ [name]: document }); await deps.local.set({ sync: next })') },
    { name: "Setup-ack-Q", assertion: "Setup one exact target-history batch", source: original.replace('const next = repairedHistory(latest.history, [received])', 'const next = repairedHistory(latest.history, [received]); if (next && typeof next.pushed === "object" && next.pushed) Object.assign(next.pushed, {"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q1"})') },
    { name: "Setup-early-history", assertion: "Setup K P T S cumulative lexical batches", source: original.replace('let lane: Promise<void>', 'let incomingHistory: JsonObject | undefined; let lane: Promise<void>').replace('const targets: SyncReceiveKey[] = []', 'incomingHistory = records.sync as JsonObject; const targets: SyncReceiveKey[] = []').replace('repairedHistory(latest.history, [received])', 'repairedHistory(incomingHistory ?? latest.history, [received])') },
    { name: "skip-Setup-enumeration", assertion: "actual automatic Setup start adoption", fixture: true, source: original.replace(' || key?.kind === "setup"', '') },
    { name: "outside-Setup-lane", assertion: "Setup same lane held IO L0", source: original.replace('return enqueue(() => receiveAttempt(key))', 'return receiveAttempt(key)') },
    { name: "Setup-timer-incoming", assertion: "Setup timer remains outbound-only", source: original.replace('await automatic(current.event, false)', 'await automatic(current.event, true)') },
    { name: "Setup-echo", assertion: "Setup Q-only send no echo", source: original.replace(flush, 'const echo = await deps.sync.get(); let plan = planSyncWrite({ local: records, sync: Object.fromEntries(Object.entries(echo).filter(([name]) => name !== "s:setup:AAAAAAAAAAAAAAAA")), intent: { kind: "flush" } })').replace('const replanned = planSyncWrite({ local: latest, sync: remote, intent: { kind: "flush" } })', 'const replanned = plan') },
    { name: "Setup-bypass-debt", assertion: "Setup global unresolved debt blocks Q", source: original.replace(flush, 'const bypass = await deps.sync.get(); let plan = planSyncWrite({ local: records, sync: Object.fromEntries(Object.entries(bypass).filter(([name, raw]) => !(name === "s:setup:AAAAAAAAAAAAAAAA" && raw && typeof raw === "object" && "gen" in raw && raw.gen === "a1" && "data" in raw && Object.keys(raw.data as object).length === 0))), intent: { kind: "flush" } })').replace('const replanned = planSyncWrite({ local: latest, sync: remote, intent: { kind: "flush" } })', 'const replanned = plan') }
  ]
}

test("Setup wrong alternatives fail at intended observations in fresh saved-byte realms", async () => {
  const path = resolve(import.meta.dir, "local-filter-writer.ts"), original = await readFile(path, "utf8")
  const literals = (await setupIncomingAcceptance(createLocalFilterWriter, acct)).literals
  for (const fault of setupIncomingFaults(original)) {
    expect(fault.source).not.toBe(original)
    const built = await Bun.build({ entrypoints: [fault.fixture ? resolve(import.meta.dir, "../../../tools/fixtures/local-filter-writer/background.ts") : path], target: "browser", format: "cjs", minify: true, plugins: [{ name: fault.name, setup(builder) {
      builder.onLoad({ filter: /\/local-filter-writer\.ts$/ }, ({ path: loaded }) => loaded === path ? { loader: "ts", contents: fault.source } : undefined)
    } }] })
    expect(built.success).toBe(true)
    const bytes = await built.outputs[0]!.text()
    const execute = fault.fixture
      ? `await (${setupFixtureAcceptance.toString()})(JSON.parse(${JSON.stringify(JSON.stringify(literals))}),"start",()=>{const module={exports:{}};${bytes}})`
      : `const isPlaylistId=${isPlaylistId.toString()};const module={exports:{}};${bytes};await (${setupIncomingAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA")`
    const script = `(async()=>{try{${execute};return {caught:false}}catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0]}}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect({ name: fault.name, ...observed }).toEqual({ name: fault.name, caught: true, assertion: fault.assertion.split(": ")[0] })
  }
})

async function recoveryAcceptance(create: typeof createLocalFilterWriter, acct: AccountKey, playlist: PlaylistId) {
  const checks: string[] = []
  const stable = (value: unknown): string => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
  const equal = (actual: unknown, expected: unknown, name: string) => {
    if (stable(actual) !== stable(expected)) throw Error(name + ": literal mismatch")
    checks.push(name)
  }
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const key = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", setup = "doc:setup:AAAAAAAAAAAAAAAA", base = "s:filter:AAAAAAAAAAAAAAAA:PL_P"
  const own = JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert","extension":{"keep":[1,null]}}')
  const g0 = { v: 1, gen: "g0", at: 1, by: "synthetic", data: { mode: "deny", on: true, channels: [] } }
  const g1 = { ...g0, gen: "g1", at: 10, data: { ...g0.data, on: false } }
  const setupDoc = { v: 1, gen: "S", at: 1, by: "synthetic", data: { autoAdd: [{ pl: "PL_P", takes: "videos" }] } }
  const history = { joined: "H", pushed: { [key]: "g0", [setup]: "S" }, status: "ok", editedSinceOff: false, ...own }
  const captured = { key: { kind: "filter", acct, playlist }, name: key, gen: "g1", document: g1 }
  const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve() }
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done }); return { promise, resolve } }
  function harness(initial?: JsonObject) {
    let mono = 0, wall = 1000000, generation = 1, stamps = 0
    const records: JsonObject = initial ? clone(initial) : { schema: 1, device: { id: "synthetic", consent: { v: 1, at: 0 }, syncOn: true, ...own },
      sync: clone(history), [key]: clone(g1), [setup]: clone(setupDoc), unrelated: clone(own) }
    const remote: JsonObject = { "s:meta": { v: 1, id: "H", created: 0, ...own }, [base]: clone(g0), "s:setup:AAAAAAAAAAAAAAAA": clone(setupDoc) }
    const sets: JsonObject[] = [], invocations: { at: number; batch: unknown }[] = [], results: SyncAutomaticResult[] = []
    const timers = new Set<{ due: number; run: () => void }>(), scheduled: number[] = [], listeners = new Set<() => void>()
    const local: LocalWriteStorage = {
      async get(keys) { return clone(keys === null ? records : Object.fromEntries(keys.filter(k => Object.hasOwn(records, k)).map(k => [k, records[k]]))) },
      async set(items) { sets.push(clone(items)); Object.assign(records, clone(items)) }
    }
    const sync: Parameters<typeof create>[0]["sync"] = {
      async get() { return clone(remote) },
      async set(items) { invocations.push({ at: mono, batch: clone(items) }); Object.assign(remote, clone(items)); for (const changed of listeners) changed() },
      subscribe(changed) { listeners.add(changed); return () => { listeners.delete(changed) } }
    }
    const syncClock: Parameters<typeof create>[0]["syncClock"] = { now: () => mono, wallNow: () => wall, after(ms, run) {
      equal(ms >= 0 && ms <= 25000, true, "recovery has only bounded ordinary event tickets")
      const timer = { due: mono + ms, run }; timers.add(timer); scheduled.push(ms); return () => { timers.delete(timer) }
    } }
    const make = () => create({ claim: { kind: "unavailable" }, local, sync, now: () => { stamps++; return wall }, generation: () => `g${++generation}`,
      syncClock, onSyncResult: r => { results.push(r) } })
    let writer = make()
    const move = (at: number, unix = 1000000 + at) => { mono = at; wall = unix }
    const fire = async (at: number, unix = 1000000 + at) => { move(at, unix); for (const timer of [...timers]) if (timer.due <= mono) { timers.delete(timer); timer.run() }; await settle() }
    const emit = async () => { for (const changed of listeners) changed(); await settle() }
    const change = (on: boolean) => writer.change({ kind: "ui", windowId: 1, incognito: false }, {
      acct, playlist, desired: { mode: "deny", on }, clearListedChannels: "not-confirmed"
    })
    const restart = async (at: number, unix: number) => { const saved = JSON.stringify(records); await writer.dispose(); move(at, unix); for (const k of Object.keys(records)) delete records[k]; Object.assign(records, JSON.parse(saved)); writer = make(); return saved }
    return { records, remote, sets, invocations, results, timers, scheduled, listeners, local, sync, syncClock, move, fire, emit, change, restart,
      get writer() { return writer }, counts: () => ({ stamps, generation }) }
  }
  const nativeError = () => new Error("synthetic opaque")
  async function reject(h: ReturnType<typeof harness>, error: unknown = nativeError(), applied = false) {
    const set = h.sync.set
    let prearmObserved = false
    h.sync.set = async items => {
      const raw = h.records.sync, field = raw && typeof raw === "object" && !Array.isArray(raw) && raw.opaqueWrite
      prearmObserved = !!(field && typeof field === "object" && !Array.isArray(field) && field.gate && typeof field.gate === "object" && !Array.isArray(field.gate) && field.gate.kind === "pending")
      if (applied) await set(items); else h.invocations.push({ at: 5000, batch: clone(items) }); throw error }
    await h.writer.startSync(); await h.fire(5000)
    equal(prearmObserved, true, "native invocation observes confirmed durable prearm")
    equal(h.results.findLast(r => r.kind === "sync-set-failed")?.kind, "sync-set-failed", "native rejection has its original stage")
    const result = h.results.findLast(r => r.kind === "sync-set-failed")
    equal(result && "error" in result && result.error === error, true, "native rejection preserves original identity")
    h.sync.set = set
    return error
  }
  {
    const h = harness(), error = await reject(h)
    const pending = { ...history, opaqueWrite: { gate: { kind: "pending", notBefore: 1065000 }, diagnostic: null } }
    const held = { ...history, opaqueWrite: { gate: { kind: "held", notBefore: 1065000 }, diagnostic: { name: null, message: "synthetic opaque" } } }
    equal(h.sets, [{ sync: pending }, { sync: held }], "durable pending precedes held and no acknowledgement")
    equal(h.invocations, [{ at: 5000, batch: { [base]: g1 } }], "pending bookkeeping never enters native batch")
    equal(h.results.at(-1), { kind: "sync-set-failed", error, sent: [captured] }, "native failure retains exact captured sends")
    equal(h.records.sync, held, "held retains all raw history extensions")
    equal([h.listeners.size, h.timers.size], [1, 0], "opaque hold keeps listener and cancels tickets")
    h.move(64999); equal(await h.writer.flushSync(), { kind: "deferred", notBefore: 65000 }, "manual cannot bypass opaque hold")
    await h.writer.startSync(); await h.emit(); equal(h.timers.size, 0, "early start and area events create no recovery timer")
    await h.fire(65001); equal(h.invocations.length, 1, "silence after expiry cannot recover")
    equal((await h.writer.flushSync()).kind, "pushed", "later manual event admits one fresh pass")
    equal(h.invocations.map(i => i.at), [5000, 65001], "one later event makes one attempt")
    equal(h.records.sync, { ...history, pushed: { ...history.pushed, [key]: "g1" }, opaqueWrite: { gate: null, diagnostic: { name: null, message: "synthetic opaque" } } }, "success clears gate with exact ack and retains diagnostic")
    equal(h.counts(), { stamps: 0, generation: 1 }, "bookkeeping never asks for edit stamps")
    await h.writer.dispose(); equal([h.listeners.size, h.timers.size], [0, 0], "dispose terminates recovery owner")
  }
  {
    const h = harness(); await reject(h)
    const gate = deferred(), get = h.local.get
    let first = true
    h.local.get = async keys => { if (first) { first = false; await gate.promise }; return get(keys) }
    h.move(64000); const early = h.writer.flushSync(); await settle(); h.move(66000); gate.resolve()
    equal((await early).kind, "deferred", "arrival time cannot become service time permission")
    equal(h.invocations.length, 1, "queued early event makes no attempt")
    equal(h.timers.size, 0, "queued early event has no timer")
    h.local.get = get; await h.writer.dispose()
  }
  {
    const h = harness(); await reject(h)
    const gate = deferred(), set = h.sync.set, renewed = { name: "synthetic renewed", message: "synthetic second" }
    h.sync.set = async items => { h.invocations.push({ at: 65001, batch: clone(items) }); await gate.promise; throw renewed }
    h.move(65001); const first = h.writer.flushSync(); await settle()
    h.move(66000); const queued = [h.writer.flushSync(), h.writer.startSync()]; void h.emit()
    h.move(67000); gate.resolve()
    const result = await first
    equal(result.kind === "sync-set-failed" && result.error === renewed, true, "renewal retains second native identity")
    await Promise.all(queued); await settle()
    equal(h.invocations.map(i => i.at), [5000, 65001], "renewal invalidates queued grants")
    equal(h.records.sync && typeof h.records.sync === "object" && !Array.isArray(h.records.sync) && h.records.sync.opaqueWrite,
      { gate: { kind: "held", notBefore: 1127000 }, diagnostic: renewed }, "renewal deadline starts at rejection observation")
    equal(h.timers.size, 0, "renewal leaves no callback")
    h.sync.set = set; await h.writer.dispose()
  }
  {
    const h = harness(); await reject(h)
    h.move(65001); await h.change(true)
    equal(h.invocations.length, 1, "eligible real edit commits before push")
    equal([...h.timers].map(t => t.due), [67001], "eligible edit owns ordinary two-second quiet ticket")
    await h.fire(67000); equal(h.invocations.length, 1, "edit cannot bypass two-second quiet")
    await h.fire(67001); equal(h.invocations.map(i => i.at), [5000, 67001], "edit ticket uses its qualifying event once")
    equal(h.timers.size, 0, "successful edit recovery ends idle")
    await h.writer.dispose()
  }
  for (const mode of ["forward", "backward", "invalid-wall", "invalid-mono", "regressing-mono", "overflow"] as const) {
    const h = harness(); await reject(h)
    const mono = mode === "forward" ? 64999 : mode === "regressing-mono" ? 4999 : mode === "invalid-mono" ? NaN : 65001
    const wall = mode === "forward" ? 9999999 : mode === "backward" ? 1000000 : mode === "invalid-wall" ? NaN : mode === "overflow" ? Number.MAX_SAFE_INTEGER : 1065001
    h.move(mono, wall); const result = await h.writer.flushSync()
    equal(result.kind === "deferred" || result.kind === "unavailable", true, "unsafe clock does not admit " + mode)
    equal(h.invocations.length, 1, "clock cannot shorten hold " + mode)
    equal(h.timers.size, 0, "unsafe clock creates no timer " + mode)
    await h.writer.dispose()
  }
  for (const mode of ["normal", "forward", "backward", "longer", "pending"] as const) {
    const h = harness(); await reject(h)
    if (mode === "pending") { const raw = h.records.sync; if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("fixture history"); raw.opaqueWrite = { gate: { kind: "pending", notBefore: 1065000 }, diagnostic: null } }
    const unix = mode === "forward" ? 9000000 : mode === "backward" ? 900000 : 1006000
    if (mode === "longer") { const raw = h.records.sync; if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("fixture history"); raw.opaqueWrite = { gate: { kind: "held", notBefore: 1200000 }, diagnostic: null } }
    const serialized = await h.restart(0, unix)
    equal(typeof serialized, "string", "restart serializes full raw saved state " + mode)
    await h.writer.startSync()
    equal(h.timers.size, 0, "restart never schedules recovery timer " + mode)
    h.move(59999, mode === "forward" ? 9999999 : unix + 59999)
    equal((await h.writer.flushSync()).kind, "deferred", "fresh owner has minimum sixty-second monotonic floor " + mode)
    const due = mode === "longer" ? 194001 : mode === "backward" ? 165001 : 60001
    await h.fire(due, Math.max(unix + due, 1065001)); equal(h.invocations.length, 1, "restart expiry alone has no permission " + mode)
    equal((await h.writer.flushSync()).kind, "pushed", "new external event recovers after both clocks " + mode)
    equal(h.invocations.length, 2, "restart fresh pass occurs once " + mode)
    await h.writer.dispose()
  }
  for (const mode of ["before", "after", "contradictory", "held-fails", "held-applied-rejects"] as const) {
    const h = harness(), marker = { local: "synthetic persistence" }, native = nativeError(), set = h.local.set
    h.local.set = async items => {
      const raw = items.sync, gate = raw && typeof raw === "object" && !Array.isArray(raw) && raw.opaqueWrite
      const pending = gate && typeof gate === "object" && !Array.isArray(gate) && gate.gate
      const kind = pending && typeof pending === "object" && !Array.isArray(pending) ? pending.kind : undefined
      if (kind === "pending" && mode === "before") throw marker
      await set(items)
      if (kind === "pending" && mode === "after") throw marker
      if (kind === "pending" && mode === "contradictory") h.records.unrelated = { changed: true }
      if (kind === "held" && mode === "held-applied-rejects") throw marker
    }
    if (mode === "held-fails") h.local.set = async items => {
      const raw = items.sync, field = raw && typeof raw === "object" && !Array.isArray(raw) && raw.opaqueWrite
      if (field && typeof field === "object" && !Array.isArray(field) && field.gate && typeof field.gate === "object" && !Array.isArray(field.gate) && field.gate.kind === "held") throw marker
      await set(items)
    }
    if (mode.startsWith("held")) {
      await reject(h, native)
      const result = h.results.at(-1)
      equal(result?.kind === "sync-set-failed" && result.error === native && result.recoveryPersistence?.error === marker, true, "held persistence never masks native identity " + mode)
      h.local.set = set; await h.restart(0, 1006000); await h.writer.startSync(); h.move(59999, 1065999)
      equal((await h.writer.flushSync()).kind, "deferred", "failed held finalization retains restart fallback " + mode)
    } else {
      h.move(5000); let caught: unknown, result
      try { result = await h.writer.flushSync() } catch (error) { caught = error }
      equal(mode === "contradictory" ? result?.kind : caught === marker, mode === "contradictory" ? "unavailable" : true, "prearm failure has exact local stage " + mode)
      equal(h.invocations.length, 0, "durable prearm must be confirmed " + mode)
    }
    await h.writer.dispose()
  }
  for (const applied of [false, true]) {
    const h = harness(); await reject(h, nativeError(), applied)
    await h.restart(0, 1006000); await h.writer.startSync(); h.move(60001, 1066001)
    const result = await h.writer.flushSync()
    equal(result.kind, applied ? "reconciled" : "pushed", "uncertain effects use current exact readback " + applied)
    equal(h.invocations.length, applied ? 1 : 2, "rejected applied set is never resent " + applied)
    const raw = h.records.sync
    equal(raw && typeof raw === "object" && !Array.isArray(raw) && raw.pushed, { ...history.pushed, [key]: "g1" }, "readback acknowledges exact accepted generation " + applied)
    await h.writer.dispose()
  }
  {
    const h = harness(); await reject(h, nativeError(), true)
    h.move(6000); await h.change(true)
    const raw = h.records.sync
    equal(raw && typeof raw === "object" && !Array.isArray(raw) && raw.pushed, { ...history.pushed, [key]: "g1" }, "changed edit repairs accepted g1 without acknowledging current g2")
    equal(h.records[key] && typeof h.records[key] === "object" && !Array.isArray(h.records[key]) && h.records[key].gen, "g2", "changed edit keeps its own generation pending")
    equal(h.invocations.length, 1, "changed edit never replays the rejected native send")
    equal(h.timers.size, 0, "changed edit during hold has no recovery timer")
    await h.writer.dispose()
  }
  for (const extension of ["device", "sync", "setup", "filter", "unrelated"] as const) {
    const h = harness(), set = h.local.set
    h.local.set = async items => {
      await set(items)
      const raw = h.records[extension === "setup" ? setup : extension === "filter" ? key : extension]
      if (raw && typeof raw === "object" && !Array.isArray(raw)) raw.newerUnknown = true
    }
    h.move(5000); equal((await h.writer.flushSync()).kind, "unavailable", "prearm rechecks full raw fields " + extension)
    equal(h.invocations.length, 0, "stale raw baseline never reaches native " + extension)
    equal(h.sets.length, 1, "stale pending is retained without cleanup overwrite " + extension)
    await h.writer.dispose()
  }
  for (const blocker of ["off", "consent", "waiting", "reset", "metadata", "full", "incomplete", "incoming", "future"] as const) {
    const h = harness(), set = h.local.set
    h.local.set = async items => {
      await set(items)
      if (blocker === "off") h.records.device = { id: "synthetic", consent: { v: 1, at: 0 }, syncOn: false }
      if (blocker === "consent") h.records.device = { id: "synthetic", consent: null, syncOn: true }
      if (blocker === "waiting") h.records.sync = { ...history, status: "waiting" }
      if (blocker === "reset") h.remote["s:meta"] = { v: 1, id: "H", created: 0, reset: true }
      if (blocker === "metadata") h.remote["s:meta"] = { v: 1, id: "different", created: 0 }
      if (blocker === "full") h.remote.unknown = "x".repeat(99000)
      if (blocker === "incomplete") h.remote[base] = { v: 1, gen: "g1", at: 10, by: "synthetic", n: 2 }
      if (blocker === "incoming") h.remote[base] = { ...g1, gen: "remote", at: 20 }
      if (blocker === "future") h.remote[base] = { ...g1, v: 2 }
    }
    h.move(5000); const result = await h.writer.flushSync()
    equal(result.kind, blocker === "full" ? "blocked" : "unavailable", "post-prearm planning retains blocker " + blocker)
    equal(h.invocations.length, 0, "added await cannot bypass blocker " + blocker)
    await h.writer.dispose()
  }
  for (const stage of ["pending-set", "pending-read", "replan-remote", "replan-local", "native", "post-local", "post-remote", "ack-set", "ack-read"] as const) {
    const h = harness()
    h.remote[base] = clone(g1)
    await h.writer.startSync()
    h.remote[base] = clone(g0)
    h.records.sync = clone(history)
    const localGet = h.local.get, localSet = h.local.set, remoteGet = h.sync.get, remoteSet = h.sync.set
    const entered = deferred(), release = deferred()
    let lr = 0, rr = 0, ls = 0, blocked = false
    const pause = async () => { if (!blocked) { blocked = true; entered.resolve(); await release.promise } }
    h.local.get = async keys => { lr++; if (lr === ({ "pending-read": 3, "replan-local": 4, "post-local": 5, "ack-read": 7, "pending-set": -1, "replan-remote": -1, native: -1, "post-remote": -1, "ack-set": -1 }[stage])) await pause(); return localGet(keys) }
    h.sync.get = async () => { rr++; if (rr === ({ "replan-remote": 2, "post-remote": 3, "pending-set": -1, "pending-read": -1, "replan-local": -1, native: -1, "post-local": -1, "ack-set": -1, "ack-read": -1 }[stage])) await pause(); return remoteGet() }
    h.local.set = async items => { ls++; if (ls === (stage === "pending-set" ? 1 : stage === "ack-set" ? 2 : -1)) await pause(); await localSet(items) }
    h.sync.set = async items => { await remoteSet(items); if (stage === "native") await pause() }
    h.move(5000); const flushing = h.writer.flushSync(); await entered.promise
    const reads = [lr, rr]
    h.move(6000); const editing = h.change(true), starting = h.writer.startSync(); void h.emit()
    await settle(); equal([lr, rr], reads, "new await keeps real edits and area events serialized " + stage)
    h.move(7000); release.resolve(); equal((await flushing).kind, "pushed", "new await confirms original captured generation " + stage)
    await editing; await starting; await settle()
    const raw = h.records.sync
    equal(raw && typeof raw === "object" && !Array.isArray(raw) && raw.pushed, { ...history.pushed, [key]: "g1" }, "new await never acknowledges queued g2 " + stage)
    h.local.get = localGet; h.local.set = localSet; h.sync.get = remoteGet; h.sync.set = remoteSet
    await h.fire(12000)
    equal(h.invocations.length, 2, "new await permits only fresh queued-generation pass " + stage)
    equal(h.invocations[1]!.at >= h.invocations[0]!.at + 5000, true, "new await charges actual invocation spacing " + stage)
    equal(h.timers.size, 0, "new await finishes without rearm " + stage)
    await h.writer.dispose()
  }
  for (const mode of ["metadata", "partial", "read-failed"] as const) {
    const h = harness(), marker = { synthetic: "read failure" }
    await reject(h, nativeError(), true)
    if (mode === "metadata") h.remote["s:meta"] = { v: 1, id: "changed", created: 0 }
    if (mode === "partial") h.remote[base] = { v: 1, gen: "g1", at: 10, by: "synthetic", n: 2 }
    if (mode === "read-failed") h.sync.get = async () => { throw marker }
    h.move(65001); let caught: unknown, result
    try { result = await h.writer.flushSync() } catch (error) { caught = error }
    equal(mode === "read-failed" ? caught === marker : result?.kind, mode === "read-failed" ? true : "unavailable", "uncertain native effects retain current blockers " + mode)
    equal(h.invocations.length, 1, "uncertain blocked recovery never resends " + mode)
    await h.writer.dispose()
  }
  for (const mode of ["normalize-set", "normalize-read"] as const) {
    const seed = harness(); await seed.writer.dispose()
    const initial = seed.records
    initial.sync = { ...history, opaqueWrite: { gate: { kind: "pending", notBefore: 1 }, diagnostic: null } }
    const h = harness(initial), marker = { synthetic: mode }
    if (mode === "normalize-set") h.local.set = async () => { throw marker }
    else { const get = h.local.get; let reads = 0; h.local.get = async keys => { if (++reads === 2) throw marker; return get(keys) } }
    let caught: unknown; try { await h.writer.flushSync() } catch (error) { caught = error }
    equal(caught === marker, true, "restart normalization preserves original local error " + mode)
    equal(h.invocations.length, 0, "failed normalization never invokes native " + mode)
    await h.writer.dispose()
  }
  {
    const h = harness(), native = nativeError(), clockError = { synthetic: "clock unavailable" }
    h.sync.set = async () => { h.syncClock.wallNow = () => { throw clockError }; throw native }
    await h.writer.startSync(); await h.fire(5000)
    const result = h.results.at(-1)
    equal(result?.kind === "sync-set-failed" && result.error === native, true, "clock exception never masks native rejection")
    equal(result?.kind === "sync-set-failed" && result.recoveryPersistence?.error === clockError, true, "clock exception stays secondary persistence evidence")
    equal(h.sets.length, 1, "clock exception retains confirmed pending fallback only")
    equal([h.listeners.size, h.timers.size], [1, 0], "clock exception leaves held listener without timer")
    await h.writer.dispose()
  }
  {
    const h = harness(), raw = h.records.sync
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("fixture history")
    raw.opaqueWrite = { gate: null, diagnostic: { name: null, message: "synthetic old", ...own }, ...own }
    await reject(h)
    h.move(65001); equal((await h.writer.flushSync()).kind, "pushed", "extended diagnostic recovery succeeds")
    equal(raw === h.records.sync, false, "extended history uses fresh raw write")
    const current = h.records.sync
    equal(current && typeof current === "object" && !Array.isArray(current) && current.opaqueWrite,
      { gate: null, diagnostic: { name: null, message: "synthetic opaque", ...own }, ...own }, "recovery retains compatible opaque and diagnostic extensions")
    await h.writer.dispose()
  }
  {
    const h = harness(), get = h.sync.get
    h.records[key] = clone(g0); h.remote[base] = clone(g1)
    h.sync.get = async () => {
      const raw = h.records.sync
      if (raw && typeof raw === "object" && !Array.isArray(raw)) raw.opaqueWrite = { gate: null, diagnostic: null }
      return get()
    }
    equal((await h.writer.receiveSyncDocument({ kind: "filter", acct, playlist })).kind, "unavailable", "incoming raw snapshot includes new opaque bookkeeping")
    equal(h.sets, [], "incoming cannot mask changed opaque bookkeeping")
    await h.writer.dispose()
  }
  const diagnostics: { error: unknown; expected: unknown }[] = [
    { error: nativeError(), expected: { name: null, message: "synthetic opaque" } },
    { error: { name: "synthetic", message: "synthetic message", cause: "ignored", stack: "ignored" }, expected: { name: "synthetic", message: "synthetic message" } },
    { error: "synthetic primitive", expected: { name: null, message: "synthetic primitive" } },
    { error: 123, expected: { name: null, message: null } },
    { error: Object.create({ name: "inherited", message: "inherited" }), expected: { name: null, message: null } },
    { error: new Proxy({}, { getOwnPropertyDescriptor() { throw Error("synthetic reflection") } }), expected: { name: null, message: null } }
  ]
  let coercions = 0
  const hostile: Record<string, unknown> = { toJSON() { coercions++; throw Error("serializer") }, toString() { coercions++; throw Error("coercion") } }
  hostile.cause = hostile
  Object.defineProperty(hostile, "name", { get() { coercions++; throw Error("getter") } })
  Object.defineProperty(hostile, "message", { get() { coercions++; throw Error("getter") } })
  diagnostics.push({ error: hostile, expected: { name: null, message: null } })
  for (const entry of diagnostics) {
    const h = harness(); await reject(h, entry.error)
    const raw = h.records.sync
    equal(raw && typeof raw === "object" && !Array.isArray(raw) && raw.opaqueWrite, { gate: { kind: "held", notBefore: 1065000 }, diagnostic: entry.expected }, "diagnostic projection uses own data only")
    await h.writer.dispose()
  }
  equal(coercions, 0, "diagnostic projection never evaluates accessors or coercion")
  {
    const h = harness(), entered = deferred(), release = deferred(), set = h.local.set
    h.local.set = async items => { entered.resolve(); await release.promise; await set(items) }
    h.move(5000); const work = h.writer.flushSync(); await entered.promise
    const drain = h.writer.dispose(); let done = false; void drain.then(() => { done = true }); await settle()
    equal(done, false, "dispose drains accepted prearm IO")
    release.resolve(); equal((await work).kind, "unavailable", "disposed prearm cannot invoke native")
    await drain; equal(h.invocations.length, 0, "dispose during prearm makes no native mutation")
  }
  {
    const h = harness(); await h.writer.startSync(); const [ticket] = [...h.timers]
    await reject(h); const before = h.invocations.length
    if (ticket) { ticket.run(); await settle() }
    equal(h.invocations.length, before, "cancelled old callback cannot mint permission")
    h.move(10000); await h.change(false); equal(h.timers.size, 0, "no-op edit during hold has no recovery work")
    await h.writer.dispose()
  }
  return { assertions: checks.length, checks }
}

test("opaque recovery durably gates real owner events and uncertain storage", async () => {
  expect((await recoveryAcceptance(createLocalFilterWriter, acct, playlist)).assertions).toBeGreaterThan(150)
})

function recoveryFaults(original: string) {
  return [
    { name: "absent-prearm", assertion: "native invocation observes confirmed durable prearm", source: original.replace('await deps.local.set({ sync: pending })', '').replace('!sameSyncJson(prearmed, confirmed)', 'false').replace('!sameSyncJson(prearmed, latest)', 'false') },
    { name: "restart-without-floor", assertion: "fresh owner has minimum sixty-second monotonic floor normal", source: original.replace('Math.max(time.mono + 60000, time.mono + Math.max(0, gate.notBefore - time.wall))', 'time.mono + Math.max(0, gate.notBefore - time.wall)') },
    { name: "forward-clock-admission", assertion: "unsafe clock does not admit forward", source: original.replace('event.mono >= hold.mono && ', '').replace('time.mono >= hold.mono && ', '') },
    { name: "backward-clock-admission", assertion: "unsafe clock does not admit backward", source: original.replace('event.wall >= hold.wall && ', '').replace(' && time.wall >= hold.wall', '') },
    { name: "service-time-admission", assertion: "arrival time cannot become service time permission", source: original.replace('event.mono >= hold.mono && event.wall >= hold.wall && ', '') },
    { name: "manual-hold-bypass", assertion: "manual cannot bypass opaque hold", source: original.replace('event.epoch === epoch && (!hold ||', 'event.epoch === epoch && (event.kind === "manual" || !hold ||') },
    { name: "early-event-timer", assertion: "early start and area events create no recovery timer", source: original.replace('if (!time || !admitted(event, time)) return', 'if (!time) return') },
    { name: "queued-renewed-grant", assertion: "renewal leaves no callback", source: original.replace('return event !== undefined && event.epoch === epoch', 'if (event && event.epoch !== epoch) return true; return event !== undefined && event.epoch === epoch') },
    { name: "native-error-substitution", assertion: "native rejection preserves original identity", source: original.replaceAll('return { kind: "sync-set-failed", error,', 'return { kind: "sync-set-failed", error: new Error("synthetic substitute"),') },
    { name: "masked-raw-fields", assertion: "prearm failure has exact local stage contradictory", source: original.replace('!sameSyncJson(prearmed, confirmed)', 'false').replace('!sameSyncJson(prearmed, latest)', 'false') },
    { name: "current-generation-recovery-ack", assertion: "changed edit repairs accepted g1 without acknowledging current g2", source: original.replace('repairedHistory(history.raw, admission.repairs)', 'repairedHistory(history.raw, admission.repairs.map(record => record.name === filterKey ? { ...record, gen: envelope.gen } : record))') },
    { name: "resend-rejected-applied", assertion: "uncertain effects use current exact readback true", source: original.replace('sync: await deps.sync.get(), intent: { kind: "flush" }', 'sync: Object.fromEntries(Object.entries(await deps.sync.get()).filter(([name]) => !hold || name !== "s:filter:AAAAAAAAAAAAAAAA:PL_P")), intent: { kind: "flush" }').replace('sync: remote, intent: { kind: "flush" }', 'sync: Object.fromEntries(Object.entries(remote).filter(([name]) => !hold || name !== "s:filter:AAAAAAAAAAAAAAAA:PL_P")), intent: { kind: "flush" }') }
  ]
}

test("actual browser artifact rejects twelve opaque recovery defects at literal observations", async () => {
  const path = resolve(import.meta.dir, "local-filter-writer.ts"), original = await readFile(path, "utf8")
  for (const fault of recoveryFaults(original)) {
    expect(fault.source).not.toBe(original)
    const built = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true, plugins: [{ name: fault.name, setup(builder) {
      builder.onLoad({ filter: /\/local-filter-writer\.ts$/ }, () => ({ loader: "ts", contents: fault.source }))
    } }] })
    expect(built.success).toBe(true)
    const bytes = await built.outputs[0]!.text()
    const script = `(async()=>{const module={exports:{}};${bytes};try{await (${recoveryAcceptance.toString()})(module.exports.createLocalFilterWriter,"AAAAAAAAAAAAAAAA","PL_P");return {caught:false}}catch(error){return {caught:error.message.startsWith(${JSON.stringify(fault.assertion + ":")}),assertion:error.message.split(": ")[0]}}})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect({ name: fault.name, ...observed }).toEqual({ name: fault.name, caught: true, assertion: fault.assertion })
  }
})

async function recoveryFixtureAcceptance(afterEffects: boolean, execute: () => void) {
  const checks: string[] = [], clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  const stable = (value: unknown): string => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
  const equal = (actual: unknown, expected: unknown, label: string) => { if (stable(actual) !== stable(expected)) throw Error(label + ": literal mismatch"); checks.push(label) }
  const key = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", setup = "doc:setup:AAAAAAAAAAAAAAAA", base = key.replace("doc:", "s:")
  const g0 = { v: 1, gen: "g0", at: 1, by: "synthetic", data: { mode: "deny", on: true, channels: [] } }
  const g1 = { ...g0, gen: "g1", at: 10, data: { ...g0.data, on: false } }
  const setupDoc = { v: 1, gen: "S", at: 1, by: "synthetic", data: { autoAdd: [{ pl: "PL_P", takes: "videos" }] } }
  const history = { joined: "H", pushed: { [key]: "g0", [setup]: "S" }, status: "ok", editedSinceOff: false, future: { keep: true } }
  const records: JsonObject = { schema: 1, device: { id: "synthetic", consent: { v: 1, at: 0 }, syncOn: true }, sync: clone(history), [key]: clone(g1), [setup]: clone(setupDoc) }
  const remote: JsonObject = { "s:meta": { v: 1, id: "H", created: 0 }, [base]: clone(g0), [setup.replace("doc:", "s:")]: clone(setupDoc) }
  let mono = 0, wall = 1000000, serial = 0, wallReads = 0, generations = 0, forbiddenMutations = 0
  const timers = new Map<number, { due: number; run: () => void }>()
  function event() {
    const listeners = new Set<(...args: unknown[]) => void>()
    return { addListener(fn: (...args: unknown[]) => void) { listeners.add(fn) }, removeListener(fn: (...args: unknown[]) => void) { listeners.delete(fn) },
      emit(...args: unknown[]) { for (const listener of listeners) listener(...args) }, count: () => listeners.size }
  }
  const allChanged = event(), syncChanged = event(), message = event()
  function area(values: JsonObject, synced = false) {
    return { QUOTA_BYTES: 10485760, onChanged: synced ? syncChanged : event(),
      async get(keys: string[] | string | null) { return clone(keys === null ? values : Object.fromEntries((typeof keys === "string" ? [keys] : keys).filter(k => Object.hasOwn(values, k)).map(k => [k, values[k]]))) },
      async set(items: JsonObject) { const changes = Object.fromEntries(Object.entries(items).map(([k, newValue]) => [k, { ...(Object.hasOwn(values, k) ? { oldValue: values[k] } : {}), newValue }])); Object.assign(values, clone(items)); if (synced) syncChanged.emit(changes); allChanged.emit(changes, synced ? "sync" : "local") },
      async remove() { forbiddenMutations++; throw Error("fixture removal forbidden") }, async clear() { forbiddenMutations++; throw Error("fixture clear forbidden") }
    }
  }
  Object.assign(globalThis, {
    chrome: { storage: { local: area(records), sync: area(remote, true), onChanged: allChanged }, runtime: { id: "synthetic", getURL: (path: string) => "chrome-extension://synthetic" + path, onMessage: message }, windows: { async get(id: number) { return { id, incognito: false } } } },
    Date: { now() { wallReads++; return wall } }, performance: { now: () => mono }, crypto: { randomUUID() { return "g" + (2 + generations++) } },
    setTimeout(run: () => void, ms: number) { equal(ms <= 25000, true, "actual recovery fixture has bounded ordinary timers"); const id = ++serial; timers.set(id, { due: mono + ms, run }); return id },
    clearTimeout(id: number) { timers.delete(id) }, addEventListener() {}
  })
  execute()
  const fixture = Reflect.get(globalThis, "localFilterFixture")
  const settle = async () => { for (let i = 0; i < 500; i++) await Promise.resolve() }
  const move = (at: number, unix = 1000000 + at) => { mono = at; wall = unix }
  const fire = async (at: number, unix = 1000000 + at) => { move(at, unix); for (const [id, timer] of [...timers]) if (timer.due <= mono) { timers.delete(id); timer.run() }; await settle() }
  equal([syncChanged.count(), timers.size], [0, 0], "actual recovery worker constructs lazily")
  fixture.rejectNextSyncSet(afterEffects)
  move(5000)
  const rejected = await fixture.flush()
  equal(rejected.kind, "sync-set-failed", "actual worker consumes opaque rejection")
  equal(rejected.error.message, "synthetic opaque native failure", "actual worker retains synthetic original diagnostic")
  equal(fixture.syncWrites[0], { [base]: g1 }, "actual worker native batch excludes local bookkeeping")
  equal(rejected.sent, [{ key: { kind: "filter", acct: "AAAAAAAAAAAAAAAA", playlist: "PL_P" }, name: key, gen: "g1", document: g1 }], "actual worker preserves exact native sends")
  const held = { ...history, opaqueWrite: { gate: { kind: "held", notBefore: 1065000 }, diagnostic: { name: null, message: "synthetic opaque native failure" } } }
  equal(records.sync, held, "actual worker saves durable diagnostic and hold")
  equal(remote[base], afterEffects ? g1 : g0, "actual worker controls uncertain native effects")
  await fixture.start(); equal(syncChanged.count(), 1, "actual opaque hold keeps area listener")
  move(64999); equal(await fixture.flush(), { kind: "deferred", notBefore: 65000 }, "actual manual path shares recovery gate")
  syncChanged.emit({}); await settle(); equal(timers.size, 0, "actual early event has no timer")
  await fire(65001); equal(fixture.nativeInvocations, [5000], "actual silence cannot mint recovery permission")
  const serialized = JSON.stringify(records)
  await fixture.dispose(); move(0, 1006000)
  for (const name of Object.keys(records)) delete records[name]
  Object.assign(records, JSON.parse(serialized))
  await fixture.freshOwner(); await fixture.start()
  move(59999, 1065999); equal((await fixture.flush()).kind, "deferred", "actual fresh owner imports no old monotonic deadline")
  await fire(60001, 1066001); equal(fixture.nativeInvocations, [5000], "actual restart expiry schedules nothing")
  const recovered = await fixture.flush(); await settle()
  equal(recovered.kind, afterEffects ? "reconciled" : "pushed", "actual recovery uses current state rather than replay")
  equal(fixture.nativeInvocations, afterEffects ? [5000] : [5000, 60001], "actual accepted generation never duplicates")
  equal(records.sync, { ...history, pushed: { ...history.pushed, [key]: "g1" }, opaqueWrite: { gate: null, diagnostic: held.opaqueWrite.diagnostic } }, "actual recovery clears gate with captured-generation repair")
  equal(records[key], g1, "actual recovery does not restamp documents")
  equal(generations, 0, "actual recovery never generates a user edit")
  equal(wallReads > 0, true, "actual adapter forwards recovery wall observations")
  equal(forbiddenMutations, 0, "actual recovery never removes native data")
  await fixture.dispose(); equal([syncChanged.count(), timers.size], [0, 0], "actual recovery fixture drains listener and timers")
  equal(fixture.unhandledRejections, [], "actual recovery fixture has no unhandled rejection")
  return { assertions: checks.length, checks, afterEffects, records, remote, batches: fixture.syncWrites, localSets: fixture.sets, nativeInvocations: fixture.nativeInvocations }
}

test("actual fixture worker consumes restart-safe opaque recovery on its existing adapter", async () => {
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../../../tools/fixtures/local-filter-writer/background.ts")], target: "browser", format: "cjs", minify: true })
  expect(built.success).toBe(true)
  const bytes = await built.outputs[0]!.text()
  for (const applied of [false, true]) {
    const script = `(async()=>{return (${recoveryFixtureAcceptance.toString()})(${applied},()=>{const module={exports:{}};${bytes}})})()`
    const observed = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{},{timeout:30000})))'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect(observed.assertions).toBeGreaterThan(20)
  }
})

export async function noticeOwnerAcceptance(api: { create: typeof createLocalFilterWriter; starting: typeof import("./local-filter-writer").createStartingLocalFilterWriter }, acct: AccountKey, playlist: PlaylistId) {
  let checks = 0
  const observations: unknown[] = []
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  function equal(actual: unknown, expected: unknown, label: string) { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error(label + ": " + JSON.stringify({ actual, expected })) }
  function check(value: unknown, label: string) { checks++; if (!value) throw Error(label) }
  const origin = { kind: "ui", windowId: 1, incognito: false } as const
  const notice = { acct, dropped: 1, extension: { nested: [true] } }
  const seed = () => ({ schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, claimNotice: notice }, unclaimed: null,
    "doc:settings": { v: 1, gen: "old", at: 1, by: "fixture", data: {} },
    [`doc:setup:${acct}`]: { v: 1, gen: "old", at: 1, by: "fixture", data: { autoAdd: [{ pl: playlist }] } } })
  function gate() { let release = () => {}, enter = () => {}; const held = new Promise<void>(resolve => { release = resolve }), entered = new Promise<void>(resolve => { enter = resolve }); return { release, enter, held, entered } }
  async function turns() { for (let i = 0; i < 30; i++) await Promise.resolve() }
  function harness(initial: Record<string, unknown> = seed()) {
    let records = clone(initial), reads = 0, generation = 0, monotonic = 0, wall = 0, stamps = 0, remote = 0, timers = 0, mode = "normal", heldAt = ""
    const held = gate(), batches: unknown[] = [], events: unknown[] = [], trace: unknown[] = []
    const local = {
      async get(keys: readonly string[] | null) {
        reads++; trace.push({ get: keys })
        const selected = clone(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))
        if (heldAt === "get" + reads) { held.enter(); await held.held }
        if (mode === "read-failed" && reads === 3) throw Error("read-failed")
        return selected
      },
      async set(items: Readonly<Record<string, unknown>>) {
        trace.push({ set: clone(items) }); batches.push(clone(items))
        if (heldAt === "set") { held.enter(); await held.held }
        if (mode !== "no-apply") records = { ...records, ...clone(items) }
      }
    }
    const deps = { local, claim: { kind: "unavailable" as const }, sync: { async get() { remote++; throw Error("unexpected remote") }, async set() { remote++; throw Error("unexpected remote") }, subscribe() { remote++; throw Error("unexpected remote") } },
      syncClock: { now() { monotonic++; return 0 }, wallNow() { wall++; return 1000000 }, after() { timers++; throw Error("unexpected timer") } }, now() { stamps++; return 100 }, generation() { return "g" + ++generation }, onSyncResult() {} }
    const writer = api.create(deps); writer.subscribe(event => events.push(event))
    const counts = () => ({ generation, monotonic, wall, stamps, remote, timers })
    return { writer, deps, held, hold: (value: string) => { heldAt = value }, mode: (value: string) => { mode = value }, counts, events, trace, batches, get reads() { return reads }, get records() { return records } }
  }
  {
    const h = harness(), before = h.counts(), saved = clone(h.records)
    const read = await h.writer.readClaimNotice()
    equal(read, { kind: "pending", notice }, "owner pending notice")
    equal(h.records, saved, "read cannot clear")
    equal(h.batches, [], "read zero writes")
    equal(h.counts(), before, "read zero effect clocks")
    check(read.kind === "pending" && Object.isFrozen(read.notice), "owner notice frozen")
    equal(await h.writer.acknowledgeClaimNotice(origin, notice), { kind: "committed", write: { kind: "resolved" } }, "owner confirmed notice")
    equal(await h.writer.readClaimNotice(), { kind: "empty" }, "owner reread empty")
    equal(h.counts(), before, "notice no recovery ingress or stamp")
    equal(h.events, [], "Device no Settings event")
    equal(h.batches, [{ device: { ...seed().device, claimNotice: null } }], "owner exact Device-only batch")
    await h.writer.dispose()
    const restarted = api.create(h.deps)
    equal(await restarted.readClaimNotice(), { kind: "empty" }, "fresh owner empty")
    await restarted.dispose()
    for (const call of [() => h.writer.readClaimNotice(), () => h.writer.acknowledgeClaimNotice(origin, notice)]) {
      let message = ""; try { await call() } catch (error) { if (error instanceof Error) message = error.message }
      equal(message, "Writer disposed", "disposed public notice rejection")
    }
    observations.push({ name: "normal", records: h.records, batches: h.batches, counts: h.counts(), trace: h.trace })
  }
  for (const raw of [null, {}, { kind: "sync" }, { kind: "ui", windowId: -1, incognito: false }, { kind: "ui", windowId: 1.5, incognito: false }, { kind: "ui", windowId: 1, incognito: "false" }]) {
    const h = harness(), before = h.counts()
    equal(await Reflect.apply(h.writer.acknowledgeClaimNotice, h.writer, [raw, notice]), { kind: "refused", reason: "invalid" }, "invalid origin")
    equal(h.batches, [], "invalid origin zero writes"); equal(h.reads, 0, "invalid origin zero IO"); equal(h.counts(), before, "invalid origin zero ingress"); await h.writer.dispose()
  }
  for (const [operation, expected] of [["read", { kind: "unavailable", reason: "startup" }], ["ack", { kind: "unavailable", reason: "startup" }]] as const) {
    const h = harness(), startupGate = gate()
    const startup = { context: { deviceId: "fixture", settingsGen: "migration", at: 1, shortcutId: "orig01", platform: { browser: "chrome" as const, os: "linux" as const }, commands: [] }, async readSnapshot() { startupGate.enter(); await startupGate.held; return { schema: 1, device: h.records.device, settingsDocument: h.records["doc:settings"], unclaimed: null, legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [] } }, async removeLocal() { throw Error("remove") }, async deleteDatabase() { throw Error("db") }, async removeSession() { throw Error("session") } }
    const writer = api.starting({ ...h.deps, startup }); await startupGate.entered
    equal(await (operation === "read" ? writer.readClaimNotice() : writer.acknowledgeClaimNotice(origin, notice)), expected, "pending startup notice closed")
    equal(h.reads, 0, "pending startup operation no IO"); startupGate.release(); equal(await writer.ready(), "ok", "real startup releases")
    equal(await writer.readClaimNotice(), { kind: "pending", notice }, "read after readiness"); await writer.dispose(); await h.writer.dispose()
  }
  {
    const h = harness(); h.hold("get1")
    const reading = h.writer.readClaimNotice(); await h.held.entered
    const disposing = h.writer.dispose(); h.held.release()
    equal(await reading, { kind: "unavailable", reason: "stale" }, "disposed pending notice read withheld")
    await disposing; equal(h.batches, [], "disposed read zero writes")
  }
  {
    const h = harness(); h.hold("get1")
    const reading = h.writer.readClaimNotice(); await h.held.entered
    const expected = clone(notice), acknowledging = h.writer.acknowledgeClaimNotice(origin, expected)
    expected.dropped = 9; expected.extension.nested[0] = false
    h.held.release(); await reading
    equal(await acknowledging, { kind: "committed", write: { kind: "resolved" } }, "queued expected snapshot captured at invocation")
    await h.writer.dispose()
  }
  {
    const h = harness(); h.mode("no-apply"); h.hold("get3")
    const pending = h.writer.acknowledgeClaimNotice(origin, notice); await h.held.entered
    const reading = h.writer.readClaimNotice(), ack = h.writer.acknowledgeClaimNotice(origin, notice)
    h.held.release(); equal((await pending).kind, "unconfirmed", "held uncertain acknowledgement")
    const reads = h.reads
    equal(await reading, { kind: "unavailable", reason: "stale" }, "queued read honors uncertainty")
    equal(await ack, { kind: "unavailable", reason: "stale" }, "queued OK honors uncertainty")
    equal(h.reads, reads, "queued uncertain work zero IO"); await h.writer.dispose()
  }
  for (const initial of ["newer", "failed"] as const) {
    const h = harness(), marker = new Error("synthetic startup failure")
    const startup = { context: { deviceId: "fixture", settingsGen: "migration", at: 1, shortcutId: "orig01", platform: { browser: "chrome" as const, os: "linux" as const }, commands: [] }, async readSnapshot() {
      if (initial === "failed") throw marker
      return { schema: 2, device: undefined, settingsDocument: undefined, unclaimed: undefined, legacy: { presentKeys: [], values: {}, refreshTokenWasNonempty: false }, interimKeysPresent: [] }
    }, async removeLocal() { throw Error("remove") }, async deleteDatabase() { throw Error("db") }, async removeSession() { throw Error("session") } }
    const writer = api.starting({ ...h.deps, startup })
    let observed: unknown; try { observed = await writer.ready() } catch (error) { observed = error }
    check(initial === "failed" ? observed === marker : observed === "newer-layout", "failed/newer real readiness")
    const before = h.counts(), reason = initial === "failed" ? "startup" : "newer-layout"
    equal(await writer.readClaimNotice(), { kind: "unavailable", reason }, "failed/newer notice read closed")
    equal(await writer.acknowledgeClaimNotice(origin, notice), { kind: "unavailable", reason }, "failed/newer notice OK closed")
    equal(h.reads, 0, "failed/newer notice no operation IO"); equal(h.counts(), before, "failed/newer notice no ingress")
    await writer.dispose(); await h.writer.dispose()
  }
  {
    const h = harness(), before = h.counts()
    equal(await Reflect.apply(h.writer.acknowledgeClaimNotice, h.writer, [origin, { acct, dropped: 1, extension: Infinity }]), { kind: "refused", reason: "invalid" }, "owner invalid expected")
    equal(h.batches, [], "owner invalid expected zero writes"); equal(h.reads, 0, "owner invalid expected zero IO"); equal(h.counts(), before, "owner invalid expected zero ingress"); await h.writer.dispose()
  }
  for (const stage of ["get1", "get2", "set", "get3"]) {
    const h = harness(); h.hold(stage)
    const pending = h.writer.acknowledgeClaimNotice(origin, notice); await h.held.entered
    let drained = false; const disposing = h.writer.dispose().then(() => { drained = true })
    await turns(); equal(drained, false, "dispose drains notice IO " + stage)
    h.held.release(); const result = await pending; await disposing
    equal(result, stage === "get1" || stage === "get2" ? { kind: "unavailable", reason: "stale" } : { kind: "unconfirmed", write: { kind: "resolved" }, cause: { kind: "stopped" } }, "notice disposal result " + stage)
    equal(h.batches.length, stage === "get1" || stage === "get2" ? 0 : 1, "no set after before-set disposal " + stage)
    observations.push({ name: "dispose-" + stage, result, batches: h.batches, records: h.records })
  }
  for (const stage of ["set", "get3"]) {
    const h = harness(); h.hold(stage)
    const pending = h.writer.acknowledgeClaimNotice(origin, notice); await h.held.entered
    const beforeReads = h.reads, beforeBatches = h.batches.length
    const settings = h.writer.changeSharedSetting(origin, { kind: "theme", value: "dark" })
    const filter = h.writer.change(origin, { acct, playlist, desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" })
    const incoming = h.writer.receiveSyncDocument({ kind: "settings" }), flush = h.writer.flushSync(), read = h.writer.readClaimNotice()
    await turns()
    equal(h.reads, beforeReads, "shared lane held reads " + stage); equal(h.batches.length, beforeBatches, "shared lane held writes " + stage)
    h.held.release(); equal((await pending).kind, "committed", "notice releases after confirmation")
    equal((await settings).kind, "committed", "queued Settings commits")
    equal((await filter).kind, "result", "queued Filter executes")
    equal((await incoming).kind, "unavailable", "queued incoming executes")
    equal((await flush).kind, "idle", "queued flush executes")
    equal(await read, { kind: "empty" }, "queued read sees cleared notice")
    await h.writer.dispose()
  }
  {
    const h = harness(); h.mode("no-apply")
    equal((await h.writer.changeSharedSetting(origin, { kind: "theme", value: "dark" })).kind, "unconfirmed", "Settings establishes existing uncertainty")
    const reads = h.reads, before = h.counts()
    equal(await h.writer.readClaimNotice(), { kind: "unavailable", reason: "stale" }, "notice read honors Settings uncertainty")
    equal(await h.writer.acknowledgeClaimNotice(origin, notice), { kind: "unavailable", reason: "stale" }, "notice OK honors Settings uncertainty")
    equal(h.reads, reads, "Settings uncertainty notice zero IO"); equal(h.counts(), before, "Settings uncertainty notice zero ingress"); await h.writer.dispose()
  }
  for (const mode of ["no-apply", "read-failed"]) {
    const h = harness(); h.mode(mode)
    equal((await h.writer.acknowledgeClaimNotice(origin, notice)).kind, "unconfirmed", "uncertain notice")
    const before = h.counts(), reads = h.reads, batches = h.batches.length
    equal(await h.writer.readClaimNotice(), { kind: "unavailable", reason: "stale" }, "uncertain notice read blocked")
    equal(await h.writer.acknowledgeClaimNotice(origin, notice), { kind: "unavailable", reason: "stale" }, "uncertain repeated OK blocked")
    equal(await h.writer.claim(), { kind: "unavailable", reason: "stale" }, "uncertain claim blocked")
    equal(await h.writer.changeSharedSetting(origin, { kind: "theme", value: "dark" }), { kind: "unavailable", reason: "stale" }, "uncertain Settings blocked")
    equal(await h.writer.change(origin, { acct, playlist, desired: { mode: "deny", on: true }, clearListedChannels: "not-confirmed" }), { kind: "unavailable", reason: "stale" }, "uncertain Filter blocked")
    equal(await h.writer.receiveSyncDocument({ kind: "settings" }), { kind: "unavailable", reason: "authority" }, "uncertain incoming blocked")
    equal(await h.writer.flushSync(), { kind: "unavailable" }, "uncertain flush blocked"); await h.writer.startSync()
    equal(h.reads, reads, "uncertainty no more IO"); equal(h.batches.length, batches, "uncertainty no more sets"); equal(h.counts(), before, "uncertainty no ingress"); await h.writer.dispose()
  }
  {
    const h = harness({ ...seed(), device: { ...seed().device, claimNotice: null, upgradeNote: null, lastAccount: null, newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: true }, unclaimed: { from: "1.5.0", autoAdd: [playlist], shortcutPlaylist: null, filters: {}, at: 1 } })
    const lookup = gate()
    const authority = { acct, lease: "lease", browserSession: "session", consentGeneration: "consent", signedIn: true as const, incognito: false as const }
    const writer = api.create({ ...h.deps, claim: { kind: "fixture", authority: { async read() { return { kind: "ready", authority } } }, session: { async takeLookup() { return true } }, ownership: { async lookup() { lookup.enter(); await lookup.held; return { kind: "fixture-owned", authority, lineage: "local-migration-only", ownedPlaylistIds: new Set([playlist]) } } } } })
    const claiming = writer.claim(); await lookup.entered
    const reads = h.reads, batches = h.batches.length
    const reading = writer.readClaimNotice(), acknowledging = writer.acknowledgeClaimNotice(origin, notice)
    await turns(); equal(h.reads, reads, "read/OK cannot enter held claim"); equal(h.batches.length, batches, "OK no early set")
    lookup.release(); equal((await claiming).kind, "committed", "held real claim commits")
    const saved = await reading; check(saved.kind === "pending", "queued read sees actual saved claim notice")
    equal(await acknowledging, { kind: "unchanged", reason: "different-notice" }, "stale OK cannot clear new claim")
    await writer.dispose(); await h.writer.dispose()
    observations.push({ name: "held-claim", saved, records: h.records, batches: h.batches, counts: h.counts() })
  }
  return { checks, observations }
}

test("claim notice joins the actual owner's lane, readiness, disposal and global uncertainty", async () => {
  const { createStartingLocalFilterWriter } = await import("./local-filter-writer")
  const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_P"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("fixture identifiers")
  expect((await noticeOwnerAcceptance({ create: createLocalFilterWriter, starting: createStartingLocalFilterWriter }, acct, playlist)).checks).toBeGreaterThan(100)
})
