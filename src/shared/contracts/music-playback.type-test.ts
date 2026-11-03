import type { JobFailure, JobOf, JobResult, MusicAdFailure, NowPlaying, RouteId, StreamData } from "./index"
import type { PageJobResult, PageRunAnswer } from "./page"

declare const route: RouteId
declare const song: NowPlaying
declare const ad: MusicAdFailure
declare const ordinary: JobFailure

const playback: JobResult<JobOf<"nowPlaying">> = ad
const pagePlayback: PageJobResult<JobOf<"nowPlaying">> = ad
const ordinaryItem: JobResult<JobOf<"itemInfo">> = ordinary
const songSuccess: JobResult<JobOf<"nowPlaying">> = { ok: true, route, data: song }
const emptySuccess: JobResult<JobOf<"nowPlaying">> = { ok: true, route, data: null }
const songStream: StreamData<"nowPlaying"> = song
const emptyStream: StreamData<"nowPlaying"> = null

// @ts-expect-error playback-detail-cannot-enter-an-ordinary-failure
const genericFailure: JobFailure = ad
// @ts-expect-error playback-detail-cannot-enter-itemInfo
const itemFailure: JobResult<JobOf<"itemInfo">> = ad
// @ts-expect-error playback-detail-cannot-enter-castState
const castFailure: JobResult<JobOf<"castState">> = ad
// @ts-expect-error playback-detail-cannot-enter-account
const accountFailure: PageJobResult<JobOf<"account">> = ad
// @ts-expect-error playback-detail-cannot-enter-page-itemInfo
const pageItemFailure: PageJobResult<JobOf<"itemInfo">> = ad
// @ts-expect-error playback-detail-requires-unavailable-reason
const wrongReason: MusicAdFailure = { ...ad, reason: "failed" }
// @ts-expect-error playback-detail-requires-known-evidence
const unknownEvidence: MusicAdFailure = { ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence: "metadata-missing" } }
// @ts-expect-error playback-detail-requires-evidence
const missingEvidence: MusicAdFailure = { ok: false, reason: "unavailable", detail: { kind: "music-ad" } }
// @ts-expect-error playback-detail-rejects-http-conflict
const httpConflict: MusicAdFailure = { ...ad, http: 200 }
// @ts-expect-error playback-detail-rejects-status-conflict
const statusConflict: MusicAdFailure = { ...ad, status: "ad" }
// @ts-expect-error playback-detail-rejects-extra-detail-fields
const extraDetail: MusicAdFailure = { ...ad, detail: { ...ad.detail, extra: true } }
// @ts-expect-error playback-detail-rejects-success
const adSuccess: JobResult<JobOf<"nowPlaying">> = { ok: true, route, data: ad.detail }
// @ts-expect-error playback-success-remains-song-or-null
const driftedSuccess: PageJobResult<JobOf<"nowPlaying">> = { ok: true, route, data: { kind: "ad-playing", evidence: "adShowing" } }
// @ts-expect-error playback-stream-remains-song-or-null
const driftedStream: StreamData<"nowPlaying"> = ad.detail
// @ts-expect-error playback-page-answer-rejects-unrelated-job
const unrelatedAnswer: PageRunAnswer<JobOf<"itemInfo">>["result"] = ad

void [
  playback,
  pagePlayback,
  ordinaryItem,
  songSuccess,
  emptySuccess,
  songStream,
  emptyStream,
  genericFailure,
  itemFailure,
  castFailure,
  accountFailure,
  pageItemFailure,
  wrongReason,
  unknownEvidence,
  missingEvidence,
  httpConflict,
  statusConflict,
  extraDetail,
  adSuccess,
  driftedSuccess,
  driftedStream,
  unrelatedAnswer
]
