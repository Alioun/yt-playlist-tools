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

Changes, tab projections, and production channel implementations belong to later units. These contracts migrate no production callers.

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

## Page messages

`page.ts` explicitly exports the page envelope types and contextual guards. The safe root exports page IDs and safe diagnostic contracts only. It has no runtime dependency on `page.ts` or `page-messages.ts`. The existing raw result definitions remain in `page.ts`. Its re-export cycle calls no guard during module initialization.

Every envelope has flat own `v`, `build`, and `kind` fields. The wire uses the following payloads.

| Direction | Kind | Payload |
|---|---|---|
| Core request | `hello` | No payload fields |
| Core request | `run` | `id`, `job` |
| Core request | `watch` | `id`, `stream` |
| Core request | `unwatch` | `id` |
| Core request | `probe` | `id` |
| Dedicated retirement | `retire` | No payload fields |
| Gateway answer | `hello` | `site`, `snapshot` |
| Gateway answer | `run` | `id`, `result` |
| Gateway event | `stream` | `id`, `data` |
| Gateway answer | `probe` | `id`, `report` |
| Gateway event | `signal` | `signal` |

`PageCoreMessage` includes retirement. `PageRequestMessage` excludes it. `isPageRetireMessage` accepts the current contract version with any valid announcing build, including the current build. A receiver treats same-build retirement as a no-op. Normal guards still require the expected build. Unsupported-version retirement fails. Cross-version compatibility and actual disposal remain integration questions.

`PageRequestId`, `PageWatchId`, and `WatchId` have distinct brands. They identify a pending request, a stream subscription, and a static watch-list dependency respectively. Their guards verify nonempty strings without generating IDs or promising uniqueness.

The hello snapshot contains the raw C1 account branch, opaque `PageType`, optional C1 `VideoInfo`, own `startedHidden`, and own `navType`. Navigation is `navigate`, `reload`, `back_forward`, `prerender`, or null. These are observations at page start. Contracts infer neither current visibility nor freshness. PageLink later projects a fresh safe value and hashes raw identity before forwarding.

`isPageRunAnswerFor` requires the exact pending ID and actual job, preserving C1 batch order and count checks. `isPageStreamEventFor` requires the active subscription ID and actual stream. `isPageProbeAnswerFor` requires the pending ID, site, and applicable static watch IDs. `isPageHelloAnswer` requires the expected build and site. `isPageSignalEvent` additionally requires trusted diagnostic vocabulary. There is no generic gateway receive guard.

```ts
import { isPageRunAnswerFor } from "./page"
import type { PageRunAnswer } from "./page"
import type { BuildId, Job, PageRequestId } from "./index"

function receive<J extends Job>(
	pending: { id: PageRequestId; job: J }, build: BuildId,
	accept: (answer: PageRunAnswer<J>) => void,
) {
	return (raw: unknown) => {
		if (isPageRunAnswerFor(pending, raw, build)) accept(raw)
	}
}
```

All required and optional fields use own JSON data evidence. Absent optional fields ignore inherited values. Present undefined and all accessors fail without calling getters. The C0 Proxy reflection limitation still applies. These pure checks prove neither sender authorization nor pending-table liveness, expiry, duplicate rejection, or subscription lifetime.

The flat discriminants, null associations, diagnostic grammar, ID representation, and navigation encoding implement the standalone C2 brief. The approved spec prescribes the message families, start observations, account confinement, and privacy requirements. Runtime adapters own string detail, bubbles, composed, item-element dispatch, document events, and retirement handling under architecture 6.8.1 and ARC-MAN-17. No acknowledgement or recovery packet is added.

## Presence and diagnostic privacy

`ProbeReport` contains only site and unique `{ id, present }` entries. `isProbeReportFor` checks exact site and set coverage against the caller's applicable runtime-watch subset. Order has no meaning. Empty entries pass only for an empty expected set. A presence report is one input to Check now, which separately runs read jobs.

`BreakageSignal` requires site, nullable feature/job/route/watch associations, canonical kind, nullable outline, nullable client version, normalized page category, positive safe-integer count, and ordered nonnegative safe-integer times. A count of one requires equal first and last times. Missing and threw require a dependency ID. Unrecognised requires an outline. All 13 canonical kinds remain unchanged. Contracts read no clock and implement no aggregation, threshold, monitor status, storage, or recovery lifecycle.

`DiagnosticVocabulary` supplies trusted static `routes`, `watchIds`, and `schemaKeys`. Every non-null route and watch ID must belong to it. The caller owns provenance and must supply shipped constants. Taking vocabulary from page data defeats privacy. Synthetic catalogue membership tests cannot prove production catalogue coverage.

`clientVersion` accepts null or a complete dotted numeric token such as `2.20261024.00.00`. Diagnostic page categories are `watch`, `shorts`, `home`, `search`, `music-browse`, and `other`. Arbitrary upstream `PageType` labels are not diagnostic categories. Lexical acceptance cannot establish provenance. A wrongly sourced identity coinciding with a numeric version token still needs prevention in the later extractor.

## Shape outlines

`makeShapeOutline` consumes validated `JsonValue` and trusted static schema keys. Scalars become type tokens. Keys outside the exact allowlist become `<key>`, including identifier-looking keys. Duplicate redacted keys and object alternatives merge fields recursively. An array has no item outline when empty, or one merged item outline. Different source types use a flattened union with at least two unique type alternatives, sorted by type. No source counts or source order survive. Cuts subsume their container type during merging.

Fields sort by key with JavaScript string ordering. Alternatives sort by source type. No locale, clock, random source, scalar sample, index, or original ordering enters the result. At source depth 6, containers become cut nodes. Root depth is zero. Fields and array elements each advance source depth once. Union wrappers do not advance it. The AST's JSON object nesting is deeper than source nesting.

The producer replaces complete canonical branches with cut nodes until JSON encoding occupies at most 2048 UTF-8 bytes. Keys with Unicode, escapes, and lone surrogates count by their JSON encoding. It never slices bytes or strings. A cut retains the root container type when all detail must be removed. Input objects remain unchanged.

`isShapeOutline` independently checks exact node fields, safe keys, canonical sorting, merged type uniqueness, union flattening, source depth, and the byte cap. It rejects raw values and arbitrary string leaves. The guard does not certify that the supplied schema vocabulary is shipped or that a parser observed the claimed shape.

The focused C2 tests run alongside the settled C0 and C1 tests. `page-messages.type-test.ts` proves exhaustive families, contextual generic narrowing, union-valued job kinds, required specialized fields, account pins, distinct ID roles, and forbidden safe-root imports under the actual project compiler.
