// THROWAWAY PROTOTYPE (ticket 14; ticket 08's rules). Playlist shortcuts on YouTube: Alt+W saves to Watch later,
// Alt+Shift+P opens the playlist picker, Alt+U undoes the toast. A key acts on the pointed-at item, else the current
// video; it never falls back when the pointer is on something unsupported or unrecognised (ticket 18).
//
// Where the picker opens when a key opens it (ticket 08): beside the pointed-at card's thumbnail, else over the
// player (its top centre), else the window's top centre.
import type { FeatureDef, FeatureContext } from "../../feature";
import { view, flows, undoKey, showToast, type Video } from "$kit";

type Target = { video: Video; anchor: Element | (() => DOMRect); side: "bottom" | "right" } | { message: string; failure?: boolean };

const PLAYER = "#movie_player, #shorts-player, ytd-player, [data-pp-player]";

function playerRect(): DOMRect | null {
  for (const el of document.querySelectorAll(PLAYER)) {
    const r = el.getBoundingClientRect();
    if (r.width > 200 && r.height > 120 && r.bottom > 0 && r.top < innerHeight) return r;
  }
  return null;
}

function resolve(ctx: FeatureContext): Target {
  const it = ctx.items.pointed();
  if (it) {
    if (it.kind === "unsupported")
      return { message: it.why === "ad" ? "Ads can't be saved." : "Only videos can be saved to playlists." };
    if (it.videoId) return { video: { id: it.videoId, title: it.title }, anchor: it.thumb ?? it.el, side: "right" };
  }
  const raw = ctx.items.target();
  if (raw && ctx.items.looksLikeVideoItem(raw))
    return {
      failure: true,
      message:
        "Couldn't tell which video you're pointing at because YouTube changed something. Move the pointer off it to save the current video.",
    };
  const cur = ctx.items.currentVideo() ?? (document.querySelector("[data-pp-player]") ? view.watchVideo : null);
  if (cur) {
    const r = playerRect();
    return {
      video: { id: cur.id, title: cur.title || view.watchVideo.title },
      anchor: () => (r ? new DOMRect(r.left + r.width / 2, r.top + 24, 0, 0) : new DOMRect(innerWidth / 2, 96, 0, 0)),
      side: "bottom",
    };
  }
  return { message: "Point at a video to save it." };
}

export const shortcuts: FeatureDef = {
  id: "shortcuts",
  needsKit: true,
  start(ctx) {
    const broken = () => {
      if (view.health.shortcuts !== "broken") return false;
      flows.notice(["shortcuts"]);
      showToast({ failure: true, text: "Playlist shortcuts isn't working right now because YouTube changed something. Use YouTube's own Save for now." });
      return true;
    };
    ctx.keys.bind([
      {
        id: "shortcut:WL",
        combo: { key: "w", alt: true },
        run: async () => {
          if (broken() || flows.signedOutAnswer()) return;
          const t = resolve(ctx);
          if ("message" in t) return void showToast({ text: t.message, failure: t.failure });
          ctx.keys.busy("shortcut:WL", true);
          await flows.add(t.video, ["WL"], "shortcut", { pendingAfter: 1000 });
          ctx.keys.busy("shortcut:WL", false);
        },
      },
      {
        id: "picker",
        combo: { key: "p", alt: true, shift: true },
        run: () => {
          if (broken() || flows.signedOutAnswer()) return;
          const t = resolve(ctx);
          if ("message" in t) return void showToast({ text: t.message, failure: t.failure });
          ctx.popovers().then((p) => p.openPicker({ anchor: t.anchor, video: t.video, mode: "pick", side: t.side }), () => {});
        },
      },
      { id: "undo", combo: { key: "u", alt: true }, run: () => undoKey() },
    ]);
  },
};
