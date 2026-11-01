import { isFeatureSettingChange, isFeatureSettingAnswer, isSharedSettingChange, isSharedSettingAnswer,
  type FeatureSettingChange, type FeatureSettingAnswer, type SharedSettingChange, type SharedSettingAnswer } from "./shared-settings"
import { isKeySettingChange, isKeySettingAnswer, type KeySettingChange, type KeySettingAnswer } from "./key-settings"
import { objectShape } from "./object-shape"
import { isFeatureId, type FeatureId } from "./vocabulary"
import { isAccountKey, isPlaylistId, isShortcutId, type AccountKey, type PlaylistId, type ShortcutId } from "../model/validation"
import type { RpcContract } from "../rpc/rpc"
import { isAutoAddReadChange, isAutoAddChoiceChange, isAutoAddReadAnswer, isAutoAddChoiceAnswer, type AutoAddReadChange, type AutoAddChoiceChange, type AutoAddReadAnswer, type AutoAddChoiceAnswer } from "./auto-add-choice"
export type { AutoAddReadChange, AutoAddChoiceChange, AutoAddReadAnswer, AutoAddChoiceAnswer } from "./auto-add-choice"

export type FirstRunFeature = Exclude<FeatureId, "sync">
export type PermissionNeeds = { readonly music: boolean; readonly browserMenu: boolean }
export type PermissionGrant = PermissionNeeds
export type FeatureApplication =
  | { readonly feature: Exclude<FirstRunFeature, "shortcuts">; readonly state: "enabled" | "held-site-access" | "held-browser-menu" }
  | { readonly feature: "shortcuts"; readonly state: "enabled"; readonly alsoOnMusic: "enabled" | "held-site-access" }
export type AgreementRefusal = "sync-full" | "update-needed" | "invalid" | "rejected" | "unconfirmed" | "unavailable" | "join-required"
export type AgreementAnswer =
  | { readonly kind: "agreed"; readonly attempt: number; readonly applications: readonly FeatureApplication[] }
  | { readonly kind: "not-agreed"; readonly attempt: number; readonly reason: AgreementRefusal }
export type AgreeChange = {
  readonly kind: "first-run-agree"
  readonly displayedVersion: number
  readonly attempt: number
  readonly selected: readonly FirstRunFeature[]
  readonly syncOn: boolean
}
export type SetupDestination =
  | { readonly kind: "quick-save" | "music-save" | "gather" }
  | { readonly kind: "shortcut"; readonly shortcut: ShortcutId }
export type DestinationExpectation =
  | { readonly setup: "none" }
  | { readonly setup: "live"; readonly playlist: PlaylistId | null }
export type DestinationChange = {
  readonly kind: "setup-destination"
  readonly acct: AccountKey
  readonly destination: SetupDestination
  readonly expected: DestinationExpectation
  readonly playlist: PlaylistId | null
}
export type DestinationAnswer =
  | { readonly kind: "confirmed"; readonly playlist: PlaylistId | null }
  | { readonly kind: "refused"; readonly reason: "private" | "invalid" | "stale" | "sync-full" | "update-needed" | "rejected" | "unconfirmed" | "unavailable" }
export type FirstRunChange = AgreeChange | DestinationChange | AutoAddReadChange | AutoAddChoiceChange
export type Change = FirstRunChange | FeatureSettingChange | SharedSettingChange | KeySettingChange
export type ChangeAnswer =
  | { readonly kind: "feature-setting"; readonly outcome: FeatureSettingAnswer }
  | { readonly kind: "shared-setting"; readonly outcome: SharedSettingAnswer }
  | { readonly kind: "key-setting"; readonly outcome: KeySettingAnswer }
  | { readonly kind: "agreement"; readonly outcome: AgreementAnswer }
  | { readonly kind: "destination"; readonly outcome: DestinationAnswer }
  | { readonly kind: "auto-add-read"; readonly outcome: AutoAddReadAnswer }
  | { readonly kind: "auto-add-choice"; readonly outcome: AutoAddChoiceAnswer }
export type SyncedChoices =
  | { readonly kind: "found"; readonly features: readonly FirstRunFeature[] }
  | { readonly kind: "not-found" | "update-needed" | "unavailable" | "failed" }
export type FirstRunMessages = {
  readonly "ui.change": { readonly payload: { readonly change: Change; readonly windowId?: number }; readonly result: ChangeAnswer }
  readonly "ui.syncedChoices": { readonly payload: { readonly windowId?: number }; readonly result: SyncedChoices }
}

const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const positive = (value: unknown) => integer(value) && value > 0
const boolean = (value: unknown) => typeof value === "boolean"
const playlist = (value: unknown) => value === null || isPlaylistId(value)
export function isFirstRunFeature(value: unknown): value is FirstRunFeature {
  return isFeatureId(value) && value !== "sync"
}
export function isFeatureSelection(value: unknown): value is readonly FirstRunFeature[] {
  return Array.isArray(value) && value.length <= 11 && value.every(isFirstRunFeature) && new Set(value).size === value.length
}
export function isAgreeChange(value: unknown): value is AgreeChange {
  return objectShape(value, { kind: v => v === "first-run-agree", displayedVersion: positive, attempt: positive, selected: isFeatureSelection, syncOn: boolean })
}
export function isSetupDestination(value: unknown): value is SetupDestination {
  return objectShape(value, { kind: v => v === "quick-save" || v === "music-save" || v === "gather" })
    || objectShape(value, { kind: v => v === "shortcut", shortcut: isShortcutId })
}
export function isDestinationExpectation(value: unknown): value is DestinationExpectation {
  return objectShape(value, { setup: v => v === "none" })
    || objectShape(value, { setup: v => v === "live", playlist })
}
export function isDestinationChange(value: unknown): value is DestinationChange {
  return objectShape(value, { kind: v => v === "setup-destination", acct: isAccountKey, destination: isSetupDestination, expected: isDestinationExpectation, playlist })
}
export function isChange(value: unknown): value is Change {
  return isAgreeChange(value) || isDestinationChange(value) || isAutoAddReadChange(value) || isAutoAddChoiceChange(value)
    || isFeatureSettingChange(value) || isSharedSettingChange(value) || isKeySettingChange(value)
}
function isApplication(value: unknown): value is FeatureApplication {
  return objectShape(value, { feature: v => v === "shortcuts", state: v => v === "enabled", alsoOnMusic: v => v === "enabled" || v === "held-site-access" })
    || objectShape(value, {
      feature: v => isFirstRunFeature(v) && v !== "shortcuts",
      state: v => v === "enabled" || v === "held-site-access" || v === "held-browser-menu"
    }) && (value.state !== "held-browser-menu" || value.feature === "browser-menu")
}
function isApplications(value: unknown): value is readonly FeatureApplication[] {
  return Array.isArray(value) && value.length <= 11 && value.every(isApplication) && new Set(value.map(row => row.feature)).size === value.length
}
export function isAgreementAnswer(value: unknown): value is AgreementAnswer {
  return objectShape(value, { kind: v => v === "agreed", attempt: positive, applications: isApplications })
    || objectShape(value, {
      kind: v => v === "not-agreed", attempt: positive,
      reason: v => v === "sync-full" || v === "update-needed" || v === "invalid" || v === "rejected" || v === "unconfirmed" || v === "unavailable" || v === "join-required"
    })
}
export function isDestinationAnswer(value: unknown): value is DestinationAnswer {
  return objectShape(value, { kind: v => v === "confirmed", playlist })
    || objectShape(value, {
      kind: v => v === "refused",
      reason: v => v === "private" || v === "invalid" || v === "stale" || v === "sync-full" || v === "update-needed" || v === "rejected" || v === "unconfirmed" || v === "unavailable"
    })
}
export function isChangeAnswer(value: unknown): value is ChangeAnswer {
  return objectShape(value, { kind: v => v === "feature-setting", outcome: isFeatureSettingAnswer })
    || objectShape(value, { kind: v => v === "shared-setting", outcome: isSharedSettingAnswer })
    || objectShape(value, { kind: v => v === "key-setting", outcome: isKeySettingAnswer })
    || objectShape(value, { kind: v => v === "agreement", outcome: isAgreementAnswer })
    || objectShape(value, { kind: v => v === "destination", outcome: isDestinationAnswer })
    || objectShape(value, { kind: v => v === "auto-add-read", outcome: isAutoAddReadAnswer })
    || objectShape(value, { kind: v => v === "auto-add-choice", outcome: isAutoAddChoiceAnswer })
}
export function isSyncedChoices(value: unknown): value is SyncedChoices {
  return objectShape(value, { kind: v => v === "found", features: isFeatureSelection })
    || objectShape(value, { kind: v => v === "not-found" || v === "update-needed" || v === "unavailable" || v === "failed" })
}
export function isChangePayload(value: unknown): value is FirstRunMessages["ui.change"]["payload"] {
  return objectShape(value, { change: isChange }, { windowId: integer })
}
export function isLookupPayload(value: unknown): value is FirstRunMessages["ui.syncedChoices"]["payload"] {
  return objectShape(value, {}, { windowId: integer })
}
export const firstRunContract: RpcContract<FirstRunMessages> = {
  "ui.change": { payload: isChangePayload, result: isChangeAnswer, timeoutMs: 20_000 },
  "ui.syncedChoices": { payload: isLookupPayload, result: isSyncedChoices, timeoutMs: 12_000 }
}

export function confirmsSelection(change: AgreeChange, answer: AgreementAnswer): boolean {
  return answer.attempt === change.attempt && (answer.kind !== "agreed" || answer.applications.length === change.selected.length
    && new Set(answer.applications.map(row => row.feature)).size === change.selected.length
    && answer.applications.every(row => change.selected.includes(row.feature)))
}
