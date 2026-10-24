import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { decodeDevice, decodeDocument, decodeSettings, defaultDevice } from "../../shared/model"
import type { Key } from "../../shared/model"
import { LEGACY_DELETE_KEYS, UPGRADE_TRIGGER_KEYS } from "./legacy"
import type { LegacyEvidence } from "./legacy"
import { planLegacyStartup } from "./legacy-startup"
import type { CanonicalUpgrade, MigrationContext, StartupPlan, StartupSnapshot } from "./legacy-startup"

const playlist = `PL${"a".repeat(16)}`
const second = `PL${"b".repeat(64)}`
const channel = `UC${"c".repeat(22)}`
const context: MigrationContext = {
  deviceId: "synthetic-device", settingsGen: "synthetic-write", at: 1234, shortcutId: "save01",
  platform: { browser: "firefox", os: "linux" }, commands: []
}
function snapshot(values: LegacyEvidence["values"] = {}, authorised = false): StartupSnapshot {
  return {
    schema: undefined, device: undefined, settingsDocument: undefined, unclaimed: undefined, interimKeysPresent: [],
    legacy: { presentKeys: [...Object.keys(values).filter((key): key is keyof typeof values => key in values), ...(authorised ? ["refreshToken" as const] : [])], values, refreshTokenWasNonempty: authorised }
  }
}
function upgraded(input: StartupSnapshot, supplied = context): Extract<StartupPlan, { kind: "upgrade" }> {
  const plan = planLegacyStartup(input, supplied)
  if (plan.kind !== "upgrade") throw new Error(`Expected upgrade, got ${JSON.stringify(plan)}`)
  return plan
}
function pending(write: CanonicalUpgrade, schema?: 1): StartupSnapshot {
  return { ...snapshot(), schema, device: write.device, settingsDocument: write["doc:settings"], unclaimed: write.unclaimed }
}
function key(char: string, held: Partial<Key> = {}): Key {
  return { char, code: /^[0-9]$/.test(char) ? `Digit${char}` : `Key${char.toUpperCase()}`, ctrl: false, alt: false, shift: false, meta: false, ...held }
}
const expectedDeleteKeys = [
  "playlists", "addToPlaylistID", "watchLaterShortcut", "requiredWatchPercentage", "toastEnabled", "clientID", "clientSecret", "accessToken", "refreshToken",
  "authMode", "authServerURL", "cachedPlaylists", "preventDuplicates", "queueButtonEnabled", "cardContextMenu", "channelFilters", "channelLabels"
] as const

describe("startup classification", () => {
  test("fresh writes only an absent schema, while an existing marker is current", () => {
    expect(planLegacyStartup(snapshot(), context)).toEqual({ kind: "fresh", schema: 1 })
    expect(planLegacyStartup({ ...snapshot(), schema: 1 }, context)).toEqual({ kind: "current" })
  })
  test.each(UPGRADE_TRIGGER_KEYS)("recognizes empty presence of %s even with schema already 1", trigger => {
    const input = snapshot()
    input.schema = 1
    input.legacy.presentKeys = [trigger]
    expect(upgraded(input).cleanup.steps[2]).toEqual({ kind: "schema-last", value: 1, required: false })
  })
  test("developer keys alone never trigger cleanup or a note", () => {
    const input = snapshot({ channelFilters: {}, channelLabels: {} })
    input.legacy.presentKeys = LEGACY_DELETE_KEYS.filter(key => !UPGRADE_TRIGGER_KEYS.some(trigger => trigger === key))
    expect(planLegacyStartup(input, context)).toEqual({ kind: "fresh", schema: 1 })
  })
  test("newer layout returns before reading other evidence or context", () => {
    const input = { ...snapshot({ playlists: [] }), schema: 2 }
    Object.defineProperty(input, "legacy", { get() { throw new Error("must be inert") } })
    const supplied = { ...context }
    Object.defineProperty(supplied, "at", { get() { throw new Error("must be inert") } })
    expect(planLegacyStartup(input, supplied)).toEqual({ kind: "newer-layout", version: 2 })
  })
  test.each([null, "1", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("refuses malformed schema %p", schema => {
    expect(planLegacyStartup({ ...snapshot(), schema }, context)).toEqual({ kind: "invalid", field: "schema" })
  })
  test.each(["account:synthetic_only", "savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"])("refuses interim state %s without conversion", interim => {
    expect(planLegacyStartup({ ...snapshot({ playlists: [playlist] }), interimKeysPresent: [interim] }, context))
      .toEqual({ kind: "unsupported-state", reason: "interim-profile" })
  })
  test("canonical consent, completed note and existing settings are never fresh or overwritten", () => {
    const write = upgraded(snapshot({ playlists: [playlist] })).write
    const done = { ...write.device, upgradeNote: write.device.upgradeNote && { ...write.device.upgradeNote, state: "done" } }
    for (const device of [{ ...defaultDevice("existing"), consent: { v: 1, at: 42 } }, done]) {
      expect(planLegacyStartup({ ...snapshot(), device }, context)).toEqual({ kind: "current" })
      expect(planLegacyStartup({ ...snapshot({ playlists: [] }), device }, context))
        .toEqual({ kind: "unsupported-state", reason: "canonical-collision" })
    }
    expect(planLegacyStartup({ ...snapshot(), settingsDocument: write["doc:settings"] }, context)).toEqual({ kind: "current" })
    expect(planLegacyStartup({ ...snapshot({ playlists: [] }), settingsDocument: write["doc:settings"] }, context))
      .toEqual({ kind: "unsupported-state", reason: "canonical-collision" })
  })
  test.each([
    { deviceId: "" }, { deviceId: "   " }, { settingsGen: "" }, { settingsGen: 1 }, { at: -1 }, { at: 1.5 }, { at: NaN }, { at: Infinity },
    { at: Number.MAX_SAFE_INTEGER + 1 }, { shortcutId: "short" }, { shortcutId: "longer1" }, { shortcutId: "bad!id" },
    { platform: { browser: "other", os: "linux" } }, { platform: { browser: "firefox", os: "other" } },
    { commands: [{ key: { code: "invalid" }, command: "synthetic" }] }, { commands: [{ key: key("k"), command: "" }] }
  ])("validates supplied context %p without echoing values", supplied => {
    const plan = planLegacyStartup(snapshot({ playlists: [] }), { ...context, ...supplied } as MigrationContext)
    expect(plan.kind).toBe("invalid")
    expect(Object.keys(plan).sort()).toEqual(["field", "kind"])
  })
  test("accepts canonical identity and time boundaries deterministically", () => {
    for (const at of [0, Number.MAX_SAFE_INTEGER]) {
      const plan = upgraded(snapshot({ playlists: [] }), { ...context, at, shortcutId: "_-1234" })
      expect(plan.write["doc:settings"].at).toBe(at)
    }
  })
  test.each([null, [], { id: "" }, { id: "existing", syncOn: "true" }, { id: "existing", consent: { v: 1, at: -1 } }].map(device => ({ device })))("refuses malformed device %p", ({ device }) => {
    expect(planLegacyStartup({ ...snapshot({ playlists: [] }), device }, context)).toEqual({ kind: "invalid", field: "device" })
  })
  test("rejects credential fields at the sanitized values boundary", () => {
    const input = snapshot({ playlists: [] })
    Object.assign(input.legacy.values, { accessToken: true })
    expect(planLegacyStartup(input, context)).toEqual({ kind: "invalid", field: "legacy" })
    expect(planLegacyStartup({ ...input, legacy: { ...snapshot().legacy, refreshTokenWasNonempty: true } }, context))
      .toEqual({ kind: "invalid", field: "legacy" })
  })
})

describe("canonical conversion", () => {
  test("S1 produces complete canonical documents with stored choices and inert R96/R97 defaults", () => {
    const input = snapshot({ playlists: [` https://www.youtube.com/playlist?list=${playlist}&index=2 `, "PLhalf"], addToPlaylistID: playlist, watchLaterShortcut: "Shift+S" })
    const plan = upgraded(input)
    expect(plan.write).toEqual({
      "doc:settings": { v: 1, gen: "synthetic-write", at: 1234, by: "synthetic-device", data: {
        theme: "system", undoKey: key("u", { alt: true }),
        autoAdd: { on: true, feedback: false, pct: 50, toolbarTick: true, toolbarPaused: true },
        shortcuts: { on: true, feedback: false, music: true, preset: true, picker: key("p", { alt: true, shift: true }),
          list: [{ id: "save01", key: key("s", { shift: true }), label: "", watchLaterOnEveryAccount: false }] },
        quickSave: { on: false, feedback: true, shortsShelves: false }, queueButton: { on: false, feedback: true },
        watchButton: { on: false, feedback: true, shorts: false }, cardMenu: { on: false, keepLinkMenu: false },
        browserMenu: { on: false, feedback: true }, musicSection: true,
        musicActions: { on: false, feedback: true, preset: false, buttons: { next: true, queue: true, save: false, like: false, remove: false, bar: false, library: false, mix: false, album: false, artist: false } },
        musicKeys: { on: false, feedback: true, preset: false, keys: { next: null, queue: null, save: null, picker: null, like: null, remove: null, library: null, mix: null, album: null, artist: null } },
        anyTabKeys: { on: false, feedback: true },
        gather: { on: false, feedback: true, to: "player", order: "newest", close: false, auto: { unvisited: false, after: "1d", background: false, count: false, n: 10 } }
      } },
      device: { id: "synthetic-device", consent: null, syncOn: false,
        upgradeNote: { state: "pending", opened: false, seen: false, reopened: false, details: {
          from: "1.4.5", autoAdd: { kept: 1, dropped: 1 }, pct: { value: 50, wasUnset: true, authorised: false }, feedback: false,
          shortcut: { raw: "Shift+S", key: key("s", { shift: true }), playlist: true, note: "ok" }, credentialsDeleted: false
        } }, claimNotice: null, lastAccount: null, newPlaylistVisibility: null, pickerSortAZ: false, detailedLog: false, recentAdds: true, legacyCleared: false },
      unclaimed: { from: "1.4.5", autoAdd: [playlist], shortcutPlaylist: playlist, filters: {}, at: 1234 }
    })
    expect(decodeDocument(plan.write["doc:settings"], decodeSettings)).toEqual({ kind: "value", document: plan.write["doc:settings"] })
    expect(decodeDevice(plan.write.device)).toEqual(plan.write.device)
    expect(Object.keys(plan.write).sort()).toEqual(["device", "doc:settings", "unclaimed"])
  })
  test("S13 preserves authorization evidence before credential deletion", () => {
    const plan = upgraded(snapshot({ playlists: [playlist] }, true))
    expect(plan.write["doc:settings"].data.autoAdd.pct).toBe(0)
    expect(plan.write.device.upgradeNote?.details.pct).toEqual({ value: 0, wasUnset: true, authorised: true })
    expect(plan.write.device.upgradeNote?.details.credentialsDeleted).toBe(true)
  })
  test("S2 carries the set percentage, feedback and Ctrl key using credential names alone", () => {
    const input = snapshot({ playlists: [playlist], addToPlaylistID: playlist, watchLaterShortcut: "Control+Shift+S", requiredWatchPercentage: "75", toastEnabled: true })
    input.legacy.presentKeys = [...input.legacy.presentKeys, "clientID", "clientSecret"]
    const { write } = upgraded(input)
    expect(write["doc:settings"].data.autoAdd).toEqual({ on: true, feedback: true, pct: 75, toolbarTick: true, toolbarPaused: true })
    expect(write.device.upgradeNote?.details).toEqual({
      from: "1.4.5", autoAdd: { kept: 1, dropped: 0 }, pct: { value: 75, wasUnset: false, authorised: false }, feedback: true,
      shortcut: { raw: "Control+Shift+S", key: key("s", { ctrl: true, shift: true }), playlist: true, note: "ctrl-never-fired" }, credentialsDeleted: true
    })
  })
  test.each([undefined, "", "  ", "nonnumeric", "75watts", "1.2.3", NaN, Infinity, -Infinity, {}, [], null, true].map(raw => ({ raw })))("unset percentage %p follows each R96 branch", ({ raw }) => {
    for (const authorised of [false, true]) {
      const plan = upgraded(snapshot({ requiredWatchPercentage: raw }, authorised))
      expect(plan.write.device.upgradeNote?.details.pct).toEqual({ value: authorised ? 0 : 50, wasUnset: true, authorised })
    }
  })
  test.each([{ raw: 0, value: 0 }, { raw: "0", value: 0 }, { raw: 75, value: 75 }, { raw: "75", value: 75 },
    { raw: 74.5, value: 75 }, { raw: " 74.4 ", value: 74 }, { raw: -2, value: 0 }, { raw: "102", value: 100 }, { raw: "1e2", value: 100 }])("set percentage $raw becomes $value under both authorization branches", ({ raw, value }) => {
    for (const authorised of [false, true]) expect(upgraded(snapshot({ requiredWatchPercentage: raw }, authorised)).write.device.upgradeNote?.details.pct)
      .toEqual({ value, wasUnset: false, authorised })
  })
  test.each([undefined, false, "true", 1, true])("feedback %p uses literal true only", toastEnabled => {
    const { write } = upgraded(snapshot({ toastEnabled }))
    expect(write["doc:settings"].data.autoAdd.feedback).toBe(toastEnabled === true)
    expect(write["doc:settings"].data.shortcuts.feedback).toBe(toastEnabled === true)
    expect(write.device.upgradeNote?.details.feedback).toBe(toastEnabled === true)
  })
  test("playlist cleanup preserves exact order, boundaries and dropped count", () => {
    const entries = ["", "  ", `?x=1&list=${second}&z=2`, playlist, ` ${playlist} `, "bad", `PL${"x".repeat(15)}`, `PL${"x".repeat(65)}`, "WL", `?list=${playlist}`, "?list=%ZZ", `?list=%50%4C${"a".repeat(16)}`]
    const { write } = upgraded(snapshot({ playlists: entries, addToPlaylistID: `?list=${second}&next=1` }))
    expect(write.unclaimed.autoAdd).toEqual([second, playlist])
    expect(write.unclaimed.shortcutPlaylist).toBe(second)
    expect(write.device.upgradeNote?.details.autoAdd).toEqual({ kept: 2, dropped: 5 })
  })
  test.each([{ playlists: "bad" }, { playlists: null }, { playlists: [1] }, { addToPlaylistID: 1 }, { watchLaterShortcut: [] },
    { channelFilters: null }, { channelLabels: null }, { channelFilters: { [playlist]: { mode: "allow", enabled: true, channels: ["not-a-channel"] } } },
    { channelFilters: { [playlist]: { mode: "off", enabled: true, channels: [] } } },
    { channelFilters: { [playlist]: { mode: "allow", enabled: "true", channels: [] } } },
    { channelFilters: { [playlist]: { mode: "allow", enabled: true } } },
    { channelFilters: { "bad key": { mode: "allow", enabled: true, channels: [] } } }
  ])("refuses malformed semantics without cleanup %p", values => {
    expect(planLegacyStartup(snapshot({ playlists: [], ...values }), context)).toEqual({ kind: "invalid", field: "legacy" })
  })
  test("kept, orphaned and off filters embed labels without applying the PL free-text restriction", () => {
    const { write } = upgraded(snapshot({ playlists: [], channelFilters: {
      WL: { mode: "allow", enabled: false, channels: [channel] },
      RDsynthetic: { mode: "deny", enabled: true, channels: [channel, `UC${"d".repeat(22)}`] }
    }, channelLabels: { [channel]: { title: "😀".repeat(101), handle: "é".repeat(31) } } }))
    expect(write.unclaimed.filters).toEqual({
      WL: { mode: "allow", on: false, channels: [[channel, "😀".repeat(100), "é".repeat(30)]] },
      RDsynthetic: { mode: "deny", on: true, channels: [[channel, "😀".repeat(100), "é".repeat(30)], [`UC${"d".repeat(22)}`, ""]] }
    })
    expect(write.unclaimed.autoAdd).toEqual([])
    expect(write.unclaimed.from).toBe("1.5.0")
  })
  test("unknown optional display labels use empty titles and omit handles", () => {
    const { write } = upgraded(snapshot({ playlists: [], channelFilters: { WL: { mode: "deny", enabled: false, channels: [channel] } }, channelLabels: { [channel]: { title: 5, handle: null } } }))
    expect(write.unclaimed.filters.WL?.channels).toEqual([[channel, ""]])
  })
  test("observed developer keys determine provenance and credential existence determines the deletion detail", () => {
    const input = snapshot({ playlists: [] })
    input.legacy.presentKeys = ["playlists", "queueButtonEnabled", "accessToken"]
    const { write } = upgraded(input)
    expect(write.unclaimed.from).toBe("1.5.0")
    expect(write.device.upgradeNote?.details.from).toBe("1.5.0")
    expect(write.device.upgradeNote?.details.credentialsDeleted).toBe(true)
    expect(write.device.upgradeNote?.details.pct.authorised).toBe(false)
    expect(write["doc:settings"].data.queueButton.on).toBe(false)
  })
})

describe("legacy shortcuts", () => {
  test.each([
    { raw: "", target: false, note: "none", converted: null }, { raw: "", target: true, note: "no-key", converted: null },
    { raw: "!", target: true, note: "unconvertible", converted: null },
    { raw: "Alt+W", target: false, note: "no-playlist", converted: key("w", { alt: true }) },
    { raw: "Control+K", target: true, note: "ctrl-never-fired", converted: key("k", { ctrl: true }) },
    { raw: "K", target: true, note: "ok", converted: key("k") }
  ])("ordered reason $note retains only the carried shortcut", ({ raw, target, note, converted }) => {
    const { write } = upgraded(snapshot({ watchLaterShortcut: raw, addToPlaylistID: target ? playlist : "" }))
    expect(write.device.upgradeNote?.details.shortcut).toMatchObject({ raw, key: converted, playlist: target, note })
    expect(write["doc:settings"].data.shortcuts.list).toEqual(note === "none" ? [] : [{ id: "save01", key: converted, label: "", watchLaterOnEveryAccount: false }])
    expect(write["doc:settings"].data.shortcuts.on).toBe(target && converted !== null)
    expect(write.unclaimed.shortcutPlaylist).toBe(target ? playlist : null)
    expect(write["doc:settings"].data.shortcuts.preset).toBe(true)
  })
  test.each(["Tab", "Escape", "ESCAPE", "Control", "Alt+Shift", "Enter", "SPACE", " ", "Control+Alt+K", "Alt+Control+K", "Control+;", "F13", "Unknown+K", "Alt+", "+", "é"])("retains unusable raw shortcut %s with a null key", raw => {
    const { write } = upgraded(snapshot({ watchLaterShortcut: raw }))
    expect(write.device.upgradeNote?.details.shortcut).toEqual({ raw, key: null, playlist: false, note: "unconvertible" })
    expect(write["doc:settings"].data.shortcuts.list[0]?.key).toBeNull()
  })
  test.each([
    { raw: "Control+Shift+Control+Meta+Shift+7", converted: key("7", { ctrl: true, shift: true, meta: true }) },
    { raw: "Control+T", converted: key("t", { ctrl: true }) },
    { raw: "Alt+ARROWUP", converted: { code: "ArrowUp", ctrl: false, alt: true, shift: false, meta: false } },
    ...["Home", "End", "PageDown", "PageUp", "Delete", "Insert", "Backspace", "F1", "F12", "MediaPlayPause", "AudioVolumeUp"].map(code => ({ raw: code.toUpperCase(), converted: { code, ctrl: false, alt: false, shift: false, meta: false } })),
    { raw: "Shift+Enter", converted: { code: "Enter", ctrl: false, alt: false, shift: true, meta: false } },
    { raw: "Alt+SPACE", converted: { code: "Space", ctrl: false, alt: true, shift: false, meta: false } },
    { raw: "Control+ ", converted: { code: "Space", ctrl: true, alt: false, shift: false, meta: false } }
  ])("converts $raw independently of recorder reservation policy", ({ raw, converted }) => {
    expect(upgraded(snapshot({ watchLaterShortcut: raw })).write["doc:settings"].data.shortcuts.list[0]?.key).toEqual(converted)
  })
  test("canonical overlap clears colliding picker or Undo presets, without adding Watch Later", () => {
    const picker = upgraded(snapshot({ watchLaterShortcut: "Shift+Alt+P" })).write["doc:settings"].data
    expect(picker.shortcuts.picker).toBeNull()
    expect(picker.undoKey).toEqual(key("u", { alt: true }))
    const undo = upgraded(snapshot({ watchLaterShortcut: "Alt+U" })).write["doc:settings"].data
    expect(undo.undoKey).toBeNull()
    expect(undo.shortcuts.picker).toEqual(key("p", { alt: true, shift: true }))
    const empty = upgraded(snapshot({ playlists: [] })).write["doc:settings"].data
    expect(empty.shortcuts.list).toEqual([])
    expect(empty.shortcuts.picker).toEqual(key("p", { alt: true, shift: true }))
  })
  test("warning IDs are deterministic metadata for actual canonical warnings", () => {
    expect(upgraded(snapshot({ watchLaterShortcut: "K" })).write.device.upgradeNote?.details.shortcut.clash).toBe("site:www:play-pause")
    expect(upgraded(snapshot({ watchLaterShortcut: "Control+S" })).write.device.upgradeNote?.details.shortcut.clash).toBe("browser:save-page")
    const supplied = { ...context, commands: [{ key: key("x", { alt: true }), command: "synthetic-save" }] }
    expect(upgraded(snapshot({ watchLaterShortcut: "Alt+X" }), supplied).write.device.upgradeNote?.details.shortcut.clash).toBe("command:synthetic-save")
  })
})

describe("durable restart planning", () => {
  test("cleanup encodes the approved batch, awaited sibling work, and schema-last order", () => {
    expect(upgraded(snapshot({ playlists: [] })).cleanup).toEqual({ steps: [
      { kind: "local-remove", keys: expectedDeleteKeys },
      { kind: "await-cleanup", database: "yt-playlist-tools", sessionKeys: ["channelCache"] },
      { kind: "schema-last", value: 1, required: true }
    ] })
  })
  test("pending with no legacy keys resumes without a replacement payload or input mutation", () => {
    const write = upgraded(snapshot({ playlists: [playlist], watchLaterShortcut: "Alt+W" }, true)).write
    const original = pending(write)
    const input = {
      ...original,
      settingsDocument: { ...write["doc:settings"], futureEnvelope: [1, 2], data: { ...write["doc:settings"].data, futureBody: { keep: true } } },
      device: { ...write.device, futureDevice: 1, upgradeNote: { ...write.device.upgradeNote, opened: true, seen: true, reopened: true, futureNote: "kept" } },
      unclaimed: { ...write.unclaimed, futureUnclaimed: true, filters: { WL: { mode: "allow", on: false, channels: [[channel, "Long title", null, { futureColumn: true }]], futureFilter: [1] } } }
    }
    const before = structuredClone(input)
    const result = planLegacyStartup(input, { ...context, at: 9999, deviceId: "new-device", settingsGen: "new-gen", shortcutId: "other1" })
    expect(result.kind).toBe("resume")
    expect(Object.keys(result).sort()).toEqual(["cleanup", "kind"])
    expect(input).toEqual(before)
    expect(planLegacyStartup(input, context)).toEqual(result)
  })
  test.each(["settingsDocument", "unclaimed", "device"] as const)("a torn canonical batch missing %s never authorizes cleanup", missing => {
    const write = upgraded(snapshot({ playlists: [playlist] })).write
    const input = { ...pending(write), [missing]: undefined, legacy: snapshot({ playlists: [playlist] }).legacy }
    const result = planLegacyStartup(input, context)
    expect(["invalid", "unsupported-state"]).toContain(result.kind)
    expect("cleanup" in result).toBe(false)
  })
  test("mismatched pending provenance refuses cleanup", () => {
    const write = upgraded(snapshot({ playlists: [playlist] })).write
    expect(planLegacyStartup({ ...pending(write), unclaimed: { ...write.unclaimed, from: "1.5.0" } }, context))
      .toEqual({ kind: "unsupported-state", reason: "canonical-collision" })
  })
  test("pending recovery preserves a valid subsequent shared-settings edit with its own stamp", () => {
    const write = upgraded(snapshot({ playlists: [playlist] })).write
    const input = { ...pending(write), settingsDocument: { ...write["doc:settings"], gen: "later-edit", at: 9999, by: "other-device", data: { ...write["doc:settings"].data, theme: "dark" } } }
    const before = structuredClone(input)
    expect(planLegacyStartup(input, context).kind).toBe("resume")
    expect(input).toEqual(before)
  })
  test("a failed simulated canonical set leaves every old key and schema untouched", async () => {
    const input = snapshot({ playlists: [playlist], watchLaterShortcut: "Alt+W" }, true)
    for (const schema of [undefined, 1]) {
      const durable = { ...input, schema }
      const before = structuredClone(durable)
      const plan = planLegacyStartup(durable, context)
      expect(plan.kind).toBe("upgrade")
      const operations: string[] = []
      async function execute(): Promise<void> {
        if (plan.kind !== "upgrade") throw new Error("Expected upgrade")
        operations.push("local-set")
        await Promise.reject(new Error("synthetic set failure"))
        Object.assign(durable, pending(plan.write, 1))
        operations.push(...plan.cleanup.steps.map(step => step.kind))
      }
      await expect(execute()).rejects.toThrow("synthetic set failure")
      expect(operations).toEqual(["local-set"])
      expect(durable).toEqual(before)
      expect(planLegacyStartup(structuredClone(durable), context)).toEqual(plan)
    }
  })
  test.each([
    { opened: false, seen: false, reopened: false }, { opened: true, seen: false, reopened: false },
    { opened: true, seen: true, reopened: false }, { opened: true, seen: false, reopened: true },
    { opened: true, seen: true, reopened: true }
  ])("resume never resets R97 flags %p", flags => {
    const write = upgraded(snapshot({ playlists: [playlist] }, true)).write
    const input = pending(write, 1)
    input.device = { ...write.device, upgradeNote: { ...write.device.upgradeNote, ...flags } }
    const before = structuredClone(input)
    expect(planLegacyStartup(input, context).kind).toBe("resume")
    expect(input).toEqual(before)
  })
  for (const schema of [undefined, 1] as const) {
    for (let boundary = 0; boundary <= 6; boundary++) {
      test(`crash boundary ${boundary} with initial schema ${schema ?? "absent"} converges from durable state`, () => {
        const input = snapshot({ playlists: [playlist, "broken"], watchLaterShortcut: "Alt+W", toastEnabled: true }, true)
        input.schema = schema
        const initial = upgraded(input)
        const local: Record<string, unknown> = { unrelated: { preserved: true } }
        if (schema !== undefined) local.schema = schema
        for (const name of input.legacy.presentKeys) local[name] = input.legacy.values[name as keyof typeof input.legacy.values] ?? true
        const durable: { local: Record<string, unknown>; databasePresent: boolean; session: Record<string, boolean>; sync: { theme: string; unrelated: number[] } } =
          { local, databasePresent: true, session: { channelCache: true, unrelated: true }, sync: { theme: "dark", unrelated: [1, 2] } }
        const syncBefore = structuredClone(durable.sync)
        if (boundary >= 1) Object.assign(durable.local, structuredClone(initial.write))
        if (boundary >= 2) for (const name of initial.cleanup.steps[0].keys) delete durable.local[name]
        if (boundary >= 3) durable.databasePresent = false
        if (boundary >= 4) delete durable.session.channelCache
        if (boundary >= 6 && initial.cleanup.steps[2].required) durable.local.schema = 1
        const serialized = JSON.stringify(durable)

        const restarted: typeof durable = JSON.parse(serialized)
        const observed = LEGACY_DELETE_KEYS.filter(name => Object.hasOwn(restarted.local, name))
        const values: LegacyEvidence["values"] = {}
        for (const name of ["playlists", "watchLaterShortcut", "toastEnabled"] as const) if (observed.includes(name)) values[name] = restarted.local[name]
        const read: StartupSnapshot = {
          schema: restarted.local.schema, device: restarted.local.device, settingsDocument: restarted.local["doc:settings"], unclaimed: restarted.local.unclaimed,
          interimKeysPresent: [], legacy: { presentKeys: observed, values, refreshTokenWasNonempty: observed.includes("refreshToken") }
        }
        const plan = planLegacyStartup(read, { ...context, at: 5678, settingsGen: "restart-gen", deviceId: "restart-device", shortcutId: "again1" })
        if (boundary === 0) expect(plan.kind).toBe("upgrade")
        else {
          expect(plan.kind).toBe("resume")
          expect("write" in plan).toBe(false)
          expect(restarted.local["doc:settings"]).toEqual(initial.write["doc:settings"])
          expect(restarted.local.device).toEqual(initial.write.device)
          expect(restarted.local.unclaimed).toEqual(initial.write.unclaimed)
        }
        if (plan.kind !== "upgrade" && plan.kind !== "resume") throw new Error("Missing cleanup")
        if (plan.kind === "upgrade") Object.assign(restarted.local, plan.write)
        for (const name of plan.cleanup.steps[0].keys) delete restarted.local[name]
        restarted.databasePresent = false
        delete restarted.session.channelCache
        if (plan.cleanup.steps[2].required) restarted.local.schema = plan.cleanup.steps[2].value
        expect(LEGACY_DELETE_KEYS.some(name => Object.hasOwn(restarted.local, name))).toBe(false)
        expect(restarted.databasePresent).toBe(false)
        expect(restarted.session).toEqual({ unrelated: true })
        expect(restarted.local.schema).toBe(1)
        expect(restarted.local.unrelated).toEqual({ preserved: true })
        expect(restarted.sync).toEqual(syncBefore)
      })
    }
  }
  test("repeat conversion is deterministic and never mutates frozen input", () => {
    const input = snapshot({ playlists: [playlist], channelFilters: { WL: { mode: "allow", enabled: false, channels: [channel] } } })
    const before = structuredClone(input)
    function freeze(value: unknown): void {
      if (value !== null && typeof value === "object") {
        Object.freeze(value)
        for (const child of Object.values(value)) freeze(child)
      }
    }
    freeze(input)
    const first = planLegacyStartup(input, context)
    expect(planLegacyStartup(input, context)).toEqual(first)
    expect(input).toEqual(before)
  })
})

test("the actual minified public module imports and runs without browser, DOM, time, random or environment access", async () => {
  const entrypoint = resolve(import.meta.dir, "legacy-startup.ts")
  const visited = new Set<string>()
  async function inspect(file: string): Promise<void> {
    if (visited.has(file)) return
    visited.add(file)
    const source = await readFile(file, "utf8")
    for (const imported of new Bun.Transpiler({ loader: "ts" }).scanImports(source)) {
      expect(imported.path.startsWith(".")).toBe(true)
      const base = resolve(dirname(file), imported.path)
      const resolved = await Bun.file(`${base}.ts`).exists() ? `${base}.ts` : resolve(base, "index.ts")
      await inspect(resolved)
    }
  }
  await inspect(entrypoint)
  expect(visited.size).toBeGreaterThan(10)
  const program = ts.createProgram([...visited], { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: [] })
  const checker = program.getTypeChecker()
  const forbidden = new Set(["Date", "performance", "crypto", "process", "Bun", "Deno", "browser", "chrome", "window", "document", "navigator", "indexedDB", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest"])
  for (const file of visited) {
    const source = program.getSourceFile(file)
    if (!source) throw new Error("Missing import graph source")
    function check(node: ts.Node): void {
      if (ts.isTypeNode(node) || ts.isImportDeclaration(node)) return
      if (ts.isIdentifier(node) && forbidden.has(node.text)) {
        const property = (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
          (ts.isPropertyAssignment(node.parent) && node.parent.name === node)
        if (!property) {
          const declarations = checker.getSymbolAtLocation(node)?.declarations ?? []
          expect(declarations.some(declaration => visited.has(declaration.getSourceFile().fileName)), `${file} reads ambient ${node.text}`).toBe(true)
        }
      }
      if (ts.isPropertyAccessExpression(node)) {
        expect(node.getText(source)).not.toMatch(/^(?:Math\.random|import\.meta\.env|globalThis\.(?:Date|performance|crypto|process|Bun|Deno|browser|chrome|window|document|navigator|indexedDB|localStorage|sessionStorage|fetch|XMLHttpRequest))(?:\.|$)/)
      }
      ts.forEachChild(node, check)
    }
    check(source)
  }
  const result = await Bun.build({ entrypoints: [entrypoint], target: "browser", format: "cjs", minify: true })
  expect(result.success).toBe(true)
  const artifact = await result.outputs[0]!.text()
  expect(artifact.length).toBeGreaterThan(1000)
  const guards = `
    const fail = () => { throw Error("Forbidden ambient effect"); };
    for (const name of ["browser","chrome","window","document","navigator","indexedDB","localStorage","sessionStorage","fetch","XMLHttpRequest","Date","performance","crypto","process","Bun","Deno"]) {
      Object.defineProperty(globalThis, name, { get: fail });
    }
    Object.defineProperty(Math, "random", { get: fail });
  `
  const run = (input: StartupSnapshot) => JSON.parse(runInNewContext(
    guards + artifact + `;JSON.stringify({exports:Object.keys(module.exports),plan:module.exports.planLegacyStartup(JSON.parse(inputJSON),JSON.parse(contextJSON))})`,
    { module: { exports: {} }, inputJSON: JSON.stringify(input), contextJSON: JSON.stringify(context) }
  ))
  const input = snapshot({ playlists: [playlist], watchLaterShortcut: "Alt+W" }, true)
  expect(run(input)).toEqual({ exports: ["planLegacyStartup"], plan: upgraded(input) })
  expect(run(pending(upgraded(input).write)).plan.kind).toBe("resume")
  expect(run({ ...snapshot(), schema: 2 }).plan).toEqual({ kind: "newer-layout", version: 2 })
})
