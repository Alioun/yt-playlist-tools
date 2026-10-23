import { createHash, webcrypto } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PageJob } from "@/lib/session-types"
import { runPageJob } from "./youtube-session"

const rawId = "synthetic-brand||synthetic-google"
const key = createHash("sha256").update(rawId).digest("base64url").slice(0, 16)
const videoId = "video000001"
const playlistId = "PLsynthetic"
const channelId = `UC${"a".repeat(22)}`
const addJob = { kind: "add", accountKey: key, playlistId, videoId } satisfies PageJob
let cfg: Record<string, unknown>
let network = vi.fn<typeof fetch>()

function identity(id = rawId) {
  return { responseContext: { mainAppWebResponseContext: { datasyncId: id } } }
}
function membership(contains: "ALL" | "NONE" = "NONE", id = rawId) {
  return {
    ...identity(id),
    contents: [{ playlistAddToOptionRenderer: { playlistId, title: { simpleText: "Synthetic playlist" }, containsSelectedVideos: contains } }]
  }
}
function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}
function success() {
  return { ...identity(), status: "STATUS_SUCCEEDED" }
}
function sentBody(call = 0): Record<string, unknown> {
  const init = network.mock.calls[call]?.[1]
  if (typeof init?.body !== "string") throw new Error("Expected a JSON request")
  return JSON.parse(init.body)
}
function setResolver(method: (command: unknown, options: {
  commandController: { onSuccess(answer: unknown): void; onServerError(answer: unknown): void }
}) => unknown) {
  Reflect.set(window, "default_kevlar_base", {
    unrelated: { instance: {} },
    syntheticMinifiedKey: { instance: { resolveCommand: method } }
  })
}
async function flush(): Promise<void> {
  await vi.waitFor(() => expect(network).toHaveBeenCalled())
}

beforeEach(() => {
  window.location.href = "https://www.youtube.com/watch?v=video000001"
  document.body.innerHTML = ""
  for (const property of ["__ytptSessionV1", "ytInitialPlayerResponse", "default_kevlar_base"]) Reflect.deleteProperty(window, property)
  cfg = {
    LOGGED_IN: true,
    DATASYNC_ID: rawId,
    INNERTUBE_CONTEXT_CLIENT_NAME: 1,
    INNERTUBE_CONTEXT_CLIENT_VERSION: "synthetic-client-version",
    INNERTUBE_CLIENT_NAME: "WEB",
    INNERTUBE_CONTEXT: {
      client: { clientName: "WEB", clientVersion: "synthetic-client-version", hl: "en", gl: "DE", configInfo: { appInstallData: "synthetic-config" } },
      user: { syntheticExistingField: true }
    },
    VISITOR_DATA: "synthetic-visitor",
    SESSION_INDEX: "2",
    USER_SESSION_ID: "synthetic-user-session",
    DELEGATED_SESSION_ID: "synthetic-delegated-session",
    EXPERIMENT_FLAGS: { pageid_as_header_web: true }
  }
  Reflect.set(window, "ytcfg", { get: (name: string) => cfg[name] })
  vi.stubGlobal("crypto", webcrypto)
  vi.spyOn(document, "cookie", "get").mockReturnValue("SAPISID=synthetic-cookie; __Secure-1PAPISID=synthetic-1p; __Secure-3PAPISID=synthetic-3p")
  network = vi.fn<typeof fetch>()
  vi.stubGlobal("fetch", network)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  for (const property of ["__ytptSessionV1", "ytcfg", "ytInitialPlayerResponse", "default_kevlar_base"]) Reflect.deleteProperty(window, property)
})

describe("page identity", () => {
  it("hashes the whole signed-in ID and returns only the bounded account key", async () => {
    const result = await runPageJob({ kind: "account" })
    expect(result).toEqual({ kind: "account", signedIn: true, accountKey: key })
    expect(key).toHaveLength(16)
    expect(JSON.stringify(result)).not.toMatch(/synthetic-(brand|google|cookie|user-session|delegated-session|visitor)/)
    expect(network).not.toHaveBeenCalled()
  })

  it("never turns a signed-out visitor ID into an account", async () => {
    cfg.LOGGED_IN = false
    cfg.DATASYNC_ID = "Vsynthetic-visitor||"
    expect(await runPageJob({ kind: "account" })).toEqual({ kind: "account", signedIn: false })
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "signedOut" })
    expect(network).not.toHaveBeenCalled()
  })

  it.each(["LOGGED_IN", "DATASYNC_ID"])("fails closed when %s is missing", async (field) => {
    delete cfg[field]
    expect(await runPageJob({ kind: "account" })).toMatchObject({ kind: "error", code: "unavailable" })
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unavailable" })
    expect(network).not.toHaveBeenCalled()
  })

  it("guards direct page jobs even without any consent or extension API globals", async () => {
    const result = await runPageJob({ ...addJob, accountKey: "wrong-account-key" })
    expect(result).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).not.toHaveBeenCalled()
    expect(await runPageJob({ kind: "account" })).toEqual({ kind: "account", signedIn: true, accountKey: key })
  })

  it("pins identity across invocations and latches a changed page configuration", async () => {
    await runPageJob({ kind: "account" })
    cfg.DATASYNC_ID = "synthetic-other||account"
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "accountChanged" })
    cfg.DATASYNC_ID = rawId
    expect(await runPageJob({ kind: "account" })).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).not.toHaveBeenCalled()
  })

  it("blocks a changed membership response permanently before sending a write", async () => {
    network.mockResolvedValueOnce(answer(membership("NONE", "synthetic-other||account")))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(await runPageJob({ kind: "account" })).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("requires a matching response identity on membership, even for a known page account", async () => {
    const body = membership()
    network.mockResolvedValueOnce(answer({ contents: body.contents }))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unavailable" })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("checks identity in error responses before interpreting HTTP failures", async () => {
    network.mockResolvedValueOnce(answer({ ...identity("synthetic-other||account"), error: { code: 403 } }, 403))
    expect(await runPageJob({ kind: "playlists", accountKey: key })).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).toHaveBeenCalledTimes(1)
  })
})

describe("playlist reads", () => {
  it("reads aggregation and continuations in both renderer formats and adds Watch Later once", async () => {
    network
      .mockResolvedValueOnce(answer({
        ...identity(), contents: [
          { playlistRenderer: { playlistId, title: { runs: [{ text: "First" }] } } },
          { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "synthetic-next-page" } } } }
        ]
      }))
      .mockResolvedValueOnce(answer({
        ...identity(), onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [
          { lockupViewModel: { contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST", contentId: "PLsecond", metadata: { lockupMetadataViewModel: { title: { content: "Second" } } } } },
          { gridPlaylistRenderer: { playlistId: "WL", title: { simpleText: "Watch Later" } } },
          { lockupViewModel: { contentType: "LOCKUP_CONTENT_TYPE_VIDEO", contentId: "PLnotAPlaylist", title: "Ignore" } }
        ] } }]
      }))
    expect(await runPageJob({ kind: "playlists", accountKey: key })).toEqual({
      kind: "playlists", accountKey: key,
      playlists: expect.arrayContaining([{ id: playlistId, title: "First" }, { id: "PLsecond", title: "Second" }, { id: "WL", title: "Watch Later" }])
    })
    expect(sentBody()).toMatchObject({ browseId: "FEplaylist_aggregation" })
    expect(sentBody(1)).toMatchObject({ continuation: "synthetic-next-page" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("adds the fixed Watch Later entry when aggregation omits it", async () => {
    network.mockResolvedValueOnce(answer({ ...identity(), contents: [] }))
    expect(await runPageJob({ kind: "playlists", accountKey: key })).toEqual({ kind: "playlists", accountKey: key, playlists: [{ id: "WL", title: "Watch Later" }] })
  })

  it("checks the account on continuation responses", async () => {
    network.mockResolvedValueOnce(answer({ ...identity(), continuations: [{ nextContinuationData: { continuation: "synthetic-next" } }] }))
      .mockResolvedValueOnce(answer(identity("synthetic-other||account")))
    expect(await runPageJob({ kind: "playlists", accountKey: key })).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("rejects a repeated continuation rather than polling", async () => {
    network.mockImplementation(async () => answer({ ...identity(), continuations: [{ nextContinuationData: { continuation: "synthetic-loop" } }] }))
    expect(await runPageJob({ kind: "playlists", accountKey: key })).toMatchObject({ kind: "error", code: "unavailable" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it.each([null, "unrecognized", { contents: { unexpected: true } }])("does not report unreadable JSON as an empty playlist list", async (body) => {
    network.mockResolvedValueOnce(answer(body))
    expect(await runPageJob({ kind: "playlists", accountKey: key })).toMatchObject({ kind: "error", code: "unavailable" })
    expect(network).toHaveBeenCalledTimes(1)
  })
})

describe("guarded adds", () => {
  it("writes once only after same-account membership says the video is absent", async () => {
    network.mockResolvedValueOnce(answer(membership())).mockResolvedValueOnce(answer(success()))
    expect(await runPageJob(addJob)).toEqual({ kind: "add", accountKey: key, alreadyIn: false })
    expect(network).toHaveBeenCalledTimes(2)
    expect(network.mock.calls[0]?.[0]).toBe("https://www.youtube.com/youtubei/v1/playlist/get_add_to_playlist?prettyPrint=false")
    expect(sentBody()).toMatchObject({ videoIds: [videoId], excludeWatchLater: false })
    expect(network.mock.calls[1]?.[0]).toBe("https://www.youtube.com/youtubei/v1/browse/edit_playlist?prettyPrint=false")
    expect(sentBody(1)).toMatchObject({ playlistId, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: videoId }] })
  })

  it.each([playlistId, "WL"])("refuses a duplicate for %s", async (target) => {
    const body = membership("ALL")
    body.contents[0]!.playlistAddToOptionRenderer.playlistId = target
    network.mockResolvedValueOnce(answer(body))
    expect(await runPageJob({ ...addJob, playlistId: target })).toEqual({ kind: "add", accountKey: key, alreadyIn: true })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("parses a view-model selection backed by a saveToPlaylistListEntity", async () => {
    network.mockResolvedValueOnce(answer({
      ...identity(), contents: [{ toggleableListItemViewModel: {
        title: { content: "Synthetic playlist" }, toggleStateKey: "synthetic-entity-key",
        defaultServiceEndpoint: { playlistEditEndpoint: { playlistId } }
      } }], frameworkUpdates: { entityBatchUpdate: { mutations: [{
        entityKey: "synthetic-entity-key", payload: { saveToPlaylistListEntity: { isSelected: true } }
      }] } }
    }))
    expect(await runPageJob(addJob)).toEqual({ kind: "add", accountKey: key, alreadyIn: true })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("finds selected membership on a continuation before considering a write", async () => {
    network.mockResolvedValueOnce(answer({ ...identity(), continuations: [{ nextContinuationData: { continuation: "synthetic-membership-page" } }] }))
      .mockResolvedValueOnce(answer(membership("ALL")))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "add", alreadyIn: true })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("requires matching identity on every membership continuation", async () => {
    network.mockResolvedValueOnce(answer({ ...identity(), continuations: [{ nextContinuationData: { continuation: "synthetic-membership-page" } }] }))
      .mockResolvedValueOnce(answer({ contents: membership().contents }))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unavailable" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it.each([{}, { playlistId, containsSelectedVideos: "UNKNOWN" }])("does not infer absence from unreadable membership %j", async (renderer) => {
    network.mockResolvedValueOnce(answer({ ...identity(), contents: [{ playlistAddToOptionRenderer: renderer }] }))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unavailable" })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("rejects HTTP 200 STATUS_FAILED and does not retry", async () => {
    network.mockResolvedValueOnce(answer(membership())).mockResolvedValueOnce(answer({ ...identity(), status: "STATUS_FAILED" }))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "failed" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("reports a lost write response as unconfirmed with no retry or error detail leak", async () => {
    network.mockResolvedValueOnce(answer(membership())).mockRejectedValueOnce(new Error("synthetic-cookie synthetic-user-session"))
    const result = await runPageJob(addJob)
    expect(result).toMatchObject({ kind: "error", code: "unconfirmed" })
    expect(JSON.stringify(result)).not.toContain("synthetic-")
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("does not interpret HTTP success without application status as a successful save", async () => {
    network.mockResolvedValueOnce(answer(membership())).mockResolvedValueOnce(answer(identity()))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unconfirmed" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("latches a changed write response without retrying the dispatched save", async () => {
    network.mockResolvedValueOnce(answer(membership())).mockResolvedValueOnce(answer({ ...identity("synthetic-other||account"), status: "STATUS_SUCCEEDED" }))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("reports HTTP rejection without another route or retry", async () => {
    network.mockResolvedValueOnce(answer(membership())).mockResolvedValueOnce(answer({ ...identity(), error: { code: 429 } }, 429))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "failed" })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("discovers the command resolver by shape and consumes its full callback answer", async () => {
    network.mockResolvedValueOnce(answer(membership()))
    const resolve = vi.fn((_command, options) => options.commandController.onSuccess(success()))
    setResolver(resolve)
    expect(await runPageJob(addJob)).toEqual({ kind: "add", accountKey: key, alreadyIn: false })
    expect(resolve).toHaveBeenCalledWith({ playlistEditEndpoint: { playlistId, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: videoId }] } }, {
      commandController: { onSuccess: expect.any(Function), onServerError: expect.any(Function) }
    })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("checks STATUS_FAILED in a successful command callback", async () => {
    network.mockResolvedValueOnce(answer(membership()))
    setResolver((_command, options) => options.commandController.onSuccess({ ...identity(), status: "STATUS_FAILED" }))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "failed" })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("checks identity in command error callbacks", async () => {
    network.mockResolvedValueOnce(answer(membership()))
    setResolver((_command, options) => options.commandController.onServerError({ ...identity("synthetic-other||account"), error: { code: 403 } }))
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(await runPageJob({ kind: "account" })).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("treats a throwing resolver as uncertain rather than attempting another write route", async () => {
    network.mockResolvedValueOnce(answer(membership()))
    setResolver(() => { throw new Error("synthetic page failure") })
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unconfirmed" })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("does not retry an asynchronously rejected command", async () => {
    network.mockResolvedValueOnce(answer(membership()))
    setResolver(async () => { throw new Error("synthetic page failure") })
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unconfirmed" })
    expect(network).toHaveBeenCalledTimes(1)
  })
})

describe("request signing", () => {
  it("uses all three hash variants with page context and no API key or rewritten headers", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1700000000000)
    network.mockResolvedValueOnce(answer({ ...identity(), contents: [] }))
    await runPageJob({ kind: "playlists", accountKey: key })
    const init = network.mock.calls[0]?.[1]
    const hashes = [
      ["SAPISIDHASH", "synthetic-cookie"],
      ["SAPISID1PHASH", "synthetic-1p"],
      ["SAPISID3PHASH", "synthetic-3p"]
    ].map(([label, cookie]) => `${label} 1700000000_${createHash("sha1").update(`synthetic-user-session 1700000000 ${cookie} https://www.youtube.com`).digest("hex")}_u`)
    expect(init).toMatchObject({ credentials: "same-origin", headers: {
      Authorization: hashes.join(" "), "X-Goog-AuthUser": "2", "X-Goog-PageId": "synthetic-delegated-session",
      "X-Youtube-Client-Name": "1", "X-Youtube-Client-Version": "synthetic-client-version",
      "X-Origin": "https://www.youtube.com", "X-Goog-Visitor-Id": "synthetic-visitor"
    } })
    const headers = new Headers(init?.headers)
    expect(headers.has("Origin")).toBe(false)
    expect(headers.has("Referer")).toBe(false)
    expect(String(network.mock.calls[0]?.[0])).not.toMatch(/[?&]key=/)
    expect(sentBody()).toMatchObject({ context: { client: { hl: "en", gl: "DE", clientName: "WEB", configInfo: { appInstallData: "synthetic-config" } } } })
  })

  it("uses the 3P cookie fallback, omits the user suffix without a user ID, and puts delegation in context", async () => {
    delete cfg.USER_SESSION_ID
    cfg.EXPERIMENT_FLAGS = { pageid_as_header_web: false }
    vi.spyOn(document, "cookie", "get").mockReturnValue("__Secure-3PAPISID=synthetic-3p")
    vi.spyOn(Date, "now").mockReturnValue(1700000000000)
    network.mockResolvedValueOnce(answer({ ...identity(), contents: [] }))
    await runPageJob({ kind: "playlists", accountKey: key })
    const hash = createHash("sha1").update("1700000000 synthetic-3p https://www.youtube.com").digest("hex")
    const headers = new Headers(network.mock.calls[0]?.[1]?.headers)
    expect(headers.get("Authorization")).toBe(`SAPISIDHASH 1700000000_${hash} SAPISID3PHASH 1700000000_${hash}`)
    expect(headers.has("X-Goog-PageId")).toBe(false)
    expect(sentBody()).toMatchObject({ context: { user: { onBehalfOfUser: "synthetic-delegated-session" } } })
  })

  it("does not send an unsigned account request when cookies are unavailable", async () => {
    vi.spyOn(document, "cookie", "get").mockReturnValue("")
    expect(await runPageJob(addJob)).toMatchObject({ kind: "error", code: "unavailable" })
    expect(network).not.toHaveBeenCalled()
  })
})

describe("public channel lookups", () => {
  it("reads only the matching video from the page player without a request", async () => {
    const player = document.createElement("div")
    player.id = "movie_player"
    Reflect.set(player, "getPlayerResponse", () => ({ videoDetails: { videoId, channelId, author: "Synthetic channel" } }))
    document.body.append(player)
    expect(await runPageJob({ kind: "videoChannel", videoId })).toEqual({ kind: "channel", channel: { channelId, title: "Synthetic channel" } })
    expect(network).not.toHaveBeenCalled()
  })

  it("uses a plain next request when the player still holds the previous video", async () => {
    Reflect.set(window, "ytInitialPlayerResponse", { videoDetails: { videoId: "other000001", channelId, author: "Stale" } })
    network.mockResolvedValueOnce(answer({ contents: { videoOwnerRenderer: {
      title: { runs: [{ text: "Synthetic channel" }] }, navigationEndpoint: {
        browseEndpoint: { browseId: channelId }, commandMetadata: { webCommandMetadata: { url: "/@synthetic" } }
      }
    } } }))
    expect(await runPageJob({ kind: "videoChannel", videoId })).toEqual({ kind: "channel", channel: { channelId, title: "Synthetic channel", handle: "@synthetic" } })
    expect(network.mock.calls[0]?.[0]).toContain("/next?")
    expect(new Headers(network.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false)
    expect(sentBody()).not.toHaveProperty("context.user")
  })

  it("resolves and browses a channel signed out without reading cookies or sending authorization", async () => {
    cfg.LOGGED_IN = false
    cfg.DATASYNC_ID = "Vsynthetic-visitor||"
    const cookieRead = vi.spyOn(document, "cookie", "get")
    network.mockResolvedValueOnce(answer({ endpoint: {
      commandMetadata: { webCommandMetadata: { webPageType: "WEB_PAGE_TYPE_CHANNEL" } }, browseEndpoint: { browseId: channelId }
    } })).mockResolvedValueOnce(answer({ metadata: { channelMetadataRenderer: { externalId: channelId, title: "Synthetic channel", vanityChannelUrl: "https://www.youtube.com/@synthetic" } } }))
    expect(await runPageJob({ kind: "resolveChannel", query: { by: "handle", handle: "@synthetic" } })).toEqual({ kind: "channel", channel: { channelId, title: "Synthetic channel", handle: "@synthetic" } })
    expect(cookieRead).not.toHaveBeenCalled()
    for (const [, init] of network.mock.calls) expect(new Headers(init?.headers).has("Authorization")).toBe(false)
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("rejects channel-like IDs without channel page metadata", async () => {
    network.mockResolvedValueOnce(answer({ endpoint: { browseEndpoint: { browseId: channelId } } }))
    expect(await runPageJob({ kind: "resolveChannel", query: { by: "id", id: channelId } })).toEqual({ kind: "channel", channel: null })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("bounds URL redirects and never requests another origin", async () => {
    network.mockImplementation(async () => answer({ endpoint: { urlEndpoint: { url: "/@synthetic-redirect" } } }))
    expect(await runPageJob({ kind: "resolveChannel", query: { by: "username", username: "synthetic" } })).toEqual({ kind: "channel", channel: null })
    expect(network).toHaveBeenCalledTimes(4)
    for (const [url] of network.mock.calls) expect(String(url)).toBe("https://www.youtube.com/youtubei/v1/navigation/resolve_url?prettyPrint=false")
  })
})

describe("deadlines and serialization", () => {
  it("runs the serialized function with no module closure for both a read and guarded write", async () => {
    const serialized: typeof runPageJob = new Function(`return (${runPageJob.toString()})`)()
    expect(await serialized({ kind: "account" })).toEqual({ kind: "account", signedIn: true, accountKey: key })
    network.mockResolvedValueOnce(answer(membership())).mockResolvedValueOnce(answer(success()))
    expect(await serialized(addJob)).toEqual({ kind: "add", accountKey: key, alreadyIn: false })
    expect(network).toHaveBeenCalledTimes(2)
  })

  it("serializes composite adds so a second membership check observes the first save", async () => {
    let release: (response: Response) => void = () => {}
    network.mockResolvedValueOnce(answer(membership()))
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
      .mockResolvedValueOnce(answer(membership("ALL")))
    const first = runPageJob(addJob)
    const second = runPageJob(addJob)
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2))
    release(answer(success()))
    expect(await first).toMatchObject({ kind: "add", alreadyIn: false })
    expect(await second).toMatchObject({ kind: "add", alreadyIn: true })
    expect(network).toHaveBeenCalledTimes(3)
  })

  it("never sends a queued add after its total deadline expires", async () => {
    await runPageJob({ kind: "account" })
    vi.useFakeTimers()
    let release: (response: Response) => void = () => {}
    network.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const blocking = runPageJob({ kind: "playlists", accountKey: key })
    await flush()
    const queued = runPageJob(addJob)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await blocking).toMatchObject({ kind: "error", code: "unavailable" })
    expect(await queued).toMatchObject({ kind: "error", code: "unavailable" })
    release(answer({ ...identity(), contents: [] }))
    await vi.advanceTimersByTimeAsync(1)
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("includes membership time in the write deadline and reports an unanswered command as unconfirmed", async () => {
    await runPageJob({ kind: "account" })
    vi.useFakeTimers()
    let release: (response: Response) => void = () => {}
    network.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const command = vi.fn(() => undefined)
    setResolver(command)
    const result = runPageJob(addJob)
    await flush()
    await vi.advanceTimersByTimeAsync(9000)
    release(answer(membership()))
    await vi.waitFor(() => expect(command).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(1000)
    expect(await result).toMatchObject({ kind: "error", code: "unconfirmed" })
    expect(network).toHaveBeenCalledTimes(1)
    expect(command).toHaveBeenCalledTimes(1)
  })

  it("checks a late command answer for account changes after returning unconfirmed", async () => {
    await runPageJob({ kind: "account" })
    vi.useFakeTimers()
    network.mockResolvedValueOnce(answer(membership()))
    let respond: (body: unknown) => void = () => {}
    const command = vi.fn((_command, options) => { respond = options.commandController.onSuccess })
    setResolver(command)
    const pending = runPageJob(addJob)
    await vi.waitFor(() => expect(command).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(10000)
    expect(await pending).toMatchObject({ kind: "error", code: "unconfirmed" })
    respond({ ...identity("synthetic-other||account"), status: "STATUS_SUCCEEDED" })
    expect(await runPageJob({ kind: "account" })).toMatchObject({ kind: "error", code: "accountChanged" })
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("does not write after a timed-out membership answer finally arrives", async () => {
    await runPageJob({ kind: "account" })
    vi.useFakeTimers()
    let release: (response: Response) => void = () => {}
    network.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const result = runPageJob(addJob)
    await flush()
    await vi.advanceTimersByTimeAsync(10000)
    expect(await result).toMatchObject({ kind: "error", code: "unavailable" })
    release(answer(membership()))
    await vi.advanceTimersByTimeAsync(1)
    expect(network).toHaveBeenCalledTimes(1)
  })

  it("reports a timed-out signed write as unconfirmed and never retries it", async () => {
    await runPageJob({ kind: "account" })
    vi.useFakeTimers()
    network.mockResolvedValueOnce(answer(membership())).mockImplementationOnce(() => new Promise(() => {}))
    const timed = runPageJob(addJob)
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(10000)
    expect(await timed).toMatchObject({ kind: "error", code: "unconfirmed" })
    expect(network.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    expect(network).toHaveBeenCalledTimes(2)
  })
})
