import { expect, test } from "bun:test"
import { createLocalFilterWriter } from "./local-filter-writer"
import { createRemovalHarness, removalFixture, type RemovalFixtureState } from "../../../tools/fixtures/account-removal-execution/run"
import { isAccountKey } from "../../shared/model"
import { isJsonValue, type JsonObject } from "../../shared/contracts/json"

const acct = "AAAAAAAAAAAAAAAA", third = "CCCCCCCCCCCCCCCC"
if (!isAccountKey(acct) || !isAccountKey(third)) throw Error("Expected canonical synthetic identifiers")
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
const stamped = (gen: string, data: JsonObject): JsonObject => ({ v: 1, gen, at: 60, by: "remote-device", data })

test("a setup and filter that only the synced copy holds, from another browser, are created here with their pushed entries (SYNC-06)", async () => {
  const h = createRemovalHarness(syncedSeed()), owner = createLocalFilterWriter(h.deps)
  try {
    const setup = stamped("remote-setup", { quickSave: "PL_third", autoAdd: [{ pl: "PL_third", takes: "videos" }] })
    const filter = stamped("remote-filter", { mode: "deny", on: true, channels: [] })
    h.foreign(state => { state.sync[`s:setup:${third}`] = setup; state.sync[`s:filter:${third}:PL_third`] = filter })
    await owner.startSync()
    const local = h.state().local
    expect(local[`doc:setup:${third}`]).toEqual(setup)
    expect(local[`doc:filter:${third}:PL_third`]).toEqual(filter)
    expect(json(json(local.sync).pushed)[`doc:setup:${third}`]).toBe("remote-setup")
    const read = await owner.readSetup(third)
    expect(read.kind === "value" && read.view.kind).toBe("live")
  } finally { await owner.dispose() }
})

test("a synced tombstone for a document this browser never had changes nothing here", async () => {
  const seed = syncedSeed(), h = createRemovalHarness(seed), owner = createLocalFilterWriter(h.deps)
  try {
    h.foreign(state => { state.sync[`s:filter:${third}:PL_gone`] = { v: 1, gen: "gone", at: 60, by: "remote-device", deleted: true } })
    await owner.startSync()
    expect(Object.hasOwn(h.state().local, `doc:filter:${third}:PL_gone`)).toBe(false)
  } finally { await owner.dispose() }
})

test("a kept filter's tombstone applies under a live setup, while an auto-added playlist's filter keeps its own (SYNC-12, SYNC-14)", async () => {
  const h = createRemovalHarness(syncedSeed()), owner = createLocalFilterWriter(h.deps)
  try {
    const tombstone = (gen: string) => ({ v: 1, gen, at: 60, by: "remote-device", deleted: true })
    h.foreign(state => { state.sync[`s:filter:${acct}:PL_kept`] = tombstone("kept-gone"); state.sync[`s:filter:${acct}:PL_selected`] = tombstone("selected-gone") })
    await owner.startSync()
    const local = h.state().local
    expect(local[`doc:filter:${acct}:PL_kept`]).toEqual(tombstone("kept-gone"))
    expect(json(local[`doc:filter:${acct}:PL_selected`]).deleted).toBeUndefined()
  } finally { await owner.dispose() }
})

test("the status reads full while the synced copy is over the browsers' quota, and ok again once there's room (SYNC-17)", async () => {
  const h = createRemovalHarness(syncedSeed()), owner = createLocalFilterWriter(h.deps)
  try {
    await owner.startSync()
    h.foreign(state => {
      state.local[`doc:filter:${acct}:PL_selected`] = { ...json(state.local[`doc:filter:${acct}:PL_selected`]), gen: "edited-here", at: 70 }
      for (let n = 0; n < 520; n++) state.sync[`filler:${n}`] = 0
    })
    expect((await owner.flushSync()).kind).toBe("blocked")
    expect(json(h.state().local.sync).status).toBe("full")
    h.foreign(state => { for (let n = 0; n < 520; n++) delete state.sync[`filler:${n}`] })
    h.time(60_000)
    expect((await owner.flushSync()).kind).toBe("pushed")
    expect(json(h.state().local.sync).status).toBe("ok")
  } finally { await owner.dispose() }
})

test("the status reads update-needed while another browser's document is a version this one can't read (SYNC-23)", async () => {
  const h = createRemovalHarness(syncedSeed()), owner = createLocalFilterWriter(h.deps)
  try {
    await owner.startSync()
    h.foreign(state => { state.sync[`s:filter:${third}:PL_future`] = { v: 99, gen: "future", at: 80, by: "newer-browser", data: {} } })
    h.time(60_000)
    expect(["idle", "pushed"]).toContain((await owner.flushSync()).kind)
    expect(json(h.state().local.sync).status).toBe("update-needed")
  } finally { await owner.dispose() }
})
