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

A changed intent enumerates every physical canonical local `doc:*` record across all accounts, including kept Filters and tombstones. Pushed keys must round-trip through the canonical local document parser and have complete local records. Opaque pushed entries remain valid for sync-off history. Full raw envelopes supply outbound encoding, so omitted defaults and tuple extensions remain untouched. Unknown local document names, invalid JSON, unsupported unrepresented local generations, incomplete known sync documents, and supported incoming adoption debt stay unavailable. A complete synced tombstone with no local record is not debt, because it agrees with this browser's absence, so it blocks no plan (R178). A synced live document with no local record still blocks every plan.

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
and an existing supported local target, live or a tombstone. A local Settings
tombstone stays unavailable before sync access. Filter additionally requires a supported
existing live Setup for the same account, including an empty Setup retained by
that kept Filter. The one exception is a Filter whose local Setup is a tombstone,
which accepts only an incoming Filter tombstone. Reception does not require playlist selection. Local UI edits
still require selection. Missing, null, malformed, or future Setup remains
unavailable before sync access. A deleted Setup reads sync once, because an
incoming Filter tombstone may still apply under it, and otherwise stays
`unavailable/account-context`. Settings needs no Setup, account, window lookup,
or permission query. Its per-device-looking extensions remain inert data.
Interim legacy markers make it unavailable before sync access. A complete
same-history incoming Settings, Filter, or intrinsically retaining Setup
can replace an existing acknowledged target only when its generation differs and
its edit time is strictly later. An incoming Setup tombstone follows the same rule
and is described under "Incoming Setup tombstones" below. The rule also lets a newer
live Setup or Filter replace an acknowledged local tombstone, because a tombstone
keeps out only older edits (SYNC-11, SYNC-12). Equal times, pending targets,
future versions, Settings tombstones, Filter tombstones under a live Setup, tombstones
over local tombstones, absent or incomplete documents, joins, and resets stay unavailable.
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


## Incoming Setup tombstones

An incoming Setup tombstone removes the account on this browser. It needs the
owner's account-removal host. Without one it stays `unavailable/document`. It
passes the ordinary checks first: an acknowledged live local Setup, a different
generation, a strictly later edit time, and unchanged local and sync preflights.
A conflict or a pending local edit refuses it before any cleanup.

`received-setup-removal.ts` then cleans this browser's account data through the
removal host. It plans the session reduction with `planAccountSessionRemoval`.
An unsupported session layout returns `unavailable/account-context` before any
effect. The plan revokes the account's in-memory receipts, including shortcut Undo,
then removes `cache:<acct>` and every recognized progress shard in one local removal
and applies the session effects. Unrecognized `progress:<acct>:*` keys stay. A
readback must show the removed keys absent, the session equal to the plan, and the
Setup, Device and history unchanged. Only then does the one local set write the
tombstone and its acknowledgement. When `lastAccount` names the account, that set
also writes `lastAccount: null`, and the readback must show `null`. A malformed
`lastAccount` returns `unavailable/account-context` before any cleanup. Confirmation
publishes `account-removed` with source `sync`.

The cleanup runs before the tombstone lands, so no journal is written. A restart
before the set finds the same live Setup, incoming tombstone and `lastAccount`, and
repeats only the cleanup that is left. A restart after the set finds the tombstone
and the cleared `lastAccount` already local. A crash at that point followed by a
local Setup edit keeps the Setup without its cache, progress and session memory
(R177).
A rejected cleanup effect returns `cleanup-failed` with the original error. A
mismatched readback returns `unconfirmed`. Both stop automatic work like a failed
local set. Once the tombstone is local, a later cache for that account is ordinary
data, and receipts revoked for the old Setup stay revoked when the same account ID
gets a new Setup.

Filter tombstones apply only under a local Setup tombstone. A Filter tombstone that
arrives while the Setup is live stays unavailable, so the account's auto-add never
runs without its Filter. In an automatic pass, an adopted Setup tombstone revisits
its account's Filters, so Setup and Filter tombstones that arrive together converge
in one pass. Arrival in either order converges on the same records. Filter tombstones
under a removed Setup publish no view event. A live incoming Filter under a removed
Setup stays `unavailable/account-context`.

A recreated account arrives as ordinary adoptions. A newer live Setup replaces the
local Setup tombstone and publishes `setup-changed`. A newer live Filter then replaces
its local Filter tombstone and publishes `filter-changed`. A Setup that restores its
account revisits that account's Filters in the same pass, as a removing one does,
so either arrival order converges. An older or equal live edit is a conflict, and an
unacknowledged local tombstone is pending. The removed account's cache, progress and
`lastAccount` stay gone until ordinary use writes them again. A Filter with no local
tombstone is remote-only creation and stays excluded.

## Tombstone expiry

`tombstone-expiry.ts` plans G18's expiry (SYNC-12, R178) from stored state alone. It writes
no record of its own, so every pass derives what is left from what it reads. A Setup
tombstone expires once `wallNow()` is at least 30 days past its `at`. Its account's Filter
tombstones expire with it, whatever their own `at`, and a Filter tombstone under a live
Setup never expires. The owner runs expiry in two turns.

The local turn runs at the end of an automatic incoming pass, after every captured address
was received, so a newer live Setup or Filter replaces its tombstone before expiry looks at
it. It needs the account-removal host and sync on. It takes an account only when its local
Setup tombstone is acknowledged and expired, every local Filter of that account is an
acknowledged tombstone, and sync holds for each of them the same deletion, another
tombstone or nothing. A synced live record keeps the account. After fresh local and sync
preflights match, it removes those documents through the removal host, reads back, then
writes the history without their `pushed` entries and reads back again. A restart between
the two writes leaves `pushed` entries with no documents. The next pass drops each such
entry whose synced copy is a tombstone or absent. A rejected write returns `rejected` and a
mismatched readback `unavailable`. Both stop automatic work like a failed receive.

The cleanup turn is one paced opportunity of the outbound attempt, so it uses the existing
ticket and adds no timer. It runs only for start and sync events, only when the plan has
nothing to send or repair, and only with the optional `SyncStorage.remove` port, which the
starting owner supplies and the synthetic browser adapter doesn't. It removes an expired
synced Setup tombstone with its account's synced Filter tombstones, each with the chunks of
its own generation. It skips an account if this browser still holds any of those documents
or their `pushed` entries, or if any synced document of the account is live. Other chunks
stay. It waits for the shared five-second spacing and the quiet period, rechecks complete
local and sync snapshots, invokes one `remove`, reads sync back and returns `cleaned`. A
rejected `remove` stops automatic work, and the next start plans the cleanup again. A
browser whose clock runs behind can push back a tombstone another browser removed, and the
cleanup repeats until both clocks are past the 30 days. A browser that was offline for over
30 days can push a live copy back once the tombstone is gone (SYNC-07). Other browsers then
see a remote-only live document, which still blocks their plans.

A local edit that recreates the account between the two turns is refused until the cleanup
removes the synced tombstone, because a different synced generation without a matching
`pushed` entry stays unavailable to the planner.

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
An adopted Setup that removes or restores its account adds one more receive of each
of that account's captured Filters, because Filters sort before their Setup. A Setup
tombstone also adds its account cleanup. A local Setup or Filter tombstone that stays
unavailable adds one sync read. Expiry reads storage only when the pass's first snapshot
holds an acknowledged expired Setup tombstone or a `pushed` entry without its document. It
then adds one local and one sync read, and an expiring pass adds a preflight of each, the
removal, the history set and its readbacks.
The outbound attempt also confirms durable admission and complete raw state before invoking sync. This is a
finite IO bound, not a native performance measurement or production approval.
The receiver's last-read foreign-writer limit and all manual exclusions remain.
There is no all-pass transaction, rollback, automatic retry, new conflict policy,
account claim, join, reset, chunk cleanup, or production activation.

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
and cascades, remote-only creation, joins, reset, conflict policies,
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

The optional `removal` dependency defaults to unavailable. Its `fixture` and `native` variants supply the same narrowly typed canonical local removal and session get/set/remove ports. Only `nativeAccountRemovalHost` builds `native`, from raw local key removal and the canonical session ports; it maps each typed key to its storage name. It supplies no database or sync removal. The preinitialized constructor checks pending removal through its first complete local read. Joined Filter edits reuse their required inventory read. Other targeted operations make that complete check before any successful outcome. Readiness and this check establish absence once for this exclusively owned lane. Any later accepted removal completes or closes the owner barrier before lane release. The starting constructor completes it after legacy/schema checks and before readiness. Missing capability with a pending record blocks exposure. Accepted work drains during disposal. Failed attempted removal and uncertainty close the shared owner barrier and cancel scheduled work.

`account-removal-execution.ts` owns `pending:account-removal`, a local-only immutable version-1 record. Its nonempty manifest starts with the live Setup and includes every physical supported Filter, including tombstones. Local mode stores exact before envelopes and expects absence. Synced mode also stores the joined identity and fixed admitted after tombstones. The common fields are `v`, `kind`, `acct`, `deviceId` and `consent`. No command, Device/history snapshot, cache, progress or session payload is saved. Compatible root extensions survive until the record retires. No completed receipt remains.

Acceptance writes that record alone and confirms complete local/session state before destructive effects. Every later effect has a full-state preflight and readback. Resume accepts only the exact before value, fixed after value, or permitted local absence. It rejects divergent lifetimes, unexpected Filters, changed record identity, changed authority and unsupported session layouts. It never restamps or replays a command. Off-sync removal confirms the accepted document deletions before preparing and confirming true provenance. The continuation remains until that history and cleanup are confirmed. Synced candidates pass combined admission over the original baseline and fresh admission during completion, including when fixed tombstones are already present. Fixed tombstones and legitimate current acknowledgement repairs share a local batch. A torn batch that loses a required repair blocks on unresolved admission debt. No sync transmission occurs while the record remains. Normal flush keeps its debounce, shared opportunity and opaque-recovery rules.

Results distinguish commitment, unchanged state, refusal, unavailability, failure and uncertainty. A rejected operation retains its original error as `failed`, even when readback proves exact application. Any remaining accepted record permits startup completion. An unchanged rejected effect is also `failed`. Mixed, ignored, unreadable or authority-lost effects are `unconfirmed`, with the original mutation rejection when present. A committed result requires all documents, dependencies and session reductions confirmed, conditional `lastAccount` cleanup, last record removal and final readback. No cross-area atomicity is claimed.

### Internal session representations

`account-removal-session.ts` defines fixture-only canonical contracts for future producers. It does not infer compatibility with interim or native session data.

- `skips:<acct>` maps supported video IDs to `"all"` or playlist-ID arrays. `cooldown:<acct>` is a nonnegative safe-integer deadline. Only the selected account's keys are removed.
- `recent` is an ordered array of `{acct, playlist, video, at}` rows. IDs and timestamps are validated. Compatible fields and other-account row order survive.
- `recentAdds` has at most 50 ordered rows. Common fields are `acct`, `at`, nonempty `playlists: {id,title}[]`, and `source`. A `single` row has `video: {id,title}`. A `gather` row has nonempty `videos: {id,title}[]`. `source` is `{kind:"feature",feature:string}` or `{kind:"shortcut",key:{code,ctrl,alt,shift,meta}}`. Compatible payload fields survive. Only matching-account rows are removed.
- `shown`, `breakage` and `gather` use `{v:1, global:JsonObject, accounts:Record<AccountKey,JsonObject>}`. Remove only the selected account bucket. Preserve root extensions, global memory and all other buckets. Accountless player/queue, pacing and routing belong in `global`. Account-specific playlist Undo, reopened-tab ownership and failures belong in that account's bucket. Existing ambiguous collections are refused.
- `paused`, `tabs` and unknown unrelated keys remain exact. No recursive ownership inference or whole-session clear exists. Missing collections are unchanged. Session data never enters the durable record.

The actual browser-free consumer is `tools/fixtures/account-removal-execution/run.ts`. The native starting owner supplies the real host, and incoming Setup tombstones are described above under "Incoming Setup tombstones". Shared-shortcut cascade and Undo, auto-emptying, claim coupling, Clear all, sender validation, view events, tab reconciliation, native atomicity and exclusion of foreign writers remain separate work. Native verification is waived and unproven.

## Inactive interim retention

`interim-persistence.ts` retains the recognized interim profile at the local-only `interimConversion` key. Version 1 contains exact selected original source and canonical comparison maps, independent historical authorization and prior credential presence, the original conversion context, and the complete actual converter result. Both proposals and refusals preserve `reviewFacts`. Validation reruns the current converter against those saved inputs and compares the entire result. A capture whose original conversion did not reach validated allocation facts is explicitly recovery-unavailable. Invalid context produces no capture. Compatible checkpoint extensions survive detached reads. Unknown or newer checkpoints remain protected.

The mandatory sanitized snapshot includes every account body, including malformed suffixes and unindexed bodies, the actual index and all present supported markers and globals. It includes every inventoried `doc:*` and `cache:*` record plus own schema, Device and Unclaimed entries. Checkpoint presence is explicit. Missing keys stay omitted, while `unclaimed:null` stays consumed. Fixture ports derive both maps from the same durable synthetic store. A production adapter must provide this inventory without reading credential values. No native adapter is installed here.

Retention checks global newer schema first. With no checkpoint and no interim markers, the existing original legacy route remains unchanged. A new capture losslessly validates all selected JSON, derives a proposal or refusal, then rereads the full selected state before its single checkpoint-only set. Full readback must confirm the exact new record and unchanged source, canonical records and historical facts. A rejected set with exact applied readback retains its original rejection observation. Rejected unchanged state fails. Partial, divergent, unreadable or disposed readback is unconfirmed. No source, canonical document, cache, Device, Unclaimed or edit-history mutation is part of retention.

`ready()` rejects with `StartupReadinessError.result.kind === "interim-held"`. A distinct held initialization state stays closed when the lane recovers from rejection. `readInterimNote()` uses that lane to expose a frozen detached note or blocked-source capture, with two current snapshot reads before publishing evidence. Invalid, newer and changed captures expose held status. Unconfirmed IO and ordinary failed, pending, stale or disposed owners expose no note. Viewing this information needs no canonical consent and grants no readiness, account ownership, restore, claim, agreement or write authority. Every ordinary operation, including account removal, Settings, claims, notices and incoming or outgoing sync, stays closed.

Startup retention precedes pending-removal continuation. Present interim evidence therefore preserves both records and originals rather than resuming cleanup against an uncertain canonical lineage. Preinitialized owner reads also protect present checkpoints, even if the original markers disappeared. Disposal drains accepted IO and prevents publication. Fresh owners validate and reuse saved context and outcome without allocating identities, stamping, writing, cleaning up or retrying. Source or canonical drift remains held and never restores the saved comparison baseline.

The actual interim fixture command confirms retention, disposes the owner, serializes and reloads the full backing store, constructs a fresh starting owner and calls its real held reader. Its cases include proposals, canonical collisions, retained globals, incompatible records, stale reads, write failures and disposal. This proves synthetic owner behavior only. The sections below describe later delivered disclosure and inactive installation. Actual recovery writes, production cutover, native durability and foreign-writer exclusion remain separate work. R165 and R166 settle future discard and destination policy but authorize no mutation in this retention unit. Native checks remain waived and unproven.


## First-edit persistence through the shared owner

`first-edit-provenance.ts` supplies the only preparer for actual Settings, Filter, claim-added documents, and explicit or resumed account removal. Common authority and claim admission reject invalid or contradictory history before writes. Supported unknown history stays unknown until a real document edit. Absent off-history becomes exactly `{joined:null,pushed:{},status:"off",editedSinceOff:true,everEdited:true}`. No initializer writes false.

Changed sync-on transactions compose actual admitted pushed repairs into detached raw history before preparing provenance. They preserve the off bit, opaque recovery gate, deadline, diagnostic, and compatible extensions. Documents and final history share their intended set. Already-correct history needs no redundant patch, while independent repairs still persist. Incoming adoption, acknowledgement, startup, migration, inactive retention, and Device-only notice work never prepare an edit.

Filter adds `unconfirmed` with `authority`, `readback`, or `read-failed` cause. Attempted set rejection preserves the identical original exception and closes the owner before rethrow. Ignored, partial, divergent, unreadable, or disposed post-set observations close the same global barrier. Queued and new reads and writes, removal, claims, notices, receive, flush, start, and stale callbacks stay closed. Fresh-owner validation does not replay the edit. Settings, claim, and removal retain their distinct error contracts.

Removal reuses its accepted fixed facts after restart. Already absent local documents and already materialized synced tombstones still require confirmed true provenance before retirement. Synced completion readmits current history and preserves legitimate repairs. Unresolved torn acknowledgement debt stays held. No new journal, stamp, history snapshot in the record, or sync-off sync access is introduced.

The browser-free [first-edit owner command](../../../tools/fixtures/first-edit-owner/README.md) exercises these real transactions, readback, queues, and serialized restarts. This is an unconnected synthetic Store capability. Positive unedited initialization, production activation, native durability, and foreign-writer exclusion remain unproven. Inactive interim retention and its held reader retain their delivered contract.

`readAgreement(origin)` returns a detached disclosure and an owner-private review capability. `agree(origin, input)` uses that capability on this owner's existing lane. The initiating click supplies its already-started access promise. The owner captures its build version and clock at invocation. Copies, another Origin, another owner, observed changes, and disposal invalidate the capability. An identical confirmed duplicate preserves the saved time.

Canonical Agree combines consent, reviewed feature choices, any original upgrade-note completion, and required progress clearing in one local set. It confirms the complete expected inventory before publishing success or a Settings invalidation. Stable joined edits use complete batch admission. Actual changed Settings compose admitted repairs before `prepareFirstEditHistory`. Device-only disclosure creates no history and reads no sync. A true sync tick requires the explicit join payload described below. Denied access follows the first-run, shortcuts, and any-tab exceptions. Presets run only for an effective enable.

Retained disclosure saves consent only. The local `interimConversion` successor has `v:2`, an unchanged original v1 under `retained`, and one named `agreement` effect. Its `accepted` state owns the fixed consent and complete Device. After acceptance confirmation, Agree confirms Device, then confirms the `confirmed` receipt. Every stage compares the complete inventory. Original source, Settings, caches, Unclaimed, progress, history, and raw extensions remain exact. A receipt permits only that precise Device consent overlay.

An accepted restart performs no write. It exposes `pending` through `readAgreement` and requires explicit `resumeRetainedAgreement(origin)`. Resume uses the saved effect and time. A confirmed restart exposes agreement confirmation without restamping. Both remain interim-held with the same rejected `ready()` promise. Inactive installation, joining, and separately confirmed account-filter replacement are described below. Production activation remains separate work.

An ignored, mixed, divergent, unreadable, or disposed attempted write closes the existing owner-wide uncertainty barrier. An exactly applied rejected write retains the original rejection in the committed result. A rejected unchanged write returns its original failure. Native compare-and-swap, crash durability, sender validation, and old-writer exclusion are not supplied by these synthetic ports.

## Bounded first sync join

The existing owner exposes `beginSyncJoin`, `applySyncJoin`, `cancelSyncJoin`, `readSyncJoin`, and `resumeSyncJoin`. They share its serial lane. The optional `join` dependency defaults to unavailable. Its fixture host removes only the pending continuation, an account cache, or a recognized progress shard, and supplies the existing account-session cleanup ports.

Preparation subscribes before its full sync read and keeps one original ten-second deadline. Empty copies and incomplete chunk delivery can wait without holding the lane. A review capability binds the detached full inventories, observation revisions, Origin, and automatic or explicit branch. Observed A-B-A changes revoke it. Initial cancellation writes nothing. `readSyncJoin` reads local status without allocating stamps, reading sync, or acquiring retry authority.

Unknown provenance requires the existing side choice. Selection preserves raw envelopes and combines side-exclusive accounts. The chosen side controls common account groups, including Setup tombstones. Omitted losing live Filters receive fixed suppression tombstones. Deleted groups remove their own local cache, all recognized progress shards, and matching session entries through the real session planner. When a deleted group's account is the local `lastAccount`, materialization sets that key to `null` in the same batch, and the Device effect never carries it. Other accounts, shared shortcut rows, Unclaimed, and opaque fields survive. Adoption and suppression preserve independent-edit provenance. Actual reviewed Settings edits use `prepareFirstEditHistory` against the real prior history.

`pending:sync-join` stores one validated `accepted`, `outbound`, `choice`, or `off` checkpoint. The parser reconstructs the named selection, agreement, Device, and history effects. Materialization, cleanup, shrinking, acknowledgement, and retirement each require full preflight and readback. Rejected exact application retains its original write observation. Uncertain application closes ordinary and automatic ingress. Startup recognizes pending join work before schema, retention, or removal writes and rejects readiness with `pending-join`. Explicit resume uses the accepted fixed stamps and consent time. A known unchanged rejection keeps the pending status and permits explicit resume on the same owner. A suspended accepted effect must finish before another choice can replace it.

`committed` with `replication: "pending"` confirms the complete local outcome. The existing scheduler then admits the first native set against current physical occupancy and the reviewed before or selected after generations. It shares the five-second mutation floor, debounce, epoch, and restart-safe opaque failure hold. Only exact native readback earns target-history acknowledgements. Different histories persist one waiting indication with bounded suspended debt and send nothing. Cancellation preserves selected local data and leaves only an unfinished-target off marker when needed. Ordinary off edits remain available after confirmed cancellation.

First-run and original upgrade-note Agree accept `syncOn: true` with `join: {kind: "prepare"}` or an explicit answer carrying the private join review and side. A required choice saves no consent or draft switch. The applying click supplies the permission observation and actual consent time. Consent, reviewed Settings, switch, history, and progress clearing share the same accepted effect and intended materialization batch. Full or newer admission refusal saves none of them. A zero-feature empty join can create metadata without creating Settings or false provenance.

A persisted later-history choice takes precedence over automatic classification, including when the old metadata returns. An explicit switch-on from supported off history with the same joined ID and raw `editedSinceOff:false` receives `proven-same-history-no-edit`. Historical `everEdited` can be true or absent. An unfinished-target marker supplies no completed-join proof. This branch selects each whole document by maximum edit time and code-unit device ID across both inventories. Missing documents survive for restoration. Equal edit stamps with different generations remain held. Setup tombstones suppress dependent live Filters and use the same account cleanup.

The v2 successor at `pending:sync-join` extends the fixed selection and accepted-effect forms. V1 records retain their original interpretation. A changed outbound remote generation triggers one local `reconcile` effect. Its basis contains flat prior debt and complete local and remote inventories. An unchanged exact pair retains accepted authority. A changed key competes by ordinary document order. New remote-only accounts join the union. The parser rederives the complete effect, and resume checks the complete recognized progress plan against current storage. Confirmed cleanup shrinks the record to flat debt or retires it. No choice or prior-effect chain survives.

If the entire canonical namespace disappears while debt owns a known history, a v2 restore target retains the exact metadata. The existing paced set restores that metadata with every outgoing document. Orphan bases or chunks remain held. Reconciliation performs at most one local transaction and one native attempt per event. Further churn waits for another external event. The existing floor, debounce, R155 hold, consent, quota, retention, and uncertainty checks still govern both paths.

After confirmed local reconciliation, `onSyncResult` receives a typed `reconciliation` notice with adopted records, reverted keys, replication state, and exact local write observations. Settings invalidation follows confirmed completion. The command consumes and records both. Production presentation remains unconnected. Combined Agree derives its presentation from the same selected Settings as materialization. Explicit resume reuses its fixed effect without another access request or preset calculation.

Global retained recovery, discard, native adapters, sender authentication, old-writer retirement, and production activation remain separate. Native browser verification is waived and unproven. Storage has no compare-and-swap, so unobserved foreign A-B-A changes and native crash durability remain unproven.


## Explicit inactive interim installation

The starting owner exposes `readInterimInstallation`, `installInterimConversion`, and `resumeInterimInstallation`. A normal-window review requires the actual confirmed retained Agree receipt and a complete original `inactive-proposal`. It offers every original document and cache together. Blocked captures have no installable subset. Saved sync-on state returns `sync-writer-required` without changing the switch or accessing sync. Pending joins and account removals refuse installation.

The local-only `interimConversion` v3 receipt contains the complete confirmed v2 under `agreed`. Its named installation state is `accepted` or `installed`. Both retain the exact raw off-history presence and bytes. Original v1, v2, conversion stamps, agreement time, source, Device, Unclaimed, unrelated records, and compatible root extensions remain unchanged. Installation does not initialize or promote edit provenance.

An explicit action confirms an accepted receipt, copies the whole original document/cache batch plus an originally absent schema, then confirms the installed receipt. Each stage checks complete local inventory against the sanitized host snapshot and original historical facts. Exact applied readback confirms a rejected write while preserving its original error. Unchanged rejection stops at the known predecessor. Ignored, partial, divergent, unreadable, or disposed attempts close the shared uncertainty barrier before queued work can proceed.

Startup reads v3 before legacy execution or removal and performs no mutation. Accepted v3 recognizes only original or exact fixed values at its owned paths. It exposes `pending-installation`; explicit resume repeats the original whole batch when incomplete, or confirms an already complete batch. Installed v3 requires the full after-state and exposes `installed-interim`. It never authorizes replay after later deletion or drift. V3 comparison and note projection require an explicit history observation. The original two-input note projector holds v3 without one.

Review capabilities are private to the owner and bind Origin, complete inventory, host facts, confirmed agreement, and the existing observation revision. Copied, foreign, consumed, private, disposed, and observed-stale capabilities cannot install. Observed history A-B-A invalidates them. Installed agreement reads and duplicate Agree preserve the saved consent and time without overwriting v3.

Successful installation returns `activation: "held"`. The stable `ready()` promise still rejects, and ordinary reads, edits, claims, notices, removal, and sync remain closed. This synthetic library capability grants no production activation, ownership, recovery mutation, source cleanup, or native writer exclusion. Native checks remain waived and unproven.

`bun --no-env-file --no-install tools/fixtures/interim-conversion/run.ts` executes real retention, Agree, installation, stage faults, disposal, complete durable serialization, fresh startup, and explicit continuation. It records complete batches, stores, errors, and dependency calls in `installationObservations` alongside the earlier retention and agreement observations.

## Separately confirmed retained-filter replacement

The starting owner exposes `readInterimRecovery`, `prepareInterimFilterReplacement`, `cancelInterimFilterReplacement`, `replaceInterimFilter`, and `resumeInterimFilterReplacement`. These operations share the existing lane. The optional `recovery` host defaults to unavailable. Its fixture ports supply an explicit retained snapshot, raw history, fresh authority, and verified playlist ownership. The preinitialized constructor cannot bypass retained startup.

Recovery requires an actual confirmed V2 agreement or installed V3 checkpoint. Accepted agreement and installation states require their existing explicit continuations first. Only an inspected account-body Filter can replace the same account and playlist. Setup and Filter must both remain live and supported. An unticked playlist can retain an off Filter. Global choices and shortcuts remain inactive.

Preparation shows both complete semantic Filters and returns a separate confirmation capability. It allocates no stamp and writes nothing. Cancellation synchronously revokes that capability. The owner binds confirmation to the capture, occurrence, full inventory, consent, scope, authority, origin, and observation revision. Copied, foreign, cancelled, consumed, stale, or disposed capabilities cannot execute. Equal known Filter fields return `already-present` without a recovery receipt, even when canonical extensions differ.

The local-only `interimConversion` V4 checkpoint retains an immutable confirmed V2 or installed V3 basis and explicit history. It stores flat per-occurrence resolutions and at most one pending replacement. Each effect fixes the parent Setup, Filter before and after images, raw history before and after images, scope, and required admission repairs. Canonical body and envelope extensions survive. The retained channel list replaces the entire known list. Preparation rejects normalization that changes any retained known value.

Replacement confirms three local stages. Acceptance writes only the pending V4 checkpoint. Materialization writes the fixed Filter and history. Recording appends one resolution and clears pending. Each stage compares the complete backing store and both snapshot ports. Exact applied readback can confirm a rejected promise while preserving its original error. Unchanged rejection returns the original failure. Partial, divergent, unreadable, disposed, or unauthorized application closes the existing uncertainty barrier.

Sync-off recovery reads no sync inventory. Sync-on recovery uses actual complete batch admission and composes its repairs before first-edit provenance. The fixed history preserves opaque holds and leaves the new generation unpushed. Recovery sends no sync writes and starts no scheduler. Resume revalidates admission against the accepted logical before inventory. Missing repair evidence or additional history debt leaves the fixed operation pending.

Restart performs no replacement, ownership lookup, stamp allocation, or automatic resume. Pending V4 exposes `resume-accepted-filter-replacement`. Explicit resume obtains fresh authority and recognizes only the four exact Filter/history before-or-after combinations. It uses the original fixed bytes. Completed resolutions prove historical replacement and authorize no replay over later edits, deletions, or other drift. V1, V2, and V3 retain their original comparison rules. The two-input note reader holds V4 because it has no history observation.

The recovery fixture command retains its read-only observations and adds an asynchronous real-transaction observation for off and joined storage. Its literal expectations come from the accepted handoff fixtures. Behavior tests cover stage failures, serialized restart, cancellation, authority loss, canonical drift, and admission debt.

Held V2, V3, and V4 recovery returns `activation: "held"`. Archived V5 review, replacement, discard, and playlist restoration return `activation: "canonical"`.

## Exact-occurrence recovery discard

`discardInterimItem(origin, { capture, item })` records R165's "do not restore" choice for one projected playlist, filter, or shortcut target. The command requires a current owner-private capture and its displayed capture ID. It validates the source key and typed path against the retained raw source. Numeric array positions identify independent occurrences, including equal siblings. Supporting evidence, invented paths, and whole containers cannot be discarded.

`RecoveryResolution` distinguishes `filter-replaced` and `playlist-restored` effects from `{ kind: "discarded", item: { sourceKey, path } }` receipts. Discard contributes no canonical or history image. Confirmed V2 and installed V3 advance once to V4. Existing V4 and released V5 append a flat receipt while preserving the basis, archive, handoff, extensions, and prior receipts. Normalized locators must remain unique across all three kinds, the archived prefix, the live suffix, and a pending document effect. Unknown or malformed authority stays held.

Discard consumes its capture and attempts one checkpoint-only write at stage `record`. It uses the recovery lane, current owner authority, and retained-source proof. It performs no destination ownership lookup or sync admission. It allocates no generation or time and changes no source, document, provenance, history, or sync repair. Replacement retains its existing playlist ownership and admission requirements.

The command repeats stable observations and owner checks before writing. Complete store readback, both snapshot ports, retained historical facts, the parsed checkpoint, and current authority must agree afterward. Exact applied readback can confirm a rejected promise and retains its rejection. Rejected unchanged storage fails. Missing, divergent, unreadable, disposed, or unauthorized application is unconfirmed and closes the owner barrier.

Review includes `discarded` IDs and all completed `resolved` IDs. Discarded rows leave selectable review in V4 and V5. Resolved occurrences cannot be replaced or restored. Remaining rows start inactive with no selection. The pure review engine remains read-only with `execution: "unavailable"`. Each sibling requires a fresh explicit action.

Restart reads the actual checkpoint and performs no discard retry or allocation. Released V5 still requires a fresh exclusive owner capability. Current edits and tombstones survive without historical replay. Original discarded bytes remain retained until a future safe cleanup protocol. They authorize no automatic re-offer, restore, erasure, bulk discard, or reclamation.

The recovery fixture command calls `observeInterimRecoveryDiscard` through actual agreement, installation, discard, handoff, and serialized fresh-owner startup. It records complete inventories, writes, effects, and disposed resources. Native durability and exclusion remain waived and unproven. Production remains disconnected.

## Explicit global playlist restoration

`prepareInterimPlaylistRestore(origin, { capture, item })` accepts only a retained global `playlists` row with one numeric array index. It returns a private `choice`, the exact entry, the scope, and verified owners with destination status. It selects no account. `restoreInterimPlaylist(origin, { choice, acct })` requires the explicit account. Cancellation and every attempted use consume the choice synchronously. The owner detaches arguments before entering its existing recovery lane. Copied, foreign, restarted, stale, private, or invalid choices cannot authorize a write.

The fixture recovery host requires `accounts.read()` alongside its existing single authority port. The plural port supplies signed-in, non-private authorities with nonblank account leases, browser sessions, and consent generations. Unordered account observations are sorted and duplicate identities refuse. Ownership evidence is account-keyed, so scanning A and B preserves stable choices. Observed authority or ownership changes still advance the revision and invalidate earlier choices. Each selected owner must freshly own the playlist without migration lineage. Labels, cached data, account presence, and `legacyClaimed` provide no ownership.

A destination requires an existing live supported Setup with no entry for the selected playlist, regardless of its `takes` or percentage. Recovery never creates or revives a Setup. It appends exactly `{ pl: selectedPlaylist, takes: "videos" }`, with no percentage override. Preparation uses current Settings shortcut IDs and the shared Watch later rule. If normalization would change another field, the destination is unavailable. Settings, including `autoAdd.on`, other Setup fields, filters, shortcuts, marks, source data, other accounts, and sibling positions survive.

`PlaylistRestoreEffect` fixes the chosen Setup key, complete document and history images, retained locator, scope, and admission. Accept, documents, and record use the existing transaction stages and complete readback checks. Every write revalidates the selected account through the plural port. Sync admission and first-edit history preserve prior repairs, extensions, and opaque holds. Recovery starts no sync write or scheduler. Equal sibling occurrences may restore independently to different verified owners. Each locator can be consumed once.

Pending V4 and V5 expose `resume-accepted-playlist-restore`. `resumeInterimPlaylistRestore` obtains fresh ownership for the fixed account and uses only saved document and history images. It allocates nothing and refuses repair debt outside the accepted history. Startup alone performs no lookup, restoration, allocation, or replay. V4 reconstructs document effects in receipt order. Completed V4 archives and V5 suffix receipts remain flat and retain exact occurrence uniqueness. After authority release, historical images never replace or constrain later current edits or tombstones. A confirmed-V2-derived V4 remains held.

The actual recovery command includes `observeGlobalPlaylistRestore()`. Its fixture reaches V5 through Agree, installation, handoff, and fresh owner acquisition. It records both destination orders, equal sibling restoration, complete stores and writes, serialized restart, and released resources. Native ownership, durability, and exclusion remain waived and unproven. Production remains disconnected.

## Retained-to-canonical authority

`readCanonicalAuthority`, `releaseRetainedAuthority`, and `resumeRetainedAuthority` share the starting owner's existing lane. Release requires completed sync-off installation, exact source and historical facts, an unchanged installed inventory, and no pending agreement, recovery, join, removal, or opaque write hold. Unresolved recovery items remain inactive and do not block release. The optional `canonicalAuthority` host defaults to unavailable.

The local-only V5 checkpoint archives one installed V3 or one completed V4 rooted in installed V3. It preserves the original source and receipts. A V4 rooted in confirmed V2 alone supplies no installation proof. Release confirms an accepted V5, retires modeled old producers, then confirms a canonical V5. Only the two checkpoint sets occur. Exact complete readback can confirm an applied rejection while preserving the original error. Uncertain application closes the owner's shared barrier.

An accepted restart performs no continuation or allocation. Explicit resume reuses the saved handoff ID and source epoch. The old owner's stable rejected `ready()` promise stays rejected after release. Its controller capability remains reserved until disposal drains the lane. A fresh starting owner must acquire an exclusive capability before readiness. Missing, competing, or revoked capabilities grant no ordinary access.

Released startup bypasses legacy startup and cleanup. The central full-inventory classification exempts only exact archived source keys. Ordinary Filter, Settings, claim, notice, Agree, join, removal, receive, and sync paths retain their current data and consent guards. Current canonical documents, absence, and tombstones own later edits and deletions. The historical anchor never authorizes installation replay. A preinitialized owner cannot bypass this startup contract.

Archived recovery combines immutable source and resolution evidence with fresh canonical records and verified account and playlist authority. A separately confirmed whole-filter replacement appends one flat V5 resolution and uses at most one fixed pending effect. It preserves the archive and handoff without downgrading to V4 or nesting V5 predecessors. Pending recovery blocks ordinary operations until explicit continuation. Resolved occurrences leave the offered items, and later destination edits or tombstones never replay a historical replacement.

The recovery fixture command includes `observeCanonicalAuthorityExecution`. Its synthetic supervisor fences cooperative producer ports, drains delayed callbacks, excludes competing owners, and serializes retired epoch state. A reconstructed supervisor requires explicit confirmation that prior modeled producers stopped. These fixture contracts prove no native worker retirement, storage durability, foreign-writer exclusion, or production activation. Native verification remains waived and unproven.

## Store lifecycle and local Clear all

`createStoreLifecycle` in `store-lifecycle.ts` owns the current `StartingOwner`. Its state is `starting`, `active`, `clearing`, `blocked` or `disposed`. `owner()` returns the owner only while active. The supervisor never queues work on the owner's lane.

Construction returns at once and reads only `pending:clear-all` by name. An absent marker starts one owner. A present marker holds startup, even a malformed or newer one, and so does a failed or malformed read. A held supervisor constructs no owner and runs no held migration, removal or join work. `ready()` is a stable promise for the completed startup state. If Clear all supersedes the read, clear completion settles that promise with its resulting state. Disposal settles it with `disposed`. Neither waits for the superseded read. A later read result changes nothing. Empty arrays, exotic objects and unrelated named entries count as malformed reads, without reading their values.

`clearAll(origin, { alsoSynced })` accepts a settings-page Origin, including an unknown private window. It validates a detached copy of both arguments. It applies no readiness, consent, layout, retention or barrier check. A ticked request returns `unavailable/synced-reset-unsupported` before any effect when no synced reset is composed. With one, a ticked request under a layout newer than this build knows skips the synced reset, erases this browser only and returns `cleared` with `synced: "kept-newer-layout"` (R174). Every `cleared` result names its `synced` scope: `untouched`, `reset` or `kept-newer-layout`. Duplicate valid calls share one promise through fresh readiness and synchronous `cleared` listeners. Invalid or ticked calls never join it.

Admission blocks owner acquisition at once. It starts `owner.dispose()` and `producers.quiesce()` together and waits for both. A rejection of either returns `failed/stop` and keeps the old owner for an explicit retry. No fresh owner starts. The erase protocol then runs in order:

1. Set the fixed marker `{v: 1, kind: "clear-all"}` and confirm it by a named read. A rejected write that the readback confirms keeps its rejected observation. A missing confirmation returns `failed/marker` with no destructive call.
2. Clear session and require an empty key-name inventory. Delete `yt-playlist-tools` and require a resolved deletion.
3. List local key names and remove every name except the marker, in batches of at most 32. Re-list and require only the marker.
4. Remove the marker and require an empty local inventory.
5. Start exactly one fresh owner, emit `cleared` and await its real readiness while keeping the supervisor `clearing`. That owner writes `schema: 1` through existing startup. Expose it as `active` only after readiness succeeds. Failed readiness keeps the owner fenced for disposal or explicit retry.

The local port has named `get`, `set`, `names` and `remove(keys)` and admits no whole-area read. It never calls `local.clear()`. A partial whole-area clear could remove the marker and keep other data, and a crash would then bypass the startup gate. The marker leaves last, after every other cleanup is confirmed. A restart before that sees the marker and holds. After it, local is already confirmed empty.

Each step stops at its first unconfirmed result and keeps the marker. The result is `partial` with the listed names or a failed database deletion, or `unconfirmed` with a missing, rejected or invalid inventory. A missing key-name provider never counts as empty. The supervisor stays blocked until the user retries. No timer, poll or background retry runs. A rejected effect whose inventory proves the intended outcome still confirms, and its observation stays in `effects`. `cleared` reports erasure separately from fresh readiness, so a rejected fresh startup still reports confirmed erasure.

Unticked Clear all makes no sync call. It deletes the local `sync` record with its `opaqueWrite` hold, as DATA-12 assigns. The fresh owner imports no old timestamp and starts its own 5,000 ms first-set barrier on the shared monotonic `SyncClock`. The old owner drains before the fresh one is constructed.

Supervisor disposal blocks admission, disposes the owner it holds and waits for in-flight operations. Neither a late startup read nor an interrupted clear starts an owner after disposal. An interrupted erase returns `unavailable/disposed`, and its marker survives. Disposal during fresh readiness reports confirmed erasure with readiness `disposed` and drains the fresh owner. Unexpected boundary exceptions settle with `failed/boundary` and keep acquisition blocked. A throwing name-provider getter reports a rejected inventory.

The fixture command `tools/fixtures/device-lifecycle/run.ts` drives the real owner through seeds, faults, crashes and races with cooperative producers. Production wiring, the native key-name provider, registrar and tab teardown, opening first run and the ticked synced reset remain separate. Native remove and clear atomicity, writer exclusion and crash durability remain unproven. Native checks are waived and unproven.

## Withdrawal and exact recovery

The optional `consentDevice` supervisor port reads only `schema`, `device` and `consent:state`. `withdrawConsent` validates the settings origin and detached expected agreement before it starts owner disposal and producer quiescence synchronously. It starts both before the first consent read. The withdrawal phases are `withdrawing`, `withdrawal-stopped`, `opening-held` and `held`. The supervisor exposes no owner during stopping or opening. The held owner permits inspection, disclosure-only agreement and separately confirmed exact removal or retained V2 receipt recovery.

After both stops finish, withdrawal rereads the baseline. It writes only a generation-bearing `withdrawing` intent in `consent:state`. Exact readback must confirm the entire named tuple with Device unchanged. The supervisor then rereads that tuple before writing raw Device with null consent and final `withdrawn` control together. A rejected promise with exact applied readback can confirm either write, and the result retains that rejection. Shutdown, confirmed intent and final storage remain separate observations. Only exact final readback publishes `consent-withdrawn`. Unconfirmed storage leaves the session stopped.

Clear all can supersede a hanging read without waiting for that read. It waits for every invoked mutation and captured owner and producer drain before erasing. A phase check after each await forbids a later withdrawal effect after Clear all or disposal supersedes it. The existing unticked Clear all entry remains available in every phase.

Control generations invalidate earlier recovery permissions as soon as withdrawal intent persists, and after each new agreement. Agreement timestamps advance even when the wall clock repeats. Device fields, omissions and extensions survive consent changes. Malformed, newer, mismatched and exhausted records remain untouched. Untouched profiles without a control retain their existing startup paths. The protocol cannot write null Device consent before it confirms durable intent. A Device-only final effect therefore retains intent. A control-only final effect retains a mismatched pair. Both hold on restart.

An intent with original or null Device consent permits read-only inspection. It grants no fresh agreement or recovery execution. Startup never completes or rewrites it. An explicit `withdrawConsent` request with the same original expected agreement reconfirms the intent and may finish the pair with the same generation. A divergent pair stays held with Clear all available.

Once the protocol exists, startup classifies held work before migration, cleanup or ownership acquisition. Readiness settles with `consent-held`. Inspection does not finish pending removal. A private owner review permits only disclosure consent, without awaiting a feature-access promise, changing Settings or starting another job. The current owner remains held after agreement and selected recovery. A fresh owner can follow ordinary startup when the control is agreed and no unfinished job remains. Ordinary feature agreement updates Device and its control together. Agreement combined with sync join remains unavailable on protocol profiles in this unit.

`consent:jobs` records exact account-removal and retained-agreement occurrences. New removals after protocol entry allocate a greater occurrence in the pending-record acceptance batch. A pre-protocol pending removal registers only on explicit recovery confirmation. The identity contains the complete accepted record and its original agreement. Recovery binds a private review and selection to origin, full stores, revision, Device, occurrence and current control generation. A copied or consumed review grants nothing. Private inspection follows the existing privacy rules, while actual removal recovery still requires a normal window and existing host, session and sync authority.

Recovery confirms prepared permission, then armed permission, with full-store readback before effects. It runs the internal removal body in the existing lane with a private exact permit. It preserves fixed tombstones and current Device consent. Terminal retirement enters `retiring`, removes and confirms absence of the exact marker, then records `done`. Terminal entries survive until Clear all. A terminal restart can authorize retirement only. An accepted entry with a missing or different marker remains held. Selected completion reclassifies other work without releasing it.

An intrinsically valid accepted retained V2 has a separate private permit and explicit selection through `readWithdrawnWork` and `recoverWithdrawnWork`. Normal and private authenticated UI origins may finish that receipt. Exact removal keeps its normal-window rule. The retained identity binds the complete immutable accepted record and original agreement. A fresh agreement supplies current consent without altering historical evidence.

Retained confirmation checks the complete current Device against the historical effect Device with only consent projected to the current verified agreement. It checks the sanitized source snapshot, complete local records, history, revision and current control generation. The executor has only ledger and confirmed-receipt setters. It performs zero Device writes, document or stamp allocation, sync access, cleanup, ownership lookup or activation. Prepared and armed permissions require exact full-store readback. Terminal retiring is durable before the receipt changes from accepted to confirmed. Done follows exact receipt confirmation. An applied rejection can confirm while retaining its write error. Independent read failures remain observable and permit no next effect.

Saved prepared, armed and retiring permissions never execute at startup. A fresh explicit review reconfirms prepared and armed permission while preserving terminal progress. Confirmed receipts need unfinished matching occurrences to be selectable. Done occurrences remain historical and cannot authorize identical reappearing acceptance. The current owner remains held after success, including when other unsupported work remains. Public `resumeRetainedAgreement` stays fenced on protocol profiles. Untouched profiles and unticked Clear all keep their existing behavior.

A valid retained V1 has a separate explicit `retained-v1-acceptance` selection after withdrawal and disclosure-only agreement. Its `retainedV1` ledger witness pins the complete V1, a fixed accepted V2, stable Device identity, and original proposal agreement and generation. Prepare and authorize write only an unregistered proposal and allocate no receipt occurrence. A distinct private permit allows exactly one two-key batch containing the fixed V2 and its registered receipt job. The existing receipt executor then retires that occurrence, confirms the receipt, and records done. The first action uses six sets in order, prepare, authorize, accept, retire, record, and done. It never writes Device or releases the owner.

Partial acceptance stops its attempt. A V2-only result requires its exact unregistered witness and unchanged counter pin. A ledger-only result reuses the registered occurrence. Both keys must match before receipt execution. Every restart requires fresh explicit permission. A later agreement supplies current authorization while registered and V2-only work retain the original accepting consent. An unaccepted V1 draft can be proposed under the later agreement. Different or unreadable readback closes V1 execution in that owner and invokes the agreement barrier. Inspection remains available. Done history cannot authorize a reappearing V1 or accepted V2.

The `--withdrawal-v2-only` observer includes the complete actual V1 acceptance branch under `v1Acceptance`. Its existing top-level counts still describe the receipt branch. The nested counts describe V1 observations, acceptance subsets, and reauthorization histories. Default interim output retains its existing contract. V3 installation follows the explicit selection rules below. Native guarantees remain waived and unproven, production remains disconnected, and privacy wording approval remains pending.

`tools/fixtures/interim-conversion/run.ts --withdrawal-v2-only` observes actual V1 retention, interrupted V2 agreement, supervisor withdrawal, disclosure-only re-agreement and selected receipt recovery. It returns complete stores, write and read observations, source snapshots, errors and serialized restarts. The default interim command keeps its existing result.

Legacy cleanup, raw retention recovery, release, later filter or playlist effects, join and reconciliation recovery remain unavailable after withdrawal. Held inspection preserves their raw checkpoints. New consent does not resume them. The focused synthetic commands and tests do not establish complete R167 multi-engine recovery. Native durability, ownership and exclusion remain waived and unproven. Production remains disconnected.


### Accepted V3 installation after withdrawal

`readWithdrawnWork` can expose a `retained-installation` selection for an already accepted V3 under a current agreement. A normal UI explicitly confirms that selection through `recoverWithdrawnWork`. A private UI can inspect it and cannot authorize installation.

The installation job pins the entire accepted V3, the original agreed V2, raw installation history, derived document/cache/schema effect, stable Device ID, and durable occurrence. Prepare registers a previously unregistered accepted installation. Authorize grants permission under the current control generation and agreement. Reauthorization keeps the occurrence and terminal progress. Done identities suppress registration when the same accepted record reappears.

The private installation permit differs from removal, retained agreement, V1 acceptance, and ordinary installation reviews. Its executor writes only the fixed document/cache/schema batch when accepted progress still needs it. It writes no Device. Live comparison projects current Device consent while preserving every other Device field, presence, retained source value, historical fact, and raw history extension. Every canonical key must match its exact original or fixed installed image. Terminal progress requires all installed images and has no document callback.

Every setter has a complete local/source/local preflight and independent exact readback. Expected observer revisions settle before another stable complete observation. Rejected applied writes retain the rejection and confirm only through exact stable readback. Rejected unchanged writes fail without another effect. Partial, ignored, divergent, unreadable, stopped, or changed-back observations close installation execution through `agreementBarrier`. Inspection stays available. A fresh owner starts read only and needs a new selection and current permission.

Completion records terminal retiring, replaces only the installation discriminator in the full V3 receipt, and writes terminal done last. An independent completion observation confirms installed V3 and the exact done occurrence. Startup, canonical capability acquisition, ordinary resume, sync, and feature activation stay held. Recovery allocates no time, randomness, or document generation. Native guarantees remain waived and unproven. Production remains disconnected. Privacy wording approval remains pending.

### Explicit installation acceptance from confirmed V2

A complete confirmed V2 from ordinary Agree, Unit 2a receipt recovery, or Unit 2b acceptance can expose `retained-installation-acceptance`. The current agreement grants permission separately from the immutable original V2 agreement. Completed receipt jobs and the historical `retainedV1` witness neither authorize this action nor block it.

Prepare and authorize persist a specific `retainedInstallation` draft. They append no job and leave `next` unchanged. Both witnesses can coexist. The separate private one-use acceptance permit writes exactly `{interimConversion: acceptedV3, "consent:jobs": registeredLedger}`. This batch registers one occurrence and advances `next` once. Complete stable local/source/local readback must confirm both keys before a fresh installation permit can run the accepted installation executor. Acceptance authority is revoked first.

An ignored batch leaves an armed draft without an occurrence. V3-only acceptance keeps that draft and requires its exact counter pin and canonical before-images. Its witness suppresses old-V3 fallback. Ledger-only acceptance keeps confirmed V2 plus the registered occurrence. Fresh explicit authorization retries the same two-key batch without another increment. When both keys are exact, fresh explicit authorization continues installation without another acceptance write. Terminal progress permits only retirement and receipt completion. It cannot restore documents.

Uncertainty closes both acceptance and installation in that owner while preserving inspection. Actual withdrawal and re-agreement require fresh selection and permission. Restart always writes nothing. Done installed work remains historical. Reappearing identical V2 or accepted V3 cannot reuse its occurrence or manufacture another draft. No reset acceptor or later recovery engine is available.

The existing `--withdrawal-v2-only` command calls the new observer under `v3Installation.newAcceptance`. It captures the three operation-produced V2 recipes, exact acceptance-key subsets, current authorization renewal, stage faults, and serialized restarts. Eligible confirmed-V2 inspection inside older receipt and V1 captures now exposes the explicit installation selection. Their stored records, stage order, permission prefixes, errors, and separate count meanings stay intact. Complete expanded output therefore changes deliberately. Default interim output keeps its complete byte contract.

### Accepted V2 filter replacement after withdrawal

An already accepted V4 filter replacement on confirmed V2 can finish through a fresh normal-window `readWithdrawnWork` selection and `recoverWithdrawnWork` action after withdrawal and disclosure-only agreement. The action registers one immutable occurrence, confirms prepared and armed permissions under current consent, and writes only its fixed Filter and stored history after-images. The original basis, agreement, ordered resolution prefix, parent and complete effect remain immutable. Recovery projects only historical Device consent onto the validated current agreement; every other Device field and the complete canonical inventory must match. Recovery writes no Device and leaves activation held.

The filter permit is private, one-use and distinct from earlier recovery permits. Every stage checks complete local and retained observations plus fresh singular account, session, lease, host-generation and playlist ownership authority. Synced recovery reads through this permit and validates the accepted repairs and history without invoking outbound sync. Observed changed-back snapshots invalidate old selections. Withdrawal and disposal drain an invoked call and prevent the next stage.

Document and history may independently equal their fixed before or after images. Both after-images skip document IO. Terminal retiring persists before the selected resolution clears pending; terminal continuation has no document/history writer. Fresh owners require explicit reauthorization and may finish a missing record or done write without appending twice. An identical pending record matching a done identity refuses. Startup and held review allocate nothing, perform no ownership lookup and replay no writes. A rejected write remains separate from a failed observation, and interruption after any IO retains the attempted stage and confirmed prefix.

`tools/fixtures/withdrawn-document-recovery/run.ts --filter-v2-only` produces its positive inputs through actual agreement, filter acceptance, interrupted document IO, withdrawal and fresh agreement. Its deterministic store table captures off and synced completion, every serialized boundary, stage faults, authority drift and same-owner lifecycle stopping. The default command preserves this filter observer.

## Withdrawn retained playlist recovery

`readWithdrawnWork` also exposes an exact `retained-playlist-restore` selection for an ordinary accepted V4 with a confirmed-V2 or installed-V3 basis. `recoverWithdrawnWork(origin, { review, job })` uses that selection's immutable numeric global occurrence, chosen account, ordered resolution prefix, and complete Setup and history effect. Fresh agreement changes current permission without changing the original accepted record. Recovery performs no allocation and leaves ordinary readiness held.

The playlist permit is private, one-use, and separate from the filter permit. Fresh plural account observations must contain the chosen account and reject duplicate IDs. Row reorder preserves authority. Fresh ownership must prove that exact chosen tuple owns the playlist without migration lineage. The singular filter authority does not select the playlist owner. Observed changes to accounts, ownership, snapshots, owner revisions, Device, or consent control invalidate captured authority, including observed changes back to earlier bytes.

The chosen Setup must remain live and equal its complete fixed before-image or after-image. Missing, deleted, newer, or changed Setup data stays held. Recovery writes only the fixed Setup after-image and optional fixed local history. Exact partials can reassert those values. Both after-images skip the document write. Settings, other canonical records, retained source, historical facts, raw Device, and current consent control remain exact. Recovery writes zero Device values and performs no outbound sync.

The mixed `retainedDocuments` witness array preserves filter and playlist jobs, sibling order, done entries, and compatible accepted-record extensions. Terminal playlist continuation has only ledger and completed-record writers. It reauthorizes without document repair, appends one `playlist-restored` receipt when pending, and marks the same occurrence done. A done descriptor cannot register again. Each attempted write retains its actual result separately from later observation errors. Synced admission and stopping checks run before and after attempted effects and during independent completion confirmation.

`tools/fixtures/withdrawn-document-recovery/run.ts --playlist-v2-only` runs the complete playlist observer once. Its inputs come from actual retention, Agree, explicit ordinary playlist choices, accepting IO, withdrawal, and consent-only agreement. It captures complete stores, exact submitted batches, partial and all-after images, equal numeric siblings restored to different accounts, restart boundaries, faults, and same-owner withdrawal or disposal. Unsupported and combined flags refuse.

### Installed-V3 basis

The same operation, permit, executor, ledger schema and `retainedDocuments` witness array finish an accepted playlist restore whose V4 basis is an installed V3. The validated retained reader parses the exact record bytes. One private basis-specific read takes the accepting agreement and Device from `agreement.effect` for confirmed V2 or `agreed.agreement.effect` for installed V3. The record keeps its V3 form, and the current agreement never replaces the original. An accepted but uninstalled V3 is not a basis. Installed-V3 effects are typed and checked as `this-browser` with `off` admission, so this branch never reads sync and never gains synced write admission. The complete installed canonical inventory, including installed documents, caches and schema, must match the basis projection. The fixed destination Setup is the installed live Setup.

Filter records stay confirmed-V2 only. Installation copies every Filter unchanged, so the retained reader rejects an installed-V3 filter replacement as already present.

`tools/fixtures/withdrawn-document-recovery/v3-playlist.ts --playlist-v3-only` produces its inputs through actual agreement, installation, ordinary restore acceptance with interrupted document IO, withdrawal and consent-only agreement. It records compact completion, sibling, restart, fault and stop observations with counts and digests instead of complete stores.

New ordinary acceptance registration or repair, V5, authority release after withdrawal, and feature activation remain unavailable through this recovery branch. Native guarantees remain waived and unproven. Production is disconnected and privacy wording approval is pending. Broad acceptance is deferred. This unit does not complete 2.0.

## The last account

`lastAccount` is its own `storage.local` key, an account key or `null`, and absent reads as `null`. `decodeLastAccount` in `src/shared/model/lastAccount.ts` reads it and throws `DecodeError` for any other value. It is not a `Device` field (DATA-07, R176). `seeAccountLabel` sets it when a live Setup's account becomes current. A settings import, account removal, a sync join and an incoming Setup tombstone set it to `null` when it names an account they remove. None of them writes `device`, so none can restore a consent that a withdrawal changed while it ran. `readLastAccount` returns the account only while its Setup is live.
