import { expect, test } from "bun:test"
import { resolve } from "node:path"
import type { JsonObject } from "../../shared/contracts/json"
import type { DocumentKey } from "../../shared/model"
import * as codec from "./sync-codec"
import { readSyncInventory } from "./sync-inventory"
import { planSyncWrite } from "./sync-write-admission"
import { createLocalFilterWriter } from "./local-filter-writer"
import { executeSyntheticNodeRealm } from "../../../tools/fixtures/owner-services-reconciliation/node-realm-transport"

type RetentionApi = Pick<typeof codec, "encodeSyncDocument" | "readSyncDocument"> & {
  readSyncInventory: typeof readSyncInventory
  planSyncWrite: typeof planSyncWrite
  createLocalFilterWriter: typeof createLocalFilterWriter
}

async function retentionAcceptance(api: RetentionApi) {
  let assertions = 0
  function check(value: unknown, message: string): asserts value {
    assertions++
    if (!value) throw Error(message)
  }
  function equal(actual: unknown, expected: unknown, message: string) {
    check(JSON.stringify(actual) === JSON.stringify(expected), message)
  }
  const key: DocumentKey = { kind: "settings" }
  const old: JsonObject = { v: 1, gen: "g0", at: 10, by: "device-a", data: { theme: "light" }, padding: "x".repeat(15500) }
  const next: JsonObject = { v: 1, gen: "g1", at: 20, by: "device-a", data: { theme: "dark" } }
  const encoded = api.encodeSyncDocument({ key, document: old })
  check(encoded.kind === "encoded" && encoded.encoded.mode === "chunked", "old document really spans chunks")
  const [pointer, ...chunks] = encoded.encoded.items
  check(pointer && chunks.length === 2, "fixture has a pointer and two chunks")
  const items = (records: Readonly<Record<string, unknown>>) => Object.entries(records).map(([key, value]) => ({ key, value }))
  const read = (records: Readonly<Record<string, unknown>>) => api.readSyncDocument({ key, items: items(records) })
  const exactOld = (records: Readonly<Record<string, unknown>>) => {
    const result = read(records)
    check(result.kind === "value", "retained old generation remains readable")
    equal(result.json, old, "retained old generation preserves the complete envelope")
    equal(JSON.stringify(result.json), JSON.stringify(old), "retained old serialized bytes remain exact")
    return result
  }
  const metadata = { v: 1, id: "history", created: 1 }
  const remote: Record<string, unknown> = {
    ...Object.fromEntries(encoded.encoded.items.map(item => [item.key, item.value])),
    "s:meta": metadata, "opaque-key": "count-me"
  }
  const local: Record<string, unknown> = {
    schema: 1, device: { id: "device-a", consent: { v: 1, at: 1 }, syncOn: true },
    sync: { joined: "history", pushed: { "doc:settings": "g0" }, status: "ok", editedSinceOff: false },
    "doc:settings": next
  }
  const inv = (records: Readonly<Record<string, unknown>>) => {
    const result = api.readSyncInventory({ items: items(records) })
    check(result.kind === "read", "physical inventory is readable")
    const bytes = Object.entries(records).reduce((total, [key, value]) => total +
      new TextEncoder().encode(key).length + new TextEncoder().encode(JSON.stringify(value)).length + 4, 0)
    equal(result.occupancy.usage.bytes, bytes, "physical bytes include retained chunks metadata and unknown occupancy")
    equal(result.occupancy.usage.items, Object.keys(records).length, "physical item count includes every retained chunk")
    return result
  }
  let mono = 0
  const sets: Readonly<Record<string, unknown>>[] = []
  const sync = {
    async get() { return { ...remote } },
    async set(values: Readonly<Record<string, unknown>>) { sets.push(values); Object.assign(remote, values) },
    subscribe() { return () => {} },
    // Only a rejected candidate or injected defect can invoke this extra fixture capability.
    async remove(keys: readonly string[]) { for (const key of keys) delete remote[key] }
  }
  const writer = api.createLocalFilterWriter({
    claim: { kind: "unavailable" },
    local: {
      async get(keys) { return keys === null ? { ...local } : Object.fromEntries(keys.filter(key => Object.hasOwn(local, key)).map(key => [key, local[key]])) },
      async set(values) { Object.assign(local, values) }
    }, sync,
    syncClock: { now: () => mono, wallNow: () => 1000000 + mono, after() { throw Error("retention creates no timer") } },
    onSyncResult() {}, now: () => 20, generation() { throw Error("flush never restamps the document") }
  })
  try {
    equal(await writer.flushSync(), { kind: "deferred", notBefore: 5000 }, "replacement shares the existing owner barrier")
    mono = 5000
    equal((await writer.flushSync()).kind, "pushed", "actual owner pushes the replacement")
    equal(read(remote).kind, "value", "replacement is complete")
    const current = read(remote)
    check(current.kind === "value", "replacement reader returns a document")
    equal(current.json, next, "replacement round trips exactly")
    const inventory = inv(remote)
    equal(inventory.documents.length, 1, "retained chunks do not invent document records")
    const snapshot = { ...remote }
    const rechecks = Array.from({ length: 3 }, () => ({ history: remote["s:meta"], current: read(remote) }))
    equal(rechecks.map(item => item.current), [current, current, current], "finite final snapshots all observe the replacement")
    equal(rechecks.map(item => item.history), [metadata, metadata, metadata], "candidate observes the same history every time")
    const schedules = []
    for (const order of ["pointer-before-remove", "pointer-after-remove"]) {
      const retained = { ...snapshot, [pointer.key]: pointer.value }
      const retainedResult = exactOld(retained)
      const rejectedCandidate = { ...snapshot }
      if (order === "pointer-before-remove") rejectedCandidate[pointer.key] = pointer.value
      for (const chunk of chunks) delete rejectedCandidate[chunk.key]
      if (order === "pointer-after-remove") rejectedCandidate[pointer.key] = pointer.value
      const incomplete = read(rejectedCandidate)
      equal(incomplete, { kind: "incomplete", gen: "g0", expected: 2, received: 0 }, "snapshot removal strands the delayed old pointer")
      equal(rejectedCandidate["s:meta"], metadata, "counterexample does not change history")
      equal(api.planSyncWrite({ local, sync: rejectedCandidate, intent: { kind: "flush" } }), { kind: "unavailable" }, "ordinary admission cannot repair a present incomplete pointer")
      schedules.push({ order, retained: retainedResult, rejected: incomplete })
    }
    equal(sets, [{ "s:settings": next }], "replacement sends only its complete new document")
    const absent = { ...snapshot }
    delete absent[pointer.key]
    const oldLocal = { ...local, "doc:settings": old,
      sync: { joined: "history", pushed: { "doc:settings": "g0" }, status: "ok", editedSinceOff: false } }
    const restore = api.planSyncWrite({ local: oldLocal, sync: absent, intent: { kind: "flush" } })
    check(restore.kind === "planned", "acknowledged old local generation can restore an absent base")
    equal(restore.items, encoded.encoded.items, "restoration preserves exact original pointer and chunks")
    equal(restore.sent, [{ key, name: "doc:settings", gen: "g0", document: old }], "restoration preserves original generation author and envelope")
    const full = { ...snapshot }
    for (let i = Object.keys(full).length; i < 479; i++) full[`unknown:${i}`] = 0
    equal(inv(full).occupancy.usage.items, 479, "retained physical inventory leaves only one item available")
    const candidate = { ...old, gen: "g2", at: 30 }
    const replacement = { kind: "changed", key, document: candidate } as const
    equal(api.planSyncWrite({ local, sync: full, intent: replacement }),
      { kind: "refused", reason: "sync-full" }, "replacement gets no credit for physically retained chunks")
    const discounted = { ...full }
    for (const chunk of chunks) delete discounted[chunk.key]
    equal(api.planSyncWrite({ local, sync: discounted, intent: replacement }).kind,
      "planned", "only actual physical absence changes replacement admission")
    const restorationDelivery = { ...absent, [pointer.key]: pointer.value }
    const restored = exactOld(restorationDelivery)
    return { assertions, sets, inventory, rechecks, schedules, restore, restored,
      full: inv(full), discounted: inv(discounted) }
  } finally {
    await writer.dispose()
  }
}

const sourceApi = { ...codec, readSyncInventory, planSyncWrite, createLocalFilterWriter }
const entries = ["sync-codec", "sync-inventory", "sync-write-admission", "local-filter-writer"]

function runGuarded(bytes: readonly string[]) {
  const script = `(async()=>{
    let accesses=0,controls=0;
    const guarded=["window","document","browser","chrome","fetch","XMLHttpRequest","WebSocket","EventSource","localStorage","sessionStorage","indexedDB","navigator","location","crypto","setTimeout","setInterval","requestAnimationFrame","Worker","process","Bun","console","Date","performance"];
    for(const name of guarded)Object.defineProperty(globalThis,name,{get(){accesses++;throw Error(name)}});
    Object.defineProperty(Math,"random",{get(){accesses++;throw Error("Math.random")}});
    for(const name of guarded){try{globalThis[name]}catch{controls++}}
    try{Math.random}catch{controls++}
    accesses=0;
    const api={};
    ${bytes.map(text => `{const module={exports:{}};(function(module,exports){${text}\n})(module,module.exports);Object.assign(api,module.exports)}`).join("\n")}
    try{return {result:await (${retentionAcceptance.toString()})(api),accesses,controls}}
    catch(error){return {failure:error.message,accesses,controls}}
  })()`
  return JSON.parse(executeSyntheticNodeRealm('import{readFileSync}from"node:fs";import{runInNewContext}from"node:vm";console.log(JSON.stringify(await runInNewContext(readFileSync(0,"utf8"),{TextEncoder},{timeout:30000})))', script, 35000))
}

test("replacement retention preserves delayed old pointers and charges their restoration against physical occupancy", async () => {
  const expected = await retentionAcceptance(sourceApi)
  const bytes: string[] = []
  for (const name of entries) {
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, `${name}.ts`)], target: "browser", format: "cjs", minify: true })
    expect(built.success).toBe(true)
    const output = built.outputs[0]
    if (!output) throw Error("Missing retention artifact")
    bytes.push(await output.text())
  }
  expect(runGuarded(bytes)).toEqual({ result: expected, accesses: 0, controls: 24 })
})

test("retention oracles reject chunk deletion and speculative admission credit", async () => {
  const faults = [
    { name: "delete-chunks", file: "local-filter-writer", from: "try { await deps.sync.set(Object.fromEntries(plan.items.map(item => [item.key, item.value]))) }",
      to: 'try { await deps.sync.set(Object.fromEntries(plan.items.map(item => [item.key, item.value]))); await deps.sync.remove(Object.keys(await deps.sync.get()).filter(key => key.includes("@"))) }',
      failure: "retained old generation remains readable" },
    { name: "discount-chunks", file: "sync-write-admission", from: "projectSyncWrite({ current, set: [...set]",
      to: 'projectSyncWrite({ current: current.filter(item => !item.key.includes("@")), set: [...set]',
      failure: "replacement gets no credit for physically retained chunks" }
  ]
  for (const fault of faults) {
    let replacements = 0
    const bytes: string[] = []
    for (const name of entries) {
      const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, `${name}.ts`)], target: "browser", format: "cjs", minify: true,
        plugins: [{ name: fault.name, setup(builder) {
          builder.onLoad({ filter: new RegExp(`/${fault.file}\\.ts$`) }, async ({ path }) => {
            const text = await Bun.file(path).text()
            if (!text.includes(fault.from)) throw Error("Missing retention defect anchor")
            replacements++
            return { contents: text.replace(fault.from, fault.to), loader: "ts" }
          })
        } }] })
      expect(built.success).toBe(true)
      const output = built.outputs[0]
      if (!output) throw Error("Missing defect artifact")
      bytes.push(await output.text())
    }
    expect(replacements).toBeGreaterThan(0)
    expect(runGuarded(bytes)).toEqual({ failure: fault.failure, accesses: 0, controls: 24 })
  }
})
