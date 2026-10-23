# Persisted model contracts

This module owns the browser-independent document bodies in DATA-12 and the envelope in DATA-10. It implements the `model/` boundary in architecture section 6.4.1. It imports no browser, WXT, DOM, storage, clock or random source.

`types.ts` exports `Stamp`, `Stamped<T>`, `Tombstone`, `Key`, `Shortcut`, `MusicAction`, `GatherOrder`, `Settings`, `AccountLabel`, `AutoAddPlaylist`, `Setup`, `Filter`, `Device`, `UpgradeDetails` and `Unclaimed`. `UpgradeDetails` follows REL-MIG-33, including R96's `pct.authorised`. The device note includes R97's `seen` and `reopened`.

`decodeSettings`, `decodeSetup` and `decodeFilter` read document bodies. An omitted body receives fresh defaults. Omitted known fields receive defaults where the spec defines them. A malformed known value throws `DecodeError`, whose `path` identifies the field. Explicit null keys and playlist choices remain null. Presets are applied by the feature's first switch-on, outside this module. Fresh shortcut lists, picker keys and music keys therefore start empty. Only Undo starts with a key.

`decodeDevice(raw, fallbackId?)` reads the device body. A missing device needs a caller-supplied ID. A stored ID needs no fallback. `defaultDevice(id)` also requires an ID. Generation belongs to the caller. These functions never create consent, apply migration policy or infer an account.

`defaultSettings`, `defaultSetup`, `defaultFilter` and `defaultDevice` return independent mutable values. The `defaults` object names the same factories. An absent filter has no effect, represented by an empty, switched-off denylist.

`decodeDocument(raw, decodeBody)` reads a stamped document. Its result is discriminated by `kind`:

- `absent` covers undefined and null storage entries.
- `value` carries `document: Stamped<T>`.
- `deleted` carries a tombstone, which the store treats as absent.
- `newer-version` carries the version and untouched raw record. Its data is never decoded or adopted.

`DOCUMENT_VERSION`, `STORAGE_SCHEMA_VERSION` and `CONSENT_VERSION` are 1. The model has no prior 2.x document version to migrate. Layout refusal, migration, sync refusal, tombstone expiry and write ownership remain the store's responsibility.

Known objects retain unknown fields through decode, object-spread edits and JSON serialization. Filter tuples also retain future columns. Reconstructing an edited object from known fields alone discards extensions. The write normalization helpers preserve them. Unknown values must stay unchanged when the caller edits known fields.

Filter handles remain optional strings in the model. The decoder reads a JSON `null` handle slot as `undefined`. Write normalization omits an absent final handle slot. If future columns follow it, the slot stays in place and JSON writes it as `null`.

`normalizeSettingsForWrite`, `normalizeFilterForWrite` and `normalizeSetupForWrite` cut the DATA-13 labels only at save time. Shortcut labels are also trimmed under YT-KEY-14. Character limits count Unicode code points. They do not split surrogate pairs. Percentages must already be integers in 0 to 100. There is no rounding or clamping of 2.x settings. Legacy conversion belongs to the migration.

`normalizeSetupForWrite(setup, { shortcutIds })` removes targets for absent shortcuts and marks for unchosen playlists. Chosen playlists include auto-add playlists, surviving shortcut targets, both quick-save playlists and the gather playlist. The optional `additionalChosenPlaylists` context preserves marks for shared choices resolved by the caller, such as a Watch later shortcut without an account override. Decoding retains these references so a read cannot silently change the saved document. The store skips dangling references in its read views and calls normalization before the next write.

`isSetupEmpty(setup, hasKeptFilters)` implements DATA-16 on a setup with dangling targets already removed. Labels and marks do not keep a setup alive. A gather playlist or any kept filter does. A store decides whether to retain the account's label, cache or last-account entry under DATA-19.

`validation.ts` exports branded ID guards, `isPercent`, `DocumentKey`, `parseDocumentKey` and `documentKey`. Account keys are exactly 16 base64url characters. Shortcut IDs are six base64url characters. Channel IDs have `UC` and 22 base64url characters. Video IDs have 11 base64url characters. Playlist IDs use the existing page boundary's URL-safe 2 to 100 character envelope, including `WL`. This is syntax validation, never a claim about ownership or addability. REL-MIG-14's narrower `PL` pattern applies only to legacy free text and is not applied to 2.x playlist choices.

`decodeKey` and `isKey` validate the persisted physical code, optional `char` string and modifier booleans. DATA-12 does not restrict `char` to ASCII. The recorder retains printable characters for display; the shortcut engine compares characters only when both are ASCII letters or digits. These model functions do not impose recorder policy, resolve site clashes or match keyboard events.

The focused tests run with `bun test ./src/shared/model/model.bun-test.ts`. The filename avoids the existing Vitest discovery patterns. The root Bun pilot must include this path in its eventual discovery command. No preload or configuration change is required for this module.
