import { createGateway } from "./gateway"
import { scriptedPage, syntheticVideo } from "./gateway.specimens"
import type { GatewayClock } from "./gateway/lanes"
import type { MusicPagePort } from "./gateway/music-queue"
import { musicHandlers } from "./gateway/port"
import type { MusicHandler } from "./gateway/port"
import { field } from "./read-parsers"
import type { BreakageSignal } from "../shared/contracts"

export const musicSpecimenProvenance = {
  kind: "specimen",
  evidence: [
    "git show c6e9c202f:docs/research/youtube-music.md (sections 2.1 to 2.7)",
    "git show e5ec1fc65:docs/research/queue-reorder.md (sections 3.1 and 3.3)",
    "git show 53833ffb3:probes/live-checks/page-main.js (ytm helpers, queueAddReplay, menuItemBehaviour, moveTo)"
  ],
  unverified: [
    "M1: the menu-item route and queue replay inserting signed in, and what music/get_queue returns signed in.",
    "M3: the likeStatus.videos store path after handleServiceEndpoint, the library toggle's signed-in endpoints and whether either shows a toast.",
    "M5: castStatus as a boolean at the root of the app store.",
    "T28.1 to T28.7: the reorder drop moving the entry synchronously and panel.data staying the store's queue.items array.",
    "Toasts: YouTube Music raising its toast through a yt-action event named yt-add-to-toast-action or yt-open-popup-action."
  ]
}

export const albumId = "OLAK5uy_synthetic"
export const albumTracks = ["album000001", "album000002", "album000003"]

export class ManualClock implements GatewayClock {
  private at = 0
  private serial = 0
  private timers = new Map<number, { at: number; callback: () => void }>()
  now() { return this.at }
  after(ms: number, callback: () => void) {
    const id = ++this.serial
    this.timers.set(id, { at: this.at + ms, callback })
    return () => { this.timers.delete(id) }
  }
  advance(ms: number) {
    const end = this.at + ms
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
      if (!next) break
      this.timers.delete(next[0])
      this.at = next[1].at
      next[1].callback()
    }
    this.at = end
  }
}
export async function settle(): Promise<void> { for (let i = 0; i < 40; i++) await Promise.resolve() }

export function queueEntry(videoId: string, index: number | undefined) {
  const watchEndpoint = index === undefined ? { videoId } : { videoId, index }
  return { playlistPanelVideoRenderer: { videoId, title: { runs: [{ text: `Song ${videoId}` }] }, navigationEndpoint: { watchEndpoint } } }
}
export function insertEndpoint(position: "next" | "end", target: { videoId: string } | { playlistId: string } = { videoId: "inserted001" }) {
  return { queueAddEndpoint: {
    queueTarget: { ...target, onEmptyQueue: { watchEndpoint: target } },
    queueInsertPosition: position === "next" ? "INSERT_AFTER_CURRENT_VIDEO" : "INSERT_AT_END",
    commands: [{ addToToastAction: { item: { notificationTextRenderer: { successResponseText: { runs: [{ text: "Song will play next" }] } } } } }]
  } }
}

type Fault = "menu-item-throws" | "menu-item-noop" | "remove-noop" | "drop-noop" | "service-noop" | "navigate-noop" | "toast" | "stale-panel"
export type Call = { kind: string; args: unknown }

export function musicWorld(videos: string[] = [syntheticVideo, "queued00002", "queued00003", "queued00004"], current = 0, signedIn = true) {
  const clock = new ManualClock()
  const page = scriptedPage({ location: { pathname: "/watch", search: `?v=${syntheticVideo}` }, musicState: { castStatus: false } })
  if (!signedIn) page.config.LOGGED_IN = false
  page.setQueueChanges(false)
  let serial = 0
  const state = {
    queue: { items: videos.map(videoId => queueEntry(videoId, serial++)) as unknown[], queueContextParams: "CTX-1", nextQueueItemId: 0 },
    likeStatus: { videos: {} as Record<string, string> }
  }
  state.queue.nextQueueItemId = serial
  const world = {
    clock, page, state, current, itemReads: 0, calls: [] as Call[], signals: [] as BreakageSignal[],
    handlers: new Set<MusicHandler>(musicHandlers), faults: new Set<Fault>(),
    toast: undefined as (() => void) | undefined,
    ids: () => state.queue.items.map(item => field(item, "playlistPanelVideoRenderer", "navigationEndpoint", "watchEndpoint", "index")),
    videos: () => state.queue.items.map(item => field(item, "playlistPanelVideoRenderer", "videoId")),
    setItems(items: unknown[]) { state.queue = { ...state.queue, items }; page.emit("queue") },
    addItems(entries: unknown[], index: number) {
      const items = [...state.queue.items]
      const stamped = entries.map(item => {
        const renderer = field(item, "playlistPanelVideoRenderer")
        const videoId = String(field(renderer, "videoId"))
        return queueEntry(videoId, state.queue.nextQueueItemId++)
      })
      items.splice(index, 0, ...stamped)
      world.setItems(items)
      if (world.faults.has("toast")) world.toast?.()
    }
  }
  const port: MusicPagePort = {
    has: handler => world.handlers.has(handler),
    items: () => { world.itemReads++; return state.queue.items },
    current: () => world.current,
    state: () => state,
    onToast(seen) { world.toast = seen; return () => { world.toast = undefined } },
    menuItem(command) {
      world.calls.push({ kind: "menuItem", args: command })
      if (world.faults.has("menu-item-throws")) throw new Error("menu item threw")
      if (world.faults.has("menu-item-noop")) return
      const body = field(command, "queueAddEndpoint"), target = field(body, "queueTarget")
      const videoId = field(target, "videoId"), playlistId = field(target, "playlistId")
      const added = typeof videoId === "string" ? [videoId] : playlistId === albumId ? albumTracks : []
      const next = field(body, "queueInsertPosition") === "INSERT_AFTER_CURRENT_VIDEO"
      world.addItems(added.map(id => queueEntry(id, undefined)), next ? world.current + 1 : state.queue.items.length)
    },
    fetchQueue(body) {
      world.calls.push({ kind: "fetchQueue", args: body })
      const videoIds = field(body, "videoIds")
      const added = Array.isArray(videoIds) ? videoIds.map(String) : field(body, "playlistId") === albumId ? albumTracks : []
      return Promise.resolve({ queueDatas: added.map(id => ({ content: queueEntry(id, undefined) })), queueContextParams: "CTX-2" })
    },
    dispatch(action) {
      world.calls.push({ kind: "dispatch", args: action })
      if (action.type === "SET_QUEUE_CONTEXT_PARAMS") state.queue = { ...state.queue, queueContextParams: String(action.payload) }
      if (action.type === "ADD_ITEMS") {
        const items = field(action.payload, "items"), index = field(action.payload, "index")
        if (Array.isArray(items) && typeof index === "number") world.addItems(items, index)
      }
    },
    remove(id) {
      world.calls.push({ kind: "remove", args: id })
      if (!world.faults.has("remove-noop")) world.setItems(state.queue.items.filter((_, index) => String(world.ids()[index]) !== id))
    },
    panel: () => world.faults.has("stale-panel") ? [...state.queue.items] : state.queue.items,
    drop(entry, to) {
      world.calls.push({ kind: "drop", args: { entry, to } })
      if (world.faults.has("drop-noop")) return
      const items = state.queue.items.filter(item => item !== entry)
      items.splice(to, 0, entry)
      world.setItems(items)
    },
    service(endpoint) {
      world.calls.push({ kind: "service", args: endpoint })
      const status = field(endpoint, "likeEndpoint", "status"), videoId = field(endpoint, "likeEndpoint", "target", "videoId")
      if (!world.faults.has("service-noop") && typeof status === "string" && typeof videoId === "string") state.likeStatus.videos[videoId] = status
    },
    navigate(endpoint) {
      world.calls.push({ kind: "navigate", args: endpoint })
      if (world.faults.has("navigate-noop")) return
      const browseId = field(endpoint, "browseEndpoint", "browseId")
      if (typeof browseId === "string") page.values.location = { pathname: `/browse/${browseId}`, search: "" }
      else world.setItems([queueEntry("mixstart001", state.queue.nextQueueItemId++)])
    }
  }
  const gateway = createGateway({ site: "music", page: page.port, music: port, clock, now: () => clock.now(), signals: signal => world.signals.push(signal) })
  return Object.assign(world, { port, gateway })
}
