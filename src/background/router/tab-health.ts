import { authenticateTab, type TabContext as SenderContext } from "../adapters/runtime"
import type { NativeSender, SenderOriginPorts } from "../adapters/sender-origin"
import type { Monitor } from "../monitor/monitor"
import { anchors } from "../../shared/features/registry"
import type { TabContext } from "../tabs/ports"
import type { BuildId } from "../../shared/contracts"
import { tabHealthContract, type TabHealthMessages, type TabHealthReport } from "../../shared/contracts/tab-health"
import type { AccountKey } from "../../shared/model"
import { createRpc, type Deadline } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"

/**
 * The Monitor's transport from a tab (HEALTH-01, HEALTH-28): each report goes to the Monitor as that tab, which checks
 * every signal against the diagnostics vocabulary. A tab whose registry account differs from the report's is ignored.
 */
export function createTabHealthRouter(deps: {
  readonly transport: Transport<NativeSender>
  readonly senders: SenderOriginPorts
  readonly build: BuildId
  readonly deadline: Deadline
  /** The tab's Monitor context while the registry holds it for `acct` in the sender's window kind. */
  context(sender: SenderContext, acct: AccountKey | null): Promise<TabContext | null>
  readonly monitor: Pick<Monitor, "signal" | "observeAnchor" | "succeeded" | "measured">
}): { dispose(): void } {
  const rpc = createRpc<TabHealthMessages, NativeSender>(deps.transport, { build: deps.build, deadline: deps.deadline, contract: tabHealthContract })
  async function apply(context: TabContext, report: TabHealthReport): Promise<void> {
    switch (report.kind) {
      case "signal":
        await deps.monitor.signal(context, report.signal, report.evidence === "job" ? { kind: "job", online: report.online, otherRequestsAnswer: report.answered } : { kind: report.evidence })
        return
      case "anchor": {
        if (!Object.hasOwn(anchors, report.anchor)) return
        const seen = report.observation
        await deps.monitor.observeAnchor(context, {
          anchor: report.anchor,
          signal: report.signal,
          observation:
            "kind" in seen
              ? { kind: "player-bar", requiredHere: seen.requiredHere, visible: seen.visible, navigationAt: 0, observedAt: seen.settledMs, present: seen.present }
              : { kind: "content", relevant: seen.relevant, visible: seen.visible, navigationAt: 0, observedAt: seen.settledMs, distinctMainLinks: seen.distinctMainLinks, recognised: seen.recognised }
        })
        return
      }
      case "success":
        await deps.monitor.succeeded(context, report.job)
        return
      case "measured":
        await deps.monitor.measured(context)
    }
  }
  const unbind = rpc.handle({
    authenticate: authenticateTab(deps.senders),
    handlers: {
      async "tab.health"({ acct, request }, sender) {
        const context = await deps.context(sender, acct)
        if (!context) return null
        for (const report of request.reports) {
          try {
            await apply(context, report)
          } catch {}
        }
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
