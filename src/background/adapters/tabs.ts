import { isBuildId, type BuildId, type Site } from "../../shared/contracts/vocabulary"
import { isTabPing, tabHelloMessages, tabJobMessages, tabMessages, tabPingMessages, type TabHelloMessages, type TabJobMessages, type TabMessages, type TabPingMessages, type TabPing, type TabViewScope } from "../../shared/contracts/tabs"
import type { Job, JobInvocation, JobResult } from "../../shared/contracts/jobs"
import { createRpc, createRpcCaller, type Deadline, type RpcOutcome } from "../../shared/rpc/rpc"
import { authenticateTab, runtimeTransport, tabTarget, type RuntimePort, type TabsPort } from "./runtime"
import { resolveSenderOrigin, type NativeSender, type SenderOriginPorts } from "./sender-origin"
import { isTabId } from "../tabs/records"
import type { NativeTab, Requester, TabLookup, TabNativePort, TabReply, Tabs, TabViewProducer } from "../tabs/ports"

type NativeBrowser = typeof import("wxt/browser").browser
type BrowserTab = import("wxt/browser").Browser.tabs.Tab
export type TabsBrowser = SenderOriginPorts & {
  readonly runtime: SenderOriginPorts["runtime"] & RuntimePort
  readonly tabs: TabsPort & {
    get(tabId: number): Promise<BrowserTab>
    query(query: Parameters<NativeBrowser["tabs"]["query"]>[0]): Promise<BrowserTab[]>
  }
}

function siteOf(url: string | undefined): Site | null {
  if (url === undefined) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.port !== "" || parsed.username !== "" || parsed.password !== "") return null
    return parsed.hostname === "www.youtube.com" ? "www" : parsed.hostname === "music.youtube.com" ? "music" : null
  } catch { return null }
}

export function createBrowserTabs(browser: TabsBrowser, options: { readonly build: BuildId; readonly deadline: Deadline }) {
  const { build, deadline } = options
  if (!isBuildId(build)) throw new TypeError("Invalid Tabs build")
  let disposed = false
  const active = new Set<() => void>()
  const receivers = new Set<() => void>()
  async function facts(tab: BrowserTab): Promise<NativeTab | undefined> {
    if (disposed) return
    if (!isTabId(tab.id) || !isTabId(tab.windowId) || typeof tab.incognito !== "boolean" || typeof tab.active !== "boolean" ||
      tab.discarded !== undefined && typeof tab.discarded !== "boolean" || tab.frozen !== undefined && typeof tab.frozen !== "boolean" ||
      tab.lastAccessed !== undefined && (typeof tab.lastAccessed !== "number" || !Number.isFinite(tab.lastAccessed) || tab.lastAccessed < 0)) return
    const window = await browser.windows.get(tab.windowId)
    if (disposed || window.id !== tab.windowId || window.incognito !== tab.incognito) return
    return { tabId: tab.id, windowId: tab.windowId, incognito: tab.incognito, site: siteOf(tab.url),
      lastAccessed: tab.lastAccessed ?? 0, active: tab.active, discarded: tab.discarded ?? false, frozen: tab.frozen ?? false }
  }
  async function get(tabId: number): Promise<TabLookup> {
    if (disposed || !isTabId(tabId)) return { kind: "unavailable" }
    try {
      const raw = await browser.tabs.get(tabId)
      const tab = await facts(raw)
      return !disposed && tab?.tabId === tabId ? { kind: "tab", tab } : { kind: "unavailable" }
    } catch {
      if (disposed) return { kind: "unavailable" }
      try {
        const all = await browser.tabs.query({})
        return !disposed && all.every(tab => isTabId(tab.id)) && !all.some(tab => tab.id === tabId) ? { kind: "gone" } : { kind: "unavailable" }
      } catch { return { kind: "unavailable" } }
    }
  }
  const unavailable = (): RpcOutcome<never> => ({ kind: "failed", failure: disposed ? "disposed" : "transport" })
  async function call<T>(tabId: number, signal: AbortSignal, run: (send: ReturnType<typeof tabTarget>, own: (stop: () => void) => void) => Promise<RpcOutcome<T>>): Promise<TabReply<T>> {
    if (disposed || signal.aborted) return { kind: "failed", failure: "disposed" }
    let stop = () => {}
    const own = (dispose: () => void) => { stop = dispose; active.add(stop); signal.addEventListener("abort", stop, { once: true }) }
    try {
      const answer = await run(tabTarget(browser.tabs, tabId), own)
      if (answer.kind === "failed" && answer.failure === "transport" && !signal.aborted && !disposed) {
        const current = await get(tabId)
        if (current.kind === "gone") return { kind: "gone" }
      }
      return answer
    } catch { return unavailable() }
    finally { active.delete(stop); signal.removeEventListener("abort", stop); stop() }
  }
  const port: TabNativePort = {
    get,
    async query(site) {
      if (disposed) return { kind: "unavailable" }
      try {
        const query = site === "all" ? {} : { url: [site === "www" ? "https://www.youtube.com/*" : "https://music.youtube.com/*"], discarded: false }
        const raw = await browser.tabs.query(query)
        const normalized: NativeTab[] = []
        for (const candidate of raw) {
          const tab = await facts(candidate)
          if (!tab) return { kind: "unavailable" }
          normalized.push(tab)
        }
        return disposed ? { kind: "unavailable" } : { kind: "tabs", tabs: normalized }
      } catch { return { kind: "unavailable" } }
    },
    ping(tabId, milliseconds, signal) {
      return call(tabId, signal, (send, own) => {
        const contract = tabPingMessages()
        const caller = createRpcCaller<TabPingMessages>(send, { build, deadline,
          contract: { ...contract, "bg.ping": { ...contract["bg.ping"], result: (v: unknown): v is TabPing => isTabPing(v) && v.build === build, timeoutMs: milliseconds } } })
        own(caller.dispose)
        return caller.call("bg.ping", {})
      })
    },
    run<J extends Job>(tabId: number, invocation: JobInvocation<J>, milliseconds: number, signal: AbortSignal): Promise<TabReply<JobResult<J>>> {
      return call(tabId, signal, (send, own) => {
        const caller = createRpcCaller<TabJobMessages<J>>(send, { build, deadline, contract: tabJobMessages(invocation, milliseconds) })
        own(caller.dispose)
        return caller.call("bg.job", invocation)
      })
    },
    view<View extends TabViewScope>(tabId: number, view: View, isView: (value: unknown) => value is View, milliseconds: number, signal: AbortSignal) {
      return call(tabId, signal, (send, own) => {
        const contract = tabMessages(isView)
        const caller = createRpcCaller<TabMessages<View>>(send, { build, deadline,
          contract: { ...contract, "bg.view": { ...contract["bg.view"], timeoutMs: milliseconds } } })
        own(caller.dispose)
        return caller.call("bg.view", view)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const stop of [...active]) stop()
      for (const stop of [...receivers]) stop()
      active.clear()
      receivers.clear()
    }
  }
  async function requester(sender: NativeSender, popupWindowId: unknown): Promise<{ readonly kind: "requester"; readonly req: Requester } | { readonly kind: "unavailable" }> {
    if (disposed) return { kind: "unavailable" }
    const resolved = await resolveSenderOrigin(browser, { sender, popupWindowId })
    if (disposed || resolved.kind === "unavailable") return { kind: "unavailable" }
    const windowId = resolved.kind === "ui" ? resolved.origin.windowId : resolved.windowId
    const incognito = resolved.origin.incognito
    if (resolved.kind === "tab") {
      const current = await get(resolved.origin.tabId)
      if (current.kind !== "tab" || current.tab.site !== resolved.site || current.tab.incognito !== incognito || current.tab.windowId !== windowId) return { kind: "unavailable" }
    }
    try {
      const tabs = await browser.tabs.query({ active: true, windowId })
      if (disposed || tabs.length > 1) return { kind: "unavailable" }
      const first = tabs[0]
      if (!first) return { kind: "requester", req: { windowId, incognito, activeTabId: null } }
      const tab = await facts(first)
      if (!tab || tab.windowId !== windowId || tab.incognito !== incognito || !tab.active) return { kind: "unavailable" }
      return { kind: "requester", req: { windowId, incognito, activeTabId: tab.tabId } }
    } catch { return { kind: "unavailable" } }
  }
  function bindHello<View extends TabViewScope>(tabs: Tabs, producer: TabViewProducer<View>): () => void {
    if (disposed) return () => {}
    const rpc = createRpc<TabHelloMessages<View>, NativeSender>(runtimeTransport(browser.runtime), { build, deadline, contract: tabHelloMessages(producer.isView) })
    let bound = true
    const unbind = rpc.handle({ authenticate: authenticateTab(browser), handlers: {
      async "tab.hello"(hello, context) {
        if (disposed || !bound || hello.site !== context.site || hello.build !== build) return null
        const current = await get(context.origin.tabId)
        if (disposed || !bound || current.kind !== "tab" || current.tab.site !== context.site || current.tab.windowId !== context.windowId || current.tab.incognito !== context.origin.incognito) return null
        const result = await tabs.seen(context.origin.tabId, hello, producer)
        return result.kind === "seen" ? result.view : null
      }
    } })
    const stop = () => { if (!bound) return; bound = false; receivers.delete(stop); unbind(); rpc.dispose() }
    receivers.add(stop)
    return stop
  }
  return { port, requester, bindHello, dispose: port.dispose }
}
