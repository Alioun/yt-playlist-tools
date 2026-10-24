import { decodeFilter, defaultFilter } from "../../shared/model"
import type { Filter } from "../../shared/model"

type Snapshot<T> = T extends object
  ? { readonly [P in keyof T]: Snapshot<T[P]> }
  : T

export type FilterSettingInput = {
  readonly current: Snapshot<Filter> | undefined
  readonly desired: Readonly<Pick<Filter, "mode" | "on">>
  readonly clearListedChannels: "not-confirmed" | "confirmed"
}

export type FilterSettingResult =
  | { readonly kind: "unchanged" }
  | { readonly kind: "confirmation-required" }
  | { readonly kind: "changed"; readonly filter: Filter }

export function changeFilterSetting(input: FilterSettingInput): FilterSettingResult {
  const current = input.current ?? defaultFilter()
  const { desired } = input
  if (current.mode === desired.mode && current.on === desired.on) return { kind: "unchanged" }
  const modeChanged = current.mode !== desired.mode
  if (modeChanged && current.channels.length > 0 && input.clearListedChannels !== "confirmed") {
    return { kind: "confirmation-required" }
  }
  return {
    kind: "changed",
    filter: decodeFilter({ ...current, mode: desired.mode, on: desired.on, channels: modeChanged ? [] : current.channels })
  }
}
