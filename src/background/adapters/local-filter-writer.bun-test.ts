import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import type { SessionPort } from "../store/session-memory"
import { isAccountKey, isPlaylistId, isVideoId } from "../../shared/model"
import { brand, harness, no, shortcut, tabOrigin } from "../../../tools/fixtures/add-flow/harness"
import { isJsonValue } from "../../shared/contracts/json"
import { createBrowserLocalFilterWriter as constructBrowserLocalFilterWriter } from "./local-filter-writer"
import { createBrowserStartingLocalFilterWriter } from "./starting-owner"
import { startingOwnerFixture } from "../../../tools/fixtures/starting-owner/support"
import type { LocalFilterWriteResult, SyncAutomaticResult, SyncFlushResult, SyncReceiveKey, SyncReceiveResult } from "../store/local-filter-writer"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Check<T extends true> = T
type NativeBrowser = typeof import("wxt/browser").browser
type ExpectedSender = Parameters<Parameters<NativeBrowser["runtime"]["onMessage"]["addListener"]>[0]>[1]
export type BrowserAdapterProof = Check<Equal<typeof createBrowserLocalFilterWriter, (native: NativeBrowser, options: { onSyncResult: (result: SyncAutomaticResult) => void }) => {
  session: SessionPort
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
const adapters: ReturnType<typeof constructBrowserLocalFilterWriter>[] = []
function createBrowserLocalFilterWriter(...args: Parameters<typeof constructBrowserLocalFilterWriter>) {
  const adapter = constructBrowserLocalFilterWriter(...args)
  adapters.push(adapter)
  return adapter
}
afterEach(async () => {
  try { for (const adapter of adapters.splice(0)) await adapter.dispose() }
  finally { mock.restore() }
})

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

test("native session port uses the canonical writer's fresh reads, exact set and account-key removal", async () => {
  const h = instrument(), acct = brand(isAccountKey, "AAAAAAAAAAAAAAAA")
  await fakeBrowser.storage.session.set({ unknown: { kept: true } })
  const get = spyOn(fakeBrowser.storage.session, "get"), set = spyOn(fakeBrowser.storage.session, "set"), remove = spyOn(fakeBrowser.storage.session, "remove")
  const first = await h.adapter.session.read()
  if (first.kind !== "memory") throw Error("Expected canonical session authority")
  const video = brand(isVideoId, "vid00000001")
  const skip = await h.adapter.session.change({ revision: first.revision, now: 1_700_000_000_000, edits: [{ kind: "skip", acct, video, playlists: "all" }] })
  expect(skip.kind).toBe("committed")
  if (skip.kind !== "committed") throw Error("Expected confirmed skip")
  const cleared = await h.adapter.session.change({ revision: skip.revision, now: 1_700_000_000_001, edits: [{ kind: "unskip", acct, video }] })
  expect(cleared.kind).toBe("committed")
  expect<unknown>(get.mock.calls).toEqual([[null], [null], [null], [null], [null]])
  expect<unknown>(set.mock.calls).toEqual([[{ [`skips:${acct}`]: { [video]: "all" } }]])
  expect<unknown>(remove.mock.calls).toEqual([[`skips:${acct}`].map(key => [key])])
  expect(await fakeBrowser.storage.session.get(null)).toEqual({ unknown: { kept: true } })
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test.each(["rejected", "applied-rejection", "ignored", "readback-failed"] as const)("native session readback distinguishes %s without retry", async mode => {
  const h = instrument(), read = await h.adapter.session.read()
  if (read.kind !== "memory") throw Error("Expected canonical session authority")
  const error = Error("Synthetic native session failure")
  const originalSet = fakeBrowser.storage.session.set.bind(fakeBrowser.storage.session)
  const originalGet = fakeBrowser.storage.session.get.bind(fakeBrowser.storage.session)
  let wrote = false
  const set = spyOn(fakeBrowser.storage.session, "set").mockImplementation(async items => {
    wrote = true
    if (mode === "rejected") throw error
    if (mode !== "ignored") await originalSet(items)
    if (mode === "applied-rejection") throw error
  })
  const get = spyOn(fakeBrowser.storage.session, "get").mockImplementation(new Proxy(originalGet, {
    apply(target, receiver, args) {
      if (mode === "readback-failed" && wrote) return Promise.reject(error)
      return Reflect.apply(target, receiver, args)
    }
  }))
  const result = await h.adapter.session.change({ revision: read.revision, now: 1_700_000_000_000, edits: [{ kind: "pause", paused: true }] })
  expect(result).toEqual(mode === "rejected" ? { kind: "failed", applied: false, error }
    : mode === "applied-rejection" ? { kind: "failed", applied: true, error }
      : mode === "ignored" ? { kind: "unconfirmed", cause: { kind: "readback" } }
        : { kind: "unconfirmed", cause: { kind: "read-failed", error } })
  expect<unknown>(set.mock.calls).toEqual([[{ paused: true }]])
  expect<unknown>(get.mock.calls).toEqual([[null], [null]])
  const after = await h.adapter.session.read()
  expect(after.kind).toBe(mode === "rejected" ? "memory" : "unavailable")
  expect(set).toHaveBeenCalledTimes(1)
})

test("real engine keeps private account facts outside native session while sharing Pause", async () => {
  const h = instrument(), acct = brand(isAccountKey, "AAAAAAAAAAAAAAAA"), playlist = brand(isPlaylistId, "PL_P")
  const video = brand(isVideoId, "vid00000001"), privateVideo = brand(isVideoId, "vid00000002")
  const yt = harness({ session: h.adapter.session, clock: 1_700_000_000_000 })
  yt.tab(1, acct); yt.tab(2, acct)
  yt.setup(acct, { kind: "shortcut", shortcut }, [{ playlist }])
  yt.setup(acct, { kind: "auto-add" }, [{ playlist }])
  const set = spyOn(fakeBrowser.storage.session, "set"), remove = spyOn(fakeBrowser.storage.session, "remove")
  const normal = tabOrigin(1), privateTab = tabOrigin(2, true)
  const added = await yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normal)
  expect(added.kind === "report" && added.outcomes).toEqual({ [playlist]: { kind: "added" } })
  expect<unknown>(set.mock.calls).toEqual([[{ recent: [{ acct, playlist, video, at: 1_700_000_000_000 }] }]])
  const nativeBefore = await fakeBrowser.storage.session.get(null)
  const privateAdd = await yt.flow.add({ via: "shortcut", site: "www", video: privateVideo, shortcut }, privateTab)
  expect(privateAdd.kind === "report" && privateAdd.outcomes).toEqual({ [playlist]: { kind: "added" } })
  expect(await yt.flow.skip({ kind: "skip", acct, video, playlists: "all" }, privateTab)).toEqual({ kind: "remembered", scope: "private" })
  const gather = await yt.flow.batch({ playlist: brand(isPlaylistId, "WL"), videos: [privateVideo], auto: false }, privateTab)
  if (gather.kind !== "report" || !gather.undo || privateAdd.kind !== "report" || !privateAdd.undo) throw Error("Expected private Undo handles")
  expect(await yt.flow.undo(privateAdd.undo, privateTab)).toEqual({ kind: "undone" })
  expect(await yt.flow.undo(gather.undo, privateTab)).toEqual({ kind: "undone" })
  yt.script.add.push(() => no<"add">("failed", 429))
  const limited = await yt.flow.add({ via: "shortcut", site: "www", video: privateVideo, shortcut }, privateTab)
  expect(limited.kind === "report" && limited.outcomes).toEqual({ [playlist]: { kind: "failed", failure: "rate-limited" } })
  const callsBeforeHold = yt.calls.length
  const held = await yt.flow.add({ via: "shortcut", site: "www", video: privateVideo, shortcut }, privateTab)
  expect(held.kind === "report" && held.outcomes).toEqual({ [playlist]: { kind: "failed", failure: "paused" } })
  expect(yt.calls.length).toBe(callsBeforeHold)
  expect(await fakeBrowser.storage.session.get(null)).toEqual(nativeBefore)
  expect(set).toHaveBeenCalledTimes(1)
  expect(remove).not.toHaveBeenCalled()
  expect(await yt.flow.pause(true)).toEqual({ kind: "remembered", scope: "normal" })
  expect<unknown>(set.mock.calls).toEqual([[{ recent: [{ acct, playlist, video, at: 1_700_000_000_000 }] }], [{ paused: true }]])
  const sent = yt.calls.length
  const paused = await yt.flow.add({ via: "auto-add", site: "www", video: privateVideo, playlists: [playlist], channel: null }, privateTab)
  expect(paused.kind === "report" && paused.outcomes).toEqual({})
  expect(yt.calls.length).toBe(sent)
  await yt.flow.quiesce()
})

test("synthetic normal native metadata admits only settings and never touches sync", async () => {
  const h = instrument()
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(1)
  const call = h.set.mock.calls[0]?.[0]
  expect(Object.keys(call ?? {})).toEqual([key, "sync"])
  const history = { joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
  if (!call || !("sync" in call)) throw Error("Missing history batch")
  expect(call.sync).toEqual(history)
  expect(call).toMatchObject({ [key]: { v: 1, by: "synthetic", data: { mode: "deny", on: false, channels: [] } } })
  const saved: unknown = (await fakeBrowser.storage.local.get<Record<string, unknown>>(key))[key]
  if (!isJsonValue(saved) || !saved || typeof saved !== "object" || Array.isArray(saved)) throw Error("Missing saved envelope")
  expect(typeof saved.gen).toBe("string")
  expect(saved.gen).not.toBe("old")
  expect(Number.isSafeInteger(saved.at)).toBe(true)
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual(history)
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

test("shared sender resolution keeps missing Settings identity invalid and actual private windows refused", async () => {
  const h = instrument()
  if (!sender.tab) throw Error("Missing synthetic tab")
  for (const id of [undefined, -1, 0.5]) {
    expect(await h.adapter.changeFromSettings(request, { ...sender, tab: { ...sender.tab, id } }))
      .toEqual({ kind: "result", result: { refused: "invalid" } })
  }
  const window = await fakeBrowser.windows.create({ incognito: true })
  if (window?.id === undefined) throw Error("Missing synthetic private window")
  const tab = await fakeBrowser.tabs.create({ windowId: window.id, url: sender.url })
  expect(await h.adapter.changeFromSettings(request, { ...sender, tab: { ...tab, incognito: true } }))
    .toEqual({ kind: "result", result: { refused: "private" } })
  expect(await h.adapter.changeFromSettings({ ...request, incognito: false }, { ...sender, tab: { ...tab, incognito: true } }))
    .toEqual({ kind: "result", result: { refused: "invalid" } })
  expect(await h.adapter.changeFromSettings(request, { ...sender, url: fakeBrowser.runtime.getURL("/popup.html"), tab: undefined }))
    .toEqual({ kind: "result", result: { refused: "invalid" } })
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
  const before = await fakeBrowser.storage.local.get(null)
  const h = instrument(), marker = new Error("native write failure")
  h.set.mockImplementationOnce(async () => { throw marker })
  await expect(h.adapter.changeFromSettings(request, sender)).rejects.toBe(marker)
  expect(h.set).toHaveBeenCalledTimes(1)
  const reads = h.get.mock.calls.length
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(await h.adapter.flushSync()).toEqual({ kind: "unavailable" })
  expect(h.get).toHaveBeenCalledTimes(reads)
  expect(h.set).toHaveBeenCalledTimes(1)
  expect(await fakeBrowser.storage.local.get(null)).toEqual(before)
  expect(() => createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })).toThrow("Local storage already owned")
  await h.adapter.dispose()
  const replacement = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  expect(h.set).toHaveBeenCalledTimes(1)
  expect(await replacement.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(2)
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual({ joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true })
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test("synthetic sync history stays unavailable with zero sync calls", async () => {
  await fakeBrowser.storage.local.set({ sync: { joined: null } })
  const h = instrument()
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "unavailable", reason: "sync-writer-required" })
  expect(h.set).not.toHaveBeenCalled()
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test("synthetic supported off history batches true provenance and preserves extensions", async () => {
  const sync = { joined: null, pushed: { opaque: "old-push" }, status: "off", editedSinceOff: false, future: { keep: true } }
  await fakeBrowser.storage.local.set({ sync })
  const h = instrument()
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(1)
  expect(Object.keys(h.set.mock.calls[0]?.[0] ?? {})).toEqual([key, "sync"])
  const batch = h.set.mock.calls[0]?.[0]
  if (!batch || !("sync" in batch)) throw Error("Missing history batch")
  expect(batch.sync).toEqual({ ...sync, editedSinceOff: true, everEdited: true })
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(1)
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual({ ...sync, editedSinceOff: true, everEdited: true })
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
  const reads = h.get.mock.calls.length
  expect(await h.adapter.changeFromSettings(request, sender)).toEqual({ kind: "unavailable", reason: "stale" })
  expect(h.get).toHaveBeenCalledTimes(reads)
  expect(h.set).toHaveBeenCalledTimes(1)
  await h.adapter.dispose()
  const replacement = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  expect(h.set).toHaveBeenCalledTimes(1)
  expect(await replacement.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(h.set).toHaveBeenCalledTimes(2)
  expect(Object.keys(h.set.mock.calls[1]?.[0] ?? {})).toEqual([key, "sync"])
  const batch = h.set.mock.calls[1]?.[0]
  if (!batch || !("sync" in batch)) throw Error("Missing history batch")
  expect(batch.sync).toEqual({ ...sync, editedSinceOff: true, everEdited: true })
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual({ ...sync, editedSinceOff: true, everEdited: true })
  expect(h.syncGet).not.toHaveBeenCalled()
  expect(h.syncSet).not.toHaveBeenCalled()
})

test("synthetic joined adapter lazily confirms Filter and true provenance without a sync write", async () => {
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
  expect<unknown>(get.mock.calls).toEqual([[null], [null], [null], [null]])
  expect<unknown>(syncGet.mock.calls).toEqual([[null]])
  expect(set).toHaveBeenCalledTimes(1)
  expect(Object.keys(set.mock.calls[0]?.[0] ?? {})).toEqual([key, "sync"])
  const batch = set.mock.calls[0]?.[0]
  if (!batch || !("sync" in batch)) throw Error("Missing history batch")
  expect(batch.sync).toEqual({ ...rawSync, everEdited: true })
  expect(syncSet).not.toHaveBeenCalled()
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual({ ...rawSync, everEdited: true })
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
  expect((await fakeBrowser.storage.local.get("sync")).sync).toEqual({ ...history, pushed: { [key]: "incoming", [setup]: "setup" }, everEdited: true })
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
  const device = { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }
  const history = { joined: "h", pushed: { [S]: "a0", [key]: "old" }, status: "ok", editedSinceOff: false, extension: { keep: true } }
  const before = await fakeBrowser.storage.local.get(null)
  await fakeBrowser.storage.local.set({ device, lastAccount: acct, sync: history, [S]: old })
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

test("adapter excludes duplicate actual local areas while active and draining", async () => {
  const originalGet = fakeBrowser.storage.local.get
  spyOn(fakeBrowser.storage.local, "get").mockImplementation(new Proxy(originalGet, {
    apply(target, receiver, args) { return Reflect.apply(target, receiver, args).then((items: Record<string, unknown>) => Object.fromEntries(Object.entries(items).filter(([, value]) => value !== undefined))) }
  }))
  const first = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  expect(() => createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })).toThrow("Local storage already owned")
  const original = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
  let release = () => {}, enter = () => {}
  const held = new Promise<void>(done => { release = done }), entered = new Promise<void>(done => { enter = done })
  const set = spyOn(fakeBrowser.storage.local, "set").mockImplementationOnce(async items => { enter(); await held; await original(items) })
  const snapshot = await fakeBrowser.storage.local.get(null)
  const editing = first.changeFromSettings(request, sender); await entered
  const drain = first.dispose()
  expect(first.dispose()).toBe(drain)
  expect(() => createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })).toThrow("Local storage already owned")
  release(); expect(await editing).toEqual({ kind: "unconfirmed", cause: { kind: "authority" } }); await drain
  expect(set).toHaveBeenCalledTimes(1)
  await expect(first.changeFromSettings(request, sender)).rejects.toThrow("Writer disposed")
  const saved = await fakeBrowser.storage.local.get(null)
  expect(saved.sync).toEqual({ joined: null, pushed: {}, status: "off", editedSinceOff: true, everEdited: true })
  const replacement = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  expect(await replacement.changeFromSettings(request, sender)).toEqual({ kind: "result", result: { ok: true } })
  expect(set).toHaveBeenCalledTimes(1)
  expect(await fakeBrowser.storage.local.get(null)).toEqual(saved)
  expect(saved.device).toEqual(snapshot.device)
  expect("claim" in replacement).toBe(false)
  await replacement.dispose()
})

test("construction failure releases local admission before an owner escapes", async () => {
  const now = spyOn(performance, "now").mockImplementationOnce(() => { throw Error("synthetic construction failure") })
  expect(() => createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })).toThrow("synthetic construction failure")
  now.mockRestore()
  const replacement = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  await replacement.dispose()
})

test("legacy disposal hands its local area to the real starting facade through the same guard", async () => {
  const h = startingOwnerFixture()
  const legacy = constructBrowserLocalFilterWriter(h.native, { onSyncResult() {} })
  expect(() => createBrowserStartingLocalFilterWriter(h.native, h.options)).toThrow("Local storage already owned")
  await legacy.dispose()
  const starting = createBrowserStartingLocalFilterWriter(h.native, h.options)
  try {
    expect(() => constructBrowserLocalFilterWriter(h.native, { onSyncResult() {} })).toThrow("Local storage already owned")
    expect(await starting.ready()).toBe("ok")
    expect(h.records()).toEqual({ schema: 1 })
    expect(h.counts.rawLocal).toBe(0)
  } finally { await starting.dispose() }
})

test("failed disposal retains duplicate admission and its rejection", async () => {
  const area = new Proxy(fakeBrowser.storage.local, {})
  const storage = new Proxy(fakeBrowser.storage, { get(target, key, receiver) { return key === "local" ? area : Reflect.get(target, key, receiver) } })
  const native = new Proxy(fakeBrowser, { get(target, key, receiver) { return key === "storage" ? storage : Reflect.get(target, key, receiver) } })
  const snapshot = await fakeBrowser.storage.local.get(null)
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }, sync: { joined: "H", pushed: { [key]: "old", "doc:setup:AAAAAAAAAAAAAAAA": "setup" }, status: "ok", editedSinceOff: false } })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "H", created: 1 }, [key.replace("doc:", "s:")]: snapshot[key], "s:setup:AAAAAAAAAAAAAAAA": snapshot["doc:setup:AAAAAAAAAAAAAAAA"] })
  const add = spyOn(fakeBrowser.storage.sync.onChanged, "addListener")
  const nativeRemove = fakeBrowser.storage.sync.onChanged.removeListener.bind(fakeBrowser.storage.sync.onChanged)
  const adapter = constructBrowserLocalFilterWriter(native, { onSyncResult() {} })
  await adapter.startSync()
  const marker = new Error("synthetic unsubscribe failure")
  const remove = spyOn(fakeBrowser.storage.sync.onChanged, "removeListener").mockImplementationOnce(() => { throw marker })
  const drain = adapter.dispose()
  await expect(drain).rejects.toBe(marker)
  expect(adapter.dispose()).toBe(drain)
  expect(() => constructBrowserLocalFilterWriter(native, { onSyncResult() {} })).toThrow("Local storage already owned")
  remove.mockRestore()
  for (const [listener] of add.mock.calls) nativeRemove(listener)
})

test("adapter ownership remains held through unresolved incoming readback and drain", async () => {
  const { isAccountKey, isPlaylistId } = await import("../../shared/model")
  const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_P", setup = `doc:setup:${acct}`
  if (!isAccountKey(acct) || !isPlaylistId(playlist)) throw Error("Invalid synthetic address")
  const initial = await fakeBrowser.storage.local.get(null)
  await fakeBrowser.storage.local.set({ device: { id: "synthetic", consent: { v: 1, at: 1 }, syncOn: true }, sync: { joined: "H", pushed: { [key]: "old", [setup]: "setup" }, status: "ok", editedSinceOff: false } })
  await fakeBrowser.storage.sync.set({ "s:meta": { v: 1, id: "H", created: 0 }, [setup.replace("doc:", "s:")]: initial[setup], [key.replace("doc:", "s:")]: { v: 1, gen: "incoming", at: 2, by: "other", data: { mode: "deny", on: false, channels: [] } } })
  const original = fakeBrowser.storage.local.get
  let release = () => {}, enter = () => {}, reads = 0
  const held = new Promise<void>(done => { release = done }), entered = new Promise<void>(done => { enter = done })
  spyOn(fakeBrowser.storage.local, "get").mockImplementation(new Proxy(original, {
    async apply(target, receiver, args) {
      if (++reads === 4) { enter(); await held }
      return Reflect.apply(target, receiver, args)
    }
  }))
  const adapter = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  const receiving = adapter.receiveSyncDocument({ kind: "filter", acct, playlist }); await entered
  const draining = adapter.dispose()
  expect(() => createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })).toThrow("Local storage already owned")
  release(); expect((await receiving).kind).toBe("unconfirmed"); await draining
  const replacement = createBrowserLocalFilterWriter(fakeBrowser, { onSyncResult() {} })
  await replacement.dispose()
})
