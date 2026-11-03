import { expect, test } from "bun:test"
import { ACCOUNT_LABEL_MS } from "../../../src/background/store/account-label"
import { defaultSettings } from "../../../src/shared/model"
import { harness as starting, gate, normal } from "../settings-file-owner/harness"
import { compose, reservation, fileFrom, a, b, epoch, origin, object, success, deferred } from "./harness"

test("checking uses fresh owner facts and never writes or publishes", async () => {
  const c = compose(),
    { h } = c
  try {
    const file = await fileFrom(h.owner),
      before = h.stored(),
      writes = h.writes,
      reads = h.reads
    const result = await h.owner.importCheck(origin, file.text)
    expect(result).toMatchObject({ kind: "import-plan", provenance: "fresh-edit-required", accountCount: 2 })
    expect(h.reads - reads).toBe(2)
    expect(h.writes).toBe(writes)
    expect(h.stored()).toEqual(before)
    expect(h.removal.counts().generations).toBe(0)
    expect(c.events).toEqual([])
    h.removal.foreign(state => {
      state.local["pending:account-removal"] = { v: 99 }
    })
    expect(await h.owner.importCheck(origin, file.text)).toEqual({ kind: "unavailable", reason: "pending-recovery" })
    expect(h.writes).toBe(writes)
    expect(c.events).toEqual([])
  } finally {
    await c.dispose()
  }
})

test("export and checking reject changes to device or consent binding during a read", async () => {
  for (const method of ["export", "check"] as const)
    for (const change of ["device", "consent"] as const) {
      const h = starting()
      await h.ready()
      try {
        const file = await h.owner.exportSettings(normal)
        if (file.kind !== "source") throw Error("Expected starting source")
        const text = JSON.stringify({ format: 1, product: "Perchling", version: "2.0.0", date: "2026-10-30", settings: defaultSettings(), accounts: {} })
        let reads = 0
        h.hooks.read = async () => {
          if (++reads !== 2) return
          if (change === "device") object(h.records.device).id = "replaced-device"
          else object(h.records.device).consent = { v: 1, at: 2 }
        }
        expect(await (method === "export" ? h.owner.exportSettings(normal) : h.owner.importCheck(normal, text))).toEqual({ kind: "unavailable", reason: "stale" })
        expect(h.calls.some(call => typeof call === "object" && call !== null && "set" in call)).toBe(false)
      } finally {
        await h.owner.dispose()
      }
    }
})

test("a valid check reselects fresh document generations and refuses changed documents", async () => {
  const h = starting()
  await h.ready()
  try {
    const text = JSON.stringify({ format: 1, product: "Perchling", version: "2.0.0", date: "2026-10-30", settings: defaultSettings(), accounts: {} })
    let reads = 0
    h.hooks.read = async () => {
      if (++reads === 2) object(h.records["doc:settings"]).gen = "newer-generation"
    }
    expect(await h.owner.importCheck(normal, text)).toEqual({ kind: "unavailable", reason: "stale" })
    expect(h.calls).not.toContain("generation")
    expect(h.calls).not.toContain("now")
  } finally {
    await h.owner.dispose()
  }
})

test("reads and checks use the existing lane and disposal refuses held results", async () => {
  const h = starting()
  await h.ready()
  const paused = gate()
  try {
    h.hooks.read = paused.wait
    const pending = h.owner.exportSettings(normal)
    await paused.entered
    const disposing = h.owner.dispose()
    paused.release()
    expect(await pending).toEqual({ kind: "unavailable", reason: "disposed" })
    await disposing
    expect(await h.owner.importCheck(normal, "{}")).toEqual({ kind: "unavailable", reason: "disposed" })
  } finally {
    paused.release()
    await h.owner.dispose()
  }
})

test("reservation and unchanged labels publish no document events and preserve raw cache", async () => {
  const c = compose(),
    { h } = c
  try {
    const before = h.stored(),
      cache = object(before[`cache:${a}`])
    const captured = reservation(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    expect(h.stored()[`cache:${a}`]).toEqual({ ...cache, labelAt: epoch })
    expect(c.events).toEqual([])
    expect((await h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Original" } })).kind).toBe("current")
    expect(c.events).toEqual([])
    expect(h.removal.counts().generations).toBe(0)
    const writes = h.writes
    expect((await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch + ACCOUNT_LABEL_MS - 1 })).kind).toBe("current")
    expect((await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch - 1 })).kind).toBe("current")
    expect(h.writes).toBe(writes)
    expect((await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch + ACCOUNT_LABEL_MS })).kind).toBe("lookup")
    expect(c.events).toEqual([])
  } finally {
    await c.dispose()
  }
})

test("confirmed changed labels publish exactly one current Setup event", async () => {
  const c = compose(),
    { h } = c
  const setupEvents: unknown[] = [],
    stop = h.owner.subscribeSetup(event => setupEvents.push(event))
  try {
    h.script(async () => success({ name: "Published" }))
    expect((await h.accounts.onSeen(h.context())).label).toMatchObject({ kind: "completed", result: { kind: "committed" } })
    expect(c.events).toEqual([{ kind: "setup-changed", source: "local", acct: a }])
    expect(setupEvents).toEqual(c.events)
    expect(h.removal.counts().generations).toBe(1)
    expect(h.runs()).toHaveLength(1)
    expect((await h.accounts.onSeen(h.context())).label.kind).toBe("stored")
    expect(c.events).toHaveLength(1)
  } finally {
    stop()
    await c.dispose()
  }
})

test("late label completion preserves a newer last account sighting", async () => {
  const c = compose(),
    { h } = c
  try {
    const first = reservation(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    const second = reservation(await h.owner.seeAccountLabel({ acct: b, private: false, at: epoch }))
    expect(h.stored().lastAccount).toBe(b)
    expect((await h.owner.completeAccountLabel(first.capture, { acct: a, label: { name: "Late first" } })).kind).toBe("committed")
    expect((await h.owner.completeAccountLabel(second.capture, { acct: b, label: { name: "Second" } })).kind).toBe("committed")
    expect(h.stored().lastAccount).toBe(b)
    expect(c.events).toEqual([
      { kind: "setup-changed", source: "local", acct: a },
      { kind: "setup-changed", source: "local", acct: b }
    ])
  } finally {
    await c.dispose()
  }
})

test("Accounts coalesces concurrent visits through actual Tabs without duplicate publication", async () => {
  const c = compose(),
    { h } = c,
    entered = deferred<void>(),
    answer = deferred<unknown>()
  try {
    h.script(async () => {
      entered.resolve()
      return answer.promise
    })
    const context = h.context(),
      first = h.accounts.onSeen(context)
    await entered.promise
    const second = h.accounts.onSeen(context)
    await h.owner.readSetup(a)
    answer.resolve(success({ name: "Coalesced" }))
    const results = await Promise.all([first, second])
    expect(results.map(result => result.label.kind)).toEqual(["completed", "completed"])
    expect(h.runs()).toHaveLength(1)
    expect(c.events).toHaveLength(1)
  } finally {
    answer.resolve({ ok: false, reason: "unavailable" })
    await c.dispose()
  }
})

for (const fault of ["rejected-unchanged", "rejected-applied", "resolved-unchanged", "unreadable"] as const) {
  test(`label ${fault} never publishes an unconfirmed change`, async () => {
    const c = compose(),
      { h } = c
    try {
      const captured = reservation(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
      h.fault("label", fault)
      expect(await h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Unconfirmed" } })).toMatchObject({
        kind: "setup",
        result: { kind: fault === "rejected-unchanged" ? "failed" : "unconfirmed" }
      })
      expect(c.events).toEqual([])
      expect(c.revocations).toBe(1)
      expect(await h.owner.exportSettings(origin)).toEqual({ kind: "unavailable", reason: "stale" })
    } finally {
      await c.dispose()
    }
  })
}
