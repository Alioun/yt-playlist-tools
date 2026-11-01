import type { AccountKey, Device, DocumentKey } from "../../shared/model"
import type { Origin } from "../../shared/contracts/results"
import { createLocalFilterWriter } from "./local-filter-writer"
import { executeAccountRemoval, planAccountDocumentWrite, type AccountRemovalDependencies, type AccountRemovalHost, type AccountDocumentKey,
  type PendingAccountRemoval, type RemovalConfirmation, type RemovalPreparation, type RemovalResult, type UiOrigin } from "./account-removal-execution"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type RemovalProofs = [
  Check<Equal<UiOrigin, Extract<Origin, { kind: "ui" }>>>,
  Check<Equal<AccountDocumentKey, Extract<DocumentKey, { kind: "setup" | "filter" }>>>,
  Check<Equal<RemovalConfirmation, { readonly kind: "account-removal-confirmation" }>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["prepareAccountRemoval"], (origin: UiOrigin, acct: AccountKey) => Promise<RemovalPreparation>>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["removeAccountSetup"], (origin: UiOrigin, confirmation: RemovalConfirmation) => Promise<RemovalResult>>>,
  Check<Equal<PendingAccountRemoval["consent"], NonNullable<Device["consent"]>>>
]
function negative(host: Extract<AccountRemovalHost, { kind: "fixture" }>, deps: AccountRemovalDependencies,
  writer: ReturnType<typeof createLocalFilterWriter>, acct: AccountKey, origin: UiOrigin, before: Extract<PendingAccountRemoval, { mode: "local" }>["documents"][0]) {
  // @ts-expect-error Canonical removal never accepts arbitrary physical strings.
  void host.removeLocal(["schema"])
  // @ts-expect-error Shared Settings cannot enter an account removal manifest.
  void host.removeLocal([{ kind: "document", key: { kind: "settings" } }])
  // @ts-expect-error Account addresses require their validated brand.
  void host.removeLocal([{ kind: "cache", acct: "BBBBBBBBBBBBBBBB" }])
  // @ts-expect-error Progress has exactly sixteen shards.
  void host.removeLocal([{ kind: "progress", acct, shard: 16 }])
  // @ts-expect-error Canonical removal has no database capability.
  void host.deleteDatabase("another-database")
  // @ts-expect-error Canonical removal has no sync deletion capability.
  void deps.sync.remove(["s:settings"])
  // @ts-expect-error Session removal is constrained to owned account keys.
  void host.session.remove([{ kind: "paused", acct }])
  // @ts-expect-error Mixed session writes accept only the named collections.
  void host.session.set({ unknownCollection: {} })
  // @ts-expect-error Local-mode manifest members cannot carry after tombstones.
  const local: PendingAccountRemoval = { v: 1, kind: "account-remove", acct, deviceId: "fixture", consent: { v: 1, at: 1 }, mode: "local", documents: [{ ...before, after: {} }] }
  // @ts-expect-error An accepted removal must start with a Setup member.
  const empty: PendingAccountRemoval = { v: 1, kind: "account-remove", acct, deviceId: "fixture", consent: { v: 1, at: 1 }, mode: "local", documents: [] }
  // @ts-expect-error Callers cannot supply arbitrary document or Device patches.
  void executeAccountRemoval(deps, { acct, after: {}, device: { lastAccount: null } })
  // @ts-expect-error The public operation consumes its confirmation capability rather than a replayable command.
  void writer.removeAccountSetup(origin, { kind: "remove-account", acct })
  // @ts-expect-error A background origin cannot prepare a user confirmation.
  void writer.prepareAccountRemoval({ kind: "background" }, acct)
  // @ts-expect-error Document-scoped admission cannot flush or change global ownership.
  void planAccountDocumentWrite({ local: {}, sync: {}, intent: { kind: "flush" } })
  // @ts-expect-error The account boundary cannot admit a shared Settings edit.
  void planAccountDocumentWrite({ local: {}, sync: {}, intent: { kind: "unchanged", key: { kind: "settings" } } })
  void local; void empty
}
void negative
