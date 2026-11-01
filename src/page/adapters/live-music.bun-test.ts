import { expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createLiveMusicBindings, createLiveMusicPage } from "./live-music"
import { queueEntry } from "../music-gateway.specimens"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://music.youtube.com/watch?v=synthetic01" })
else (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL("https://music.youtube.com/watch?v=synthetic01")

const commands: unknown[] = []
class MenuItem extends HTMLElement { ytmusicServiceMenuItemBehavior = { handleCommand: (command: unknown) => { commands.push(command) } } }
class QueuePanel extends HTMLElement {}
if (!customElements.get("ytmusic-menu-service-item-renderer")) customElements.define("ytmusic-menu-service-item-renderer", MenuItem)
if (!customElements.get("ytmusic-player-queue")) customElements.define("ytmusic-player-queue", QueuePanel)

function page() {
  document.body.replaceChildren()
  const wrapped = { playlistPanelVideoWrapperRenderer: { primaryRenderer: queueEntry("queued00002", 1) } }
  let state = { queue: { items: [queueEntry("synthetic01", 0), wrapped] as unknown[] } }
  const listeners = new Set<() => void>()
  const store = { getState: () => state, dispatch() {}, subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) } }
  const queue = { store, getItems: () => state.queue.items, getCurrentItemIndex: () => 0, removeItem() {} }
  const app = Object.assign(document.createElement("ytmusic-app"), {
    queue, networkManager: { fetch: () => Promise.resolve({}) }, handleServiceEndpoint() {}, handleNavigationEndpoint() {}
  })
  const panel = Object.assign(document.createElement("ytmusic-player-queue"), { queue, data: state.queue.items, onDrop() {} })
  panel.id = "queue"
  document.body.append(app, panel)
  const drops: { index: number; data: unknown }[] = []
  panel.addEventListener("ytmusic-reorderable-list-drop", event => {
    const dragEl = event instanceof CustomEvent ? event.detail.dragEl : undefined
    drops.push({ index: [...dragEl.parentElement.children].indexOf(dragEl), data: dragEl.data })
  })
  return {
    app, panel, wrapped, drops, listeners,
    set(next: typeof state) { state = next; for (const listener of [...listeners]) listener() }
  }
}

test("the live port finds each YouTube Music handler and checks the reorder path as ARC-ACC-29 says", () => {
  const p = page(), port = createLiveMusicPage({ window, document })
  for (const handler of ["menu-item", "replay", "queue", "reorder", "service", "navigation"] as const) expect(port.has(handler)).toBe(true)
  Reflect.set(p.panel, "queue", {})
  expect(port.has("reorder")).toBe(false)
  Reflect.set(p.panel, "queue", p.app.queue)
  Reflect.set(p.panel, "data", undefined)
  expect(port.has("reorder")).toBe(false)
  p.app.remove()
  expect(port.has("service")).toBe(false)
})

test("the menu item route hands the command to a detached menu item's own behaviour", () => {
  page()
  commands.length = 0
  createLiveMusicPage({ window, document }).menuItem({ queueAddEndpoint: { queueTarget: { videoId: "synthetic01" }, queueInsertPosition: "INSERT_AT_END" } })
  expect(commands).toEqual([{ queueAddEndpoint: { queueTarget: { videoId: "synthetic01" }, queueInsertPosition: "INSERT_AT_END" } }])
})

test("the reorder drop names the target index and passes the entry's renderer, wrapper included", () => {
  const p = page(), port = createLiveMusicPage({ window, document })
  port.drop(p.wrapped, 0)
  port.drop(queueEntry("synthetic01", 0), 1)
  expect(p.drops).toEqual([
    { index: 0, data: p.wrapped.playlistPanelVideoWrapperRenderer },
    { index: 1, data: queueEntry("synthetic01", 0).playlistPanelVideoRenderer }
  ])
})

test("store bindings read the app state and report only queue changes", () => {
  const p = page(), bindings = createLiveMusicBindings({ window, document })
  let changes = 0
  const stop = bindings.queueChanges?.onChange(() => { changes++ })
  expect(bindings.musicState?.read()).toMatchObject({ queue: { items: expect.any(Array) } })
  const items = [queueEntry("synthetic01", 0)]
  p.set({ queue: { items } })
  p.set({ queue: { items } })
  expect(changes).toBe(1)
  stop?.()
  expect(p.listeners.size).toBe(0)
})
