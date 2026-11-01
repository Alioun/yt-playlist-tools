import { createSiteI18n, type MessageCatalogue } from "../../shared/i18n"
import type { Platform } from "../../shared/keys"
import { platform as build } from "../../shared/platform"
import type { Deadline } from "../../shared/rpc/rpc"
import { followTheme } from "../lib/theme"
import { createBrowserBackend, createBrowserI18n, type BrowserBackendPort, type BrowserLocalizationPort } from "../backend/browser"

export type ExtensionPagePort = BrowserBackendPort & BrowserLocalizationPort & {
  readonly runtime: BrowserBackendPort["runtime"] & { openOptionsPage(): Promise<void>; getURL(path: string): string }
  readonly tabs: { create(properties: { url: string }): Promise<unknown> }
}

const timerDeadline: Deadline = (ms, expire) => {
  const timer = setTimeout(expire, ms)
  return () => clearTimeout(timer)
}
// Unreleased 1.x builds left these in the extension's own localStorage; a worker can't reach it (REL-MIG-10).
const retiredLocalStorage = ["cachedVideos", "playlists", "preventDuplicates"]

/**
 * What every extension page starts from: the backend, its text and how to open the other pages. Only a page
 * that shows canonical English text (the disclosure) passes the catalogue; the others read the browser's own.
 */
export function startExtensionPage(native: ExtensionPagePort, navigatorPlatform: string, catalogue?: MessageCatalogue) {
  try { for (const key of retiredLocalStorage) localStorage.removeItem(key) } catch {}
  followTheme(document.documentElement, "system", matchMedia("(prefers-color-scheme: dark)"))
  const platform: Platform = { browser: build.browser, os: /mac/i.test(navigatorPlatform) ? "macos" : /win/i.test(navigatorPlatform) ? "windows" : "linux" }
  const backend = createBrowserBackend(native, { build: build.build, deadline: timerDeadline, browser: build.browser })
  const getMessage = native.i18n.getMessage
  if (typeof getMessage !== "function") throw new TypeError("Native localization getMessage is unavailable")
  const i18n = catalogue ? createBrowserI18n(native, catalogue)
    : createSiteI18n({ getMessage: (name, substitutions) => String(Reflect.apply(getMessage, native.i18n, [name, substitutions]) ?? "") })
  return {
    backend, i18n, platform,
    openSettings: () => { void native.runtime.openOptionsPage() },
    openFirstRun: () => { void native.tabs.create({ url: native.runtime.getURL("/onboarding.html") }) }
  }
}
export type ExtensionPage = ReturnType<typeof startExtensionPage>
