# What happens to a channel filter when its playlist changes?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Channel filters](../map.md)

## Question

What happens to a playlist's channel filter, and to the shared channel labels, when:
- the playlist is unchecked as an auto-add playlist, and later re-checked;
- the playlist disappears from the user's YouTube playlists (deleted, or no longer returned by the playlist refresh) or is renamed;
- the user runs Clear All Data (`storage.ts` `clearAll()`), or signs out, or signs in as a different Google account?

## Answer

Resolved with the user, 2026-10-05.

- **Unchecked as an auto-add playlist:** the filter is kept, inactive. The row editor is hidden while the playlist is unchecked, and the filter applies again unchanged when it is re-checked.
- **Renamed on YouTube:** no effect. Filters are keyed by playlist ID.
- **Deleted on YouTube, or missing from a refresh:** the filter is kept as an orphan and never pruned automatically. A short refresh (a pagination failure, another account, a temporarily hidden playlist) must never destroy filters. Orphans aren't shown anywhere. Channel labels referenced only by orphaned filters stay too.
- **Clear All Data:** filters and labels go with `storage.local`. `clearAll()` additionally clears `storage.session` (the `videoId → channel` cache), so Clear All Data covers everything the extension stores.
- **Sign out / different Google account:** no special handling, consistent with how the playlist selection behaves today. Signing out keeps filters. Another account's playlists have different IDs, so earlier filters stay dormant and return if the user switches back.
