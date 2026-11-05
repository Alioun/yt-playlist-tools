import { expect, test } from "bun:test"
import { createLocalFilterWriter, createStartingLocalFilterWriter, type ConfirmedViewChange } from "./local-filter-writer"
import { createRemovalHarness } from "../../../tools/fixtures/account-removal-execution/run"
import { syncJoinHarness } from "../../../tools/fixtures/account-removal-admission/run"
import { publicationSeed } from "../../../tools/fixtures/view-publication/harness"
import { a, b, deferred } from "../../../tools/fixtures/tabs/harness"
import { alpha, video, origin } from "../../../tools/fixtures/tab-projection/harness"
import { viewChangeTarget } from "../tab-view/publication"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"

const filter = { acct: a, playlist: alpha, desired: { mode: "allow", on: false }, clearListedChannels: "not-confirmed" } as const

test("confirmed view subscriptions survive sync-off edits and unsubscribe independently", async () => {
  const h = createRemovalHarness(publicationSeed()),
    owner = createLocalFilterWriter(h.deps)
  const first: ConfirmedViewChange[] = [],
    second: ConfirmedViewChange[] = []
  const stop = owner.subscribeView(event => first.push(event))
  owner.subscribeView(event => second.push(event))
  try {
    expect(await owner.change(origin, filter)).toEqual({ kind: "result", result: { ok: true } })
    expect(first).toEqual([{ kind: "filter-changed", acct: a, playlist: alpha, source: "local" }])
    stop()
    stop()
    await owner.change(origin, { ...filter, desired: { mode: "allow", on: true } })
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(2)
    await owner.change(origin, { ...filter, desired: { mode: "allow", on: true } })
    expect(second).toHaveLength(2)
    await owner.change({ ...origin, incognito: true }, filter)
    expect(second).toHaveLength(2)
  } finally {
    await owner.dispose()
  }
})

test("a confirmed view subscription made before startup readiness receives events once ready", async () => {
  const h = createRemovalHarness(publicationSeed()),
    owner = createStartingLocalFilterWriter({ ...h.deps, startup: h.startup })
  const events: ConfirmedViewChange[] = []
  owner.subscribeView(event => events.push(event))
  try {
    expect(await owner.ready()).toBe("ok")
    expect(await owner.change(origin, filter)).toEqual({ kind: "result", result: { ok: true } })
    expect(events).toEqual([{ kind: "filter-changed", acct: a, playlist: alpha, source: "local" }])
  } finally {
    await owner.dispose()
  }
})

test("Filter storage must confirm before an event and queued session work keeps its own account", async () => {
  const h = createRemovalHarness(publicationSeed()),
    entered = deferred<void>(),
    release = deferred<void>()
  const storage = h.deps.local
  const owner = createLocalFilterWriter({
    ...h.deps,
    local: {
      ...storage,
      async set(items) {
        await storage.set(items)
        entered.resolve()
        await release.promise
      }
    }
  })
  const events: ConfirmedViewChange[] = []
  owner.subscribeView(event => events.push(event))
  try {
    const read = await owner.readSession()
    if (read.kind !== "memory") throw Error("Missing real owner revision")
    const changing = owner.change(origin, filter)
    await entered.promise
    const queued = owner.changeSession({ revision: read.revision, now: 10, edits: [{ kind: "skip", acct: b, video, playlists: "all" }] })
    expect(events).toEqual([])
    release.resolve()
    await changing
    await queued
    expect(events).toEqual([
      { kind: "filter-changed", source: "local", acct: a, playlist: alpha },
      { kind: "skips-changed", acct: b, scope: "normal" }
    ])
  } finally {
    release.resolve()
    await owner.dispose()
  }
})

test("refused failed ignored and unreadable Filter writes emit no confirmed view event", async () => {
  for (const mode of ["reject", "ignore", "readback-failed", "divergent"] as const) {
    const h = createRemovalHarness(publicationSeed()),
      storage = h.deps.local
    let written = false
    const owner = createLocalFilterWriter({
      ...h.deps,
      local: {
        async get(keys) {
          if (written && mode === "readback-failed") throw Error("Synthetic unreadable storage")
          return storage.get(keys)
        },
        async set(items) {
          written = true
          if (mode === "reject") throw Error("Synthetic rejected storage")
          if (mode === "ignore") return
          await storage.set(items)
          if (mode === "divergent")
            h.foreign(state => {
              state.local.foreign = true
            })
        }
      }
    })
    const events: ConfirmedViewChange[] = [],
      revoked: string[] = []
    owner.subscribeView(
      event => events.push(event),
      () => revoked.push("revoked")
    )
    try {
      let result: unknown
      try {
        result = await owner.change(origin, filter)
      } catch (error) {
        result = error
      }
      expect(result).not.toEqual({ kind: "result", result: { ok: true } })
      expect(events).toEqual([])
      expect(revoked).toEqual(["revoked"])
    } finally {
      await owner.dispose()
    }
  }
})

test("session notifications compare committed values and ignore net-zero and bookkeeping edits", async () => {
  const h = createRemovalHarness(publicationSeed()),
    owner = createLocalFilterWriter(h.deps),
    events: ConfirmedViewChange[] = []
  owner.subscribeView(event => events.push(event))
  try {
    const read = await owner.readSession()
    if (read.kind !== "memory") throw Error("Missing session revision")
    const write = (edits: Parameters<typeof owner.changeSession>[0]["edits"]) => owner.changeSession({ revision: read.revision, now: 10, edits })
    await write([
      { kind: "pause", paused: true },
      { kind: "pause", paused: false },
      { kind: "skip", acct: a, video, playlists: [alpha] },
      { kind: "unskip", acct: a, video }
    ])
    expect(events).toEqual([])
    await write([
      { kind: "pause", paused: true },
      { kind: "skip", acct: a, video, playlists: [alpha] },
      { kind: "skip", acct: b, video, playlists: "all" }
    ])
    expect(events).toEqual([{ kind: "pause-changed" }, { kind: "skips-changed", acct: a, scope: "normal" }, { kind: "skips-changed", acct: b, scope: "normal" }])
    events.length = 0
    await write([
      { kind: "pause", paused: true },
      { kind: "skip", acct: a, video, playlists: [alpha] },
      { kind: "cooldown", acct: a, until: 99 }
    ])
    expect(events).toEqual([])
  } finally {
    await owner.dispose()
  }
})

function joinSeed(removed = false) {
  const seed = publicationSeed(),
    remote: JsonObject = { "s:meta": { v: 1, id: "remote-history", created: 1 } }
  seed.local.device = { id: "local", consent: { v: 1, at: 1 }, syncOn: false }
  seed.local.sync = { joined: "old-history", pushed: {}, status: "off", editedSinceOff: true, everEdited: true }
  let n = 0
  for (const [name, raw] of Object.entries(seed.local))
    if (name.startsWith("doc:") && raw && typeof raw === "object" && !Array.isArray(raw)) {
      const document = { ...raw, gen: `local-${++n}`, at: 1, by: "local" }
      seed.local[name] = document
      remote[`s:${name.slice(4)}`] = { ...document, gen: `remote-${n}`, at: 20, by: "remote" }
    }
  remote[`s:filter:${a}:${alpha}`] = { v: 1, gen: "remote-filter", at: 20, by: "remote", data: { mode: "allow", on: false, channels: [] } }
  if (removed) {
    remote[`s:setup:${a}`] = { v: 1, gen: "remote-remove", at: 20, by: "remote", deleted: true }
    remote[`s:filter:${a}:${alpha}`] = { v: 1, gen: "remote-filter-remove", at: 20, by: "remote", deleted: true }
  }
  return { local: seed.local, sync: remote, session: { tabs: { "1": { site: "www", signedIn: true, acct: a } }, paused: false } }
}

test("actual sync join changes Filters and tombstoned accounts through confirmed account events", async () => {
  for (const removed of [false, true]) {
    const h = syncJoinHarness(joinSeed(removed)),
      owner = h.owner(false)
    const events: ConfirmedViewChange[] = []
    owner.subscribeView(event => events.push(event))
    try {
      const review = await owner.beginSyncJoin(origin).result
      if (review.kind !== "choice-required") throw Error("Missing actual sync-join choice")
      expect((await owner.applySyncJoin(origin, { kind: "choice", review: review.review, choice: "use-synced" })).kind).toBe("committed")
      const accountEvents = events.filter(event => "acct" in event && event.acct === a)
      expect(accountEvents).toEqual([removed ? { kind: "account-removed", acct: a, source: "sync" } : { kind: "filter-changed", acct: a, playlist: alpha, source: "sync" }])
      expect(accountEvents.map(viewChangeTarget)).toEqual([{ kind: "account", acct: a, scope: "all" }])
      if (removed) {
        const stored = h.state().session.tabs
        expect(isJsonValue(stored)).toBe(true)
        expect(stored).toEqual({})
      }
    } finally {
      await owner.dispose()
    }
  }
})
