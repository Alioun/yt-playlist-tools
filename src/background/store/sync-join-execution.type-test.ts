import type { Origin } from "../../shared/contracts/results"
import type { AccountKey } from "../../shared/model"
import type { createLocalFilterWriter } from "./local-filter-writer"
import type { SyncJoinOperation, SyncJoinPreparation, SyncJoinResult, SyncJoinStatus, SyncJoinReview, SyncJoinHost, SyncJoinLocalRemoval } from "./sync-join-execution"
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
type Owner = ReturnType<typeof createLocalFilterWriter>
type UiOrigin = Extract<Origin, { kind: "ui" }>
export type JoinProofs = [
  Check<Equal<Owner["beginSyncJoin"], (origin: UiOrigin) => SyncJoinOperation>>,
  Check<Equal<ReturnType<Owner["readSyncJoin"]>, Promise<SyncJoinStatus>>>,
  Check<Equal<ReturnType<Owner["resumeSyncJoin"]>, Promise<SyncJoinResult>>>,
  Check<Equal<SyncJoinOperation["result"], Promise<SyncJoinPreparation>>>
]
function negative(owner: Owner, origin: UiOrigin, review: SyncJoinReview, acct: AccountKey, host: Extract<SyncJoinHost, { kind: "fixture" }>) {
  // @ts-expect-error Automatic application carries no side choice.
  owner.applySyncJoin(origin, { kind: "automatic", review, choice: "use-synced" })
  // @ts-expect-error Shared join has a UI origin, never page mutation authority.
  owner.beginSyncJoin({ kind: "page", acct })
  // @ts-expect-error A removal port cannot name arbitrary keys.
  host.removeLocal(["unclaimed"])
  // @ts-expect-error Join cleanup cannot remove a canonical document.
  const removal: SyncJoinLocalRemoval = { kind: "document", acct }
  // @ts-expect-error Progress shards remain bounded.
  const shard: SyncJoinLocalRemoval = { kind: "progress", acct, shard: 16 }
  void removal
  void shard
}
void negative
