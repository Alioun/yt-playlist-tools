import type { Key, Settings, ShortcutId } from "../model"
import type { applyPresets, PresetConflict, PresetRequest, PresetResult, ShortcutTarget, Conflict } from "./index"
import type * as runtime from "./index"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type PlaylistRequest = Extract<PresetRequest, { feature: "shortcuts" }>

export type PresetContractProofs = [
  Check<Equal<PresetRequest, { feature: "shortcuts"; shortcutId: string; readonly reservedShortcutIds: ReadonlySet<ShortcutId> } | { feature: "music-keys" }>>,
  Check<Equal<PlaylistRequest["shortcutId"], string>>,
  Check<Equal<{} extends Pick<PlaylistRequest, "reservedShortcutIds"> ? true : false, false>>,
  Check<Equal<Set<string> extends PlaylistRequest["reservedShortcutIds"] ? true : false, false>>,
  Check<Equal<ReadonlySet<ShortcutId> extends PlaylistRequest["reservedShortcutIds"] ? true : false, true>>,
  Check<Equal<typeof applyPresets, (settings: Readonly<Settings>, request: PresetRequest) => PresetResult>>,
  Check<Equal<PresetResult, { kind: "applied" | "unchanged"; settings: Readonly<Settings>; blocked: readonly PresetConflict[] }>>,
  Check<Equal<PresetConflict, { target: ShortcutTarget; key: Readonly<Key>; conflicts: readonly Conflict[] }>>,
  Check<Equal<keyof typeof runtime, "match" | "keyMatches" | "keysOverlap" | "isTyping" | "bindingsForSite" | "findConflicts" | "assignKey" | "applyPresets" | "isReserved" | "shortcutWarnings" | "display" | "displayModifiers" | "recorder">>
]

function requestChecks(settings: Settings, ids: ReadonlySet<ShortcutId>, strings: Set<string>, apply: typeof applyPresets) {
  apply(settings, { feature: "shortcuts", shortcutId: "fresh1", reservedShortcutIds: ids })
  apply(settings, { feature: "music-keys" })
  // @ts-expect-error A fresh playlist creator must supply reservation evidence.
  apply(settings, { feature: "shortcuts", shortcutId: "fresh1" })
  // @ts-expect-error Raw strings are not validated shortcut IDs.
  apply(settings, { feature: "shortcuts", shortcutId: "fresh1", reservedShortcutIds: strings })
  const request: PlaylistRequest = { feature: "shortcuts", shortcutId: "fresh1", reservedShortcutIds: ids }
  // @ts-expect-error Reservation evidence is readonly.
  request.reservedShortcutIds = ids
  // @ts-expect-error The supplied set has no mutation API.
  request.reservedShortcutIds.add("fresh1")
}
void requestChecks
