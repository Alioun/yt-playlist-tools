# Synthetic local claim transaction

Run `bun --no-env-file ./tools/fixtures/claim-transaction/run.ts` from the repository root.

The command prints structured results, complete local batches, serialized saved state, and restarted results for five cases. They cover carried choices, existing choices, a filter-only claim, and a skipped shortcut that creates no Setup. The joint case holds claim lookup, queues a selected Filter edit, proves the edit has no read or write before release, then confirms the edit uses the claimed Setup and preserves notice and null. Each restart reads `unclaimed: null` as consumed and preserves the original saved notice without another lookup or write.

The host exclusively owns its synthetic storage. Its `set` applies one atomic batch, and its lookup ledger survives writer recreation for each account and browser session. Authorities and ownership are trusted synthetic inputs. The command imports the core directly and accesses no browser, real storage, account, or network.

The command constructs `createStartingLocalFilterWriter` and awaits real first-lane readiness before every initial claim and consumed restart. Claim and Filter edits use that owner's lane and lifetime. The five consented canonical cases initialize their exclusive records before construction. Their output labels them as separately preinitialized fixtures. They do not prove a consent transaction. Disposal drains before serialization or replacement.

Three additional startup cases execute fresh initialization, released-legacy migration, and cleanup resume after an injected database failure. Their snapshot reader, local get/set, and legacy-removal ports share one synthetic local area. The fresh case saves only schema. The migration saves one canonical batch, removes all legacy keys, awaits database and session cleanup, and publishes schema last. The resume case retains the committed canonical records across serialized restart. Claim remains `unavailable/startup` after release while consent is null and the upgrade note is pending. No token value is supplied.

Sync-on claims, removal cascades, unknown identity lineage, and pending prior notices remain unavailable. After an unconfirmed claim, the shared owner closes operation IO, cancels automatic resources, and cannot revive through manual calls. The executor's cleanup ports are separate from the claim storage port. Production remains on its interim runtime.

Null contains no source content. It proves neither native multi-key crash atomicity nor live ownership. Production installation requires explicit interim conversion and lost authorization policy, verified ownership and sender/session authority, complete sync admission, supported removal inventories, and saved-notice presentation and acknowledgement. Native checks are waived and unproven.
