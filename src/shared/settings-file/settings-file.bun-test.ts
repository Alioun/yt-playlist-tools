import { describe, expect, test } from "bun:test"
import { decodeDocument, decodeFilter, decodeSettings, decodeSetup, defaultSettings, defaultSetup, isShortcutId, isChannelId } from "../model"
import { createImportPlanner, exportBlob, exportFile } from "."
import { accountA, accountB, canonicalSource, expectedPlanText, expectedText, fixture, freeze, playlist, record, unrelatedAccount } from "../../../tools/fixtures/settings-file/specimens"

function shortcut(value: string) { if (!isShortcutId(value)) throw Error("fixture-shortcut"); return value }
function channel(value: string) { if (!isChannelId(value)) throw Error("fixture-channel"); return value }

const normal = createImportPlanner("normal")
const exportInput = () => ({ source: canonicalSource(), version: "2.0.0-rc.1+fixture", date: "2026-10-29" })
const invalid = { kind: "refused", reason: "invalid-file", copy: "DATA-55.invalid-file" } as const

test("export includes every supported field and kept filter in exact deterministic file bytes", () => {
  const input = freeze(exportInput())
  const before = JSON.stringify(input)
  const result = exportFile(input)
  expect(result.kind).toBe("exported")
  if (result.kind !== "exported") throw new Error("export-refused")
  expect(result.file).toEqual({ filename: "perchling-settings-2026-10-29.json", mime: "application/json", text: expectedText })
  expect(result.file.text.endsWith("\n") && !result.file.text.endsWith("\n\n")).toBe(true)
  expect(JSON.stringify(input)).toBe(before)
  expect(exportFile(input)).toEqual(result)
})

test("export excludes every device field and every non-settings storage area before consent", () => {
  const input = exportInput()
  const forbidden = {
    device: { id: "device-marker", consent: { v: 1, at: 17 }, syncOn: true, upgradeNote: "upgrade-marker",
      claimNotice: "claim-marker", lastAccount: accountA, newPlaylistVisibility: "PUBLIC", pickerSortAZ: true,
      detailedLog: true, recentAdds: true, legacyCleared: true },
    consent: null, sync: "sync-marker", cache: "cache-marker", progress: "progress-marker", session: "session-marker",
    unclaimed: "unclaimed-marker", arbitrary: "arbitrary-marker"
  }
  Object.assign(input.source, forbidden)
  if (input.source.settings.kind !== "value") throw new Error("fixture-settings")
  Object.assign(input.source.settings.document.data, forbidden)
  Object.assign(input.source.settings.document.data.autoAdd, forbidden)
  for (const entry of input.source.accounts) {
    if (entry.setup.kind === "value") Object.assign(entry.setup.document.data, forbidden)
    for (const filter of entry.filters) if (filter.document.kind === "value") Object.assign(filter.document.document.data, forbidden)
  }
  const before = JSON.stringify(input)
  const result = exportFile(freeze(input))
  expect(result.kind).toBe("exported")
  if (result.kind !== "exported") throw new Error("export-refused")
  expect(result.file.text).toBe(expectedText)
  expect(JSON.stringify(input)).toBe(before)
})

test("page-owned Blob contains the file bytes and MIME without storage or download APIs", async () => {
  const result = exportFile(exportInput())
  if (result.kind !== "exported") throw new Error("export-refused")
  const blob = exportBlob(result.file)
  expect(blob.type).toBe("application/json")
  expect(await blob.text()).toBe(expectedText)
  expect(blob.size).toBe(new TextEncoder().encode(expectedText).length)
})

test("import plans exact account replacements and keeps absent unrelated accounts", () => {
  const result = normal.importFile(expectedText)
  expect(fixture(expectedPlanText)).toEqual(result)
  if (result.kind !== "import-plan") throw new Error("plan-refused")
  expect(result.accountCount).toBe(2)
  expect(result.accounts.map(entry => entry.account)).toEqual([accountA, accountB])
  expect(result.accounts.some(entry => entry.account === unrelatedAccount)).toBe(false)
  expect(result.replacement).toEqual({ sharedSettings: "replace", includedAccounts: "replace-setup-and-all-filters", absentAccounts: "keep" })
  expect(result.provenance).toBe("fresh-edit-required")
  expect(Object.keys(result).sort()).toEqual(["accountCount", "accounts", "header", "kind", "provenance", "replacement", "settings"])
})

test("round trip retains a live filter even when its account has no chosen playlists", () => {
  const exported = exportFile(exportInput())
  if (exported.kind !== "exported") throw new Error("export-refused")
  const plan = normal.importFile(exported.file.text)
  expect(fixture(expectedPlanText)).toEqual(plan)
  if (plan.kind !== "import-plan") throw new Error("plan-refused")
  expect(plan.accounts[1]?.filters).toEqual([{ playlist: playlist("PL_ONLY_KEPT"), filter: { mode: "allow", on: false, channels: [] } }])
})

test("private import refuses before parsing and file privacy claims cannot override context", () => {
  const privatePlanner = createImportPlanner("private")
  const refusal = { kind: "refused", reason: "private", copy: "DATA-54.private" } as const
  expect(privatePlanner.importFile(expectedText)).toEqual(refusal)
  expect(privatePlanner.importFile("not JSON")).toEqual(refusal)
  expect(privatePlanner.importFile(JSON.stringify({ ...fixture(), incognito: false, privacy: "normal" }))).toEqual(refusal)
  expect(createImportPlanner("unavailable").importFile(expectedText)).toEqual({ kind: "refused", reason: "privacy-unavailable", copy: "DATA-54.private" })
  expect(normal.importFile(JSON.stringify({ ...fixture(), incognito: false }))).toEqual(invalid)
})

test("newer valid format has its distinct refusal even with unfamiliar data", () => {
  expect(normal.importFile(JSON.stringify({ format: 2, product: "Perchling", version: "99.0.0", date: "2026-10-29", futureData: true })))
    .toEqual({ kind: "refused", reason: "newer-format", copy: "DATA-55.newer-format" })
})

test("newer format with current-shaped data is still refused", () => {
  expect(normal.importFile(expectedText.replace('"format": 1,', '"format": 2,')))
    .toEqual({ kind: "refused", reason: "newer-format", copy: "DATA-55.newer-format" })
})

describe("invalid files do not become canonical defaults", () => {
  const changes: [string, (raw: Record<string, unknown>) => void][] = [
    ["missing settings", raw => { delete raw.settings }],
    ["partial settings", raw => { raw.settings = {} }],
    ["missing autoAdd feedback", raw => { delete record(record(raw.settings).autoAdd).feedback }],
    ["missing music key", raw => { delete record(record(record(raw.settings).musicKeys).keys).artist }],
    ["missing gather count", raw => { delete record(record(record(raw.settings).gather).auto).count }],
    ["null settings", raw => { raw.settings = null }],
    ["wrong product", raw => { raw.product = "Other" }],
    ["missing version", raw => { delete raw.version }],
    ["bad version", raw => { raw.version = "not-a-version" }],
    ["numeric version", raw => { raw.version = 2 }],
    ["format string", raw => { raw.format = "1" }],
    ["format zero", raw => { raw.format = 0 }],
    ["format fractional", raw => { raw.format = 1.5 }],
    ["format null", raw => { raw.format = null }],
    ["missing format", raw => { delete raw.format }],
    ["invalid date", raw => { raw.date = "2026-02-29" }],
    ["environment date", raw => { raw.date = "2026-10-29T00:00:00Z" }],
    ["unknown header", raw => { raw.device = {} }],
    ["unknown settings field", raw => { record(raw.settings).device = {} }],
    ["out of range percentage", raw => { record(record(raw.settings).autoAdd).pct = 101 }],
    ["invented physical key", raw => { record(record(raw.settings).undoKey).code = "InventedKey" }],
    ["missing key modifier", raw => { delete record(record(raw.settings).undoKey).ctrl }],
    ["duplicate shortcut identities", raw => {
      const shortcuts = record(record(raw.settings).shortcuts)
      if (!Array.isArray(shortcuts.list)) throw new Error("fixture-list")
      shortcuts.list = [shortcuts.list[0], shortcuts.list[0]]
    }],
    ["invalid gather count", raw => { record(record(record(raw.settings).gather).auto).n = 7 }],
    ["bad account identity", raw => { raw.accounts = { invalid: {} } }],
    ["account array", raw => { raw.accounts = [] }],
    ["missing setup", raw => { delete record(record(raw.accounts)[accountA]).setup }],
    ["partial setup", raw => { record(record(raw.accounts)[accountA]).setup = {} }],
    ["bad playlist identity", raw => { record(record(raw.accounts)[accountA]).filters = { "bad:id": { mode: "deny", on: false, channels: [] } } }],
    ["bad destination identity", raw => { record(record(record(raw.accounts)[accountA]).setup).quickSave = "bad:id" }],
    ["bad shortcut identity", raw => { record(record(record(raw.accounts)[accountA]).setup).targets = { "bad:id": "PL_TARGET" } }],
    ["partial filter", raw => { record(record(record(raw.accounts)[accountA]).filters).PL_KEPT = { mode: "deny", channels: [] } }],
    ["bad channel identity", raw => { record(record(record(raw.accounts)[accountA]).filters).PL_KEPT = { mode: "deny", on: true, channels: [["bad", "title"]] } }],
    ["excess channel slots", raw => { record(record(record(raw.accounts)[accountA]).filters).PL_KEPT = { mode: "deny", on: true, channels: [["UCAAAAAAAAAAAAAAAAAAAAAA", "title", "@handle", "tail"]] } }],
    ["imported provenance", raw => { record(record(record(raw.accounts)[accountA]).setup).gen = "imported-authority" }]
  ]
  for (const [name, change] of changes) test(name, () => {
    const raw = fixture()
    change(raw)
    expect(normal.importFile(JSON.stringify(raw))).toEqual(invalid)
  })
  test.each(["", "null", "[]", "{}", "{", "\"sentinel-private-file-value\"", "{\"format\":NaN}"])("fixed refusal for %s", text => {
    expect(normal.importFile(text)).toEqual(invalid)
  })
})

test("duplicate and escaped duplicate members never silently overwrite accounts or fields", () => {
  for (const text of [
    expectedText.replace('"format": 1,', '"format": 2, "format": 1,'),
    expectedText.replace('"format": 1,', '"format": 1, "for\\u006dat": 1,'),
    expectedText.replace('"accounts": {', '"accounts": {"AAAAAAAAAAAAAAAA": {},'),
    expectedText.replace('"PL_AUTO": {', '"PL_AUTO": {}, "PL_AUTO": {')
  ]) expect(normal.importFile(text)).toEqual(invalid)
})

test("unsafe member keys at every level refuse without prototype changes", () => {
  const before = Object.getOwnPropertyDescriptors(Object.prototype)
  for (const key of ["__proto__", "constructor", "prototype", "constr\\u0075ctor"]) {
    const text = expectedText.replace('"format": 1,', `"${key}": {}, "format": 1,`)
    expect(normal.importFile(text)).toEqual(invalid)
    expect(normal.importFile(expectedText.replace('"PL_AUTO": {', `"${key}": {`))).toEqual(invalid)
  }
  expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before)
})

test("canonical normalization trims labels and orphan references while retaining implicit Watch later marks", () => {
  const raw = fixture()
  const settings = record(raw.settings)
  const shortcuts = record(settings.shortcuts)
  const entries = shortcuts.list
  if (!Array.isArray(entries)) throw new Error("fixture-list")
  record(entries[0]).label = "  " + "😀".repeat(45) + "  "
  const setup = record(record(record(raw.accounts)[accountA]).setup)
  record(setup.targets).gone00 = "PL_ORPHAN"
  record(setup.marks).PL_ORPHAN = "full"
  record(setup.label).name = "😀".repeat(110)
  const filter = record(record(record(raw.accounts)[accountA]).filters).PL_KEPT
  record(filter).channels = [["UCCCCCCCCCCCCCCCCCCCCCCC", "😀".repeat(110), "h".repeat(40)]]
  const result = normal.importFile(JSON.stringify(raw))
  if (result.kind !== "import-plan") throw new Error("normalization-refused")
  expect(result.settings.shortcuts.list[0]?.label).toBe("😀".repeat(40))
  expect(result.accounts[0]?.setup.label?.name).toBe("😀".repeat(100))
  expect(result.accounts[0]?.setup.targets).toEqual({ [shortcut("abc123")]: playlist("PL_TARGET") })
  expect(result.accounts[0]?.setup.marks).toEqual({ [playlist("PL_AUTO")]: "missing", [playlist("PL_TARGET")]: "full", [playlist("WL")]: "missing" })
  expect(result.accounts[0]?.filters[1]?.filter.channels[0]).toEqual([channel("UCCCCCCCCCCCCCCCCCCCCCCC"), "😀".repeat(100), "h".repeat(30)])
})

test("tombstones read as absent and live filter-only accounts remain exportable", () => {
  const stamp = { v: 1, gen: "old", at: 0, by: "source" }
  const source = canonicalSource()
  const result = exportFile({ source: { ...source, accounts: [
    { account: accountA, setup: decodeDocument({ ...stamp, deleted: true }, decodeSetup), filters: [
      { playlist: playlist("PL_LIVE"), document: decodeDocument({ ...stamp, data: { mode: "deny", on: false, channels: [] } }, decodeFilter) },
      { playlist: playlist("PL_DELETED"), document: decodeDocument({ ...stamp, deleted: true }, decodeFilter) }
    ] },
    { account: accountB, setup: decodeDocument(undefined, decodeSetup), filters: [] }
  ] }, version: "2.0.0", date: "2024-02-29" })
  if (result.kind !== "exported") throw new Error("export-refused")
  const raw = fixture(result.file.text)
  expect(Object.keys(record(raw.accounts))).toEqual([accountA])
  expect(record(record(raw.accounts)[accountA]).setup).toEqual(defaultSetup())
  expect(record(record(raw.accounts)[accountA]).filters).toEqual({ PL_LIVE: { mode: "deny", on: false, channels: [] } })
  const absentSettings = exportFile({ source: { ...source, settings: decodeDocument({ ...stamp, deleted: true }, decodeSettings) }, version: "2.0.0", date: "2024-02-29" })
  expect(absentSettings.kind).toBe("exported")
  if (absentSettings.kind !== "exported") throw new Error("defaults-export-refused")
  expect(fixture(absentSettings.file.text).settings).toEqual(defaultSettings())
})

test("export keeps a stored channel's known slots and leaves a newer version's extra columns out of the file", () => {
  const stamp = { v: 1, gen: "old", at: 0, by: "source" }
  const channels = [["UCAAAAAAAAAAAAAAAAAAAAAA", "with handle", "@handle", "future-column"], ["UCBBBBBBBBBBBBBBBBBBBBBB", "no handle", null, "future-column"]]
  const result = exportFile({ source: { ...canonicalSource(), accounts: [{ account: accountA, setup: decodeDocument(undefined, decodeSetup), filters: [
    { playlist: playlist("PL_FUTURE"), document: decodeDocument({ ...stamp, data: { mode: "deny", on: true, channels } }, decodeFilter) }
  ] }] }, version: "2.0.0", date: "2024-02-29" })
  if (result.kind !== "exported") throw new Error("export-refused")
  expect(record(record(fixture(result.file.text).accounts)[accountA]).filters).toEqual({ PL_FUTURE: { mode: "deny", on: true, channels: [
    ["UCAAAAAAAAAAAAAAAAAAAAAA", "with handle", "@handle"], ["UCBBBBBBBBBBBBBBBBBBBBBB", "no handle"]
  ] } })
})

test("canonical defaulting stays available internally while an incomplete external file refuses", () => {
  expect(decodeSettings({})).toEqual(defaultSettings())
  expect(decodeSetup({})).toEqual(defaultSetup())
  expect(normal.importFile(JSON.stringify({ ...fixture(), settings: {} }))).toEqual(invalid)
})

test("unsupported documents never silently export as defaults", () => {
  const source = canonicalSource()
  const stamp = { v: 2, gen: "future", at: 1, by: "future" }
  const expected = { kind: "refused", reason: "unsupported-document" } as const
  expect(exportFile({ ...exportInput(), source: { ...source, settings: decodeDocument(stamp, decodeSettings) } })).toEqual(expected)
  expect(exportFile({ ...exportInput(), source: { ...source, accounts: [{ account: accountA, setup: decodeDocument(stamp, decodeSetup), filters: [] }] } })).toEqual(expected)
  expect(exportFile({ ...exportInput(), source: { ...source, accounts: [{ account: accountA, setup: decodeDocument(undefined, decodeSetup), filters: [
    { playlist: playlist("PL_NEWER"), document: decodeDocument(stamp, decodeFilter) }
  ] }] } })).toEqual(expected)
})

test("duplicate source accounts and filters refuse rather than silently overwrite", () => {
  const input = exportInput()
  const first = input.source.accounts[0]
  if (!first) throw new Error("fixture-account")
  expect(exportFile({ ...input, source: { ...input.source, accounts: [first, first] } })).toEqual({ kind: "refused", reason: "invalid-source" })
  const filter = first.filters[0]
  if (!filter) throw new Error("fixture-filter")
  expect(exportFile({ ...input, source: { ...input.source, accounts: [{ ...first, filters: [filter, filter] }] } })).toEqual({ kind: "refused", reason: "invalid-source" })
})

test.each(["2026-02-29", "1900-02-29", "0000-01-01", "2026-13-01", "2026-04-31", "2026-01-00", "2026-1-01", "2026-10-29T12:00:00Z"])("invalid explicit export date %s refuses", date => {
  expect(exportFile({ ...exportInput(), date })).toEqual({ kind: "refused", reason: "invalid-source" })
})

test("settings-only files have an exact zero-account replacement scope", () => {
  const raw = fixture()
  raw.accounts = {}
  const plan = normal.importFile(JSON.stringify(raw))
  if (plan.kind !== "import-plan") throw new Error("plan-refused")
  expect(plan.accountCount).toBe(0)
  expect(plan.accounts).toEqual([])
  expect(plan.replacement.absentAccounts).toBe("keep")
})
