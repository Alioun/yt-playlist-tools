import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PLAYER_REQUEST,
  PLAYER_RESPONSE,
  channelFromPage,
  handleFromProfileUrl,
  readPlayerChannel
} from "@/lib/page-channel"

const PAGE = {
  videoId: "vid",
  channelId: "UClofi",
  author: "Lofi Girl",
  ownerProfileUrl: "http://www.youtube.com/@LofiGirl"
}

/** Stands in for the MAIN-world bridge. Null never answers. */
function fakeBridge(reply: Record<string, unknown> | null) {
  const handler = (event: Event) => {
    if (reply === null) return
    const { token } = (event as CustomEvent).detail
    document.dispatchEvent(
      new CustomEvent(PLAYER_RESPONSE, { detail: { token, ...reply } })
    )
  }
  document.addEventListener(PLAYER_REQUEST, handler)
  return () => document.removeEventListener(PLAYER_REQUEST, handler)
}

afterEach(() => {
  vi.useRealTimers()
})

describe("readPlayerChannel", () => {
  it("passes on what the bridge read", async () => {
    const stop = fakeBridge(PAGE)
    try {
      await expect(readPlayerChannel()).resolves.toEqual(PAGE)
    } finally {
      stop()
    }
  })

  it("keeps only string fields", async () => {
    const stop = fakeBridge({ ...PAGE, author: { evil: true }, extra: "x" })
    try {
      await expect(readPlayerChannel()).resolves.toEqual({ ...PAGE, author: "" })
    } finally {
      stop()
    }
  })

  it("resolves null when the bridge found no player", async () => {
    const stop = fakeBridge({})
    try {
      await expect(readPlayerChannel()).resolves.toBeNull()
    } finally {
      stop()
    }
  })

  it("ignores a reply meant for another request", async () => {
    vi.useFakeTimers()
    const stale = () =>
      document.dispatchEvent(
        new CustomEvent(PLAYER_RESPONSE, { detail: { token: "other", ...PAGE } })
      )
    document.addEventListener(PLAYER_REQUEST, stale)
    try {
      const read = readPlayerChannel()
      await vi.advanceTimersByTimeAsync(1000)
      await expect(read).resolves.toBeNull()
    } finally {
      document.removeEventListener(PLAYER_REQUEST, stale)
    }
  })

  it("resolves null when the bridge never answers", async () => {
    vi.useFakeTimers()
    const stop = fakeBridge(null)
    try {
      const read = readPlayerChannel()
      await vi.advanceTimersByTimeAsync(1000)
      await expect(read).resolves.toBeNull()
    } finally {
      stop()
    }
  })
})

describe("handleFromProfileUrl", () => {
  it.each([
    ["http://www.youtube.com/@LofiGirl", "@LofiGirl"],
    ["https://www.youtube.com/@LofiGirl/videos", "@LofiGirl"],
    ["http://www.youtube.com/@%E3%83%AD%E3%83%95%E3%82%A3", "@ロフィ"],
    ["http://www.youtube.com/channel/UClofi", undefined],
    ["http://www.youtube.com/user/lofi", undefined],
    ["", undefined],
    ["not a url", undefined]
  ])("%s → %s", (url, handle) => {
    expect(handleFromProfileUrl(url)).toBe(handle)
  })
})

describe("channelFromPage", () => {
  it("accepts a read of the requested video, with its handle", () => {
    expect(channelFromPage("vid", PAGE)).toEqual({
      channelId: "UClofi",
      title: "Lofi Girl",
      handle: "@LofiGirl"
    })
  })

  it("rejects a read of another video, such as a stale player after navigating", () => {
    expect(channelFromPage("next", PAGE)).toBeNull()
  })

  it("accepts a read with no handle", () => {
    expect(
      channelFromPage("vid", { ...PAGE, ownerProfileUrl: "" })
    ).toEqual({ channelId: "UClofi", title: "Lofi Girl" })
  })

  it.each([
    ["nothing", null],
    ["a non-object", "UClofi"],
    ["no channel ID", { ...PAGE, channelId: "" }],
    ["a channel ID that isn't one", { ...PAGE, channelId: "lofi" }],
    ["a non-string channel ID", { ...PAGE, channelId: 7 }]
  ])("rejects %s", (_, page) => {
    expect(channelFromPage("vid", page)).toBeNull()
  })
})
