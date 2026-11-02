import { afterEach, expect, test } from "bun:test"
import type { TabAddReport } from "../../shared/contracts/tab-actions"
import type { PlaylistId } from "../../shared/model"
import { pageGlobal } from "../global"
import { createFeedbackSession } from "../kit/feedback/session"
import type { OpenPicker } from "../popovers/types"
import { tabAsks } from "./asks"
import type { TabActions } from "./actions"
import { Keys } from "./keys"
import { Scope } from "./scope"
import { clock, labels, settle, undoKey } from "../../../tools/fixtures/site-toaster/harness"
import { englishI18n } from "../../../tools/fixtures/localization/scripted"

const WL = "WL" as PlaylistId
const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop(); delete pageGlobal().popovers })

function world(need: () => Promise<boolean>, gatherUndo: TabActions["gatherUndo"] = async () => null) {
  const timers = clock()
  const root = new Scope({ document, onError: () => {} })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError: () => {} })
  const i18n = englishI18n()
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "www", i18n, labels, initial: { undoKey, features: [] }, now: timers.now, onError: () => {}, onCosmetic: () => {} })
  const undone: unknown[] = []
  const actions = { need, undo: async (handle: unknown) => { undone.push(handle); return { kind: "undone" } },
    gatherUndo: async (id: string) => { undone.push(id); return gatherUndo(id) } } as unknown as TabActions
  const asks = tabAsks({ site: "www", document, actions, i18n, feedback: () => feedback.use(root) })
  running.push(() => { root.dispose(); keys.dispose(); timers.restore() })
  return { asks, timers, undone, toast: () => feedback.read()?.feedback.toaster.read() ?? null }
}

test("a save from another tab shows its answer as this tab's toast, with Undo", async () => {
  const w = world(async () => true)
  const answer: TabAddReport = { kind: "report", outcomes: { [WL]: { kind: "added" } }, feedback: true, undo: { kind: "add", id: "e:1" }, titles: {},
    toast: { tone: "confirmation", auto: false, message: { kind: "saved", playlists: [WL] }, action: { kind: "undo" }, remember: { tab: [], session: [] } } }
  w.asks.toast({ answer, video: "aaaaaaaaaaa" as never, title: "First video", opener: "any-tab-keys" })
  expect(w.toast()?.content.text).toBe("Saved “First video” to Watch later")
  await w.toast()?.act()
  expect(w.undone).toEqual([{ kind: "add", id: "e:1" }])
})

test("the browser menu's Choose a playlist opens the picker here, or says the list couldn't open", async () => {
  const opened: OpenPicker[] = []
  pageGlobal().popovers = { openPicker(request) { opened.push(request) }, openWatchMenu() {}, isOpen: () => false, close() {} }
  const w = world(async () => true)
  expect(await w.asks.picker({ video: "aaaaaaaaaaa" as never, title: null, choose: false, opener: "browser-menu" })).toBe("opened")
  expect(opened.map(({ mode, anchor, opener }) => ({ mode, anchor: anchor.kind, opener }))).toEqual([{ mode: { kind: "save" }, anchor: "window", opener: "browser-menu" }])
  delete pageGlobal().popovers
  const failing = world(async () => false)
  expect(await failing.asks.picker({ video: "aaaaaaaaaaa" as never, title: null, choose: true, opener: "browser-menu" })).toBe("failed")
  await settle()
  expect(failing.toast()?.content.text).toBe("Couldn't open the playlist list. Try again.")
})

test("a gather's toast carries Undo, which spends it once it worked and says so when it didn't", async () => {
  // happy-dom leaves fullscreenElement undefined, which reads as fullscreen, where an unasked toast waits; a browser says null.
  Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true })
  running.push(() => { Reflect.deleteProperty(document, "fullscreenElement") })
  const w = world(async () => true)
  w.asks.gatherToast({ text: "Gathered 3 videos into Later by itself and closed their tabs", tone: "confirmation", auto: true, undo: "g:1" })
  expect(w.toast()?.content).toMatchObject({ text: "Gathered 3 videos into Later by itself and closed their tabs", tone: "confirmation", auto: true, action: { kind: "undo" } })
  await w.toast()?.act()
  expect(w.undone).toEqual(["g:1"])
  expect(w.toast()?.content.action ?? null).toBeNull()
  const failing = world(async () => true, async () => ({ kind: "unanswered" }))
  failing.asks.gatherToast({ text: "Gathered 1 video into Later", tone: "confirmation", auto: false, undo: "g:2" })
  await failing.toast()?.act()
  await settle()
  expect(failing.toast()?.content).toMatchObject({ text: "Couldn't undo.", tone: "failure", action: null })
})
