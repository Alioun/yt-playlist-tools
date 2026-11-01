# Session memory

`session-memory.ts` owns the browser-session records AddFlow and Tabs need from 04 DATA-11. It owns `paused`, `skips:<acct>`, `recent`, `cooldown:<acct>`, `shown`, the account partitions of `gather`, and `tabs`. The canonical owner reads and changes them through `readSession()` and `changeSession(change)` inside its one lane, beside Setup and account removal. There is no second session writer.

## Shapes

`parseSessionMemory(raw)` is the boundary. It reads only the names above and refuses a malformed one. Unknown names, unknown fields outside tab rows, `recentAdds`, and `breakage` stay untouched. Tab rows have an exact validated shape, so they cannot retain private flags, raw identities, or browser objects. `shown` and `gather` keep the `{ v: 1, global, accounts }` partitions that `account-removal-session.ts` already cleans per account. Shown-once keys for one playlist (`missing:` and `full:`) live in the account's partition. The others live in `global`. DATA-58's gather records live under `accounts[acct].last`, newest first by `seq`, five across all accounts. A record whose entry ID was never returned keeps `setVideoId: null`, so its Undo uses the guarded video fallback.

`planSessionChange(raw, change)` applies a list of edits to a fresh raw record and returns only the touched names, the account keys to remove and the complete expected record. A caller never commits a whole snapshot, so a concurrent unrelated change survives. A later Gather caller can put its `recentAdds` entry in the same change and commit both in one `set()`.

## Time

Persisted times are wall-clock milliseconds, since a new worker's `performance.now()` has another origin. A window `[start, start + length)` counts only while wall time sits inside it. Wall time that moves backwards ends a window early and never extends it.

## Results

The revision contains a reset counter and one counter per removed account. The owner advances the account's counter before removal can clear its session records. A change carries its captured revision, and the owner refuses edits for a removed account under that revision. Unrelated accounts keep their authority. A reset revokes all accounts. Reads and committed writes carry a sequence number in lane order.

| Native outcome | Result |
| --- | --- |
| `set` resolved and readback equals the plan | `committed` with the confirmed memory |
| `set` rejected and readback unchanged | `failed`, `applied: false`. The owner stays usable. |
| `set` rejected and readback equals the plan | `failed`, `applied: true`. The owner stops as stale. |
| `set` resolved but readback differs, or readback fails | `unconfirmed`. The owner stops as stale. |

Private browsing memory never reaches this module's storage path. AddFlow keeps it in its own variables, using the same edit rules on an in-memory record.

After a cleanly rejected write, AddFlow retains confirmed recent-add facts and active 429 deadlines in that engine. A later owner read does not erase them. Reports retain the storage failure without claiming durable confirmation. Expiry, backwards wall time, account removal and owner revocation end the corresponding retained authority. A successful Undo supersedes the retained recent-add fact.

The dormant `createBrowserLocalFilterWriter` adapter passes native `storage.session.get`, `set` and `remove` to this same owner and exposes its session port to AddFlow. Adapter tests exercise those native method boundaries over `fakeBrowser`, including readback failures and private account isolation. They do not prove native durability, ownership, exclusion or worker lifetime.

Tabs uses that same session port. `tab-seen` replaces one normal row against a fresh record and caps the registry at 200. `tab-forget` names the captured row and cannot delete a later replacement. Both edits use the existing account revision checks. Account removal deletes matching tab rows and preserves signed-out and other-account rows. An unchanged row produces no native write.

`tabs` maps native tab IDs to `{ site, acct, signedIn, hidden?, fresh?, at?, seenAt? }`. The sign-in variants require either a validated account key or null. `at` records hello time. `seenAt` orders registry eviction without using navigation or access listeners. An unchanged ping preserves it, so registry observation never replaces native `lastAccessed` as the routing order. Private rows use a separate in-memory map and never pass through a canonical storage edit.

Clear all data does not exist in the owner yet. When it lands it must advance the reset counter in the lane before removing these names. The Gather controller and atomic Recent adds integration remain later work.
