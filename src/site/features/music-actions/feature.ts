import type { ItemInfo, Job, JobInvocation, JobOf, JobResult, Stream, StreamData } from "../../../shared/contracts"
import type { I18n } from "../../../shared/i18n"
import { display } from "../../../shared/keys/policy"
import type { Key, PlaylistId } from "../../../shared/model"
import type { TabActions } from "../../core/actions"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { MusicItems, MusicItemTarget } from "../../core/items-music"
import type { Dispose } from "../../core/scope"
import type { SiteHealth } from "../../core/health"
import { quickActions, statusOf, withdrawn, type QuickAction } from "../../music/actions"
import type { MusicQuick, QuickAnswer, QuickTarget } from "../../kit/music/quick"
import { createHost, tooltip, type Drawn, type Host, type HostKind } from "./host"
import type { IconName } from "./icons"
import { offeredButtons, type ButtonAction } from "./offer"

export type MusicActionServices = {
  readonly document: Document
  readonly items: Pick<MusicItems, "track" | "readPointed">
  readonly page: {
    run<J extends Job>(invocation: JobInvocation<J>, context?: { target?: Element }): Promise<JobResult<J>>
    watch<S extends Stream>(stream: S, onData: (data: StreamData<S>, stop: () => void) => void): () => void
  }
  readonly quick: Pick<MusicQuick, "act" | "casting" | "playing" | "openPicker" | "watch">
  readonly actions: Pick<TabActions, "playlists">
  readonly i18n: I18n
  readonly notices: { wouldAct(feature: "music-actions"): void }
  /** Hover intent on a Save preloads `popovers.js` (YM-SAVE-16). */
  readonly preload: () => void
  /** Hears a player bar that shows a song but drew no like where the Save should sit (YM-FAIL-8). */
  readonly health?: Pick<SiteHealth, "playerBarMissing">
  readonly os: "macos" | "windows" | "linux"
}
type State = "idle" | "busy" | "done" | "failed"
/** What a host shows: one item, the buttons it gets, and whether the queue buttons are dimmed for casting. */
type Shown = { readonly element: Element; readonly family: MusicItemTarget["family"] | "bar"; readonly signature: string; item: ItemInfo; actions: readonly ButtonAction[]; casting: boolean }

export const settleMs = 1_500
const leaveMs = 120
const narrowTitle = 48
const icons: Readonly<Record<ButtonAction, IconName>> = {
  next: "queue_play_next", queue: "add_to_queue", save: "playlist_add", like: "thumb_up", remove: "remove_circle",
  library: "library_add", mix: "mix", album: "album", artist: "artist"
}
// After a nav the page draws its header and player bar a moment later; these bounded looks find them (ADR-0012).
const settleChecks = [0, 500, 1_500, 3_500]
const titles = ".title, yt-formatted-string.title, #song-title, .song-title"

function settingsOf(view: SiteView<"music"> | null) {
  const feature = view?.features.find(entry => entry.id === "music-actions")
  return feature?.id === "music-actions" ? feature.options : undefined
}
function keyOf(view: SiteView<"music"> | null, action: QuickAction): Key | null {
  const feature = view?.features.find(entry => entry.id === "music-keys")
  return feature?.id === "music-keys" ? feature.options.keys[action] as Key | null : null
}
function menuOf(element: Element): Element | null {
  return [...element.children].find(child => child.localName === "ytmusic-menu-renderer") ?? null
}

/**
 * Quick actions (03 §3, §4, §16): buttons on song rows, cards and queue items through one moving host, on album
 * and playlist headers, and the opt-in Save on the player bar. Each button's state follows the item, not the
 * element, because YouTube Music re-renders other songs into the same element (YM-QA-15).
 */
function start(context: FeatureContext<"music", MusicActionServices>): void {
  const { scope, view, document, items, page, quick, i18n, notices } = context
  items.track(scope)
  const tip = tooltip(document, scope)
  const states = new Map<string, Partial<Record<ButtonAction, State>>>()
  const serials = new WeakMap<Element, number>()
  let serial = 0, showing = 0, noticed = false
  let names: ReadonlyMap<PlaylistId, string> | null = null
  let hideTimer: Dispose = () => {}

  function stateKey(item: ItemInfo | null, element: Element, family: Shown["family"]): string {
    if (family === "bar") return `bar:${item?.videoId ?? ""}`
    if (item?.queueItemId !== undefined) return `queue:${String(item.queueItemId)}`
    let id = serials.get(element)
    if (id === undefined) { id = ++serial; serials.set(element, id) }
    return `item:${id}:${item?.title ?? ""}`
  }
  function stateOf(shown: Shown, action: ButtonAction): State {
    return states.get(stateKey(shown.item, shown.element, shown.family))?.[action] ?? "idle"
  }
  function setState(key: string, action: ButtonAction, state: State) {
    const entry = { ...states.get(key), [action]: state }
    if (state === "idle") delete entry[action]
    states.set(key, entry)
    redraw()
  }
  function quickSave(): PlaylistId | null {
    const current = view.read()
    const setup = current?.setup?.kind === "live" ? current.setup.setup : null
    return (setup?.musicSave ?? null) as PlaylistId | null
  }
  async function loadNames() {
    if (names !== null) return
    names = new Map()
    const answer = await context.actions.playlists(false)
    if ((answer.kind === "cached" || answer.kind === "listed") && answer.listing) names = new Map(answer.listing.rows.map(row => [row.id, row.title]))
    redraw()
  }

  /** The tooltip names the action and its live key; on a squeezed row it names the song too (YM-QA-12, YM-NARROW-2). */
  function labels(shown: Shown, action: QuickAction, base: string, tipBase = base): { label: string; tip: string } {
    const current = view.read()
    const key = keyOf(current, action)
    const title = shown.item.title
    const element = shown.element.querySelector(titles)
    const narrow = shown.family === "responsive-row" && element !== null && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().width < narrowTitle
    const named = title ? i18n.message("musicTip_named", { action: base, title }) : base
    const tipText = key
      ? narrow && title ? i18n.message("musicTip_namedKey", { action: tipBase, title, key: display(key, context.os) }) : i18n.message("musicTip_key", { action: tipBase, key: display(key, context.os) })
      : narrow && title ? i18n.message("musicTip_named", { action: tipBase, title }) : tipBase
    return { label: named, tip: tipText }
  }
  function drawn(shown: Shown): Drawn[] {
    const playlist = quickSave()
    const casting = i18n.message("musicHint_casting")
    return shown.actions.flatMap((action): Drawn[] => {
      const state = stateOf(shown, action)
      const dimmed = shown.casting && quickActions[action].queueEdit
      const stateIcon: IconName | null = state === "busy" ? "spinner" : state === "failed" ? "error" : state === "done" ? action === "save" ? "playlist_add_check" : "check" : null
      if (action === "save") {
        if (playlist === null) {
          const choose = i18n.message("musicAction_savePicker")
          return [{ id: "choose", icon: stateIcon ?? "playlist_add", label: labels(shown, "save", choose).label, tip: choose, disabled: state === "busy", pressed: null, split: null }]
        }
        const list = names?.get(playlist) ?? null
        const main = list ? i18n.message("quickSave_idle", { list }) : i18n.message("picker_saveMusicTitle")
        return [
          { id: "save", icon: stateIcon ?? "playlist_add", ...labels(shown, "save", main), disabled: state === "busy", pressed: null, split: "main" },
          { id: "more", icon: "arrow_drop_down", ...labels(shown, "picker", i18n.message("musicAction_savePicker")), disabled: false, pressed: null, split: "more" }
        ]
      }
      const name = i18n.message(quickActions[action].name)
      const text = labels(shown, action, name, action === "mix" ? i18n.message("musicAction_mixTip") : name)
      const on = action === "like" ? shown.item.likeState === "liked" : action === "library" ? shown.item.endpoints.library?.inLibrary === true : null
      const resting: IconName = action === "like" && on ? "thumb_up_filled" : action === "library" && on ? "library_add_check" : icons[action]
      return [{ id: action, icon: stateIcon ?? resting, label: text.label, tip: dimmed ? casting : text.tip, disabled: dimmed || state === "busy", pressed: on, split: null }]
    })
  }

  // The moving host for rows, cards and queue items (UI-YM-07).
  const hover = createHost(scope, document, "row", tip, (id, button) => { if (shownHover) void press(shownHover, hover, id, button) }, context.preload)
  let shownHover: Shown | null = null
  const headers = new Map<Element, { readonly host: Host; shown: Shown }>()
  type BarHost = { readonly host: Host; readonly anchor: Element; shown: Shown | null; readonly stop: Dispose }
  let bar: BarHost | null = null
  scope.add(() => { hover.dispose(); for (const entry of headers.values()) entry.host.dispose(); bar?.stop(); bar?.host.dispose(); watchedLike?.stop() })
  scope.on(hover.host, "pointerenter", () => { hideTimer() })

  function redraw() {
    if (shownHover) hover.draw(drawn(shownHover))
    for (const entry of headers.values()) entry.host.draw(drawn(entry.shown))
    if (bar?.shown) bar.host.draw(drawn(bar.shown))
  }
  function subject(shown: Shown): QuickTarget {
    const move = shown.family === "queue-item" && !shown.item.selected && !shown.item.autoplay
    return { title: shown.item.title, videoId: shown.item.videoId ?? null, item: shown.item, element: shown.family === "bar" ? null : shown.element, move }
  }
  function settle(key: string, action: ButtonAction, answer: QuickAnswer, shown: Shown) {
    // Moves, removes and toggles show no done check: the toast or the icon is the answer, and the element may hold another song by then (YM-MOVE-8).
    const check = answer.kind === "done" && (action === "save" || (action === "next" || action === "queue") && !subject(shown).move)
    const state: State = answer.kind === "failed" ? "failed" : check ? "done" : "idle"
    setState(key, action, state)
    if (state !== "idle") scope.timeout(() => { if (states.get(key)?.[action] === state) setState(key, action, "idle") }, settleMs)
  }
  async function press(shown: Shown, host: Host, id: string, button: HTMLElement) {
    const current = view.read(), settings = settingsOf(current)
    if (!settings) return
    const input = { opener: "music-actions" as const, feedback: settings.feedback, by: "click" as const, button: host.anchor ?? button }
    let target: QuickTarget = subject(shown)
    if (shown.family === "bar") {
      const playing = await quick.playing("save")
      if (playing.kind !== "target") return
      target = playing.target
    }
    if (id === "more") { await quick.act("picker", target, input); return }
    if (id === "choose") { await quick.openPicker(target, input, "choose"); return }
    const action = id as ButtonAction
    const key = stateKey(target.item ?? shown.item, shown.element, shown.family)
    if (states.get(key)?.[action] === "busy") return
    setState(key, action, "busy")
    const answer = await quick.act(action, target, input)
    if (scope.disposed) return
    settle(key, action, answer, shown)
    void reread(shown)
  }
  /** After every action the host reads its item again, so a re-rendered element never keeps another song's state (YM-QA-15). */
  async function reread(shown: Shown) {
    if (shown.family === "bar") return
    const read = await page.run<JobOf<"itemInfo">>({ job: { kind: "itemInfo" } }, { target: shown.element })
    if (!read.ok || scope.disposed) return
    shown.item = read.data
    redraw()
  }

  /** The buttons this item gets here and now. A feature that isn't working draws nothing and raises its notice once (YM-FAIL-5). */
  async function offer(element: Element, family: MusicItemTarget["family"], signature: string): Promise<Shown | null> {
    const current = view.read(), settings = settingsOf(current)
    if (!current || !settings) return null
    const status = statusOf(current, "music-actions")
    if (status && status.state !== "working" && !noticed) { noticed = true; notices.wouldAct("music-actions") }
    if (status?.state === "not-working") return null
    const read = await page.run<JobOf<"itemInfo">>({ job: { kind: "itemInfo" } }, { target: element })
    if (!read.ok) return null
    const actions = offeredButtons(read.data, family, settings.buttons, current.signedIn, status)
    if (!actions.length) return null
    const casting = actions.some(action => quickActions[action].queueEdit) && await quick.casting()
    void loadNames()
    return { element, family, signature, item: read.data, actions, casting }
  }

  function hide() {
    hideTimer(); hideTimer = () => {}
    showing++
    shownHover = null
    tip.hide()
    hover.host.remove()
  }
  function hideSoon() {
    if (!shownHover) return
    hideTimer()
    hideTimer = scope.timeout(hide, leaveMs)
  }
  async function show(target: Pick<MusicItemTarget, "element" | "family" | "signature">) {
    const ticket = ++showing
    hideTimer()
    const next = await offer(target.element, target.family, target.signature)
    if (ticket !== showing || scope.disposed) return
    if (!next) { hide(); return }
    // Rows and queue items join their own flex row before YouTube Music's like and ⋮; cards sit on the thumbnail overlay (UI-YM-09 to UI-YM-13).
    const place = target.family === "two-row-card" ? target.element.querySelector("ytmusic-item-thumbnail-overlay-renderer") : menuOf(target.element)
    if (!place) { hide(); return }
    hover.kind = target.family === "two-row-card" ? "card" : "row"
    if (target.family === "two-row-card") { if (hover.host.parentElement !== place) place.append(hover.host) }
    else if (hover.host.nextElementSibling !== place) place.before(hover.host)
    shownHover = next
    hover.draw(drawn(next))
  }
  function pointed() {
    if (scope.disposed) return
    const found = items.readPointed()
    if (found.kind === "no-pointed-item" && found.reason === "player") syncBar()
    if (found.kind !== "pointed-item" || found.target.family === "header") { hideSoon(); return }
    if (shownHover && shownHover.element === found.target.element && shownHover.signature === found.target.signature) { hideTimer(); return }
    void show(found.target)
  }

  async function syncHeaders() {
    for (const [header, entry] of headers) {
      if (header.isConnected) continue
      entry.host.dispose()
      headers.delete(header)
    }
    for (const header of document.querySelectorAll("ytmusic-responsive-header-renderer")) {
      if (headers.has(header)) continue
      const next = await offer(header, "header", "")
      const box = header.querySelector("#action-buttons")
      if (!next || !box || scope.disposed || headers.has(header)) continue
      const host = createHost(scope, document, "header", tip, (id, button) => { const entry = headers.get(header); if (entry) void press(entry.shown, host, id, button) }, context.preload)
      const menu = menuOf(box)
      if (menu) menu.before(host.host)
      else box.append(host.host)
      headers.set(header, { host, shown: next })
      host.draw(drawn(next))
    }
  }
  function dropHeaders() {
    for (const entry of headers.values()) entry.host.dispose()
    headers.clear()
  }

  /** YouTube Music hides its like in a narrow window and while an ad plays; a hidden like is no anchor (YM-BAR-3). */
  function shownLike(element: Element | null): Element | null {
    if (!element || element.hasAttribute("hidden")) return null
    return document.defaultView?.getComputedStyle(element).display === "none" ? null : element
  }
  // The like YouTube Music may hide or show again, watched while the setting is on so the Save follows it.
  let watchedLike: { readonly element: Element; readonly stop: Dispose } | null = null
  function watchLike(element: Element | null) {
    if (watchedLike?.element === element) return
    watchedLike?.stop()
    watchedLike = element ? { element, stop: scope.observe(element, { attributes: true, attributeFilter: ["hidden", "style", "class"] }, () => syncBar()) } : null
  }
  /** The opt-in Save beside YouTube Music's like, in the classic bar or the Wiz miniplayer; no anchor, nothing drawn (YM-BAR-2, YM-BAR-3). */
  function syncBar() {
    const current = view.read(), settings = settingsOf(current)
    const status = current ? statusOf(current, "music-actions") : undefined
    const on = settings?.buttons.bar === true && current?.signedIn === true && !withdrawn(status, "save") && !document.hidden
    const classicLike = on ? document.querySelector("ytmusic-player-bar #like-button-renderer") : null
    const wizBar = on && !classicLike ? document.querySelector("ytmusic-miniplayer yt-video-action-bar-view-model") : null
    watchLike(classicLike ?? wizBar)
    const classic = shownLike(classicLike)
    const anchor = classic ?? shownLike(wizBar)
    if (bar && bar.anchor !== anchor) { bar.stop(); bar.host.dispose(); bar = null }
    if (!anchor) return
    if (!bar) {
      const kind: HostKind = classic ? "bar" : "wiz"
      const host = createHost(scope, document, kind, tip, (id, button) => { if (bar?.shown) void press(bar.shown, host, id, button) }, context.preload)
      // The song is followed from the app's own events, and only while the Save is drawn (YM-BAR-7, YM-BAR-9).
      const entry: BarHost = { host, anchor, shown: null, stop: page.watch("nowPlaying", song => {
        entry.shown = song ? { element: anchor, family: "bar", signature: song.videoId, actions: ["save"], casting: false,
          item: { kind: "song", type: { kind: "unclassified" }, title: song.title, videoId: song.videoId, selected: true, autoplay: false, hasOwnLike: true, likeState: null, endpoints: {} } } : null
        if (entry.shown) { void loadNames(); host.draw(drawn(entry.shown)) } else host.draw([])
      }) }
      bar = entry
    }
    if (bar.host.host.nextElementSibling !== anchor) anchor.before(bar.host.host)
    redraw()
  }

  // YM-FAIL-8: once the page settled, a visible player bar playing a song with no like at all is breakage. A like
  // YouTube Music hides, in a narrow window or for an ad, is still there and isn't (YM-BAR-3). PROVISIONAL until a live check.
  async function checkBar() {
    const current = view.read(), settings = settingsOf(current)
    if (settings?.buttons.bar !== true || current?.signedIn !== true || document.hidden || withdrawn(current ? statusOf(current, "music-actions") : undefined, "save")) return
    const playerBar = document.querySelector("ytmusic-player-bar")
    if (!playerBar || playerBar.hasAttribute("hidden") || playerBar.querySelector("#like-button-renderer, ytmusic-like-button-renderer")) return
    const song = await page.run<JobOf<"nowPlaying">>({ job: { kind: "nowPlaying" } })
    if (!scope.disposed && song.ok && song.data !== null) context.health?.playerBarMissing()
  }
  let checks: Dispose[] = []
  function settleLooks() {
    for (const stop of checks) stop()
    checks = settleChecks.map(ms => scope.timeout(() => { void syncHeaders(); syncBar(); if (ms === settleChecks.at(-1)) void checkBar() }, ms))
  }
  scope.add(page.watch("nav", () => { hide(); dropHeaders(); states.clear(); settleLooks() }))
  scope.add(quick.watch(progress => {
    // A key on a shown item takes that item's button through the same states (YM-KEY-11).
    const action = progress.action === "picker" ? null : progress.action
    const shown = [shownHover, ...[...headers.values()].map(entry => entry.shown)].find(entry => entry?.element === progress.element) ?? null
    if (!shown || !action || !shown.actions.includes(action)) return
    const key = stateKey(shown.item, shown.element, shown.family)
    if (progress.state === "busy") setState(key, action, "busy")
    else { settle(key, action, { kind: progress.state, text: null }, shown); void reread(shown) }
  }))
  view.subscribe(() => {
    names = null
    const again = shownHover
    if (again && again.family !== "bar") void show({ element: again.element, family: again.family, signature: again.signature })
    dropHeaders(); void syncHeaders(); syncBar()
  })
  scope.on(document, "pointerover", pointed, { capture: true, passive: true })
  scope.on(document, "focusin", pointed, true)
  scope.on(document, "pointerout", event => { if (event.relatedTarget === null) hideSoon() }, true)
  scope.on(document, "visibilitychange", () => syncBar())
  // A narrow window hides the like through YouTube Music's styles, which no attribute shows, so a resize looks again.
  let resized: Dispose = () => {}
  const win = document.defaultView
  if (win) scope.on(win, "resize", () => { resized(); resized = scope.timeout(() => { if (watchedLike) syncBar() }, 150) }, { passive: true })
  settleLooks()
}

export const musicActions: FeatureDefinition<"music", MusicActionServices> = { id: "music-actions", start }
