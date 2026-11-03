import type { SyncClock } from "./local-filter-writer"

export type SyncMutationPace = {
  nextInvocation: number
  lastMonotonic: number
  invalid: boolean
}

export function createSyncMutationPace(clock: Pick<SyncClock, "now">): SyncMutationPace {
  const now = clock.now()
  return { nextInvocation: now + 5000, lastMonotonic: now, invalid: !Number.isFinite(now) || now < 0 || now + 60000 > Number.MAX_SAFE_INTEGER }
}

export function syncMutationTime(pace: SyncMutationPace, clock: Pick<SyncClock, "now" | "wallNow">) {
  const mono = clock.now(),
    wall = clock.wallNow()
  if (!Number.isFinite(mono) || mono < pace.lastMonotonic || mono < 0 || mono + 60000 > Number.MAX_SAFE_INTEGER) pace.invalid = true
  if (pace.invalid || !Number.isSafeInteger(wall) || wall < 0 || !Number.isSafeInteger(wall + 60000)) return
  pace.lastMonotonic = mono
  return { mono, wall }
}
