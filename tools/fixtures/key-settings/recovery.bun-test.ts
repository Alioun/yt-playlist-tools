import { expect, test } from "bun:test"
import { world, seed, object, account, type Route } from "./harness"
import { withdrawRemovalFixture } from "../account-removal-execution/run"
import { gate } from "../starting-owner/support"
import { keySettingsProgressKey, readKeySettingsProgress } from "../../../src/background/store/key-settings-progress"

for (const route of ["owner", "native", "wire"] satisfies readonly Route[]) {
  for (const phase of [2, 3])
    test(`${route} phase ${phase} pending removal requires explicit fresh recovery after withdrawal and Agree`, async () => {
      const w = world(route)
      let pending = seed()
      try {
        await w.owner.ready()
        w.fault("reject-before", phase)
        expect((await w.remove()).kind).toBe("refused")
        pending = w.h.records()
        expect(readKeySettingsProgress(pending[keySettingsProgressKey])).toMatchObject({ kind: "valid", record: { state: "accepted" } })
      } finally {
        await w.dispose()
      }
      const withdrawal = await withdrawRemovalFixture({ local: pending, session: {}, sync: {} })
      expect(withdrawal.result.kind).toBe("withdrawn")
      expect(withdrawal.state.local[keySettingsProgressKey]).toEqual(pending[keySettingsProgressKey])
      const restored = world(route, withdrawal.state.local)
      try {
        await expect(restored.owner.ready()).rejects.toThrow()
        const beforeAgree = restored.h.records()
        const review = await restored.owner.readAgreement(restored.origin)
        if (review.kind !== "review") throw Error("Expected held disclosure")
        expect(
          await restored.owner.agree(restored.origin, {
            review: review.review,
            displayedVersion: review.version,
            choice: { kind: "disclosure" },
            access: Promise.resolve({ www: true, music: true, browserMenu: true })
          })
        ).toMatchObject({ kind: "committed", settingsChanged: false, activation: "held" })
        expect(restored.h.records()[keySettingsProgressKey]).toEqual(beforeAgree[keySettingsProgressKey])
        const device = restored.h.records().device
        const held = await restored.owner.readWithdrawnWork(restored.origin)
        if (held.kind !== "held") throw Error("Expected explicit held-work review")
        const selected = held.work.find(row => row.kind === "key-settings")
        if (selected?.kind !== "key-settings") throw Error("Expected key removal selection")
        expect(await restored.owner.recoverWithdrawnWork(restored.origin, { review: held.review, job: selected.selection })).toMatchObject({
          kind: "key-settings-recovered",
          original: { v: 1, at: 1 }
        })
        expect(restored.h.records().device).toEqual(device)
        expect(restored.settings().shortcuts.list).toEqual([])
        expect(object(object(restored.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).data).targets).toEqual({})
        expect(await restored.owner.recoverWithdrawnWork(restored.origin, { review: held.review, job: selected.selection })).toMatchObject({ kind: "unavailable" })
        expect(restored.events).toEqual([
          { kind: "settings-changed", source: "local" },
          { kind: "setup-changed", source: "local", acct: account("AAAAAAAAAAAAAAAA") }
        ])
      } finally {
        await restored.dispose()
      }
    })

  test(`${route} a partial Settings/Setup effect is held and cannot allow an unrelated mutation`, async () => {
    const w = world(route)
    try {
      await w.owner.ready()
      w.fault("partial", 2)
      expect((await w.remove()).kind).toBe("refused")
      expect(w.settings().shortcuts.list).toEqual([])
      expect(object(object(w.h.records()["doc:setup:AAAAAAAAAAAAAAAA"]).data).targets).toEqual({ save01: "PL_shortcut" })
      const before = w.h.records()
      expect(await w.change({ kind: "shortcut-add" })).toEqual({ kind: "refused", reason: "unavailable" })
      expect(w.h.records()).toEqual(before)
      expect(w.events).toEqual([])
    } finally {
      await w.dispose()
    }
  })

  test(`${route} disposal during a held key write cannot return a successful receipt or publish`, async () => {
    const w = world(route),
      paused = gate()
    await w.owner.ready()
    w.beforeSet(paused.wait)
    const removing = w.remove()
    await paused.entered
    const disposing = w.owner.dispose()
    paused.release()
    try {
      expect((await removing).kind).toBe("refused")
      expect(w.events).toEqual([])
      await disposing
    } finally {
      paused.release()
      await w.dispose()
    }
  })
}
