import { projectClaimNotice, executeClaimNoticeAcknowledgement, type ClaimNoticeRead, type ClaimNoticeAcknowledgement, type NoticeWriteObservation, type NormalUiOrigin } from "./claim-notice"
import { createLocalFilterWriter, createStartingLocalFilterWriter, type LocalWriteStorage } from "./local-filter-writer"
import type { ClaimNotice } from "../../shared/model"
import type { Snapshot } from "../../shared/model/settings-view"
import type { Origin } from "../../shared/contracts/results"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
type Read =
  | { readonly kind: "empty" }
  | { readonly kind: "pending"; readonly notice: Snapshot<ClaimNotice> }
  | { readonly kind: "held"; readonly reason: "consent" | "upgrade-note" }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "stale" }
  | { readonly kind: "invalid"; readonly field: "records" | "schema" | "device" }
type Write = { readonly kind: "resolved" } | { readonly kind: "rejected"; readonly error: unknown }
type Acknowledgement =
  | { readonly kind: "unchanged"; readonly reason: "empty" | "different-notice" }
  | { readonly kind: "committed"; readonly write: Write }
  | { readonly kind: "refused"; readonly reason: "invalid" }
  | { readonly kind: "unavailable"; readonly reason: "startup" | "newer-layout" | "stale" | "consent" | "upgrade-note" }
  | { readonly kind: "failed"; readonly stage: "before-set" | "set-not-observed"; readonly error: unknown }
  | { readonly kind: "unconfirmed"; readonly write: Write; readonly cause: { readonly kind: "readback" | "stopped" } | { readonly kind: "read-failed"; readonly error: unknown } }
type Writer = ReturnType<typeof createLocalFilterWriter>
export type NoticeProofs = [
  Check<Equal<ClaimNoticeRead, Read>>,
  Check<Equal<NoticeWriteObservation, Write>>,
  Check<Equal<ClaimNoticeAcknowledgement, Acknowledgement>>,
  Check<Equal<NormalUiOrigin, Extract<Origin, { kind: "ui" }> & { readonly incognito: false }>>,
  Check<Equal<typeof projectClaimNotice, (input: { readonly records: Readonly<Record<string, unknown>> }) => Read>>,
  Check<
    Equal<
      typeof executeClaimNoticeAcknowledgement,
      (deps: { readonly local: LocalWriteStorage; readonly expected: Snapshot<ClaimNotice>; readonly isStopped: () => boolean }) => Promise<Acknowledgement>
    >
  >,
  Check<Equal<Writer["readClaimNotice"], () => Promise<Read>>>,
  Check<Equal<Writer["acknowledgeClaimNotice"], (origin: NormalUiOrigin, expected: Snapshot<ClaimNotice>) => Promise<Acknowledgement>>>,
  Check<Equal<ReturnType<typeof createStartingLocalFilterWriter>["acknowledgeClaimNotice"], Writer["acknowledgeClaimNotice"]>>,
  Check<Equal<keyof typeof import("./claim-notice"), "projectClaimNotice" | "executeClaimNoticeAcknowledgement">>
]
function boundaries(writer: Writer, expected: Snapshot<ClaimNotice>, read: Read, result: Acknowledgement) {
  void writer.acknowledgeClaimNotice({ kind: "ui", windowId: 1, incognito: false }, expected)
  // @ts-expect-error Private callers are outside this unit's narrow synthetic contract.
  void writer.acknowledgeClaimNotice({ kind: "ui", windowId: 1, incognito: true }, expected)
  // @ts-expect-error A tab origin cannot acknowledge.
  void writer.acknowledgeClaimNotice({ kind: "tab", tabId: 1 }, expected)
  // @ts-expect-error A bare account is not the displayed notice.
  void writer.acknowledgeClaimNotice({ kind: "ui", windowId: 1, incognito: false }, expected.acct)
  // @ts-expect-error The public method accepts no lifetime provider.
  void writer.acknowledgeClaimNotice({ kind: "ui", windowId: 1, incognito: false }, expected, () => false)
  // @ts-expect-error The compare value is immutable.
  expected.dropped = 0
  if (read.kind === "pending" && read.notice.claim) {
    // @ts-expect-error Nested notice detail is immutable.
    read.notice.claim.shortcut.kind = "not-owned"
  }
  // @ts-expect-error A read is not an acknowledgement.
  void writer.acknowledgeClaimNotice({ kind: "ui", windowId: 1, incognito: false }, read)
  // @ts-expect-error A successful result requires a write observation.
  const missing: Acknowledgement = { kind: "committed" }
  // @ts-expect-error Results cannot be overwritten.
  result.kind = "committed"
  void missing
}
void boundaries
