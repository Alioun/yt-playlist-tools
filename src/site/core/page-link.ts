import {
  CONTRACT_VERSION, isJobInvocation, isJobResultFor, isPageRequestId, isPageWatchId,
  isStream, parseJsonText, supportsJob, supportsStream
} from "../../shared/contracts"
import type {
  AccountData, BreakageSignal, BuildId, DiagnosticVocabulary, Job, JobFailure, JobInvocation,
  JobResult, MessageHeader, PageRequestId, PageWatchId, ProbeReport, Site, Stream, StreamData
} from "../../shared/contracts"
import {
  isPageHelloAnswer, isPageJobDataFor, isPageProbeAnswerFor, isPageRetireMessage,
  isPageRunAnswerFor, isPageSignalEvent, isPageStreamEventFor
} from "../../shared/contracts/page"
import type { PageAccountData, PageHelloSnapshot, PageRequestMessage } from "../../shared/contracts/page"
import { isAccountKey } from "../../shared/model/validation"
import type { PageChannel } from "../../shared/rpc/page-channel"

export type PageSnapshot = Readonly<AccountData & Pick<PageHelloSnapshot, "pageType" | "video" | "startedHidden" | "navType">>
export type PageLinkState =
  | { readonly kind: "connecting" }
  | { readonly kind: "ready"; readonly snapshot: PageSnapshot }
  | { readonly kind: "unavailable" | "accountChanged" | "disposed" }
export type PageHelloResult = { ok: true; snapshot: PageSnapshot } | JobFailure
export type PageProbeResult = { ok: true; report: ProbeReport } | JobFailure
export interface PageLinkClock {
  now(): number
  after(ms: number, callback: () => void): () => void
}
export type PageLinkOptions = {
  build: BuildId
  site: Site
  vocabulary: DiagnosticVocabulary
  clock?: PageLinkClock
  digest?: (bytes: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>
}
export interface PageLink {
  readonly state: PageLinkState
  readonly hello: Promise<PageHelloResult>
  run<J extends Job>(invocation: JobInvocation<J>, context?: { target?: Element }): Promise<JobResult<J>>
  probe(): Promise<PageProbeResult>
  watch<S extends Stream>(stream: S, onData: (data: StreamData<S>, stop: () => void) => void): () => void
  onState(listener: (state: PageLinkState) => void): () => void
  onSignal(listener: (signal: BreakageSignal) => void): () => void
  dispose(): void
}

type Receiver = { receive(value: unknown): void; cancel(): void }
const unavailable = (): JobFailure => ({ ok: false, reason: "unavailable" })
const unconfirmed = (): JobFailure => ({ ok: false, reason: "unconfirmed" })
const accountChanged = (): JobFailure => ({ ok: false, reason: "accountChanged" })
const systemClock: PageLinkClock = {
  now: () => performance.now(),
  after(ms, callback) {
    const timer = setTimeout(callback, ms)
    return () => clearTimeout(timer)
  }
}

function projectAccount(
  data: PageAccountData, digest: NonNullable<PageLinkOptions["digest"]>
): Promise<AccountData> {
  if (!data.signedIn) return Promise.resolve({ signedIn: false, acct: null })
  try {
    return digest(new TextEncoder().encode(data.datasyncId)).then(buffer => {
      const hashed = new Uint8Array(buffer)
      if (hashed.length !== 32) throw new Error("Invalid account digest")
      const key = btoa(String.fromCharCode(...hashed)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "").slice(0, 16)
      if (!isAccountKey(key)) throw new Error("Invalid account key")
      return { signedIn: true, acct: key }
    })
  } catch { return Promise.reject(new Error("Account digest unavailable")) }
}

export function createPageLink(options: PageLinkOptions, channel: PageChannel): PageLink {
  const { build, site, vocabulary } = options
  const clock = options.clock ?? systemClock
  const digest = options.digest ?? (bytes => crypto.subtle.digest("SHA-256", bytes))
  const header: MessageHeader = { v: CONTRACT_VERSION, build }
  const namespace = crypto.randomUUID()
  let serial = 0n
  let disposed = false
  let state: PageLinkState = Object.freeze({ kind: "connecting" })
  let revision = 0
  const pending = new Map<PageRequestId, Receiver>()
  const watches = new Map<PageWatchId, Receiver>()
  const stateListeners = new Set<(state: PageLinkState) => void>()
  const signalListeners = new Set<(signal: BreakageSignal) => void>()
  const owned: (() => void)[] = []
  const notify = <T>(listeners: Set<(value: T) => void>, value: T) => {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue
      try { listener(value) } catch { /* Consumer failures do not own transport teardown. */ }
    }
  }
  function publish(next: PageLinkState): void {
    if (disposed && next.kind !== "disposed") return
    state = Object.freeze(next)
    notify(stateListeners, state)
  }
  function send(message: PageRequestMessage): void {
    if (!disposed) channel.send("req", JSON.stringify(message))
  }
  function requestId(): PageRequestId {
    const value = `${namespace}:request:${++serial}`
    if (!isPageRequestId(value)) throw new Error("Invalid generated request ID")
    return value
  }
  function watchId(): PageWatchId {
    const value = `${namespace}:watch:${++serial}`
    if (!isPageWatchId(value)) throw new Error("Invalid generated watch ID")
    return value
  }
  function trip(): void {
    revision++
    publish({ kind: "accountChanged" })
  }
  function changedAccount(data: AccountData): boolean {
    if (state.kind !== "ready") return true
    return state.snapshot.signedIn !== data.signedIn || state.snapshot.acct !== data.acct
  }
  function subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void): () => void {
    if (disposed) return () => {}
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  let finishHello: (result: PageHelloResult) => void = () => {}
  const hello = new Promise<PageHelloResult>(resolve => { finishHello = resolve })
  const helloUntil = clock.now() + 2_000
  let helloOpen = true
  let helloClaimed = false
  let stopHelloTimer = () => {}
  function settleHello(result: PageHelloResult): void {
    if (!helloOpen) return
    helloOpen = false
    stopHelloTimer()
    if (!result.ok && state.kind === "connecting") publish({ kind: "unavailable" })
    finishHello(result)
  }
  function receiveHello(value: unknown): void {
    if (!helloOpen || helloClaimed || !isPageHelloAnswer(value, { build, site })) return
    if (clock.now() >= helloUntil) { settleHello(unavailable()); return }
    helloClaimed = true
    const ticket = ++revision
    const { pageType, video, startedHidden, navType } = value.snapshot
    void projectAccount(value.snapshot, digest).then(account => {
      if (disposed || !helloOpen || revision !== ticket || clock.now() >= helloUntil) return
      const snapshot: PageSnapshot = Object.freeze({ ...account, pageType, ...(video ? { video } : {}), startedHidden, navType })
      publish({ kind: "ready", snapshot })
      if (!disposed && revision === ticket) settleHello({ ok: true, snapshot })
    }).catch(() => {
      if (!disposed && helloOpen && revision === ticket) settleHello(unavailable())
    })
  }

  function run<J extends Job>(invocation: JobInvocation<J>, context?: { target?: Element }): Promise<JobResult<J>> {
    if (disposed || !isJobInvocation(invocation)) return Promise.resolve(unavailable())
    if (state.kind === "accountChanged") return Promise.resolve(accountChanged())
    if (state.kind !== "ready") return Promise.resolve(unavailable())
    const job = invocation.job
    if (!supportsJob(site, job.kind)) return Promise.resolve(unavailable())
    if (invocation.acct !== undefined) {
      if (!state.snapshot.signedIn) return Promise.resolve(unavailable())
      if (invocation.acct !== state.snapshot.acct) return Promise.resolve(accountChanged())
    }
    const id = requestId()
    const until = clock.now() + 10_000
    return new Promise(resolve => {
      let open = true
      let claimed = false
      let stopTimer = () => {}
      const finish = (result: JobResult<J>) => {
        if (!open) return
        open = false
        pending.delete(id)
        stopTimer()
        resolve(result)
      }
      const receiver: Receiver = {
        cancel: () => finish(unconfirmed()),
        receive(value) {
          if (!open || claimed || !isPageRunAnswerFor({ id, job }, value, build)) return
          if (clock.now() >= until) { finish(unconfirmed()); return }
          claimed = true
          if (invocation.acct !== undefined && state.kind !== "ready") {
            finish(state.kind === "accountChanged" ? accountChanged() : unavailable())
            return
          }
          const result = value.result
          if (!result.ok) {
            const projected = { ok: false, reason: result.reason,
              ...(result.http === undefined ? {} : { http: result.http }),
              ...(result.detail === undefined ? {} : { detail: result.detail }) }
            if (isJobResultFor(job, projected)) finish(projected)
            else finish(unavailable())
            if (result.reason === "accountChanged") trip()
            return
          }
          if (job.kind !== "account") {
            if (isJobResultFor(job, result)) finish(result)
            else finish(unavailable())
            return
          }
          if (!isPageJobDataFor({ kind: "account" }, result.data)) { finish(unavailable()); return }
          const ticket = ++revision
          const route = result.route
          void projectAccount(result.data, digest).then(account => {
            if (!open || disposed) return
            if (clock.now() >= until) { finish(unconfirmed()); return }
            if (revision !== ticket) { finish(unavailable()); return }
            if (changedAccount(account)) { finish(accountChanged()); trip(); return }
            const projected = { ok: true, data: account, route }
            if (isJobResultFor(job, projected)) finish(projected)
            else finish(unavailable())
          }).catch(() => {
            if (open && !disposed) {
              if (revision === ticket) publish({ kind: "unavailable" })
              finish(unavailable())
            }
          })
        }
      }
      pending.set(id, receiver)
      stopTimer = clock.after(10_000, () => finish(unconfirmed()))
      try { channel.send("req", JSON.stringify({ ...header, kind: "run", id, job }), context?.target) }
      catch { finish(unconfirmed()) }
    })
  }
  function probe(): Promise<PageProbeResult> {
    if (disposed || state.kind !== "ready") return Promise.resolve(unavailable())
    const id = requestId()
    const until = clock.now() + 2_000
    return new Promise(resolve => {
      let open = true
      let stopTimer = () => {}
      const finish = (result: PageProbeResult) => {
        if (!open) return
        open = false
        pending.delete(id)
        stopTimer()
        resolve(result)
      }
      pending.set(id, {
        cancel: () => finish(unavailable()),
        receive(value) {
          if (clock.now() >= until) { finish(unavailable()); return }
          if (isPageProbeAnswerFor({ id, site, watchIds: vocabulary.watchIds }, value, build)) finish({ ok: true, report: value.report })
        }
      })
      stopTimer = clock.after(2_000, () => finish(unavailable()))
      try { send({ ...header, kind: "probe", id }) } catch { finish(unavailable()) }
    })
  }
  function watch<S extends Stream>(stream: S, onData: (data: StreamData<S>, stop: () => void) => void): () => void {
    if (disposed || state.kind !== "ready" || !isStream(stream) || !supportsStream(site, stream)) return () => {}
    const id = watchId()
    let open = true
    const stop = () => {
      if (!open) return
      open = false
      watches.delete(id)
      try { channel.send("req", JSON.stringify({ ...header, kind: "unwatch", id })) } catch { /* Local release does not wait for a remote listener. */ }
    }
    watches.set(id, {
      cancel: stop,
      receive(value) {
        if (!open || !isPageStreamEventFor({ id, stream }, value, build)) return
        try { onData(value.data, stop) } catch { /* Each consumer owns its callback failure. */ }
      }
    })
    try { send({ ...header, kind: "watch", id, stream }) } catch { stop() }
    return stop
  }
  function dispose(): void {
    if (disposed) return
    disposed = true
    for (const receiver of [...watches.values()]) receiver.cancel()
    revision++
    settleHello(unavailable())
    for (const receiver of [...pending.values()]) receiver.cancel()
    for (const stop of owned.splice(0)) {
      try { stop() } catch { /* Continue releasing the remaining listeners. */ }
    }
    publish({ kind: "disposed" })
    stateListeners.clear()
    signalListeners.clear()
  }

  owned.push(channel.listen("res", detail => {
    if (disposed) return
    const parsed = parseJsonText(detail)
    if (!parsed.ok) return
    const value = parsed.value
    receiveHello(value)
    if (value !== null && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string") {
      if (isPageRequestId(value.id)) pending.get(value.id)?.receive(value)
      if (isPageWatchId(value.id)) watches.get(value.id)?.receive(value)
    }
    if (!disposed && isPageSignalEvent(value, { build, site, vocabulary })) notify(signalListeners, value.signal)
  }))
  owned.push(channel.listen("retire", detail => {
    const parsed = parseJsonText(detail)
    if (parsed.ok && isPageRetireMessage(parsed.value) && parsed.value.build !== build) dispose()
  }))
  stopHelloTimer = clock.after(2_000, () => settleHello(unavailable()))
  try {
    channel.send("retire", JSON.stringify({ ...header, kind: "retire" }))
    send({ ...header, kind: "hello" })
  } catch { settleHello(unavailable()) }
  return {
    get state() { return state }, hello, run, probe, watch, dispose,
    onState(listener) {
      const stop = subscribe(stateListeners, listener)
      try { listener(state) } catch { /* Subscription remains disposable after a consumer throws. */ }
      return stop
    },
    onSignal: listener => subscribe(signalListeners, listener)
  }
}
