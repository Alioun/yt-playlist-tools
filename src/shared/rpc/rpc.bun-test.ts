import { expect, test } from "bun:test"
import { isBuildId } from "../contracts/vocabulary"
import { objectShape } from "../contracts/object-shape"
import { createRpc, createRpcCaller } from "./rpc"
import type { Authentication, Deadline, RpcContract, RpcOutcome } from "./rpc"
import { createMemoryNetwork } from "./memory"
import type { Receive, Transport } from "./transport"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error("Invalid synthetic fixture")
  return value
}
const build = checked(isBuildId, "synthetic-build")

type Sender = { context: "tab"; tabId: number; frameId: number } | { context: "page"; page: string }
type Calls = {
  "test.add": { payload: { video: string; playlists: string[] }; result: { added: number } }
  "test.ping": { payload: null; result: { pong: string } }
}
const contract: RpcContract<Calls> = {
  "test.add": {
    payload: (v): v is Calls["test.add"]["payload"] => objectShape(v, {
      video: x => typeof x === "string", playlists: x => Array.isArray(x) && x.every(p => typeof p === "string")
    }),
    result: (v): v is Calls["test.add"]["result"] => objectShape(v, { added: x => typeof x === "number" }),
    timeoutMs: 10_000
  },
  "test.ping": {
    payload: (v): v is null => v === null,
    result: (v): v is Calls["test.ping"]["result"] => objectShape(v, { pong: x => typeof x === "string" }),
    timeoutMs: 2_000
  }
}
const tab: Sender = { context: "tab", tabId: 7, frameId: 0 }
const background: Sender = { context: "page", page: "background" }

function clock() {
  const timers = new Map<number, { at: number; expire: () => void }>()
  let now = 0, next = 0, cancels = 0
  const deadline: Deadline = (ms, expire) => {
    const id = next++
    timers.set(id, { at: now + ms, expire })
    return () => { cancels++; timers.delete(id) }
  }
  return {
    deadline,
    active: () => timers.size,
    created: () => next,
    cancels: () => cancels,
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.expire()
    }
  }
}

function tabOnly({ sender }: { sender: Sender }): Authentication<{ tabId: number }> {
  return sender.context === "tab" && sender.frameId === 0 ? { kind: "accepted", context: { tabId: sender.tabId } } : { kind: "rejected" }
}

function setup(delivery: "immediate" | "queued" = "immediate", from: Sender = tab) {
  const network = createMemoryNetwork<Sender>({ delivery })
  const time = clock()
  const caller = createRpc(network.connect(from), { build, contract, deadline: time.deadline })
  const receiver = createRpc(network.connect(background), { build, contract, deadline: time.deadline })
  const seen: { payload: Calls["test.add"]["payload"]; context: { tabId: number } }[] = []
  receiver.handle({
    authenticate: tabOnly,
    handlers: {
      "test.add": (payload, context) => { seen.push({ payload, context }); return { added: payload.playlists.length } },
      "test.ping": () => ({ pong: "background" })
    }
  })
  return { network, time, caller, receiver, seen }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const sent = (network: { trace(): readonly { event: string }[] }) => network.trace().filter(entry => entry.event === "sent")

test("correlates two request and result pairs across a serialized boundary", async () => {
  const { network, caller, seen, time } = setup()
  const playlists = ["PLmusic", "WL"]
  const [add, ping] = await Promise.all([caller.call("test.add", { video: "v1", playlists }), caller.call("test.ping", null)])
  expect(add).toEqual({ kind: "answered", result: { added: 2 } })
  expect(ping).toEqual({ kind: "answered", result: { pong: "background" } })
  expect(seen).toEqual([{ payload: { video: "v1", playlists: ["PLmusic", "WL"] }, context: { tabId: 7 } }])
  expect(network.trace()).toEqual([
    { event: "sent", from: 0, text: '{"v":1,"build":"synthetic-build","id":"1","kind":"test.add","payload":{"video":"v1","playlists":["PLmusic","WL"]}}' },
    { event: "sent", from: 0, text: '{"v":1,"build":"synthetic-build","id":"2","kind":"test.ping","payload":null}' },
    { event: "answered", to: 0, text: '{"v":1,"build":"synthetic-build","id":"1","kind":"test.add","result":{"added":2}}' },
    { event: "answered", to: 0, text: '{"v":1,"build":"synthetic-build","id":"2","kind":"test.ping","result":{"pong":"background"}}' }
  ])
  seen[0]!.payload.playlists.push("mutated")
  expect(playlists).toEqual(["PLmusic", "WL"])
  expect(time.active()).toBe(0)
  expect(time.cancels()).toBe(time.created())
})

test("answers synchronous handlers and nested calls in both directions", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const time = clock()
  const tabRpc = createRpc(network.connect(tab), { build, contract, deadline: time.deadline })
  const backgroundRpc = createRpc(network.connect(background), { build, contract, deadline: time.deadline })
  const order: string[] = []
  tabRpc.handle({
    authenticate: ({ sender }) => sender.context === "page" ? { kind: "accepted", context: null } : { kind: "rejected" },
    handlers: { "test.add": () => ({ added: -1 }), "test.ping": () => { order.push("tab ping"); return { pong: "tab" } } }
  })
  backgroundRpc.handle({
    authenticate: tabOnly,
    handlers: {
      "test.add": async payload => {
        order.push("background add")
        const nested = await backgroundRpc.call("test.ping", null)
        order.push(`nested ${nested.kind}`)
        return { added: nested.kind === "answered" && nested.result.pong === "tab" ? payload.playlists.length : 0 }
      },
      "test.ping": () => ({ pong: "background" })
    }
  })
  expect(await tabRpc.call("test.add", { video: "v1", playlists: ["a", "b", "c"] })).toEqual({ kind: "answered", result: { added: 3 } })
  expect(order).toEqual(["background add", "tab ping", "nested answered"])
  expect(time.active()).toBe(0)
})

test("keeps overlapping calls correlated when answers arrive out of order", async () => {
  const { network, caller } = setup("queued")
  const first = caller.call("test.add", { video: "v1", playlists: ["a"] })
  const second = caller.call("test.add", { video: "v2", playlists: ["a", "b"] })
  const [one, two] = network.queued()
  two!.deliver()
  one!.deliver()
  expect(await first).toEqual({ kind: "answered", result: { added: 1 } })
  expect(await second).toEqual({ kind: "answered", result: { added: 2 } })
})

test("isolates concurrent instances that share one network and reuse no active identity", async () => {
  const { network, caller, time } = setup("queued")
  const twin = createRpc(network.connect({ context: "tab", tabId: 8, frameId: 0 }), { build, contract, deadline: time.deadline })
  const mine = caller.call("test.add", { video: "v1", playlists: ["a"] })
  const theirs = twin.call("test.add", { video: "v2", playlists: ["a", "b", "c"] })
  const again = caller.call("test.ping", null)
  expect(network.queued().map(item => JSON.parse(item.text).id)).toEqual(["1", "1", "2"])
  for (const item of [...network.queued()].reverse()) item.deliver()
  expect(await mine).toEqual({ kind: "answered", result: { added: 1 } })
  expect(await theirs).toEqual({ kind: "answered", result: { added: 3 } })
  expect(await again).toEqual({ kind: "answered", result: { pong: "background" } })
})

test("rejects untrusted senders before any handler runs", async () => {
  const { caller, seen } = setup("immediate", { context: "tab", tabId: 7, frameId: 3 })
  expect(await caller.call("test.add", { video: "v1", playlists: [] })).toEqual({ kind: "failed", failure: "invalid-answer" })
  expect(seen).toEqual([])
})

function stub() {
  const receivers: Receive<Sender>[] = []
  let answer: (message: unknown) => Promise<unknown> = () => new Promise(() => {})
  const transport: Transport<Sender> = {
    send: message => answer(message),
    listen(receive) {
      receivers.push(receive)
      return () => {
        const index = receivers.indexOf(receive)
        if (index >= 0) receivers.splice(index, 1)
      }
    }
  }
  return { transport, receivers, answerWith(next: (message: unknown) => Promise<unknown>) { answer = next } }
}

test("drops malformed, accessor, non-JSON, mismatched and unknown requests without a handler call", () => {
  const raw = stub()
  const time = clock()
  const rpc = createRpc(raw.transport, { build, contract, deadline: time.deadline })
  let handled = 0, getters = 0
  rpc.handle({ authenticate: tabOnly, handlers: { "test.add": () => { handled++; return { added: 0 } }, "test.ping": () => { handled++; return { pong: "" } } } })
  const valid = { v: 1, build: "synthetic-build", id: "1", kind: "test.ping", payload: null }
  const accessor = { ...valid }
  Object.defineProperty(accessor, "payload", { enumerable: true, get: () => { getters++; return null } })
  const messages: unknown[] = [
    undefined, null, "text", JSON.stringify(valid), [valid], accessor,
    { ...valid, v: 2 }, { ...valid, v: "1" }, { ...valid, build: "other-build" }, { v: 1, id: "1", kind: "test.ping", payload: null },
    { ...valid, id: "" }, { ...valid, id: 1 }, { ...valid, kind: "test.unknown" }, { ...valid, kind: "constructor" },
    { ...valid, kind: "toString" }, { ...valid, payload: undefined }, { v: 1, build: "synthetic-build", id: "1", kind: "test.ping" },
    { ...valid, origin: { kind: "background" } }, { ...valid, sender: tab }, { ...valid, result: { pong: "" } },
    { ...valid, kind: "test.add", payload: { video: "v", playlists: [Number.NaN] } },
    { ...valid, kind: "test.add", payload: { video: "v", playlists: [], origin: "background" } },
    Object.assign(Object.create({ inherited: true }), valid)
  ]
  for (const message of messages) expect(raw.receivers[0]!({ message, sender: tab })).toBeUndefined()
  expect(handled).toBe(0)
  expect(getters).toBe(0)
  expect(raw.receivers[0]!({ message: valid, sender: tab })).toBeInstanceOf(Promise)
})

test("never lets unrelated or malformed answers satisfy a pending call", async () => {
  const raw = stub()
  const time = clock()
  const rpc = createRpc(raw.transport, { build, contract, deadline: time.deadline })
  const header = { v: 1, build: "synthetic-build", kind: "test.ping" }
  const idOf = (message: unknown) => typeof message === "object" && message !== null && "id" in message && typeof message.id === "string" ? message.id : ""
  const answers: ((id: string) => unknown)[] = [
    () => undefined, () => null, () => "text", id => [{ ...header, id, result: { pong: "x" } }],
    id => ({ ...header, id: `${id}0`, result: { pong: "x" } }), () => ({ ...header, id: "1", result: { pong: "x" } }),
    id => ({ ...header, id, kind: "test.add", result: { pong: "x" } }), id => ({ ...header, id, build: "other-build", result: { pong: "x" } }),
    id => ({ ...header, id, v: 2, result: { pong: "x" } }), id => ({ ...header, id, result: { pong: 1 } }),
    id => ({ ...header, id, result: { pong: "x" }, extra: true }), id => ({ ...header, id, payload: null }),
    id => ({ ...header, id, result: { pong: "x" }, failure: "receiver" }), id => ({ ...header, id, failure: { message: "boom", stack: "trace" } })
  ]
  const outcomes: RpcOutcome<unknown>[] = []
  for (const answer of answers) {
    raw.answerWith(async message => answer(idOf(message)))
    outcomes.push(await rpc.call("test.ping", null))
  }
  expect(outcomes).toEqual(answers.map(() => ({ kind: "failed", failure: "invalid-answer" })))
  raw.answerWith(async message => ({ ...header, id: idOf(message), failure: "receiver" }))
  expect(await rpc.call("test.ping", null)).toEqual({ kind: "failed", failure: "receiver-failed" })
  raw.answerWith(async message => ({ ...header, id: idOf(message), result: { pong: "x" } }))
  expect(await rpc.call("test.ping", null)).toEqual({ kind: "answered", result: { pong: "x" } })
  expect(time.active()).toBe(0)
})

test("bounds an undelivered call with its kind's one-shot deadline and ignores the late answer", async () => {
  const { network, caller, time, seen } = setup("queued")
  let outcome: RpcOutcome<unknown> | undefined
  void caller.call("test.add", { video: "v1", playlists: ["a"] }).then(value => { outcome = value })
  time.advance(9_999)
  await flush()
  expect(outcome).toBeUndefined()
  time.advance(1)
  await flush()
  expect(outcome).toEqual({ kind: "failed", failure: "timeout" })
  network.queued()[0]!.deliver()
  await flush()
  expect(outcome).toEqual({ kind: "failed", failure: "timeout" })
  expect(seen).toHaveLength(1)
  expect(time.active()).toBe(0)
  expect(time.cancels()).toBe(1)
})

test("reports a rejected or lost send as a transport failure and never retries it", async () => {
  const { network, caller, seen, time } = setup("queued")
  const rejected = caller.call("test.add", { video: "v1", playlists: ["a"] })
  network.queued()[0]!.reject()
  expect(await rejected).toEqual({ kind: "failed", failure: "transport" })
  expect(sent(network)).toHaveLength(1)
  expect(network.queued()).toEqual([])
  const lost = caller.call("test.add", { video: "v2", playlists: ["a"] })
  network.queued()[0]!.lose()
  expect(await lost).toEqual({ kind: "failed", failure: "transport" })
  await flush()
  expect(seen).toEqual([{ payload: { video: "v2", playlists: ["a"] }, context: { tabId: 7 } }])
  expect(sent(network)).toHaveLength(2)
  expect(time.active()).toBe(0)
})

test("bounds a handler that never answers and turns a throwing handler into a fixed failure", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const time = clock()
  const caller = createRpc(network.connect(tab), { build, contract, deadline: time.deadline })
  const receiver = createRpc(network.connect(background), { build, contract, deadline: time.deadline })
  receiver.handle({
    authenticate: tabOnly,
    handlers: {
      "test.add": () => { throw Object.assign(new Error("secret input v1"), { stack: "synthetic stack" }) },
      "test.ping": () => new Promise(() => {})
    }
  })
  expect(await caller.call("test.add", { video: "v1", playlists: [] })).toEqual({ kind: "failed", failure: "receiver-failed" })
  expect(network.trace().at(-1)).toEqual({ event: "answered", to: 0, text: '{"v":1,"build":"synthetic-build","id":"1","kind":"test.add","failure":"receiver"}' })
  const hanging = caller.call("test.ping", null)
  time.advance(2_000)
  expect(await hanging).toEqual({ kind: "failed", failure: "timeout" })
  receiver.dispose()
  await flush()
  expect(network.trace().at(-1)).toEqual({ event: "answered", to: 0, text: null })
  expect(network.listening()).toBe(0)
})

test("publishes only the first of duplicate answers", async () => {
  const { network, caller, time } = setup()
  const settings = createRpc(network.connect({ context: "page", page: "settings" }), { build, contract, deadline: time.deadline })
  let duplicates = 0
  settings.handle({ authenticate: tabOnly, handlers: { "test.add": async () => { duplicates++; await flush(); return { added: 99 } }, "test.ping": () => ({ pong: "settings" }) } })
  expect(await caller.call("test.add", { video: "v1", playlists: ["a"] })).toEqual({ kind: "answered", result: { added: 1 } })
  await flush()
  await flush()
  expect(duplicates).toBe(1)
  expect(network.trace().filter(entry => entry.event !== "sent").map(entry => entry.event)).toEqual(["answered", "dropped"])
})

test("disposal settles pending calls once, cancels deadlines once and removes listeners", async () => {
  const { network, caller, receiver, time } = setup("queued")
  receiver.handle({ authenticate: tabOnly, handlers: { "test.add": () => ({ added: 0 }), "test.ping": () => ({ pong: "" }) } })
  expect(network.listening()).toBe(2)
  const first = caller.call("test.add", { video: "v1", playlists: [] })
  const second = caller.call("test.ping", null)
  caller.dispose()
  caller.dispose()
  expect(await first).toEqual({ kind: "failed", failure: "disposed" })
  expect(await second).toEqual({ kind: "failed", failure: "disposed" })
  expect(time.cancels()).toBe(2)
  for (const item of network.queued()) item.deliver()
  await flush()
  expect(await first).toEqual({ kind: "failed", failure: "disposed" })
  expect(await caller.call("test.ping", null)).toEqual({ kind: "failed", failure: "disposed" })
  expect(sent(network)).toHaveLength(2)
  receiver.dispose()
  expect(network.listening()).toBe(0)
  expect(receiver.handle({ authenticate: tabOnly, handlers: { "test.add": () => ({ added: 0 }), "test.ping": () => ({ pong: "" }) } })).toBeInstanceOf(Function)
  expect(network.listening()).toBe(0)
})

test("tolerates reentrant disposal from a deadline canceller and a listener disposer", async () => {
  const raw = stub()
  let cancels = 0
  const rpc = createRpc(raw.transport, {
    build, contract, deadline: () => () => { cancels++; rpc.dispose() }
  })
  const stop = rpc.handle({ authenticate: tabOnly, handlers: { "test.add": () => ({ added: 0 }), "test.ping": () => ({ pong: "" }) } })
  const calls = [rpc.call("test.ping", null), rpc.call("test.ping", null)]
  rpc.dispose()
  stop()
  expect(await Promise.all(calls)).toEqual([{ kind: "failed", failure: "disposed" }, { kind: "failed", failure: "disposed" }])
  expect(cancels).toBe(2)
  expect(raw.receivers).toHaveLength(0)
})

test("a receiver disposed during a pending handler never publishes its late result", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const time = clock()
  const caller = createRpc(network.connect(tab), { build, contract, deadline: time.deadline })
  const receiver = createRpc(network.connect(background), { build, contract, deadline: time.deadline })
  let finish: (value: { added: number }) => void = () => {}
  let authenticated: (value: Authentication<{ tabId: number }>) => void = () => {}
  let pingHandled = 0
  const stop = receiver.handle({
    authenticate: ({ sender, request }) => request.kind === "test.ping"
      ? new Promise<Authentication<{ tabId: number }>>(resolve => { authenticated = resolve })
      : tabOnly({ sender }),
    handlers: { "test.add": () => new Promise<{ added: number }>(resolve => { finish = resolve }), "test.ping": () => { pingHandled++; return { pong: "" } } }
  })
  const add = caller.call("test.add", { video: "v1", playlists: [] })
  const ping = caller.call("test.ping", null)
  await flush()
  stop()
  finish({ added: 5 })
  authenticated({ kind: "accepted", context: { tabId: 7 } })
  expect(await add).toEqual({ kind: "failed", failure: "invalid-answer" })
  expect(await ping).toEqual({ kind: "failed", failure: "invalid-answer" })
  await flush()
  expect(pingHandled).toBe(0)
  expect(network.trace().some(entry => entry.event === "answered" && entry.text?.includes('"added":5'))).toBe(false)
})

test("send-only callers answer synchronous delivery without registering or reading a listener", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const time = clock()
  const connection = network.connect(tab)
  let listenerReads = 0
  const target = {
    send: connection.send,
    get listen(): Transport<Sender>["listen"] { listenerReads++; throw new Error("Listener must not be read") }
  }
  const caller = createRpcCaller(target, { build, contract, deadline: time.deadline })
  expect(network.listening()).toBe(0)
  expect(Object.keys(caller).sort()).toEqual(["call", "dispose"])
  const receiver = createRpc(network.connect(background), { build, contract, deadline: time.deadline })
  receiver.handle({ authenticate: tabOnly, handlers: { "test.add": payload => ({ added: payload.playlists.length }), "test.ping": () => ({ pong: "sync" }) } })
  expect(await caller.call("test.ping", null)).toEqual({ kind: "answered", result: { pong: "sync" } })
  caller.dispose()
  caller.dispose()
  expect(await caller.call("test.ping", null)).toEqual({ kind: "failed", failure: "disposed" })
  expect(listenerReads).toBe(0)
  expect(network.listening()).toBe(1)
  expect(sent(network)).toHaveLength(1)
  expect(time.active()).toBe(0)
  expect(time.cancels()).toBe(1)
  receiver.dispose()
  expect(network.listening()).toBe(0)
})

test("send-only callers correlate overlap and never retry rejected, lost, timed out or disposed writes", async () => {
  const network = createMemoryNetwork<Sender>({ delivery: "queued" })
  const time = clock()
  const connection = network.connect(tab)
  const caller = createRpcCaller({ send: connection.send }, { build, contract, deadline: time.deadline })
  const receiver = createRpc(network.connect(background), { build, contract, deadline: time.deadline })
  const writes: string[] = []
  receiver.handle({ authenticate: tabOnly, handlers: {
    "test.add": payload => { writes.push(payload.video); return { added: payload.playlists.length } },
    "test.ping": () => ({ pong: "sync" })
  } })
  const add = (video: string, playlists: string[] = []) => caller.call("test.add", { video, playlists })
  const first = add("first", ["a"]), second = add("second", ["a", "b"])
  network.queued()[1]!.deliver()
  network.queued()[0]!.deliver()
  expect(await Promise.all([first, second])).toEqual([{ kind: "answered", result: { added: 1 } }, { kind: "answered", result: { added: 2 } }])
  const rejected = add("rejected")
  network.queued()[0]!.reject()
  expect(await rejected).toEqual({ kind: "failed", failure: "transport" })
  const lost = add("lost")
  network.queued()[0]!.lose()
  expect(await lost).toEqual({ kind: "failed", failure: "transport" })
  const timedOut = add("late")
  time.advance(10_000)
  expect(await timedOut).toEqual({ kind: "failed", failure: "timeout" })
  network.queued()[0]!.deliver()
  const disposed = add("disposed")
  caller.dispose()
  expect(await disposed).toEqual({ kind: "failed", failure: "disposed" })
  network.queued()[0]!.deliver()
  await flush()
  expect(writes).toEqual(["second", "first", "lost", "late", "disposed"])
  expect(sent(network)).toHaveLength(6)
  expect(network.queued()).toEqual([])
  expect(time.active()).toBe(0)
  expect(time.cancels()).toBe(6)
  expect(network.listening()).toBe(1)
  receiver.dispose()
  expect(network.listening()).toBe(0)
})

test("rejects accessor and non-JSON answers without invoking getters or exposing errors", async () => {
  const raw = stub()
  const time = clock()
  const caller = createRpcCaller({ send: raw.transport.send }, { build, contract, deadline: time.deadline })
  let getters = 0
  for (const result of [Object.defineProperty({}, "pong", { enumerable: true, get() { getters++; throw new Error("arbitrary synthetic text") } }), { pong: "x", unsafe: Number.NaN }, new Date(0)]) {
    raw.answerWith(async message => {
      if (!objectShape(message, { v: () => true, build: () => true, id: x => typeof x === "string", kind: () => true, payload: () => true })) throw new Error("Fixture envelope")
      return { v: 1, build, id: message.id, kind: "test.ping", result }
    })
    expect(await caller.call("test.ping", null)).toEqual({ kind: "failed", failure: "invalid-answer" })
  }
  raw.answerWith(() => { throw new Error("arbitrary synthetic text") })
  expect(await caller.call("test.ping", null)).toEqual({ kind: "failed", failure: "transport" })
  expect(getters).toBe(0)
  expect(time.cancels()).toBe(time.created())
})

test("body claims cannot select native sender context", async () => {
  type Claims = { "test.claim": { payload: { frameId: number; tabId: number }; result: { tabId: number } } }
  const claims: RpcContract<Claims> = {
    "test.claim": {
      payload: (v): v is Claims["test.claim"]["payload"] => objectShape(v, { frameId: x => typeof x === "number", tabId: x => typeof x === "number" }),
      result: (v): v is Claims["test.claim"]["result"] => objectShape(v, { tabId: x => typeof x === "number" }),
      timeoutMs: 2_000
    }
  }
  const network = createMemoryNetwork<Sender>({ delivery: "immediate" })
  const time = clock()
  const untrusted = createRpcCaller(network.connect({ context: "tab", tabId: 7, frameId: 3 }), { build, contract: claims, deadline: time.deadline })
  const trusted = createRpcCaller(network.connect(tab), { build, contract: claims, deadline: time.deadline })
  const receiver = createRpc(network.connect(background), { build, contract: claims, deadline: time.deadline })
  const contexts: number[] = []
  receiver.handle({ authenticate: tabOnly, handlers: { "test.claim": (_payload, context) => { contexts.push(context.tabId); return context } } })
  expect(await untrusted.call("test.claim", { frameId: 0, tabId: 999 })).toEqual({ kind: "failed", failure: "invalid-answer" })
  expect(contexts).toEqual([])
  expect(await trusted.call("test.claim", { frameId: 3, tabId: 999 })).toEqual({ kind: "answered", result: { tabId: 7 } })
  expect(contexts).toEqual([7])
  receiver.dispose()
  untrusted.dispose()
  trusted.dispose()
  expect(time.active()).toBe(0)
  expect(network.listening()).toBe(0)
})

test("reentrant calls from a listener disposer are already disposed", async () => {
  const time = clock()
  let sends = 0
  let reentrant: Promise<RpcOutcome<Calls["test.ping"]["result"]>> | undefined
  const transport: Transport<Sender> = {
    send: () => { sends++; return Promise.resolve(undefined) },
    listen: () => () => { reentrant = rpc.call("test.ping", null) }
  }
  const rpc = createRpc(transport, { build, contract, deadline: time.deadline })
  rpc.handle({ authenticate: tabOnly, handlers: { "test.add": () => ({ added: 0 }), "test.ping": () => ({ pong: "" }) } })
  rpc.dispose()
  expect(await reentrant).toEqual({ kind: "failed", failure: "disposed" })
  expect(sends).toBe(0)
  expect(time.created()).toBe(0)
})
