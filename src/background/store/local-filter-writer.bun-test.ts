import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
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
    const writer = create({ local, sync: { async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => 100 + times++, generation: () => `g${++generations}` })
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
    const writer = create({ local: x.local, sync: { async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => 1, generation: () => { throw marker } })
    let rejected: unknown
    try { await writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }) } catch (error) { rejected = error }
    check(rejected === marker, "programmer exception propagates")
    equal(x.sets.length, 0, "programmer failure no set")
    equal(x.records.sync, history(), "pre-commit failure leaves full history false")
  }
  {
    const x = harness(), marker = new Error("clock failure")
    const writer = create({ local: x.local, sync: { async get() { throw Error("Off writer accessed sync") }, async set() { throw Error("Off writer wrote sync") } }, now: () => { throw marker }, generation: () => "unused" })
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
        return { flushSync: writer.flushSync, async change(origin, change) {
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
    const writer=module.exports.createLocalFilterWriter({sync:{async get(){throw Error("Forbidden sync")}},local:{async get(){reads++;return records},async set(){sets++;throw Error("Unexpected set")}},now:()=>1,generation:()=>{generations++;return "unexpected"}});
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
      [entry, resolve(import.meta.dir, "write-preparation.ts"), resolve(import.meta.dir, "channel-filter-edit.ts"), resolve(import.meta.dir, "sync-write-admission.ts"), resolve(import.meta.dir, "sync-codec.ts")].includes(file)).toBe(true)
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
    const sync = { async get() { syncReads++; return syncRecords }, async set() { throw Error("Change wrote sync") } }
    const writer = create({ local, sync, now: () => 100, generation: () => `g${++generations}` })
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
      source: writer.replace('records = await deps.local.get(null)', 'const stale = records[filterKey]; records = { ...await deps.local.get(null), [filterKey]: stale }') },
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
    const writer=module.exports.createLocalFilterWriter({local:{async get(){return records},async set(items){Object.assign(records,items)}},sync:{async get(){return {"s:meta":{v:1,id:"history",created:0}}}},now:()=>100,generation:()=>"g"+(++gens)});
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
      async get() { syncReads++; return clone(syncRecords) },
      async set(items) { syncWrites.push(clone(items)); Object.assign(syncRecords, clone(items)) }
    }
    const deps = { local, sync, now: () => 100, generation: () => `g${++generations}` }
    const writer = create(deps)
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
    expect(observed).toEqual({ caught: true, assertion: fault.assertion })
  }
})
