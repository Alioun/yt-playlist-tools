import { expect, test } from "bun:test"
import { readSettingsView } from "./settings-view"

export function settingsViewAcceptance(read: typeof readSettingsView) {
  let checks = 0
  const observations: unknown[] = []
  function equal(actual: unknown, expected: unknown, label: string) {
    checks++
    function same(a: unknown, b: unknown): boolean {
      if (Object.is(a, b)) return true
      if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
      const keys = Reflect.ownKeys(a)
      return keys.length === Reflect.ownKeys(b).length && keys.every(key => Object.hasOwn(b, key) && same(Object.getOwnPropertyDescriptor(a, key)?.value, Object.getOwnPropertyDescriptor(b, key)?.value))
    }
    if (!same(actual, expected)) throw Error(label)
  }
  const defaults = {
    theme: "system", undoKey: { char: "u", code: "KeyU", ctrl: false, alt: true, shift: false, meta: false },
    autoAdd: { on: false, feedback: true, pct: 50, toolbarTick: true, toolbarPaused: true },
    shortcuts: { on: false, feedback: true, music: true, preset: false, picker: null, list: [] },
    quickSave: { on: false, feedback: true, shortsShelves: false }, queueButton: { on: false, feedback: true },
    watchButton: { on: false, feedback: true, shorts: false }, cardMenu: { on: false, keepLinkMenu: false },
    browserMenu: { on: false, feedback: true }, musicSection: true,
    musicActions: { on: false, feedback: true, preset: false, buttons: { next: true, queue: true, save: false, like: false, remove: false, bar: false, library: false, mix: false, album: false, artist: false } },
    musicKeys: { on: false, feedback: true, preset: false, keys: { next: null, queue: null, save: null, picker: null, like: null, remove: null, library: null, mix: null, album: null, artist: null } },
    anyTabKeys: { on: false, feedback: true }, gather: { on: false, feedback: true, to: "player", order: "newest", close: false, auto: { unvisited: false, after: "1d", background: false, count: false, n: 10 } }
  }
  const stamp = { v: 1, gen: "old", at: 1, by: "fixture" }
  for (const raw of [undefined, null, { ...stamp, deleted: true, extension: { keep: [1] } }]) {
    const value = read(raw)
    equal(value, { kind: "value", settings: defaults }, "null absent and tombstone read defaults")
    if (value.kind !== "value") throw Error("value expected")
    Object.defineProperty(value.settings.autoAdd, "pct", { value: 99, enumerable: true })
    equal(read(raw), { kind: "value", settings: defaults }, "default reads are detached")
    observations.push(read(raw))
  }
  for (const pct of [0, 100]) {
    const raw = { ...stamp, data: { autoAdd: { pct } } }
    const before = JSON.stringify(raw)
    equal(read(raw), { kind: "value", settings: { ...defaults, autoAdd: { ...defaults.autoAdd, pct } } }, "partial percentages retain zero and hundred")
    equal(JSON.stringify(raw), before, "partial read preserves omissions")
  }
  for (const raw of [0, false, [], {}, { ...stamp, data: null }, { ...stamp, data: { theme: "blue" } }, { ...stamp, data: { autoAdd: { pct: 101 } } }, { ...stamp, deleted: false }, { ...stamp, data: { unknown: undefined } }]) equal(read(raw), { kind: "invalid" }, "malformed present values remain invalid")
  equal(read({ ...stamp, v: 2, data: { theme: "blue" } }), { kind: "newer-version", version: 2 }, "newer body is not decoded or defaulted")
  let bodyReads = 0
  const future = { ...stamp, v: 2 }
  Object.defineProperty(future, "data", { enumerable: true, get() { bodyReads++; throw Error("newer body read") } })
  equal(read(future), { kind: "newer-version", version: 2 }, "newer projection does not inspect body getters")
  equal(bodyReads, 0, "newer body stays opaque")
  const raw = { ...stamp, envelopeFuture: { keep: [1, { value: true }] }, data: { theme: "light", future: { nested: ["keep", { pct: 0 }] },
    shortcuts: { list: [{ id: "orig01", key: { code: "KeyK", ctrl: false, alt: true, shift: false, meta: false, future: { keep: [0] } }, label: "  Untouched  ", watchLaterOnEveryAccount: true, future: { row: [1] } }] } } }
  const original = JSON.stringify(raw)
  const first = read(raw), second = read(raw)
  if (first.kind !== "value" || second.kind !== "value") throw Error("detached value expected")
  equal(first, second, "complete snapshots equal")
  const unknown = Object.getOwnPropertyDescriptor(first.settings, "future")?.value
  unknown.nested[1].pct = 100
  Object.defineProperty(first.settings.shortcuts.list[0], "label", { value: "changed", enumerable: true })
  Object.getOwnPropertyDescriptor(first.settings.shortcuts.list[0]?.key, "future")?.value.keep.push(2)
  equal(read(raw), second, "unknown nested and row snapshots are detached")
  equal(JSON.stringify(raw), original, "runtime consumer cannot mutate raw data")
  equal(second.settings.shortcuts.list[0]?.label, "  Untouched  ", "reading never trims labels")
  observations.push({ raw, view: second })
  return { checks, observations }
}

test("Settings projection keeps absence, partial, newer and invalid distinct without aliases", () => {
  expect(settingsViewAcceptance(readSettingsView).checks).toBeGreaterThan(20)
})
