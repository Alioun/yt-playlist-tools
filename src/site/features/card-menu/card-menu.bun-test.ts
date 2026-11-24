import { afterEach, expect, spyOn, test } from "bun:test"
import { readFile } from "node:fs/promises"
import type { DueNotice } from "../../../shared/contracts/tab-view"
import { createNoticeOwner, type NoticePresentation } from "../../core/notice"
import { Scope } from "../../core/scope"
import { deferred } from "../../../../tools/fixtures/page-link/support"
import { cardBox, cardMenuHarness, layOut, menuButtonBox, rightClickPoint, videoA, videoB, view } from "../../../../tools/fixtures/site-card-menu/harness"
import { reachableModules } from "../../../../tools/fixtures/site-card-menu/source-graph"

const cleanup: (() => void)[] = []
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose() })
async function fixture(options: Parameters<typeof cardMenuHarness>[0] = {}) {
  const f = await cardMenuHarness(options)
  cleanup.push(() => f.dispose())
  return f
}

test("construction and definition are inert until the feature is enabled", async () => {
  const f = await fixture({ initial: view({ on: false }) })
  const listen = spyOn(document, "addEventListener")
  try {
    f.start()
    expect(f.scopes).toHaveLength(0)
    expect(listen).not.toHaveBeenCalled()
    f.click(f.byId("empty"))
    expect(f.seen).toEqual([{ prevented: false }])
  } finally { listen.mockRestore() }
})

test("enabling installs one capture contextmenu listener and disabling removes it", async () => {
  const f = await fixture()
  const listen = spyOn(document, "addEventListener")
  const unlisten = spyOn(document, "removeEventListener")
  try {
    f.start()
    const added = listen.mock.calls.filter(call => call[0] === "contextmenu")
    expect(added).toHaveLength(1)
    expect(added[0]?.[2]).toMatchObject({ capture: true })
    f.source.publish(view({ on: false }))
    expect(unlisten.mock.calls.filter(call => call[0] === "contextmenu" && call[2] === true)).toHaveLength(1)
    expect(f.scopes[0]?.disposed).toBe(true)
    expect(f.scopes[0]?.resourceCount).toBe(0)
    expect(f.click(f.byId("empty")).defaultPrevented).toBe(false)
  } finally { listen.mockRestore(); unlisten.mockRestore() }
})

for (const [part, id] of [["thumbnail", "thumb-img"], ["title", "video-title"], ["empty card area", "empty"]] as const) {
  test(`right-click on the ${part} cancels synchronously and opens that renderer's own menu`, async () => {
    const f = await fixture()
    f.start()
    const event = f.click(f.byId(id))
    expect(event.defaultPrevented).toBe(true)
    expect(f.seen).toEqual([{ prevented: true }])
    await f.settle()
    expect(f.menuCalls()).toHaveLength(1)
    expect(f.menuCalls()[0]?.job).toEqual({ kind: "openCardMenu", videoId: videoA, at: rightClickPoint })
    expect(f.menuCalls()[0]?.context?.target).toBe(f.byId("card-a"))
    expect(f.page.messages("run")).toHaveLength(1)
    expect(JSON.stringify(f.page.messages("run")[0])).not.toContain("acct")
  })
}

test("the title's nested text node is read through the real composed path", async () => {
  const f = await fixture()
  f.start()
  const text = f.byId("video-title").firstChild
  if (!text) throw Error("Missing title text")
  expect(f.click(text).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls()[0]?.context?.target).toBe(f.byId("card-a"))
})

test("modern thumbnail menus need no aria-haspopup attribute", async () => {
  const f = await fixture()
  const card = document.createElement("yt-lockup-view-model")
  card.innerHTML = `<a class="ytLockupViewModelContentImage" href="/watch?v=${videoA}"><img id="modern-thumbnail"></a>
    <yt-lockup-metadata-view-model><div class="ytLockupMetadataViewModelMenuButton">
      <button-view-model><button aria-label="Mehr Aktionen" aria-disabled="false"></button></button-view-model>
    </div></yt-lockup-metadata-view-model>`
  document.body.append(card)
  f.start()
  expect(f.click(f.byId("modern-thumbnail")).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls()[0]?.context?.target).toBe(card)
})

test("a right-click on a part that sticks out of the card's box still opens at the pointer", async () => {
  const f = await fixture()
  f.start()
  const at = { x: cardBox.x + cardBox.width + 8, y: cardBox.y - 6 }
  layOut("#empty", { x: at.x - 10, y: at.y - 10, width: 20, height: 20 })
  expect(f.click(f.byId("empty"), { at }).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls().map(call => call.job)).toEqual([{ kind: "openCardMenu", videoId: videoA, at }])
})

test("a right-click on the top pixel row of a card whose box starts a fraction of a pixel lower still opens at the pointer", async () => {
  const f = await fixture()
  f.start()
  layOut("#card-a", { ...cardBox, y: cardBox.y + 0.27 })
  const at = { x: cardBox.x + 40, y: cardBox.y }
  f.under([f.byId("thumb-img"), f.byId("thumbnail"), f.byId("card-a"), document.body])
  expect(f.click(f.byId("thumb-img"), { at }).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls().map(call => call.job)).toEqual([{ kind: "openCardMenu", videoId: videoA, at }])
})

test("a menu opened from the keyboard opens at the card's own menu button unless the browser reports a point on the card", async () => {
  const f = await fixture()
  f.start()
  expect(f.click(f.byId("video-title"), { button: 0, at: { x: 0, y: 0 } }).defaultPrevented).toBe(true)
  expect(f.click(f.byId("video-title"), { button: -1, at: { x: 400, y: 250 } }).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls().map(call => call.job)).toEqual([
    { kind: "openCardMenu", videoId: videoA, at: { x: menuButtonBox.x + menuButtonBox.width / 2, y: menuButtonBox.y + menuButtonBox.height / 2 } },
    { kind: "openCardMenu", videoId: videoA, at: { x: 400, y: 250 } }
  ])
  expect(f.menuCalls().every(call => call.context?.target === f.byId("card-a"))).toBe(true)
})

function hoverPreview(shown = videoA) {
  const slot = document.createElement("div")
  slot.id = "video-preview"
  slot.innerHTML = `<ytd-video-preview><a href="/watch?v=${shown}"><div id="inline-preview-player"><video id="preview-video"></video></div></a></ytd-video-preview>`
  document.body.append(slot)
  const video = slot.querySelector("video"), preview = slot.querySelector("ytd-video-preview")
  if (!video || !preview) throw Error("Missing preview fixture")
  return { video, preview }
}

test("a right-click on YouTube's hover preview opens the menu of the card it covers", async () => {
  const f = await fixture()
  f.start()
  const { video, preview } = hoverPreview()
  f.under([video, preview, f.byId("thumb-img"), f.byId("thumbnail"), f.byId("card-a"), document.body])
  expect(f.click(video).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls().map(call => [call.job, call.context?.target])).toEqual([[{ kind: "openCardMenu", videoId: videoA, at: rightClickPoint }, f.byId("card-a")]])
})

test("a right-click on a button Perchling draws over the hover preview opens the menu of the card it covers", async () => {
  const f = await fixture()
  f.start()
  const { video, preview } = hoverPreview()
  const overlay = document.createElement("pp-overlay")
  preview.append(overlay)
  const button = overlay.attachShadow({ mode: "open" }).appendChild(document.createElement("button"))
  f.under([overlay, video, preview, f.byId("thumb-img"), f.byId("thumbnail"), f.byId("card-a"), document.body])
  expect(f.click(button).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls().map(call => [call.job, call.context?.target])).toEqual([[{ kind: "openCardMenu", videoId: videoA, at: rightClickPoint }, f.byId("card-a")]])
})

test("the hover preview keeps the browser menu where the card under it would", async () => {
  const f = await fixture()
  f.start()
  const { video, preview } = hoverPreview()
  f.under([video, preview, document.body])
  expect(f.click(video).defaultPrevented).toBe(false)
  f.under([video, preview, f.byId("channel-link"), f.byId("channel-name"), f.byId("card-a"), document.body])
  expect(f.click(video).defaultPrevented).toBe(false)
  f.source.publish(view({ keepLinkMenu: true }))
  f.under([video, preview, f.byId("thumb-img"), f.byId("thumbnail"), f.byId("card-a"), document.body])
  expect(f.click(video).defaultPrevented).toBe(false)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(0)
})

test("a link to another page inside the hover preview keeps the browser menu", async () => {
  const f = await fixture()
  f.start()
  const { video, preview } = hoverPreview()
  // The playing preview on search shows an "Includes paid promotion" link to Google's help pages.
  const promotion = preview.appendChild(document.createElement("a"))
  promotion.href = "https://support.google.com/youtube?p=ppp"
  const label = promotion.appendChild(document.createElement("span"))
  f.under([label, promotion, preview, f.byId("thumb-img"), f.byId("thumbnail"), f.byId("card-a"), document.body])
  expect(f.click(label).defaultPrevented).toBe(false)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(0)
  f.under([video, preview, f.byId("thumb-img"), f.byId("thumbnail"), f.byId("card-a"), document.body])
  expect(f.click(video).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(1)
})

test("a hover preview whose own link names another video than the card under it keeps the browser menu", async () => {
  const f = await fixture()
  f.start()
  const { video, preview } = hoverPreview(videoB)
  f.under([video, preview, f.byId("thumb-img"), f.byId("thumbnail"), f.byId("card-a"), document.body])
  expect(f.click(video).defaultPrevented).toBe(false)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(0)
})

const preserved = [
  ["channel name", "channel-link"], ["channel avatar link", "avatar-img"], ["bare avatar", "bare-avatar-img"],
  ["hashtag", "hashtag"], ["ad", "ad-text"], ["playlist card", "playlist-text"],
  ["mix card", "mix-text"], ["unrecognised item", "two-videos"], ["card without its own menu button", "no-menu-text"],
  ["card whose menu button is hidden", "hidden-menu-thumb"], ["card whose first menu button belongs to another card", "outer-text"],
  ["ordinary page", "outside"]
] as const
for (const [name, id] of preserved) {
  test(`the browser menu is preserved on the ${name}`, async () => {
    const f = await fixture()
    f.start()
    expect(f.click(f.byId(id)).defaultPrevented).toBe(false)
    await f.settle()
    expect(f.menuCalls()).toHaveLength(0)
  })
}

test("Shift+right-click always keeps the browser menu", async () => {
  const f = await fixture()
  f.start()
  expect(f.click(f.byId("empty"), { shiftKey: true }).defaultPrevented).toBe(false)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(0)
})

test("keepLinkMenu preserves the video's own links and reaches the running listener without a restart", async () => {
  const f = await fixture()
  f.start()
  expect(f.click(f.byId("thumb-img")).defaultPrevented).toBe(true)
  f.source.publish(view({ keepLinkMenu: true }))
  expect(f.click(f.byId("thumb-img")).defaultPrevented).toBe(false)
  expect(f.click(f.byId("video-title")).defaultPrevented).toBe(false)
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(true)
  f.source.publish(view({ keepLinkMenu: false }))
  expect(f.click(f.byId("video-title")).defaultPrevented).toBe(true)
  expect(f.scopes).toHaveLength(1)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(3)
})

test("an open shadow boundary keeps a nested link's browser menu and admits a nested card part", async () => {
  const f = await fixture()
  f.start()
  const shadow = f.byId("shadow-host").attachShadow({ mode: "open" })
  shadow.innerHTML = `<a href="/@elsewhere"><b id="inside-link">Elsewhere</b></a><i id="inside-plain">Plain</i>`
  const link = shadow.querySelector("#inside-link"), plain = shadow.querySelector("#inside-plain")
  if (!link || !plain) throw Error("Missing shadow fixture")
  expect(f.click(link).defaultPrevented).toBe(false)
  expect(f.click(plain).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(1)
})

test("an event another listener already cancelled is left alone", async () => {
  const f = await fixture()
  const early = new Scope({ document, onError: () => {} })
  cleanup.push(() => early.dispose())
  early.on(window, "contextmenu", event => { event.preventDefault() }, { capture: true })
  f.start()
  f.click(f.byId("empty"))
  await f.settle()
  expect(f.menuCalls()).toHaveLength(0)
})

test("signed out and with absent account setup the card menu still opens", async () => {
  for (const options of [{ signedIn: false, initial: view({ signedIn: false }) }, { initial: view({ setup: "none" }) }]) {
    const f = await fixture(options)
    f.start()
    expect(f.click(f.byId("empty")).defaultPrevented).toBe(true)
    await f.settle()
    expect(f.menuCalls()).toHaveLength(1)
    expect(f.page.calls.map(call => call.job.kind)).toEqual(["openCardMenu"])
    f.dispose()
  }
})

test("a detached renderer and a page link that is not ready fail closed", async () => {
  const gate = deferred<void>()
  const f = await fixture({ gate: gate.promise })
  f.start()
  expect(f.page.link.state.kind).toBe("connecting")
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(false)
  gate.resolve()
  expect(await f.page.link.hello).toMatchObject({ ok: true })
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(true)
  const card = f.byId("card-a")
  const part = f.byId("empty")
  card.remove()
  expect(f.click(part).defaultPrevented).toBe(false)
  await f.settle()
  expect(f.menuCalls().map(call => call.context?.target)).toEqual([card])
})

const failures = [["refuses", { ok: false, reason: "unavailable" }], ["cannot confirm", { ok: false, reason: "unconfirmed" }],
  ["throws", undefined]] as const
for (const [outcome, result] of failures) {
  test(`when the page-side click ${outcome} after the browser menu was cancelled, the card menu does nothing more`, async () => {
    const answer = deferred<unknown>()
    const f = await fixture({ run: job => job.kind === "openCardMenu" ? answer.promise : Promise.resolve({ ok: false, reason: "unavailable" }) })
    f.start()
    const page = document.body.innerHTML
    expect(f.click(f.byId("empty")).defaultPrevented).toBe(true)
    if (result) answer.resolve(result)
    else answer.reject(Error("synthetic page failure"))
    await f.settle()
    await f.settle()
    expect(f.seen).toEqual([{ prevented: true }])
    expect(f.menuCalls()).toHaveLength(1)
    expect(f.requests).toEqual([])
    expect(f.errors).toEqual([])
    expect(document.body.innerHTML).toBe(page)
  })
}

test("a card recycled before the page-side click asks the page for the video that was right-clicked", async () => {
  const answer = deferred<unknown>()
  const f = await fixture({ run: job => job.kind === "openCardMenu" ? answer.promise : Promise.resolve({ ok: false, reason: "unavailable" }) })
  f.start()
  expect(f.click(f.byId("thumb-img")).defaultPrevented).toBe(true)
  for (const link of f.byId("card-a").querySelectorAll(`a[href="/watch?v=${videoA}"]`)) link.setAttribute("href", `/watch?v=${videoB}`)
  answer.resolve({ ok: false, reason: "unavailable" })
  await f.settle()
  expect(f.menuCalls().map(call => [call.job, call.context?.target])).toEqual([[{ kind: "openCardMenu", videoId: videoA, at: rightClickPoint }, f.byId("card-a")]])
  expect(f.click(f.byId("thumb-img")).defaultPrevented).toBe(true)
  await f.settle()
  expect(f.menuCalls().map(call => call.job)).toEqual([{ kind: "openCardMenu", videoId: videoA, at: rightClickPoint }, { kind: "openCardMenu", videoId: videoB, at: rightClickPoint }])
  expect(f.requests).toEqual([])
})

test("revocation during a pending job leaves no listener and no later page work", async () => {
  const answer = deferred<unknown>()
  const f = await fixture({ run: () => answer.promise })
  f.start()
  f.click(f.byId("empty"))
  f.source.publish(null)
  answer.resolve({ ok: true, data: null, route: "fixture-route" })
  await f.settle()
  expect(f.scopes[0]?.resourceCount).toBe(0)
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(false)
  await f.settle()
  expect(f.menuCalls()).toHaveLength(1)
})

test("off, on and host disposal each own a fresh scope", async () => {
  const f = await fixture()
  f.start()
  f.source.publish(view({ on: false }))
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(false)
  f.source.publish(view())
  expect(f.scopes).toHaveLength(2)
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(true)
  f.host.dispose()
  expect(f.scopes[1]?.resourceCount).toBe(0)
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(false)
})

test("a not-working card menu keeps the browser menu and requests the core notice once", async () => {
  const f = await fixture({ initial: view({ broken: true }) })
  f.start()
  expect(f.click(f.byId("empty")).defaultPrevented).toBe(false)
  expect(f.click(f.byId("thumb-img")).defaultPrevented).toBe(false)
  await f.settle()
  expect(f.requests).toEqual([{ kind: "not-working", features: ["card-menu"] }])
  expect(f.menuCalls()).toHaveLength(0)
  f.source.publish(view())
  f.source.publish(view({ broken: true }))
  f.click(f.byId("empty"))
  expect(f.requests).toHaveLength(2)
})

test("the notice request reaches the actual NoticeOwner with existing localized copy", async () => {
  const messages: Record<string, { message: string }> = JSON.parse(await readFile("src/public/_locales/en/messages.json", "utf8"))
  const text = messages.notice_www_one?.message.replace("$FEATURES$", messages.notice_feature_card_menu?.message ?? "") ?? ""
  const owned = new Scope({ document, onError: () => {} })
  cleanup.push(() => owned.dispose())
  const shown: NoticePresentation[] = []
  const owner = createNoticeOwner({ scope: owned, onError: () => {}, initial: { present: notice => { shown.push(notice); return () => {} } } })
  const callbacks: string[] = []
  const request = (due: DueNotice) => owner.update({ due, generation: {}, text, detailsLabel: messages.toast_details?.message ?? "",
    dismissLabel: messages.toast_dismiss?.message ?? "", details: () => { callbacks.push("details") },
    dismiss: () => { callbacks.push("dismiss") }, presented: () => { callbacks.push("presented") } })
  const f = await fixture({ initial: view({ broken: true }), notice: { request } })
  f.start()
  f.click(f.byId("empty"))
  expect(shown.map(notice => notice.text)).toEqual(["Right-click for the video menu isn't working right now because YouTube changed something. Use YouTube's own buttons for now."])
  shown[0]?.presented()
  expect(callbacks).toEqual(["presented"])
})

test("importing the feature reaches no UI kit, toaster, Svelte runtime, picker, notice presenter or copy of the core's Items", async () => {
  expect(await reachableModules("src/site/features/card-menu/card-menu.ts")).toEqual({
    files: ["src/shared/youtube/card-menu-buttons.ts", "src/site/features/card-menu/card-menu.ts"],
    packages: []
  })
})
