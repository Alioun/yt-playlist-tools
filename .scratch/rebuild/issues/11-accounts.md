# How do per-account setups work?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 01

## Question

Approved: each YouTube account keeps its own setup. Decide:
- **What an account is for us:** a Google account, a brand account or a channel, depending on what [ticket 01](01-youtube-requests.md) shows YouTube can tell apart.
- **What belongs to an account's setup vs. the device:** auto-add playlists, filters and the shortcuts' playlists vs. toasts and theme.
- **Account changes:** what happens when the user switches accounts, signs out, or visits with a new account for the first time.
- **Migration:** which account a migrated 1.4.5 setup belongs to.

Update GLOSSARY.md with the term.

Also from [ticket 03](03-store-policy.md): nothing may be stored from private windows. Decide how container tabs and private windows relate to accounts and setups.

Also from [ticket 02](02-request-context.md): requests sent from a tab follow that tab's account, container and private window. Decide which tab the popup uses when several YouTube tabs differ, and whether 2.0 runs in private and incognito windows at all.

Also: YouTube Music uses the same account. Decide whether the YouTube Music section's choices belong to the account or the device.

Also from [ticket 01](01-youtube-requests.md): `DATASYNC_ID` from `ytcfg` is YouTube's own identity key, and the natural key for per-account setups (not the `authuser` index). Switching account is a full-page sign-in redirect, so the extension can't switch accounts itself.

## Answer

Each **account** gets its own **account setup**. An account is the YouTube identity a page is signed in as: a Google account, or a brand account it switched to. The setup holds only the choices that name that account's playlists; every other setting is shared by all accounts. Setups are keyed by YouTube's own `DATASYNC_ID`. They follow each tab's account, because 2.0 never switches accounts itself, and nothing is ever written to them from a private window. Proposed with this answer: glossary entries **Account**, **Account setup** and **Unclaimed setup**, and an ADR for the keying and the split.

### What an account is

- **An account is whatever owns playlists:** a Google account's own identity, or one of its brand accounts. Each one has its own playlists, Watch Later and setup. Setups point at playlists, and a brand account's playlists aren't its Google account's.
- **The key is `DATASYNC_ID` from the page's `ytcfg`.** It's stored whole and never parsed (its forms are `<brand>||<google>` and `<google>||`).
  - It's YouTube's own per-identity key.
  - www.youtube.com and music.youtube.com both carry it, next to `LOGGED_IN` (checked with a signed-out fetch on 2026-10-19).
  - **Not `SESSION_INDEX` / `authuser`:** that's a position in the browser's sign-in list, and it shifts as accounts sign in and out.
  - **Not the Google account alone:** that would merge a person's own channel with their brand channels, whose playlists differ.
  - **Runner-up:** key on the playlist-owning identity alone (`DELEGATED_SESSION_ID`, else `USER_SESSION_ID`). That would give one setup per brand channel even when two owners' Google accounts use it in the same browser. It lost because it means parsing YouTube's key, and the case it improves is rare; the result there (two setups) isn't wrong.
  - **PROVISIONAL until [ticket 25](25-live-checks.md):** this assumes `DATASYNC_ID` survives sign-out and sign-in and is the same in every browser. yt-dlp lets users pin it as a static setting, which suggests it does. If it doesn't, the playlist-ownership matching used for 1.x setups (below) re-attaches a setup to the account that owns its playlists.
- **Signed in** means `ytcfg` `LOGGED_IN` is true. A signed-out page's `DATASYNC_ID` (`V…||`) is a visitor ID and never becomes a key.
- **Edge cases:** an account without a channel is still an account; Watch Later works, but creating a playlist may fail ([ticket 12](12-adding.md)). A delegated channel manager is whatever its `DATASYNC_ID` says, with no special case.
- **Switching accounts is YouTube's job.** No request switches accounts, so 2.0 only links to YouTube's own pages:
  - "Switch account" opens `https://www.youtube.com/channel_switcher`;
  - "Sign in" opens YouTube's sign-in page, which returns to the same page.

### What belongs to an account setup

**Rule: a choice belongs to the account setup only if it names one of that account's playlists. Everything else is shared.** Playlist IDs only work on the account that owns them, but how a person wants the extension to behave doesn't change when they switch accounts.

| Account setup (one per account) | Shared by every account |
|---|---|
| Auto-add playlists and their channel filters, orphaned filters included | Every feature's on/off switch and its "show feedback" option |
| The playlist each playlist shortcut adds to | The shortcuts themselves: their keys and labels |
| Any default playlist for one-click saving: quick-save ([ticket 14](14-in-page-controls.md)) and YouTube Music's Save to playlist ([ticket 26](26-youtube-music-quick-actions.md)) | The watch threshold. If [ticket 07](07-watched.md) makes it per playlist, it travels with the playlist instead. |
| The account's label: name, @handle and avatar | The Add to queue button and the right-click card menu |
| Caches of the account's playlists and membership ([ticket 16](16-storage-and-sync.md)) | The YouTube Music section: its switch, inline buttons and quick-action shortcuts |
| | Theme, settings sync, and channel labels (a channel's title is the same for everyone) |

- **"Shared" isn't "this device only".** [Ticket 16](16-storage-and-sync.md) decides what syncs. Setups can sync too, because their key is browser-independent (provisional, see above).
- **A new account starts with no setup.** Nothing about it is stored until the user makes a choice for it, such as ticking a playlist or choosing a shortcut's playlist. When a setup's last choice is removed, the setup and its label go too. Most accounts a browser sees never need a setup.
- **An account with no choices stays idle:**
  - auto-add doesn't track anything there;
  - nothing extra is drawn on the page;
  - explicit actions still get an answer. A shortcut with no playlist on this account shows "{Shortcut} has no playlist on {Name} yet. Choose one in the popup." ({Shortcut} is its label, else its key.)
- **There are no per-account feature switches.** An account with no auto-add playlists effectively has auto-add off.
  - **Runner-up:** a whole setup per account, switches included, so a work account could have everything off.
  - **Why it lost:**
    - page scripts are registered per browser, not per account, so a per-account "off" would still load code that then idles, which breaks "off costs nothing";
    - every new account would start with everything off;
    - how YouTube looks is the person's choice, not the account's.
- **Keys are shared; targets are per account.** A shortcut with no label shows the current account's playlist title.
  - **Runner-up:** a separate shortcut list per account.
  - **Why it lost:**
    - browser-level `commands` (an option in [ticket 08](08-shortcuts.md)) are global anyway;
    - someone with two accounts expects the same key to do the same job on both;
    - it would double the key management.
- **Setups can't be copied between accounts.** Each playlist belongs to one account, so a copy would carry mostly broken targets.

### Which account is current

- **On a page:** always that tab's own account, read at every page load. A tab keeps its account until it reloads, just as YouTube's own page does.
  - In-page features use only that account's setup.
  - The background gives a tab nothing else. [Ticket 03](03-store-policy.md) requires that nothing identifying the user across containers reaches web content.
- **In the popup**, the current account is the first that applies:
  1. the active tab's account (or its signed-out state), when that tab is YouTube or YouTube Music;
  2. else the account of the most recently active YouTube tab, among windows of the same kind (private or normal);
  3. else, with no YouTube tab open, the account last current in a normal window, shown from cached data with "Open YouTube" ([ticket 10](10-youtube-access.md)). A private window has no fallback.
- **Viewing another account's setup:**
  - When two or more accounts have setups, the popup's account header can show any of them (normal windows only).
  - This only changes what the popup shows, never YouTube's account, so the copy never says "switch".
  - Settings lists every account that has a setup, each with Remove.
  - With a single account there's no picker, only the label. [Tickets 09](09-where-things-live.md) and [15](15-popup-and-settings.md) decide placement; this behaviour is settled.
- **Requests for the account shown** go through its most recently active open tab, in a window of the same kind.
  - Containers don't matter, since the account decides.
  - If no tab answers, the popup shows cached data and: "{Name} isn't open in any tab. Open YouTube and switch to this account to refresh its playlists."
- **The account header always names the account,** with avatar, name and @handle.
  - While the account is being read it shows a placeholder, never the signed-out state. This fixes two Friction items: no account identity shown, and the signed-out flash.
- **Labels:**
  - **Source:** YouTube's account menu request ([ticket 10](10-youtube-access.md)).
  - **Storage:** kept with the setup and refreshed whenever the account is seen in a normal window.
  - **Fallback:** "Unnamed account".

### Account changes

- **Switching account or channel in a tab** is a full page load on YouTube. The page picks up the new account's setup, and an open popup follows the tab it's showing.
- **A new account's first visit:**
  - nothing happens on the page and nothing is stored;
  - the popup shows the account with its playlists unticked;
  - the first choice creates its setup.
- **Signing out keeps every setup.** On a signed-out page:
  - auto-add stays silent, which fixes the Friction item "No access token found" on every video;
  - a playlist shortcut or quick-save shows "Sign in to YouTube to save videos.";
  - Add to queue, the card menu and YouTube Music's queue actions keep working, since they need no account;
  - the popup says "You're not signed in to YouTube in this tab." with **Sign in**, and other setups stay reachable from the account header.
- **Signing out or switching accounts in another tab:** a tab that's already open still believes it has its old account. A guard catches this:
  - Every YouTube response names the account it answered for (`datasyncId`).
  - When that differs from the tab's account, the tab stops sending: no further adds, and auto-add is disarmed.
  - It shows: "Your YouTube account changed in another tab. Reload this page to keep saving here."
  - Watch Later is why this matters. Its ID means "the current account's Watch Later", so an add would land in the wrong account. Other playlists simply fail, because the other account doesn't own them.
  - Tickets [10](10-youtube-access.md) and [12](12-adding.md) place the check before writes.
- **Removing a setup** (from Settings):
  - Confirmation: "Remove {Name}'s setup? Its auto-add playlists, channel filters and shortcut playlists are deleted from {this browser | every browser that syncs your settings}. Your playlists on YouTube aren't touched." with **Remove** and **Cancel**.
  - A deleted account's setup stays, dormant, until it's removed.

### Containers and private windows

- **Containers need no special handling.** A container is just another place an account can be signed in.
  - Its tabs report their account like any other tab.
  - The same account in two containers shares one setup; a different account gets its own.
  - No container IDs are stored.
- **2.0 runs in private and incognito windows only if the user allows it in the browser.** That's off by default on both browsers. The manifest's `incognito` stays at its default.
  - **Runner-up:** `"incognito": "not_allowed"`, the simplest way to comply.
  - **Why it lost:** it takes away a choice the browser already gives the user.
- **When allowed, private windows use setups but never save anything from the session:**
  - **What works:** an account that already has a setup behaves as in a normal window: auto-add, shortcuts, quick-save and YouTube Music.
  - **What's never written:** nothing that comes from the private session goes into any storage area. That rules out new setups, setup edits, labels, caches, the last-current account, and claiming a 1.x setup.
  - **Fetched data:** playlist lists, membership and undo entries live only in that tab's memory and go away with it.
  - **Shared settings can still be changed** from a private window's popup. They're the user's own configuration and carry nothing from the session.
    - **Runner-up:** make them read-only too.
    - **Why it lost:** locking a theme or a feature switch protects no private data.
  - **One write guard:** the background refuses every write of setups, labels, caches or the last-current account that comes from a private tab or a private window's popup ([ticket 17](17-modules.md)). The guard is needed because Chrome's default "spanning" mode shares storage between normal and incognito.
  - **Routing:** a normal window's popup never routes through private tabs, and a private window's popup routes only through private tabs.
  - **Popup copy:**
    - account with a setup: "Private window: {Name}'s setup is in use. You can change it only in a normal window."
    - account without one: "{Name} has no setup yet. Private windows don't save anything, so set it up in a normal window."
- **Auto-add in a private window works as it does elsewhere.** Allowing the extension there is an explicit choice, and YouTube itself keeps history for a signed-in private session.
  - **Runner-up:** pause auto-add in private windows by default.
  - **Why it lost:** nobody asked for that option, and it would override the user's choice to run the extension there.

### YouTube Music

- **Same accounts, same setups.** A YouTube Music tab reports `DATASYNC_ID` just like a YouTube tab. Its playlists are the account's YouTube playlists ([ticket 21](21-youtube-music-internals.md)).
- **Different accounts on the two sites:** if youtube.com and music.youtube.com tabs are on different accounts, each uses its own account's setup.
- **The section's choices are shared:** its switch, inline buttons and quick-action shortcuts. Only a playlist it names, Save to playlist's one-click target, belongs to the account.
- **The installed app window** counts as an ordinary tab.

### 1.4.5 migration

- **Shared carry-over:** the watch percentage, the toasts setting (as feedback options) and the shortcut key (as the first shortcut's key). [Ticket 19](19-upgrade-and-rollout.md) decides the values.
- **The auto-add playlists and the shortcut's playlist become an unclaimed setup.** 1.4.5 wrote to whichever account authorised its OAuth client, which may not be the account signed in to YouTube ([ticket 06](06-upgrade-path.md)).
- **Claiming:**
  - **When:** only after the user accepts the upgrade note, so no request is sent before consent.
  - **Who:** the first signed-in account seen in a normal window whose own playlist list holds any of the setup's playlist IDs. Matching is by playlist ID, never by title.
  - **IDs that account doesn't own are dropped.** They never worked, since 1.4.5 only ever added to one account.
  - **If the account already has a setup,** the claimed choices are merged in without replacing anything the user chose: missing auto-add playlists are added, and the shortcut's playlist is used only if that shortcut has none.
  - **Notice, shown once in the popup:** "Your auto-add playlists and shortcut from 1.x are now set up for {Name}." If any were dropped, it adds: "{N} of them weren't on this account and were left out."
- **Unmatched:**
  - An unclaimed setup is never used.
  - On an account that doesn't own its playlists, the popup says: "Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them, or set up {Name} below." with **Switch account** and **Discard**.
  - It's kept until it's claimed or discarded. It stays on this device and never syncs.
- **Not signed in to YouTube after the upgrade:** the upgrade note adds "Sign in to YouTube and your 1.x playlists will be picked up."

### Scenarios

| Scenario | What happens |
|---|---|
| Two Google accounts in two tabs | Each tab uses its own setup. The popup follows the active tab, and its header can show the other account. |
| A brand channel | It's its own account with its own setup, separate from the Google account's own channel. |
| Switching mid-session | The reload picks up the new account's setup. Other open tabs keep theirs until they reload. |
| Signing out, then back in | Setups are kept and the signed-out behaviour applies. After signing back in, the same setup resumes. |
| Sign-out or switch in another tab | The `datasyncId` guard stops the stale tab and asks for a reload. |
| A container tab with a second account | It gets its own setup. The same account in two containers shares one setup. |
| Incognito or private window | Off unless the user allows it. When allowed, existing setups are used and nothing from the session is saved. |
| A 1.4.5 setup whose playlists belong to another account | It stays unclaimed until its owner appears. The popup explains and offers Switch account or Discard. |
| A new account's first visit | Nothing on the page and nothing stored. The first choice creates its setup. |
| YouTube and YouTube Music on different accounts | Each site uses its own account's setup. |
| The same account in two synced browsers | Both use the same setup; [ticket 16](16-storage-and-sync.md) decides how it syncs. |
| A deleted account | Its setup stays dormant until the user removes it. |

### Live checks for [ticket 25](25-live-checks.md)

- **Stability:** is `DATASYNC_ID` stable across sign-out and sign-in, and is it identical across browsers and on music.youtube.com for the same identity?
- **Site split:** can one browser be on different identities at youtube.com and music.youtube.com?
- **Claiming:** does `get_add_to_playlist` list collaborative playlists? That affects 1.x claiming.
- **Stale tabs:** after a sign-out or account switch elsewhere, does YouTube reload or warn by itself? Does a Watch Later add from the stale tab land in the new account?
- **Labels:** what does the account menu return for a brand account, and for an account without a channel?
- **Managers:** what `DATASYNC_ID` does a delegated manager get?
- **Switcher:** does `/channel_switcher` list brand accounts and return to YouTube afterwards?
