import type { ItemInfo, JobOf, JobResult, NowPlaying } from "../../shared/contracts"
import type { PageLink } from "./page-link"
import type { Pointer } from "./pointer"
import type { Scope } from "./scope"
import { MusicItems } from "./items-music"
import type { MusicItemReporter, MusicItemTarget, MusicPlayback, MusicPointed, MusicResolution } from "./items-music"

declare const document: Document
declare const element: Element
declare const pointer: Pointer
declare const page: PageLink
declare const owner: Scope
declare const song: NowPlaying
declare const item: ItemInfo
declare const target: MusicItemTarget
declare const report: MusicItemReporter
declare const successfulNowPlaying: Extract<JobResult<JobOf<"nowPlaying">>, { ok: true }>
const options = { document, pointer, page, report, onError(_error: unknown) {} }
const items = new MusicItems(options)
const release: () => void = items.track(owner)
const result: Promise<MusicResolution> = items.resolve("next")
const refreshed: Promise<MusicResolution> = items.refresh(target)
const pointed: MusicPointed = items.readPointed()
const playback: MusicPlayback = { kind: "song", song }
void [release, result, refreshed, pointed, playback, item]

// @ts-expect-error playback-song-required
const missingSong: MusicPlayback = { kind: "song" }
// @ts-expect-error playback-empty-has-no-song
const emptySong: MusicPlayback = { kind: "nothing-playing", song }
// @ts-expect-error ad-positive-evidence-required
const evidenceMissing: MusicPlayback = { kind: "ad-playing" }
// @ts-expect-error ad-evidence-closed
const guessedAd: MusicPlayback = { kind: "ad-playing", evidence: "metadata-missing" }
// @ts-expect-error unavailable-failure-required
const guessedNothing: MusicPlayback = { kind: "unavailable" }
// @ts-expect-error song-null-is-not-ad
const widenedSuccess: JobResult<JobOf<"nowPlaying">> = { ...successfulNowPlaying, data: { kind: "ad-playing" } }
// @ts-expect-error wrong-job-playback-detail
const wrongJob: JobResult<JobOf<"itemInfo">> = { ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence: "adShowing" } }
// @ts-expect-error no-status-sentinel-outcome
const statusSentinel: MusicPlayback = { kind: "ad-playing", status: "ad" }
// @ts-expect-error target-authority-cannot-be-forged
const forged: MusicItemTarget = { element, family: "queue-item", identity: { kind: "queue" }, signature: "forged" }
// @ts-expect-error target-element-required
const missingElement: MusicItemTarget = { family: "header", identity: target.identity, signature: target.signature }
// @ts-expect-error target-family-closed
const wrongFamily: MusicItemTarget = { ...target, family: "www-lockup" }
// @ts-expect-error pointed-target-required
const missingTarget: MusicPointed = { kind: "pointed-item" }
// @ts-expect-error unrecognised-cannot-carry-current-song
const failedFallback: MusicResolution = { kind: "unrecognised-item", element, song }
// @ts-expect-error unsupported-native-info-required
const unsupported: MusicResolution = { kind: "unsupported-item", target, action: "save", message: "Unsupported" }
// @ts-expect-error current-copy-is-required
const movedCurrent: MusicResolution = { kind: "current-song", song, queueDisposition: "move-existing" }
// @ts-expect-error stale-reason-closed
const guessedStale: MusicResolution = { kind: "stale-target", reason: "guess" }
// @ts-expect-error reporter-required
new MusicItems({ document, pointer, page, onError(_error: unknown) {} })
// @ts-expect-error reporter-fact-required
new MusicItems({ ...options, report: {} })
// @ts-expect-error actual-page-collaborators-required
new MusicItems({ ...options, page: { run: page.run } })
// @ts-expect-error pointer-read-required
new MusicItems({ ...options, pointer: { track: pointer.track } })
// @ts-expect-error pointer-lease-required
new MusicItems({ ...options, pointer: { read: pointer.read } })
// @ts-expect-error invocation-envelope-required
page.run({ kind: "itemInfo" }, { target: element })
// @ts-expect-error target-must-be-element
page.run({ job: { kind: "itemInfo" } }, { target: "renderer" })
// @ts-expect-error target-read-has-no-account
page.run<JobOf<"itemInfo">>({ job: { kind: "itemInfo" }, acct: null }, { target: element })
// @ts-expect-error target-read-has-no-video-input
page.run<JobOf<"itemInfo">>({ job: { kind: "itemInfo", videoId: song.videoId } }, { target: element })
// @ts-expect-error refresh-requires-opaque-target
items.refresh({ element })
// @ts-expect-error action-vocabulary-is-local-and-closed
items.resolve("invented-action")
// @ts-expect-error monitor-receipt-is-not-an-items-fact
report.itemUnrecognised({ kind: "item-unrecognised", site: "music", source: "pointer", element, timestamp: 0 })
void [missingSong, emptySong, evidenceMissing, guessedAd, guessedNothing, widenedSuccess, wrongJob, statusSentinel,
  forged, missingElement, wrongFamily, missingTarget, failedFallback, unsupported, movedCurrent, guessedStale]
