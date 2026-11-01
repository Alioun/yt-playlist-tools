import { expect, test } from "bun:test"
import { world, seed, object, chord, type Route } from "./harness"

function joined() {
  const initial = seed(); object(initial.device).syncOn = true
  initial.sync = { joined: "history", pushed: { "doc:settings": "settings-0", "doc:setup:AAAAAAAAAAAAAAAA": "setup-0" }, status: "ok", editedSinceOff: false, everEdited: false }
  return initial
}
for (const route of ["owner", "native", "wire"] satisfies readonly Route[]) {
  test(`${route} complete quota admission refuses removal before its durable marker`, async () => {
    const initial = joined(); object(object(initial["doc:settings"]).data).futureHuge = "x".repeat(150_000)
    const w = world(route, initial)
    try {
      await w.owner.ready(); const before = w.h.records()
      expect(await w.remove()).toEqual({ kind: "refused", reason: "sync-full" })
      expect(w.h.records()).toEqual(before); expect(w.batches).toEqual([]); expect(w.events).toEqual([])
    } finally { await w.dispose() }
  })
  test(`${route} confirmed key edits use the common two-second sync quiet period`, async () => {
    const w = world(route, joined())
    try {
      await w.owner.ready(); await w.owner.startSync()
      expect(await w.assign({ kind: "undo" }, chord("z"))).toMatchObject({ kind: "confirmed" })
      const writes = w.h.counts.syncSet
      expect(await w.owner.flushSync()).toMatchObject({ kind: "deferred", notBefore: 2000 })
      expect(w.h.counts.syncSet).toBe(writes)
      w.advance(1999); expect(await w.owner.flushSync()).toMatchObject({ kind: "deferred" }); expect(w.h.counts.syncSet).toBe(writes)
      w.advance(1); expect((await w.owner.flushSync()).kind).not.toBe("deferred")
      expect(w.h.counts.syncSet).toBeGreaterThan(writes)
    } finally { await w.dispose() }
  })
}
