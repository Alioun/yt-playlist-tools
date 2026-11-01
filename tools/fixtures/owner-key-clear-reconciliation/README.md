# Owner, key and Clear-all reconciliation fixture

This fixture binds the Clear-all reset to the canonical key and feature durable progress. Nothing here has run. Every command is in `future-gates.json` and needs a later sole runtime lease.

`owner.bun-test.ts` builds the real Store lifecycle, owner, native adapters, router and Backend through `../clear-all/harness.ts` and seeds the key fixture data from `../key-settings/seed.json`. It covers these merged races:

- A received reset revokes every six-second shortcut Undo, including one whose row had no account targets.
- Local Clear all drains the owner, so the old owner and the fresh owner both refuse an old Undo receipt.
- Non-terminal key or feature progress holds a remote reset before any marker or erasure.
- An unreadable reset marker stays recognized held work.
- An interrupted reset, then a renewed agreement and later key progress, cannot replay the old cleanup.
- The single `uiContract` carries `ui.clearAll` beside `ui.change` and no parallel feature route.
- Every toaster and notice message added by the localization proposal has a catalogue entry with exact parameters.

`negatives.json` lists nine typed negatives. Each template puts its intended statement on line 3. `controls.json` lists six compiling mutations with their exact anchors, patches, named tests and static dry-run receipts.

`inherited-control-relocations.json` dry-runs every inherited patch that names a path this unit changed. `inherited-control-reanchors.json` carries the movable ones onto the reconciled source and keeps the rest held. Original patches and inventories are unchanged.

`merge-conservation.json` records each conflicted boundary's ancestor, donor, newer target and final identities with its resolution. `localization-conservation.json` records the toaster proposal's applied hunks and the relocation of its helper into `src/shared/copy/index.ts`. `unapplied-proposals.json` holds the outside-fence key catalogue assertion update.
