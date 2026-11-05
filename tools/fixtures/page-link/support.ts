import { createHash } from "node:crypto"
import { isAccountKey } from "../../../src/shared/model/validation"
import { CONTRACT_VERSION, isBuildId, isJobInvocation, isPageType, isProbeReport, isRouteId, isStreamData, isWatchId, parseJsonText } from "../../../src/shared/contracts"
import type { BreakageSignal, Job, JsonValue, Stream, StreamData } from "../../../src/shared/contracts"
import { isPageJobResultFor } from "../../../src/shared/contracts/page"
import type { PageHelloSnapshot, PageJobResult } from "../../../src/shared/contracts/page"
import { servePage, type PageGatewayOperations } from "../../../src/page/channel"
import { createDirectPageChannel, createDomPageChannel, type PageChannel, type PageWire } from "../../../src/shared/rpc/page-channel"
import { createPageLink, type PageLinkClock, type PageLinkOptions } from "../../../src/site/core/page-link"

export function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error("Invalid synthetic fixture")
  return value
}
export const build = checked(isBuildId, "page-link-fixture")
export const nextBuild = checked(isBuildId, "page-link-next")
export const route = checked(isRouteId, "fixture-route")
export const dependency = checked(isWatchId, "fixture-watch")
export const vocabulary = { routes: [route], watchIds: [dependency], schemaKeys: [] }
export const rawIdentity = "synthetic-whole||account/雪/Ω"
export const expectedKey = (identity: string) => checked(isAccountKey, createHash("sha256").update(identity, "utf8").digest("base64url").slice(0, 16))
export const header = { v: CONTRACT_VERSION, build }
export const nav = { pageType: checked(isPageType, "WATCH"), video: null, navigation: { kind: "other" as const } }
export const syntheticSignal: BreakageSignal = {
  site: "www",
  feature: null,
  job: null,
  route,
  kind: "timeout",
  watchId: null,
  shape: null,
  clientVersion: "2.0.0",
  pageType: "watch",
  count: 1,
  firstSeen: 0,
  lastSeen: 0
}
export const snapshot = (identity: string | null = rawIdentity): PageHelloSnapshot => ({
  ...(identity === null ? ({ signedIn: false, datasyncId: null } as const) : ({ signedIn: true, datasyncId: identity } as const)),
  pageType: checked(isPageType, "WATCH"),
  startedHidden: true,
  navType: "reload"
})
export const invocation = (value: unknown) => checked(isJobInvocation, value)
export const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))
export function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
export class ManualClock implements PageLinkClock {
  private at = 0
  private id = 0
  private timers = new Map<number, { at: number; callback(): void }>()
  now = () => this.at
  after(ms: number, callback: () => void) {
    const id = ++this.id
    this.timers.set(id, { at: this.at + ms, callback })
    return () => {
      this.timers.delete(id)
    }
  }
  advance(ms: number) {
    this.at += ms
    for (const [id, timer] of [...this.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (this.timers.has(id) && timer.at <= this.at) {
        this.timers.delete(id)
        timer.callback()
      }
    }
  }
  jump(ms: number) {
    this.at += ms
  }
  get count() {
    return this.timers.size
  }
}
export function trackedChannel(inner: PageChannel) {
  const frames: { wire: PageWire; text: string; target?: Element }[] = []
  const listeners = new Set<() => void>()
  const channel: PageChannel = {
    send(wire, text, target) {
      frames.push({ wire, text, target })
      inner.send(wire, text, target)
    },
    listen(wire, listener) {
      const stop = inner.listen(wire, listener)
      const release = () => {
        listeners.delete(release)
        stop()
      }
      listeners.add(release)
      return release
    }
  }
  return {
    channel,
    frames,
    get listenerCount() {
      return listeners.size
    }
  }
}
export function harness(
  options: {
    dom?: boolean
    channel?: PageChannel
    pageSnapshot?: () => PageHelloSnapshot
    link?: Partial<PageLinkOptions>
    run?: (job: Job, context?: { target?: Element }) => Promise<unknown>
    initial?: unknown
    throwingWatch?: boolean
    probe?: () => Promise<unknown>
  } = {}
) {
  const tracked = trackedChannel(options.channel ?? (options.dom ? createDomPageChannel(document) : createDirectPageChannel()))
  const clock = new ManualClock()
  const calls: { job: Job; context?: { target?: Element } }[] = []
  const watchers: { stream: Stream; emit(data: unknown): void; stops: number }[] = []
  const signals = new Set<(value: BreakageSignal) => void>()
  let signalStops = 0
  const gateway: PageGatewayOperations = {
    async run<J extends Job>(job: J, context?: { target?: Element }): Promise<PageJobResult<J>> {
      calls.push({ job, context })
      const answer = options.run
        ? await options.run(job, context)
        : job.kind === "account"
          ? { ok: true, data: { signedIn: true, datasyncId: rawIdentity }, route }
          : job.kind === "openCardMenu"
            ? { ok: true, data: null, route }
            : { ok: false, reason: "unavailable" }
      if (!isPageJobResultFor(job, answer)) throw new Error("Invalid synthetic gateway answer")
      return answer
    },
    watch<S extends Stream>(stream: S, listener: (value: StreamData<S>) => void) {
      if (options.throwingWatch) throw new Error("Synthetic watch failure")
      const watcher = {
        stream,
        stops: 0,
        emit(value: unknown) {
          if (isStreamData(stream, value)) listener(value)
        }
      }
      watchers.push(watcher)
      if (options.initial !== undefined) watcher.emit(options.initial)
      return () => {
        watcher.stops++
      }
    },
    async probe() {
      const report = options.probe ? await options.probe() : { site: "www", entries: [{ id: dependency, present: true }] }
      if (!isProbeReport(report)) throw new Error("Invalid synthetic probe")
      return report
    }
  }
  const endpoint = servePage(
    gateway,
    {
      site: options.link?.site ?? "www",
      build: options.link?.build ?? build,
      vocabulary: () => vocabulary,
      snapshot: options.pageSnapshot ?? (() => snapshot()),
      signals(listener) {
        signals.add(listener)
        return () => {
          signals.delete(listener)
          signalStops++
        }
      }
    },
    tracked.channel
  )
  const link = createPageLink({ build, site: "www", vocabulary, clock, ...options.link }, tracked.channel)
  const messages = (kind: string): JsonValue[] =>
    tracked.frames.flatMap(frame => {
      if (frame.wire !== "req") return []
      const parsed = parseJsonText(frame.text)
      return parsed.ok && parsed.value !== null && typeof parsed.value === "object" && !Array.isArray(parsed.value) && parsed.value.kind === kind ? [parsed.value] : []
    })
  return {
    link,
    endpoint,
    clock,
    calls,
    watchers,
    tracked,
    messages,
    signals,
    get signalStops() {
      return signalStops
    },
    dispose() {
      link.dispose()
      endpoint.dispose()
    }
  }
}
