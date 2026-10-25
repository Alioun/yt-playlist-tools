import type { Origin } from "../../shared/contracts/results"
import type { FeatureId } from "../../shared/contracts/vocabulary"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { CONSENT_VERSION, STORAGE_SCHEMA_VERSION, DecodeError, decodeDevice, decodeSyncState, readStoredUnclaimed, isShortcutId, type Device, type Settings, type ShortcutId } from "../../shared/model"
import { readSettingsView, type Snapshot } from "../../shared/model/settings-view"
import { applyPresets, type PresetConflict } from "../../shared/keys/bindings"
import type { HistoricalFact, InterimConversionNote } from "./interim-conversion"
import type { MigrationContext } from "./legacy-startup"
import { prepareDocumentBody } from "./write-preparation"
import { readFirstEditProvenance } from "./first-edit-provenance"
import { sameSyncJson } from "./sync-write-admission"

export type UiOrigin = Extract<Origin, { kind: "ui" }>
export type PageFeatureId = Exclude<FeatureId, "sync">
export type AgreementReview = { readonly kind: "agreement-review" }
export type AgreementApplication = {
  readonly feature: PageFeatureId; readonly scope: "www" | "music" | "browser";
  readonly state:
    | { readonly kind: "enabled" }
    | { readonly kind: "held"; readonly reason: "site-access" | "browser-menu-permission" }
    | { readonly kind: "off"; readonly reason: "denied-access" }
}
export type AgreementAccess = {
  readonly www: boolean; readonly music: boolean; readonly browserMenu: boolean
}
export type AgreementChoice =
  | { readonly kind: "first-run"; readonly selected: readonly PageFeatureId[];
      readonly syncOn: false }
  | { readonly kind: "upgrade-note"; readonly selected: readonly PageFeatureId[];
      readonly syncOn: false; readonly percentage: "keep" | "immediate" | "half" }
  | { readonly kind: "feature"; readonly feature: PageFeatureId }
  | { readonly kind: "disclosure" }
  | { readonly kind: "retained-disclosure" }
export type AgreementInput = {
  readonly review: AgreementReview; readonly displayedVersion: number;
  readonly choice: AgreementChoice; readonly access: Promise<AgreementAccess>
}
export type AgreementPresentation =
  | { readonly kind: "canonical"; readonly consent: Snapshot<Device["consent"]>;
      readonly note: Snapshot<Device["upgradeNote"]>;
      readonly settings: Snapshot<Settings>; readonly syncOn: boolean }
  | { readonly kind: "retained"; readonly consent: Snapshot<Device["consent"]>;
      readonly historicalAuthorization: HistoricalFact;
      readonly priorCredentialPresence: HistoricalFact;
      readonly recovery: "available" | "unavailable";
      readonly agreement: "required" | "confirmed";
      readonly details:
        | { readonly kind: "blocked" }
        | { readonly kind: "available";
            readonly percentage: InterimConversionNote["percentage"];
            readonly feedback: InterimConversionNote["feedback"];
            readonly globals: "explicit-review-required" | "unclaimed-source" };
      readonly activation: "held" }
export type AgreementRead =
  | { readonly kind: "review"; readonly version: number;
      readonly review: AgreementReview; readonly presentation: AgreementPresentation }
  | { readonly kind: "pending"; readonly consent: Snapshot<NonNullable<Device["consent"]>>;
      readonly action: "resume-retained-agreement"; readonly activation: "held" }
  | { readonly kind: "invalid"; readonly field: "records" | "schema" | "device" | "settings" | "sync" }
  | AgreementUnavailable
export type AgreementUnavailableReason =
  | "startup" | "newer-layout" | "disposed" | "stale" | "creation-context"
  | "upgrade-note" | "newer-consent" | "sync-writer-required" | "join-required"
  | "retention" | "pending-removal" | "pending-agreement"
export type AgreementUnavailable = {
  readonly kind: "unavailable"; readonly reason: AgreementUnavailableReason
}
export type AgreementWrite =
  | { readonly kind: "resolved" }
  | { readonly kind: "rejected"; readonly error: unknown }
export type AgreementStage = "canonical" | "accept" | "device" | "record"
export type AgreementResult =
  | { readonly kind: "committed"; readonly consent: NonNullable<Device["consent"]>;
      readonly settingsChanged: boolean; readonly blocked: readonly PresetConflict[];
      readonly applications: readonly AgreementApplication[];
      readonly mutations: readonly { readonly stage: AgreementStage; readonly write: AgreementWrite }[];
      readonly activation: "ordinary-gates" | "held" }
  | { readonly kind: "unchanged"; readonly reason: "already-agreed";
      readonly consent: NonNullable<Device["consent"]>; readonly activation: "ordinary-gates" | "held" }
  | { readonly kind: "refused"; readonly reason: "invalid" | "update-needed" | "sync-full" }
  | AgreementUnavailable
  | { readonly kind: "failed"; readonly stage: "before-set";
      readonly error: unknown }
  | { readonly kind: "failed"; readonly stage: AgreementStage;
      readonly write: Extract<AgreementWrite, { kind: "rejected" }> }
  | { readonly kind: "unconfirmed"; readonly stage: AgreementStage;
      readonly write: AgreementWrite; readonly cause:
        { readonly kind: "readback" | "stopped" }
        | { readonly kind: "read-failed"; readonly error: unknown } }

export function agreementObject(raw: unknown): raw is JsonObject {
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) && isJsonValue(raw)
}
export function detachAgreement<T>(raw: T): T {
  if (raw === null || typeof raw !== "object") return raw
  return (Array.isArray(raw) ? raw.map(detachAgreement) : Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, detachAgreement(value)]))) as T
}
export function freezeAgreement<T>(raw: T): Snapshot<T> {
  const copy = detachAgreement(raw)
  const pending: unknown[] = [copy]
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value !== "object") continue
    pending.push(...Object.values(value)); Object.freeze(value)
  }
  return copy as Snapshot<T>
}
export function agreementOrigin(raw: unknown): raw is UiOrigin {
  return agreementObject(raw) && Object.keys(raw).length === 3 && raw.kind === "ui" && typeof raw.windowId === "number" && Number.isSafeInteger(raw.windowId) && raw.windowId >= 0 && typeof raw.incognito === "boolean"
}
export function agreementAccess(raw: unknown): raw is AgreementAccess {
  return agreementObject(raw) && Object.keys(raw).length === 3 && typeof raw.www === "boolean" && typeof raw.music === "boolean" && typeof raw.browserMenu === "boolean"
}
const featurePaths = {
  "auto-add": "autoAdd", shortcuts: "shortcuts", "quick-save": "quickSave", "queue-button": "queueButton", "watch-button": "watchButton", "card-menu": "cardMenu", "browser-menu": "browserMenu",
  "music-actions": "musicActions", "music-keys": "musicKeys", "any-tab-keys": "anyTabKeys", gather: "gather"
} as const satisfies Record<PageFeatureId, keyof Settings>
export const pageFeatures = Object.keys(featurePaths).filter(isPageFeature)
function isPageFeature(raw: unknown): raw is PageFeatureId { return typeof raw === "string" && Object.hasOwn(featurePaths, raw) }
export function parseAgreementChoice(raw: unknown): AgreementChoice | AgreementUnavailable | { readonly kind: "refused"; readonly reason: "invalid" } {
  const invalid = { kind: "refused", reason: "invalid" } as const
  if (!agreementObject(raw)) return invalid
  if (raw.syncOn === true) return { kind: "unavailable", reason: "join-required" }
  switch (raw.kind) {
    case "first-run":
    case "upgrade-note": {
      const keys = raw.kind === "first-run" ? ["kind", "selected", "syncOn"] : ["kind", "selected", "syncOn", "percentage"]
      if (Object.keys(raw).length !== keys.length || Object.keys(raw).some(key => !keys.includes(key)) || raw.syncOn !== false || !Array.isArray(raw.selected) || !raw.selected.every(isPageFeature) || new Set(raw.selected).size !== raw.selected.length) return invalid
      if (raw.kind === "first-run") return { kind: raw.kind, selected: [...raw.selected], syncOn: false }
      if (raw.percentage !== "keep" && raw.percentage !== "immediate" && raw.percentage !== "half") return invalid
      return { kind: raw.kind, selected: [...raw.selected], syncOn: false, percentage: raw.percentage }
    }
    case "feature": return Object.keys(raw).length === 2 && isPageFeature(raw.feature) ? { kind: "feature", feature: raw.feature } : invalid
    case "disclosure":
    case "retained-disclosure": return Object.keys(raw).length === 1 ? { kind: raw.kind } : invalid
    default: return invalid
  }
}
export type CanonicalAgreementState = {
  readonly kind: "canonical-state"
  readonly device: Device | undefined
  readonly rawDevice: JsonObject | undefined
  readonly settings: Snapshot<Settings>
}
export function readCanonicalAgreement(records: JsonObject): CanonicalAgreementState | Extract<AgreementRead, { kind: "invalid" | "unavailable" }> {
  if (records.schema !== STORAGE_SCHEMA_VERSION) return typeof records.schema === "number" && records.schema > STORAGE_SCHEMA_VERSION
    ? { kind: "unavailable", reason: "newer-layout" } : { kind: "invalid", field: "schema" }
  let device: Device | undefined, rawDevice: JsonObject | undefined
  if (Object.hasOwn(records, "device")) {
    const raw = records.device
    if (!agreementObject(raw) || !["id", "consent", "syncOn"].every(key => Object.hasOwn(raw, key))) return { kind: "invalid", field: "device" }
    try { device = decodeDevice(raw); rawDevice = raw } catch (error) { if (error instanceof DecodeError) return { kind: "invalid", field: "device" }; throw error }
    if (device.consent && device.consent.v > CONSENT_VERSION) return { kind: "unavailable", reason: "newer-consent" }
  }
  if (Object.hasOwn(records, "sync")) {
    if (readFirstEditProvenance({ kind: "present", raw: records.sync }).kind === "invalid") return { kind: "invalid", field: "sync" }
    const history = decodeSyncState(records.sync)
    if (device?.syncOn ? !history.joined || !["ok", "full", "update-needed"].includes(history.status) : history.status !== "off") return { kind: "unavailable", reason: "sync-writer-required" }
  } else if (device?.syncOn) return { kind: "unavailable", reason: "sync-writer-required" }
  if (Object.hasOwn(records, "doc:settings") && records["doc:settings"] === null) return { kind: "invalid", field: "settings" }
  const view = readSettingsView(records["doc:settings"])
  if (view.kind !== "value") return view.kind === "newer-version" ? { kind: "unavailable", reason: "newer-layout" } : { kind: "invalid", field: "settings" }
  return { kind: "canonical-state", device, rawDevice, settings: view.settings }
}
export type CanonicalAgreementPlan = {
  readonly kind: "prepared"
  readonly device: JsonObject
  readonly settings: JsonObject | undefined
  readonly applications: readonly AgreementApplication[]
  readonly blocked: readonly PresetConflict[]
  readonly clearProgress: boolean
}
export function prepareCanonicalAgreement(input: {
  readonly records: JsonObject
  readonly state: CanonicalAgreementState
  readonly choice: Exclude<AgreementChoice, { kind: "retained-disclosure" }>
  readonly access: AgreementAccess
  readonly consent: NonNullable<Device["consent"]>
  readonly context: MigrationContext | undefined
}): CanonicalAgreementPlan | AgreementUnavailable | Extract<AgreementResult, { kind: "refused" }> {
  const { records, state, choice, access, consent, context } = input
  const invalid = { kind: "refused", reason: "invalid" } as const
  let settings = detachAgreement(state.settings) as Settings
  const original = prepareDocumentBody({ kind: "settings", data: settings })
  if (original.kind !== "prepared") return invalid
  const applications: AgreementApplication[] = [], blocked: PresetConflict[] = []
  const reserved = new Set<ShortcutId>(settings.shortcuts.list.map(row => row.id).filter(isShortcutId))
  const unclaimed = readStoredUnclaimed(records.unclaimed)
  if (unclaimed.kind === "pending" && isShortcutId(unclaimed.data.originalShortcutId)) reserved.add(unclaimed.data.originalShortcutId)
  const selected = choice.kind === "feature" ? [choice.feature] : choice.kind === "disclosure" ? [] : choice.selected
  for (const feature of pageFeatures) {
    if (choice.kind === "disclosure" || choice.kind === "feature" && choice.feature !== feature) continue
    const path = featurePaths[feature]
    const chosen = selected.includes(feature)
    const scopes: readonly ("www" | "music" | "browser")[] = feature === "browser-menu" ? ["browser"] : feature === "shortcuts" || feature === "any-tab-keys" ? ["www", "music"] : feature === "music-actions" || feature === "music-keys" ? ["music"] : ["www"]
    const primary = feature === "browser-menu" ? access.www && access.browserMenu : feature === "music-actions" || feature === "music-keys" ? access.music : access.www
    const on = chosen && (choice.kind !== "feature" || primary || feature === "any-tab-keys")
    settings = { ...settings, [path]: { ...settings[path], on } }
    if (feature === "shortcuts" && choice.kind === "feature" && on && !access.music) settings.shortcuts = { ...settings.shortcuts, music: false }
    if (!chosen) continue
    for (const scope of scopes) {
      const allowed = scope === "browser" ? access.www && access.browserMenu : access[scope]
      const enabled = on && (feature !== "shortcuts" || scope !== "music" || settings.shortcuts.music)
      applications.push({ feature, scope, state: allowed && enabled ? { kind: "enabled" } : enabled ? { kind: "held", reason: scope === "browser" && !access.browserMenu ? "browser-menu-permission" : "site-access" } : { kind: "off", reason: "denied-access" } })
    }
    if (on && (feature === "shortcuts" && !settings.shortcuts.preset || feature === "music-keys" && !settings.musicKeys.preset)) {
      if (feature === "shortcuts" && !context) return { kind: "unavailable", reason: "creation-context" }
      if (feature === "shortcuts" && (!context || !isShortcutId(context.shortcutId) || reserved.has(context.shortcutId) || settings.shortcuts.list.length >= 20)) return invalid
      const preset = applyPresets(settings, feature === "shortcuts" && context ? { feature, shortcutId: context.shortcutId, reservedShortcutIds: reserved } : { feature: "music-keys" })
      settings = detachAgreement(preset.settings) as Settings; blocked.push(...preset.blocked)
    }
    if (on && feature === "music-actions" && !settings.musicActions.preset) settings.musicActions = { ...settings.musicActions, preset: true }
  }
  let rawDevice = state.rawDevice
  if (!rawDevice) {
    if (!context || !agreementObject(context) || typeof context.deviceId !== "string" || !context.deviceId.trim()) return { kind: "unavailable", reason: "creation-context" }
    rawDevice = { id: context.deviceId, consent: null, syncOn: false }
  }
  const device: JsonObject = { ...rawDevice, consent: { ...consent } }
  if (choice.kind === "upgrade-note") {
    const note = state.device?.upgradeNote
    if (!note || note.state !== "pending" || !agreementObject(rawDevice.upgradeNote)) return { kind: "unavailable", reason: "upgrade-note" }
    if (choice.percentage !== "keep" && !note.details.pct.wasUnset) return invalid
    if (choice.percentage !== "keep") settings.autoAdd = { ...settings.autoAdd, pct: choice.percentage === "half" ? 50 : 0 }
    device.upgradeNote = { ...rawDevice.upgradeNote, state: "done" }
  }
  const prepared = prepareDocumentBody({ kind: "settings", data: settings })
  if (prepared.kind !== "prepared") return invalid
  return { kind: "prepared", device, settings: sameSyncJson(original.data, prepared.data) ? undefined : prepared.data, blocked, applications,
    clearProgress: state.settings.autoAdd.on && !settings.autoAdd.on }
}
