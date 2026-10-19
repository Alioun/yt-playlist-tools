// THROWAWAY PROTOTYPE (ticket 27, rough dev build). What ticket 17 calls site/core/items-music.ts: YouTube
// Music's item selectors, where each kind of control is anchored, the markup-independent self-check and the
// page-settle check (ticket 18 §5.1), with the thresholds this ticket owns.

export type ItemType = "row" | "card" | "queue" | "header";
export interface Item {
  el: HTMLElement;
  type: ItemType;
}

/** Item selectors. Rows are songs, videos, episodes, albums, playlists or artists; what's offered comes from itemInfo. */
export const SELECTORS: Record<ItemType, string> = {
  row: "ytmusic-responsive-list-item-renderer",
  card: "ytmusic-two-row-item-renderer",
  queue: "ytmusic-player-queue-item",
  header: "ytmusic-responsive-header-renderer",
};
const ALL = Object.values(SELECTORS).join(", ");

/** Anchors: where our host goes in each item. Rows and queue items: in the item's own flex row, just before its
 *  ytmusic-menu-renderer (which holds YouTube Music's like, dislike and ⋮). Cards: inside the thumbnail overlay,
 *  bottom-left. Headers: inside #action-buttons, before the ⋮. */
export function anchorOf(item: Item): { parent: Element; before: Element | null; mode: "inflow" | "corner" } | null {
  const el = item.el;
  if (item.type === "row" || item.type === "queue") {
    const menu = el.querySelector(":scope > ytmusic-menu-renderer");
    return menu ? { parent: el, before: menu, mode: "inflow" } : null;
  }
  if (item.type === "card") {
    const ov = el.querySelector("ytmusic-item-thumbnail-overlay-renderer");
    return ov ? { parent: ov, before: null, mode: "corner" } : null;
  }
  const ab = el.querySelector("#action-buttons");
  if (!ab) return null;
  return { parent: ab, before: ab.querySelector(":scope > ytmusic-menu-renderer"), mode: "inflow" };
}

export function itemAt(node: EventTarget | null): Item | null {
  if (!(node instanceof Element)) return null;
  // Our own hosts sit inside items: the closest item is still the right one.
  const el = node.closest(ALL) as HTMLElement | null;
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  const type = (Object.keys(SELECTORS) as ItemType[]).find((k) => SELECTORS[k] === tag)!;
  return { el, type };
}

/** Markup-independent self-check (ticket 18): does the pointer look like it's on a song, album or playlist, even if
 *  no selector above matched? True when an ancestor (up to 6 levels) holds exactly one distinct item link, or when
 *  it's inside the queue panel. */
const LINK = 'a[href*="watch?v="], a[href*="playlist?list="], a[href*="browse/MPRE"], a[href*="browse/VL"]';
export function looksLikeItem(node: Element | null): boolean {
  if (node?.closest("ytmusic-player-queue, #queue")) return true;
  let el: Element | null = node;
  for (let i = 0; el && i < 6; i++, el = el.parentElement) {
    const targets = new Set([...el.querySelectorAll<HTMLAnchorElement>(LINK)].map((a) => a.getAttribute("href")!.replace(/&.*$/, "")));
    if (targets.size === 1) return true;
    if (targets.size > 1) return false;
  }
  return false;
}

/** Page-settle check (ticket 18): 3 s after navigation, compare item links in the main content with recognised
 *  items. Starting values owned by ticket 27: at least 6 links and none recognised, or fewer than half. */
export const SETTLE_MS = 3000;
export const SETTLE_MIN_LINKS = 6;
export const SETTLE_MIN_SHARE = 0.5;
export function pageSettleCheck(): { links: number; recognised: number; anchorMissing: boolean } {
  const main = document.querySelector("ytmusic-browse-response, ytmusic-search-page, #contents") ?? document.body;
  const links = [...main.querySelectorAll<HTMLAnchorElement>(LINK)].filter((a) => !a.closest("ytmusic-player-bar, ytmusic-miniplayer, ytmusic-guide-renderer"));
  const recognised = links.filter((a) => a.closest(ALL)).length;
  const anchorMissing = links.length >= SETTLE_MIN_LINKS && (recognised === 0 || recognised < links.length * SETTLE_MIN_SHARE);
  return { links: links.length, recognised, anchorMissing };
}

/** Narrow rows: below this title width (px) a row would show only "…". Ticket 27 keeps every chosen button anyway
 *  and logs the case; see the Answer. */
export const NARROW_TITLE_PX = 48;

/** The player-bar anchors for "Save on the player bar". Missing (narrow window, signed out in the Wiz miniplayer)
 *  means nothing is drawn, and that isn't breakage (ticket 18). */
export function barAnchor(): { parent: Element; before: Element; kind: "classic" | "wiz" } | null {
  const classic = document.querySelector("ytmusic-player-bar #like-button-renderer");
  if (classic?.parentElement && (classic as HTMLElement).offsetParent) return { parent: classic.parentElement, before: classic, kind: "classic" };
  const wiz = document.querySelector("ytmusic-miniplayer yt-video-action-bar-view-model");
  if (wiz?.parentElement) return { parent: wiz.parentElement, before: wiz, kind: "wiz" };
  return null;
}
