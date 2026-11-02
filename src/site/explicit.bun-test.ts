import { expect, test } from "bun:test"
import { explicitContent, type ExplicitContext } from "./explicit"
import type { TabAddReport, UndoHandle } from "../shared/contracts/tab-actions"
import type { PlaylistId } from "../shared/model"
import type { ToastPlan } from "../shared/rules/outcomes"
import type { Feedback } from "./kit/feedback"
import { englishI18n } from "../../tools/fixtures/localization/scripted"

const list = "PL_alpha" as PlaylistId
const handle: UndoHandle = { kind: "add", id: "add-1" }
function context() {
  const released: UndoHandle[] = [], opened: unknown[] = []
  const session = {
    format: (plan: ToastPlan, _titles: unknown, action: unknown) => ({ text: plan.message.kind, tone: plan.tone, auto: plan.auto, action }),
    action: (kind: string, run: () => unknown) => ({ kind, label: kind, run })
  } as unknown as Feedback
  const value: ExplicitContext = { session, i18n: englishI18n(), location: { href: "https://www.youtube.com/", assign() {} },
    actions: { undo: async () => ({ kind: "undone" }), release: released.push.bind(released), settings: target => { opened.push(target) } } }
  return { value, released, opened }
}
function report(toast: ToastPlan | null): TabAddReport {
  return { kind: "report", outcomes: { [list]: { kind: "added" } }, toast, feedback: toast !== null, undo: handle, titles: {} }
}
const saved = (action: ToastPlan["action"]): ToastPlan => ({ tone: "confirmation", auto: true, message: { kind: "saved", playlists: [list] }, action, remember: { tab: [], session: [] } })

test("an add whose answer shows no Undo releases its handle at once, since nothing could use it", () => {
  for (const toast of [null, saved(null)]) {
    const { value, released } = context()
    explicitContent(value, report(toast), {}, {})
    expect(released).toEqual([handle])
  }
})

test("an add whose toast offers Undo hands the release to that toast", () => {
  const { value, released } = context()
  const content = explicitContent(value, report(saved({ kind: "undo" })), {}, {})
  expect(released).toEqual([])
  content?.action?.release?.()
  expect(released).toEqual([handle])
})

test("a shortcut's Missing playlist toasts with Settings, which opens Settings at that playlist's row (YT-ADD-29)", async () => {
  const { value, opened } = context()
  const failed: TabAddReport = { kind: "report", outcomes: { [list]: { kind: "failed", failure: "missing" } }, feedback: true, undo: null, titles: {},
    toast: { tone: "failure", auto: false, message: { kind: "failed", failure: "missing", playlists: [list] }, action: { kind: "settings", feature: "shortcuts", playlist: list },
      remember: { tab: [], session: [] } } }
  const content = explicitContent(value, failed, {}, {})
  expect(content?.action?.kind).toBe("settings")
  await content?.action?.run()
  expect(opened).toEqual([{ feature: "shortcuts", playlist: list }])
})
