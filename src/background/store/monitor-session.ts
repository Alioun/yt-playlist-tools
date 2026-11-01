import { isBreakageSignal, type BreakageSignal, type DiagnosticVocabulary } from "../../shared/contracts/diagnostics"
import { objectShape } from "../../shared/contracts/object-shape"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"
import { isSite, isJobId, isFeatureId, type Site, type JobId, type FeatureId } from "../../shared/contracts/vocabulary"
import { anchors, type AnchorId } from "../../shared/features/registry"
import { MONITOR_TIMEOUTS, MONITOR_NO_EFFECTS, MONITOR_CANNOT_MEASURE, MONITOR_SIGNALS } from "../monitor/thresholds"

export type MonitorInstance = string & { readonly __brand: "MonitorInstance" }
export function isMonitorInstance(value: unknown): value is MonitorInstance {
  return typeof value === "string" && /^[a-f0-9]{16}$/.test(value)
}
export type GatherDestination = "player" | "queue" | "playlist"
export type SignalEvidence =
  | { readonly kind: "job"; readonly online: boolean; readonly otherRequestsAnswer: boolean }
  | { readonly kind: "anchor"; readonly anchor: AnchorId }
  | { readonly kind: "gather"; readonly destination: GatherDestination }
  | { readonly kind: "playback" | "diagnostic" }
export type MonitorOperation = { readonly instance: MonitorInstance; readonly sequence: number; readonly tabId: number; readonly site: Site } & (
  | { readonly kind: "signal"; readonly signal: BreakageSignal; readonly evidence: SignalEvidence }
  | { readonly kind: "success" | "interrupted"; readonly job: JobId }
  | { readonly kind: "measured" | "reload-passed" }
)
export type MonitorRecord = {
  readonly tabId: number; readonly signal: BreakageSignal; readonly evidence: SignalEvidence; readonly active: boolean
}
export type MonitorCounter = {
  readonly tabId: number; readonly site: Site; readonly job: JobId | null; readonly feature: FeatureId | null
  readonly destination: GatherDestination | null; readonly timeouts: number; readonly noEffects: number; readonly cannotMeasure: number
}
export type MonitorJournal = {
  readonly signals: readonly MonitorRecord[]
  readonly counters: readonly MonitorCounter[]
  readonly seen: Readonly<Record<string, number>>
  readonly passed: readonly { readonly tabId: number; readonly site: Site; readonly job: JobId | null }[]
}
export const emptyMonitorJournal: MonitorJournal = { signals: [], counters: [], seen: {}, passed: [] }
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const destination = (value: unknown): value is GatherDestination => value === "player" || value === "queue" || value === "playlist"
const anchor = (value: unknown): value is AnchorId => typeof value === "string" && Object.hasOwn(anchors, value)
export function isSignalEvidence(value: unknown): value is SignalEvidence {
  return objectShape(value, { kind: v => v === "job", online: v => typeof v === "boolean", otherRequestsAnswer: v => typeof v === "boolean" }) ||
    objectShape(value, { kind: v => v === "anchor", anchor }) ||
    objectShape(value, { kind: v => v === "gather", destination }) ||
    objectShape(value, { kind: v => v === "playback" || v === "diagnostic" })
}
export function isMonitorOperation(value: unknown, vocabulary: DiagnosticVocabulary): value is MonitorOperation {
  const common = { instance: isMonitorInstance, sequence: (v: unknown) => natural(v) && v > 0, tabId: natural, site: isSite }
  if (objectShape(value, { ...common, kind: v => v === "signal", signal: v => isBreakageSignal(v, vocabulary), evidence: isSignalEvidence })) {
    return isSite(value.site) && isBreakageSignal(value.signal, vocabulary) && value.signal.site === value.site &&
      isSignalEvidence(value.evidence) && (value.evidence.kind !== "anchor" || anchors[value.evidence.anchor].site === value.site)
  }
  return objectShape(value, { ...common, kind: v => v === "success" || v === "interrupted", job: isJobId }) ||
    objectShape(value, { ...common, kind: v => v === "measured" || v === "reload-passed" })
}
export function parseMonitorJournal(value: unknown, vocabulary: DiagnosticVocabulary): MonitorJournal | undefined {
  if (value === undefined) return structuredClone(emptyMonitorJournal)
  const counter = (v: unknown): v is MonitorCounter => objectShape(v, {
    tabId: natural, site: isSite, job: v => v === null || isJobId(v), feature: v => v === null || isFeatureId(v),
    destination: v => v === null || destination(v), timeouts: v => natural(v) && v <= MONITOR_TIMEOUTS,
    noEffects: v => natural(v) && v <= MONITOR_NO_EFFECTS, cannotMeasure: v => natural(v) && v <= MONITOR_CANNOT_MEASURE
  })
  const record = (v: unknown): v is MonitorRecord => objectShape(v, {
    tabId: natural, signal: v => isBreakageSignal(v, vocabulary), evidence: isSignalEvidence, active: v => typeof v === "boolean"
  })
  if (!objectShape(value, {
    signals: v => Array.isArray(v) && v.length <= MONITOR_SIGNALS && v.every(record),
    counters: v => Array.isArray(v) && v.length <= MONITOR_SIGNALS && v.every(counter),
    passed: v => Array.isArray(v) && v.length <= MONITOR_SIGNALS && v.every(row => objectShape(row, { tabId: natural, site: isSite, job: v => v === null || isJobId(v) })),
    seen: v => v !== null && typeof v === "object" && !Array.isArray(v) && Object.entries(v).length <= MONITOR_SIGNALS &&
      Object.entries(v).every(([key, count]) => isMonitorInstance(key) && natural(count))
  }) || !Array.isArray(value.signals) || !value.signals.every(record) || !Array.isArray(value.counters) || !value.counters.every(counter)) return
  const seen: Record<string, number> = {}
  if (value.seen === null || typeof value.seen !== "object") return
  for (const [key, count] of Object.entries(value.seen)) { if (!isMonitorInstance(key) || !natural(count)) return; seen[key] = count }
  const passed: { tabId: number; site: Site; job: JobId | null }[] = []
  if (!Array.isArray(value.passed)) return
  for (const row of value.passed) {
    if (!objectShape(row, { tabId: natural, site: isSite, job: v => v === null || isJobId(v) }) || !natural(row.tabId) || !isSite(row.site) || row.job !== null && !isJobId(row.job)) return
    passed.push({ tabId: row.tabId, site: row.site, job: row.job })
  }
  return structuredClone({ signals: value.signals, counters: value.counters, seen, passed })
}
export function monitorJson(journal: MonitorJournal): JsonObject {
  const value: unknown = structuredClone(journal)
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid Monitor journal")
  return value
}
const diagnostic = (kind: BreakageSignal["kind"]) => kind === "cosmetic" || kind === "fell-back" || kind === "resolver-ambiguous"
export function monitorSignalKey(row: Pick<MonitorRecord, "tabId" | "signal" | "evidence">): string {
  const s = row.signal
  return JSON.stringify([row.tabId, s.site, s.feature, s.job, s.route, s.kind, s.watchId, s.pageType, s.clientVersion, s.shape, row.evidence.kind === "anchor" ? row.evidence.anchor : row.evidence.kind === "gather" ? row.evidence.destination : null])
}
export function applyMonitorOperation(journal: MonitorJournal, operation: MonitorOperation): MonitorJournal {
  if ((journal.seen[operation.instance] ?? 0) >= operation.sequence) return structuredClone(journal)
  if (!Object.hasOwn(journal.seen, operation.instance) && Object.keys(journal.seen).length >= MONITOR_SIGNALS) throw Error("Monitor instance admission exhausted")
  let signals = [...journal.signals], counters = [...journal.counters], passed = [...journal.passed]
  const inTab = (row: { tabId: number; site: Site }) => row.tabId === operation.tabId && row.site === operation.site
  if (operation.kind !== "signal") {
    if (operation.kind === "success" || operation.kind === "reload-passed") {
      const job = operation.kind === "success" ? operation.job : null
      passed = [...passed.filter(row => !inTab(row) || row.job !== job), { tabId: operation.tabId, site: operation.site, job }].slice(-MONITOR_SIGNALS)
    }
    signals = signals.map(row => inTab({ tabId: row.tabId, site: row.signal.site }) &&
      (operation.kind === "reload-passed" || operation.kind === "success" && row.signal.job === operation.job || operation.kind === "measured" && row.signal.kind === "cannot-measure")
      ? { ...row, active: false } : row)
    counters = counters.filter(row => !inTab(row) || !(operation.kind === "reload-passed" || (operation.kind === "success" || operation.kind === "interrupted") && row.job === operation.job || operation.kind === "measured" && row.feature === "auto-add"))
  } else {
    const signal = operation.signal, evidence = operation.evidence
    if (!diagnostic(signal.kind)) passed = passed.filter(row => !inTab(row) || row.job !== null && row.job !== signal.job)
    const target = { tabId: operation.tabId, site: operation.site, job: signal.kind === "cannot-measure" ? null : signal.job,
      feature: signal.job !== null && signal.kind !== "cannot-measure" ? null : signal.feature,
      destination: evidence.kind === "gather" ? evidence.destination : null }
    const index = counters.findIndex(row => row.tabId === target.tabId && row.site === target.site && row.job === target.job && row.feature === target.feature && row.destination === target.destination)
    const previous = counters[index] ?? { ...target, timeouts: 0, noEffects: 0, cannotMeasure: 0 }
    const next: MonitorCounter = { ...target,
      timeouts: signal.kind === "timeout" && evidence.kind === "job" && evidence.online && evidence.otherRequestsAnswer ? Math.min(MONITOR_TIMEOUTS, previous.timeouts + signal.count) : 0,
      noEffects: signal.kind === "no-effect" ? Math.min(MONITOR_NO_EFFECTS, previous.noEffects + signal.count) : 0,
      cannotMeasure: signal.kind === "cannot-measure" ? Math.min(MONITOR_CANNOT_MEASURE, previous.cannotMeasure + signal.count) : previous.cannotMeasure }
    if (!diagnostic(signal.kind)) {
      if (index < 0) counters.push(next)
      else counters[index] = next
    }
    if (signal.kind === "fell-back" && signal.job !== null) {
      signals = signals.map(row => row.tabId === operation.tabId && row.signal.site === operation.site && row.signal.job === signal.job ? { ...row, active: false } : row)
      counters = counters.filter(row => !inTab(row) || row.job !== signal.job)
      passed = [...passed.filter(row => !inTab(row) || row.job !== signal.job), { tabId: operation.tabId, site: operation.site, job: signal.job }].slice(-MONITOR_SIGNALS)
    }
    const active = !diagnostic(signal.kind) && (signal.kind !== "timeout" || next.timeouts >= MONITOR_TIMEOUTS) &&
      (signal.kind !== "no-effect" || next.noEffects >= MONITOR_NO_EFFECTS)
    const row: MonitorRecord = { tabId: operation.tabId, signal: structuredClone(signal), evidence: structuredClone(evidence), active }
    const key = monitorSignalKey(row), old = signals.find(item => monitorSignalKey(item) === key)
    if (old) signals = signals.filter(item => monitorSignalKey(item) !== key)
    signals.push(old ? { ...row, active: row.active || old.active, signal: { ...signal, count: old.signal.count + signal.count, firstSeen: Math.min(old.signal.firstSeen, signal.firstSeen), lastSeen: Math.max(old.signal.lastSeen, signal.lastSeen) } } : row)
  }
  const seen = { ...journal.seen, [operation.instance]: operation.sequence }
  const seenEntries = Object.entries(seen)
  return { signals: signals.sort((a, b) => a.signal.firstSeen - b.signal.firstSeen).slice(-MONITOR_SIGNALS), counters: counters.slice(-MONITOR_SIGNALS), seen: Object.fromEntries(seenEntries), passed }
}
export function readMonitorBucket(bucket: JsonObject, vocabulary: DiagnosticVocabulary): MonitorJournal | undefined {
  return parseMonitorJournal(bucket.monitor, vocabulary)
}
export function isMonitorWriteTime(value: JsonValue | undefined): value is number | undefined { return value === undefined || natural(value) }
