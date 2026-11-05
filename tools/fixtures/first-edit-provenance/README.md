# First-edit provenance derivation

Run the pure helper and real SyncState decoder with synthetic inputs:

```sh
bun --no-env-file --no-install tools/fixtures/first-edit-provenance/run.ts
```

The command prints complete observations and checks their serialized values. It reports `pure-derivation`, `production: not-connected`, and `owner-integration: pending`. It exercises unknown, unedited, edited, invalid, and contradictory history, off and on patches, retained extensions and R155 diagnostics, a no-op caller, and serialized restart input.

`prepareFirstEditHistory` requires an admitted actual changed-document transaction. Its patch belongs in that transaction's existing batch. A no-op caller does not request a patch. The helper supplies no write, consent, initialization, sync admission, or retry authority.

Settings, Filter, claim, and account-removal consumers remain pending the parent's shared-lane handoff. No owner writes, positive `false` initialization, backfill, join dialog, or production connection are implemented here. Unknown older profiles remain unknown for the future R164 join-choice consumer. Native checks are waived and unproven.
