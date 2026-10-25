import { executeSharedSetting, type LocalSettingsWriteResult } from "./shared-setting-execution"
import type { SharedSettingChange } from "./settings-edit"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type ExecutionProofs = [
  Check<Equal<keyof typeof import("./shared-setting-execution"), "executeSharedSetting">>,
  Check<Equal<Parameters<typeof executeSharedSetting>[1], SharedSettingChange>>,
  Check<Equal<ReturnType<typeof executeSharedSetting>, Promise<LocalSettingsWriteResult>>>
]
function boundaries(ports: Parameters<typeof executeSharedSetting>[0], result: LocalSettingsWriteResult) {
  // @ts-expect-error Only theme and percentage edits exist.
  void executeSharedSetting(ports, { kind: "device", value: {} })
  // @ts-expect-error Theme values use the Settings union.
  void executeSharedSetting(ports, { kind: "theme", value: "blue" })
  // @ts-expect-error A failed result requires the original error.
  const failure: LocalSettingsWriteResult = { kind: "failed", stage: "set" }
  // @ts-expect-error Success requires an explicit committed or unchanged outcome.
  const falseSuccess: LocalSettingsWriteResult = { kind: "result", result: { ok: true } }
  void falseSuccess
  // @ts-expect-error Result discrimination precedes failure access.
  void result.error
  // @ts-expect-error Result variants cannot be reassigned.
  result.kind = "committed"
  void failure
}
void boundaries
