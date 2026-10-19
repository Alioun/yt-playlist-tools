// What a 2.0 module could look like: WXT's APIs imported from their real
// paths (which `#imports` expands to anyway), no auto-imports, no
// import.meta.env. Nothing here needs a resolver plugin under `bun test`.
import { browser } from "wxt/browser"
import { storage } from "wxt/utils/storage"

export const shortcutPlaylist = storage.defineItem<string | null>("sync:shortcutPlaylist", {
  fallback: null
})

/** The URL of the active tab, if it is a YouTube watch page. */
export async function activeWatchUrl(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return tab?.url?.startsWith("https://www.youtube.com/watch") ? tab.url : null
}
