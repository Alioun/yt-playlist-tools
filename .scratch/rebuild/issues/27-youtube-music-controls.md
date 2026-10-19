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

Also from [ticket 26](26-youtube-music-quick-actions.md):
- Start from its placements.
- Prototype the split Save button and the picker, anchored to the button or centred when opened by key, using YouTube Music's own icons.
- In fullscreen (`f`), toasts must render inside the fullscreen element.

Also from [ticket 10](10-youtube-access.md): in-page icons and fonts are inline, since there are no web-accessible resources.

Also from [ticket 12](12-adding.md): toasts wait while their tab is hidden or in fullscreen. A picker untick sets the undo-skip.

Also from [ticket 28](28-queue-reorder.md) (adopted into ticket 26): queue items get Play next / Add to queue as moves. Prototype the "Moved" feedback and Undo.

Also from [ticket 08](08-shortcuts.md): the undo key (Alt+U) works on YouTube Music toasts.

Also from [ticket 18](18-breakage.md): the "not working" notice is a sticky variant of the shared toast. You own YouTube Music's item selectors, the row self-check and the anchor thresholds.

Also from [ticket 24](24-performance-budget.md): one hover overlay per page, not buttons on every row. Inject the picker when the pointer reaches Save, to hide its first-open delay. YouTube Music budget: at most 43 KB with everything on (PROVISIONAL, sized by analogy).

Also from [ticket 09](09-where-things-live.md) and its [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live) (branch `prototype/where-things-live`):
- **Rows:** reserve the button slot's width on song rows, so buttons never cover titles in narrow queue panels.
- **Album track rows:** no Like of ours.
- **Queue items:** Save, Like and Remove, plus ticket 28's moves.
- **Popup:** the "Playing now" row is in.
- **YouTube Music site-wide switch:** only YouTube Music gets one.
