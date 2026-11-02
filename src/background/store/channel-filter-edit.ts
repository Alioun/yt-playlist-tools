import { decodeFilter, defaultFilter } from "../../shared/model"
import { normalizeFilterForWrite } from "../../shared/model/normalize"
import type { Filter } from "../../shared/model"

type Snapshot<T> = T extends object
  ? { readonly [P in keyof T]: Snapshot<T[P]> }
  : T

export type FilterSettingInput = {
  readonly current: Snapshot<Filter> | undefined
  readonly desired: Readonly<Pick<Filter, "mode" | "on">>
  readonly clearListedChannels: "not-confirmed" | "confirmed"
}

export type FilterSettingResult =
  | { readonly kind: "unchanged" }
  | { readonly kind: "confirmation-required" }
  | { readonly kind: "changed"; readonly filter: Filter }

export function changeFilterSetting(input: FilterSettingInput): FilterSettingResult {
  const current = input.current ?? defaultFilter()
  const { desired } = input
  if (current.mode === desired.mode && current.on === desired.on) return { kind: "unchanged" }
  const modeChanged = current.mode !== desired.mode
  if (modeChanged && current.channels.length > 0 && input.clearListedChannels !== "confirmed") {
    return { kind: "confirmation-required" }
  }
  return {
    kind: "changed",
    filter: decodeFilter({ ...current, mode: desired.mode, on: desired.on, channels: modeChanged ? [] : current.channels })
  }
}

/** One listed channel as stored: its `UC…` ID, title and, when it has one, its @handle. */
export type ChannelLabel = readonly [id: string, title: string, handle?: string]
export type FilterChannelInput = {
  readonly current: Snapshot<Filter> | undefined
  readonly channel: ChannelLabel
  readonly action: "list" | "unlist"
  /** A "this channel" control names its mode (YT-CF-15). The editor lists in the filter's own mode, leaving its switch alone (YT-CF-14). */
  readonly mode: Filter["mode"] | null
  readonly clearListedChannels: "not-confirmed" | "confirmed"
}
export type FilterChannelResult = FilterSettingResult | { readonly kind: "invalid" }

const entry = (channel: ChannelLabel): Filter["channels"][number] => channel[2] === undefined ? [channel[0], channel[1]] : [channel[0], channel[1], channel[2]]
const sameLabel = (left: Snapshot<Filter["channels"][number]>, right: ChannelLabel) => left[1] === right[1] && left[2] === right[2]
// A stored row may carry fields a newer browser added after the handle, so a relabel keeps them (SYNC-22).
function relabel(row: Snapshot<Filter["channels"][number]>, channel: ChannelLabel): Filter["channels"][number] {
  const next = [...row] as Filter["channels"][number]
  next[1] = channel[1]
  if (channel[2] !== undefined) next[2] = channel[2]
  else if (next.length === 3) next.pop()
  return next
}

/**
 * Lists or unlists one channel. With the filter off, its remembered mode's control turns it on and keeps the kept
 * channels; the other mode's control, over kept channels, needs confirming and then starts a list of just this channel.
 * With the filter on, only its own mode's control acts. Listing a channel again refreshes its label (YT-CF-10).
 */
export function changeFilterChannel(input: FilterChannelInput): FilterChannelResult {
  const current = input.current ?? defaultFilter()
  const [id] = input.channel
  const index = current.channels.findIndex(row => row[0] === id)
  const channels = current.channels.map(row => [...row] as Filter["channels"][number])
  if (input.action === "unlist") {
    if (index < 0) return { kind: "unchanged" }
    return { kind: "changed", filter: decodeFilter({ ...current, channels: channels.filter(row => row[0] !== id) }) }
  }
  const mode = input.mode ?? current.mode
  if (current.on && mode !== current.mode) return { kind: "invalid" }
  const on = input.mode === null ? current.on : true
  if (mode !== current.mode && current.channels.length > 0) {
    if (input.clearListedChannels !== "confirmed") return { kind: "confirmation-required" }
    return { kind: "changed", filter: decodeFilter({ mode, on, channels: [entry(input.channel)] }) }
  }
  const listed = index >= 0 ? channels.map((row, at) => at === index ? relabel(row, input.channel) : row) : [...channels, entry(input.channel)]
  if (index >= 0 && on === current.on && mode === current.mode && sameLabel(current.channels[index]!, input.channel)) return { kind: "unchanged" }
  return { kind: "changed", filter: decodeFilter({ ...current, mode, on, channels: listed }) }
}

/** A read of a listed channel writes only when its title or @handle changed (YT-CF-10). */
export function refreshChannelLabel(current: Snapshot<Filter> | undefined, channel: ChannelLabel): FilterSettingResult {
  const index = current?.channels.findIndex(row => row[0] === channel[0]) ?? -1
  if (!current || index < 0 || sameLabel(current.channels[index]!, channel)) return { kind: "unchanged" }
  // Stored labels are cut to 100 and 30 characters, so a long title compares by its stored form.
  const before = normalizeFilterForWrite(decodeFilter(current))
  const after = normalizeFilterForWrite(decodeFilter({ ...current, channels: current.channels.map((row, at) => at === index ? relabel(row, channel) : [...row]) }))
  return JSON.stringify(before) === JSON.stringify(after) ? { kind: "unchanged" } : { kind: "changed", filter: after }
}
