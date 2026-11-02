import type { FeatureId, ItemInfo, Job, JobFailure, JobInvocation, JobOf, JobResult, LikeEndpoint, NowPlaying } from "../../../shared/contracts"
import { isMusicAdFailure } from "../../../shared/contracts"
import type { TabView } from "../../../shared/contracts/tab-view"
import { cut, musicHintText, toastText, type MusicHint } from "../../../shared/copy"
import type { I18n } from "../../../shared/i18n"
import type { AccountKey, Key, PlaylistId, ShortcutId, VideoId } from "../../../shared/model"
import { signInUrl } from "../../../shared/youtube/sign-in"
import type { TabActions, Unanswered } from "../../core/actions"
import type { MusicItems, MusicResolution } from "../../core/items-music"
import type { Scope } from "../../core/scope"
import { explicitAdd } from "../../explicit"
import { musicPickerAnchor, type Popovers } from "../../popovers/types"
import type { Feedback } from "../feedback"
import type { ToastContent } from "../toaster/types"
import type { TabAddReport } from "../../../shared/contracts/tab-actions"
import { brokenKeyText, quickActions, statusOf, type QuickAction } from "../../music/actions"

export type { QuickAction } from "../../music/actions"

/** What a quick action acts on: a pointed or clicked item, or the playing song (YM-TGT-1, YM-TGT-2). */
export type QuickTarget = {
  readonly title: string
  readonly videoId: VideoId | null
  /** Null only for the playing song when its queue item can't be read; saving it still works. */
  readonly item: ItemInfo | null
  readonly element: Element | null
  /** A queued song that isn't playing: Play next and Add to queue move it instead of adding a copy (YM-QA-4). */
  readonly move: boolean
}
/** Who pressed, and how: Show feedback is the opener's, and a key with no button in view gets the pending toast (YM-FB-6, YM-SAVE-12). */
export type QuickInput = {
  readonly opener: FeatureId
  readonly feedback: boolean
  readonly by: "click" | "key"
  /** The Save button the picker opens below, when one shows (YM-PICK-2). */
  readonly button?: Element | null
  /** A key from any tab can't open a picker in a tab the user isn't looking at (YM-ANY-2). */
  readonly anyTab?: boolean
  /** The key pressed, for the answer while its feature isn't working (YM-KEY-12). */
  readonly key?: Key
}
/**
 * For a button's state and the any-tab ✓ or ✕ (YM-FB-7, YM-ANY-4). `idle` answered without doing anything: a hint,
 * or a picker. `already` found the song already in the playlist: a ✓, and an idle button (YM-SAVE-15).
 */
export type QuickAnswer = { readonly kind: "done" | "already" | "idle" | "failed"; readonly text: string | null }
type Targeted = { readonly kind: "target"; readonly target: QuickTarget }
type ShortcutEntry = { readonly id: ShortcutId; readonly label: string; readonly watchLaterOnEveryAccount: boolean; readonly key: Key }
/** A key's progress on an item, so a button showing that item goes through the same states (YM-KEY-11). */
export type QuickProgress = { readonly element: Element; readonly action: QuickAction; readonly state: "busy" | QuickAnswer["kind"] }

import type { SiteHealth } from "../../core/health"

export type MusicQuickDeps = {
  readonly owner: Scope
  readonly document: Document
  readonly page: { run<J extends Job>(invocation: JobInvocation<J>, context?: { target?: Element }): Promise<JobResult<J>> }
  readonly items: Pick<MusicItems, "resolve">
  readonly actions: TabActions
  /** Hears a key pointed at an item it can't recognise (HEALTH-01). */
  readonly health?: Pick<SiteHealth, "itemUnrecognised">
  readonly i18n: I18n
  readonly view: () => TabView | null
  readonly feedback: () => Feedback | null
  readonly popovers: () => Promise<Popovers | null>
  readonly location: Pick<Location, "href" | "assign" | "reload">
  readonly notices: { wouldAct(feature: "music-keys" | "shortcuts"): void }
  readonly os: "macos" | "windows" | "linux"
  readonly log?: (line: string) => void
}

const queueItems = "ytmusic-player-queue ytmusic-player-queue-item, ytmusic-player-queue-item"
const playingReads = 25
const likeStatus = { liked: "LIKE", "not-liked": "INDIFFERENT", disliked: "DISLIKE" } as const

function likeStatusOf(endpoint: LikeEndpoint): string | undefined {
  const body = endpoint.likeEndpoint
  const status = body !== null && typeof body === "object" && !Array.isArray(body) ? body.status : undefined
  return typeof status === "string" ? status : undefined
}
function withStatus(endpoint: LikeEndpoint, status: string): LikeEndpoint {
  const body = endpoint.likeEndpoint
  return { ...endpoint, likeEndpoint: { ...(body !== null && typeof body === "object" && !Array.isArray(body) ? body : {}), status } } as LikeEndpoint
}

/**
 * The quick actions on YouTube Music (03 §6 to §11, §21): what each does to an item or the playing song, its
 * one toast, and its Undo. The kit carries it, so the buttons, the keys and a key from any tab share one copy.
 */
export function createMusicQuick(deps: MusicQuickDeps) {
  const { document, page, items, actions, i18n } = deps
  const log = deps.log ?? (line => console.info(`[Perchling] ${line}`))
  const watchers = new Set<(progress: QuickProgress) => void>()
  function report(progress: QuickProgress) { for (const watcher of [...watchers]) { try { watcher(progress) } catch {} } }

  function session(): Feedback | null { return deps.feedback() }
  function name(action: QuickAction): string { return i18n.message(quickActions[action].name) }
  function show(content: ToastContent): void { session()?.toaster.show(content) }
  function failure(text: string): QuickAnswer {
    show({ text, tone: "failure", auto: false, action: null })
    return { kind: "failed", text }
  }
  function hint(text: string): QuickAnswer {
    show({ text, tone: "hint", auto: false, action: null })
    return { kind: "idle", text }
  }
  function musicHint(value: MusicHint): QuickAnswer {
    const text = musicHintText(value, i18n)
    return value.kind === "unrecognised-item" ? failure(text) : hint(text)
  }
  /** A confirmation: hidden with Show feedback off, never its effect (YM-FB-6). */
  function confirm(input: QuickInput, text: string, undo: (() => Promise<ToastContent | null>) | null): QuickAnswer {
    const feedback = session()
    if (feedback && input.feedback) {
      show({ text, tone: "confirmation", auto: false, action: undo ? feedback.action("undo", undo) : null })
    }
    return { kind: "done", text }
  }
  function undoFailed(): ToastContent {
    return { text: i18n.message("feedback_www_manual_untitled_undo_failed"), tone: "failure", auto: false, action: null }
  }
  function castingHint(): ToastContent {
    return { text: musicHintText({ kind: "casting" }, i18n), tone: "hint", auto: false, action: null }
  }
  function signIn(text: string): QuickAnswer {
    const feedback = session()
    show({ text, tone: "failure", auto: false,
      action: feedback ? feedback.action("sign-in", () => { deps.location.assign(signInUrl(deps.location.href)); return null }) : null })
    return { kind: "failed", text }
  }
  function accountChanged(): QuickAnswer {
    const feedback = session()
    const text = i18n.message("feedback_www_manual_untitled_failed_account_changed_one")
    show({ text, tone: "failure", auto: false, action: feedback ? feedback.action("reload", () => { deps.location.reload(); return null }) : null })
    return { kind: "failed", text }
  }
  /** Failed, else not working right now when this tab lacks the action's internals (YM-KEY-12, YM-FAIL-1). */
  function failed(action: QuickAction, result: JobFailure, text: string): QuickAnswer {
    if (result.reason === "accountChanged") return accountChanged()
    return failure(result.reason === "unavailable" ? i18n.message("musicFail_keyUnavailable", { action: name(action) }) : text)
  }

  /** YouTube Music's own cast state. Unreadable leaves queue edits available (YM-CAST-2, M5). */
  async function casting(): Promise<boolean> {
    const answer = await page.run<JobOf<"castState">>({ job: { kind: "castState" } })
    return answer.ok && answer.data.casting
  }
  /** Runs a queue edit's Undo, which casting stops too (YM-FB-9). */
  function queueUndo(run: () => Promise<{ readonly ok: boolean }>): () => Promise<ToastContent | null> {
    return async () => {
      if (await casting()) return castingHint()
      return (await run()).ok ? null : undoFailed()
    }
  }

  /** The playing song's queue item, whose ⋮ carries the endpoints a key needs for it (YM-TGT-7, YM-KEY-10). */
  async function playingItem(song: NowPlaying): Promise<{ readonly item: ItemInfo; readonly element: Element } | null> {
    const candidates = [...new Set(document.querySelectorAll(queueItems))]
      .sort((a, b) => Number(b.hasAttribute("selected")) - Number(a.hasAttribute("selected"))).slice(0, playingReads)
    for (const element of candidates) {
      const read = await page.run<JobOf<"itemInfo">>({ job: { kind: "itemInfo" } }, { target: element })
      if (read.ok && read.data.selected && read.data.videoId === song.videoId) return { item: read.data, element }
    }
    return null
  }
  /** The pointed-at item, else the playing song; anything else answers here and never falls back (YM-TGT-3 to YM-TGT-6). */
  async function target(action: QuickAction | "playlist-shortcut"): Promise<Targeted | QuickAnswer> {
    const resolved: MusicResolution = await items.resolve(action === "playlist-shortcut" ? action : quickActions[action].item)
    switch (resolved.kind) {
      case "pointed-item": return { kind: "target", target: { title: resolved.item.title, videoId: resolved.item.videoId ?? null, item: resolved.item,
        element: resolved.target.element, move: resolved.queueDisposition === "move-existing" } }
      case "current-song": {
        const found = await playingItem(resolved.song)
        return { kind: "target", target: { title: resolved.song.title, videoId: resolved.song.videoId, item: found?.item ?? null,
          element: found?.element ?? null, move: false } }
      }
      case "unsupported-item": return musicHint({ kind: "unsupported-item", reason: resolved.reason, action: resolved.action, item: { kind: resolved.item.kind } })
      case "unrecognised-item":
        deps.health?.itemUnrecognised(action === "playlist-shortcut" ? "shortcuts" : "music-keys")
        return musicHint({ kind: "unrecognised-item" })
      case "stale-target": return musicHint({ kind: "unrecognised-item" })
      case "no-queue-target":
      case "nothing-playing": return musicHint({ kind: resolved.kind })
      case "ad-playing": return musicHint({ kind: "ad-playing" })
      case "inactive": return { kind: "idle", text: null }
      case "unavailable":
      case "detail-failed": return failure(i18n.message("musicFail_keyUnavailable", { action: name(action === "playlist-shortcut" ? "save" : action) }))
    }
  }

  async function queue(action: "next" | "queue", to: "next" | "end", subject: QuickTarget, input: QuickInput): Promise<QuickAnswer> {
    const title = cut(subject.title)
    const id = subject.item?.queueItemId
    if (subject.move && id !== undefined) {
      const moved = await page.run<JobOf<"queueMove">>({ job: { kind: "queueMove", id, to } })
      if (!moved.ok) return failed(action, moved, i18n.message("musicFail_move", { title }))
      if (!moved.data.moved) return hint(i18n.message(to === "next" ? "musicToast_alreadyNext" : "musicToast_alreadyEnd", { title }))
      const from = moved.data.from
      return confirm(input, i18n.message(to === "next" ? "musicToast_movedNext" : "musicToast_movedEnd", { title }),
        queueUndo(() => page.run<JobOf<"queueMove">>({ job: { kind: "queueMove", id, to: from } })))
    }
    const endpoint = subject.item?.endpoints[to]
    if (!endpoint) return failure(i18n.message("musicFail_queue", { title }))
    const before = await page.run<JobOf<"nowPlaying">>({ job: { kind: "nowPlaying" } })
    const inserted = await page.run<JobOf<"queueInsert">>({ job: { kind: "queueInsert", endpoint, position: to } })
    if (!inserted.ok) return failed(action, inserted, i18n.message("musicFail_queue", { title }))
    // With nothing loaded, YouTube Music starts playing the item instead, and there's nothing to undo (YM-Q-6).
    if (before.ok && before.data === null) return confirm(input, i18n.message("musicToast_playing", { title }), null)
    const ids = inserted.data.ids
    const block = subject.item?.kind === "album" || subject.item?.kind === "playlist"
    const count = i18n.number(ids.length), many = i18n.plural(ids.length) === "one" ? "one" : "other"
    const text = block
      ? i18n.message(to === "next" ? `musicToast_playNextMany_${many}` : `musicToast_queuedMany_${many}`, { count, title })
      : i18n.message(to === "next" ? "musicToast_playNext" : "musicToast_queued", { title })
    return confirm(input, text, queueUndo(() => page.run<JobOf<"queueRemoveIds">>({ job: { kind: "queueRemoveIds", ids } })))
  }

  async function remove(subject: QuickTarget, input: QuickInput): Promise<QuickAnswer> {
    const title = cut(subject.title)
    const id = subject.item?.queueItemId, videoId = subject.videoId
    if (id === undefined || videoId === null) return failure(i18n.message("musicFail_remove", { title }))
    const removed = await page.run<JobOf<"queueRemove">>({ job: { kind: "queueRemove", id } })
    if (!removed.ok) return failed("remove", removed, i18n.message("musicFail_remove", { title }))
    const index = removed.data.index
    return confirm(input, i18n.message("musicToast_removedQueue", { title }),
      queueUndo(() => page.run<JobOf<"queueReinsert">>({ job: { kind: "queueReinsert", videoId, index } })))
  }

  async function like(subject: QuickTarget, input: QuickInput, acct: AccountKey): Promise<QuickAnswer> {
    const title = cut(subject.title)
    const endpoint = subject.item?.endpoints.like
    if (!endpoint) return failure(i18n.message("musicFail_like", { title }))
    const liking = likeStatusOf(endpoint) === "LIKE"
    const result = await page.run<JobOf<"like">>({ job: { kind: "like", endpoint }, acct })
    if (!result.ok) return failed("like", result, i18n.message("musicFail_like", { title }))
    // A click's answer is the icon, as with YouTube Music's own like; a key may have no button in view (YM-LIKE-3, YM-LIKE-4).
    if (input.by === "click") return { kind: "done", text: null }
    const state = subject.item?.likeState
    const previous = state ? likeStatus[state] : liking ? likeStatus["not-liked"] : likeStatus.liked
    return confirm(input, i18n.message(liking ? "musicToast_liked" : "musicToast_unliked", { title }), async () => {
      const undone = await page.run<JobOf<"like">>({ job: { kind: "like", endpoint: withStatus(endpoint, previous) }, acct })
      return undone.ok ? null : undoFailed()
    })
  }

  async function library(subject: QuickTarget, input: QuickInput, acct: AccountKey): Promise<QuickAnswer> {
    const title = cut(subject.title)
    const slot = subject.item?.endpoints.library, element = subject.element
    if (!slot || !element) return failure(i18n.message("musicFail_library", { title }))
    const result = await page.run<JobOf<"library">>({ job: { kind: "library", endpoint: slot.endpoint }, acct }, { target: element })
    if (!result.ok) return failed("library", result, i18n.message("musicFail_library", { title }))
    if (input.by === "click") return { kind: "done", text: null }
    const now = result.data.inLibrary
    // Undo toggles back through the item's own endpoint, read again because the toggle swapped it (YM-MORE-3).
    return confirm(input, i18n.message(now ? "musicToast_librarySaved" : "musicToast_libraryRemoved", { title }), async () => {
      const read = await page.run<JobOf<"itemInfo">>({ job: { kind: "itemInfo" } }, { target: element })
      const back = read.ok ? read.data.endpoints.library : undefined
      if (!back || back.inLibrary !== now) return undoFailed()
      const undone = await page.run<JobOf<"library">>({ job: { kind: "library", endpoint: back.endpoint }, acct }, { target: element })
      return undone.ok ? null : undoFailed()
    })
  }

  async function navigate(action: "mix" | "album" | "artist", subject: QuickTarget): Promise<QuickAnswer> {
    const title = cut(subject.title)
    const text = i18n.message(action === "mix" ? "musicFail_mix" : action === "album" ? "musicFail_album" : "musicFail_artist", { title })
    const endpoint = subject.item?.endpoints[action]
    if (!endpoint) return failure(text)
    const result = await page.run<JobOf<"navigate">>({ job: { kind: "navigate", endpoint } })
    // Playback or the new page is the answer, so success shows no toast (YM-MORE-4, YM-MORE-5).
    return result.ok ? { kind: "done", text: null } : failed(action, result, text)
  }

  async function openPicker(subject: QuickTarget, input: QuickInput, mode: "save" | "choose", shortcut: ShortcutId | null = null): Promise<QuickAnswer> {
    if (subject.videoId === null) return { kind: "idle", text: null }
    const popovers = await deps.popovers()
    if (!popovers) return failure(i18n.message("picker_loadFailed"))
    popovers.openPicker({ video: subject.videoId, ...(subject.title ? { title: subject.title } : {}), opener: input.opener,
      anchor: musicPickerAnchor(document, input.button ?? null), mode: mode === "save" ? { kind: "save" } : { kind: "choose", shortcut } })
    return { kind: "idle", text: null }
  }

  function outcomeOf(answer: TabAddReport | Unanswered, playlist: PlaylistId | null): QuickAnswer["kind"] {
    if (answer.kind === "choose") return "idle"
    const outcome = answer.kind === "report" && playlist ? answer.outcomes[playlist] : undefined
    return outcome?.kind === "added" ? "done" : outcome?.kind === "already-in" ? "already" : "failed"
  }
  async function save(subject: QuickTarget, input: QuickInput): Promise<QuickAnswer> {
    const feedback = session(), view = deps.view()
    const video = subject.videoId
    if (!feedback || !view || video === null) return { kind: "idle", text: null }
    const setup = view.setup?.kind === "live" ? view.setup.setup : null
    const playlist = (setup?.musicSave ?? null) as PlaylistId | null
    if (input.anyTab && view.signedIn && playlist === null) {
      return hint(i18n.message("musicHint_anyTabNoQuickSave", { account: setup?.label?.name || i18n.message("copy_account") }))
    }
    const answer = await explicitAdd({ session: feedback, actions, i18n, location: deps.location }, {
      feedback: input.feedback, keyWithoutButton: input.by === "key" && !input.button, pending: playlist ? [playlist] : [],
      titles: subject.title ? { video: subject.title } : {},
      handlers: { choose: () => { void openPicker(subject, input, "choose") } }
    }, () => actions.add({ site: "music", video, via: "quick-save", opener: input.opener }))
    // Every save logs its outcome in the tab, whatever Show feedback says (YM-FB-12).
    log(`save ${video} ${answer.kind === "report" && playlist ? answer.outcomes[playlist]?.kind ?? answer.kind : answer.kind}`)
    return { kind: outcomeOf(answer, playlist), text: saveText(answer, subject.title) }
  }
  function saveText(answer: TabAddReport | Unanswered, title: string): string | null {
    switch (answer.kind) {
      case "report": return answer.toast ? toastText(answer.toast, { ...(title ? { video: title } : {}), playlists: answer.titles }, "music", i18n) : null
      case "signed-out": return i18n.message("feedback_music_manual_untitled_failed_signed_out_one")
      case "choose": return null
      default: return i18n.message("site_addUnanswered")
    }
  }

  /** A playlist shortcut's explicit add to its playlist on this account; with none, its Choose picks one (YM-PS-4, YM-PS-5). */
  async function shortcut(subject: QuickTarget, entry: ShortcutEntry, input: QuickInput): Promise<QuickAnswer> {
    const feedback = session(), view = deps.view()
    const video = subject.videoId
    if (!feedback || !view || video === null) return { kind: "idle", text: null }
    const setup = view.setup?.kind === "live" ? view.setup.setup : null
    const playlist = (entry.watchLaterOnEveryAccount ? "WL" : setup?.targets[entry.id] ?? null) as PlaylistId | null
    const answer = await explicitAdd({ session: feedback, actions, i18n, location: deps.location }, {
      feedback: input.feedback, keyWithoutButton: true, pending: playlist ? [playlist] : [],
      titles: { ...(subject.title ? { video: subject.title } : {}), ...(entry.label ? { shortcut: entry.label } : {}), ...(setup?.label?.name ? { account: setup.label.name } : {}) },
      handlers: { choose: () => { void openPicker(subject, input, "choose", entry.id) } }
    }, () => actions.add({ site: "music", video, via: "shortcut", shortcut: entry.id }))
    log(`save ${video} ${answer.kind === "report" && playlist ? answer.outcomes[playlist]?.kind ?? answer.kind : answer.kind}`)
    return { kind: outcomeOf(answer, playlist), text: saveText(answer, subject.title) }
  }

  /** Runs one action on a known target, after the signed-in and casting checks it needs (YM-ACC-5, YM-CAST-2). */
  async function act(action: QuickAction, subject: QuickTarget, input: QuickInput): Promise<QuickAnswer> {
    const spec = quickActions[action]
    const view = deps.view()
    if (spec.account && view && !view.signedIn) {
      if (action === "like") return signIn(i18n.message("musicFail_signedOutLike"))
      if (action === "library") return signIn(i18n.message("musicFail_signedOutLibrary"))
      return signIn(i18n.message("feedback_music_manual_untitled_failed_signed_out_one"))
    }
    if (spec.queueEdit && await casting()) return hint(musicHintText({ kind: "casting" }, i18n))
    const acct = view?.signedIn ? view.acct : null
    switch (action) {
      case "next": return queue(action, "next", subject, input)
      case "queue": return queue(action, "end", subject, input)
      case "remove": return remove(subject, input)
      case "save": return save(subject, input)
      case "picker": return openPicker(subject, input, "save")
      case "like": return acct ? like(subject, input, acct) : { kind: "idle", text: null }
      case "library": return acct ? library(subject, input, acct) : { kind: "idle", text: null }
      case "mix":
      case "album":
      case "artist": return navigate(action, subject)
    }
  }

  /**
   * A key whose feature isn't working, or whose action is unavailable in this tab, still answers each press and
   * raises the feature's notice, so it never does nothing silently (YM-KEY-12, R50, R68).
   */
  function withdrawnKey(feature: "music-keys" | "shortcuts", action: QuickAction, input: QuickInput): QuickAnswer | null {
    const view = deps.view()
    if (!input.key || view?.site !== "music") return null
    const status = statusOf(view, feature)
    const text = brokenKeyText(status, action, input.key, i18n, deps.os)
    if (!text) return null
    if (status?.state === "not-working") deps.notices.wouldAct(feature)
    return failure(text)
  }

  /** The playing song, whatever the pointer is on: a key from any tab and the player-bar Save (YM-ANY-2, YM-BAR-7). */
  async function playing(action: QuickAction): Promise<Targeted | QuickAnswer> {
    const answer = await page.run<JobOf<"nowPlaying">>({ job: { kind: "nowPlaying" } })
    if (!answer.ok) return isMusicAdFailure(answer) ? musicHint({ kind: "ad-playing" }) : failure(i18n.message("musicFail_keyUnavailable", { action: name(action) }))
    if (answer.data === null) return musicHint({ kind: "nothing-playing" })
    const found = await playingItem(answer.data)
    return { kind: "target", target: { title: answer.data.title, videoId: answer.data.videoId, item: found?.item ?? null, element: found?.element ?? null, move: false } }
  }

  return {
    act,
    target,
    playing,
    openPicker,
    casting,
    /** A key's press: the pointed-at item, else the playing song (YM-KEY-10). */
    async press(action: QuickAction, input: QuickInput): Promise<QuickAnswer> {
      const broken = withdrawnKey("music-keys", action, input)
      if (broken) return broken
      const found = await target(action)
      if (deps.owner.disposed) return { kind: "idle", text: null }
      if (found.kind !== "target") return found
      const element = found.target.element
      if (element) report({ element, action, state: "busy" })
      const answer = await act(action, found.target, input)
      if (element) report({ element, action, state: answer.kind })
      return answer
    },
    /** A playlist shortcut's key: songs only, the pointed-at song else the playing one (YM-PS-3). */
    async pressShortcut(entry: ShortcutEntry, input: QuickInput): Promise<QuickAnswer> {
      const broken = withdrawnKey("shortcuts", "save", { ...input, key: entry.key })
      if (broken) return broken
      const found = await target("playlist-shortcut")
      if (deps.owner.disposed) return { kind: "idle", text: null }
      return found.kind === "target" ? shortcut(found.target, entry, input) : found
    },
    watch(watcher: (progress: QuickProgress) => void): () => void {
      watchers.add(watcher)
      return () => { watchers.delete(watcher) }
    }
  }
}
export type MusicQuick = ReturnType<typeof createMusicQuick>
