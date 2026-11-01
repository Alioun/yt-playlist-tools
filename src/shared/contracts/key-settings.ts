import { isKey, isShortcutId, type Key, type Settings, type ShortcutId } from "../model"
import type { ShortcutTarget, Site } from "../keys"
import { objectShape } from "./object-shape"

export type ConflictObservation = { readonly target: ShortcutTarget; readonly key: Readonly<Key>; readonly sites: readonly Site[] }
export type KeyAssignmentChange = {
  readonly kind: "key"
  readonly target: ShortcutTarget
  readonly expected: Readonly<Key> | null
  readonly key: Readonly<Key> | null
  readonly confirmation: { readonly kind: "none" } | { readonly kind: "use-here"; readonly conflicts: readonly ConflictObservation[] }
}
export type ShortcutRow = Readonly<Settings["shortcuts"]["list"][number]>
export type KeySettingChange =
  | KeyAssignmentChange
  | { readonly kind: "shortcut-add" }
  | { readonly kind: "shortcut-label"; readonly id: ShortcutId; readonly expected: string; readonly value: string }
  | { readonly kind: "shortcut-watch-later"; readonly id: ShortcutId; readonly expected: boolean; readonly value: boolean }
  | { readonly kind: "shortcut-remove"; readonly id: ShortcutId; readonly expected: ShortcutRow }
  | { readonly kind: "shortcut-undo"; readonly receipt: string }
export type KeySettingRefusal = "invalid" | "missing-target" | "stale" | "limit" | "expired" | "unavailable" |
  "sync-full" | "update-needed" | "rejected" | "unconfirmed"
export type KeySettingAnswer =
  | { readonly kind: "confirmed"; readonly change: KeySettingChange; readonly status: "changed" | "unchanged" }
  | { readonly kind: "added"; readonly id: ShortcutId }
  | { readonly kind: "removed"; readonly id: ShortcutId; readonly receipt: string; readonly undoForMs: 6000 }
  | { readonly kind: "conflict"; readonly conflicts: readonly ConflictObservation[] }
  | { readonly kind: "refused"; readonly reason: KeySettingRefusal }

const boolean = (raw: unknown) => typeof raw === "boolean"
const text = (raw: unknown) => typeof raw === "string"
export function isWireKey(raw: unknown): raw is Key {
  return isKey(raw) && objectShape(raw, { code: text, ctrl: boolean, alt: boolean, shift: boolean, meta: boolean }, { char: text })
}
const nullableKey = (raw: unknown) => raw === null || isWireKey(raw)
export function isShortcutTarget(raw: unknown): raw is ShortcutTarget {
  return objectShape(raw, { kind: v => v === "undo" || v === "picker" })
    || objectShape(raw, { kind: v => v === "playlist", id: isShortcutId })
    || objectShape(raw, { kind: v => v === "music", action: v => typeof v === "string" &&
      ["next", "queue", "save", "picker", "like", "remove", "library", "mix", "album", "artist"].includes(v) })
}
export function isConflictObservations(raw: unknown): raw is readonly ConflictObservation[] {
  return Array.isArray(raw) && raw.length <= 32 && raw.every(row => objectShape(row, { target: isShortcutTarget, key: isWireKey,
    sites: v => Array.isArray(v) && v.length > 0 && v.length <= 2 && new Set(v).size === v.length && v.every(site => site === "www" || site === "music") })) &&
    new Set(raw.map(row => JSON.stringify(row.target))).size === raw.length
}
export function isShortcutRow(raw: unknown): raw is ShortcutRow {
  return objectShape(raw, { id: isShortcutId, key: nullableKey, label: text, watchLaterOnEveryAccount: boolean })
}
export function isUndoReceipt(raw: unknown): raw is string {
  return typeof raw === "string" && /^undo:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)
}
export function isKeySettingChange(raw: unknown): raw is KeySettingChange {
  return objectShape(raw, { kind: v => v === "key", target: isShortcutTarget, expected: nullableKey, key: nullableKey,
    confirmation: v => objectShape(v, { kind: k => k === "none" }) || objectShape(v, { kind: k => k === "use-here", conflicts: isConflictObservations }) })
    || objectShape(raw, { kind: v => v === "shortcut-add" })
    || objectShape(raw, { kind: v => v === "shortcut-label", id: isShortcutId, expected: text, value: text })
    || objectShape(raw, { kind: v => v === "shortcut-watch-later", id: isShortcutId, expected: boolean, value: boolean })
    || objectShape(raw, { kind: v => v === "shortcut-remove", id: isShortcutId, expected: isShortcutRow }) && isShortcutRow(raw.expected) && raw.id === raw.expected.id
    || objectShape(raw, { kind: v => v === "shortcut-undo", receipt: isUndoReceipt })
}
export function isKeySettingAnswer(raw: unknown): raw is KeySettingAnswer {
  return objectShape(raw, { kind: v => v === "confirmed", change: isKeySettingChange, status: v => v === "changed" || v === "unchanged" })
    || objectShape(raw, { kind: v => v === "added", id: isShortcutId })
    || objectShape(raw, { kind: v => v === "removed", id: isShortcutId, receipt: isUndoReceipt, undoForMs: v => v === 6000 })
    || objectShape(raw, { kind: v => v === "conflict", conflicts: isConflictObservations })
    || objectShape(raw, { kind: v => v === "refused", reason: v => typeof v === "string" &&
      ["invalid", "missing-target", "stale", "limit", "expired", "unavailable", "sync-full", "update-needed", "rejected", "unconfirmed"].includes(v) })
}
