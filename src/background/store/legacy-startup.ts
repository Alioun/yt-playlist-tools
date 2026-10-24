import {
  DecodeError, DOCUMENT_VERSION, STORAGE_SCHEMA_VERSION, decodeDevice, decodeDocument, decodeFilter,
  decodeSettings, defaultDevice, defaultSettings, isKey, isPlaylistId, isShortcutId
} from "../../shared/model"
import type { Device, Settings, Stamped, Unclaimed } from "../../shared/model"
import { dictionary, isRecord, list, natural, nullable, object, oneOf } from "../../shared/model/codec"
import { keysOverlap } from "../../shared/keys"
import type { BrowserCommand, Platform } from "../../shared/keys"
import { CREDENTIAL_KEYS, LEGACY_DELETE_KEYS, UPGRADE_TRIGGER_KEYS, convertLegacy, validateLegacyEvidence } from "./legacy"
import type { LegacyEvidence, LegacyKey } from "./legacy"
import { legacyShortcut } from "./legacy-shortcut"

export type MigrationContext = {
  deviceId: string
  settingsGen: string
  at: number
  shortcutId: string
  platform: Platform
  commands: readonly BrowserCommand[]
}
export type CanonicalUpgrade = { "doc:settings": Stamped<Settings>; device: Device; unclaimed: Unclaimed }
export type LegacyCleanup = {
  steps: readonly [
    { kind: "local-remove"; keys: readonly LegacyKey[] },
    { kind: "await-cleanup"; database: "yt-playlist-tools"; sessionKeys: readonly ["channelCache"] },
    { kind: "schema-last"; value: 1; required: boolean }
  ]
}
export type StartupSnapshot = {
  schema: unknown
  device: unknown
  settingsDocument: unknown
  unclaimed: unknown
  legacy: LegacyEvidence
  interimKeysPresent: readonly string[]
}
export type StartupPlan =
  | { kind: "newer-layout"; version: number }
  | { kind: "invalid"; field: string }
  | { kind: "unsupported-state"; reason: "interim-profile" | "canonical-collision" }
  | { kind: "current" }
  | { kind: "fresh"; schema: 1 }
  | { kind: "upgrade"; write: CanonicalUpgrade; cleanup: LegacyCleanup }
  | { kind: "resume"; cleanup: LegacyCleanup }

const decodeUnclaimed = object<Unclaimed>({
  from: oneOf("1.4.5", "1.5.0"),
  autoAdd: list((raw, path) => {
    if (!isPlaylistId(raw)) throw new DecodeError(path ?? "unclaimed.autoAdd", "a playlist ID")
    return raw
  }),
  shortcutPlaylist: nullable((raw, path) => {
    if (!isPlaylistId(raw)) throw new DecodeError(path ?? "unclaimed.shortcutPlaylist", "a playlist ID")
    return raw
  }),
  filters: dictionary(isPlaylistId, decodeFilter), at: natural
})

function validateContext(context: MigrationContext): void {
  if (!isRecord(context)) throw new DecodeError("context", "a migration context")
  for (const field of ["deviceId", "settingsGen"] as const) {
    if (typeof context[field] !== "string" || context[field].trim() === "") throw new DecodeError(`context.${field}`, "a nonempty identity")
  }
  natural(context.at, "context.at")
  if (!isShortcutId(context.shortcutId)) throw new DecodeError("context.shortcutId", "a six-character shortcut ID")
  if (!isRecord(context.platform) || !["chrome", "firefox"].includes(context.platform.browser) ||
    !["macos", "windows", "linux"].includes(context.platform.os)) throw new DecodeError("context.platform", "a supported platform")
  if (!Array.isArray(context.commands) || Array.from(context.commands).some((command: unknown) =>
    !isRecord(command) || !isKey(command.key) || typeof command.command !== "string" || command.command.length === 0)) {
    throw new DecodeError("context.commands", "browser command keys")
  }
}

function cleanup(schema: unknown): LegacyCleanup {
  return { steps: [
    { kind: "local-remove", keys: [...LEGACY_DELETE_KEYS] },
    { kind: "await-cleanup", database: "yt-playlist-tools", sessionKeys: ["channelCache"] },
    { kind: "schema-last", value: STORAGE_SCHEMA_VERSION, required: schema === undefined }
  ] }
}

function hasDeviceState(device: Device | undefined): boolean {
  if (device === undefined) return false
  const empty = new Map(Object.entries(defaultDevice(device.id)))
  return Object.entries(device).some(([key, value]) => key !== "id" && (!empty.has(key) || empty.get(key) !== value))
}

function upgrade(evidence: LegacyEvidence, context: MigrationContext): CanonicalUpgrade {
  const legacy = convertLegacy(evidence)
  const shortcut = legacyShortcut(legacy.rawShortcut, legacy.shortcutPlaylist !== null, context)
  const settings = defaultSettings()
  settings.autoAdd = { ...settings.autoAdd, on: legacy.autoAdd.length > 0, pct: legacy.pct.value, feedback: legacy.feedback }
  const picker = { char: "p", code: "KeyP", ctrl: false, alt: true, shift: true, meta: false }
  settings.shortcuts = {
    ...settings.shortcuts, on: shortcut.key !== null && shortcut.playlist, feedback: legacy.feedback, preset: true,
    picker: shortcut.key && keysOverlap(shortcut.key, picker) ? null : picker,
    list: shortcut.note === "none" ? [] : [{ id: context.shortcutId, key: shortcut.key, label: "", watchLaterOnEveryAccount: false }]
  }
  if (shortcut.key && settings.undoKey && keysOverlap(shortcut.key, settings.undoKey)) settings.undoKey = null
  const device = defaultDevice(context.deviceId)
  device.upgradeNote = {
    state: "pending", opened: false, seen: false, reopened: false,
    details: {
      from: legacy.from, autoAdd: { kept: legacy.autoAdd.length, dropped: legacy.dropped }, pct: legacy.pct,
      feedback: legacy.feedback, shortcut,
      credentialsDeleted: evidence.presentKeys.some(key => CREDENTIAL_KEYS.some(credential => credential === key))
    }
  }
  return {
    "doc:settings": { v: DOCUMENT_VERSION, gen: context.settingsGen, at: context.at, by: context.deviceId, data: settings },
    device,
    unclaimed: { from: legacy.from, autoAdd: legacy.autoAdd, shortcutPlaylist: legacy.shortcutPlaylist, filters: legacy.filters, at: context.at }
  }
}

export function planLegacyStartup(input: StartupSnapshot, context: MigrationContext): StartupPlan {
  if (!isRecord(input)) return { kind: "invalid", field: "snapshot" }
  if (input.schema !== undefined) {
    if (typeof input.schema !== "number" || !Number.isSafeInteger(input.schema) || input.schema < 1) return { kind: "invalid", field: "schema" }
    if (input.schema > STORAGE_SCHEMA_VERSION) return { kind: "newer-layout", version: input.schema }
  }
  let field = "context"
  try {
    validateContext(context)
    field = "device"
    const device = input.device === undefined ? undefined : decodeDevice(input.device)
    field = "settingsDocument"
    const settings = decodeDocument(input.settingsDocument, decodeSettings)
    field = "unclaimed"
    const unclaimed = input.unclaimed === undefined ? undefined : decodeUnclaimed(input.unclaimed)
    field = "interimKeysPresent"
    if (!Array.isArray(input.interimKeysPresent) || !Array.from(input.interimKeysPresent).every((key: unknown) => typeof key === "string")) throw new DecodeError(field, "key names")
    if (input.interimKeysPresent.some(key => key.startsWith("account:") || ["savedAccountKeys", "sessionConsent", "sessionGeneration", "legacyClaimed"].includes(key))) {
      return { kind: "unsupported-state", reason: "interim-profile" }
    }
    field = "legacy"
    validateLegacyEvidence(input.legacy)
    if (device?.upgradeNote?.state === "pending") {
      if (settings.kind !== "value") return { kind: "invalid", field: "settingsDocument" }
      if (unclaimed === undefined) return { kind: "invalid", field: "unclaimed" }
      const details = device.upgradeNote.details
      if (unclaimed.from !== details.from || unclaimed.autoAdd.length !== details.autoAdd.kept ||
        new Set(unclaimed.autoAdd).size !== unclaimed.autoAdd.length ||
        (unclaimed.shortcutPlaylist !== null) !== details.shortcut.playlist) {
        return { kind: "unsupported-state", reason: "canonical-collision" }
      }
      return { kind: "resume", cleanup: cleanup(input.schema) }
    }
    const triggered = input.legacy.presentKeys.some(key => UPGRADE_TRIGGER_KEYS.some(trigger => trigger === key))
    const canonical = settings.kind !== "absent" || unclaimed !== undefined || hasDeviceState(device) ||
      (device !== undefined && device.id !== context.deviceId)
    if (canonical) return triggered ? { kind: "unsupported-state", reason: "canonical-collision" } : { kind: "current" }
    if (triggered) return { kind: "upgrade", write: upgrade(input.legacy, context), cleanup: cleanup(input.schema) }
    return input.schema === undefined ? { kind: "fresh", schema: STORAGE_SCHEMA_VERSION } : { kind: "current" }
  } catch (error) {
    if (error instanceof DecodeError) return { kind: "invalid", field: field === "context" ? error.path : field }
    throw error
  }
}
