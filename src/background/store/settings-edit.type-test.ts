import type { Settings } from "../../shared/model"
import type { changeSharedSetting, SharedSettingChange, SharedSettingResult } from "./settings-edit"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Snapshot<T> = T extends object ? { readonly [P in keyof T]: Snapshot<T[P]> } : T
type Input = Parameters<typeof changeSharedSetting>[0]

export type SharedSettingProofs = [
  Check<Equal<SharedSettingChange,
    | { readonly kind: "theme"; readonly value: Settings["theme"] }
    | { readonly kind: "default-percentage"; readonly value: number }>>,
  Check<Equal<SharedSettingResult,
    | { readonly kind: "unchanged" }
    | { readonly kind: "invalid"; readonly reason: "invalid-percentage" }
    | { readonly kind: "changed"; readonly settings: Settings }>>,
  Check<Equal<Input, { readonly current: Snapshot<Settings>; readonly change: SharedSettingChange }>>,
  Check<Equal<ReturnType<typeof changeSharedSetting>, SharedSettingResult>>,
  Check<Equal<keyof typeof import("./settings-edit"), "changeSharedSetting">>
]

function invalidUses(change: typeof changeSharedSetting, input: Input, result: SharedSettingResult) {
  // @ts-expect-error Theme is a model literal.
  change({ current: input.current, change: { kind: "theme", value: "sepia" } })
  // @ts-expect-error Only named shared edits enter this operation.
  change({ current: input.current, change: { kind: "consent", value: true } })
  // @ts-expect-error A percentage remains numeric at the boundary.
  change({ current: input.current, change: { kind: "default-percentage", value: "50" } })
  // @ts-expect-error The input object is readonly.
  input.current = input.current
  // @ts-expect-error Known sections are recursively readonly.
  input.current.autoAdd.pct = 50
  // @ts-expect-error Shortcut arrays are readonly.
  input.current.shortcuts.list.push({ id: "save01", key: null, label: "Save", watchLaterOnEveryAccount: false })
  const row = input.current.shortcuts.list[0]
  if (row) {
    // @ts-expect-error Shortcut rows are recursively readonly.
    row.id = "save02"
    if (row.key) {
      // @ts-expect-error Keys nested inside shortcut rows are readonly.
      row.key.ctrl = true
    }
  }
  // @ts-expect-error The caller cannot replace the change.
  input.change = { kind: "theme", value: "light" }
  // @ts-expect-error The selected value is readonly.
  input.change.value = 50
  if (result.kind !== "changed") {
    // @ts-expect-error No candidate exists for unchanged or invalid results.
    result.settings
  }
  if (result.kind === "changed") {
    // @ts-expect-error Invalid-only fields do not exist on changed results.
    result.reason
  }
  switch (result.kind) {
    case "unchanged": return
    case "invalid": return result.reason
    case "changed": return result.settings
    default: {
      const exhaustive: never = result
      return exhaustive
    }
  }
}

void invalidUses
