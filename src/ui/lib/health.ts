import type { I18n } from "../../shared/i18n"
import type { UiFeatureHealth } from "../../shared/contracts/ui-pages"
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
/** A settings card's health line (UI-SET-09). */
export function healthLine(i18n: I18n, row: UiFeatureHealth | undefined): string | null {
  if (!row || row.state === "working") return null
  if (row.state === "not-working") return i18n.message(row.site === "music" ? "health_notWorking_music" : "health_notWorking_www")
  const gap = row.gaps[0]
  const text = gap === "membership" ? i18n.message("health_gap_membership") : gap === "actions" ? i18n.message("health_gap_actions")
    : gap === "measure" ? i18n.message("health_gap_measure")
    : gap ? i18n.message("health_gap_destination", { destination: i18n.message(gap === "player" ? "gather_destination_player" : gap === "queue" ? "gather_destination_queue" : "gather_into_playlist") })
    : i18n.message("health_gap_actions")
  return i18n.message("health_partly", { gap: text })
}
