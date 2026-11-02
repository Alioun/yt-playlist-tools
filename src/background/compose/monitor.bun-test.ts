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
