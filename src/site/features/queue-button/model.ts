import type { JobOf, JobResult, QueueListId, SetVideoId } from "../../../shared/contracts"
import type { QueueButtonLabel, QueueButtonToast } from "../../../shared/copy"
import type { VideoId } from "../../../shared/model"

export type QueueEntry = { readonly listId: QueueListId; readonly setVideoId: SetVideoId }
export type QueueButtonState =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "added"; readonly entry: QueueEntry | null }
  | { readonly kind: "unconfirmed" }
  | { readonly kind: "failed" }
export type QueueAddAnswer = JobResult<JobOf<"queueAdd">>
export type QueueOutcome =
  | { readonly kind: "confirmed"; readonly quiet: boolean; readonly entry: QueueEntry | null }
  | { readonly kind: "unconfirmed"; readonly quiet: boolean; readonly cause: "page" | "deadline" }
  | { readonly kind: "failed"; readonly reason: "unavailable" | "failed" | "signedOut" | "accountChanged" }
export type QueueGlyph = "queue" | "spinner" | "check" | "pending" | "error"

export const failedForMs = 1500
export const idle: QueueButtonState = Object.freeze({ kind: "idle" })
export const busy: QueueButtonState = Object.freeze({ kind: "busy" })

export const visuals = {
  idle: { glyph: "queue", label: "idle", sends: true },
  busy: { glyph: "spinner", label: "busy", sends: false },
  added: { glyph: "check", label: "added", sends: false },
  unconfirmed: { glyph: "pending", label: "unconfirmed", sends: true },
  failed: { glyph: "error", label: "failed", sends: false }
} as const satisfies Record<QueueButtonState["kind"], { readonly glyph: QueueGlyph; readonly label: QueueButtonLabel; readonly sends: boolean }>

export function outcomeOf(answer: QueueAddAnswer): QueueOutcome {
  if (answer.ok) {
    const data = answer.data
    return data.confirmed
      ? { kind: "confirmed", quiet: data.quiet, entry: data.undo ? { listId: data.undo.listId, setVideoId: data.undo.setVideoId } : null }
      : { kind: "unconfirmed", quiet: data.quiet, cause: "page" }
  }
  if (answer.reason === "unconfirmed") return { kind: "unconfirmed", quiet: true, cause: "deadline" }
  return { kind: "failed", reason: answer.reason }
}

export function settled(outcome: QueueOutcome): QueueButtonState {
  switch (outcome.kind) {
    case "confirmed": return { kind: "added", entry: outcome.entry }
    case "unconfirmed": return { kind: "unconfirmed" }
    case "failed": return { kind: "failed" }
  }
}

export function toastOf(outcome: QueueOutcome, feedback: boolean): QueueButtonToast | null {
  switch (outcome.kind) {
    case "confirmed": return feedback && outcome.quiet ? "added" : null
    case "unconfirmed": return "unconfirmed"
    case "failed": return "failed"
  }
}

export type PageOutcomes = {
  read(video: VideoId): QueueButtonState
  write(video: VideoId, state: QueueButtonState): void
  reset(): void
  readonly revision: number
}

export function pageOutcomes(): PageOutcomes {
  let states = new Map<VideoId, QueueButtonState>()
  let revision = 0
  return {
    read: video => states.get(video) ?? idle,
    write(video, state) { if (state.kind === "idle") states.delete(video); else states.set(video, state) },
    reset() { states = new Map(); revision++ },
    get revision() { return revision }
  }
}
