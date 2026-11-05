import type { Authentication } from "../../shared/rpc/rpc"
import type { Requester } from "../tabs/ports"
import { resolveSenderOrigin, type NativeSender, type SenderOriginPorts } from "./sender-origin"
import type { UiContext } from "./runtime"

export type UiRequesterPorts = SenderOriginPorts & {
  readonly tabs: {
    query(query: { readonly active: true; readonly windowId: number }): Promise<
      readonly {
        readonly id?: number
        readonly windowId: number
        readonly incognito: boolean
        readonly active: boolean
      }[]
    >
  }
}
class NativeUiRequester {
  readonly #native = true
  constructor(
    readonly ui: UiContext,
    readonly requester: Requester,
    readonly principal: string
  ) {}
  get verified(): boolean {
    return this.#native
  }
}
export type UiRequester = NativeUiRequester
const nativeId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0

export async function authenticateUiRequester(
  ports: UiRequesterPorts,
  input: {
    readonly sender: NativeSender
    readonly windowId: number | undefined
  }
): Promise<Authentication<UiRequester>> {
  const resolved = await resolveSenderOrigin(ports, { sender: input.sender, popupWindowId: input.windowId })
  if (resolved.kind !== "ui" || (resolved.page !== "popup" && input.windowId !== undefined)) return { kind: "rejected" }
  const { windowId, incognito } = resolved.origin
  let activeTabId: number | null
  if (resolved.page === "popup") {
    let active
    try {
      active = await ports.tabs.query({ active: true, windowId })
    } catch {
      return { kind: "rejected" }
    }
    if (active.length > 1 || active.some(tab => !nativeId(tab.id) || tab.windowId !== windowId || tab.incognito !== incognito || tab.active !== true)) return { kind: "rejected" }
    activeTabId = active[0]?.id ?? null
  } else {
    const tab = input.sender.tab
    if (!tab || !nativeId(tab.id)) return { kind: "rejected" }
    activeTabId = tab.id
  }
  const principal = JSON.stringify([input.sender.id, input.sender.url, input.sender.documentId ?? null, input.sender.tab?.id ?? null, windowId, incognito])
  return { kind: "accepted", context: new NativeUiRequester(resolved, Object.freeze({ windowId, incognito, activeTabId }), principal) }
}
