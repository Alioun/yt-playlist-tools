import { describe, expect, test } from "bun:test"
import { decodeKey, decodeSettings, defaultSettings, isKey, normalizeSettingsForWrite } from "../model"
import type { Key } from "../model"
import { assignKey, display, findConflicts, isReserved, keyMatches, keysOverlap, recorder, shortcutWarnings } from "./index"
import type { KeyFacts, Modifiers, Platform, RecorderContext, RecorderState } from "./index"

const bare: Modifiers = { ctrl: false, alt: false, shift: false, meta: false }
const platform: Platform = { browser: "chrome", os: "linux" }
const context: RecorderContext = { settings: { ...defaultSettings(), undoKey: null }, target: { kind: "picker" }, platform }
const recording: RecorderState = { kind: "recording", key: null, modifiers: bare, refusal: null }

function facts(key: string, code: string, held: Partial<Modifiers> = { alt: true }): KeyFacts {
  const mods = { ...bare, ...held }
  return { key, code, ctrlKey: mods.ctrl, altKey: mods.alt, shiftKey: mods.shift, metaKey: mods.meta, altGraph: false }
}

function recorded(event: KeyFacts): Key {
  const result = recorder(recording, { kind: "keydown", facts: event }, context)
  expect(result.consume).toBe(true)
  expect(result.outcome.kind).toBe("commit")
  if (result.outcome.kind !== "commit" || result.outcome.key === null) throw new Error("Expected a recorded key")
  return result.outcome.key
}

function freeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value)) freeze(child)
}

describe("review A1, layout overlap", () => {
  test.each([false, true])("recorded physical and character bindings conflict in either assignment order, reversed %s", reversed => {
    const physical = decodeKey(JSON.parse(JSON.stringify(recorded(facts("Dead", "KeyW")))))
    const character = decodeKey(JSON.parse(JSON.stringify(recorded(facts("w", "KeyZ")))))
    const switched = facts("w", "KeyW")
    expect(keyMatches(physical, switched)).toBe(true)
    expect(keyMatches(character, switched)).toBe(true)
    expect(keysOverlap(physical, character)).toBe(true)
    expect(keysOverlap(character, physical)).toBe(true)

    const existing = reversed ? character : physical
    const candidate = reversed ? physical : character
    const settings = { ...defaultSettings(), undoKey: null }
    settings.shortcuts.picker = existing
    const before = JSON.stringify(settings)
    freeze(settings)
    expect(findConflicts(settings, { kind: "music", action: "next" }, candidate)).toEqual([])
    expect(findConflicts(settings, { kind: "undo" }, candidate)).toEqual([{ target: { kind: "picker" }, sites: ["www"] }])
    expect(assignKey(settings, { kind: "undo" }, candidate).kind).toBe("conflict")
    const step = recorder(recording, { kind: "keydown", facts: reversed ? facts("Dead", "KeyW") : facts("w", "KeyZ") }, {
      ...context, settings, target: { kind: "undo" }
    })
    expect(step.state.kind).toBe("conflict")
    expect(recorder(step.state, { kind: "use-here" }, { ...context, settings, target: { kind: "undo" } }).outcome)
      .toEqual({ kind: "commit", key: candidate, clear: [{ kind: "picker" }] })
    const replaced = assignKey(settings, { kind: "undo" }, candidate, true)
    if (replaced.kind !== "assigned") throw new Error("Expected conflict replacement")
    expect(replaced.settings.shortcuts.picker).toBeNull()
    expect(replaced.settings.undoKey).toEqual(candidate)
    expect(replaced.cleared).toEqual([{ kind: "picker" }])
    expect(JSON.stringify(settings)).toBe(before)
  })

  test("printable layout positions can alias without assuming a US layout", () => {
    const character = recorded(facts("w", "KeyZ"))
    for (const code of ["KeyW", "Digit2", "Comma", "IntlBackslash", "IntlRo", "IntlYen"]) {
      const physical: Key = { code, ...bare, alt: true }
      expect(keyMatches(physical, facts("w", code))).toBe(true)
      expect(keyMatches(character, facts("w", code))).toBe(true)
      expect(keysOverlap(physical, character)).toBe(true)
      expect(keysOverlap(character, physical)).toBe(true)
    }
    const digit = recorded(facts("1", "Digit1"))
    const keypad: Key = { code: "Numpad1", ...bare, alt: true }
    expect(keysOverlap(keypad, digit)).toBe(true)
    expect(keysOverlap(digit, keypad)).toBe(true)
  })

  test("physical named keys and distinct physical characters do not invent aliases", () => {
    const character = recorded(facts("w", "KeyZ"))
    for (const code of ["F2", "ArrowUp", "Enter", "Space", "MediaPlayPause", "NumpadAdd", "Numpad1"]) {
      const physical: Key = { code, ...bare, alt: true }
      expect(keysOverlap(physical, character)).toBe(false)
      expect(keysOverlap(character, physical)).toBe(false)
    }
    const left: Key = { char: ";", code: "Comma", ...bare, alt: true }
    const right: Key = { ...left, code: "Semicolon" }
    expect(keysOverlap(left, right)).toBe(false)
    expect(keysOverlap(right, left)).toBe(false)
    expect(keysOverlap(character, { code: "KeyW", ...bare, shift: true })).toBe(false)
  })
})

const characters = [
  ["é", "Digit2", { alt: true }, "Alt+é", "⌥é"],
  [";", "Comma", { alt: true }, "Alt+;", "⌥;"],
  ["ц", "KeyW", { alt: true }, "Alt+ц", "⌥ц"],
  ["∑", "KeyW", { alt: true }, "Alt+∑", "⌥∑"],
  ["ß", "KeyS", { alt: true }, "Alt+ß", "⌥ß"],
  ["?", "Slash", { shift: true }, "Shift+?", "⇧?"],
  ["e\u0301", "KeyE", { alt: true }, "Alt+e\u0301", "⌥e\u0301"],
  ["😀", "KeyE", { alt: true }, "Alt+😀", "⌥😀"]
] satisfies [string, string, Partial<Modifiers>, string, string][]

describe("review A2, recorded characters", () => {
  test.each(characters)("records and displays %s through canonical settings persistence", (char, code, held, linuxLabel, macLabel) => {
    const event = facts(char, code, held)
    freeze(event)
    const candidate = recorded(event)
    expect(candidate).toEqual({ code, char, ...bare, ...held })
    expect(display(candidate, "linux")).toBe(linuxLabel)
    expect(display(candidate, "macos")).toBe(macLabel)
    const withFuture = { ...candidate, futureKey: { retained: true } }
    freeze(withFuture)
    expect(isKey(withFuture)).toBe(true)
    expect(decodeKey(withFuture)).toEqual(withFuture)

    const settings = { ...defaultSettings(), undoKey: null, futureSettings: { retained: true } }
    const before = JSON.stringify(settings)
    freeze(settings)
    const assigned = assignKey(settings, { kind: "picker" }, withFuture)
    if (assigned.kind !== "assigned") throw new Error("Expected assignment")
    freeze(assigned.settings)
    const normalized = normalizeSettingsForWrite(assigned.settings)
    const restored = decodeSettings(JSON.parse(JSON.stringify(normalized)))
    expect(restored.shortcuts.picker).toEqual(withFuture)
    expect(restored).toMatchObject({ futureSettings: { retained: true } })
    if (restored.shortcuts.picker === null) throw new Error("Expected the persisted key")
    expect(display(restored.shortcuts.picker, "linux")).toBe(linuxLabel)
    expect(JSON.stringify(settings)).toBe(before)

    expect(keyMatches(candidate, facts("a", code, held))).toBe(true)
    expect(keyMatches(candidate, facts(char, code === "KeyZ" ? "KeyX" : "KeyZ", held))).toBe(false)
  })

  test.each(["", "two", "é", ";", "ц", "∑", "e\u0301", "😀"])("DATA-12 char is an optional string, including %j", char => {
    const key = { code: "Digit2", char, ...bare }
    expect(isKey(key)).toBe(true)
    expect(decodeKey(key)).toEqual(key)
  })

  test("only ASCII letters and digits on both sides use character comparison", () => {
    const physical: Key = { code: "Digit2", char: "é", ...bare, alt: true }
    expect(keyMatches(physical, facts("2", "Digit2"))).toBe(true)
    expect(keyMatches(physical, facts("é", "KeyE"))).toBe(false)
    const ascii = recorded(facts("W", "KeyZ"))
    expect(ascii.char).toBe("W")
    expect(keyMatches(ascii, facts("w", "Comma"))).toBe(true)
    expect(keyMatches(ascii, facts("z", "KeyZ"))).toBe(false)
    expect(keyMatches(ascii, facts("∑", "KeyZ"))).toBe(true)
    expect(keyMatches(ascii, facts("∑", "KeyW"))).toBe(false)
    for (const event of [facts("Dead", "Quote"), facts("F2", "F2"), facts("ArrowUp", "ArrowUp"), facts(" ", "Space")]) {
      const key = recorded(event)
      expect(key.char).toBeUndefined()
      expect(keyMatches(key, event)).toBe(true)
    }
  })
})

describe("review A3, YouTube list navigation warnings", () => {
  test.each([["n", "Next video"], ["p", "Previous video"]])("warns for Shift+%s with exact modifiers", (char, action) => {
    const code = `Key${char.toUpperCase()}`
    for (let mask = 0; mask < 16; mask++) {
      const held = { ctrl: !!(mask & 1), alt: !!(mask & 2), shift: !!(mask & 4), meta: !!(mask & 8) }
      const warnings = shortcutWarnings({ code, char, ...held }, { sites: ["www"], platform, commands: [] })
      expect(warnings).toEqual(mask === 4 ? [{ kind: "site", site: "www", action }] : [])
    }
    expect(shortcutWarnings({ code: "Comma", char, ...bare, shift: true }, { sites: ["www"], platform, commands: [] }))
      .toEqual([{ kind: "site", site: "www", action }])
  })
})

describe("review B1, browser Quit policy", () => {
  test("Linux Chrome Ctrl+Q can commit", () => {
    const key: Key = { code: "KeyQ", char: "q", ...bare, ctrl: true }
    expect(isReserved(key, platform)).toBe(false)
    expect(recorded(facts("q", "KeyQ", { ctrl: true }))).toEqual(key)
  })

  test.each([
    ["firefox", "linux", { ctrl: true }],
    ["firefox", "windows", { ctrl: true, shift: true }],
    ["firefox", "macos", { meta: true }],
    ["chrome", "macos", { meta: true }]
  ] satisfies [Platform["browser"], Platform["os"], Partial<Modifiers>][])("preserves %s %s Quit reservation", (browser, os, held) => {
    const key: Key = { code: "KeyQ", char: "q", ...bare, ...held }
    const quitPlatform = { browser, os }
    expect(isReserved(key, quitPlatform)).toBe(true)
    expect(recorder(recording, { kind: "keydown", facts: facts("q", "KeyQ", held) }, { ...context, platform: quitPlatform }).state)
      .toMatchObject({ kind: "recording", refusal: "reserved" })
  })
})
