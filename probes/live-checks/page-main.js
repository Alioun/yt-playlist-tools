// MAIN-world page script of the ytpt live-check probe (ticket 25): the
// floating panel and every check. Runs in the top frame of www.youtube.com and
// music.youtube.com. Each report entry carries the check ID it answers:
//   L1-L9, M1-M5, P1-P2  ticket 10's table (section 6)
//   T11.n, T12.n, T26.n  live checks added by tickets 11, 12 and 26
//   T25.*                ticket 25's own items (headers, the YouTube Music snippet)
//   ENV, SETUP, CLEANUP  context and the throwaway playlist's lifecycle
;(() => {
  if (window.top !== window || globalThis.__ytptProbePage) return
  globalThis.__ytptProbePage = true
  const L = globalThis.__ytptProbeLib
  if (!L) return

  const HOST = location.hostname === "music.youtube.com" ? "music" : "www"
  const ORIGIN = location.origin
  const get = L.ytcfgGetter(window)
  const SECOND_VIDEO = "aqz-KE-bpKQ" // Big Buck Bunny, Blender Foundation
  const KIDS_VIDEO = "XqZsoesa55w" // Baby Shark Dance, a made-for-kids video
  const LARGE_PLAYLIST = "PLw-VjHDlEOgvIaXEz6xErW8uo2gqg5xmx" // public, 500 songs on 2026-10-19
  const loadedAt = Date.now()
  const BOTH = ["www", "music"]
  const WWW = ["www"]
  const MUSIC = ["music"]

  // ======================= early collectors (document_start) =======================

  const early = {
    navEvents: [],
    shorts: { videoElements: 0, timeupdates: 0, wrapCandidates: [], ended: 0, seeking: 0 }
  }

  document.addEventListener(
    "yt-navigate-finish",
    (e) => {
      try {
        const d = e.detail || {}
        const urlId = location.pathname.startsWith("/shorts/")
          ? location.pathname.split("/")[2]
          : new URLSearchParams(location.search).get("v")
        const reelId = d.endpoint?.reelWatchEndpoint?.videoId
        early.navEvents.push({
          at: Date.now(),
          pageType: d.pageType ?? "<none>",
          urlKind: location.pathname.startsWith("/shorts/") ? "shorts" : location.pathname,
          hasReelEndpoint: Boolean(reelId),
          reelIdMatchesUrl: reelId ? reelId === urlId : undefined,
          hasPlayerResponse: Boolean((d.response ?? d.data?.response)?.playerResponse)
        })
        if (early.navEvents.length > 80) early.navEvents.shift()
      } catch {}
    },
    true
  )

  const seenVideos = new WeakSet()
  setInterval(() => {
    const video = document.querySelector("#shorts-player video")
    if (!video || seenVideos.has(video)) return
    seenVideos.add(video)
    const s = early.shorts
    s.videoElements++
    let prev = null
    let seekingSince = 0
    let endedSince = 0
    video.addEventListener("loadstart", () => (prev = null))
    video.addEventListener("seeking", () => (s.seeking++, seekingSince++))
    video.addEventListener("ended", () => (s.ended++, endedSince++))
    video.addEventListener("timeupdate", () => {
      s.timeupdates++
      const t = video.currentTime
      const d = video.duration
      if (prev != null && t + 0.5 < prev && s.wrapCandidates.length < 20)
        s.wrapCandidates.push({
          fromSec: +prev.toFixed(2),
          toSec: +t.toFixed(2),
          durationSec: Number.isFinite(d) ? +d.toFixed(2) : null,
          fromNearEnd: Number.isFinite(d) ? prev > d - 1.5 : null,
          seekingEventsBetween: seekingSince,
          endedEventsBetween: endedSince,
          loopAttribute: video.loop
        })
      prev = t
      seekingSince = 0
      endedSince = 0
    })
  }, 500)

  // Ticket 08: an opt-in key logger, and a capture-phase block test on Shorts.
  // Nothing is logged unless the panel's "Log my key presses" box is ticked,
  // and never while focus is in a text field or in the panel.
  const keys = { logging: false, blocking: false, log: [], received: 0, shortsTests: [] }
  const SHORTS_KEYS = ["ArrowDown", "ArrowUp", "m", "k"]
  window.addEventListener(
    "keydown",
    (e) => {
      try {
        if (ui.host && e.composedPath().includes(ui.host)) return
        const t = e.target
        const editable = Boolean(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || "")))
        if (keys.logging && !editable) {
          keys.received++
          if (keys.log.length < 40)
            keys.log.push({ key: e.key, code: e.code, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altGraph: e.getModifierState?.("AltGraph"), location: e.location, repeat: e.repeat })
          if (ui.keyShow) ui.keyShow.textContent = `last key: key=${JSON.stringify(e.key)} code=${e.code} alt=${e.altKey} ctrl=${e.ctrlKey} meta=${e.metaKey} AltGraph=${e.getModifierState?.("AltGraph")}`
        }
        const onShorts = location.pathname.startsWith("/shorts/")
        const plain = !e.altKey && !e.ctrlKey && !e.metaKey
        if (onShorts && plain && !editable && SHORTS_KEYS.includes(e.key) && (keys.blocking || keys.logging) && keys.shortsTests.length < 30) {
          const v = document.querySelector("#shorts-player video")
          const before = { muted: v?.muted, paused: v?.paused, url: location.pathname }
          const blocked = keys.blocking
          if (blocked) {
            e.stopImmediatePropagation()
            e.preventDefault()
          }
          setTimeout(() => {
            const v2 = document.querySelector("#shorts-player video")
            keys.shortsTests.push({ key: e.key, blocked, youtubeReacted: v2?.muted !== before.muted || v2?.paused !== before.paused || location.pathname !== before.url, mutedChanged: v2?.muted !== before.muted, pausedChanged: v2?.paused !== before.paused, urlChanged: location.pathname !== before.url })
          }, 700)
        }
      } catch {}
    },
    true
  )

  // Fingerprint of the session cookie at load, kept in memory only (T11.5).
  let sessionAtLoad = null
  const sessionFingerprint = async () =>
    L.sha256Hex(`${L.cookieValue(document.cookie, "SAPISID") ?? ""}|${L.cookieValue(document.cookie, "__Secure-3PAPISID") ?? ""}`)
  sessionFingerprint().then((h) => (sessionAtLoad = h))

  // ======================= bridge to the isolated world =======================

  const pending = new Map()
  document.addEventListener("ytpt-probe:res", (e) => {
    let m
    try {
      m = JSON.parse(e.detail)
    } catch {
      return
    }
    const p = pending.get(m.id)
    if (!p) return
    pending.delete(m.id)
    m.ok ? p.resolve(m.result) : p.reject(new Error(m.error))
  })
  const call = (to, msg, timeoutMs = 20000) => {
    const id = L.nonce() + L.nonce()
    const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    document.dispatchEvent(new CustomEvent("ytpt-probe:req", { detail: JSON.stringify({ id, to, msg }) }))
    return L.withTimeout(promise, timeoutMs, `${to}:${msg.type}`).finally(() => pending.delete(id))
  }
  const bg = (type, args = {}, t) => call("bg", { type, ...args }, t)
  const iso = (type, args = {}, t) => call("iso", { type, ...args }, t)
  const safe = async (fn, fallback) => {
    try {
      return await fn()
    } catch (e) {
      return fallback !== undefined ? fallback : { error: L.errText(e) }
    }
  }

  // ======================= small helpers =======================

  const E = (id, part, status, summary, evidence) => ({ id, part: part || undefined, status, summary, evidence })

  // Ticket 18: optional raw-response capture for recorded tests.
  const fixtures = []
  const FIXTURE_IDS = new Set([L.TEST_VIDEO, SECOND_VIDEO, KIDS_VIDEO])
  let currentStep = null
  const captureFx = (route, path, body, status, json) => {
    if (!ui.fx?.checked || fixtures.length >= 300 || json == null) return
    fixtures.push({
      step: currentStep,
      host: HOST,
      route,
      path,
      request: { bodyKeys: Object.keys(body || {}).sort(), actions: (body?.actions || []).map((a) => a.action), params: body?.params ? "<params>" : undefined },
      status,
      response: L.fixture(json, FIXTURE_IDS)
    })
  }
  const pathKind = () => {
    const p = location.pathname
    if (p.startsWith("/shorts/")) return "shorts"
    if (p === "/watch") return "watch"
    if (p === "/playlist") return "playlist"
    if (p === "/") return "home"
    if (p.startsWith("/browse/")) return "browse"
    if (p.startsWith("/search")) return "search"
    if (p.startsWith("/channel") || p.startsWith("/@")) return "channel"
    if (p.startsWith("/library") || p.startsWith("/feed")) return "library/feed"
    if (p.startsWith("/explore")) return "explore"
    return "other"
  }
  const displayMode = () =>
    ["window-controls-overlay", "standalone", "minimal-ui", "fullscreen", "browser"].find(
      (m) => matchMedia(`(display-mode: ${m})`).matches
    ) || "unknown"
  const currentVideoId = () => {
    if (location.pathname.startsWith("/shorts/")) return location.pathname.split("/")[2] || null
    const v = new URLSearchParams(location.search).get("v")
    if (v) return v
    try {
      return document.querySelector("#movie_player")?.getVideoData?.()?.video_id || null
    } catch {
      return null
    }
  }
  const markerUrl = (place) => {
    const m = `${L.nonce()}-${place}`
    return {
      marker: m,
      url:
        HOST === "music"
          ? `https://music.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ?ytptprobe=${m}`
          : `https://www.youtube.com/@YouTube?ytptprobe=${m}`
    }
  }
  const ADD = (videoId) => ({ action: "ACTION_ADD_VIDEO", addedVideoId: videoId })
  const REMOVE = (setVideoId) => ({ action: "ACTION_REMOVE_VIDEO", setVideoId })
  const REMOVE_BY_VIDEO = (videoId) => ({ action: "ACTION_REMOVE_VIDEO_BY_VIDEO_ID", removedVideoId: videoId })
  const addedSetVideoId = (json) =>
    (json?.playlistEditResults || []).map((r) => r?.playlistEditVideoAddedResultData?.setVideoId).find(Boolean)
  const actionKinds = (json) =>
    (json?.actions || []).map((a) => Object.keys(a).filter((k) => k !== "clickTrackingParams")[0])
  const editView = (r, summary) => ({
    ...summary,
    resultKinds: (r?.json?.playlistEditResults || []).map((x) => Object.keys(x || {}).join("+")),
    setVideoIdReturned: Boolean(addedSetVideoId(r?.json)),
    actionKinds: actionKinds(r?.json),
    dedupeMentions: L.mentions(r?.json, /dedupe/i),
    bodyShape: L.shape(r?.json, { maxDepth: 6, maxItems: 1, maxKeys: 15 })
  })
  const randomPlaylistId = () => {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
    let s = "PL"
    for (let i = 0; i < 32; i++) s += abc[Math.floor(Math.random() * abc.length)]
    return s
  }
  const makeTitle = (n) => {
    let t = `${L.PLAYLIST_TITLE} `
    while (t.length < n) t += "x"
    return t.slice(0, n)
  }

  // ---------- visible UI side effects ----------

  const UI_SELECTORS = [
    "ytd-popup-container > *",
    "ytmusic-popup-container > *",
    "tp-yt-iron-dropdown",
    "tp-yt-paper-dialog",
    "tp-yt-paper-toast",
    "ytd-add-to-playlist-renderer",
    "ytmusic-add-to-playlist-renderer",
    "ytd-multi-page-menu-renderer",
    "ytmusic-multi-page-menu-renderer",
    "yt-notification-action-renderer",
    "ytmusic-notification-action-renderer",
    "ytmusic-notification-text-renderer",
    "yt-sheet-view-model",
    "yt-contextual-sheet-layout",
    "yt-dialog-view-model",
    "dialog[open]",
    "ytd-modal-with-title-and-button-renderer"
  ]
  const isVisible = (el) => {
    try {
      if (!el.getClientRects().length) return false
      if (typeof el.checkVisibility === "function") return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    } catch {
      return false
    }
  }
  const uiSnapshot = () => {
    const out = {}
    for (const sel of UI_SELECTORS) {
      let n = 0
      try {
        n = [...document.querySelectorAll(sel)].filter(isVisible).length
      } catch {}
      if (n) out[sel] = n
    }
    return out
  }
  const uiDiff = (before, after) => Object.keys(after).filter((k) => (after[k] || 0) > (before[k] || 0))

  // Toast log: every visible toast's text since the page loaded (UI copy only,
  // cut to 60 characters). The selectors are guesses, so the checklist also
  // asks the user to watch the screen.
  const TOAST_SEL = "yt-notification-action-renderer, ytmusic-notification-action-renderer, ytmusic-notification-text-renderer, tp-yt-paper-toast, [class*=snackbar], [class*=toast]"
  const toastLog = []
  const toastSeen = new WeakMap()
  let toastTimer = null
  const scanToasts = () => {
    toastTimer = null
    for (const el of document.querySelectorAll(TOAST_SEL)) {
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue
      const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60)
      if (!text || toastSeen.get(el) === text) continue
      toastSeen.set(el, text)
      if (toastLog.length < 80 && !toastLog.some((t) => t.text === text && Date.now() - t.at < 3000)) toastLog.push({ at: Date.now(), text, element: el.tagName.toLowerCase() })
    }
  }
  const startToastLog = () =>
    new MutationObserver(() => {
      if (!toastTimer) toastTimer = setTimeout(scanToasts, 120)
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "opened"] })
  const toastsBetween = (t0, t1 = Date.now()) => toastLog.filter((t) => t.at >= t0 && t.at <= t1).map((t) => t.text)

  /** Runs fn and reports any YouTube UI or toast that appeared, and whether the page navigated. */
  const watchUi = async (fn, settleMs = 1800) => {
    const before = uiSnapshot()
    const href = location.href
    const t0 = Date.now()
    let value
    let thrown
    try {
      value = await fn()
    } catch (e) {
      thrown = L.errText(e)
    }
    await L.sleep(settleMs)
    scanToasts()
    const toasts = toastsBetween(t0)
    const appeared = [...uiDiff(before, uiSnapshot()), ...toasts.map((t) => `toast “${t}”`)]
    return { value, thrown, appeared, toasts, navigated: location.href !== href }
  }
  const closeUi = async () => {
    for (const el of document.querySelectorAll("tp-yt-iron-dropdown, tp-yt-paper-dialog"))
      if (isVisible(el)) safe(() => el.close?.(), null)
    const target = document.activeElement || document.body
    for (const type of ["keydown", "keyup"])
      target.dispatchEvent(new KeyboardEvent(type, { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, composed: true }))
    await L.sleep(300)
  }

  // ---------- YouTube's own machinery ----------

  /** Fires YouTube's yt-service-request action from a short-lived invisible element under the app. */
  const serviceRequest = async (endpoint, timeoutMs = 12000) => {
    const app = document.querySelector(HOST === "music" ? "ytmusic-app" : "ytd-app")
    if (!app) return { out: { error: "no app element" } }
    const host = document.createElement("div")
    host.hidden = true
    app.appendChild(host)
    const events = []
    const names = ["yt-service-request-sent", "yt-service-request-completed", "yt-service-request-error"]
    const listeners = names.map((n) => [n, () => events.push(n)])
    for (const [n, f] of listeners) host.addEventListener(n, f)
    const detail = { actionName: "yt-service-request", optionalAction: false, args: [host, endpoint], returnValue: [] }
    const t0 = Date.now()
    const out = {}
    let response
    try {
      host.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true, detail }))
      const rv = detail.returnValue
      out.returnValueLength = rv.length
      out.ajaxPromise = Boolean(rv[0]?.ajaxPromise)
      if (rv[0]?.ajaxPromise) {
        try {
          const res = await L.withTimeout(new Promise((resolve, reject) => rv[0].ajaxPromise.then(resolve, reject)), timeoutMs, "ajaxPromise")
          out.resolved = true
          out.wrapperKeys = res && typeof res === "object" ? Object.keys(res).slice(0, 12) : typeof res
          response = res?.data ?? res
        } catch (e) {
          out.resolved = false
          out.rejection = L.errText(e)
        }
      }
    } catch (e) {
      out.thrown = L.errText(e)
    }
    await L.sleep(300)
    out.events = events
    out.ms = Date.now() - t0
    for (const [n, f] of listeners) host.removeEventListener(n, f)
    host.remove()
    const key = Object.keys(endpoint).find((k) => k !== "commandMetadata")
    captureFx("yt-service-request", key, endpoint[key], response ? 200 : undefined, response)
    return { out, response }
  }
  const cmdMeta = (apiUrl) => ({ commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl } } })

  /** YouTube's own requests seen by the background's webRequest observer since t0. */
  const seenRequests = (since, paths) => safe(() => bg("requests.recent", { since, paths, tab: "self" }, 8000), [])

  // ---------- YouTube Music internals ----------

  const ytm = {
    app: () => document.querySelector("ytmusic-app"),
    queue: () => ytm.app()?.queue,
    store: () => ytm.queue()?.store,
    state: () => {
      try {
        return ytm.store()?.getState?.()
      } catch {
        return undefined
      }
    },
    player: () => document.querySelector("#movie_player"),
    renderer: (item) =>
      item?.playlistPanelVideoRenderer ?? item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer,
    items: () => {
      try {
        return ytm.queue()?.getItems?.() ?? []
      } catch {
        return []
      }
    },
    ids: () => ytm.items().map((it) => ytm.renderer(it)?.navigationEndpoint?.watchEndpoint?.index),
    currentIndex: () => {
      try {
        return ytm.queue()?.getCurrentItemIndex?.()
      } catch {
        return undefined
      }
    },
    videoId: () => {
      try {
        return ytm.player()?.getVideoData?.()?.video_id || null
      } catch {
        return null
      }
    },
    nm: (path, body, ms = 15000) =>
      L.withTimeout(
        new Promise((resolve, reject) => {
          try {
            const p = ytm.app().networkManager.fetch(path, body)
            if (p && typeof p.then === "function") p.then(resolve, reject)
            else resolve(p)
          } catch (e) {
            reject(e)
          }
        }),
        ms,
        `networkManager.fetch ${path}`
      )
  }
  /** networkManager.fetch plus the HTTP status the background saw. */
  const nmCall = async (path, body) => {
    const t0 = Date.now()
    let json
    let error
    try {
      json = await ytm.nm(path, body)
    } catch (e) {
      error = L.errText(e)
    }
    const seen = await seenRequests(t0, [path.replace(/^\//, "")])
    captureFx("networkManager.fetch", path, body, seen.at(-1)?.statusCode, json)
    return { json, error, status: seen.at(-1)?.statusCode, seen }
  }

  // ======================= panel =======================

  const ui = {}
  const buildPanel = () => {
    if (ui.host) return
    const host = document.createElement("div")
    host.id = "ytpt-probe-panel-host"
    host.style.cssText = "position:fixed;top:64px;right:12px;z-index:2147483647;"
    const root = host.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = `
      .p{width:360px;max-height:80vh;display:flex;flex-direction:column;font:12px/1.35 system-ui,sans-serif;color:#111;background:#fff;border:2px solid #c00;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.3)}
      .h{display:flex;align-items:center;gap:6px;padding:6px 8px;background:#c00;color:#fff;font-weight:600}
      .h span{flex:1}
      .b{padding:6px 8px;display:flex;flex-direction:column;gap:5px;overflow:auto}
      button{font:inherit;padding:3px 8px;border:1px solid #888;border-radius:4px;background:#f4f4f4;cursor:pointer;color:#111}
      button.primary{background:#c00;color:#fff;border-color:#900}
      button:disabled{opacity:.5;cursor:default}
      .row{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
      input[type=text],textarea{font:inherit;width:100%;box-sizing:border-box;border:1px solid #aaa;border-radius:3px;padding:2px 4px}
      textarea{height:38px;resize:vertical}
      label{display:flex;gap:5px;align-items:flex-start}
      details summary{cursor:pointer;color:#444}
      .res{border-top:1px solid #ddd;padding-top:4px;display:flex;flex-direction:column;gap:2px}
      .e{display:flex;gap:4px}
      .s{flex:none;width:38px;font-weight:700;font-size:10px;text-align:center;border-radius:3px;color:#fff;height:15px;line-height:15px}
      .pass{background:#188038}.fail{background:#c5221f}.info{background:#1a73e8}.skip{background:#888}.error{background:#e37400}.run{background:#555}
      .t{flex:1;word-break:break-word}
      .muted{color:#666}
      .code{font-family:monospace;background:#eee;padding:1px 3px;border-radius:3px;word-break:break-all}
      .warn{color:#c5221f;font-weight:600}
    `
    const el = (tag, attrs = {}, ...kids) => {
      const n = document.createElement(tag)
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "text") n.textContent = v
        else if (k === "class") n.className = v
        else if (k.startsWith("on")) n.addEventListener(k.slice(2), v)
        else n.setAttribute(k, v)
      }
      for (const kid of kids) if (kid) n.append(kid)
      return n
    }
    ui.writes = el("input", { type: "checkbox" })
    ui.collab = el("input", { type: "text", placeholder: "playlist ID (only used on this page, never reported)" })
    ui.compare = el("input", { type: "text", placeholder: "ytpt1.… from your other browser" })
    ui.prompt = el("textarea", { placeholder: "P1: paste the permission lines Firefox / Chrome showed" })
    ui.notes = el("textarea", { placeholder: "Anything odd you noticed" })
    ui.keyLog = el("input", { type: "checkbox", onchange: () => (keys.logging = ui.keyLog.checked) })
    ui.keyBlock = el("input", { type: "checkbox", onchange: () => (keys.blocking = ui.keyBlock.checked) })
    ui.keyShow = el("div", { class: "muted", text: "" })
    ui.fx = el("input", { type: "checkbox" })
    ui.fxButton = el("button", { text: "Download fixtures", onclick: () => downloadFixtures() })
    ui.status = el("div", { class: "muted", text: `Ready on ${location.host}. Nothing runs until you press Run.` })
    ui.code = el("div", { class: "muted" })
    ui.results = el("div", { class: "res" })
    ui.copyArea = el("textarea", { style: "display:none;height:80px" })
    ui.run = el("button", { class: "primary", text: "Run probe", onclick: () => runAll() })
    ui.stale = el("button", { text: "Stale-tab check", title: "T11.5: run after switching account or signing out in ANOTHER tab, without reloading this one", onclick: () => runStale() })
    ui.scan = HOST === "music" ? el("button", { text: "Scan rows", title: "T26.5: scan this page's rows for YouTube Music's own like buttons", onclick: () => runScan() }) : null
    ui.copy = el("button", { text: "Copy report", onclick: () => copyReport() })
    ui.clear = el("button", { text: "Clear saved reports", onclick: async () => { await safe(() => bg("report.clear")); ui.status.textContent = "Saved reports cleared in this browser." } })
    const body = el(
      "div",
      { class: "b" },
      el("label", {}, ui.writes, el("span", { text: "Allow write checks: creates and deletes PRIVATE playlists titled “ytpt probe – safe to delete…”; on YouTube Music it also likes then unlikes the playing song and adds then removes queue items; on YouTube it adds two videos to your queue." })),
      el(
        "details",
        {},
        el("summary", { text: "Optional inputs" }),
        HOST === "www" ? el("div", {}, el("div", { class: "muted", text: "T11.4: a collaborative playlist you joined" }), ui.collab) : null,
        el("div", {}, el("div", { class: "muted", text: "T11.1: compare code from the other browser" }), ui.compare),
        el("div", {}, el("div", { class: "muted", text: "P1: prompt text" }), ui.prompt),
        el("div", {}, el("div", { class: "muted", text: "Notes" }), ui.notes),
        el("label", {}, ui.fx, el("span", { text: "Capture fixtures (ticket 18): keep every response, redacted, for “Download fixtures”. Not part of the report." })),
        ui.fxButton
      ),
      el(
        "details",
        {},
        el("summary", { text: "Keys (T08)" }),
        el("label", {}, ui.keyLog, el("span", { text: "Log my key presses (key, code, Alt/Ctrl/Meta, AltGraph). Click the page first; text fields and this panel are never logged." })),
        HOST === "www" ? el("label", {}, ui.keyBlock, el("span", { text: "On Shorts, block ↓ ↑ m k in the capture phase (T08.1)" })) : null,
        ui.keyShow
      ),
      el("div", { class: "row" }, ui.run, ui.stale, ui.scan, ui.copy, ui.clear),
      ui.status,
      ui.code,
      ui.copyArea,
      ui.results
    )
    const collapse = el("button", { text: "–", title: "Collapse", onclick: () => { body.style.display = body.style.display === "none" ? "" : "none" } })
    const panel = el("div", { class: "p" }, el("div", { class: "h" }, el("span", { text: `ytpt live-check probe ${L.VERSION} · ${HOST}` }), collapse), body)
    root.append(style, panel)
    document.documentElement.appendChild(host)
    ui.host = host
    ui.el = el
  }
  const showEntry = (entry) => {
    const row = ui.el(
      "div",
      { class: "e" },
      ui.el("div", { class: `s ${entry.status}`, text: entry.status.toUpperCase() }),
      ui.el("div", { class: "t", text: `${entry.id}${entry.part ? ` (${entry.part})` : ""}: ${entry.summary}` })
    )
    ui.results.append(row)
  }
  const setBusy = (busy, text) => {
    for (const b of [ui.run, ui.stale, ui.scan, ui.copy, ui.clear]) if (b) b.disabled = busy
    if (text) ui.status.textContent = text
  }

  // ======================= checks =======================

  const steps = []
  /** hosts: where it runs; gated: needs the write box; ids: what a skipped step reports. */
  const step = (key, hosts, opts, run) => steps.push({ key, hosts, ...opts, run })

  // ---------- context ----------

  step("env", BOTH, { ids: ["ENV"] }, async (ctx) => {
    const hello = await safe(() => bg("hello"))
    const isoHello = await safe(() => iso("hello"))
    ctx.state.env = hello
    return [
      E("ENV", null, "info", `${hello.browser ?? "?"} ${hello.browserVersion ?? ""} · window type ${hello.tab?.windowType ?? "?"} · display-mode ${displayMode()} · host access ${JSON.stringify(hello.hostAccess ?? "?")}`, {
        browser: hello.browser,
        browserVersion: hello.browserVersion,
        platform: hello.platform,
        extension: hello.extension,
        hostAccess: hello.hostAccess,
        webRequestObserver: hello.webRequest,
        tab: hello.tab,
        windowTypes: hello.windowTypes,
        page: { host: location.host, pathKind: pathKind(), displayMode: displayMode(), loadedMsAgo: Date.now() - loadedAt },
        mainWorld: {
          ytcfg: Boolean(window.ytcfg),
          clientName: get("INNERTUBE_CLIENT_NAME"),
          clientNameId: get("INNERTUBE_CONTEXT_CLIENT_NAME"),
          clientVersion: get("INNERTUBE_CLIENT_VERSION"),
          pageIdAsHeaderFlag: ctx.cfg.pageIdAsHeader
        },
        isolatedWorld: isoHello,
        error: hello.error
      })
    ]
  })

  // ---------- identity: L7, T11.1, T11.2, T11.3, T11.7 ----------

  const identityKeys = () => {
    const data = window.ytcfg?.data_ || {}
    return Object.keys(data)
      .filter((k) => /DELEGAT|SESSION|DATASYNC|LOGGED|PAGE_ID|BEHALF|SERIALIZED|GAIA|ACCOUNT|CHANNEL_ID|USER_ID|AUTHUSER|ID_TOKEN/i.test(k))
      .sort()
      .map((k) => {
        const v = data[k]
        return { key: k, type: typeof v, empty: v === "" || v == null, length: typeof v === "string" ? v.length : undefined, value: typeof v === "boolean" || (typeof v === "number" && k === "SESSION_INDEX") ? v : undefined }
      })
  }
  const dsidForm = (dsid) => {
    if (dsid == null) return "absent"
    if (/^V[0-9a-f]+\|\|$/i.test(dsid)) return "visitor V…|| (signed out)"
    const parts = String(dsid).split("||")
    if (parts.length !== 2) return "other"
    if (parts[0] && parts[1]) return "<a>||<b> (two parts)"
    if (parts[0]) return "<a>|| (one part)"
    return "||<b>"
  }

  step("identity", BOTH, { ids: ["L7", "T11.1", "T11.2", "T11.3", "T11.7"] }, async (ctx) => {
    const dsid = ctx.pageDsid
    const usid = get("USER_SESSION_ID")
    const del = get("DELEGATED_SESSION_ID")
    const parts = typeof dsid === "string" ? dsid.split("||") : []
    const ytcfgView = {
      LOGGED_IN: get("LOGGED_IN"),
      SESSION_INDEX: get("SESSION_INDEX"),
      DATASYNC_ID: { present: dsid != null, form: dsidForm(dsid), partLengths: parts.map((p) => p.length) },
      USER_SESSION_ID: { present: Boolean(usid), equals: !usid ? null : usid === parts[1] ? "DATASYNC_ID part 2" : usid === parts[0] ? "DATASYNC_ID part 1" : "neither part" },
      DELEGATED_SESSION_ID: { present: Boolean(del), equals: !del ? null : del === parts[0] ? "DATASYNC_ID part 1" : "neither part" },
      identityKeys: identityKeys(),
      innertubeContextUserKeys: Object.keys(get("INNERTUBE_CONTEXT")?.user || {})
    }
    const r = await ctx.it("navigation/resolve_url", { url: markerUrl("identity").url })
    const resp = ctx.sum(r)
    const rec = await safe(() => bg("dsid.record", { host: HOST, loggedIn: ctx.loggedIn, dsid, usid, del }))
    const a = rec.analysis || {}

    // Cross-browser compare code: salted, truncated, never in the report.
    if (!ctx.state.salt) ctx.state.salt = L.nonce()
    let cross = { pasted: false }
    const pasted = ui.compare.value.trim()
    if (pasted) {
      const m = pasted.match(/^ytpt1\.([a-z0-9]+)\.([0-9a-f]{16})$/)
      if (!m) cross = { pasted: true, valid: false }
      else if (!ctx.loggedIn) cross = { pasted: true, valid: true, compared: false, reason: "this page is signed out" }
      else cross = { pasted: true, valid: true, compared: true, same: (await L.sha256Hex(`${m[1]}|${dsid}`)).slice(0, 16) === m[2] }
    }
    if (ctx.loggedIn && dsid) {
      state.compareCode = `ytpt1.${ctx.state.salt}.${(await L.sha256Hex(`${ctx.state.salt}|${dsid}`)).slice(0, 16)}`
      ui.code.textContent = ""
      ui.code.append(
        ui.el("span", { text: "Compare code for your other browser (T11.1, not secret, not in the report): " }),
        ui.el("span", { class: "code", text: state.compareCode }),
        ui.el("button", { text: "Copy code", onclick: () => navigator.clipboard.writeText(state.compareCode).catch(() => {}) })
      )
    }

    const cycles = a.signOutCycles || []
    return [
      E(
        "L7",
        null,
        dsid != null && (!ctx.loggedIn || resp.responseDatasyncIdMatchesPage === true) ? "pass" : ctx.loggedIn ? "fail" : "info",
        `DATASYNC_ID ${ytcfgView.DATASYNC_ID.form}; response carries datasyncId: ${resp.responseHasDatasyncId ? "yes" : "no"}${resp.responseDatasyncIdMatchesPage != null ? `, matches page: ${resp.responseDatasyncIdMatchesPage ? "yes" : "NO"}` : ""}; this browser has seen ${a.distinctSignedIn ?? "?"} signed-in identit${a.distinctSignedIn === 1 ? "y" : "ies"}`,
        { ytcfg: ytcfgView, response: resp, history: rec.history, error: rec.error }
      ),
      E(
        "T11.1",
        null,
        cycles.length ? (cycles.every((c) => c.stable) ? "pass" : "fail") : cross.compared ? (cross.same ? "pass" : "fail") : "info",
        `${cycles.length ? `sign-out/sign-in cycles: ${cycles.map((c) => `${c.host} ${c.stable ? "stable" : "CHANGED"}`).join(", ")}` : "no sign-out/sign-in cycle recorded yet (run, sign out, run, sign in, run)"}; other browser: ${cross.compared ? (cross.same ? "same" : "DIFFERENT") : cross.pasted ? "code not usable" : "no compare code pasted"}`,
        { signOutCycles: cycles, signedOutVisitorValues: a.signedOutValues, crossBrowser: cross }
      ),
      E("T11.2", null, a.wwwVsMusic === "same" ? "pass" : a.wwwVsMusic === "different" ? "info" : "info", `www vs music (latest signed-in runs in this browser): ${a.wwwVsMusic ?? "not seen on both yet"}`, { wwwVsMusic: a.wwwVsMusic, latest: a.latestPerHost }),
      E("T11.3", null, "info", a.differentAtOnce ? "yes: www and music were on different identities within 10 minutes" : "not observed (switch account on one site only, reload both, run on both)", { differentAtOnce: a.differentAtOnce }),
      E("T11.7", null, "info", `form ${ytcfgView.DATASYNC_ID.form}; DELEGATED_SESSION_ID ${ytcfgView.DELEGATED_SESSION_ID.present ? "present" : "absent"}; USER_SESSION_ID ${ytcfgView.USER_SESSION_ID.present ? "present" : "absent"}; context.user keys: ${ytcfgView.innertubeContextUserKeys.join(",") || "none"}`, { ytcfg: ytcfgView })
    ]
  })

  // ---------- L4 (cookie part) ----------

  const cookieStoreInfo = async () => {
    if (!globalThis.cookieStore?.get) return { available: false }
    const out = { available: true }
    for (const name of L.AUTH_COOKIES) {
      try {
        const c = await cookieStore.get(name)
        out[name] = c ? { present: true, sameSite: c.sameSite, secure: c.secure, partitioned: c.partitioned, domain: c.domain, path: c.path, hasExpiry: c.expires != null } : { present: false }
      } catch (e) {
        out[name] = { error: L.errText(e) }
      }
    }
    return out
  }

  step("cookies", BOTH, { ids: ["L4"] }, async (ctx) => {
    const main = L.authCookiePresence(document.cookie)
    const isolated = await safe(() => iso("cookies"))
    const store = await cookieStoreInfo()
    const readable = main.SAPISID || main["__Secure-3PAPISID"]
    return [
      E("L4", "cookie readable", ctx.loggedIn ? (readable ? "pass" : "fail") : "info", `signed ${ctx.loggedIn ? "in" : "out"}; page world reads SAPISID: ${main.SAPISID}, __Secure-3PAPISID: ${main["__Secure-3PAPISID"]}, __Secure-1PAPISID: ${main["__Secure-1PAPISID"]}; isolated world: ${isolated.auth ? JSON.stringify(isolated.auth) : isolated.error}`, {
        mainWorld: { authCookies: main, readableCookieNames: L.cookieNames(document.cookie).sort() },
        isolatedWorld: isolated,
        cookieStoreAttributes: store
      })
    ]
  })

  // ---------- sending places (T25.headers), cookie-only reads (L3) ----------

  step("places", BOTH, { ids: ["L3"] }, async (ctx) => {
    const sendMain = async (place, opts) => {
      const { marker, url } = markerUrl(place)
      const r = await ctx.it("navigation/resolve_url", { url }, opts)
      ctx.state.markers.push({ place, marker })
      return { place, ...ctx.sum(r), sent: r.sent }
    }
    const sendIsolated = async (place, opts) => {
      const { marker, url } = markerUrl(place)
      const req = await L.buildRequest(ctx.cfg, "navigation/resolve_url", { url }, opts)
      const raw = await safe(() => iso("fetch", { url: req.url, headers: req.headers, body: req.body }))
      ctx.state.markers.push({ place, marker })
      return { place, ...ctx.sum(L.fromRaw(raw, req.sent)), sent: req.sent }
    }
    const results = [
      await sendMain("main-signed", {}),
      await sendMain("main-cookies-only", { auth: "none" }),
      await sendIsolated("isolated-signed", {}),
      await sendIsolated("isolated-cookies-only", { auth: "none" })
    ]
    if (HOST === "www") {
      const { marker, url } = markerUrl("background")
      const bgr = await safe(() => bg("bg.fetch", { url, clientVersion: ctx.cfg.clientVersion }))
      ctx.state.markers.push({ place: "background (extension origin)", marker })
      results.push({ place: "background", ...bgr })
    }
    ctx.state.places = results

    // L3 reads: the same requests with and without Authorization.
    const pair = async (path, body) => {
      const full = ctx.sum(await ctx.it(path, body))
      const bare = ctx.sum(await ctx.it(path, body, { auth: "none" }))
      return { path, signed: full, cookiesOnly: bare }
    }
    const reads = [
      await pair("playlist/get_add_to_playlist", { videoIds: [ctx.videoId], excludeWatchLater: false }),
      await pair("account/account_menu", {})
    ]
    const menuBare = await ctx.it("account/account_menu", {}, { auth: "none" })
    const bareHeader = Boolean(L.findKey(menuBare.json, "activeAccountHeaderRenderer").length)
    const bareResolve = results.find((x) => x.place === "main-cookies-only")
    const works = reads[0].cookiesOnly.status === 200 && L.signedIn(bareResolve)
    ctx.state.l3reads = { works, reads, bareResolve, bareHeader }
    return [
      E("L3", `reads, ${HOST}`, ctx.loggedIn ? (works ? "pass" : "fail") : "info", `cookies only: resolve_url ${L.signedIn(bareResolve) ? "signed in" : "signed OUT"}, get_add_to_playlist HTTP ${reads[0].cookiesOnly.status}, account_menu header ${bareHeader ? "present" : "absent"} (signed: get_add_to_playlist HTTP ${reads[0].signed.status})`, { resolveUrlCookiesOnly: bareResolve, reads })
    ]
  })

  // ---------- L4 (hash origin) ----------

  step("hashOrigin", BOTH, { ids: ["L4"] }, async (ctx) => {
    if (!ctx.loggedIn) return [E("L4", "hash origin", "skip", "signed out: nothing to compare", {})]
    const other = HOST === "www" ? "https://music.youtube.com" : "https://www.youtube.com"
    const variants = [
      ["A", "hash and X-Origin = this origin (baseline)", {}],
      ["B", "hash and X-Origin = the other origin", { hashOrigin: other, xOrigin: other }],
      ["C", "hash = this origin, X-Origin = the other", { xOrigin: other }],
      ["D", "hash = this origin, no X-Origin", { xOrigin: null }],
      ["E", "hash = the other origin, no X-Origin", { hashOrigin: other, xOrigin: null }],
      ["F", "single SAPISIDHASH, no _u, no 1P/3P parts", { auth: "single" }]
    ]
    const out = {}
    for (const [k, label, opts] of variants) {
      const r = await ctx.it("playlist/get_add_to_playlist", { videoIds: [ctx.videoId], excludeWatchLater: false }, opts)
      out[k] = { label, ok: r.status === 200, ...ctx.sum(r), sent: r.sent }
    }
    const ok = (k) => out[k].ok
    const verdict = !ok("A")
      ? "baseline failed; no conclusion"
      : ok("B") && !ok("C")
        ? "hash is checked against X-Origin"
        : !ok("B") && ok("C")
          ? "hash is checked against Origin (X-Origin ignored)"
          : ok("B") && ok("C")
            ? "both mismatches accepted"
            : "both mismatches rejected"
    return [
      E("L4", "hash origin", ok("A") ? "info" : "fail", `${verdict}; no X-Origin: ${ok("D") ? "accepted" : "rejected"}; single-hash form: ${ok("F") ? "accepted" : "rejected"}`, { origin: ORIGIN, variants: out, verdict })
    ]
  })

  // ---------- L5 shapes, T11.4 collaborative, T12.5 untick ----------

  step("shapes", WWW, { ids: ["L5", "T11.4", "T12.5"] }, async (ctx) => {
    if (!ctx.loggedIn) return [E("L5", null, "skip", "signed out", {}), E("T11.4", null, "skip", "signed out", {}), E("T12.5", null, "skip", "signed out", {})]
    const collab = ui.collab.value.trim() || undefined
    const plain = await ctx.it("playlist/get_add_to_playlist", { videoIds: [ctx.videoId], excludeWatchLater: false })
    const shorts = await ctx.it("playlist/get_add_to_playlist", { videoIds: [ctx.videoId], excludeWatchLater: false, params: L.SHORTS_SAVE_PARAMS })
    const a = L.analyzeAddToPlaylist(plain.json, { collaborativeId: collab })
    const b = L.analyzeAddToPlaylist(shorts.json, { collaborativeId: collab })
    const feed = await ctx.it("browse", { browseId: "FEplaylist_aggregation" })
    const lockups = L.findKey(feed.json, "lockupViewModel").map((f) => f.value)
    const feedIds = lockups.map((l) => l.contentId).filter(Boolean)
    const addIds = L.addToPlaylistIds(plain.json)
    ctx.state.addIds = addIds
    const feedView = {
      ...ctx.sum(feed),
      lockups: lockups.length,
      contentTypes: L.uniq(lockups.map((l) => l.contentType).filter(Boolean)),
      continuation: L.findKey(feed.json, "continuationItemRenderer").length > 0,
      watchLaterListed: feedIds.includes("WL"),
      privacyHints: L.mentions(lockups, /PRIVA|UNLIST|PUBLIC|LOCK/i),
      firstLockupShape: L.shape(lockups[0], { maxDepth: 10, maxItems: 1, maxKeys: 14 })
    }
    const overlap = {
      inBoth: feedIds.filter((id) => addIds.has(id)).length,
      onlyInFeed: feedIds.filter((id) => !addIds.has(id)).length,
      onlyInGetAddToPlaylist: [...addIds].filter((id) => !feedIds.includes(id) && id !== "WL").length
    }
    const untick = L.saveDialogCommands(plain.json)
    return [
      E("L5", "get_add_to_playlist", plain.status === 200 ? "info" : "fail", `shape ${a.shape}; ${a.oldShape ? `${a.oldShape.count} options, privacy ${a.oldShape.privacyValues.join("/")}, WL ${a.oldShape.watchLater.present ? `listed at ${a.oldShape.watchLater.position}` : "not listed"}` : ""}${a.newShape ? `${a.newShape.toggleableCount} toggleables` : ""}; paging hints ${a.pagedHints}; with Shorts params: shape ${b.shape}`, { plain: { ...ctx.sum(plain), ...L.publicView(a) }, withShortsParams: { ...ctx.sum(shorts), ...L.publicView(b) } }),
      E("L5", "FEplaylist_aggregation", feed.status === 200 ? "info" : "fail", `${lockups.length} lockups; WL listed: ${feedView.watchLaterListed}; privacy hints: ${feedView.privacyHints.slice(0, 4).join(", ") || "none"}`, feedView),
      E("T11.4", null, collab ? (a.userCollaborativePlaylistListed ? "pass" : "fail") : "info", collab ? `your collaborative playlist is ${a.userCollaborativePlaylistListed ? "" : "NOT "}listed by get_add_to_playlist (and ${feedIds.includes(collab) ? "is" : "is not"} in the playlists feed)` : `no collaborative playlist ID given; ${overlap.onlyInFeed} playlists in the feed aren't offered by get_add_to_playlist`, { collaborativeIdGiven: Boolean(collab), inGetAddToPlaylist: collab ? a.userCollaborativePlaylistListed : undefined, inFeed: collab ? feedIds.includes(collab) : undefined, overlap, collabMentions: { getAddToPlaylist: a.collaborativeMentions, feed: L.mentions(feed.json, /collab/i) } }),
      E("T12.5", null, "info", untick.oldShape ? `untick sends ${untick.oldShape.untick.map((u) => u?.actions?.map((x) => x.action).join("+") ?? JSON.stringify(u)).join(" | ")}` : untick.newShape ? `view model: ${untick.newShape.map((u) => u.actions.map((x) => x.action).join("+")).join(" | ")}` : "no Save-dialog commands found", untick)
    ]
  })

  // ---------- T11.6 labels; T11.8 channel switcher ----------

  const labelView = (json) => {
    const h = L.findKey(json, "activeAccountHeaderRenderer")[0]?.value
    return {
      header: Boolean(h),
      accountName: Boolean(h?.accountName),
      channelHandle: Boolean(h?.channelHandle),
      accountPhoto: Boolean(h?.accountPhoto?.thumbnails?.length),
      headerKeys: h ? Object.keys(h).sort() : [],
      channelIdPaths: L.pathsOfStrings(json, (s) => /^UC[\w-]{22}$/.test(s), 12)
    }
  }

  step("labels", BOTH, { ids: ["T11.6"] }, async (ctx) => {
    const signed = await ctx.it("account/account_menu", {})
    const v = labelView(signed.json)
    ctx.state.labelsSigned = v
    return [
      E("T11.6", `signed request, ${HOST}`, ctx.loggedIn ? (v.accountName && v.accountPhoto ? "pass" : "fail") : "info", `name ${v.accountName}, @handle ${v.channelHandle}, avatar ${v.accountPhoto} (identity form ${dsidForm(ctx.pageDsid)})`, { ...ctx.sum(signed), ...v })
    ]
  })

  step("channelSwitcher", WWW, { ids: ["T11.8"] }, async (ctx) => {
    // Signed out it redirects to Google's sign-in page, which a same-origin fetch can't follow.
    const res = await safe(() => fetch("/channel_switcher", { credentials: "same-origin", redirect: "manual" }))
    if (res.error) return [E("T11.8", null, "error", res.error, {})]
    if (res.type === "opaqueredirect")
      return [E("T11.8", null, ctx.loggedIn ? "fail" : "info", `redirects away from youtube.com (${ctx.loggedIn ? "unexpected while signed in" : "expected while signed out"})`, { redirected: true, signedIn: ctx.loggedIn })]
    const text = await res.text()
    let data = null
    try {
      const m = text.match(/var ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s)
      data = m ? JSON.parse(m[1]) : null
    } catch {}
    const keyCounts = {}
    const walk = (v, depth) => {
      if (!v || typeof v !== "object" || depth > 30) return
      if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1))
      for (const k of Object.keys(v)) {
        if (/account|channelSwitcher|brand/i.test(k)) keyCounts[k] = (keyCounts[k] || 0) + 1
        walk(v[k], depth + 1)
      }
    }
    walk(data, 0)
    const items = (keyCounts.accountItem || 0) + (keyCounts.accountItemRenderer || 0)
    return [
      E("T11.8", null, res.status === 200 && data ? "pass" : "fail", `HTTP ${res.status}${res.redirected ? `, redirected to ${new URL(res.url).pathname}` : ""}; ytInitialData ${data ? "found" : "missing"}; account items: ${items}`, { status: res.status, redirected: res.redirected, finalPath: new URL(res.url).pathname, hasInitialData: Boolean(data), topLevelKeys: data ? Object.keys(data) : [], accountKeyCounts: keyCounts })
    ]
  })

  // ---------- L2 reads: yt-service-request ----------

  step("serviceReads", WWW, { ids: ["L2"] }, async (ctx) => {
    const jobs = [
      ["get_add_to_playlist", { addToPlaylistServiceEndpoint: { videoId: ctx.videoId }, ...cmdMeta("/youtubei/v1/playlist/get_add_to_playlist") }, ["playlist/get_add_to_playlist"]],
      ["browse FEplaylist_aggregation", { browseEndpoint: { browseId: "FEplaylist_aggregation" }, ...cmdMeta("/youtubei/v1/browse") }, ["browse"]],
      ["account_menu", { signalServiceEndpoint: { signal: "GET_ACCOUNT_MENU" }, ...cmdMeta("/youtubei/v1/account/account_menu") }, ["account/account_menu"]]
    ]
    const entries = []
    for (const [name, endpoint, paths] of jobs) {
      const t0 = Date.now()
      const w = await watchUi(() => serviceRequest(endpoint))
      if (w.appeared.length) await closeUi()
      const seen = await seenRequests(t0, paths)
      const { out, response } = w.value || {}
      const summary = response ? ctx.sum({ status: 200, json: response }) : {}
      const qualifies = Boolean(response) && !w.appeared.length && !w.navigated
      ctx.state.ownClient.push(...seen.map((s) => ({ place: `own client: service request ${name}`, entry: s })))
      const extra = {}
      if (name === "get_add_to_playlist" && response) extra.shape = L.publicView(L.analyzeAddToPlaylist(response))
      if (name === "account_menu" && response) ctx.state.labelsOwn = extra.labels = labelView(response)
      entries.push(
        E("L2", name, qualifies ? "pass" : "fail", `${response ? "response returned" : "no response"}; UI: ${w.appeared.join(", ") || "none"}${w.navigated ? "; NAVIGATED" : ""}; HTTP ${seen.map((s) => s.statusCode).join(",") || "?"}`, {
          route: out,
          thrown: w.thrown,
          uiAppeared: w.appeared,
          navigated: w.navigated,
          response: summary,
          responseTopKeys: response && typeof response === "object" ? Object.keys(response) : undefined,
          responseActionKinds: actionKinds(response),
          requestsSeen: seen,
          ...extra
        })
      )
    }
    if (ctx.state.labelsOwn)
      entries.push(E("T11.6", "service request", ctx.state.labelsOwn.accountName ? "pass" : "fail", `name ${ctx.state.labelsOwn.accountName}, @handle ${ctx.state.labelsOwn.channelHandle}, avatar ${ctx.state.labelsOwn.accountPhoto}`, ctx.state.labelsOwn))
    const appEl = document.querySelector("ytd-app")
    const withResolve = new Set()
    for (const el of document.querySelectorAll("*")) if (typeof el.resolveCommand === "function" && withResolve.size < 10) withResolve.add(el.tagName.toLowerCase())
    const g = globalHandler()
    entries.push(E("T25.own-client", "resolveCommand", "info", `ytd-app.resolveCommand: ${typeof appEl?.resolveCommand}; elements with resolveCommand: ${[...withResolve].join(",") || "none"}; global handler: ${g ? `default_kevlar_base.${g.key}.instance` : "not found"}; handleCommandWithCommandHandler: ${typeof appEl?.handleCommandWithCommandHandler}; probe uses: ${wwwResolver()?.kind ?? "nothing"}`, { element: typeof appEl?.resolveCommand, elementsWithResolveCommand: [...withResolve], globalHandlerKey: g?.key ?? null, handleCommandWithCommandHandler: typeof appEl?.handleCommandWithCommandHandler, handleCommandWithCommandHandlerSource: String(appEl?.handleCommandWithCommandHandler ?? "").slice(0, 120), probeResolver: wwwResolver()?.kind ?? null }))
    return entries
  })

  // ---------- L9 Shorts ----------

  step("shorts", WWW, { ids: ["L9"] }, async () => {
    const onShorts = location.pathname.startsWith("/shorts/")
    const shortsNav = early.navEvents.filter((n) => n.pageType === "shorts" || n.urlKind === "shorts")
    if (!onShorts && !shortsNav.length)
      return [E("L9", null, "skip", "not on a Short: open a Short, let it loop once, swipe to the next, then run", {})]
    const root = document.querySelector("#shorts-player")
    const urlId = onShorts ? location.pathname.split("/")[2] : null
    const methods = ["getPlayerResponse", "getVideoData", "getProgressState", "getCurrentTime", "getDuration", "getPlayerState"].filter((m) => typeof root?.[m] === "function")
    const vd = await safe(() => root?.getVideoData?.(), null)
    const pr = await safe(() => root?.getPlayerResponse?.(), null)
    const video = root?.querySelector("video")
    return [
      E("L9", null, methods.includes("getPlayerResponse") && methods.includes("getVideoData") ? "pass" : "fail", `#shorts-player ${root ? "found" : "MISSING"}; API: ${methods.join(", ") || "none"}; shorts navigations seen: ${shortsNav.length} (with reel endpoint: ${shortsNav.filter((n) => n.hasReelEndpoint).length}); loop wraps seen: ${early.shorts.wrapCandidates.length}`, {
        onShortsNow: onShorts,
        playerFound: Boolean(root),
        playerApi: methods,
        getVideoData: vd ? { keys: Object.keys(vd).sort().slice(0, 40), videoIdMatchesUrl: urlId ? vd.video_id === urlId : undefined } : null,
        getPlayerResponse: pr ? { videoIdMatchesUrl: urlId ? pr.videoDetails?.videoId === urlId : undefined, hasChannelId: Boolean(pr.videoDetails?.channelId), hasAuthor: Boolean(pr.videoDetails?.author), hasOwnerProfileUrl: Boolean(pr.microformat?.playerMicroformatRenderer?.ownerProfileUrl) } : null,
        firstVideoInDocumentIsShortsVideo: video ? document.querySelector("video") === video : null,
        movie_playerPresent: Boolean(document.querySelector("#movie_player")),
        navigateFinishEvents: early.navEvents.slice(-25),
        loop: { ...early.shorts, wrapCandidates: early.shorts.wrapCandidates }
      })
    ]
  })

  // ---------- www writes (all gated, throwaway private playlist only) ----------

  step("setup", WWW, { gated: true, ids: ["SETUP", "T12.6", "T12.4"] }, async (ctx) => {
    if (!ctx.loggedIn) return [E("SETUP", null, "skip", "signed out", {})]
    const list = await ctx.it("playlist/get_add_to_playlist", { videoIds: [L.TEST_VIDEO], excludeWatchLater: false })
    const leftovers = L.probeLeftovers(list.json)
    const cleaned = []
    for (const p of leftovers) cleaned.push(ctx.sum(await ctx.it("playlist/delete", { playlistId: p.playlistId })).status)

    // T12.6: title length. Try 151, then 150, then the short title.
    const tries = []
    let pid
    let createdAt
    for (const n of [151, 150, L.PLAYLIST_TITLE.length]) {
      const title = n === L.PLAYLIST_TITLE.length ? L.PLAYLIST_TITLE : makeTitle(n)
      const r = await ctx.it("playlist/create", { title, privacyStatus: "PRIVATE" })
      const s = ctx.sum(r)
      tries.push({ titleLength: n, ...s, playlistIdReturned: Boolean(r.json?.playlistId), responseKeys: Object.keys(r.json || {}) })
      if (r.json?.playlistId) {
        pid = r.json.playlistId
        createdAt = Date.now()
        ctx.state.playlists.push({ playlistId: pid, how: `signed request, title ${n}` })
        break
      }
      if (s.status === 429) break
    }
    if (!pid) return [E("SETUP", null, "fail", `could not create the probe playlist: ${JSON.stringify(tries.at(-1))}`, { cleanedLeftovers: cleaned, tries })]

    // T12.4: add immediately after create; retry while refused.
    const attempts = []
    let setVideoId
    for (let i = 0; i < 12; i++) {
      const r = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [ADD(L.TEST_VIDEO)] })
      const s = ctx.sum(r)
      attempts.push({ msAfterCreate: Date.now() - createdAt, status: s.status, bodyStatus: s.bodyStatus, error: s.error?.status, actionKinds: actionKinds(r.json) })
      if (s.bodyStatus === "STATUS_SUCCEEDED") {
        setVideoId = addedSetVideoId(r.json)
        break
      }
      await L.sleep(3000)
    }
    ctx.state.pid = pid
    ctx.state.firstSetVideoId = setVideoId
    ctx.state.firstAddAt = Date.now()
    const listed = await ctx.it("playlist/get_add_to_playlist", { videoIds: [L.TEST_VIDEO], excludeWatchLater: false })
    const storedLength = L.titleLength(listed.json, pid)
    const accepted = tries.filter((t) => t.playlistIdReturned).map((t) => t.titleLength)
    const refused = tries.filter((t) => !t.playlistIdReturned).map((t) => t.titleLength)
    const firstOk = attempts.findIndex((a) => a.bodyStatus === "STATUS_SUCCEEDED")
    return [
      E("SETUP", null, "pass", `created a private probe playlist; cleaned ${leftovers.length} leftover(s)`, { cleanedLeftovers: cleaned.length, privacyRequested: "PRIVATE" }),
      E("T12.6", null, "info", `title lengths accepted: ${accepted.join(",") || "none"}; refused: ${refused.join(",") || "none"}; stored title length ${storedLength ?? "?"}`, { tries, storedTitleLength: storedLength }),
      E("T12.4", null, firstOk === 0 ? "pass" : firstOk > 0 ? "info" : "fail", firstOk === 0 ? `first add ${attempts[0].msAfterCreate} ms after create succeeded: no edit lock on www` : firstOk > 0 ? `refused until ${attempts[firstOk].msAfterCreate} ms after create` : "every add attempt in ~36 s failed", { attempts })
    ]
  })

  const countEntries = async (ctx, pid, videoId) => {
    await L.sleep(1200)
    const r = await ctx.it("browse", { browseId: `VL${pid}` })
    return { status: r.status, entriesOfVideo: L.playlistEntries(r.json, videoId), entriesTotal: L.playlistEntries(r.json) }
  }
  const pollMembership = async (ctx, pid, videoId, want, maxMs = 30000) => {
    const t0 = Date.now()
    let value
    let polls = 0
    while (Date.now() - t0 < maxMs) {
      polls++
      const r = await ctx.it("playlist/get_add_to_playlist", { videoIds: [videoId], excludeWatchLater: false })
      value = L.membershipOf(r.json, pid)
      if (value === want) return { reached: true, msAfterStart: Date.now() - t0, value, polls }
      await L.sleep(1500)
    }
    return { reached: false, msAfterStart: Date.now() - t0, value, polls }
  }

  step("duplicates", WWW, { gated: true, ids: ["L6", "T12.1", "T12.3"] }, async (ctx) => {
    const pid = ctx.state.pid
    if (!pid || !ctx.state.firstSetVideoId) return [E("L6", null, "skip", "no probe playlist or the first add failed", {})]
    const vid = L.TEST_VIDEO
    const membershipAfterAdd = await pollMembership(ctx, pid, vid, "ALL")
    const c0 = await countEntries(ctx, pid, vid)
    const dup = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [ADD(vid)] })
    const dupView = editView(dup, ctx.sum(dup))
    const dupSet = addedSetVideoId(dup.json)
    const c1 = await countEntries(ctx, pid, vid)
    const undoTarget = dupSet || ctx.state.firstSetVideoId
    const undo = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [REMOVE(undoTarget)] })
    const c2 = await countEntries(ctx, pid, vid)
    let byVideo = { run: false }
    if (c2.entriesOfVideo >= 1) {
      const again = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [ADD(vid)] })
      const c3 = await countEntries(ctx, pid, vid)
      const rb = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [REMOVE_BY_VIDEO(vid)] })
      const c4 = await countEntries(ctx, pid, vid)
      byVideo = { run: true, addAgain: ctx.sum(again).bodyStatus, copiesBefore: c3.entriesOfVideo, removeByVideoId: ctx.sum(rb).bodyStatus, copiesAfter: c4.entriesOfVideo }
    }
    const membershipAfterRemove = await pollMembership(ctx, pid, vid, "NONE")
    const dupAdded = c1.entriesOfVideo > c0.entriesOfVideo
    return [
      E("L6", null, "info", `duplicate add: ${dupView.bodyStatus ?? `HTTP ${dupView.status}`}, ${dupAdded ? "a second copy WAS added" : "no second copy"}; undo by setVideoId: ${ctx.sum(undo).bodyStatus}, copies ${c1.entriesOfVideo}→${c2.entriesOfVideo}; remove-by-video-id: ${byVideo.run ? `copies ${byVideo.copiesBefore}→${byVideo.copiesAfter}` : "not run"}; full-playlist error: not tested (needs 5,000 entries)`, {
        copiesBeforeDuplicate: c0.entriesOfVideo,
        duplicateAdd: dupView,
        copiesAfterDuplicate: c1.entriesOfVideo,
        undoBySetVideoId: { removed: dupSet ? "the duplicate's entry" : "the first entry", ...ctx.sum(undo), copiesAfter: c2.entriesOfVideo },
        removeByVideoId: byVideo,
        fullPlaylistError: "not tested"
      }),
      E("T12.1", "www", "info", `duplicate add returns ${dupView.bodyStatus ?? `HTTP ${dupView.status}`}${dupView.actionKinds.length ? ` with actions ${dupView.actionKinds.join(",")}` : ""}; ${dupAdded ? "adds a second copy" : "adds nothing"}`, dupView),
      E("T12.3", null, membershipAfterAdd.reached && membershipAfterAdd.msAfterStart < 2000 ? "pass" : "info", `membership shows the add after ~${membershipAfterAdd.reached ? membershipAfterAdd.msAfterStart : ">30000"} ms (poll every 1.5 s), the removal after ~${membershipAfterRemove.reached ? membershipAfterRemove.msAfterStart : ">30000"} ms`, { afterAdd: membershipAfterAdd, afterRemove: membershipAfterRemove })
    ]
  })

  step("errors", WWW, { gated: true, ids: ["T12.2"] }, async (ctx) => {
    const pid = ctx.state.pid
    const bogus = await ctx.it("browse/edit_playlist", { playlistId: randomPlaylistId(), actions: [ADD(L.TEST_VIDEO)] })
    const out = [E("T12.2", "missing playlist (random ID)", "info", `${ctx.sum(bogus).bodyStatus ?? ""} HTTP ${bogus.status} ${ctx.sum(bogus).error?.status ?? ""}`, editView(bogus, ctx.sum(bogus)))]
    if (pid) {
      const kids = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [ADD(KIDS_VIDEO)] })
      const set = addedSetVideoId(kids.json)
      if (set) await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [REMOVE(set)] })
      out.push(E("T12.2", "made-for-kids video", "info", `${ctx.sum(kids).bodyStatus ?? `HTTP ${kids.status}`}${set ? " (added, then removed)" : ""}`, editView(kids, ctx.sum(kids))))
    }
    out.push(E("T12.2", "full playlist, supervised, no-channel", "skip", "not testable here: needs 5,000 entries or such an account (run the probe signed in as one if you have it)", {}))
    return out
  })

  step("cookieWrite", WWW, { gated: true, ids: ["L3"] }, async (ctx) => {
    const pid = ctx.state.pid
    if (!pid) return [E("L3", "write", "skip", "no probe playlist", {})]
    const r = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [ADD(SECOND_VIDEO)] }, { auth: "none" })
    const s = ctx.sum(r)
    const set = addedSetVideoId(r.json)
    if (set) await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [REMOVE(set)] })
    return [E("L3", "write", s.bodyStatus === "STATUS_SUCCEEDED" ? "pass" : "fail", `cookies-only add: ${s.bodyStatus ?? `HTTP ${s.status}`}${set ? " (removed again)" : ""}`, editView(r, s))]
  })

  // L1: YouTube's own command with a commandController.
  const resolveEdit = async (actions, pid) => {
    const res = wwwResolver()
    const calls = []
    const reads = new Set()
    const target = {
      onSuccess: (cmd, resp) => calls.push({ method: "onSuccess", resp }),
      onServerError: (cmd, resp) => calls.push({ method: "onServerError", resp }),
      onError: () => calls.push({ method: "onError" })
    }
    const controller = new Proxy(target, { get: (t, p) => (typeof p === "string" && reads.add(p), t[p]) })
    const command = { playlistEditEndpoint: { playlistId: pid, actions }, ...cmdMeta("/youtubei/v1/browse/edit_playlist") }
    const t0 = Date.now()
    const w = await watchUi(async () => {
      if (!res) throw new Error("resolveCommand missing on ytd-app and its controller")
      const ret = res.r.resolveCommand(command, { commandController: controller })
      const until = Date.now() + 10000
      while (!calls.length && Date.now() < until) await L.sleep(100)
      return ret
    })
    if (w.appeared.length) await closeUi()
    const seen = await seenRequests(t0, ["browse/edit_playlist"])
    const first = calls[0]
    if (first?.resp) captureFx(`resolveCommand ${first.method}`, "playlistEditEndpoint", { actions }, seen.at(-1)?.statusCode, first.resp?.data ?? first.resp)
    return {
      resolver: res?.kind,
      thrown: w.thrown,
      returned: w.value === undefined ? "undefined" : typeof w.value === "object" ? `object {${Object.keys(w.value || {}).join(",")}}` : String(w.value),
      callbacks: calls.map((c) => c.method),
      controllerPropertiesRead: [...reads],
      response: first?.resp ? { ...L.summarize({ status: 200, json: first.resp?.data ?? first.resp }, get("DATASYNC_ID")), topKeys: Object.keys(first.resp || {}), setVideoIdReturned: Boolean(addedSetVideoId(first.resp?.data ?? first.resp)) } : null,
      setVideoId: addedSetVideoId(first?.resp?.data ?? first?.resp),
      uiAppeared: w.appeared,
      navigated: w.navigated,
      requestsSeen: seen
    }
  }

  step("ownCommand", WWW, { gated: true, ids: ["L1"] }, async (ctx) => {
    const pid = ctx.state.pid
    if (!pid) return [E("L1", "success", "skip", "no probe playlist", {})]
    const add = await resolveEdit([ADD(SECOND_VIDEO)], pid)
    ctx.state.ownClient.push(...add.requestsSeen.map((s) => ({ place: "own client: resolveCommand edit", entry: s })))
    let remove = null
    if (add.setVideoId) remove = await resolveEdit([REMOVE(add.setVideoId)], pid)
    const quiet = !add.uiAppeared.length && !add.navigated && (!remove || (!remove.uiAppeared.length && !remove.navigated))
    const ok = add.callbacks.includes("onSuccess") && Boolean(add.response)
    const strip = ({ setVideoId, ...rest }) => rest
    return [
      E("L1", "success", ok && quiet ? "pass" : "fail", `via ${add.resolver ?? "no resolver"}; add: callbacks ${add.callbacks.join(",") || "none"}, response ${add.response ? "returned" : "not returned"}, UI ${add.uiAppeared.join(",") || "none"}; undo: ${remove ? `callbacks ${remove.callbacks.join(",") || "none"}, UI ${remove.uiAppeared.join(",") || "none"}` : "not run (no setVideoId)"}`, { add: strip(add), undo: remove && strip(remove) })
    ]
  })

  step("serviceWrites", WWW, { gated: true, ids: ["L2"] }, async (ctx) => {
    const pid = ctx.state.pid
    const entries = []
    if (pid) {
      const t0 = Date.now()
      const w = await watchUi(() => serviceRequest({ playlistEditEndpoint: { playlistId: pid, actions: [ADD(SECOND_VIDEO)] }, ...cmdMeta("/youtubei/v1/browse/edit_playlist") }))
      if (w.appeared.length) await closeUi()
      const resp = w.value?.response
      const set = addedSetVideoId(resp)
      let undo = null
      if (set) {
        const u = await watchUi(() => serviceRequest({ playlistEditEndpoint: { playlistId: pid, actions: [REMOVE(set)] }, ...cmdMeta("/youtubei/v1/browse/edit_playlist") }))
        undo = { status: u.value?.response?.status, uiAppeared: u.appeared, route: u.value?.out }
      }
      const seen = await seenRequests(t0, ["browse/edit_playlist"])
      entries.push(E("L2", "playlistEditEndpoint", resp && !w.appeared.length && !w.navigated ? "pass" : "fail", `${resp ? `response ${resp.status ?? "?"}` : "no response"}; UI ${w.appeared.join(",") || "none"}; undo ${undo ? `${undo.status ?? "?"}, UI ${undo.uiAppeared.join(",") || "none"}` : "not run"}`, { route: w.value?.out, thrown: w.thrown, uiAppeared: w.appeared, navigated: w.navigated, response: resp ? { ...ctx.sum({ status: 200, json: resp }), setVideoIdReturned: Boolean(set), actionKinds: actionKinds(resp) } : null, undo, requestsSeen: seen }))
    } else entries.push(E("L2", "playlistEditEndpoint", "skip", "no probe playlist", {}))

    const t1 = Date.now()
    const w2 = await watchUi(() => serviceRequest({ createPlaylistServiceEndpoint: { title: L.OWN_CLIENT_PLAYLIST_TITLE, privacyStatus: "PRIVATE", videoIds: [L.TEST_VIDEO] }, ...cmdMeta("/youtubei/v1/playlist/create") }))
    if (w2.appeared.length) await closeUi()
    const resp2 = w2.value?.response
    let createdId = resp2?.playlistId
    let foundBy = createdId ? "response" : null
    if (!createdId) {
      for (let i = 0; i < 4 && !createdId; i++) {
        await L.sleep(2500)
        const list = await ctx.it("playlist/get_add_to_playlist", { videoIds: [L.TEST_VIDEO], excludeWatchLater: false })
        createdId = L.listedPlaylists(list.json).find((p) => p.title === L.OWN_CLIENT_PLAYLIST_TITLE)?.playlistId
        if (createdId) foundBy = "listing by title"
      }
    }
    if (createdId) ctx.state.playlists.push({ playlistId: createdId, how: "service request create" })
    const seen2 = await seenRequests(t1, ["playlist/create"])
    entries.push(E("L2", "createPlaylistServiceEndpoint", resp2?.playlistId && !w2.appeared.length && !w2.navigated ? "pass" : "fail", `${resp2 ? (resp2.playlistId ? "response carries playlistId" : `response without playlistId (keys ${Object.keys(resp2).join(",")})`) : "no response"}; UI ${w2.appeared.join(",") || "none"}; created playlist found by ${foundBy ?? "NOTHING (see CLEANUP)"}`, { route: w2.value?.out, thrown: w2.thrown, uiAppeared: w2.appeared, navigated: w2.navigated, responseTopKeys: resp2 ? Object.keys(resp2) : null, playlistIdReturned: Boolean(resp2?.playlistId), actionKinds: actionKinds(resp2), requestsSeen: seen2 }))
    if (!createdId && (resp2 || seen2.some((s) => s.statusCode === 200))) ctx.state.ownCreateLost = true
    return entries
  })

  // ---------- youtube.com queue: L8 and ticket 29 (Q1-Q8) ----------

  const ctlOf = (el) => el?.polymerController ?? el?.inst ?? el
  const queuePanelsWww = () =>
    [...document.querySelectorAll("ytd-playlist-panel-renderer")].map((el) => {
      const via = el.data?.playlistId ? "element.data" : el.polymerController?.data?.playlistId ? "polymerController.data" : el.inst?.data?.playlistId ? "inst.data" : null
      return {
        where: el.closest("ytd-miniplayer") ? "miniplayer" : el.closest("ytd-watch-flexy, ytd-watch-grid, ytd-watch-fixie") ? "watch page" : "other",
        via,
        data: via === "element.data" ? el.data : via ? ctlOf(el).data : null
      }
    })
  const tlpqPanel = () => queuePanelsWww().find((p) => p.data?.playlistId?.startsWith("TLPQ"))
  const qEntries = () =>
    (tlpqPanel()?.data?.contents ?? []).map((c) => c.playlistPanelVideoRenderer ?? c.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer).filter(Boolean)
  const qSetIds = () => new Set(qEntries().map((e) => e.playlistSetVideoId).filter(Boolean))
  /**
   * YouTube's global command handler. The bundle's namespace is the page
   * global `default_kevlar_base`; the handler is the one entry whose
   * `.instance` has `resolveCommand` (minified name, so found by shape).
   * On 2026-10-19, signed out, no element had resolveCommand any more and
   * ytd-app.handleCommandWithCommandHandler passed no commandController.
   */
  let globalHandlerCache
  const globalHandler = () => {
    if (globalHandlerCache !== undefined) return globalHandlerCache
    globalHandlerCache = null
    const ns = window.default_kevlar_base
    if (ns)
      for (const k of Object.keys(ns)) {
        try {
          const v = ns[k]
          if (v && (typeof v === "object" || typeof v === "function") && v.instance && typeof v.instance.resolveCommand === "function") {
            globalHandlerCache = { inst: v.instance, key: k }
            break
          }
        } catch {}
      }
    return globalHandlerCache
  }
  const wwwResolver = () => {
    const app = document.querySelector("ytd-app")
    if (typeof app?.resolveCommand === "function") return { r: app, kind: "ytd-app.resolveCommand" }
    if (app?.polymerController !== app && typeof ctlOf(app)?.resolveCommand === "function") return { r: ctlOf(app), kind: "controller.resolveCommand" }
    const g = globalHandler()
    if (g) return { r: { resolveCommand: (cmd, opts) => g.inst.resolveCommand(cmd, { form: { element: app }, ...(opts || {}) }) }, kind: `global command handler (default_kevlar_base.${g.key}.instance)` }
    if (typeof app?.handleCommandWithCommandHandler === "function") return { r: { resolveCommand: (cmd) => app.handleCommandWithCommandHandler(cmd, app) }, kind: "ytd-app.handleCommandWithCommandHandler (passes no commandController)" }
    return null
  }
  const queueDataPaths = (videoId) => {
    const found = []
    for (const el of document.querySelectorAll("ytd-playlist-panel-renderer, ytd-miniplayer, ytd-playlist-panel-video-renderer")) {
      const data = el.data ?? ctlOf(el)?.data
      if (!data) continue
      const paths = L.pathsOfStrings(data, (s) => s === videoId, 6)
      if (paths.length) found.push({ element: el.tagName.toLowerCase(), via: el.data ? "element.data" : "controller.data", insideMiniplayer: Boolean(el.closest("ytd-miniplayer")), insideWatchPage: Boolean(el.closest("ytd-watch-flexy")), paths })
    }
    return found
  }
  const queueCommand = (videoId, create) => {
    const command = { videoIds: [videoId], listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE" }
    if (create) {
      command.openMiniplayer = true
      command.onCreateListCommand = { createPlaylistServiceEndpoint: { videoIds: [videoId], params: "CAQ%3D" } }
    }
    return { signalServiceEndpoint: { signal: "CLIENT_SIGNAL", actions: [{ addToPlaylistCommand: command }] } }
  }
  const waitUntil = async (pred, ms, every = 100) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (call0(pred)) return Date.now() - t0
      await L.sleep(every)
    }
    return null
  }
  let playlistDataUpdated = 0
  document.addEventListener("yt-playlist-data-updated", () => playlistDataUpdated++, true)

  /** Resolves a command with a commandController: callbacks, response status, HTTP, toasts. */
  const resolveWithController = async (command, settleMs = 1500) => {
    const res = wwwResolver()
    if (!res) return { error: "no resolveCommand" }
    const calls = []
    const controller = {
      onSuccess: (c, r) => calls.push({ m: "onSuccess", r: r?.data ?? r }),
      onServerError: (c, r) => calls.push({ m: "onServerError", r: r?.data ?? r })
    }
    const t0 = Date.now()
    const w = await watchUi(async () => {
      res.r.resolveCommand(command, { commandController: controller })
      await waitUntil(() => calls.length, 8000)
    }, settleMs)
    const seen = await seenRequests(t0, ["browse/edit_playlist"])
    const first = calls[0]
    return { resolver: res.kind, callbacks: calls.map((c) => c.m), responseStatus: first?.r?.status, responseActionKinds: actionKinds(first?.r), setVideoIdReturned: Boolean(addedSetVideoId(first?.r)), _setVideoId: addedSetVideoId(first?.r), http: seen.map((s) => s.statusCode), toasts: w.toasts, uiAppeared: w.appeared, thrown: w.thrown }
  }
  const editCmd = (listId, action, params) => ({ ...cmdMeta("/youtubei/v1/browse/edit_playlist"), playlistEditEndpoint: { playlistId: listId, actions: [action], ...(params ? { params } : {}) } })
  /** Waits until every panel entry has its playlistSetVideoId (no temporary items left). */
  const settleQueue = () => waitUntil(() => qEntries().length && qEntries().every((e) => e.playlistSetVideoId), 8000, 200)
  /** One 1.5.0-style add; returns our new entry once the panel gives it a playlistSetVideoId. */
  const legacyAdd = async (res, videoId) => {
    await settleQueue()
    const before = qSetIds()
    const tempBefore = qEntries().filter((e) => e.videoId === videoId).length
    const ours = () => qEntries().find((e) => e.videoId === videoId && e.playlistSetVideoId && !before.has(e.playlistSetVideoId))
    const t0 = Date.now()
    res.r.resolveCommand(queueCommand(videoId, false))
    const inData = await waitUntil(() => qEntries().filter((e) => e.videoId === videoId).length > tempBefore, 5000)
    const inDataMs = inData == null ? null : Date.now() - t0
    const got = await waitUntil(() => ours(), 10000)
    const setIdMs = got == null ? null : Date.now() - t0
    const entry = ours()
    return { t0, inDataMs, setIdMs, _entry: entry, selected: Boolean(entry?.selected) }
  }

  step("queueRead", WWW, { ids: ["T29.Q1", "T29.Q4", "T29.Q7"] }, async (ctx) => {
    const runStart = ctx.startedAt
    const byHand = (await seenRequests(loadedAt, ["browse/edit_playlist"])).filter((s) => s.t < runStart)
    scanToasts()
    const handToasts = toastLog.filter((t) => t.at < runStart).map((t) => t.text)
    const entries = qEntries()
    const sample = entries.find((e) => !e.selected)
    const removeItems = (sample?.menu?.menuRenderer?.items || [])
      .map((i) => Object.values(i)[0] || {})
      .map((x) => {
        const ep = x.serviceEndpoint ?? x.navigationEndpoint ?? {}
        const pe = ep.playlistEditEndpoint
        return { label: (x.text?.runs?.map((r) => r.text).join("") ?? x.text?.simpleText ?? "").slice(0, 40), endpoint: Object.keys(ep).find((k) => k !== "clickTrackingParams" && k !== "commandMetadata"), params: pe?.params, actions: pe?.actions?.map((a) => a.action), clientActions: (pe?.clientActions || []).map((c) => Object.keys(c)[0]) }
      })
      .filter((x) => x.actions?.some((a) => /REMOVE/.test(a)))
    const mgr = document.querySelector("yt-playlist-manager")
    const getter = typeof mgr?.getPlaylistData === "function" ? ["element", mgr] : typeof ctlOf(mgr)?.getPlaylistData === "function" ? ["controller", ctlOf(mgr)] : null
    let mgrData = null
    if (getter) mgrData = await safe(() => getter[1].getPlaylistData(), { error: "threw" })
    const panels = queuePanelsWww()
    return [
      byHand.length || handToasts.length ? E("T29.Q1", "by hand, before this run", "info", `edits seen: ${byHand.map((s) => `${(s.bodyActions || []).map((a) => a.action).join("+")}${s.bodyParams ? ` params ${s.bodyParams}` : ""} → ${s.statusCode}`).join("; ") || "none"}; toasts: ${handToasts.join(" | ") || "none detected"}`, { edits: byHand.map((s) => ({ actions: s.bodyActions, params: s.bodyParams, status: s.statusCode })), toasts: handToasts }) : E("T29.Q1", "by hand", "skip", "queue two videos with YouTube's own ⋮ → Add to queue before pressing Run (and watch for its toast)", {}),
      E("T29.Q4", null, sample ? (removeItems.length ? "info" : "fail") : "skip", sample ? `panel remove item: ${removeItems.map((x) => `“${x.label}” params ${x.params ?? "none"}, ${x.actions?.join("+")}, clientActions ${x.clientActions.join(",") || "none"}`).join(" · ") || "none found"}` : "no queue with a non-playing entry open", { removeItems, observedRemoveEdits: byHand.filter((s) => (s.bodyActions || []).some((a) => /REMOVE/.test(a.action))).map((s) => ({ actions: s.bodyActions, params: s.bodyParams, status: s.statusCode })) }),
      E("T29.Q7", null, tlpqPanel() ? "info" : "skip", `panel data at: ${panels.map((p) => `${p.where} ${p.via ?? "none"}${p.data?.playlistId?.startsWith("TLPQ") ? " (TLPQ)" : ""}`).join(", ") || "no panel"}; yt-playlist-manager.getPlaylistData: ${getter ? `${getter[0]}, returns TLPQ data ${Boolean(mgrData?.playlistId?.startsWith?.("TLPQ"))}` : "not callable"}; yt-playlist-data-updated events on document since load: ${playlistDataUpdated}`, { panels: panels.map((p) => ({ where: p.where, via: p.via, tlpq: Boolean(p.data?.playlistId?.startsWith("TLPQ")) })), managerGetter: getter?.[0] ?? null, managerDataKeys: mgrData && typeof mgrData === "object" ? Object.keys(mgrData).slice(0, 20) : null, playlistDataUpdatedEvents: playlistDataUpdated })
    ]
  })

  step("queue", WWW, { gated: true, ids: ["L8", "T29.Q1", "T29.Q2", "T29.Q3", "T29.Q5", "T29.Q6", "T29.Q8"] }, async () => {
    const res = wwwResolver()
    if (!res) return [E("L8", null, "fail", "no resolveCommand on ytd-app or its controller", {})]
    const out = []
    let created = null
    if (!tlpqPanel()) {
      const w = await watchUi(async () => {
        res.r.resolveCommand(queueCommand(L.TEST_VIDEO, true))
        created = { tlpqPanelAfterMs: await waitUntil(() => tlpqPanel(), 6000) }
      }, 1500)
      created.miniplayerActive = Boolean(document.querySelector("ytd-miniplayer")?.active)
      created.firstAddToasts = w.toasts
    }
    if (!tlpqPanel()) return [E("L8", null, "fail", "no TLPQ queue panel appeared", { created, panels: queuePanelsWww().map((p) => ({ where: p.where, via: p.via })) })]
    const listId = tlpqPanel().data.playlistId
    await settleQueue()
    const countBefore = qEntries().length
    const refresh = () => res.r.resolveCommand({ refreshPlaylistCommand: { listId } })
    // YouTube's toasts land a few seconds after the request; each sub-step waits
    // this long before the next starts, so a toast is credited to its own step.
    const SETTLE = 4000
    const toastsSince = (t) => (scanToasts(), toastsBetween(t))

    // A: 1.5.0 add (L8, Q1, Q6 timing)
    const a = await legacyAdd(res, SECOND_VIDEO)
    await L.sleep(SETTLE)
    const aToasts = toastsSince(a.t0)
    const paths = queueDataPaths(SECOND_VIDEO)
    out.push(E("L8", null, a.inDataMs != null ? "pass" : "fail", `${created ? `queue created (panel after ${created.tlpqPanelAfterMs} ms)` : "queue was open"}; appended video in panel data after ${a.inDataMs ?? ">5000"} ms, with its playlistSetVideoId after ${a.setIdMs ?? ">15000"} ms; at ${paths.map((f) => `${f.element} ${f.via}${f.paths[0]}`).join(" ; ") || "?"}`, { created, inDataMs: a.inDataMs, setVideoIdMs: a.setIdMs, foundIn: paths }))
    out.push(E("T29.Q1", "1.5.0 command, later add", "info", `toast after a later add: ${aToasts.join(" | ") || "none detected (watch the screen)"}; first add of a new queue: ${created ? created.firstAddToasts.join(" | ") || "none detected" : "queue was already open"}`, { laterAddToasts: aToasts, firstAddToasts: created?.firstAddToasts }))

    // B: quiet removal of that entry (Q2)
    let q2 = { run: false }
    if (a._entry && !a.selected) {
      const sid = a._entry.playlistSetVideoId
      const t = Date.now()
      const r = await resolveWithController(editCmd(listId, REMOVE(sid), "IAE%3D"), 500)
      refresh()
      const goneMs = await waitUntil(() => !qSetIds().has(sid), 5000, 250)
      await L.sleep(SETTLE)
      q2 = { run: true, ...r, goneFromPanel: goneMs != null, goneAfterRefreshMs: goneMs, toasts: toastsSince(t) }
    }
    out.push(E("T29.Q2", null, !q2.run ? "skip" : q2.goneFromPanel && !q2.toasts.length && q2.responseStatus === "STATUS_SUCCEEDED" ? "pass" : "fail", q2.run ? `quiet removal: callbacks ${q2.callbacks.join(",") || "none"}, status ${q2.responseStatus ?? "?"}, actions ${q2.responseActionKinds.join(",") || "none"}, HTTP ${q2.http.join(",") || "?"}; gone from panel ${q2.goneFromPanel}; toasts ${q2.toasts.join(" | ") || "none detected"}` : `our added entry never got a playlistSetVideoId${a.selected ? " (it is playing)" : ""}`, L.publicView(q2)))

    // C: add, then remove the moment its setVideoId shows (Q6 immediate undo)
    const c = await legacyAdd(res, SECOND_VIDEO)
    let q6 = { run: false }
    if (c._entry && !c.selected) {
      const sid = c._entry.playlistSetVideoId
      const r = await resolveWithController(editCmd(listId, REMOVE(sid), "IAE%3D"), 300)
      refresh()
      let goneMs = await waitUntil(() => !qSetIds().has(sid), 3000, 250)
      let retried = false
      if (goneMs == null) {
        retried = true
        await L.sleep(1500)
        await resolveWithController(editCmd(listId, REMOVE(sid), "IAE%3D"), 300)
        refresh()
        goneMs = await waitUntil(() => !qSetIds().has(sid), 4000, 250)
      }
      q6 = { run: true, setVideoIdAfterMs: c.setIdMs, immediateRemoveHttp: r.http, immediateRemoveStatus: r.responseStatus, callbacks: r.callbacks, gone: goneMs != null, retried }
    }
    await L.sleep(SETTLE)
    out.push(E("T29.Q6", null, q6.run ? "info" : "skip", q6.run ? `playlistSetVideoId appeared ${a.setIdMs ?? "?"} / ${c.setIdMs ?? "?"} ms after the add; an immediate quiet Undo got HTTP ${q6.immediateRemoveHttp.join(",") || "?"} (${q6.immediateRemoveStatus ?? "no callback"})${q6.retried ? `, needed a retry, gone: ${q6.gone}` : ""}` : "no entry to undo", { ...q6, toastsDuringAddAndUndo: toastsSince(c.t0) }))

    // D: add, then remove WITHOUT params (Q3: a toast should show)
    const d = await legacyAdd(res, SECOND_VIDEO)
    let q3 = { run: false }
    if (d._entry && !d.selected) {
      await L.sleep(SETTLE)
      const sid = d._entry.playlistSetVideoId
      const t = Date.now()
      const r = await resolveWithController(editCmd(listId, REMOVE(sid)), 500)
      refresh()
      const goneMs = await waitUntil(() => !qSetIds().has(sid), 5000, 250)
      await L.sleep(SETTLE)
      q3 = { run: true, ...r, goneFromPanel: goneMs != null, toasts: toastsSince(t) }
    }
    out.push(E("T29.Q3", null, !q3.run ? "skip" : q3.toasts.length ? "pass" : "fail", q3.run ? `removal without params: toasts ${q3.toasts.join(" | ") || "NONE detected: toast detection may be blind, check what you saw"}; status ${q3.responseStatus ?? "?"}, actions ${q3.responseActionKinds.join(",") || "none"}; gone ${q3.goneFromPanel}` : "no entry to remove", L.publicView(q3)))

    // E: quiet add (Q8), then quiet removal as cleanup
    await settleQueue()
    const before8 = qSetIds()
    const t8 = Date.now()
    const r8 = await resolveWithController(editCmd(listId, ADD(SECOND_VIDEO), "IAE%3D"), 500)
    const appearedMs = await waitUntil(() => [...qSetIds()].some((id) => !before8.has(id)), 5000, 250)
    await L.sleep(SETTLE)
    const toasts8 = toastsSince(t8)
    let cleaned = null
    const sid8 = r8._setVideoId || [...qSetIds()].find((id) => !before8.has(id))
    if (sid8) {
      await resolveWithController(editCmd(listId, REMOVE(sid8), "IAE%3D"), 300)
      refresh()
      cleaned = (await waitUntil(() => !qSetIds().has(sid8), 5000, 250)) != null
    }
    out.push(E("T29.Q8", null, r8.setVideoIdReturned && appearedMs != null && !toasts8.length ? "pass" : "fail", `quiet add: callbacks ${r8.callbacks.join(",") || "none"}, status ${r8.responseStatus ?? "?"}, setVideoId returned ${r8.setVideoIdReturned}, actions ${r8.responseActionKinds.join(",") || "none"}; in panel after ${appearedMs ?? ">5000"} ms; toasts ${toasts8.join(" | ") || "none detected"}; removed again ${cleaned}`, { ...L.publicView(r8), toasts: toasts8, appearedInPanelMs: appearedMs, removedAgain: cleaned }))

    // Q5: anything off after the quiet removals?
    await L.sleep(800)
    await settleQueue()
    const after = qEntries().length
    out.push(E("T29.Q5", "automatic part", after === countBefore && tlpqPanel()?.data?.playlistId === listId ? "info" : "fail", `panel entries ${countBefore} → ${after} (should match); same queue ${tlpqPanel()?.data?.playlistId === listId}; miniplayer active ${Boolean(document.querySelector("ytd-miniplayer")?.active)}. By hand: add another video, drag one, let it play on, close the miniplayer, and note anything odd`, { countBefore, countAfter: after }))
    return out
  })


  step("cleanup", WWW, { gated: true, ids: ["CLEANUP"] }, (ctx) => cleanupPlaylists(ctx, (path, body) => ctx.it(path, body)))

  step("afterDelete", WWW, { gated: true, ids: ["L1", "T12.2"] }, async (ctx) => {
    const gone = ctx.state.deletedVerified?.[0]
    const pid = gone || randomPlaylistId()
    const fail = await resolveEdit([ADD(L.TEST_VIDEO)], pid)
    const hand = await ctx.it("browse/edit_playlist", { playlistId: pid, actions: [ADD(L.TEST_VIDEO)] })
    const strip = ({ setVideoId, ...rest }) => rest
    return [
      E("L1", "failure", fail.callbacks.length && !fail.uiAppeared.length && !fail.navigated ? "pass" : "fail", `add to a ${gone ? "deleted" : "random (never existing)"} playlist via ${fail.resolver ?? "no resolver"}: callbacks ${fail.callbacks.join(",") || "none"}; UI ${fail.uiAppeared.join(",") || "none"}${fail.thrown ? `; threw: ${fail.thrown}` : ""}`, { target: gone ? "deleted probe playlist" : "random ID", ...strip(fail) }),
      E("T12.2", `${gone ? "deleted" : "random"} playlist, signed request`, "info", `${ctx.sum(hand).bodyStatus ?? ""} HTTP ${hand.status} ${ctx.sum(hand).error?.status ?? ""}`, editView(hand, ctx.sum(hand)))
    ]
  })

  async function cleanupPlaylists(ctx, send) {
    const list = ctx.state.playlists
    if (!list.length && !ctx.state.ownCreateLost) return [E("CLEANUP", null, "skip", "nothing to delete", {})]
    const results = []
    for (const p of list) {
      const r = await send("playlist/delete", { playlistId: p.playlistId })
      results.push({ how: p.how, status: r?.status ?? (r?.error ? "error" : "?"), error: r?.error?.status ?? r?.error })
    }
    // Verify: none of ours, and no probe-titled playlist, is listed any more.
    let remaining = []
    let lookupOk = true
    for (let i = 0; i < 4; i++) {
      await L.sleep(2000)
      const r = await send("playlist/get_add_to_playlist", { videoIds: [L.TEST_VIDEO], excludeWatchLater: false })
      const json = r?.json ?? r
      if (!json || r?.status >= 400) {
        lookupOk = false
        continue
      }
      lookupOk = true
      remaining = L.listedPlaylists(json).filter((p) => list.some((x) => x.playlistId === p.playlistId) || (typeof p.title === "string" && p.title.startsWith("ytpt probe")))
      if (!remaining.length) break
      for (const p of remaining) await send("playlist/delete", { playlistId: p.playlistId })
    }
    ctx.state.deletedVerified = lookupOk && !remaining.length ? list.map((p) => p.playlistId) : []
    const ok = lookupOk && !remaining.length
    return [
      E("CLEANUP", HOST, ok ? "pass" : "fail", ok ? `deleted ${list.length} probe playlist(s); none left` : `ACTION NEEDED: delete any playlist titled “ytpt probe – safe to delete…” by hand (${remaining.length} still listed)`, { deletes: results, stillListed: remaining.length, lookupOk })
    ]
  }

  // ---------- YouTube Music: reads ----------

  const fns = (obj, names) => names.filter((n) => typeof obj?.[n] === "function")

  step("ytmEntry", MUSIC, { ids: ["T25.ytm-entry-points"] }, async () => {
    const app = ytm.app()
    const q = ytm.queue()
    const row = document.querySelector("ytmusic-responsive-list-item-renderer, ytmusic-two-row-item-renderer")
    const probeItem = document.createElement("ytmusic-menu-service-item-renderer")
    const evidence = {
      ytmusicApp: Boolean(app),
      appMethods: fns(app, ["handleServiceEndpoint", "handleNavigationEndpoint", "handlePlaylistEditEndpoint", "handleCommandWithCommandHandler", "handleAddToToastAction", "navigate", "resolveCommand"]),
      networkManagerFetch: typeof app?.networkManager?.fetch,
      queueMethods: fns(q, ["getItems", "getCurrentItemIndex", "removeItem", "isEmpty"]),
      store: { dispatch: typeof ytm.store()?.dispatch, getState: typeof ytm.store()?.getState, rawStore: Boolean(ytm.store()?.store) },
      queueStateKeys: Object.keys(ytm.state()?.queue || {}),
      miniplayerFlag: Boolean(app?.hasAttribute?.("is-miniplayer-enabled")),
      classicLikeUpdateLikeStatus: typeof document.querySelector("ytmusic-player-bar #like-button-renderer")?.updateLikeStatus,
      wizLikeButton: Boolean(document.querySelector("like-button-view-model button")),
      detachedMenuItemBehaviour: typeof probeItem.ytmusicServiceMenuItemBehavior?.handleCommand,
      rowResolveCommand: row ? typeof row.resolveCommand : "no row",
      rowBehaviours: row ? Object.keys(row).filter((k) => /Behavior$/.test(k)).slice(0, 12) : []
    }
    const core = ["handleServiceEndpoint", "handleNavigationEndpoint", "handlePlaylistEditEndpoint"].every((m) => evidence.appMethods.includes(m)) && evidence.networkManagerFetch === "function"
    return [E("T25.ytm-entry-points", null, core ? "pass" : "fail", `app methods: ${evidence.appMethods.join(" ")}; networkManager.fetch ${evidence.networkManagerFetch}; queue: ${evidence.queueMethods.join(" ")}; menu-item behaviour on a detached element: ${evidence.detachedMenuItemBehaviour}`, evidence)]
  })

  step("ytmNowPlaying", MUSIC, { ids: ["M1"] }, async () => {
    const vid = ytm.videoId()
    const items = ytm.items()
    const cur = ytm.renderer(items[ytm.currentIndex() ?? -1])
    const ms = navigator.mediaSession?.metadata
    const isoMs = await safe(() => iso("mediaSession"))
    const progress = await safe(() => ytm.player()?.getProgressState?.(), null)
    const same = (a, b) => (a == null && b == null ? null : a === b)
    return [
      E("M1", "now playing (page read)", ms && isoMs.hasMetadata ? "pass" : vid ? "fail" : "skip", vid ? `player video id ${vid ? "read" : "missing"}; queue item matches player: ${cur ? cur.videoId === vid : "no item"}; mediaSession readable in isolated world: ${isoMs.hasMetadata ?? isoMs.error}` : "nothing playing: play a song and run again", {
        playerVideoId: Boolean(vid),
        getVideoDataKeys: Object.keys((await safe(() => ytm.player()?.getVideoData?.(), null)) || {}).sort().slice(0, 30),
        getProgressStateKeys: progress ? Object.keys(progress).sort() : null,
        queueCurrentMatchesPlayer: cur ? cur.videoId === vid : null,
        mediaSessionMain: { present: Boolean(ms), title: Boolean(ms?.title), artist: Boolean(ms?.artist), album: Boolean(ms?.album), artwork: ms?.artwork?.length ?? 0 },
        mediaSessionIsolated: { hasMediaSession: isoMs.hasMediaSession, hasMetadata: isoMs.hasMetadata, titleSame: same(ms?.title, isoMs.title), artistSame: same(ms?.artist, isoMs.artist), albumSame: same(ms?.album, isoMs.album), error: isoMs.error },
        videoElement: Boolean(ytm.player()?.querySelector("video"))
      })
    ]
  })

  step("ytmReads", MUSIC, { ids: ["M2", "T11.6"] }, async (ctx) => {
    if (typeof ytm.app()?.networkManager?.fetch !== "function") return [E("M2", "reads", "fail", "networkManager.fetch missing", {})]
    const vid = ytm.videoId() || ctx.videoId
    const t0 = Date.now()
    const { marker, url } = markerUrl("ytm-networkManager")
    const res = await nmCall("/navigation/resolve_url", { url })
    ctx.state.markers.push({ place: "own client: networkManager.fetch", marker })
    const gap = await nmCall("/playlist/get_add_to_playlist", { videoIds: [vid], excludeWatchLater: false })
    const menu = await nmCall("/account/account_menu", {})
    const handGap = await ctx.it("playlist/get_add_to_playlist", { videoIds: [vid], excludeWatchLater: false })
    const a = gap.json ? L.analyzeAddToPlaylist(gap.json) : null
    const labels = menu.json ? labelView(menu.json) : null
    const sumNm = (r) => ({ ...(r.json ? ctx.sum({ status: r.status ?? 200, json: r.json }) : {}), httpSeen: r.status, error: r.error })
    const membership = a?.oldShape ? !a.oldShape.containsSelectedVideosValues.every((v) => v === "<absent>") : a?.newShape ? a.newShape.entityCount > 0 : false
    return [
      E("M2", "reads", gap.json && menu.json ? "pass" : "fail", `get_add_to_playlist: ${gap.json ? `shape ${a.shape}, membership field ${membership ? "PRESENT" : "absent"}` : gap.error}; account_menu: ${menu.json ? "ok" : menu.error}; responses carry datasyncId: ${sumNm(res).responseHasDatasyncId ? "yes" : "no"}`, {
        resolveUrl: sumNm(res),
        getAddToPlaylist: { ...sumNm(gap), ...(a ? L.publicView(a) : {}) },
        getAddToPlaylistSignedRequestHttp: handGap.status,
        accountMenu: sumNm(menu),
        sinceMs: Date.now() - t0
      }),
      E("T11.6", "networkManager, music", labels?.accountName ? "pass" : "fail", labels ? `name ${labels.accountName}, @handle ${labels.channelHandle}, avatar ${labels.accountPhoto}` : "no account menu", labels || {})
    ]
  })

  const castReadout = () => {
    const st = ytm.state()
    const hits = []
    const walk = (v, path, depth) => {
      if (!v || typeof v !== "object" || depth > 5 || hits.length > 30) return
      for (const k of Object.keys(v)) {
        const x = v[k]
        if (/cast|remote|chromecast|presentation/i.test(k))
          hits.push({ path: `${path}.${k}`, type: Array.isArray(x) ? "array" : typeof x, value: typeof x === "boolean" || typeof x === "number" ? x : typeof x === "string" ? L.redactString(x) : x && typeof x === "object" ? `{${Object.keys(x).slice(0, 8).join(",")}}` : x })
        if (x && typeof x === "object" && !Array.isArray(x)) walk(x, `${path}.${k}`, depth + 1)
      }
    }
    walk(st, "state", 0)
    const player = ytm.player()
    const playerMethods = []
    if (player) for (const k in player) if (/cast|remote|presenting|mdx/i.test(k) && typeof player[k] === "function") playerMethods.push(k)
    const app = ytm.app()
    const appKeys = []
    if (app) for (const k in app) if (/cast|remote|mdx/i.test(k)) appKeys.push(`${k}:${typeof app[k]}`)
    return { storePaths: hits, playerMethods: playerMethods.slice(0, 20), appKeys: appKeys.slice(0, 20) }
  }

  step("ytmQueueRead", MUSIC, { ids: ["T26.2", "M5", "T26.3", "T26.6"] }, async () => {
    const items = ytm.items()
    const idx = ytm.currentIndex()
    const cur = ytm.renderer(items[idx ?? -1])
    const menuKeys = (r) =>
      (r?.menu?.menuRenderer?.items || []).map((i) => {
        const x = Object.values(i)[0] || {}
        const ep = x.serviceEndpoint ?? x.navigationEndpoint ?? x.defaultServiceEndpoint
        return `${x.icon?.iconType ?? x.defaultIcon?.iconType ?? "?"}:${Object.keys(ep || {}).find((k) => k !== "clickTrackingParams" && k !== "commandMetadata") ?? "?"}`
      })
    const playingMenu = menuKeys(cur)
    const selectedEl = document.querySelector("ytmusic-player-queue-item[selected], ytmusic-player-queue-item[play-button-state='playing'], ytmusic-player-queue-item[play-button-state='paused']")
    const elMenu = selectedEl ? menuKeys(selectedEl.data?.primaryRenderer?.playlistPanelVideoRenderer ?? selectedEl.data) : null
    const removeOffered = playingMenu.some((k) => k.endsWith(":removeFromQueueEndpoint"))
    const cast = castReadout()
    const ids = ytm.ids()
    const numeric = ids.filter((x) => typeof x === "number")
    const sequential = numeric.length > 1 ? numeric.every((v, i) => i === 0 || v === numeric[i - 1] + 1) : null
    const st = ytm.state()?.queue || {}
    const queueShape = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : v && typeof v === "object" ? "object" : typeof v === "string" ? L.redactString(v) : v]))
    const castFound = cast.storePaths.length > 0 || cast.playerMethods.length > 0
    return [
      E("T26.2", null, cur ? (removeOffered ? "pass" : "fail") : "skip", cur ? `playing item's menu ${removeOffered ? "offers" : "does NOT offer"} Remove from queue (menu: ${playingMenu.join(", ")})` : "nothing in the queue", { playingItemMenu: playingMenu, selectedElementMenu: elMenu }),
      E("M5", null, castFound ? "pass" : "fail", castFound ? `cast-related state readable: ${cast.storePaths.map((h) => `${h.path}=${JSON.stringify(h.value)}`).slice(0, 4).join("; ")}${cast.playerMethods.length ? `; player: ${cast.playerMethods.slice(0, 5).join(",")}` : ""}` : "no cast-related store key or player method found", cast),
      E("T26.3", null, castFound ? "info" : "fail", `store flags: ${cast.storePaths.map((h) => h.path).slice(0, 6).join(", ") || "none"}; whether the menu-item route forwards to a cast device: not tested (needs a live cast)`, cast),
      E("T26.6", "existing queue", sequential == null ? "skip" : sequential ? "pass" : "info", sequential == null ? "fewer than two queue items" : `queue item IDs ${sequential ? "are" : "are NOT"} sequential (${numeric.length} numeric of ${ids.length})`, { ids: ids.slice(0, 60), currentIndex: idx, queueStateShape: queueShape })
    ]
  })

  const ROW_TAGS = ["ytmusic-responsive-list-item-renderer", "ytmusic-two-row-item-renderer", "ytmusic-player-queue-item", "ytmusic-multi-row-list-item-renderer"]
  const ROW_CONTEXTS = new Set(["ytmusic-player-queue", "ytmusic-playlist-shelf-renderer", "ytmusic-shelf-renderer", "ytmusic-carousel-shelf-renderer", "ytmusic-grid-renderer", "ytmusic-immersive-carousel-shelf-renderer", "ytmusic-card-shelf-renderer", "ytmusic-tab-renderer", "ytmusic-section-list-renderer"])
  const scanRows = () => {
    const groups = {}
    let n = 0
    for (const el of document.querySelectorAll(ROW_TAGS.join(","))) {
      if (++n > 250) break
      let c = el.parentElement
      while (c && !ROW_CONTEXTS.has(c.tagName.toLowerCase())) c = c.parentElement
      const key = `${el.tagName.toLowerCase()} in ${c ? c.tagName.toLowerCase() : "?"}`
      const g = (groups[key] ||= { rows: 0, withData: 0, likeInData: 0, likeElement: 0, likeElementVisible: 0, saveToPlaylistItem: 0, likeToggleItem: 0, removeFromQueueItem: 0, menuItems: {} })
      g.rows++
      const data = el.data?.primaryRenderer?.playlistPanelVideoRenderer ?? el.data
      if (data) g.withData++
      const menu = data?.menu?.menuRenderer
      if (menu?.topLevelButtons?.some((b) => b.likeButtonRenderer)) g.likeInData++
      const likeEl = el.querySelector("ytmusic-like-button-renderer, like-button-view-model")
      if (likeEl) g.likeElement++
      if (likeEl && isVisible(likeEl)) g.likeElementVisible++
      for (const i of menu?.items || []) {
        const x = Object.values(i)[0] || {}
        const ep = x.serviceEndpoint ?? x.navigationEndpoint ?? x.defaultServiceEndpoint
        const k = Object.keys(ep || {}).find((q) => q !== "clickTrackingParams" && q !== "commandMetadata") ?? "?"
        const label = `${x.icon?.iconType ?? x.defaultIcon?.iconType ?? "?"}:${k}`
        g.menuItems[label] = (g.menuItems[label] || 0) + 1
        if (k === "addToPlaylistEndpoint") g.saveToPlaylistItem++
        if (k === "removeFromQueueEndpoint") g.removeFromQueueItem++
        if (x.defaultServiceEndpoint?.likeEndpoint || x.toggledServiceEndpoint?.likeEndpoint) g.likeToggleItem++
      }
    }
    return { pageKind: pathKind(), rowsScanned: Math.min(n, 250), groups }
  }

  step("ytmRows", MUSIC, { ids: ["T26.5"] }, async () => {
    const scan = scanRows()
    const withLike = Object.entries(scan.groups).filter(([, g]) => g.likeElement || g.likeInData).map(([k]) => k)
    const signedRows = Object.values(scan.groups).some((g) => g.saveToPlaylistItem) && Object.values(scan.groups).some((g) => g.likeToggleItem)
    return [
      E("T26.5", scan.pageKind, "info", `${scan.rowsScanned} rows; own like button on: ${withLike.join("; ") || "none"}`, scan),
      E("T25.ytm-signed-in-rows", scan.pageKind, signedRows ? "pass" : "info", `rows carry addToPlaylistEndpoint: ${Object.values(scan.groups).some((g) => g.saveToPlaylistItem)}; "Add to liked songs" likeEndpoint toggle: ${Object.values(scan.groups).some((g) => g.likeToggleItem)}`, {})
    ]
  })

  const anchorPath = (el) => {
    const chain = []
    for (let n = el; n && chain.length < 9 && n.tagName !== "YTMUSIC-APP"; n = n.parentElement) chain.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : ""))
    return chain.join(" > ")
  }

  step("ytmLikeAnchor", MUSIC, { ids: ["T26.8"] }, async () => {
    const app = ytm.app()
    const wiz = Boolean(app?.hasAttribute?.("is-miniplayer-enabled")) || Boolean(document.querySelector("ytmusic-miniplayer, ytmusic-wiz-player-controls"))
    const anchors = []
    for (const el of document.querySelectorAll("ytmusic-player-bar ytmusic-like-button-renderer, like-button-view-model, ytmusic-miniplayer ytmusic-like-button-renderer")) {
      const r = el.getBoundingClientRect()
      anchors.push({ path: anchorPath(el), visible: isVisible(el), rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, insideQueue: Boolean(el.closest("ytmusic-player-queue")), insideRow: Boolean(el.closest(ROW_TAGS.join(","))) })
    }
    const playerAnchors = anchors.filter((a) => !a.insideQueue && !a.insideRow)
    return [
      E("T26.8", wiz ? "Wiz miniplayer" : "classic player bar", playerAnchors.some((a) => a.visible) ? "pass" : "fail", `${wiz ? "Wiz miniplayer UI" : "classic player bar UI"}; like anchors outside rows: ${playerAnchors.map((a) => `${a.path}${a.visible ? "" : " (hidden)"}`).join(" | ") || "none"}`, { wizMiniplayer: wiz, playerBar: Boolean(document.querySelector("ytmusic-player-bar")), anchors: anchors.slice(0, 12) })
    ]
  })

  step("ytmLargeQueue", MUSIC, { ids: ["T26.7"] }, async () => {
    if (typeof ytm.app()?.networkManager?.fetch !== "function") return [E("T26.7", null, "fail", "networkManager.fetch missing", {})]
    const list = new URLSearchParams(location.search).get("list")
    const own = list && !/^RD/.test(list)
    const pid = own ? list : LARGE_PLAYLIST
    // No queueContextParams: a pure read that leaves this tab's queue alone.
    const r = await nmCall("/music/get_queue", { playlistId: pid })
    const n = r.json?.queueDatas?.length
    return [
      E("T26.7", own ? "playlist open in this tab" : "public 500-song playlist", n != null ? "info" : "fail", n != null ? `get_queue returned ${n} songs (signed-out baseline on 2026-10-19: 200 of 500)` : `failed: ${r.error}`, { playlist: own ? "the one open in this tab" : "public, 500 songs", returned: n, responseKeys: Object.keys(r.json || {}), continuationKeys: L.findKey(r.json, "continuation").length + L.findKey(r.json, "continuations").length, http: r.status })
    ]
  })

  // ---------- YouTube Music: writes (gated) ----------

  const queueAddReplay = async (videoId, position) => {
    const q = ytm.queue()
    const store = ytm.store()
    const state = store.getState().queue
    const body = { queueContextParams: state.queueContextParams, queueInsertPosition: position, videoIds: [videoId] }
    const response = await ytm.nm("/music/get_queue", body)
    if (response?.queueContextParams) store.dispatch({ type: "SET_QUEUE_CONTEXT_PARAMS", payload: response.queueContextParams })
    const items = (response?.queueDatas ?? []).map((d) => d.content)
    const index = position === "INSERT_AFTER_CURRENT_VIDEO" ? q.getCurrentItemIndex() + 1 : q.getItems().length
    store.dispatch({ type: "ADD_ITEMS", payload: { nextQueueItemId: state.nextQueueItemId, index, items, shouldAssignIds: true } })
    return { itemsReturned: items.length, insertedAtIndex: index }
  }
  const menuItemBehaviour = () => {
    const el = document.createElement("ytmusic-menu-service-item-renderer")
    let b = el.ytmusicServiceMenuItemBehavior
    let attached = false
    if (!b) {
      el.hidden = true
      ytm.app().appendChild(el)
      attached = true
      b = el.ytmusicServiceMenuItemBehavior
    }
    return { el, b, attached }
  }
  const automixView = () => {
    const st = ytm.state()?.queue || {}
    const out = {}
    for (const [k, v] of Object.entries(st)) if (/automix|autoplay|suggest/i.test(k)) out[k] = Array.isArray(v) ? `array(${v.length})` : typeof v === "object" && v ? "object" : v
    out.domQueueItems = document.querySelectorAll("ytmusic-player-queue #contents > ytmusic-player-queue-item, ytmusic-player-queue #contents > *").length
    out.domAutomixItems = document.querySelectorAll("ytmusic-player-queue #automix-contents > *").length
    return out
  }
  /** Runs one queue insert, measures where it landed, then removes what it added. */
  const queueTrial = async (label, run) => {
    const before = ytm.ids()
    const len = before.length
    const cur = ytm.currentIndex()
    const t0 = Date.now()
    const w = await watchUi(run, 300)
    let after = ytm.ids()
    while (after.length <= len && Date.now() - t0 < 10000) {
      await L.sleep(200)
      after = ytm.ids()
    }
    const newIds = after.filter((id) => !before.includes(id))
    const positions = newIds.map((id) => after.indexOf(id))
    const maxBefore = Math.max(-1, ...before.filter((x) => typeof x === "number"))
    // Sequential: numeric, consecutive among themselves, and above every existing ID
    // (a counter keeps running across removals, so a gap after maxBefore is expected).
    const sequential = newIds.length ? newIds.every((id, i) => typeof id === "number" && id > maxBefore && (i === 0 || id === newIds[i - 1] + 1)) : null
    const gapAfterHighest = newIds.length && typeof newIds[0] === "number" ? newIds[0] - maxBefore : null
    const ui = uiDiff({}, uiSnapshot())
    const automix = automixView()
    const newItemFields = queueFields(ytm.items().filter((e) => newIds.includes(ytm.renderer(e)?.navigationEndpoint?.watchEndpoint?.index)))
    const removed = []
    for (const id of newIds) removed.push(await safe(async () => (ytm.queue().removeItem(String(id)), "ok"), "error"))
    await L.sleep(600)
    const restored = ytm.ids().length === len
    return {
      label,
      returned: w.value,
      thrown: w.thrown,
      grewBy: after.length - len,
      msToGrow: after.length > len ? Date.now() - t0 : null,
      lengthBefore: len,
      currentIndex: cur,
      insertedAt: positions,
      landedRightAfterCurrent: positions.length ? positions[0] === cur + 1 : null,
      landedAtEnd: positions.length ? positions.at(-1) === after.length - 1 : null,
      newIds,
      newIdsSequential: sequential,
      gapAfterHighestExistingId: gapAfterHighest,
      uiVisibleAfter: ui,
      uiAppeared: w.appeared,
      automix,
      newItemFields,
      removed,
      restoredLength: restored
    }
  }

  // ---------- ticket 28: moving a queued song ----------

  /** Per queue entry: the three fields the server-side move needs (booleans and an ID kind only). */
  const queueFields = (items) =>
    items.map((e) => {
      const r = ytm.renderer(e)
      const ep = r?.navigationEndpoint?.watchEndpoint
      const pid = ep?.playlistId
      return {
        playlistEditParams: Boolean(r?.playlistEditParams),
        playlistSetVideoId: Boolean(ep?.playlistSetVideoId),
        playlistIdKind: pid ? pid.match(/^(RDAMVM|RDAMPL|RDCLAK|RDEM|RDTMAK|RD|OLAK5uy_|PL|VL|LM|TLPQ)/)?.[1] ?? "other" : "none",
        selected: Boolean(r?.selected)
      }
    })
  const fieldsSummary = (f) => ({
    items: f.length,
    allThree: f.filter((x) => x.playlistEditParams && x.playlistSetVideoId && x.playlistIdKind !== "none").length,
    missingEditParams: f.filter((x) => !x.playlistEditParams).length,
    missingSetVideoId: f.filter((x) => !x.playlistSetVideoId).length,
    playlistIdKinds: L.uniq(f.map((x) => x.playlistIdKind))
  })
  const queuePanel = () => document.querySelector("ytmusic-player-queue#queue") || document.querySelector("ytmusic-player-queue")
  const entryId = (e) => String(ytm.renderer(e)?.navigationEndpoint?.watchEndpoint?.index)
  /** Research §3.1: fire the panel's own drop event with a stand-in element. */
  const moveTo = (id, to) => {
    const panel = queuePanel()
    if (!panel) return "no queue panel"
    const items = panel.data
    if (!Array.isArray(items)) return "panel.data is not an array"
    if (items !== ytm.state()?.queue?.items) return "panel.data is stale"
    const from = items.findIndex((e) => entryId(e) === id)
    if (from < 0) return "not in the queue"
    if (from === ytm.currentIndex()) return "that's the playing song"
    if (to === from) return "already there"
    const parent = document.createElement("div")
    for (let i = 0; i <= to; i++) parent.append(document.createElement("div"))
    const dragEl = parent.children[to]
    dragEl.data = items[from].playlistPanelVideoRenderer ?? items[from].playlistPanelVideoWrapperRenderer
    panel.dispatchEvent(new CustomEvent("ytmusic-reorderable-list-drop", { detail: { dragEl }, bubbles: true, composed: true }))
    return entryId(ytm.items()[to]) === id ? "moved" : "NOT moved"
  }
  const localOrder = () => ytm.items().map((e) => ytm.renderer(e)?.videoId)
  const serverOrder = async () => {
    const res = await ytm.nm("/next", { watchNextType: "WATCH_NEXT_TYPE_GET_QUEUE", queueContextParams: ytm.state()?.queue?.queueContextParams })
    const list = L.findKey(res, "playlistPanelRenderer")[0]?.value
    return (list?.contents ?? []).map((e) => ytm.renderer(e)?.videoId).filter(Boolean)
  }
  const compareOrders = (server, local) => {
    if (!Array.isArray(server)) return { readable: false }
    const n = Math.min(server.length, local.length)
    let firstMismatch = null
    for (let i = 0; i < n; i++)
      if (server[i] !== local[i]) {
        firstMismatch = i
        break
      }
    return { readable: true, serverLength: server.length, localLength: local.length, samePrefix: firstMismatch === null, firstMismatch, comparedUpTo: n }
  }
  /** A comparison only means something if the server's list reaches the moved position. */
  const covers = (cmp, index) => Boolean(cmp?.readable && cmp.comparedUpTo > index)
  const domMatchesStore = () => {
    const panel = queuePanel()
    const els = panel ? [...panel.querySelectorAll("ytmusic-player-queue-item, ytmusic-playlist-panel-video-wrapper-renderer > ytmusic-player-queue-item")] : []
    const domIds = els.map((el) => (el.data?.primaryRenderer?.playlistPanelVideoRenderer ?? el.data)?.videoId).filter(Boolean)
    const local = localOrder()
    return { domItems: domIds.length, matchesStorePrefix: domIds.length ? domIds.every((v, i) => v === local[i]) : null }
  }
  const panelContext = () => {
    const panel = queuePanel()
    const tabs = [...document.querySelectorAll("ytmusic-player-page tp-yt-paper-tab")]
    const layout = document.querySelector("ytmusic-app-layout")
    return {
      panelExists: Boolean(panel),
      customElementDefined: Boolean(customElements.get("ytmusic-player-queue")),
      panelQueueIsAppQueue: panel ? panel.queue === ytm.queue() : null,
      panelDataIsStoreItems: panel ? panel.data === ytm.state()?.queue?.items : null,
      onDrop: typeof panel?.onDrop,
      playerState: call0(() => ytm.player()?.getPlayerState?.()),
      somethingLoaded: Boolean(ytm.videoId()),
      playerPageVisible: isVisible(document.querySelector("ytmusic-player-page") || document.createElement("i")),
      layoutPlayerAttributes: layout ? [...layout.attributes].map((a) => a.name).filter((n) => /player/i.test(n)) : [],
      selectedPlayerTab: tabs.findIndex((t) => t.getAttribute("aria-selected") === "true"),
      playerTabs: tabs.length,
      wizMiniplayer: Boolean(ytm.app()?.hasAttribute?.("is-miniplayer-enabled"))
    }
  }
  const call0 = (fn) => {
    try {
      return fn()
    } catch {
      return undefined
    }
  }
  const moveRequests = (seen) =>
    seen.filter((s) => (s.bodyActions || []).some((a) => a.action === "ACTION_MOVE_VIDEO_AFTER")).map((s) => ({ status: s.statusCode, actions: s.bodyActions, msAfter: s.t }))

  step("ytmQueueWrite", MUSIC, { gated: true, ids: ["M1", "T26.1", "T26.6"] }, async () => {
    const q = ytm.queue()
    if (!q || typeof q.isEmpty !== "function") return [E("M1", "queue", "fail", "app.queue missing", {})]
    if (q.isEmpty()) return [E("M1", "queue", "skip", "queue is empty: play a song first (an empty queue makes these actions start playback)", {})]
    const vid = ytm.videoId()
    if (!vid) return [E("M1", "queue", "skip", "no playing video id", {})]
    const trials = []
    trials.push(await queueTrial("replay Add to queue", () => queueAddReplay(vid, "INSERT_AT_END")))
    trials.push(await queueTrial("replay Play next", () => queueAddReplay(vid, "INSERT_AFTER_CURRENT_VIDEO")))
    const mi = menuItemBehaviour()
    const viaMenu = (position) => () => {
      if (typeof mi.b?.handleCommand !== "function") throw new Error("no ytmusicServiceMenuItemBehavior.handleCommand")
      // commands (the toast) stripped, as ticket 10 specifies
      return mi.b.handleCommand({ queueAddEndpoint: { queueTarget: { videoId: vid, onEmptyQueue: { watchEndpoint: { videoId: vid } } }, queueInsertPosition: position } })
    }
    trials.push(await queueTrial("menu item Add to queue", viaMenu("INSERT_AT_END")))
    trials.push(await queueTrial("menu item Play next", viaMenu("INSERT_AFTER_CURRENT_VIDEO")))
    if (mi.attached) mi.el.remove()
    const t = Object.fromEntries(trials.map((x) => [x.label, x]))
    const fmt = (x) => `${x.grewBy > 0 ? `+${x.grewBy} at ${x.insertedAt.join(",")}` : `no growth${x.thrown ? ` (${x.thrown})` : ""}`}; UI ${x.uiAppeared.join(",") || "none"}; restored ${x.restoredLength}`
    const menuOk = t["menu item Add to queue"].grewBy > 0 && t["menu item Play next"].grewBy > 0 && !t["menu item Add to queue"].uiAppeared.length && !t["menu item Play next"].uiAppeared.length
    const replayOk = t["replay Add to queue"].grewBy > 0 && t["replay Play next"].grewBy > 0
    const ma = t["menu item Add to queue"]
    const seqAll = trials.filter((x) => x.newIdsSequential != null)
    return [
      E("M1", "menu item", menuOk ? "pass" : "fail", `Add to queue: ${fmt(ma)} · Play next: ${fmt(t["menu item Play next"])}; detached element had the behaviour: ${!mi.attached}; cast forwarding: not tested`, { menuItemOnDetachedElement: !mi.attached, addToQueue: ma, playNext: t["menu item Play next"] }),
      E("M1", "queue replay", replayOk ? "pass" : "fail", `Add to queue: ${fmt(t["replay Add to queue"])} · Play next: ${fmt(t["replay Play next"])}`, { addToQueue: t["replay Add to queue"], playNext: t["replay Play next"] }),
      E("T26.1", null, ma.grewBy > 0 ? "info" : "fail", ma.grewBy > 0 ? `YouTube Music's own Add to queue landed at index ${ma.insertedAt.join(",")} of ${ma.lengthBefore + ma.grewBy} (at end of items: ${ma.landedAtEnd}); autoplay state: ${JSON.stringify(ma.automix)}` : "menu-item Add to queue didn't insert", { menuItem: ma.automix, replay: t["replay Add to queue"].automix, replayInsertedAt: t["replay Add to queue"].insertedAt, menuInsertedAt: ma.insertedAt }),
      E("T28.1", "inserted items", trials.some((x) => x.newItemFields.length) ? (trials.every((x) => x.newItemFields.every((f) => f.playlistEditParams && f.playlistSetVideoId && f.playlistIdKind !== "none")) ? "pass" : "fail") : "skip", trials.map((x) => `${x.label}: ${x.newItemFields.length ? JSON.stringify(fieldsSummary(x.newItemFields)) : "no new items"}`).join(" · "), Object.fromEntries(trials.map((x) => [x.label, fieldsSummary(x.newItemFields)]))),
      E("T26.6", "after ADD_ITEMS", seqAll.length ? (seqAll.every((x) => x.newIdsSequential) ? "pass" : "info") : "skip", seqAll.length ? `new IDs increasing and above every existing ID: ${seqAll.map((x) => `${x.label} ${x.newIdsSequential} (gap ${x.gapAfterHighestExistingId})`).join("; ")}` : "no inserts measured", { trials: trials.map((x) => ({ label: x.label, newIds: x.newIds, sequential: x.newIdsSequential, gapAfterHighestExistingId: x.gapAfterHighestExistingId })) })
    ]
  })

  const likeStateOf = async (vid) => {
    const store = ytm.state()?.likeStatus?.videos?.[vid]
    let server
    try {
      const next = await ytm.nm("/next", { videoId: vid })
      server = L.findKey(next, "likeButtonRenderer").map((f) => f.value).find((r) => r?.target?.videoId === vid)?.likeStatus
    } catch {}
    return {
      store,
      server,
      classic: document.querySelector("ytmusic-player-bar ytmusic-like-button-renderer")?.getAttribute("like-status") ?? undefined,
      wizPressed: document.querySelector("ytmusic-player-bar like-button-view-model button, ytmusic-miniplayer like-button-view-model button, ytmusic-wiz-player-controls like-button-view-model button")?.getAttribute("aria-pressed") ?? undefined
    }
  }

  step("ytmLike", MUSIC, { gated: true, ids: ["M3"] }, async (ctx) => {
    const app = ytm.app()
    const vid = ytm.videoId()
    if (!ctx.loggedIn) return [E("M3", null, "skip", "signed out: likes need an account", {})]
    if (!vid) return [E("M3", null, "skip", "nothing playing: play a song you have NOT liked, then run", {})]
    if (typeof app?.handleServiceEndpoint !== "function") return [E("M3", null, "fail", "handleServiceEndpoint missing", {})]
    const before = await likeStateOf(vid)
    const known = before.server ?? before.store
    if (known !== "INDIFFERENT" || (before.store != null && before.store !== "INDIFFERENT"))
      return [E("M3", null, "skip", known ? `the playing song is already ${known}: play one you haven't liked so the probe can restore it exactly` : "couldn't read the playing song's like state, so the probe won't touch it", { before })]
    const t0 = Date.now()
    const like = await watchUi(() => app.handleServiceEndpoint({ likeEndpoint: { status: "LIKE", target: { videoId: vid } } }), 2500)
    const afterLike = await likeStateOf(vid)
    const t1 = Date.now()
    const unlike = await watchUi(() => app.handleServiceEndpoint({ likeEndpoint: { status: "INDIFFERENT", target: { videoId: vid } } }), 2500)
    let afterUnlike = await likeStateOf(vid)
    let retried = false
    if ((afterUnlike.server ?? afterUnlike.store) === "LIKE" || afterUnlike.store === "LIKE") {
      retried = true
      app.handleServiceEndpoint({ likeEndpoint: { status: "INDIFFERENT", target: { videoId: vid } } })
      await L.sleep(2500)
      afterUnlike = await likeStateOf(vid)
    }
    const likeReq = await seenRequests(t0, ["like/like", "like/removelike", "like/dislike"])
    // The server's answer decides; the store only shows what the page believes.
    const restored = (afterUnlike.server ?? afterUnlike.store) === "INDIFFERENT" && (afterUnlike.store ?? "INDIFFERENT") === "INDIFFERENT"
    const stuck = afterLike.server != null ? afterLike.server === "LIKE" : afterLike.store === "LIKE"
    return [
      E("M3", null, !restored ? "fail" : stuck && !like.appeared.length ? "pass" : "fail", `${restored ? "" : "ACTION NEEDED: unlike the playing song by hand. "}like: server ${afterLike.server ?? "?"}, store ${afterLike.store ?? "?"}, classic button ${afterLike.classic ?? "-"}, Wiz pressed ${afterLike.wizPressed ?? "-"}, UI ${like.appeared.join(",") || "none"}; unlike: server ${afterUnlike.server ?? "?"}${retried ? " (retried)" : ""}, UI ${unlike.appeared.join(",") || "none"}`, {
        before,
        afterLike,
        afterUnlike,
        likeUi: like.appeared,
        unlikeUi: unlike.appeared,
        thrown: like.thrown || unlike.thrown,
        requestsSeen: likeReq.map((r) => ({ path: r.path, status: r.statusCode, msAfterStart: r.t - t0, afterUnlikeStarted: r.t >= t1 }))
      })
    ]
  })

  step("ytmSave", MUSIC, { gated: true, ids: ["M2", "T12.1", "T26.4"] }, async (ctx) => {
    if (typeof ytm.app()?.networkManager?.fetch !== "function") return [E("M2", "writes", "fail", "networkManager.fetch missing", {})]
    if (!ctx.loggedIn) return [E("M2", "writes", "skip", "signed out", {})]
    const vid = ytm.videoId() || L.TEST_VIDEO
    // Leftovers from an earlier run.
    const list = await nmCall("/playlist/get_add_to_playlist", { videoIds: [vid], excludeWatchLater: false })
    for (const p of L.probeLeftovers(list.json)) await nmCall("/playlist/delete", { playlistId: p.playlistId })
    const created = await nmCall("/playlist/create", { title: L.PLAYLIST_TITLE, privacyStatus: "PRIVATE", videoIds: [vid] })
    let pid = created.json?.playlistId
    const createView = { ...(created.json ? ctx.sum({ status: created.status ?? 200, json: created.json }) : {}), error: created.error, playlistIdReturned: Boolean(pid), responseKeys: Object.keys(created.json || {}), engagementPanelGate: L.findKey(created.json, "showEngagementPanelEndpoint").length > 0 }
    if (!pid) return [E("M2", "create", "fail", `networkManager create returned no playlistId (${createView.engagementPanelGate ? "feature-enablement gate" : createView.error ?? createView.responseKeys.join(",")})`, createView)]
    ctx.state.playlists.push({ playlistId: pid, how: "networkManager create" })
    const createdAt = Date.now()
    // Duplicate: the song is already in the new playlist.
    const dup = await nmCall("/browse/edit_playlist", { playlistId: pid, actions: [ADD(vid)] })
    const dupView = { ...editView({ json: dup.json }, dup.json ? ctx.sum({ status: dup.status ?? 200, json: dup.json }) : {}), error: dup.error, http: dup.status }
    // Another song, retrying while the new playlist is locked.
    const attempts = []
    let set
    for (let i = 0; i < 9 && !set; i++) {
      const r = await nmCall("/browse/edit_playlist", { playlistId: pid, actions: [ADD(L.TEST_VIDEO)] })
      attempts.push({ msAfterCreate: Date.now() - createdAt, http: r.status, bodyStatus: r.json?.status, error: r.error })
      set = addedSetVideoId(r.json)
      if (!set) await L.sleep(3500)
    }
    let undo = null
    if (set) {
      const u = await nmCall("/browse/edit_playlist", { playlistId: pid, actions: [REMOVE(set)] })
      undo = { bodyStatus: u.json?.status, http: u.status, error: u.error }
    }
    // T26.4: YouTube Music's own playlist-edit handler.
    const setEvents = []
    const onSet = (e) => setEvents.push(Boolean(e?.detail))
    document.addEventListener("ytmusic-update-set-video-id", onSet, true)
    const t0 = Date.now()
    const h = await watchUi(() => ytm.app().handlePlaylistEditEndpoint({ playlistEditEndpoint: { playlistId: pid, actions: [ADD(SECOND_VIDEO)] } }), 2500)
    document.removeEventListener("ytmusic-update-set-video-id", onSet, true)
    const hSeen = await seenRequests(t0, ["browse/edit_playlist"])
    const dupAnyway = dupView.bodyShape && JSON.stringify(dupView.bodyShape).match(/DEDUPE|dedupe/)
    return [
      E("M2", "writes", set ? "pass" : "fail", `create ok; duplicate add: ${dupView.bodyStatus ?? dupView.error ?? `HTTP ${dupView.http}`}; add other song: ${set ? `ok after ${attempts.at(-1).msAfterCreate} ms` : "FAILED"}; undo by setVideoId: ${undo?.bodyStatus ?? undo?.error ?? "not run"}`, { create: createView, duplicate: dupView, addAttempts: attempts, undo }),
      E("T12.1", "music", "info", `duplicate add returns ${dupView.bodyStatus ?? dupView.error ?? `HTTP ${dupView.http}`}; actions: ${dupView.actionKinds?.join(",") || "none"}; "add anyway"/dedupe option in reply: ${dupAnyway ? "yes" : "no"}`, dupView),
      E("T26.4", null, "info", `handlePlaylistEditEndpoint: UI ${h.appeared.join(",") || "none (no toast)"}; returned ${typeof h.value}; set-video-id events ${setEvents.length}; request HTTP ${hSeen.map((s) => s.statusCode).join(",") || "?"}`, { uiAppeared: h.appeared, thrown: h.thrown, returned: typeof h.value, setVideoIdEvents: setEvents.length, requestsSeen: hSeen })
    ]
  })

  step("ytmCleanup", MUSIC, { gated: true, ids: ["CLEANUP"] }, (ctx) =>
    cleanupPlaylists(ctx, async (path, body) => {
      const r = await nmCall(`/${path}`, body)
      return r.json ? { status: r.status ?? 200, json: r.json } : { status: r.status ?? 0, error: r.error }
    })
  )

  // ---------- ticket 28: moving a queued song (YouTube Music) ----------

  step("ytmMoveRead", MUSIC, { ids: ["T28.1", "T28.2", "T28.6", "T28.5"] }, async () => {
    const fields = queueFields(ytm.items())
    const sum = fieldsSummary(fields)
    const seen = await seenRequests(loadedAt, ["browse/edit_playlist"])
    const manual = moveRequests(seen)
    const ctxNow = panelContext()
    const out = [
      E("T28.1", "queue now", sum.items ? (sum.allThree === sum.items ? "pass" : "fail") : "skip", sum.items ? `${sum.allThree} of ${sum.items} entries carry playlistEditParams + playlistSetVideoId + playlistId (kinds ${sum.playlistIdKinds.join(",")}); missing editParams ${sum.missingEditParams}` : "queue is empty", sum),
      E("T28.2", null, manual.length ? "info" : "skip", manual.length ? `saw ${manual.length} move request(s) from your drag: HTTP ${manual.map((m) => m.status).join(",")}; action fields ${JSON.stringify(manual[0].actions.find((a) => a.action === "ACTION_MOVE_VIDEO_AFTER")?.fields)}` : "no manual drag seen since this page loaded: drag one queue song by hand, then run again", { moveRequests: manual }),
      E("T28.6", `${ctxNow.somethingLoaded ? "loaded" : "nothing loaded"}, player page ${ctxNow.playerPageVisible ? "open" : "closed"}, tab ${ctxNow.selectedPlayerTab}`, ctxNow.panelExists && ctxNow.panelQueueIsAppQueue && ctxNow.panelDataIsStoreItems && ctxNow.onDrop === "function" ? "pass" : "fail", `panel ${ctxNow.panelExists}, panel.queue === app.queue ${ctxNow.panelQueueIsAppQueue}, panel.data is the store's items ${ctxNow.panelDataIsStoreItems}, onDrop ${ctxNow.onDrop}; Wiz ${ctxNow.wizMiniplayer}`, ctxNow)
    ]
    if (state.lastMove) {
      const ids = ytm.items().map(entryId)
      const i = ids.indexOf(state.lastMove.id)
      out.push(E("T28.5", "follow-up", i < 0 ? "info" : ids[i - 1] === state.lastMove.predecessor ? "pass" : "fail", i < 0 ? "the moved song has left the queue (played or removed)" : `moved song ${ids[i - 1] === state.lastMove.predecessor ? "still follows" : "NO LONGER follows"} the song it was put after; queue grew ${ids.length - state.lastMove.length}, playing index moved ${(ytm.currentIndex() ?? 0) - state.lastMove.cur}`, { minutesSinceMove: Math.round((Date.now() - state.lastMove.at) / 60000) }))
    }
    return out
  })

  step("ytmMoves", MUSIC, { gated: true, ids: ["T28.1", "T28.3", "T28.4", "T28.5", "T28.7"] }, async () => {
    const items = ytm.items()
    const cur = ytm.currentIndex()
    if (items.length < 3 || cur == null || cur < 0) return [E("T28.3", null, "skip", "need a queue of 3+ songs with one playing", {})]
    const playBefore = { state: call0(() => ytm.player()?.getPlayerState?.()), time: call0(() => ytm.player()?.getCurrentTime?.()) }
    const trials = []
    const candidates = [
      ["after the playing song", items.length - 1 > cur + 1 ? items.length - 1 : null],
      ["before the playing song", cur > 0 ? 0 : null]
    ]
    for (const [label, idx] of candidates) {
      if (idx == null) {
        trials.push({ label, skipped: "no such entry" })
        continue
      }
      const id = entryId(ytm.items()[idx])
      const c = ytm.currentIndex()
      const t0 = Date.now()
      const nextTo = idx > c ? c + 1 : c
      const nextResult = moveTo(id, nextTo)
      await L.sleep(500)
      const repaintNext = domMatchesStore()
      await L.sleep(1500)
      const serverAfterNext = compareOrders(await safe(serverOrder, null), localOrder())
      const endResult = moveTo(id, ytm.items().length - 1)
      await L.sleep(500)
      const repaintEnd = domMatchesStore()
      const backResult = moveTo(id, idx)
      await L.sleep(1500)
      const seen = await seenRequests(t0, ["browse/edit_playlist"])
      const serverAfterBack = compareOrders(await safe(serverOrder, null), localOrder())
      trials.push({ label, fromIndex: idx, nextTo, nextResult, repaintNext, serverAfterNext, serverCoversMove: covers(serverAfterNext, Math.max(idx, nextTo)), endResult, repaintEnd, backResult, serverAfterBack, moveRequests: moveRequests(seen) })
    }
    // Store-only MOVE_ITEM (the rejected route): does the server follow it? Undone locally afterwards.
    let storeOnly = null
    const store = ytm.store()
    const n = ytm.items().length
    const c2 = ytm.currentIndex()
    if (store && n - 1 > c2 + 1) {
      const from = n - 1
      const to = c2 + 1
      store.dispatch({ type: "MOVE_ITEM", payload: { fromIndex: from, toIndex: to } })
      await L.sleep(1500)
      const cmp = compareOrders(await safe(serverOrder, null), localOrder())
      store.dispatch({ type: "MOVE_ITEM", payload: { fromIndex: to, toIndex: from } })
      storeOnly = { serverFollowedStoreOnlyMove: covers(cmp, from) ? cmp.samePrefix : null, compare: cmp }
    }
    const playAfter = { state: call0(() => ytm.player()?.getPlayerState?.()), time: call0(() => ytm.player()?.getCurrentTime?.()) }
    // T28.5: in a radio, leave one move in place so a later run can check it survived skips.
    const kinds = fieldsSummary(queueFields(ytm.items())).playlistIdKinds
    let radioMove = null
    if (kinds.some((k) => k.startsWith("RD"))) {
      const its = ytm.items()
      const cc = ytm.currentIndex()
      if (its.length - 1 > cc + 1) {
        const id = entryId(its[its.length - 1])
        const r = moveTo(id, cc + 1)
        if (r === "moved") {
          state.lastMove = { id, predecessor: entryId(ytm.items()[cc]), at: Date.now(), length: ytm.items().length, cur: cc }
          radioMove = "moved the last queue song to play next and LEFT it there; skip two songs, then run again for T28.5"
        } else radioMove = r
      }
    }
    const ok = trials.filter((t) => !t.skipped)
    const allMoved = ok.length && ok.every((t) => t.nextResult === "moved" && (t.backResult === "moved" || t.backResult === "already there"))
    const serverMatches = ok.length && ok.every((t) => t.serverCoversMove && t.serverAfterNext.samePrefix)
    return [
      E("T28.3", null, allMoved && ok.every((t) => t.moveRequests.length) ? "pass" : "fail", ok.map((t) => `${t.label}: next ${t.nextResult}, end ${t.endResult}, back ${t.backResult}, repaint ${t.repaintNext.matchesStorePrefix}, move requests ${t.moveRequests.map((m) => m.status).join(",") || "none"}`).join(" · ") || "no movable entries", { trials, cast: castReadout() }),
      E("T28.4", null, serverMatches && storeOnly?.serverFollowedStoreOnlyMove === false ? "pass" : serverMatches ? "info" : "fail", `server order matches tab after our move: ${ok.map((t) => (t.serverCoversMove ? t.serverAfterNext.samePrefix : `inconclusive (server list ${t.serverAfterNext.serverLength ?? "unreadable"} long)`)).join(",")}; server followed a store-only MOVE_ITEM: ${storeOnly ? storeOnly.serverFollowedStoreOnlyMove ?? `inconclusive (server list ${storeOnly.compare.serverLength ?? "unreadable"} long)` : "not run"}; playback state ${playBefore.state}→${playAfter.state}`, { trials: ok.map((t) => ({ label: t.label, afterNext: t.serverAfterNext, afterBack: t.serverAfterBack })), storeOnly, playBefore: { state: playBefore.state }, playAfter: { state: playAfter.state, timeAdvanced: playAfter.time > playBefore.time } }),
      E("T28.5", "setup", radioMove ? "info" : "skip", radioMove || "not a radio queue (start a radio: a song's ⋮ → Start radio, then run with writes)", {}),
      E("T28.7", null, "skip", "only if you cast: start casting from Chrome, then run with writes and check the TV's queue", { castReadout: castReadout() })
    ]
  })

  // ---------- ticket 07: when a video counts as watched ----------

  step("watched", WWW, { ids: ["T07.1", "T07.2", "T07.3", "T07.4", "T07.5", "T07.6", "T07.7", "T07.8", "T07.9"] }, async () => {
    const w = globalThis.__ytptPlayerWatch?.summary?.()
    if (!w) return [E("T07.1", null, "error", "player watcher not loaded", {})]
    const out = []
    const adEvents = w.events.filter((e) => e.type === "onAdStart" || e.type === "onAdEnd")
    if (!w.adSamples.length && !adEvents.length) out.push(E("T07.1", null, "skip", "no ad seen since this page loaded: play videos until a pre-roll ad shows, then run", { apiListenersAttached: w.apiListenersAttached }))
    else {
      const s = w.adSamples
      const reportsVideo = s.length ? s.every((x) => x.playerApi.getVideoDataMatchesUrl !== false) : null
      const durDiffers = s.some((x) => x.video.duration != null && x.playerApi.getDuration != null && Math.abs(x.video.duration - x.playerApi.getDuration) > 1)
      out.push(E("T07.1", null, "info", `${s.length} samples during ads; onAdStart ${adEvents.some((e) => e.type === "onAdStart")}, onAdEnd ${adEvents.some((e) => e.type === "onAdEnd")}; getVideoData is the video: ${reportsVideo}; <video>.duration ≠ getDuration(): ${durDiffers}; presenting types ${L.uniq(s.map((x) => x.playerApi.getPresentingPlayerType)).join(",")}; classes ${L.uniq(s.flatMap((x) => x.classes)).join(",")}`, { adSamples: s.slice(0, 15), adEvents, apiListenersAttached: w.apiListenersAttached }))
    }
    out.push(w.stitched.length ? E("T07.2", null, "info", `${w.stitched.length} videos checked; SSAP/SSDAI in stats: ${w.stitched.filter((x) => x.ssapOrSsdai).length}; getDuration − lengthSeconds: ${L.uniq(w.stitched.map((x) => x.durationMinusLengthSec)).slice(0, 8).join(", ")}`, { stitched: w.stitched }) : E("T07.2", null, "skip", "no watch-page video checked yet", {}))
    const adShorts = w.shortsNav.filter((x) => x.isAdFlag || x.adShowingAfter1500ms)
    out.push(adShorts.length ? E("T07.3", null, "info", `${adShorts.length} Shorts ad(s): isAd flag ${adShorts.map((x) => x.isAdFlag).join(",")}; ad-showing on #shorts-player ${adShorts.map((x) => x.adShowingAfter1500ms).join(",")}; URL stays /shorts/ ${adShorts.every((x) => x.urlIsShorts)}`, { adShorts, shortsNavigations: w.shortsNav.length }) : E("T07.3", null, "skip", `no Shorts ad seen in ${w.shortsNav.length} Shorts navigations: swipe through 15–20 Shorts, then run`, { adClientParamsSeen: w.shortsNav.filter((x) => x.adClientParamsKeys).length }))
    const mini = w.events.filter((e) => e.where === "miniplayer")
    const byType = {}
    for (const e of mini) byType[e.type] = (byType[e.type] || 0) + 1
    out.push(mini.length ? E("T07.4", null, "info", `events while in the miniplayer: ${Object.entries(byType).map(([k, v]) => `${k}×${v}`).join(", ")}`, { counts: byType, around: w.events.filter((e) => e.where === "miniplayer" || e.type === "yt-player-updated").slice(-30) }) : E("T07.4", null, "skip", "no miniplayer events: play a video, open the miniplayer (press i), let the next video start, then run", {}))
    const sn = early.navEvents.filter((n) => n.pageType === "shorts")
    out.push(sn.length ? E("T07.5", null, "info", `${sn.length} Shorts navigations; getVideoData follows the URL ${w.shortsNav.filter((x) => x.getVideoDataMatchesUrlAfter1500ms).length}/${w.shortsNav.length}; loop wraps ${early.shorts.wrapCandidates.length} (seeking between ${L.uniq(early.shorts.wrapCandidates.map((x) => x.seekingEventsBetween)).join(",")}); ended events ${early.shorts.ended}`, { shortsNav: w.shortsNav, loop: early.shorts }) : E("T07.5", null, "skip", "no Shorts swipes seen: open a Short, let it loop, swipe twice, then run", {}))
    out.push(w.live.length ? E("T07.6", null, "info", `${w.live.length} live-flag change(s): ${w.live.map((x) => `${JSON.stringify(x.from)}→${JSON.stringify(x.to)}`).join(" ; ")}`, { transitions: w.live }) : E("T07.6", null, "skip", "no live or premiere ending seen: leave one open until it ends, then run (optional)", {}))
    const modeOf = async (videoId) => {
      const res = await safe(() => fetch(`/watch?v=${videoId}&hl=en`, { credentials: "same-origin" }))
      if (res.error) return { error: res.error }
      const html = await res.text()
      const m = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var |<\/script>)/s)
      let pr = null
      try {
        pr = m ? JSON.parse(m[1]) : null
      } catch {}
      return { http: res.status, signedInPage: /"LOGGED_IN":true/.test(html), playbackMode: pr?.playabilityStatus?.miniplayer?.miniplayerRenderer?.playbackMode ?? (pr ? "<absent>" : "<no player response>") }
    }
    const kids = await modeOf(KIDS_VIDEO)
    const ordinary = await modeOf(L.TEST_VIDEO)
    out.push(E("T07.7", null, kids.playbackMode === "PLAYBACK_MODE_PAUSED_ONLY" && ordinary.playbackMode !== "PLAYBACK_MODE_PAUSED_ONLY" ? "pass" : "info", `made-for-kids video: ${kids.playbackMode ?? kids.error} (signed in page: ${kids.signedInPage}); ordinary video: ${ordinary.playbackMode ?? ordinary.error}; modes on pages watched since load: ${JSON.stringify(w.playbackModes)}`, { madeForKids: kids, ordinary, watchedSinceLoad: w.playbackModes }))
    const longHidden = w.hidden.periods.filter((p) => p.hiddenMs > 300000)
    out.push(longHidden.length ? E("T07.8", null, "info", `hidden ${Math.round(Math.max(...longHidden.map((p) => p.hiddenMs)) / 60000)} min: timeupdate gaps while hidden median ${w.hidden.gapsHidden.median} ms, max ${w.hidden.gapsHidden.max} ms (visible median ${w.hidden.gapsVisible.median}); paused while hidden: ${w.hidden.pausedWhileHidden.map((p) => (p.muted ? "muted" : "unmuted")).join(",") || "never"}`, w.hidden) : E("T07.8", null, "skip", "tab not hidden for 5+ minutes: play a video, switch to another tab for 6 minutes, come back, run", w.hidden))
    const bp = w.beforePlay.filter((b) => b.before && b.playing)
    out.push(bp.length ? E("T07.9", null, "info", `${bp.length} video(s): isLive before→playing ${bp.map((b) => `${b.before.isLive}→${b.playing.isLive}`).join(", ")}; keys ${bp.map((b) => `${b.before.keys}→${b.playing.keys}`).join(", ")}`, { samples: w.beforePlay }) : E("T07.9", null, "skip", "no video loaded and then played since this page loaded", { samples: w.beforePlay }))
    return out
  })

  // ---------- ticket 08: keys ----------

  step("keys", BOTH, { ids: ["T08.1", "T08.2", "T08.4", "T08.5"] }, async () => {
    const platform = navigator.userAgentData?.platform || navigator.platform || "?"
    const out = []
    if (HOST === "www") {
      const blocked = keys.shortsTests.filter((t) => t.blocked)
      const open = keys.shortsTests.filter((t) => !t.blocked)
      out.push(blocked.length ? E("T08.1", null, blocked.every((t) => !t.youtubeReacted) ? "pass" : "fail", `blocked presses: YouTube reacted to ${blocked.filter((t) => t.youtubeReacted).length} of ${blocked.length}; unblocked baseline: reacted to ${open.filter((t) => t.youtubeReacted).length} of ${open.length}`, { tests: keys.shortsTests, method: "window keydown, capture phase, registered at document_start: stopImmediatePropagation + preventDefault" }) : E("T08.1", null, "skip", "on a Short, tick Keys → block, press ↓ and m, untick, press them again, then run", { tests: keys.shortsTests }))
    }
    const id = /win/i.test(platform) ? "T08.2" : /mac/i.test(platform) ? "T08.3" : "T08.2/T08.3"
    out.push(keys.log.length ? E(id, platform, "info", `${keys.log.length} key presses logged: ${keys.log.slice(-6).map((k) => `${k.key}/${k.code}${k.altKey ? "+alt" : ""}${k.ctrlKey ? "+ctrl" : ""}${k.metaKey ? "+meta" : ""}${k.altGraph ? "+AltGraph" : ""}`).join(" ")}`, { platform, log: keys.log }) : E(id, platform, "skip", "tick Keys → Log my key presses, press AltGr+Q / AltGr+E (Windows) or Option+N / Option+Q (macOS) on the page, then run", {}))
    const inApp = displayMode() !== "browser"
    out.push(keys.received ? E("T08.4", inApp ? "app window" : "normal tab", inApp ? "pass" : "info", `${keys.received} key presses reached the page's capture listener in a ${inApp ? `${displayMode()} app window` : "normal tab"}`, { displayMode: displayMode(), received: keys.received }) : E("T08.4", null, "skip", "no key presses logged here (in the installed app, tick Log my key presses and press Alt+N)", {}))
    out.push(E("T08.5", null, "skip", "Bits UI popover Escape: verified in the ticket 14 dev build, not by this probe", {}))
    return out
  })

  // ---------- M4, P1, P2, headers ----------

  step("app", BOTH, { ids: ["M4"] }, async () => {
    const r = await safe(() => bg("m4", {}, 15000))
    const reg = document.documentElement.dataset
    const inApp = displayMode() !== "browser" || r.tab?.windowType === "app"
    return [
      E("M4", inApp ? "app window" : "normal tab", r.tabsQueryFindsThisTab && r.executeScript?.ok && reg.ytptRegMain ? "pass" : "fail", `${inApp ? "installed app window" : "normal browser tab"}: tabs.query finds this tab: ${r.tabsQueryFindsThisTab}; executeScript: ${r.executeScript?.ok ?? r.error}; registered scripts ran: main ${Boolean(reg.ytptRegMain)}, isolated ${Boolean(reg.ytptRegIsolated)}; popup last opened over this tab: ${r.popupOverThisTab ?? "never"}; keyboard command in this window: ${r.commandInThisWindow ?? "never"}`, { displayMode: displayMode(), ...r })
    ]
  })

  step("hiddenFrame", WWW, { ids: ["HIDDEN-FRAME"] }, async () => [
    E("HIDDEN-FRAME", null, "skip", "not built: ticket 10 §6 made the hidden-frame spike optional (not needed for 2.0)", {})
  ])

  step("prompt", BOTH, { ids: ["P1"] }, async (ctx) => {
    const text = ui.prompt.value.trim()
    return [
      E("P1", null, text ? "info" : "skip", text ? "prompt text recorded" : "no prompt text pasted (see CHECKLIST step P1)", { promptText: text || undefined, probePermissions: ctx.state.env?.extension?.permissions, note: "Temporary add-ons show no install prompt; the text comes from about:addons / chrome://extensions or the prompt-check extensions. The 1.4.5 → 2.0 Firefox update prompt can't be tested without a signed build." })
    ]
  })

  step("registered", BOTH, { ids: ["P2"] }, async () => {
    const d = document.documentElement.dataset
    const r = await safe(() => bg("p2"))
    const at = (v) => (v ? Math.round(Number(v) - performance.timeOrigin) : null)
    const pageStart = Math.round(performance.timeOrigin)
    const lastStartup = (r.backgroundStarts || []).filter((s) => s.event === "onStartup").at(-1)
    const lastUpdate = (r.history || []).filter((h) => /onInstalled:update/.test(h.event)).at(-1)
    const lastStartupReg = (r.history || []).filter((h) => h.event === "onStartup").at(-1)
    const kept = (h) => (Array.isArray(h?.registeredAtBackgroundStart) ? (h.registeredAtBackgroundStart.length ? "SURVIVED" : "were gone") : "unknown")
    return [
      E("P2", null, d.ytptRegMain ? "info" : "fail", `registered scripts ran on this load: main ${Boolean(d.ytptRegMain)} (+${at(d.ytptRegMain)} ms), isolated ${Boolean(d.ytptRegIsolated)}; page loaded ${lastStartup ? (pageStart < lastStartup.at ? "BEFORE" : "after") : "?"} the background's last onStartup; browser restart: registrations ${lastStartupReg ? kept(lastStartupReg) : "not tested yet"}; extension update: registrations ${lastUpdate ? kept(lastUpdate) : "not tested yet (reload the extension)"}`, {
        thisPage: { mainRan: Boolean(d.ytptRegMain), isolatedRan: Boolean(d.ytptRegIsolated), mainMsAfterNavigationStart: at(d.ytptRegMain), isolatedMsAfterNavigationStart: at(d.ytptRegIsolated), pageLoadedBeforeLastStartup: lastStartup ? pageStart < lastStartup.at : null },
        registrationHistory: r.history,
        backgroundStarts: r.backgroundStarts,
        error: r.error
      })
    ]
  })

  step("headers", BOTH, { ids: ["T25.headers"] }, async (ctx) => {
    const found = await safe(() => bg("requests.find", { markers: ctx.state.markers.map((m) => m.marker) }, 10000), [])
    const rows = []
    for (const m of ctx.state.markers) {
      const e = (Array.isArray(found) ? found : []).find((x) => x.marker === m.marker)
      rows.push({ place: m.place, seen: Boolean(e), status: e?.statusCode, ...(e?.headers || {}), initiator: e?.initiator, tabId: e ? (e.tabId >= 0 ? "tab" : "none") : undefined, error: e?.error })
    }
    for (const o of ctx.state.ownClient) rows.push({ place: o.place, seen: true, status: o.entry.statusCode, ...(o.entry.headers || {}), initiator: o.entry.initiator })
    const brief = rows.map((r) => `${r.place}: ${r.seen ? `${r.status ?? "?"}, Origin ${r.origin ?? "-"}, auth ${r.authorization ?? "-"}` : "not seen"}`)
    return [E("T25.headers", HOST, rows.some((r) => r.seen) ? "info" : "fail", brief.slice(0, 4).join(" · "), { places: rows, webRequestError: found?.error })]
  })

  // ======================= engine =======================

  const state = { runs: [], compareCode: null, saving: null }
  const pageKey = `${HOST}-${loadedAt}`

  const makeCtx = (writes) => {
    const cookies = () => document.cookie
    const cfg = L.clientConfig(get, ORIGIN, cookies)
    const pageDsid = get("DATASYNC_ID")
    return {
      host: HOST,
      startedAt: Date.now(),
      writes,
      cfg,
      pageDsid,
      loggedIn: get("LOGGED_IN") === true,
      videoId: currentVideoId() || L.TEST_VIDEO,
      it: async (path, body, opts = {}) => {
        const r = await L.innertube(cfg, path, body, opts)
        const route = opts.auth === "none" ? "cookies only" : opts.hashOrigin || opts.xOrigin !== undefined || opts.auth === "single" ? "signed (variant)" : "signed request"
        captureFx(route, path, body, r.status, r.json)
        return r
      },
      sum: (r) => L.summarize(r, pageDsid),
      state: { playlists: [], markers: [], ownClient: [], salt: state.salt }
    }
  }

  const runSteps = async (label, list, writes) => {
    const ctx = makeCtx(writes)
    const run = { label, startedAt: new Date().toISOString(), writesAllowed: writes, signedIn: ctx.loggedIn, entries: [] }
    state.runs.push(run)
    ui.results.textContent = ""
    const record = (entry, ms) => {
      const full = { ...entry, ms, evidence: L.publicView(entry.evidence) }
      run.entries.push(full)
      showEntry(full)
    }
    try {
      for (const s of list) {
        if (!s.hosts.includes(HOST)) continue
        if (s.gated && !writes) {
          for (const id of s.ids) record(E(id, s.key, "skip", "write checks not allowed (tick the box to run)", {}), 0)
          continue
        }
        ui.status.textContent = `Running ${s.key}…`
        currentStep = s.key
        const t0 = Date.now()
        try {
          const entries = await L.withTimeout(Promise.resolve().then(() => s.run(ctx)), s.timeoutMs || 150000, s.key)
          for (const e of entries || []) record(e, Date.now() - t0)
        } catch (e) {
          record(E(s.ids[0], s.key, "error", L.errText(e), {}), Date.now() - t0)
        }
      }
    } finally {
      // Never leave a probe playlist behind, whatever failed above.
      if (ctx.state.playlists.length && !run.entries.some((e) => e.id === "CLEANUP" && e.status !== "skip")) {
        const send = HOST === "music" ? async (path, body) => { const r = await nmCall(`/${path}`, body); return r.json ? { status: r.status ?? 200, json: r.json } : { status: 0, error: r.error } } : (path, body) => ctx.it(path, body)
        for (const e of await safe(() => cleanupPlaylists(ctx, send), [])) record(e, 0)
      }
      state.salt = ctx.state.salt
      run.finishedAt = new Date().toISOString()
      await saveReport()
    }
  }

  async function runAll() {
    buildPanel()
    setBusy(true, "Running… keep this tab open and visible.")
    try {
      await runSteps("full run", steps, ui.writes.checked)
      const n = state.runs.at(-1).entries.length
      ui.status.textContent = `Done: ${n} entries. Press Copy report (it includes every page you ran in this browser).`
    } catch (e) {
      ui.status.textContent = `Probe error: ${L.errText(e)}`
    } finally {
      setBusy(false)
    }
  }

  async function runStale() {
    setBusy(true, "Stale-tab check…")
    try {
      const staleStep = {
        key: "stale",
        hosts: BOTH,
        ids: ["T11.5"],
        run: async (ctx) => {
          const pageDsid = ctx.pageDsid
          const fresh = await sessionFingerprint()
          const signed = ctx.sum(await ctx.it("navigation/resolve_url", { url: markerUrl("stale").url }))
          const gap = ctx.sum(await ctx.it("playlist/get_add_to_playlist", { videoIds: [L.TEST_VIDEO], excludeWatchLater: false }))
          let own = null
          if (HOST === "www") {
            const s = await serviceRequest({ signalServiceEndpoint: { signal: "GET_ACCOUNT_MENU" }, ...cmdMeta("/youtubei/v1/account/account_menu") })
            if (uiSnapshot() && Object.keys(uiSnapshot()).length) await closeUi()
            own = s.response ? L.summarize({ status: 200, json: s.response }, pageDsid) : { error: "no response" }
          } else {
            const r = await nmCall("/account/account_menu", {})
            own = r.json ? L.summarize({ status: r.status ?? 200, json: r.json }, pageDsid) : { error: r.error }
          }
          const changed = sessionAtLoad != null ? fresh !== sessionAtLoad : null
          return [
            E("T11.5", HOST, "info", `session cookie changed since this page loaded: ${changed}; signed request answered for ${signed.responseDatasyncIdMatchesPage === false ? "a DIFFERENT account" : signed.responseDatasyncIdMatchesPage ? "the page's account" : signed.loggedOut ? "nobody (signed out)" : "?"}; own client: ${own.responseDatasyncIdMatchesPage === false ? "DIFFERENT account" : own.responseDatasyncIdMatchesPage ? "page's account" : own.loggedOut ? "signed out" : own.error ?? "?"}; get_add_to_playlist HTTP ${gap.status}; YouTube UI showing: ${Object.keys(uiSnapshot()).join(",") || "nothing"}`, {
              pageLoadedMinutesAgo: Math.round((Date.now() - loadedAt) / 60000),
              pageStillSignedInPerYtcfg: ctx.loggedIn,
              sessionCookieChangedSinceLoad: changed,
              signedRequest: signed,
              ownClient: own,
              getAddToPlaylist: gap,
              note: "never writes; a Watch Later write from a stale tab is deliberately not tested"
            })
          ]
        }
      }
      await runSteps("stale-tab check", [staleStep], false)
      ui.status.textContent = "Stale-tab check done. Copy report when finished."
    } finally {
      setBusy(false)
    }
  }

  async function runScan() {
    setBusy(true, "Scanning rows…")
    try {
      await runSteps(`row scan (${pathKind()})`, steps.filter((s) => s.key === "ytmRows"), false)
      ui.status.textContent = "Row scan saved. Open another kind of page (album, playlist, search, library) and scan again."
    } finally {
      setBusy(false)
    }
  }

  // ======================= report =======================

  const secretsNow = () => {
    const out = []
    for (const part of document.cookie.split(";")) {
      const i = part.indexOf("=")
      if (i > 0) out.push(part.slice(i + 1).trim())
    }
    const dsid = get("DATASYNC_ID")
    out.push(dsid, ...(typeof dsid === "string" ? dsid.split("||") : []))
    out.push(get("USER_SESSION_ID"), get("DELEGATED_SESSION_ID"), get("VISITOR_DATA"), get("ID_TOKEN"), get("INNERTUBE_CONTEXT")?.client?.visitorData, get("INNERTUBE_CONTEXT")?.client?.remoteHost, get("INNERTUBE_API_KEY"))
    out.push(state.compareCode, ui.collab?.value?.trim(), ui.compare?.value?.trim())
    return out.filter((s) => typeof s === "string" && s.length >= 6)
  }

  const pageReport = () => ({
    page: { host: location.host, pathKind: pathKind(), displayMode: displayMode(), loadedAt: new Date(loadedAt).toISOString() },
    inputs: { collaborativeIdGiven: Boolean(ui.collab?.value.trim()), compareCodeGiven: Boolean(ui.compare?.value.trim()), promptTextGiven: Boolean(ui.prompt?.value.trim()) },
    notes: ui.notes?.value.trim() || undefined,
    runs: state.runs
  })

  async function saveReport() {
    const text = L.scrub(JSON.stringify(pageReport()), secretsNow())
    await safe(() => bg("report.save", { key: pageKey, text }))
  }

  async function copyReport() {
    await saveReport()
    const all = await safe(() => bg("report.all"))
    const report = {
      probe: "ytpt-live-checks",
      version: L.VERSION,
      ticket: 25,
      copiedAt: new Date().toISOString(),
      browser: all.browser,
      redaction: "No cookie values, SAPISID, auth hashes, DATASYNC_ID / USER_SESSION_ID / DELEGATED_SESSION_ID values, visitor data, playlist titles or channel IDs. Response bodies appear only as shapes: strings are replaced by <str N> unless they are enum-like.",
      pages: (all.pages || []).map((p) => {
        try {
          return JSON.parse(p.text)
        } catch {
          return { unreadable: true }
        }
      }),
      error: all.error
    }
    const text = L.scrub(JSON.stringify(report, null, 1), secretsNow())
    try {
      await navigator.clipboard.writeText(text)
      ui.status.textContent = `Copied ${Math.round(text.length / 1024)} KB (${report.pages.length} page report(s)). Paste it back into the chat.`
      ui.copyArea.style.display = "none"
    } catch {
      ui.copyArea.style.display = ""
      ui.copyArea.value = text
      ui.copyArea.select()
      ui.status.textContent = "Clipboard blocked: the report is selected below; press Ctrl+C (Cmd+C)."
    }
  }

  function downloadFixtures() {
    if (!fixtures.length) {
      ui.status.textContent = "No fixtures captured: tick “Capture fixtures”, then Run."
      return
    }
    const text = L.scrub(
      JSON.stringify({ probe: "ytpt-live-checks", version: L.VERSION, kind: "fixtures", capturedOn: location.host, clientVersion: get("INNERTUBE_CLIENT_VERSION"), savedAt: new Date().toISOString(), redaction: "Every string replaced unless an enum, an API path or one of the probe's public test video IDs; tracking params dropped.", fixtures }, null, 1),
      secretsNow()
    )
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }))
    a.download = `ytpt-fixtures-${HOST}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`
    document.documentElement.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    ui.status.textContent = `Saved ${fixtures.length} redacted responses (${Math.round(text.length / 1024)} KB).`
  }

  // ======================= start =======================

  const start = () => {
    buildPanel()
    safe(() => startToastLog(), null)
    saveReport()
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true })
  else start()
})()
