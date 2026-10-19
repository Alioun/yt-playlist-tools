# What happens when a video is added?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 01

## Question

Decide the add flow for auto-add, shortcuts, quick-save and the queue:
- **Duplicates:** use YouTube's real "already in this playlist" state. Does "Prevent duplicates" stay a setting?
- **Order:** the order of checks (channel filters, duplicates).
- **Feedback:** what a toast says (naming the playlist and the video), success vs. failure styling, and undo.
- **Failures:** signed out, network, a playlist that's gone, a full playlist, a private video.
- **Concurrency:** two tabs, or auto-add and a shortcut at once.
- **Creating a playlist (approved):** where it's offered, and with which options (title, privacy).

Also from the YouTube Music charting (Q19): Save to playlist on YouTube Music uses this same flow, including the picker that shows where the song already is.

Also from [ticket 01](01-youtube-requests.md):
- **Duplicates:** what a duplicate add does on youtube.com is unknown until [ticket 25](25-live-checks.md).
- **Undo:** remove the exact entry ID the add returned.
- **New playlists:** they can take minutes to appear in listings, and creation is rate-limited (daily caps on public playlists).
- **Success:** read it from `status`, not the HTTP code.
