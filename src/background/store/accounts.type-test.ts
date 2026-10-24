import type { AccountKey, PlaylistId, ShortcutId } from "../../shared/model"
import type { AccountChoice, AccountSnapshot, changeAccountChoice, removeSharedShortcut } from "./accounts"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Present = Extract<AccountSnapshot, { kind: "present" }>["bodies"]
type Input = Parameters<typeof changeAccountChoice>[0]
type SharedInput = Parameters<typeof removeSharedShortcut>[0]

export type SnapshotProofs = [
  Check<Equal<Present["setup"]["autoAdd"], readonly { readonly pl: string; readonly takes: "videos" | "shorts" | "both"; readonly pct?: number }[]>>,
  Check<Equal<Present["setup"]["targets"], { readonly [id: string]: string }>>,
  Check<Equal<Present["filters"][string]["channels"][number], readonly [id: string, title: string, handle?: string]>>,
  Check<Equal<Input["settings"]["shortcuts"]["list"][number]["key"], { readonly char?: string; readonly code: string; readonly ctrl: boolean; readonly alt: boolean; readonly shift: boolean; readonly meta: boolean } | null>>,
  Check<Equal<Input["additionalChosenPlaylists"], ReadonlySet<PlaylistId>>>,
  Check<Equal<SharedInput["accounts"][number]["additionalChosenPlaylists"], ReadonlySet<PlaylistId>>>,
  Check<Equal<{} extends Pick<Input, "additionalChosenPlaylists"> ? true : false, false>>,
  Check<Equal<{} extends Pick<SharedInput["accounts"][number], "additionalChosenPlaylists"> ? true : false, false>>,
  Check<Equal<string extends AccountKey ? true : false, false>>,
  Check<Equal<string extends PlaylistId ? true : false, false>>,
  Check<Equal<string extends ShortcutId ? true : false, false>>,
  Check<Equal<Extract<AccountChoice, { kind: "shortcut-target" }>["shortcut"], ShortcutId>>,
  Check<Equal<Extract<AccountChoice, { kind: "auto-add" }>["playlist"], PlaylistId>>
]
