import { expect, test } from "bun:test"
import { executeSetupDestination, type SetupEditPorts } from "./setup-edit-execution"
import type { SetupDestinationChange } from "./setup-edit"
import { decodeDevice, decodeSyncState, isAccountKey, isPlaylistId, isShortcutId } from "../../shared/model"
import type { JsonObject, JsonValue } from "../../shared/contracts/json"
import type { SyncDocumentRecord } from "./sync-write-admission"

export async function setupExecutionAcceptance(execute: typeof executeSetupDestination) {
  let checks = 0
  const observations: unknown[] = []
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
  function check(value: unknown, label: string): asserts value { checks++; if (!value) throw Error(label) }
  function equal(actual: unknown, expected: unknown, label: string) {
    checks++
    const stable = (value: unknown) => JSON.stringify(value, (_, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
    if (stable(actual) !== stable(expected)) throw Error(`${label}: ${stable(actual)} != ${stable(expected)}`)
  }
  function brand<T>(guard: (value: unknown) => value is T, value: string): T { if (!guard(value)) throw Error(`fixture ${value}`); return value }
  const A = brand(isAccountKey, "AAAAAAAAAAAAAAAA"), B = brand(isAccountKey, "BBBBBBBBBBBBBBBB")
  const one = brand(isPlaylistId, "PL_one"), two = brand(isPlaylistId, "PL_two"), s1 = brand(isShortcutId, "short1")
  const S = `doc:setup:${A}`, SB = `doc:setup:${B}`
  const stamp = { v: 1, gen: "old", at: 1, by: "fixture", extension: { keep: ["envelope"] } }
  const quick = (expected: SetupDestinationChange["expected"], playlist: typeof one | null): SetupDestinationChange => ({ acct: A, destination: { kind: "quick-save" }, expected, playlist })
  function seed(setup: JsonValue | undefined, on: boolean): Record<string, JsonValue> {
    const records: Record<string, JsonValue> = {
      schema: 1, device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: on, future: [0] },
      "doc:settings": { ...stamp, data: { shortcuts: { list: [{ id: s1, key: null, label: "One", watchLaterOnEveryAccount: false }] } } },
      [SB]: { ...stamp, data: { quickSave: two } },
      sync: { joined: on ? "history" : null, pushed: on ? { "doc:settings": "old", [SB]: "old" } : {}, status: on ? "ok" : "off", editedSinceOff: false, extension: { keep: [1] } },
      unrelated: { kept: true }
    }
    if (setup !== undefined) {
      records[S] = setup
      if (on && setup !== null && typeof setup === "object" && !Array.isArray(setup) && setup.gen === "old") records.sync = { ...(records.sync as JsonObject), pushed: { "doc:settings": "old", [SB]: "old", [S]: "old" } }
    }
    return records
  }
  type Mode = "ok" | "reject" | "committed-reject" | "ignored" | "corrupt" | "foreign-after" | "read-fail" | "authority-after"
  function harness(initial: Record<string, JsonValue>) {
    let records = copy(initial), mode: Mode = "ok", disposed = false, sets = 0, generations = 0, times = 0, syncReads = 0, reads = 0
    let remote: Record<string, JsonValue> = { "s:meta": { v: 1, id: "history", created: 0 } }
    for (const [key, value] of Object.entries(records)) if (key.startsWith("doc:")) remote[`s:${key.slice(4)}`] = copy(value)
    const error = { synthetic: "original" }, batches: unknown[] = [], order: string[] = []
    let onRead: (count: number) => void = () => {}, onSyncRead: () => void = () => {}
    const deps: SetupEditPorts = {
      async remove() { return { kind: "unavailable", reason: "removal-host" } },
      local: {
        async get(keys) {
          reads++; order.push("get"); onRead(reads)
          if (sets && mode === "read-fail") throw error
          return copy(Object.fromEntries(Object.entries(records).filter(([key]) => keys === null || keys.includes(key))))
        },
        async set(items) {
          sets++; order.push("set"); batches.push(copy(items))
          if (mode === "reject") throw error
          if (mode !== "ignored") records = { ...records, ...copy(items) }
          if (mode === "corrupt") records[S] = { ...stamp, gen: "other", data: { quickSave: two } }
          if (mode === "foreign-after") records.unrelated = { kept: false }
          if (mode === "authority-after") records.device = { id: "fixture", consent: null, syncOn: false }
          if (mode === "committed-reject") throw error
        }
      },
      sync: { async get() { syncReads++; order.push("sync"); onSyncRead(); if (!records.device || !(records.device as JsonObject).syncOn) throw Error("off sync access"); return copy(remote) } },
      authority(values) {
        try {
          const device = decodeDevice(values.device)
          if (device.consent?.v !== 1) return { kind: "unavailable", reason: "startup" }
          const raw = values.sync as JsonObject, state = decodeSyncState(raw)
          return { kind: "ready", device, rawDevice: values.device as JsonObject, history: { raw, editedSinceOff: state.editedSinceOff, joined: state.joined } }
        } catch { return { kind: "unavailable", reason: "startup" } }
      },
      repairHistory(raw: JsonObject, repairs: readonly SyncDocumentRecord[]) {
        const state = decodeSyncState(raw), pending = repairs.filter(record => state.pushed[record.name] !== record.gen)
        return pending.length ? { ...raw, pushed: { ...state.pushed, ...Object.fromEntries(pending.map(record => [record.name, record.gen])) } } : undefined
      },
      disposed: () => disposed, now() { times++; return 100 }, generation() { generations++; return `G${generations}` }
    }
    return { deps, error, batches, order, raw: () => copy(records),
      mode(value: Mode) { mode = value }, dispose() { disposed = true }, remote(value: Record<string, JsonValue>) { remote = copy(value) },
      onRead(fn: (count: number) => void) { onRead = fn }, onSyncRead(fn: () => void) { onSyncRead = fn },
      mutate(fn: (value: Record<string, JsonValue>) => void) { fn(records) },
      report: () => ({ sets, generations, times, syncReads, reads }) }
  }

  for (const absent of [undefined, { ...stamp, deleted: true }]) {
    const h = harness(seed(absent, false))
    equal(await execute(h.deps, quick({ setup: "none" }, null)), { kind: "unchanged" }, "absent clear no-op")
    equal(h.report(), { sets: 0, generations: 0, times: 0, syncReads: 0, reads: 1 }, "no-op allocates nothing and reads once")
    equal(await execute(h.deps, quick({ setup: "live", playlist: null }, one)), { kind: "stale", reason: "setup" }, "stale live capture refused")
    equal(h.report().sets, 0, "stale capture writes nothing")
    const result = await execute(h.deps, quick({ setup: "none" }, one))
    check(result.kind === "committed", "fresh choice commits")
    equal(result.view, { kind: "live", acct: A, setup: { label: null, autoAdd: [], targets: {}, quickSave: one, musicSave: null, gather: null, marks: {} } }, "committed view is the confirmed setup")
    const saved = h.raw()
    equal(saved[S], { ...(absent ? { extension: stamp.extension } : {}), v: 1, gen: "G1", at: 100, by: "fixture", data: { label: null, autoAdd: [], targets: {}, quickSave: one, musicSave: null, gather: null, marks: {} } },
      "new document stamped once, tombstone marker removed, envelope extension kept")
    equal(saved.sync, { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true, extension: { keep: [1] } }, "off history records the first edit")
    equal([saved[SB], saved.unrelated, saved["doc:settings"]], [seed(undefined, false)[SB], { kept: true }, seed(undefined, false)["doc:settings"]], "sibling account, settings and unrelated records untouched")
    equal(h.report().generations, 1, "exactly one generation")
    equal(h.batches.length, 1, "one native write")
    equal(Object.keys(h.batches[0] as object).sort(), [S, "sync"].sort(), "write holds only the setup and edit history")
    observations.push({ absent: absent ? "tombstone" : "absent", saved, batches: h.batches })
  }
  {
    const h = harness(seed({ ...stamp, data: { quickSave: one, autoAdd: [{ pl: two, takes: "shorts" }], future: { keep: 1 } } }, false))
    const result = await execute(h.deps, quick({ setup: "live", playlist: one }, two))
    check(result.kind === "committed", "existing setup edit commits")
    equal(h.raw()[S], { ...stamp, gen: "G1", at: 100, data: { label: null, autoAdd: [{ pl: two, takes: "shorts" }], targets: {}, quickSave: two, musicSave: null, gather: null, marks: {}, future: { keep: 1 } } },
      "existing envelope extensions and unrelated setup fields survive")
    equal(await execute(h.deps, quick({ setup: "live", playlist: one }, null)), { kind: "stale", reason: "destination" }, "old capture is stale after a commit")
    equal(await execute(h.deps, quick({ setup: "live", playlist: two }, null)), { kind: "committed", view: { kind: "live", acct: A, setup: { label: null, autoAdd: [{ pl: two, takes: "shorts" }], targets: {}, quickSave: null, musicSave: null, gather: null, marks: {}, future: { keep: 1 } } } }, "an auto-add playlist keeps the cleared setup alive")
  }
  {
    const h = harness(seed({ ...stamp, data: { quickSave: one } }, false))
    equal(await execute(h.deps, quick({ setup: "live", playlist: one }, null)), { kind: "removal", result: { kind: "unavailable", reason: "removal-host" } }, "emptying clear uses the existing removal dependency")
    equal(h.report(), { sets: 0, generations: 0, times: 0, syncReads: 0, reads: 1 }, "unavailable removal host has no effects")
    equal(await execute(h.deps, { ...quick({ setup: "live", playlist: one }, null), destination: { kind: "shortcut", shortcut: brand(isShortcutId, "short9") } }), { kind: "stale", reason: "shortcut" }, "deleted shortcut refused")
    h.mutate(records => { records[S] = { ...stamp, v: 2, data: {} } })
    equal(await execute(h.deps, quick({ setup: "live", playlist: one }, two)), { kind: "result", result: { refused: "update-needed" } }, "newer setup refused")
    h.mutate(records => { records.device = { id: "fixture", consent: null, syncOn: false } })
    equal(await execute(h.deps, quick({ setup: "live", playlist: one }, two)), { kind: "unavailable", reason: "startup" }, "withdrawn consent holds the edit")
    equal(h.report().sets, 0, "held edits never write")
  }
  {
    const h = harness(seed({ ...stamp, data: { quickSave: one } }, true))
    const result = await execute(h.deps, quick({ setup: "live", playlist: one }, two))
    check(result.kind === "committed", "sync-on edit admitted and committed")
    equal(h.report().syncReads, 1, "one complete sync inventory read")
    equal(Object.keys(h.batches[0] as object).sort(), [S, "sync"].sort(), "sync-on write persists provenance, not a new acknowledgement")
    equal(decodeSyncState(h.raw().sync).pushed[S], "old", "new generation is left for the existing flush to push")
    equal(decodeSyncState(h.raw().sync).everEdited, true, "first-edit provenance recorded")
    check(!h.order.includes("sync.set"), "local-first commit never pushes")
    observations.push({ kind: "sync-on", batches: h.batches })
  }
  for (const kind of ["full", "newer", "mismatch", "reset", "noop-newer", "noop-ok"] as const) {
    const h = harness(seed({ ...stamp, data: { quickSave: one } }, true))
    const settings = seed(undefined, true)["doc:settings"], otherSetup = seed(undefined, true)[SB]
    check(settings !== undefined && otherSetup !== undefined, "fixture counterparts exist")
    const remote: Record<string, JsonValue> = { "s:meta": { v: 1, id: kind === "mismatch" ? "different" : "history", created: 0, ...(kind === "reset" ? { reset: true } : {}) },
      "s:settings": settings, [`s:setup:${B}`]: otherSetup, [`s:setup:${A}`]: { ...stamp, data: { quickSave: one } } }
    if (kind === "full") for (let i = 0; i < 480; i++) remote[`s:setup:${A}@unproven.${i}`] = "kept"
    if (kind === "newer" || kind === "noop-newer") remote[`s:setup:${A}`] = { ...stamp, v: 2, data: {} }
    h.remote(remote)
    const result = await execute(h.deps, quick({ setup: "live", playlist: one }, kind.startsWith("noop") ? one : two))
    equal(result, kind === "full" ? { kind: "result", result: { refused: "sync-full" } }
      : kind === "newer" || kind === "noop-newer" ? { kind: "result", result: { refused: "update-needed" } }
      : kind === "noop-ok" ? { kind: "unchanged" } : { kind: "unavailable", reason: "sync-writer-required" }, `sync admission ${kind}`)
    equal(h.report().sets, 0, `admission outcome writes nothing ${kind}`)
    if (kind.startsWith("noop")) equal([h.report().generations, h.report().times], [0, 0], `sync-on no-op allocates no stamp ${kind}`)
    observations.push({ kind, result })
  }
  for (const status of ["full", "update-needed"] as const) {
    const records = seed({ ...stamp, data: { quickSave: one } }, true)
    records.sync = { ...(records.sync as JsonObject), status }
    const h = harness(records)
    const result = await execute(h.deps, quick({ setup: "live", playlist: one }, two))
    check(result.kind === "committed" || result.kind === "result", `stored ${status} status is admitted by the existing plan`)
    observations.push({ status, result })
  }
  for (const mode of ["reject", "committed-reject", "ignored", "corrupt", "foreign-after", "read-fail", "authority-after"] as const) {
    const h = harness(seed({ ...stamp, data: { quickSave: one } }, false)); h.mode(mode)
    const result = await execute(h.deps, quick({ setup: "live", playlist: one }, two))
    if (mode === "reject") check(result.kind === "failed" && result.stage === "set" && result.error === h.error, "rejected unchanged write fails with its original error")
    else if (mode === "committed-reject") check(result.kind === "unconfirmed" && result.cause.kind === "rejected" && result.cause.error === h.error, "rejected write that landed stays unconfirmed")
    else if (mode === "read-fail") check(result.kind === "unconfirmed" && result.cause.kind === "read-failed" && result.cause.error === h.error, "readback failure keeps its error")
    else if (mode === "authority-after") equal(result, { kind: "unconfirmed", cause: { kind: "readback" } }, "lost consent after the write is never confirmed")
    else equal(result, { kind: "unconfirmed", cause: { kind: "readback" } }, `inexact readback is unconfirmed ${mode}`)
    equal(h.report().sets, 1, `one write attempt, no repair write ${mode}`)
    if (mode === "corrupt") equal((h.raw()[S] as JsonObject).gen, "other", "a foreign image is never overwritten to confirm")
    observations.push({ mode, result: result.kind, records: h.raw() })
  }
  {
    const h = harness(seed({ ...stamp, data: { quickSave: one } }, false))
    h.onRead(count => { if (count === 2) h.mutate(records => { records.unrelated = { kept: "interleaved" } }) })
    equal(await execute(h.deps, quick({ setup: "live", playlist: one }, two)), { kind: "unavailable", reason: "stale" }, "foreign write before the effect is stale")
    equal(h.report().sets, 0, "stale effect boundary writes nothing")
  }
  {
    const h = harness(seed({ ...stamp, data: { quickSave: one } }, false))
    h.onRead(count => { if (count === 2) h.mutate(records => { records.device = { id: "fixture", consent: null, syncOn: false } }) })
    equal(await execute(h.deps, quick({ setup: "live", playlist: one }, two)), { kind: "unavailable", reason: "stale" }, "withdrawal before the effect is stale")
    equal(h.report().sets, 0, "withdrawal blocks the write")
  }
  for (const on of [false, true]) {
    for (let stop = 1; ; stop++) {
      const h = harness(seed({ ...stamp, data: { quickSave: one } }, on))
      let awaits = 0
      const hook = () => { if (++awaits === stop) h.dispose() }
      h.onRead(hook); h.onSyncRead(hook)
      const result = await execute(h.deps, quick({ setup: "live", playlist: one }, two))
      if (awaits < stop) { equal(result.kind, "committed", `control run commits after ${stop - 1} awaits`); break }
      check(result.kind !== "committed", `disposal at await ${stop} never confirms (sync ${on})`)
      check(result.kind === "unavailable" ? result.reason === "disposed" : result.kind === "unconfirmed" && result.cause.kind === "authority", `disposal at await ${stop} is reported (sync ${on})`)
      if (result.kind === "unavailable") equal(h.report().sets, 0, `disposal before the effect writes nothing ${stop}`)
      observations.push({ on, stop, result: result.kind })
    }
  }
  return { checks, observations }
}

test("Setup destination execution stamps once, admits sync and confirms only exact owned readback", async () => {
  expect((await setupExecutionAcceptance(executeSetupDestination)).checks).toBeGreaterThan(70)
})
