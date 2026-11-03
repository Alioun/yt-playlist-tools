import { isJsonValue } from "../contracts/json"
import type { FirstRunFeature } from "../contracts/first-run"
import { DecodeError } from "./codec"
import { decodeDevice } from "./decodeDevice"
import { decodeSetup } from "./decodeSetup"
import { decodeDocument, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, CONSENT_VERSION } from "./documents"
import { defaultSetup } from "./defaults"
import { readSettingsView, type Snapshot } from "./settings-view"
import type { Settings, Setup, Key } from "./types"
import { documentKey, type AccountKey, type PlaylistId, isPlaylistId, isShortcutId, type ShortcutId } from "./validation"

export const featureSettings = {
  "auto-add": "autoAdd",
  shortcuts: "shortcuts",
  "quick-save": "quickSave",
  "queue-button": "queueButton",
  "watch-button": "watchButton",
  "card-menu": "cardMenu",
  "browser-menu": "browserMenu",
  "music-actions": "musicActions",
  "music-keys": "musicKeys",
  "any-tab-keys": "anyTabKeys",
  gather: "gather"
} as const satisfies Record<FirstRunFeature, keyof Settings>
export const firstRunFeatures = Object.keys(featureSettings).filter((key): key is FirstRunFeature => Object.hasOwn(featureSettings, key))
export type ReadScope = { readonly acct: AccountKey }
export type DocumentView<T> = { readonly kind: "missing" | "deleted" | "current"; readonly value: T } | { readonly kind: "invalid" } | { readonly kind: "newer-version"; readonly version: number }
export type DeviceView =
  | { readonly kind: "missing" | "invalid" }
  | { readonly kind: "newer-version"; readonly version: number }
  | { readonly kind: "current"; readonly consent: "required" | "agreed"; readonly syncOn: boolean; readonly upgradePending: boolean }
export type SettingsProjection = {
  readonly selected: readonly FirstRunFeature[]
  readonly shortcutsOnMusic: boolean
  readonly shortcuts: readonly { readonly id: ShortcutId; readonly label: string; readonly key: Snapshot<Key> | null; readonly watchLaterOnEveryAccount: boolean }[]
}
export type SetupProjection = {
  readonly autoAdd: readonly PlaylistId[]
  readonly targets: Readonly<Record<string, PlaylistId>>
  readonly quickSave: PlaylistId | null
  readonly musicSave: PlaylistId | null
  readonly gather: PlaylistId | null
}
export type UiSnapshot =
  | {
      readonly kind: "snapshot"
      readonly layout: "missing" | "current" | "invalid" | "newer-version"
      readonly device: DeviceView
      readonly settings: DocumentView<SettingsProjection>
      readonly setup: DocumentView<SetupProjection> | { readonly kind: "not-requested" }
    }
  | { readonly kind: "unavailable"; readonly reason: "read" | "disposed" }

export function firstRunKeys(scope?: ReadScope): readonly string[] {
  return ["schema", "device", "doc:settings", ...(scope ? [documentKey({ kind: "setup", acct: scope.acct })] : [])]
}
function settingsProjection(settings: Snapshot<Settings>): SettingsProjection {
  return {
    selected: firstRunFeatures.filter(feature => settings[featureSettings[feature]].on),
    shortcutsOnMusic: settings.shortcuts.music,
    shortcuts: settings.shortcuts.list.flatMap(row => (isShortcutId(row.id) ? [{ id: row.id, label: row.label, key: row.key, watchLaterOnEveryAccount: row.watchLaterOnEveryAccount }] : []))
  }
}
function setupProjection(setup: Setup): SetupProjection {
  return {
    autoAdd: setup.autoAdd.map(row => row.pl).filter(isPlaylistId),
    targets: Object.fromEntries(
      Object.entries(setup.targets)
        .filter(([id, playlist]) => isShortcutId(id) && isPlaylistId(playlist))
        .map(([id, playlist]) => {
          if (!isPlaylistId(playlist)) throw new DecodeError("setup.targets", "a playlist ID")
          return [id, playlist]
        })
    ),
    quickSave: isPlaylistId(setup.quickSave) ? setup.quickSave : null,
    musicSave: isPlaylistId(setup.musicSave) ? setup.musicSave : null,
    gather: isPlaylistId(setup.gather) ? setup.gather : null
  }
}
function deviceView(raw: unknown): DeviceView {
  if (raw === undefined) return { kind: "missing" }
  if (!isJsonValue(raw) || raw === null || typeof raw !== "object" || Array.isArray(raw) || !["id", "consent", "syncOn"].every(key => Object.hasOwn(raw, key))) return { kind: "invalid" }
  try {
    const device = decodeDevice(raw)
    if (device.consent && device.consent.v > CONSENT_VERSION) return { kind: "newer-version", version: device.consent.v }
    return { kind: "current", consent: device.consent ? "agreed" : "required", syncOn: device.syncOn, upgradePending: device.upgradeNote?.state === "pending" }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "invalid" }
    throw error
  }
}
function settingsView(raw: unknown): DocumentView<SettingsProjection> {
  const read = readSettingsView(raw)
  if (read.kind !== "value") return read
  if (raw === undefined || raw === null) return { kind: "missing", value: settingsProjection(read.settings) }
  if (!isJsonValue(raw) || typeof raw !== "object" || Array.isArray(raw)) return { kind: "invalid" }
  return { kind: raw.deleted === true ? "deleted" : "current", value: settingsProjection(read.settings) }
}
function setupView(raw: unknown): DocumentView<SetupProjection> {
  if (raw === undefined || raw === null) return { kind: "missing", value: setupProjection(defaultSetup()) }
  if (!isJsonValue(raw)) return { kind: "invalid" }
  try {
    const read = decodeDocument(raw, decodeSetup)
    switch (read.kind) {
      case "absent":
        return { kind: "missing", value: setupProjection(defaultSetup()) }
      case "deleted":
        return { kind: "deleted", value: setupProjection(defaultSetup()) }
      case "value":
        return { kind: "current", value: setupProjection(read.document.data) }
      case "newer-version":
        return { kind: "newer-version", version: read.version }
    }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "invalid" }
    throw error
  }
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
export function readFirstRunSnapshot(records: Readonly<Record<string, unknown>>, scope?: ReadScope): UiSnapshot {
  const schema = records.schema
  return freeze({
    kind: "snapshot",
    layout:
      schema === undefined
        ? "missing"
        : schema === STORAGE_SCHEMA_VERSION
          ? "current"
          : typeof schema === "number" && Number.isSafeInteger(schema) && schema > STORAGE_SCHEMA_VERSION
            ? "newer-version"
            : "invalid",
    device: deviceView(records.device),
    settings: settingsView(records["doc:settings"]),
    setup: scope ? setupView(records[documentKey({ kind: "setup", acct: scope.acct })]) : { kind: "not-requested" }
  } satisfies UiSnapshot)
}

export const supportedDocumentVersion = DOCUMENT_VERSION
