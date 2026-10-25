import { createLocalFilterWriter, createStartingLocalFilterWriter, StartupReadinessError } from "./local-filter-writer"
import type { StoreStartupHost } from "./interim-persistence"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
export type ReadinessProofs = [
  Check<Equal<Parameters<typeof createStartingLocalFilterWriter>[0], Parameters<typeof createLocalFilterWriter>[0] & { readonly startup: StoreStartupHost }>>,
  Check<Equal<ReturnType<typeof createStartingLocalFilterWriter>, ReturnType<typeof createLocalFilterWriter> & { ready(): Promise<"ok" | "newer-layout"> }>>,
  Check<Equal<"ready" extends keyof ReturnType<typeof createLocalFilterWriter> ? true : false, false>>
]
function negative(deps: Parameters<typeof createLocalFilterWriter>[0], starting: ReturnType<typeof createStartingLocalFilterWriter>) {
  // @ts-expect-error Preinitialized owners cannot claim verified readiness.
  void createLocalFilterWriter(deps).ready()
  // @ts-expect-error Verified startup requires the sanitized execution ports.
  createStartingLocalFilterWriter(deps)
  // @ts-expect-error Readiness accepts no override or schema assertion.
  void starting.ready("ok")
  // @ts-expect-error A successful removal cannot be reported as a readiness failure.
  new StartupReadinessError({ kind: "pending-removal", result: { kind: "committed" } })
  // @ts-expect-error Failure results cannot contain success.
  new StartupReadinessError({ kind: "ok" })
  // @ts-expect-error Pending join readiness describes only supported checkpoint observations.
  new StartupReadinessError({ kind: "pending-join", observation: "confirmed" })
}
void negative

import type { AgreementResult } from "./consent-agreement"
export type AgreementReadinessProofs = [
  Check<Equal<Awaited<ReturnType<ReturnType<typeof createStartingLocalFilterWriter>["ready"]>>, "ok" | "newer-layout">>,
  Check<Equal<Extract<AgreementResult, { kind: "committed" }>["activation"], "ordinary-gates" | "held">>
]
