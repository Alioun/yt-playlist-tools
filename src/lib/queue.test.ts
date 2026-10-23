import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  CARD_EXCLUDE_SELECTORS,
  CARD_SELECTORS,
  THUMBNAIL_SELECTORS,
  shouldInjectOnPath,
  injectQueueStyles,
  removeQueueStyles
} from "@/lib/queue"

beforeEach(() => {
  document.head.innerHTML = ""
  document.body.innerHTML = ""
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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
