# Setup destination edits

The owner reads one account's Setup and changes one destination at a time: the YouTube quick-save playlist, the YouTube Music quick-save playlist, the gather playlist, or an existing shortcut's playlist on that account.

## Calling it

```ts
const read = await owner.readSetup(acct)
if (read.kind !== "value") return
const destination = { kind: "quick-save" } as const
const result = await owner.changeSetupDestination(origin, {
  acct, destination, expected: expectDestination(read.view, destination), playlist
})
```

A shortcut choice passes `{ kind: "shortcut", shortcut }` as the destination. `playlist: null` clears it.

## Rules

- `readSetup` returns `none` for an absent or removed Setup and never writes. A live view hides targets whose shortcut row no longer exists in Settings.
- A change names its account, one destination and what the caller saw. `expected` is `{ setup: "none" }` or `{ setup: "live", playlist }`. A mismatch returns `stale` with `setup`, `destination` or `shortcut`, and writes nothing. A capture of a live Setup never recreates one that was removed since. A shortcut that is gone from Settings is never recreated.
- An explicit choice against `none` creates the Setup. Clearing an absent destination is a no-op. A no-op reads but allocates no generation or time.
- A clear that leaves no choices or kept filters calls the existing account-removal transaction in the current owner lane. The explicit clear needs no additional confirmation. The full planner snapshot remains an acceptance condition, including Settings and every account document. Concurrent choices prevent deletion. The existing continuation, tombstones, local and session cleanup, and retirement handle interruptions and restart. A completed clear returns `committed` with `{ kind: "none", acct }` only after every removal stage and the absent view are confirmed.
- A private or unfound window is refused as `private` before any read, stamp or clock read. Malformed IDs are refused as `invalid` at the boundary.
- Writes run in the owner's lane through the same ports as `changeSharedSetting`: `guardedLocal`, the fenced sync reader, the retained-authority hold and the owner's `authority`. Pending startup, a newer layout or document, withheld or withdrawn consent, retained work, a pending removal or join, lost canonical authority, disposal and earlier uncertainty all hold the edit.
- `planSetupDestination` reuses `changeAccountChoice` with explicit normalization context. `executeSetupDestination` prepares the full document with `prepareDocumentBody`, stamps it once, records first-edit provenance, rechecks the complete records before `set` and confirms by exact complete readback. The existing flush pushes later.
- Newer-version refusal applies to the edited Setup, including its remote copy when sync is on. Readable Settings still controls shortcut membership and Watch later normalization. Unreadable newer Settings remains unchanged. Its unknown shortcut targets and marks survive supported Setup edits without substituting Settings defaults.
- `planAccountDocumentWrite` projects unrelated newer local documents only for admission through the existing `planSyncWrite`. A supported remote counterpart remains in that projection with its own generation acknowledged. An absent or newer remote counterpart stays outside the writable projection. The complete remote inventory still counts toward quotas. Projected documents and acknowledgements are never persisted. The global flush, authority checks and canonical ownership keep their existing rules.
- A rejected write whose readback shows the original records is `failed`. Any other inexact or failed confirmation is `unconfirmed`, which stops the owner like other uncertain writes.
- Removal failures retain their original staged result under `{ kind: "removal", result }`. A confirmed document deletion does not imply that cache, session or retirement stages finished. Pending or uncertain removal stops the owner and leaves recovery to the existing continuation.
- `subscribeSetup` receives `{ kind: "setup-changed", source: "local" | "sync", acct }` after confirmed local edits or adoption of that account's Setup. Manual and automatic receiving share the confirmed receive result. Join and reconciliation publish after confirmed completion. Unchanged, refused, failed and unconfirmed work emits nothing. `subscribe` keeps receiving only Settings events. Disposal, unsubscribe and ownership teardown keep the existing listener lifetime.

## Not built here

- The router computes the trusted origin. The operation accepts only a `ui` origin today. An in-page picker pin reaches it after the router authenticates the tab sender and binds the tab's own account. Until then a `tab` origin does not type-check.
- The generic `read(view)` and `change(origin, change)` Store entries, auto-add rows, labels, marks, import and the last-account field remain separate operations.

All runtime qualification remains unexecuted in this completion unit. Static patch replay establishes byte and mode identity only.
