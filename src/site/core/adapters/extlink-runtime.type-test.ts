import type { Browser } from "wxt/browser"
import type { FakeBrowser } from "wxt/testing/fake-browser"
import { nativeExtLinkRuntime, type ExtLinkNativeSender, type ExtLinkRuntimePort } from "./extlink-runtime"
import type { ExtLinkRuntime } from "../extlink"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
declare const native: typeof import("wxt/browser").browser
declare const fake: FakeBrowser

export const ports = [native.runtime satisfies ExtLinkRuntimePort, fake.runtime satisfies ExtLinkRuntimePort]
export type NativeProofs = [
  Check<Equal<ExtLinkNativeSender, Browser.runtime.MessageSender>>,
  Check<Equal<ReturnType<typeof nativeExtLinkRuntime>, ExtLinkRuntime<ExtLinkNativeSender>>>
]

export function nativeSenderTypes(runtime: ExtLinkRuntimePort) {
  const port = nativeExtLinkRuntime(runtime)
  port.senderId({ id: "synthetic-extension", frameId: 0 })
  // @ts-expect-error A body-supplied context is not native sender metadata.
  port.senderId({ context: { id: "synthetic-extension" } })
}
