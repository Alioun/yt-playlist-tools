import { decodeSettings, isShortcutId, readStoredUnclaimed, type Settings, type ShortcutId } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import { featureSettings } from "../../shared/model/first-run-view"
import { applyPresets, type PresetConflict } from "../../shared/keys/bindings"
import type { FeatureSettingChange } from "../../shared/contracts/shared-settings"
import type { JsonObject } from "../../shared/contracts/json"
import type { AgreementAccess } from "./consent-agreement"

export type FeatureAccess = {
  read(): Promise<AgreementAccess | undefined>
  releaseBrowserMenu(): Promise<{ readonly kind: "released" } | { readonly kind: "unconfirmed" }>
}
export type FeaturePlan =
  | { readonly kind: "refused"; readonly reason: "site-access" | "browser-menu-permission" | "invalid" | "unavailable" }
  | { readonly kind: "planned"; readonly settings: Settings; readonly limitedMusic: boolean; readonly blocked: readonly PresetConflict[] }

export function planFeatureSetting(input: {
  readonly current: Snapshot<Settings>
  readonly records: JsonObject
  readonly change: FeatureSettingChange
  readonly access: AgreementAccess | undefined
  readonly allocateShortcut: () => string
}): FeaturePlan {
  const { change, records, access } = input
  let settings = decodeSettings(input.current)
  const blocked: PresetConflict[] = []
  let limitedMusic = false
  if (change.kind === "music-section") {
    settings.musicSection = change.value
  } else if (change.kind === "shortcuts-music") {
    if (change.value && settings.shortcuts.on && !access?.music) return { kind: "refused", reason: access ? "site-access" : "unavailable" }
    settings.shortcuts.music = change.value
  } else {
    const path = featureSettings[change.feature]
    if (change.value) {
      if (!access) return { kind: "refused", reason: "unavailable" }
      if ((change.feature === "music-actions" || change.feature === "music-keys") && !access.music) return { kind: "refused", reason: "site-access" }
      if (change.feature === "browser-menu" && !access.browserMenu) return { kind: "refused", reason: "browser-menu-permission" }
      if (change.feature !== "music-actions" && change.feature !== "music-keys" && change.feature !== "any-tab-keys" && !access.www) return { kind: "refused", reason: "site-access" }
    }
    settings = { ...settings, [path]: { ...settings[path], on: change.value } }
    if (change.value && change.feature === "shortcuts" && !settings.shortcuts.preset) {
      const reserved = new Set<ShortcutId>(settings.shortcuts.list.map(row => row.id).filter(isShortcutId))
      const pending = readStoredUnclaimed(records.unclaimed)
      if (pending.kind === "pending" && isShortcutId(pending.data.originalShortcutId)) reserved.add(pending.data.originalShortcutId)
      // Setup targets can retain identities after the corresponding shortcut was deleted.
      for (const [name, raw] of Object.entries(records)) {
        if (!name.startsWith("doc:setup:") || !raw || typeof raw !== "object" || Array.isArray(raw)) continue
        const data = raw.data
        if (!data || typeof data !== "object" || Array.isArray(data)) continue
        const targets = data.targets
        if (targets && typeof targets === "object" && !Array.isArray(targets)) for (const id of Object.keys(targets)) if (isShortcutId(id)) reserved.add(id)
      }
      let id: string | undefined
      for (let attempt = 0; attempt < 32; attempt++) {
        const candidate = input.allocateShortcut()
        if (isShortcutId(candidate) && !reserved.has(candidate)) {
          id = candidate
          break
        }
      }
      if (!id || settings.shortcuts.list.length >= 20) return { kind: "refused", reason: "invalid" }
      const preset = applyPresets(settings, { feature: "shortcuts", shortcutId: id, reservedShortcutIds: reserved })
      settings = decodeSettings(preset.settings)
      blocked.push(...preset.blocked)
      settings.shortcuts.music = true
    }
    if (change.value && change.feature === "music-keys" && !settings.musicKeys.preset) {
      const preset = applyPresets(settings, { feature: "music-keys" })
      settings = decodeSettings(preset.settings)
      blocked.push(...preset.blocked)
    }
    if (change.value && change.feature === "music-actions" && !settings.musicActions.preset) settings.musicActions.preset = true
    if (change.value && change.feature === "shortcuts" && settings.shortcuts.music && !access?.music) {
      settings.shortcuts.music = false
      limitedMusic = true
    }
    if (change.value && change.feature === "any-tab-keys" && !access?.music) limitedMusic = true
  }
  return { kind: "planned", settings, limitedMusic, blocked }
}
