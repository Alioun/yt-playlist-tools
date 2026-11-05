# Canonical auto-add choices

This module lets authenticated normal UI pages change one saved auto-add choice. It sends no video job. The first-run scalar chooser still refuses auto-add. A later many-mode adapter must supply the actual UI binding.

`AutoAddEdit` has separate selection, Takes and percentage variants. Takes uses the existing `AutoAddPlaylist` vocabulary. Percentages are integers from 0 through 100. A null percentage removes the override. The contract rejects unexpected fields and invalid account and playlist identities before dispatch.

The UI first sends `auto-add-read` through `Backend.change`. The owner returns the playlist fact and an opaque lifetime token. The token identifies an in-memory capture of the native UI origin, account, playlist and existing owner reset and account-removal revisions. It carries no persisted schema. Each owner retains at most 256 captures. Eviction returns stale on a later edit. An owner restart drops every capture. A caller must read again after stale, without automatically repeating a mutation.

The UI sends `auto-add-choice` with that token and the expectation for the edited field. Selection compares only chosen state. Takes compares Takes. Percentage compares the nullable override. Two selections captured without a Setup can append independently in owner-lane order. Takes and percentage edits preserve each other. Options never create a missing row. A stale field writes nothing. Tokens do not grant permission. Native sender authentication and private refusal remain separate from the body.

The owner uses its existing lane, authority checks, per-account removal revisions and confirmed Setup executor. `planSetupAccountChoice` calls the existing account-choice reducer and normalization. It preserves filters and unknown shortcut references and marks when Settings has a newer document version. A newer Setup refuses its edit. Unticking the final choice invokes the existing account-removal executor, including its cache, progress, session, last-account and sync consequences. A kept filter can retain a Setup. Reticking preserves that filter and defaults the new row to Videos.

Only a confirmed commit emits the existing Setup event. A no-op rechecks the actual field and returns a current view without a generation, timestamp, write or event. A rejected or uncertain persistence result keeps the existing owner stop behavior. Backend answers carry a separate operation discriminant, account, playlist and detached fact. Backend checks all three identities and the edited value. A timeout or lost answer sends no automatic retry.

The behavior, type negatives and consumer are authored but unexecuted. The audit return pins source identities and exact deferred gates. Cache, ExtLink and registry are authored dependencies awaiting runtime qualification and reconciliation. Native guarantees and privacy wording approval remain pending. Production activation remains held. The three pending picker policies are unchanged.
