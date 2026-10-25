import { decodeSettings, isPercent, normalizeSettingsForWrite } from "../../shared/model"
import type { Settings } from "../../shared/model"

type Snapshot<T> = T extends object
  ? { readonly [P in keyof T]: Snapshot<T[P]> }
  : T

export type SharedSettingChange =
  | { readonly kind: "theme"; readonly value: Settings["theme"] }
  | { readonly kind: "default-percentage"; readonly value: number }

export type SharedSettingResult =
  | { readonly kind: "unchanged" }
  | { readonly kind: "invalid"; readonly reason: "invalid-percentage" }
  | { readonly kind: "changed"; readonly settings: Settings }

export function changeSharedSetting(input: {
  readonly current: Snapshot<Settings>
  readonly change: SharedSettingChange
}): SharedSettingResult {
  const { current, change } = input
  let settings: Settings
  switch (change.kind) {
    case "theme":
      if (current.theme === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.theme = change.value
      break
    case "default-percentage":
      if (!isPercent(change.value)) return { kind: "invalid", reason: "invalid-percentage" }
      if (current.autoAdd.pct === change.value) return { kind: "unchanged" }
      settings = decodeSettings(current)
      settings.autoAdd.pct = change.value
      break
  }
  return { kind: "changed", settings: normalizeSettingsForWrite(settings) }
}
