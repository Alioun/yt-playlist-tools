import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { decodeSettings, documentKey } from "../../shared/model"
import { isJsonValue } from "../../shared/contracts/json"
import { prepareDocumentBody } from "./write-preparation"
import { encodeSyncDocument, readSyncDocument } from "./sync-codec"
import { changeSharedSetting, type SharedSettingChange } from "./settings-edit"
import { cases as optionCases, initial as optionInitial } from "../../../tools/fixtures/shared-options/specimens"

type Dependencies = {
  decodeSettings: typeof decodeSettings
  documentKey: typeof documentKey
  isJsonValue: typeof isJsonValue
  prepareDocumentBody: typeof prepareDocumentBody
  encodeSyncDocument: typeof encodeSyncDocument
  readSyncDocument: typeof readSyncDocument
}

test.each(optionCases)("ordinary option $name changes exactly its independent Settings body", specimen => {
  const raw = optionInitial["doc:settings"]
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw Error("Missing finite settings specimen")
  const current = decodeSettings(raw.data), before = structuredClone(current)
  const result = changeSharedSetting({ current, change: specimen.change })
  expect(result).toEqual({ kind: "changed", settings: specimen.expectedSettings })
  expect(current).toEqual(before)
  if (result.kind !== "changed") throw Error("Expected an ordinary option candidate")
  expect(changeSharedSetting({ current: result.settings, change: specimen.change })).toEqual({ kind: "unchanged" })
})

function fixtureSuite(change: typeof changeSharedSetting, dependencies: Dependencies) {
  function check(value: unknown, label: string): asserts value {
    if (!value) throw new Error(label)
  }
  function equal(actual: unknown, expected: unknown, label: string): void {
    if (Object.is(actual, expected)) return
    check(actual !== null && expected !== null && typeof actual === "object" && typeof expected === "object", label)
    check(Array.isArray(actual) === Array.isArray(expected), label)
    const keys = Reflect.ownKeys(expected)
    check(Reflect.ownKeys(actual).length === keys.length, label)
    for (const key of keys) {
      const a = Object.getOwnPropertyDescriptor(actual, key)
      const b = Object.getOwnPropertyDescriptor(expected, key)
      check(a && b && "value" in a && "value" in b, label)
      equal(a.value, b.value, label)
    }
  }
  function freeze<T>(value: T): T {
    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor && "value" in descriptor) freeze(descriptor.value)
      }
      Object.freeze(value)
    }
    return value
  }
  const key = { code: "KeyS", ctrl: false, alt: true, shift: false, meta: false, keyFuture: { keep: [1, null] } }
  const source = {
    theme: "system", undoKey: { ...key, char: "u" },
    autoAdd: { on: true, feedback: false, pct: 25, toolbarTick: false, toolbarPaused: true, autoFuture: ["keep", { pct: 0 }] },
    shortcuts: {
      on: true, feedback: false, music: true, preset: true, picker: null,
      list: [
        { id: "orig01", key: { ...key }, label: "  " + "🙂".repeat(41) + "  ", watchLaterOnEveryAccount: true, rowFuture: { tuple: ["keep", 0, false] } },
        { id: "save02", key: null, label: "  Other  ", watchLaterOnEveryAccount: false, rowFuture: "second" }
      ], sectionFuture: { preset: "opaque" }
    },
    quickSave: { on: false, feedback: true, shortsShelves: true },
    queueButton: { on: true, feedback: false }, watchButton: { on: false, feedback: true, shorts: true },
    cardMenu: { on: true, keepLinkMenu: true }, browserMenu: { on: false, feedback: false }, musicSection: false,
    musicActions: { on: true, feedback: false, preset: true, buttons: { next: true, queue: false, save: true, like: false, remove: true, bar: false, library: true, mix: false, album: true, artist: false } },
    musicKeys: { on: false, feedback: true, preset: true, keys: { next: null, queue: null, save: null, picker: null, like: null, remove: null, library: null, mix: null, album: null, artist: null } },
    anyTabKeys: { on: true, feedback: false },
    gather: { on: true, feedback: false, to: "playlist", order: "left-to-right", close: true, auto: { unvisited: true, after: "1w", background: false, count: true, n: 30 } },
    rootFuture: { nested: ["名🙂", { keep: true, zero: 0 }] }, toJSON: "inert"
  }
  const normalized = {
    ...source,
    shortcuts: { ...source.shortcuts, list: [
      { ...source.shortcuts.list[0], id: "orig01", key: { ...key }, label: "🙂".repeat(40), watchLaterOnEveryAccount: true, rowFuture: { tuple: ["keep", 0, false] } },
      { id: "save02", key: null, label: "Other", watchLaterOnEveryAccount: false, rowFuture: "second" }
    ] }
  }
  const input = freeze(dependencies.decodeSettings(source))
  const others = freeze({
    device: { id: "fixture-device", syncOn: false, consent: null },
    setup: { label: null, autoAdd: [{ pl: "PL_SYNTHETIC", takes: "both", pct: 0 }], targets: { orig01: "PL_SYNTHETIC" }, quickSave: null, musicSave: null, gather: null, marks: {} },
    unclaimed: { originalShortcutId: "orig01", shortcutPlaylist: "PL_SYNTHETIC" }
  })
  function matrix(operation: typeof change) {
    const observations: unknown[] = []
    function run(current: typeof input, desired: SharedSettingChange, expected: unknown, label: string) {
      const result = operation(freeze({ current, change: desired }))
      equal(result, expected, label)
      observations.push(result)
      if (result.kind === "changed") {
        const repeated = operation(freeze({ current: result.settings, change: desired }))
        equal(repeated, { kind: "unchanged" }, `${label} repeat`)
        observations.push(repeated)
      }
      return result
    }
    const dark = run(input, { kind: "theme", value: "dark" }, { kind: "changed", settings: { ...normalized, theme: "dark" } }, "system to dark")
    check(dark.kind === "changed", "dark candidate")
    run(dark.settings, { kind: "theme", value: "light" }, { kind: "changed", settings: { ...normalized, theme: "light" } }, "dark to light")
    run(input, { kind: "theme", value: "system" }, { kind: "unchanged" }, "unnormalized theme no-op")
    run(input, { kind: "default-percentage", value: 25 }, { kind: "unchanged" }, "unnormalized percentage no-op")
    for (const pct of [0, 50, 100]) {
      run(input, { kind: "default-percentage", value: pct }, { kind: "changed", settings: { ...normalized, autoAdd: { ...normalized.autoAdd, pct } } }, `percentage ${pct}`)
    }
    for (const value of [-1, 101, 0.5, 99.5, NaN, Infinity, -Infinity]) {
      run(input, { kind: "default-percentage", value }, { kind: "invalid", reason: "invalid-percentage" }, `invalid percentage ${value}`)
    }
    equal(input, source, "entire current body unchanged")
    observations.push(input, others)
    return observations
  }
  const observations = matrix(change)
  const alternatives: [string, typeof change][] = [
    ["no-op candidate", input => {
      const result = change(input)
      return result.kind === "unchanged" ? { kind: "changed", settings: dependencies.decodeSettings(input.current) } : result
    }],
    ["clamped percentage", input => change(input.change.kind === "default-percentage" ? { ...input, change: { kind: "default-percentage", value: Math.max(0, Math.min(100, Math.round(input.change.value))) } } : input)],
    ["zero replaced", input => change(input.change.kind === "default-percentage" && input.change.value === 0 ? { ...input, change: { kind: "default-percentage", value: 50 } } : input)],
    ["unknown root lost", input => {
      const result = change(input)
      if (result.kind === "changed") Reflect.deleteProperty(result.settings, "rootFuture")
      return result
    }],
    ["unknown autoAdd lost", input => {
      const result = change(input)
      if (result.kind === "changed") Reflect.deleteProperty(result.settings.autoAdd, "autoFuture")
      return result
    }],
    ["shortcut identity replaced", input => {
      const result = change(input)
      if (result.kind === "changed") result.settings.shortcuts.list[0]!.id = "new001"
      return result
    }],
    ["unknown key lost", input => {
      const result = change(input)
      if (result.kind === "changed") Reflect.deleteProperty(result.settings.shortcuts.list[0]!.key!, "keyFuture")
      return result
    }],
    ["normalization skipped", input => {
      const result = change(input)
      return result.kind === "changed" ? { kind: "changed", settings: dependencies.decodeSettings({ ...result.settings, shortcuts: input.current.shortcuts }) } : result
    }],
    ["input mutated", input => {
      Object.defineProperty(input.current.autoAdd, "pct", { value: 50 })
      return change(input)
    }]
  ]
  const controls: string[] = []
  for (const [name, alternative] of alternatives) {
    let caught = false
    try { matrix(alternative) } catch { caught = true }
    check(caught, `defect control escaped ${name}`)
    controls.push(name)
  }
  let hookCalls = 0
  const hook = () => { hookCalls++; throw new Error("toJSON must not run") }
  const opaque = freeze(dependencies.decodeSettings({ ...source, rootFuture: { ...source.rootFuture, toJSON: hook } }))
  equal(change({ current: opaque, change: { kind: "theme", value: "system" } }), { kind: "unchanged" }, "opaque theme no-op")
  equal(change({ current: opaque, change: { kind: "default-percentage", value: 25 } }), { kind: "unchanged" }, "opaque percentage no-op")
  const opaqueChange = change({ current: opaque, change: { kind: "theme", value: "dark" } })
  check(opaqueChange.kind === "changed", "opaque candidate stays a domain body")
  equal(dependencies.prepareDocumentBody({ kind: "settings", data: opaqueChange.settings }), { kind: "invalid", reason: "json" }, "non-JSON extension refused at preparer")
  check(hookCalls === 0, "no serialization hook called")
  let unrelatedReads = 0
  const early = { ...input, get shortcuts(): typeof input.shortcuts { unrelatedReads++; throw new Error("unrelated body read") } }
  equal(change({ current: early, change: { kind: "theme", value: "system" } }), { kind: "unchanged" }, "theme returns before normalization")
  equal(change({ current: early, change: { kind: "default-percentage", value: 25 } }), { kind: "unchanged" }, "percentage returns before normalization")
  equal(change({ current: early, change: { kind: "default-percentage", value: NaN } }), { kind: "invalid", reason: "invalid-percentage" }, "invalid returns before normalization")
  check(unrelatedReads === 0, "no unrelated read on no-op or invalid input")
  let detectsNormalization = false
  try { change({ current: early, change: { kind: "theme", value: "dark" } }) } catch { detectsNormalization = true }
  check(detectsNormalization && unrelatedReads > 0, "unrelated read guard positive control")

  const changed = change({ current: input, change: { kind: "default-percentage", value: 0 } })
  check(changed.kind === "changed", "consumer changed body")
  changed.settings.shortcuts.list[0]!.key!.char = undefined
  const prepared = dependencies.prepareDocumentBody({ kind: "settings", data: changed.settings })
  const jsonBody = {
    ...normalized, autoAdd: { ...normalized.autoAdd, pct: 0 },
    shortcuts: { ...normalized.shortcuts, list: [
      { ...normalized.shortcuts.list[0], id: "orig01", key, label: "🙂".repeat(40), watchLaterOnEveryAccount: true, rowFuture: { tuple: ["keep", 0, false] } },
      { id: "save02", key: null, label: "Other", watchLaterOnEveryAccount: false, rowFuture: "second" }
    ] }
  }
  equal(prepared, { kind: "prepared", data: jsonBody }, "prepared complete JSON body and omitted optional char")
  check(prepared.kind === "prepared" && dependencies.isJsonValue(prepared.data), "strict JSON consumer body")
  const envelope = { v: 1, gen: "fixture-generation", at: 1234, by: "fixture-device", data: prepared.data }
  const encoded = dependencies.encodeSyncDocument({ key: { kind: "settings" }, document: envelope })
  equal(dependencies.documentKey({ kind: "settings" }), "doc:settings", "local settings address")
  equal(encoded, { kind: "encoded", encoded: { mode: "single", baseKey: "s:settings", gen: "fixture-generation", items: [{ key: "s:settings", value: envelope }] } }, "complete wire envelope")
  check(encoded.kind === "encoded", "consumer encoded")
  const read = dependencies.readSyncDocument({ key: { kind: "settings" }, items: encoded.encoded.items })
  equal(read, { kind: "value", value: { kind: "settings", document: { ...envelope, data: jsonBody } }, json: envelope }, "complete wire readback")
  equal(others, {
    device: { id: "fixture-device", syncOn: false, consent: null },
    setup: { label: null, autoAdd: [{ pl: "PL_SYNTHETIC", takes: "both", pct: 0 }], targets: { orig01: "PL_SYNTHETIC" }, quickSave: null, musicSave: null, gather: null, marks: {} },
    unclaimed: { originalShortcutId: "orig01", shortcutPlaylist: "PL_SYNTHETIC" }
  }, "other input domains unchanged")
  return { observations, prepared, encoded, read, controls, hookCalls, unrelatedReadPositiveControl: detectsNormalization }
}

const dependencies = { decodeSettings, documentKey, isJsonValue, prepareDocumentBody, encodeSyncDocument, readSyncDocument }

test("shared edits preserve complete frozen bodies, literal no-ops and real preparation/wire consumers", () => {
  const result = fixtureSuite(changeSharedSetting, dependencies)
  expect(result.controls).toHaveLength(9)
  expect(result.hookCalls).toBe(0)
})

test("minified browser module has the same complete observations in a guarded Node VM", async () => {
  async function artifact(entrypoint: string) {
    const result = await Bun.build({ entrypoints: [entrypoint], target: "browser", format: "cjs", minify: true })
    expect(result.success).toBe(true)
    expect(result.outputs).toHaveLength(1)
    return result.outputs[0]!.text()
  }
  const operation = await artifact(`${import.meta.dir}/settings-edit.ts`)
  const model = await artifact(`${import.meta.dir}/../../shared/model/index.ts`)
  const preparation = await artifact(`${import.meta.dir}/write-preparation.ts`)
  const codec = await artifact(`${import.meta.dir}/sync-codec.ts`)
  const json = await artifact(`${import.meta.dir}/../../shared/contracts/json.ts`)
  const script = `
    let protectedReads = 0;
    const violation = {};
    const guarded = ["browser","chrome","localStorage","sessionStorage","indexedDB","fetch","XMLHttpRequest","WebSocket","window","document","navigator","location","Date","performance","crypto","process","Bun","Deno","setTimeout","setInterval","setImmediate","clearTimeout","clearInterval","clearImmediate","queueMicrotask","requestAnimationFrame","cancelAnimationFrame","console","require"];
    for (const name of guarded) Object.defineProperty(globalThis,name,{get(){protectedReads++;throw violation}});
    Object.defineProperty(Math,"random",{get(){protectedReads++;throw violation}});
    const operation = (() => { const module = {exports:{}}; ${operation}; return module.exports; })();
    const model = (() => { const module = {exports:{}}; ${model}; return module.exports; })();
    const preparation = (() => { const module = {exports:{}}; ${preparation}; return module.exports; })();
    const codec = (() => { const module = {exports:{}}; ${codec}; return module.exports; })();
    const json = (() => { const module = {exports:{}}; ${json}; return module.exports; })();
    const observation = (${fixtureSuite.toString()})(operation.changeSharedSetting,{...model,...preparation,...codec,...json});
    if(protectedReads !== 0) throw Error("Ambient effect during fixtures");
    const beforeControls = protectedReads;
    let positiveControls=0;
    for (const name of guarded) { try {globalThis[name]} catch(error){if(error!==violation)throw error;positiveControls++} }
    try {Math.random} catch(error){if(error!==violation)throw error;positiveControls++}
    JSON.stringify({exports:Object.keys(operation),observation,beforeControls,protectedReads,positiveControls});
  `
  const result = JSON.parse(execFileSync("node", ["--input-type=module", "-e", 'import {readFileSync} from "node:fs"; import {runInNewContext} from "node:vm"; process.stdout.write(runInNewContext(readFileSync(0,"utf8"), {}, {timeout:30000}));'], { input: script, encoding: "utf8", timeout: 35000 }))
  expect(result.exports).toEqual(["changeSharedSetting"])
  expect(result.observation).toEqual(JSON.parse(JSON.stringify(fixtureSuite(changeSharedSetting, dependencies))))
  expect(result.positiveControls).toBe(30)
  expect(result.beforeControls).toBe(0)
  expect(result.protectedReads).toBeGreaterThanOrEqual(30)
})
