import { afterEach, expect, test } from "bun:test"
import type { Key } from "../../../shared/model"
import type { SiteView } from "../../core/feature-host"
import { Keys } from "../../core/keys"
import { Scope } from "../../core/scope"
import type { QuickInput } from "../../kit/music/quick"
import { shortcutsMusic } from "./music"
import { settle } from "../../../../tools/fixtures/site-toaster/harness"
import { press } from "../../../../tools/fixtures/pointer-keys/harness"
import { wireView } from "../../../../tools/fixtures/tab-view/cases"

const altJ: Key = { code: "KeyJ", char: "j", ctrl: false, alt: true, shift: false, meta: false }
const altShiftP: Key = { code: "KeyP", char: "p", ctrl: false, alt: true, shift: true, meta: false }
const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

test("a playlist shortcut key saves with Playlist shortcuts' Show feedback, and the picker key stays on YouTube", async () => {
  const base = wireView("music")
  if (base.site !== "music") throw Error("Expected a music view")
  const view = { ...base, features: base.features.map(feature => feature.id !== "shortcuts" ? feature : { ...feature,
    options: { ...feature.options, picker: altShiftP, list: [{ id: "orig01", key: altJ, label: "Alpha", watchLaterOnEveryAccount: false }] } }) } as SiteView<"music">
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError: () => {} })
  const scope = new Scope({ document, onError: () => {} })
  const saves: [string, Key, QuickInput][] = []
  void shortcutsMusic.start({
    site: "music", scope, keys, view: { read: () => view, subscribe: () => () => {} }, items: { track: () => () => {} },
    quick: { pressShortcut: async (entry, input) => { saves.push([entry.id, entry.key, input]); return { kind: "done", text: null } } }
  })
  running.push(() => { scope.dispose(); keys.dispose() })
  press(document.body, { key: "j", code: "KeyJ", altKey: true })
  const picker = press(document.body, { key: "P", code: "KeyP", altKey: true, shiftKey: true })
  await settle()
  expect(saves).toEqual([["orig01", altJ, { opener: "shortcuts", feedback: true, by: "key" }]])
  expect(picker.defaultPrevented).toBe(false)
})
