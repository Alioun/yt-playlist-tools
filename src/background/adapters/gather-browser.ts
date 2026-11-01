import { isTabId } from "../tabs/records"
import type { GatherNativePort, GatherTab } from "../tabs/ports"

type BrowserTab = import("wxt/browser").Browser.tabs.Tab
// The browser calls Gather needs, and nothing that reaches into a tab: no sendMessage, executeScript, update or reload.
export type GatherBrowser = {
  readonly tabs: {
    query(query: { windowId: number; url: string[] }): Promise<BrowserTab[]>
    get(tabId: number): Promise<BrowserTab>
    create(props: { windowId: number; url: string; active: boolean; index?: number; discarded?: boolean; title?: string }): Promise<BrowserTab>
    remove(tabIds: number[]): Promise<void>
  }
  readonly windows: {
    get(windowId: number): Promise<unknown>
    create(props: { url: string[]; focused: false }): Promise<{ tabs?: BrowserTab[] }>
  }
}

// Absence is only the browser's own "no such ID" answer: Chrome's "No tab with id: 5." and Firefox's "Invalid tab ID: 5".
// Any other failure says nothing about whether the tab or window still exists.
const missing = (error: unknown, what: "tab" | "window") =>
  error instanceof Error && new RegExp(`^(No ${what} with id|Invalid ${what} ID):`, "i").test(error.message)

function parse(tab: BrowserTab): GatherTab | undefined {
  if (!isTabId(tab.id) || !isTabId(tab.windowId) || typeof tab.url !== "string" || typeof tab.index !== "number" || tab.index < 0 ||
    typeof tab.incognito !== "boolean") return
  const lastAccessed = typeof tab.lastAccessed === "number" && Number.isFinite(tab.lastAccessed) && tab.lastAccessed >= 0 ? tab.lastAccessed : 0
  return { tabId: tab.id, windowId: tab.windowId, index: tab.index, url: tab.url, title: typeof tab.title === "string" ? tab.title : "", lastAccessed, incognito: tab.incognito }
}

// Firefox can open reopened tabs unloaded; Chrome has no such option. Passing the old title with it is still open (ARC-ACC-76, G7).
export function createGatherBrowser(browser: GatherBrowser, options: { readonly unloadedReopen: boolean }): GatherNativePort {
  return {
    async queryVideos(windowId, patterns) {
      try {
        const found = await browser.tabs.query({ windowId, url: [...patterns] })
        return { kind: "tabs", tabs: found.flatMap(tab => parse(tab) ?? []) }
      } catch { return { kind: "unavailable" } }
    },
    async read(tabId) {
      let tab: BrowserTab
      try { tab = await browser.tabs.get(tabId) } catch (error) { return { kind: missing(error, "tab") ? "gone" : "unavailable" } }
      const parsed = parse(tab)
      return parsed ? { kind: "tab", tab: parsed, status: tab.status === "complete" ? "complete" : "loading" } : { kind: "unavailable" }
    },
    async create(props, reopened) {
      try { await browser.windows.get(props.windowId) } catch (error) { return { kind: missing(error, "window") ? "window-gone" : "unavailable" } }
      const base = { windowId: props.windowId, url: props.url, active: props.active, ...props.index === undefined ? {} : { index: props.index } }
      const made = (tab: BrowserTab) => isTabId(tab.id) ? { kind: "created" as const, tabId: tab.id } : { kind: "unavailable" as const }
      // Firefox takes both `discarded` and `title`. If it refuses the unloaded tab, the same tab opens loaded instead.
      if (reopened && !props.active && options.unloadedReopen) {
        try { return made(await browser.tabs.create({ ...base, discarded: true, title: reopened.title })) } catch {}
      }
      try { return made(await browser.tabs.create(base)) } catch { return { kind: "unavailable" } }
    },
    async createWindow(urls) {
      try {
        const made = await browser.windows.create({ url: [...urls], focused: false })
        return { kind: "created", tabIds: (made.tabs ?? []).flatMap(tab => isTabId(tab.id) ? [tab.id] : []) }
      } catch { return { kind: "unavailable" } }
    },
    async remove(tabIds) {
      try { await browser.tabs.remove([...tabIds]); return { kind: "removed" } } catch { return { kind: "unavailable" } }
    }
  }
}
