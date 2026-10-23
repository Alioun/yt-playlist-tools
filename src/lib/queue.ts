/**
 * Card elements that should get a button.
 *
 * `yt-lockup-view-model` is the newer component YouTube moved search results
 * and the watch-page sidebar to; the `ytd-*-renderer` names still serve the
 * home and subscriptions feeds. Both have to be handled.
 */
export const CARD_SELECTORS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "yt-lockup-view-model"
]

/** Cards that must NOT get a button: Shorts have no queue, ads are not ours. */
export const CARD_EXCLUDE_SELECTORS = [
  "ytm-shorts-lockup-view-model",
  "ytm-shorts-lockup-view-model-v2",
  "ytd-ad-slot-renderer",
  "ytd-rich-section-renderer"
]

/**
 * Pages to leave alone because YouTube already puts an "Add to queue" control
 * on the thumbnail there, so ours would be a duplicate.
 *
 * Matched as a path prefix against location.pathname. This is a per-page call,
 * not a per-card one: YouTube's overlay is a property of the surface, and
 * detecting it per card would mean depending on its internal element names.
 */
export const EXCLUDED_PATHS = ["/feed/subscriptions"]

/** False on surfaces that already have YouTube's own queue button. */
export function shouldInjectOnPath(pathname: string): boolean {
  return !EXCLUDED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

/** Where inside a card the button is anchored. First match wins. */
export const THUMBNAIL_SELECTORS = [
  "yt-thumbnail-view-model",
  "ytd-thumbnail",
  "a#thumbnail"
]

/**
 * Styles for the injected button. These live in the page, not the shadow root,
 * so they cannot come from the Tailwind bundle (which the content script
 * injects into its shadow root only).
 */
export const QUEUE_BUTTON_CSS = `
.ytpt-queue-button {
  position: absolute;
  top: 4px;
  left: 4px;
  /* Above YouTube's inline preview player, which mounts into the thumbnail
     about a second after hover on the home/subscriptions grid and would
     otherwise cover the button. The sidebar has no preview, which is why it
     looked fine there. */
  z-index: 2000;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s ease, background-color 0.1s ease;
}
.ytpt-queue-button:hover { background: rgba(0, 0, 0, 0.9); }
.ytpt-queue-button:focus-visible {
  opacity: 1;
  outline: 2px solid #3ea6ff;
  outline-offset: 1px;
}
/* Revealed on card hover, matching how YouTube surfaced its own overlays.
   The .ytpt-hover class is applied by a delegated pointer listener rather than
   relying on :hover alone: YouTube swaps the thumbnail subtree out from under
   us when the preview player mounts, which breaks a pure-CSS hover chain. The
   :hover rules stay as a no-JS-latency fallback. */
.ytpt-hover .ytpt-queue-button,
:is(${CARD_SELECTORS.join(",")}):hover .ytpt-queue-button,
.ytpt-queue-button:hover,
.ytpt-queue-button:focus-visible { opacity: 1; }
.ytpt-queue-button--busy { opacity: 1; background: rgba(0, 0, 0, 0.9); }
.ytpt-queue-button--busy svg { animation: ytpt-queue-pulse 0.8s ease-in-out infinite; }
.ytpt-queue-button--ok { opacity: 1; background: #1e7f36; }
.ytpt-queue-button--error { opacity: 1; background: #b3261e; }
@keyframes ytpt-queue-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .ytpt-queue-button--busy svg { animation: none; }
}
`

const STYLE_ID = "ytpt-queue-button-styles"

export function injectQueueStyles(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement("style")
  style.id = STYLE_ID
  style.textContent = QUEUE_BUTTON_CSS
  doc.head.append(style)
}

export function removeQueueStyles(doc: Document = document): void {
  doc.getElementById(STYLE_ID)?.remove()
}
