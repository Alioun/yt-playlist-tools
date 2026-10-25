import type { executeLegacyStartup, StartupExecutionResult, StartupHost } from "./legacy-execution"
import type { LocalWriteStorage } from "./local-filter-writer"
import type { LegacyKey } from "./legacy"
import type { MigrationContext, StartupPlan, StartupSnapshot } from "./legacy-startup"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type ExecutionProofs = [
  Check<Equal<StartupHost, { readonly context: MigrationContext; readSnapshot(): Promise<StartupSnapshot>;
    removeLocal(keys: readonly LegacyKey[]): Promise<void>; deleteDatabase(name: "yt-playlist-tools"): Promise<void>;
    removeSession(keys: readonly ["channelCache"]): Promise<void> }>>,
  Check<Equal<StartupExecutionResult, { readonly kind: "ok" } | Extract<StartupPlan, { kind: "newer-layout" | "invalid" | "unsupported-state" }> |
    { readonly kind: "unconfirmed"; readonly stage: "canonical-batch" | "local-remove" | "schema" }>>,
  Check<Equal<typeof executeLegacyStartup, (deps: { readonly local: Pick<LocalWriteStorage, "set">; readonly host: StartupHost }) => Promise<StartupExecutionResult>>>
]
function negative(host: StartupHost) {
  // @ts-expect-error Startup cleanup cannot delete an arbitrary database.
  void host.deleteDatabase("another")
  // @ts-expect-error Startup cleanup cannot remove another session key.
  void host.removeSession(["another"])
  // @ts-expect-error Cleanup cannot remove canonical records.
  void host.removeLocal(["unclaimed"])
  // @ts-expect-error The sanitized host has no sync capability.
  void host.sync.get()
}
void negative
