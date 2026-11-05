# First-run synced-choice lookup fixture

This command runs the real read-only lookup with synthetic sync storage and a controlled monotonic clock.

```sh
bun --no-env-file tools/fixtures/sync-join-lookup/run.ts
```

`runSyncJoinLookupFixture()` exports the complete command result for source and saved-artifact verification. `createLookupFixture()` exposes the same controlled ports to the configured Bun tests.

The command reads complete Settings and displays their saved switches as a draft marked **From sync**. It changes a draft tick, closes the review, and discards the draft. Serialized caller storage remains empty. A restarted caller reads nothing until a new explicit lookup observes the then-current remote history. Replacement cancels the preceding lookup, including when its physical read has not settled.

The cases cover complete single and chunked Settings, delivery during a read, event bursts, stale completions, pointer-first and chunks-first delivery, reversed and missing chunks, malformed and unsupported documents, ambiguous histories, reset, over-budget occupancy, deadline races, cancellation, and caller lifetime loss. Every invocation has one original 10 s deadline and at most one in-flight read. A cancelled physical read can remain pending while a replacement invocation starts. Its completion cannot publish.

`not-found` records an empty physical snapshot at the deadline. Missing metadata with retained fragments or unknown occupancy returns `ambiguous-history`. Valid metadata without complete Settings returns `incomplete`. If the latest observed change has no completed fresh snapshot by the deadline, the result is `stale`. These observations authorize no write or history creation. Full physical occupancy can still yield readable draft choices, without admitting a later join.

Only `sync.get`, the sync-area-only `sync.subscribe`, monotonic `clock.now`, bounded `clock.after`, and `isCurrent` are available to the lookup. The fixture includes prohibited injected mutation, identity, claim, permission, registration, and wall-clock ports that throw if accessed. The caller must supply an actual sync-area-only subscription. `isCurrent` describes this synthetic caller's lifetime and readiness. It authenticates no native sender.

The production `ui.syncedChoices` route and first-run UI are not installed by this unit. A future router must validate the extension page and sender-derived UI Origin, admit the narrow explicit first-run exception in normal or private windows, and cancel an invocation before replacing its draft or leaving the page. The lookup returns only detached feature switches, the separate Music section gate, and public observation identifiers. Raw local errors stay local until the owning privacy boundary projects them.

There is no Agree action, join transaction, consent save, `syncOn` save, document adoption, replication, account setup, or generated identity in this command. The later agreement and join must reread current storage and preserve R153, R155, R161, quota admission, uncertainty, and the existing session safeguards. Draft choices grant no mutation authority. Native browser verification is waived and unproven.
