import { createSiteI18n, type MessageCatalogue } from "../../shared/i18n"
import type { Platform } from "../../shared/keys"
import { platform as build } from "../../shared/platform"
import type { Deadline } from "../../shared/rpc/rpc"
import { followTheme } from "../lib/theme"
import { createBrowserBackend, createBrowserI18n, type BrowserBackendPort, type BrowserLocalizationPort } from "../backend/browser"
import { createCommandKeys, type NativeCommands } from "../keys/commands"

export type ExtensionPagePort = BrowserBackendPort & BrowserLocalizationPort & {
  readonly runtime: BrowserBackendPort["runtime"] & { openOptionsPage(): Promise<void>; getURL(path: string): string }
  readonly tabs: { create(properties: { url: string }): Promise<unknown> }
  readonly extension?: { readonly inIncognitoContext?: boolean }
  readonly commands?: NativeCommands
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
export type PageOptions = {
  readonly windowId?: number
  /** The canonical catalogue, loaded only by the lazy part that pins the disclosure (UI-ONB-09). */
  readonly catalogue?: () => Promise<MessageCatalogue>
}
export function startExtensionPage(native: ExtensionPagePort, navigatorPlatform: string, catalogue?: MessageCatalogue, window: PageOptions = {}) {
  try { for (const key of retiredLocalStorage) localStorage.removeItem(key) } catch {}
  const scheme = matchMedia("(prefers-color-scheme: dark)")
  let stopTheme = followTheme(document.documentElement, "system", scheme)
  const platform: Platform = { browser: build.browser, os: /mac/i.test(navigatorPlatform) ? "macos" : /win/i.test(navigatorPlatform) ? "windows" : "linux" }
  // The popup names its window, because it has no sender tab (ARC-MSG-06).
  const backend = createBrowserBackend(native, { build: build.build, deadline: timerDeadline, browser: build.browser,
    ...(window.windowId === undefined ? {} : { windowId: window.windowId }) })
  const getMessage = native.i18n.getMessage
  if (typeof getMessage !== "function") throw new TypeError("Native localization getMessage is unavailable")
  const i18n = catalogue ? createBrowserI18n(native, catalogue)
    : createSiteI18n({ getMessage: (name, substitutions) => String(Reflect.apply(getMessage, native.i18n, [name, substitutions]) ?? "") })
  const open = (url: string) => { void native.tabs.create({ url }) }
  return {
    backend, i18n, platform, private: native.extension?.inIncognitoContext === true, open, commands: createCommandKeys(native.commands),
    /** The popup's own window; null on pages that open in a tab. */
    windowId: window.windowId ?? null,
    version: native.runtime.getManifest().version, beta: build.mode === "beta",
    /** Follows Settings › Appearance on the popup, settings and first run (UI-IA-06, UI-SET-15). */
    applyTheme(theme: "system" | "light" | "dark") { stopTheme(); stopTheme = followTheme(document.documentElement, theme, scheme) },
    /** The canonical catalogue's text, for a lazy part that pins the disclosure (UI-ONB-09). */
    async canonical() {
      const full = catalogue ?? await window.catalogue?.()
      if (!full) throw new Error("This page carries no canonical catalogue")
      return createBrowserI18n(native, full)
    },
    openSettings: (hash?: string) => { if (hash) open(native.runtime.getURL(`/options.html#${hash}`)); else void native.runtime.openOptionsPage() },
    openFirstRun: () => { open(native.runtime.getURL("/onboarding.html")) }
  }
}
export type ExtensionPage = ReturnType<typeof startExtensionPage>
