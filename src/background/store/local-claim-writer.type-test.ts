import type { AccountKey, PlaylistId } from "../../shared/model"
import type { JsonValue } from "../../shared/contracts/json"
import type { ClaimAuthority, ClaimAuthorityState, ClaimOwnership, ClaimLocalStorage, ClaimTransactionResult, createLocalClaimWriter } from "./local-claim-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Deps = Parameters<typeof createLocalClaimWriter>[0]
export type ClaimWriterProofs = [
  Check<Equal<ReturnType<typeof createLocalClaimWriter>, { claim(): Promise<ClaimTransactionResult>; dispose(): Promise<void> }>>,
  Check<Equal<Parameters<ReturnType<typeof createLocalClaimWriter>["claim"]>, []>>,
  Check<Equal<ClaimAuthority, { readonly acct: AccountKey; readonly lease: string; readonly browserSession: string; readonly consentGeneration: string; readonly signedIn: true; readonly incognito: false }>>,
  Check<Equal<ClaimLocalStorage, { get(): Promise<Readonly<Record<string, unknown>>>; set(items: Readonly<Record<string, JsonValue>>): Promise<void> }>>,
  Check<Equal<Deps["authority"], { read(): Promise<ClaimAuthorityState> }>>,
  Check<Equal<Deps["session"], { takeLookup(authority: ClaimAuthority): Promise<boolean> }>>,
  Check<Equal<Deps["ownership"], { lookup(authority: ClaimAuthority): Promise<ClaimOwnership> }>>,
  Check<Equal<Extract<ClaimOwnership, { kind: "fixture-owned" }>["ownedPlaylistIds"], ReadonlySet<PlaylistId>>>,
  Check<Equal<"remove" extends keyof ClaimLocalStorage ? true : false, false>>
]
function negative(writer: ReturnType<typeof createLocalClaimWriter>, authority: ClaimAuthority,
  ownership: Extract<ClaimOwnership, { kind: "fixture-owned" }>, local: ClaimLocalStorage) {
  // @ts-expect-error Requests cannot select account or origin authority.
  writer.claim({ acct: authority.acct, incognito: false })
  // @ts-expect-error Ownership IDs must be validated brands.
  const wrong: ClaimOwnership = { kind: "fixture-owned", authority, lineage: "local-migration-only", ownedPlaylistIds: new Set<string>() }
  // @ts-expect-error The ownership set is immutable to consumers.
  ownership.ownedPlaylistIds.add("PLraw")
  // @ts-expect-error Authority is immutable.
  authority.lease = "another"
  // @ts-expect-error This port cannot physically remove data.
  local.remove("unclaimed")
  void wrong
  void local.set({ unclaimed: null })
}
void negative

type ExpectedOwnership = { readonly kind: "fixture-owned"; readonly authority: ClaimAuthority; readonly lineage: "local-migration-only"; readonly ownedPlaylistIds: ReadonlySet<PlaylistId> } | { readonly kind: "unavailable" }
type ExpectedWrite = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
type ExpectedResult =
  | { readonly kind: "absent" | "consumed" | "empty-source" | "no-match" }
  | { readonly kind: "committed"; readonly notice: import("./accounts").ClaimMergeNotice; readonly write: ExpectedWrite }
  | { readonly kind: "unavailable"; readonly reason: "authority" | "startup" | "sync-on" | "inventory" | "ownership" | "checked-this-session" | "removal-required" | "notice-pending" | "stale" }
  | { readonly kind: "invalid"; readonly field: string }
  | { readonly kind: "failed"; readonly stage: "before-set" | "set-not-observed"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly write: ExpectedWrite; readonly cause:
    | { readonly kind: "authority" | "readback" }
    | { readonly kind: "read-failed"; readonly error: unknown } }
export type ExactClaimProofs = [
  Check<Equal<ClaimOwnership, ExpectedOwnership>>,
  Check<Equal<ClaimAuthorityState, { readonly kind: "ready"; readonly authority: ClaimAuthority } | { readonly kind: "unavailable" }>>,
  Check<Equal<ClaimTransactionResult, ExpectedResult>>,
  Check<Equal<typeof createLocalClaimWriter, (deps: {
    readonly local: ClaimLocalStorage; readonly authority: { read(): Promise<ClaimAuthorityState> };
    readonly session: { takeLookup(authority: ClaimAuthority): Promise<boolean> };
    readonly ownership: { lookup(authority: ClaimAuthority): Promise<ClaimOwnership> };
    readonly now: () => number; readonly generation: () => string
  }) => { claim(): Promise<ClaimTransactionResult>; dispose(): Promise<void> }>>
]
