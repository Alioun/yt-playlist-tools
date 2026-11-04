import { isTabView, type TabView } from "../../shared/contracts/tab-view"
import type { TabPing } from "../../shared/contracts/tabs"
import type { TabNativePort } from "./ports"

const PING_MS = 2_000
const VIEW_MS = 2_000

/** A view with nothing on for the account the tab's core reports, which its host answers by disposing every feature's scope. */
export function emptyTabView(info: TabPing, incognito: boolean): TabView {
  const common = { build: info.build, private: incognito, undoKey: null, pickerSortAZ: false, paused: false, statuses: [], notices: [] } as const
  const site = info.site === "www" ? ({ site: "www", features: [] } as const) : ({ site: "music", features: [] } as const)
  if (!info.signedIn) return { ...common, ...site, signedIn: false, acct: null, setup: null, filters: [], skips: null }
  const account = { signedIn: true, acct: info.acct, setup: { kind: "none" }, filters: [] } as const
  return incognito
    ? { ...common, ...site, ...account, private: true, skips: { kind: "private", entries: [] } }
    : { ...common, ...site, ...account, private: false, skips: { kind: "normal", entries: [] } }
}

/**
 * Withdrawal and Clear all end the features in every open YouTube tab (FT-35, DATA-39) the way switching the last one off
 * does (ARC-MAN-14): each site core that answers its ping gets a view with nothing on. A tab where no core listens has
 * nothing running. A core that answers late, or a view it doesn't take, leaves the teardown unconfirmed.
 */
export async function tearDownOpenTabs(port: Pick<TabNativePort, "query" | "ping" | "view">): Promise<"torn-down" | "unconfirmed"> {
  const listed = await port.query("all")
  if (listed.kind !== "tabs") return "unconfirmed"
  const signal = new AbortController().signal
  const confirmed = await Promise.all(
    listed.tabs
      .filter(tab => tab.site !== null && !tab.discarded)
      .map(async tab => {
        const ping = await port.ping(tab.tabId, PING_MS, signal)
        if (ping.kind === "gone" || (ping.kind === "failed" && ping.failure === "transport")) return true
        if (ping.kind !== "answered") return false
        const sent = await port.view(tab.tabId, emptyTabView(ping.result, tab.incognito), isTabView, VIEW_MS, signal)
        return sent.kind === "answered" || sent.kind === "gone"
      })
  )
  return confirmed.every(Boolean) ? "torn-down" : "unconfirmed"
}
