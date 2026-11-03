import { describe, expect, test } from "bun:test"
import { createLocalFilterWriter, createStartingLocalFilterWriter } from "./local-filter-writer"
import type { TabProjectionRead } from "./tab-projection"
import { a, b, alpha, beta, video, signedIn, normalWindow, origin, document, projectionSeed, projectionWorld, deferred, settle } from "../../../tools/fixtures/tab-projection/harness"
import expected from "../../../tools/fixtures/tab-projection/expected.json"
import { runTabProjectionConsumer } from "../../../tools/fixtures/tab-projection/run"

function projection(read: TabProjectionRead) {
  if (read.kind !== "projection") throw Error(`Projection unavailable: ${read.kind}`)
  return read.projection
}
function account(read: TabProjectionRead) {
  const view = projection(read)
  if (view.account.kind !== "signed-in") throw Error("Expected signed-in projection")
  return view.account
}
function noNativeObjects(value: unknown) {
  expect(value instanceof Map || value instanceof Set).toBe(false)
  if (Array.isArray(value)) for (const item of value) noNativeObjects(item)
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) noNativeObjects(item)
}

describe("canonical owner tab storage projection", () => {
  test("real-owner consumer completes without queue re-entry", async () => {
    const result = await runTabProjectionConsumer()
    expect(result.records).toEqual<unknown>(expected)
    expect(result.writes).toBe(0)
    expect(result.syncReads).toBe(0)
  }, 2_000)

  test("exact account projection excludes foreign records and whole-session authority", async () => {
    const h = projectionWorld(),
      before = h.removal.state(),
      clocks = h.clockReads
    try {
      const read = await h.owner.readTabProjection(signedIn)
      expect(read).toEqual<unknown>(expected.normal)
      expect(JSON.stringify(read)).not.toContain(b)
      expect(JSON.stringify(read)).not.toContain("neverSend")
      noNativeObjects(read)
      expect(h.removal.state()).toEqual(before)
      expect(h.writes()).toEqual([])
      expect(h.syncReads()).toEqual([])
      expect(h.removal.counts()).toEqual({ generations: 0, stamps: 0, subscriptions: 0 })
      expect(h.clockReads).toBe(clocks)
      expect(h.removal.schedules).toEqual([])
    } finally {
      await h.owner.dispose()
    }
  })

  test("each account retains only its own setup, filter states and skips", async () => {
    const h = projectionWorld()
    try {
      const result = account(await h.owner.readTabProjection({ private: false, account: { kind: "signed-in", acct: b } }))
      expect(result).toEqual<unknown>({
        kind: "signed-in",
        acct: b,
        setup: {
          kind: "value",
          view: {
            kind: "live",
            acct: b,
            setup: {
              label: { name: "Beta" },
              autoAdd: [],
              targets: {},
              quickSave: null,
              musicSave: beta,
              gather: null,
              marks: {}
            }
          }
        },
        filters: [
          { playlist: "PL_bad", state: { kind: "invalid" } },
          { playlist: "PL_new", state: { kind: "newer-version", version: 20 } }
        ],
        skips: { kind: "normal", entries: [["bbbbbbbbbbb", [beta]]] }
      })
    } finally {
      await h.owner.dispose()
    }
  })

  test("malformed and newer foreign Setup documents cannot block this account", async () => {
    for (const raw of [document({ musicSave: 42 }), document({}, 9)]) {
      const seed = projectionSeed()
      seed.local[`doc:setup:${b}`] = raw
      const h = projectionWorld(seed)
      try {
        expect(await h.owner.readTabProjection(signedIn)).toEqual<unknown>(expected.normal)
      } finally {
        await h.owner.dispose()
      }
    }
  })

  test("private projection never borrows normal skips and shares only pause", async () => {
    const h = projectionWorld(),
      before = h.removal.state()
    try {
      expect(await h.owner.readTabProjection({ ...signedIn, private: true })).toEqual<unknown>(expected.private)
      expect(h.removal.state()).toEqual(before)
      expect(h.writes()).toEqual([])
    } finally {
      await h.owner.dispose()
    }
  })

  test("signed-out and unknown accounts never receive the last-account fallback", async () => {
    const h = projectionWorld()
    try {
      expect(await h.owner.readTabProjection({ private: false, account: { kind: "signed-out" } })).toEqual<unknown>(expected.signedOut)
      expect(await h.owner.readTabProjection({ private: false, account: { kind: "unknown" } })).toEqual<unknown>(expected.unknown)
      expect(await h.owner.readLastAccount(normalWindow)).toEqual({ kind: "account", acct: b })
    } finally {
      await h.owner.dispose()
    }
  })

  test("consumer mutation cannot change storage or the next projection", async () => {
    const h = projectionWorld(),
      before = h.removal.state()
    try {
      const first = projection(await h.owner.readTabProjection(signedIn)),
        own = first.account
      if (first.settings.kind !== "value" || own.kind !== "signed-in" || own.setup.kind !== "value" || own.setup.view.kind !== "live" || own.skips.kind !== "normal")
        throw Error("Fixture projection failed")
      Reflect.set(first.settings.settings.autoAdd, "pct", 0)
      Reflect.set(first.settings.settings.shortcuts.list, "length", 0)
      Reflect.set(own.setup.view.setup.targets, "orig01", alpha)
      Reflect.set(own.setup.view.setup.autoAdd, "length", 0)
      if (own.setup.view.setup.label) Reflect.set(own.setup.view.setup.label, "name", "mutated")
      const filter = own.filters[0]
      if (filter?.state.kind === "value") Reflect.set(filter.state.filter.channels, "length", 0)
      const skip = own.skips.entries[0]
      if (skip && skip[1] !== "all") Reflect.set(skip[1], "length", 0)
      Reflect.set(own.skips.entries, "length", 0)
      expect(await h.owner.readTabProjection(signedIn)).toEqual<unknown>(expected.normal)
      expect(h.removal.state()).toEqual(before)
    } finally {
      await h.owner.dispose()
    }
  })

  test("absent and deleted documents use only legitimate model defaults", async () => {
    for (const deleted of [false, true]) {
      const seed = projectionSeed()
      for (const key of Object.keys(seed.local)) if (key.startsWith(`doc:filter:${a}:`)) delete seed.local[key]
      if (deleted) seed.local[`doc:setup:${a}`] = { v: 1, gen: "gone", at: 1, by: "fixture", deleted: true }
      else delete seed.local[`doc:setup:${a}`]
      const h = projectionWorld(seed)
      try {
        expect(account(await h.owner.readTabProjection(signedIn))).toEqual<unknown>({
          kind: "signed-in",
          acct: a,
          setup: { kind: "value", view: { kind: "none", acct: a } },
          filters: [],
          skips: {
            kind: "normal",
            entries: [
              [video, [alpha]],
              ["ccccccccccc", "all"]
            ]
          }
        })
      } finally {
        await h.owner.dispose()
      }
    }
  })

  test("newer current-account filters never become default disabled filters", async () => {
    const seed = projectionSeed()
    seed.local[`doc:filter:${a}:${alpha}`] = document({ opaque: "future" }, 2)
    const h = projectionWorld(seed)
    try {
      expect(account(await h.owner.readTabProjection(signedIn)).filters).toEqual([
        { playlist: alpha, state: { kind: "newer-version", version: 2 } },
        { playlist: beta, state: { kind: "default", filter: { mode: "deny", on: false, channels: [] } } }
      ])
    } finally {
      await h.owner.dispose()
    }
  })

  test("current-account setup and settings unreadability remain typed", async () => {
    for (const state of ["newer-version", "invalid"] as const) {
      const seed = projectionSeed()
      seed.local[`doc:setup:${a}`] = state === "invalid" ? document({ quickSave: 42 }) : document({}, 2)
      seed.local["doc:settings"] = state === "invalid" ? document({ autoAdd: { on: "bad" } }) : document({}, 3)
      const h = projectionWorld(seed)
      try {
        const read = projection(await h.owner.readTabProjection(signedIn))
        expect(read.settings).toEqual(state === "invalid" ? { kind: "invalid" } : { kind: "newer-version", version: 3 })
        if (read.account.kind !== "signed-in") throw Error("Expected account")
        expect(read.account.setup).toEqual({ kind: state })
        expect(read.account.filters).toEqual<unknown>(expected.normal.projection.account.filters)
      } finally {
        await h.owner.dispose()
      }
    }
  })

  test("readable Setup survives newer Settings without losing its stored targets", async () => {
    const seed = projectionSeed()
    seed.local["doc:settings"] = document({}, 3)
    const h = projectionWorld(seed)
    try {
      const read = projection(await h.owner.readTabProjection(signedIn))
      expect(read.settings).toEqual({ kind: "newer-version", version: 3 })
      if (read.account.kind !== "signed-in") throw Error("Expected account")
      expect(read.account.setup).toEqual<unknown>({
        kind: "value",
        view: { kind: "live", acct: a, setup: { ...expected.normal.projection.account.setup.view.setup, targets: { orig01: beta, gone01: "PL_stale" } } }
      })
    } finally {
      await h.owner.dispose()
    }
  })

  test("absent Settings uses the shared default keys and feature options", async () => {
    const seed = projectionSeed()
    delete seed.local["doc:settings"]
    const h = projectionWorld(seed)
    try {
      const defaults = structuredClone(expected.normal.projection.settings)
      defaults.settings.autoAdd.on = false
      defaults.settings.autoAdd.pct = 50
      defaults.settings.shortcuts.on = false
      defaults.settings.shortcuts.list = []
      expect(projection(await h.owner.readTabProjection(signedIn)).settings).toEqual<unknown>(defaults)
    } finally {
      await h.owner.dispose()
    }
  })

  test("malformed current filter remains invalid while foreign malformed data is ignored", async () => {
    const seed = projectionSeed()
    seed.local[`doc:filter:${a}:${alpha}`] = document({ on: "bad" })
    const h = projectionWorld(seed)
    try {
      expect(account(await h.owner.readTabProjection(signedIn)).filters[0]).toEqual({ playlist: alpha, state: { kind: "invalid" } })
      expect(h.writes()).toEqual([])
    } finally {
      await h.owner.dispose()
    }
  })

  test("queued Setup and Filter edits cannot split one projection", async () => {
    const h = projectionWorld(),
      wait = deferred()
    let held = false
    h.boundary(async kind => {
      if (kind === "session" && !held) {
        held = true
        await wait.wait()
      }
    })
    try {
      const reading = h.owner.readTabProjection(signedIn)
      await wait.entered
      const setup = h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "quick-save" }, expected: { setup: "live", playlist: alpha }, playlist: beta })
      const filter = h.owner.change(origin, { acct: a, playlist: alpha, desired: { mode: "allow", on: false }, clearListedChannels: "not-confirmed" })
      await settle()
      expect(h.writes()).toEqual([])
      wait.release()
      expect(await reading).toEqual<unknown>(expected.normal)
      expect((await setup).kind).toBe("committed")
      expect(await filter).toEqual({ kind: "result", result: { ok: true } })
      const read = account(await h.owner.readTabProjection(signedIn))
      expect(read.setup.kind === "value" && read.setup.view.kind === "live" && read.setup.view.setup.quickSave).toBe(beta)
      expect(read.filters[0]).toEqual({
        playlist: alpha,
        state: { kind: "value", filter: { mode: "allow", on: false, channels: [["UCAAAAAAAAAAAAAAAAAAAAAA", "Alpha channel", "@alpha"]] }, gen: expect.any(String) }
      })
    } finally {
      wait.release()
      await h.owner.dispose()
    }
  })

  test("queued account removal follows a projection and cannot resurrect data", async () => {
    const h = projectionWorld(),
      wait = deferred()
    try {
      const prepared = await h.owner.prepareAccountRemoval(origin, a)
      if (prepared.kind !== "confirmation-required") throw Error(`Removal preparation: ${prepared.kind}`)
      let held = false
      h.boundary(async kind => {
        if (kind === "session" && !held) {
          held = true
          await wait.wait()
        }
      })
      const reading = h.owner.readTabProjection(signedIn)
      await wait.entered
      const removing = h.owner.removeAccountSetup(origin, prepared.confirmation)
      await settle()
      expect(h.writes()).toEqual([])
      wait.release()
      expect(await reading).toEqual<unknown>(expected.normal)
      expect((await removing).kind).toBe("committed")
      expect(account(await h.owner.readTabProjection(signedIn))).toEqual<unknown>({
        kind: "signed-in",
        acct: a,
        setup: { kind: "value", view: { kind: "none", acct: a } },
        filters: [],
        skips: { kind: "normal", entries: [] }
      })
    } finally {
      wait.release()
      await h.owner.dispose()
    }
  })

  test("projection queued behind an in-flight removal sees only the removed account", async () => {
    const h = projectionWorld(),
      wait = deferred()
    try {
      const prepared = await h.owner.prepareAccountRemoval(origin, a)
      if (prepared.kind !== "confirmation-required") throw Error(`Removal preparation: ${prepared.kind}`)
      const original = h.deps.local.set
      let held = false
      h.deps.local.set = async items => {
        if (!held) {
          held = true
          await wait.wait()
        }
        await original(items)
      }
      const removing = h.owner.removeAccountSetup(origin, prepared.confirmation)
      await wait.entered
      let finished = false
      const reading = h.owner.readTabProjection(signedIn).then(read => {
        finished = true
        return read
      })
      await settle()
      expect(finished).toBe(false)
      wait.release()
      expect((await removing).kind).toBe("committed")
      expect(account(await reading)).toEqual({ kind: "signed-in", acct: a, setup: { kind: "value", view: { kind: "none", acct: a } }, filters: [], skips: { kind: "normal", entries: [] } })
    } finally {
      wait.release()
      await h.owner.dispose()
    }
  })

  test("disposal during an awaited session read closes the projection", async () => {
    const h = projectionWorld(),
      wait = deferred()
    h.boundary(async kind => {
      if (kind === "session") await wait.wait()
    })
    const reading = h.owner.readTabProjection(signedIn)
    await wait.entered
    const disposing = h.owner.dispose()
    wait.release()
    expect(await reading).toEqual({ kind: "unavailable", reason: "disposed" })
    await disposing
    expect(h.writes()).toEqual([])
    expect(await h.owner.readLastAccount(normalWindow)).toEqual({ kind: "unavailable", reason: "disposed" })
  })

  test("a consent hold arriving during an awaited read returns no account data", async () => {
    const h = projectionWorld(),
      wait = deferred()
    let held = false
    h.boundary(async kind => {
      if (kind === "session" && !held) {
        held = true
        await wait.wait()
      }
    })
    try {
      const reading = h.owner.readTabProjection(signedIn)
      await wait.entered
      h.removal.foreign(state => {
        state.local.device = { id: "fixture", consent: null, syncOn: false }
      })
      wait.release()
      expect(await reading).toEqual({ kind: "unavailable", reason: "consent-held" })
      expect(h.writes()).toEqual([])
    } finally {
      wait.release()
      await h.owner.dispose()
    }
  })

  test("a pending removal arriving during a session read is held without transaction writes", async () => {
    const h = projectionWorld(),
      wait = deferred()
    let held = false
    h.boundary(async kind => {
      if (kind === "session" && !held) {
        held = true
        await wait.wait()
      }
    })
    try {
      const reading = h.owner.readTabProjection(signedIn)
      await wait.entered
      h.removal.foreign(state => {
        state.local["pending:account-removal"] = {}
      })
      wait.release()
      expect(await reading).toEqual({ kind: "unavailable", reason: "pending-removal" })
      expect(h.writes()).toEqual([])
    } finally {
      wait.release()
      await h.owner.dispose()
    }
  })

  test("external document change during an awaited read returns stale rather than a mixed view", async () => {
    const h = projectionWorld(),
      wait = deferred()
    let held = false
    h.boundary(async kind => {
      if (kind === "session" && !held) {
        held = true
        await wait.wait()
      }
    })
    try {
      const reading = h.owner.readTabProjection(signedIn)
      await wait.entered
      h.removal.foreign(state => {
        state.local[`doc:setup:${a}`] = document({ quickSave: beta })
      })
      wait.release()
      expect(await reading).toEqual({ kind: "unavailable", reason: "stale" })
      expect(h.writes()).toEqual([])
    } finally {
      wait.release()
      await h.owner.dispose()
    }
  })

  test("pending removal, retained recovery, join and layout holds never repair storage", async () => {
    const cases = [
      { key: "pending:account-removal", value: {}, reason: "pending-removal" },
      { key: "interimConversion", value: {}, reason: "startup" },
      { key: "pending:sync-join", value: {}, reason: "stale" },
      { key: "schema", value: 2, reason: "newer-layout" },
      { key: "schema", value: 0, reason: "startup" }
    ] as const
    for (const row of cases) {
      const seed = projectionSeed()
      seed.local[row.key] = row.value
      const h = projectionWorld(seed),
        before = h.removal.state()
      try {
        expect(await h.owner.readTabProjection(signedIn)).toEqual({ kind: "unavailable", reason: row.reason })
        expect(await h.owner.readLastAccount(normalWindow)).toEqual({ kind: "unavailable", reason: row.reason })
        expect(h.writes()).toEqual([])
        expect(h.removal.state()).toEqual(before)
      } finally {
        await h.owner.dispose()
      }
    }
  })

  test("routing hint requires a surviving readable Setup and never returns Device", async () => {
    for (const mode of ["missing", "deleted", "newer-version", "invalid"] as const) {
      const seed = projectionSeed()
      if (mode === "missing") delete seed.local[`doc:setup:${b}`]
      else seed.local[`doc:setup:${b}`] = mode === "deleted" ? { v: 1, gen: "gone", at: 1, by: "fixture", deleted: true } : mode === "invalid" ? document({ musicSave: 42 }) : document({}, 2)
      const h = projectionWorld(seed)
      try {
        expect(await h.owner.readLastAccount(normalWindow)).toEqual(mode === "missing" || mode === "deleted" ? { kind: "none" } : { kind: mode, part: "setup" })
        expect(h.writes()).toEqual([])
      } finally {
        await h.owner.dispose()
      }
    }
  })

  test("invalid device and rejected storage reads do not become usable defaults", async () => {
    const seed = projectionSeed()
    seed.local.device = { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, pickerSortAZ: "bad" }
    const h = projectionWorld(seed)
    try {
      expect(await h.owner.readTabProjection(signedIn)).toEqual({ kind: "invalid", part: "device" })
      expect(await h.owner.readLastAccount(normalWindow)).toEqual({ kind: "invalid", part: "device" })
      h.deps.local.get = async () => {
        throw Error("Synthetic local read failure")
      }
      expect(await h.owner.readTabProjection(signedIn)).toEqual({ kind: "unavailable", reason: "stale" })
      expect(h.writes()).toEqual([])
    } finally {
      await h.owner.dispose()
    }
    const rejected = projectionWorld()
    try {
      rejected.deps.removal.session.get = async () => {
        throw Error("Synthetic session read failure")
      }
      expect(await rejected.owner.readTabProjection(signedIn)).toEqual({ kind: "unavailable", reason: "stale" })
      expect(rejected.writes()).toEqual([])
    } finally {
      await rejected.owner.dispose()
    }
  })

  test("request authority is copied before queueing", async () => {
    const h = projectionWorld(),
      wait = deferred()
    let held = false
    h.boundary(async kind => {
      if (kind === "session" && !held) {
        held = true
        await wait.wait()
      }
    })
    try {
      const first = h.owner.readTabProjection(signedIn)
      await wait.entered
      const mutable = { private: false, account: { kind: "signed-in" as const, acct: a } }
      const second = h.owner.readTabProjection(mutable)
      mutable.account.acct = b
      mutable.private = true
      wait.release()
      await first
      expect(await second).toEqual<unknown>(expected.normal)
    } finally {
      wait.release()
      await h.owner.dispose()
    }
  })

  test("missing or malformed session state is unavailable rather than an empty successful view", async () => {
    const seed = projectionSeed()
    seed.session.paused = "bad"
    const h = projectionWorld(seed)
    try {
      expect(await h.owner.readTabProjection(signedIn)).toEqual({ kind: "unavailable", reason: "session-layout" })
      expect(await h.owner.readTabProjection({ ...signedIn, private: true })).toEqual({ kind: "unavailable", reason: "session-layout" })
      const noSession = createLocalFilterWriter({ ...h.deps, removal: { kind: "unavailable" } })
      try {
        expect(await noSession.readTabProjection(signedIn)).toEqual({ kind: "unavailable", reason: "session-host" })
        expect(await noSession.readLastAccount(normalWindow)).toEqual({ kind: "account", acct: b })
      } finally {
        await noSession.dispose()
      }
    } finally {
      await h.owner.dispose()
    }
  })

  test("startup and disposed owners do not admit a projection", async () => {
    const h = projectionWorld(),
      wait = deferred()
    let held = false
    h.boundary(async kind => {
      if (kind === "local" && !held) {
        held = true
        await wait.wait()
      }
    })
    const starting = createStartingLocalFilterWriter({ ...h.deps, startup: h.removal.startup })
    const readiness = starting.ready().catch(() => "stopped" as const)
    try {
      await wait.entered
      expect(await starting.readTabProjection(signedIn)).toEqual({ kind: "unavailable", reason: "startup" })
      const disposal = starting.dispose()
      wait.release()
      await readiness
      await disposal
      expect(await starting.readTabProjection(signedIn)).toEqual({ kind: "unavailable", reason: "disposed" })
      expect(h.writes()).toEqual([])
    } finally {
      wait.release()
      await starting.dispose()
      await h.owner.dispose()
    }
  })

  test("body-supplied account and privacy authority is rejected at the owner boundary", async () => {
    const h = projectionWorld()
    try {
      const requests = [
        { private: false, account: { kind: "signed-out", acct: a } },
        { private: false, account: { kind: "unknown", acct: b } },
        { private: false, account: { kind: "signed-in", acct: a }, windowId: 99 },
        { private: false, account: { kind: "signed-in", acct: "bad" } }
      ]
      for (const raw of requests) expect(await Reflect.apply(h.owner.readTabProjection, h.owner, [raw])).toEqual({ kind: "invalid", part: "request" })
      expect(await Reflect.apply(h.owner.readLastAccount, h.owner, [{ ...normalWindow, incognito: true }])).toEqual({ kind: "invalid", part: "request" })
      expect(h.removal.io).toEqual([])
    } finally {
      await h.owner.dispose()
    }
  })
})
