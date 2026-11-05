import { afterEach, expect, test } from "bun:test"
import { createHash, webcrypto } from "node:crypto"
import { CONTRACT_VERSION, isBuildId, type BuildId, type Site } from "../shared/contracts"
import { isAccountKey, type AccountKey } from "../shared/model/validation"
import { createDirectPageChannel, pageJobsPresenceEvent, pagePresenceEvent } from "../shared/rpc/page-channel"
import { createPageLink } from "../site/core/page-link"
import { added, Clock, deferred, drain, playlist, video } from "../../tools/fixtures/gateway-playlists/specimens"
import { createLiveMusicJobs } from "./adapters/live-music-jobs"
import { createLiveMusicReads } from "./adapters/live-music-reads"
import { createLiveWwwJobs } from "./adapters/live-www-jobs"
import { createLiveWwwReads } from "./adapters/live-www-reads"
import { scriptedPage, syntheticIdentity } from "./gateway.specimens"
import { musicRoutes } from "./routes/music"
import { wwwRoutes } from "./routes/www"
import { vocabularyFor, type GatewayRequestPort, type RequestSpec } from "./gateway/port"
import { wwwGateway } from "./gateway/www"
import { createJobsGateway } from "./jobs-gateway"
import { offerJobs, type Jobs, type JobsHost } from "./jobs-port"
import { createReadGateway } from "./read-gateway"
import { startPage } from "./start"

function buildId(value: string): BuildId {
  if (!isBuildId(value)) throw new Error("Invalid build")
  return value
}
function accountKey(identity: string): AccountKey {
  const key = createHash("sha256").update(identity).digest("base64url").slice(0, 16)
  if (!isAccountKey(key)) throw new Error("Invalid account key")
  return key
}
const build = buildId("page-start-test")
const live = {
  www: { createReads: createLiveWwwReads, create: createLiveWwwJobs, vocabulary: vocabularyFor(wwwRoutes) },
  music: { createReads: createLiveMusicReads, create: createLiveMusicJobs, vocabulary: vocabularyFor(musicRoutes) }
}
const identity = "synthetic-identity||page-start"
const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  Reflect.deleteProperty(window, "ytcfg")
})
const here = (event: string, detail: string = build) => !document.dispatchEvent(new CustomEvent(event, { detail, cancelable: true }))
const settle = async () => {
  for (let turn = 0; turn < 5; turn++) {
    await drain()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function setConfig(config: Record<string, unknown> | undefined) {
  if (config === undefined) Reflect.deleteProperty(window, "ytcfg")
  else Object.assign(window, { ytcfg: { get: (key: string) => config[key] } })
}

/**
 * A tab with a live page half, the core's PageLink, and the background's side of `tab.need { jobs: true }`: it injects
 * the jobs file the way `Registrar.ensure` does, skipping it once the probe finds it, and answers with the probe.
 */
function liveTab(site: Site = "www") {
  const channel = createDirectPageChannel()
  let reads = 0,
    loads = 0
  const page = startPage({
    site,
    build,
    window,
    document,
    channel,
    createReads(options) {
      reads++
      return live[site].createReads(options)
    }
  })
  const link = createPageLink(
    {
      site,
      build,
      vocabulary: live[site].vocabulary,
      digest: bytes => webcrypto.subtle.digest("SHA-256", bytes),
      async loadJobs() {
        loads++
        if (!here(pageJobsPresenceEvent)) offerJobs(document, { site, build, create: live[site].create })
        return here(pageJobsPresenceEvent)
      }
    },
    channel
  )
  cleanups.push(
    () => link.dispose(),
    () => page.dispose()
  )
  return { page, channel, link, reads: () => reads, loads: () => loads }
}

/** The same tab on a scripted YouTube page, whose jobs file sends its requests to a recorded port. */
function scriptedTab(options: { load?: (inject: () => void) => Promise<void> } = {}) {
  const site: Site = "www"
  const scripted = scriptedPage()
  const clock = new Clock(),
    linkClock = new Clock()
  const channel = createDirectPageChannel()
  const sent: RequestSpec[] = []
  let answer: () => Promise<{ http: number; body: unknown }> = async () => ({ http: 200, body: added() })
  const made: Jobs[] = []
  const disposed: Jobs[] = []
  let needs = 0,
    injections = 0
  const requests: GatewayRequestPort = {
    has: via => via === "signed",
    send(_via, spec) {
      sent.push(spec)
      return { kind: "pending", answer: answer(), cancel() {} }
    }
  }
  function create(host: JobsHost): Jobs {
    const jobs = createJobsGateway({ site: wwwGateway, reads: host.reads, requests, clock })
    const tracked: Jobs = {
      vocabulary: jobs.vocabulary,
      run: (job, ctx) => jobs.run(job, ctx),
      probe: () => jobs.probe(),
      dispose() {
        disposed.push(tracked)
        jobs.dispose()
      }
    }
    made.push(tracked)
    return tracked
  }
  const inject = () => {
    injections++
    offerJobs(document, { site, build, create })
  }
  const page = startPage({
    site,
    build,
    window,
    document,
    channel,
    clock,
    createReads: () => {
      const gateway = createReadGateway({ site, page: scripted.port })
      return { gateway, dispose: () => gateway.dispose() }
    }
  })
  const link = createPageLink(
    {
      site,
      build,
      vocabulary: vocabularyFor(wwwRoutes),
      clock: linkClock,
      digest: bytes => webcrypto.subtle.digest("SHA-256", bytes),
      async loadJobs() {
        needs++
        if (!here(pageJobsPresenceEvent)) await (options.load ? options.load(inject) : Promise.resolve(inject()))
        return here(pageJobsPresenceEvent)
      }
    },
    channel
  )
  cleanups.push(
    () => link.dispose(),
    () => page.dispose()
  )
  const acct = accountKey(syntheticIdentity)
  return {
    scripted,
    clock,
    channel,
    page,
    link,
    sent,
    made,
    disposed,
    inject,
    needs: () => needs,
    injections: () => injections,
    answerWith(next: () => Promise<{ http: number; body: unknown }>) {
      answer = next
    },
    add: () => link.run({ job: { kind: "add", playlistId: playlist, videoId: video }, acct }),
    async ready() {
      await settle()
      expect(link.state.kind).toBe("ready")
    }
  }
}

test("the page half reads no YouTube config before the core asks, then answers hello with the hashed account", async () => {
  const channel = createDirectPageChannel()
  let reads = 0
  const page = startPage({
    site: "www",
    build,
    window,
    document,
    channel,
    createReads(options) {
      reads++
      return createLiveWwwReads(options)
    }
  })
  cleanups.push(() => page.dispose())
  expect(reads).toBe(0)
  setConfig({ LOGGED_IN: true, DATASYNC_ID: identity })
  const link = createPageLink({ site: "www", build, vocabulary: live.www.vocabulary, digest: bytes => webcrypto.subtle.digest("SHA-256", bytes) }, channel)
  cleanups.push(() => link.dispose())
  const hello = await link.hello
  expect(reads).toBe(1)
  expect(location.pathname).toBe("/watch")
  expect(hello).toEqual<unknown>({
    ok: true,
    snapshot: {
      signedIn: true,
      acct: accountKey(identity),
      pageType: "watch",
      startedHidden: false,
      navType: null
    }
  })
})

test("a probe loads the jobs file and passes the core's vocabulary check on both sites, signed out", async () => {
  for (const site of ["www", "music"] as const) {
    setConfig({ LOGGED_IN: false })
    const tab = liveTab(site)
    expect(await tab.link.hello).toMatchObject({ ok: true, snapshot: { signedIn: false, acct: null } })
    const probe = await tab.link.probe()
    expect([probe.ok, tab.loads(), tab.reads()]).toEqual([true, 1, 1])
    tab.page.dispose()
  }
})

test("without YouTube's config the page leaves hello unanswered instead of guessing an account", async () => {
  setConfig(undefined)
  const channel = createDirectPageChannel()
  const page = startPage({ site: "www", createReads: createLiveWwwReads, build, window, document, channel })
  cleanups.push(() => page.dispose())
  const answers: unknown[] = []
  channel.listen("res", detail => {
    answers.push(detail)
  })
  channel.send("req", JSON.stringify({ v: CONTRACT_VERSION, build, kind: "hello" }))
  expect(answers).toEqual([])
})

test("a page that runs no job never asks for the jobs file, whatever it reads or watches", async () => {
  const tab = scriptedTab()
  await tab.ready()
  const navigations: unknown[] = []
  const stop = tab.link.watch("nav", data => {
    navigations.push(data)
  })
  tab.scripted.emit("navigation")
  const current = await tab.link.run({ job: { kind: "videoInfo" } })
  stop()
  expect([current.ok, navigations.length]).toEqual([true, 1])
  expect([tab.needs(), tab.injections(), tab.made.length, here(pageJobsPresenceEvent)]).toEqual([0, 0, 0, false])
})

test("the first job loads the jobs file once, and later jobs reuse it", async () => {
  const tab = scriptedTab()
  await tab.ready()
  expect(await tab.add()).toMatchObject({ ok: true })
  expect(await tab.add()).toMatchObject({ ok: true })
  expect(await tab.link.run({ job: { kind: "channelOf", videoId: video } })).toMatchObject({ ok: true })
  expect([tab.needs(), tab.injections(), tab.made.length, tab.sent.length, here(pageJobsPresenceEvent)]).toEqual([1, 1, 1, 2, true])
})

test("jobs that arrive while the file loads wait, and none runs before the background confirms the load", async () => {
  const confirm = deferred<void>()
  const tab = scriptedTab({
    async load(inject) {
      inject()
      await confirm.promise
    }
  })
  await tab.ready()
  const first = tab.add(),
    second = tab.add()
  await settle()
  expect([tab.needs(), tab.made.length, here(pageJobsPresenceEvent), tab.sent.length]).toEqual([1, 1, true, 0])
  confirm.resolve()
  expect([await first, await second]).toMatchObject([{ ok: true }, { ok: true }])
  expect([tab.needs(), tab.injections(), tab.sent.length]).toEqual([1, 1, 2])
})

test("a refused load fails the waiting jobs as never sent, and the next job asks again", async () => {
  let refuse = true
  const tab = scriptedTab({
    async load(inject) {
      if (!refuse) inject()
    }
  })
  await tab.ready()
  expect(await tab.add()).toEqual({ ok: false, reason: "unavailable" })
  expect([tab.sent.length, tab.made.length]).toEqual([0, 0])
  refuse = false
  expect(await tab.add()).toMatchObject({ ok: true })
  expect([tab.needs(), tab.injections(), tab.sent.length]).toEqual([2, 1, 1])
})

test("a jobs file that loads after an account switch keeps the account the page loaded with, and sends nothing", async () => {
  const tab = scriptedTab()
  await tab.ready()
  tab.scripted.config.DATASYNC_ID = "SYNTHETIC-OTHER-IDENTITY"
  expect(await tab.add()).toEqual({ ok: false, reason: "accountChanged" })
  expect([tab.made.length, tab.sent.length, tab.link.state.kind]).toEqual([1, 0, "accountChanged"])
})

test("a jobs file from another build, or one nobody asked for, is never taken", async () => {
  const tab = scriptedTab({
    async load() {
      offerJobs(document, {
        site: "www",
        build: buildId("page-start-other"),
        create: () => {
          throw new Error("taken")
        }
      })
    }
  })
  await tab.ready()
  tab.inject()
  expect(here(pageJobsPresenceEvent)).toBe(false)
  expect(await tab.add()).toEqual({ ok: false, reason: "unavailable" })
  expect([tab.made.length, tab.sent.length, here(pageJobsPresenceEvent)]).toEqual([0, 0, false])
})

test("with no answer from the core within 10 s the waiting jobs fail as never sent, and the next job asks again", async () => {
  const late = deferred<void>()
  let hang = true
  const tab = scriptedTab({
    async load(inject) {
      if (hang) await late.promise
      else inject()
    }
  })
  await tab.ready()
  const stuck = tab.add()
  await settle()
  tab.clock.advance(10_000)
  expect(await stuck).toEqual({ ok: false, reason: "unavailable" })
  late.resolve()
  await settle()
  hang = false
  expect(await tab.add()).toMatchObject({ ok: true })
  expect([tab.needs(), tab.injections(), tab.sent.length]).toEqual([2, 1, 1])
})

test("waiting for the jobs file counts against the job's 10 s, so a late load leaves the job only the rest", async () => {
  const confirm = deferred<void>()
  const tab = scriptedTab({
    async load(inject) {
      await confirm.promise
      inject()
    }
  })
  await tab.ready()
  tab.answerWith(() => new Promise(() => {}))
  const job = tab.add()
  await settle()
  tab.clock.advance(9_000)
  confirm.resolve()
  await settle()
  expect(tab.sent.length).toBe(1)
  let answered: unknown
  void job.then(result => {
    answered = result
  })
  tab.clock.advance(1_001)
  await settle()
  expect(answered).toEqual({ ok: false, reason: "unconfirmed" })
})

test("a newer build's retire disposes the page half and its jobs file, and both presence answers go", async () => {
  const tab = scriptedTab()
  await tab.ready()
  await tab.add()
  tab.channel.send("retire", JSON.stringify({ v: CONTRACT_VERSION, build, kind: "retire" }))
  expect([tab.page.disposed, tab.disposed.length, here(pagePresenceEvent), here(pageJobsPresenceEvent)]).toEqual([false, 0, true, true])
  tab.channel.send("retire", JSON.stringify({ v: CONTRACT_VERSION, build: "page-start-next", kind: "retire" }))
  expect([tab.page.disposed, tab.disposed.length, here(pagePresenceEvent), here(pageJobsPresenceEvent)]).toEqual([true, 1, false, false])
})

test("the page half answers the background's presence checks for its own build only", () => {
  expect(here(pagePresenceEvent)).toBe(false)
  const channel = createDirectPageChannel()
  const page = startPage({ site: "www", createReads: createLiveWwwReads, build, window, document, channel })
  cleanups.push(() => page.dispose())
  expect([here(pagePresenceEvent), here(pagePresenceEvent, "another-build"), here(pageJobsPresenceEvent)]).toEqual([true, false, false])
})
