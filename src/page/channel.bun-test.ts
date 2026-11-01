import { afterEach, expect, test } from "bun:test"
import {
  CONTRACT_VERSION, isBuildId, isPageRequestId, isPageType, isPageWatchId, isRouteId, isWatchId, parseJsonText
} from "../shared/contracts"
import type { BreakageSignal, Job, ProbeReport, Site, Stream, StreamData } from "../shared/contracts"
import { isPageHelloAnswer, isPageProbeAnswerFor, isPageRunAnswerFor, isPageSignalEvent, isPageStreamEventFor } from "../shared/contracts/page"
import type { PageHelloSnapshot, PageJobResult } from "../shared/contracts/page"
import { createDirectPageChannel, createDomPageChannel, type PageChannel } from "../shared/rpc/page-channel"
import { servePage, type PageGatewayOperations } from "./channel"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error("Invalid synthetic fixture")
  return value
}
const build = checked(isBuildId, "build-current")
const otherBuild = checked(isBuildId, "build-other")
const route = checked(isRouteId, "route-1")
const dependency = checked(isWatchId, "dependency-1")
const requestId = checked(isPageRequestId, "request-1")
const watchId = checked(isPageWatchId, "subscription-1")
const vocabulary = { routes: [route], watchIds: [dependency], schemaKeys: ["data"] }
const snapshot: PageHelloSnapshot = {
  signedIn: true, datasyncId: "synthetic-identity", pageType: checked(isPageType, "WATCH"), startedHidden: false, navType: "navigate"
}
const header = { v: CONTRACT_VERSION, build }
const sites: readonly Site[] = ["www", "music"]
const account = { ok: true, data: { signedIn: true, datasyncId: "synthetic-identity" }, route }
const nav = { pageType: "WATCH", video: null, navigation: { kind: "other" } }
const signal: BreakageSignal = {
  site: "www", feature: null, job: null, route: null, kind: "timeout", watchId: null, shape: null,
  clientVersion: "2.20261024.00.00", pageType: "watch", count: 1, firstSeen: 0, lastSeen: 0
}
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) { try { cleanup() } catch { /* the test already asserted it */ } }
})

type Pending = { job: Job; target: Element | undefined; resolve(value: unknown): void; reject(error: unknown): void }
type Watcher = { stream: Stream; emit(value: unknown): void; stops: number }

function fakeGateway(initial?: (watcher: Watcher, onData: (value: unknown) => void) => void) {
  const runs: Pending[] = []
  const probes: Pending[] = []
  const watchers: Watcher[] = []
  const ops: PageGatewayOperations = {
    run<J extends Job>(job: J, ctx?: { target?: Element }) {
      return new Promise<PageJobResult<J>>((resolve, reject) => {
        runs.push({ job, target: ctx?.target, resolve: value => resolve(value as PageJobResult<J>), reject })
      })
    },
    watch<S extends Stream>(stream: S, onData: (data: StreamData<S>) => void) {
      const emit = (value: unknown) => onData(value as StreamData<S>)
      const watcher: Watcher = { stream, emit, stops: 0 }
      watchers.push(watcher)
      initial?.(watcher, emit)
      return () => { watcher.stops++ }
    },
    probe() {
      return new Promise<ProbeReport>((resolve, reject) => {
        probes.push({ job: { kind: "account" }, target: undefined, resolve: value => resolve(value as ProbeReport), reject })
      })
    }
  }
  return { ops, runs, probes, watchers }
}

function harness(options: {
  site?: Site; channel?: PageChannel; gateway?: ReturnType<typeof fakeGateway>; snapshot?: () => PageHelloSnapshot
} = {}) {
  const site = options.site ?? "www"
  const channel = options.channel ?? createDirectPageChannel()
  const gateway = options.gateway ?? fakeGateway()
  const sinks = new Set<(signal: BreakageSignal) => void>()
  let signalStops = 0
  const answers: unknown[] = []
  const details: unknown[] = []
  const stopAnswers = channel.listen("res", detail => {
    details.push(detail)
    const parsed = parseJsonText(detail)
    answers.push(parsed.ok ? parsed.value : { unparsed: detail })
  })
  const endpoint = servePage(gateway.ops, {
    site, build, vocabulary, snapshot: options.snapshot ?? (() => snapshot),
    signals: onSignal => {
      sinks.add(onSignal)
      return () => { sinks.delete(onSignal); signalStops++ }
    }
  }, channel)
  cleanups.push(stopAnswers, () => endpoint.dispose())
  return {
    site, channel, gateway, endpoint, answers, details,
    request: (payload: Record<string, unknown>, target?: Element) =>
      channel.send("req", JSON.stringify({ ...header, ...payload }), target),
    retire: (value: unknown) => channel.send("retire", JSON.stringify(value)),
    signal: (value: BreakageSignal) => { for (const sink of [...sinks]) sink(value) },
    get signalStops() { return signalStops }
  }
}

function card(): Element {
  const element = document.createElement("ytd-rich-item-renderer")
  document.body.append(element)
  return element
}

for (const site of sites) {
  test(`DOM hello on ${site} answers on document with the supplied snapshot as a composed JSON string`, () => {
    const events: CustomEvent[] = []
    const record = (event: Event) => { if (event instanceof CustomEvent) events.push(event) }
    document.addEventListener("ppt:res", record)
    try {
      const page = harness({ site, channel: createDomPageChannel(document) })
      page.request({ kind: "hello" })
      expect(events).toHaveLength(1)
      const [event] = events
      expect(typeof event?.detail).toBe("string")
      expect(event?.target).toBe(document)
      expect([event?.bubbles, event?.composed]).toEqual([true, true])
      expect(isPageHelloAnswer(page.answers[0], { build, site })).toBe(true)
      expect(page.answers).toEqual([{ ...header, kind: "hello", site, snapshot }])
      expect(document.body.innerHTML).not.toContain("ppt")
    } finally {
      document.removeEventListener("ppt:res", record)
    }
  })
}

test("an invalid snapshot never reaches the core", () => {
  const page = harness({ snapshot: () => ({ ...snapshot, datasyncId: "" }) })
  page.request({ kind: "hello" })
  expect(page.answers).toEqual([])
})

test("DOM item jobs run with their actual element and document jobs run without a target", async () => {
  const page = harness({ channel: createDomPageChannel(document) })
  const item = card()
  const itemId = checked(isPageRequestId, "request-item")
  page.request({ kind: "run", id: itemId, job: { kind: "openCardMenu" } }, item)
  page.request({ kind: "run", id: requestId, job: { kind: "account" } })
  expect(page.gateway.runs.map(run => [run.job, run.target])).toEqual([[{ kind: "openCardMenu" }, item], [{ kind: "account" }, undefined]])
  expect(item.attributes).toHaveLength(0)
  page.gateway.runs[1]?.resolve(account)
  page.gateway.runs[0]?.resolve({ ok: true, data: null, route })
  await flush()
  expect(page.answers).toEqual([
    { ...header, kind: "run", id: requestId, result: account },
    { ...header, kind: "run", id: itemId, result: { ok: true, data: null, route } }
  ])
  expect(isPageRunAnswerFor({ id: requestId, job: { kind: "account" } }, page.answers[0], build)).toBe(true)
  item.remove()
})

test("the direct adapter keeps the item target and carries only JSON strings", async () => {
  const page = harness()
  const item = card()
  page.request({ kind: "run", id: requestId, job: { kind: "itemInfo" } }, item)
  expect(page.gateway.runs[0]?.target).toBe(item)
  page.gateway.runs[0]?.resolve({ ok: false, reason: "unavailable" })
  await flush()
  expect(page.details.every(detail => typeof detail === "string")).toBe(true)
  expect(page.answers).toEqual([{ ...header, kind: "run", id: requestId, result: { ok: false, reason: "unavailable" } }])
  item.remove()
})

test("the boundary drops non-string, malformed and wrong-build requests before any job runs", () => {
  const page = harness({ channel: createDomPageChannel(document) })
  const valid = { ...header, kind: "run", id: requestId, job: { kind: "account" } }
  const raw = (detail: unknown) => document.dispatchEvent(new CustomEvent("ppt:req", { detail, bubbles: true, composed: true }))
  raw(valid)
  raw(undefined)
  document.dispatchEvent(new Event("ppt:req"))
  for (const text of [
    "{", "null", "[]", JSON.stringify("run"),
    JSON.stringify({ ...valid, build: otherBuild }), JSON.stringify({ ...valid, v: 2 }), JSON.stringify({ ...valid, v: "1" }),
    JSON.stringify({ ...valid, extra: true }), JSON.stringify({ ...valid, kind: "launch" }), JSON.stringify({ ...valid, kind: "retire" }),
    JSON.stringify({ ...valid, id: "" }), JSON.stringify({ ...valid, job: { kind: "account", extra: 1 } }),
    JSON.stringify({ ...valid, job: { kind: "unknown" } }), JSON.stringify({ ...header, kind: "hello", site: "www" }),
    JSON.stringify({ ...header, kind: "watch", id: watchId, stream: "radio" })
  ]) raw(text)
  expect(page.gateway.runs).toEqual([])
  expect(page.gateway.watchers).toEqual([])
  expect(page.answers).toEqual([])
  raw(JSON.stringify(valid))
  expect(page.gateway.runs).toHaveLength(1)
})

test("each valid run event runs once and is answered under its own ID", async () => {
  const page = harness()
  page.request({ kind: "run", id: requestId, job: { kind: "account" } })
  page.request({ kind: "run", id: requestId, job: { kind: "account" } })
  expect(page.gateway.runs).toHaveLength(2)
  for (const run of page.gateway.runs) run.resolve(account)
  await flush()
  expect(page.answers).toHaveLength(2)
})

test("gateway results that do not fit the job never reach the core", async () => {
  const page = harness()
  const castJob = { kind: "castState" }
  for (const id of ["r1", "r2", "r3", "r4", "r5"]) page.request({ kind: "run", id, job: castJob })
  const [mismatched, extra, wrongType, rejected, valid] = page.gateway.runs
  mismatched?.resolve(account)
  extra?.resolve({ ok: true, data: { casting: true }, route, extra: true })
  wrongType?.resolve({ ok: true, data: { casting: Number.NaN }, route })
  rejected?.reject(new Error("synthetic"))
  valid?.resolve({ ok: true, data: { casting: false }, route })
  await flush()
  expect(page.answers).toEqual([{ ...header, kind: "run", id: "r5", result: { ok: true, data: { casting: false }, route } }])
})

test("probe answers carry the requested ID and only the configured site and watch list", async () => {
  const page = harness()
  for (const id of ["p1", "p2", "p3"]) page.request({ kind: "probe", id })
  const [wrongSite, unknownWatch, valid] = page.gateway.probes
  wrongSite?.resolve({ site: "music", entries: [{ id: dependency, present: true }] })
  unknownWatch?.resolve({ site: "www", entries: [{ id: "dependency-2", present: true }] })
  valid?.resolve({ site: "www", entries: [{ id: dependency, present: false }] })
  await flush()
  const pending = { id: checked(isPageRequestId, "p3"), site: "www" as const, watchIds: [dependency] }
  expect(page.answers).toHaveLength(1)
  expect(isPageProbeAnswerFor(pending, page.answers[0], build)).toBe(true)
})

test("stream data is forwarded under its watch ID and wrong data or unsupported streams are dropped", () => {
  const music = harness({ site: "music" })
  music.request({ kind: "watch", id: watchId, stream: "player" })
  expect(music.gateway.watchers).toEqual([])
  music.request({ kind: "watch", id: watchId, stream: "queue" })
  const [watcher] = music.gateway.watchers
  watcher?.emit({ ids: ["item-1"] })
  watcher?.emit(nav)
  watcher?.emit({ ids: ["item-1", "item-1"] })
  expect(music.answers).toEqual([{ ...header, kind: "stream", id: watchId, data: { ids: ["item-1"] } }])
  expect(isPageStreamEventFor({ id: watchId, stream: "queue" }, music.answers[0], build)).toBe(true)
})

test("watch IDs stay separate from request IDs and static watch-list IDs", async () => {
  const page = harness()
  page.request({ kind: "watch", id: "shared-text", stream: "nav" })
  page.request({ kind: "run", id: "shared-text", job: { kind: "account" } })
  page.request({ kind: "probe", id: "shared-text" })
  page.request({ kind: "unwatch", id: dependency })
  page.request({ kind: "unwatch", id: "missing" })
  expect(page.gateway.watchers[0]?.stops).toBe(0)
  page.gateway.runs[0]?.resolve(account)
  page.gateway.probes[0]?.resolve({ site: "www", entries: [{ id: dependency, present: true }] })
  page.gateway.watchers[0]?.emit(nav)
  await flush()
  expect(page.answers.map(answer => parseKind(answer))).toEqual(["stream", "run", "probe"])
})

function parseKind(value: unknown): unknown {
  return value !== null && typeof value === "object" && "kind" in value ? value.kind : undefined
}

test("replacing a watch releases the old subscription once and silences its callback", () => {
  const page = harness()
  page.request({ kind: "watch", id: watchId, stream: "nav" })
  page.request({ kind: "watch", id: watchId, stream: "nav" })
  const [first, second] = page.gateway.watchers
  expect([first?.stops, second?.stops]).toEqual([1, 0])
  first?.emit(nav)
  second?.emit(nav)
  expect(page.answers).toHaveLength(1)
  page.request({ kind: "unwatch", id: watchId })
  page.request({ kind: "unwatch", id: watchId })
  second?.emit(nav)
  expect([first?.stops, second?.stops, page.answers.length]).toEqual([1, 1, 1])
})

test("synchronous initial data is delivered and a reentrant unwatch releases the subscription exactly once", () => {
  const gateway = fakeGateway((_, onData) => onData(nav))
  const page = harness({ gateway })
  cleanups.push(page.channel.listen("res", () => page.request({ kind: "unwatch", id: watchId })))
  page.request({ kind: "watch", id: watchId, stream: "nav" })
  const [watcher] = gateway.watchers
  expect(page.answers).toHaveLength(1)
  expect(watcher?.stops).toBe(1)
  watcher?.emit(nav)
  expect(page.answers).toHaveLength(1)
})

test("reentrant disposal during the initial callback releases the subscription once", () => {
  const gateway = fakeGateway((_, onData) => onData(nav))
  const page = harness({ gateway })
  cleanups.push(page.channel.listen("res", () => page.endpoint.dispose()))
  page.request({ kind: "watch", id: watchId, stream: "nav" })
  expect(page.endpoint.disposed).toBe(true)
  expect(gateway.watchers[0]?.stops).toBe(1)
  expect(page.signalStops).toBe(1)
})

test("disposal is idempotent, removes listeners, releases watches and suppresses late answers", async () => {
  const page = harness({ channel: createDomPageChannel(document) })
  page.request({ kind: "watch", id: "w1", stream: "nav" })
  page.request({ kind: "watch", id: "w2", stream: "player" })
  page.request({ kind: "run", id: requestId, job: { kind: "account" } })
  page.request({ kind: "probe", id: requestId })
  page.endpoint.dispose()
  page.endpoint.dispose()
  expect(page.gateway.watchers.map(watcher => watcher.stops)).toEqual([1, 1])
  expect(page.signalStops).toBe(1)
  page.gateway.runs[0]?.resolve(account)
  page.gateway.probes[0]?.resolve({ site: "www", entries: [{ id: dependency, present: true }] })
  page.gateway.watchers[0]?.emit(nav)
  page.signal(signal)
  page.request({ kind: "hello" })
  page.request({ kind: "run", id: requestId, job: { kind: "account" } })
  await flush()
  expect(page.answers).toEqual([])
  expect(page.gateway.runs).toHaveLength(1)
})

test("only a valid different-build retirement disposes the endpoint", async () => {
  const page = harness({ channel: createDomPageChannel(document) })
  page.request({ kind: "watch", id: watchId, stream: "nav" })
  page.request({ kind: "run", id: requestId, job: { kind: "account" } })
  page.retire({ ...header, kind: "retire" })
  page.retire({ v: 2, build: otherBuild, kind: "retire" })
  page.retire({ ...header, build: otherBuild, kind: "retire", extra: true })
  page.retire({ ...header, build: "", kind: "retire" })
  document.dispatchEvent(new CustomEvent("ppt:retire", { detail: { ...header, build: otherBuild, kind: "retire" } }))
  page.request({ kind: "retire", build: otherBuild })
  expect(page.endpoint.disposed).toBe(false)
  page.request({ kind: "hello" })
  expect(page.answers).toHaveLength(1)
  page.retire({ ...header, build: otherBuild, kind: "retire" })
  expect(page.endpoint.disposed).toBe(true)
  expect(page.gateway.watchers[0]?.stops).toBe(1)
  page.gateway.runs[0]?.resolve(account)
  await flush()
  page.request({ kind: "hello" })
  expect(page.answers).toHaveLength(1)
})

test("a throwing subscription disposer cannot strand the other watches or listeners", () => {
  const gateway = fakeGateway()
  const watch = gateway.ops.watch
  let first = true
  gateway.ops.watch = (stream, onData) => {
    const stop = watch(stream, onData)
    if (!first) return stop
    first = false
    return () => { stop(); throw new Error("synthetic disposer failure") }
  }
  const page = harness({ gateway })
  page.request({ kind: "watch", id: "w1", stream: "nav" })
  page.request({ kind: "watch", id: "w2", stream: "nav" })
  expect(() => page.endpoint.dispose()).toThrow("synthetic disposer failure")
  expect(gateway.watchers.map(watcher => watcher.stops)).toEqual([1, 1])
  expect(page.signalStops).toBe(1)
  page.request({ kind: "hello" })
  expect(page.answers).toEqual([])
})

test("a throwing gateway watch leaves no subscription behind", () => {
  const gateway = fakeGateway()
  gateway.ops.watch = () => { throw new Error("synthetic watch failure") }
  const page = harness({ gateway })
  expect(() => page.request({ kind: "watch", id: watchId, stream: "nav" })).toThrow("synthetic watch failure")
  page.endpoint.dispose()
  expect(page.endpoint.disposed).toBe(true)
})

test("a throwing core listener does not break the endpoint", () => {
  const page = harness()
  const stop = page.channel.listen("res", () => { throw new Error("synthetic consumer failure") })
  expect(() => page.request({ kind: "hello" })).toThrow("synthetic consumer failure")
  stop()
  page.request({ kind: "hello" })
  expect(page.answers).toHaveLength(2)
})

test("breakage signals are forwarded only for this site and the trusted vocabulary", () => {
  const page = harness()
  page.signal(signal)
  page.signal({ ...signal, site: "music" })
  page.signal({ ...signal, route: checked(isRouteId, "route-unknown") })
  expect(page.answers).toHaveLength(1)
  expect(isPageSignalEvent(page.answers[0], { build, site: "www", vocabulary })).toBe(true)
})

test("two direct channels stay independent", async () => {
  const a = harness()
  const b = harness({ site: "music" })
  a.request({ kind: "run", id: requestId, job: { kind: "account" } })
  b.request({ kind: "watch", id: watchId, stream: "nowPlaying" })
  expect([a.gateway.runs.length, b.gateway.runs.length, a.gateway.watchers.length, b.gateway.watchers.length]).toEqual([1, 0, 0, 1])
  b.retire({ ...header, build: otherBuild, kind: "retire" })
  expect([a.endpoint.disposed, b.endpoint.disposed]).toEqual([false, true])
  a.gateway.runs[0]?.resolve(account)
  await flush()
  expect([a.answers.length, b.answers.length]).toEqual([1, 0])
})
