import type { Browser } from "wxt/browser"
import type { FakeBrowser } from "wxt/testing/fake-browser"
import type { BuildId, Site } from "../../shared/contracts/vocabulary"
import { createRpc, createRpcCaller } from "../../shared/rpc/rpc"
import type { Authentication, RpcContract, RpcReceiver } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"
import { authenticateTab, authenticateUi, runtimeTransport, tabTarget, timerDeadline } from "./runtime"
import type { RuntimePort, TabContext, TabsPort, TabTarget, UiContext } from "./runtime"
import type { NativeSender, SenderOriginPorts, SenderPage } from "./sender-origin"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Check<T extends true> = T

type Calls = { "test.hello": { payload: { site: Site }; result: { site: Site } } }
declare const native: typeof import("wxt/browser").browser
declare const fake: FakeBrowser
declare const ports: SenderOriginPorts
declare const build: BuildId
declare const contract: RpcContract<Calls>

export const nativePorts = [
  native.runtime satisfies RuntimePort,
  native.tabs satisfies TabsPort,
  native satisfies SenderOriginPorts,
  fake.runtime satisfies RuntimePort,
  fake.tabs satisfies TabsPort,
  fake satisfies SenderOriginPorts
]

export type RuntimeProofs = [
  Check<Equal<NativeSender, Browser.runtime.MessageSender>>,
  Check<Equal<ReturnType<typeof runtimeTransport>, Transport<NativeSender>>>,
  Check<Equal<keyof TabTarget, "send">>,
  Check<Equal<TabTarget["send"], Transport<never>["send"]>>,
  Check<Equal<ReturnType<typeof tabTarget>, TabTarget>>,
  Check<Equal<Parameters<TabsPort["sendMessage"]>[2], { readonly frameId: 0 }>>,
  Check<Equal<SenderPage, "popup" | "settings" | "onboarding">>,
  Check<Equal<TabContext["site"], Site>>,
  Check<Equal<UiContext["page"], SenderPage>>,
  Check<Equal<Awaited<ReturnType<ReturnType<typeof authenticateTab>>>, Authentication<TabContext>>>,
  Check<Equal<Awaited<ReturnType<ReturnType<typeof authenticateUi<Calls>>>>, Authentication<UiContext>>>
]

export function sendOnlyTarget(tabs: TabsPort) {
  const target = tabTarget(tabs, 1)
  const caller = createRpcCaller(target, { build, contract, deadline: timerDeadline })
  void caller.call("test.hello", { site: "music" })
  caller.dispose()
  void target.send("message")
  // @ts-expect-error A tab target has no listen method.
  void target.listen
  // @ts-expect-error A send-only tab target cannot back a receiving RPC endpoint.
  createRpc(target, { build, contract, deadline: timerDeadline })
  // @ts-expect-error The tab port requires the frame-zero option.
  void tabs.sendMessage(1, "message")
  // @ts-expect-error The tab port sends only to frame zero.
  void tabs.sendMessage(1, "message", { frameId: 1 })
}

export function nativeShapes(port: RuntimePort) {
  const rpc = createRpc(runtimeTransport(port), { build, contract, deadline: timerDeadline })
  const synthetic = {
    sendMessage: (message: unknown) => Promise.resolve(message),
    onMessage: {
      addListener(_listener: (message: unknown, sender: { context: string }, sendResponse: (response?: unknown) => void) => void) {},
      removeListener(_listener: (message: unknown, sender: { context: string }, sendResponse: (response?: unknown) => void) => void) {}
    }
  }
  // @ts-expect-error A port whose listeners receive a synthetic sender is not the native runtime.
  runtimeTransport(synthetic)
  // @ts-expect-error Authentication reads a native sender, not a synthetic claim.
  void authenticateTab(ports)({ sender: { context: "tab", tabId: 1 } })
  void rpc
}

export function authenticatedContexts(transport: Transport<NativeSender>) {
  const rpc = createRpc(transport, { build, contract, deadline: timerDeadline })
  const ui = authenticateUi<Calls>(ports, () => undefined)
  rpc.handle({ authenticate: authenticateTab(ports), handlers: { "test.hello": (_payload, context) => ({ site: context.site }) } })
  rpc.handle({
    authenticate: authenticateTab(ports),
    // @ts-expect-error A tab context has no extension page.
    handlers: { "test.hello": (_payload, context) => ({ site: context.page }) }
  })
  rpc.handle({
    authenticate: ui,
    // @ts-expect-error A UI context has no site.
    handlers: { "test.hello": (_payload, context) => ({ site: context.site }) }
  })
  // @ts-expect-error A UI authenticator cannot admit a tab receiver.
  const crossed: RpcReceiver<Calls, NativeSender, TabContext>["authenticate"] = ui
  void crossed
}
