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
 * Check now has the batch delivered at once, before its reads and after them, and counts the batches lost between (HEALTH-23).
 */
export function createSiteHealth(options: {
  readonly site: Site
  readonly page: Pick<PageLink, "onSignal" | "state">
  /** Settles once the background has the reports. */
  send(reports: readonly TabHealthReport[]): Promise<boolean>
  now(): number
  online(): boolean
  later(run: () => void, milliseconds: number): () => void
}): SiteHealth & { answered(job: JobId, complete?: boolean): void; settled(observation: WwwSettleObservation | MusicSettleObservation): void; deliver(): Promise<number | null>; dispose(): void } {
  let queue: TabHealthReport[] = [], lastSent = -Infinity, cancel: (() => void) | null = null, answeredAt = -Infinity, disposed = false, unmeasured = false
  let lost = 0
  const sending = new Set<Promise<void>>()
  const sent = new Map<string, JobId | null>(), batched = new Map<string, number>(), signalled = new Set<JobId>()
  // A batch the background didn't take was never sent, so each of its reports goes again when it recurs.
  function forget(reports: readonly TabHealthReport[]) {
    lost++
    for (const report of reports) {
      if (report.kind === "success") signalled.add(report.job)
      else if (report.kind === "measured") unmeasured = true
      else sent.delete(keyOf(report.signal))
    }
  }
  function send() {
    const reports = queue.splice(0, HEALTH_REPORTS)
    batched.clear(); lastSent = options.now()
    const pending: Promise<void> = options.send(reports).catch(() => false).then(taken => {
      sending.delete(pending)
      if (!taken) forget(reports)
    })
    sending.add(pending)
  }
  function flush() {
    cancel = null
    if (disposed || !queue.length) return
    send()
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
      // The background can clear this job through a YouTube fallback without the tab seeing a success.
      if (options.site === "music" && signal.job === "membership") return true
      if (sent.has(key)) return false
      if (sent.size < 200) sent.set(key, signal.job)
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
    answered(job, complete = true) {
      answeredAt = options.now()
      if (!complete) {
        signalled.add(job)
        return
      }
      if (!signalled.delete(job)) return
      for (const [key, sentJob] of sent) if (sentJob === job) sent.delete(key)
      push(options.site === "music" && job === "membership" ? { kind: "success", job, at: answeredAt } : { kind: "success", job })
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
    // Answers with the batches this page has lost so far. A check compares its own two answers, so one check's asks never hide another's loss.
    async deliver() {
      cancel?.(); cancel = null
      while (!disposed && queue.length) send()
      await Promise.all(sending)
      return disposed ? null : lost
    },
    dispose() {
      if (disposed) return
      disposed = true; cancel?.(); cancel = null; queue = []
      try { stop() } catch {}
    }
  }
}
