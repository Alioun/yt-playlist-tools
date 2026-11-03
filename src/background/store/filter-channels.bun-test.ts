import { afterEach, expect, test } from "bun:test"
import { projectionSeed, projectionWorld, document as doc, a, alpha } from "../../../tools/fixtures/tab-projection/harness"
import { changeFilterChannel } from "./channel-filter-edit"
import type { ChannelId, PlaylistId } from "../../shared/model"

const origin = { kind: "ui", windowId: 1, incognito: false } as const
const listed = "UCAAAAAAAAAAAAAAAAAAAAAA" as ChannelId,
  other = "UCBBBBBBBBBBBBBBBBBBBBBB" as ChannelId
const kept = "PL_kept" as PlaylistId
const worlds: ReturnType<typeof projectionWorld>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.owner.dispose()
})
function world() {
  const initial = projectionSeed()
  initial.local[`doc:filter:${a}:${kept}`] = doc({ mode: "deny", on: true, channels: [[listed, "Alpha channel", "@alpha"]] })
  const created = projectionWorld(initial)
  worlds.push(created)
  return created
}
const stored = (store: ReturnType<typeof world>, playlist: PlaylistId) =>
  store.removal.state().local[`doc:filter:${a}:${playlist}`] as { gen: string; deleted?: true; data?: { mode: string; on: boolean; channels: unknown[][] } }

test("the editor lists a typed channel in the filter's own mode and a chip's ✕ unlists it (YT-CF-14)", async () => {
  const store = world()
  const list = { acct: a, playlist: alpha, channel: [other, "Beta channel", "@beta"], mode: null, clearListedChannels: "not-confirmed" } as const
  expect(await store.owner.changeFilterChannel(origin, { ...list, action: "list" })).toEqual({ kind: "result", result: { ok: true } })
  expect(stored(store, alpha).data).toMatchObject({
    mode: "allow",
    on: true,
    channels: [
      [listed, "Alpha channel", "@alpha", "never-send"],
      [other, "Beta channel", "@beta"]
    ]
  })
  expect(await store.owner.changeFilterChannel(origin, { ...list, action: "unlist" })).toEqual({ kind: "result", result: { ok: true } })
  expect(stored(store, alpha).data?.channels.map(row => row[0])).toEqual([listed])
})

test("a private window lists nothing, and a playlist the account doesn't auto-add to has no editor to list into", async () => {
  const store = world()
  const change = { acct: a, playlist: alpha, channel: [other, "Beta channel"], action: "list", mode: null, clearListedChannels: "not-confirmed" } as const
  expect(await store.owner.changeFilterChannel({ ...origin, incognito: true }, change)).toEqual({ kind: "result", result: { refused: "private" } })
  expect(await store.owner.changeFilterChannel(origin, { ...change, playlist: kept })).toEqual({ kind: "unavailable", reason: "account-context" })
})

test("a 'this channel' control on a filter that's off turns it on in its remembered mode, but the other mode needs confirming first (YT-CF-15)", () => {
  const off = { mode: "deny" as const, on: false, channels: [[listed, "Alpha channel"]] as [string, string][] }
  const ask = (mode: "allow" | "deny", confirmed = false) =>
    changeFilterChannel({ current: off, channel: [other, "Beta"], action: "list", mode, clearListedChannels: confirmed ? "confirmed" : "not-confirmed" })
  expect(ask("deny")).toEqual({
    kind: "changed",
    filter: {
      mode: "deny",
      on: true,
      channels: [
        [listed, "Alpha channel"],
        [other, "Beta"]
      ]
    }
  })
  expect(ask("allow")).toEqual({ kind: "confirmation-required" })
  expect(ask("allow", true)).toEqual({ kind: "changed", filter: { mode: "allow", on: true, channels: [[other, "Beta"]] } })
  expect(changeFilterChannel({ current: { ...off, on: true }, channel: [other, "Beta"], action: "list", mode: "allow", clearListedChannels: "confirmed" })).toEqual({ kind: "invalid" })
})

test("a fresh title or @handle for a listed channel is written into every filter that lists it, kept ones included, and an unchanged one writes nothing (YT-CF-10)", async () => {
  const store = world()
  const before = store.writes().length
  expect(await store.owner.refreshChannelLabels({ acct: a, private: false, channel: [listed, "Alpha channel", "@alpha"] })).toEqual({ kind: "refreshed", filters: 0 })
  expect(store.writes().length).toBe(before)
  expect(await store.owner.refreshChannelLabels({ acct: a, private: false, channel: [listed, "Alpha, renamed", "@alpha2"] })).toEqual({ kind: "refreshed", filters: 2 })
  expect(stored(store, alpha).data?.channels[0]).toEqual([listed, "Alpha, renamed", "@alpha2", "never-send"])
  expect(stored(store, kept).data?.channels[0]).toEqual([listed, "Alpha, renamed", "@alpha2"])
  expect(await store.owner.refreshChannelLabels({ acct: a, private: true, channel: [listed, "Private", "@p"] })).toEqual({ kind: "refused", reason: "private" })
})

test("Remove kept filters turns only filters of playlists no longer auto-added into tombstones (SYNC-14, YT-CF-17)", async () => {
  const store = world()
  expect(await store.owner.removeKeptFilters(origin)).toEqual({ kind: "removed", filters: 1 })
  expect(stored(store, kept)).toMatchObject({ deleted: true })
  expect(stored(store, kept).data).toBeUndefined()
  expect(stored(store, alpha).data?.on).toBe(true)
  expect(await store.owner.removeKeptFilters(origin)).toEqual({ kind: "removed", filters: 0 })
  expect(await store.owner.removeKeptFilters({ ...origin, incognito: true })).toEqual({ kind: "result", result: { refused: "private" } })
})
