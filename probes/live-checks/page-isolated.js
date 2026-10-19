// Isolated-world script of the ytpt live-check probe. It relays the page
// script's questions to the background, and answers the ones that have to be
// asked from the isolated world itself: what it can see (cookies, ytcfg,
// mediaSession) and what its own fetch looks like to YouTube.
// Payloads cross the world boundary as JSON strings only.
;(() => {
  if (window.top !== window || globalThis.__ytptProbeIsolated) return
  globalThis.__ytptProbeIsolated = true
  const api = globalThis.browser ?? globalThis.chrome
  const AUTH = ["SAPISID", "__Secure-1PAPISID", "__Secure-3PAPISID", "APISID"]
  const names = () => document.cookie.split(";").map((s) => s.split("=")[0].trim()).filter(Boolean)

  const local = {
    hello: () => ({
      isolated: true,
      ytcfgVisible: typeof window.ytcfg !== "undefined",
      ytdAppResolveCommandVisible: typeof document.querySelector("ytd-app")?.resolveCommand,
      extensionApi: Boolean(api?.runtime?.id)
    }),
    cookies: () => {
      const n = names()
      return { auth: Object.fromEntries(AUTH.map((a) => [a, n.includes(a)])), count: n.length }
    },
    async fetch({ url, headers, body }) {
      const t0 = Date.now()
      try {
        const res = await fetch(url, { method: "POST", headers, body, credentials: "same-origin" })
        return { status: res.status, text: await res.text(), ms: Date.now() - t0 }
      } catch (e) {
        return { status: 0, error: String(e?.message ?? e), ms: Date.now() - t0 }
      }
    },
    mediaSession: () => {
      const m = navigator.mediaSession?.metadata
      return { hasMediaSession: Boolean(navigator.mediaSession), hasMetadata: Boolean(m), title: m?.title, artist: m?.artist, album: m?.album }
    }
  }

  document.addEventListener("ytpt-probe:req", async (e) => {
    let req
    try {
      req = JSON.parse(e.detail)
    } catch {
      return
    }
    const reply = (ok, payload) =>
      document.dispatchEvent(
        new CustomEvent("ytpt-probe:res", { detail: JSON.stringify(ok ? { id: req.id, ok, result: payload } : { id: req.id, ok, error: payload }) })
      )
    try {
      if (req.to === "bg") {
        const result = await api.runtime.sendMessage(req.msg)
        if (result && typeof result === "object" && !Array.isArray(result) && Object.keys(result).length === 1 && "error" in result) reply(false, result.error)
        else reply(true, result)
      } else {
        const h = local[req.msg?.type]
        if (!h) throw new Error(`unknown isolated request ${req.msg?.type}`)
        reply(true, await h(req.msg))
      }
    } catch (err) {
      reply(false, String(err?.message ?? err))
    }
  })
})()
