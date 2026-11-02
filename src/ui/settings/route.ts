import type { FeatureId } from "../../shared/contracts/vocabulary"
import { isFeatureId } from "../../shared/contracts/vocabulary"
import { isPlaylistId, type PlaylistId } from "../../shared/model/validation"

export const sections = ["youtube", "music", "everywhere", "accounts", "appearance", "privacy", "diagnostics", "about"] as const
export type Section = (typeof sections)[number]
export type Route = { readonly section: Section; readonly feature?: FeatureId; readonly playlist?: PlaylistId }
export const featureSection = {
  "auto-add": "youtube", shortcuts: "youtube", "quick-save": "youtube", "queue-button": "youtube", "watch-button": "youtube",
  "card-menu": "youtube", "browser-menu": "youtube", gather: "youtube", "music-actions": "music", "music-keys": "music",
  "any-tab-keys": "everywhere", sync: "everywhere"
} as const satisfies Record<FeatureId, Section>

/** Settings' hash routes (UI-SET-04, UI-SET-05, UI-IA-09): a section, or a feature's card and one of its playlists. */
export function parseRoute(hash: string): Route {
  const [head = "", ...rest] = hash.replace(/^#/, "").split("&")
  if ((sections as readonly string[]).includes(head)) return { section: head as Section }
  if (head.startsWith("feature-")) {
    const feature = head.slice("feature-".length)
    if (isFeatureId(feature)) {
      const playlist = rest.map(part => part.split("=")).find(([key]) => key === "playlist")?.[1]
      const decoded = playlist === undefined ? undefined : decodeURIComponent(playlist)
      return { section: featureSection[feature], feature, ...(isPlaylistId(decoded) ? { playlist: decoded } : {}) }
    }
  }
  return { section: "youtube" }
}
