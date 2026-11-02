import { features, anchors, type AnchorId } from "../../shared/features/registry"
import type { JobId } from "../../shared/contracts/vocabulary"
import type { RouteId } from "../../shared/contracts/identifiers"
import { tabViewFacts } from "../tab-view/producer"
import { createMonitor } from "../monitor"
import type { AnchorObservation, JobRoutes, MonitorAuthority } from "../monitor/ports"
import type { MonitorInstance } from "../store/monitor-session"
import type { SessionChange, SessionRead, SessionWrite } from "../store/session-memory"
import type { TabContext } from "../tabs/ports"

/**
 * The Monitor in production (B35). Its authority answers from what the background knows for certain: the tab's
 * site core said hello with its account state, so the core and account keys are present, and every job and
 * anchor a feature needs has no breakage evidence yet. Site signals and anchor observations raise statuses once
 * the site core reports them; until then a feature reads as working, as HEALTH-01 has it for a tab with no evidence.
 */
export function composeMonitor(deps: {
  readonly owner: { readSession(): Promise<SessionRead>; changeSession(change: SessionChange): Promise<SessionWrite>; subscribeView(fn: () => void): () => void }
  readonly clock: { now(): number; after(milliseconds: number, run: () => void): () => void }
}) {
  const jobs = new Set<JobId>(), anchorIds = new Set<AnchorId>()
  for (const feature of features) for (const health of Object.values(feature.health)) {
    if (!health) continue
    for (const job of [...health.required, ...health.optional, ...Object.values(health.actions ?? {}).flat()]) jobs.add(job)
    for (const anchor of [...health.anchors, ...health.optionalAnchors ?? []]) anchorIds.add(anchor)
  }
  for (const job of ["queueAddList", "addBatch", "removeBatch", "membership", "account"] as const) jobs.add(job)
  const noEvidence: JobRoutes = { routes: [{ route: "no-evidence" as RouteId, state: "usable" }] }
  const notApplicable: AnchorObservation = { kind: "not-applicable" }
  void anchors
  const authority: MonitorAuthority = {
    async capture(context: TabContext) {
      return { kind: "context", facts: tabViewFacts(context), visible: true, fullscreen: false, current: () => true }
    },
    async health(context: TabContext) {
      return { kind: "health", current: () => true, facts: {
        site: context.tab.site, core: "present", accountKeys: "present",
        jobs: new Map([...jobs].map(job => [job, noEvidence])),
        anchors: new Map([...anchorIds].map(anchor => [anchor, notApplicable])),
        gather: { player: "usable", queue: "usable", playlist: "usable" },
        background: new Map([["sync", { state: "working", kinds: [] }]])
      } }
    },
    subscribe(changed) { return deps.owner.subscribeView(() => changed({ kind: "session" })) }
  }
  const instance = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, "0")).join("") as MonitorInstance
  return createMonitor({ owner: deps.owner, authority, vocabulary: { routes: [], watchIds: [], schemaKeys: [] }, instance, clock: deps.clock })
}
