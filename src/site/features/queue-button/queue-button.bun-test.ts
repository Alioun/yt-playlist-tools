import { afterEach, expect, spyOn, test } from "bun:test"
import { card, entryA, listId, queueFixture, queueView, recycle, settle, videoA, videoB, type QueueFixture } from "../../../../tools/fixtures/site-queue-button/harness"
import { video as skippedVideo } from "../../../../tools/fixtures/tab-view/cases"
import { press } from "../../../../tools/fixtures/site-toaster/harness"

const fixtures: QueueFixture[] = []
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.dispose() })
async function setup(options: Parameters<typeof queueFixture>[0] = {}) {
  const fixture = await queueFixture(options)
  fixtures.push(fixture)
  return fixture
}
function layout(element: HTMLElement, box: { top: number; left: number; width: number; height: number }) {
  for (const [name, value] of [["offsetTop", box.top], ["offsetLeft", box.left], ["offsetHeight", box.height], ["offsetWidth", box.width]] as const) {
    Object.defineProperty(element, name, { configurable: true, value })
  }
  Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: () => ({ x: box.left, y: box.top, left: box.left, top: box.top, width: box.width, height: box.height, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => box }) })
}
const confirmed = (undo = true) => async () => ({ ok: true, data: { confirmed: true, quiet: true, ...(undo ? { undo: { listId, setVideoId: entryA } } : {}) }, route: "fixture-route" })
const label = (f: QueueFixture) => f.button()?.getAttribute("aria-label") ?? null
async function click(f: QueueFixture) { f.button()?.click(); await settle() }

test("construction is inert and only an enabled feature owns one overlay host", async () => {
  const listen = spyOn(document, "addEventListener")
  try {
    const f = await setup({ view: queueView({ on: false }) })
    expect(f.scopes).toHaveLength(0)
    expect(listen.mock.calls.some(call => call[0] === "pointerover")).toBe(false)
    const first = card()
    f.hover(first.thumbnail, [first.element])
    expect(f.hostCount()).toBe(0)
    await f.publish(queueView())
    expect(f.scopes).toHaveLength(1)
    f.hover(first.thumbnail, [first.element])
    expect(f.hostCount()).toBe(1)
    expect(f.overlayHost()?.previousElementSibling).toBe(first.thumbnail)
    const second = card(videoB, "Second video")
    f.hover(second.thumbnail, [second.element])
    expect(f.hostCount()).toBe(1)
    expect(f.overlayHost()?.previousElementSibling).toBe(second.thumbnail)
    await f.publish(queueView({ on: false }))
    expect(f.hostCount()).toBe(0)
    expect(f.scopes[0]?.disposed).toBe(true)
    expect(f.scopes[0]?.resourceCount).toBe(0)
    await f.publish(queueView())
    expect(f.scopes).toHaveLength(2)
    f.hover(first.thumbnail, [first.element])
    expect(label(f)).toBe("Add to queue")
  } finally { listen.mockRestore() }
})

test("placement sits 4 px into the thumbnail and stacks in a row under 100 px", async () => {
  const f = await setup()
  const tall = card()
  layout(tall.thumbnail, { top: 20, left: 30, width: 320, height: 180 })
  f.hover(tall.thumbnail, [tall.element])
  const host = f.overlayHost()
  expect(host instanceof HTMLElement ? [host.style.top, host.style.left, host.hasAttribute("data-row")] : null).toEqual(["24px", "34px", false])
  const panel = card(videoB, "Panel row", "ytd-playlist-panel-video-renderer")
  layout(panel.thumbnail, { top: 0, left: 0, width: 100, height: 56 })
  f.hover(panel.thumbnail, [panel.element])
  expect(f.overlayHost()?.hasAttribute("data-row")).toBe(true)
})

test("signed out with absent account keys still adds with no account field and ignores filters and skips", async () => {
  const f = await setup({ view: queueView({ signedIn: false }), signedInPage: false })
  f.respond(confirmed())
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  expect(f.runs("queueAdd")).toHaveLength(1)
  expect(f.runs("queueAdd")[0]?.context?.target).toBe(target.element)
  expect(f.page.messages("run").map(message => JSON.stringify(message)).some(text => text.includes("acct"))).toBe(false)
  expect(label(f)).toBe("Added to queue")
})

test("a signed-in view's channel filters and session skips do not gate the queue", async () => {
  const f = await setup({ view: queueView() })
  f.respond(confirmed())
  const skipped = card(skippedVideo, "Skipped and filtered")
  f.hover(skipped.thumbnail, [skipped.element])
  await click(f)
  expect(f.runs("queueAdd")).toHaveLength(1)
  expect(f.runs("membership")).toHaveLength(0)
  expect(f.runs("add")).toHaveLength(0)
})

test("busy ignores repeated clicks and key repeat, and Added ignores another click", async () => {
  const f = await setup()
  const answer = f.deferred<unknown>()
  f.respond(() => answer.promise)
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  expect(label(f)).toBe("Adding…")
  await click(f)
  await click(f)
  expect(f.runs("queueAdd")).toHaveLength(1)
  answer.resolve({ ok: true, data: { confirmed: true, quiet: true }, route: f.route })
  await settle()
  expect(label(f)).toBe("Added to queue")
  await click(f)
  expect(f.runs("queueAdd")).toHaveLength(1)
})

test("only a confirmed answer renders Added; a page answer without confirmation is sent-unconfirmed and resends only on click", async () => {
  const f = await setup({ view: queueView({ feedback: false }) })
  f.respond(async () => ({ ok: true, data: { confirmed: false, quiet: true }, route: f.route }))
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  expect(label(f)).toBe("Sent, not confirmed. Click to send again")
  expect(f.toast()?.content.text).toBe("Couldn't confirm “First video” was added to the queue. Check the miniplayer.")
  f.timers.advance(10_000)
  expect(f.runs("queueAdd")).toHaveLength(1)
  f.respond(confirmed())
  await click(f)
  expect(f.runs("queueAdd")).toHaveLength(2)
  expect(label(f)).toBe("Added to queue")
  expect(f.toast()).toBeNull()
})

test("a PageLink deadline is unconfirmed, not failure or success", async () => {
  const f = await setup()
  f.respond(() => new Promise(() => {}))
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  f.page.clock.advance(10_000)
  await settle()
  expect(label(f)).toBe("Sent, not confirmed. Click to send again")
})

test("failure shows with feedback off for 1.5 s, then idle, and never resends", async () => {
  const f = await setup({ view: queueView({ feedback: false }) })
  f.respond(async () => ({ ok: false, reason: "unavailable" }))
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  expect(label(f)).toBe("Couldn't add")
  expect(f.toast()?.content.text).toBe("Couldn't add “First video” to the queue. Try YouTube's ⋮ menu.")
  expect(f.toast()?.content.tone).toBe("failure")
  await click(f)
  f.timers.advance(1_499)
  expect(label(f)).toBe("Couldn't add")
  f.timers.advance(1)
  expect(label(f)).toBe("Add to queue")
  f.timers.advance(10_000)
  expect(f.runs("queueAdd")).toHaveLength(1)
})

test("a noisy confirmed add stands without our toast and is not resent", async () => {
  const f = await setup()
  f.respond(async () => ({ ok: true, data: { confirmed: true, quiet: false, undo: { listId, setVideoId: entryA } }, route: f.route }))
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  expect(label(f)).toBe("Added to queue")
  expect(f.toast()).toBeNull()
  f.timers.advance(10_000)
  expect(f.runs("queueAdd")).toHaveLength(1)
})

test("confirmed quiet success offers Undo for exactly the captured entry; success closes and returns the item to idle", async () => {
  const f = await setup()
  f.respond(confirmed())
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  const toast = f.toast()
  expect(toast?.content.text).toBe("Added “First video” to the queue")
  expect(toast?.content.action?.label).toBe("Undo")
  f.respond(async job => job.kind === "queueUndo" ? { ok: true, data: null, route: f.route } : { ok: false, reason: "failed" })
  await toast?.act()
  await settle()
  expect(f.runs("queueUndo").map(call => call.job)).toEqual([{ kind: "queueUndo", listId, setVideoId: entryA }])
  expect(f.toast()).toBeNull()
  expect(label(f)).toBe("Add to queue")
})

test("Undo failure reads Couldn't undo and the item stays Added", async () => {
  const f = await setup()
  f.respond(confirmed())
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  f.respond(async () => ({ ok: false, reason: "failed" }))
  await f.toast()?.act()
  await settle()
  expect(f.toast()?.content.text).toBe("Couldn't undo.")
  expect(label(f)).toBe("Added to queue")
})

test("the undo key reaches the same exact-entry Undo", async () => {
  const f = await setup()
  f.respond(confirmed())
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  f.present()
  f.respond(async () => ({ ok: true, data: null, route: f.route }))
  press()
  await settle()
  expect(f.runs("queueUndo").map(call => call.job)).toEqual([{ kind: "queueUndo", listId, setVideoId: entryA }])
})

test("confirmation without an entry identity offers no Undo", async () => {
  const f = await setup()
  f.respond(confirmed(false))
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  expect(f.toast()?.content.text).toBe("Added “First video” to the queue")
  expect(f.toast()?.content.action).toBeNull()
})

test("state belongs to the video: duplicates share Added and a recycled renderer shows its new item", async () => {
  const f = await setup()
  const answer = f.deferred<unknown>()
  f.respond(() => answer.promise)
  const first = card()
  const duplicate = card(videoA, "First video")
  f.hover(first.thumbnail, [first.element])
  await click(f)
  recycle(first, videoB, "Second video")
  answer.resolve({ ok: true, data: { confirmed: true, quiet: true }, route: f.route })
  await settle()
  f.hover(first.thumbnail, [first.element])
  expect(label(f)).toBe("Add to queue")
  f.hover(duplicate.thumbnail, [duplicate.element])
  expect(label(f)).toBe("Added to queue")
  expect(f.toast()?.content.text).toBe("Added “First video” to the queue")
})

test("navigation during the awaited add resets the page view without reviving the old state", async () => {
  const f = await setup()
  const answer = f.deferred<unknown>()
  f.respond(() => answer.promise)
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  f.navigate()
  answer.resolve({ ok: true, data: { confirmed: true, quiet: true }, route: f.route })
  await settle()
  f.hover(target.thumbnail, [target.element])
  expect(label(f)).toBe("Add to queue")
})

test("turning the feature off during an awaited add leaves no host, toast or revived state", async () => {
  const f = await setup()
  const answer = f.deferred<unknown>()
  f.respond(() => answer.promise)
  const target = card()
  f.hover(target.thumbnail, [target.element])
  await click(f)
  await f.publish(queueView({ on: false }))
  answer.resolve({ ok: true, data: { confirmed: true, quiet: true }, route: f.route })
  await settle()
  expect(f.hostCount()).toBe(0)
  expect(f.toast()).toBeNull()
})

test("fullscreen conceals the overlay and a hidden tab defers the failure toast", async () => {
  const f = await setup()
  f.respond(async () => ({ ok: false, reason: "failed" }))
  const target = card()
  f.hover(target.thumbnail, [target.element])
  f.fullscreen(document.body)
  expect(f.button()).toBeNull()
  f.fullscreen(null)
  f.hover(target.thumbnail, [target.element])
  f.hidden(true)
  await click(f)
  expect(f.toast()).toBeNull()
  f.hidden(false)
  expect(f.toast()?.content.text).toBe("Couldn't add “First video” to the queue. Try YouTube's ⋮ menu.")
})

test("keyboard-visible thumbnail focus shows the overlay without moving focus", async () => {
  const f = await setup()
  const target = card()
  const visible = f.focus(target.thumbnail)
  try {
    target.thumbnail.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true }))
    expect(f.button()).not.toBeNull()
    expect(document.activeElement).toBe(target.thumbnail)
  } finally { visible.restore() }
})

for (const deadline of [150, 900] as const) {
  test(`YouTube's own hover Add to queue suppresses our slot at the ${deadline} ms recheck`, async () => {
    const f = await setup()
    const target = card()
    f.hover(target.thumbnail, [target.element])
    expect(f.button()).not.toBeNull()
    f.timers.advance(deadline === 150 ? 100 : 500)
    const native = document.createElement("button")
    native.setAttribute("aria-label", "Add to queue")
    target.thumbnail.append(native)
    expect(f.button()).not.toBeNull()
    f.timers.advance(deadline === 150 ? 50 : 400)
    expect(f.button()).toBeNull()
    expect(native.isConnected).toBe(true)
  })
}

test("moving to another card cancels the obsolete rechecks", async () => {
  const f = await setup()
  const first = card()
  const second = card(videoB, "Second video")
  f.hover(first.thumbnail, [first.element])
  f.hover(second.thumbnail, [second.element])
  const native = document.createElement("button")
  native.setAttribute("aria-label", "Add to queue")
  first.thumbnail.append(native)
  f.timers.advance(900)
  expect(f.overlayHost()?.previousElementSibling).toBe(second.thumbnail)
  expect(f.button()).not.toBeNull()
})

test("search's inline preview takes the host while it covers the card", async () => {
  const f = await setup()
  const app = document.createElement("ytd-app")
  const slot = document.createElement("div"); slot.id = "video-preview"
  const preview = document.createElement("ytd-video-preview")
  slot.append(preview); app.append(slot); document.body.append(app)
  const target = card()
  layout(target.thumbnail, { top: 100, left: 100, width: 320, height: 180 })
  layout(preview, { top: 90, left: 90, width: 360, height: 220 })
  f.hover(preview, [target.thumbnail, target.element])
  expect(f.overlayHost()?.parentElement).toBe(preview)
  preview.hidden = true
  await settle()
  f.timers.advance(150)
  expect(f.overlayHost()?.previousElementSibling).toBe(target.thumbnail)
})

test("not working draws nothing and asks for the notice once at the first card hover", async () => {
  const f = await setup({ view: queueView({ state: "not-working" }) })
  const target = card()
  f.hover(target.thumbnail, [target.element])
  f.hover(target.thumbnail, [target.element])
  expect(f.hostCount()).toBe(0)
  expect(f.button()).toBeNull()
  expect(f.notices).toEqual(["queue-button"])
})

for (const family of ["ytm-shorts-lockup-view-model", "ytd-ad-slot-renderer", "ytd-playlist-renderer", "ytd-channel-renderer"]) {
  test(`${family} gets no queue button`, async () => {
    const f = await setup()
    const target = card(videoA, "Unsupported", family)
    f.hover(target.thumbnail, [target.element])
    expect(f.button()).toBeNull()
  })
}

test("the tooltip appears after 0.5 s to the right and the host stops page clicks only on itself", async () => {
  const f = await setup()
  const target = card()
  let pageClicks = 0
  target.element.addEventListener("click", () => { pageClicks++ })
  f.hover(target.thumbnail, [target.element])
  const tip = f.overlayHost()?.shadowRoot?.querySelector(".tip")
  f.button()?.dispatchEvent(new PointerEvent("pointerenter"))
  f.timers.advance(499)
  expect(tip instanceof HTMLElement && tip.hidden).toBe(true)
  f.timers.advance(1)
  expect(tip?.textContent).toBe("Add to queue")
  f.respond(async () => ({ ok: false, reason: "failed" }))
  await click(f)
  target.details.click()
  expect(pageClicks).toBe(1)
})

test("host disposal releases every listener, deadline and host", async () => {
  const f = await setup()
  const target = card()
  f.hover(target.thumbnail, [target.element])
  f.host.dispose()
  expect(f.hostCount()).toBe(0)
  expect(f.scopes.every(scope => scope.disposed && scope.resourceCount === 0)).toBe(true)
  expect(f.timers.count).toBe(0)
})
