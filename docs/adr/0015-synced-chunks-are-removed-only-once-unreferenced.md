# Synced chunks are removed only once nothing can still need them

A document too large for one `storage.sync` item is split into chunks (SYNC-18). The base item `s:<document>` holds a pointer naming the document's generation and its chunk count, and the chunks are `s:<document>@<gen>.<i>`. Rewriting the document writes a new pointer and new chunks in one `set()` call. The old generation's chunks stay behind, and they count against the 96 KiB budget until someone removes them (SYNC-14). SYNC-27 allows cleanup but never said which chunks are safe to remove. This is that rule.

A browser removes a chunk key only when every one of these holds:

- **It parses as a chunk of a known document key.** Anything else, including keys a newer version of the extension wrote, is left alone.
- **The document's base no longer points at that generation.** The base is a pointer to a different generation, a single-item document, or a tombstone. A base that is missing or `null` doesn't count, because another browser's chunks can arrive before its pointer does (SYNC-13).
- **The base's current form is complete and supported here.** A pointer's own chunks have all arrived, and the document isn't a newer version (SYNC-23). Until then a reader might still be assembling it, so nothing of that document is touched.
- **This browser holds no pending push of that document.** Its local generation equals its `pushed` entry, so its next push can't need the chunk.

Removal follows SYNC-27's pacing. It runs in the cleanup opportunity of an automatic receive or start pass, after any push, as a separate `remove()` call that takes its own 5 s mutation slot. A push and a removal never share one call. The browser reads the synced copy again just before the call and drops any key whose conditions no longer hold. Expired tombstones already use this opportunity (SYNC-12), and both kinds of keys can go in the same `remove()`.

Any browser that syncs may clean, and two browsers removing the same keys converge, because removing a missing key changes nothing. A browser never counts planned cleanup as free room: only a fresh read that confirms the removal changes the occupancy it admits writes against (SYNC-14).

## Considered options

- **Remove the old chunks in the same call that writes the new generation.** One call would keep the copy tidy, but SYNC-27 forbids a set plus a remove in one opportunity. A browser that has the new pointer but not yet the new chunks would also lose the only complete copy it could read.
- **Only the browser that wrote a generation removes its chunks.** That browser may never run again, so its leftovers would stay for good. Tracking authorship would also need a new field in every pointer.
- **Remove every chunk the current pointer doesn't name, base or no base.** This breaks a write in flight from another browser, whose chunks can land before its pointer.
- **Never remove chunks, and rely on the budget refusing writes.** The copy would fill with dead chunks after enough rewrites of a large filter, and users would see "Synced settings are full" for data that is gone.

## Consequences

- A rewritten large filter frees its old room one cleanup opportunity after the new generation fully arrives, which is at least 5 s after the push.
- Orphan chunks whose base never arrives are never removed by this rule. They stay counted, and Clear all data removes them (DATA-40).
- The rule needs no new stored state. Each condition is checked against the local copy and a fresh read of the synced copy.
- The cleanup code isn't built yet. It belongs beside `planSyncTombstoneCleanup` in `src/background/store/tombstone-expiry.ts`, and its tests should cover each condition above, including a pointer whose chunks are still arriving and a newer-version document.
