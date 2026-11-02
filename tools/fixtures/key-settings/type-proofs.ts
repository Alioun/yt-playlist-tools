import type { UiMessages } from "../../../src/shared/contracts/ui"
import type { KeySettingChange, KeySettingAnswer } from "../../../src/shared/contracts/key-settings"
import type { SharedSettingChange, FeatureSettingChange } from "../../../src/shared/contracts/shared-settings"
import type { BrowserStartingOwner } from "../../../src/background/adapters/starting-owner"
import type { KeySettingsSource } from "../../../src/ui/backend/key-settings"
import type { Backend } from "../../../src/ui/backend/backend"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type Proofs = [
  Check<Equal<Parameters<BrowserStartingOwner["changeKeySetting"]>[1], KeySettingChange>>,
  Check<Equal<ReturnType<BrowserStartingOwner["changeKeySetting"]>, Promise<KeySettingAnswer>>>,
  Check<Equal<Backend["keys"], KeySettingsSource>>,
  Check<Equal<Extract<UiMessages["ui.change"]["payload"]["change"], { kind: KeySettingChange["kind"] }>, KeySettingChange>>,
  Check<Equal<Extract<UiMessages["ui.change"]["payload"]["change"], { kind: SharedSettingChange["kind"] }>, SharedSettingChange>>,
  Check<Equal<Extract<UiMessages["ui.change"]["payload"]["change"], { kind: FeatureSettingChange["kind"] }>, FeatureSettingChange>>,
  Check<Equal<Extract<UiMessages["ui.change"]["result"], { kind: "key-setting" }>["outcome"], KeySettingAnswer>>,
  Check<Equal<keyof UiMessages, "ui.clearAll" | "ui.change" | "ui.syncedChoices" | "ui.accountInView" | "ui.playlists" | "ui.create" | "ui.resolveChannel" | "ui.status" | "ui.pause" | "ui.recentAdds" | "ui.device" | "ui.filter" | "ui.filterChannel" | "ui.removeKeptFilters" | "ui.diagnostics" | "ui.withdraw" | "ui.removeSetup" | "ui.exportSettings" | "ui.importSettings" | "ui.noteSeen" | "ui.noteAgree" | "ui.playingNow" | "ui.add" | "ui.gather" | "ui.gatherUndo" | "ui.gathers" | "ui.claimSeen" | "ui.discardUnclaimed" | "ui.thisTab" | "ui.skip" | "ui.addUndo">>
]
function overloads(backend: Backend, key: KeySettingChange, option: SharedSettingChange, feature: FeatureSettingChange) {
  const a: Promise<KeySettingAnswer> = backend.change(key)
  const b: Promise<import("../../../src/shared/contracts/shared-settings").SharedSettingAnswer> = backend.change(option)
  const c: Promise<import("../../../src/shared/contracts/shared-settings").FeatureSettingAnswer> = backend.change(feature)
  return [a, b, c]
}
void overloads
