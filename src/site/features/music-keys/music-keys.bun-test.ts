import { afterEach, expect, test } from "bun:test"
import type { Key } from "../../../shared/model"
import type { SiteView } from "../../core/feature-host"
import { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import type { QuickAction, QuickInput } from "../../kit/music/quick"
import { musicKeys } from "./feature"
import { settle } from "../../../../tools/fixtures/site-toaster/harness"
import { press } from "../../../../tools/fixtures/pointer-keys/harness"
import { wireView } from "../../../../tools/fixtures/tab-view/cases"

const alt = (char: string): Key => ({ code: `Key${char.toUpperCase()}`, char, ctrl: false, alt: true, shift: false, meta: false })
const keysOn = { next: alt("n"), queue: alt("q"), save: alt("p"), picker: null, like: alt("l"), remove: alt("r"), library: null, mix: null, album: null, artist: null }

function keysView(change: { keys?: Partial<typeof keysOn>; feedback?: boolean; on?: boolean } = {}): SiteView<"music"> {
  const base = wireView("music")
  if (base.site !== "music") throw Error("Expected a music view")
  const features = base.features.flatMap((feature): unknown[] => feature.id !== "music-keys" ? [feature] : change.on === false ? [] : [{ ...feature,
    options: { ...feature.options, feedback: change.feedback ?? true, keys: { ...keysOn, ...change.keys } } }])
  return { ...base, features } as SiteView<"music">
}

const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

function setup(initial = keysView()) {
  const onError = () => {}
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError })
  const presses: [QuickAction, QuickInput][] = []
  let current = initial
  const listeners = new Set<(view: SiteView<"music">) => void>()
  const scope = new Scope({ document, onError })
  let tracked = 0
  void musicKeys.start({
    site: "music", scope, keys,
    view: { read: () => current, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } } },
    items: { track: () => { tracked++; return () => {} } },
    quick: { press: async (action, input) => { presses.push([action, input]); return { kind: "done", text: null } } }
  })
  running.push(() => { scope.dispose(); keys.dispose() })
  return {
    presses, get tracked() { return tracked },
    publish(view: SiteView<"music">) { current = view; for (const listener of [...listeners]) listener(view) }
  }
}

test("each quick-action key runs its action with its key and Quick-action shortcuts' Show feedback; an unset key does nothing", async () => {
  const f = setup(keysView({ feedback: false }))
  expect(f.tracked).toBe(1)
  press(document.body, { key: "n", code: "KeyN", altKey: true })
  press(document.body, { key: "l", code: "KeyL", altKey: true })
  const unset = press(document.body, { key: "m", code: "KeyM", altKey: true })
  await settle()
  expect(f.presses).toEqual([["next", { opener: "music-keys", feedback: false, by: "key", key: alt("n") }], ["like", { opener: "music-keys", feedback: false, by: "key", key: alt("l") }]])
  expect(unset.defaultPrevented).toBe(false)
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

test("switching the feature off in the view unbinds every key", async () => {
  const f = setup()
  f.publish(keysView({ on: false }))
  const event = press(document.body, { key: "n", code: "KeyN", altKey: true })
  await settle()
  expect(event.defaultPrevented).toBe(false)
  expect(f.presses).toEqual([])
})
