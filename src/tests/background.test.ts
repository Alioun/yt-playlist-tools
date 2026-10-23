import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import background from "@/entrypoints/background"
import * as store from "@/lib/storage"
import * as youtube from "@/lib/youtube"
import * as sessionService from "@/lib/session"

vi.mock("@/lib/youtube", () => ({ fetchUserPlaylists: vi.fn(), addVideoToPlaylist: vi.fn(), fetchVideoChannel: vi.fn(), fetchChannel: vi.fn() }))
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), findSession: vi.fn(), checkSession: vi.fn(), reconcileScripts: vi.fn(async () => {}) }))

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
})

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
