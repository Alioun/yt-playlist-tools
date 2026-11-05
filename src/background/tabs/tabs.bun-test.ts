import { expect, test } from "bun:test"
import { createTabs } from "./tabs"
import type { RoutingNeed, TabReply } from "./ports"
import type { TabPing } from "../../shared/contracts/tabs"
import { accountA, a, b, anyAccount, build, deferred, fixtureView, nativeTab, normal, privateRequester, settle, signedIn, signedOut, tabsFixture } from "../../../tools/fixtures/tabs/harness"

const need: RoutingNeed = { site: "www", req: normal, account: accountA }
const invocation = { job: { kind: "playlists" }, acct: a } as const
const hello = (info = signedIn()) => ({ ...info, hidden: true, fresh: true })

test("normal hello persists only projected canonical records and restart uses that owner", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    const first = await h.engine.seen(1, hello(), fixtureView)
    expect(first.kind).toBe("seen")
    expect(h.stored()).toEqual({
      unknown: { keep: true },
      tabs: {
        "1": { site: "www", signedIn: true, acct: a, hidden: true, fresh: true, at: 1_700_000_000_000, seenAt: 1_700_000_000_000 }
      }
    })
    const writes = h.sessionWrites()
    await h.engine.seen(1, hello(), fixtureView)
    expect(h.sessionWrites()).toEqual(writes)
    expect(await h.restart().accountInView(normal)).toEqual({ kind: "account", source: "active", tabId: 1, acct: a, signedIn: true })
    expect(h.sessionWrites()).toEqual(writes)
    expect(h.calls).toEqual([
      { kind: "get", tabId: 1 },
      { kind: "get", tabId: 1 },
      { kind: "get", tabId: 1 },
      { kind: "get", tabId: 1 },
      { kind: "query", site: "all" },
      { kind: "get", tabId: 1 },
      { kind: "ping", tabId: 1, milliseconds: 2_000 },
      { kind: "get", tabId: 1 }
    ])
  } finally {
    await h.dispose()
  }
})

test("private hello and routing never persist and never borrow the normal registry", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn(a))
    h.seedTab(nativeTab(9, { incognito: true, windowId: 2 }), signedIn(b))
    await h.engine.seen(1, hello(), fixtureView)
    const stored = h.stored(),
      writes = h.sessionWrites()
    const privateSeen = await h.engine.seen(9, hello(signedIn(b)), fixtureView)
    expect(privateSeen.kind === "seen" && privateSeen.registry).toEqual({ kind: "remembered", scope: "private" })
    expect(await h.engine.accountInView(privateRequester)).toEqual({ kind: "account", source: "active", tabId: 9, acct: b, signedIn: true })
    const result = await h.engine.serve(invocation, { ...need, req: privateRequester })
    expect(result).toEqual({ kind: "no-tab", attempted: [] })
    expect(h.stored()).toEqual(stored)
    expect(h.sessionWrites()).toEqual(writes)
    expect(h.calls.filter(call => call.kind === "run")).toEqual([])
    expect(JSON.stringify(h.stored())).not.toContain(b)
    expect(await h.restart().push(privateRequester, fixtureView)).toEqual({ sent: 0, failed: 0 })
  } finally {
    await h.dispose()
  }
})

test("concurrent different-account hellos merge fresh records through the same owner", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn(a))
    h.seedTab(nativeTab(2), signedIn(b))
    expect((await Promise.all([h.engine.seen(1, hello(), fixtureView), h.engine.seen(2, hello(signedIn(b)), fixtureView)])).map(result => result.kind)).toEqual(["seen", "seen"])
    expect(h.stored()).toEqual({
      unknown: { keep: true },
      tabs: {
        "1": { site: "www", signedIn: true, acct: a, hidden: true, fresh: true, at: 1_700_000_000_000, seenAt: 1_700_000_000_000 },
        "2": { site: "www", signedIn: true, acct: b, hidden: true, fresh: true, at: 1_700_000_000_000, seenAt: 1_700_000_000_000 }
      }
    })
    expect(h.sessionWrites()).toEqual(["session.set:tabs", "session.set:tabs"])
  } finally {
    await h.dispose()
  }
})

test("removal revokes an account's captured ping edit and preserves another account", async () => {
  const h = tabsFixture(),
    held = deferred<TabReply<TabPing>>()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.seedTab(nativeTab(2), signedIn(b))
    await h.engine.seen(1, hello(), fixtureView)
    await h.engine.seen(2, hello(signedIn(b)), fixtureView)
    h.hooks.ping = () => held.promise
    const running = h.engine.runIn(1, invocation, need)
    await settle()
    const prepared = await h.owner.prepareAccountRemoval({ kind: "ui", windowId: 1, incognito: false }, a)
    if (prepared.kind !== "confirmation-required") throw Error(`Removal refused: ${prepared.kind}`)
    expect((await h.owner.removeAccountSetup({ kind: "ui", windowId: 1, incognito: false }, prepared.confirmation)).kind).toBe("committed")
    held.resolve({ kind: "answered", result: signedIn() })
    expect(await running).toMatchObject({ kind: "session", result: { kind: "unavailable", reason: "revision" } })
    expect(h.stored().tabs).toEqual({ "2": { site: "www", signedIn: true, acct: b, hidden: true, fresh: true, at: 1_700_000_000_000, seenAt: 1_700_000_000_000 } })
    expect(h.calls.filter(call => call.kind === "run")).toEqual([])
  } finally {
    held.resolve({ kind: "answered", result: signedIn() })
    await h.dispose()
  }
})

test("the registry caps at 200, replaces hello facts and evicts the oldest observation", async () => {
  const h = tabsFixture()
  try {
    for (let id = 1; id <= 201; id++) {
      h.clock.advance(1)
      h.seedTab(nativeTab(id), signedIn())
      expect((await h.engine.seen(id, hello(), fixtureView)).kind).toBe("seen")
    }
    const memory = await h.owner.readSession()
    if (memory.kind !== "memory") throw Error("Owner unavailable")
    expect([...memory.memory.tabs.keys()]).toEqual(Array.from({ length: 200 }, (_, n) => n + 2))
    h.clock.advance(1)
    await h.engine.seen(2, { ...signedOut(), hidden: false, fresh: false }, fixtureView)
    expect((await h.owner.readSession()).kind).toBe("memory")
    expect(h.stored().tabs).toMatchObject({ "2": { site: "www", acct: null, signedIn: false, hidden: false, fresh: false, at: 1_700_000_000_202, seenAt: 1_700_000_000_202 } })
  } finally {
    await h.dispose()
  }
})

test("a gone original tab evicts its row and never falls back", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.seedTab(nativeTab(2), signedIn())
    await h.engine.seen(1, hello(), fixtureView)
    h.tabs.delete(1)
    expect(await h.engine.runIn(1, invocation, need)).toEqual({ kind: "no-tab", attempted: [1] })
    expect(h.stored()).toEqual({ unknown: { keep: true }, tabs: {} })
    expect(h.calls.filter(call => call.kind === "ping" || call.kind === "run" || call.kind === "query")).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("a ping that finds a gone tab evicts only that row", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    await h.engine.seen(1, hello(), fixtureView)
    h.hooks.ping = async () => ({ kind: "gone" })
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "no-tab", attempted: [1] })
    expect(h.stored()).toEqual({ unknown: { keep: true }, tabs: {} })
  } finally {
    await h.dispose()
  }
})

test("signed-out active state precedes recent accounts and normal cache", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1, { lastAccessed: 1 }), signedOut())
    h.seedTab(nativeTab(2, { lastAccessed: 999 }), signedIn(b))
    expect(await h.engine.accountInView(normal)).toEqual({ kind: "account", source: "active", tabId: 1, signedIn: false, acct: null })
    expect(h.calls.filter(call => call.kind === "ping")).toEqual([{ kind: "ping", tabId: 1, milliseconds: 2_000 }])
    expect(h.calls.filter(call => call.kind === "last-account" || call.kind === "has-setup")).toEqual([])
    h.tabs.set(1, nativeTab(1, { site: null }))
    expect(await h.engine.accountInView(normal)).toEqual({ kind: "account", source: "recent", tabId: 2, signedIn: true, acct: b })
  } finally {
    await h.dispose()
  }
})

test("cached last account requires a surviving Setup and has no private fallback", async () => {
  const h = tabsFixture()
  try {
    expect(await h.engine.accountInView(normal)).toEqual({ kind: "account", source: "last-account", acct: a })
    expect(h.calls).toEqual([{ kind: "query", site: "all" }, { kind: "last-account" }, { kind: "has-setup", acct: a }])
    h.setups.delete(a)
    expect(await h.engine.accountInView(normal)).toEqual({ kind: "none" })
    h.calls.length = 0
    expect(await h.engine.accountInView(privateRequester)).toEqual({ kind: "none" })
    expect(h.calls).toEqual([{ kind: "query", site: "all" }])
  } finally {
    await h.dispose()
  }
})

test("candidate order is active, matching account, unknown, with native exclusions before ping", async () => {
  const h = tabsFixture()
  try {
    for (const tab of [
      nativeTab(1),
      nativeTab(2, { lastAccessed: 20 }),
      nativeTab(3, { lastAccessed: 50 }),
      nativeTab(4, { lastAccessed: 999 }),
      nativeTab(5, { frozen: true }),
      nativeTab(6, { discarded: true }),
      nativeTab(7, { incognito: true, windowId: 2 }),
      nativeTab(8, { site: "music" })
    ])
      h.seedTab(tab, signedIn())
    await h.engine.seen(2, hello(), fixtureView)
    await h.engine.seen(4, hello(signedIn(b)), fixtureView)
    h.calls.length = 0
    h.hooks.ping = async () => ({ kind: "failed", failure: "timeout" })
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "no-tab", attempted: [1, 2, 3] })
    expect(h.calls).toEqual([
      { kind: "query", site: "www" },
      { kind: "get", tabId: 1 },
      { kind: "ping", tabId: 1, milliseconds: 2_000 },
      { kind: "get", tabId: 2 },
      { kind: "ping", tabId: 2, milliseconds: 2_000 },
      { kind: "get", tabId: 3 },
      { kind: "ping", tabId: 3, milliseconds: 2_000 }
    ])
  } finally {
    await h.dispose()
  }
})

test("only three candidates and one injection are allowed for a job", async () => {
  const h = tabsFixture()
  try {
    for (let id = 1; id <= 5; id++) h.seedTab(nativeTab(id), signedIn())
    h.hooks.ping = async () => ({ kind: "failed", failure: "transport" })
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "no-tab", attempted: [1, 5, 4] })
    expect(h.calls).toEqual([
      { kind: "query", site: "www" },
      { kind: "get", tabId: 1 },
      { kind: "ping", tabId: 1, milliseconds: 2_000 },
      { kind: "ensure", tabId: 1, site: "www", core: true },
      { kind: "get", tabId: 1 },
      { kind: "ping", tabId: 1, milliseconds: 2_000 },
      { kind: "get", tabId: 5 },
      { kind: "ping", tabId: 5, milliseconds: 2_000 },
      { kind: "get", tabId: 4 },
      { kind: "ping", tabId: 4, milliseconds: 2_000 }
    ])
  } finally {
    await h.dispose()
  }
})

test("a never-resolving injection ends at the same two-second candidate deadline", async () => {
  const h = tabsFixture(),
    injection = deferred<{ kind: "ready" }>()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.hooks.ping = async () => ({ kind: "failed", failure: "transport" })
    h.hooks.ensure = () => injection.promise
    let done = false
    const running = h.engine.serve(invocation, need).then(value => {
      done = true
      return value
    })
    await settle()
    h.clock.advance(1_999)
    await settle()
    expect(done).toBe(false)
    h.clock.advance(1)
    await settle()
    expect(done).toBe(true)
    expect(await running).toEqual({ kind: "no-tab", attempted: [1] })
    const calls = [...h.calls]
    injection.resolve({ kind: "ready" })
    await settle()
    expect(h.calls).toEqual(calls)
    expect(h.clock.pending).toBe(0)
  } finally {
    injection.resolve({ kind: "ready" })
    await h.dispose()
  }
})

test("injection time leaves only the remainder for a never-resolving ping", async () => {
  const h = tabsFixture(),
    injection = deferred<{ kind: "ready" }>(),
    ping = deferred<TabReply<TabPing>>()
  try {
    h.seedTab(nativeTab(1), signedIn())
    let pings = 0
    h.hooks.ping = async () => (++pings === 1 ? { kind: "failed", failure: "transport" } : ping.promise)
    h.hooks.ensure = () => injection.promise
    let done = false
    const running = h.engine.serve(invocation, need).then(value => {
      done = true
      return value
    })
    await settle()
    h.clock.advance(1_500)
    injection.resolve({ kind: "ready" })
    await settle()
    expect(h.calls.filter(call => call.kind === "ping")).toEqual([
      { kind: "ping", tabId: 1, milliseconds: 2_000 },
      { kind: "ping", tabId: 1, milliseconds: 500 }
    ])
    h.clock.advance(499)
    await settle()
    expect(done).toBe(false)
    h.clock.advance(1)
    expect(await running).toEqual({ kind: "no-tab", attempted: [1] })
    ping.resolve({ kind: "answered", result: signedIn() })
    await settle()
    expect(h.calls.filter(call => call.kind === "run")).toEqual([])
    expect(h.clock.pending).toBe(0)
  } finally {
    injection.resolve({ kind: "ready" })
    ping.resolve({ kind: "answered", result: signedIn() })
    await h.dispose()
  }
})

test("account changes after selection stop the original-tab action before dispatch", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.seedTab(nativeTab(2), signedIn())
    let pings = 0
    h.hooks.ping = async () => ({ kind: "answered", result: ++pings === 1 ? signedIn() : signedIn(b) })
    expect(await h.engine.runIn(1, invocation, need)).toEqual({ kind: "guard", reason: "accountChanged" })
    expect(h.calls.filter(call => call.kind === "run" || call.kind === "query")).toEqual([])
    expect(h.calls.filter(call => call.kind === "ping")).toEqual([
      { kind: "ping", tabId: 1, milliseconds: 2_000 },
      { kind: "ping", tabId: 1, milliseconds: 2_000 }
    ])
  } finally {
    await h.dispose()
  }
})

test("the gateway account guard outcome survives and selected jobs execute once", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.seedTab(nativeTab(2), signedIn())
    h.hooks.run = async () => ({ ok: false, reason: "accountChanged", status: "changed-after-ping" })
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "result", tabId: 1, result: { ok: false, reason: "accountChanged", status: "changed-after-ping" } })
    expect(h.calls.filter(call => call.kind === "run")).toEqual([{ kind: "run", tabId: 1, invocation, milliseconds: 10_000 }])
  } finally {
    await h.dispose()
  }
})

test("transport loss after a mutation never retries in another tab", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.seedTab(nativeTab(2), signedIn())
    let mutations = 0
    h.hooks.run = async () => {
      mutations++
      throw Error("Synthetic response lost after execution")
    }
    const mutation = { job: { kind: "create", title: "Synthetic", privacy: "PRIVATE" }, acct: a } as const
    expect(await h.engine.serve(mutation, need)).toEqual({ kind: "transport", tabId: 1, failure: "transport", delivery: "unknown" })
    expect(mutations).toBe(1)
    expect(h.calls.filter(call => call.kind === "run")).toEqual([{ kind: "run", tabId: 1, invocation: mutation, milliseconds: 10_000 }])
  } finally {
    await h.dispose()
  }
})

test("account-free jobs may use signed-out tabs but account-scoped jobs cannot borrow them", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedOut())
    const free = { job: { kind: "resolveChannel", input: "@synthetic" } } as const
    expect((await h.engine.serve(free, { ...need, account: anyAccount })).kind).toBe("result")
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "no-tab", attempted: [] })
    expect(await h.engine.runIn(1, invocation, need)).toEqual({ kind: "guard", reason: "signedOut" })
    expect(h.calls.filter(call => call.kind === "run")).toEqual([{ kind: "run", tabId: 1, invocation: free, milliseconds: 10_000 }])
  } finally {
    await h.dispose()
  }
})

test("private and wrong-site original tabs fail before ping", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1, { incognito: true, windowId: 2 }), signedIn())
    expect(await h.engine.runIn(1, invocation, need)).toEqual({ kind: "guard", reason: "privacy" })
    h.tabs.set(1, nativeTab(1, { site: "music" }))
    expect(await h.engine.runIn(1, invocation, need)).toEqual({ kind: "guard", reason: "site" })
    expect(h.calls.filter(call => call.kind === "ping" || call.kind === "ensure" || call.kind === "run")).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("a concrete producer must validate the view's account and privacy", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    const other = { ...fixtureView, produce: async () => ({ kind: "view" as const, view: { private: false, signedIn: true as const, acct: b, build, fixture: "account-scoped" as const } }) }
    expect(await h.engine.seen(1, hello(), other)).toEqual({ kind: "guard", reason: "view" })
    const unavailable = { ...fixtureView, produce: async () => ({ kind: "unavailable" as const }) }
    expect(await h.engine.seen(1, hello(), unavailable)).toEqual({ kind: "guard", reason: "view" })
  } finally {
    await h.dispose()
  }
})

test("bounded pushes verify the current account and send only that account's view", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn())
    await h.engine.seen(1, hello(), fixtureView)
    expect(await h.engine.push(normal, fixtureView)).toEqual({ sent: 1, failed: 0 })
    expect(h.calls.filter(call => call.kind === "view")).toEqual<unknown>([
      { kind: "view", tabId: 1, milliseconds: 2_000, view: { private: false, signedIn: true, acct: a, build, fixture: "account-scoped" } }
    ])
    const changed = {
      ...fixtureView,
      async produce(context: Parameters<typeof fixtureView.produce>[0]) {
        h.accounts.set(1, signedIn(b))
        return fixtureView.produce(context)
      }
    }
    expect(await h.engine.push(normal, changed)).toEqual({ sent: 0, failed: 1 })
    expect(h.calls.filter(call => call.kind === "view")).toHaveLength(1)
  } finally {
    await h.dispose()
  }
})

test("disposal releases pending work and late injection never sends a job", async () => {
  const h = tabsFixture(),
    injection = deferred<{ kind: "ready" }>()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.hooks.ping = async () => ({ kind: "failed", failure: "transport" })
    h.hooks.ensure = () => injection.promise
    const running = h.engine.serve(invocation, need)
    await settle()
    h.engine.dispose()
    expect(await running).toEqual({ kind: "guard", reason: "disposed" })
    expect(h.clock.pending).toBe(0)
    const before = [...h.calls]
    injection.resolve({ kind: "ready" })
    await settle()
    expect(h.calls).toEqual(before)
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "guard", reason: "disposed" })
  } finally {
    injection.resolve({ kind: "ready" })
    await h.dispose()
  }
})

test("held admission performs no session, native, registrar or account calls", async () => {
  const h = tabsFixture()
  try {
    h.setEnabled(false)
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "guard", reason: "held" })
    expect(await h.engine.accountInView(normal)).toEqual({ kind: "unavailable", reason: "held" })
    expect(h.removal.io).toEqual([])
    expect(h.calls).toEqual([])
  } finally {
    await h.dispose()
  }
})

test("discarded and frozen tabs are excluded even when they are the only native candidates", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1, { discarded: true }), signedIn())
    h.seedTab(nativeTab(2, { frozen: true }), signedIn())
    expect(await h.engine.serve(invocation, need)).toEqual({ kind: "no-tab", attempted: [] })
    expect(h.calls).toEqual([{ kind: "query", site: "www" }])
  } finally {
    await h.dispose()
  }
})

test("a never-resolving initial ping ends without injection or late execution", async () => {
  const h = tabsFixture(),
    ping = deferred<TabReply<TabPing>>()
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.hooks.ping = () => ping.promise
    const running = h.engine.serve(invocation, need)
    await settle()
    h.clock.advance(2_000)
    expect(await running).toEqual({ kind: "no-tab", attempted: [1] })
    expect(h.calls).toEqual([
      { kind: "query", site: "www" },
      { kind: "get", tabId: 1 },
      { kind: "ping", tabId: 1, milliseconds: 2_000 }
    ])
    ping.resolve({ kind: "answered", result: signedIn() })
    await settle()
    expect(h.calls.filter(call => call.kind === "ensure" || call.kind === "run")).toEqual([])
  } finally {
    ping.resolve({ kind: "answered", result: signedIn() })
    await h.dispose()
  }
})

test("a selected candidate's final account check uses the remainder of the same deadline", async () => {
  const h = tabsFixture(),
    ping = deferred<TabReply<TabPing>>()
  try {
    h.seedTab(nativeTab(1), signedIn())
    let pings = 0
    h.hooks.ping = async () => {
      if (++pings === 1) {
        h.clock.advance(1_500)
        return { kind: "answered", result: signedIn() }
      }
      return ping.promise
    }
    const running = h.engine.runIn(1, invocation, need)
    await settle()
    expect(h.calls.filter(call => call.kind === "ping")).toEqual([
      { kind: "ping", tabId: 1, milliseconds: 2_000 },
      { kind: "ping", tabId: 1, milliseconds: 500 }
    ])
    h.clock.advance(500)
    expect(await running).toEqual({ kind: "no-tab", attempted: [1] })
    ping.resolve({ kind: "answered", result: signedIn() })
    await settle()
    expect(h.calls.filter(call => call.kind === "run")).toEqual([])
  } finally {
    ping.resolve({ kind: "answered", result: signedIn() })
    await h.dispose()
  }
})

test("gone-tab cleanup retains a canonical storage failure", async () => {
  const h = tabsFixture(),
    error = Error("Synthetic eviction rejection")
  try {
    h.seedTab(nativeTab(1), signedIn())
    await h.engine.seen(1, hello(), fixtureView)
    const host = h.removal.deps.removal
    if (host.kind !== "fixture") throw Error("Missing fixture host")
    host.session.set = async () => {
      throw error
    }
    h.tabs.delete(1)
    expect(await h.engine.runIn(1, invocation, need)).toEqual({ kind: "session", result: { kind: "failed", applied: false, error } })
  } finally {
    await h.dispose()
  }
})

test("a private hello captured before account removal cannot recreate its memory row", async () => {
  const h = tabsFixture(),
    held = deferred<void>()
  try {
    h.seedTab(nativeTab(9, { incognito: true, windowId: 2 }), signedIn())
    await h.engine.seen(9, hello(), fixtureView)
    h.hooks.get = () => held.promise
    const seeing = h.engine.seen(9, hello(), fixtureView)
    await settle()
    const prepared = await h.owner.prepareAccountRemoval({ kind: "ui", windowId: 1, incognito: false }, a)
    if (prepared.kind !== "confirmation-required") throw Error("Missing removal confirmation")
    expect((await h.owner.removeAccountSetup({ kind: "ui", windowId: 1, incognito: false }, prepared.confirmation)).kind).toBe("committed")
    held.resolve()
    expect(await seeing).toEqual({ kind: "session", result: { kind: "unavailable", reason: "revision" } })
    expect(await h.engine.push(privateRequester, fixtureView)).toEqual({ sent: 0, failed: 0 })
    expect(h.stored()).toEqual({ unknown: { keep: true } })
    expect(h.sessionWrites()).toEqual([])
  } finally {
    held.resolve()
    await h.dispose()
  }
})

test("a real timer also bounds a never-resolving injection", async () => {
  const h = tabsFixture()
  const engine = createTabs({
    ...h.ports,
    clock: {
      now: () => performance.now(),
      wallNow: () => Date.now(),
      after(ms, expire) {
        const timer = setTimeout(expire, ms)
        return () => clearTimeout(timer)
      }
    }
  })
  try {
    h.seedTab(nativeTab(1), signedIn())
    h.hooks.ping = async () => ({ kind: "failed", failure: "transport" })
    h.hooks.ensure = () => new Promise(() => {})
    expect(await engine.serve(invocation, need)).toEqual({ kind: "no-tab", attempted: [1] })
    expect(h.calls.filter(call => call.kind === "run")).toEqual([])
  } finally {
    engine.dispose()
    await h.dispose()
  }
}, 4_000)

test("direct known targeting separates account privacy and own-tab identity", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn(a))
    h.seedTab(nativeTab(2), signedIn(b))
    h.seedTab(nativeTab(9, { incognito: true, windowId: 2 }), signedIn(a))
    await h.engine.seen(1, hello(signedIn(a)), fixtureView)
    await h.engine.seen(2, hello(signedIn(b)), fixtureView)
    await h.engine.seen(9, hello(signedIn(a)), fixtureView)
    expect((await h.engine.known({ kind: "account", acct: a, scope: "all" })).map(tab => tab.tabId)).toEqual([1, 9])
    expect((await h.engine.known({ kind: "account", acct: a, scope: "normal" })).map(tab => tab.tabId)).toEqual([1])
    expect((await h.engine.known({ kind: "account", acct: a, scope: "private" })).map(tab => tab.tabId)).toEqual([9])
    expect((await h.engine.known({ kind: "tab", tabId: 2 })).map(tab => tab.tabId)).toEqual([2])
    const [tab] = await h.engine.known({ kind: "tab", tabId: 9 })
    if (!tab) throw Error("Missing actual private core")
    expect(await h.engine.publish(tab, fixtureView, new AbortController().signal, () => true)).toEqual({ kind: "sent" })
    expect(h.calls.filter(call => call.kind === "view").map(call => call.tabId)).toEqual([9])
    expect(h.stored().tabs).not.toHaveProperty("9")
  } finally {
    await h.dispose()
  }
})

test("retained live targets outlast removed registry rows and publication performs no resurrection write", async () => {
  const h = tabsFixture()
  try {
    h.seedTab(nativeTab(1), signedIn(a))
    await h.engine.seen(1, hello(signedIn(a)), fixtureView)
    const prepared = await h.owner.prepareAccountRemoval({ kind: "ui", windowId: 1, incognito: false }, a)
    if (prepared.kind !== "confirmation-required") throw Error("Missing actual removal confirmation")
    expect((await h.owner.removeAccountSetup({ kind: "ui", windowId: 1, incognito: false }, prepared.confirmation)).kind).toBe("committed")
    const before = h.stored(),
      writes = h.sessionWrites()
    const [tab] = await h.engine.known({ kind: "account", acct: a, scope: "all" })
    if (!tab) throw Error("Account cleanup lost a live core")
    expect(await h.engine.publish(tab, fixtureView, new AbortController().signal, () => true)).toEqual({ kind: "sent" })
    expect(h.stored()).toEqual(before)
    expect(h.sessionWrites()).toEqual(writes)
    expect(h.stored().tabs).toEqual({})
  } finally {
    await h.dispose()
  }
})

test("a known handle belongs to one Tabs lifetime and cancellation stops late native work", async () => {
  const h = tabsFixture(),
    entered = deferred<void>(),
    release = deferred<void>()
  try {
    h.seedTab(nativeTab(1), signedIn(a))
    await h.engine.seen(1, hello(signedIn(a)), fixtureView)
    const [tab] = await h.engine.known({ kind: "tab", tabId: 1 })
    if (!tab) throw Error("Missing actual known target")
    const restarted = h.restart()
    expect(await restarted.publish(tab, fixtureView, new AbortController().signal, () => true)).toEqual({ kind: "skipped" })
    const cancellation = new AbortController()
    h.hooks.get = async () => {
      entered.resolve()
      await release.promise
    }
    const pushing = h.engine.publish(tab, fixtureView, cancellation.signal, () => true)
    await entered.promise
    cancellation.abort()
    expect(await pushing).toEqual({ kind: "skipped" })
    expect(h.clock.pending).toBe(0)
    release.resolve()
    await settle()
    expect(h.calls.filter(call => call.kind === "view")).toEqual([])
    h.engine.dispose()
    expect(await h.engine.publish(tab, fixtureView, new AbortController().signal, () => true)).toEqual({ kind: "skipped" })
  } finally {
    release.resolve()
    await h.dispose()
  }
})
