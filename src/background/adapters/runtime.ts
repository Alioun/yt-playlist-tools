import type { Authentication, Deadline, RpcMap, RpcRequest } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"
import { callbackTransport } from "../../shared/rpc/callback"
import { resolveSenderOrigin, type NativeSender, type SenderOriginPorts, type SenderOriginResult } from "./sender-origin"

type NativeBrowser = typeof import("wxt/browser").browser
type NativeListener = Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]

export type RuntimePort = {
  sendMessage(message: unknown): Promise<unknown>
  readonly onMessage: {
    addListener(listener: NativeListener): void
    removeListener(listener: NativeListener): void
  }
}
export type TabsPort = {
  sendMessage(tabId: number, message: unknown, options: { readonly frameId: 0 }): Promise<unknown>
}
export type TabTarget = Pick<Transport<never>, "send">
export type TabContext = Extract<SenderOriginResult, { kind: "tab" }>
export type UiContext = Extract<SenderOriginResult, { kind: "ui" }>

export function runtimeTransport(runtime: RuntimePort): Transport<NativeSender> {
  return callbackTransport<NativeSender>(runtime)
}

export function tabTarget(tabs: TabsPort, tabId: number): TabTarget {
  return { send: message => tabs.sendMessage(tabId, message, { frameId: 0 }) }
}

export const timerDeadline: Deadline = (ms, expire) => {
  let armed = true
  const timer = setTimeout(() => {
    armed = false
    expire()
  }, ms)
  return () => {
    if (!armed) return
    armed = false
    clearTimeout(timer)
  }
}

export function authenticateTab(ports: SenderOriginPorts) {
  return async ({ sender }: { readonly sender: NativeSender }): Promise<Authentication<TabContext>> => {
    const resolved = await resolveSenderOrigin(ports, { sender, popupWindowId: undefined })
    return resolved.kind === "tab" ? { kind: "accepted", context: resolved } : { kind: "rejected" }
  }
}

export function authenticateUi<M extends RpcMap>(ports: SenderOriginPorts, popupWindowIdOf: (request: RpcRequest<M>) => unknown) {
  return async ({ sender, request }: { readonly sender: NativeSender; readonly request: RpcRequest<M> }): Promise<Authentication<UiContext>> => {
    const resolved = await resolveSenderOrigin(ports, { sender, popupWindowId: popupWindowIdOf(request) })
    return resolved.kind === "ui" ? { kind: "accepted", context: resolved } : { kind: "rejected" }
  }
}
