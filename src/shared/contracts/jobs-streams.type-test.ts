import type {
  JobId, JobInputById, JobById, Job, JobOf, JobDataById, JobData, JobResult,
  MembershipRow, BatchAddResult, JobFailureReason, Stream, StreamDataById, StreamData,
  QueueItemId, QueueListId, SetVideoId, RouteId, LikeEndpoint, QueueInsertEndpoint,
  JobInvocation, AccountJobId, PlayerData
} from "./index"
import { isJobResultFor, isJobDataFor, isStreamData } from "./index"
import type { PageAccountData, PageJobData, PageJobResult } from "./page"
import { isPageJobDataFor, isPageJobResultFor } from "./page"
import type { VideoId, PlaylistId, AccountKey } from "../model"
// @ts-expect-error Raw account data belongs to the explicit page entrypoint.
import type { PageAccountData as RootPageAccountData } from "./index"
// @ts-expect-error Raw page results belong to the explicit page entrypoint.
import type { PageJobResult as RootPageJobResult } from "./index"
// @ts-expect-error Page data overrides belong to the explicit page entrypoint.
import type { PageJobData as RootPageJobData } from "./index"
// @ts-expect-error The safe root has no page-result guard.
import { isPageJobResultFor as rootPageGuard } from "./index"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type Distinct<A, B> = A extends B ? false : B extends A ? false : true
export type CatalogueRelationships = [
  Assert<Distinct<VideoId, PlaylistId>>,
  Assert<Distinct<VideoId, SetVideoId>>,
  Assert<Distinct<VideoId, QueueListId>>,
  Assert<Distinct<VideoId, QueueItemId>>,
  Assert<Distinct<PlaylistId, SetVideoId>>,
  Assert<Distinct<PlaylistId, QueueListId>>,
  Assert<Distinct<PlaylistId, QueueItemId>>,
  Assert<Distinct<SetVideoId, QueueListId>>,
  Assert<Distinct<SetVideoId, QueueItemId>>,
  Assert<Distinct<QueueListId, QueueItemId>>,
  Assert<Equal<keyof JobInputById, JobId>>,
  Assert<Equal<keyof JobById, JobId>>,
  Assert<Equal<Job["kind"], JobId>>,
  Assert<Equal<keyof JobDataById, JobId>>,
  Assert<Equal<keyof StreamDataById, Stream>>,
  Assert<Equal<JobData<JobOf<"membership">>, MembershipRow[]>>,
  Assert<Equal<JobData<JobOf<"remove">>, null>>,
  Assert<Equal<JobData<JobOf<"like">>, null>>,
  Assert<Equal<StreamData<"player">, PlayerData>>,
  Assert<Equal<PageJobData<JobOf<"account">>, PageAccountData>>,
  Assert<Equal<PageJobData<Exclude<Job, JobOf<"account">>>, JobData<Exclude<Job, JobOf<"account">>>>>,
  Assert<Equal<Extract<PageAccountData, { signedIn: true }>["datasyncId"], string>>,
  Assert<Equal<Extract<JobData<JobOf<"account">>, { signedIn: true }>["acct"], AccountKey>>,
  Assert<Equal<JobFailureReason, "signedOut" | "accountChanged" | "unavailable" | "unconfirmed" | "failed">>,
  Assert<Equal<AccountJobId, "accountLabel" | "membership" | "playlists" | "add" | "remove" | "addBatch" | "removeBatch" | "save" | "unsave" | "create" | "like" | "library">>
]

declare const video: VideoId
declare const playlist: PlaylistId
declare const occurrence: SetVideoId
declare const list: QueueListId
declare const item: QueueItemId
declare const route: RouteId
declare const acct: AccountKey
declare const like: LikeEndpoint
declare const insert: QueueInsertEndpoint

export function identifierRelationships() {
  const validItem: QueueItemId = item
  if (typeof item === "number") {
    const position: number = item
    void position
  }
  // @ts-expect-error An ordinary index has no occurrence brand.
  const unbranded: QueueItemId = 7
  // @ts-expect-error A video is not a playlist occurrence.
  const videoAsOccurrence: SetVideoId = video
  // @ts-expect-error A playlist occurrence is not a video.
  const occurrenceAsVideo: VideoId = occurrence
  // @ts-expect-error A playlist is not a queue list.
  const playlistAsList: QueueListId = playlist
  // @ts-expect-error A queue list is not a playlist.
  const listAsPlaylist: PlaylistId = list
  // @ts-expect-error A queue list is not an occurrence.
  const listAsOccurrence: SetVideoId = list
  // @ts-expect-error A queue item is not a playlist occurrence.
  const itemAsOccurrence: SetVideoId = item
  // @ts-expect-error A playlist occurrence is not a queue item.
  const occurrenceAsItem: QueueItemId = occurrence
  // @ts-expect-error A video is not a queue occurrence.
  const videoAsItem: QueueItemId = video
  // @ts-expect-error A video is not a playlist.
  const videoAsPlaylist: PlaylistId = video
  // @ts-expect-error Song Like cannot be replayed as a queue insert.
  const likeAsInsert: QueueInsertEndpoint = like
  void [validItem, unbranded, videoAsOccurrence, occurrenceAsVideo, playlistAsList, listAsPlaylist,
    listAsOccurrence, itemAsOccurrence, occurrenceAsItem, videoAsItem, videoAsPlaylist, likeAsInsert]
}

export function invocationRelationships() {
  const pinned = { job: { kind: "membership", videoId: video }, acct } satisfies JobInvocation<JobOf<"membership">>
  const publicJob = { job: { kind: "queueInsert", endpoint: insert, position: "next" } } satisfies JobInvocation<JobOf<"queueInsert">>
  // @ts-expect-error Account jobs require a pin.
  const unpinned: JobInvocation<JobOf<"membership">> = { job: { kind: "membership", videoId: video } }
  // @ts-expect-error Public jobs do not carry an account pin.
  const unexpectedPin: JobInvocation<JobOf<"account">> = { job: { kind: "account" }, acct }
  // @ts-expect-error The default invocation union still requires account pins.
  const defaultUnpinned: JobInvocation = { job: { kind: "membership", videoId: video } }
  // @ts-expect-error The default invocation union forbids pins on public jobs.
  const defaultPublicPin: JobInvocation = { job: { kind: "account" }, acct }
  // @ts-expect-error Settings are not invocation metadata.
  const settings: JobInvocation<JobOf<"membership">> = { job: { kind: "membership", videoId: video }, acct, settings: {} }
  void [pinned, publicJob, unpinned, unexpectedPin, defaultUnpinned, defaultPublicPin, settings]
}

export async function membershipCaller(run: <J extends Job>(job: J) => Promise<JobResult<J>>) {
  const result = await run({ kind: "membership", videoId: video })
  if (!result.ok) {
    const reason: JobFailureReason = result.reason
    // @ts-expect-error Failures do not expose success data.
    result.data
    return reason
  }
  const membership: boolean[] = result.data.map(row => row.contains)
  const selectedRoute: RouteId = result.route
  // @ts-expect-error Membership results have no queue IDs.
  result.data.ids
  void selectedRoute
  return membership
}

export function resultRelationships(raw: unknown, player: StreamData<"player">) {
  const batchAdded: BatchAddResult = { videoId: video, setVideoId: occurrence }
  const batchFailed: BatchAddResult = { videoId: video, failure: { ok: false, reason: "failed" } }
  // @ts-expect-error A batch occurrence cannot be both added and failed.
  const ambiguousBatch: BatchAddResult = { videoId: video, setVideoId: occurrence, failure: { ok: false, reason: "failed" } }
  // @ts-expect-error A batch occurrence must have an outcome.
  const absentBatch: BatchAddResult = { videoId: video }
  void [batchAdded, batchFailed, ambiguousBatch, absentBatch]
  const remove: JobResult<JobOf<"remove">> = { ok: true, data: null, route }
  const liked: JobResult<JobOf<"like">> = { ok: true, data: null, route }
  // @ts-expect-error No-data success still requires the data property.
  const missingData: JobResult<JobOf<"like">> = { ok: true, route }
  // @ts-expect-error Every success names a route.
  const missingRoute: JobResult<JobOf<"remove">> = { ok: true, data: null }
  // @ts-expect-error A queue watcher cannot consume player facts.
  const queue: StreamData<"queue"> = player
  if (isStreamData("queue", raw)) {
    const ids: QueueItemId[] = raw.ids
    void ids
  }
  const membershipJob = { kind: "membership", videoId: video } satisfies Job
  if (isJobDataFor(membershipJob, raw)) {
    const contains: boolean[] = raw.map(row => row.contains)
    void contains
  }
  if (isJobResultFor(membershipJob, raw) && raw.ok) {
    const rows: MembershipRow[] = raw.data
    // @ts-expect-error Pending membership validation does not produce queue-insert results.
    const wrong: JobData<JobOf<"queueInsert">> = raw.data
    void [rows, wrong]
  }
  void [remove, liked, missingData, missingRoute, queue]
}

export function accountRelationships(raw: unknown, pageResult: PageJobResult<JobOf<"account">>) {
  // @ts-expect-error Raw identity cannot satisfy safe account results.
  const safeResult: JobResult<JobOf<"account">> = pageResult
  if (isPageJobResultFor({ kind: "account" }, raw) && raw.ok && raw.data.signedIn) {
    const identity: string = raw.data.datasyncId
    // @ts-expect-error Page account data has no projected key.
    raw.data.acct
    void identity
  }
  if (isJobResultFor({ kind: "account" }, raw) && raw.ok && raw.data.signedIn) {
    const key: AccountKey = raw.data.acct
    // @ts-expect-error Safe account data has no raw identity.
    raw.data.datasyncId
    void key
  }
  void safeResult
}

export function pending<J extends Job>(job: J, resolve: (result: JobResult<J>) => void) {
  return { accept(raw: unknown) { if (isJobResultFor(job, raw)) resolve(raw) } }
}
export function pagePending<J extends Job>(job: J, resolve: (result: PageJobResult<J>) => void) {
  return { accept(raw: unknown) { if (isPageJobResultFor(job, raw)) resolve(raw) } }
}

export function trackerProjection(player: Extract<PlayerData, { ad: false }>) {
  const facts: {
    content: "video" | "clip" | "made-for-kids"
    duration: number | null; listedDuration: number | null
    isPostLiveDvr: boolean; isLive: boolean; isUpcoming: boolean; isLiveContent: boolean
  } = {
    content: player.content, duration: player.len, listedDuration: player.listedLength,
    isPostLiveDvr: player.isPostLiveDvr, isLive: player.isLive,
    isUpcoming: player.isUpcoming, isLiveContent: player.isLiveContent
  }
  return facts
}


type PageReads = { kind: "account" | "accountLabel" }
type VideoReads = { kind: "membership" | "channelOf"; videoId: VideoId }
export type UnionKindRelationships = [
  Assert<Equal<PageJobData<PageReads>, PageAccountData | JobData<JobOf<"accountLabel">>>>,
  Assert<Equal<PageJobData<Job>, PageAccountData | JobData<Exclude<Job, JobOf<"account">>>>>
]

export function unionPageRelationships(job: PageReads, raw: unknown) {
  const acceptedJob: Job = job
  const rawAccount: PageJobData<PageReads> = { signedIn: true, datasyncId: "synthetic-identity" }
  const label: PageJobData<PageReads> = { name: "Synthetic" }
  // @ts-expect-error A union-valued page kind never accepts a safe account projection.
  const safeAccount: PageJobData<PageReads> = { signedIn: true, acct }
  if (isPageJobDataFor(job, raw) && "signedIn" in raw && raw.signedIn) {
    const identity: string = raw.datasyncId
    // @ts-expect-error Guarded raw page data never claims a safe account key.
    const key: AccountKey = raw.acct
    void [identity, key]
  }
  if (isPageJobResultFor(job, raw) && raw.ok && "signedIn" in raw.data && raw.data.signedIn) {
    const identity: string = raw.data.datasyncId
    // @ts-expect-error Guarded raw page results never claim a safe account key.
    const key: AccountKey = raw.data.acct
    void [identity, key]
  }
  void [acceptedJob, rawAccount, label, safeAccount]
}

export function unionInvocationRelationships() {
  const pinned: JobInvocation<VideoReads> = { job: { kind: "membership", videoId: video }, acct }
  const publicJob: JobInvocation<VideoReads> = { job: { kind: "channelOf", videoId: video } }
  const label: JobInvocation<PageReads> = { job: { kind: "accountLabel" }, acct }
  const account: JobInvocation<PageReads> = { job: { kind: "account" } }
  const defaultPinned: JobInvocation = pinned
  const defaultPublic: JobInvocation = publicJob
  const objectUnion: JobInvocation<JobOf<"membership" | "channelOf">> = pinned
  // @ts-expect-error The membership branch of a union-valued kind requires a pin.
  const unpinned: JobInvocation<VideoReads> = { job: { kind: "membership", videoId: video } }
  // @ts-expect-error The channelOf branch of a union-valued kind forbids a pin.
  const publicPin: JobInvocation<VideoReads> = { job: { kind: "channelOf", videoId: video }, acct }
  // @ts-expect-error The accountLabel branch requires a pin even beside public account.
  const unpinnedLabel: JobInvocation<PageReads> = { job: { kind: "accountLabel" } }
  // @ts-expect-error The public account branch forbids a pin even beside accountLabel.
  const accountPin: JobInvocation<PageReads> = { job: { kind: "account" }, acct }
  // @ts-expect-error An object-union membership branch still requires a pin.
  const objectUnpinned: JobInvocation<JobOf<"membership" | "channelOf">> = { job: { kind: "membership", videoId: video } }
  void [pinned, publicJob, label, account, defaultPinned, defaultPublic, objectUnion,
    unpinned, publicPin, unpinnedLabel, accountPin, objectUnpinned]
}

export function forwardInvocation<J extends Job>(invocation: JobInvocation<J>, send: (value: JobInvocation) => void) {
  const job: J = invocation.job
  const general: JobInvocation = invocation
  send(general)
  return job
}

export function forwardedInvocationRelationships() {
  const send = (invocation: JobInvocation) => invocation
  const inferredMember: JobOf<"membership"> = forwardInvocation({ job: { kind: "membership", videoId: video }, acct }, send)
  const inferredChannel: JobOf<"channelOf"> = forwardInvocation({ job: { kind: "channelOf", videoId: video } }, send)
  const member: VideoReads = forwardInvocation<VideoReads>({ job: { kind: "membership", videoId: video }, acct }, send)
  const channel: VideoReads = forwardInvocation<VideoReads>({ job: { kind: "channelOf", videoId: video } }, send)
  // @ts-expect-error Generic forwarding cannot remove the membership pin.
  forwardInvocation<VideoReads>({ job: { kind: "membership", videoId: video } }, send)
  // @ts-expect-error Generic forwarding cannot pin a public channel read.
  forwardInvocation<VideoReads>({ job: { kind: "channelOf", videoId: video }, acct }, send)
  type RefinedRead = { kind: "membership" | "channelOf"; videoId: VideoId; trace: "synthetic" }
  const refined: JobInvocation<RefinedRead> = { job: { kind: "membership", videoId: video, trace: "synthetic" }, acct }
  // @ts-expect-error Narrowing each discriminant must retain specialised job fields.
  const missingTrace: JobInvocation<RefinedRead> = { job: { kind: "membership", videoId: video }, acct }
  void [member, channel, inferredMember, inferredChannel, refined, missingTrace]
}
