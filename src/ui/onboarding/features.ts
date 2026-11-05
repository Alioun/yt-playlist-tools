import type { I18n } from "../../shared/i18n"
import type { FeatureId } from "../../shared/contracts/vocabulary"

export type PageFeatureId = Exclude<FeatureId, "sync">
export type Footprint = "none" | "keys" | "buttons" | "right-click"
export type FeatureGroup = "youtube" | "music" | "everywhere"
export type BrowserKind = "chrome" | "firefox"

export type FirstRunFeature = {
  readonly id: PageFeatureId
  readonly footprint: Footprint
  readonly group: FeatureGroup
  readonly needsMusicAccess: boolean
}

export const firstRunFeatures: readonly FirstRunFeature[] = [
  { id: "auto-add", group: "youtube", footprint: "none", needsMusicAccess: false },
  { id: "shortcuts", group: "youtube", footprint: "keys", needsMusicAccess: true },
  { id: "quick-save", group: "youtube", footprint: "buttons", needsMusicAccess: false },
  { id: "queue-button", group: "youtube", footprint: "buttons", needsMusicAccess: false },
  { id: "watch-button", group: "youtube", footprint: "buttons", needsMusicAccess: false },
  { id: "card-menu", group: "youtube", footprint: "right-click", needsMusicAccess: false },
  { id: "browser-menu", group: "youtube", footprint: "none", needsMusicAccess: false },
  { id: "gather", group: "youtube", footprint: "none", needsMusicAccess: false },
  { id: "music-actions", group: "music", footprint: "buttons", needsMusicAccess: true },
  { id: "music-keys", group: "music", footprint: "keys", needsMusicAccess: true },
  { id: "any-tab-keys", group: "everywhere", footprint: "keys", needsMusicAccess: true }
]

const byId = new Map(firstRunFeatures.map(feature => [feature.id, feature]))

export function featureOf(id: PageFeatureId): FirstRunFeature {
  const feature = byId.get(id)
  if (!feature) throw new Error(`Unknown first-run feature ${id}`)
  return feature
}

export function isPageFeature(value: unknown): value is PageFeatureId {
  return typeof value === "string" && byId.has(value as PageFeatureId)
}

export function inCatalogueOrder(ids: Iterable<PageFeatureId>): PageFeatureId[] {
  const wanted = new Set(ids)
  return firstRunFeatures.filter(feature => wanted.has(feature.id)).map(feature => feature.id)
}

type LocalizedFeature = FirstRunFeature & { readonly name: string; readonly description: string }

export function createFeatureCopy(i18n: I18n) {
  const footprintText = {
    none: i18n.message("footprintText_none"),
    keys: i18n.message("footprintText_keys"),
    buttons: i18n.message("footprintText_buttons"),
    "right-click": i18n.message("footprintText_right_click")
  } as const satisfies Record<Footprint, string>

  const groupHeading = {
    youtube: i18n.message("groupHeading_youtube"),
    music: i18n.message("groupHeading_music"),
    everywhere: i18n.message("groupHeading_everywhere")
  } as const satisfies Record<FeatureGroup, string>

  // Playlist shortcuts asks for YouTube Music because its first-switch preset turns "Also on YouTube Music" on (FT-44).
  const labels = {
    "auto-add": { name: i18n.message("feature_name_1"), description: i18n.message("feature_description_1") },
    "shortcuts": { name: i18n.message("feature_name_2"), description: i18n.message("feature_description_2") },
    "quick-save": { name: i18n.message("feature_name_3"), description: i18n.message("feature_description_3") },
    "queue-button": { name: i18n.message("feature_name_4"), description: i18n.message("feature_description_4") },
    "watch-button": { name: i18n.message("feature_name_5"), description: i18n.message("feature_description_5") },
    "card-menu": { name: i18n.message("feature_name_6"), description: i18n.message("feature_description_6") },
    "browser-menu": { name: i18n.message("feature_name_7"), description: i18n.message("feature_description_7") },
    "gather": { name: i18n.message("feature_name_8"), description: i18n.message("feature_description_8") },
    "music-actions": { name: i18n.message("feature_name_9"), description: i18n.message("feature_description_9") },
    "music-keys": { name: i18n.message("feature_name_10"), description: i18n.message("feature_description_10") },
    "any-tab-keys": { name: i18n.message("feature_name_11"), description: i18n.message("feature_description_11") }
  } satisfies Record<PageFeatureId, { readonly name: string; readonly description: string }>
  const localized: readonly LocalizedFeature[] = firstRunFeatures.map(feature => ({ ...feature, ...labels[feature.id] }))

  const syncFeature = {
    name: i18n.message("feature_name_12"),
    footprint: "none",
    description: (kind: BrowserKind) => i18n.message(kind === "firefox" ? "feature_sync_firefox" : "feature_sync_chrome")
  } as const

  return {
    footprintText,
    groupHeading,
    firstRunFeatures: localized,
    syncFeature,
    featureOf: (id: PageFeatureId) => {
      const feature = localized.find(feature => feature.id === id)
      if (!feature) throw new Error(`Unknown first-run feature ${id}`)
      return feature
    }
  }
}
