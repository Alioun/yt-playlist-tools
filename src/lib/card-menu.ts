/**
 * Opens YouTube's own per-video menu (the ⋮ "Add to queue / Save to Watch
 * later / ..." menu) when a video card is right-clicked.
 *
 * Rather than rebuilding that menu, this clicks YouTube's existing ⋮ button,
 * so every item keeps working exactly as YouTube implements it -- including
 * ones added later. Shift+right-click falls through to the browser's native
 * context menu, so "Open link in new tab" and friends stay one modifier away.
 */

/** The ⋮ button inside a card, across the legacy and lockup renderers. */
export const MENU_BUTTON_SELECTORS = [
  // yt-lockup-view-model (search, watch sidebar, newer feeds)
  ".yt-lockup-metadata-view-model__menu-button button",
  "yt-lockup-metadata-view-model button-view-model button",
  // ytd-*-renderer (legacy feeds)
  "ytd-menu-renderer yt-icon-button#button button",
  "ytd-menu-renderer yt-icon-button#button",
  "ytd-menu-renderer button"
]

export function findMenuButton(card: Element): HTMLElement | null {
  for (const selector of MENU_BUTTON_SELECTORS) {
    const match = card.querySelector<HTMLElement>(selector)
    if (match) return match
  }
  return null
}

export interface CardMenuOptions {
  cardSelectors: string[]
  /** Cards matching any of these are left alone (Shorts, ads). */
  excludeSelectors?: string[]
}

/** Starts listening. Returns a stop function. */
export function enableCardMenu(options: CardMenuOptions): () => void {
  const cardSelector = options.cardSelectors.join(",")

  const onContextMenu = (event: MouseEvent) => {
    if (event.shiftKey) return
    const target = event.target
    if (!(target instanceof Element)) return

    const card = target.closest(cardSelector)
    if (!card) return
    if (options.excludeSelectors?.some((s) => card.matches(s) || card.querySelector(s)))
      return

    const button = findMenuButton(card)
    // No ⋮ button found (YouTube changed its markup): leave the native menu
    // working instead of swallowing the click into nothing.
    if (!button) return

    event.preventDefault()
    event.stopPropagation()
    button.click()
  }

  // Capture, so YouTube's own handlers on the card cannot consume it first.
  document.addEventListener("contextmenu", onContextMenu, true)
  return () => document.removeEventListener("contextmenu", onContextMenu, true)
}
