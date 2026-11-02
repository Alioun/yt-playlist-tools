import { afterEach, expect, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { boot, type Background } from "../../src/background/boot"
import type { NativeBrowser } from "../../src/background/adapters/browser"
import { timerDeadline } from "../../src/background/adapters/runtime"
import { createBackend } from "../../src/ui/backend/core"
import type { Backend } from "../../src/ui/backend/backend"
import { CONTRACT_VERSION } from "../../src/shared/contracts/protocol"
import { isGatherPush, type GatherLine, type GatherPush } from "../../src/shared/contracts/ui-gather"
import { platform } from "../../src/shared/platform"
import { scriptedMessages } from "../../tools/fixtures/localization/scripted"

const build = platform.build
const extension = "perchling-e2e"
const acct = "AAAAAAAAAAAAAAAA"
const DAY = 86_400_000
const video = (n: number) => `gat${String(n).padStart(8, "0")}`
const watch = (n: number) => `https://www.youtube.com/watch?v=${video(n)}`

type Tab = { id: number; windowId: number; index: number; url: string; title: string; active: boolean; pinned: boolean; audible: boolean
  incognito: boolean; lastAccessed: number; status: "complete"; discarded: false }
type Listener = (message: unknown, sender: unknown, respond: (answer?: unknown) => void) => boolean | undefined
type Sender = { id: string; url: string; frameId?: number; documentId?: string; tab?: { id: number; windowId: number; incognito: boolean } }

function event<T extends (...args: never[]) => unknown>() {
  const listeners = new Set<T>()
  return { listeners, addListener: (fn: T) => { listeners.add(fn) }, removeListener: (fn: T) => { listeners.delete(fn) }, hasListener: (fn: T) => listeners.has(fn) }
}
function glob(pattern: string) { return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`) }

// The browser's tab strip: windows, tabs and their places. Only the background reads and changes it, through the browser's calls.
function strip() {
  const tabs = new Map<number, Tab>()
  const windows = new Map<number, { id: number; incognito: boolean; focused: boolean }>([[1, { id: 1, incognito: false, focused: true }]])
  let serial = 100
  const inWindow = (windowId: number) => [...tabs.values()].filter(tab => tab.windowId === windowId).sort((a, b) => a.index - b.index)
  const reindex = (windowId: number) => inWindow(windowId).forEach((tab, index) => { tab.index = index })
  function open(id: number, url: string, patch: Partial<Tab> = {}) {
    const windowId = patch.windowId ?? 1
    const tab: Tab = { id, windowId, index: inWindow(windowId).length, url, title: `${url.slice(-11)} - YouTube`, active: false, pinned: false, audible: false,
      incognito: windows.get(windowId)?.incognito ?? false, lastAccessed: Date.now(), status: "complete", discarded: false, ...patch }
    tabs.set(id, tab)
    return tab
  }
  const native = {
    async query(info: { windowId?: number; active?: boolean; url?: string | string[]; discarded?: boolean }) {
      const urls = info.url === undefined ? null : (Array.isArray(info.url) ? info.url : [info.url]).map(glob)
      return [...tabs.values()].filter(tab => (info.windowId === undefined || tab.windowId === info.windowId) && (info.active === undefined || tab.active === info.active)
        && (urls === null || urls.some(url => url.test(tab.url)))).sort((a, b) => a.windowId - b.windowId || a.index - b.index).map(tab => ({ ...tab }))
    },
    async get(tabId: number) {
      const tab = tabs.get(tabId)
      if (!tab) throw new Error(`No tab with id: ${tabId}.`)
      return { ...tab }
    },
    async create(props: { windowId: number; url: string; active: boolean; index?: number }) {
      if (!windows.has(props.windowId)) throw new Error(`No window with id: ${props.windowId}.`)
      const index = props.index ?? inWindow(props.windowId).length
      for (const tab of inWindow(props.windowId)) if (tab.index >= index) tab.index++
      const tab = open(++serial, props.url, { windowId: props.windowId, index, active: props.active })
      return { ...tab }
    },
    async remove(tabIds: number[]) {
      const windowIds = new Set(tabIds.map(id => tabs.get(id)?.windowId))
      for (const id of tabIds) tabs.delete(id)
      for (const windowId of windowIds) if (windowId !== undefined) reindex(windowId)
    }
  }
  const nativeWindows = {
    async get(windowId: number) { const window = windows.get(windowId); if (!window) throw new Error(`No window with id: ${windowId}.`); return { ...window } },
    async getLastFocused() { const window = [...windows.values()].find(entry => entry.focused); if (!window) throw new Error("No window"); return { ...window } },
    async create(props: { url: string[]; focused: false }) {
      const id = Math.max(...windows.keys()) + 1
      windows.set(id, { id, incognito: false, focused: false })
      return { id, tabs: props.url.map(url => ({ ...open(++serial, url, { windowId: id }) })) }
    }
  }
  return { tabs, windows, open, native, nativeWindows, urls: (windowId = 1) => inWindow(windowId).map(tab => tab.url) }
}

// The signed-in YouTube tab our site core runs in: it answers pings and the add flow's jobs, and shows the asks it gets.
function youtube() {
  const later = new Map<string, string>()
  let entry = 0
  const toasts: unknown[] = []
  const jobs: string[] = []
  function answer(kind: string, payload: { job: { kind: string; videoId?: string; videoIds?: string[]; setVideoIds?: string[] } }): unknown {
    switch (kind) {
      case "bg.ping": return { site: "www", build, signedIn: true, acct }
      case "bg.view": return null
      case "bg.gatherToast": toasts.push(payload); return null
      case "bg.job": {
        const job = payload.job
        jobs.push(job.kind)
        const route = "e2e-route"
        switch (job.kind) {
          case "account": return { ok: true, route, data: { signedIn: true, acct } }
          case "membership": return { ok: true, route, data: [{ id: "WL", title: "Watch later", contains: [...later.values()].includes(job.videoId ?? "") }] }
          case "addBatch": return { ok: true, route, data: { results: (job.videoIds ?? []).map(videoId => {
            const setVideoId = `entry-${++entry}`
            later.set(setVideoId, videoId)
            return { videoId, setVideoId }
          }) } }
          case "removeBatch": return { ok: true, route, data: { removed: (job.setVideoIds ?? []).filter(id => later.delete(id)).length } }
          default: return { ok: false, reason: "unavailable" }
        }
      }
    }
    return undefined
  }
  return {
    later, toasts, jobs,
    receive(message: unknown) {
      const { id, kind, payload } = message as { id: string; kind: string; payload: never }
      const result = answer(kind, payload)
      return result === undefined ? undefined : { v: CONTRACT_VERSION, build, id, kind, result }
    }
  }
}

function omitAbsentKeys() {
  for (const area of [fakeBrowser.storage.local, fakeBrowser.storage.session, fakeBrowser.storage.sync]) {
    const get = area.get.bind(area)
    Object.assign(area, { async get(keys?: unknown) {
      const found: Record<string, unknown> = await get(keys as never)
      return Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined))
    } })
  }
}
function documented(name: string, data: Record<string, unknown>) { return { v: 1, gen: `gen-${name}`, at: 1, by: "e2e-device", data } }

// One browser: storage, the tab strip and YouTube outlive any background, as they do when the worker stops.
function browser(gather: Record<string, unknown>) {
  omitAbsentKeys()
  const tabs = strip(), site = youtube()
  const servingTabs = new Set([1])
  const pushes: GatherPush[] = []
  const badges: unknown[] = []
  const messagedTabs = new Set<number>()
  let popupOpen = true
  let removing: ((ids: number[]) => Promise<void>) | null = null
  const granted = ["https://www.youtube.com/*"]
  function worker() {
    const onMessage = event<Listener>()
    const onRemoved = event<(tabId: number) => void>()
    const native = {
      ...fakeBrowser,
      storage: fakeBrowser.storage,
      runtime: {
        id: extension, getURL: (path: string) => `chrome-extension://${extension}${path.startsWith("/") ? path : `/${path}`}`,
        getManifest: () => ({ version: "2.0.0", manifest_version: 3 }), onMessage, onInstalled: event(), onStartup: event(),
        // The background's own pushes reach the open extension pages, never the background itself.
        async sendMessage(message: unknown) {
          if (!isGatherPush(message, build)) return undefined
          pushes.push(message.payload)
          return popupOpen && message.payload.windowId === 1 ? { shown: true } : undefined
        }
      },
      tabs: { ...tabs.native, onRemoved,
        async remove(ids: number[]) {
          await (removing ? removing(ids) : tabs.native.remove(ids))
          for (const id of ids) for (const listener of [...onRemoved.listeners]) listener(id)
        },
        async sendMessage(tabId: number, message: unknown) {
          messagedTabs.add(tabId)
          const answer = servingTabs.has(tabId) && tabs.tabs.has(tabId) ? site.receive(message) : undefined
          if (answer === undefined) throw new Error("Could not establish connection. Receiving end does not exist.")
          return answer
        } },
      windows: tabs.nativeWindows,
      i18n: { ...scriptedMessages(), async detectLanguage() { return { isReliable: false, languages: [] } } },
      permissions: { async contains(request: { origins?: string[]; permissions?: string[] }) {
        return (request.permissions ?? []).length === 0 && (request.origins ?? []).every(origin => granted.includes(origin))
      }, onAdded: event(), onRemoved: event() },
      // The YouTube tab already runs our page half, core and kit, so the Registrar's probe finds nothing to inject.
      scripting: { async getRegisteredContentScripts() { return [] }, async registerContentScripts() {}, async updateContentScripts() {},
        async unregisterContentScripts() {},
        async executeScript(injection: { target: { tabId: number }; world: "ISOLATED" | "MAIN" }) {
          if (!servingTabs.has(injection.target.tabId)) return []
          return injection.world === "MAIN" ? [{ frameId: 0, result: true }]
            : [{ frameId: 0, documentId: "youtube-document", result: { documentId: "youtube-document", loaded: [["core-www", build], ["kit-www", build]] } }]
        } },
      commands: { onCommand: event() },
      contextMenus: { onClicked: event(), async removeAll() {}, create() {} },
      action: { async setBadgeText(details: unknown) { badges.push(["text", details]) }, async setBadgeBackgroundColor() {},
        async setTitle(details: unknown) { badges.push(["title", details]) } }
    } as unknown as NativeBrowser
    const background = boot(native, platform)
    function send(message: unknown, sender: Sender): Promise<unknown> {
      return new Promise(resolve => {
        let claimed = false
        for (const listener of [...onMessage.listeners]) if (listener(message, sender, resolve) === true) claimed = true
        if (!claimed) resolve(undefined)
      })
    }
    const popupSender: Sender = { id: extension, url: native.runtime.getURL("/popup.html"), documentId: "popup-document" }
    const popup: Backend = createBackend({
      local: { get: keys => fakeBrowser.storage.local.get([...keys]), all: () => fakeBrowser.storage.local.get(null), onChanged: fakeBrowser.storage.onChanged },
      send: message => send(message, popupSender),
      access: { has: async () => true, request: async () => true, requestCombined: async () => ({ music: false, browserMenu: false }), hasBrowserMenu: async () => false }
    }, { build, deadline: timerDeadline, windowId: 1 })
    let serial = 0
    // The YouTube tab's site core says hello when its page loads (ARC-MSG-15).
    function hello(tabId: number, start: { hidden: boolean; fresh: boolean } = { hidden: false, fresh: true }) {
      const tab = tabs.tabs.get(tabId)
      if (!tab) throw new Error("No such tab")
      return send({ v: CONTRACT_VERSION, build, id: `hello-${++serial}`, kind: "tab.hello", payload: { site: "www", build, signedIn: true, acct, ...start } },
        { id: extension, url: tab.url, frameId: 0, tab: { id: tabId, windowId: tab.windowId, incognito: tab.incognito } })
    }
    async function line(call: Promise<{ kind: string; result?: unknown }>): Promise<GatherLine> {
      const answer = await call
      if (answer.kind !== "answered") throw new Error(`The popup's call wasn't answered: ${JSON.stringify(answer)}`)
      const result = answer.result as { kind: string; line?: GatherLine | null }
      if (!result.line) throw new Error(`No line: ${JSON.stringify(result)}`)
      return result.line
    }
    return { background, native, popup, hello, line }
  }
  return {
    tabs, site, pushes, badges, messagedTabs, worker,
    async seed() {
      await fakeBrowser.storage.local.set({
        schema: 1, device: { id: "e2e-device", consent: { v: 1, at: 1 }, syncOn: false },
        "doc:settings": documented("settings", { gather: { on: true, feedback: true, to: "playlist", order: "left-to-right", close: true, ...gather } }),
        [`doc:setup:${acct}`]: documented("setup", { label: { name: "Alpha" }, gather: "WL" }),
        sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false, everEdited: false }
      })
    },
    closePopup() { popupOpen = false },
    onRemove(fn: (ids: number[]) => Promise<void>) { removing = fn }
  }
}

async function eventually(check: () => boolean | Promise<boolean>, what: string) {
  for (let turn = 0; turn < 600; turn++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting: ${what}`)
}
const running: Background[] = []
afterEach(async () => { for (const background of running.splice(0)) await background.dispose().catch(() => {}) })

test("Gather in the popup saves the window's video tabs to the gather playlist, closes them, and Undo removes them and reopens the tabs", async () => {
  const world = browser({})
  await world.seed()
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  for (const n of [1, 2, 3]) world.tabs.open(9 + n, watch(n))
  world.tabs.open(13, `${watch(1)}&t=42`)
  world.tabs.open(14, "https://www.youtube.com/shorts/gat00000009")
  const before = world.tabs.urls()
  const w = world.worker()
  running.push(w.background)
  await w.background.ready
  await w.hello(1)

  const saved = await w.line(w.popup.call("ui.gather", {}))
  expect(saved).toEqual({ text: "Saved 3 videos to Watch later and closed their tabs.", tone: "confirmation", action: { kind: "undo", id: expect.any(String) } })
  expect([...world.site.later.values()]).toEqual([video(1), video(2), video(3)])
  expect(world.tabs.urls()).toEqual(["https://www.youtube.com/", "https://www.youtube.com/shorts/gat00000009"])
  expect([10, 11, 12, 13].some(id => world.messagedTabs.has(id))).toBe(false)
  expect(world.pushes.some(push => push.running && push.line?.text === "Checking 1 of 3…")).toBe(true)
  expect(world.site.toasts).toEqual([])

  const idle = await w.line(w.popup.call("ui.gathers", {}))
  expect(idle).toEqual({ text: "Last gather: 3 videos into Watch later, this minute", tone: "muted", action: saved.action })
  const recent = await w.popup.call("ui.recentAdds", { acct: acct as never })
  expect(recent.kind === "answered" && recent.result.kind === "recent" && recent.result.entries.map(entry => [entry.gather, entry.videos.length])).toEqual([[true, 3]])

  if (saved.action?.kind !== "undo") throw new Error("No Undo")
  const undone = await w.line(w.popup.call("ui.gatherUndo", { id: saved.action.id }))
  expect(undone).toEqual({ text: "Removed 3 videos from Watch later and reopened their tabs.", tone: "confirmation", action: null })
  expect([...world.site.later.values()]).toEqual([])
  expect(world.tabs.urls()).toEqual(before)
  expect(await w.popup.call("ui.gathers", {})).toEqual({ kind: "answered", result: { kind: "gathers", running: false, line: null } })
})

test("a worker that stops after closing the tabs, before it read them back, still undoes the gather from the saved plan", async () => {
  const world = browser({})
  await world.seed()
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  world.tabs.open(20, watch(5))
  world.tabs.open(21, watch(6))
  const before = world.tabs.urls()
  const first = world.worker()
  running.push(first.background)
  await first.background.ready
  await first.hello(1)
  let stopped = false
  world.onRemove(async ids => {
    await world.tabs.native.remove(ids)
    stopped = true
    void first.background.dispose()
    return new Promise<void>(() => {})
  })
  void first.popup.call("ui.gather", {})
  await eventually(() => stopped, "the remove call")
  expect(world.tabs.urls()).toEqual(["https://www.youtube.com/"])
  world.onRemove(ids => world.tabs.native.remove(ids))

  const second = world.worker()
  running.push(second.background)
  await second.background.ready
  await second.hello(1)
  const idle = await second.line(second.popup.call("ui.gathers", {}))
  expect(idle).toMatchObject({ text: "Last gather: 2 videos into Watch later, this minute", action: { kind: "undo" } })
  if (idle.action?.kind !== "undo") throw new Error("No Undo after the restart")
  const undone = await second.line(second.popup.call("ui.gatherUndo", { id: idle.action.id }))
  expect(undone).toEqual({ text: "Removed 2 videos from Watch later and reopened their tabs.", tone: "confirmation", action: null })
  expect([...world.site.later.values()]).toEqual([])
  expect(world.tabs.urls()).toEqual(before)
})

test("opening the popup wakes automatic gathering, which saves a tab unvisited for a day from the signed-in tab, closes it and shows its toast there", async () => {
  const world = browser({ auto: { unvisited: true, after: "1d", background: false, count: false, n: 10 } })
  await world.seed()
  world.tabs.open(1, "https://www.youtube.com/", { active: true })
  world.tabs.open(30, watch(7), { lastAccessed: Date.now() - 2 * DAY })
  world.tabs.open(31, watch(8))
  const w = world.worker()
  running.push(w.background)
  await w.background.ready
  await w.hello(1)
  world.closePopup()

  await w.popup.call("ui.gathers", {})
  await eventually(() => world.site.toasts.length > 0, "the gather toast")
  expect([...world.site.later.values()]).toEqual([video(7)])
  expect(world.tabs.urls()).toEqual(["https://www.youtube.com/", watch(8)])
  expect(world.site.toasts).toEqual([{ text: "Gathered 1 video into Watch later by itself and closed its tab", tone: "confirmation", auto: true, undo: expect.any(String) }])
  expect(world.badges).toContainEqual(["title", { tabId: 1, title: "Gathered 1 video into Watch later by itself, this minute." }])
  expect(await w.line(w.popup.call("ui.gathers", {}))).toMatchObject({ text: "Gathered 1 video into Watch later by itself, this minute.", action: { kind: "undo" } })
})
