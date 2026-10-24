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

type MergeInput = Parameters<typeof import("./accounts").mergeUnclaimedChoices>[0]
export type MergeProofs = [
  Check<Equal<MergeInput["ownedPlaylistIds"], ReadonlySet<PlaylistId>>>,
  Check<Equal<MergeInput["current"], AccountSnapshot>>,
  Check<Equal<MergeInput["unclaimed"], Readonly<{
    from: "1.4.5" | "1.5.0"; autoAdd: readonly string[]; shortcutPlaylist: string | null; originalShortcutId?: string;
    filters: { readonly [id: string]: { readonly mode: "allow" | "deny"; readonly on: boolean; readonly channels: readonly (readonly [string, string, string?])[] } }; at: number
  }> | undefined>>
]
function immutableMerge(input: MergeInput) {
  // @ts-expect-error Already decoded source snapshots are recursively readonly.
  input.unclaimed?.autoAdd.push("PLraw")
  // @ts-expect-error Decoded carried tuples are recursively readonly.
  if (input.unclaimed?.filters.PLraw) input.unclaimed.filters.PLraw.channels[0]![1] = "changed"
  // @ts-expect-error Ownership cannot be populated with arbitrary strings.
  const wrong: MergeInput = { ...input, ownedPlaylistIds: new Set<string>() }
  void wrong
}
void immutableMerge

type ExpectedMergeResult =
  | { readonly kind: "absent" | "empty-source" | "no-match" }
  | { readonly kind: "matched"; readonly account: import("./accounts").ClaimAccountEffect; readonly notice: import("./accounts").ClaimMergeNotice }
export type ExactMergeProofs = [
  Check<Equal<ReturnType<typeof import("./accounts").mergeUnclaimedChoices>, ExpectedMergeResult>>,
  Check<Equal<import("./accounts").ClaimMergeNotice, { readonly acct: AccountKey; readonly dropped: number; readonly claim: Readonly<import("../../shared/model").ClaimNoticeDetails> }>>,
  Check<Equal<import("../../shared/model").ClaimNotice, { acct: string; dropped: number; claim?: import("../../shared/model").ClaimNoticeDetails }>>
]

type ReadonlyClaim<T> = T extends object ? { readonly [P in keyof T]: ReadonlyClaim<T[P]> } : T
type ExpectedMergeInput = {
  readonly acct: AccountKey
  readonly unclaimed: ReadonlyClaim<import("../../shared/model").Unclaimed> | undefined
  readonly current: AccountSnapshot
  readonly settings: ReadonlyClaim<import("../../shared/model").Settings>
  readonly ownedPlaylistIds: ReadonlySet<PlaylistId>
}
type ExpectedAccountEffect =
  | { readonly kind: "empty-absent" }
  | { readonly kind: "remove"; readonly removal: import("./accounts").SetupRemoval }
  | { readonly kind: "retain"; readonly setup: { readonly kind: "unchanged" } | { readonly kind: "save"; readonly data: import("../../shared/model").Setup };
    readonly filtersToAdd: readonly { readonly playlist: PlaylistId; readonly data: import("../../shared/model").Filter }[] }
export type ExactBulkApiProofs = [
  Check<Equal<typeof import("./accounts").mergeUnclaimedChoices, (input: ExpectedMergeInput) => ExpectedMergeResult>>,
  Check<Equal<import("./accounts").ClaimAccountEffect, ExpectedAccountEffect>>,
  Check<Equal<import("../../shared/model").ClaimShortcutOutcome,
    | { kind: "not-carried" | "not-owned" }
    | { kind: "filled" | "already-set"; shortcut: string }
    | { kind: "skipped"; reason: "missing-provenance" | "deleted-original" | "target-filled" }>>
]
