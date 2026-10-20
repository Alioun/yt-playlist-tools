# 9. Parity and defects checklist

The map's rule is that nothing is holy except the functionality. Every capability 1.5.0 has, and everything 1.4.5 users had, survives in 2.0, though its UI may change. The only exceptions are rows marked DROPPED or RETIRED, and each of those names the decision behind it. Every item on the inventory's Friction list is a defect 2.0 must fix.

Sources:
- `.scratch/rebuild/inventory.md` (1.5.0 at `301ae51`, plus its 1.4.5 notes);
- `map.md`;
- `for-the-user.md`;
- the tickets' Answers in `issues/`;
- the resolutions made while assembling the spec ([resolutions.md](resolutions.md): R1–R40, then the second round, R41–R67, then the third, R68–R77), R83, settled after the spec, the user's decisions of 2026-10-20, R84–R99, the running-cost rules, R100–R117, and the GatherTube fold, R120–R139;
- GatherTube 1.1.0's inventory and fold, in [`docs/research/gathertube.md`](../../../docs/research/gathertube.md) ([ticket 31](../issues/31-gathertube.md)), for §4;
- the assembled chapters 02–08, which every row was checked against. Where they disagree, the resolutions' ownership rule picks the owning chapter, and the rows follow it.

Use this chapter as the acceptance checklist: every row should trace to at least one build ticket.

## How to read this chapter

**Status words**

| Word | Meaning |
|---|---|
| KEPT | Same behaviour. Its UI may differ. |
| IMPROVED | Same capability, made easier, safer or broader. |
| CHANGED | The behaviour deliberately differs. The row names the decision. |
| DROPPED / RETIRED | Deliberately gone. The row names the decision. |
| ADOPTED | An improvement adopted in a ticket or a resolution, needing no separate go-ahead. |
| PROVISIONAL | Decided, but it rests on a check that hasn't run yet. That's usually [ticket 25](../issues/25-live-checks.md)'s signed-in live check, which is waiting for the user. If the check fails, the row needs a new decision: there's no Data API fallback (ticket 10 §10). |
| **GAP** | No ticket or resolution decides it. None remain: R39 settled the last three (see [Resolved during assembly](#resolved-during-assembly)). |
| **PENDING USER** | A new capability that's still waiting for the user's go-ahead (`for-the-user.md`). It isn't in 2.0 unless approved. None remain: the user answered on 2026-10-20 (R84–R99). |
| DECLINED | A proposed new capability the user turned down. It isn't in 2.0. |

**(R-n)** at the end of a cell means resolution R-n changed or added that behaviour.

**The Chapter column** names each chapter by its number, followed by the requirement IDs that specify the row. Where a chapter gives no ID, the section is named instead.

| No. | File | Holds | IDs |
|---|---|---|---|
| 02 | [02-youtube.md](02-youtube.md) | YouTube features: auto-add and watch progress (07), channel filters, the add flow with its feedback, copy, undo and failures (12), the playlist picker, playlist shortcuts and the key recorder (08), quick-save, the queue button, the watch-page button, the card menu (14), what the user sees when YouTube changes (18), keys from any tab and Save from the browser's menu (R88, R91), and Gather tabs (31; R120) | YT-GEN, YT-ITEM, YT-AA, YT-CF, YT-ADD, YT-PK, YT-NEW, YT-KEY, YT-QS, YT-Q, YT-WB, YT-CM, YT-BRK, YT-ANY, YT-BM, YT-GT |
| 03 | [03-youtube-music.md](03-youtube-music.md) | YouTube Music: 21, 26, 27, 28 | YM-* |
| 04 | [04-features-accounts-data.md](04-features-accounts-data.md) | The feature model, Show feedback, consent, site access, accounts (11), settings sync, storage, caches, watch progress, Clear all data and migrations' data (16), and breakage status and diagnostics (18) | FT, ACC, SYNC, DATA, HEALTH |
| 05 | [05-ui.md](05-ui.md) | Where things live, the popup, settings and the first-run page (09, 15), in-page look on both sites, the picker's look, toasts, and the brand | UI-IA, UI-POP, UI-SET, UI-ONB, UI-YT, UI-YM, UI-PICK, UI-TOAST, UI-RULE, UI-BRAND |
| 06 | [06-architecture.md](06-architecture.md) | YouTube access and routes (10, ADR-0001), the manifest and permissions, modules, the gateway, registry and messaging (17) | ARC-ACC, ARC-MAN, ARC-MOD, ARC-REG, ARC-MSG |
| 07 | [07-quality.md](07-quality.md) | Tooling, test layers and fixtures (04, 17 §9), the breakage watch (18), performance budgets (24) and CI | Q-TOOL, Q-TEST, Q-FIX, Q-WATCH, Q-PERF, Q-CI |
| 08 | [08-release.md](08-release.md) | The 1.4.5 migration and upgrade note, consent copy, betas, release order, store listings, the privacy policy and workflows (06, 19) | REL-MIG, REL-CON, REL-STORE, REL-CI, REL-CHK |

**Row IDs:** `PAR-CAP-` rows are 1.5.0's capabilities (§1), `PAR-DEF-` rows its defects (§2), `PAR-NEW-` rows new capabilities and improvements (§3), and `PAR-GT-` rows GatherTube's items (§4; R120).

## Open rows at a glance

**No GAPs remain.** R39 settled the three this chapter found: the Refresh control (PAR-CAP-48), sorting (PAR-DEF-14) and the README (PAR-DEF-31).

**PROVISIONAL rows that parity depends on** (ticket 25, waiting for the user's signed-in run):
- PAR-CAP-36 and PAR-CAP-37: the Add to queue route and its confirmation.
- PAR-CAP-47: the playlist-list route.
- PAR-CAP-15: the add route.
- PAR-CAP-11: made-for-kids detection.
- PAR-CAP-59: signing with the session cookie, and with it the cookie disclosures (R48).
- PAR-CAP-78 and PAR-DEF-35: adds when membership can't be read (L6).
- PAR-DEF-24: queue confirmation.
- PAR-DEF-25: stitched and Shorts ads.
- PAR-NEW-13: the installed YouTube Music app.
- PAR-NEW-16: queue Undo and quiet adds.
- PAR-NEW-43, PAR-NEW-44, PAR-GT-08, PAR-GT-09 and PAR-GT-13: Gather tabs' batched adds and removals, YouTube's queue built with one command, `watch_videos` signed in, how tabs opened in the background or restored report themselves, and reopening tabs for Undo (G1–G7; R136).

PAR-CAP-67, PAR-NEW-06, PAR-NEW-27's saved shared settings in private windows (R58) and PAR-DEF-28's Firefox data-collection prompt no longer wait on AMO's reply: [R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83) settled ticket 23 by decision. If an AMO reviewer objects, [08 §13](08-release.md#13-if-an-amo-reviewer-objects)'s fallback applies.

**PENDING USER:** none. The user answered PAR-NEW-31 to PAR-NEW-39 on 2026-10-20: eight approved and one declined (R84–R93). Of the three user decisions listed after them, only the name (ticket 22) is still open.

## 1. Capabilities

### 1.1 Auto-add

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-01 | A video watched past the threshold is added to every auto-add playlist. | Kept, as the **Auto-add** feature. It's off until the user picks it. 1.4.5 upgraders have it on if any of their auto-add playlists carried over, once they agree on the upgrade note with its row still ticked (R60). | KEPT | map Notes, 07, 09 | 02 YT-GEN-01, YT-GEN-02, YT-AA-18; 04 FT-02, FT-03; 08 REL-MIG-22, REL-CON-07 |
| PAR-CAP-02 | "Watched" means the playhead position (`currentTime / duration`) reached the threshold. Seeking, a `&t=` start and YouTube's resume point all fire it. | **Watch progress:** the seconds actually played, each part counted once, at any speed. Seeking, chapters, `&t=`, resume points, skips and ads don't count. The goal is `max(1 s, % × length)`, capped at length − 2 s, or at the length for videos shorter than 3 s. (R27) | CHANGED (decided on the user's behalf; for-the-user "Watched now means actually played") | 07 | 02 YT-AA-13, YT-AA-14, YT-AA-17 |
| PAR-CAP-03 | One global required percentage, 0–100, default 50. It updates live. | A shared default (0–100, default 50 %) plus an optional override per playlist. Changes apply at once, including to videos already playing. | IMPROVED | 07, 15 | 02 YT-AA-30, YT-AA-31, YT-AA-33; 05 UI-PICK-20, UI-PICK-22 |
| PAR-CAP-04 | It fires once per arming. Replays and loops on the same page don't fire again. Navigating back re-arms it. | At most once per playlist per playback. A new playback (coming back, a reload, a Short swiped back to, the miniplayer reloading) starts again, and YouTube's "already in" ends it silently. Progress is remembered across visits for up to 30 days, until every playlist that takes the video has added it or found it already in. A session skip, a filtered-out playlist or a failure keeps it. (R23, R43) | IMPROVED | 07, 12, 16 | 02 YT-AA-35, YT-AA-36, YT-AA-37; 04 DATA-24, DATA-25 |
| PAR-CAP-05 | Paused: nothing fires. | Nothing counts while paused, buffering, or showing "Continue watching?". | KEPT | 07 | 02 YT-AA-15 |
| PAR-CAP-06 | Live streams, and premieres while waiting or live, never fire. | Same, and post-live recordings don't count either. Replays and finished premieres count like any video. Counting live streams was PAR-NEW-34, which the user declined (R87). | KEPT | 07 | 02 YT-AA-24, YT-AA-25 |
| PAR-CAP-07 | Shorts never fire (no `?v=`). | Auto-add on Shorts: each playlist takes Videos (the default), Shorts or Both. | CHANGED: approved new capability (PAR-NEW-07) | map Notes, 07 | 02 YT-AA-26, YT-AA-27, YT-AA-29 |
| PAR-CAP-08 | Videos inside playlists and mixes count, by `v`. | They still count, as do autoplayed next videos. The video ID comes from the player (`getVideoData().video_id`) and must match the navigation; the URL alone is never used. | KEPT | 07 | 02 YT-AA-07, YT-AA-10 |
| PAR-CAP-09 | Leaving `/watch` (the miniplayer) disarms it. | The miniplayer and the queue items played in it count. | IMPROVED | 07 | 02 YT-AA-07 |
| PAR-CAP-10 | Background tabs fire. | Kept. Their toasts wait until the tab is visible. Browser limits apply: a tab opened in the background doesn't start media until it's shown, and Chrome pauses a muted video in a hidden tab. | KEPT | 07, 12 | 02 YT-AA-07, YT-AA-39, YT-ADD-20 |
| PAR-CAP-11 | Covers the top frame on `*.youtube.com`, not music.youtube.com or embeds. | Only `#movie_player` (watch page and miniplayer) and `#shorts-player` count. Previews, channel trailers, clips, embeds, made-for-kids videos and YouTube Music never do. | KEPT (narrowed to the real players). Made-for-kids detection is PROVISIONAL (25). | 07, 10 | 02 YT-AA-08, YT-AA-09, YT-AA-12 |
| PAR-CAP-12 | A threshold of 0 fires on the first `timeupdate`. | 0 % means "as soon as 1 s of the video itself has played". | KEPT | 07 | 02 YT-AA-17, YT-AA-32 |
| PAR-CAP-13 | The duplicate check is a local IndexedDB record of this profile's adds, gated by the "Prevent duplicates" setting (on). | Membership is read from YouTube before every add, and a playlist never gets a second copy. The IndexedDB store and the old `localStorage` cache are deleted on upgrade. | CHANGED. "Prevent duplicates" is DROPPED: 2.0 never adds duplicates, and no released version had the setting. | 12, 16 §10.2 | 02 YT-ADD-05, YT-ADD-06; 04 DATA-22; 08 REL-MIG-08 |
| PAR-CAP-14 | Channel filters run after the duplicate check. | Kept unchanged (`.scratch/channel-filters/spec.md`). They now run before the membership read: the filter is free, and the read costs a request. | KEPT (order changed) | 12 | 02 YT-CF-06, YT-ADD-02 |
| PAR-CAP-15 | `playlistItems.insert` per playlist, in sequence. | A session request (`playlistEditEndpoint` `ACTION_ADD_VIDEO`) from the tab, one at a time per tab. Each playlist is handled on its own. Success is read from `status`, never from the HTTP code. | CHANGED (route) · PROVISIONAL (25) | 01, 10, 12 | 06 ARC-ACC-41, ARC-ACC-42; 02 YT-ADD-02, YT-ADD-09 |
| PAR-CAP-16 | No on/off switch. | The feature switch, plus Pause and "Don't auto-add this video". Pause lasts until the user resumes it or the browser restarts, and an extension update also ends it (R57). | IMPROVED | 07, 09, 14 | 02 YT-AA-01, YT-AA-03, YT-AA-04; 04 DATA-11; 05 UI-POP-14, UI-POP-23 |
| PAR-CAP-17 | Pre-checks toast "No access token found" or "No auto-add playlists selected" on every video. | Silent when there's nothing to add to or the user is signed out: the signed-out toast with **Sign in** is for explicit actions only (R41). The popup says what's missing (PAR-DEF-01). | CHANGED | 07, 11, 12 | 02 YT-AA-02, YT-GEN-08; 04 ACC-21; 05 UI-POP-12 |

### 1.2 Channel filters

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-18 | Per auto-add playlist: Off, Allow only or Deny. An empty allowlist blocks everything. An unknown channel is blocked in Allow mode and passes in Deny mode. Channels match by `UC…` ID. | Unchanged, per the channel-filters spec. The editor now warns about an empty allowlist. | KEPT | 12, 15 | 02 YT-CF-03, YT-CF-04, YT-CF-13; 05 UI-PICK-21 |
| PAR-CAP-19 | The channel comes from the session cache, then the player response through the bridge, then `videos.list`; otherwise it's unknown. | A page read (the navigation detail, else `getPlayerResponse()`; on Shorts, the reel data), then a plain `next` or `reel/reel_item_watch` request; otherwise unknown. There's no channel cache and no Data API. | CHANGED (route) | 10, 16 | 02 YT-CF-08, YT-CF-09; 06 ARC-ACC-67 (§6.2.6 `channelOf`) |
| PAR-CAP-20 | One toast covers every blocked playlist, there's an unknown-channel toast, and each decision is logged to the console. | "Didn't auto-add “{title}”: {Channel} is filtered out of {list}" is a confirmation, so feedback off hides it. An unknown channel blocked by an allowlist is also *filtered out*, never *failed*. Its own toast shows even with feedback off, once per browser session (R26). Some playlists added and the rest filtered out gives one toast with Undo for the adds (R27). Every outcome is logged. | KEPT | 12 | 02 YT-CF-18, YT-ADD-15, YT-ADD-25 |
| PAR-CAP-21 | Listed channels' labels are refreshed after lookups. | Labels live inside the filter. They're compared after each read and written only when they change. | KEPT | 16 | 02 YT-CF-10; 04 DATA-06 |
| PAR-CAP-22 | Editing: Off keeps the mode and list, and switching mode clears the list after a confirmation. The channel card has Allow/Deny per checked playlist; the inline editor has tags, "add this video" and a typed channel. | The same editor in the popup and Settings. Allow or Deny this channel also appears in This video's details and in the watch-page button's menu. | KEPT | 09, 14, 15 | 05 UI-PICK-21, UI-POP-14, UI-YT-22; 02 YT-CF-12, YT-CF-15 |
| PAR-CAP-23 | Typed channels: a `UC…` ID, `/channel/`, an @handle, a bare handle, `youtube.com/@x` and `/user/`, each resolved with `channels.list`. `/c/` URLs are rejected. | All of those, plus `/c/`, through `resolve_url` (up to 3 hops). Only a `UC…` ID and `/channel/UC…` work with no YouTube tab open; every other form then says "Open YouTube to look up this channel". Errors reuse 1.5.0's wording: "Couldn't find that channel on YouTube." and "That doesn't look like a channel. Paste an @handle or a channel URL." (R27) | IMPROVED (`/c/` support) · CHANGED (most forms need a tab) | 01, 10 | 02 YT-CF-16; 06 ARC-ACC-58 |
| PAR-CAP-24 | Filters are kept, hidden, when their playlist is unticked, deleted, renamed or belongs to another account. Only Clear All Data removes them. | Filters belong to the account's setup and are kept when the playlist is unticked ("kept" filters). They're removed with the setup, by Clear all data, or by "Remove kept filters" when synced settings are full. | KEPT | 11, 16 | 02 YT-CF-17; 04 ACC-08, DATA-45 |
| PAR-CAP-25 | The shortcut, Add to queue and the card menu are never filtered. | Explicit adds (shortcuts, quick-save, the picker, YouTube Music's Save) and the queue are never filtered. | KEPT | 08, 12 | 02 YT-CF-05, YT-Q-03; 03 YM-SAVE-5 |

### 1.3 Keyboard shortcut

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-26 | One shortcut, caught by a `keydown` listener in YouTube pages, with no manifest `commands`. | The **Playlist shortcuts** feature: up to 20 shortcuts, caught in the page (capture phase on `window`) only while the feature is on. The manifest declares `_execute_action` and keys from any tab's three commands, none with a key (R88). | IMPROVED (approved: several shortcuts) | 08, ADR-0004 | 02 YT-KEY-01, YT-KEY-08, YT-KEY-21; 06 ARC-MAN-05 |
| PAR-CAP-27 | Unset by default. | When the feature is first turned on, it presets Alt+W → Watch later on every account and Alt+Shift+P for the picker. 1.4.5 upgraders keep their own key if it converts, and get no Alt+W preset. The undo key belongs to no feature: it's preset to Alt+U at install, set in Settings › Everywhere, and works whenever a toast with Undo is on screen (R2, R44). | CHANGED | 08 | 02 YT-KEY-02, YT-KEY-05, YT-KEY-33; 04 FT-04, FT-05; 08 REL-MIG-17, REL-MIG-24 |
| PAR-CAP-28 | Recorded in the popup: it takes the next non-modifier key. Bare keys, Esc and Tab are accepted, and there's no cancel or clear. | One recorder in the popup and Settings. Esc, Tab or a click elsewhere cancels, and a × clears the key. Enter or Space alone and any Ctrl+Alt combination are refused. It warns on clashes and offers "Use it here". Bare keys are still allowed. | IMPROVED | 08, 15 | 05 UI-PICK-23; 02 YT-KEY-28, YT-KEY-29, YT-KEY-30 |
| PAR-CAP-29 | Matching: the modifier set must match exactly, the key is case-insensitive, auto-repeat is ignored, and the key is swallowed with `preventDefault`. | The modifier set must match exactly. Letters and digits match by character, everything else by physical key. Auto-repeat is ignored. Only a matching key is consumed (`preventDefault` + `stopImmediatePropagation`). | KEPT | 08 | 02 YT-KEY-19, YT-KEY-20, YT-KEY-21 |
| PAR-CAP-30 | Target: one `addToPlaylistID`. A free-text "Playlist ID" field appears when no list has loaded. | Each shortcut has a playlist per account, chosen by title, and an optional label (up to 40 characters). Watch later works on every account. There are no free-text IDs. | IMPROVED | 08, 11 | 02 YT-KEY-07, YT-KEY-12, YT-KEY-14; 04 ACC-06, ACC-10 |
| PAR-CAP-31 | Acts only on `?v=` pages, on the URL's video. | Acts on the pointed-at item (pointer or focus, whichever moved last), else the current video: the watch page's, the Short on screen, or the miniplayer's. | IMPROVED | 08 | 02 YT-KEY-16, YT-ITEM-05, YT-ITEM-06 |
| PAR-CAP-32 | Flow: a toast for no playlist, a toast for no token, the duplicate check, then the add. | The add flow: signed in first, else the failure "Sign in to YouTube to save videos." with **Sign in** (R3, R25, R41). Then the neutral hint "{Shortcut} has no playlist on {Account} yet." with **Choose**, whose pick also saves the video, with Undo (R24, R45, R56). Then the membership read, the add, and a toast with Undo. | KEPT | 11, 12, 14 | 02 YT-ADD-02, YT-KEY-13, YT-KEY-24 |

### 1.4 Add to queue (thumbnail button)

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-33 | `queueButtonEnabled`, on by default. | The **Queue button on thumbnails** feature. It's off until chosen, because every feature starts off. 1.5.0 never shipped, so no user loses a default. | KEPT (default per the first-run rule) | map Notes, 09 | 02 YT-GEN-02, YT-Q-01; 04 FT-02 |
| PAR-CAP-34 | Every page except `/feed/subscriptions`, where YouTube draws its own button. Covered cards: the listed renderers and `yt-lockup-view-model`. Shorts, ads, rich sections, playlist-page items and the playlist panel get none. | Ticket 14's card table: lockups (grids, the watch sidebar, the playlist page), the older renderers and the playlist panel. Ours steps aside wherever YouTube draws its own hover Add to queue, which generalises the subscriptions rule. Nothing on Shorts (YouTube's menu has no queue there), ads, or playlist and mix cards. | IMPROVED | 14 | 02 YT-ITEM-01, YT-ITEM-02, YT-Q-04; 05 UI-YT-12 |
| PAR-CAP-35 | A 28×28 button at the thumbnail's top-left, shown on hover or focus. It pulses while busy, then flashes green or red for 1.5 s. No toast, and no sign-in needed. | A 32 px round button in YouTube's toggle look, at the top-left, in one moving overlay that Tab reaches. It has five states, each with a glyph and a label. Its toast, "Added “{title}” to the queue", carries Undo and is on by default. After Undo, the button returns to idle and is clickable again (R27). It works signed out. | IMPROVED | 12, 14, 15, 29 | 02 YT-Q-03, YT-Q-07, YT-Q-08; 05 UI-YT-08, UI-YT-13 |
| PAR-CAP-36 | `resolveCommand` on the card's element with `addToPlaylistCommand` (QUEUE). | The same command through YouTube's own resolver, because the element-level `resolveCommand` is gone. The resolver is found by shape on first use, cached for the page and retried once (R34); if several properties match, the first whose `resolveCommand` is a function is used (R66). When a queue exists, the add uses the quiet `IAE%3D` route; if YouTube shows its own toast anyway after a quiet add or its Undo, `quiet-route-noisy` marks the feature partly working (R40, R51). Success counts only once the queue's data shows the video. | CHANGED (route) · PROVISIONAL (25) | 10, 17, 25, 29 | 06 ARC-ACC-13, ARC-ACC-14, ARC-ACC-33, ARC-ACC-34, ARC-ACC-35; 07 Q-WATCH-24, Q-WATCH-28; 02 YT-Q-05, YT-Q-06 |
| PAR-CAP-37 | No queue yet: it also opens the miniplayer and creates the queue (`CAQ%3D`), then polls `ytd-miniplayer.active` for up to 600 ms. | The first add creates the queue as 1.5.0 does. It's confirmed by the queue's data, else by the miniplayer turning active, within 2 s; with neither, the result is `unconfirmed`, never success. | KEPT · PROVISIONAL (25, L8) | 10, 12 | 06 ARC-ACC-32, ARC-ACC-35; 02 YT-Q-02, YT-Q-06 |

### 1.5 Right-click card menu

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-38 | `cardContextMenu`, off by default. A right-click in a card clicks its ⋮ button, found through five fallback selectors. | The **Right-click for the video menu** feature, off until chosen. The gateway job `openCardMenu` clicks the card's ⋮, using ticket 14's selector table. This is exempt from "never drive YouTube's UI", because opening the menu is the feature. It loads no kit: even its not-working notice is a tiny kit-free one in the site core (R28). | KEPT | map Notes, 14 | 02 YT-CM-01, YT-CM-02, YT-CM-05; 06 ARC-ACC-08 |
| PAR-CAP-39 | Shift, or a card with no ⋮, gives the browser's menu. | The same, and ads and playlist cards also get the browser's menu. Links to anything other than the card's video always keep it, and the option "Links inside cards keep the browser's menu" (off by default, R11) extends that to the thumbnail and title. | IMPROVED | 14 | 02 YT-CM-01, YT-CM-03; 05 UI-YT-25 |

### 1.6 Toasts

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-40 | A Sonner toaster in a shadow root, top-center and unstyled, shown in the sender's tab. | A hand-written toast that copies YouTube's snackbar, at the bottom left. One shows at a time, for 6 s, held while the pointer or focus is on it. Toasts wait while the tab is hidden. Toasts answering the user's own click or key show in fullscreen. YouTube Music gets its own skin. | IMPROVED | 12, 14, 24, 27 | 05 UI-TOAST-01, UI-TOAST-13, UI-TOAST-14; 02 YT-ADD-14, YT-ADD-19, YT-ADD-21; 03 YM-FB-1 |
| PAR-CAP-41 | `toastEnabled` silences every toast. | Each feature's **Show feedback** hides confirmations only, and the pending "Saving…" toast with them (R7). Failures and did-nothing answers always show. Upgraders' `toastEnabled` sets auto-add's and the shortcuts' Show feedback. | CHANGED: failures always show (decided on the user's behalf) | map Notes, 12, 16, 19 | 04 FT-24, FT-25, FT-27; 02 YT-ADD-12, YT-ADD-13, YT-ADD-22 |
| PAR-CAP-42 | Fixed texts naming a raw video ID. | Ticket 12's copy tables, with the copy settled in R22–R27 and R55–R56, and typographic quotes around video and song titles. Playlist names take none, except in "{Shortcut} now saves to “{Playlist}”." (R45, R77). | IMPROVED (PAR-DEF-02) | 12 | 02 YT-ADD-18, YT-ADD-27, YT-ADD-28; 03 YM-FB-10; 05 UI-TOAST-11 |
| PAR-CAP-43 | The settings panel has its own toasts: sign-in, sign-out, Clear All Data and auth errors. | Sign-in, sign-out and auth retire with the account panel. Clear all data uses a confirmation dialog and then reopens first run. | RETIRED / CHANGED | 15, 16 | 04 DATA-37, DATA-41; 05 UI-SET-16 |

### 1.7 Themes

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-44 | `sync:theme`: light, dark or system (default system), set only in Settings. System follows the OS. | `settings.theme`, a shared setting that syncs only while settings sync is on, set in Settings › Appearance. System follows the OS, and it's the default (R11). While sync is off, the migration leaves `storage.sync` alone, so 1.5.0's stray `sync:theme` key isn't moved or removed; only developer profiles ever wrote it (R20). The only `storage.sync` calls while sync is off are first run's read before Agree and Clear all data with its box ticked (R59). | KEPT | 15, 16 | 04 FT-05, FT-21, DATA-49; 05 UI-SET-15 |
| PAR-CAP-45 | The theme covers the popup, the options page and the in-page toasts. | It covers the popup, Settings and the first-run page. In-page UI follows YouTube's own theme. (R37) | CHANGED | map Notes, 14, 15 | 05 UI-IA-06, UI-SET-15, UI-YT-02; 04 FT-05 |
| PAR-CAP-46 | YouTube red is the primary colour. | A pigeon mark with a teal-to-violet gradient, never YouTube red. The name and mark wait on ticket 22 (PENDING USER). | CHANGED | 15, 22 | 05 UI-BRAND-01, UI-BRAND-03, UI-BRAND-05 |

### 1.8 Playlist list

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-47 | `playlists.list mine=true`, paginated, keeping only titles. | `get_add_to_playlist` (which carries membership) or `browse FEplaylist_aggregation`, sent from an open YouTube tab. It keeps IDs, titles, privacy, counts, thumbnails and the Save-dialog order. | CHANGED (route) · PROVISIONAL (25) | 01, 10, 16 | 06 ARC-ACC-01, ARC-ACC-04, ARC-ACC-12; 04 DATA-20, DATA-21 |
| PAR-CAP-48 | Cached in `local:cachedPlaylists`. The popup paints the cache, then refreshes on every open and on **Refresh**. | A per-account cache, fresh for 5 min. Lists paint at once and refresh by themselves when opened if the cache is older than that. A ↻ "Refresh playlists" button in the picker's header and in Settings' playlist lists always refreshes (R39). New playlists are kept for 24 h until YouTube lists them. With no tab, the cache shows read-only and stamped, with Open YouTube, and ↻ is disabled. | IMPROVED | 09, 10, 16 | 04 DATA-20, DATA-21, FT-54; 05 UI-PICK-25, UI-POP-27; 02 YT-PK-02, YT-PK-13 |
| PAR-CAP-49 | Only user-created playlists, in the API's order. | Watch later first, then YouTube's Save-dialog order, with search. A "Sort A–Z" toggle in the picker's header sorts by title instead, stored per device (R39, PAR-NEW-40). | IMPROVED | 12, 15 | 05 UI-PICK-04, UI-PICK-26; 02 YT-PK-01, YT-PK-14 |
| PAR-CAP-50 | Watch Later is unsupported, and the popup says so. | Watch Later is a target for auto-add, shortcuts, quick-save and the picker (PAR-NEW-01). On YouTube Music, it's listed only when YouTube Music's own list includes it. | CHANGED: approved new capability | map Notes, 01, 08, 12 | 02 YT-KEY-12, YT-PK-01; 04 ACC-10, DATA-21; 03 YM-PICK-3 |
| PAR-CAP-51 | Choosing playlists works anywhere the Data API answers. | Choosing playlists, the picker and New playlist need an open YouTube tab. Without one, the switches still work and the lists show read-only from the cache. | CHANGED (no hidden frame, no Data API) | 09, 10 §9 | 04 FT-54; 05 UI-POP-27 |

### 1.9 Account and auth (retires in 2.0)

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-52 | Sign in with Google through the broker in `server/`. | 2.0 works as the YouTube tab's own signed-in account. "Sign in" links to YouTube's sign-in page. | RETIRED | ADR-0001, 10, 11 | 06 ARC-ACC-01, ARC-ACC-51; 04 ACC-04 |
| PAR-CAP-53 | Own credentials: a client ID and secret pasted under Advanced. | The stored values are deleted on upgrade. | RETIRED | map Notes, 16 §10.2, 19 | 08 REL-MIG-08, REL-MIG-27; 04 DATA-49 |
| PAR-CAP-54 | Tokens and the client secret in plaintext `storage.local`, scope `youtube.force-ssl`. Sign Out never revokes them. | No tokens. They're deleted locally on upgrade, and the upgrade note links to Google's permissions page. Nothing is revoked over the network. | RETIRED | 19 §2.5 | 08 REL-MIG-27, REL-MIG-28; 04 DATA-49 |
| PAR-CAP-55 | "Signed in" means a refresh token exists. Sign Out deletes the tokens. | The header names the tab's account. Its identity comes from `ytcfg`, and its avatar, name and @handle from YouTube's account menu. Signing out and switching accounts are YouTube's job, reached through links. | CHANGED | 11, 15 | 04 ACC-01, ACC-17, ACC-18; 05 UI-POP-06 |
| PAR-CAP-56 | The broker, never deployed for users. | Deleted in the first build slice, after tagging `archive/token-broker`. The user shuts down any running deployment. | RETIRED | 19 §13 | 08 REL-CI-51, REL-CI-52 |
| PAR-CAP-57 | The Data API quota: 10,000 units a day per Cloud project, about 200 adds. | No Data API and no quota. YouTube's own rate limits apply: an HTTP 429 pauses that account's adds for 60 s. Explicit adds during the pause still answer every time (R22). | CHANGED | 10, 12 | 06 ARC-ACC-43, ARC-ACC-67; 02 YT-ADD-37 |
| PAR-CAP-58 | The signed-in account is never fetched or compared with the YouTube session. | The account guard: every write starts with a membership read that must answer for the tab's `datasyncId`. On a mismatch, the tab refuses every job that needs an account until it reloads, and its reload toast answers every explicit press, but auto-add only once per tab (R55). | IMPROVED | 10, 11, 12 | 04 ACC-22; 06 ARC-ACC-47; 02 YT-ADD-10 |
| PAR-CAP-59 | It never reads `ytcfg` or cookies. | It reads `ytcfg` when each job runs. The page may read the session cookie to sign requests where YouTube's own client can't do the job quietly. Disclosures follow the final route table: if a shipped route reads the cookie, it's disclosed (Chrome's "Authentication information" tick, and the cookie lines in the consent text and privacy policy); if none does, all of those are removed (R48). | CHANGED (decided on the user's behalf) · PROVISIONAL (25) | 10 §3 | 06 ARC-ACC-06, ARC-ACC-17, ARC-ACC-18, ARC-ACC-20; 08 REL-CON-12, REL-STORE-17, REL-STORE-20 |

### 1.10 Surfaces

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-60 | A 340 px popup holding every feature setting. | A 360 px popup for "this tab, this account, right now", top to bottom: the account header, the breakage strip, one banner, YouTube and YouTube Music tabs, This video or Playing now, and feature rows that unfold in place. | CHANGED | 09, 15 | 05 UI-POP-01, UI-POP-20 |
| PAR-CAP-61 | The channel card ("THIS VIDEO'S CHANNEL"), shown on `?v=` pages. | The This video card: a status line, a watched meter, and Details (each playlist's outcome, Don't auto-add, Allow/Deny this channel, Save to…). It also shows for Shorts and the miniplayer. | IMPROVED | 09, 15 | 05 UI-POP-12, UI-POP-13, UI-POP-14 |
| PAR-CAP-62 | Settings, in the popup's gear view and the Options tab, with Account, Advanced and Theme. | A Settings page in a tab (`options_ui`, `open_in_tab`). Its left nav has YouTube, YouTube Music, Everywhere, Accounts, Appearance, Privacy & data, Diagnostics and About. It's every feature's home and answers deep links. | CHANGED | 09, 15 | 05 UI-SET-01, UI-SET-03, UI-SET-05; 06 ARC-MAN-01 |
| PAR-CAP-63 | Inside YouTube: the toaster, queue buttons and the right-click takeover. No status indicator, badge, context-menu items or onboarding. | Only switched-on features draw anything. 2.0 adds the watch-page button (auto-add status), the "!" badge and the first-run page (R37). The browser's right-click menu gets a Save to ▸ entry only while Save from the browser's menu is on (PAR-NEW-37; R91). | IMPROVED | 09, 14 | 05 UI-IA-01, UI-IA-02, UI-IA-08; 02 YT-GEN-04, YT-WB-01 |

### 1.11 Platform, manifest, build and release

| ID | 1.5.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-64 | AMO only: 1.4.5 live, with about 66 daily users. Never listed on the Chrome Web Store. | The same AMO listing and gecko ID `{cc70cd21-2cc6-444b-bd89-496909346091}`, plus a first Chrome Web Store listing. Chromium browsers ride along on the Chrome build. | KEPT; Chrome is new (PAR-NEW-14) | map Notes, 19 | 08 REL-STORE-01, REL-STORE-02, REL-CI-16; [spec.md](../spec.md) "Targets" (Chromium browsers) |
| PAR-CAP-65 | Firefox `strict_min_version` 125. | Minimum versions are Chrome 121 and Firefox 140, so Firefox below 140 stays on 1.4.5. | CHANGED (decided on the user's behalf) | 10 §12 | 06 ARC-MAN-06, ARC-MAN-07; 08 REL-CI-09 |
| PAR-CAP-66 | Permissions `activeTab`, `storage`, `identity` and `scripting`, plus Google API hosts. A static content script on `*://*.youtube.com/*`, and the bridge injected as a web-accessible resource. | `storage` and `scripting`. Hosts: `https://www.youtube.com/*` on Chrome (YouTube Music optional), `*://*.youtube.com/*` on Firefox (for a silent update). No content scripts and no web-accessible resources: page scripts are registered at runtime as two registrations per site, the MAIN-world gateway and one ordered isolated list (the core, the kit if needed, then each feature that's on), and only the gateway runs in the MAIN world (R17, R49). `contextMenus` is an optional permission, held only while Save from the browser's menu is on (R91). | CHANGED | 06, 10 §11, 17, ADR-0007, ADR-0008 | 06 ARC-MAN-01, ARC-MAN-02, ARC-MAN-08, ARC-MAN-09, ARC-MOD-01 |
| PAR-CAP-67 | Firefox `data_collection_permissions: none`. | `{ "required": ["none"] }`, and settings sync declares no data type. If an AMO reviewer objects, 08 §13's fallback applies (R83). | KEPT | 10, 16 §11, 19 §11.4 | 08 REL-STORE-34, REL-CON-22; 06 ARC-MAN-01 |
| PAR-CAP-68 | Messaging: untyped messages, a string contract (`"No access token"`) and DOM events to the bridge. | Typed, versioned contracts on three channels, each validated at the receiver. | CHANGED | 17 §6 | 06 ARC-MSG-01, ARC-MSG-07, ARC-MSG-09 |
| PAR-CAP-69 | CI: `tsc`, Vitest, both builds, `jq` manifest checks, and a broker image smoke test. | `bun test` (unit, recorded responses, fake browser and DOM, real browser), `check:manifest`, `check:budget`, a coverage gate, and a daily static watch and browser watch, the browser watch on Chromium only (R40). The broker job goes. | CHANGED | 04, 17 §9–10, 18, 19 §12.1 | 07 Q-CI-1, Q-CI-4, Q-TEST-41, Q-WATCH-14; 08 REL-CI-18, REL-CI-19 |
| PAR-CAP-70 | `release.yml` zips both targets and the AMO sources zip, checks that the sources zip rebuilds, and submits to both stores behind one switch. | The sources rebuild is checked on x86-64 and ARM64. Each store gets its own job and switch, behind protected environments. Chrome moves to Web Store API v2. The rollout is a `1.99.N` beta, then Firefox, a 7-day soak, then Chrome. The first Chrome upload, `v1.99.1`, is made by hand as Unlisted (R21). The release gates include the browser watch, run on the release's own artifacts without rebuilding (R61), and a signed-in live-check record, which every release needs, hotfixes for our own bugs included (R72). | IMPROVED | 19 §6, §12 | 08 REL-CI-27, REL-CI-28, REL-CI-29, REL-CI-34, REL-CHK-01, REL-CHK-02; 07 Q-CI-8, Q-WATCH-21 |

### 1.12 What 1.4.5 users had

| ID | 1.4.5 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-CAP-71 | Auto-add playlists typed in as IDs, which may hold URLs or half-typed IDs. | Cleaned up (`list=` taken out, `^PL…` kept, de-duplicated) into an unclaimed setup. After consent, the signed-in account that owns them claims them. IDs it doesn't own are dropped, and a notice says how many. | KEPT (now per account) | 11, 16 §10.2, 19 §2 | 08 REL-MIG-14, REL-MIG-15; 04 ACC-28, ACC-31, ACC-32 |
| PAR-CAP-72 | One shortcut key with its playlist ID. Ctrl keys never fired. | The key becomes shortcut 1's. Bare and Ctrl keys carry over; punctuation, Esc, Tab, Enter or Space alone, a modifier as the last token, and Ctrl+Alt don't, and the note then says "Your 1.x key ({raw}) can't be used in 2.0. Set a new one in Settings." The playlist goes into the unclaimed setup. For a Ctrl key whose playlist came over too, the note says "{Key} never worked in 1.4.5 because of a bug. It works now." A key with no playlist gets "Your 1.x key {Key} had no playlist. Choose one after you agree." A playlist with no key is kept, and the note says "Your 1.x shortcut had no key. Its playlist is kept; set a key in Settings." (R21) The feature turns on only if both a key and a playlist came over, once the user agrees with its row still ticked. The note's copy and conditions are 08's (R60). | KEPT | 08, 16, 19 | 08 REL-MIG-17, REL-MIG-18, REL-MIG-20, REL-MIG-23, REL-MIG-39, REL-CON-04; 02 YT-KEY-33 |
| PAR-CAP-73 | The required percentage, stored as a string. Absent or empty meant 0 %, although the popup showed 50. | A set value carries over, rounded and clamped to 0–100. Absent, empty or non-numeric becomes 0 % (R21), and only then does the upgrade note ask once about the 50 % / 0 % mismatch, defaulting to what 1.4.5 did (R60). If 1.4.5 never stored a `refreshToken`, it never added anything, so the value becomes 50 % and the question defaults to it (R96). The meaning changes to watch progress. | KEPT (ADR-0009) | 07, 16, 19, ADR-0009 | 08 REL-MIG-11, REL-CON-05, REL-CON-06; 02 YT-AA-43; 04 DATA-49 |
| PAR-CAP-74 | `toastEnabled`, where absent meant off. | Show feedback for auto-add and shortcuts is on only if the value was `true`. Failures show either way. | KEPT | 12, 16, 19 | 08 REL-MIG-11, REL-MIG-12; 04 FT-27 |
| PAR-CAP-75 | Auto-add and the shortcut ran with no consent. | They're paused until the user agrees on the one-time upgrade note, which doubles as consent. Agree then turns on whatever is still ticked: auto-add if any of its playlists carried over, and the shortcut if both its key and its playlist did (R60). Nothing is read from YouTube before that. | CHANGED (ADR-0010) | 09, 19, ADR-0010 | 08 REL-MIG-22, REL-MIG-23, REL-MIG-29, REL-MIG-30, REL-CON-07; 04 FT-43, DATA-50 |
| PAR-CAP-76 | Data API OAuth credentials pasted in by the user. | Deleted. The note says "2.0 needs no Google credentials anymore." and links to removing 1.x's Google access. | RETIRED | map Notes, 19 | 08 REL-MIG-27, REL-MIG-28, REL-CON-04; 05 UI-ONB-06, UI-SET-16 |
| PAR-CAP-77 | Firefox updates. | The update is silent: Firefox keeps `*://*.youtube.com/*`, so nothing new is asked. The migration runs from stored state on every start, not from `onInstalled`: a start with no consent and no upgrade-note record, and a 1.x key in `storage.local`, is an upgrade (R64). A 1.4.5 user with no 1.x key left counts as a fresh install: no tab opens on the update, and the toolbar "!" and "Waiting for your OK" lead them to first run (R76). | KEPT | 06, 10 §11, 16 §10 | 08 REL-CON-22, REL-MIG-01, REL-MIG-02, REL-MIG-03, REL-MIG-05; 04 FT-40, DATA-47, DATA-49 |
| PAR-CAP-78 | 1.4.5 added a copy on every rewatch, and said "Added" even when the add failed. | 2.0 never adds a second copy on a rewatch, and success is read from `status`. The one exception is PROVISIONAL (25: L6): an explicit add whose membership read can't be understood goes ahead, risking one visible duplicate. | CHANGED (PAR-DEF-36) | 12 | 02 YT-ADD-05, YT-ADD-07, YT-ADD-09; 06 ARC-ACC-41 |
| PAR-CAP-79 | 1.2 and earlier supported Watch Later and skipped duplicates by driving YouTube's Save dialog. | Both return through session requests. Driving YouTube's visible UI to do work is forbidden. | CHANGED | map Notes, 01, 12 | 06 ARC-ACC-01, ARC-ACC-08, ARC-ACC-67; 02 YT-ADD-05, YT-ADD-06 |

## 2. Defects

### 2.1 The inventory's Friction list

| ID | Defect (1.5.0) | How 2.0 fixes it | Tickets | Chapter |
|---|---|---|---|---|
| **Feedback** | | | | |
| PAR-DEF-01 | Users who haven't set up auto-add get "No access token found" or "No auto-add playlists selected" on every video, and auto-add has no switch. | Auto-add is a feature with a switch. With no target, or signed out, it tracks nothing and shows nothing, and the popup says what's missing. The signed-out toast is for explicit actions only (R41). | 07, 11, 12 (order of checks, steps 1–2) | 02 YT-AA-02, YT-ADD-02, YT-GEN-08; 04 FT-01, ACC-09, ACC-21 |
| PAR-DEF-02 | Success toasts show the raw video ID and never name the playlist. Duplicate and failure toasts name nothing. | The title in quotes (cut at 40 characters) and the playlists by name. Failures start "Couldn't …" with a reason and at most one action. Auto-add names itself. | 12 | 02 YT-ADD-18, YT-ADD-27, YT-ADD-28; 05 UI-TOAST-11 |
| PAR-DEF-03 | All toasts look alike. | Failures carry YouTube's error glyph and `role="alert"`, never colour alone. Did-nothing answers are neutral. The mark appears only on toasts the user didn't ask for that aren't failures. | 12, 14 | 05 UI-TOAST-06, UI-TOAST-07; 02 YT-ADD-16, YT-ADD-17 |
| PAR-DEF-04 | Queue-button feedback is colour only. | Five states, each with a glyph and an accessible label, and a toast on by default. | 12, 14, 15 | 02 YT-Q-07, YT-Q-08; 05 UI-YT-13 |
| PAR-DEF-05 | In-page toasts follow the OS theme, not YouTube's. | In-page UI reads YouTube's theme variables, with a fallback palette picked by `html[dark]`. | map Notes, 14 | 05 UI-YT-02, UI-TOAST-13; 02 YT-BRK-07 |
| **Shortcut** | | | | |
| PAR-DEF-06 | It's unset by default. | Turning Playlist shortcuts on presets Alt+W → Watch later on every account. The feature itself starts off, per the first-run rule. | 08 | 02 YT-KEY-02, YT-GEN-02; 04 FT-01, FT-04 |
| PAR-DEF-07 | It fires while typing in comments and other fields, and swallows the key. | Keys are ignored when the event's composed path holds any editable field, during IME composition, while a menu or dialog is open, and on auto-repeat. Only a matching key is consumed. | 08 | 02 YT-KEY-19, YT-KEY-21 |
| PAR-DEF-08 | It can't be cleared or cancelled, and Escape and Tab can be recorded. | The recorder has Clear (×), and Esc, Tab or a click elsewhere cancels. Enter or Space alone and Ctrl+Alt are refused. | 08, 15 | 05 UI-PICK-23; 02 YT-KEY-28, YT-KEY-29 |
| **Settings and state** | | | | |
| PAR-DEF-09 | Emptying the percentage field stores 0 at once, so open tabs auto-add on the next `timeupdate`. | The field saves on Enter or blur, and empty or out-of-range input reverts. The slider saves on release. | 07, 15 | 02 YT-AA-34; 05 UI-PICK-22 |
| PAR-DEF-10 | A deleted playlist, or one belonging to another account, stays selected but invisible, can't be unchecked, and adds to it fail. | The add's own answer marks a playlist *Missing* or *Full*. Marked playlists sit first in the list with Remove, and also show a banner and the "!" badge. Auto-add's failure toasts for them are rate-limited (R22). Failure toasts carry Settings, which opens `#feature-<id>&playlist=<playlistId>` and highlights the playlist's row (R38). They're never removed automatically; a mark clears when the playlist shows up in a list again or an add to it succeeds. Other accounts' playlists live in their own setups, so they never show under the wrong account. | 09, 11, 12, 15 | 02 YT-ADD-25, YT-ADD-29, YT-ADD-36; 05 UI-PICK-20, UI-IA-09; 04 ACC-06, DATA-21, FT-57 |
| PAR-DEF-11 | The free-text "Playlist ID" field appears whenever the list is empty, and saves unvalidated input on every keystroke. | There are no free-text IDs: playlists are chosen by title from the account's list. With no tab, cached lists show read-only with Open YouTube. 1.4.5's typed IDs are cleaned up on upgrade. | 08, 09, 16 §10.2 | 05 UI-PICK-19, UI-PICK-20, UI-POP-27; 08 REL-MIG-14, REL-MIG-15 |
| PAR-DEF-12 | The popup reads storage once. Nothing refreshes after signing in or out or clearing data from its gear, and its stale state is written back on the next toggle. | The UI loads once, then follows `storage.onChanged` through `Backend.watch`. Every write is a `Change` sent to the background, the only writer. Signing in and out no longer happens in the popup. | 16, 17 §3.5 | 06 ARC-MOD-19, ARC-MOD-23, ARC-MOD-24; 04 DATA-02 |
| **Layout** | | | | |
| PAR-DEF-13 | The popup holds every feature setting, while ⚙ Settings holds only the account and theme, and the Options page has no feature settings. | Settings is every feature's home. The popup holds this tab's account, the switches and the per-account playlist choices, which Settings mirrors. | 09, 15 | 05 UI-IA-03, UI-IA-04, UI-SET-10 |
| PAR-DEF-14 | The playlist lists have no search or sort, and sit in fixed-height scroll boxes. | Search is always in the picker, and in the auto-add list past 8 playlists. The order is Watch later first, then YouTube's Save-dialog order, and a "Sort A–Z" toggle in the picker's header sorts by title, stored per device (R39). The picker is a sheet, and the popup grows to 600 px. | 12, 15 | 05 UI-PICK-04, UI-PICK-20, UI-PICK-26; 02 YT-PK-01, YT-PK-14 |
| PAR-DEF-15 | The channel card says "Check an auto-add playlist below…" whenever the list isn't loaded, even if playlists are selected. | This video's status comes from the tab's own state (ticket 07's states), not from the list cache. When nothing is tracked, it says what's missing. This video needs a tab; with none, only the playlist lists show cached data, stamped. | 07, 09, 15 | 05 UI-POP-12, UI-POP-27; 02 YT-AA-38; 04 FT-54 |
| PAR-DEF-16 | The channel card's pill says "Allow" while the editor says "Allow only". | "Allow only" and "Deny" name the modes everywhere. The pills read "Allow only · 3", "Deny · 1" and "All channels · 3 kept". | 15 | 05 UI-PICK-20, UI-PICK-21; 02 YT-CF-01, YT-CF-11 |
| PAR-DEF-17 | The error "Not authorized. Sign in from Options." points elsewhere, and there's no link. | There's no extension sign-in. Each banner carries its own action, e.g. "You're not signed in to YouTube in this tab." with Sign in. Failure toasts carry Sign in, Settings, Choose or Reload, and Settings lands on the playlist itself (R38). | 09, 11, 12, 15 | 05 UI-POP-10, UI-TOAST-05, UI-IA-09; 02 YT-ADD-28, YT-ADD-29 |
| **Clear All Data** | | | | |
| PAR-DEF-18 | It's only reachable while signed in, and has no confirmation. | It's in Settings › Privacy & data, always reachable, with a confirmation that names what goes. | 09, 15, 16 §9.1 | 04 DATA-36, DATA-37; 05 UI-SET-16 |
| PAR-DEF-19 | It also wipes `storage.sync`, so the theme is cleared on other synced browsers. | It resets this browser only. The synced copy is deleted only if "Also delete synced settings from all your browsers" is ticked, which is one of the only two `storage.sync` calls allowed while sync is off (R59). | 16 §9.1 | 04 DATA-38, DATA-39, FT-21; 05 UI-SET-16 |
| **Account panel** | | | | |
| PAR-DEF-20 | It shows no account identity, and a revoked token still shows "Signed in". | The header shows the tab's account: avatar, name and @handle. Signed-in state is read from the page at every load. There are no tokens. | 10, 11, 15 | 04 ACC-02, ACC-17; 05 UI-POP-06 |
| PAR-DEF-21 | It flashes the signed-out UI before the check resolves. | A pulsing placeholder shows while the account is read, and nothing shows before consent. | 11, 15 | 05 UI-POP-06, UI-POP-26; 04 ACC-17 |
| **Duplicates and queue** | | | | |
| PAR-DEF-22 | The duplicate check never asks YouTube, so adds made elsewhere are invisible and removed videos stay blocked forever. | Membership is read from YouTube before every add, and nothing about adds is stored locally. | 12 | 02 YT-ADD-06, YT-ADD-46; 04 DATA-22 |
| PAR-DEF-23 | The card menu hijacks right-click on links inside cards. | Links to anything other than the card's video always keep the browser's menu. An option extends this to the thumbnail and title. | 14 | 02 YT-CM-01, YT-CM-03; 05 UI-YT-25 |
| PAR-DEF-24 | The queue button reports success unconfirmed when a queue is already open. | Success counts only once the queue's data shows the video. Otherwise the button shows "Sent, not confirmed", and a toast shows even with feedback off. | 10, 12, 14 · PROVISIONAL (25, L8) | 02 YT-Q-06, YT-Q-07, YT-Q-08; 06 ARC-ACC-35 |
| **Unverified risks** | | | | |
| PAR-DEF-25 | Ads may drive the auto-add trigger. | Ads never count. Nothing is read while `ad-showing` is set, while the presenting player type is 2, or between `onAdStart` and `onAdEnd`. Position comes from the player, not the `<video>`. | 07 · stitched and Shorts ads PROVISIONAL (25) | 02 YT-AA-19, YT-AA-20, YT-AA-21, YT-AA-22 |
| PAR-DEF-26 | An inline preview `<video>` may drive the trigger. 1.5.0 watches the first `<video>` and never checks that it's playing the video. | Only `#movie_player` and `#shorts-player` count, and the video ID must match the player's. | 07 | 02 YT-AA-08, YT-AA-09, YT-AA-10 |
| PAR-DEF-27 | A 100 % threshold may never fire. | The goal is capped at length − 2 s for videos 3 s or longer, and at the length for shorter ones (R27). | 07 | 02 YT-AA-17, YT-AA-32 |
| PAR-DEF-28 | Sign-in runs in the popup, so it can be lost if the popup closes. | There's no extension sign-in: signing in happens on YouTube's own page. The one prompt left that a click starts is site access, from the popup, Settings, first run's Agree or the upgrade note, and its `permissions.request` runs first in the click handler. On Chrome, YouTube Music access is asked from the click that switches on the first thing that needs it, never from the section switch (R53). On Firefox the sync switch raises no data-collection prompt, because settings sync declares no data type (R83). | 06, 10 §9, ADR-0001 | 06 ARC-MAN-03, ARC-ACC-61; 04 ACC-04, FT-44, FT-50, SYNC-26 |
| **Dead or unreachable code** | | | | |
| PAR-DEF-29 | `countCached`, the `byPlaylist` index and `addedAt` are never read. | The IndexedDB store is gone, along with any local record of adds. The database is deleted on upgrade. | 12, 16 §10.2 | 04 DATA-01, DATA-22, DATA-49; 08 REL-MIG-08 |
| PAR-DEF-30 | The `scripting` permission is unused. | It's now used to register each feature's page scripts at runtime and to inject the lazy popovers. | 10 §8, §11; 14; 17 | 06 ARC-MAN-12, ARC-MAN-13, ARC-MAN-16 |
| PAR-DEF-31 | The popup's lazy "Loading settings…" fallback can't be reached, although the README says SettingsPanel is lazy-loaded. | The popup and Settings are rebuilt. Lazy parts are defined in ticket 17 §3.5 and checked by ticket 24's budget and by the real-browser test that every built page renders (R52). The README is rewritten for 2.0 as a whole, as part of the release, so its 1.5.0 architecture notes go (R39). | 17, 19 §13, 24 | 08 REL-CI-52, REL-CI-54; 07 Q-TEST-18, Q-PERF-37 |
| **Untested** | | | | |
| PAR-DEF-32 | The content script and the MAIN-world bridge have no tests: the watch trigger, the shortcut wiring, the toast receiver and the queue bridge. | The gateway is tested through a page port against recorded YouTube answers. The site core, kit and features run in happy-dom. A real-browser layer tests the built extension. A daily signed-out static watch and browser watch run in CI, the browser watch on Chromium only; Firefox runs in the pre-release real-browser check (R40). The developer runs a signed-in live check before every release, hotfixes for our own bugs included, and the release is gated on its record (R72). The watch tracker and key matcher are pure modules. | 04, 17 §9, 18 | 07 Q-TEST-2, Q-TEST-4, Q-TEST-10, Q-TEST-16, Q-CI-4, Q-WATCH-12, Q-WATCH-14, Q-WATCH-21; 08 REL-CI-27 |

### 2.2 Other defects in the inventory's body

These aren't on the Friction list, but the inventory describes them, and 2.0's decisions fix them.

| ID | Defect | How 2.0 fixes it | Tickets | Chapter |
|---|---|---|---|---|
| PAR-DEF-33 | A network failure skips the remaining playlists, leaving only a `console.error`. | Playlists are handled independently, so one failure never stops the others. | 12 | 02 YT-ADD-02, YT-ADD-15, YT-ADD-42 |
| PAR-DEF-34 | Two concurrent adds can both pass the duplicate check. | One coordinator per profile orders adds by account, playlist and video. The second resolves to "already in", or to silence for auto-add. | 12 | 02 YT-ADD-40, YT-ADD-41, YT-ADD-43 |
| PAR-DEF-35 | The duplicate cache fails open if the database won't open. | There's no cache. If membership can't be read, explicit adds go ahead; auto-add goes ahead only if YouTube rejects duplicates itself, and otherwise fails with "Couldn't check “{title}”'s playlists, so auto-add didn't run." (R27). A read that fails outright never leads to a write. | 12 · PROVISIONAL (25) | 02 YT-ADD-07, YT-ADD-28 |
| PAR-DEF-36 | 1.4.5 said "Added" even when the add had failed. | Success is read from YouTube's `status`, never from the HTTP code. | 12 | 02 YT-ADD-09; 06 ARC-ACC-41 |
| PAR-DEF-37 | `session:channelCache` is never pruned. | It's removed, and 2.0 keeps no channel cache. | 16 | 04 DATA-23, DATA-49; 08 REL-MIG-08 |
| PAR-DEF-38 | Storage has no versions or migrations, and the old `localStorage.cachedVideos` is never cleared. | A `schema` marker and migrations run on every start. Legacy `localStorage` keys are removed by the first extension page that opens. | 16 §10 | 04 DATA-46, DATA-47, DATA-49; 08 REL-MIG-01, REL-MIG-10 |
| PAR-DEF-39 | Tokens and the client secret are stored in plaintext, and Sign Out never revokes them. | There are no tokens. Old ones are deleted on upgrade, with a link to Google's permissions page. | 19 §2.5 | 08 REL-MIG-08, REL-MIG-27, REL-MIG-28 |
| PAR-DEF-40 | The broker's `/auth/refresh` isn't checked against `ALLOWED_EXTENSION_IDS`, and CI and release builds point it at `localhost:3847`. | The broker is deleted. | 19 §13 | 08 REL-CI-51, REL-CI-52; 07 Q-CI-2 |
| PAR-DEF-41 | 1.5.0's queue bridge likely does nothing on today's YouTube, because `element.resolveCommand` is gone. | The gateway reaches YouTube's resolver by shape on first use, caches it for the page and retries once. If several properties match, the first whose `resolveCommand` is a function is used, and `resolver-ambiguous` is recorded for diagnostics (R34, R51, R66). Ticket 18's watch checks it daily. | 10, 17, 18 · PROVISIONAL (25) | 06 ARC-ACC-13, ARC-ACC-14, ARC-ACC-16; 07 Q-WATCH-8, Q-WATCH-10, Q-WATCH-24 |
| PAR-DEF-42 | When YouTube changes, features break silently: buttons go missing, the queue gives a false "ok", triggers never arm. | Breakage signals give each feature a working, partly or not-working status, shown in the page, on the badge, in the popup and in Settings. Nothing fails silently. | 18, ADR-0005 | 04 HEALTH-07, HEALTH-13, HEALTH-15; 07 Q-WATCH-23 |
| PAR-DEF-43 | 1.4.5's popup showed 50 % while auto-adding at 0 %. | The upgrade note states a set value. When the value was unset or isn't a number, which is when 1.4.5 showed 50 % but added at 0 %, it asks once instead (R21, R60). For an upgrader whose 1.4.5 never got access, the default is 50 % (R96). | 19 §2.3, 30, ADR-0009 | 08 REL-CON-05, REL-CON-06, REL-MIG-11, REL-MIG-40; 04 DATA-49 |

## 3. New capabilities and improvements in 2.0

### 3.1 Approved new capabilities

The map's Notes approve these.

| ID | Capability | Status | Tickets | Chapter |
|---|---|---|---|---|
| PAR-NEW-01 | Watch Later as a target for auto-add, shortcuts, quick-save and the picker. A shortcut set to Watch later works on every account. | APPROVED | 01, 08, 10, 12 | 02 YT-KEY-12, YT-PK-01; 04 ACC-10, DATA-21 |
| PAR-NEW-02 | Quick-save on thumbnails: a split button. One click saves to the quick-save playlist, and ▾ opens the picker. It's in choose mode until a playlist is set. "On Shorts shelves too" is an option, off by default (R11). | APPROVED | 09, 12, 14 | 02 YT-QS-01, YT-QS-04, YT-QS-10; 05 UI-YT-14 |
| PAR-NEW-03 | The playlist picker ("Save to…"): Watch later first, search, membership ticks, each playlist's key, a pin for one-click save, and New playlist. Its header has ↻ Refresh and Sort A–Z (R39). Alt+Shift+P opens it. | APPROVED (part of quick-save) | 08, 12, 14, 15 | 02 YT-PK-01, YT-PK-07, YT-PK-08, YT-PK-13, YT-PK-14; 05 UI-PICK-04, UI-PICK-05, UI-PICK-25, UI-PICK-26 |
| PAR-NEW-04 | A separate setup per YouTube account, keyed by a digest of `DATASYNC_ID`. It comes with the account header, "Show the setup for", and removing a setup. | APPROVED | 11, 16, ADR-0003 | 04 ACC-03, ACC-15, ACC-25; 05 UI-POP-07 |
| PAR-NEW-05 | Several playlist shortcuts, up to 20, each with a key, an optional label and a playlist per account (AMO review request). | APPROVED | 08, ADR-0004 | 02 YT-KEY-07, YT-KEY-08, YT-KEY-14 |
| PAR-NEW-06 | Settings sync across browsers: a feature in which the local copy is the truth, the newest edit wins, the user chooses a side on joining, and the budget is 96 KiB. At first run the synced copy may be read before Agree, to pre-tick features chosen elsewhere, but nothing is pushed or stored until Agree (R9). That read and Clear all data with its box ticked are the only `storage.sync` calls while sync is off (R59). On Firefox it declares no data type, so switching it on asks Firefox for nothing (R83). | APPROVED | 16, ADR-0006 | 04 SYNC-08, SYNC-11, SYNC-14, SYNC-26 |
| PAR-NEW-07 | Auto-add on Shorts, chosen per playlist (Videos / Shorts / Both). | APPROVED | 07 | 02 YT-AA-26, YT-AA-27, YT-AA-29 |
| PAR-NEW-08 | Creating playlists from every chooser and from the picker. Private by default, then the last visibility picked. | APPROVED | 10, 12, 14, 15 | 02 YT-NEW-01, YT-NEW-03; 05 UI-PICK-11; 04 DATA-12 |
| PAR-NEW-09 | A YouTube Music section with its own switch, popup tab and Settings section. The switch (`musicSection`) is a synced shared setting, on by default. Off, nothing of ours runs on music.youtube.com, including playlist shortcuts' "Also on YouTube Music" (R1). Its Playing now row shows whenever the section is on and has access, whichever in-page features are on (R8). | APPROVED | 09, 15, 26 | 03 YM-FEAT-5, YM-FEAT-6, YM-POP-10; 05 UI-IA-05, UI-POP-16, UI-SET-11 |
| PAR-NEW-10 | YouTube Music quick actions: Play next, Add to queue, Save to playlist (split button and picker), Like / unlike, Remove from queue, and Save on the player bar. Each button is chosen separately (default: Play next and Add to queue). Albums and playlists go in as one block. Row buttons join the row on hover (R35). The Remove key on an item that isn't queued says "Point at a song in the queue to remove it" (R67). | APPROVED | 21, 26, 27 | 03 YM-FEAT-2, YM-Q-3, YM-QA-7, YM-RM-5, YM-BAR-2 |
| PAR-NEW-11 | Quick-action shortcuts: Alt+N, Q, P, Shift+P, L and R. The undo key isn't one of them: it belongs to no feature (R44). Tooltips show a key only while the feature is on (R6). | APPROVED | 08, 26 | 03 YM-FEAT-3, YM-KEY-1, YM-QA-12 |
| PAR-NEW-12 | Playlist shortcuts also on YouTube Music ("Also on YouTube Music", on by default). It's held while the YouTube Music section is off (R1). On Chrome, switching it on asks for YouTube Music access, and missing access raises the "!" while it and Playlist shortcuts are on (R53). If the prompt raised by switching Playlist shortcuts on is denied, Playlist shortcuts goes on and "Also on YouTube Music" turns off, with "No access to YouTube Music, so shortcuts work on YouTube only." (R71). Thumbnail quick-save stays YouTube-only. | APPROVED | 08, 26 | 03 YM-PS-1, YM-PS-2, YM-PS-9; 02 YT-KEY-02, YT-KEY-15; 04 FT-44, FT-47, FT-52 |
| PAR-NEW-13 | The installed YouTube Music app is first-class. | APPROVED · signed-in check PROVISIONAL (25) | 09, 26 | 03 YM-APP-1, YM-APP-2, YM-APP-4; 05 UI-IA-07 |
| PAR-NEW-14 | A first Chrome Web Store listing. | APPROVED | map Notes, 19 | 08 REL-STORE-01, REL-CI-16, REL-CHK-01 |

### 3.2 Improvements adopted in tickets and resolutions

These improve existing capabilities, or are required by policy, so no separate go-ahead was needed.

| ID | Improvement | Status | Tickets | Chapter |
|---|---|---|---|---|
| PAR-NEW-15 | Undo on every add toast, except a result that both saved and failed. The undo key (Alt+U unless changed or cleared) undoes the toast on screen, on both sites, whichever feature raised it (R2). It belongs to no feature: it's preset at install and set in Settings › Everywhere (R44). | ADOPTED | 08, 12, 14 | 02 YT-ADD-30, YT-KEY-05, YT-KEY-25; 03 YM-KEY-4; 04 FT-05; 05 UI-TOAST-10 |
| PAR-NEW-16 | Undo for YouTube's queue button, and quiet queue adds (no YouTube toast). After Undo the button is clickable again (R27). YouTube's own toast after a quiet add or its Undo records `quiet-route-noisy` (R40, R51). | ADOPTED · PROVISIONAL (25, Q1–Q8) | 12, 14, 29 | 02 YT-Q-05, YT-Q-09; 06 ARC-ACC-33, ARC-ACC-34, ARC-ACC-36; 07 Q-WATCH-28 |
| PAR-NEW-17 | YouTube Music queue moves: on a queued item, Play next and Add to queue move it, with Undo. Remove's Undo restores the item's position. While casting, every queue edit and its Undo is unavailable, inserts included, with one message (R5, R46). | ADOPTED | 26, 28 | 03 YM-QA-4, YM-MOVE-6, YM-RM-3, YM-CAST-2 |
| PAR-NEW-18 | Auto-add Pause / Resume, until the user resumes or the browser restarts (an extension update also ends it, R57), and "Don't auto-add this video" (a session skip). Undoing an auto-add sets the same skip. A skip keeps the video's remembered progress, and undoing it checks the goal at once (R23, R43). | ADOPTED | 07, 09, 12, 14 | 02 YT-AA-03, YT-AA-04, YT-AA-05; 04 DATA-11 |
| PAR-NEW-19 | A required-percentage override per playlist. | ADOPTED | 07 | 02 YT-AA-31 |
| PAR-NEW-20 | Watch progress is remembered locally for up to 30 days, per account. It's never stored from private windows, and switching auto-add off deletes it. | ADOPTED | 07, 16 | 02 YT-AA-01, YT-AA-35; 04 DATA-24, DATA-28, DATA-29 |
| PAR-NEW-21 | The watch-page button: its own feature, a status pill with pie progress after Share, and a menu that repeats This video. "On Shorts too" is an option, off by default (R11). Its menu's Save rows are its own, whether or not quick-save is on, and use its own Show feedback, on by default (R27, R42). They're explicit saves, so their failures use the add flow's failure copy; "Couldn't save “{title}”. Try again." is the pill's status line when auto-add failed (R70). It hides where it would push YouTube's Save into "…". | ADOPTED (the watch-page slot named in the map's feature list) | 09, 14 | 02 YT-WB-01, YT-WB-04, YT-WB-07, YT-WB-09, YT-AA-38; 05 UI-YT-16, UI-YT-18, UI-YT-21, UI-YT-23 |
| PAR-NEW-22 | Feature health: per-feature status (R50), the in-page notice, the amber badge, and Diagnostics with Check now, a copyable report and the version, with "(beta)" on betas (R65). A YouTube Music action that's unavailable in a tab hides its buttons there, but its key stays caught and each press answers "{Action} isn't working right now. The popup shows why." (R68). Check now with no YouTube tab is disabled, with "Open YouTube to check" (R15). No telemetry. | ADOPTED | 18, ADR-0005 | 04 HEALTH-07, HEALTH-10, HEALTH-15, HEALTH-22, HEALTH-23; 03 YM-KEY-12; 07 Q-WATCH-23, Q-WATCH-34 |
| PAR-NEW-23 | A toolbar "!" badge when the user must act: consent, site access, a Missing or Full playlist, or a feature that isn't working. One shows at a time: consent or upgrade, then site access, then not working, then Missing or Full. "Needs you" is violet and "not working" amber (R12). Missing site access shows on every tab, and missing YouTube Music access only while something that needs it is on (R53). | ADOPTED | 09, 18 | 05 UI-IA-08; 04 FT-46, FT-47, FT-57, FT-58, HEALTH-15 |
| PAR-NEW-24 | First run (pick features → consent → finish) on the first-run page. One versioned consent gates everything, and the upgrade note doubles as consent. | ADOPTED (required by store policy) | 09, 15, 19, ADR-0010 | 05 UI-ONB-03, UI-ONB-04, UI-ONB-06; 08 REL-CON-07, REL-CON-16 |
| PAR-NEW-25 | Every part can be switched off, a switched-off feature injects nothing, and Settings shows each feature's footprint tag, one of four (R54). | ADOPTED (the user's principle) | map Notes, 10 §8, 15, 17, 24 | 04 FT-01, FT-07, FT-14, FT-15; 06 ARC-MAN-14, ARC-REG-07 |
| PAR-NEW-26 | A key to open the popup, set in the browser's own shortcut settings (`_execute_action`, no default key). | ADOPTED | 08 | 02 YT-KEY-06; 06 ARC-MAN-05; 05 UI-SET-12 |
| PAR-NEW-27 | Private windows: 2.0 runs there only if the user allows it. Setups are read-only there, and nothing from the session is stored. Shared-settings changes made there are saved, because they carry nothing from the session (R58). The picker's pin is disabled there, and its tooltip says "Quick-save playlists can't be changed in a private window." (R69). Saving those shared settings is settled, no longer provisional (R83). | ADOPTED | 11, 16 §8 | 04 ACC-36, ACC-37, ACC-38, DATA-31, DATA-32; 06 ARC-ACC-62, ARC-ACC-64; 02 YT-PK-08; 03 YM-ACC-8; 05 UI-PICK-10 |
| PAR-NEW-28 | Site-access handling: Give access per site, optional YouTube Music access on Chrome, and `addHostAccessRequest` on Chrome 133+. On Chrome, YouTube Music access is asked from the click that switches on the first thing that needs it; the section switch never asks (R53). If it's denied at first run, consent and the other ticks still apply, and what needs it is saved on but held with "Needs site access" and **Give access** (R14). Denied from a switch, that switch stays off, except that Playlist shortcuts' own switch goes on with "Also on YouTube Music" off (R71). | ADOPTED (`addHostAccessRequest` PROVISIONAL in 09) | 09, 10 §9 | 04 FT-13, FT-44, FT-50, FT-52, FT-53; 06 ARC-MAN-03, ARC-ACC-61; 03 YM-FEAT-10 |
| PAR-NEW-29 | Performance: with everything on, about half of 1.5.0's weight on YouTube (at most 49 KB gzip and 18 ms at load, against ticket 24's measured 98 KB and 55 ms), and at most 43 KB on YouTube Music (R30). Timing budgets are gated on Chromium (R31). The popup's first frame comes within 60 ms. | ADOPTED | 24 | 07 Q-PERF-12, Q-PERF-13, Q-PERF-28, Q-PERF-31 |
| PAR-NEW-30 | Shortcuts act on the pointed-at item: cards, the sidebar, end-screen tiles, Shorts shelves, and the miniplayer's video. | ADOPTED | 08 | 02 YT-ITEM-06, YT-KEY-16, YT-KEY-17 |
| PAR-NEW-40 | A "Sort A–Z" toggle in the picker's header, stored per device and never synced. Off, rows keep YouTube's Save-dialog order. It answers the Friction list's "no sort" (PAR-DEF-14). (R39) | ADOPTED | 12, 15 | 05 UI-PICK-26; 02 YT-PK-14; 03 YM-PICK-3 |

### 3.3 Decided by the user (2026-10-20)

These waited on the user's go-ahead. The user answered on 2026-10-20 ([R84–R99](resolutions.md#the-users-decisions-of-2026-10-20-r84r99)): eight are in 2.0, and one isn't. The same day the user approved porting GatherTube, with exactly two additions and the Shuffled order ([ticket 31](../issues/31-gathertube.md); [R120–R139](resolutions.md#gathertube-r120r139)): PAR-NEW-42 to PAR-NEW-45. GatherTube's own items are §4.

| ID | Capability | Status | Tickets | Chapter |
|---|---|---|---|---|
| PAR-NEW-31 | Unticking a playlist in the picker removes the video from it, as YouTube's Save dialog does, with an Undo toast in pages and an inline Undo in the popup's sheet. (R84) | APPROVED | 12, 14, 15, 26 | 02 YT-PK-05; 03 YM-PICK-8; 05 UI-PICK-09 |
| PAR-NEW-32 | More YouTube Music quick actions: Save to library, Start mix, Go to album and Go to artist, as buttons and keys, all off by default, offered where YouTube Music's own ⋮ offers them. (R85) | APPROVED | 21, 26 | 03 §21 (YM-MORE-1 to YM-MORE-9); 05 UI-YM-04, UI-SET-11; 06 §6.2.7 |
| PAR-NEW-33 | A Recent adds list in the popup, kept until the browser closes, so a missed toast can be looked up. On by default, switchable in Privacy & data. (R86) | APPROVED | 09, 12 | 04 DATA-52; 05 UI-POP-33, UI-POP-34 |
| PAR-NEW-34 | Live streams and premieres counting for auto-add, e.g. after N minutes or credited to the replay. (R87) | DECLINED | 07 | 02 YT-AA-24 |
| PAR-NEW-35 | Keys from any tab: three browser commands with no default key, for the playing song and the current video, set in the browser's own shortcut settings. In 2.0.0. (R88) | APPROVED | 08, 30 | 02 §2.14 (YT-ANY-01 to YT-ANY-09); 03 §22; 04 FT-01, FT-59; 06 ARC-MAN-19, ARC-ACC-69 |
| PAR-NEW-36 | Exporting and importing settings to a file. (R90) | APPROVED | 16 | 04 DATA-53 to DATA-55; 05 UI-SET-22; 06 ARC-MOD-36 |
| PAR-NEW-37 | Save from the browser's menu: a "Save to ▸" entry in the browser's right-click menu, off by default, through the optional `contextMenus` permission, which shows no prompt on either browser. (R91) | APPROVED | 09, 10 §11 | 02 §2.15 (YT-BM-01 to YT-BM-09); 04 FT-60; 06 ARC-MAN-20 |
| PAR-NEW-38 | A toolbar tick when this tab's video was auto-added, and "paused" shown on the icon, both on by default and both switchable. (R92) | APPROVED | 09, 15 | 02 YT-AA-42; 04 FT-01, FT-57; 05 UI-IA-08 |
| PAR-NEW-39 | 2.0 is built ready for translation, and ships English only. (R93) | APPROVED | 26 (via for-the-user) | 05 UI-RULE-43; 06 ARC-MAN-21, ARC-MOD-35; 07 Q-TEST-44 |
| PAR-NEW-41 | Report a problem: a chooser of three kinds with directions, opening GitHub issue forms prefilled with the version, browser, feature and status; no support e-mail. (R89) | APPROVED | 18, 19 | 04 HEALTH-27; 05 UI-SET-21; 08 REL-STORE-35 to REL-STORE-37 |
| PAR-NEW-42 | Gather tabs, a port of GatherTube (MIT, by Karim Elgazar): one opt-in feature that gathers the YouTube videos open in a window into YouTube's player, YouTube's queue or a playlist, and can close their tabs. Credited, with nothing copied. Every GatherTube item is in §4. (R120) | APPROVED | 31 | 02 §2.16 (YT-GT-01 to YT-GT-36); 04 FT-01, FT-63; 05 UI-POP-35 to UI-POP-37, UI-SET-24; 06 ARC-MOD-40; 08 REL-STORE-38 |
| PAR-NEW-43 | Gathering into a playlist (the first addition): one gather playlist per account, filled through the add flow as one batch, with Undo that also reopens the closed tabs. (R125 to R127) | APPROVED · PROVISIONAL (25: G1, G2, G5, G7) | 31 | 02 YT-GT-15, YT-GT-16, YT-GT-18 to YT-GT-21; 05 UI-PICK-27; 06 ARC-ACC-73, ARC-ACC-76 |
| PAR-NEW-44 | Automatic gathering (the second addition): three triggers, each off by default (tabs unvisited for a while, a tab opened in the background, a window reaching N video tabs), always into the gather playlist and always closing what it saved, within the running-cost rules. (R128 to R133) | APPROVED · PROVISIONAL (25: G6) | 31, 33 | 02 YT-GT-22 to YT-GT-30; 04 FT-64; 07 Q-PERF-58, Q-PERF-66 |
| PAR-NEW-45 | The Shuffled gather order, so GatherTube's shuffle survives without its player page. (R122) | APPROVED | 31 | 02 YT-GT-08, YT-GT-10 |

**User decisions that shape approved items** (not new capabilities):
- **The name and mark:** ticket 22, now in a second naming round. The spec keeps "Playlist Pigeon for YouTube™" as a placeholder (05 UI-BRAND-01, UI-BRAND-03). **PENDING USER.**
- **Narrow Quick picks rows on YouTube Music:** every switched-on button stays (R94; 03 YM-NARROW-1; 05 UI-YM-10).
- **A support e-mail beside GitHub issues:** none (R89; 04 HEALTH-22; 08 REL-STORE-35).
- **The store listings and the upgrade note** (ticket 30): the listings lead with saving (R95), never-authorised upgraders default to 50 % (R96; PAR-CAP-73), the note reopens once if nobody saw it and asks to be pinned (R97), and its tab title names the old name (R98).

## 4. GatherTube

The user approved porting every capability of [GatherTube](https://github.com/karimelgazar/gathertube), by Karim Elgazar (MIT), on 2026-10-20 ([ticket 31](../issues/31-gathertube.md); R120). This section lists every item of GatherTube 1.1.0, from the research's inventory ([`docs/research/gathertube.md`](../../../docs/research/gathertube.md) §2), and where it went in 2.0 ([02 §2.16](02-youtube.md#216-gather-tabs)). "GatherTube" means both of its builds: 1.1.0 on Chrome (its repository's root) and 1.1.1 on Firefox (`firefox-build/`); where they differ, the row says so. GatherTube's own item numbers (G1, P1, S1) are in brackets, and the status words are the ones above. Its two additions and the Shuffled order are new capabilities: PAR-NEW-43 to PAR-NEW-45.

### 4.1 Gathering

| ID | GatherTube 1.1.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-GT-01 | [G1] "Gather YT Videos" in the popup; Enter anywhere in the popup gathers. | A **Gather** button on Gather tabs' popup row. Enter gathers while the feature is on and nothing in the popup has focus; Enter on a focused control keeps its own meaning, because the 2.0 popup has many controls. (R120) | CHANGED | 31 | 02 YT-GT-02, YT-GT-34; 05 UI-POP-35 |
| PAR-GT-02 | [G2] The current window only ("all windows" was removed). | The popup's own window, passed explicitly, never guessed. Automatic gathering looks at one window at a time. (R121) | KEPT | 31 | 02 YT-GT-06; 06 ARC-ACC-72 |
| PAR-GT-03 | [G3] Video tabs: watch pages on any subdomain (`www.`, `m.`, `music.`), `/live/ID` and `youtu.be/ID`. | Watch and live pages on youtube.com, and watch pages on music.youtube.com while the YouTube Music section is on and has access. A `youtu.be` tab counts once it has reached youtube.com. m.youtube.com isn't gathered: 2.0 doesn't cover it, and Chrome's host access can't see it. (R121) | KEPT within 2.0's site access; m.youtube.com CHANGED | 31 | 02 YT-GT-03, YT-GT-04 |
| PAR-GT-04 | [G4] The title fallback: a non-video tab whose title mentions YouTube is gathered with any 11-character word of its title as the ID; suspender-parked tabs are read from the address inside theirs. | Only a tab's address counts. Suspender-parked tabs aren't gathered: reading them would need the `tabs` permission and its "Read your browsing history" warning (the user's answer 4). The browser's own sleeping tabs are gathered. (R121) | DROPPED | 31 | 02 YT-GT-04; 06 ARC-MAN-25 |
| PAR-GT-05 | [G5] Duplicates removed by video ID, keeping the first after sorting. | The same. Every tab of that video closes with it. (R121) | KEPT | 31 | 02 YT-GT-07 |
| PAR-GT-06 | [G6] Six orders, default Newest tabs first. | The same six, with the same names and default, plus Shuffled (PAR-NEW-45). English first and non-English first use the browser's own language detection (PAR-GT-44). (R122) | KEPT; language orders IMPROVED | 31 | 02 YT-GT-08, YT-GT-09 |
| PAR-GT-07 | [G7] Two destinations, "Queue behavior": YouTube Native (the default) and Embedded Player. | Three: YouTube's player (the default, as YouTube Native), YouTube's queue (in place of the embedded player, the user's answer 1), and the gather playlist (PAR-NEW-43). (R123) | CHANGED | 31 | 02 YT-GT-11 to YT-GT-15; 05 UI-POP-36 |
| PAR-GT-08 | [G8] YouTube Native opens `watch_videos?video_ids=…` in a new active tab. | The same, up to 50 videos, in a new active tab at the end of the window. (R123) | KEPT · PROVISIONAL (25: G4, signed in) | 31 | 02 YT-GT-12; 06 ARC-ACC-74 |
| PAR-GT-09 | [G9] Over 8,000 characters (about 660 videos), it silently opens the embedded player instead. | Over 50 videos, YouTube's real cap, a gather for YouTube's player goes to YouTube's queue and says so. YouTube's queue takes up to 200 a gather. (R123) | IMPROVED · PROVISIONAL (25: G3) | 31 | 02 YT-GT-13, YT-GT-14 |
| PAR-GT-10 | [G10] Close original tabs, off by default: every gathered tab closes right after the new tab is created, errors ignored. | Close gathered tabs, off by default. A tab closes only once its video is confirmed in the destination, and all close in one call. Automatic gathering always closes what it saved. (R124) | KEPT; timing IMPROVED | 31 | 02 YT-GT-17; 06 ARC-ACC-76 |
| PAR-GT-11 | [G11] "Successfully gathered N video(s)!", then the popup closes after 1.5 s. | The row says what happened, in 2.0's voice. The popup closes by itself when YouTube's player or queue opens a tab; a gather into a playlist keeps it open with the result and Undo. A result that arrives after the popup closed shows as a toast, the toolbar's 3 s mark and "Last gather". (R134) | CHANGED for the playlist | 31 | 02 YT-GT-31, YT-GT-32; 05 UI-POP-37 |
| PAR-GT-12 | [G12] Three settings (`embedMode`, `closeTabs`, `sortOrder`) in `storage.local`; the popup and the settings page edit the same values. | Gather tabs' shared settings, which sync with settings sync, and the gather playlist in each account's setup. The popup and Settings edit the same values. (R135) | KEPT | 31, 16 | 02 YT-GT-01; 04 DATA-12 |

### 4.2 The embedded player page

GatherTube's own player page is replaced by YouTube's queue (the user's answer 1; R123): it can't come back as an embed, because extension pages get YouTube's Error 153, and embedding would bring all of 2.0 under YouTube's API policies ([ADR-0001](../../../docs/adr/0001-youtube-access-through-the-users-session.md)).

| ID | GatherTube 1.1.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-GT-13 | [P1] One player page per window; gathering again replaces that window's page. | One new YouTube's queue tab per gather, in the gathering window. YouTube's queue lives in its own tab, so gathering again opens a new one. (R123) | CHANGED · PROVISIONAL (25: G3) | 31 | 02 YT-GT-14; 06 ARC-ACC-75 |
| PAR-GT-14 | [P2] An embedded `youtube-nocookie.com` player in an extension page. | No embed. YouTube's own watch page plays the list. (R123) | CHANGED | 31 | 02 YT-GT-11 |
| PAR-GT-15 | [P3] Auto-advance by messaging the player every 10 s. | YouTube's watch page moves on by itself, and nothing of ours polls. (R123) | CHANGED | 31 | 02 YT-GT-12, YT-GT-14 |
| PAR-GT-16 | [P4] Header: Open Queue On YouTube, the queue toggle with a count, Open On YouTube. | Not needed: the list is already on YouTube, and YouTube's panel shows the count. (R123) | CHANGED | 31 | 02 YT-GT-14 |
| PAR-GT-17 | [P5] "Video N of M", with previous and next buttons. | YouTube's own: "1 / 100" in its panel, and its player's previous and next. (R123) | CHANGED | 31 | 02 YT-GT-12, YT-GT-14 |
| PAR-GT-18 | [P6] Queue panel: thumbnails, oEmbed titles, play a row, the count, Clear and Remove. | YouTube's queue panel, with real titles and durations, play now and Clear queue. (R123) | CHANGED | 31 | 02 YT-GT-14 |
| PAR-GT-19 | [P7] Drag-and-drop reordering, on Chrome only: Firefox kept the handles without the handlers. | YouTube's queue panel reorders by drag, in both browsers. (R123) | IMPROVED | 31 | 02 YT-GT-14 |
| PAR-GT-20 | [P8] Remove a row; removing the playing video plays the next. | YouTube's own per-row menu removes. (R123) | CHANGED | 31 | 02 YT-GT-14 |
| PAR-GT-21 | [P9] Shuffle, keeping the playing video. | The Shuffled order shuffles before the list is built (PAR-NEW-45), and YouTube's player keeps YouTube's own Shuffle. YouTube's queue has none. (R122) | CHANGED | 31 | 02 YT-GT-08, YT-GT-10 |
| PAR-GT-22 | [P10] Clear the queue (playback carried on, because the code called a player that was always null). | YouTube's "Clear queue", which also stops playback. (R123) | CHANGED | 31 | 02 YT-GT-14 |
| PAR-GT-23 | [P11] Loading and error overlays, and Retry, which called a method that didn't exist. | Not needed: there's no player page. A gather that can't build its list says so, and nothing closes. (R123) | DROPPED | 31 | 02 YT-GT-33 |
| PAR-GT-24 | [P12] The list kept in the page's address and in `storage.local`; edits lost on reload; the keys never deleted. | YouTube's player keeps its list in its own address, so it survives a reload. YouTube's queue doesn't survive one, as YouTube's queue never does. Nothing is stored per window. (R123) | CHANGED: partly lost for the queue | 31 | 02 YT-GT-12, YT-GT-14 |

### 4.3 Keys

| ID | GatherTube 1.1.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-GT-25 | Enter in the popup gathers, wherever focus is. | Enter gathers while nothing in the popup has focus. (R120) | CHANGED | 31 | 02 YT-GT-34; 05 UI-POP-35 |
| PAR-GT-26 | P toggles the player page's queue panel. | YouTube's own panel button; no key of ours on YouTube's pages. (R123) | DROPPED with the player page | 31 | 02 YT-GT-34 |
| PAR-GT-27 | Escape closes the panel. | YouTube's own panel. (R123) | DROPPED with the player page | 31 | 02 YT-GT-34 |
| PAR-GT-28 | Shift+→ and N: the next video, wrapping round. | YouTube's own Shift+N steps through its list. (R123) | CHANGED | 31 | 02 YT-GT-34 |
| PAR-GT-29 | Shift+← and B: the previous video, wrapping round. | YouTube's own Shift+P. (R123) | CHANGED | 31 | 02 YT-GT-34 |
| PAR-GT-30 | A red chip naming each key for 1 s, on Chrome only. | Nothing: YouTube's own keys need none. (R123) | DROPPED | 31 | 02 YT-GT-34 |

### 4.4 The settings page

| ID | GatherTube 1.1.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-GT-31 | [S1] Default Behavior: the same three settings as the popup, saved on change. | Settings › YouTube › Gather tabs: the destination, the gather playlist, the order, Close gathered tabs, the automatic options and Show feedback, saved on change. (R120) | KEPT | 31, 15 | 02 YT-GT-01; 05 UI-SET-24 |
| PAR-GT-32 | [S2] A read-only list of keys. | One line on the card: "In the popup, Enter gathers. On YouTube, Shift+N and Shift+P move through YouTube's list." (R137) | KEPT, reworded | 31 | 02 YT-GT-34; 05 UI-SET-24 |
| PAR-GT-33 | [S3] The version, "Videos in current queue" and "Last queue update", which always read 0 and "Never". | The version is in Settings › About. The card and the popup row show "Last gather", which works. (R134) | IMPROVED | 31 | 02 YT-GT-32; 05 UI-SET-24, UI-POP-37 |
| PAR-GT-34 | [S4] Reset All Settings: clears all of `storage.local`, queues included. | Clear all data, for the whole extension. Switching Gather tabs off keeps its settings. (R135) | CHANGED | 31, 16 | 04 DATA-36, FT-11 |
| PAR-GT-35 | [S5] Report Issue and View Source. | Report a problem; the credit line links GatherTube's repository. (R138) | CHANGED | 31 | 04 HEALTH-27; 05 UI-SET-24; 08 REL-STORE-38 |
| PAR-GT-36 | [S5] Rate Extension, whose store link had no item ID. | Not ported: it rated GatherTube, and its link was broken. (R120) | DROPPED | 31 | — |
| PAR-GT-37 | [S6] On Firefox, the settings page is dead: "Failed to load settings", nothing saves, and the version reads "1.0.0". | One settings page for both browsers, from one codebase. (R120) | IMPROVED | 31 | 05 UI-SET-24 |

### 4.5 Messages, addresses and promises

| ID | GatherTube 1.1.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-GT-38 | Messages: "Successfully gathered N video(s)!", "No YouTube video tabs found.", "Failed to gather videos: …", "Failed to create watch_videos queue: …" and the rest. | Rewritten in 2.0's voice, each saying what happened to the tabs. (R137) | CHANGED | 31 | 02 YT-GT-32, YT-GT-33 |
| PAR-GT-39 | Which addresses count: watch pages (with `list=` and `t=` dropped), `m.` and `music.` watch pages, `/live/` and `youtu.be`; Shorts and embeds skipped unless a title guess caught them. | Watch pages with `list=` and `t=` dropped, `/live/`, music.youtube.com where 2.0 has access, and a loaded `youtu.be` tab. Not m.youtube.com, Shorts, embeds, channels or other sites, whatever their titles say. (R121) | KEPT; m.youtube.com and title guesses CHANGED | 31 | 02 YT-GT-03, YT-GT-04 |
| PAR-GT-40 | Listing promises that didn't hold: drag reordering on Firefox, "queue persistence", "Add" to queues, the IFrame API, "100% feature parity", queue statistics and "~50KB". | Drag reordering works in both browsers, in YouTube's panel. YouTube's player list survives a reload and the queue doesn't, and nothing claims otherwise. Gathering again opens a new list rather than adding to one. One codebase serves both browsers. "Last gather" works. 2.0's weight is budgeted, and its listing promises only what ships. (R123, R138) | IMPROVED | 31 | 02 YT-GT-12, YT-GT-14, YT-GT-32; 07 Q-PERF-67; 08 §9.2 |

### 4.6 GatherTube's defects

| ID | GatherTube 1.1.0 | 2.0 | Status | Tickets | Chapter |
|---|---|---|---|---|---|
| PAR-GT-41 | The embedded player shows YouTube's Error 153 in both browsers, because extension pages send no Referer. | YouTube's queue replaces it, with no embed (PAR-GT-14). (R123) | IMPROVED: fixed | 31 | 02 YT-GT-11, YT-GT-14 |
| PAR-GT-42 | Over 50 videos, `watch_videos` silently drops the rest, and Close original tabs closes their tabs too, so videos are lost. | More than 50 go to YouTube's queue, and a tab closes only once its video is confirmed there. (R123, R124) | IMPROVED: fixed | 31 | 02 YT-GT-13, YT-GT-17; 06 ARC-ACC-74, ARC-ACC-76 |
| PAR-GT-43 | The title fallback gathers, and can close, tabs that aren't videos: a Reddit thread, a news article, channel pages. | Only addresses count. (R121) | IMPROVED: fixed | 31 | 02 YT-GT-04 |
| PAR-GT-44 | "English first" means "mostly Latin letters": Spanish, German, French, Vietnamese and Portuguese titles count as English. | The browser's own language detection, with a group for titles it can't place. (R122) | IMPROVED: fixed | 31 | 02 YT-GT-09 |
| PAR-GT-45 | Firefox has no drag reordering, though both listings promise it. | YouTube's queue panel reorders in both browsers. (R123) | IMPROVED: fixed | 31 | 02 YT-GT-14 |
| PAR-GT-46 | Firefox's settings page is dead. | One settings page for both browsers (PAR-GT-37). (R120) | IMPROVED: fixed | 31 | 05 UI-SET-24 |

## Resolved during assembly

These were open in this chapter's first draft and are now settled. The rows above state the settled behaviour.

- **PAR-CAP-48 (GAP: the Refresh control and its copy):** a ↻ "Refresh playlists" button in the picker's header and in Settings' playlist lists, plus a refresh on open when the cache is over 5 minutes old (R39).
- **PAR-DEF-14 (GAP: sorting):** YouTube's Save-dialog order with search, plus a per-device "Sort A–Z" toggle (R39; new row PAR-NEW-40).
- **PAR-DEF-31 (GAP: the README's 1.5.0 architecture claims):** the README is rewritten for 2.0 as a whole, as part of the release (R39).
- **Missing options in ticket 16 §2.4's `Settings` shape:** chapter 04's names and defaults are adopted (R11). Quick-save's "On Shorts shelves too" is off, the watch-page button's "On Shorts too" is off, the card menu's link option is off, the theme is System, and the toolbar tick is off until D10. Chapter 04's FT-01 holds them.
- **The queue button's Show feedback default:** on, settled by precedence (ticket 15 over ticket 12) in 02 YT-ADD-13 and 04 §7. No R was needed.
- **The watch-page button's place:** after Share, before Save, settled by precedence (ticket 14 over ticket 09) in 02 YT-WB-02 and 05 UI-YT-16. No R was needed.
- **R3 and auto-add while signed out:** auto-add stays silent, with no toast, and R3's sign-in toast is for explicit actions only (R41; PAR-CAP-17, PAR-CAP-32, PAR-DEF-01). 02 and 04 (ACC-21) say the same.
- **Which resolver wins when several match (PAR-DEF-41):** the first property whose `resolveCommand` is a function, with `resolver-ambiguous` recorded for diagnostics (R66). 04's breakage table, 06 ARC-ACC-13 and 07 Q-WATCH-24 now say the same.

Also applied in this chapter's rows, from the second round:
- R41 (PAR-CAP-17, PAR-CAP-32, PAR-DEF-01);
- R42 (PAR-NEW-21);
- R43 (PAR-CAP-04, PAR-NEW-18);
- R44 (PAR-CAP-27, PAR-NEW-11, PAR-NEW-15);
- R45 (PAR-CAP-32, PAR-CAP-42, and every quoted title in copy);
- R46 (PAR-NEW-17);
- R48 (PAR-CAP-59);
- R50 (PAR-NEW-22);
- R51 (PAR-CAP-36, PAR-NEW-16, PAR-DEF-41);
- R52 (PAR-DEF-31);
- R53 (PAR-DEF-28, PAR-NEW-12, PAR-NEW-23, PAR-NEW-28);
- R54 (PAR-NEW-25);
- R55 (PAR-CAP-42, PAR-CAP-58);
- R56 (PAR-CAP-32, PAR-CAP-42);
- R57 (PAR-CAP-16, PAR-NEW-18);
- R58 (PAR-NEW-27, and the AMO list under Open rows at a glance);
- R59 (PAR-CAP-44, PAR-DEF-19, PAR-NEW-06);
- R60 (PAR-CAP-01, PAR-CAP-72, PAR-CAP-73, PAR-CAP-75, PAR-DEF-43);
- R61 (PAR-CAP-70);
- R64 (PAR-CAP-77);
- R65 (PAR-NEW-22);
- R66 (PAR-CAP-36, PAR-DEF-41);
- R67 (PAR-NEW-10).

R17 and R49 are reflected in PAR-CAP-66. R47, R62 and R63 change no row.

Also applied, third round:
- R68 (PAR-NEW-22);
- R69 (PAR-NEW-27);
- R70 (PAR-NEW-21);
- R71 (PAR-NEW-12, PAR-NEW-28);
- R72 (PAR-CAP-70, PAR-DEF-32);
- R76 (PAR-CAP-77);
- R77 (PAR-CAP-42).

R73, R74 and R75 change no row: no row states Playing now's art, the picker's song counts, the private-window banner's copy or a batched notice.

After the spec:
- R83 (PAR-CAP-67, PAR-NEW-06, PAR-NEW-27, PAR-DEF-28, and the AMO line under Open rows at a glance): Firefox's prompt strings are settled from source, and ticket 23 is settled by decision. 2.0 declares `none`, settings sync declares no data type, and settings changed in a private window are saved. None of these rows is PROVISIONAL any longer.

The user's decisions of 2026-10-20:
- R84 to R93 (PAR-NEW-31 to PAR-NEW-39, new PAR-NEW-41, PAR-CAP-06, PAR-CAP-63, and Open rows at a glance): eight new capabilities approved, live streams declined, and Report a problem settled;
- R94 (narrow rows), R95 (the listings), R96 (PAR-CAP-73, PAR-DEF-43), R97 and R98 (the upgrade note): the user decisions listed under §3.3;
- R99 changes no row: budgets are 07's.

GatherTube, folded in on 2026-10-20 ([R120–R139](resolutions.md#gathertube-r120r139)):
- R120 to R138 (new §4, PAR-GT-01 to PAR-GT-46; new PAR-NEW-42 to PAR-NEW-45; the chapter table, the row IDs and Open rows at a glance): Gather tabs, the gather playlist, automatic gathering and the Shuffled order;
- R139 changes no row: budgets and tests are 07's.

## Conflicts found

No contradiction between this chapter and the others remains: every row follows the owning chapter.

- **Pending-user items recorded only here** (resolved): PAR-NEW-36 and PAR-NEW-37 were once recorded only in this chapter. Both are now specified in their owning chapters (04 §4.12; 02 §2.15, 06 ARC-MAN-20), and the spec's Open items no longer list them (R90, R91).
