# Features (1.5.0)

[← Docs](README.md)

- Auto-add the current video to one or more playlists after a set watch percentage
- Keyboard shortcut to add to a chosen playlist
- Duplicate check, so a video is never added twice
- Per-playlist channel filter for auto-add: allow only some channels, or deny some, from the popup's channel card or each playlist's filter editor, where a channel can also be typed in as an @handle or channel URL. The shortcut and Add to queue are never filtered
- One-click **Add to queue** button on thumbnails (not on Subscriptions, which has YouTube's own)
- Optional: right-click a video card to open YouTube's ⋮ menu (Shift+right-click for the browser menu)
- Optional toasts; light, dark and system themes
- Settings inside the popup (gear icon) or as a tab via the Options entry

Dev builds use your signed-in YouTube tab after you agree to session access in the popup. Keep a YouTube tab open, and reload it after signing in or changing accounts. Each account has separate playlist settings. Existing 1.x playlist choices stay saved and inactive. Choose playlists for each account manually while ownership verification remains unavailable.

Released 1.5.0 uses a Google OAuth token. See [legacy authentication](legacy/authentication.md). The full [2.0 rebuild](rebuild/README.md) is separate from this access migration.
