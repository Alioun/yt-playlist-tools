import type { PlayingSave, UiPlayingNow, UiPlayingSave } from "../../shared/contracts/ui-pages"
import type { UiRequester } from "../adapters/ui-requester"
import type { SessionRead } from "../store/session-memory"
import type { TabNativePort, Tabs } from "../tabs/ports"

/**
 * Playing now (UI-POP-17, YM-POP-1 to YM-POP-13, ARC-ACC-68): the focused window's active YouTube Music tab, else
 * the most recently used one, read with `nowPlaying`; its Save runs in that same tab, as that tab's account,
 * only while the tab still shows the account it was read with.
 */
export function createPlayingNow(deps: {
  readonly tabs: Pick<Tabs, "runIn">
  readonly native: Pick<TabNativePort, "get">
  readonly session: () => Promise<SessionRead>
  readonly consented: () => boolean
}) {
  async function pick(ui: UiRequester) {
    const read = await deps.session()
    if (read.kind !== "memory") return
    const rows = await Promise.all([...read.memory.tabs].filter(([, record]) => record.site === "music").map(async ([tabId, record]) => {
      const lookup = await deps.native.get(tabId)
      return lookup.kind === "tab" && lookup.tab.incognito === ui.requester.incognito ? { tabId, record, tab: lookup.tab } : undefined
    }))
    const live = rows.filter(row => row !== undefined)
    return live.find(row => row.tab.active && row.tab.windowId === ui.requester.windowId) ?? live.sort((a, b) => b.tab.lastAccessed - a.tab.lastAccessed)[0]
  }
  return {
    async now(ui: UiRequester): Promise<UiPlayingNow> {
      if (!deps.consented()) return { kind: "held" }
      const chosen = await pick(ui)
      if (!chosen) return { kind: "no-tab" }
      if (!chosen.record.signedIn) return { kind: "signed-out" }
      const acct = chosen.record.acct
      const outcome = await deps.tabs.runIn(chosen.tabId, { job: { kind: "nowPlaying" } }, { site: "music", req: ui.requester, account: { kind: "any" } })
      if (outcome.kind !== "result" || !outcome.result.ok) return { kind: "nothing" }
      return outcome.result.data ? { kind: "playing", tabId: chosen.tabId, acct, song: outcome.result.data } : { kind: "nothing" }
    },
    async save(ui: UiRequester, save: PlayingSave): Promise<UiPlayingSave> {
      if (!deps.consented()) return { kind: "failed" }
      const read = await deps.session()
      const record = read.kind === "memory" ? read.memory.tabs.get(save.tabId) : undefined
      if (!record) return { kind: "no-tab" }
      if (record.site !== "music" || !record.signedIn || record.acct !== save.acct) return { kind: "account-changed" }
      const outcome = await deps.tabs.runIn(save.tabId, { job: { kind: "save", playlistId: save.playlistId, videoId: save.videoId }, acct: save.acct },
        { site: "music", req: ui.requester, account: { kind: "account", acct: save.acct, signedIn: true } })
      if (outcome.kind === "no-tab") return { kind: "no-tab" }
      if (outcome.kind === "guard" && outcome.reason === "accountChanged") return { kind: "account-changed" }
      return outcome.kind === "result" && outcome.result.ok ? { kind: "saved", setVideoId: outcome.result.data.setVideoId } : { kind: "failed" }
    }
  }
}
