import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

vi.mock("@/lib/youtube", () => ({ fetchUserPlaylists: vi.fn(async () => [{ id: "PL1", title: "Owned" }]), addVideoToPlaylist: vi.fn(), fetchVideoChannel: vi.fn(), fetchChannel: vi.fn() }))
vi.mock("@/lib/session", async original => ({ ...await original<typeof import("@/lib/session")>(), findSession: vi.fn(async () => ({ kind: "noTab" })), checkSession: vi.fn(async () => {}), reconcileScripts: vi.fn(async () => {}) }))

const snapshot = { tabId: 42, accountKey: "account0000000001", incognito: false, consentGeneration: "generation-1" }

async function contexts() {
  const backgroundStore = await import("@/lib/storage")
  const { default: background } = await import("@/entrypoints/background")
  const window = await fakeBrowser.windows.create({ incognito: false })
  if (!window || window.id === undefined) throw new Error("Window missing")
  const windowId = window.id
  vi.spyOn(fakeBrowser.windows, "getCurrent").mockImplementation(async () => window)
  type Listener = Parameters<typeof fakeBrowser.runtime.onMessage.addListener>[0]
  let listener: Listener | undefined
  vi.spyOn(fakeBrowser.runtime.onMessage, "addListener").mockImplementation(fn => { listener = fn })
  background.main()
  const send = (message: Record<string, unknown>) => new Promise<unknown>(resolve => {
    if (!listener) throw new Error("Background listener missing")
    listener({ windowId, ...message }, { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL("/popup.html") }, resolve)
  })
  const { isRecord } = await import("@/lib/session")
  const ipc = vi.spyOn(fakeBrowser.runtime, "sendMessage").mockImplementation(async (message: unknown) => {
    if (!isRecord(message)) throw new Error("Invalid IPC request")
    return send({ ...message })
  })
  vi.resetModules()
  const uiStore = await import("@/lib/storage")
  expect(uiStore.saveAccountSetup).not.toBe(backgroundStore.saveAccountSetup)
  const { SettingsPanel } = await import("@/components/SettingsPanel")
  const { ThemeProvider } = await import("@/components/theme-provider")
  return { backgroundStore, uiStore, ipc, send, mount: () => render(<ThemeProvider><SettingsPanel /></ThemeProvider>) }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})

it("clears through background IPC without resurrecting a write from another module context", async () => {
  const { backgroundStore, uiStore, ipc, send, mount } = await contexts()
  await backgroundStore.sessionGeneration.setValue(snapshot.consentGeneration)
  await backgroundStore.sessionConsent.setValue(backgroundStore.CONSENT_VERSION)
  let release = () => {}
  let started = () => {}
  const writing = new Promise<void>(resolve => { started = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const set = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local)
  vi.spyOn(fakeBrowser.storage.local, "set").mockImplementation(async values => {
    if (`account:${snapshot.accountKey}` in values) {
      started()
      await held
    }
    await set(values)
  })
  const clear = vi.spyOn(fakeBrowser.storage.local, "clear")
  const saving = send({ action: "changeSetup", session: snapshot, change: { kind: "auto", playlistId: "PL1", checked: true } })
  try {
    await writing
    mount()
    await userEvent.click(screen.getByRole("button", { name: "Clear All Data" }))
    await waitFor(async () => expect(await uiStore.sessionConsent.getValue()).not.toBe(uiStore.CONSENT_VERSION))
    await act(async () => {
      release()
      await saving
      await Promise.all(ipc.mock.results.map(result => result.value))
    })
    expect(clear).toHaveBeenCalledOnce()
    expect(await fakeBrowser.storage.local.get([`account:${snapshot.accountKey}`, "savedAccountKeys"])).toEqual({})
    expect(ipc).toHaveBeenCalledWith(expect.objectContaining({ action: "clearAllData" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  } finally {
    release()
    await saving
  }
})

it("clears before consent through the same authenticated IPC", async () => {
  const { uiStore, ipc, mount } = await contexts()
  await uiStore.playlists.setValue(["PLlegacy"])
  await uiStore.theme.setValue("dark")
  mount()
  await userEvent.click(screen.getByRole("button", { name: "Clear All Data" }))
  await waitFor(async () => expect(await uiStore.playlists.getValue()).toEqual([]))
  expect(await uiStore.theme.getValue()).toBe("system")
  expect(ipc).toHaveBeenCalledWith(expect.objectContaining({ action: "clearAllData" }))
})

it.each([undefined, { ok: false }, { kind: "unavailable" }, { ok: "true" }])("shows failure for an unsuccessful clear reply %j", async reply => {
  const { ipc, mount } = await contexts()
  ipc.mockImplementation(async () => reply)
  mount()
  await userEvent.click(screen.getByRole("button", { name: "Clear All Data" }))
  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't clear extension data. Try again.")
})

it("shows an IPC failure and can retry successfully", async () => {
  const { ipc, mount } = await contexts()
  ipc.mockRejectedValueOnce(new Error("Background unavailable"))
  mount()
  await userEvent.click(screen.getByRole("button", { name: "Clear All Data" }))
  expect(await screen.findByRole("alert")).toBeInTheDocument()
  await userEvent.click(screen.getByRole("button", { name: "Clear All Data" }))
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument())
})
