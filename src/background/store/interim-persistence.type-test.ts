import { executeInterimRetention, readRetainedInterim, projectInterimNote, type RetainedInterimRead, type InterimPersistenceSnapshot, type InterimRetentionResult, type InterimNoteRead, type StoreStartupHost } from "./interim-persistence"
import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import type { StartupHost } from "./legacy-execution"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type InterimPersistenceProofs = [
  Check<Equal<typeof readRetainedInterim, (raw: unknown) => RetainedInterimRead>>,
  Check<Equal<ReturnType<typeof executeInterimRetention>, Promise<InterimRetentionResult>>>,
  Check<Equal<ReturnType<typeof projectInterimNote>, InterimNoteRead>>,
  Check<Equal<StoreStartupHost, StartupHost & { readInterimSnapshot(): Promise<InterimPersistenceSnapshot> }>>,
  Check<Equal<ReturnType<typeof createStartingLocalFilterWriter>["readInterimNote"], () => Promise<InterimNoteRead>>>,
  Check<Equal<ReturnType<typeof createLocalFilterWriter>["readInterimNote"], () => Promise<InterimNoteRead>>>,
  Check<Equal<"remove" extends keyof Parameters<typeof executeInterimRetention>[0]["local"] ? true : false, false>>,
  Check<Equal<Extract<InterimRetentionResult, { kind: "ok" | "completed" }>, never>>,
  Check<Equal<Extract<InterimNoteRead, { kind: "inactive-proposal" }>["note"]["freshAgreementRequired"], true>>
]
function negative(deps: Parameters<typeof createLocalFilterWriter>[0], old: StartupHost, input: Parameters<typeof executeInterimRetention>[0], note: InterimNoteRead) {
  // @ts-expect-error A legacy-only host cannot omit the mandatory complete snapshot.
  createStartingLocalFilterWriter({ ...deps, startup: old })
  // @ts-expect-error The snapshot must include explicit checkpoint presence and historical facts.
  const incomplete: InterimPersistenceSnapshot = { source: {}, canonical: {} }
  // @ts-expect-error Retention has no delete port.
  void input.local.remove(["account:AAAAAAAAAAAAAAAA"])
  // @ts-expect-error A completed conversion is not an inactive retention result.
  const completed: InterimRetentionResult = { kind: "ok" }
  // @ts-expect-error Readiness error cannot present a non-interim route as held.
  new StartupReadinessError({ kind: "interim-held", result: { kind: "not-interim" } })
  if (note.kind === "inactive-proposal") {
    // @ts-expect-error Reads cannot grant agreement.
    note.note.freshAgreementRequired = false
    // @ts-expect-error Original checkpoint source is deeply readonly.
    note.checkpoint.source.savedAccountKeys = []
    // @ts-expect-error Reads cannot allocate another conversion row.
    note.checkpoint.context.interimShortcutId = "other1"
  }
  void incomplete; void completed
}
void negative

import { readRetainedCheckpoint, type RetainedAgreementV2, type RetainedAgreementEffect, type RetainedCheckpointRead, type RetainedInterim } from "./interim-persistence"
export type SuccessorProofs = [
  Check<Equal<typeof readRetainedCheckpoint, (raw: unknown) => RetainedCheckpointRead>>,
  Check<Equal<RetainedAgreementV2["v"], 2>>,
  Check<Equal<Extract<InterimRetentionResult, { kind: "pending-agreement" | "retained-agreement" }>["checkpoint"], import("../../shared/model/settings-view").Snapshot<RetainedAgreementV2>>>,
  Check<Equal<RetainedAgreementV2["agreement"]["effect"], RetainedAgreementEffect>>
]
function successorNegative(successor: RetainedAgreementV2, original: RetainedInterim) {
  // @ts-expect-error The v1 checkpoint arm cannot contain its successor.
  const wrong: Extract<RetainedInterimRead, { kind: "valid" }> = { kind: "valid", checkpoint: successor }
  // @ts-expect-error Agreement is an explicit named receipt with a fixed effect.
  const missing: RetainedAgreementV2 = { v: 2, kind: "retained-interim", retained: original, agreement: { kind: "confirmed" } }
  // @ts-expect-error No conversion installation is authorized by v2.
  successor.agreement = { kind: "installed", effect: successor.agreement.effect }
  void wrong; void missing
}
void successorNegative
