import { expect, test } from "bun:test"
import { composeThisTab } from "./this-tab"
import type { ThisVideo } from "../../shared/contracts/this-video"
import type { Requester } from "../tabs/ports"

const acct = "AAAAAAAAAAAAAAAA" as never,
  other = "BBBBBBBBBBBBBBBB" as never
const video = "aaaaaaaaaaa" as never
const req: Requester = { windowId: 3, incognito: false, activeTabId: 9 }
const tracked: ThisVideo = {
  video,
  title: "First video",
  state: { kind: "counting", goal: 50, watched: 20 },
  watched: 20,
  playlists: [{ pl: "PL_music" as never, pct: 50, outcome: "waiting" }],
  channel: { id: "UCaaaaaaaaaaaaaaaaaaaaaa" as never, title: "Band", handle: "@band" }
}

function world(options: { url?: string; acct?: string | null; query?: ThisVideo | null; consented?: boolean } = {}) {
  const asked: unknown[] = [],
    skips: unknown[] = [],
    jobs: string[] = []
  const service = composeThisTab({
    native: { tabs: { get: async (tabId: number) => ({ id: tabId, url: options.url ?? "https://www.youtube.com/watch?v=aaaaaaaaaaa", incognito: false }) } } as never,
    tabs: {
      known: async () => [{ tabId: 9, acct: options.acct === undefined ? acct : options.acct, privateTab: false }] as never,
      runIn: async (_tabId: number, invocation: { job: { kind: string } }) => {
        jobs.push(invocation.job.kind)
        return { kind: "result", tabId: 9, result: { ok: true, route: "r", data: { videoId: video, title: "Untracked video" } } } as never
      }
    },
    registrar: { ensure: async () => {} },
    flow: {
      skip: async (request, origin) => {
        skips.push({ request, origin })
        return { kind: "remembered", scope: "normal" }
      }
    },
    ask: async (tabId, kind, payload) => {
      asked.push({ tabId, kind, payload })
      return { kind: "answered", result: options.query === undefined ? tracked : options.query }
    },
    consented: () => options.consented ?? true
  })
  return { service, asked, skips, jobs }
}

test("This video is auto-add's view of the active YouTube tab, as that tab's account", async () => {
  const w = world()
  expect(await w.service.thisTab(req)).toEqual({ kind: "video", tabId: 9, acct, video: tracked })
  expect(w.asked).toEqual([{ tabId: 9, kind: "bg.query", payload: { name: "auto-add" } }])
})

test("with auto-add following nothing there, the page's own video shows untracked", async () => {
  const w = world({ query: null })
  expect(await w.service.thisTab(req)).toEqual({
    kind: "video",
    tabId: 9,
    acct,
    video: { video, title: "Untracked video", state: { kind: "not-tracked" }, watched: null, playlists: [], channel: null }
  })
  expect(w.jobs).toEqual(["videoInfo"])
})

test("before consent, on another site, or signed out, This video reads nothing", async () => {
  for (const [options, kind] of [
    [{ consented: false }, "unavailable"],
    [{ url: "https://music.youtube.com/" }, "none"],
    [{ acct: null }, "none"]
  ] as const) {
    const w = world(options)
    expect((await w.service.thisTab(req)).kind).toBe(kind)
    expect(w.asked).toEqual([])
  }
})

test("Don't auto-add this video skips it for the tab's account, Undo unskips it, and a changed account refuses", async () => {
  const w = world()
  expect(await w.service.skip(req, { tabId: 9, acct, video, skip: true })).toEqual({ kind: "skipped" })
  expect(await w.service.skip(req, { tabId: 9, acct, video, skip: false })).toEqual({ kind: "unskipped" })
  expect(w.skips).toEqual([
    { request: { kind: "skip", acct, video, playlists: "all" }, origin: { kind: "tab", tabId: 9, incognito: false } },
    { request: { kind: "unskip", acct, video }, origin: { kind: "tab", tabId: 9, incognito: false } }
  ])
  expect(await w.service.skip(req, { tabId: 9, acct: other, video, skip: true })).toEqual({ kind: "refused", reason: "account-changed" })
  expect(w.skips).toHaveLength(2)
})
