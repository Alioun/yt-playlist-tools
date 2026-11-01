# Settings file

This module authors DATA-53 through DATA-55 and ARC-MOD-36. It has no storage, runtime messaging, sync, clock, account lookup, activation, or native I/O dependency.

`exportFile({ source, version, date })` accepts a selected `SettingsFileSource`, not a storage snapshot. `source` contains actual `DecodedDocument<Settings>`, `DecodedDocument<Setup>`, and `DecodedDocument<Filter>` values. An adapter must enumerate all setup and filter documents, including filters of unselected playlists. The module cannot detect a document omitted by that adapter.

The result supplies a filename, `application/json`, and the complete text. `exportBlob(file)` constructs a page-owned Blob. A later settings page owns the object URL, `<a download>`, click, and URL release. There is no downloads permission or download operation here. Export takes no consent or privacy input, so the pure operation is available before consent and in private windows.

`createImportPlanner(nativeWindow).importFile(text)` accepts external text at one boundary. `nativeWindow` is a separate composition argument with `normal`, `private`, or `unavailable`. Private and unavailable contexts refuse before parsing. The returned parser accepts no context override. A JSON file cannot create the returned function or change its closed-over context. This factory does not authenticate a native sender. Its caller must bind the context from the authenticated router, never from a request body. That binding is unimplemented next work.

An `ImportPlan` is validated replacement data. It grants no write authority. Its exact account count supports DATA-54 confirmation. Its scope replaces shared settings and every included account's setup and complete filter set. Existing filters missing from an included account's file are therefore removed by the later executor. Accounts absent from the file are kept. `provenance: "fresh-edit-required"` records the execution obligation. A plan has no stamps, success, consent, sync admission, or activation result.

## Format decision

Two representations were compared before implementation.

| Representation | Consequence |
| --- | --- |
| Stamped documents under storage keys | Carries generation, device, timestamps, tombstones, and document versions into a user file. Makes replay authority easier to confuse with imported choices. |
| Data-only shared settings and accounts keyed by canonical account keys | Makes replacement scope explicit and keeps provenance outside the format. Requires source selection and canonical decoding at the export boundary. |

The second representation is format 1. Its header is `format`, `product`, `version`, and `date`. The product value is `Perchling`, the approved short product name in R141. The remaining top-level fields are `settings` and `accounts`. Each account value contains `setup` and `filters`. Each filter map key is a canonical playlist ID. Header format 1 is independent of `DOCUMENT_VERSION` and `STORAGE_SCHEMA_VERSION`, even though both currently equal 1.

`date` is an explicit proleptic Gregorian date with four year digits, from 0001 through 9999, in `YYYY-MM-DD` form. No clock or timezone conversion occurs. `version` is an explicit three-component numeric version with optional prerelease and build identifiers. Its major version does not control compatibility. Only `format` does. A well-formed recognized product header with a newer positive safe-integer format receives the newer-format refusal before its unfamiliar data is interpreted. Malformed or unknown headers receive the invalid-file refusal.

Map entries are inserted in JavaScript code-unit order. JSON's integer-index property rule puts index-like keys first in numeric order. Both rules are deterministic. Plan account and filter arrays use code-unit order. Field order follows the declared format shape. Source arrays retain their order. JSON uses two spaces and exactly one final LF. Optional canonical fields remain optional. There is no filename or local storage key in imported authority.

## Canonical semantics

`shape.ts` declares every allowed field and checks required presence. Its typed field maps fail type checking when an owning canonical type gains an unlisted field. It projects supplied export data explicitly and refuses extra import fields. The actual model decoders still own enum, identity, percentage, key, list-limit, and shortcut-uniqueness validation. The actual write normalizers own label limits, orphan shortcut targets, and marks of chosen playlists. Implicit Watch later choices supply `additionalChosenPlaylists` as the canonical account code does. Kept filters remain independent of chosen playlists.

The model codecs intentionally default missing fields and preserve unknown fields inside a supported document version. File import requires a complete known shape before calling them. File export projects known fields so unknown properties cannot smuggle Device or session data into a file. Unknown additive source fields are outside format 1 and are not exported. Import refuses unknown file fields rather than silently dropping them.

Tombstones and absent documents read as absent, as DATA-10 prescribes. Absent or tombstoned shared settings export canonical defaults. Absent or tombstoned setups with no live filters disappear from the file. An account with live filters and no live setup exports an empty canonical setup and all live filters. Absent or tombstoned filters disappear. Every newer document refuses the entire export, including a newer envelope that might represent a tombstone. A supported-version live document is never replaced by defaults.

The JSON boundary refuses duplicate member names before they can silently overwrite accounts, filter keys, or headers. Escaped spellings compare after JSON decoding. It also refuses `__proto__`, `constructor`, and `prototype` member names, including map keys, at every level. This is a file-format restriction. Canonical ID syntax still comes from the actual branded model guards. No prototype is mutated. Refusals contain only fixed codes and copy references. Parser errors, input values, and raw file contents never appear in them.

## Integration contract

The exact adjoining declaration is `tools/fixtures/settings-file/owner-api.proposal.ts`. It is an unapplied proposal, not an owner implementation. No protected path is changed.

The authenticated background router must derive native window privacy through the existing `authenticateUi` and `resolveSenderOrigin` path. `ui.importCheck` binds a new planner to that native fact. An unavailable fact fails closed. The UI displays DATA-54 confirmation using the plan's account count and the chosen file's display name. The later `import` change sends the same text the user confirmed. An imported plan, imported stamp, or payload privacy flag is never an authority input.

The canonical owner must handle that change inside its existing serialized lane. It reparses the text with current authenticated privacy, rechecks lifecycle, layout, consent recovery, and supported-document guards, and enumerates current documents. It replaces shared settings and exactly the included accounts' setup and complete filter sets. It retains unrelated accounts and all Device, cache, progress, session, and unclaimed data. It uses canonical normalization and fresh local edit provenance for every changed or removed document. Imported version, date, labels, or generation-shaped fields never allocate or select stamps.

The owner must plan the entire change before persistence. Sync-on admission counts actual current occupancy, retained unknown chunks, and tombstones under SYNC-14. A private, invalid, newer, unsupported, or over-budget change saves nothing. The operation must not split into per-account commits or accept a locally saved but unsynced remainder. It must use the accepted first-edit history and consent-recovery mechanisms. It must confirm exact readback and current authority before reporting `committed`. A rejected or uncertain write remains refused or unconfirmed. This module proves none of that executor behavior.

Imported switches remain inactive until this browser's own consent and site access allow them. Existing preset flags remain as imported. Applying an import never grants permission, consent, or activation. Export and import bindings, confirmation, file picker, object URL lifetime, the complete settings UI, native durability, privacy wording approval, rendering and axe, and all three picker policies remain open.
