# Inventory: what 1.5.0 does today

This is the parity checklist for 2.0: what the extension does now, how it uses YouTube, and where it creates friction. It was compiled on 2026-10-19 from the code at `301ae51`. Refs are `file:line` at that commit, with paths under `src/` unless noted.

## Release facts

- **AMO:** the live version is 1.4.5, published 2024-06-21 (commit `e96dbf7`), with about 66 daily users.
  - It's the Data API build where users paste their own OAuth credentials.
  - Nothing since has shipped: not the token broker, Add to queue, the card menu, channel filters, or the React/WXT UI.
- **Chrome Web Store:** never listed. `CHROME_EXTENSION_ID` is blank in `.env.submit.example`. No tag has ever been pushed, so `release.yml` has never run on a tag.
- **Version:** `package.json` still says 1.5.0.
- **History:**
  - **≤1.2 (2024-05/06): fully local.** It clicked through YouTube's own Save dialog, matched playlists by visible name, used the dialog's checkboxes to skip duplicates, and supported Watch Later (`b79268d:src/content.js:81-157`).
  - **1.3 (`3296daa`, 2024-06-20):** switched to `playlistItems.insert`, one day after "increased reliability and different layout support" (`d30099e`).
  - **2026-03:** Plasmo, React and shadcn.
  - **2026-09-28:** WXT migration, the broker, Add to queue, IndexedDB duplicate cache and CI.
  - **2026-10-04:** card menu.
  - **2026-10-05:** channel filters.

## Capabilities

### Auto-add

**Trigger** (`entrypoints/youtube.content.tsx:103-160, 212-216`)
- It arms when the content script starts and again on every `yt-navigate-finish`. Each time it reads `?v=` and the document's first `<video>`; a MutationObserver waits if there's no `<video>` yet.
- It keeps exactly one `timeupdate` listener and fires once per arming. That happens when `currentTime / duration * 100 >= requiredWatchPercentage` (default 50); it then sends `addVideoToPlaylists {videoId}`.
- The threshold updates live through a storage watch.

**What counts as watched today:**
- It measures the **playhead position**, not time actually played; playback speed doesn't matter.
  - Seeking past the threshold fires.
  - A `&t=` start or YouTube's resume point past the threshold fires almost at once.
- Paused: no `timeupdate`, so nothing fires.
- Replaying or looping on the same page doesn't fire again.
- Navigating back to the same video re-arms it. Only the duplicate check stops a second add.
- Live streams, and premieres while waiting or live, never fire (no finite duration).
- Shorts never fire, because there's no `?v=`.
- Videos inside playlists or mixes use `v`, even when that list is itself an auto-add target.
- Ads aren't detected. YouTube plays them in the main `<video>`, so an ad's progress may trigger an add (unverified).
- It watches the first `<video>` in the document, not `#movie_player`'s, and never checks that the element is playing `videoId`.
- Leaving `/watch` (the miniplayer) disarms it. Background tabs still fire.
- A threshold of 0 fires on the first `timeupdate`. A threshold of 100 may never fire (unverified).
- Pages covered: the top frame on `*.youtube.com`, excluding music.youtube.com. Embeds elsewhere aren't covered.
- There is **no on/off switch** for auto-add.

**Pipeline** (`entrypoints/background.ts:70-199`):
1. Pre-checks:
   - No token: toast "No access token found".
   - No playlists: toast "No auto-add playlists selected".
2. If `preventDuplicates` is on, it runs the duplicate check. Each duplicate gets the toast "Video already in playlist."
3. Channel filters, only if a remaining target has its filter on.
4. `playlistItems.insert` for each remaining playlist, in sequence.
   - Success: writes an IndexedDB record and toasts `Added ${videoId} to playlist`.
   - Failure: toasts "Failed to add video to playlist".
   - A network failure isn't caught: the remaining playlists are skipped with only a `console.error`.

**Duplicate check** (`lib/video-cache.ts`)
- It looks up the key `[playlistId, videoId]` in IndexedDB `yt-playlist-tools` / `cachedVideos`.
- It's written only after this profile's own successful adds, and written even when the setting is off.
- It never asks YouTube. Adds made elsewhere are invisible, and a video removed on YouTube stays blocked forever.
- It fails open if the database won't open. Two concurrent adds can both pass.

### Channel filters (auto-add only)

The full behaviour is in `.scratch/channel-filters/spec.md`; the vocabulary is in `GLOSSARY.md`.

- **Rules** (`lib/channel-filters.ts:24-33`):
  - No filter, or a filter that's off: the video passes.
  - Allow mode: passes only if the channel is known and listed. An empty allowlist blocks everything, and an unknown channel is blocked.
  - Deny mode: blocks only a known, listed channel. An unknown channel passes.
  - Channels match by their `UC…` ID.
- **Channel resolution, once per video:**
  1. The `session:channelCache`.
  2. A page read: the player response through the bridge, accepted only if its videoId matches and the channel ID starts with `UC`. The handle comes from `ownerProfileUrl`. Timeouts are 1000 ms in the content script and 1500 ms in the background.
  3. `videos.list` (1 unit).
  4. Otherwise the channel is unknown.
- **Feedback:** a single toast covers every blocked playlist: `${title} filtered out of ${titles}`, or `Couldn't identify the channel, so it was skipped for ${titles}`. Each decision is also logged to the console.
- **Labels:** listed channels' titles and handles are refreshed after an auto-add lookup.
- **Editing:**
  - Off / Allow only / Deny. Off keeps the mode and the list.
  - Switching on into the other mode clears a non-empty list after a confirmation.
  - Changes come from the channel card (Allow/Deny per checked playlist) or the inline editor (tags, "add this video", a typed channel).
- **Typed channel** (`lib/channel-input.ts:59-80`):
  - Accepted: a `UC…` ID, `/channel/`, `@handle` or a bare handle, `youtube.com/@x` URLs, and `/user/`. Each is resolved with `channels.list` (1 unit).
  - `/c/` URLs are rejected with an explanation; anything else gets "That doesn't look like a channel…".
- **Lifecycle:** filters are kept when a playlist is unchecked, deleted, renamed or belongs to another account. Those are orphaned filters, never shown. Only Clear All Data removes them.
- The shortcut, Add to queue and the card menu are **never** filtered.

### Keyboard shortcut

- **How it's caught:** there's no manifest `commands` entry. It's a `keydown` listener inside YouTube pages (`entrypoints/youtube.content.tsx:81-97`, `lib/shortcut.ts`).
- **Default:** unset (`watchLaterShortcut` = "").
- **Recording:** happens in the popup.
  - It captures the next non-modifier keydown, stored as `Control+Alt+Shift+Meta+KEY`.
  - Bare keys, Escape and Tab are accepted. There's no cancel and no clear.
- **Matching:**
  - The modifier set must match exactly; the key is case-insensitive and auto-repeat is ignored.
  - It's skipped only when focus is in `input#search`, and it needs `?v=`.
  - It calls `preventDefault`, which swallows the key.
- **Target:** the single `addToPlaylistID`, picked in the popup (click again to clear). When no playlist list has loaded, a free-text "Playlist ID" field appears instead.
- **Flow:**
  1. No playlist: toast.
  2. No token: toast.
  3. Duplicate check.
  4. Add.
  5. Never channel-filtered.

### Add to queue (thumbnail button)

- **Setting:** `queueButtonEnabled`, on by default, toggles live.
- **Pages:** every `*.youtube.com` page except `/feed/subscriptions` and its subpaths. It's re-checked on each navigation.
- **Cards:**
  - Included: `ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-grid-video-renderer`, `ytd-compact-video-renderer`, `yt-lockup-view-model`.
  - A card needs `a[href*="/watch?v="]` and a thumbnail element.
  - Excluded: Shorts lockups, ad slots and rich sections.
  - Playlist-page items and the watch page's playlist panel get no button.
- **Button:**
  - 28×28 at the thumbnail's top-left, revealed on hover (JS hit-testing) or keyboard focus.
  - Shows a busy pulse, then green for 1.5 s on success, or red for 1.5 s on failure or after a 2 s timeout.
  - No toast, and no sign-in needed.
- **Bridge command** (`entrypoints/yt-queue-bridge.ts:33-152`):
  - It sends `resolveCommand` with `addToPlaylistCommand {videoIds, listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE"}`, wrapped in `signalServiceEndpoint`.
  - **No queue yet:** it also sends `openMiniplayer` and `onCreateListCommand.createPlaylistServiceEndpoint {params: "CAQ%3D"}`. Success is confirmed by polling `ytd-miniplayer.active` for up to 600 ms.
  - **Queue already open:** it appends and reports success unconfirmed.

### Right-click card menu

- **Setting:** `cardContextMenu`, off by default.
- **Behaviour:**
  - A capture-phase `contextmenu` listener inside a card clicks that card's ⋮ button, found through five fallback selectors.
  - Shift, or no ⋮ button, gives the browser's menu.
  - It also hijacks right-click on links inside cards, such as the channel name.

### Toasts

- **In-page:** a Sonner toaster in a shadow root, top-center, unstyled, shown only in the sender's tab. They're dropped when `toastEnabled` is false.
- **Texts:**
  - `Added ${videoId} to playlist`
  - "Failed to add video to playlist"
  - "Video already in playlist."
  - "No access token found"
  - "No auto-add playlists selected"
  - "No shortcut playlist selected"
  - The two channel-filter toasts.
- **Settings panel:** has its own success and error toasts (sign-in, sign-out, Clear All Data, auth errors), which `toastEnabled` doesn't govern.

### Themes

- **Setting:** `sync:theme`, one of light, dark or system (default system).
- **Control:** only in Settings.
- **Applies to:** the popup, the options page and the toasts.
- **System** follows the OS, not YouTube's own theme.
- **Brand colour:** YouTube red as the primary.

### Account and auth (retires in 2.0)

- **Sign in with Google:** goes through the broker in `server/`.
- **Own credentials:** a client ID and secret pasted under Advanced, exchanged directly with Google.
- **Request:** scope `youtube.force-ssl`, PKCE, `access_type=offline`.
- **Storage:** tokens and the client secret in plaintext `storage.local`.
- **Status:** "Signed in" means a refresh token exists.
- **Sign Out:** deletes the tokens but never revokes them.
- **Refresh:** only after a 401, through the broker and then the user's own credentials.
- **Broker:**
  - It has never been deployed for users.
  - The CI and release builds point it at `localhost:3847`.
  - Its `/auth/refresh` endpoint isn't checked against `ALLOWED_EXTENSION_IDS`.

### Playlist list

- **Request:** `playlists.list?part=snippet&mine=true&maxResults=50`, paginated. Only titles are kept.
- **Cache:** `local:cachedPlaylists`. The popup paints the cache, then refreshes on every open and on Refresh.
- **Contents:** only user-created playlists, in the API's order.
- **Watch Later:** unsupported, and the popup says so.

## UI surfaces

### Popup (340 px), top to bottom

1. **Header:** icon, "Playlist Tools", and a gear (Settings, which turns into Back).
2. **"AUTO-ADD PLAYLISTS"** with a Refresh button ("Refreshing…" / "Loading…").
3. **Channel card**, shown only when the active tab has `?v=`:
   - Heading: "THIS VIDEO'S CHANNEL".
   - Body: "Looking up channel…", "Channel unknown" or "Title · @handle".
   - Allow/Deny pills per checked playlist, with an inline "Clear and switch" confirmation.
4. **Errors:** "Not authorized. Sign in from Options.", the raw error text, or "No playlists found."
5. **Playlist list** (scrolls at 220 px): a checkbox and title per row.
   - Checked rows get a filter pill: "All channels", "Allow only · N", "Deny · N" or "… kept".
   - The pill opens an inline editor: the mode switch, a hint, tags, "Add {title} (this video)", an "@handle or channel URL" field with Add, and inline errors.
6. **"SHORTCUT PLAYLIST":**
   - A note that Watch Later isn't supported.
   - A single-select list (scrolls at 120 px), or the "Playlist ID" field.
   - "Record Shortcut" next to the current key.
7. **"REQUIRED WATCH PERCENTAGE":** a 0–100 slider plus a number field.
8. **Switches:** Toast notifications, Prevent duplicates, One-click queue button, Right-click opens video menu.

### Settings

The popup's gear view and the Options tab show the same panel:
1. **Account:**
   - Signed in: "Signed in", Sign Out and Clear All Data.
   - Signed out: "Sign in with Google".
2. **Advanced (signed out only):** token server, redirect URI, client ID and secret, and "Authorize with Own Credentials".
3. **Theme:** Light / Dark / System.

### Inside YouTube

- **Present:** the toaster, the thumbnail queue buttons and the right-click takeover.
- **Not present:** any auto-add indicator, a toolbar badge, browser context-menu items, and onboarding.

## Settings and stored data

| Area | Key | Shape | Default |
|---|---|---|---|
| local | `playlists` | auto-add playlist IDs | `[]` |
| local | `addToPlaylistID` | shortcut playlist ID | `""` |
| local | `watchLaterShortcut` | key combo, e.g. `Control+Shift+S` | `""` |
| local | `requiredWatchPercentage` | 0–100 | `50` |
| local | `toastEnabled`, `preventDuplicates`, `queueButtonEnabled` | boolean | `true` |
| local | `cardContextMenu` | boolean | `false` |
| local | `cachedPlaylists` | `{id, title}[]` | `[]` |
| local | `channelFilters` | `Record<playlistId, {mode: "allow" \| "deny", enabled, channels: string[]}>` | `{}` |
| local | `channelLabels` | `Record<channelId, {title, handle?}>` | `{}` |
| local | `accessToken`, `refreshToken`, `authMode`, `authServerURL`, `clientID`, `clientSecret` | string, all plaintext | `""` / `"server"` |
| sync | `theme` | `"light" \| "dark" \| "system"` | `"system"` |
| session | `channelCache` | `Record<videoId, {channelId, title, handle?}>`, never pruned | `{}` |
| IndexedDB | `yt-playlist-tools` v1, store `cachedVideos` | key `[playlistId, videoId]`, value `{playlistId, videoId, addedAt}` | empty |

**1.4.5:**
- **Stored keys:** it uses the same bare keys in `storage.local`: `playlists`, `addToPlaylistID`, `watchLaterShortcut`, `requiredWatchPercentage`, `toastEnabled`, `clientID`, `clientSecret`, `accessToken` and `refreshToken`. In 1.4.5, playlist IDs were typed in by hand. Empty ones are filtered out, but half-typed IDs and pasted URLs can occur. WXT's `local:` prefix maps onto the same keys.
- **1.4.5 defaults differ from 1.5.0's table above:**
  - an absent `toastEnabled` meant **off**;
  - an absent or empty `requiredWatchPercentage` meant **0 %** (stored as a string), although the popup showed 50;
  - Ctrl shortcuts never fired, because it checked `event.controlKey`.

  See [ticket 06](issues/06-upgrade-path.md).
- **Manifest:** permissions `activeTab, storage, identity, scripting`; no host permissions; a content script on `*://*.youtube.com/*` excluding music.youtube.com; `strict_min_version` 125.0.
- **Migrations:** no storage item has a version, and there are no migrations. An older `localStorage.cachedVideos` duplicate cache (`d73027e`) is never migrated or cleared.

## Messaging

| Message | Sender → receiver | Purpose |
|---|---|---|
| `fetchPlaylists` | popup → background | Load and cache playlists. `"No access token"` is a string contract. |
| `getChannelForTab` | popup → background | Channel card |
| `lookUpChannel` | popup → background | Typed channel |
| `addVideoToPlaylists` | content → background | Auto-add |
| `addVideoToShortcutPlaylist` | content → background | Shortcut |
| `showToast` | background → content | Toast in the sender's tab |
| `readPlayerChannel` | background → content | Free channel read |
| `currentVideoId` | popup → content | Show or hide the channel card |
| `ytpt:add-to-queue(:done)` | content ↔ bridge (DOM CustomEvents; `cloneInto` on Firefox) | Queue |
| `ytpt:read-player(:done)` | content ↔ bridge | Player read |

The content script watches storage for the shortcut, threshold, toasts, queue-button and card-menu settings. Every surface watches the theme. The popup watches nothing.

## How YouTube is used today

| Need | Today | Source | Cost |
|---|---|---|---|
| The user's playlists | `playlists.list mine=true`, paginated, titles only | Data API | 1 unit per 50 playlists, on every popup open |
| Add to a playlist | `playlistItems.insert` | Data API | 50 units each |
| Already in a playlist? | Local IndexedDB of this device's own adds | Local | 0, but inaccurate |
| Watch Later, liked videos, saved playlists | Not supported | n/a | n/a |
| Current video | `?v=` in the URL | URL | 0 |
| Watch progress | First `<video>`'s `timeupdate` | Page | 0 |
| A video's channel | Session cache, then the player response through the bridge, then `videos.list` | Page, else Data API | 0 or 1 unit |
| Typed channel | Parsed offline, then `channels.list` (`/c/` unsupported) | Data API | 1 unit |
| Add to queue | `resolveCommand` with `addToPlaylistCommand` | Page | 0 |
| ⋮ menu | Clicks YouTube's own button | Page | 0 |
| Which account is signed in | Never fetched or compared with the YouTube session | n/a | n/a |

- **Daily budget:** Google's default is 10,000 units per day per Cloud project, about 200 adds. Users share the broker's project quota; own-credentials users spend their own.
- **YouTube page internals touched:**
  - `resolveCommand` on Polymer elements (the thumbnail's element, else `ytd-app`);
  - `addToPlaylistCommand`;
  - `openMiniplayer` / `createPlaylistServiceEndpoint` with the opaque `params: "CAQ%3D"`;
  - `ytd-miniplayer.active`;
  - `#movie_player.getPlayerResponse()`.
- **Not touched:** `ytcfg`, `ytInitialData`, `ytInitialPlayerResponse` (it goes stale after in-app navigation), direct InnerTube (`youtubei/v1`) requests, and cookies.
- **Bridge injection:** an injected page script (`injectScript`, kept in the DOM), not `world: "MAIN"`, because Firefox only supports MAIN world from 128 and the floor is 125.

**Fragility:**

| Piece | Breaks if YouTube changes… | Falls back to | Fragility |
|---|---|---|---|
| Player channel read | `getPlayerResponse` or its field names | `videos.list` | Low–medium |
| Queue bridge | `resolveCommand`, the command format, `CAQ%3D`, `ytd-miniplayer.active` | A red button, or a false "ok" | High |
| Queue buttons | Card and thumbnail tag names (YouTube is moving to `yt-lockup-view-model`) | Buttons silently missing | Medium–high |
| Card menu | The ⋮ button selectors | The browser's menu | Medium–high, low impact |
| Auto-add and shortcut triggers | `?v=`, `<video>`, `yt-navigate-finish` | Never arm | Low–medium |

## Manifest (1.5.0)

- **Format:** MV3 on both browsers. Chrome uses a service worker; Firefox uses `background.scripts`.
- **Permissions:** `activeTab`, `storage`, `identity` and `scripting`. `scripting` is never called, and nothing needs `activeTab`.
- **Host permissions:** googleapis, oauth2.googleapis and accounts.google.com. None for youtube.com; the content-script match covers it.
- **Web-accessible resources:** `yt-queue-bridge.js` for `*://*.youtube.com/*`.
- **Keyboard commands:** none.
- **Content script:** `*://*.youtube.com/*`, excluding music.youtube.com, `document_idle`, top frame only.
- **Firefox:**
  - `strict_min_version` 125.0;
  - gecko ID `{cc70cd21-2cc6-444b-bd89-496909346091}`, which must be kept;
  - `data_collection_permissions: none`.

## Build, CI and release

- **`ci.yml`:**
  - `tsc` and Vitest (Chrome, Firefox and server projects);
  - both builds;
  - `jq` manifest checks: MV3, background type, gecko ID, host permissions;
  - a smoke test of the broker image.
- **`release.yml`**, on a `v*` tag or manual run:
  - zips both targets and the AMO sources zip, and checks that the sources zip rebuilds;
  - submits to both stores, only when `PUBLISH_TO_STORES == 'true'`, with one switch for both stores.

## Friction (defects 2.0 fixes)

**Feedback**
- Users who haven't set up auto-add get "No access token found" or "No auto-add playlists selected" on every video. There's no auto-add switch.
- Success toasts show the raw video ID and never name the playlist. Duplicate and failure toasts name nothing. All toasts look alike.
- Queue-button feedback is colour only.
- In-page toasts follow the OS theme, not YouTube's.

**Shortcut**
- It's unset by default.
- It fires while typing in comments and other fields, and swallows the key.
- It can't be cleared or cancelled, and Escape and Tab can be recorded.

**Settings and state**
- Emptying the percentage field stores 0 immediately, so open tabs auto-add on the next `timeupdate`.
- A playlist that's deleted (or belongs to another account) stays selected but invisible, can't be unchecked, and adds to it fail.
- The "Playlist ID" free-text field appears whenever the list is empty, and saves unvalidated input on every keystroke.
- The popup reads storage once.
  - After signing in or out or clearing data from its gear, nothing refreshes.
  - Its stale state is written back on the next toggle.

**Layout**
- The popup holds every feature setting, while ⚙ Settings holds only the account and theme. The Options page has no feature settings.
- The playlist lists have no search or sort, and sit in fixed-height scroll boxes.
- The channel card says "Check an auto-add playlist below…" whenever the list isn't loaded, even if playlists are selected.
- The channel card's pill says "Allow" while the editor says "Allow only".
- The error "Not authorized. Sign in from Options." points elsewhere, and there's no link.

**Clear All Data**
- It's only reachable while signed in, and has no confirmation.
- It also wipes `storage.sync`, so the theme is cleared on other synced browsers.

**Account panel**
- It shows no account identity, and a revoked token still shows "Signed in".
- It flashes the signed-out UI before the check resolves.

**Duplicates and queue**
- The duplicate check never asks YouTube (see Auto-add).
- The card menu hijacks right-click on links inside cards.
- The queue button reports success unconfirmed when a queue is already open.

**Unverified risks**
- Ads, or an inline preview `<video>`, may drive the auto-add trigger.
- A 100% threshold may never fire.
- Sign-in runs in the popup, so it can be lost if the popup closes.

**Dead or unreachable code**
- `countCached`, the `byPlaylist` index and `addedAt` are never read.
- The `scripting` permission is unused.
- The popup's lazy "Loading settings…" fallback can't be reached, although the README says SettingsPanel is lazy-loaded.

**Untested:** the content script and the MAIN-world bridge have no tests: the watch trigger, shortcut wiring, toast receiver and queue bridge.
