# Pure 1.x upgrade planning

`planLegacyStartup(snapshot, context)` returns an inert classification, a canonical upgrade batch, or cleanup-only recovery. It is a library entrypoint. Extension startup and existing storage callers do not use it yet.

The approved policy is in `.scratch/rebuild/spec/08-release.md`, REL-MIG-02 through REL-MIG-40, with the R96 amendment in `docs/adr/0009-upgraders-keep-what-1-4-5-did.md`. R97 owns the note flags. R135 owns Gather data lifetimes. The planner reuses the merged canonical model and key kernel.

## Inputs

`StartupSnapshot` contains the local schema, raw canonical records, sanitized legacy values, observed legacy key names, and names of any interim keys. An absent stored record is `undefined`. A malformed stored record is refused. Schema is a positive safe integer. A valid newer schema returns before inspecting other inputs.

`LegacyEvidence` has no credential-value field. A future adapter must compute `refreshTokenWasNonempty` before deletion and supply only that boolean. Credential presence and authorization are separate facts. `values` accepts only the seven named noncredential legacy values. Supplied values must correspond to observed keys. This contract assumes a complete sanitized read of local evidence, including interim key names.

`MigrationContext` supplies the device ID, settings generation, nonnegative safe integer time, six-character shortcut ID, platform, and known browser commands. The planner validates them and never generates replacements. Device IDs and generations are nonblank strings, as permitted by the canonical stamp format. No clock or random source is consulted. If an existing device ID differs from the context, the planner refuses upgrade without writes or cleanup. Existing device preferences and unknown fields also refuse replacement.

## Results

- `newer-layout` is globally inert.
- `invalid` names a field and carries no rejected value or cleanup.
- `unsupported-state` refuses interim profiles or conflicting canonical state without a precedence rule.
- `fresh` writes only an absent schema marker.
- `current` produces no mutations.
- `upgrade` contains exactly `doc:settings`, `unclaimed`, and `device` for one local batch, followed by cleanup instructions.
- `resume` contains cleanup instructions alone. All existing document values and unknown fields remain untouched.

The nine released upgrade-trigger keys are distinct from the 17 deletion keys. Developer-only keys do not trigger migration. When a released key triggers migration, observing any of the eight developer keys sets `from` to `1.5.0`; otherwise it is `1.4.5`. This is a key-provenance convention, not a claim that 1.5.0 was published.

Interim `account:*`, `savedAccountKeys`, `sessionConsent`, `sessionGeneration`, and `legacyClaimed` state returns `unsupported-state`. Approved conversion cannot restore authorization history that an earlier runtime already deleted. It also cannot infer new consent or playlist ownership.

## Conversion

Free-text playlist cleanup extracts `list=`, decodes a query value, trims it, applies `^PL[A-Za-z0-9_-]{16,64}$`, and keeps first occurrences. Invalid nonempty entries count as dropped. Valid duplicates and empty entries do not count. Filter playlist keys instead use canonical playlist syntax. Filters retain off and kept rules and embed normalized display labels. Malformed filter semantics refuse migration.

Finite numbers and numeric strings use legacy rounding and clamping. Unset values become 50 without authorization and 0 with authorization. Explicit 0 stays 0. Feedback is on only for literal `true`. Consent stays null and sync stays off.

Shortcut conversion preserves the approved bare and Ctrl keys independently of recorder reservations. The first matching canonical warning supplies the note's clash ID. Stable IDs are `site:<site>:<action-id>`, `browser:<action-id>`, or `command:<command-id>`. The explicit action-ID table in `legacy-shortcut.ts` maps the kernel's warning metadata. Site warning precedence is YouTube, then YouTube Music, then browser warnings and commands in supplied order. No translated text becomes an ID.

The carried shortcut has no Watch Later default. The picker and Undo presets use canonical overlap checks. A key or playlist that survives creates the carried row, including unusable raw keys and playlists with no key.

## Cleanup and restart boundary

The future executor must complete these operations in order:

1. Persist the upgrade's three canonical records in one local set.
2. Execute `local-remove` as one batch for all 17 named legacy keys.
3. Execute `await-cleanup`, deleting IndexedDB `yt-playlist-tools` and session `channelCache`. Await both successes. A blocked or rejected deletion keeps startup blocked.
4. Execute `schema-last` after cleanup. Write 1 only when `required` is true.
5. Release startup and note-opening work only after cleanup succeeds.

A schema already equal to 1 does not prove cleanup succeeded. A valid pending note with all three canonical records resumes cleanup even when no old local keys remain. Resume does not use newly supplied IDs or time to restamp anything. Missing batch members, mismatched provenance, inconsistent kept counts, duplicate auto-add IDs, or a shortcut-target presence mismatch refuse cleanup. These checks use captured migration facts. Later settings edits keep their own values and stamps. The planner never repairs a torn canonical batch by rebuilding it from legacy values.

Page-owned extension-origin localStorage cleanup and note opening are later integration work. The planner performs no storage, browser, DOM, network, sync, account claim, or registration effect. Pure crash simulations do not establish native storage atomicity, blocked database deletion handling, or runtime startup ordering.

## Verification

Run the focused matrix and existing model and key suites:

```sh
bun test --isolate --conditions=browser ./src/background/store/legacy.bun-test.ts ./src/shared/model/model.bun-test.ts ./src/shared/keys/engine.bun-test.ts ./src/shared/keys/review-regressions.bun-test.ts
bun test ./tests/guards/architecture.test.ts
bun run compile
git diff --check
```

The tests compare complete canonical output, classify unsupported and malformed inputs, discard process state at crash boundaries, preserve unknown canonical fields, and execute the real minified public module with throwing ambient-effect guards. They inspect its recursive runtime import graph as well.
