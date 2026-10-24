import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AccountKey, Device, PlaylistId, VideoId } from "../model"
import { isAccountKey, isPlaylistId, isVideoId } from "../model"
import {
  CONTRACT_VERSION, inspectMessageHeader, isBreakageKind, isBuildId, isChangeResult,
  isFeatureId, isJobFailure, isJobId, isJsonValue, isPrivacy, isSite, isStream, parseJsonText
} from "./index"
import type {
  BreakageKind, BuildId, ChangeResult, FeatureId, JobFailure, JobFailureReason,
  JobId, JsonValue, Origin, Privacy, Site, Stream
} from "./index"

function build(value: string): BuildId {
  if (!isBuildId(value)) throw new Error("Invalid synthetic build")
  return value
}

const currentBuild = build("synthetic build / local")
const otherBuild = build("synthetic-other")
const sites = ["www", "music"] satisfies Site[]
const features = [
  "auto-add", "shortcuts", "quick-save", "queue-button", "watch-button", "card-menu",
  "browser-menu", "music-actions", "music-keys", "any-tab-keys", "gather", "sync"
] satisfies FeatureId[]
const jobs = [
  "account", "accountLabel", "membership", "playlists", "add", "remove", "addBatch",
  "removeBatch", "save", "unsave", "create", "channelOf", "resolveChannel", "videoInfo",
  "queueAdd", "queueUndo", "queueAddList", "openCardMenu", "itemInfo", "queueInsert",
  "queueRemove", "queueRemoveIds", "queueMove", "queueReinsert", "like", "library",
  "navigate", "nowPlaying", "castState"
] satisfies JobId[]
const streams = ["player", "nav", "nowPlaying", "queue"] satisfies Stream[]
const breakageKinds = [
  "missing", "threw", "timeout", "rejected", "unrecognised", "no-effect", "anchor-missing",
  "item-unrecognised", "cosmetic", "cannot-measure", "fell-back", "quiet-route-noisy", "resolver-ambiguous"
] satisfies BreakageKind[]
const privacy = ["PRIVATE", "UNLISTED", "PUBLIC"] satisfies Privacy[]

describe("C0 vocabulary", () => {
  for (const [name, predicate, values] of [
    ["Site", isSite, sites], ["FeatureId", isFeatureId, features], ["JobId", isJobId, jobs],
    ["Stream", isStream, streams], ["BreakageKind", isBreakageKind, breakageKinds], ["Privacy", isPrivacy, privacy]
  ] satisfies [string, (value: unknown) => boolean, string[]][]) {
    test(`${name} accepts its complete prescribed catalogue`, () => {
      for (const value of values) expect(predicate(value)).toBe(true)
      for (const value of [null, undefined, 1, true, {}, [], "", "unknown", "toString", "constructor", "__proto__", "hasOwnProperty"]) {
        expect(predicate(value)).toBe(false)
      }
      for (const value of values) {
        expect(predicate(`${value} `)).toBe(false)
        expect(predicate(`${value}-typo`)).toBe(false)
      }
    })
  }

  test("rejects legacy and differently spelled identifiers", () => {
    for (const value of ["videoChannel", "queue-add", "account-label", "noTab", "run"]) expect(isJobId(value)).toBe(false)
    expect(isFeatureId("autoAdd")).toBe(false)
    expect(isBreakageKind("unrecognized")).toBe(false)
    expect(isStream("now-playing")).toBe(false)
    expect(isPrivacy("private")).toBe(false)
  })

  test("build identity is opaque and nonempty", () => {
    for (const value of ["local", "not-semver / synthetic", " ", "0", "build:synthetic"]) expect(isBuildId(value)).toBe(true)
    for (const value of ["", null, undefined, 1, {}, new String("build")]) expect(isBuildId(value)).toBe(false)
  })

  test("brand assignability remains canonical and privacy derives from Device", () => {
    type Assignable<A, B> = A extends B ? true : false
    const checks: [Assignable<string, AccountKey>, Assignable<string, VideoId>, Assignable<string, PlaylistId>, Assignable<string, BuildId>] = [false, false, false, false]
    const privacyChecks: [Assignable<Privacy, NonNullable<Device["newPlaylistVisibility"]>>, Assignable<NonNullable<Device["newPlaylistVisibility"]>, Privacy>] = [true, true]
    expect(checks).toEqual([false, false, false, false])
    expect(privacyChecks).toEqual([true, true])
    const account: unknown = "syntheticAcct001"
    const video: unknown = "synthetic01"
    const playlist: unknown = "WL"
    if (!isAccountKey(account) || !isVideoId(video) || !isPlaylistId(playlist)) throw new Error("Invalid synthetic fixture")
    const canonical: { account: AccountKey; video: VideoId; playlist: PlaylistId } = { account, video, playlist }
    expect(canonical).toEqual({ account, video, playlist })
  })
})

describe("strict JSON data boundary", () => {
  test("round trips objects, arrays, every primitive and null", () => {
    const values: JsonValue[] = [null, true, false, 0, -7.5, "synthetic", [], {}, [1, "two", null], { nested: [{ enabled: true }] }]
    for (const value of values) {
      expect(isJsonValue(value)).toBe(true)
      expect(parseJsonText(JSON.stringify(value))).toEqual({ ok: true, value })
    }
    expect(isJsonValue(Object.freeze({ nested: Object.freeze([1, 2]) }))).toBe(true)
    expect(isJsonValue(Object.assign(Object.create(null), { synthetic: 1 }))).toBe(true)
  })

  test("does not coerce non-string detail or accept malformed or overflowing text", () => {
    for (const text of [null, undefined, 5, {}, [], new String("{}"), "", "undefined", "{", "[1,]", "NaN", "Infinity", "1e400", '{"nested":-1e400}', "{} trailing"]) {
      expect(parseJsonText(text)).toEqual({ ok: false })
    }
    let coercions = 0
    expect(parseJsonText({ toString() { coercions++; return "{}" } })).toEqual({ ok: false })
    expect(coercions).toBe(0)
  })

  test("rejects non-JSON values at the root and nested in arrays or objects", () => {
    class Instance { value = 1 }
    class ArrayInstance extends Array {}
    for (const value of [undefined, 1n, () => null, Symbol("synthetic"), NaN, Infinity, -Infinity,
      new Date(0), new Map(), new Set(), new Instance(), new ArrayInstance(), new Number(1), new Uint8Array([1]), /synthetic/]) {
      expect(isJsonValue(value)).toBe(false)
      expect(isJsonValue({ nested: value })).toBe(false)
      expect(isJsonValue([value])).toBe(false)
    }
  })

  test("rejects sparse arrays and properties that serialization would discard", () => {
    for (const value of [Array(1), [1, , 3], Object.assign([1], { extra: 2 }),
      Object.assign({}, { [Symbol("synthetic")]: 1 }), Object.assign([], { [Symbol("synthetic")]: 1 }),
      Object.defineProperty({}, "hidden", { value: 1 }), Object.defineProperty([1], "0", { value: 1, enumerable: false })]) {
      expect(isJsonValue(value)).toBe(false)
    }
  })

  test("rejects cycles but permits shared acyclic references and deep data", () => {
    const object: { self?: unknown } = {}
    object.self = object
    const array: unknown[] = []
    array.push(array)
    expect(isJsonValue(object)).toBe(false)
    expect(isJsonValue(array)).toBe(false)
    expect(isJsonValue({ nested: [object] })).toBe(false)
    const shared = { value: [1, 2, 3] }
    expect(isJsonValue({ first: shared, second: shared, array: [shared, shared] })).toBe(true)
    let deep: unknown = null
    for (let i = 0; i < 20000; i++) deep = { child: deep }
    expect(isJsonValue(deep)).toBe(true)
    expect(isJsonValue("x".repeat(100000))).toBe(true)
  })

  test("never invokes accessors or toJSON", () => {
    let calls = 0
    const getter = () => { calls++; throw new Error("Accessor executed") }
    for (const value of [
      Object.defineProperty({}, "field", { get: getter, enumerable: true }),
      Object.defineProperty({}, "hidden", { get: getter }),
      Object.defineProperty([1], "0", { get: getter, enumerable: true }),
      Object.defineProperty({}, "toJSON", { get: getter, enumerable: true }),
      { toJSON() { calls++; return {} } },
      Object.create({ get inherited() { return getter() } })
    ]) expect(isJsonValue(value)).toBe(false)
    expect(calls).toBe(0)
  })

  test("prototype-looking data keys survive without changing any prototype", () => {
    const parsed = parseJsonText('{"__proto__":{"syntheticPollution":true},"constructor":{"prototype":{"x":1}},"prototype":"data"}')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object") throw new Error("Expected an object")
    expect(Object.getPrototypeOf(parsed.value)).toBe(Object.prototype)
    expect(Object.hasOwn(parsed.value, "__proto__")).toBe(true)
    expect(Object.hasOwn(Object.prototype, "syntheticPollution")).toBe(false)
    expect(parseJsonText(JSON.stringify(parsed.value))).toEqual(parsed)
  })

  test("throwing reflection and revoked proxies return invalid without throwing", () => {
    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    const throwing = new Proxy({}, { getPrototypeOf() { throw new Error("Synthetic reflection failure") } })
    for (const value of [revoked.proxy, throwing]) {
      expect(isJsonValue(value)).toBe(false)
      expect(isJobFailure(value)).toBe(false)
      expect(isChangeResult(value)).toBe(false)
      expect(inspectMessageHeader(value, currentBuild)).toEqual({ kind: "invalid" })
    }
  })
})

describe("exact result branches", () => {
  test("accepts all gateway failure reasons and HTTP boundaries", () => {
    const reasons = ["signedOut", "accountChanged", "unavailable", "unconfirmed", "failed"] satisfies JobFailureReason[]
    for (const reason of reasons) {
      const failure: JobFailure = { ok: false, reason }
      expect(isJobFailure(failure)).toBe(true)
      expect(isJobFailure({ ...failure, http: 100 })).toBe(true)
      expect(isJobFailure({ ...failure, http: 599, status: "arbitrary synthetic status" })).toBe(true)
      expect(isJobFailure({ ...failure, status: "" })).toBe(true)
      expect(isJobFailure(JSON.parse(JSON.stringify(failure)))).toBe(true)
    }
  })

  test("rejects malformed, mixed and extended gateway failure results", () => {
    const failure = { ok: false, reason: "failed" }
    for (const value of [null, [], {}, { ok: false }, { reason: "failed" }, { ok: true, reason: "failed" },
      { ...failure, reason: "timeout" }, { ...failure, reason: "noTab" }, { ...failure, reason: "constructor" },
      { ...failure, reason: null }, { ...failure, reason: 1 }, { ...failure, status: 1 }, { ...failure, status: undefined },
      { ...failure, data: null }, { ...failure, route: "synthetic" }, { ...failure, refused: "private" },
      { ...failure, extra: true }, ...[99, 600, 200.5, NaN, Infinity, "200", null, undefined].map(http => ({ ...failure, http }))]) {
      expect(isJobFailure(value)).toBe(false)
    }
    expect(isJobFailure(Object.create(failure))).toBe(false)
  })

  test("accepts exactly the five store result forms", () => {
    const results: ChangeResult[] = [{ ok: true }, { refused: "private" }, { refused: "sync-full" }, { refused: "update-needed" }, { refused: "invalid" }]
    for (const result of results) {
      expect(isChangeResult(result)).toBe(true)
      expect(isChangeResult(JSON.parse(JSON.stringify(result)))).toBe(true)
    }
    for (const value of [null, [], {}, { ok: false }, { ok: 1 }, { ok: "true" }, { refused: "unknown" },
      { refused: "constructor" }, { refused: null }, { refused: 1 }, { refused: undefined },
      { ok: true, refused: "private" }, { ok: false, refused: "private" }, { ok: true, data: null },
      { refused: "invalid", reason: "failed" }, { ok: true, extra: undefined }]) expect(isChangeResult(value)).toBe(false)
    expect(isChangeResult(Object.create({ ok: true }))).toBe(false)
  })

  test("result guards reject accessors without executing them", () => {
    let calls = 0
    for (const value of [
      { get ok() { calls++; return false }, reason: "failed" },
      { ok: false, get reason() { calls++; return "failed" } },
      { ok: false, reason: "failed", get status() { calls++; return "synthetic" } },
      { get refused() { calls++; return "private" } }
    ]) {
      expect(isJobFailure(value)).toBe(false)
      expect(isChangeResult(value)).toBe(false)
    }
    expect(calls).toBe(0)
  })

  test("origin retains only the prescribed trusted metadata shapes", () => {
    const origins: Origin[] = [
      { kind: "tab", tabId: 1, incognito: true }, { kind: "ui", windowId: 2, incognito: false },
      { kind: "background" }, { kind: "sync" }
    ]
    expect(origins.map(origin => origin.kind)).toEqual(["tab", "ui", "background", "sync"])
  })
})

describe("header compatibility without payload acceptance", () => {
  test("returns a fresh matching header without mutating the envelope", () => {
    const raw = Object.freeze({ v: CONTRACT_VERSION, build: currentBuild, payload: Object.freeze({ arbitrary: "synthetic" }) })
    const result = inspectMessageHeader(raw, currentBuild)
    expect(result).toEqual({ kind: "ok", header: { v: 1, build: currentBuild } })
    if (result.kind !== "ok") throw new Error("Expected matching header")
    expect(result.header).not.toBe(raw)
    expect(Object.keys(result.header)).toEqual(["v", "build"])
    expect(raw.payload).toEqual({ arbitrary: "synthetic" })
  })

  test("classifies version before build and malformed data before either mismatch", () => {
    expect(inspectMessageHeader({ v: 2, build: currentBuild }, currentBuild)).toEqual({ kind: "unsupported-version", received: 2 })
    expect(inspectMessageHeader({ v: 2, build: otherBuild }, currentBuild)).toEqual({ kind: "unsupported-version", received: 2 })
    expect(inspectMessageHeader({ v: 1, build: otherBuild }, currentBuild)).toEqual({ kind: "build-mismatch", received: otherBuild })
    expect(inspectMessageHeader({ v: 2, build: "" }, currentBuild)).toEqual({ kind: "invalid" })
    expect(inspectMessageHeader({ v: 2, build: otherBuild, payload: undefined }, currentBuild)).toEqual({ kind: "invalid" })
    expect(inspectMessageHeader({ v: 1, build: otherBuild, payload: Infinity }, currentBuild)).toEqual({ kind: "invalid" })
    expect(inspectMessageHeader({ v: Number.MAX_SAFE_INTEGER, build: currentBuild }, currentBuild)).toEqual({ kind: "unsupported-version", received: Number.MAX_SAFE_INTEGER })
  })

  test("requires own correctly typed fields on a JSON object", () => {
    for (const raw of [null, undefined, 1, "{}", [], {}, { v: 1 }, { build: currentBuild },
      ...[0, -1, 1.5, "1", true, null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(v => ({ v, build: currentBuild })),
      ...["", undefined, null, 1, true, {}].map(build => ({ v: 1, build })),
      { v: 1, build: currentBuild, payload: () => null }, { v: 1, build: currentBuild, payload: Array(1) },
      Object.create({ v: 1, build: currentBuild }), Object.assign(Object.create({ v: 1 }), { build: currentBuild }),
      Object.assign(Object.create({ build: currentBuild }), { v: 1 })]) {
      expect(inspectMessageHeader(raw, currentBuild)).toEqual({ kind: "invalid" })
    }
  })

  test("does not invoke header or payload accessors", () => {
    let calls = 0
    for (const raw of [
      { get v() { calls++; return 1 }, build: currentBuild },
      { v: 1, get build() { calls++; return currentBuild } },
      { v: 1, build: currentBuild, get payload() { calls++; return {} } }
    ]) expect(inspectMessageHeader(raw, currentBuild)).toEqual({ kind: "invalid" })
    expect(calls).toBe(0)
  })

  test("a real JSON round trip preserves compatibility without validating the payload", () => {
    const envelope = { v: 1, build: currentBuild, kind: "synthetic-unknown-kind", payload: { invalidForFutureJob: true } }
    const parsed = parseJsonText(JSON.stringify(envelope))
    expect(parsed).toEqual({ ok: true, value: envelope })
    if (!parsed.ok) throw new Error("Expected JSON value")
    expect(inspectMessageHeader(parsed.value, currentBuild)).toEqual({ kind: "ok", header: { v: 1, build: currentBuild } })
  })
})

test("headless imports and boundary checks have no runtime side effects", () => {
  const directory = mkdtempSync(join(tmpdir(), "ytpt-contract-foundation-"))
  const config = join(directory, "bunfig.toml")
  try {
    writeFileSync(config, "[test]\npreload = []\n")
    const result = Bun.spawnSync({
      cmd: [process.execPath, "--no-env-file", `--config=${config}`, "--eval", `
        const effects = []
        function forbid(name) {
          return () => { effects.push(name); throw new Error("Unexpected effect " + name) }
        }
        for (const name of ["window", "document", "browser", "chrome", "localStorage", "sessionStorage",
          "indexedDB", "storage", "wxt", "navigator", "MutationObserver"]) {
          Object.defineProperty(globalThis, name, { configurable: true, get: forbid(name) })
        }
        for (const name of ["setTimeout", "setInterval", "setImmediate", "requestAnimationFrame",
          "addEventListener", "queueMicrotask", "fetch"]) {
          Object.defineProperty(globalThis, name, { configurable: true, value: forbid(name) })
        }
        for (const name of ["log", "warn", "error", "info", "debug", "trace", "table"]) {
          Object.defineProperty(console, name, { configurable: true, value: forbid("console." + name) })
        }
        Date.now = forbid("Date.now")
        Math.random = forbid("Math.random")
        for (const name of ["Date", "performance", "crypto"]) {
          Object.defineProperty(globalThis, name, { configurable: true, get: forbid(name) })
        }
        const contracts = await import(${JSON.stringify(new URL("./index.ts", import.meta.url).href)})
        const build = "synthetic-headless"
        if (!contracts.isBuildId(build)) throw new Error("Invalid build")
        const parsed = contracts.parseJsonText(JSON.stringify({ v: 1, build, payload: { synthetic: true } }))
        if (!parsed.ok || contracts.inspectMessageHeader(parsed.value, build).kind !== "ok") throw new Error("Invalid header")
        if (!contracts.isJobFailure({ ok: false, reason: "failed", http: 500 })) throw new Error("Invalid failure")
        if (!contracts.isChangeResult({ refused: "private" })) throw new Error("Invalid result")
        if (!contracts.isSite("www") || !contracts.isFeatureId("gather") || !contracts.isJobId("library") ||
          !contracts.isStream("queue") || !contracts.isPrivacy("PRIVATE") || !contracts.isBreakageKind("missing")) throw new Error("Invalid vocabulary")
        if (effects.length !== 0) throw new Error("Side effects observed")
        process.stdout.write("pure contract operations passed\\n")
      `],
      cwd: import.meta.dir, stdout: "pipe", stderr: "pipe"
    })
    expect(result.exitCode).toBe(0)
    expect(result.stderr.toString()).toBe("")
    expect(result.stdout.toString()).toBe("pure contract operations passed\n")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
