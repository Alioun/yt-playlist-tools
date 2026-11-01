import { expect, test } from "bun:test"
import { keyAt, keyForWire } from "../../../src/shared/contracts/key-settings-fields"
import { keySettingsProgressKey, readKeySettingsProgress } from "../../../src/background/store/key-settings-progress"
import type { ShortcutTarget } from "../../../src/shared/keys"
import { world, seed, object, chord, shortcut, account, type Route, type Fault } from "./harness"

const routes: readonly Route[] = ["owner", "native", "wire"]
const actions = ["next", "queue", "save", "picker", "like", "remove", "library", "mix", "album", "artist"] as const
const targets: readonly ShortcutTarget[] = [{ kind: "undo" }, { kind: "picker" }, { kind: "playlist", id: "save01" },
  ...actions.map(action => ({ kind: "music", action } as const))]

for (const route of routes) {
  for (const target of targets) test(`${route} assigns and clears ${JSON.stringify(target)} without changing other fields`, async () => {
    const w = world(route)
    try {
      await w.owner.ready()
      const before = w.settings(), setup = w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]
      expect(await w.assign(target, chord("z"))).toMatchObject({ kind: "confirmed", status: "changed" })
      expect(keyAt(w.settings(), target)).toEqual(chord("z"))
      expect(await w.assign(target, null)).toMatchObject({ kind: "confirmed", status: "changed" })
      expect(keyAt(w.settings(), target)).toBeNull()
      expect(w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(setup)
      expect(w.settings().shortcuts.list.map(row => ({ id: row.id, label: row.label, watchLaterOnEveryAccount: row.watchLaterOnEveryAccount })))
        .toEqual(before.shortcuts.list.map(row => ({ id: row.id, label: row.label, watchLaterOnEveryAccount: row.watchLaterOnEveryAccount })))
      expect(w.events).toEqual([{ kind: "settings-changed", source: "local" }, { kind: "settings-changed", source: "local" }])
      const writes = w.batches.length
      expect(await w.assign(target, null)).toMatchObject({ kind: "confirmed", status: "unchanged" })
      expect(w.batches).toHaveLength(writes); expect(w.events).toHaveLength(2)
    } finally { await w.dispose() }
  })

  test(`${route} same-site conflict requires explicit confirmation and preserves an independent edit`, async () => {
    const w = world(route)
    try {
      await w.owner.ready(); await w.assign({ kind: "picker" }, chord("z"))
      const conflict = await w.assign({ kind: "undo" }, chord("z"))
      expect(conflict).toEqual({ kind: "conflict", conflicts: [{ target: { kind: "picker" }, key: chord("z"), sites: ["www"] }] })
      const before = w.h.records()
      expect(w.settings().undoKey).toBeNull()
      await w.assign({ kind: "music", action: "like" }, chord("x"))
      if (conflict.kind !== "conflict") throw Error("Expected owner conflict receipt")
      expect(await w.assign({ kind: "undo" }, chord("z"), { kind: "use-here", conflicts: conflict.conflicts })).toMatchObject({ kind: "confirmed" })
      expect(w.settings().shortcuts.picker).toBeNull()
      expect(w.settings().musicKeys.keys.like).toEqual(chord("x"))
      expect(w.h.records().device).toEqual(before.device)
    } finally { await w.dispose() }
  })

  test(`${route} www picker and Music picker may share a key; Undo overlaps both`, async () => {
    const w = world(route)
    try {
      await w.owner.ready()
      expect(await w.assign({ kind: "picker" }, chord("z"))).toMatchObject({ kind: "confirmed" })
      expect(await w.assign({ kind: "music", action: "picker" }, chord("z"))).toMatchObject({ kind: "confirmed" })
      expect(await w.assign({ kind: "undo" }, chord("z"))).toEqual({ kind: "conflict", conflicts: [
        { target: { kind: "picker" }, key: chord("z"), sites: ["www"] },
        { target: { kind: "music", action: "picker" }, key: chord("z"), sites: ["music"] }
      ] })
    } finally { await w.dispose() }
  })

  test(`${route} stale conflict confirmation cannot clear a target changed since the dialog`, async () => {
    const w = world(route)
    try {
      await w.owner.ready(); await w.assign({ kind: "picker" }, chord("z"))
      const dialog = await w.assign({ kind: "undo" }, chord("z"))
      if (dialog.kind !== "conflict") throw Error("Expected conflict")
      await w.assign({ kind: "picker" }, chord("x"))
      const before = w.h.records(), events = structuredClone(w.events)
      expect(await w.assign({ kind: "undo" }, chord("z"), { kind: "use-here", conflicts: dialog.conflicts })).toEqual({ kind: "refused", reason: "stale" })
      expect(w.h.records()).toEqual(before); expect(w.events).toEqual(events)
    } finally { await w.dispose() }
  })

  test(`${route} labels trim to forty characters and Watch later preserves explicit account targets`, async () => {
    const w = world(route)
    try {
      await w.owner.ready()
      const row = w.settings().shortcuts.list[0]
      if (!row) throw Error("Expected shortcut")
      const setup = w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]
      expect(await w.change({ kind: "shortcut-label", id: shortcut(row.id), expected: row.label, value: `  ${"😀".repeat(42)}  ` })).toMatchObject({ kind: "confirmed" })
      expect(w.settings().shortcuts.list[0]?.label).toBe("😀".repeat(40))
      expect(await w.change({ kind: "shortcut-watch-later", id: shortcut(row.id), expected: row.watchLaterOnEveryAccount, value: !row.watchLaterOnEveryAccount })).toMatchObject({ kind: "confirmed" })
      expect(w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(setup)
      expect(w.settings().shortcuts.list[0]?.key).toEqual(row.key)
    } finally { await w.dispose() }
  })

  test(`${route} fresh IDs append, the twentieth row succeeds and the twenty-first is refused`, async () => {
    const w = world(route)
    try {
      await w.owner.ready()
      for (let n = 1; n < 20; n++) expect(await w.change({ kind: "shortcut-add" })).toEqual({ kind: "added", id: shortcut(`new${String(n).padStart(3, "0")}`) })
      expect(w.settings().shortcuts.list.map(row => row.id)).toEqual(["save01", ...Array.from({ length: 19 }, (_, n) => `new${String(n + 1).padStart(3, "0")}`)])
      const before = w.h.records()
      expect(await w.change({ kind: "shortcut-add" })).toEqual({ kind: "refused", reason: "limit" })
      expect(w.h.records()).toEqual(before)
    } finally { await w.dispose() }
  })

  test(`${route} retired, Setup-only and unclaimed IDs are never reused`, async () => {
    const initial = seed()
    initial["key-settings:progress"] = { v: 1, kind: "key-settings-progress", id: "retired", deviceId: "starting-fixture", original: { v: 1, at: 1 }, retired: ["new001"], state: "terminal" }
    object(object(initial["doc:setup:AAAAAAAAAAAAAAAA"]).data).targets = { save01: "PL_shortcut", new002: "PL_orphan" }
    initial.unclaimed = { from: "1.5.0", autoAdd: [], shortcutPlaylist: "PL_migrated", originalShortcutId: "new003", filters: {}, at: 1 }
    const w = world(route, initial)
    try {
      await w.owner.ready(); const setup = w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]
      expect(await w.change({ kind: "shortcut-add" })).toEqual({ kind: "added", id: shortcut("new004") })
      expect(w.settings().shortcuts.list.map(row => row.id)).toEqual(["save01", "new004"])
      expect(w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).toEqual(setup)
    } finally { await w.dispose() }
  })

  test(`${route} a no-op key preserves its stored extension fields`, async () => {
    const initial = seed(), settings = object(object(initial["doc:settings"]).data)
    settings.undoKey = { ...chord("z"), futureKey: ["preserve"] }
    const w = world(route, initial)
    try {
      await w.owner.ready(); const before = w.h.records()
      expect(await w.assign({ kind: "undo" }, chord("z"))).toMatchObject({ kind: "confirmed", status: "unchanged" })
      expect(w.h.records()).toEqual(before); expect(w.batches).toEqual([]); expect(w.events).toEqual([])
    } finally { await w.dispose() }
  })

  for (const privateWindow of [false, true]) test(`${route} private=${privateWindow} removal and real Undo preserve all unrelated records`, async () => {
    const initial = seed()
    initial["doc:setup:BBBBBBBBBBBBBBBB"] = { ...object(initial["doc:setup:AAAAAAAAAAAAAAAA"]), gen: "setup-b", data: { gather: "PL_b", targets: { save01: "PL_other", other1: "PL_keep" }, futureSetup: [1, 2] } }
    const w = world(route, initial, privateWindow)
    try {
      await w.owner.ready(); const original = w.h.records(), row = w.settings().shortcuts.list[0]
      if (!row) throw Error("Expected the seeded shortcut row")
      const removed = await w.remove()
      expect(removed).toMatchObject({ kind: "removed", id: "save01", undoForMs: 6000 })
      expect(w.settings().shortcuts.list).toEqual([])
      for (const acct of ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"]) {
        const data = object(object(w.h.records()[`doc:setup:${acct}`]).data)
        expect(object(data.targets).save01).toBeUndefined()
        const expected = structuredClone(object(object(original[`doc:setup:${acct}`]).data)); delete object(expected.targets).save01
        expect(data).toEqual(expected)
      }
      expect(w.events).toEqual([{ kind: "settings-changed", source: "local" },
        { kind: "setup-changed", source: "local", acct: account("AAAAAAAAAAAAAAAA") }, { kind: "setup-changed", source: "local", acct: account("BBBBBBBBBBBBBBBB") }])
      w.h.mutate(records => { object(object(records["doc:settings"]).data).theme = "dark" })
      if (removed.kind !== "removed") throw Error("Expected internal removal receipt")
      w.advance(5999)
      expect(await w.change({ kind: "shortcut-undo", receipt: removed.receipt })).toMatchObject({ kind: "confirmed" })
      expect(w.settings().shortcuts.list).toEqual([row]); expect(w.settings().theme).toBe("dark")
      for (const acct of ["AAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBB"]) expect(object(w.h.records()[`doc:setup:${acct}`]).data).toEqual(object(original[`doc:setup:${acct}`]).data)
      expect(await w.change({ kind: "shortcut-undo", receipt: removed.receipt })).toEqual({ kind: "refused", reason: "expired" })
    } finally { await w.dispose() }
  })

  for (const clock of ["expiry", "rollback"] as const) test(`${route} ${clock} revokes ephemeral Undo`, async () => {
    const w = world(route)
    try {
      await w.owner.ready(); const removed = await w.remove()
      if (removed.kind !== "removed") throw Error("Expected removal")
      if (clock === "expiry") w.advance(6000); else w.setTime(-1)
      const before = w.h.records()
      expect(await w.change({ kind: "shortcut-undo", receipt: removed.receipt })).toEqual({ kind: "refused", reason: "expired" })
      expect(w.h.records()).toEqual(before)
    } finally { await w.dispose() }
  })

  test(`${route} worker restart loses Undo and a changed Setup target cannot be overwritten`, async () => {
    const w = world(route)
    let receipt = "", saved = seed()
    try {
      await w.owner.ready(); const removed = await w.remove()
      if (removed.kind !== "removed") throw Error("Expected removal")
      receipt = removed.receipt; saved = w.h.records()
      w.h.mutate(records => { object(object(object(records["doc:setup:AAAAAAAAAAAAAAAA"]).data).targets).save01 = "PL_new" })
      const before = w.h.records()
      expect(await w.change({ kind: "shortcut-undo", receipt })).toEqual({ kind: "refused", reason: "stale" })
      expect(w.h.records()).toEqual(before)
    } finally { await w.dispose() }
    const restarted = world(route, saved)
    try { await restarted.owner.ready(); expect(await restarted.change({ kind: "shortcut-undo", receipt })).toEqual({ kind: "refused", reason: "expired" }) }
    finally { await restarted.dispose() }
  })

  for (const phase of [1, 2, 3]) for (const fault of ["reject-before", "reject-after", "ignore", "readback-fail", "mismatch"] satisfies readonly Fault[])
    test(`${route} removal phase ${phase} ${fault} never issues a successful receipt or event`, async () => {
      const w = world(route)
      try {
        await w.owner.ready(); w.fault(fault, phase)
        expect((await w.remove()).kind).toBe("refused"); expect(w.events).toEqual([])
        const read = readKeySettingsProgress(w.h.records()[keySettingsProgressKey])
        if (phase > 1) expect(read.kind).toBe("valid")
      } finally { await w.dispose() }
    })

  test(`${route} unsupported Setup blocks the complete removal before the first write`, async () => {
    const initial = seed(); object(initial["doc:setup:AAAAAAAAAAAAAAAA"]).v = 99
    const w = world(route, initial)
    try {
      await w.owner.ready(); const before = w.h.records()
      expect(await w.remove()).toEqual({ kind: "refused", reason: "update-needed" })
      expect(w.h.records()).toEqual(before); expect(w.batches).toEqual([]); expect(w.events).toEqual([])
    } finally { await w.dispose() }
  })

  test(`${route} unrelated untrimmed row and key extensions survive a field edit`, async () => {
    const initial = seed(), settings = object(object(initial["doc:settings"]).data)
    const row = object((object(settings.shortcuts).list as unknown[])[0]); row.label = "  Leave me alone  "
    const w = world(route, initial)
    try {
      await w.owner.ready(); await w.assign({ kind: "undo" }, chord("z"))
      expect(w.settings().shortcuts.list[0]).toEqual<unknown>(row)
      const stale = { kind: "key", target: { kind: "undo" }, expected: null, key: chord("x"), confirmation: { kind: "none" } } as const
      const before = w.h.records()
      expect(await w.change(stale)).toEqual({ kind: "refused", reason: "stale" }); expect(w.h.records()).toEqual(before)
      expect(keyForWire(w.settings().undoKey)).toEqual(chord("z"))
    } finally { await w.dispose() }
  })
}
