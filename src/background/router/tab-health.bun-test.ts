import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { createTabHealthRouter } from "./tab-health"
import { runtimeTransport } from "../adapters/runtime"
import { CONTRACT_VERSION } from "../../shared/contracts/protocol"
import { build, manualClock, settle } from "../../../tools/fixtures/tabs/harness"
import { context, monitorWorld, pageFeature, syntheticHealthFacts } from "../../../tools/fixtures/monitor/harness"

beforeEach(() => fakeBrowser.reset())
afterEach(() => mock.restore())
const acct = "AAAAAAAAAAAAAAAA"
const signal = { site: "www", feature: null, job: "add", route: "service.add", kind: "missing", watchId: "W", shape: null, clientVersion: null, pageType: "watch", count: 1, firstSeen: 1, lastSeen: 1 }

async function world(registered: string | null = acct) {
  const window = await fakeBrowser.windows.create({ incognito: false })
  const created = await fakeBrowser.tabs.create({ windowId: window?.id, url: "https://www.youtube.com/watch?v=ccccccccccc" })
  const raw = { ...created, incognito: false, active: true, windowId: window?.id }
  spyOn(fakeBrowser.tabs, "get").mockImplementation(async () => raw as never)
  const calls: unknown[] = []
  const monitor = {
    async signal(_context: unknown, value: unknown, evidence: unknown) {
      calls.push(["signal", (value as { kind: string }).kind, evidence])
      return { kind: "accepted", scope: "normal" } as const
    },
    async observeAnchor(_context: unknown, input: unknown) {
      calls.push(["anchor", input])
      return { kind: "accepted", scope: "normal" } as const
    },
    async succeeded(_context: unknown, job: unknown) {
      calls.push(["success", job])
      return { kind: "accepted", scope: "normal" } as const
    },
    async measured() {
      calls.push(["measured"])
      return { kind: "accepted", scope: "normal" } as const
    }
  }
  const router = createTabHealthRouter({
    transport: runtimeTransport(fakeBrowser.runtime),
    senders: fakeBrowser,
    build,
    deadline: manualClock().after,
    monitor: monitor as never,
    enabled: async () => undefined,
    async context(_sender, claimed) {
      return claimed === registered ? ({ tab: { tabId: raw.id }, info: {} } as never) : null
    }
  })
  const sender = { id: fakeBrowser.runtime.id, frameId: 0, url: raw.url, tab: raw } as never
  async function send(payload: unknown) {
    const replies: unknown[] = []
    await Promise.all(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: "m-1", kind: "tab.health", payload }, sender, value => replies.push(value)))
    await settle()
    return replies[0]
  }
  return { send, calls, dispose: () => router.dispose() }
}

test("a tab's batch reaches the Monitor as that tab: job signals with their evidence, anchors, successes and a measured playback", async () => {
  const w = await world()
  await w.send({
    acct,
    request: {
      reports: [
        { kind: "signal", signal, evidence: "job", online: true, answered: false },
        { kind: "signal", signal: { ...signal, kind: "cannot-measure", job: null, route: null, watchId: null, feature: "auto-add" }, evidence: "playback" },
        {
          kind: "anchor",
          anchor: "www-cards",
          signal: { ...signal, kind: "anchor-missing", job: null, route: null, watchId: null },
          observation: { relevant: true, visible: true, settledMs: 3000, distinctMainLinks: 8, recognised: 1 }
        },
        { kind: "success", job: "add" },
        { kind: "measured" }
      ]
    }
  })
  expect(w.calls).toEqual([
    ["signal", "missing", { kind: "job", online: true, otherRequestsAnswer: false }],
    ["signal", "cannot-measure", { kind: "playback" }],
    [
      "anchor",
      {
        anchor: "www-cards",
        signal: expect.objectContaining({ kind: "anchor-missing" }),
        observation: { kind: "content", relevant: true, visible: true, navigationAt: 0, observedAt: 3000, distinctMainLinks: 8, recognised: 1 }
      }
    ],
    ["success", "add"],
    ["measured"]
  ])
  w.dispose()
})

test("a missing player-bar like reaches the Monitor as a player-bar anchor (YM-FAIL-8)", async () => {
  const w = await world()
  await w.send({
    acct,
    request: {
      reports: [
        {
          kind: "anchor",
          anchor: "music-player-bar",
          signal: { ...signal, site: "music", feature: "music-actions", kind: "anchor-missing", job: null, route: null, watchId: null },
          observation: { kind: "player-bar", requiredHere: true, visible: true, settledMs: 3000, present: false }
        }
      ]
    }
  })
  expect(w.calls).toEqual([
    [
      "anchor",
      {
        anchor: "music-player-bar",
        signal: expect.objectContaining({ kind: "anchor-missing" }),
        observation: { kind: "player-bar", requiredHere: true, visible: true, navigationAt: 0, observedAt: 3000, present: false }
      }
    ]
  ])
  w.dispose()
})

test("a batch from a tab the registry holds for another account reaches nothing (ARC-ACC-49)", async () => {
  const w = await world("BBBBBBBBBBBBBBBB")
  await w.send({ acct, request: { reports: [{ kind: "success", job: "add" }] } })
  expect(w.calls).toEqual([])
  w.dispose()
})

async function noticeWorld(features = [pageFeature("queue-button"), pageFeature("card-menu")]) {
  const window = await fakeBrowser.windows.create({ incognito: false })
  const created = await fakeBrowser.tabs.create({ windowId: window?.id, url: "https://www.youtube.com/results?search_query=a" })
  const raw = { ...created, incognito: false, active: true, windowId: window?.id }
  const h = monitorWorld()
  const tab = context()
  h.seedContext(tab, { visible: true, fullscreen: false }, syntheticHealthFacts("www"))
  const router = createTabHealthRouter({
    transport: runtimeTransport(fakeBrowser.runtime),
    senders: fakeBrowser,
    build,
    deadline: manualClock().after,
    monitor: h.monitor,
    enabled: async () => features,
    context: async () => tab
  })
  const sender = { id: fakeBrowser.runtime.id, frameId: 0, url: raw.url, tab: raw } as never
  let id = 0
  async function send(kind: string, request: unknown) {
    const replies: { kind: string; result?: unknown }[] = []
    await Promise.all(await fakeBrowser.runtime.onMessage.trigger({ v: CONTRACT_VERSION, build, id: `n-${++id}`, kind, payload: { acct: tab.info.acct, request } }, sender, value => replies.push(value as never)))
    for (let turn = 0; turn < 200 && !replies.length; turn++) await settle()
    return replies[0]?.result
  }
  return { h, tab, send, async dispose() { router.dispose(); await h.dispose() } }
}

test("a broken feature about to act gets one notice in its tab, and once shown it isn't owed again (YT-BRK-02)", async () => {
  const w = await noticeWorld()
  try {
    w.h.routes(w.tab, "queueAdd", "missing")
    w.h.routes(w.tab, "openCardMenu", "missing")
    expect(await w.send("tab.wouldAct", { feature: "queue-button" })).toBeNull()
    await w.h.advance(20)
    await w.send("tab.wouldAct", { feature: "card-menu" })
    await w.h.advance(60)
    const claim = (await w.send("tab.claimNotice", null)) as { token: unknown; due: unknown } | undefined
    expect(claim?.due).toEqual({ kind: "not-working", features: ["queue-button", "card-menu"] })
    expect(await w.send("tab.claimNotice", null)).toBeNull()
    await w.send("tab.noticeShown", { token: claim?.token })
    await w.send("tab.wouldAct", { feature: "queue-button" })
    await w.h.advance(60)
    expect(await w.send("tab.claimNotice", null)).toBeNull()
  } finally {
    await w.dispose()
  }
})

test("a notice the tab showed isn't owed again when another tab reported while it was on its way (YT-BRK-02)", async () => {
  const w = await noticeWorld()
  const other = { ...w.tab, tab: { ...w.tab.tab, tabId: w.tab.tab.tabId + 1 } }
  w.h.seedContext(other, { visible: true, fullscreen: false }, syntheticHealthFacts("www"))
  try {
    w.h.routes(w.tab, "openCardMenu", "missing")
    await w.send("tab.wouldAct", { feature: "card-menu" })
    await w.h.advance(60)
    const claim = (await w.send("tab.claimNotice", null)) as { token: string } | null
    expect(claim).toMatchObject({ due: { kind: "not-working", features: ["card-menu"] } })
    // The notice waits behind a toast for a few seconds, and tabs report jobs all the time.
    await w.h.monitor.succeeded(other, "account")
    await w.send("tab.noticeShown", { token: claim?.token })
    expect(await w.send("tab.claimNotice", null)).toBeNull()
    await w.h.advance(60_000)
    expect(await w.send("tab.claimNotice", null)).toBeNull()
  } finally {
    await w.dispose()
  }
})

test("a working feature or one the user switched off owes no notice", async () => {
  const w = await noticeWorld([pageFeature("card-menu")])
  try {
    w.h.routes(w.tab, "queueAdd", "missing")
    await w.send("tab.wouldAct", { feature: "queue-button" })
    await w.send("tab.wouldAct", { feature: "card-menu" })
    await w.h.advance(60)
    expect(await w.send("tab.claimNotice", null)).toBeNull()
  } finally {
    await w.dispose()
  }
})
