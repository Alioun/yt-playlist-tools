# Account setups hold only playlist choices, keyed by YouTube's DATASYNC_ID

2.0 keeps a separate setup for each YouTube account. An account is whatever `ytcfg.DATASYNC_ID` identifies: a Google account, or one of its brand accounts, the thing that owns playlists. An account setup holds only the choices that name that account's playlists: auto-add playlists and their channel filters, each shortcut's playlist, and one-click save targets. Feature switches, keys, the threshold, YouTube Music choices and the theme are shared by every account.

Playlist IDs only work on the account that owns them, while how a person wants YouTube to look and behave doesn't change with the account. Page scripts are also registered per browser, not per account, so per-account switches couldn't keep the "off costs nothing" rule.

## Considered options

- **`authuser` / `SESSION_INDEX`:** a position in the browser's sign-in list, which shifts as accounts sign in and out.
- **The Google account alone:** merges a person's own channel with their brand channels, whose playlists differ.
- **The playlist-owning identity alone** (brand page ID, else user ID): means parsing YouTube's key format, and only helps one person reaching one brand channel through two Google accounts.
- **A whole setup per account, switches included.**

## Consequences

- Storage and sync are keyed by `DATASYNC_ID`. If it proves unstable (rebuild map, ticket 25), setups are re-attached by playlist ownership.
- Nothing about an account is stored until the user makes a choice for it. Private windows never create or change setups.
- Keys are a 16-character digest of `DATASYNC_ID`; the raw ID is never stored (rebuild map, ticket 16).
