# How do the controls inside YouTube Music look and behave?

Type: prototype
Status: open
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 09, 21, 26

## Question

Prototype the quick-action controls in YouTube Music's own look: inline buttons on song rows, album and playlist cards and the queue panel; the player bar; the save-to-playlist picker; and feedback. Once the static look is agreed, make a rough dev build and try it on real music.youtube.com, including the installed YouTube Music app if [ticket 21](21-youtube-music-internals.md) shows extensions run there.

Also from [ticket 21](21-youtube-music-internals.md): don't hang controls off the player bar, because the A/B-tested new player UI removes it. The side panel doesn't open in Chrome's installed-app windows.

Also from [ticket 11](11-accounts.md): the YouTube Music section's choices are shared by every account; only Save to playlist's one-click target is per account.
