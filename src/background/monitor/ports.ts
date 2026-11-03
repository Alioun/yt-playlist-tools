import type { DiagnosticVocabulary } from "../../shared/contracts/diagnostics"
import type { BreakageKind, FeatureId, JobId, Site } from "../../shared/contracts/vocabulary"
import type { RouteId } from "../../shared/contracts/identifiers"
import type { FeatureStatus, TabFeature, TabViewFacts } from "../../shared/contracts/tab-view"
import type { MusicAction, Settings } from "../../shared/model/types"
import type { AccountKey } from "../../shared/model/validation"
import type { AnchorId } from "../../shared/features/registry"
import type { TabContext } from "../tabs/ports"
import type { SessionChange, SessionRead, SessionWrite } from "../store/session-memory"
import type { GatherDestination, MonitorInstance } from "../store/monitor-session"

export type RouteFact = { readonly route: RouteId; readonly state: "usable" | "missing" | "threw" | "timeout" | "rejected" | "unrecognised" }
export type JobRoutes = { readonly routes: readonly [RouteFact, ...RouteFact[]] }
export type AnchorObservation =
  | { readonly kind: "not-applicable" }
  | {
      readonly kind: "content"
      readonly relevant: boolean
      readonly visible: boolean
      readonly navigationAt: number
      readonly observedAt: number
      readonly distinctMainLinks: number
      readonly recognised: number
    }
  | { readonly kind: "player-bar"; readonly requiredHere: boolean; readonly visible: boolean; readonly navigationAt: number; readonly observedAt: number; readonly present: boolean }
export type HealthFacts = {
  readonly site: Site
  readonly core: "present" | "missing"
  readonly accountKeys: "present" | "missing"
  readonly jobs: ReadonlyMap<JobId, JobRoutes>
  readonly anchors: ReadonlyMap<AnchorId, AnchorObservation>
  readonly gather: Readonly<Record<GatherDestination, "usable" | "no-effect" | "unavailable">>
  readonly background: ReadonlyMap<"sync", { readonly state: FeatureStatus["state"]; readonly kinds: readonly BreakageKind[] }>
}
export type HealthRead = { readonly kind: "health"; readonly facts: HealthFacts; current(): boolean } | { readonly kind: "unavailable" }
export type ContextRead = { readonly kind: "context"; readonly facts: TabViewFacts; readonly visible: boolean; readonly fullscreen: boolean; current(): boolean } | { readonly kind: "unavailable" }
export type MonitorAuthority = {
  capture(context: TabContext): Promise<ContextRead>
  health(context: TabContext): Promise<HealthRead>
  subscribe(
    changed: (event: { readonly kind: "context"; readonly tabId: number } | { readonly kind: "removal"; readonly acct: AccountKey } | { readonly kind: "held" | "session" }) => void
  ): () => void
}
export type EnabledMonitorFeature =
  | TabFeature
  | { readonly id: "browser-menu"; readonly options: Readonly<Settings["browserMenu"]> & { readonly on: true } }
  | { readonly id: "any-tab-keys"; readonly options: Readonly<Settings["anyTabKeys"]> & { readonly on: true } }
  | { readonly id: "sync"; readonly options: { readonly on: true } }
export type MonitorStatus = Omit<FeatureStatus, "feature"> & { readonly feature: FeatureId; readonly destinations: readonly GatherDestination[] }
export type MonitorPorts = {
  readonly owner: { readSession(): Promise<SessionRead>; changeSession(change: SessionChange): Promise<SessionWrite> }
  readonly authority: MonitorAuthority
  readonly vocabulary: DiagnosticVocabulary
  readonly instance: MonitorInstance
  readonly clock: { now(): number; after(milliseconds: number, run: () => void): () => void }
}
export type MonitorActions = Readonly<Partial<Record<MusicAction, readonly JobId[]>>>

export type MonitorViewChange = { readonly kind: "tab"; readonly tabId: number }
/** Each site's shipped routes per job and the diagnostics vocabulary its page half checks signals against. */
export type SiteDiagnostics = Readonly<Record<Site, { readonly vocabulary: DiagnosticVocabulary; readonly routes: Readonly<Partial<Record<JobId, readonly RouteId[]>>> }>>
