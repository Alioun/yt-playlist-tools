import { afterEach, expect, test } from "bun:test"
import type { Key } from "../../../shared/model"
import type { SiteView } from "../../core/feature-host"
import { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import { createFeedbackSession } from "../../kit/feedback/session"
import type { QuickInput } from "../../kit/music/quick"
import { shortcutsMusic } from "./music"
import { clock, labels, settle, undoKey } from "../../../../tools/fixtures/site-toaster/harness"
import { press } from "../../../../tools/fixtures/pointer-keys/harness"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { wireView } from "../../../../tools/fixtures/tab-view/cases"

const altJ: Key = { code: "KeyJ", char: "j", ctrl: false, alt: true, shift: false, meta: false }
const altShiftP: Key = { code: "KeyP", char: "p", ctrl: false, alt: true, shift: true, meta: false }
const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

function shortcutView(state: "working" | "not-working" = "working"): SiteView<"music"> {
  const base = wireView("music")
  if (base.site !== "music") throw Error("Expected a music view")
  const features = base.features.map(feature => feature.id !== "shortcuts" ? feature : { ...feature,
    options: { ...feature.options, picker: altShiftP, list: [{ id: "orig01", key: altJ, label: "Alpha", watchLaterOnEveryAccount: false }] } })
  return { ...base, features, statuses: base.statuses.map(status => status.feature === "shortcuts" ? { ...status, state } : status) } as SiteView<"music">
}

function setup(view: SiteView<"music">) {
  const timers = clock()
  const onError = () => {}
  const root = new Scope({ document, onError })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError })
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "music", i18n: englishI18n(), labels, initial: { undoKey, features: [] },
    now: timers.now, onError, onCosmetic: () => {} })
  const saves: [string, QuickInput][] = [], notices: string[] = []
  const scope = new Scope({ document, onError })
  void shortcutsMusic.start({
    site: "music", scope, document, keys, feedback, i18n: englishI18n(), os: "windows",
    view: { read: () => view, subscribe: () => () => {} },
    items: { track: () => () => {} },
    quick: { pressShortcut: async (entry, input) => { saves.push([entry.id, input]); return { kind: "done", text: null } } },
    notices: { wouldAct: feature => { notices.push(feature) } }
  })
  running.push(() => { scope.dispose(); keys.dispose(); root.dispose(); timers.restore() })
  return { saves, notices, toast: () => feedback.read()?.feedback.toaster.read() ?? null }
}

test("a playlist shortcut key saves with Playlist shortcuts' Show feedback, and the picker key stays on YouTube", async () => {
  const f = setup(shortcutView())
  press(document.body, { key: "j", code: "KeyJ", altKey: true })
  const picker = press(document.body, { key: "P", code: "KeyP", altKey: true, shiftKey: true })
  await settle()
  expect(f.saves).toEqual([["orig01", { opener: "shortcuts", feedback: true, by: "key" }]])
  expect(picker.defaultPrevented).toBe(false)
})

test("while Playlist shortcuts isn't working its keys answer as Save to playlist and raise the notice", async () => {
  const f = setup(shortcutView("not-working"))
  press(document.body, { key: "j", code: "KeyJ", altKey: true })
  await settle()
  expect(f.saves).toEqual([])
  expect(f.notices).toEqual(["shortcuts"])
  expect(f.toast()?.content.text).toBe("Save to playlist (Alt+J) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now.")
})
