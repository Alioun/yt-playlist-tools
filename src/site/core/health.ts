import { isDiagnosticPageType, type BreakageSignal, type DiagnosticPageType } from "../../shared/contracts/diagnostics"
import { HEALTH_REPORTS, type TabHealthReport } from "../../shared/contracts/tab-health"
import type { FeatureId, JobId, Site } from "../../shared/contracts/vocabulary"
import type { WwwSettleObservation } from "./items-www"
import type { MusicSettleObservation } from "./items-music"
import type { PageLink } from "./page-link"

export const HEALTH_SEND_MS = 5_000
const ANSWERED_MS = 60_000
// Timeouts and no-effects count in a row, so a batch keeps up to their threshold of each instead of one.
const repeats: Partial<Record<BreakageSignal["kind"], number>> = { timeout: 3, "no-effect": 2, "cannot-measure": 3 }

/** What a page's own features tell the Monitor besides the gateway's signals (HEALTH-01, HEALTH-11). */
export type SiteHealth = {
  /** A feature's key pointed at something that looks like an item, but none was recognised. */
  itemUnrecognised(feature: FeatureId): void
  /** Auto-add couldn't measure this playback, or could measure the next one. */
  cantMeasure(): void
  measured(): void
  /** YouTube Music's player bar shows a song but drew no like for the player-bar Save to sit beside (YM-FAIL-8). */
  playerBarMissing(): void
}

/**
 * The tab's half of the Monitor's transport (HEALTH-28): signals wait in a batch sent at most every 5 s, a signal
 * already sent this page goes again only once its job has succeeded since, and a success goes only for a job with a signal.
 */
export function createSiteHealth(options: {
  readonly site: Site
  readonly page: Pick<PageLink, "onSignal" | "state">
  send(reports: readonly TabHealthReport[]): void
  now(): number
  online(): boolean
  later(run: () => void, milliseconds: number): () => void
}): SiteHealth & { succeeded(job: JobId): void; settled(observation: WwwSettleObservation | MusicSettleObservation): void; dispose(): void } {
  let queue: TabHealthReport[] = [], lastSent = -Infinity, cancel: (() => void) | null = null, answeredAt = -Infinity, disposed = false, unmeasured = false
  const sent = new Set<string>(), batched = new Map<string, number>(), signalled = new Set<JobId>()
  function flush() {
    cancel = null
    if (disposed || !queue.length) return
    const reports = queue.splice(0, HEALTH_REPORTS)
    batched.clear(); lastSent = options.now()
    try { options.send(reports) } catch {}
    if (queue.length) schedule()
  }
  function schedule() {
    if (cancel || disposed) return
    cancel = options.later(flush, Math.max(0, lastSent + HEALTH_SEND_MS - options.now()))
  }
  function push(report: TabHealthReport) {
    if (disposed || queue.length >= HEALTH_REPORTS * 4) return
    queue.push(report); schedule()
  }
  const keyOf = (signal: BreakageSignal) => JSON.stringify([signal.feature, signal.job, signal.route, signal.kind, signal.watchId, signal.pageType])
  function admit(signal: BreakageSignal): boolean {
    const key = keyOf(signal), limit = repeats[signal.kind]
    if (limit === undefined) {
      if (sent.has(key)) return false
      if (sent.size < 200) sent.add(key)
      return true
    }
    const count = batched.get(key) ?? 0
    if (count >= limit) return false
    batched.set(key, count + 1)
    return true
  }
  function pageType(): DiagnosticPageType {
    const state = options.page.state
    const type = state.kind === "ready" ? state.snapshot.pageType : undefined
    return isDiagnosticPageType(type) ? type : "other"
  }
  function own(kind: BreakageSignal["kind"], feature: FeatureId | null): BreakageSignal {
    const at = Math.max(0, Math.floor(options.now()))
    return { site: options.site, feature, job: null, route: null, kind, watchId: null, shape: null, clientVersion: null, pageType: pageType(), count: 1, firstSeen: at, lastSeen: at }
  }
  const stop = options.page.onSignal(signal => {
    if (!admit(signal)) return
    if (signal.job === null) { push({ kind: "signal", signal, evidence: "diagnostic" }); return }
    signalled.add(signal.job)
    push({ kind: "signal", signal, evidence: "job", online: options.online(), answered: options.now() - answeredAt < ANSWERED_MS })
  })
  return {
    succeeded(job) {
      answeredAt = options.now()
      if (!signalled.delete(job)) return
      for (const key of [...sent]) if ((JSON.parse(key) as unknown[])[1] === job) sent.delete(key)
      push({ kind: "success", job })
    },
    itemUnrecognised(feature) {
      const signal = own("item-unrecognised", feature)
      if (admit(signal)) push({ kind: "signal", signal, evidence: "diagnostic" })
    },
    cantMeasure() {
      const signal = own("cannot-measure", "auto-add")
      unmeasured = true
      if (admit(signal)) push({ kind: "signal", signal, evidence: "playback" })
    },
    playerBarMissing() {
      const signal = own("anchor-missing", "music-actions")
      if (!admit(signal)) return
      push({ kind: "anchor", anchor: "music-player-bar", signal, observation: { kind: "player-bar", requiredHere: true, visible: true, settledMs: 3_000, present: false } })
    },
    // Only a page that couldn't measure a playback has anything for a measurable one to clear.
    measured() { if (unmeasured) { unmeasured = false; push({ kind: "measured" }) } },
    // HEALTH-02: only a visible, settled page with enough links and too few recognised reports its cards missing.
    settled(observation) {
      if (!observation.anchorMissing || !observation.visible) return
      const signal = own("anchor-missing", null)
      if (!admit(signal)) return
      push({ kind: "anchor", anchor: observation.anchor, signal, observation: { relevant: observation.relevant, visible: observation.visible,
        settledMs: observation.delayMs, distinctMainLinks: observation.distinctMainLinks, recognised: observation.recognised } })
    },
    dispose() {
      if (disposed) return
      disposed = true; cancel?.(); cancel = null; queue = []
      try { stop() } catch {}
    }
  }
}
