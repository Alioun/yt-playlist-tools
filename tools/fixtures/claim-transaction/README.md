# Synthetic local claim transaction

Run `bun --no-env-file ./tools/fixtures/claim-transaction/run.ts` from the repository root.

The command prints structured results, complete local batches, serialized saved state, and restarted results for four cases. They cover carried choices, existing choices, a filter-only claim, and a skipped shortcut that creates no Setup. Each restart reads `unclaimed: null` as consumed and preserves the original saved notice without another lookup or write.

The host exclusively owns its synthetic storage. Its `set` applies one atomic batch, and its lookup ledger survives writer recreation for each account and browser session. Authorities and ownership are trusted synthetic inputs. The command imports the core directly and accesses no browser, real storage, account, or network.

This writer cannot share storage with the filter writer or run in installed production. Sync-on claims, removal cascades, unknown identity lineage, and pending prior notices remain unavailable. After an unconfirmed write, queued and new calls return `unavailable/stale` without IO until disposal. Disposal rejects new calls and drains accepted work. The storage port has no physical removal operation.

Null contains no source content. It proves neither native multi-key crash atomicity nor live ownership. Production installation requires one Store lane, verified ownership and sender/session authority, complete sync admission, supported removal inventories, and saved-notice presentation and acknowledgement. Native checks are waived and unproven.
