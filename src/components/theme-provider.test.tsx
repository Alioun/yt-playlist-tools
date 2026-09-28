import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { ThemeProvider, useTheme } from "@/components/theme-provider"
import * as store from "@/lib/storage"

function setSystemDark(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: dark,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  )
}

function Probe() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")}>dark</button>
      <button onClick={() => setTheme("system")}>system</button>
    </div>
  )
}

beforeEach(() => {
  fakeBrowser.reset()
  setSystemDark(false)
  document.documentElement.className = ""
})

describe("ThemeProvider", () => {
  it("applies the stored theme as a class on <html>", async () => {
    await store.theme.setValue("dark")

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark")
    })
    expect(document.documentElement).not.toHaveClass("light")
  })

  it("resolves 'system' against prefers-color-scheme", async () => {
    setSystemDark(true)
    await store.theme.setValue("system")

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark")
    })
    expect(screen.getByTestId("theme")).toHaveTextContent("system")
  })

  it("persists a change to sync storage so other surfaces follow", async () => {
    // localStorage would NOT work here: it is per-origin, so the popup, the
    // options page and the in-page content script would each have their own.
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    await userEvent.click(screen.getByText("dark"))

    await waitFor(async () => {
      await expect(store.theme.getValue()).resolves.toBe("dark")
    })
  })

  it("swaps the class rather than accumulating both", async () => {
    await store.theme.setValue("light")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    await waitFor(() => expect(document.documentElement).toHaveClass("light"))

    await userEvent.click(screen.getByText("dark"))

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"))
    expect(document.documentElement).not.toHaveClass("light")
  })

  it("does not let a slow initial read clobber a newer value", async () => {
    // The race: getValue() is in flight, the user picks Dark, watch() delivers
    // "dark", and only then does the stale read resolve with "light" -- the
    // theme would snap back while the button still read pressed.
    let resolveRead: (v: store.Theme) => void = () => {}
    vi.spyOn(store.theme, "getValue").mockReturnValue(
      new Promise<store.Theme>((resolve) => {
        resolveRead = resolve
      })
    )

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

    await userEvent.click(screen.getByText("dark"))
    await waitFor(() => {
      expect(screen.getByTestId("resolved")).toHaveTextContent("dark")
    })

    // The stale read lands last and must be ignored.
    resolveRead("light")
    await new Promise((r) => setTimeout(r, 10))

    expect(screen.getByTestId("resolved")).toHaveTextContent("dark")
  })

  it("targets a supplied element instead of <html>", async () => {
    // Inside a shadow root the class must land on the shadow container --
    // `&:is(.dark *)` does not cross the shadow boundary.
    const container = document.createElement("div")
    document.body.append(container)
    await store.theme.setValue("dark")

    render(
      <ThemeProvider target={container}>
        <Probe />
      </ThemeProvider>
    )

    await waitFor(() => expect(container).toHaveClass("dark"))
    expect(document.documentElement).not.toHaveClass("dark")
  })

  it("survives an environment with no matchMedia", async () => {
    vi.stubGlobal("matchMedia", undefined)

    expect(() =>
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      )
    ).not.toThrow()

    await waitFor(() => {
      expect(screen.getByTestId("resolved")).toHaveTextContent("light")
    })
  })
})
