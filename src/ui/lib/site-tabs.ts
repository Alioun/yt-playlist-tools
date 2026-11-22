import type { Site } from "../../shared/contracts/vocabulary"

type TabFacts = { readonly id?: number; readonly url?: string }
type Updated = (tabId: number, change: unknown, tab: TabFacts) => void
export type SiteTabsPort = {
  query(filter: Record<never, never>): Promise<readonly TabFacts[]>
  readonly onUpdated: { addListener(listener: Updated): void; removeListener(listener: Updated): void }
}
const prefixes = { www: "https://www.youtube.com/", music: "https://music.youtube.com/" } as const satisfies Record<Site, string>
const sites = Object.keys(prefixes) as Site[]

/**
 * Calls `left` when a tab stops showing the site it showed. The browser names a tab's address only on a site the
 * extension can read, so a tab that goes elsewhere is one whose address is gone. The background listens to no tab
 * updates (ARC-MOD-39), and settings hears them only while it is open.
 */
export function watchSiteTabs(tabs: SiteTabsPort, left: () => void): () => void {
  const shown = new Map<number, Site>()
  let watching = true
  const place = (tabId: number, url: string | undefined) => {
    const site = sites.find(site => url?.startsWith(prefixes[site]))
    const before = shown.get(tabId)
    if (site) shown.set(tabId, site)
    else shown.delete(tabId)
    if (before && before !== site) left()
  }
  const updated: Updated = (tabId, _change, tab) => place(tabId, tab.url)
  tabs.onUpdated.addListener(updated)
  // Tabs that were open before this page started watching. An update that already placed a tab is newer than this answer.
  void tabs.query({}).then(
    open => {
      if (watching) for (const tab of open) if (tab.id !== undefined && !shown.has(tab.id)) place(tab.id, tab.url)
    },
    () => {}
  )
  return () => {
    watching = false
    tabs.onUpdated.removeListener(updated)
  }
}
