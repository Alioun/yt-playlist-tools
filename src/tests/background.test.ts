import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import background from "@/entrypoints/background"
import * as store from "@/lib/storage"
import * as youtube from "@/lib/youtube"
import * as sessionService from "@/lib/session"

vi.mock("@/lib/youtube", () => ({ fetchUserPlaylists: vi.fn(), addVideoToPlaylist: vi.fn(), fetchVideoChannel: vi.fn(), fetchChannel: vi.fn() }))
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), findSession: vi.fn(), checkSession: vi.fn() }))

type Listener = Parameters<typeof fakeBrowser.runtime.onMessage.addListener>[0]
type Sender = Parameters<Listener>[1]
let listener: Listener | undefined
let origin: Sender
let ui: Sender
let windowId: number
const snapshot = { tabId: 42, accountKey: "account0000000001", incognito: false, consentGeneration: "generation-1" }
const videoId = "abcdefghijk"

function send(message: Record<string, unknown>, sender = origin): Promise<unknown> {
  return new Promise(resolve => {
    if (!listener) throw new Error("Background listener missing")
    expect(listener({ windowId, ...message }, sender, resolve)).toBe(true)
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await store.sessionGeneration.setValue("generation-1")
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (!window || window.id === undefined) throw new Error("Window missing")
  windowId = window.id
  const tab = await fakeBrowser.tabs.create({ url: "https://www.youtube.com/watch?v=abcdefghijk", windowId })
  origin = { id: fakeBrowser.runtime.id, url: tab.url, frameId: 0, tab: { ...tab, id: 42, incognito: false } }
  ui = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }
  vi.spyOn(fakeBrowser.runtime.onMessage, "addListener").mockImplementation(fn => { listener = fn })
  vi.spyOn(sessionService, "reconcileScripts")
  vi.spyOn(fakeBrowser.scripting, "getRegisteredContentScripts").mockImplementation(async () => [])
  vi.spyOn(fakeBrowser.scripting, "registerContentScripts").mockResolvedValue()
  vi.spyOn(fakeBrowser.scripting, "unregisterContentScripts").mockResolvedValue()
  vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => [])
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(async () => (undefined))
  vi.mocked(sessionService.findSession).mockImplementation(async () => ({
    kind: "ready", session: { ...snapshot, consentGeneration: await store.sessionGeneration.getValue() }
  }))
  vi.mocked(sessionService.checkSession).mockImplementation(async () => (undefined))
  vi.mocked(youtube.fetchUserPlaylists).mockImplementation(async () => ([{ id: "PL1", title: "Owned" }]))
  vi.mocked(youtube.addVideoToPlaylist).mockImplementation(async () => ({ alreadyIn: false }))
  vi.mocked(youtube.fetchVideoChannel).mockImplementation(async () => (null))
  await store.saveAccountSetup(snapshot, { ...store.emptySetup(), playlists: ["PL1"], shortcutPlaylistId: "WL" })
  background.main()
  await sessionService.reconcileScripts()
})

afterEach(() => vi.useRealTimers())

describe("trusted message boundary", () => {
  it("refuses page callers that ask for extension-page data", async () => {
    await expect(send({ action: "fetchPlaylists" })).resolves.toMatchObject({ kind: "unavailable" })
    expect(youtube.fetchUserPlaylists).not.toHaveBeenCalled()
  })
  it("refuses foreign senders and subframes", async () => {
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration }, { ...origin, id: "other" })).resolves.toMatchObject({ kind: "unavailable" })
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration }, { ...origin, frameId: 3 })).resolves.toMatchObject({ kind: "unavailable" })
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })
  it("uses trusted window privacy instead of a payload incognito flag", async () => {
    await send({ action: "fetchPlaylists", incognito: true }, ui)
    expect(sessionService.findSession).toHaveBeenCalledWith({ windowId, incognito: false })
  })
  it("does no page operation before consent", async () => {
    await store.sessionConsent.setValue(0)
    await expect(send({ action: "fetchPlaylists" }, ui)).resolves.toMatchObject({ kind: "consent" })
    expect(sessionService.findSession).not.toHaveBeenCalled()
    expect(youtube.fetchUserPlaylists).not.toHaveBeenCalled()
  })
  it("does not authorize legacy claims from playlist enumeration", async () => {
    await store.playlists.setValue(["PLold"])
    await expect(send({ action: "claimLegacy", session: snapshot }, ui)).resolves.toMatchObject({ kind: "unavailable" })
    expect(await store.playlists.getValue()).toEqual(["PLold"])
    expect((await store.getAccountSetup(snapshot)).playlists).toEqual(["PL1"])
    expect(youtube.fetchUserPlaylists).not.toHaveBeenCalled()
  })
  it("refuses a private snapshot from a normal caller", async () => {
    await expect(send({ action: "changeSetup", session: { ...snapshot, incognito: true }, change: { kind: "shortcut", playlistId: "PL1" } }, ui)).resolves.toMatchObject({ kind: "accountChanged" })
  })
})

describe("automatic and shortcut adds", () => {
  it("binds the selected account's writes to the original tab", async () => {
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })).resolves.toEqual({ ok: true })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith(snapshot, "PL1", videoId, expect.any(Number))
  })
  it("reports authoritative membership as already present", async () => {
    vi.mocked(youtube.addVideoToPlaylist).mockImplementation(async () => ({ alreadyIn: true }))
    await send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(42, { action: "showToast", toastMessage: "Video already in playlist." })
  })
  it("applies allowlists to unknown channels and leaves shortcut behavior independent", async () => {
    await store.saveAccountSetup(snapshot, { ...store.emptySetup(), playlists: ["PL1"], shortcutPlaylistId: "PL1", filters: { PL1: { mode: "allow", enabled: true, channels: [] } } })
    await send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    await send({ action: "addVideoToShortcutPlaylist", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith(snapshot, "PL1", videoId, expect.any(Number))
  })
  it("stops after a write error without retrying or switching the account", async () => {
    await store.saveAccountSetup(snapshot, { ...store.emptySetup(), playlists: ["PL1", "PL2"] })
    vi.mocked(youtube.addVideoToPlaylist).mockRejectedValue(new sessionService.SessionFailure("unconfirmed"))
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })).resolves.toMatchObject({ kind: "unconfirmed" })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledOnce()
    expect(sessionService.findSession).not.toHaveBeenCalled()
  })
  it("expires queued adds before any delayed dispatch", async () => {
    let release: ((result: { alreadyIn: boolean }) => void) | undefined
    const waiting = new Promise<{ alreadyIn: boolean }>(resolve => { release = resolve })
    vi.mocked(youtube.addVideoToPlaylist).mockImplementationOnce(() => (waiting))
    const first = send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })
    await vi.waitFor(() => expect(youtube.addVideoToPlaylist).toHaveBeenCalledOnce())
    const second = send({ action: "addVideoToPlaylists", videoId: "lmnopqrstuv", accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })
    await new Promise(resolve => setTimeout(resolve, 0))
    const now = Date.now()
    vi.spyOn(Date, "now").mockImplementation(() => (now + 10001))
    release?.({ alreadyIn: false })
    await first
    await expect(second).resolves.toMatchObject({ kind: "unavailable" })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledOnce()
  })
  it("refuses changes when the original tab's account changed", async () => {
    vi.mocked(sessionService.checkSession).mockRejectedValue(new sessionService.SessionFailure("accountChanged"))
    await expect(send({ action: "changeSetup", session: snapshot, change: { kind: "auto", playlistId: "PL2", checked: true } }, ui)).resolves.toMatchObject({ kind: "accountChanged" })
    expect((await store.getAccountSetup(snapshot)).playlists).toEqual(["PL1"])
  })
})

describe("generation-bound messages and queues", () => {
  it.each([undefined, null, 1, "", " "])("rejects malformed add generation %s", async consentGeneration => {
    await expect(send({ action: "addVideoToPlaylists", accountKey: snapshot.accountKey, videoId, consentGeneration })).resolves.toMatchObject({ kind: "unavailable" })
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })

  it("rejects a stale content sender after regrant", async () => {
    await store.sessionGeneration.setValue("generation-after-regrant")
    await expect(send({ action: "addVideoToPlaylists", accountKey: snapshot.accountKey, videoId, consentGeneration: snapshot.consentGeneration })).resolves.toMatchObject({ kind: "revoked" })
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })

  it("rejects stale or missing UI snapshot generations", async () => {
    const change = { kind: "auto", playlistId: "PL2", checked: true }
    await expect(send({ action: "changeSetup", session: { ...snapshot, consentGeneration: undefined }, change }, ui)).resolves.toMatchObject({ kind: "accountChanged" })
    await store.sessionGeneration.setValue("generation-after-regrant")
    await expect(send({ action: "changeSetup", session: snapshot, change }, ui)).resolves.toMatchObject({ kind: "revoked" })
    expect((await store.getAccountSetup(snapshot)).playlists).toEqual(["PL1"])
  })

  it("passes generation and expiry to queue dispatch and refuses an old sender", async () => {
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => [{ frameId: 0, result: true }])
    await expect(send({ action: "queueVideo", videoId, consentGeneration: snapshot.consentGeneration })).resolves.toEqual({ ok: true })
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({
      func: sessionService.queueInPage, args: [videoId, snapshot.consentGeneration, expect.any(Number)]
    }))
    await store.sessionGeneration.setValue("generation-after-regrant")
    await expect(send({ action: "queueVideo", videoId, consentGeneration: snapshot.consentGeneration })).resolves.toMatchObject({ kind: "revoked" })
    expect(inject).toHaveBeenCalledOnce()
  })

  it("does not renew a queue job's lifetime while its consent check is pending", async () => {
    vi.useFakeTimers()
    const started = Date.now()
    const getGeneration = store.sessionGeneration.getValue.bind(store.sessionGeneration)
    let release = () => {}
    const read = vi.spyOn(store.sessionGeneration, "getValue")
      .mockImplementationOnce(getGeneration)
      .mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(snapshot.consentGeneration) }))
    const inject = vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(async () => [{ frameId: 0, result: false }])
    const pending = send({ action: "queueVideo", videoId, consentGeneration: snapshot.consentGeneration })
    await vi.advanceTimersByTimeAsync(0)
    expect(read).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10001)
    release()
    await expect(pending).resolves.toEqual({ ok: false })
    expect(inject).toHaveBeenCalledWith(expect.objectContaining({ args: [videoId, snapshot.consentGeneration, started + 10000] }))
  })

  it("rejects queued adds and setup changes captured before revoke and regrant", async () => {
    let release: (result: { alreadyIn: boolean }) => void = () => {}
    vi.mocked(youtube.addVideoToPlaylist).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const first = send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })
    await vi.waitFor(() => expect(youtube.addVideoToPlaylist).toHaveBeenCalledOnce())
    const queued = send({ action: "addVideoToPlaylists", videoId: "lmnopqrstuv", accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })
    const setupChange = send({ action: "changeSetup", session: snapshot, change: { kind: "auto", playlistId: "PL2", checked: true } }, ui)
    await vi.waitFor(() => expect(sessionService.checkSession).toHaveBeenCalledTimes(2))
    await expect(send({ action: "revokeSession" }, ui)).resolves.toEqual({ kind: "revoked" })
    const newGeneration = "generation-after-regrant"
    await store.sessionGeneration.setValue(newGeneration)
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    release({ alreadyIn: false })
    await first
    await expect(queued).resolves.toMatchObject({ kind: "revoked" })
    await expect(setupChange).resolves.toMatchObject({ kind: "revoked" })
    expect((await store.getAccountSetup(snapshot)).playlists).toEqual(["PL1"])
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledOnce()
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: newGeneration })).resolves.toEqual({ ok: true })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(2)
  })

  it("does not save an in-progress settings change whose read finishes after regrant", async () => {
    const saved = await store.getAccountSetup(snapshot)
    let release: (setup: store.AccountSetup) => void = () => {}
    const get = vi.spyOn(store, "getAccountSetup").mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const pending = send({ action: "changeSetup", session: snapshot, change: { kind: "auto", playlistId: "PL2", checked: true } }, ui)
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce())
    await store.sessionConsent.setValue(-1)
    await store.sessionGeneration.setValue("generation-after-regrant")
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    release(saved)
    await expect(pending).resolves.toMatchObject({ kind: "revoked" })
    expect((await store.getAccountSetup(snapshot)).playlists).toEqual(["PL1"])
  })

  it("serializes concurrent consent transitions and rotates the token before each consent write", async () => {
    const events: (string | number)[] = []
    const setGeneration = store.sessionGeneration.setValue.bind(store.sessionGeneration)
    const setConsent = store.sessionConsent.setValue.bind(store.sessionConsent)
    vi.spyOn(store.sessionGeneration, "setValue").mockImplementation(async token => {
      events.push(token)
      await setGeneration(token)
    })
    vi.spyOn(store.sessionConsent, "setValue").mockImplementation(async value => {
      events.push(value)
      await setConsent(value)
    })
    await Promise.all([send({ action: "grantSession" }, ui), send({ action: "revokeSession" }, ui), send({ action: "grantSession" }, ui)])
    expect(events).toEqual([
      expect.any(String), store.CONSENT_VERSION, expect.any(String), -1, expect.any(String), store.CONSENT_VERSION
    ])
    const tokens = [events[0], events[2], events[4]]
    expect(new Set(tokens).size).toBe(3)
    expect(tokens.every(token => typeof token === "string" && /^[0-9a-f-]{36}$/.test(token))).toBe(true)
    expect(await store.sessionGeneration.getValue()).toBe(events[4])
  })
})

describe("unknown-channel failures", () => {
  it.each([new Error("Synthetic lookup failure"), new sessionService.SessionFailure("unavailable"), new sessionService.SessionFailure("failed")])("keeps unfiltered and denylist destinations after %s", async error => {
    await store.saveAccountSetup(snapshot, {
      ...store.emptySetup(), playlists: ["PLplain", "PLallow", "PLdeny"], filters: {
        PLallow: { mode: "allow", enabled: true, channels: [] },
        PLdeny: { mode: "deny", enabled: true, channels: [] }
      }
    })
    vi.mocked(youtube.fetchVideoChannel).mockRejectedValueOnce(error)
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })).resolves.toEqual({ ok: true })
    expect(vi.mocked(youtube.addVideoToPlaylist).mock.calls.map(call => call[1])).toEqual(["PLplain", "PLdeny"])
  })

  it.each(["consent", "revoked", "accountChanged", "signedOut"])("aborts all destinations after a %s failure", async code => {
    await store.saveAccountSetup(snapshot, {
      ...store.emptySetup(), playlists: ["PLplain", "PLallow"], filters: {
        PLallow: { mode: "allow", enabled: true, channels: [] }
      }
    })
    vi.mocked(youtube.fetchVideoChannel).mockRejectedValueOnce(new sessionService.SessionFailure(code))
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey, consentGeneration: snapshot.consentGeneration })).resolves.toMatchObject({ kind: code })
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })
})

describe("read-only saved-account view", () => {
  it("returns saved account playlists without a serving tab", async () => {
    vi.mocked(sessionService.findSession).mockResolvedValue({ kind: "noTab" })
    const result = await send({ action: "fetchPlaylists" }, ui)
    expect(result).toMatchObject({ kind: "cached", accounts: [{ accountKey: snapshot.accountKey, setup: { playlists: ["PL1"] } }] })
    expect(result).not.toHaveProperty("session")
    expect(youtube.fetchUserPlaylists).not.toHaveBeenCalled()
  })

  it("keeps a private no-tab caller isolated from normal-window saved accounts", async () => {
    vi.mocked(sessionService.findSession).mockResolvedValue({ kind: "noTab" })
    vi.spyOn(fakeBrowser.windows, "get").mockImplementation(async () => ({ id: windowId, incognito: true, focused: true, alwaysOnTop: false }))
    await expect(send({ action: "fetchPlaylists" }, ui)).resolves.toEqual({ kind: "noTab" })
    expect(youtube.fetchUserPlaylists).not.toHaveBeenCalled()
  })

  it("retires legacy video history on background startup", async () => {
    const retire = vi.spyOn(store, "retireLegacyVideoCache").mockResolvedValue()
    background.main()
    expect(retire).toHaveBeenCalledOnce()
  })
})

describe("background-owned data clearing", () => {
  it("clears data and permits later transitions after frozen-tab invalidations never settle", async () => {
    vi.useFakeTimers()
    if (!origin.tab) throw new Error("Serving tab missing")
    const servingTab = origin.tab
    vi.mocked(fakeBrowser.tabs.query).mockImplementation(async () => [{ ...servingTab, frozen: true }])
    vi.spyOn(fakeBrowser.scripting, "executeScript").mockImplementation(details => {
      if (details.func === sessionService.setPageAccess && "args" in details && details.args?.[0] === false) return new Promise(() => {})
      return Promise.resolve([])
    })
    vi.mocked(sessionService.findSession).mockResolvedValue({ kind: "noTab" })
    const clearLocal = vi.spyOn(fakeBrowser.storage.local, "clear")
    let finished = false
    const clearing = send({ action: "clearAllData" }, ui).then(reply => { finished = true; return reply })
    const granting = send({ action: "grantSession" }, ui)
    await vi.advanceTimersByTimeAsync(9999)
    expect(finished).toBe(false)
    expect(clearLocal).not.toHaveBeenCalled()
    expect(await store.sessionConsent.getValue()).toBe(-1)
    await vi.advanceTimersByTimeAsync(4002)
    expect(finished).toBe(true)
    await expect(clearing).resolves.toEqual({ ok: true })
    await expect(granting).resolves.toEqual({ kind: "noTab" })
    expect(await fakeBrowser.storage.local.get([`account:${snapshot.accountKey}`, "savedAccountKeys"])).toEqual({})
    expect(await store.sessionConsent.getValue()).toBe(store.CONSENT_VERSION)
    const revoke = send({ action: "revokeSession" }, ui)
    await vi.advanceTimersByTimeAsync(14001)
    await expect(revoke).resolves.toEqual({ kind: "revoked" })
    await expect(send({ action: "grantSession" }, ui)).resolves.toEqual({ kind: "noTab" })
  })

  it("waits for sibling deletions before reporting a failure or allowing a new grant", async () => {
    const clearLocal = fakeBrowser.storage.local.clear.bind(fakeBrowser.storage.local)
    let release = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(fakeBrowser.storage.local, "clear").mockImplementationOnce(async () => {
      await held
      await clearLocal()
    })
    const clearSync = vi.spyOn(fakeBrowser.storage.sync, "clear").mockRejectedValueOnce(new Error("Synthetic deletion failure"))
    vi.mocked(sessionService.findSession).mockResolvedValue({ kind: "noTab" })
    let finished = false
    const clearing = send({ action: "clearAllData" }, ui).then(reply => { finished = true; return reply })
    await vi.waitFor(() => expect(clearSync).toHaveBeenCalledOnce())
    const granting = send({ action: "grantSession" }, ui)
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(finished).toBe(false)
      expect(await store.sessionConsent.getValue()).toBe(-1)
    } finally {
      release()
      await clearing
      await granting
    }
    await expect(clearing).resolves.toMatchObject({ kind: "unavailable" })
    await expect(granting).resolves.toEqual({ kind: "noTab" })
    expect(await store.sessionConsent.getValue()).toBe(store.CONSENT_VERSION)
    expect(await store.sessionGeneration.getValue()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it.each(["/popup.html", "/options.html"])("allows %s to erase data before consent", async page => {
    await store.sessionConsent.setValue(0)
    await store.theme.setValue("dark")
    await store.watchLaterShortcut.setValue("Control+S")
    await expect(send({ action: "clearAllData" }, { ...ui, url: fakeBrowser.runtime.getURL(page) })).resolves.toEqual({ ok: true })
    expect(await fakeBrowser.storage.local.get([`account:${snapshot.accountKey}`, "savedAccountKeys", "watchLaterShortcut"])).toEqual({})
    expect(await store.theme.getValue()).toBe("system")
    expect(sessionService.findSession).not.toHaveBeenCalled()
    expect(youtube.fetchUserPlaylists).not.toHaveBeenCalled()
  })

  it.each([0, store.CONSENT_VERSION])("rejects content, foreign, subframe and unrelated extension senders with consent %s", async consent => {
    await store.sessionConsent.setValue(consent)
    for (const sender of [origin, { ...ui, id: "foreign" }, { ...ui, frameId: 2 }, { ...ui, url: fakeBrowser.runtime.getURL("/other.html") }]) {
      await expect(send({ action: "clearAllData" }, sender)).resolves.toMatchObject({ kind: "unavailable" })
    }
    expect((await store.getAccountSetup(snapshot)).playlists).toEqual(["PL1"])
    expect(await store.sessionConsent.getValue()).toBe(consent)
  })

  it("revokes page work before draining writes and serializes a concurrent grant behind deletion", async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => { release = resolve })
    const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
    const account = `account:${snapshot.accountKey}`
    const writing = vi.spyOn(fakeBrowser.storage.local, "set").mockImplementation(async values => {
      if (account in values) await held
      await set(values)
    })
    const first = send({ action: "changeSetup", session: snapshot, change: { kind: "auto", playlistId: "PL2", checked: true } }, ui)
    try {
      await vi.waitFor(() => expect(writing).toHaveBeenCalledWith(expect.objectContaining({ [account]: expect.any(Object) })))
      const queued = send({ action: "changeSetup", session: snapshot, change: { kind: "shortcut", playlistId: "PL2" } }, ui)
      await vi.waitFor(() => expect(sessionService.checkSession).toHaveBeenCalledTimes(4))
      const clearStorage = vi.spyOn(fakeBrowser.storage.local, "clear")
      const clearing = send({ action: "clearAllData" }, ui)
      await vi.waitFor(async () => expect(await store.sessionConsent.getValue()).toBe(-1))
      expect(vi.mocked(sessionService.reconcileScripts).mock.calls.length).toBeGreaterThan(1)
      expect(await store.sessionConsent.getValue()).toBe(-1)
      expect(await store.sessionGeneration.getValue()).not.toBe(snapshot.consentGeneration)
      expect(clearStorage).not.toHaveBeenCalled()
      const granting = send({ action: "grantSession" }, ui)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(await store.sessionConsent.getValue()).toBe(-1)
      vi.mocked(sessionService.findSession).mockResolvedValue({ kind: "noTab" })
      release()
      await first
      await expect(clearing).resolves.toEqual({ ok: true })
      await expect(granting).resolves.toEqual({ kind: "noTab" })
      await expect(queued).resolves.toMatchObject({ kind: expect.stringMatching(/revoked|consent/) })
      expect(await fakeBrowser.storage.local.get([account, "savedAccountKeys"])).toEqual({})
    } finally {
      release()
      await first
    }
  })

  it("reports deletion failure instead of acknowledging success", async () => {
    vi.spyOn(fakeBrowser.storage.local, "clear").mockRejectedValueOnce(new Error("Storage unavailable"))
    await expect(send({ action: "clearAllData" }, ui)).resolves.toMatchObject({ kind: "unavailable" })
    expect(await store.sessionConsent.getValue()).not.toBe(store.CONSENT_VERSION)
  })
})

describe("first account choice cache", () => {
  it("saves fetched titles with the first explicit choice, while leaving an untouched account unregistered", async () => {
    await fakeBrowser.storage.local.remove([`account:${snapshot.accountKey}`, "savedAccountKeys"])
    await expect(send({ action: "fetchPlaylists" }, ui)).resolves.toMatchObject({ kind: "ready", playlists: [{ id: "PL1", title: "Owned" }] })
    expect(await fakeBrowser.storage.local.get([`account:${snapshot.accountKey}`, "savedAccountKeys"])).toEqual({})
    await send({ action: "changeSetup", session: snapshot, change: { kind: "auto", playlistId: "PL1", checked: true } }, ui)
    vi.mocked(sessionService.findSession).mockResolvedValue({ kind: "noTab" })
    await expect(send({ action: "fetchPlaylists" }, ui)).resolves.toMatchObject({
      kind: "cached", accounts: [{ accountKey: snapshot.accountKey, setup: {
        playlists: ["PL1"], cachedPlaylists: [{ id: "PL1", title: "Owned" }], cachedAt: expect.any(Number)
      } }]
    })
  })

  it("does not persist first-choice titles or selections for a private caller", async () => {
    await fakeBrowser.storage.local.remove([`account:${snapshot.accountKey}`, "savedAccountKeys"])
    vi.spyOn(fakeBrowser.windows, "get").mockImplementation(async () => ({ id: windowId, incognito: true, focused: true, alwaysOnTop: false }))
    await expect(send({ action: "changeSetup", session: { ...snapshot, incognito: true }, change: { kind: "auto", playlistId: "PL1", checked: true } }, ui)).resolves.toMatchObject({ kind: "unavailable" })
    expect(await fakeBrowser.storage.local.get([`account:${snapshot.accountKey}`, "savedAccountKeys"])).toEqual({})
  })

  it.each(["revoked", "accountChanged"])("rejects %s after fetching first-choice titles", async code => {
    await fakeBrowser.storage.local.remove([`account:${snapshot.accountKey}`, "savedAccountKeys"])
    vi.mocked(youtube.fetchUserPlaylists).mockImplementationOnce(async () => {
      if (code === "revoked") await store.sessionGeneration.setValue("generation-after-regrant")
      else vi.mocked(sessionService.checkSession).mockRejectedValueOnce(new sessionService.SessionFailure("accountChanged"))
      return [{ id: "PL1", title: "Owned" }]
    })
    await expect(send({ action: "changeSetup", session: snapshot, change: { kind: "auto", playlistId: "PL1", checked: true } }, ui)).resolves.toMatchObject({ kind: code })
    expect(await fakeBrowser.storage.local.get([`account:${snapshot.accountKey}`, "savedAccountKeys"])).toEqual({})
  })
})
