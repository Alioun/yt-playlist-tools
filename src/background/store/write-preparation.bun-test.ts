import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { execFileSync } from "node:child_process"
import ts from "typescript"
import * as model from "../../shared/model"
import { isJsonValue } from "../../shared/contracts/json"
import * as wire from "./sync-codec"
import * as accounts from "./accounts"
import { prepareDocumentBody, type PrepareBodyInput } from "./write-preparation"

type Dependencies = typeof model & typeof wire & typeof accounts

function fixtureSuite(prepare: typeof prepareDocumentBody, dependencies: Dependencies, poison = false) {
  let assertions = 0
  const controls: string[] = []
  function check(value: unknown, label: string): asserts value {
    assertions++
    if (!value) throw new Error(label)
  }
  function equal(actual: unknown, expected: unknown, label: string) {
    const pending: [unknown, unknown][] = [[actual, expected]]
    while (pending.length) {
      const [a, b] = pending.pop()!
      if (Object.is(a, b)) continue
      check(a !== null && b !== null && typeof a === "object" && typeof b === "object", label)
      check(Array.isArray(a) === Array.isArray(b), label)
      const keys = Object.keys(a)
      check(keys.length === Object.keys(b).length, label)
      if (Array.isArray(a) && Array.isArray(b)) check(a.length === b.length, label)
      for (const key of keys) {
        check(Object.hasOwn(b, key), label)
        pending.push([Object.getOwnPropertyDescriptor(a, key)!.value, Object.getOwnPropertyDescriptor(b, key)!.value])
      }
    }
  }
  function freeze<T>(value: T): T {
    const pending: unknown[] = [value]
    const visited = new Set<object>()
    while (pending.length) {
      const next = pending.pop()
      if (next === null || typeof next !== "object" || visited.has(next)) continue
      visited.add(next)
      if (next instanceof Set && !Object.isFrozen(next)) {
        const fail = () => { throw new Error("Set mutation") }
        for (const method of ["add", "delete", "clear"]) Object.defineProperty(next, method, { value: fail })
      }
      for (const key of Reflect.ownKeys(next)) {
        const descriptor = Object.getOwnPropertyDescriptor(next, key)!
        if ("value" in descriptor) pending.push(descriptor.value)
      }
      Object.freeze(next)
    }
    return value
  }
  const jsonInvalid = { kind: "invalid", reason: "json" }
  const shapeInvalid = { kind: "invalid", reason: "shape" }
  const plainKey = { code: "KeyA", ctrl: false, alt: true, shift: false, meta: false }
  const id = "UCaaaaaaaaaaaaaaaaaaaaaa"
  const context = freeze({ shortcutIds: new Set(["save01", "save03"]), additionalChosenPlaylists: new Set(["WL"]) })
  function raw(input: unknown) { return prepare(freeze(input) as PrepareBodyInput) }
  function settings() {
    return {
      theme: "dark", undoKey: { ...plainKey, char: undefined, keyFuture: ["undo"] },
      autoAdd: { on: true, feedback: false, pct: 0, toolbarTick: false, toolbarPaused: true, future: "auto" },
      shortcuts: {
        on: false, feedback: true, music: false, preset: true,
        picker: { ...plainKey, char: "" },
        list: [
          { id: "save01", key: { ...plainKey, char: undefined, future: "key" }, label: "  " + "🙂".repeat(41) + "  ", watchLaterOnEveryAccount: true, future: "row" },
          { id: "save02", key: null, label: "  Second  ", watchLaterOnEveryAccount: false },
          { id: "save03", key: { ...plainKey, char: "非" }, label: "Third", watchLaterOnEveryAccount: true }
        ], future: { char: "unknown" }
      },
      quickSave: { on: false, feedback: true, shortsShelves: true },
      queueButton: { on: true, feedback: false }, watchButton: { on: false, feedback: true, shorts: false },
      cardMenu: { on: true, keepLinkMenu: true }, browserMenu: { on: false, feedback: true }, musicSection: false,
      musicActions: { on: true, feedback: false, preset: true, buttons: { next: true, queue: false, save: true, like: false, remove: true, bar: false, library: true, mix: false, album: true, artist: false } },
      musicKeys: { on: true, feedback: false, preset: true, keys: {
        next: { ...plainKey, char: undefined }, queue: { ...plainKey, char: "é" }, save: null,
        like: { ...plainKey, char: undefined }, remove: { ...plainKey, char: undefined },
        library: { ...plainKey, char: undefined }, mix: { ...plainKey, char: undefined },
        album: { ...plainKey, char: undefined }, artist: { ...plainKey, char: undefined }, picker: { ...plainKey, char: undefined },
        futureAction: { char: "opaque", nested: [null] }
      }, future: "section" },
      anyTabKeys: { on: false, feedback: true },
      gather: { on: true, feedback: false, to: "playlist", order: "shuffled", close: true, auto: { unvisited: true, after: "1w", background: false, count: true, n: 50 } },
      future: { char: "unchanged", pct: null, handle: "opaque" }, toJSON: "inert"
    }
  }
  const expectedSettings = {
    theme: "dark", undoKey: { code: "KeyA", ctrl: false, alt: true, shift: false, meta: false, keyFuture: ["undo"] },
    autoAdd: { on: true, feedback: false, pct: 0, toolbarTick: false, toolbarPaused: true, future: "auto" },
    shortcuts: { on: false, feedback: true, music: false, preset: true, picker: { ...plainKey, char: "" }, list: [
      { id: "save01", key: { code: "KeyA", ctrl: false, alt: true, shift: false, meta: false, future: "key" }, label: "🙂".repeat(40), watchLaterOnEveryAccount: true, future: "row" },
      { id: "save02", key: null, label: "Second", watchLaterOnEveryAccount: false },
      { id: "save03", key: { ...plainKey, char: "非" }, label: "Third", watchLaterOnEveryAccount: true }
    ], future: { char: "unknown" } },
    quickSave: { on: false, feedback: true, shortsShelves: true }, queueButton: { on: true, feedback: false }, watchButton: { on: false, feedback: true, shorts: false },
    cardMenu: { on: true, keepLinkMenu: true }, browserMenu: { on: false, feedback: true }, musicSection: false,
    musicActions: { on: true, feedback: false, preset: true, buttons: { next: true, queue: false, save: true, like: false, remove: true, bar: false, library: true, mix: false, album: true, artist: false } },
    musicKeys: { on: true, feedback: false, preset: true, keys: {
      next: plainKey, queue: { ...plainKey, char: "é" }, save: null, like: plainKey, remove: plainKey,
      library: plainKey, mix: plainKey, album: plainKey, artist: plainKey, picker: plainKey,
      futureAction: { char: "opaque", nested: [null] }
    }, future: "section" },
    anyTabKeys: { on: false, feedback: true },
    gather: { on: true, feedback: false, to: "playlist", order: "shuffled", close: true, auto: { unvisited: true, after: "1w", background: false, count: true, n: 50 } },
    future: { char: "unchanged", pct: null, handle: "opaque" }, toJSON: "inert"
  }
  const settingsInput = freeze(settings())
  const settingsResult = raw({ kind: "settings", data: settingsInput })
  equal(settingsResult, { kind: "prepared", data: expectedSettings }, "1 settings literal")
  check(Object.hasOwn(settingsInput.undoKey, "char") && settingsInput.undoKey.char === undefined, "settings unchanged")
  const allOptionalKeys = dependencies.decodeSettings(settings())
  allOptionalKeys.musicKeys.keys.save = { ...plainKey, char: undefined }
  allOptionalKeys.musicKeys.keys.queue!.char = undefined
  allOptionalKeys.shortcuts.picker!.char = undefined
  equal(raw({ kind: "settings", data: freeze(allOptionalKeys) }), { kind: "prepared", data: {
    ...expectedSettings, shortcuts: { ...expectedSettings.shortcuts, picker: plainKey },
    musicKeys: { ...expectedSettings.musicKeys, keys: { ...expectedSettings.musicKeys.keys, queue: plainKey, save: plainKey } }
  } }, "all MusicAction optional keys including save and queue")

  const setupInput = freeze({
    label: { name: "🙂".repeat(101), handle: undefined, avatar: undefined, future: "label" },
    autoAdd: [ { pl: "PL_A", takes: "both", pct: undefined, future: ["entry"] }, { pl: "PL_B", takes: "videos", pct: 0 }, { pl: "PL_C", takes: "shorts", pct: 100 } ],
    targets: { save01: "PL_T", gone01: "PL_GONE" }, quickSave: "PL_Q", musicSave: "PL_M", gather: "PL_G",
    marks: { PL_A: "full", PL_B: "missing", PL_C: "full", PL_T: "missing", PL_Q: "full", PL_M: "missing", PL_G: "full", WL: "missing", PL_GONE: "full", PL_OTHER: "missing" },
    future: { channels: ["opaque"], pct: 0 }
  })
  const expectedSetup = {
    label: { name: "🙂".repeat(100), future: "label" },
    autoAdd: [ { pl: "PL_A", takes: "both", future: ["entry"] }, { pl: "PL_B", takes: "videos", pct: 0 }, { pl: "PL_C", takes: "shorts", pct: 100 } ],
    targets: { save01: "PL_T" }, quickSave: "PL_Q", musicSave: "PL_M", gather: "PL_G",
    marks: { PL_A: "full", PL_B: "missing", PL_C: "full", PL_T: "missing", PL_Q: "full", PL_M: "missing", PL_G: "full", WL: "missing" },
    future: { channels: ["opaque"], pct: 0 }
  }
  equal(raw({ kind: "setup", data: setupInput, context }), { kind: "prepared", data: expectedSetup }, "2 setup effective context")
  const noWL = freeze({ shortcutIds: new Set(["save01"]), additionalChosenPlaylists: new Set<string>() })
  const marksWithoutWL = { PL_A: "full", PL_B: "missing", PL_C: "full", PL_T: "missing", PL_Q: "full", PL_M: "missing", PL_G: "full" }
  equal(raw({ kind: "setup", data: setupInput, context: noWL }), { kind: "prepared", data: { ...expectedSetup, marks: marksWithoutWL } }, "no effective WL")
  check(settingsInput.shortcuts.list[0]!.watchLaterOnEveryAccount, "shared default exists")
  const overridden = freeze({ ...setupInput, targets: { save01: "PL_T", save03: "PL_T" } })
  equal(raw({ kind: "setup", data: overridden, context: { shortcutIds: new Set(["save01", "save03"]), additionalChosenPlaylists: new Set() } }), {
    kind: "prepared", data: { ...expectedSetup, targets: { save01: "PL_T", save03: "PL_T" }, marks: marksWithoutWL }
  }, "every surviving shared WL default has an explicit account override")
  equal(raw({ kind: "setup", data: freeze({ ...setupInput, label: { name: "Account", handle: "🙂".repeat(31), avatar: "", future: 1 } }), context }), {
    kind: "prepared", data: { ...expectedSetup, label: { name: "Account", handle: "🙂".repeat(30), avatar: "", future: 1 } }
  }, "setup known handle truncation and empty avatar")
  check(context.shortcutIds.size === 2 && context.additionalChosenPlaylists.has("WL"), "context immutable")

  const hole = [id, "hole", null, { future: ["é", null] }, "tail"]
  delete hole[2]
  const trailingHole = [id, "trailing", undefined]
  delete trailingHole[2]
  const filterInput = freeze({ mode: "allow", on: true, channels: [
    [id, "two"], [id, "undefined", undefined], [id, "null", null], [id, "empty", ""],
    [id, "🙂".repeat(101), "🙂".repeat(31)], [id, "future", undefined, { future: ["é", null] }, "tail"],
    hole, [id, "placeholder", null, null, ["e\u0301", "\ud800"]], trailingHole
  ], future: { "名🙂": "e\u0301\ud800", handle: null }, toJSON: "data" })
  const expectedFilter = { mode: "allow", on: true, channels: [
    [id, "two"], [id, "undefined"], [id, "null"], [id, "empty", ""],
    [id, "🙂".repeat(100), "🙂".repeat(30)], [id, "future", null, { future: ["é", null] }, "tail"],
    [id, "hole", null, { future: ["é", null] }, "tail"], [id, "placeholder", null, null, ["e\u0301", "\ud800"]], [id, "trailing"]
  ], future: { "名🙂": "e\u0301\ud800", handle: null }, toJSON: "data" }
  const filterResult = raw({ kind: "filter", data: filterInput })
  equal(filterResult, { kind: "prepared", data: expectedFilter }, "3 tuple positions and Unicode")
  check(!Object.hasOwn(hole, "2") && filterInput.channels[5]![2] === undefined, "tuple input unchanged")

  const shared = freeze({ dense: [null, "e\u0301", "\ud800"], toJSON: "inert" })
  const nullRecord = Object.assign(Object.create(null), { "__proto__": "literal", "名": shared })
  Object.defineProperty(nullRecord, "__proto__", { value: { retained: true }, enumerable: true })
  let deep: unknown = { leaf: "end" }
  for (let index = 0; index < 10000; index++) deep = { next: deep }
  const extended = freeze({ mode: "deny", on: false, channels: [], first: shared, second: shared, nullRecord, deep, ["__proto__"]: { own: true } })
  const extendedResult = raw({ kind: "filter", data: extended })
  equal(extendedResult, { kind: "prepared", data: extended }, "4 deep extensions and repeated aliases")
  check(extendedResult.kind === "prepared", "extended prepared")
  equal(raw({ kind: "filter", data: extendedResult.data }), extendedResult, "repeated filter preparation")
  if (settingsResult.kind === "prepared") equal(raw({ kind: "settings", data: settingsResult.data }), settingsResult, "repeated settings preparation")
  equal(raw({ kind: "setup", data: expectedSetup, context }), { kind: "prepared", data: expectedSetup }, "repeated setup preparation")

  let getterReads = 0
  const accessor = Object.defineProperty({}, "bad", { enumerable: true, get() { getterReads++; return 1 } })
  const setter = Object.defineProperty({}, "bad", { enumerable: true, set(_value) { getterReads++ } })
  const cycle: { self?: unknown } = {}; cycle.self = cycle
  const hidden = Object.defineProperty({}, "bad", { value: 1 })
  const symbol = { [Symbol("bad")]: 1 }
  const unknowns = [undefined, { char: undefined }, accessor, setter, hidden, symbol, { toJSON() { getterReads++; return 1 } }, 1n, NaN, Infinity, -Infinity, cycle, new Map(), Object.create({ inherited: true }), [, 1]]
  for (const extension of unknowns) equal(raw({ kind: "filter", data: freeze({ mode: "deny", on: false, channels: [], extension }) }), jsonInvalid, "5 unknown representation refusal")
  const badRows: unknown[][] = [ [id, "future", null, undefined], [id, "hole", null, , "tail"], [, "required"], [id, , "handle"] ]
  const extra: [string, string] = [id, "extra"]
  Object.defineProperty(extra, "extra", { value: undefined, enumerable: true })
  badRows.push(extra)
  for (const row of badRows) equal(raw({ kind: "filter", data: freeze({ mode: "deny", on: false, channels: [row] }) }), jsonInvalid, "bad row refuses")
  equal(raw({ kind: "filter", data: freeze({ mode: "deny", on: false, channels: new Array(1) }) }), jsonInvalid, "sparse outer list")
  const alias = { ...plainKey, char: undefined }
  equal(raw({ kind: "settings", data: freeze({ ...settings(), undoKey: alias, alias }) }), jsonInvalid, "known and unknown alias stays invalid")
  const futureMusic = settings()
  Object.assign(futureMusic.musicKeys.keys, { unknown: { ...plainKey, char: undefined } })
  equal(raw({ kind: "settings", data: freeze(futureMusic) }), jsonInvalid, "unknown music action stays opaque")

  const locations = [
    (s: ReturnType<typeof settings>) => s,
    (s: ReturnType<typeof settings>) => s.undoKey,
    (s: ReturnType<typeof settings>) => s.shortcuts,
    (s: ReturnType<typeof settings>) => s.shortcuts.picker,
    (s: ReturnType<typeof settings>) => s.shortcuts.list,
    (s: ReturnType<typeof settings>) => s.shortcuts.list[0]!,
    (s: ReturnType<typeof settings>) => s.shortcuts.list[0]!.key!,
    (s: ReturnType<typeof settings>) => s.musicKeys,
    (s: ReturnType<typeof settings>) => s.musicKeys.keys,
    (s: ReturnType<typeof settings>) => s.musicKeys.keys.artist
  ]
  for (const [location, locate] of locations.entries()) {
    for (const invalid of ["undefined", "hidden", "symbol", "getter", "setter", "prototype"]) {
      const data = settings(); const container = locate(data)
      if (invalid === "symbol") Object.defineProperty(container, Symbol("bad"), { value: 1, enumerable: true })
      else if (invalid === "prototype") Object.setPrototypeOf(container, { unsupported: true })
      else Object.defineProperty(container, "bad", invalid === "getter" ? { enumerable: true, get() { getterReads++; return 1 } } : invalid === "setter" ? { enumerable: true, set(_value) { getterReads++ } } : { value: invalid === "undefined" ? undefined : 1, enumerable: invalid !== "hidden" })
      equal(raw({ kind: "settings", data: freeze(data) }), invalid === "prototype" && location === 0 ? shapeInvalid : jsonInvalid, "copied settings container cannot launder " + invalid)
    }
  }
  for (const locate of [(s: { label: object; autoAdd: object[] }) => s.label, (s: { label: object; autoAdd: object[] }) => s.autoAdd, (s: { label: object; autoAdd: object[] }) => s.autoAdd[0]!]) {
    const data = { ...setupInput, label: { name: "A", handle: undefined }, autoAdd: [{ pl: "PL_A", takes: "videos", pct: undefined }] }
    Object.defineProperty(locate(data), "bad", { value: undefined, enumerable: true })
    equal(raw({ kind: "setup", data: freeze(data), context }), jsonInvalid, "copied setup container cannot launder extras")
  }
  const badChannels = [[id, "x", undefined]]
  Object.defineProperty(badChannels, "bad", { value: undefined, enumerable: true })
  equal(raw({ kind: "filter", data: freeze({ mode: "deny", on: false, channels: badChannels }) }), jsonInvalid, "copied channels extras")
  equal(raw({ kind: "settings", data: freeze({ ...settings(), undoKey: Object.defineProperty({ ...plainKey }, "char", { enumerable: true, get() { getterReads++; return undefined } }) }) }), jsonInvalid, "optional getter not omitted")
  for (const property of ["2", "extra"]) {
    const row: unknown[] = [id, "accessor", undefined, "tail"]
    Object.defineProperty(row, property, { enumerable: true, get() { getterReads++; return undefined } })
    equal(raw({ kind: "filter", data: freeze({ mode: "deny", on: false, channels: [row] }) }), jsonInvalid, "row getter never read")
  }
  for (const invalid of ["hidden", "symbol", "prototype"]) {
    const row = [id, "invalid array"]
    if (invalid === "prototype") Object.setPrototypeOf(row, Object.create(Array.prototype))
    else Object.defineProperty(row, invalid === "symbol" ? Symbol("bad") : "extra", { value: 1, enumerable: invalid !== "hidden" })
    equal(raw({ kind: "filter", data: freeze({ mode: "deny", on: false, channels: [row] }) }), jsonInvalid, "row invalid descriptor or prototype")
  }
  check(getterReads === 0, "own getters and setters never invoked")

  for (const data of [null, undefined, 1, "body", [], true, new Map(), Object.create({ unsupported: true })]) equal(raw({ kind: "filter", data }), shapeInvalid, "6 root shape")
  for (const data of [{ mode: "other", on: false, channels: [] }, { mode: "deny", on: false, channels: [["invalid", "x"]] }]) equal(raw({ kind: "filter", data: freeze(data) }), shapeInvalid, "filter semantic refusal")
  for (const pct of [null, -1, 101, 12.5]) equal(raw({ kind: "setup", data: freeze({ ...setupInput, autoAdd: [{ pl: "PL_A", takes: "videos", pct }] }), context }), shapeInvalid, "percentage semantic refusal")
  for (const pct of [NaN, Infinity]) equal(raw({ kind: "setup", data: freeze({ ...setupInput, autoAdd: [{ pl: "PL_A", takes: "videos", pct }] }), context }), jsonInvalid, "percentage representation refusal")
  equal(raw({ kind: "setup", data: freeze({ ...setupInput, autoAdd: [{ pl: "PL_A", takes: "invalid" }] }), context }), shapeInvalid, "takes decoder")
  equal(raw({ kind: "settings", data: freeze({ ...settings(), undoKey: { ...plainKey, code: "bogus" } }) }), shapeInvalid, "physical key decoder")
  equal(raw({ kind: "settings", data: freeze({ ...settings(), undoKey: { ...plainKey, char: null } }) }), shapeInvalid, "null char")
  for (const field of ["handle", "avatar"]) equal(raw({ kind: "setup", data: freeze({ ...setupInput, label: { name: "A", [field]: null } }), context }), shapeInvalid, "null label optional")
  const duplicate = settings(); duplicate.shortcuts.list[1]!.id = "save01"
  equal(raw({ kind: "settings", data: freeze(duplicate) }), shapeInvalid, "duplicate shortcut decoder")
  let programmerError = false
  try { raw({ kind: "setup", data: setupInput, context: { shortcutIds: { has() { throw new Error("programmer") } }, additionalChosenPlaylists: new Set() } }) } catch (error) { programmerError = error instanceof Error && error.message === "programmer" }
  check(programmerError, "programmer error propagates")

  function differs(actual: unknown, expected: unknown, label: string) {
    let failed = false
    try { equal(actual, expected, label) } catch { failed = true }
    check(failed, "broken control survived " + label)
    controls.push(label)
  }
  const futureDecoded = dependencies.decodeFilter({ mode: "deny", on: true, channels: [[id, "future", null, { future: true }, "tail"]], extension: "kept" })
  const expectedFuture = { mode: "deny", on: true, channels: [[id, "future", null, { future: true }, "tail"]], extension: "kept" }
  differs({ kind: "prepared", data: dependencies.normalizeFilterForWrite(futureDecoded) }, { kind: "prepared", data: expectedFuture }, "no bridge")
  differs({ ...expectedFuture, channels: [[id, "future", { future: true }, "tail"]] }, expectedFuture, "shifted tuple columns")
  differs({ mode: "deny", on: true, channels: expectedFuture.channels }, expectedFuture, "known-field whitelist")
  const invalidBody = { mode: "deny", on: false, channels: [], extension: { char: undefined } }
  differs(raw({ kind: "filter", data: JSON.parse(JSON.stringify(invalidBody, (_key, value) => value === undefined ? null : value)) }), jsonInvalid, "broad undefined conversion")
  differs(raw({ kind: "filter", data: JSON.parse(JSON.stringify(invalidBody)) }), jsonInvalid, "broad undefined omission")
  differs(raw({ kind: "filter", data: dependencies.normalizeFilterForWrite({ mode: "deny", on: false, channels: [extra] }) }), jsonInvalid, "normalize-first laundering")
  differs(raw({ kind: "setup", data: setupInput, context: { shortcutIds: new Set(), additionalChosenPlaylists: new Set() } }), { kind: "prepared", data: expectedSetup }, "empty context")
  function recursive(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, recursive(child)]))
  }
  let overflow = false
  try { recursive(deep) } catch (error) { overflow = error instanceof RangeError }
  if (poison) { check(overflow, "deep recursive copier control must fail"); controls.push("deep recursive copier") }

  let hookProbes = 0
  if (poison) {
    const execute = () => [raw({ kind: "settings", data: settingsInput }), raw({ kind: "setup", data: setupInput, context }), raw({ kind: "filter", data: filterInput })]
    const baseline = execute()
    const acct = "synthetic_acct01", playlist = "PL_A"
    check(dependencies.isAccountKey(acct) && dependencies.isPlaylistId(playlist), "synthetic transport brands")
    const keys: model.DocumentKey[] = [{ kind: "settings" }, { kind: "setup", acct }, { kind: "filter", acct, playlist }]
    function transport(bodies: ReturnType<typeof execute>) {
      return bodies.map((body, index) => {
        check(body.kind === "prepared", "prepared hook transport")
        return dependencies.encodeSyncDocument({ key: keys[index]!, document: { v: 1, gen: "g", at: 1, by: "b", data: body.data, envelopeExtension: "kept" } })
      })
    }
    const baselineTransport = transport(baseline)
    for (const prototype of [Object.prototype, Array.prototype]) {
      for (const getter of [false, true]) {
        for (const throwing of [false, true]) {
          let reads = 0, calls = 0, native = 0
          const hook = () => { calls++; if (throwing) throw new Error("native hook"); return "tiny" }
          Object.defineProperty(prototype, "toJSON", { configurable: true, enumerable: false, ...(getter ? { get() { reads++; if (throwing) throw new Error("native getter"); return hook } } : { value: hook }) })
          let actual: unknown, actualTransport: unknown
          try {
            actual = execute()
            check(reads === 0 && calls === 0, "7 inherited hooks untouched")
            const prepared = execute()
            const transported = transport(prepared)
            actualTransport = transported
            for (const encoded of transported) check(encoded.kind === "encoded" && encoded.encoded.mode === "single", "hook-safe transport decision")
            check(reads === 0 && calls === 0, "transport hooks untouched")
            try { JSON.stringify(prototype === Array.prototype ? filterInput.channels : setupInput) } catch {}
            native = reads + calls
          } finally { delete (prototype as { toJSON?: unknown }).toJSON }
          equal(actual, baseline, "hook outputs equal")
          equal(actualTransport, baselineTransport, "hook transport equal")
          check(native > 0, "native serialization control invokes hook")
          hookProbes++
        }
      }
    }
    let reads = 0
    Object.defineProperty(Object.prototype, "toJSON", { configurable: true, enumerable: true, get() { reads++; throw new Error("enumerable hook") } })
    try { for (const result of execute()) equal(result, shapeInvalid, "enumerable prototype refuses before model") } finally { delete (Object.prototype as { toJSON?: unknown }).toJSON }
    check(reads === 0, "enumerable inherited getter untouched")
    controls.push("native JSON hook invocation")
  }
  return { assertions, controls, hookProbes }
}

function integrationSuite(prepare: typeof prepareDocumentBody, dependencies: Dependencies) {
  function freeze<T>(value: T): T {
    const pending: unknown[] = [value]
    const visited = new Set<object>()
    while (pending.length) {
      const next = pending.pop()
      if (next === null || typeof next !== "object" || visited.has(next)) continue
      visited.add(next)
      if (next instanceof Set && !Object.isFrozen(next)) {
        for (const method of ["add", "delete", "clear"]) Object.defineProperty(next, method, { value() { throw new Error("Set mutation") } })
      }
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(next))) if ("value" in descriptor) pending.push(descriptor.value)
      Object.freeze(next)
    }
    return value
  }
  const { decodeFilter, decodeSetup, defaultSettings, changeAccountChoice, encodeSyncDocument, readSyncDocument, isAccountKey, isPlaylistId } = dependencies
  const acct = "synthetic_acct01", playlist = "PL_A"
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw new Error("Invalid synthetic brands")
  const channel = "UCaaaaaaaaaaaaaaaaaaaaaa"
  const settings = defaultSettings()
  settings.shortcuts.list = [
    { id: "save01", key: null, label: "Save", watchLaterOnEveryAccount: true },
    { id: "wl0001", key: null, label: "Later", watchLaterOnEveryAccount: true }
  ]
  const oldFilter = { v: 1, gen: "old", at: 1, by: "b", data: { mode: "deny", on: true, channels: [[channel, "🙂".repeat(101), null, { future: ["é", null] }, "tail"]], extension: "body" }, envelopeExtension: { "名": "e\u0301\ud800" } }
  const filter = decodeFilter(oldFilter.data)
  const setup = decodeSetup({ autoAdd: [{ pl: playlist, takes: "videos" }], targets: { save01: "PL_T" }, marks: { WL: "missing", PL_A: "full" } })
  freeze([settings, oldFilter, setup, filter])
  const result = changeAccountChoice(freeze({ acct, current: { kind: "present", bodies: { setup, filters: { PL_A: filter } } }, settings, additionalChosenPlaylists: new Set(["WL"].filter(isPlaylistId)), choice: { kind: "auto-add", playlist, chosen: false } }))
  if (result.kind !== "save") throw new Error("Expected account save")
  freeze(result)
  const preparedSetup = prepare(freeze({ kind: "setup", data: result.bodies.setup, context: { shortcutIds: new Set(settings.shortcuts.list.map(row => row.id)), additionalChosenPlaylists: new Set(["WL"]) } }))
  const key = { kind: "filter", acct, playlist } as const
  const before = encodeSyncDocument({ key, document: { ...oldFilter, data: result.bodies.filters.PL_A } })
  const changedFilter = freeze({ ...result.bodies.filters.PL_A!, on: false })
  const preparedFilter = prepare(freeze({ kind: "filter", data: changedFilter }))
  if (preparedSetup.kind !== "prepared" || preparedFilter.kind !== "prepared") throw new Error("Expected preparation")
  const envelope = { ...oldFilter, gen: "new", at: 2, data: preparedFilter.data }
  const reads = []
  for (const padding of ["", "🙂é\\\n".repeat(4000)]) {
    const document = { ...envelope, padding }
    const encoded = encodeSyncDocument({ key, document })
    if (encoded.kind !== "encoded") throw new Error("Encoding refused")
    const read = readSyncDocument({ key, items: [...encoded.encoded.items].reverse() })
    reads.push({ mode: encoded.encoded.mode, read })
  }
  const invalidEnvelope = encodeSyncDocument({ key, document: { ...envelope, unknown: undefined } })
  const oldSetup = { v: 1, gen: "s", at: 1, by: "b", data: setup, envelopeExtension: "setup" }
  const consumer = { setup: { ...oldSetup, data: preparedSetup.data }, kept: oldFilter }
  const compact = { v: envelope.v, gen: envelope.gen, at: envelope.at, by: envelope.by, data: envelope.data }
  const compactEncoded = encodeSyncDocument({ key, document: compact })
  if (compactEncoded.kind !== "encoded") throw new Error("Compact control refused")
  const compactRead = readSyncDocument({ key, items: compactEncoded.encoded.items })
  return { before, preparedFilter, preparedSetup, reads, invalidEnvelope, consumer, envelope, compact, compactRead, keptDecoded: result.bodies.filters.PL_A }
}

describe("canonical document body preparation", () => {
  test("the eight fixture groups use literal bodies and reject unsafe alternatives", () => {
    const result = fixtureSuite(prepareDocumentBody, { ...model, ...wire, ...accounts })
    expect(result.assertions).toBeGreaterThan(500)
    expect(result.controls).toHaveLength(7)
  })
  test("synthetic account consumer preserves envelopes and prepares only changed bodies", () => {
    assertIntegration(integrationSuite(prepareDocumentBody, { ...model, ...wire, ...accounts }))
  })
})

function assertIntegration(result: ReturnType<typeof integrationSuite>) {
  expect(result.before).toEqual({ kind: "invalid", field: "document", reason: "json" })
  expect(result.preparedFilter).toEqual({ kind: "prepared", data: { mode: "deny", on: false, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "🙂".repeat(100), null, { future: ["é", null] }, "tail"]], extension: "body" } })
  expect(result.preparedSetup).toEqual({ kind: "prepared", data: { label: null, autoAdd: [], targets: { save01: "PL_T" }, quickSave: null, musicSave: null, gather: null, marks: { WL: "missing" } } })
  expect(result.reads.map(value => value.mode)).toEqual(["single", "chunked"])
  for (const [index, { read }] of result.reads.entries()) {
    expect(read.kind).toBe("value")
    if (read.kind !== "value") throw new Error("Expected complete read")
    expect(read.json).toEqual({ ...result.envelope, padding: index === 0 ? "" : "🙂é\\\n".repeat(4000) })
    expect(read.json.envelopeExtension).toEqual({ "名": "e\u0301\ud800" })
    expect(read.json.data).toEqual(result.preparedFilter.kind === "prepared" ? result.preparedFilter.data : null)
  }
  expect(result.invalidEnvelope).toEqual({ kind: "invalid", field: "document", reason: "json" })
  expect(result.consumer.setup.envelopeExtension).toBe("setup")
  expect(result.consumer.kept).toEqual({ v: 1, gen: "old", at: 1, by: "b", data: { mode: "deny", on: true, channels: [["UCaaaaaaaaaaaaaaaaaaaaaa", "🙂".repeat(101), null, { future: ["é", null] }, "tail"]], extension: "body" }, envelopeExtension: { "名": "e\u0301\ud800" } })
  expect(result.keptDecoded!.channels[0]![1]).toBe("🙂".repeat(101))
  expect(result.compact).not.toEqual(result.envelope)
  expect(Object.hasOwn(result.compact, "envelopeExtension")).toBe(false)
  expect(result.compactRead.kind).toBe("value")
  if (result.compactRead.kind !== "value") throw new Error("Expected compact control read")
  expect(result.compactRead.json.envelopeExtension).toBeUndefined()
  expect(result.compactRead.json).not.toEqual(result.envelope)
  expect(isJsonValue(result.envelope)).toBe(true)
}

const ambientGuards = `
  let forbiddenReads = 0;
  const fail = () => { forbiddenReads++; throw Error("Forbidden ambient effect"); };
  for (const name of ["browser","chrome","window","document","navigator","indexedDB","localStorage","sessionStorage","fetch","XMLHttpRequest","WebSocket","EventSource","Date","performance","crypto","process","Bun","Deno","setTimeout","setInterval","clearTimeout","clearInterval","queueMicrotask","requestAnimationFrame","cancelAnimationFrame"]) Object.defineProperty(globalThis,name,{get:fail});
  Object.defineProperty(Math,"random",{get:fail});
`

describe("actual browser artifact", () => {
  test("every variant and defect control executes on fresh guarded minified bytes", async () => {
    const entrypoint = resolve(import.meta.dir, "write-preparation.ts")
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
    const program = ts.createProgram([...visited], { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] })
    const checker = program.getTypeChecker()
    const forbidden = new Set(["Date", "performance", "crypto", "process", "Bun", "Deno", "browser", "chrome", "window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest", "setTimeout", "setInterval", "queueMicrotask"])
    for (const file of visited) {
      const source = program.getSourceFile(file)!
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
    async function artifact(path: string) {
      const build = await Bun.build({ entrypoints: [path], target: "browser", format: "cjs", minify: true })
      expect(build.success).toBe(true)
      expect(build.outputs).toHaveLength(1)
      const text = await build.outputs[0]!.text()
      expect(text.length).toBeGreaterThan(0)
      return text
    }
    const bytes = await artifact(entrypoint)
    const dependencies = await Promise.all(["../../shared/model/index.ts", "./accounts.ts", "./sync-codec.ts"].map(path => artifact(resolve(import.meta.dir, path))))
    const script = `
      const dependencyExports = {};
      ${dependencies.map(text => `Object.assign(dependencyExports, (() => { const module = {exports:{}}; ${text}; return module.exports; })());`).join("\n")}
      ${ambientGuards}
      const preparation = (() => { const module = {exports:{}}; ${bytes}; return module.exports; })();
      const fixtures = (${fixtureSuite.toString()})(preparation.prepareDocumentBody, dependencyExports, true);
      const integration = (${integrationSuite.toString()})(preparation.prepareDocumentBody, dependencyExports);
      if (forbiddenReads !== 0) throw Error("Ambient reads during preparation");
      const protectedReads = forbiddenReads;
      let guardControls = 0;
      for (const access of [() => process.env, () => Math.random, () => browser.storage, () => Date.now(), () => fetch]) { try { access(); } catch { guardControls++; } }
      JSON.stringify({exports:Object.keys(preparation),fixtures,integration,guardControls,protectedReads,forbiddenReads});
    `
    const result = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs"; import {runInNewContext} from "node:vm"; console.log(runInNewContext(readFileSync(0,"utf8"), {TextEncoder}, {timeout:30000}));'], { input: script, encoding: "utf8", timeout: 35000 }))
    expect(result.exports).toEqual(["prepareDocumentBody"])
    expect(result.fixtures.controls).toHaveLength(9)
    expect(result.fixtures.hookProbes).toBe(8)
    expect(result.guardControls).toBe(5)
    expect(result.protectedReads).toBe(0)
    expect(result.forbiddenReads).toBeGreaterThanOrEqual(5)
    assertIntegration(result.integration)
  })
})
