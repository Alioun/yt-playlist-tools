import { callbackTransport } from "../../../shared/rpc/callback"
import { createExtLink, type ExtLinkOptions, type ExtLinkRuntime } from "../extlink"
import type { TabViewScope } from "../../../shared/contracts/tabs"

type NativeRuntime = typeof import("wxt/browser").browser.runtime
type NativeListener = Parameters<NativeRuntime["onMessage"]["addListener"]>[0]
export type ExtLinkNativeSender = Parameters<NativeListener>[1]
export type ExtLinkRuntimePort = {
  readonly id: NativeRuntime["id"]
  sendMessage(message: unknown): Promise<unknown>
  readonly onMessage: {
    addListener(listener: NativeListener): void
    removeListener(listener: NativeListener): void
  }
}

export function nativeExtLinkRuntime(runtime: ExtLinkRuntimePort): ExtLinkRuntime<ExtLinkNativeSender> {
  return {
    transport: callbackTransport<ExtLinkNativeSender>(runtime),
    identity: () => runtime.id,
    senderId: sender => sender.id
  }
}

export function createNativeExtLink<View extends TabViewScope>(
  options: Omit<ExtLinkOptions<View, ExtLinkNativeSender>, "runtime" | "hiddenAtStart">,
  runtime: ExtLinkRuntimePort,
  visibility: Pick<Document, "visibilityState">
) {
  const hiddenAtStart = visibility.visibilityState === "hidden"
  return createExtLink({ ...options, hiddenAtStart, runtime: nativeExtLinkRuntime(runtime) })
}
