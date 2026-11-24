import { expect, test } from "bun:test"
import { defaultSettings } from "../../shared/model/defaults"
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
  // A record reads the session before it writes. A test can hold the next read to act while a record is in there.
  let hold: { readonly reading: () => void; readonly released: Promise<void> } | undefined
  const monitor = composeMonitor({
    owner: {
      async readSession() {
        const held = hold
        hold = undefined
        held?.reading()
        await held?.released
        return read
      },
      changeSession: async () => ({ kind: "unavailable", reason: "stale" }),
      subscribeView: () => () => {}
    },
    clock: { now: () => 0, after: () => () => {} },
    sites: {
      www: { vocabulary: { routes: [], watchIds: [], schemaKeys: [] }, routes: {} },
      music: { vocabulary: { routes: [route], watchIds: [], schemaKeys: [] }, routes: { membership: [route] } }
    }
  })
  const tab = { tabId: 7, windowId: 1, incognito: false, site: "music", lastAccessed: 0, active: true, discarded: false, frozen: false } as const
  const context = { tab, info: { site: "music", build: "test", signedIn: true, acct } } as never
  const record = createMusicMembershipHealth({ tab: async () => ({ kind: "tab", tab }), monitor, build: "test" as never, route })
  const enabled = [{ id: "music-actions", options: { ...defaultSettings().musicActions, on: true } }] as never
  async function status() {
    const answer = await monitor.statusProducer.read(context, enabled)
    if (answer.kind !== "statuses") throw Error(answer.kind)
    return answer.statuses.map(row => ({ state: row.state, jobs: row.jobs }))
  }
  const signals = async () => (await monitor.diagnostics(context))?.signals.map(row => [row.signal.job, row.signal.kind]) ?? []
  function holdNextRead() {
    const reading = Promise.withResolvers<void>(),
      released = Promise.withResolvers<void>()
    hold = { reading: reading.resolve, released: released.promise }
    return { reading: reading.promise, release: released.resolve }
  }
  return { monitor, record, status, signals, holdNextRead }
}

const newest = () => true

test("Music check marks that stay incomplete with a YouTube tab open are breakage, and complete ones clear it", async () => {
  const { monitor, record, status, signals } = wired()
  await record(acting, acct, { checks: "incomplete", at: 1, newest })
  expect(await signals()).toEqual([["membership", "unrecognised"]])
  expect(await status()).toEqual([{ state: "partly-working", jobs: ["membership"] }])
  await record(acting, acct, { checks: "complete", at: 2, newest })
  expect(await status()).toEqual([{ state: "working", jobs: [] }])
  monitor.dispose()
})

test("opening the Music picker with no YouTube tab open records no breakage", async () => {
  const { monitor, record, status, signals } = wired()
  await record(acting, acct, { checks: "noYouTubeTab", at: 1, newest })
  expect(await signals()).toEqual([])
  expect(await status()).toEqual([{ state: "working", jobs: [] }])
  monitor.dispose()
})

test("a missing YouTube tab neither clears nor repeats breakage that a real failure recorded", async () => {
  const { monitor, record, status, signals } = wired()
  await record(acting, acct, { checks: "incomplete", at: 1, newest })
  await record(acting, acct, { checks: "noYouTubeTab", at: 2, newest })
  expect(await signals()).toEqual([["membership", "unrecognised"]])
  expect(await status()).toEqual([{ state: "partly-working", jobs: ["membership"] }])
  monitor.dispose()
})

test("a Music record that a later read overtook while it waited for its tab writes nothing", async () => {
  const { monitor, record, status, signals } = wired()
  await record(acting, acct, { checks: "incomplete", at: 1, newest: () => false })
  expect(await signals()).toEqual([])
  expect(await status()).toEqual([{ state: "working", jobs: [] }])
  monitor.dispose()
})

test("a Music record isn't lost when another tab's report lands while the Monitor reads for it", async () => {
  const { monitor, record, status, holdNextRead } = wired()
  await record(acting, acct, { checks: "incomplete", at: 1, newest })
  expect(await status()).toEqual([{ state: "partly-working", jobs: ["membership"] }])
  const held = holdNextRead()
  const recorded = record(acting, acct, { checks: "complete", at: 2, newest })
  await held.reading
  const other = {
    tab: { tabId: 8, windowId: 1, incognito: false, site: "music", lastAccessed: 0, active: false, discarded: false, frozen: false },
    info: { site: "music", build: "test", signedIn: true, acct }
  } as never
  expect(await monitor.succeeded(other, "account")).toMatchObject({ kind: "accepted" })
  held.release()
  await recorded
  expect(await status()).toEqual([{ state: "working", jobs: [] }])
  monitor.dispose()
})
