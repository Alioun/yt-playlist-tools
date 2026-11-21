import { expect, test } from "bun:test"
import { parseSessionMemory, type SessionRead } from "../store/session-memory"
import { composeMonitor } from "./monitor"
import { createMusicMembershipHealth } from "./services"

const route = "music.membership" as never
const acct = "AAAAAAAAAAAAAAAA" as never
const acting = { tabId: 7, incognito: false, site: "music" } as const

function wired() {
  const memory = parseSessionMemory({})
  if (!memory) throw Error("no empty session")
  const read: SessionRead = { kind: "memory", memory, revision: { reset: 0, accounts: new Map() }, sequence: 0 }
  const monitor = composeMonitor({
    owner: { readSession: async () => read, changeSession: async () => ({ kind: "unavailable", reason: "stale" }), subscribeView: () => () => {} },
    clock: { now: () => 0, after: () => () => {} },
    sites: {
      www: { vocabulary: { routes: [], watchIds: [], schemaKeys: [] }, routes: {} },
      music: { vocabulary: { routes: [route], watchIds: [], schemaKeys: [] }, routes: { membership: [route] } }
    }
  })
  const tab = { tabId: 7, windowId: 1, incognito: false, site: "music", lastAccessed: 0, active: true, discarded: false, frozen: false } as const
  const context = { tab, info: { site: "music", build: "test", signedIn: true, acct } } as never
  const record = createMusicMembershipHealth({ tab: async () => ({ kind: "tab", tab }), monitor, build: "test" as never, route })
  const enabled = [{ id: "music-actions", options: { on: true, feedback: true } }] as never
  async function status() {
    const answer = await monitor.statusProducer.read(context, enabled)
    if (answer.kind !== "statuses") throw Error(answer.kind)
    return answer.statuses.map(row => ({ state: row.state, jobs: row.jobs }))
  }
  const signals = async () => (await monitor.diagnostics(context))?.signals.map(row => [row.signal.job, row.signal.kind]) ?? []
  return { monitor, record, status, signals }
}

test("Music check marks that stay incomplete with a YouTube tab open are breakage, and complete ones clear it", async () => {
  const { monitor, record, status, signals } = wired()
  await record(acting, acct, { checks: "incomplete", at: 1 })
  expect(await signals()).toEqual([["membership", "unrecognised"]])
  expect(await status()).toEqual([{ state: "partly-working", jobs: ["membership"] }])
  await record(acting, acct, { checks: "complete", at: 2 })
  expect(await status()).toEqual([{ state: "working", jobs: [] }])
  monitor.dispose()
})

test("opening the Music picker with no YouTube tab open records no breakage", async () => {
  const { monitor, record, status, signals } = wired()
  await record(acting, acct, { checks: "noYouTubeTab", at: 1 })
  expect(await signals()).toEqual([])
  expect(await status()).toEqual([{ state: "working", jobs: [] }])
  monitor.dispose()
})

test("a missing YouTube tab neither clears nor repeats breakage that a real failure recorded", async () => {
  const { monitor, record, status, signals } = wired()
  await record(acting, acct, { checks: "incomplete", at: 1 })
  await record(acting, acct, { checks: "noYouTubeTab", at: 2 })
  expect(await signals()).toEqual([["membership", "unrecognised"]])
  expect(await status()).toEqual([{ state: "partly-working", jobs: ["membership"] }])
  monitor.dispose()
})
