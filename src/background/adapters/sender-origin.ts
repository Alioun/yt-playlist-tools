import type { Origin } from "../../shared/contracts/results"
import type { Site } from "../../shared/contracts/vocabulary"

type NativeBrowser = typeof import("wxt/browser").browser
export type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
type NativeWindow = import("wxt/browser").Browser.windows.Window

export type SenderOriginPorts = {
  readonly runtime: {
    readonly id: NativeBrowser["runtime"]["id"]
    getURL(path: string): string
  }
  readonly windows: {
    get(windowId: Parameters<NativeBrowser["windows"]["get"]>[0]): Promise<Pick<NativeWindow, "id" | "incognito">>
  }
}

export type SenderPage = "popup" | "settings" | "onboarding"
export type SenderOriginResult =
  | { readonly kind: "ui"; readonly page: SenderPage; readonly origin: Extract<Origin, { kind: "ui" }> }
  | { readonly kind: "tab"; readonly site: Site; readonly origin: Extract<Origin, { kind: "tab" }>; readonly windowId: number }
  | { readonly kind: "unavailable"; readonly reason: "identity" }
  | { readonly kind: "unavailable"; readonly reason: "privacy"; readonly page: SenderPage | "tab" }

const pagePaths = { popup: "/popup.html", settings: "/options.html", onboarding: "/onboarding.html" } satisfies Record<SenderPage, string>
const sitePrefixes = { www: "https://www.youtube.com/", music: "https://music.youtube.com/" } satisfies Record<Site, string>
const pages: readonly SenderPage[] = ["popup", "settings", "onboarding"]
const sites: readonly Site[] = ["www", "music"]

type Caller = { readonly kind: "page"; readonly page: SenderPage } | { readonly kind: "site"; readonly site: Site }

function callerAt(deps: SenderOriginPorts, url: string | undefined): Caller | undefined {
  if (typeof url !== "string") return undefined
  const page = pages.find(page => url === deps.runtime.getURL(pagePaths[page]))
  if (page) return { kind: "page", page }
  const site = sites.find(site => url.startsWith(sitePrefixes[site]))
  if (site) return { kind: "site", site }
}

function isNativeId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

async function windowPrivacy(deps: SenderOriginPorts, windowId: number): Promise<boolean | undefined> {
  try {
    const window = await deps.windows.get(windowId)
    if (window?.id === windowId && typeof window.incognito === "boolean") return window.incognito
  } catch {}
}

export async function resolveSenderOrigin(deps: SenderOriginPorts, input: {
  readonly sender: NativeSender
  readonly popupWindowId: unknown
}): Promise<SenderOriginResult> {
  const { sender } = input
  if (sender.id !== deps.runtime.id || (sender.frameId !== undefined && sender.frameId !== 0)) {
    return { kind: "unavailable", reason: "identity" }
  }
  const caller = callerAt(deps, sender.url)
  if (caller?.kind === "page" && caller.page === "popup") {
    const page = caller.page
    if (sender.tab !== undefined) return { kind: "unavailable", reason: "identity" }
    const windowId = input.popupWindowId
    if (!isNativeId(windowId)) return { kind: "unavailable", reason: "privacy", page }
    const incognito = await windowPrivacy(deps, windowId)
    if (incognito === undefined) return { kind: "unavailable", reason: "privacy", page }
    return { kind: "ui", page, origin: { kind: "ui", windowId, incognito } }
  }
  const tab = sender.tab
  if (!caller || sender.frameId !== 0 || !tab || !isNativeId(tab.id)) return { kind: "unavailable", reason: "identity" }
  const { id: tabId, windowId, incognito } = tab
  if (!isNativeId(windowId) || typeof incognito !== "boolean" || await windowPrivacy(deps, windowId) !== incognito) {
    return { kind: "unavailable", reason: "privacy", page: caller.kind === "page" ? caller.page : "tab" }
  }
  if (caller.kind === "page") return { kind: "ui", page: caller.page, origin: { kind: "ui", windowId, incognito } }
  return { kind: "tab", site: caller.site, origin: { kind: "tab", tabId, incognito }, windowId }
}
