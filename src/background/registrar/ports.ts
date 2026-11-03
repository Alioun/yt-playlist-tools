import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import type { RegisteredScript, RegistrationFeature } from "../../shared/features/registration"
import type { Settings } from "../../shared/model/types"

export type OwnerSnapshot =
  | { readonly kind: "held"; readonly revision: number }
  | { readonly kind: "ok"; readonly revision: number; readonly consent: boolean; readonly schemaOk: boolean; readonly settings: Settings }

export type OwnerPort = {
  ready(): Promise<"ok" | "held">
  current(): OwnerSnapshot
  subscribe(changed: () => void): () => void
}

export type ObservedScript = {
  readonly id: string
  readonly matches: readonly string[]
  readonly js: readonly string[]
  readonly css: readonly string[]
  readonly excludeMatches: readonly string[]
  readonly world: "MAIN" | "ISOLATED"
  readonly runAt: "document_start" | "document_end" | "document_idle"
  readonly allFrames: boolean
  readonly persistAcrossSessions: boolean
  readonly matchOriginAsFallback: boolean
}
export type RegistrationObservation = { readonly kind: "observed"; readonly scripts: readonly ObservedScript[] } | { readonly kind: "unavailable" }

export type TabFact = {
  readonly id: number
  readonly site: Site
  readonly url: string
  readonly active: boolean
  readonly focusedWindow: boolean
  readonly audible: boolean
  readonly lastAccessed: number
  readonly discarded: boolean
  readonly frozen: boolean
}
export type TabLookup = { readonly kind: "found"; readonly tab: TabFact } | { readonly kind: "unavailable" }
export type TabsPort = {
  list(): Promise<readonly TabFact[]>
  get(tabId: number): Promise<TabLookup>
}

export type ProbeRequest = { readonly tabId: number; readonly site: Site; readonly build: BuildId }
export type ProbeObservation =
  | { readonly kind: "observed"; readonly documentId: string; readonly loaded: readonly { readonly file: string; readonly build: BuildId }[] }
  | { readonly kind: "unavailable"; readonly reason: "closed" | "inaccessible" | "no-receiver" | "unsupported" | "not-observed" }
export type ProbePort = { inspect(request: ProbeRequest): Promise<ProbeObservation> }

export type Injection = ProbeRequest & {
  readonly documentId: string
  readonly world: "MAIN" | "ISOLATED"
  readonly file: string
}
export type ScriptingPort = {
  list(): Promise<readonly ObservedScript[]>
  register(scripts: readonly RegisteredScript[]): Promise<void>
  update(scripts: readonly RegisteredScript[]): Promise<void>
  unregister(ids: readonly RegisteredScript["id"][]): Promise<void>
  executeScript(injection: Injection): Promise<void>
}
export type AccessPort = {
  contains(site: Site): Promise<boolean>
  offer(tabId: number, site: Site): Promise<"offered" | "unsupported">
  subscribe(changed: () => void): () => void
}
export type StartupPort = { subscribe(started: () => void): () => void }

export type EnsureWhat = { readonly core?: boolean; readonly kit?: boolean; readonly popovers?: boolean; readonly jobs?: boolean }

export type Refusal = "disposed" | "superseded" | "owner-not-ready" | "consent" | "schema" | "access" | "tab-unavailable" | "document-changed" | "prerequisite-missing"
export type FailureFact =
  | { readonly kind: "unexpected" }
  | { readonly kind: "refused"; readonly reason: Refusal }
  | { readonly kind: "port"; readonly operation: "ready" | "access" | "tabs" | "probe" | "list" | "offer" }
  | { readonly kind: "registration"; readonly operation: "register" | "update" | "unregister"; readonly call: "resolved" | "rejected"; readonly after: RegistrationObservation }
  | { readonly kind: "injection"; readonly injection: Injection; readonly call: "resolved" | "rejected"; readonly after: ProbeObservation }
  | { readonly kind: "probe-unavailable"; readonly after: Extract<ProbeObservation, { kind: "unavailable" }> }

export class RegistrarError extends Error {
  constructor(readonly fact: FailureFact) {
    super(`Registrar ${fact.kind}`)
    this.name = "RegistrarError"
  }
}

export type RegistrarPorts = {
  readonly build: BuildId
  readonly registry: readonly RegistrationFeature[]
  readonly owner: OwnerPort
  readonly access: AccessPort
  readonly tabs: TabsPort
  readonly probe: ProbePort
  readonly scripting: ScriptingPort
  readonly startup: StartupPort
  backgroundError(error: RegistrarError): void
}
export type Registrar = {
  reconcile(): Promise<void>
  ensure(tabId: number, what: EnsureWhat): Promise<void>
  dispose(): void
}
