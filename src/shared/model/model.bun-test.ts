import { describe, expect, test } from "bun:test"
import {
  DecodeError, decodeDevice, decodeDocument, decodeFilter, decodeKey, decodeSettings, decodeSetup,
  defaultDevice, defaultFilter, defaultSettings, defaultSetup, documentKey, isAccountKey, isChannelId,
  isKey, isPercent, isPlaylistId, isSetupEmpty, isShortcutId, isVideoId,
  normalizeFilterForWrite, normalizeSettingsForWrite, normalizeSetupForWrite, parseDocumentKey
} from "./index"

const account = "synthetic_acct01"
const channel = `UC${"a".repeat(22)}`
const playlist = `PL${"a".repeat(32)}`
const stamp = { v: 1, gen: "synthetic-write", at: 100, by: "synthetic-device" }
const shortcut = { id: "save01", key: null, label: "Save", watchLaterOnEveryAccount: false }
const context = { shortcutIds: new Set(["save01"]) }
const upgradeDetails = {
  from: "1.4.5", autoAdd: { kept: 1, dropped: 2 },
  pct: { value: 50, wasUnset: true, authorised: false }, feedback: false,
  shortcut: { raw: "Control+K", key: null, playlist: true, note: "ctrl-never-fired" }, credentialsDeleted: true
}
function roundtrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}


describe("fresh documents", () => {
  test("nothing starts on; music is available, Undo is Alt+U and the required percentage is 50", () => {
    const settings = decodeSettings()
    expect([
      settings.autoAdd.on, settings.shortcuts.on, settings.quickSave.on, settings.queueButton.on,
      settings.watchButton.on, settings.cardMenu.on, settings.browserMenu.on,
      settings.musicActions.on, settings.musicKeys.on, settings.anyTabKeys.on, settings.gather.on
    ]).toEqual(Array(11).fill(false))
    expect(settings.theme).toBe("system")
    expect(settings.musicSection).toBe(true)
    expect(settings.undoKey).toEqual({ char: "u", code: "KeyU", ctrl: false, alt: true, shift: false, meta: false })
    expect(settings.autoAdd).toEqual({ on: false, pct: 50, feedback: true, toolbarTick: true, toolbarPaused: true })
    expect(settings.shortcuts).toEqual({ on: false, feedback: true, music: true, preset: false, picker: null, list: [] })
    expect(settings.quickSave.shortsShelves).toBe(false)
    expect(settings.watchButton).toEqual({ on: false, feedback: true, shorts: false })
    expect(settings.cardMenu.keepLinkMenu).toBe(false)
    expect(settings.musicActions.buttons).toEqual({ next: true, queue: true, save: false, like: false, remove: false,
      bar: false, library: false, mix: false, album: false, artist: false })
    expect(Object.values(settings.musicKeys.keys)).toEqual(Array(10).fill(null))
    expect(settings.gather).toEqual({ on: false, feedback: true, to: "player", order: "newest", close: false,
      auto: { unvisited: false, after: "1d", background: false, count: false, n: 10 } })
  })

  test("missing choices do not create account data, consent, a sync subscription or a filter that blocks", () => {
    expect(decodeSetup()).toEqual({ label: null, autoAdd: [], targets: {}, quickSave: null, musicSave: null, gather: null, marks: {} })
    expect(decodeFilter()).toEqual({ on: false, mode: "deny", channels: [] })
    expect(decodeDevice(undefined, "synthetic-device")).toEqual({
      id: "synthetic-device", consent: null, syncOn: false, upgradeNote: null, claimNotice: null,
      lastAccount: null, newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: false
    })
    expect(() => decodeDevice()).toThrow(DecodeError)
    expect(() => defaultDevice("")).toThrow(TypeError)
  })

  test("editing defaults never affects the next read", () => {
    const settings = decodeSettings()
    settings.undoKey!.alt = false
    settings.gather.auto.count = true
    settings.shortcuts.list.push(shortcut)
    settings.musicKeys.keys.next = settings.undoKey
    expect(decodeSettings().undoKey?.alt).toBe(true)
    expect(decodeSettings().gather.auto.count).toBe(false)
    expect(decodeSettings().shortcuts.list).toEqual([])
    expect(decodeSettings().musicKeys.keys.next).toBeNull()
    defaultSetup().autoAdd.push({ pl: playlist, takes: "both" })
    defaultFilter().channels.push([channel, "Synthetic channel"])
    expect(defaultSetup().autoAdd).toEqual([])
    expect(defaultFilter().channels).toEqual([])
  })

  test("additive omitted fields get defaults without re-enabling explicitly cleared choices", () => {
    const settings = decodeSettings({ undoKey: null, autoAdd: { on: true, pct: 0, feedback: false },
      musicSection: false, shortcuts: { preset: true, list: [] }, gather: { auto: { n: 5 } } })
    expect(settings.undoKey).toBeNull()
    expect(settings.autoAdd).toEqual({ on: true, pct: 0, feedback: false, toolbarTick: true, toolbarPaused: true })
    expect(settings.musicSection).toBe(false)
    expect(settings.shortcuts.list).toEqual([])
    expect(settings.shortcuts.picker).toBeNull()
    expect(settings.shortcuts.preset).toBe(true)
    expect(settings.gather.auto).toEqual({ unvisited: false, after: "1d", background: false, count: false, n: 5 })
  })
})

describe("known data validation", () => {
  test.each([null, false, 4, "settings", []].map(raw => ({ raw })))("rejects a malformed settings body %p", ({ raw }) => {
    expect(() => decodeSettings(raw)).toThrow(DecodeError)
  })
  test.each([-1, 101, 2.5, NaN, Infinity, "50", null])("rejects malformed percentage %p", pct => {
    expect(() => decodeSettings({ autoAdd: { pct } })).toThrow(DecodeError)
    expect(() => decodeSetup({ autoAdd: [{ pl: playlist, takes: "both", pct }] })).toThrow(DecodeError)
  })
  test.each([0, 100])("keeps the valid percentage boundary %p", pct => {
    expect(decodeSettings({ autoAdd: { pct } }).autoAdd.pct).toBe(pct)
    expect(decodeSetup({ autoAdd: [{ pl: playlist, takes: "shorts", pct }] }).autoAdd[0]?.pct).toBe(pct)
  })
  test("rejects malformed nested switches and choices", () => {
    for (const raw of [
      { autoAdd: { on: "false" } }, { musicActions: { buttons: { next: 1 } } },
      { shortcuts: { preset: null } }, { gather: { order: "random" } },
      { gather: { auto: { after: "2d" } } }, { gather: { auto: { n: 11 } } }, { theme: "blue" }
    ]) expect(() => decodeSettings(raw)).toThrow(DecodeError)
    expect(() => decodeSetup({ autoAdd: [{ pl: playlist, takes: "all" }] })).toThrow(DecodeError)
    expect(() => decodeSetup({ targets: { short: playlist } })).toThrow(DecodeError)
    expect(() => decodeFilter({ mode: "off" })).toThrow(DecodeError)
    expect(() => decodeFilter({ channels: [[channel]] })).toThrow(DecodeError)
    expect(() => decodeFilter({ channels: [["not-a-channel", "Name"]] })).toThrow(DecodeError)
    expect(() => decodeFilter({ channels: [[channel, "Name", 5]] })).toThrow(DecodeError)
    expect(() => decodeDevice({ id: "synthetic-device", consent: { v: 1, at: -1 } })).toThrow(DecodeError)
    expect(() => decodeDevice({ id: "synthetic-device", lastAccount: "raw||identity" })).toThrow(DecodeError)
  })
  test("all document bodies reject malformed root and nested required values", () => {
    for (const raw of [null, false, 1, "document", []]) {
      expect(() => decodeSetup(raw)).toThrow(DecodeError)
      expect(() => decodeFilter(raw)).toThrow(DecodeError)
      expect(() => decodeDevice(raw, "synthetic-device")).toThrow(DecodeError)
    }
    for (const raw of [
      { id: "" }, { id: "synthetic-device", recentAdds: "true" },
      { id: "synthetic-device", newPlaylistVisibility: "private" },
      { id: "synthetic-device", upgradeNote: { state: "pending", details: {} } },
      { id: "synthetic-device", claimNotice: { acct: account, dropped: -1 } }
    ]) expect(() => decodeDevice(raw)).toThrow(DecodeError)
  })
  test("shortcuts stop at twenty distinct six-character IDs", () => {
    const list = Array.from({ length: 20 }, (_, index) => ({ ...shortcut, id: `save${String(index).padStart(2, "0")}` }))
    expect(decodeSettings({ shortcuts: { list } }).shortcuts.list).toHaveLength(20)
    expect(() => decodeSettings({ shortcuts: { list: [...list, { ...shortcut, id: "more01" }] } })).toThrow(DecodeError)
    expect(() => decodeSettings({ shortcuts: { list: [shortcut, shortcut] } })).toThrow(DecodeError)
    expect(() => decodeSettings({ shortcuts: { list: [{ ...shortcut, id: "seven01" }] } })).toThrow(DecodeError)
  })
  test("playlist order, Takes and absent overrides survive", () => {
    const setup = decodeSetup({ autoAdd: [{ pl: "WL", takes: "shorts", pct: 0 }, { pl: playlist }] })
    expect(roundtrip(setup.autoAdd)).toEqual([{ pl: "WL", takes: "shorts", pct: 0 }, { pl: playlist, takes: "videos" }])
  })
  test("checks every gather choice", () => {
    for (const order of ["newest", "oldest", "english", "non-english", "left-to-right", "right-to-left", "shuffled"] as const) {
      expect(decodeSettings({ gather: { order } }).gather.order).toBe(order)
    }
    for (const to of ["player", "queue", "playlist"] as const) expect(decodeSettings({ gather: { to } }).gather.to).toBe(to)
    for (const after of ["1h", "1d", "1w"] as const) expect(decodeSettings({ gather: { auto: { after } } }).gather.auto.after).toBe(after)
    for (const n of [5, 10, 15, 20, 30, 50] as const) expect(decodeSettings({ gather: { auto: { n } } }).gather.auto.n).toBe(n)
  })
})

describe("read, edit, serialize and read again", () => {
  test("settings retain unknown fields at every edited object depth", () => {
    const raw = { future: { flag: true }, undoKey: { ...defaultSettings().undoKey, futureKey: "x" },
      shortcuts: { futureSection: [1, 2], list: [{ ...shortcut, futureShortcut: { x: 1 } }] },
      gather: { futureGather: "value", auto: { futureAuto: 2 } }, musicKeys: { keys: { futureAction: { x: 1 } } } }
    const decoded = decodeSettings(roundtrip(raw))
    const edited = normalizeSettingsForWrite({ ...decoded, theme: "dark" })
    expect(roundtrip(decodeSettings(roundtrip(edited)))).toMatchObject({ ...raw, theme: "dark" })
    expect(raw.gather.auto).toEqual({ futureAuto: 2 })
  })
  test("setup edits keep the label, entry and document extensions", () => {
    const raw = { future: "setup", label: { name: "Synthetic account", handle: "@synthetic", futureLabel: "x" },
      autoAdd: [{ pl: playlist, takes: "both", futurePlaylist: [1, 2] }], gather: playlist, targets: { save01: playlist } }
    const decoded = decodeSetup(roundtrip(raw))
    expect(roundtrip(normalizeSetupForWrite({ ...decoded, quickSave: "WL" }, context))).toMatchObject({ ...raw, quickSave: "WL" })
  })
  test("filter edits retain future tuple columns and fields", () => {
    const raw = { mode: "allow", on: true, future: { x: 1 }, channels: [[channel, "Synthetic channel", "@synthetic", { future: true }]] }
    const decoded = decodeFilter(roundtrip(raw))
    expect(roundtrip(normalizeFilterForWrite({ ...decoded, on: false }))).toEqual({ ...raw, on: false })
  })
  test.each([
    { name: "two columns", tuple: [channel, "Synthetic channel"], saved: [channel, "Synthetic channel"] },
    { name: "explicit undefined", tuple: [channel, "Synthetic channel", undefined], saved: [channel, "Synthetic channel"] },
    { name: "JSON placeholder", tuple: [channel, "Synthetic channel", null], saved: [channel, "Synthetic channel"] },
    { name: "real handle", tuple: [channel, "Synthetic channel", "@synthetic"], saved: [channel, "Synthetic channel", "@synthetic"] },
    { name: "undefined before future columns", tuple: [channel, "Synthetic channel", undefined, { future: [1, null] }, false],
      saved: [channel, "Synthetic channel", null, { future: [1, null] }, false] },
    { name: "placeholder before future columns", tuple: [channel, "Synthetic channel", null, { future: [1, null] }, false],
      saved: [channel, "Synthetic channel", null, { future: [1, null] }, false] }
  ])("filter $name survives a normalized JSON write and redecode", ({ tuple, saved }) => {
    const raw = { channels: [tuple], futureFilter: { keep: true } }
    const original = structuredClone(raw)
    const decoded = decodeFilter(raw)
    const originalDecoded = structuredClone(decoded)
    expect(decoded.channels[0]?.[2]).toBe(typeof tuple[2] === "string" ? tuple[2] : undefined)
    const written = normalizeFilterForWrite({ ...decoded, on: true })
    const persisted = roundtrip({ ...stamp, futureEnvelope: true, data: written })
    expect(persisted).toEqual({ ...stamp, futureEnvelope: true,
      data: { mode: "deny", on: true, channels: [saved], futureFilter: { keep: true } } })
    const document = { ...stamp, futureEnvelope: true, data: written }
    expect(decodeDocument(persisted, decodeFilter)).toEqual({ kind: "value", document })
    expect(normalizeFilterForWrite(written)).toEqual(written)
    expect(decoded).toEqual(originalDecoded)
    expect(raw).toEqual(original)
  })
  test.each([false, 0, {}, [], ["@synthetic"]].map(handle => ({ handle })))("rejects malformed filter handles %p", ({ handle }) => {
    expect(() => decodeFilter({ channels: [[channel, "Synthetic channel", handle]] })).toThrow(DecodeError)
    expect(() => decodeFilter({ channels: [[channel, "Synthetic channel", handle, "future"]] })).toThrow(DecodeError)
  })
  test("device and upgrade details retain R96 and R97 plus future fields", () => {
    const raw = { id: "synthetic-device", futureDevice: "x", upgradeNote: { state: "pending", details: {
      ...upgradeDetails, futureDetails: [1], pct: { ...upgradeDetails.pct, futurePct: 2 },
      shortcut: { ...upgradeDetails.shortcut, futureShortcut: true }
    }, opened: true, seen: false, reopened: false, futureNote: 3 } }
    const decoded = decodeDevice(roundtrip(raw))
    expect(roundtrip(decodeDevice(roundtrip({ ...decoded, pickerSortAZ: true })))).toMatchObject({ ...raw, pickerSortAZ: true })
    expect(decoded.upgradeNote?.details.pct.authorised).toBe(false)
    expect(decoded.upgradeNote?.details.pct.value).toBe(50)
    const authorised = decodeDevice({ id: "synthetic-device", upgradeNote: { state: "done", details: {
      ...upgradeDetails, pct: { value: 0, wasUnset: true, authorised: true }
    } } })
    expect(authorised.upgradeNote?.details.pct).toEqual({ value: 0, wasUnset: true, authorised: true })
    expect(authorised.upgradeNote?.seen).toBe(false)
    expect(authorised.upgradeNote?.reopened).toBe(false)
  })
})

describe("write normalization", () => {
  test("cuts labels on save, preserving complete Unicode characters and unknown fields", () => {
    const settings = decodeSettings({ shortcuts: { list: [{ ...shortcut, label: "😀".repeat(41), future: true }] } })
    expect(Array.from(settings.shortcuts.list[0]!.label)).toHaveLength(41)
    expect(roundtrip(normalizeSettingsForWrite(settings).shortcuts.list[0])).toEqual({ ...shortcut, label: "😀".repeat(40), future: true })
    const setup = decodeSetup({ label: { name: "n".repeat(101), handle: "h".repeat(31), avatar: "https://example.test/avatar", future: 1 } })
    expect(roundtrip(normalizeSetupForWrite(setup, context).label)).toEqual({ name: "n".repeat(100), handle: "h".repeat(30), avatar: "https://example.test/avatar", future: 1 })
    const filter = decodeFilter({ channels: [[channel, "t".repeat(101), "h".repeat(31), "future-column"]] })
    expect(roundtrip(normalizeFilterForWrite(filter).channels)).toEqual([[channel, "t".repeat(100), "h".repeat(30), "future-column"]])
    expect(filter.channels[0]?.[1]).toHaveLength(101)
  })
  test("keeps dangling references on read, removes only dangling targets and marks on write", () => {
    const setup = decodeSetup({ label: { name: "Synthetic account" }, autoAdd: [{ pl: playlist, takes: "both" }],
      targets: { save01: "WL", gone01: "PLgone" }, quickSave: "PLquick", musicSave: "PLmusic", gather: "PLgather",
      marks: { [playlist]: "full", WL: "missing", PLgone: "missing", PLquick: "full", PLmusic: "missing", PLgather: "full", PLorphan: "missing" } })
    expect(setup.targets.gone01).toBe("PLgone")
    expect(setup.marks.PLorphan).toBe("missing")
    const cleaned = normalizeSetupForWrite(setup, context)
    expect(cleaned.targets).toEqual({ save01: "WL" })
    expect(cleaned.marks).toEqual({ [playlist]: "full", WL: "missing", PLquick: "full", PLmusic: "missing", PLgather: "full" })
    expect(setup.targets.gone01).toBe("PLgone")
    expect(normalizeSetupForWrite(cleaned, context)).toEqual(cleaned)
  })
  test("keeps marks for caller-resolved shared Watch later choices", () => {
    const setup = decodeSetup({ autoAdd: [{ pl: playlist }], marks: { WL: "missing", PLorphan: "full" } })
    expect(normalizeSetupForWrite(setup, { ...context, additionalChosenPlaylists: new Set(["WL"]) }).marks).toEqual({ WL: "missing" })
    expect(normalizeSetupForWrite(setup, context).marks).toEqual({})
  })
  test("trims a shortcut label without changing the input", () => {
    const settings = decodeSettings({ shortcuts: { list: [{ ...shortcut, label: "  Later  " }] } })
    expect(normalizeSettingsForWrite(settings).shortcuts.list[0]?.label).toBe("Later")
    expect(settings.shortcuts.list[0]?.label).toBe("  Later  ")
  })
  test.each([
    { label: "x".repeat(39) + " rest", saved: "x".repeat(39) },
    { label: "  " + "😀".repeat(39) + "\u2003rest  ", saved: "😀".repeat(39) },
    { label: "  " + "😀".repeat(40) + " rest  ", saved: "😀".repeat(40) }
  ])("truncated shortcut labels stay trimmed and idempotent %p", ({ label, saved }) => {
    const settings = decodeSettings({ shortcuts: { list: [{ ...shortcut, label }] } })
    const written = normalizeSettingsForWrite(settings)
    expect(written.shortcuts.list[0]?.label).toBe(saved)
    expect(normalizeSettingsForWrite(written)).toEqual(written)
    expect(decodeSettings(roundtrip(written))).toEqual(written)
    expect(settings.shortcuts.list[0]?.label).toBe(label)
  })
  test("kept filters and a gather playlist prevent deleting an otherwise empty setup", () => {
    const labelOnly = decodeSetup({ label: { name: "Synthetic account" }, marks: { WL: "full" } })
    expect(isSetupEmpty(labelOnly, false)).toBe(true)
    expect(isSetupEmpty(labelOnly, true)).toBe(false)
    expect(isSetupEmpty(decodeSetup({ gather: "WL" }), false)).toBe(false)
    expect(isSetupEmpty(decodeSetup({ quickSave: "WL" }), false)).toBe(false)
    expect(isSetupEmpty(decodeSetup({ musicSave: "WL" }), false)).toBe(false)
    expect(isSetupEmpty(decodeSetup({ autoAdd: [{ pl: "WL", takes: "videos" }] }), false)).toBe(false)
    expect(isSetupEmpty(decodeSetup({ targets: { save01: "WL" } }), false)).toBe(false)
  })
})

describe("stamps and document versions", () => {
  test("absent and tombstoned documents are distinct without inventing user data", () => {
    expect(decodeDocument(undefined, decodeSettings)).toEqual({ kind: "absent" })
    expect(decodeDocument(null, decodeSettings)).toEqual({ kind: "absent" })
    expect(roundtrip(decodeDocument({ ...stamp, deleted: true, future: 1 }, decodeSettings))).toEqual({ kind: "deleted", document: { ...stamp, deleted: true, future: 1 } })
  })
  test("the envelope and its unknown fields survive an edit and JSON serialization", () => {
    const result = decodeDocument({ ...stamp, futureEnvelope: 1, data: { futureSettings: 2 } }, decodeSettings)
    expect(result.kind).toBe("value")
    if (result.kind !== "value") throw new Error("Expected a readable document")
    const edited = { ...result.document, gen: "next-write", data: { ...result.document.data, theme: "light" } }
    expect(decodeDocument(roundtrip(edited), decodeSettings)).toMatchObject({ kind: "value", document: {
      ...stamp, gen: "next-write", futureEnvelope: 1, data: { theme: "light", futureSettings: 2 }
    } })
  })
  test("a newer version is refused before its incompatible data is decoded", () => {
    const raw = { ...stamp, v: 2, data: "future-incompatible-shape", futureEnvelope: true }
    expect(decodeDocument(raw, decodeSettings)).toEqual({ kind: "newer-version", version: 2, raw })
    expect(decodeDocument({ ...stamp, v: 2, deleted: true }, decodeSettings).kind).toBe("newer-version")
  })
  test.each([
    { ...stamp, at: -1, data: {} }, { ...stamp, v: 0, data: {} }, { ...stamp, v: 1.5, data: {} },
    { ...stamp, gen: "", data: {} }, { ...stamp, by: "", data: {} }, { ...stamp },
    { ...stamp, data: undefined }, { ...stamp, deleted: false, data: {} }
  ])("rejects malformed stamp or body %p", raw => {
    expect(() => decodeDocument(raw, decodeSettings)).toThrow(DecodeError)
  })
})

describe("keys and identifiers", () => {
  test("validates physical keys without imposing recorder or browser-reservation policy on persisted keys", () => {
    const key = { code: "KeyK", char: "k", ctrl: true, alt: true, shift: false, meta: false, future: 1 }
    expect(isKey(key)).toBe(true)
    expect(decodeKey(key)).toEqual(key)
    expect(isKey({ ...key, char: "two" })).toBe(true)
    expect(isKey({ ...key, char: 2 })).toBe(false)
    expect(() => decodeKey({ ...key, char: null })).toThrow(DecodeError)
    expect(isKey({ ...key, code: "ShiftLeft" })).toBe(false)
    expect(isKey({ ...key, code: "Unidentified" })).toBe(false)
    expect(isKey({ ...key, code: "invented" })).toBe(false)
    expect(isKey({ ...key, ctrl: "true" })).toBe(false)
    expect(() => decodeKey({ ...key, code: "" })).toThrow(DecodeError)
  })
  test("account keys are exactly 16 base64url characters; raw identities are never accepted", () => {
    expect(isAccountKey(account)).toBe(true)
    for (const raw of ["a".repeat(15), "a".repeat(17), "raw||identity", "a".repeat(15) + "+", null]) expect(isAccountKey(raw)).toBe(false)
  })
  test("validates ID boundaries without treating a playlist title or URL as an ID", () => {
    expect(isPlaylistId("WL")).toBe(true)
    expect(isPlaylistId(playlist)).toBe(true)
    expect(isPlaylistId("a".repeat(100))).toBe(true)
    expect(isPlaylistId("OLAK5uy_synthetic")).toBe(true)
    for (const raw of ["", "a", "a".repeat(101), "https://youtube.com/playlist?list=PLtest", "my playlist"]) expect(isPlaylistId(raw)).toBe(false)
    expect(isChannelId(channel)).toBe(true)
    expect(isChannelId(`UC${"a".repeat(21)}`)).toBe(false)
    expect(isVideoId("abcdefghijk")).toBe(true)
    expect(isVideoId("abcdefghij")).toBe(false)
    expect(isShortcutId("save01")).toBe(true)
    expect(isShortcutId("save001")).toBe(false)
    expect(isPercent(0)).toBe(true)
    expect(isPercent(100)).toBe(true)
  })
  test("document keys roundtrip only with valid account and playlist components", () => {
    for (const key of ["doc:settings", `doc:setup:${account}`, `doc:filter:${account}:${playlist}`]) {
      const parsed = parseDocumentKey(key)
      expect(parsed).not.toBeNull()
      if (parsed === null) throw new Error("Expected a valid document key")
      expect(documentKey(parsed)).toBe(key)
    }
    for (const key of ["settings", `doc:settings:${account}`, "doc:setup:raw||identity", `doc:setup:${account}:extra`,
      `doc:filter:${account}:`, `doc:filter:${account}:${playlist}:extra`]) expect(parseDocumentKey(key)).toBeNull()
  })
})

test("imports and operates without browser, DOM, clock or randomness access", () => {
  const result = Bun.spawnSync({
    cmd: [process.execPath, "--eval", `
      for (const name of ["window", "document", "browser", "chrome", "localStorage", "fetch", "crypto",
        "navigator", "indexedDB", "MutationObserver", "KeyboardEvent"]) {
        Object.defineProperty(globalThis, name, {
          get() { throw new Error("Unexpected platform access " + name) }, configurable: true
        })
      }
      Date.now = () => { throw new Error("Unexpected clock access") }
      Math.random = () => { throw new Error("Unexpected random access") }
      const model = await import("./index.ts")
      const settings = model.decodeSettings()
      const setup = model.decodeSetup()
      const filter = model.decodeFilter()
      const device = model.decodeDevice(undefined, "synthetic-device")
      model.normalizeSettingsForWrite(settings)
      model.normalizeSetupForWrite(setup, { shortcutIds: new Set() })
      model.normalizeFilterForWrite(filter)
      model.isSetupEmpty(setup, false)
      model.decodeDocument({ v: 1, gen: "synthetic-write", at: 0, by: device.id, data: settings }, model.decodeSettings)
      console.log("pure model operations passed")
    `],
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe"
  })
  expect(result.stderr.toString()).toBe("")
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toBe("pure model operations passed\n")
})
