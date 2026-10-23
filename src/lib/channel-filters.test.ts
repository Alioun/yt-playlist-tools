import { describe, expect, it } from "vitest"
import { addListedChannel, anyFilterOn, clearsList, filterSetting, isFilteredOut, listChannelIn, pruneLabels, refreshListedLabel, removeListedChannel, setFilterSetting, type FilterState } from "@/lib/channel-filters"
import type { ChannelFilter } from "@/lib/storage"
const channel = { channelId: "UCabcdefghijklmnopqrstuv", title: "Channel", handle: "@channel" }
const filter: ChannelFilter = { mode: "allow", enabled: true, channels: [channel.channelId] }

describe("channel-filter rules", () => {
  it("treats unknown channels conservatively for allowlists", () => {
    expect(isFilteredOut(filter, null)).toBe(true)
    expect(isFilteredOut({ ...filter, mode: "deny" }, null)).toBe(false)
    expect(isFilteredOut(filter, channel.channelId)).toBe(false)
    expect(isFilteredOut({ ...filter, mode: "deny" }, channel.channelId)).toBe(true)
    expect(isFilteredOut({ ...filter, enabled: false }, null)).toBe(false)
    expect(isFilteredOut(undefined, channel.channelId)).toBe(false)
  })
  it("only asks to clear a nonempty list when switching its mode", () => {
    expect(clearsList(filter, "deny")).toBe(true)
    expect(clearsList(filter, "off")).toBe(false)
    expect(clearsList(filter, "allow")).toBe(false)
    expect(clearsList({ ...filter, enabled: false }, "deny")).toBe(true)
    expect(filterSetting({ ...filter, enabled: false })).toBe("off")
    expect(anyFilterOn({ PL1: filter }, ["PLother"])).toBe(false)
    expect(anyFilterOn({ PL1: filter }, ["PL1"])).toBe(true)
  })
})

describe("pure account setup changes", () => {
  const initial: FilterState = { filters: { PL1: filter }, labels: { [channel.channelId]: channel } }
  it("keeps off lists and restores them in the same mode", () => {
    const off = setFilterSetting(initial, "PL1", "off")
    expect(off.filters.PL1).toEqual({ ...filter, enabled: false })
    expect(setFilterSetting(off, "PL1", "allow").filters.PL1).toEqual(filter)
    expect(initial.filters.PL1?.enabled).toBe(true)
  })
  it("clears the previous mode's channels and orphan labels", () => {
    const changed = setFilterSetting(initial, "PL1", "deny")
    expect(changed.filters.PL1).toEqual({ mode: "deny", enabled: true, channels: [] })
    expect(changed.labels).toEqual({})
  })
  it("adds channels once and prunes their label only after their last use", () => {
    const added = listChannelIn(initial, "PL2", "deny", channel)
    const twice = addListedChannel(added, "PL2", channel)
    expect(twice.filters.PL2?.channels).toEqual([channel.channelId])
    const removed = removeListedChannel(twice, "PL2", channel.channelId)
    expect(removed.labels[channel.channelId]).toEqual({ title: channel.title, handle: channel.handle })
    expect(removeListedChannel(removed, "PL1", channel.channelId).labels).toEqual({})
  })
  it("refreshes only listed labels and keeps a known handle", () => {
    const refreshed = refreshListedLabel(initial, { channelId: channel.channelId, title: "New title" })
    expect(refreshed.labels[channel.channelId]).toEqual({ title: "New title", handle: "@channel" })
    expect(refreshListedLabel(initial, { channelId: "other", title: "Unlisted" })).toBe(initial)
    expect(pruneLabels({}, initial.labels)).toEqual({})
  })
})
