# What does auto-add tell the user when a channel filter skips a video?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Channel filters](../map.md)

## Question

Today each playlist add sends its own toast ("Added … to playlist", "Video already in playlist."). When channel filters are involved, what toasts does an auto-add send? Cover:
- one playlist skipped by a filter;
- a mix of added, filtered and duplicate playlists in one auto-add;
- every playlist filtered out;
- an unknown channel (denylist playlists still get the video, allowlist playlists skip it, as settled while charting).

Toasts are optional (`toastEnabled`), so also decide whether anything is logged or shown when toasts are off.

## Answer

Resolved with the user, 2026-10-05.

- **Existing toasts unchanged:** added and duplicate playlists keep today's per-playlist toasts.
- **Filtered playlists:** one extra toast per auto-add covers every playlist a filter blocked, naming the channel and the playlists from `cachedPlaylists`: "Lofi Girl filtered out of Learning, Cooking".
- **Every playlist filtered:** the same single toast with no "Added" toasts. The watch threshold must never pass silently.
- **Unknown channel:** denylist-mode playlists show their normal "Added" toast. Skipped allowlist-mode playlists get one toast: "Couldn't identify the channel, so it was skipped for Music".
- **Toasts off:** nothing is shown (the content script already drops toasts when `toastEnabled` is off). The background logs each filter decision with `console.info("[YT Playlist Tools]: filtered …")`.
