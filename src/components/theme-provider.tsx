import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { theme as themeItem, type Theme } from "@/lib/storage"

interface ThemeProviderState {
  /** The user's preference, which may be "system". */
  theme: Theme
  /** What "system" actually resolves to right now. */
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {}
})

const DARK_QUERY = "(prefers-color-scheme: dark)"

interface ThemeProviderProps {
  children: React.ReactNode
  /**
   * Element that receives the `light`/`dark` class. Defaults to <html>.
   * Inside a shadow root this MUST be the shadow container -- the
   * `&:is(.dark *)` variant does not cross the shadow boundary.
   */
  target?: HTMLElement | null
}

export function ThemeProvider({ children, target }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>("system")
  const [systemDark, setSystemDark] = useState(
    () => globalThis.matchMedia?.(DARK_QUERY).matches ?? false
  )

  // Load once, then stay in sync. Backed by extension storage rather than
  // localStorage, which is per-origin and so would not be shared between the
  // popup, the options page and the in-page content script.
  useEffect(() => {
    let active = true
    // watch() can deliver a newer value while the initial read is still in
    // flight; without this the stale read would land second and clobber it
    // (click Dark on a slow read -> theme snaps back to light).
    let sawLiveValue = false

    const unwatch = themeItem.watch((value) => {
      sawLiveValue = true
      if (active) setThemeState(value ?? "system")
    })

    themeItem.getValue().then((value) => {
      if (active && !sawLiveValue) setThemeState(value)
    })

    return () => {
      active = false
      unwatch()
    }
  }, [])

  useEffect(() => {
    const media = globalThis.matchMedia?.(DARK_QUERY)
    if (!media) return
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    const element = target ?? globalThis.document?.documentElement
    if (!element) return
    element.classList.remove("light", "dark")
    element.classList.add(resolvedTheme)
    // Makes native controls (scrollbars, form widgets) follow too.
    element.style.colorScheme = resolvedTheme

    return () => {
      element.classList.remove("light", "dark")
      element.style.colorScheme = ""
    }
  }, [resolvedTheme, target])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (next: Theme) => {
        setThemeState(next)
        void themeItem.setValue(next)
      }
    }),
    [theme, resolvedTheme]
  )

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeProviderContext)
