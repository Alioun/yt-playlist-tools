import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { ThemeProvider } from "@/components/theme-provider"
import App from "@/entrypoints/options/App"
import * as auth from "@/lib/auth"
import * as store from "@/lib/storage"

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>()
  return {
    ...actual,
    getRedirectURI: vi.fn(() => "https://ext-id.chromiumapp.org/"),
    signInWithBroker: vi.fn(),
    signInWithOwnCredentials: vi.fn(),
    signOut: vi.fn(),
    isAuthorized: vi.fn(async () => false)
  }
})

function renderOptions() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  )
}

beforeEach(() => {
  fakeBrowser.reset()
  vi.mocked(auth.isAuthorized).mockResolvedValue(false)
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  )
})

describe("signed out", () => {
  it("offers one-click sign in", async () => {
    renderOptions()
    expect(
      await screen.findByRole("button", { name: /sign in with google/i })
    ).toBeInTheDocument()
  })

  it("calls the broker sign-in flow", async () => {
    vi.mocked(auth.signInWithBroker).mockResolvedValue(undefined)
    renderOptions()

    await userEvent.click(
      await screen.findByRole("button", { name: /sign in with google/i })
    )

    expect(auth.signInWithBroker).toHaveBeenCalled()
  })

  it("shows the sign-out controls once authorized", async () => {
    vi.mocked(auth.signInWithBroker).mockImplementation(async () => {
      vi.mocked(auth.isAuthorized).mockResolvedValue(true)
    })
    renderOptions()

    await userEvent.click(
      await screen.findByRole("button", { name: /sign in with google/i })
    )

    expect(
      await screen.findByRole("button", { name: /sign out/i })
    ).toBeInTheDocument()
  })

  it("surfaces a sign-in failure instead of silently doing nothing", async () => {
    vi.mocked(auth.signInWithBroker).mockRejectedValue(
      new Error("Auth server is unreachable")
    )
    renderOptions()

    await userEvent.click(
      await screen.findByRole("button", { name: /sign in with google/i })
    )

    expect(
      await screen.findByText(/Auth server is unreachable/i)
    ).toBeInTheDocument()
    // And must not claim success.
    expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull()
  })
})

describe("advanced: own credentials", () => {
  it("is collapsed by default", async () => {
    renderOptions()
    await screen.findByRole("button", { name: /advanced/i })
    expect(screen.queryByLabelText(/client id/i)).toBeNull()
  })

  it("reveals the redirect URI to copy into the Google console", async () => {
    renderOptions()

    await userEvent.click(await screen.findByRole("button", { name: /advanced/i }))

    // Users must copy this verbatim -- Google matches byte-for-byte.
    expect(
      await screen.findByText("https://ext-id.chromiumapp.org/")
    ).toBeInTheDocument()
  })

  it("persists the credentials as they are typed", async () => {
    renderOptions()
    await userEvent.click(await screen.findByRole("button", { name: /advanced/i }))

    await userEvent.type(await screen.findByLabelText(/client id/i), "my-id")

    await waitFor(async () => {
      await expect(store.clientID.getValue()).resolves.toBe("my-id")
    })
  })

  it("masks the client secret", async () => {
    renderOptions()
    await userEvent.click(await screen.findByRole("button", { name: /advanced/i }))

    const secret = await screen.findByLabelText(/client secret/i)
    expect(secret).toHaveAttribute("type", "password")
  })

  it("authorizes with the entered credentials", async () => {
    vi.mocked(auth.signInWithOwnCredentials).mockResolvedValue(undefined)
    await store.clientID.setValue("saved-id")
    await store.clientSecret.setValue("saved-secret")

    renderOptions()
    await userEvent.click(await screen.findByRole("button", { name: /advanced/i }))
    await userEvent.click(
      await screen.findByRole("button", { name: /authorize with own credentials/i })
    )

    expect(auth.signInWithOwnCredentials).toHaveBeenCalledWith(
      "saved-id",
      "saved-secret"
    )
  })
})

describe("signed in", () => {
  beforeEach(() => {
    vi.mocked(auth.isAuthorized).mockResolvedValue(true)
  })

  it("hides the advanced credentials panel", async () => {
    renderOptions()
    await screen.findByRole("button", { name: /sign out/i })
    expect(screen.queryByRole("button", { name: /advanced/i })).toBeNull()
  })

  it("signs out", async () => {
    vi.mocked(auth.signOut).mockImplementation(async () => {
      vi.mocked(auth.isAuthorized).mockResolvedValue(false)
    })
    renderOptions()

    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }))

    expect(auth.signOut).toHaveBeenCalled()
    expect(
      await screen.findByRole("button", { name: /sign in with google/i })
    ).toBeInTheDocument()
  })

  it("clears all extension data", async () => {
    await store.playlists.setValue(["PL1"])
    await store.clientID.setValue("cid")
    vi.mocked(auth.isAuthorized).mockResolvedValue(true)

    renderOptions()
    await userEvent.click(
      await screen.findByRole("button", { name: /clear all data/i })
    )

    await waitFor(async () => {
      await expect(store.playlists.getValue()).resolves.toEqual([])
      await expect(store.clientID.getValue()).resolves.toBe("")
    })
  })
})

describe("theme toggle", () => {
  it("offers all three modes and persists a choice", async () => {
    renderOptions()

    const group = await screen.findByRole("group", { name: /theme/i })
    expect(group).toBeInTheDocument()

    await userEvent.click(await screen.findByRole("button", { name: /^dark$/i }))

    await waitFor(async () => {
      await expect(store.theme.getValue()).resolves.toBe("dark")
    })
  })
})
