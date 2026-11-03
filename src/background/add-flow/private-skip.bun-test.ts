import { expect, test } from "bun:test"
import { createLocalFilterWriter } from "../store/local-filter-writer"
import type { SessionPort, SessionRead } from "../store/session-memory"
import { createRemovalHarness, removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { harness, lists, videoAt, shortcut, no, tabOrigin } from "../../../tools/fixtures/add-flow/harness"
import { a, b, build, deferred, settle } from "../../../tools/fixtures/tabs/harness"

const video = videoAt(1),
  second = videoAt(2),
  { music, learning } = lists
const privateTab = tabOrigin(9, true),
  normalTab = tabOrigin(1)
const ui = { kind: "ui", windowId: 1, incognito: false } as const
type ReadHook = (read: () => Promise<SessionRead>) => Promise<SessionRead>
const pass: ReadHook = read => read()

function world() {
  const removal = createRemovalHarness({ ...removalFixture(), session: { paused: false } })
  const owner = createLocalFilterWriter(removal.deps)
  const reads: ReadHook[] = []
  const port: SessionPort = {
    read: () => (reads.shift() ?? pass)(() => owner.readSession()),
    change: change => owner.changeSession(change)
  }
  const h = harness({ session: port, clock: 1_700_000_000_000 })
  h.tab(1, a)
  h.tab(9, a)
  h.setup(a, { kind: "shortcut", shortcut }, [{ playlist: music }])
  h.setup(a, { kind: "auto-add" }, [{ playlist: music }, { playlist: learning }])
  const events: unknown[] = []
  const unsubscribe = h.flow.subscribePrivateSkips(event => events.push(event))
  async function skips(acct = a) {
    const read = await owner.readSession()
    if (read.kind !== "memory") throw Error("Missing actual owner revision")
    return h.flow.readPrivateSkips({
      revision: read.revision,
      context: {
        tab: { tabId: 9, incognito: true, site: "www" },
        info: { site: "www", build, signedIn: true, acct }
      }
    })
  }
  return {
    ...h,
    owner,
    removal,
    reads,
    events,
    skips,
    async dispose() {
      unsubscribe()
      await h.flow.quiesce()
      await owner.dispose()
    }
  }
}

function withheld() {
  const entered = deferred<void>(),
    release = deferred<void>()
  const read: ReadHook = async load => {
    entered.resolve()
    await release.promise
    return load()
  }
  return { entered, release, read }
}
const skip = { kind: "skip", acct: a, video, playlists: [music] } as const
const auto = { via: "auto-add", site: "www", video, playlists: [music], channel: null } as const

test("private skip and unskip emit actual changes and isolate listener failures and unsubscribe", async () => {
  const h = world()
  try {
    const stored = h.removal.state().session
    const revoke: string[] = [],
      observed: unknown[] = []
    h.flow.subscribePrivateSkips(
      () => {
        throw Error("Synthetic listener failure")
      },
      () => {
        throw Error("Synthetic revoke failure")
      }
    )
    const off = h.flow.subscribePrivateSkips(
      event => observed.push(event),
      () => revoke.push("revoked")
    )
    expect(await h.flow.skip(skip, privateTab)).toEqual({ kind: "remembered", scope: "private" })
    expect(await h.skips()).toEqual({ kind: "skips", entries: [[video, [music]]] })
    await h.flow.skip(skip, privateTab)
    expect(h.events).toEqual([{ acct: a, scope: "private" }])
    expect(observed).toEqual(h.events)
    off()
    off()
    await h.flow.skip({ kind: "unskip", acct: a, video }, privateTab)
    await h.flow.skip({ kind: "unskip", acct: a, video }, privateTab)
    expect(await h.skips()).toEqual({ kind: "skips", entries: [] })
    expect(h.events).toEqual([
      { acct: a, scope: "private" },
      { acct: a, scope: "private" }
    ])
    expect(observed).toHaveLength(1)
    expect(h.removal.state().session).toEqual(stored)
    await h.flow.quiesce()
    await h.flow.quiesce()
    expect(revoke).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("a normal skip uses one confirmed owner event and emits no private event", async () => {
  const h = world(),
    ownerEvents: unknown[] = []
  const off = h.owner.subscribeView(event => ownerEvents.push(event))
  try {
    expect(await h.flow.skip(skip, normalTab)).toEqual({ kind: "remembered", scope: "normal" })
    expect(ownerEvents).toEqual([{ kind: "skips-changed", acct: a, scope: "normal" }])
    expect(h.events).toEqual([])
    expect(h.removal.state().session[`skips:${a}`]).toEqual({ [video]: [music] })
    expect(await h.skips()).toEqual({ kind: "skips", entries: [] })
  } finally {
    off()
    await h.dispose()
  }
})

test("private skip waits for a successful fresh load before changing memory or notifying", async () => {
  const h = world(),
    gate = withheld()
  try {
    h.reads.push(pass, gate.read)
    const changing = h.flow.skip(skip, privateTab)
    await gate.entered.promise
    expect(h.events).toEqual([])
    expect(await h.skips()).toEqual({ kind: "skips", entries: [] })
    gate.release.resolve()
    expect(await changing).toEqual({ kind: "remembered", scope: "private" })
    expect(await h.skips()).toEqual({ kind: "skips", entries: [[video, [music]]] })
    expect(h.events).toEqual([{ acct: a, scope: "private" }])
  } finally {
    gate.release.resolve()
    await h.dispose()
  }
})

test("unavailable and rejected fresh loads retain the prior private skip value without an event", async () => {
  for (const fail of [
    async (): Promise<SessionRead> => ({ kind: "unavailable", reason: "stale" }),
    async (): Promise<SessionRead> => {
      throw Error("Synthetic fresh read rejection")
    }
  ]) {
    const h = world()
    try {
      await h.flow.skip(skip, privateTab)
      h.events.length = 0
      h.reads.push(pass, fail)
      const result = await h.flow.skip({ kind: "unskip", acct: a, video }, privateTab)
      expect(result.kind).not.toBe("remembered")
      expect(await h.skips()).toEqual({ kind: "skips", entries: [[video, [music]]] })
      expect(h.events).toEqual([])
    } finally {
      await h.dispose()
    }
  }
})

test("account removal during a withheld private skip rejects the captured revision", async () => {
  const h = world(),
    gate = withheld()
  try {
    h.reads.push(pass, gate.read)
    const changing = h.flow.skip(skip, privateTab)
    await gate.entered.promise
    const prepared = await h.owner.prepareAccountRemoval(ui, a)
    if (prepared.kind !== "confirmation-required") throw Error("Missing actual removal confirmation")
    expect((await h.owner.removeAccountSetup(ui, prepared.confirmation)).kind).toBe("committed")
    gate.release.resolve()
    expect(await changing).toEqual({ kind: "unavailable", reason: "revision" })
    expect(await h.skips()).toEqual({ kind: "skips", entries: [] })
    expect(h.events).toEqual([])
    expect(h.removal.state().session[`skips:${a}`]).toBeUndefined()
  } finally {
    gate.release.resolve()
    await h.dispose()
  }
})

test("concurrent private commits merge into current memory across videos and accounts", async () => {
  const h = world(),
    gate = withheld()
  try {
    const stored = h.removal.state().session
    h.reads.push(pass, gate.read)
    const first = h.flow.skip(skip, privateTab)
    await gate.entered.promise
    expect(await h.flow.skip({ ...skip, playlists: [learning] }, privateTab)).toEqual({ kind: "remembered", scope: "private" })
    expect(await h.flow.skip({ ...skip, acct: b, video: second }, privateTab)).toEqual({ kind: "remembered", scope: "private" })
    gate.release.resolve()
    expect(await first).toEqual({ kind: "remembered", scope: "private" })
    expect(await h.skips()).toEqual({ kind: "skips", entries: [[video, [learning, music]]] })
    expect(await h.skips(b)).toEqual({ kind: "skips", entries: [[second, [music]]] })
    expect(h.events).toEqual([
      { acct: a, scope: "private" },
      { acct: b, scope: "private" },
      { acct: a, scope: "private" }
    ])
    expect(h.removal.state().session).toEqual(stored)
  } finally {
    gate.release.resolve()
    await h.dispose()
  }
})

test("quiesce and owner disposal revoke private listeners and prevent a withheld commit", async () => {
  for (const stop of ["quiesce", "owner", "writable"] as const) {
    const h = world(),
      gate = withheld(),
      revoked: string[] = []
    h.flow.subscribePrivateSkips(
      () => {
        throw Error("No late private event")
      },
      () => revoked.push("revoked")
    )
    try {
      h.reads.push(pass, gate.read)
      const changing = h.flow.skip(skip, privateTab)
      await gate.entered.promise
      const draining = stop === "quiesce" ? h.flow.quiesce() : Promise.resolve()
      if (stop === "owner") await h.owner.dispose()
      if (stop === "writable") h.withdraw()
      gate.release.resolve()
      expect(await changing).toEqual({ kind: "stopped" })
      await draining
      await h.flow.quiesce()
      await h.flow.quiesce()
      expect(h.events).toEqual([])
      expect(revoked).toEqual(["revoked"])
      h.flow.subscribePrivateSkips(
        () => {},
        () => revoked.push("late")
      )()
      expect(revoked).toEqual(["revoked", "late"])
    } finally {
      gate.release.resolve()
      await h.dispose()
    }
  }
})

test("internal untick commits its private skip before queued auto-add and keeps removal Undo", async () => {
  const h = world(),
    gate = withheld()
  try {
    const stored = h.removal.state().session
    h.put(a, music, video)
    h.reads.push(pass, pass, pass, gate.read)
    const removing = h.flow.remove({ site: "www", playlist: music, video, opener: "quick-save", tick: null }, privateTab)
    await gate.entered.promise
    expect(h.events).toEqual([])
    const queued = h.flow.add(auto, privateTab)
    await settle()
    gate.release.resolve()
    const removed = await removing
    expect(removed).toMatchObject({ kind: "removed", undo: { kind: "remove" } })
    expect(await queued).toMatchObject({ kind: "report", outcomes: { [music]: { kind: "skipped" } } })
    expect(h.count("add")).toBe(0)
    expect(h.events).toEqual([{ acct: a, scope: "private" }])
    expect(await h.skips()).toEqual({ kind: "skips", entries: [[video, [music]]] })
    if (removed.kind !== "removed" || !removed.undo) throw Error("Missing removal Undo")
    expect(await h.flow.undo(removed.undo, privateTab)).toEqual({ kind: "undone" })
    expect(h.has(a, music, video)).toBe(true)
    expect(h.removal.state().session).toEqual(stored)
  } finally {
    gate.release.resolve()
    await h.dispose()
  }
})

test("automatic add Undo uses the same private event source and leaves later auto-add skipped", async () => {
  const h = world()
  try {
    const report = await h.flow.add(auto, privateTab)
    if (report.kind !== "report" || !report.undo) throw Error("Missing automatic add Undo")
    expect(h.events).toEqual([])
    expect(await h.flow.undo(report.undo, privateTab)).toEqual({ kind: "undone" })
    expect(h.events).toEqual([{ acct: a, scope: "private" }])
    expect(await h.skips()).toEqual({ kind: "skips", entries: [[video, [music]]] })
    expect(await h.flow.add(auto, privateTab)).toMatchObject({ kind: "report", outcomes: { [music]: { kind: "skipped" } } })
    expect(await h.flow.undo(report.undo, privateTab)).toEqual({ kind: "expired" })
    expect(h.events).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})

test("private recent-add and rate-limit facts remain visible while their fresh read is withheld", async () => {
  for (const limited of [false, true]) {
    const h = world(),
      gate = withheld()
    try {
      h.reads.push(pass, gate.read)
      if (limited) h.script.add.push(() => no<"add">("failed", 429))
      const first = h.flow.add({ via: "shortcut", site: "www", video, shortcut }, privateTab)
      await gate.entered.promise
      const queued = h.flow.add({ ...auto, video: limited ? second : video }, privateTab)
      await settle()
      expect(h.count("add")).toBe(1)
      gate.release.resolve()
      await first
      expect(await queued).toMatchObject({
        kind: "report",
        outcomes: {
          [music]: limited ? { kind: "failed", failure: "paused" } : { kind: "already-in" }
        }
      })
      expect(h.events).toEqual([])
    } finally {
      gate.release.resolve()
      await h.dispose()
    }
  }
})

test("an older withheld skip retains a newer private recent-add fact at commit time", async () => {
  const h = world(),
    gate = withheld()
  try {
    h.reads.push(pass, gate.read)
    const changing = h.flow.skip({ ...skip, video: second }, privateTab)
    await gate.entered.promise
    h.advance(1000)
    expect(await h.flow.add({ via: "shortcut", site: "www", video, shortcut }, privateTab)).toMatchObject({ kind: "report", outcomes: { [music]: { kind: "added" } } })
    gate.release.resolve()
    expect(await changing).toEqual({ kind: "remembered", scope: "private" })
    const sent = h.calls.length
    expect(await h.flow.add(auto, privateTab)).toMatchObject({ kind: "report", outcomes: { [music]: { kind: "already-in" } } })
    expect(h.calls).toHaveLength(sent)
    expect(await h.skips()).toEqual({ kind: "skips", entries: [[second, [music]]] })
  } finally {
    gate.release.resolve()
    await h.dispose()
  }
})
