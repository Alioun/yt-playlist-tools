import type { ChannelId, Filter } from "../model"

export type FilterDecision = "pass" | "filtered" | "filtered-unknown-channel"

export function decide(filter: Filter | undefined, channel: ChannelId | null): FilterDecision {
  if (!filter?.on) return "pass"
  if (channel === null) return filter.mode === "allow" ? "filtered-unknown-channel" : "pass"
  const listed = filter.channels.some(([id]) => id === channel)
  return listed === (filter.mode === "allow") ? "pass" : "filtered"
}
