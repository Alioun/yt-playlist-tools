import { objectShape } from "./object-shape"
import { isAccountKey, isPlaylistId, isPercent, type AccountKey, type PlaylistId } from "../model/validation"
import type { AutoAddPlaylist } from "../model/types"

type Takes = AutoAddPlaylist["takes"]
export type AutoAddLifetime = string & { readonly __brand: "AutoAddLifetime" }
export type AutoAddFact =
  | { readonly kind: "absent" }
  | { readonly kind: "selected"; readonly takes: Takes; readonly pct: number | null }
export type AutoAddEdit =
  | { readonly kind: "auto-add"; readonly expected: boolean; readonly chosen: boolean }
  | { readonly kind: "takes"; readonly expected: Takes; readonly takes: Takes }
  | { readonly kind: "percentage"; readonly expected: number | null; readonly pct: number | null }
export type AutoAddReadChange = { readonly kind: "auto-add-read"; readonly acct: AccountKey; readonly playlist: PlaylistId }
export type AutoAddChoiceChange = {
  readonly kind: "auto-add-choice"
  readonly acct: AccountKey
  readonly playlist: PlaylistId
  readonly lifetime: AutoAddLifetime
  readonly edit: AutoAddEdit
}
export type AutoAddRefusal = { readonly kind: "refused"; readonly reason: "private" | "invalid" | "stale" | "sync-full" | "update-needed" | "rejected" | "unconfirmed" | "unavailable" }
export type AutoAddReadAnswer = AutoAddRefusal | {
  readonly kind: "value"; readonly acct: AccountKey; readonly playlist: PlaylistId; readonly lifetime: AutoAddLifetime; readonly fact: AutoAddFact
}
export type AutoAddChoiceAnswer = AutoAddRefusal | {
  readonly kind: "auto-add-confirmed"; readonly acct: AccountKey; readonly playlist: PlaylistId; readonly fact: AutoAddFact
}
const takes = (v: unknown): v is Takes => v === "videos" || v === "shorts" || v === "both"
const pct = (v: unknown) => v === null || isPercent(v)
const boolean = (v: unknown) => typeof v === "boolean"
export function isAutoAddLifetime(v: unknown): v is AutoAddLifetime {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
}
export function isAutoAddFact(v: unknown): v is AutoAddFact {
  return objectShape(v, { kind: x => x === "absent" })
    || objectShape(v, { kind: x => x === "selected", takes, pct })
}
export function isAutoAddEdit(v: unknown): v is AutoAddEdit {
  return objectShape(v, { kind: x => x === "auto-add", expected: boolean, chosen: boolean })
    || objectShape(v, { kind: x => x === "takes", expected: takes, takes })
    || objectShape(v, { kind: x => x === "percentage", expected: pct, pct })
}
export function isAutoAddReadChange(v: unknown): v is AutoAddReadChange {
  return objectShape(v, { kind: x => x === "auto-add-read", acct: isAccountKey, playlist: isPlaylistId })
}
export function isAutoAddChoiceChange(v: unknown): v is AutoAddChoiceChange {
  return objectShape(v, { kind: x => x === "auto-add-choice", acct: isAccountKey, playlist: isPlaylistId, lifetime: isAutoAddLifetime, edit: isAutoAddEdit })
}
export function isAutoAddRefusal(v: unknown): v is AutoAddRefusal {
  return objectShape(v, { kind: x => x === "refused", reason: x => x === "private" || x === "invalid" || x === "stale" || x === "sync-full" || x === "update-needed" || x === "rejected" || x === "unconfirmed" || x === "unavailable" })
}
export function isAutoAddReadAnswer(v: unknown): v is AutoAddReadAnswer {
  return isAutoAddRefusal(v) || objectShape(v, { kind: x => x === "value", acct: isAccountKey, playlist: isPlaylistId, lifetime: isAutoAddLifetime, fact: isAutoAddFact })
}
export function isAutoAddChoiceAnswer(v: unknown): v is AutoAddChoiceAnswer {
  return isAutoAddRefusal(v) || objectShape(v, { kind: x => x === "auto-add-confirmed", acct: isAccountKey, playlist: isPlaylistId, fact: isAutoAddFact })
}
export function confirmsAutoAdd(change: AutoAddChoiceChange, answer: AutoAddChoiceAnswer): boolean {
  if (answer.kind === "refused") return true
  if (answer.acct !== change.acct || answer.playlist !== change.playlist) return false
  const edit = change.edit, fact = answer.fact
  switch (edit.kind) {
    case "auto-add": return (fact.kind === "selected") === edit.chosen
    case "takes": return fact.kind === "selected" && fact.takes === edit.takes
    case "percentage": return fact.kind === "selected" && fact.pct === edit.pct
  }
}
