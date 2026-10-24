import { describe, expect, test } from "bun:test"
import {
  isBuildId, isRouteId, isWatchId, isPageRequestId, isPageWatchId,
  isProbeReport, isProbeReportFor, isBreakageSignal, isShapeOutline, makeShapeOutline
} from "./index"
import { isPageSignalEvent } from "./page"
import type { BreakageKind, BreakageSignal, DiagnosticVocabulary, JsonValue, ShapeOutline } from "./index"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error("Invalid synthetic fixture")
  return value
}
const route = checked(isRouteId, "synthetic-route")
const watch = checked(isWatchId, "synthetic-watch")
const vocabulary = { routes: [route], watchIds: [watch], schemaKeys: ["data", "items", "value"] } satisfies DiagnosticVocabulary
const report = { site: "www", entries: [{ id: watch, present: false }] }
const signal = {
  site: "www", feature: null, job: null, route: null, kind: "timeout", watchId: null, shape: null,
  clientVersion: null, pageType: "other", count: 1, firstSeen: 0, lastSeen: 0
} satisfies BreakageSignal
const kinds = {
  missing: true, threw: true, timeout: true, rejected: true, unrecognised: true,
  "no-effect": true, "anchor-missing": true, "item-unrecognised": true, cosmetic: true,
  "cannot-measure": true, "fell-back": true, "quiet-route-noisy": true, "resolver-ambiguous": true
} satisfies Record<BreakageKind, true>

test("three page ID roles have nonempty representation guards", () => {
  for (const guard of [isWatchId, isPageRequestId, isPageWatchId, isBuildId]) {
    expect(guard("synthetic")).toBe(true)
    for (const value of ["", null, undefined, 1, {}, []]) expect(guard(value)).toBe(false)
  }
})

describe("presence reports", () => {
  test("checks unique coverage, site and boolean presence independently of order", () => {
    const second = checked(isWatchId, "second-watch")
    const expected = { site: "www", watchIds: [second, watch] } as const
    const both = { ...report, entries: [...report.entries, { id: second, present: true }] }
    expect(isProbeReport(both)).toBe(true)
    expect(isProbeReportFor(expected, both)).toBe(true)
    expect(isProbeReportFor(expected, JSON.parse(JSON.stringify(both)))).toBe(true)
    for (const entries of [[], [report.entries[0]], [...both.entries, both.entries[0]], [{ id: "unknown", present: true }]]) {
      expect(isProbeReportFor(expected, { ...report, entries })).toBe(false)
    }
    expect(isProbeReportFor({ ...expected, site: "music" }, both)).toBe(false)
    expect(isProbeReportFor({ site: "www", watchIds: [] }, { site: "www", entries: [] })).toBe(true)
    expect(isProbeReportFor({ site: "www", watchIds: [watch, watch] }, both)).toBe(false)
    expect(isProbeReport({ site: "www", entries: [{ id: watch, present: "false" }] })).toBe(false)
    expect(isProbeReport({ ...report, account: "synthetic-identity" })).toBe(false)
  })
})

describe("breakage facts", () => {
  test("covers all canonical kinds and required dependency and shape facts", () => {
    expect(Object.keys(kinds)).toHaveLength(13)
    for (const kind of Object.keys(kinds)) {
      const value = { ...signal, kind, watchId: watch, shape: { kind: "string" } }
      expect(isBreakageSignal(value, vocabulary)).toBe(true)
      expect(isBreakageSignal(JSON.parse(JSON.stringify(value)), vocabulary)).toBe(true)
    }
    for (const kind of ["missing", "threw", "unrecognised"]) expect(isBreakageSignal({ ...signal, kind }, vocabulary)).toBe(false)
    expect(isBreakageSignal({ ...signal, kind: "recovered" }, vocabulary)).toBe(false)
    expect(isBreakageSignal({ ...signal, feature: "auto-add", job: "videoInfo", route, watchId: watch }, vocabulary)).toBe(true)
  })

  test("rejects untrusted labels, metadata, scalar samples and mixed payloads", () => {
    for (const text of ["synthetic-identity", "dQw4w9WgXcQ", "Synthetic private title", "https://example.invalid/private", "settings=true", "1.2\n", "1.2\r", "1", ""]) {
      expect(isBreakageSignal({ ...signal, clientVersion: text }, vocabulary)).toBe(false)
      expect(isBreakageSignal({ ...signal, pageType: text }, vocabulary)).toBe(false)
      expect(isBreakageSignal({ ...signal, route: text }, vocabulary)).toBe(false)
      expect(isBreakageSignal({ ...signal, watchId: text }, vocabulary)).toBe(false)
      expect(isBreakageSignal({ ...signal, shape: text }, vocabulary)).toBe(false)
      expect(isBreakageSignal({ ...signal, raw: text }, vocabulary)).toBe(false)
    }
    expect(isBreakageSignal({ ...signal, clientVersion: "2.20261024.01.00", pageType: "music-browse" }, vocabulary)).toBe(true)
    for (const count of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) expect(isBreakageSignal({ ...signal, count }, vocabulary)).toBe(false)
    for (const firstSeen of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1, 2]) expect(isBreakageSignal({ ...signal, firstSeen, lastSeen: 1 }, vocabulary)).toBe(false)
    expect(isBreakageSignal({ ...signal, count: 2, firstSeen: 1, lastSeen: 2 }, vocabulary)).toBe(true)
    expect(isBreakageSignal({ ...signal, count: 1, firstSeen: 1, lastSeen: 2 }, vocabulary)).toBe(false)
    for (const key of Object.keys(signal)) {
      const value: Record<string, unknown> = { ...signal }
      delete value[key]
      expect(isBreakageSignal(value, vocabulary)).toBe(false)
    }
    expect(isBreakageSignal(new Proxy(signal, { get() { throw new Error("Proxy property read") } }), vocabulary)).toBe(false)
  })
})

describe("shape producer", () => {
  test("redacts independent source scalars and dynamic identifier-looking keys without mutating input", () => {
    const source: JsonValue = {
      data: [
        { dQw4w9WgXcQ: "Synthetic private title", account_123: "synthetic-identity", value: 314159 },
        { ABCDEFGHIJK: "https://example.invalid/private", value: true, settings_123: "setting-choice" }
      ]
    }
    const before = JSON.stringify(source)
    function freeze(value: JsonValue): void {
      if (value === null || typeof value !== "object") return
      Object.values(value).forEach(freeze)
      Object.freeze(value)
    }
    freeze(source)
    const result = makeShapeOutline(source, vocabulary.schemaKeys)
    const text = JSON.stringify(result)
    for (const secret of ["dQw4w9WgXcQ", "account_123", "ABCDEFGHIJK", "Synthetic private title", "synthetic-identity", "314159", "https://", "settings_123", "setting-choice"]) {
      expect(text.includes(secret)).toBe(false)
    }
    expect(isShapeOutline(result, vocabulary.schemaKeys)).toBe(true)
    expect(text).toContain("<key>")
    expect(text).toContain('"key":"value"')
    expect(JSON.stringify(source)).toBe(before)
    expect(makeShapeOutline({ items: [1, 2, 3, 1] }, ["items"])).toEqual(makeShapeOutline({ items: [4] }, ["items"]))
  })

  test("merges objects, redacted keys, nested arrays and scalar alternatives in canonical order", () => {
    const first: JsonValue = { data: [{ value: 1 }, { items: [null, "private", 3] }, { value: true }] }
    const second: JsonValue = { data: [{ value: false }, { items: [9, "other", null, 9] }, { value: 999 }] }
    expect(makeShapeOutline(first, vocabulary.schemaKeys)).toEqual(makeShapeOutline(second, vocabulary.schemaKeys))
    expect(makeShapeOutline({ alpha: { value: 1 }, beta: { items: [] } }, vocabulary.schemaKeys)).toEqual(
      makeShapeOutline({ gamma: { items: [] }, delta: { value: 900 } }, vocabulary.schemaKeys)
    )
    expect(makeShapeOutline(["x", null, 1, false], [])).toEqual({ kind: "array", items: [{ kind: "union", variants: [
      { kind: "boolean" }, { kind: "null" }, { kind: "number" }, { kind: "string" }
    ] }] })
    expect(makeShapeOutline([[[1]], [[true]]], [])).toEqual(makeShapeOutline([[[false, 3, 4]]], []))
  })

  test("cuts containers at source depth six, regardless of AST wrapper depth", () => {
    let source: JsonValue = { value: "private" }
    let expected: ShapeOutline = { kind: "cut", type: "object" }
    for (let i = 0; i < 6; i++) {
      source = { data: source }
      expected = { kind: "object", fields: [{ key: "data", value: expected }] }
    }
    const result = makeShapeOutline(source, ["data", "value"])
    expect(result).toEqual(expected)
    expect(isShapeOutline(expected, ["data"])).toBe(true)
    let tooDeep: ShapeOutline = { kind: "object", fields: [] }
    for (let i = 0; i < 6; i++) tooDeep = { kind: "object", fields: [{ key: "data", value: tooDeep }] }
    expect(isShapeOutline(tooDeep, ["data"])).toBe(false)
    let array: JsonValue = []
    for (let i = 0; i < 7; i++) array = [array]
    expect(JSON.stringify(makeShapeOutline(array, []))).toContain('"kind":"cut","type":"array"')
  })

  test("caps actual UTF-8 JSON bytes and preserves a valid root through deterministic pruning", () => {
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
    const shell = { kind: "object", fields: [{ key: "", value: { kind: "string" } }] }
    const overhead = bytes(shell)
    for (const length of [2048, 2049]) {
      const key = "a".repeat(length - overhead)
      const ast = { kind: "object", fields: [{ key, value: { kind: "string" } }] }
      expect(bytes(ast)).toBe(length)
      expect(isShapeOutline(ast, [key])).toBe(length === 2048)
      expect(bytes(makeShapeOutline({ [key]: "private" }, [key]))).toBeLessThanOrEqual(2048)
      const remaining = length - overhead
      const unicodeKey = "é".repeat(Math.floor(remaining / 2)) + "a".repeat(remaining % 2)
      const unicode = { kind: "object", fields: [{ key: unicodeKey, value: { kind: "string" } }] }
      expect(bytes(unicode)).toBe(length)
      expect(isShapeOutline(unicode, [unicodeKey])).toBe(length === 2048)
    }
    for (const key of ["é".repeat(1000), "😀".repeat(500), '"\\\n'.repeat(400), "\ud800".repeat(400)]) {
      const result = makeShapeOutline({ [key]: "private" }, [key])
      expect(bytes(result)).toBeLessThanOrEqual(2048)
      expect(isShapeOutline(result, [key])).toBe(true)
    }
    const source = Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`schema${i}`, { value: i }]))
    const keys = Object.keys(source).concat("value")
    const pruned = makeShapeOutline(source, keys)
    expect(isShapeOutline(pruned, keys)).toBe(true)
    expect(bytes(pruned)).toBeLessThanOrEqual(2048)
    expect(makeShapeOutline(Object.fromEntries(Object.entries(source).reverse()), keys)).toEqual(pruned)
  })
})

test("independent malformed ASTs fail without trusting the producer", () => {
  for (const value of [
    "string", null, { kind: "string", value: "private" }, { kind: "number", count: 1 },
    { kind: "array", length: 3, items: [] }, { kind: "object", fields: [{ key: "unknown", value: { kind: "string" } }] },
    { kind: "cut", type: "string" }, { kind: "union", variants: [] }, { kind: "union", variants: [{ kind: "null" }] },
    { kind: "union", variants: [{ kind: "null" }, { kind: "null" }] },
    { kind: "union", variants: [{ kind: "string" }, { kind: "number" }] },
    { kind: "union", variants: [{ kind: "union", variants: [{ kind: "number" }, { kind: "string" }] }, { kind: "null" }] },
    { kind: "array", items: [{ kind: "object", fields: [] }, { kind: "object", fields: [] }] },
    { kind: "array", items: [{ kind: "number" }, { kind: "string" }] },
    { kind: "object", fields: [{ key: "value", value: { kind: "null" } }, { key: "data", value: { kind: "number" } }] },
    { kind: "object", fields: [{ key: "data", value: { kind: "null" } }, { key: "data", value: { kind: "number" } }] }
  ]) expect(isShapeOutline(value, vocabulary.schemaKeys)).toBe(false)
  expect(isShapeOutline({ kind: "object", fields: [{ key: "<key>", value: { kind: "string" } }] }, [])).toBe(true)
  let getterCalls = 0
  const items = [{ kind: "string" }]
  Object.defineProperty(items, "0", { get() { getterCalls++; return { kind: "string" } } })
  expect(isShapeOutline({ kind: "array", items }, [])).toBe(false)
  expect(getterCalls).toBe(0)
  const parsed: unknown = JSON.parse('{"__proto__":{"private":"value"},"data":1}')
  expect(isShapeOutline(parsed, ["data"])).toBe(false)
})

describe("outline serialization ignores inherited hooks", () => {
  for (const prototype of [Object.prototype, Array.prototype]) {
    for (const accessor of [false, true]) {
      for (const throws of [false, true]) {
        const name = prototype === Object.prototype ? "Object" : "Array"
        test(`${name} toJSON ${accessor ? "getter" : "function"} ${throws ? "throwing" : "returning"}`, () => {
          const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
          const keys = Array.from({ length: 65 }, (_, i) => `schema${String(i).padStart(2, "0")}`)
          const source = Object.freeze(Object.fromEntries(keys.map(key => [key, "SYNTHETIC_PRIVATE_SCALAR"])))
          const before = JSON.stringify(source)
          const oversized = { kind: "object", fields: keys.map(key => ({ key, value: { kind: "string" } })) }
          const nullRoot: unknown = Object.assign(Object.create(null), oversized)
          const fixtures = [oversized, nullRoot]
          const shell = bytes({ kind: "object", fields: [{ key: "", value: { kind: "string" } }] })
          for (const size of [2047, 2048, 2049]) {
            for (const unit of ["a", "é", "😀", "\ud800", '"\\\n']) {
              const width = bytes(unit) - 2
              const count = Math.floor((size - shell) / width)
              const key = unit.repeat(count) + "a".repeat(size - shell - count * width)
              keys.push(key)
              fixtures.push({ kind: "object", fields: [{ key, value: { kind: "string" } }] })
            }
          }
          const expected = fixtures.map(value => bytes(value) <= 2048)
          const valid = makeShapeOutline({ data: [null, { private_key: "PRIVATE", value: true }] }, ["data", "value"])
          const expectedProduced = makeShapeOutline(source, keys)
          const diagnosticVocabulary = { ...vocabulary, schemaKeys: keys }
          const build = checked(isBuildId, "synthetic-build")
          const previous = Object.getOwnPropertyDescriptor(prototype, "toJSON")
          let getterReads = 0
          let calls = 0
          const hook = () => {
            calls++
            if (throws) throw new Error("Inherited serialization function ran")
            return "tiny"
          }
          const results: boolean[][] = []
          let produced: ShapeOutline | undefined
          let unchanged: ShapeOutline | undefined
          let failure: unknown
          try {
            Object.defineProperty(prototype, "toJSON", accessor ? {
              configurable: true,
              get() {
                getterReads++
                if (throws) throw new Error("Inherited serialization getter ran")
                return hook
              }
            } : { configurable: true, value: hook })
            for (const shape of fixtures) {
              const fact = { ...signal, kind: "unrecognised", shape }
              results.push([
                isShapeOutline(shape, keys),
                isBreakageSignal(fact, diagnosticVocabulary),
                isPageSignalEvent({ v: 1, build, kind: "signal", signal: fact }, {
                  build, site: "www", vocabulary: diagnosticVocabulary
                })
              ])
            }
            produced = makeShapeOutline(source, keys)
            unchanged = makeShapeOutline({ data: [null, { private_key: "OTHER", value: false }] }, ["data", "value"])
          } catch (error) { failure = error }
          finally {
            if (previous) Object.defineProperty(prototype, "toJSON", previous)
            else Reflect.deleteProperty(prototype, "toJSON")
          }
          expect(getterReads).toBe(0)
          expect(calls).toBe(0)
          expect(failure).toBeUndefined()
          expect(bytes(oversized)).toBe(2953)
          expect(results).toEqual(expected.map(accepted => [accepted, accepted, accepted]))
          expect(produced).toEqual(expectedProduced)
          expect(bytes(produced)).toBeLessThanOrEqual(2048)
          expect(isShapeOutline(produced, keys)).toBe(true)
          expect(unchanged).toEqual(valid)
          expect(JSON.stringify(source)).toBe(before)
          expect(JSON.stringify(produced)).not.toContain("SYNTHETIC_PRIVATE_SCALAR")
        })
      }
    }
  }
})
