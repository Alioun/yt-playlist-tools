import { fakeBrowser } from "wxt/testing/fake-browser"
import { objectShape } from "../../../src/shared/contracts/object-shape"
import { CONTRACT_VERSION } from "../../../src/shared/contracts/protocol"
import { isBuildId, type BuildId, type Site } from "../../../src/shared/contracts/vocabulary"
import { createRpc, createRpcCaller, type RpcContract, type RpcOutcome } from "../../../src/shared/rpc/rpc"
import type { Transport } from "../../../src/shared/rpc/transport"
import { authenticateTab, authenticateUi, runtimeTransport, tabTarget, timerDeadline, type TabsPort } from "../../../src/background/adapters/runtime"
import type { NativeSender, SenderPage } from "../../../src/background/adapters/sender-origin"

type TabCalls = { "fixture.hello": { payload: { site: Site }; result: { site: Site; tabId: number; windowId: number; incognito: boolean } } }
type UiCalls = { "fixture.window": { payload: { windowId: number }; result: { page: SenderPage; windowId: number; incognito: boolean } } }

const isSite = (value: unknown) => value === "www" || value === "music"
const isNumber = (value: unknown) => typeof value === "number"
const isFlag = (value: unknown) => typeof value === "boolean"
const tabContract: RpcContract<TabCalls> = {
  "fixture.hello": {
    payload: (value): value is TabCalls["fixture.hello"]["payload"] => objectShape(value, { site: isSite }),
    result: (value): value is TabCalls["fixture.hello"]["result"] => objectShape(value, { site: isSite, tabId: isNumber, windowId: isNumber, incognito: isFlag }),
    timeoutMs: 2_000
  }
}
const uiContract: RpcContract<UiCalls> = {
  "fixture.window": {
    payload: (value): value is UiCalls["fixture.window"]["payload"] => objectShape(value, { windowId: isNumber }),
    result: (value): value is UiCalls["fixture.window"]["result"] => objectShape(value, {
      page: page => page === "popup" || page === "settings" || page === "onboarding", windowId: isNumber, incognito: isFlag
    }),
    timeoutMs: 2_000
  }
}

function routedFrom(sender: NativeSender, claims: unknown[][]): Transport<NativeSender> {
  return {
    async send(message) {
      if (!fakeBrowser.runtime.onMessage.hasListeners()) throw new Error("No listeners available")
      let respond!: (response: unknown) => void
      const response = new Promise<unknown>(resolve => { respond = resolve })
      const results: readonly unknown[] = await fakeBrowser.runtime.onMessage.trigger(message, sender, value => respond(value))
      claims.push([...results])
      return results.includes(true) ? response : undefined
    },
    listen() {
      throw new Error("Fixture callers do not receive")
    }
  }
}

function buildId(value: string): BuildId {
  if (!isBuildId(value)) throw new Error("Invalid fixture build")
  return value
}

export async function runNativeRuntimeFixture() {
  const build = buildId("fixture-build")
  const unhandledRejections: string[] = []
  const record = () => { unhandledRejections.push("unhandled") }
  process.on("unhandledRejection", record)
  fakeBrowser.reset()

  const windowNames = new Map<number, string>()
  const tabNames = new Map<number, string>()
  async function openWindow(name: string, incognito: boolean) {
    const created = await fakeBrowser.windows.create({ incognito })
    if (created?.id === undefined) throw new Error("Synthetic window missing ID")
    windowNames.set(created.id, name)
    return created.id
  }
  const normal = await openWindow("normal", false)
  const hidden = await openWindow("private", true)
  async function openTab(name: string, url: string, windowId: number, incognito: boolean): Promise<NativeSender> {
    const created = await fakeBrowser.tabs.create({ windowId, url })
    if (created.id === undefined) throw new Error("Synthetic tab missing ID")
    tabNames.set(created.id, name)
    return { id: fakeBrowser.runtime.id, frameId: 0, url, tab: { ...created, windowId, incognito } }
  }
  const www = await openTab("www-tab", "https://www.youtube.com/watch?v=abcdefghijk", normal, false)
  const music = await openTab("music-tab", "https://music.youtube.com/watch?v=abcdefghijk", hidden, true)
  const settings = await openTab("settings-tab", fakeBrowser.runtime.getURL("/options.html"), normal, false)
  const firstRun = await openTab("first-run-tab", fakeBrowser.runtime.getURL("/onboarding.html"), hidden, true)
  const popup: NativeSender = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }

  const handled: string[] = []
  const tabEndpoint = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: tabContract, deadline: timerDeadline })
  tabEndpoint.handle({
    authenticate: authenticateTab(fakeBrowser),
    handlers: {
      "fixture.hello": (_payload, context) => {
        handled.push(`hello ${context.site}`)
        return { site: context.site, tabId: context.origin.tabId, windowId: context.windowId, incognito: context.origin.incognito }
      }
    }
  })
  const uiEndpoint = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: uiContract, deadline: timerDeadline })
  uiEndpoint.handle({
    authenticate: authenticateUi<UiCalls>(fakeBrowser, ({ payload }) => payload.windowId),
    handlers: {
      "fixture.window": (_payload, context) => {
        handled.push(`window ${context.page}`)
        return { page: context.page, windowId: context.origin.windowId, incognito: context.origin.incognito }
      }
    }
  })
  const legacy = (message: unknown, _sender: NativeSender, sendResponse: (response?: unknown) => void) => {
    if (!objectShape(message, { action: value => typeof value === "string" })) return false
    sendResponse({ legacy: message.action })
    return true
  }
  fakeBrowser.runtime.onMessage.addListener(legacy)

  const label = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, item: unknown) =>
    typeof item !== "number" ? item
      : key === "tabId" ? tabNames.get(item) ?? "unknown-tab"
      : key === "windowId" ? windowNames.get(item) ?? "unknown-window" : item))
  const calls: { readonly call: string; readonly claims: unknown[][]; readonly outcome: unknown }[] = []
  async function tabCall(call: string, sender: NativeSender, site: Site) {
    const claims: unknown[][] = []
    const caller = createRpc(routedFrom(sender, claims), { build, contract: tabContract, deadline: timerDeadline })
    const outcome: RpcOutcome<unknown> = await caller.call("fixture.hello", { site })
    caller.dispose()
    calls.push({ call, claims, outcome: label(outcome) })
  }
  async function uiCall(call: string, sender: NativeSender, windowId: number) {
    const claims: unknown[][] = []
    const caller = createRpc(routedFrom(sender, claims), { build, contract: uiContract, deadline: timerDeadline })
    const outcome: RpcOutcome<unknown> = await caller.call("fixture.window", { windowId })
    caller.dispose()
    calls.push({ call, claims, outcome: label(outcome) })
  }

  await tabCall("www tab claims music", www, "music")
  await tabCall("private music tab", music, "www")
  await tabCall("www subframe", { ...www, frameId: 2 }, "www")
  await tabCall("popup sends a tab call", popup, "www")
  await uiCall("private first-run page claims the normal window", firstRun, normal)
  await uiCall("popup in the private window", popup, hidden)
  await uiCall("popup claims an unknown window", popup, 999_999)
  await uiCall("www tab sends a UI call", www, normal)
  await uiCall("settings claims the private window", settings, hidden)
  const legacyClaims: unknown[][] = []
  const legacyAnswer = await routedFrom(www, legacyClaims).send({ action: "fixture.legacy" })
  calls.push({ call: "legacy action", claims: legacyClaims, outcome: legacyAnswer })
  const senderless = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: tabContract, deadline: timerDeadline })
  calls.push({ call: "sender-less fake delivery", claims: [], outcome: await senderless.call("fixture.hello", { site: "www" }) })

  const sent: unknown[] = []
  const tabs: TabsPort = {
    sendMessage(tabId, message, options) {
      sent.push(label({ tabId, message, options }))
      return Promise.resolve(undefined)
    }
  }
  const envelope = { v: CONTRACT_VERSION, build, id: "1", kind: "fixture.ping", payload: null }
  const wwwTabId = www.tab?.id ?? -1
  const target = tabTarget(tabs, wwwTabId)
  const answered = await target.send(envelope)
  const rejected = await tabTarget({ sendMessage: () => Promise.reject(new Error("Synthetic closed tab")) }, wwwTabId).send(envelope)
    .then(() => "resolved", () => "rejected")
  const tabTargetResult = { sent, answered: answered ?? null, rejected, keys: Object.keys(target) }

  const qualifiedSent: unknown[] = []
  const qualifiedClaims: unknown[][] = []
  const qualifiedTarget = tabTarget({
    sendMessage(tabId, message, options) {
      qualifiedSent.push(label({ tabId, message, options }))
      return routedFrom(www, qualifiedClaims).send(message)
    }
  }, wwwTabId)
  const qualifiedCaller = createRpcCaller(qualifiedTarget, { build, contract: tabContract, deadline: timerDeadline })
  const qualifiedOutcome = await qualifiedCaller.call("fixture.hello", { site: "music" })
  qualifiedCaller.dispose()
  const qualifiedDisposed = await qualifiedCaller.call("fixture.hello", { site: "www" })
  const qualifiedResult = {
    sent: qualifiedSent, claims: qualifiedClaims, outcome: label(qualifiedOutcome), afterDisposal: qualifiedDisposed,
    targetKeys: Object.keys(qualifiedTarget), callerKeys: Object.keys(qualifiedCaller)
  }

  tabEndpoint.dispose()
  uiEndpoint.dispose()
  fakeBrowser.runtime.onMessage.removeListener(legacy)
  const afterDisposal = await senderless.call("fixture.hello", { site: "www" })
  senderless.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  process.off("unhandledRejection", record)
  return {
    calls, tabTarget: tabTargetResult, qualifiedCaller: qualifiedResult, handled, afterDisposal,
    listening: fakeBrowser.runtime.onMessage.hasListeners(), unhandledRejections
  }
}

if (import.meta.main) {
  const result = await runNativeRuntimeFixture()
  for (const call of result.calls) process.stdout.write(`${JSON.stringify(call)}\n`)
  process.stdout.write(`${JSON.stringify({ tabTarget: result.tabTarget })}\n`)
  process.stdout.write(`${JSON.stringify({ qualifiedCaller: result.qualifiedCaller })}\n`)
  process.stdout.write(`${JSON.stringify({
    handled: result.handled, afterDisposal: result.afterDisposal, listening: result.listening, unhandledRejections: result.unhandledRejections
  })}\n`)
}
