import type { AutoAddState, PlaylistProgress, ThisVideo } from "../../../shared/contracts/this-video"
import type { Failure } from "../../../shared/rules/outcomes"
import { progress, type Tracker } from "./tracker"

export type { AutoAddState } from "../../../shared/contracts/this-video"
export function autoAddState(input: {
  readonly tracker: Tracker | null
  readonly paused: boolean
  readonly failures: ReadonlyMap<string, Failure>
}): AutoAddState {
  if (input.paused) return { kind: "paused" }
  const tracker = input.tracker
  if (!tracker) return { kind: "not-tracked" }
  const facts = tracker.facts
  if (facts.content !== "video") return { kind: "not-tracked" }
  if (facts.isPostLiveDvr || facts.isLive || facts.isUpcoming || facts.isLiveContent && facts.duration === null) return { kind: "live" }
  const eligible = tracker.settings.playlists.filter(playlist => playlist.takes === "both" || playlist.takes === tracker.kind)
  if (eligible.length === 0) return { kind: "not-tracked" }
  if (tracker.measurement === "cant-measure") return { kind: "cant-measure" }
  const settled = new Map<string, "added" | "already-in" | "filtered" | "failed">()
  for (const run of tracker.runs) if (run.kind === "settled") settled.set(run.playlist, run.outcome)
  const failed = eligible.map(playlist => playlist.pl).filter(id => settled.get(id) === "failed")
  if (failed.length) return { kind: "failed", playlists: failed, offline: failed.every(id => input.failures.get(id) === "not-sent") }
  const pending = eligible.filter(playlist => !tracker.runs.some(run => run.playlist === playlist.pl))
  const done = eligible.map(playlist => playlist.pl).filter(id => settled.get(id) === "added" || settled.get(id) === "already-in")
  if (pending.length && pending.every(playlist => tracker.settings.skipped.includes(playlist.pl))) return { kind: "skipped" }
  const percent = (playlist: (typeof eligible)[number]) => playlist.pct ?? tracker.settings.defaultPct
  const waiting = pending.filter(playlist => !tracker.settings.skipped.includes(playlist.pl))
  if (waiting.length) {
    const goal = Math.min(...waiting.map(percent))
    if (done.length) return { kind: "partly", added: done, pending: waiting.filter(playlist => percent(playlist) === goal).map(playlist => playlist.pl), goal }
    const watched = progress(tracker).percentage
    return { kind: "counting", goal, watched: watched === null ? null : Math.min(100, Math.floor(watched)) }
  }
  if (pending.length || eligible.some(playlist => !settled.has(playlist.pl))) {
    return done.length ? { kind: "partly", added: done, pending: [], goal: 100 } : { kind: "counting", goal: 100, watched: null }
  }
  const added = eligible.map(playlist => playlist.pl).filter(id => settled.get(id) === "added")
  if (added.length) return { kind: "added", playlists: added }
  return done.length ? { kind: "already-in", playlists: done } : { kind: "not-tracked" }
}

/**
 * This playback as the popup's This video and the watch-page button show it (UI-POP-12 to UI-POP-14, UI-YT-18):
 * the state, the share watched, and each taking playlist's goal and outcome. The channel joins when a reader asks.
 */
export function thisVideo(input: { readonly tracker: Tracker; readonly state: AutoAddState; readonly title: string | null }): ThisVideo {
  const { tracker, state } = input
  const settled = new Map<string, PlaylistProgress["outcome"]>()
  for (const run of tracker.runs) if (run.kind === "settled") settled.set(run.playlist, run.outcome)
  const playlists = tracker.settings.playlists.filter(playlist => playlist.takes === "both" || playlist.takes === tracker.kind).map((playlist): PlaylistProgress => ({
    pl: playlist.pl as PlaylistProgress["pl"], pct: playlist.pct ?? tracker.settings.defaultPct,
    outcome: settled.get(playlist.pl) ?? (tracker.settings.skipped.includes(playlist.pl) ? "skipped" : "waiting")
  }))
  const watched = progress(tracker).percentage
  return { video: tracker.video, title: input.title, state, watched: watched === null ? null : Math.min(100, Math.floor(watched)), playlists, channel: null }
}
