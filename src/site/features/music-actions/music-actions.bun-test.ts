import { afterEach, expect, test } from "bun:test"
import type { ItemInfo, NowPlaying } from "../../../shared/contracts"
import type { FeatureStatus } from "../../../shared/contracts/tab-view"
import type { Key } from "../../../shared/model"
import type { SiteView } from "../../core/feature-host"
import type { MusicFamily, MusicItemTarget } from "../../core/items-music"
import { Scope } from "../../core/scope"
import type { QuickAction, QuickAnswer, QuickInput, QuickProgress, QuickTarget } from "../../kit/music/quick"
import { album, ladyQueued, nowPlaying, playingItem, songRow } from "../../../../tools/fixtures/music-quick/specimens"
import { musicActions, settleMs } from "./feature"
import { clock, settle } from "../../../../tools/fixtures/site-toaster/harness"
import { englishI18n } from "../../../../tools/fixtures/localization/scripted"
import { wireView } from "../../../../tools/fixtures/tab-view/cases"

type Buttons = Partial<Record<"next" | "queue" | "save" | "like" | "remove" | "bar" | "library" | "mix" | "album" | "artist", boolean>>
const altN: Key = { code: "KeyN", char: "n", ctrl: false, alt: true, shift: false, meta: false }

function actionsView(change: { buttons?: Buttons; signedIn?: boolean; status?: Partial<FeatureStatus>; keys?: boolean; musicSave?: null } = {}): SiteView<"music"> {
  const base = wireView("music", change.signedIn ?? true)
  if (base.site !== "music") throw Error("Expected a music view")
  const features = base.features.flatMap((feature): unknown[] => {
    if (feature.id === "music-actions") return [{ ...feature, options: { ...feature.options, buttons: { ...feature.options.buttons, ...change.buttons } } }]
    if (feature.id === "music-keys") return change.keys === false ? [] : [{ ...feature, options: { ...feature.options, keys: { ...feature.options.keys, next: altN } } }]
    return [feature]
  })
  const statuses = base.statuses.map(status => status.feature === "music-actions" ? { ...status, ...change.status } : status)
  const setup = change.musicSave === null && base.signedIn && base.setup.kind === "live" ? { kind: "live", setup: { ...base.setup.setup, musicSave: null } } : base.setup
  return { ...base, features, statuses, ...(base.signedIn ? { setup } : {}) } as SiteView<"music">
}

const running: (() => void)[] = []
afterEach(() => { for (const stop of running.splice(0)) stop() })

function row(tag: string, item: ItemInfo) {
  const element = document.createElement(tag)
  const title = document.createElement("div"); title.className = "title"; title.textContent = item.title
  const menu = document.createElement("ytmusic-menu-renderer")
  element.append(title, menu)
  if (tag === "ytmusic-two-row-item-renderer") element.prepend(document.createElement("ytmusic-item-thumbnail-overlay-renderer"))
  document.body.append(element)
  return element
}

function setup(options: { view?: SiteView<"music">; casting?: boolean; answer?: (action: QuickAction) => Promise<QuickAnswer> } = {}) {
  const timers = clock()
  const onError = () => {}
  const scope = new Scope({ document, onError })
  const info = new Map<Element, ItemInfo>()
  const acts: [QuickAction, QuickTarget, QuickInput][] = [], pickers: [QuickTarget, string][] = [], notices: string[] = []
  const watchers = new Set<(progress: QuickProgress) => void>()
  let pointed: { kind: "pointed-item"; target: MusicItemTarget } | { kind: "no-pointed-item"; reason: "ordinary" | "player" } = { kind: "no-pointed-item", reason: "ordinary" }
  let song: ((data: NowPlaying | null) => void) | null = null
  let current = options.view ?? actionsView()
  const listeners = new Set<(view: SiteView<"music">) => void>()
  let preloads = 0
  void musicActions.start({
    site: "music", scope, document, i18n: englishI18n(), os: "windows",
    view: { read: () => current, subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } } },
    items: { track: () => () => {}, readPointed: () => pointed },
    page: {
      run: async (_invocation, context) => {
        const item = context?.target ? info.get(context.target) : undefined
        return (item ? { ok: true, data: item, route: "test" } : { ok: false, reason: "unavailable" }) as never
      },
      watch: (stream, onData) => { if (stream === "nowPlaying") song = data => onData(data as never, () => {}); return () => { if (stream === "nowPlaying") song = null } }
    },
    quick: {
      act: async (action, target, input) => { acts.push([action, target, input]); return options.answer ? options.answer(action) : { kind: "done", text: null } },
      casting: async () => options.casting ?? false,
      playing: async () => ({ kind: "target", target: { title: nowPlaying.title, videoId: nowPlaying.videoId, item: playingItem, element: null, move: false } }),
      openPicker: async (target, _input, mode) => { pickers.push([target, mode]); return { kind: "idle", text: null } },
      watch: watcher => { watchers.add(watcher); return () => { watchers.delete(watcher) } }
    },
    actions: { playlists: async () => ({ kind: "cached", listing: { rows: [{ id: "PL_alpha" as never, title: "Favourites" }], at: 0 } }) },
    notices: { wouldAct: feature => { notices.push(feature) } },
    preload: () => { preloads++ }
  })
  running.push(() => { scope.dispose(); timers.restore(); document.body.replaceChildren() })
  return {
    acts, pickers, notices, timers, scope, get preloads() { return preloads },
    async hover(element: Element, item: ItemInfo, family: MusicFamily) {
      info.set(element, item)
      pointed = { kind: "pointed-item", target: { element, family, identity: { kind: "queue" }, signature: `${family}:${item.title}` } as unknown as MusicItemTarget }
      element.dispatchEvent(new Event("pointerover", { bubbles: true }))
      await settle()
    },
    leave() { pointed = { kind: "no-pointed-item", reason: "ordinary" }; document.body.dispatchEvent(new Event("pointerover", { bubbles: true })) },
    info,
    song: (data: NowPlaying | null) => song?.(data),
    progress: (progress: QuickProgress) => { for (const watcher of watchers) watcher(progress) },
    publish(view: SiteView<"music">) { current = view; for (const listener of [...listeners]) listener(view) }
  }
}
function buttons(scope: ParentNode = document) {
  const host = scope.querySelector("pp-music-actions")
  return [...host?.shadowRoot?.querySelectorAll("button") ?? []].map(button => ({
    label: button.getAttribute("aria-label"), disabled: button.getAttribute("aria-disabled") === "true", pressed: button.getAttribute("aria-pressed"),
    icon: button.firstElementChild?.getAttribute("data-icon") ?? null
  }))
}
function button(label: string, scope: ParentNode = document): HTMLButtonElement {
  const found = [...scope.querySelector("pp-music-actions")?.shadowRoot?.querySelectorAll("button") ?? []].find(entry => entry.getAttribute("aria-label") === label)
  if (!found) throw Error(`No button ${label}`)
  return found
}

test("a hovered song row gets its buttons in its own row, before YouTube Music's like and menu, and nothing at rest", async () => {
  const f = setup()
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  expect(document.querySelector("pp-music-actions")).toBeNull()
  await f.hover(element, songRow, "responsive-row")
  const host = element.querySelector("pp-music-actions")
  expect(host?.nextElementSibling?.localName).toBe("ytmusic-menu-renderer")
  expect(buttons(element).map(entry => entry.label)).toEqual(["Play next: Get Lucky", "Add to queue: Get Lucky"])
  f.leave()
  f.timers.advance(119)
  expect(element.querySelector("pp-music-actions")).not.toBeNull()
  f.timers.advance(1)
  expect(element.querySelector("pp-music-actions")).toBeNull()
})

test("a click runs the action on that item, shows busy, then a check for 1.5 s, and a failure shows its error the same way", async () => {
  let finish = (_: QuickAnswer) => {}
  const f = setup({ answer: () => new Promise(resolve => { finish = resolve }) })
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  button("Play next: Get Lucky").click()
  await settle()
  expect(f.acts.map(([action, target, input]): unknown[] => [action, target.videoId, target.move, input.by, input.opener])).toEqual([["next", songRow.videoId, false, "click", "music-actions"]])
  expect(buttons(element)[0]?.icon).toBe("spinner")
  button("Play next: Get Lucky").click()
  expect(f.acts.length).toBe(1)
  finish({ kind: "done", text: null })
  await settle()
  expect(buttons(element)[0]?.icon).toBe("check")
  f.timers.advance(settleMs)
  expect(buttons(element)[0]?.icon).toBe("queue_play_next")
  button("Add to queue: Get Lucky").click()
  await settle()
  finish({ kind: "failed", text: "Couldn't add" })
  await settle()
  expect(buttons(element)[1]?.icon).toBe("error")
})

test("on a waiting queue item Play next and Add to queue move it and show no check; the playing item gets neither", async () => {
  const f = setup()
  const queued = row("ytmusic-player-queue-item", ladyQueued)
  await f.hover(queued, ladyQueued, "queue-item")
  button("Play next: Lady").click()
  await settle()
  expect(f.acts[0]?.[1].move).toBe(true)
  expect(buttons(queued)[0]?.icon).toBe("queue_play_next")
  const playing = row("ytmusic-player-queue-item", playingItem)
  f.publish(actionsView({ buttons: { remove: true } }))
  await f.hover(playing, playingItem, "queue-item")
  expect(buttons(playing).map(entry => entry.label)).toEqual(["Remove from queue: Get Lucky"])
})

test("Save is a split with the playlist's name, or one Save to playlist… button in choose mode that opens choose mode", async () => {
  const f = setup({ view: actionsView({ buttons: { save: true } }) })
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  await settle()
  expect(buttons(element).map(entry => entry.label)).toEqual(["Play next: Get Lucky", "Add to queue: Get Lucky", "Save to Favourites: Get Lucky", "Save to playlist…: Get Lucky"])
  expect(element.querySelector("pp-music-actions")?.shadowRoot?.querySelector(".split")?.children.length).toBe(2)
  button("Save to playlist…: Get Lucky").dispatchEvent(new Event("pointerenter"))
  expect(f.preloads).toBe(1)
  button("Save to playlist…: Get Lucky").click()
  await settle()
  expect(f.acts.map(([action, , input]) => [action, input.button?.className])).toEqual([["picker", "split"]])
  f.publish(actionsView({ buttons: { save: true }, musicSave: null }))
  await settle()
  const choose = buttons(element).at(-1)
  expect(choose?.label).toBe("Save to playlist…: Get Lucky")
  button("Save to playlist…: Get Lucky").click()
  await settle()
  expect(f.pickers.map(([target, mode]) => [target.title, mode])).toEqual([["Get Lucky", "choose"]])
})

test("signed out, Save, Like and Save to library aren't drawn; queue buttons still are", async () => {
  const f = setup({ view: actionsView({ signedIn: false, buttons: { save: true, like: true, library: true } }) })
  const card = row("ytmusic-two-row-item-renderer", { ...songRow, hasOwnLike: false })
  await f.hover(card, { ...songRow, hasOwnLike: false }, "two-row-card")
  expect(buttons(card).map(entry => entry.label)).toEqual(["Play next: Get Lucky", "Add to queue: Get Lucky"])
})

test("Like shows on song cards with YouTube Music's own state, never on rows, which have their own like", async () => {
  const f = setup({ view: actionsView({ buttons: { like: true } }) })
  const liked = { ...songRow, hasOwnLike: false, likeState: "liked" as const }
  const card = row("ytmusic-two-row-item-renderer", liked)
  await f.hover(card, liked, "two-row-card")
  expect(card.querySelector("ytmusic-item-thumbnail-overlay-renderer pp-music-actions")?.getAttribute("data-kind")).toBe("card")
  expect(buttons(card).at(-1)).toMatchObject({ label: "Like: Get Lucky", pressed: "true", icon: "thumb_up_filled" })
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  expect(buttons(element).map(entry => entry.label)).not.toContain("Like: Get Lucky")
})

test("albums get Play next and Add to queue as a block, with no Save or Like", async () => {
  const f = setup({ view: actionsView({ buttons: { save: true, like: true } }) })
  const card = row("ytmusic-two-row-item-renderer", album)
  await f.hover(card, album, "two-row-card")
  expect(buttons(card).map(entry => entry.label)).toEqual(["Play next: Random Access Memories", "Add to queue: Random Access Memories"])
})

test("while casting the queue buttons are dimmed and say why", async () => {
  const f = setup({ casting: true, view: actionsView({ buttons: { mix: true, album: true } }) })
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  expect(buttons(element).map(entry => [entry.label, entry.disabled])).toEqual([
    ["Play next: Get Lucky", true], ["Add to queue: Get Lucky", true], ["Start mix: Get Lucky", true], ["Go to album: Get Lucky", false]])
})

test("the tooltip names the action and its key only while Quick-action shortcuts is on", async () => {
  const f = setup()
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  button("Play next: Get Lucky").dispatchEvent(new Event("pointerenter"))
  f.timers.advance(500)
  expect(document.querySelector("pp-music-tip")?.shadowRoot?.textContent).toContain("Play next (Alt+N)")
  f.publish(actionsView({ keys: false }))
  await settle()
  button("Play next: Get Lucky").dispatchEvent(new Event("pointerenter"))
  f.timers.advance(500)
  expect(document.querySelector("pp-music-tip")?.shadowRoot?.textContent).toContain("Play next")
  expect(document.querySelector("pp-music-tip")?.shadowRoot?.textContent).not.toContain("Alt+N")
})

test("an action unavailable here draws no button, and a feature that isn't working draws nothing and raises its notice once", async () => {
  const f = setup({ view: actionsView({ status: { state: "partly-working", actions: ["next"] } }) })
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  expect(buttons(element).map(entry => entry.label)).toEqual(["Add to queue: Get Lucky"])
  const broken = setup({ view: actionsView({ status: { state: "not-working" } }) })
  const other = row("ytmusic-responsive-list-item-renderer", songRow)
  await broken.hover(other, songRow, "responsive-row")
  await broken.hover(other, { ...songRow, title: "Again" }, "responsive-row")
  expect(other.querySelector("pp-music-actions")).toBeNull()
  expect(broken.notices).toEqual(["music-actions"])
})

test("an album header gets Play next and Add to queue among its own buttons, always visible", async () => {
  const header = document.createElement("ytmusic-responsive-header-renderer")
  const box = document.createElement("div"); box.id = "action-buttons"
  const menu = document.createElement("ytmusic-menu-renderer")
  box.append(document.createElement("button"), menu)
  header.append(box)
  document.body.append(header)
  const f = setup()
  f.info.set(header, album)
  f.timers.advance(500)
  await settle()
  expect(menu.previousElementSibling?.localName).toBe("pp-music-actions")
  expect(buttons(box).map(entry => entry.label)).toEqual(["Play next: Random Access Memories", "Add to queue: Random Access Memories"])
  button("Add to queue: Random Access Memories", box).click()
  await settle()
  expect(f.acts.map(([action, target]) => [action, target.item?.kind, target.element === header])).toEqual([["queue", "album", true]])
})

test("Save on the player bar sits before YouTube Music's like, follows the playing song, and saves it", async () => {
  const playerBar = document.createElement("ytmusic-player-bar")
  const like = document.createElement("div"); like.id = "like-button-renderer"
  playerBar.append(like)
  document.body.append(playerBar)
  const f = setup({ view: actionsView({ buttons: { bar: true } }) })
  f.timers.advance(0)
  await settle()
  expect(like.previousElementSibling?.getAttribute("data-kind")).toBe("bar")
  f.song(nowPlaying)
  await settle()
  expect(buttons(playerBar).map(entry => entry.label)).toEqual(["Save to Favourites: Get Lucky", "Save to playlist…: Get Lucky"])
  button("Save to Favourites: Get Lucky", playerBar).click()
  await settle()
  expect(f.acts.map(([action, target]) => [action, target.videoId, target.item?.selected])).toEqual([["save", nowPlaying.videoId, true]])
  f.publish(actionsView({ buttons: { bar: false } }))
  await settle()
  expect(playerBar.querySelector("pp-music-actions")).toBeNull()
})

test("a key acting on the hovered item takes its button through the same states", async () => {
  const f = setup()
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  f.progress({ element, action: "queue", state: "busy" })
  expect(buttons(element)[1]?.icon).toBe("spinner")
  f.progress({ element, action: "queue", state: "done" })
  expect(buttons(element)[1]?.icon).toBe("check")
})

test("switching the feature off removes every host", async () => {
  const f = setup()
  const element = row("ytmusic-responsive-list-item-renderer", songRow)
  await f.hover(element, songRow, "responsive-row")
  f.scope.dispose()
  expect(document.querySelector("pp-music-actions")).toBeNull()
})
