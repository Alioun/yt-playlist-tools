// Player watcher for ticket 07's live checks (when auto-add counts a video as
// watched). MAIN world, www.youtube.com top frame, from document_start. It only
// listens and samples; it never controls playback. Video IDs and titles never
// leave: every comparison is reduced to a boolean.
;(() => {
  if (window.top !== window || location.hostname !== "www.youtube.com" || globalThis.__ytptPlayerWatch) return
  const loadedAt = Date.now()
  const W = {
    events: [],
    adSamples: [],
    adSessions: 0,
    stitched: [],
    shortsNav: [],
    live: [],
    playbackModes: {},
    beforePlay: [],
    hidden: { periods: [], gaps: { hidden: [], visible: [] }, pausedWhileHidden: [], hiddenSince: null },
    apiAttach: {}
  }
  globalThis.__ytptPlayerWatch = W

  const now = () => Date.now() - loadedAt
  const urlVideoId = () =>
    location.pathname.startsWith("/shorts/")
      ? location.pathname.split("/")[2]
      : new URLSearchParams(location.search).get("v")
  const call = (fn) => {
    try {
      return fn()
    } catch {
      return undefined
    }
  }
  const where = (root) =>
    root.closest("ytd-miniplayer")
      ? "miniplayer"
      : root.closest("ytd-watch-flexy, ytd-watch-grid, ytd-watch-fixie")
        ? "watch"
        : root.closest("ytd-reel-video-renderer, ytd-shorts")
          ? "shorts"
          : "other"
  const log = (e) => {
    W.events.push({ t: now(), page: location.pathname.startsWith("/shorts/") ? "shorts" : location.pathname, ...e })
    if (W.events.length > 200) W.events.shift()
  }
  const adClasses = (root) => [...root.classList].filter((c) => /^ad-/.test(c))

  // ---------- per-video bookkeeping (T07.2, T07.6, T07.7, T07.9) ----------

  const perVideo = new Map() // root id -> { videoId, sawPlaying, before, stitchedChecked, flags }
  const liveFlags = (root) => {
    const pr = call(() => root.getPlayerResponse?.())
    const vd = pr?.videoDetails || {}
    return {
      isLive: Boolean(vd.isLive),
      isUpcoming: Boolean(vd.isUpcoming),
      isLiveContent: Boolean(vd.isLiveContent),
      isPostLiveDvr: Boolean(vd.isPostLiveDvr),
      videoDataIsLive: call(() => root.getVideoData?.()?.isLive)
    }
  }
  const videoDataView = (root) => {
    const vd = call(() => root.getVideoData?.())
    if (!vd) return null
    return {
      keys: Object.keys(vd).length,
      isLive: vd.isLive,
      isUpcoming: vd.isUpcoming,
      isListed: vd.isListed,
      isPlayable: vd.isPlayable,
      hasTitle: Boolean(vd.title),
      hasAuthor: Boolean(vd.author),
      matchesUrl: vd.video_id ? vd.video_id === urlVideoId() : null
    }
  }

  const onVideoChange = (root, id) => {
    const vid = call(() => root.getVideoData?.()?.video_id)
    const rec = perVideo.get(id)
    if (!vid || rec?.videoId === vid) return
    const fresh = { videoId: vid, sawPlaying: false, before: videoDataView(root), flags: liveFlags(root), stitchedChecked: false }
    perVideo.set(id, fresh)
    const pr = call(() => root.getPlayerResponse?.())
    const mode = pr?.playabilityStatus?.miniplayer?.miniplayerRenderer?.playbackMode
    if (id === "movie_player") W.playbackModes[mode ?? "<absent>"] = (W.playbackModes[mode ?? "<absent>"] || 0) + 1
    if (W.beforePlay.length < 12) W.beforePlay.push({ player: id, before: fresh.before, playing: null })
  }

  const checkStitched = (root, id) => {
    const rec = perVideo.get(id)
    if (!rec || rec.stitchedChecked || W.stitched.length >= 20) return
    const pr = call(() => root.getPlayerResponse?.())
    const length = Number(pr?.videoDetails?.lengthSeconds)
    const dur = call(() => root.getDuration?.())
    if (!Number.isFinite(dur) || dur <= 0) return
    rec.stitchedChecked = true
    const stats = call(() => JSON.stringify(root.getStatsForNerds?.() ?? {})) || ""
    W.stitched.push({
      player: id,
      ssapOrSsdai: /SSAP|SSDAI/.test(stats),
      statsReadable: stats.length > 2,
      durationMinusLengthSec: Number.isFinite(length) ? +(dur - length).toFixed(2) : null,
      adShowing: root.classList.contains("ad-showing"),
      live: Boolean(pr?.videoDetails?.isLive)
    })
  }

  // ---------- attaching to players ----------

  const attachVideo = (root, id, video) => {
    if (video.__ytptWatched) return
    video.__ytptWatched = true
    let contentSrc = null
    let lastTick = null
    for (const type of ["play", "pause", "ended"])
      video.addEventListener(type, () => {
        log({ type: `video:${type}`, player: id, where: where(root), hidden: document.hidden, muted: video.muted, adShowing: root.classList.contains("ad-showing") })
        if (type === "pause" && document.hidden && W.hidden.pausedWhileHidden.length < 20)
          W.hidden.pausedWhileHidden.push({ player: id, muted: video.muted, hiddenForMs: W.hidden.hiddenSince ? Date.now() - W.hidden.hiddenSince : null })
      })
    video.addEventListener("timeupdate", () => {
      const t = Date.now()
      if (lastTick != null) {
        const list = document.hidden ? W.hidden.gaps.hidden : W.hidden.gaps.visible
        if (list.length < 4000) list.push(t - lastTick)
      }
      lastTick = t
      if (!root.classList.contains("ad-showing") && video.src) contentSrc = video.src
    })
    video.__ytptContentSrc = () => contentSrc
  }

  const attachPlayer = (root) => {
    const id = root.id || "player"
    if (typeof root.getPlayerState !== "function") return
    if (!root.__ytptApi) {
      root.__ytptApi = true
      const add = (name, fn) => {
        try {
          root.addEventListener(name, fn)
          W.apiAttach[`${id}:${name}`] = true
        } catch {
          W.apiAttach[`${id}:${name}`] = false
        }
      }
      add("onAdStart", () => {
        W.adSessions++
        log({ type: "onAdStart", player: id, where: where(root), classes: adClasses(root) })
      })
      add("onAdEnd", () => log({ type: "onAdEnd", player: id, where: where(root), classes: adClasses(root) }))
      add("onStateChange", (s) => {
        log({ type: "onStateChange", state: s, player: id, where: where(root) })
        if (s === 1) {
          const rec = perVideo.get(id)
          if (rec && !rec.sawPlaying) {
            rec.sawPlaying = true
            const entry = W.beforePlay.find((b) => b.player === id && b.playing === null)
            if (entry) entry.playing = videoDataView(root)
          }
        }
      })
      add("onVideoDataChange", (d) => {
        log({ type: "onVideoDataChange", player: id, where: where(root), kind: typeof d === "object" ? d?.type : typeof d })
        onVideoChange(root, id)
      })
    }
    const video = root.querySelector("video")
    if (video) attachVideo(root, id, video)
  }

  document.addEventListener("yt-player-updated", () => {
    const root = document.querySelector("#movie_player")
    log({ type: "yt-player-updated", where: root ? where(root) : "?" })
  }, true)

  document.addEventListener(
    "yt-navigate-finish",
    (e) => {
      const d = e.detail || {}
      if (d.pageType !== "shorts" && !location.pathname.startsWith("/shorts/")) return
      const reel = d.endpoint?.reelWatchEndpoint
      const rec = {
        t: now(),
        isAdFlag: reel?.adClientParams?.isAd ?? null,
        adClientParamsKeys: reel?.adClientParams ? Object.keys(reel.adClientParams) : null,
        urlIsShorts: location.pathname.startsWith("/shorts/"),
        reelIdMatchesUrl: reel?.videoId ? reel.videoId === urlVideoId() : null
      }
      setTimeout(() => {
        const sp = document.querySelector("#shorts-player")
        rec.adShowingAfter1500ms = sp ? sp.classList.contains("ad-showing") : null
        rec.getVideoDataMatchesUrlAfter1500ms = sp ? call(() => sp.getVideoData?.()?.video_id === urlVideoId()) ?? null : null
      }, 1500)
      if (W.shortsNav.length < 40) W.shortsNav.push(rec)
    },
    true
  )

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) W.hidden.hiddenSince = Date.now()
    else if (W.hidden.hiddenSince) {
      if (W.hidden.periods.length < 20) W.hidden.periods.push({ hiddenMs: Date.now() - W.hidden.hiddenSince })
      W.hidden.hiddenSince = null
    }
  })

  // One poll a second: attach to new players, sample ads and live flags.
  setInterval(() => {
    for (const root of document.querySelectorAll("#movie_player, #shorts-player")) {
      attachPlayer(root)
      const id = root.id
      if (typeof root.getVideoData === "function") onVideoChange(root, id)
      checkStitched(root, id)
      const video = root.querySelector("video")
      if (root.classList.contains("ad-showing") && video && W.adSamples.length < 40) {
        const cs = video.__ytptContentSrc?.()
        W.adSamples.push({
          t: now(),
          player: id,
          where: where(root),
          classes: adClasses(root),
          video: { currentTime: +video.currentTime.toFixed(2), duration: Number.isFinite(video.duration) ? +video.duration.toFixed(2) : null, srcKind: video.src ? (video.src.startsWith("blob:") ? "blob" : "url") : "none", srcDiffersFromContent: cs ? video.src !== cs : null },
          playerApi: {
            getCurrentTime: call(() => +root.getCurrentTime().toFixed(2)),
            getCurrentTime2: call(() => +root.getCurrentTime(2).toFixed(2)),
            getDuration: call(() => +root.getDuration().toFixed(2)),
            getPresentingPlayerType: call(() => root.getPresentingPlayerType()),
            getVideoDataMatchesUrl: call(() => root.getVideoData().video_id === urlVideoId())
          }
        })
      }
      if (id === "movie_player") {
        const rec = perVideo.get(id)
        if (rec && (rec.flags.isLiveContent || rec.flags.isLive || rec.flags.isUpcoming)) {
          const f = liveFlags(root)
          if (JSON.stringify(f) !== JSON.stringify(rec.flags) && W.live.length < 20) {
            W.live.push({ t: now(), from: rec.flags, to: f, lastEvents: W.events.slice(-6).map((e) => e.type + (e.state != null ? `:${e.state}` : "")) })
            rec.flags = f
          }
        }
      }
    }
  }, 1000)

  // ---------- summaries for the report ----------

  const gapStats = (gaps) => {
    if (!gaps.length) return { count: 0 }
    const s = [...gaps].sort((a, b) => a - b)
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
    return { count: s.length, median: q(0.5), p90: q(0.9), max: s.at(-1), over1s: s.filter((x) => x > 1000).length, over5s: s.filter((x) => x > 5000).length }
  }
  W.summary = () => ({
    sinceLoadMs: now(),
    apiListenersAttached: W.apiAttach,
    events: W.events.slice(-60),
    adSessions: W.adSessions,
    adSamples: W.adSamples,
    stitched: W.stitched,
    shortsNav: W.shortsNav,
    live: W.live,
    playbackModes: W.playbackModes,
    beforePlay: W.beforePlay,
    hidden: { periods: W.hidden.periods, gapsHidden: gapStats(W.hidden.gaps.hidden), gapsVisible: gapStats(W.hidden.gaps.visible), pausedWhileHidden: W.hidden.pausedWhileHidden }
  })
})()
