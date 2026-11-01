import type { JobFailure, Site } from "../../../src/shared/contracts"
import { isChannelId, isPlaylistId, isVideoId } from "../../../src/shared/model/validation"
import { isSetVideoId } from "../../../src/shared/contracts"
import { createGateway } from "../../../src/page/gateway"
import { scriptedPage, syntheticIdentity } from "../../../src/page/gateway.specimens"
import type { GatewayClock } from "../../../src/page/gateway/lanes"
import type { AttemptContext, Dispatch, GatewayRequestPort, HttpAnswer, RequestSpec, Transport } from "../../../src/page/gateway/port"

export function check(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code) }
export function same(actual: unknown, expected: unknown, code: string): void { check(JSON.stringify(actual) === JSON.stringify(expected), code) }
export function checked<T>(guard: (raw: unknown) => raw is T, raw: unknown): T { check(guard(raw), "Invalid synthetic input"); return raw }
export const playlist = checked(isPlaylistId, "PLsynthetic")
export const video = checked(isVideoId, "synthetic01")
export const secondVideo = checked(isVideoId, "synthetic02")
export const entry = checked(isSetVideoId, "synthetic-entry-1")
export const secondEntry = checked(isSetVideoId, "synthetic-entry-2")
export const channel = checked(isChannelId, `UC${"a".repeat(22)}`)
export const unavailable: JobFailure = { ok: false, reason: "unavailable" }
export const unconfirmed: JobFailure = { ok: false, reason: "unconfirmed" }
export function identity(id = syntheticIdentity) { return { responseContext: { mainAppWebResponseContext: { datasyncId: id } } } }
export function membership(contains = false, id = playlist) {
  return { ...identity(), contents: [{ playlistAddToPlaylistRenderer: { contents: [
    { playlistAddToOptionRenderer: { playlistId: id, title: { simpleText: "Synthetic list" }, privacy: "PRIVATE", videoCount: "3", containsSelectedVideos: contains } }
  ] } }] }
}
export function emptyMembership() { return { ...identity(), contents: [{ playlistAddToPlaylistRenderer: { contents: [] } }] } }
export function added(id: string | null = entry) {
  return { ...identity(), status: "STATUS_SUCCEEDED", playlistEditResults: [{ playlistEditVideoAddedResultData: { videoId: video, ...(id === null ? {} : { setVideoId: id }) } }] }
}
export function deferred<T>() {
  let resolve: (value: T) => void = () => {}, reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
export async function drain(): Promise<void> { for (let i = 0; i < 40; i++) await Promise.resolve() }
export class Clock implements GatewayClock {
  private at = 0
  private serial = 0
  private timers = new Map<number, { at: number; callback: () => void }>()
  now() { return this.at }
  after(ms: number, callback: () => void) {
    const id = ++this.serial
    this.timers.set(id, { at: this.at + ms, callback })
    return () => { this.timers.delete(id) }
  }
  advance(ms: number) {
    this.at += ms
    const ready = [...this.timers].filter(([, timer]) => timer.at <= this.at).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])
    for (const [id, timer] of ready) if (this.timers.delete(id)) timer.callback()
  }
  get count() { return this.timers.size }
}
export type Call = { via: Transport; spec: RequestSpec; context: AttemptContext }
export type Script = (call: Call) => Dispatch | Promise<Dispatch>
export function response(body: unknown, http = 200): Script {
  return () => ({ kind: "pending", answer: Promise.resolve({ http, body }), cancel() {} })
}
export function recorded(site: Site = "www") {
  const page = scriptedPage(), clock = new Clock(), calls: Call[] = [], scripts: Script[] = []
  const available = new Set<Transport>(site === "www" ? ["command", "service", "signed", "plain"] : ["music"])
  let cancellations = 0
  const port: GatewayRequestPort = {
    has: via => available.has(via),
    send(via, spec, context) {
      const call = { via, spec, context }; calls.push(call)
      const script = scripts.shift()
      if (!script) throw new Error("Missing deterministic request script")
      const result = script(call)
      const wrap = (dispatch: Dispatch): Dispatch => dispatch.kind === "pending" ? {
        ...dispatch, cancel() { cancellations++; dispatch.cancel() }
      } : dispatch
      return result instanceof Promise ? result.then(wrap) : wrap(result)
    }
  }
  const signals: unknown[] = []
  const gateway = createGateway({ site, page: page.port, requests: port, clock, signals: signal => signals.push(signal) })
  return { page, clock, calls, scripts, available, port, gateway, signals, get cancellations() { return cancellations } }
}
export function held(answer = deferred<HttpAnswer>()): { answer: ReturnType<typeof deferred<HttpAnswer>>; script: Script } {
  return { answer, script: () => ({ kind: "pending", answer: answer.promise, cancel() {} }) }
}
