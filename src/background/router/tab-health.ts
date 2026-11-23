import { authenticateTab, type TabContext as SenderContext } from "../adapters/runtime"
import type { NativeSender, SenderOriginPorts } from "../adapters/sender-origin"
import type { Monitor } from "../monitor/monitor"
import { isMonitorInstance } from "../store/monitor-session"
import { anchors } from "../../shared/features/registry"
import { isPageFeatureId, type TabFeature } from "../../shared/contracts/tab-view"
import type { TabContext } from "../tabs/ports"
import type { BuildId } from "../../shared/contracts"
import { tabHealthContract, type TabHealthMessages, type TabHealthReport } from "../../shared/contracts/tab-health"
import type { AccountKey } from "../../shared/model"
import { createRpc, type Deadline } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"

/**
 * The Monitor's transport from a tab (HEALTH-01, HEALTH-28): each report goes to the Monitor as that tab, which checks
 * every signal against the diagnostics vocabulary. A tab whose registry account differs from the report's is ignored.
 * It also carries the not-working notice: a feature about to act, the tab's claim on the due notice, and its showing (YT-BRK-02).
 */
export function createTabHealthRouter(deps: {
  readonly transport: Transport<NativeSender>
  readonly senders: SenderOriginPorts
  readonly build: BuildId
  readonly deadline: Deadline
  /** The tab's Monitor context while the registry holds it for `acct` in the sender's window kind. */
  context(sender: SenderContext, acct: AccountKey | null): Promise<TabContext | null>
  /** The page features switched on for the tab's site, which the Monitor reads statuses for. */
  enabled(context: TabContext): Promise<readonly TabFeature[] | undefined>
  readonly monitor: Pick<Monitor, "signal" | "observeAnchor" | "succeeded" | "measured" | "wouldAct" | "statusProducer" | "claimNotice" | "acknowledgeNotice" | "releaseNotice">
}): { dispose(): void } {
  const rpc = createRpc<TabHealthMessages, NativeSender>(deps.transport, { build: deps.build, deadline: deps.deadline, contract: tabHealthContract })
  async function apply(context: TabContext, report: TabHealthReport) {
    switch (report.kind) {
      case "signal":
        return deps.monitor.signal(context, report.signal, report.evidence === "job" ? { kind: "job", online: report.online, otherRequestsAnswer: report.answered } : { kind: report.evidence })
      case "anchor": {
        if (!Object.hasOwn(anchors, report.anchor)) return
        const seen = report.observation
        return deps.monitor.observeAnchor(context, {
          anchor: report.anchor,
          signal: report.signal,
          observation:
            "kind" in seen
              ? { kind: "player-bar", requiredHere: seen.requiredHere, visible: seen.visible, navigationAt: 0, observedAt: seen.settledMs, present: seen.present }
              : { kind: "content", relevant: seen.relevant, visible: seen.visible, navigationAt: 0, observedAt: seen.settledMs, distinctMainLinks: seen.distinctMainLinks, recognised: seen.recognised }
        })
      }
      case "success":
        return deps.monitor.succeeded(context, report.job, report.at)
      case "measured":
        return deps.monitor.measured(context)
    }
  }
  const unbind = rpc.handle({
    authenticate: authenticateTab(deps.senders),
    handlers: {
      async "tab.health"({ acct, request }, sender) {
        const context = await deps.context(sender, acct)
        if (!context) return false
        let delivered = true
        for (const report of request.reports) {
          const result = await apply(context, report).catch(() => undefined)
          if (result?.kind !== "accepted") delivered = false
        }
        return delivered
      },
      async "tab.wouldAct"({ acct, request }, sender) {
        const context = await deps.context(sender, acct)
        const enabled = context && (await deps.enabled(context))
        if (context && enabled) await deps.monitor.wouldAct(context, enabled, request.feature)
        return null
      },
      async "tab.claimNotice"({ acct }, sender) {
        const context = await deps.context(sender, acct)
        const enabled = context && (await deps.enabled(context))
        if (!context || !enabled) return null
        const statuses = await deps.monitor.statusProducer.read(context, enabled)
        if (statuses.kind !== "statuses") return null
        const claim = await deps.monitor.claimNotice(context, statuses)
        const [first, ...rest] = claim.kind === "delivery" ? claim.features.filter(isPageFeatureId) : []
        return claim.kind === "delivery" && first ? { token: `${claim.token.instance}:${claim.token.sequence}`, due: { kind: "not-working", features: [first, ...rest] } } : null
      },
      async "tab.noticeShown"({ acct, request }, sender) {
        const context = await deps.context(sender, acct)
        const [instance, sequence] = request.token.split(":")
        if (context && isMonitorInstance(instance)) await deps.monitor.acknowledgeNotice(context, { instance, sequence: Number(sequence) })
        return null
      },
      async "tab.noticeReleased"({ acct, request }, sender) {
        const context = await deps.context(sender, acct)
        const [instance, sequence] = request.token.split(":")
        if (context && isMonitorInstance(instance)) await deps.monitor.releaseNotice(context, { instance, sequence: Number(sequence) })
        return null
      }
    }
  })
  return {
    dispose() {
      unbind()
      rpc.dispose()
    }
  }
}
