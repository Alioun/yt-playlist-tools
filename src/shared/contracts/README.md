# Shared contract foundation

This C0 module exports the settled vocabulary, JSON boundary checks, header compatibility checks, gateway failure branch, store results, and trusted origin type. It has no runtime dependency on model, platform, WXT, browser APIs, or the DOM. `Device` is a type-only model import.

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

Complete jobs, successful job data, stream data, changes, tab projections, breakage signals, and production message maps belong to later coherent units. C0 exports no placeholder for them and migrates no callers.

## Validation

The adjacent test exercises every vocabulary, exact result branches, malformed JSON, descriptor safety, compatibility precedence, canonical brand assignability, and real JSON round trips.

```sh
bun test ./src/shared/contracts/foundation.bun-test.ts
bun run test:bun
bun run compile
git diff --check
```
