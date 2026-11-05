import type { FeatureId, Site } from "../../shared/contracts/vocabulary"
import type { Settings } from "../../shared/model/types"
import type { Snapshot } from "../../shared/model/settings-view"
import type { PageFeatureId } from "../onboarding/features"
import { isOn, musicFeatures, needsAccess, wwwRows } from "../../shared/features/access"

export { isOn, musicFeatures, needsAccess, wwwRows }

export type SiteAccess = { readonly www: boolean; readonly music: boolean; readonly browserMenu: boolean }
/** Why a feature that's on can't run yet (UI-POP-21, FT-46, FT-47, FT-60). */
export type Held = "consent" | "site-access" | "music-off" | "browser-menu"

/** The site whose access a feature's held line asks for. */
export function accessSite(feature: PageFeatureId): Site {
  return musicFeatures.includes(feature) ? "music" : "www"
}
export function heldReason(feature: PageFeatureId, settings: Snapshot<Settings>, consented: boolean, access: SiteAccess): Held | null {
  if (!isOn(settings, feature)) return null
  if (!consented) return "consent"
  if (musicFeatures.includes(feature)) return !settings.musicSection ? "music-off" : access.music ? null : "site-access"
  if (!access.www) return "site-access"
  return feature === "browser-menu" && !access.browserMenu ? "browser-menu" : null
}
/** Playlist shortcuts' Also on YouTube Music, held while it's on without YouTube Music access (YM-PS-2). */
export function shortcutsMusicHeld(settings: Snapshot<Settings>, access: SiteAccess): boolean {
  return settings.shortcuts.on && settings.shortcuts.music && settings.musicSection && !access.music
}
export const heldMessage = {
  consent: "shell_waiting",
  "site-access": "held_siteAccess",
  "music-off": "held_musicOff",
  "browser-menu": "held_browserMenu"
} as const satisfies Record<Held, string>
export type { FeatureId }
