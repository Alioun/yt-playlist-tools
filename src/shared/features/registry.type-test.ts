import type { FeatureId, JobId, Site } from "../contracts/vocabulary"
import type { MusicAction } from "../model/types"
import type { RegistrationFeature, SettingsPath } from "./registration"
import { features, type FeatureDef, type HealthDependencies } from "./registry"

export const registrarRegistry: readonly RegistrationFeature[] = features
export const validSetting: SettingsPath = "autoAdd"
export const validHealth: HealthDependencies = { required: ["add"], optional: ["remove"], anchors: ["www-cards"] }
export const validFeature: FeatureDef = {
  id: "sync", setting: "device.syncOn", footprint: "none", pages: {}, health: {}
}

// @ts-expect-error A missing Settings key cannot select a feature.
export const missingSetting: FeatureDef["setting"] = "missingSetting"
// @ts-expect-error The section gate is not a feature's on-switch.
export const sectionSetting: SettingsPath = "musicSection"
// @ts-expect-error Feature IDs come from the contracts vocabulary.
export const unknownFeature: FeatureId = "unknown-feature"
// @ts-expect-error Job IDs come from the contracts vocabulary.
export const unknownJob: JobId = "unknownJob"
// @ts-expect-error Only the supported sites can own page entries.
export const unknownSite: Site = "mobile"
// @ts-expect-error Action IDs come from the settings model.
export const unknownAction: MusicAction = "shuffle"
// @ts-expect-error Required jobs must be a list, not an optional-field bag.
export const malformedHealth: HealthDependencies = { required: { add: true }, optional: [], anchors: [] }
// @ts-expect-error Action dependency values must be job lists.
export const malformedAction: HealthDependencies["actions"] = { next: "queueInsert" }
// @ts-expect-error Unknown action keys cannot enter the Monitor's action map.
export const unknownActionDependency: HealthDependencies["actions"] = { shuffle: ["navigate"] }
// @ts-expect-error A lazy library is not an eager page dependency.
export const eagerPopovers: NonNullable<FeatureDef["pages"]["www"]>["needs"] = ["popovers"]
