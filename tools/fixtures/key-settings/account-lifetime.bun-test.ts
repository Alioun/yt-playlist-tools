import { expect, test } from "bun:test"
import { isAccountKey } from "../../../src/shared/model"
import { world, seed, object } from "./harness"

const acct = "AAAAAAAAAAAAAAAA"
if (!isAccountKey(acct)) throw Error("Expected canonical synthetic account")
for (const route of ["native", "wire"] as const)
  test(`${route} actual account removal revokes Undo even after the same ID is recreated`, async () => {
    const w = world(route)
    try {
      await w.owner.ready()
      const original = object(w.h.records()[`doc:setup:${acct}`]),
        removed = await w.remove()
      if (removed.kind !== "removed") throw Error("Expected real shortcut removal")
      const confirmation = await w.owner.prepareAccountRemoval(w.origin, acct)
      if (confirmation.kind !== "confirmation-required") throw Error("Expected native account removal confirmation")
      expect(await w.owner.removeAccountSetup(w.origin, confirmation.confirmation)).toMatchObject({ kind: "committed" })
      const recreated = { ...original, gen: "recreated-account", data: { ...object(original.data), targets: {} } }
      w.h.mutate(records => {
        records[`doc:setup:${acct}`] = recreated
      })
      const before = w.h.records()
      expect(await w.change({ kind: "shortcut-undo", receipt: removed.receipt })).toEqual({ kind: "refused", reason: "expired" })
      expect(w.h.records()).toEqual(before)
      expect(w.settings().shortcuts.list).toEqual([])
    } finally {
      await w.dispose()
    }
  })

test("confirmed sync Setup tombstone revokes the old removal receipt before a recreated account can use it", async () => {
  const initial = seed()
  object(initial.device).syncOn = true
  initial.sync = { joined: "history", pushed: {}, status: "ok", editedSinceOff: false, everEdited: false }
  const w = world("native", initial)
  try {
    await w.owner.ready()
    const removed = await w.remove()
    if (removed.kind !== "removed") throw Error("Expected removal")
    const original = object(w.h.records()[`doc:setup:${acct}`])
    // Declare the exact already-pushed local baseline for the synthetic incoming receive.
    w.h.mutate(records => {
      const pushed = object(object(records.sync).pushed)
      for (const [name, value] of Object.entries(records)) if (name.startsWith("doc:")) pushed[name] = object(value).gen!
    })
    await w.h.native.storage.sync.set({ [`s:setup:${acct}`]: { v: 1, gen: "remote-tombstone", at: 900, by: "other-device", deleted: true } })
    expect(await w.owner.receiveSyncDocument({ kind: "setup", acct })).toMatchObject({ kind: "adopted" })
    w.h.mutate(records => {
      records[`doc:setup:${acct}`] = { ...original, gen: "after-tombstone", data: { ...object(original.data), targets: {} } }
    })
    const before = w.h.records()
    expect(await w.change({ kind: "shortcut-undo", receipt: removed.receipt })).toEqual({ kind: "refused", reason: "expired" })
    expect(w.h.records()).toEqual(before)
  } finally {
    await w.dispose()
  }
})
