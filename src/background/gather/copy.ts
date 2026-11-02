import type { GatherLine, GatherLineAction } from "../../shared/contracts/ui-gather"
import type { I18n } from "../../shared/i18n"
import type { Failed, GatherResult, GatherUndoResult } from "./gather"

/** What "Last gather" names (YT-GT-32): how many videos went where, when, and the gather Undo would undo while it's offered. */
export type GatherSummary = {
  readonly id: string
  readonly at: number
  readonly auto: boolean
  readonly count: number
  readonly destination: { readonly kind: "player" | "queue" } | { readonly kind: "playlist"; readonly title: string }
  readonly undo: boolean
}
export type CopyContext = { readonly i18n: I18n; readonly account: string; readonly now: number }

const units: readonly [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]]
function ago(i18n: I18n, at: number, now: number): string {
  const elapsed = Math.max(0, now - at)
  for (const [unit, size] of units) if (elapsed >= size) return i18n.relative(-Math.floor(elapsed / size), unit)
  return i18n.relative(0, "minute")
}
const line = (text: string, tone: GatherLine["tone"], action: GatherLineAction | null = null): GatherLine => ({ text, tone, action })
const n = (i18n: I18n, count: number) => i18n.number(count)

// The failed videos' sentence: each failure keeps its own videos' tabs open (YT-GT-20, YT-GT-33).
function unsaved(i18n: I18n, failed: readonly Failed[]): string | null {
  if (!failed.length) return null
  const count = n(i18n, failed.length), one = i18n.plural(failed.length) === "one"
  if (failed.every(({ failure }) => failure === "refused")) return i18n.message(one ? "gather_unsavedRefused_one" : "gather_unsavedRefused_other", { count })
  if (failed.some(({ failure }) => failure === "rate-limited")) return i18n.message(one ? "gather_unsavedRateLimited_one" : "gather_unsavedRateLimited_other", { count })
  return i18n.message(one ? "gather_unsaved_one" : "gather_unsaved_other", { count })
}

/** A playlist gather's report, saves first (YT-GT-19). `surface` picks the toast's words or the popup row's. */
function playlistText(result: Extract<GatherResult, { kind: "playlist" }>, context: CopyContext, surface: "row" | "toast"): GatherLine {
  const { i18n } = context
  const playlist = result.title
  const whole = result.failed.length > 0 && result.saved === 0 && result.already === 0
  if (whole && result.failed.every(({ failure }) => failure === "missing")) return line(i18n.message("gather_missing", { playlist }), "failure", { kind: "choose" })
  if (whole && result.failed.every(({ failure }) => failure === "full")) return line(i18n.message("gather_full", { playlist }), "failure", { kind: "choose" })
  const count = n(i18n, result.saved), one = i18n.plural(result.saved) === "one"
  const closed = result.closed > 0
  const first = surface === "toast"
    ? result.auto ? i18n.message(one ? "gather_toastAuto_one" : "gather_toastAuto_other", { count, playlist })
      : closed ? i18n.message(one ? "gather_toastClosed_one" : "gather_toastClosed_other", { count, playlist })
        : i18n.message(one ? "gather_toast_one" : "gather_toast_other", { count, playlist })
    : result.auto ? i18n.message(one ? "gather_autoRow_one" : "gather_autoRow_other", { count, playlist, when: ago(i18n, result.at, context.now) })
      : closed ? i18n.message(one ? "gather_savedClosed_one" : "gather_savedClosed_other", { count, playlist })
        : i18n.message(one ? "gather_saved_one" : "gather_saved_other", { count, playlist })
  const already = result.already > 0 ? i18n.message(i18n.plural(result.already) === "one" ? "gather_alreadyIn_one" : "gather_alreadyIn_other", { count: n(i18n, result.already) }) : null
  const failure = unsaved(i18n, result.failed)
  const text = [first, already, failure].filter((part): part is string => part !== null).join(" ")
  const action: GatherLineAction | null = failure && result.retry && surface === "row" ? { kind: "retry", id: result.id }
    : result.undo ? { kind: "undo", id: result.undo } : null
  return line(text, failure ? "failure" : "confirmation", action)
}

/** A gather's result in YT-GT-32 and YT-GT-33's words. Null for answers the row doesn't put in words: off, busy and stopped. */
export function resultLine(result: GatherResult, context: CopyContext, surface: "row" | "toast" = "row"): GatherLine | null {
  const { i18n } = context
  switch (result.kind) {
    case "player":
      return result.confirmed
        ? line(i18n.message(i18n.plural(result.count) === "one" ? "gather_player_one" : "gather_player_other", { count: n(i18n, result.count) }), "confirmation")
        : line(i18n.message("gather_playerUnconfirmed"), "failure")
    case "queue": {
      if (result.outcome === "not-loaded") return line(i18n.message("gather_queueTabTimeout"), "failure")
      if (result.outcome === "not-confirmed") return line(i18n.message("gather_queueUnconfirmed", { count: n(i18n, result.count) }), "failure")
      if (result.left > 0) return line(i18n.message(i18n.plural(result.left) === "one" ? "gather_queueOverflow_one" : "gather_queueOverflow_other", { count: n(i18n, result.left) }), "confirmation")
      if (result.why === "player-takes-50") return line(i18n.message("gather_playerOverflow", { count: n(i18n, result.count) }), "confirmation")
      return line(i18n.message(i18n.plural(result.count) === "one" ? "gather_queue_one" : "gather_queue_other", { count: n(i18n, result.count) }), "confirmation")
    }
    case "playlist": return playlistText(result, context, surface)
    case "no-videos": return line(i18n.message("gather_noTabs"), "muted")
    case "choose": return line(i18n.message("gather_noPlaylist", { account: context.account }), "muted", { kind: "choose" })
    case "signed-out": return line(i18n.message("gather_signedOut"), "failure", { kind: "sign-in" })
    case "no-tab": return line(i18n.message("gather_noYouTubeTab"), "failure", { kind: "open-youtube" })
    case "unhealthy": return line(i18n.message(result.to === "player" ? "gather_broken_player" : result.to === "queue" ? "gather_broken_queue" : "gather_broken_playlist"), "failure")
    case "unavailable": return line(i18n.message("gather_unavailable"), "failure")
    case "off": case "busy": case "stopped": return null
  }
}

/** Undo's answer (YT-GT-21). `undone` names what the gather saved; any failure reads "Couldn't undo." and reopened nothing. */
export function undoLine(result: GatherUndoResult, undone: { readonly count: number; readonly title: string } | null, i18n: I18n): GatherLine {
  if (result.kind !== "undone") return line(i18n.message("gather_undoFailed"), "failure")
  if (!undone || undone.count === 0) return line(i18n.message(i18n.plural(result.reopened) === "one" ? "gather_reopened_one" : "gather_reopened_other", { count: n(i18n, result.reopened) }), "confirmation")
  return line(i18n.message(i18n.plural(undone.count) === "one" ? "gather_undone_one" : "gather_undone_other", { count: n(i18n, undone.count), playlist: undone.title }), "confirmation")
}

/** The row's progress: membership reads one video at a time, then the adds (YT-GT-19). */
export function progressLine(done: number, total: number, i18n: I18n): GatherLine {
  return done < total
    ? line(i18n.message("gather_checking", { index: n(i18n, done + 1), count: n(i18n, total) }), "muted")
    : line(i18n.message(i18n.plural(total) === "one" ? "gather_saving_one" : "gather_saving_other", { count: n(i18n, total) }), "muted")
}

/** The idle line (UI-POP-37): the last gather, with Undo while it's offered. An automatic gather says it ran by itself. */
export function lastLine(summary: GatherSummary, context: CopyContext): GatherLine {
  const { i18n } = context
  const count = n(i18n, summary.count), one = i18n.plural(summary.count) === "one", when = ago(i18n, summary.at, context.now)
  const destination = summary.destination.kind === "playlist" ? summary.destination.title
    : i18n.message(summary.destination.kind === "player" ? "gather_destination_player" : "gather_destination_queue")
  const text = summary.auto && summary.destination.kind === "playlist"
    ? i18n.message(one ? "gather_autoRow_one" : "gather_autoRow_other", { count, playlist: destination, when })
    : i18n.message(one ? "gather_last_one" : "gather_last_other", { count, destination, when })
  return line(text, "muted", summary.undo ? { kind: "undo", id: summary.id } : null)
}

export function waitingLine(i18n: I18n): GatherLine {
  return line(i18n.message("gather_waiting"), "muted")
}
