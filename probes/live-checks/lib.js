// Shared helpers for the ytpt live-check probe (ticket 25). Plain script, no
// build step. Loaded into the MAIN world of YouTube pages and frames, and into
// node by dev/signed-out.mjs. Everything hangs off one global.
;(() => {
  if (globalThis.__ytptProbeLib) return
  const L = {}
  globalThis.__ytptProbeLib = L

  L.VERSION = "0.2.0"
  L.TEST_VIDEO = "jNQXAC9IVRw" // "Me at the zoo": short, old, embeddable
  L.PLAYLIST_TITLE = "ytpt probe – safe to delete"
  L.OWN_CLIENT_PLAYLIST_TITLE = "ytpt probe – safe to delete (own client)"
  L.SHORTS_SAVE_PARAMS = "R0FRJTNE" // the Shorts menu's addToPlaylistEndpoint params

  L.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  L.withTimeout = (promise, ms, label) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${ms} ms${label ? ` (${label})` : ""}`)), ms)
      )
    ])
  L.at = (obj, path) => path.reduce((v, k) => (v == null ? undefined : v[k]), obj)
  L.errText = (e) => {
    if (e?.message) return String(e.message).slice(0, 240)
    if (e && typeof e === "object") {
      const err = e.error ?? e
      const parts = [err.code, err.status, err.message].filter((x) => x != null)
      return (parts.length ? parts.join(" ") : `object {${Object.keys(e).slice(0, 8).join(",")}}`).slice(0, 240)
    }
    return String(e).slice(0, 240)
  }
  L.nonce = () => Math.random().toString(36).slice(2, 10)

  // ---------- cookies (names only ever leave this file) ----------

  L.cookieNames = (cookieString) =>
    (cookieString || "")
      .split(";")
      .map((s) => s.split("=")[0].trim())
      .filter(Boolean)

  L.cookieValue = (cookieString, name) => {
    for (const part of (cookieString || "").split(";")) {
      const i = part.indexOf("=")
      if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
    }
    return undefined
  }

  L.AUTH_COOKIES = ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID", "APISID"]

  L.authCookiePresence = (cookieString) =>
    Object.fromEntries(L.AUTH_COOKIES.map((n) => [n, L.cookieValue(cookieString, n) != null]))

  // ---------- hashing ----------

  L.sha1Hex = async (text) => {
    const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
  }
  L.sha256Hex = async (text) => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  // Every Authorization value this probe builds, so the report scrubber can
  // remove them even if one slips into an evidence object.
  L.generatedSecrets = new Set()

  /**
   * YouTube's own auth header (bundle g2U / yt-dlp _make_sid_authorization):
   * up to three hashes, each sha1("<USER_SESSION_ID> <ts> <cookie> <origin>"),
   * written "<scheme> <ts>_<hex>[_u]". `mode: "single"` builds only the
   * SAPISIDHASH part without the _u part, the form youtubei.js still sends.
   */
  L.authHeader = async ({ cookies, origin, userSessionId, mode = "full", ts }) => {
    ts = ts ?? Math.floor(Date.now() / 1000)
    const sapisid = L.cookieValue(cookies, "SAPISID") ?? L.cookieValue(cookies, "__Secure-3PAPISID")
    const p1 = L.cookieValue(cookies, "__Secure-1PAPISID")
    const p3 = L.cookieValue(cookies, "__Secure-3PAPISID")
    const u = mode === "full" ? userSessionId : undefined
    const one = async (scheme, sid) => {
      const parts = u ? [u, ts, sid, origin] : [ts, sid, origin]
      const hex = await L.sha1Hex(parts.join(" "))
      return `${scheme} ${ts}_${hex}${u ? "_u" : ""}`
    }
    const out = []
    if (sapisid) out.push(await one("SAPISIDHASH", sapisid))
    if (mode === "full") {
      if (p1) out.push(await one("SAPISID1PHASH", p1))
      if (p3) out.push(await one("SAPISID3PHASH", p3))
    }
    const value = out.join(" ") || null
    if (value) L.generatedSecrets.add(value)
    return value
  }

  /** "SAPISIDHASH(_u) SAPISID1PHASH(_u)" — the structure of a header, never its hashes. */
  L.authStructure = (value) => {
    if (!value) return null
    const parts = []
    const re = /([A-Z0-9]+HASH)\s+\d+_[0-9a-fA-F]+(_[a-z]+)?/g
    let m
    while ((m = re.exec(value))) parts.push(m[1] + (m[2] ? `(${m[2]})` : ""))
    return parts.length ? parts.join(" ") : `<unrecognised ${value.length} chars>`
  }

  // ---------- ytcfg ----------

  L.ytcfgGetter = (win) => (key) => {
    const cfg = win.ytcfg
    if (!cfg) return undefined
    try {
      if (typeof cfg.get === "function") {
        const v = cfg.get(key)
        if (v !== undefined) return v
      }
    } catch {}
    return cfg.data_?.[key]
  }

  /** The request settings a hand-built client needs, read from ytcfg. */
  L.clientConfig = (get, origin, cookies) => {
    const flags = get("EXPERIMENT_FLAGS") || {}
    const context = get("INNERTUBE_CONTEXT")
    return {
      origin,
      clientName: get("INNERTUBE_CLIENT_NAME"),
      clientNameId: get("INNERTUBE_CONTEXT_CLIENT_NAME"),
      clientVersion: get("INNERTUBE_CLIENT_VERSION") ?? get("INNERTUBE_CONTEXT_CLIENT_VERSION"),
      context: context ? JSON.parse(JSON.stringify(context)) : undefined,
      sessionIndex: get("SESSION_INDEX"),
      delegatedSessionId: get("DELEGATED_SESSION_ID"),
      userSessionId: get("USER_SESSION_ID"),
      visitorData: get("VISITOR_DATA"),
      loggedIn: get("LOGGED_IN"),
      pageIdAsHeader: flags.pageid_as_header_web === true || flags.pageid_as_header_web === "true",
      cookies
    }
  }

  // ---------- requests ----------

  /**
   * One InnerTube POST, built like YouTube's web client builds it.
   * opts.auth: "full" (three hashes, _u) | "single" | "none" (no Authorization)
   * opts.hashOrigin: origin hashed into Authorization (default cfg.origin)
   * opts.xOrigin: X-Origin value; null omits it (default cfg.origin)
   * opts.fetchImpl: fetch to use (the isolated world passes its own)
   */
  L.innertube = async (cfg, path, body, opts = {}) => {
    const req = await L.buildRequest(cfg, path, body, opts)
    const started = Date.now()
    const doFetch = opts.fetchImpl || fetch
    let res
    try {
      res = await L.withTimeout(
        doFetch(req.url, {
          method: "POST",
          headers: req.headers,
          body: req.body,
          credentials: opts.credentials || "same-origin"
        }),
        opts.timeoutMs || 15000,
        path
      )
    } catch (e) {
      return { ok: false, status: 0, networkError: L.errText(e), json: null, ms: Date.now() - started, sent: req.sent }
    }
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {}
    return { ok: res.ok, status: res.status, json, ms: Date.now() - started, sent: req.sent }
  }

  /** The URL, headers and body of one request, for senders other than this world's fetch. */
  L.buildRequest = async (cfg, path, body, opts = {}) => {
    const headers = { "Content-Type": "application/json" }
    if (cfg.clientNameId != null) headers["X-Youtube-Client-Name"] = String(cfg.clientNameId)
    if (cfg.clientVersion) headers["X-Youtube-Client-Version"] = cfg.clientVersion
    if (cfg.visitorData) headers["X-Goog-Visitor-Id"] = cfg.visitorData
    if (cfg.loggedIn != null) headers["X-Youtube-Bootstrap-Logged-In"] = String(Boolean(cfg.loggedIn))
    const context = cfg.context
      ? JSON.parse(JSON.stringify(cfg.context))
      : { client: { clientName: cfg.clientName, clientVersion: cfg.clientVersion, hl: "en" } }
    const auth = opts.auth ?? "full"
    if (auth !== "none") {
      const value = await L.authHeader({
        cookies: typeof cfg.cookies === "function" ? cfg.cookies() : cfg.cookies,
        origin: opts.hashOrigin ?? cfg.origin,
        userSessionId: cfg.userSessionId,
        mode: auth
      })
      if (value) headers.Authorization = value
    }
    if (cfg.sessionIndex != null) headers["X-Goog-AuthUser"] = String(cfg.sessionIndex)
    const xOrigin = opts.xOrigin === undefined ? cfg.origin : opts.xOrigin
    if (xOrigin) headers["X-Origin"] = xOrigin
    if (cfg.delegatedSessionId) {
      if (cfg.pageIdAsHeader) headers["X-Goog-PageId"] = cfg.delegatedSessionId
      else context.user = { ...(context.user || {}), onBehalfOfUser: cfg.delegatedSessionId }
    }
    return {
      url: `${cfg.origin}/youtubei/v1/${path}?prettyPrint=false`,
      headers,
      body: JSON.stringify({ context, ...body }),
      sent: L.sentSummary(headers)
    }
  }

  /** Parses a raw {status, text} the isolated world sends back. */
  L.fromRaw = (raw, sent) => {
    let json = null
    try {
      json = JSON.parse(raw?.text ?? "")
    } catch {}
    return { ok: raw?.status >= 200 && raw?.status < 300, status: raw?.status ?? 0, json, ms: raw?.ms, sent, networkError: raw?.error }
  }

  /** What the probe itself put on a request: names, plus values that aren't secret. */
  L.sentSummary = (headers) => ({
    headerNames: Object.keys(headers),
    authorization: L.authStructure(headers.Authorization),
    xOrigin: headers["X-Origin"] ?? null,
    xGoogAuthUser: headers["X-Goog-AuthUser"] ?? null,
    pageIdHeader: "X-Goog-PageId" in headers
  })

  // ---------- reading responses ----------

  L.trackingParam = (json, service, key) => {
    const list = json?.responseContext?.serviceTrackingParams || []
    for (const s of list) {
      if (s.service !== service) continue
      for (const p of s.params || []) if (p.key === key) return p.value
    }
    return undefined
  }

  /**
   * Status of one response, with identity reduced to booleans.
   * pageDatasyncId is compared, never copied.
   */
  L.summarize = (r, pageDatasyncId) => {
    const json = r?.json
    const main = json?.responseContext?.mainAppWebResponseContext
    const respDsid = main?.datasyncId
    const err = json?.error
    const out = {
      status: r?.status,
      ms: r?.ms,
      bodyStatus: typeof json?.status === "string" ? json.status : undefined,
      error: err ? { code: err.code, status: err.status, message: String(err.message || "").slice(0, 120) } : undefined,
      loggedOut: main?.loggedOut,
      gfeedbackLoggedIn: L.trackingParam(json, "GFEEDBACK", "logged_in"),
      responseHasDatasyncId: respDsid != null,
      responseDatasyncIdMatchesPage:
        respDsid != null && pageDatasyncId != null ? respDsid === pageDatasyncId : undefined,
      networkError: r?.networkError
    }
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k]
    return out
  }

  /** True when a response shows a signed-in session. */
  L.signedIn = (summary) =>
    summary?.status === 200 && (summary.loggedOut === false || summary.gfeedbackLoggedIn === "1")

  // ---------- shapes: structure without content ----------

  // Keys whose values are never useful and sometimes identifying.
  L.DROP_KEYS = new Set([
    "responseContext",
    "trackingParams",
    "clickTrackingParams",
    "serviceTrackingParams",
    "visitorData",
    "datasyncId",
    "loggingContext",
    "loggingDirectives",
    "trackingParam",
    "maxAgeStoreSeconds",
    "remoteHost"
  ])
  const ID_PREFIXES = ["OLAK5uy_", "TLPQ", "MPRE", "RDAM", "PL", "UC", "VL", "WL", "LL", "RD", "FE", "UU"]

  /** Strings become "<str N>", except enum-like values (PRIVATE, STATUS_SUCCEEDED, ALL) and API paths. */
  L.redactString = (s) => {
    if (/^[A-Z][A-Z0-9_]{1,63}$/.test(s)) return s
    if (/^\/youtubei\/v1\/[a-z_/]+$/.test(s)) return s
    if (/^(true|false)$/.test(s)) return s
    const prefix = /^[A-Za-z0-9_-]{10,64}$/.test(s) ? ID_PREFIXES.find((p) => s.startsWith(p)) : undefined
    return prefix ? `<id ${prefix}… ${s.length}>` : `<str ${s.length}>`
  }

  L.shape = (v, opts = {}, depth = 0) => {
    const maxDepth = opts.maxDepth ?? 7
    const maxKeys = opts.maxKeys ?? 30
    const maxItems = opts.maxItems ?? 2
    if (v === null || v === undefined) return v ?? null
    if (typeof v === "string") return L.redactString(v)
    if (typeof v === "number" || typeof v === "boolean") return v
    if (Array.isArray(v)) {
      if (depth >= maxDepth) return `<array ${v.length}>`
      const out = v.slice(0, maxItems).map((x) => L.shape(x, opts, depth + 1))
      if (v.length > maxItems) out.push(`<+${v.length - maxItems} more>`)
      return out
    }
    if (typeof v === "object") {
      const keys = Object.keys(v)
      if (depth >= maxDepth) return `<object ${keys.slice(0, 6).join(",")}${keys.length > 6 ? ",…" : ""}>`
      const out = {}
      for (const k of keys.slice(0, maxKeys)) out[k] = L.DROP_KEYS.has(k) ? "<dropped>" : L.shape(v[k], opts, depth + 1)
      if (keys.length > maxKeys) out["<more keys>"] = keys.length - maxKeys
      return out
    }
    return `<${typeof v}>`
  }

  /**
   * A whole response for recorded tests (ticket 18's fixtures): full
   * structure, every key kept, but every string replaced unless it is an enum,
   * an API path or one of `keepIds` (public video IDs the probe chose).
   * Titles, names, handles, avatar URLs and playlist/channel IDs all go.
   */
  const FIXTURE_DROP = new Set(["trackingParams", "clickTrackingParams", "serviceTrackingParams", "visitorData", "loggingContext", "loggingDirectives", "trackingParam", "remoteHost"])
  L.fixture = (v, keepIds = new Set(), depth = 0) => {
    if (v == null) return v ?? null
    if (typeof v === "string") {
      if (keepIds.has(v) || /^[A-Z][A-Z0-9_]{1,63}$/.test(v) || /^\/youtubei\/v1\/[a-z_/]+$/.test(v) || /^(true|false)$/.test(v)) return v
      if (/^(https?:)?\/\//.test(v)) return "<url>"
      const r = L.redactString(v)
      return r.startsWith("<id") ? r : `<text ${v.length}>`
    }
    if (typeof v !== "object") return v
    if (depth > 80) return "<too deep>"
    if (Array.isArray(v)) return v.map((x) => L.fixture(x, keepIds, depth + 1))
    const out = {}
    for (const k of Object.keys(v)) out[k] = FIXTURE_DROP.has(k) ? "<dropped>" : L.fixture(v[k], keepIds, depth + 1)
    return out
  }

  /** Every object under `root` that has key `name`, with its path. */
  L.findKey = (root, name, limit = 500) => {
    const found = []
    const walk = (v, path) => {
      if (found.length >= limit || v == null || typeof v !== "object") return
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`))
      for (const k of Object.keys(v)) {
        if (k === name) found.push({ path: `${path}.${k}`, value: v[k] })
        walk(v[k], `${path}.${k}`)
      }
    }
    walk(root, "$")
    return found
  }

  /** Paths with array indices collapsed, for reporting where something sits. */
  L.genericPath = (path) => path.replace(/\[\d+\]/g, "[]")
  L.uniq = (xs) => [...new Set(xs)]

  /** Paths of string values matching a test, e.g. channel IDs. Values aren't returned. */
  L.pathsOfStrings = (root, test, limit = 40) => {
    const paths = []
    const walk = (v, path) => {
      if (paths.length >= limit) return
      if (typeof v === "string") {
        if (test(v)) paths.push(L.genericPath(path))
        return
      }
      if (v == null || typeof v !== "object") return
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`))
      for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`)
    }
    walk(root, "$")
    return L.uniq(paths)
  }

  /** Keys (and enum values) anywhere in a response that mention a word. */
  L.mentions = (root, re, limit = 30) => {
    const hits = []
    const walk = (v, path) => {
      if (hits.length >= limit || v == null) return
      if (typeof v === "string") {
        if (re.test(v) && /^[A-Z][A-Z0-9_]+$/.test(v)) hits.push(`${L.genericPath(path)}=${v}`)
        return
      }
      if (typeof v !== "object") return
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`))
      for (const k of Object.keys(v)) {
        if (re.test(k)) hits.push(L.genericPath(`${path}.${k}`))
        walk(v[k], `${path}.${k}`)
      }
    }
    walk(root, "$")
    return L.uniq(hits)
  }

  // ---------- get_add_to_playlist ----------

  /**
   * Reads either response shape: the old addToPlaylistRenderer with
   * playlistAddToOptionRenderer entries, or the view-model one
   * (toggleableListItemViewModel + saveToPlaylistListEntity).
   * Returns structure and counts; playlist titles never leave.
   */
  L.analyzeAddToPlaylist = (json, opts = {}) => {
    const options = L.findKey(json, "playlistAddToOptionRenderer").map((f) => f.value)
    const toggleables = L.findKey(json, "toggleableListItemViewModel").map((f) => f.value)
    const entities = L.findKey(json, "saveToPlaylistListEntity").map((f) => f.value)
    const continuations = L.findKey(json, "continuations").length + L.findKey(json, "continuationItemRenderer").length
    const ids = options.map((o) => o.playlistId).filter(Boolean)
    const out = {
      shape:
        options.length && toggleables.length
          ? "both"
          : options.length
            ? "addToPlaylistRenderer"
            : toggleables.length
              ? "toggleableListItemViewModel"
              : "neither",
      topLevelKeys: Object.keys(json || {}),
      oldShape: options.length
        ? {
            count: options.length,
            optionKeys: L.uniq(options.flatMap((o) => Object.keys(o))).sort(),
            privacyValues: L.uniq(options.map((o) => o.privacy).filter(Boolean)),
            containsSelectedVideosValues: L.uniq(options.map((o) => o.containsSelectedVideos ?? "<absent>")),
            privacyIconTypes: L.uniq(options.map((o) => o.privacyIcon?.iconType).filter(Boolean)),
            watchLater: (() => {
              const wl = options.find((o) => o.playlistId === "WL")
              return wl
                ? { present: true, position: options.indexOf(wl), keys: Object.keys(wl).sort(), privacy: wl.privacy, containsSelectedVideos: wl.containsSelectedVideos }
                : { present: false }
            })(),
            firstOptionShape: L.shape(options[0], { maxDepth: 4 })
          }
        : undefined,
      newShape:
        toggleables.length || entities.length
          ? {
              toggleableCount: toggleables.length,
              entityCount: entities.length,
              entitySelectorTypes: L.uniq(toggleables.map((t) => t.entitySelectorType).filter(Boolean)),
              firstToggleableShape: L.shape(toggleables[0], { maxDepth: 5 }),
              firstEntityShape: L.shape(entities[0], { maxDepth: 4 })
            }
          : undefined,
      pagedHints: continuations,
      collaborativeMentions: L.mentions(json, /collab/i)
    }
    if (opts.probePlaylistId)
      out.probePlaylist = (() => {
        const o = options.find((x) => x.playlistId === opts.probePlaylistId)
        return o ? { listed: true, privacy: o.privacy, containsSelectedVideos: o.containsSelectedVideos } : { listed: JSON.stringify(json || {}).includes(opts.probePlaylistId) ? "only in new shape" : false }
      })()
    if (opts.collaborativeId) out.userCollaborativePlaylistListed = JSON.stringify(json || {}).includes(opts.collaborativeId)
    out._ids = ids // internal: stripped before reporting
    return out
  }

  /** IDs of playlists a get_add_to_playlist response lists, in either shape. */
  L.addToPlaylistIds = (json) => {
    const ids = new Set(L.findKey(json, "playlistAddToOptionRenderer").map((f) => f.value.playlistId).filter(Boolean))
    for (const e of L.findKey(json, "saveToPlaylistListEntity")) for (const id of e.value?.playlistIds || []) ids.add(id)
    return ids
  }

  const textOf = (t) =>
    typeof t === "string" ? t : t?.simpleText ?? t?.content ?? t?.runs?.map((r) => r.text).join("")

  /**
   * Playlists listed in a get_add_to_playlist response, in either shape, as
   * {playlistId, title, privacy, contains}. Internal only: titles never reach
   * the report.
   */
  L.listedPlaylists = (json) => {
    const out = []
    for (const { value: o } of L.findKey(json, "playlistAddToOptionRenderer"))
      if (o?.playlistId)
        out.push({ playlistId: o.playlistId, title: textOf(o.title), privacy: o.privacy, contains: o.containsSelectedVideos })
    const member = new Set()
    for (const { value: e } of L.findKey(json, "saveToPlaylistListEntity")) for (const id of e?.playlistIds || []) member.add(id)
    for (const { value: v } of L.findKey(json, "toggleableListItemViewModel")) {
      const id = JSON.stringify(v).match(/"playlistId":"([^"]+)"/)?.[1]
      if (!id || out.some((x) => x.playlistId === id)) continue
      const title = textOf(v?.listItemViewModel?.title) ?? textOf(v?.title)
      out.push({ playlistId: id, title, privacy: undefined, contains: member.has(id) ? "ALL" : "NONE" })
    }
    return out
  }

  /** "ALL" / "NONE" for one playlist in a get_add_to_playlist response, or "<not listed>". */
  L.membershipOf = (json, playlistId) =>
    L.listedPlaylists(json).find((p) => p.playlistId === playlistId)?.contains ?? "<not listed>"

  /**
   * The commands YouTube's own Save dialog would send when a row is ticked or
   * unticked, read from the response without clicking anything. Field names
   * and action enums only.
   */
  L.saveDialogCommands = (json) => {
    const actionsOf = (pe) => (pe?.actions || []).map((a) => ({ action: a.action, fields: Object.keys(a).sort() }))
    const describe = (ep) => {
      if (!ep) return null
      const pe = ep.playlistEditEndpoint
      if (!pe) return { endpointKeys: Object.keys(ep).filter((k) => k !== "clickTrackingParams" && k !== "commandMetadata") }
      return { endpoint: "playlistEditEndpoint", fields: Object.keys(pe).sort(), actions: actionsOf(pe), apiUrl: ep.commandMetadata?.webCommandMetadata?.apiUrl }
    }
    const distinct = (xs) => L.uniq(xs.map((x) => JSON.stringify(x))).map((x) => JSON.parse(x))
    const options = L.findKey(json, "playlistAddToOptionRenderer").map((f) => f.value)
    const toggles = L.findKey(json, "toggleableListItemViewModel").map((f) => f.value)
    return {
      oldShape: options.length
        ? {
            tick: distinct(options.map((o) => describe(o.addToPlaylistServiceEndpoint))),
            untick: distinct(options.map((o) => describe(o.removeFromPlaylistServiceEndpoint)))
          }
        : undefined,
      newShape: toggles.length
        ? distinct(
            L.findKey(toggles, "playlistEditEndpoint").map((f) => ({ path: L.genericPath(f.path), actions: actionsOf(f.value) }))
          )
        : undefined
    }
  }

  /** Length of a listed playlist's title (a number, never the text). */
  L.titleLength = (json, playlistId) => L.listedPlaylists(json).find((p) => p.playlistId === playlistId)?.title?.length

  /** Probe playlists left over from an earlier run (matched by title prefix). */
  L.probeLeftovers = (json) =>
    L.listedPlaylists(json).filter((p) => typeof p.title === "string" && p.title.startsWith("ytpt probe"))

  /** Entries in a playlist page response: setVideoIds for one video. */
  L.playlistEntries = (json, videoId) => {
    const setIds = new Set()
    const walk = (v) => {
      if (v == null || typeof v !== "object") return
      if (Array.isArray(v)) return v.forEach(walk)
      if (typeof v.setVideoId === "string" && (!videoId || v.videoId === videoId)) setIds.add(v.setVideoId)
      for (const k of Object.keys(v)) walk(v[k])
    }
    walk(json)
    return setIds.size
  }

  // ---------- report hygiene ----------

  /**
   * Last line of defence before the report leaves the page: removes every
   * known secret string and anything shaped like an auth hash.
   */
  L.scrub = (text, secrets) => {
    let out = text
    const list = [...(secrets || []), ...L.generatedSecrets]
      .filter((s) => typeof s === "string" && s.length >= 6)
      .sort((a, b) => b.length - a.length)
    for (const s of list) out = out.split(s).join("<redacted>")
    out = out.replace(/(SAPISID\w*HASH)\s+\d+_[0-9a-fA-F]{20,}(_u)?/g, "$1 <redacted>")
    out = out.replace(/\b[0-9a-f]{40}\b/g, "<hex40>")
    return out
  }

  /** Strip internal-only fields (names starting with _) from an evidence tree. */
  L.publicView = (v) => {
    if (v == null || typeof v !== "object") return v
    if (Array.isArray(v)) return v.map(L.publicView)
    const out = {}
    for (const k of Object.keys(v)) if (!k.startsWith("_")) out[k] = L.publicView(v[k])
    return out
  }
})()
