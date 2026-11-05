import { createStoreStartupHost, projectInterimSnapshot, StartupSourceRefusal, type SanitizedStartupInventory, type StartupSourceRefusalCode } from "./startup-source"
import type { HistoricalFact } from "../store/interim-conversion"
import type { InterimPersistenceSnapshot, StoreStartupHost } from "../store/interim-persistence"
import type { StartupHost } from "../store/legacy-execution"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T
type Deps = Parameters<typeof createStoreStartupHost>[0]
export type StartupSourceProofs = [
  Check<Equal<ReturnType<typeof createStoreStartupHost>, StoreStartupHost>>,
  Check<Equal<Deps["context"], StartupHost["context"]>>,
  Check<Equal<Deps["cleanup"], Pick<StartupHost, "removeLocal" | "deleteDatabase" | "removeSession">>>,
  Check<Equal<Awaited<ReturnType<Deps["source"]["readInventory"]>>, SanitizedStartupInventory>>,
  Check<Equal<SanitizedStartupInventory["historicalAuthorization"], HistoricalFact>>,
  Check<Equal<SanitizedStartupInventory["priorCredentialPresence"], HistoricalFact>>,
  Check<Equal<ReturnType<typeof projectInterimSnapshot>, InterimPersistenceSnapshot>>,
  Check<Equal<StartupSourceRefusal["code"], StartupSourceRefusalCode>>,
  Check<Equal<Extract<keyof ReturnType<typeof createStoreStartupHost>, "get" | "set" | "remove" | "clear">, never>>
]

function negative(deps: Deps, inventory: SanitizedStartupInventory) {
  // @ts-expect-error A host needs the sanitized source read.
  createStoreStartupHost({ context: deps.context, source: {}, cleanup: deps.cleanup })
  // @ts-expect-error Every semantic cleanup operation stays an explicit port.
  createStoreStartupHost({ context: deps.context, source: deps.source, cleanup: { removeLocal: deps.cleanup.removeLocal, deleteDatabase: deps.cleanup.deleteDatabase } })
  // @ts-expect-error A synchronous inventory cannot stand in for the awaited source read.
  createStoreStartupHost({ context: deps.context, source: { readInventory: () => inventory }, cleanup: deps.cleanup })
  // @ts-expect-error The source supplies the interim history and never omits it.
  const missing: SanitizedStartupInventory = { presentLocalKeys: [], values: {}, legacyAuthorization: { kind: "unavailable" }, historicalAuthorization: { kind: "unknown" } }
  // @ts-expect-error A known historical fact carries its observed value.
  const known: SanitizedStartupInventory = { ...inventory, historicalAuthorization: { kind: "known" } }
  // @ts-expect-error Unknown is not a third boolean value.
  const unknown: SanitizedStartupInventory = { ...inventory, priorCredentialPresence: { kind: "known", value: "unknown" } }
  // @ts-expect-error A boolean cannot stand in for unavailable original-path authorization.
  const flag: SanitizedStartupInventory = { ...inventory, legacyAuthorization: false }
  // @ts-expect-error Observed authorization carries the nonempty refresh fact.
  const observed: SanitizedStartupInventory = { ...inventory, legacyAuthorization: { kind: "observed" } }
  // @ts-expect-error Unavailable authorization carries no coerced value.
  const coerced: SanitizedStartupInventory = { ...inventory, legacyAuthorization: { kind: "unavailable", refreshTokenWasNonempty: false } }
  // @ts-expect-error Refusals carry only the fixed codes.
  new StartupSourceRefusal("synthetic value")
  void [missing, known, unknown, flag, observed, coerced]
}
void negative
