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

The initial three-record batch saves the carried row's ID as `unclaimed.originalShortcutId`, including key-only, keyless and unusable-key rows. No row means no provenance field. Startup uses the shared `readStoredUnclaimed` reader. Resume preserves raw canonical records and the saved ID through row deletion, replacement, label edits and key edits. Older records remain readable without guessed provenance. Preset creation accepts required pending-ID reservations. The separate synthetic claim fixture does not establish production claim safety.

The carried shortcut has no Watch Later default. The picker and Undo presets use canonical overlap checks. A key or playlist that survives creates the carried row, including unusable raw keys and playlists with no key.

## Cleanup and restart boundary

`legacy-execution.ts` exports the non-owning `executeLegacyStartup` executor and its sanitized `StartupHost`. It completes these operations in order:

1. Persist the upgrade's three canonical records in one local set.
2. Execute `local-remove` as one batch for all 17 named legacy keys.
3. Execute `await-cleanup`, deleting IndexedDB `yt-playlist-tools` and session `channelCache`. Await both successes. A blocked or rejected deletion keeps startup blocked.
4. Execute `schema-last` after cleanup. Write 1 only when `required` is true.
5. Return `ok` only after confirmed cleanup and schema. Note opening remains a separate consumer.

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

The policy is ACC-06 through ACC-10, DATA-14 through DATA-16, DATA-32, DATA-44, DATA-45 and DATA-57 in the approved chapter 04, with R108, R125 and R135. `mergeUnclaimedChoices` implements the separate bulk claim policy and is consumed by the synthetic claim fixture.

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

# Pure canonical document body preparation

`write-preparation.ts` exports only `prepareDocumentBody` at runtime. It prepares one complete decoded Settings, Setup, or Filter body and returns either `{kind:"prepared", data: JsonObject}` or `{kind:"invalid", reason:"json"|"shape"}`. It is an uninstalled pure library imported directly from `./write-preparation`.

`PrepareBodyInput` has recursively readonly canonical data. Only the setup variant requires `context`, with both `shortcutIds` and `additionalChosenPlaylists` derived from the existing `SetupContext`. The caller supplies surviving shortcut IDs and resolved effective shared defaults from the same proposed snapshot. Watch Later belongs in that context only when a surviving shared default applies to the account. An explicit account target can override it. The function never mutates either set.

Preparation checks own data descriptors before copying known containers. It rejects invalid representations before a decoder or normalizer can discard them. It validates the candidate with the existing strict JSON validator, refuses enumerable Object prototype members before invoking the unchanged model, decodes the canonical body, and calls its authoritative save-time normalizer. A final narrow materialization and strict JSON check produce the result. An unsuitable root, including an unsupported root prototype, refuses shape. Invalid representations within record bodies refuse JSON. Only `DecodeError` becomes a model shape refusal. Other programmer errors propagate.

The representation exceptions are limited to these known optional positions:

- Settings omits undefined `char` on Undo, the shortcut picker, each shortcut key, and each canonical music-action key plus its picker. Unknown music-key entries stay opaque.
- Setup omits undefined label `handle` and `avatar`, and auto-add entry `pct`. Zero and empty strings remain values. Null reaches canonical validation.
- Filter omits a missing or undefined final handle at index two. When future columns follow, that one slot becomes null. Required slots and future columns never shift. Other holes and undefined values refuse.

Unknown own JSON fields survive at every level, including future tuple columns, inert string `toJSON` fields, and own `__proto__` data. Repairs depend on the known path. An invalid unknown alias remains invalid even when its known occurrence can be repaired. Unknown branches remain intact for the iterative validator, including deep extensions and repeated acyclic references. Input and output may share branches and remain immutable snapshots. No detached mutable copy or native browser serialization guarantee is provided.

This boundary accepts neither raw intake nor an envelope. It produces no stamp, key, quota verdict, no-op decision, permission result, storage transaction, or effect. The later writer preserves complete prior envelope JSON, supplies its owned stamp changes, validates the full envelope even with sync off, and encodes genuinely changed documents. Complete account-operation filter inventory does not authorize preparing or rewriting untouched kept filters. Production ownership checks, the carried-shortcut decision, and existing session-access safeguards remain separate.

The adjacent test compares literal complete bodies, checks invalid representations without getter access, exercises unsafe alternatives, and runs all variants on the actual minified browser CJS in a fresh guarded Node VM. Synthetic integration uses real account operations, normalizers, single and chunked wire encoding, and readback with preserved envelope extensions. The compiler fixture proves the exact API, canonical correspondence, readonly inputs, and unsupported-input refusal. These checks establish no production writer or native storage behavior.

Run the focused acceptance checks with prepared pinned dependencies and WXT types:

```sh
bun test --no-env-file --isolate --conditions=browser ./src/background/store/write-preparation.bun-test.ts ./src/background/store/accounts.bun-test.ts ./src/background/store/sync-codec.bun-test.ts ./src/shared/model/model.bun-test.ts ./src/shared/contracts/foundation.bun-test.ts
bun test --no-env-file ./tests/guards/architecture.test.ts
bun run --no-env-file compile
bun test --no-env-file --isolate --conditions=browser ./src/background/store/write-preparation.bun-test.ts -t 'actual browser artifact'
prep_evidence_dir=$(mktemp -d /tmp/ytpt-write-preparation-acceptance.XXXXXX)
bun --no-env-file build ./src/background/store/write-preparation.ts --target=browser --format=cjs --minify --outfile="$prep_evidence_dir/browser.cjs"
git diff --check
git diff --cached --check
```

# Serialized local filter-setting writer

`local-filter-writer.ts` exports `createLocalFilterWriter` and the types `LocalFilterChange`, `LocalFilterWriteResult`, `LocalWriteStorage`, `SyncStorage`, and `SyncFlushResult`. One instance serializes selected-playlist mode/on changes, supported local claims, incoming work, outbound flushes, and acknowledgements through one promise lane. Production startup and routing do not use it yet.

`change(origin, change)` accepts a trusted UI origin and branded account/playlist IDs. The browser adapter in `../adapters/local-filter-writer.ts` derives its API and sender types from WXT. Its `changeFromSettings(raw, sender)` authenticates this extension's exact options page and frame, requires a tab, validates the strict request, and rechecks the native window. Private or unknown native context refuses. Client origin, source, privacy, and window fields are invalid.

The executor first reads `schema`, `device`, `sync`, the complete addressed setup, and the complete addressed filter. It requires supported initialized consented state and a live setup selecting that playlist in `autoAdd`. Selection establishes component context, not playlist ownership. Newer layout, startup, sync-writer, and account-context prerequisites return `unavailable` separately from `ChangeResult`. With `Device.syncOn` false, history may be absent or a complete canonical `SyncState` with status `off`, including `joined: null`. Present malformed, partial, unknown-status, and known non-off histories require the later sync writer. While sync is off, neither construction nor execution accesses native sync. A sync-on intent requires complete history with non-null `joined` and status `ok`, `full`, or `update-needed`. It then reads all local storage and revalidates the authoritative schema, Device, history, Setup, and Filter before evaluating the operation. The exhaustive read is restricted to this fresh canonical synthetic fixture. A production schema marker alone proves neither migration nor credential cleanup.

`LocalWriteStorage.get` accepts exact keys or `null`. Its set accepts JSON values, including the canonical consumed null, and has no remove operation. The required `SyncStorage` supplies a full raw `get()` snapshot and `set(items)` for JSON objects and chunk strings. The browser adapter calls native `storage.sync.get(null)` and `storage.sync.set(items)` lazily. All storage reads execute inside the existing recovering lane.

Every operation reads fresh records inside the lane. Rejection does not poison later requests. No-ops retain the original persisted JSON without preparation, normalization, stamping, or a set. A nonempty mode change needs confirmation bound to the current envelope generation. An already achieved desired state remains a no-op even with an old confirmation.

A real mutation uses `changeFilterSetting` and `prepareDocumentBody`, preserves own envelope extensions, removes the owned `deleted` field when replacing a tombstone, and replaces only the owned stamp/body fields. Edit time comes from admission, generation is created only for a mutation, and `by` reuses the stored device ID. Strict JSON validation precedes decoding and the native write. Success requires one local set and exact full-inventory readback. Every changed Filter captures a detached complete inventory, revalidates it immediately before the set, and confirms its expected result afterward. The set includes any required first-edit history. No-op and refusal write neither provenance nor repairs. Editing back retains true provenance.

The canonical model decoder requires all four history fields without defaults. Pushed keys stay opaque and their nonempty generation values are retained. The writer validates the full raw history as strict JSON before semantic decoding and keeps it separate from the decoded view. Unknown own fields, nested extensions, inert `toJSON`, and own `__proto__` data survive. This writer never initializes history, changes joined or status, or creates a pending queue. Only exact confirmed generations change pushed.

`sync-write-admission.ts` exports `planSyncWrite`, the shared classifier for changed, unchanged, and flush intents. It also exports `sameSyncJson`, consumed by postflight checks for complete raw equality independent of key order. A planned result carries exact `SyncItem` values, sent document records, exact-readback repair records, and the full ordinary metadata authority. An unchanged result carries no plan. Ordinary `SyncMeta` is `{v,id,created,reset?}`, decoded without defaults and with unknown own fields retained. Admission requires supported layout 1, matching history ID, and absent or false reset. An own true reset, including a versionless marker, stays unavailable. Missing, malformed, newer, or changed-history metadata also stays unavailable. No reset or join choice is inferred.

A changed intent enumerates every physical canonical local `doc:*` record across all accounts, including kept Filters and tombstones. Pushed keys must round-trip through the canonical local document parser and have complete local records. Opaque pushed entries remain valid for sync-off history. Full raw envelopes supply outbound encoding, so omitted defaults and tuple extensions remain untouched. Unknown local document names, invalid JSON, unsupported unrepresented local generations, incomplete known sync documents, and supported incoming adoption debt stay unavailable.

The planner distinguishes represented current generations, acknowledged older baselines, and physically missing remote bases. A missing base adds the full local document to restoration even when its generation equals pushed. Present null and incomplete delivery cannot take that path. Same-generation divergent JSON is unavailable. An addressed newer remote version refuses `update-needed`, including on no-op. An unrelated newer document remains protected occupancy and excludes an older local overwrite. Unsupported local data can remain protected only when its complete newer remote envelope matches it.

One ephemeral map collects every sendable pending or restoration document. The exact stamped candidate replaces its prior entry before encoding. The existing codec encodes the complete map and projects it once against unfiltered native occupancy. Metadata, unknown items, tombstones, pointers, native old chunks, and every new chunk remain charged. No future cleanup provides capacity. A complete over-budget projection refuses `sync-full` before persistence. Global `full` or `update-needed` status does not prevent a fitting supported edit.

An admitted sync-on edit sets the addressed Filter and any required true provenance. If remote readback exactly represents a current local generation whose pushed entry lags, the same local set also repairs the complete raw history. Replacing local g1 with g2 records pushed g1, never g2. This preserves the only local evidence needed after a prior push lost its acknowledgement. The new Filter remains pending. Refused and unchanged intents repair nothing. No user edit performs a native sync set, incoming adoption, or status update. A sync-on no-op still reads fresh snapshots and checks addressed readiness and version, but skips preparation, generation, encoding, quota projection, and persistence. Its success reports an achieved local intent without claiming reconciliation.

The separate synthetic extension in `tools/fixtures/local-filter-writer/` uses the actual emitted adapter and executor. Its verifier checks the exact extension worker ID, real settings sender, the exact two-key native set/event/readback, real multi-key quota rejection, complete joined native reads, Filter-only writes, pending and restoration quota refusals, incomplete chunks, protected newer data, local quota-error recovery, clean full-browser restart, and desired-state retry convergence. Separate captured native methods seed and read synthetic data without contaminating writer counters. The fixture records writer sync sets from explicit flushes and its started automatic driver. Writer removes and clears remain forbidden. The same adapter instance receives settings edits and manual flushes. JSON-text fixture transfer preserves own `__proto__` data. It creates a fresh automation profile and uses no YouTube host access. Synthetic sender metadata tests and native incognito permission denial are separate evidence. Native private settings admission with incognito access granted remains unproven.

A resolved local set is the local edit acknowledgement boundary. Native IO errors during edits reject without automatic retry or rollback. Each explicit later intent rereads storage. A fresh writer after a lost reply returns unchanged if the desired state persisted. Clean restart does not prove power-loss atomicity or the outcome of an interrupted unresolved set. If a platform tears the two records into well-formed inconsistent values, the approved history has no switch-off generation baseline to reconstruct the bit reliably. This slice makes no stronger crash guarantee.

With the pinned dependencies and generated declarations prepared, run:

```sh
bun test --no-env-file --isolate --conditions=browser ./src/background/store/local-filter-writer.bun-test.ts ./src/background/adapters/local-filter-writer.bun-test.ts
bun run --no-env-file compile
bun test --no-env-file ./tests/guards/architecture.test.ts
bun --no-env-file build ./tools/fixtures/local-filter-writer/background.ts --target=browser --format=iife --outfile=/tmp/ytpt-local-filter-writer-fixture/background.js
bun --no-env-file build ./tools/fixtures/local-filter-writer/options.ts --target=browser --format=iife --outfile=/tmp/ytpt-local-filter-writer-fixture/options.js
node ./tools/fixtures/local-filter-writer/check-browser.mjs --fixture-dir /tmp/ytpt-local-filter-writer-fixture --evidence-dir /tmp/ytpt-local-filter-writer-acceptance
```

The verifier copies its manifest and options HTML. `--executable-path` selects an explicit testing-browser executable; otherwise it uses installed Playwright Chromium. Stable joined sync-on admission is fixture-seeded only. A later paced replicator must reread history and occupancy, reconstruct pending and restoration work, protect newer documents, and preflight the complete batch again before a native sync write. Joins, reset, incoming conflicts, status transitions, chunk cleanup, and paced replication remain with their lifecycle owner. The final Store's ready/migration lifecycle, consent invalidation, views, and production routing remain separate cutover gates. Existing account/session safeguards remain authoritative.


## Manual outbound flush and staged results

`flushSync()` takes no arguments on the core or adapter. Only the synthetic fixture consumes it. It reads full local authority inside the existing lane, exits while sync is off without native sync access, then plans against a complete native snapshot. It does not require a selected playlist. It encodes complete stored raw envelopes across accounts, kept Filters, switched-off Filters, and tombstones. Identical remote documents never enter the actual set. Their exact generations can repair stale pushed entries. Unknown occupancy and every old chunk remain counted. A flush with no native set can repair history even when unrelated occupancy exceeds the budget.

A fitting nonempty plan produces exactly one native sync set of the entire document and chunk batch. After it resolves, the owner rereads local authority before any more sync access. Changed readiness, Device, consent, or joined history declines acknowledgement. It then rereads full sync state, reruns the shared classifier, requires unchanged full raw metadata, and verifies every captured envelope against both latest local and complete remote readback. A newer copy, incomplete chunks, changed generation, or same-generation divergent data cannot become acknowledgement. The owner merges only these verified generations into the latest full raw history and awaits one local set when the map changes.

The internal outcomes describe distinct stages.

- `idle` performs no native sync set or history write.
- `reconciled` repairs exact-readback history without a native sync set.
- `pushed` identifies the captured sent generations after confirmation and any required acknowledgement.
- `unavailable` declines work requiring readiness, incoming adoption, or another lifecycle owner.
- `blocked` declines the whole outgoing batch because it exceeds the ordinary sync budget.
- `sync-set-failed` preserves the original native error and captured sends. A rejected call leaves its persisted outcome uncertain.
- `acknowledgement-failed` preserves the original local error. Its `source.kind` distinguishes a resolved set from readback-only repair.
- `unconfirmed` preserves the captured sends after a resolved native set. Its cause identifies authority loss, failed exact readback, or a post-set read error.

No result rolls back storage. A failed or uncertain non-native stage stops automatic attempts for this component instance. Opaque native set rejection uses the R155 hold below. A later explicit action reads fresh state. Exact remote/current-local g1 with pushed g0 permits readback-only repair or a combined changed-edit batch. After its conservative R155 floor, a clean restart repairs a lost set reply without resending. A lost acknowledgement reply with already-persisted history produces no further writes.

Native set resolution proves acceptance by this browser's sync area. It does not prove browser-account transport or a storage transaction. Metadata can change between preflight and set. Postflight declines stale acknowledgement but cannot undo that native write. Clean restart and genuine quota rejection do not establish atomicity during unresolved IO, process kill, or power loss. Interrupted multi-key local writes retain the existing limitation.

The native verifier exercises the actual adapter, sender, and same core instance. It compares a literal six-item batch, exact events and full raw readbacks, duplicate suppression, restoration, readback-only repair, retained replacement chunks, protected newer and incomplete records, authority loss, genuine local quota prearm refusal and synthetic acknowledgement failure, repair without resend, queued-edit combined repair, and clean full-browser restart.

This fixture-only component leaves structured native error classification, known-kind retry and production activation, incoming conflict policy, cleanup, migration readiness, and production startup to later units. It infers no error kind from message text. Granted-incognito admission, Firefox, minimum browser versions, and live browser-account transport remain unproven.


## Event driver and shared pacing

The fixture explicitly calls `startSync()` on the same adapter used for settings edits and manual flush. Production startup does not install it. The core requires an injected monotonic `SyncClock` and `onSyncResult` consumer. The browser adapter uses `performance.now()` for pacing, native one-shot timers, and a lazy `storage.sync.onChanged` subscription. User document stamps retain the original wall-clock intent time.

One serial owner holds edits, event checks, native attempts, postflight, and acknowledgement. Its lifetime is inactive, active, automatically stopped, or disposed. Construction and off-sync start or edits perform no sync access, including subscription. Repeated start keeps one area listener. Observing off cancels its ticket and listener without another sync read. `dispose()` blocks new work immediately, cancels both, and resolves after previously accepted lane work drains. A replacement owner starts only after that drain or confirmed full-browser exit.

Only a successful changed local commit moves the quiet deadline to commit time plus 2,000 ms. Unchanged, refused, unavailable, and failed edits do not postpone it. Every actual native set, including `flushSync()`, checks that deadline and the next invocation boundary. Early manual calls return `{ kind: "deferred", notBefore }` in the clock's monotonic domain. A native invocation, including a rejection, charges the next 5,000 ms immediately before the call. A new owner starts with a 5,000 ms first-set barrier. Exact-readback history repair needs no push slot and can run during that barrier.

Start and sync events inspect fresh whole snapshots. Each external event may own one cancellable short follow-up. A timer consumes its ticket and queues one pass. Its callback never arms another timer, holds a plan, polls, or invokes the public enqueue path. Queued edits and area events wait behind the active native operation and acknowledgement, then inspect current state or schedule their own follow-up. Manual native attempts invalidate obsolete tickets. Own-write area events reread after acknowledgement and end idle without a duplicate set or timer.

`onSyncResult` receives automatic flush results or `{ kind: "rejected", error }` for a rejected preflight. Native set failures, acknowledgement failures, unconfirmed sets, and rejected passes retain their original errors and stage information. Acknowledgement, unconfirmed and rejected non-native stages stop the instance. Opaque native set rejection instead retains the area listener and the persisted R155 hold. Later starts, events, and edits cannot clear a generic stop. Explicit manual calls remain paced and observable and never clear the stop. Deterministic `blocked` and `unavailable` plans can be checked by another independent event.

This is an incomplete internal component. Native Error text supplies no approved rate discriminator. Opaque recovery follows R155 without an error parser or persisted rate journal. It adds no user-intent replay, status rewrite, join or reset choice, chunk cleanup, or production recovery. The initial five-second barrier does not preserve the specified sixty-second hold after a genuinely classified rate failure. Native success proves this browser's sync-area acceptance only.

## Pure sync inventory

`readSyncInventory({ items })` in `sync-inventory.ts` reads a supplied complete physical snapshot. It returns exact canonical bases in input order, each with its unchanged `readSyncDocument` result, and whole physical occupancy from `projectSyncWrite` with an empty set. Invalid physical JSON or duplicate keys invalidate the inventory. A semantically invalid document remains an individual result. Over-budget snapshots remain readable with `full` occupancy.

Metadata, unknown keys, and retained old chunks count toward occupancy. Chunks alone do not create a document record. A physically present null base produces a record with an `absent` result, while an omitted base produces no record. Raw additive fields retain the codec's semantics. The helper performs no normalization, storage access, caching, timers, or mutation.

This is an observation of the supplied items. It establishes no freshness, lock, Device authority, joined history, adoption, ownership, supersession, recovery, or deletion permission. Callers retain the original items. Production callers are unchanged. Native verification of this unit is waived and unproven.

`receiveSyncDocument(key)` manually receives shared Settings, one Filter, or one
bounded Setup on the same serial owner as edits, flushes, and sync events. The browser adapter forwards to that owner. The
synthetic worker exposes `localFilterFixture.receiveFilter(name)`, which parses a
canonical Filter key and rejects invalid input before storage access.
`localFilterFixture.receiveSettings()` forwards the Settings address on the same
adapter. Both factory contracts use `SyncReceiveKey` and `SyncReceiveResult`.
The worker also exposes `receiveSetup(name)`, which requires an exact canonical Setup key.
The derived key union includes only Settings, Filter, and Setup.

The operation requires initialized consent, sync on, a steady joined history,
and an existing supported local target. Filter additionally requires a supported
existing live Setup for the same account, including an empty Setup retained by
that kept Filter. Reception does not require playlist selection. Local UI edits
still require selection. Missing, null, malformed, future, or deleted Setup
remains unavailable before sync access. Settings needs no Setup, account, window lookup,
or permission query. Its per-device-looking extensions remain inert data.
Interim legacy markers make it unavailable before sync access. A complete
same-history incoming Settings, Filter, or intrinsically retaining Setup
can replace an existing acknowledged target only when its generation differs and
its edit time is strictly later. Equal times, pending targets, future versions,
tombstones, absent or incomplete documents, joins, and resets stay unavailable.
An exact raw match is idle and does not repair acknowledgement debt.

Adoption replaces the whole raw envelope. It preserves unknown fields and omitted
defaults without merging the losing local body. One local set contains exactly
the target and current raw history with only that target's pushed generation
updated. Unrelated pending documents and bookkeeping stay exact. Finite local
and sync preflight reads check the captured authority and raw observations again.
Filter reception retains every raw Setup equality check, including unknown fields.
A pending Setup does not block an acknowledged Filter while that raw Setup stays
exact. Its body and acknowledgement remain untouched. Selection changes authorize
no Filter deletion, cache or progress purge, account removal, or ownership claim.
Remote-only document creation remains excluded.

Setup reception requires a supported existing acknowledged local target. Its old
body may be sparse or empty. The supported incoming body must contain a nonempty
`autoAdd` or a non-null `quickSave`, `musicSave`, or `gather`. This proves retention
independently of Filter and shared Settings inventories. Incoming empty, label-only,
marks-only, and target-only bodies return `unavailable/account-context`, even before
exact-match idle. A valid shared shortcut or a kept Filter does not widen this
partial capability. Deferred candidates receive no write, acknowledgement, or marker.

Setup's target is its own raw stale baseline through L2. L3 compares it with the
incoming raw value. Only Filter has a separate supporting Setup baseline. Successful
manual adoption retains exactly L0/R0/L1/R1/L2/set/L3/R2, four local gets, three sync
gets, and one two-key local set. No normalization, default insertion, pruning,
merging, generation, or edit stamp occurs. Dangling targets and unchosen marks stay
raw. Unticked Filters, cache, progress, account-session data, and Device stay exact.
This component does not infer account identity or playlist ownership.

After the set resolves, local and sync readbacks must match before `adopted` is
returned. The lane remains held through those reads.

A precommit read rejection preserves the original error and rejects the call.
A rejected local set returns `local-set-failed` with the original error and
attempted record. Contradictory postflight observations return `unconfirmed` with
an authority or readback cause. A postflight read rejection returns `unconfirmed`
with its original error. These opaque failures stop automatic work. A successful
manual retry does not clear that stop. A native rejection has unknown effects;
there is no rollback, retry, durability guarantee, or remote lock. Foreign writers
can race after the final observation, including during the last sync read.

Successful, idle, and deterministic unavailable receives do not change outbound
tickets, quiet periods, pacing, subscriptions, or automatic-result callbacks.
The receiver writes nothing remotely and creates no stamp. Store view propagation,
losing pending-edit visibility, ownership, identity conversion, cleanup, and
production startup remain outside this fixture.
Static worker builds and synthetic VM tests do not establish native execution.


## Automatic incoming documents on the fixture owner

`startSync()` and the existing sync-area listener receive supported incoming
Settings, Filters, and intrinsically retaining Setups before their ordinary outbound attempt. Startup checks consent, schema,
steady history, sync-on state, and interim markers before subscribing. Each event
captures one sorted list of own existing canonical local Settings, Filter, and Setup
addresses inside the same lane. It calls the shared private receiver serially, once per captured address.
Each receiver reads fresh bodies and authority. The list supplies addresses only.
Remote-only documents, chunks, unknown names, and opaque pushed entries create no
targets. A new local address waits for another independent event.

Adopted, idle, and target-specific unavailable results allow the next address.
Authority or history unavailability ends the pass. At most one local-only read
can observe off after authority loss. Rejected reads, rejected local sets, and
uncertain readbacks stop automatic lifetime and cancel its listener and ticket.
The callback uses the existing `rejected` variant with the original error, or
`unavailable` for authority or readback uncertainty. It emits no adopted result.
Successful explicit manual calls never clear a stopped lifetime.

After a completed incoming pass, the unchanged outbound attempt rereads whole
local and sync snapshots. It can send an independent pending Q after adopting F.
An unsupported divergent document still blocks the complete batch. No partial
send bypasses that document. An `idle` callback describes outbound work even
when an incoming document changed locally. Adoption does not change sync status.

Incoming adoption changes no edit stamp, quiet deadline, invocation deadline,
or outbound ticket. The subsequent attempt owns the ticket's existing terminal
cancellation or deferral. Changed user commits alone set the two-second quiet
period. Every actual sync set retains the five-second invocation spacing and
the fresh owner's initial barrier. Timer callbacks remain outbound-only. They
consume one ticket, perform no incoming scan, and never rearm themselves.

The captured address count bounds each pass. An adopted target uses four local
reads, three sync reads, and one local set. Enumeration adds one local read.
The outbound attempt also confirms durable admission and complete raw state before invoking sync. This is a
finite IO bound, not a native performance measurement or production approval.
The receiver's last-read foreign-writer limit and all manual exclusions remain.
There is no all-pass transaction, rollback, automatic retry, new conflict policy,
account claim, join, reset, tombstone execution, cleanup, or production activation.

Source tests, saved minified browser-target core execution in fresh Node VMs,
and the saved fixture worker exercise this composition with synthetic
storage and clocks. Native verification is waived and unproven. These checks do
not prove native durability, account transport, interrupted IO, Firefox, minimum
versions, or full Store notifications.

Incoming Settings never runs `prepareDocumentBody`, applies presets, inserts
defaults into storage, or changes Device choices. Sparse supported bodies and
untrimmed shortcut labels remain raw. An absent Settings target is never
synthesized. A Settings adoption writes exactly `doc:settings` and `sync` in one
local batch. Each target rereads current history, so a later Settings adoption
retains a Filter acknowledgement from earlier in the same sorted pass.

This document-only component remains uninstalled. It does not complete Store
notifications, TabView delivery, feature reconfiguration, permission handling,
progress purge, or any production effect.

This incoming Setup capability remains uninstalled and partial. Full Setup lifecycle
reconciliation, Filter-dependent empty and shortcut-target witnesses, empty removal
and cascades, remote-only creation, tombstones, joins, reset, conflict policies,
Store notifications, and production account behavior remain separate work. Timers
remain outbound-only. Global unresolved debt can still block every outbound send.
Native browser behavior and durability remain unproven.


# Shared owner for synthetic local claims

`createLocalFilterWriter` requires an explicit `ClaimHost` and supplies zero-argument `claim()` on its existing lane. The fixture host supplies trusted authority, browser-session lookup budget, and ownership ports. The browser adapter supplies `{kind:"unavailable"}`, refuses claim before dependency calls, and exposes no claim method or RPC. `local-claim-writer.ts` exports the non-owning internal `executeLocalClaim` transaction. It has no lane, lifetime, disposal, or persistent uncertainty state. Only the combined owner invokes it in runtime source.

[The claim fixture](../../../tools/fixtures/claim-transaction/README.md) initializes its exclusive synthetic canonical records before constructing this owner. Its joint case holds claim lookup and queues a selected Filter edit. The edit waits, then reads the committed Setup and preserves the exact saved Device notice and null. Disposal completes before serialization and owner recreation. All cases use `createStartingLocalFilterWriter` and await its actual first-lane readiness before claim. The consented cases are separately initialized before construction and do not simulate Agree.

`mergeUnclaimedChoices` appends missing owned choices, preserves current Filters and explicit targets, and fills only the saved original row's empty target. It resolves surviving Watch Later defaults after the proposed target map and normalizes only a real Setup save. `materializeDocumentBody` copies its JSON representation without another normalization. Existing `prepareDocumentBody` retains its normalization behavior.

The writer refuses sync-on, incomplete or unsupported inventory, uncertain lineage, semantic removal, and a pending prior notice. It rechecks authority and the full raw snapshot before one atomic fixture batch. That batch contains changed envelopes, the exact Device notice, `unclaimed: null`, and any required first-edit history. Unchanged documents and Settings receive no write.

Both resolved and rejected sets require complete readback. Only the exact candidate plus unchanged nonwritten baseline confirms commitment. An exact old baseline after rejection reports `failed/set-not-observed` with the original error. Mixed, newer, unreadable, or authority-lost outcomes are unconfirmed. The owner latches uncertainty before releasing its lane and cancels its subscription and one-shot ticket. Queued and new Filter edits and claims return `unavailable/stale`, receives return `unavailable/authority`, flushes return `unavailable`, and start does nothing, all without dependency effects. Manual success cannot revive the owner. Generic automatic stops remain independent. Disposal takes precedence for new calls and drains accepted claim work without fabricated success.

Consumed null prevents another claim after restart and preserves the saved notice. No remove port, compaction callback, content journal, or digest exists. Native crash atomicity, the last-observation race, and live ownership remain unproven. Native checks are waived. The adapter excludes another constructor for the same actual `storage.local` area object while active or draining. Its stable error is `Local storage already owned`. Successful awaited drain releases the weak ownership entry. Failed disposal retains exclusion. This is adapter-local same-process protection. Synthetic hosts still promise exclusive access, and foreign contexts, native writers, and unresolved IO across process death remain outside that protection.

Claim calls and completion do not create an R155 event, grant, epoch, or timer. Existing hold, clocks, pacing, and diagnostics remain on the same owner. A claim with actual document changes prepares true provenance while preserving all raw recovery extensions. Notice-only and consumption-only commits preserve history exactly.

Production installation still requires native startup integration, explicit interim-profile conversion and lost authorization handling authority, complete sync and removal admission, verified sender/session ownership, current-row identity paths, and exact notice delivery and acknowledgement.


## Synthetic startup readiness

`createStartingLocalFilterWriter` accepts the existing writer dependencies plus `startup: StoreStartupHost`. This extends `StartupHost` with mandatory `readInterimSnapshot()`. Its stable `ready(): Promise<"ok" | "newer-layout">` runs interim retention before the legacy executor as the first job on the same lane. `createLocalFilterWriter` keeps its preinitialized API and exposes no readiness claim. Both constructors use the same internal owner, claim uncertainty, R155 recovery, subscriptions, and disposal lifetime.

The executor reads complete sanitized migration evidence and uses `planLegacyStartup` unchanged. It writes only schema on fresh startup. A current snapshot requires an observed schema of 1. A partial current state without schema returns `unconfirmed/schema` and receives no repair. Upgrade confirms the exact three-record batch and unchanged schema, legacy evidence, and interim names before cleanup. Resume preserves raw canonical omissions, extensions, original ID, and stamps. One local removal contains all 17 named keys and requires absent-key readback. Database and session cleanup run together, and both settle before any schema publication or rejection. Schema is last, with final raw canonical confirmation even when the marker was already 1.

Plan refusal and unconfirmed execution reject readiness with `StartupReadinessError.result`. The error message contains no snapshot values. Port rejection retains the original error. Initialization failure stays latched independently of the recovering lane. A fresh explicit owner can resume persisted complete migration state after awaited disposal. There is no automatic initialization replay.

Before successful readiness, claim returns `unavailable/startup`, Filter changes return `unavailable/startup`, incoming operations return `unavailable/authority`, flush returns `unavailable`, and start does nothing. Newer-layout Filter changes retain their explicit reason. These calls perform no operation dependency effects and capture no R155 arrival grant. A newer layout admits no work. Disposal closes calls immediately, drains accepted startup IO, and prevents readiness from releasing the consumer.

Readiness proves only this synthetic initialization contract. It supplies no consent, note completion, ownership, sync opportunity, or R155 grant. The actual command also executes fresh, released-legacy, and interrupted-cleanup resume cases. Released migration remains unavailable to claim while consent is null and the note pending.

Production still uses the interim runtime. Native sanitization and effects, interim conversion and erased authorization policy, installed consumer cutover, read/view propagation, note acknowledgement, and final privacy approval remain separate. These fake ports and emitted-library checks do not establish installation, native multi-key atomicity, crash durability, foreign-writer exclusion, blocked native handles, or late native effects after a rejected promise. Native checks are waived and unproven.


## Opaque native write recovery

The existing filter writer owns R155 recovery on its serialized lane. Its actual fixture worker uses the same browser adapter instance for edits, area events, start and manual flush. Production startup does not install it, and the separate claim fixture cannot share its storage.

Before a fitting nonempty native set, the writer saves `sync.opaqueWrite.gate` as pending and confirms the complete expected raw local snapshot. It then rereads remote inventory, reruns the complete quota projection and checks full local authority again. Changed unknown fields count as stale. Pending evidence stays when authority changes, without a cleanup write over newer data.

A rejected native set returns the identical original error and captured sent records. It starts a monotonic minimum of 60 seconds at rejection observation and saves a held Unix deadline with the safe own-data name and message. `recoveryPersistence.error` reports failed held persistence separately. The confirmed pending marker protects restart admission when the diagnostic could not be saved. Unsaved diagnostic text has no crash-retention guarantee.

A fresh owner imports no old monotonic timestamp. It reconstructs a new minimum 60-second floor, respects a longer remaining wall deadline, and confirms pending-to-held normalization. Forward wall jumps cannot shorten the monotonic hold. Backward jumps prolong it. Invalid clock values and regressing monotonic time prevent admission.

Each external request captures its arrival clocks and recovery epoch before enqueueing. An event that arrived early stays early after queue delay. Renewed rejection invalidates queued grants. Only a later eligible start, sync-area notification, manual flush or changed edit can admit another current-state pass. A qualifying event may own one ordinary quiet or pacing ticket. The callback consumes it once, remains outbound-only and cannot rearm. Silence and completions grant nothing. Holds have no timer, alarm, polling or local-area listener.

Opaque holds retain the sync-area subscription. Startup, incoming, preflight, postflight and acknowledgement errors retain the existing generic stops and original stage results. A resolved native call with failed acknowledgement is distinct from an opaque native rejection. Exact readback repairs accepted generations without resending them. Success clears pending in the same confirmed raw-history acknowledgement, including restoration without a new generation. Queued new generations are never acknowledged by an older set.

`SyncClock.wallNow` supplies only durable recovery time. `SyncClock.now` supplies monotonic pacing and quiet time. The original `deps.now` remains the user-edit stamp. Synthetic fixture wall-clock counters now include bookkeeping; complete document envelopes and generation counters establish absence of restamping.

`opaqueWrite` is optional local bookkeeping with strict known-field validation. Absent old fields need no migration write or schema change. Unknown compatible root and nested extensions, own `__proto__`, inert `toJSON`, raw omissions and unrelated pushed entries survive. The last diagnostic shares the existing local sync lifetime. Switching sync off clears nothing and accesses no native sync storage. Clear all data owns removal.

Native strings remain local diagnostic data. Descriptor-only projection evaluates no getters, coercion, stack, cause, prototype or serializer. The writer logs no diagnostic values and exports none to sync documents, Settings files or the shareable Diagnostics report. No error text becomes a quota, rate or transport category.

Browser-free source, saved emitted-byte and synthetic restart checks do not prove native durability, atomicity, power loss, unresolved native IO across process death, browser-account transport, live identities, granted-incognito behavior, Firefox, minimum-version binaries or production cutover. Native checks are waived and unproven.

## Pure shared Settings edits

`changeSharedSetting` in `./settings-edit` computes a theme or default required percentage edit from a recursively readonly, already decoded Settings body. It returns `unchanged`, `invalid` with `invalid-percentage`, or `changed` with the complete Settings body. Equal valid values return before normalization. Invalid percentages are refused without coercion. Real edits use the existing Settings normalizer, preserving compatible unknown fields and shortcut identity while applying saved-label limits.

The helper performs no storage, Origin authorization, stamping, encoding, or notification. Its changed body goes through `prepareDocumentBody` for JSON validation and materialization. Shared theme and percentage edits are allowed from private windows under ACC-38 and DATA-32. The helper has no Origin parameter. The serial owner supplies the separate readiness, consent, version, budget, persistence, and confirmation checks below.

## Narrow synthetic Settings read, edit, and follow

Both existing owner constructors expose these additional methods:

```ts
read(view: "settings"): Promise<SettingsRead>
subscribe(fn: (event: SettingsEvent) => void): () => void
changeSharedSetting(origin: Extract<Origin, { kind: "ui" }>, change: SharedSettingChange): Promise<LocalSettingsWriteResult>
```

`readSettingsView` is imported directly from `src/shared/model/settings-view.ts`. It returns a detached recursively readonly Settings value, `newer-version` with the observed version, or `invalid`. Undefined, null, and supported tombstones read as fresh defaults. Partial supported bodies acquire defaults only in memory. Unknown nested fields are detached. Reading never normalizes labels, creates a Device ID, materializes an envelope, or persists anything.

The owner's `SettingsRead` adds `unavailable` with `startup`, `newer-layout`, `disposed`, or `stale`. The startup-enabled constructor must finish its real `ready()` first. Failed startup remains latched. After readiness, reads need no consent or completed upgrade note. They use exactly `schema` and `doc:settings` on the existing lane. They neither enumerate inventory nor touch sync, claim authority, stamps, clocks, or retry admission. The preinitialized fixture constructor still has no `ready()` method.

The new write method admits only the delivered theme and default-percentage union. Its UI Origin is trusted synthetic injection. Private shared configuration is allowed. Native sender validation and routing remain unimplemented. Consent, pending-note, history, layout, and document-version guards still apply. Edits inspect the complete local inventory and refuse interim markers. Sync-off edits never access sync. A real edit batches only Settings and any required existing off-history edit bit. Absent history stays absent. Sync-on edits use the full pending and restoration inventory, actual unknown occupancy, and retained chunks before any local commit. Exact old-generation pushed repairs may share that batch. The new generation remains pending. Sync-on no-ops still check addressed version and readiness, including future-version refusal, while avoiding preparation, stamps, quota projection, repairs, persistence, and wakes.

`LocalSettingsWriteResult` distinguishes `committed`, `unchanged`, existing `ChangeResult` refusals under `result`, and `unavailable` with the four read reasons or `sync-writer-required`. A pre-set port error returns `failed/before-set`. A rejected set returns `failed/set` with the original error and receives no speculative readback repair or replay. A resolved set needs exact affected raw values and unchanged schema, Device, and history before `committed`. Missing or divergent readback returns `unconfirmed/readback`. Disposal returns `unconfirmed/authority`. Rejected readback returns `unconfirmed/read-failed` with the original error. Failed sets and unconfirmed local edits latch the existing global uncertainty boundary. Reads, claim, Filter and Settings edits, receives, and sync admission remain closed until a fresh owner is constructed after disposal. Automatic-stop behavior for the previously delivered incoming receiver remains unchanged, including its explicit manual-adoption recovery oracle.

`SettingsEvent` is exactly `{kind:"settings-changed",source:"local"|"sync"}`. A confirmed real local edit emits once before its promise completes. Incoming Settings emits once only after every existing local and remote adoption check passes. No-op, refusal, failed or unconfirmed outcomes, idle/conflicting/incomplete incoming documents, Filter or claim work, and sync bookkeeping emit nothing. This is a Settings-only invalidation subset. It is not general `StoreEvent` or full Store conformance.

Observer callbacks run without awaiting their promises. Throws and rejected observer promises cannot reject a committed edit or stop other active observers. Registrations have independent, idempotent unsubscribe functions. Disposal clears them immediately, invalidates pending read completions, and drains accepted work. Reads and observer lifetime changes create no R155 retry grant. Changed edits preserve arrival time and epoch across queue delays. The existing sync driver owns quiet periods, pacing, holds, prearm, and acknowledgement.

The actual [claim command](../../../tools/fixtures/claim-transaction/README.md) now consumes these APIs for Settings load, private theme edit, percentage edit, following changes, and serialized restart. Its real `followSettings` consumer subscribes before its initial read and discards obsolete asynchronous results after a live invalidation or disposal. A separate schema-only case reads defaults while writes remain refused before consent. All eight preceding claim and startup cases remain.

Production entrypoints, adapters, components, and installed session/privacy safeguards remain unchanged. No installed production gap is closed. General Change, StoreEvent, TabView, other View mappings, consent or note mutations, clearAll, native sanitized startup, sender admission, interim conversion Q7-Q11, and final privacy approval remain outside this unit. These synthetic reads and exact fake-port confirmations establish no native crash atomicity, foreign-writer exclusion, or last-observation guarantee. Native checks are waived and unproven.

## Saved claim notice read and exact acknowledgement

Both existing constructors add `readClaimNotice(): Promise<ClaimNoticeRead>` and `acknowledgeClaimNotice(origin: NormalUiOrigin, expected: Snapshot<ClaimNotice>): Promise<ClaimNoticeAcknowledgement>`. `NormalUiOrigin` narrows the existing UI Origin to `incognito: false` for this synthetic caller. `Snapshot` comes from the delivered Settings view type. Neither method adds an account authority provider or a second owner.

`claim-notice.ts` exports the pure `projectClaimNotice` and non-owning `executeClaimNoticeAcknowledgement`. The projector returns `empty`, a recursively frozen detached `pending` notice, `held` for consent or pending upgrade note, `unavailable` for unsupported startup, newer layout, or stale owner state, or `invalid` for records, schema, or Device. It validates present notices before withholding them. A schema-only snapshot remains held without creating Device. Supported partial Device defaults stay in memory. Compatible nested extensions survive validation and projection.

Notice reads and acknowledgement use the existing lane. Calls after disposal reject with the existing `Writer disposed` convention. Awaited reads recheck readiness, disposal, and global uncertainty before publication. Reading has no persistence, sync, stamp, generation, retry, event, or timer effect. Acknowledgement captures the complete expected notice at invocation and compares every saved field and extension. Object key order is irrelevant. Missing notices return `unchanged/empty`; different notices return `unchanged/different-notice`. Neither path writes.

An exact match requires current consent, no pending upgrade note, supported canonical startup, fresh complete local preflight, and an available owner. The executor changes only raw Device.claimNotice to null and calls local set once with only Device. Raw omissions and all other records remain exact. Sync status, a future Settings document, denied site access, and an opaque sync hold do not require remote inventory or a permission request for this local operation. No Settings event or recovery ingress is created.

Complete expected readback is required for `committed`. Rejected set with exact applied readback commits while retaining the original rejected observation. Rejected set with unchanged baseline is `failed/set-not-observed`. Resolved or rejected set with divergent or unreadable readback is `unconfirmed`. Disposal after an attempted set is `unconfirmed/stopped`. Original errors remain intact. Pre-set exceptions return `failed/before-set`. Unconfirmed notice operations latch the delivered global uncertainty barrier before releasing the lane. No acknowledgement retries automatically. Disposal and a fresh owner are required for recovery.

The actual claim command records a separate synthetic popup presentation and explicit OK before acknowledgement, then rereads and restarts. It preserves all ten earlier command cases and the Settings follower's race and disposal behavior. No native route, production reader, popup rendering, generic Device mutation, or Device subscription is installed. A future private popup's ability to acknowledge saved normal-window facts remains outside this narrow caller contract. Interim conversion remains refused despite approved Q7-Q10 and Q11a policy decisions. Native checks remain waived and unproven.

## Explicit account removal

`prepareAccountRemoval(origin, acct)` captures the exact physical account-document inventory and the displayed label and removal scope. It returns a fresh object capability. `removeAccountSetup(origin, confirmation)` consumes that object's identity on the same owner's lane. Tokens are bound to origin, Device identity, consent, mode, joined history, label and complete document names and values. A copy or another owner's token is stale. Restart loses unaccepted capabilities.

The optional `removal` dependency defaults to unavailable. Its supported `fixture` variant supplies narrowly typed canonical local removal and session get/set/remove ports. It supplies no database or sync removal. The preinitialized constructor checks pending removal through its first complete local read. Joined Filter edits reuse their required inventory read. Other targeted operations make that complete check before any successful outcome. Readiness and this check establish absence once for this exclusively owned lane. Any later accepted removal completes or closes the owner barrier before lane release. The starting constructor completes it after legacy/schema checks and before readiness. Missing capability with a pending record blocks exposure. Accepted work drains during disposal. Failed attempted removal and uncertainty close the shared owner barrier and cancel scheduled work.

`account-removal-execution.ts` owns `pending:account-removal`, a local-only immutable version-1 record. Its nonempty manifest starts with the live Setup and includes every physical supported Filter, including tombstones. Local mode stores exact before envelopes and expects absence. Synced mode also stores the joined identity and fixed admitted after tombstones. The common fields are `v`, `kind`, `acct`, `deviceId` and `consent`. No command, Device/history snapshot, cache, progress or session payload is saved. Compatible root extensions survive until the record retires. No completed receipt remains.

Acceptance writes that record alone and confirms complete local/session state before destructive effects. Every later effect has a full-state preflight and readback. Resume accepts only the exact before value, fixed after value, or permitted local absence. It rejects divergent lifetimes, unexpected Filters, changed record identity, changed authority and unsupported session layouts. It never restamps or replays a command. Off-sync removal confirms the accepted document deletions before preparing and confirming true provenance. The continuation remains until that history and cleanup are confirmed. Synced candidates pass combined admission over the original baseline and fresh admission during completion, including when fixed tombstones are already present. Fixed tombstones and legitimate current acknowledgement repairs share a local batch. A torn batch that loses a required repair blocks on unresolved admission debt. No sync transmission occurs while the record remains. Normal flush keeps its debounce, shared opportunity and opaque-recovery rules.

Results distinguish commitment, unchanged state, refusal, unavailability, failure and uncertainty. A rejected operation retains its original error as `failed`, even when readback proves exact application. Any remaining accepted record permits startup completion. An unchanged rejected effect is also `failed`. Mixed, ignored, unreadable or authority-lost effects are `unconfirmed`, with the original mutation rejection when present. A committed result requires all documents, dependencies and session reductions confirmed, conditional Device cleanup, last record removal and final readback. No cross-area atomicity is claimed.

### Internal session representations

`account-removal-session.ts` defines fixture-only canonical contracts for future producers. It does not infer compatibility with interim or native session data.

- `skips:<acct>` maps supported video IDs to `"all"` or playlist-ID arrays. `cooldown:<acct>` is a nonnegative safe-integer deadline. Only the selected account's keys are removed.
- `recent` is an ordered array of `{acct, playlist, video, at}` rows. IDs and timestamps are validated. Compatible fields and other-account row order survive.
- `recentAdds` has at most 50 ordered rows. Common fields are `acct`, `at`, nonempty `playlists: {id,title}[]`, and `source`. A `single` row has `video: {id,title}`. A `gather` row has nonempty `videos: {id,title}[]`. `source` is `{kind:"feature",feature:string}` or `{kind:"shortcut",key:{code,ctrl,alt,shift,meta}}`. Compatible payload fields survive. Only matching-account rows are removed.
- `shown`, `breakage` and `gather` use `{v:1, global:JsonObject, accounts:Record<AccountKey,JsonObject>}`. Remove only the selected account bucket. Preserve root extensions, global memory and all other buckets. Accountless player/queue, pacing and routing belong in `global`. Account-specific playlist Undo, reopened-tab ownership and failures belong in that account's bucket. Existing ambiguous collections are refused.
- `paused`, `tabs` and unknown unrelated keys remain exact. No recursive ownership inference or whole-session clear exists. Missing collections are unchanged. Session data never enters the durable record.

The actual browser-free consumer is `tools/fixtures/account-removal-execution/run.ts`. Incoming deletion, shared-shortcut cascade and Undo, auto-emptying, claim coupling, Clear all, production adapters, sender validation, view events, tab reconciliation, native atomicity and exclusion of foreign writers remain separate work. Native verification is waived and unproven.

## Inactive interim retention

`interim-persistence.ts` retains the recognized interim profile at the local-only `interimConversion` key. Version 1 contains exact selected original source and canonical comparison maps, independent historical authorization and prior credential presence, the original conversion context, and the complete actual converter result. Both proposals and refusals preserve `reviewFacts`. Validation reruns the current converter against those saved inputs and compares the entire result. A capture whose original conversion did not reach validated allocation facts is explicitly recovery-unavailable. Invalid context produces no capture. Compatible checkpoint extensions survive detached reads. Unknown or newer checkpoints remain protected.

The mandatory sanitized snapshot includes every account body, including malformed suffixes and unindexed bodies, the actual index and all present supported markers and globals. It includes every inventoried `doc:*` and `cache:*` record plus own schema, Device and Unclaimed entries. Checkpoint presence is explicit. Missing keys stay omitted, while `unclaimed:null` stays consumed. Fixture ports derive both maps from the same durable synthetic store. A production adapter must provide this inventory without reading credential values. No native adapter is installed here.

Retention checks global newer schema first. With no checkpoint and no interim markers, the existing original legacy route remains unchanged. A new capture losslessly validates all selected JSON, derives a proposal or refusal, then rereads the full selected state before its single checkpoint-only set. Full readback must confirm the exact new record and unchanged source, canonical records and historical facts. A rejected set with exact applied readback retains its original rejection observation. Rejected unchanged state fails. Partial, divergent, unreadable or disposed readback is unconfirmed. No source, canonical document, cache, Device, Unclaimed or edit-history mutation is part of retention.

`ready()` rejects with `StartupReadinessError.result.kind === "interim-held"`. A distinct held initialization state stays closed when the lane recovers from rejection. `readInterimNote()` uses that lane to expose a frozen detached note or blocked-source capture, with two current snapshot reads before publishing evidence. Invalid, newer and changed captures expose held status. Unconfirmed IO and ordinary failed, pending, stale or disposed owners expose no note. Viewing this information needs no canonical consent and grants no readiness, account ownership, restore, claim, agreement or write authority. Every ordinary operation, including account removal, Settings, claims, notices and incoming or outgoing sync, stays closed.

Startup retention precedes pending-removal continuation. Present interim evidence therefore preserves both records and originals rather than resuming cleanup against an uncertain canonical lineage. Preinitialized owner reads also protect present checkpoints, even if the original markers disappeared. Disposal drains accepted IO and prevents publication. Fresh owners validate and reuse saved context and outcome without allocating identities, stamping, writing, cleaning up or retrying. Source or canonical drift remains held and never restores the saved comparison baseline.

The actual interim fixture command confirms retention, disposes the owner, serializes and reloads the full backing store, constructs a fresh starting owner and calls its real held reader. Its cases include proposals, canonical collisions, retained globals, incompatible records, stale reads, write failures and disposal. This proves synthetic owner behavior only. Canonical installation, actual recovery writes, fresh disclosure agreement, production cutover, native durability and foreign-writer exclusion remain separate work. R165 and R166 settle future discard and destination policy but authorize no mutation in this retention unit. Native checks remain waived and unproven.


## First-edit persistence through the shared owner

`first-edit-provenance.ts` supplies the only preparer for actual Settings, Filter, claim-added documents, and explicit or resumed account removal. Common authority and claim admission reject invalid or contradictory history before writes. Supported unknown history stays unknown until a real document edit. Absent off-history becomes exactly `{joined:null,pushed:{},status:"off",editedSinceOff:true,everEdited:true}`. No initializer writes false.

Changed sync-on transactions compose actual admitted pushed repairs into detached raw history before preparing provenance. They preserve the off bit, opaque recovery gate, deadline, diagnostic, and compatible extensions. Documents and final history share their intended set. Already-correct history needs no redundant patch, while independent repairs still persist. Incoming adoption, acknowledgement, startup, migration, inactive retention, and Device-only notice work never prepare an edit.

Filter adds `unconfirmed` with `authority`, `readback`, or `read-failed` cause. Attempted set rejection preserves the identical original exception and closes the owner before rethrow. Ignored, partial, divergent, unreadable, or disposed post-set observations close the same global barrier. Queued and new reads and writes, removal, claims, notices, receive, flush, start, and stale callbacks stay closed. Fresh-owner validation does not replay the edit. Settings, claim, and removal retain their distinct error contracts.

Removal reuses its accepted fixed facts after restart. Already absent local documents and already materialized synced tombstones still require confirmed true provenance before retirement. Synced completion readmits current history and preserves legitimate repairs. Unresolved torn acknowledgement debt stays held. No new journal, stamp, history snapshot in the record, or sync-off sync access is introduced.

The browser-free [first-edit owner command](../../../tools/fixtures/first-edit-owner/README.md) exercises these real transactions, readback, queues, and serialized restarts. This is an unconnected synthetic Store capability. Positive unedited initialization, production activation, native durability, and foreign-writer exclusion remain unproven. Inactive interim retention and its held reader retain their delivered contract.

`readAgreement(origin)` returns a detached disclosure and an owner-private review capability. `agree(origin, input)` uses that capability on this owner's existing lane. The initiating click supplies its already-started access promise. The owner captures its build version and clock at invocation. Copies, another Origin, another owner, observed changes, and disposal invalidate the capability. An identical confirmed duplicate preserves the saved time.

Canonical Agree combines consent, reviewed feature choices, any original upgrade-note completion, and required progress clearing in one local set. It confirms the complete expected inventory before publishing success or a Settings invalidation. Stable joined edits use complete batch admission. Actual changed Settings compose admitted repairs before `prepareFirstEditHistory`. Device-only disclosure creates no history and reads no sync. A requested new sync join returns `join-required` without persistence. Denied access follows the first-run, shortcuts, and any-tab exceptions. Presets run only for an effective enable.

Retained disclosure saves consent only. The local `interimConversion` successor has `v:2`, an unchanged original v1 under `retained`, and one named `agreement` effect. Its `accepted` state owns the fixed consent and complete Device. After acceptance confirmation, Agree confirms Device, then confirms the `confirmed` receipt. Every stage compares the complete inventory. Original source, Settings, caches, Unclaimed, progress, history, and raw extensions remain exact. A receipt permits only that precise Device consent overlay.

An accepted restart performs no write. It exposes `pending` through `readAgreement` and requires explicit `resumeRetainedAgreement(origin)`. Resume uses the saved effect and time. A confirmed restart exposes agreement confirmation without restamping. Both remain interim-held with the same rejected `ready()` promise. Conversion installation, recovery, joining, and production activation remain separate work.

An ignored, mixed, divergent, unreadable, or disposed attempted write closes the existing owner-wide uncertainty barrier. An exactly applied rejected write retains the original rejection in the committed result. A rejected unchanged write returns its original failure. Native compare-and-swap, crash durability, sender validation, and old-writer exclusion are not supplied by these synthetic ports.
