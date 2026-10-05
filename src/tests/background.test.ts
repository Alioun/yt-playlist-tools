import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import background from "@/entrypoints/background"
import * as store from "@/lib/storage"
import * as youtube from "@/lib/youtube"

vi.mock("@/lib/youtube", () => ({
  fetchUserPlaylists: vi.fn(),
  addVideoToPlaylist: vi.fn(),
  fetchVideoChannel: vi.fn()
}))
vi.mock("@/lib/video-cache", () => ({
  isVideoCached: vi.fn(async () => false),
  cacheVideo: vi.fn(async () => {})
}))

const TAB_ID = 42

/** Captures toasts the background pushes to the content script. */
let toasts: string[] = []

type Listener = (
  message: unknown,
  sender: { tab?: { id: number } },
  sendResponse: (response?: unknown) => void
) => unknown

let listener: Listener

function send(message: unknown, withTab = true) {
  const responses: unknown[] = []
  const returned = listener(
    message,
    withTab ? { tab: { id: TAB_ID } } : {},
    (r) => responses.push(r)
  )
  return { returned, responses }
}

/** Resolves once sendResponse has been called (or times out). */
async function awaitResponse(message: unknown) {
  let resolve!: (v: unknown) => void
  const promise = new Promise<unknown>((r) => (resolve = r))
  listener(message, { tab: { id: TAB_ID } }, resolve)
  return promise
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(async () => {
  fakeBrowser.reset()
  toasts = []
  // vi.mock factory mocks are not reset by `restoreMocks`, so call counts
  // would accumulate across tests.
  vi.clearAllMocks()
  const cache = await import("@/lib/video-cache")
  vi.mocked(cache.isVideoCached).mockResolvedValue(false)
  vi.mocked(cache.cacheVideo).mockResolvedValue(undefined)
  vi.mocked(youtube.addVideoToPlaylist).mockResolvedValue(true)
  vi.mocked(youtube.fetchUserPlaylists).mockResolvedValue([])
  vi.mocked(youtube.fetchVideoChannel).mockResolvedValue(null)

  // fakeBrowser does not implement tabs.sendMessage.
  Object.assign(fakeBrowser.tabs, {
    sendMessage: vi.fn(async (_id: number, msg: { toastMessage?: string }) => {
      if (msg?.toastMessage) toasts.push(msg.toastMessage)
    })
  })

  const captured: Listener[] = []
  Object.assign(fakeBrowser.runtime, {
    onMessage: { addListener: (fn: Listener) => captured.push(fn) }
  })
  vi.spyOn(console, "error").mockImplementation(() => {})

  background.main()
  listener = captured[0]!
})

describe("the onMessage contract", () => {
  it("returns true only for the request that answers asynchronously", async () => {
    // Chrome ignores a returned Promise (crbug 1185241), so `return true` +
    // sendResponse is the only cross-browser pattern. Returning true on a
    // branch that never calls sendResponse would hang the sender forever.
    await store.accessToken.setValue("at")

    expect(send({ action: "fetchPlaylists" }).returned).toBe(true)
    expect(send({ action: "getChannelForTab", tabId: 1, videoId: "v" }, false).returned).toBe(true)
    expect(send({ action: "addVideoToPlaylists", videoId: "v" }).returned).toBe(false)
    expect(send({ action: "addVideoToShortcutPlaylist", videoId: "v" }).returned).toBe(false)
    expect(send({ action: "unknown" }).returned).toBe(false)
  })

  it("ignores tab-scoped actions with no sender tab", () => {
    expect(send({ action: "addVideoToPlaylists", videoId: "v" }, false).returned).toBe(false)
  })
})

describe("fetchPlaylists", () => {
  it("reports the unauthorized case with the exact string the popup matches", async () => {
    // The popup turns this literal into "Sign in from Options"; renaming it
    // here silently degrades the popup to showing a raw string.
    await expect(awaitResponse({ action: "fetchPlaylists" })).resolves.toEqual({
      error: "No access token",
      playlists: []
    })
  })

  it("returns the fetched playlists", async () => {
    await store.accessToken.setValue("at")
    vi.mocked(youtube.fetchUserPlaylists).mockResolvedValue([
      { id: "PL1", title: "One" }
    ])

    await expect(awaitResponse({ action: "fetchPlaylists" })).resolves.toEqual({
      playlists: [{ id: "PL1", title: "One" }]
    })
  })

  it("caches the result so the next popup open paints instantly", async () => {
    await store.accessToken.setValue("at")
    vi.mocked(youtube.fetchUserPlaylists).mockResolvedValue([
      { id: "PL1", title: "One" }
    ])

    await awaitResponse({ action: "fetchPlaylists" })

    await expect(store.cachedPlaylists.getValue()).resolves.toEqual([
      { id: "PL1", title: "One" }
    ])
  })

  it("leaves the cache untouched when the fetch fails", async () => {
    await store.accessToken.setValue("at")
    await store.cachedPlaylists.setValue([{ id: "old", title: "Old" }])
    vi.mocked(youtube.fetchUserPlaylists).mockRejectedValue(new Error("quota"))

    await awaitResponse({ action: "fetchPlaylists" })

    // Stale data beats an empty popup.
    await expect(store.cachedPlaylists.getValue()).resolves.toEqual([
      { id: "old", title: "Old" }
    ])
  })

  it("still answers when the API throws", async () => {
    await store.accessToken.setValue("at")
    vi.mocked(youtube.fetchUserPlaylists).mockRejectedValue(new Error("quota"))

    const response = (await awaitResponse({ action: "fetchPlaylists" })) as {
      error: string
    }
    expect(response.error).toMatch(/quota/)
  })

  it("still answers when storage itself fails", async () => {
    // The storage read used to sit outside the try block, so a rejection left
    // sendResponse uncalled and the popup stuck on "Loading..." forever.
    vi.spyOn(store.accessToken, "getValue").mockRejectedValue(new Error("boom"))

    const response = (await awaitResponse({ action: "fetchPlaylists" })) as {
      error: string
    }
    expect(response.error).toMatch(/boom/)
  })
})

describe("addVideoToPlaylists", () => {
  beforeEach(async () => {
    await store.accessToken.setValue("at")
  })

  it("adds the video to every selected playlist", async () => {
    await store.playlists.setValue(["PL1", "PL2"])

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(2)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL1", "vid", "at")
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL2", "vid", "at")
  })

  it("tells the user when no playlists are selected", async () => {
    // Previously the loop simply did not run: the watch threshold passed and
    // nothing happened at all, with no toast and no log.
    await store.playlists.setValue([])

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    expect(toasts.join(" ")).toMatch(/no auto-add playlists/i)
  })

  it("tells the user when not signed in", async () => {
    await store.accessToken.setValue("")
    await store.playlists.setValue(["PL1"])

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(toasts.join(" ")).toMatch(/no access token/i)
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })

  it("does not call the API when the message carries no videoId", async () => {
    // JSON.stringify drops an undefined videoId, so the request would go out
    // malformed and come back as a generic "failed to add".
    await store.playlists.setValue(["PL1"])

    send({ action: "addVideoToPlaylists" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })
})

describe("addVideoToShortcutPlaylist", () => {
  beforeEach(async () => {
    await store.accessToken.setValue("at")
  })

  it("adds to the configured shortcut playlist", async () => {
    await store.addToPlaylistID.setValue("PL-short")

    send({ action: "addVideoToShortcutPlaylist", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL-short", "vid", "at")
  })

  it("tells the user when no shortcut playlist is configured", async () => {
    await store.addToPlaylistID.setValue("")

    send({ action: "addVideoToShortcutPlaylist", videoId: "vid" })
    await flush()
    await flush()

    expect(toasts.join(" ")).toMatch(/no shortcut playlist/i)
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })
})

describe("duplicate prevention", () => {
  beforeEach(async () => {
    await store.accessToken.setValue("at")
    await store.playlists.setValue(["PL1"])
  })

  it("skips a cached video when the setting is on", async () => {
    const { isVideoCached } = await import("@/lib/video-cache")
    vi.mocked(isVideoCached).mockResolvedValue(true)
    await store.preventDuplicates.setValue(true)

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    expect(toasts.join(" ")).toMatch(/already in playlist/i)
  })

  it("adds anyway when the setting is off", async () => {
    const { isVideoCached } = await import("@/lib/video-cache")
    vi.mocked(isVideoCached).mockResolvedValue(true)
    await store.preventDuplicates.setValue(false)

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalled()
  })

  it("records a successful add so the next one is suppressed", async () => {
    const { cacheVideo } = await import("@/lib/video-cache")
    await store.preventDuplicates.setValue(true)

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(cacheVideo).toHaveBeenCalledWith("PL1", "vid")
  })

  it("does not record a failed add", async () => {
    const { cacheVideo } = await import("@/lib/video-cache")
    vi.mocked(youtube.addVideoToPlaylist).mockResolvedValue(false)

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(cacheVideo).not.toHaveBeenCalled()
    expect(toasts.join(" ")).toMatch(/failed to add/i)
  })
})

describe("auto-add path", () => {
  beforeEach(async () => {
    await store.accessToken.setValue("at")
    await store.preventDuplicates.setValue(true)
  })

  it("checks every playlist for duplicates, then adds only the new ones", async () => {
    const { isVideoCached } = await import("@/lib/video-cache")
    vi.mocked(isVideoCached).mockImplementation(async (id) => id === "PL2")
    await store.playlists.setValue(["PL1", "PL2", "PL3"])

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(isVideoCached).toHaveBeenCalledTimes(3)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(2)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL1", "vid", "at")
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL3", "vid", "at")
    // Duplicate checks run before any add, so their toasts come first.
    expect(toasts).toEqual([
      "Video already in playlist.",
      "Added vid to playlist",
      "Added vid to playlist"
    ])
  })

  it("adds nothing when every playlist already has the video", async () => {
    const { isVideoCached } = await import("@/lib/video-cache")
    vi.mocked(isVideoCached).mockResolvedValue(true)
    await store.playlists.setValue(["PL1", "PL2"])

    send({ action: "addVideoToPlaylists", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    expect(toasts).toEqual([
      "Video already in playlist.",
      "Video already in playlist."
    ])
  })
})

describe("shortcut path", () => {
  beforeEach(async () => {
    await store.accessToken.setValue("at")
    await store.addToPlaylistID.setValue("PL-short")
  })

  it("keeps its own duplicate check", async () => {
    const { isVideoCached } = await import("@/lib/video-cache")
    vi.mocked(isVideoCached).mockResolvedValue(true)
    await store.preventDuplicates.setValue(true)

    send({ action: "addVideoToShortcutPlaylist", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    expect(toasts).toEqual(["Video already in playlist."])
  })

  it("ignores the auto-add playlists", async () => {
    await store.playlists.setValue(["PL1", "PL2"])

    send({ action: "addVideoToShortcutPlaylist", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(1)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL-short", "vid", "at")
    expect(toasts).toEqual(["Added vid to playlist"])
  })

  it("tells the user when not signed in", async () => {
    await store.accessToken.setValue("")

    send({ action: "addVideoToShortcutPlaylist", videoId: "vid" })
    await flush()
    await flush()

    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    expect(toasts.join(" ")).toMatch(/no access token/i)
  })
})

describe("channel filters on auto-add", () => {
  const LOFI = { channelId: "UClofi", title: "Lofi Girl" }

  beforeEach(async () => {
    await store.accessToken.setValue("at")
    await store.cachedPlaylists.setValue([
      { id: "PL1", title: "Learning" },
      { id: "PL2", title: "Music" },
      { id: "PL3", title: "Cooking" }
    ])
    vi.mocked(youtube.fetchVideoChannel).mockResolvedValue(LOFI)
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  async function autoAdd() {
    send({ action: "addVideoToPlaylists", videoId: "vid" })
    for (let i = 0; i < 5; i++) await flush()
  }

  it("skips a playlist that denies the channel and still adds to the others", async () => {
    await store.playlists.setValue(["PL1", "PL2"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(1)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL2", "vid", "at")
    expect(toasts).toEqual([
      "Lofi Girl filtered out of Learning",
      "Added vid to playlist"
    ])
  })

  it("names every blocked playlist in one toast", async () => {
    await store.playlists.setValue(["PL1", "PL2", "PL3"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] },
      PL3: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(1)
    expect(toasts.filter((t) => t.includes("filtered"))).toEqual([
      "Lofi Girl filtered out of Learning, Cooking"
    ])
  })

  it("logs the decision, so it is still recorded with toasts off", async () => {
    await store.playlists.setValue(["PL1"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()

    expect(console.info).toHaveBeenCalledWith(
      "[YT Playlist Tools]: filtered Lofi Girl filtered out of Learning"
    )
    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
  })

  it("makes no lookup when no remaining playlist has a filter switched on", async () => {
    await store.playlists.setValue(["PL1", "PL2"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: false, channels: ["UClofi"] },
      PL3: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()

    expect(youtube.fetchVideoChannel).not.toHaveBeenCalled()
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(2)
  })

  it("makes no lookup when the filtered playlist was already dropped as a duplicate", async () => {
    const { isVideoCached } = await import("@/lib/video-cache")
    vi.mocked(isVideoCached).mockImplementation(async (id) => id === "PL1")
    await store.preventDuplicates.setValue(true)
    await store.playlists.setValue(["PL1", "PL2"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()

    expect(youtube.fetchVideoChannel).not.toHaveBeenCalled()
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL2", "vid", "at")
  })

  it("makes no videos.list call the second time the same video is auto-added", async () => {
    await store.playlists.setValue(["PL1", "PL2"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()
    await autoAdd()

    expect(youtube.fetchVideoChannel).toHaveBeenCalledTimes(1)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(2)
  })

  it("still adds the video when the channel is unknown", async () => {
    vi.mocked(youtube.fetchVideoChannel).mockResolvedValue(null)
    await store.playlists.setValue(["PL1"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL1", "vid", "at")
    expect(toasts).toEqual(["Added vid to playlist"])
  })

  it("adds a listed channel's video to an allowlist playlist", async () => {
    await store.playlists.setValue(["PL1"])
    await store.channelFilters.setValue({
      PL1: { mode: "allow", enabled: true, channels: ["UClofi"] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL1", "vid", "at")
    expect(toasts).toEqual(["Added vid to playlist"])
  })

  it("skips an allowlist playlist that doesn't list the channel", async () => {
    await store.playlists.setValue(["PL1", "PL2"])
    await store.channelFilters.setValue({
      PL1: { mode: "allow", enabled: true, channels: ["UCother"] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(1)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL2", "vid", "at")
    expect(toasts).toEqual([
      "Lofi Girl filtered out of Learning",
      "Added vid to playlist"
    ])
  })

  it("adds nothing to an empty allowlist", async () => {
    await store.playlists.setValue(["PL1"])
    await store.channelFilters.setValue({
      PL1: { mode: "allow", enabled: true, channels: [] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).not.toHaveBeenCalled()
    expect(toasts).toEqual(["Lofi Girl filtered out of Learning"])
  })

  it("names allow and deny blocks together in one toast", async () => {
    await store.playlists.setValue(["PL1", "PL2", "PL3"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] },
      PL2: { mode: "allow", enabled: true, channels: ["UCother"] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(1)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL3", "vid", "at")
    expect(toasts.filter((t) => t.includes("filtered"))).toEqual([
      "Lofi Girl filtered out of Learning, Music"
    ])
  })

  it("skips allowlists but not denylists when the channel is unknown", async () => {
    vi.mocked(youtube.fetchVideoChannel).mockResolvedValue(null)
    await store.playlists.setValue(["PL1", "PL2", "PL3"])
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] },
      PL2: { mode: "allow", enabled: true, channels: ["UClofi"] },
      PL3: { mode: "allow", enabled: true, channels: [] }
    })

    await autoAdd()

    expect(youtube.addVideoToPlaylist).toHaveBeenCalledTimes(1)
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL1", "vid", "at")
    expect(toasts).toEqual([
      "Couldn't identify the channel, so it was skipped for Music, Cooking",
      "Added vid to playlist"
    ])
    expect(console.info).toHaveBeenCalledWith(
      "[YT Playlist Tools]: filtered Couldn't identify the channel, so it was skipped for Music, Cooking"
    )
  })

  it("never filters the shortcut", async () => {
    await store.addToPlaylistID.setValue("PL1")
    await store.channelFilters.setValue({
      PL1: { mode: "deny", enabled: true, channels: ["UClofi"] }
    })

    send({ action: "addVideoToShortcutPlaylist", videoId: "vid" })
    for (let i = 0; i < 5; i++) await flush()

    expect(youtube.fetchVideoChannel).not.toHaveBeenCalled()
    expect(youtube.addVideoToPlaylist).toHaveBeenCalledWith("PL1", "vid", "at")
  })
})

describe("getChannelForTab", () => {
  it("answers with the resolved channel", async () => {
    await store.accessToken.setValue("at")
    vi.mocked(youtube.fetchVideoChannel).mockResolvedValue({
      channelId: "UClofi",
      title: "Lofi Girl"
    })

    await expect(
      awaitResponse({ action: "getChannelForTab", tabId: 7, videoId: "vid" })
    ).resolves.toEqual({ channel: { channelId: "UClofi", title: "Lofi Girl" } })
  })

  it("answers null when the channel is unknown", async () => {
    await store.accessToken.setValue("at")

    await expect(
      awaitResponse({ action: "getChannelForTab", tabId: 7, videoId: "vid" })
    ).resolves.toEqual({ channel: null })
  })

  it("still answers when storage itself fails", async () => {
    vi.spyOn(store.channelCache, "getValue").mockRejectedValue(new Error("boom"))

    await expect(
      awaitResponse({ action: "getChannelForTab", tabId: 7, videoId: "vid" })
    ).resolves.toEqual({ channel: null })
  })
})
