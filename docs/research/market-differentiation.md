# What sets 2.0 apart, and who is it for?

Synthesis for wayfinder ticket 30 (`.scratch/rebuild/issues/30-market-and-users.md`). It adds no new research. Every claim traces to one of the three source reports in [`market/`](market/), or to the 2.0 spec, all read on 2026-10-19.

**Citation keys**
- **[YT §n]** [`market/youtube-landscape.md`](market/youtube-landscape.md): YouTube save, queue and auto-add competitors.
- **[YM §n]** [`market/youtube-music-landscape.md`](market/youtube-music-landscape.md): YouTube Music power-user tools.
- **[UF §n]** [`market/user-fit.md`](market/user-fit.md): 1.4.5's users, reviews, demand signals, personas and vocabulary.
- **Spec IDs** (`PAR-*`, `REL-*`, `YT-*`, `YM-*`, ADR numbers), **[T22]** (ticket 22) and **[FTU]** (`for-the-user.md`) are in the local working files under `.scratch/rebuild/`.
- **[inference]** marks this report's own reasoning from cited facts. **UNVERIFIED** is carried over from the sources.

The name "Playlist Pigeon" is PROVISIONAL on ticket 22 throughout.

---

## Answer

**USP.** Playlist Pigeon saves the video or song you're looking at to the right playlist (Watch Later or any other) in one click or one named key, auto-files the videos you actually watch, and puts Play next and Add to queue right on YouTube Music's songs, all with Undo and all off until you switch them on.

**Differentiators, strongest first**

| # | Differentiator | Why nobody else matches it | Voiced demand |
|---|---|---|---|
| 1 | **Any playlist, one action:** quick-save to a pinned playlist, plus up to 20 named keys, each to its own playlist | Every one-click tool saves to Watch Later only. Wrangler's + needs a search step and has no pinned default. Nobody has per-playlist keys [YT §5.2–5.3] | **Strong.** Save-dialog backlash (Reddit, 2025-10-17, 90 points as archived). "Other playlist" requests on two Watch Later tools (2026-07-27, 2026-09-07) and on our AMO page (2024-07-07). Android saves in one tap; desktop doesn't [UF §2.1–2.3; YT §1] |
| 2 | **YouTube Music, one click in the page:** Play next, Add to queue and Save on rows, cards and album headers, with keys for the pointed-at song | No extension, userscript or desktop client does this. The closest are toolbar popups (Companion) and Pear's HTTP API [YM §1, §10] | **Some, and steady but small:** Reddit 2024-09-12; Pear #1083, #2820, #4753; BetterYTM #98, #166 [YM §7] |
| 3 | **Auto-add what you actually watched,** per playlist, with channel filters | No extension or userscript does this. Others use "watched" only to remove or filter [YT §5.1] | **Little in public.** It's why 1.4.5's users installed. The adjacent "track what I watched" need is large: Watchmarker has 10,000 CWS and 3,252 AMO users [UF §2.3a] |
| 4 | **Undo on every save and queue add,** on both sites | No queue tool or YouTube Music tool has it. Only Watch Later Button (Watch Later only, 10 s) and Wrangler (playlist edits) come close [YT §5.4; YM §1] | **Some:** "missing the option to … undo" (AMO, 2026-04-01); "accidentally removing videos" (Reddit) [UF §2.3d–e] |
| 5 | **Off until chosen, never silent** | No playlist tool starts with features off; only the suite Tweaks does. No listing advertises a breakage status (UNVERIFIED) [YT §5.5–5.6] | **Indirect:** complaints about bloat and silent breakage across the field [YT §5.5–5.6] |

**Not differentiators: the listing must not lead with these**
- **"No sign-in, no server, uses your session":** at least ten YouTube rivals and Companion say the same [YT §6.1; YM §10]. It sets 2.0 apart only from 1.4.5 and PocketTube, so it belongs in the upgrade note and "How it works".
- **One-click Watch Later buttons:** merged into Improve YouTube (400,000 CWS users) on 2026-05-15, and offered by six small tools [YT §6.2; UF §2.2].
- **Queue buttons on thumbnails:** Streamline, five or more small tools, and YouTube's own button. Only the Undo is distinct [YT §6.4].
- **A picker with membership ticks, creating playlists, and no duplicates:** YouTube's own Save dialog and Wrangler already do these [YT §6.3, §6.5–6.6].
- **On YouTube Music,** Like on rows, moving queued items and per-feature toggles [YM §9–10]. **On both sites,** account setups and settings sync: no voiced demand found [UF §2.7].

**Positioning.** For people who save a lot on YouTube and YouTube Music (who sort videos into many playlists, triage feeds into Watch Later and the queue, or want a playlist of what they've actually watched), Playlist Pigeon puts the right playlist one click or one key away. Unlike Watch-Later-only buttons, playlist organizers and popup mini players, it acts on the video or song you're looking at, inside YouTube's own pages, saves to any playlist with Undo, and changes nothing on the page until you switch a feature on.

**Store summaries,** in users' words: Save, Watch Later, any playlist, one click, shortcut, Add to queue [UF §2.6].
- **AMO** (246 of 250): "Save YouTube videos to Watch Later or any playlist in one click or with a shortcut, auto-add the videos you actually watch, and get one-click Play next and Add to queue on YouTube Music. Every feature is opt-in. (Formerly YouTube Playlist Tools.)"
- **Chrome** (132 of 132): "Save to Watch Later or any playlist in one click or a shortcut, auto-add what you actually watch, and Add to queue on YouTube Music."
  - To leave 2 characters spare (130): end it with "…and queue on YouTube Music." instead.

---

## 1. The landscape

### 1.1 Market shape

- **The big YouTube extensions aren't save tools.** Enhancer has 2,000,000 CWS users, Improve YouTube 400,000 and Tweaks 70,000. Only Improve YouTube has Watch Later thumbnail buttons, and only Tweaks has a "save to playlist" action [YT §1.7].
- **The two big playlist tools are badly reviewed now.** PocketTube (60,000) paywalls add and queue; Multiselect (70,000) broke in its 4.0 update. Both are organizers, not save-as-you-watch tools [YT §1.8].
- **The closest YouTube rival is small and new.** Playlist Wrangler has 444 CWS and 39 AMO users, and launched on AMO on 2026-07-20 [YT §3.1].
- **The top YouTube Music extensions are cosmetic.** Better Lyrics has 100,000 CWS users and ThemeSong 60,000. The biggest power-user product is a desktop wrapper, Pear Desktop (33,810 GitHub stars) [YM §1.4].
- **Firefox is thin for this niche.** The biggest one-click Watch Later add-on has 406 AMO users [YT §1.9].
- **The user metrics aren't comparable:** CWS shows rounded buckets, AMO shows average daily users [YT, header].

### 1.2 Feature matrix: 2.0 against the eight closest

Y = yes · P = partial · N = no · ? = not stated in the sources · n/a = the other site's tool. Users are CWS · AMO unless noted.

| Tool | Users | Auto-add on watching | Named key per playlist | One click to a chosen non-WL playlist | Picker with membership | YouTube queue button | YTM Play next / Add to queue in page | YTM keys on pointed-at item | Undo (save or queue) | Off by default | Session, no sign-in | Price |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **2.0 (spec)** | n/a | Y | Y (20) | Y (pinned) | Y | Y, with Undo | Y | Y | Y | Y | Y | MPL-2.0; no paid tier specified |
| Playlist Wrangler | 444 · 39 | N | N (only `toggle-panel`) | P (+ opens a search; no pinned default) | Y (tick removes) | P (real queue; queue Undo UNVERIFIED) | N | N | P (playlist edits) | N (telemetry on, can be switched off) | Y | Free; 2nd account unlock asks for e-mail |
| PocketTube PlayList Manager | 60,000 · 2,618 | N | N (generic shortcuts, not per playlist) | N | N | P, paid only | N ("not supported") | N | ? | N | N (Google OAuth) | Patreon; save and queue paywalled |
| Improve YouTube! | 400,000 · 102,244 | N (tracks watched only) | N (about 45 actions, none save) | WL only | N | N | ? | ? | ? | ? | page-only | Free, open source |
| YouTube Watch Later (dnwjn) | 1,000 · 406 | N | N | WL only | N | N | ? | ? | N (asked for, AMO 2026-04-01) | ? | Y | Free, open source |
| Tweaks for YouTube | 70,000 · 8,036 | N | P (opens YouTube's Save menu, UNVERIFIED) | N | N | N | ? | ? | ? | Y | page-only | Free; Patreon |
| Companion for YouTube Music | ~1,000 · 87 | n/a | n/a | n/a | P (current song, in popup) | n/a | P (popup rows only) | N | P (an unliked song dims) | P (row actions switchable) | Y | GPL-3.0 |
| BetterYTM (userscript) | Greasy Fork 1,735 · OpenUserJS 408 | n/a | n/a | n/a | N | n/a | P (Remove from queue only) | N | N | Y | n/a | Open source |
| Pear Desktop (app) | 33,810 GitHub stars | n/a | n/a | n/a | N | n/a | P (HTTP API only) | N (global playback keys only) | N | Y (plugins off) | Own app; Google sign-in fails in its embedded browser for some users | Open source |

Sources: [YT §3.1–3.3, §3.10–3.12, §4]; [YM §3.1, §4, §5.1, §9, §11]. 2.0's queue Undo and its installed-app support are PROVISIONAL on live checks (PAR-NEW-16, PAR-NEW-13).

### 1.3 Who 2.0 is for

| Persona | Pain, in their words | 2.0 fit | Source |
|---|---|---|---|
| **The Sorter:** 20–60 themed playlists | "Save to playlist", "click a bunch of times", "multiple playlists" | High: a picker that stays open, multi-tick, membership, search; labelled keys; auto-add with channel filters | [UF §2.5] |
| **The Feed Triager:** stages videos from feeds | "one click", "button on the thumbnail", "bring back" | High, with competition: quick-save to any playlist, queue button, watch-page button, Undo | [UF §2.5] |
| **The Keyboarder** | "shortcut", "hotkey", "key combo"; forgets combos | High: 20 labelled keys, shown in the picker; watch-page button as fallback | [UF §2.5] |
| **The Logger:** wants a record of what was watched | "already watched", "fully watched" | Medium: auto-add builds that record as a playlist, but this persona asked for markers, so positioning must make the link | [UF §2.5] |
| **The Careful Firefox user** | praises YouTube-only permissions, open source | High: local-first, no telemetry, everything opt-in | [UF §2.5] |
| **The YouTube Music queue builder** | "I'd rather have the add to queue button next to play button"; Save needs the ⋮ menu | High in the page; weak for "control from anywhere" (global keys) | [YM §7–8, §11] |
| **The 1.4.5 upgrader** | "update it for latest Firefox and YouTube" | High if their setup worked; a surprise or a confusing tab if it didn't (§4) | [UF §2.5] |

---

## 2. White space and crowded areas

### 2.1 White space (nobody covers it)

| Area | Site | Nearest substitute | Source |
|---|---|---|---|
| Auto-add on actual watching | YouTube | none; watch progress is used only to remove (Watch Later Tidy, Watched Videos Remover) | [YT §5.1] |
| Named per-playlist keys | YouTube | Watch-Later-only keys; a 3-user AMO add-on that clicks YouTube's menu; Tweaks' action opens the Save dialog | [YT §5.2] |
| One click to a chosen non-WL playlist | YouTube | Wrangler's searchable + (an extra step, no pinned default) | [YT §5.3] |
| Undo on queue adds | both | none; Watch Later Button's 10 s Undo covers Watch Later saves only | [YT §5.4; YM §10.4] |
| One-click Play next / Add to queue in YouTube Music's page | YTM | toolbar popups (Companion, the AMO mini player); Pear's HTTP API | [YM §10.1] |
| Keys that act on the pointed-at song | YTM | none; every hotkey tool acts on the playing song | [YM §10.3] |
| Save to a quick-save playlist with a searchable picker showing membership | YTM | P-key userscripts and ytmdesktop that open YouTube Music's own dialog | [YM §10.2] |
| Whole albums and playlists from their headers, in the page | YTM | native ⋮ (two clicks); Companion's popup | [YM §10.6] |
| Not depending on the player bar (Wiz miniplayer test) | YTM | none; tools tied to the bar broke (ytmdesktop, Pear, BetterYTM, ThemeSong, lidel) | [YM §6, §10.5]; YM-BAR-1 |
| A visible breakage status | both | none advertised (UNVERIFIED) | [YT §5.5] |
| Opt-in, zero footprint in a playlist tool | YouTube | Tweaks (a general suite) | [YT §5.6] |
| Firefox as a whole | YouTube | tiny AMO save tools (406, 164, 65, 39 users) | [YT §5.8] |

### 2.2 Crowded (2.0 doesn't stand out)

| Area | Who's there | What it means for 2.0 | Source |
|---|---|---|---|
| "No sign-in, uses your session" | Wrangler, Watch Later Tidy, PushList, Playlist Pro, dnwjn, Multiselect and others; Companion and the AMO mini player on YTM | Table stakes; upgrade story only | [YT §6.1; YM §10] |
| One-click Watch Later buttons | Improve YouTube, six small tools, YouTube itself in places | Commodity; WL is the default target, not the pitch | [YT §6.2; UF §2.2] |
| Picker that shows membership | YouTube's Save dialog; Wrangler | Parity at best, unless placement, speed or native look win | [YT §6.3] |
| Queues | Streamline (3,000), five or more small tools, YouTube's queue | Undo is the only edge | [YT §6.4] |
| Creating playlists; duplicates | YouTube's dialog, Better Playlists, PushList Pro; Multiselect, Wrangler, Deduper | A guarantee, not a reason to install | [YT §6.5–6.6] |
| Bulk organizing and clean-up | PocketTube, Multiselect, Watch Later Tidy, Wrangler, Reverser (40,000) | 2.0 doesn't compete; the listing mustn't imply it does | [YT §6.7] |
| YTM: playing-song hotkeys and popup mini players | lidel, six mini players, Pear, ytmdesktop | 2.0's in-page keys don't win "control from anywhere" | [YM §3.1–3.2, §11] |
| YTM: moving queued items; modular toggles | native drag, Companion, Pear; BetterYTM, Pear plugins | Table stakes | [YM §10] |

---

## 3. Threats

| Threat | Signal | What it would take away | Response |
|---|---|---|---|
| **Companion for YouTube Music adds in-page buttons** | About 20 commits on 2026-10-12/13 alone; GPL-3.0; the same local-first pitch; already has Play next and Add to queue on popup rows | Differentiator 2 | Ship YouTube Music in 2.0.0. Lead its copy with what Companion lacks today: buttons in the page, keys for the pointed-at song, a quick-save playlist, Undo [YM §3.1, §10] |
| **Playlist Wrangler adds a pinned destination, per-playlist keys or auto-add** | The closest rival; already has the +, search, recent destinations, a tick that removes, the real queue, multi-account, session, free; releases weekly (1.40.0 on 2026-10-16) | Part of differentiator 1; picker parity is already gone | Lead with one-click to a pinned playlist, named keys and auto-add, not the picker. Its weak spots today: telemetry on by default, a side-panel bug in "roughly one install in seven", a "Bizarre UI" review [YT §3.1] |
| **Improve YouTube's Watch Later buttons** | Merged 2026-05-15; 400,000 CWS and 102,244 AMO users | Any listing that leads with Watch Later buttons | Lead with "any playlist" [YT §3.10; UF §2.2] |
| **YouTube itself** | Hover buttons came back for some users ("now that button is back", AMO, 2026-04-01). Android already saves in one tap to the last playlist. YouTube Music added "Remember most recently used playlist" in 2023 | Queue button; parts of quick-save | 2.0 already steps aside where YouTube draws its own queue button (PAR-CAP-34). Named keys, auto-add and the YTM work stay distinct [UF §2.1–2.2] |
| **YouTube changes break 2.0** | The Wiz miniplayer test broke ytmdesktop, Pear, Web Scrobbler, BetterYTM, ThemeSong and lidel's hotkeys; silent breakage in Multiselect 4.0, Enhancer and YT Restore. 2.0 has no remote config, and Chrome fixes take days to weeks | Every differentiator, and first reviews | The never-silent status (PAR-DEF-42). How fast a fix lands depends on the maintainer, not the form factor [YM §6; YT §5.5; REL §8.3] |
| **Native YouTube Music clients** (limusic, Orchard, JustAnotherMusicClient) | limusic: 1,152 stars since 2026-07-03; "By far the best alternative" (Reddit, 2026-09-16) | YTM users who leave the web app | A different slot: they replace the page. 2.0 keeps the browser's own sign-in, casting in Chrome, and coexists with Better Lyrics and ThemeSong [YM §5.2, §11] |

**Wording risk [inference]:** given these release cadences, any "only" or "first" claim in store text can go stale within weeks. The listing should say what 2.0 does, not that nobody else does it.

---

## 4. Existing-user fit

### 4.1 Who the 66 users likely are

- **All on Firefox.** 1.4.5 is AMO-only, so every upgrader is a Firefox user [REL §1].
- **66 is a count of enabled installs, not of use.** AMO counts enabled installs reporting telemetry [UF §1.1].
- **Growth without updates.** The count rose from 7 (2024-08-24) to 66 with no update since 2024-06-21, at about 3.8 downloads a week, roughly 460 in total [UF §1.2, inference].
- **Nearly all have the bring-your-own-credentials build** (1.4.1 and later) [UF §1.4].
- **Most probably never had a working setup, or lost it within a week [inference, unmeasurable]:**
  - the guide never named the YouTube Data API;
  - Google's "Testing" tokens expire after 7 days;
  - when they do, 1.4.5 fails silently, and re-authorising wipes every setting [UF §1.6–1.7].
- **Only four people left text:** three reviewers and one GitHub issue. The repo has two stars [UF §1.3, §1.5].
- **They chose it for auto-add.** 1.4.5's listing led with it [UF §2.3a].
- **Persona 6 has two groups:** (a) a working setup, probably a handful; (b) a forgotten install, probably the majority [UF §2.5].

### 4.2 What they asked for, against 2.0

| Ask | Where | 2.0 |
|---|---|---|
| "Multiple 'Add to playlist' shortcut options … with some manual labels/titles" | AMO 5★, 2024-07-07 | **Yes:** up to 20 named shortcuts (PAR-NEW-05) |
| A setup without Google Cloud credentials | Deleted 1★, 2025-12-27; issue #1, 2025-02-02 | **Yes:** no credentials (ADR-0001; PAR-CAP-76) |
| "Could you update it for latest Firefox and YouTube?" | AMO 5★, 2026-02-07 | **Yes,** on Firefox 140 or later. Older Firefox stays on 1.4.5 (PAR-CAP-65) |
| A toast said "added" but the playlist didn't change | Issue #1 | **Yes:** success is read from YouTube's `status` (PAR-DEF-36) |
| Watch Later (1.4.5's popup said it couldn't) | 1.4.5's popup; Stack Overflow since 2013 | **Yes:** Watch Later is a target everywhere (PAR-NEW-01) |
| "Very useful for quick saving to playlist" | AMO 5★, 2024-07-07 | **Yes:** quick-save and the picker |

Sources: [UF §1.3, §1.5, §2.3c].

### 4.3 Upgrade risks and proposed fixes

| # | Risk | Who | Proposed fix | Go-ahead? |
|---|---|---|---|---|
| U1 | **Wrong default for never-authorised upgraders.** The note's percentage question defaults to "As soon as a video starts playing" (REL-CON-05, REL-CON-06). For someone whose 1.4.5 never authorised, that can flood a playlist half-set-up two years ago [inference] | Upgraders with an unset percentage and no `refreshToken` | **S1:** record at migration whether a `refreshToken` existed. If not, default the question to "Once half of it is watched" | Yes (changes REL-CON-06) |
| U2 | **Overstated copy.** "Kept from 1.4.5 … Adds to {N} playlists you chose in 1.x" is untrue for the same group | Same | **S1 copy:** "You set these up in 1.x, but 1.x never got access to your account, so nothing has been added yet." | Yes (copy) |
| U3 | **The visibility trap.** The note opens once, in a background tab (REL-CON-01, REL-CON-02). 1.4.5 had no `default_area`, so its button sits in Firefox's Extensions panel, and the fallback "!" may never be seen. A tab closed unread leaves auto-add paused with no visible sign | Upgraders who never pinned the button | **S2:** (a) if the note was never *visible* (Page Visibility API), reopen it once at the next browser start, still in the background; (c) add "Pin Playlist Pigeon to your toolbar to see when it needs you". Option (b), an active tab at browser start, is more intrusive [inference]. Add a check of whether Firefox shows an unpinned extension's badge (UNVERIFIED) | Yes |
| U4 | **An unknown name in the tab.** The tab title "Playlist Pigeon 2.0" can read as an unrelated add-on or adware to someone who forgot 1.4.5 [inference] | All upgraders | **S3:** title the tab "YouTube Playlist Tools is now Playlist Pigeon" | Yes (copy) |
| U5 | **Firefox below 140 stays on 1.4.5** (PAR-CAP-65) | An unknown share | Say so on the legacy setup page and the AMO listing | No (copy outside the product) |
| U6 | **Seeking to the end no longer adds** | Users with a working setup | Already covered: the note says "Skipping ahead and ads don't count", and the shortcut and watch-page button handle explicit adds | None |
| U7 | **Playlists owned by another Google account are dropped** (REL-MIG-36); collaborative playlists may be too (UNVERIFIED) | Users whose credentials belonged to a different account | Already covered: the note counts what was dropped (PAR-CAP-71) and offers Switch account (REL-CON-10) | None |
| U8 | **Session routes break when YouTube changes** | Everyone | Already covered: never silent (PAR-DEF-42). Some users prefer independence: "it takes the power out of youtube's hands" (AMO, 2026-05-27) | None |

Sources: [UF §1.8–1.9]; REL §3.

### 4.4 The live-listing problem

**What a new 1.4.5 user finds today:**
- AMO's summary is "Add current YouTube video to specified playlists." Its category is "other", and it has no icon and no privacy policy [UF §1.1].
- The description says to follow the GitHub README. Since 2026-09-28 the README describes the unreleased 1.5.0: "Sign in with Google" through a broker that was never deployed, and "Settings → Advanced", which 1.4.5 doesn't have [UF §1.6].
- Before that, the README never named the YouTube Data API v3 or the redirect URI, and left out test users and the 7-day expiry [UF §1.6].
- So anyone installing from AMO in the last three weeks follows instructions for a different UI.

**Fix (S4), with no new version needed:**
1. **Finish `docs/legacy/1.4.5-setup.md`** (being added). From [UF §1.6], it should cover:
   - enabling the **YouTube Data API v3**;
   - the consent screen as "External", with yourself added as a **test user**;
   - an OAuth client of type "Web application", with the redirect URI the options page shows (`http://127.0.0.1/mozoauth2/<hash>`);
   - the **7-day expiry** in Testing;
   - re-authorising, which needs "Clear Storage" and wipes the playlist IDs;
   - playlist IDs copied from the URL;
   - that Watch Later isn't supported in 1.4.5;
   - "If a toast says Added but nothing changed, the authorisation has probably expired" [inference from UF §1.5–1.6];
   - that 2.0, coming soon, needs no credentials and Firefox 140 or later.
2. **Edit the AMO description now** to link that page at a stable URL instead of the README, and say "2.0, coming soon, needs no credentials" [UF §1.9 S4].
3. **During the beta,** add REL-STORE-05's "A rebuilt 2.0 is in beta" line.
4. **At launch,** reply to the 2026-02-07 review and to issue #1, pointing to 2.0 [UF §1.9 S5].

---

## 5. Demand against scope

Demand: **Strong**, **Some**, **None** (none found). Recommendation: **Lead** (in the summary and first lines), **Keep** (in the description), **Keep quietly** (in Settings, not the listing), **Phase?** (consider moving after 2.0). **Every Phase? and every new capability needs the user's go-ahead.**

### 5.1 YouTube

| Feature | Spec | Demand | Evidence | Recommendation |
|---|---|---|---|---|
| Quick-save on thumbnails (pinned playlist, ▾ picker) | PAR-NEW-02 | Strong | The March 2026 removal and the restorers that followed; "other playlist" requests; ImprovedTube #1304, #2009 [UF §2.3d; YT §3.12] | **Lead** |
| Picker: stays open, several playlists, membership, search, Sort A–Z, New playlist | PAR-NEW-03, PAR-NEW-40 | Strong, timely | Reddit 2025-10-17; ImprovedTube #3329; save-dialog search scripts [UF §2.3e] | **Lead,** inside the quick-save line. It matches Wrangler, so it's no standalone claim |
| Watch Later as a target | PAR-NEW-01 | Strong | The Data API never allowed it; Stack Overflow since 2013 [UF §2.3c] | **Lead as words** ("Watch Later or any playlist"), not as the pitch |
| Playlist shortcuts (20, labelled) | PAR-NEW-05 | Some | AMO review 2024-07-07; Watch Later Shortcut's 1,000 CWS and 164 AMO users [UF §2.3b] | **Lead** (unique) |
| Auto-add by time actually played, % per playlist | PAR-CAP-01–17, PAR-NEW-19, PAR-NEW-20 | None in public; core for upgraders | [UF §2.3a] | **Lead,** as the second clause: unique, and it's the upgraders' feature |
| Watch-page button | PAR-NEW-21 | Some | Two 2★ reviews asking for a button on the video page [UF §2.3b] | **Keep** (it answers "I keep forgetting the shortcut") |
| Queue button on thumbnails | PAR-CAP-33–37 | Some to strong, but volatile | The March 2026 removal; "Hover + Q" (70 installs) [UF §2.3d, §2.7] | **Keep;** mention Undo, don't lead (crowded) |
| Undo on every save and queue add | PAR-NEW-15, PAR-NEW-16 | Some | [UF §2.7] | **Keep** |
| Off by default, zero footprint | PAR-NEW-25 | Indirect | Praise for minimal permissions; "I have too many extensions" [UF §1.8] | **Keep;** one phrase in the summary |
| Breakage status (never silent) | PAR-NEW-22 | Indirect | Silent-breakage reviews [YT §5.5] | **Keep;** one line in "How it works" |
| No Google sign-in | ADR-0001 | Strong, for upgraders | The 1★ review; issue #1 [UF §2.7] | **Keep** in the upgrade note, release notes and "How it works"; not in the lead |
| Channel filters | PAR-CAP-18–25 | None | Only the developer's own 2024 "Planned" line [UF §2.7] | **Keep quietly** (the 1.5.0 parity rule) |
| Right-click for the video menu | PAR-CAP-38–39 | None | [UF §2.7] | **Keep quietly** (parity rule) |
| Creating playlists | PAR-NEW-08 | None separately | YouTube's dialog already has it [UF §2.7; YT §6.5] | **Keep quietly** |
| A setup per YouTube account | PAR-NEW-04 | None (not searched deeply) | Wrangler has multi-account [YT §3.1] | **Keep quietly.** It's structural: ADR-0003 and the account guard (PAR-CAP-58) |
| Auto-add on Shorts | PAR-NEW-07 | None for auto-add | Saving Shorts to queue or Watch Later *is* asked for (ImprovedTube #2460) [UF §2.7] | **Keep quietly; Phase?** It's the first candidate, and it also waits on live check L9 |
| Settings sync | PAR-NEW-06 | None | A complaint about PocketTube's paywalled backups (weak) [YT §3.2] | **Keep quietly; Phase?** It's the second candidate |

Channel filters, the card menu and the queue button never reached a user (1.5.0 didn't ship), so phasing them would need the user to relax the parity rule [YT §3.16; REL §1; spec "Scope"]. This report doesn't recommend it.

### 5.2 YouTube Music

| Feature | Spec | Demand | Evidence | Recommendation |
|---|---|---|---|---|
| Play next and Add to queue in the page (rows, cards, album headers) | PAR-NEW-10 | Some, steady | [YM §7] | **Lead** (the YouTube Music clause) |
| Quick-action keys for the pointed-at song | PAR-NEW-11 | Some | P-key userscripts (274 and 18 installs); BetterYTM #166 [YM §4, §7] | **Keep;** name it (unique) |
| Save to playlist (split button and picker) | PAR-NEW-10 | Some | BetterYTM #166, #184, #197; Pear #2820, #4753, PR #4748; Reddit 2023-07-24, 2026-08-24 [YM §7] | **Keep;** name it |
| Remove from queue | PAR-NEW-10 | Some | Pear #1083; BetterYTM already has it [YM §4, §7] | **Keep** |
| Playlist shortcuts also on YouTube Music | PAR-NEW-12 | Some | BetterYTM #166 [YM §7] | **Keep** |
| Installed app window | PAR-NEW-13 | Some, indirect | Users build a "desktop app" from the PWA plus extensions (2024-09-23) [YM §7–8] | **Keep;** claim it only after live check M4 |
| Like on rows | PAR-NEW-10 | Native already | YouTube Music shows Like on hover [YM §2] | **Keep quietly** |
| Queue moves | PAR-NEW-17 | Native drag exists | [YM §10] | **Keep quietly** |
| Playing now row in the popup | PAR-NEW-09 | Indirect (the "control from anywhere" gap) | [YM §11] | **Keep quietly** |

---

## 6. Implications

### 6.1 The name (ticket 22)

- **The market supports renaming.** Three listings already use "YouTube Playlist Tools" [YT §1.10].
- **The name earns little reach.** Even the old, keyword-rich name ranks 16th for "youtube playlist", 11th for "add to playlist", 24th for "save to playlist", and not at all for "watch later" [UF §1.8]. The summary does the finding.
- **Keep "Playlist" first, and don't stuff keywords into the name.** Chrome's spam FAQ limits keyword repetition and warns against irrelevant metadata [UF §2.6].
- **"YouTube Music" stays out of the name** (T22 §2), so the summary must carry "YouTube Music", "Play next" and "Add to queue". Store ranking is opaque, so this is UNVERIFIED [YM §10]. Both drafted summaries do.
- **Nothing in the market data favours Courier over Pigeon.** Pigeon is clean on every store [T22]. Recommendation: confirm **Playlist Pigeon for YouTube™**.
- **The rename touches the upgrade note:** use S3's tab title (§4.3 U4).

### 6.2 The listing (spec 08 §9)

| Field | Now | Recommended | Why |
|---|---|---|---|
| AMO summary (REL §9.1) | "Files the YouTube videos you watch into your own playlists…" (181) | The AMO draft in the Answer (246) | The current draft has none of "Save", "Watch Later" or "shortcut" [UF §2.6], and it leads with the weakest-demand feature |
| Chrome `description` (REL §9.1; T22 §5) | Same idea (121) | The Chrome draft in the Answer (132; 130 fallback) | Same reason |
| Description opening (REL §9.2) | "Playlist Pigeon files what you watch into your own YouTube playlists…" | Open with the pain in users' words, e.g. "YouTube's Save takes three clicks and closes after every playlist." [UF §2.6]. **First check that desktop still closes the dialog after each pick:** that's unverified [UF, Open points] | Lead with differentiator 1 |
| Bullet order (REL §9.2) | Auto-add, shortcuts, quick-save, queue, watch-page, card menu | Quick-save (Watch Later or any playlist) → shortcuts → auto-add → watch-page button → queue button (with Undo) → card menu. YouTube Music: "Play next and Add to queue right on songs, albums and playlists", then keys for the song you point at | Follows §5's ranking [inference] |
| Wording | Mixed | "Save" as the verb throughout; "Watch Later" two or three times; no "only" or "first" claims | [UF §2.6]; §3's wording risk |
| "No Google sign-in" | In "How it works" | Keep it there, and in the release notes and upgrade note | Not a market differentiator [YT §6.1] |
| Screenshots (REL §9.4) | 1 Settings, 2 auto-add, 3 thumbnails and picker, 4 YouTube Music, 5 shortcuts | 1 thumbnails and picker ("Save to any playlist in one click."), 2 shortcuts, 3 YouTube Music, 4 auto-add, 5 Settings ("Everything starts off.") | Follows §5's ranking [inference] |
| Trademark | — | Check that "Watch Later" as a feature name needs no attribution line (UNVERIFIED) | [UF §2.6] |

### 6.3 Open decisions (`for-the-user.md`)

D-numbers follow the order of `for-the-user.md`'s "Decisions only the user makes" list. D10 is the toolbar tick, as R11 uses it.

| D | Item | Market evidence | Recommendation |
|---|---|---|---|
| D1 | Name (ticket 22) | §6.1 | **Confirm Playlist Pigeon** |
| D2 | Unticking in the picker removes (PAR-NEW-31) | For: YouTube's Save dialog and Wrangler both remove on untick. Against: "I keep accidentally removing videos from my playlists" (Reddit) [YT §3.1, §6.3; UF §2.3e] | **Approve,** if the removal's toast carries Undo, as adds' toasts do (PAR-NEW-15) |
| D3 | More YTM quick actions (PAR-NEW-32) | Only Save to library has a signal: Pear #2870, "add songs to the library with a single click" (+1). None found for Start mix or Go to artist / album [YM §7] | **Leave out of 2.0;** Save to library is the first candidate after it |
| D4 | Recent adds (PAR-NEW-33) | None found | **Leave out.** For the Logger, the auto-add playlist already is the record [inference] |
| D5 | Live streams counting (PAR-NEW-34) | None found | **Leave out** |
| D6 | Keys from any tab (PAR-NEW-35) | The one pending item with voiced demand: global keys asked for in reviews (YouTube Music Player 2025-11-02; lidel 2022-09-02, 2023-11-02; "a global hotkey that opens the tab", 2026-08-13). Companion, the AMO mini player, lidel, Pear and ytmdesktop all offer browser-wide or global keys [YM §3.2, §5.1]. YM §11 calls it the cheapest opt-in way to narrow the "control from anywhere" gap | **Approve,** as browser commands with no default key, alongside ADR-0004's in-page keys. 2.0.0 or 2.x: the user's call |
| D7 | Where problem reports go | No market signal. The only user issue waited 20 days for a reply, and the 1★ reviewer couldn't find the repo link [UF §1.3, §1.5]; neither shows that e-mail would help | No recommendation from this data |
| D8 | Export and import (PAR-NEW-36) | None found (a PocketTube backup complaint is weak) [YT §3.2] | **Leave out** |
| D9 | "Save to ▸" in the right-click menu (PAR-NEW-37) | None found | **Leave out** |
| D10 | Toolbar tick, "paused" on the icon (PAR-NEW-38) | None found | **Leave off** |
| D11 | Narrow Quick picks rows | No market signal | No recommendation from this data |
| D12 | Translation (PAR-NEW-39) | No signal in the sources. Non-English listings may have been missed [YM §12] | No recommendation from this data |

### 6.4 Release order (spec 08 §8)

- **Keep Firefox first.** Every upgrader is on Firefox, and the upgrade risks (§4.3) are there [REL §1, §8.1].
- **Before the beta:**
  - fix the live AMO listing now (S4, §4.4);
  - put S1–S3 into the spec, so the beta, which exists to see the migration on real 1.4.5 data, tests them [REL §8.1].
- **Chrome is where the growth is.** Comparable tools are far bigger there, even allowing for the different metrics: Wrangler 444 vs 39, YouTube Watch Later 1,000 vs 406, Companion ~1,000 vs 87, Watch Later Tidy 6,000 vs 65 [YT §3; YM §3.1].
- **A Chrome listing's first reviews make or break it** [REL §8.1]. So launch Chrome with the differentiator-led listing, and claim only what live checks have confirmed: YouTube Music (M1–M5), queue Undo (T28/T29), the installed app (M4).
- **Keep YouTube Music in 2.0.0.** It's differentiator 2, and Companion is the clock (§3).
- **Competitor pace:** Wrangler and Companion ship weekly, and Chrome review can take weeks [REL §8.3]. The beta's hand-made Unlisted Chrome item (REL-CHK-02) already takes the first review off the launch path. No change needed.

---

## 7. Method and gaps

- **Inputs:** the three reports in [`market/`](market/), copied unchanged, and the spec (`spec.md`, chapters 08 §1, §3, §8–9 and 09), ticket 22 and `for-the-user.md`. No new research was done for this synthesis.
- **Gaps carried over from the sources:**
  - Reddit was mostly unreadable, and its scores are archive snapshots [UF, Method; YM, How to read this].
  - CWS reviews: first page only. Edge reviews weren't retrieved [YT §7].
  - No competitor was installed and tested; features come from listings and reviews [YT, header].
  - Store ranking is opaque [YM §10].
  - Google's YouTube Music Help Community couldn't be read [YM §12].
  - Unchecked live: whether desktop's Save dialog still closes after each pick, and whether Firefox shows an unpinned extension's badge [UF, Open points].
- **Snapshot:** store figures are from 2026-10-19. Wrangler, PocketTube, Multiselect, Watch Later Tidy and Companion update weekly [YT §7; YM §3.1].
