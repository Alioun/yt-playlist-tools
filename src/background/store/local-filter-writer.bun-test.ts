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
        reads.push([...keys])
        return Object.fromEntries(keys.filter(key => Object.hasOwn(records, key)).map(key => [key, records[key]]))
      },
      async set(items) { sets.push(items); Object.assign(records, items) }
    }
    const writer = create({ local, now: () => 100 + times++, generation: () => `g${++generations}` })
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
    const writer = create({ local: x.local, now: () => 1, generation: () => { throw marker } })
    let rejected: unknown
    try { await writer.change({ kind: "ui", windowId: 1, incognito: false }, { acct, playlist, desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }) } catch (error) { rejected = error }
    check(rejected === marker, "programmer exception propagates")
    equal(x.sets.length, 0, "programmer failure no set")
    equal(x.records.sync, history(), "pre-commit failure leaves full history false")
  }
  {
    const x = harness(), marker = new Error("clock failure")
    const writer = create({ local: x.local, now: () => { throw marker }, generation: () => "unused" })
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
        return { async change(origin, change) {
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
    const writer=module.exports.createLocalFilterWriter({local:{async get(){reads++;return records},async set(){sets++;throw Error("Unexpected set")}},now:()=>1,generation:()=>{generations++;return "unexpected"}});
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
      [entry, resolve(import.meta.dir, "write-preparation.ts"), resolve(import.meta.dir, "channel-filter-edit.ts")].includes(file)).toBe(true)
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
