import type { JobOf } from "../../../shared/contracts"
import type { NavData, PlayerData } from "../../../shared/contracts/streams"
import type { TabAddReport, TabProgress, UndoHandle } from "../../../shared/contracts/tab-actions"
import type { AutoAddText, Titles } from "../../../shared/copy"
import type { ChannelId, PlaylistId, VideoId } from "../../../shared/model"
import type { Failure, Outcome } from "../../../shared/rules/outcomes"
import { toastPlan } from "$kit"
import { channelLabel } from "../../../shared/rules/channel-filter"
import type { TabActions } from "../../core/actions"
import type { FeatureContext, FeatureDefinition, SiteView } from "../../core/feature-host"
import type { PageLink } from "../../core/page-link"
import type { Dispose, Scope } from "../../core/scope"
import type { SiteHealth } from "../../core/health"
import type { Feedback } from "../../kit/feedback"
import type { ToastAction } from "../../kit/toaster/types"
import type { ThisVideo } from "../../../shared/contracts/this-video"
import { autoAddState, thisVideo, type AutoAddState } from "./state"
import {
  createTracker, evaluateGoals, progress, recordOutcome, recordReading, rememberEarlier, updateTracker,
  type DestinationOutcome, type PlaybackFacts, type Reading, type RememberedProgress, type Tracker, type TrackerSettings
} from "./tracker"

export type AutoAddServices = {
  readonly document: Document
  readonly page: Pick<PageLink, "watch" | "onState" | "run">
  readonly actions: Pick<TabActions, "add" | "undo" | "release" | "progress" | "cantMeasure" | "videoChanged" | "channelLabel" | "settings">
  readonly feedback: { use(owner: Scope): Feedback | null }
  readonly text: AutoAddText
  /** Monotonic milliseconds. */
  readonly clock: { now(): number }
  /** The watch-page button and the popup read this playback's state (YT-AA-38). */
  readonly status?: (state: AutoAddState) => void
  /** This playback as the popup's This video and the watch-page button show it, or null with none (UI-POP-12, UI-YT-18). */
  readonly thisVideo?: (view: ThisVideo | null) => void
  readonly log?: (message: string) => void
  /** Hears each playback auto-add can't measure, and the next one it can (HEALTH-11). */
  readonly health?: Pick<SiteHealth, "cantMeasure" | "measured">
}

/** DATA-27: a pause, an end or a hidden tab saves only if the last save is a minute old; plain playback saves every 5 minutes. */
export const SAVE_AFTER_PAUSE_MS = 60_000
export const SAVE_WHILE_PLAYING_MS = 5 * 60_000
/** YouTube's "Video paused. Continue watching?" is a confirm dialog in the popup container. PROVISIONAL until a live check. */
export const promptContainer = "ytd-popup-container"
export const continuePrompt = "tp-yt-paper-dialog:not([aria-hidden='true']):not([hidden]) yt-confirm-dialog-renderer"

type Playback = {
  tracker: Tracker
  readonly player: "watch" | "shorts"
  title: string | undefined
  /** What the store holds now, so a checkpoint with nothing new played writes nothing. */
  saved: string
  savedAt: number
  playingSince: number | null
  cantMeasureNoted: boolean
  readonly failures: Map<string, Failure>
  /** Playlists the add flow reported skipped before this tab's view caught up with the skip. */
  readonly skippedHere: Set<string>
}
const nothing: Dispose = () => {}

function feature(view: SiteView<"www"> | null) {
  const found = view?.features.find(entry => entry.id === "auto-add")
  return view && found?.id === "auto-add" ? { view, options: found.options } : null
}
function settingsFor(view: SiteView<"www"> | null, video: VideoId | null, skippedHere: ReadonlySet<string>): TrackerSettings | null {
  const on = feature(view)
  if (!on || !on.view.signedIn || on.view.setup.kind !== "live" || on.view.setup.setup.autoAdd.length === 0) return null
  const playlists = on.view.setup.setup.autoAdd
  const skip = video === null ? undefined : on.view.skips.entries.find(([id]) => id === video)?.[1]
  const skipped = skip === "all" ? playlists.map(playlist => playlist.pl) : [...skip ?? []]
  return { playlists, defaultPct: on.options.pct, paused: on.view.paused, skipped: [...new Set([...skipped, ...skippedHere])] }
}
function factsOf(data: Extract<PlayerData, { ad: false }>): PlaybackFacts {
  return { content: data.content, duration: data.len, listedDuration: data.listedLength, isPostLiveDvr: data.isPostLiveDvr,
    isLive: data.isLive, isUpcoming: data.isUpcoming, isLiveContent: data.isLiveContent }
}
function sameFacts(a: PlaybackFacts, b: PlaybackFacts): boolean {
  return a.content === b.content && a.duration === b.duration && a.listedDuration === b.listedDuration && a.isPostLiveDvr === b.isPostLiveDvr &&
    a.isLive === b.isLive && a.isUpcoming === b.isUpcoming && a.isLiveContent === b.isLiveContent
}
function destination(outcome: Outcome | undefined): DestinationOutcome {
  return outcome?.kind === "added" || outcome?.kind === "already-in" || outcome?.kind === "filtered" || outcome?.kind === "skipped" ? outcome.kind : "failed"
}
/** What a checkpoint stores: the remembered stretches, or nothing at all once auto-add has run (DATA-25). */
function stored(tracker: Tracker): TabProgress | null {
  const state = progress(tracker)
  if (state.hasRun) return tracker.facts.duration === null ? null : { len: tracker.facts.duration, parts: [] }
  return state.remembered && state.remembered.length > 0 && state.remembered.parts.length > 0
    ? { len: state.remembered.length, parts: state.remembered.parts } : null
}

function start(context: FeatureContext<"www", AutoAddServices>): void {
  const { scope, view, page, actions, document, clock } = context
  const privateMemory = new Map<VideoId, RememberedProgress>()
  let playback: Playback | null = null
  let nav: NavData | null = null
  let stopPlayer: Dispose = nothing
  let stopPrompt: Dispose = nothing
  let prompting = false
  let privateCantMeasureShown = false
  let ready = false
  /** The video the background ticked this tab's toolbar icon for (YT-AA-42), until another video plays here. */
  let ticked: VideoId | null = null

  function current(): SiteView<"www"> | null { return view.read() }
  function kindsWanted(settings: TrackerSettings): boolean {
    const kind = nav?.navigation.kind === "shorts" ? "shorts" : "videos"
    return settings.playlists.some(playlist => playlist.takes === "both" || playlist.takes === kind)
  }
  /** YT-AA-44: follow the player only while a goal is left, and on the miniplayer, where a new video arrives without a navigation. */
  function wanted(): boolean {
    if (!ready) return false
    const settings = settingsFor(current(), playback?.tracker.video ?? null, playback?.skippedHere ?? new Set())
    if (!settings || settings.paused || !kindsWanted(settings)) return false
    if (playback === null || progress(playback.tracker).needsSamples || nav?.navigation.kind === "other") return true
    const facts = playback.tracker.facts
    return facts.isLive === true || facts.isUpcoming === true || facts.isPostLiveDvr === true
  }
  function watchPrompt() {
    stopPrompt(); stopPrompt = nothing
    const container = document.querySelector(promptContainer)
    if (!container) { prompting = false; return }
    const read = () => { prompting = container.querySelector(continuePrompt) !== null }
    read()
    stopPrompt = scope.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-hidden", "hidden", "opened", "style"] }, read)
  }
  function sync() {
    const want = wanted()
    if (want && stopPlayer === nothing) {
      watchPrompt()
      stopPlayer = page.watch("player", data => onPlayer(data))
    } else if (!want && stopPlayer !== nothing) {
      const stop = stopPlayer
      stopPlayer = nothing
      stop(); stopPrompt(); stopPrompt = nothing
    }
  }
  function publish() {
    const state = autoAddState({ tracker: playback?.tracker ?? null, paused: current()?.paused === true, failures: playback?.failures ?? new Map() })
    context.status?.(state)
    context.thisVideo?.(playback ? thisVideo({ tracker: playback.tracker, state, title: playback.title ?? null }) : null)
  }

  function save(target: Playback, reason: "leave" | "pause" | "continuous" | "run") {
    const entry = stored(target.tracker)
    if (!entry) return
    const signature = JSON.stringify(entry)
    if (signature === target.saved) return
    const now = clock.now()
    if (reason === "pause" && now - target.savedAt < SAVE_AFTER_PAUSE_MS) return
    target.saved = signature
    target.savedAt = now
    target.playingSince = null
    if (current()?.private) {
      if (entry.parts.length === 0) privateMemory.delete(target.tracker.video)
      else privateMemory.set(target.tracker.video, { length: entry.len, parts: entry.parts })
      return
    }
    void actions.progress.save(target.tracker.video, entry)
  }
  function leave() {
    const left = playback
    playback = null
    if (left) save(left, "leave")
  }

  // One message clears the tick when this tab's video changes in-app; a new page load clears it in the browser (ARC-MOD-38).
  function playing(video: VideoId) {
    if (ticked === null || video === ticked) return
    ticked = null
    actions.videoChanged()
  }
  function begin(data: Extract<PlayerData, { ad: false }>) {
    playing(data.videoId)
    leave()
    const settings = settingsFor(current(), data.videoId, new Set())
    if (!settings) return
    const title = nav?.video?.videoId === data.videoId ? nav.video.title : undefined
    const remembered = current()?.private ? privateMemory.get(data.videoId) : undefined
    const tracker = createTracker({ video: data.videoId, kind: data.player === "shorts" ? "shorts" : "videos", facts: factsOf(data), settings, ...(remembered ? { remembered } : {}) })
    const next: Playback = { tracker, player: data.player, title, saved: JSON.stringify(stored(tracker)), savedAt: clock.now(), playingSince: null,
      cantMeasureNoted: false, failures: new Map(), skippedHere: new Set() }
    playback = next
    if (current()?.private) return
    void actions.progress.load(data.videoId).then(earlier => {
      if (scope.disposed || playback !== next || !earlier) return
      next.tracker = rememberEarlier(next.tracker, { length: earlier.len, parts: earlier.parts })
      next.saved = JSON.stringify(stored(next.tracker))
      evaluate(next)
    })
  }

  function onPlayer(data: PlayerData) {
    if (scope.disposed) return
    if (data.ad) {
      if (playback && playback.player === data.player) playback.tracker = recordReading(playback.tracker, { kind: "ad" })
      return
    }
    if (!playback || playback.tracker.video !== data.videoId || playback.player !== data.player) begin(data)
    const active = playback
    if (!active || active.tracker.video !== data.videoId) { sync(); return }
    const facts = factsOf(data)
    if (!sameFacts(facts, active.tracker.facts)) active.tracker = updateTracker(active.tracker, { facts })
    const now = clock.now()
    const reading: Reading = data.seeking ? { kind: "seeking" } : !data.playing || prompting ? { kind: "paused" }
      : { kind: "playing", video: data.videoId, at: now / 1000, position: data.pos, rate: data.rate }
    active.tracker = recordReading(active.tracker, reading)
    if (reading.kind === "playing") {
      active.playingSince ??= now
      if (now - Math.max(active.playingSince, active.savedAt) >= SAVE_WHILE_PLAYING_MS) save(active, "continuous")
    } else if (reading.kind === "paused") {
      active.playingSince = null
      save(active, "pause")
    }
    evaluate(active)
  }

  function evaluate(target: Playback) {
    if (scope.disposed) return
    const { tracker, due } = evaluateGoals(target.tracker)
    target.tracker = tracker
    if (due.length) void send(target, due)
    if (tracker.measurement === "cant-measure" && !target.cantMeasureNoted) {
      target.cantMeasureNoted = true
      context.health?.cantMeasure()
      void cantMeasure(target)
    } else if (tracker.measurement === "measurable" && tracker.parts.length > 0) context.health?.measured()
    if (target === playback) { publish(); sync() }
  }

  async function channelFor(video: VideoId, due: readonly string[]): Promise<ChannelId | null> {
    const filters = current()?.filters ?? []
    if (!filters.some(row => due.includes(row.playlist) && row.state.filter.on)) return null
    const answer = await page.run<JobOf<"channelOf">>({ job: { kind: "channelOf", videoId: video } })
    if (!answer.ok || answer.data.channelId === null) return null
    if (answer.data.title) noteLabel(filters, answer.data.channelId, channelLabel(answer.data.title, answer.data.handle))
    return answer.data.channelId
  }
  // A read of a listed channel writes back only a changed label, so an unchanged one sends nothing (YT-CF-10).
  function noteLabel(filters: SiteView<"www">["filters"], channel: ChannelId, label: ReturnType<typeof channelLabel>) {
    const rows = filters.flatMap(row => row.state.filter.channels.filter(entry => entry[0] === channel))
    if (rows.length && rows.some(row => row[1] !== label.title || row[2] !== label.handle)) {
      actions.channelLabel(label.handle === undefined ? [channel, label.title] : [channel, label.title, label.handle])
    }
  }
  async function send(target: Playback, due: readonly string[]) {
    const video = target.tracker.video
    const channel = await channelFor(video, due)
    if (scope.disposed) return
    const named = target.title === undefined ? {} : { title: target.title }
    const report = await actions.add({ site: "www", video, via: "auto-add", playlists: due as PlaylistId[], channel, ...named })
    if (scope.disposed) return
    const outcomes: Readonly<Partial<Record<PlaylistId, Outcome>>> = report.kind === "report" || report.kind === "stopped" ? report.outcomes : {}
    const filters = current()?.filters ?? []
    for (const playlist of due) {
      const outcome = outcomes[playlist as PlaylistId]
      // YT-CF-18: the background decided; a skipped playlist never reached its filter.
      const filter = filters.find(row => row.playlist === playlist)?.state.filter
      if (filter?.on && outcome && outcome.kind !== "skipped") context.log?.(`filter ${playlist} ${filter.mode} ${channel ?? "unknown"} ${outcome.kind === "filtered" ? "filtered" : "allowed"}`)
      if (outcome?.kind === "failed") target.failures.set(playlist, outcome.failure)
      if (outcome?.kind === "skipped") target.skippedHere.add(playlist)
      target.tracker = recordOutcome(target.tracker, { playlist, outcome: destination(outcome) })
    }
    if (Object.values(outcomes).some(outcome => outcome?.kind === "added") && feature(current())?.options.toolbarTick) ticked = video
    if (target.skippedHere.size) target.tracker = updateTracker(target.tracker, { settings: settingsFor(current(), video, target.skippedHere) ?? {} })
    if (progress(target.tracker).hasRun) save(target, "run")
    if (report.kind === "report") announce(target, report)
    evaluate(target)
  }

  function announce(target: Playback, report: Extract<TabAddReport, { kind: "report" }>) {
    const plan = report.toast
    const session = plan ? context.feedback.use(scope) : null
    if (report.undo && (!session || plan?.action?.kind !== "undo")) actions.release(report.undo)
    if (!plan || !session) return
    const titles: Titles = { ...(target.title === undefined ? {} : { video: target.title }), playlists: report.titles }
    let action: ToastAction | null = null
    if (plan.action?.kind === "undo" && report.undo) {
      const handle = report.undo
      action = { ...session.action("undo", () => undo(session, handle)), release: () => actions.release(handle) }
    }
    else if (plan.action?.kind === "reload") action = session.action("reload", () => { document.defaultView?.location.reload(); return null })
    else if (plan.action?.kind === "settings") {
      const target = { feature: plan.action.feature, playlist: plan.action.playlist }
      action = session.action("settings", () => { actions.settings(target); return null })
    }
    session.toaster.show(session.format(plan, titles, action))
  }
  async function undo(session: Feedback, handle: UndoHandle) {
    const answer = await actions.undo(handle)
    if (answer.kind === "unanswered" || answer.kind === "failed") {
      const plan = answer.kind === "failed" && answer.toast ? answer.toast : toastPlan({ kind: "undo-failed" }, true)
      return plan ? session.format(plan, {}, null) : null
    }
    return null
  }
  async function cantMeasure(target: Playback) {
    const show = current()?.private ? !privateCantMeasureShown : await actions.cantMeasure()
    if (current()?.private) privateCantMeasureShown = true
    const text = context.text.cantMeasure(target.title)
    if (scope.disposed) return
    const session = show ? context.feedback.use(scope) : null
    if (session) session.toaster.show({ text, tone: "failure", auto: true, action: null })
    else context.log?.(text)
  }

  function onNav(data: NavData) {
    nav = data
    if (stopPlayer !== nothing) watchPrompt()
    const navigation = data.navigation
    if (navigation.kind !== "other") playing(navigation.videoId)
    if (playback && navigation.kind !== "other" && navigation.videoId !== playback.tracker.video) leave()
    if (playback && data.video?.videoId === playback.tracker.video) playback.title = data.video.title
    sync()
    publish()
  }
  function onView() {
    const active = playback
    if (active) {
      const settings = settingsFor(current(), active.tracker.video, active.skippedHere)
      if (settings) {
        const changed = JSON.stringify(settings) !== JSON.stringify(active.tracker.settings)
        if (changed) active.tracker = updateTracker(active.tracker, { settings })
        evaluate(active)
        return
      }
      leave()
    }
    sync()
    publish()
  }

  let stopNav: Dispose = nothing
  scope.add(page.onState(state => {
    if (scope.disposed) return
    ready = state.kind === "ready"
    if (!ready) {
      stopNav(); stopNav = nothing
      leave(); sync()
      return
    }
    if (stopNav === nothing) stopNav = page.watch("nav", onNav)
    sync()
  }))
  view.subscribe(onView)
  scope.on(document, "visibilitychange", () => { if (document.visibilityState === "hidden" && playback) save(playback, "pause") })
  scope.on(document.defaultView ?? document, "pagehide", () => leave())
  scope.add(() => { stopNav(); stopNav = nothing; const stop = stopPlayer; stopPlayer = nothing; stop(); stopPrompt(); leave(); context.thisVideo?.(null) })
  publish()
}

export const autoAdd: FeatureDefinition<"www", AutoAddServices> = { id: "auto-add", start }
