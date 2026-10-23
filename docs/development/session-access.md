# YouTube session access in dev builds

Dev builds use an open, signed-in YouTube tab. Released versions still use the [legacy setup](../legacy/README.md). This access migration retains the React interface and existing features. The full [2.0 rebuild](../rebuild/README.md) is separate work.

The popup asks for agreement before the extension registers or injects its YouTube scripts. Revoking access unregisters those scripts and removes the extension's controls from open pages. Feature switches, shortcut keys, the watch threshold, and the theme are shared settings.

The background selects an available YouTube tab in the same normal or private context as the caller. It executes bounded jobs in that tab's MAIN world. Cookies and raw account identity stay inside the page. The extension receives a digest that identifies the account's setup.

Each operation captures the current consent generation. Revocation, regranting access, and Clear All Data invalidate earlier operations. Each add keeps its original deadline across background queues and page execution. Each add checks current membership on YouTube before sending a write. An uncertain result requires checking the playlist on YouTube before trying again. The extension never retries that write automatically.

Playlist choices and channel filters belong to each account. Private windows can use existing choices but cannot save choices or caches. Saved playlist lists remain available as read-only data when no YouTube tab is open in a normal window.

Old 1.x choices remain saved and inactive. Choose playlists for each account manually. Automatic claiming is unavailable because the existing research does not establish playlist ownership, including collaborative playlists. See ACC-35 in the [account specification](../../.scratch/rebuild/spec/04-features-accounts-data.md).

The migration deletes OAuth credential keys by name without reading their values. It also removes the retired IndexedDB video history. Clear All Data removes both extension storage and that database.

Chrome 121 or newer and Firefox 140 or newer are required. After signing in or changing accounts, reload YouTube if the popup cannot establish the account.

The [verification record](session-access-verification.md) describes the checks, design decisions, and remaining live-session limits.
