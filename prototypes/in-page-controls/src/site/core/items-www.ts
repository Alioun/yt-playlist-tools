// THROWAWAY PROTOTYPE (ticket 14; ticket 17 puts this in site/core/items-www.ts). YouTube's item recognition, shared
// by quick-save, Add to queue, the card menu and shortcuts (ticket 18 §5.1: ticket 14 owns the selectors, the
// markup-independent self-check and the page-settle thresholds).
//
// Selectors checked against live youtube.com, signed out, 2026-10-19 (channel grid, search, watch sidebar, playlist
// page, playlist panel, Shorts shelves). YouTube's lockups now use camelCase classes (ytLockupViewModel…); the BEM
// spellings are kept as fallbacks for older buckets.

export type ItemKind = "video" | "short" | "unsupported";
export type Item = {
  el: Element;
  kind: ItemKind;
  videoId: string | null;
  title: string;
  /** The thumbnail link: our overlay goes right after it in the DOM, so Tab reaches our buttons next. */
  thumb: Element | null;
  /** The visible thumbnail image box: our overlay is positioned on its top-left corner. */
  box: Element | null;
  /** YouTube's own ⋮ button for this card (the card menu clicks it). */
  menuButton: Element | null;
  /** Why an unsupported item is unsupported (ticket 08's messages). */
  why?: "playlist" | "ad" | "channel" | "post";
};

type Rule = { sel: string; kind: ItemKind; thumb: string; box: string; title: string; menu: string; why?: Item["why"] };
const NONE = { thumb: "", box: "", title: "", menu: "" };

/** Most specific first; the first rule whose selector matches the closest card wins. */
export const RULES: Rule[] = [
  // Ads: never ours (ticket 08: "Ads can't be saved").
  {
    sel: "ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer, ytd-display-ad-renderer, ytd-promoted-video-renderer",
    kind: "unsupported",
    why: "ad",
    ...NONE,
  },
  // The watch page's playlist panel: the whole row is a link; small 100×56 thumbnails.
  {
    sel: "ytd-playlist-panel-video-renderer",
    kind: "video",
    thumb: "a#thumbnail",
    box: "#thumbnail-container",
    title: "#video-title",
    menu: "#menu ytd-menu-renderer yt-icon-button#button button, #menu button",
  },
  // Shorts shelves (search, home): 2:3 lockups.
  {
    sel: "ytm-shorts-lockup-view-model, ytd-reel-item-renderer",
    kind: "short",
    thumb: "a.shortsLockupViewModelHostEndpoint, a.reel-item-endpoint, a[href^='/shorts/']",
    box: "yt-thumbnail-view-model, ytd-thumbnail",
    title: "h3 a.shortsLockupViewModelHostOutsideMetadataEndpoint, h3, #video-title",
    menu: ".shortsLockupViewModelHostOutsideMetadataMenu button, ytd-menu-renderer button",
  },
  // The lockup: channel grids, the watch sidebar, the playlist page.
  {
    sel: "yt-lockup-view-model",
    kind: "video",
    thumb: "a.ytLockupViewModelContentImage, a.yt-lockup-view-model__content-image, a.yt-lockup-view-model-wiz__content-image",
    box: "yt-thumbnail-view-model",
    title: "a.ytLockupMetadataViewModelTitle, a.yt-lockup-metadata-view-model__title, h3 a, h3",
    menu: ".ytLockupMetadataViewModelMenuButton button, .yt-lockup-metadata-view-model__menu-button button, button[aria-label='More actions']",
  },
  // Search results and the legacy grids (hashtags, gaming, podcasts).
  {
    sel: "ytd-video-renderer, ytd-rich-grid-media, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer",
    kind: "video",
    thumb: "a#thumbnail",
    box: "ytd-thumbnail",
    title: "a#video-title, a#video-title-link, #video-title",
    menu: "#menu ytd-menu-renderer yt-icon-button#button button, ytd-menu-renderer yt-icon-button button, #menu button",
  },
  // Playlists, mixes, channels and posts: recognised so a key says why it does nothing (ticket 08).
  {
    sel: "ytd-playlist-renderer, ytd-radio-renderer, ytd-grid-playlist-renderer, ytd-compact-playlist-renderer, ytd-compact-radio-renderer",
    kind: "unsupported",
    why: "playlist",
    ...NONE,
  },
  { sel: "ytd-channel-renderer, ytd-grid-channel-renderer", kind: "unsupported", why: "channel", ...NONE },
  { sel: "ytd-post-renderer, ytd-backstage-post-thread-renderer", kind: "unsupported", why: "post", ...NONE },
];
const ALL = RULES.map((r) => r.sel).join(", ");

/** Inside a player, everything counts as that player's video (ticket 08), so cards there aren't items. */
const PLAYER = ".html5-video-player, ytd-player, #movie_player, #shorts-player, [data-pp-player]";
/** Where items live; the player, description and comments aren't item areas (ticket 18 §5.1). */
const MAIN = "ytd-page-manager, [data-pp-app]";
const NOT_ITEM_AREA = `${PLAYER}, #description, ytd-comments, ytd-watch-metadata, #video-preview`;

export function videoIdOf(href: string | null | undefined): { id: string; short: boolean } | null {
  if (!href) return null;
  const s = href.match(/\/shorts\/([\w-]{11})/);
  if (s) return { id: s[1], short: true };
  const w = href.match(/[?&]v=([\w-]{11})/);
  if (w) return { id: w[1], short: false };
  return null;
}

/** Playlist and mix lockups: a stacked collection thumbnail, a "Play all" hover scrim, or a link to /playlist. */
function isCollection(el: Element) {
  return !!el.querySelector(
    "yt-collection-thumbnail-view-model, yt-collections-stack, thumbnail-hover-overlay-view-model, .ytCollectionsStackHost, a[href^='/playlist?list=']",
  );
}

const unsupported = (el: Element, why: Item["why"]): Item => ({ el, kind: "unsupported", why, videoId: null, title: "", thumb: null, box: null, menuButton: null });

export function itemAt(target: EventTarget | null): Item | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(PLAYER)) return null;
  const el = target.closest(ALL);
  if (!el) return null;
  const rule = RULES.find((r) => el.matches(r.sel))!;
  if (rule.kind === "unsupported") return unsupported(el, rule.why);
  if (el.matches("yt-lockup-view-model") && isCollection(el)) return unsupported(el, "playlist");
  const thumb = el.querySelector(rule.thumb);
  const link = (thumb?.closest("a") ?? thumb ?? el.querySelector("a[href*='/watch?v='], a[href^='/shorts/']")) as HTMLAnchorElement | null;
  const vid = videoIdOf(link?.getAttribute("href") ?? (el.matches("ytd-playlist-panel-video-renderer") ? el.querySelector("a#wc-endpoint")?.getAttribute("href") : null));
  const titleEl = el.querySelector(rule.title);
  const title = (titleEl?.getAttribute("title") || titleEl?.textContent || link?.getAttribute("title") || "").trim();
  return {
    el,
    kind: vid?.short ? "short" : rule.kind,
    videoId: vid?.id ?? null,
    title: title.replace(/\s+/g, " "),
    thumb: link,
    box: el.querySelector(rule.box) ?? link,
    menuButton: rule.menu ? el.querySelector(rule.menu) : null,
  };
}

/**
 * Ticket 18's key-press self-check, independent of YouTube's markup: does the target look like a video item? A link to
 * /watch?v= or /shorts/, or an element holding exactly one such video, outside any player.
 */
export function looksLikeVideoItem(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || target.closest(PLAYER)) return false;
  let el: Element | null = target;
  for (let depth = 0; el && depth < 8; depth++, el = el.parentElement) {
    if (el.matches("a") && videoIdOf(el.getAttribute("href"))) return true;
    const ids = new Set<string>();
    for (const a of el.querySelectorAll("a[href*='/watch?v='], a[href^='/shorts/']")) {
      const v = videoIdOf(a.getAttribute("href"));
      if (v) ids.add(v.id);
      if (ids.size > 1) return false;
    }
    if (ids.size === 1) return true;
    if (el.matches(MAIN)) return false;
  }
  return false;
}

/**
 * Ticket 18's page-settle check (3 s after navigation). Signal `anchor-missing` when the main content shows at least
 * MIN_LINKS distinct videos and fewer than MIN_SHARE of them sit in a recognised item. Measured on live pages (see the
 * Answer): every page type recognised 100 % of its visible video links, so the starting values hold.
 */
export const MIN_LINKS = 6;
export const MIN_SHARE = 0.5;
export function settleCheck(root: ParentNode = document) {
  const seen = new Map<string, boolean>();
  for (const a of root.querySelectorAll("a[href*='/watch?v='], a[href^='/shorts/']")) {
    if (a.closest(NOT_ITEM_AREA) || !a.closest(MAIN)) continue;
    if ((a as HTMLElement).offsetParent === null) continue; // pages YouTube keeps hidden in the DOM
    const v = videoIdOf(a.getAttribute("href"));
    if (!v) continue;
    const item = itemAt(a);
    seen.set(v.id, (seen.get(v.id) ?? false) || !!item);
  }
  const links = seen.size;
  const recognised = [...seen.values()].filter(Boolean).length;
  const ok = links < MIN_LINKS || recognised / links >= MIN_SHARE;
  return { links, recognised, ok };
}

/** The current video (ticket 08): the watch page's, the Short on screen, else the miniplayer's. */
export function currentVideo(): { id: string; title: string; short: boolean } | null {
  if (location.pathname.startsWith("/shorts/")) {
    const id = location.pathname.split("/")[2];
    const reel = document.querySelector("ytd-reel-video-renderer[is-active]") ?? document;
    const t = reel.querySelector("yt-shorts-video-title-view-model, .ytShortsVideoTitleViewModelShortsVideoTitle, h2");
    return { id, title: (t?.textContent ?? "").trim(), short: true };
  }
  const flexy = document.querySelector("ytd-watch-flexy:not([hidden])");
  const id = flexy?.getAttribute("video-id") || new URLSearchParams(location.search).get("v");
  if (location.pathname === "/watch" && id) {
    const t = document.querySelector("ytd-watch-metadata h1");
    return { id, title: (t?.textContent ?? "").trim(), short: false };
  }
  const mini = document.querySelector("ytd-miniplayer[active]");
  const miniId = mini?.querySelector("[video-id]")?.getAttribute("video-id");
  if (miniId) return { id: miniId, title: (mini?.querySelector("#video-title, .title")?.textContent ?? "").trim(), short: false };
  return null;
}
