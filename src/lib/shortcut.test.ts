import { describe, expect, it } from "vitest"

import {
  formatShortcut,
  isModifierKey,
  matchesShortcut,
  parseShortcut
} from "@/lib/shortcut"

/** A KeyboardEvent-shaped literal; modifiers default to false. */
function key(
  k: string,
  mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}
) {
  return {
    key: k,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods
  }
}

describe("formatShortcut", () => {
  it("encodes modifiers in a stable order before the key", () => {
    expect(
      formatShortcut(key("s", { ctrlKey: true, shiftKey: true }))
    ).toBe("Control+Shift+S")
  })

  it("uppercases the key", () => {
    expect(formatShortcut(key("a"))).toBe("A")
  })

  it("returns null for a bare modifier press", () => {
    // Otherwise holding Ctrl alone would record the shortcut "CONTROL".
    for (const mod of ["Control", "Alt", "Shift", "Meta"]) {
      expect(formatShortcut(key(mod, { ctrlKey: true }))).toBeNull()
    }
  })

  it("encodes all four modifiers", () => {
    expect(
      formatShortcut(
        key("k", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })
      )
    ).toBe("Control+Alt+Shift+Meta+K")
  })
})

describe("parseShortcut", () => {
  it("splits modifiers from the key", () => {
    expect(parseShortcut("Control+Shift+S")).toEqual({
      key: "S",
      modifiers: ["Control", "Shift"]
    })
  })

  it("parses a key with no modifiers", () => {
    expect(parseShortcut("S")).toEqual({ key: "S", modifiers: [] })
  })

  it("handles a literal + as the key", () => {
    // "Shift++".split("+") is ["Shift","",""] -- a naive parse yields an empty,
    // permanently unmatchable key.
    expect(parseShortcut("Shift++")).toEqual({ key: "+", modifiers: ["Shift"] })
    expect(parseShortcut("+")).toEqual({ key: "+", modifiers: [] })
  })

  it("returns null for empty or key-less input", () => {
    expect(parseShortcut("")).toBeNull()
    expect(parseShortcut("Control+")).toBeNull()
  })
})

describe("round trip: what the popup records is what the content script matches", () => {
  // The regression that motivated this module. The popup wrote "Control" and
  // the matcher read event["controlKey"], which does not exist.
  const cases = [
    ["Ctrl+Shift+S", key("s", { ctrlKey: true, shiftKey: true })],
    ["Ctrl alone", key("s", { ctrlKey: true })],
    ["Alt", key("s", { altKey: true })],
    ["Shift", key("S", { shiftKey: true })],
    ["Meta", key("s", { metaKey: true })],
    ["no modifiers", key("s")],
    ["all four", key("s", { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })]
  ] as const

  it.each(cases)("%s round-trips and matches itself", (_label, event) => {
    const encoded = formatShortcut(event)
    expect(encoded).not.toBeNull()
    expect(matchesShortcut(event, parseShortcut(encoded!))).toBe(true)
  })
})

describe("matchesShortcut", () => {
  it("matches a Ctrl shortcut", () => {
    // Directly pins the original bug: this was false for every Ctrl shortcut.
    const parsed = parseShortcut("Control+Shift+S")
    expect(matchesShortcut(key("s", { ctrlKey: true, shiftKey: true }), parsed)).toBe(true)
  })

  it("does not fire a bare shortcut when an extra modifier is held", () => {
    // The other half of the bug: "S" fired on Ctrl+S and swallowed the keypress.
    const parsed = parseShortcut("S")
    expect(matchesShortcut(key("s", { ctrlKey: true }), parsed)).toBe(false)
    expect(matchesShortcut(key("s", { altKey: true }), parsed)).toBe(false)
    expect(matchesShortcut(key("s", { metaKey: true }), parsed)).toBe(false)
  })

  it("does not fire when a required modifier is missing", () => {
    const parsed = parseShortcut("Control+Shift+S")
    expect(matchesShortcut(key("s", { ctrlKey: true }), parsed)).toBe(false)
    expect(matchesShortcut(key("s"), parsed)).toBe(false)
  })

  it("is case-insensitive on the key", () => {
    // The recorder uppercases; the event reports natural case.
    const parsed = parseShortcut("Control+S")
    expect(matchesShortcut(key("s", { ctrlKey: true }), parsed)).toBe(true)
    expect(matchesShortcut(key("S", { ctrlKey: true }), parsed)).toBe(true)
  })

  it("does not match a different key", () => {
    expect(matchesShortcut(key("d", { ctrlKey: true }), parseShortcut("Control+S"))).toBe(false)
  })

  it("returns false for a null shortcut", () => {
    expect(matchesShortcut(key("s"), null)).toBe(false)
  })
})

describe("isModifierKey", () => {
  it.each(["Control", "Alt", "Shift", "Meta"])("treats %s as a modifier", (k) => {
    expect(isModifierKey(k)).toBe(true)
  })

  it("treats a normal key as not a modifier", () => {
    expect(isModifierKey("S")).toBe(false)
  })
})
