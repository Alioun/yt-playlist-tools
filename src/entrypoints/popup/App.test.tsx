import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import App from "@/entrypoints/popup/App"
import * as store from "@/lib/storage"
import type { ReadyView } from "@/components/SessionAccess"

const view: ReadyView = {
  kind: "ready", session: { tabId: 7, accountKey: "account0000000001", incognito: false },
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
  })
  it("only mounts playlist controls after the user agrees", async () => {
    const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => (view))
    render(<App />)
    await userEvent.click(await screen.findByRole("button", { name: "Agree and continue" }))
    expect(await screen.findByText("Auto-add playlists")).toBeInTheDocument()
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
  it("offers an explicit claim rather than silently applying legacy choices", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ ...view, unclaimed: true }))
    render(<App />)
    expect(await screen.findByRole("button", { name: "Claim old setup for this account" })).toBeInTheDocument()
  })
  it("disables account edits in a private window", async () => {
    await store.sessionConsent.setValue(store.CONSENT_VERSION)
    vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ ...view, session: { ...view.session, incognito: true } }))
    render(<App />)
    await screen.findByText("Auto-add playlists")
    expect(screen.getAllByRole("checkbox")[0]).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByText(/Private window/)).toBeInTheDocument()
  })
})
