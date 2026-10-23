import type {
  PageJob,
  PageReply,
  SessionChannel,
  SessionErrorCode,
  SessionPlaylist
} from "@/lib/session-types"

// executeScript serializes this function without its module scope.
export async function runPageJob(job: PageJob): Promise<PageReply> {
  const deadline = Date.now() + 10000
  type JsonObject = Record<string, unknown>
  type Identity =
    | { kind: "unknown"; rawId: null }
    | { kind: "signedOut"; rawId: string | null }
    | { kind: "signedIn"; rawId: string }
  type Resolver = { instance: JsonObject; method: (command: unknown, options: unknown) => unknown }
  type PageState = {
    identity: Identity
    tripped: boolean
    lane: Promise<void>
    resolver?: Resolver
  }
  const page = window as Window & {
    ytcfg?: unknown
    ytInitialPlayerResponse?: unknown
    default_kevlar_base?: unknown
    __ytptSessionV1?: PageState
  }
  const messages = {
    signedOut: "Sign in to YouTube to save videos.",
    unavailable: "YouTube could not safely answer this request. Reload the page and try again.",
    accountChanged: "Your YouTube account changed in another tab. Reload this page to keep saving here.",
    failed: "YouTube rejected this request.",
    unconfirmed: "The save was sent but could not be confirmed. Check the playlist before trying again."
  } satisfies Record<SessionErrorCode, string>
  class JobFailure extends Error {
    constructor(readonly code: SessionErrorCode) {
      super(messages[code])
    }
  }
  function fail(code: SessionErrorCode): never {
    throw new JobFailure(code)
  }
  function errorReply(error: unknown): PageReply {
    const code = error instanceof JobFailure ? error.code : "unavailable"
    return { kind: "error", code, message: messages[code] }
  }
  function object(value: unknown): JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as JsonObject
      : {}
  }
  function at(value: unknown, ...keys: string[]): unknown {
    for (const key of keys) value = object(value)[key]
    return value
  }
  function text(value: unknown): string {
    if (typeof value === "string") return value
    const data = object(value)
    if (typeof data.simpleText === "string") return data.simpleText
    if (typeof data.content === "string") return data.content
    return Array.isArray(data.runs)
      ? data.runs.map((run) => typeof object(run).text === "string" ? object(run).text : "").join("")
      : ""
  }
  function config(key: string): unknown {
    const cfg = object(page.ytcfg)
    return typeof cfg.get === "function" ? cfg.get.call(page.ytcfg, key) : object(cfg.data_)[key]
  }
  async function digest(algorithm: string, input: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest(algorithm, new TextEncoder().encode(input)))
  }
  async function accountKey(rawId: string): Promise<string> {
    const bytes = await digest("SHA-256", rawId)
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").slice(0, 16)
  }
  function pinIdentity(): Identity {
    const loggedIn = config("LOGGED_IN")
    const id = config("DATASYNC_ID")
    const rawId = typeof id === "string" && id.length > 0 ? id : null
    if (loggedIn === false) return { kind: "signedOut", rawId }
    if (loggedIn !== true || rawId === null) return { kind: "unknown", rawId: null }
    return { kind: "signedIn", rawId }
  }
  function walk(value: unknown, visit: (node: JsonObject) => void): void {
    const pending = [value]
    let count = 0
    while (pending.length) {
      if (++count > 50000) fail("unavailable")
      const node = pending.pop()
      if (Array.isArray(node)) pending.push(...node)
      else if (node !== null && typeof node === "object") {
        const data = object(node)
        visit(data)
        pending.push(...Object.values(data))
      }
    }
  }
  function channelId(value: unknown): value is string {
    return typeof value === "string" && /^UC[\w-]{22}$/.test(value)
  }
  function playlistId(value: unknown): value is string {
    return typeof value === "string" && /^[\w-]{2,100}$/.test(value)
  }
  function handleFromUrl(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined
    try {
      const url = new URL(value, "https://www.youtube.com")
      if (!/^(www\.)?youtube\.com$/.test(url.hostname)) return undefined
      const handle = decodeURIComponent(url.pathname.split("/")[1] ?? "")
      return /^@[^\s/?#@]+$/u.test(handle) ? handle : undefined
    } catch {
      return undefined
    }
  }

  try {
    if (location.origin !== "https://www.youtube.com" || window.top !== window) fail("unavailable")
    const state = page.__ytptSessionV1 ??= { identity: pinIdentity(), tripped: false, lane: Promise.resolve() }
    const abort = new AbortController()
    let expired = false
    let writeSent = false
    function active(): void {
      if (Date.now() >= deadline) expired = true
      if (expired) fail(writeSent ? "unconfirmed" : "unavailable")
      if (state.tripped && (job.kind === "account" || "accountKey" in job)) fail("accountChanged")
    }
    function trip(): never {
      state.tripped = true
      fail("accountChanged")
    }
    async function requireAccount(key?: string): Promise<string> {
      active()
      if (state.tripped) fail("accountChanged")
      if (state.identity.kind === "unknown") fail("unavailable")
      if (state.identity.kind === "signedOut") fail("signedOut")
      const currentId = config("DATASYNC_ID")
      if (config("LOGGED_IN") === false || (typeof currentId === "string" && currentId !== state.identity.rawId)) trip()
      if (config("LOGGED_IN") !== true || typeof currentId !== "string" || !currentId) fail("unavailable")
      const pinnedKey = await accountKey(state.identity.rawId)
      active()
      if (state.tripped) fail("accountChanged")
      if (key !== undefined && key !== pinnedKey) fail("accountChanged")
      return pinnedKey
    }
    function verifyAnswer(answer: unknown, identityRequired = false): void {
      const id = at(answer, "responseContext", "mainAppWebResponseContext", "datasyncId")
      if (id !== undefined && state.identity.rawId !== null && id !== state.identity.rawId) trip()
      if (identityRequired && (state.identity.kind !== "signedIn" || id !== state.identity.rawId)) fail("unavailable")
      if (at(answer, "error") !== undefined || at(answer, "status") === "STATUS_FAILED") fail("failed")
    }
    async function request(path: string, fields: JsonObject, signed: boolean, write = false): Promise<unknown> {
      active()
      const context = structuredClone(object(config("INNERTUBE_CONTEXT")))
      const client = object(context.client)
      const name = config("INNERTUBE_CONTEXT_CLIENT_NAME")
      const version = config("INNERTUBE_CONTEXT_CLIENT_VERSION")
      if ((typeof name !== "number" && typeof name !== "string") || typeof version !== "string" || !version) fail("unavailable")
      if (typeof client.clientName !== "string") client.clientName = config("INNERTUBE_CLIENT_NAME")
      if (typeof client.clientName !== "string" || !client.clientName) fail("unavailable")
      client.clientVersion = version
      client.userAgent = navigator.userAgent
      context.client = client
      context.request = { ...object(context.request), internalExperimentFlags: [] }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Youtube-Client-Name": String(name),
        "X-Youtube-Client-Version": version
      }
      const visitor = config("VISITOR_DATA")
      if (typeof visitor === "string" && visitor) headers["X-Goog-Visitor-Id"] = visitor
      if (signed) {
        await requireAccount("accountKey" in job ? job.accountKey : undefined)
        headers["X-Youtube-Bootstrap-Logged-In"] = "true"
        headers["X-Origin"] = location.origin
        const session = config("SESSION_INDEX")
        if (typeof session === "number" || typeof session === "string") headers["X-Goog-AuthUser"] = String(session)
        const delegated = config("DELEGATED_SESSION_ID")
        if (typeof delegated === "string" && delegated) {
          if (at(config("EXPERIMENT_FLAGS"), "pageid_as_header_web") === true) headers["X-Goog-PageId"] = delegated
          else context.user = { ...object(context.user), onBehalfOfUser: delegated }
        }
        const cookies = new Map(document.cookie.split(";").map((part) => {
          const separator = part.indexOf("=")
          return [part.slice(0, separator).trim(), part.slice(separator + 1)]
        }))
        const sessionId = config("USER_SESSION_ID")
        const user = typeof sessionId === "string" && sessionId ? sessionId : null
        const timestamp = Math.floor(Date.now() / 1000)
        const parts: string[] = []
        for (const [label, cookie] of [
          ["SAPISIDHASH", cookies.get("SAPISID") || cookies.get("__Secure-3PAPISID")],
          ["SAPISID1PHASH", cookies.get("__Secure-1PAPISID")],
          ["SAPISID3PHASH", cookies.get("__Secure-3PAPISID")]
        ]) {
          if (!cookie) continue
          const input = `${user ? `${user} ` : ""}${timestamp} ${cookie} ${location.origin}`
          const hash = Array.from(await digest("SHA-1", input), (byte) => byte.toString(16).padStart(2, "0")).join("")
          parts.push(`${label} ${timestamp}_${hash}${user ? "_u" : ""}`)
        }
        if (!parts.length) fail("unavailable")
        headers.Authorization = parts.join(" ")
        await requireAccount("accountKey" in job ? job.accountKey : undefined)
      } else {
        delete context.user
      }
      active()
      if (write) writeSent = true
      let response: Response
      let answer: unknown
      try {
        response = await fetch(`${location.origin}/youtubei/v1/${path}?prettyPrint=false`, {
          method: "POST", credentials: "same-origin", headers,
          body: JSON.stringify({ ...fields, context }), signal: abort.signal
        })
        answer = await response.json()
      } catch {
        fail(write ? "unconfirmed" : "unavailable")
      }
      verifyAnswer(answer)
      active()
      if (!response.ok) fail("failed")
      return answer
    }
    function resolver(): Resolver | undefined {
      if (state.resolver && state.resolver.instance.resolveCommand === state.resolver.method) return state.resolver
      state.resolver = undefined
      for (const candidate of Object.values(object(page.default_kevlar_base))) {
        const instance = object(object(candidate).instance)
        if (typeof instance.resolveCommand === "function") {
          state.resolver = { instance, method: instance.resolveCommand as Resolver["method"] }
          return state.resolver
        }
      }
      return undefined
    }
    async function edit(playlist: string, video: string): Promise<unknown> {
      const endpoint = { playlistId: playlist, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: video }] }
      const resolved = resolver()
      if (!resolved) return request("browse/edit_playlist", endpoint, true, true)
      await requireAccount("accountKey" in job ? job.accountKey : undefined)
      active()
      return new Promise<unknown>((resolve, reject) => {
        const finish = (answer: unknown, serverError: boolean) => {
          try {
            verifyAnswer(answer)
            active()
            if (serverError) fail("failed")
            resolve(answer)
          } catch (error) {
            reject(error)
          } finally {
            abort.signal.removeEventListener("abort", onAbort)
          }
        }
        const onAbort = () => reject(new JobFailure("unconfirmed"))
        abort.signal.addEventListener("abort", onAbort, { once: true })
        writeSent = true
        try {
          const returned: unknown = resolved.method.call(resolved.instance, { playlistEditEndpoint: endpoint }, {
            commandController: {
              onSuccess: (answer: unknown) => finish(answer, false),
              onServerError: (answer: unknown) => finish(answer, true)
            }
          })
          void Promise.resolve(returned).catch(() => {
            abort.signal.removeEventListener("abort", onAbort)
            reject(new JobFailure("unconfirmed"))
          })
        } catch {
          abort.signal.removeEventListener("abort", onAbort)
          // A throwing page hook cannot prove whether it dispatched a write.
          reject(new JobFailure("unconfirmed"))
        }
      })
    }
    function continuations(answer: unknown): string[] {
      const tokens = new Set<string>()
      walk(answer, (node) => {
        const token = at(node, "continuationCommand", "token") ?? at(node, "nextContinuationData", "continuation")
        if (typeof token === "string" && token) tokens.add(token)
      })
      return [...tokens]
    }
    async function pages(path: string, fields: JsonObject, consume: (answer: unknown) => void, identityRequired = false): Promise<void> {
      const pending: (string | null)[] = [null]
      const seen = new Set<string>()
      while (pending.length) {
        const token = pending.shift()
        const answer = await request(path, token ? { continuation: token } : fields, true)
        verifyAnswer(answer, identityRequired)
        consume(answer)
        for (const next of continuations(answer)) {
          if (seen.has(next) || seen.size >= 100) fail("unavailable")
          seen.add(next)
          pending.push(next)
        }
      }
    }
    function parsePlaylists(answer: unknown, playlists: Map<string, SessionPlaylist>): void {
      const data = object(answer)
      let recognized = [data.contents, data.onResponseReceivedActions, data.onResponseReceivedEndpoints, data.continuations].some(Array.isArray)
      walk(answer, (node) => {
        for (const key of ["twoColumnBrowseResultsRenderer", "sectionListRenderer", "itemSectionRenderer", "gridRenderer", "richGridRenderer", "gridContinuation", "sectionListContinuation"]) {
          const collection = object(node[key])
          if ([collection.tabs, collection.contents, collection.items].some(Array.isArray)) recognized = true
        }
        for (const key of ["playlistRenderer", "gridPlaylistRenderer", "lockupViewModel"]) {
          const data = object(node[key])
          if (key === "lockupViewModel" && data.contentType !== "LOCKUP_CONTENT_TYPE_PLAYLIST") continue
          const browse = at(data, "navigationEndpoint", "browseEndpoint", "browseId")
          const id = data.playlistId ?? data.contentId ?? (typeof browse === "string" && browse.startsWith("VL") ? browse.slice(2) : undefined)
          const title = text(data.title) || text(at(data, "metadata", "lockupMetadataViewModel", "title"))
          if (playlistId(id) && title) {
            recognized = true
            playlists.set(id, { id, title })
          }
        }
      })
      if (!recognized) fail("unavailable")
    }
    function selected(value: unknown): boolean | undefined {
      if (typeof value === "boolean") return value
      if (value === "ALL" || value === "SOME") return true
      if (value === "NONE") return false
      return undefined
    }
    function parseMembership(answer: unknown, membership: Map<string, boolean>): void {
      const entities = new Map<string, JsonObject>()
      const views: JsonObject[] = []
      function add(data: JsonObject): void {
        const id = data.playlistId
        const contains = selected(data.containsSelectedVideos ?? data.isSelected ?? data.selected ?? data.isToggled)
        if (!playlistId(id) || contains === undefined) return
        if (membership.has(id) && membership.get(id) !== contains) fail("unavailable")
        membership.set(id, contains)
      }
      walk(answer, (node) => {
        if (node.playlistAddToOptionRenderer) add(object(node.playlistAddToOptionRenderer))
        if (node.toggleableListItemViewModel) views.push(object(node.toggleableListItemViewModel))
        if (node.saveToPlaylistListEntity) {
          const entity = object(node.saveToPlaylistListEntity)
          add(entity)
          if (typeof entity.key === "string") entities.set(entity.key, entity)
        }
        const entity = object(at(node, "payload", "saveToPlaylistListEntity"))
        if (typeof node.entityKey === "string" && Object.keys(entity).length) entities.set(node.entityKey, entity)
      })
      for (const view of views) {
        const entity = typeof view.toggleStateKey === "string" ? entities.get(view.toggleStateKey) : undefined
        const endpoint = at(view, "defaultServiceEndpoint", "playlistEditEndpoint")
        add({ ...object(endpoint), ...view, ...entity })
      }
    }
    function playerChannel(answer: unknown, videoId: string): SessionChannel | null {
      const details = object(at(answer, "videoDetails"))
      if (details.videoId !== videoId || !channelId(details.channelId)) return null
      return { channelId: details.channelId, title: text(details.author) }
    }
    function ownerChannel(answer: unknown): SessionChannel | null {
      let result: SessionChannel | null = null
      walk(answer, (node) => {
        const owner = object(node.videoOwnerRenderer)
        const id = at(owner, "navigationEndpoint", "browseEndpoint", "browseId")
        if (!channelId(id)) return
        const handle = handleFromUrl(at(owner, "navigationEndpoint", "commandMetadata", "webCommandMetadata", "url"))
        result = { channelId: id, title: text(owner.title), ...(handle ? { handle } : {}) }
      })
      return result
    }
    async function resolveChannel(query: Extract<PageJob, { kind: "resolveChannel" }>["query"]): Promise<SessionChannel | null> {
      const input = query.by === "id" ? `/channel/${encodeURIComponent(query.id)}`
        : query.by === "username" ? `/user/${encodeURIComponent(query.username)}`
        : `/@${encodeURIComponent(query.handle.replace(/^@/, ""))}`
      let url = new URL(input, location.origin).href
      let id: string | null = null
      for (let hop = 0; hop <= 3; hop++) {
        const answer = await request("navigation/resolve_url", { url }, false)
        const endpoint = object(at(answer, "endpoint"))
        const browseId = at(endpoint, "browseEndpoint", "browseId")
        const type = at(endpoint, "commandMetadata", "webCommandMetadata", "webPageType")
        if (channelId(browseId) && type === "WEB_PAGE_TYPE_CHANNEL") {
          id = browseId
          break
        }
        const redirect = at(endpoint, "urlEndpoint", "url")
        if (typeof redirect !== "string") return null
        const next = new URL(redirect, location.origin)
        if (next.origin !== location.origin || next.username || next.password) return null
        url = next.href
      }
      if (!id) return null
      const answer = await request("browse", { browseId: id }, false)
      const metadata = object(at(answer, "metadata", "channelMetadataRenderer"))
      if (metadata.externalId !== id || !text(metadata.title)) return null
      const handle = handleFromUrl(metadata.vanityChannelUrl) ||
        (Array.isArray(metadata.ownerUrls) ? metadata.ownerUrls.map(handleFromUrl).find(Boolean) : undefined)
      return { channelId: id, title: text(metadata.title), ...(handle ? { handle } : {}) }
    }
    async function execute(): Promise<PageReply> {
      active()
      if (job.kind === "account") {
        if (state.tripped) fail("accountChanged")
        if (state.identity.kind === "signedOut") return { kind: "account", signedIn: false }
        return { kind: "account", signedIn: true, accountKey: await requireAccount() }
      }
      if (job.kind === "playlists") {
        const key = await requireAccount(job.accountKey)
        const playlists = new Map<string, SessionPlaylist>()
        await pages("browse", { browseId: "FEplaylist_aggregation" }, (answer) => parsePlaylists(answer, playlists))
        if (!playlists.has("WL")) playlists.set("WL", { id: "WL", title: "Watch Later" })
        return { kind: "playlists", accountKey: key, playlists: [...playlists.values()] }
      }
      if (job.kind === "add") {
        const key = await requireAccount(job.accountKey)
        if (!playlistId(job.playlistId) || !/^[\w-]{11}$/.test(job.videoId)) fail("failed")
        const membership = new Map<string, boolean>()
        await pages("playlist/get_add_to_playlist", { videoIds: [job.videoId], excludeWatchLater: false },
          (answer) => parseMembership(answer, membership), true)
        await requireAccount(job.accountKey)
        const contains = membership.get(job.playlistId)
        if (contains === undefined) fail("unavailable")
        if (contains) return { kind: "add", accountKey: key, alreadyIn: true }
        const answer = await edit(job.playlistId, job.videoId)
        verifyAnswer(answer)
        let failed = false
        walk(answer, (node) => { if (node.status === "STATUS_FAILED" || node.error !== undefined) failed = true })
        if (failed) fail("failed")
        if (at(answer, "status") !== "STATUS_SUCCEEDED") fail("unconfirmed")
        return { kind: "add", accountKey: key, alreadyIn: false }
      }
      if (job.kind === "resolveChannel") return { kind: "channel", channel: await resolveChannel(job.query) }
      if (job.kind === "videoChannel") {
        if (!/^[\w-]{11}$/.test(job.videoId)) fail("failed")
        const shorts = location.pathname.startsWith("/shorts/")
        const answer = await request(shorts ? "reel/reel_item_watch" : "next",
          shorts ? { playerRequest: { videoId: job.videoId } } : { videoId: job.videoId }, false)
        return { kind: "channel", channel: playerChannel(at(answer, "playerResponse"), job.videoId) || ownerChannel(answer) }
      }
      const exhaustive: never = job
      return exhaustive
    }
    async function start(): Promise<PageReply> {
      if (job.kind === "account") return execute()
      if (job.kind === "videoChannel") {
        const player = document.getElementById("movie_player")
        const read = player && "getPlayerResponse" in player ? player.getPlayerResponse : undefined
        let answer: unknown = page.ytInitialPlayerResponse
        if (typeof read === "function") {
          try { answer = read.call(player) } catch {}
        }
        verifyAnswer(answer)
        const channel = playerChannel(answer, job.videoId)
        if (channel) return { kind: "channel", channel }
      }
      const work = state.lane.then(execute)
      state.lane = work.then(() => {}, () => {})
      return work
    }
    return await new Promise<PageReply>((resolve) => {
      const timer = setTimeout(() => {
        expired = true
        abort.abort()
        resolve(errorReply(new JobFailure(writeSent ? "unconfirmed" : "unavailable")))
      }, Math.max(0, deadline - Date.now()))
      void start().then((reply) => {
        clearTimeout(timer)
        try {
          active()
          resolve(reply)
        } catch (error) {
          resolve(errorReply(error))
        }
      }, (error: unknown) => {
        clearTimeout(timer)
        resolve(errorReply(error))
      })
    })
  } catch (error) {
    return errorReply(error)
  }
}
