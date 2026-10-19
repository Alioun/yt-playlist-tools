# YouTube save, queue and auto-add extensions: the competitive landscape (October 2026)

Research for ticket 30 (`.scratch/rebuild/issues/30-market-and-users.md`), YouTube side only. The question: what does the landscape look like on the Chrome Web Store (CWS), Firefox Add-ons (AMO) and Edge Add-ons for extensions that save, queue or auto-add YouTube videos, and how does it compare with 2.0's YouTube capabilities?

**Retrieved 2026-10-19** unless a line says otherwise. Every figure comes from the store that owns it:
- **CWS:** listing pages `chromewebstore.google.com/detail/<id>` and review pages `…/<id>/reviews`, in English and sorted by Recent. Only the first page loads, which is about 10 reviews.
- **AMO:** API v5, `addons.mozilla.org/api/v5/addons/addon/<slug>/` and `…/ratings/rating/?addon=<slug>`, including a filter for 1- and 2-star reviews.
- **Edge:** `microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/<id>`, the JSON the store page uses. Edge reviews weren't retrieved: the ratings API refused anonymous calls.
- **MV3 status:** read from each package's `manifest.json`:
  - Chrome: the CRX from Google's update service (`clients2.google.com/service/update2/crx`);
  - Firefox: the current XPI linked from the AMO API;
  - Edge: the `manifest` field in its API.

**The three user metrics aren't comparable.** CWS shows a rounded bucket ("60,000 users"), AMO shows average daily users, and Edge shows active installs.

**Marked UNVERIFIED** means a claim taken from a developer's own text, an inference, or something not checked hands-on. Features come from listings and reviews; no competitor was installed and tested.

---

## 1. Key findings

1. **Nobody else auto-adds watched videos to a playlist.**
   - Searches across all three stores found nothing apart from our own 1.4.5 (searches listed in §7).
   - The market uses "watched" only as a clean-up signal: remove or filter by watch progress (Watch Later Tidy, Watched Videos On YouTube Remover, Playlist Wrangler, Improve YouTube).
2. **Nobody else offers named per-playlist keyboard shortcuts.** The nearest are:
   - a Watch-Later-only shortcut (1,000 CWS users);
   - an AMO add-on that clicks YouTube's own menu, with one "Add to Playlist" hotkey (3 users);
   - Tweaks for YouTube, whose "save to playlist" action opens YouTube's Save menu.
3. **Users of one-click Watch Later buttons keep asking for "other playlists".**
   - On YouTube Watch Later and Watch Later Button (CWS, 2026-09-07 and 2026-07-27).
   - On our own AMO listing (2024-07-07).
4. **Playlist Wrangler is the closest competitor and already ships most of 2.0's quick-save.**
   - A + button on thumbnails and under the video, with search and recent destinations.
   - A tick on playlists that already hold the video; clicking the tick removes it.
   - Add to queue onto YouTube's real queue, multi-account support, session-only, free.
   - It's small: 444 CWS users, 39 AMO and 16 Edge. It launched on AMO on 2026-07-20.
5. **YouTube created demand in March 2026** by removing the Watch Later and Add to queue hover buttons from desktop thumbnails (PiunikaWeb, 2026-03-27). A wave of "restore" extensions followed. All are small and several are flaky.
6. **"No sign-in, no server, uses your session" is now table stakes.**
   - At least ten competitors claim it.
   - Only PocketTube (Google OAuth: `youtube.readonly` plus Drive) and a few broken Data API tools still sign in.
   - It sets 2.0 apart from its own 1.4.5 (user-pasted OAuth credentials), not from the market.
7. **The large players aren't save tools.**
   - Enhancer (2,000,000 CWS users), Improve YouTube (400,000), Tweaks for YouTube (70,000), Control Panel for YouTube (100,000).
   - Among them, only Improve YouTube adds Watch Later thumbnail buttons, and only Tweaks has a "save to playlist" action.
8. **The two biggest playlist tools (PocketTube, Multiselect) are badly reviewed now**, through paywalls (PocketTube) and a broken 4.0 update (Multiselect, October 2026). Both are organizers, not save-as-you-watch tools.
9. **Firefox is thin for this niche.** The biggest one-click Watch Later add-on has 406 AMO users. PocketTube PlayList Manager (2,618) is still MV2 there and paywalls "add to playlist, add to queue".
10. **Three listings use the name "YouTube Playlist Tools":**
    - ours on AMO;
    - Blake Sinnett's on CWS;
    - TRAD Aissa's "YT Playlist Tools — Reverse, Shuffle & Reorder" on CWS and AMO.

    This supports ticket 22's rename.

---

## 2. The yardstick: 2.0's YouTube capabilities

The feature matrix (§4) uses these labels:

| Label | 2.0 capability |
|---|---|
| **AA** | Auto-add after X % actually watched, per playlist, with channel allow/deny filters and Shorts |
| **KEY** | Up to 20 named keyboard shortcuts, each to its own playlist, Watch Later included |
| **QS** | One-click quick-save on thumbnails, with a picker that shows which playlists already hold the video |
| **QU** | One-click Add to queue, with Undo |
| **WP** | A watch-page status button |
| **CP** | Creating playlists |
| **ACC** | A separate setup per account |
| **SYNC** | Settings sync |
| **DUP** | No duplicates, ever |
| **OPT** | Everything opt-in and off by default, with zero footprint when off |
| **SESS** | No server, no Google sign-in; works through the user's own YouTube session |

Source: `.scratch/rebuild/spec.md` (Scope, Principles) and `spec/02-youtube.md` §2.3–2.11.

---

## 3. Competitor profiles

Grouped by how close each is to 2.0. Each profile gives:
- store numbers (users | rating (count) | version | last update | manifest);
- pricing and approach;
- how it maps to 2.0;
- complaints from reviews, dated;
- links.

### 3.1 Playlist Wrangler (Naxatar), the closest direct competitor

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 444 | 4.7 (16) | 1.40.0 | 2026-10-16 | 3 |
| AMO | 39 | 4.62 (8) | 1.40.0 | 2026-10-16 (created 2026-07-20) | 3 |
| Edge | 16 | 5.0 (2) | 1.36.0 | 2026-10-05 | 3 |

**Pricing.** "As of October 2026 it is free and ad-free, with no paid tier." A second YouTube account is "a one-time unlock that asks for an email address" ([CWS listing](https://chromewebstore.google.com/detail/ggkjahpnampdippeadliodanmlbipbck)).

**Approach.** It uses the session: "No API key, no OAuth, no account: it reads YouTube through the session you are already signed into." It has `cookies`, `sidePanel` and `scripting` permissions (CRX manifest).
- **Telemetry:** "anonymous, content-free usage counts, which you can switch off in settings". That makes its telemetry opt-out, not opt-in (same listing).

**Against 2.0.**
- **QS (yes):** "A small + button on any thumbnail, and under the video, reaches your whole library through a search box, with your recent destinations at the top. A tick marks what you have already saved, and clicking it takes the video back out."
- **QU (partial):** "Play next and Add to queue, onto YouTube's real queue." Undo is listed for playlist edits ("Every bulk add, remove, move, and category edit has a one-tap undo"), not for the queue. Queue Undo is UNVERIFIED.
- **WP (partial):** the + button "under the video" shows the tick; there's no auto-add status, since it has no auto-add.
- **ACC (yes):** "It handles multiple signed-in Google accounts too, following whichever one your YouTube tab is on."
- **DUP (partial):** it can "Find videos saved in more than one playlist"; the tick shows existing membership.
- **Not offered:**
  - AA: it filters by watch progress but doesn't add on it;
  - KEY: its only command is `toggle-panel` (manifest);
  - SYNC: none mentioned;
  - OPT: none mentioned.
- **CP:** UNVERIFIED (not mentioned).
- **Beyond 2.0:**
  - a side-panel library with search and 252 auto categories;
  - bulk move or remove with undo, and export to CSV;
  - Mark unwatched, and a "Quick Ask" summary;
  - playing songs on YouTube Music.

**Complaints.**
- "Bizarre UI. Opened and minimized 3 YouTube windows on install. Says browser doesn't have side panel but it does." (1★, 2026-09-12, CWS). The developer admits a side-panel detection bug that hit "roughly one install in seven".
- Mostly praise otherwise. On AMO: "A better, less error-prone and faster version of Multiselect for YouTube." (5★, 2026-10-15).

**Links:** [CWS](https://chromewebstore.google.com/detail/ggkjahpnampdippeadliodanmlbipbck) · [CWS reviews](https://chromewebstore.google.com/detail/ggkjahpnampdippeadliodanmlbipbck/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/playlist-wrangler/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/gempofmocogdehlegghnmpmgmfbkjahj) · [site](https://naxatar.com/products/playlist-wrangler)

### 3.2 PocketTube: Youtube PlayList Manager (and its sibling, Subscription Manager)

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 60,000 | 3.6 (577) | 3.10.0 | 2026-10-19 | 3 |
| AMO | 2,618 | 3.23 (136) | 3.10.0 | 2026-10-18 | **2** |
| Edge | 2,850 | 3.9 (14) | 3.8.1 | 2026-08-29 | 3 |

**Sibling: PocketTube Subscription Manager** (subscription groups, not playlists):
- CWS: 300,000 users, 4.6 (5K), 18.10.6, 2026-10-19;
- AMO: 21,913 users, 4.15 (706), MV2, Firefox Recommended;
- Edge: 83,421 users, 4.1 (104).

**Pricing: freemium through Patreon.**
- The listing marks "Multiselect for playlist videos on YouTube, remove, save to playlist, add to queue, mark as watched [only for our patrons]" and "Sort playlist videos by duration [only for our patrons]" ([CWS](https://chromewebstore.google.com/detail/bplnofkhjdphoihfkfcddikgmecfehdd)).
- The Patreon page's embedded data shows a paid tier at 300 cents a month and 3,060 cents a year ([patreon.com/ysub/membership](https://www.patreon.com/ysub/membership)). That's UNVERIFIED: read from page JSON, before tax.
- A reviewer cites "$35.99 per year" (CWS, 2026-09-28).

**Approach: hybrid, with Google sign-in.**
- The manifest declares `identity` and OAuth scopes `profile`, `drive.appdata` and `youtube.readonly` (CRX and XPI manifests).
- Edits presumably go through the session, because the OAuth scope is read-only. That's UNVERIFIED (inferred).
- Sync uses "Google Drive or your Chrome profile" (Subscription Manager listing).

**Against 2.0.**
- **QS (partial, paid):** multiselect "save to playlist" from playlist pages; no thumbnail picker.
- **QU (partial, paid):** "add to queue" in multiselect.
- **KEY (partial):** "Support keyboard shortcuts"; not per-playlist, and what they cover is UNVERIFIED.
- **SYNC (yes):** through Drive. A Subscription Manager review says "automatic cloud backups, are locked behind a paywall" (CWS, 2026-10-08).
- **SESS:** no; it asks for Google OAuth.
- **AA, WP, ACC, DUP, OPT:** not offered.
- **No YouTube Music:** the developer replied "Currently, YouTube Music is not supported" (CWS, 2026-09-05).

**Complaints.**
- "Worthless, every useful feature is paid. Add to playlist, add to queue etc." (1★, AMO, 2026-09-07).
- "Almost every feature requires a paid subscription, which is not mentioned in the description." (1★, AMO, 2026-10-10).
- "Limits users to five groups before hitting the 'group limit' and suggests a subscription of $35.99 per year" (1★, CWS, 2026-09-28).
- "Anytime I have it open my browser slows down" (2★, AMO, 2026-08-09).
- On the sibling: "Incredibly intrusive. The extension tracks your usage and uninstalls down to your unique user ID … Unpaid users are also subjected to frequent, intrusive marketing pop-ups" (1★, CWS, 2026-10-08).

**Links:** [CWS](https://chromewebstore.google.com/detail/bplnofkhjdphoihfkfcddikgmecfehdd) · [CWS reviews](https://chromewebstore.google.com/detail/bplnofkhjdphoihfkfcddikgmecfehdd/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/pockettube-youtube-playlist/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/ehbcnddflnbfekidfnieclbpknhkelkj) · Subscription Manager: [CWS](https://chromewebstore.google.com/detail/kdmnjgijlmjgmimahnillepgcgeemffb), [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-subscription-groups/), [Edge](https://microsoftedge.microsoft.com/addons/detail/klfeohnijmogpjoeenglhonjfiacajpp)

### 3.3 Multiselect for YouTube™ (Mr. Pollux)

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 70,000 | 3.6 (905) | 4.0 | 2026-10-12 | 3 |
| AMO | 4,670 | 4.07 (183) | 4.0 | 2026-10-10 | 3 |
| Edge | 7,002 | 3.8 (25) | 4.0 | 2026-10-10 | 3 |

**Pricing:** free, with a Buy Me a Coffee link (AMO `contributions_url`).

**Approach:** the session.
- Chrome needs only the `storage` permission plus a youtube.com content script.
- 4.0 on Firefox adds `clipboardRead` (manifests).

**Against 2.0.**
- **QS (partial):** select many videos, then "Copy, cut and paste videos" into playlists. That's bulk, not one-click, and has no membership picker.
- **DUP (partial):** "Find duplicates".
- **KEY:** "Keyboard navigation" only, plus one browser command, `toggleMultiSelectMode`.
- **Feeds:** reviews show it's used on feeds too: "No longer works on https://www.youtube.com/feed/subscriptions" (CWS, 2026-10-15).
- **AA, QU, WP, CP, ACC, SYNC, OPT:** not offered.

**Complaints (the 4.0 rewrite, October 2026).**
- "the latest update broke almost every feature tied to actual playlist organizing" (1★, CWS, 2026-10-18).
- "'Move to Top', 'Move To Bottom' and 'Reverse Order' no longer work." (3★, CWS, 2026-10-17).
- "Doesn't work anymore. Can't select anything" (1★, AMO, 2026-10-19).
- "Why does it want access to my clipboard?" (1★, AMO, 2026-10-11).

**Links:** [CWS](https://chromewebstore.google.com/detail/gpgbiinpmelaihndlegbgfkmnpofgfei) · [CWS reviews](https://chromewebstore.google.com/detail/gpgbiinpmelaihndlegbgfkmnpofgfei/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/multiselect-for-youtube/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/fkabkbedpefhdbkmgmfineacfpoghnno)

### 3.4 "YouTube Playlist Tools" on Chrome (Blake Sinnett, not ours)

**CWS:** 292 users, 2.2 (4 ratings), 3.20, updated 2026-09-19, MV3. Not found on AMO or Edge by search.

**Pricing:** free. **Approach:** local only. "This extension runs entirely in your browser. No data is collected, stored, or transmitted." It needs only `storage` and a youtube.com host permission (manifest).

**Against 2.0.**
- **QS and QU (partial):** "ONE-CLICK ACTIONS: Instantly add videos to your queue or Watch Later list, remove watched videos, or hide videos". The [project site](https://pbsinnett.github.io/ypt) adds:
  - a "Button Factory" for "over 16 different YouTube zones";
  - "up to three buttons per zone".

  It saves to Watch Later only, with no picker and no Undo.
- **Beyond 2.0:**
  - "Load All" and sorting;
  - time stats tied to playback speed;
  - strong screen-reader support (NVDA, JAWS, VoiceOver).
- **AA, KEY, WP, CP, ACC, SYNC, DUP:** not offered.

**Complaints.**
- "Please fix your extension so it shows the entirety of the Saved Shorts playlist instead of showing the top 100." (2★, 2026-10-15).
- "Scam. Does not work at all." (1★, 2026-06-25).

**Links:** [CWS](https://chromewebstore.google.com/detail/ehkkmfabomefdhfbegkiohmoiolfbjpo) · [reviews](https://chromewebstore.google.com/detail/ehkkmfabomefdhfbegkiohmoiolfbjpo/reviews) · [site](https://pbsinnett.github.io/ypt)

### 3.5 playlist.tools: YouTube Playlist Manager (artz.media)

**CWS:** 636 users, 1.0 (2 ratings), 1.0.0, updated 2025-12-29, MV3. Not found on AMO or Edge by search.

**Pricing:** free to start. The [site](https://playlist.tools/) mentions syncing "premium preferences". Tiers are UNVERIFIED.

**Approach:** its own server account. "Cloud Sync: Automatically sync your watch progress and saved playlists across all your devices using your playlist.tools account" (CWS listing). It's a side-panel viewer: sort, reverse, track progress, resume.

**Against 2.0:** none of AA, KEY, QS, QU, WP, CP or DUP. **SYNC:** yes, through its own server.

**Complaints:** "it does nothing." (1★, 2026-03-09, 7 of 8 found helpful).

**Links:** [CWS](https://chromewebstore.google.com/detail/pjocgpjnhgepncefgockmkglfcjmihbm) · [reviews](https://chromewebstore.google.com/detail/pjocgpjnhgepncefgockmkglfcjmihbm/reviews) · [site](https://playlist.tools/)

### 3.6 "YT Playlist Tools — Reverse, Shuffle & Reorder" (TRAD Aissa)

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 80 | no ratings | 3.5.0 | 2026-09-22 | 3 |
| AMO | 263 | 4.60 (5) | 3.5.0 | 2026-09-21 (created 2026-05-29) | 3 |

**Pricing:** free. **Approach:** local. "No external API calls or third-party servers. Zero login required."

**Features:** reverse, persistent shuffle, drag reordering, local "My Lists" snapshots, import/export, resume, watched badges.

**Against 2.0:** none of AA, KEY, QS, QU, WP, CP, ACC or DUP. Its "saved playlists" are local snapshots, not YouTube playlists. **SYNC:** a JSON file only.

**Complaints (AMO).**
- "every time i refresh the page, the playlist plays to the next video because of this extension" (4★, 2026-09-19).
- "the watched badges toggle doesn't seem to do anything" (4★, 2026-07-10).

**Links:** [CWS](https://chromewebstore.google.com/detail/gbdcdgleohhjajeabaebidlfhenlgmgo) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/reverse-youtube-playlist-order/)

### 3.7 YT Watch Later Assist (Irfan Alam)

**CWS:** 50,000 users, 4.4 (537 ratings), 4.1, updated 2026-07-05, MV3. Not found on AMO or Edge by search.

**Pricing:** free. A reviewer says they're "Happy to buy a coffee for the developer" (2026-09-05).

**Approach: it drives YouTube's visible UI** (UNVERIFIED, inferred from the listing):
- "Set your YouTube interface language to English before using the extension";
- "Removal runs in a new window — keep that window open and in front until it finishes".

Its permissions include `tabs`, `windows`, `webRequest` and `scripting` (manifest).

**Features:** remove all of Watch Later or Liked in one click; add a public playlist to Watch Later in one click.

**Against 2.0:** none of AA, KEY, QS, QU, WP, CP, ACC, SYNC or DUP. It's a bulk utility.

**Complaints:** "after the third attempt it just says, 'Could not load playlist videos to add. Refresh the page and try again.'" (1★, 2026-07-23). Most recent reviews are 5★.

**Links:** [CWS](https://chromewebstore.google.com/detail/deafalnegnfhjhejolidiobnapigcfpd) · [reviews](https://chromewebstore.google.com/detail/deafalnegnfhjhejolidiobnapigcfpd/reviews)

### 3.8 Watch Later Tidy for YouTube™ (TidyWL / Dominic Lam)

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 6,000 | 5.0 (88) | 2.6.0 | 2026-10-15 | 3 |
| AMO | 65 | 5.00 (2) | 2.6.0 | 2026-10-15 (created 2026-08-06) | 3 |
| Edge | 18 | 5.0 (1) | 2.6.0 | 2026-10-15 | 3 |

**Pricing: freemium.**
- Free covers "remove up to 1,000 hand-picked videos every 30 days".
- Pro costs "$4.99 USD / month" or "$3.99" a month billed yearly ("$47.88 billed annually"). It adds:
  - unlimited removals;
  - "Undo deletions for 90 days";
  - clean-up rules and saved views.

Source: [tidywl.com/pricing](https://tidywl.com/pricing/).

**Approach:** the session. "No account. No sign-in. No setup. No permissions beyond your current YouTube session." It also has a host permission for `tidywl.com` (checkout) (CWS listing and manifest).

**Against 2.0.**
- **DUP (partial):** a merged view puts "one card per video, a chip for each playlist it's in".
- It also moves and copies between playlists.
- **AA, KEY, QS, QU, WP, CP:** none. This is a dashboard for clean-up, not saving.
- **ACC, SYNC:** UNVERIFIED (not mentioned).

**Complaints.**
- Near-uniformly 5★ on CWS.
- On AMO, one user "very nearly came here to immediately rate 1 star" over the free removal limit (5★, 2026-10-17).
- "a little slow at times" (5★, AMO, 2026-09-23).

**Links:** [CWS](https://chromewebstore.google.com/detail/fkelmapobieliokjcmnilmjllacmbfjo) · [reviews](https://chromewebstore.google.com/detail/fkelmapobieliokjcmnilmjllacmbfjo/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/watch-later-tidy/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/doflfclcoebklpifkhcahbhlgbpamjcf)

### 3.9 Enhancer for YouTube™ (Max RF / mrfdev)

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 2,000,000 | 4.5 (17.5K) | 3.0.19 | 2026-07-15 | 3 |
| AMO | 591,473 | 4.66 (12,430) | 2.0.136 | 2026-08-04 | **2** (Firefox Recommended) |
| Edge | 488,260 | 4.6 (975) | 3.0.19 | 2026-07-16 | 3 |

**Pricing:** free. No paid tier appears on the listing or on [mrfdev.com](https://www.mrfdev.com/enhancer-for-youtube) (2026-10-19). **Approach:** page-only. The manifest asks for `storage` and youtube.com.

**Against 2.0:** none of AA, KEY, QS, QU, WP, CP, ACC, SYNC or DUP.
- Its "Keyboard Shortcuts" are player controls; the listing mentions no save, queue or Watch Later action.
- Playlists come up only for "Reverse Playlists" and default quality.

**Complaints.**
- "Recent Youtube update broke it. Any update coming soon?" (5★, CWS, 2026-10-16).
- "the settings consistently go back to default" (2★, CWS, 2026-10-13).
- "The last 6 months I've noticed it had stopped working." (1★, AMO, 2026-10-18).

**Links:** [CWS](https://chromewebstore.google.com/detail/ponfpcnoihfmfllpaingbgckeeldkhle) · [reviews](https://chromewebstore.google.com/detail/ponfpcnoihfmfllpaingbgckeeldkhle/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/enhancer-for-youtube/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/dlgfaleeejmphhnemjgiaekdbonkagkd)

### 3.10 'Improve YouTube!' (code4charity, open source)

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 400,000 | 4.4 (7.2K) | 4.2081 | 2026-07-06 | 3 |
| AMO | 102,244 | 4.28 (903) | 4.2081 | 2026-07-05 | 3 (Firefox Recommended) |
| Edge | 39,624 | 4.4 (105) | 4.2028 | 2026-06-07 | 3 |

**Pricing:** free and open source; the [repo](https://github.com/code4charity/YouTube-Extension) was last pushed 2026-10-11. **Approach:** page-only (`storage`, `contextMenus`, youtube.com).

**Against 2.0.**
- **QS (Watch Later only):** the menu source has a `watch_later_buttons` setting with options `disabled`, `hover` and `always`, tagged "watch later save thumbnail" ([general.js](https://github.com/code4charity/YouTube-Extension/blob/master/menu/skeleton-parts/general.js), read 2026-10-19). There's no playlist picker.
- **Watch tracking:** it has `mark_watched_videos`, `track_watched_videos` and `hide_watched_videos`, but nothing adds to a playlist.
- **KEY:** about 45 shortcut actions in [shortcuts.js](https://github.com/code4charity/YouTube-Extension/blob/master/menu/skeleton-parts/shortcuts.js) (like, subscribe, speed, and so on), none of them save or queue.
- **AA, QU, WP, CP, ACC, SYNC, DUP:** not offered.

**Complaints.**
- "The use of this extension causes youtube to never load a page and locks up my pc" (1★, CWS, 2026-08-18).
- "Breaks playlists" (1★, CWS, 2026-09-09).
- "Doesn't work anymore at all" (1★, AMO, 2026-10-10).

**Links:** [CWS](https://chromewebstore.google.com/detail/bnomihfieiccainjcjblhegjgglakjdd) · [reviews](https://chromewebstore.google.com/detail/bnomihfieiccainjcjblhegjgglakjdd/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-addon/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/knbckijjjbmkjiagojjneoplbjilfllc)

### 3.11 Tweaks for YouTube (InzkDev), an opt-in suite with a "save to playlist" action

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 70,000 | 4.3 (639) | 3.93.0 | 2026-09-25 | 3 |
| AMO | 8,036 | 4.58 (201) | 3.93.0 | 2026-09-24 | **2** |
| Edge | 5,874 | 4.6 (44) | 3.93.0 | 2026-09-23 | 3 |

**Pricing:** free, with a Patreon. **Approach:** page-only. "does not send any user data to a remote server".

**OPT (yes):** "Features are turned off by default - explore the extension's Popup and Options page and enable the ones you need." It's the clearest opt-in precedent in this space (CWS listing).

**KEY (partial).**
- "50+ actions available, such as … save to playlist" for mouse controls and keyboard shortcuts (CWS listing).
- The [features page](https://inzk.dev/tweaks-for-youtube/features) also has a right-click on Share that will "Open Save To Playlist menu".
- So "save" opens YouTube's own dialog rather than adding to a chosen playlist (UNVERIFIED, inferred).

**Complaints.**
- "some shortcuts stopped working recently, such as the save to playlist shortcut." (5★, CWS, 2026-08-12).
- "too many not helpful other features, can be confusing" (4★, CWS, 2026-07-30).

**Links:** [CWS](https://chromewebstore.google.com/detail/ogkoifddpkoabehfemkolflcjhklmkge) · [reviews](https://chromewebstore.google.com/detail/ogkoifddpkoabehfemkolflcjhklmkge/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/tweaks-for-youtube/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/nnhifoobfibjmlkejadjmcdckkjbljcp)

**Other suites with no save, queue or auto-add features (checked by listing):**
- **Control Panel for YouTube:**
  - CWS 100,000 users, 4.5 (293), 1.38.0, 2026-10-17;
  - AMO 35,422 users, 4.57 (186), MV2, Recommended;
  - it hides playlists and watched videos ([CWS](https://chromewebstore.google.com/detail/lodcanccmfbpjjpnngindkkmiehimile), [AMO](https://addons.mozilla.org/en-US/firefox/addon/control-panel-for-youtube/)).
- **YouTube Tweaks:**
  - AMO 18,745 users, 4.84 (321), MV3, Recommended;
  - like/dislike and navigation hotkeys, and it can hide the Save button ([AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-tweaks/)).

### 3.12 One-click Watch Later tools

**YouTube Watch Later (dnwjn), open source**

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 1,000 | 4.3 (39) | 0.6.3 | 2026-08-31 | 3 |
| AMO | 406 | 4.25 (20) | 0.6.3 | 2026-08-31 | **2** |
| Edge | 134 | 3.0 (2) | 0.6.3 | 2026-08-31 | 3 |

- **What it does:** an "Add to Watch Later" button on thumbnails, notifications, the player bar and end-screen suggestions, Shorts included. Each location's position is configurable.
- **Approach:** the session ("The button makes exactly the same calls as YouTube does", developer reply, CWS, 2026-06-13). It has a `cookies` permission.
- **Against 2.0:** QS for Watch Later only; WP partial (a player-bar button). No picker, no Undo, no other playlists.
- **Complaints:**
  - "please add feature to add to other playlist not only watch later" (5★, CWS, 2026-09-07);
  - "when you hover the mouse over a thumbnail sometimes it makes the whole tab hang" (4★, CWS, 2026-10-04);
  - "missing the option to click the button again to undo adding the video to watch later" (4★, AMO, 2026-04-01).
- **Links:** [CWS](https://chromewebstore.google.com/detail/nmpfhocciajonacicdelpbhipglapgaa) · [reviews](https://chromewebstore.google.com/detail/nmpfhocciajonacicdelpbhipglapgaa/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/hbceknmmffnemncljbkccfgcgnccbale)

**Watch Later Button (AlxPle)**

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 1,000 | 4.3 (39) | 1.6.0 | 2026-10-14 | 3 |
| AMO | 13 | no ratings | 1.6.1 | 2026-10-13 | 3 |
| Edge | 7 | no ratings | 1.6.0 | 2026-10-13 | 3 |

- **What it does:** a one-click save to Watch Later on the watch page, with an "Instant undo window — … You have 10 seconds to undo".
- **Against 2.0:** WP and Undo for Watch Later only.
- **Complaints:**
  - "Would be even more awesome if we could configure a different default playlist as the destination, or add another button that saves to a specific playlist" (4★, CWS, 2026-07-27, 3 of 3 found helpful);
  - "can you add feature to save to other playlist also" (5★, CWS, 2026-09-07);
  - "a bit intrusive. could you make it look like the other buttons" (4★, CWS, 2026-10-04).
- **Links:** [CWS](https://chromewebstore.google.com/detail/igehcnnhegiagilpnablldbbcnjabkab) · [reviews](https://chromewebstore.google.com/detail/igehcnnhegiagilpnablldbbcnjabkab/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/watchlaterbutton/) · [Edge](https://microsoftedge.microsoft.com/addons/detail/poopocdoinnkiddflgklibkgmmlidfpa)

**Watch Later Shortcut for YouTube™ (Mykhailo Zachepylo), open source**

| Store | Users | Rating | Version | Updated | MV |
|---|---|---|---|---|---|
| CWS | 1,000 | 4.5 (42) | 1.2 | 2025-04-01 | 3 |
| AMO | 164 | 4.33 (9) | 1.2 | 2025-03-30 | 3 |

- **What it does:** keyboard add and remove of the current video or Short to and from Watch Later.
- **Uses the browser's commands:** `add-to-watch-later` and `remove-from-watch-later` in the manifest, rebound at `chrome://extensions/shortcuts`. ADR-0004 takes the opposite approach.
- **Against 2.0:** KEY for Watch Later only and the current video only.
- **Complaints:**
  - "the on-screen confirmation of an add / removal of a video often doesn't work" (4★, CWS, 2026-01-26);
  - "I keep forgetting what the shortcut is … I wish it also displayed a button on video player page" (2★, AMO, 2024-12-16);
  - "you already need the video open to add to watch later?" (1★, CWS, 2024-09-10).
- **Links:** [CWS](https://chromewebstore.google.com/detail/dhegojkfhodaifdnkoigmdoncoonbifd) · [reviews](https://chromewebstore.google.com/detail/dhegojkfhodaifdnkoigmdoncoonbifd/reviews) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/watch-later-shortcut-youtube/)

**YT Restore — Queue & Watch Later (Captain Code / David Lewis)**
- **Numbers:** CWS 163 users, 3.2 (6), 1.1.1, 2026-06-29, MV3; Edge 13 users. A different AMO add-on with the same idea, "YouTube - Restore Queue & Watch Later" by HASJ2, has 23 users, 4.33 (3), MV3, updated 2026-09-23.
- **What it does:** "Restores Add to Queue and Watch Later buttons that YouTube removed", as thumbnail hover buttons that "use YouTube's own native actions — the same ones triggered when you use the three-dot context menu" (CWS listing).
- **Shorts claim:** "Shorts get a Queue button only (Watch Later is not supported by YouTube for Shorts)". This conflicts with Watch Later Shortcut's "Works on both regular videos and YouTube Shorts". Live check L9 should settle it for 2.0.
- **Against 2.0:** QS (Watch Later only) and QU without Undo.
- **Complaints:**
  - "Keep getting error: queue unavailable--see console" (3★, CWS, 2026-08-10, updated 2026-08-18);
  - "random floating watch later/add queue buttons that appear in every blank space on the screen" (4★, CWS, 2026-06-27).
- **Links:** [CWS](https://chromewebstore.google.com/detail/chnenkpdgjebffanaggkhopgimpchdej) · [reviews](https://chromewebstore.google.com/detail/chnenkpdgjebffanaggkhopgimpchdej/reviews) · [Edge](https://microsoftedge.microsoft.com/addons/detail/ipocmnmhdmilfcfpckpkejdkondjicak) · [AMO (HASJ2)](https://addons.mozilla.org/en-US/firefox/addon/yt-restore-queue-watch-later/)

**Smaller Watch Later tools (CWS):**
- **YT Quick Actions:** 417 users, 4.0 (13), 1.3.1, 2026-06-02. A Watch Later button under videos and in feeds, and remove buttons. "isnt wroking for me at all" (1★, 2026-06-12). [CWS](https://chromewebstore.google.com/detail/lopaoogidddnpogjngfhbaklhdecmcii)
- **YouTube™ Watch Later Shortcuts (teja2495):** 48 users, 4.3 (3), 1.2, 2025-10-23. Watch Later and Save buttons in the player bar. "Save to Playlist button still not working." (4★, 2025-11-27). [CWS](https://chromewebstore.google.com/detail/omdomjnalailcppncbjgblhmbedgfcen)

### 3.13 Queue tools

**Streamline – YouTube Queue Manager**
- **CWS:** 3,000 users, 4.0 (11), 1.7.0.1, 2026-10-16, MV3. Free, local.
- **Its own queue, not YouTube's.** It's cross-tab and persistent, with thumbnail buttons for "[+] Add to Queue", "[▲] Priority", "[▼] Deferred" and "[🕒] Stash".
- **Commands:** "Global Keyboard Shortcuts" (`play-next-video`, `toggle-pause`, `swap-stash`).
- **Sync:** "Sync Across Browsers … via your Google Chrome account".
- **Against 2.0:** QU partial (its own queue, no Undo); SYNC yes, for the queue.
- **Its one listed review:** "Great, great extension and its getting better. Just do not overdo it." (5★, 2026-10-16).
- **Link:** [CWS](https://chromewebstore.google.com/detail/iaapkkddfnamllommnpinmfpdefjcgcf)

**Other queue tools** (each keeps its own queue or YouTube's temporary list; none has Undo):

| Extension | Store numbers | Notes and link |
|---|---|---|
| Cross-Tab YouTube Queue | CWS 377 users, 4.2 (8), 1.0.0, 2025-12-04 | [CWS](https://chromewebstore.google.com/detail/bckcolmgpcpdknkinhcjiebegbebopch) |
| QueueTube | CWS 159 users, 3.0 (2), 1.2.0, 2026-07-10 | [CWS](https://chromewebstore.google.com/detail/pofehkacjjfhkabballkinbfhffhefjh) |
| YouTube Queue Picker | CWS 24 users, 5.0 (1), 1.0.1, 2026-08-11 | "Automatically prevent duplicate queue entries" (DUP for the queue). [CWS](https://chromewebstore.google.com/detail/klgmcjdcpbfgkdollgpljilecnihiadd) |
| YouQueue | Edge 70 installs, 1.1, 2024-07-23 | [Edge](https://microsoftedge.microsoft.com/addons/detail/feijdlflhlkogeljaciafhbjpilongpk) |
| YouTube Queue Manager | AMO 65 users, MV2, 2025-11-09 | [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-queue-manager/) |

### 3.14 Save-dialog helpers, keyboard tools and Data API tools

| Extension | Store numbers | What it does, against 2.0 | Complaint | Link |
|---|---|---|---|---|
| YouTube Save-to-List Enhancer | CWS 85 users, 2.5 (6), 3.1.0, 2025-10-15 | Adds search, sort and "Checked Playlists on Top" to YouTube's own Save dialog, which already shows membership | "Alas works no longer in chrome or arc" (2★, 2026-06-28) | [CWS](https://chromewebstore.google.com/detail/ojoinkalmfadofomeckhkhjlinjdlilh) |
| Playlist Multi-Save | CWS 42 users, 3.0 (1), 0.1.2, 2026-09-18 | Keeps YouTube's Save panel open for picking several playlists | none listed | [CWS](https://chromewebstore.google.com/detail/lekdpmjfofghkhhogileomjfhhenphoh) |
| Quick Menu Buttons for YouTube (Vileace) | AMO 3 users, 5.00 (1), 1.0, 2025-03-10, MV3 | "Add to Playlist" button plus "Configure custom hotkeys for each action", working by "programmatically interacting with YouTube's popup menu" (it drives the UI) | none | [AMO](https://addons.mozilla.org/en-US/firefox/addon/quickmenu/) |
| YouCaptain | AMO 2 users, MV2, 0.0.12, 2020-09-22; CWS 4 users, 0.0.15, 2026-04-21 | Key `o`: "add video to the queue"; key `w` opens Watch Later | none | [AMO](https://addons.mozilla.org/en-US/firefox/addon/youcaptain/) · [CWS](https://chromewebstore.google.com/detail/injggghbpecfecjlignmekmljobiampm) |
| YouTube Playlist Quick Add/Remove | CWS 40 users, 2.0 (2), 0.1.0, 2025-05-04 | Overlay add/remove through the Data API (OAuth `youtube.force-ssl`) | Developer: "don't install this extension, it doesn't work … it was only a proof of concept" (2025-11-07) | [CWS](https://chromewebstore.google.com/detail/kmgilcijhiojkbkhgpekibmfknnncohp) |
| Add to YouTube Playlist | CWS 25 users, no ratings, 1.5.1, 2025-06-13 | Right-click a notification to add it; toasts "prevent duplicates" | none | [CWS](https://chromewebstore.google.com/detail/hkmdlpocoomadpadiapmllagacnhfnii) |
| Playlist Search for YouTube™ | CWS 8,000 users, 2.7 (172), 1.0.0.9, 2026-07-01 | Searches inside a playlist; "requires you to login … YouTube™ Data API" (`youtube.readonly`) | "Dont work always appear a message with no valid playlist" (1★, 2026-08-04) | [CWS](https://chromewebstore.google.com/detail/jdolgjncmhmboklhmacpknglmiibbldg) |
| Playlist Manager Pro for YouTube | CWS 99 users, 1.7 (3), 0.3.4, 2026-10-19 | Sidebar organizer on the Data API (OAuth `youtube` scope) | none fetched | [CWS](https://chromewebstore.google.com/detail/dfgapfodocpceapaebjomakoccnajagj) |

### 3.15 Bulk adders and organizers that create playlists

**PushList**
- **CWS:** 345 users, 3.0 (2), 1.0, 2026-02-19, MV3.
- **Approach:** "Uses your existing YouTube session — no OAuth or API keys needed".
- **Pricing:** free for "up to 15 videos per session"; "PRO FEATURES ($18 one-time)" include "Create new playlists without leaving the extension" (CP, paid).
- **Complaint:** "Does not detect any videos on any YouTube pages. Completely useless" (1★, 2026-09-13).
- **Links:** [CWS](https://chromewebstore.google.com/detail/pianbcnnphcnocmnabnoldpbgndaepel) · [site](https://pushlist.io/)

**Playlist Pro for YouTube**
- **CWS:** 313 users, 4.2 (10), 2.2.0, 2026-10-05.
- Multi-select, drag reordering, and "move your videos to another playlist, or just add them there". It saves "via YouTube's internal API".
- **Complaints:**
  - "It only shows me up to 100!" (3★, 2026-09-20);
  - "Does it not work with youtube music?" (5★, 2026-10-18).
- **Link:** [CWS](https://chromewebstore.google.com/detail/pfpppmlfbknnnhabihbffcmajgbogkeb)

**Better Playlists**
- **CWS:** 41 users, 5.0 (2), 0.1.0, 2026-10-07.
- "Quickly create new playlists … right from the sidebar" (CP), plus batch move.
- **Link:** [CWS](https://chromewebstore.google.com/detail/dbkjpepjgmodcoanoaokohenmkdldffa)

### 3.16 Our own baseline: YouTube Playlist Tools 1.4.5 (AMO)

**AMO:** 66 users, 5.00 (2 ratings), 1.4.5, updated 2024-06-21, created 2024-06-18, MV3, with the `identity` permission ([AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-tools/)).

**Approach:** the Data API with OAuth credentials the user pastes in (`.scratch/rebuild/inventory.md` lines 8 and 261–268).

**Features** (from `inventory.md` lines 7–18 and 229–237, and PAR-CAP-02 in `spec/09-parity.md`):
- auto-add to typed-in playlist IDs, by playhead position against one required percentage;
- one in-page shortcut to one playlist (`addToPlaylistID`).

Channel filters, Add to queue and the card menu came after 1.4.5 and never shipped.

**Reviews:**
- "Could you update it for latest Firefox and YouTube?" (5★, 2026-02-07);
- "Would be cool to have multiple 'Add to playlist' shortcut options. And maybe with some manual labels/titles?" (5★, 2024-07-07).

---

## 4. Feature matrix

Yes = offered · Part = partial or restricted (see the note) · No = not offered · ? = not stated / UNVERIFIED · $ = paid only.
Columns follow §2. "Users" is the CWS bucket (or AMO/Edge where noted).

| Extension | Users (CWS) | AA | KEY | QS | QU | WP | CP | ACC | SYNC | DUP | OPT | SESS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **2.0 (planned)** | n/a | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| 1.4.5 (ours, AMO) | 66 (AMO) | Part¹ | Part² | No | No | ? | No | No | No | ? | No | No (Data API) |
| Playlist Wrangler | 444 | No | No | Yes | Part³ | Part | ? | Yes | No | Part | No⁴ | Yes |
| PocketTube PlayList Manager | 60,000 | No | Part | $ Part | $ Part | No | ? | ? | Yes (Drive) | No | No | No (OAuth) |
| Multiselect for YouTube | 70,000 | No | No | Part (bulk) | ? | No | No | No | No | Part | No | Yes |
| YouTube Playlist Tools (Sinnett) | 292 | No | No | Part (WL) | Part | No | No | No | No | No | ? | Yes |
| playlist.tools | 636 | No | No | No | No | No | No | ? | Yes (own server) | No | No | No (own account) |
| YT Playlist Tools — Reverse… | 80 (+263 AMO) | No | No | No | No | No | No | No | No | No | ? | Yes |
| YT Watch Later Assist | 50,000 | No | No | No | No | No | No | No | No | No | No | Part (drives UI) |
| Watch Later Tidy | 6,000 | No | No | No | No | No | No | ? | No | Part | No | Yes |
| Enhancer for YouTube | 2,000,000 | No | No | No | No | No | No | No | No | No | No | n/a |
| Improve YouTube | 400,000 | No | No | Part (WL) | No | No | No | No | No | No | ? | n/a |
| Tweaks for YouTube | 70,000 | No | Part⁵ | No | No | No | No | No | No | No | Yes | n/a |
| YouTube Watch Later (dnwjn) | 1,000 | No | No | Part (WL) | No | Part (WL) | No | No | No | No | ? | Yes |
| Watch Later Button | 1,000 | No | No | No | No | Part (WL + Undo) | No | No | No | No | ? | Yes |
| Watch Later Shortcut | 1,000 | No | Part (WL) | No | No | No | No | No | No | No | n/a | Yes |
| YT Restore | 163 | No | No | Part (WL) | Part (no Undo) | No | No | No | No | No | ? | Yes |
| Streamline (queue) | 3,000 | No | Part⁶ | No | Part (own queue) | No | No | No | Yes (queue) | ? | ? | Yes (local) |
| Quick Menu (AMO) | 3 (AMO) | No | Part⁷ | Part | No | No | No | No | No | No | ? | Part (drives UI) |
| PushList | 345 | No | No | No | No | No | $ Yes | No | No | ? | No | Yes |

Notes:
1. Auto-add by playhead position, not by time actually played. There are no channel filters in 1.4.5: they arrived in the unreleased 1.5.0 on 2026-10-05 (`inventory.md` line 18).
2. One in-page shortcut to one playlist, which an AMO review asks to multiply (2024-07-07).
3. Adds to YouTube's real queue; Undo is listed for playlist edits only.
4. Side panel and buttons ship together. Telemetry is on by default and can be switched off ("anonymous … usage counts, which you can switch off").
5. A "save to playlist" mouse or keyboard action that probably opens YouTube's own Save menu (UNVERIFIED).
6. Global shortcuts for its own queue (play next, pause, stash).
7. A hotkey for an "Add to Playlist" button that clicks YouTube's menu.

Sources: the per-extension links in §3, retrieved 2026-10-19.

---

## 5. White space no one covers

1. **Auto-add on actual watching.**
   - No extension on CWS, AMO or Edge adds a video to a playlist because it was watched, let alone per playlist, by time played, with channel allow/deny lists and Shorts. The searches are in §7; the "automatically add to playlist" result lists show only playlist utilities.
   - The nearest neighbours treat watch progress as a reason to remove or filter:
     - Watch Later Tidy: "Filter by watched status (with an adjustable progress threshold)";
     - Watched Videos On YouTube Remover (CWS 1,000 users): "Remove videos at or above your chosen watch threshold" ([CWS](https://chromewebstore.google.com/detail/kfpijemcjneklkhbdhidjfdddkommecm));
     - Playlist Wrangler: progress filters;
     - Improve YouTube: watched tracking.
   - A web search found no extension or userscript for it either (2026-10-19). UNVERIFIED beyond store search.
2. **Named per-playlist shortcuts.** Covered only by:
   - Watch-Later-only keys (Watch Later Shortcut; its Greasy Fork twin, [script 537622](https://greasyfork.org/scripts/537622));
   - a 3-user AMO add-on that clicks YouTube's menu;
   - a suite action that opens the Save dialog (Tweaks).

   Demand evidence: our own AMO review (2024-07-07) and the "other playlist" requests in §3.12 (2026-07-27, 2026-09-07).
3. **One click to a specific, non-Watch-Later playlist.**
   - Every one-click tool saves to Watch Later only (§3.12).
   - The one picker-based competitor (Wrangler) needs a search step, and nothing lets a user pin a default destination, which is exactly what reviewers asked for (Watch Later Button, 2026-07-27).
4. **Add to queue with Undo.** No queue tool or button offers Undo. Watch Later Button's 10-second Undo (Watch Later only) shows that users value it, and an AMO user faulted YouTube Watch Later for lacking it (2026-04-01).
5. **Never silent, with a breakage status.**
   - Reviews across the field report silent breakage after YouTube changes: Multiselect 4.0 (October 2026), Enhancer (2026-10-16), YT Restore "queue unavailable--see console" (2026-08-10), Save-to-List Enhancer (2026-06-28).
   - No listing advertises in-product breakage detection (UNVERIFIED: listings only).
6. **Opt-in and zero footprint in a playlist tool.**
   - Only a general suite (Tweaks for YouTube) ships features off by default. No playlist or save tool claims it.
   - Users complain about bloat and slowdowns: PocketTube (2026-08-09), Improve YouTube (2026-08-18), YouTube Watch Later hover hang (2026-10-04), and Tweaks' "too many not helpful other features" (2026-07-30).
   - Zero-footprint-when-off isn't claimed by anyone (UNVERIFIED).
7. **Account setups combined with settings sync for a save tool.**
   - Only Wrangler follows multiple accounts, and it doesn't sync.
   - The sync that exists covers other things: a queue (Streamline, through Chrome sync), PocketTube groups (Drive, partly paywalled), or an own-server account (playlist.tools).
8. **Firefox as a whole.** Save and queue tools on AMO are tiny:
   - YouTube Watch Later has 406 users, Watch Later Shortcut 164, Wrangler 39, Watch Later Tidy 65;
   - PocketTube PlayList Manager (2,618) is MV2 and paywalls saving.

   2.0 already holds an AMO listing in this category.

---

## 6. Crowded areas where 2.0 doesn't stand out

1. **"Private: no sign-in, no server, uses your session."** Claimed by:
   - Playlist Wrangler, Watch Later Tidy, PushList, Playlist Pro, YouTube Watch Later (dnwjn);
   - YouTube Playlist Tools (Sinnett), YT Playlist Tools, Streamline, Save-to-List Enhancer, Multiselect (by its manifest).

   It's a differentiator only against PocketTube and Data API tools, and an upgrade story for 1.4.5 users. It isn't a market USP.
2. **One-click Watch Later buttons** on thumbnails or the player:
   - Improve YouTube (400,000 users) has them built in;
   - YouTube Watch Later, Watch Later Button, YT Restore (two of them), YT Quick Actions, Sinnett's YouTube Playlist Tools;
   - YouTube's own hover buttons, where they still appear. PiunikaWeb reports they were removed from home and subscriptions but kept on channel video lists ([PiunikaWeb, 2026-03-27](https://piunikaweb.com/2026/03/27/youtube-hides-watch-later-add-to-queue-buttons-desktop/)).
3. **A save picker that shows membership.**
   - YouTube's own Save dialog already checks the playlists that hold the video, which is why Save-to-List Enhancer offers "Checked Playlists on Top".
   - Wrangler adds the thumbnail +, search, recent destinations and a tick that removes.

   2.0's picker matches the leader rather than beating it, unless it wins on placement, speed or native look.
4. **Queues.** Streamline (3,000 users, multi-queue, Chrome sync) and five or more smaller tools, plus YouTube's native queue. 2.0's Add to queue is a one-button convenience in a busy category; Undo is its only distinct edge.
5. **Creating playlists.** It's in YouTube's own Save dialog and in Better Playlists and PushList Pro. That's table stakes.
6. **Duplicates.** Covered by:
   - Multiselect's "Find duplicates";
   - Wrangler's "saved in more than one playlist";
   - Queue Picker's de-duplicated queue;
   - YouTube Playlist Deduper (AMO 168 users, [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-deduper/)).

   "No duplicates ever" is a guarantee, not a feature users shop for.
7. **Bulk organizing, sorting, searching and Watch Later clean-up.** The biggest and busiest category:
   - PocketTube, Multiselect, Watch Later Tidy, Wrangler, Playlist Pro;
   - Youtube Playlist Reverser (CWS 40,000 users, 4.5 (137), [CWS](https://chromewebstore.google.com/detail/fjhdhmikpmfcoonnnbheiloleihndlde));
   - Playlist Search for YouTube (8,000), YouTube Playlist Search (5,000), YT Watch Later Assist (50,000);
   - YouTube Watch Later Cleaner (AMO 1,270, 4.82 (114), [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later-cleaner/)).

   2.0 doesn't compete here, and its listing shouldn't imply it does.

---

## 7. Coverage, gaps and UNVERIFIED items

**Searches run on 2026-10-19:**
- **CWS search pages:**
  - "youtube playlist", "add to playlist youtube", "youtube watch later", "youtube auto add playlist";
  - "youtube queue", "save to playlist", "youtube playlist tools", "youtube keyboard shortcuts playlist";
  - "multiselect youtube", "youtube bulk add to playlist", "quick add to playlist", "youtube watched videos playlist";
  - "youtube add to playlist shortcut", "youtube add to queue button", "improve youtube", "youtube thumbnail save button";
  - "youtube playlist manager", "youtube history playlist", "youtube watch later button", "add to watch later";
  - "automatically add videos to playlist", "auto playlist youtube", "save watched videos", "youtube shorts playlist";
  - "youtube add to playlist hotkey", "youtube playlist button", "auto add to watch later", "automatically add to playlist";
  - "watched percentage", "add watched videos to playlist", "youtube history to playlist", "save to multiple playlists";
  - and the competitors by name.

  About 130 distinct listings were checked.
- **AMO API search:**
  - "youtube playlist", "add to playlist", "watch later", "youtube queue", "save to playlist youtube";
  - "auto add playlist", "youtube hotkeys", "youtube shortcuts", "add to queue youtube", "youtube watched";
  - "quick menu youtube", "youtube save button", "automatically add to playlist", "watched playlist";
  - and the competitors by name.
- **Edge API search:** "youtube playlist", "add to playlist", "watch later", "youtube queue", "add to queue", "playlist manager youtube", and the competitors by name.

**Gaps and caveats:**
- **CWS reviews** come from the first "Recent" page only. Older or "most helpful" complaints may be missing.
- **Edge reviews** weren't retrieved: the ratings API returned "Validation against policy CatalogId failed".
- **Pricing:**
  - PocketTube's Patreon prices are read from page JSON (300 and 3,060 cents) — UNVERIFIED;
  - playlist.tools' premium tier is UNVERIFIED;
  - Enhancer is "free" because no paid tier appears on the listing or the developer's site.
- **Approaches marked inferred:**
  - PocketTube's write path (session, beside a read-only OAuth scope);
  - YT Watch Later Assist and Quick Menu driving YouTube's UI (from their own instructions and text);
  - what Tweaks' "save to playlist" action does.
- **Conflict on Shorts and Watch Later:** YT Restore says YouTube doesn't support Watch Later for Shorts; Watch Later Shortcut says it works on Shorts. 2.0's live check L9 should settle it.
- **Store figures are a snapshot** for 2026-10-19. Several listings (PocketTube, Multiselect, Wrangler, Tidy) update weekly.
- **YouTube Music quick actions** are outside this file's question. In passing:
  - PocketTube says YouTube Music "is not supported" (CWS developer reply, 2026-09-05);
  - Wrangler can play songs on YouTube Music;
  - a Playlist Pro user asks for YouTube Music support (2026-10-18).
