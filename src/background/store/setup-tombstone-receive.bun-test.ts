import { expect, test } from "bun:test"
import { createLocalFilterWriter, type ConfirmedViewChange } from "./local-filter-writer"
import { createRemovalHarness, removalFixture, type RemovalFixtureState } from "../../../tools/fixtures/account-removal-execution/run"
import { isAccountKey, isPlaylistId } from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"

const acct = "AAAAAAAAAAAAAAAA", other = "BBBBBBBBBBBBBBBB", selected = "PL_selected"
if (!isAccountKey(acct) || !isAccountKey(other) || !isPlaylistId(selected)) throw Error("Expected canonical synthetic identifiers")
const setupName = `doc:setup:${acct}`
const liveFilters = ["selected", "kept", "orphan", "off", "empty"].map(name => `doc:filter:${acct}:PL_${name}`)

function json(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Expected JSON object")
  return value
}
function syncedSeed(): RemovalFixtureState {
  const state = removalFixture(true)
  json(json(state.local.sync).pushed)["doc:settings"] = json(state.local["doc:settings"]).gen!
  state.sync["s:settings"] = structuredClone(state.local["doc:settings"]!)
  return state
}
function tombstone(name: string): JsonObject {
  return { v: 1, gen: `remote-${name.split(":").at(-1)}`, at: 50, by: "remote-device", deleted: true }
}
function arrive(h: ReturnType<typeof createRemovalHarness>, names: readonly string[]) {
  h.foreign(state => { for (const name of names) state.sync[`s:${name.slice(4)}`] = tombstone(name) })
}
function removedHere(seed: RemovalFixtureState, adopted: readonly string[]): RemovalFixtureState {
  const state = structuredClone(seed), pushed = json(json(state.local.sync).pushed)
  for (const name of adopted) { state.local[name] = tombstone(name); pushed[name] = tombstone(name).gen!; state.sync[`s:${name.slice(4)}`] = tombstone(name) }
  if (state.local.lastAccount === acct) state.local.lastAccount = null
  delete state.local[`cache:${acct}`]
  for (let shard = 0; shard < 16; shard++) delete state.local[`progress:${acct}:${shard}`]
  delete state.session[`skips:${acct}`]; delete state.session[`cooldown:${acct}`]
  for (const key of ["recent", "recentAdds"]) {
    const rows = state.session[key]
    if (Array.isArray(rows)) state.session[key] = rows.filter(row => json(row).acct !== acct)
  }
  for (const key of ["shown", "breakage", "gather"]) delete json(json(state.session[key]).accounts)[acct]
  state.session.tabs = Object.fromEntries(Object.entries(json(state.session.tabs)).filter(([, row]) => json(row).acct !== acct))
  return state
}
async function settle(owner: ReturnType<typeof createLocalFilterWriter>) { await owner.read("settings") }

test("a Setup tombstone arriving with its Filter tombstones removes the account here in one receive pass", async () => {
  const seed = syncedSeed(), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps), events: ConfirmedViewChange[] = []
  owner.subscribeView(event => events.push(event))
  try {
    arrive(h, [setupName, ...liveFilters])
    await owner.startSync()
    const state = h.state(), expected = removedHere(seed, [setupName, ...liveFilters])
    expect(state.local).toEqual(expected.local)
    expect(state.session).toEqual(expected.session)
    expect(h.io.some(entry => entry.kind.startsWith("sync.set"))).toBe(false)
    expect(events.filter(event => "acct" in event && event.acct === acct)).toEqual([{ kind: "account-removed", acct, source: "sync" }])
    expect(await owner.readSetup(acct)).toEqual({ kind: "value", view: { kind: "none", acct } })
  } finally { await owner.dispose() }
})

test.each(["setup-first", "filters-first"] as const)("Setup and Filter tombstones converge when they arrive %s", async order => {
  const seed = syncedSeed(), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps), events: ConfirmedViewChange[] = []
  owner.subscribeView(event => events.push(event))
  try {
    arrive(h, order === "setup-first" ? [setupName] : liveFilters)
    await owner.startSync()
    const first = h.state()
    if (order === "setup-first") {
      const partial = removedHere(seed, [setupName])
      expect(first.local).toEqual(partial.local)
      expect(first.session).toEqual(partial.session)
    } else {
      expect(first.local).toEqual(seed.local)
      expect(first.session).toEqual(seed.session)
      expect(events).toEqual([])
    }
    arrive(h, order === "setup-first" ? liveFilters : [setupName])
    h.fireSync(); await settle(owner)
    const state = h.state(), expected = removedHere(seed, [setupName, ...liveFilters])
    expect(state.local).toEqual(expected.local)
    expect(state.session).toEqual(expected.session)
    expect(events.filter(event => "acct" in event && event.acct === acct)).toEqual([{ kind: "account-removed", acct, source: "sync" }])
  } finally { await owner.dispose() }
})

test("a manual Setup tombstone receive confirms the account cleanup and leaves Filters to their own receive", async () => {
  const seed = syncedSeed(), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    arrive(h, [setupName])
    const result = await owner.receiveSyncDocument({ kind: "setup", acct })
    expect(result).toEqual({ kind: "adopted", received: { key: { kind: "setup", acct }, name: setupName, gen: "remote-AAAAAAAAAAAAAAAA", document: tombstone(setupName) } })
    const expected = removedHere(seed, [setupName])
    expect(h.state().local).toEqual(expected.local)
    expect(h.state().session).toEqual(expected.session)
    expect(await owner.receiveSyncDocument({ kind: "setup", acct })).toEqual({ kind: "unavailable", reason: "document" })
  } finally { await owner.dispose() }
})

test("a restart at any point of a Setup tombstone application converges on a fresh owner", async () => {
  const seed = syncedSeed(), expected = removedHere(seed, [setupName, ...liveFilters])
  const control = createRemovalHarness(seed), probe = createLocalFilterWriter(control.deps)
  arrive(control, [setupName, ...liveFilters])
  const before = control.io.length
  await probe.startSync(); await probe.dispose()
  const total = control.io.filter(entry => entry.phase === "invoked").length - before
  expect(total).toBeGreaterThan(0)
  for (let at = 1; at <= total; at++) for (const when of ["before", "after"] as const) {
    const h = createRemovalHarness(seed)
    arrive(h, [setupName, ...liveFilters])
    h.fault({ at, when, kind: "interrupt" })
    const interrupted = createLocalFilterWriter(h.deps)
    await interrupted.startSync().catch(() => {})
    await interrupted.dispose().catch(() => {})
    h.fault(undefined)
    const restarted = createLocalFilterWriter(h.deps)
    try {
      await restarted.startSync()
      const state = h.state()
      expect({ at, when, local: state.local }).toEqual({ at, when, local: expected.local })
      expect({ at, when, session: state.session }).toEqual({ at, when, session: expected.session })
    } finally { await restarted.dispose() }
  }
}, 120_000)

test.each([
  ["conflict", (state: RemovalFixtureState) => { const local = json(state.local[setupName]); local.at = 50; local.by = "zz-local" }],
  ["pending", (state: RemovalFixtureState) => { json(json(state.local.sync).pushed)[setupName] = "unsent-edit" }]
] as const)("a %s Setup tombstone is refused before any account cleanup", async (reason, prepare) => {
  const seed = syncedSeed(); prepare(seed)
  const h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    arrive(h, [setupName])
    expect(await owner.receiveSyncDocument({ kind: "setup", acct })).toEqual({ kind: "unavailable", reason })
    expect(h.state().local).toEqual(seed.local)
    expect(h.state().session).toEqual(seed.session)
  } finally { await owner.dispose() }
})

test("a Setup tombstone for another account leaves this browser's last account", async () => {
  const seed = syncedSeed(); seed.local.lastAccount = other
  const h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    arrive(h, [setupName, ...liveFilters])
    await owner.startSync()
    expect(h.state().local).toEqual(removedHere(seed, [setupName, ...liveFilters]).local)
    expect(h.state().local.lastAccount).toBe(other)
  } finally { await owner.dispose() }
})

test("a malformed last account refuses an incoming Setup tombstone before any account cleanup", async () => {
  const seed = syncedSeed(); seed.local.lastAccount = "not an account"
  const h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    arrive(h, [setupName])
    expect(await owner.receiveSyncDocument({ kind: "setup", acct })).toEqual({ kind: "unavailable", reason: "account-context" })
    expect(h.state().local).toEqual(seed.local)
    expect(h.state().session).toEqual(seed.session)
  } finally { await owner.dispose() }
})

test("an owner without a removal host leaves an incoming Setup tombstone unavailable", async () => {
  const seed = syncedSeed(), h = createRemovalHarness(seed, { host: false }), owner = createLocalFilterWriter({ ...h.deps, session: undefined })
  try {
    arrive(h, [setupName])
    expect(await owner.receiveSyncDocument({ kind: "setup", acct })).toEqual({ kind: "unavailable", reason: "document" })
    expect(h.state().local).toEqual(seed.local)
  } finally { await owner.dispose() }
})

test("a live Filter arriving under a removed Setup stays unavailable", async () => {
  const seed = removedHere(syncedSeed(), [setupName]), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    h.foreign(state => { state.sync[`s:filter:${acct}:PL_selected`] = { v: 1, gen: "remote-live", at: 50, by: "remote-device", data: { mode: "allow", on: true, channels: [] } } })
    expect(await owner.receiveSyncDocument({ kind: "filter", acct, playlist: selected })).toEqual({ kind: "unavailable", reason: "account-context" })
    expect(h.state().local).toEqual(seed.local)
  } finally { await owner.dispose() }
})

const selectedFilter = `doc:filter:${acct}:PL_selected`
const recreatedSetup: JsonObject = { v: 1, gen: "recreated-setup", at: 70, by: "remote-device", data: { autoAdd: [{ pl: "PL_selected", takes: "both" }] } }
const recreatedFilter: JsonObject = { v: 1, gen: "recreated-filter", at: 70, by: "remote-device", data: { mode: "deny", on: true, channels: [] } }
const recreated = { [setupName]: recreatedSetup, [selectedFilter]: recreatedFilter }
function removedSeed(): RemovalFixtureState { return removedHere(syncedSeed(), [setupName, ...liveFilters]) }
function recreate(h: ReturnType<typeof createRemovalHarness>, documents: Readonly<Record<string, JsonObject>>) {
  h.foreign(state => { for (const [name, document] of Object.entries(documents)) state.sync[`s:${name.slice(4)}`] = structuredClone(document) })
}
function recreatedHere(seed: RemovalFixtureState, documents: Readonly<Record<string, JsonObject>>): RemovalFixtureState {
  const state = structuredClone(seed), pushed = json(json(state.local.sync).pushed)
  for (const [name, document] of Object.entries(documents)) {
    state.local[name] = structuredClone(document); pushed[name] = document.gen!; state.sync[`s:${name.slice(4)}`] = structuredClone(document)
  }
  return state
}

test("a newer live Setup and Filter from another browser replace the local tombstones in one receive pass", async () => {
  const seed = removedSeed(), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps), events: ConfirmedViewChange[] = []
  owner.subscribeView(event => events.push(event))
  try {
    recreate(h, recreated)
    await owner.startSync()
    const state = h.state(), expected = recreatedHere(seed, recreated)
    expect(state.local).toEqual(expected.local)
    expect(state.session).toEqual(seed.session)
    expect(h.io.some(entry => entry.kind.startsWith("sync.set"))).toBe(false)
    expect(events.filter(event => "acct" in event && event.acct === acct)).toEqual([
      { kind: "setup-changed", source: "sync", acct }, { kind: "filter-changed", source: "sync", acct, playlist: selected }])
    expect(await owner.readSetup(acct)).toMatchObject({ kind: "value", view: { kind: "live", acct } })
  } finally { await owner.dispose() }
})

test.each(["setup-first", "filter-first"] as const)("a recreated account converges when its documents arrive %s", async order => {
  const seed = removedSeed(), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  const [first, second] = order === "setup-first"
    ? [{ [setupName]: recreatedSetup }, { [selectedFilter]: recreatedFilter }]
    : [{ [selectedFilter]: recreatedFilter }, { [setupName]: recreatedSetup }]
  try {
    recreate(h, first)
    await owner.startSync()
    expect(h.state().local).toEqual(order === "setup-first" ? recreatedHere(seed, first).local : seed.local)
    recreate(h, second)
    h.fireSync(); await settle(owner)
    expect(h.state().local).toEqual(recreatedHere(seed, recreated).local)
  } finally { await owner.dispose() }
})

test("a restart at any point while a recreated account arrives converges on a fresh owner", async () => {
  const seed = removedSeed(), expected = recreatedHere(seed, recreated)
  const control = createRemovalHarness(seed), probe = createLocalFilterWriter(control.deps)
  recreate(control, recreated)
  await probe.startSync(); await probe.dispose()
  const total = control.io.filter(entry => entry.phase === "invoked").length
  expect(control.state().local).toEqual(expected.local)
  for (let at = 1; at <= total; at++) for (const when of ["before", "after"] as const) {
    const h = createRemovalHarness(seed)
    recreate(h, recreated)
    h.fault({ at, when, kind: "interrupt" })
    const interrupted = createLocalFilterWriter(h.deps)
    await interrupted.startSync().catch(() => {})
    await interrupted.dispose().catch(() => {})
    h.fault(undefined)
    const restarted = createLocalFilterWriter(h.deps)
    try {
      await restarted.startSync()
      expect({ at, when, local: h.state().local }).toEqual({ at, when, local: expected.local })
    } finally { await restarted.dispose() }
  }
}, 120_000)

test.each([["older", 40], ["equal", 50]] as const)("an %s live Setup can't bring back a removed Setup", async (_, at) => {
  const seed = removedSeed(), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    recreate(h, { [setupName]: { ...recreatedSetup, at } })
    expect(await owner.receiveSyncDocument({ kind: "setup", acct })).toEqual({ kind: "unavailable", reason: "conflict" })
    expect(h.state().local).toEqual(seed.local)
  } finally { await owner.dispose() }
})

test("a live Setup waits while the local Setup tombstone is unacknowledged", async () => {
  const seed = removedSeed(); json(json(seed.local.sync).pushed)[setupName] = "unsent-removal"
  const h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    recreate(h, recreated)
    expect(await owner.receiveSyncDocument({ kind: "setup", acct })).toEqual({ kind: "unavailable", reason: "pending" })
    expect(h.state().local).toEqual(seed.local)
  } finally { await owner.dispose() }
})
