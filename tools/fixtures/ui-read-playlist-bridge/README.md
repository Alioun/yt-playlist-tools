# Authenticated account and playlist bridge

This bridge is authored and unqualified. The progressive unit starts from tree `1bc25ced85bf2b16b48f4731cf4d996034a73433`, which places this bridge on the qualified nineteen-path cache overlay and preserves its seven repairs. No compiler, test, consumer, control, build or browser has run for the progressive unit. Auto-add and Monitor retain the sole runtime lease. Later reconciliation and explicit runtime authorization remain required.

## Calls and ownership

`shared/contracts/ui.ts` composes the first-run and playlist definitions. Backend callers and `createUiRouter` use this catalogue. The first-run receiver keeps its two-call catalogue and its existing native authentication, permission evidence and owner operations. Its handler does not accept the new routes.

`ui.accountInView` calls actual `Tabs.accountInView`. Account selection has no account field in its body. `ui.playlists` accepts an account, display site and explicit refresh intent. Settings can select a setup without changing native requester authority. Both calls use the canonical owner's read-only projection as a readiness and consent gate.

`ui.playlists` now returns cached rows and finite pending metadata from an explicit list operation. Await, numbered refresh and release use that same operation. The [progressive protocol](../ui-playlist-progressive/README.md) describes its authority and lifetime. The nullable wire cache stamp remains nullable. Owner cache captures, session revisions, native senders, raw storage and promises never enter the answer. `completedList` is a fixture helper that awaits the operation to retain every original completed-answer assertion.

`ui.resolveChannel` calls actual `Playlists.resolveChannel`, which uses Tabs and the protected gateway. The job is account-free by the existing contract. It retains serving failures and gateway account-change failures. Channel normalization and the protected gateway's URL behavior retain their upstream holds.

`ui-requester.ts` first uses the existing native sender resolver. A popup's active tab is queried in its verified native window and checked for matching privacy. Settings and onboarding retain their native sender tab. A body cannot supply an origin, native tab or privacy flag. The private requester class can only be constructed inside the adapter.

## Creation is an operation

Three designs were compared against actual `Playlists.create` and the RPC caller.

1. A handle per RPC request loses the service's remembered submission when the UI sends another request. A lost answer can then cause a duplicate write. This design was rejected.
2. A client nonce used to create a handle on every submit handles duplicate deliveries in one background lifetime. After a background restart, the same submit could create another handle. This design was rejected.
3. An explicit open operation installs one real service handle before any submission. Submit and status require that existing operation. A missing operation is unavailable and never recreates a handle. This is the implemented design.

`Backend.creation({ acct, site })` generates a validated random operation identity and sends one open call. Its first submit is copied before any await. Repeated submits retain that promise, including RPC uncertainty. Invalid titles can be corrected on the same operation because the service explicitly leaves invalid attempts unsent. `status()` reads the retained answer without sending a write. It can recover a confirmed creation whose cache readback stopped the owner.

Operation identity is separate from the RPC envelope ID. It names an ephemeral operation scoped to native document, page, window and privacy facts. It is never a serialized storage capture. The service keeps its actual title, privacy, optional video and account guards.

Disposal sends release for the already known operation identity. Release records a tombstone even when open has not arrived. A delayed open cannot restore released authority. Late answers resolve as disposed in the replaced form. Background disposal removes its listener and all operation authority. Submitted writes are not undone when a form closes.

Each Backend namespaces the existing RPC caller's envelope IDs. The router claims an envelope once. Pending duplicates share one answer. Completed duplicates fail without calling a handler. Completed tombstones retain no response body. Creation results remain scoped to their operation until release or router disposal. The router refuses new claims after 4,096 request tombstones and new opens after 1,024 live operations. It closes creation if release tombstones reach 4,096. These are explicit capacity failures, not successful empty results.

## Authored verification

`run.ts` uses the actual browser Backend, composed authenticated router, memory RPC transport, canonical owner, Tabs and Playlists. Native windows, tabs, storage and jobs are injected synthetic ports. The consumer checks normal, private and no-Setup reads, stale cache, active signed-out facts, last-account fallback, forged identities, held consent, first-run agreement and lookup, account changes, failed creation readback, lost answers, repeated submissions and teardown. Its complete output is deterministic JSON with one final LF.

`controls.json` names compiling mutations for omitted authentication, private requester substitution, optimistic persistence, uncertain creation retries and duplicate handling. `gates.json` lists every intended-line negative separately. `qualify.py` runs one explicitly selected future gate. It requires prepared executable and dependency identities, a reconciled source manifest and a coordinator lease record. It clears the child environment and creates scratch HOME and TMPDIR. Every Bun command includes `--no-env-file --no-install`.

The focused config adds no compiler exclusion. Whole native TypeScript and its file inclusion are separate gates. Source archive reproducibility remains held because the protected existing launcher installs dependencies and starts Bun without the required flags. The existing archive launcher is not safe to invoke under this dispatch. Root builds require a separate prepared, non-environment source workspace and runtime authorization.

## Remaining holds

Production entries do not compose this router. A production native requester and service assembly, the qualified picker source adapter and renderer, full popup and settings, other UI messages, native durability and exclusion, privacy wording approval, rendering and axe remain open. No pending picker policy is decided here. No later unqualified starting-owner or picker-renderer source is imported. The source archive exclusion remains `excludeSources: ["store/**", "site/**", "tools/**"]`.

Model the Domain shaped the creation operation and request state unions. Boundary Discipline kept native identity and JSON validation at their boundaries. Prove It Works limits this return's positive verification claims to complete source identities and actual byte and mode replay. Runtime correctness remains unproven. No review was requested.
