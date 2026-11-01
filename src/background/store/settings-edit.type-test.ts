import type { Settings } from "../../shared/model"
import type { changeSharedSetting, SharedSettingChange, SharedSettingResult, SharedOptionChange, SharedOptionValues } from "./settings-edit"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Snapshot<T> = T extends object ? { readonly [P in keyof T]: Snapshot<T[P]> } : T
type Input = Parameters<typeof changeSharedSetting>[0]

export type SharedSettingProofs = [
  Check<Equal<SharedSettingChange,
    | { readonly kind: "theme"; readonly value: Settings["theme"] }
    | { readonly kind: "default-percentage"; readonly value: Settings["autoAdd"]["pct"] }
    | SharedOptionChange>>,
  Check<Equal<SharedSettingResult,
    | { readonly kind: "unchanged" }
    | { readonly kind: "invalid"; readonly reason: "invalid-percentage" | "invalid-option" }
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

export type SharedOptionProofs = [
  Check<Equal<SharedOptionValues["autoAdd.feedback"], Settings["autoAdd"]["feedback"]>>,
  Check<Equal<SharedOptionValues["shortcuts.feedback"], Settings["shortcuts"]["feedback"]>>,
  Check<Equal<SharedOptionValues["quickSave.feedback"], Settings["quickSave"]["feedback"]>>,
  Check<Equal<SharedOptionValues["queueButton.feedback"], Settings["queueButton"]["feedback"]>>,
  Check<Equal<SharedOptionValues["watchButton.feedback"], Settings["watchButton"]["feedback"]>>,
  Check<Equal<SharedOptionValues["browserMenu.feedback"], Settings["browserMenu"]["feedback"]>>,
  Check<Equal<SharedOptionValues["musicActions.feedback"], Settings["musicActions"]["feedback"]>>,
  Check<Equal<SharedOptionValues["musicKeys.feedback"], Settings["musicKeys"]["feedback"]>>,
  Check<Equal<SharedOptionValues["anyTabKeys.feedback"], Settings["anyTabKeys"]["feedback"]>>,
  Check<Equal<SharedOptionValues["gather.feedback"], Settings["gather"]["feedback"]>>,
  Check<Equal<SharedOptionValues["autoAdd.toolbarTick"], Settings["autoAdd"]["toolbarTick"]>>,
  Check<Equal<SharedOptionValues["autoAdd.toolbarPaused"], Settings["autoAdd"]["toolbarPaused"]>>,
  Check<Equal<SharedOptionValues["quickSave.shortsShelves"], Settings["quickSave"]["shortsShelves"]>>,
  Check<Equal<SharedOptionValues["watchButton.shorts"], Settings["watchButton"]["shorts"]>>,
  Check<Equal<SharedOptionValues["cardMenu.keepLinkMenu"], Settings["cardMenu"]["keepLinkMenu"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.next"], Settings["musicActions"]["buttons"]["next"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.queue"], Settings["musicActions"]["buttons"]["queue"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.save"], Settings["musicActions"]["buttons"]["save"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.like"], Settings["musicActions"]["buttons"]["like"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.remove"], Settings["musicActions"]["buttons"]["remove"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.library"], Settings["musicActions"]["buttons"]["library"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.mix"], Settings["musicActions"]["buttons"]["mix"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.album"], Settings["musicActions"]["buttons"]["album"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.artist"], Settings["musicActions"]["buttons"]["artist"]>>,
  Check<Equal<SharedOptionValues["musicActions.buttons.bar"], Settings["musicActions"]["buttons"]["bar"]>>,
  Check<Equal<SharedOptionValues["gather.to"], Settings["gather"]["to"]>>,
  Check<Equal<SharedOptionValues["gather.order"], Settings["gather"]["order"]>>,
  Check<Equal<SharedOptionValues["gather.close"], Settings["gather"]["close"]>>,
  Check<Equal<SharedOptionValues["gather.auto.after"], Settings["gather"]["auto"]["after"]>>,
  Check<Equal<SharedOptionValues["gather.auto.n"], Settings["gather"]["auto"]["n"]>>
]
