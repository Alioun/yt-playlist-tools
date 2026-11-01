import { features, type HealthDependencies } from "../../shared/features/registry"
import type { FeatureStatus, TabFeature } from "../../shared/contracts/tab-view"
import type { BreakageKind, JobId } from "../../shared/contracts/vocabulary"
import type { MusicAction, Settings } from "../../shared/model/types"
import type { MonitorJournal, MonitorRecord } from "../store/monitor-session"
import type { AnchorObservation, EnabledMonitorFeature, HealthFacts, MonitorStatus } from "./ports"
import { MONITOR_CANNOT_MEASURE, MONITOR_MIN_LINKS, MONITOR_RECOGNISED_RATIO, MONITOR_SETTLE_MS } from "./thresholds"

export function anchorMissing(observation: AnchorObservation): boolean {
  if (observation.kind === "not-applicable" || !observation.visible || observation.observedAt < observation.navigationAt + MONITOR_SETTLE_MS) return false
  if (observation.kind === "player-bar") return observation.requiredHere && !observation.present
  return observation.relevant && observation.distinctMainLinks >= MONITOR_MIN_LINKS &&
    observation.recognised < observation.distinctMainLinks * MONITOR_RECOGNISED_RATIO
}
function actionEnabled(feature: EnabledMonitorFeature, action: MusicAction): boolean {
  if (feature.id === "music-actions") return feature.options.buttons[action]
  if (feature.id === "music-keys") return feature.options.keys[action] !== null
  return feature.id === "any-tab-keys" && (action === "save" || action === "like")
}
function dependencies(feature: EnabledMonitorFeature, facts: HealthFacts): HealthDependencies | undefined {
  const health = features.find(row => row.id === feature.id)?.health[facts.site]
  if (!health) return
  if (feature.id !== "gather") return health
  const required: readonly JobId[] = feature.options.to === "queue" ? ["queueAddList"] : feature.options.to === "playlist" ? ["account", "membership", "addBatch"] : []
  return { ...health, required: [...new Set([...health.required, ...required])] }
}
const unique = <T>(rows: readonly T[]): T[] => [...new Set(rows)]
export function deriveStatus(input: { readonly enabled: readonly EnabledMonitorFeature[]; readonly facts: HealthFacts; readonly journal: MonitorJournal; readonly tabId: number }):
  { readonly kind: "statuses"; readonly statuses: readonly MonitorStatus[] } | { readonly kind: "unavailable" } {
  const { facts, enabled, tabId } = input
  const records = input.journal.signals.filter(row => row.tabId === tabId && row.signal.site === facts.site && row.active)
  const statuses: MonitorStatus[] = []
  for (const feature of enabled) {
    if (!feature.options.on) continue
    if (feature.id === "sync") {
      const current = facts.background.get("sync")
      if (!current || current.state !== "working" && !current.kinds.length) return { kind: "unavailable" }
      statuses.push({ feature: "sync", state: current.state, jobs: [], anchors: [], actions: [], kinds: [...current.kinds], destinations: [] })
      continue
    }
    const health = dependencies(feature, facts)
    if (!health) return { kind: "unavailable" }
    if (feature.id === "gather" && facts.core === "present" && facts.gather.player === "unavailable") return { kind: "unavailable" }
    const actionEntries = Object.entries(health.actions ?? {}).filter((row): row is [MusicAction, readonly JobId[]] =>
      (row[0] === "next" || row[0] === "queue" || row[0] === "save" || row[0] === "like" || row[0] === "remove" || row[0] === "library" || row[0] === "mix" || row[0] === "album" || row[0] === "artist") && actionEnabled(feature, row[0]))
    const jobsNeeded = unique([...health.required, ...health.optional, ...actionEntries.flatMap(([, jobs]) => jobs)])
    const anchorIds = unique([...health.anchors, ...health.optionalAnchors ?? []])
    if (facts.core === "present" && (jobsNeeded.some(job => !facts.jobs.has(job)) || anchorIds.some(anchor => !facts.anchors.has(anchor)))) return { kind: "unavailable" }
    const relevant = (row: MonitorRecord) => row.signal.feature === null || row.signal.feature === feature.id
    const failed = (job: JobId): boolean => {
      if (job === "account" && facts.accountKeys === "missing") return true
      if (input.journal.passed.some(row => row.tabId === tabId && row.site === facts.site && (row.job === null || row.job === job))) return false
      const routes = facts.jobs.get(job)
      const failure = records.filter(row => row.signal.job === job && relevant(row))
      if (failure.some(row => row.signal.kind === "no-effect")) return true
      if (!routes || routes.routes.some(route => route.state === "usable")) return false
      return routes.routes.every(route => route.state !== "timeout" || failure.some(row => row.signal.kind === "timeout"))
    }
    const jobs = jobsNeeded.filter(failed)
    const missingAnchors = anchorIds.filter(anchor => {
      const observation = facts.anchors.get(anchor)
      return observation !== undefined && anchorMissing(observation)
    })
    const actions = actionEntries.filter(([, jobs]) => jobs.some(failed)).map(([action]) => action)
    let whole = facts.core === "missing" || health.required.some(failed) || health.anchors.some(anchor => missingAnchors.includes(anchor))
    let partial = jobs.length > 0 || missingAnchors.length > 0 || actions.length > 0
    if (actions.length && actions.length === actionEntries.length) whole = true
    const kinds: BreakageKind[] = []
    if (facts.core === "missing" || facts.accountKeys === "missing" && jobs.includes("account")) kinds.push("missing")
    if (missingAnchors.length) kinds.push("anchor-missing")
    for (const row of records.filter(relevant)) {
      const kind = row.signal.kind
      if (kind === "quiet-route-noisy" && row.signal.feature === feature.id) { partial = true; kinds.push(kind) }
      if (kind === "item-unrecognised" && row.signal.feature === feature.id) {
        partial = true; kinds.push(kind)
        if (feature.id === "quick-save" || feature.id === "queue-button" || feature.id === "card-menu") whole = true
      }
      if (kind === "cannot-measure" && feature.id === "auto-add") {
        partial = true; kinds.push(kind)
        if (input.journal.counters.some(counter => counter.tabId === tabId && counter.site === facts.site && counter.feature === "auto-add" && counter.cannotMeasure >= MONITOR_CANNOT_MEASURE)) whole = true
      }
      if (row.signal.job !== null && jobs.includes(row.signal.job) && kind !== "cannot-measure" && kind !== "anchor-missing") kinds.push(kind)
    }
    const destinations: MonitorStatus["destinations"][number][] = []
    if (feature.id === "gather") {
      const playerFailed = facts.gather.player === "no-effect" && records.some(row => row.evidence.kind === "gather" && row.evidence.destination === "player" && row.signal.kind === "no-effect")
      if (playerFailed) { whole = true; destinations.push("player"); kinds.push("no-effect") }
      for (const target of ["queue", "playlist"] as const) {
        const destinationJobs: readonly JobId[] = target === "queue" ? ["queueAddList"] : ["account", "membership", "addBatch", "removeBatch"]
        if (facts.gather[target] !== "usable" || destinationJobs.some(job => jobs.includes(job))) { partial = true; destinations.push(target) }
      }
      if (!playerFailed && facts.core === "present") whole = false
    }
    if ((whole || partial) && !jobs.length && !missingAnchors.length && !actions.length && !kinds.length) kinds.push("no-effect")
    statuses.push({ feature: feature.id, state: whole ? "not-working" : partial ? "partly-working" : "working", jobs: unique(jobs), anchors: missingAnchors, actions, kinds: unique(kinds), destinations })
  }
  return { kind: "statuses", statuses }
}
export function pageStatuses(statuses: readonly MonitorStatus[], enabled: readonly TabFeature[]): readonly FeatureStatus[] {
  return enabled.flatMap(feature => {
    const status = statuses.find(row => row.feature === feature.id)
    if (!status) return []
    const { state, jobs, anchors, actions, kinds } = status
    const declared = features.find(row => row.id === feature.id)?.health
    // Gather's extra destination jobs remain background detail. The page contract owns its smaller job vocabulary.
    const allowed = Object.values(declared ?? {}).flatMap(health => [...health.required, ...health.optional, ...Object.values(health.actions ?? {}).flat()])
    return [{ feature: feature.id, state, jobs: jobs.filter(job => allowed.includes(job)), anchors, actions, kinds }]
  })
}
export function enabledBackground(input: { readonly settings: Settings; readonly site: HealthFacts["site"]; readonly syncOn: boolean }): readonly EnabledMonitorFeature[] {
  const { settings, site, syncOn } = input
  const result: EnabledMonitorFeature[] = []
  if (site === "www" && settings.browserMenu.on) result.push({ id: "browser-menu", options: { ...settings.browserMenu, on: true } })
  if (settings.anyTabKeys.on && (site !== "music" || settings.musicSection)) result.push({ id: "any-tab-keys", options: { ...settings.anyTabKeys, on: true } })
  if (site === "www" && settings.gather.on) result.push({ id: "gather", options: { ...structuredClone(settings.gather), on: true } })
  if (syncOn) result.push({ id: "sync", options: { on: true } })
  return result
}
