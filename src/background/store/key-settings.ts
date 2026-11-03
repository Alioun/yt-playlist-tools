import { keyAt, sameKey, conflictObservations } from "../../shared/contracts/key-settings-fields"
export { keyAt, sameKey, conflictObservations } from "../../shared/contracts/key-settings-fields"
import { decodeSettings, isShortcutId, readStoredUnclaimed, type Settings, type ShortcutId } from "../../shared/model"
import { assignKey } from "../../shared/keys"
import { sameTarget } from "../../shared/keys/match"
import type { ConflictObservation, KeySettingChange, KeySettingAnswer } from "../../shared/contracts/key-settings"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"
import { sameSyncJson } from "./sync-write-admission"

export function sameConflicts(left: readonly ConflictObservation[], right: readonly ConflictObservation[]): boolean {
  return (
    left.length === right.length &&
    left.every(row =>
      right.some(other => sameTarget(row.target, other.target) && sameKey(row.key, other.key) && row.sites.length === other.sites.length && row.sites.every(site => other.sites.includes(site)))
    )
  )
}
export function reservedShortcutIds(settings: Readonly<Settings>, records: JsonObject, retired: readonly ShortcutId[]): Set<ShortcutId> {
  const reserved = new Set<ShortcutId>([...retired, ...settings.shortcuts.list.map(row => row.id).filter(isShortcutId)])
  const unclaimed = readStoredUnclaimed(records.unclaimed)
  if (unclaimed.kind === "pending" && isShortcutId(unclaimed.data.originalShortcutId)) reserved.add(unclaimed.data.originalShortcutId)
  for (const [name, raw] of Object.entries(records)) {
    if (!name.startsWith("doc:setup:") || !raw || typeof raw !== "object" || Array.isArray(raw)) continue
    const data = raw.data
    if (!data || typeof data !== "object" || Array.isArray(data)) continue
    const targets = data.targets
    if (targets && typeof targets === "object" && !Array.isArray(targets)) for (const id of Object.keys(targets)) if (isShortcutId(id)) reserved.add(id)
  }
  return reserved
}
export type KeyPlan = { readonly kind: "answer"; readonly answer: KeySettingAnswer } | { readonly kind: "edit"; readonly settings: Settings; readonly added: ShortcutId | undefined }

export function planKeySetting(input: {
  readonly current: Settings
  readonly records: JsonObject
  readonly change: Exclude<KeySettingChange, { kind: "shortcut-remove" | "shortcut-undo" }>
  readonly retired: readonly ShortcutId[]
  readonly allocate: () => string
}): KeyPlan {
  const { change } = input
  let settings = decodeSettings(input.current)
  const refused = (reason: "stale" | "missing-target" | "limit" | "unavailable"): KeyPlan => ({ kind: "answer", answer: { kind: "refused", reason } })
  if (change.kind === "key") {
    const current = keyAt(settings, change.target)
    if (current === undefined) return refused("missing-target")
    if (!sameKey(current, change.expected)) return refused("stale")
    const conflicts = change.key === null ? [] : conflictObservations(settings, change.target, change.key)
    if (change.confirmation.kind === "none" && conflicts.length) return { kind: "answer", answer: { kind: "conflict", conflicts } }
    if (change.confirmation.kind === "use-here" && !sameConflicts(conflicts, change.confirmation.conflicts)) return refused("stale")
    if (conflicts.length === 0 && sameKey(current, change.key)) return { kind: "answer", answer: { kind: "confirmed", change, status: "unchanged" } }
    const assigned = assignKey(settings, change.target, change.key, change.confirmation.kind === "use-here")
    if (assigned.kind === "missing-target") return refused("missing-target")
    if (assigned.kind === "conflict") return { kind: "answer", answer: { kind: "conflict", conflicts } }
    settings = assigned.settings
  } else if (change.kind === "shortcut-add") {
    if (settings.shortcuts.list.length >= 20) return refused("limit")
    const reserved = reservedShortcutIds(settings, input.records, input.retired)
    let id: ShortcutId | undefined
    for (let attempt = 0; attempt < 32; attempt++) {
      const candidate = input.allocate()
      if (isShortcutId(candidate) && !reserved.has(candidate)) {
        id = candidate
        break
      }
    }
    if (!id) return refused("unavailable")
    settings.shortcuts.list.push({ id, key: null, label: "", watchLaterOnEveryAccount: false })
    return { kind: "edit", settings, added: id }
  } else {
    const row = settings.shortcuts.list.find(row => row.id === change.id)
    if (!row) return refused("missing-target")
    if (change.kind === "shortcut-label") {
      if (row.label !== change.expected) return refused("stale")
      row.label = Array.from(change.value.trim()).slice(0, 40).join("").trim()
    } else {
      if (row.watchLaterOnEveryAccount !== change.expected) return refused("stale")
      row.watchLaterOnEveryAccount = change.value
    }
  }
  if (isJsonValue(settings) && isJsonValue(input.current) && sameSyncJson(settings, input.current))
    return {
      kind: "answer",
      answer: { kind: "confirmed", change, status: "unchanged" }
    }
  return { kind: "edit", settings, added: undefined }
}
