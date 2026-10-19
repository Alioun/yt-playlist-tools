// THROWAWAY PROTOTYPE (ticket 14). Right-click on a card opens YouTube's own ⋮ menu for it (no kit, ticket 24).
// - The card's own video links (thumbnail, title) and its empty areas open YouTube's menu, where YouTube anchors it
//   (at the card's ⋮ button).
// - Links to anything else (channel name, avatar, hashtags) keep the browser's menu: this fixes 1.5.0's friction.
// - "Links inside cards keep the browser's menu" (Settings, off by default) also leaves the video links alone.
// - Shift+right-click, unsupported cards (ads, playlists) and cards without a ⋮ button always get the browser's menu.
import type { FeatureDef } from "../../feature";

const g = globalThis as any;

export const cardMenu: FeatureDef = {
  id: "card-menu",
  needsKit: false,
  start(ctx) {
    const view = g.__pp.kit?.lib.view; // prototype: the stand-in tab view lives in the kit bundle
    ctx.scope.on(
      document,
      "contextmenu",
      (e: MouseEvent) => {
        if (e.shiftKey) return;
        const item = ctx.items.itemAt(e.target);
        if (!item || item.kind === "unsupported") return;
        if (view?.health.cardMenu === "broken") {
          // Ticket 18: the browser's menu, and one notice at the moment the feature would have acted.
          g.__pp.kit?.lib.flows.notice(["cardMenu"]);
          return;
        }
        const link = (e.composedPath()[0] as Element)?.closest?.("a");
        if (link && !ctx.items.videoIdOf(link.getAttribute("href"))) return;
        if (link && view?.linksKeepBrowserMenu) return;
        if (!item.menuButton) return; // ticket 18 would raise anchor-missing here
        e.preventDefault();
        e.stopPropagation();
        ctx.run({ job: "openCardMenu" }, { target: item.el });
      },
      true,
    );
  },
};
