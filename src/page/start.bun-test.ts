import { afterEach, expect, test } from "bun:test"
import { createHash, webcrypto } from "node:crypto"
import { CONTRACT_VERSION, isBuildId, type BuildId } from "../shared/contracts"
import { createDirectPageChannel, pagePresenceEvent } from "../shared/rpc/page-channel"
import { createPageLink } from "../site/core/page-link"
import { createLiveMusicGateway } from "./adapters/live-music-gateway"
import { createLiveWwwGateway } from "./adapters/live-www-gateway"
import { musicGateway } from "./gateway/music"
import { wwwGateway } from "./gateway/www"
import { startPage } from "./start"

function buildId(value: string): BuildId {
  if (!isBuildId(value)) throw new Error("Invalid build")
  return value
}
const build = buildId("page-start-test")
const sites = {
  www: { site: wwwGateway, createGateway: createLiveWwwGateway },
  music: { site: musicGateway, createGateway: createLiveMusicGateway }
}
const identity = "synthetic-identity||page-start"
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  Reflect.deleteProperty(window, "ytcfg")
})

function setConfig(config: Record<string, unknown> | undefined) {
  if (config === undefined) Reflect.deleteProperty(window, "ytcfg")
  else Object.assign(window, { ytcfg: { get: (key: string) => config[key] } })
}
function start(site: "www" | "music" = "www") {
  const channel = createDirectPageChannel()
  let gateways = 0
  const page = startPage({
    site: sites[site].site, build, window, document, channel,
    createGateway(options) { gateways++; return sites[site].createGateway(options) }
  })
  const link = () => {
    const created = createPageLink({ site, build, vocabulary: vocabularyOf(site), digest: bytes => webcrypto.subtle.digest("SHA-256", bytes) }, channel)
    cleanups.push(() => created.dispose())
    return created
  }
  cleanups.push(() => page.dispose())
  return { page, channel, link, gateways: () => gateways }
}
function vocabularyOf(site: "www" | "music") {
  const probe = sites[site].createGateway({ window, document })
  cleanups.push(() => probe.dispose())
  return probe.gateway.vocabulary
}

test("the page half reads no YouTube config before the core asks, then answers hello with the hashed account", async () => {
  const h = start()
  expect(h.gateways()).toBe(0)
  setConfig({ LOGGED_IN: true, DATASYNC_ID: identity })
  const link = h.link()
  const hello = await link.hello
  expect(h.gateways()).toBe(1)
  expect(location.pathname).toBe("/watch")
  expect(hello).toEqual<unknown>({ ok: true, snapshot: {
    signedIn: true, acct: createHash("sha256").update(identity).digest("base64url").slice(0, 16),
    pageType: "watch", startedHidden: false, navType: null
  } })
})

test("a signed-out page says so, and probes pass the core's vocabulary check on both sites", async () => {
  for (const site of ["www", "music"] as const) {
    setConfig({ LOGGED_IN: false })
    const link = start(site).link()
    expect(await link.hello).toMatchObject({ ok: true, snapshot: { signedIn: false, acct: null } })
    const probe = await link.probe()
    expect(probe.ok).toBe(true)
  }
})

test("without YouTube's config the page leaves hello unanswered instead of guessing an account", async () => {
  setConfig(undefined)
  const h = start()
  const answers: unknown[] = []
  h.channel.listen("res", detail => { answers.push(detail) })
  h.channel.send("req", JSON.stringify({ v: CONTRACT_VERSION, build, kind: "hello" }))
  expect(answers).toEqual([])
})

test("a newer build's retire disposes the page half and its gateway, and the same build's does not", () => {
  setConfig({ LOGGED_IN: false })
  const disposed: string[] = []
  const channel = createDirectPageChannel()
  const page = startPage({ site: wwwGateway, build, window, document, channel, createGateway(options) {
    const live = createLiveWwwGateway(options)
    return { gateway: live.gateway, dispose() { disposed.push("gateway"); live.dispose() } }
  } })
  cleanups.push(() => page.dispose())
  channel.send("req", JSON.stringify({ v: CONTRACT_VERSION, build, kind: "hello" }))
  channel.send("retire", JSON.stringify({ v: CONTRACT_VERSION, build, kind: "retire" }))
  expect([page.disposed, disposed]).toEqual([false, []])
  channel.send("retire", JSON.stringify({ v: CONTRACT_VERSION, build: "page-start-next", kind: "retire" }))
  expect([page.disposed, disposed]).toEqual([true, ["gateway"]])
})

test("the page half answers the background's presence check for its own build only, until retired", () => {
  const here = (detail: string) => !document.dispatchEvent(new CustomEvent(pagePresenceEvent, { detail, cancelable: true }))
  expect(here(build)).toBe(false)
  const channel = createDirectPageChannel()
  const page = startPage({ site: wwwGateway, createGateway: createLiveWwwGateway, build, window, document, channel })
  cleanups.push(() => page.dispose())
  expect([here(build), here("another-build")]).toEqual([true, false])
  channel.send("retire", JSON.stringify({ v: CONTRACT_VERSION, build: "page-start-next", kind: "retire" }))
  expect(here(build)).toBe(false)
})
