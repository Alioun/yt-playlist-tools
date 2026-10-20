# GatherTube in 2.0

Research for rebuild [ticket 31](../../.scratch/rebuild/issues/31-gathertube.md), done on 2026-10-20. The question: how does every feature of [GatherTube](https://github.com/karimelgazar/gathertube) fold into 2.0, plus exactly two additions (a playlist to gather into, and an automatic option), with credit?

Sources are listed at the end. [S…] is a source, [L…] is a live test run for this note, and [C] is GatherTube's own code at `0d3f3f5` (2025-10-14). Store data and live tests are from 2026-10-20.

## Short answer

- **GatherTube is small.** One action gathers the current window's YouTube video tabs, de-duplicated and sorted six ways, into one of two places: YouTube's own `watch_videos` list, or its own player page with an embedded YouTube player. It can close the gathered tabs. The rest is the player page's queue panel, a few keys and a settings page.
- **It ports as one 2.0 feature, "Gather tabs",** off by default, with no page code at all. Off, it costs nothing; on but idle, it costs nothing either. It needs no new permission: YouTube host access already shows YouTube tabs' addresses and titles, without `tabs` [S1][S2][L3][L4].
- **What's broken in GatherTube today:**
  - its embedded player fails with YouTube's error 153 in both browsers, because extension pages send no Referer [S5][S6][L3][L4];
  - `watch_videos` keeps only the first 50 videos and silently drops the rest [S9][L1];
  - its Firefox settings page is dead;
  - its title fallback gathers, and can close, tabs that aren't videos;
  - "English first" really means "mostly Latin letters".
- **The embedded player can't come back as an embed.** Beyond error 153, YouTube applies its API Terms and Developer Policies "to all access and use of the YouTube embedded player" [S5], and those policies ban the internal requests 2.0 is built on (ADR-0001). The recommended replacement is **YouTube's own queue**: it held 100 gathered videos in order, signed out, with YouTube's own reorder, remove, clear and play-now [L2]. This is a question for the user (Q1).
- **The playlist target** gathers into a playlist chosen per account. It reuses ticket 12's add flow as a batch: membership first, one report, Undo, never a second copy. A tab closes only once its video is confirmed in the playlist.
- **The automatic option** (Q2, the user's call). Recommended: gather video tabs left unvisited for a day into the gather playlist, checked once an hour by one alarm. It adds no tab listeners and no page code, never wakes a sleeping tab, and frees memory by closing tabs.
- **Credit:** in the feature's settings card, Settings › About, the docs and both store listings. Nothing is copied, so no licence notice is needed. GatherTube's repo has no root `LICENSE`; its MIT grant is in `firefox-build/LICENSE`, `package.json` and on AMO.
- **Spec changes** this would need are listed in [§4.12](#412-what-the-spec-would-change). They aren't made here.

## 1. GatherTube at a glance

| | Chrome Web Store | AMO |
|---|---|---|
| ID | `fmllpbgakbdnamlmdgjhphglebmnoend` | slug `gathertube`, GUID `{e280f7f2-4fb5-455d-a396-9f09533d9060}` |
| Version | 1.1.0 (root, MV3, service worker) | 1.1.1 (`firefox-build/`, MV2, non-persistent background) |
| Updated | 2025-09-24 | 2025-09-23 (reviewed 2025-09-26) |
| Users | 24 | 28 average daily users |
| Ratings | 4.5 from 2 | 3.4 from 5 |
| Permissions | `tabs`, `storage`, `*://*.youtube.com/*`, `*://*.youtu.be/*` | same, plus `data_collection_permissions: none` |

- **Author:** Karim Elgazar. 34 commits from 2025-09-20 to 2025-10-14, 2 stars, 1 fork with no commits of its own, no issues, one self-merged PR ("Firefox support") [S10].
- **The stores ship the repo exactly.** Every script, page and stylesheet in both store packages is byte-identical to the repo at `0d3f3f5`; only the stores' own manifest fields differ [S10].
- **Licence:** MIT. GitHub detects none, because there's no `LICENSE` at the root. The text is in `firefox-build/LICENSE` ("Copyright (c) 2024 GatherTube"), `package.json` says MIT, and AMO shows "MIT License" [S10].
- **What reviewers say:**
  - AMO, 2026-06-26, 1/5: "Open on youtube opens the first video without the queue, and embedded player shows a configuration error."
  - AMO, 2026-09-13, 4/5: it "does what I want with the default settings, but other settings don't work".
  - AMO, 2026-10-07, 2/5: "doesn't work at all … No instructions."
  - Chrome, 2026-01-09, 4/5: music.youtube.com tabs get gathered too, and the reviewer asks for a way to leave them out.
  - The rest are short and positive [S10].

## 2. Inventory

Everything below is in both builds unless a row says otherwise. "Root" is the Chrome build.

### 2.1 Gathering

| # | Item | Behaviour [C] |
|---|---|---|
| G1 | The action | "Gather YT Videos" in the popup; Enter in the popup does the same. |
| G2 | Scope | The current window only. An "all windows" setting existed and was removed on 2025-09-20 (`ec795a6`); the code still hard-codes `currentWindowOnly = true`. |
| G3 | What counts as a video tab | See [§2.7](#27-url-formats). Watch pages (any subdomain, so also `m.` and `music.`), `/live/ID` and `youtu.be/ID`. Not Shorts, embeds, channels, playlists, feeds or search. |
| G4 | Title fallback | When a tab's URL isn't a video URL (and isn't a playlist, `/channel/`, `/c/`, `/user/`, feed or search page), it's still gathered if its URL contains "suspended" and "youtube", or its title contains "youtube", and the title has any 11-character run of `[A-Za-z0-9_-]` that doesn't start with PL, UC, UU, FL or LL. That run becomes the video ID. |
| G5 | Duplicates | Removed by video ID, keeping the first after sorting. |
| G6 | Order | Six options, default **Newest tabs first**. See [§2.2](#22-the-six-orders). |
| G7 | Destination | "Queue behavior": **YouTube Native** (default) or **Embedded Player**. |
| G8 | YouTube Native | Opens `https://www.youtube.com/watch_videos?video_ids=ID1,ID2,…` in a new active tab. |
| G9 | URL-too-long fallback | Over 8,000 characters (about 660 videos), it silently opens the embedded player instead. |
| G10 | Close original tabs | Off by default. Closes every gathered tab except the new queue tab, right after that tab is created. Errors are ignored. The active tab is closed too. |
| G11 | After success | The popup shows "Successfully gathered N video(s)!" and closes itself after 1.5 s. |
| G12 | Settings | `embedMode` (false), `closeTabs` (false), `sortOrder` ("newest") in `storage.local`. The popup and the settings page edit the same three values. `onInstalled` writes all three defaults if any one is missing. |

### 2.2 The six orders

| Option | What the code does |
|---|---|
| Newest tabs first (default) | `lastAccessed`, latest first. The tab you're on comes first. A tab never switched to counts from when it was opened [S1]. |
| Oldest tabs first | `lastAccessed`, earliest first. |
| English videos first | Titles judged "likely English" first, else tab order. |
| Non-English videos first | The reverse. |
| Tabs from left to right | Tab index. |
| Tabs from right to left | Tab index, reversed. |

"Likely English" is true if the title contains two of 47 short words as substrings, or if more than 70 % of its non-space characters are A–Z. Tab titles end in " - YouTube", whose "be" already counts as one word. [L5] ran it on 15 titles: Spanish, German, French, Vietnamese and Portuguese titles all count as English.

### 2.3 The embedded player page

| # | Item | Behaviour [C] |
|---|---|---|
| P1 | One page per window | Gathering again in a window replaces that window's player page (it's updated and focused). Other windows keep theirs. |
| P2 | Player | One `youtube-nocookie.com/embed/ID` iframe with `autoplay=1`, `rel=0`, `iv_load_policy=3`, `fs=0` (no fullscreen button), `disablekb=1` (YouTube's player keys off), `enablejsapi=1`, `origin=<extension origin>`. The IFrame API script isn't loaded, though the README says it is. |
| P3 | Auto-advance | Sends YouTube's player a "listening" message every 10 s, reads its state messages, and moves on 1.5 s after a video ends. It stops after the last one. A 30-minute timer left over from an earlier video can stop the pings for a later one. |
| P4 | Header | Logo and "GatherTube Player"; **Open Queue On YouTube** (`watch_videos` of the current order, commas encoded as `%2C`); the queue toggle with a count badge; **Open On YouTube** (the current video). |
| P5 | Under the player | "Video N of M" (never the real title), ⏮️ and ⏭️ (disabled at the ends), "N of M". The tab title is "Video N of M - GatherTube Player". |
| P6 | Queue panel | Slides in from the right. "Queue", Clear (asks "Are you sure you want to clear the entire queue?"), ×. Rows: drag handle, `hqdefault` thumbnail (grey fallback), title from YouTube's oEmbed ("Loading...", else "Video N"), the word "Video" where a duration would go, and Remove. Click a row to play it. Footer: "N videos" and Shuffle. A click outside closes it; on screens up to 768 px a pick closes it too. |
| P7 | Reorder | Drag and drop. **Root only:** the Firefox build removed the handlers but kept the handles. |
| P8 | Remove | Removing the playing video plays the next (or the previous, if it was last). Removing the last one asks to clear. |
| P9 | Shuffle | Fisher–Yates, keeping the playing video playing. |
| P10 | Clear | Empties the list and shows "Queue cleared. Use the extension to gather new videos." The video keeps playing, because the code calls a player object that's always null. |
| P11 | Errors | Loading overlay "Loading videos..."; "⚠️ Unable to Load Videos" with Retry, which calls a method that doesn't exist. Texts: "No video IDs found. Please use the extension to gather videos first.", "No video IDs found to play.", "Player container not found.", "Failed to initialize video player: …". A troubleshooting block (ad blockers, try `watch_videos`) can never show. |
| P12 | Persistence | The list is in the page URL (`?ids=…&windowId=…`) and in `storage.local` as `currentQueue_<windowId>` and `queueTimestamp_<windowId>`. A reload reads the URL, so removals, reorders and shuffles are lost. The keys are never deleted. |

### 2.4 Keys

| Key | Where | Action |
|---|---|---|
| Enter (no modifiers) | Popup, anywhere | Gather |
| P | Player page | Toggle the queue panel |
| Escape | Player page, panel open | Close the panel |
| Shift+→ and N | Player page | Next video (wraps around, unlike the button) |
| Shift+← and B | Player page | Previous video (wraps around) |

- Each player key shows a red chip at the top right for 1 s, such as "Next Video (Shift + →)". **Root only:** the README promises it on Firefox too.
- Keys are ignored in text fields, and don't reach the page while the iframe has focus.
- The settings page lists five of them; N and B are only in the README.

### 2.5 The settings page

| # | Item | Behaviour [C] |
|---|---|---|
| S1 | Default Behavior | The same three settings as the popup, saved on change with "Settings saved successfully". The text says "You can always override these in the popup", but both edit the same values. |
| S2 | Keyboard Shortcuts | A read-only list (§2.4). |
| S3 | Extension Information | Version, "Videos in current queue" and "Last queue update" (relative times like "5 minutes ago"). The last two read keys that are never written, so they always show 0 and "Never". |
| S4 | Data Management | "Reset All Settings" asks first, then clears all of `storage.local`, queues included. |
| S5 | Footer | Report Issue (GitHub issues), Rate Extension (a store URL with no item ID, which lands on the store's home page) and View Source. |
| S6 | Firefox | Dead. Its script looks up IDs the page doesn't have, shows "Failed to load settings", then stops. No control saves, Reset and the links do nothing, and the version reads a hard-coded "1.0.0". |

### 2.6 Messages

- Popup: "Successfully gathered N video(s)!", "No YouTube video tabs found.", "Failed to gather videos: …", "Failed to create watch_videos queue: …", "Failed to create embedded queue: …", "Failed to communicate with extension", "Failed to load settings", "Failed to save settings".
- Player page and settings page: as in §2.3 and §2.5.
- Not shown though planned (PRD): "Too many videos to open via watch_videos URL; switching to embedded queue."

### 2.7 URL formats

[L5] ran GatherTube's own matching on these tabs.

| Tab | GatherTube |
|---|---|
| `youtube.com/watch?v=ID` (also with `list=`, `t=`, `app=desktop`) | Gathered; `list` and `t` are dropped |
| `m.youtube.com/watch?v=ID` | Gathered |
| `music.youtube.com/watch?v=ID` | Gathered (the Chrome review's complaint) |
| `youtube.com/live/ID` | Gathered |
| `youtu.be/ID` | Gathered (a loaded tab is already on `youtube.com/watch`) |
| `youtube.com/shorts/ID` | Skipped, unless the title has an 11-letter word: "Unbelievable trick #shorts" gathers the bogus ID `Unbelievabl` |
| `youtube.com/embed/ID` | Skipped |
| Channel pages by `@handle` | Usually skipped. "3Blue1Brown - YouTube" gathers `3Blue1Brown`, and "Technology Connections" gathers `Connections` |
| Any site whose title mentions YouTube | "YouTube Communities - r/youtube" (Reddit) and a news article "Why YouTube Premium subscriptions are skyrocketing" are gathered as `Communities` and `subscriptio` |
| A tab parked by a suspender extension (`…/suspended.html#…&uri=https://www.youtube.com/watch?v=ID`) | Gathered by the URL inside it. This needs `tabs`, since the tab's own address isn't YouTube's |

With **Close original tabs** on, every row marked gathered is closed, including the Reddit tab and the article.

### 2.8 Promises that don't hold

| Promise | Where | Reality |
|---|---|---|
| Drag & drop reordering | Both listings, README | Root only |
| "Queue Persistence: Your queue survives browser restarts" | README; listings say "persist video queues" | Only the list as first gathered; edits are lost on reload |
| "Add" to queues | Both listings | No way to add; gathering again replaces |
| "YouTube IFrame API" powers the player | README | Not loaded; a bare iframe |
| "100% Feature Parity", "Identical interface and shortcuts" | README | Firefox lacks drag and drop, the key chip and a working settings page |
| Queue statistics in settings | README | Always 0 and "Never" |
| "~50KB" | Listings | 541 KiB and 548 KB, mostly a 458 KB logo |
| Dark mode setting, shortcut settings, cached durations and channel names | Privacy policy | None of these exist |
| "Ensure YouTube IFrame API can load", troubleshooting help | README | Unreachable |

## 3. What's broken today, and why

### 3.1 Summary

| Part | State | Why | Evidence |
|---|---|---|---|
| YouTube Native, up to 50 videos | Works | `watch_videos` still answers 303 to `watch?v=FIRST&list=TLGG…`, an "Untitled List" in the given order that plays through by itself, with YouTube's Shuffle and Loop | [L1][L2][S9] |
| YouTube Native, over 50 | Silently loses videos | YouTube keeps the first 50 IDs, in order, and drops the rest (tested with 51, 100, 200 and 662). With Close original tabs on, the rest are closed and gone | [L1][S9] |
| The 8,000-character fallback | Never matters | The 50 cap bites long before it. YouTube accepts up to 16,384 bytes of path and query, then answers 400 | [L1] |
| A live stream in the list | Stops the list there | A live item never ends | [L1] |
| The embedded player | Broken in both browsers | Error 153, "Video player configuration error": extension pages send no Referer, which YouTube has required since July 2025 | [S5][S6][S7][L3][L4] |
| Auto-advance | Never fires | Nothing plays. GatherTube also ignores the player's `onError`, so its own error box never shows | [L4] |
| Queue titles (oEmbed) | Work | Three `oembed` requests answered 200 | [L4] |
| "Open Queue On YouTube" | Unreachable, though it would work | It's on the player page, which can't play. `%2C` commas give the same list as plain ones. The AMO review's "opens the first video without the queue" fits the neighbouring **Open On YouTube**, which opens only the current video by design | [C][L1] |
| Drag reorder, Firefox | Absent | Handlers removed in the Firefox build | [C][L4] |
| Settings page, Firefox | Dead | Element IDs don't match: "Failed to load settings", then `this.saveBtn is null`; no control saves | [C][L4] |
| Queue statistics | Always 0 / "Never" | Wrong storage keys | [C] |
| Retry, Clear, Rate | Broken | Missing method; null player; URL without an ID | [C] |
| Edits surviving a reload | Lost | The URL wins over storage | [C] |
| English first / non-English first | Misleading | Latin letters count as English | [C][L5] |
| Title fallback | Harmful | Gathers, and can close, non-video tabs. Its made-up IDs are well formed, so YouTube drops them from the middle of a list; one that lands first opens as "This video isn't available anymore" | [C][L1][L5] |

### 3.2 Live results

**Firefox 158** [L4] (signed out; headless through WebDriver BiDi; GatherTube's `firefox-build/` as a temporary add-on; logs in [`gathertube/firefox158/`](gathertube/firefox158/)):
- **Gathering works.** Four tabs (one a duplicate with `&t=5s`) gave three videos and "Successfully gathered 3 video(s)!".
- **YouTube Native works:** a 303 to `watch?v=…&list=TLGG…`, "Untitled List · Unlisted · 1 / 3" in tab order, auto-advancing (with ads, signed out). Two fresh profiles got the same list ID for the same videos on the same day; the ID ends in the date.
- **The embedded player shows "Video player configuration error / Error 153"** and never plays. The iframe's request carries no Referer.
- **Every embed from a `moz-extension:` page fails the same way,** in 12 variants: both domains, with and without `origin`, four `referrerpolicy` values, a page-wide `unsafe-url`, `widget_referrer`, and `playlist=`. Firefox sends no Referer from an extension page under any policy.
- **What else fails:**
  - a top-level tab the extension opens at `embed/…?playlist=…` (Error 153);
  - a sandboxed page (opaque origin; Error 153);
  - any embed whose Referer is youtube.com, including one injected into a YouTube page: "This video is unavailable", Error 152-4.
- **What plays:** the `watch_videos` list on YouTube's own watch page, and any embed whose Referer is a non-YouTube https page, including a chain extension page → https page → embed. That last one is the "relay page" route, which §4.5 rules out.
- **Tabs without `tabs`:**
  - `tabs.query` returns `url`, `title` and `favIconUrl` for YouTube tabs only; `lastAccessed`, `index`, `discarded` and `status` for every tab. A `url` query returns exactly the watch tabs.
  - A filtered `tabs.onUpdated` (watch URLs, `url` and `status`) fired only for the watch tabs.
  - With the host permission revoked, nothing is visible and the filtered listener stops firing.
- **A tab opened in the background** loads at once and runs content scripts while hidden, but its video stays paused. Its `lastAccessed` is its creation time until it's switched to.

**Chrome 155** [L1][L3] (Chrome for Testing 155.0.8059.84, with key cases repeated in Chromium 156; signed out; headless; logs in [`gathertube/chrome155/`](gathertube/chrome155/)):
- **`watch_videos`:**
  - every size from 1 to 662 IDs answered 303 to a `TLGG` list holding the first 50 given, in order;
  - the list plays through by itself (`index=2`, `3`, …), keeps duplicates, and plays Shorts and made-for-kids videos;
  - a missing video is dropped from the middle; if it's first, the list opens on "This video isn't available anymore";
  - one malformed ID (`abc`) loses the whole list;
  - the list ID is the content plus the date: the same videos on the same day give the same ID, across profiles, and a list still opened 1.5 h later in a fresh profile.
- **Embeds from a `chrome-extension:` page:** every variant shows "Video player configuration error · Error 153", with no Referer sent under any `referrerpolicy`. The same iframe on https://example.com plays; with `referrerpolicy="no-referrer"` there, it fails with 153 too. So 153 means "no Referer".
- **What else fails:**
  - a top-level embed tab, opened by the extension or typed (153);
  - a sandboxed page (blank);
  - an iframe inside a youtube.com page (Error 152-4).
- **On an ordinary site, `embed?playlist=`** took up to 200 IDs in order; 201 failed.
- **GatherTube's end detection** would work where the embed may play: the end arrives as `infoDelivery` with `playerState: 0`, which its listener handles.
- **oEmbed** answers the extension page with titles, even without host permissions.
- **Tabs without `tabs`:**
  - YouTube tabs carried `url`, `title`, `favIconUrl` and, while loading, `pendingUrl`; other sites carried none;
  - `tabs.query({url: "*://*.youtube.com/watch*"})` returned the watch tabs;
  - `onUpdated` gave YouTube tabs' URL and title changes, and only `status` for other sites;
  - `tabs.remove` worked;
  - a `youtu.be` tab is invisible for about 400 ms, until it redirects to `youtube.com/watch`.
- **`windows.getCurrent()` in the worker** returned the first window while another had focus (headless). So the window to gather must come from the popup.
- **A tab opened in the background** loads and runs content scripts while hidden. Chrome defers its video until it's first shown. Its `lastAccessed` is its creation time, so it can't tell whether a tab was ever looked at.

### 3.3 How 2.0 avoids the same breakage

- **No embed.** Nothing depends on YouTube accepting an extension page as a player host (§4.5).
- **No silent cap.** 2.0 sends at most 50 videos to `watch_videos`. More go to YouTube's queue, which held 100 in order [L2].
- **Nothing closes before it's safe.** A tab closes only after its video is confirmed in the destination (§4.4, §5).
- **No guessing from titles.** Only URLs identify videos.
- **One codebase for both browsers,** so the builds can't drift apart as GatherTube's did.
- **Breakage shows.** `watch_videos` and the queue command go on 2.0's watch list, and the feature reports *not working* like any other (ticket 18).

## 4. The fold into 2.0

### 4.1 One feature: Gather tabs

| | |
|---|---|
| Name | **Gather tabs** (registry ID `gather`) |
| Site | YouTube. It sits in the popup's YouTube tab and Settings › YouTube |
| Footprint tag | "Doesn't change the page" |
| Page code | None. `pages: {}` in the registry. Its code is in the background and the popup |
| Show feedback | None. Results show where the user started the gather, in the popup (like the card menu, it raises no toasts) |
| Off | One row with its switch. No listener, no alarm, nothing registered |
| On, idle | Still nothing running. Work happens only on a click, or on the automatic option's alarm |
| Description | "Gathers the YouTube videos open in this window into one list or a playlist, and can close their tabs. Based on GatherTube by Karim Elgazar." |

### 4.2 Where every inventory item goes

"Kept" means GatherTube's behaviour carries over as is. Every other row is a flagged change, with its reason.

| # | GatherTube | 2.0 | Status |
|---|---|---|---|
| G1 | Gather button; Enter in the popup | A **Gather** button on the feature's popup row. Enter gathers while nothing in the popup has focus, which is the state it opens in | Changed: Enter no longer overrides Enter on other controls; the 2.0 popup has many |
| G2 | Current window | The popup's own window, passed explicitly | Kept |
| G3 | Video tabs | Watch pages and `/live/` pages that 2.0 can see: `www.youtube.com` on Chrome, `*.youtube.com` on Firefox, and `music.youtube.com` wherever YouTube Music access is granted | Kept, within 2.0's site access (§4.3) |
| G4 | Title fallback | Dropped | Changed: it gathers and closes non-video tabs (§2.7). Suspender-parked tabs would need `tabs` (Q4) |
| G5 | De-duplicate | Kept | Kept |
| G6 | Six orders, Newest first | Kept, same default | Kept. English first and non-English first use the browser's own language detector on the title (§4.11) |
| G7 | Two destinations | Three: **YouTube's player**, **YouTube's queue** (replacing the embedded player, Q1) and **a playlist** (addition 1) | Changed |
| G8 | `watch_videos` | Kept for up to 50 videos | Kept |
| G9 | Too long → embedded player | Over 50 → YouTube's queue | Changed: YouTube's cap is 50 videos, not 8,000 characters |
| G10 | Close original tabs | Kept, off by default. A tab closes only once its video is confirmed in the destination | Changed: safer timing |
| G11 | Message, popup closes | The popup closes by itself when the new tab opens. A playlist gather keeps it open with the result and Undo | Changed for the playlist only |
| G12 | Three settings | Shared settings that sync; the playlist is in the account setup (§4.8) | Kept |
| P1 | One player per window | One queue tab per gather, in the gathering window | Changed: YouTube's queue lives in its own tab, so gathering again opens a new tab instead of replacing one |
| P2–P3 | Embedded player, auto-advance | YouTube's own watch page plays the list and moves on by itself | Changed (Q1) |
| P4 | Open On YouTube; Open Queue On YouTube | Not needed: the list is already on YouTube | Changed (Q1) |
| P5 | Prev/next, "N of M" | YouTube's own: the player's next button, "1 / 100" in the panel | Changed (Q1) |
| P6 | Queue panel: thumbnails, titles, play now, count, clear | YouTube's queue panel has all of them, with real titles and durations [L2] | Changed (Q1) |
| P7 | Drag reorder | YouTube's queue panel has drag reorder | Changed (Q1); Firefox gains it |
| P8 | Remove | YouTube's per-row menu | Changed (Q1) |
| P9 | Shuffle | YouTube's player destination has YouTube's Shuffle; YouTube's queue has none | Partly lost (Q1) |
| P10 | Clear | YouTube's "Clear queue" | Changed (Q1); it also stops playback |
| P11 | Player errors | Not needed | — |
| P12 | Persistence | YouTube's player list keeps its URL, so it survives a reload. YouTube's queue doesn't survive one, and can't be reopened by URL [L2] | Partly lost (Q1) |
| §2.4 | Player keys P, Escape, N, B, Shift+←/→ | YouTube's own Shift+N and Shift+P on the watch page. No keys of ours on YouTube's pages | Changed (Q1) |
| S1 | Default Behavior | Settings › YouTube › Gather tabs: destination, the account's gather playlist, order, Close gathered tabs, Automatic | Kept |
| S2 | Shortcut list | One line in the card: "In the popup, Enter gathers. On YouTube, Shift+N and Shift+P move through the list." | Kept, reworded |
| S3 | Version, queue size, last update | The version is in Settings › About. The card shows "Last gather: 12 videos into YouTube's queue, 5 min ago" | Kept, now working |
| S4 | Reset All Settings | 2.0's Clear all data. Switching the feature off keeps its settings (FT-11) | Changed: no reset per feature |
| S5 | Report Issue, View Source | 2.0's Report a problem; the credit line links GatherTube's repo | Changed |
| S5 | Rate Extension | Not ported: it rates GatherTube, and its link is broken | Dropped |
| §2.6 | Messages | Rewritten in 2.0's voice (§4.6) | Changed |

### 4.3 Permissions: none new

- **Chrome.** Host permissions alone expose a matching tab's `url`, `pendingUrl`, `title` and `favIconUrl`. `tabs.query({url})` matches only tabs the extension can read [S1]. Live in Chrome 155: YouTube tabs had all four, other sites had none, a `url` query returned the watch tabs, and `tabs.remove` worked [L3].
- **Firefox.** Host permissions expose `url`, `title` and `favIconUrl` since Firefox 86, and `tabs.query({url})` needs "the "tabs" permission or host permissions" [S2]. Live in Firefox 158: YouTube tabs had all three, other sites had none, and a `url` query returned exactly the watch tabs [L4].
- **No permission at all** is needed for `tabs.create`, `update` and `remove`, `windows.getCurrent` or `tab.lastAccessed` (Chrome 121+, Firefox 56+) [S1][S2]. `i18n.detectLanguage` ran in test extensions that declared no permissions in either browser [L5].
- **So `tabs` stays out,** as ARC-MAN-02 and ARC-ACC-53 already require. Adding it would show "Read your browsing history" on Chrome and disable the extension until accepted, and "Access browser tabs" on Firefox [S1][S2].
- **What host access can't see,** and so isn't gathered:
  - `m.youtube.com` on Chrome (out of scope for 2.0 anyway);
  - `music.youtube.com` on Chrome without YouTube Music access;
  - a `youtu.be` tab that never loaded;
  - tabs parked by a suspender extension under its own address (Q4).
- **Sleeping tabs are gathered.** Chrome's Memory Saver and Firefox's unloaded tabs keep their real address and title [S3].
- **If the user withholds YouTube access,** no tab is visible and the feature is *held* with "Needs site access", as every YouTube feature is (FT-13).

### 4.4 The destinations

**YouTube's player (default):**
- Up to 50 videos: open `https://www.youtube.com/watch_videos?video_ids=…` in a new active tab in that window, as GatherTube does.
- Close gathered tabs only once the new tab's address shows `list=TLGG`. If it doesn't within 10 s, nothing closes and the row says so.
- Over 50: use YouTube's queue instead, as GatherTube fell back to its player.
- Needs no page code and no YouTube tab, and works signed out.
- IDs come only from open tabs' URLs, so they're well formed; one malformed ID would lose the whole list [L1].
- A live stream in the list stops it there, in YouTube's player and queue alike. That's YouTube's behaviour and GatherTube's too, so it's kept.

**YouTube's queue** (replaces the embedded player; Q1):
1. Open `https://www.youtube.com/watch?v=FIRST` in a new active tab in that window.
2. Once it loads, inject the site core into that tab (the on-demand probe, ARC-MAN-15).
3. Send the rest to YouTube's queue with one `addToPlaylistCommand` carrying every ID, through YouTube's own command executor. That's 2.0's Add to queue job, given a list; the open-source youtube-queue-persist does the same [S11].
4. Close gathered tabs once the queue panel shows the whole list.

Live, signed out [L2]: 100 videos, all present and in order, with the first playing. The panel reads "Queue 1 / 100" with Clear queue and a menu per row ([screenshot](gathertube/youtube-queue-100.jpg); the 20-video `watch_videos` list for comparison: [screenshot](gathertube/watch-videos-20.jpg)). An earlier 80-video run onto a watch page already playing another video put that video first, then all 80 in order (its log says "in given order: false" for that reason). The queue doesn't survive a reload, and a `TLPQ` link opened in a new tab loads no list.

**A playlist** (addition 1, §5).

### 4.5 Why not an embedded player page

- **Technically it fails.** Since 2025-07-09 YouTube's player answers error 153 when "the request does not include the HTTP Referer header or equivalent API Client identification" [S6][S7]. Chrome and Firefox send no Referer from `chrome-extension:` and `moz-extension:` pages [S8]. Live, every variant tried failed with Error 153: both embed domains, `origin`, `widget_referrer`, every `referrerpolicy`, `playlist=`, a top-level embed tab and a sandboxed page [L3][L4].
- **A youtube.com Referer doesn't help:** an embed inside a YouTube page answers "This video is unavailable", Error 152-4 [L4].
- **The fixes that would work break settled rules:**
  - setting the Referer with `declarativeNetRequest` is a faked header (ARC-MAN-02 bans the permission; ticket 03 bans faked origins);
  - a relay page (extension page → our own https page → embed) did play in Firefox [L4]. But it's a site of ours that every playback depends on (ADR-0001: no server of ours), and YouTube's policies ban using a "nested or hierarchical iframe lineage" to get around them [S12].
- **The terms would bind all of 2.0.** YouTube Help: "The YouTube API Terms of Service and Developer Policies apply to all access and use of the YouTube embedded player." [S5] Those policies forbid undocumented APIs (§III.D) and scraping (§III.E) [S12], which is how every 2.0 job works (ADR-0001). Ticket 03 found the terms don't bind 2.0 only because 2.0 isn't an API client; embedding would make it one.
- **The remote IFrame API script can't load anyway:** both browsers' MV3 extension-page CSP allows only the extension's own scripts [S13].

### 4.6 Where its UI lives

**Popup** (ticket 09's "this tab, this account, right now"; for gathering, "this window"):
- A seventh row in the YouTube tab, after Right-click for the video menu: **Gather tabs**, with a **Gather** button on the row, as auto-add's row carries Pause.
- **Summary:** "Into YouTube's player · newest first", "Into YouTube's queue · left to right", or "Into Later · newest first".
- **Unfolded:**
  - Gather into: YouTube's player / YouTube's queue / A playlist;
  - the playlist chooser while A playlist is picked (one picker, with Watch Later and New playlist, ticket 12);
  - Order;
  - Close gathered tabs;
  - Automatic (§6), shown only while A playlist is picked.
- **Results** show in the row's line, never as toasts:
  - "Gathered 7 videos into YouTube's player." (the popup then closes as the new tab opens);
  - "Saved 7 videos to Later. 2 were already in it." with **Undo**;
  - "No YouTube videos are open in this window.";
  - failures in ticket 12's words ("Couldn't save 1: YouTube doesn't allow saving it.").
- **First view weight:** the row only; the unfolded part loads on demand, inside ticket 24's 45 KB per lazy chunk.

**Settings › YouTube › Gather tabs** (a card like every other):
- the same options;
- "Last gather: 12 videos into YouTube's queue, 5 min ago";
- the keys line (§4.2, S2);
- the credit line (§7).

**First run:** a tickable row with its footprint tag. Step 3 says "Ready", or asks for the playlist if the user picked that destination.

**No new surface.** No player page, so UI-IA-01's list of surfaces stays as it is.

### 4.7 Per window

- A gather reads only the window it was started from. The popup sends its window ID; the background never guesses the "current window", which in Chrome's worker answered with the wrong window [L3].
- New tabs open in that window, and only that window's tabs close.
- A private window gathers its own tabs, as with any other window. Writes follow ticket 12's private-window rules. The automatic option never runs in private windows (§6).

### 4.8 Persistence (ADR-0006)

| What | Where | Syncs |
|---|---|---|
| `gather: { on, destination: "player" \| "queue" \| "playlist", order, closeTabs, auto: { on, after } }` | Shared settings | Yes |
| The gather playlist, per account | `Setup.gather: string \| null` in the account setup (ADR-0003: choices that name a playlist) | Yes |
| "Last gather" (time, count, destination; no video IDs) | `device.lastGather` in `storage.local` | Never |
| The last gather's Undo (added entries, closed tab addresses and positions) | `storage.session` `gathered`, until restart; memory only in private windows | Never |

- GatherTube's per-window queue keys aren't needed: YouTube holds the list.
- Nothing is written on an idle check of the automatic option.
- Clear all data removes all of it.

### 4.9 Keys

- **Popup:** Enter gathers while nothing has focus. It's our own page, so ADR-0004 doesn't apply.
- **On YouTube:** none of ours. YouTube's own Shift+N and Shift+P step through the list. GatherTube's single-letter keys and Shift+arrows lived on its player page; putting them on YouTube's pages would add a page script and override keys YouTube may use, so they don't carry over (part of Q1).
- **No browser `commands`** (ADR-0004).

### 4.10 Budgets (ticket 24)

| Piece | Cost |
|---|---|
| YouTube pages | 0 bytes. The feature has no page file. The queue destination uses the on-demand probe in the one new tab it opens, within the existing page-half and core budgets |
| Background | Gathering, ordering and the automatic check, an estimated 2–3 KB gzip, inside the 25 KB background budget |
| Popup first view | The row, a few hundred bytes, inside the 40 KB |
| Popup and settings lazy parts | Inside 45 KB each; the chooser is the shared picker |
| Idle | Nothing runs. No listener, timer or storage write |

### 4.11 Changes from GatherTube, in one place

1. The embedded player becomes YouTube's queue (Q1).
2. More than 50 videos go to YouTube's queue, not the player page.
3. Tabs close only after the destination confirms the videos.
4. The title fallback is gone; only URLs count.
5. English first and non-English first use the browser's own `i18n.detectLanguage` on the title, without " - YouTube" and the "(3) " count. It needs no permission in either browser. On the same 12 Latin-script titles [L5]:
   - GatherTube's test put 5 on the right side of English / not English;
   - Chrome 155 put 11, and misread one English title ("Big Buck Bunny 60fps 4K …") as Danish;
   - Firefox 158 put 9, misread none, and gave no answer for 3 ("How to cook rice", "La casa de papel: tráiler oficial", "Despacito").

   So the order has three groups: English, then no answer, then other languages (reversed for non-English first). Within a group, tabs keep their left-to-right order, as GatherTube's ties do.
6. YouTube's player and queue use YouTube's own look and keys; the player page's dark red look and keys go.
7. Enter in the popup gathers only while nothing has focus.
8. Reset All Settings becomes Clear all data; Rate Extension goes.
9. music.youtube.com tabs are gathered only where 2.0 has YouTube Music access, and m.youtube.com only on Firefox.

### 4.12 What the spec would change

Not edited here; other tickets are editing these chapters.

- **FT-01, the registry and UI-SET-08:** ten features, adding `gather` with "Doesn't change the page".
- **UI-IA-01 table, UI-POP-15, UI-POP-22, UI-SET-10:** the popup row, its summaries and the settings card.
- **FT-16, ARC-MAN-15, Q-PERF-9:** the on-demand probe also serves the queue and playlist destinations and the automatic option, started by the background, not only by the popup or settings.
- **FT-22, Q-PERF-7:** one alarm while the automatic option is on (already allowed: "no alarm unless a feature that's on needs a schedule").
- **DATA-07, DATA-11, DATA-12:** the keys in §4.8.
- **GLOSSARY.md:** §8. "Auto-add" stops being "the only add path that happens without an explicit user action".
- **06 §6.2.5 job catalogue:** a batch add job, and Add to queue taking a list.
- **Ticket 25's live checks:** §5.4.
- **08 §10 privacy policy:** "To gather, it reads the addresses and titles of the YouTube tabs in that window. Only their video IDs leave your browser, sent to YouTube to build the list or add the videos to your playlist."
- **08 §9 listings and 09 parity:** the credit line, and a row per inventory item.

## 5. The playlist target

### 5.1 What it is

- **The gather playlist** is one playlist per account, chosen in the feature's chooser (Watch Later and New playlist included). It's the user's "vacuumed playlist".
- **It's a destination**, beside YouTube's player and YouTube's queue. A gather into it adds the videos and opens nothing.
- **Until one is chosen** for the account in view, picking A playlist opens the chooser. Gather says "Choose a playlist for {Account} first."

### 5.2 The flow

It's ticket 12's add flow, run as one batch with one report.

1. **Feature on, destination a playlist, a gather playlist on the account in view.** The account is the popup's (ARC-ACC-52).
2. **A serving tab** of that account, signed in. The gathered tabs are YouTube tabs in the same window, so they come first among the candidates. Routing never wakes a sleeping tab (ARC-ACC-56). With no tab answering, the row offers **Open YouTube** and nothing closes.
3. **Membership and account guard, per video:** `get_add_to_playlist` with one video each, one request at a time per tab. A multi-video read only says whether *all* are in [S14], so it can't tell which ones are.
4. **Add the rest in gather order** with `edit_playlist`, several `ACTION_ADD_VIDEO` actions per request. ytmusicapi has sent batched actions since 2020 [S14]. Each video's `setVideoId` comes back for Undo.
5. **Outcomes per video:** added, already in, or failed (made for kids, private, removed, Missing or Full playlist, rate limit, no answer).
6. **Close the tabs** (if Close gathered tabs is on) whose video is now in the playlist, added or already in. A failed video's tab stays open. Several tabs of one video close together.
7. **One report** in the popup row, saves first: "Saved 9 videos to Later. 2 were already in it. Couldn't save 1: YouTube doesn't allow saving it." Failures always show.

### 5.3 Undo, batches and failures

- **Undo** removes exactly the entries this gather added (by `setVideoId`), and reopens the tabs it closed, at their old positions in that window, in the background.
  - Reopening is needed: undoing only the add would leave the videos neither in the playlist nor open.
  - It's offered until the next gather or a browser restart.
- **Never a second copy:** "already in" counts as done, and its tab closes like an added one.
- **Order in the playlist:** appended at the end, in gather order. A playlist YouTube sorts by date or popularity shows YouTube's order.
- **Batch size:** up to 50 actions per `edit_playlist` request, PROVISIONAL until the live check. A failed chunk fails only its videos; their tabs stay open, and **Try again** reruns them from the membership read.
- **Progress** for long gathers: "Checking 12 of 40…". The popup may close; the gather finishes, and the result waits in the row and the card.
- **Rate limit (HTTP 429):** ticket 12's 60 s pause; the remaining videos fail and their tabs stay.
- **Missing or Full playlist:** every video fails, and the playlist is marked as ticket 12 says, with the "!" badge.
- **Concurrency:** ticket 12's coordinator locks per account, playlist and video, so an auto-add of the same video at the same moment ends as "already in".

### 5.4 Live checks to add to ticket 25

- **G1:** `edit_playlist` with 2, 50 and 200 `ACTION_ADD_VIDEO` actions: accepted? Order kept? A `setVideoId` for each?
- **G2:** the same request with one video already in the playlist: does youtube.com reject it, or add a copy?
- **G3:** the one-command queue build, signed in, from a fresh watch tab.
- **G4:** `watch_videos` signed in: still 50, and nothing written to the account?

## 6. The automatic option

**This is the user's decision (Q2).** Every candidate below is opt-in, inside a feature that's off by default.

### 6.1 Constraints any automatic gathering must meet

These are offered to [ticket 33](../../.scratch/rebuild/issues/33-resource-mindful-defaults.md):

1. **Zero while off:** no listener, alarm, timer or storage write.
2. **No tab-event listeners on Chrome.** Chrome's `tabs.onUpdated`, `onCreated` and `onRemoved` take no filter, and an `onUpdated` listener "will be called on every navigation on every tab", waking the worker each time [S1][S4]. `webNavigation`'s URL filters need a "Read your browsing history" permission [S4].
3. **At most one wake-up an hour** from its own schedule.
4. **No page code,** and no injection unless there's work to do.
5. **Never wakes, reloads or undiscards a tab,** and skips frozen ones (ARC-ACC-56).
6. **Bounded work:** one `tabs.query` per check when there's nothing to do. Requests are paced one at a time per tab, at most 50 videos a round, and back off on 429.
7. **Never surprises:** never the active tab of any window, never a pinned or audible tab, never in a private window.
8. **Nothing lost:** a tab closes only after its video is confirmed in the playlist, and Undo brings it back.
9. **Visible:** the popup row and the settings card show the last automatic gather with Undo. Failures follow ticket 12's marks.
10. **Only into the gather playlist.** Opening YouTube tabs by itself would surprise the user and cost memory.

YouTube's policies for API clients also ask that actions like "adding a video to a playlist" be "clearly initiated by the user", with "prior specific and express consent" [S12]. They don't bind 2.0, but the opt-in wording should meet that bar, as auto-add does.

### 6.2 The candidates

| Trigger | User value | Chrome MV3 | Firefox MV3 | Browser cost | Risks | Verdict |
|---|---|---|---|---|---|---|
| **A. Unvisited for a while:** gather video tabs not switched to for 1 h / 1 day / 1 week | High: stale tabs get filed, and memory comes back | One `alarms` alarm (minimum 30 s; we'd use 60 min); `lastAccessed` gives the age, and a tab never switched to counts from when it was opened [S1][S4][L3][L4] | Alarms wake the event page but don't survive a restart, so it's re-created at start-up [S4] | Lowest: ≤ 24 wake-ups a day, one `tabs.query` each. Closing tabs saves memory | A tab kept open on purpose gets filed. Mitigated by the time choice, the exclusions and Undo | **Recommended** |
| **B. Opened in the background:** gather a video tab as soon as it's opened without being switched to | Medium: "open in new tab" becomes "save for later" | `tabs.onCreated` (no filter) wakes the worker for every new tab on every site; its `pendingUrl` shows YouTube addresses [L3]. Or a page script on every YouTube watch page, which sees `visibilityState: "hidden"` [L3] | Filtered `tabs.onUpdated` wakes only for YouTube watch tabs [S4][L4] | A wake-up per new tab anywhere on Chrome, or a script on every YouTube page | High surprise: middle-clicking to watch soon would make the tab vanish | Not recommended |
| **C. Window holds N or more video tabs:** gather once the count passes N | Medium: caps tab hoarding | Needs tab events (as B), or the hourly alarm (then it's A with a count) | Filtered events possible | As B, or as A | Gathers tabs the user may be about to watch, at an arbitrary moment | Not recommended alone; could be a condition on A |
| **D. On window close:** gather a window's video tabs as it closes | Medium | `windows.onRemoved` gives no URLs, so every tab's address must be tracked beforehand; Chrome drops events at shutdown [S4] | Same; Mozilla won't block shutdown for it [S4] | Continuous tracking of every YouTube tab | The job needs a YouTube tab, and the closing window's tabs are gone. At browser exit it can't run: videos lost silently | Not recommended |
| **E. On browser start:** gather restored video tabs into the playlist | Low–medium | `runtime.onStartup`; restored tabs are often unloaded and routing won't wake them | Same; lazy tabs | One check per start | Surprise on every start | Not recommended |
| **F. When the browser is idle:** A, but only while the user is away | Medium | `idle` API: no warning, 15 s minimum [S4] | `idle`: no prompt [S4] | As A, plus one permission | Adds a manifest permission for a small gain | Not needed: A is calm enough |

### 6.3 The recommendation

**A: "Gather video tabs I haven't opened for [a day] into {playlist}"**, as a sub-option of Gather tabs, shown only when the destination is a playlist.
- **Defaults:** off. When switched on: after 1 day, checked hourly.
- **Rules:** the exclusions in §6.1 (7), at most 50 videos a round.
- **Always closes the tabs it gathered,** whatever Close gathered tabs says. Otherwise it would re-read the same tabs every hour, and filing without closing isn't gathering.
- **Runs the job** in any loaded, signed-in YouTube tab of the account that owns the gather playlist, preferring the window being gathered. With none, it waits for the next check; nothing closes meanwhile.
- **Account:** the account of the window's most recently active YouTube tab (ARC-ACC-52, rule 2). If that account has no gather playlist, nothing happens.
- **Shows** "Automatically gathered 4 videos into Later, 2 h ago · Undo" on the row and the card, until restart.

## 7. Credit

- **Nothing is copied.** 2.0 reimplements every behaviour in its own stack (TypeScript, Svelte, its own copy and icons). GatherTube's code, strings, logo and icons aren't reused, so its MIT notice isn't required. If any code is ever copied, add `THIRD-PARTY-NOTICES.md` with GatherTube's MIT text ("Copyright (c) 2024 GatherTube").
- **Visible credit anyway, where users look:**
  - **The feature's settings card:** "Based on GatherTube by Karim Elgazar", linking to `https://github.com/karimelgazar/gathertube`.
  - **Settings › About:** "Gather tabs is a port of GatherTube by Karim Elgazar (MIT licence), which is no longer maintained."
  - **Docs:** a line in `docs/features.md` and the README's credits.
  - **Store listings (08 §9):** "Includes Gather tabs, a port of GatherTube by Karim Elgazar." It fits both descriptions, not the short summaries.
  - **Release notes for 2.0.**
- **The name "GatherTube"** appears only in credit, never as the feature's name or icon.
- **Upstream:** [ticket 32](../../.scratch/rebuild/issues/32-gathertube-upstream-fix.md)'s pull request is the place to tell the author.

## 8. Glossary proposals

In GLOSSARY.md's style, for a new "Gathering" section. Not added here.

**Gather**:
Collecting the video tabs open in one window into one place (YouTube's player, YouTube's queue or the gather playlist), optionally closing them.
_Avoid_: Vacuum, collect, sweep, merge

**Video tab**:
A tab on one YouTube video's watch page or live page. Shorts, channels, playlists and search results aren't video tabs.
_Avoid_: YouTube tab (any youtube.com page), video page

**Destination**:
Where a gather puts its videos: YouTube's player, YouTube's queue or the gather playlist.
_Avoid_: Mode, queue behaviour, target

**Temporary list**:
The list YouTube makes from up to 50 videos when a gather opens them in YouTube's player, shown as "Untitled List" with Shuffle and Loop. It isn't the queue.
_Avoid_: Queue, playlist, watch_videos list

**Gather playlist**:
The playlist a gather adds to when its destination is a playlist: one per account, kept in the account setup.
_Avoid_: Vacuum playlist, vacuumed playlist, target playlist, gathered playlist

**Gather order**:
The order a gather puts its videos in: newest first, oldest first, English first, non-English first, left to right, or right to left.
_Avoid_: Sort order, video order

**Automatic gathering**:
Gathering that runs by itself on unvisited video tabs, into the gather playlist only.
_Avoid_: Auto-gather (too close to auto-add), auto-vacuum

**Unvisited tab**:
A video tab the user hasn't switched to for at least the chosen time.
_Avoid_: Idle tab (the browser's idle state means the user is away), stale tab, inactive tab (the browser's word for any tab that isn't selected)

**Changes to existing entries:**
- **Auto-add:** "The only add path that happens without an explicit user action" becomes "One of two add paths that happen without an explicit user action; the other is automatic gathering."
- **Add:** gathering into the gather playlist joins the list of features. A gather makes one add per video, reported together.
- **Queue:** add "A gather can fill it."

## 9. Open questions for the user

**Q1. GatherTube's embedded player can't come back as an embed. What replaces it?**
- (a) **YouTube's own queue,** in a new YouTube tab (recommended). It keeps reorder, remove, clear, play now, auto-advance, titles, thumbnails and the count, all in YouTube's own panel, at no cost to us. Lost: Shuffle inside the queue (YouTube's player destination keeps YouTube's Shuffle), surviving a reload, and the player page's own keys (YouTube's Shift+N and Shift+P remain).
- (b) **Drop the second destination.** YouTube's player only, with more than 50 videos still going to the queue.
- (c) **An embedded player page anyway.** It needs a faked Referer (a new permission) or a relay page we host, and it brings all of 2.0 under YouTube's API policies, which ban the internal requests it's built on. Not recommended.

**Q2. Which automatic option?**
- (A) **Gather video tabs not opened for a day into the gather playlist,** checked hourly (recommended, §6.3).
- (B) Gather a video tab as soon as it's opened in the background.
- (C) Gather when a window holds N or more video tabs.
- (D) Gather a window's video tabs when it closes.
- (E) Gather restored tabs when the browser starts.

**Q3. Should the automatic option always close what it gathers?**
- Recommended: yes. Filing a tab without closing it isn't gathering, and keeping it open would re-check it every hour.
- Alternative: it follows Close gathered tabs and remembers what it already filed until the browser restarts.

**Q4. Tabs parked by a suspender extension can't be gathered without the `tabs` permission. Accept that?**
- Recommended: yes. Chrome's Memory Saver and Firefox's unloaded tabs are gathered normally. Only third-party suspender pages are missed, and `tabs` would cost every user a "Read your browsing history" warning.

## 10. Deliberately not added

The user's rule is exactly two additions. These came up and stay out:

- **A switch to leave YouTube Music tabs out,** which a Chrome reviewer asked for.
- **Shorts** as video tabs: GatherTube never gathered them on purpose.
- **Gathering from every window:** GatherTube removed it.
- **Opening the gather playlist** after gathering into it.
- **A count on the Gather button,** which would need a tab query on every popup open.
- **Carrying the watch position** (`t=`) into the list.
- **Restoring YouTube's queue after a reload,** as youtube-queue-persist does.
- **A shuffled gather order** to stand in for the queue's missing Shuffle.
- **Keys on YouTube's pages** for next, previous or the panel.
- **Undo for closing tabs** when gathering into YouTube's player or queue: GatherTube had none, and the videos are safe in the list. The playlist's Undo reopens tabs only because undoing the add would otherwise lose them.
- **Gathering into Watch Later only, or into several playlists:** one gather playlist per account.
- **A browser-wide shortcut** to gather (ADR-0004; the popup's own key, Enter, is kept).

## Sources

All read or run on 2026-10-20.

**GatherTube**
- [C] GatherTube source, `https://github.com/karimelgazar/gathertube` at `0d3f3f5` (2025-10-14): `manifest.json`, `background.js`, `popup.*`, `options.*`, `embed_page.*`, `firefox-build/*`, `README.md`, `PRD.md`, `PRIVACY-POLICY.md`.
- [S10] Store and repository data:
  - Chrome Web Store listing and reviews, `https://chromewebstore.google.com/detail/gathertube/fmllpbgakbdnamlmdgjhphglebmnoend`.
  - AMO: `https://addons.mozilla.org/api/v5/addons/addon/gathertube/`, `https://addons.mozilla.org/api/v5/ratings/rating/?addon=gathertube` and `https://addons.mozilla.org/en-US/firefox/addon/gathertube/`.
  - The published packages: AMO file 4584211 (1.1.1), and the CRX 1.1.0 from Google's update service.
  - GitHub: `https://api.github.com/repos/karimelgazar/gathertube`.

**Browsers**
- [S1] Chrome: `https://developer.chrome.com/docs/extensions/reference/api/tabs`, `.../api/permissions`, `.../reference/permissions-list`, `.../develop/concepts/permission-warnings`. Chromium source at `948ca6e1b507`: `tabs_api.cc`, `tabs_event_router.cc`, `event_emitter.cc`.
- [S2] Firefox: `https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs` and `.../API/tabs/query`, `https://extensionworkshop.com/documentation/develop/request-the-right-permissions/`, `.../develop/manifest-v3-migration-guide/`. Firefox source at `fc216bdbdf04`: `ext-tabs.js`, `extensionPermissions.ftl`.
- [S3] Discarded and unloaded tabs: `https://developer.chrome.com/blog/memory-and-energy-saver-mode`, `https://firefox-source-docs.mozilla.org/browser/components/tabbrowser/docs/lazy-browsers.html`.
- [S4] Events, wake-ups and timers:
  - Chrome: `https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events`, `.../service-workers/lifecycle`, `.../reference/api/events`, `.../api/webNavigation`, `.../api/alarms`, `.../api/idle`; `event_router.cc`.
  - Firefox: `https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onUpdated`, `.../API/alarms`, `.../Background_scripts`; `https://bugzilla.mozilla.org/show_bug.cgi?id=1342322`.
- [S8] Referer from extension pages: `https://w3c.github.io/webappsec-referrer-policy/`; Chromium `scheme_registry.cc` and `kurl.cc`; Firefox `dom/security/ReferrerInfo.cpp`.
- [S13] Extension-page CSP: `https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy`, `https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_security_policy`.

**YouTube**
- [S5] YouTube Help, "Embed videos & playlists", `https://support.google.com/youtube/answer/171780`.
- [S6] IFrame Player API reference and revision history (error 153 added 2025-07-09), `https://developers.google.com/youtube/iframe_api_reference`, `.../iframe_api_revision_history`.
- [S7] Required Minimum Functionality (updated 2026-10-15), `https://developers.google.com/youtube/terms/required-minimum-functionality`.
- [S9] `watch_videos`: no official documentation. Third-party reports: `https://github.com/TeamNewPipe/NewPipe/issues/11930` ("maximum length of 50 items") and `https://wiki.archiveteam.org/index.php/YouTube/Technical_details` (lists expire after about two days).
- [S11] youtube-queue-persist, `https://github.com/rockinrimmer/youtube-queue-persist`, `lib/youtube.ts` at `67575a3fa` (2026-10-18).
- [S12] YouTube API Services Terms (updated 2026-09-14) and Developer Policies, `https://developers.google.com/youtube/terms/api-services-terms-of-service`, `.../developer-policies`, `.../developer-policies-guide`.
- [S14] This repo's ticket 01 research (`research/youtube-requests`, `docs/research/youtube-requests.md`): `get_add_to_playlist` returns `containsSelectedVideos: "ALL" | "NONE"`; `edit_playlist` takes a list of actions; ytmusicapi batches since 2020-02-23.

**Live tests for this note**
All signed out, from Germany (YouTube showed region DE). Headless Chrome stops signed-out playback after about a minute (YouTube's bot check), so tests that play to the end used short videos.
- [L1] `watch_videos`:
  - curl, for the 50 cap;
  - Chrome for Testing 155: 1 to 662 IDs, `%2C`, duplicates, missing, malformed, Shorts, made-for-kids and live IDs, URL length, and reopening;
  - Firefox 158: 3 IDs;
  - logs: [`gathertube/chrome155/`](gathertube/chrome155/) (`A-*`).
- [L2] YouTube's queue built with one command, Chrome for Testing 155 headless: 80 and 100 videos, order, reload, reopening by URL, and the panels' buttons beside a 20-video `watch_videos` list. Logs and screenshots: [`gathertube/`](gathertube/).
- [L3] Chrome for Testing 155.0.8059.84 and Chromium 156.0.8078.4, headless, puppeteer-core. Covers 15 embed variants in an extension page and on example.com, tabs without `tabs` in three test extensions side by side, and background-opened tabs. Logs: [`gathertube/chrome155/`](gathertube/chrome155/) (`B-*`, `C-*`, `D-*`, `E-*`).
- [L4] Firefox 158.0, headless over WebDriver BiDi, puppeteer-core. Covers GatherTube 1.1.1's `firefox-build/` as a temporary add-on, 12 embed variants, sandboxed and relay pages, tabs without `tabs` (granted, then revoked), and background-opened tabs. Logs: [`gathertube/firefox158/`](gathertube/firefox158/).
- [L5] Offline and language tests:
  - GatherTube's matching and language test re-run offline on 22 tab addresses and 15 titles ([output](gathertube/gathertube-matching-offline.txt));
  - `i18n.detectLanguage` on 18 titles in Chrome 155 ([output](gathertube/language-detect-chrome155.txt)) and Firefox 158 ([output](gathertube/language-detect-firefox158.txt)).
