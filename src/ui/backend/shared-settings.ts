import type { Settings } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import { isFeatureSettingChange, type FeatureSettingChange, type FeatureSettingAnswer } from "../../shared/contracts/shared-settings"
import type { PermissionNeeds } from "../../shared/contracts/first-run"
import type { Access } from "./backend"

export function featurePermissionNeeds(change: FeatureSettingChange, settings: Snapshot<Settings>): PermissionNeeds {
  return {
    music: change.value && (change.kind === "shortcuts-music" ? settings.shortcuts.on : change.kind === "feature" &&
      (change.feature === "music-actions" || change.feature === "music-keys" || change.feature === "any-tab-keys" ||
        change.feature === "shortcuts" && (!settings.shortcuts.preset || settings.shortcuts.music))),
    browserMenu: change.value && change.kind === "feature" && change.feature === "browser-menu"
  }
}

export function changeFeatureFromClick(input: {
  readonly access: Access; readonly active: () => boolean
  readonly send: (change: FeatureSettingChange) => Promise<FeatureSettingAnswer>
}, change: FeatureSettingChange, settings: Snapshot<Settings>): Promise<FeatureSettingAnswer> {
  if (!input.active() || !isFeatureSettingChange(change)) return Promise.resolve({ kind: "refused", reason: "unavailable" })
  const requested = structuredClone(change), needs = featurePermissionNeeds(requested, settings)
  let permission: Promise<unknown>
  try {
    // Keep the native request in the click's synchronous call stack.
    permission = needs.music || needs.browserMenu ? input.access.requestCombined(needs) : Promise.resolve()
  } catch { return Promise.resolve({ kind: "refused", reason: "unavailable" }) }
  return permission.then(async (): Promise<FeatureSettingAnswer> => {
    if (!input.active()) return { kind: "refused", reason: "unavailable" }
    const answer = await input.send(requested)
    if (!input.active()) return { kind: "refused", reason: "unavailable" }
    if (answer.kind === "confirmed" && JSON.stringify(answer.change) !== JSON.stringify(requested)) return { kind: "refused", reason: "unconfirmed" }
    return answer
  }, (): FeatureSettingAnswer => ({ kind: "refused", reason: "unavailable" }))
}
