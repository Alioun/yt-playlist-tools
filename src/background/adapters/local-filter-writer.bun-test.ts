import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { isJsonValue } from "../../shared/contracts/json"
import { createBrowserLocalFilterWriter } from "./local-filter-writer"
import type { LocalFilterWriteResult, SyncAutomaticResult, SyncFlushResult, SyncReceiveKey, SyncReceiveResult } from "../store/local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type NativeBrowser = typeof import("wxt/browser").browser
type ExpectedSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
export type BrowserAdapterProof = Check<Equal<typeof createBrowserLocalFilterWriter, (native: NativeBrowser, options: { onSyncResult: (result: SyncAutomaticResult) => void }) => {
  changeFromSettings(raw: unknown, sender: ExpectedSender): Promise<LocalFilterWriteResult>
  receiveSyncDocument(key: SyncReceiveKey): Promise<SyncReceiveResult>
  flushSync(): Promise<SyncFlushResult>
  startSync(): Promise<void>
  dispose(): Promise<void>
}>>

type NativeSender = Parameters<ReturnType<typeof createBrowserLocalFilterWriter>["changeFromSettings"]>[1]
const key = "doc:filter:AAAAAAAAAAAAAAAA:PL_P"
const request = { acct: "AAAAAAAAAAAAAAAA", playlist: "PL_P", desired: { mode: "deny", on: false }, clearListedChannels: "not-confirmed" }
let sender: NativeSender

beforeEach(async () => {
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (window?.id === undefined) throw Error("Synthetic window missing ID")
  const tab = await fakeBrowser.tabs.create({ windowId: window.id, url: fakeBrowser.runtime.getURL("/options.html") })
  sender = { id: fakeBrowser.runtime.id, frameId: 0, url: fakeBrowser.runtime.getURL("/options.html"), tab }
  await fakeBrowser.storage.local.set({
    schema: 1, device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: false },
    "doc:setup:AAAAAAAAAAAAAAAA": { v: 1, gen: "setup", at: 1, by: "old", data: { autoAdd: [{ pl: "PL_P" }] } },
    [key]: { v: 1, gen: "old", at: 1, by: "old", data: { mode: "deny", on: true, channels: [] } }
  })
})
afterEach(() => mock.restore())

function instrument() {
  const set = spyOn(fakeBrowser.storage.local, "set")
  const originalGet = fakeBrowser.storage.local.get
  const get = spyOn(fakeBrowser.storage.local, "get").mockImplementation(new Proxy(originalGet, {
    apply(target, receiver, args) {
      return Reflect.apply(target, receiver, args).then((items: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(items).filter(([, value]) => value !== undefined)))
    }
  }))
  const syncGet = spyOn(fakeBrowser.storage.sync, "get").mockImplementation(() => { throw Error("Forbidden sync get") })
  const syncSet = spyOn(fakeBrowser.storage.sync, "set").mockImplementation(() => { throw Error("Forbidden sync set") })
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  return { adapter, set, get, syncGet, syncSet }
}

test("synthetic normal native metadata admits only settings and never touches sync", async () => {
  const h = instrument()
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(1)
  const call = h.set.mock.calls[0]?.[0]
  expect(Object.keys(call ?? {})).toEqual([key])
  expect(call).toMatchObject({ [key]: { v: 1, by: "synthetic", data: { mode: "deny", on: false, channels: [] } } })
  const saved: unknown = (await fakeBrowser.storage.local.get<Record<string, unknown>>(key))[key]
  if (!isJsonValue(saved) || !saved || typeof saved !== "object" || Array.isArray(saved)) throw Error("Missing saved envelope")
  expect(typeof saved.gen).toBe("string")
  expect(saved.gen).not.toBe("old")
  expect(Number.isSafeInteger(saved.at)).toBe(true)
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test("synthetic wrong extension, exact page, frame and content-script metadata refuse", async () => {
  const h = instrument()
  const invalid = { kind: "result", result: { refused: "invalid" } } as const
  for (const forged of [
    { ...sender, id: "another-extension" }, { ...sender, id: undefined },
    { ...sender, frameId: 1 }, { ...sender, frameId: undefined },
    { ...sender, url: "https://www.youtube.com/watch?v=synthetic" },
    { ...sender, url: sender.url + "?forged=1" }, { ...sender, url: sender.url + "#forged" },
    { ...sender, url: fakeBrowser.runtime.getURL("/popup.html") }, { ...sender, tab: undefined }
  ]) expect(await h.adapter.changeFromSettings(request, forged)).toEqual(invalid)
  expect(h.get).not.toHaveBeenCalled()
  expect(h.set).not.toHaveBeenCalled()
})

test("synthetic private or unknown sender/window facts fail closed", async () => {
  const h = instrument(), privateResult = { kind: "result", result: { refused: "private" } } as const
  if (!sender.tab) throw Error("Missing synthetic tab")
  for (const patch of [{ incognito: true }, { incognito: undefined }, { windowId: undefined }, { windowId: -1 }, { windowId: 1.2 }]) {
    const tab = { ...sender.tab }
    Object.assign(tab, patch)
    expect(await h.adapter.changeFromSettings(request, { ...sender, tab })).toEqual(privateResult)
  }
  const originalWindow = await fakeBrowser.windows.get(sender.tab.windowId)
  const getWindow = spyOn(fakeBrowser.windows, "get")
  for (const patch of [{ incognito: true }, { incognito: undefined }, { id: undefined }, { id: originalWindow.id! + 1 }]) {
    const window = { ...originalWindow }
    Object.assign(window, patch)
    getWindow.mockImplementation(async () => window)
    expect(await h.adapter.changeFromSettings(request, sender)).toEqual(privateResult)
  }
  getWindow.mockImplementation(async () => { throw Error("Window closed") })
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual(privateResult)
  expect(h.get).not.toHaveBeenCalled()
  expect(h.set).not.toHaveBeenCalled()
})

test("synthetic payload cannot forge origin, source, background or native privacy", async () => {
  const h = instrument()
  let getterCalls = 0
  const accessor = Object.defineProperty({ ...request }, "incognito", { enumerable: true, get() { getterCalls++; return false } })
  const sparse = new Array(1)
  for (const raw of [
    null, [], {}, accessor, { ...request, origin: { kind: "background" } },
    { ...request, incognito: false }, { ...request, background: true }, { ...request, source: "sync" },
    { ...request, windowId: 1 }, { ...request, acct: "bad" }, { ...request, playlist: "?" },
    { ...request, desired: { mode: "off", on: false } }, { ...request, desired: { mode: "deny", on: 0 } },
    { ...request, desired: { mode: "deny", on: false, extra: null } }, { ...request, desired: sparse },
    { ...request, clearListedChannels: "confirmed" }, { ...request, expectedGeneration: null },
    { ...request, clearListedChannels: "confirmed", expectedGeneration: 2 }
  ]) expect(await h.adapter.changeFromSettings(raw, sender)).toEqual({ kind: "result", result: { refused: "invalid" } })
  expect(getterCalls).toBe(0)
  expect(h.get).not.toHaveBeenCalled()
  expect(h.set).not.toHaveBeenCalled()
})

test("synthetic confirmed request has strict narrow union", async () => {
  const h = instrument()
  expect(await h.adapter.changeFromSettings({ ...request, clearListedChannels: "confirmed", expectedGeneration: "old" }, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(1)
})

test("synthetic adapter propagates native local IO rejection without retry", async () => {
  const h = instrument(), marker = new Error("native write failure")
  h.set.mockImplementationOnce(async () => { throw marker })
  await expect(h.adapter.changeFromSettings(request, sender)).rejects.toBe(marker)
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(2)
})

test("synthetic sync history stays unavailable with zero sync calls", async () => {
  await fakeBrowser.storage.local.set({ sync: { joined: null } })
  const h = instrument()
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "unavailable", reason: "sync-writer-required" })
  expect(h.set).not.toHaveBeenCalled()
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test("synthetic supported off history batches with unchanged native provenance", async () => {
  const sync = { joined: null, pushed: { opaque: "old-push" }, status: "off", editedSinceOff: false, future: { keep: true } }
  await fakeBrowser.storage.local.set({ sync })
  const h = instrument()
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(1)
  expect(Object.keys(h.set.mock.calls[0]?.[0] ?? {})).toEqual([key, "sync"])
  expect(h.set.mock.calls[0]?.[0]).toMatchObject({ sync: { ...sync, editedSinceOff: true } })
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(1)
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test("synthetic false history remains inert for private provenance and failed batches", async () => {
  const sync = { joined: "joined", pushed: {}, status: "off", editedSinceOff: false }
  await fakeBrowser.storage.local.set({ sync })
  const h = instrument(), marker = new Error("batch rejected")
  if (!sender.tab) throw Error("Missing synthetic tab")
  expect(await h.adapter.changeFromSettings(request, { ...sender, tab: { ...sender.tab, incognito: true } })).toEqual({ kind: "result", result: { refused: "private" } })
  expect(h.get).not.toHaveBeenCalled()
  expect(h.set).not.toHaveBeenCalled()
  h.set.mockImplementationOnce(async () => { throw marker })
  await expect(h.adapter.changeFromSettings(request, sender)).rejects.toBe(marker)
  expect(h.set).toHaveBeenCalledTimes(1)
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual(sync)
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(2)
  expect(Object.keys(h.set.mock.calls[1]?.[0] ?? {})).toEqual([key, "sync"])
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test("synthetic joined adapter reads native null snapshots lazily and writes only Filter", async () => {
  const rawSync = { joined: "history", pushed: { [key]: "old" }, status: "ok", editedSinceOff: true, future: true }
  const before = await fakeBrowser.storage.local.get(null)
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }, sync: rawSync })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "history", created: 0 }, [key.replace("doc:", "s:")]: before[key], unknown: true })
  const get = spyOn(fakeBrowser.storage.local, "get"), set = spyOn(fakeBrowser.storage.local, "set")
  const syncGet = spyOn(fakeBrowser.storage.sync, "get"), syncSet = spyOn(fakeBrowser.storage.sync, "set")
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  expect(syncGet).not.toHaveBeenCalled()
  expect(get).not.toHaveBeenCalled()
  expect(await adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect<unknown>(get.mock.calls).toEqual([[["schema", "device", "sync", "doc:setup:AAAAAAAAAAAAAAAA", key]], [null]])
  expect<unknown>(syncGet.mock.calls).toEqual([[null]])
  expect(set).toHaveBeenCalledTimes(1)
  expect(Object.keys(set.mock.calls[0]?.[0] ?? {})).toEqual([key])
  expect(syncSet).not.toHaveBeenCalled()
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual(rawSync)
})

test("synthetic joined sync-read rejection propagates and recovers without writes", async () => {
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true },
    sync: { joined: "history", pushed: {}, status: "ok", editedSinceOff: false } })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "history", created: 0 } })
  const marker = Error("native sync read"), get = spyOn(fakeBrowser.storage.sync, "get"), set = spyOn(fakeBrowser.storage.local, "set")
  get.mockImplementationOnce(async () => { throw marker })
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  await expect(adapter.changeFromSettings(request, sender)).rejects.toBe(marker)
  expect(set).not.toHaveBeenCalled()
  expect(await adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(set).toHaveBeenCalledTimes(1)
})

test("synthetic manual flush forwards native object and string items on the same adapter", async () => {
  const setup = "doc:setup:AAAAAAAAAAAAAAAA", base = key.replace("doc:", "s:")
  const before = await fakeBrowser.storage.local.get(null)
  const history = { joined: "H", pushed: { [key]: "old", [setup]: "setup" }, status: "ok", editedSinceOff: false, future: { keep: true } }
  const g1 = { v: 1, gen: "g1", at: 10, by: "synthetic", data: { mode: "deny", on: false, channels: [] } }
  const settings = { v: 1, gen: "settings-pending", at: 1, by: "old", data: { future: "x".repeat(9000) } }
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }, sync: history, [key]: g1, "doc:settings": settings })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "H", created: 0 }, [base]: before[key], [setup.replace("doc:", "s:")]: before[setup] })
  const get = spyOn(fakeBrowser.storage.sync, "get"), set = spyOn(fakeBrowser.storage.sync, "set"), localSet = spyOn(fakeBrowser.storage.local, "set")
  let monotonic = 0
  spyOn(performance, "now").mockImplementation(() => monotonic)
  spyOn(Date, "now").mockReturnValue(1000000)
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  expect(get).not.toHaveBeenCalled()
  expect(set).not.toHaveBeenCalled()
  expect((await adapter.flushSync()).kind).toBe("deferred")
  expect<unknown>(get.mock.calls).toEqual([[null]])
  get.mockClear()
  monotonic = 5000
  expect((await adapter.flushSync()).kind).toBe("pushed")
  const prefix = '{"v":1,"gen":"settings-pending","at":1,"by":"old","data":{"future":"'
  expect<unknown>(set.mock.calls).toEqual([[{ [base]: g1, "s:settings": { v: 1, gen: "settings-pending", at: 1, by: "old", n: 2 },
    "s:settings@settings-pending.0": prefix + "x".repeat(8072), "s:settings@settings-pending.1": "x".repeat(928) + '"}}' }]])
  expect<unknown>(get.mock.calls).toEqual([[null], [null], [null]])
  expect<unknown>(localSet.mock.calls).toEqual([[{ sync: { ...history, opaqueWrite: { gate: { kind: "pending", notBefore: 1060000 }, diagnostic: null } } }], [{ sync: { ...history, pushed: { ...history.pushed, [key]: "g1", "doc:settings": "settings-pending" } } }]])
  expect(await adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(set).toHaveBeenCalledTimes(1)
  expect(await adapter.flushSync()).toEqual({ kind: "idle" })
}, 10000)

test("synthetic off manual flush retains zero native sync access", async () => {
  const h = instrument()
  expect(await h.adapter.flushSync()).toEqual({ kind: "idle" })
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
  expect(h.set).not.toHaveBeenCalled()
})


test("synthetic off start is lazy and dispose rejects later work", async () => {
  const h = instrument(), subscribe = spyOn(fakeBrowser.storage.sync.onChanged, "addListener")
  await h.adapter.startSync(); await h.adapter.startSync()
  expect(subscribe).not.toHaveBeenCalled()
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
  await h.adapter.dispose()
  await expect(h.adapter.startSync()).rejects.toThrow("Writer disposed")
  await expect(h.adapter.flushSync()).rejects.toThrow("Writer disposed")
})

test("synthetic active start owns one area listener forwards original automatic errors and never restarts", async () => {
  const before = await fakeBrowser.storage.local.get(null)
  const rawSync = { joined: "H", pushed: { [key]: "old", "doc:setup:AAAAAAAAAAAAAAAA": "setup" }, status: "ok", editedSinceOff: false }
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }, sync: rawSync })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "H", created: 0 }, [key.replace("doc:", "s:")]: before[key], "s:setup:AAAAAAAAAAAAAAAA": before["doc:setup:AAAAAAAAAAAAAAAA"] })
  const subscribe = spyOn(fakeBrowser.storage.sync.onChanged, "addListener"), unsubscribe = spyOn(fakeBrowser.storage.sync.onChanged, "removeListener")
  const get = spyOn(fakeBrowser.storage.sync, "get"), marker = { opaque: "native preflight" }, results: SyncAutomaticResult[] = []
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult(result) { results.push(result) } })
  expect(subscribe).not.toHaveBeenCalled()
  await adapter.startSync(); await adapter.startSync()
  expect(subscribe).toHaveBeenCalledTimes(1)
  expect(results.map(result => result.kind)).toEqual(["idle", "idle"])
  get.mockImplementationOnce(async () => { throw marker })
  await adapter.startSync()
  expect(results.at(-1)).toEqual({ kind: "rejected", error: marker })
  const last = results.at(-1)
  expect(last && "error" in last && last.error).toBe(marker)
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  const count = get.mock.calls.length
  await adapter.startSync()
  expect(get).toHaveBeenCalledTimes(count)
  expect(subscribe).toHaveBeenCalledTimes(1)
  await adapter.dispose()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})

test("manual receive forwards raw native storage on the existing adapter owner", async () => {
  const target = { acct: "AAAAAAAAAAAAAAAA", playlist: "PL_P" }
  const { isAccountKey, isPlaylistId } = await import("../../shared/model")
  if (!isAccountKey(target.acct) || !isPlaylistId(target.playlist)) throw Error("Invalid synthetic key")
  const addressed = { kind: "filter", acct: target.acct, playlist: target.playlist } as const
  const setup = "doc:setup:AAAAAAAAAAAAAAAA", before = await fakeBrowser.storage.local.get(null)
  const incoming = JSON.parse('{"v":1,"gen":"incoming","at":20,"by":"other","extra":true,"data":{"mode":"allow","on":false,"channels":[["UCaaaaaaaaaaaaaaaaaaaaaa","Title",null,{"future":1}]]},"__proto__":{"keep":true},"toJSON":"inert"}')
  const history = { joined: "h", pushed: { [key]: "old", [setup]: "setup" }, status: "ok", editedSinceOff: false, extra: true }
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }, sync: history })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "h", created: 1 }, [key.replace("doc:", "s:")]: before[key], [setup.replace("doc:", "s:")]: before[setup] })
  const get = spyOn(fakeBrowser.storage.local, "get"), syncGet = spyOn(fakeBrowser.storage.sync, "get"), syncSet = spyOn(fakeBrowser.storage.sync, "set")
  const original = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local), set = spyOn(fakeBrowser.storage.local, "set")
  const subscribe = spyOn(fakeBrowser.storage.sync.onChanged, "addListener"), results: SyncAutomaticResult[] = []
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult(result) { results.push(result) } })
  await adapter.startSync()
  const snapshot = await fakeBrowser.storage.sync.get(null)
  syncGet.mockImplementation(async () => ({ ...snapshot, [key.replace("doc:", "s:")]: incoming }))
  expect(subscribe).toHaveBeenCalledTimes(1)
  let release!: () => void, entered = false, settled = false
  const gate = new Promise<void>(done => { release = done })
  set.mockImplementationOnce(async items => { entered = true; await gate; await original(items) })
  const receive = adapter.receiveSyncDocument(addressed); void receive.then(() => { settled = true })
  for (let i = 0; i < 60; i++) await Promise.resolve()
  expect(entered).toBe(true)
  const reads = get.mock.calls.length, remoteReads = syncGet.mock.calls.length
  const stale = adapter.changeFromSettings({ ...request, clearListedChannels: "confirmed", expectedGeneration: "old" }, sender)
  const flush = adapter.flushSync(), again = adapter.receiveSyncDocument(addressed)
  const listener = subscribe.mock.calls[0]?.[0]
  if (!listener) throw Error("Missing same-owner sync listener")
  Reflect.apply(listener, undefined, [{}])
  for (let i = 0; i < 60; i++) await Promise.resolve()
  expect(settled).toBe(false)
  expect(get).toHaveBeenCalledTimes(reads)
  expect(syncGet).toHaveBeenCalledTimes(remoteReads)
  release()
  expect(await receive).toEqual({ kind: "adopted", received: { key: addressed, name: key, gen: "incoming", document: incoming } })
  expect(await stale).toEqual({ kind: "result", result: { refused: "invalid" } })
  expect(await flush).toEqual({ kind: "idle" })
  expect(await again).toEqual({ kind: "idle" })
  for (let i = 0; i < 60; i++) await Promise.resolve()
  expect<unknown>(set.mock.calls).toEqual([[{ [key]: incoming, sync: { ...history, pushed: { [key]: "incoming", [setup]: "setup" } } }]])
  expect(syncSet).not.toHaveBeenCalled()
  expect(subscribe).toHaveBeenCalledTimes(1)
  expect(await adapter.changeFromSettings({ ...request, desired: { mode: "allow", on: true } }, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual({ ...history, pushed: { [key]: "incoming", [setup]: "setup" } })
  await adapter.dispose()
  await expect(adapter.receiveSyncDocument(addressed)).rejects.toThrow("Writer disposed")
})

test("actual adapter startup and area listener automatically adopt on the same owner", async () => {
  const setup = "doc:setup:AAAAAAAAAAAAAAAA", base = key.replace("doc:", "s:")
  const before = await fakeBrowser.storage.local.get(null)
  const incoming = JSON.parse('{"v":1,"gen":"f1","at":20,"by":"device-b","data":{"on":false,"channels":[["UCaaaaaaaaaaaaaaaaaaaaaa","Title",null,{"future":1}]]},"__proto__":{"keep":true},"toJSON":"inert"}')
  const history = { joined: "h", pushed: { [key]: "old", [setup]: "setup" }, status: "ok", editedSinceOff: false, extra: { keep: true } }
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }, sync: history })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "h", created: 1 }, [base]: incoming, [setup.replace("doc:", "s:")]: before[setup] })
  const localSet = spyOn(fakeBrowser.storage.local, "set"), syncSet = spyOn(fakeBrowser.storage.sync, "set")
  const subscribe = spyOn(fakeBrowser.storage.sync.onChanged, "addListener"), windows = spyOn(fakeBrowser.windows, "get")
  const results: SyncAutomaticResult[] = []
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult: result => { results.push(result) } })
  await adapter.startSync()
  const nextHistory = { ...history, pushed: { ...history.pushed, [key]: "f1" } }
  expect<unknown>(localSet.mock.calls).toEqual([[{ [key]: incoming, sync: nextHistory }]])
  expect(results).toEqual([{ kind: "idle" }])
  expect(subscribe).toHaveBeenCalledTimes(1)
  const f2 = { ...incoming, gen: "f2", at: 30, extra: "later-event" }
  await fakeBrowser.storage.sync.set({ [base]: f2 })
  syncSet.mockClear()
  const listener = subscribe.mock.calls[0]?.[0]
  if (!listener) throw Error("Missing actual area listener")
  Reflect.apply(listener, undefined, [{}])
  for (let i = 0; i < 400; i++) await Promise.resolve()
  expect<unknown>(localSet.mock.calls).toEqual([[{ [key]: incoming, sync: nextHistory }], [{ [key]: f2, sync: { ...nextHistory, pushed: { ...nextHistory.pushed, [key]: "f2" } } }]])
  expect((await fakeBrowser.storage.local.get(key))[key]).toEqual(f2)
  expect(results.at(-1)).toEqual({ kind: "idle" })
  expect(syncSet).not.toHaveBeenCalled()
  expect(windows).not.toHaveBeenCalled()
  if (!sender.tab) throw Error("Missing synthetic tab")
  expect(await adapter.changeFromSettings(request, { ...sender, tab: { ...sender.tab, incognito: true } })).toEqual({ kind: "result", result: { refused: "private" } })
  expect(localSet).toHaveBeenCalledTimes(2)
  await adapter.dispose()
})

test("shared Settings manual start and area consumers need no Setup or native authority lookup", async () => {
  await fakeBrowser.storage.local.clear()
  const old = { v: 1, gen: "s0", at: 10, by: "device-a", data: {} }
  const incoming = JSON.parse('{"v":1,"gen":"s1","at":20,"by":"device-b","data":{"theme":"dark","browserMenu":{"on":true},"anyTabKeys":{"on":true},"gather":{"on":true},"syncOn":false,"consent":{"v":999}},"__proto__":{"keep":true},"toJSON":"inert"}')
  const device = { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true, detailedLog: false, recentAdds: false }
  const history = { joined: "h", pushed: { "doc:settings": "s0" }, status: "ok", editedSinceOff: false }
  await fakeBrowser.storage.local.set({ schema: 1, device, sync: history, "doc:settings": old })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "h", created: 1 }, "s:settings": incoming })
  const originalSet = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
  const set = spyOn(fakeBrowser.storage.local, "set"), get = spyOn(fakeBrowser.storage.local, "get")
  const windows = spyOn(fakeBrowser.windows, "get").mockImplementation(() => { throw Error("Settings must not query windows") })
  const permissions = spyOn(fakeBrowser.permissions, "contains").mockImplementation(() => { throw Error("Settings must not query permissions") })
  const syncSet = spyOn(fakeBrowser.storage.sync, "set"), subscribe = spyOn(fakeBrowser.storage.sync.onChanged, "addListener")
  const results: SyncAutomaticResult[] = []
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult: result => { results.push(result) } })
  let entered = false, release!: () => void
  const gate = new Promise<void>(done => { release = done })
  set.mockImplementationOnce(async items => { entered = true; await gate; await originalSet(items) })
  const receiving = adapter.receiveSyncDocument({ kind: "settings" })
  for (let i = 0; i < 80; i++) await Promise.resolve()
  expect(entered).toBe(true)
  const reads = get.mock.calls.length, flush = adapter.flushSync(), start = adapter.startSync()
  for (let i = 0; i < 80; i++) await Promise.resolve()
  expect(get).toHaveBeenCalledTimes(reads)
  release()
  expect((await receiving).kind).toBe("adopted")
  expect(await flush).toEqual({ kind: "idle" }); await start
  expect<unknown>(set.mock.calls).toEqual([[{ "doc:settings": incoming, sync: { ...history, pushed: { "doc:settings": "s1" } } }]])
  expect(await adapter.receiveSyncDocument({ kind: "settings" })).toEqual({ kind: "idle" })
  const later = { ...incoming, gen: "s2", at: 30 }
  await fakeBrowser.storage.sync.set({ "s:settings": later }); syncSet.mockClear()
  const listener = subscribe.mock.calls[0]?.[0]
  if (!listener) throw Error("Missing Settings area listener")
  Reflect.apply(listener, undefined, [{}])
  for (let i = 0; i < 500; i++) await Promise.resolve()
  expect((await fakeBrowser.storage.local.get("doc:settings"))["doc:settings"]).toEqual(later)
  expect((await fakeBrowser.storage.local.get("device")).device).toEqual(device)
  expect(results.every(result => result.kind === "idle")).toBe(true)
  expect(syncSet).not.toHaveBeenCalled(); expect(windows).not.toHaveBeenCalled(); expect(permissions).not.toHaveBeenCalled()
  await adapter.dispose()
})

test("intrinsic Setup forwarding shares the native owner without UI authority calls", async () => {
  const { isAccountKey } = await import("../../shared/model")
  const acct = "AAAAAAAAAAAAAAAA", S = `doc:setup:${acct}`, B = S.replace("doc:", "s:")
  if (!isAccountKey(acct)) throw Error("Invalid synthetic account")
  const addressed = { kind: "setup", acct } as const
  const old = { v: 1, gen: "a0", at: 10, by: "synthetic", data: {} }
  const incoming = JSON.parse('{"v":1,"gen":"a1","at":20,"by":"other","__proto__":{"keep":true},"data":{"gather":"PL_G","targets":{"gone99":"PL_T"},"marks":{"PL_UNUSED":"full"}}}')
  const device = { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true, lastAccount: acct }
  const history = { joined: "h", pushed: { [S]: "a0", [key]: "old" }, status: "ok", editedSinceOff: false, extension: { keep: true } }
  const before = await fakeBrowser.storage.local.get(null)
  await fakeBrowser.storage.local.set({ device, sync: history, [S]: old })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "h", created: 0 }, [B]: incoming, [key.replace("doc:", "s:")]: before[key] })
  const original = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
  const set = spyOn(fakeBrowser.storage.local, "set"), get = spyOn(fakeBrowser.storage.local, "get")
  const windows = spyOn(fakeBrowser.windows, "get").mockImplementation(() => { throw Error("Setup must not query windows") })
  const permissions = spyOn(fakeBrowser.permissions, "contains").mockImplementation(() => { throw Error("Setup must not query permissions") })
  const syncSet = spyOn(fakeBrowser.storage.sync, "set"), subscribe = spyOn(fakeBrowser.storage.sync.onChanged, "addListener")
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  let entered = false, release!: () => void
  const gate = new Promise<void>(done => { release = done })
  set.mockImplementationOnce(async items => { entered = true; await gate; await original(items) })
  const receiving = adapter.receiveSyncDocument(addressed)
  for (let i = 0; i < 80; i++) await Promise.resolve()
  expect(entered).toBe(true)
  const reads = get.mock.calls.length, flush = adapter.flushSync(), start = adapter.startSync(), repeat = adapter.receiveSyncDocument(addressed)
  for (let i = 0; i < 80; i++) await Promise.resolve()
  expect(get).toHaveBeenCalledTimes(reads)
  release()
  expect(await receiving).toEqual({ kind: "adopted", received: { key: addressed, name: S, gen: "a1", document: incoming } })
  expect(await flush).toEqual({ kind: "idle" }); await start; expect(await repeat).toEqual({ kind: "idle" })
  expect<unknown>(set.mock.calls).toEqual([[{ [S]: incoming, sync: { ...history, pushed: { ...history.pushed, [S]: "a1" } } }]])
  expect(windows).not.toHaveBeenCalled(); expect(permissions).not.toHaveBeenCalled(); expect(syncSet).not.toHaveBeenCalled()
  const later = { ...incoming, gen: "a2", at: 30 }
  await fakeBrowser.storage.sync.set({ [B]: later }); syncSet.mockClear()
  const listener = subscribe.mock.calls[0]?.[0]
  if (!listener) throw Error("Missing same-owner listener")
  Reflect.apply(listener, undefined, [{}])
  for (let i = 0; i < 600; i++) await Promise.resolve()
  expect((await fakeBrowser.storage.local.get(S))[S]).toEqual(later)
  expect((await fakeBrowser.storage.local.get("device")).device).toEqual(device)
  expect(windows).not.toHaveBeenCalled(); expect(permissions).not.toHaveBeenCalled(); expect(syncSet).not.toHaveBeenCalled()
  if (!sender.tab) throw Error("Missing synthetic tab")
  expect(await adapter.changeFromSettings(request, { ...sender, tab: { ...sender.tab, incognito: true } })).toEqual({ kind: "result", result: { refused: "private" } })
  expect(await adapter.changeFromSettings(request, { ...sender, frameId: 1 })).toEqual({ kind: "result", result: { refused: "invalid" } })
  expect(set).toHaveBeenCalledTimes(2)
  await adapter.dispose()
})


test("synthetic adapter forwards independent wall clock and retains original recoverable native result", async () => {
  const initial = await fakeBrowser.storage.local.get(null)
  const setup = "doc:setup:AAAAAAAAAAAAAAAA", base = key.replace("doc:", "s:")
  const history = { joined: "H", pushed: { [key]: "old", [setup]: "setup" }, status: "ok", editedSinceOff: false }
  const pending = { v: 1, gen: "g1", at: 10, by: "synthetic", data: { mode: "deny", on: false, channels: [] } }
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 0 }, syncOn: true }, sync: history, [key]: pending })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "H", created: 0 }, [base]: initial[key], [setup.replace("doc:", "s:")]: initial[setup] })
  let mono = 0, wall = 1000000
  spyOn(performance, "now").mockImplementation(() => mono)
  spyOn(Date, "now").mockImplementation(() => wall)
  const marker = { name: "synthetic", message: "synthetic native failure" }
  const nativeSet = spyOn(fakeBrowser.storage.sync, "set").mockImplementation(async () => { throw marker })
  const results: SyncAutomaticResult[] = []
  const subscribe = spyOn(fakeBrowser.storage.sync.onChanged, "addListener"), unsubscribe = spyOn(fakeBrowser.storage.sync.onChanged, "removeListener")
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult: result => { results.push(result) } })
  mono = 5000; wall = 2000000
  const result = await adapter.flushSync()
  expect(result.kind === "sync-set-failed" && result.error === marker).toBe(true)
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual({ ...history, opaqueWrite: { gate: { kind: "held", notBefore: 2060000 }, diagnostic: marker } })
  await adapter.startSync()
  expect(subscribe).toHaveBeenCalledTimes(1)
  expect(unsubscribe).not.toHaveBeenCalled()
  expect(results.at(-1)).toEqual({ kind: "deferred", notBefore: 65000 })
  mono = 64999; wall = 3000000
  expect((await adapter.flushSync()).kind).toBe("deferred")
  expect(nativeSet).toHaveBeenCalledTimes(1)
  await adapter.dispose()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
