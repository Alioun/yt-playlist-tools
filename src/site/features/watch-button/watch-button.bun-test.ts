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
import { retryMs, row, watchButton } from "./feature"
import { clock, labels, settle, undoKey } from "../../../../tools/fixtures/site-toaster/harness"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { playlist, video, wireView } from "../../../../tools/fixtures/tab-view/cases"

const altShiftP: Key = { code: "KeyP", char: "p", ctrl: false, alt: true, shift: true, meta: false }
const watchNav = { pageType: "WATCH", video: null, navigation: { kind: "watch", videoId: video } } as unknown as NavData
const homeNav = { pageType: "HOME", video: null, navigation: { kind: "other" } } as unknown as NavData
const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

function buttonView(state: "working" | "not-working" = "working"): SiteView<"www"> {
  const base = wireView("www", true)
  if (base.site !== "www") throw Error("Expected a www view")
  return { ...base, features: base.features.map(feature => feature.id === "shortcuts" ? { ...feature, options: { ...feature.options, picker: altShiftP } } : feature),
    statuses: base.statuses.map(status => status.feature === "watch-button" ? { ...status, state } : status) } as SiteView<"www">
}
function actionRow() {
  const metadata = document.createElement("ytd-watch-metadata"), menu = document.createElement("ytd-menu-renderer"), buttons = document.createElement("div")
  buttons.id = "top-level-buttons-computed"
  menu.append(buttons); metadata.append(menu); document.body.append(metadata)
  return buttons
}

function setup(state: "working" | "not-working" = "working") {
  const timers = clock()
  const navs: ((nav: NavData) => void)[] = []
  const menus: WatchMenuRequest[] = [], notices: string[] = []
  const popovers: Popovers = { openPicker() {}, openWatchMenu(request) { menus.push(request) }, isOpen: () => false, close() {} }
  const scope = new Scope({ document, onError: () => {} })
  void watchButton.start({ site: "www", scope, document, i18n: englishI18n(), os: "windows", status: () => null,
    view: { read: () => buttonView(state), subscribe: () => () => {} },
    page: { onState(listener: (state: { kind: string }) => void) { listener({ kind: "ready" }); return () => {} },
      watch(_stream: string, listener: (nav: NavData) => void) { navs.push(listener); return () => {} },
      run: async () => ({ ok: true, route: "r", data: { videoId: video, title: "First video", length: 60, kind: "video" } }) } as never,
    actions: { playlists: async () => ({ kind: "cached", listing: { rows: [{ id: playlist, title: "Mixes" }], at: 1 } }) } as never,
    notices: { wouldAct: feature => { notices.push(feature) } }, popovers: async () => popovers })
  running.push(() => { scope.dispose(); timers.restore(); document.body.replaceChildren() })
  return { timers, menus, notices, navigate: (nav: NavData) => { for (const listener of navs) listener(nav) }, host: () => document.querySelector("pp-watch-button") }
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
  menu.open({ video, title: "First video", anchor, status: "Save this video with Perchling", quickSave: { playlist, name: "Mixes" }, pickerKey: "Alt+Shift+P" })
  const rows = () => [...document.querySelector("pp-watch-menu")?.shadowRoot?.querySelectorAll("button") ?? []]
  return { adds, pickers, rows, anchor, toast: () => feedback.read()?.feedback.toaster.read() ?? null }
}

test("the menu's Save row saves to the quick-save playlist in place and raises no toast for a confirmed save", async () => {
  const saved: TabAddReport = { kind: "report", outcomes: { [playlist]: { kind: "added" } }, feedback: true, undo: null, titles: {}, toast: null }
  const m = menuWorld(saved)
  expect(m.rows().map(button => button.textContent)).toEqual(["Save to Mixes", "Save to… (Alt+Shift+P)"])
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
