// THROWAWAY PROTOTYPE (ticket 14). A stand-in for ticket 17's gateway (src/page/), the only code in the page world.
// It answers the few jobs the in-page controls need here: the hello snapshot, the nav stream from YouTube's own
// navigation events, and openCardMenu (the right-click card menu opens YouTube's own ⋮ menu, exempt from "never drive
// YouTube's visible UI" because it is the feature). No requests: the prototype's saves are fake.
type Req = { type: "run" | "watch" | "unwatch"; id: number; job?: { job: string }; stream?: string };

function pageType(): string {
  const p = location.pathname;
  if (p === "/watch") return "watch";
  if (p.startsWith("/shorts/")) return "shorts";
  if (p === "/results") return "search";
  if (p === "/" || p === "/index.html") return "home";
  if (p === "/playlist") return "playlist";
  return "other";
}

function snapshot() {
  const cfg = (window as any).ytcfg;
  const signedIn = !!(cfg?.get?.("LOGGED_IN") ?? cfg?.data_?.LOGGED_IN);
  return { signedIn, pageType: pageType(), videoId: new URLSearchParams(location.search).get("v") };
}

export function startPage(win: Window = window) {
  const doc = win.document;
  const watchers = new Map<number, string>();
  const reply = (msg: object) => doc.dispatchEvent(new CustomEvent("ppt:res", { detail: JSON.stringify(msg) }));
  const pushNav = () => {
    for (const [id, s] of watchers) if (s === "nav") reply({ type: "stream", id, data: snapshot() });
  };
  // YouTube's own SPA navigation events (ticket 17: never WXT's polling locationchange).
  doc.addEventListener("yt-navigate-finish", pushNav);
  doc.addEventListener("yt-page-data-updated", pushNav);

  doc.addEventListener(
    "ppt:req",
    (e) => {
      const msg: Req = JSON.parse((e as CustomEvent<string>).detail);
      const target = e.target as Element;
      if (msg.type === "watch") {
        watchers.set(msg.id, msg.stream!);
        if (msg.stream === "nav") reply({ type: "stream", id: msg.id, data: snapshot() });
        return;
      }
      if (msg.type === "unwatch") return void watchers.delete(msg.id);
      const job = msg.job!.job;
      let result: unknown = { error: "unknown-job" };
      if (job === "hello") result = snapshot();
      if (job === "openCardMenu") {
        const sel =
          ".yt-lockup-metadata-view-model__menu-button button, button[aria-label='More actions'], ytd-menu-renderer yt-icon-button button, ytd-menu-renderer button, #menu button";
        const btn = target instanceof Element ? (target.querySelector(sel) as HTMLElement | null) : null;
        if (btn) btn.click();
        result = { opened: !!btn };
      }
      reply({ id: msg.id, result });
    },
    true,
  );
}
