import { isJsonValue } from "../../shared/contracts/json"
import { isFeatureSettingChange, type FeatureSettingChange } from "../../shared/contracts/shared-settings"
import type { PresetConflict } from "../../shared/keys/bindings"
import type { LocalSettingsWriteResult } from "./shared-setting-execution"
import { executeSettingsMutation, type SettingsMutationDependencies } from "./feature-settings-mutation"
import { planFeatureSetting, type FeatureAccess, type FeaturePlan } from "./feature-settings"
import { commitFeatureProgress } from "./feature-settings-progress"
import { sameSyncJson } from "./sync-write-admission"

export type FeatureSettingWriteResult =
  | Exclude<LocalSettingsWriteResult, { readonly kind: "committed" | "unchanged" }>
  | { readonly kind: "committed" | "unchanged"; readonly limitedMusic: boolean; readonly blocked: readonly PresetConflict[]; readonly menuPermission: "unchanged" | "released" }
  | { readonly kind: "refused"; readonly reason: "site-access" | "browser-menu-permission" | "invalid" | "unavailable" }
  | { readonly kind: "permission-release-unconfirmed"; readonly settingsChanged: boolean }

export async function executeFeatureSetting(
  deps: SettingsMutationDependencies & {
    readonly access: FeatureAccess | undefined
    readonly allocateShortcut: () => string
  },
  change: FeatureSettingChange
): Promise<FeatureSettingWriteResult> {
  if (!isFeatureSettingChange(change)) return { kind: "refused", reason: "invalid" }
  let observation: Awaited<ReturnType<FeatureAccess["read"]>>
  if (change.value && change.kind !== "music-section") {
    try {
      observation = await deps.access?.read()
    } catch {
      return { kind: "refused", reason: "unavailable" }
    }
  }
  const planning: { value?: FeaturePlan } = {}
  const result = await executeSettingsMutation(
    deps,
    (current, records) => {
      const plan = planFeatureSetting({ current, records, change, access: observation, allocateShortcut: deps.allocateShortcut })
      planning.value = plan
      if (plan.kind === "refused") return { kind: "invalid", reason: "invalid-option" }
      return isJsonValue(current) && isJsonValue(plan.settings) && sameSyncJson(current, plan.settings) ? { kind: "unchanged" } : { kind: "changed", settings: plan.settings }
    },
    change.kind === "feature" && change.feature === "auto-add" && !change.value
      ? (baseline, items) => commitFeatureProgress({ local: deps.local, stopped: deps.disposed, id: deps.generation }, baseline, items)
      : undefined
  )
  const plan = planning.value
  if (result.kind === "result" && plan?.kind === "refused") return plan
  if (result.kind !== "committed" && result.kind !== "unchanged") return result
  if (!plan || plan.kind !== "planned") return { kind: "refused", reason: "unavailable" }
  if (change.kind === "feature" && change.feature === "browser-menu" && !change.value) {
    const release = await deps.access?.releaseBrowserMenu().catch(() => ({ kind: "unconfirmed" }) as const)
    if (deps.disposed() || release?.kind !== "released") return { kind: "permission-release-unconfirmed", settingsChanged: result.kind === "committed" }
    return { kind: result.kind, limitedMusic: plan.limitedMusic, blocked: plan.blocked, menuPermission: "released" }
  }
  return { kind: result.kind, limitedMusic: plan.limitedMusic, blocked: plan.blocked, menuPermission: "unchanged" }
}
