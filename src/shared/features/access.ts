import type { FirstRunFeature } from "../contracts/first-run"
import type { Site } from "../contracts/vocabulary"
import { featureSettings } from "../model/first-run-view"
import type { Settings } from "../model/types"
import type { Snapshot } from "../model/settings-view"

export const musicFeatures: readonly FirstRunFeature[] = ["music-actions", "music-keys"]
export const wwwRows: readonly FirstRunFeature[] = ["auto-add", "shortcuts", "quick-save", "queue-button", "watch-button", "card-menu", "browser-menu", "gather"]

export function isOn(settings: Snapshot<Settings>, feature: FirstRunFeature): boolean {
  return settings[featureSettings[feature]].on
}
/** Whether a site's access counts as missing for the badge and the banner (FT-46, FT-47, R53). */
export function needsAccess(site: Site, settings: Snapshot<Settings>): boolean {
  if (site === "www") return wwwRows.some(feature => isOn(settings, feature)) || settings.anyTabKeys.on
  return settings.musicSection && (musicFeatures.some(feature => isOn(settings, feature)) || settings.shortcuts.on && settings.shortcuts.music)
}
