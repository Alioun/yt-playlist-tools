import { isRecentEntry, type DeviceSettingAnswer, type DeviceSettingChange, type PageMessages, type RecentEntry, type UiFeatureHealth, type UiTabFacts } from "../../shared/contracts/ui-pages"
import type { UiUnavailable } from "../../shared/contracts/ui-playlists"
import type { AccountKey } from "../../shared/model/validation"
import type { RpcHandlers } from "../../shared/rpc/rpc"
import type { UiRequester } from "../adapters/ui-requester"
import type { SessionChange, SessionRead, SessionWrite } from "../store/session-memory"

type UiOrigin = { readonly kind: "ui"; readonly windowId: number; readonly incognito: boolean }
export type PageStatusSource = (ui: UiRequester) => Promise<{ readonly tab: UiTabFacts; readonly health: readonly UiFeatureHealth[] } | undefined>
export type PageReceiverPorts = {
  readonly owner: {
    readSession(): Promise<SessionRead>
    changeSession(change: SessionChange): Promise<SessionWrite>
    changeDeviceSetting(origin: UiOrigin, change: DeviceSettingChange): Promise<DeviceSettingAnswer>
  }
  /** Raw `storage.session` reads, for the recent adds the session planner keeps but doesn't decode. */
  readonly session: { get(key: "recentAdds"): Promise<unknown> }
  readonly status: PageStatusSource
  readonly now: () => number
}
export type PageContext = { readonly ui: UiRequester; readonly current: () => Promise<UiRequester | undefined> }
const unavailable = (reason: UiUnavailable["reason"]): UiUnavailable => ({ kind: "unavailable", reason })

function recentEntry(raw: unknown, acct: AccountKey): RecentEntry | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return
  const row = raw as Record<string, unknown>
  if (row.acct !== acct) return
  const videos = row.kind === "gather" ? row.videos : row.kind === "single" ? [row.video] : undefined
  const entry = { at: row.at, source: row.source, playlists: row.playlists, videos, gather: row.kind === "gather" }
  return isRecentEntry(entry) ? structuredClone(entry) : undefined
}

/** The page routes the popup and settings need besides the store's own changes (06 §6.8.3). */
export function createPageReceiver(ports: PageReceiverPorts): RpcHandlers<PageMessages, PageContext> {
  async function changeSession(edit: SessionChange["edits"][0]): Promise<SessionWrite | undefined> {
    const read = await ports.owner.readSession()
    if (read.kind !== "memory") return
    return ports.owner.changeSession({ revision: read.revision, now: ports.now(), edits: [edit] })
  }
  return {
    async "ui.status"(_payload, context) {
      const [read, facts] = await Promise.all([ports.owner.readSession(), ports.status(context.ui)])
      if (read.kind !== "memory" || !facts) return unavailable("owner")
      return await context.current() ? { kind: "status", paused: read.memory.paused, tab: facts.tab, health: facts.health } : unavailable("operation")
    },
    async "ui.pause"(payload, context) {
      if (context.ui.requester.incognito) return { kind: "refused", reason: "unavailable" }
      const write = await changeSession({ kind: "pause", paused: payload.paused })
      if (!write || write.kind === "unavailable") return { kind: "refused", reason: "unavailable" }
      if (write.kind !== "committed") return { kind: "refused", reason: "unconfirmed" }
      return { kind: "paused", paused: write.memory.paused }
    },
    async "ui.recentAdds"(payload, context) {
      let raw: unknown
      try { raw = await ports.session.get("recentAdds") } catch { return unavailable("owner") }
      const rows = Array.isArray(raw) ? raw : []
      const entries = rows.flatMap(row => recentEntry(row, payload.acct) ?? []).slice(0, 50)
      return await context.current() ? { kind: "recent", entries } : unavailable("operation")
    },
    async "ui.device"(payload, context) {
      const origin = context.ui.ui.origin
      const answer = await ports.owner.changeDeviceSetting(origin, payload.change)
      if (answer.kind === "confirmed" && answer.change.field === "recentAdds" && answer.change.value === false) await changeSession({ kind: "recent-adds-clear" })
      return answer
    }
  }
}
