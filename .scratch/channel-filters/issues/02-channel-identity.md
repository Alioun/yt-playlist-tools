# What identifies a channel in a filter entry?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Channel filters](../map.md)
Blocked by: 01

## Question

Which identifier is canonical for a channel in a channel filter (channel ID, handle, or something else), what is stored alongside it for display, and what happens when a channel renames itself or changes its handle?

## Answer

Resolved with the user, 2026-10-04.

- **Canonical key:** the `UC…` channel ID. Handle and display name are labels only, never used for matching.
- **Stored labels:** title, plus the handle when one is known (from typed `@handle` input, a `channels.list` lookup, or the bridge). Shown as "Title · @handle". The handle is optional because a lookup for a watched video doesn't return it.
- **Freshness:** whenever the lookup during auto-add returns a `channelTitle` for a listed channel, update the stored title (no extra quota). The handle is only refreshed when the user re-adds the channel. Stale handles do no harm because matching uses the ID.
- **Reassigned videos:** no special handling. The filter checks the video's channel when auto-add fires.
- **Shared labels:** each channel filter holds channel IDs only. One shared store maps a channel ID to its labels and is shared across playlists. When a channel ID is no longer on any filter, its label record is removed.
- **Term:** "listed channel" (added to `GLOSSARY.md`).
