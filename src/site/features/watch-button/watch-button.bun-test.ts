import { afterEach, expect, test } from "bun:test"
import type { NavData } from "../../../shared/contracts"
import type { TabAddReport, TabAddRequest } from "../../../shared/contracts/tab-actions"
import type { Key, PlaylistId } from "../../../shared/model"
import type { SiteCore } from "../../core/core"
import type { SiteView } from "../../core/feature-host"
import { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import { createFeedbackSession } from "../../kit/feedback/session"
import type { Kit } from "../../kit/install"
import { createWatchMenu, type WatchMenuRequest } from "../../popovers/watch-menu"
import type { OpenPicker, Popovers } from "../../popovers/types"
import { fit, retryMs, row, watchButton } from "./feature"
import { createThisVideoChannel } from "../../core/this-video"
import type { ThisVideo } from "../../../shared/contracts/this-video"
import { clock, labels, settle, undoKey } from "../../../../tools/fixtures/site-toaster/harness"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { playlist, video, wireView } from "../../../../tools/fixtures/tab-view/cases"

const altShiftP: Key = { code: "KeyP", char: "p", ctrl: false, alt: true, shift: true, meta: false }
const watchNav = { pageType: "WATCH", video: null, navigation: { kind: "watch", videoId: video } } as unknown as NavData
const homeNav = { pageType: "HOME", video: null, navigation: { kind: "other" } } as unknown as NavData
const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

function buttonView(state: "working" | "not-working" = "working", shorts = false): SiteView<"www"> {
  const base = wireView("www", true)
  if (base.site !== "www") throw Error("Expected a www view")
  return { ...base, features: base.features.map(feature => feature.id === "shortcuts" ? { ...feature, options: { ...feature.options, picker: altShiftP } }
    : feature.id === "watch-button" ? { ...feature, options: { ...feature.options, shorts } } : feature),
    statuses: base.statuses.map(status => status.feature === "watch-button" ? { ...status, state } : status) } as SiteView<"www">
}
function actionRow() {
  const metadata = document.createElement("ytd-watch-metadata"), menu = document.createElement("ytd-menu-renderer"), buttons = document.createElement("div")
  buttons.id = "top-level-buttons-computed"
  menu.append(buttons); metadata.append(menu); document.body.append(metadata)
  return buttons
}

function setup(state: "working" | "not-working" = "working", shorts = false) {
  const timers = clock()
  const thisVideo = createThisVideoChannel()
  const navs: ((nav: NavData) => void)[] = []
  const menus: WatchMenuRequest[] = [], notices: string[] = []
  const popovers: Popovers = { openPicker() {}, openWatchMenu(request) { menus.push(request) }, isOpen: () => false, close() {} }
  const scope = new Scope({ document, onError: () => {} })
  void watchButton.start({ site: "www", scope, document, i18n: englishI18n(), os: "windows", thisVideo,
    view: { read: () => buttonView(state, shorts), subscribe: () => () => {} },
    page: { onState(listener: (state: { kind: string }) => void) { listener({ kind: "ready" }); return () => {} },
      watch(_stream: string, listener: (nav: NavData) => void) { navs.push(listener); return () => {} },
      run: async () => ({ ok: true, route: "r", data: { videoId: video, title: "First video", length: 60, kind: "video" } }) } as never,
    actions: { playlists: async () => ({ kind: "cached", listing: { rows: [{ id: playlist, title: "Mixes" }], at: 1 } }) } as never,
    notices: { wouldAct: feature => { notices.push(feature) } }, popovers: async () => popovers })
  running.push(() => { scope.dispose(); timers.restore(); document.body.replaceChildren() })
  const button = () => document.querySelector("pp-watch-button")?.shadowRoot?.querySelector("button") ?? null
  return { timers, menus, notices, thisVideo, button, navigate: (nav: NavData) => { for (const listener of navs) listener(nav) }, host: () => document.querySelector("pp-watch-button") }
}

test("on a watch page the button joins the action row once YouTube draws it, and comes back when YouTube drops it", async () => {
  const f = setup()
  f.navigate(watchNav)
  f.timers.advance(retryMs[0])
  expect(f.host()).toBeNull()
  const buttons = actionRow()
  f.timers.advance(retryMs[1])
  expect(f.host()?.parentElement).toBe(buttons)
  expect(f.host()?.shadowRoot?.querySelector("button")?.getAttribute("aria-label")).toBe("Save this video with Perchling")
  buttons.replaceChildren()
  await settle(); await new Promise(resolve => queueMicrotask(() => resolve(null))); await settle()
  expect(f.host()?.parentElement).toBe(buttons)
})

test("off the watch page, as under the miniplayer, there's no button", () => {
  const f = setup()
  actionRow()
  f.navigate(watchNav)
  f.timers.advance(0)
  expect(f.host()).not.toBeNull()
  f.navigate(homeNav)
  expect(f.host()).toBeNull()
})

test("a click opens the menu with the quick-save row named from the cached list and the picker key", async () => {
  const f = setup()
  actionRow()
  f.navigate(watchNav)
  f.timers.advance(0)
  f.host()?.shadowRoot?.querySelector("button")?.click()
  await settle()
  expect(f.menus.map(({ video: id, title, status, quickSave, pickerKey }) => ({ id, title, status, quickSave, pickerKey }))).toEqual([{
    id: video, title: "First video", status: "Save this video with Perchling", quickSave: { playlist, name: "Mixes" }, pickerKey: "Alt+Shift+P" }])
})

test("while the button isn't working it isn't drawn, and its notice is asked for once", () => {
  const f = setup("not-working")
  actionRow()
  f.navigate(watchNav)
  f.timers.advance(0)
  f.navigate(watchNav)
  f.timers.advance(0)
  expect(f.host()).toBeNull()
  expect(f.notices).toEqual(["watch-button"])
})

function menuWorld(answer: TabAddReport) {
  const timers = clock()
  const root = new Scope({ document, onError: () => {} })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError: () => {} })
  const i18n = englishI18n()
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "www", i18n, labels, initial: { undoKey, features: [] }, now: timers.now, onError: () => {}, onCosmetic: () => {} })
  const adds: TabAddRequest[] = [], pickers: OpenPicker[] = []
  const core = { i18n, root, actions: { add: async (request: TabAddRequest) => { adds.push(request); return answer } } } as unknown as SiteCore<"www">
  const anchor = document.createElement("pp-watch-button"); document.body.append(anchor)
  const menu = createWatchMenu({ document, core: () => core, kit: () => ({ feedback } as unknown as Kit), picker: request => { pickers.push(request) } })
  running.push(() => { menu.close(); root.dispose(); keys.dispose(); timers.restore(); document.body.replaceChildren() })
  menu.open({ video, title: "First video", anchor, status: "Save this video with Perchling", share: null, autoAdd: null, quickSave: { playlist, name: "Mixes" }, pickerKey: "Alt+Shift+P" })
  const rows = () => [...document.querySelector("pp-watch-menu")?.shadowRoot?.querySelectorAll("button") ?? []]
  return { adds, pickers, rows, anchor, toast: () => feedback.read()?.feedback.toaster.read() ?? null }
}

test("the menu's Save row saves to the quick-save playlist in place and raises no toast for a confirmed save", async () => {
  const saved: TabAddReport = { kind: "report", outcomes: { [playlist]: { kind: "added" } }, feedback: true, undo: null, titles: {}, toast: null }
  const m = menuWorld(saved)
  expect(m.rows().map(button => button.textContent)).toEqual(["Save to Mixes", "Save to… (Alt+Shift+P)", "Perchling settings"])
  m.rows()[0]?.click()
  await settle()
  expect(m.adds).toEqual([{ site: "www", video, via: "quick-save", opener: "watch-button", title: "First video" }])
  expect(m.rows()[0]?.textContent).toBe("Saved to Mixes")
  expect(m.toast()).toBeNull()
})

test("a failed Save row reads Couldn't save and answers with the add flow's failure toast, and Save to… opens the picker on the button", async () => {
  const refused: TabAddReport = { kind: "report", outcomes: { [playlist]: { kind: "failed", failure: "refused" } }, feedback: true, undo: null, titles: {},
    toast: { tone: "failure", auto: false, message: { kind: "failed", failure: "refused", playlists: [playlist as PlaylistId] }, action: null, remember: { tab: [], session: [] } } }
  const m = menuWorld(refused)
  m.rows()[0]?.click()
  await settle()
  expect(m.rows()[0]?.textContent).toBe("Couldn't save")
  expect(m.toast()?.content.tone).toBe("failure")
  m.rows()[1]?.click()
  expect(m.pickers.map(({ mode, anchor, opener }) => ({ mode, anchor: anchor.kind, opener }))).toEqual([{ mode: { kind: "save" }, anchor: "on", opener: "watch-button" }])
})

const counting = (overrides: Partial<ThisVideo> = {}): ThisVideo => ({ video, title: "First video", state: { kind: "counting", goal: 50, watched: 30 }, watched: 30,
  playlists: [{ pl: playlist, pct: 50, outcome: "waiting" }], channel: null, ...overrides })

test("the button shows auto-add's state: a pie toward the goal while counting, then Auto-added with the playlist named (UI-YT-18, UI-YT-19)", async () => {
  const f = setup()
  actionRow()
  f.navigate(watchNav)
  f.timers.advance(0)
  f.thisVideo.publish(counting())
  expect(f.button()?.textContent).toBe("Auto-adds at 50 %")
  expect(f.button()?.getAttribute("aria-label")).toBe("Auto-adds at 50 % · 30 % watched")
  expect(f.button()?.querySelector("[data-pie]")?.getAttribute("data-pie")).toBe("60")
  f.thisVideo.publish(counting({ state: { kind: "added", playlists: [playlist] }, playlists: [{ pl: playlist, pct: 50, outcome: "added" }] }))
  await settle()
  expect(f.button()?.textContent).toBe("Auto-added")
  expect(f.button()?.getAttribute("aria-label")).toBe("Auto-added to Mixes")
  expect(f.button()?.querySelector("[data-pie]")).toBeNull()
  f.thisVideo.publish(null)
  expect(f.button()?.textContent).toBe("")
})

function autoMenu(options: { skip?: () => boolean; filter?: { mode: "allow" | "deny"; on: boolean; channels: [string, string][] } } = {}) {
  const timers = clock()
  const root = new Scope({ document, onError: () => {} })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError: () => {} })
  const i18n = englishI18n()
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "www", i18n, labels, initial: { undoKey, features: [] }, now: timers.now, onError: () => {}, onCosmetic: () => {} })
  const calls: unknown[] = []
  const core = { i18n, root, actions: {
    skip: async (id: string, skip: boolean) => { calls.push(["skip", id, skip]); return options.skip?.() ?? true },
    pause: async (paused: boolean) => { calls.push(["pause", paused]); return true },
    filterChannel: async (change: unknown) => { calls.push(["channel", change]); return true },
    settings: (target: unknown) => { calls.push(["settings", target]) }
  } } as unknown as SiteCore<"www">
  const anchor = document.createElement("pp-watch-button"); document.body.append(anchor)
  const menu = createWatchMenu({ document, core: () => core, kit: () => ({ feedback } as unknown as Kit), picker: () => {} })
  running.push(() => { menu.close(); root.dispose(); keys.dispose(); timers.restore(); document.body.replaceChildren() })
  const channel = { id: "UCaaaaaaaaaaaaaaaaaaaaaa" as never, title: "Band", handle: null }
  menu.open({ video, title: "First video", anchor, status: "Auto-adds at 50 % · 30 % watched", share: .6, quickSave: null, pickerKey: null,
    autoAdd: { view: counting({ channel }), names: new Map([[playlist, "Mixes"]]), paused: false,
      filters: options.filter ? [{ playlist: playlist as PlaylistId, state: { kind: "value", filter: options.filter, gen: "gen-1" } }] : [] } })
  const shadow = () => document.querySelector("pp-watch-menu")?.shadowRoot
  const rows = () => [...shadow()?.querySelectorAll("button") ?? []]
  const find = (text: string) => { const found = rows().find(button => button.textContent === text); if (!found) throw Error(`No row ${text}`); return found }
  return { calls, rows, find, shadow }
}

test("the menu lists auto-add's goals, Don't auto-add, Pause, this channel's chips and Perchling settings, each answering in place (UI-YT-22)", async () => {
  const m = autoMenu()
  expect(m.shadow()?.querySelector(".status svg [d]")).not.toBeNull()
  expect([...m.shadow()?.querySelectorAll(".goal") ?? []].map(row => row.textContent)).toEqual(["MixesAt 50 %"])
  expect(m.rows().map(button => button.textContent)).toEqual(["Don't auto-add this video", "Pause auto-add", "Allow only", "Deny", "Save to playlist…", "Save to…", "Perchling settings"])
  m.find("Don't auto-add this video").click(); await settle()
  expect(m.find("Auto-add this video again")).toBeTruthy()
  m.find("Pause auto-add").click(); await settle()
  expect(m.find("Resume auto-add")).toBeTruthy()
  m.find("Deny").click(); await settle()
  expect(m.find("Denied").getAttribute("aria-pressed")).toBe("true")
  m.find("Perchling settings").click()
  expect(m.calls).toEqual([["skip", video, true], ["pause", true],
    ["channel", { playlist, channel: ["UCaaaaaaaaaaaaaaaaaaaaaa", "Band"], action: "list", mode: "deny", clearListed: false, expectedGeneration: null }],
    ["settings", { feature: "watch-button" }]])
})

test("a chip that would clear kept channels asks first, in the menu (YT-CF-15)", async () => {
  const m = autoMenu({ filter: { mode: "deny", on: false, channels: [["UCbbbbbbbbbbbbbbbbbbbbbb", "Talk"]] } })
  m.find("Allow only").click(); await settle()
  expect(m.shadow()?.querySelector(".ask")?.textContent).toBe("Turn on Allow only for Mixes? This clears its 1 denied channel.")
  expect(m.calls).toEqual([])
  m.find("Switch").click(); await settle()
  expect(m.calls).toEqual([["channel", { playlist, channel: ["UCaaaaaaaaaaaaaaaaaaaaaa", "Band"], action: "list", mode: "allow", clearListed: true, expectedGeneration: "gen-1" }]])
  expect(m.find("Allowed")).toBeTruthy()
})

test("in a narrow row the pill folds to its icon, unfolds with 16 px to spare, and hides rather than push Save into the overflow (UI-YT-20, UI-YT-21)", () => {
  expect(fit({ space: 200, full: 150, current: "full", saveFolded: false })).toBe("full")
  expect(fit({ space: 140, full: 150, current: "full", saveFolded: false })).toBe("icon")
  expect(fit({ space: 160, full: 150, current: "icon", saveFolded: false })).toBe("icon")
  expect(fit({ space: 166, full: 150, current: "icon", saveFolded: false })).toBe("full")
  expect(fit({ space: 30, full: 150, current: "icon", saveFolded: false })).toBe("hidden")
  expect(fit({ space: 30, full: 150, current: "hidden", saveFolded: true })).toBe("icon")
})

test("a resize measures the row before YouTube does and sizes the button to fit", async () => {
  const f = setup()
  const buttons = actionRow()
  const menu = buttons.parentElement as HTMLElement
  const share = document.createElement("div"), save = document.createElement("yt-button-view-model")
  const saveInner = document.createElement("button"); saveInner.setAttribute("aria-label", "Save to playlist"); save.append(saveInner)
  buttons.append(share, save)
  const widths = new Map<Element, number>([[share, 100], [save, 90]])
  let menuWidth = 300
  for (const element of [share, save]) element.getBoundingClientRect = () => ({ width: widths.get(element) ?? 0 }) as DOMRect
  menu.getBoundingClientRect = () => ({ width: menuWidth }) as DOMRect
  f.navigate(watchNav)
  f.timers.advance(0)
  const host = f.host() as HTMLElement
  host.getBoundingClientRect = () => ({ width: 150 }) as DOMRect
  f.thisVideo.publish(counting())
  window.dispatchEvent(new Event("resize"))
  expect(host.getAttribute("fit")).toBe("icon")
  menuWidth = 500; window.dispatchEvent(new Event("resize"))
  expect(host.getAttribute("fit")).toBe("full")
  menuWidth = 200; window.dispatchEvent(new Event("resize"))
  expect(host.getAttribute("fit")).toBe("hidden")
  save.remove(); window.dispatchEvent(new Event("resize"))
  expect(host.getAttribute("fit")).toBe("icon")
})

test("with On Shorts too, the button joins the Short's action column before its sound button, with its short labels (UI-YT-23)", async () => {
  const shortsNav = { pageType: "SHORTS", video: null, navigation: { kind: "shorts", videoId: video } } as unknown as NavData
  const reel = document.createElement("ytd-reel-video-renderer"); reel.setAttribute("is-active", "")
  const column = document.createElement("reel-action-bar-view-model"), sound = document.createElement("pivot-button-view-model")
  column.append(document.createElement("div"), sound); reel.append(column); document.body.append(reel)
  const off = setup("working", false)
  off.navigate(shortsNav); off.timers.advance(0)
  expect(off.host()).toBeNull()
  running.splice(0).forEach(stop => stop())
  document.body.append(reel)
  const f = setup("working", true)
  f.navigate(shortsNav); f.timers.advance(0)
  expect(f.host()?.nextElementSibling).toBe(sound)
  expect(f.host()?.getAttribute("kind")).toBe("shorts")
  expect(f.button()?.textContent).toBe("Save")
  f.thisVideo.publish(counting())
  expect(f.button()?.textContent).toBe("30 %")
  f.thisVideo.publish(counting({ state: { kind: "skipped" } }))
  expect(f.button()?.textContent).toBe("Skipped")
})
