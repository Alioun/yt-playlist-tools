import type { I18n, SimpleMessageKey } from "../../shared/i18n"
import type { HealthGap, UiFeatureHealth } from "../../shared/contracts/ui-pages"
import type { FeatureId } from "../../shared/contracts/vocabulary"
import type { createFeatureCopy } from "../onboarding/features"

type FeatureCopy = ReturnType<typeof createFeatureCopy>
export function featureName(features: FeatureCopy, feature: FeatureId): string {
  return feature === "sync" ? features.syncFeature.name : features.featureOf(feature).name
}
/** The popup's breakage strip for one site (UI-POP-09): the first not-working feature, a count, or a partly working one. */
export function stripLine(i18n: I18n, features: FeatureCopy, health: readonly UiFeatureHealth[]): string | null {
  const broken = health.filter(row => row.state === "not-working")
  const [first] = broken
  if (broken.length > 1) return i18n.message("strip_many", { count: i18n.number(broken.length) })
  if (first) return i18n.message(first.site === "music" ? "strip_one_music" : "strip_one_www", { feature: featureName(features, first.feature) })
  const partly = health.find(row => row.state === "partly-working")
  return partly ? i18n.message("strip_partly", { feature: featureName(features, partly.feature) }) : null
}
// One whole sentence per gap, since a sentence built from translated pieces can't be translated (UI-RULE-43).
const partlyLines = {
  playlists: "health_partly_playlists",
  actions: "health_partly_actions",
  casting: "health_partly_casting",
  measure: "health_partly_measure",
  player: "health_partly_player",
  queue: "health_partly_queue",
  playlist: "health_partly_playlist"
} as const satisfies Record<Exclude<HealthGap, "membership">, SimpleMessageKey>
/** A feature's health line on one site (UI-SET-09), for its settings card, its popup row and its Diagnostics row. */
export function healthLine(i18n: I18n, row: UiFeatureHealth | undefined): string | null {
  if (!row || row.state === "working") return null
  if (row.state === "not-working") return i18n.message(row.site === "music" ? "health_notWorking_music" : "health_notWorking_www")
  const gap = row.gaps[0]
  if (gap === undefined) return i18n.message("health_partly_other")
  if (gap === "membership") return i18n.message(row.site === "music" ? "health_partly_membership_music" : "health_partly_membership_www")
  return i18n.message(partlyLines[gap])
}
