import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import App from "@/entrypoints/popup/App"
import * as store from "@/lib/storage"
import type { ReadyView } from "@/components/SessionAccess"

const session = {
  tabId: 7, accountKey: "account0000000001", incognito: false,
  consentGeneration: "12345678-1234-4234-8234-123456789abc"
}

const view: ReadyView = {
  kind: "ready", session,
  playlists: [{ id: "PL1", title: "Watch queue" }, { id: "PL2", title: "Music" }],
  setup: { ...store.emptySetup(), playlists: ["PL1"], shortcutPlaylistId: "PL2" }, unclaimed: false
}

beforeEach(async () => {
  const window = await fakeBrowser.windows.create({})
  vi.spyOn(fakeBrowser.windows, "getCurrent").mockImplementation(async () => (window))
  vi.spyOn(fakeBrowser.tabs, "query").mockImplementation(async () => ([]))
})

describe("consent and session states", () => {
  it("reads no account setup or page data before agreement", async () => {
    const send = vi.spyOn(fakeBrowser.runtime, "sendMessage")
    const cached = vi.spyOn(store.legacyCachedPlaylists, "getValue")
    render(<App />)
    expect(await screen.findByRole("button", { name: "Agree and continue" })).toBeInTheDocument()
    expect(screen.getByText(/Cookies never leave the page/)).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
    expect(cached).not.toHaveBeenCalled()
    expect(screen.queryByText("Auto-add playlists")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Record Shortcut" })).not.toBeInTheDocument()
    expect(screen.queryByRole("spinbutton", { name: "Required watch percentage" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
  })
  it("only mounts playlist controls after the user agrees", async () => {
    const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => view).mockImplementationOnce(async () => {
      await store.sessionConsent.setValue(store.CONSENT_VERSION)
      return view
    })
    render(<App />)
    await userEvent.click(await screen.findByRole("button", { name: "Agree and continue" }))
    expect(await screen.findByText("Auto-add playlists")).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Record Shortcut" })).toBeEnabled()
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ action: "grantSession" }))
  })
  it.each([
    ["signedOut", /Sign in on YouTube/],
    ["noTab", /Open YouTube, then check again/],
    ["accountChanged", /The YouTube account changed/],
    ["unavailable", /YouTube access is unavailable/]
  ])("shows recovery for %s without account controls", async (kind, text) => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ kind }))
    render(<App />)
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open YouTube" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument()
    expect(screen.queryByText("Auto-add playlists")).not.toBeInTheDocument()
    expect(screen.queryByText("Shortcut playlist")).not.toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: "Required watch percentage" })).toBeEnabled()
    expect(screen.getByRole("switch", { name: "Toast notifications" })).toBeEnabled()
    expect(screen.getByRole("switch", { name: "One-click queue button" })).toBeEnabled()
    expect(screen.getByRole("switch", { name: "Right-click opens video menu" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Record Shortcut" })).toBeEnabled()
  })
  it("discards a stale ready response after consent is revoked", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    let resolveView: ((value: ReadyView) => void) | undefined
    const waiting = new Promise<ReadyView>(resolve => { resolveView = resolve })
    const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(() => (waiting))
    render(<App />)
    await waitFor(() => expect(send).toHaveBeenCalled())
    await act(async () => { await store.sessionConsent.setValue(-1) })
    expect(await screen.findByText("YouTube access was revoked.")).toBeInTheDocument()
    await act(async () => { resolveView?.(view); await waiting })
    expect(screen.queryByText("Auto-add playlists")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Record Shortcut" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
  })
})

describe("account choices", () => {
  it("sends an explicit captured account with changes instead of updating legacy selections", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => (view))
    render(<App />)
    await screen.findByText("Auto-add playlists")
    send.mockImplementation(async () => ({ setup: { ...view.setup, playlists: ["PL1", "PL2"] } }))
    await userEvent.click(screen.getAllByRole("checkbox")[1]!)
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({
      action: "changeSetup", session: view.session, change: { kind: "auto", playlistId: "PL2", checked: true }
    })))
    expect(await store.playlists.getValue()).toEqual([])
  })
  it("keeps old choices inactive while ownership cannot be verified", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ ...view, unclaimed: true }))
    render(<App />)
    expect(await screen.findByText(/Your old playlist choices are saved and inactive/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Claim old setup/ })).not.toBeInTheDocument()
  })
  it("disables account edits in a private window", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ ...view, session: { ...view.session, incognito: true } }))
    render(<App />)
    await screen.findByText("Auto-add playlists")
    expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/Private window/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record Shortcut" })).toBeEnabled()
  })
})

describe("shared settings without a live account", () => {
  it("keeps shared controls available while account lookup is pending", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(() => new Promise(() => {}))
    render(<App />)
    expect(await screen.findByRole("button", { name: "Record Shortcut" })).toBeEnabled()
    expect(screen.getByRole("status")).toHaveTextContent("Checking YouTube session...")
    expect(screen.queryByText("Auto-add playlists")).not.toBeInTheDocument()
  })
  it("stops recording when consent is revoked", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ kind: "signedOut" }))
    render(<App />)
    await userEvent.click(await screen.findByRole("button", { name: "Record Shortcut" }))
    await act(async () => { await store.sessionConsent.setValue(-1) })
    await userEvent.keyboard("x")
    expect(await store.watchLaterShortcut.getValue()).toBe("")
    expect(screen.queryByRole("button", { name: "Recording..." })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
  })
  it.each(["signedOut", "noTab", "unavailable", "accountChanged"])("saves only shared settings while %s", async kind => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    const savedAccount = { accountKey: session.accountKey, incognito: false }
    await store.saveAccountSetup(savedAccount, view.setup)
    const saveAccount = vi.spyOn(store, "saveAccountSetup")
    const legacyChoices = vi.spyOn(store.playlists, "setValue")
    const legacyTarget = vi.spyOn(store.addToPlaylistID, "setValue")
    const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ kind }))
    render(<App />)
    const percentage = await screen.findByRole("spinbutton", { name: "Required watch percentage" })
    await waitFor(() => expect(percentage).toHaveValue(50))
    await userEvent.clear(percentage)
    await userEvent.type(percentage, "75")
    await userEvent.click(screen.getByRole("switch", { name: "Toast notifications" }))
    await userEvent.click(screen.getByRole("switch", { name: "One-click queue button" }))
    await userEvent.click(screen.getByRole("switch", { name: "Right-click opens video menu" }))
    await userEvent.click(screen.getByRole("button", { name: "Record Shortcut" }))
    await userEvent.keyboard("{Control>}s{/Control}")
    await waitFor(async () => {
      expect(await store.requiredWatchPercentage.getValue()).toBe(75)
      expect(await store.toastEnabled.getValue()).toBe(false)
      expect(await store.queueButtonEnabled.getValue()).toBe(false)
      expect(await store.cardContextMenu.getValue()).toBe(true)
      expect(await store.watchLaterShortcut.getValue()).toBe("Control+S")
    })
    expect(await store.getAccountSetup(savedAccount)).toEqual(view.setup)
    expect(saveAccount).not.toHaveBeenCalled()
    expect(legacyChoices).not.toHaveBeenCalled()
    expect(legacyTarget).not.toHaveBeenCalled()
    for (const call of send.mock.calls) {
      expect(call).toEqual([expect.objectContaining({ action: "fetchPlaylists" })])
    }
  })
})

describe("cached account setups", () => {
  const accounts: store.SavedAccount[] = [
    { accountKey: session.accountKey, setup: { ...view.setup, cachedPlaylists: view.playlists, cachedAt: 123 } },
    { accountKey: "account0000000002", setup: { ...store.emptySetup(), cachedPlaylists: [{ id: "PL3", title: "Second account" }] } }
  ]
  it("groups saved titles and selections without permitting account edits", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ kind: "cached", accounts }))
    render(<App />)
    const cached = await screen.findByRole("region", { name: "Cached playlists" })
    const first = within(cached).getByRole("region", { name: "Saved setup 1" })
    const second = within(cached).getByRole("region", { name: "Saved setup 2" })
    expect(within(first).getByText("Watch queue")).toBeInTheDocument()
    expect(within(first).getByText("Auto-add")).toBeInTheDocument()
    expect(within(first).getByText("Music")).toBeInTheDocument()
    expect(within(first).getByText("Shortcut playlist")).toBeInTheDocument()
    expect(within(second).getByText("Second account")).toBeInTheDocument()
    expect(within(second).getByText("Not selected")).toBeInTheDocument()
    expect(within(cached).queryByRole("checkbox")).not.toBeInTheDocument()
    expect(within(cached).queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record Shortcut" })).toBeEnabled()
    const open = vi.spyOn(fakeBrowser.tabs, "create")
    await userEvent.click(screen.getByRole("button", { name: "Open YouTube" }))
    expect(open).toHaveBeenCalledWith({ url: "https://www.youtube.com/" })
    await userEvent.click(screen.getByRole("button", { name: "Check again" }))
    expect(await screen.findByRole("region", { name: "Cached playlists" })).toBeInTheDocument()
    for (const call of send.mock.calls) {
      expect(call).toEqual([expect.objectContaining({ action: "fetchPlaylists" })])
    }
  })
  it.each([
    { kind: "cached", accounts: [{ ...accounts[0], accountKey: "invalid" }] },
    { kind: "cached", accounts: [{ ...accounts[0], setup: { ...accounts[0]?.setup, playlists: [false] } }] },
    { kind: "cached", accounts: null },
    { kind: "ready", session, playlists: view.playlists, setup: {}, unclaimed: false }
  ])("rejects malformed session replies", async reply => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => reply)
    render(<App />)
    expect(await screen.findByText(/YouTube access is unavailable/)).toBeInTheDocument()
    expect(screen.queryByText("Watch queue")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Record Shortcut" })).toBeEnabled()
  })
})
