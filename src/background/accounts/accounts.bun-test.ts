import { expect, test } from "bun:test"
import { createAccounts, accountDisplayName } from "./accounts"
import { ACCOUNT_LABEL_MS, checkedAccountLabel } from "../store/account-label"
import { createI18n } from "../../shared/i18n"
import catalogue from "../../public/_locales/en/messages.json"
import { a, b, alpha, beta, epoch, seed, world, object, deferred, success, signedIn, signedOut, origin, type WriteFault } from "../../../tools/fixtures/accounts-label/harness"

test("first seen account uses its actual Tabs label job and confirmed owner writes", async () => {
  const initial = seed(),
    h = world(initial),
    events: unknown[] = []
  try {
    const context = h.context()
    h.owner.subscribeSetup(event => events.push(event))
    h.script(async (_tab, invocation) => {
      expect(invocation).toEqual({ job: { kind: "accountLabel" }, acct: a })
      return success({ name: "Updated", handle: "@updated", avatar: "https://img.test/avatar" })
    })
    const result = await h.accounts.onSeen(context)
    expect(result).toEqual({
      label: { kind: "completed", acct: a, result: { kind: "committed", label: { name: "Updated", handle: "@updated", avatar: "https://img.test/avatar" }, checkedAt: epoch } },
      claim: { kind: "unavailable", reason: "production-ownership-required" }
    })
    expect(h.runs()).toHaveLength(1)
    expect(h.runs()[0]).toMatchObject({ tabId: 1 })
    expect(h.label()).toEqual({ name: "Updated", handle: "@updated", avatar: "https://img.test/avatar" })
    expect(h.stored().lastAccount).toBe(a)
    expect(h.stored()[`cache:${a}`]).toEqual({ ...object(initial.local[`cache:${a}`]), labelAt: epoch })
    expect(h.stored().unrelated).toEqual(initial.local.unrelated)
    expect(events).toEqual([{ kind: "setup-changed", source: "local", acct: a }])
    expect(h.removal.counts().generations).toBe(1)
  } finally {
    await h.dispose()
  }
})

test("an unchanged successful label advances the confirmed check stamp without a Setup generation", async () => {
  const initial = seed(),
    h = world(initial),
    events: unknown[] = []
  try {
    h.owner.subscribeSetup(event => events.push(event))
    const result = await h.accounts.onSeen(h.context())
    expect(result.label).toEqual({ kind: "completed", acct: a, result: { kind: "current", label: { name: "Original" }, checkedAt: epoch } })
    expect(h.stored()[`doc:setup:${a}`]).toEqual(initial.local[`doc:setup:${a}`])
    expect(h.stored()[`cache:${a}`]).toEqual({ ...object(initial.local[`cache:${a}`]), labelAt: epoch })
    expect(h.removal.counts().generations).toBe(0)
    expect(events).toEqual([])
    const writes = h.writes
    expect((await h.accounts.onSeen(h.context())).label.kind).toBe("stored")
    expect(h.writes).toBe(writes)
    expect(h.runs()).toHaveLength(1)
    expect(await h.accounts.readLiveLabel(h.context())).toEqual({ kind: "setup-present" })
    expect(h.runs()).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})

test("the exact 24-hour threshold is due and a future or backwards stamp never causes a repeat", async () => {
  const h = world()
  try {
    await h.accounts.onSeen(h.context())
    h.advance(ACCOUNT_LABEL_MS - 1)
    expect((await h.accounts.onSeen(h.context())).label.kind).toBe("stored")
    h.advance(1)
    expect((await h.accounts.onSeen(h.context())).label.kind).toBe("completed")
    expect(h.runs()).toHaveLength(2)
    h.wall(epoch - 1)
    expect((await h.accounts.onSeen(h.context())).label.kind).toBe("stored")
    expect(h.runs()).toHaveLength(2)
    expect(object(h.stored()[`cache:${a}`]).labelAt).toBe(epoch + ACCOUNT_LABEL_MS)
  } finally {
    await h.dispose()
  }
})

test("the local stamp survives restart and throttles a failed lookup too", async () => {
  const h = world()
  let restarted: ReturnType<typeof world> | undefined
  try {
    h.script(async () => ({ ok: false, reason: "unavailable" }))
    expect((await h.accounts.onSeen(h.context())).label.kind).toBe("lookup-failed")
    expect(h.label()).toEqual({ name: "Original" })
    expect((await h.accounts.onSeen(h.context())).label.kind).toBe("stored")
    expect(h.runs()).toHaveLength(1)
    restarted = world(h.removal.state())
    expect((await restarted.accounts.onSeen(restarted.context())).label.kind).toBe("stored")
    expect(restarted.runs()).toEqual([])
    expect(restarted.removal.counts().generations).toBe(0)
  } finally {
    await restarted?.dispose()
    await h.dispose()
  }
})

test("duplicate concurrent normal visits share one account-lifetime lookup", async () => {
  const h = world(),
    entered = deferred<void>(),
    answer = deferred<unknown>()
  try {
    const one = h.context(),
      two = h.context(a, 2)
    h.script(async () => {
      entered.resolve()
      return answer.promise
    })
    const first = h.accounts.onSeen(one)
    await entered.promise
    const second = h.accounts.onSeen(two)
    await h.owner.readSetup(a)
    answer.resolve(success({ name: "Coalesced" }))
    expect(await first).toEqual(await second)
    expect(h.runs()).toHaveLength(1)
    expect(h.removal.counts().generations).toBe(1)
  } finally {
    answer.resolve({ ok: false, reason: "unavailable" })
    await h.dispose()
  }
})

test("changed optional label fields replace old fields and names keep complete Unicode characters", async () => {
  const initial = seed()
  object(object(initial.local[`doc:setup:${a}`]).data).label = { name: "Old", handle: "@old", avatar: "https://img.test/old" }
  const h = world(initial)
  try {
    h.script(async () => success({ name: "😀".repeat(101) }))
    await h.accounts.onSeen(h.context())
    expect(h.label()).toEqual({ name: "😀".repeat(100) })
    h.advance(ACCOUNT_LABEL_MS)
    h.script(async () => success({ name: "😀".repeat(100), handle: "@new", avatar: "https://img.test/new" }))
    await h.accounts.onSeen(h.context())
    expect(h.label()).toEqual({ name: "😀".repeat(100), handle: "@new", avatar: "https://img.test/new" })
    expect(h.removal.counts().generations).toBe(2)
  } finally {
    await h.dispose()
  }
})

test("display uses the existing localized unnamed-account copy without storing it", () => {
  const i18n = createI18n({ getMessage: key => (key === "copy_account" ? "Localized unnamed account" : "unexpected") }, catalogue)
  expect(accountDisplayName(null, i18n)).toBe("Localized unnamed account")
  expect(accountDisplayName({ name: " " }, i18n)).toBe("Localized unnamed account")
  expect(accountDisplayName({ name: "Actual name" }, i18n)).toBe("Actual name")
  expect(checkedAccountLabel({ name: "", handle: "not a handle" })).toBeUndefined()
  expect(checkedAccountLabel({ name: "", avatar: "javascript:bad" })).toBeUndefined()
})

test("a no-Setup page visit stores nothing and an explicit header read returns detached live facts", async () => {
  const initial = seed()
  delete initial.local[`doc:setup:${a}`]
  delete initial.local[`cache:${a}`]
  const h = world(initial)
  try {
    const context = h.context()
    expect((await h.accounts.onSeen(context)).label).toEqual({ kind: "no-setup" })
    expect(h.runs()).toEqual([])
    expect(h.writes).toBe(0)
    expect(h.stored()).toEqual(initial.local)
    h.script(async () => success({ name: "Live new account" }))
    const live = await h.accounts.readLiveLabel(context)
    expect(live).toEqual({ kind: "label", acct: a, label: { name: "Live new account" }, persistence: "caller-owned" })
    if (live.kind === "label") live.label.name = "Caller change"
    expect(h.stored()).toEqual(initial.local)
    expect(await h.owner.readLastAccount({ kind: "normal-window", windowId: 1, incognito: false })).toEqual({ kind: "none" })
  } finally {
    await h.dispose()
  }
})

test("signed-out and private visits stop before owner reads, jobs and writes", async () => {
  const h = world(),
    initial = h.removal.state()
  try {
    const context = h.context(),
      privateContext = h.context(a, 9, true)
    expect((await h.accounts.onSeen({ ...context, info: signedOut() })).label).toEqual({ kind: "signed-out" })
    expect((await h.accounts.onSeen(privateContext)).label).toEqual({ kind: "private" })
    expect(h.reads).toBe(0)
    expect(h.writes).toBe(0)
    expect(h.runs()).toEqual([])
    expect(h.removal.state()).toEqual(initial)
    h.script(async () => success({ name: "Private live" }))
    expect(await h.accounts.readLiveLabel(privateContext)).toEqual({ kind: "label", acct: a, label: { name: "Private live" }, persistence: "caller-owned" })
    expect(h.removal.state()).toEqual(initial)
  } finally {
    await h.dispose()
  }
})

test("held consent and a newer Setup prevent network reads and all label bookkeeping", async () => {
  for (const state of ["consent", "newer-setup"] as const) {
    const initial = seed()
    if (state === "consent") object(initial.local.device).consent = null
    else object(initial.local[`doc:setup:${a}`]).v = 2
    const h = world(initial)
    try {
      const result = await h.accounts.onSeen(h.context())
      expect(result.label.kind).toBe("owner")
      expect(h.runs()).toEqual([])
      expect(h.writes).toBe(0)
      expect(h.stored()).toEqual(initial.local)
    } finally {
      await h.dispose()
    }
  }
})

test("actual Tabs refuses a changed account and never sends a wrong-account label job", async () => {
  const h = world()
  try {
    const context = h.context()
    h.pings.set(1, signedIn(b))
    const result = await h.accounts.onSeen(context)
    expect(result.label).toMatchObject({ kind: "lookup-failed", outcome: { kind: "guard", reason: "accountChanged" } })
    expect(h.runs()).toEqual([])
    expect(h.label()).toEqual({ name: "Original" })
  } finally {
    await h.dispose()
  }
})

test("unreadable owner sync authority prevents normal label reads and metadata writes", async () => {
  const initial = seed()
  initial.local.sync = { joined: null, status: "off", pushed: {}, editedSinceOff: "invalid" }
  const h = world(initial)
  try {
    expect((await h.accounts.onSeen(h.context())).label).toMatchObject({ kind: "owner", result: { kind: "unavailable" } })
    expect(h.runs()).toEqual([])
    expect(h.writes).toBe(0)
    expect(h.stored()).toEqual(initial.local)
  } finally {
    await h.dispose()
  }
})

test("a wrong job answer is rejected by the actual Tabs result boundary", async () => {
  const h = world()
  try {
    h.script(async () => ({ ok: true, route: "accounts-label-fixture", data: [] }))
    expect((await h.accounts.onSeen(h.context())).label).toMatchObject({ kind: "lookup-failed", outcome: { kind: "transport", failure: "invalid-answer" } })
    expect(h.label()).toEqual({ name: "Original" })
    expect(h.removal.counts().generations).toBe(0)
  } finally {
    await h.dispose()
  }
})

test("a late answer cannot replace a newer seen-account device choice", async () => {
  const h = world(),
    entered = deferred<void>(),
    answer = deferred<unknown>()
  try {
    const one = h.context(),
      two = h.context(b, 2)
    h.script(async tab => (tab === 1 ? (entered.resolve(), answer.promise) : success({ name: "Other updated" })))
    const first = h.accounts.onSeen(one)
    await entered.promise
    await h.accounts.onSeen(two)
    answer.resolve(success({ name: "First updated late" }))
    expect((await first).label).toMatchObject({ kind: "completed", result: { kind: "committed" } })
    expect(h.stored().lastAccount).toBe(b)
    expect(h.label()).toEqual({ name: "First updated late" })
    expect(h.label(b)).toEqual({ name: "Other updated" })
  } finally {
    answer.resolve({ ok: false, reason: "unavailable" })
    await h.dispose()
  }
})

test("removal and recreation during an actual Tabs read revoke the old label capture", async () => {
  const h = world(),
    entered = deferred<void>(),
    answer = deferred<unknown>()
  try {
    h.script(async () => {
      entered.resolve()
      return answer.promise
    })
    const pending = h.accounts.onSeen(h.context())
    await entered.promise
    const preparation = await h.owner.prepareAccountRemoval(origin, a)
    if (preparation.kind !== "confirmation-required") throw Error("Expected actual account removal")
    expect(await h.owner.removeAccountSetup(origin, preparation.confirmation)).toEqual({ kind: "committed" })
    expect((await h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "quick-save" }, expected: { setup: "none" }, playlist: beta })).kind).toBe("committed")
    answer.resolve(success({ name: "Stale old incarnation" }))
    expect((await pending).label).toMatchObject({ kind: "completed", result: { kind: "stale" } })
    expect(h.label()).toBeNull()
    expect(h.stored().lastAccount ?? null).toBeNull()
    expect(h.stored()[`cache:${a}`]).toBeUndefined()
  } finally {
    answer.resolve({ ok: false, reason: "unavailable" })
    await h.dispose()
  }
})

test("a label answer preserves independent destination, filter and cache changes", async () => {
  const h = world(),
    entered = deferred<void>(),
    answer = deferred<unknown>()
  try {
    h.script(async () => {
      entered.resolve()
      return answer.promise
    })
    const pending = h.accounts.onSeen(h.context())
    await entered.promise
    expect((await h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "gather" }, expected: { setup: "live", playlist: null }, playlist: beta })).kind).toBe("committed")
    h.removal.foreign(state => {
      state.local[`doc:filter:${a}:${alpha}`] = { v: 1, gen: "filter", at: 1, by: "fixture", data: { mode: "allow", on: true, channels: [] } }
    })
    const read = await h.owner.readPlaylistCache({ acct: a, private: false })
    if (read.kind !== "cache" || read.authority.kind !== "eligible") throw Error("Expected actual cache capture")
    expect((await h.owner.absorbPlaylistCache(read.authority.capture, { kind: "list", acct: a, site: "www", at: epoch + 1, rows: [{ id: beta, title: "Independent list" }] })).kind).toBe("committed")
    const cache = h.stored()[`cache:${a}`],
      filter = h.stored()[`doc:filter:${a}:${alpha}`]
    answer.resolve(success({ name: "Independent label" }))
    expect((await pending).label).toMatchObject({ kind: "completed", result: { kind: "committed" } })
    expect(object(object(h.stored()[`doc:setup:${a}`]).data).gather).toBe(beta)
    expect(h.stored()[`doc:filter:${a}:${alpha}`]).toEqual(filter)
    expect(h.stored()[`cache:${a}`]).toEqual(cache)
  } finally {
    answer.resolve({ ok: false, reason: "unavailable" })
    await h.dispose()
  }
})

test("newer Settings remains independent while a newer Setup refuses a label completion", async () => {
  for (const kind of ["settings", "setup"] as const) {
    const h = world(),
      entered = deferred<void>(),
      answer = deferred<unknown>()
    try {
      h.script(async () => {
        entered.resolve()
        return answer.promise
      })
      const pending = h.accounts.onSeen(h.context())
      await entered.promise
      h.removal.foreign(state => {
        object(state.local[kind === "settings" ? "doc:settings" : `doc:setup:${a}`]).v = 2
      })
      const before = h.stored()
      answer.resolve(success({ name: "Readable independent label" }))
      const result = await pending
      if (kind === "settings") {
        expect(result.label).toMatchObject({ kind: "completed", result: { kind: "committed" } })
        expect(h.stored()["doc:settings"]).toEqual(before["doc:settings"])
      } else {
        expect(result.label).toMatchObject({ kind: "completed", result: { kind: "stale" } })
        expect(h.stored()).toEqual(before)
      }
    } finally {
      answer.resolve({ ok: false, reason: "unavailable" })
      await h.dispose()
    }
  }
})

for (const fault of ["rejected-unchanged", "rejected-applied", "resolved-unchanged", "mismatched", "unreadable"] satisfies WriteFault[]) {
  test(`metadata ${fault} never pretends that the check stamp was confirmed`, async () => {
    const initial = seed(),
      h = world(initial)
    try {
      h.fault("metadata", fault)
      const result = await h.accounts.onSeen(h.context())
      expect(result.label).toMatchObject({ kind: "owner", result: { kind: fault === "rejected-unchanged" ? "failed" : "unconfirmed" } })
      expect(h.runs()).toEqual([])
      expect(h.removal.counts().generations).toBe(0)
      if (fault === "rejected-unchanged" || fault === "resolved-unchanged") expect(h.stored()).toEqual(initial.local)
    } finally {
      await h.dispose()
    }
  })
  test(`label ${fault} retains the owner's actual failure and stop result`, async () => {
    const h = world(),
      events: unknown[] = []
    try {
      h.owner.subscribeSetup(event => events.push(event))
      h.script(async () => {
        h.fault("label", fault)
        return success({ name: "Uncertain label" })
      })
      const result = await h.accounts.onSeen(h.context())
      expect(result.label).toMatchObject({ kind: "completed", result: { kind: "setup", result: { kind: fault === "rejected-unchanged" ? "failed" : "unconfirmed" } } })
      expect(events).toEqual([])
      expect((await h.owner.readSetup(a)).kind).toBe("unavailable")
    } finally {
      await h.dispose()
    }
  })
}

test("disposal during lookup prevents a label completion and later seen work", async () => {
  const h = world(),
    entered = deferred<void>(),
    answer = deferred<unknown>()
  try {
    h.script(async () => {
      entered.resolve()
      return answer.promise
    })
    const context = h.context(),
      pending = h.accounts.onSeen(context)
    await entered.promise
    const before = h.stored()
    h.accounts.dispose()
    answer.resolve(success({ name: "Disposed answer" }))
    expect((await pending).label).toEqual({ kind: "disposed" })
    expect((await h.accounts.onSeen(context)).label).toEqual({ kind: "disposed" })
    expect(h.stored()).toEqual(before)
  } finally {
    answer.resolve({ ok: false, reason: "unavailable" })
    await h.dispose()
  }
})

test("an explicitly connected claim collaborator returns the actual fixture-only owner outcome", async () => {
  const h = world()
  const accounts = createAccounts({ owner: h.owner, tabs: h.engine, now: h.clock.wallNow, claim: { kind: "connected", onSeen: () => h.owner.claim() } })
  try {
    expect((await accounts.onSeen(h.context())).claim).toEqual({ kind: "owner", result: { kind: "unavailable", reason: "authority" } })
  } finally {
    accounts.dispose()
    await h.dispose()
  }
})
