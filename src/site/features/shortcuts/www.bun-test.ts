import { afterEach, expect, test } from "bun:test"
import type { TabView } from "../../../shared/contracts/tab-view"
import type { TabAddReport, TabAddRequest, UndoHandle } from "../../../shared/contracts/tab-actions"
import type { Key, PlaylistId } from "../../../shared/model"
import type { TabActions, Unanswered } from "../../core/actions"
import type { SiteView } from "../../core/feature-host"
import type { WwwResolution } from "../../core/items-www"
import { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import { createFeedbackSession } from "../../kit/feedback/session"
import type { OpenPicker, Popovers } from "../../popovers/types"
import { shortcutsWww } from "./www"
import { clock, labels, settle, undoKey } from "../../../../tools/fixtures/site-toaster/harness"
import { press } from "../../../../tools/fixtures/pointer-keys/harness"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { playlist, video, wireView } from "../../../../tools/fixtures/tab-view/cases"

const altW: Key = { code: "KeyW", char: "w", ctrl: false, alt: true, shift: false, meta: false }
const altShiftP: Key = { code: "KeyP", char: "p", ctrl: false, alt: true, shift: true, meta: false }
const handle: UndoHandle = { kind: "add", id: "engine:1" }
const nothing = { tab: [], session: [] }
const saved: TabAddReport = { kind: "report", outcomes: { [playlist]: { kind: "added" } }, feedback: true, undo: handle, titles: { [playlist]: "Mixes" },
  toast: { tone: "confirmation", auto: false, message: { kind: "saved", playlists: [playlist] }, action: { kind: "undo" }, remember: nothing } }

function shortcutView(change: { signedIn?: boolean; on?: boolean; target?: boolean } = {}): SiteView<"www"> {
  const base = wireView("www", change.signedIn ?? true)
  if (base.site !== "www") throw Error("Expected a www view")
  const features = base.features.flatMap(feature => feature.id !== "shortcuts" ? [] : change.on === false ? [] : [{ ...feature,
    options: { ...feature.options, picker: altShiftP, list: [{ id: "orig01", key: altW, label: "Alpha", watchLaterOnEveryAccount: false }] } }])
  const setup = base.signedIn && base.setup.kind === "live" && change.target === false
    ? { kind: "live" as const, setup: { ...base.setup.setup, targets: {} } } : base.setup
  return { ...base, features, ...(base.signedIn ? { setup } : {}) } as SiteView<"www">
}

const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

function setup(options: { view?: SiteView<"www">; resolution?: WwwResolution; answer?: () => Promise<TabAddReport | Unanswered>; popovers?: Popovers | null } = {}) {
  const timers = clock()
  const onError = () => {}
  const root = new Scope({ document, onError })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError })
  const i18n = englishI18n()
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "www", i18n, labels, initial: { undoKey, features: [] },
    now: timers.now, onError, onCosmetic: () => {} })
  const card = document.createElement("ytd-rich-grid-media")
  document.body.append(card)
  const adds: TabAddRequest[] = [], undos: UndoHandle[] = [], opened: OpenPicker[] = [], visited: string[] = [], notices: string[] = []
  const actions = {
    add: async (request: TabAddRequest) => { adds.push(request); return options.answer ? options.answer() : saved },
    undo: async (undone: UndoHandle) => { undos.push(undone); return { kind: "undone" } }
  } as unknown as TabActions
  const popovers: Popovers = { openPicker(request) { opened.push(request) }, isOpen: () => false, close() {} }
  let current: SiteView<"www"> | null = options.view ?? shortcutView()
  const listeners = new Set<(view: SiteView<"www">) => void>()
  const scope = new Scope({ document, onError })
  void shortcutsWww.start({
    site: "www", scope, document, keys, actions, feedback, i18n,
    view: { read: () => current, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } } },
    items: { track: () => () => {}, resolve: async () => options.resolution ?? { kind: "pointed-item", target: { element: card, family: "rich-grid", identity: { videoId: video, kind: "video", signature: "s" } },
      video: { videoId: video, title: "First video", length: 60, kind: "video" } } },
    notices: { wouldAct: feature => { notices.push(feature) } },
    popovers: async () => options.popovers === undefined ? popovers : options.popovers,
    location: { href: "https://www.youtube.com/watch?v=aaaaaaaaaaa", assign: (url: string) => { visited.push(url) } }
  })
  running.push(() => { scope.dispose(); keys.dispose(); root.dispose(); timers.restore(); document.body.replaceChildren() })
  return {
    adds, undos, opened, visited, notices, timers, card,
    toast: () => feedback.read()?.feedback.toaster.read() ?? null,
    publish(view: SiteView<"www">) { current = view; for (const listener of [...listeners]) listener(view) }
  }
}

test("a shortcut key saves the pointed video, shows the pending toast after 1 s, then the answer with Undo", async () => {
  let answer = (_: TabAddReport) => {}
  const f = setup({ answer: () => new Promise(resolve => { answer = resolve }) })
  press(document.body, { key: "w", code: "KeyW", altKey: true })
  await settle()
  expect(f.adds).toEqual([{ site: "www", video, via: "shortcut", shortcut: "orig01" as never }])
  expect(f.toast()).toBeNull()
  f.timers.advance(1000)
  expect(f.toast()?.content.text).toContain("Saving")
  answer(saved)
  await settle()
  expect(f.toast()?.content.text).toBe("Saved “First video” to Mixes")
  await f.toast()?.act()
  expect(f.undos).toEqual([handle])
})

test("pointing at a playlist card says only videos can be saved, and adds nothing", async () => {
  const f = setup({ resolution: { kind: "unsupported-item", element: document.body, reason: "playlist" } })
  press(document.body, { key: "w", code: "KeyW", altKey: true })
  await settle()
  expect(f.adds).toEqual([])
  expect(f.toast()?.content).toMatchObject({ text: "Only videos can be saved to playlists.", tone: "hint" })
})

test("a shortcut with no playlist on this account offers Choose, which opens choose mode for that shortcut", async () => {
  const noPlaylist: TabAddReport = { kind: "report", outcomes: {}, feedback: true, undo: null, titles: {},
    toast: { tone: "hint", auto: false, message: { kind: "no-playlist" }, action: { kind: "choose" }, remember: nothing } }
  const f = setup({ view: shortcutView({ target: false }), answer: async () => noPlaylist })
  press(document.body, { key: "w", code: "KeyW", altKey: true })
  await settle()
  expect(f.toast()?.content.text).toBe("Alpha has no playlist on Alpha yet.")
  await f.toast()?.act()
  await settle()
  expect(f.opened).toEqual([{ video, title: "First video", anchor: { kind: "beside", element: f.card }, mode: { kind: "choose", shortcut: "orig01" as never }, opener: "shortcuts" }])
})

test("the picker key opens the picker beside the pointed card", async () => {
  const f = setup()
  press(document.body, { key: "P", code: "KeyP", altKey: true, shiftKey: true })
  await settle()
  expect(f.opened.map(({ mode, anchor, opener }) => ({ mode, anchor: anchor.kind, opener }))).toEqual([{ mode: { kind: "save" }, anchor: "beside", opener: "shortcuts" }])
})

test("the picker key says the list couldn't open when popovers.js doesn't load", async () => {
  const failing = setup({ popovers: null })
  press(document.body, { key: "P", code: "KeyP", altKey: true, shiftKey: true })
  await settle()
  expect(failing.toast()?.content).toMatchObject({ text: "Couldn't open the playlist list. Try again.", tone: "failure" })
})

test("signed out, the picker key answers with Sign in and never opens the picker", async () => {
  const f = setup({ view: shortcutView({ signedIn: false }) })
  press(document.body, { key: "P", code: "KeyP", altKey: true, shiftKey: true })
  await settle()
  expect(f.opened).toEqual([])
  expect(f.toast()?.content.text).toBe("Sign in to YouTube to save videos.")
  await f.toast()?.act()
  expect(f.visited[0]).toStartWith("https://accounts.google.com/ServiceLogin?service=youtube")
})

test("switching the feature off releases its keys, and a feature that isn't working keeps them caught for its notice", async () => {
  const f = setup()
  f.publish(shortcutView({ on: false }))
  const passed = press(document.body, { key: "w", code: "KeyW", altKey: true })
  await settle()
  expect(passed.defaultPrevented).toBe(false)
  expect(f.adds).toEqual([])
  const broken = shortcutView()
  f.publish({ ...broken, statuses: broken.statuses.map(status => status.feature === "shortcuts" ? { ...status, state: "not-working" } : status) })
  const caught = press(document.body, { key: "w", code: "KeyW", altKey: true })
  await settle()
  expect(caught.defaultPrevented).toBe(true)
  expect(f.adds).toEqual([])
  expect(f.notices).toEqual(["shortcuts"])
})
