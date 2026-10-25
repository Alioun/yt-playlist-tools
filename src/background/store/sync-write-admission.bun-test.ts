import { expect, test } from "bun:test"
import { planSyncWrite, type SyncWritePlanInput, type SyncWritePlan } from "./sync-write-admission"
import { encodeSyncDocument, projectSyncWrite } from "./sync-codec"
import { isAccountKey, isPlaylistId, type DocumentKey } from "../../shared/model"
import type { JsonObject } from "../../shared/contracts/json"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type AdmissionProofs = [
  Check<Equal<typeof planSyncWrite, (input: SyncWritePlanInput) => SyncWritePlan>>,
  Check<Equal<keyof typeof import("./sync-write-admission"), "planSyncWrite" | "sameSyncJson">>,
  Check<Equal<SyncWritePlanInput, {
    readonly local: Readonly<Record<string, unknown>>
    readonly sync: Readonly<Record<string, unknown>>
    readonly intent: { readonly kind: "flush" } | { readonly kind: "unchanged"; readonly key: DocumentKey }
      | { readonly kind: "changed"; readonly key: DocumentKey; readonly document: JsonObject }
      | { readonly kind: "changed-batch"; readonly documents: readonly [
        { readonly key: DocumentKey; readonly document: JsonObject },
        ...{ readonly key: DocumentKey; readonly document: JsonObject }[]
      ] }
  }>>
]
const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_P"
if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid synthetic brands")
const key: DocumentKey = { kind: "filter", acct, playlist }
const localKey = "doc:filter:AAAAAAAAAAAAAAAA:PL_P", base = "s:filter:AAAAAAAAAAAAAAAA:PL_P"
const keptKey = "doc:filter:AAAAAAAAAAAAAAAA:PL_kept"
const stamp = { v: 1, gen: "old", at: 1, by: "old" }
const old = { ...stamp, data: { mode: "deny", on: true, channels: [] } }
const candidate = { ...stamp, gen: "g1", at: 100, by: "device", data: { mode: "deny", on: false, channels: [] } }
function fixture(): SyncWritePlanInput {
  return { local: { sync: { joined: "history", pushed: { [localKey]: "old" }, status: "ok", editedSinceOff: false }, [localKey]: old },
    sync: { "s:meta": { v: 1, id: "history", created: 0 }, [base]: old }, intent: { kind: "changed", key, document: candidate } }
}
function encoded(key: DocumentKey, document: JsonObject) {
  const result = encodeSyncDocument({ key, document })
  if (result.kind !== "encoded") throw Error("Invalid fixture encoding")
  return result.encoded.items
}
const admitted = { kind: "planned" } as const, unavailable = { kind: "unavailable" } as const, full = { kind: "refused", reason: "sync-full" } as const

test("complete pending and physical disappearance exceed budget together while each fits", () => {
  const one = { ...stamp, gen: "one", data: { future: "x".repeat(51000) } }
  const two = { ...stamp, gen: "two", deleted: true, future: "x".repeat(51000) }
  const other: DocumentKey = { kind: "filter", acct, playlist: key.playlist }
  const current = [{ key: "s:meta", value: { v: 1, id: "history", created: 0 } }]
  expect(projectSyncWrite({ current, set: encoded({ kind: "settings" }, one) }).kind).toBe("fits")
  expect(projectSyncWrite({ current, set: encoded(other, two) }).kind).toBe("fits")
  const f = fixture()
  const local = { ...f.local, "doc:settings": one, [keptKey]: two }
  expect(planSyncWrite({ ...f, local })).toEqual(full)
  expect(planSyncWrite({ ...f, local: { ...local, sync: { joined: "history", pushed: { [localKey]: "old", "doc:settings": "one" }, status: "ok", editedSinceOff: false } } })).toEqual(full)
})

test("candidate replaces a large unsent pending document before any encoding", () => {
  const f = fixture(), superseded = { ...old, gen: "huge", data: { ...old.data, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "L".repeat(99000)]] } }
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: superseded }, sync: { "s:meta": f.sync["s:meta"] } })).toMatchObject(admitted)
  const chunks = encoded(key, superseded)
  expect(projectSyncWrite({ current: Object.entries(f.sync).map(([key, value]) => ({ key, value })), set: [...chunks, ...encoded(key, candidate)] }).kind).toBe("invalid")
  const occupied = Object.fromEntries(chunks.map(item => [item.key, item.value]))
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: superseded }, sync: { ...occupied, "s:meta": f.sync["s:meta"] } })).toEqual(full)
})

test("known chunk delivery, null base and orphan occupancy stay distinct", () => {
  const f = fixture(), large = { ...old, data: { ...old.data, future: "x".repeat(15000) } }
  const items = encoded(key, large)
  expect(items.length).toBeGreaterThan(2)
  const sync = { "s:meta": f.sync["s:meta"], ...Object.fromEntries(items.slice(0, -1).map(item => [item.key, item.value])) }
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: large }, sync })).toEqual(unavailable)
  expect(planSyncWrite({ ...f, sync: { ...f.sync, [base]: null } })).toEqual(unavailable)
  const orphaned = Object.fromEntries(items.slice(1).map(item => [item.key, item.value]))
  expect(planSyncWrite({ ...f, sync: { "s:meta": f.sync["s:meta"], ...orphaned } })).toMatchObject(admitted)
})

test("one projection charges exact count, per-item limit and smaller replacement", () => {
  const f = fixture()
  const sync = { ...f.sync, ...Object.fromEntries(Array.from({ length: 478 }, (_, i) => [`unknown:${i}`, 0])) }
  expect(planSyncWrite({ ...f, sync })).toMatchObject(admitted)
  expect(planSyncWrite({ ...f, sync: { ...sync, excess: 0 } })).toEqual(full)
  expect(planSyncWrite({ ...f, sync: { ...f.sync, unknown: "x".repeat(8192) } })).toEqual(full)
  const big = { ...old, data: { ...old.data, future: "x".repeat(7500) } }
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: big }, sync: { ...sync, [base]: big } })).toMatchObject(admitted)
  expect(planSyncWrite({ ...f, intent: { kind: "unchanged", key }, sync: { ...sync, excess: 0 } })).toEqual({ kind: "unchanged" })
})

test("same generation must retain full stamp, body and extensions", () => {
  const f = fixture()
  for (const remote of [{ ...old, at: 2 }, { ...old, by: "other" }, { ...old, extra: true }, { ...old, data: { ...old.data, on: false } }]) {
    expect(planSyncWrite({ ...f, sync: { ...f.sync, [base]: remote } })).toEqual(unavailable)
    expect(planSyncWrite({ ...f, sync: { ...f.sync, [base]: remote }, intent: { kind: "unchanged", key } })).toEqual(unavailable)
  }
  const reversed = Object.fromEntries(Object.entries(old).reverse())
  expect(planSyncWrite({ ...f, sync: { ...f.sync, [base]: reversed } })).toMatchObject(admitted)
})

test("invalid candidate is a refusal and unknown snapshots cannot invoke own getters", () => {
  const f = fixture()
  expect(planSyncWrite({ ...f, intent: { kind: "changed", key, document: {} } })).toEqual({ kind: "refused", reason: "invalid" })
  let calls = 0
  const accessor = Object.defineProperty({}, "bad", { enumerable: true, get() { calls++; throw Error("accessor") } })
  expect(planSyncWrite({ ...f, local: { ...f.local, [keptKey]: accessor } })).toEqual(unavailable)
  expect(planSyncWrite({ ...f, sync: Object.defineProperty({}, "s:meta", { enumerable: true, get() { calls++; throw Error("meta") } }) })).toEqual(unavailable)
  expect(calls).toBe(0)
})


test("future local pointers and supported addressed incoming-only no-ops remain unavailable", () => {
  const f = fixture(), pointer = { v: 2, gen: "future", at: 2, by: "future", n: 2 }
  expect(planSyncWrite({ ...f, local: { ...f.local, [keptKey]: pointer },
    sync: { ...f.sync, [keptKey.replace("doc:", "s:")]: pointer } })).toEqual(unavailable)
  const { [localKey]: omitted, ...local } = f.local
  expect(planSyncWrite({ ...f, local, intent: { kind: "unchanged", key } })).toEqual(unavailable)
})

test("history and metadata must be physical own snapshot records", () => {
  const f = fixture(), { "s:meta": meta, ...sync } = f.sync, { sync: state, ...local } = f.local
  Object.defineProperty(Object.prototype, "s:meta", { configurable: true, value: meta })
  Object.defineProperty(Object.prototype, "sync", { configurable: true, value: state })
  try {
    expect(planSyncWrite({ ...f, sync })).toEqual(unavailable)
    expect(planSyncWrite({ ...f, local })).toEqual(unavailable)
    expect(planSyncWrite(f)).toMatchObject(admitted)
  } finally {
    Reflect.deleteProperty(Object.prototype, "s:meta")
    Reflect.deleteProperty(Object.prototype, "sync")
  }
})

test("consumed plan separates exact readback repair from candidate and actual sends", () => {
  const f = fixture(), metadata = { v: 1, id: "history", created: 0 }, rawHistory = { joined: "history", pushed: { [localKey]: "g0" }, status: "ok", editedSinceOff: false }
  const record = { key, name: localKey, gen: "old", document: old }
  const debt = { ...f, local: { ...f.local, sync: rawHistory } }
  expect(planSyncWrite({ ...debt, intent: { kind: "flush" } })).toEqual({ kind: "planned", items: [], sent: [], repairs: [record], metadata })
  expect(planSyncWrite(debt)).toEqual({ kind: "planned", items: [{ key: base, value: candidate }],
    sent: [{ ...record, gen: "g1", document: candidate }], repairs: [record], metadata })
  expect(planSyncWrite({ ...debt, intent: { kind: "unchanged", key } })).toEqual({ kind: "unchanged" })
  expect(planSyncWrite({ ...debt, local: { ...debt.local, sync: rawHistory }, sync: { ...f.sync,
    ...Object.fromEntries(Array.from({ length: 481 }, (_, i) => [`unknown:${i}`, 0])) }, intent: { kind: "flush" } })).toEqual({ kind: "planned", items: [], sent: [], repairs: [record], metadata })
})

function batchFixture(): SyncWritePlanInput & { intent: Extract<SyncWritePlanInput["intent"], { kind: "changed-batch" }> } {
  const f = fixture(), settingsKey: DocumentKey = { kind: "settings" }
  const settings = { ...stamp, data: {} }, nextSettings = { ...settings, gen: "settings-next", extension: "kept" }
  return { ...f, local: { ...f.local, "doc:settings": settings }, sync: { ...f.sync, "s:settings": settings },
    intent: { kind: "changed-batch", documents: [{ key, document: candidate }, { key: settingsKey, document: nextSettings }] } satisfies SyncWritePlanInput["intent"] }
}

test("batch replaces all addressed records and retains exact envelopes without acknowledging", () => {
  const f = batchFixture(), before = JSON.stringify(f)
  const result = planSyncWrite(f)
  expect(result).toEqual({ kind: "planned", items: [
    { key: base, value: candidate }, { key: "s:settings", value: f.intent.documents[1]!.document }
  ], sent: [
    { key, name: localKey, gen: candidate.gen, document: candidate },
    { key: { kind: "settings" }, name: "doc:settings", gen: "settings-next", document: f.intent.documents[1]!.document }
  ], repairs: [{ key: { kind: "settings" }, name: "doc:settings", gen: "old", document: { ...stamp, data: {} } }], metadata: { v: 1, id: "history", created: 0 } })
  expect(JSON.stringify(f)).toBe(before)
  expect(planSyncWrite({ ...fixture(), intent: { kind: "changed-batch", documents: [{ key, document: candidate }] } })).toEqual(planSyncWrite(fixture()))
})

test("any addressed newer document refuses the batch regardless of order", () => {
  const f = batchFixture(), future = { v: 2, gen: "future", at: 2, by: "other", data: {} }
  for (const name of [base, "s:settings"]) expect(planSyncWrite({ ...f, sync: { ...f.sync, [name]: future } })).toEqual({ kind: "refused", reason: "update-needed" })
  expect(planSyncWrite({ ...f, sync: { ...f.sync, [base]: {}, "s:settings": future } })).toEqual({ kind: "refused", reason: "update-needed" })
  expect(planSyncWrite({ ...f, sync: { ...f.sync, "s:setup:BBBBBBBBBBBBBBBB": future } })).toMatchObject(admitted)
})

test("batch candidate sets reject runtime empty duplicate malformed and accessor inputs", () => {
  const f = batchFixture()
  const call = (intent: unknown) => Reflect.apply(planSyncWrite, undefined, [{ ...f, intent }])
  let calls = 0
  const accessor = Object.defineProperty({}, "document", { enumerable: true, get() { calls++; throw Error("candidate accessor") } })
  for (const documents of [[], [f.intent.documents[0], { ...f.intent.documents[0], document: { ...candidate, gen: "different" } }],
    [null], [{ key: null, document: candidate }], [{ key: { kind: "filter", acct: "bad", playlist }, document: candidate }],
    [{ key: { kind: "unknown" }, document: candidate }],
    [{ key: { kind: "setup", acct: { toString: "inert" } }, document: candidate }],
    [{ key: { kind: "filter", acct, playlist: { toString: "inert" } }, document: candidate }],
    [accessor], [{ key, document: {} }],
    [{ key, document: { ...candidate, v: 2 } }],
    ...["name", "gen", "stamp", "origin", "local", "remove"].map(field => [{ key, document: candidate, [field]: "forbidden" }]), null]) {
    expect(call({ kind: "changed-batch", documents })).toEqual({ kind: "refused", reason: "invalid" })
  }
  expect(calls).toBe(0)
})

test("each batch address must have complete remote baseline lineage", () => {
  const f = batchFixture()
  for (const [name, raw] of [[base, old], ["s:settings", { ...stamp, data: {} }]] as const) {
    for (const remote of [null, {}, { ...stamp, gen: "parts", n: 2 }, { ...raw, extra: true }, { ...raw, gen: "unadopted" }]) {
      expect(planSyncWrite({ ...f, sync: { ...f.sync, [name]: remote } })).toEqual(unavailable)
    }
  }
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: {} } })).toEqual(unavailable)
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: { ...old, v: 2 } } })).toEqual(unavailable)
})

test("one combined batch projection charges count and retains superseded physical chunks", () => {
  const f = batchFixture()
  const sync = { ...f.sync, ...Object.fromEntries(Array.from({ length: 477 }, (_, i) => [`unknown:${i}`, 0])) }
  expect(planSyncWrite({ ...f, sync })).toMatchObject(admitted)
  expect(planSyncWrite({ ...f, sync: { ...sync, extra: 0 } })).toEqual(full)
  const large = { ...old, gen: "unsent", extra: "x".repeat(100000) }
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: large, "doc:settings": { ...large, data: {} } }, sync: { "s:meta": f.sync["s:meta"] } })).toMatchObject(admitted)
  const occupied = { ...f.sync, ...Object.fromEntries(encoded(key, large).map(item => [item.key, item.value])) }
  expect(planSyncWrite({ ...f, local: { ...f.local, [localKey]: large }, sync: occupied })).toEqual(full)
})

test("batch preserves own extension-bearing tombstones and nonenumerable rejection", () => {
  const f = batchFixture(), document = JSON.parse('{"v":1,"gen":"dead","at":2,"by":"fixture","deleted":true,"__proto__":{"keep":true},"toJSON":"inert","extension":[null,1]}')
  const input = { ...f, intent: { kind: "changed-batch", documents: [{ key, document }] } satisfies SyncWritePlanInput["intent"] }
  const before = Object.getOwnPropertyDescriptors(document)
  const result = planSyncWrite(input)
  expect(result.kind).toBe("planned")
  if (result.kind !== "planned") throw Error("Missing plan")
  expect(result.sent.at(-1)?.document).toBe(document)
  expect(Object.getOwnPropertyDescriptors(document)).toEqual(before)
  expect(Object.hasOwn(document, "data")).toBe(false)
  expect(Object.hasOwn(document, "__proto__")).toBe(true)
  const hidden = Object.defineProperty({ ...document }, "hidden", { value: 1 })
  expect(planSyncWrite({ ...input, intent: { kind: "changed-batch", documents: [{ key, document: hidden }] } })).toEqual({ kind: "refused", reason: "invalid" })
})
