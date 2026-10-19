// THROWAWAY PROTOTYPE (ticket 15). Settings shows one section at a time, chosen by the URL hash, so the popup and
// toasts can deep-link: #youtube, #music, #everywhere, #accounts, #appearance, #privacy, #diagnostics, #about, and
// #feature-<id>, which opens that feature's section, scrolls to its card and highlights it briefly (ticket 12's
// "Settings" toast action lands there).
import { feature } from "$shared/features/registry";
import type { FeatureId } from "$shared/model/types";

export type SectionId = "youtube" | "music" | "everywhere" | "accounts" | "appearance" | "privacy" | "diagnostics" | "about";
export const sectionIds: SectionId[] = ["youtube", "music", "everywhere", "accounts", "appearance", "privacy", "diagnostics", "about"];

export const route = $state({ section: "youtube" as SectionId, focus: null as string | null });

export function readHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (h.startsWith("feature-")) {
    const id = h.slice(8) as FeatureId | "sync";
    route.section = id === "sync" ? "everywhere" : feature[id as FeatureId]?.site === "music" ? "music" : "youtube";
    route.focus = h;
  } else {
    route.section = (sectionIds as string[]).includes(h) ? (h as SectionId) : "youtube";
    route.focus = null;
  }
}

export function go(section: SectionId) {
  if (location.hash !== `#${section}`) history.pushState(null, "", `#${section}`);
  route.section = section;
  route.focus = null;
  window.scrollTo({ top: 0 });
}

/** Scrolls to and briefly rings a card once it exists and the page has stopped growing (sections and the cards'
 *  options load lazily, and would otherwise push the card down after the scroll). */
export function focusWhenReady(id: string) {
  let tries = 0;
  let lastHeight = -1;
  const tick = () => {
    const el = document.getElementById(id);
    const h = document.documentElement.scrollHeight;
    const settled = h === lastHeight && !document.querySelector('[aria-busy="true"]');
    lastHeight = h;
    if (el && (settled || tries > 30)) {
      el.scrollIntoView({ block: "start" });
      el.dataset.flash = "true";
      setTimeout(() => delete el.dataset.flash, 1800);
      // Lists above it may still fill in (playlists arrive from the cache): keep the card in place until they have,
      // unless the user scrolls first.
      let userMoved = false;
      const stop = () => (userMoved = true);
      window.addEventListener("wheel", stop, { once: true, passive: true });
      window.addEventListener("keydown", stop, { once: true });
      for (const t of [150, 350, 700, 1100])
        setTimeout(() => !userMoved && Math.abs(el.getBoundingClientRect().top - 24) > 2 && el.scrollIntoView({ block: "start" }), t);
    } else if (tries++ < 60) setTimeout(tick, 60);
  };
  tick();
}
