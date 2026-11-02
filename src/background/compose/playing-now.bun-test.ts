import { expect, test } from "bun:test"
import { createPlayingNow } from "./playing-now"

const acct = "AAAAAAAAAAAAAAAA" as never, other = "BBBBBBBBBBBBBBBB" as never
const ui = { requester: { windowId: 1, incognito: false, activeTabId: 5 }, principal: "p" } as never
function setup(records: [number, { site: "www" | "music"; signedIn: boolean; acct: string | null }][], tabs: Record<number, { windowId: number; active: boolean; lastAccessed: number }>) {
  const runs: unknown[] = []
  const playing = createPlayingNow({
    consented: () => true,
    session: async () => ({ kind: "memory", revision: { reset: 0, accounts: new Map() }, sequence: 1, memory: { tabs: new Map(records) } }) as never,
    native: { get: async tabId => tabs[tabId] ? { kind: "tab", tab: { tabId, incognito: false, site: "music", discarded: false, frozen: false, ...tabs[tabId] } } as never : { kind: "gone" } },
    tabs: { async runIn(tabId, invocation) {
      runs.push([tabId, invocation.job.kind])
      return { kind: "result", tabId, result: invocation.job.kind === "nowPlaying"
        ? { ok: true, route: "r", data: { videoId: "aaaaaaaaaaa", title: "Song", artist: "Band", pos: 0, len: null } } : { ok: true, route: "r", data: { setVideoId: null } } } as never
    } }
  })
  return { playing, runs }
}

test("Playing now reads the focused window's active YouTube Music tab before a more recent one elsewhere", async () => {
  const { playing, runs } = setup([[7, { site: "music", signedIn: true, acct }], [8, { site: "music", signedIn: true, acct: other }], [9, { site: "www", signedIn: true, acct }]],
    { 7: { windowId: 1, active: true, lastAccessed: 1 }, 8: { windowId: 2, active: true, lastAccessed: 99 }, 9: { windowId: 1, active: false, lastAccessed: 100 } })
  expect(await playing.now(ui)).toMatchObject({ kind: "playing", tabId: 7, acct })
  expect(runs).toEqual([[7, "nowPlaying"]])
})

test("Save runs in the tab Playing now read, and refuses when that tab's account changed", async () => {
  const { playing, runs } = setup([[7, { site: "music", signedIn: true, acct: other }]], { 7: { windowId: 1, active: true, lastAccessed: 1 } })
  expect(await playing.save(ui, { tabId: 7, acct, videoId: "aaaaaaaaaaa" as never, playlistId: "PLm" as never })).toEqual({ kind: "account-changed" })
  expect(runs).toEqual([])
  expect(await playing.save(ui, { tabId: 7, acct: other, videoId: "aaaaaaaaaaa" as never, playlistId: "PLm" as never })).toEqual({ kind: "saved", setVideoId: null })
  expect(runs).toEqual([[7, "save"]])
})
