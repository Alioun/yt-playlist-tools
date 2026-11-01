import { expect, test, spyOn } from "bun:test"
import { selectSettingsFileSource, settingsFileWindow, checkSettingsFile } from "./settings-file-read"
import { exportFile, createImportPlanner } from "../../shared/settings-file"
import { defaultSettings } from "../../shared/model"
import { seed, accountA, accountB, accountC, kept, orphan, stamp } from "../../../tools/fixtures/settings-file-owner/harness"

function file(records = seed()) {
  const read = selectSettingsFileSource(records)
  if (read.kind !== "source") throw Error("missing-source")
  return exportFile({ source: read.source, version: "2.0.0", date: "2026-10-30" })
}

test("complete canonical enumeration includes kept filters and an account without Setup", () => {
  const result = file()
  expect(result.kind).toBe("exported")
  if (result.kind !== "exported") throw Error("missing-file")
  const checked = createImportPlanner("normal").importFile(result.file.text)
  if (checked.kind !== "import-plan") throw Error("missing-plan")
  expect(checked.accountCount).toBe(3)
  expect(checked.accounts.map(entry => entry.account)).toEqual([accountA, accountB, accountC])
  expect(checked.accounts[0]?.filters.map(entry => entry.playlist)).toContain(kept)
  expect(checked.accounts[2]?.filters.map(entry => entry.playlist)).toEqual([orphan])
  expect(checked.accounts[2]?.setup.autoAdd).toEqual([])
})

test("source and file contain only declared canonical fields", () => {
  const records = seed(), read = selectSettingsFileSource(records)
  expect(JSON.stringify(read)).not.toContain("PRIVATE")
  expect(Object.keys(read)).toEqual(["kind", "source"])
  if (read.kind !== "source") throw Error("missing-source")
  expect(Object.keys(read.source)).toEqual(["kind", "settings", "accounts"])
  if (read.source.settings.kind !== "value") throw Error("missing-settings")
  read.source.settings.document.data.theme = "dark"
  expect(selectSettingsFileSource(records)).not.toEqual(read)
  const result = file(records)
  if (result.kind !== "exported") throw Error("missing-file")
  expect(result.file.text).not.toContain("PRIVATE")
  expect(result.file.text).not.toContain("source-generation")
})

for (const name of ["doc:settings", `doc:setup:${accountA}`, `doc:filter:${accountA}:${kept}`, `doc:filter:${accountC}:${orphan}`]) {
  test(`newer and invalid documents refuse the entire source at ${name}`, () => {
    const records = seed()
    records[name] = { ...stamp, v: 2, deleted: true }
    expect(selectSettingsFileSource(records)).toEqual({ kind: "unavailable", reason: "unsupported-document" })
    records[name] = { ...stamp, data: false }
    expect(selectSettingsFileSource(records)).toEqual({ kind: "unavailable", reason: "invalid-document" })
  })
}

test("absent settings and tombstones preserve the pure format's defaults and omissions", () => {
  const records = seed()
  delete records["doc:settings"]
  records[`doc:setup:${accountA}`] = { ...stamp, deleted: true }
  records[`doc:setup:${accountB}`] = { ...stamp, deleted: true }
  records[`doc:filter:${accountA}:${kept}`] = { ...stamp, deleted: true }
  const result = file(records)
  if (result.kind !== "exported") throw Error("missing-file")
  const checked = createImportPlanner("normal").importFile(result.file.text)
  if (checked.kind !== "import-plan") throw Error("missing-plan")
  expect(checked.settings).toEqual(defaultSettings())
  expect(checked.accountCount).toBe(2)
  expect(checked.accounts[0]?.setup.autoAdd).toEqual([])
  expect(checked.accounts[0]?.filters.map(entry => entry.playlist)).not.toContain(kept)
  records["doc:settings"] = { ...stamp, deleted: true }
  expect(file(records)).toEqual(result)
})

test("malformed canonical keys are refused rather than silently omitted", () => {
  const records = seed()
  records["doc:filter:bad:PL_x"] = { ...stamp, deleted: true }
  expect(selectSettingsFileSource(records)).toEqual({ kind: "unavailable", reason: "invalid-document" })
})

test("privacy is a separate boundary fact and refuses before input coercion or parsing", () => {
  const text = { toString() { throw Error("text-was-touched") }, get privacy() { throw Error("payload-privacy-was-touched") } }
  expect(checkSettingsFile("private", text)).toEqual({ kind: "refused", reason: "private", copy: "DATA-54.private" })
  expect(checkSettingsFile("unavailable", text)).toEqual({ kind: "refused", reason: "privacy-unavailable", copy: "DATA-54.private" })
  for (const value of [undefined, null, [], {}, { kind: "tab", windowId: 7, incognito: false },
    { kind: "ui", windowId: -1, incognito: false }, { kind: "ui", windowId: 1.5, incognito: false },
    { kind: "ui", windowId: 7, incognito: "false" }]) expect(settingsFileWindow(value)).toBe("unavailable")
})


test("private and unavailable checking never call JSON parsing", () => {
  const exported = file()
  if (exported.kind !== "exported") throw Error("missing-file")
  const parse = spyOn(JSON, "parse")
  try {
    expect(checkSettingsFile("private", exported.file.text)).toEqual({ kind: "refused", reason: "private", copy: "DATA-54.private" })
    expect(checkSettingsFile("unavailable", exported.file.text)).toEqual({ kind: "refused", reason: "privacy-unavailable", copy: "DATA-54.private" })
    expect(parse).not.toHaveBeenCalled()
    expect(checkSettingsFile("normal", exported.file.text).kind).toBe("import-plan")
    expect(parse).toHaveBeenCalled()
  } finally { parse.mockRestore() }
})
