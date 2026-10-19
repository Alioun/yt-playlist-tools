# Can a song already in the queue be moved to play next?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

[Ticket 26](26-youtube-music-quick-actions.md) leaves Play next and Add to queue off queue items, because there they'd add a second copy. Moving the existing entry instead would improve them. Can a page script move an item that's already in YouTube Music's queue to right after the playing song, or to the end, through YouTube Music's own reorder path (the queue panel's drag reorder)? Does the move stay in step with YouTube's server-side copy of the queue? How fragile is it?

## Answer

Yes. Full findings, with a DevTools snippet in §7: [`docs/research/queue-reorder.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/queue-reorder/docs/research/queue-reorder.md) on branch `research/queue-reorder`.

- **The mechanism:** the queue panel's drag ends in a private function that moves the item in the tab's queue state, sends `browse/edit_playlist` `ACTION_MOVE_VIDEO_AFTER` to YouTube's server copy, forwards the move to a cast device, and turns off the "responsive radio" flag. `app.queue` has no move method.
- **How a page script reaches it:** fire the same `ytmusic-reorderable-list-drop` event on the queue panel, with a stand-in element naming the item and where it goes. Nothing visible is clicked and no request is hand-built.
- **Server sync:** in step as far as YouTube Music's own drag is, because it's the same request. It's fire-and-forget, though: a failure never reaches the page, and the tab keeps the move. Others (Pear Desktop, youtube-music-companion) reorder only the tab's copy, which the server can later revert.
- **Fragility: medium.** The names survive minification, and the panel survived the September player redesign, but the event's contents are private and nobody else uses this path. A stand-in that matches no item moves the last item instead, so check the item first and confirm its new position afterwards.
- **Side finding:** YouTube Music turns off the responsive-radio flag after every insert. Ticket 21's replayed insert skipped it; ours should match.
- **Limit:** songs in the autoplay suggestions can't be moved this way.
