// THROWAWAY PROTOTYPE (ticket 14). The mock page's own state (YouTube's side, not ours) and the prototype's chrome.
export type Page = "home" | "watch" | "shorts" | "states";

const params = new URLSearchParams(location.search);

export const mock = $state({
  page: "home" as Page,
  theme: (params.get("theme") === "dark" ? "dark" : "light") as "light" | "dark",
  varsPresent: params.get("vars") !== "0",
  /** Signed-out lockups on live YouTube draw their own Watch later + Add to queue hover toggles (top right). */
  ytToggles: params.get("yttoggles") === "1",
  /** YouTube's own ⋮ dropdown, opened by clicking a card's ⋮ (or by our right-click feature). */
  menu: null as null | { x: number; y: number; up: boolean },
  /** Simulated fullscreen: the player covers the window and <html> is the fullscreen element. */
  fullscreen: false,
  chrome: params.get("chrome") !== "0",
  panel: params.get("panel") !== "0",
  scene: params.get("scene") ?? "home",
  /** The watch page's Save has folded into "…" (YouTube's own fold, simulated). */
  saveFolded: false,
  narrow: false,
});
