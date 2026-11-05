# Canonical settings-file reads

This source is authored and unqualified. No product import, compiler, test, fixture, consumer, build, browser, server, install, or qualification command ran in this unit.

`createStartingLocalFilterWriter` and the preinitialized owner expose `exportSettings(origin)` and `importCheck(origin, text)`. Their public methods delegate to `settings-file-read.ts`. The owner adds no writer, listener, native port, router catalogue, or import executor.

`exportSettings` accepts a trusted UI origin in either normal or private windows. It joins the existing owner lane. The result is a complete selected `SettingsFileSource` or a fixed unavailable reason. The source contains Settings, all account Setups, and all Filter documents. A Filter creates its account entry even without a Setup. Playlist selections never filter the inventory.

Actual model decoders validate each envelope and body. The existing pure format projections in `settings-file/data.ts` select and normalize known fields. The boundary reconstructs only the known canonical envelope fields `v`, `gen`, `at`, `by`, and either projected `data` or `deleted`. Those document stamps satisfy the format's existing `DecodedDocument` input contract. The page's serialized file excludes them. No store `sync` record or other sync metadata enters the returned source.

Supported tombstones and null or absent documents retain the pure format's behavior. Shared settings default at serialization. Accounts with only absent or deleted documents disappear from the file. Orphaned live filters use an empty Setup. Newer documents refuse the complete read before their raw bodies can escape. Invalid envelopes, bodies, and unrecognized `doc:` keys refuse the entire read. Supported live documents use canonical decoding rather than replacement defaults.

## Read safety and lifecycle

DATA-53 permits explicit export before consent and in private windows. It grants no write or activation exception. `rawLocal` is the existing owner's internal authority-checked read port over the supplied `deps.local`, defined in `local-filter-writer.ts`. The new operation uses this port in the same lane. It never calls a native area directly or falls back to `startup.readSnapshot()` or unresolved raw startup storage. Existing canonical authority checks may consult their established retained snapshot and capability when the owner already holds released canonical authority.

`guardedLocal.get()` is unsuitable for export because it can resume pending removal. The new read instead observes pending removal, join, consent recovery, and retained-source holds and returns `pending-recovery`. It never resumes them. It also avoids `local.get()`'s observation maps and session-revision bookkeeping. Private export does not read session storage, change last-account state, allocate a cache capture, update a cache, or allocate a stamp. It does not call a clock or generation allocator.

A pending startup runs ahead of the queued read. Successful startup establishes the current canonical schema. A new profile with schema 1 and no documents exports canonical defaults without any read-triggered write. The existing constructor may establish schema during its own startup, independently of export. A valid consent-held owner with safe canonical documents and no unresolved work permits export. An invalid control, unfinished withdrawal, held recovery, failed startup, uncertain owner, disposed owner, or newer layout stays unavailable. A canonical owner held by consent also stays unavailable because `rawLocal`'s held branch cannot re-prove its canonical capability.

The read checks lifecycle before and after each asynchronous observation. Two complete safe reads must select identical documents before a source is returned. A mismatch returns `stale`. Read exceptions return fixed `read-failed` without exception text or values. The last native-observation race and native exclusion remain unproven. This is no native atomic-snapshot claim.

If the supplied safe port omits schema, a required document, or unresolved retained authority, this operation cannot reconstruct it. Missing schema returns `startup`. Unresolved or lost authority returns an unavailable result. The adjoining safe-port owner must provide a complete canonical document inventory after its safety decision. No fallback to a native raw area is authorized. As with the format contract, an adapter that silently omits a document cannot be detected by this selector.

## Import checking

The method validates the origin's shape and copies its independently obtained privacy fact before queuing. `settingsFileWindow` validates plain JSON fields and rejects missing, inherited, malformed, and unavailable privacy. This shape check does not authenticate a caller. Trusted composition must obtain the origin through `authenticateUi` or `resolveSenderOrigin`. No privacy value comes from file text or an imported plan.

Private and unavailable contexts bind a fresh planner and return its fixed refusal before entering the lane or parsing text. They perform no storage, clock, or generation call. Normal checks join the owner lane, recheck lifecycle, and bind a fresh pure `createImportPlanner`. They allocate no generation, write no record, and create no Setup. Successful plans retain the pure format's exact account count and replacement scope. They are data for confirmation, with no commit token or write authority.

The fixture consumer calls the actual sender resolver over dummy native facts. It checks agreement between sender-tab privacy and the independently returned window. This demonstrates binding, not native provenance. Production `ui.exportSettings` and `ui.importCheck` bindings, Backend changes, catalogues, file picking, object URLs, Blob construction, and download links remain adjoining work. The settings page supplies version and date to pure serialization.

## Reconciliation and deferred application

This patch is based on historical frozen866 owner source. Reconciliation with future accepted auto-add, Monitor, and Accounts owner changes is mandatory before qualification or integration. Transfer the two methods, their type intersection, imports, and lifecycle helper onto the accepted owner. Reassess its safe port, lane, recovery checks, and lifecycle rules. Never replace its future owner file with this historical full file. Do not inspect a mutable upstream qualification worktree to reconcile early.

Applying imports is outside this unit. The next unit must reparse the same confirmed text with fresh authenticated context inside one current owner operation. It must admit the complete changed batch through `planSyncWrite`'s existing `changed-batch` intent, use fresh local provenance, retain unrelated accounts and local-only data, and confirm exact readback. Included empty accounts require ACC-08 and DATA-44 cleanup. Retaining an empty Setup, skipping it, or rejecting an otherwise valid empty account is insufficient. Native cleanup guarantees need separate qualification.

Native durability and exclusion, privacy wording approval, rendering and axe, all three picker-policy holds, and production activation remain open. No review was requested.
