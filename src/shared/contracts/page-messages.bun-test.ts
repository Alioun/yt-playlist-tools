import { expect, test } from "bun:test"
import * as safe from "./index"
import {
  isPageRequestMessage, isPageHelloAnswer, isPageRunAnswerFor, isPageStreamEventFor,
  isPageProbeAnswerFor, isPageSignalEvent, isPageRetireMessage
} from "./page"
import { isVideoId, isPlaylistId } from "../model/validation"
import type { Job, Stream, StreamData, JsonValue } from "./index"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error("Invalid synthetic fixture")
  return value
}
const build = checked(safe.isBuildId, "synthetic-build")
const id = checked(safe.isPageRequestId, "request-1")
const watchId = checked(safe.isPageWatchId, "subscription-1")
const dependency = checked(safe.isWatchId, "dependency-1")
const route = checked(safe.isRouteId, "route-1")
const videoId = checked(isVideoId, "dQw4w9WgXcQ")
const video2 = checked(isVideoId, "aaaaaaaaaaa")
const playlistId = checked(isPlaylistId, "PLsynthetic")
const header = { v: safe.CONTRACT_VERSION, build }
const vocabulary = { routes: [route], watchIds: [dependency], schemaKeys: ["data"] }
const report = { site: "www", entries: [{ id: dependency, present: true }] }
const signal = {
  site: "www", feature: null, job: null, route: null, kind: "timeout", watchId: null, shape: null,
  clientVersion: "2.20261024.00.00", pageType: "watch", count: 1, firstSeen: 0, lastSeen: 0
}
const video = { videoId, title: "Synthetic title", length: null, kind: "video" }
const snapshot = { signedIn: true, datasyncId: "synthetic-identity", pageType: "WATCH", startedHidden: true, navType: "navigate", video }
const pending = { id, job: { kind: "account" } } satisfies { id: typeof id; job: Job }
const probePending = { id, site: "www", watchIds: [dependency] } as const
const run = { ...header, kind: "run", id, result: { ok: true, data: { signedIn: true, datasyncId: "synthetic-identity" }, route } }
const fixtures: { name: string; value: Record<string, unknown>; guard: (value: unknown) => boolean }[] = [
  ...[
    { kind: "hello" }, { kind: "run", id, job: pending.job }, { kind: "watch", id: watchId, stream: "nav" },
    { kind: "unwatch", id: watchId }, { kind: "probe", id }
  ].map(payload => ({ name: `request ${payload.kind}`, value: { ...header, ...payload }, guard: (value: unknown) => isPageRequestMessage(value, build) })),
  { name: "retire", value: { ...header, kind: "retire" }, guard: isPageRetireMessage },
  { name: "hello answer", value: { ...header, kind: "hello", site: "www", snapshot }, guard: value => isPageHelloAnswer(value, { build, site: "www" }) },
  { name: "run answer", value: run, guard: value => isPageRunAnswerFor(pending, value, build) },
  { name: "stream event", value: { ...header, kind: "stream", id: watchId, data: { ids: ["item", 0] } }, guard: value => isPageStreamEventFor({ id: watchId, stream: "queue" }, value, build) },
  { name: "probe answer", value: { ...header, kind: "probe", id, report }, guard: value => isPageProbeAnswerFor(probePending, value, build) },
  { name: "signal event", value: { ...header, kind: "signal", signal }, guard: value => isPageSignalEvent(value, { build, site: "www", vocabulary }) }
]

for (const { name, value, guard } of fixtures) {
  test(`${name} requires its complete exact JSON envelope`, () => {
    expect(guard(value)).toBe(true)
    expect(guard(JSON.parse(JSON.stringify(value)))).toBe(true)
    expect(guard({ ...value, kind: "unknown" })).toBe(false)
    expect(guard({ ...value, extra: true })).toBe(false)
    expect(guard({ ...value, kind: 42 })).toBe(false)
    expect(guard({ ...value, v: 2 })).toBe(false)
    expect(guard({ ...value, v: "1" })).toBe(false)
    expect(guard({ ...value, build: "" })).toBe(false)
    if (name !== "retire") expect(guard({ ...value, build: "another-build" })).toBe(false)
    for (const key of Object.keys(value)) {
      const missing = { ...value }
      delete missing[key]
      expect(guard(missing)).toBe(false)
    }
    expect(guard(Object.assign(Object.create(null), value))).toBe(true)
  })
}

test("retirement is separate from ordinary requests and retains current version checking", () => {
  const retire = { ...header, kind: "retire", build: "new-build" }
  expect(isPageRetireMessage(retire)).toBe(true)
  expect(isPageRetireMessage({ ...retire, build })).toBe(true)
  expect(isPageRequestMessage(retire, build)).toBe(false)
  expect(isPageRetireMessage({ ...run, build: "new-build" })).toBe(false)
  expect(isPageRetireMessage({ ...retire, v: 999 })).toBe(false)
  expect(safe.inspectMessageHeader(retire, build).kind).toBe("build-mismatch")
})

test("hello keeps raw identity and independent start facts on the page entrypoint", () => {
  const hello = { ...header, kind: "hello", site: "www", snapshot }
  for (const navType of ["navigate", "reload", "back_forward", "prerender", null]) {
    for (const startedHidden of [true, false]) {
      const { video: omitted, ...withoutVideo } = snapshot
      void omitted
      expect(isPageHelloAnswer({ ...hello, snapshot: { ...withoutVideo, navType, startedHidden } }, { build, site: "www" })).toBe(true)
    }
  }
  expect(isPageHelloAnswer({ ...hello, snapshot: { ...snapshot, signedIn: false, datasyncId: null } }, { build, site: "www" })).toBe(true)
  for (const change of [
    { video: undefined }, { video: null }, { video: { ...video, length: 0 } }, { navType: "spa" },
    { signedIn: false }, { datasyncId: null }, { datasyncId: "" }, { acct: "aaaaaaaaaaaaaaaa" }, { pageType: "" }
  ]) expect(isPageHelloAnswer({ ...hello, snapshot: { ...snapshot, ...change } }, { build, site: "www" })).toBe(false)
  expect(isPageHelloAnswer(hello, { build, site: "music" })).toBe(false)
  const { datasyncId: omittedIdentity, ...safeSnapshot } = snapshot
  void omittedIdentity
  expect(isPageHelloAnswer({ ...hello, snapshot: { ...safeSnapshot, acct: "aaaaaaaaaaaaaaaa" } }, { build, site: "www" })).toBe(false)
  for (const name of ["isPageHelloAnswer", "isPageRunAnswerFor", "isPageJobResultFor", "isPageRequestMessage", "isPageRetireMessage", "objectShape"]) expect(Object.hasOwn(safe, name)).toBe(false)
})

test("run answers use the exact pending id, actual job and C1 batch correlation", () => {
  expect(isPageRunAnswerFor({ ...pending, id: checked(safe.isPageRequestId, "other") }, run, build)).toBe(false)
  expect(isPageRunAnswerFor({ id, job: { kind: "accountLabel" } }, run, build)).toBe(false)
  expect(isPageRunAnswerFor(pending, { ...run, result: { ok: true, data: { signedIn: true, acct: "aaaaaaaaaaaaaaaa" }, route } }, build)).toBe(false)
  expect(isPageRunAnswerFor(pending, { ...run, result: { ok: true, data: { signedIn: true, datasyncId: "synthetic", acct: "aaaaaaaaaaaaaaaa" }, route } }, build)).toBe(false)
  expect(isPageRunAnswerFor(pending, { ...run, result: { ok: false, reason: "accountChanged" } }, build)).toBe(true)
  const batch = { id, job: { kind: "addBatch", playlistId, videoIds: [videoId, video2] } } satisfies { id: typeof id; job: Job }
  const results = [{ videoId, setVideoId: "occurrence" }, { videoId: video2, failure: { ok: false, reason: "failed" } }]
  const answer = { ...run, result: { ok: true, data: { results }, route } }
  expect(isPageRunAnswerFor(batch, answer, build)).toBe(true)
  expect(isPageRunAnswerFor(batch, { ...answer, result: { ...answer.result, data: { results: results.toReversed() } } }, build)).toBe(false)
  expect(isPageRunAnswerFor(batch, { ...answer, result: { ...answer.result, data: { results: results.slice(1) } } }, build)).toBe(false)
  for (const [job, data] of [
    [{ kind: "removeBatch", playlistId, setVideoIds: ["occurrence"] }, { removed: 2 }],
    [{ kind: "queueAddList", videoIds: [videoId] }, { confirmed: true, count: 0 }]
  ]) {
    if (!safe.isJob(job)) throw new Error("Invalid synthetic job")
    expect(isPageRunAnswerFor({ id, job }, { ...run, result: { ok: true, data, route } }, build)).toBe(false)
  }
})

test("streams preserve all four correlated data families, queue order and ad/null branches", () => {
  const data = {
    player: { ad: true, at: 0, player: "watch" }, nav: { pageType: "WATCH", video: null, navigation: { kind: "other" } },
    nowPlaying: null, queue: { ids: ["second", 0, "first"] }
  }
  for (const stream of Object.keys(data)) {
    if (!safe.isStream(stream)) throw new Error("Invalid synthetic stream")
    const event = { ...header, kind: "stream", id: watchId, data: data[stream] }
    expect(isPageStreamEventFor({ id: watchId, stream }, event, build)).toBe(true)
    expect(isPageStreamEventFor({ id: checked(safe.isPageWatchId, "other"), stream }, event, build)).toBe(false)
    const other: Stream = stream === "queue" ? "player" : "queue"
    expect(isPageStreamEventFor({ id: watchId, stream: other }, event, build)).toBe(false)
  }
  const queue = { ...header, kind: "stream", id: watchId, data: data.queue }
  if (!isPageStreamEventFor({ id: watchId, stream: "queue" }, queue, build)) throw new Error("Rejected queue")
  expect(queue.data.ids.map(String)).toEqual(["second", "0", "first"])
  expect(isPageStreamEventFor({ id: watchId, stream: "queue" }, { ...queue, data: { ids: [0, 0] } }, build)).toBe(false)
  const player: StreamData<"player"> = {
    ad: false, at: 0, player: "watch", videoId, pos: 1, len: null, listedLength: null, rate: 1,
    playing: false, seeking: false, content: "video", isPostLiveDvr: false, isLive: true, isUpcoming: false, isLiveContent: true
  }
  expect(isPageStreamEventFor({ id: watchId, stream: "player" }, { ...queue, data: player }, build)).toBe(true)
})

test("probe and signal envelopes require their retained contextual facts", () => {
  const probe = { ...header, kind: "probe", id, report }
  expect(isPageProbeAnswerFor({ ...probePending, watchIds: [] }, probe, build)).toBe(false)
  expect(isPageProbeAnswerFor({ ...probePending, site: "music" }, probe, build)).toBe(false)
  expect(isPageProbeAnswerFor({ ...probePending, id: checked(safe.isPageRequestId, "other") }, probe, build)).toBe(false)
  expect(isPageSignalEvent({ ...header, kind: "signal", signal }, { build, site: "music", vocabulary })).toBe(false)
  expect(isPageSignalEvent({ ...header, kind: "signal", signal: { ...signal, route } }, { build, site: "www", vocabulary: { ...vocabulary, routes: [] } })).toBe(false)
})

function objectFields(value: unknown, prefix: string[] = []): string[][] {
  if (value === null || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) => [
    ...(!Array.isArray(value) ? [[...prefix, key]] : []), ...objectFields(child, [...prefix, key])
  ])
}
function parentAt(value: Record<string, unknown>, path: string[]): Record<string, unknown> {
  let current: unknown = value
  for (const key of path.slice(0, -1)) {
    if (current === null || typeof current !== "object") throw new Error("Invalid synthetic path")
    current = Object.getOwnPropertyDescriptor(current, key)?.value
  }
  if (current === null || typeof current !== "object" || Array.isArray(current)) throw new Error("Invalid synthetic parent")
  return current as Record<string, unknown>
}

test("all envelope and nested evidence rejects accessors without calling getters", () => {
  const diagnostics = [
    { value: report, guard: safe.isProbeReport },
    { value: { ...signal, kind: "unrecognised", shape: { kind: "object", fields: [{ key: "data", value: { kind: "string" } }] } }, guard: (v: unknown) => safe.isBreakageSignal(v, vocabulary) }
  ]
  let getterCalls = 0
  for (const { value, guard } of [...fixtures, ...diagnostics]) {
    for (const path of objectFields(value)) {
      const key = path.at(-1)
      if (!key) throw new Error("Empty synthetic path")
      for (const throwing of [true, false]) {
        const copy = structuredClone(value)
        const parent = parentAt(copy, path)
        const original: unknown = parent[key]
        Object.defineProperty(parent, key, { enumerable: true, configurable: true, get() {
          getterCalls++
          if (throwing) throw new Error("Getter must not execute")
          return original
        } })
        expect(guard(copy)).toBe(false)
      }
      const copy = structuredClone(value)
      const parent = parentAt(copy, path)
      const original: unknown = parent[key]
      delete parent[key]
      const absent = guard(copy)
      const shadow = structuredClone(value)
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, key)
      for (const mode of ["data", "returning", "throwing"]) {
        let accepted: boolean
        let shadowAccepted: boolean
        try {
          Object.defineProperty(Object.prototype, key, mode === "data" ? { value: original, configurable: true } : {
            configurable: true, get() { getterCalls++; if (mode === "throwing") throw new Error("Inherited getter"); return original }
          })
          accepted = guard(copy)
          shadowAccepted = guard(shadow)
        } finally {
          if (previous) Object.defineProperty(Object.prototype, key, previous)
          else Reflect.deleteProperty(Object.prototype, key)
        }
        expect(accepted).toBe(absent)
        expect(shadowAccepted).toBe(true)
      }
    }
  }
  expect(getterCalls).toBe(0)
})

test("JSON failures, prototype-looking data and inherited catalogue keys stay invalid", () => {
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  for (const invalid of [undefined, NaN, Infinity, [1, , 2], cycle, () => true, new Date(0), { value: undefined }]) {
    expect(isPageRunAnswerFor(pending, { ...run, result: invalid }, build)).toBe(false)
  }
  for (const kind of ["toString", "constructor", "__proto__"]) expect(isPageRequestMessage({ ...header, kind }, build)).toBe(false)
  const parsed: unknown = JSON.parse('{"v":1,"build":"synthetic-build","kind":"hello","__proto__":{"polluted":true}}')
  expect(safe.isJsonValue(parsed)).toBe(true)
  expect(isPageRequestMessage(parsed, build)).toBe(false)
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false)
  const source = { ...header, kind: "signal", signal }
  const before = JSON.stringify(source)
  expect(isPageSignalEvent(source, { build, site: "www", vocabulary })).toBe(true)
  expect(JSON.stringify(source)).toBe(before)
  const arbitrary: JsonValue = { prototype: null }
  expect(safe.isJsonValue(arbitrary)).toBe(true)
})
