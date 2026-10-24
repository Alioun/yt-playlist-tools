import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import {
  decodeDocument, decodeFilter, decodeSettings, decodeSetup,
  isAccountKey, isPlaylistId, normalizeFilterForWrite, normalizeSettingsForWrite,
  normalizeSetupForWrite, type DocumentKey, type Tombstone
} from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import {
  encodeSyncDocument, readSyncDocument, projectSyncWrite,
  SINGLE_DOCUMENT_BYTES, SYNC_ITEM_BYTES, SYNC_BUDGET_BYTES, SYNC_BUDGET_ITEMS,
  type EncodedSyncDocument, type RawSyncItem, type SyncItem
} from "./sync-codec"

const settingsKey = { kind: "settings" } satisfies DocumentKey
const acct = "synthetic_acct01"
const longPlaylist = "P".repeat(100)
const watchLater = "WL"
if (!isAccountKey(acct) || !isPlaylistId(longPlaylist) || !isPlaylistId(watchLater)) throw new Error("Invalid invented IDs")
const setupKey = { kind: "setup", acct } satisfies DocumentKey
const filterKey = { kind: "filter", acct, playlist: watchLater } satisfies DocumentKey
const stamp = { v: 1, gen: "g", at: 1, by: "b" }
const small = { ...stamp, data: {} }
const oracle = runInNewContext(`(key, value) => new TextEncoder().encode(key).length + new TextEncoder().encode(JSON.stringify(value)).length + 4`, { TextEncoder }) as (key: string, value: unknown) => number
const jsonBytes = (value: unknown): number => oracle("", value) - 4
const charge = (item: RawSyncItem): number => oracle(item.key, item.value)
const total = (items: readonly RawSyncItem[]): number => items.reduce((sum, item) => sum + charge(item), 0)

function encoded(document: unknown = small, key: DocumentKey = settingsKey): EncodedSyncDocument {
  const result = encodeSyncDocument({ key, document })
  if (result.kind !== "encoded") throw new Error(`Expected encoding, got ${result.kind}`)
  return result.encoded
}

function padded(bytes: number, seed: JsonObject = small): JsonObject {
  const document = { ...seed, extension: "" }
  const padding = bytes - jsonBytes(document)
  if (padding < 0) throw new Error("Padding target too small")
  document.extension = "x".repeat(padding)
  expect(jsonBytes(document)).toBe(bytes)
  return document
}

function literalChunks(document: JsonObject = small, gen = "g"): SyncItem[] {
  const text = JSON.stringify(document)
  return [
    { key: "s:settings", value: { ...stamp, gen, n: 3 } },
    { key: `s:settings@${gen}.0`, value: text.slice(0, 9) },
    { key: `s:settings@${gen}.1`, value: text.slice(9, 23) },
    { key: `s:settings@${gen}.2`, value: text.slice(23) }
  ]
}

function read(items: readonly RawSyncItem[]) {
  return readSyncDocument({ key: settingsKey, items })
}

function noCandidate(items: readonly RawSyncItem[], kind: "invalid" | "incomplete" | "absent" | "newer-version") {
  const result = read(items)
  expect(result.kind).toBe(kind)
  expect(Object.hasOwn(result, "json")).toBe(false)
  expect(Object.hasOwn(result, "value")).toBe(false)
  expect(Object.hasOwn(result, "document")).toBe(false)
}

function snapshotBytes(bytes: number): SyncItem[] {
  const result: SyncItem[] = []
  let remaining = bytes
  while (remaining > 0) {
    const key = `q${result.length}`
    const size = Math.min(8000, remaining)
    const overhead = oracle(key, "")
    if (size < overhead) throw new Error("Unrepresentable test remainder")
    result.push({ key, value: "x".repeat(size - overhead) })
    remaining -= size
  }
  expect(total(result)).toBe(bytes)
  return result
}

function assertRoundTrip(document: JsonObject, key: DocumentKey = settingsKey) {
  const wire = encoded(document, key)
  const result = readSyncDocument({ key, items: wire.items })
  expect(result.kind === "value" || result.kind === "deleted").toBe(true)
  if (result.kind !== "value" && result.kind !== "deleted") throw new Error("Missing candidate")
  expect(result.json).toEqual(document)
  expect(encoded(result.json, key)).toEqual(wire)
  return result
}

describe("1. literal documents and canonical names", () => {
  test("exact settings, setup, filter and tombstone items preserve supplied JSON and stamps", () => {
    expect(encoded()).toEqual({ mode: "single", baseKey: "s:settings", gen: "g", items: [{ key: "s:settings", value: small }] })
    for (const [key, name] of [
      [setupKey, `s:setup:${acct}`],
      [filterKey, `s:filter:${acct}:WL`],
      [{ ...filterKey, playlist: longPlaylist }, `s:filter:${acct}:${longPlaylist}`]
    ] satisfies [DocumentKey, string][]) {
      const document = { ...small, gen: "g@part.1.é🙂" }
      expect(encoded(document, key)).toEqual({ mode: "single", baseKey: name, gen: document.gen, items: [{ key: name, value: document }] })
      expect(readSyncDocument({ key, items: [{ key: name, value: document }] }).kind).toBe("value")
    }
    const tombstone = { ...stamp, deleted: true } satisfies Tombstone
    expect(encoded(tombstone).items).toEqual([{ key: "s:settings", value: tombstone }])
    expect(read([{ key: "s:settings", value: tombstone }])).toEqual({ kind: "deleted", document: tombstone, json: tombstone })
    const result = read([{ key: "s:settings", value: small }])
    if (result.kind !== "value" || result.value.kind !== "settings") throw new Error("Missing settings")
    expect(result.value.document.data.theme).toBe("system")
    expect(result.json).toBe(small)
    expect(encoded().items[0].value).toBe(small)
    expect(encodeSyncDocument({ key: settingsKey, document: undefined }).kind).toBe("invalid")
    expect(encodeSyncDocument({ key: settingsKey, document: null }).kind).toBe("invalid")
  })
})

describe("2. inclusive document byte threshold", () => {
  test("7600 is inclusive and 7001 stays a single object", () => {
    expect([SINGLE_DOCUMENT_BYTES, SYNC_ITEM_BYTES, SYNC_BUDGET_BYTES, SYNC_BUDGET_ITEMS]).toEqual([7600, 8192, 98304, 480])
    for (const seed of [small, { ...small, 'é🙂': '"\\\né🙂\ud800' }]) {
      for (const size of [7001, 7599, 7600, 7601]) {
        const document = padded(size, seed)
        const wire = encoded(document)
        expect(wire.mode).toBe(size <= 7600 ? "single" : "chunked")
        if (wire.mode === "single") expect(wire.items[0].value).toEqual(document)
        assertRoundTrip(document)
      }
    }
    const justOver = encoded(padded(7601))
    expect(justOver.items).toHaveLength(2)
    expect(justOver.items[0].value).toEqual({ ...stamp, n: 1 })
    assertRoundTrip(padded(7601, { ...stamp, deleted: true }))
  })
})

describe("3. greedy escaped-byte packing", () => {
  test("actual keys, escaping and index digit growth fit every final item", () => {
    const document = { ...small, gen: "g@.é🙂", extension: '"\\\né🙂\ud800'.repeat(11000) }
    const wire = encoded(document)
    expect(wire.mode).toBe("chunked")
    expect(wire.items.length).toBeGreaterThan(12)
    expect(wire.items[0]).toEqual({ key: "s:settings", value: { ...stamp, gen: document.gen, n: wire.items.length - 1 } })
    const chunks = wire.items.slice(1)
    expect(chunks.map(item => item.value).join("")).toBe(JSON.stringify(document))
    chunks.forEach((item, index) => {
      expect(item.key).toBe(`s:settings@${document.gen}.${index}`)
      expect(typeof item.value).toBe("string")
      expect(charge(item)).toBeLessThanOrEqual(8192)
      const next = chunks[index + 1]
      if (typeof item.value !== "string" || !next || typeof next.value !== "string") return
      const point = [...next.value][0]
      expect(point).toBeDefined()
      expect(charge({ key: item.key, value: item.value + point })).toBeGreaterThan(8192)
      expect(/[\uD800-\uDBFF]$/.test(item.value)).toBe(false)
      expect(/^[\uDC00-\uDFFF]/.test(next.value)).toBe(false)
    })
    expect(wire.items.every(item => charge(item) <= 8192)).toBe(true)
    assertRoundTrip(document)
  })

  test("a code point crosses the bound intact and oversized stamps expose no partial items", () => {
    const wire = encoded({ ...small, extension: "🙂".repeat(7000) })
    const chunks = wire.items.slice(1)
    expect(chunks.length).toBeGreaterThan(1)
    for (const item of chunks) {
      expect(typeof item.value).toBe("string")
      if (typeof item.value === "string") expect(/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/.test(item.value)).toBe(false)
    }
    for (const document of [{ ...small, gen: "界".repeat(4000) }, { ...small, by: "b".repeat(9000) }]) {
      const result = encodeSyncDocument({ key: settingsKey, document })
      expect(result.kind).toBe("item-too-large")
      if (result.kind === "item-too-large") expect(result.bytes).toBeGreaterThan(8192)
      expect(Object.hasOwn(result, "encoded")).toBe(false)
      expect(Object.hasOwn(result, "items")).toBe(false)
    }
  })
})

describe("4. complete snapshot assembly", () => {
  test("literal fragments assemble in any order and missing parts never yield candidates", () => {
    const items = literalChunks()
    noCandidate(items.slice(0, 1), "incomplete")
    noCandidate(items.slice(1), "absent")
    expect(read([...items].reverse())).toEqual(read(items))
    expect(read(items).kind).toBe("value")
    for (const index of [1, 2, 3]) noCandidate(items.filter((_, at) => at !== index), "incomplete")
    noCandidate([...items, items[1]!], "invalid")
    noCandidate([...items, items[0]!], "invalid")
    const nativeSnapshot = new Map(items.map(item => [item.key, item.value]))
    for (const item of items) nativeSnapshot.set(item.key, item.value)
    expect(read([...nativeSnapshot].map(([key, value]) => ({ key, value })))).toEqual(read(items))
  })

  test("malformed selected chunks and pointers refuse without partial results", () => {
    const items = literalChunks()
    for (const value of [0, null, {}, [], ""]) noCandidate([items[0]!, { key: "s:settings@g.0", value }], "invalid")
    for (const index of ["00", "01", "-1", "+1", "1.0", "1e0", " 1", "3", "9007199254740992", ""]) {
      const gen = index === "1.0" ? "g.1" : "g"
      const pointer = { key: "s:settings", value: { ...stamp, gen, n: 3 } }
      const suffix = index === "1.0" ? "0.0" : index
      noCandidate([pointer, { key: `s:settings@${gen}.${suffix}`, value: "x" }], index === "1.0" ? "incomplete" : "invalid")
    }
    for (const n of [0, -1, 1.5, null, "3", Number.MAX_SAFE_INTEGER + 1, undefined]) {
      const pointer = n === undefined ? stamp : { ...stamp, n }
      noCandidate([{ key: "s:settings", value: pointer }], "invalid")
    }
    const pointer = { key: "s:settings", value: { ...stamp, n: 1 } }
    for (const text of ["{", "[]", JSON.stringify(stamp), JSON.stringify({ ...small, data: { theme: false } })]) {
      noCandidate([pointer, { key: "s:settings@g.0", value: text }], "invalid")
    }
    for (const change of [{ v: 2 }, { gen: "other" }, { at: 2 }, { by: "other" }]) {
      expect(read([pointer, { key: "s:settings@g.0", value: JSON.stringify({ ...small, ...change }) }])).toEqual({ kind: "invalid", field: "chunks", reason: "stamp-mismatch" })
    }
  })
})

describe("5. exact generation and bounded pointer work", () => {
  test("stale generations and other documents cannot complete the selected generation", () => {
    const a = literalChunks()
    const bDocument = { ...small, gen: "g.1", extension: "B" }
    const b = literalChunks(bDocument, "g.1")
    const unrelated = a.slice(1).map(item => ({ ...item, key: item.key.replace("s:settings", `s:setup:${acct}`) }))
    noCandidate([b[0]!, ...a.slice(1), ...b.slice(1, 3), ...a.slice(1), ...unrelated], "incomplete")
    const mixed = [b[0]!, ...a.slice(1), ...b.slice(1), ...unrelated]
    const result = read(mixed.reverse())
    if (result.kind !== "value") throw new Error("Missing selected generation")
    expect(result.json).toEqual(bDocument)
    expect(read([a[0]!, ...mixed.filter(item => item.key !== "s:settings")]).kind).toBe("value")
    const strange = { ...small, gen: "g@x.界.1" }
    expect(read(literalChunks(strange, strange.gen)).kind).toBe("value")
    expect(read([{ key: "s:settings", value: { ...stamp, n: Number.MAX_SAFE_INTEGER } }, a[1]!])).toEqual({ kind: "incomplete", gen: "g", expected: Number.MAX_SAFE_INTEGER, received: 1 })
  })
})

describe("6. ordinary, newer and absent records", () => {
  test("ordinary n is an extension and newer stamps precede body or pointer interpretation", () => {
    assertRoundTrip({ ...small, n: "future-extension" })
    for (const document of [
      { ...stamp, v: 2, data: { theme: false }, n: 0 },
      { ...stamp, v: 2, n: "future" },
      { ...stamp, v: 2, deleted: false }
    ]) {
      expect(read([{ key: "s:settings", value: document }])).toEqual({ kind: "newer-version", version: 2, raw: document })
      expect(encodeSyncDocument({ key: settingsKey, document })).toEqual({ kind: "newer-version", version: 2, raw: document })
    }
    for (const document of [{ v: 2 }, { ...small, v: 2, at: -1 }, { ...small, v: 2, gen: "" }, { ...small, v: 2, by: "" }, { ...small, v: 2.5 }]) {
      noCandidate([{ key: "s:settings", value: document }], "invalid")
      expect(encodeSyncDocument({ key: settingsKey, document }).kind).toBe("invalid")
    }
    noCandidate([{ key: "s:settings", value: { ...small, deleted: false } }], "invalid")
    noCandidate([{ key: "s:settings", value: { ...small, data: { theme: false } } }], "invalid")
    noCandidate([{ key: "s:settings", value: undefined }], "invalid")
    noCandidate([{ key: "s:settings", value: null }, ...literalChunks().slice(1)], "absent")
    noCandidate([...literalChunks().slice(1), { key: "s:meta", value: { v: 2 } }], "absent")
  })
})

describe("7. last-good caller and explicit tombstone", () => {
  test("refusals leave the caller's last good JSON unchanged", () => {
    const lastGood = JSON.stringify({ ...small, extension: "previous local copy" })
    let local = lastGood
    const applyCandidate = (items: readonly RawSyncItem[]) => {
      const result = read(items)
      if (result.kind === "value" || result.kind === "deleted") local = JSON.stringify(result.json)
    }
    for (const items of [[], literalChunks().slice(0, 2), [{ key: "s:settings", value: {} }], [{ key: "s:settings", value: { ...stamp, v: 2 } }]]) {
      applyCandidate(items)
      expect(local).toBe(lastGood)
    }
    applyCandidate(literalChunks())
    expect(local).toBe(JSON.stringify(small))
    const tombstone = { ...stamp, at: 0, deleted: true, extension: "retained" }
    const result = read([{ key: "s:settings", value: tombstone }])
    expect(result.kind).toBe("deleted")
    applyCandidate([{ key: "s:settings", value: tombstone }])
    expect(local).toBe(JSON.stringify(tombstone))
  })
})

describe("8. real model forward compatibility and caller materialization", () => {
  test("unknown fields survive known edits, normalization and transport", () => {
    const settings = { ...stamp, envelope: { future: true }, data: { quickSave: { on: true, future: [1, 2] }, shortcuts: { list: [{ id: "abc123", key: null, label: "🙂".repeat(42), watchLaterOnEveryAccount: true, future: "kept" }] } } }
    const decoded = decodeDocument(settings, decodeSettings)
    if (decoded.kind !== "value") throw new Error("Missing decoded settings")
    const final = { ...decoded.document, data: normalizeSettingsForWrite({ ...decoded.document.data, theme: "dark" }) }
    expect(isJsonValue(final)).toBe(true)
    if (!isJsonValue(final) || typeof final !== "object" || final === null || Array.isArray(final)) throw new Error("Expected JSON object")
    expect([...final.data.shortcuts.list[0]!.label]).toHaveLength(40)
    const roundTrip = assertRoundTrip(final)
    expect(roundTrip.json.envelope).toEqual({ future: true })
    expect(roundTrip.json.data).toMatchObject({ quickSave: { future: [1, 2] }, shortcuts: { list: [{ future: "kept" }] } })

    const setup = { ...stamp, envelope: "setup future", data: { autoAdd: [{ pl: "PLtest", future: 9 }], label: { name: "界".repeat(103), future: true }, targets: { abc123: "PLtest" }, marks: { WL: "full", PLtest: "missing", PLgone: "full" } } }
    const setupDecoded = decodeDocument(setup, decodeSetup)
    if (setupDecoded.kind !== "value") throw new Error("Missing decoded setup")
    const normalized = normalizeSetupForWrite({ ...setupDecoded.document.data, autoAdd: [] }, { shortcutIds: new Set(["abc123"]), additionalChosenPlaylists: new Set(["WL"]) })
    const normalizedWithEntry = normalizeSetupForWrite(setupDecoded.document.data, { shortcutIds: new Set(["abc123"]), additionalChosenPlaylists: new Set(["WL"]) })
    expect(normalized.marks).toEqual({ WL: "full", PLtest: "missing" })
    const setupFinal = { ...setupDecoded.document, data: normalizedWithEntry }
    expect(isJsonValue(setupFinal)).toBe(true)
    if (!isJsonValue(setupFinal)) throw new Error("Expected JSON setup")
    expect([...normalized.label!.name]).toHaveLength(100)
    const setupRoundTrip = assertRoundTrip(setupFinal, setupKey)
    expect(setupRoundTrip.json.data).toMatchObject({ autoAdd: [{ future: 9 }], label: { future: true }, marks: { WL: "full" } })
  })

  test("future tuple columns require the explicit undefined-to-null handle bridge", () => {
    const raw = { ...stamp, envelope: "filter future", data: { future: { retained: true }, channels: [["UC" + "c".repeat(22), "🙂".repeat(105), null, { future: ["column"] }]] } }
    const decoded = decodeDocument(raw, decodeFilter)
    if (decoded.kind !== "value") throw new Error("Missing decoded filter")
    const normalized = normalizeFilterForWrite({ ...decoded.document.data, on: true })
    expect(normalized.channels[0]![2]).toBeUndefined()
    expect(isJsonValue({ ...decoded.document, data: normalized })).toBe(false)
    expect(encodeSyncDocument({ key: filterKey, document: { ...decoded.document, data: normalized } }).kind).toBe("invalid")
    const channels: unknown = normalized.channels.map(row => row.length > 3 && row[2] === undefined ? [...row.slice(0, 2), null, ...row.slice(3)] : row)
    const materialized = { ...decoded.document, data: { ...normalized, channels } }
    if (!isJsonValue(materialized) || materialized === null || typeof materialized !== "object" || Array.isArray(materialized)) throw new Error("Expected JSON-form filter")
    expect([...normalized.channels[0]![1]]).toHaveLength(100)
    expect(materialized.data.channels).toEqual([["UC" + "c".repeat(22), "🙂".repeat(100), null, { future: ["column"] }]])
    assertRoundTrip(materialized, filterKey)
    expect(encodeSyncDocument({ key: filterKey, document: { ...materialized, future: undefined } }).kind).toBe("invalid")
  })
})

describe("9. inclusive quota bounds and independent byte oracle", () => {
  test("98304 bytes and 480 items fit independently", () => {
    for (const bytes of [98303, 98304, 98305]) {
      const current = snapshotBytes(bytes)
      const result = projectSyncWrite({ current, set: [] })
      expect(result.kind).toBe(bytes <= 98304 ? "fits" : "full")
      if (result.kind === "invalid") throw new Error("Unexpected invalid snapshot")
      expect(result.usage.bytes).toBe(bytes)
      expect(result.usage.perItem.every(item => item.bytes <= 8192)).toBe(true)
      if (result.kind === "full") expect(result.exceeded).toEqual(["bytes"])
    }
    for (const count of [479, 480, 481]) {
      const current = Array.from({ length: count }, (_, i) => ({ key: `k${i}`, value: null }))
      const result = projectSyncWrite({ current, set: [] })
      expect(result.kind).toBe(count <= 480 ? "fits" : "full")
      if (result.kind === "invalid") throw new Error("Unexpected invalid snapshot")
      expect(result.usage.items).toBe(count)
      expect(result.usage.bytes).toBe(total(current))
      if (result.kind === "full") expect(result.exceeded).toEqual(["items"])
    }
  })

  test("each key, pointer, escaped fragment, metadata and tombstone contributes", () => {
    const current = [
      { key: "é🙂", value: "\"\\\n🙂" },
      { key: "s:settings", value: { ...stamp, n: 1 } },
      { key: "s:settings@g.0", value: JSON.stringify(small) },
      { key: "s:settings@old.0", value: "retained old chunk" },
      { key: "s:meta", value: { v: 1, id: "synthetic-history", created: 0 } },
      { key: `s:setup:${acct}`, value: { ...stamp, deleted: true } }
    ]
    const result = projectSyncWrite({ current, set: [] })
    expect(result.kind).toBe("fits")
    if (result.kind === "invalid") throw new Error("Unexpected invalid projection")
    expect(result.usage).toEqual({ items: current.length, bytes: total(current), perItem: current.map(item => ({ key: item.key, bytes: charge(item) })) })
    for (const size of [8192, 8193]) {
      const item = { key: "x", value: "x".repeat(size - 7) }
      expect(charge(item)).toBe(size)
      const projection = projectSyncWrite({ current: [item], set: [] })
      expect(projection.kind).toBe(size === 8192 ? "fits" : "full")
      if (projection.kind === "full") expect(projection.exceeded).toEqual(["item-bytes"])
    }
    const all = projectSyncWrite({ current: [...snapshotBytes(98304), ...Array.from({ length: 481 }, (_, i) => ({ key: `extra${i}`, value: "x".repeat(i === 0 ? 9000 : 0) }))], set: [] })
    if (all.kind !== "full") throw new Error("Expected all quota bounds")
    expect(all.exceeded).toEqual(["bytes", "items", "item-bytes"])
  })
})

describe("10. exact-key overlay and retained occupancy", () => {
  test("overwrite counts once, malformed values can be repaired and duplicates refuse", () => {
    const current = [{ key: "a", value: "long old value" }, { key: "b", value: true }]
    const set = [{ key: "a", value: 1 }]
    const result = projectSyncWrite({ current, set })
    expect(result.kind).toBe("fits")
    if (result.kind === "invalid") throw new Error("Unexpected invalid projection")
    expect(result.usage.bytes).toBe(total([set[0]!, current[1]!]))
    expect(result.usage.items).toBe(2)
    expect(projectSyncWrite({ current: [...current, current[0]!], set })).toEqual({ kind: "invalid", field: "items", reason: "duplicate-key" })
    expect(projectSyncWrite({ current, set: [...set, set[0]!] }).kind).toBe("invalid")
    expect(projectSyncWrite({ current: [{ key: "a", value: undefined }], set }).kind).toBe("fits")
    expect(projectSyncWrite({ current: [{ key: "a", value: undefined }], set: [] }).kind).toBe("invalid")
    expect(projectSyncWrite({ current: [], set: [{ key: "a", value: undefined }] }).kind).toBe("invalid")
  })

  test("whole snapshots retain old chunks, metadata and unknown keys without cleanup credit", () => {
    const set = [{ key: "s:settings", value: small }]
    expect(projectSyncWrite({ current: [], set }).kind).toBe("fits")
    expect(projectSyncWrite({ current: snapshotBytes(98304), set }).kind).toBe("full")
    const retained = [{ key: "s:settings@old.0", value: "previous chunk" }, { key: "s:meta", value: { id: "history" } }]
    for (const item of retained) {
      const current = [...snapshotBytes(98304 - charge(set[0]!)), item]
      expect(projectSyncWrite({ current, set }).kind).toBe("full")
      expect(projectSyncWrite({ current: current.filter(entry => entry.key !== item.key), set }).kind).toBe("fits")
    }
    const overfull = snapshotBytes(98305)
    expect(projectSyncWrite({ current: overfull, set: [] }).kind).toBe("full")
    expect(projectSyncWrite({ current: overfull, set: [{ key: overfull[0]!.key, value: "" }] }).kind).toBe("fits")
  })
})

describe("11. explicit red controls", () => {
  test("code units, raw fragments and omitted occupancy demonstrably give wrong answers", () => {
    expect("🙂".length).toBe(2)
    expect(new TextEncoder().encode("🙂").length).toBe(4)
    const escaped = '"\\\n🙂'
    expect(new TextEncoder().encode(escaped).length).toBe(7)
    expect(jsonBytes(escaped)).toBe(12)
    const fragments = "🙂".split("")
    const preservesBoundaries = (parts: readonly string[]) => parts.every(part => !/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/.test(part))
    expect(preservesBoundaries(fragments)).toBe(false)
    expect(preservesBoundaries(["🙂"])).toBe(true)
    const pointer = literalChunks()[0]!
    const old = { key: "s:settings@old.0", value: "old" }
    for (const item of [pointer, old]) {
      const other = snapshotBytes(98304 - charge(item) + 1)
      expect(projectSyncWrite({ current: other, set: [] }).kind).toBe("fits")
      expect(projectSyncWrite({ current: [...other, item], set: [] }).kind).toBe("full")
    }
    const key = "é🙂"
    const string = "🙂".repeat(2000)
    const correct = oracle(key, string)
    expect(key.length + JSON.stringify(string).length + 4).toBeLessThan(correct)
    expect(oracle("x", '"'.repeat(4090))).toBe(8187)
    expect(oracle("x", '"'.repeat(4093))).toBe(8193)
  })
})

describe("12. strict JSON and immutable inputs", () => {
  test("deep JSON extensions use bounded call-stack space", () => {
    let extension: import("../../shared/contracts/json").JsonValue = 0
    for (let depth = 0; depth < 10000; depth++) extension = [extension]
    const wire = encoded({ ...small, extension })
    expect(wire.mode).toBe("chunked")
    expect(read(wire.items).kind).toBe("value")
    const projection = projectSyncWrite({ current: [{ key: "deep", value: extension }], set: [] })
    if (projection.kind !== "full") throw new Error("Expected per-item refusal")
    expect(projection.usage.bytes).toBe(20009)
    expect(projection.exceeded).toEqual(["item-bytes"])
  })

  test("unsupported data refuses without executing own accessors or hooks", () => {
    let reads = 0
    const getter = Object.defineProperty({}, "x", { enumerable: true, get() { reads++; return 1 } })
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    const bad = [getter, { x() {} }, { toJSON() { reads++; return "tiny" } }, { x: Infinity }, cycle, { x: undefined }, new Array(1)]
    for (const extension of bad) {
      const document = { ...small, extension }
      expect(encodeSyncDocument({ key: settingsKey, document })).toEqual({ kind: "invalid", field: "document", reason: "json" })
      noCandidate([{ key: "s:settings", value: document }], "invalid")
      expect(projectSyncWrite({ current: [{ key: "unknown", value: extension }], set: [] })).toEqual({ kind: "invalid", field: "items", reason: "json" })
    }
    expect(reads).toBe(0)
    const document = Object.freeze({ ...stamp, data: Object.freeze({}), toJSON: "ordinary data", extension: Object.freeze(["é", Object.freeze({ nested: true })]) })
    const before = JSON.stringify(document)
    const wire = encoded(document)
    const items = Object.freeze(wire.items.map(item => Object.freeze(item)))
    expect(read(items).kind).toBe("value")
    expect(projectSyncWrite({ current: items, set: [] }).kind).toBe("fits")
    expect(JSON.stringify(document)).toBe(before)
    assertRoundTrip({ ...document, extension: [...document.extension] })
  })
})

const ambientGuards = `
  const fail = () => { throw Error("Forbidden ambient effect"); };
  for (const name of ["browser","chrome","window","document","navigator","indexedDB","localStorage","sessionStorage","fetch","XMLHttpRequest","WebSocket","EventSource","Date","performance","crypto","process","Bun","Deno","setTimeout","setInterval","queueMicrotask"]) {
    Object.defineProperty(globalThis, name, { get: fail });
  }
  Object.defineProperty(Math, "random", { get: fail });
`

describe("13. actual browser artifact, graph and prototype hooks", () => {
  test("the minified exports execute purely and never read inherited toJSON hooks", async () => {
    const entrypoint = resolve(import.meta.dir, "sync-codec.ts")
    const visited = new Set<string>()
    async function inspect(file: string): Promise<void> {
      if (visited.has(file)) return
      visited.add(file)
      expect(file === entrypoint || file.startsWith(resolve(import.meta.dir, "../../shared/model") + "/") || file === resolve(import.meta.dir, "../../shared/contracts/json.ts")).toBe(true)
      const source = await readFile(file, "utf8")
      for (const imported of new Bun.Transpiler({ loader: "ts" }).scanImports(source)) {
        expect(imported.path.startsWith(".")).toBe(true)
        const base = resolve(dirname(file), imported.path)
        await inspect(await Bun.file(`${base}.ts`).exists() ? `${base}.ts` : resolve(base, "index.ts"))
      }
    }
    await inspect(entrypoint)
    expect(visited.has(resolve(import.meta.dir, "../../shared/contracts/json.ts"))).toBe(true)
    const program = ts.createProgram([...visited], { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] })
    const checker = program.getTypeChecker()
    const forbidden = new Set(["Date", "performance", "crypto", "process", "Bun", "Deno", "browser", "chrome", "window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest", "setTimeout", "setInterval"])
    for (const file of visited) {
      const source = program.getSourceFile(file)
      if (!source) throw new Error("Missing graph source")
      function check(node: ts.Node): void {
        if (ts.isTypeNode(node) || ts.isImportDeclaration(node)) return
        if (ts.isIdentifier(node) && forbidden.has(node.text)) {
          const property = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node || ts.isPropertyAssignment(node.parent) && node.parent.name === node
          if (!property) expect(checker.getSymbolAtLocation(node)?.declarations?.some(declaration => visited.has(declaration.getSourceFile().fileName)), `${file} reads ambient ${node.text}`).toBe(true)
        }
        if (ts.isPropertyAccessExpression(node)) expect(node.getText(source)).not.toMatch(/^(?:Math\.random|import\.meta\.env|globalThis\.(?:Date|performance|crypto|process|Bun|Deno|browser|chrome|window|document|navigator|indexedDB|localStorage|sessionStorage|fetch|XMLHttpRequest))(?:\.|$)/)
        ts.forEachChild(node, check)
      }
      check(source)
    }
    const build = await Bun.build({ entrypoints: [entrypoint], target: "browser", format: "cjs", minify: true })
    expect(build.success).toBe(true)
    expect(build.outputs).toHaveLength(1)
    const artifact = await build.outputs[0]!.text()
    expect(artifact.length).toBeGreaterThan(0)
    const evidence = JSON.parse(runInNewContext(ambientGuards + artifact + `
      ;(() => {
        const api = module.exports;
        const key = {kind:"settings"};
        const small = {v:1,gen:"g",at:1,by:"b",data:{},extension:["é🙂",{toJSON:"data"}]};
        const large = {...small, extension:'"\\\\\\n🙂'.repeat(12000)};
        const tombstone = {v:1,gen:"t",at:0,by:"b",deleted:true};
        const before = JSON.stringify([small,large,tombstone]);
        const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
        [small,large,tombstone].forEach(freeze);
        const budget = Array.from({length:12}, (_,i) => ({key:"q"+i,value:"x".repeat(8192-4-("q"+i).length-2)}));
        const execute = () => {
          const single = api.encodeSyncDocument({key,document:small});
          const chunked = api.encodeSyncDocument({key,document:large});
          if (single.kind !== "encoded" || chunked.kind !== "encoded") throw Error("Encoding refused");
          const roundTrip = api.readSyncDocument({key,items:[...chunked.encoded.items].reverse()});
          const incomplete = api.readSyncDocument({key,items:chunked.encoded.items.slice(0,2)});
          const projection = api.projectSyncWrite({current:budget,set:[]});
          const usage = api.projectSyncWrite({current:chunked.encoded.items,set:single.encoded.items});
          const deleted = api.readSyncDocument({key,items:[{key:"s:settings",value:tombstone}]});
          return {single,chunked,roundTrip,incomplete,projection,usage,deleted};
        };
        const baseline = JSON.stringify(execute());
        const probes = [];
        for (const prototype of [Object.prototype, Array.prototype]) {
          for (const getter of [false,true]) {
            for (const throwing of [false,true]) {
              let reads = 0, calls = 0;
              const hook = function() { calls++; if (throwing) throw Error("Hook called"); return "tiny"; };
              const descriptor = getter ? {get() { reads++; if (throwing) throw Error("Hook read"); return hook; }} : {value:hook};
              let actual, control;
              Object.defineProperty(prototype,"toJSON",{...descriptor,configurable:true,enumerable:false});
              try {
                actual = execute();
                if (reads !== 0 || calls !== 0) throw Error("Protected invocation touched hook");
                try { JSON.stringify(prototype === Array.prototype ? [1] : {a:1}); } catch {}
                control = reads + calls;
              } finally { delete prototype.toJSON; }
              if (JSON.stringify(actual) !== baseline || control === 0) throw Error("Hook immunity or native red control failed");
              probes.push({getter,throwing,control});
            }
          }
        }
        let reads = 0, calls = 0, enumerable;
        Object.defineProperty(Object.prototype,"toJSON",{configurable:true,enumerable:true,get() { reads++; return function() { calls++; throw Error("Enumerable hook called"); }; }});
        try {
          enumerable = {
            encoded:api.encodeSyncDocument({key,document:small}),
            read:api.readSyncDocument({key,items:[{key:"s:settings",value:small}]}),
            chunked:api.readSyncDocument({key,items:JSON.parse(baseline).chunked.encoded.items}),
            absent:api.readSyncDocument({key,items:[]}),
            projection:api.projectSyncWrite({current:budget,set:[]}),
            usage:api.projectSyncWrite({current:JSON.parse(baseline).chunked.encoded.items,set:JSON.parse(baseline).single.encoded.items})
          };
        } finally { delete Object.prototype.toJSON; }
        if (reads !== 0 || calls !== 0) throw Error("Enumerable hook accessed");
        if (before !== JSON.stringify([small,large,tombstone])) throw Error("Mutated input");
        const actual = JSON.parse(baseline);
        return JSON.stringify({exports:Object.keys(api).sort(),single:actual.single.encoded.mode,roundTrip:actual.roundTrip.kind,equal:JSON.stringify(actual.roundTrip.json)===JSON.stringify(large),incomplete:actual.incomplete.kind,projection:actual.projection,usage:actual.usage,deleted:actual.deleted.kind,probes,enumerable,reads,calls});
      })()
    `, { module: { exports: {} }, TextEncoder }, { timeout: 15000 }))
    expect(evidence.exports).toEqual(["SINGLE_DOCUMENT_BYTES", "SYNC_BUDGET_BYTES", "SYNC_BUDGET_ITEMS", "SYNC_ITEM_BYTES", "encodeSyncDocument", "projectSyncWrite", "readSyncDocument"])
    expect(evidence).toMatchObject({ single: "single", roundTrip: "value", equal: true, incomplete: "incomplete", deleted: "deleted", reads: 0, calls: 0 })
    expect(evidence.projection.kind).toBe("fits")
    expect(evidence.projection.usage.bytes).toBe(98304)
    expect(evidence.probes).toHaveLength(8)
    expect(evidence.enumerable.encoded).toEqual({ kind: "invalid", field: "document", reason: "shape" })
    expect(evidence.enumerable.read).toEqual(evidence.enumerable.encoded)
    expect(evidence.enumerable.chunked).toEqual(evidence.enumerable.encoded)
    expect(evidence.enumerable.absent).toEqual({ kind: "absent" })
    expect(evidence.enumerable.projection).toEqual(evidence.projection)
    expect(evidence.enumerable.usage).toEqual(evidence.usage)
  })
})
