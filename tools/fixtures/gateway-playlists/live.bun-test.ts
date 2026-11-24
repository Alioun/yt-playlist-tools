import { afterEach, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createLiveWwwRequests } from "../../../src/page/adapters/live-www"
import { createLiveMusicRequests } from "../../../src/page/adapters/live-music"
import { createGateway } from "../../../src/page/gateway"
import { wwwGateway } from "../../../src/page/gateway/www"
import { musicGateway } from "../../../src/page/gateway/music"
import { requestFor } from "../../../src/page/gateway/requests"
import type { AttemptContext } from "../../../src/page/gateway/port"
import { scriptedPage } from "../../../src/page/gateway.specimens"
import { field } from "../../../src/page/read-parsers"
import { added, check, Clock, drain, entry, identity, playlist, same, video } from "./specimens"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://www.youtube.com" })
const wwwWindow = new Proxy(window, {
  get(target, key) {
    return key === "location" ? { origin: "https://www.youtube.com" } : Reflect.get(target, key)
  }
})
function wwwWindowAt(now: () => number) {
  return new Proxy(window, {
    get(target, key) {
      return key === "location" ? { origin: "https://www.youtube.com" } : key === "performance" ? { now } : Reflect.get(target, key)
    }
  })
}
const musicWindow = new Proxy(window, {
  get(target, key) {
    return key === "location" ? { origin: "https://music.youtube.com" } : Reflect.get(target, key)
  }
})
const roots = ["default_kevlar_base", "default_base_module_set", "_F_toggles_default_base_module_set", "default_unrelated"]
function installRoot(root: unknown, name = "default_kevlar_base") {
  Object.defineProperty(window, name, { configurable: true, value: root })
}
afterEach(() => {
  for (const name of roots) Reflect.deleteProperty(window, name)
})
function spec() {
  const value = requestFor({ kind: "add", playlistId: playlist, videoId: video }, false)
  check(value, "Missing live dummy spec")
  return value
}
function context() {
  const notices: string[] = [],
    observed: unknown[] = []
  const port: AttemptContext = { check: () => null, notice: kind => notices.push(kind), observe: body => observed.push(body) }
  return { port, notices, observed }
}
function callback(options: unknown, kind: "onSuccess" | "onServerError", ...args: unknown[]) {
  const method = field(options, "commandController", kind)
  check(typeof method === "function", "Command callback was not supplied")
  Reflect.apply(method, undefined, args)
}

test("www resolver discovers constructor singletons, reports ambiguity and finds a replacement when its own has gone", async () => {
  const page = scriptedPage(),
    observations: number[] = []
  let at = 0
  const first = {
    resolveCommand(_cmd: unknown, options: unknown) {
      observations.push(1)
      callback(options, "onSuccess", added())
    }
  }
  const second = {
    resolveCommand(_cmd: unknown, options: unknown) {
      observations.push(2)
      callback(options, "onSuccess", added())
    }
  }
  const third = {
    resolveCommand(_cmd: unknown, options: unknown) {
      observations.push(3)
      callback(options, "onSuccess", added())
    }
  }
  class CommandResolver {
    static instance = first
  }
  const root = { arbitraryBuildKey: CommandResolver, anotherBuildKey: { instance: second } }
  installRoot(root)
  const port = createLiveWwwRequests({ window: wwwWindowAt(() => at), document, page: page.port }),
    ctx = context()
  check(port.has("command"), "Resolver probe did not find shape")
  const one = await port.send("command", spec(), ctx.port)
  check(one.kind === "pending", "Command did not dispatch")
  await one.answer
  one.cancel()
  check(ctx.notices.includes("resolver-ambiguous"), "Ambiguous resolver was not reported after probe")
  Reflect.deleteProperty(first, "resolveCommand")
  at = 1_000
  const two = await port.send("command", spec(), ctx.port)
  check(two.kind === "pending", "Vanished resolver was not rediscovered")
  await two.answer
  two.cancel()
  Reflect.deleteProperty(second, "resolveCommand")
  Reflect.set(root, "thirdBuildKey", { instance: third })
  at = 2_000
  const three = await port.send("command", spec(), ctx.port)
  check(three.kind === "pending", "A second replacement was never found")
  await three.answer
  three.cancel()
  same(observations, [1, 2, 3], "Resolver used a fixed key or wrong instance")
})

test("a missing resolver is looked for again later, but not on every call", async () => {
  const page = scriptedPage()
  const seen = { at: 0, scans: 0, sent: 0 }
  const scans = () => seen.scans
  const instance = {
    resolveCommand(_cmd: unknown, options: unknown) {
      seen.sent++
      callback(options, "onSuccess", added())
    }
  }
  const root = new Proxy<Record<string, unknown>>(
    {},
    {
      ownKeys(target) {
        seen.scans++
        return Reflect.ownKeys(target)
      }
    }
  )
  const port = createLiveWwwRequests({ window: wwwWindowAt(() => seen.at), document, page: page.port }),
    ctx = context()
  check(!port.has("command"), "A resolver was found before YouTube made its module root")
  installRoot(root)
  check(!port.has("command") && scans() === 0, "A miss was not remembered for a moment")
  seen.at = 300
  check(!port.has("command") && scans() === 1, "The module root was not scanned once YouTube made it")
  root.buildKey = { instance }
  for (let call = 0; call < 50; call++) check(!port.has("command"), "A resolver was found without looking")
  same(scans(), 1, "A missing resolver was scanned for on every call")
  seen.at = 600
  const found = await port.send("command", spec(), ctx.port)
  check(found.kind === "pending" && seen.sent === 1 && scans() === 2, "A resolver that arrived late was never found")
  await found.answer
  found.cancel()
  for (let call = 0; call < 50; call++) check(port.has("command"), "A found resolver was lost")
  same(scans(), 2, "A found resolver was scanned for again")
})

test("the resolver is found under whichever module root YouTube shipped", async () => {
  const page = scriptedPage(),
    ctx = context()
  let sent = 0
  const instance = {
    resolveCommand(_cmd: unknown, options: unknown) {
      sent++
      callback(options, "onSuccess", added())
    }
  }
  installRoot({ buildKey: { instance } }, "default_base_module_set")
  installRoot({ buildKey: { instance: { resolveCommand() {} } } }, "_F_toggles_default_base_module_set")
  installRoot("not a module root", "default_unrelated")
  const port = createLiveWwwRequests({ window: wwwWindow, document, page: page.port })
  check(port.has("command"), "The resolver was only looked for under one root name")
  const one = await port.send("command", spec(), ctx.port)
  check(one.kind === "pending" && sent === 1, "The command did not reach the resolver under the other root")
  await one.answer
  one.cancel()
  same(ctx.notices, [], "A lookalike outside the module roots was counted as a second resolver")
})

test("YouTube hands the command back before its answer, and the answer is the one that is read", async () => {
  const page = scriptedPage(),
    clock = new Clock()
  let kind: "onSuccess" | "onServerError" = "onSuccess",
    body: unknown = added()
  installRoot({
    buildKey: {
      instance: {
        resolveCommand(command: unknown, options: unknown) {
          callback(options, kind, command, body)
        }
      }
    }
  })
  const requests = createLiveWwwRequests({ window: wwwWindow, document, page: page.port })
  const gateway = createGateway({ site: wwwGateway, page: page.port, requests, clock })
  const saved = await gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  check(saved.ok && saved.data.setVideoId === entry, "The command was read as its own answer")
  kind = "onServerError"
  body = { error: { code: 409, message: "Synthetic refusal", status: "ABORTED" }, errorMetadata: { status: 409 } }
  const refused = await gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  check(!refused.ok && refused.reason === "failed" && refused.http === 409, "The refusal's HTTP code was not read from the answer")
  gateway.dispose()
  check(clock.count === 0, "Command answers leaked deadlines")
  Reflect.deleteProperty(window, "default_kevlar_base")
})

test("command callbacks settle once and rejected promises never trigger a second write", async () => {
  const page = scriptedPage(),
    clock = new Clock()
  let invocations = 0,
    lateOptions: unknown
  installRoot({
    buildKey: {
      instance: {
        resolveCommand(_cmd: unknown, options: unknown) {
          invocations++
          lateOptions = options
          return Promise.reject(new Error("Synthetic hook rejection"))
        }
      }
    }
  })
  const requests = createLiveWwwRequests({ window: wwwWindow, document, page: page.port })
  const gateway = createGateway({ site: wwwGateway, page: page.port, requests, clock })
  const result = await gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  check(!result.ok && result.reason === "unconfirmed" && invocations === 1, "Rejected command retried a write")
  callback(lateOptions, "onSuccess", { ...identity("late-synthetic-account"), status: "STATUS_SUCCEEDED" })
  await drain()
  const later = await gateway.run({ kind: "membership", videoId: video })
  check(!later.ok && later.reason === "accountChanged", "Late native command answer did not latch identity")
  gateway.dispose()
  check(clock.count === 0, "Command rejection leaked deadlines")
  Reflect.deleteProperty(window, "default_kevlar_base")
})

test("service request owns a hidden element and releases completion listeners", async () => {
  const page = scriptedPage(),
    clock = new Clock(),
    app = document.createElement("ytd-app")
  document.body.append(app)
  let calls = 0,
    target: EventTarget | null = null
  const listener: EventListener = event => {
    if (field(event, "detail", "actionName") !== "yt-service-request") return
    calls++
    target = event.target
    check(target instanceof HTMLElement && target.hidden && target.parentElement === app, "Service request did not use an owned hidden node")
    const args = field(event, "detail", "args")
    check(Array.isArray(args) && field(args[0], "createPlaylistServiceEndpoint", "videoIds") !== undefined, "Service create endpoint changed")
    target.dispatchEvent(new CustomEvent("yt-service-request-completed", { detail: { response: { ...identity(), playlistId: playlist } } }))
    target.dispatchEvent(new CustomEvent("yt-service-request-completed", { detail: { response: { ...identity(), playlistId: "PLwrong" } } }))
  }
  app.addEventListener("yt-action", listener)
  const requests = createLiveWwwRequests({ window: wwwWindow, document, page: page.port })
  const gateway = createGateway({ site: wwwGateway, page: page.port, requests, clock })
  try {
    const result = await gateway.run({ kind: "create", title: "Created", privacy: "PRIVATE", videoId: video })
    check(result.ok && result.data.playlistId === playlist && calls === 1 && app.children.length === 0, "Service completion did not settle once or clean its node")
    check(clock.count === 0, "Service completion leaked deadlines")
  } finally {
    gateway.dispose()
    app.removeEventListener("yt-action", listener)
    app.remove()
  }
})

test("service timeout removes its node and an uncertain create is not retried", async () => {
  const page = scriptedPage(),
    clock = new Clock(),
    app = document.createElement("ytd-app")
  document.body.append(app)
  let actions = 0
  const listener = () => {
    actions++
  }
  app.addEventListener("yt-action", listener)
  const native = createLiveWwwRequests({ window: wwwWindow, document, page: page.port })
  const gateway = createGateway({ site: wwwGateway, page: page.port, clock, requests: { has: via => via === "service", send: (...args) => native.send(...args) } })
  try {
    const pending = gateway.run({ kind: "create", title: "Created", privacy: "PRIVATE" })
    await drain()
    same(app.children.length, 1, "Service node was never attached")
    clock.advance(10_100)
    await drain()
    const result = await pending
    check(!result.ok && result.reason === "unconfirmed" && actions === 1 && app.children.length === 0, "Service timeout retried or leaked its node")
  } finally {
    gateway.dispose()
    app.removeEventListener("yt-action", listener)
    app.remove()
  }
})

test("Music saves use networkManager fetch without response action replay or www signing", async () => {
  const page = scriptedPage(),
    clock = new Clock(),
    app = document.createElement("ytmusic-app")
  document.body.append(app)
  const calls: { path: unknown; body: unknown }[] = []
  let replayed = 0
  const manager = {
    fetch(path: unknown, body: unknown) {
      calls.push({ path, body })
      return Promise.resolve({
        ...added(),
        onResponseReceivedCommands: [
          {
            action() {
              replayed++
            }
          }
        ]
      })
    }
  }
  Reflect.set(app, "networkManager", manager)
  Reflect.set(app, "handlePlaylistEditEndpoint", () => {
    throw new Error("Noisy Music endpoint used")
  })
  const requests = createLiveMusicRequests({ window: musicWindow, document })
  const gateway = createGateway({ site: musicGateway, page: page.port, requests, clock })
  try {
    check(!requests.has("signed") && !requests.has("command"), "Music exposed www transport")
    const result = await gateway.run({ kind: "save", playlistId: playlist, videoId: video })
    check(result.ok && replayed === 0 && calls.length === 1, "Music save replayed response actions")
    same(calls[0], { path: "/browse/edit_playlist", body: { playlistId: playlist, actions: [{ action: "ACTION_ADD_VIDEO", addedVideoId: video }], params: "IAE%3D" } }, "Music native request changed")
    Reflect.deleteProperty(manager, "fetch")
    const missing = await gateway.run({ kind: "save", playlistId: playlist, videoId: video })
    check(!missing.ok && missing.reason === "unavailable" && calls.length === 1, "Missing Music hook used a fallback")
  } finally {
    gateway.dispose()
    app.remove()
  }
})
