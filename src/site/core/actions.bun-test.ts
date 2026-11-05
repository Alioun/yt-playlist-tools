import { afterAll, afterEach, expect, spyOn, test } from "bun:test"
import { isBuildId } from "../../shared/contracts/vocabulary"
import type { TabAddReport } from "../../shared/contracts/tab-actions"
import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import { createTabActions } from "./actions"

const build = (() => {
  const id: unknown = "synthetic-build"
  if (!isBuildId(id)) throw new Error("Invalid synthetic build")
  return id
})()
const info = spyOn(console, "info").mockImplementation(() => {})
afterEach(() => info.mockClear())
afterAll(() => info.mockRestore())

// The answer echoes the request's envelope without its payload, which the caller checks exactly.
function exact(result: TabAddReport) {
  return createTabActions({
    transport: {
      send: async message => {
        const { payload: _payload, ...envelope } = message as Record<string, unknown>
        return { ...envelope, result }
      }
    },
    build,
    deadline: () => () => {},
    account: () => "acct-1" as AccountKey
  })
}
test("a tab add logs each playlist's outcome to the tab's console with Show feedback off (YT-ADD-26)", async () => {
  const report: TabAddReport = {
    kind: "report",
    outcomes: {
      ["PLadded" as PlaylistId]: { kind: "added" },
      ["PLthere" as PlaylistId]: { kind: "already-in" },
      ["PLfiltered" as PlaylistId]: { kind: "filtered", decision: "filtered-unknown-channel" },
      ["PLfull" as PlaylistId]: { kind: "failed", failure: "full" }
    },
    toast: null,
    feedback: false,
    undo: null,
    titles: {}
  }
  const actions = exact(report)
  expect(await actions.add({ site: "www", video: "dQw4w9WgXcQ" as VideoId, via: "auto-add", playlists: Object.keys(report.outcomes) as PlaylistId[], channel: null })).toEqual(report)
  expect(info.mock.calls).toEqual([
    ["[Perchling] add (auto-add) PLadded added"],
    ["[Perchling] add (auto-add) PLthere already-in"],
    ["[Perchling] add (auto-add) PLfiltered filtered"],
    ["[Perchling] add (auto-add) PLfull full"]
  ])
  actions.dispose()
})

test("an add with no outcomes logs nothing", async () => {
  const actions = exact({ kind: "signed-out" })
  expect(await actions.add({ site: "www", video: "dQw4w9WgXcQ" as VideoId, via: "auto-add", playlists: [], channel: null })).toEqual({ kind: "signed-out" })
  expect(info).not.toHaveBeenCalled()
  actions.dispose()
})
