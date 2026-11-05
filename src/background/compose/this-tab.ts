import type { NativeBrowser } from "../adapters/browser"
import type { AddFlow } from "../add-flow/add-flow"
import type { Registrar } from "../registrar/ports"
import type { Requester, Tabs } from "../tabs/ports"
import type { JobOf } from "../../shared/contracts"
import type { TabAskMessages } from "../../shared/contracts/tab-actions"
import type { ThisTab, ThisTabAsk, ThisVideoSkip, ThisVideoSkipAnswer } from "../../shared/contracts/this-video"
import { siteBundles } from "../../shared/features/registration"

type Ask = <K extends keyof TabAskMessages>(tabId: number, kind: K, payload: TabAskMessages[K]["payload"]) => Promise<{ readonly kind: string; readonly result?: unknown }>

/**
 * The popup's This video (UI-POP-12, 06 §6.8.3 `ui.thisTab`): the active tab of the popup's window, when it's a
 * YouTube page, as that tab's own account (UI-POP-08). Auto-add answers through `bg.query`; with no playback it
 * follows, the page's own video shows untracked. It reads nothing before consent (UI-POP-26).
 */
export function composeThisTab(deps: {
  readonly native: Pick<NativeBrowser, "tabs">
  readonly tabs: Pick<Tabs, "known" | "runIn">
  readonly registrar: Pick<Registrar, "ensure">
  readonly flow: Pick<AddFlow, "skip">
  readonly ask: Ask
  readonly consented: () => boolean
}) {
  async function youtubeTab(req: Requester, tabId: number | null) {
    if (tabId === null) return null
    const tab = await deps.native.tabs.get(tabId).catch(() => null)
    if (!tab?.url?.startsWith(siteBundles.www.match.replace("*", "")) || tab.incognito !== req.incognito) return null
    const [known] = await deps.tabs.known({ kind: "tab", tabId })
    return known && known.acct !== null && known.privateTab === req.incognito ? { tabId, acct: known.acct } : null
  }
  async function thisTab(req: Requester, ask: ThisTabAsk = {}): Promise<ThisTab> {
    if (!deps.consented()) return { kind: "unavailable" }
    const found = await youtubeTab(req, req.activeTabId)
    if (!found) return { kind: "none" }
    const asked = await deps.ask(found.tabId, "bg.query", ask.channel === false ? { name: "auto-add", channel: false } : { name: "auto-add" }).catch(() => null)
    if (asked?.kind === "answered" && asked.result) return { kind: "video", ...found, video: asked.result as Extract<ThisTab, { kind: "video" }>["video"] }
    try {
      await deps.registrar.ensure(found.tabId, { core: true })
    } catch {
      return { kind: "none" }
    }
    const info = await deps.tabs.runIn<JobOf<"videoInfo">>(found.tabId, { job: { kind: "videoInfo" } }, { site: "www", req, account: { kind: "account", acct: found.acct, signedIn: true } })
    if (info.kind !== "result" || !info.result.ok) return { kind: "none" }
    return { kind: "video", ...found, video: { video: info.result.data.videoId, title: info.result.data.title ?? null, state: { kind: "not-tracked" }, watched: null, playlists: [], channel: null } }
  }
  // Don't auto-add this video, and its Undo, which checks the goal at once (UI-POP-14, R23). A changed account refuses.
  async function skip(req: Requester, request: ThisVideoSkip): Promise<ThisVideoSkipAnswer> {
    if (!deps.consented()) return { kind: "refused", reason: "unavailable" }
    const found = await youtubeTab(req, request.tabId)
    if (!found) return { kind: "refused", reason: "unavailable" }
    if (found.acct !== request.acct) return { kind: "refused", reason: "account-changed" }
    const origin = { kind: "tab", tabId: request.tabId, incognito: req.incognito } as const
    const report = await deps.flow.skip(
      request.skip ? { kind: "skip", acct: request.acct, video: request.video, playlists: "all" } : { kind: "unskip", acct: request.acct, video: request.video },
      origin
    )
    return report.kind === "remembered" ? { kind: request.skip ? "skipped" : "unskipped" } : { kind: "refused", reason: "unavailable" }
  }
  return { thisTab, skip }
}
