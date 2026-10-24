import type { AccountKey, PlaylistId, DocumentKey } from "../../shared/model"
import type { ChangeResult, Origin } from "../../shared/contracts/results"
import type { JsonObject, JsonValue } from "../../shared/contracts/json"
import type { FilterSettingInput } from "./channel-filter-edit"
import type { createLocalFilterWriter, LocalFilterChange, LocalFilterWriteResult, LocalWriteStorage, SyncStorage, SyncClock, SyncAutomaticResult, SyncFlushResult, SyncReceiveKey, SyncReceiveResult } from "./local-filter-writer"
import type { SyncDocumentRecord } from "./sync-write-admission"
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
  readonly sync: SyncStorage
  readonly now: () => number
  readonly generation: () => string
  readonly syncClock: SyncClock
  readonly onSyncResult: (result: SyncAutomaticResult) => void
}) => { change(origin: UiOrigin, change: LocalFilterChange): Promise<LocalFilterWriteResult>; receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>; flushSync(): Promise<SyncFlushResult>; startSync(): Promise<void>; dispose(): Promise<void> }
type NativeBrowser = Parameters<typeof createBrowserLocalFilterWriter>[0]
type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
type ExpectedAdapter = (nativeBrowser: NativeBrowser, options: { onSyncResult: (result: SyncAutomaticResult) => void }) => {
  changeFromSettings(raw: unknown, sender: NativeSender): Promise<LocalFilterWriteResult>
  receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>
  flushSync(): Promise<SyncFlushResult>
  startSync(): Promise<void>
  dispose(): Promise<void>
}

type ExpectedReceive =
  | { readonly kind: "idle" }
  | { readonly kind: "adopted"; readonly received: SyncDocumentRecord }
  | { readonly kind: "unavailable"; readonly reason: "authority" | "history" | "account-context" | "document" | "pending" | "conflict" }
  | { readonly kind: "local-set-failed"; readonly error: unknown; readonly received: SyncDocumentRecord }
  | { readonly kind: "unconfirmed"; readonly received: SyncDocumentRecord; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown }
  }

export type LocalWriterProofs = [
  Check<Equal<SyncReceiveKey, Extract<DocumentKey, { kind: "settings" | "filter" }>>>,
  Check<Equal<SyncReceiveResult, ExpectedReceive>>,
  Check<Equal<LocalFilterChange, ExpectedChange>>,
  Check<Equal<LocalFilterWriteResult, ExpectedResult>>,
  Check<Equal<LocalWriteStorage, ExpectedStorage>>,
  Check<Equal<SyncStorage, { get(): Promise<Readonly<Record<string, unknown>>>; set(items: Readonly<Record<string, JsonValue>>): Promise<void>; subscribe(changed: () => void): () => void }>>,
  Check<Equal<SyncClock, { now(): number; after(milliseconds: number, run: () => void): () => void }>>,
  Check<Equal<SyncAutomaticResult, SyncFlushResult | { kind: "rejected"; error: unknown }>>,
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

function receiveTypeBoundaries(writer: ReturnType<typeof createLocalFilterWriter>, adapter: ReturnType<typeof createBrowserLocalFilterWriter>, acct: AccountKey, playlist: PlaylistId, result: SyncReceiveResult) {
  void writer.receiveSyncDocument({ kind: "settings" })
  void adapter.receiveSyncDocument({ kind: "settings" })
  void writer.receiveSyncDocument({ kind: "filter", acct, playlist })
  // @ts-expect-error Setup has no supported receive context.
  void writer.receiveSyncDocument({ kind: "setup", acct })
  // @ts-expect-error The adapter keeps the same bounded receive contract.
  void adapter.receiveSyncDocument({ kind: "setup", acct })
  // @ts-expect-error Filter addresses require branded account and playlist values.
  void writer.receiveSyncDocument({ kind: "filter", acct: "AAAAAAAAAAAAAAAA", playlist: "PL_P" })
  if (result.kind === "adopted") {
    // @ts-expect-error The adopted record cannot be replaced.
    result.received = result.received
  }
  // @ts-expect-error Receive outcomes are immutable.
  result.kind = "idle"
  const key: Readonly<SyncReceiveKey> = { kind: "filter", acct, playlist }
  void writer.receiveSyncDocument(key)
  // @ts-expect-error Immutable caller keys stay immutable.
  key.playlist = playlist
}
void receiveTypeBoundaries
