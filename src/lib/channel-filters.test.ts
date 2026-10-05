import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  addListedChannel,
  anyFilterOn,
  clearsList,
  filterSetting,
  isFilteredOut,
  listChannelIn,
  PAGE_READ_TIMEOUT_MS,
  pruneLabels,
  refreshListedLabel,
  removeListedChannel,
  resolveVideoChannel,
  setFilterSetting
} from "@/lib/channel-filters"
import * as store from "@/lib/storage"
import type { ChannelFilter } from "@/lib/storage"
import { fetchVideoChannel } from "@/lib/youtube"

vi.mock("@/lib/youtube", () => ({ fetchVideoChannel: vi.fn() }))

const LOFI = { channelId: "UClofi", title: "Lofi Girl" }
const deny = (channels: string[], enabled = true): ChannelFilter => ({
  mode: "deny",
  enabled,
  channels
})
const allow = (channels: string[], enabled = true): ChannelFilter => ({
  mode: "allow",
  enabled,
  channels
})

beforeEach(() => {
  vi.mocked(fetchVideoChannel).mockReset()
})

describe("isFilteredOut", () => {
  // Every combination of mode, switch and list, against a listed channel, an
  // unlisted one and an unknown one. True means the playlist is skipped.
  it.each([
    // mode     enabled  list         listed  unlisted  unknown
    ["deny",  true,  ["UClofi"], true,  false, false],
    ["deny",  true,  [],         false, false, false],
    ["deny",  false, ["UClofi"], false, false, false],
    ["deny",  false, [],         false, false, false],
    ["allow", true,  ["UClofi"], false, true,  true],
    ["allow", true,  [],         true,  true,  true],
    ["allow", false, ["UClofi"], false, false, false],
    ["allow", false, [],         false, false, false]
  ] as const)(
    "%s, on: %s, list %j: listed %s, unlisted %s, unknown %s",
    (mode, enabled, channels, listed, unlisted, unknown) => {
      const filter: ChannelFilter = { mode, enabled, channels: [...channels] }
      expect(isFilteredOut(filter, "UClofi")).toBe(listed)
      expect(isFilteredOut(filter, "UCother")).toBe(unlisted)
      expect(isFilteredOut(filter, null)).toBe(unknown)
    }
  )

  it("lets everything through when the playlist has no filter", () => {
    expect(isFilteredOut(undefined, "UClofi")).toBe(false)
    expect(isFilteredOut(undefined, null)).toBe(false)
  })
})

describe("filterSetting", () => {
  it("is the mode when on and off otherwise", () => {
    expect(filterSetting(allow(["UClofi"]))).toBe("allow")
    expect(filterSetting(deny([]))).toBe("deny")
    expect(filterSetting(allow(["UClofi"], false))).toBe("off")
    expect(filterSetting(undefined)).toBe("off")
  })
})

describe("clearsList", () => {
  it("is true for a switch into the other mode with channels listed", () => {
    expect(clearsList(deny(["UClofi"]), "allow")).toBe(true)
    expect(clearsList(allow(["UClofi"]), "deny")).toBe(true)
  })

  it("is true for turning a kept list back on in the other mode", () => {
    expect(clearsList(deny(["UClofi"], false), "allow")).toBe(true)
  })

  it("is false for the same mode, for off and for an empty list", () => {
    expect(clearsList(deny(["UClofi"], false), "deny")).toBe(false)
    expect(clearsList(deny(["UClofi"]), "off")).toBe(false)
    expect(clearsList(deny([]), "allow")).toBe(false)
    expect(clearsList(allow([], false), "deny")).toBe(false)
    expect(clearsList(undefined, "allow")).toBe(false)
  })
})

describe("anyFilterOn", () => {
  it("is false when the only filters are off or on other playlists", () => {
    const filters = { PL1: deny(["UClofi"], false), PL9: deny(["UClofi"]) }
    expect(anyFilterOn(filters, ["PL1", "PL2"])).toBe(false)
  })

  it("is true when one of the playlists has a filter switched on", () => {
    expect(anyFilterOn({ PL2: deny([]) }, ["PL1", "PL2"])).toBe(true)
  })
})

describe("resolveVideoChannel", () => {
  beforeEach(async () => {
    await store.accessToken.setValue("at")
  })

  it("asks the API on a cache miss and caches the answer in session storage", async () => {
    vi.mocked(fetchVideoChannel).mockResolvedValue(LOFI)

    await expect(resolveVideoChannel("vid")).resolves.toEqual(LOFI)

    expect(fetchVideoChannel).toHaveBeenCalledWith("vid", "at")
    await expect(store.channelCache.getValue()).resolves.toEqual({ vid: LOFI })
  })

  it("answers from the cache without calling the API", async () => {
    await store.channelCache.setValue({ vid: LOFI })

    await expect(resolveVideoChannel("vid")).resolves.toEqual(LOFI)
    expect(fetchVideoChannel).not.toHaveBeenCalled()
  })

  it("calls the API once for two lookups of the same video", async () => {
    vi.mocked(fetchVideoChannel).mockResolvedValue(LOFI)

    await resolveVideoChannel("vid")
    await resolveVideoChannel("vid")

    expect(fetchVideoChannel).toHaveBeenCalledTimes(1)
  })

  it("reports an unknown channel when the API fails, and caches nothing", async () => {
    vi.mocked(fetchVideoChannel).mockResolvedValue(null)

    await expect(resolveVideoChannel("vid")).resolves.toBeNull()
    expect(fetchVideoChannel).toHaveBeenCalledTimes(1)
    await expect(store.channelCache.getValue()).resolves.toEqual({})
  })

  it("reports an unknown channel when signed out, without calling the API", async () => {
    await store.accessToken.setValue("")

    await expect(resolveVideoChannel("vid")).resolves.toBeNull()
    expect(fetchVideoChannel).not.toHaveBeenCalled()
  })
})

describe("resolveVideoChannel with a page to read", () => {
  const PAGE = {
    videoId: "vid",
    channelId: "UClofi",
    author: "Lofi Girl",
    ownerProfileUrl: "http://www.youtube.com/@LofiGirl"
  }
  const FROM_PAGE = { ...LOFI, handle: "@LofiGirl" }

  beforeEach(async () => {
    await store.accessToken.setValue("at")
    vi.mocked(fetchVideoChannel).mockResolvedValue(LOFI)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("takes the page's answer without calling the API, and caches it with the handle", async () => {
    await expect(
      resolveVideoChannel("vid", async () => PAGE)
    ).resolves.toEqual(FROM_PAGE)

    expect(fetchVideoChannel).not.toHaveBeenCalled()
    await expect(store.channelCache.getValue()).resolves.toEqual({ vid: FROM_PAGE })
  })

  it("answers from the cache before asking the page", async () => {
    await store.channelCache.setValue({ vid: LOFI })
    const readPage = vi.fn(async () => PAGE)

    await expect(resolveVideoChannel("vid", readPage)).resolves.toEqual(LOFI)
    expect(readPage).not.toHaveBeenCalled()
  })

  it("falls back to the API when the page holds another video", async () => {
    await expect(
      resolveVideoChannel("vid", async () => ({ ...PAGE, videoId: "previous" }))
    ).resolves.toEqual(LOFI)

    expect(fetchVideoChannel).toHaveBeenCalledWith("vid", "at")
  })

  it("falls back to the API when the page has no player", async () => {
    await expect(resolveVideoChannel("vid", async () => null)).resolves.toEqual(LOFI)
    expect(fetchVideoChannel).toHaveBeenCalledTimes(1)
  })

  it("falls back to the API when asking the page fails", async () => {
    await expect(
      resolveVideoChannel("vid", () => Promise.reject(new Error("no tab")))
    ).resolves.toEqual(LOFI)
    expect(fetchVideoChannel).toHaveBeenCalledTimes(1)
  })

  it("falls back to the API when the page doesn't answer in time", async () => {
    vi.useFakeTimers()

    const lookup = resolveVideoChannel("vid", () => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(PAGE_READ_TIMEOUT_MS)

    await expect(lookup).resolves.toEqual(LOFI)
    expect(fetchVideoChannel).toHaveBeenCalledTimes(1)
  })

  it("reads the page even when signed out", async () => {
    await store.accessToken.setValue("")

    await expect(
      resolveVideoChannel("vid", async () => PAGE)
    ).resolves.toEqual(FROM_PAGE)
  })
})

describe("refreshListedLabel", () => {
  it("updates a listed channel's title and handle", async () => {
    await store.channelFilters.setValue({ PL1: deny(["UClofi"]) })
    await store.channelLabels.setValue({ UClofi: { title: "Old name" } })

    await refreshListedLabel({ ...LOFI, handle: "@LofiGirl" })

    await expect(store.channelLabels.getValue()).resolves.toEqual({
      UClofi: { title: "Lofi Girl", handle: "@LofiGirl" }
    })
  })

  it("keeps the stored handle when this lookup found none", async () => {
    await store.channelFilters.setValue({ PL1: allow(["UClofi"]) })
    await store.channelLabels.setValue({
      UClofi: { title: "Old name", handle: "@LofiGirl" }
    })

    await refreshListedLabel(LOFI)

    await expect(store.channelLabels.getValue()).resolves.toEqual({
      UClofi: { title: "Lofi Girl", handle: "@LofiGirl" }
    })
  })

  it("keeps the stored title when this lookup found none", async () => {
    await store.channelFilters.setValue({ PL1: deny(["UClofi"]) })
    await store.channelLabels.setValue({ UClofi: { title: "Lofi Girl" } })

    await refreshListedLabel({ channelId: "UClofi", title: "" })

    await expect(store.channelLabels.getValue()).resolves.toEqual({
      UClofi: { title: "Lofi Girl" }
    })
  })

  it("refreshes a channel listed only by an orphaned or switched-off filter", async () => {
    await store.channelFilters.setValue({ gone: deny(["UClofi"], false) })

    await refreshListedLabel(LOFI)

    await expect(store.channelLabels.getValue()).resolves.toEqual({
      UClofi: { title: "Lofi Girl" }
    })
  })

  it("stores no label for a channel no filter lists", async () => {
    await store.channelFilters.setValue({ PL1: deny(["UCother"]) })
    await store.channelLabels.setValue({ UCother: { title: "Other" } })

    await refreshListedLabel(LOFI)

    await expect(store.channelLabels.getValue()).resolves.toEqual({
      UCother: { title: "Other" }
    })
  })
})

describe("pruneLabels", () => {
  it("keeps labels any filter lists, orphans included, and drops the rest", () => {
    const filters = { gone: deny(["UCa"], false), PL1: deny(["UCb"]) }
    const labels = {
      UCa: { title: "A" },
      UCb: { title: "B" },
      UCc: { title: "C" }
    }

    expect(pruneLabels(filters, labels)).toEqual({
      UCa: { title: "A" },
      UCb: { title: "B" }
    })
  })
})

describe("editing a filter", () => {
  it("adding a channel lists it and stores its label", async () => {
    await setFilterSetting("PL1", "deny")
    const state = await addListedChannel("PL1", LOFI)

    expect(state.filters.PL1).toEqual(deny(["UClofi"]))
    expect(state.labels).toEqual({ UClofi: { title: "Lofi Girl" } })
    await expect(store.channelFilters.getValue()).resolves.toEqual(state.filters)
    await expect(store.channelLabels.getValue()).resolves.toEqual(state.labels)
  })

  it("does not list the same channel twice", async () => {
    await addListedChannel("PL1", LOFI)
    const state = await addListedChannel("PL1", LOFI)

    expect(state.filters.PL1?.channels).toEqual(["UClofi"])
  })

  it("removing the last use of a channel removes its label", async () => {
    await addListedChannel("PL1", LOFI)
    const state = await removeListedChannel("PL1", "UClofi")

    expect(state.filters.PL1?.channels).toEqual([])
    await expect(store.channelLabels.getValue()).resolves.toEqual({})
  })

  it("keeps the label while another playlist still lists the channel", async () => {
    await addListedChannel("PL1", LOFI)
    await addListedChannel("PL2", LOFI)
    await removeListedChannel("PL1", "UClofi")

    await expect(store.channelLabels.getValue()).resolves.toEqual({
      UClofi: { title: "Lofi Girl" }
    })
  })

  it("switching off keeps the list, and switching back on restores it", async () => {
    await addListedChannel("PL1", LOFI)

    const off = await setFilterSetting("PL1", "off")
    expect(off.filters.PL1).toEqual(deny(["UClofi"], false))
    expect(off.labels).toHaveProperty("UClofi")

    const on = await setFilterSetting("PL1", "deny")
    expect(on.filters.PL1).toEqual(deny(["UClofi"]))
  })

  it("keeps an allowlist through off and back on", async () => {
    await setFilterSetting("PL1", "allow")
    await addListedChannel("PL1", LOFI)

    await setFilterSetting("PL1", "off")
    const on = await setFilterSetting("PL1", "allow")

    expect(on.filters.PL1).toEqual(allow(["UClofi"]))
  })

  it("switching straight to the other mode clears the list and its labels", async () => {
    await addListedChannel("PL1", LOFI)

    const state = await setFilterSetting("PL1", "allow")

    expect(state.filters.PL1).toEqual(allow([]))
    await expect(store.channelLabels.getValue()).resolves.toEqual({})
  })

  it("turning a kept list back on in the other mode clears it", async () => {
    await addListedChannel("PL1", LOFI)
    await setFilterSetting("PL1", "off")

    const state = await setFilterSetting("PL1", "allow")

    expect(state.filters.PL1).toEqual(allow([]))
  })

  it("switching a playlist with no filter off stores an empty one", async () => {
    const state = await setFilterSetting("PL1", "off")

    expect(state.filters.PL1).toEqual(deny([], false))
  })
})

describe("listChannelIn", () => {
  it("switches a playlist with no filter on, listing the channel", async () => {
    const state = await listChannelIn("PL1", "allow", LOFI)

    expect(state.filters.PL1).toEqual(allow(["UClofi"]))
    expect(state.labels).toEqual({ UClofi: { title: "Lofi Girl" } })
  })

  it("keeps a kept list in the same mode", async () => {
    await store.channelFilters.setValue({ PL1: deny(["UCother"], false) })

    const state = await listChannelIn("PL1", "deny", LOFI)

    expect(state.filters.PL1).toEqual(deny(["UCother", "UClofi"]))
  })

  it("replaces a kept list in the other mode with just this channel", async () => {
    await store.channelFilters.setValue({ PL1: deny(["UCother"], false) })
    await store.channelLabels.setValue({ UCother: { title: "Other" } })

    const state = await listChannelIn("PL1", "allow", LOFI)

    expect(state.filters.PL1).toEqual(allow(["UClofi"]))
    expect(state.labels).toEqual({ UClofi: { title: "Lofi Girl" } })
  })

  it("does not list a channel twice", async () => {
    await store.channelFilters.setValue({ PL1: deny(["UClofi"], false) })

    const state = await listChannelIn("PL1", "deny", LOFI)

    expect(state.filters.PL1).toEqual(deny(["UClofi"]))
  })
})
