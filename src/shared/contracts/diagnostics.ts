import type { Site, FeatureId, JobId, BreakageKind } from "./vocabulary"
import { isSite, isFeatureId, isJobId, isBreakageKind } from "./vocabulary"
import type { RouteId } from "./identifiers"
import { isRouteId } from "./identifiers"
import type { ShapeOutline } from "./shape-outline"
import { isShapeOutline } from "./shape-outline"
import { objectShape } from "./object-shape"

export type WatchId = string & { readonly __brand: "WatchId" }
export type DiagnosticPageType = "watch" | "shorts" | "home" | "search" | "music-browse" | "other"
export type DiagnosticVocabulary = {
  routes: readonly RouteId[]
  watchIds: readonly WatchId[]
  schemaKeys: readonly string[]
}
export type ProbeReport = { site: Site; entries: { id: WatchId; present: boolean }[] }
export type BreakageSignal = {
  site: Site
  feature: FeatureId | null
  job: JobId | null
  route: RouteId | null
  kind: BreakageKind
  watchId: WatchId | null
  shape: ShapeOutline | null
  clientVersion: string | null
  pageType: DiagnosticPageType
  count: number
  firstSeen: number
  lastSeen: number
}

export function isWatchId(value: unknown): value is WatchId {
  return typeof value === "string" && value.length > 0
}
export function isDiagnosticPageType(value: unknown): value is DiagnosticPageType {
  return value === "watch" || value === "shorts" || value === "home" || value === "search" || value === "music-browse" || value === "other"
}
export function isProbeReport(value: unknown): value is ProbeReport {
  return objectShape(value, { site: isSite, entries: entries => {
    if (!Array.isArray(entries) || !entries.every(entry => objectShape(entry, {
      id: isWatchId, present: v => typeof v === "boolean"
    }))) return false
    return new Set(entries.map(entry => entry.id)).size === entries.length
  } })
}
export function isProbeReportFor(expected: { site: Site; watchIds: readonly WatchId[] }, value: unknown): value is ProbeReport {
  try {
    return isProbeReport(value) && value.site === expected.site &&
      new Set(expected.watchIds).size === expected.watchIds.length && value.entries.length === expected.watchIds.length &&
      value.entries.every(entry => expected.watchIds.includes(entry.id))
  } catch { return false }
}
const time = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

export function isBreakageSignal(value: unknown, vocabulary: DiagnosticVocabulary): value is BreakageSignal {
  try {
    return objectShape(value, {
      site: isSite, feature: v => v === null || isFeatureId(v), job: v => v === null || isJobId(v),
      route: v => v === null || isRouteId(v) && vocabulary.routes.includes(v), kind: isBreakageKind,
      watchId: v => v === null || isWatchId(v) && vocabulary.watchIds.includes(v),
      shape: v => v === null || isShapeOutline(v, vocabulary.schemaKeys),
      clientVersion: v => v === null || typeof v === "string" && /^[0-9]+(?:\.[0-9]+)+(?![\s\S])/.test(v),
      pageType: isDiagnosticPageType, count: v => time(v) && v > 0, firstSeen: time, lastSeen: time
    }) && typeof value.firstSeen === "number" && typeof value.lastSeen === "number" && value.firstSeen <= value.lastSeen &&
      (value.count !== 1 || value.firstSeen === value.lastSeen) &&
      (value.kind !== "missing" && value.kind !== "threw" || value.watchId !== null) &&
      (value.kind !== "unrecognised" || value.shape !== null)
  } catch { return false }
}
