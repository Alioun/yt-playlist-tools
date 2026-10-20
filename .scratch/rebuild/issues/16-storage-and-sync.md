# Which settings sync, and how is everything stored?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 08, 11, 12, 23

## Question

Approved: settings sync across the user's browsers. Decide:
- **What syncs:** which settings sync and which stay per device.
- **Keys:** how per-account setups are keyed.
- **Storage areas:** which ones, and their limits, especially `storage.sync`'s quotas against channel filter lists.
- **Conflicts:** how they're handled.
- **Migrations:** schema versioning and migrations, including from 1.4.5.
- **Caches:** for playlists, channels and membership, and when they expire.
- **Clearing:** what "clear all data" clears.

Also from [ticket 03](03-store-policy.md): whether `storage.sync` fits AMO's `none` declaration is open ([ticket 23](23-ask-amo.md)). Nothing may be persisted from private windows.

Also from [ticket 04](04-bun-test.md): WXT's fake browser doesn't model `storage.sync`'s quota, so quota behaviour needs its own test double.

Also include:
- the YouTube Music section's settings;
- each feature's on/off state and its own settings;
- whether YouTube Music settings belong to the account or the device ([ticket 11](11-accounts.md)).

Also from [ticket 01](01-youtube-requests.md): `DATASYNC_ID` keys per-account data. The playlist picker needs a cache of playlists with thumbnails and counts.

Also from [ticket 11](11-accounts.md) and [ADR-0003](../../../docs/adr/0003-account-setups-keyed-by-datasync-id.md):
- **Groups:** two storage groups, account setups keyed by `DATASYNC_ID` and shared settings. Account labels are stored with their setup.
- **Local only:** the unclaimed setup and the last current account.
- **Private windows:** writes are refused in one place.
- **Removal:** removing one setup is separate from "clear all data".

Also from [ticket 10](10-youtube-access.md): caches are per account and stamped with when they were fetched. Script registration is derived from the feature switches, never stored.

Also from [ticket 12](12-adding.md):
- **Store:** Show feedback per feature, shared; the last visibility picked, per device; newly created playlists for up to 24 h; Missing/Full marks in the account setup.
- **Drop:** the `preventDuplicates` key and the IndexedDB `yt-playlist-tools` store. Clear the old `localStorage` keys from an extension page.
- **Nothing about individual adds is stored.**

Also from [ticket 07](07-watched.md):
- **Remembered watch progress:** per account, local, at most 30 days, dropped once auto-add has run, never synced, never written from private windows. It's deleted when auto-add is switched off, when the setup is removed, and by Clear All Data.
- **Pause and session skips:** in memory only.
- **Placement:** the default percentage is shared; Takes and the override travel with each playlist in the account setup.

Also from [ticket 08](08-shortcuts.md):
- **Shared:** shortcuts as `{id, key: {char?, code, ctrl, alt, shift, meta}, label, watchLaterOnEveryAccount}`, the picker key, the undo key, Also on YouTube Music, and Show feedback.
- **Per account:** a map from shortcut ID to playlist ID.

Also from [ticket 18](18-breakage.md): breakage signals and the "notice already shown" memory live in `storage.session`, are never written from private tabs, and never sync. The Detailed console log setting is per browser.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up and why it lost. This answer folds in every "Also from" note above, plus the Answers of tickets [06](06-upgrade-path.md), [07](07-watched.md), [08](08-shortcuts.md), [10](10-youtube-access.md), [11](11-accounts.md), [12](12-adding.md), [18](18-breakage.md) and [26](26-youtube-music-quick-actions.md). The browser facts were read from primary sources on 2026-10-19 (see [section 14](#14-facts-this-rests-on)). The AMO-dependent part is **PROVISIONAL** until [ticket 23](23-ask-amo.md) has AMO's answer, and is built so that either answer works ([section 11](#11-provisional-settings-sync-and-amos-data-collection-rules)).

**In short:**
- **Three places.**
  - Settings and choices live in `storage.local`, which is always the truth for that browser.
  - Memory for the current browser session lives in `storage.session`.
  - `storage.sync` holds only the **synced copy**, and only while **settings sync** is on.
- **What syncs:**
  - **Yes:** shared settings (feature switches included) and account setups (with their channel filters, channel labels and the account's label).
  - **Never:** consent, the sync switch, the 1.x unclaimed setup, caches, watch progress, session memory, the last account, the last visibility and diagnostics settings.
- **Settings sync is a feature, off until switched on in each browser.**
  - It copies three kinds of document between `storage.local` and `storage.sync`: the shared settings, one per account setup, and one per channel filter.
  - The newest edit of a document wins, and deletions travel as tombstones.
  - When two separately synced histories meet, the user picks a side.
  - Switching it off deletes nothing.
- **Budget:** the synced copy stays under 96 KiB and 480 items. That's about 1,060 listed channels beside 20 shortcuts and 5 account setups. While sync is on, a change that doesn't fit is refused; it's never silently left unsynced.
- **Accounts** are keyed by a 16-character digest of `DATASYNC_ID`. The raw ID is never stored.
- **Caches** are per account, per browser and stamped:
  - the playlist list, with thumbnails, counts and each site's Save-dialog order;
  - playlists created in the last 24 h.

  An account without a setup gets none, and there's no membership cache or channel cache.
- **One write path.** Only the background writes storage. It refuses every write that would store something from a private window's session.
- **Clear All Data** resets this browser. It deletes the synced copy, which resets every syncing browser, only if the user ticks that.
- **Migrations** run from stored state on every background start, and write a `schema` marker last. Every synced document carries its own version, so browsers on different 2.x versions can share one synced copy.

### 1. Where everything lives

| Group | Examples | Area | Syncs while settings sync is on |
|---|---|---|---|
| **Shared settings** | Feature switches and options, Show feedback, the shortcuts' keys and labels, the default required percentage, the theme | `storage.local` | Yes |
| **Account setups** | Auto-add playlists (Takes, percentage override), channel filters with their channel labels, shortcut targets, both quick-save playlists, Missing/Full marks, the account label | `storage.local` | Yes |
| **This browser** | Consent, the sync switch, the upgrade note, the unclaimed 1.x setup, the last account, the last visibility, Detailed console log | `storage.local` | Never |
| **Caches** (per account) | Playlist list, thumbnails, counts, Save-dialog order, newly created playlists, the label check stamp | `storage.local` | Never |
| **Watch progress** (per account) | The played stretches of each video, for up to 30 days | `storage.local` | Never |
| **Session memory** | Pause, session skips, recent adds, 429 pauses, shown-once memory, breakage signals and notices, the tab registry | `storage.session` | Never |
| **Memory only** | Undo entries, locks, the picker's membership, anything from a private tab | The tab, or the background's own variables | Never |
| **Not stored** | Script registrations (derived from the switches, consent and site access), membership, a video's channel | — | — |
| **The browser's own** | Site access (YouTube Music is optional on Chrome), Firefox data-collection grants | Browser permissions | Never |

- **No IndexedDB, no `localStorage`, no cookies.** 1.5.0's IndexedDB store and the old `localStorage` keys are deleted ([section 10](#10-schema-versioning-and-migrations)).
- **YouTube Music's settings are shared settings** ([ticket 11](11-accounts.md)): its switches, buttons, keys and Show feedback. Only Save to playlist's quick-save playlist belongs to the account setup.
  - With sync on, they follow the user to every browser.
  - Chrome's YouTube Music access doesn't follow, because it's a browser permission. A synced "on" therefore shows ticket 10's "needs access" state until access is granted in that browser.
- **Feature switches sync.** A browser with sync on gets the same features switched on.
  - Why: sync means "set up once, the same everywhere", and the switches are most of what a user sets.
  - Each browser still needs its own first-run consent before anything runs there, and site access stays per browser.
  - A user who wants different features in one browser switches sync off there. That browser keeps its own copy ([section 5.5](#55-switching-off)).
  - *Runner-up:* switches stay per browser and only their options sync. It lost because a new browser would arrive set up but switched off, and "your settings are the same everywhere" would need an exception.
  - *Second runner-up:* an "Also sync which features are on" option. It lost as bloat, since switching sync off in that browser covers the case.

### 2. Storage layout

#### 2.1 `storage.local`

| Key | Holds | Shape ([2.4](#24-shapes)) | Lifetime |
|---|---|---|---|
| `schema` | This browser's storage layout version | number (2.0 writes `1`) | Always; written last by each migration |
| `device` | This browser's own state | `Device` | Until Clear All Data |
| `doc:settings` | The shared settings | `Stamped<Settings>` | Until Clear All Data |
| `doc:setup:<acct>` | One account setup | `Stamped<Setup>` | Until the setup is empty or removed |
| `doc:filter:<acct>:<playlistId>` | One channel filter of that account, kept filters included | `Stamped<Filter>` | Until removed with its setup, or by Clear All Data |
| `unclaimed` | The 1.x setup waiting for its account | `Unclaimed` | Until claimed or discarded |
| `cache:<acct>` | The account's playlist cache | `AccountCache` | While the account has a setup |
| `progress:<acct>` | The account's remembered watch progress | `Progress` | Per video: until auto-add has run, the length changes, or 30 days pass |
| `sync` | The replicator's bookkeeping | `SyncState` | Once sync has been on |

- `<acct>` is the account key ([section 3](#3-account-keys)).
- An absent `doc:settings` reads as the defaults, which means every feature off (map Notes). An absent setup reads as "no choices".
- Every key carries a prefix, so none reuses a 1.x name for a new shape ([ticket 06](06-upgrade-path.md)).

#### 2.2 `storage.sync`, only while settings sync is on

| Key | Holds |
|---|---|
| `s:meta` | `{v, id, created, reset?}`: which synced history this is ([5.3](#53-switching-on-the-join)) |
| `s:settings` | The shared-settings document |
| `s:setup:<acct>` | One account setup document |
| `s:filter:<acct>:<playlistId>` | One channel filter document |
| `s:<document>@<gen>.<i>` | Chunk `i` of a document too large for one item ([5.4](#54-conflicts-while-syncing)) |

- **A document of up to 7,600 bytes** is one item: `{v, gen, at, by, data}`.
- **A larger one** is a pointer `{v, gen, at, by, n}` plus `n` chunks named after its `gen`.
- **A removed document** is a tombstone `{v, gen, at, by, deleted: true}` for 30 days.

#### 2.3 `storage.session`

It's memory only, and it's cleared when the browser closes or the extension updates, reloads or is disabled. So Pause also ends when the extension updates.

| Key | Holds | From |
|---|---|---|
| `paused` | Auto-add Pause | [07](07-watched.md) |
| `skips:<acct>` | Session skips: video ID → `"all"` or a list of playlist IDs | [07](07-watched.md), [12](12-adding.md) |
| `recent` | Adds in the last 60 s, each `{acct, playlist, video, at}` | [12](12-adding.md) |
| `cooldown:<acct>` | When a 429 pause ends | [12](12-adding.md) |
| `shown` | Which rate-limited toasts were shown this session | [12](12-adding.md) |
| `breakage` | Breakage signals, feature statuses, the notice-shown memory, the can't-measure run and the last Check now result | [18](18-breakage.md) |
| `tabs` | The tab registry: tab ID → `{site, acct, signedIn}` | [10](10-youtube-access.md), [11](11-accounts.md) |

- Nothing in session storage comes from a private tab ([section 8](#8-the-private-window-write-guard)).
- Content scripts can't read session storage on either browser, and don't need to.

#### 2.4 Shapes

```ts
// v: document version. gen: random ID of this write. at: when the user's edit happened (ms).
// by: this browser's random device ID.
type Stamp = { v: number; gen: string; at: number; by: string }
type Stamped<T> = Stamp & { data: T }

type Key = { char?: string; code: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean } // ticket 08

type Settings = {
  theme: "system" | "light" | "dark"
  undoKey: Key | null                      // shared by both shortcut features
  autoAdd: { on: boolean; feedback: boolean; pct: number } // pct: default required percentage, 0–100
  shortcuts: {
    on: boolean; feedback: boolean; music: boolean /* Also on YouTube Music */; preset: boolean
    picker: Key | null
    list: { id: string; key: Key | null; label: string; watchLaterOnEveryAccount: boolean }[] // ≤ 20
  }
  quickSave: { on: boolean; feedback: boolean }
  queueButton: { on: boolean; feedback: boolean }
  cardMenu: { on: boolean }
  musicActions: {
    on: boolean; feedback: boolean; preset: boolean
    buttons: { next: boolean; queue: boolean; save: boolean; like: boolean; remove: boolean; bar: boolean }
  }
  musicKeys: {
    on: boolean; feedback: boolean; preset: boolean
    keys: Record<"next" | "queue" | "save" | "picker" | "like" | "remove", Key | null>
  }
  // Ticket 09's watch-page features each add an entry of the same form: { on, feedback?, …options }.
}

type Setup = {
  label: { name: string; handle?: string; avatar?: string } | null // ticket 11
  autoAdd: { pl: string; takes: "videos" | "shorts" | "both"; pct?: number }[] // in the order ticked
  targets: Record<string /* shortcut ID */, string /* playlist ID */> // ticket 08
  quickSave: string | null // YouTube's thumbnail quick-save playlist
  musicSave: string | null // YouTube Music's Save to playlist
  marks: Record<string /* playlist ID */, "missing" | "full"> // ticket 12
}

type Filter = { mode: "allow" | "deny"; on: boolean; channels: [id: string, title: string, handle?: string][] }

type Device = {
  id: string // random; appears only in stamps
  consent: { v: number; at: number } | null // the first-run disclosure accepted, and which version of it
  syncOn: boolean
  upgradeNote: { state: "pending" | "done"; details: unknown } | null // content: ticket 19
  claimNotice: { acct: string; dropped: number } | null // ticket 11, shown once
  lastAccount: string | null // the last current account that has a setup, normal windows only
  newPlaylistVisibility: "PRIVATE" | "UNLISTED" | "PUBLIC" | null // ticket 12, the last pick here
  detailedLog: boolean // ticket 18
  legacyCleared: boolean // 1.x localStorage keys removed (section 10)
}

type Unclaimed = {
  from: "1.4.5" | "1.5.0"; autoAdd: string[]; shortcutPlaylist: string | null
  filters: Record<string, Filter>; at: number
}

type AccountCache = {
  listAt: number | null // when the playlist list was last read
  playlists: { id: string; title: string; privacy?: "PRIVATE" | "UNLISTED" | "PUBLIC"; count?: number; thumb?: string }[]
  order: { www?: string[]; music?: string[] } // each site's Save-dialog order, from its last membership read
  created: { id: string; title: string; privacy: "PRIVATE" | "UNLISTED" | "PUBLIC"; at: number }[] // ≤ 24 h
  labelAt: number | null // when this browser last checked the account's label
}

// len and parts in seconds at 0.1 s precision; parts merged; at: when it last played
type Progress = Record<string /* video ID */, { len: number; parts: [number, number][]; at: number }>

type SyncState = {
  joined: string | null // the s:meta id this browser synced with last
  pushed: Record<string /* document */, string /* gen */>
  status: "off" | "joining" | "ok" | "full" | "update-needed" | "waiting"
  editedSinceOff: boolean
}
```

- **Limits stored with the data:**
  - a shortcut label is up to 40 characters ([ticket 08](08-shortcuts.md)), and there are at most 20 playlist shortcuts;
  - a channel title is up to 100 characters, and a handle up to 30;
  - an account name is up to 100 characters;
  - longer values are cut when saved;
  - shortcut IDs are random and 6 characters long.
- **Unknown fields are kept.** A browser that reads a document with fields it doesn't know writes them back unchanged. So a newer 2.x's additions survive an older 2.x's edit ([5.7](#57-different-2x-versions)).
- **Dangling references are ignored.** These are skipped when read and dropped at that document's next write:
  - a target for a shortcut ID that no longer exists;
  - a mark for a playlist that's no longer chosen.
- **A setup is deleted when it holds nothing:** no auto-add playlists, targets, quick-save playlists or kept filters.
  - This is ticket 11's "when a setup's last choice is removed".
  - Kept filters count as choices, so re-ticking a playlist brings its filter back unchanged (channel-filters spec).

#### 2.5 Sizes against the quotas

Sizes are counted as the browsers count them: the UTF-8 bytes of the key plus the JSON value, plus 4 bytes per item for Firefox's whole-object check.

| Document | Bytes | Items |
|---|---|---|
| `s:meta` | 61 | 1 |
| Shared settings, presets only | 1,371 | 1 |
| Shared settings, 20 shortcuts with 12-character labels | 4,386 | 1 |
| Shared settings, 20 shortcuts with 40-character labels, half emoji | 6,126 | 1 |
| Account setup: 3 auto-add playlists, 3 shortcut targets, label | 772 | 1 |
| Account setup: 10 auto-add playlists, 20 targets | 2,025 | 1 |
| Account setup: 50 auto-add playlists, 20 targets | 4,582 | 1 |
| Channel filter, 20 channels | 1,607 | 1 |
| Channel filter, 100 channels | 7,367 | 1 |
| Channel filter, 500 channels | 39,623 | 7 |
| Channel filter, 500 channels with 50-character titles and 30-character handles | 61,348 | 10 |
| Channel filter, 1,000 channels | 79,000 | 12 |
| Tombstone | 136 | 1 |

- **Each listed channel costs about 79 bytes,** label included: the 24-character ID, title, handle, punctuation and chunk escaping.
- **Scenario A fits:** 68.6 KiB in 24 items. It has:
  - 20 shortcuts;
  - 5 accounts, each with 10 auto-add playlists and 20 targets;
  - one 500-channel filter and ten 20-channel filters.
- **Scenario B is refused at its last few channels while sync is on:** 96.6 KiB. It has 20 shortcuts, 3 accounts and twelve 100-channel filters.
- **Capacity:** about **1,060 listed channels** fit beside 20 shortcuts and 5 setups. The item count is never the limit; scenario A uses 24 of 480.
- **`storage.local`:**
  - Chrome allows 10 MB, since `unlimitedStorage` isn't requested.
  - Firefox has no quota beyond IndexedDB's.
  - The largest local item is watch progress, which is capped per account ([section 7](#7-watch-progress)).

### 3. Account keys

- **`<acct>` is the first 16 characters of the base64url SHA-256 of the whole `DATASYNC_ID`.** The background computes it, and storage never holds the raw ID.
  - It's still keyed by `DATASYNC_ID`, never parsed ([ADR-0003](../../../docs/adr/0003-account-setups-keyed-by-datasync-id.md)).
  - The same account gets the same key in every browser, so its setups meet in the synced copy.
  - At 96 bits, collisions don't happen in practice.
  - *Runner-up:* the raw `DATASYNC_ID`, as ADR-0003's wording suggests. It lost because nothing needs the raw ID back:
    - matching a tab compares keys;
    - the account header shows the label;
    - storing it would put the Google account's internal ID in the browser's sync account and every storage dump;
    - it's up to 45 characters in every key.
- **PROVISIONAL with [ticket 25](25-live-checks.md)'s L7:** sync assumes the same account has the same `DATASYNC_ID` in every browser.
  - If it doesn't, each browser makes its own setup for that account, and the setups appear side by side with the same label.
  - Re-attaching them is a new question (see the reply).
- **Nothing is stored about an account without a setup** (ADR-0003): no cache and no label, and it never becomes the last account. Its playlist list is fetched each time it's shown.
- **Change to [ticket 11](11-accounts.md):** its table puts "caches of the account's playlists and membership" in the account setup.
  - Caches stay per account, but each browser keeps its own, outside the setup, and they never sync.
  - Membership isn't cached at all ([section 6](#6-caches)).

### 4. What syncs, setting by setting

| Setting or data (ticket) | Scope | Syncs |
|---|---|---|
| Each feature's switch (map Notes) | Shared | Yes |
| Each feature's Show feedback (12) | Shared | Yes |
| The default required percentage (07) | Shared | Yes |
| Playlist shortcuts: key, label, Watch later on every account (08) | Shared | Yes |
| The picker key, the undo key, Also on YouTube Music (08) | Shared | Yes |
| Quick actions' buttons, quick-action keys (26) | Shared | Yes |
| Whether each feature's presets were applied (08, 26) | Shared | Yes |
| Theme | Shared | Yes |
| Auto-add playlists, their Takes and percentage override (07, 11) | Account | Yes |
| Channel filters: mode, on/off, listed channels and their channel labels; kept filters included (11) | Account | Yes |
| Shortcut targets (08) | Account | Yes |
| Quick-save playlists for YouTube and YouTube Music (12, 26) | Account | Yes |
| Missing and Full marks (12) | Account | Yes |
| The account label: name, @handle, avatar URL (11) | Account | Yes |
| Settings sync on/off | This browser | Never |
| First-run consent, the upgrade note, the claim notice (06, 11) | This browser | Never |
| The unclaimed 1.x setup (11) | This browser | Never |
| The last current account (11) | This browser | Never |
| The last visibility picked for new playlists (12) | This browser | Never |
| Detailed console log (18) | This browser | Never |
| The playlist cache and newly created playlists (01, 12) | This browser, per account | Never |
| Watch progress (07) | This browser, per account | Never |
| Pause, session skips, recent adds, 429 pauses, shown-once memory (07, 12) | Browser session | Never |
| Breakage signals, notice memory, feature statuses (18) | Browser session | Never |

- **Labels sync; playlist titles don't.**
  - **Channel labels** sync inside their filter. Refetching them would cost one request per channel, which [ticket 03](03-store-policy.md) calls crawling.
  - **The account label** syncs inside its setup. Without it, a browser that never sees that account couldn't name its setup in the account list or in Remove's confirmation.
  - **Titles of chosen playlists** come from each browser's playlist cache, and one request per account refills it. Until then a browser shows "3 auto-add playlists" with "Open YouTube as {Name} to see them" (ticket 11's copy).
  - *Runner-up:* snapshot the chosen playlists' titles into the setup. It lost because it duplicates the cache, makes every rename a sync write, and only helps an account never opened in that browser.
- **Labels are written only when they change.**
  - The account label is checked when the account is seen in a normal window, at most once per 24 h per browser (`labelAt`).
  - Channel labels are compared after each read of that channel.
  - Neither writes if nothing changed, so labels never cause sync churn.

### 5. Settings sync

#### 5.1 The feature

- **One switch,** off until the user turns it on, in each browser separately. First run offers it ([ticket 09](09-where-things-live.md) places it). The switch itself never syncs.
- **It uses the browser's own sync:**
  - **Chrome** syncs extension settings when the user is signed in to Chrome with Extensions sync on. That includes being signed in without full sync.
  - **Firefox** syncs them when the user is signed in to a Mozilla account with **Add-ons** ticked, every 10 minutes or on Sync Now.
- **Whether the browser actually syncs can't be detected.** So the switch's help text says so: "Uses {Chrome's | Firefox's} own sync. Your settings reach your other browsers only if you're signed in to the browser and it syncs extensions{| (Add-ons in Firefox Sync)}." With the browser's sync off, the synced copy simply stays in this browser.
- **Firefox only, PROVISIONAL:** switching on may first ask for Firefox's data-collection permission ([section 11](#11-provisional-settings-sync-and-amos-data-collection-rules)).

#### 5.2 The local copy comes first

- **`storage.local` is always the truth.**
  - The popup and settings read it directly for a fast first paint, and follow its changes. The popup's first view, the switch list, needs only `device`, `sync` and `doc:settings`, read in one `storage.local.get` ([ticket 24](24-performance-budget.md)).
  - While settings sync is off, nothing reads or writes `storage.sync` (ticket 24). There are two exceptions, both explicit: the one-time 1.x migration ([10.2](#102-from-145-and-150)), and Clear All Data's "delete synced settings" ([9.1](#91-clear-all-data)).
  - Content scripts get their tab view from the background ([section 8](#8-the-private-window-write-guard)).
  - Nothing reads settings from `storage.sync` directly.
- **The replicator** in the background copies documents both ways while sync is on.
  - **Out:**
    - A changed document is pushed 2 s after the last change.
    - Every pending document goes in one `set` call, plus one `remove` for this browser's own stale chunks.
    - Pushes happen at most once every 5 s. That's at most 24 write calls a minute and 1,440 an hour, under Chrome's 120 and 1,800. Firefox enforces no write rate.
  - **In:**
    - It runs on `storage.onChanged` for the `sync` area, and on every background start.
    - It reads the changed documents and assembles chunked ones.
    - It writes those it accepts ([5.4](#54-conflicts-while-syncing)) into `storage.local`.
    - Pages and the script reconciler then see an ordinary local change.
  - **Restarts:** what's pending is recomputed by comparing each local document's `gen` with the one last pushed (`sync.pushed`). A stopped service worker loses nothing.
  - **Errors:**
    - After a rate-limit error, it retries 60 s later.
    - Quota errors can't happen while the budget holds ([5.6](#56-budget)).
    - Errors are told apart by kind, not by their text, because Chrome 137 changed the message.
- **Why the local copy is the truth:**
  - Both browsers delete the synced copy on the server when the extension is uninstalled in any one browser.
  - Chrome's first sync after sign-in replaces local `storage.sync` data with the server's and deletes local-only keys.
  - With the local copy as the truth, a browser that still has the extension simply pushes its documents back.
- *Runner-up:* `storage.sync` as the store while sync is on, copied to `storage.local` when it's switched off. It lost for two reasons:
  - a single uninstall, or Chrome's sign-in merge, would wipe every browser's settings;
  - every reader would have to handle quotas, chunks and half-arrived documents.

#### 5.3 Switching on: the join

When this browser starts syncing, its documents and the synced copy are brought together:
1. **No synced copy yet** (`s:meta` absent): wait up to 10 s, because a new browser may still be downloading one. If none arrives, start one: write `s:meta` with a new random `id`, then push every local document.
2. **A synced copy exists, and this browser has nothing of its own:** adopt the synced copy silently. "Nothing of its own" means either of these:
   - no document was ever edited here;
   - nothing was edited here since this browser last synced with the same `s:meta.id` (`editedSinceOff`).
3. **Both sides have settings:** ask once.
   - **Use synced settings** (the default):
     - the synced shared settings replace this browser's;
     - for an account both sides have, the synced setup and its filters win;
     - setups only this browser has are added to the synced copy.
   - **Use this browser's settings** does the reverse:
     - this browser's shared settings and overlapping setups replace the synced ones;
     - setups only the synced copy has are added here.
   - **Cancel** leaves sync off.
   - Either way, nothing is lost for an account only one side has.
   - *Runner-up:* merge automatically, newest edit per document. It lost because an older, carefully built setup would silently lose to a quick edit elsewhere.
   - *Second runner-up:* merge inside setups, taking the union of auto-add playlists. It lost because shared settings such as keys and switches can't be merged that way, and two rules are harder to explain than one choice.
4. **First run:** if the user turns sync on there and a synced copy arrives within the 10 s:
   - the first-run screen shows its features ticked instead of the defaults;
   - the user reviews them before accepting;
   - consent is still this browser's own.
5. **Two histories meet later.** This is when `s:meta.id` changes under a browser that's already syncing. Two examples: Chrome's sign-in merge, or two browsers that each started a synced copy.
   - The browser whose `joined` ID is no longer current asks step 3's question. The other carries on.
   - Until the question is answered, the asking browser pushes nothing.

#### 5.4 Conflicts while syncing

- **The unit is the document:** the shared settings, one account setup, or one channel filter. Two browsers editing different documents never conflict.
- **The newest edit wins,** by the stamp's `at`, with `by` breaking ties.
  - If an incoming document is older than this browser's unpushed edit of it, this browser pushes its own again. Every browser ends up with the newest.
  - It's rare: it takes edits to the same document in two browsers within one sync interval, which is seconds on Chrome and up to 10 minutes on Firefox. The losing edit shows as reverted.
  - *Runner-up:* field-level merge, a CRDT per document. It lost for three reasons:
    - the case is rare;
    - tombstones for every field would eat the 100 KB quota;
    - a filter's mode and its list must change together anyway.
- **Deletions are tombstones** with their own stamp, kept for 30 days, so an older edit can't bring back a removed setup or filter.
  - While sync is on, the local copy keeps the tombstone too, and readers treat it as absent.
  - Any browser may purge tombstones older than 30 days.
- **A document that vanishes without a tombstone isn't a deletion.**
  - It comes from an uninstall elsewhere, a reset of the browser's own sync, or a browser-side merge.
  - This browser pushes its copy again.
- **A deliberate wipe is marked.** It comes only from Clear All Data with "delete synced settings" ticked ([9.1](#91-clear-all-data)). That replaces `s:meta` with `{reset: true, …}`, which every syncing browser treats as a reset, never as a vanished copy.
- **Chunks never mix.**
  - Chunk keys carry their document's `gen`.
  - A document is assembled only once all `n` chunks of the pointer's `gen` have arrived. Until then, the last good local copy stays.
  - Chrome syncs every key separately, so without this a big filter could arrive half old and half new.
  - Each browser removes only its own superseded chunks.

#### 5.5 Switching off

- This browser stops reading and writing `storage.sync`. **Nothing is deleted:**
  - it keeps every setting as it was;
  - the synced copy stays for the other browsers.
- Switching on again later is a join ([5.3](#53-switching-on-the-join)). With no edits here in the meantime, it adopts the synced copy silently.
- Deleting the synced copy is Clear All Data's job ([9.1](#91-clear-all-data)), never a side effect of switching off.

#### 5.6 Budget

- **The synced copy stays under 96 KiB and 480 items,** counted as in [2.5](#25-sizes-against-the-quotas). That's the browsers' 100 KiB and 512 items, less headroom.
- **While sync is on, a change by the user that would go over is refused, and nothing is saved.**
  - **Message:** "Synced settings are full. {Largest}: remove some, or turn off sync in this browser to keep more here."
  - {Largest} names what takes the most room, e.g. "Music's channel filter uses 39 KB".
  - If kept filters take room, it offers **Remove kept filters**, described as "Filters of playlists you no longer auto-add to".
  - [Ticket 15](15-popup-and-settings.md) draws it.
  - *Runner-up:* keep the change locally and sync only what fits. It lost because browsers would differ silently, which breaks what sync promises.
  - *Second runner-up:* a fixed cap per filter. It lost because no per-filter number guarantees the total, and it would also limit users who don't sync.
- **Label refreshes and marks may use the headroom.** If even that is gone, they stay local until room frees up.
- **Over the limit anyway:** a browser-side merge ignores quotas, so this can happen.
  - The replicator stops pushing, and the status says "Synced settings are full".
  - The copy recovers as soon as the user removes something.
- **One item holds at most 7,600 bytes.** Larger documents are chunked ([5.4](#54-conflicts-while-syncing)), so the 8,192-byte per-item limit never reaches the user.
- **Turning sync on with more than fits:** the join is refused with the same message, naming what to remove.

#### 5.7 Different 2.x versions

- **Every document carries its version `v`.**
- **A browser that reads an older `v`** upgrades the document in memory, and writes the new form at its next edit of that document. It doesn't upgrade eagerly, so older browsers keep syncing until they update.
- **A document with a newer `v` than this browser understands** isn't adopted.
  - This browser stops pushing that document.
  - It shows "Update {Name} in this browser to keep syncing."
  - Extensions update within a day, so this is brief.
- **Within one `v`,** changes are additive only, and unknown fields are kept ([2.4](#24-shapes)).

### 6. Caches

| Cache | Where | Stamp | Fresh for | Refreshed by | Removed when |
|---|---|---|---|---|---|
| **Playlist list:** IDs, titles, privacy, counts, thumbnail URLs | `cache:<acct>.playlists` | `listAt` | 5 min | A popup, settings page or chooser that shows a staler list refreshes it once, through a serving tab (one request). Also **Refresh**, always, and every membership read. | The setup is removed, or Clear All Data |
| **Save-dialog order,** per site | `cache:<acct>.order` | (the list's) | — | Each membership read on that site (www or music) | As above |
| **Newly created playlists** | `cache:<acct>.created` | `at`, per entry | Up to 24 h | Creating one | YouTube lists it, or it's 24 h old |
| **Account label check** | `cache:<acct>.labelAt` | itself | 24 h | Seeing the account in a normal window | As above |
| **Account label** | In the setup | — | — | The check above; written only on change | With the setup |
| **Channel labels** | In each filter | — | — | Each read of that channel (auto-add, the popup's channel card, typed channels); written only on change | With the filter |

- **Rules:**
  - Paint from the cache at once, then refresh if it's stale. Never refresh more than once per open ([ticket 10](10-youtube-access.md)'s "no crawling").
  - **Membership reads** (`get_add_to_playlist`) replace the set of playlists, their titles and privacy, and that site's order. Thumbnails and counts are kept for the IDs still present.
  - **List reads** (`FEplaylist_aggregation`) replace thumbnails and counts.
  - Watch later is always present on www as a fixed entry ([ticket 10](10-youtube-access.md)).
  - Only playlists the account can add to are cached. The parser decides which ([ticket 25](25-live-checks.md)'s L5).
  - Thumbnails are stored as URLs, never as image data.
  - With no YouTube tab open, the popup and settings show the stamp with the cached data, e.g. "Updated 3 h ago" ([ticket 10](10-youtube-access.md) §9).
  - A Missing mark clears when the playlist appears in a list read again ([ticket 12](12-adding.md)). That's a setup write, so it syncs.
- **No membership cache.** Membership is read fresh before every add and every time the picker opens ([ticket 12](12-adding.md)).
  - It changes with every add made elsewhere.
  - A list of which videos are in which playlists is a record of what was watched.
  - *Runner-up:* a short cache for the picker's first paint. It lost because stale ticks mislead, and the picker already paints its rows before membership arrives.
- **No channel cache.**
  - 1.5.0's `session:channelCache` existed to save Data API quota. In 2.0 the channel is a free page read ([ticket 10](10-youtube-access.md)).
  - A fallback request's answer lives only as long as the add or popup that asked for it.
  - *Runner-up:* a memo in session storage. It lost because it saves a rare request at the price of keeping a list of watched videos in memory.
- **Accounts without a setup** get no cache ([section 3](#3-account-keys)).

### 7. Watch progress

[Ticket 07](07-watched.md)'s remembered progress:
- **`progress:<acct>`,** one key per account. For each video it holds:
  - its length;
  - the merged stretches that were played, at most 100;
  - when it last played.

  Beyond 100 stretches, the shortest are dropped. That can only undercount, never overcount, so the worst case is a missed add (ticket 07's rule).
- **A video's progress is kept until whichever comes first:**
  - auto-add has run for it;
  - its length changes by more than 2 s;
  - 30 days pass since it last played.
- **At most 2,000 videos per account,** oldest dropped first. Expired entries are pruned at every background start and every write.
- **When it's written:** the background writes it from the tab's readings:
  - when playback pauses;
  - when the tab leaves the video;
  - when the tab is hidden or closed;
  - every 60 s of continuous playback.

  A crash loses at most a minute.
  - *Runner-up:* write every reading. It lost because readings come four times a second, and the key holds up to 2,000 videos.
- **Never synced, and never written from a private tab.** In a private tab, progress lives in the tab.
- **Deleted:**
  - when auto-add is switched off (every account);
  - when the setup is removed (that account);
  - by Clear All Data.

### 8. The private-window write guard

- **One write path.** Only the background writes to any storage area.
  - Content scripts, the popup and settings send changes as messages. They never call `storage.*.set`, `remove` or `clear`, and a test fails the build if any code outside the store does.
  - Content scripts don't read storage either. The background gives each tab its **tab view**: the shared settings, plus its own account's setup and filters ([ticket 11](11-accounts.md)).
- **The background decides where a write comes from,** never the message:
  - from a content script or the settings tab: `sender.tab.incognito`;
  - from the popup, which has no `sender.tab`: the popup sends its window ID from `windows.getCurrent()`, and the background checks `windows.get(id).incognito`;
  - `extension.inIncognitoContext` isn't used, because it's false in an incognito popup on Chrome;
  - if the window can't be found, the write counts as private (it fails closed).
- **The rule:** a write from a private window is refused if it would store anything that comes from the private session. Changes the user makes to their own configuration carry nothing from the session, so they're allowed ([ticket 11](11-accounts.md)).

| Change | From a private window |
|---|---|
| Shared settings: switches, options, keys, labels, Watch later on every account, theme, the default percentage | Allowed |
| Removing a playlist shortcut, including its target in every setup | Allowed: it removes a shared choice |
| Settings sync on or off, the join choice, Detailed console log | Allowed |
| Pause and Resume | Allowed |
| First-run consent | Allowed |
| Clear All Data | Allowed |
| Any account-setup change: ticks, Takes, percentages, filters, targets, quick-save (including choose mode's first pick), creating, claiming or removing a setup | **Refused** |
| Labels, Missing and Full marks | **Refused** |
| Caches, newly created playlists | **Refused** |
| Watch progress | **Refused** |
| The last current account, the last visibility | **Refused** |
| Session memory: skips, recent adds, 429 pauses, shown-once memory, breakage signals, tab registry entries | **Refused:** kept in the tab's own memory or the background's variables, never in `storage.session` |

- **A refusal is answered** with `{refused: "private"}`, so a surface can explain it (tickets 11 and 26 have the copy). Surfaces normally disable those controls first. A refusal is also logged to the console.
- **Why one place:** Chrome's default spanning mode and Firefox both share every storage area between normal and private windows. Only a guard on the write path keeps private data out.
- **Sync:** documents coming in from the synced copy come from the user's other browsers, never from a private session, so they're accepted.

### 9. Clearing

#### 9.1 Clear All Data

It's in Settings, always reachable, and has a confirmation. That fixes two Friction items: it was only reachable while signed in, and it had no confirmation.
- **Copy:** "Clear all data? {Name} forgets everything it keeps in this browser: features, shortcuts, account setups, channel filters, cached playlists and watch progress. It starts again as if just installed. Your playlists on YouTube aren't touched." with **Clear** and **Cancel**.
- **A checkbox:** "Also delete synced settings from all your browsers". It's off by default. Ticked, every browser that syncs is reset too.
  - It's shown when sync is on, or when this browser has synced before (`sync.joined` is set). That's decided from local state, so `storage.sync` isn't read while sync is off (ticket 24).

| What | Unticked | Ticked |
|---|---|---|
| `storage.local` | Everything, consent and the sync switch included | Same |
| `storage.session` | Everything | Same |
| `storage.sync` | Untouched. Sync is switched off first, so nothing is pushed. | Every key is removed, and `s:meta` becomes `{reset: true, id, created}` |
| Other syncing browsers | Unaffected | See below |
| Registered page scripts | Unregistered; open tabs tear down | Same |
| Untouched | YouTube's playlists, site access, Firefox data-collection grants | Same |

- **What another syncing browser does after a ticked clear:**
  - it drops its shared settings, account setups and filters, and those setups' caches and progress;
  - it shows "Your synced settings were deleted in another browser, so {Name} was reset here.";
  - it keeps its consent, its sync switch and its unclaimed setup.
- **Afterwards,** the first-run screen shows again.
- *Runner-up:* always clear `storage.sync` too, as 1.5.0 does. It lost because it silently wipes other browsers, which is a Friction item.
- *Second runner-up:* never touch the synced copy. It lost because the user would have no way to delete their synced data, short of resetting the browser's own sync.

#### 9.2 Removing an account setup

From Settings' account list, with ticket 11's confirmation. It's refused from a private window.

| Removed | Where |
|---|---|
| The setup: auto-add playlists, Takes, overrides, targets, quick-save playlists, marks, label | Here, and with sync on, in every syncing browser (as a tombstone) |
| All its channel filters, kept filters included | Same |
| Its playlist cache and newly created playlists | Here |
| Its watch progress | Here |
| Its session memory: skips, recent adds, 429 pause | Here |
| `device.lastAccount`, if it was this account | Here |

- **Unchanged:**
  - shared settings: the shortcuts keep their keys and labels, and only this account's targets go;
  - other setups;
  - YouTube.
- The account starts a new setup with its next choice.

#### 9.3 Smaller removals

- **Discard** (ticket 11's 1.x setup prompt) deletes `unclaimed`.
- **Switching auto-add off** deletes all watch progress. It keeps the auto-add playlists, filters and percentages ([ticket 07](07-watched.md)).
- **Removing a playlist shortcut** deletes its entry in shared settings and its target in every setup ([ticket 08](08-shortcuts.md)). Ticket 08's 6 s Undo is held in memory.
- **Unticking an auto-add playlist** removes its entry. Its filter is kept (channel-filters spec) and counts toward the sync budget.
- **Switching any other feature off** keeps its settings. Ticket 08: turning a feature off and on again keeps what the user had.

### 10. Schema versioning and migrations

#### 10.1 Versions

- **`schema`** in `storage.local` is this browser's layout version, and 2.0 writes `1`. An absent marker means pre-2.0, or a fresh install.
- **`v`** in every synced document's stamp is that document's version ([5.7](#57-different-2x-versions)). `s:meta.v` is the synced copy's layout version.
- **The migration runs at the top of every background start,** before the reconciler, the replicator or any message handler.
  - It doesn't rely on `onInstalled` alone, which Firefox can skip ([ticket 06](06-upgrade-path.md)).
  - Other contexts wait for the store's `ready`.
  - Every step is idempotent. New keys are written before old ones are removed, and `schema` is written last.
  - `onInstalled` is used only for work tied to the event: the first-run tab on "install", and an early nudge for the upgrade note on "update" from 1.x.
- **2.x steps:** each takes `schema` from N to N+1, is a pure function of the stored data, and runs in order.
- **A layout newer than this build knows** can only come from a manual downgrade.
  - The build changes nothing and registers nothing.
  - The popup says "This version of {Name} is older than your settings. Update it to continue."
- **WXT's per-item `version` and `migrations` aren't used.** They run per key in every context and skip absent values ([ticket 06](06-upgrade-path.md)'s research), while this migration spans keys.

#### 10.2 From 1.4.5 and 1.5.0

This runs when `schema` is absent and any legacy key exists.

| Old key | How 1.4.5 behaved | Becomes |
|---|---|---|
| `playlists` | IDs typed by hand, saved on every keystroke | `unclaimed.autoAdd`. Take `list=` out of URLs, trim, keep only `PL…` IDs (`^PL[A-Za-z0-9_-]{16,64}$`), and de-duplicate. Each will take Videos and use the default percentage ([ticket 07](07-watched.md)). |
| `addToPlaylistID` | Free text, not trimmed | `unclaimed.shortcutPlaylist`, with the same clean-up |
| `watchLaterShortcut` | `Control` never fired | Shortcut 1's key in shared settings, by ticket 08's conversion; `null` if it can't be converted |
| `requiredWatchPercentage` | A string; absent or `""` meant 0 % | `settings.autoAdd.pct`: a number, rounded and clamped to 0–100. Absent, empty or not a number becomes **0** (recommended; ticket 19 confirms). |
| `toastEnabled` | Absent meant off | Show feedback for auto-add and playlist shortcuts: `true` becomes on; anything else becomes **off** (recommended; ticket 19 confirms). Failures show either way ([ticket 12](12-adding.md)). |
| `clientID`, `clientSecret`, `accessToken`, `refreshToken` | The Data API credentials | Deleted (map Notes) |
| `authMode`, `authServerURL`, `cachedPlaylists`, `preventDuplicates`, `queueButtonEnabled`, `cardContextMenu` (1.5.0, developer profiles only) | — | Deleted. New features start off (map Notes). |
| `channelFilters` and `channelLabels` (1.5.0) | — | `unclaimed.filters`, with the labels embedded. They're claimed with the setup. |
| `sync:theme` (1.5.0) | — | `settings.theme`, then removed from `storage.sync` |
| `session:channelCache` (1.5.0) | — | Removed |
| IndexedDB `yt-playlist-tools` (1.5.0) | — | Deleted with `indexedDB.deleteDatabase` in the background |
| `localStorage` keys `cachedVideos`, `playlists` and `preventDuplicates` on the extension's origin (unreleased builds) | — | Removed by the first extension page that opens, because a service worker has no `localStorage`. Then `device.legacyCleared` is set. |

- **Why the recommended values:** they're what 1.4.5 actually did for users who never touched those controls.
  - Carrying over what the popup displayed instead (50 %, toasts on) would change behaviour nobody asked to change.
  - With ticket 07's measure, 0 % means "as soon as 1 s of the video plays", which matches what those users had.
  - The upgrade note ([ticket 19](19-upgrade-and-rollout.md)) states the carried values.
- **Switches after the migration:**
  - **Auto-add** is on if any auto-add playlist was carried over.
  - **Playlist shortcuts** are on if both a key and a playlist were carried over ([ticket 08](08-shortcuts.md)). The picker and undo keys are preset now, and `preset` is set to true so no Watch later preset is added later.
  - **Everything else** is off, and sync is off.
  - **Nothing runs until the user accepts the upgrade note,** which doubles as consent (tickets [06](06-upgrade-path.md) and [09](09-where-things-live.md)). `device.consent` stays null, and the reconciler registers nothing without consent.
- **`device.upgradeNote`** is set to pending. Its content is ticket 19's.
- **The unclaimed setup** stays in this browser and never syncs. Claiming it ([ticket 11](11-accounts.md)) merges it into the account's setup, which then syncs like any other.

### 11. PROVISIONAL: settings sync and AMO's data-collection rules

This is provisional until [ticket 23](23-ask-amo.md) has AMO's answer to "Does settings sync through `storage.sync` count as transmission?". The design above is the same either way. Only the switch-on step and the manifest differ.

| | Sync doesn't count as transmission | Sync counts as transmission |
|---|---|---|
| **Firefox manifest** | `data_collection_permissions: { required: ["none"] }` | `required: ["none"]` (if the YouTube requests are fine), plus `optional: [<type>]` with the type AMO names. Ticket 23's fallback is `websiteActivity`. |
| **Switching sync on (Firefox)** | As in [section 5](#5-settings-sync) | The click first calls `permissions.request({ data_collection: [<type>] })`. If the user declines, sync stays off with "Sync needs your permission to send settings through Firefox Sync." |
| **Revoked later in about:addons** | — | `permissions.onRemoved` switches sync off in this browser. Its settings stay. |
| **1.4.5 → 2.0 update** | Silent | Still silent: an optional type never holds an update |
| **Firefox floor** | 140 | 140, which supports optional data types and requesting them at runtime |
| **Chrome** | Unaffected | Unaffected |

- **Why optional:** sync is an opt-in feature, so its consent belongs at its switch, and users who never sync are never asked.
- **If AMO insists the type is required:**
  - it goes in `required`, and the runtime step disappears;
  - 1.4.5 updates are then held behind Firefox's consent prompt ([ticket 06](06-upgrade-path.md)), which ticket 19's note must explain;
  - the Firefox 140 floor already covers it.
- **What syncs, for AMO's question:**
  - account keys (digests of YouTube's account ID), account names, @handles and avatar URLs;
  - playlist IDs, channel IDs and channel names;
  - shortcut keys and labels;
  - feature choices.

  If AMO counts names as `personallyIdentifyingInfo`, that type joins the optional list. The mechanism doesn't change.

### 12. Testing

This fills [ticket 04](04-bun-test.md)'s gap: WXT's fake browser doesn't model `storage.sync`'s quotas.
- **A fake sync area** with the browsers' limits:
  - 102,400 bytes counted as in [2.5](#25-sizes-against-the-quotas), 8,192 per item, and 512 items;
  - Chrome's per-call 120 a minute and 1,800 an hour;
  - an atomic multi-key `set`, and the quota error by kind;
  - per-key delivery that can be delayed, reordered or dropped.
- **Two fakes joined by a fake "server"** stand in for two browsers, for conflict, join, chunk and uninstall-wipe tests.
- **WXT's fake browser** covers `storage.local` and `storage.session`.
- **Pure functions, tested directly:** the budget counter, the chunker, the conflict rule, the private-write table, the migrations and the document codecs.

### 13. Judgement calls at a glance

| Decision | Chosen | Runner-up, and why it lost |
|---|---|---|
| Source of truth | `storage.local` in every browser; sync is a copy | `storage.sync` as the store while on: one uninstall, or Chrome's sign-in merge, would wipe every browser |
| Feature switches | Sync with everything else | Per browser: a new browser would arrive set up but switched off |
| Unit of sync and conflict | The shared settings, each setup, each filter | One blob: every edit conflicts. One key per field: a filter's mode and list could split. |
| Conflicts | Newest edit per document, tombstones, and the user picks a side when histories meet | Field-level merge: a rare case, at a quota cost. Automatic newest-wins at the join: an older, careful setup would lose silently. |
| Over budget | Refuse the change while sync is on | Sync what fits: browsers would differ silently |
| Labels | Account and channel labels sync; playlist titles don't | Titles too: duplicates the cache and adds sync writes |
| Account key | A digest of `DATASYNC_ID` | The raw ID: a needless identifier in sync, and longer keys |
| Membership and channel caches | None | Short caches: stale ticks, and a list of watched videos |
| Progress writes | On pause, leaving the video, hiding the tab, and every 60 s | Every reading: four writes a second |
| Clear All Data | This browser; the synced copy only if ticked, which resets syncing browsers | Always clear sync (a 1.5.0 Friction item); never clear it (no way to delete synced data) |
| 1.4.5 values (for ticket 19) | What 1.4.5 did: 0 %, feedback off | What its popup showed: changes behaviour nobody asked to change |
| AMO fallback | An optional data type, asked for at the sync switch | Required: holds every 1.4.5 update for a feature most users won't use |

### 14. Facts this rests on

Read on 2026-10-19 from Chromium `main`, Firefox `main`, mozilla/application-services `main`, developer.chrome.com, MDN and Extension Workshop.

**Chrome** (floor 121):
- **Quotas** (`extensions/common/api/storage.json`):
  - `storage.sync`: `QUOTA_BYTES` 102,400, `QUOTA_BYTES_PER_ITEM` 8,192, `MAX_ITEMS` 512, `MAX_WRITE_OPERATIONS_PER_HOUR` 1,800, `MAX_WRITE_OPERATIONS_PER_MINUTE` 120. The sustained write limit is gone.
  - `storage.local`: 10 MB since Chrome 114.
  - `storage.session`: 10 MB since Chrome 112. By default only trusted contexts can use it, and it's cleared on disable, reload, update and browser restart.
- **Counting:**
  - Each item is the UTF-8 key plus its JSON value, and the items are summed.
  - A multi-key `set` is checked as a whole and is atomic (`settings_storage_quota_enforcer.cc`).
  - Every `set`, `remove` or `clear` is one write operation, however many keys it touches (`storage_api.cc`).
  - Quotas and rate limits apply even with sync off; with sync off, the area "behaves like `storage.local`".
  - The quota error's text changed in Chrome 137, to `"Resource::kQuotaBytes quota exceeded"`.
- **Syncing:**
  - **First sync** (`syncable_settings_storage.cc`): if the server has data for the extension, it overwrites local values and **deletes local-only keys**. Otherwise local keys are uploaded. Server values are written without a quota check.
  - **Each key is its own sync entity.** Per key, the remote value wins, except that a remote delete loses to a local edit.
  - **Remote changes** fire `onChanged` with area `sync`.
  - **Extension settings also sync** for users signed in without full sync, and the Extensions toggle covers them.
- **Incognito:**
  - Every storage area is shared between regular and incognito.
  - In spanning mode the popup runs in the regular profile, so `inIncognitoContext` is false there, while `windows.getCurrent().incognito` is true.
  - `sender.tab.incognito` exists.
- **Uninstall** clears `storage.sync` through sync, so the server copy is deleted too.

**Firefox** (floor 140):
- **Quotas:**
  - `storage.sync`: 102,400, 8,192 and 512, enforced since Firefox 79, with **no write-rate limits**. The total check serializes the whole object, so each key also costs its quotes, colon and comma.
  - `storage.session`: since 115, with 10 MB enforced, and not available to content scripts.
  - `storage.local`: no quota beyond IndexedDB's.
- **Syncing:**
  - It goes through the "extension-storage" engine, which is on when **Add-ons** is ticked in Sync. It syncs every 10 minutes, or on Sync Now. Signed out, it works locally.
  - **There's one server record per extension,** so a device's keys arrive together.
  - **The merge is per key, and the incoming value wins.** On the first sync with no shared ancestor, server keys overwrite local ones, and local-only keys are kept and re-uploaded.
  - `onChanged` fires with area `sync`.
- **Private windows:**
  - Storage is shared between private and normal windows.
  - `inIncognitoContext` is true in a private window's popup.
  - `sender.tab.incognito` exists.
- **Uninstall** clears local and sync storage, and the deletion reaches the server.
- **Data consent:** from Firefox 140, an extension can declare optional data types under `data_collection_permissions.optional` and request them with `permissions.request({ data_collection })` from a user action. `contains`, `onAdded` and `onRemoved` cover them, and adding an optional type never holds an update.

**Unverified:**
- whether Chrome delivers several keys from one remote write together (assumed not; [5.4](#54-conflicts-while-syncing) doesn't need it);
- what happens to synced data when the user signs out of the browser's own sync.

Also from [ticket 19](19-upgrade-and-rollout.md):
- the upgrade note's `details` shape and its `opened` flag;
- the consent version starts at 1;
- toasts were off by default in 1.4.5's popup too (correcting ticket 06);
- the private-window fallback if AMO says no.

## Settled by the user (2026-10-20)

- **Settings export and import to a file** ([R90](../spec/resolutions.md#the-users-decisions-of-2026-10-20-r84r99)): approved. The file holds the shared settings and every account setup with its filters, the documents sync carries, and never consent, caches, watch progress or session memory. Importing replaces what the file covers, as one edit that sync then carries. Spec: 04 DATA-53 to DATA-55, 06 ARC-MOD-36.
- **Recent adds** ([R86](../spec/resolutions.md#the-users-decisions-of-2026-10-20-r84r99)): a `storage.session` list of up to 50 adds, kept until the browser closes, never synced. Spec: 04 DATA-52.
