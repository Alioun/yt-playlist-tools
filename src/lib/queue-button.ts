/**
 * Injects a one-click "Add to queue" button onto YouTube video thumbnails.
 *
 * YouTube already has the action, but only behind the overflow (⋮) menu, so
 * queueing a video costs two clicks and a menu round-trip. This puts it on the
 * thumbnail itself.
 *
 * Deliberately split from the injection *mechanism*: this module owns discovery,
 * lifecycle and cleanup, and calls an `onQueue` callback supplied by the caller
 * to actually perform the action. That keeps the DOM churn in one testable place.
 */

/** Marks a card as already processed so the observer does not double-inject. */
const MARKER = "data-ytpt-queue"

/** Applied to the hovered card so the button can be revealed. */
export const HOVER_CLASS = "ytpt-hover"

/** Extracts the video id from any anchor inside the card. */
export function videoIdFromCard(card: Element): string | null {
  const link = card.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]')
  if (!link) return null
  try {
    // href is absolute on real pages; the base makes it robust either way.
    return new URL(link.href, location.origin).searchParams.get("v")
  } catch {
    return null
  }
}

export interface QueueButtonOptions {
  /** Selectors for the card elements that should receive a button. */
  cardSelectors: string[]
  /** Cards matching any of these are skipped (Shorts, ads, shelves). */
  excludeSelectors?: string[]
  /** Where inside a card the button is placed. First match wins. */
  thumbnailSelectors: string[]
  /** Performs the actual queue action. Resolves true when it worked. */
  onQueue: (videoId: string, card: Element) => Promise<boolean> | boolean
  /** Label + tooltip, kept injectable so tests do not depend on copy. */
  label?: string
}

function buildButton(label: string): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "ytpt-queue-button"
  button.title = label
  button.setAttribute("aria-label", label)
  // Inline SVG rather than an icon font so nothing extra has to load, and so
  // the button renders identically inside YouTube's own overlay stacking.
  button.innerHTML = `
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M3 6h12v2H3V6zm0 4h12v2H3v-2zm0 4h8v2H3v-2zm12 0v-3h2v3h3v2h-3v3h-2v-3h-3v-2h3z" fill="currentColor"/>
    </svg>`
  return button
}

function findThumbnail(card: Element, selectors: string[]): Element | null {
  for (const selector of selectors) {
    const match = card.querySelector(selector)
    if (match) return match
  }
  return null
}

/**
 * Adds a button to a single card. Returns false when the card is not ready
 * (no video id or no thumbnail container yet) so the caller can retry later.
 */
export function injectInto(card: Element, options: QueueButtonOptions): boolean {
  if (card.hasAttribute(MARKER)) return true
  // Card elements nest (yt-lockup-view-model inside ytd-rich-item-renderer) and
  // resolve to the same thumbnail, which would stack two buttons.
  if (card.parentElement?.closest(`[${MARKER}]`)) return true
  if (options.excludeSelectors?.some((s) => card.matches(s) || card.querySelector(s)))
    return true

  const videoId = videoIdFromCard(card)
  if (!videoId) return false

  const thumbnail = findThumbnail(card, options.thumbnailSelectors)
  if (!thumbnail) return false

  const label = options.label ?? "Add to queue"
  const button = buildButton(label)

  button.addEventListener("click", async (event) => {
    // The whole card is a link; without this the click navigates away.
    event.preventDefault()
    event.stopPropagation()

    button.classList.add("ytpt-queue-button--busy")
    try {
      const ok = await options.onQueue(videoId, card)
      button.classList.toggle("ytpt-queue-button--ok", ok)
      button.classList.toggle("ytpt-queue-button--error", !ok)
    } catch {
      button.classList.add("ytpt-queue-button--error")
    } finally {
      button.classList.remove("ytpt-queue-button--busy")
      setTimeout(() => {
        button.classList.remove(
          "ytpt-queue-button--ok",
          "ytpt-queue-button--error"
        )
      }, 1500)
    }
  })

  // The overlay is positioned against the thumbnail, which YouTube already
  // makes a positioned element; setting it defensively costs nothing.
  if (thumbnail instanceof HTMLElement && !thumbnail.style.position) {
    thumbnail.style.position = "relative"
  }
  thumbnail.append(button)
  card.setAttribute(MARKER, videoId)
  return true
}

/** Injects into every currently-present card. Returns how many were added. */
export function injectAll(
  root: ParentNode,
  options: QueueButtonOptions
): number {
  let added = 0
  const consider = (card: Element) => {
    if (card.hasAttribute(MARKER)) return
    injectInto(card, options)
    // MARKER is set only on a real injection, so this excludes the skip paths
    // (nested card, excluded surface) that also return true.
    if (card.hasAttribute(MARKER)) added++
  }

  if (root instanceof Element && options.cardSelectors.some((s) => root.matches(s))) {
    consider(root)
  }
  for (const selector of options.cardSelectors) {
    for (const card of root.querySelectorAll(selector)) consider(card)
  }
  return added
}

/** Removes every injected button and its marker. */
export function removeAll(root: ParentNode = document): void {
  for (const button of root.querySelectorAll(".ytpt-queue-button")) {
    button.remove()
  }
  for (const card of root.querySelectorAll(`[${MARKER}]`)) {
    card.removeAttribute(MARKER)
  }
  for (const card of root.querySelectorAll(`.${HOVER_CLASS}`)) {
    card.classList.remove(HOVER_CLASS)
  }
}

/**
 * Watches the page and keeps buttons injected as YouTube streams in new cards.
 * Returns a stop function.
 *
 * YouTube recycles card elements during infinite scroll, so the marker is
 * cleared whenever a card's video id changes -- otherwise a recycled card keeps
 * a button wired to the previous video.
 */
/**
 * Tracks the hovered card and mirrors it onto a class.
 *
 * Neither CSS `:hover` nor DOM-ancestry hit-testing is sufficient here. On the
 * home/subscriptions grid YouTube mounts an inline preview player OVER the
 * thumbnail about a second after hover, and that player is not a descendant of
 * the card -- so `event.target.closest(card)` returns null and a naive handler
 * clears the hover state exactly when the preview appears. The button then only
 * reappeared when the pointer was directly over it (it stacks above the
 * preview), which is precisely the reported symptom.
 *
 * `elementsFromPoint` returns the whole stack under the cursor, so the card is
 * still found even when an unrelated overlay is painted on top of it.
 */
export function trackHover(cardSelectors: string[]): () => void {
  const selector = cardSelectors.join(",")
  let hovered: Element | null = null
  let pending = false
  let lastX = 0
  let lastY = 0

  const setHovered = (card: Element | null) => {
    if (card === hovered) return
    hovered?.classList.remove(HOVER_CLASS)
    hovered = card
    hovered?.classList.add(HOVER_CLASS)
  }

  const resolve = () => {
    pending = false
    // Guarded: elementsFromPoint is universal in browsers but absent in some
    // test DOMs, and a throw here would kill hover tracking entirely.
    const stack =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(lastX, lastY)
        : []

    for (const element of stack) {
      const card = element.closest(selector)
      if (card) {
        setHovered(card)
        return
      }
    }
    setHovered(null)
  }

  const onMove = (event: Event) => {
    const pointer = event as PointerEvent
    lastX = pointer.clientX
    lastY = pointer.clientY
    if (pending) return
    pending = true
    // The grid fires pointermove constantly; one hit-test per frame is plenty.
    requestAnimationFrame(resolve)
  }

  const onLeave = () => setHovered(null)

  document.addEventListener("pointermove", onMove, true)
  // NOT capture: pointerleave does not bubble, but capture-phase listeners are
  // still invoked for descendants, so a captured listener here fires every time
  // the pointer crosses any child boundary and would clear the hover mid-card.
  // Without capture, document is only the target when the pointer leaves the
  // document entirely, which is the case we actually want.
  document.addEventListener("pointerleave", onLeave)

  return () => {
    document.removeEventListener("pointermove", onMove, true)
    document.removeEventListener("pointerleave", onLeave)
    setHovered(null)
  }
}

export function observe(options: QueueButtonOptions): () => void {
  let queued = false
  // Subtrees touched since the last flush. YouTube mutates continuously during
  // playback, so re-scanning the whole document every frame would walk
  // thousands of elements many times a second on a long feed.
  const dirty = new Set<Element>()

  /** Drops the button from any card that was recycled onto a new video. */
  const rekey = (card: Element) => {
    const current = videoIdFromCard(card)
    if (current && card.getAttribute(MARKER) !== current) {
      card.querySelector(".ytpt-queue-button")?.remove()
      card.removeAttribute(MARKER)
    }
  }

  const flush = () => {
    queued = false
    const roots =
      dirty.size > 0 ? [...dirty] : ([document.documentElement] as Element[])
    dirty.clear()

    for (const root of roots) {
      if (!root.isConnected) continue
      if (root.hasAttribute(MARKER)) rekey(root)
      for (const card of root.querySelectorAll(`[${MARKER}]`)) rekey(card)
      injectAll(root, options)
    }
  }

  const schedule = () => {
    if (queued) return
    queued = true
    // Coalesce the very chatty mutation stream YouTube produces.
    requestAnimationFrame(flush)
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) dirty.add(node)
      }
      // A recycled card mutates in place rather than being re-added, so also
      // mark the nearest already-processed ancestor.
      const target = record.target
      if (target instanceof Element) {
        const marked = target.closest(`[${MARKER}]`)
        if (marked) dirty.add(marked)
      }
    }
    schedule()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  const stopHover = trackHover(options.cardSelectors)
  schedule()

  return () => {
    observer.disconnect()
    stopHover()
    removeAll(document)
  }
}
