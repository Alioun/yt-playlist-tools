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

# Pure canonical document wire

`sync-codec.ts` encodes canonical documents, reads complete sync snapshots and projects one proposed sync set. It is an uninstalled pure library. No production writer, storage adapter, startup registration, sync scheduler or conflict policy uses it yet. The upgrade planner's three-record local batch is not a sync batch.

DATA-09 and DATA-10 in `.scratch/rebuild/spec/04-features-accounts-data.md` define the keys and envelopes. DATA-10 at line 638 sets the single-document threshold to 7,600 UTF-8 bytes, inclusive. SYNC-14 and SYNC-18 define the other bounds. The exported constants are:

| Constant | Bytes or items | Inclusive limit |
|---|---|---|
| `SINGLE_DOCUMENT_BYTES` | Serialized full-document UTF-8 bytes | 7,600 |
| `SYNC_ITEM_BYTES` | Charged bytes for one key and value | 8,192 |
| `SYNC_BUDGET_BYTES` | Charged bytes for the projected snapshot | 98,304 |
| `SYNC_BUDGET_ITEMS` | Keys in the projected snapshot | 480 |

## Operations

- `encodeSyncDocument({ key, document })` accepts a canonical `DocumentKey` and a final JSON-form document. It validates known semantics with the existing model, then returns an entire deterministic batch or a refusal. It preserves the supplied JSON, including omitted default fields, unknown extensions and the exact stamp. Absent input is invalid. A valid newer version returns `newer-version` without encoded items. An unrepresentable stamp or key returns `item-too-large` without partial items.
- `readSyncDocument({ key, items })` accepts the full currently observed snapshot. It returns `absent`, `incomplete`, `invalid`, `newer-version`, `value` or `deleted`. Only the last two contain candidates, with their full original JSON and separately decoded model view. Reading never normalizes data, supplies a replacement document after an error, or changes the caller's last good copy.
- `projectSyncWrite({ current, set })` overlays a complete proposed set onto the entire current snapshot by exact key. It returns `fits`, `full` with measured usage and failed bounds, or `invalid`. It performs no write or deletion.

The key argument already carries the model's validated account and playlist brands. This module does not infer ownership from IDs. Item wrappers and arrays are typed caller-owned snapshots; item values cross the untrusted JSON boundary.

## Wire format

Only the leading `doc:` of the canonical local key becomes `s:`. Base keys are `s:settings`, `s:setup:<acct>` and `s:filter:<acct>:<playlist>`. Metadata such as `s:meta` is outside document decoding.

At or below 7,600 bytes, the base value is the supplied JSON object itself. For example, `{v:1,gen:"g",at:1,by:"b",data:{}}` produces exactly that object at `s:settings`. Model defaults appear only in the decoded view.

Above that threshold, the base value is exactly `{v,gen,at,by,n}`. Nonempty string fragments partition the compact JSON text of the full supplied envelope. Fragment keys are `<base>@<gen>.<i>`, with canonical zero-based decimal indexes. A one-fragment pointer is permitted. These string payloads and index conventions are pinned here before any runtime producer exists. Large tombstones follow the same rule.

Packing chooses the longest next fragment that fits the charged item limit. It splits only at Unicode code-point boundaries and charges JSON-string escaping, the actual key, index digit growth and overhead. Quotes, backslashes, control characters and multibyte characters consume their actual bytes. Lone surrogates remain escaped JSON data. The final pointer also has to fit. No compression, checksum, sorting, restamping or generated identity is involved.

Assembly parses names relative to the requested base, with the final dot separating the index. Generations may contain `@`, dots and non-ASCII characters. Only the pointer's exact generation supplies fragments. Stale generations and other documents cannot fill a gap. Duplicate relevant entries, including identical duplicates, are invalid. Missing parts remain `incomplete`; selected wrong-type, empty, malformed or out-of-range parts are invalid. Work depends on actual snapshot entries, never on an untrusted pointer's claimed count.

Complete strings concatenate before one JSON parse and model decode. The embedded `v`, `gen`, `at` and `by` must match the pointer exactly. A current ordinary record with its own `data` or `deleted` field takes precedence over an unknown `n` extension. A valid newer stamp returns before body or pointer interpretation. A malformed stamp remains invalid.

Missing and explicit-null base entries are `absent`, even with orphan chunks. Disappearance is separate from an explicit tombstone. The caller keeps its last good copy on absence, incomplete delivery, invalid data and newer versions. A complete candidate still needs the later conflict policy before adoption. This module neither selects winners nor expires tombstones. Generation and stamp checks do not detect every syntactically valid corruption or generation reuse.

## JSON and normalization boundaries

The existing strict JSON validator rejects accessors, functions, undefined values, sparse arrays, cycles and other unsupported data without invoking hooks. The private serializer composes containers from their own data and calls native JSON serialization only on scalar values and property names. It retains an own string-valued `toJSON` field as data. Encoding, reading and projection do not invoke inherited `toJSON` hooks.

The unchanged model enumerates schema fields with `for-in`. Until the shared model owner changes that loop, any enumerable Object prototype field makes encoding and non-absent reads return `invalid` with field `document` and reason `shape` before model decoding. Projection still counts own JSON data correctly. Non-enumerable inherited hooks remain supported. This library guarantee does not establish a future browser adapter's native serialization behavior.

The later writer owns normalization with the real domain context and final JSON materialization. Setup normalization needs actual shortcut IDs and resolved `additionalChosenPlaylists`, including shared Watch Later choices. An invented empty context could prune valid targets or marks.

Decoded filters can contain an undefined handle slot before future tuple columns. Such typed model data is not JSON form. After normalization, the caller explicitly bridges only that known placeholder:

```ts
const channels = normalized.channels.map(row =>
  row.length > 3 && row[2] === undefined
    ? [...row.slice(0, 2), null, ...row.slice(3)]
    : row
)
```

The caller also omits absent known optional object members. It must not convert unknown undefined fields to null or use a whole-object stringify round trip that could invoke hooks. Unexpected non-JSON extensions remain invalid. The transport codec performs neither materialization nor domain normalization.

## Quota projection and later writer

Every resulting item costs `utf8(key) + utf8(compactDataJson(value)) + 4`. The serializer matches native compact JSON on supported data with unmodified prototypes. Projection counts metadata, unknown keys, pointers, escaped string fragments, tombstones and retained old chunks. An overwritten key counts once at its new size. Duplicate keys within either supplied list are invalid. Projection validates resulting values, so an exact-key replacement can repair a malformed old value.

All three limits must fit. A proposed set that fits alone can exceed the full snapshot's budget. Promised cleanup provides no delete credit. Only a fresh snapshot confirming removal changes occupancy. Already overfull snapshots remain measurable, and an actual smaller replacement can restore a fit. Complete incoming documents remain valid even if browser-side merging exceeds the ordinary budget.

The later writer normalizes an intended edit, materializes JSON, supplies a fresh stamp, encodes every changed document and projects one combined set before any ordinary local commit while sync is on. It owns snapshot freshness, serialization of operations, native quota failures, durable pending state, retries, no-op suppression and cleanup of only its own chunks. It also owns joins, history, tombstone retention and SYNC-16 automatic-update headroom. A successful projection saves, queues and acknowledges nothing. Runtime integration must preserve existing session-access safeguards until verified replacements exist.

## Wire verification

Run the focused fixtures, shared boundaries, guards and compiler with prepared pinned dependencies and WXT types:

```sh
bun test --no-env-file --isolate --conditions=browser ./src/background/store/sync-codec.bun-test.ts ./src/shared/model/model.bun-test.ts ./src/shared/contracts/foundation.bun-test.ts
bun test --no-env-file ./tests/guards/architecture.test.ts
bun run --no-env-file compile
git diff --check
```

The adjacent test covers 13 fixture groups with an independent byte oracle and explicit red controls. It builds the actual browser-target minified CJS entry, verifies its seven runtime exports, inspects the pure runtime import graph and executes the emitted operations in a fresh VM with ambient-effect guards. Prototype-hook poisoning and native JSON red controls run in that isolated realm. These checks do not establish extension installation, native storage atomicity, live sync delivery or browser UI behavior.

# Pure account choice operations

`accounts.ts` exports `changeAccountChoice`, `removeSharedShortcut` and `planSetupRemoval`. It is an uninstalled library imported directly from `./accounts`. It returns decoded canonical bodies or semantic removal facts. It performs no storage, authorization, claim, ownership, stamping, sync or UI work.

`AccountSnapshot` distinguishes an absent setup from a present setup with its complete filter inventory, including kept and orphaned filters. Inputs are recursively readonly. Outputs may share unknown fields with inputs, so callers treat both as immutable. A positive playlist choice can create a setup. Clearing an absent choice and repeating a desired state return `unchanged` before normalization.

Auto-add selections append Videos without a percentage override. Unticking removes only the entry and keeps every filter unchanged. Takes and percentage edits require an existing entry and preserve its extensions. Percentages must be integers from 0 through 100. A null percentage deletes the override. A shortcut target requires an existing shared shortcut, even when its key is null or its feature is off. A null target removes only that account's override.

Every real account edit uses the existing model normalizer with actual shared shortcut IDs. The required `additionalChosenPlaylists` is the caller-resolved set of effective shared defaults after the operation. It includes Watch Later only when a surviving shared default actually applies to that account. The caller resolves this context from the same serialized snapshot as the edit. These IDs establish no ownership.

Kept filters retain a setup regardless of their switch, mode or channel count. A gather playlist also retains it. Labels and marks alone do not. Real writes drop dangling targets and marks. No-ops do not request sanitation writes. Filter bodies retain their decoded tuple extensions without normalization or JSON conversion. The JSON materialization boundary described above still belongs to the later writer.

Shared deletion removes the shortcut row and its target from every supplied present setup that contains that target. It preserves the preset flag and all unrelated settings, then normalizes changed settings and affected setups. Untouched setups receive no write. Removing the final row does not reapply a preset. Clearing a key remains the key engine's separate operation.

`SetupRemoval.documents` names exactly the setup and every supplied filter document. It also names `cache:<acct>` and all sixteen `progress:<acct>:0` through `progress:<acct>:15` shards. `clearAccountSession` requires the future executor to remove only that account's skips, cooldown, recent and recent-add entries, Gather records and account-scoped once-only memory. Global Pause and other accounts' session data survive. `clearLastAccountIfMatches` requires clearing only a matching `device.lastAccount`, preserving all other device fields. Shared settings, consent, sync state, unclaimed data and YouTube playlists survive.

These facts execute no deletion. The future writer owns private-origin enforcement, the shared-deletion cascade exception, version checks, complete snapshot reads, fresh stamps, JSON materialization, quota projection, session reducers, conditional device edits and native effects. With sync on it creates setup and filter tombstones and retains them for 30 days. With sync off it removes the local documents. Existing session-access safeguards remain in place.

The policy is ACC-06 through ACC-10, DATA-14 through DATA-16, DATA-32, DATA-44, DATA-45 and DATA-57 in the approved chapter 04, with R108, R125 and R135. Unclaimed merging and the carried-shortcut decision remain separate future work.

Run the acceptance suites with prepared pinned dependencies and WXT types:

```sh
bun test --no-env-file --isolate --conditions=browser ./src/background/store/accounts.bun-test.ts ./src/shared/model/model.bun-test.ts ./src/shared/keys/engine.bun-test.ts ./src/shared/keys/review-regressions.bun-test.ts ./src/background/store/sync-codec.bun-test.ts
bun test --no-env-file ./tests/guards/architecture.test.ts
bun run --no-env-file compile
bun test --no-env-file --isolate --conditions=browser ./src/background/store/accounts.bun-test.ts -t 'actual browser artifact'
bun --no-env-file build ./src/background/store/accounts.ts --target=browser --format=cjs --minify --outfile=/tmp/ytpt-accounts-artifact.cjs
git diff --check
```

The adjacent suite compares complete frozen outcomes for the eight fixture groups and executes the actual minified browser CJS exports with throwing ambient globals. It checks the exact runtime exports and pure model import graph. Compiler fixtures prove recursive readonly snapshots, branded IDs and required effective-default context. Native storage, private-window authorization and runtime integration remain unverified here.
