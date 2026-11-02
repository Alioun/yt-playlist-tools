import { afterEach, expect, test } from "bun:test"
import type { TabAddReport, TabAddRequest } from "../../../shared/contracts/tab-actions"
import type { Key } from "../../../shared/model"
import type { TabActions } from "../../core/actions"
import type { SiteView } from "../../core/feature-host"
import { WwwItems } from "../../core/items-www"
import { Keys } from "../../core/keys"
import { Pointer } from "../../core/pointer"
import { Scope } from "../../core/scope"
import { createFeedbackSession } from "../../kit/feedback/session"
import { createOverlayKit } from "../../kit/overlay"
import type { OpenPicker, Popovers } from "../../popovers/types"
import { quickSave, settleMs } from "./feature"
import { card, videoA } from "../../../../tools/fixtures/site-queue-button/harness"
import { clock, labels, settle, undoKey } from "../../../../tools/fixtures/site-toaster/harness"
import { hitStack } from "../../../../tools/fixtures/pointer-keys/harness"
import { harness as pageHarness, rawIdentity, snapshot } from "../../../../tools/fixtures/page-link/support"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { playlist, wireView } from "../../../../tools/fixtures/tab-view/cases"

const altShiftP: Key = { code: "KeyP", char: "p", ctrl: false, alt: true, shift: true, meta: false }
const nothing = { tab: [], session: [] }
const added: TabAddReport = { kind: "report", outcomes: { [playlist]: { kind: "added" } }, feedback: true, undo: { kind: "add", id: "e:1" }, titles: { [playlist]: "Mixes" },
  toast: { tone: "confirmation", auto: false, message: { kind: "saved", playlists: [playlist] }, action: { kind: "undo" }, remember: nothing } }
const failed: TabAddReport = { kind: "report", outcomes: { [playlist]: { kind: "failed", failure: "refused" } }, feedback: true, undo: null, titles: {},
  toast: { tone: "failure", auto: false, message: { kind: "failed", failure: "refused", playlists: [playlist] }, action: null, remember: nothing } }

function quickView(change: { signedIn?: boolean; quickSave?: boolean } = {}): SiteView<"www"> {
  const base = wireView("www", change.signedIn ?? true)
  if (base.site !== "www") throw Error("Expected a www view")
  const features = base.features.map(feature => feature.id === "shortcuts" ? { ...feature, options: { ...feature.options, picker: altShiftP } } : feature)
  const setup = base.signedIn && base.setup.kind === "live" && change.quickSave === false
    ? { kind: "live" as const, setup: { ...base.setup.setup, quickSave: null } } : base.setup
  return { ...base, features, ...(base.signedIn ? { setup } : {}) } as SiteView<"www">
}

const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

async function setup(options: { view?: SiteView<"www">; answer?: TabAddReport } = {}) {
  const timers = clock()
  const onError = () => {}
  const page = pageHarness({ run: async () => ({ ok: false, reason: "unavailable" }), pageSnapshot: () => snapshot(rawIdentity) })
  await page.link.hello
  const root = new Scope({ document, onError })
  const pointer = new Pointer({ document, onError })
  const items = new WwwItems({ document, onError, pointer, page: page.link, report: { itemUnrecognised: () => {}, pageSettled: () => {} } })
  const keys = new Keys({ document, blockers: { menuOpen: () => false, dialogOpen: () => false, extensionPopoverOpen: () => false }, onError })
  const i18n = englishI18n()
  const feedback = createFeedbackSession({ owner: root, document, keys, site: "www", i18n, labels, initial: { undoKey, features: [] },
    now: timers.now, onError, onCosmetic: () => {} })
  const overlay = createOverlayKit({ owner: root, document, onError })
  const adds: TabAddRequest[] = [], opened: OpenPicker[] = [], visited: string[] = []
  const actions = {
    add: async (request: TabAddRequest) => { adds.push(request); return options.answer ?? added },
    undo: async () => ({ kind: "undone" }),
    playlists: async () => ({ kind: "cached", listing: { rows: [{ id: playlist, title: "Mixes" }], at: 1 } })
  } as unknown as TabActions
  const popovers: Popovers = { openPicker(request) { opened.push(request) }, openWatchMenu() {}, isOpen: () => false, close() {} }
  const stack = hitStack()
  const current = options.view ?? quickView()
  const scope = new Scope({ document, onError })
  void quickSave.start({ site: "www", scope, document, items, page: page.link, actions, feedback, overlay, i18n,
    view: { read: () => current, subscribe: () => () => {} },
    notices: { wouldAct: () => {} }, popovers: async () => popovers, os: "windows",
    location: { href: "https://www.youtube.com/", assign: (url: string) => { visited.push(url) } } })
  running.push(() => { scope.dispose(); items.dispose(); pointer.dispose(); keys.dispose(); root.dispose(); page.dispose(); stack.restore(); timers.restore(); document.body.replaceChildren() })
  const target = card()
  const buttons = () => [...document.querySelector("pp-overlay")?.shadowRoot?.querySelectorAll("[data-slot=quick-save] button") ?? []] as HTMLButtonElement[]
  return {
    adds, opened, visited, timers, target,
    hover() { stack.set([target.thumbnail, target.element]); target.thumbnail.dispatchEvent(new PointerEvent("pointerover", { clientX: 10, clientY: 10, bubbles: true, composed: true })) },
    main: () => buttons()[0] ?? null,
    more: () => buttons()[1] ?? null,
    toast: () => feedback.read()?.feedback.toaster.read() ?? null
  }
}

test("a click saves the hovered card to the quick-save playlist, shows ✓ for 1.5 s, then Saved to its list", async () => {
  const f = await setup()
  f.hover()
  await settle()
  expect(f.main()?.getAttribute("aria-label")).toBe("Save to Mixes")
  f.main()?.click()
  await settle()
  expect(f.adds).toEqual([{ site: "www", video: videoA as never, via: "quick-save", opener: "quick-save", title: "First video" }])
  expect(f.main()?.dataset.state).toBe("done")
  expect(f.toast()?.content.text).toBe("Saved “First video” to Mixes")
  f.timers.advance(settleMs)
  expect(f.main()?.dataset.state).toBe("saved")
  expect(f.main()?.getAttribute("aria-label")).toBe("Saved to Mixes")
})

test("a failed save shows the failed state for 1.5 s, then idle again", async () => {
  const f = await setup({ answer: failed })
  f.hover()
  f.main()?.click()
  await settle()
  expect(f.main()?.dataset.state).toBe("failed")
  f.timers.advance(settleMs)
  expect(f.main()?.dataset.state).toBe("idle")
})

test("with no quick-save playlist the button is one Save to… that opens choose mode", async () => {
  const f = await setup({ view: quickView({ quickSave: false }) })
  f.hover()
  await settle()
  expect(f.main()?.getAttribute("aria-label")).toBe("Save to…")
  expect(f.more()?.hidden).toBe(true)
  f.main()?.click()
  await settle()
  expect(f.adds).toEqual([])
  expect(f.opened.map(({ mode, opener }) => ({ mode, opener }))).toEqual([{ mode: { kind: "choose", shortcut: null }, opener: "quick-save" }])
})

test("▾ opens the picker below the split button and names the picker key in its tooltip", async () => {
  const f = await setup()
  f.hover()
  await settle()
  expect(f.more()?.getAttribute("aria-label")).toBe("Save to… (Alt+Shift+P)")
  f.more()?.click()
  await settle()
  expect(f.opened.map(({ mode, anchor, opener }) => ({ mode, anchor: anchor.kind, opener }))).toEqual([{ mode: { kind: "save" }, anchor: "below", opener: "quick-save" }])
})

test("signed out, ▾ answers with Sign in and the picker doesn't open", async () => {
  const f = await setup({ view: quickView({ signedIn: false }) })
  f.hover()
  await settle()
  f.more()?.click()
  await settle()
  expect(f.opened).toEqual([])
  expect(f.toast()?.content.text).toBe("Sign in to YouTube to save videos.")
})
