// A port of src/components/theme-provider.test.tsx (Vitest) to bun:test,
// rendering the real 1.x component: React 19, Testing Library, user-event,
// jest-dom, and storage through #imports + fakeBrowser.
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ThemeProvider, useTheme } from "@/components/theme-provider"
import * as store from "@/lib/storage"

const realMatchMedia = window.matchMedia

function setSystemDark(dark: boolean) {
  // vi.stubGlobal has no bun:test equivalent; assign and restore by hand.
  window.matchMedia = mock(
    () => ({ matches: dark, addEventListener: mock(), removeEventListener: mock() }) as unknown as MediaQueryList
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
  setSystemDark(false)
  document.documentElement.className = ""
})

afterEach(() => {
  window.matchMedia = realMatchMedia
  mock.restore()
})

describe("ThemeProvider under bun test", () => {
  test("applies the stored theme as a class on <html>", async () => {
    await store.theme.setValue("dark")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"))
    expect(document.documentElement).not.toHaveClass("light")
  })

  test("resolves 'system' against prefers-color-scheme", async () => {
    setSystemDark(true)
    await store.theme.setValue("system")
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    await waitFor(() => expect(screen.getByTestId("resolved")).toHaveTextContent("dark"))
    expect(screen.getByTestId("theme")).toHaveTextContent("system")
  })

  test("a click persists to storage (user-event)", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
    await userEvent.click(screen.getByText("dark"))
    await waitFor(async () => {
      expect(await store.theme.getValue()).toBe("dark")
    })
  })

  test("a slow initial read does not clobber a newer value (spyOn)", async () => {
    let resolveRead: (v: store.Theme) => void = () => {}
    spyOn(store.theme, "getValue").mockReturnValue(
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
    await waitFor(() => expect(screen.getByTestId("resolved")).toHaveTextContent("dark"))
    resolveRead("light")
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark")
  })
})
