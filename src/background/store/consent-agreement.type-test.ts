import type { FeatureId } from "../../shared/contracts/vocabulary"
import type { Device } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import type { AgreementRead, AgreementReview, AgreementChoice, AgreementInput, AgreementResult, AgreementApplication, PageFeatureId, UiOrigin } from "./consent-agreement"
import type { createLocalFilterWriter, createStartingLocalFilterWriter } from "./local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type AgreementProofs = [
  Check<Equal<PageFeatureId, Exclude<FeatureId, "sync">>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readAgreement"], (origin: UiOrigin) => Promise<AgreementRead>>>,
  Check<Equal<ReturnType<typeof createStartingLocalFilterWriter>["agree"], (origin: UiOrigin, input: AgreementInput) => Promise<AgreementResult>>>,
  Check<Equal<ReturnType<typeof createStartingLocalFilterWriter>["resumeRetainedAgreement"], (origin: UiOrigin) => Promise<AgreementResult>>>,
  Check<Equal<Extract<AgreementRead, { kind: "pending" }>["consent"], Snapshot<NonNullable<Device["consent"]>>>>,
  Check<Equal<Extract<AgreementResult, { kind: "committed" }>["activation"], "held" | "ordinary-gates">>
]
function negative(owner: ReturnType<typeof createStartingLocalFilterWriter>, origin: UiOrigin, review: AgreementReview, read: AgreementRead, result: AgreementResult) {
  // @ts-expect-error Joining is a separate transaction.
  const join: AgreementChoice = { kind: "first-run", selected: [], syncOn: true }
  // @ts-expect-error Page features cannot smuggle the sync switch into selection.
  const sync: AgreementChoice = { kind: "first-run", selected: ["sync"], syncOn: false }
  // @ts-expect-error Caller time is not agreement authority.
  void owner.agree(origin, { review, displayedVersion: 1, choice: { kind: "disclosure" }, access: Promise.resolve({ www: true, music: true, browserMenu: true }), at: 1 })
  // @ts-expect-error Permissions are initiated before calling the asynchronous owner.
  void owner.agree(origin, { review, displayedVersion: 1, choice: { kind: "disclosure" }, access: () => Promise.resolve({ www: true, music: true, browserMenu: true }) })
  // @ts-expect-error Retained disclosure applies no feature choices.
  const retained: AgreementChoice = { kind: "retained-disclosure", selected: ["shortcuts"] }
  // @ts-expect-error Application reasons are the named outcomes.
  const application: AgreementApplication = { feature: "shortcuts", scope: "music", state: { kind: "held", reason: "unknown" } }
  if (read.kind === "review" && read.presentation.kind === "retained") {
    // @ts-expect-error A retained disclosure publishes no raw evidence.
    void read.presentation.checkpoint
    // @ts-expect-error A read cannot release held activation.
    read.presentation.activation = "ordinary-gates"
  }
  if (result.kind === "unconfirmed") {
    // @ts-expect-error An uncertain result does not publish consent.
    void result.consent
  }
  void join; void sync; void retained; void application
}
void negative
