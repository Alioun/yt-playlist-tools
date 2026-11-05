import { expect, test } from "bun:test"
import { createLocalFilterWriter } from "../store/local-filter-writer"
import type { SessionPort } from "../store/session-memory"
import { isAccountKey, isPlaylistId, isVideoId } from "../../shared/model"
import { createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { harness, settle, shortcut, tabOrigin } from "../../../tools/fixtures/add-flow/harness"

function brand<T>(check: (value: unknown) => value is T, value: string): T {
  if (!check(value)) throw Error(`Invalid synthetic identifier ${value}`)
  return value
}
const acct = brand(isAccountKey, "AAAAAAAAAAAAAAAA")
const music = brand(isPlaylistId, "PLmusic"),
  learning = brand(isPlaylistId, "PLlearning")
const video = brand(isVideoId, "vid00000001"),
  second = brand(isVideoId, "vid00000002")
const wall = 1_700_000_000_000
const normalTab = tabOrigin(1),
  privateTab = tabOrigin(2, true)

function world(recentAdds = true) {
  const removal = createRemovalHarness({ ...removalFixture(), session: {} })
  const owner = createLocalFilterWriter(removal.deps)
  const port: SessionPort = { read: () => owner.readSession(), change: change => owner.changeSession(change) }
  const yt = harness({ session: port, clock: wall, recentAdds, titles: { [music]: "Music videos", [learning]: "Learning" } })
  yt.tab(1, acct)
  yt.tab(2, acct)
  yt.setup(acct, { kind: "shortcut", shortcut }, [{ playlist: music }])
  yt.setup(acct, { kind: "auto-add" }, [{ playlist: music }, { playlist: learning }])
  const listed = () => removal.state().session.recentAdds ?? []
  return { yt, listed }
}

test("every add lists one entry with its video, playlists, feature and time, and its Undo removes it", async () => {
  const { yt, listed } = world()
  const report = await yt.flow.add({ via: "shortcut", site: "www", video, title: "A video", shortcut }, normalTab)
  await yt.flow.add({ via: "auto-add", site: "www", video: second, playlists: [music, learning], channel: null }, normalTab)
  await settle()
  expect(listed()).toEqual([
    {
      kind: "single",
      acct,
      at: wall,
      source: { kind: "feature", feature: "auto-add" },
      video: { id: second, title: "" },
      playlists: [
        { id: music, title: "Music videos" },
        { id: learning, title: "Learning" }
      ],
      undo: expect.any(String)
    },
    {
      kind: "single",
      acct,
      at: wall,
      source: { kind: "feature", feature: "shortcuts" },
      video: { id: video, title: "A video" },
      playlists: [{ id: music, title: "Music videos" }],
      undo: expect.any(String)
    }
  ])
  if (report.kind !== "report" || !report.undo) throw Error("Expected an add with Undo")
  expect(await yt.flow.undo(report.undo, normalTab)).toEqual({ kind: "undone" })
  await yt.flow.quiesce()
  await settle()
  expect(listed()).toHaveLength(1)
  expect(listed()).toEqual([expect.objectContaining({ video: { id: second, title: "" } })])
})

test("already-in, private windows and the switch turned off list nothing", async () => {
  const on = world()
  await on.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, privateTab)
  await on.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normalTab)
  const again = await on.yt.flow.add({ via: "shortcut", site: "www", video: second, shortcut }, normalTab)
  expect(again.kind === "report" && again.outcomes).toEqual({ [music]: { kind: "already-in" } })
  await on.yt.flow.quiesce()
  await settle()
  expect(on.listed()).toEqual([expect.objectContaining({ video: { id: second, title: "" } })])
  const off = world(false)
  await off.yt.flow.add({ via: "shortcut", site: "www", video, shortcut }, normalTab)
  await off.yt.flow.quiesce()
  await settle()
  expect(off.listed()).toEqual([])
})
