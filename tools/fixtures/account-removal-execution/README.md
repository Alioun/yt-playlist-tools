# Explicit account removal command

Run `bun --no-env-file ./tools/fixtures/account-removal-execution/run.ts` from the repository root. It uses synthetic local, session, sync and startup ports. It invokes the actual owner's `prepareAccountRemoval` and passes the returned object to `removeAccountSetup`.

The command reports complete before, accepted, interrupted and final storage snapshots, awaited IO, original errors, results and restart readiness. Its normal paths cover every physical account Filter, cache and sixteen progress shards. Synced removal uses fixed tombstones and the existing combined flush. Retained chunks and unknown sync occupancy remain counted. Off-sync removal performs no sync IO or document stamping.

The interruption matrix serializes actual interrupted storage and creates a new starting owner. It covers worker restart with session retained and browser restart with session empty. IO checks inject rejection before and after application, ignored mutation, failed readback and every torn document-batch boundary. No fixture stages the desired removal effects.

Confirmation checks reject private or unknown windows, forged, cloned and other-owner tokens, changed inventory, label, scope and history. Pending checks protect recreated accounts, same-generation divergence, changed records and unrelated state. Preparation refuses known unsupported session encodings and orphaned inventory. Disposal drains accepted work. R155 checks retain original diagnostics and pending/held deadlines and require a later external flush event.

These are executable library fixtures. No browser, native storage, live account, sender validation or production confirmation UI is installed or proved.


Real removal now persists true edit provenance. Local deletion is confirmed before its history set. Synced fixed tombstones and repaired provenance share their intended batch. The accepted continuation stays until history and cleanup are confirmed. Restart completion also promotes provenance when documents are already absent or fixed, and unresolved torn repair debt stays held. No new stamp or sync access is added to local removal.
