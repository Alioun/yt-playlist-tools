import { defaultSettings, defaultSetup, DOCUMENT_VERSION, isAccountKey, isPlaylistId, type AccountKey, type DecodedDocument, type Filter, type PlaylistId, type Settings, type Setup } from "../model"
import { isRecord } from "../model/codec"
import { filterData, settingsData, setupData, type FileFilter, type FileSetup } from "./data"
import { parseFileJson } from "./json"
import { unsafeKey } from "./shape"

export type { FileFilter, FileSetup } from "./data"
export const SETTINGS_FILE_FORMAT = 1
export const SETTINGS_FILE_PRODUCT = "Perchling"
export const SETTINGS_FILE_MIME = "application/json"

export type SettingsFileSource = {
  readonly kind: "settings-file-source"
  readonly settings: DecodedDocument<Settings>
  readonly accounts: readonly {
    readonly account: AccountKey
    readonly setup: DecodedDocument<Setup>
    readonly filters: readonly { readonly playlist: PlaylistId; readonly document: DecodedDocument<Filter> }[]
  }[]
}
export type FileHeader = {
  readonly format: 1
  readonly product: typeof SETTINGS_FILE_PRODUCT
  readonly version: string
  readonly date: string
}
export type ImportAccount = {
  readonly account: AccountKey
  readonly setup: FileSetup
  readonly filters: readonly { readonly playlist: PlaylistId; readonly filter: FileFilter }[]
}
export type ImportPlan = {
  readonly kind: "import-plan"
  readonly header: FileHeader
  readonly settings: Settings
  readonly accounts: readonly ImportAccount[]
  readonly accountCount: number
  readonly replacement: {
    readonly sharedSettings: "replace"
    readonly includedAccounts: "replace-setup-and-all-filters"
    readonly absentAccounts: "keep"
  }
  readonly provenance: "fresh-edit-required"
}
export type ImportRefusal =
  | { readonly kind: "refused"; readonly reason: "newer-format"; readonly copy: "DATA-55.newer-format" }
  | { readonly kind: "refused"; readonly reason: "invalid-file"; readonly copy: "DATA-55.invalid-file" }
  | { readonly kind: "refused"; readonly reason: "private"; readonly copy: "DATA-54.private" }
  | { readonly kind: "refused"; readonly reason: "privacy-unavailable"; readonly copy: "DATA-54.private" }
export type ImportResult = ImportPlan | ImportRefusal
export type ImportWindow = "normal" | "private" | "unavailable"
export type ImportPlanner = { readonly importFile: (text: unknown) => ImportResult }
export type ExportFile = {
  readonly filename: string
  readonly mime: typeof SETTINGS_FILE_MIME
  readonly text: string
}
export type ExportResult = { readonly kind: "exported"; readonly file: ExportFile } | { readonly kind: "refused"; readonly reason: "invalid-source" | "unsupported-document" }

function invalid(): ImportRefusal {
  return { kind: "refused", reason: "invalid-file", copy: "DATA-55.invalid-file" }
}

function dateIsValid(date: unknown): date is string {
  if (typeof date !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) return false
  const year = Number(date.slice(0, 4)),
    month = Number(date.slice(5, 7)),
    day = Number(date.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  return days !== undefined && day <= days
}

function versionIsValid(version: unknown): version is string {
  return typeof version === "string" && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)
}

function exact(raw: unknown, keys: readonly string[]): raw is Record<string, unknown> {
  return isRecord(raw) && Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key))
}

function supported<T>(document: DecodedDocument<T>): boolean {
  return document.kind !== "newer-version" && (document.kind === "absent" || document.document.v === DOCUMENT_VERSION)
}

export function exportFile(input: { readonly source: SettingsFileSource; readonly version: string; readonly date: string }): ExportResult {
  try {
    if (!dateIsValid(input.date) || !versionIsValid(input.version) || input.source.kind !== "settings-file-source") {
      return { kind: "refused", reason: "invalid-source" }
    }
    const source = input.source
    if (!supported(source.settings)) return { kind: "refused", reason: "unsupported-document" }
    const settings = settingsData(source.settings.kind === "value" ? source.settings.document.data : defaultSettings(), false)
    const seen = new Set<string>()
    const accounts: [AccountKey, { setup: FileSetup; filters: Record<PlaylistId, FileFilter> }][] = []
    for (const account of source.accounts) {
      if (!isAccountKey(account.account) || seen.has(account.account)) return { kind: "refused", reason: "invalid-source" }
      seen.add(account.account)
      if (!supported(account.setup)) return { kind: "refused", reason: "unsupported-document" }
      const playlists = new Set<string>()
      const filters: [PlaylistId, FileFilter][] = []
      for (const entry of account.filters) {
        if (!isPlaylistId(entry.playlist) || unsafeKey(entry.playlist) || playlists.has(entry.playlist)) return { kind: "refused", reason: "invalid-source" }
        playlists.add(entry.playlist)
        if (!supported(entry.document)) return { kind: "refused", reason: "unsupported-document" }
        if (entry.document.kind === "value") filters.push([entry.playlist, filterData(entry.document.document.data, false)])
      }
      if (account.setup.kind !== "value" && filters.length === 0) continue
      const setup = setupData(account.setup.kind === "value" ? account.setup.document.data : defaultSetup(), settings, false)
      accounts.push([account.account, { setup, filters: Object.fromEntries(filters.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) }])
    }
    const contents = {
      format: SETTINGS_FILE_FORMAT,
      product: SETTINGS_FILE_PRODUCT,
      version: input.version,
      date: input.date,
      settings,
      accounts: Object.fromEntries(accounts.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
    return {
      kind: "exported",
      file: {
        filename: `perchling-settings-${input.date}.json`,
        mime: SETTINGS_FILE_MIME,
        text: `${JSON.stringify(contents, null, 2)}\n`
      }
    }
  } catch {
    return { kind: "refused", reason: "invalid-source" }
  }
}

export function exportBlob(file: ExportFile): Blob {
  return new Blob([file.text], { type: file.mime })
}

// Bind only at trusted composition with native sender privacy, never with a decoded request property.
// The returned parser has no privacy argument for a file or an RPC payload to override.
export function createImportPlanner(window: ImportWindow): ImportPlanner {
  return {
    importFile(text): ImportResult {
      if (window === "private") return { kind: "refused", reason: "private", copy: "DATA-54.private" }
      if (window !== "normal") return { kind: "refused", reason: "privacy-unavailable", copy: "DATA-54.private" }
      try {
        const raw = parseFileJson(text)
        if (
          !isRecord(raw) ||
          raw.product !== SETTINGS_FILE_PRODUCT ||
          !versionIsValid(raw.version) ||
          !dateIsValid(raw.date) ||
          typeof raw.format !== "number" ||
          !Number.isSafeInteger(raw.format) ||
          raw.format < 1
        )
          return invalid()
        if (raw.format > SETTINGS_FILE_FORMAT) return { kind: "refused", reason: "newer-format", copy: "DATA-55.newer-format" }
        if (!exact(raw, ["format", "product", "version", "date", "settings", "accounts"]) || !isRecord(raw.accounts)) return invalid()
        const settings = settingsData(raw.settings, true)
        const accounts: ImportAccount[] = []
        for (const account of Object.keys(raw.accounts).sort()) {
          if (!isAccountKey(account)) return invalid()
          const entry = raw.accounts[account]
          if (!exact(entry, ["setup", "filters"]) || !isRecord(entry.filters)) return invalid()
          const setup = setupData(entry.setup, settings, true)
          const filters: { playlist: PlaylistId; filter: FileFilter }[] = []
          for (const playlist of Object.keys(entry.filters).sort()) {
            if (!isPlaylistId(playlist) || unsafeKey(playlist)) return invalid()
            filters.push({ playlist, filter: filterData(entry.filters[playlist], true) })
          }
          accounts.push({ account, setup, filters })
        }
        return {
          kind: "import-plan",
          header: { format: 1, product: SETTINGS_FILE_PRODUCT, version: raw.version, date: raw.date },
          settings,
          accounts,
          accountCount: accounts.length,
          replacement: { sharedSettings: "replace", includedAccounts: "replace-setup-and-all-filters", absentAccounts: "keep" },
          provenance: "fresh-edit-required"
        }
      } catch {
        return invalid()
      }
    }
  }
}
