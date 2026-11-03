import { field } from "./read-parsers"
import { rawPlayer } from "./gateway.specimens"

export function defineRaw(target: object, key: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
  return () => {
    if (previous) Object.defineProperty(target, key, previous)
    else Reflect.deleteProperty(target, key)
  }
}

export function installRawPlayer(doc: Document, id = "movie_player", initial: unknown = rawPlayer()) {
  const root = doc.createElement("div"),
    video = doc.createElement("video")
  root.id = id
  root.append(video)
  let raw = initial
  const calls: string[] = []
  const method = (name: string, key: string) => () => {
    calls.push(name)
    return field(raw, key)
  }
  Object.defineProperties(root, {
    getVideoData: { value: method("getVideoData", "videoData"), configurable: true },
    getPlayerResponse: { value: method("getPlayerResponse", "response"), configurable: true },
    getCurrentTime: { value: method("getCurrentTime", "currentTime"), configurable: true },
    getDuration: { value: method("getDuration", "duration"), configurable: true },
    getPresentingPlayerType: { value: method("getPresentingPlayerType", "presentingPlayerType"), configurable: true }
  })
  for (const key of ["currentTime", "duration", "paused", "seeking", "playbackRate"]) {
    Object.defineProperty(video, key, { configurable: true, get: () => field(raw, "video", key) })
  }
  doc.body.append(root)
  return {
    root,
    video,
    calls,
    update(value: unknown) {
      raw = value
    }
  }
}

export function trackNativeEvents(node: EventTarget) {
  const originalAdd = node.addEventListener.bind(node),
    originalRemove = node.removeEventListener.bind(node)
  const records: { type: string; listener: EventListenerOrEventListenerObject; active: boolean; removals: number }[] = []
  node.addEventListener = (type, listener, options) => {
    if (listener) records.push({ type, listener, active: true, removals: 0 })
    originalAdd(type, listener, options)
  }
  node.removeEventListener = (type, listener, options) => {
    const record = records.find(value => value.type === type && value.listener === listener && value.active)
    if (record) {
      record.active = false
      record.removals++
    }
    originalRemove(type, listener, options)
  }
  return {
    records,
    active() {
      return records.filter(record => record.active).length
    },
    stale(type: string, event: Event) {
      for (const record of records) {
        if (record.type !== type || record.active) continue
        if (typeof record.listener === "function") record.listener(event)
        else record.listener.handleEvent(event)
      }
    },
    restore() {
      node.addEventListener = originalAdd
      node.removeEventListener = originalRemove
    }
  }
}
