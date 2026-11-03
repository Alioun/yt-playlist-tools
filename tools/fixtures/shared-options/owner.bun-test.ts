import { expect, test } from "bun:test"
import type { SharedSettingChange } from "../../../src/background/store/settings-edit"
import { cases, initial } from "./specimens"
import { gate, object, ui, world, type Fault, type Route } from "./harness"

const routes: readonly Route[] = ["owner", "native"]
const music = { kind: "option", field: "musicActions.buttons.next", value: false } as const
const gather = { kind: "option", field: "gather.auto.after", value: "1w" } as const

for (const route of routes) {
  for (const specimen of cases) {
    test(`${route} confirms ${specimen.name} and preserves the complete independent inventory`, async () => {
      const w = world(route, structuredClone(initial))
      w.h.seedSession({ undo: { kept: true }, pause: { kept: true }, gather: { kept: [1] } })
      try {
        expect(await w.owner.ready()).toBe("ok")
        expect(w.h.records()).toEqual(initial)
        const session = w.h.session()
        expect(await w.owner.changeSharedSetting(ui, specimen.change)).toEqual({ kind: "committed" })
        const expected = structuredClone(initial)
        expected["doc:settings"] = { ...object(expected["doc:settings"]), gen: "starting-1", at: 200, by: "starting-fixture", data: specimen.expectedSettings }
        expected.sync = { ...object(expected.sync), editedSinceOff: true, everEdited: true }
        expect(w.h.records()).toEqual(expected)
        expect(w.batches).toEqual([{ "doc:settings": expected["doc:settings"], sync: expected.sync }])
        expect(w.events).toEqual([{ kind: "settings-changed", source: "local" }])
        expect(w.h.session()).toEqual(session)
        expect(w.h.counts.syncGet).toBe(0)
        expect(w.h.counts.syncSet).toBe(0)
        expect(await w.owner.changeSharedSetting(ui, specimen.change)).toEqual({ kind: "unchanged" })
        expect(w.h.records()).toEqual(expected)
        expect(w.batches).toHaveLength(1)
        expect(w.events).toHaveLength(1)
        expect(w.h.counts.syncGet).toBe(0)
        expect(w.h.counts.syncSet).toBe(0)
      } finally {
        await w.dispose()
      }
    })
  }

  test(`${route} stores hidden choices with the Music section and features off`, async () => {
    const w = world(route, structuredClone(initial))
    try {
      await w.owner.ready()
      expect(await w.owner.changeSharedSetting(ui, music)).toEqual({ kind: "committed" })
      expect(await w.owner.changeSharedSetting(ui, gather)).toEqual({ kind: "committed" })
      const settings = object(object(w.h.records()["doc:settings"]).data)
      expect(settings.musicSection).toBe(false)
      expect(object(settings.musicActions).on).toBe(false)
      expect(object(settings.musicActions).preset).toBe(true)
      expect(object(settings.gather).on).toBe(false)
      expect(object(object(settings.gather).auto)).toEqual({ unvisited: true, after: "1w", background: true, count: true, n: 10, futureTrigger: ["keep"] })
      expect(settings.musicKeys).toEqual(object(object(initial["doc:settings"]).data).musicKeys)
    } finally {
      await w.dispose()
    }
  })

  test(`${route} invalid runtime field/value inputs never coerce or stamp`, async () => {
    const w = world(route, structuredClone(initial))
    try {
      await w.owner.ready()
      const invalid: readonly unknown[] = [
        { kind: "option", field: "gather.auto.n", value: "10" },
        { kind: "option", field: "gather.auto.n", value: 12 },
        { kind: "option", field: "gather.auto.n", value: NaN },
        { kind: "option", field: "gather.auto.n", value: Infinity },
        { kind: "option", field: "gather.auto.after", value: "1m" },
        { kind: "option", field: "gather.to", value: "newest" },
        { kind: "option", field: "gather.order", value: "queue" },
        { kind: "option", field: "musicActions.buttons.next", value: "shuffled" },
        { kind: "option", field: "autoAdd.feedback", value: 0 },
        { kind: "option", field: "musicActions.on", value: true },
        { kind: "option", field: "musicActions.preset", value: false },
        { kind: "option", field: "gather.auto.unvisited", value: false },
        { kind: "option", field: "gather.auto.background", value: false },
        { kind: "option", field: "gather.auto.count", value: false },
        { kind: "theme", value: "sepia" },
        { kind: "settings", value: {} },
        {},
        null
      ]
      for (const change of invalid) {
        // This cast models an untyped caller. The reducer must reject the payload at runtime.
        expect(await w.owner.changeSharedSetting(ui, change as SharedSettingChange)).toEqual({ kind: "result", result: { refused: "invalid" } })
      }
      expect(w.h.records()).toEqual(initial)
      expect(w.batches).toEqual([])
      expect(w.events).toEqual([])
      expect(w.h.counts.syncGet).toBe(0)
      expect(w.h.counts.syncSet).toBe(0)
    } finally {
      await w.dispose()
    }
  })

  for (const fault of ["reject-before", "reject-after", "ignore", "mismatch", "readback-fail"] satisfies readonly Fault[]) {
    test(`${route} ${fault} never substitutes a write promise for a confirmed receipt`, async () => {
      const w = world(route, structuredClone(initial))
      try {
        await w.owner.ready()
        w.fault(fault)
        const answer = await w.owner.changeSharedSetting(ui, music)
        if (fault === "reject-before" || fault === "reject-after") {
          expect(answer).toEqual({ kind: "failed", stage: "set", error: w.marker })
        } else {
          expect(answer.kind).toBe("unconfirmed")
          if (answer.kind === "unconfirmed") expect(answer.cause.kind).toBe(fault === "readback-fail" ? "read-failed" : "readback")
        }
        expect(w.events).toEqual([])
        const count = w.batches.length
        expect(await w.owner.changeSharedSetting(ui, gather)).toEqual({ kind: "unavailable", reason: "stale" })
        expect(w.batches).toHaveLength(count)
        if (fault === "reject-before" || fault === "ignore") expect(w.h.records()).toEqual(initial)
        if (fault === "reject-after") {
          const expected = cases.find(specimen => specimen.name === "musicActions.buttons.next")
          if (!expected) throw Error("Missing independent Music case")
          expect(object(w.h.records()["doc:settings"]).data).toEqual(expected.expectedSettings)
        }
      } finally {
        await w.dispose()
      }
    })
  }

  test(`${route} success and publication wait for exact readback`, async () => {
    const w = world(route, structuredClone(initial)),
      held = gate()
    try {
      await w.owner.ready()
      w.setHook(async () => {
        w.readHook(held.wait)
      })
      let resolved = false
      const pending = w.owner.changeSharedSetting(ui, music).then(answer => {
        resolved = true
        return answer
      })
      await held.entered
      w.h.options.onSyncResult({ kind: "pushed", sent: [], repaired: [] })
      expect(resolved).toBe(false)
      expect(w.events).toEqual([])
      expect(w.batches).toHaveLength(1)
      held.release()
      expect(await pending).toEqual({ kind: "committed" })
      expect(w.events).toEqual([{ kind: "settings-changed", source: "local" }])
    } finally {
      held.release()
      w.readHook()
      await w.dispose()
    }
  })

  test(`${route} a read failure before set keeps the error and permits a later admitted edit`, async () => {
    const w = world(route, structuredClone(initial))
    try {
      await w.owner.ready()
      w.readHook(async () => {
        w.readHook()
        throw w.marker
      })
      expect(await w.owner.changeSharedSetting(ui, music)).toEqual({ kind: "failed", stage: "before-set", error: w.marker })
      expect(w.batches).toEqual([])
      expect(w.events).toEqual([])
      expect(w.h.records()).toEqual(initial)
      expect(await w.owner.changeSharedSetting(ui, music)).toEqual({ kind: "committed" })
    } finally {
      await w.dispose()
    }
  })

  test(`${route} disposal during readback cannot turn a stored candidate into success`, async () => {
    const w = world(route, structuredClone(initial)),
      held = gate()
    try {
      await w.owner.ready()
      w.setHook(async () => {
        w.readHook(held.wait)
      })
      const pending = w.owner.changeSharedSetting(ui, music)
      await held.entered
      const closing = w.owner.dispose()
      held.release()
      w.readHook()
      expect(await pending).toEqual({ kind: "unconfirmed", cause: { kind: "authority" } })
      await closing
      expect(w.events).toEqual([])
      expect(w.batches).toHaveLength(1)
    } finally {
      held.release()
      w.readHook()
      await w.dispose()
    }
  })

  test(`${route} choices obey origin, consent, newer-document and disposal barriers`, async () => {
    for (const barrier of ["origin", "consent", "newer", "disposed"] as const) {
      const w = world(route, structuredClone(initial))
      try {
        await w.owner.ready()
        if (barrier === "consent")
          w.h.mutate(records => {
            object(records.device).consent = null
          })
        if (barrier === "newer")
          w.h.mutate(records => {
            object(records["doc:settings"]).v = 2
          })
        if (barrier === "disposed") await w.owner.dispose()
        const before = w.h.records()
        const answer = await w.owner.changeSharedSetting(barrier === "origin" ? { ...ui, windowId: -1 } : ui, music)
        expect(answer).toEqual(
          barrier === "origin"
            ? { kind: "result", result: { refused: "invalid" } }
            : barrier === "newer"
              ? { kind: "result", result: { refused: "update-needed" } }
              : { kind: "unavailable", reason: barrier === "disposed" ? "disposed" : "startup" }
        )
        expect(w.h.records()).toEqual(before)
        expect(w.batches).toEqual([])
        expect(w.events).toEqual([])
      } finally {
        await w.dispose()
      }
    }
  })

  test(`${route} a private UI changes the same shared choice without account or tab effects`, async () => {
    const w = world(route, structuredClone(initial))
    try {
      await w.owner.ready()
      expect(await w.owner.changeSharedSetting({ ...ui, incognito: true }, music)).toEqual({ kind: "committed" })
      const expected = cases.find(specimen => specimen.name === "musicActions.buttons.next")
      if (!expected) throw Error("Missing independent Music case")
      expect(object(w.h.records()["doc:settings"]).data).toEqual(expected.expectedSettings)
      expect(w.h.counts.sessionSet).toBe(0)
      expect(w.h.counts.sessionRemove).toBe(0)
      expect(w.h.counts.rawLocal).toBe(0)
    } finally {
      await w.dispose()
    }
  })

  test(`${route} an option no-op on absent settings leaves the document absent`, async () => {
    const seed = structuredClone(initial)
    delete seed["doc:settings"]
    const w = world(route, seed)
    try {
      await w.owner.ready()
      expect(await w.owner.changeSharedSetting(ui, { kind: "option", field: "gather.auto.n", value: 10 })).toEqual({ kind: "unchanged" })
      expect(w.h.records()["doc:settings"]).toBeUndefined()
      expect(w.batches).toEqual([])
      expect(await w.owner.changeSharedSetting(ui, gather)).toEqual({ kind: "committed" })
      const settings = object(object(w.h.records()["doc:settings"]).data)
      expect(object(object(settings.gather).auto)).toEqual({ unvisited: false, after: "1w", background: false, count: false, n: 10 })
    } finally {
      await w.dispose()
    }
  })

  test(`${route} readiness and a persisted join question hold ordinary choices`, async () => {
    const held = gate(),
      w = world(route, structuredClone(initial))
    w.readHook(held.wait)
    try {
      await held.entered
      expect(await w.owner.changeSharedSetting(ui, music)).toEqual({ kind: "unavailable", reason: "startup" })
      expect(w.batches).toEqual([])
      held.release()
      w.readHook()
      expect(await w.owner.ready()).toBe("ok")
    } finally {
      held.release()
      w.readHook()
      await w.dispose()
    }
    const seed = structuredClone(initial)
    seed["pending:sync-join"] = { v: 2, kind: "sync-join", phase: "choice", lastJoined: null, observedMetadata: { v: 1, id: "history", created: 0 }, suspended: { kind: "none" } }
    const joined = world(route, seed)
    try {
      await expect(joined.owner.ready()).rejects.toThrow()
      expect(await joined.owner.changeSharedSetting(ui, gather)).toEqual({ kind: "unavailable", reason: "startup" })
      expect(joined.h.records()).toEqual(seed)
      expect(joined.batches).toEqual([])
      expect(joined.events).toEqual([])
    } finally {
      await joined.dispose()
    }
  })

  for (const admission of ["admitted", "full", "remote-newer", "stale", "waiting"] as const) {
    test(`${route} sync ${admission} completes admission before any option mutation`, async () => {
      const seed = structuredClone(initial)
      object(seed.device).syncOn = true
      seed.sync = {
        joined: "history",
        pushed: { "doc:settings": "settings-0", "doc:setup:AAAAAAAAAAAAAAAA": "setup-0", "doc:filter:AAAAAAAAAAAAAAAA:PL_saved": "filter-0" },
        status: "ok",
        editedSinceOff: false,
        everEdited: true
      }
      const w = world(route, seed)
      try {
        await w.owner.ready()
        if (admission === "full") await w.h.native.storage.sync.set(Object.fromEntries(Array.from({ length: 480 }, (_, i) => [`s:settings@unproven.${i}`, "kept"])))
        if (admission === "remote-newer") await w.h.native.storage.sync.set({ "s:settings": { ...object(seed["doc:settings"]), v: 2 } })
        if (admission === "waiting")
          w.h.mutate(records => {
            records.sync = { joined: null, pushed: {}, status: "waiting", editedSinceOff: false }
          })
        if (admission === "stale")
          w.h.hooks.syncRead = async () => {
            w.h.mutate(records => {
              object(records.device).id = "foreign-device"
            })
          }
        const before = w.h.records(),
          remoteSets = w.h.counts.syncSet
        const answer = await w.owner.changeSharedSetting(ui, music)
        expect(answer).toEqual(
          admission === "admitted"
            ? { kind: "committed" }
            : admission === "full"
              ? { kind: "result", result: { refused: "sync-full" } }
              : admission === "remote-newer"
                ? { kind: "result", result: { refused: "update-needed" } }
                : { kind: "unavailable", reason: admission === "waiting" ? "sync-writer-required" : "stale" }
        )
        expect(w.h.counts.syncSet).toBe(remoteSets)
        if (admission !== "admitted") {
          expect(w.batches).toEqual([])
          expect(w.events).toEqual([])
          if (admission !== "stale") expect(w.h.records()).toEqual(before)
        } else {
          expect(w.batches).toHaveLength(1)
          expect(w.events).toEqual([{ kind: "settings-changed", source: "local" }])
          expect(w.h.counts.syncGet).toBe(1)
        }
      } finally {
        await w.dispose()
      }
    })
  }
}
