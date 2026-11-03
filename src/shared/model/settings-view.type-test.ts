import { readSettingsView, type SettingsView, type Snapshot } from "./settings-view"
import type { Settings } from "./types"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
export type SettingsViewProofs = [
  Check<Equal<typeof readSettingsView, (rawDocument: unknown) => SettingsView>>,
  Check<Equal<Extract<SettingsView, { kind: "value" }>["settings"], Snapshot<Settings>>>,
  Check<Equal<keyof typeof import("./settings-view"), "readSettingsView">>
]
function boundaries(view: SettingsView) {
  if (view.kind === "value") {
    // @ts-expect-error A snapshot cannot change theme.
    view.settings.theme = "dark"
    // @ts-expect-error Nested settings stay readonly.
    view.settings.autoAdd.pct = 0
    // @ts-expect-error Shortcut arrays cannot be extended.
    view.settings.shortcuts.list.push({ id: "orig01", key: null, label: "", watchLaterOnEveryAccount: false })
    // @ts-expect-error Key members stay readonly.
    if (view.settings.undoKey) view.settings.undoKey.code = "KeyX"
  }
  // @ts-expect-error Settings views expose no device identity.
  void view.device
}
void boundaries
