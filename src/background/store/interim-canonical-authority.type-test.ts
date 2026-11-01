import type { CanonicalAuthorityHost, CanonicalOwnerCapability, RetainedControllerCapability, CanonicalAuthorityRead,
  CanonicalAuthorityReview, CanonicalAuthorityResult, RetainedCanonicalAuthorityV5, RetainedArchiveV5, AuthorityAnchorV5, FixtureRetirementReceipt } from "./interim-canonical-authority"
import { createStartingLocalFilterWriter } from "./local-filter-writer"
import type { UiOrigin } from "./account-removal-execution"
import type { Snapshot } from "../../shared/model/settings-view"
import type { RetainedInstallationV3 } from "./interim-installation"
import type { RecoveryTransactionResult } from "./interim-recovery-execution"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type Owner = ReturnType<typeof createStartingLocalFilterWriter>
export type AuthorityProofs = [
  Check<Equal<RetainedCanonicalAuthorityV5["v"], 5>>,
  Check<Equal<RetainedArchiveV5["checkpoint"]["v"], 3 | 4>>,
  Check<Equal<Extract<RetainedArchiveV5, { kind: "installed-v3" }>["checkpoint"]["installation"]["kind"], "installed">>,
  Check<Equal<Extract<RetainedArchiveV5, { kind: "completed-v4" }>["checkpoint"]["basis"]["checkpoint"]["v"], 3>>,
  Check<Equal<Extract<RetainedArchiveV5, { kind: "completed-v4" }>["checkpoint"]["pending"]["kind"], "none">>,
  Check<Equal<Owner["readCanonicalAuthority"], (origin: UiOrigin) => Promise<CanonicalAuthorityRead>>>,
  Check<Equal<Owner["releaseRetainedAuthority"], (origin: UiOrigin, review: CanonicalAuthorityReview) => Promise<CanonicalAuthorityResult>>>,
  Check<Equal<Owner["resumeRetainedAuthority"], (origin: UiOrigin) => Promise<CanonicalAuthorityResult>>>,
  Check<Equal<Extract<CanonicalAuthorityResult, { kind: "restart-required" }>["activation"], "held">>,
  Check<Equal<Extract<RecoveryTransactionResult, { kind: "committed" }>["activation"], "held" | "canonical">>,
  Check<Equal<RetainedCanonicalAuthorityV5["resolutions"][number]["kind"], "filter-replaced" | "playlist-restored" | "discarded">>,
  Check<Equal<Parameters<typeof createStartingLocalFilterWriter>[0]["canonicalAuthority"], CanonicalAuthorityHost | undefined>>
]
function negative(owner: Owner, origin: UiOrigin, review: CanonicalAuthorityReview, checkpoint: Snapshot<RetainedCanonicalAuthorityV5>, pendingV3: RetainedInstallationV3, anchor: AuthorityAnchorV5, controller: RetainedControllerCapability) {
  // @ts-expect-error A review is not a live exclusive owner capability.
  const exclusive: CanonicalOwnerCapability = review
  // @ts-expect-error A release result is not an initialized owner.
  owner.releaseRetainedAuthority(origin, review).ready()
  // @ts-expect-error A runtime controller is not durable retirement evidence.
  const durable: FixtureRetirementReceipt = controller
  // @ts-expect-error A V5 archive cannot recursively embed V5.
  const nested: RetainedArchiveV5["checkpoint"] = checkpoint
  // @ts-expect-error A pending installation cannot supply installed archive evidence.
  const pending: Extract<RetainedArchiveV5, { kind: "installed-v3" }>["checkpoint"] = pendingV3
  // @ts-expect-error History is explicit, including absence.
  const noHistory: AuthorityAnchorV5 = { canonical: anchor.canonical, join: anchor.join }
  // @ts-expect-error Recovery suffix receipts are deeply immutable.
  checkpoint.resolutions.push({ kind: "discarded" })
  // @ts-expect-error Discard requires a genuine owner capture and a complete display item.
  owner.discardInterimItem(origin, { sourceKey: "playlists", path: [0] })
  // @ts-expect-error The owner has no arbitrary destination restore mutation.
  owner.restoreGlobalFilter(origin, { account: "AAAAAAAAAAAAAAAA", playlist: "PL_ONE" })
  void exclusive; void durable; void nested; void pending; void noHistory
}
void negative
