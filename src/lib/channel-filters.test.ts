import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  addListedChannel,
  anyFilterOn,
  isFilteredOut,
  pruneLabels,
  removeListedChannel,
  resolveVideoChannel,
  setDenylistEnabled
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

beforeEach(() => {
  vi.mocked(fetchVideoChannel).mockReset()
})

describe("isFilteredOut", () => {
  it("blocks a listed channel on a denylist that is on", () => {
    expect(isFilteredOut(deny(["UClofi"]), "UClofi")).toBe(true)
  })

  it("lets other channels through", () => {
    expect(isFilteredOut(deny(["UClofi"]), "UCother")).toBe(false)
  })

  it("lets everything through when the filter is off, list or not", () => {
    expect(isFilteredOut(deny(["UClofi"], false), "UClofi")).toBe(false)
  })

  it("lets everything through when the playlist has no filter", () => {
    expect(isFilteredOut(undefined, "UClofi")).toBe(false)
  })

  it("lets an unknown channel through a denylist", () => {
    expect(isFilteredOut(deny(["UClofi"]), null)).toBe(false)
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
    await setDenylistEnabled("PL1", true)
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

    const off = await setDenylistEnabled("PL1", false)
    expect(off.filters.PL1).toEqual(deny(["UClofi"], false))
    expect(off.labels).toHaveProperty("UClofi")

    const on = await setDenylistEnabled("PL1", true)
    expect(on.filters.PL1).toEqual(deny(["UClofi"]))
  })
})
