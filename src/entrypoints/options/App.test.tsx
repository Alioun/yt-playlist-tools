import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import App from "@/entrypoints/options/App"
import { ThemeProvider } from "@/components/theme-provider"
import * as store from "@/lib/storage"

beforeEach(async () => {
  const window = await fakeBrowser.windows.create({})
  vi.spyOn(fakeBrowser.windows, "getCurrent").mockImplementation(async () => (window))
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  await import("@/components/SettingsPanel")
})

it("replaces Google authorization controls with session consent and keeps theme settings", async () => {
  render(<ThemeProvider><App /></ThemeProvider>)
  expect(await screen.findByRole("button", { name: "Agree and continue" })).toBeInTheDocument()
  expect(screen.queryByText(/Sign in with Google/)).not.toBeInTheDocument()
  expect(screen.getByText("Theme")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Clear All Data" })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Record Shortcut" })).not.toBeInTheDocument()
})
it("can revoke access without claiming to sign out of YouTube", async () => {
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ kind: "signedOut" }))
  render(<ThemeProvider><App /></ThemeProvider>)
  await userEvent.click(await screen.findByRole("button", { name: "Revoke access" }))
  await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ action: "revokeSession" })))
  expect(screen.queryByRole("button", { name: "Sign Out" })).not.toBeInTheDocument()
})
it("keeps Clear All Data reachable before agreement", async () => {
  const send = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ ok: true }))
  render(<ThemeProvider><App /></ThemeProvider>)
  await userEvent.click(await screen.findByRole("button", { name: "Clear All Data" }))
  await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ action: "clearAllData" })))
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
})

it("offers the same shared settings without a live account", async () => {
  await store.sessionConsent.setValue(store.CONSENT_VERSION)
  vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async () => ({ kind: "noTab" }))
  render(<ThemeProvider><App /></ThemeProvider>)
  expect(await screen.findByRole("button", { name: "Record Shortcut" })).toBeEnabled()
  expect(screen.getByRole("spinbutton", { name: "Required watch percentage" })).toBeEnabled()
  expect(screen.getByRole("switch", { name: "Toast notifications" })).toBeEnabled()
  expect(screen.getByRole("switch", { name: "One-click queue button" })).toBeEnabled()
  expect(screen.getByRole("switch", { name: "Right-click opens video menu" })).toBeEnabled()
  expect(screen.queryByText("Auto-add playlists")).not.toBeInTheDocument()
})
