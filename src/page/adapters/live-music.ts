import type { AttemptContext, Dispatch, GatewayRequestPort, HttpAnswer, RequestSpec } from "../gateway/port"
import type { MusicPagePort } from "../gateway/music-queue"
import type { LiveReadBindings } from "../live-reads"
import { field } from "../read-parsers"

export function createLiveMusicRequests(options: { window: Window; document: Document }): GatewayRequestPort {
  const { window: win, document: doc } = options
  function manager() { return field(doc.querySelector("ytmusic-app"), "networkManager") }
  function dispatch(spec: RequestSpec, context: AttemptContext): Dispatch {
    const receiver = manager(), fetch = field(receiver, "fetch")
    if (typeof fetch !== "function") return { kind: "not-sent", cause: "missing" }
    const failure = context.check()
    if (failure) return { kind: "blocked", failure }
    const answer = new Promise<HttpAnswer>((resolve, reject) => {
      try {
        const result: unknown = Reflect.apply(fetch, receiver, [`/${spec.path}`, spec.body])
        void Promise.resolve(result).then(body => resolve({ http: 200, body }), error => {
          context.observe(error)
          const http = field(error, "status") ?? field(error, "statusCode")
          if (typeof http === "number" && Number.isInteger(http) && http >= 400 && http <= 599) {
            resolve({ http, body: field(error, "response") ?? error })
          } else reject(new Error("Music answer lost"))
        })
      } catch { reject(new Error("Music dispatch uncertain")) }
    })
    return { kind: "pending", answer, cancel() {} }
  }
  return {
    has(via) { return win.location.origin === "https://music.youtube.com" && via === "music" && typeof field(manager(), "fetch") === "function" },
    send(via, spec, context) {
      if (win.location.origin !== "https://music.youtube.com" || via !== "music") return { kind: "not-sent", cause: "missing" }
      return dispatch(spec, context)
    }
  }
}

const musicOrigin = "https://music.youtube.com"
const toastActions = new Set(["yt-add-to-toast-action", "yt-open-popup-action"])

function call(receiver: unknown, name: string, args: unknown[] = []): unknown {
  const method = field(receiver, name)
  if (typeof method !== "function") throw new Error("Music handler missing")
  return Reflect.apply(method, receiver, args)
}
function callable(receiver: unknown, name: string): boolean { return typeof field(receiver, name) === "function" }

export function createLiveMusicPage(options: { window: Window; document: Document }): MusicPagePort {
  const { window: win, document: doc } = options
  const live = () => win.location.origin === musicOrigin
  const app = () => live() ? doc.querySelector("ytmusic-app") : null
  const queue = () => field(app(), "queue")
  const store = () => field(queue(), "store")
  const panel = () => live() ? doc.querySelector("ytmusic-player-queue#queue") ?? doc.querySelector("ytmusic-player-queue") : null
  return {
    has(handler) {
      switch (handler) {
        case "menu-item": return live() && win.customElements.get("ytmusic-menu-service-item-renderer") !== undefined
        case "replay": return callable(field(app(), "networkManager"), "fetch") && callable(store(), "dispatch") && callable(store(), "getState") &&
          callable(queue(), "getItems") && callable(queue(), "getCurrentItemIndex")
        case "queue": return callable(queue(), "removeItem") && callable(queue(), "getItems")
        case "reorder": {
          const element = panel()
          return element !== null && win.customElements.get("ytmusic-player-queue") !== undefined && queue() !== undefined &&
            field(element, "queue") === queue() && Array.isArray(field(element, "data")) && callable(element, "onDrop")
        }
        case "service": return callable(app(), "handleServiceEndpoint")
        case "navigation": return callable(app(), "handleNavigationEndpoint")
      }
    },
    items: () => call(queue(), "getItems"),
    current: () => call(queue(), "getCurrentItemIndex"),
    state: () => call(store(), "getState"),
    onToast(seen) {
      const listener = (event: Event) => {
        const name = field("detail" in event ? event.detail : undefined, "actionName")
        if (typeof name === "string" && toastActions.has(name)) seen()
      }
      doc.addEventListener("yt-action", listener, true)
      return () => doc.removeEventListener("yt-action", listener, true)
    },
    menuItem(command) {
      const behaviour = field(doc.createElement("ytmusic-menu-service-item-renderer"), "ytmusicServiceMenuItemBehavior")
      call(behaviour, "handleCommand", [command])
    },
    fetchQueue: body => Promise.resolve(call(field(app(), "networkManager"), "fetch", ["/music/get_queue", body])),
    dispatch(action) { call(store(), "dispatch", [action]) },
    remove(id) { call(queue(), "removeItem", [id]) },
    panel: () => field(panel(), "data"),
    drop(entry, to) {
      const element = panel()
      if (!element) throw new Error("Music queue panel missing")
      const parent = doc.createElement("div")
      for (let index = 0; index <= to; index++) parent.append(doc.createElement("div"))
      const dragEl = parent.children[to]
      if (!dragEl) throw new Error("Music reorder target missing")
      Reflect.set(dragEl, "data", field(entry, "playlistPanelVideoRenderer") ?? field(entry, "playlistPanelVideoWrapperRenderer"))
      element.dispatchEvent(new CustomEvent("ytmusic-reorderable-list-drop", { detail: { dragEl }, bubbles: true, composed: true }))
    },
    service(endpoint) { call(app(), "handleServiceEndpoint", [endpoint]) },
    navigate(endpoint) { call(app(), "handleNavigationEndpoint", [endpoint]) }
  }
}

export function createLiveMusicBindings(options: { window: Window; document: Document }): LiveReadBindings {
  const { window: win, document: doc } = options
  const store = () => win.location.origin === musicOrigin ? field(doc.querySelector("ytmusic-app"), "queue", "store") : undefined
  return {
    musicState: { read: () => callable(store(), "getState") ? call(store(), "getState") : undefined },
    queueChanges: {
      onChange(changed) {
        const source = store()
        let items = field(call(source, "getState"), "queue", "items")
        const stop = call(source, "subscribe", [() => {
          const next = field(call(source, "getState"), "queue", "items")
          if (next !== items) { items = next; changed() }
        }])
        if (typeof stop !== "function") throw new Error("Music store subscription missing")
        return () => { Reflect.apply(stop, undefined, []) }
      }
    }
  }
}
