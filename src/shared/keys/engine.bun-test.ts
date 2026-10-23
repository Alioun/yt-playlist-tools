import { describe, expect, test } from "bun:test"
import { decodeSettings, defaultSettings } from "../model"
import type { Key, Settings } from "../model"
import { applyPresets, assignKey, bindingsForSite, display, displayModifiers, findConflicts, isReserved, isTyping, keyMatches, keysOverlap, match, recorder, shortcutWarnings } from "./index"
import type { Binding, KeyFacts, MatchContext, Modifiers, PathDescriptor, Platform, RecorderContext, RecorderState, ShortcutTarget } from "./index"

const bare: Modifiers = { ctrl: false, alt: false, shift: false, meta: false }
const chrome: Platform = { browser: "chrome", os: "windows" }
const firefox: Platform = { browser: "firefox", os: "linux" }
const picker: ShortcutTarget = { kind: "picker" }
const playlist: ShortcutTarget = { kind: "playlist", id: "save01" }
const context: MatchContext = { path: [], menuOpen: false, dialogOpen: false, pending: [] }

function key(char: string, held: Partial<Modifiers> = { alt: true }): Key {
  return { code: /^[a-z]$/i.test(char) ? `Key${char.toUpperCase()}` : `Digit${char}`, char, ...bare, ...held }
}

function facts(overrides: Partial<KeyFacts> = {}): KeyFacts {
  return { key: "w", code: "KeyW", ctrlKey: false, altKey: true, shiftKey: false, metaKey: false, altGraph: false, ...overrides }
}

function settingsWithShortcut(): Settings {
  const settings = defaultSettings()
  settings.shortcuts.list.push({ id: "save01", key: key("w"), label: "Later", watchLaterOnEveryAccount: true })
  return settings
}

function recordContext(settings: Settings = { ...defaultSettings(), undoKey: null }, platform = chrome): RecorderContext {
  return { settings, platform, target: picker }
}

function recording(oldKey: Key | null = key("p")): RecorderState {
  return { kind: "recording", key: oldKey, modifiers: bare, refusal: null }
}

function freeze(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return
  Object.freeze(value)
  for (const child of Object.values(value)) freeze(child)
}

describe("matching", () => {
  test.each([
    ["QWERTY", facts(), true],
    ["AZERTY", facts({ code: "KeyZ" }), true],
    ["Dvorak", facts({ code: "Comma" }), true],
    ["QWERTZ", facts({ key: "z", code: "KeyW" }), false],
    ["uppercase", facts({ key: "W" }), true],
    ["Option on macOS", facts({ key: "∑" }), true],
    ["non-Latin", facts({ key: "ц" }), true],
    ["dead key", facts({ key: "Dead" }), true],
    ["non-Latin wrong position", facts({ key: "ц", code: "KeyZ" }), false],
    ["AltGr", facts({ altGraph: true }), false],
    ["Ctrl+AltGr", facts({ altGraph: true, ctrlKey: true }), false]
  ])("%s", (_, event, expected) => expect(keyMatches(key("w"), event)).toBe(expected))

  test("compares all 16 modifier sets exactly", () => {
    for (let mask = 0; mask < 16; mask++) {
      const event = facts({ ctrlKey: !!(mask & 1), altKey: !!(mask & 2), shiftKey: !!(mask & 4), metaKey: !!(mask & 8) })
      expect(keyMatches(key("w"), event)).toBe(mask === 2)
    }
  })

  test("digits use characters while punctuation and named keys use physical codes", () => {
    expect(keyMatches(key("1"), facts({ key: "1", code: "Digit7" }))).toBe(true)
    expect(keyMatches(key("1"), facts({ key: "!", code: "Digit1" }))).toBe(true)
    expect(keyMatches({ code: "Semicolon", ...bare }, facts({ key: ";", code: "KeyM", altKey: false }))).toBe(false)
    expect(keyMatches({ code: "Semicolon", ...bare }, facts({ key: "é", code: "Semicolon", altKey: false }))).toBe(true)
    expect(keyMatches({ code: "ArrowUp", ...bare }, facts({ key: "ArrowUp", code: "ArrowUp", altKey: false }))).toBe(true)
  })

  const fields = [
    ...["", "text", "search", "email", "url", "tel", "password", "number", "date", "datetime-local", "month", "week", "time", "unknown"].map(inputType => ({ tagName: "INPUT", inputType })),
    { tagName: "textarea" }, { tagName: "SELECT" }, { isContentEditable: true },
    { contentEditable: true }, { contentEditable: "" }, { contentEditable: "true" }, { contentEditable: "plaintext-only" },
    ...["textbox", "searchbox", "combobox", "spinbutton", "presentation textbox"].map(role => ({ role }))
  ] satisfies PathDescriptor[]

  test.each(fields)("ignores a typing descriptor %j anywhere in a composed path", field => {
    const path = [{ tagName: "span" }, field, { tagName: "div" }]
    expect(isTyping(path)).toBe(true)
    expect(match(facts(), [{ target: playlist, key: key("w") }], { ...context, path })).toBeNull()
  })

  test.each(["checkbox", "radio", "range", "button", "submit", "reset", "image", "color", "file"])("allows %s inputs", inputType => {
    expect(isTyping([{ tagName: "input", inputType }])).toBe(false)
    expect(isTyping([{ tagName: "input", inputType, role: "textbox" }])).toBe(true)
  })

  test("non-editable nodes and contenteditable=false alone permit matching", () => {
    expect(isTyping([{ tagName: "button", contentEditable: "false", role: "button" }])).toBe(false)
    expect(isTyping([{ tagName: "span", contentEditable: "false" }, { isContentEditable: true }])).toBe(true)
  })

  test("returns only the matching binding and leaves event methods untouched", () => {
    const binding: Binding = { target: playlist, key: key("w") }
    let calls = 0
    const event = { ...facts(), preventDefault: () => calls++, stopImmediatePropagation: () => calls++ }
    freeze(event)
    expect(match(event, [binding], context)).toBe(binding)
    expect(match({ ...event, key: "z" }, [binding], context)).toBeNull()
    expect(calls).toBe(0)
  })

  test.each([
    { repeat: true }, { isComposing: true }, { keyCode: 229 }, { altGraph: true }
  ])("ignored facts pass through %j", ignored => {
    expect(match(facts(ignored), [{ target: playlist, key: key("w") }], context)).toBeNull()
  })

  test("menus, dialogs and same-target pending suppress a match", () => {
    const binding: Binding = { target: playlist, key: key("w") }
    for (const ignored of [{ menuOpen: true }, { dialogOpen: true }, { pending: [playlist] }]) {
      expect(match(facts(), [binding], { ...context, ...ignored })).toBeNull()
    }
    expect(match(facts(), [binding], { ...context, pending: [picker] })).toBe(binding)
  })
})

describe("site bindings and conflicts", () => {
  test("disabled features reserve their keys on both sites", () => {
    const settings = settingsWithShortcut()
    settings.shortcuts.music = false
    settings.musicSection = false
    expect(findConflicts(settings, { kind: "music", action: "next" }, key("w"))).toEqual([{ target: playlist, sites: ["music"] }])
    expect(findConflicts(settings, picker, key("w"))).toEqual([{ target: playlist, sites: ["www"] }])
    expect(bindingsForSite(settings, { site: "www", undoAvailable: false })).toEqual([])
  })

  test("YouTube and Music picker keys coexist; shared undo reserves both", () => {
    const settings = defaultSettings()
    settings.shortcuts.picker = key("p", { alt: true, shift: true })
    expect(findConflicts(settings, { kind: "music", action: "picker" }, settings.shortcuts.picker)).toEqual([])
    expect(findConflicts(settings, { kind: "music", action: "picker" }, key("u"))).toEqual([{ target: { kind: "undo" }, sites: ["music"] }])
    settings.musicKeys.keys.next = key("w")
    expect(findConflicts(settings, picker, key("w"))).toEqual([])
    expect(findConflicts(settings, playlist, key("w"))).toEqual([{ target: { kind: "music", action: "next" }, sites: ["music"] }])
  })

  test("layout aliases and physical fallback cannot assign two targets to the same press", () => {
    expect(keysOverlap(key("w"), { ...key("w"), code: "KeyZ" })).toBe(true)
    expect(keysOverlap(key("w"), { ...key("z"), code: "KeyW" })).toBe(true)
    expect(keysOverlap(key("w"), key("w", { alt: true, shift: true }))).toBe(false)
  })

  test("assignment requires a conflict choice and atomically clears every conflicting target", () => {
    const settings = settingsWithShortcut()
    settings.musicKeys.keys.next = key("w")
    freeze(settings)
    expect(assignKey(settings, { kind: "undo" }, key("w")).kind).toBe("conflict")
    const result = assignKey(settings, { kind: "undo" }, key("w"), true)
    expect(result.kind).toBe("assigned")
    if (result.kind !== "assigned") throw new Error("Expected assignment")
    expect(result.cleared).toEqual([playlist, { kind: "music", action: "next" }])
    expect(result.settings.undoKey).toEqual(key("w"))
    expect(result.settings.shortcuts.list[0]?.key).toBeNull()
    expect(result.settings.musicKeys.keys.next).toBeNull()
    expect(settings.shortcuts.list[0]?.key).toEqual(key("w"))
    expect(assignKey(settings, { kind: "playlist", id: "absent" }, key("w"))).toEqual({ kind: "missing-target" })
  })

  test("clear leaves the shortcut, label, Watch Later choice and unknown fields intact", () => {
    const settings = decodeSettings({ ...settingsWithShortcut(), futureRoot: { value: 1 }, shortcuts: {
      ...settingsWithShortcut().shortcuts, futureShortcuts: true,
      list: [{ ...settingsWithShortcut().shortcuts.list[0], futureShortcut: { value: 2 } }]
    } })
    freeze(settings)
    const result = assignKey(settings, playlist, null)
    if (result.kind !== "assigned") throw new Error("Expected assignment")
    expect(result.settings).toMatchObject({ futureRoot: { value: 1 }, shortcuts: { futureShortcuts: true, list: [
      { id: "save01", key: null, label: "Later", watchLaterOnEveryAccount: true, futureShortcut: { value: 2 } }
    ] } })
  })

  test("Undo is live for a toast or a shortcut feature, with the Music section as a gate", () => {
    const settings = settingsWithShortcut()
    for (const site of ["www", "music"] satisfies ("www" | "music")[]) {
      expect(bindingsForSite(settings, { site, undoAvailable: false })).toEqual([])
      expect(bindingsForSite(settings, { site, undoAvailable: true })).toEqual([{ target: { kind: "undo" }, key: key("u") }])
    }
    settings.shortcuts.on = true
    settings.shortcuts.picker = key("p", { alt: true, shift: true })
    expect(bindingsForSite(settings, { site: "www", undoAvailable: false }).map(binding => binding.target)).toEqual([{ kind: "undo" }, playlist, picker])
    expect(bindingsForSite(settings, { site: "music", undoAvailable: false }).map(binding => binding.target)).toEqual([{ kind: "undo" }, playlist])
    settings.shortcuts.music = false
    expect(bindingsForSite(settings, { site: "music", undoAvailable: false })).toEqual([])
    settings.musicKeys.on = true
    settings.musicKeys.keys.next = key("n")
    expect(bindingsForSite(settings, { site: "music", undoAvailable: false }).map(binding => binding.target)).toEqual([{ kind: "undo" }, { kind: "music", action: "next" }])
    settings.musicSection = false
    expect(bindingsForSite(settings, { site: "music", undoAvailable: true })).toEqual([])
  })
})

describe("one-time presets", () => {
  test("playlist defaults create Watch Later and the YouTube-only picker without enabling features", () => {
    const settings = defaultSettings()
    freeze(settings)
    const result = applyPresets(settings, { feature: "shortcuts", shortcutId: "later1" })
    expect(result.kind).toBe("applied")
    expect(result.settings.shortcuts).toEqual({ on: false, feedback: true, music: true, preset: true,
      picker: key("p", { alt: true, shift: true }), list: [{ id: "later1", key: key("w"), label: "", watchLaterOnEveryAccount: true }] })
    expect(result.blocked).toEqual([])
    expect(result.settings.undoKey).toEqual(key("u"))
  })

  test("Music gets exactly the six approved keys and the four new actions stay unbound", () => {
    const result = applyPresets(defaultSettings(), { feature: "music-keys" })
    expect(result.settings.musicKeys.keys).toEqual({ next: key("n"), queue: key("q"), save: key("p"),
      picker: key("p", { alt: true, shift: true }), like: key("l"), remove: key("r"), library: null, mix: null, album: null, artist: null })
    expect(result.settings.musicKeys.on).toBe(false)
  })

  test("disabled bindings and Undo block presets, while the other site's picker does not", () => {
    const settings = settingsWithShortcut()
    settings.undoKey = key("n")
    settings.shortcuts.picker = key("p", { alt: true, shift: true })
    const music = applyPresets(settings, { feature: "music-keys" })
    expect(music.settings.musicKeys.keys.next).toBeNull()
    expect(music.blocked).toEqual([{ target: { kind: "music", action: "next" }, key: key("n"), conflicts: [{ target: { kind: "undo" }, sites: ["music"] }] }])
    expect(music.settings.musicKeys.keys.picker).toEqual(key("p", { alt: true, shift: true }))
    const shortcuts = applyPresets(settings, { feature: "shortcuts", shortcutId: "later1" })
    expect(shortcuts.settings.shortcuts.list[1]?.key).toBeNull()
    expect(shortcuts.blocked[0]?.conflicts).toEqual([{ target: playlist, sites: ["www", "music"] }])
  })

  test("blocked presets and deleted defaults never reappear after off/on", () => {
    const settings = settingsWithShortcut()
    settings.undoKey = key("n")
    const first = applyPresets(settings, { feature: "music-keys" })
    const changed = { ...first.settings, undoKey: null, musicKeys: { ...first.settings.musicKeys, on: true, keys: { ...first.settings.musicKeys.keys, queue: null } } }
    expect(applyPresets(changed, { feature: "music-keys" })).toEqual({ kind: "unchanged", settings: changed, blocked: [] })
    const empty = { ...settings, shortcuts: { ...settings.shortcuts, preset: true, list: [], picker: null } }
    expect(applyPresets(empty, { feature: "shortcuts", shortcutId: "later1" }).settings).toBe(empty)
  })

  test("presets preserve explicit choices and reject invalid, duplicate or overflow IDs before writes", () => {
    const settings = settingsWithShortcut()
    settings.shortcuts.music = false
    settings.shortcuts.feedback = false
    settings.shortcuts.picker = key("x")
    const result = applyPresets(settings, { feature: "shortcuts", shortcutId: "later1" })
    expect(result.settings.shortcuts).toMatchObject({ music: false, feedback: false, picker: key("x") })
    expect(() => applyPresets(settings, { feature: "shortcuts", shortcutId: "save01" })).toThrow(TypeError)
    expect(() => applyPresets(settings, { feature: "shortcuts", shortcutId: "bad" })).toThrow(TypeError)
    settings.shortcuts.list = Array.from({ length: 20 }, (_, index) => ({ id: `save${String(index).padStart(2, "0")}`, key: null, label: "", watchLaterOnEveryAccount: false }))
    freeze(settings)
    expect(() => applyPresets(settings, { feature: "shortcuts", shortcutId: "later1" })).toThrow(RangeError)
    expect(settings.shortcuts.preset).toBe(false)
  })
})

describe("recorder", () => {
  test("start, modifier preview and keyup preserve the previous key until a candidate is accepted", () => {
    const oldKey = key("x")
    const start = recorder({ kind: "idle", key: oldKey }, { kind: "start" }, recordContext())
    expect(start.state).toEqual({ kind: "recording", key: oldKey, modifiers: bare, refusal: null })
    const down = recorder(start.state, { kind: "keydown", facts: facts({ key: "Alt", code: "AltLeft" }) }, recordContext())
    expect(down.state).toEqual({ kind: "recording", key: oldKey, modifiers: { ...bare, alt: true }, refusal: null })
    const up = recorder(down.state, { kind: "keyup", facts: facts({ key: "Alt", code: "AltLeft", altKey: false }) }, recordContext())
    expect(up.state).toEqual(start.state)
    expect(up.outcome).toEqual({ kind: "none" })
  })

  test.each([
    { key: "Escape", code: "Escape" }, { key: "Tab", code: "Tab" }, { key: "Tab", code: "Tab", shiftKey: true }
  ])("cancels without changing the old key for %j", event => {
    const state = recording()
    const result = recorder(state, { kind: "keydown", facts: facts(event) }, recordContext())
    expect(result.state).toEqual({ kind: "idle", key: key("p") })
    expect(result.outcome).toEqual({ kind: "cancelled" })
    expect(result.consume).toBe(event.key === "Escape")
  })

  test.each(["blur", "close", "cancel"] satisfies ("blur" | "close" | "cancel")[])("%s keeps the previous key", kind => {
    const result = recorder(recording(), { kind }, recordContext())
    expect(result.state).toEqual({ kind: "idle", key: key("p") })
    expect(result.consume).toBe(false)
    expect(result.outcome).toEqual({ kind: "cancelled" })
  })

  test.each(["Enter", "Space", "NumpadEnter"])("refuses plain %s, accepts it with a modifier", code => {
    const state = recording()
    const refused = recorder(state, { kind: "keydown", facts: facts({ key: code === "Space" ? " " : "Enter", code, altKey: false }) }, recordContext())
    expect(refused.state).toMatchObject({ kind: "recording", refusal: "plain-enter-space" })
    expect(refused.outcome).toEqual({ kind: "none" })
    const accepted = recorder(refused.state, { kind: "keydown", facts: facts({ key: code, code }) }, recordContext())
    expect(accepted.outcome).toEqual({ kind: "commit", key: { code, ...bare, alt: true }, clear: [] })
  })

  test("Ctrl+Alt with any additional modifiers and AltGr are refused", () => {
    for (const shiftKey of [false, true]) for (const metaKey of [false, true]) {
      expect(recorder(recording(), { kind: "keydown", facts: facts({ ctrlKey: true, shiftKey, metaKey }) }, recordContext()).state)
        .toMatchObject({ kind: "recording", refusal: "ctrl-alt" })
    }
    expect(recorder(recording(), { kind: "keydown", facts: facts({ altGraph: true }) }, recordContext()).state)
      .toMatchObject({ kind: "recording", refusal: "ctrl-alt" })
  })

  test.each([{ isComposing: true }, { keyCode: 229 }, { repeat: true }])("IME and repeat remain untouched %j", ignored => {
    const state = recording()
    const result = recorder(state, { kind: "keydown", facts: facts(ignored) }, recordContext())
    expect(result.state).toBe(state)
    expect(result.consume).toBe(false)
    expect(result.outcome).toEqual({ kind: "none" })
  })

  test.each(["Control", "Alt", "Shift", "Meta", "OS", "AltGraph", "Fn", "FnLock"])("%s alone keeps waiting", name => {
    expect(recorder(recording(), { kind: "keydown", facts: facts({ key: name, code: name }) }, recordContext()).state)
      .toMatchObject({ kind: "recording", refusal: null })
  })

  test("unsupported physical codes cannot create persisted keys", () => {
    const result = recorder(recording(), { kind: "keydown", facts: facts({ key: "Unidentified", code: "" }) }, recordContext())
    expect(result.state).toMatchObject({ kind: "recording", refusal: "unsupported-key" })
    expect(result.outcome.kind).toBe("none")
  })

  test.each([
    ["AZERTY", facts({ key: "w", code: "KeyZ" }), { ...key("w"), code: "KeyZ" }],
    ["Option", facts({ key: "∑" }), { code: "KeyW", char: "∑", ...bare, alt: true }],
    ["dead", facts({ key: "Dead", code: "Quote" }), { code: "Quote", ...bare, alt: true }],
    ["punctuation", facts({ key: ";", code: "Semicolon" }), { code: "Semicolon", char: ";", ...bare, alt: true }],
    ["named", facts({ key: "F2", code: "F2" }), { code: "F2", ...bare, alt: true }]
  ])("records %s without duplicating the model", (_, event, expected) => {
    const result = recorder(recording(), { kind: "keydown", facts: event }, recordContext())
    expect(result.state).toEqual({ kind: "idle", key: expected })
    expect(result.outcome).toEqual({ kind: "commit", key: expected, clear: [] })
    expect(result.consume).toBe(true)
  })

  test("conflicts wait for a choice, cancellation changes nothing, Use it here reports atomic displacement", () => {
    const settings = settingsWithShortcut()
    const state = recording()
    freeze(settings)
    freeze(state)
    const ctx = recordContext(settings)
    const conflict = recorder(state, { kind: "keydown", facts: facts() }, ctx)
    expect(conflict.state).toEqual({ kind: "conflict", key: key("p"), candidate: key("w"), conflicts: [{ target: playlist, sites: ["www"] }] })
    expect(conflict.outcome).toEqual({ kind: "none" })
    expect(recorder(conflict.state, { kind: "cancel" }, ctx).state).toEqual({ kind: "idle", key: key("p") })
    expect(recorder(conflict.state, { kind: "keydown", facts: facts({ key: "Tab", code: "Tab" }) }, ctx).consume).toBe(false)
    const accepted = recorder(conflict.state, { kind: "use-here" }, ctx)
    expect(accepted.outcome).toEqual({ kind: "commit", key: key("w"), clear: [playlist] })
    expect(settings.shortcuts.list[0]?.key).toEqual(key("w"))
  })

  test("Use it here refreshes conflicts against current settings", () => {
    const state: RecorderState = { kind: "conflict", key: key("p"), candidate: key("w"), conflicts: [{ target: playlist, sites: ["www"] }] }
    const settings = defaultSettings()
    settings.undoKey = key("w")
    expect(recorder(state, { kind: "use-here" }, recordContext(settings)).outcome).toEqual({ kind: "commit", key: key("w"), clear: [{ kind: "undo" }] })
  })

  test("clear commits null without removing a playlist shortcut", () => {
    expect(recorder(recording(), { kind: "clear" }, recordContext())).toEqual({ state: { kind: "idle", key: null }, consume: false,
      outcome: { kind: "commit", key: null, clear: [] } })
  })
})

describe("browser policy and display", () => {
  test.each(["windows", "linux", "macos"] satisfies Platform["os"][])("Chrome reserved table on %s", os => {
    const platform: Platform = { browser: "chrome", os }
    const primary = os === "macos" ? { meta: true } : { ctrl: true }
    for (const char of ["t", "n", "w"]) {
      expect(isReserved(key(char, primary), platform)).toBe(true)
      expect(isReserved(key(char, { ...primary, shift: true }), platform)).toBe(true)
    }
    for (const code of ["Tab", "PageUp", "PageDown"]) expect(isReserved({ code, ...bare, ctrl: true }, platform)).toBe(true)
    if (os !== "macos") {
      expect(isReserved({ code: "F4", ...bare, alt: true }, platform)).toBe(true)
      expect(isReserved({ code: "F4", ...bare, ctrl: true }, platform)).toBe(true)
      for (const char of ["a", "b", "i", "n", "r", "t"]) expect(isReserved(key(char, { alt: true, shift: true }), platform)).toBe(true)
    }
    expect(isReserved(key("q", primary), platform)).toBe(os === "macos")
    expect(isReserved({ code: "Tab", ...bare, ctrl: true, shift: true }, platform)).toBe(true)
    expect(isReserved(key("d", primary), platform)).toBe(false)
    expect(isReserved({ code: "F5", ...bare }, platform)).toBe(false)
  })

  test.each(["windows", "linux", "macos"] satisfies Platform["os"][])("Firefox reserved table on %s", os => {
    const platform: Platform = { browser: "firefox", os }
    const primary = os === "macos" ? { meta: true } : { ctrl: true }
    for (const char of ["t", "n", "w"]) expect(isReserved(key(char, primary), platform)).toBe(true)
    for (const char of ["w", "p"]) expect(isReserved(key(char, { ...primary, shift: true }), platform)).toBe(true)
    expect(isReserved(key("q", os === "macos" ? { meta: true } : { ctrl: true, shift: os === "windows" }), platform)).toBe(true)
    if (os !== "macos") expect(isReserved(key("q", { ctrl: true, shift: os !== "windows" }), platform)).toBe(false)
    expect(isReserved(key("t", { ...primary, shift: true }), platform)).toBe(false)
    expect(isReserved({ code: "PageUp", ...bare, ctrl: true }, platform)).toBe(false)
  })

  test("recorder rejects the browser's reserved keys without changing the old key", () => {
    for (const platform of [chrome, firefox, { browser: "chrome", os: "macos" }, { browser: "firefox", os: "macos" }] satisfies Platform[]) {
      const event = facts({ key: "t", code: "KeyT", altKey: false, ctrlKey: platform.os !== "macos", metaKey: platform.os === "macos" })
      expect(recorder(recording(), { kind: "keydown", facts: event }, recordContext(defaultSettings(), platform)).state)
        .toMatchObject({ kind: "recording", key: key("p"), refusal: "reserved" })
    }
  })

  test("warnings name site, browser and caller-supplied any-tab command clashes without refusing the key", () => {
    expect(shortcutWarnings(key("k", {}), { sites: ["www", "music"], platform: chrome, commands: [] })).toEqual([
      { kind: "site", site: "www", action: "Play/pause" }, { kind: "site", site: "music", action: "Previous song" }
    ])
    expect(shortcutWarnings(key("q", {}), { sites: ["music"], platform: firefox, commands: [] })).toEqual([{ kind: "site", site: "music", action: "Toggle queue" }])
    expect(shortcutWarnings(key("d"), { sites: ["www"], platform: chrome, commands: [{ key: key("d"), command: "Save current video" }] })).toEqual([
      { kind: "browser", action: "go to the address bar" }, { kind: "command", command: "Save current video" }
    ])
    expect(recorder(recording(), { kind: "keydown", facts: facts({ key: "d", code: "KeyD" }) }, recordContext()).outcome.kind).toBe("commit")
    for (const char of ["n", "q", "p", "l", "r", "w", "u"]) expect(shortcutWarnings(key(char), { sites: ["www", "music"], platform: chrome, commands: [] })).toEqual([])
  })

  test("Music Shift and Ctrl+Shift warnings keep exact modifier rules", () => {
    const ctx = { sites: ["music"], platform: chrome, commands: [] } satisfies Parameters<typeof shortcutWarnings>[1]
    expect(shortcutWarnings(key("n", { shift: true }), ctx)).toEqual([{ kind: "site", site: "music", action: "Next song" }])
    expect(shortcutWarnings({ code: "Equal", ...bare, shift: true }, ctx)).toEqual([{ kind: "site", site: "music", action: "Like current song" }])
    expect(shortcutWarnings({ code: "ArrowRight", ...bare, ctrl: true, shift: true }, ctx)).toEqual([{ kind: "site", site: "music", action: "Seek forward 1 s" }])
    expect(shortcutWarnings(key("q", { alt: true }), ctx)).toEqual([])
  })

  test("display uses recorded ASCII labels, named keys and platform modifier order", () => {
    expect(display(key("p", { alt: true, shift: true }), "macos")).toBe("⌥⇧P")
    expect(display(key("p", { alt: true, shift: true }), "windows")).toBe("Alt+Shift+P")
    expect(display({ ...key("w"), code: "KeyZ" }, "linux")).toBe("Alt+W")
    expect(display({ code: "ArrowUp", ctrl: true, alt: true, shift: true, meta: true }, "windows")).toBe("Ctrl+Alt+Shift+Win+↑")
    expect(display({ code: "PageDown", ...bare, meta: true }, "linux")).toBe("Super+Page Down")
    expect(display({ code: "F2", ...bare }, "macos")).toBe("F2")
    expect(displayModifiers({ ctrl: true, alt: true, shift: true, meta: true }, "macos")).toBe("⌃⌥⇧⌘")
  })
})

test("the public module imports without browser globals or timer registration", () => {
  const moduleURL = new URL("./index.ts", import.meta.url).href
  const script = `
    for (const name of ["window", "document", "browser", "chrome", "navigator", "localStorage", "setTimeout", "setInterval"]) {
      Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error("Unexpected global access: " + name) } })
    }
    await import(${JSON.stringify(moduleURL)});
  `
  const result = Bun.spawnSync([process.execPath, "--no-env-file", "-e", script])
  expect(result.stderr.toString()).toBe("")
  expect(result.exitCode).toBe(0)
})
