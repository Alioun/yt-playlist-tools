# Perchling 2.0 build status

Rebuilt on 2026-11-01 from Git history and the coordinator thread, after the untracked ledger was deleted. The owner decided to keep this ledger in Git so a cleanup of untracked folders can't delete it again.

## Where the work is

`2.0/compose-units` holds the whole 2.0 tree. It started at `7fae9515a`, which combines the frozen 1,667-file source with three units: Gather manual completion, the queue button and the card menu. Their Git tree matched the computed tree `71da8cf6`. Every later change arrived as a merged branch:

| Merge | Branch | What it did |
| --- | --- | --- |
| `11710a0cc` | `2.0/gather-decisions` | G1, G5, and only a no-such-ID error counts as a closed tab or window |
| `92d947692` | `2.0/queue-copy` | G6, G8 |
| `942e5e3c7` | `2.0/card-menu-proposals` | G3, G4, G7 |
| `db45fa2b6` | (direct) | G15, card-menu budget 1.25 KB |
| `3b72e733b` | `2.0/fix-gateway-types` | 34 compile errors |
| `0b6331b85` | `2.0/fix-recovery-types` | 21 compile errors |
| `4843d0614` | `2.0/fix-settings-types` | 26 compile errors |
| `cbecf7084` | `2.0/fix-toaster-guard` | 7 compile errors, the toast layer mount, the architecture guard, Monitor replay cost |
| `18e749e6e` | `2.0/picker-reset-privacy` | G9 to G14, R171 to R175 |
| `afa3dd64d` | `2.0/fix-keys-music-fixtures` | shared `press()` without AltGraph, music sample jobs |
| `15eb10f4b` | `2.0/fix-clear-all` | last 6 compile errors, the Unclaimed test seed |
| `b739f919d` | `2.0/fix-pointer` | happy-dom focus and iframe test setup |
| `c5f54d148` | `2.0/fix-settings-fixtures` | early `subscribeView` subscriptions, 229 to 4 fixture failures |
| `446843bb1` | `2.0/fixture-gate` | `test:fixtures`, 144 gates over 62 folders, coverage guard |
| `fe803249d` | `2.0/fix-svelte-reactivity` | explicit one-time reads in Toast and KeyRecorder |
| `3f7cee725` | `2.0/fix-fixture-records` | TypeScript 7 codes, picker `undo` case, clear-all receive record |
| `6ba585299` | (direct) | relocated feature-switches negatives are the single copy |
| `baf9fe139` | `2.0/device-last-account` | G16, R176 |
| `a5bf9c3de` | `2.0/account-removal-tombstones` | G17 |
| `c27a93881` | (direct) | settings-import gate deadline 20 minutes |

Decisions G1 to G17 and the coordinator's own calls are in `decisions.json`.

## Checks

- `bun run compile` reports 0 errors at `c27a93881` (re-run after the package reinstall).
- The last per-folder fixture runs passed in every folder except the settings-import suite (deadline since raised) and the 3 key-settings account-lifetime tests (fixed by G17, not yet rerun in the gate).
- The first green full run is recorded in `full-run-b7fce832.md`: compile 0 errors, Vitest 322, Bun 3,774, fixture gates 143 of 143.

## Open work

- Sync gaps: equal-timestamp edits are a conflict where SYNC-11 breaks ties by device ID; a browser that expired an account doesn't adopt a newer live record that arrives later, because the store doesn't create documents that exist only in sync.
- Not wired in: the Gather execution adapter, SiteCore services for the queue button and card menu, the picker's page-side popovers.
- Not started: Gather automatic triggers (YT-GT-22 to 29), the `ui.gather*` routes, Gather feedback, UI and copy (YT-GT-31 to 35), quick-save.
- Unknown: how much of the spec is unbuilt. A requirement-by-requirement pass is recommended next.
- Never run: browser builds and bundle sizes, Playwright checks, mutation controls, live YouTube checks.
- Held: production, rendering and axe, native behavior. No review or PR has been requested.
- Smaller follow-ups: stale pinned hash manifests, `@webext-core/isolated-element` undeclared in `package.json`, KeyRecorder has no runtime render test, Monitor still replays every pending operation, one settings import costs about 2 s of CPU, write results have two shapes.

## Reconciling the main checkout

`t3-8e91ff1c` on `feat/2.0-store-write-preparation` still has 237 uncommitted changes from before the composition. Their relation to `2.0/compose-units` hasn't been checked.
