import { authenticateTab, type TabContext } from "../adapters/runtime"
import type { SenderOriginPorts, NativeSender } from "../adapters/sender-origin"
import type { ProgressOwner } from "../store/progress"
import type { SessionChange, SessionRead, SessionWrite } from "../store/session-memory"
import type { ViewTarget } from "../tabs/ports"
import type { KnownTab } from "../tabs/tabs"
import type { BuildId } from "../../shared/contracts"
import { tabAddMessages, type TabAddMessages } from "../../shared/contracts/tab-add"
import type { AccountKey } from "../../shared/model"
import { createRpc, type Deadline } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"

type AutoAddRoutes = Pick<TabAddMessages, "tab.progress.load" | "tab.progress.save" | "tab.cantMeasure">
export const CANT_MEASURE_SHOWN = "auto-add:cant-measure"

/**
 * Auto-add's tab routes besides `tab.add`: progress at DATA-27's checkpoints and the once-per-session can't-measure
 * toast. Each answers only for the account the tab registry holds for the sending tab (ARC-ACC-49).
 */
export function createAutoAddTabRouter(deps: {
  readonly transport: Transport<NativeSender>
  readonly senders: SenderOriginPorts
  readonly build: BuildId
  readonly deadline: Deadline
  readonly tabs: { known(target: ViewTarget): Promise<readonly Pick<KnownTab, "acct" | "privateTab">[]> }
  readonly owner: ProgressOwner & { readSession(): Promise<SessionRead>; changeSession(change: SessionChange): Promise<SessionWrite> }
  /** Clears the tab's toolbar tick (ARC-MOD-38). */
  readonly untick?: (tabId: number) => void
  now(): number
}): { dispose(): void } {
  const all = tabAddMessages()
  const contract = { "tab.progress.load": all["tab.progress.load"], "tab.progress.save": all["tab.progress.save"], "tab.cantMeasure": all["tab.cantMeasure"] }
  const rpc = createRpc<AutoAddRoutes, NativeSender>(deps.transport, { build: deps.build, deadline: deps.deadline, contract })
  async function registered(context: TabContext, acct: AccountKey): Promise<boolean> {
    const [known] = await deps.tabs.known({ kind: "tab", tabId: context.origin.tabId })
    return known !== undefined && known.acct === acct && known.privateTab === context.origin.incognito
  }
  const unbind = rpc.handle({ authenticate: authenticateTab(deps.senders), handlers: {
    async "tab.progress.load"(request, context) {
      if (context.origin.incognito || !await registered(context, request.acct)) return null
      const read = await deps.owner.loadProgress({ acct: request.acct, video: request.video, private: false })
      return read.kind === "progress" && read.progress ? { len: read.progress.len, parts: read.progress.parts } : null
    },
    async "tab.progress.save"(request, context) {
      if (context.origin.incognito || !await registered(context, request.acct)) return null
      await deps.owner.saveProgress({ acct: request.acct, video: request.video, private: false, len: request.len, parts: request.parts })
      return null
    },
    async "tab.cantMeasure"(request, context) {
      if (!await registered(context, request.acct)) return { show: false }
      if (context.origin.incognito) return { show: true }
      const read = await deps.owner.readSession()
      if (read.kind !== "memory") return { show: true }
      if (read.memory.shown.global.has(CANT_MEASURE_SHOWN)) return { show: false }
      await deps.owner.changeSession({ revision: read.revision, now: deps.now(),
        edits: [{ kind: "shown-global", acct: request.acct, scope: "normal", keys: [CANT_MEASURE_SHOWN] }] })
      return { show: true }
    },
    async "tab.videoChanged"({ acct }, context) {
      if (acct !== null && await registered(context, acct)) deps.untick?.(context.origin.tabId)
      return null
    }
  } })
  return { dispose() { unbind(); rpc.dispose() } }
}
