import type { PlaylistId } from "../model"
import type { Action, ExplicitOutcome, Failure, Outcome, Report, ToastPlan } from "./outcomes"
import { toastPlan } from "./outcomes"

declare const playlist: PlaylistId
const shown = { tab: new Set<string>(), session: new Set<string>() }

export const accepted: Report[] = [
  { kind: "auto-add", outcomes: { [playlist]: { kind: "filtered", decision: "filtered-unknown-channel" } }, shown },
  { kind: "auto-add", outcomes: { [playlist]: { kind: "failed", failure: "membership-unreadable" } }, shown },
  { kind: "shortcut", outcomes: { [playlist]: { kind: "failed", failure: "paused" } } },
  { kind: "pending", playlists: [playlist] },
  { kind: "no-playlist" },
  { kind: "removed", playlist },
  { kind: "undo-failed" },
  { kind: "picker", outcomes: { [playlist]: { kind: "failed", failure: "missing" } } }
]

export const rejected: Report[] = [
  // @ts-expect-error Removal confirmation names the playlist.
  { kind: "removed" },
  // @ts-expect-error Filters and session skips belong to auto-add only.
  { kind: "picker", outcomes: { [playlist]: { kind: "filtered", decision: "filtered" } } },
  // @ts-expect-error Explicit adds have no session skip.
  { kind: "quick-save", outcomes: { [playlist]: { kind: "skipped" } } },
  // @ts-expect-error Explicit adds go ahead when membership can't be read.
  { kind: "shortcut", outcomes: { [playlist]: { kind: "failed", failure: "membership-unreadable" } } },
  // @ts-expect-error Auto-add must carry its shown-once memory.
  { kind: "auto-add", outcomes: {} },
  // @ts-expect-error Explicit actions carry no suppression memory.
  { kind: "picker", outcomes: {}, shown },
  // @ts-expect-error A filter pass is not an outcome.
  { kind: "auto-add", outcomes: { [playlist]: { kind: "filtered", decision: "pass" } }, shown }
]

// @ts-expect-error Failures are the settled table's, not free strings.
export const invented: Failure = "STATUS_FAILED"
// @ts-expect-error Settings deep links exist only for features that choose playlists.
export const quickSaveSettings: Action = { kind: "settings", feature: "quick-save", playlist }
// @ts-expect-error A playlist key is a validated PlaylistId.
export const unbranded: Action = { kind: "try-again", playlists: ["PLraw"] }

export const outcome: Outcome = { kind: "added" } satisfies ExplicitOutcome
export const plan: ToastPlan | null = toastPlan({ kind: "no-playlist" }, false)
// @ts-expect-error A toast has one action, never a list of them.
export const twoActions: ToastPlan["action"] = [{ kind: "undo" }, { kind: "reload" }]
// @ts-expect-error Feedback is the feature's Show feedback switch, not an options bag.
toastPlan({ kind: "no-playlist" }, { feedback: true })
