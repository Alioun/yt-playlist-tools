# Qualify the authored gateway reads

This directory composes the real gateway, `servePage`, PageLink and both direct and DOM PageChannel adapters over synthetic raw page state.
The consumer checks complete serialized results, actual target forwarding, PageLink's identity projection, probe identifiers and exact cleanup counts.
It writes twelve deterministic NDJSON records and a final newline. No raw identity appears in those records.
The fixed expected account key comes from an independent static SHA-256 of the named synthetic identity.
Production identity hashing remains exclusively in PageLink.

## Obtain the execution lease first

Every command below is unexecuted for this candidate, including `check-source.py`.
The Setup/session task owns the runtime lease. This checkout has no prepared `node_modules` directory at authoring time.
The lease holder must provide the already prepared dependency mount matching `package.json` and `bun.lock`.
These instructions authorize no installation or network operation.
The package manager pin is Bun 1.4.3. The compiler alias is TypeScript 7.0.2, the guard parser is TypeScript 6.0.3, and happy-dom is 21.0.3.
The handoff pins the exact lock bytes. Installed dependency bytes and executable versions have not been checked.

Run each command from the assigned candidate checkout after the lease and dependency mount exist.
The optional qualification scripts use `.audit/gateway-runtime` for their receipts and temporary mutation copies.
They skip every `identityOnly` manifest entry before opening a file.
Stop on a failed gate. Exit code 124 means the deadline expired and must not be retried unchanged.

1. Typecheck the read modules, type positives, behavior tests and real consumer.

   ```sh
   timeout -k 10 60 node node_modules/@typescript/native/bin/tsc --pretty false -p tools/fixtures/gateway-reads/tsconfig.json
   ```

2. Run the focused gateway and live-port tests with the repository's real preloads.

   ```sh
   timeout -k 10 120 bun test --no-env-file --isolate --conditions=browser ./src/page/gateway.bun-test.ts ./src/page/live-reads.bun-test.ts ./src/page/gateway-consumer.bun-test.ts
   ```

3. Run the existing channel and PageLink tests without changing their guards or implementations.

   ```sh
   timeout -k 10 120 bun test --no-env-file --isolate --conditions=browser ./src/page/channel.bun-test.ts ./src/shared/rpc/page-channel.bun-test.ts ./src/site/core/page-link.bun-test.ts
   ```

4. Run the local text checks and the repository's architecture guards.

   ```sh
   timeout -k 10 30 python3 tools/fixtures/gateway-reads/check-source.py
   timeout -k 10 120 bun test --no-env-file --isolate --conditions=browser ./tests/guards/architecture.test.ts
   ```

5. Compare direct and DOM consumers through EOF across four fresh executions.

   ```sh
   timeout -k 10 240 python3 tools/fixtures/gateway-reads/qualify.py eof --manifest .audit/gateway-read-continuation-20261029/candidate-manifest.json
   ```

6. Require each intended-line type negative to fail at its own line after its one suppression is removed.

   ```sh
   timeout -k 10 540 python3 tools/fixtures/gateway-reads/qualify.py negatives --manifest .audit/gateway-read-continuation-20261029/candidate-manifest.json --dependencies node_modules
   ```

7. Run the five sensitivity controls in isolated source copies.

   ```sh
   timeout -k 10 540 python3 tools/fixtures/gateway-reads/qualify.py controls --manifest .audit/gateway-read-continuation-20261029/candidate-manifest.json --dependencies node_modules
   ```

Each control first requires its named baseline test to pass. It then requires that same named behavior test to fail after one mutation.
A compiler error, missing test, timeout or unrelated suite failure is not a successful sensitivity result.

| Control | Mutation | Required failure |
| --- | --- | --- |
| Wrong player | Read the inline preview instead of `movie_player`. | The counting-player result differs or disappears. |
| Stale navigation | Bypass the current-video agreement check. | A stale video read succeeds. |
| Event ownership | Skip the final watch release. | Exact active-listener counts remain nonzero. |
| Invalid endpoint | Bypass raw item parsing with a successful item. | An invalid native endpoint is accepted. |
| Diagnostic identity | Put the synthetic raw identity in a diagnostic field. | The diagnostic validity and privacy assertions fail. |

The controls have not run. Their ability to distinguish these regressions remains a deferred gate.

## Remaining delivery gates

The scoped typecheck does not replace the full repository compiler, legacy and Bun suites or browser builds.
Those remain unexecuted, as do recorded-fixture replay, signed-in ticket 25 checks, real native events, browser lifecycle and production entry integration.
Their later executors must preserve the repository's gates and acquire the appropriate lease.
No full build, browser launch or recording command is proposed in this bounded unit.

See [provenance](provenance.md) for every conditional raw shape and [gateway behavior](../../../src/page/gateway.README.md) for supported routes.
Music subscriptions, cast discovery and encodings, header counts, request routes, response-context guarding, lanes and writes remain open.
Native guarantees remain waived and unproven. Privacy approval is pending. Activation is held. This unit does not complete 2.0.

## Unimplemented route obligations

The following are specification obligations, not callable implementations in this unit.
All 23 jobs outside the six read jobs return `unavailable`.

| Jobs or fallback | Missing implementation |
| --- | --- |
| `accountLabel` | Account-menu request on each supported site. No fallback label is manufactured by this gateway. |
| `membership` | Save-dialog membership request, both response shapes, and Music's permitted serving-tab fallback. |
| `playlists` | www playlist-aggregation request and Watch Later handling. |
| `channelOf` fallbacks | Plain `next` and `reel/reel_item_watch` requests when page data is unavailable. |
| `resolveChannel` | Plain `navigation/resolve_url`, bounded redirects and channel `browse`, with the specified offline cases. |
| `add`, `remove`, `addBatch`, `removeBatch`, `save`, `unsave`, `create` | Real playlist commands or requests, membership checks, account admission, returned identifiers and per-action effects. |
| `queueAdd`, `queueUndo`, `queueAddList` | www quiet queue commands, panel read-back, list and entry identity, confirmation and permitted undo retry. |
| `openCardMenu` | Targeted YouTube menu behavior. |
| `queueInsert`, `queueRemove`, `queueRemoveIds`, `queueMove`, `queueReinsert` | Music menu-item route, queue replay, real queue operations, reorder drop, casting restrictions and effect checks. |
| `like`, `library`, `navigate` | Music's own real handlers with the target's validated endpoints. |
| Request infrastructure | Real request port, sticky response-context account trip, app-state and playlist lanes, budgets and safe fallback rules. |
| Restricted operations | Cookie access, signing and recording remain absent and require their own approved handling. |
| Production composition | Live hook discovery and binding, site page-script entry wiring, registration/session ownership and activation remain outside this fence. |

Architecture 06 §6.2.5 through §6.2.10 and §6.5 own these obligations.
The existing `routes` table is their implementation extension point. No second dispatcher, no-op operation or successful stub was added.
