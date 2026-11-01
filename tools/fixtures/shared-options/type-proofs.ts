import type { SharedSettingChange, SharedOptionChange } from "../../../src/background/store/settings-edit"
import type { BrowserStartingOwner } from "../../../src/background/adapters/starting-owner"
import type { createStartingLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import type { executeSharedSetting } from "../../../src/background/store/shared-setting-execution"
import { cases } from "./specimens"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Owner = ReturnType<typeof createStartingLocalFilterWriter>
export type ForwardingProofs = [
  Check<Equal<Parameters<Owner["changeSharedSetting"]>[1], SharedSettingChange>>,
  Check<Equal<Parameters<BrowserStartingOwner["changeSharedSetting"]>[1], SharedSettingChange>>,
  Check<Equal<Parameters<typeof executeSharedSetting>[1], SharedSettingChange>>,
  Check<Equal<ReturnType<BrowserStartingOwner["changeSharedSetting"]>, ReturnType<Owner["changeSharedSetting"]>>>
]
function positive(owner: Owner, native: BrowserStartingOwner, option: SharedOptionChange) {
  const ui = { kind: "ui", windowId: 1, incognito: false } as const
  void owner.changeSharedSetting(ui, option)
  void native.changeSharedSetting(ui, option)
  for (const specimen of cases) void native.changeSharedSetting(ui, specimen.change)
}
void positive
