import { afterEach, expect, test } from "bun:test"
import { webcrypto } from "node:crypto"
import { CONTRACT_VERSION, isPageType, parseJsonText } from "../../shared/contracts"
import type { JsonObject } from "../../shared/contracts"
import { createDirectPageChannel, createDomPageChannel, pageEventTypes } from "../../shared/rpc/page-channel"
import { createPageLink } from "./page-link"
import {
  build, checked, deferred, dependency, expectedKey, flush, harness, header, invocation, ManualClock,
  nav, nextBuild, rawIdentity, route, snapshot, syntheticSignal, trackedChannel, vocabulary
} from "../../../tools/fixtures/page-link/support"

const owned: (() => void)[] = []
afterEach(() => { for (const dispose of owned.splice(0)) dispose() })
function setup(options: Parameters<typeof harness>[0] = {}) {
  const h = harness(options)
  owned.push(h.dispose)
  return h
}
function object(value: unknown): JsonObject {
  const parsed = parseJsonText(JSON.stringify(value))
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object" || Array.isArray(parsed.value)) throw new Error("Expected synthetic object")
  return parsed.value
}
const safeKey = expectedKey(rawIdentity)
const pinned = () => invocation({ job: { kind: "playlists" }, acct: safeKey })
const openMenu = () => invocation({ job: { kind: "openCardMenu" } })
const emit = (h: ReturnType<typeof harness>, value: unknown) => h.tracked.channel.send("res", JSON.stringify(value))

for (const dom of [false, true]) {
  test(`${dom ? "DOM" : "direct"} serves hello, account, job target, probe, stream, signal and teardown`, async () => {
    const h = setup({ dom })
    const hello = await h.link.hello
    expect(hello).toEqual({ ok: true, snapshot: { signedIn: true, acct: safeKey, pageType: checked(isPageType, "WATCH"), startedHidden: true, navType: "reload" } })
    const account = await h.link.run({ job: { kind: "account" } })
    expect(account).toEqual({ ok: true, data: { signedIn: true, acct: safeKey }, route })
    const target = document.createElement("article")
    document.body.append(target)
    try {
      expect(await h.link.run(openMenu(), { target })).toEqual({ ok: true, data: null, route })
      expect(h.calls.at(-1)?.context?.target).toBe(target)
    } finally { target.remove() }
    expect(await h.link.probe()).toEqual({ ok: true, report: { site: "www", entries: [{ id: dependency, present: true }] } })
    const data: unknown[] = []
    const stop = h.link.watch("nav", value => data.push(value))
    h.watchers[0]?.emit(nav)
    expect(data).toEqual([nav])
    stop(); stop()
    h.watchers[0]?.emit(nav)
    expect(data).toEqual([nav])
    expect(h.messages("unwatch")).toHaveLength(1)
    expect(h.watchers[0]?.stops).toBe(1)
    const signals: unknown[] = []
    const unsubscribe = h.link.onSignal(signal => signals.push(signal))
    for (const sink of h.signals) sink(syntheticSignal)
    expect(signals).toEqual([syntheticSignal])
    unsubscribe()
    const safeOutput = JSON.stringify([hello, account, h.link.state, signals])
    expect(safeOutput.includes(rawIdentity)).toBe(false)
    expect(safeOutput.includes("datasyncId")).toBe(false)
    h.dispose()
    expect(h.clock.count).toBe(0)
    expect(h.tracked.listenerCount).toBe(0)
    expect(h.signalStops).toBe(1)
  })
}

test.each(["whole||identity", "whole||identity/another", "雪/Ω||brand", "   "])("hashes the whole synthetic identity %s with SHA-256", async identity => {
  const h = setup({ pageSnapshot: () => snapshot(identity) })
  expect(await h.link.hello).toEqual({ ok: true, snapshot: { signedIn: true, acct: expectedKey(identity), pageType: checked(isPageType, "WATCH"), startedHidden: true, navType: "reload" } })
})

test("signed-out visitor identity is rejected and signed-out account-free jobs work", async () => {
  let digests = 0
  const h = setup({ pageSnapshot: () => snapshot(null), link: { digest: bytes => { digests++; return webcrypto.subtle.digest("SHA-256", bytes) } } })
  expect(await h.link.hello).toMatchObject({ ok: true, snapshot: { signedIn: false, acct: null } })
  expect(await h.link.run(openMenu())).toEqual({ ok: true, data: null, route })
  expect(await h.link.run(pinned())).toEqual({ ok: false, reason: "unavailable" })
  expect(digests).toBe(0)
  expect(h.calls).toHaveLength(1)
})

test("stale pins, omitted pins and unsupported jobs cause zero dispatch", async () => {
  const h = setup()
  await h.link.hello
  expect(await h.link.run(invocation({ job: { kind: "playlists" }, acct: "AAAAAAAAAAAAAAAA" }))).toEqual({ ok: false, reason: "accountChanged" })
  // @ts-expect-error Account-dependent jobs require a trusted pin, also checked at runtime.
  expect(await h.link.run({ job: { kind: "playlists" } })).toEqual({ ok: false, reason: "unavailable" })
  expect(await h.link.run({ job: { kind: "castState" } })).toEqual({ ok: false, reason: "unavailable" })
  expect(h.messages("run")).toHaveLength(0)
  expect(h.calls).toHaveLength(0)
})

test("a valid pin stays outside the page request", async () => {
  const h = setup({ run: async () => ({ ok: true, data: [], route }) })
  await h.link.hello
  const result = h.link.run(pinned())
  const request = h.messages("run")[0]
  expect(object(request).job).toEqual({ kind: "playlists" })
  expect(Object.keys(object(request)).sort()).toEqual(["build", "id", "job", "kind", "v"])
  expect(JSON.stringify(h.calls).includes(safeKey)).toBe(false)
  expect(await result).toEqual({ ok: true, data: [], route })
})

test("receiving state precedes an actual synchronous direct run answer", async () => {
  const channel = createDirectPageChannel()
  let answered = false
  const stop = channel.listen("req", detail => {
    const parsed = parseJsonText(detail)
    if (!parsed.ok) return
    const req = object(parsed.value)
    if (req.kind === "hello") channel.send("res", JSON.stringify({ ...header, kind: "hello", site: "www", snapshot: snapshot(null) }))
    if (req.kind === "run") {
      channel.send("res", JSON.stringify({ ...header, kind: "run", id: req.id, result: { ok: true, data: null, route } }))
      answered = true
    }
  })
  const clock = new ManualClock()
  const link = createPageLink({ build, site: "www", vocabulary, clock }, channel)
  owned.push(() => { link.dispose(); stop() })
  await link.hello
  const result = link.run(openMenu())
  expect(answered).toBe(true)
  expect(await result).toEqual({ ok: true, data: null, route })
  expect(clock.count).toBe(0)
})

test("overlapping requests receive out-of-order correlated results once", async () => {
  const first = deferred<unknown>(), second = deferred<unknown>()
  let count = 0
  const h = setup({ run: () => ++count === 1 ? first.promise : second.promise })
  await h.link.hello
  const one = h.link.run(openMenu()), two = h.link.run({ job: { kind: "queueAdd" } })
  expect(h.messages("run")).toHaveLength(2)
  expect(object(h.messages("run")[0]).id).not.toBe(object(h.messages("run")[1]).id)
  second.resolve({ ok: true, data: { confirmed: false, quiet: true }, route })
  expect(await two).toEqual({ ok: true, data: { confirmed: false, quiet: true }, route })
  first.resolve({ ok: true, data: null, route })
  expect(await one).toEqual({ ok: true, data: null, route })
  expect(h.clock.count).toBe(0)
})

test("malformed and unrelated run answers cannot complete a caller", async () => {
  const never = deferred<unknown>()
  const h = setup({ run: () => never.promise })
  await h.link.hello
  const result = h.link.run(openMenu())
  let completed = false
  void result.then(() => { completed = true })
  const req = object(h.messages("run")[0])
  const valid = { ...header, kind: "run", id: req.id, result: { ok: true, data: null, route } }
  for (const answer of [
    { ...valid, v: CONTRACT_VERSION + 1 }, { ...valid, build: nextBuild }, { ...valid, id: "unrelated" },
    { ...valid, kind: "probe" }, { ...valid, result: { ok: true, data: { casting: false }, route } },
    { ...valid, result: { ok: true, data: null, route: "" } }, { ...valid, extra: true }
  ]) emit(h, answer)
  h.tracked.channel.send("res", "{")
  h.tracked.channel.send("res", "null")
  document.dispatchEvent(new CustomEvent(pageEventTypes.res, { detail: valid }))
  await flush()
  expect(completed).toBe(false)
  emit(h, valid)
  expect(await result).toEqual({ ok: true, data: null, route })
})

test("invalid hello data, wrong site and non-string DOM detail leave identity unavailable", async () => {
  const channel = trackedChannel(createDirectPageChannel())
  const clock = new ManualClock()
  const link = createPageLink({ build, site: "www", vocabulary, clock }, channel.channel)
  owned.push(link.dispose)
  for (const answer of [
    { ...header, kind: "hello", site: "music", snapshot: snapshot() },
    { ...header, kind: "hello", site: "www", snapshot: { ...snapshot(), datasyncId: "" } },
    { ...header, kind: "hello", site: "www", snapshot: { ...snapshot(null), datasyncId: "Vvisitor||" } },
    { ...header, v: 2, kind: "hello", site: "www", snapshot: snapshot() }
  ]) channel.channel.send("res", JSON.stringify(answer))
  clock.advance(2_000)
  expect(await link.hello).toEqual({ ok: false, reason: "unavailable" })
  expect(await link.run(pinned())).toEqual({ ok: false, reason: "unavailable" })
  expect(link.state).toEqual({ kind: "unavailable" })
  expect(clock.count).toBe(0)
})

test("DOM non-string detail does not publish a hello", async () => {
  const clock = new ManualClock()
  const link = createPageLink({ build, site: "www", vocabulary, clock }, createDomPageChannel(document))
  owned.push(link.dispose)
  document.dispatchEvent(new CustomEvent(pageEventTypes.res, { detail: { ...header, kind: "hello", site: "www", snapshot: snapshot() } }))
  clock.advance(2_000)
  expect(await link.hello).toEqual({ ok: false, reason: "unavailable" })
})

test("duplicate and late hello answers cannot regress identity", async () => {
  const digest = deferred<ArrayBuffer>()
  const h = setup({ link: { digest: () => digest.promise } })
  emit(h, { ...header, kind: "hello", site: "www", snapshot: snapshot("different||identity") })
  digest.resolve(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIdentity)))
  expect(await h.link.hello).toMatchObject({ ok: true, snapshot: { acct: safeKey } })
  emit(h, { ...header, kind: "hello", site: "www", snapshot: snapshot(null) })
  expect(h.link.state).toMatchObject({ kind: "ready", snapshot: { acct: safeKey } })
})

test.each(["reject", "dispose", "deadline"])("hello digest %s cannot publish an identity later", async action => {
  const digest = deferred<ArrayBuffer>()
  const h = setup({ link: { digest: () => digest.promise } })
  const states: unknown[] = []
  h.link.onState(state => states.push(state))
  if (action === "reject") digest.reject(new Error("Synthetic digest rejection"))
  if (action === "dispose") h.link.dispose()
  if (action === "deadline") h.clock.advance(2_000)
  expect(await h.link.hello).toEqual({ ok: false, reason: "unavailable" })
  const before = JSON.stringify(states)
  if (action !== "reject") digest.resolve(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIdentity)))
  await flush()
  expect(JSON.stringify(states)).toBe(before)
  expect(h.link.state.kind).toBe(action === "dispose" ? "disposed" : "unavailable")
  expect(h.clock.count).toBe(0)
})

test("account job results are freshly projected and page failures disarm the owner", async () => {
  let changed = false
  const h = setup({ run: async () => changed ? { ok: false, reason: "accountChanged", status: rawIdentity } : { ok: true, data: { signedIn: true, datasyncId: rawIdentity }, route } })
  await h.link.hello
  expect(await h.link.run({ job: { kind: "account" } })).toEqual({ ok: true, data: { signedIn: true, acct: safeKey }, route })
  const states: unknown[] = []
  h.link.onState(state => states.push(state))
  changed = true
  expect(await h.link.run(pinned())).toEqual({ ok: false, reason: "accountChanged" })
  expect(h.link.state).toEqual({ kind: "accountChanged" })
  expect(states).toContainEqual({ kind: "accountChanged" })
  expect(JSON.stringify(states).includes(rawIdentity)).toBe(false)
  expect(await h.link.run(pinned())).toEqual({ ok: false, reason: "accountChanged" })
  expect(h.calls).toHaveLength(2)
})

test("a changed account projection disarms account-dependent features", async () => {
  const h = setup({ run: async () => ({ ok: true, data: { signedIn: true, datasyncId: "different||account" }, route }) })
  await h.link.hello
  expect(await h.link.run({ job: { kind: "account" } })).toEqual({ ok: false, reason: "accountChanged" })
  expect(h.link.state).toEqual({ kind: "accountChanged" })
  expect(await h.link.run(pinned())).toEqual({ ok: false, reason: "accountChanged" })
  expect(h.calls).toHaveLength(1)
})

test.each(["dispose", "deadline", "reject"])("account digest %s finishes its caller and suppresses later publication", async action => {
  const digest = deferred<ArrayBuffer>()
  let calls = 0
  const h = setup({ link: { digest: bytes => ++calls === 1 ? webcrypto.subtle.digest("SHA-256", bytes) : digest.promise } })
  await h.link.hello
  const result = h.link.run({ job: { kind: "account" } })
  await flush()
  if (action === "dispose") h.link.dispose()
  if (action === "deadline") h.clock.advance(10_000)
  if (action === "reject") digest.reject(new Error("Synthetic digest rejection"))
  expect(await result).toEqual({ ok: false, reason: action === "reject" ? "unavailable" : "unconfirmed" })
  const state = h.link.state
  if (action !== "reject") digest.resolve(await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIdentity)))
  await flush()
  expect(h.link.state).toEqual(state)
  expect(h.clock.count).toBe(0)
})

test("a newer accepted account answer prevents an older digest from settling successfully", async () => {
  const older = deferred<ArrayBuffer>(), newer = deferred<ArrayBuffer>()
  let calls = 0
  const h = setup({ link: { digest: bytes => ++calls === 1 ? webcrypto.subtle.digest("SHA-256", bytes) : calls === 2 ? older.promise : newer.promise } })
  await h.link.hello
  const first = h.link.run({ job: { kind: "account" } })
  const second = h.link.run({ job: { kind: "account" } })
  await flush()
  const hash = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(rawIdentity))
  newer.resolve(hash)
  expect(await second).toEqual({ ok: true, data: { signedIn: true, acct: safeKey }, route })
  older.resolve(hash)
  expect(await first).toEqual({ ok: false, reason: "unavailable" })
})

test("timeouts bound writes and never retry a remote action", async () => {
  const late = deferred<unknown>()
  const h = setup({ run: () => late.promise })
  await h.link.hello
  const result = h.link.run(invocation({ job: { kind: "create", title: "synthetic", privacy: "PRIVATE" }, acct: safeKey }))
  h.clock.advance(9_999)
  expect(h.calls).toHaveLength(1)
  h.clock.advance(1)
  expect(await result).toEqual({ ok: false, reason: "unconfirmed" })
  late.resolve({ ok: true, data: { playlistId: "PLsynthetic" }, route })
  await flush()
  h.clock.advance(50_000)
  expect(h.calls).toHaveLength(1)
  expect(h.messages("run")).toHaveLength(1)
  expect(h.clock.count).toBe(0)
})

test("pending jobs and probes finish on dispose and release their deadlines", async () => {
  const h = setup({ run: () => deferred<unknown>().promise, probe: () => deferred<unknown>().promise })
  await h.link.hello
  const job = h.link.run(openMenu()), probe = h.link.probe()
  const stop = h.link.watch("nav", () => {})
  h.link.dispose(); h.link.dispose(); stop()
  expect(await job).toEqual({ ok: false, reason: "unconfirmed" })
  expect(await probe).toEqual({ ok: false, reason: "unavailable" })
  expect(h.watchers[0]?.stops).toBe(1)
  expect(h.messages("unwatch")).toHaveLength(1)
  expect(h.clock.count).toBe(0)
  expect(h.tracked.listenerCount).toBe(2)
})

test("a probe validates its exact vocabulary and expires after two seconds", async () => {
  const h = setup({ probe: () => deferred<unknown>().promise })
  await h.link.hello
  const result = h.link.probe()
  const request = object(h.messages("probe")[0])
  for (const report of [
    { site: "music", entries: [{ id: dependency, present: true }] },
    { site: "www", entries: [{ id: "unknown", present: true }] }, { site: "www", entries: [] }
  ]) emit(h, { ...header, kind: "probe", id: request.id, report })
  h.clock.advance(2_000)
  expect(await result).toEqual({ ok: false, reason: "unavailable" })
})

test("an immediate watcher callback can stop itself and releases the remote subscription once", async () => {
  const h = setup({ initial: nav })
  await h.link.hello
  let count = 0
  const stop = h.link.watch("nav", (_, close) => { count++; close() })
  stop(); stop()
  h.watchers[0]?.emit(nav)
  expect(count).toBe(1)
  expect(h.watchers[0]?.stops).toBe(1)
  expect(h.messages("unwatch")).toHaveLength(1)
})

test("watcher callbacks can dispose the link during the synchronous first event", async () => {
  const h = setup({ initial: nav })
  await h.link.hello
  const stop = h.link.watch("nav", () => h.link.dispose())
  stop()
  expect(h.link.state).toEqual({ kind: "disposed" })
  expect(h.watchers[0]?.stops).toBe(1)
  expect(h.clock.count).toBe(0)
})

test("each watcher validates its own ID, stream and build", async () => {
  const h = setup()
  await h.link.hello
  const values: unknown[] = []
  const stop = h.link.watch("nav", value => values.push(value))
  const id = object(h.messages("watch")[0]).id
  for (const event of [
    { ...header, kind: "stream", id: "unrelated", data: nav },
    { ...header, kind: "stream", id, data: { ids: [] } },
    { ...header, kind: "stream", id, data: nav, build: nextBuild },
    { ...header, kind: "stream", id, data: nav, v: 2 }
  ]) emit(h, event)
  expect(values).toEqual([])
  emit(h, { ...header, kind: "stream", id, data: nav })
  expect(values).toEqual([nav])
  stop()
  emit(h, { ...header, kind: "stream", id, data: nav })
  expect(values).toEqual([nav])
})

test("unsupported streams start no page work and signals require site and vocabulary", async () => {
  const h = setup()
  await h.link.hello
  h.link.watch("queue", () => {})()
  expect(h.messages("watch")).toHaveLength(0)
  expect(h.watchers).toHaveLength(0)
  const values: unknown[] = []
  h.link.onSignal(value => values.push(value))
  for (const signal of [{ ...syntheticSignal, site: "music" }, { ...syntheticSignal, route: "unknown" }, { ...syntheticSignal, clientVersion: rawIdentity }]) emit(h, { ...header, kind: "signal", signal })
  expect(values).toEqual([])
  emit(h, { ...header, kind: "signal", signal: syntheticSignal })
  expect(values).toEqual([syntheticSignal])
})

test("same-build links remain live with distinct IDs, and a valid new build retires all old work", async () => {
  const channel = createDirectPageChannel()
  const h = setup({ channel, run: () => deferred<unknown>().promise })
  await h.link.hello
  const clock = new ManualClock()
  const second = createPageLink({ build, site: "www", vocabulary, clock }, h.tracked.channel)
  owned.push(second.dispose)
  await second.hello
  expect(h.link.state.kind).toBe("ready")
  const firstResult = h.link.run(openMenu()), secondResult = second.run(openMenu())
  const ids = h.messages("run").map(value => object(value).id)
  expect(ids).toHaveLength(2)
  expect(new Set(ids).size).toBe(2)
  channel.send("retire", JSON.stringify({ ...header, v: 2, kind: "retire", build: nextBuild }))
  expect(h.link.state.kind).toBe("ready")
  channel.send("retire", JSON.stringify({ ...header, kind: "retire", build: nextBuild }))
  expect(h.link.state.kind).toBe("disposed")
  expect(second.state.kind).toBe("disposed")
  expect(h.endpoint.disposed).toBe(true)
  expect(await firstResult).toEqual({ ok: false, reason: "unconfirmed" })
  expect(await secondResult).toEqual({ ok: false, reason: "unconfirmed" })
  expect(h.clock.count).toBe(0)
  expect(clock.count).toBe(0)
  expect(h.tracked.listenerCount).toBe(0)
})

test("rejected and throwing gateway operations remain bounded without inventing an answer", async () => {
  const h = setup({ run: async () => { throw new Error("Synthetic operation failure") }, throwingWatch: true, probe: async () => { throw new Error("Synthetic probe failure") } })
  await h.link.hello
  const job = h.link.run(openMenu()), probe = h.link.probe()
  h.link.watch("nav", () => {})()
  await flush()
  h.clock.advance(10_000)
  expect(await job).toEqual({ ok: false, reason: "unconfirmed" })
  expect(await probe).toEqual({ ok: false, reason: "unavailable" })
  expect(h.calls).toHaveLength(1)
  expect(h.clock.count).toBe(0)
})

test("safe snapshots retain optional video and reject raw output fields", async () => {
  const video = { videoId: "dQw4w9WgXcQ", title: "Synthetic video", length: 100, kind: "video" }
  const { isVideoInfo } = await import("../../shared/contracts")
  const h = setup({ pageSnapshot: () => ({ ...snapshot(), video: checked(isVideoInfo, video) }) })
  const hello = await h.link.hello
  expect(hello).toMatchObject({ ok: true, snapshot: { video, startedHidden: true, navType: "reload" } })
  if (!hello.ok) throw new Error("Expected safe hello")
  expect(Object.keys(hello.snapshot).sort()).toEqual(["acct", "navType", "pageType", "signedIn", "startedHidden", "video"])
  expect(Object.isFrozen(hello.snapshot)).toBe(true)
  expect(Object.isFrozen(h.link.state)).toBe(true)
})

test("signed-out account answers project to null without hashing a visitor identity", async () => {
  let digests = 0
  const h = setup({ pageSnapshot: () => snapshot(null), run: async () => ({ ok: true, data: { signedIn: false, datasyncId: null }, route }), link: { digest: async () => { digests++; throw new Error("Unexpected digest") } } })
  await h.link.hello
  expect(await h.link.run({ job: { kind: "account" } })).toEqual({ ok: true, data: { signedIn: false, acct: null }, route })
  expect(digests).toBe(0)
})

test("a page accountChanged failure survives reentrant owner disposal", async () => {
  const h = setup({ run: async () => ({ ok: false, reason: "accountChanged" }) })
  await h.link.hello
  h.link.onState(state => { if (state.kind === "accountChanged") h.link.dispose() })
  expect(await h.link.run(pinned())).toEqual({ ok: false, reason: "accountChanged" })
  expect(h.link.state).toEqual({ kind: "disposed" })
})

test("a changed account digest survives reentrant owner disposal as accountChanged", async () => {
  const h = setup({ run: async () => ({ ok: true, data: { signedIn: false, datasyncId: null }, route }) })
  await h.link.hello
  h.link.onState(state => { if (state.kind === "accountChanged") h.link.dispose() })
  expect(await h.link.run({ job: { kind: "account" } })).toEqual({ ok: false, reason: "accountChanged" })
  expect(h.link.state).toEqual({ kind: "disposed" })
})

test("unknown request fields fail the existing invocation guard before dispatch", async () => {
  const h = setup()
  await h.link.hello
  expect(await h.link.run({ job: { kind: "playlists", endpoint: {} }, acct: safeKey })).toEqual({ ok: false, reason: "unavailable" })
  expect(h.calls).toHaveLength(0)
})

test("a missing handshake blocks all work without assuming a supplied account", async () => {
  const clock = new ManualClock()
  const channel = trackedChannel(createDirectPageChannel())
  const link = createPageLink({ build, site: "www", vocabulary, clock }, channel.channel)
  owned.push(link.dispose)
  expect(await link.run(pinned())).toEqual({ ok: false, reason: "unavailable" })
  expect(await link.run(openMenu())).toEqual({ ok: false, reason: "unavailable" })
  expect(await link.probe()).toEqual({ ok: false, reason: "unavailable" })
  link.watch("nav", () => {})()
  expect(channel.frames.filter(frame => frame.wire === "req")).toHaveLength(1)
  clock.advance(2_000)
  expect(await link.hello).toEqual({ ok: false, reason: "unavailable" })
})

test("a delayed deadline callback cannot admit a late run or hello", async () => {
  const h = setup({ run: () => deferred<unknown>().promise })
  await h.link.hello
  const result = h.link.run(openMenu())
  const id = object(h.messages("run")[0]).id
  h.clock.jump(10_000)
  emit(h, { ...header, kind: "run", id, result: { ok: true, data: null, route } })
  expect(await result).toEqual({ ok: false, reason: "unconfirmed" })
  expect(h.clock.count).toBe(0)
  const clock = new ManualClock(), channel = createDirectPageChannel()
  const link = createPageLink({ build, site: "www", vocabulary, clock }, channel)
  owned.push(link.dispose)
  clock.jump(2_000)
  channel.send("res", JSON.stringify({ ...header, kind: "hello", site: "www", snapshot: snapshot() }))
  expect(await link.hello).toEqual({ ok: false, reason: "unavailable" })
})

test("an account trip also disarms an already pending pinned caller", async () => {
  const first = deferred<unknown>(), second = deferred<unknown>()
  let calls = 0
  const h = setup({ run: () => ++calls === 1 ? first.promise : second.promise })
  await h.link.hello
  const beforeTrip = h.link.run(pinned()), trip = h.link.run(pinned())
  second.resolve({ ok: false, reason: "accountChanged" })
  expect(await trip).toEqual({ ok: false, reason: "accountChanged" })
  first.resolve({ ok: true, data: [], route })
  expect(await beforeTrip).toEqual({ ok: false, reason: "accountChanged" })
})
