# Shared contracts

This module exports the settled vocabulary, JSON and header checks, all 29 jobs, their correlated results, all four streams, store results, and the trusted origin type. Runtime imports reach only pure contract modules and canonical model validators. No contract imports platform, WXT, browser APIs, or the DOM. Model types remain type-only imports.

## Vocabulary and model ownership

`Site`, `FeatureId`, `JobId`, `Stream`, and `BreakageKind` contain the approved literals. Each predicate checks its exhaustive keyed constant. A job ID does not promise support on both sites or verify a live route.

`Privacy` derives from `NonNullable<Device["newPlaylistVisibility"]>`. Account, video, channel, playlist, and shortcut brands remain in `../model`. Contracts do not redefine or re-export them.

`BuildId` is an opaque nonempty string. `isBuildId` verifies that representation without generating an identity or assuming semver.

## JSON data

`isJsonValue` accepts null, booleans, finite numbers, strings, dense arrays, and plain data objects with `Object.prototype` or a null prototype. Object fields must be enumerable string-keyed data properties. Arrays must contain only their length and dense canonical index properties.

The guard rejects undefined, bigint, functions, symbols, nonfinite numbers, sparse arrays, cycles, accessors, and non-data instances. It never invokes getters or `toJSON`. Repeated acyclic references pass. Prototype-looking keys remain ordinary data. An iterative traversal imposes no payload-size or depth limit.

`parseJsonText` accepts only strings. It returns `{ ok: false }` for malformed text or a parsed value outside the JSON data rules, including numeric overflow. It never returns the rejected input in an error. Optional wire fields are omitted before serialization rather than set to undefined.

These checks inspect JavaScript descriptors. They are not an execution sandbox for hostile Proxy reflection traps. Reflection errors return invalid without throwing.

## Header compatibility

`inspectMessageHeader(raw, expectedBuild)` requires an own positive safe-integer `v` and own valid `build` on a JSON object. Additional JSON fields pass this stage. The result precedence is invalid data, unsupported version, differing build, then a fresh matching header.

`CONTRACT_VERSION` starts at 1 independently of `DOCUMENT_VERSION`, `STORAGE_SCHEMA_VERSION`, and `CONSENT_VERSION`. The initial value, mandatory build on every channel, strict JSON policy, helper signatures, and check order are engineering choices. ARC-MSG-09 prescribes the wire version and cross-world or update build identity.

A matching header does not validate a payload or authenticate a sender. Receivers still need complete message-specific guards and adapter authorization before dispatch. Build mismatch classification triggers no retirement or other lifecycle action. A later retirement receiver must deliberately handle valid differing builds.

## Results and origin

`isJobFailure` accepts only `{ ok: false, reason, http?, status? }` with a prescribed reason. Optional HTTP status is an integer from 100 through 599. Optional status is any string. `isChangeResult` accepts only `{ ok: true }` or `{ refused }` with one prescribed refusal. Both guards require JSON data objects, reject extra fields and mixed branches, and return false without throwing.

The fields and literals come from architecture 6.5.1 and 6.9. Strict field checking and HTTP refinement are engineering choices. Gateway failures do not include transport, consent, or serving-tab failure variants.

`Origin` is constructed later from trusted sender metadata. There is no incoming Origin guard. Page payloads cannot supply trusted origin or account context.

Changes, tab projections, breakage signals, and production message maps belong to later units. These contracts migrate no production callers.

## Jobs and pending results

`JobInputById`, `JobById`, and `JobDataById` cover exactly the C0 `JobId` catalogue. `JobOf<K>` selects a branch, and `JobData<J>` selects its result. `JobResult<J>` requires `{ ok: true, data, route }` or the C0 failure branch. Remove, unsave, queue Undo, open-card-menu, and Like success carry explicit `data: null`.

The safe entrypoint is `src/shared/contracts/index.ts`. A pending caller validates against the job it sent:

```ts
import { isJobResultFor } from "./index"
import type { Job, JobResult } from "./index"

function pending<J extends Job>(job: J, resolve: (result: JobResult<J>) => void) {
	return {
		accept(raw: unknown) {
			if (isJobResultFor(job, raw)) resolve(raw)
		},
	}
}
```

`isJobDataFor` and `isJobResultFor` require the actual job. There is no generic guard that claims an arbitrary successful result without a pending job. A union-valued `Job` must be narrowed by kind before branch-specific consumption.

`addBatch` requires 1 through 50 video IDs. Its result has one exclusive success or failure entry per submitted ID, with equal length and equal IDs at each index. Repeated submitted IDs keep their order. `removeBatch` requires 1 through 50 occurrence IDs, and removed is an integer from zero through the submitted length. `queueAddList` requires 1 through 199 videos. Its count cannot exceed that input length, and confirmed true requires the entire length. False confirmation remains a recognised answer that the consumer must handle.

`queueRemoveIds` permits an empty list and has no 50-entry cap. Removed is bounded by the submitted length. Queue-insert results contain nonempty unique occurrence IDs. Queue streams contain unique IDs in current order and may be empty. Numeric and string occurrence IDs retain their scalar types. Numeric queue positions are zero-based nonnegative safe integers, separate from occurrence identities.

`supportsJob` and `supportsStream` report catalogue site support. They do not report current capabilities, route registration, authorization, or live availability. Input guards keep target elements and invocation metadata outside Job JSON.

## Account boundary

`AccountJobId` covers the twelve signed-in jobs. `JobInvocation<J>` requires `acct: AccountKey` for them and permits only `{ job }` for other jobs. Its public branch uses `acct?: never` so TypeScript also rejects a pin through the default invocation union. The strict invocation guard rejects extra fields and unexpected or missing pins. Jobs themselves never carry a pin or account settings.

```ts
import type { JobInvocation, JobOf } from "./index"
import type { AccountKey, VideoId } from "../model"

function membershipInvocation(videoId: VideoId, acct: AccountKey) {
	return { job: { kind: "membership", videoId }, acct } satisfies JobInvocation<JobOf<"membership">>
}
```

The explicit `src/shared/contracts/page.ts` entrypoint exports `PageAccountData`, `PageJobData`, `PageJobResult`, `isPageJobDataFor`, and `isPageJobResultFor`. The safe root exports none of these. Page account data is `{ signedIn: true, datasyncId: string }` with a nonempty raw value, or `{ signedIn: false, datasyncId: null }`. Safe account data instead carries `acct: AccountKey` or null. The guards reject mixed representations.

```ts
import { isPageJobResultFor } from "./page"
import type { Job } from "./index"
import type { PageJobResult } from "./page"

function pagePending<J extends Job>(job: J, resolve: (result: PageJobResult<J>) => void) {
	return {
		accept(raw: unknown) {
			if (isPageJobResultFor(job, raw)) resolve(raw)
		},
	}
}
```

PageLink owns projection into a fresh safe result before forwarding outside the tab. The trusted core supplies a pin from TabView, and PageLink compares it before forwarding only the job. The gateway owns page-load identity, response checks, and its tripped state. These validators implement neither authorization nor that lifecycle. The page entrypoint prevents accidental safe-root use; direct imports still depend on the caller respecting the tab boundary.

## Opaque endpoints and item capabilities

Six separate endpoint brands retain the item's complete JSON command. Guards require exactly one recognised top-level command family and preserve additional native JSON fields. Queue insert requires a native insert position and exactly one video or playlist target. Navigation distinguishes watch, watch-playlist, and browse families. Other endpoint bodies require nonempty JSON objects. These checks do not certify an upstream schema, route, token, action provenance, or successful effect.

`ItemInfo.endpoints` exposes only the item's recognised menu capabilities. Next and end match their native insert position. Mix permits watch families; album and artist permit browse. Library couples the native endpoint with its inLibrary state. Song Like and like-family library remain separate branded slots whose semantic provenance belongs to the item parser. Queue removal and selected current entries require a queue occurrence ID. An item's kind alone invents no capability.

`LikeState` preserves liked, not-liked, and disliked. Null item like state means the state is not exposed. Source `MusicType` and `PageType` labels remain opaque branded strings, separate from normalised item kinds and navigation branches. `hasOwnLike`, selected, autoplay, and readable header count remain independent facts.

## Streams, units, and tracker adaptation

All positions and durations use seconds. `at` is finite nonnegative monotonic seconds from one page clock. `pos` is finite and nonnegative, including transient values beyond length. `rate` is a finite positive playback multiplier with no maximum. `len`, `length`, and `listedLength` are positive finite seconds or null. Page readers normalise missing, zero, and unusable source duration to null. Present undefined never crosses the JSON boundary. Counts and removed totals are nonnegative safe integers. Text may be empty, while artwork, thumb, and avatar are nonempty opaque URL strings.

`player` is an ad/content union for the watch or Shorts counting player. An ad contains only ad, at, and player. Content requires video identity, position, both duration facts, rate, playing, seeking, content classification, and four independent live flags. Validation preserves ordinary, live, upcoming, post-live, replay, clip, and made-for-kids facts without deciding which count.

`nav` separates the opaque page type, nullable current video, and normalised watch/Shorts navigation identity. A settling player's video can differ from navigation. A miniplayer can supply a video on other navigation. `nowPlaying` uses the same non-null song shape as the job and also permits null. A paused song remains present. Stream events have no result envelope.

A future site-owned feed maps len and listedLength to tracker duration and listedDuration, retaining content and all live flags. It updates facts when they change, because tracker fact updates clear continuity. Watch and Shorts samples must agree with navigation identity. A miniplayer on another page uses its counting player's ID. A fresh video or live-to-fixed replay starts fresh tracking. Ads, seeking, and nonplaying map to interruptions. Rate changes close the preceding interval using its prior rate. Shared contracts never import tracker or site code. Emission, interval closure, event watchers, and scheduling belong to the future reader and feed.

## Validation

The foundation test covers C0. The job/stream test supplies every catalogue branch through the public root and explicit page entrypoint, including pending correlation, malformed objects, descriptor safety, and real JSON round trips. The type-test file proves compiler relationships and rejected root imports. The real project compiler includes it.

```sh
bun test --isolate --conditions=browser ./src/shared/contracts/foundation.bun-test.ts ./src/shared/contracts/jobs-streams.bun-test.ts
bun run test:bun
bun run compile
git diff --check
```
