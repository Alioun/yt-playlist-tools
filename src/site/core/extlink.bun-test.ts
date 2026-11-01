import { expect, test } from "bun:test"
import { CONTRACT_VERSION } from "../../shared/contracts/protocol"
import { isJobInvocation, type AccountData, type JobInvocation, type JobOf } from "../../shared/contracts/jobs"
import { isPlaylistId, isVideoId } from "../../shared/model/validation"
import { tabJobMessages, tabJobReceiverMessages } from "../../shared/contracts/tabs"
import { build, checked, extlinkHarness, fixtureView, isFixtureView, otherAccount, settle, type FixtureView } from "../../../tools/fixtures/extlink/harness"
import { deferred, expectedKey, nextBuild, rawIdentity, route, snapshot } from "../../../tools/fixtures/page-link/support"
import { inspect } from "../../../tests/guards/checker"

test("one page hello waits for trusted PageLink and ignores navigation and visibility changes", async () => {
  const digest = deferred<ArrayBuffer>()
  const h = extlinkHarness({ page: { link: { digest: () => digest.promise } } })
  try {
    await settle()
    expect(h.hellos).toEqual([])
    digest.resolve(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIdentity)))
    await h.page.link.hello
    await settle()
    const acct = expectedKey(rawIdentity)
    expect(h.hellos).toEqual([{ signedIn: true, acct, site: "www", build, hidden: true, fresh: false }])
    const stop = h.page.link.watch("nav", () => {})
    h.page.watchers[0]?.emit({ pageType: "WATCH", video: null, navigation: { kind: "other" } })
    h.page.watchers[0]?.emit({ pageType: "WATCH", video: null, navigation: { kind: "other" } })
    document.dispatchEvent(new Event("visibilitychange"))
    for (const type of ["pointerover", "focusin", "timeupdate", "keydown"]) document.dispatchEvent(new Event(type))
    await settle()
    expect(h.hellos).toHaveLength(1)
    expect(h.network.trace().filter(event => event.event === "sent")).toHaveLength(1)
    stop()
  } finally { h.dispose() }
})

test("hidden uses both captured reads and fresh uses only the captured navigation type", async () => {
  for (const startedHidden of [false, true]) for (const hiddenAtStart of [false, true]) {
    for (const navType of ["navigate", "reload", "back_forward", "prerender", null] as const) {
      const h = extlinkHarness({ hiddenAtStart, page: { pageSnapshot: () => ({ ...snapshot(null), startedHidden, navType }) } })
      try {
        await h.page.link.hello
        await settle()
        expect(h.hellos).toEqual([{ signedIn: false, acct: null, site: "www", build,
          hidden: startedHidden && hiddenAtStart, fresh: navType === "navigate" }])
      } finally { h.dispose() }
    }
  }
})

test("signed-in and signed-out pings contain only the trusted PageLink account, site and build", async () => {
  for (const identity of [rawIdentity, null]) {
    const h = extlinkHarness({ page: { pageSnapshot: () => snapshot(identity) } })
    try {
      await h.page.link.hello
      await settle()
      const account: AccountData = identity === null ? { signedIn: false, acct: null } : { signedIn: true, acct: expectedKey(identity) }
      expect(await h.ping()).toEqual({ kind: "answered", result: { ...account, site: "www", build } })
      expect(h.ext.view).toEqual(fixtureView(account))
    } finally { h.dispose() }
  }
})

test("complete-view validation rejects scope-only, nested-invalid and throwing payloads", async () => {
  const h = extlinkHarness()
  try {
    await h.page.link.hello
    await settle()
    const original = h.ext.view
    expect(original).not.toBeNull()
    const scope = { signedIn: true, acct: expectedKey(rawIdentity), private: false, build }
    for (const value of [scope, { ...scope, fixture: { owner: otherAccount, revision: 1 } },
      { ...scope, fixture: { owner: scope.acct, revision: -1 } }, { ...scope, fixture: { owner: scope.acct, revision: 1, extra: true } }]) {
      expect(isFixtureView(value)).toBe(false)
      await expect(h.raw("bg.view", value)).rejects.toThrow("Memory send failed")
      expect(h.ext.view).toEqual(original)
    }
  } finally { h.dispose() }
  const throwing = extlinkHarness({ isView: (_value): _value is FixtureView => { throw Error("Synthetic validator failure") } })
  try {
    await throwing.page.link.hello
    await settle()
    await expect(throwing.raw("bg.view", fixtureView({ signedIn: false, acct: null }))).rejects.toThrow("Memory send failed")
    expect(throwing.ext.view).toBeNull()
  } finally { throwing.dispose() }
})

test("views must match build and both account discriminants before publication", async () => {
  const h = extlinkHarness()
  try {
    await h.page.link.hello
    await settle()
    const original = h.ext.view
    const account = { signedIn: true, acct: expectedKey(rawIdentity) } as const
    const seen: (FixtureView | null)[] = []
    const stop = h.ext.onView(view => { seen.push(view) })
    for (const view of [fixtureView({ signedIn: true, acct: otherAccount }, 1), fixtureView({ signedIn: false, acct: null }, 2),
      { ...fixtureView(account, 3), build: nextBuild }]) {
      expect(await h.view(view)).toEqual({ kind: "answered", result: null })
      expect(h.ext.view).toEqual(original)
    }
    expect(seen).toEqual([original])
    stop()
  } finally { h.dispose() }
})

test("a valid pushed view wins over an older pending hello answer", async () => {
  const answer = deferred<FixtureView | null>()
  const h = extlinkHarness({ hello: () => answer.promise })
  try {
    await h.page.link.hello
    await settle()
    const account = { signedIn: true, acct: expectedKey(rawIdentity) } as const
    const pushed = fixtureView(account, 2)
    expect(await h.view(pushed)).toEqual({ kind: "answered", result: null })
    answer.resolve(fixtureView(account, 1))
    await settle()
    expect(h.ext.view).toEqual(pushed)
    expect(h.hellos).toHaveLength(1)
  } finally { h.dispose() }
})

test("a hello timeout and disposal never retry or publish a later answer", async () => {
  for (const mode of ["timeout", "dispose"] as const) {
    const answer = deferred<FixtureView | null>()
    const h = extlinkHarness({ hello: () => answer.promise })
    try {
      await h.page.link.hello
      await settle()
      if (mode === "timeout") h.page.clock.advance(2_000)
      else h.ext.dispose()
      await settle()
      answer.resolve(fixtureView({ signedIn: true, acct: expectedKey(rawIdentity) }, 4))
      await settle()
      h.page.clock.advance(60_000)
      expect(h.ext.view).toBeNull()
      expect(h.hellos).toHaveLength(1)
      expect(h.page.clock.count).toBe(0)
    } finally { h.dispose() }
  }
})

test("native authentication rejects foreign and missing sender IDs and body-supplied authority", async () => {
  const h = extlinkHarness()
  try {
    await h.page.link.hello
    await settle()
    for (const sender of [{ id: "foreign" }, {}]) {
      expect(await h.raw("bg.ping", {}, sender)).toBeUndefined()
      expect(await h.raw("bg.job", { job: { kind: "openCardMenu" } }, sender)).toBeUndefined()
      expect(await h.raw("bg.view", fixtureView({ signedIn: true, acct: expectedKey(rawIdentity) }, 9), sender)).toBeUndefined()
    }
    await expect(h.raw("bg.ping", { sender: { id: "synthetic-extlink-extension" }, origin: { kind: "background" } }, { id: "foreign" })).rejects.toThrow("Memory send failed")
    expect(h.page.calls).toEqual([])
    expect(h.ext.view?.fixture.revision).toBe(0)
    expect((await h.ping()).kind).toBe("answered")
  } finally { h.dispose() }
})

test("jobs keep their account pin and exact result while a mismatched pin never reaches the page", async () => {
  const h = extlinkHarness({ page: { run: async job => job.kind === "playlists"
    ? { ok: true, data: [], route } : { ok: true, data: null, route } } })
  try {
    await h.page.link.hello
    await settle()
    const acct = expectedKey(rawIdentity)
    expect(await h.run({ job: { kind: "playlists" }, acct })).toEqual({ kind: "answered", result: { ok: true, data: [], route } })
    expect(await h.run({ job: { kind: "openCardMenu" } })).toEqual({ kind: "answered", result: { ok: true, data: null, route } })
    expect(await h.run({ job: { kind: "playlists" }, acct: otherAccount })).toEqual({ kind: "answered", result: { ok: false, reason: "accountChanged" } })
    await expect(h.raw("bg.job", { job: { kind: "playlists" } })).rejects.toThrow("Memory send failed")
    expect(h.page.calls.map(call => call.job)).toEqual([{ kind: "playlists" }, { kind: "openCardMenu" }])
  } finally { h.dispose() }
})

test("caller guards retain per-invocation batch correlation and the receiver guard never accepts a result", () => {
  const acct = expectedKey(rawIdentity)
  const one: JobInvocation<JobOf<"addBatch">> = { job: { kind: "addBatch", playlistId: checked(isPlaylistId, "PLfixture"), videoIds: [checked(isVideoId, "abcdefghijk")] }, acct }
  const two: JobInvocation<JobOf<"addBatch">> = { job: { ...one.job, videoIds: [...one.job.videoIds, checked(isVideoId, "lmnopqrstuv")] }, acct }
  const result = { ok: true, route, data: { results: [{ videoId: "abcdefghijk", setVideoId: null }] } }
  expect(tabJobMessages(one, 10_000)["bg.job"].result(result)).toBe(true)
  expect(tabJobMessages(two, 10_000)["bg.job"].result(result)).toBe(false)
  expect(tabJobMessages(one, 10_000)["bg.job"].result({ ok: true, route, data: [] })).toBe(false)
  const receiving = tabJobReceiverMessages()["bg.job"]
  expect(receiving.payload(one)).toBe(true)
  for (const value of [result, { ok: false, reason: "unavailable" }, null]) expect(receiving.result(value)).toBe(false)
  expect(isJobInvocation({ job: one.job })).toBe(false)
})

test("concurrent background jobs keep separate page invocations when answers complete in reverse order", async () => {
  const playlists = deferred<unknown>(), menu = deferred<unknown>()
  const h = extlinkHarness({ page: { run: job => job.kind === "playlists" ? playlists.promise : menu.promise } })
  try {
    await h.page.link.hello
    await settle()
    const first = h.run({ job: { kind: "playlists" }, acct: expectedKey(rawIdentity) })
    const second = h.run({ job: { kind: "openCardMenu" } })
    await settle()
    expect(h.page.calls.map(call => call.job)).toEqual([{ kind: "playlists" }, { kind: "openCardMenu" }])
    menu.resolve({ ok: true, data: null, route })
    expect(await second).toEqual({ kind: "answered", result: { ok: true, data: null, route } })
    playlists.resolve({ ok: true, data: [], route })
    expect(await first).toEqual({ kind: "answered", result: { ok: true, data: [], route } })
  } finally { h.dispose() }
})

test("batch answers cross ExtLink only for the exact requested video sequence", async () => {
  const videoId = checked(isVideoId, "abcdefghijk")
  const h = extlinkHarness({ page: { run: async () => ({ ok: true, route, data: { results: [{ videoId, setVideoId: null }] } }) } })
  try {
    await h.page.link.hello
    await settle()
    const invocation: JobInvocation<JobOf<"addBatch">> = { job: { kind: "addBatch", playlistId: checked(isPlaylistId, "PLfixture"), videoIds: [videoId] }, acct: expectedKey(rawIdentity) }
    expect(await h.run(invocation)).toEqual({ kind: "answered", result: { ok: true, route, data: { results: [{ videoId, setVideoId: null }] } } })
    const tooMany: JobInvocation<JobOf<"addBatch">> = { job: { ...invocation.job, videoIds: [videoId, checked(isVideoId, "lmnopqrstuv")] }, acct: invocation.acct }
    const pending = h.run(tooMany)
    await settle()
    h.page.clock.advance(10_000)
    expect(await pending).toEqual({ kind: "answered", result: { ok: false, reason: "unconfirmed" } })
    expect(h.page.calls).toHaveLength(2)
  } finally { h.dispose() }
})

test("PageLink account change disarms the view and a late hello cannot restore it", async () => {
  const answer = deferred<FixtureView | null>()
  const h = extlinkHarness({ hello: () => answer.promise, page: { run: async () => ({ ok: false, reason: "accountChanged" }) } })
  try {
    await h.page.link.hello
    await settle()
    const view = fixtureView({ signedIn: true, acct: expectedKey(rawIdentity) }, 1)
    await h.view(view)
    expect(await h.run({ job: { kind: "account" } })).toEqual({ kind: "answered", result: { ok: false, reason: "accountChanged" } })
    expect(h.ext.state).toEqual({ kind: "disarmed", reason: "accountChanged" })
    expect(h.ext.view).toBeNull()
    answer.resolve(view)
    await settle()
    await h.view(view)
    expect(h.ext.view).toBeNull()
    expect(await h.ping()).toEqual({ kind: "failed", failure: "receiver-failed" })
  } finally { h.dispose() }
})

test("a real PageLink account digest transition clears the published view", async () => {
  const h = extlinkHarness({ page: { run: async () => ({ ok: true, route, data: { signedIn: true, datasyncId: "different-synthetic-account" } }) } })
  try {
    await h.page.link.hello
    await settle()
    expect(h.ext.view?.acct).toBe(expectedKey(rawIdentity))
    expect(await h.run({ job: { kind: "account" } })).toEqual({ kind: "answered", result: { ok: false, reason: "accountChanged" } })
    expect(h.page.link.state).toEqual({ kind: "accountChanged" })
    expect(h.ext.state).toEqual({ kind: "disarmed", reason: "accountChanged" })
    expect(h.ext.view).toBeNull()
    expect(h.page.calls).toHaveLength(1)
  } finally { h.dispose() }
})

test("a timed-out page mutation remains unconfirmed and is never retried", async () => {
  const answer = deferred<unknown>()
  const h = extlinkHarness({ page: { run: () => answer.promise } })
  try {
    await h.page.link.hello
    await settle()
    const invocation = { job: { kind: "add", playlistId: checked(isPlaylistId, "PLfixture"), videoId: checked(isVideoId, "abcdefghijk") }, acct: expectedKey(rawIdentity) } as const
    const pending = h.run(invocation)
    await settle()
    expect(h.page.calls).toHaveLength(1)
    h.page.clock.advance(10_000)
    expect(await pending).toEqual({ kind: "answered", result: { ok: false, reason: "unconfirmed" } })
    answer.resolve({ ok: true, data: { setVideoId: null }, route })
    await settle()
    h.page.clock.advance(60_000)
    expect(h.page.calls).toHaveLength(1)
    expect(h.page.clock.count).toBe(0)
  } finally { h.dispose() }
})

test("disposal finishes pending work, releases listeners and timers, and suppresses late publication", async () => {
  const answer = deferred<unknown>()
  const h = extlinkHarness({ page: { run: () => answer.promise } })
  await h.page.link.hello
  await settle()
  const views: (FixtureView | null)[] = []
  h.ext.onView(view => { views.push(view) })
  const pending = h.run({ job: { kind: "openCardMenu" } })
  await settle()
  h.ext.dispose()
  h.ext.dispose()
  expect(await pending).toEqual({ kind: "failed", failure: "invalid-answer" })
  answer.resolve({ ok: true, data: null, route })
  await settle()
  expect(views).toHaveLength(2)
  expect(views.at(-1)).toBeNull()
  expect(h.page.link.state).toEqual({ kind: "disposed" })
  expect(h.page.clock.count).toBe(0)
  expect(h.network.listening()).toBe(1)
  h.dispose()
  expect(h.network.listening()).toBe(0)
  expect(h.page.tracked.listenerCount).toBe(0)
})

test("missing, changed and throwing runtime identity orphan the link on actual work", async () => {
  for (const mode of ["missing", "changed", "throwing"] as const) {
    const h = extlinkHarness()
    try {
      await h.page.link.hello
      await settle()
      if (mode === "throwing") h.throwIdentity()
      else h.setIdentity(mode === "missing" ? undefined : "replacement-extension")
      expect(h.ext.view).toBeNull()
      expect(h.ext.state).toEqual({ kind: "disposed", reason: "orphaned" })
      expect(h.page.link.state).toEqual({ kind: "disposed" })
      expect(h.network.listening()).toBe(1)
      expect(h.page.clock.count).toBe(0)
    } finally { h.dispose() }
  }
})

test("PageLink retirement disposes ExtLink without another retirement announcement", async () => {
  const h = extlinkHarness()
  try {
    await h.page.link.hello
    await settle()
    expect(h.page.tracked.frames.filter(frame => frame.wire === "retire")).toHaveLength(1)
    h.page.tracked.channel.send("retire", JSON.stringify({ v: CONTRACT_VERSION, build: nextBuild, kind: "retire" }))
    expect(h.ext.state).toEqual({ kind: "disposed", reason: "page" })
    expect(h.ext.view).toBeNull()
    expect(h.page.tracked.frames.filter(frame => frame.wire === "retire")).toHaveLength(2)
    expect(h.page.clock.count).toBe(0)
    expect(h.network.listening()).toBe(1)
  } finally { h.dispose() }
})

test("view callbacks can dispose reentrantly and independent instances keep separate lifetimes", async () => {
  const one = extlinkHarness(), two = extlinkHarness({ page: { pageSnapshot: () => snapshot(null) } })
  try {
    await Promise.all([one.page.link.hello, two.page.link.hello])
    await settle()
    const views: (FixtureView | null)[] = []
    one.ext.onView(view => { views.push(view); if (view?.fixture.revision === 1) one.ext.dispose() })
    await one.view(fixtureView({ signedIn: true, acct: expectedKey(rawIdentity) }, 1))
    expect(one.ext.state).toEqual({ kind: "disposed", reason: "owner" })
    expect(views.map(view => view?.fixture.revision ?? null)).toEqual([0, 1, null])
    expect(two.ext.state).toEqual({ kind: "ready" })
    expect(await two.ping()).toEqual({ kind: "answered", result: { signedIn: false, acct: null, site: "www", build } })
  } finally { one.dispose(); two.dispose() }
})

test("the existing architecture guard rejects site imports of the background runtime adapter", () => {
  expect(inspect([{ file: "src/site/core/extlink-misuse.ts", text: 'import { runtimeTransport } from "../../background/adapters/runtime"' }])
    .filter(finding => finding.rule === "imports").map(finding => finding.line)).toEqual([1])
})
