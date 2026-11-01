import { objectShape } from "./object-shape"

export type MusicAdEvidence = "adShowing" | "adActive" | "presentingPlayerType"
export type MusicAdFailure = {
  ok: false
  reason: "unavailable"
  detail: { kind: "music-ad"; evidence: MusicAdEvidence }
  http?: never
  status?: never
}

export function isMusicAdFailure(value: unknown): value is MusicAdFailure {
  return objectShape(value, {
    ok: v => v === false,
    reason: v => v === "unavailable",
    detail: v => objectShape(v, {
      kind: kind => kind === "music-ad",
      evidence: evidence => evidence === "adShowing" || evidence === "adActive" || evidence === "presentingPlayerType"
    })
  })
}
