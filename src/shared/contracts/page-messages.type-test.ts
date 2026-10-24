import type {
  BuildId, RouteId, PageRequestId, PageWatchId, WatchId, Job, JobOf, JobId, JobInputById, JobDataById,
  JobData, JobResult, MembershipRow, Stream, StreamDataById, StreamData, JobInvocation
} from "./index"
import type {
  PageHelloSnapshot, PageHelloAnswer, PageRequestPayloadByKind, PageCoreMessage,
  PageAnswerByKind, PageGatewayMessage, PageRunAnswer, PageStreamEvent, PageJobData, PageAccountData
} from "./page"
import { isPageHelloAnswer, isPageRunAnswerFor, isPageStreamEventFor } from "./page"
import type { AccountKey, VideoId, PlaylistId } from "../model"
// @ts-expect-error Raw hello snapshots belong to the page entrypoint.
import type { PageHelloSnapshot as RootHelloSnapshot } from "./index"
// @ts-expect-error Raw hello answers belong to the page entrypoint.
import type { PageHelloAnswer as RootHelloAnswer } from "./index"
// @ts-expect-error The complete page map belongs to the page entrypoint.
import type { PageGatewayMessage as RootGatewayMessage } from "./index"
// @ts-expect-error Raw contextual guards belong to the page entrypoint.
import { isPageRunAnswerFor as rootRunGuard } from "./index"
// @ts-expect-error Hello guards belong to the page entrypoint.
import { isPageHelloAnswer as rootHelloGuard } from "./index"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type Distinct<A, B> = A extends B ? false : B extends A ? false : true
type Pairwise<Values extends unknown[]> = Values extends [infer Head, ...infer Tail]
  ? Distinct<Head, Tail[number]> extends true ? Pairwise<Tail> : false : true
type PageReads = { kind: "account" | "accountLabel" }
export type PageRelationships = [
  Assert<Equal<keyof PageRequestPayloadByKind, "hello" | "run" | "watch" | "unwatch" | "probe">>,
  Assert<Equal<PageCoreMessage["kind"], "hello" | "run" | "watch" | "unwatch" | "probe" | "retire">>,
  Assert<Equal<keyof PageAnswerByKind, "hello" | "run" | "stream" | "probe" | "signal">>,
  Assert<Equal<PageGatewayMessage["kind"], keyof PageAnswerByKind>>,
  Assert<Equal<keyof JobInputById, JobId>>,
  Assert<Equal<keyof JobDataById, JobId>>,
  Assert<Equal<keyof StreamDataById, Stream>>,
  Assert<Equal<Extract<PageRunAnswer<JobOf<"membership">>["result"], { ok: true }>["data"], MembershipRow[]>>,
  Assert<Equal<PageJobData<PageReads>, PageAccountData | JobData<JobOf<"accountLabel">>>>,
  Assert<Equal<PageJobData<Job>, PageAccountData | JobData<Exclude<Job, JobOf<"account">>>>>,
  Assert<Equal<Extract<PageHelloSnapshot, { signedIn: true }>["datasyncId"], string>>,
  Assert<Equal<PageStreamEvent<"queue">["data"], StreamData<"queue">>>,
  Assert<Pairwise<[PageRequestId, PageWatchId, WatchId, RouteId, BuildId, VideoId, PlaylistId, AccountKey]>>
]

declare const build: BuildId
declare const id: PageRequestId
declare const subscription: PageWatchId
declare const dependency: WatchId
declare const route: RouteId
declare const acct: AccountKey
declare const video: VideoId

export function pageIdentifierRelationships() {
  // @ts-expect-error A subscription cannot correlate a request.
  const request: PageRequestId = subscription
  // @ts-expect-error A dependency cannot identify a subscription.
  const watch: PageWatchId = dependency
  // @ts-expect-error A build cannot identify a dependency.
  const staticWatch: WatchId = build
  // @ts-expect-error A route cannot identify a request.
  const routeRequest: PageRequestId = route
  // @ts-expect-error A model ID cannot identify a request.
  const videoRequest: PageRequestId = video
  // @ts-expect-error A request cannot identify a build.
  const requestBuild: BuildId = id
  void [request, watch, staticWatch, routeRequest, videoRequest, requestBuild]
}

export function rawAndSafeRelationships(raw: unknown, safeResult: JobResult<JobOf<"account">>, page: PageRunAnswer<JobOf<"account">>) {
  // @ts-expect-error A safe account result cannot satisfy a raw page answer.
  const rawAnswer: PageRunAnswer<JobOf<"account">> = { v: 1, build, kind: "run", id, result: safeResult }
  // @ts-expect-error A raw account result cannot satisfy safe JobResult.
  const safeAnswer: JobResult<JobOf<"account">> = page.result
  // @ts-expect-error A union-valued kind retains the raw account override.
  const unionSafe: PageRunAnswer<PageReads> = { v: 1, build, kind: "run", id, result: { ok: true, route, data: { signedIn: true, acct } } }
  const unionRaw: PageRunAnswer<PageReads> = { v: 1, build, kind: "run", id, result: { ok: true, route, data: { signedIn: true, datasyncId: "synthetic" } } }
  const defaultRaw: PageRunAnswer = unionRaw
  if (isPageRunAnswerFor({ id, job: { kind: "account" } }, raw, build) && raw.result.ok && raw.result.data.signedIn) {
    const identity: string = raw.result.data.datasyncId
    // @ts-expect-error Raw account answers expose no safe projection.
    raw.result.data.acct
    void identity
  }
  if (isPageHelloAnswer(raw, { build, site: "www" }) && raw.snapshot.signedIn) {
    const identity: string = raw.snapshot.datasyncId
    // @ts-expect-error Raw hello data exposes no safe account key.
    raw.snapshot.acct
    void identity
  }
  void [rawAnswer, safeAnswer, unionSafe, defaultRaw]
}

export function membershipCorrelation(raw: unknown) {
  const pending = { id, job: { kind: "membership", videoId: video } } satisfies { id: PageRequestId; job: Job }
  if (isPageRunAnswerFor(pending, raw, build) && raw.result.ok) {
    const rows: MembershipRow[] = raw.result.data
    // @ts-expect-error A membership answer cannot be queue data.
    const queue: StreamData<"queue"> = raw.result.data
    void [rows, queue]
  }
  if (isPageStreamEventFor({ id: subscription, stream: "queue" }, raw, build)) {
    const queue: StreamData<"queue"> = raw.data
    // @ts-expect-error A queue event cannot be player data.
    const player: StreamData<"player"> = raw.data
    void [queue, player]
  }
}

export function genericPending<J extends Job>(pending: { id: PageRequestId; job: J }, accept: (answer: PageRunAnswer<J>) => void) {
  return (raw: unknown) => { if (isPageRunAnswerFor(pending, raw, build)) accept(raw) }
}
export function unionPending(job: PageReads, raw: unknown) {
  if (isPageRunAnswerFor({ id, job }, raw, build) && raw.result.ok && "signedIn" in raw.result.data && raw.result.data.signedIn) {
    const identity: string = raw.result.data.datasyncId
    // @ts-expect-error Union-kind narrowing retains raw account isolation.
    raw.result.data.acct
    return identity
  }
}
export function specialisedPending<J extends Job & { trace: "synthetic" }>(pending: { id: PageRequestId; job: J }) {
  const trace: "synthetic" = pending.job.trace
  genericPending(pending, answer => { const result: PageRunAnswer<J> = answer; void result })
  return trace
}
export function pinsRemainRequired() {
  type RefinedRead = { kind: "membership" | "channelOf"; videoId: VideoId; trace: "synthetic" }
  const refined: JobInvocation<RefinedRead> = { job: { kind: "membership", videoId: video, trace: "synthetic" }, acct }
  // @ts-expect-error Specialised required job fields survive account-pin mapping.
  const missingTrace: JobInvocation<RefinedRead> = { job: { kind: "membership", videoId: video }, acct }
  // @ts-expect-error Account pins remain required on membership.
  const missingPin: JobInvocation<JobOf<"membership">> = { job: { kind: "membership", videoId: video } }
  void [refined, missingTrace, missingPin]
}

export function emittedTypes(hello: PageHelloAnswer, stream: PageStreamEvent<"queue" | "nowPlaying">) {
  const message: PageGatewayMessage = hello
  const broadStream: PageStreamEvent = stream
  return [message, broadStream]
}
