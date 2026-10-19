# How do we find out when YouTube breaks us?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 04, 10

## Question

2.0 leans on YouTube internals that can change without notice. Decide how breakage gets caught and handled:
- **Recorded tests:** tests against recorded YouTube responses at the gateway seam.
- **Live check:** an on-demand check against real YouTube.
- **User-facing failures:** what the user sees when a request fails or a response changes shape, instead of a silent failure.
- **Diagnostics:** what's possible without telemetry, given `data_collection_permissions: none`.
- **Fix speed:** how fast a fix can reach users through AMO and Chrome Web Store review.

Use `codebase-design` for the seam.

Also from [ticket 05](05-ui-stacks.md): YouTube's `--yt-sys-color-baseline--*` theme variables are undocumented and belong on the breakage watch list, along with any real-browser checks.

Also from [ticket 04](04-bun-test.md): `bun test` can't reach real browsers, real YouTube or the built output (CSS, `injectScript`). Live and in-browser checks need a different tool.

Also include: YouTube Music's internals ([ticket 21](21-youtube-music-internals.md)) belong on the same breakage watch list.

Also from [ticket 21](21-youtube-music-internals.md): the queue path depends on `ytmusic-app.networkManager`, `/music/get_queue` and `app.queue` internals. YouTube Music's new-player A/B test (since 2026-09-29) already broke several YouTube Music tools.

Also from [ticket 01](01-youtube-requests.md): `docs/research/youtube-requests/bundle-check.mjs` (branch `research/youtube-requests`) checks that the live YouTube client still has what 2.0 relies on, and can seed the breakage check. The add-to-playlist response is the piece most likely to change.

Also from [ticket 11](11-accounts.md): if `ytcfg`'s identity keys disappear, account-dependent features stop rather than act on an unknown account. Add `DATASYNC_ID` and `LOGGED_IN` to the bundle check.

Also from [ticket 26](26-youtube-music-quick-actions.md):
- An action whose internals are missing hides its button and key in that tab, with one notice rather than a toast per click.
- Add to the watch list: both like-button anchors (classic bar and Wiz miniplayer), `ytmusic-player-queue-item`, and the header button area.

Also from [ticket 10](10-youtube-access.md):
- **Two outcomes:** "route unavailable" falls back to the next route and records a breakage signal; "job failed" is reported with no retry. Writes are never retried if they may have been sent.
- **Watch list:**
  - `ytd-app.resolveCommand` with `commandController`;
  - `yt-service-request` / `-completed`;
  - the `ytcfg` keys and the three-part auth hash;
  - both shapes of the add-to-playlist response;
  - the miniplayer's queue data;
  - `ytmusic-app`'s handlers, network layer, `app.queue`, `ADD_ITEMS` and the menu-item behaviour property;
  - the cast state.

  Extend `bundle-check.mjs` to cover them.

Also from [ticket 28](28-queue-reorder.md): add the queue panel's `ytmusic-reorderable-list-drop` event and its private contents to the watch list. The move is fire-and-forget, so confirm the item's position afterwards.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up and why it lost. Folds in every "Also from" note above, plus the Answers of tickets [07](07-watched.md) (player watch list, "can't measure"), [08](08-shortcuts.md) (card recognition must check itself), [12](12-adding.md) (unrecognised answers, console log, error fixtures, failures always shown) and [28](28-queue-reorder.md) (the reorder event; confirm the move). Which route wins each job stays PROVISIONAL until [ticket 25](25-live-checks.md), as in ticket 10; nothing here depends on it. Numbers marked *(starting value)* are tuned after ticket 25 and the first weeks of use.

**In short:**
- **Three checks run before users notice anything:**
  - recorded YouTube answers in `bun test` on every change;
  - a daily signed-out watch in CI (bundle markers, signed-out answers read by the product's own parsers, and a headless browser running the built extension);
  - a signed-in live check the developer runs in their own Chrome and Firefox before every release.

  No Google account ever runs in CI.
- **At runtime:**
  - A missing route or an unrecognised answer becomes a local **breakage signal**.
  - A feature that loses a job it needs is **not working**. It says so in the page once per browser session, shows an amber "!" badge on the tab, and shows a status line in the popup and settings.
  - Nothing fails silently, and nothing leaves the browser.
- **Diagnostics without telemetry:** the console log, plus a **diagnostics report** the user sees in full and copies only if they choose. It names no video, playlist, channel or account. **Check now** runs a read-only check on demand.
- **Fixes ship only as releases:** no remote config, selector lists or kill switch, so every fallback ships in the package.
  - A hotfix lane keeps fixes small and never changes permissions or disclosures.
  - Expect about 1–2 days on Firefox. On Chrome, review usually takes a few days.
  - A bad release is rolled back in the store dashboards.

### 1. The seam (shaped for ticket 17)

There are two seams, and each has at least two adapters:

| Seam | Interface | Adapters |
|---|---|---|
| **Gateway** (used by features, the add flow and the background) | `run(job) → JobResult`, which never throws, and `probe()`, which reports which watch-list items are present. Breakage signals go out through an injected sink. | **Bridge** (production): to the page-world gateway. **In-process** (tests): a gateway over the recorded page. **Scripted fake:** for feature tests. |
| **YouTube page** (used only by the gateway) | One operation per route kind from ticket 10: `config(key)`, `command(cmd, el?)`, `serviceRequest(endpoint)`, `request(path, body, {signed})`, `music.*` (handlers, `networkManager.fetch`, queue, menu item, reorder), `read(what)`, `has(watchId)` | **Live** (production): `window`. **Recorded** (`bun test`): replays recorded answers, with small in-memory fakes for state such as YouTube Music's queue. **Node** (CI): plain signed-out requests only, for the static watch. **Recording** (live-check build only): wraps the live adapter and captures answers. |

- **Above the page seam, tested with recorded answers:** all the logic that could otherwise fail quietly. That's:
  - the route order and fallbacks;
  - "writes never run twice";
  - the account guard;
  - the parsers for every known shape;
  - ticket 12's failure mapping;
  - success checks by effect (YouTube Music queue growth, ticket 28's position check);
  - which breakage signals are raised.
- **The live page adapter has no logic:** one call per operation. Only live checks reach it (§4).
- **Signals have one type and come from two places:** the gateway (routes, answers, page reads) and each feature's drawing code (anchors, theme variables). All go to one **breakage monitor** in the background (§5).
- **Each feature declares what it needs:** required jobs, optional jobs and page anchors. The monitor derives every feature's status from those declarations, so no feature carries its own breakage logic.
- **Runner-ups:**
  - *Seam at `fetch` (recorded HTTP exchanges).* It lost because YouTube's own routes need YouTube's code in the page, so it could test only the signed request.
  - *Parsers only (fixture in, value out).* It lost because it misses the fallbacks, writes-never-twice and the account guard, which is the logic most likely to fail quietly.

### 2. Recorded answers (`bun test`)

- **A fixture** is one JSON file per job and variant, e.g. `membership/view-model.json` or `add/missing-playlist.json`.
  - **Contents:** the job, route and site; the raw answer (HTTP status and body, or the page-read value); YouTube's client version; `capturedAt`; and `lastConfirmed`.
  - **Provenance**, one of:
    - **captured:** recorded live, then redacted;
    - **derived:** a capture with a documented edit, e.g. a different `datasyncId` for the account guard, or renamed keys for "unrecognised";
    - **synthetic:** hand-written from cited evidence where capturing it would mean crawling, such as a full playlist or an HTTP 429. It's replaced once a real one is captured.
- **The minimum set before 2.0 ships** covers every job in ticket 10's tables:
  - **Membership:** both shapes (renderer and view model), Watch Later, privacy values, paging if L5 finds it, and signed out (401). YouTube Music's answer with and without membership.
  - **Playlist list:** lockups, an empty account, and signed out.
  - **Add** (including ticket 12's error replies): added (with `setVideoId`), duplicate (www per L6, and YouTube Music's rejection), missing playlist, full playlist, made for kids, signed out (`STATUS_FAILED` with the sign-in popup), rate-limited (429), an account that can't use playlists, account mismatch, and unrecognised.
  - **Undo:** removed, and already gone.
  - **Create:** created, 429, the public daily cap, no channel, YouTube Music's gated answer, and a refused title.
  - **Account label:** own account, brand account, no channel, and signed out.
  - **Typed channel:** each input form, a redirect hop, a 404, and a terminated channel.
  - **Player and video reads** (ticket 07): navigation details (watch and Shorts); player responses for an ordinary video, a live stream, a premiere, a waiting room, post-live, a replay, a clip (`clipConfig`), a made-for-kids video (`PLAYBACK_MODE_PAUSED_ONLY`) and a Shorts ad (`adClientParams.isAd`). Also `next`, `reel_item_watch`, and a collaboration video.
  - **Queue:**
    - On YouTube: the miniplayer's queue data before and after an add.
    - On YouTube Music: `get_queue` answers (song, album, playlist) and `app.queue` snapshots, including before and after a move (ticket 28).
    - Row `data` for every item type: song row, card, queue item, and a signed-out row.
  - **Markup snippets** for the anchors: cards, both like-button anchors, queue items, and album and playlist headers. These feed happy-dom tests of where controls go. Positions and styles need the browser watch.
- **Parsers** read only the fields they need and accept every shape in the fixtures. Anything else counts as unrecognised. They never guess: a missing `status` doesn't mean success.
- **Redaction** happens when a capture is imported, before anything is committed.
  - **IDs:** playlist, entry, channel and account IDs map to stable fake IDs (`PLfixture0001`, …), so cross-references still hold.
  - **Text and tokens:** titles, names, handles, avatar URLs, visitor data and tracking params are replaced or stripped.
  - **Never captured:** cookies and request headers.
- **A privacy lint test** fails the suite if any fixture contains a cookie name, an `Authorization` value, an e-mail address, an avatar host, a `datasyncId`-shaped value, or an ID outside the fixture allowlist.
- **Refreshing:**
  - **Each signed-in live check (§4) recaptures every job.** The import compares **shape outlines** (keys and types, never values) with the existing fixtures.
    - Same shape: only `lastConfirmed` moves.
    - New shape: it's added as a new variant, and its parser test fails until the parser handles it.
  - **Old shapes stay,** because YouTube's A/B tests serve several at once. A shape is dropped only on purpose, together with the parser change.
  - **Triggers:** before every release, a red watch, and a user report showing an unrecognised shape.
  - **Warnings, not failures:** the test run warns about fixtures not confirmed in the last 90 days *(starting value)* and lists the synthetic ones.
- **Runner-up:** fixtures captured only by the CI watch. It lost because signed-out requests see only public jobs and 401s, not membership, adds or create.

### 3. The watch list

One list names everything in YouTube and YouTube Music that 2.0 relies on.
- **Each entry has:** an ID, the site, the jobs and features that depend on it, a static check, and a runtime probe where one is possible.
- **Static checks** are needles in the page HTML, the app bundle, the player script or the CSS. They live only in the tools and never ship.
- **Runtime probes** ship in the gateway and the features.

| Area | Entries |
|---|---|
| **Both sites** | `ytcfg`: `LOGGED_IN` and `DATASYNC_ID` (ticket 11), the client name and version, visitor data, `SESSION_INDEX`, `DELEGATED_SESSION_ID`, `USER_SESSION_ID`, and `WEB_PLAYER_CONTEXT_CONFIGS` |
| **YouTube requests** | `ytd-app.resolveCommand` with `commandController` (`onSuccess` / `onServerError`). `yt-service-request` and `-completed`. Every job's request path. The three-part auth hash: `SAPISIDHASH`, `SAPISID1PHASH`, `SAPISID3PHASH`, the `_u` part, `X-Goog-AuthUser`, and `X-Goog-PageId` / `onBehalfOfUser`. Both `get_add_to_playlist` shapes (`playlistAddToOptionRenderer` with `containsSelectedVideos`, and `toggleableListItemViewModel` with `saveToPlaylistListEntity`). The `FEplaylist_aggregation` lockups. `edit_playlist` results (`STATUS_*`, `setVideoId`). `createPlaylistServiceEndpoint`. `addToPlaylistCommand` with `PLAYLIST_EDIT_LIST_TYPE_QUEUE`. The miniplayer's queue data. |
| **YouTube player** (ticket 07) | Player ids `movie_player` and `shorts-player`. Methods `getVideoData`, `getCurrentTime`, `getDuration`, `getPresentingPlayerType`, `getPlayerResponse`. Player events `onAdStart`, `onAdEnd`, `onVideoDataChange`. Page events `yt-player-updated` and `yt-navigate-finish`. Markers: `ad-showing`, the `videoDetails` live flags (`isLive`, `isLiveContent`, `isUpcoming`, `isPostLiveDvr`), `clipConfig`, `adClientParams.isAd`, and `PLAYBACK_MODE_PAUSED_ONLY`. |
| **YouTube page** | Card and thumbnail elements, from ticket 14's item selectors, which check themselves (§5.1, ticket 08); the card's ⋮ button; the `--yt-sys-color-baseline--*` theme variables (ticket 05) |
| **YouTube Music** | `ytmusic-app`'s `handleServiceEndpoint`, `handleNavigationEndpoint`, `handlePlaylistEditEndpoint` and `handleCommandWithCommandHandler`. `networkManager.fetch`. `app.queue` (`getItems`, `getCurrentItemIndex`, `removeItem`, `isEmpty`, `store`), `ADD_ITEMS`, `SET_QUEUE_CONTEXT_PARAMS` and `/music/get_queue`. The menu item's behaviour property (`ytmusicServiceMenuItemBehavior`) on `ytmusic-menu-service-item-renderer`. `queueAddEndpoint` with both insert positions, `removeFromQueueEndpoint` and `likeEndpoint`. The queue panel's `ytmusic-reorderable-list-drop` event and its contents (ticket 28). Row elements and their `data`, and `ytmusic-player-queue-item`. Both like-button anchors (classic bar and Wiz miniplayer) and the header button area (ticket 26). `navigator.mediaSession` and `#movie_player.getVideoData()`. The cast state (ticket 25's M5). |

- **Needles must survive minification.** They match only string literals and string-keyed names, using patterns where YouTube's minified names sit beside them. For example, today's `X.excludeWatchLater=!1` and `_.ne("USER_SESSION_ID")` needles become patterns.
- **Experiment flags are reported, never failed:** `music_web_enable_wiz_miniplayer` (the new YouTube Music player) and `pageid_as_header_web` (how brand accounts are addressed). A change in their signed-out values is an early sign of a rollout.
- **Keeping the list complete:**
  - Code that comes to rely on a new internal adds its entry in the same change. Review checks this.
  - Ticket 25's results add or remove entries; the cast state is one example.

### 4. Live checks

| Check | Runs | Signed in? | Catches |
|---|---|---|---|
| **Recorded answers** | `bun test`, on every push and PR | No network | Regressions in logic and parsers, against every known shape and error |
| **Static watch** | CI: daily, on demand, and as a release gate | No | **Markup and bundles:** watch-list needles in the www and music HTML, app bundles, player scripts and CSS. They're fetched with both a Chrome and a Firefox user agent, because YouTube serves different builds. Also the `ytcfg` keys, the player ids and the experiment flags. **Public jobs:** `resolve_url`, channel `browse`, `next`, `reel_item_watch`, YouTube Music `get_queue`, and the player responses of fixed public videos (ordinary, live, made for kids). They're sent signed out through the **product's own gateway** over the node adapter. **Signed-in endpoints:** their signed-out answers, which the gateway must still read as "signed out". |
| **Browser watch** | CI: daily and on demand | No | **Runtime:** the built extension in a real browser on live YouTube and YouTube Music. It checks the runtime probes, the navigation and player events, page reads, and anchors on home, search and watch pages. **Visuals:** theme variables and our controls' styles and positions (ticket 05). **End to end, signed out:** Add to queue on YouTube; Play next and Add to queue on YouTube Music, confirmed by the queue growing. **Build-only:** what `bun test` can't reach (ticket 04), such as registration and injected CSS. |
| **Signed-in live check** | The developer's own Chrome and Firefox, from a dev-only build: before every release, when a watch goes red, and on a user report | Yes, the developer's | **Routes:** every job through every shipped route, each forced in turn, which fills ticket 10's route table. **Quietness:** it watches YouTube's popup and toast containers during each call. **Writes:** on a private scratch playlist it creates once, using a fixed public video and song; it restores likes and removes queue items afterwards. **Induced errors:** duplicate, made for kids, a deleted playlist. **Ticket 07's player checks.** It also captures fixtures. |
| **Check now** | The user's browser, from Diagnostics | Yes, the user's own | Read-only: the runtime probes plus one read per read job, in a serving tab. Feeds the diagnostics report (§6). |

- **The static watch is `bundle-check.mjs` grown up.**
  - It reads the watch list, adds YouTube Music and the player script, and maps each miss to the features it breaks, e.g. "missing `ytd-app.resolveCommand` → add and undo fall back to the service request".
  - It returns an exit code and writes a JSON artifact.
- **Alerting:**
  - **Red watch:** CI opens or updates one GitHub issue labelled `youtube-change`, listing the misses and the affected features. It closes the issue when the watch is green again. This is the developer's alarm.
  - **Merges vs releases:** a red watch never blocks merges, because a YouTube change isn't the PR's fault. It does block a release tag, unless that release is the fix.
- **Bot walls and consent pages** on CI's datacenter IPs make a run **inconclusive**, not red. They mostly hit player requests; page HTML and bundles are rarely affected. Three inconclusive days in a row also open the issue.
- **Browser tooling** is ticket 17's pick.
  - **Chromium:** Playwright loads extensions only with `channel: "chromium"`, headless included. Branded Chrome dropped `--load-extension` in 137.
  - **Firefox:** Playwright can't load extensions. Puppeteer 24.8+ can, through WebDriver BiDi (`installExtension`, Firefox 137+), and so can Selenium's `install_addon`.
- **The live-check build is a separate build target.** It adds a live-check page and the recording adapter. The release check fails if either store zip contains any part of it.
- **Ticket 25's probe extension** should become the first version of the live-check build, so its checks keep running after 2.0 instead of being thrown away.
- **Keeping the watch alive:** GitHub turns off scheduled workflows in a public repo after 60 days without activity. The release checklist includes confirming the watch is still running.
- **No Google account in CI.**
  - *Runner-up:* a test account's session cookies in CI secrets, so the signed-in check runs nightly.
  - It lost for four reasons:
    - Google flags automated sign-ins;
    - session cookies rotate;
    - a stored session is a live credential to guard;
    - a bot acting on YouTube is the "automated means" that 2.0 otherwise avoids by acting only when the user asks.
  - The signed-in check takes a few minutes in the developer's own browsers.

### 5. Breakage signals and what the user sees

**5.1 What counts as breakage**

| What happened | The job (tickets 10 and 12) | Breakage signal |
|---|---|---|
| A hook is missing, or it throws before sending | Route unavailable: try the next shipped route | Yes: `missing` or `threw`, with the watch-list ID |
| No answer within the budget | Reads: try the next route. A write that may have been sent: failed, or unconfirmed. | Recorded as `timeout`. It makes a job not working only after 3 in a row *(starting value)* on that job, while the tab is online and other requests are answered. |
| HTTP 400 or 404 to our own request, or 401 or 403 while the page is signed in | Job failed | Yes: `rejected`, meaning YouTube no longer accepts the request as we build it |
| An answer with no recognised shape or `status` | Job failed, with ticket 12's "Use YouTube's own Save for now" | Yes: `unrecognised`, with the answer's shape outline |
| A recognised answer whose effect never shows (the YouTube Music queue doesn't grow; a moved item isn't where it should be, ticket 28) | Failed | Yes: `no-effect`, after 2 in a row *(starting value)* |
| A page anchor is missing where the page clearly has that content | The control isn't drawn | Yes: `anchor-missing` (see below) |
| A key press points at something that looks like a video, but no item is recognised there ([ticket 08](08-shortcuts.md)) | Nothing is done. The key never falls back to the current video or playing song. | Yes: `item-unrecognised` (see below) |
| Theme variables missing | In-page UI uses a built-in palette, picked from YouTube's dark-mode attribute | Yes: `cosmetic`, shown in diagnostics only |
| Ticket 07's **can't measure** state (the lengths disagree, e.g. stitched ads) | That playback isn't counted | Yes: `cannot-measure` (see §5.2) |
| Signed out, account changed, 429, 5xx, offline, or a recognised `STATUS_FAILED` | As tickets 10–12 say | No: none of these is breakage |
| A route fell back and the job succeeded | Succeeded | Yes, as `fell back`, shown in diagnostics only |

- **Anchors:** a feature checks its anchors once the page settles, 3 s after navigation *(starting value)*.
  - **It signals only when the page shows that kind of content and none of it was recognised.** For example: at least 6 video links in the main content, but no card recognised.
  - Tickets 14 and 27 tune the numbers.
  - A YouTube Music player-bar anchor that's missing in a narrow window isn't breakage (ticket 26).
- **Card recognition checks itself** (ticket 08). Keys act on the pointed-at item, else on the current video. If YouTube's card markup changes, a key would quietly save the current video, which is the wrong one. Two checks prevent that:
  - **At every key press:** before falling back, a markup-independent test asks whether the pointer, or focus, is on something that looks like a video item.
    - On YouTube, that's a link to `/watch?v=` or `/shorts/`, or an element holding exactly one such link, outside any player. End-screen tiles count as the player's video (ticket 08).
    - On YouTube Music, that's a song row or card whose `data` can't be read.
    - If the test says yes but no item was recognised, the key does nothing, shows the failure toast (§5.4) and raises `item-unrecognised`.
  - **Once the page settles:** the anchor check above also compares the video links in the main content (not the player, description or comments) with the cards recognised. If fewer than half are recognised *(starting value)*, it raises `anchor-missing`, even when some cards still work. That catches a new card type on one page before anyone presses a key.
  - Ticket 14 owns the item selectors and both tests, shared by quick-save, Add to queue, the card menu and shortcuts.
  - *Runner-up:* fall back to the current video when nothing is recognised, as plain ticket 08 would. It lost because that's a silent wrong-video save.
  - *Runner-up:* only the page-settle check. It lost because it can't see a single unrecognised card type, while the key-press test can.
- **A signal carries no user data.**
  - **It holds:** the site, feature, job, route, kind and watch-list ID; a shape outline; YouTube's client version; the page type (watch, Shorts, home, search, YouTube Music browse); and a count with the first and last time seen.
  - **It never holds:** a video, playlist, channel or account ID; a title; a URL; or a setting.
- **A shape outline** records keys and value types to depth 6, merges array items, and keeps no values.
  - Keys that don't look like schema names become `<key>`.
  - It's capped at 2 KB.
- **Where signals live:** the breakage monitor keeps them in `storage.session`, which is memory only and is cleared when the browser closes.
  - Signals from private tabs stay in memory and never reach any storage area (ticket 11's write guard).

**5.2 Feature status**

- **Each feature has a status per site and per tab:** **working**, **partly working** or **not working**. The monitor derives it from what the feature declares (§1).
  - **Not working:** a required job has no route left, or a required anchor is missing. On YouTube Music this can apply to a single action (ticket 26).
  - **Partly working:** only an optional job is out. Examples: the picker's check marks (membership), queue confirmation, account labels, playlist thumbnails, the player-bar Save anchor, auto-add failing to measure some videos, and shortcuts that can't recognise pointed-at cards but still work on the current video.
  - **Card recognition** is required for thumbnail quick-save, the Add to queue button and the card menu, and optional for shortcuts.
- **The whole site:** if the site core can't start (`ytcfg`, `ytd-app` or `ytmusic-app` is missing), every feature on that site is not working.
- **Account keys missing** (`DATASYNC_ID` or `LOGGED_IN`): features that depend on an account stop, rather than act on an unknown one (ticket 11). Those are auto-add, playlist shortcuts, quick-save, and YouTube Music's Save and Like. Add to queue, the card menu and YouTube Music's queue actions carry on.
- **Auto-add's "can't measure"** (ticket 07), so stitched ads never fail silently:
  - **The first such playback in a browser session** shows a failure toast, even with feedback off: Auto-add can't follow this video's progress, so "{title}" won't be added. Later ones are logged to the console only, as in ticket 12's rate limits.
  - **Some playbacks can't be measured:** auto-add is partly working.
  - **3 in a row with none measured in between** *(starting value)*: auto-add is not working, and the notice and badge below apply. It's working again after the next playback that can be measured.
- **Clearing:** a tab's status clears when the job next succeeds, or on reload when the probe passes. There's no manual reset.

**5.3 Where it shows**

| Surface | When | What |
|---|---|---|
| **In-page notice** | Once per browser session per feature and site, at the moment the feature would act: when its buttons would be drawn, when auto-add would arm, or when a key is pressed. It appears in the first visible tab where the problem is found. Several features found at once share one notice. | The site's toast (tickets 14 and 27) with the failure styling. It stays until dismissed, because it describes a lasting state. Like any failure, it waits while the tab is hidden or fullscreen (ticket 12). Its action is **Details**, which opens settings at Diagnostics. |
| **Explicit actions** | Every click or key press on something that's not working | The action's own failure toast (tickets 12 and 26). Ticket 12's unrecognised-answer toast is unchanged. |
| **Toolbar badge** | While any feature is not working in that tab | An amber "!" on that tab only, titled "{Feature} isn't working in this tab". Ticket 10's missing-access badge takes priority. "Partly working" sets no badge. |
| **Popup** | While a feature is not working or partly working | A strip under the header with **Details**. Over a YouTube or YouTube Music tab, it covers that tab. Over any other tab, it covers every open tab of the site. |
| **Settings** | Always | A status line under each affected feature's switch, and the Diagnostics section (§6) |

- **Show feedback hides none of this.** Breakage is a failure, and ticket 12 keeps failures visible. A user who doesn't want the notice switches the feature off.
- **Keys** on either site stay caught while their action is not working, and every press gets the failure toast.
  - This refines ticket 26's "no armed key", because an unarmed key would do nothing at all.
  - Buttons for that action aren't drawn, as ticket 26 says.
- **Runner-ups:**
  - *A banner across YouTube's page:* it changes how YouTube looks, which only the user may choose.
  - *Toasts only:* a toast is gone after 6 s, and hidden buttons would then fail silently.
  - *No badge:* the popup is rarely opened, so a broken feature in a tab the user isn't looking at would go unnoticed.
  - *A notice for every fallback:* it alarms users about something that still works, and that they can do nothing about.
  - *A "works again" toast after an update:* bloat. The status line simply clears.

**5.4 Wording**

Each message is two sentences, uses YouTube's capitalisation, and says "YouTube Music" on that site. {Feature} is the feature's name from tickets 09 and 15.

| Situation | Notice or status |
|---|---|
| Auto-add | Auto-add isn't working right now because YouTube changed something. Videos you watch aren't being added for now. |
| Playlist shortcuts, quick-save | {Feature} isn't working right now because YouTube changed something. Use YouTube's own Save for now. |
| Add to queue button | The Add to queue button isn't working right now because YouTube changed something. Use YouTube's ⋮ menu for now. |
| Right-click card menu | The right-click menu isn't working right now because YouTube changed something. You'll get the browser's menu for now. |
| A YouTube Music action | Play next isn't working right now because YouTube Music changed something. Use its ⋮ menu for now. For several actions: "Play next and Add to queue aren't working…" |
| A key | Play next (Alt+N) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now. |
| A key pointing at an unrecognised item | Couldn't tell which video you're pointing at because YouTube changed something. Move the pointer off it to save the current video. ("song" and "playing song" on YouTube Music) |
| Account keys missing | Saving isn't working right now because YouTube changed how it shows which account you're using. Nothing is saved, so nothing lands in the wrong account. |
| The whole site | {Name} isn't working on YouTube right now because YouTube changed something. An update should fix it. |
| Popup strip | {Feature} isn't working in this tab because YouTube changed something. / 2 features aren't working in this tab. |
| Settings, not working | Not working right now: YouTube changed something it relies on. |
| Settings, partly working | Partly working: {gap}. For example: "it can't show where a video is already saved", "it can't confirm queue adds", "it can't follow some videos' progress". |

### 6. Diagnostics without telemetry

- **Nothing is ever sent:** no error reporting, analytics or crash upload, opt-in or not. Any of these would need a server (ADR-0001) and would end `data_collection_permissions: none` ([ticket 23](23-ask-amo.md)).
- **Console log** (extends ticket 12):
  - **Default lines:**
    - every add logs each playlist's outcome;
    - every fallback and every breakage signal logs one `console.warn` line naming the route, the reason and the watch-list ID.

    The prefix is the extension's name.
  - **Only the isolated world logs.** The page world logs nothing, because YouTube's own code can wrap the page's `console`, and the logs mention settings.
  - **Detailed console log** (in Diagnostics, off by default, this device only) adds a line for every route attempt, with timings.
- **The diagnostics report** is plain text, shown in full in Settings → Diagnostics before the user presses **Copy**.
  - **Contains:**
    - the extension's version and build;
    - the browser, its major version and the OS family;
    - the YouTube and YouTube Music client versions and UI language seen;
    - which features are on, and site access per site;
    - whether the tab is signed in;
    - each feature's status per site;
    - the session's breakage signals, with their shape outlines;
    - the last Check now result.
  - **Never contains:** account IDs, names or handles; video, playlist or channel IDs or titles; URLs; setting values (keys, filters, setups); cookies; the country.
  - *Runner-up:* a "Report on GitHub" link that puts the report in the URL. It lost because opening that URL sends the report to GitHub before the user has decided to submit it.
- **Check now** runs the probes and one read per read job in a serving tab, only when it's clicked. It writes nothing, and it works even if no feature has run this session.
  - *Runner-up:* report only what has already happened. It lost because the report is empty after a reload, and YouTube's A/B tests mean the developer often can't reproduce the user's setup.
- **Links:** **Known problems** opens the public `youtube-change` issues. **Report a problem** opens a blank issue form. Both are plain links and attach nothing. **PROVISIONAL:** they point to GitHub until [ticket 19](19-upgrade-and-rollout.md) settles the support channel.
- **Cost:** the Diagnostics section loads lazily in settings. Nothing of it reaches a YouTube page, except Check now's probe when clicked.

### 7. Fix speed

**What the stores allow** (checked 2026-10-19; ticket 06 for the rest):
- **AMO:**
  - **Updates:** a listed update is signed and public "up to 24 hours" after upload, unless it's picked for manual review. Firefox checks for updates every 24 h (`extensions.update.interval` 86400), so a fix reaches most users 1–2 days after upload.
  - **Rollback (since 2025-09-19):** goes back to the previous approved version under a higher version number. Users get it within 24 h.
  - **No channels:** AMO has no pre-release channel.
- **Chrome Web Store:**
  - **Review:** every update goes through the same review, "within a few days" but possibly "up to a few weeks". There's no expedited review.
  - **Updates:** Chrome checks every 5 h.
  - **Rollback:** goes back to the previous published version with no review, live within a minute. It discards pending submissions.
  - **Partial rollout and `setPublishedDeployPercentage`:** only for items with over 10,000 weekly users, so not at launch.
  - **`skipReview`:** API v2's `skipReview` "attempts" to skip review and errors when review is needed. Which updates qualify is unverified.
- **Neither browser offers a dependable "check for updates now":** Firefox lacks `runtime.requestUpdateCheck()`, and Chrome throttles it to once per 5 h. So the extension shows no update button. Diagnostics shows the version and says updates install by themselves.

**No remote config, ever.**
- The rule: no remote config, selectors, endpoint maps, experiment flags or kill switch, and nothing fetched that changes behaviour.
- Why: there's no server (ADR-0001), ticket 03 forbids it, and AMO rejects remote data that steers logic.
- Consequence: resilience ships in the package. That means ticket 10's fallback routes, parsers for every known shape, alternate anchors, the theme fallback, and honest status when all of these run out.
- *Runner-up:* a static JSON of selectors on GitHub Pages, read at start-up. It's the fastest possible fix, but it lost: AMO forbids remote data that steers control flow, it's a server in all but name, and a request on every start-up leaks usage.

**Release process** (for [ticket 19](19-upgrade-and-rollout.md)):
- **Every release:**
  - the static watch is green;
  - the browser watch is green or inconclusive;
  - the developer has run the signed-in live check in both browsers, and new captures have been imported;
  - the store zips contain nothing from the live-check build.
- **Hotfix lane,** for "YouTube changed something":
  - **Branch** from the last release tag.
  - **Change only** the broken route, parser or anchor, plus its fixtures and watch-list entry. No dependency bumps and no refactors. Chrome reviews "significant code changes" more closely, and AMO's review queue ranks by the size of the code change.
  - **Manifest:** identical to the last release apart from `version`. That means no change to permissions, host patterns, `data_collection_permissions`, minimum versions, disclosures or listing text. Any of those holds Firefox updates behind a prompt or disables the Chrome extension until accepted (ticket 06), and lengthens review. A CI check compares the two manifests.
  - **Gates:**
    - `bun test`;
    - the static watch green with the new needles;
    - the signed-in live check of the affected jobs in both browsers.
  - **Version:** a patch bump.
  - **Submit** to both stores in one run, with per-store switches in place of today's single `PUBLISH_TO_STORES`.
    - **Chrome:** publishes on approval (no deferred publishing for hotfixes). `skipReview` is tried, never relied on.
    - **Reviewer notes** template: "Fixes {feature} after a YouTube change to {internal}. No permission, data or listing changes."
  - **Afterwards:** comment the version on the `youtube-change` issue ("Firefox users get it within about a day; Chrome users after review"), then merge back to main.
- **A release that itself breaks something:** use the store rollbacks first. AMO's reaches users within a day. Chrome's is live in a minute and needs no review. Roll back before submitting the fix, because Chrome's rollback discards pending submissions. Then fix forward.
- **Early warning:** the developer uses the extension daily in their own signed-in browsers. That puts at least one account inside YouTube's live experiments.

### 8. Judgement calls at a glance

| Decision | Chosen | Runner-up, and why it lost |
|---|---|---|
| Test seam | A YouTube page port under the gateway, with live, recorded, node and recording adapters | Recorded HTTP at `fetch`: can't cover YouTube's own routes. Parsers only: misses fallbacks and the account guard. |
| Fixture source | Captured in the developer's signed-in browser, redacted, shape-diffed; synthetic where capturing would mean crawling | CI captures only: signed out, it never sees the answers that matter |
| Signed-in checks | The developer's own browsers, before every release | A Google account in CI: flagged sign-ins, rotating cookies, a credential to guard, and "automated means" |
| Signed-out CI | A daily static watch, plus a browser watch with the built extension | Static only: misses runtime hooks, anchors, styles, and the build itself |
| Timeouts | Recorded; "not working" only after 3 in a row while online | Every timeout counts as breakage: offline users would see false alarms |
| User surfaces | A notice once per session per feature, a badge on the tab, popup and settings status | A page banner (changes YouTube's look); toasts only (gone in 6 s); no badge (unseen) |
| Fallbacks that worked | Diagnostics only | A notice: alarms users about something that works |
| Keys of not-working actions | Stay caught and answer each press | Unarmed (ticket 26's first wording): the key silently does nothing |
| A key pointing at an unrecognised card | Do nothing, explain, and raise a signal; also a page-settle check of how many video links were recognised | Fall back to the current video: a silent wrong-video save (ticket 08's note) |
| "Can't measure" | One failure toast per session; partly working; not working after 3 in a row | Status line only: a fully watched video would silently go un-added |
| Diagnostics | Console log, a copyable report shown in full, read-only Check now | Opt-in error reporting: needs a server and ends `none`. A report in a prefilled URL: sends before the user decides. |
| Fix delivery | Releases only, through a hotfix lane with a frozen manifest | Remote selectors: banned by AMO, a server in all but name, and leaks usage |
| Update button | None | Requesting an update check: Firefox lacks it, and Chrome throttles it to once per 5 h |

Also from [ticket 29](29-youtube-queue-undo.md): add the `IAE%3D` quiet value, the `TLPQ` queue list, the panel data's location (`ytd-playlist-panel-renderer.data` / `.polymerController.data`), `yt-playlist-manager` and `yt-playlist-data-updated` to the watch list. If the quiet value stops working, YouTube's own toast appears: detect it and flag "partly working".

Also from [ticket 16](16-storage-and-sync.md): the diagnostics report may include sync on/off, the sync status and the schema version, with no values.
