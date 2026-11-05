import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import { siteBundles, type RegisteredScript, type RegistrationFeature } from "../../shared/features/registration"
import type { ObservedScript, OwnerPort, ProbePort, RegistrarError, RegistrarPorts, TabFact, TabLookup } from "../registrar/ports"

type NativeBrowser = typeof import("wxt/browser").browser
type NativeTab = Browser.tabs.Tab
type NativeScript = Browser.scripting.RegisteredContentScript
type HostAccessRequests = {
  addHostAccessRequest?(request: { tabId: number; pattern: string }): Promise<void>
}
type Subscription = {
  addListener(listener: () => void): void
  removeListener(listener: () => void): void
}
export type RegistrarBrowser = {
  readonly scripting: {
    getRegisteredContentScripts(): Promise<NativeScript[]>
    registerContentScripts(scripts: NativeScript[]): Promise<void>
    updateContentScripts(scripts: NativeScript[]): Promise<void>
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>
    executeScript(details: Browser.scripting.ScriptInjection<[], unknown>): Promise<readonly { readonly frameId: number; readonly documentId?: string }[]>
  }
  readonly tabs: {
    query(query: Browser.tabs.QueryInfo): Promise<NativeTab[]>
    get(tabId: number): Promise<NativeTab>
  }
  readonly windows: { getLastFocused(): Promise<Browser.windows.Window> }
  readonly runtime: { readonly onStartup: Subscription }
  readonly permissions: Pick<NativeBrowser["permissions"], "contains"> &
    HostAccessRequests & {
      readonly onAdded: Subscription
      readonly onRemoved: Subscription
    }
}
export type BrowserRegistrarBindings = {
  readonly browser: RegistrarBrowser
  readonly build: BuildId
  readonly registry: readonly RegistrationFeature[]
  readonly owner: OwnerPort
  readonly probe: ProbePort
  backgroundError(error: RegistrarError): void
}

function siteOf(url: string): Site | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.port !== "" || parsed.username !== "" || parsed.password !== "") return undefined
    if (parsed.hostname === "www.youtube.com") return "www"
    if (parsed.hostname === "music.youtube.com") return "music"
  } catch {}
  return undefined
}
function tabFact(tab: NativeTab, focusedWindow: number | undefined): TabLookup {
  if (tab.id === undefined || tab.url === undefined) return { kind: "unavailable" }
  const site = siteOf(tab.url)
  if (!site) return { kind: "unavailable" }
  return {
    kind: "found",
    tab: {
      id: tab.id,
      site,
      url: tab.url,
      active: tab.active,
      focusedWindow: tab.windowId === focusedWindow,
      audible: tab.audible === true,
      lastAccessed: tab.lastAccessed ?? 0,
      discarded: tab.discarded === true,
      frozen: "frozen" in tab && tab.frozen === true
    }
  }
}
function observed(script: NativeScript): ObservedScript {
  return {
    id: script.id,
    matches: script.matches ?? [],
    js: script.js ?? [],
    css: script.css ?? [],
    excludeMatches: script.excludeMatches ?? [],
    world: script.world ?? "ISOLATED",
    runAt: script.runAt ?? "document_idle",
    allFrames: script.allFrames ?? false,
    persistAcrossSessions: script.persistAcrossSessions ?? true,
    matchOriginAsFallback: "matchOriginAsFallback" in script && script.matchOriginAsFallback === true
  }
}
function nativeScripts(scripts: readonly RegisteredScript[]) {
  return scripts.map(script => ({ ...script, js: [...script.js], matches: [...script.matches], css: [], excludeMatches: [], matchOriginAsFallback: false }))
}

export function browserRegistrarPorts(bindings: BrowserRegistrarBindings): RegistrarPorts {
  const { browser } = bindings
  async function focused(): Promise<number | undefined> {
    const window = await browser.windows.getLastFocused()
    return window.focused ? window.id : undefined
  }
  return {
    build: bindings.build,
    registry: bindings.registry,
    owner: bindings.owner,
    probe: bindings.probe,
    backgroundError: error => bindings.backgroundError(error),
    scripting: {
      async list() {
        return (await browser.scripting.getRegisteredContentScripts()).map(observed)
      },
      async register(scripts) {
        await browser.scripting.registerContentScripts(nativeScripts(scripts))
      },
      async update(scripts) {
        await browser.scripting.updateContentScripts(nativeScripts(scripts))
      },
      async unregister(ids) {
        await browser.scripting.unregisterContentScripts({ ids: [...ids] })
      },
      async executeScript(injection) {
        const result = await browser.scripting.executeScript({
          target: { tabId: injection.tabId, frameIds: [0] },
          world: injection.world,
          files: [injection.file]
        })
        const top = result.find(frame => frame.frameId === 0)
        if (!top || ("documentId" in top && top.documentId !== undefined && top.documentId !== injection.documentId)) throw Error("Registrar execution unconfirmed")
      }
    },
    access: {
      contains: site => browser.permissions.contains({ origins: [siteBundles[site].match] }),
      async offer(tabId, site) {
        if (!browser.permissions.addHostAccessRequest) return "unsupported"
        await browser.permissions.addHostAccessRequest({ tabId, pattern: siteBundles[site].match })
        return "offered"
      },
      subscribe(changed) {
        browser.permissions.onAdded.addListener(changed)
        browser.permissions.onRemoved.addListener(changed)
        return () => {
          browser.permissions.onAdded.removeListener(changed)
          browser.permissions.onRemoved.removeListener(changed)
        }
      }
    },
    tabs: {
      async list() {
        const window = await focused()
        const tabs = await browser.tabs.query({ url: [siteBundles.www.match, siteBundles.music.match] })
        const found: TabFact[] = []
        for (const tab of tabs) {
          const result = tabFact(tab, window)
          if (result.kind === "found") found.push(result.tab)
        }
        return found
      },
      async get(tabId) {
        try {
          return tabFact(await browser.tabs.get(tabId), undefined)
        } catch {
          return { kind: "unavailable" }
        }
      }
    },
    startup: {
      subscribe(started) {
        browser.runtime.onStartup.addListener(started)
        return () => browser.runtime.onStartup.removeListener(started)
      }
    }
  }
}
import type { Browser } from "wxt/browser"
