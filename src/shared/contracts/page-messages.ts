import type { BuildId, Site, Stream } from "./vocabulary"
import { isBuildId, isSite, isStream } from "./vocabulary"
import type { MessageHeader } from "./protocol"
import { CONTRACT_VERSION, inspectMessageHeader } from "./protocol"
import type { Job } from "./jobs"
import { isJob } from "./jobs"
import type { PageAccountData, PageJobResult } from "./page"
import { isPageJobDataFor, isPageJobResultFor } from "./page"
import type { PageType } from "./identifiers"
import { isPageType } from "./identifiers"
import type { VideoInfo } from "./media"
import { isVideoInfo } from "./media"
import type { StreamData } from "./streams"
import { isStreamData } from "./streams"
import type { PageRequestId, PageWatchId } from "./page-ids"
import { isPageRequestId, isPageWatchId } from "./page-ids"
import type { WatchId, ProbeReport, BreakageSignal, DiagnosticVocabulary } from "./diagnostics"
import { isProbeReportFor, isBreakageSignal } from "./diagnostics"
import { objectShape } from "./object-shape"
import type { JsonObject } from "./json"

export type PageNavigationType = "navigate" | "reload" | "back_forward" | "prerender"
export type PageHelloSnapshot = PageAccountData & {
  pageType: PageType
  video?: VideoInfo
  startedHidden: boolean
  navType: PageNavigationType | null
}
export type PageHelloAnswer = MessageHeader & { kind: "hello"; site: Site; snapshot: PageHelloSnapshot }
export type PageRequestPayloadByKind = {
  hello: Record<never, never>
  run: { id: PageRequestId; job: Job }
  watch: { id: PageWatchId; stream: Stream }
  unwatch: { id: PageWatchId }
  probe: { id: PageRequestId }
}
export type PageRequestMessage = {
  [K in keyof PageRequestPayloadByKind]: MessageHeader & { kind: K } & PageRequestPayloadByKind[K]
}[keyof PageRequestPayloadByKind]
export type PageRetireMessage = MessageHeader & { kind: "retire" }
export type PageCoreMessage = PageRequestMessage | PageRetireMessage
export type PageRunAnswer<J extends Job = Job> = MessageHeader & {
  kind: "run"; id: PageRequestId; result: PageJobResult<J>
}
export type PageStreamEvent<S extends Stream = Stream> = {
  [K in S]: MessageHeader & { kind: "stream"; id: PageWatchId; data: StreamData<K> }
}[S]
export type PageProbeAnswer = MessageHeader & { kind: "probe"; id: PageRequestId; report: ProbeReport }
export type PageSignalEvent = MessageHeader & { kind: "signal"; signal: BreakageSignal }
export type PageAnswerByKind = {
  hello: PageHelloAnswer
  run: PageRunAnswer
  stream: PageStreamEvent
  probe: PageProbeAnswer
  signal: PageSignalEvent
}
export type PageGatewayMessage = PageAnswerByKind[keyof PageAnswerByKind]

function envelope(
  value: unknown, build: BuildId, kind: string, fields: Record<string, (value: unknown) => boolean>
): value is JsonObject {
  return inspectMessageHeader(value, build).kind === "ok" && objectShape(value, {
    v: v => v === CONTRACT_VERSION, build: v => v === build, kind: v => v === kind, ...fields
  })
}

export function isPageRequestMessage(value: unknown, expectedBuild: BuildId): value is PageRequestMessage {
  try {
    if (inspectMessageHeader(value, expectedBuild).kind !== "ok" || value === null ||
        typeof value !== "object" || !Object.hasOwn(value, "kind")) return false
    const kind: unknown = Object.getOwnPropertyDescriptor(value, "kind")?.value
    switch (kind) {
      case "hello": return envelope(value, expectedBuild, "hello", {})
      case "run": return envelope(value, expectedBuild, "run", { id: isPageRequestId, job: isJob })
      case "watch": return envelope(value, expectedBuild, "watch", { id: isPageWatchId, stream: isStream })
      case "unwatch": return envelope(value, expectedBuild, "unwatch", { id: isPageWatchId })
      case "probe": return envelope(value, expectedBuild, "probe", { id: isPageRequestId })
      default: return false
    }
  } catch { return false }
}

function helloSnapshot(value: unknown): value is PageHelloSnapshot {
  return objectShape(value, {
    signedIn: v => typeof v === "boolean", datasyncId: v => v === null || typeof v === "string",
    pageType: isPageType, startedHidden: v => typeof v === "boolean",
    navType: v => v === null || v === "navigate" || v === "reload" || v === "back_forward" || v === "prerender"
  }, { video: isVideoInfo }) && isPageJobDataFor({ kind: "account" }, {
    signedIn: value.signedIn, datasyncId: value.datasyncId
  })
}
export function isPageHelloAnswer(value: unknown, expected: { build: BuildId; site: Site }): value is PageHelloAnswer {
  return envelope(value, expected.build, "hello", { site: v => isSite(v) && v === expected.site, snapshot: helloSnapshot })
}
export function isPageRunAnswerFor<J extends Job>(
  pending: { id: PageRequestId; job: J }, value: unknown, expectedBuild: BuildId
): value is PageRunAnswer<J> {
  return envelope(value, expectedBuild, "run", {
    id: v => isPageRequestId(v) && v === pending.id, result: v => isPageJobResultFor(pending.job, v)
  })
}
export function isPageStreamEventFor<S extends Stream>(
  watch: { id: PageWatchId; stream: S }, value: unknown, expectedBuild: BuildId
): value is PageStreamEvent<S> {
  return envelope(value, expectedBuild, "stream", {
    id: v => isPageWatchId(v) && v === watch.id, data: v => isStreamData(watch.stream, v)
  })
}
export function isPageProbeAnswerFor(
  pending: { id: PageRequestId; site: Site; watchIds: readonly WatchId[] }, value: unknown, expectedBuild: BuildId
): value is PageProbeAnswer {
  return envelope(value, expectedBuild, "probe", {
    id: v => isPageRequestId(v) && v === pending.id, report: v => isProbeReportFor(pending, v)
  })
}
export function isPageSignalEvent(
  value: unknown, expected: { build: BuildId; site: Site; vocabulary: DiagnosticVocabulary }
): value is PageSignalEvent {
  return envelope(value, expected.build, "signal", {
    signal: v => isBreakageSignal(v, expected.vocabulary) && v.site === expected.site
  })
}
export function isPageRetireMessage(value: unknown): value is PageRetireMessage {
  return objectShape(value, { v: v => v === CONTRACT_VERSION, build: isBuildId, kind: v => v === "retire" })
}
