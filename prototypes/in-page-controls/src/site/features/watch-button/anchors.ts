// THROWAWAY PROTOTYPE (ticket 14). Where the watch-page button goes in YouTube's DOM, from the live probe:
// - Watch page: the end of ytd-menu-renderer's #top-level-buttons-computed (after Share, before Save). YouTube
//   re-creates #flexible-item-buttons (where Save lives) on every fold change, deleting anything inserted there, and
//   anything outside ytd-menu-renderer lands on a line of its own. Only the top-level slot survives resizing, and
//   YouTube's own folding counts its width.
// - Shorts: the active Short's reel-action-bar-view-model, after Remix and before the sound (pivot) button.
export const anchors = {
  watchRow(): Element | null {
    const meta = document.querySelector("ytd-watch-metadata:not([hidden])") ?? document.querySelector("ytd-watch-metadata");
    return meta?.querySelector("#actions ytd-menu-renderer #top-level-buttons-computed") ?? null;
  },
  shortsColumn(): Element | null {
    const reel = document.querySelector("ytd-reel-video-renderer[is-active]") ?? document;
    return reel.querySelector("reel-action-bar-view-model, #actions.ytd-reel-player-overlay-renderer");
  },
  insert(kind: "watch" | "shorts", target: Element, host: HTMLElement) {
    if (kind === "watch") return void target.append(host);
    const pivot = target.querySelector(":scope > pivot-button-view-model");
    if (pivot) pivot.before(host);
    else target.append(host);
  },
  /** YouTube's Save: when it has folded into "…", our pill folds to icon only first, so YouTube's Save can come back. */
  saveVisible(): boolean {
    const save = document.querySelector(
      "ytd-watch-metadata #flexible-item-buttons button[aria-label='Save to playlist'], ytd-watch-metadata #flexible-item-buttons [aria-label*='Save']",
    ) as HTMLElement | null;
    return !!save && save.offsetParent !== null;
  },
  actions(): HTMLElement | null {
    return document.querySelector("ytd-watch-metadata #actions") as HTMLElement | null;
  },
  channelName(): string {
    return (document.querySelector("ytd-watch-metadata ytd-channel-name a, ytd-watch-metadata #owner #channel-name a")?.textContent ?? "").trim();
  },
};
