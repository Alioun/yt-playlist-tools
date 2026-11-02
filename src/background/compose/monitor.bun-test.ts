import { expect, test } from "bun:test"
import { parseSessionMemory, type SessionRead } from "../store/session-memory"
import { composeMonitor } from "./monitor"

test("the production Monitor answers every enabled feature's status for a tab its core said hello from", async () => {
  const memory = parseSessionMemory({})
  if (!memory) throw Error("no empty session")
  const read: SessionRead = { kind: "memory", memory, revision: { reset: 0, accounts: new Map() }, sequence: 0 }
  const monitor = composeMonitor({
    owner: { readSession: async () => read, changeSession: async () => ({ kind: "unavailable", reason: "stale" }), subscribeView: () => () => {} },
    clock: { now: () => 0, after: () => () => {} }
  })
  const context = { tab: { tabId: 3, windowId: 1, incognito: false, site: "www", lastAccessed: 0, active: true, discarded: false, frozen: false },
    info: { site: "www", build: "test", signedIn: false, acct: null } } as never
  const enabled = [{ id: "queue-button", options: { on: true, feedback: true } }, { id: "auto-add", options: { on: true, feedback: true, pct: 50, toolbarTick: true, toolbarPaused: true } }] as never
  const statuses = await monitor.statusProducer.read(context, enabled)
  expect(statuses.kind === "statuses" && statuses.statuses.map(row => [row.feature, row.state])).toEqual([["queue-button", "working"], ["auto-add", "working"]])
  monitor.dispose()
})

const primary = "service.add" as never, fallback = "signed.add" as never
function wired() {
  const memory = parseSessionMemory({})
  if (!memory) throw Error("no empty session")
  const read: SessionRead = { kind: "memory", memory, revision: { reset: 0, accounts: new Map() }, sequence: 0 }
  const vocabulary = { routes: [primary, fallback], watchIds: ["SYNTHETIC-WATCH"] as never, schemaKeys: [] }
  const monitor = composeMonitor({
    owner: { readSession: async () => read, changeSession: async () => ({ kind: "unavailable", reason: "stale" }), subscribeView: () => () => {} },
    clock: { now: () => 0, after: () => () => {} },
    sites: { www: { vocabulary, routes: { add: [primary, fallback] } }, music: { vocabulary, routes: {} } }
  })
  const context = { tab: { tabId: 3, windowId: 1, incognito: false, site: "www", lastAccessed: 0, active: true, discarded: false, frozen: false },
    info: { site: "www", build: "test", signedIn: true, acct: "AAAAAAAAAAAAAAAA" } } as never
  const enabled = [{ id: "auto-add", options: { on: true, feedback: true, pct: 50, toolbarTick: true, toolbarPaused: true } },
    { id: "quick-save", options: { on: true, feedback: true, shortsShelves: false } }] as never
  const states = async () => {
    const answer = await monitor.statusProducer.read(context, enabled)
    return answer.kind === "statuses" ? Object.fromEntries(answer.statuses.map(row => [row.feature, row.state])) : answer.kind
  }
  const signal = (kind: string, patch: object = {}) => ({ site: "www", feature: null, job: "add", route: primary, kind, watchId: kind === "missing" ? "SYNTHETIC-WATCH" : null,
    shape: null, clientVersion: null, pageType: "watch", count: 1, firstSeen: 1, lastSeen: 1, ...patch })
  return { monitor, context, states, signal }
}
const job = { kind: "job", online: true, otherRequestsAnswer: true } as const

test("a tab's signals take a job's shipped routes away one by one, and the job's next success brings the features back (HEALTH-07, HEALTH-12)", async () => {
  const { monitor, context, states, signal } = wired()
  expect(await monitor.signal(context, signal("missing"), job)).toMatchObject({ kind: "accepted" })
  expect(await states()).toEqual({ "auto-add": "working", "quick-save": "working" })
  await monitor.signal(context, signal("missing", { route: fallback, firstSeen: 2, lastSeen: 2 }), job)
  expect(await states()).toEqual({ "auto-add": "not-working", "quick-save": "not-working" })
  await monitor.succeeded(context, "add")
  expect(await states()).toEqual({ "auto-add": "working", "quick-save": "working" })
  monitor.dispose()
})

test("a signal on a route this build doesn't ship is refused, and a missing card anchor stops quick-save but not auto-add (HEALTH-02)", async () => {
  const { monitor, context, states, signal } = wired()
  expect(await monitor.signal(context, signal("missing", { route: "plain.unknown" }), job)).toEqual({ kind: "invalid" })
  await monitor.observeAnchor(context, { anchor: "www-cards", signal: signal("anchor-missing", { job: null, route: null, watchId: null }),
    observation: { kind: "content", relevant: true, visible: true, navigationAt: 0, observedAt: 3000, distinctMainLinks: 8, recognised: 1 } })
  expect(await states()).toEqual({ "auto-add": "working", "quick-save": "not-working" })
  await monitor.reloadPassed(context)
  expect(await states()).toEqual({ "auto-add": "working", "quick-save": "working" })
  monitor.dispose()
})
