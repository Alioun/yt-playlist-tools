import { CONTRACT_VERSION, parseJsonText, supportsStream } from "../shared/contracts"
import type {
  BreakageSignal, BuildId, DiagnosticVocabulary, Job, MessageHeader, PageRequestId, PageWatchId, ProbeReport, Site,
  Stream, StreamData
} from "../shared/contracts"
import {
  isPageHelloAnswer, isPageProbeAnswerFor, isPageRequestMessage, isPageRetireMessage, isPageRunAnswerFor,
  isPageSignalEvent, isPageStreamEventFor
} from "../shared/contracts/page"
import type {
  PageGatewayMessage, PageHelloAnswer, PageHelloSnapshot, PageJobResult, PageProbeAnswer, PageRequestMessage,
  PageRunAnswer, PageSignalEvent
} from "../shared/contracts/page"
import type { PageChannel } from "../shared/rpc/page-channel"

export interface PageGatewayOperations {
  run<J extends Job>(job: J, ctx?: { target?: Element }): Promise<PageJobResult<J>>
  watch<S extends Stream>(stream: S, onData: (data: StreamData<S>) => void): () => void
  probe(): Promise<ProbeReport>
}
export type PageServeOptions = {
  site: Site
  build: BuildId
  vocabulary: DiagnosticVocabulary
  /** Undefined leaves `hello` unanswered, so PageLink times out instead of reading a wrong account. */
  snapshot: () => PageHelloSnapshot | undefined
  signals: (onSignal: (signal: BreakageSignal) => void) => () => void
}
export type PageEndpoint = { readonly disposed: boolean; dispose(): void }

type Watch = { id: PageWatchId; stream: Stream; released: boolean; stop?: () => void }

export function servePage(gateway: PageGatewayOperations, options: PageServeOptions, channel: PageChannel): PageEndpoint {
  const { site, build, vocabulary } = options
  const header: MessageHeader = { v: CONTRACT_VERSION, build }
  const watches = new Map<PageWatchId, Watch>()
  const owned: (() => void)[] = []
  let disposed = false

  function send(message: PageGatewayMessage): void {
    if (!disposed) channel.send("res", JSON.stringify(message))
  }
  function release(watch: Watch): void {
    if (watch.released) return
    watch.released = true
    if (watches.get(watch.id) === watch) watches.delete(watch.id)
    watch.stop?.()
  }
  function startWatch(id: PageWatchId, stream: Stream): void {
    const previous = watches.get(id)
    if (previous) release(previous)
    if (disposed || !supportsStream(site, stream)) return
    const watch: Watch = { id, stream, released: false }
    watches.set(id, watch)
    let stop: () => void
    try {
      stop = gateway.watch(stream, data => {
        if (watch.released || disposed) return
        const event = { ...header, kind: "stream" as const, id, data }
        if (isPageStreamEventFor({ id, stream }, event, build)) send(event)
      })
    } catch (error) {
      release(watch)
      throw error
    }
    if (watch.released) stop()
    else watch.stop = stop
  }
  function answerRun(id: PageRequestId, job: Job, target: Element | null): void {
    void gateway.run(job, target ? { target } : undefined).then(result => {
      const answer: PageRunAnswer = { ...header, kind: "run", id, result }
      if (isPageRunAnswerFor({ id, job }, answer, build)) send(answer)
    }).catch(() => {})
  }
  function answerProbe(id: PageRequestId): void {
    void gateway.probe().then(report => {
      const answer: PageProbeAnswer = { ...header, kind: "probe", id, report }
      if (isPageProbeAnswerFor({ id, site, watchIds: vocabulary.watchIds }, answer, build)) send(answer)
    }).catch(() => {})
  }
  function receive(message: PageRequestMessage, target: Element | null): void {
    switch (message.kind) {
      case "hello": {
        const snapshot = options.snapshot()
        if (!snapshot) return
        const answer: PageHelloAnswer = { ...header, kind: "hello", site, snapshot }
        if (isPageHelloAnswer(answer, { build, site })) send(answer)
        return
      }
      case "run": return answerRun(message.id, message.job, target)
      case "watch": return startWatch(message.id, message.stream)
      case "unwatch": {
        const watch = watches.get(message.id)
        if (watch) release(watch)
        return
      }
      case "probe": return answerProbe(message.id)
    }
  }
  function dispose(): void {
    if (disposed) return
    disposed = true
    const errors: unknown[] = []
    for (const stop of [...owned.splice(0), ...[...watches.values()].map(watch => () => release(watch))]) {
      try { stop() } catch (error) { errors.push(error) }
    }
    if (errors.length > 0) throw errors[0]
  }

  owned.push(channel.listen("req", (detail, target) => {
    if (disposed) return
    const parsed = parseJsonText(detail)
    if (parsed.ok && isPageRequestMessage(parsed.value, build)) receive(parsed.value, target)
  }))
  owned.push(channel.listen("retire", detail => {
    const parsed = parseJsonText(detail)
    if (parsed.ok && isPageRetireMessage(parsed.value) && parsed.value.build !== build) dispose()
  }))
  try {
    owned.push(options.signals(signal => {
      const event: PageSignalEvent = { ...header, kind: "signal", signal }
      if (isPageSignalEvent(event, { build, site, vocabulary })) send(event)
    }))
  } catch (error) {
    dispose()
    throw error
  }
  if (disposed) owned.splice(0).forEach(stop => stop())

  return {
    get disposed() { return disposed },
    dispose
  }
}
