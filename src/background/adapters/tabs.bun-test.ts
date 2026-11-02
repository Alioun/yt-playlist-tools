import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { createBrowserTabs } from "./tabs"
import { a, b, build, fixtureView, isFixtureView, manualClock, nativeTab, settle, signedIn, tabsFixture } from "../../../tools/fixtures/tabs/harness"
import { CONTRACT_VERSION } from "../../shared/contracts/protocol"
import { objectShape } from "../../shared/contracts/object-shape"

beforeEach(() => fakeBrowser.reset())
afterEach(() => mock.restore())

async function tab(incognito = false, url = "https://www.youtube.com/watch?v=aaaaaaaaaaa") {
  const window = await fakeBrowser.windows.create({ incognito })
  if (window?.id === undefined) throw Error("Missing fixture window")
  const created = await fakeBrowser.tabs.create({ windowId: window.id, url })
  if (created.id === undefined) throw Error("Missing fixture tab")
  const raw = { ...created, incognito, active: true, windowId: window.id }
  spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => raw)
  return { raw, id: created.id, windowId: window.id }
}
function resultFor(raw: unknown, result: unknown): unknown {
  if (!objectShape(raw, { v: v => v === CONTRACT_VERSION, build: v => v === build, id: v => typeof v === "string", kind: v => typeof v === "string", payload: () => true })) throw Error("Invalid fixture RPC request")
  return { v: raw.v, build: raw.build, id: raw.id, kind: raw.kind, result }
}

test("site queries name the URL filter and discarded exclusion, without listeners or wake calls", async () => {
  const clock = manualClock(), h = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const query = spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [])
  const tabsListener = spyOn(fakeBrowser.tabs.onRemoved, "addListener")
  try {
    expect(await h.port.query("music")).toEqual({ kind: "tabs", tabs: [] })
    expect(query.mock.calls).toEqual<unknown>([[{ url: ["https://music.youtube.com/*"], discarded: false }]])
    expect(tabsListener.mock.calls).toEqual([])
  } finally { h.dispose() }
})

test("privacy and site come from native get and window facts", async () => {
  const made = await tab(true, "https://music.youtube.com/watch?v=aaaaaaaaaaa"), clock = manualClock()
  const h = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  try {
    expect(await h.port.get(made.id)).toEqual({ kind: "tab", tab: {
      tabId: made.id, windowId: made.windowId, incognito: true, site: "music", lastAccessed: made.raw.lastAccessed ?? 0,
      active: true, discarded: made.raw.discarded ?? false, frozen: false
    } })
    const window = await fakeBrowser.windows.get(made.windowId)
    spyOn(fakeBrowser.windows, "get").mockImplementation(async () => ({ ...window, incognito: false }))
    expect(await h.port.get(made.id)).toEqual({ kind: "unavailable" })
  } finally { h.dispose() }
})

test("one-shot RPC sends to frame zero and retains a typed gateway failure", async () => {
  const made = await tab(), clock = manualClock(), h = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const send = spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(async (_id, message) => resultFor(message, { ok: false, reason: "accountChanged" }))
  const listen = spyOn(fakeBrowser.runtime.onMessage, "addListener")
  try {
    const invocation = { job: { kind: "playlists" }, acct: a } as const
    expect(await h.port.run(made.id, invocation, 30_000, new AbortController().signal)).toEqual({ kind: "answered", result: { ok: false, reason: "accountChanged" } })
    expect(send.mock.calls).toEqual<unknown>([[made.id, { v: CONTRACT_VERSION, build, id: "1", kind: "bg.job", payload: invocation }, { frameId: 0 }]])
    expect(listen.mock.calls).toEqual([])
    expect(clock.pending).toBe(0)
  } finally { h.dispose() }
})

test("an absent endpoint and an invalid or wrong-build ping never become success", async () => {
  const made = await tab(), clock = manualClock(), h = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const send = spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(async () => undefined)
  try {
    expect(await h.port.ping(made.id, 2_000, new AbortController().signal)).toEqual({ kind: "failed", failure: "invalid-answer" })
    send.mockImplementation(async (_id, message) => resultFor(message, { site: "www", build: "other-build", acct: a, signedIn: true }))
    expect(await h.port.ping(made.id, 2_000, new AbortController().signal)).toEqual({ kind: "failed", failure: "invalid-answer" })
    send.mockImplementation(async (_id, message) => resultFor(message, { site: "www", build, acct: b, signedIn: true }))
    expect(await h.port.ping(made.id, 2_000, new AbortController().signal)).toEqual({ kind: "answered", result: { site: "www", build, acct: b, signedIn: true } })
    expect(send).toHaveBeenCalledTimes(3)
  } finally { h.dispose() }
})

test("transport loss is reported once, and confirmed absence is separately gone", async () => {
  const made = await tab(), clock = manualClock(), h = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const send = spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(async () => { throw Error("Synthetic response lost") })
  try {
    const invocation = { job: { kind: "playlists" }, acct: a } as const
    expect(await h.port.run(made.id, invocation, 30_000, new AbortController().signal)).toEqual({ kind: "failed", failure: "transport" })
    expect(send).toHaveBeenCalledTimes(1)
    spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => { throw Error("Synthetic get failure") })
    spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [])
    expect(await h.port.run(made.id, invocation, 30_000, new AbortController().signal)).toEqual({ kind: "gone" })
    expect(send).toHaveBeenCalledTimes(2)
  } finally { h.dispose() }
})

test("an aborted call and disposal settle callers without registering receiving endpoints", async () => {
  const clock = manualClock(), h = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const send = spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(() => new Promise(() => {}))
  const listen = spyOn(fakeBrowser.runtime.onMessage, "addListener")
  const abort = new AbortController()
  const first = h.port.ping(1, 2_000, abort.signal)
  abort.abort()
  expect(await first).toEqual({ kind: "failed", failure: "disposed" })
  const second = h.port.ping(2, 2_000, new AbortController().signal)
  h.dispose()
  expect(await second).toEqual({ kind: "failed", failure: "disposed" })
  expect(clock.pending).toBe(0)
  expect(listen.mock.calls).toEqual([])
  expect(send).toHaveBeenCalledTimes(2)
  expect(await h.port.view(1, { acct: a, signedIn: true, private: false, build, fixture: "account-scoped" }, isFixtureView, 2_000, new AbortController().signal)).toEqual({ kind: "failed", failure: "disposed" })
})

test("popup privacy requires its own sender identity and a verified native window", async () => {
  const made = await tab(true), clock = manualClock(), h = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [made.raw])
  try {
    const sender = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }
    expect(await h.requester(sender, made.windowId)).toEqual({ kind: "requester", req: { windowId: made.windowId, incognito: true, activeTabId: made.id } })
    expect(await h.requester({ ...sender, id: "another-extension" }, made.windowId)).toEqual({ kind: "unavailable" })
    expect(await h.requester({ ...sender, url: "https://www.youtube.com/" }, made.windowId)).toEqual({ kind: "unavailable" })
  } finally { h.dispose() }
})

test("hello binds authenticated frame-zero sender facts to the actual engine and concrete producer", async () => {
  const made = await tab(), clock = manualClock(), adapter = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const h = tabsFixture()
  h.seedTab(nativeTab(made.id, { windowId: made.windowId }), signedIn())
  const unbind = adapter.bindHello(h.engine, fixtureView)
  const sender = { id: fakeBrowser.runtime.id, frameId: 0, url: made.raw.url, tab: made.raw }
  try {
    const replies: unknown[] = []
    const payload = { ...signedIn(), hidden: true, fresh: true }
    expect(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: "hello-1", kind: "tab.hello", payload }, sender, value => replies.push(value))).toEqual<unknown>([true])
    await settle()
    expect(replies).toEqual([{ v: CONTRACT_VERSION, build, id: "hello-1", kind: "tab.hello", result: { private: false, build, fixture: "account-scoped", signedIn: true, acct: a } }])
    const stored = h.stored(), invalid: unknown[] = []
    expect(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: "hello-2", kind: "tab.hello", payload: { ...payload, incognito: true } }, sender, value => invalid.push(value))).toEqual<unknown>([false])
    await settle()
    expect(invalid).toEqual([]); expect(h.stored()).toEqual(stored)
    unbind(); unbind()
    expect(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: "hello-3", kind: "tab.hello", payload }, sender, value => invalid.push(value))).toEqual([])
  } finally { unbind(); adapter.dispose(); await h.dispose() }
})

test("a hello the registry admits is reported as seen with its native tab and account, and a refused one is not", async () => {
  const made = await tab(), clock = manualClock(), adapter = createBrowserTabs(fakeBrowser, { build, deadline: clock.after })
  const h = tabsFixture()
  h.seedTab(nativeTab(made.id, { windowId: made.windowId }), signedIn())
  const seen: unknown[] = []
  const unbind = adapter.bindHello(h.engine, fixtureView, context => seen.push(context))
  const sender = { id: fakeBrowser.runtime.id, frameId: 0, url: made.raw.url, tab: made.raw }
  try {
    const payload = { ...signedIn(), hidden: false, fresh: true }
    await Promise.all(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: "hello-1", kind: "tab.hello", payload }, sender, () => {}))
    await settle()
    expect(seen).toEqual([{ tab: expect.objectContaining({ tabId: made.id, windowId: made.windowId, incognito: false, site: "www" }), info: { site: "www", build, signedIn: true, acct: a } }])
    await Promise.all(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: "hello-2", kind: "tab.hello", payload: { ...payload, build: "other" } }, sender, () => {}))
    await settle()
    expect(seen).toHaveLength(1)
  } finally { unbind(); adapter.dispose(); await h.dispose() }
})
