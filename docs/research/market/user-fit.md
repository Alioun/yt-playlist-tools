# Ticket 30: existing-user fit and demand signals

Research for [ticket 30](https://github.com/Alioun/yt-playlist-tools/blob/main/.scratch/rebuild/issues/30-market-and-users.md) ("What sets 2.0 apart, and who is it for?"), covering two of its three parts: **existing-user fit** and **where else demand shows up**. The competitor landscape is out of scope here.

- **Compiled:** 2026-10-19. Every URL was read on 2026-10-19 unless a row says otherwise.
- **Repo context read:**
  - `.scratch/rebuild/spec.md`
  - `.scratch/rebuild/inventory.md`
  - `.scratch/rebuild/spec/09-parity.md`
  - `.scratch/rebuild/spec/08-release.md` §1–5 and §9
  - `.scratch/rebuild/issues/22-name.md`
  - 1.4.5's code at commit `e96dbf7`
- **Marking:**
  - **[unverified]** means a claim couldn't be checked against a primary source.
  - **[inference]** means my reasoning from the cited facts, not a fact itself.

## Gist

1. **The real 1.4.5 audience is small, and most of it probably never got the add-on working.** AMO shows 66 daily users. The setup guide was a generic copy-paste that never named the YouTube Data API. Google's default "Testing" status expires refresh tokens after 7 days. When that happens, 1.4.5 fails silently, and re-authorising means wiping all settings. [inference from code and Google's docs]
2. **The users who left text asked for exactly what 2.0 does:**
   - no credential set-up (a 1-star review, later removed, and the only user-filed GitHub issue);
   - multiple labelled shortcuts;
   - "update it for latest Firefox and YouTube".
3. **2.0's changes mostly serve these users.** The rename, the opt-in default, the new "watched" meaning and dropping the Data API carry little risk for them. Two real risks are in the upgrade path:
   - the note's default for users whose 1.4.5 **never worked**: "add as soon as a video starts";
   - the fallback "!" badge, which most Firefox upgraders can't see, because 1.4.5's button sits in Firefox's Extensions panel by default.
4. **Public demand is loudest for saving with fewer clicks, not for auto-add.** Two YouTube UI changes set off visible backlash:
   - Oct 2025: the Save dialog started closing after each pick;
   - Mar 2026: the Watch later and Add to queue hover buttons were reported removed from feeds.

   Each one produced restore scripts and extensions within weeks.
5. **Watch Later can't be reached through the Data API** (closed 2016, fully deprecated 2020). Developers have asked about it on Stack Overflow since 2013. Single-purpose Watch Later extensions have 1,000-user Chrome listings and 164–406 Firefox daily users.
6. **Auto-add has little voiced demand.** The nearby need, "remember what I've watched", is large: Watchmarker has 10,000 Chrome users and 3,252 Firefox daily users. So auto-add is the existing users' feature, while quick-save, the picker and Watch Later are the growth features.
7. **People's words are:**
   - "Save" and "Save to playlist";
   - "Watch Later";
   - "Add to queue";
   - "one click", "one button" and "too many clicks";
   - "shortcut", "hotkey" and "key combo";
   - "thumbnail", "hover" and "three dots";
   - "multiple playlists";
   - "already watched" and "fully watched".

   Spec 08 §9's draft summary uses none of "Save", "Watch Later" or "shortcut".

## Method and limits

- **AMO:**
  - the public v5 API for the add-on, its ratings and its versions;
  - the Wayback Machine's 13 archived copies of the listing (Aug 2024 to Sep 2026) for usage over time, since AMO's statistics page isn't public;
  - the archived review pages, to recover a deleted review.
- **GitHub:** `gh` for the repo's stars, issues and traffic (owner-only), and for issue searches in other repos.
- **Stack Exchange:** the public API for Stack Overflow and Web Applications.
- **Other sources:**
  - the Greasy Fork API;
  - AMO search and ratings;
  - Chrome Web Store pages;
  - Hacker News (Algolia API);
  - Google's and Mozilla's documentation;
  - the press.
- **Reddit is mostly missing.**
  - reddit.com refuses this agent's tools: `curl` gets a 403 "Blocked" page, WebFetch can't fetch it, and WebSearch rejects the domain.
  - The PullPush archive answered a few requests, then returned 429 with "This website does not provide free scraping resources for agents". I stopped using it at that point.
  - So exactly **one** Reddit thread was read, with its comments, through PullPush. Its scores are as archived, and live values are **[unverified]**. Other Reddit content appears only as quoted by the press.
  - **A manual Reddit pass is the biggest gap in this research.** Suggested searches: `"save to playlist"`, `"watch later" button`, `watch later shortcut`, `add to playlist hotkey`, in r/youtube, r/firefox and r/chrome_extensions.

---

# Question 1: Existing-user fit

## 1.1 The AMO listing today

From `https://addons.mozilla.org/api/v5/addons/addon/youtube-playlist-tools/`:

| Field | Value |
|---|---|
| Name / summary | "YouTube Playlist Tools" / "Add current YouTube video to specified playlists." |
| Created / last updated | 2024-06-18 / 2024-06-21 |
| Current version | 1.4.5. Its file was created 2024-06-21, with permissions `activeTab, storage, identity, scripting, *://*.youtube.com/*`. It requires Firefox 125 or later. |
| Average daily users | **66** |
| Weekly downloads | **3** |
| Ratings | 2, both 5★. The average is 5.0, the Bayesian average 3.03. |
| Category / tags | "other" / none |
| Icon on AMO | AMO's default icon; none was uploaded |
| Privacy policy | none |
| Description | Four bullets, then: "To use this extension you need to supplement your own credentials. Follow the steps in the github readme if you don't know how." and a link to the repo. |

**What "daily users" means:** AMO's statistics have come from Firefox telemetry since 2020. They count **enabled** installs only, so users who opt out of telemetry are missing. They don't measure whether anyone uses the add-on.
- Mozilla Add-ons blog, 2020-06-10: "The dashboards will only show data for enabled installs." <https://blog.mozilla.org/addons/2020/06/10/improvements-to-statistics-processing-on-amo/>
- Extension Workshop, updated 2020-07-30: stats are "aggregated from Firefox telemetry data". <https://extensionworkshop.com/documentation/manage/monitoring-extension-usage-statistics/>

## 1.2 Usage over time

These figures come from the AMO page state embedded in each Wayback copy (`average_daily_users`, `weekly_downloads`, `ratings`). They're point samples, not averages. The archive is listed at <https://web.archive.org/cdx/search/cdx?url=addons.mozilla.org/en-US/firefox/addon/youtube-playlist-tools/&matchType=prefix>.

| Snapshot | Daily users | Weekly downloads | Ratings (count, average) |
|---|---|---|---|
| 2024-08-24 | 7 | 1 | 1, 5★ |
| 2024-10-01 | 9 | 3 | 1, 5★ |
| 2024-11-10 | 12 | 3 | 1, 5★ |
| 2025-01-08 | 15 | 6 | 1, 5★ |
| 2025-02-06 | 20 | 4 | 1, 5★ |
| 2025-12-24 | 51 | 5 | 1, 5★ |
| **2026-01-04** | 49 | 5 | **2, 3.0** (one 1★, one 5★) |
| 2026-02-15 | 54 | 6 | 2, 5★ |
| 2026-04-01 | 60 | 3 | 2, 5★ |
| 2026-05-05 | 58 | 4 | 2, 5★ |
| 2026-05-25 | 58 | 3 | 2, 5★ |
| 2026-07-16 | 55 | 2 | 2, 5★ |
| 2026-09-08 | 60 | 5 | 2, 5★ |
| 2026-10-19 (API) | 66 | 3 | 2, 5★ |

**Reading the table:**
- Daily users rose about ninefold with no update since June 2024.
- Downloads stayed at 1–6 a week. That averages 3.8 a week over 122 weeks, so roughly 460 downloads in total. This is a rough figure from point samples **[inference]**.
- So about one download in seven is still an enabled, telemetry-reporting install.
- An unconfigured 1.4.5 is completely silent, because its toasts are off by default (§1.6). Nothing prompts anyone to uninstall it, so daily users pile up whether or not it works **[inference]**.

## 1.3 Every review, in full

The current reviews come from `https://addons.mozilla.org/api/v5/ratings/rating/?addon=youtube-playlist-tools`. A deleted review was recovered from <https://web.archive.org/web/20251231201719/https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-tools/reviews/>.

| Date | ★ | Reviewer | Full text | Status |
|---|---|---|---|---|
| 2024-07-07 | 5 | Alanyyab | "Very useful for quick saving to playlist. Would be cool to have multiple "Add to playlist" shortcut options. And maybe with some manual labels/titles?" | Live |
| 2025-12-27 | **1** | combativeThinker | "Love how it says to follow the steps in the github readme but doesn't even have a link to the repository. What a joke." | **Deleted.** The listing still counted it on 2026-01-04. The 1★ filter showed zero reviews on 2026-01-16 ([archived](https://web.archive.org/web/20260116143819/https://addons.mozilla.org/en-US/firefox/addon/youtube-playlist-tools/reviews/?score=1)). Who removed it is **[unverified]**. |
| 2025-12-27 | — | Developer reply ("Cephalos") | "You can find the github repo under "More info" and then add-on links :) Or here: https://github.com/Alioun/yt-playlist-tools" | Deleted with the review |
| 2026-02-07 | 5 | John Doe (pcclp2004) | "Could you update it for latest Firefox and YouTube?" | Live, with no reply |

- The repo link was added to the AMO description between the 2025-12-24 and 2026-01-04 snapshots, right after the 1★ review.
- **What these say:**
  - 1 of 3 reviewers praised the add-on and asked for **several labelled shortcuts**.
  - 1 of 3 was stuck on **set-up**.
  - 1 of 3 implies **it stopped working** for them.

## 1.4 Version history

From `https://addons.mozilla.org/api/v5/addons/addon/youtube-playlist-tools/versions/`. Six versions are public, and all are dated 2024-06-19 to 2024-06-21.

| Version | Date | Release note (verbatim) | Needs credentials? |
|---|---|---|---|
| 1.2 | 2024-06-19 | "Wait on youtube navigation to be finished / increase reliability as well as different layouts" | **No.** It clicked YouTube's own Save dialog and supported Watch Later (inventory: `b79268d:src/content.js:81-157`). |
| 1.4.1 | 2024-06-21 | "add watch percentage option / add options page / add playlist to shortcut / use youtube data api v3 instead of dom tomfoolery" | Yes |
| 1.4.2–1.4.4 | 2024-06-21 | OAuth redirect and MV3 fixes | Yes |
| 1.4.5 | 2024-06-21 | "remove unnecessary permissions" | Yes |

Only the first three days' installs ever ran a version that needed no credentials. Nearly everyone counted above installed the bring-your-own-credentials build **[inference from dates]**.

## 1.5 GitHub (`Alioun/yt-playlist-tools`)

- **Stars: 2.**
  - Crunchbits starred on 2024-07-07 at 17:06 UTC, three minutes after Alanyyab's AMO review at 17:03. They may be the same person **[unverified]**.
  - karbak starred on 2024-12-13.
- **User issues: 1.** [#1 "Not sure if I did it right"](https://github.com/Alioun/yt-playlist-tools/issues/1), by loopernow, 2025-02-02. It's still open:

  > "I set up the account, got a Client ID and Client Secret…put the info in the extension…added a playlist and a keyboard shortcut… …and when I press the keyboard shortcut I get a toast notification that the video was added, but I don't actually see any change to the playlist when I refresh the playlist page."

  The developer replied on 2025-02-22, 20 days later, asking for console errors. There's been no follow-up.

  The report matches a 1.4.5 bug: the background script sends "Added … to … playlist" **whatever the API answered**, because `addToPlaylist()` returns nothing (`e96dbf7:src/background.js`).
- **Traffic, last 14 days** (owner-only `traffic/*` endpoints):
  - 21 views from 3 unique visitors;
  - the only referrer is AMO's outgoing redirector, with 2 unique visitors;
  - the 584 clones are almost all CI and agents.
- Everything else in the repo is the owner's own PRs and Dependabot's.

## 1.6 What a 1.4.5 user has to do, and where it breaks

**Set-up**, from 1.4.5's options page and popup at `e96dbf7`, and the README the AMO description pointed to (`d73027e:README.md`, current from 2024-10 to 2026-09):

1. Create a Google Cloud project.
2. Enable an API. The README says "Search for the API you need (e.g., "Google Drive API")". **It never names the YouTube Data API v3.**
3. Set up the OAuth consent screen as "External". The README says only "Fill out the required fields and save".
4. Create an OAuth client of type "Web application", and "Add authorized redirect URIs". **The README doesn't say which.** The right one is shown only on the add-on's options page, as `http://127.0.0.1/mozoauth2/<hash>`.
5. Paste the client ID and secret into the options page, and click Authorize.
6. In the popup, type each playlist's **ID**, copied from its URL. 1.4.5 can't list playlists.
7. Optionally, record a shortcut and set a percentage.

**What the README leaves out, from Google's docs:**
- **Test users:** a new consent screen starts in "Testing", where only listed test users can authorise. The limit is 100 test users. Source: [Manage App Audience](https://support.google.com/cloud/answer/15549945).
- **Expiry:** "A Google Cloud Platform project with an OAuth consent screen configured for an external user type and a publishing status of "Testing" is issued a refresh token expiring in 7 days." Source: [Using OAuth 2.0](https://developers.google.com/identity/protocols/oauth2#expiration), updated 2026-10-16. The Manage App Audience page says the same: test authorisations "will expire seven days from the time of consent".
- **Publishing instead:** apps in production that request sensitive scopes before verification show an "Unverified apps" warning and are capped at "100 new users in total" (same page).

**How 1.4.5 behaves when the token expires**, from `e96dbf7:src/background.js` and `src/options/options.js`:
- `refreshAccessToken()` refers to `sender`, which isn't defined in its scope. A failed refresh therefore throws a ReferenceError instead of showing its toast. Auto-add and the shortcut **stop silently**. This is from reading the code; it wasn't run **[unverified at runtime]**.
- While a refresh token is stored, the **Authorize button is disabled**, showing "Authorized". The only way to re-authorise is the options page's "Clear Storage", which wipes **every** setting, playlist IDs included.
- The auth URL has `access_type=offline` but no `prompt=consent`. Google returns a refresh token "the first time that your application exchanges an authorization code for tokens" ([web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)). A second authorisation may therefore get no refresh token, and 1.4.5 then logs "Authorization failed" to the console only **[inference]**.
- Toasts are **off** unless `toastEnabled` was set, and they're gated in `content.js`. A user who never finished set-up sees nothing at all.
- The success toast fires even when the add failed (§1.5).

**What a 1.4.5 user finds today:** since 2026-09-28 the public README on GitHub describes **1.5.0**, which never shipped. It has "Sign in with Google" through a broker that was never deployed, and "Settings → Advanced", which 1.4.5 doesn't have. Its steps do now name the YouTube Data API v3 and the redirect URIs. (Checked with `gh api repos/Alioun/yt-playlist-tools/readme`; `main` is at `301ae51` on GitHub.) Anyone who installed from AMO in the last three weeks follows instructions for a different UI.

## 1.7 How many probably gave up

**This can't be measured.** AMO counts enabled installs, not working set-ups, and 2.0 has no telemetry. **[inference]**: most of the 66 probably never had a working set-up, or lost it after a week. The reasons:
- the set-up has seven steps, two of them missing from the guide;
- the guide's API example was wrong;
- Testing tokens expire weekly, then fail silently;
- re-authorising needs a full wipe;
- the only two people who wrote about set-up were both stuck: the 1★ review and issue #1;
- the one live 5★ that implies daily use is from July 2024, two weeks after release;
- the later 5★ asks for an update, which suggests it had stopped working;
- an unconfigured 1.4.5 never shows anything, so it stays installed, which explains the steady rise in daily users.

If a number is needed, "a working set-up for well under half" fits the evidence. **No data source confirms it.**

**What this means for the migration:** 2.0's migration (08 §2) treats any stored 1.x key as an upgrader and carries it over. Two groups get different value from that.
- **Working set-up, probably a handful:** a real carry-over.
- **Typed a playlist ID but never authorised, probably the majority of upgraders with keys:** a feature that **works for the first time**, presented as "Kept from 1.4.5".

## 1.8 Does each 2.0 change serve these users, or risk losing them?

| Change | Who it reaches | Serves them | Risks | Verdict |
|---|---|---|---|---|
| **Rename** to "Playlist Pigeon for YouTube™" (ticket 22, PROVISIONAL) | All 66. Firefox updates silently, and the name changes in about:addons and on the button. | The same slug, gecko ID and reviews carry over (08 §9.1). The note's first line says "YouTube Playlist Tools is now Playlist Pigeon". AMO's summary keeps "(Formerly YouTube Playlist Tools.)" through 2.x. | (a) The background tab is titled "Playlist Pigeon 2.0" (08 REL-CON-04). To someone who installed this two years ago and forgot it, that unknown name reads like an unrelated add-on, or adware **[inference]**. (b) Search: the old name contains the exact words "YouTube Playlist", yet the listing already ranks only **16th** for "youtube playlist", **11th** for "add to playlist", **24th** for "save to playlist" and doesn't appear for "watch later" (AMO search API, 2026-10-19). The name gives it little reach today. | **Low risk.** Put the old name in the **tab title** too (§1.9, S3). |
| **"Watched" = time actually played**, not playhead position (PAR-CAP-02, CHANGED) | Only users with a working set-up | It matches how people say it: "fully watched", "already watched" (§2.6). Users distrust YouTube's own progress marker: "even if I watch a video fully on their own page, it happens to show only as 5% or so watched" ([SmartTube #5240](https://github.com/yuliskov/SmartTube/issues/5240), 2025-12-21). Progress is kept across visits for 30 days (PAR-CAP-04), so a video watched in two sittings still counts. | Under 1.4.5, seeking to the end was a deliberate "add it now" gesture. A comparable YouTube Music project documents exactly that: "You can skip to the end of the song to instantly add it to the playlist" ([youtube-music-auto-playlist README](https://github.com/SelfMadeSystem/youtube-music-auto-playlist), 2024-10). 2.0 drops it, but the shortcut and the watch-page button cover explicit adds. For the many upgraders at an unset percentage, 1.4.5 acted at 0 %, and 2.0's 0 % is "1 s played", so nothing changes for them. | **Low risk; it fits.** The note already says "Skipping ahead and ads don't count." |
| **Everything off by default** | New users. Upgraders keep auto-add and the shortcut if those carried over (REL-MIG-22, REL-MIG-23). | People reward small, focused add-ons: "I also really like that permissions are limited to YouTube sites only and code is open source." ([AMO review, 2025-11-09](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later/reviews/)); "Seems to do the trick. I have too many extensions..." ([AMO review, 2023-08-10](https://addons.mozilla.org/en-US/firefox/addon/watch-later-shortcut-youtube/reviews/)) | For upgraders the defaults are fine. The risk is in how consent is surfaced; see the next row. | **Fits.** |
| **Upgrade note and consent** (08 §3–4) | Every upgrader who has any 1.x key | It leads with what the 1★ reviewer and issue #1 needed: "2.0 needs no Google credentials anymore." It also fixes the silent failures, since failures now always show. | **(1) The visibility trap.** The note opens once, in a **background** tab (REL-CON-01, REL-CON-02). After that, the fallback is the violet "!" badge and the popup banner. But 1.4.5's manifest has no `default_area`, so Firefox placed its button in the **Extensions panel** ("defaults to "menupanel"… An extension can't change the location of the button after it has been installed": [MDN, action](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/action), updated 2026-08-21). Unless they pinned it, upgraders never see the badge. Whether Firefox surfaces an unpinned extension's badge on the Extensions button is **[unverified]**. Close the tab unread, and auto-add stops with **no visible sign**, the very "2.0 broke auto-add" outcome ticket 09 meant to avoid. **(2) The wrong default for never-authorised upgraders.** The percentage question defaults to "As soon as a video starts playing, like 1.4.5 did" (REL-CON-05, REL-CON-06). For users whose 1.4.5 never authorised, it **never added anything**. Defaulting them to "add every video that starts" can flood a playlist they half-set-up two years ago **[inference]**. **(3) Overstated copy.** "Kept from 1.4.5 … Adds to {N} playlists you chose in 1.x" is untrue for that group. | **Serves them, with two fixable risks** (S1, S2). |
| **Dropping the Data API** (ADR-0001) | Everyone | Removes the set-up entirely: no Cloud project, test users or 7-day expiry. Watch Later becomes possible, which the API can't do (§2.3c). No quota: 1.4.5 used `playlistItems.insert` at **50 units** against a default **10,000 units a day**, about 200 adds ([quota costs](https://developers.google.com/youtube/v3/determine_quota_cost), updated 2026-10-15). It also answers "update it for latest Firefox and YouTube". | **Breakage when YouTube changes.** Session-based rivals do break: "You hit the button and nothing happens." ([AMO, 2024-11-11](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later/reviews/)); "Seem YT might have done something preventing the Button from actually adding videos" ([dnwjn #201, 2026-04-24](https://github.com/dnwjn/youtube-watch-later/issues/201)). Some users explicitly prefer an independent button, though: "it doesn't use the same buttons youtube uses, but at this point that's better, because it takes the power out of youtube's hands so they can't take it away again" ([AMO, 2026-05-27](https://addons.mozilla.org/en-US/firefox/addon/yt-restore-queue-watch-later/reviews/)). **Edge case:** a user whose credentials belonged to a different Google account than the one signed in on YouTube loses those playlists. Claiming drops IDs the signed-in account doesn't own (REL-MIG-36). Collaborative playlists the user doesn't own may be dropped the same way **[unverified]**. | **Strongly serves them.** Breakage is inherent; 2.0's "never silent" principle is the right answer. |

## 1.9 Suggestions

Scope changes need the user's go-ahead.

- **S1. Branch the note on "was it ever authorised?"** At migration, record whether `refreshToken` existed. If it didn't:
  - default the percentage question to "Once half of it is watched";
  - word the auto-add row as "You set these up in 1.x, but 1.x never got access to your account, so nothing has been added yet."

  Small: one field in `UpgradeDetails` plus copy.
- **S2. Don't rely on the badge for Firefox upgraders.** Options:
  - (a) if the note page was never *visible* (Page Visibility API), reopen it once at the next browser start, still in the background;
  - (b) on the second opening, make it the active tab when the browser starts, when no video is playing yet;
  - (c) say in the note "Pin Playlist Pigeon to your toolbar to see when it needs you".

  New installs could get `default_area: "navbar"`, but that's the user's call, and Firefox keeps upgraders' placement anyway.
- **S3. Put the old name in the tab title:** "YouTube Playlist Tools is now Playlist Pigeon", not "Playlist Pigeon 2.0".
- **S4. Fix the live AMO listing now.** This needs no new version, because descriptions can be edited. The description says to follow the README, but since 2026-09-28 the README describes 1.5.0. Either restore 1.4.5's steps (naming YouTube Data API v3, test users and the 7-day expiry), or say "2.0, coming soon, needs no credentials".
- **S5. At launch,** reply to the 2026-02-07 review ("Could you update it…") and to issue #1, pointing to 2.0.
- **S6. Write the listing in users' words** (§2.6).

---

# Question 2: Demand signals

## 2.1 What YouTube itself offers

First-party facts.

- **Desktop Save** takes three steps: "Click More, then Save, then Select a playlist such as Watch Later, or a playlist you've already created." Source: [YouTube Help 57792, Computer](https://support.google.com/youtube/answer/57792?hl=en&co=GENIE.Platform%3DDesktop).
- **The Android app saves in one tap:** "tap Save to automatically save it to the last playlist you've saved to, or to your Watch Later playlist… To change where your video is saved, tap Change on the pop-up." Source: [YouTube Help 57792, Android](https://support.google.com/youtube/answer/57792?hl=en&co=GENIE.Platform%3DAndroid). The desktop site has no equivalent. That's the gap 2.0's quick-save fills.
- **YouTube Music** added "Remember most recently used playlist" in 2023 ([9to5Google, 2023-06-28](https://9to5google.com/2023/06/28/youtube-music-add-playlist/)).
- **There's no key for Save, Watch later or queue.** The official shortcut list covers playback, seeking, captions, Shift+N/P and `i` for the Miniplayer. Source: [YouTube Help 7631406](https://support.google.com/youtube/answer/7631406?hl=en).
- **YouTube's Watch Later help still documents the hover button:** "While browsing videos: Point to a video's thumbnail and click [Watch later]". Source: [YouTube Help 56101](https://support.google.com/youtube/answer/56101?hl=en&co=GENIE.Platform%3DDesktop).

## 2.2 What set demand off

| When | What happened | Reaction (dated) |
|---|---|---|
| 2022-01 | The home page's Watch Later hover button moved into the ⋮ menu | ImprovedTube issue ["bring back "add to Watch Later" button in video thumbnails"](https://github.com/code-charity/youtube/issues/1201), 2022-01-22 |
| 2025-10 | **The desktop Save dialog closes after each playlist**, so saving to several means reopening it each time | Reddit r/youtube ["RANT: Why did YouTube make this TERRIBLE UPDATE on the "Save to playlist" feature?!"](https://www.reddit.com/r/youtube/comments/1o8v446/rant_why_did_youtube_make_this_terrible_update_on/), 2025-10-17: score 90, 21 comments as archived **[live counts unverified]**. Also: [PiunikaWeb, 2025-10-22](https://piunikaweb.com/2025/10/22/youtube-new-ui-update-poll/); a fix extension, [De-Pattern/Youtube-Multi-Select-Playlist-Fix](https://github.com/De-Pattern/Youtube-Multi-Select-Playlist-Fix), created 2025-10-22 with 8★; ImprovedTube [#3329](https://github.com/code-charity/youtube/issues/3329), 2025-11-01; the mobile patch project Morphe [#3657](https://github.com/MorpheApp/morphe-patches/issues/3657), 2026-10-10, still asking |
| 2025-12 | A Watch later button missing on the subscriptions feed | A Greasy Fork script, ["YouTube Subscriptions Watch Later Button"](https://greasyfork.org/en/scripts/558295-youtube-subscriptions-watch-later-button), created 2025-12-08, 153 installs |
| **2026-03** | **The Watch later and Add to queue hover buttons were reported gone from desktop feed thumbnails** | [PiunikaWeb, 2026-03-27](https://piunikaweb.com/2026/03/27/youtube-hides-watch-later-add-to-queue-buttons-desktop/). YouTube said nothing; it's possibly a test. A rival extension's maintainer wrote: "YouTube has recently removed the "add to Watch Later" button from the video thumbnails in the side feed" ([dnwjn #192](https://github.com/dnwjn/youtube-watch-later/issues/192), 2026-03-28). Restorers followed: Greasy Fork [571443](https://greasyfork.org/scripts/571443-youtube-queue-button-restore) (2026-03-27, 158 installs) and [572245](https://greasyfork.org/scripts/572245-youtube-hover-restore-updated) (2026-04-02); the AMO add-on [yt-restore-queue-watch-later](https://addons.mozilla.org/en-US/firefox/addon/yt-restore-queue-watch-later/) (2026-05-04, 23 daily users); the Chrome extension ["YT Restore — Queue & Watch Later"](https://chromewebstore.google.com/detail/chnenkpdgjebffanaggkhopgimpchdej) (163 users, 3.2★ from 6 ratings, updated 2026-06-29). The removal may be partial or rolled back: "This was useful for a couple of days when youtube's own button disappeared, but now that button is back." ([AMO, 2026-04-01](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later/reviews/)) |
| 2026-05 | Improve YouTube! (102,244 daily users on AMO) merged "Add Watch Later button option to thumbnails" | [code-charity/youtube PR #3858](https://github.com/code-charity/youtube/pull/3858), merged 2026-05-15 |

**The pattern:** whenever YouTube hides or slows a save path, a wave of fixes follows within days. That demand is recurring and real, but small per tool, from dozens to about a thousand users. The largest enhancer has just added one-click Watch Later, so **Watch Later alone is becoming a commodity**. Quick-save to *any* playlist, with a picker that stays open, shows membership and offers Undo, is still open.

## 2.3 Evidence for each need

### a. Auto-adding watched videos to a playlist: little voiced demand

- **Stack Exchange:**
  - Webapps ["Can you add videos automatically to "Watch Later" based on a subscription?"](https://webapps.stackexchange.com/questions/26094), 2012-04-26: score 7, 6,815 views. This is auto-add by *upload*, not by watching.
  - Its 2021 answer is an Apps Script that adds new uploads to a playlist.
- **A YouTube Music project:** [SelfMadeSystem/youtube-music-auto-playlist](https://github.com/SelfMadeSystem/youtube-music-auto-playlist), created 2024-10-16 with 1★, "automatically adds fully listened songs to a local playlist". It works on music.youtube.com and writes to a local list, not to YouTube.
- **Searches found no extension that auto-adds watched videos to a YouTube playlist** (WebSearch, 2026-10-19). That makes it a differentiator, but not a mass request.
- **The adjacent need is large.** "Keep track of what I've watched":
  - Watchmarker for YouTube: **10,000 users** on [Chrome](https://chromewebstore.google.com/detail/pfkkfbfdhomeagojoahjmkojeeepcolc) (4.4★ from 157 ratings), **3,252** daily users on [AMO](https://addons.mozilla.org/en-US/firefox/addon/watchmarker-for-youtube/), and 227 GitHub stars ([sniklaus/youtube-watchmarker](https://github.com/sniklaus/youtube-watchmarker));
  - requests for "Mark as watched" in [ImprovedTube #3525](https://github.com/code-charity/youtube/issues/3525) (2026-01-06) and [NewPipe #11688](https://github.com/TeamNewPipe/NewPipe/issues/11688) (2024-11-09).

  **[inference]** Auto-add can be positioned as "a playlist of what you've actually watched, visible on YouTube everywhere, including on your TV and phone". That speaks to the Watchmarker crowd's need.
- **The existing users:** 1.4.5's listing led with "Automatically add the current video to one or multiple playlists", so they chose it for this.

### b. Keyboard shortcuts to save to Watch Later or a playlist: steady, modest demand

- Webapps ["Hotkey for YouTube video to a playlist"](https://webapps.stackexchange.com/questions/16620), 2011-06-27: score 4, 5,918 views. "I am looking for a way easily to queue up several videos into the "watch it later" playlist… if there is a hotkey assigned to the add to button, or if a hotkey could be added via user script, that would be good."
- "Watch Later Shortcut for YouTube™":
  - [Chrome](https://chromewebstore.google.com/detail/dhegojkfhodaifdnkoigmdoncoonbifd): **1,000 users**, 4.5★ from 42 ratings, version 1.2, updated 2025-04-01;
  - [AMO](https://addons.mozilla.org/en-US/firefox/addon/watch-later-shortcut-youtube/): **164 daily users**, 4.33★ from 9 ratings.
- Greasy Fork ["YouTube Watch Later Shortcut"](https://greasyfork.org/scripts/537622-youtube-watch-later-shortcut), created 2025-05-29: 49 installs. ["YouTube - Hover + Q = Add to Queue"](https://greasyfork.org/scripts/557024-youtube-hover-q-add-to-queue), 2025-11-26: 70 installs.
- The 1.4.5 review (2024-07-07) asked for "multiple "Add to playlist" shortcut options… with some manual labels/titles".
- **Counter-signal: a key isn't enough on its own.**
  - "I wish it also displayed a button on video player page (for example, next to Share button…). 1) I keep forgetting what the shortcut is and I shouldn't have to memorize it. 2) Surely it's faster to just click one button than press 3 keys" ([AMO, 2024-12-16](https://addons.mozilla.org/en-US/firefox/addon/watch-later-shortcut-youtube/reviews/), 2★).
  - "Should have a button on the page of the youtube video that way it's just one step/click instead of using keyboard combo" (same page, 2025-07-12, 2★).

  2.0 pairs keys with the watch-page button, and shows each key in the picker's rows (YT-PK-07). That answers both reviews.

### c. Watch Later unreachable through the Data API: settled fact, long-standing developer pain

- **Primary source:** [YouTube Data API revision history](https://developers.google.com/youtube/v3/revision_history).
  - 2016-09-15: watch history and Watch Later IDs are fixed as `HL` and `WL`, "cannot be retrieved via the API", and list requests "return empty lists".
  - 2020-09-09: `playlistItems.insert` and `delete` support for these playlists is "fully deprecated".
  - 2021-01-28: "users' watch history and watch later lists are, indeed, not accessible via the API".
- **Stack Overflow:**
  - ["Add video to user's "Watch Later" playlist on YouTube"](https://stackoverflow.com/questions/42513339), 2017-02-28: score 17, 4,511 views;
  - ["Youtube API getting Watch Later Playlist"](https://stackoverflow.com/questions/41451533), 2017-01-03: score 28, 11,641 views;
  - ["Is there a way to get the "Watch Later" playlist using YouTube API v3?"](https://stackoverflow.com/questions/15891357), 2013-04-09: score 16;
  - ["Unable to insert video into the watch later (WL) playlist"](https://stackoverflow.com/questions/66156461), 2021-02-11: score 3. "The API does not support the ability to insert videos into the specified playlist."
- **1.4.5's own popup** said "Watch Later doesn't work due to a Youtube Data API limitation." (`e96dbf7:src/popup/popup.html`). The developer told issue #1 the same (2025-02-22).
- **Firefox users have an extra reason:** "YouTube's "Save to Watch Later" popover menu has been broken in Firefox for years… still broken as of December 27, 2025" ([Show HN, 2025-12-27](https://news.ycombinator.com/item?id=46402072)). A reply disputed it: "It's always worked in Firefox for me?" **[unverified either way]**.

### d. One-click save from thumbnails: strong, event-driven demand

- **Size:**
  - "YouTube Watch Later": **406 daily users** on [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later/) (4.25★ from 20 ratings) and **1,000 users** on [Chrome](https://chromewebstore.google.com/detail/nmpfhocciajonacicdelpbhipglapgaa) (4.3★ from 39 ratings);
  - the older AMO "Watch Later": 97 daily users;
  - the restorers listed in §2.2.
- **Quotes from that add-on's [AMO reviews](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later/reviews/):**
  - "It's much easier to press one button than to constantly go into the menu." (2025-11-09)
  - "I was middle mouse button clicking thumbnails to open in a new tab which is not the best workflow. I have been wanting a button on the preview that adds videos to watch later with one click… It also clearly marks that it has been added." (2025-03-29)
  - "I like to middle click a bunch of videos and have a bunch of tabs. Would be nice to have that watch later button on the actual video itself instead of ONLY the thumbnail." (2025-07-12)
  - "The add-on was also missing the option to click the button again to undo adding the video to watch later." (2026-04-01)
- **Quote from a restorer's [AMO reviews](https://addons.mozilla.org/en-US/firefox/addon/yt-restore-queue-watch-later/reviews/):** "I searched for a solid month for ANY sort of fix that gave me an integrated queue and watch later…" (2026-05-27)
- **Saving to a playlist other than Watch Later:** "I manage 2 "watch later" playlist, one to watch with my partner, the other where I keep videos that only interest me. The button on the thumbnail only add to the default "watch later" playlist from YT." ([ImprovedTube #1304](https://github.com/code-charity/youtube/issues/1304), 2022-05-20)
- **Older one-click scripts:** Greasy Fork ["Youtube: Add to Playlist Icons"](https://greasyfork.org/scripts/21703-youtube-add-to-playlist-icons), "adds to specific playlists with 1 click": 688 installs since 2016.
- **From feeds and notifications:**
  - "There's no fast and efficient way to add videos to "Watch Later" or "Queue" from the homepage, search results, or upload notifications." ([ImprovedTube #2009](https://github.com/code-charity/youtube/issues/2009), 2024-02-12, 11 comments)
  - "Can't add video to WL from notification menu… Tedious for multiple videos." ([#652](https://github.com/code-charity/youtube/issues/652), 2020-11-24, 6 reactions)

### e. YouTube's Save flow is too many clicks: strong demand, peaking since October 2025

- **The thread opener** ([Reddit, 2025-10-17](https://www.reddit.com/r/youtube/comments/1o8v446/rant_why_did_youtube_make_this_terrible_update_on/), 90 points as archived): "I use the "Save to playlist" feature of YouTube a LOT. After watching a video, I save it into private playlists with a particular category, such as "Important / Interesting"… "Laftrip"…"
- **Comments, with archived scores:**
  - "I have to click a bunch of times to save the same video." (3)
  - "I keep accidentally removing videos from my playlists because the layout is so bad i cant even see that i've already added that video before." (4)
  - "the delay between clicking the save button and the menu being displayed is like a full second" (6)
  - "I have about 60 names playlists, in fact they're even numbered so that they show up in the right order on my TV" (3)
  - "The existing implementation has been nearly useless for years (no easy sorting, duplicate names of lists, no good search…)" (3)
  - "the default is for it to add to the most recent playlist, but if that's the wrong one… it re-adds it to the (wrong) prior playlist *again*" (4)
  - "I use my profile for learning piano, writing, filmmaking, more than 20 music playlists… now I have to manually add a video to each category it falls under" (3)
- **Press:** PiunikaWeb estimates the change turns "a three-step process into six or more clicks" ([2025-10-22](https://piunikaweb.com/2025/10/22/youtube-new-ui-update-poll/)).
- **Proposal on ImprovedTube:** "As soon as you click to add your video to one playlist, the menu disappears and you need to repeat the whole process again if you want to add the video you are watching to multiple playlists." ([#3329](https://github.com/code-charity/youtube/issues/3329), 2025-11-01)
- **Tools for searching and sorting the Save dialog:**
  - Greasy Fork ["YouTube Save to playlist incremental search"](https://greasyfork.org/scripts/392141-youtube-save-to-playlist-incremental-search): 303 installs, 16 good ratings, updated 2026-07-28;
  - AMO [YouTubePlaylistSearch](https://addons.mozilla.org/en-US/firefox/addon/youtubeplaylistsearch/), 2026-03: 15 daily users;
  - Chrome "YouTube Save-to-List Enhancer": 85 users;
  - Webapps ["How to organize Youtube play lists in Alphabetical order under the Save button?"](https://webapps.stackexchange.com/questions/135637), 2019.

## 2.4 Size proxies

All counts are from 2026-10-19.

| Tool | Need | Users |
|---|---|---|
| Watchmarker for YouTube | Remember what I watched | Chrome 10,000; AMO 3,252 daily |
| YouTube Watch Later Cleaner ([AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later-cleaner/)) | Prune Watch Later (an adjacent need 2.0 doesn't serve) | AMO 1,270 daily |
| YouTube Watch Later (one-click) | Thumbnail save to Watch Later | Chrome 1,000; AMO 406 daily |
| Watch Later Shortcut for YouTube™ | Key to save to Watch Later | Chrome 1,000; AMO 164 daily |
| YT Restore / YouTube – Restore Queue & Watch Later | Restore hover buttons | Chrome 163; AMO 23 daily |
| Greasy Fork save and queue scripts (seven listed above) | Various | 30–688 installs each |
| *Context:* Improve YouTube! | Large enhancer that now includes thumbnail Watch Later | AMO 102,244 daily |
| *Context:* YouTube Playlist Tools 1.4.5 | Auto-add and a shortcut | AMO 66 daily |

## 2.5 Personas

Each persona's evidence is in §1 and §2.3.

1. **The Sorter.** Keeps 20–60 themed playlists, and saves each video to one or more after watching it.
   - Pain: the Save dialog closes after each pick; no search or sort; can't see where a video already is; the wrong default playlist.
   - Words: "Save to playlist", "multiple playlists", "category", "click a bunch of times".
   - 2.0 fit: **high**. The picker stays open, ticks several playlists, shows check marks for membership, has search and Sort A–Z, and creates playlists (YT-PK-01 to YT-PK-04). Labelled shortcuts for the top few playlists. Auto-add with channel filters can do some of the sorting automatically.
2. **The Feed Triager.** Scans home, subscriptions and notifications, and stages videos in Watch Later or the queue, often by middle-clicking tabs open.
   - Pain: the hover buttons disappear or move; the ⋮ menu costs three clicks; there's nothing on the watch page.
   - Words: "one click", "button on the thumbnail", "bring back", "restore", "Watch Later", "queue".
   - 2.0 fit: **high**, with competition. Quick-save to any playlist (Watch Later by default), the queue button, the watch-page button and Undo.
3. **The Keyboarder.** Wants a key to save the current or pointed-at video, and forgets combos.
   - Words: "shortcut", "hotkey", "key combo".
   - 2.0 fit: **high**. Up to 20 labelled keys (Alt+W preset to Watch later), keys shown in the picker, and the watch-page button for when they forget.
4. **The Logger.** Wants a record of what they've actually watched or heard.
   - Words: "already watched", "fully watched", "mark as watched", "keep track".
   - 2.0 fit: **medium**. Auto-add (time actually played, 30-day progress) builds the record as a YouTube playlist. This persona hasn't asked for a playlist; it asked for markers. Positioning has to make the connection.
5. **The Careful Firefox user.** Values YouTube-only permissions, open source, no sign-in and no data leaving the browser; tolerates no bloat.
   - 2.0 fit: **high**. Local-first, no telemetry, everything opt-in, `data_collection_permissions: none`.
6. **The 1.4.5 upgrader.** A Firefox user who tinkered enough to try Google Cloud credentials. Either
   - (a) has a working set-up and wants it to keep working, probably a handful; or
   - (b) never got it working and has forgotten it's installed, probably the majority.

   2.0 fit: **high for (a); a pleasant surprise or a confusing tab for (b)** (S1, S2, S3).

YouTube Music listeners weren't researched here; the brief's five needs are all about YouTube.

## 2.6 The words people use, for the listing and the name

| Term | Use | Where it appears |
|---|---|---|
| **Save**, **Save to playlist** | YouTube's own label; the verb people use | Reddit thread title; Help 57792; ImprovedTube #3329 |
| **Watch Later** / "watch later list" | Very high frequency | Every source in §2.3 b–d |
| **Add to queue**, **queue** | Paired with Watch Later | PiunikaWeb 2026-03-27; ImprovedTube #2009; the restorer names |
| **one click**, **single click**, **one button** | The benefit people ask for | AMO reviews; Chrome listing "with a single click" |
| **too many clicks**, "click a bunch of times", "six or more clicks" | The pain | Reddit; PiunikaWeb |
| **shortcut**, **keyboard shortcut**, **hotkey**, "key combo" | The keys need | Webapps 16620; Greasy Fork; AMO reviews |
| **thumbnail**, **hover**, **three dots** / ⋮ menu | Where people expect the button | PiunikaWeb; AMO reviews; ImprovedTube #1201 |
| **multiple playlists**, **categories**, **organize** | The Sorter's language | Reddit; ImprovedTube #3329; Morphe #3657 |
| **restore**, **bring back** | Event-driven searches | YT Restore; ImprovedTube #1201 and #3329 |
| **automatically add**, **auto add**, "fully watched", "already watched" | The Logger's language | SelfMadeSystem; Watchmarker; webapps 26094 |
| "quick saving" | The 1.4.5 reviewer's phrase | AMO review, 2024-07-07 |

**Recommendations:**

- **The name.** "Playlist Pigeon for YouTube™" keeps "Playlist" and "YouTube", which is enough. The name gave little search reach even in its keyword-rich 1.4.5 form (§1.8). **Don't stuff keywords into the name.** Chrome's spam FAQ advises keeping any one keyword under five instances and warns against irrelevant metadata ([CWS spam policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/spam-faq)).
- **The summary.** Spec 08 §9.1's draft ("Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click away…") misses **Save, Watch Later, shortcut** and, for YouTube, **one click**. Drafts in users' words, all within limits:
  - AMO summary, 206 of 250 characters: "Save YouTube videos to Watch Later or any playlist in one click or with a shortcut, and auto-add the videos you actually watch. No Google sign-in. Every feature is opt-in. (Formerly YouTube Playlist Tools.)"
  - Chrome manifest `description`, 119 of 132 characters: "Save videos to Watch Later or any playlist in one click or with a shortcut, and auto-add the videos you actually watch."
  - If YouTube Music must be in the summary, at 220 of 250 characters: "One-click Save and Watch Later on thumbnails, keys for your playlists, auto-add for what you actually watch, and YouTube Music quick actions. No Google sign-in; every feature is opt-in. (Formerly YouTube Playlist Tools.)"
- **The description.** Open with the pain, in users' words: "YouTube's Save takes three clicks and closes after every playlist." Name "Watch Later" naturally, two or three times. Use "Save" as the verb throughout.
- **Check:** that "Watch Later" as a feature name needs no trademark line. Ticket 22's list of Google marks doesn't include it **[unverified]**.

## 2.7 Which 2.0 features answer voiced pain

| 2.0 feature | Voiced pain? | Strength | Key evidence |
|---|---|---|---|
| No Google sign-in or credentials | Yes, from existing users | **Strong** (for the base) | 1★ review 2025-12-27; issue #1; §1.6 |
| Watch Later as a target | Yes | **Strong** | API closed since 2016 and 2020; SO questions; 1.4.5's own disclaimer |
| Picker: stays open, several playlists, membership, search, sort, new playlist | Yes | **Strong, timely** | Reddit 2025-10-17; ImprovedTube #3329; De-Pattern fix; Morphe #3657; incremental-search scripts |
| Quick-save on thumbnails (any playlist) | Yes | **Strong**, but Watch Later alone is a commodity now | The 2026-03 removal; restorers; one-click Watch Later extensions; ImprovedTube #1304, #2009; Improve YouTube! PR #3858 |
| Queue button on thumbnails | Yes | **Medium–strong**, and volatile | Same removal; "Hover + Q"; restorers. YouTube sometimes brings its own back, and 2.0 steps aside then (PAR-CAP-34). |
| Several labelled playlist shortcuts (Alt+W → Watch later) | Yes | **Medium** | The 1.4.5 review; Watch Later Shortcut (1,000 + 164); webapps 16620 |
| Watch-page button | Yes | **Medium** | Two 2★ reviews asking for a button on the video page; "on the actual video itself" |
| Undo on every save | Some | **Weak–medium** | "missing the option to click the button again to undo"; "accidentally removing videos" |
| Auto-add (time actually played) | Little directly | **Weak publicly; core for existing users**. The adjacent "track what I watched" need is large. | §2.3a |
| Changed "watched" meaning | Indirectly | Supportive | "fully watched" language; distrust of YouTube's progress bar |
| Everything off by default | Indirectly | Supportive | Permission-minimal praise; "too many extensions" |
| Channel filters | **None found** | — | Only the developer's own 2024 "Planned: Denylist for channels" (`d73027e:README.md`) |
| Auto-add on Shorts | **None found** for auto-add | — | Saving Shorts to queue or Watch Later is asked for ([ImprovedTube #2460](https://github.com/code-charity/youtube/issues/2460), 2024-07-08) |
| Right-click for the video menu | **None found** | — | — |
| A setup per YouTube account | **Not found** (not searched deeply) | — | — |
| Settings sync | **Not found** | — | — |
| Creating playlists from the extension | **Not found** separately | — | YouTube's dialog already has "New playlist" |
| YouTube Music quick actions | **Not researched here** | — | — |

---

## Open and unverified points

- **The March 2026 hover-button removal** has one press source plus maintainers' and reviewers' reports. YouTube never announced it. It may be a partial A/B test, and one user said it came back by 2026-04-01.
- **Whether the October 2025 Save-dialog behaviour still holds on desktop** wasn't checked live. Morphe #3657 (2026-10-10) shows it on mobile at least.
- **The share of 1.4.5 users with a working set-up:** unmeasurable (§1.7).
- **1.4.5's runtime failure modes** (§1.6) come from reading the code against Google's docs, not from running it.
- **Whether Firefox shows an unpinned extension's badge** on the Extensions button.
- **Whether the deleted 1★ review was removed by its author or by AMO.**
- **The Reddit scores** are PullPush's archived values. Reddit itself couldn't be checked.

## Files and sources

**Local repo files read:**
- `.scratch/rebuild/spec.md`
- `.scratch/rebuild/inventory.md`
- `.scratch/rebuild/spec/08-release.md`
- `.scratch/rebuild/spec/09-parity.md`
- `.scratch/rebuild/spec/02-youtube.md` (YT-PK)
- `.scratch/rebuild/issues/22-name.md`
- `git show e96dbf7:{manifest.json,src/background.js,src/content.js,src/options/options.{html,js},src/popup/popup.{html,js}}`
- `git show d73027e:README.md`

**Raw captures weren't kept.** Every AMO and Wayback figure can be fetched again from the URLs given.

Every external source is cited inline above, with its date.
