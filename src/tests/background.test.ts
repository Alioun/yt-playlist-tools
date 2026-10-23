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
const snapshot = { tabId: 42, accountKey: "account0000000001", incognito: false }
const videoId = "abcdefghijk"

function send(message: Record<string, unknown>, sender = origin): Promise<unknown> {
  return new Promise(resolve => {
    if (!listener) throw new Error("Background listener missing")
    expect(listener({ windowId, ...message }, sender, resolve)).toBe(true)
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (!window || window.id === undefined) throw new Error("Window missing")
  windowId = window.id
  const tab = await fakeBrowser.tabs.create({ url: "https://www.youtube.com/watch?v=abcdefghijk", windowId })
  origin = { id: fakeBrowser.runtime.id, url: tab.url, frameId: 0, tab: { ...tab, id: 42, incognito: false } }
  ui = { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }
  vi.spyOn(fakeBrowser.runtime.onMessage, "addListener").mockImplementation(fn => { listener = fn })
  vi.spyOn(fakeBrowser.tabs, "sendMessage").mockImplementation(async () => (undefined))
  vi.mocked(sessionService.findSession).mockImplementation(async () => ({ kind: "ready", session: snapshot }))
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
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey }, { ...origin, id: "other" })).resolves.toMatchObject({ kind: "unavailable" })
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey }, { ...origin, frameId: 3 })).resolves.toMatchObject({ kind: "unavailable" })
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
  it("refuses a private snapshot from a normal caller", async () => {
    await expect(send({ action: "changeSetup", session: { ...snapshot, incognito: true }, change: { kind: "shortcut", playlistId: "PL1" } }, ui)).resolves.toMatchObject({ kind: "accountChanged" })
  })
})

describe("automatic and shortcut adds", () => {
  it("binds the selected account's writes to the original tab", async () => {
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey })).resolves.toEqual({ ok: true })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith(snapshot, "PL1", videoId, expect.any(Number))
  })
  it("reports authoritative membership as already present", async () => {
    vi.mocked(youtube.addVideoToPlaylist).mockImplementation(async () => ({ alreadyIn: true }))
    await send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey })
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(42, { action: "showToast", toastMessage: "Video already in playlist." })
  })
  it("applies allowlists to unknown channels and leaves shortcut behavior independent", async () => {
    await store.saveAccountSetup(snapshot, { ...store.emptySetup(), playlists: ["PL1"], shortcutPlaylistId: "PL1", filters: { PL1: { mode: "allow", enabled: true, channels: [] } } })
    await send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey })
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    await send({ action: "addVideoToShortcutPlaylist", videoId, accountKey: snapshot.accountKey })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith(snapshot, "PL1", videoId, expect.any(Number))
  })
  it("stops after a write error without retrying or switching the account", async () => {
    await store.saveAccountSetup(snapshot, { ...store.emptySetup(), playlists: ["PL1", "PL2"] })
    vi.mocked(youtube.addVideoToPlaylist).mockRejectedValue(new sessionService.SessionFailure("unconfirmed"))
    await expect(send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey })).resolves.toMatchObject({ kind: "unconfirmed" })
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledOnce()
    expect(sessionService.findSession).not.toHaveBeenCalled()
  })
  it("expires queued adds before any delayed dispatch", async () => {
    let release: ((result: { alreadyIn: boolean }) => void) | undefined
    const waiting = new Promise<{ alreadyIn: boolean }>(resolve => { release = resolve })
    vi.mocked(youtube.addVideoToPlaylist).mockImplementationOnce(() => (waiting))
    const first = send({ action: "addVideoToPlaylists", videoId, accountKey: snapshot.accountKey })
    await vi.waitFor(() => expect(youtube.addVideoToPlaylist).toHaveBeenCalledOnce())
    const second = send({ action: "addVideoToPlaylists", videoId: "lmnopqrstuv", accountKey: snapshot.accountKey })
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
