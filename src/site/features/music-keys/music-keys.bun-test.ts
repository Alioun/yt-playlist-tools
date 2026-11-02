import { afterEach, expect, test } from "bun:test"
import type { FeatureStatus } from "../../../shared/contracts/tab-view"
import type { Key } from "../../../shared/model"
import type { SiteView } from "../../core/feature-host"
import { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import { createFeedbackSession } from "../../kit/feedback/session"
import type { QuickAction, QuickInput } from "../../kit/music/quick"
import { musicKeys } from "./feature"
import { clock, labels, settle, undoKey } from "../../../../tools/fixtures/site-toaster/harness"
import { press } from "../../../../tools/fixtures/pointer-keys/harness"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { wireView } from "../../../../tools/fixtures/tab-view/cases"

const alt = (char: string): Key => ({ code: `Key${char.toUpperCase()}`, char, ctrl: false, alt: true, shift: false, meta: false })
const keysOn = { next: alt("n"), queue: alt("q"), save: alt("p"), picker: null, like: alt("l"), remove: alt("r"), library: null, mix: null, album: null, artist: null }

function keysView(change: { keys?: Partial<typeof keysOn>; status?: Partial<FeatureStatus>; feedback?: boolean; on?: boolean } = {}): SiteView<"music"> {
  const base = wireView("music")
  if (base.site !== "music") throw Error("Expected a music view")
  const features = base.features.flatMap(feature => feature.id !== "music-keys" || change.on === false ? [] : [{ ...feature,
    options: { ...feature.options, feedback: change.feedback ?? true, keys: { ...keysOn, ...change.keys } } }])
  const statuses = base.statuses.map(status => status.feature === "music-keys" ? { ...status, ...change.status } : status)
  return { ...base, features, statuses } as SiteView<"music">
}

const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

function setup(initial = keysView()) {
  const timers = clock()
  const onError = () => {}
  const root = new Scope({ document, onError })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError })
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "music", i18n: englishI18n(), labels, initial: { undoKey, features: [] },
    now: timers.now, onError, onCosmetic: () => {} })
  const presses: [QuickAction, QuickInput][] = [], notices: string[] = []
  let current = initial
  const listeners = new Set<(view: SiteView<"music">) => void>()
  const scope = new Scope({ document, onError })
  let tracked = 0
  void musicKeys.start({
    site: "music", scope, document, keys, feedback, i18n: englishI18n(), os: "windows",
    view: { read: () => current, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } } },
    items: { track: () => { tracked++; return () => {} } },
    quick: { press: async (action, input) => { presses.push([action, input]); return { kind: "done", text: null } } },
    notices: { wouldAct: feature => { notices.push(feature) } }
  })
  running.push(() => { scope.dispose(); keys.dispose(); root.dispose(); timers.restore(); document.body.replaceChildren() })
  return {
    presses, notices, get tracked() { return tracked },
    toast: () => feedback.read()?.feedback.toaster.read() ?? null,
    publish(view: SiteView<"music">) { current = view; for (const listener of [...listeners]) listener(view) }
  }
}

test("each quick-action key runs its action with Quick-action shortcuts' Show feedback, and a cleared key does nothing", async () => {
  const f = setup(keysView({ feedback: false }))
  expect(f.tracked).toBe(1)
  press(document.body, { key: "n", code: "KeyN", altKey: true })
  press(document.body, { key: "l", code: "KeyL", altKey: true })
  press(document.body, { key: "m", code: "KeyM", altKey: true })
  await settle()
  expect(f.presses).toEqual([["next", { opener: "music-keys", feedback: false, by: "key" }], ["like", { opener: "music-keys", feedback: false, by: "key" }]])
})

test("a changed key takes over at once, and the old one goes back to the page", async () => {
  const f = setup()
  f.publish(keysView({ keys: { next: alt("j") } }))
  const old = press(document.body, { key: "n", code: "KeyN", altKey: true })
  press(document.body, { key: "j", code: "KeyJ", altKey: true })
  await settle()
  expect(old.defaultPrevented).toBe(false)
  expect(f.presses.map(([action]) => action)).toEqual(["next"])
})

test("while the feature isn't working each key still answers, names its key, and raises the notice", async () => {
  const f = setup(keysView({ status: { state: "not-working" } }))
  press(document.body, { key: "n", code: "KeyN", altKey: true })
  await settle()
  expect(f.presses).toEqual([])
  expect(f.notices).toEqual(["music-keys"])
  expect(f.toast()?.content).toMatchObject({ tone: "failure",
    text: "Play next (Alt+N) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now." })
})

test("an action unavailable in this tab answers its key with a pointer to the popup, and the others still run", async () => {
  const f = setup(keysView({ status: { state: "partly-working", actions: ["next", "queue"] } }))
  press(document.body, { key: "q", code: "KeyQ", altKey: true })
  await settle()
  expect(f.toast()?.content.text).toBe("Add to queue isn't working right now. The popup shows why.")
  press(document.body, { key: "l", code: "KeyL", altKey: true })
  await settle()
  expect(f.presses.map(([action]) => action)).toEqual(["like"])
})

test("switching the feature off in the view unbinds every key", async () => {
  const f = setup()
  f.publish(keysView({ on: false }))
  const event = press(document.body, { key: "n", code: "KeyN", altKey: true })
  await settle()
  expect(event.defaultPrevented).toBe(false)
  expect(f.presses).toEqual([])
})
