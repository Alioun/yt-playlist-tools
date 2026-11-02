import type { browser as nativeBrowser } from "wxt/browser"
import { createI18n, type MessageCatalogue } from "../../shared/i18n"
import type { PermissionGrant, PermissionNeeds } from "../../shared/contracts/first-run"
import type { Site } from "../../shared/contracts/vocabulary"
import type { BackendOptions, Access } from "./backend"
import { createBackend } from "./core"

type NativeBrowser = typeof nativeBrowser
export type BrowserBackendPort = {
  readonly storage: {
    readonly local: Pick<NativeBrowser["storage"]["local"], "get">
    readonly onChanged: Pick<NativeBrowser["storage"]["onChanged"], "addListener" | "removeListener">
  }
  readonly runtime: Pick<NativeBrowser["runtime"], "sendMessage" | "getManifest">
  readonly permissions: Pick<NativeBrowser["permissions"], "contains" | "request">
}
type PermissionQuery = { origins?: string[]; permissions?: ["contextMenus"] }
const origins = { www: "https://www.youtube.com/*", music: "https://music.youtube.com/*" } as const satisfies Record<Site, string>

export function createBrowserBackend(native: BrowserBackendPort, options: BackendOptions & { readonly browser: "chrome" | "firefox" }) {
  function contains(query: PermissionQuery): Promise<boolean> {
    try { return native.permissions.contains(query).then(value => value === true, () => false) } catch { return Promise.resolve(false) }
  }
  function has(site: Site) { return contains({ origins: [origins[site]] }) }
  function hasBrowserMenu() { return contains({ permissions: ["contextMenus"] }) }
  function requestCombined(needs: PermissionNeeds): Promise<PermissionGrant> {
    let prompt: Promise<boolean> = Promise.resolve(false)
    try {
      const manifest = native.runtime.getManifest()
      const query: PermissionQuery = {}
      if (needs.music && options.browser === "chrome" && manifest.optional_host_permissions?.includes(origins.music)) query.origins = [origins.music]
      if (needs.browserMenu && manifest.optional_permissions?.includes("contextMenus")) query.permissions = ["contextMenus"]
      if (query.origins || query.permissions) prompt = native.permissions.request(query)
    } catch {}
    return prompt.catch(() => false).then(async () => {
      const [music, browserMenu] = await Promise.all([has("music"), hasBrowserMenu()])
      return { music, browserMenu }
    })
  }
  function request(site: Site): Promise<boolean> {
    if (site === "music") return requestCombined({ music: true, browserMenu: false }).then(grant => grant.music)
    return has("www")
  }
  const access: Access = { has, request, requestCombined, hasBrowserMenu }
  return createBackend({
    local: {
      get: keys => native.storage.local.get([...keys]),
      all: () => native.storage.local.get(null),
      onChanged: native.storage.onChanged
    },
    send: message => native.runtime.sendMessage(message), access
  }, options)
}

export type BrowserLocalizationPort = { readonly i18n: { readonly getMessage: unknown; getUILanguage(): string } }

export function createBrowserI18n(native: BrowserLocalizationPort, catalogue: MessageCatalogue) {
  const getMessage = native.i18n.getMessage
  if (typeof getMessage !== "function") throw new TypeError("Native localization getMessage is unavailable")
  return createI18n({ getMessage(name, substitutions) {
    const result: unknown = Reflect.apply(getMessage, native.i18n, [name, substitutions])
    if (typeof result !== "string") throw new TypeError("Native localization result is not text")
    return result
  } }, catalogue, native.i18n.getUILanguage())
}
