import type { JobOf, VideoInfo } from "../../shared/contracts"
import type { PageLink } from "./page-link"
import type { Pointer } from "./pointer"
import type { Scope } from "./scope"
import { WwwItems } from "./items-www"
import type { WwwItemReporter, WwwItemTarget, WwwPointed, WwwResolution } from "./items-www"

declare const document: Document
declare const element: Element
declare const pointer: Pointer
declare const page: PageLink
declare const owner: Scope
declare const video: VideoInfo
declare const report: WwwItemReporter
const options = { document, pointer, page, report, onError(_error: unknown) {} }
const items = new WwwItems(options)
const release: () => void = items.track(owner)
release()
const result: Promise<WwwResolution> = items.resolve()
const read: WwwPointed = items.readPointed()
const valid: WwwItemTarget = { element, family: "lockup", identity: { videoId: video.videoId, kind: video.kind, signature: "DOM identity" } }
void [result, read, valid]

// @ts-expect-error target-identity-required
const missingIdentity: WwwItemTarget = { element, family: "video" }
// @ts-expect-error target-element-required
const missingElement: WwwItemTarget = { family: "video", identity: valid.identity }
// @ts-expect-error target-family-closed
const unsupportedFamily: WwwItemTarget = { ...valid, family: "music-row" }
// @ts-expect-error pointed-target-required
const noTarget: WwwPointed = { kind: "pointed-item" }
// @ts-expect-error unsupported-kind-closed
const wrongUnsupported: WwwPointed = { kind: "unsupported-item", element, reason: "song" }
// @ts-expect-error unsupported-video-forbidden
const unsupportedVideo: WwwPointed = { kind: "unsupported-item", element, reason: "playlist", video }
// @ts-expect-error none-has-no-target
const noneWithTarget: WwwPointed = { kind: "no-pointed-item", reason: "ordinary", target: valid }
// @ts-expect-error resolution-details-required
const noDetails: WwwResolution = { kind: "pointed-item", target: valid }
// @ts-expect-error current-video-required
const noCurrentData: WwwResolution = { kind: "current-video" }
// @ts-expect-error failure-is-not-no-item
const recognitionFallback: WwwResolution = { kind: "unrecognised-item", element, video }
// @ts-expect-error stale-reason-closed
const stale: WwwResolution = { kind: "stale-target", reason: "guess" }
// @ts-expect-error reporter-required
new WwwItems({ document, pointer, page, onError(_error: unknown) {} })
// @ts-expect-error settle-reporter-required
new WwwItems({ ...options, report: { itemUnrecognised() {} } })
// @ts-expect-error recognition-reporter-required
new WwwItems({ ...options, report: { pageSettled() {} } })
// @ts-expect-error real-page-collaborators-required
new WwwItems({ ...options, page: { run: page.run } })
// @ts-expect-error pointer-read-required
new WwwItems({ ...options, pointer: { track: pointer.track } })
// @ts-expect-error page-invocation-envelope-required
page.run({ kind: "videoInfo" })
// @ts-expect-error read-has-no-account
page.run<JobOf<"videoInfo">>({ job: { kind: "videoInfo" }, acct: null })
// @ts-expect-error video-read-has-no-input
page.run<JobOf<"videoInfo">>({ job: { kind: "videoInfo", videoId: video.videoId } })
// @ts-expect-error target-is-an-element
page.run({ job: { kind: "videoInfo" } }, { target: "renderer" })
// @ts-expect-error site-core-does-not-provide-monitor-timestamps
report.pageSettled({ kind: "page-settle", site: "www", anchor: "www-cards", navigation: { pageType: "HOME", navigation: { kind: "other" } }, delayMs: 3000, relevant: true, visible: true, distinctMainLinks: 6, recognised: 2, anchorMissing: true, observedAt: 0 })
void [missingIdentity, missingElement, unsupportedFamily, noTarget, wrongUnsupported, unsupportedVideo, noneWithTarget,
  noDetails, noCurrentData, recognitionFallback, stale]
