import { fakeBrowser } from "wxt/testing/fake-browser"
import { boot } from "../../src/background/boot"
import type { NativeBrowser } from "../../src/background/adapters/browser"
import { timerDeadline } from "../../src/background/adapters/runtime"
import { createBackend } from "../../src/ui/backend/core"
import type { Backend } from "../../src/ui/backend/backend"
import { CONTRACT_VERSION } from "../../src/shared/contracts/protocol"
import { isGatherPush, type GatherLine, type GatherPush } from "../../src/shared/contracts/ui-gather"
import { platform } from "../../src/shared/platform"
import { scriptedMessages } from "../../tools/fixtures/localization/scripted"

export const build = platform.build
export const extension = "perchling-e2e"
export const acct = "AAAAAAAAAAAAAAAA"
export const DAY = 86_400_000
export const video = (n: number) => `gat${String(n).padStart(8, "0")}`
export const watch = (n: number) => `https://www.youtube.com/watch?v=${video(n)}`

type Tab = {
  id: number
  windowId: number
  index: number
  url: string
  title: string
  active: boolean
  pinned: boolean
  audible: boolean
  incognito: boolean
  lastAccessed: number
  status: "complete"
  discarded: false
}
type Listener = (message: unknown, sender: unknown, respond: (answer?: unknown) => void) => boolean | undefined
type Sender = { id: string; url: string; frameId?: number; documentId?: string; tab?: { id: number; windowId: number; incognito: boolean } }

function event<T extends (...args: never[]) => unknown>() {
  const listeners = new Set<T>()
  return {
    listeners,
    addListener: (fn: T) => {
      listeners.add(fn)
    },
    removeListener: (fn: T) => {
      listeners.delete(fn)
    },
    hasListener: (fn: T) => listeners.has(fn)
  }
}
function glob(pattern: string) {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
}

// The browser's tab strip: windows, tabs and their places. Only the background reads and changes it, through the browser's calls.
function strip() {
  const tabs = new Map<number, Tab>()
  const windows = new Map<number, { id: number; incognito: boolean; focused: boolean }>([[1, { id: 1, incognito: false, focused: true }]])
  let serial = 100
  const inWindow = (windowId: number) => [...tabs.values()].filter(tab => tab.windowId === windowId).sort((a, b) => a.index - b.index)
  const reindex = (windowId: number) =>
    inWindow(windowId).forEach((tab, index) => {
      tab.index = index
    })
  function open(id: number, url: string, patch: Partial<Tab> = {}) {
    const windowId = patch.windowId ?? 1
    const tab: Tab = {
      id,
      windowId,
      index: inWindow(windowId).length,
      url,
      title: `${url.slice(-11)} - YouTube`,
      active: false,
      pinned: false,
      audible: false,
      incognito: windows.get(windowId)?.incognito ?? false,
      lastAccessed: Date.now(),
      status: "complete",
      discarded: false,
      ...patch
    }
    if (tab.active) for (const other of inWindow(windowId)) other.active = false
    tabs.set(id, tab)
    return tab
  }
  const native = {
    async query(info: { windowId?: number; active?: boolean; url?: string | string[]; discarded?: boolean }) {
      const urls = info.url === undefined ? null : (Array.isArray(info.url) ? info.url : [info.url]).map(glob)
      return [...tabs.values()]
        .filter(
          tab => (info.windowId === undefined || tab.windowId === info.windowId) && (info.active === undefined || tab.active === info.active) && (urls === null || urls.some(url => url.test(tab.url)))
        )
        .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
        .map(tab => ({ ...tab }))
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
    async get(windowId: number) {
      const window = windows.get(windowId)
      if (!window) throw new Error(`No window with id: ${windowId}.`)
      return { ...window }
    },
    async getLastFocused() {
      const window = [...windows.values()].find(entry => entry.focused)
      if (!window) throw new Error("No window")
      return { ...window }
    },
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
  const views: { site: string; acct: string | null; features: unknown[] }[] = []
  function answer(kind: string, payload: { job: { kind: string; videoId?: string; videoIds?: string[]; setVideoIds?: string[] } }): unknown {
    switch (kind) {
      case "bg.ping":
        return { site: "www", build, signedIn: true, acct }
      case "bg.view":
        views.push(payload as never)
        return null
      case "bg.gatherToast":
        toasts.push(payload)
        return null
      case "bg.job": {
        const job = payload.job
        jobs.push(job.kind)
        const route = "e2e-route"
        switch (job.kind) {
          case "account":
            return { ok: true, route, data: { signedIn: true, acct } }
          case "membership":
            return { ok: true, route, data: [{ id: "WL", title: "Watch later", contains: [...later.values()].includes(job.videoId ?? "") }] }
          case "addBatch":
            return {
              ok: true,
              route,
              data: {
                results: (job.videoIds ?? []).map(videoId => {
                  const setVideoId = `entry-${++entry}`
                  later.set(setVideoId, videoId)
                  return { videoId, setVideoId }
                })
              }
            }
          case "removeBatch":
            return { ok: true, route, data: { removed: (job.setVideoIds ?? []).filter(id => later.delete(id)).length } }
          default:
            return { ok: false, reason: "unavailable" }
        }
      }
    }
    return undefined
  }
  return {
    later,
    toasts,
    jobs,
    views,
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
    const present = async (keys?: unknown) => {
      const found: Record<string, unknown> = await get(keys as never)
      return Object.fromEntries(Object.entries(found).filter(([, value]) => value !== undefined))
    }
    // WXT's fake also lacks getKeys, the key inventory Clear all reads back to confirm its erase.
    Object.assign(area, { get: present, getKeys: async () => Object.keys(await present(null)) })
  }
}
// The test DOM has no IndexedDB. Clear all deletes the retired 1.x database, which a browser reports as deleted when it's absent.
function absentIndexedDb() {
  if ("indexedDB" in globalThis) return
  Object.assign(globalThis, {
    indexedDB: {
      deleteDatabase() {
        const request: { onsuccess?: () => void } = {}
        setTimeout(() => request.onsuccess?.())
        return request
      }
    }
  })
}
export function documented(name: string, data: Record<string, unknown>) {
  return { v: 1, gen: `gen-${name}`, at: 1, by: "e2e-device", data }
}

// One browser: storage, the tab strip and YouTube outlive any background, as they do when the worker stops.
export function browser(gather: Record<string, unknown>) {
  omitAbsentKeys()
  absentIndexedDb()
  const tabs = strip(),
    site = youtube()
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
        id: extension,
        getURL: (path: string) => `chrome-extension://${extension}${path.startsWith("/") ? path : `/${path}`}`,
        getManifest: () => ({ version: "2.0.0", manifest_version: 3 }),
        onMessage,
        onInstalled: event(),
        onStartup: event(),
        // The background's own pushes reach the open extension pages, never the background itself.
        async sendMessage(message: unknown) {
          if (!isGatherPush(message, build)) return undefined
          pushes.push(message.payload)
          return popupOpen && message.payload.windowId === 1 ? { shown: true } : undefined
        }
      },
      tabs: {
        ...tabs.native,
        onRemoved,
        async remove(ids: number[]) {
          await (removing ? removing(ids) : tabs.native.remove(ids))
          for (const id of ids) for (const listener of [...onRemoved.listeners]) listener(id)
        },
        async sendMessage(tabId: number, message: unknown) {
          messagedTabs.add(tabId)
          const answer = servingTabs.has(tabId) && tabs.tabs.has(tabId) ? site.receive(message) : undefined
          if (answer === undefined) throw new Error("Could not establish connection. Receiving end does not exist.")
          return answer
        }
      },
      windows: tabs.nativeWindows,
      i18n: {
        ...scriptedMessages(),
        async detectLanguage() {
          return { isReliable: false, languages: [] }
        }
      },
      permissions: {
        async contains(request: { origins?: string[]; permissions?: string[] }) {
          return (request.permissions ?? []).length === 0 && (request.origins ?? []).every(origin => granted.includes(origin))
        },
        onAdded: event(),
        onRemoved: event()
      },
      // The YouTube tab already runs our page half, core and kit, without the jobs file, so the Registrar's probe finds nothing to inject.
      scripting: {
        async getRegisteredContentScripts() {
          return []
        },
        async registerContentScripts() {},
        async updateContentScripts() {},
        async unregisterContentScripts() {},
        async executeScript(injection: { target: { tabId: number }; world: "ISOLATED" | "MAIN" }) {
          if (!servingTabs.has(injection.target.tabId)) return []
          return injection.world === "MAIN"
            ? [{ frameId: 0, result: [true, false] }]
            : [
                {
                  frameId: 0,
                  documentId: "youtube-document",
                  result: {
                    documentId: "youtube-document",
                    loaded: [
                      ["core-www", build],
                      ["kit-www", build]
                    ]
                  }
                }
              ]
        }
      },
      commands: { onCommand: event() },
      contextMenus: { onClicked: event(), async removeAll() {}, create() {} },
      action: {
        async setBadgeText(details: unknown) {
          badges.push(["text", details])
        },
        async setBadgeBackgroundColor() {},
        async setTitle(details: unknown) {
          badges.push(["title", details])
        }
      }
    } as unknown as NativeBrowser
    const background = boot(native, platform)
    function send(message: unknown, sender: Sender): Promise<unknown> {
      return new Promise(resolve => {
        let claimed = false
        for (const listener of [...onMessage.listeners]) if (listener(message, sender, resolve) === true) claimed = true
        if (!claimed) resolve(undefined)
      })
    }
    // The toolbar popup open in a window.
    const popupIn = (windowId: number): Backend =>
      createBackend(
        {
          local: { get: keys => fakeBrowser.storage.local.get([...keys]), all: () => fakeBrowser.storage.local.get(null), onChanged: fakeBrowser.storage.onChanged },
          send: message => send(message, { id: extension, url: native.runtime.getURL("/popup.html"), documentId: `popup-document-${windowId}` }),
          access: { has: async () => true, request: async () => true, requestCombined: async () => ({ music: false, browserMenu: false }), hasBrowserMenu: async () => false }
        },
        { build, deadline: timerDeadline, windowId }
      )
    const popup = popupIn(1)
    // An extension page open in its own tab of window 1: Settings or the first-run page.
    const pageIn = (path: "/options.html" | "/onboarding.html", tabId: number): Backend =>
      createBackend(
        {
          local: { get: keys => fakeBrowser.storage.local.get([...keys]), all: () => fakeBrowser.storage.local.get(null), onChanged: fakeBrowser.storage.onChanged },
          send: message => send(message, { id: extension, url: native.runtime.getURL(path), frameId: 0, documentId: `page-document-${tabId}`, tab: { id: tabId, windowId: 1, incognito: false } }),
          access: { has: async () => true, request: async () => true, requestCombined: async () => ({ music: false, browserMenu: false }), hasBrowserMenu: async () => false }
        },
        { build, deadline: timerDeadline }
      )
    const settings = pageIn("/options.html", 50)
    const onboarding = pageIn("/onboarding.html", 51)
    let serial = 0
    // The YouTube tab's site core says hello when its page loads (ARC-MSG-15).
    function hello(tabId: number, start: { hidden: boolean; fresh: boolean } = { hidden: false, fresh: true }) {
      const tab = tabs.tabs.get(tabId)
      if (!tab) throw new Error("No such tab")
      return send(
        { v: CONTRACT_VERSION, build, id: `hello-${++serial}`, kind: "tab.hello", payload: { site: "www", build, signedIn: true, acct, ...start } },
        { id: extension, url: tab.url, frameId: 0, tab: { id: tabId, windowId: tab.windowId, incognito: tab.incognito } }
      )
    }
    async function line(call: Promise<{ kind: string; result?: unknown }>): Promise<GatherLine> {
      const answer = await call
      if (answer.kind !== "answered") throw new Error(`The popup's call wasn't answered: ${JSON.stringify(answer)}`)
      const result = answer.result as { kind: string; line?: GatherLine | null }
      if (!result.line) throw new Error(`No line: ${JSON.stringify(result)}`)
      return result.line
    }
    return { background, native, popup, popupIn, settings, onboarding, hello, line }
  }
  return {
    tabs,
    site,
    pushes,
    badges,
    messagedTabs,
    worker,
    async seed(patch: Record<string, unknown> = {}) {
      await fakeBrowser.storage.local.set({
        schema: 1,
        device: { id: "e2e-device", consent: { v: 1, at: 1 }, syncOn: false },
        "doc:settings": documented("settings", { gather: { on: true, feedback: true, to: "playlist", order: "left-to-right", close: true, ...gather } }),
        [`doc:setup:${acct}`]: documented("setup", { label: { name: "Alpha" }, gather: "WL" }),
        sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false, everEdited: false },
        ...patch
      })
    },
    closePopup() {
      popupOpen = false
    },
    onRemove(fn: (ids: number[]) => Promise<void>) {
      removing = fn
    }
  }
}

export async function eventually(check: () => boolean | Promise<boolean>, what: string) {
  for (let turn = 0; turn < 600; turn++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`Timed out waiting: ${what}`)
}

// The popup's routes and the tab registry answer once the store owner is ready and reports consent.
export async function started(w: ReturnType<ReturnType<typeof browser>["worker"]>) {
  await w.background.ready
  await eventually(async () => {
    const status = await w.popup.call("ui.status", {})
    return status.kind === "answered" && status.result.kind === "status"
  }, "the popup's status")
}
