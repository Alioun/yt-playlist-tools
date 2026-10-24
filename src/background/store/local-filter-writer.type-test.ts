import type { AccountKey, PlaylistId } from "../../shared/model"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import type { JsonObject } from "../../shared/contracts/json"
import type { FilterSettingInput } from "./channel-filter-edit"
import type { createLocalFilterWriter, LocalFilterChange, LocalFilterWriteResult, LocalWriteStorage, SyncReadStorage } from "./local-filter-writer"
import type { createBrowserLocalFilterWriter } from "../adapters/local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type UiOrigin = Extract<Origin, { kind: "ui" }>
type ExpectedChange = {
  readonly acct: AccountKey
  readonly playlist: PlaylistId
  readonly desired: FilterSettingInput["desired"]
} & (
  | { readonly clearListedChannels: "not-confirmed" }
  | { readonly clearListedChannels: "confirmed"; readonly expectedGeneration: string | null }
)
type ExpectedResult =
  | { readonly kind: "result"; readonly result: ChangeResult }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "sync-writer-required" | "account-context" }
type ExpectedStorage = {
  get(keys: readonly string[] | null): Promise<Readonly<Record<string, unknown>>>
  set(items: Readonly<Record<string, JsonObject>>): Promise<void>
}
type ExpectedFactory = (deps: {
  readonly local: LocalWriteStorage
  readonly sync: SyncReadStorage
  readonly now: () => number
  readonly generation: () => string
}) => { change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult> }
type NativeBrowser = Parameters<typeof createBrowserLocalFilterWriter>[0]
type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
type ExpectedAdapter = (nativeBrowser: NativeBrowser) => {
  changeFromSettings(raw: unknown, sender: NativeSender): Promise<LocalFilterWriteResult>
}

export type LocalWriterProofs = [
  Check<Equal<LocalFilterChange, ExpectedChange>>,
  Check<Equal<LocalFilterWriteResult, ExpectedResult>>,
  Check<Equal<LocalWriteStorage, ExpectedStorage>>,
  Check<Equal<SyncReadStorage, { get(): Promise<Readonly<Record<string, unknown>>> }>>,
  Check<Equal<typeof createLocalFilterWriter, ExpectedFactory>>,
  Check<Equal<typeof createBrowserLocalFilterWriter, ExpectedAdapter>>,
  Check<Equal<keyof typeof import("./local-filter-writer"), "createLocalFilterWriter">>,
  Check<Equal<keyof typeof import("../adapters/local-filter-writer"), "createBrowserLocalFilterWriter">>,
  Check<Equal<string extends LocalFilterChange["acct"] ? true : false, false>>,
  Check<Equal<string extends LocalFilterChange["playlist"] ? true : false, false>>,
  Check<Equal<Omit<Extract<LocalFilterChange, { clearListedChannels: "confirmed" }>, "expectedGeneration"> extends LocalFilterChange ? true : false, false>>,
  Check<Equal<Extract<Origin, { kind: "background" | "sync" | "tab" }> extends UiOrigin ? true : false, false>>,
  Check<Equal<LocalFilterChange["desired"], Readonly<LocalFilterChange["desired"]>>>
]
