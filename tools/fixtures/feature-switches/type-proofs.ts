import type { FeatureSettingChange, FeatureSettingAnswer } from "../../../src/shared/contracts/shared-settings"
import type { UiMessages } from "../../../src/shared/contracts/ui"
import type { BrowserStartingOwner } from "../../../src/background/adapters/starting-owner"
import type { FeatureSettingWriteResult } from "../../../src/background/store/feature-settings-execution"
import type { Backend } from "../../../src/ui/backend/backend"
import type { Settings } from "../../../src/shared/model"
import type { featureSettings } from "../../../src/shared/model/first-run-view"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type Proofs = [
  Check<Equal<Parameters<BrowserStartingOwner["changeFeatureSetting"]>[1], FeatureSettingChange>>,
  Check<Equal<ReturnType<BrowserStartingOwner["changeFeatureSetting"]>, Promise<FeatureSettingWriteResult>>>,
  Check<Equal<ReturnType<Backend["changeFeatureSetting"]>, Promise<FeatureSettingAnswer>>>,
  Check<Equal<Extract<UiMessages["ui.change"]["payload"]["change"], { kind: "feature" | "music-section" | "shortcuts-music" }>, FeatureSettingChange>>,
  Check<Equal<Extract<UiMessages["ui.change"]["result"], { kind: "feature-setting" }>["outcome"], FeatureSettingAnswer>>,
  Check<Equal<keyof UiMessages, "ui.clearAll" | "ui.change" | "ui.syncedChoices" | "ui.accountInView" | "ui.playlists" | "ui.create" | "ui.resolveChannel" | "ui.status" | "ui.pause" | "ui.recentAdds" | "ui.device" | "ui.filter" | "ui.filterChannel" | "ui.removeKeptFilters" | "ui.diagnostics" | "ui.withdraw" | "ui.removeSetup" | "ui.exportSettings" | "ui.importSettings" | "ui.noteSeen" | "ui.noteAgree" | "ui.playingNow" | "ui.add" | "ui.gather" | "ui.gatherUndo" | "ui.gathers" | "ui.claimSeen" | "ui.discardUnclaimed">>,
  Check<Equal<Extract<FeatureSettingChange, { kind: "feature" }>["feature"], keyof typeof featureSettings>>,
  Check<Equal<Extract<FeatureSettingChange, { kind: "music-section" }>["value"], Settings["musicSection"]>>,
  Check<Equal<Extract<FeatureSettingChange, { kind: "shortcuts-music" }>["value"], Settings["shortcuts"]["music"]>>
]
