import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CARD_EXCLUDE_SELECTORS,
  CARD_SELECTORS,
  QUEUE_REQUEST,
  QUEUE_RESPONSE,
  THUMBNAIL_SELECTORS,
  addToQueue,
  shouldInjectOnPath,
  injectQueueStyles,
  removeQueueStyles
} from "@/lib/queue"

/** Stands in for the MAIN-world bridge. */
function fakeBridge(reply: (videoId: string) => boolean | null) {
  const seen: Array<{ videoId: string; token: string }> = []
  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail
    seen.push(detail)
    const ok = reply(detail.videoId)
    if (ok === null) return // simulate a bridge that never answers
    document.dispatchEvent(
      new CustomEvent(QUEUE_RESPONSE, { detail: { token: detail.token, ok } })
    )
  }
  document.addEventListener(QUEUE_REQUEST, handler)
  return {
    seen,
    stop: () => document.removeEventListener(QUEUE_REQUEST, handler)
  }
}

beforeEach(() => {
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("addToQueue", () => {
  it("sends the video id to the bridge and resolves its answer", async () => {
    const bridge = fakeBridge(() => true)
    try {
      await expect(addToQueue("abc123")).resolves.toBe(true)
      expect(bridge.seen[0]!.videoId).toBe("abc123")
    } finally {
      bridge.stop()
    }
  })

  it("resolves false when the bridge reports failure", async () => {
    const bridge = fakeBridge(() => false)
    try {
      await expect(addToQueue("abc123")).resolves.toBe(false)
    } finally {
      bridge.stop()
    }
  })

  it("ignores a reply carrying a different token", async () => {
    // The bridge is shared across every button on the page, so replies must be
    // correlated -- otherwise one click resolves another click's promise.
    const handler = (event: Event) => {
      const { token } = (event as CustomEvent).detail
      document.dispatchEvent(
        new CustomEvent(QUEUE_RESPONSE, { detail: { token: "someone-else", ok: true } })
      )
      // Then the real one.
      document.dispatchEvent(
        new CustomEvent(QUEUE_RESPONSE, { detail: { token, ok: false } })
      )
    }
    document.addEventListener(QUEUE_REQUEST, handler)
    try {
      await expect(addToQueue("abc123")).resolves.toBe(false)
    } finally {
      document.removeEventListener(QUEUE_REQUEST, handler)
    }
  })

  it("gives each request a distinct token", async () => {
    const bridge = fakeBridge(() => true)
    try {
      await Promise.all([addToQueue("a"), addToQueue("b")])
      expect(bridge.seen).toHaveLength(2)
      expect(bridge.seen[0]!.token).not.toBe(bridge.seen[1]!.token)
    } finally {
      bridge.stop()
    }
  })

  it("resolves false rather than hanging when the bridge never answers", async () => {
    vi.useFakeTimers()
    const bridge = fakeBridge(() => null)
    try {
      const promise = addToQueue("abc123")
      await vi.advanceTimersByTimeAsync(2500)
      await expect(promise).resolves.toBe(false)
    } finally {
      bridge.stop()
    }
  })

  it("stops listening once settled", async () => {
    const bridge = fakeBridge(() => true)
    try {
      await addToQueue("abc123")
      const before = document.querySelectorAll("*").length
      // A stray late reply must not throw or resurrect anything.
      document.dispatchEvent(
        new CustomEvent(QUEUE_RESPONSE, { detail: { token: "stale", ok: true } })
      )
      expect(document.querySelectorAll("*").length).toBe(before)
    } finally {
      bridge.stop()
    }
  })
})

describe("styles", () => {
  it("injects once and removes cleanly", () => {
    injectQueueStyles()
    injectQueueStyles()

    const styles = document.head.querySelectorAll("style#ytpt-queue-button-styles")
    expect(styles).toHaveLength(1)
    expect(styles[0]!.textContent).toContain(".ytpt-queue-button")

    removeQueueStyles()
    expect(document.head.querySelector("#ytpt-queue-button-styles")).toBeNull()
  })

  it("reveals the button on card hover", () => {
    injectQueueStyles()
    const css = document.head.querySelector("style")!.textContent!
    expect(css).toContain(":hover .ytpt-queue-button")
    // Keyboard users never hover.
    expect(css).toContain(":focus-visible")
  })
})

describe("selectors", () => {
  it("covers both the legacy renderers and the newer lockup component", () => {
    // YouTube moved search results and the watch-page sidebar to
    // yt-lockup-view-model while the feeds still use ytd-rich-item-renderer.
    expect(CARD_SELECTORS).toContain("ytd-rich-item-renderer")
    expect(CARD_SELECTORS).toContain("yt-lockup-view-model")
  })

  it("excludes surfaces that cannot be queued", () => {
    // Shorts have no queue, and injecting into ad slots would be wrong.
    expect(CARD_EXCLUDE_SELECTORS.join(" ")).toMatch(/shorts/i)
    expect(CARD_EXCLUDE_SELECTORS).toContain("ytd-ad-slot-renderer")
  })

  it("anchors on a thumbnail container", () => {
    expect(THUMBNAIL_SELECTORS).toContain("ytd-thumbnail")
    expect(THUMBNAIL_SELECTORS).toContain("yt-thumbnail-view-model")
  })
})

describe("shouldInjectOnPath", () => {
  it("skips the subscriptions feed, which already has YouTube's own button", () => {
    expect(shouldInjectOnPath("/feed/subscriptions")).toBe(false)
  })

  it("still injects on the surfaces that lack one", () => {
    // Home keeps it deliberately -- only /feed/subscriptions was reported as
    // already carrying YouTube's control.
    expect(shouldInjectOnPath("/")).toBe(true)
    expect(shouldInjectOnPath("/watch")).toBe(true)
    expect(shouldInjectOnPath("/results")).toBe(true)
    expect(shouldInjectOnPath("/feed/history")).toBe(true)
  })

  it("matches on a path boundary, not a bare prefix", () => {
    // /feed/subscriptions-something-else is a different page; excluding it
    // because the string starts the same would be wrong.
    expect(shouldInjectOnPath("/feed/subscriptions/grid")).toBe(false)
    expect(shouldInjectOnPath("/feed/subscriptions-extra")).toBe(true)
  })
})
