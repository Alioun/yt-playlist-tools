import { expect, test } from "bun:test"
import { createBrowserStartingLocalFilterWriter } from "../adapters/starting-owner"
import { agreedSeed, startingOwnerFixture } from "../../../tools/fixtures/starting-owner/support"
import type { JsonObject } from "../../shared/contracts/json"

const acct = "AAAAAAAAAAAAAAAA", playlist = "PL_alpha", setupName = `doc:setup:${acct}`
const record = (value: unknown) => value as JsonObject

test("a Full mark past the browsers' sync limit stays in this browser, and goes to the synced copy once room frees up (SYNC-16)", async () => {
  const seed = agreedSeed(true)
  seed[setupName] = { v: 1, gen: "setup-0", at: 1, by: "starting-fixture", data: { gather: playlist } }
  record(seed.sync).pushed = { "doc:settings": "settings-0", [setupName]: "setup-0" }
  const h = startingOwnerFixture(seed)
  let now = 0
  const owner = createBrowserStartingLocalFilterWriter(h.native, { ...h.options, syncClock: { ...h.options.syncClock!, now: () => now } })
  const roomy = h.remote()
  h.replaceRemote({ ...roomy, ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`other:${i}`, "y".repeat(7900)])) })
  try {
    expect(await owner.ready()).toBe("ok")
    expect((await owner.markPlaylists({ acct: acct as never, private: false, marks: [{ playlist: playlist as never, mark: "full" }] })).kind).toBe("committed")
    const saved = h.records()
    expect(record(record(saved[setupName]).data).marks, "the mark is saved here").toEqual({ [playlist]: "full" })
    const gen = String(record(saved[setupName]).gen)
    expect(record(saved.sync).deferred, "and waits for room").toEqual({ [setupName]: gen })
    now = 10_000
    expect((await owner.flushSync()).kind, "while the synced copy is over the limit, nothing goes").toBe("idle")
    expect(h.remote()[`s:setup:${acct}`]).toEqual(roomy[`s:setup:${acct}`])
    h.replaceRemote(roomy)
    now = 20_000
    expect((await owner.flushSync()).kind, "with room again, the flush sends it").toBe("pushed")
    expect(h.remote()[`s:setup:${acct}`]).toEqual(saved[setupName])
    const after = record(h.records().sync)
    expect(record(after.pushed)[setupName]).toBe(gen)
    expect(Object.hasOwn(after, "deferred"), "the acknowledged mark no longer waits").toBe(false)
  } finally { await owner.dispose() }
})
