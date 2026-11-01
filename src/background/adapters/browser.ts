import type { browser } from "wxt/browser"
import type { Platform as KeyPlatform } from "../../shared/keys"
import type { Platform } from "../../shared/platform"

/** The native browser the composition root receives from the entrypoint (06 §6.4.5). */
export type NativeBrowser = typeof browser

export function keyPlatform(platform: Platform, navigatorPlatform: string): KeyPlatform {
  const os = /mac/i.test(navigatorPlatform) ? "macos" : /win/i.test(navigatorPlatform) ? "windows" : "linux"
  return { browser: platform.browser, os }
}

/** First run opens in a new tab (FT-40, ARC-MOD-34). */
export async function openFirstRun(native: Pick<NativeBrowser, "tabs" | "runtime">): Promise<"opened" | "not-opened"> {
  try {
    const tab = await native.tabs.create({ url: native.runtime.getURL("/onboarding.html") })
    return tab.id === undefined ? "not-opened" : "opened"
  } catch { return "not-opened" }
}

/** 1.x's IndexedDB cache, which the migration and Clear all remove (REL-MIG, DATA-49). */
export function deleteRetiredDatabase(name: string): Promise<"deleted" | "unconfirmed"> {
  return new Promise(resolve => {
    try {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve("deleted")
      request.onerror = () => resolve("unconfirmed")
      request.onblocked = () => resolve("unconfirmed")
    } catch { resolve("unconfirmed") }
  })
}

/** Removes the browser-menu entries if the optional permission put any there (ARC-MAN-20). */
export async function releaseBrowserMenu(native: Partial<Pick<NativeBrowser, "contextMenus">>): Promise<"released" | "unconfirmed"> {
  try {
    await native.contextMenus?.removeAll()
    return "released"
  } catch { return "unconfirmed" }
}
