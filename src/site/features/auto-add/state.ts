import type { Failure } from "../../../shared/rules/outcomes"
import { progress, type Tracker } from "./tracker"

/**
 * YT-AA-38's one state per playback, which the watch-page button and the popup's This video show. Percentages are
 * whole numbers. An ad changes nothing, because the tracker keeps its counts while one plays.
 */
export type AutoAddState =
  | { readonly kind: "not-tracked" | "paused" | "live" | "cant-measure" | "skipped" }
  | { readonly kind: "counting"; readonly goal: number; readonly watched: number | null }
  | { readonly kind: "partly"; readonly added: readonly string[]; readonly pending: readonly string[]; readonly goal: number }
  | { readonly kind: "added" | "already-in"; readonly playlists: readonly string[] }
  | { readonly kind: "failed"; readonly playlists: readonly string[]; readonly offline: boolean }

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
