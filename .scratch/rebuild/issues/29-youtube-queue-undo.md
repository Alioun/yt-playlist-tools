# Can one entry be removed from YouTube's queue quietly?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

YouTube Music's queue actions have Undo ([ticket 26](26-youtube-music-quick-actions.md)), but YouTube's thumbnail Add to queue button has none ([ticket 12](12-adding.md)), because no researched way exists to remove one entry from YouTube's queue (the miniplayer queue). Can a page script remove a single entry, or the last-added entry, from YouTube's queue through YouTube's own client machinery, without clicking its UI and without YouTube showing its own toast? How fragile is it?

## Answer

Yes, quietly, through YouTube's own command resolver. This was verified at the request level, signed out only. Full findings, with a console snippet in §9: [`docs/research/youtube-queue-undo.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-queue-undo/docs/research/youtube-queue-undo.md) on branch `research/youtube-queue-undo`.

- **What the queue is:** a temporary server playlist (`TLPQ…`, owned by the session) mirrored by a queue object in the tab. Each entry has its own `playlistSetVideoId`, so a video can be queued twice.
- **Quiet removal:** resolve `playlistEditEndpoint {playlistId: "TLPQ…", actions: [{action: "ACTION_REMOVE_VIDEO", setVideoId}], params: "IAE%3D"}` with no `clientActions`, then `refreshPlaylistCommand {listId}`. With `IAE%3D`, the response carries no toast; YouTube's own Undo buttons use the same value.
- **Not quiet:** the queue panel's own remove item and `playlistRemoveVideosAction`. YouTube shows a "Removed from Queue" toast from those edits' responses.
- **The last-added entry:** take its `playlistSetVideoId` from the panel data once it has refreshed after the add. Never remove by video ID: that removes every copy.
- **Fragility: medium–high.**
  - `IAE%3D` is opaque. If it stops working, the entry is still removed but YouTube's toast appears.
  - The panel data's location and `ytd-app.resolveCommand` can change.
  - Overlapping edits can get HTTP 409, so confirm and retry.
- **Side finding:** today's Add to queue button probably makes YouTube show its own "Added to Queue" toast, with Undo, for every add after the first. A quiet add route exists (`ACTION_ADD_VIDEO` with `IAE%3D`).

Confirmed signed out by [ticket 25](25-live-checks.md)'s probe: quiet removal and quiet add work through the global resolver, and the plain routes show YouTube's toasts. Signed-in confirmation is pending.
