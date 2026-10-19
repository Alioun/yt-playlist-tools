# How do YouTube Music quick actions behave?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 21

## Question

Settled while charting (Q14–Q21):
- **The quick actions:** Play next, Add to queue, Save to playlist (one click to a chosen playlist, plus a picker that shows where the song already is), Like / unlike, and Remove from queue.
- **Where they appear:** inline buttons on hover on every song row and card (search, albums, playlists, home shelves, the queue panel), on the player bar, and as keyboard shortcuts that act on the hovered row, else on the playing song.
- **Which buttons show:** the user picks; Play next and Add to queue are the default. Every action can have a shortcut.
- **Albums and playlists:** Play next and Add to queue work on whole album and playlist cards too.
- **Carried over:** playlist shortcuts and quick-save work on YouTube Music. Auto-add and channel filters stay YouTube-only.
- **Installed app:** supported first-class if [ticket 21](21-youtube-music-internals.md) shows extensions work there.

Decide the behaviour:
- **Feedback:** what each action shows. YouTube Music's own "added to queue" toast, ours, or both?
- **Undo.**
- **Albums and playlists:** what Play next and Add to queue do with them (order, shuffle state).
- **Empty player:** what happens when nothing is playing or the queue is empty.
- **Scope:** where Remove from queue applies. Whether Like applies to albums.
- **Keys:** default keys, and clashes with YouTube Music's own shortcuts (from ticket 21).
- **Placement:** where exactly the buttons sit on rows, cards and the player bar.
- **Failures:** what happens when an action fails.

Also from [ticket 21](21-youtube-music-internals.md):
- **Player bar:** the Q16 "player bar" placement is at risk. YouTube Music is A/B testing a player UI without one, so decide where the now-playing actions live when the bar is missing.
- **Feedback:** YouTube Music's own toast is reachable through `handleAddToToastAction`. Decide whether to use it.
- **Membership:** the Save-to-playlist picker's membership comes from youtube.com's answer, since YouTube Music's client never reads it.
- **Keys:** every Alt combination is free on YouTube Music's side.
