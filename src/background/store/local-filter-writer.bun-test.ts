import { expect, test } from "bun:test"
import { execFileSync, spawnSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { isAccountKey, isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model"
import { createLocalFilterWriter, type LocalFilterChange, type LocalWriteStorage } from "./local-filter-writer"

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
    const writer = create({ syncClock: { now: () => 0, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local, sync: { subscribe() { throw Error("Inactive writer subscribed") }, async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => 100 + times++, generation: () => `g${++generations}` })
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
    const writer = create({ syncClock: { now: () => 0, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local: x.local, sync: { subscribe() { throw Error("Inactive writer subscribed") }, async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => 1, generation: () => { throw marker } })
    let rejected: unknown
    try { await writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }) } catch (error) { rejected = error }
    check(rejected === marker, "programmer exception propagates")
    equal(x.sets.length, 0, "programmer failure no set")
    equal(x.records.sync, history(), "pre-commit failure leaves full history false")
  }
  {
    const x = harness(), marker = new Error("clock failure")
    const writer = create({ syncClock: { now: () => 0, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local: x.local, sync: { subscribe() { throw Error("Inactive writer subscribed") }, async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => { throw marker }, generation: () => "unused" })
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
          if (!sync) throw Error("Missing control history")
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
        'export function prepareDocumentBody() { globalThis.preparations++; return {kind:"invalid",reason:"json"} }' }))
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
    const writer=module.exports.createLocalFilterWriter({syncClock:{now:()=>0,after(){throw Error("timer")}},onSyncResult(){},sync:{subscribe(){throw Error("subscribe")},async get(){throw Error("Forbidden sync")}},local:{async get(){reads++;return records},async set(){sets++;throw Error("Unexpected set")}},now:()=>1,generation:()=>{generations++;return "unexpected"}});
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
      [entry, resolve(import.meta.dir, "write-preparation.ts"), resolve(import.meta.dir, "channel-filter-edit.ts"), resolve(import.meta.dir, "sync-write-admission.ts"), resolve(import.meta.dir, "sync-codec.ts"), resolve(import.meta.dir, "sync-inventory.ts")].includes(file)).toBe(true)
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
  expect(result.exports).toEqual(["createLocalFilterWriter"])
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
    const writer = create({ syncClock: { now: () => 0, after() { throw Error("Inactive writer scheduled timer") } }, onSyncResult() {}, local, sync, now: () => 100, generation: () => `g${++generations}` })
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
    const writer=module.exports.createLocalFilterWriter({syncClock:{now:()=>0,after(){throw Error("timer")}},onSyncResult(){},local:{async get(){return records},async set(items){Object.assign(records,items)}},sync:{subscribe(){throw Error("subscribe")},async get(){return {"s:meta":{v:1,id:"history",created:0}}}},now:()=>100,generation:()=>"g"+(++gens)});
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
    const deps = { local, sync, syncClock: { now: () => monotonic, after() { throw Error("Inactive writer scheduled timer") } },
      onSyncResult() {}, now: () => 100, generation: () => `g${++generations}` }
    const core = create(deps)
    const writer = { ...core, flushSync() { monotonic += 5000; return core.flushSync() } }
    const change = (on = true) => writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on }, clearListedChannels: "not-confirmed" })
    return { records, syncRecords, reads, sets, syncWrites, local, sync, deps, writer, change, counts: () => ({ syncReads, generations }) }
  }
  const captured = { key: { kind: "filter", acct, playlist }, name: key, gen: "g1", document: g1 }
  const ok = { kind: "result", result: { ok: true } }
  const ack = { ...history, pushed: { ...history.pushed, [key]: "g1" } }
  {
    const h = harness()
    equal(await h.writer.flushSync(), { kind: "pushed", sent: [captured], repaired: [] }, "exact captured push result")
    equal(h.syncWrites, [{ [base]: g1 }], "exact one complete remote set")
    equal(h.sets, [{ sync: ack }], "exact full raw acknowledgement")
    equal(h.records, { ...seed(), sync: ack }, "flush never restamps documents")
    equal(h.syncRecords, { ...remote(), [base]: g1 }, "complete remote readback")
    equal(h.reads, [null, null], "full flush local reads")
    equal(h.counts(), { syncReads: 2, generations: 1 }, "flush does not allocate a generation")
    equal(await h.writer.flushSync(), { kind: "idle" }, "duplicate suppression")
    equal(h.syncWrites, [{ [base]: g1 }], "duplicate never resends")
    equal(h.sets, [{ sync: ack }], "duplicate never reacknowledges")
    delete h.syncRecords[base]
    equal(await h.writer.flushSync(), { kind: "pushed", sent: [captured], repaired: [] }, "acknowledged vanished base restores")
    equal(h.syncWrites, [{ [base]: g1 }, { [base]: g1 }], "restoration sends complete unchanged generation")
    equal(h.sets, [{ sync: ack }], "restoration already acknowledged needs no local write")
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
    equal(h.sets, [{ sync: { ...ack, pushed: { ...ack.pushed, "doc:settings": "settings-pending", [tombKey]: "tomb" } } }], "protected newer generation is never acknowledged")
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
    h.local.get = async keys => { if (++localReads === (stage === "local-pre" ? 1 : stage === "local-post" ? 2 : -1)) throw marker; return get(keys) }
    h.sync.get = async () => { if (++remoteReads === (stage === "sync-pre" ? 1 : stage === "sync-post" ? 2 : -1)) throw marker; return syncGet() }
    if (stage === "sync-set") h.sync.set = async () => { throw marker }
    if (stage === "ack") h.local.set = async () => { throw marker }
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
    equal(h.records, seed(), "failure never acknowledges")
    equal(h.syncWrites.length, ["local-pre", "sync-pre", "sync-set"].includes(stage) ? 0 : 1, "resolved set evidence survives failed later stage")
    h.local.get = get; h.sync.get = syncGet; h.local.set = async items => { h.sets.push(clone(items)); Object.assign(h.records, clone(items)) }
    h.sync.set = async items => { h.syncWrites.push(clone(items)); Object.assign(h.syncRecords, clone(items)) }
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
    else h.local.set = async items => { await localSet(items); throw marker }
    equal((await h.writer.flushSync()).kind, lost === "sync" ? "sync-set-failed" : "acknowledgement-failed", "lost reply reports actual failed stage")
    const fresh = harness(clone(h.records), clone(h.syncRecords))
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
    equal(h.sets, [], "unconfirmed never writes history")
    equal(h.counts().syncReads, ["off", "consent", "device", "schema", "history"].includes(change) ? 1 : 2, "local authority checked before more sync access")
  }
  {
    const h = harness(), set = h.sync.set
    h.sync.set = async items => { await set(items); h.records.sync = { ...history, future: { concurrent: own } } }
    equal((await h.writer.flushSync()).kind, "pushed", "latest history extensions remain authoritative")
    equal(h.sets, [{ sync: { ...ack, future: { concurrent: own } } }], "acknowledgement merges latest full raw history")
  }
  {
    const h = harness(), remoteSet = h.sync.set, localSet = h.local.set
    let enterSet!: () => void, releaseSet!: () => void, enterAck!: () => void, releaseAck!: () => void
    const setEntered = new Promise<void>(done => { enterSet = done }), setHold = new Promise<void>(done => { releaseSet = done })
    const ackEntered = new Promise<void>(done => { enterAck = done }), ackHold = new Promise<void>(done => { releaseAck = done })
    h.sync.set = async items => { enterSet(); await setHold; await remoteSet(items) }
    h.local.set = async items => { if (!Object.hasOwn(items, key)) { enterAck(); await ackHold }; await localSet(items) }
    const flush = h.writer.flushSync(); await setEntered
    const edit = h.change()
    equal(h.reads, [null], "queued edit cannot read during sync set")
    releaseSet(); await ackEntered
    equal(h.reads, [null, null], "queued edit waits through acknowledgement")
    releaseAck(); equal((await flush).kind, "pushed", "held flush confirms")
    equal(await edit, ok, "queued edit sees confirmed baseline")
    equal(h.sets.length, 2, "ack and new edit each write once")
    equal(h.sets[1] && Object.keys(h.sets[1]), [key], "acknowledged queued edit needs only Filter write")
    equal(h.records.sync, ack, "queued generation remains pending")
  }
  {
    const h = harness(), set = h.local.set, marker = Error("ack failed")
    h.local.set = async items => { if (!Object.hasOwn(items, key)) throw marker; await set(items) }
    const flush = h.writer.flushSync(), edit = h.change()
    equal((await flush).kind, "acknowledgement-failed", "queued edit follows truthful acknowledgement failure")
    equal(await edit, ok, "queued edit repairs acknowledgement debt")
    equal(h.sets, [{ [key]: { ...g1, gen: "g2", at: 100, by: "device", data: { ...g1.data, on: true } }, sync: ack }], "failed ack then replacement is one exact batch")
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
    const writer = create({ local, sync, now: () => wall, generation: () => `g${++generation}`,
      syncClock: { now: () => time, after(milliseconds, run) {
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
    h.local.set = async items => { if (Object.keys(items).join() === "sync") await ackGate; await ack(items) }
    await h.fire(5000)
    h.move(6000, "queued edit"); const before = h.reads.length, edit = h.change(true)
    await settle(); equal(h.reads.length, before, "held native set blocks queued edit reads")
    h.move(12000); releaseSet(); await settle()
    equal(h.reads.length, before + 1, "held acknowledgement still blocks edit")
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
    if (stage === "ack") h.local.set = async items => { if (Object.keys(items).join() === "sync") throw marker; await ack(items) }
    if (stage === "postflight") h.sync.get = async () => { if (h.invocations.length) throw marker; return get() }
    await h.fire(5000)
    const outcome = h.results.at(-1)
    equal(outcome?.kind, stage === "preflight" ? "rejected" : stage === "set" ? "sync-set-failed" : stage === "ack" ? "acknowledgement-failed" : "unconfirmed", "opaque original stage " + stage)
    const error = outcome && ("error" in outcome ? outcome.error : outcome.kind === "unconfirmed" && outcome.cause.kind === "read-failed" ? outcome.cause.error : undefined)
    equal(error === marker, true, "original opaque error identity " + stage)
    equal(h.counts().subscriptions, 0, "opaque failure removes listener")
    equal(h.timers.size, 0, "opaque failure cancels tickets")
    h.sync.get = get; h.sync.set = set; h.local.set = ack
    const count = h.invocations.length, resultCount = h.results.length
    h.move(6000); await h.writer.startSync(); await h.change(true); await h.event()
    equal(h.invocations.length, count, "opaque stop survives start event and edit")
    h.move(7000)
    equal(await h.writer.flushSync(), { kind: "deferred", notBefore: stage === "preflight" ? 8000 : 10000 }, "rejected attempts remain charged and manual stays paced " + stage)
    await h.fire(20000)
    equal(h.invocations.length, count, "opaque stop survives start event and edit")
    equal(h.results.length, resultCount, "opaque stop never silently restarts")
    await h.writer.flushSync(); equal(h.results.length, resultCount, "manual does not clear automatic stop")
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
    { name: "no-op-postponement", assertion: "no-op cannot postpone quiet deadline", source: original.replace('if (result.kind === "unchanged") {', 'if (result.kind === "unchanged") { quietUntil = deps.syncClock.now() + 2000; arm(Math.max(quietUntil, nextInvocation), "edit");') },
    { name: "manual-bypass", assertion: "manual cannot bypass initial pacing", source: original.replace('return enqueue(attempt)', 'return enqueue(async () => { quietUntil = nextInvocation = 0; return attempt() })') },
    { name: "timer-instead-of-invocation", assertion: "spacing uses actual invocation rather than due time", source: original.replace('nextInvocation = invokedAt + 5000', 'nextInvocation += 5000') },
    { name: "self-rearming-callback", assertion: "timer callback cannot rearm", source: original.replace('await automatic()', 'await automatic("start")') },
    { name: "duplicate-own-event-set", assertion: "first batch invokes at barrier", source: original.replace('let quietUntil = 0', 'let duplicated = false; let quietUntil = 0').replace('if (plan.sent.length === 0 && plan.repairs.length === 0) return { kind: "idle" }', 'if (plan.sent.length === 0 && plan.repairs.length === 0) { if (nextInvocation > 5000 && !duplicated) { duplicated = true; await deps.sync.set(Object.fromEntries(Object.entries(records).filter(([key]) => key.startsWith("doc:")).map(([key,value]) => [key.replace(/^doc:/,"s:"),value]))) }; return { kind: "idle" } }') },
    { name: "automatic-restart-after-error", assertion: "startup error cannot automatically restart startup-read", source: original.replace('if (lifetime.kind === "stopped" || lifetime.kind === "disposed") return', 'if (lifetime.kind === "disposed") return; if (lifetime.kind === "stopped") lifetime = { kind: "inactive" }') }
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
    const writer = create({ local: io, sync, now: () => { wall++; return 100 }, generation: () => `g${++generation}`,
      syncClock: { now: () => { clock++; return time }, after(ms, run) { const id = ++scheduled; timers.set(id, { due: time + ms, run }); return () => { cancelled++; timers.delete(id) } } },
      onSyncResult(result) { results.push(result) } })
    return { writer, records, remote: snapshot, reads, sets, writes, results, io, sync, timers,
      counts: () => ({ generation, wall, clock, subscriptions, scheduled, cancelled }), move: (at: number) => { time = at },
      event: async () => { listener?.(); await settle() },
      change: (mode: "allow" | "deny", on: boolean, confirm?: string) => writer.change({ kind: "ui", windowId: 1, incognito: false },
        confirm === undefined ? { acct, playlist, desired: { mode, on }, clearListedChannels: "not-confirmed" }
          : { acct, playlist, desired: { mode, on }, clearListedChannels: "confirmed", expectedGeneration: confirm }) }
  }
  const primary = harness(), counts = primary.counts()
  equal(await primary.writer.receiveSyncFilter(key), adopted, "raw adoption result")
  equal(primary.sets, [expectedSet], "one exact two-key set")
  equal(primary.records, { ...local, ...expectedSet }, "whole replacement preserves unrelated pending body")
  equal(primary.remote, remote, "receive never mutates remote")
  equal(primary.reads, ["local", "sync", "local", "sync", "local", "local", "sync"], "finite staged IO order")
  equal(primary.counts(), counts, "receive changes no clocks tickets subscriptions stamps")
  equal(primary.results, [], "manual receive emits no automatic result")
  equal(await primary.writer.receiveSyncFilter(key), { kind: "idle" }, "repeat receive idle")
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
    equal(await h.writer.receiveSyncFilter(key), { kind: "adopted", received: { ...received, document } }, "literal complete chunk adoption")
    equal(h.sets, [{ ...expectedSet, [F]: document }], "chunk suffix field retained")
    equal(h.remote, before, "chunks unknown items never cleaned")
  }
  for (const document of [
    { v: 1, gen: "f1", at: 20, by: "b", data: { future: [null, 1] }, extra: true },
    { ...incoming, data: { ...incoming.data, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "x".repeat(10000), null, { suffix: true }, 7]] } }
  ]) {
    const h = harness(); h.remote[B] = document
    equal(await h.writer.receiveSyncFilter(key), { kind: "adopted", received: { ...received, document } }, "raw omissions labels and tuple suffixes retained")
    equal(h.records[F], document, "decoded defaults never materialized")
  }
  {
    const h = harness(), own = JSON.parse('{"__proto__":{"keep":true},"toJSON":"inert"}')
    h.records.sync = { ...history, ...own, pushed: { ...history.pushed, "unrecognized:key": "opaque-gen" } }
    equal((await h.writer.receiveSyncFilter(key)).kind, "adopted", "opaque history can receive")
    equal(h.records.sync, { ...expectedSet.sync, ...own, pushed: { ...expectedSet.sync.pushed, "unrecognized:key": "opaque-gen" } }, "opaque history exact preservation")
  }
  {
    const h = harness(); let calls = 0, result
    h.io.set = async items => { h.sets.push(items); Object.assign(h.records, items) }
    Object.defineProperty(Object.prototype, "toJSON", { configurable: true, value() { calls++; throw Error("inherited serializer invoked") } })
    try { result = await h.writer.receiveSyncFilter(key) } finally { Reflect.deleteProperty(Object.prototype, "toJSON") }
    equal(result, adopted, "raw snapshots never invoke inherited serialization hooks")
    equal(calls, 0, "inherited serializer stays inert")
    equal(h.sets, [expectedSet], "hook-safe snapshot preserves raw values")
  }
  for (const gen of ["fpending", "f1"]) {
    const h = harness(); h.records[F] = { ...old, gen }; h.remote[B] = { ...incoming, at: 200 }
    equal(await h.writer.receiveSyncFilter(key), unavailable("pending"), "target pending remains unavailable")
    equal(h.sets, [], "target pending body never overwritten")
  }
  {
    const h = harness(); h.records[F] = clone(incoming)
    equal(await h.writer.receiveSyncFilter(key), { kind: "idle" }, "exact debt stays idle")
    equal(h.sets, [], "exact debt not repaired by receive")
    h.records[Q] = clone(remote[`s:filter:${acct}:PL_Q`])
    equal((await h.writer.flushSync()).kind, "reconciled", "existing outbound exact debt repair remains available")
  }
  for (const patch of [{ at: 10, by: "device-a" }, { at: 10, by: "z" }, { at: 9 }, { gen: "f0", at: 10 }, { gen: "f0", at: 200 }]) {
    const h = harness(); h.remote[B] = { ...incoming, ...patch }
    equal(await h.writer.receiveSyncFilter(key), unavailable("conflict"), "equal lower same-generation conflict")
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
    equal(await h.writer.receiveSyncFilter(key), unavailable("document"), "unsupported incoming " + variant)
    equal(h.records, local, "unsupported incoming leaves local exact " + variant)
  }
  for (const value of [undefined, null, { ...old, v: 2 }, { v: 1, gen: "dead", at: 1, by: "b", deleted: true }, { ...old, data: { on: 2 } }]) {
    const h = harness(); if (value === undefined) delete h.records[F]; else h.records[F] = value
    equal(await h.writer.receiveSyncFilter(key), unavailable("document"), "unsupported local target")
    equal(h.writes, [], "unsupported local no outbound write")
  }
  for (const value of [undefined, null, { ...setup, v: 2 }, { ...setup, data: { autoAdd: [{ pl: "PL_other" }] } }]) {
    const h = harness(); if (value === undefined) delete h.records[S]; else h.records[S] = value
    equal(await h.writer.receiveSyncFilter(key), unavailable("account-context"), "target selected setup required")
    equal(h.sets, [], "no context no adoption")
  }
  for (const value of [{ v: 2, gen: "future", at: 1, by: "b", n: 99 }, { ...old, gen: "q2" }, { malformed: true }, { v: 1, gen: "dead", at: 30, by: "b", deleted: true }]) {
    const h = harness(); h.remote[`s:filter:${acct}:PL_Q`] = value
    equal((await h.writer.receiveSyncFilter(key)).kind, "adopted", "unrelated semantic observation does not veto target")
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
    equal(await h.writer.receiveSyncFilter(key), unavailable("authority"), "authority gate " + fault)
    equal(h.reads, ["local"], "authority before sync " + fault)
    equal(h.sets, [], "authority no set " + fault)
  }
  for (const value of [undefined, null, NaN, {}, { v: 1, id: "h", created: undefined }, { v: 2, id: "h", created: 1 }, { v: 1, id: "other", created: 1 }, { v: 1, id: "h", created: 1, reset: true }]) {
    const h = harness(); if (value === undefined) delete h.remote["s:meta"]; else h.remote["s:meta"] = value
    equal(await h.writer.receiveSyncFilter(key), unavailable("history"), "history choice unavailable")
    equal(h.sets, [], "no history writes")
  }
  {
    const h = harness(); for (let i = Object.keys(h.remote).length; i < 481; i++) h.remote[`unknown:${i}`] = null
    const before = clone(h.remote)
    equal((await h.writer.receiveSyncFilter(key)).kind, "adopted", "full physical inventory permits local adoption")
    equal(h.remote, before, "all 481 physical items unchanged")
  }
  {
    const h = harness(); h.remote.invalid = undefined
    equal(await h.writer.receiveSyncFilter(key), unavailable("document"), "physical invalidity blocks")
    equal(h.sets, [], "physical invalidity no set")
  }
  for (const status of ["full", "update-needed"]) {
    const h = harness(); h.records.sync = { ...history, status }
    equal((await h.writer.receiveSyncFilter(key)).kind, "adopted", "steady supported history " + status)
    equal(h.records.sync, { ...expectedSet.sync, status }, "receive preserves existing status " + status)
  }
  for (const n of [2, 3]) {
    const h = harness(), get = h.io.get; let reads = 0
    const pending = { ...pendingQ, gen: "q-external", external: { keep: true } }
    h.io.get = async keys => { if (++reads === n) h.records[Q] = pending; return get(keys) }
    equal(await h.writer.receiveSyncFilter(key), adopted, "unrelated body changed during receive")
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
    const result = await h.writer.receiveSyncFilter(key)
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
    equal(await h.writer.receiveSyncFilter(key), n === 2 ? unavailable(["id", "created", "extension"].includes(field) ? "history" : "document")
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
    try { outcome = await h.writer.receiveSyncFilter(key) } catch (error) { caught = error }
    if (["L0", "R0", "L1", "R1", "L2"].includes(stage)) equal(caught === marker, true, "precommit original error " + stage)
    else equal(outcome, stage === "set" ? { kind: "local-set-failed", received, error: marker } : { kind: "unconfirmed", received, cause: { kind: "read-failed", error: marker } }, "staged IO failure " + stage)
    if (outcome && typeof outcome === "object" && "error" in outcome) equal(outcome.error === marker, true, "set error identity")
    if (outcome && typeof outcome === "object" && "cause" in outcome) equal((outcome.cause as { error: unknown }).error === marker, true, "post read error identity")
    h.io.get = get; h.sync.get = syncGet; h.io.set = set
    await h.writer.startSync(); equal(h.counts().subscriptions, 0, "failure keeps stopped lifetime " + stage)
    await h.writer.receiveSyncFilter(key); await h.writer.startSync()
    equal(h.counts().subscriptions, 0, "explicit successful receive never clears stop " + stage)
    equal(h.results, [], "receive failure no automatic callback")
  }
  {
    const h = harness(), set = h.io.set, marker = Error("apply then reject")
    h.io.set = async items => { await set(items); throw marker }
    const result = await h.writer.receiveSyncFilter(key)
    equal(result.kind, "local-set-failed", "unknown set rejection effects retained")
    equal(result.kind === "local-set-failed" && result.error === marker, true, "apply then reject original identity")
    equal(h.records, { ...local, ...expectedSet }, "apply then reject no rollback")
    equal(await h.writer.receiveSyncFilter(key), { kind: "idle" }, "explicit retry observes committed raw body")
  }
  for (const only of [F, "sync"]) {
    const h = harness()
    h.io.set = async items => { h.sets.push(items); h.records[only] = items[only] }
    equal(await h.writer.receiveSyncFilter(key), { kind: "unconfirmed", received, cause: { kind: "readback" } }, "torn set unconfirmed")
    equal(h.sets.length, 1, "torn set no rollback repair")
    const next = harness(h.records)
    equal(await next.writer.receiveSyncFilter(key), only === F ? { kind: "idle" } : unavailable("pending"), "fresh torn snapshot does not invent repair")
  }
  for (const stage of ["L0", "R0", "L1", "R1", "L2", "set", "L3", "R2"]) {
    const h = harness(), get = h.io.get, syncGet = h.sync.get, set = h.io.set
    let release!: () => void, entered = false, resolved = false, lr = 0, rr = 0
    const gate = new Promise<void>(done => { release = done })
    const hold = async () => { entered = true; await gate }
    h.io.get = async keys => { if (["L0", "L1", "L2", "L3"][lr++] === stage) await hold(); return get(keys) }
    h.sync.get = async () => { if (["R0", "R1", "R2"][rr++] === stage) await hold(); return syncGet() }
    h.io.set = async items => { if (stage === "set") await hold(); return set(items) }
    const pending = h.writer.receiveSyncFilter(key); void pending.then(() => { resolved = true })
    await settle(); equal(entered, true, "held actual IO " + stage)
    const readCount = h.reads.length
    const second = h.writer.receiveSyncFilter(key), edit = h.change("deny", true, "f0"), flush = h.writer.flushSync(), toggle = h.change("allow", true)
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
    const pending = h.writer.receiveSyncFilter(key); await settle(); equal(entered, true, "loss held stage " + stage)
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
      let rejected = false; try { await h.writer.receiveSyncFilter(key) } catch (error) { rejected = error instanceof Error && error.message === "Writer disposed" }
      equal(rejected, true, "disposed receive convention")
    }
  }
  {
    const h = harness(); h.remote[B] = clone(old); await h.writer.startSync(); h.remote[B] = clone(incoming)
    equal(h.timers.size, 1, "positive outbound ticket exists before receive")
    const before = h.counts(), results = clone(h.results)
    const timer = [...h.timers]
    equal(await h.writer.receiveSyncFilter(key), adopted, "active owner manual receive")
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
    { name: "target-pending-overwrite", assertion: "target pending remains unavailable", source: original.replace('if (!Object.hasOwn(history.pushed, name) || history.pushed[name] !== initial.filter.gen)', 'if (false)') },
    { name: "equal-stamp-tie", assertion: "equal lower same-generation conflict", source: original.replace('incoming.at <= initial.filter.at', 'incoming.at < initial.filter.at') },
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
    const writer = create({ local: {
      async get() { reads.push("L" + ++lr); await hooks.local(lr); return clone(records) },
      async set(items) { const n = ++ls; sets.push(clone(items)); await hooks.set(n, items); Object.assign(records, clone(items)); await hooks.afterSet(n) }
    }, sync: {
      async get() { reads.push("R" + ++rr); await hooks.remote(rr); return hooks.snapshot(clone(synced)) },
      async set(items) { invocations.push(time); writes.push(clone(items)); Object.assign(synced, clone(items)); for (const run of listeners) run() },
      subscribe(run) { listeners.add(run); return () => { listeners.delete(run) } }
    }, now: () => { wall++; return 100 + time }, generation: () => { generation++; return generation === 1 ? "f2" : "q2" },
    syncClock: { now: () => { clock++; return time }, after(ms, run) { const id = ++serial; timers.set(id, { due: time + ms, run }); return () => { timers.delete(id) } } },
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
  equal(first.reads, ["L1", "L2", "L3", "R1", "L4", "R2", "L5", "L6", "R3", "L7", "R4", "L8", "R5"], "incoming precedes outbound observations")
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
    equal(receiverCounts, before, "receiver changes no scheduling clocks")
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
      } else if (Object.hasOwn(h.records, name)) excluded[name] = clone(h.records[name])
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
    const destructive = h.change("deny", true, "f0"), manual = h.writer.receiveSyncFilter(key), flush = h.writer.flushSync(), start = h.writer.startSync()
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
    await h.writer.receiveSyncFilter(key)
    await h.writer.receiveSyncFilter({ kind: "filter", ...JSON.parse('{"acct":"AAAAAAAAAAAAAAAA","playlist":"PL_R"}') })
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
    { name: "flush-before-receive", assertion: "incoming precedes outbound observations", source: original.replace('event ? await receiveIncomingFilters() : undefined', 'event ? (await attempt(), await receiveIncomingFilters()) : undefined') },
    { name: "decoded-adoption", assertion: "automatic raw omissions preserved", source: original.replace('const document = snapshot(remote.candidate.json)', 'const document = snapshot(JSON.parse(JSON.stringify(remote.candidate.value.document)))') },
    { name: "stale-history", assertion: "serial targets retain current history across accounts", source: original.replace('let lane: Promise<void>', 'let incomingHistory: JsonObject; let lane: Promise<void>').replace('const targets: SyncFilterKey[] = []', 'incomingHistory = records.sync as JsonObject; const targets: SyncFilterKey[] = []').replace('repairedHistory(latest.history, [received])', 'repairedHistory(incomingHistory, [received])') },
    { name: "pending-overwrite", assertion: "excluded target exact pendingdoc:filter:AAAAAAAAAAAAAAAA:PL_A", source: original.replace('if (!Object.hasOwn(history.pushed, name) || history.pushed[name] !== initial.filter.gen)', 'if (false)') },
    { name: "premature-Q-ack", assertion: "automatic exact raw adoption before outbound", source: original.replace('const next = repairedHistory(latest.history, [received])', 'const next = repairedHistory(latest.history, [received]); if(next && typeof next.pushed === "object" && next.pushed) Object.assign(next.pushed, {"doc:filter:AAAAAAAAAAAAAAAA:PL_Q":"q1"})') },
    { name: "incoming-quiet", assertion: "receiver changes no scheduling clocks", source: original.replace('const next = repairedHistory(latest.history, [received])', 'quietUntil = deps.syncClock.now() + 2000; const next = repairedHistory(latest.history, [received])') },
    { name: "bypassed-pacing", assertion: "no sync invocation before five-second barrier", source: original.replace('let nextInvocation = deps.syncClock.now() + 5000', 'let nextInvocation = deps.syncClock.now()') },
    { name: "timer-receives", assertion: "timer remains outbound-only", source: original.replace('await automatic()', 'await automatic("sync")') },
    { name: "stopped-restart", assertion: "successful manual retry never restarts stopped lifetime enumeration", source: original.replace('if (lifetime.kind === "stopped" || lifetime.kind === "disposed") return', 'if (lifetime.kind === "disposed") return; if (lifetime.kind === "stopped") lifetime = {kind:"inactive"}') },
    { name: "second-owner", assertion: "receiver changes no scheduling clocks", source: original.replace('const result = await receiveAttempt(key)', 'const result = await createLocalFilterWriter(deps).receiveSyncFilter(key)') },
    { name: "F-echo", assertion: "Q-only send without F echo", source: original.replace('const plan = planSyncWrite({ local: records, sync: await deps.sync.get(), intent: { kind: "flush" } })', 'const echo = await deps.sync.get(); const plan = planSyncWrite({ local: records, sync: Object.fromEntries(Object.entries(echo).filter(([name]) => name !== "s:filter:AAAAAAAAAAAAAAAA:PL_P")), intent: { kind: "flush" } })') },
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
