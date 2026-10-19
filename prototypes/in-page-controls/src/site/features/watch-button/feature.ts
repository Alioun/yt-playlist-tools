// THROWAWAY PROTOTYPE (ticket 14). The watch-page button (ticket 09's feature): a pill in YouTube's action row, and
// (an option, on by default) a button in the Shorts action column. Nothing in the miniplayer, nothing in fullscreen
// (it lives outside the player). See ./anchors.ts for where, and why, from the live probe.
import type { FeatureDef, FeatureContext } from "../../feature";
import { view, flows } from "$kit";
import WatchButton from "./WatchButton.svelte";
import { wb, fold } from "./ctx.svelte";
import { anchors } from "./anchors";

type Kind = "watch" | "shorts";

export const watchButton: FeatureDef = {
  id: "watch-button",
  needsKit: true,
  start(ctx) {
    wb.ctx = ctx;
    ctx.scope.add(() => (wb.ctx = null));
    wb.video = () => {
      const cur = ctx.items.currentVideo();
      if (cur) return { id: cur.id, title: cur.title || view.watchVideo.title, channel: anchors.channelName() || undefined };
      return document.querySelector("[data-pp-player]") ? view.watchVideo : null;
    };

    let host: HTMLElement | null = null;
    let kind: Kind | null = null;
    let pending = false;
    let watching: MutationObserver | null = null;
    ctx.scope.add(() => watching?.disconnect());

    const pageKind = (): Kind | null =>
      location.pathname.startsWith("/shorts/") || document.querySelector("[data-pp-shorts]")
        ? "shorts"
        : location.pathname === "/watch" || document.querySelector("[data-pp-player]")
          ? "watch"
          : null;

    async function place() {
      if (pending) return;
      const k = pageKind();
      const target = k === "watch" ? anchors.watchRow() : k === "shorts" && view.features.watchButtonOnShorts ? anchors.shortsColumn() : null;
      if (host?.isConnected && target?.contains(host) && kind === k) return;
      host?.remove();
      host = null;
      if (!target || !k) return;
      if (view.health.watchButton === "broken") return void flows.notice(["watchButton"]);
      pending = true;
      const h = await ctx.kit.mountInline(
        WatchButton,
        { variant: k === "shorts" ? "column" : "pill" },
        (el: HTMLElement) => anchors.insert(k, target, el),
        ctx.scope,
        k === "shorts" ? ":host{display:flex;justify-content:center;padding-bottom:8px;}" : ":host{display:inline-flex;align-items:center;flex:none;margin-left:8px;}",
      );
      pending = false;
      host = h?.host ?? null;
      kind = k;
      // If YouTube re-renders the row and drops our host, put it back (one container, childList only).
      watching?.disconnect();
      watching = new MutationObserver(() => host && !host.isConnected && retry());
      watching.observe(target.parentElement ?? target, { childList: true });
      if (k === "watch") {
        // YouTube re-creates #flexible-item-buttons when it folds Save into "…": re-check our fold then.
        foldWatch?.disconnect();
        const flex = target.parentElement?.querySelector("#flexible-item-buttons");
        if (flex) {
          foldWatch = new MutationObserver(() => {
            clearTimeout(foldTimer);
            foldTimer = setTimeout(checkFold, 60);
          });
          foldWatch.observe(flex, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
        }
        checkFold();
      }
    }
    let foldWatch: MutationObserver | null = null;
    ctx.scope.add(() => foldWatch?.disconnect());

    // YouTube's own navigation events (through the gateway's nav stream), with a few bounded retries while the new
    // page's row renders. Nothing polls.
    let timers: ReturnType<typeof setTimeout>[] = [];
    function retry() {
      timers.forEach(clearTimeout);
      timers = [0, 150, 500, 1500, 4000].map((ms) => setTimeout(() => void place(), ms));
    }
    ctx.scope.add(() => timers.forEach(clearTimeout));
    ctx.watch("nav", retry);

    // The fold (judgement call: our label folds before YouTube's Save has to). In a capture-phase resize listener,
    // which runs before YouTube's own fold logic, measure the row: if our full pill plus YouTube's Save wouldn't fit,
    // go icon-only now, so YouTube never needs to fold Save because of us; unfold when both fit again with room to
    // spare. If YouTube folded Save anyway (a narrow first load), fold too and nudge YouTube to re-measure once.
    let fullWidth = 0;
    const SAVE_W = 100; // YouTube's Save (92) plus its 8px margin, measured live
    const nudge = (globalThis as any).__pp?.foldNudge !== false;
    function rowNeeds(): { need: number; room: number } | null {
      const menu = anchors.watchRow()?.parentElement as HTMLElement | null; // ytd-menu-renderer
      if (!menu || !host) return null;
      let used = 0;
      for (const c of menu.children) {
        const el = c as HTMLElement;
        if (!el.offsetParent) continue;
        const cs = getComputedStyle(el);
        used += el.offsetWidth + parseFloat(cs.marginLeft) + parseFloat(cs.marginRight);
      }
      const pill = host.getBoundingClientRect().width;
      if (!fold.compact) fullWidth = pill;
      const need = used + (fold.compact ? Math.max(0, fullWidth - pill) : 0) + (anchors.saveVisible() ? 0 : SAVE_W);
      return { need, room: menu.clientWidth };
    }
    function checkFold() {
      if (kind !== "watch") return;
      const m = rowNeeds();
      if (!m) return;
      if (!fold.compact && m.need > m.room) {
        fold.compact = true;
        if (!anchors.saveVisible() && nudge) requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event("resize"))));
      } else if (fold.compact && fullWidth && m.need + 16 <= m.room) {
        fold.compact = false;
      }
    }
    ctx.scope.on(window, "resize", checkFold, { capture: true });
    let foldTimer: ReturnType<typeof setTimeout> | undefined;
    ctx.scope.add(() => clearTimeout(foldTimer));
    retry();
  },
};

export type { FeatureContext };
