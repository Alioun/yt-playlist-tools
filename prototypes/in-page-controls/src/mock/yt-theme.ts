// THROWAWAY PROTOTYPE (ticket 14). The mock page stands in for YouTube, so it defines YouTube's own theme variables on
// <html> exactly as YouTube does (values read from kevlar_base.css, fetched 2026-10-19), and sets <html dark> in the
// dark theme. Our in-page UI reads these; "Theme variables missing" in the panel removes them to show the fallback.
const LIGHT: Record<string, string> = {
  "base-background": "#fff",
  "raised-background": "#fff",
  "menu-background": "#fff",
  "text-primary": "#0f0f0f",
  "text-secondary": "#606060",
  "text-disabled": "#909090",
  outline: "rgba(0,0,0,0.1)",
  "additive-background": "rgba(0,0,0,0.05)",
  "mono-tonal-hover": "rgba(0,0,0,0.1)",
  "tonal-background": "rgba(0,0,0,0.1)",
  "call-to-action": "#065fd4",
  "call-to-action-inverse": "#3ea6ff",
  "error-indicator": "#c30027",
  "error-indicator-inverse": "#f57",
  "inverted-background": "#0f0f0f",
  "text-primary-inverse": "#fff",
  "static-brand-red": "#f03",
};
const DARK: Record<string, string> = {
  "base-background": "#0f0f0f",
  "raised-background": "#212121",
  "menu-background": "#282828",
  "text-primary": "#f1f1f1",
  "text-secondary": "#aaa",
  "text-disabled": "#717171",
  outline: "rgba(255,255,255,0.2)",
  "additive-background": "rgba(255,255,255,0.1)",
  "mono-tonal-hover": "rgba(255,255,255,0.2)",
  "tonal-background": "rgba(255,255,255,0.1)",
  "call-to-action": "#3ea6ff",
  "call-to-action-inverse": "#065fd4",
  "error-indicator": "#f57",
  "error-indicator-inverse": "#c30027",
  "inverted-background": "#f1f1f1",
  "text-primary-inverse": "#0f0f0f",
  "static-brand-red": "#f03",
};

export function applyTheme(theme: "light" | "dark", varsPresent = true) {
  const html = document.documentElement;
  html.toggleAttribute("dark", theme === "dark");
  const vals = theme === "dark" ? DARK : LIGHT;
  for (const k of Object.keys(LIGHT)) {
    if (varsPresent) html.style.setProperty(`--yt-sys-color-baseline--${k}`, vals[k]);
    else html.style.removeProperty(`--yt-sys-color-baseline--${k}`);
  }
  // The mock's own page colours (YouTube's page, not ours).
  html.style.setProperty("--m-bg", vals["base-background"]);
  html.style.setProperty("--m-text", vals["text-primary"]);
  html.style.setProperty("--m-text2", vals["text-secondary"]);
  html.style.setProperty("--m-tonal", vals["additive-background"]);
  html.style.setProperty("--m-tonal-hover", vals["mono-tonal-hover"]);
  html.style.setProperty("--m-outline", vals.outline);
  html.style.setProperty("--m-menu", vals["menu-background"]);
  html.style.setProperty("--m-inv", vals["inverted-background"]);
  html.style.setProperty("--m-inv-text", vals["text-primary-inverse"]);
  html.style.setProperty("--m-inv-cta", vals["call-to-action-inverse"]);
}
