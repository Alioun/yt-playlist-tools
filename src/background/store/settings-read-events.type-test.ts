import { createLocalFilterWriter, createStartingLocalFilterWriter, type SettingsRead, type SettingsEvent } from "./local-filter-writer"
import type { Origin } from "../../shared/contracts/results"
import type { SharedSettingChange } from "./settings-edit"
import type { LocalSettingsWriteResult } from "./shared-setting-execution"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Writer = ReturnType<typeof createLocalFilterWriter>
export type OwnerSettingsProofs = [
  Check<Equal<Writer["read"], (view: "settings") => Promise<SettingsRead>>>,
  Check<Equal<Writer["subscribe"], (fn: (event: SettingsEvent) => void) => () => void>>,
  Check<Equal<Writer["changeSharedSetting"], (origin: Extract<Origin, { kind: "ui" }>, change: SharedSettingChange) => Promise<LocalSettingsWriteResult>>>,
  Check<Equal<ReturnType<typeof createStartingLocalFilterWriter>["ready"], () => Promise<"ok" | "newer-layout">>>,
  Check<Equal<SettingsEvent, { readonly kind: "settings-changed"; readonly source: "local" | "sync" }>>
]
function boundaries(writer: Writer, event: SettingsEvent) {
  // @ts-expect-error There is no Device read.
  void writer.read("device")
  // @ts-expect-error There is no partial TabView.
  void writer.read("tabView")
  // @ts-expect-error The preinitialized fixture has no readiness attestation.
  void writer.ready()
  // @ts-expect-error Writes require a UI origin.
  void writer.changeSharedSetting({ kind: "sync" }, { kind: "theme", value: "dark" })
  // @ts-expect-error There is no arbitrary document patch.
  void writer.changeSharedSetting({ kind: "ui", windowId: 1, incognito: false }, { kind: "patch", path: "device", value: {} })
  // @ts-expect-error Events are immutable.
  event.source = "sync"
  // @ts-expect-error Events expose no body.
  void event.settings
}
void boundaries
