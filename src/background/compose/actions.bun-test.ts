import { afterEach, expect, test } from "bun:test"
import { composeActions } from "./actions"
import { createTabActions } from "../../site/core/actions"
import type { Playlists } from "../playlists/playlists"
import type { Tabs, TabJobOutcome } from "../tabs/ports"
import type { KnownTab } from "../tabs/tabs"
import type { NativeSender } from "../adapters/sender-origin"
import type { Job, JobInvocation, JobResult, RouteId, SetVideoId } from "../../shared/contracts"
import type { AccountKey, PlaylistId, VideoId } from "../../shared/model"
import { projectionSeed, projectionWorld, document as doc, a, b, alpha, beta, video } from "../../../tools/fixtures/tab-projection/harness"
import { build } from "../../../tools/fixtures/page-link/support"

type Listener = (message: unknown, sender: NativeSender, respond: (answer?: unknown) => void) => boolean
const route = "fixture-route" as RouteId
const disposers: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposers.splice(0)) await dispose() })

function seed(settings: Record<string, unknown> = {}) {
  const initial = projectionSeed()
  initial.local["doc:settings"] = doc({
    shortcuts: { on: true, feedback: true, list: [
      { id: "orig01", label: "Alpha shortcut", key: null, watchLaterOnEveryAccount: false },
      { id: "later1", label: "Later", key: null, watchLaterOnEveryAccount: true }
    ] },
    quickSave: { on: true, feedback: true, shortsShelves: false }, ...settings
  })
  return initial
}

function youtube() {
  const lists = new Map<PlaylistId, Set<VideoId>>([[alpha, new Set()], [beta, new Set()], ["WL" as PlaylistId, new Set()]])
  const jobs: string[] = []
  let entry = 0
  function answer<J extends Job>(invocation: JobInvocation<J>): JobResult<J> {
    const job = invocation.job as Job
    jobs.push(job.kind)
    switch (job.kind) {
      case "membership": return { ok: true, route, data: [...lists].map(([id, videos]) => ({ id, title: id, contains: videos.has(job.videoId) })) } as unknown as JobResult<J>
      case "add": lists.get(job.playlistId)?.add(job.videoId); return { ok: true, route, data: { setVideoId: `entry-${++entry}` as SetVideoId } } as unknown as JobResult<J>
      case "remove": return { ok: true, route, data: null } as unknown as JobResult<J>
      default: return { ok: false, reason: "unavailable" } as unknown as JobResult<J>
    }
  }
  return { lists, jobs, answer }
}

function world(options: { settings?: Record<string, unknown>; tabAccount?: AccountKey | null; pageAccount?: AccountKey | null } = {}) {
  const store = projectionWorld(seed(options.settings))
  const site = youtube()
  const listeners = new Set<Listener>()
  const ensured: unknown[] = []
  const known = { tabId: 9, acct: options.tabAccount === undefined ? a : options.tabAccount, privateTab: false } as unknown as KnownTab
  const tabs = {
    async known() { return [known] },
    async runIn<J extends Job>(tabId: number, invocation: JobInvocation<J>): Promise<TabJobOutcome<J>> {
      return { kind: "result", tabId, result: site.answer(invocation) }
    },
    async serve() { return { kind: "no-tab", attempted: [] } },
    async accountInView() { return { kind: "none" } }
  } as unknown as Tabs
  const playlists = {
    async list() { return { kind: "open", cached: { rows: [{ id: alpha, title: "Alpha" }], at: 5 }, freshness: "fresh", refresh: null } }
  } as unknown as Playlists
  const native = {
    runtime: { id: "perchling", getURL: (path: string) => `chrome-extension://perchling${path}`, async sendMessage() {},
      onMessage: { addListener: (listener: Listener) => { listeners.add(listener) }, removeListener: (listener: Listener) => { listeners.delete(listener) } } },
    windows: { async get(id: number) { return { id, incognito: false } } }
  }
  const actions = composeActions({ native: native as never, build, owner: store.owner, tabs, playlists, writable: () => true,
    registrar: { async ensure(tabId, what) { ensured.push({ tabId, what }) } }, requester: async () => null, log: () => {} })
  const sender = { id: "perchling", frameId: 0, url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    tab: { id: 9, windowId: 3, incognito: false } } as NativeSender
  const transport = { send: (message: unknown) => new Promise<unknown>(resolve => {
    let claimed = false
    for (const listener of [...listeners]) claimed = listener(message, sender, resolve) || claimed
    if (!claimed) resolve(undefined)
  }) }
  const page = createTabActions({ transport, build, deadline: (ms, expire) => { const t = setTimeout(expire, ms); return () => clearTimeout(t) },
    account: () => options.pageAccount !== undefined ? options.pageAccount : known.acct })
  disposers.push(() => page.dispose(), () => actions.dispose(), () => store.owner.dispose())
  return { store, site, page, actions, ensured }
}

test("a playlist shortcut saves the pointed video to this account's shortcut playlist, with Undo", async () => {
  const { page, site } = world()
  const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })
  expect(report.kind).toBe("report")
  if (report.kind !== "report") return
  expect(report.outcomes).toEqual({ [beta]: { kind: "added" } })
  expect(report.toast?.message).toEqual({ kind: "saved", playlists: [beta] })
  expect(report.undo?.kind).toBe("add")
  expect(site.lists.get(beta)?.has(video)).toBe(true)
  const undone = await page.undo(report.undo!)
  expect(undone).toEqual({ kind: "undone" })
  expect(site.jobs).toContain("remove")
})

test("Watch later on every account saves to Watch later whatever the account's own target", async () => {
  const { page, site } = world()
  const report = await page.add({ site: "www", video, via: "shortcut", shortcut: "later1" as never })
  expect(report.kind === "report" && report.outcomes).toEqual({ ["WL" as PlaylistId]: { kind: "added" } })
  expect(site.lists.get("WL" as PlaylistId)?.has(video)).toBe(true)
})

test("a video already in the playlist answers already-in and writes nothing", async () => {
  const { page, site } = world()
  site.lists.get(alpha)?.add(video)
  const report = await page.add({ site: "www", video, via: "quick-save", opener: "quick-save" })
  expect(report.kind === "report" && report.outcomes).toEqual({ [alpha]: { kind: "already-in" } })
  expect(site.jobs).not.toContain("add")
})

test("quick-save on an account with no quick-save playlist asks the page to open choose mode", async () => {
  const { page, site } = world({ tabAccount: b })
  expect(await page.add({ site: "www", video, via: "quick-save", opener: "quick-save" })).toEqual({ kind: "choose" })
  expect(site.jobs).toEqual([])
})

test("a feature that is off adds nothing", async () => {
  const { page, site } = world({ settings: { quickSave: { on: false, feedback: true, shortsShelves: false } } })
  const report = await page.add({ site: "www", video, via: "quick-save", opener: "quick-save" })
  expect(report).toEqual({ kind: "report", outcomes: {}, toast: null, feedback: true, undo: null })
  expect(site.jobs).toEqual([])
})

test("a request naming another account than the tab's registry entry is refused before anything runs (ARC-ACC-49)", async () => {
  const { page, site } = world({ tabAccount: b, pageAccount: a })
  expect(await page.add({ site: "www", video, via: "shortcut", shortcut: "orig01" as never })).toEqual({ kind: "no-tab" })
  expect(site.jobs).toEqual([])
})

test("an untick removes the entry and offers Undo, and a pick in choose mode stores the quick-save playlist", async () => {
  const { page, store, site } = world()
  site.lists.get(beta)?.add(video)
  const removed = await page.remove({ site: "www", video, playlist: beta, opener: "quick-save", tick: null })
  expect(removed.kind).toBe("removed")
  const answer = await page.destination({ destination: { kind: "quick-save" }, expected: { setup: "live", playlist: alpha }, playlist: beta })
  expect(answer).toEqual({ kind: "confirmed", playlist: beta })
  const setup = await store.owner.readSetup(a)
  expect(setup.kind === "value" && setup.view.kind === "live" && setup.view.setup.quickSave).toBe(beta)
})

test("the picker's playlist list comes from the cache, and popovers load through the Registrar", async () => {
  const { page, ensured } = world()
  expect(await page.playlists(false)).toEqual({ kind: "cached", listing: { rows: [{ id: alpha, title: "Alpha" }], at: 5 } })
  expect(await page.need()).toBe(true)
  expect(ensured).toEqual([{ tabId: 9, what: { popovers: true } }])
})
