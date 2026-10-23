import type { AutoAddPlaylist, VideoId } from "../../../shared/model"

export type Parts = readonly (readonly [start: number, end: number])[]
export type RememberedProgress = { readonly length: number; readonly parts: Parts }
export type PlaybackFacts = {
  readonly content: "video" | "clip" | "made-for-kids"
  readonly duration: number | null
  readonly listedDuration: number | null
  readonly isPostLiveDvr?: boolean
  readonly isLive?: boolean
  readonly isUpcoming?: boolean
  readonly isLiveContent?: boolean
}
export type TrackerSettings = {
  readonly playlists: readonly Readonly<AutoAddPlaylist>[]
  readonly defaultPct: number
  readonly paused: boolean
  readonly skipped: readonly AutoAddPlaylist["pl"][]
}
type Playing = {
  readonly kind: "playing"
  readonly video: VideoId
  readonly at: number
  readonly position: number
  readonly rate: number
}
export type Reading = Playing | { readonly kind: "paused" | "buffering" | "seeking" | "ad" | "ended" }
export type DestinationOutcome = "added" | "already-in" | "filtered" | "failed" | "skipped"
type DestinationRun =
  | { readonly playlist: string; readonly kind: "in-flight" }
  | { readonly playlist: string; readonly kind: "settled"; readonly outcome: Exclude<DestinationOutcome, "skipped"> }

export type Tracker = {
  readonly video: VideoId
  readonly kind: "videos" | "shorts"
  readonly facts: PlaybackFacts
  readonly settings: TrackerSettings
  readonly measurement: "measurable" | "cant-measure"
  readonly remembered: RememberedProgress | null
  readonly parts: Parts
  readonly last: Reading | null
  readonly runs: readonly DestinationRun[]
}

export function createTracker(init: {
  video: VideoId
  kind: Tracker["kind"]
  facts: PlaybackFacts
  settings: TrackerSettings
  remembered?: RememberedProgress
}): Tracker {
  return updateTracker({
    video: init.video,
    kind: init.kind,
    facts: { ...init.facts },
    settings: copySettings(init.settings),
    measurement: "measurable",
    remembered: init.remembered ? { length: init.remembered.length, parts: merge(init.remembered.parts) } : null,
    parts: [],
    last: null,
    runs: [],
  }, {})
}

export function updateTracker(tracker: Tracker, update: {
  facts?: PlaybackFacts
  settings?: Partial<TrackerSettings>
}): Tracker {
  const facts = update.facts ? { ...update.facts } : tracker.facts
  const settings = update.settings ? copySettings({ ...tracker.settings, ...update.settings }) : tracker.settings
  const disagreement = facts.duration !== null && facts.listedDuration !== null &&
    Math.abs(facts.duration - facts.listedDuration) > 2
  const measurement = disagreement ? "cant-measure" : tracker.measurement
  const remembered = tracker.remembered && facts.duration !== null &&
    Math.abs(tracker.remembered.length - facts.duration) > 2 ? null : tracker.remembered
  const next: Tracker = {
    ...tracker, facts, settings, measurement, remembered,
    parts: measurement === "cant-measure" ? [] : tracker.parts,
    last: tracker.last,
  }
  const interrupted = update.facts !== undefined || settings.paused !== tracker.settings.paused || !canCount(next)
  return interrupted && next.last?.kind === "playing" ? { ...next, last: null } : next
}

export function recordReading(tracker: Tracker, reading: Reading): Tracker {
  if (reading.kind !== "playing") return { ...tracker, last: { ...reading } }
  if (reading.video !== tracker.video || !canCount(tracker)) return { ...tracker, last: null }
  const previous = tracker.last
  const next = { ...tracker, last: { ...reading } }
  if (previous?.kind !== "playing") return next
  const elapsed = reading.at - previous.at
  const distance = reading.position - previous.position
  if (elapsed <= 0 || distance <= 0 || distance > elapsed * previous.rate + 1) return next
  return { ...next, parts: merge([...tracker.parts, [previous.position, reading.position]]) }
}

export function evaluateGoals(tracker: Tracker): { tracker: Tracker; due: readonly string[] } {
  const duration = tracker.facts.duration
  if (!canCount(tracker) || duration === null || tracker.last?.kind === "ad") return { tracker, due: [] }
  const counted = countedSeconds(tracker)
  const due = eligible(tracker)
    .filter(playlist => !tracker.settings.skipped.includes(playlist.pl) &&
      !tracker.runs.some(run => run.playlist === playlist.pl) &&
      counted >= goal(duration, playlist.pct ?? tracker.settings.defaultPct))
    .map(playlist => playlist.pl)
  const next: Tracker = { ...tracker, runs: [...tracker.runs, ...due.map((playlist): DestinationRun => ({ playlist, kind: "in-flight" }))] }
  return { tracker: !needsSamples(next, counted) && next.last?.kind === "playing" ? { ...next, last: null } : next, due }
}

export function recordOutcome(tracker: Tracker, result: { playlist: string; outcome: DestinationOutcome }): Tracker {
  if (!tracker.runs.some(run => run.playlist === result.playlist && run.kind === "in-flight")) return tracker
  const runs = tracker.runs.filter(run => run.playlist !== result.playlist)
  if (result.outcome === "skipped") return { ...tracker, runs }
  return { ...tracker, runs: [...runs, { playlist: result.playlist, kind: "settled", outcome: result.outcome }] }
}

export function progress(tracker: Tracker): {
  counted: number
  percentage: number | null
  needsSamples: boolean
  hasRun: boolean
  remembered: RememberedProgress | null
} {
  const counted = countedSeconds(tracker)
  const duration = tracker.facts.duration
  const playlists = eligible(tracker)
  const hasRun = playlists.length > 0 && playlists.every(playlist => tracker.runs.some(run =>
    run.playlist === playlist.pl && run.kind === "settled" &&
    (run.outcome === "added" || run.outcome === "already-in")))
  return {
    counted,
    percentage: duration === null ? null : counted / duration * 100,
    needsSamples: needsSamples(tracker, counted),
    hasRun,
    remembered: hasRun ? null : tracker.measurement === "cant-measure" || duration === null
      ? tracker.remembered
      : { length: duration, parts: playedParts(tracker) },
  }
}

function goal(duration: number, pct: number): number {
  return Math.min(duration >= 3 ? duration - 2 : duration, Math.max(1, pct / 100 * duration))
}

function eligible(tracker: Tracker): readonly Readonly<AutoAddPlaylist>[] {
  return tracker.settings.playlists.filter(playlist => playlist.takes === "both" || playlist.takes === tracker.kind)
}

function canCount(tracker: Tracker): boolean {
  const facts = tracker.facts
  if (tracker.settings.paused || tracker.measurement === "cant-measure" || facts.content !== "video") return false
  if (facts.isPostLiveDvr || facts.isLive || facts.isUpcoming) return false
  if (facts.isLiveContent && facts.duration === null) return false
  return eligible(tracker).length > 0
}

function needsSamples(tracker: Tracker, counted: number): boolean {
  const duration = tracker.facts.duration
  return canCount(tracker) && eligible(tracker).some(playlist =>
    !tracker.runs.some(run => run.playlist === playlist.pl) &&
    (duration === null || counted < goal(duration, playlist.pct ?? tracker.settings.defaultPct)))
}

function playedParts(tracker: Tracker): Parts {
  const parts = merge([...(tracker.remembered?.parts ?? []), ...tracker.parts])
  const duration = tracker.facts.duration
  return duration === null ? parts : parts
    .map(([start, end]): readonly [number, number] => [start, Math.min(end, duration)])
    .filter(([start, end]) => end > start)
}

function countedSeconds(tracker: Tracker): number {
  return playedParts(tracker).reduce((sum, [start, end]) => sum + end - start, 0)
}

function merge(parts: Parts): Parts {
  const merged: [number, number][] = []
  for (const [start, end] of [...parts].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1)
    if (last && start - last[1] <= 1) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

function copySettings(settings: TrackerSettings): TrackerSettings {
  return { ...settings, playlists: settings.playlists.map(playlist => ({ ...playlist })), skipped: [...settings.skipped] }
}
