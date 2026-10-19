// THROWAWAY PROTOTYPE (ticket 15). The harness's state, all in the URL so every view is shareable and reload-stable:
// ?surface=&s=&theme=&os=&browser=&variant=&step=&sync=#hash
import type { Surface } from "./notes";

const q = new URLSearchParams(location.search);

export const h = $state({
  surface: (q.get("surface") ?? "popup") as Surface,
  s: q.get("s") ?? "on-video",
  theme: (q.get("theme") ?? "light") as "light" | "dark" | "both",
  os: q.get("os") ?? "",
  browser: q.get("browser") ?? "",
  variant: (q.get("variant") ?? "A") as "A" | "B" | "C",
  step: q.get("step") ?? "",
  sync: q.get("sync") ?? "",
  hash: location.hash.slice(1),
});

function query(over: Partial<typeof h> = {}) {
  const v = { ...h, ...over };
  const p = new URLSearchParams();
  p.set("surface", v.surface);
  p.set("s", v.s);
  p.set("theme", v.theme);
  if (v.os) p.set("os", v.os);
  if (v.browser) p.set("browser", v.browser);
  if (v.variant !== "A") p.set("variant", v.variant);
  if (v.step) p.set("step", v.step);
  if (v.sync) p.set("sync", v.sync);
  return `?${p}${v.hash ? `#${v.hash}` : ""}`;
}

/** Writes the state to the URL without reloading. */
export function save() {
  history.replaceState(null, "", query());
}

/** The fake backend reads its scenario once, at load: switching scenario reloads the harness. */
export function setScenario(id: string) {
  location.href = query({ s: id });
}

/** A page's URL inside a frame. */
export function frameSrc(page: "popup" | "settings" | "onboarding", theme: "light" | "dark", extra: Record<string, string> = {}, hash = "") {
  const p = new URLSearchParams();
  p.set("s", extra.s ?? h.s);
  p.set("theme", theme);
  if (h.os) p.set("os", h.os);
  if (h.browser) p.set("browser", h.browser);
  for (const [k, v] of Object.entries(extra)) if (k !== "s" && v) p.set(k, v);
  return `${page}.html?${p}${hash ? `#${hash}` : ""}`;
}

export const themesShown = (): ("light" | "dark")[] => (h.theme === "both" ? ["light", "dark"] : [h.theme]);
