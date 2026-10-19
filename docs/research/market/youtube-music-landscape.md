# YouTube Music power-user tools: the landscape in October 2026

Research for ticket 30 (market and users), YouTube Music side. All store and GitHub figures were retrieved on **2026-10-19** unless a different date is given. Source keys like **[A3]** resolve in [Sources](#sources) at the end. **(unverified)** marks anything I couldn't confirm against a primary source.

## How to read this

- **Primary sources used:**
  - the stores' own data: the AMO v5 API, Chrome Web Store (CWS) listing pages, and the Edge Add-ons store's JSON endpoints;
  - the Greasy Fork API and OpenUserJS listings;
  - the GitHub API (repos, releases, issues, source);
  - music.youtube.com's own HTML (`ytcfg.HOTKEY_DIALOG`).
- **Store figures:**
  - CWS user counts are the store's rounded buckets.
  - AMO users are average daily users.
  - Edge figures are `activeInstallCount`.
- **Reddit:** reddit.com blocks automated reads (HTTP "Blocked" page, 2026-10-19). Reddit posts were therefore read through the Arctic Shift archive API. **The scores shown are the archive's snapshot, which may be lower than live scores (unverified).**
- **Google's YouTube Music Help Community** renders its thread list client-side. No thread could be retrieved or counted, so it contributes nothing here (gap).
- **2.0's feature list** is from [.scratch/rebuild/spec.md](/home/alioun/projects/yt-playlist-tools/.scratch/rebuild/spec.md) and [spec/03-youtube-music.md](/home/alioun/projects/yt-playlist-tools/.scratch/rebuild/spec/03-youtube-music.md) [R1, R2].

---

## 1. Summary

1. **Nobody draws one-click Play next or Add to queue on YouTube Music's own rows, cards or album headers.** That holds for the Chrome Web Store, AMO, Edge, Greasy Fork, OpenUserJS and the desktop clients alike (§3–§5).
   - The closest tools put those actions in a **toolbar popup**:
     - *Companion for YouTube Music*: about 1,000 CWS users and 87 AMO users; first published July 2026 [A6, C4];
     - the AMO mini player *"YouTube Music"*: 1,566 users [A1].
   - Pear Desktop exposes queue inserts only through a local HTTP API [G3].
2. **Every hotkey tool acts on the playing song only, mostly play/pause/next/previous/like.** None acts on a pointed-at item.
   - A "save to playlist" key exists only as two tiny userscripts that open YouTube Music's own dialog (274 and 18 installs) [U2, U3].
   - The same request is open on BetterYTM (#166, 2026-03-27) [G14].
3. **Nobody offers Undo for queue or save actions.**
4. **The most popular YouTube Music extensions are cosmetic or lyrics tools, not workflow tools:**
   - Better Lyrics: 100,000 CWS users;
   - ThemeSong: 60,000 CWS users [C1, C2].
   - The most popular power-user product is a desktop wrapper, Pear Desktop (33.8k GitHub stars) [G1].
5. **The 2026-09-29 player-UI A/B test (the "Wiz miniplayer") broke most tools that touch the player bar:**
   - ytmdesktop (won't load; no release in three weeks);
   - Pear's playback controls and API (fix still in an open PR);
   - Web Scrobbler, BetterYTM, ThemeSong and lidel's hotkeys.

   Some were fixed in days, others are still broken (§6). Tools that don't depend on the player bar are a selling point, and 2.0 is built that way (YM-BAR-1) [R2].
6. **Demand is real and consistent, but low-volume.** Requests for fewer clicks on Save, Add to queue and Remove appear:
   - on GitHub: Pear #1083, #2820, #4753; BetterYTM #98, #166 [G5–G7, G13, G14];
   - on Reddit: 2023–2026 [D1–D6].

   No request has big vote counts. YouTube Music has no public voting board I could read.
7. **"Extension, not desktop client" is mostly an advantage for 2.0's job**, which is in-page, one-click work in the user's own signed-in browser and the installed app window.
   - It is a **limitation for "control from anywhere"**: global keys, tray, scrobbling, Stream Deck. That's where desktop clients and popup mini players win (§10).

---

## 2. Baseline: what YouTube Music itself offers (web)

- **Native keyboard shortcuts** (from `ytcfg.HOTKEY_DIALOG`, client `1.20261018.16.00`, fetched signed out 2026-10-19) [N1]:

  | Group | Keys |
  |---|---|
  | Playback | Space/`;` play/pause, `j`/Shift+N next, `k`/Shift+P previous, `l`/`h` ±10 s, Shift+`l`/`h` ±1 s, `s` shuffle queue, `r` repeat, `=`/`-` volume, `m` mute |
  | General | `q`/Esc queue or expanded player, `f` full screen, **`+` like current song, `_` dislike current song** |
  | Navigation | `gh` Home, `ge` Explore, `gl` Library, `g,` Settings, `/` search |

  **There is no key for Play next, Add to queue, Save to playlist or Remove from queue, and no key acts on anything but the playing song.**
- **Where the actions live:**
  - Play next, Add to queue, Save to playlist and Remove from queue sit in each item's ⋮ menu: two clicks for queue actions, and at least three for Save (⋮ → Save to playlist → pick) [R3; D2].
  - Rows show their own like and ⋮ on hover [R2 §20].
  - Users report flakiness in that menu:
    - "why do i have to click 'save to playlist' like 3 times before the menu pops up" (2026-08-24) [D7];
    - Pear #3750 and #4631: Play next in the ⋮ menu "fails randomly" or "doesn't close in one click" (2025-08-14 +6; 2026-08-05 +3) [G8].
- **Recent native changes:**
  - Queue sync across Android, iOS and web was reported on 2026-01-26 (archived score 234) [D16].
  - "Play next" for automated mixes (Supermix, Replay Mix) was removed by 2026-01-06 [D8].
  - The **Wiz miniplayer A/B test** has run since 2026-09-29:
    - it replaces `ytmusic-player-bar` and `#like-button-renderer` with `ytmusic-miniplayer` [G2, R2 §16];
    - the 2.0 spec found it in about 1 in 4 fresh signed-out profiles [R2].

---

## 3. Browser extensions

### 3.1 Closest competitors: popup "mini players" with queue actions

| Extension | Chrome | Firefox (AMO) | Edge | Last update | Source |
|---|---|---|---|---|---|
| **Companion for YouTube Music – Mini Player** (benesmartin) | 1,000 users, 4.5★ (8) | 87 users, 5.0★ (5) | uses the CWS build | 2026-10-13 (v1.5.1) | GPL-3.0, 9★ GitHub, created 2026-07-03 [C4, A6, G10] |
| **"YouTube Music"** mini player (B Akhil kumar) | not found on CWS | 1,566 users, 4.23★ (13) | — | 2026-10-06 (v1.4.2) | [A1] |
| **YTM Mini** (Roie Ambulo) | 4,000, 5.0★ (4) | — | 11 installs | 2026-10-03 | [C5, E2] |
| **Pink Player – Mini for YouTube Music** | 4,000, 4.6★ (9) | — | — | 2026-10-17 | [C6] |
| **YouMuse – Mini Player** (Frameless; paid Pro $9–49/yr) | 4,000, 5.0★ (2) | — | — | 2026-06-14 | [C7] |
| **YTM Enhancer** (gormanity) | 4,000, 3.5★ (2) | 41, no ratings | 21 installs | 2026-08-04 / 07-31 | 4★ GitHub [C8, A7, E3] |

**Companion for YouTube Music** is the strongest competitor.

- **Features mapped to 2.0 (all inside the toolbar popup, none in the page):**
  - Play next and Add to queue on album, search, history and playlist rows, and for whole albums and playlists;
  - Remove and drag-to-reorder in its queue view;
  - like/dislike on any popup row;
  - "save the current song to any playlist (with a duplicate guard)";
  - row actions can be switched off;
  - keyboard shortcuts for play/pause, next, previous and like, rebindable [G10 README].
- **What it lacks against 2.0:**
  - no in-page buttons;
  - no one-click quick-save playlist;
  - no keys on a pointed-at item;
  - Undo only in the sense that "an unliked song dims in place".
- **Positioning:** identical to 2.0's local-first stance: "Everything runs against your open YouTube Music tab with your existing session" [A6].
- **Activity:** about 20 commits, mostly fixes, on 2026-10-12/13 alone [G10]. No Wiz-related breakage was reported (unverified).
- **Complaints:** one 2026-10-10 review, "shows a blank 1x1 block". The developer fixed it in 1.5.1 on 2026-10-13 [C4 reviews].

**"YouTube Music" (AMO mini player)**

- **Features:**
  - popup search;
  - a live queue with click-to-jump;
  - Play next / Add to queue "click the ⋯ on any song in Search or History", so two clicks;
  - like/unlike the current song;
  - browser-wide Ctrl+Shift shortcuts for play, next, previous, like and volume.
- **Access route:** "YouTube Music's own APIs via your existing session" [A1].
- **Complaints:** volume desync, in reviews dated 2026-10-02, 2026-06-18 and 2026-02-03 ("after 1 play pause cycle it freezes") [A1 reviews].

**YTM Mini, Pink Player and YouMuse** show the queue and jump within it. None adds Play next, Add to queue or Save from rows. YouMuse puts its queue view behind a paywall [C5–C7].

- Pink Player complaint: "when the music player is opened and then minimized, the music pauses once" (2026-05-21) [C6 reviews].

**YTM Enhancer** offers playback controls, automation (auto-play, skip disliked), hotkeys, a PiP mini player and a sleep timer. It has no queue actions [A7].

### 3.2 Hotkey extensions (playing song only)

| Extension | Chrome | Firefox | Last update | Keys | Source |
|---|---|---|---|---|---|
| **YouTube Music Hotkeys** (lidel) | 3,000, 4.8★ (29) | 264, 4.49★ (53) | 2026-10-07 (v3.0.1) | play/pause, previous, next; can be global on Chrome | [C9, A3, G11] |
| **YouTube Music Player** (Comss) | — | 723, 3.5★ (10) | 2026-05-23 | Ctrl+Alt: play/pause, next, previous, volume, mute, shuffle, repeat, sleep timer | [A4] |
| **YouTube Music Dislike (One-Click + Hotkey)** | 20, 3.0★ (1) | — | 2025-11-01 | like, dislike, play/pause | [C10] |
| **Music Ad Blocker Shorts HotKeyboard Controller** | 192, 3.7★ (3) | — | 2026-01-07 | global keys incl. "adding songs to liked" | [C11] |
| **Toolbar Control for YouTube Music** | not found on CWS (unverified) | 338, 4.32★ (28) | 2024-04-25 | none (popup controls only) | [A5] |
| **Hotkeys for YouTube Music™** (`ggjkoecdjegahefiaibfnjgkebhijgpf`) | listing no longer served on 2026-10-19 (probably removed; unverified) | — | — | play, pause, skip, like, dislike (per search snippet, unverified) | [C12] |

- **Features mapped:** only the playing-song keys. No queue, save or pointed-at actions.
- **Breakage:** lidel's hotkeys broke on the Wiz miniplayer.
  - Reported 2026-10-05 (#25) and fixed by #26 on 2026-10-07.
  - The fix moved to `#movie_player` because "previous and next did nothing, and toggle fell back to `#play-button`, the first playlist card on the page" [G11].
- **Complaints:**
  - wanting **global** keys:
    - "Shortcuts aren't global though. And no like/dislike shortcut" (AMO YouTube Music Player, 2025-11-02) [A4];
    - "グローバルホットキーが使えないからいらない" (lidel AMO, 2022-09-02) [A3];
    - "Would be cool if it worked with other apps focused" (2023-11-02) [A3];
  - wanting more actions:
    - "Wish there are more controls like volume up and down" (CWS, 2025-09-14);
    - "a global hotkey that opens the tab" (2026-08-13) [C9].

### 3.3 In-page enhancers (cosmetic, lyrics, queue hygiene)

| Extension | Chrome | Firefox | Edge | Last update | Relevance to 2.0 | Source |
|---|---|---|---|---|---|---|
| **Better Lyrics** | 100,000, 4.9★ (742) | 5,289, 4.84★ (108) | 6,252, 4.9★ (42) | 2026-10-16 (v3.0.0) | none (lyrics); shows market size | [C1, A8, E1] |
| **ThemeSong for YouTube Music™** | 60,000, 4.7★ (509) | 1,383, 4.88★ (60) | — | 2026-10-09 (26.10.1) | themes, visualiser, sleep timer, side-panel mini player; claims PWA support | [C2, A9, G12] |
| **YTM-Immersion** | 6,000, 4.7★ (13) | — | — | 2026-10-17 | full-screen lyrics | [C13] |
| **Skip YouTube Music Dislikes** | 687, 3.6★ (31) | — | — | 2026-09-09 (v2.7.0) | removes disliked tracks from the queue automatically | [C14] |
| **YouTube Music +** (closest to "YouTube Music Plus") | 290, 4.3★ (3) | — | — | 2026-10-01 | playlist cleaner: unavailable tracks, replacements, imports. Not a queue tool | [C15] |
| **BetterYTMusic** (CWS) | 79, 1.0★ (1) | — | — | 2026-03-25 | lyrics, PiP, playback controls | [C16] |
| **Better YouTube Music** (AMO, JenPrime) | — | 51, 2.75★ (4) | — | 2024-04-25 (re-signed; v0.2) | notifications + miniplayer "(Alpha)". Review: "Notification doesnt work, it shows some html code" (2019-11-27) | [A10] |
| **FIX.YTM** | 63, 5.0★ (1) | — | — | 2025-10-06 | playlist sorting, comments | [C17] |
| **YouTube Music Queue Saver** | 2 users | — | — | 2026-10-09 | saves queues "before youtube music destroys them" | [C18] |

- **No extension named exactly "YouTube Music Plus"** exists on CWS, AMO or Edge (searches on 2026-10-19).
- **"Better YouTube Music"** names four different small projects: the AMO add-on, the CWS "BetterYTMusic", a Greasy Fork script (§4), and BetterYTM (§4).
- **Breakage on the Wiz miniplayer:**
  - **ThemeSong** stopped working. Reddit 2026-10-01: "New Web UI made a must-have extension stop working FYI" [D9]; CWS review 2026-10-01 [C2].
    - Fix commits ran 2026-10-04 to 10-09, ending with "Temp fix for new ui". The commits "Remove Like Buttons" and "Remove SongInfoDisplay feature" show features were dropped for the new UI [G12].
  - **Skip YouTube Music Dislikes** has a long breakage history in reviews:
    - "Worked for a day or two then stopped working" (2025-06-20);
    - the developer: "every time YouTube Music changes its interface, the extension breaks and I need to catch up" (2025-09-30);
    - "Been broken for a long while now" (2026-09-06) [C14].

### 3.4 Edge Add-ons

- Edge's own search ("youtube music", "ytm", "youtube music queue", "youtube music hotkeys", "youtube music mini player", "yt music") lists **no** tool with YouTube Music queue actions [E0].
- Edge-native listings are tiny:
  - YTM Mini: 11 installs;
  - YTM Mini Mode: 41;
  - Focus Mode for YouTube Music: 151;
  - SynQ: 605, last updated 2024-03-17 [E2–E5].
- Developers tell Edge users to install the CWS build ("Edge, Brave, Opera and Vivaldi install the Chrome Web Store build") [G10].

---

## 4. Userscripts (Greasy Fork, OpenUserJS)

| Script | Installs | Rating | Last code update | What it does | Source |
|---|---|---|---|---|---|
| **BetterYTM** (Sv443) | Greasy Fork 1,735; OpenUserJS 408; GitHub 132★ | GF 7 good / 0 bad | v3.1.0 2026-04-15; 4.0.0-beta.1 2026-09-12 | toggleable features; **queue-item quick actions: open lyrics, remove from queue**; scroll to the active queue item; hotkeys for like/dislike, lyrics, YT↔YTM; arrow-key seek and volume | [U1, U5, G13] |
| **YTM Add to playlist shortcut** | 274 | 1 good / 1 bad | 2023-07-24 | **P** opens YouTube Music's Save dialog for the current song | [U2, D2] |
| **Add to playlist shortcut for youtube music** | 18 | — | 2025-09-03 | same idea, P key | [U3] |
| **YouTube Music: TOOLKIT** | 142 | 1 good | 2026-10-06 | sort artist songs by play count, skip to chorus, **"add to playlist + delete" button per song** | [U4] |
| **YouTube Music Remove from Playlist with D** | 6 | — | 2025-09-17 | D opens ⋮ and clicks "Remove from playlist" | [U6] |
| **YouTube Music – Playlist & Album Filter** | 11 | — | 2026-05-11 | search filter in the sidebar and the Save dialog | [U6] |
| **Better Youtube Music** (GF) | 355 | 2 good / 1 bad | 2024-11-08 | unspecified ("Create a Better Youtube Music") | [U7] |

- **No userscript adds one-click Play next or Add to queue to YouTube Music's rows.** The only one-click queue action in this whole category is **Remove from queue** (BetterYTM).
- **BetterYTM's open requests mirror 2.0's scope:**
  - #98 "Add new button to autoplay queue list for the context menu action 'add to queue'" (2024-06-11);
  - #166 "Add hotkey to trigger the 'save to playlist' action on the current song" (2026-03-27);
  - #197 "Search bar in 'add to playlist' popup" (2026-09-18);
  - #184 "Show playlists that song is in" (2026-08-30, closed).

  All have 0–1 👍 [G13, G14].
- **Breakage:** BetterYTM #198, "Recent YTM update broke some BetterYTM features" (2026-09-29). The maintainer: "this layout is in A/B testing, as I haven't received it yet, so there's unfortunately nothing I can do just yet". Still open on 2026-10-19 [G15].
- **The P-key userscripts** drive YouTube Music's menu, so they break with its markup (inferred from the approach; unverified).

---

## 5. Desktop clients

### 5.1 Wrappers of the web app (same page, plugins injected)

| Client | GitHub | Latest release | Reach signal | Source |
|---|---|---|---|---|
| **Pear Desktop** (formerly th-ch/youtube-music, now `pear-devs/pear-desktop`) | 33,810★, 2,020 forks, 730 open issues | **v3.12.0, 2026-06-28** (previous 3.11.0 2025-09-07) | v3.12.0: about 300k installer downloads; updater manifest fetched 1.75M times (update checks, not users) | [G1, G3] |
| **ytmdesktop** (YouTube Music Desktop App v2) | 6,642★, 631 forks | **v2.0.12, 2026-09-08**; no release since | v2.0.12: 36k installers + 122k update packages | [G2, G4] |
| MusicDesktop (WebView2) | — | 2.0.4 (Reddit, 2026-10-08) | Reddit post, archived score 5 | [D10] (unverified beyond the post) |

**Pear Desktop: features mapped to 2.0** [G3, source at `master` 2026-10-19]

- **Plugins** (all off by default, `enabled: false`):
  - **album-actions**: Like, Unlike, Dislike or Undislike every song in an album or playlist;
  - **shortcuts**: global keys for **previous, play/pause and next only**, plus MPRIS;
  - **api-server [Beta]**: a local HTTP API with
    - `POST /api/v1/queue {videoId, insertPosition: INSERT_AT_END | INSERT_AFTER_CURRENT_VIDEO}`, i.e. Add to queue and Play next by API;
    - `PATCH /queue/{index}` to move;
    - `DELETE /queue/{index}` to remove;
    - like, dislike, search;
  - downloader, scrobbler, Discord, synced lyrics, SponsorBlock and others.
- **No in-UI one-click Play next, Add to queue or Save**, no pointed-at keys and no Undo.
- **Open requests:**
  - #2820 "Add 'Save To Playlist' button to play bar … as well as multiple selection" (2025-01-03, +3);
  - #1083 "Make removing songs from the queue less tedious" (2023-03-18);
  - #4753 "Customizable player bar buttons and 3-dot menu visibility" (2026-10-14): "'Add to playlist' are only accessible through the three-dot menu. This requires multiple clicks";
  - #2870 "Customizing the 'Now Playing' bar with buttons" (2025-01-15, +1);
  - like/dislike shortcuts PR #4137 (open since 2025-12-09) [G5–G7].
- **Breakage since 2026-09-29:**
  - #4727 "Playback controls no longer work after YTM UI change" (2026-10-01);
  - #4728 the API's next/previous return 204 but do nothing;
  - #4741 bogus `elapsedSeconds`.
  - The fix PR #4750 (2026-10-13) and the volume fix PR #4746 are **open, unmerged**.
  - #4750 states that the `#queue` queue API and store still work on the new UI [G2].
  - **Users on the latest release (v3.12.0, June) have had broken controls for three weeks.**
- **Top complaints by 👍:**
  - MusixMatch gibberish lyrics #4684 (+42);
  - Flatpak #737 (+37);
  - **casting #113 (+36, open since 2021-01-02)**;
  - missing Homebrew cask #4004 (+21) [G16].

**ytmdesktop: features mapped to 2.0** [G4, source at `development`]

- It adds two player-bar buttons beside like: **save to library** and **add to playlist**. The second opens YouTube Music's own dialog (`playerbarcontrols.script.js`).
- Global shortcuts: play/pause, next, previous, thumbs up/down, volume.
- A companion-server API (Stream Deck and similar) with play, pause, `playQueueIndex`, `toggleLike`, `changeVideo`. **No queue insert.**
- No one-click Play next or Add to queue, no Undo.
- **Breakage since 2026-09-29:**
  - #1819 "ytmd app not loading" (2026-09-29, +13, 65 comments, open). The maintainer: "this looks like an A/B test", and the PlayerAPI isn't found.
  - Fixes so far are CI artifacts users must unzip from GitHub Actions, then a "v2.1.0-DEV build" on 2026-10-10.
  - The quick build "Disables any additional controls we add to Bottom Player bar"; due to the bar's rework "it might no longer be included as a feature".
  - The 2026-09-08 breakage (#1807, +11) was fixed in a same-day release [G2].
- **Top complaints by 👍:**
  - **Chromecast #29 (+45, since 2019)**;
  - turning off video #46 (+20);
  - adblock #114 (+19);
  - Flatpak #306 (+18);
  - macOS lag #1570 (+15).

  Google sign-in failures in the embedded browser ("This browser or app may not be secure"): #866 (47 comments), #1017; Pear #538, #594, #2036 (open since 2024-05-08) [G16, G17].

### 5.2 Native clients (replace the web UI; talk to InnerTube directly)

2026 brought a wave of new native clients, most created between June and August 2026:

| Client | GitHub | Latest | Notable | Source |
|---|---|---|---|---|
| **limusic** (Tauri + Rust, libmpv) | 1,152★, created 2026-07-03 | v1.3.0 2026-10-19 | "talks directly to YouTube's internal API"; "ad-free playback"; queue drag-reorder; add to playlist; Ctrl+K; right-click menus | [G18] |
| **Orchard** ("The power-user desktop client for YouTube Music") | 231★, created 2026-07-19 | canary/beta 2026-10-12 | editable queue (add, remove, drag); shortcuts only for playback, seek and search | [G19] |
| **JustAnotherMusicClient** | 292★, created 2026-06-11 | v1.3.2 2026-08-12 | per-tab queues; **Ctrl+S save to playlist**; add to queue via right-click | [G20, D11 (archived score 514, 2026-06-12)] |
| YTubic, Kodama, Cellar, others | 324★ (YTubic), 126★ (Kodama); Cellar not located on GitHub | — | — | [G21, D12] |

- These are **replacements, not companions**. They don't run on music.youtube.com, so they don't compete for 2.0's "inside YouTube Music" slot.
- They do compete for the same frustrated user: Reddit's 2026-09-16 "By far the best alternative to the YT Music web app" (archived score 214, identified in comments as limusic) [D13].
- **Ad-free playback for non-Premium accounts, and impersonating clients, may carry account or ToS risk (unverified).**
- Per commenters, r/YoutubeMusic bans naming some such apps: "The name of the app is literally banned from being mentioned" (2026-09-16) [D13] (unverified rule).

---

## 6. Breakage since the 2026-09-29 player-UI A/B test

| Tool | What broke | Reported | State on 2026-10-19 | Source |
|---|---|---|---|---|
| ytmdesktop | app hangs on load (PlayerAPI not found); added player-bar controls disabled | 2026-09-29 | **unreleased fix** (dev builds only) | [G2] |
| Pear Desktop | next/previous/like/shuffle/repeat, API like-state, elapsed time, precise volume | 2026-10-01 | **fix PRs #4750/#4746 open**; last release 2026-06-28 | [G2] |
| Web Scrobbler (3,059★; Edge 26,557 installs) | "new YT-Music UI doesn't scrobble" (#6242, +31, 33 comments) | 2026-09-29 | **open**; a fix PR is blocked ("there are issues preventing the fix from being merged", 2026-10-19) | [G22, E6] |
| BetterYTM | "broke some BetterYTM features" (#198) | 2026-09-29 | **open**; maintainer can't reproduce | [G15] |
| ThemeSong | stopped working | ~2026-10-01 | temp fix shipped 2026-10-09 (26.10.1); like buttons and song-info feature removed | [D9, G12] |
| lidel YouTube Music Hotkeys | next/previous no-ops; toggle hit the wrong button | 2026-10-05 | **fixed 2026-10-07** (v3.0.1 on both stores) | [G11, C9, A3] |
| Companion, the AMO mini player, Better Lyrics | none reported (unverified) | — | no Wiz report found; a Better Lyrics commit on 2026-10-19 (#1013) touched player-bar CSS for performance | [G10, G23] |

**Pattern:**
- Tools that hung off `ytmusic-player-bar` or `#like-button-renderer` broke. Those that reached `#movie_player`, the `#queue` queue API or the store survived, or were fixed quickly [G2, G11; R4 §7].
- **How fast a fix lands depends on the maintainer's release habit, not on form factor.** Two extensions fixed it within 2–10 days. Two extensions and both desktop wrappers had not shipped a fix after three weeks.

---

## 7. Demand signals for one-click Play next / Add to queue (and Save, Remove)

| Date | Where | Signal | Votes | Source |
|---|---|---|---|---|
| 2023-03-18 | Pear #1083 | "I do not want to right click and then navigate to 'Remove from Queue' … Add a button … One click and it's removed" | 0 👍 | [G6] |
| 2023-07-24 | r/YoutubeMusic | "I created a shortcut for 'save to playlist' because there's no way except for opening the freaking menu" (Greasy Fork script) | archived score 21, 15 comments | [D2] |
| 2023-08-09 | r/YoutubeMusic | "Changing order of Play Next button" | 9 | [D3] |
| 2023-10-29 | r/YoutubeMusic | "Cannot click 'Play Next' on Desktop" | 5, 7 comments | [D3] |
| 2024-06-11 | BetterYTM #98 | button for "add to queue" on autoplay queue items | 0 | [G14] |
| 2024-09-12 | r/YoutubeMusic | "Wish it was easier to add to queue … I'd rather have the add to queue button next to play button"; replies propose a split Play / Add to queue button and Tampermonkey | 12, 7 comments | [D1] |
| 2025-01-03 | Pear #2820 | Save-to-playlist button on the play bar "or when hovering in queue", multi-playlist | +3 | [G5] |
| 2025-01-15 | Pear #2870 | buttons in the now-playing bar: "save a playlist with just one click, add songs to the library with a single click" | +1 | [G7] |
| 2025-08-02 | r/YoutubeMusic | "Swiping on songs to play next, or add to playlist" (mobile) | 16 | [D4] |
| 2025-12-22 / 12-26 | r/YoutubeMusic | multi-select to add to playlist/queue/likes; "add a song to multiple playlists at one time" | 18 / 17 | [D5] |
| 2026-01-06 | r/YoutubeMusic | "Play Next" removed for automated playlists: "Please YT bring this back" | 18 | [D8] |
| 2026-03-27 | BetterYTM #166 | hotkey for "save to playlist" on the current song | 0 | [G14] |
| 2026-06-10 | r/YoutubeMusic | "It shouldn't be a 3 step process to shuffle my playlist" | 49 | [D6] |
| 2026-07-06 | r/YoutubeMusic | save to several playlists in one go, like Spotify | 6 | [D5] |
| 2026-08-24 | r/YoutubeMusic | "why do i have to click 'save to playlist' like 3 times before the menu pops up" | 6 | [D7] |
| 2026-09-18 | BetterYTM #197 | search bar in the add-to-playlist popup | 0 | [G14] |
| 2026-10-12 | Pear PR #4748 | "show which of your playlists contain a song" | — | [G1] |
| 2026-10-14 | Pear #4753 | "'Add to playlist' only accessible through the three-dot menu. This requires multiple clicks" | 0 (new) | [G5] |

**Indirect demand:**
- Store reviews:
  - "This should be a YouTube music core feature" (Skip YouTube Music Dislikes, 2024-10-02);
  - "Should be part of YT Music already" (lidel CWS, 2024-04-29) [C14, C9].
- Users assemble a "desktop app" from the installed PWA plus extensions (2024-09-23, archived score 46) [D14].
- **Google Help Community:** no threads retrievable (see "How to read this"). **Vote counts there are unknown.**

**Reading:**
- The asks are consistent (fewer clicks for Save, Add to queue and Remove; a save key; search and membership in the picker), but **each signal is small**.
- Reach evidence instead comes from:
  - installs of adjacent tools: Better Lyrics 100k, ThemeSong 60k, Pear 33.8k★ [C1, C2, G1];
  - the persistent "the web app is bad" threads (§8).

---

## 8. What users say YouTube Music's own UI lacks

- **A real desktop app, and speed:**
  - "why dont they make a desktop app already" (2025-02-06, archived score 135) [D15];
  - "The web version of yMusic is ugly and horrendously slow … the queue is quite unresponsive" (2025-07-23, 79) [D15];
  - "For Google's Standards, youtube music (Web) is crap" (2024-12-11, 52) [D15];
  - "I Wish if we had a better desktop ui" (2025-10-02, 113) [D15];
  - "a browser version that lags and desyncs and does not even have a proper back button" (2026-05-08, 50, 87 comments) [D15].
- **Click depth for common actions:**
  - Save is ⋮-only [D2, G5];
  - Add to queue isn't beside Play [D1];
  - shuffle takes 3 steps [D6];
  - Remove from queue takes a right-click and a menu item [G6].
- **Accidental queue loss:** "it's so annoying when I accidentally click on Play it wipes out the current queue" [D1]; "obliterate my queue" (2023-08-04) [D3].
- **Playlists:**
  - no search inside a playlist (2026-05-01) [D5];
  - no multi-playlist save [D5];
  - the Save dialog lacks search [G14];
  - no indicator of which playlists hold a song [G13; Pear PR #4748].
- **Keyboard:**
  - no keys for queue or save (§2);
  - "Arrow keys do nothing on YTM" (2025-07-15) [D5];
  - a wish for global keys (§3.2).
- **Missing player features users get elsewhere:** synced lyrics on desktop, crossfade, sleep timer, an exponential volume curve. Hence Better Lyrics, ThemeSong, the Pear plugins and several volume userscripts [C1, C2, G3, U5].

---

## 9. Feature matrix

**Y** = yes, **P** = partial (see note), **N** = no, **?** = unknown. "In page" means inside music.youtube.com's own UI.

| Tool | Play next 1-click in page | Add to queue 1-click in page | 1-click save to quick-save playlist | Save picker (search, membership) | Like on rows/cards | Remove from queue 1-click | Move a queued item | Keys on pointed-at item | Keys on playing song (save/queue/like) | Whole albums/playlists | Undo | Installed app window | Opt-in, nothing drawn when off |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **2.0 (spec)** | Y | Y | Y | Y | Y | Y | Y | Y | Y (in-page keys only) | Y | Y | Y (PROVISIONAL, M4) | Y |
| YouTube Music (native) | N (⋮, 2 clicks) | N (⋮, 2 clicks) | N | P (dialog; no search, inferred from requests) | Y (hover) | N (⋮) | Y (drag) | N | P (like/dislike only) | P (⋮) | ? | Y | n/a |
| Companion for YouTube Music | P (popup rows) | P (popup rows) | N | P (current song, duplicate guard) | P (popup rows) | P (popup queue) | P (popup drag) | N | P (like + playback, browser-wide) | P (popup) | P (unlike dims) | ? | P (row actions switchable) |
| "YouTube Music" AMO mini player | P (popup, ⋯ = 2 clicks) | P (popup, 2 clicks) | N | N | P (current song) | ? | N | N | P (like + playback, browser-wide) | N | N | ? | N |
| YTM Mini / Pink Player / YouMuse | N | N | N | N | P (current song) | N | N | N | P (playback only) | N | N | ? | N |
| ThemeSong | N | N | N | N | N (like buttons removed 2026-10) | N | N | N | N | N | N | Y (claims PWA) | P |
| lidel YouTube Music Hotkeys | N | N | N | N | N | N | N | N | P (playback only, can be global) | N | N | ? | n/a |
| BetterYTM (userscript) | N | N | N | N | N | **Y** (queue items) | N | N | P (like/dislike keys) | N | N | ? | Y (every feature toggles) |
| P-key save userscripts | N | N | N | P (opens native dialog) | N | N | N | N | P (P = save dialog) | N | N | ? | N |
| YouTube Music: TOOLKIT (userscript) | N | N | N | P (per-song add-to-playlist button; unverified detail) | N | N | N | N | N | N | N | ? | ? |
| Pear Desktop | P (HTTP API only) | P (HTTP API only) | N | N | P (album-actions: all) | P (API only) | P (API only) | N | P (playback only, global) | P (like-all; enqueue-playlist API PR open) | N | n/a (own app) | Y (plugins default off) |
| ytmdesktop | N | N | N | P (player-bar button opens native dialog; disabled on Wiz) | N | N | N | N | P (thumbs + playback, global) | N | N | n/a | ? |
| Native clients (limusic, Orchard, JAMC) | n/a (own UI; queue editing in app) | n/a | P (JAMC Ctrl+S menu) | ? | ? | Y (in app) | Y (in app) | N | P | ? | ? | n/a | n/a |

Sources: §2–§5 rows' citations. The 2.0 row is from [R1, R2]. Its PROVISIONAL rows wait on ticket 25 live checks.

---

## 10. White space

1. **One-click queue actions in the page itself.** No extension, userscript or wrapper puts Play next and Add to queue on YouTube Music's own song rows, cards and album/playlist headers. This is 2.0's clearest unoccupied ground.
   - The nearest substitutes are toolbar popups (Companion, the AMO mini player) and Pear's HTTP API.
   - The demand is the "add to queue button next to play" request [D1] and Pear #1083/#2820/#4753.
2. **A one-click save to a chosen playlist, with a searchable picker that shows membership.**
   - Existing options all open YouTube Music's own dialog: two P-key userscripts and ytmdesktop's bar button (now disabled on the Wiz UI).
   - Companion saves only the current song, from its popup.
   - Search in the dialog (BetterYTM #197; the Greasy Fork filter script) and "which playlists hold this song" (Pear PR #4748; BetterYTM #184) are separately requested. 2.0's picker covers both (YM-PICK-3/4/6) [R2].
3. **Keys that act on the pointed-at item** (Alt+N/Q/P/L/R). Nobody does this, and every hotkey tool is playing-song-only.
4. **Undo.** No competitor offers it for queue or save actions.
5. **Resilience to the Wiz miniplayer.** 2.0 doesn't depend on the player bar for actions on the playing song (YM-BAR-1) [R2]. In October 2026 that is a demonstrable difference, given §6.
6. **Whole albums and playlists from their headers, in the page.** Native: ⋮, two clicks. Companion: popup only. Pear: an API PR (#4715).

**Not white space:**
- *Moving queued items*: native drag, Companion, Pear API.
- *Opt-in modularity*: BetterYTM, Pear plugins, Companion's row toggles.
- *"Uses your own session, no Data API"*: Companion and the AMO mini player say the same.

On YouTube Music these are table stakes, not a USP.

**Positioning implication (inference):**
- Every CWS/AMO result that ranks for "youtube music" has "YouTube Music" or "YTM" in its name [C0, A0].
- A listing named for YouTube in general would need "Play next", "Add to queue" and "YouTube Music" in its title or summary to be found by these users (unverified; store ranking is opaque).
- Companion is the one to watch: it is fast-moving (dozens of commits a week), GPL-3.0, and makes the same privacy pitch. **It could add in-page buttons at any time.**

---

## 11. "A browser extension, not a desktop client": advantage or limitation?

**Advantages for 2.0's job (in-page, one-click, the user's own session):**
1. **No second sign-in.**
   - The extension uses the browser's existing Google session.
   - Desktop wrappers hit Google's embedded-browser block: "This browser or app may not be secure" (ytmdesktop #866, 47 comments; #1017; Pear #538, #594, #2036 open since 2024-05-08) [G17].
2. **Casting works in Chrome tabs.**
   - Casting is the **top or near-top request** on both wrappers: ytmdesktop #29 (+45, since 2019-07-15); Pear #113 (+36, since 2021-01-02) [G16].
   - 2.0 already handles casting (spec §15) [R2].
3. **It coexists with the ecosystem users already run.**
   - Better Lyrics (100k), ThemeSong (60k) and the installed YouTube Music app.
   - Users build their "desktop app" exactly this way [D14]. 2.0's installed-app-window support (YM-APP-1) targets it [R2].
4. **Fixes reach users through store auto-update.** The wrappers' last releases were 2026-06-28 (Pear) and 2026-09-08 (ytmdesktop). ytmdesktop users were told to download zips from GitHub Actions [G2].
   - **Caveat:** the speed is the maintainer's, not the form factor's. BetterYTM and Web Scrobbler are extensions and still broken [G15, G22].
5. **Reach and footprint:** Chrome, Firefox and the Chromium family; no installer or admin rights; no Electron. Pear's main window "runs without the Chromium sandbox", per Pear #4729 (2026-10-02) [G1].
6. **The page is where the actions belong.** Wrappers inject into the same page, so they have no structural advantage for in-page buttons, and they haven't built them (§5.1).

**Limitations:**
1. **No control from outside the tab.**
   - 2.0's keys are caught in the page (ADR-0004; browser-command keys are open item PAR-NEW-35) [R1].
   - Desktop clients and several extensions offer global or browser-wide keys, and reviewers ask for them (§3.2).
   - **"Act on the song I'm hearing while I work in another app" is a real gap**, partly covered by 2.0's popup Playing now row [R2 §17].
2. **No OS or third-party integrations:** tray, Discord, Last.fm scrobbling, OBS, Stream Deck via local APIs (Pear api-server; ytmdesktop companion server) [G3, G4]. These are out of scope for 2.0 by principle (no servers; modular).
3. **No reach into wrapper users.** Pear and ytmdesktop users can't install a browser extension into those apps (inferred; unverified whether either loads Chrome extensions).
4. **Firefox has no casting, and mobile is out of scope** [R1, R2 §19].
5. **Same fragility as wrappers.** An extension rides YouTube Music's DOM and internals exactly as wrappers do. Only native clients avoid that, and they trade it for InnerTube and anti-bot churn [R4 §7, G18].

**Verdict:**
- For one-click actions on what you're looking at, being an extension is an advantage: it lives in the page and the user's own browser, ships through stores, and works in the installed app.
- For control from anywhere, it is a limitation, and that is the niche of popup mini players and desktop clients.
- The cheapest way to narrow the gap stays opt-in: browser-command keys with no default binding (PAR-NEW-35), plus the existing Playing now row.

---

## 12. Gaps and unverified items

- **Live Reddit scores and Google Help Community threads** weren't readable. Reddit figures are archive snapshots, and no Google thread counts exist here.
- **A competitor whose listing isn't in English or doesn't contain "YouTube Music"/"YTM"** may have been missed. Searches covered CWS (12 queries), AMO (10), Edge (6), Greasy Fork (13) and OpenUserJS (2).
- **Companion, the AMO mini player and Better Lyrics** had no Wiz breakage reports, but I didn't test them.
- **Whether the mini players find the installed app window's tab** wasn't tested.
- **YouTube Music's own Undo** for queue and save toasts on web wasn't verified ("?" in the matrix).
- **Cellar** (Reddit 2026-10-03) and **MusicDesktop** weren't located beyond their Reddit posts.

---

## Sources

All retrieved 2026-10-19 unless dated otherwise.

**Repo (internal)**
- [R1] `/home/alioun/projects/yt-playlist-tools/.scratch/rebuild/spec.md` (assembled 2026-10-19)
- [R2] `/home/alioun/projects/yt-playlist-tools/.scratch/rebuild/spec/03-youtube-music.md` (§3–§5, §15–§17, §19–§20; YM-BAR-1, YM-PICK-3/4/6, YM-APP-1)
- [R3] `/home/alioun/projects/yt-playlist-tools/.scratch/rebuild/issues/26-youtube-music-quick-actions.md`
- [R4] `/home/alioun/projects/yt-playlist-tools/.claude/worktrees/agent-a08601ecfe0c4c63d/docs/research/youtube-music.md` §7 (churn table, 2026-10-19)

**YouTube Music**
- [N1] https://music.youtube.com/ HTML, `ytcfg.HOTKEY_DIALOG`, client `1.20261018.16.00`, fetched signed out 2026-10-19

**AMO** (API `https://addons.mozilla.org/api/v5/addons/addon/<slug>/` and `/api/v5/ratings/rating/?addon=<slug>`)
- [A0] AMO search API, queries "youtube music", "ytm", "youtube music queue", "youtube music hotkeys", "play next", "add to queue", "youtube music playlist", "youtube music enhancer", "youtube music shortcuts", "music.youtube.com"
- [A1] https://addons.mozilla.org/en-US/firefox/addon/youtube-music-mini-player/ (and reviews)
- [A3] https://addons.mozilla.org/en-US/firefox/addon/google-music-hotkeys-webext/ (and reviews)
- [A4] https://addons.mozilla.org/en-US/firefox/addon/youtube-music-player/ (and reviews)
- [A5] https://addons.mozilla.org/en-US/firefox/addon/toolbar-control-for-youtube-mu/
- [A6] https://addons.mozilla.org/en-US/firefox/addon/companion-for-youtube-music/
- [A7] https://addons.mozilla.org/en-US/firefox/addon/ytm-enhancer/
- [A8] https://addons.mozilla.org/en-US/firefox/addon/better-lyrics/
- [A9] https://addons.mozilla.org/en-US/firefox/addon/themesong-for-youtube-music/
- [A10] https://addons.mozilla.org/en-US/firefox/addon/better-youtube-music/

**Chrome Web Store** (listing pages, `?hl=en`; reviews at `/reviews`)
- [C0] https://chromewebstore.google.com/search/youtube%20music plus 12 other queries ("youtube music queue", "ytm", "youtube music hotkeys", "youtube music playlist", "youtube music mini player", "youtube music enhancer", "youtube music play next", "youtube music shortcuts", "yt music", "youtube music add to playlist", "youtube music controls", "youtube music like")
- [C1] https://chromewebstore.google.com/detail/effdbpeggelllpfkjppbokhmmiinhlmg (Better Lyrics)
- [C2] https://chromewebstore.google.com/detail/bgfiegdbajagebogifobkhambpljbfmk (ThemeSong; review 2026-10-01)
- [C4] https://chromewebstore.google.com/detail/iifmpealppkjdljfhbjcdgdgglflnfkl (Companion; reviews)
- [C5] https://chromewebstore.google.com/detail/kmimeeohdfapbhmgjehdcngnplofcean (YTM Mini)
- [C6] https://chromewebstore.google.com/detail/aaikooaeajlfemfgfmembjkpbppmfloo (Pink Player; reviews)
- [C7] https://chromewebstore.google.com/detail/nmpengmkpengmegfjalafocodjmdmmca (YouMuse)
- [C8] https://chromewebstore.google.com/detail/bilcedjabgiedoamakekncokccabdccp (YTM Enhancer)
- [C9] https://chromewebstore.google.com/detail/fgjkdpncbpnlhbdbmelbhmapblgaamkl (YouTube Music Hotkeys, lidel; reviews)
- [C10] https://chromewebstore.google.com/detail/impgkfkkdnhgblaldcdbjolladgkcdnl
- [C11] https://chromewebstore.google.com/detail/hibfbbecflojmekadpnhllaaidmkhdbb
- [C12] https://chromewebstore.google.com/detail/ggjkoecdjegahefiaibfnjgkebhijgpf (returns an empty store shell on 2026-10-19)
- [C13] https://chromewebstore.google.com/detail/nnpgbfkmlfneiclbeaniejaheojikhnb
- [C14] https://chromewebstore.google.com/detail/iggmfincgcgnckljenalmhilapdeeina (Skip YouTube Music Dislikes; reviews 2024-10-02 … 2026-10-16)
- [C15] https://chromewebstore.google.com/detail/lkieghnbgfnidfhdeclkjkmnjokmkmdc (YouTube Music +)
- [C16] https://chromewebstore.google.com/detail/ajdfmlbidpfcnmlkenanbeebanolpppl (BetterYTMusic)
- [C17] https://chromewebstore.google.com/detail/iokhakgaadjameaempjifelclddcncfg (FIX.YTM)
- [C18] https://chromewebstore.google.com/detail/gnflndpgbhdpcgcmaegdecabbeacciic (Queue Saver)

**Edge Add-ons** (`https://microsoftedge.microsoft.com/addons/v4/getfilteredorderedsearch?...&Query=` and `/addons/getproductdetailsbycrxid/<id>`)
- [E0] the Edge search endpoint above, 6 queries
- [E1] https://microsoftedge.microsoft.com/addons/detail/mjfeaklppoegooljmjicjdbiccgjdlhd (Better Lyrics)
- [E2] https://microsoftedge.microsoft.com/addons/detail/opepnmhamjjakpfbdiglkpkemejgpnah (YTM Mini)
- [E3] https://microsoftedge.microsoft.com/addons/detail/gamefnibdabclmkngggcjghpbhjmajkm (YTM Enhancer)
- [E4] https://microsoftedge.microsoft.com/addons/detail/cccmmkfhbjgchhgfacbllhkpgblfaodj (YTM Mini Mode); https://microsoftedge.microsoft.com/addons/detail/pldfnpciekkfilhlaeoncmejmdhkhjci (Focus Mode)
- [E5] https://microsoftedge.microsoft.com/addons/detail/fdjcdokkhimaedceldkjafmghjfchbam (SynQ)
- [E6] https://microsoftedge.microsoft.com/addons/detail/obiekdelmkmlgnhddmmnpnfhngejbnnc (Web Scrobbler)

**Userscripts** (Greasy Fork API `https://api.greasyfork.org/en/scripts.json?q=…` and `/scripts/<id>.json`)
- [U1] https://greasyfork.org/scripts/475682 (BetterYTM)
- [U2] https://greasyfork.org/scripts/471575-ytm-add-to-playlist-shortcut
- [U3] https://greasyfork.org/scripts/544566-add-to-playlist-shortcut-for-youtube-music
- [U4] https://greasyfork.org/scripts/530905-youtube-music-toolkit-sort-by-play-count-skip-to-chorus-and-more
- [U5] https://openuserjs.org/scripts/Sv443/BetterYTM (408 installs; OpenUserJS search for "youtube music", "ytm")
- [U6] https://greasyfork.org/scripts/549776 ; https://greasyfork.org/scripts/577625-youtube-music-playlist-album-filter
- [U7] https://greasyfork.org/scripts/484237-better-youtube-music

**GitHub**
- [G1] https://github.com/pear-devs/pear-desktop (stars, issues list since 2026-09-25: #4729, #4748, #4715)
- [G2] Wiz breakage:
  - https://github.com/pear-devs/pear-desktop/issues/4727 (2026-10-01), /4728, /4741, /pull/4750 (2026-10-13), /pull/4746;
  - https://github.com/ytmdesktop/ytmdesktop/issues/1819 (2026-09-29; maintainer comments 2026-09-29 … 10-10), /1807
- [G3] https://github.com/pear-devs/pear-desktop/tree/master/src/plugins (plugin list, `shortcuts/index.ts`, `album-actions/index.tsx`, `api-server/backend/routes/control.ts`, `scheme/queue.ts`); releases https://github.com/pear-devs/pear-desktop/releases (v3.12.0 2026-06-28)
- [G4] https://github.com/ytmdesktop/ytmdesktop (`src/shared/store/schema.ts` shortcuts; `src/renderer/ytmview/scripts/playerbarcontrols.script.js`; `companion-server/api/v1/index.ts`); releases (v2.0.12 2026-09-08)
- [G5] https://github.com/pear-devs/pear-desktop/issues/2820 (2025-01-03), /4753 (2026-10-14)
- [G6] https://github.com/pear-devs/pear-desktop/issues/1083 (2023-03-18)
- [G7] https://github.com/pear-devs/pear-desktop/issues/2870 (2025-01-15), /pull/4137 (2025-12-09)
- [G8] https://github.com/pear-devs/pear-desktop/issues/3750 (2025-08-14), /4631 (2026-08-05)
- [G10] https://github.com/benesmartin/youtube-music-companion (README; commits 2026-10-12/13)
- [G11] https://github.com/lidel/google-music-hotkeys/issues/25 (2026-10-05), /pull/26 (2026-10-07)
- [G12] https://github.com/KristofferTroncoso/ThemeSong/commits (2026-10-04 … 10-09)
- [G13] https://github.com/Sv443/BetterYTM (README features; releases v3.1.0 2026-04-15, 4.0.0-beta.1 2026-09-12)
- [G14] https://github.com/Sv443/BetterYTM/issues/98 (2024-06-11), /166 (2026-03-27), /197 (2026-09-18), /184 (2026-08-30)
- [G15] https://github.com/Sv443/BetterYTM/issues/198 (2026-09-29)
- [G16] Top issues by 👍: https://github.com/pear-devs/pear-desktop/issues?q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc (#4684, #737, #113, #4004); https://github.com/ytmdesktop/ytmdesktop/issues?q=is%3Aissue+is%3Aopen+sort%3Areactions-%2B1-desc (#29, #46, #114, #306, #1570)
- [G17] https://github.com/ytmdesktop/ytmdesktop/issues/866, /1017; https://github.com/pear-devs/pear-desktop/issues/538, /594, /2036
- [G18] https://github.com/SimoHypers/limusic (README; v1.3.0 2026-10-19)
- [G19] https://github.com/SFG5453/Orchard (README, `docs/app/shortcuts.md`, `docs/app/queue.md`)
- [G20] https://github.com/2latemc/JustAnotherMusicClient (README; v1.3.2 2026-08-12)
- [G21] https://github.com/NUber-dev/YTubic ; https://github.com/KiyoshiTheDevil/Kodama
- [G22] https://github.com/web-scrobbler/web-scrobbler/issues/6242 (2026-09-29; comments to 2026-10-19)
- [G23] https://github.com/better-lyrics/better-lyrics/commits (2026-10-19, #1013)

**Reddit, r/YoutubeMusic** (via the Arctic Shift API `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=YoutubeMusic…`; archived scores)
- [D1] https://www.reddit.com/r/YoutubeMusic/comments/1ff75x7/ (2024-09-12, "Wish it was easier to add to queue"; comments)
- [D2] https://www.reddit.com/r/YoutubeMusic/comments/15884si/ (2023-07-24)
- [D3] https://www.reddit.com/r/YoutubeMusic/comments/15m6055/ (2023-08-09); /17iylw4/ (2023-10-29); /15hp9mc/ (2023-08-04)
- [D4] https://www.reddit.com/r/YoutubeMusic/comments/1mg4puq/ (2025-08-02)
- [D5] https://www.reddit.com/r/YoutubeMusic/comments/1pt9sgj/ (2025-12-22); /1pvtro4/ (2025-12-26); /1uoqibx/ (2026-07-06); /1t0k60l/ (2026-05-01); /1m0gsko/ (2025-07-15)
- [D6] https://www.reddit.com/r/YoutubeMusic/comments/1u29t6l/ (2026-06-10)
- [D7] https://www.reddit.com/r/YoutubeMusic/comments/1vwniii/ (2026-08-24)
- [D8] https://www.reddit.com/r/YoutubeMusic/comments/1q5za02/ (2026-01-06)
- [D9] https://www.reddit.com/r/YoutubeMusic/comments/1wv7swk/ (2026-10-01; comments)
- [D10] https://www.reddit.com/r/YoutubeMusic/comments/1x15law/ (2026-10-08)
- [D11] https://www.reddit.com/r/YoutubeMusic/comments/1u3rkfq/ (2026-06-12)
- [D12] https://www.reddit.com/r/YoutubeMusic/comments/1wwzxqy/ (2026-10-03, Cellar); /1wdv021/ (2026-09-11, Orchard)
- [D13] https://www.reddit.com/r/YoutubeMusic/comments/1wiaz5l/ (2026-09-16; comments naming limusic and the naming ban)
- [D14] https://www.reddit.com/r/YoutubeMusic/comments/1fnn4kl/ (2024-09-23)
- [D15] https://www.reddit.com/r/YoutubeMusic/comments/1iivihs/ (2025-02-06); /1m72tr1/ (2025-07-23); /1hbu76n/ (2024-12-11); /1nw5str/ (2025-10-02); /1t6w8j1/ (2026-05-08)
- [D16] https://www.reddit.com/r/YoutubeMusic/comments/1qnbbw9/ (2026-01-26)
