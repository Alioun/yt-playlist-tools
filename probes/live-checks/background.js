// Background of the ytpt live-check probe. Chrome runs it as a service worker,
// Firefox as an event page. It:
// - watches YouTube's /youtubei/ requests with webRequest, keeping only header
//   names, a few non-secret header values, cookie NAMES and edit action enums;
// - keeps salted hashes of identity values so runs can say "same / changed"
//   without ever holding the values themselves;
// - answers the page's questions about tabs, windows, executeScript and
//   registered scripts (M4, P2);
// - stores each page's already-redacted report for "Copy report".
const api = globalThis.browser ?? globalThis.chrome
const IS_FIREFOX = api.runtime.getURL("").startsWith("moz-extension:")
const MATCHES = ["https://www.youtube.com/*", "https://music.youtube.com/*"]

// ======================= request observer =======================

const RING = []
const BY_ID = new Map()
const SKIP_PATHS = /^(log_event|att\/|stats\/|feedback|notification\/)/
const webRequestState = { ok: false }

const authStructure = (value) => {
  if (!value) return null
  const parts = []
  const re = /([A-Z0-9]+HASH)\s+\d+_[0-9a-fA-F]+(_[a-z]+)?/g
  let m
  while ((m = re.exec(value))) parts.push(m[1] + (m[2] ? `(${m[2]})` : ""))
  return parts.length ? parts.join(" ") : `<unrecognised ${value.length} chars>`
}
const trimUrl = (u) => {
  try {
    const x = new URL(u)
    return x.origin + (x.protocol.startsWith("http") ? x.pathname : "")
  } catch {
    return null
  }
}
const headerSummary = (headers = []) => {
  const H = {}
  for (const h of headers) H[h.name.toLowerCase()] = h.value ?? (h.binaryValue ? "<binary>" : "")
  const cookieNames = (H.cookie || "").split(";").map((s) => s.split("=")[0].trim()).filter(Boolean)
  return {
    headerNames: Object.keys(H).sort(),
    origin: H.origin ?? null,
    referer: H.referer ? trimUrl(H.referer) : null,
    secFetchSite: H["sec-fetch-site"] ?? null,
    secFetchMode: H["sec-fetch-mode"] ?? null,
    secFetchDest: H["sec-fetch-dest"] ?? null,
    xOrigin: H["x-origin"] ?? null,
    xGoogAuthUser: H["x-goog-authuser"] ?? null,
    xGoogPageId: "x-goog-pageid" in H,
    xGoogVisitorId: "x-goog-visitor-id" in H,
    authorization: authStructure(H.authorization),
    clientName: H["x-youtube-client-name"] ?? null,
    clientVersion: H["x-youtube-client-version"] ?? null,
    bootstrapLoggedIn: H["x-youtube-bootstrap-logged-in"] ?? null,
    cookieHeaderVisible: "cookie" in H,
    cookieCount: cookieNames.length,
    authCookiesSent: Object.fromEntries(["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID", "SID", "__Secure-3PSID"].map((n) => [n, cookieNames.includes(n)]))
  }
}
const decodeBody = (d) => {
  try {
    const raw = d.requestBody?.raw
    if (!raw?.length) return ""
    const dec = new TextDecoder()
    return raw.map((p) => (p.bytes ? dec.decode(p.bytes) : "")).join("").slice(0, 200000)
  } catch {
    return ""
  }
}
const bodyActions = (text) => {
  try {
    const j = JSON.parse(text)
    return Array.isArray(j.actions) ? j.actions.map((a) => ({ action: a.action, fields: Object.keys(a).sort() })) : undefined
  } catch {
    return undefined
  }
}
// Edit params are short opaque constants ("IAE%3D", "CAE%3D"); anything else is only flagged.
const bodyParams = (text) => {
  try {
    const p = JSON.parse(text).params
    return p == null ? undefined : /^[A-Za-z0-9%_-]{2,24}$/.test(p) ? p : "<other>"
  } catch {
    return undefined
  }
}

const FILTER = { urls: ["https://www.youtube.com/youtubei/*", "https://music.youtube.com/youtubei/*"] }
try {
  api.webRequest.onBeforeRequest.addListener(
    (d) => {
      let url
      try {
        url = new URL(d.url)
      } catch {
        return
      }
      const path = url.pathname.replace(/^\/youtubei\/v1\//, "")
      if (SKIP_PATHS.test(path)) return
      const body = decodeBody(d)
      const e = {
        requestId: d.requestId,
        host: url.host,
        path,
        method: d.method,
        tabId: d.tabId,
        frameId: d.frameId,
        type: d.type,
        initiator: d.initiator ?? (d.originUrl ? trimUrl(d.originUrl) : null),
        t: Math.round(d.timeStamp),
        marker: body.match(/ytptprobe=([a-z0-9]+-[a-zA-Z0-9-]+)/)?.[1],
        bodyActions: path === "browse/edit_playlist" ? bodyActions(body) : undefined,
        bodyParams: path === "browse/edit_playlist" ? bodyParams(body) : undefined
      }
      RING.push(e)
      BY_ID.set(d.requestId, e)
      while (RING.length > 500) BY_ID.delete(RING.shift().requestId)
    },
    FILTER,
    ["requestBody"]
  )
  api.webRequest.onSendHeaders.addListener(
    (d) => {
      const e = BY_ID.get(d.requestId)
      if (e) e.headers = headerSummary(d.requestHeaders)
    },
    FILTER,
    IS_FIREFOX ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"]
  )
  api.webRequest.onCompleted.addListener((d) => {
    const e = BY_ID.get(d.requestId)
    if (e) e.statusCode = d.statusCode
  }, FILTER)
  api.webRequest.onErrorOccurred.addListener((d) => {
    const e = BY_ID.get(d.requestId)
    if (e) e.error = d.error
  }, FILTER)
  webRequestState.ok = true
} catch (err) {
  webRequestState.error = String(err?.message ?? err)
}

const publicEntry = ({ requestId, ...rest }) => rest
const waitFor = async (pick, ms = 3000) => {
  const until = Date.now() + ms
  let list = pick()
  while (Date.now() < until && list.some((e) => e.statusCode == null && !e.error)) {
    await new Promise((r) => setTimeout(r, 150))
    list = pick()
  }
  return list.map(publicEntry)
}

// ======================= identity history (salted hashes only) =======================

const sha256 = async (text) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}
const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("")

async function dsidRecord({ host, loggedIn, dsid, usid, del }, sender) {
  const st = await api.storage.local.get(["dsidSalt", "dsidValues", "dsidHistory"])
  const salt = st.dsidSalt || randomHex(16)
  const values = st.dsidValues || { dsid: [], usid: [], del: [] }
  const history = st.dsidHistory || []
  const label = async (kind, v) => {
    if (v == null || v === "") return "none"
    const h = await sha256(`${salt}|${kind}|${v}`)
    let i = values[kind].indexOf(h)
    if (i < 0) {
      values[kind].push(h)
      i = values[kind].length - 1
    }
    return `#${i}`
  }
  const entry = {
    at: Date.now(),
    host,
    loggedIn: Boolean(loggedIn),
    dsid: await label("dsid", dsid),
    usid: await label("usid", usid),
    del: await label("del", del),
    incognito: sender.tab?.incognito,
    container: sender.tab?.cookieStoreId
  }
  history.push(entry)
  while (history.length > 60) history.shift()
  await api.storage.local.set({ dsidSalt: salt, dsidValues: values, dsidHistory: history })
  return { thisRun: entry, history: history.slice(-20), analysis: analyse(history) }
}

function analyse(history) {
  const cycles = []
  for (const host of ["www", "music"]) {
    const h = history.filter((e) => e.host === host && e.container === history.at(-1).container)
    for (let i = 0; i < h.length - 2; i++) {
      if (!h[i].loggedIn || h[i + 1].loggedIn) continue
      let j = i + 1
      while (j < h.length && !h[j].loggedIn) j++
      if (j < h.length) cycles.push({ host, stable: h[i].dsid === h[j].dsid, signedOutRunsBetween: j - i - 1 })
    }
  }
  const latest = (host) => [...history].reverse().find((e) => e.host === host && e.loggedIn)
  const w = latest("www")
  const m = latest("music")
  let differentAtOnce = false
  for (const a of history.filter((e) => e.host === "www" && e.loggedIn))
    for (const b of history.filter((e) => e.host === "music" && e.loggedIn))
      if (Math.abs(a.at - b.at) < 600000 && a.dsid !== b.dsid && a.container === b.container) differentAtOnce = true
  return {
    signOutCycles: cycles.slice(-6),
    signedOutValues: [...new Set(history.filter((e) => !e.loggedIn).map((e) => e.dsid))].length,
    distinctSignedIn: new Set(history.filter((e) => e.loggedIn).map((e) => e.dsid)).size,
    wwwVsMusic: w && m ? (w.dsid === m.dsid ? "same" : "different") : undefined,
    latestPerHost: { www: w && { label: w.dsid, minutesAgo: Math.round((Date.now() - w.at) / 60000) }, music: m && { label: m.dsid, minutesAgo: Math.round((Date.now() - m.at) / 60000) } },
    differentAtOnce
  }
}

// ======================= registered scripts (P2) =======================

const REG = [
  { id: "ytpt-reg-main", matches: MATCHES, js: ["registered-main.js"], runAt: "document_start", world: "MAIN", persistAcrossSessions: true },
  { id: "ytpt-reg-isolated", matches: MATCHES, js: ["registered-isolated.js"], runAt: "document_start", persistAcrossSessions: true }
]
const ours = (list) => (list || []).map((s) => s.id).filter((id) => id.startsWith("ytpt-"))
// What was registered when this background instance started, before anything re-registered.
const bootSnapshot = api.scripting
  .getRegisteredContentScripts()
  .then(ours)
  .catch((e) => ({ error: String(e?.message ?? e) }))
let chain = Promise.resolve()
const pushStored = async (key, item, max = 40) => {
  const st = await api.storage.local.get(key)
  const list = st[key] || []
  list.push(item)
  while (list.length > max) list.shift()
  await api.storage.local.set({ [key]: list })
}
const reconcile = (event) =>
  (chain = chain
    .then(async () => {
      const atStart = await bootSnapshot
      let before = []
      let error
      try {
        before = ours(await api.scripting.getRegisteredContentScripts())
        const missing = REG.filter((r) => !before.includes(r.id))
        if (missing.length) await api.scripting.registerContentScripts(missing)
      } catch (e) {
        error = String(e?.message ?? e)
      }
      const after = await api.scripting.getRegisteredContentScripts().then(ours).catch(() => [])
      if (event !== "background-start" || !before.length || error)
        await pushStored("regHistory", { at: Date.now(), event, registeredAtBackgroundStart: atStart, registeredBefore: before, registeredAfter: after, error })
    })
    .catch(() => {}))

api.runtime.onInstalled.addListener((d) => reconcile(`onInstalled:${d.reason}`))
api.runtime.onStartup.addListener(() => {
  pushStored("bgStarts", { at: Date.now(), event: "onStartup" }, 20)
  reconcile("onStartup")
})
reconcile("background-start")

// ======================= keyboard command (M4) =======================

api.commands?.onCommand.addListener(async (command, tab) => {
  const win = await api.windows.getLastFocused().catch(() => null)
  await api.storage.local.set({
    lastCommand: { at: Date.now(), command, windowId: win?.id ?? tab?.windowId, windowType: win?.type, tabId: tab?.id, tabHost: tab?.url ? new URL(tab.url).host : null }
  })
})

// ======================= messages =======================

const browserInfo = async () => {
  if (IS_FIREFOX) {
    const i = await browser.runtime.getBrowserInfo()
    return { browser: "firefox", browserVersion: i.version }
  }
  const ua = navigator.userAgent
  const edge = ua.match(/Edg\/([\d.]+)/)
  if (edge) return { browser: "edge", browserVersion: edge[1] }
  const opera = ua.match(/OPR\/([\d.]+)/)
  if (opera) return { browser: "opera", browserVersion: opera[1] }
  return { browser: "chrome", browserVersion: ua.match(/Chrome\/([\d.]+)/)?.[1] }
}

const handlers = {
  async hello(_, sender) {
    const info = await browserInfo()
    const win = sender.tab ? await api.windows.get(sender.tab.windowId).catch(() => null) : null
    const contains = (o) => api.permissions.contains({ origins: [o] }).catch(() => null)
    return {
      ...info,
      platform: (await api.runtime.getPlatformInfo()).os,
      extension: { version: api.runtime.getManifest().version, permissions: await api.permissions.getAll() },
      hostAccess: { www: await contains("https://www.youtube.com/*"), music: await contains("https://music.youtube.com/*"), allYoutube: await contains("*://*.youtube.com/*") },
      webRequest: webRequestState,
      tab: { windowType: win?.type, incognito: sender.tab?.incognito, container: sender.tab?.cookieStoreId },
      windowTypes: (await api.windows.getAll().catch(() => [])).map((w) => w.type)
    }
  },

  async "requests.recent"({ since, paths, tab }, sender) {
    const tabId = tab === "self" ? sender.tab?.id : undefined
    return waitFor(() => RING.filter((e) => e.t >= since - 50 && (!paths || paths.includes(e.path)) && (tabId == null || e.tabId === tabId)))
  },

  async "requests.find"({ markers }) {
    const want = new Set(markers || [])
    const until = Date.now() + 3000
    while (Date.now() < until && RING.filter((e) => want.has(e.marker)).length < want.size) await new Promise((r) => setTimeout(r, 150))
    return waitFor(() => RING.filter((e) => want.has(e.marker)))
  },

  async "bg.fetch"({ url, clientVersion }) {
    const t0 = Date.now()
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/navigation/resolve_url?prettyPrint=false", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion, hl: "en" } }, url })
      })
      let json = null
      try {
        json = await res.json()
      } catch {}
      return { status: res.status, loggedOut: json?.responseContext?.mainAppWebResponseContext?.loggedOut, ms: Date.now() - t0 }
    } catch (e) {
      return { status: 0, networkError: String(e?.message ?? e) }
    }
  },

  "dsid.record": (msg, sender) => dsidRecord(msg, sender),

  async m4(_, sender) {
    const tabId = sender.tab?.id
    const host = sender.url ? new URL(sender.url).host : "www.youtube.com"
    const out = {}
    const win = await api.windows.get(sender.tab.windowId).catch(() => null)
    out.tab = { windowType: win?.type }
    try {
      const list = await api.tabs.query({ url: [`https://${host}/*`] })
      const self = list.find((t) => t.id === tabId)
      out.tabsQueryCount = list.length
      out.tabsQueryFindsThisTab = Boolean(self)
      out.tabFields = self ? { url: Boolean(self.url), lastAccessed: typeof self.lastAccessed === "number", incognito: typeof self.incognito, frozen: "frozen" in self, discarded: "discarded" in self, audible: "audible" in self } : null
    } catch (e) {
      out.tabsQueryError = String(e?.message ?? e)
    }
    try {
      const r = await api.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => ({ host: location.host, displayMode: ["window-controls-overlay", "standalone", "minimal-ui", "browser"].find((m) => matchMedia(`(display-mode: ${m})`).matches) })
      })
      out.executeScript = { ok: Boolean(r?.[0]?.result?.host), result: r?.[0]?.result }
    } catch (e) {
      out.executeScript = { ok: false, error: String(e?.message ?? e) }
    }
    const { lastPopup, lastCommand } = await api.storage.local.get(["lastPopup", "lastCommand"])
    out.popupOverThisTab = lastPopup ? lastPopup.tabId === tabId : null
    out.popup = lastPopup ? { minutesAgo: Math.round((Date.now() - lastPopup.at) / 60000), windowType: lastPopup.windowType, activeTabHost: lastPopup.tabHost } : null
    out.commandInThisWindow = lastCommand ? lastCommand.windowId === sender.tab?.windowId : null
    out.command = lastCommand ? { minutesAgo: Math.round((Date.now() - lastCommand.at) / 60000), windowType: lastCommand.windowType, tabHost: lastCommand.tabHost } : null
    out.registered = await api.scripting.getRegisteredContentScripts().then(ours).catch((e) => ({ error: String(e?.message ?? e) }))
    return out
  },

  async p2() {
    const st = await api.storage.local.get(["regHistory", "bgStarts"])
    return { history: (st.regHistory || []).slice(-20), backgroundStarts: (st.bgStarts || []).slice(-10), registeredNow: await api.scripting.getRegisteredContentScripts().then(ours).catch(() => []) }
  },

  async "report.save"({ key, text }) {
    const st = await api.storage.local.get("reports")
    const reports = st.reports || {}
    reports[key] = { text, savedAt: Date.now() }
    const keys = Object.keys(reports).sort((a, b) => reports[a].savedAt - reports[b].savedAt)
    while (keys.length > 24) delete reports[keys.shift()]
    await api.storage.local.set({ reports })
    return true
  },

  async "report.all"() {
    const st = await api.storage.local.get("reports")
    const reports = st.reports || {}
    const pages = Object.keys(reports)
      .sort((a, b) => reports[a].savedAt - reports[b].savedAt)
      .map((k) => ({ key: k, text: reports[k].text }))
      // pages that never ran anything add nothing
      .filter((p) => !/"runs":\[\]/.test(p.text))
    return { browser: await browserInfo(), pages }
  },

  async "report.clear"() {
    await api.storage.local.remove("reports")
    return true
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type]
  if (!h) return false
  Promise.resolve()
    .then(() => h(msg, sender))
    .then(sendResponse, (e) => sendResponse({ error: String(e?.message ?? e) }))
  return true
})
