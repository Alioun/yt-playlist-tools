import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import type { Browser } from "wxt/browser"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { objectShape } from "../../shared/contracts/object-shape"
import { CONTRACT_VERSION } from "../../shared/contracts/protocol"
import { isBuildId, type BuildId, type Site } from "../../shared/contracts/vocabulary"
import { createRpc, createRpcCaller, type RpcContract, type Deadline } from "../../shared/rpc/rpc"
import { authenticateTab, authenticateUi, runtimeTransport, tabTarget, timerDeadline, type RuntimePort, type TabContext, type TabsPort, type UiContext } from "./runtime"
import type { NativeSender, SenderPage } from "./sender-origin"

type TabCalls = { "test.hello": { payload: { site: Site }; result: { site: Site; tabId: number; windowId: number; incognito: boolean } } }
type UiCalls = { "test.window": { payload: { windowId: number }; result: { page: SenderPage; windowId: number; incognito: boolean } } }
type NativeTab = { readonly sender: NativeSender; readonly tab: Browser.tabs.Tab; readonly tabId: number; readonly windowId: number }

function buildId(value: string): BuildId {
  if (!isBuildId(value)) throw Error("Invalid test build")
  return value
}

const build = buildId("test-build")
const WWW = "https://www.youtube.com/watch?v=abcdefghijk"
const MUSIC = "https://music.youtube.com/watch?v=abcdefghijk"
const isSite = (value: unknown) => value === "www" || value === "music"
const isNumber = (value: unknown) => typeof value === "number"
const isFlag = (value: unknown) => typeof value === "boolean"
const tabContract: RpcContract<TabCalls> = {
  "test.hello": {
    payload: (value): value is TabCalls["test.hello"]["payload"] => objectShape(value, { site: isSite }),
    result: (value): value is TabCalls["test.hello"]["result"] => objectShape(value, { site: isSite, tabId: isNumber, windowId: isNumber, incognito: isFlag }),
    timeoutMs: 2_000
  }
}
const uiContract: RpcContract<UiCalls> = {
  "test.window": {
    payload: (value): value is UiCalls["test.window"]["payload"] => objectShape(value, { windowId: isNumber }),
    result: (value): value is UiCalls["test.window"]["result"] =>
      objectShape(value, {
        page: page => page === "popup" || page === "settings" || page === "onboarding",
        windowId: isNumber,
        incognito: isFlag
      }),
    timeoutMs: 2_000
  }
}

beforeEach(() => fakeBrowser.reset())
afterEach(() => mock.restore())

const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
const request = (id: string, kind: string, payload: unknown) => ({ v: CONTRACT_VERSION, build, id, kind, payload })
const answer = (id: string, kind: string, result: unknown) => ({ v: CONTRACT_VERSION, build, id, kind, result })
const popup = (): NativeSender => ({ id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") })

async function trigger(message: unknown, sender: NativeSender, sendResponse: (response?: unknown) => void): Promise<readonly unknown[]> {
  return fakeBrowser.runtime.onMessage.trigger(message, sender, sendResponse)
}

async function windowOf(incognito: boolean): Promise<number> {
  const window = await fakeBrowser.windows.create({ incognito })
  if (window?.id === undefined) throw Error("Synthetic window missing ID")
  return window.id
}

async function inTab(url: string, incognito = false): Promise<NativeTab> {
  const windowId = await windowOf(incognito)
  const created = await fakeBrowser.tabs.create({ windowId, url })
  if (created.id === undefined) throw Error("Synthetic tab missing ID")
  const tab = { ...created, windowId, incognito }
  return { sender: { id: fakeBrowser.runtime.id, frameId: 0, url, tab }, tab, tabId: created.id, windowId }
}

async function deliver(message: unknown, sender: NativeSender) {
  const responses: unknown[] = []
  let answered!: () => void
  const response = new Promise<void>(resolve => {
    answered = resolve
  })
  const claims: readonly unknown[] = await trigger(message, sender, value => {
    responses.push(value)
    answered()
  })
  if (claims.includes(true)) await response
  await wait()
  return { claims, responses }
}

function tabReceiver() {
  const handled: TabContext[] = []
  const rpc = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: tabContract, deadline: timerDeadline })
  rpc.handle({
    authenticate: authenticateTab(fakeBrowser),
    handlers: {
      "test.hello": (_payload, context) => {
        handled.push(context)
        return { site: context.site, tabId: context.origin.tabId, windowId: context.windowId, incognito: context.origin.incognito }
      }
    }
  })
  return { rpc, handled }
}

function uiReceiver() {
  const handled: UiContext[] = []
  const rpc = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: uiContract, deadline: timerDeadline })
  rpc.handle({
    authenticate: authenticateUi<UiCalls>(fakeBrowser, ({ payload }) => payload.windowId),
    handlers: {
      "test.window": (_payload, context) => {
        handled.push(context)
        return { page: context.page, windowId: context.origin.windowId, incognito: context.origin.incognito }
      }
    }
  })
  return { rpc, handled }
}

test("a claimed tab request returns literal true and answers its exact envelope once through sendResponse", async () => {
  const { handled } = tabReceiver()
  const www = await inTab(WWW)
  const { claims, responses } = await deliver(request("7", "test.hello", { site: "www" }), www.sender)
  expect(claims).toEqual([true])
  expect(claims[0]).toBe(true)
  expect(responses).toEqual([answer("7", "test.hello", { site: "www", tabId: www.tabId, windowId: www.windowId, incognito: false })])
  expect(handled).toEqual([{ kind: "tab", site: "www", origin: { kind: "tab", tabId: www.tabId, incognito: false }, windowId: www.windowId }])
})

test("tab authentication exposes the native site, tab, window and privacy of www and Music tabs", async () => {
  const { handled } = tabReceiver()
  const www = await inTab(WWW)
  const music = await inTab(MUSIC, true)
  expect((await deliver(request("1", "test.hello", { site: "music" }), www.sender)).responses).toEqual([
    answer("1", "test.hello", { site: "www", tabId: www.tabId, windowId: www.windowId, incognito: false })
  ])
  expect((await deliver(request("2", "test.hello", { site: "www" }), music.sender)).responses).toEqual([
    answer("2", "test.hello", { site: "music", tabId: music.tabId, windowId: music.windowId, incognito: true })
  ])
  expect(handled.map(context => [context.site, context.origin.incognito])).toEqual([
    ["www", false],
    ["music", true]
  ])
})

test("UI authentication admits the popup's natively verified window, settings and the first-run page", async () => {
  const { handled } = uiReceiver()
  const normal = await windowOf(false)
  const privateWindow = await windowOf(true)
  const settings = await inTab(fakeBrowser.runtime.getURL("/options.html"), true)
  const firstRun = await inTab(fakeBrowser.runtime.getURL("/onboarding.html"))
  const cases = [
    { sender: popup(), windowId: normal, result: { page: "popup", windowId: normal, incognito: false } },
    { sender: popup(), windowId: privateWindow, result: { page: "popup", windowId: privateWindow, incognito: true } },
    { sender: settings.sender, windowId: normal, result: { page: "settings", windowId: settings.windowId, incognito: true } },
    { sender: firstRun.sender, windowId: privateWindow, result: { page: "onboarding", windowId: firstRun.windowId, incognito: false } }
  ]
  for (const [index, { sender, windowId, result }] of cases.entries()) {
    const id = String(index + 1)
    const { claims, responses } = await deliver(request(id, "test.window", { windowId }), sender)
    expect(claims).toEqual([true])
    expect(responses).toEqual([answer(id, "test.window", result)])
  }
  for (const windowId of [normal + 1_000, -1, 0.5]) {
    expect((await deliver(request("9", "test.window", { windowId }), popup())).responses).toStrictEqual([undefined])
  }
  expect(handled.map(context => context.page)).toEqual(["popup", "popup", "settings", "onboarding"])
})

test("each authenticator rejects the other kind of native caller before any handler runs", async () => {
  const tabs = tabReceiver()
  const ui = uiReceiver()
  const www = await inTab(WWW)
  const music = await inTab(MUSIC)
  const settings = await inTab(fakeBrowser.runtime.getURL("/options.html"))
  const firstRun = await inTab(fakeBrowser.runtime.getURL("/onboarding.html"))
  for (const sender of [popup(), settings.sender, firstRun.sender]) {
    expect(await deliver(request("1", "test.hello", { site: "www" }), sender)).toStrictEqual({ claims: [true, false], responses: [undefined] })
  }
  for (const sender of [www.sender, music.sender]) {
    expect(await deliver(request("2", "test.window", { windowId: www.windowId }), sender)).toStrictEqual({ claims: [false, true], responses: [undefined] })
  }
  expect(tabs.handled).toEqual([])
  expect(ui.handled).toEqual([])
})

test("foreign IDs, URL tricks, subframes and inconsistent window facts are rejected with an undefined answer", async () => {
  const tabs = tabReceiver()
  const ui = uiReceiver()
  const www = await inTab(WWW)
  const settings = await inTab(fakeBrowser.runtime.getURL("/options.html"))
  const firstRun = await inTab(fakeBrowser.runtime.getURL("/onboarding.html"))
  const missingWindow = { ...settings.tab }
  Object.assign(missingWindow, { windowId: undefined })
  const forgedTabs: NativeSender[] = [
    { ...www.sender, id: "foreign-extension" },
    { ...www.sender, id: undefined },
    { ...www.sender, frameId: 2 },
    { ...www.sender, frameId: undefined },
    { ...www.sender, url: "https://www.youtube.com.evil.invalid/" },
    { ...www.sender, url: "https://music.youtube.com.evil.invalid/" },
    { ...www.sender, url: "https://music.youtube.com@evil.invalid/" },
    { ...www.sender, url: "http://music.youtube.com/" },
    { ...www.sender, url: "https://youtube.com/" },
    { ...www.sender, url: "https://m.youtube.com/" },
    { ...www.sender, url: undefined },
    { ...www.sender, tab: undefined },
    { ...www.sender, tab: { ...www.tab, id: -1 } },
    { ...www.sender, tab: { ...www.tab, windowId: www.windowId + 1_000 } },
    { ...www.sender, tab: { ...www.tab, incognito: true } }
  ]
  const forgedPages: NativeSender[] = [
    { ...popup(), id: "foreign-extension" },
    { ...popup(), frameId: 1 },
    { ...popup(), tab: settings.tab },
    { ...settings.sender, frameId: 1 },
    { ...firstRun.sender, frameId: undefined },
    { ...firstRun.sender, tab: undefined },
    { ...firstRun.sender, url: `${firstRun.sender.url}?forged=1` },
    { ...firstRun.sender, url: `${firstRun.sender.url}#forged` },
    { ...firstRun.sender, url: fakeBrowser.runtime.getURL("/onboarding.html.forged") },
    { ...firstRun.sender, tab: { ...firstRun.tab, incognito: true } },
    { ...settings.sender, tab: missingWindow }
  ]
  for (const sender of forgedTabs) {
    expect(await deliver(request("1", "test.hello", { site: "www" }), sender)).toStrictEqual({ claims: [true, false], responses: [undefined] })
  }
  for (const sender of forgedPages) {
    expect(await deliver(request("2", "test.window", { windowId: settings.windowId }), sender)).toStrictEqual({ claims: [false, true], responses: [undefined] })
  }
  expect(tabs.handled).toEqual([])
  expect(ui.handled).toEqual([])
})

test("body-supplied Origin, sender, site, privacy and window claims never become authority", async () => {
  const tabs = tabReceiver()
  const ui = uiReceiver()
  const www = await inTab(WWW)
  const settings = await inTab(fakeBrowser.runtime.getURL("/options.html"))
  const privateWindow = await windowOf(true)
  const forgedFields = [{ origin: { kind: "background" } }, { sender: { id: fakeBrowser.runtime.id, frameId: 0 } }, { incognito: true }, { tabId: www.tabId }]
  for (const extra of [...forgedFields, { site: "music" }]) {
    expect(await deliver({ ...request("1", "test.hello", { site: "www" }), ...extra }, www.sender)).toStrictEqual({ claims: [false, false], responses: [] })
  }
  for (const extra of forgedFields) {
    expect(await deliver(request("2", "test.hello", { site: "www", ...extra }), www.sender)).toStrictEqual({ claims: [false, false], responses: [] })
  }
  expect((await deliver(request("3", "test.hello", { site: "music" }), www.sender)).responses).toEqual([
    answer("3", "test.hello", { site: "www", tabId: www.tabId, windowId: www.windowId, incognito: false })
  ])
  expect((await deliver(request("4", "test.window", { windowId: privateWindow }), settings.sender)).responses).toEqual([
    answer("4", "test.window", { page: "settings", windowId: settings.windowId, incognito: false })
  ])
  expect(tabs.handled).toHaveLength(1)
  expect(ui.handled).toHaveLength(1)
})

test("unclaimed messages return literal false and leave the single reply to a legacy listener", async () => {
  const tabs = tabReceiver()
  fakeBrowser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message?.action !== "string") return false
    sendResponse({ legacy: message.action })
    return true
  })
  const www = await inTab(WWW)
  expect(await deliver({ action: "getSession" }, www.sender)).toEqual({ claims: [false, true], responses: [{ legacy: "getSession" }] })
  for (const message of [
    request("1", "test.unknown", {}),
    { ...request("2", "test.hello", { site: "www" }), v: 2 },
    { ...request("3", "test.hello", { site: "www" }), build: "other" },
    "text",
    null
  ]) {
    const { claims } = await deliver(message, www.sender)
    expect(claims).toEqual([false, false])
    expect(claims[0]).toBe(false)
  }
  expect(await fakeBrowser.runtime.sendMessage({ action: "getSession" })).toEqual({ legacy: "getSession" })
  expect(tabs.handled).toEqual([])
})

test("the fake's sender-less delivery is claimed but never authenticated, and no receiver fails as transport", async () => {
  const caller = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: tabContract, deadline: timerDeadline })
  expect(await caller.call("test.hello", { site: "www" })).toEqual({ kind: "failed", failure: "transport" })
  const { rpc, handled } = tabReceiver()
  expect(await caller.call("test.hello", { site: "www" })).toEqual({ kind: "failed", failure: "invalid-answer" })
  expect(handled).toEqual([])
  rpc.dispose()
  expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false)
  expect(await caller.call("test.hello", { site: "www" })).toEqual({ kind: "failed", failure: "transport" })
  caller.dispose()
})

test("a claim that never answers times out through the one-shot deadline and is released by disposal", async () => {
  const quick: RpcContract<TabCalls> = { "test.hello": { ...tabContract["test.hello"], timeoutMs: 5 } }
  const stop = runtimeTransport(fakeBrowser.runtime).listen(() => new Promise(() => {}))
  const caller = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: quick, deadline: timerDeadline })
  expect(await caller.call("test.hello", { site: "www" })).toEqual({ kind: "failed", failure: "timeout" })
  stop()
  expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false)
})

test("a receive that throws declines the message without answering", async () => {
  const sendResponse = mock(() => {})
  runtimeTransport(fakeBrowser.runtime).listen(() => {
    throw Error("Synthetic receive failure")
  })
  expect(await trigger(request("1", "test.hello", { site: "www" }), popup(), sendResponse)).toEqual([false])
  await wait()
  expect(sendResponse).not.toHaveBeenCalled()
})

test("a rejected claim answers undefined once and a throwing sendResponse stays contained", async () => {
  const unhandled: unknown[] = []
  const record = (reason: unknown) => {
    unhandled.push(reason)
  }
  process.on("unhandledRejection", record)
  try {
    const transport = runtimeTransport(fakeBrowser.runtime)
    const stopRejected = transport.listen(() => Promise.reject(Error("Synthetic claim failure")))
    const responses: unknown[] = []
    expect(
      await trigger("message", popup(), value => {
        responses.push(value)
      })
    ).toEqual([true])
    await wait()
    expect(responses).toHaveLength(1)
    expect(responses[0]).toBeUndefined()
    stopRejected()
    transport.listen(() => Promise.resolve("answer"))
    const closedPort = mock(() => {
      throw Error("Synthetic closed port")
    })
    expect(await trigger("message", popup(), closedPort)).toEqual([true])
    await wait()
    expect(closedPort).toHaveBeenCalledTimes(1)
    expect(responses).toHaveLength(1)
    expect(unhandled).toEqual([])
  } finally {
    process.off("unhandledRejection", record)
  }
})

test("disposal removes the listener once, releases open claims as undefined and never publishes late results", async () => {
  const remove = spyOn(fakeBrowser.runtime.onMessage, "removeListener")
  let publish!: (value: unknown) => void
  const stop = runtimeTransport(fakeBrowser.runtime).listen(
    () =>
      new Promise(resolve => {
        publish = resolve
      })
  )
  const responses: unknown[] = []
  expect(
    await trigger("message", popup(), value => {
      responses.push(value)
    })
  ).toEqual([true])
  expect(responses).toEqual([])
  stop()
  expect(responses).toHaveLength(1)
  publish("late")
  await wait()
  stop()
  expect(responses).toHaveLength(1)
  expect(responses[0]).toBeUndefined()
  expect(remove).toHaveBeenCalledTimes(1)
  expect(await trigger("message", popup(), () => {})).toEqual([])
})

test("disposal from inside receive or sendResponse answers once and removes the listener once", async () => {
  const remove = spyOn(fakeBrowser.runtime.onMessage, "removeListener")
  const transport = runtimeTransport(fakeBrowser.runtime)
  let stopInside = () => {}
  stopInside = transport.listen(() => {
    stopInside()
    return Promise.resolve("late")
  })
  const released: unknown[] = []
  expect(
    await trigger("message", popup(), value => {
      released.push(value)
    })
  ).toEqual([true])
  await wait()
  expect(released).toHaveLength(1)
  expect(released[0]).toBeUndefined()
  const stopFromResponse = transport.listen(() => Promise.resolve("answer"))
  const answered: unknown[] = []
  expect(
    await trigger("message", popup(), value => {
      answered.push(value)
      stopFromResponse()
    })
  ).toEqual([true])
  await wait()
  stopFromResponse()
  expect(answered).toEqual(["answer"])
  expect(remove).toHaveBeenCalledTimes(2)
  expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false)
})

test("disposing an RPC endpoint releases an authenticated in-flight request without publishing its late result", async () => {
  let finish!: (result: TabCalls["test.hello"]["result"]) => void
  const handler = mock(
    () =>
      new Promise<TabCalls["test.hello"]["result"]>(resolve => {
        finish = resolve
      })
  )
  const rpc = createRpc(runtimeTransport(fakeBrowser.runtime), { build, contract: tabContract, deadline: timerDeadline })
  rpc.handle({ authenticate: authenticateTab(fakeBrowser), handlers: { "test.hello": handler } })
  const www = await inTab(WWW)
  const responses: unknown[] = []
  expect(
    await trigger(request("1", "test.hello", { site: "www" }), www.sender, value => {
      responses.push(value)
    })
  ).toEqual([true])
  await wait()
  expect(handler).toHaveBeenCalledTimes(1)
  rpc.dispose()
  await wait()
  finish({ site: "www", tabId: www.tabId, windowId: www.windowId, incognito: false })
  await wait()
  expect(responses).toHaveLength(1)
  expect(responses[0]).toBeUndefined()
  expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false)
})

test("a tab target sends every message to frame zero of its tab and returns the native promise unchanged", () => {
  const native = Promise.resolve(answer("1", "test.hello", { site: "www", tabId: 42, windowId: 3, incognito: false }))
  const calls: unknown[][] = []
  const tabs: TabsPort = {
    sendMessage(tabId, message, options) {
      calls.push([tabId, message, options])
      return native
    }
  }
  const target = tabTarget(tabs, 42)
  const message = request("1", "test.hello", { site: "www" })
  expect(target.send(message)).toBe(native)
  expect(target.send("second")).toBe(native)
  expect(calls).toEqual([
    [42, message, { frameId: 0 }],
    [42, "second", { frameId: 0 }]
  ])
  expect(calls[0]?.[1]).toBe(message)
})

test("a tab target preserves native rejections and synchronous failures", async () => {
  const rejection = Error("Synthetic closed tab")
  await expect(tabTarget({ sendMessage: () => Promise.reject(rejection) }, 1).send("message")).rejects.toBe(rejection)
  const thrown = Error("Synthetic synchronous failure")
  expect(() =>
    tabTarget(
      {
        sendMessage: () => {
          throw thrown
        }
      },
      1
    ).send("message")
  ).toThrow(thrown)
  expect(() => tabTarget(fakeBrowser.tabs, 1).send("message")).toThrow()
})

test("a tab target has only send and registers no native listener", () => {
  const add = spyOn(fakeBrowser.runtime.onMessage, "addListener")
  const target = tabTarget({ sendMessage: () => new Promise(() => {}) }, 3)
  void target.send("message")
  expect(Object.keys(target)).toEqual(["send"])
  expect("listen" in target).toBe(false)
  expect(add).not.toHaveBeenCalled()
  expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false)
})

test("the timer deadline expires once and its canceller releases an armed timer exactly once", async () => {
  const clear = spyOn(globalThis, "clearTimeout")
  const expired = mock(() => {})
  const cancelFired = timerDeadline(0, expired)
  await wait(1)
  expect(expired).toHaveBeenCalledTimes(1)
  cancelFired()
  cancelFired()
  expect(clear).not.toHaveBeenCalled()
  const cancelled = mock(() => {})
  const cancel = timerDeadline(0, cancelled)
  cancel()
  cancel()
  await wait(1)
  expect(cancelled).not.toHaveBeenCalled()
  expect(clear).toHaveBeenCalledTimes(1)
})

function nativeCallbacks(sender: NativeSender) {
  type Listener = Parameters<RuntimePort["onMessage"]["addListener"]>[0]
  const listeners = new Set<Listener>()
  const added: Listener[] = []
  const removed: Listener[] = []
  const claims: unknown[][] = []
  const responses: unknown[] = []
  const sent: { tabId: number; message: unknown; options: { readonly frameId: 0 } }[] = []
  function deliver(message: unknown): Promise<unknown> {
    let respond!: (value: unknown) => void
    const response = new Promise<unknown>(resolve => {
      respond = resolve
    })
    const returned: readonly unknown[] = [...listeners].map(listener =>
      listener(message, sender, value => {
        responses.push(value)
        respond(value)
      })
    )
    claims.push([...returned])
    return returned.includes(true) ? response : Promise.resolve(undefined)
  }
  const runtime: RuntimePort = {
    sendMessage: deliver,
    onMessage: {
      addListener(listener) {
        added.push(listener)
        listeners.add(listener)
      },
      removeListener(listener) {
        removed.push(listener)
        listeners.delete(listener)
      }
    }
  }
  const tabs: TabsPort = {
    sendMessage(tabId, message, options) {
      sent.push({ tabId, message, options })
      return deliver(message)
    }
  }
  return { runtime, tabs, deliver, listeners, added, removed, sent, claims, responses }
}

function manualDeadline() {
  const expirations = new Set<() => void>()
  const deadline: Deadline = (_ms, expire) => {
    expirations.add(expire)
    return () => {
      expirations.delete(expire)
    }
  }
  return {
    deadline,
    expirations,
    expire() {
      for (const expire of [...expirations]) expire()
    }
  }
}

test("qualified native caller uses tabTarget without an inbound listener and correlates concurrent exact envelopes", async () => {
  const www = await inTab(WWW)
  const native = nativeCallbacks(www.sender)
  const pending = new Map<Site, (result: TabCalls["test.hello"]["result"]) => void>()
  const receiver = createRpc(runtimeTransport(native.runtime), { build, contract: tabContract, deadline: timerDeadline })
  receiver.handle({
    authenticate: authenticateTab(fakeBrowser),
    handlers: {
      "test.hello": ({ site }) =>
        new Promise(resolve => {
          pending.set(site, resolve)
        })
    }
  })
  const target = tabTarget(native.tabs, www.tabId)
  expect(Object.keys(target)).toEqual(["send"])
  const caller = createRpcCaller(target, { build, contract: tabContract, deadline: timerDeadline })
  expect(native.added).toHaveLength(1)
  const first = caller.call("test.hello", { site: "www" })
  const second = caller.call("test.hello", { site: "music" })
  await wait()
  expect(native.claims).toStrictEqual([[true], [true]])
  expect(native.sent).toStrictEqual([
    { tabId: www.tabId, message: request("1", "test.hello", { site: "www" }), options: { frameId: 0 } },
    { tabId: www.tabId, message: request("2", "test.hello", { site: "music" }), options: { frameId: 0 } }
  ])
  const result = { site: "www", tabId: www.tabId, windowId: www.windowId, incognito: false } satisfies TabCalls["test.hello"]["result"]
  pending.get("music")?.(result)
  expect(await second).toStrictEqual({ kind: "answered", result })
  pending.get("www")?.(result)
  expect(await first).toStrictEqual({ kind: "answered", result })
  expect(native.responses).toStrictEqual([answer("2", "test.hello", result), answer("1", "test.hello", result)])
  caller.dispose()
  caller.dispose()
  expect(native.added).toHaveLength(1)
  expect(native.removed).toHaveLength(0)
  receiver.dispose()
  receiver.dispose()
  expect(native.removed).toStrictEqual(native.added)
  expect(native.listeners.size).toBe(0)
})

test("native callbacks require literal true while unrelated maps decline and synchronous responses work", async () => {
  const www = await inTab(WWW)
  const native = nativeCallbacks(www.sender)
  const runtime = runtimeTransport(native.runtime)
  const receiver = createRpc(runtime, { build, contract: uiContract, deadline: timerDeadline })
  receiver.handle({
    authenticate: authenticateUi<UiCalls>(fakeBrowser, ({ payload }) => payload.windowId),
    handlers: {
      "test.window": () => {
        throw Error("Unrelated handler ran")
      }
    }
  })
  const result = { site: "www", tabId: www.tabId, windowId: www.windowId, incognito: false } satisfies TabCalls["test.hello"]["result"]
  native.runtime.onMessage.addListener((message, _sender, respond) => {
    if (!objectShape(message, { v: v => v === 1, build: v => v === build, id: v => v === "1", kind: v => v === "test.hello", payload: () => true })) return false
    respond(answer("1", "test.hello", result))
    return true
  })
  const caller = createRpcCaller(tabTarget(native.tabs, www.tabId), { build, contract: tabContract, deadline: timerDeadline })
  expect(await caller.call("test.hello", { site: "www" })).toStrictEqual({ kind: "answered", result })
  expect(native.claims).toStrictEqual([[false, true]])
  expect(native.responses).toStrictEqual([answer("1", "test.hello", result)])
  caller.dispose()
  receiver.dispose()
  for (const listener of [...native.listeners]) native.runtime.onMessage.removeListener(listener)
  expect(native.removed).toStrictEqual(native.added)
})

test("qualified tab callers never retry rejection, synchronous throw, lost delivery, timeout or disposal", async () => {
  for (const mode of ["reject", "throw", "lost", "unclaimed", "dispose"] as const) {
    const time = manualDeadline()
    const send = mock((_tabId: number, _message: unknown, _options: { readonly frameId: 0 }): Promise<unknown> => {
      if (mode === "reject") return Promise.reject(Error("Synthetic lost delivery"))
      if (mode === "throw") throw Error("Synthetic synchronous failure")
      if (mode === "unclaimed") return Promise.resolve(undefined)
      return new Promise(() => {})
    })
    const add = spyOn(fakeBrowser.runtime.onMessage, "addListener")
    const caller = createRpcCaller(tabTarget({ sendMessage: send }, 42), { build, contract: tabContract, deadline: time.deadline })
    const pending = caller.call("test.hello", { site: "www" })
    if (mode === "lost") time.expire()
    if (mode === "dispose") caller.dispose()
    const failure = mode === "lost" ? "timeout" : mode === "dispose" ? "disposed" : mode === "unclaimed" ? "invalid-answer" : "transport"
    expect(await pending).toStrictEqual({ kind: "failed", failure })
    caller.dispose()
    expect(await caller.call("test.hello", { site: "www" })).toStrictEqual({ kind: "failed", failure: "disposed" })
    expect(send.mock.calls).toStrictEqual([[42, request("1", "test.hello", { site: "www" }), { frameId: 0 }]])
    expect(time.expirations.size).toBe(0)
    expect(add).not.toHaveBeenCalled()
    add.mockRestore()
  }
})

test("native receiver disposal and late publication cannot change the qualified caller result", async () => {
  const www = await inTab(WWW)
  const native = nativeCallbacks(www.sender)
  let finish!: (value: TabCalls["test.hello"]["result"]) => void
  const receiver = createRpc(runtimeTransport(native.runtime), { build, contract: tabContract, deadline: timerDeadline })
  receiver.handle({
    authenticate: authenticateTab(fakeBrowser),
    handlers: {
      "test.hello": () =>
        new Promise(resolve => {
          finish = resolve
        })
    }
  })
  const caller = createRpcCaller(tabTarget(native.tabs, www.tabId), { build, contract: tabContract, deadline: timerDeadline })
  const pending = caller.call("test.hello", { site: "www" })
  await wait()
  receiver.dispose()
  expect(await pending).toStrictEqual({ kind: "failed", failure: "invalid-answer" })
  finish({ site: "www", tabId: www.tabId, windowId: www.windowId, incognito: false })
  await wait()
  expect(native.responses).toStrictEqual([undefined])
  expect(native.claims).toStrictEqual([[true]])
  expect(native.removed).toStrictEqual(native.added)
  expect(native.listeners.size).toBe(0)
  expect(native.sent).toHaveLength(1)
  caller.dispose()
})

test("authenticators ignore forged body origin and account even when a body is supplied directly", async () => {
  const www = await inTab(WWW)
  const forged = {
    sender: { ...www.sender, id: "foreign-extension" },
    request: { kind: "test.hello", payload: { site: "music", origin: www.sender, account: "synthetic-account" } }
  }
  expect(await authenticateTab(fakeBrowser)(forged)).toStrictEqual({ kind: "rejected" })
  const ui = authenticateUi<UiCalls>(fakeBrowser, ({ payload }) => payload.windowId)
  expect(
    await ui({
      sender: www.sender,
      request: { kind: "test.window", payload: { windowId: www.windowId } }
    })
  ).toStrictEqual({ kind: "rejected" })
  expect(await authenticateTab(fakeBrowser)({ sender: popup() })).toStrictEqual({ kind: "rejected" })
})

test("qualified caller disposal and timeout ignore native answers that arrive later", async () => {
  for (const terminal of ["dispose", "timeout"] as const) {
    let finish!: (value: unknown) => void
    const send = mock(
      () =>
        new Promise<unknown>(resolve => {
          finish = resolve
        })
    )
    const time = manualDeadline()
    const caller = createRpcCaller(tabTarget({ sendMessage: send }, 42), { build, contract: tabContract, deadline: time.deadline })
    const pending = caller.call("test.hello", { site: "www" })
    if (terminal === "dispose") caller.dispose()
    else time.expire()
    const expected = { kind: "failed", failure: terminal === "dispose" ? "disposed" : "timeout" } satisfies { kind: "failed"; failure: "disposed" | "timeout" }
    expect(await pending).toStrictEqual(expected)
    finish(answer("1", "test.hello", { site: "www", tabId: 42, windowId: 3, incognito: false }))
    await wait()
    expect(await pending).toStrictEqual(expected)
    expect(send).toHaveBeenCalledTimes(1)
    expect(time.expirations.size).toBe(0)
    caller.dispose()
  }
})
