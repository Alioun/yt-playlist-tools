import type { Site } from "../../shared/contracts/vocabulary"

type TabFacts = { readonly id?: number; readonly url?: string }
type Updated = (tabId: number, change: unknown, tab: TabFacts) => void
type Removed = (tabId: number) => void
export type SiteTabsPort = {
  query(filter: Record<never, never>): Promise<readonly TabFacts[]>
  readonly onUpdated: { addListener(listener: Updated): void; removeListener(listener: Updated): void }
  readonly onRemoved: { addListener(listener: Removed): void; removeListener(listener: Removed): void }
}
const prefixes = { www: "https://www.youtube.com/", music: "https://music.youtube.com/" } as const satisfies Record<Site, string>
const sites = Object.keys(prefixes) as Site[]

/**
 * Calls `left` when a tab stops showing the site it showed, because it went elsewhere or closed. The browser names a
 * tab's address only on a site the extension can read, so a tab that goes elsewhere is one whose address is gone. The
 * background listens to no tab event (ARC-MOD-39). Settings hears them only while it is open, which wakes no background.
 */
export function watchSiteTabs(tabs: SiteTabsPort, left: () => void): () => void {
  const shown = new Map<number, Site>()
  // Where each tab was in the first event heard before the open tabs were read. Unset once that read has answered.
  let early: Map<number, Site | undefined> | undefined = new Map()
  let watching = true
  const siteOf = (url: string | undefined) => sites.find(site => url?.startsWith(prefixes[site]))
  const place = (tabId: number, site: Site | undefined) => {
    const before = shown.get(tabId)
    if (site) shown.set(tabId, site)
    else shown.delete(tabId)
    if (before && before !== site) left()
  }
  const heard = (tabId: number, site: Site | undefined) => {
    if (early && !early.has(tabId)) early.set(tabId, site)
    place(tabId, site)
  }
  const updated: Updated = (tabId, _change, tab) => heard(tabId, siteOf(tab.url))
  const removed: Removed = tabId => heard(tabId, undefined)
  tabs.onUpdated.addListener(updated)
  tabs.onRemoved.addListener(removed)
  void tabs.query({}).then(
    open => {
      const first = early ?? new Map<number, Site | undefined>()
      early = undefined
      if (!watching) return
      for (const tab of open) {
        if (tab.id === undefined) continue
        const site = siteOf(tab.url)
        // An event heard first is newer than this answer. The tab has left if the answer shows a site that event didn't.
        if (!first.has(tab.id)) place(tab.id, site)
        else if (site && first.get(tab.id) !== site) left()
      }
    },
    () => {
      early = undefined
    }
  )
  return () => {
    watching = false
    tabs.onUpdated.removeListener(updated)
    tabs.onRemoved.removeListener(removed)
  }
}
