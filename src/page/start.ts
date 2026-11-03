import { isPageType, parseJsonText, type BreakageSignal, type BuildId, type DiagnosticPageType, type Job, type PageType, type Site } from "../shared/contracts"
import { isPageRetireMessage, type PageHelloSnapshot, type PageJobResult, type PageNavigationType } from "../shared/contracts/page"
import { createDomPageChannel, pageJobsEvent, pageJobsPresenceEvent, pagePresenceEvent, type PageChannel } from "../shared/rpc/page-channel"
import { servePage, type PageEndpoint } from "./channel"
import { composeGateway, type Gateway } from "./compose"
import { systemClock, type GatewayClock } from "./gateway/lanes"
import { isJobsOffer, jobLimitMs, type JobContext, type Jobs, type JobsHost } from "./jobs-port"
import type { ReadGateway } from "./read-gateway"
import { readVocabulary } from "./read-port"

type LiveReads = { readonly gateway: ReadGateway; dispose(): void }
export type PageStartOptions = {
  readonly site: Site
  readonly build: BuildId
  readonly window: Window
  readonly document: Document
  readonly channel?: PageChannel
  readonly clock?: GatewayClock
  /** The site's live read half; each page half passes its own, so it bundles only its site's reads. */
  readonly createReads: (options: { window: Window; document: Document }) => LiveReads
}
type Waiting = { take(jobs: Jobs): void; fail(): void }

const navigationTypes: readonly PageNavigationType[] = ["navigate", "reload", "back_forward", "prerender"]

function navigationType(win: Window): PageNavigationType | null {
  try {
    const entry = win.performance.getEntriesByType("navigation")[0]
    const type: unknown = entry && "type" in entry ? entry.type : undefined
    return navigationTypes.find(known => known === type) ?? null
  } catch { return null }
}

function pageType(site: Site, location: Location): PageType {
  const path = location.pathname
  const type: DiagnosticPageType = path === "/watch" ? "watch" : path.startsWith("/shorts/") ? "shorts"
    : site === "music" ? "music-browse" : path === "/" ? "home" : path === "/results" ? "search" : "other"
  if (!isPageType(type)) throw new Error("Invalid page type")
  return type
}

/**
 * The jobs half as the page half holds it before its file loads (G42). The first job asks the core for the file and
 * waits. The file offers itself at this build and is taken only while asked for. Waiting jobs run once the core reports
 * that the background confirmed the load, each with what is left of its 10 s. A refusal, or no answer within 10 s,
 * fails them as never sent, and the next job asks again.
 */
function createJobsLoader(options: { site: Site; build: BuildId; clock: GatewayClock; ask(): void; host(): JobsHost }) {
  const { clock } = options
  const waiting = new Set<Waiting>()
  let jobs: Jobs | undefined
  let confirmed = false
  let asking = false
  let disposed = false
  let stopDeadline = () => {}

  function settle(ok: boolean): void {
    asking = false
    stopDeadline()
    confirmed = ok && jobs !== undefined
    const ready = confirmed ? jobs : undefined
    for (const entry of [...waiting]) {
      waiting.delete(entry)
      if (ready) entry.take(ready)
      else entry.fail()
    }
  }
  function use<T>(work: (jobs: Jobs, waited: number) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (disposed) return fallback()
    if (jobs && confirmed) return work(jobs, 0)
    const since = clock.now()
    return new Promise<T>(resolve => {
      waiting.add({ take: ready => resolve(work(ready, clock.now() - since)), fail: () => resolve(fallback()) })
      if (asking) return
      asking = true
      stopDeadline = clock.after(jobLimitMs, () => settle(false))
      try { options.ask() } catch { settle(false) }
    })
  }
  const loader: Jobs = {
    get vocabulary() { return jobs?.vocabulary ?? readVocabulary },
    run: <J extends Job>(job: J, ctx?: JobContext) => use((ready, waited) => ready.run(job, waited > 0 ? { ...ctx, budget: jobLimitMs - waited } : ctx),
      (): Promise<PageJobResult<J>> => Promise.resolve({ ok: false, reason: "unavailable" })),
    probe: () => use(ready => ready.probe(), () => Promise.reject(new Error("The jobs file is unavailable"))),
    dispose() {
      if (disposed) return
      disposed = true
      stopDeadline()
      for (const entry of [...waiting]) { waiting.delete(entry); entry.fail() }
      jobs?.dispose()
    }
  }
  return {
    loader,
    get attached() { return jobs !== undefined },
    offer(detail: unknown): void {
      if (disposed || !asking || jobs || !isJobsOffer(detail, options)) return
      try { jobs = detail.create(options.host()) } catch {}
    },
    loaded(ok: boolean): void {
      if (!disposed && asking) settle(ok)
    }
  }
}

/**
 * The page half (06 §6.5, ARC-MAN-10). It reads how the page started at document_start and then only listens. The read
 * half is made on the core's first frame, because YouTube's config, which pins the account, doesn't exist yet at
 * document_start. Every other job loads the jobs file first (G42).
 */
export function startPage(options: PageStartOptions): PageEndpoint {
  const { site, build, window: win, document: doc } = options
  const startedHidden = doc.visibilityState === "hidden"
  const navType = navigationType(win)
  const channel = options.channel ?? createDomPageChannel(doc)
  const sinks = new Set<(signal: BreakageSignal) => void>()
  let live: { reads: LiveReads; gateway: Gateway } | undefined
  let retired = false

  const jobs = createJobsLoader({ site, build, clock: options.clock ?? systemClock, ask: () => endpoint.need(),
    host: () => ({ window: win, document: doc, reads: made().reads.gateway }) })
  function made() {
    if (!live) {
      const reads = options.createReads({ window: win, document: doc })
      reads.gateway.onSignal(signal => { for (const sink of [...sinks]) sink(signal) })
      live = { reads, gateway: composeGateway(reads.gateway, jobs.loader) }
    }
    return live
  }
  function snapshot(): PageHelloSnapshot | undefined {
    const account = made().gateway.account
    return account ? { ...account, pageType: pageType(site, win.location), startedHidden, navType } : undefined
  }

  const endpoint = servePage({
    run: (job, context) => made().gateway.run(job, context),
    watch: (stream, onData) => made().gateway.watch(stream, onData),
    probe: () => made().gateway.probe()
  }, {
    site, build, snapshot,
    vocabulary: () => jobs.loader.vocabulary,
    loaded: ok => jobs.loaded(ok),
    signals(sink) {
      sinks.add(sink)
      return () => { sinks.delete(sink) }
    }
  }, channel)
  const answer = (event: Event, present: boolean) => {
    if (present && event instanceof CustomEvent && event.detail === build) event.preventDefault()
  }
  const listeners: [string, (event: Event) => void][] = [
    [pagePresenceEvent, event => answer(event, true)],
    [pageJobsPresenceEvent, event => answer(event, jobs.attached)],
    [pageJobsEvent, event => { if (event instanceof CustomEvent) jobs.offer(event.detail) }]
  ]
  for (const [type, listener] of listeners) doc.addEventListener(type, listener)
  function dispose() {
    if (retired) return
    retired = true
    stopRetire()
    for (const [type, listener] of listeners) doc.removeEventListener(type, listener)
    try { endpoint.dispose() } finally {
      try { jobs.loader.dispose() } finally { live?.reads.dispose() }
    }
  }
  const stopRetire = channel.listen("retire", detail => {
    const parsed = parseJsonText(detail)
    if (parsed.ok && isPageRetireMessage(parsed.value) && parsed.value.build !== build) dispose()
  })
  return { get disposed() { return endpoint.disposed }, dispose }
}
