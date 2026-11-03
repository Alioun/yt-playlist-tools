import { expect, test } from "bun:test"
import { createLocalFilterWriter, type SyncAutomaticResult } from "./local-filter-writer"
import { encodeSyncDocument } from "./sync-codec"
import type { AccountRemovalHost, RemovalLocalKey } from "./account-removal-execution"
import type { RemovalSessionKey } from "./account-removal-session"
import { removalFixture } from "../../../tools/fixtures/account-removal-execution/run"
import { documentKey, isAccountKey, parseDocumentKey } from "../../shared/model"
import { isJsonValue, type JsonObject, type JsonValue } from "../../shared/contracts/json"

const DAY = 24 * 60 * 60 * 1000,
  LIFETIME = 30 * DAY,
  removedAt = 60 * DAY
const acct = "AAAAAAAAAAAAAAAA",
  other = "BBBBBBBBBBBBBBBB"
if (!isAccountKey(acct) || !isAccountKey(other)) throw Error("Expected canonical synthetic accounts")
const setupName = `doc:setup:${acct}`
const filterNames = ["selected", "kept", "orphan", "off", "empty", "deleted"].map(name => `doc:filter:${acct}:PL_${name}`)
const accountNames = [setupName, ...filterNames]
const chunkedName = `doc:filter:${acct}:PL_kept`
const retainedChunk = `s:filter:${acct}:PL_selected@old.0`

type State = { local: JsonObject; session: JsonObject; sync: JsonObject }
type Fault = { readonly at: number; readonly when: "before" | "after" }
type Mutation = { readonly kind: string; readonly mono: number }

function json(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Expected JSON object")
  return value
}
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}
const base = (name: string) => `s:${name.slice(4)}`
function pushed(local: JsonObject) {
  return json(json(local.sync).pushed)
}

function tombstone(name: string, at = removedAt, extension?: string): JsonObject {
  return { v: 1, gen: `removed-${name.split(":").at(-1)}`, at, by: "remover", deleted: true, ...(extension === undefined ? {} : { extension }) }
}
function place(state: State, name: string, document: JsonObject) {
  const key = parseDocumentKey(name)
  if (!key) throw Error("Expected a document name")
  const encoded = encodeSyncDocument({ key, document })
  if (encoded.kind !== "encoded") throw Error("Expected an encodable document")
  for (const item of encoded.encoded.items) state.sync[item.key] = item.value
  state.local[name] = copy(document)
  pushed(state.local)[name] = String(document.gen)
}

// The account was removed with sync on at removedAt, and every browser has acknowledged its tombstones.
function removedSeed(change?: (state: State) => void): State {
  const state: State = removalFixture(true)
  for (const name of ["doc:settings", `doc:setup:${other}`]) place(state, name, json(state.local[name]))
  for (const name of accountNames) place(state, name, tombstone(name, removedAt, name === chunkedName ? "x".repeat(9000) : undefined))
  state.local.lastAccount = null
  delete state.local[`cache:${acct}`]
  for (let shard = 0; shard < 16; shard++) delete state.local[`progress:${acct}:${shard}`]
  change?.(state)
  return state
}
function expired(seed: State, names: readonly string[] = accountNames): Omit<State, "session"> {
  const state = copy(seed)
  for (const name of names) {
    delete state.local[name]
    delete pushed(state.local)[name]
    for (const key of Object.keys(state.sync)) if (key === base(name) || key.startsWith(`${base(name)}@${String(json(seed.local[name]).gen)}.`)) delete state.sync[key]
  }
  return { local: state.local, sync: state.sync }
}

function createWorld(wall: number, sync: JsonObject) {
  let mono = 1000,
    changed = false
  const offset = wall - mono,
    timers: { at: number; run: () => void; cancelled: boolean }[] = [],
    browsers: ReturnType<typeof join>[] = []
  const world = {
    sync: copy(sync),
    mono: () => mono,
    wall: () => offset + mono,
    browsers,
    tick(milliseconds: number) {
      mono += milliseconds
    },
    changed() {
      changed = true
    },
    join(name: string, seed: State) {
      const browser = join(name, seed)
      browsers.push(browser)
      return browser
    },
    // Drains every owner's lane and delivers sync changes to every browser, running due timers only when asked.
    async settle(runTimers = true) {
      for (let step = 0; step < 500; step++) {
        for (const browser of browsers) await browser.drain()
        if (changed) {
          changed = false
          for (const browser of browsers) browser.fire()
          continue
        }
        if (!runTimers) return
        const due = timers.filter(timer => !timer.cancelled).sort((left, right) => left.at - right.at)[0]
        if (!due) return
        due.cancelled = true
        mono = Math.max(mono, due.at)
        due.run()
      }
      throw Error("The browsers never settled")
    }
  }
  function join(name: string, seed: State) {
    const state = { local: copy(seed.local), session: copy(seed.session) }
    const listeners = new Set<() => void>(),
      owners: ReturnType<typeof createLocalFilterWriter>[] = []
    const io: string[] = [],
      mutations: Mutation[] = [],
      results: SyncAutomaticResult[] = []
    let ordinal = 0,
      dead = false,
      fault: Fault | undefined,
      generation = 0
    async function port<T>(kind: string, read: () => T, apply?: () => void): Promise<T> {
      const n = ++ordinal,
        hit = fault?.at === n ? fault : undefined
      io.push(kind)
      if (dead || hit?.when === "before") {
        dead = true
        throw Error("Synthetic interruption")
      }
      if (apply) {
        apply()
        mutations.push({ kind, mono })
      }
      const result = read()
      if (hit?.when === "after") {
        dead = true
        throw Error("Synthetic interruption")
      }
      return result
    }
    function syncChanged() {
      changed = true
    }
    const removal: AccountRemovalHost = {
      kind: "fixture",
      removeLocal(keys: readonly RemovalLocalKey[]) {
        const names = keys.map(key => {
          if (key.kind !== "document") throw Error("Expiry removes documents only")
          return documentKey(key.key)
        })
        return port(
          `local.remove:${[...names].sort().join(",")}`,
          () => {},
          () => {
            for (const key of names) delete state.local[key]
          }
        )
      },
      session: {
        get: () => port("session.get", () => copy(state.session)),
        set: items =>
          port(
            "session.set",
            () => {},
            () => {
              state.session = { ...state.session, ...copy(items) }
            }
          ),
        remove: (keys: readonly RemovalSessionKey[]) =>
          port(
            "session.remove",
            () => {},
            () => {
              for (const key of keys) delete state.session[`${key.kind}:${key.acct}`]
            }
          )
      }
    }
    const deps = {
      removal,
      claim: { kind: "unavailable" as const },
      local: {
        get: (keys: readonly string[] | null) =>
          port("local.get", () => copy(keys === null ? state.local : Object.fromEntries(keys.filter(key => Object.hasOwn(state.local, key)).map(key => [key, state.local[key]!])))),
        set: (items: Readonly<Record<string, JsonValue>>) =>
          port(
            `local.set:${Object.keys(items).sort().join(",")}`,
            () => {},
            () => {
              Object.assign(state.local, copy(items))
            }
          )
      },
      sync: {
        get: () => port("sync.get", () => copy(world.sync)),
        set: (items: Readonly<Record<string, JsonValue>>) =>
          port(
            `sync.set:${Object.keys(items).sort().join(",")}`,
            () => {},
            () => {
              Object.assign(world.sync, copy(items))
              syncChanged()
            }
          ),
        remove: (keys: readonly string[]) =>
          port(
            `sync.remove:${[...keys].sort().join(",")}`,
            () => {},
            () => {
              for (const key of keys) delete world.sync[key]
              syncChanged()
            }
          ),
        subscribe(listener: () => void) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        }
      },
      syncClock: {
        now: () => mono,
        wallNow: () => offset + mono,
        after(milliseconds: number, run: () => void) {
          const timer = { at: mono + milliseconds, run, cancelled: false }
          timers.push(timer)
          return () => {
            timer.cancelled = true
          }
        }
      },
      now: () => offset + mono,
      generation: () => `${name}-${++generation}`,
      onSyncResult(result: SyncAutomaticResult) {
        results.push(result)
      }
    }
    return {
      io,
      mutations,
      results,
      state: () => ({ local: copy(state.local), session: copy(state.session) }),
      fault(value?: Fault) {
        fault = value
        dead = false
      },
      owner() {
        const owner = createLocalFilterWriter(deps)
        owners.push(owner)
        return owner
      },
      fire() {
        for (const listener of [...listeners]) listener()
      },
      async drain() {
        for (const owner of owners) await owner.read("settings").catch(() => {})
      }
    }
  }
  return world
}

const removedNames = (mutation: Mutation) => mutation.kind.slice(mutation.kind.indexOf(":") + 1).split(",")

test("a removed account's tombstones stay until 30 days after the Setup's edit time and then expire", async () => {
  const seed = removedSeed(),
    world = createWorld(removedAt + LIFETIME - 1, seed.sync),
    here = world.join("here", seed),
    owner = here.owner()
  try {
    await owner.startSync()
    await world.settle()
    expect(here.state().local).toEqual(seed.local)
    expect(world.sync).toEqual(seed.sync)
    world.tick(1)
    world.changed()
    await world.settle()
    const after = expired(seed)
    expect(here.state().local).toEqual(after.local)
    expect(world.sync).toEqual(after.sync)
    expect(world.sync[retainedChunk]).toBe("retained chunk")
    expect(here.io.filter(kind => kind.startsWith("sync.set"))).toEqual([])
    expect(await owner.readSetup(acct)).toEqual({ kind: "value", view: { kind: "none", acct } })
  } finally {
    await owner.dispose()
  }
})

test("the local copies and their pushed entries go in one turn and the synced copies in a later paced opportunity of their own", async () => {
  const seed = removedSeed(),
    world = createWorld(removedAt + LIFETIME, seed.sync),
    here = world.join("here", seed),
    owner = here.owner()
  const started = world.mono()
  try {
    await owner.startSync()
    await world.settle()
    const [remove, history, cleanup, ...rest] = here.mutations
    expect(rest).toEqual([])
    expect(remove?.kind.startsWith("local.remove:") && removedNames(remove).sort()).toEqual([...accountNames].sort())
    expect(history?.kind).toBe("local.set:sync")
    expect(cleanup?.kind.startsWith("sync.remove:") && removedNames(cleanup).sort()).toEqual(
      Object.keys(seed.sync)
        .filter(key => !Object.hasOwn(expired(seed).sync, key))
        .sort()
    )
    expect(cleanup!.mono).toBeGreaterThanOrEqual(started + 5000)
    expect(here.state().local).toEqual(expired(seed).local)
  } finally {
    await owner.dispose()
  }
})

test("a push waiting at expiry goes first and the cleanup takes a later opportunity", async () => {
  const seed = removedSeed(state => {
    state.local["doc:settings"] = { ...json(state.local["doc:settings"]), gen: "settings-edited", at: removedAt + LIFETIME - 10 }
  })
  const world = createWorld(removedAt + LIFETIME, seed.sync),
    here = world.join("here", seed),
    owner = here.owner()
  try {
    await owner.startSync()
    await world.settle()
    const synced = here.mutations.filter(mutation => mutation.kind.startsWith("sync."))
    expect(synced.map(mutation => mutation.kind.split(":")[0])).toEqual(["sync.set", "sync.remove"])
    expect(synced[1]!.mono - synced[0]!.mono).toBeGreaterThanOrEqual(5000)
    expect(world.sync["s:settings"]).toEqual(seed.local["doc:settings"]!)
    expect(pushed(here.state().local)["doc:settings"]).toBe("settings-edited")
    const after = expired(seed)
    for (const name of accountNames) expect(Object.hasOwn(here.state().local, name)).toBe(false)
    expect(
      Object.keys(world.sync)
        .filter(key => key !== "s:settings")
        .sort()
    ).toEqual(
      Object.keys(after.sync)
        .filter(key => key !== "s:settings")
        .sort()
    )
  } finally {
    await owner.dispose()
  }
})

test("a restart at any point of the expiry converges on a fresh owner", async () => {
  const seed = removedSeed(),
    after = expired(seed)
  const control = createWorld(removedAt + LIFETIME, seed.sync),
    probe = control.join("probe", seed),
    measured = probe.owner()
  await measured.startSync()
  await control.settle()
  await measured.dispose()
  expect(probe.state().local).toEqual(after.local)
  const total = probe.io.length
  for (let at = 1; at <= total; at++)
    for (const when of ["before", "after"] as const) {
      const world = createWorld(removedAt + LIFETIME, seed.sync),
        here = world.join("here", seed)
      here.fault({ at, when })
      const interrupted = here.owner()
      await interrupted.startSync().catch(() => {})
      await world.settle().catch(() => {})
      await interrupted.dispose().catch(() => {})
      here.fault(undefined)
      const restarted = here.owner()
      try {
        await restarted.startSync()
        await world.settle()
        expect({ at, when, local: here.state().local, sync: world.sync }).toEqual({ at, when, local: after.local, sync: after.sync })
      } finally {
        await restarted.dispose()
      }
    }
}, 120_000)

test.each(["together", "one after the other", "between the other's turns"] as const)("two browsers expiring the same tombstones %s converge", async order => {
  const seed = removedSeed(),
    after = expired(seed)
  const world = createWorld(removedAt + LIFETIME, seed.sync),
    first = world.join("first", seed),
    second = world.join("second", { ...seed, local: { ...seed.local, device: { ...json(seed.local.device), id: "second" } } })
  const one = first.owner(),
    two = second.owner()
  try {
    if (order === "together") {
      await Promise.all([one.startSync(), two.startSync()])
      await world.settle()
    }
    if (order === "one after the other") {
      await one.startSync()
      await world.settle()
      await two.startSync()
      await world.settle()
    }
    if (order === "between the other's turns") {
      await one.startSync()
      await world.settle(false)
      expect(first.mutations.map(mutation => mutation.kind.split(":")[0])).toEqual(["local.remove", "local.set"])
      await two.startSync()
      await world.settle()
    }
    expect(first.state().local).toEqual(after.local)
    expect(second.state().local).toEqual({ ...after.local, device: { ...json(after.local.device), id: "second" } })
    expect(world.sync).toEqual(after.sync)
    expect([...first.mutations, ...second.mutations].filter(mutation => mutation.kind.startsWith("sync.set"))).toEqual([])
  } finally {
    await one.dispose()
    await two.dispose()
  }
})

test("Filter tombstones expire with their Setup's and never on their own edit time", async () => {
  const otherFilter = `doc:filter:${other}:PL_gone`
  const seed = removedSeed(state => {
    place(state, `doc:filter:${acct}:PL_orphan`, tombstone(`doc:filter:${acct}:PL_orphan`, removedAt - 40 * DAY))
    place(state, `doc:filter:${acct}:PL_off`, tombstone(`doc:filter:${acct}:PL_off`, removedAt + 20 * DAY))
    place(state, otherFilter, tombstone(otherFilter, removedAt - 40 * DAY))
  })
  const world = createWorld(removedAt + LIFETIME - 1, seed.sync),
    here = world.join("here", seed),
    owner = here.owner()
  try {
    await owner.startSync()
    await world.settle()
    expect(here.state().local).toEqual(seed.local)
    expect(world.sync).toEqual(seed.sync)
    world.tick(1)
    world.changed()
    await world.settle()
    const after = expired(seed)
    expect(here.state().local).toEqual(after.local)
    expect(world.sync).toEqual(after.sync)
    expect(here.state().local[otherFilter]).toEqual(seed.local[otherFilter]!)
    expect(world.sync[base(otherFilter)]).toEqual(seed.local[otherFilter]!)
  } finally {
    await owner.dispose()
  }
})

test("with sync off nothing expires and sync is never touched", async () => {
  const seed = removedSeed(state => {
    json(state.local.device).syncOn = false
    json(state.local.sync).status = "off"
  })
  const world = createWorld(removedAt + 10 * LIFETIME, seed.sync),
    here = world.join("here", seed),
    owner = here.owner()
  try {
    await owner.startSync()
    world.changed()
    await world.settle()
    expect(here.state().local).toEqual(seed.local)
    expect(world.sync).toEqual(seed.sync)
    expect(here.io.filter(kind => kind.startsWith("sync."))).toEqual([])
  } finally {
    await owner.dispose()
  }
})

test("a newer live Setup and Filter that arrive at expiry replace the local tombstones as ordinary live records", async () => {
  const live = { v: 1, gen: "recreated", at: removedAt + LIFETIME - 10, by: "elsewhere", data: { gather: "PL_again" } }
  const liveFilter = { v: 1, gen: "recreated-filter", at: removedAt + LIFETIME - 10, by: "elsewhere", data: { mode: "allow", on: true, channels: [] } }
  const selected = `doc:filter:${acct}:PL_selected`
  const seed = removedSeed()
  const world = createWorld(removedAt + LIFETIME, seed.sync),
    here = world.join("here", seed),
    owner = here.owner()
  world.sync[base(setupName)] = live
  world.sync[base(selected)] = liveFilter
  try {
    await owner.startSync()
    await world.settle()
    const local = here.state().local
    expect(local[setupName]).toEqual(live)
    expect(local[selected]).toEqual(liveFilter)
    expect(pushed(local)[setupName]).toBe("recreated")
    expect(pushed(local)[selected]).toBe("recreated-filter")
    for (const name of filterNames.filter(name => name !== selected)) expect(local[name]).toEqual(seed.local[name]!)
    expect(here.mutations.filter(mutation => mutation.kind.startsWith("local.remove") || mutation.kind.startsWith("sync."))).toEqual([])
    expect(world.sync[base(setupName)]).toEqual(live)
  } finally {
    await owner.dispose()
  }
})

test("a newer live Setup written between the two turns survives the cleanup", async () => {
  const live = { v: 1, gen: "recreated", at: removedAt + LIFETIME + 1, by: "elsewhere", data: { gather: "PL_again" } }
  const seed = removedSeed()
  const world = createWorld(removedAt + LIFETIME, seed.sync),
    here = world.join("here", seed),
    owner = here.owner()
  try {
    await owner.startSync()
    await world.settle(false)
    for (const name of accountNames) expect(Object.hasOwn(here.state().local, name)).toBe(false)
    world.sync[base(setupName)] = live
    world.changed()
    world.tick(10_000)
    await world.settle()
    expect(world.sync[base(setupName)]).toEqual(live)
    expect(here.mutations.filter(mutation => mutation.kind.startsWith("sync."))).toEqual([])
  } finally {
    await owner.dispose()
  }
})
