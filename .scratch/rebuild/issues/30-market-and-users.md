# What sets 2.0 apart, and who is it for?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

The spec was written without a market check. Before building, find out:
- **The landscape:** which extensions already save, queue or auto-add YouTube videos, and which add one-click actions to YouTube Music. For each, cover its features, users and ratings, pricing, approach (Data API or session), MV3 status, last update, and what its reviews complain about.
- **Differentiation:** where 2.0 is genuinely different. What's its unique selling point, and how should it be positioned on the stores?
- **Existing-user fit:**
  - what 1.4.5's users and reviews want;
  - where else demand shows up (forums, Reddit, support threads);
  - whether the 2.0 scope serves them, or risks losing them, for example because of the changed "watched" semantics or the rename.

Feeds: [ticket 22](22-name.md)'s naming, the store listings (spec chapter 08 §9), and possible scope adjustments. Scope changes need the user's go-ahead.

## Answer

Full report, with the three cited source reports in `docs/research/market/`: [`docs/research/market-differentiation.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/market-differentiation/docs/research/market-differentiation.md) on branch `research/market-differentiation`.

- **USP:** saves the video or song you're looking at to the right playlist, Watch Later or any other, in one click or one named key. It auto-files the videos you actually watch, and puts Play next and Add to queue right on YouTube Music's songs, all with Undo and all off until switched on.
- **Differentiators, strongest first:**
  1. **Any playlist in one action:** a pinned quick-save plus up to 20 named keys. Every one-click rival is Watch-Later-only. Strong voiced demand.
  2. **YouTube Music one-click in the page:** no extension, userscript or desktop client does it. Steady, small demand.
  3. **Auto-add what you actually watched:** unique, though with little public demand. It's why 1.4.5's users came.
  4. **Undo on every save and queue add:** unique on both sites.
  5. **Off until chosen, and never silent.**
- **Not differentiators, so the listing mustn't lead with them:**
  - "no sign-in / uses your session" (ten or more rivals say it);
  - one-click Watch Later buttons (Improve YouTube, 400k users);
  - queue buttons;
  - membership ticks, creating playlists, no duplicates;
  - account setups and sync (no demand found).
- **Threats:**
  - the YouTube Music "Companion" extension could add in-page buttons;
  - Playlist Wrangler (a + picker with ticks, about 500 users);
  - Improve YouTube's Watch Later.
- **Existing users:**
  - 66 daily users, most of whom probably never got 1.4.5 working;
  - what they asked for (no credentials, labelled shortcuts, "update it") is what 2.0 does;
  - the rename, opt-in defaults and the new "watched" meaning are low risk.
- **Upgrade risks, with fixes S1–S3 pending the user:**
  - never-authorised upgraders get the 0 % default;
  - the badge is invisible when unpinned;
  - the tab title should carry the old name.
- **The live listing is broken now (S4):** AMO points to a README that no longer describes 1.4.5. Fix: `docs/legacy/1.4.5-setup.md` plus an AMO description edit.
- **Positioning and store summaries:** drafted in users' own words (Save, Watch Later, any playlist, one click, shortcut, Add to queue), with AMO at 246 and Chrome at 132 characters.
- **Scope:** keep the approved scope. If room is needed, move auto-add on Shorts first, then settings sync, to 2.x. Never move YouTube Music or the save features.
