import { expect, test } from "bun:test"
import { composeAnyTab, menuIds, tabOrder, videoOfUrl, type CandidateTab } from "./any-tab"
import type { NativeBrowser } from "../adapters/browser"
import type { Actions } from "./actions"
import type { Tabs } from "../tabs/ports"
import type { TabAddReport, TabAddRequest } from "../../shared/contracts/tab-actions"
import { defaultSettings } from "../../shared/model/defaults"
import type { PlaylistId, Settings } from "../../shared/model"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"
import { build } from "../../../tools/fixtures/page-link/support"

const tab = (id: number, change: Partial<CandidateTab> = {}): CandidateTab =>
  ({ id, windowId: 1, incognito: false, active: false, audible: false, discarded: false, lastAccessed: id, ...change })
const WL = "WL" as PlaylistId
const added: TabAddReport = { kind: "report", outcomes: { [WL]: { kind: "added" } }, feedback: true, undo: { kind: "add", id: "e:1" }, titles: {},
  toast: { tone: "confirmation", auto: false, message: { kind: "saved", playlists: [WL] }, action: { kind: "undo" }, remember: { tab: [], session: [] } } }

test("a key acts in the focused window's active tab, else a tab playing audio, else the most recently used, of the same window kind", () => {
  const tabs = [tab(1, { lastAccessed: 50 }), tab(2, { windowId: 2, audible: true, lastAccessed: 10 }), tab(3, { active: true, lastAccessed: 5 }),
    tab(4, { incognito: true, active: true, lastAccessed: 99 }), tab(5, { discarded: true, lastAccessed: 98 }), tab(6, { windowId: 2, active: true, lastAccessed: 20 })]
  expect(tabOrder(tabs, { windowId: 1, incognito: false })).toEqual([3, 2, 1, 6])
  expect(tabOrder(tabs, { windowId: 9, incognito: true })).toEqual([4])
})

test("a link names its video, whether a watch page or a Short, and only on youtube.com", () => {
  expect(videoOfUrl("https://www.youtube.com/watch?v=aaaaaaaaaaa&t=3")).toBe("aaaaaaaaaaa" as never)
  expect(videoOfUrl("https://www.youtube.com/shorts/bbbbbbbbbbb")).toBe("bbbbbbbbbbb" as never)
  expect(videoOfUrl("https://music.youtube.com/watch?v=aaaaaaaaaaa")).toBeNull()
  expect(videoOfUrl("https://www.youtube.com/@channel")).toBeNull()
})

function world(options: { settings?: (settings: Settings) => void; video?: boolean; answer?: TabAddReport; granted?: boolean } = {}) {
  const settings = defaultSettings()
  settings.anyTabKeys.on = true
  settings.browserMenu.on = true
  options.settings?.(settings)
  const log: string[] = []
  const asks: { tabId: number; kind: string; payload: unknown }[] = []
  const adds: { tabId: number; request: TabAddRequest }[] = []
  const created: { id: string; parentId?: string }[] = []
  const youtube = [{ id: 7, windowId: 1, incognito: false, active: false, audible: false, discarded: false, lastAccessed: 3, url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }]
  const native = {
    windows: { async getLastFocused() { return { id: 1, incognito: false } } },
    tabs: {
      async query(query: { url?: string }) { log.push(`query ${query.url ?? "active"}`); return query.url ? youtube : [{ id: 2, windowId: 1, active: true }] },
      async sendMessage(tabId: number, message: { kind: string; payload: unknown }) { asks.push({ tabId, kind: message.kind, payload: message.payload }) }
    },
    action: {
      async getTitle() { return "Perchling" },
      async setBadgeBackgroundColor() {},
      async setBadgeText({ tabId, text }: { tabId: number; text: string }) { if (text) log.push(`badge ${tabId} ${text}`) },
      async setTitle({ tabId, title }: { tabId: number; title: string }) { if (title !== "Perchling") log.push(`title ${tabId} ${title}`) }
    },
    permissions: { async contains() { return options.granted ?? true } },
    contextMenus: {
      async removeAll() { created.splice(0) },
      create(item: { id: string; parentId?: string }) { created.push({ id: item.id, ...(item.parentId ? { parentId: item.parentId } : {}) }) },
      onClicked: { addListener() {}, removeListener() {} }
    }
  } as unknown as NativeBrowser
  const actions = {
    async settings() { return settings },
    async addInTab(target: { tabId: number }, request: TabAddRequest) { adds.push({ tabId: target.tabId, request }); return options.answer ?? added }
  } as unknown as Actions
  const tabs = {
    async runIn() { return options.video === false ? { kind: "result", tabId: 7, result: { ok: false, reason: "unavailable" } }
      : { kind: "result", tabId: 7, result: { ok: true, route: "r", data: { videoId: "aaaaaaaaaaa", title: "First video", length: 60, kind: "video" } } } },
    async known() { return [{ tabId: 7, acct: "AAAAAAAAAAAAAAAA", privateTab: false }] }
  } as unknown as Tabs
  const ensured: number[] = []
  const anyTab = composeAnyTab({ native, build, actions, tabs, consented: () => true, i18n: englishI18n(), menuClicksHeard: true,
    registrar: { async ensure(tabId) { ensured.push(tabId) } } })
  return { anyTab, log, asks, adds, created, ensured }
}

test("Watch later from any tab saves the tab's current video, shows its toast there, and ticks the focused tab's icon", async () => {
  const w = world()
  await w.anyTab.command("watch-later-current-video")
  expect(w.ensured).toEqual([7])
  expect(w.adds).toEqual([{ tabId: 7, request: { site: "www", video: "aaaaaaaaaaa" as never, via: "picker", opener: "any-tab-keys", playlist: WL, title: "First video" } }])
  expect(w.asks.map(({ tabId, kind }) => ({ tabId, kind }))).toEqual([{ tabId: 7, kind: "bg.toast" }])
  expect(w.log).toContain("badge 2 ✓")
  expect(w.log).toContain("title 2 Saved “First video” to Watch later")
})

test("with the feature off a key reads no tab and injects nothing", async () => {
  const w = world({ settings: settings => { settings.anyTabKeys.on = false } })
  await w.anyTab.command("watch-later-current-video")
  expect(w.log).toEqual([])
  expect(w.ensured).toEqual([])
})

test("with no YouTube tab playing a video, only the ✕ answers", async () => {
  const w = world({ video: false })
  await w.anyTab.command("watch-later-current-video")
  expect(w.adds).toEqual([])
  expect(w.log).toContain("badge 2 ✕")
  expect(w.log).toContain("title 2 No YouTube tab is playing a video.")
})

test("the browser menu shows Save to ▸ with its three items only while the feature is on and the permission is held", async () => {
  const on = world()
  await on.anyTab.reconcileMenu()
  expect(on.created).toEqual([{ id: menuIds.parent }, { id: menuIds.quickSave, parentId: menuIds.parent },
    { id: menuIds.watchLater, parentId: menuIds.parent }, { id: menuIds.choose, parentId: menuIds.parent }])
  const off = world({ settings: settings => { settings.browserMenu.on = false } })
  await off.anyTab.reconcileMenu()
  expect(off.created).toEqual([])
  const ungranted = world({ granted: false })
  await ungranted.anyTab.reconcileMenu()
  expect(ungranted.created).toEqual([])
})

test("Quick-save playlist from the menu saves the link's video, and with no quick-save playlist opens choose mode in that tab", async () => {
  const page = { id: 7, windowId: 1, incognito: false, active: true, url: "https://www.youtube.com/" } as never
  const w = world()
  await w.anyTab.clicked({ menuItemId: menuIds.quickSave, linkUrl: "https://www.youtube.com/watch?v=bbbbbbbbbbb" }, page)
  expect(w.adds).toEqual([{ tabId: 7, request: { site: "www", video: "bbbbbbbbbbb" as never, via: "quick-save", opener: "browser-menu" } }])
  expect(w.asks.map(ask => ask.kind)).toEqual(["bg.toast"])
  const choosing = world({ answer: { kind: "choose" } })
  await choosing.anyTab.clicked({ menuItemId: menuIds.quickSave, linkUrl: "https://www.youtube.com/shorts/bbbbbbbbbbb" }, page)
  expect(choosing.asks).toEqual([{ tabId: 7, kind: "bg.picker", payload: { video: "bbbbbbbbbbb", title: null, choose: true, opener: "browser-menu" } }])
  const picking = world()
  await picking.anyTab.clicked({ menuItemId: menuIds.choose, pageUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa" }, page)
  expect(picking.adds).toEqual([])
  expect(picking.asks).toEqual([{ tabId: 7, kind: "bg.picker", payload: { video: "aaaaaaaaaaa", title: "First video", choose: false, opener: "browser-menu" } }])
})
