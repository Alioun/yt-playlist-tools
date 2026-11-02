import { features, anchors, type AnchorId } from "../../shared/features/registry"
import type { JobId } from "../../shared/contracts/vocabulary"
import type { RouteId } from "../../shared/contracts/identifiers"
import { tabViewFacts } from "../tab-view/producer"
import { createMonitor } from "../monitor"
import type { AnchorObservation, JobRoutes, MonitorAuthority, SiteDiagnostics } from "../monitor/ports"
import type { DiagnosticVocabulary } from "../../shared/contracts/diagnostics"
import type { Site } from "../../shared/contracts/vocabulary"
import type { MonitorInstance } from "../store/monitor-session"
import type { SessionChange, SessionRead, SessionWrite } from "../store/session-memory"
import type { TabContext } from "../tabs/ports"

/**
 * The Monitor in production (B35). Its authority answers from what the background knows for certain: the tab's
 * site core said hello with its account state, so the core and account keys are present, and every job and
 * anchor a feature needs is there until the tab's own signals, which the Monitor records, say otherwise. A tab with
 * no evidence reads as working, as HEALTH-01 has it.
 */
export function composeMonitor(deps: {
  readonly owner: { readSession(): Promise<SessionRead>; changeSession(change: SessionChange): Promise<SessionWrite>; subscribeView(fn: () => void): () => void }
  readonly clock: { now(): number; after(milliseconds: number, run: () => void): () => void }
  /** The page halves' shipped routes and vocabulary. Without them every job reads as one usable route and no signal validates. */
  readonly sites?: SiteDiagnostics
}) {
  const jobs = new Set<JobId>(), anchorIds = new Set<AnchorId>()
  for (const feature of features) for (const health of Object.values(feature.health)) {
    if (!health) continue
    for (const job of [...health.required, ...health.optional, ...Object.values(health.actions ?? {}).flat()]) jobs.add(job)
    for (const anchor of [...health.anchors, ...health.optionalAnchors ?? []]) anchorIds.add(anchor)
  }
  for (const job of ["queueAddList", "addBatch", "removeBatch", "membership", "account"] as const) jobs.add(job)
  const noEvidence: JobRoutes = { routes: [{ route: "no-evidence" as RouteId, state: "usable" }] }
  // A route's failures come from the tab's recorded signals; the authority only names the routes each job ships (HEALTH-07).
  const shipped = (site: Site, job: JobId): JobRoutes => {
    const [first, ...rest] = deps.sites?.[site].routes[job] ?? []
    return first ? { routes: [{ route: first, state: "usable" }, ...rest.map(route => ({ route, state: "usable" as const }))] } : noEvidence
  }
  const both = deps.sites ? [deps.sites.www.vocabulary, deps.sites.music.vocabulary] : []
  const vocabulary: DiagnosticVocabulary = { routes: [...new Set(both.flatMap(row => row.routes))], watchIds: [...new Set(both.flatMap(row => row.watchIds))],
    schemaKeys: [...new Set(both.flatMap(row => row.schemaKeys))] }
  const notApplicable: AnchorObservation = { kind: "not-applicable" }
  void anchors
  const authority: MonitorAuthority = {
    async capture(context: TabContext) {
      return { kind: "context", facts: tabViewFacts(context), visible: true, fullscreen: false, current: () => true }
    },
    async health(context: TabContext) {
      return { kind: "health", current: () => true, facts: {
        site: context.tab.site, core: "present", accountKeys: "present",
        jobs: new Map([...jobs].map(job => [job, shipped(context.tab.site, job)])),
        anchors: new Map([...anchorIds].map(anchor => [anchor, notApplicable])),
        gather: { player: "usable", queue: "usable", playlist: "usable" },
        background: new Map([["sync", { state: "working", kinds: [] }]])
      } }
    },
    subscribe(changed) { return deps.owner.subscribeView(() => changed({ kind: "session" })) }
  }
  const instance = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, "0")).join("") as MonitorInstance
  return createMonitor({ owner: deps.owner, authority, vocabulary, instance, clock: deps.clock })
}
