import type { Origin } from "../../shared/contracts/results"

type NativeBrowser = typeof import("wxt/browser").browser
type NativeSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
type NativeWindow = import("wxt/browser").Browser.windows.Window

export type SenderOriginPorts = {
  readonly runtime: Pick<NativeBrowser["runtime"], "id" | "getURL">
  readonly windows: {
    get(windowId: Parameters<NativeBrowser["windows"]["get"]>[0]): Promise<Pick<NativeWindow, "id" | "incognito">>
  }
}

export type SenderOriginResult =
  | { readonly kind: "ui"; readonly page: "popup" | "settings"; readonly origin: Extract<Origin, { kind: "ui" }> }
  | { readonly kind: "tab"; readonly origin: Extract<Origin, { kind: "tab" }>; readonly windowId: number }
  | { readonly kind: "unavailable"; readonly reason: "identity" }
  | { readonly kind: "unavailable"; readonly reason: "privacy"; readonly page: "popup" | "settings" | "tab" }

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
  const page = sender.url === deps.runtime.getURL("/popup.html") ? "popup"
    : sender.url === deps.runtime.getURL("/options.html") ? "settings"
    : sender.url?.startsWith("https://www.youtube.com/") ? "tab" : undefined
  if (page === "popup") {
    if (sender.tab !== undefined) return { kind: "unavailable", reason: "identity" }
    const windowId = input.popupWindowId
    if (!isNativeId(windowId)) return { kind: "unavailable", reason: "privacy", page }
    const incognito = await windowPrivacy(deps, windowId)
    if (incognito === undefined) return { kind: "unavailable", reason: "privacy", page }
    return { kind: "ui", page, origin: { kind: "ui", windowId, incognito } }
  }
  const tab = sender.tab
  if (!page || sender.frameId !== 0 || !tab || !isNativeId(tab.id)) return { kind: "unavailable", reason: "identity" }
  const { id: tabId, windowId, incognito } = tab
  if (!isNativeId(windowId) || typeof incognito !== "boolean" || await windowPrivacy(deps, windowId) !== incognito) {
    return { kind: "unavailable", reason: "privacy", page }
  }
  if (page === "settings") return { kind: "ui", page, origin: { kind: "ui", windowId, incognito } }
  return { kind: "tab", origin: { kind: "tab", tabId, incognito }, windowId }
}
