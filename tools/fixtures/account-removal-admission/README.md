# Account removal admission fixture

Run from the repository root with the configured dependencies installed.

```sh
bun --no-env-file ./tools/fixtures/account-removal-admission/run.ts
```

The command uses synthetic canonical records, consent, joined history and controlled clocks. It calls the existing account helpers to propose stamped Setup and Filter tombstones, or a Settings row removal with affected Setup documents. `planSyncWrite` admits each whole set against the complete raw local and physical sync snapshots.

The JSON output retains complete plans, snapshots and literal assertions. A refused or unavailable plan stages nothing. For an admitted account example, `fixture-staged-documents` identifies one synthetic local set and its exact readback. `owner-flush-result` comes from the actual existing `createLocalFilterWriter` flush. That owner sends the staged candidates with independent pending and previously acknowledged disappearance records in one sync set. The command checks acknowledgement, retained old chunks and an idle serialized restart. A separate real Filter edit exercises the unchanged singleton caller.

Budget controls include independently fitting candidates that exceed the combined budget, oversized superseded unsent records, retained physical chunks, unknown occupancy, exact item counts, and combined pending and restoration debt. Remote controls cover addressed future versions, null, incomplete or malformed generations, divergence and unresolved lineage. Shared shortcut cases use `removeSharedShortcut`, including an account retained by an off empty kept Filter and a missing row no-op.

`production-removal-not-implemented` is the explicit boundary. This command does not implement account removal, shared shortcut execution or Undo, incoming deletion, cache or progress deletion, session cleanup, or conditional lastAccount cleanup. Synthetic local staging is not an account-removal transaction receipt. The installed entrypoints do not construct this canonical owner. Native browser checks are waived and unproven.

The separate `joinObservations` group executes the real first-join transaction on `createStartingLocalFilterWriter`. Its two literal side choices check the complete account union, suppression and foreign tombstones, local cache and progress removal, actual session cleanup, truthful acknowledgements, and one paced first push. These join cleanup effects belong to the accepted join, independently of the older staged account-removal examples above.

The command interrupts every accepted stage, serializes all backing areas, disposes the owner, and starts another owner with different candidate IDs. Accepted restart writes nothing until explicit fixed resume. Outbound restart observes both pacing and opaque recovery holds. Results retain complete storage, batches, errors, effects, stamps, clocks, timers, listeners, and counters. Additional cases cover empty-copy creation, proven never-edited adoption, same-history refusal, private adoption, observed A-B-A, later-history waiting, cancellation, and third-generation refusal. Production remains unconnected, and native verification remains waived and unproven.
