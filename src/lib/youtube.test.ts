import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  __resetTokenCacheForTests,
  addVideoToPlaylist,
  fetchUserPlaylists
} from "@/lib/youtube"
import { refreshAccessToken } from "@/utils"

// Mocked so these tests never touch storage or the broker -- the refresh path
// is exercised purely through its contract (a new token, or null).
vi.mock("@/utils", () => ({ refreshAccessToken: vi.fn() }))

const mockRefresh = vi.mocked(refreshAccessToken)

/** Queues responses; each fetch call shifts the next one off the front. */
function queueFetch(...responses: Array<{ status?: number; body?: unknown }>) {
  const spy = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift() ?? { status: 500, body: {} }
    return new Response(JSON.stringify(next.body ?? {}), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" }
    })
  })
  vi.stubGlobal("fetch", spy)
  return spy
}

function page(ids: string[], nextPageToken?: string) {
  return {
    items: ids.map((id) => ({ id, snippet: { title: `Title ${id}` } })),
    ...(nextPageToken ? { nextPageToken } : {})
  }
}

function authHeader(spy: ReturnType<typeof queueFetch>, call: number) {
  const init = spy.mock.calls[call]?.[1]
  return init?.headers ? new Headers(init.headers).get("Authorization") : undefined
}

beforeEach(() => {
  // Module-level refresh memo must not leak between tests.
  __resetTokenCacheForTests()
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe("fetchUserPlaylists", () => {
  it("returns id and title for a single page", async () => {
    queueFetch({ body: page(["PL1", "PL2"]) })

    await expect(fetchUserPlaylists("token")).resolves.toEqual([
      { id: "PL1", title: "Title PL1" },
      { id: "PL2", title: "Title PL2" }
    ])
  })

  it("follows nextPageToken until it is absent", async () => {
    const spy = queueFetch(
      { body: page(["PL1"], "page2") },
      { body: page(["PL2"], "page3") },
      { body: page(["PL3"]) }
    )

    const result = await fetchUserPlaylists("token")

    expect(result.map((p) => p.id)).toEqual(["PL1", "PL2", "PL3"])
    expect(spy).toHaveBeenCalledTimes(3)

    // The first request must NOT carry a pageToken; later ones must carry the
    // token the previous page returned.
    expect(new URL(spy.mock.calls[0]![0]).searchParams.get("pageToken")).toBeNull()
    expect(new URL(spy.mock.calls[1]![0]).searchParams.get("pageToken")).toBe("page2")
    expect(new URL(spy.mock.calls[2]![0]).searchParams.get("pageToken")).toBe("page3")
  })

  it("requests mine=true with the max page size", async () => {
    const spy = queueFetch({ body: page([]) })
    await fetchUserPlaylists("token")

    const url = new URL(spy.mock.calls[0]![0])
    expect(url.searchParams.get("mine")).toBe("true")
    expect(url.searchParams.get("maxResults")).toBe("50")
    expect(url.searchParams.get("part")).toBe("snippet")
  })

  it("tolerates a page with no items array", async () => {
    queueFetch({ body: {} })
    await expect(fetchUserPlaylists("token")).resolves.toEqual([])
  })

  it("refreshes once on 401 and retries with the new token", async () => {
    mockRefresh.mockResolvedValue("new-token")
    const spy = queueFetch({ status: 401 }, { body: page(["PL1"]) })

    await expect(fetchUserPlaylists("stale")).resolves.toEqual([
      { id: "PL1", title: "Title PL1" }
    ])

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(authHeader(spy, 0)).toBe("Bearer stale")
    expect(authHeader(spy, 1)).toBe("Bearer new-token")
  })

  it("throws instead of looping when refresh fails on a 401", async () => {
    mockRefresh.mockResolvedValue(null)
    const spy = queueFetch({ status: 401 })

    await expect(fetchUserPlaylists("stale")).rejects.toThrow(/401/)
    // One attempt, one refresh, no retry -- must not spin.
    expect(spy).toHaveBeenCalledTimes(1)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("throws when the retry also returns 401 rather than refreshing again", async () => {
    mockRefresh.mockResolvedValue("still-bad")
    const spy = queueFetch({ status: 401 }, { status: 401 })

    await expect(fetchUserPlaylists("stale")).rejects.toThrow(/401/)
    expect(spy).toHaveBeenCalledTimes(2)
    // Exactly one refresh: a second would risk an unbounded retry loop.
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("refreshes once across a paginated result, not once per page", async () => {
    // The refreshed token used to be dropped on the floor, so every page of a
    // paginated fetch 401'd and refreshed again -- and with Google's token
    // rotation each redundant exchange invalidates the previous refresh token.
    mockRefresh.mockResolvedValue("new-token")
    const spy = queueFetch(
      { status: 401 },
      { body: page(["PL1"], "page2") },
      { body: page(["PL2"]) }
    )

    await expect(fetchUserPlaylists("stale")).resolves.toHaveLength(2)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    // Page 2 must go out with the refreshed token, not the stale one again.
    expect(authHeader(spy, 2)).toBe("Bearer new-token")
  })

  it("throws on a non-401 error status", async () => {
    queueFetch({ status: 403, body: { error: "quotaExceeded" } })
    await expect(fetchUserPlaylists("token")).rejects.toThrow(/403/)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe("addVideoToPlaylist", () => {
  it("POSTs the correct snippet body and resolves true", async () => {
    const spy = queueFetch({ body: {} })

    await expect(addVideoToPlaylist("PL1", "vid123", "token")).resolves.toBe(true)

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit]
    expect(url).toContain("/playlistItems")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body as string)).toEqual({
      snippet: {
        playlistId: "PL1",
        resourceId: { kind: "youtube#video", videoId: "vid123" }
      }
    })
  })

  it("refreshes and retries once on 401", async () => {
    mockRefresh.mockResolvedValue("new-token")
    const spy = queueFetch({ status: 401 }, { body: {} })

    await expect(addVideoToPlaylist("PL1", "vid", "stale")).resolves.toBe(true)
    expect(authHeader(spy, 1)).toBe("Bearer new-token")
  })

  it("resolves false when refresh fails", async () => {
    mockRefresh.mockResolvedValue(null)
    queueFetch({ status: 401 })

    await expect(addVideoToPlaylist("PL1", "vid", "stale")).resolves.toBe(false)
  })

  it("resolves false on a hard failure rather than throwing", async () => {
    // The background script loops over playlists; one failure must not abort
    // the rest, so this returns false instead of rejecting.
    queueFetch({ status: 404, body: { error: "playlistNotFound" } })

    await expect(addVideoToPlaylist("missing", "vid", "token")).resolves.toBe(false)
  })
})
