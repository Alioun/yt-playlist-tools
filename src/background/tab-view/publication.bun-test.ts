import { expect, test } from "bun:test"
import { publicationWorld, contexts, publicationSeed, withFilter, drain as settle } from "../../../tools/fixtures/view-publication/harness"
import { a, b, deferred, signedIn } from "../../../tools/fixtures/tabs/harness"
import { alpha, beta, video, origin } from "../../../tools/fixtures/tab-projection/harness"
import { context, signalValue } from "../../../tools/fixtures/monitor/harness"
import { isBuildId } from "../../shared/contracts/vocabulary"
import { isTabView } from "../../shared/contracts/tab-view"
import { lists, videoAt } from "../../../tools/fixtures/add-flow/harness"

const targetIds = (h: Awaited<ReturnType<typeof publicationWorld>>) => h.sent.map(row => row.tabId).sort((left, right) => left - right)
const own = () => context("www", false, 1, a)

test("confirmed Filter changes target exactly the account with full normal and private views", async () => {
  const h = await publicationWorld()
  try {
    expect(await h.filter(false)).toEqual({ kind: "result", result: { ok: true } })
    await settle()
    await h.advance(249)
    expect(h.sent).toEqual([])
    await h.advance(1)
    expect(targetIds(h)).toEqual([1, 2, 9])
    expect(h.nativeTargets().sort((left, right) => left - right)).toEqual([1, 2, 9])
    for (const sent of h.sent) {
      const input = contexts.find(row => row.tab.tabId === sent.tabId)
      if (!input) throw Error("Unexpected native target")
      expect(isTabView(sent.view)).toBe(true)
      expect(sent.view).toEqual(await h.complete(input))
      expect(sent.view.filters.find(row => row.playlist === alpha)?.state.filter.on).toBe(false)
      expect(sent.view.acct).toBe(a)
      expect(JSON.stringify(sent.view)).not.toContain(b)
      expect(JSON.stringify(sent.view)).not.toMatch(/neverSend|never-send|cooldown|recent|recoveryExtension/)
    }
  } finally {
    await h.dispose()
  }
})

test("249 and 250 ms events coalesce with all-tab overlap and preserve the latest state", async () => {
  const h = await publicationWorld()
  try {
    await h.filter(false)
    await settle()
    await h.advance(249)
    await h.sessionChange([{ kind: "pause", paused: true }])
    await settle()
    expect(h.sent).toEqual([])
    await h.advance(1)
    expect(targetIds(h)).toEqual([1, 2, 9])
    expect(h.sent.every(row => row.view.paused)).toBe(true)
    await h.filter(true)
    await settle()
    await h.advance(249)
    expect(h.sent.filter(row => row.tabId === 1)).toHaveLength(1)
    await h.advance(1)
    expect(h.sent.filter(row => row.tabId === 1).map(row => row.at)).toEqual([250, 500])
    expect(h.sent.at(-1)?.view.filters.find(row => row.playlist === alpha)?.state.filter.on).toBe(true)
    expect(h.sent.filter(row => row.tabId === 3).map(row => row.at)).toEqual([499])
    expect(h.sent.filter(row => row.tabId === 10).map(row => row.at)).toEqual([499])
  } finally {
    await h.dispose()
  }
})

test("a changed shared setting reaches all known privacy scopes and an unchanged choice sends nothing", async () => {
  const h = await publicationWorld()
  try {
    expect((await h.owner.changeSharedSetting(origin, { kind: "default-percentage", value: 73 })).kind).toBe("committed")
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1, 2, 3, 9, 10])
    for (const row of h.sent) expect(row.view.features.find(feature => feature.id === "auto-add")?.options).toMatchObject({ pct: 73 })
    const count = h.sent.length
    await h.owner.changeSharedSetting(origin, { kind: "default-percentage", value: 73 })
    await settle()
    await h.advance(500)
    expect(h.sent).toHaveLength(count)
  } finally {
    await h.dispose()
  }
})

test("normal skips target the account's normal cores and leave private projections alone", async () => {
  const h = await publicationWorld()
  try {
    expect((await h.sessionChange([{ kind: "skip", acct: a, video, playlists: [alpha] }])).kind).toBe("committed")
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1, 2])
    for (const row of h.sent) expect(row.view.skips).toEqual({ kind: "normal", entries: [[video, [alpha]]] })
    await h.sessionChange([{ kind: "skip", acct: a, video, playlists: [alpha] }])
    await settle()
    await h.advance(250)
    expect(h.sent).toHaveLength(2)
  } finally {
    await h.dispose()
  }
})

test("account removal updates retained live cores without resurrecting registry records", async () => {
  const h = await publicationWorld()
  try {
    const events: unknown[] = [],
      unsubscribe = h.owner.subscribeView(event => events.push(event))
    const prepared = await h.owner.prepareAccountRemoval(origin, a)
    if (prepared.kind !== "confirmation-required") throw Error("Missing actual removal confirmation")
    expect((await h.owner.removeAccountSetup(origin, prepared.confirmation)).kind).toBe("committed")
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1, 2, 9])
    expect(events).toEqual([{ kind: "account-removed", source: "local", acct: a }])
    for (const sent of h.sent) {
      expect(sent.view.setup).toEqual({ kind: "none" })
      expect(sent.view.filters).toEqual([])
      expect(sent.view.skips?.entries).toEqual([])
    }
    const read = await h.owner.readSession()
    expect(read.kind === "memory" && [...read.memory.tabs.keys()]).toEqual([3])
    unsubscribe()
  } finally {
    await h.dispose()
  }
})

test("Setup edits target their account and last-choice removal emits one publication event", async () => {
  const seed = publicationSeed()
  seed.local[`doc:setup:${a}`] = { v: 1, gen: "last", at: 1, by: "fixture", data: { quickSave: alpha } }
  for (const key of Object.keys(seed.local)) if (key.startsWith(`doc:filter:${a}:`)) delete seed.local[key]
  const h = await publicationWorld(seed)
  try {
    const events: unknown[] = [],
      unsubscribe = h.owner.subscribeView(event => events.push(event))
    expect((await h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "quick-save" }, expected: { setup: "live", playlist: alpha }, playlist: beta })).kind).toBe("committed")
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1, 2, 9])
    expect(events).toEqual([{ kind: "setup-changed", source: "local", acct: a }])
    events.length = 0
    h.sent.length = 0
    expect((await h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "quick-save" }, expected: { setup: "live", playlist: beta }, playlist: null })).kind).toBe("committed")
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1, 2, 9])
    expect(events).toEqual([{ kind: "account-removed", source: "local", acct: a }])
    unsubscribe()
  } finally {
    await h.dispose()
  }
})

test("an event during projection suppresses that stale result and reads a fresh later view", async () => {
  const entered = deferred<void>(),
    release = deferred<void>()
  let block = true
  const h = await publicationWorld(undefined, ports => ({
    ...ports,
    producer: {
      ...ports.producer,
      async produce(input) {
        const projected = await ports.producer.produce(input)
        if (input.tab.tabId === 1 && block) {
          entered.resolve()
          await release.promise
          block = false
        }
        return projected
      }
    }
  }))
  try {
    await h.filter(false)
    await settle()
    await h.advance(250)
    await entered.promise
    await h.filter(true)
    await settle()
    release.resolve()
    await settle()
    expect(h.sent.filter(row => row.tabId === 1)).toEqual([])
    await h.advance(250)
    const pushes = h.sent.filter(row => row.tabId === 1)
    expect(pushes).toHaveLength(1)
    expect(pushes[0]?.view.filters.find(row => row.playlist === alpha)?.state.filter.on).toBe(true)
  } finally {
    release.resolve()
    await h.dispose()
  }
})

test("an event during send remains pending while unrelated tabs complete independently", async () => {
  const h = await publicationWorld(),
    entered = deferred<void>(),
    release = deferred<void>()
  h.hooks.view = async tabId => {
    if (tabId === 1) {
      entered.resolve()
      await release.promise
    }
    return { kind: "answered", result: null }
  }
  try {
    await h.filter(false)
    await settle()
    await h.advance(250)
    await entered.promise
    expect(targetIds(h)).toEqual([1, 2, 9])
    await h.filter(true)
    await settle()
    await h.advance(250)
    expect(h.sent.filter(row => row.tabId === 2)).toHaveLength(2)
    expect(h.sent.filter(row => row.tabId === 1)).toHaveLength(1)
    release.resolve()
    await settle()
    await h.advance(0)
    expect(h.sent.filter(row => row.tabId === 1).map(row => row.at)).toEqual([250, 500])
    expect(
      h.sent
        .filter(row => row.tabId === 1)
        .at(-1)
        ?.view.filters.find(row => row.playlist === alpha)?.state.filter.on
    ).toBe(true)
  } finally {
    release.resolve()
    await h.dispose()
  }
})

test("queued deliveries reject changed account privacy build and unavailable cores", async () => {
  for (const change of ["account", "privacy", "build", "gone", "disposed-core"] as const) {
    const h = await publicationWorld()
    try {
      await h.filter(false)
      await settle()
      const native = h.tabs.get(1)
      if (!native) throw Error("Missing seeded native tab")
      if (change === "account") h.accounts.set(1, signedIn(b))
      if (change === "privacy") h.tabs.set(1, { ...native, incognito: true })
      if (change === "build") {
        const next = "next-synthetic-build"
        if (!isBuildId(next)) throw Error("Invalid synthetic build")
        h.accounts.set(1, { ...signedIn(a), build: next })
      }
      if (change === "gone") h.tabs.delete(1)
      if (change === "disposed-core") h.accounts.delete(1)
      await h.advance(250)
      expect(targetIds(h)).toEqual([2, 9])
    } finally {
      await h.dispose()
    }
  }
})

test("progress cache registry cooldown and unchanged Monitor bookkeeping produce no publication", async () => {
  const h = await publicationWorld()
  try {
    await h.sessionChange([
      { kind: "recent", tuple: { acct: a, playlist: alpha, video, at: h.clock.wallNow() } },
      { kind: "cooldown", acct: a, until: 100 }
    ])
    const current = await h.owner.readSession()
    if (current.kind !== "memory") throw Error("Missing owner memory")
    const row = current.memory.tabs.get(1)
    if (!row) throw Error("Missing normal registry row")
    await h.sessionChange([{ kind: "tab-seen", tabId: 1, info: { ...row, at: 200 } }])
    const cache = await h.owner.readPlaylistCache({ acct: a, private: false })
    if (cache.kind !== "cache" || cache.authority.kind !== "eligible") throw Error("Missing cache authority")
    // A list without the Missing-marked playlist changes only the cache; listing it would clear its mark, a real setup change.
    expect((await h.owner.absorbPlaylistCache(cache.authority.capture, { kind: "list", acct: a, site: "www", at: 50, rows: [{ id: beta, title: "New cache title" }] })).kind).toBe("committed")
    await h.removal.deps.local.set({ [`progress:${a}:0`]: { syntheticProgress: 20 } })
    await h.monitor.signal(own(), signalValue("no-effect"), { kind: "job", online: true, otherRequestsAnswer: true })
    await h.monitor.flush()
    await settle()
    await h.advance(250)
    expect(h.sent).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("a real Monitor projection change targets its own tab", async () => {
  const h = await publicationWorld()
  try {
    const signal = signalValue("no-effect"),
      evidence = { kind: "job", online: true, otherRequestsAnswer: true } as const
    await h.monitor.signal(own(), signal, evidence)
    await settle()
    await h.monitor.signal(own(), signal, evidence)
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1])
    expect(h.sent[0]?.view.statuses.find(row => row.feature === "auto-add")?.state).toBe("not-working")
  } finally {
    await h.dispose()
  }
})

test("disposal removes subscriptions deadlines and pending late projections", async () => {
  const entered = deferred<void>(),
    release = deferred<void>()
  const h = await publicationWorld(undefined, ports => ({
    ...ports,
    producer: {
      ...ports.producer,
      async produce(input) {
        if (input.tab.tabId === 1) {
          entered.resolve()
          await release.promise
        }
        return ports.producer.produce(input)
      }
    }
  }))
  try {
    await h.filter(false)
    await settle()
    await h.advance(250)
    await entered.promise
    h.publisher.dispose()
    expect(h.subscriptions).toEqual({ owner: 0, monitor: 0, tabs: 0, privateSkips: 0 })
    expect(h.clock.pending).toBe(0)
    const count = h.sent.length
    release.resolve()
    await settle()
    await h.advance(1000)
    await h.filter(true)
    await settle()
    await h.advance(250)
    expect(h.sent).toHaveLength(count)
    expect(h.clock.pending).toBe(0)
  } finally {
    release.resolve()
    await h.dispose()
  }
})

test("owner Tabs and Monitor lifetime revocation cancel queued publisher work", async () => {
  for (const lifetime of ["owner", "tabs", "monitor", "flow"] as const) {
    const h = await publicationWorld()
    try {
      await h.filter(false)
      await settle()
      if (lifetime === "owner") await h.owner.dispose()
      else if (lifetime === "tabs") h.engine.dispose()
      else if (lifetime === "monitor") h.monitor.dispose()
      else await h.flow.quiesce()
      expect(h.clock.pending).toBe(0)
      await h.advance(1000)
      expect(h.sent).toEqual([])
    } finally {
      await h.dispose()
    }
  }
})

test("confirmed adopted sync Filter changes target the account and equal data generations send nothing", async () => {
  const seed = publicationSeed(),
    pushed: Record<string, string> = {}
  let sequence = 0
  seed.sync = { "s:meta": { v: 1, id: "history", created: 1 } }
  for (const [name, raw] of Object.entries(seed.local))
    if (name.startsWith("doc:") && raw && typeof raw === "object" && !Array.isArray(raw)) {
      const value = { ...raw, gen: `local-${++sequence}`, at: 1 }
      seed.local[name] = value
      seed.sync[`s:${name.slice(4)}`] = structuredClone(value)
      pushed[name] = value.gen
    }
  seed.local.device = { id: "fixture", consent: { v: 1, at: 1 }, syncOn: true }
  seed.local.sync = { joined: "history", pushed, status: "ok", editedSinceOff: false }
  const h = await publicationWorld(seed)
  try {
    h.removal.foreign(state => {
      state.sync[`s:filter:${a}:${alpha}`] = withFilter(false, "remote-1", 20)
    })
    expect((await h.owner.receiveSyncDocument({ kind: "filter", acct: a, playlist: alpha })).kind).toBe("adopted")
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1, 2, 9])
    for (const row of h.sent) expect(row.view.filters.find(filter => filter.playlist === alpha)?.state.filter.on).toBe(false)
    h.sent.length = 0
    h.removal.foreign(state => {
      state.sync[`s:filter:${a}:${alpha}`] = withFilter(false, "remote-2", 21)
    })
    expect((await h.owner.receiveSyncDocument({ kind: "filter", acct: a, playlist: alpha })).kind).toBe("adopted")
    await settle()
    await h.advance(500)
    expect(h.sent).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("disposal before a publication deadline cancels every queued one-shot timer", async () => {
  const h = await publicationWorld()
  try {
    await h.filter(false)
    await settle()
    expect(h.clock.pending).toBe(3)
    h.publisher.dispose()
    expect(h.subscriptions).toEqual({ owner: 0, monitor: 0, tabs: 0, privateSkips: 0 })
    expect(h.clock.pending).toBe(0)
    await h.advance(250)
    expect(h.sent).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("actual private skips publish only to the account's private core after the memory commit", async () => {
  const h = await publicationWorld()
  try {
    const stored = h.removal.state()
    const privateOrigin = { kind: "tab", tabId: 9, incognito: true } as const
    expect(await h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, privateOrigin)).toEqual({ kind: "remembered", scope: "private" })
    await settle()
    await h.advance(249)
    expect(h.sent).toEqual([])
    await h.advance(1)
    expect(targetIds(h)).toEqual([9])
    expect(h.sent[0]?.view.skips).toEqual({ kind: "private", entries: [[video, [alpha]]] })
    expect(h.removal.state()).toEqual(stored)
    await h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, privateOrigin)
    await settle()
    await h.advance(250)
    expect(h.sent).toHaveLength(1)
    await h.flow.skip({ kind: "unskip", acct: a, video }, privateOrigin)
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([9, 9])
    expect(h.sent.at(-1)?.view.skips).toEqual({ kind: "private", entries: [] })
  } finally {
    await h.dispose()
  }
})

test("private skip load failure and withholding create no publication deadline", async () => {
  const h = await publicationWorld(),
    entered = deferred<void>(),
    release = deferred<void>()
  const read = h.session.read
  let reads = 0
  h.session.read = async () => {
    if (++reads === 2) {
      entered.resolve()
      await release.promise
      return { kind: "unavailable", reason: "stale" }
    }
    return read()
  }
  try {
    const changing = h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, { kind: "tab", tabId: 9, incognito: true })
    await entered.promise
    await settle()
    expect(h.clock.pending).toBe(0)
    expect(h.sent).toEqual([])
    release.resolve()
    expect(await changing).toEqual({ kind: "unavailable", reason: "stale" })
    await h.advance(250)
    expect(h.sent).toEqual([])
    expect(h.clock.pending).toBe(0)
    expect((await h.complete(context("www", true, 9, a))).skips).toEqual({ kind: "private", entries: [] })
  } finally {
    release.resolve()
    h.session.read = read
    await h.dispose()
  }
})

test("concurrent private events coalesce to current projections within their account", async () => {
  const h = await publicationWorld()
  try {
    const privateOrigin = { kind: "tab", tabId: 9, incognito: true } as const
    await Promise.all([
      h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, privateOrigin),
      h.flow.skip({ kind: "skip", acct: a, video, playlists: [beta] }, privateOrigin),
      h.flow.skip({ kind: "skip", acct: b, video, playlists: "all" }, privateOrigin)
    ])
    await settle()
    await h.advance(249)
    expect(h.sent).toEqual([])
    await h.advance(1)
    expect(targetIds(h)).toEqual([9, 10])
    expect(h.sent.find(row => row.tabId === 9)?.view.skips).toEqual({ kind: "private", entries: [[video, [alpha, beta]]] })
    expect(h.sent.find(row => row.tabId === 10)?.view.skips).toEqual({ kind: "private", entries: [[video, "all"]] })
    expect(h.nativeTargets().sort((left, right) => left - right)).toEqual([9, 10])
  } finally {
    await h.dispose()
  }
})

test("private source revocation and repeated disposal clear every deadline and subscription", async () => {
  const h = await publicationWorld()
  try {
    await h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, { kind: "tab", tabId: 9, incognito: true })
    await settle()
    expect(h.clock.pending).toBe(1)
    await h.flow.quiesce()
    await h.flow.quiesce()
    h.publisher.dispose()
    h.publisher.dispose()
    expect(h.subscriptions).toEqual({ owner: 0, monitor: 0, tabs: 0, privateSkips: 0 })
    expect(h.clock.pending).toBe(0)
    await h.advance(1000)
    expect(h.sent).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("normal AddFlow skips reach normal cores through the owner without a private event", async () => {
  const h = await publicationWorld(),
    events: unknown[] = []
  const off = h.flow.subscribePrivateSkips(event => events.push(event))
  try {
    expect(await h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, { kind: "tab", tabId: 1, incognito: false })).toEqual({ kind: "remembered", scope: "normal" })
    await settle()
    await h.advance(250)
    expect(targetIds(h)).toEqual([1, 2])
    expect(events).toEqual([])
    for (const row of h.sent) expect(row.view.skips).toEqual({ kind: "normal", entries: [[video, [alpha]]] })
  } finally {
    off()
    await h.dispose()
  }
})

test("internal automatic Undo publishes the actual private skip through the real owner consumer", async () => {
  const seed = publicationSeed()
  seed.local[`doc:setup:${a}`] = { v: 1, gen: "automatic", at: 1, by: "synthetic", data: { autoAdd: [{ pl: lists.music, takes: "both" }] } }
  const h = await publicationWorld(seed, ports => ports, true)
  try {
    if (!h.actions) throw Error("Missing synthetic job ports for actual AddFlow")
    const origin = { kind: "tab", tabId: 9, incognito: true } as const
    const video = videoAt(1),
      stored = h.removal.state().session
    const added = await h.flow.add({ via: "auto-add", site: "www", video, playlists: [lists.music], channel: null }, origin)
    if (added.kind !== "report" || !added.undo) throw Error("Missing actual automatic Undo")
    await settle()
    await h.advance(250)
    expect(h.sent).toEqual([])
    expect(await h.flow.undo(added.undo, origin)).toEqual({ kind: "undone" })
    expect(h.actions.has(a, lists.music, video)).toBe(false)
    await settle()
    await h.advance(249)
    expect(h.sent).toEqual([])
    await h.advance(1)
    expect(targetIds(h)).toEqual([9])
    expect(h.sent[0]?.view.skips).toEqual({ kind: "private", entries: [[video, [lists.music]]] })
    expect(h.sent[0]?.view).toEqual(await h.complete(context("www", true, 9, a)))
    expect(h.removal.state().session).toEqual(stored)
    await h.flow.quiesce()
    expect(h.clock.pending).toBe(0)
    expect(h.subscriptions).toEqual({ owner: 0, monitor: 0, tabs: 0, privateSkips: 0 })
  } finally {
    await h.dispose()
  }
})
