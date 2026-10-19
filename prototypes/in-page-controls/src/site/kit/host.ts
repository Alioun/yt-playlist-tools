// THROWAWAY PROTOTYPE (ticket 14; ticket 17's kit host). Shadow hosts built with @webext-core/isolated-element
// directly (mode "open", isolateEvents: true, so typing in our fields never reaches YouTube's hotkeys).
//
// Hosts per page, never per card: the layer (toasts, notices, popovers), the one thumbnail overlay (moved into the
// hovered or focused card, so it scrolls with it and sits in Tab order after the thumbnail link), and one per in-flow
// control (the watch-page pill in YouTube's action row, the Shorts column button).
import { createIsolatedElement } from "@webext-core/isolated-element";
import { SKIN_CSS } from "./skins/www";

const hosts = new Set<HTMLElement>();
let mo: MutationObserver | null = null;

function mirrorTheme() {
  const dark = document.documentElement.hasAttribute("dark");
  for (const h of hosts) h.toggleAttribute("dark", dark);
}

/** Ticket 18: missing theme variables are a cosmetic breakage signal; the fallback palette takes over. */
export function themeVariablesPresent() {
  return getComputedStyle(document.documentElement).getPropertyValue("--yt-sys-color-baseline--base-background").trim() !== "";
}

export async function createHost(name: string, css = "") {
  const { parentElement, shadow, isolatedElement } = await createIsolatedElement({
    name,
    css: { textContent: SKIN_CSS + css },
    mode: "open",
    isolateEvents: true,
  });
  hosts.add(parentElement);
  if (!mo) {
    mo = new MutationObserver(mirrorTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["dark"] });
  }
  mirrorTheme();
  return {
    host: parentElement,
    shadow,
    root: isolatedElement,
    dispose() {
      hosts.delete(parentElement);
      parentElement.remove();
      if (!hosts.size) {
        mo?.disconnect();
        mo = null;
      }
    },
  };
}
