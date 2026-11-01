import {
  decodeDocument, decodeFilter, decodeSettings, decodeSetup, defaultSettings, parseDocumentKey,
  STORAGE_SCHEMA_VERSION, type AccountKey, type DecodedDocument, type Filter, type Setup
} from "../../shared/model"
import { isRecord } from "../../shared/model/codec"
import type { Origin } from "../../shared/contracts/results"
import { isJsonValue } from "../../shared/contracts/json"
import {
  createImportPlanner, type ImportResult, type ImportWindow, type SettingsFileSource
} from "../../shared/settings-file"
import { unsafeKey } from "../../shared/settings-file/shape"
import { filterData, settingsData, setupData } from "../../shared/settings-file/data"
import type { LocalWriteStorage } from "./local-filter-writer"

export type SettingsFileUnavailable = {
  readonly kind: "unavailable"
  readonly reason: "startup" | "newer-layout" | "disposed" | "stale" | "pending-recovery" | "read-failed" | "invalid-document" | "unsupported-document" | "origin"
}
export type SettingsFileRead = { readonly kind: "source"; readonly source: SettingsFileSource } | SettingsFileUnavailable
export type SettingsFileCheck = ImportResult | SettingsFileUnavailable
export type SettingsFileOwner = {
  exportSettings(origin: Extract<Origin, { kind: "ui" }>): Promise<SettingsFileRead>
  importCheck(origin: Extract<Origin, { kind: "ui" }>, text: unknown): Promise<SettingsFileCheck>
}

export function settingsFileWindow(origin: unknown): ImportWindow {
  if (!isJsonValue(origin) || !isRecord(origin) || !["kind", "windowId", "incognito"].every(key => Object.hasOwn(origin, key)) || origin.kind !== "ui" || typeof origin.windowId !== "number" ||
    !Number.isSafeInteger(origin.windowId) || origin.windowId < 0 || typeof origin.incognito !== "boolean") return "unavailable"
  return origin.incognito ? "private" : "normal"
}

// The caller supplies a fresh fact from authenticated native context, never from file contents.
export function checkSettingsFile(window: ImportWindow, text: unknown, unavailable?: SettingsFileUnavailable): SettingsFileCheck {
  const planner = createImportPlanner(window)
  if (window !== "normal") return planner.importFile(undefined)
  return unavailable ?? planner.importFile(text)
}

class UnsupportedSettingsFileDocument extends Error {}

function selected<T>(document: DecodedDocument<T>, project: (data: T) => T): DecodedDocument<T> {
  switch (document.kind) {
    case "absent": return { kind: "absent" }
    case "newer-version": throw new UnsupportedSettingsFileDocument()
    case "deleted": {
      const { v, gen, at, by } = document.document
      return { kind: "deleted", document: { v, gen, at, by, deleted: true } }
    }
    case "value": {
      const { v, gen, at, by, data } = document.document
      return { kind: "value", document: { v, gen, at, by, data: project(data) } }
    }
  }
}

export function selectSettingsFileSource(records: Readonly<Record<string, unknown>>): SettingsFileRead {
  if (typeof records.schema === "number" && records.schema > STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "newer-layout" }
  if (records.schema !== STORAGE_SCHEMA_VERSION) return { kind: "unavailable", reason: "startup" }
  try {
    const settings = selected(decodeDocument(records["doc:settings"], decodeSettings), data => settingsData(data, false))
    const shared = settings.kind === "value" ? settings.document.data : defaultSettings()
    type Account = { account: AccountKey; setup: DecodedDocument<Setup>; filters: SettingsFileSource["accounts"][number]["filters"][number][] }
    const accounts = new Map<AccountKey, Account>()
    function account(key: AccountKey): Account {
      const found = accounts.get(key)
      if (found) return found
      const value: Account = { account: key, setup: { kind: "absent" }, filters: [] }
      accounts.set(key, value)
      return value
    }
    for (const name of Object.keys(records).sort()) {
      if (!name.startsWith("doc:")) continue
      const key = parseDocumentKey(name)
      if (!key) return { kind: "unavailable", reason: "invalid-document" }
      if (key.kind === "settings") continue
      if (key.kind === "setup") {
        account(key.acct).setup = selected(decodeDocument(records[name], decodeSetup), data => setupData(data, shared, false))
      } else {
        if (unsafeKey(key.playlist)) return { kind: "unavailable", reason: "invalid-document" }
        account(key.acct).filters.push({ playlist: key.playlist,
          document: selected(decodeDocument<Filter>(records[name], decodeFilter), data => filterData(data, false)) })
      }
    }
    return { kind: "source", source: { kind: "settings-file-source", settings,
      accounts: [...accounts.values()].sort((a, b) => a.account < b.account ? -1 : a.account > b.account ? 1 : 0) } }
  } catch (error) {
    return { kind: "unavailable", reason: error instanceof UnsupportedSettingsFileDocument
      ? "unsupported-document" : "invalid-document" }
  }
}

// This port must preserve the owner's canonical safety checks without resuming writes.
export async function readSettingsFile(input: {
  readonly local: Pick<LocalWriteStorage, "get">
  readonly unavailable: () => SettingsFileUnavailable | undefined
  readonly unavailableRecords: (records: Readonly<Record<string, unknown>>) => SettingsFileUnavailable | undefined
}): Promise<SettingsFileRead> {
  const before = input.unavailable()
  if (before) return before
  try {
    const initial = await input.local.get(null)
    const changed = input.unavailable() ?? input.unavailableRecords(initial)
    if (changed) return changed
    const first = selectSettingsFileSource(initial)
    if (first.kind !== "source") return first
    const current = await input.local.get(null)
    const stopped = input.unavailable() ?? input.unavailableRecords(current)
    if (stopped) return stopped
    const latest = selectSettingsFileSource(current)
    if (latest.kind !== "source") return latest
    if (JSON.stringify(first.source) !== JSON.stringify(latest.source)) return { kind: "unavailable", reason: "stale" }
    return latest
  } catch { return input.unavailable() ?? { kind: "unavailable", reason: "read-failed" } }
}
