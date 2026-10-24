import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { isJsonValue } from "../../shared/contracts/json"
import { createBrowserLocalFilterWriter } from "./local-filter-writer"
import type { LocalFilterWriteResult } from "../store/local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type NativeBrowser = typeof import("wxt/browser").browser
type ExpectedSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
export type BrowserAdapterProof = Check<Equal<typeof createBrowserLocalFilterWriter, (native: NativeBrowser) => {
  changeFromSettings(raw: unknown, sender: ExpectedSender): Promise<LocalFilterWriteResult>
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
  const adapter = createBrowserLocalFilterWriter(fakeBrowser)
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
  const adapter = createBrowserLocalFilterWriter(fakeBrowser)
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
  const adapter = createBrowserLocalFilterWriter(fakeBrowser)
  await expect(adapter.changeFromSettings(request, sender)).rejects.toBe(marker)
  expect(set).not.toHaveBeenCalled()
  expect(await adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(set).toHaveBeenCalledTimes(1)
})
