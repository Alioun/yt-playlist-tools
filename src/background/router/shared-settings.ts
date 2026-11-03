import type { FeatureSettingChange, FeatureSettingAnswer, SharedSettingChange, SharedSettingAnswer } from "../../shared/contracts/shared-settings"
import type { createLocalFilterWriter } from "../store/local-filter-writer"
import type { UiContext } from "../adapters/runtime"

export type SharedSettingsOwner = Pick<ReturnType<typeof createLocalFilterWriter>, "changeFeatureSetting" | "changeSharedSetting" | "changeKeySetting">

export async function changeSharedSetting(owner: SharedSettingsOwner, context: UiContext, change: SharedSettingChange): Promise<SharedSettingAnswer> {
  try {
    const result = await owner.changeSharedSetting(context.origin, change)
    switch (result.kind) {
      case "committed":
      case "unchanged":
        return { kind: "confirmed", change, status: result.kind === "committed" ? "changed" : "unchanged" }
      case "result":
        return { kind: "refused", reason: result.result.refused === "sync-full" || result.result.refused === "update-needed" ? result.result.refused : "invalid" }
      case "unavailable":
        return { kind: "refused", reason: result.reason === "stale" ? "stale" : "unavailable" }
      case "unconfirmed":
        return { kind: "refused", reason: "unconfirmed" }
      case "failed":
        return { kind: "refused", reason: "rejected" }
      default: {
        const exhaustive: never = result
        return exhaustive
      }
    }
  } catch {
    return { kind: "refused", reason: "unavailable" }
  }
}

export async function changeFeatureSetting(owner: SharedSettingsOwner, context: UiContext, change: FeatureSettingChange): Promise<FeatureSettingAnswer> {
  try {
    const result = await owner.changeFeatureSetting(context.origin, change)
    switch (result.kind) {
      case "committed":
      case "unchanged":
        return {
          kind: "confirmed",
          change,
          status: result.kind === "committed" ? "changed" : "unchanged",
          limitedMusic: result.limitedMusic,
          conflicts: result.blocked.length,
          menuPermission: result.menuPermission
        }
      case "refused":
        return result
      case "permission-release-unconfirmed":
        return { kind: "refused", reason: "permission-release" }
      case "result":
        return { kind: "refused", reason: result.result.refused === "sync-full" || result.result.refused === "update-needed" ? result.result.refused : "invalid" }
      case "unavailable":
        return { kind: "refused", reason: "unavailable" }
      case "unconfirmed":
        return { kind: "refused", reason: "unconfirmed" }
      case "failed":
        return { kind: "refused", reason: "rejected" }
      default: {
        const exhaustive: never = result
        return exhaustive
      }
    }
  } catch {
    return { kind: "refused", reason: "unavailable" }
  }
}
