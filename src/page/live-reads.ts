import type { Site, WatchId } from "../shared/contracts"
import type { PageEvent, PageReadPort } from "./read-port"
import { readWatches } from "./read-port"
import { field } from "./read-parsers"

export type RawReadBinding = { read(): unknown }
export type RawChangeBinding = { onChange(changed: () => void): () => void }
export type LiveReadBindings = {
  navigation?: RawReadBinding
  musicState?: RawReadBinding
  castPlayer?: RawReadBinding
  queueChanges?: RawChangeBinding
}
export interface LiveReadPort extends PageReadPort {
  readonly disposed: boolean
  dispose(): void
}

type Sink = (detail: unknown) => void
type Root = { node: Element; video: Element | null; ad: boolean; media: boolean; stops: (() => void)[] }
const targetRenderers = [
  "ytmusic-responsive-list-item-renderer",
  "ytmusic-two-row-item-renderer",
  "ytmusic-player-queue-item",
  "ytmusic-responsive-header-renderer",
  "ytd-video-renderer",
  "ytd-rich-grid-media",
  "ytd-grid-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-playlist-panel-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model",
  "ytm-shorts-lockup-view-model"
].join(",")

function invoke(receiver: unknown, name: string): unknown {
  const method = field(receiver, name)
  return typeof method === "function" ? Reflect.apply(method, receiver, []) : undefined
}
function callable(receiver: unknown, name: string): boolean {
  return typeof field(receiver, name) === "function"
}

export function createLiveReadPort(options: { site: Site; window: Window; document: Document; bindings?: LiveReadBindings }): LiveReadPort {
  const { site, window: win, document: doc } = options
  const bindings = options.bindings ?? {}
  const sinks: Record<PageEvent, Set<Sink>> = {
    navigation: new Set(),
    playerIdentity: new Set(),
    player: new Set(),
    music: new Set(),
    queue: new Set()
  }
  const roots = new Map<string, Root>()
  const navigationStops: (() => void)[] = []
  const identityStops: (() => void)[] = []
  let queueStop: (() => void) | undefined
  let rawNavigation: unknown
  let disposed = false

  function emit(event: PageEvent, detail?: unknown): void {
    if (disposed) return
    for (const sink of [...sinks[event]]) {
      if (!sinks[event].has(sink) || disposed) continue
      try {
        sink(detail)
      } catch {}
    }
  }
  function listen(node: EventTarget, event: string, changed: EventListener): () => void {
    let active = true
    const listener: EventListener = value => {
      if (active && !disposed) changed(value)
    }
    node.addEventListener(event, listener)
    return () => {
      if (active) {
        active = false
        node.removeEventListener(event, listener)
      }
    }
  }
  function clear(stops: (() => void)[]): void {
    for (const stop of stops.splice(0)) {
      try {
        stop()
      } catch {}
    }
  }
  function needsIdentity(): boolean {
    return sinks.playerIdentity.size + sinks.player.size + sinks.music.size > 0
  }
  function needsMedia(): boolean {
    return sinks.player.size + sinks.music.size > 0
  }
  function stopRoots(): void {
    for (const root of roots.values()) clear(root.stops)
    roots.clear()
  }
  function reconcileRoots(): void {
    if (disposed || !needsIdentity()) {
      stopRoots()
      return
    }
    for (const id of site === "www" ? ["movie_player", "shorts-player"] : ["movie_player"]) {
      const node = doc.getElementById(id)
      const video = node?.querySelector("video") ?? null
      const old = roots.get(id)
      if (old?.node === node && old?.video === video && old?.media === needsMedia()) continue
      if (old) {
        clear(old.stops)
        roots.delete(id)
      }
      if (!node) continue
      const root: Root = { node, video, ad: old?.node === node && old.video === video && old.ad, media: needsMedia(), stops: [] }
      roots.set(id, root)
      const current = () => !disposed && roots.get(id) === root && doc.getElementById(id) === node
      const changed = () => {
        if (!current()) return
        reconcileRoots()
        emit("playerIdentity", { id })
      }
      root.stops.push(listen(node, "onVideoDataChange", changed))
      if (needsMedia()) {
        root.stops.push(
          listen(node, "onAdStart", () => {
            if (current()) {
              root.ad = true
              emit("player")
              emit("music")
            }
          })
        )
        root.stops.push(
          listen(node, "onAdEnd", () => {
            if (current()) {
              root.ad = false
              emit("player")
              emit("music")
            }
          })
        )
        if (video)
          for (const event of ["timeupdate", "play", "pause", "seeking", "seeked", "ratechange", "durationchange", "loadedmetadata", "emptied"]) {
            root.stops.push(
              listen(video, event, () => {
                if (current() && node.querySelector("video") === video) {
                  emit("player")
                  emit("music")
                }
              })
            )
          }
      }
    }
  }
  function scopedPlayerUpdate(event: Event): void {
    const target = event.target
    if (target === null || !("nodeType" in target) || !isElement(target)) return
    const known = target.closest("#movie_player, #shorts-player, ytd-player[context='WEB_PLAYER_CONTEXT_CONFIG_ID_KEVLAR_WATCH']")
    if (!known) return
    reconcileRoots()
    emit("playerIdentity", { id: known.id === "movie_player" || known.id === "shorts-player" ? known.id : known.querySelector("#movie_player")?.id })
  }
  function updateEvents(): void {
    const needsNavigation = sinks.navigation.size > 0 || needsIdentity()
    if (needsNavigation && navigationStops.length === 0) {
      navigationStops.push(
        listen(doc, "yt-navigate-finish", event => {
          rawNavigation = "detail" in event ? event.detail : undefined
          reconcileRoots()
          emit("navigation", rawNavigation)
        })
      )
    } else if (!needsNavigation) {
      clear(navigationStops)
      rawNavigation = undefined
    }
    if (needsIdentity() && identityStops.length === 0) identityStops.push(listen(doc, "yt-player-updated", scopedPlayerUpdate))
    else if (!needsIdentity()) clear(identityStops)
    reconcileRoots()
    if (sinks.queue.size > 0 && !queueStop) {
      if (!bindings.queueChanges) throw new Error("Missing queue change binding")
      let active = true
      const release = bindings.queueChanges.onChange(() => {
        if (active && !disposed) emit("queue")
      })
      const stop = () => {
        if (active) {
          active = false
          release()
        }
      }
      if (disposed || sinks.queue.size === 0) stop()
      else queueStop = stop
    } else if (sinks.queue.size === 0 && queueStop) {
      const stop = queueStop
      queueStop = undefined
      stop()
    }
  }
  function player(id: string): unknown {
    reconcileRoots()
    const root = doc.getElementById(id)
    if (!root) return undefined
    const video = root.querySelector("video")
    return {
      adShowing: root.classList.contains("ad-showing"),
      adActive: roots.get(id)?.node === root && roots.get(id)?.ad === true,
      get presentingPlayerType() {
        return invoke(root, "getPresentingPlayerType")
      },
      get videoData() {
        return invoke(root, "getVideoData")
      },
      get response() {
        return invoke(root, "getPlayerResponse")
      },
      get currentTime() {
        return invoke(root, "getCurrentTime")
      },
      get duration() {
        return invoke(root, "getDuration")
      },
      get video() {
        return video
          ? {
              currentTime: field(video, "currentTime"),
              duration: field(video, "duration"),
              playbackRate: field(video, "playbackRate"),
              paused: field(video, "paused"),
              seeking: field(video, "seeking")
            }
          : undefined
      }
    }
  }
  function targetData(target?: Element): unknown {
    if (!target) return undefined
    const renderer = target.closest(targetRenderers)
    if (!renderer) return undefined
    const modern = renderer.matches("yt-lockup-view-model, ytm-shorts-lockup-view-model")
    if (!modern) return field(renderer, "data")
    if (site !== "www" || !renderer.isConnected || renderer.ownerDocument !== doc || renderer.closest("ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer")) return undefined
    const key = renderer.matches("yt-lockup-view-model") ? "lockupViewModel" : "shortsLockupViewModel"
    const data = field(renderer, "data")
    const wrapped = field(data, key)
    const direct = field(renderer, key)
    const other = key === "lockupViewModel" ? "shortsLockupViewModel" : "lockupViewModel"
    if (field(data, other) !== undefined || field(renderer, other) !== undefined) return undefined
    if (
      wrapped !== undefined &&
      ["contentId", "videoId", "contentType", "onTap", "title", "metadata", "overlayMetadata", "rendererContext", "navigationEndpoint"].some(name => field(data, name) !== undefined)
    )
      return undefined
    const candidate = wrapped ?? data
    if (candidate !== undefined && direct !== undefined && candidate !== direct) return undefined
    const raw = candidate ?? direct
    if (key === "lockupViewModel" ? field(raw, "metadata", "lockupMetadataViewModel") === undefined : field(raw, "overlayMetadata") === undefined || field(raw, "onTap") === undefined) return undefined
    return raw
  }
  const app = () => doc.querySelector("ytmusic-app")
  const queue = () => field(app(), "queue")
  function present(id: WatchId): boolean {
    if (disposed) return false
    if (id === readWatches.identity) return callable(field(win, "ytcfg"), "get")
    if (id === readWatches.navigation) return bindings.navigation !== undefined || rawNavigation !== undefined
    if (id === readWatches.location) return true
    if (id === readWatches.watchPlayer || id === readWatches.shortsPlayer) {
      const node = doc.getElementById(id === readWatches.watchPlayer ? "movie_player" : "shorts-player")
      return node !== null && callable(node, "getVideoData") && callable(node, "getPlayerResponse")
    }
    if (id === readWatches.targetData)
      return [...doc.querySelectorAll(targetRenderers)].some(
        renderer =>
          "data" in renderer || (site === "www" && renderer.matches("yt-lockup-view-model, ytm-shorts-lockup-view-model") && ("lockupViewModel" in renderer || "shortsLockupViewModel" in renderer))
      )
    if (id === readWatches.targetContext) return site === "music" && doc.querySelector(targetRenderers) !== null
    if (id === readWatches.mediaMetadata) return site === "music" && field(win, "navigator", "mediaSession") !== undefined
    if (id === readWatches.musicQueue) return site === "music" && callable(queue(), "getItems")
    if (id === readWatches.musicState) return site === "music" && bindings.musicState !== undefined
    if (id === readWatches.castPlayer) return site === "music" && bindings.castPlayer !== undefined
    if (id === readWatches.queueChanges) return site === "music" && bindings.queueChanges !== undefined
    return false
  }
  return {
    get disposed() {
      return disposed
    },
    config(key) {
      if (disposed) return undefined
      const ytcfg = field(win, "ytcfg"),
        get = field(ytcfg, "get")
      return typeof get === "function" ? Reflect.apply(get, ytcfg, [key]) : undefined
    },
    read(what, target) {
      if (disposed) return undefined
      switch (what) {
        case "navigation":
          return bindings.navigation ? bindings.navigation.read() : rawNavigation
        case "location":
          return { pathname: win.location.pathname, search: win.location.search }
        case "watchPlayer":
          return player("movie_player")
        case "shortsPlayer":
          return site === "www" ? player("shorts-player") : undefined
        case "targetData":
          return targetData(target)
        case "targetContext":
          return site === "music" && target?.closest(targetRenderers) ? { inAutomix: target.closest("#automix-contents") !== null } : undefined
        case "mediaMetadata":
          return site === "music" ? field(win, "navigator", "mediaSession", "metadata") : undefined
        case "musicQueue":
          return site === "music" ? invoke(queue(), "getItems") : undefined
        case "musicState":
          return site === "music" ? bindings.musicState?.read() : undefined
        case "castPlayer":
          return site === "music" ? bindings.castPlayer?.read() : undefined
      }
    },
    on(event, changed) {
      if (disposed) return () => {}
      const sink: Sink = detail => changed(detail)
      sinks[event].add(sink)
      try {
        updateEvents()
      } catch (error) {
        sinks[event].delete(sink)
        updateEvents()
        throw error
      }
      let active = true
      return () => {
        if (!active) return
        active = false
        sinks[event].delete(sink)
        updateEvents()
      }
    },
    has: present,
    dispose() {
      if (disposed) return
      disposed = true
      for (const group of Object.values(sinks)) group.clear()
      clear(navigationStops)
      clear(identityStops)
      stopRoots()
      const stop = queueStop
      queueStop = undefined
      try {
        stop?.()
      } finally {
        rawNavigation = undefined
      }
    }
  }
}

function isElement(value: unknown): value is Element {
  return value !== null && typeof value === "object" && field(value, "nodeType") === 1 && typeof field(value, "closest") === "function"
}
