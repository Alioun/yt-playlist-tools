import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import App from "@/entrypoints/popup/App"
import * as store from "@/lib/storage"

const PLAYLISTS = [
  { id: "PL1", title: "Watch queue" },
  { id: "PL2", title: "Music" }
]

/** Stubs the background round-trip the popup makes on mount. */
function stubBackground(response: unknown) {
  const sendMessage = vi.fn(async () => response)
  Object.assign(fakeBrowser.runtime, {
    sendMessage,
    openOptionsPage: vi.fn(async () => {})
  })
  return sendMessage
}

let renderResult: ReturnType<typeof render> | null = null

async function renderPopup(response: unknown = { playlists: PLAYLISTS }) {
  const sendMessage = stubBackground(response)
  renderResult = render(<App />)
  // Wait for the initial fetch to settle so tests never race the spinner.
  await waitFor(() => expect(sendMessage).toHaveBeenCalled())
  return sendMessage
}

beforeEach(() => {
  fakeBrowser.reset()
})

describe("loading playlists", () => {
  it("asks the background for playlists on mount", async () => {
    const sendMessage = await renderPopup()
    expect(sendMessage).toHaveBeenCalledWith({ action: "fetchPlaylists" })
  })

  it("renders every playlist title", async () => {
    await renderPopup()
    await waitFor(() => {
      expect(screen.getAllByText("Watch queue").length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText("Music").length).toBeGreaterThan(0)
  })

  it("translates the unauthorized error into an actionable message", async () => {
    // The background sends the literal string "No access token"; the popup is
    // the only place that turns it into something a user can act on. This is a
    // cross-file string contract -- renaming one side silently degrades the UI.
    await renderPopup({ error: "No access token", playlists: [] })

    await waitFor(() => {
      expect(screen.getByText(/Sign in from Options/i)).toBeInTheDocument()
    })
  })

  it("shows other errors verbatim", async () => {
    await renderPopup({ error: "quotaExceeded", playlists: [] })
    await waitFor(() => {
      expect(screen.getByText("quotaExceeded")).toBeInTheDocument()
    })
  })

  it("reports an empty account rather than rendering nothing", async () => {
    await renderPopup({ playlists: [] })
    await waitFor(() => {
      expect(screen.getByText(/No playlists found/i)).toBeInTheDocument()
    })
  })

  it("surfaces a rejected message instead of spinning forever", async () => {
    const sendMessage = vi.fn(async () => {
      throw new Error("disconnected")
    })
    Object.assign(fakeBrowser.runtime, { sendMessage })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch playlists/i)).toBeInTheDocument()
    })
    // The button must come back out of its loading state.
    expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled()
  })

  it("refetches when Refresh is clicked", async () => {
    const sendMessage = await renderPopup()
    sendMessage.mockClear()

    await userEvent.click(screen.getByRole("button", { name: "Refresh" }))

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
  })
})

describe("startup latency", () => {
  it("paints cached playlists before the network round-trip returns", async () => {
    // The slow part is waking the MV3 service worker and paging through the
    // YouTube API. Rendering from cache first is what makes the popup feel
    // instant; without it the user stares at "Loading..." every single open.
    await store.cachedPlaylists.setValue([{ id: "PLc", title: "From cache" }])

    let releaseFetch!: () => void
    const pending = new Promise<void>((r) => (releaseFetch = r))
    const sendMessage = vi.fn(async () => {
      await pending
      return { playlists: PLAYLISTS }
    })
    Object.assign(fakeBrowser.runtime, {
      sendMessage,
      openOptionsPage: vi.fn(async () => {})
    })

    render(<App />)

    // Cached content is on screen while the request is still in flight.
    // It appears twice: once in the auto-add list, once in the shortcut list.
    expect((await screen.findAllByText("From cache")).length).toBeGreaterThan(0)
    expect(screen.queryByText(/No playlists found/i)).toBeNull()

    releaseFetch()
    await waitFor(() => expect(screen.getAllByText("Music").length).toBeGreaterThan(0))
  })

  it("does not claim the account is empty before the cache has loaded", async () => {
    await store.cachedPlaylists.setValue([])
    await renderPopup({ playlists: [] })

    await waitFor(() => {
      expect(screen.getByText(/No playlists found/i)).toBeInTheDocument()
    })
  })

  it("says Refreshing rather than Loading when a list is already shown", async () => {
    await store.cachedPlaylists.setValue([{ id: "PLc", title: "From cache" }])

    const sendMessage = vi.fn(() => new Promise(() => {}))
    Object.assign(fakeBrowser.runtime, {
      sendMessage,
      openOptionsPage: vi.fn(async () => {})
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /refreshing/i })).toBeInTheDocument()
    })
  })
})

describe("inline settings", () => {
  it("shows settings inside the popup rather than opening a page", async () => {
    await renderPopup()

    await userEvent.click(screen.getByRole("button", { name: /^settings$/i }))

    expect(
      await screen.findByRole("button", { name: /sign in with google/i })
    ).toBeInTheDocument()
    // The popup must stay open -- no navigation away.
    expect(fakeBrowser.runtime.openOptionsPage).not.toHaveBeenCalled()
  })

  it("hides the playlist controls while settings are open", async () => {
    await renderPopup()
    expect(screen.getByRole("switch", { name: /toast/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /^settings$/i }))

    expect(screen.queryByRole("switch", { name: /toast/i })).toBeNull()
  })

  it("goes back to the playlists", async () => {
    await renderPopup()
    await userEvent.click(screen.getByRole("button", { name: /^settings$/i }))

    await userEvent.click(
      await screen.findByRole("button", { name: /back to playlists/i })
    )

    expect(
      await screen.findByRole("switch", { name: /toast/i })
    ).toBeInTheDocument()
  })

  it("exposes the toggle state to assistive tech", async () => {
    await renderPopup()
    const button = screen.getByRole("button", { name: /^settings$/i })
    expect(button).toHaveAttribute("aria-expanded", "false")

    await userEvent.click(button)

    expect(
      screen.getByRole("button", { name: /back to playlists/i })
    ).toHaveAttribute("aria-expanded", "true")
  })
})

describe("auto-add selection", () => {
  it("persists a checked playlist", async () => {
    await renderPopup()
    const checkboxes = await screen.findAllByRole("checkbox")

    await userEvent.click(checkboxes[0]!)

    await waitFor(async () => {
      await expect(store.playlists.getValue()).resolves.toEqual(["PL1"])
    })
  })

  it("removes a playlist when unchecked", async () => {
    await store.playlists.setValue(["PL1", "PL2"])
    await renderPopup()

    const checkboxes = await screen.findAllByRole("checkbox")
    await waitFor(() => expect(checkboxes[0]!).toBeChecked())

    await userEvent.click(checkboxes[0]!)

    await waitFor(async () => {
      await expect(store.playlists.getValue()).resolves.toEqual(["PL2"])
    })
  })

  it("reflects previously saved selections", async () => {
    await store.playlists.setValue(["PL2"])
    await renderPopup()

    const checkboxes = await screen.findAllByRole("checkbox")
    await waitFor(() => {
      expect(checkboxes[0]!).not.toBeChecked()
      expect(checkboxes[1]!).toBeChecked()
    })
  })

  it("is reachable by keyboard and exposed to assistive tech", async () => {
    // The hand-rolled component this replaced was a styled <div> with no
    // tabindex and no role -- unreachable by keyboard and invisible to screen
    // readers. That is a large part of why the migration to real primitives
    // happened, so pin it.
    //
    // Note: actual Space activation is not asserted here. Base UI renders a
    // <button role="checkbox">, and happy-dom does not emulate native button
    // key activation, so a negative result would say nothing about the browser.
    await renderPopup()
    const checkboxes = await screen.findAllByRole("checkbox")
    const first = checkboxes[0]!

    expect(first).toHaveAttribute("role", "checkbox")
    expect(Number(first.getAttribute("tabindex") ?? "-1")).toBeGreaterThanOrEqual(0)

    first.focus()
    await waitFor(() => expect(first).toHaveFocus())
  })
})

describe("toggles", () => {
  it("persists the toast switch", async () => {
    await renderPopup()
    const toggle = await screen.findByRole("switch", { name: /toast/i })

    await userEvent.click(toggle)

    await waitFor(async () => {
      await expect(store.toastEnabled.getValue()).resolves.toBe(false)
    })
  })

  it("persists the duplicates switch", async () => {
    await renderPopup()
    const toggle = await screen.findByRole("switch", { name: /duplicates/i })

    await userEvent.click(toggle)

    await waitFor(async () => {
      await expect(store.preventDuplicates.getValue()).resolves.toBe(false)
    })
  })

  it("persists the one-click queue button switch", async () => {
    await renderPopup()
    const toggle = await screen.findByRole("switch", { name: /queue button/i })

    await userEvent.click(toggle)

    await waitFor(async () => {
      await expect(store.queueButtonEnabled.getValue()).resolves.toBe(false)
    })
  })

  it("loads saved toggle state", async () => {
    await store.toastEnabled.setValue(false)
    await renderPopup()

    await waitFor(() => {
      expect(screen.getByRole("switch", { name: /toast/i })).not.toBeChecked()
    })
  })
})

describe("watch percentage", () => {
  it("persists a typed value", async () => {
    await renderPopup()
    const input = await screen.findByRole("spinbutton")

    await userEvent.clear(input)
    await userEvent.type(input, "80")

    await waitFor(async () => {
      await expect(store.requiredWatchPercentage.getValue()).resolves.toBe(80)
    })
  })

  it("clamps out-of-range input to 0-100", async () => {
    await renderPopup()
    const input = await screen.findByRole("spinbutton")

    await userEvent.clear(input)
    await userEvent.type(input, "500")

    await waitFor(async () => {
      const stored = await store.requiredWatchPercentage.getValue()
      expect(stored).toBeLessThanOrEqual(100)
    })
  })

  it("renders a slider thumb", async () => {
    await renderPopup()
    const { container } = renderResult!

    await waitFor(() => {
      expect(container.querySelector('[data-slot="slider-thumb"]')).toBeTruthy()
    })
  })
})

describe("shortcut playlist", () => {
  it("selects a playlist for the keyboard shortcut", async () => {
    await renderPopup()

    // The shortcut list renders each playlist as a pressable button.
    const buttons = await screen.findAllByRole("button", { pressed: false })
    const target = buttons.find((b) => within(b).queryByText("Music"))
    expect(target).toBeDefined()

    await userEvent.click(target!)

    await waitFor(async () => {
      await expect(store.addToPlaylistID.getValue()).resolves.toBe("PL2")
    })
  })

  it("deselects when the same playlist is clicked twice", async () => {
    await store.addToPlaylistID.setValue("PL2")
    await renderPopup()

    const pressed = await screen.findByRole("button", { pressed: true })
    await userEvent.click(pressed)

    await waitFor(async () => {
      await expect(store.addToPlaylistID.getValue()).resolves.toBe("")
    })
  })
})

describe("channel filter editor", () => {
  const LOFI = { channelId: "UClofi", title: "Lofi Girl" }

  /**
   * A watch page in the active tab: the content script reports `videoId` and
   * the background resolves it to `channel`.
   */
  function onWatchPage(
    channel: typeof LOFI | null,
    videoId: string | null = "vid"
  ) {
    const sendMessage = vi.fn(async (message: { action: string }) =>
      message.action === "getChannelForTab"
        ? { channel }
        : { playlists: PLAYLISTS }
    )
    Object.assign(fakeBrowser.runtime, {
      sendMessage,
      openOptionsPage: vi.fn(async () => {})
    })
    Object.assign(fakeBrowser.tabs, {
      query: vi.fn(async () => [{ id: 7 }]),
      sendMessage: vi.fn(async () => ({ videoId }))
    })
    return sendMessage
  }

  async function openEditor(title = "Watch queue") {
    const label = await screen.findByRole("button", {
      name: new RegExp(`channel filter for ${title}`, "i")
    })
    await userEvent.click(label)
    return label
  }

  beforeEach(async () => {
    await store.playlists.setValue(["PL1"])
  })

  it("shows a label only on checked playlists", async () => {
    onWatchPage(LOFI)
    render(<App />)

    expect(
      await screen.findByRole("button", { name: /channel filter for watch queue: all channels/i })
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /channel filter for music/i })).toBeNull()
  })

  it("denies this video's channel on a playlist", async () => {
    const sendMessage = onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Deny" }))
    await userEvent.click(
      await screen.findByRole("button", { name: /add lofi girl \(this video\)/i })
    )

    expect(sendMessage).toHaveBeenCalledWith({
      action: "getChannelForTab",
      tabId: 7,
      videoId: "vid"
    })
    await waitFor(async () => {
      await expect(store.channelFilters.getValue()).resolves.toEqual({
        PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
      })
    })
    await expect(store.channelLabels.getValue()).resolves.toEqual({
      UClofi: { title: "Lofi Girl" }
    })
    expect(
      screen.getByRole("button", { name: /channel filter for watch queue: deny · 1/i })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /lofi girl is listed/i })).toBeDisabled()
  })

  it("removes a listed channel and its label", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })
    await store.channelLabels.setValue({ UClofi: { title: "Lofi Girl", handle: "@LofiGirl" } })
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    expect(screen.getByText("· @LofiGirl")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Remove Lofi Girl" }))

    await waitFor(async () => {
      await expect(store.channelLabels.getValue()).resolves.toEqual({})
    })
    await expect(store.channelFilters.getValue()).resolves.toEqual({
      PL1: { mode: "deny", enabled: true, channels: [] }
    })
  })

  it("switching off keeps the list", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })
    await store.channelLabels.setValue({ UClofi: { title: "Lofi Girl" } })
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Off" }))

    await waitFor(async () => {
      await expect(store.channelFilters.getValue()).resolves.toEqual({
        PL1: { mode: "deny", enabled: false, channels: ["UClofi"] }
      })
    })
    expect(
      screen.getByRole("button", { name: /channel filter for watch queue: all channels/i })
    ).toBeInTheDocument()
    // The kept list stays visible, read-only, with nothing to add to it.
    expect(screen.getByText(/kept for when deny is back on/i)).toBeInTheDocument()
    expect(screen.getByText("Lofi Girl")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Remove Lofi Girl" })).toBeNull()
    expect(screen.queryByRole("button", { name: /add lofi girl/i })).toBeNull()
  })

  it("allows only this video's channel on a playlist", async () => {
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Allow only" }))
    expect(
      screen.getByText(/no channels listed yet, so nothing is auto-added here/i)
    ).toBeInTheDocument()
    await userEvent.click(
      await screen.findByRole("button", { name: /add lofi girl \(this video\)/i })
    )

    await waitFor(async () => {
      await expect(store.channelFilters.getValue()).resolves.toEqual({
        PL1: { mode: "allow", enabled: true, channels: ["UClofi"] }
      })
    })
    expect(
      screen.getByRole("button", { name: /channel filter for watch queue: allow only · 1/i })
    ).toBeInTheDocument()
  })

  it("labels a kept list by its mode while the filter is off", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "allow", enabled: false, channels: ["UClofi", "UCother"] }
    })
    onWatchPage(LOFI)
    render(<App />)

    const label = await screen.findByRole("button", {
      name: /channel filter for watch queue: all channels · 2 allowed kept/i
    })
    await userEvent.click(label)
    expect(screen.getByText(/kept for when allow only is back on/i)).toBeInTheDocument()
  })

  it("turning back on in the same mode restores the list without asking", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: false, channels: ["UClofi"] }
    })
    await store.channelLabels.setValue({ UClofi: { title: "Lofi Girl" } })
    onWatchPage(LOFI)
    render(<App />)
    expect(
      await screen.findByRole("button", {
        name: /channel filter for watch queue: all channels · 1 denied kept/i
      })
    ).toBeInTheDocument()
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Deny" }))

    expect(screen.queryByRole("alertdialog")).toBeNull()
    await waitFor(async () => {
      await expect(store.channelFilters.getValue()).resolves.toEqual({
        PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
      })
    })
    expect(screen.getByRole("button", { name: "Remove Lofi Girl" })).toBeInTheDocument()
  })

  it("asks before switching Deny to Allow only, and keeps the list on cancel", async () => {
    const saved = { PL1: { mode: "deny" as const, enabled: true, channels: ["UClofi"] } }
    await store.channelFilters.setValue(saved)
    await store.channelLabels.setValue({ UClofi: { title: "Lofi Girl" } })
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Allow only" }))
    const dialog = screen.getByRole("alertdialog", { name: "Switch to Allow only?" })
    expect(dialog).toHaveTextContent("This clears the 1 denied channel.")

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))

    expect(screen.queryByRole("alertdialog")).toBeNull()
    await expect(store.channelFilters.getValue()).resolves.toEqual(saved)
    expect(screen.getByRole("button", { name: "Deny" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  it("clears the list once the switch to the other mode is confirmed", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "allow", enabled: true, channels: ["UClofi", "UCother"] }
    })
    await store.channelLabels.setValue({
      UClofi: { title: "Lofi Girl" },
      UCother: { title: "Other" }
    })
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Deny" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "This clears the 2 allowed channels."
    )
    await userEvent.click(screen.getByRole("button", { name: "Clear and switch" }))

    await waitFor(async () => {
      await expect(store.channelFilters.getValue()).resolves.toEqual({
        PL1: { mode: "deny", enabled: true, channels: [] }
      })
    })
    await expect(store.channelLabels.getValue()).resolves.toEqual({})
    expect(
      screen.getByRole("button", { name: /channel filter for watch queue: deny · 0/i })
    ).toBeInTheDocument()
  })

  it("asks before turning a kept list back on in the other mode", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: false, channels: ["UClofi"] }
    })
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Allow only" }))
    await userEvent.click(
      within(
        screen.getByRole("alertdialog", { name: "Turn on Allow only?" })
      ).getByRole("button", { name: "Clear and switch" })
    )

    await waitFor(async () => {
      await expect(store.channelFilters.getValue()).resolves.toEqual({
        PL1: { mode: "allow", enabled: true, channels: [] }
      })
    })
  })

  it("switches modes without asking when the list is empty", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: [] }
    })
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click(screen.getByRole("button", { name: "Allow only" }))

    expect(screen.queryByRole("alertdialog")).toBeNull()
    await waitFor(async () => {
      await expect(store.channelFilters.getValue()).resolves.toEqual({
        PL1: { mode: "allow", enabled: true, channels: [] }
      })
    })
  })

  it("disables the add button when the channel is unknown", async () => {
    onWatchPage(null)
    render(<App />)
    await openEditor()
    await userEvent.click(screen.getByRole("button", { name: "Deny" }))

    expect(
      await screen.findByRole("button", { name: /channel unknown/i })
    ).toBeDisabled()
  })

  it("does not look up a channel when the tab has no video", async () => {
    const sendMessage = onWatchPage(LOFI, null)
    render(<App />)
    await openEditor()
    await userEvent.click(screen.getByRole("button", { name: "Deny" }))

    expect(
      await screen.findByText(/open a youtube video to add its channel/i)
    ).toBeInTheDocument()
    expect(sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "getChannelForTab" })
    )
  })

  it("keeps the filter when its playlist is unchecked", async () => {
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })
    onWatchPage(LOFI)
    render(<App />)
    await openEditor()

    await userEvent.click((await screen.findAllByRole("checkbox"))[0]!)

    await waitFor(async () => {
      await expect(store.playlists.getValue()).resolves.toEqual([])
    })
    await expect(store.channelFilters.getValue()).resolves.toEqual({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull()
  })
})
