import { expect, test } from "bun:test"
import { executeSharedSetting } from "./shared-setting-execution"
import { decodeDevice, decodeSyncState } from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { cases as optionCases, initial as optionInitial } from "../../../tools/fixtures/shared-options/specimens"

test.each(optionCases)("single-document executor confirms ordinary option $name with sync off", async specimen => {
  let records = structuredClone(optionInitial), sets = 0, remote = 0
  const batches: Readonly<JsonObject>[] = []
  function object(value: unknown): JsonObject {
    if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Expected finite fixture object")
    return value
  }
  const answer = await executeSharedSetting({
    local: {
      async get(keys) { return structuredClone(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key)))) },
      async set(items) { sets++; batches.push(structuredClone(items)); records = { ...records, ...structuredClone(items) } }
    },
    sync: { async get() { remote++; throw Error("Sync-off must not call remote storage") } },
    authority: () => ({ kind: "ready", device: decodeDevice(records.device), rawDevice: object(records.device), history: {
      raw: object(records.sync), editedSinceOff: false, joined: null
    } }),
    repairHistory() { throw Error("Sync-off must not repair remote history") },
    disposed: () => false, now: () => 200, generation: () => "executor-1"
  }, specimen.change)
  const expected = structuredClone(optionInitial)
  expected["doc:settings"] = { ...object(expected["doc:settings"]), gen: "executor-1", at: 200, by: "starting-fixture", data: specimen.expectedSettings }
  expected.sync = { ...object(expected.sync), editedSinceOff: true, everEdited: true }
  expect(answer).toEqual({ kind: "committed" })
  expect(records).toEqual(expected)
  expect(batches).toEqual([{ "doc:settings": expected["doc:settings"], sync: expected.sync }])
  expect(sets).toBe(1)
  expect(remote).toBe(0)
})

export async function executionAcceptance(execute: typeof executeSharedSetting, decode: { device: typeof decodeDevice; sync: typeof decodeSyncState }) {
  let checks = 0
  const observations: unknown[] = []
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  function check(value: unknown, label: string): asserts value { checks++; if (!value) throw Error(label) }
  function equal(actual: unknown, expected: unknown, label: string) { checks++; function same(a: unknown, b: unknown): boolean {
      if (Object.is(a, b)) return true
      if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
      const keys = Reflect.ownKeys(a)
      return keys.length === Reflect.ownKeys(b).length && keys.every(key => Object.hasOwn(b, key) && same(Object.getOwnPropertyDescriptor(a, key)?.value, Object.getOwnPropertyDescriptor(b, key)?.value))
    }
    if (!same(actual, expected)) throw Error(label) }
  const stamp = { v: 1, gen: "old", at: 1, by: "fixture", extension: { keep: ["envelope"] } }
  function harness(raw: unknown = { ...stamp, data: {} }, on = false) {
    let records: Record<string, unknown> = { schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: on },
      "doc:settings": raw, sync: { joined: on ? "history" : null, pushed: {}, status: on ? "ok" : "off", editedSinceOff: false, extension: { keep: [1] } } }
    let remote: Record<string, unknown> = { "s:meta": { v: 1, id: "history", created: 0 } }
    let mode: "ok" | "reject" | "partial" | "read-fail" | "authority" = "ok", sets = 0, generations = 0, times = 0, syncReads = 0
    const error = { synthetic: "original" }, batches: unknown[] = [], reads: unknown[] = []
    const deps = {
      local: { async get(keys: readonly string[] | null) {
        reads.push(keys)
        if (sets && mode === "read-fail") throw error
        return copy(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))
      }, async set(items: Readonly<Record<string, JsonValue>>) {
        sets++; batches.push(copy(items))
        if (mode === "reject") throw error
        if (mode !== "partial") records = { ...records, ...copy(items) }
        if (mode === "authority") records.device = { id: "other", consent: { v: 1, at: 1 }, syncOn: on }
      } },
      sync: { async get() { syncReads++; if (!on) throw Error("off sync access"); return copy(remote) } },
      authority(values: Readonly<Record<string, unknown>>) {
        const device = decode.device(values.device), state = decode.sync(values.sync)
        return { kind: "ready" as const, device, rawDevice: copy(records).device as import("../../shared/contracts/json").JsonObject,
          history: { raw: copy(records).sync as import("../../shared/contracts/json").JsonObject, editedSinceOff: state.editedSinceOff, joined: state.joined } }
      }, repairHistory(raw: import("../../shared/contracts/json").JsonObject, repairs: readonly import("./sync-write-admission").SyncDocumentRecord[]) {
        const state = decode.sync(raw), pending = repairs.filter(record => state.pushed[record.name] !== record.gen)
        return pending.length ? { ...raw, pushed: { ...state.pushed, ...Object.fromEntries(pending.map(record => [record.name, record.gen])) } } : undefined
      }, disposed: () => false, now() { times++; return 100 }, generation() { generations++; return "new" }
    }
    return { deps, raw: () => copy(records), remote(value: typeof remote) { remote = value }, records(value: typeof records) { records = value }, mode(value: typeof mode) { mode = value },
      report: () => ({ records: copy(records), batches, reads, sets, generations, times, syncReads }), error }
  }
  for (const raw of [null, { ...stamp, deleted: true }]) {
    const h = harness(raw)
    equal(await execute(h.deps, { kind: "theme", value: "system" }), { kind: "unchanged" }, "absent default no-op does not create a document")
    equal(h.report().sets, 0, "no-op has no persistence")
    equal(h.report().generations, 0, "no-op has no stamp")
    equal(h.report().syncReads, 0, "off no-op never reads sync")
    equal(await execute(h.deps, { kind: "default-percentage", value: 0 }), { kind: "committed" }, "default edit confirmed")
    const saved = h.raw()["doc:settings"]
    check(saved && typeof saved === "object" && "data" in saved && "gen" in saved, "saved document")
    check(!("deleted" in saved), "replacement removes only deleted marker")
    equal(saved.gen, "new", "real edit stamped once")
    if (raw) equal(Object.getOwnPropertyDescriptor(saved, "extension")?.value, stamp.extension, "tombstone envelope extensions survive")
    equal(h.raw().sync, { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true, extension: { keep: [1] } }, "off history changes only edit bit")
    observations.push(h.report())
  }
  for (const value of [-1, 101, 0.5, NaN, Infinity]) {
    const h = harness()
    equal(await execute(h.deps, { kind: "default-percentage", value }), { kind: "result", result: { refused: "invalid" } }, "invalid percentage refused")
    equal([h.report().sets, h.report().generations, h.report().times, h.report().syncReads], [0, 0, 0, 0], "invalid before effects")
  }
  {
    const h = harness({ ...stamp, v: 2, data: { theme: "unknown" } })
    equal(await execute(h.deps, { kind: "theme", value: "light" }), { kind: "result", result: { refused: "update-needed" } }, "document scoped newer refusal")
    equal(h.report().sets, 0, "newer not written")
  }
  for (const mode of ["reject", "partial", "read-fail", "authority"] as const) {
    const h = harness(); h.mode(mode)
    const result = await execute(h.deps, { kind: "theme", value: "dark" })
    if (mode === "reject") { check(result.kind === "failed" && result.stage === "set" && result.error === h.error, "set failure retains original error") }
    else { check(result.kind === "unconfirmed", "unconfirmed never returns success"); if (mode === "read-fail") check(result.cause.kind === "read-failed" && result.cause.error === h.error, "read failure retains original error") }
    observations.push({ mode, result, ...h.report() })
  }
  {
    const h = harness({ ...stamp, data: {} }, true)
    equal(await execute(h.deps, { kind: "theme", value: "dark" }), { kind: "committed" }, "on edit admitted")
    equal(h.report().syncReads, 1, "on edit reads inventory")
    check(h.report().reads.some(keys => keys === null), "on edit reads complete local inventory")
    equal(Object.keys(h.report().batches[0] as object), ["doc:settings", "sync"], "local edit persists provenance without acknowledging new generation")
    observations.push(h.report())
  }
  for (const kind of ["full", "reset", "mismatch", "newer", "waiting", "combined"] as const) {
    const h = harness({ ...stamp, data: {} }, true)
    const remote: Record<string, unknown> = { "s:meta": { v: 1, id: kind === "mismatch" ? "different" : "history", created: 0, ...(kind === "reset" ? { reset: true } : {}) } }
    if (kind === "full") for (let i = 0; i < 480; i++) remote[`s:settings@unproven.${i}`] = "kept"
    if (kind === "newer") remote["s:settings"] = { ...stamp, v: 2, data: {} }
    if (kind === "combined") {
      for (let i = 0; i < 478; i++) remote[`s:settings@unproven.${i}`] = "kept"
      h.records({ ...h.raw(), "doc:setup:AAAAAAAAAAAAAAAA": { ...stamp, data: { autoAdd: [{ pl: "PL_kept" }] } } })
    }
    if (kind === "waiting") h.records({ ...h.raw(), sync: { joined: null, pushed: {}, status: "waiting", editedSinceOff: false } })
    h.remote(remote)
    const result = await execute(h.deps, { kind: "theme", value: "dark" })
    equal(result, kind === "full" || kind === "combined" ? { kind: "result", result: { refused: "sync-full" } }
      : kind === "newer" ? { kind: "result", result: { refused: "update-needed" } } : { kind: "unavailable", reason: "sync-writer-required" }, "complete combined occupancy and history admission")
    equal(h.report().sets, 0, "admission refusal precedes local commit")
    observations.push({ kind, result, ...h.report() })
  }
  for (const kind of ["future-noop", "overfull-noop", "incomplete", "divergent", "unrelated-future", "restoration-debt"] as const) {
    const h = harness({ ...stamp, data: {} }, true)
    const raw = h.raw(), remote: Record<string, unknown> = { "s:meta": { v: 1, id: "history", created: 0 }, "s:settings": raw["doc:settings"] }
    if (kind === "future-noop") remote["s:settings"] = { ...stamp, v: 2, data: {} }
    if (kind === "overfull-noop") for (let i = 0; i < 480; i++) remote[`unknown:${i}`] = 0
    if (kind === "incomplete") remote["s:settings"] = { ...stamp, gen: "parts", n: 2 }
    if (kind === "divergent") remote["s:settings"] = { ...stamp, extension: "different", data: {} }
    if (kind === "unrelated-future") {
      const newer = { ...stamp, v: 2, data: { unsupported: true } }
      remote["s:setup:AAAAAAAAAAAAAAAA"] = newer
      h.records({ ...raw, "doc:setup:AAAAAAAAAAAAAAAA": newer, sync: { joined: "history", pushed: {}, status: "update-needed", editedSinceOff: false } })
    }
    if (kind === "restoration-debt") {
      h.records({ ...raw, "doc:setup:AAAAAAAAAAAAAAAA": { ...stamp, data: { autoAdd: [{ pl: "PL_kept" }] } }, sync: { joined: "history", pushed: { "doc:settings": "old", "doc:setup:AAAAAAAAAAAAAAAA": "old" }, status: "ok", editedSinceOff: false } })
      for (let i = 0; i < 478; i++) remote[`unknown:${i}`] = 0
    }
    h.remote(remote)
    const result = await execute(h.deps, { kind: "theme", value: kind.endsWith("noop") ? "system" : "dark" })
    equal(result, kind === "future-noop" ? { kind: "result", result: { refused: "update-needed" } }
      : kind === "overfull-noop" ? { kind: "unchanged" } : kind === "unrelated-future" ? { kind: "committed" }
      : kind === "restoration-debt" ? { kind: "result", result: { refused: "sync-full" } } : { kind: "unavailable", reason: "sync-writer-required" }, "addressed no-op readiness and complete restoration admission")
    if (kind.endsWith("noop")) equal([h.report().sets, h.report().generations, h.report().times], [0, 0, 0], "sync-on no-op has no repair stamping or write")
    observations.push({ kind, result, ...h.report() })
  }
  return { checks, observations }
}

test("non-owning Settings execution preserves raw records and confirms exact local edits", async () => {
  expect((await executionAcceptance(executeSharedSetting, { device: decodeDevice, sync: decodeSyncState })).checks).toBeGreaterThan(40)
})
