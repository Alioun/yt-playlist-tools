import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  HOVER_CLASS,
  injectAll,
  injectInto,
  observe,
  removeAll,
  trackHover,
  videoIdFromCard,
  type QueueButtonOptions
} from "@/lib/queue-button"

const OPTIONS = (
  onQueue: QueueButtonOptions["onQueue"] = () => true
): QueueButtonOptions => ({
  cardSelectors: ["div.card"],
  thumbnailSelectors: ["div.thumb"],
  onQueue
})

/** Builds a minimal stand-in for a YouTube video card. */
function card(videoId: string | null, { withThumb = true } = {}) {
  const el = document.createElement("div")
  el.className = "card"
  if (videoId) {
    const a = document.createElement("a")
    a.href = `https://www.youtube.com/watch?v=${videoId}`
    el.append(a)
  }
  if (withThumb) {
    const thumb = document.createElement("div")
    thumb.className = "thumb"
    el.append(thumb)
  }
  document.body.append(el)
  return el
}

const buttonIn = (el: Element) => el.querySelector(".ytpt-queue-button")

beforeEach(() => {
  document.body.innerHTML = ""
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (document as Partial<Document>).elementsFromPoint
})

describe("videoIdFromCard", () => {
  it("reads the id from a watch link", () => {
    expect(videoIdFromCard(card("abc123"))).toBe("abc123")
  })

  it("returns null when the card has no watch link", () => {
    expect(videoIdFromCard(card(null))).toBeNull()
  })

  it("ignores non-watch links", () => {
    const el = card(null)
    const a = document.createElement("a")
    a.href = "https://www.youtube.com/@channel"
    el.append(a)

    expect(videoIdFromCard(el)).toBeNull()
  })
})

describe("injectInto", () => {
  it("adds a labelled button into the thumbnail", () => {
    const el = card("abc123")

    expect(injectInto(el, OPTIONS())).toBe(true)

    const button = buttonIn(el)!
    expect(button).toBeTruthy()
    expect(button.closest("div.thumb")).toBeTruthy()
    expect(button).toHaveAttribute("aria-label", "Add to queue")
    // A bare <button> inside a link would submit/navigate on some surfaces.
    expect(button).toHaveAttribute("type", "button")
  })

  it("declines a card with no video id so it can be retried later", () => {
    const el = card(null)
    expect(injectInto(el, OPTIONS())).toBe(false)
    expect(buttonIn(el)).toBeNull()
  })

  it("declines a card whose thumbnail has not rendered yet", () => {
    const el = card("abc123", { withThumb: false })
    expect(injectInto(el, OPTIONS())).toBe(false)
  })

  it("is idempotent", () => {
    const el = card("abc123")
    injectInto(el, OPTIONS())
    injectInto(el, OPTIONS())

    expect(el.querySelectorAll(".ytpt-queue-button")).toHaveLength(1)
  })

  it("calls onQueue with the video id", async () => {
    const onQueue = vi.fn(() => true)
    const el = card("abc123")
    injectInto(el, OPTIONS(onQueue))
    ;(buttonIn(el) as HTMLElement).click()

    await vi.waitFor(() => {
      expect(onQueue).toHaveBeenCalledWith("abc123", el)
    })
  })

  it("does not navigate when clicked", () => {
    // The whole card is a link on YouTube; without preventDefault the click
    // opens the video instead of queueing it.
    const el = card("abc123")
    injectInto(el, OPTIONS())

    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    buttonIn(el)!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it("marks failure when onQueue reports it", async () => {
    const el = card("abc123")
    injectInto(el, OPTIONS(() => false))
    ;(buttonIn(el) as HTMLElement).click()

    await vi.waitFor(() => {
      expect(buttonIn(el)!.className).toContain("ytpt-queue-button--error")
    })
  })

  it("recovers when onQueue throws", async () => {
    const el = card("abc123")
    injectInto(
      el,
      OPTIONS(() => {
        throw new Error("boom")
      })
    )
    ;(buttonIn(el) as HTMLElement).click()

    await vi.waitFor(() => {
      const cls = buttonIn(el)!.className
      expect(cls).toContain("ytpt-queue-button--error")
      // Must not get stuck in the busy state.
      expect(cls).not.toContain("ytpt-queue-button--busy")
    })
  })
})

describe("injectAll / removeAll", () => {
  it("injects into every matching card", () => {
    card("a")
    card("b")
    card("c")

    expect(injectAll(document, OPTIONS())).toBe(3)
    expect(document.querySelectorAll(".ytpt-queue-button")).toHaveLength(3)
  })

  it("skips cards that are not ready", () => {
    card("a")
    card(null)

    expect(injectAll(document, OPTIONS())).toBe(1)
  })

  it("does not stack a second button on a nested card", () => {
    // yt-lockup-view-model sits inside ytd-rich-item-renderer and resolves to
    // the same thumbnail.
    const outer = card("a")
    const inner = document.createElement("div")
    inner.className = "card"
    outer.querySelector(".thumb")!.append(inner)
    const innerLink = document.createElement("a")
    innerLink.href = "https://www.youtube.com/watch?v=a"
    inner.append(innerLink)
    const innerThumb = document.createElement("div")
    innerThumb.className = "thumb"
    inner.append(innerThumb)

    injectAll(document, OPTIONS())

    expect(document.querySelectorAll(".ytpt-queue-button")).toHaveLength(1)
  })

  it("removes every button and marker", () => {
    card("a")
    card("b")
    injectAll(document, OPTIONS())

    removeAll(document)

    expect(document.querySelectorAll(".ytpt-queue-button")).toHaveLength(0)
    expect(document.querySelectorAll("[data-ytpt-queue]")).toHaveLength(0)
  })
})

describe("trackHover", () => {
  /**
   * Stubs the hit-test stack under the cursor, topmost element first.
   * happy-dom does not implement elementsFromPoint, so it is defined outright.
   */
  function stack(...elements: Element[]) {
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      writable: true,
      value: () => elements
    })
  }

  const move = async () => {
    document.dispatchEvent(
      Object.assign(new MouseEvent("pointermove", { bubbles: true }), {
        clientX: 10,
        clientY: 10
      })
    )
    // Hit-testing is throttled to one frame.
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }

  it("marks the card under the cursor", async () => {
    const el = card("a")
    stack(el.querySelector(".thumb")!, el, document.body)

    const stop = trackHover(["div.card"])
    try {
      await move()
      expect(el).toHaveClass(HOVER_CLASS)
    } finally {
      stop()
    }
  })

  it("keeps the card marked when an overlay outside it covers the thumbnail", async () => {
    // The actual bug: YouTube's inline preview player is painted over the
    // thumbnail but is NOT a descendant of the card, so ancestry-based
    // hit-testing cleared the hover exactly when the preview appeared.
    const el = card("a")
    const overlay = document.createElement("div")
    overlay.id = "inline-preview-player"
    document.body.append(overlay)

    // Overlay is topmost, the card is still in the stack beneath it.
    stack(overlay, el.querySelector(".thumb")!, el, document.body)

    const stop = trackHover(["div.card"])
    try {
      await move()
      expect(el).toHaveClass(HOVER_CLASS)
    } finally {
      stop()
    }
  })

  it("clears when no card is under the cursor", async () => {
    const el = card("a")
    stack(el, document.body)
    const stop = trackHover(["div.card"])
    try {
      await move()
      expect(el).toHaveClass(HOVER_CLASS)

      stack(document.body)
      await move()
      expect(el).not.toHaveClass(HOVER_CLASS)
    } finally {
      stop()
    }
  })

  it("moves the marker between cards", async () => {
    const a = card("a")
    const b = card("b")
    const stop = trackHover(["div.card"])
    try {
      stack(a, document.body)
      await move()
      stack(b, document.body)
      await move()

      expect(a).not.toHaveClass(HOVER_CLASS)
      expect(b).toHaveClass(HOVER_CLASS)
    } finally {
      stop()
    }
  })

  it("stops marking once torn down", async () => {
    const el = card("a")
    stack(el, document.body)
    trackHover(["div.card"])()
    await move()
    expect(el).not.toHaveClass(HOVER_CLASS)
  })
})

describe("observe", () => {
  it("injects into cards added after it starts", async () => {
    const stop = observe(OPTIONS())
    try {
      card("late")

      await vi.waitFor(() => {
        expect(document.querySelectorAll(".ytpt-queue-button")).toHaveLength(1)
      })
    } finally {
      stop()
    }
  })

  it("re-wires a recycled card when its video id changes", async () => {
    // YouTube reuses card elements during infinite scroll. Without re-keying,
    // a recycled card keeps a button bound to the previous video -- so you
    // queue the wrong thing.
    const el = card("first")
    const stop = observe(OPTIONS())
    try {
      await vi.waitFor(() => expect(buttonIn(el)).toBeTruthy())
      expect(el.getAttribute("data-ytpt-queue")).toBe("first")

      el.querySelector("a")!.href = "https://www.youtube.com/watch?v=second"
      // Trigger the observer.
      el.append(document.createElement("span"))

      await vi.waitFor(() => {
        expect(el.getAttribute("data-ytpt-queue")).toBe("second")
      })
      expect(el.querySelectorAll(".ytpt-queue-button")).toHaveLength(1)
    } finally {
      stop()
    }
  })

  it("cleans up everything when stopped", async () => {
    card("a")
    const stop = observe(OPTIONS())
    await vi.waitFor(() => {
      expect(document.querySelectorAll(".ytpt-queue-button")).toHaveLength(1)
    })

    stop()

    expect(document.querySelectorAll(".ytpt-queue-button")).toHaveLength(0)
    // And stops reacting to further mutations.
    card("b")
    await new Promise((r) => setTimeout(r, 30))
    expect(document.querySelectorAll(".ytpt-queue-button")).toHaveLength(0)
  })
})
