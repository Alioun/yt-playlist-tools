export type ThemePreference = "system" | "light" | "dark"

// The page's entry applies the theme setting (FT-05); System follows the browser and keeps following it.
export function followTheme(root: HTMLElement, preference: ThemePreference, scheme: MediaQueryList): () => void {
  const apply = () => root.classList.toggle("dark", preference === "dark" || (preference === "system" && scheme.matches))
  apply()
  if (preference !== "system") return () => {}
  scheme.addEventListener("change", apply)
  return () => scheme.removeEventListener("change", apply)
}
