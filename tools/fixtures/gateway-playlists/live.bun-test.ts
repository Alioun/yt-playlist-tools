import { test } from "bun:test"
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
import { added, check, Clock, drain, identity, playlist, same, video } from "./specimens"

if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://www.youtube.com" })
const wwwWindow = new Proxy(window, { get(target, key) { return key === "location" ? { origin: "https://www.youtube.com" } : Reflect.get(target, key) } })
const musicWindow = new Proxy(window, { get(target, key) { return key === "location" ? { origin: "https://music.youtube.com" } : Reflect.get(target, key) } })
function installRoot(root: unknown) { Object.defineProperty(window, "default_kevlar_base", { configurable: true, value: root }) }
function spec() { const value = requestFor({ kind: "add", playlistId: playlist, videoId: video }, false); check(value, "Missing live dummy spec"); return value }
function context() {
  const notices: string[] = [], observed: unknown[] = []
  const port: AttemptContext = { check: () => null, notice: kind => notices.push(kind), observe: body => observed.push(body) }
  return { port, notices, observed }
}
function callback(options: unknown, kind: "onSuccess" | "onServerError", body: unknown) {
  const method = field(options, "commandController", kind)
  check(typeof method === "function", "Command callback was not supplied")
  Reflect.apply(method, undefined, [body])
}

test("www resolver is discovered by shape reports ambiguity and rescans only once", async () => {
  const page = scriptedPage(), observations: number[] = []
  const first = { resolveCommand(_cmd: unknown, options: unknown) { observations.push(1); callback(options, "onSuccess", added()) } }
  const second = { resolveCommand(_cmd: unknown, options: unknown) { observations.push(2); callback(options, "onSuccess", added()) } }
  const third = { resolveCommand(_cmd: unknown, options: unknown) { observations.push(3); callback(options, "onSuccess", added()) } }
  const root = { arbitraryBuildKey: { instance: first }, anotherBuildKey: { instance: second } }
  installRoot(root)
  const port = createLiveWwwRequests({ window: wwwWindow, document, page: page.port }), ctx = context()
  check(port.has("command"), "Resolver probe did not find shape")
  const one = await port.send("command", spec(), ctx.port)
  check(one.kind === "pending", "Command did not dispatch"); await one.answer; one.cancel()
  check(ctx.notices.includes("resolver-ambiguous"), "Ambiguous resolver was not reported after probe")
  Reflect.deleteProperty(first, "resolveCommand")
  const two = await port.send("command", spec(), ctx.port)
  check(two.kind === "pending", "Vanished resolver was not rediscovered"); await two.answer; two.cancel()
  Reflect.deleteProperty(second, "resolveCommand")
  Reflect.set(root, "thirdBuildKey", { instance: third })
  const gone = await port.send("command", spec(), ctx.port)
  check(gone.kind === "not-sent", "Resolver was rediscovered more than once")
  same(observations, [1, 2], "Resolver used a fixed key or wrong instance")
  Reflect.deleteProperty(window, "default_kevlar_base")
})

test("command callbacks settle once and rejected promises never trigger a second write", async () => {
  const page = scriptedPage(), clock = new Clock()
  let invocations = 0, lateOptions: unknown
  installRoot({ buildKey: { instance: { resolveCommand(_cmd: unknown, options: unknown) {
    invocations++; lateOptions = options
    return Promise.reject(new Error("Synthetic hook rejection"))
  } } } })
  const requests = createLiveWwwRequests({ window: wwwWindow, document, page: page.port })
  const gateway = createGateway({ site: wwwGateway, page: page.port, requests, clock })
  const result = await gateway.run({ kind: "add", playlistId: playlist, videoId: video })
  check(!result.ok && result.reason === "unconfirmed" && invocations === 1, "Rejected command retried a write")
  callback(lateOptions, "onSuccess", { ...identity("late-synthetic-account"), status: "STATUS_SUCCEEDED" })
  await drain()
  const later = await gateway.run({ kind: "membership", videoId: video })
  check(!later.ok && later.reason === "accountChanged", "Late native command answer did not latch identity")
  gateway.dispose(); check(clock.count === 0, "Command rejection leaked deadlines")
  Reflect.deleteProperty(window, "default_kevlar_base")
})

test("service request owns a hidden element and releases completion listeners", async () => {
  const page = scriptedPage(), clock = new Clock(), app = document.createElement("ytd-app")
  document.body.append(app)
  let calls = 0, target: EventTarget | null = null
  const listener: EventListener = event => {
    if (field(event, "detail", "actionName") !== "yt-service-request") return
    calls++; target = event.target
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
  } finally { gateway.dispose(); app.removeEventListener("yt-action", listener); app.remove() }
})

test("service timeout removes its node and an uncertain create is not retried", async () => {
  const page = scriptedPage(), clock = new Clock(), app = document.createElement("ytd-app")
  document.body.append(app)
  let actions = 0
  const listener = () => { actions++ }
  app.addEventListener("yt-action", listener)
  const native = createLiveWwwRequests({ window: wwwWindow, document, page: page.port })
  const gateway = createGateway({ site: wwwGateway, page: page.port, clock, requests: { has: via => via === "service", send: (...args) => native.send(...args) } })
  try {
    const pending = gateway.run({ kind: "create", title: "Created", privacy: "PRIVATE" })
    await drain(); same(app.children.length, 1, "Service node was never attached")
    clock.advance(5100); await drain()
    const result = await pending
    check(!result.ok && result.reason === "unconfirmed" && actions === 1 && app.children.length === 0, "Service timeout retried or leaked its node")
  } finally { gateway.dispose(); app.removeEventListener("yt-action", listener); app.remove() }
})

test("Music saves use networkManager fetch without response action replay or www signing", async () => {
  const page = scriptedPage(), clock = new Clock(), app = document.createElement("ytmusic-app")
  document.body.append(app)
  const calls: { path: unknown; body: unknown }[] = []
  let replayed = 0
  const manager = { fetch(path: unknown, body: unknown) {
    calls.push({ path, body })
    return Promise.resolve({ ...added(), onResponseReceivedCommands: [{ action() { replayed++ } }] })
  } }
  Reflect.set(app, "networkManager", manager)
  Reflect.set(app, "handlePlaylistEditEndpoint", () => { throw new Error("Noisy Music endpoint used") })
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
  } finally { gateway.dispose(); app.remove() }
})
