# How do the popup and settings look?

Type: prototype
Status: open
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 08, 09, 11, 13

## Question

Prototype the popup and the settings page in the chosen stack, with realistic fake data. Cover:
- picking playlists: search, Watch Later, and a long list;
- channel filters;
- shortcuts and their labels;
- per-account setups;
- sync;
- theme;
- resetting data;
- first run;
- the upgrade note.

Also from [ticket 03](03-store-policy.md):
- Include the first-run disclosure and consent screen.
- The extension's own UI must not imitate YouTube's look and feel, so YouTube red can't stay as the primary colour.

Also include:
- the YouTube Music tab: its on/off switch, the choice of inline buttons, and its shortcuts;
- the feature switches from the modularity principle (map Notes).

Also from [ticket 21](21-youtube-music-internals.md): a side panel won't open in Chrome's installed-app windows, so YouTube Music app users need everything reachable from the popup.

Also from [ticket 01](01-youtube-requests.md): a picker with thumbnails and counts needs two requests (`get_add_to_playlist` plus `FEplaylist_aggregation`) and a cache.

Also from [ticket 11](11-accounts.md):
- **Account header:** avatar, name and @handle, with a placeholder while loading (never a signed-out flash).
- **Viewing another account's setup:** a picker only when two or more setups exist, only in normal windows, and never worded as "switch".
- **Settings:** an Accounts list with Remove.
- **States:** signed out, private-window read-only, the unclaimed 1.4.5 setup (Switch account / Discard) and the claim notice. The copy is in ticket 11's answer.
