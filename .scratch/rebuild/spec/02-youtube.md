# 2. YouTube capabilities

This chapter is the complete behaviour of 2.0 on youtube.com: auto-add and its channel filters, the shared add flow and its feedback, the playlist picker, playlist shortcuts with the picker and undo keys, thumbnail quick-save, the thumbnail Add to queue button, the watch-page button and the right-click card menu. It also holds three features the user approved on 2026-10-20: keys from any tab, which serve both sites, Save from the browser's menu, and Gather tabs, a port of GatherTube.

It covers behaviour only.
- Look, layout, placement measurements and visual states are in [05-ui.md](05-ui.md).
- Jobs, routes, storage keys, modules and registration are in [06-architecture.md](06-architecture.md).
- YouTube Music has its own chapter. Where a YouTube feature also works there (playlist shortcuts, the add flow), this chapter says so and stops.

## Conventions

- **Terms** are those in `GLOSSARY.md`, used exactly.
- **Requirement IDs** are stable. New requirements are added at the end of their group, and a retired ID is never reused.

  | Prefix | Covers |
  |---|---|
  | `YT-GEN` | Rules shared by every YouTube feature |
  | `YT-ITEM` | Cards, the current video and the pointed-at item |
  | `YT-AA` | Auto-add |
  | `YT-CF` | Channel filters |
  | `YT-ADD` | The add flow, its feedback, undo, failures and concurrency |
  | `YT-PK` | The playlist picker |
  | `YT-NEW` | Creating playlists |
  | `YT-KEY` | Playlist shortcuts, the picker key, the undo key and the key recorder |
  | `YT-QS` | Thumbnail quick-save |
  | `YT-Q` | The thumbnail Add to queue button |
  | `YT-WB` | The watch-page button |
  | `YT-CM` | The right-click card menu |
  | `YT-BRK` | What the user sees when YouTube changes something |
  | `YT-ANY` | Keys from any tab (both sites) |
  | `YT-BM` | Save from the browser's menu |
  | `YT-GT` | Gather tabs (R120) |

- **(R-n)** at the end of a requirement means resolution R-n in [resolutions.md](resolutions.md) changed or added it while the spec was assembled. All three rounds are applied (R1–R40, R41–R67, then R68–R77), and so are R83, settled after the spec, the user's decisions of 2026-10-20, R84–R99, the running-cost rules, R100–R117, and the GatherTube fold, R120–R139.
- **Ownership:** under the resolutions' ownership rule, this chapter owns YouTube feature behaviour and copy. Where it shares a topic with another chapter, the owner's text wins: [04](04-features-accounts-data.md) for accounts, settings, data and status, [05](05-ui.md) for layout and visuals, [06](06-architecture.md) for mechanisms, [07](07-quality.md) for budgets, tests and breakage-signal identifiers, and [08](08-release.md) for upgrade and consent copy.
- **PROVISIONAL** marks a rule that a pending check or user decision may change. The mark names what's pending: e.g. "PROVISIONAL (ticket 25: L6)" is live check L6 in [ticket 25](../issues/25-live-checks.md), whose L-checks are defined in [ticket 10](../issues/10-youtube-access.md). Where the tickets say what happens either way, so does this chapter.
- **Placeholders in copy:**

  | Placeholder | Means |
  |---|---|
  | `{title}` | The video's title, in typographic double quotes (“{title}”) in the copy, cut per YT-ADD-18 (R45) |
  | `{list}` | The playlists, written as a list per YT-ADD-18 |
  | `{Playlist}` | One playlist's title, unquoted in copy except in "{Shortcut} now saves to “{Playlist}”." (YT-ADD-18; R77) |
  | `{Channel}` | The channel's title |
  | `{Shortcut}` | A playlist shortcut's label, else its playlist's title on this account, else its key |
  | `{Account}` | The account's name from its label, else "Unnamed account". The tickets write it as `{Name}` (R65). |
  | `{Product}` | The extension's in-product name: "Playlist Pigeon", PROVISIONAL (ticket 22: the name). Every chapter uses `{Product}` (R65). |
  | `{Feature}` | A feature's name (YT-GEN-01) |
  | `{Key}`, `{Other}` | A key, and another shortcut's name |
  | `{n}`, `{m}` | Counts of playlists, written "1 playlist", "2 playlists" |

---

## 2.1 Rules shared by every YouTube feature

**YT-GEN-01: the YouTube features.** Each is a **feature** the user switches on or off by itself. These are the names the UI uses.

| Feature | What it does on youtube.com | Needs the user signed in? |
|---|---|---|
| **Auto-add** | Adds the current video to each auto-add playlist once its watch progress reaches that playlist's required percentage. Channel filters are an option inside it. | Yes. It stays silent when signed out (R41). |
| **Playlist shortcuts** | Keys that save the pointed-at item, else the current video, to a playlist. It also holds the picker key. The undo key belongs to no feature (YT-KEY-05; R44). | Yes |
| **Quick-save on thumbnails** | A split button on video thumbnails: one click saves to the quick-save playlist, and ▾ opens the playlist picker. | Yes |
| **Queue button on thumbnails** | An Add to queue button on video thumbnails | No |
| **Watch-page button** | A button in the watch page's action row that shows auto-add's state, with a menu of this video's actions | Only for its Save rows |
| **Right-click for the video menu** | Right-clicking a video card opens YouTube's own ⋮ menu for it | No |
| **Save from the browser's menu** | A Save to ▸ entry in the browser's own right-click menu, on video links and on the watch page (section 2.15; R91) | Yes |
| **Keys from any tab** | A few keys, set in the browser's own shortcut settings, that act on the current video or the playing song while YouTube or YouTube Music is in another tab. It serves both sites (section 2.14; R88). | Yes |
| **Gather tabs** | Gathers the YouTube videos open in a window into YouTube's player, YouTube's queue or the gather playlist, can close their tabs, and can do it by itself. A port of GatherTube (section 2.16; R120). | Only into the gather playlist |

**YT-GEN-02: everything starts off.** On a fresh install every feature is off, and nothing on YouTube changes until the user picks a feature at first run, in Settings or in the popup. Features are never switched from inside YouTube's pages.
- **1.4.5 upgraders** get auto-add on if any of their auto-add playlists carried over, and Playlist shortcuts on if both their key and its playlist carried over. Either takes effect once they agree on the upgrade note with its row still ticked. Everything new starts off ([08](08-release.md) REL-MIG-22, REL-MIG-23, REL-CON-07; R60).
- **Settings sync** can also bring switches set in the user's other browsers ([04](04-features-accounts-data.md) FT-03).

**YT-GEN-03: consent first.** Until consent is given, no feature runs and nothing is read from YouTube ([ADR-0010](../../../docs/adr/0010-one-consent-gates-every-feature.md)).

**YT-GEN-04: off leaves no trace.** The mechanics are [04](04-features-accounts-data.md)'s FT-15 to FT-19.
- A feature that's off loads none of its own code, and adds no CSS, elements, listeners or requests to youtube.com.
- While another YouTube feature is on, the shared site core is there, and the off feature's share of it stays inert (FT-17, FT-18).
- With every YouTube feature off, nothing is injected. The one exception is the inert on-demand probe: after consent, when the popup or Settings needs data from a tab, it goes into that one tab and draws nothing (FT-16).
- Keys from any tab and Save from the browser's menu register nothing. When one is used, the page half, core and kit go into that one tab, and draw only the answer's toast (YT-ANY-07, YT-BM-08; FT-59; R88, R91).
- Gather tabs registers nothing of its own. Only while one of its automatic options that watches new tabs is on does it need the page half and core on watch and live pages, which draw nothing ([04](04-features-accounts-data.md) FT-63; R133).
- Switching a feature off removes everything it added to open pages.

**YT-GEN-05: each tab acts as its own account.**
- A tab's account is what `ytcfg` `DATASYNC_ID` identifies at page load. It stays the tab's account until the tab reloads.
- In-page features use only that account's setup, and in-page UI shows only that account's data.
- 2.0 never switches accounts. It links to YouTube's own pages: "Switch account" opens `https://www.youtube.com/channel_switcher`, and "Sign in" opens YouTube's sign-in page, which returns to the same page.
- PROVISIONAL (ticket 25: L7): `DATASYNC_ID` is assumed stable across sign-out and sign-in and across browsers.

**YT-GEN-06: what belongs to the account.**

The rule and the full table are [04](04-features-accounts-data.md)'s ACC-06 (R54). On YouTube:

| In the account setup (per account) | Shared by every account |
|---|---|
| Auto-add playlists, each with what it takes (Videos / Shorts / Both) and its own required percentage if set | Every feature's switch, options and Show feedback |
| Their channel filters, kept and orphaned filters included, with their channel labels | The shortcuts' keys and labels, and "Watch later on every account"; the picker key; the undo key; Also on YouTube Music |
| The playlist each playlist shortcut adds to | The default required percentage |
| YouTube's quick-save playlist | Whether presets were applied, and the theme |
| The *Missing* and *Full* marks | |
| The account label: name, @handle and avatar | |

Pause and session skips aren't settings. They're this browser's session memory, and never sync (04 DATA-11).

**YT-GEN-07: an account with no choices is idle.** Auto-add tracks nothing there, and nothing extra is drawn on the page. Explicit actions still answer (YT-ADD-27, YT-ADD-28). A new account's first choice creates its setup.

**YT-GEN-08: signed out** (`ytcfg` `LOGGED_IN` false):
- auto-add does nothing and shows nothing, so 1.5.0's toast on every video doesn't come back (R41);
- playlist shortcuts, quick-save, the picker and the watch-page menu's Save rows are explicit actions, so they all answer with the same failure toast, "Sign in to YouTube to save videos.", with **Sign in**, and the picker doesn't open (R3, R41);
- the queue button and the card menu keep working;
- every account setup is kept.

**YT-GEN-09: account changed in another tab.** A tab whose YouTube answers come back for a different account refuses every job that needs an account, reads included, until it reloads, and disarms auto-add (YT-ADD-10).

**YT-GEN-10: private windows.** 2.0 runs in a private or incognito window only if the user allows the extension there.
- **What works:** an account that already has a setup behaves as in a normal window: auto-add, shortcuts, quick-save and the picker.
- **What's never written:** nothing that comes from the private session is stored. That means no new setups or setup edits (ticks, Takes, percentages, filters, shortcut targets, quick-save playlists, choose mode's first pick), no *Missing* or *Full* marks, no watch progress, no locally kept new playlists, and no remembered visibility.
- **Session memory** (session skips, recent adds, rate-limit pauses, shown-once memory) stays in memory only, the tab's own or the background's, and never in a storage area (04 DATA-33).
- **Still saved:** shared-settings changes made there (switches, options, keys, labels, Watch later on every account, the theme and the default percentage), because they carry nothing from the private session. This is settled, not provisional: only if an AMO reviewer objects does [08 §13](08-release.md#13-if-an-amo-reviewer-objects)'s fallback refuse those writes too (04 ACC-38, DATA-32; R58, R83).
- **Pause and Resume** work there too.

**YT-GEN-11: where features run.** Features run in the top frame of youtube.com pages in desktop Chrome and Firefox. They don't run in YouTube embeds on other sites, on m.youtube.com, or in YouTube's live-chat frame. music.youtube.com is covered only where a feature says so, and only while the YouTube Music section is on: with it off, nothing of ours runs there (R1).

---

## 2.2 Cards, the current video and the pointed-at item

One recognition serves quick-save, the queue button, the card menu and the keys.

**YT-ITEM-01: items.** An item is any card or row YouTube draws for a single video:
- the home, search, subscriptions and channel grids;
- the watch page's sidebar and its playlist panel;
- Shorts shelves;
- playlist-page rows.

The starting selectors (lockup view models with camelCase classes, BEM spellings kept as fallbacks, the playlist panel and Shorts lockups) are in [ticket 14's selector table](../issues/14-in-page-controls.md), "Item recognition".

**YT-ITEM-02: unsupported items.** These get no buttons and no card menu, and keys answer them with a message (YT-KEY-17):
- playlist and mix cards, recognised by a collection stack, a "Play all" scrim, or a `/playlist?list=` link;
- channel cards and posts;
- ad slots (`ytd-ad-slot-renderer`, `ytd-in-feed-ad-layout-renderer`, and the like).

**YT-ITEM-03: inside a player.** Anything inside a player (end-screen tiles, cards, overlays) counts as that player's video.

**YT-ITEM-04: search's inline preview.** When the pointer is over the inline preview that covers a search result, it resolves to the card underneath.

**YT-ITEM-05: the current video** is the video the tab is on, playing or paused:
- on a watch page, the watch page's video, including while an ad plays (ads never count);
- on `/shorts/`, the Short on screen;
- on any other page, the miniplayer's video.

It's read from the player's own video ID, and on Shorts from YouTube's navigation event, never from the URL alone.

**YT-ITEM-06: the pointed-at item.**
- The item under the pointer counts if the pointer moved more recently than keyboard focus. Otherwise the item holding keyboard focus (`:focus-visible`) counts.
- It's checked at the moment of the key press, so scrolling counts.
- A pointer outside the page points at nothing.

**YT-ITEM-07: recognition checks itself at every key press.** A markup-independent test asks whether the pointer, or focus, is on something that looks like a video: a link to `/watch?v=` or `/shorts/`, or an element holding exactly one such link, outside any player. If the test says yes but no item was recognised:
- the key does nothing;
- it never falls back to the current video;
- it shows YT-BRK-06's failure toast and raises an `item-unrecognised` breakage signal ([07](07-quality.md) Q-WATCH-24, Q-WATCH-26; R51).

**YT-ITEM-08: recognition checks itself once the page settles,** 3 s after navigation *(starting value)*. If the main content holds at least 6 distinct video links and fewer than half are recognised *(starting values)*, it raises `anchor-missing`, even if some cards still work. The main content excludes the player, the description and the comments ([07](07-quality.md) Q-WATCH-25; R51).

---

## 2.3 Auto-add

**Auto-add** adds the current video to each **auto-add playlist** once its **watch progress** reaches that playlist's **required percentage**. It's one of two add paths that happen without an explicit user action; the other is automatic gathering (section 2.16.5; R128).

Its options are:
- the auto-add playlists, per account; each one sets what it takes (Videos, Shorts or Both), may set its own required percentage, and may have a channel filter (section 2.4);
- the default required percentage, shared;
- Show feedback, shared, on by default.

### 2.3.1 Switching off, pausing, and leaving a video out

**YT-AA-01: off.** With auto-add off:
- no tracking code is injected into YouTube's pages;
- nothing is remembered;
- switching it off deletes all remembered watch progress.

**YT-AA-02: on, but nothing to add to.** This covers an account with no auto-add playlists, no playlist that takes this kind of video, or a signed-out page. Auto-add then tracks nothing and shows nothing on the page, and the popup says what's missing. This fixes 1.x's "No auto-add playlists selected" and "No access token found" toasts on every video.

**YT-AA-03: Pause auto-add.**
- It stops auto-add in every tab until the user chooses **Resume** or the browser restarts. An extension update also ends it, because session memory is lost (04 DATA-11; R57).
- Nothing watched while paused counts. After resuming mid-video, counting starts from that moment.
- Settings and the page code stay as they are, which is what separates pausing from switching off.
- Pause is shown, with **Resume**, wherever auto-add's state is shown.
- It's kept for the browser session only.

**YT-AA-04: "Don't auto-add this video".**
- It sets a **session skip** for the current video on every auto-add playlist of the tab's account.
- Auto-add then leaves the video alone until the browser restarts or the extension updates, however much of it is watched (R57).
- A session skip doesn't count as auto-add having *run* (YT-AA-36), so the video's remembered progress is kept, and progress keeps counting while it's skipped.
- Its undo, "Auto-add this video again", removes the skip and checks each playlist's goal at once. A playlist whose goal is already reached is auto-added straight away; the others carry on from the progress so far.
- It never removes earlier adds; that's Undo's job (YT-ADD-30). (R23)

**YT-AA-05: other ways a session skip is set.** Undoing an auto-add (YT-ADD-33), or unticking an auto-add playlist in the picker (YT-PK-05), sets the session skip for that video on those playlists only. Undoing the untick puts the video back and leaves the skip, which then changes nothing (R84).
- Explicit adds ignore session skips.
- Session skips last until the browser restarts or the extension updates, and are never written to disk (04 DATA-11; R57).

**YT-AA-06: account changed in another tab.** Auto-add is disarmed in that tab until it reloads (YT-ADD-10).

### 2.3.2 Which playback counts

**YT-AA-07: what counts.**
- **The watch page's player** (`/watch`), including videos in playlists and mixes, and autoplayed next videos.
- **The miniplayer,** including queue items played in it. This is new: 1.x stopped tracking when the user left `/watch`. The miniplayer's next video arrives without a page navigation and is picked up from the player.
- **The Shorts player,** for playlists that take Shorts (YT-AA-26).
- **Background tabs.** A tab opened in the background counts only once something has played there, because browsers hold back media until then. Chrome pauses a video that has been muted since it started while its tab is hidden, so that doesn't count while hidden.

**YT-AA-08: what never counts.**
- hover and inline previews, and Shorts-shelf previews;
- the channel page's featured video or trailer;
- YouTube's other special-purpose players (banner, masthead, promo, background audio);
- clips (`/clip/…`, YT-AA-11);
- YouTube embeds on other sites;
- music.youtube.com (auto-add is YouTube-only);
- anything played while an ad shows.

**YT-AA-09: which player.** Only the players with the ids `movie_player` (the watch page and the miniplayer) and `shorts-player` count. Never the document's first `<video>`, and never any other player.

**YT-AA-10: which video.** The video is the one the player says it's playing (`getVideoData().video_id`), never the URL alone.
- **Watch page and Shorts:** that ID must match the navigation's (`watchEndpoint.videoId` or `reelWatchEndpoint.videoId`). Until both agree, nothing counts.
- **Miniplayer:** once the player reports a new video, its ID is enough.
- **A new video in the same player starts its own playback.** That covers autoplay, a queue item, a Shorts swipe, and a live stream reloaded as a replay.

**YT-AA-11: clips never count.** A clip plays in the ordinary watch player with its source video's ID and length, looping over a range. It's recognised by the player response's `clipConfig`, including when the clip continues in the miniplayer.

**YT-AA-12: made-for-kids videos aren't tracked.** YouTube refuses to save them.
- They're recognised by `playabilityStatus.miniplayer.miniplayerRenderer.playbackMode` being `PLAYBACK_MODE_PAUSED_ONLY`.
- PROVISIONAL (ticket 25: ticket 07's check 7, signed in). If the signal turns out not to be specific to made-for-kids videos, these videos are tracked, and the refusal toast (YT-ADD-28) is the fallback, shown once per browser session.

### 2.3.3 Watch progress

**YT-AA-13: what progress means.** Watch progress is the total length of the parts of the video the user has played, each part counted once, divided by the video's length.
- **Speed doesn't matter.** At 2× a 10-minute video reaches 100 % after 5 minutes. The rule works the same at any speed, up to 16×.
- **Jumps don't count.** None of these count: seeking, clicking a chapter, the arrow keys' 5 s jumps, Premium's "Jump ahead", automatic skips such as SponsorBlock's, a `&t=` start, or YouTube's resume point.

**YT-AA-14: the exact rule.**
- **Readings:** on each `timeupdate` of the right player's `<video>`, read the player's own position (`getCurrentTime()`).
- **A stretch counts** between two readings only if all of these held:
  - the same video was loaded;
  - no ad showed;
  - no seek started;
  - the video was playing;
  - the position moved forward by no more than (elapsed time × playback speed) + 1 s.
- **Gaps:** a gap of 1 s or less between counted stretches counts as played.
- Progress is the extension's own union of counted stretches, never `video.played`.

**YT-AA-15: nothing playing, nothing counted.** Nothing counts while the video is paused or buffering, or while YouTube's "Video paused. Continue watching?" shows. Muted playback, fullscreen, theatre mode and picture-in-picture all count.

**YT-AA-16: the length.**
- It's the player's `getDuration()`, checked against the video's listed length (`videoDetails.lengthSeconds`) where the page has it.
- While the length is unknown, playback is still counted in seconds, and the goal is checked once the length is known.
- If the two lengths disagree by more than 2 s, this playback isn't counted, and the state is *Can't measure* (YT-AA-38, YT-AA-41).

**YT-AA-17: the goal.** A playlist's goal is `min(cap, max(1 s, required percentage × length))`. The cap is `length − 2 s` when the video is at least 3 s long, and the full length when it's shorter. The video is *watched* for that playlist once its counted seconds reach the goal. So:
- 0 % means "as soon as 1 second of the video itself has played";
- 100 % works, because the last 2 s of a video 3 s or longer never block it;
- a video shorter than 3 s needs at least 1 s played, and never more than its whole length;
- a looping Short's wrap back to 0 never matters. (R27)

**YT-AA-18: when it fires.** Auto-add fires the moment progress reaches a goal, during playback, without waiting for the end. Each playlist fires at its own goal. It hands the add flow (section 2.5):
- the video ID;
- the title (`videoDetails.title`);
- the channel (ID, name and @handle), if the page gave it;
- the playlists whose goal was just reached.

### 2.3.4 Ads

**YT-AA-19: ads never count.** Neither an ad's progress nor its running time counts towards the video, and an ad can never set off auto-add. Position and length always come from the player, never from the `<video>` element, which plays the ad.

**YT-AA-20: nothing is read while an ad shows.** An ad is showing if any of these holds:
- the player element has the `ad-showing` class;
- `getPresentingPlayerType()` returns 2;
- the player has sent `onAdStart` and not yet `onAdEnd`.

Counting picks up where the video resumes. The ad leaves no gap and earns no credit.

**YT-AA-21: stitched ads.** PROVISIONAL (ticket 25: ticket 07's check 2). These are ads spliced into the video's own stream.
- Nothing counts while `ad-showing` is set.
- A length disagreement over 2 s means that playback isn't counted, and the state says so.
- The worst case is a missed add, never a wrong one.

**YT-AA-22: Shorts ads** are their own items in the Shorts feed, each with its own video ID. An item doesn't count if its navigation marks it as an ad (`reelWatchEndpoint.adClientParams.isAd`), or if the Shorts player shows `ad-showing`. PROVISIONAL (ticket 25: ticket 07's check 3).

**YT-AA-23: pause ads** are overlays beside a paused video. Nothing plays, so nothing counts.

### 2.3.5 Live streams, premieres and replays

**YT-AA-24:** the player response's `videoDetails` decides whether a playback counts.

| What's playing | How it's recognised | Counts? |
|---|---|---|
| Ordinary video | None of the flags below | Yes |
| Live stream, with or without rewind | `isLive: true`, `isLiveContent: true` | No |
| Premiere while it plays | `isLive: true`, `isLiveContent: false` | No |
| Upcoming stream or premiere (waiting room) | `isUpcoming: true` | No |
| Stream recording still processing ("post-live") | `isPostLiveDvr: true` | No |
| Stream replay | `isLiveContent: true`, no `isLive`, fixed length | Yes |
| Premiere after it's over | `isLiveContent: false`, fixed length | Yes |

The flags are read in this order: `isPostLiveDvr`, `isLive`, `isUpcoming`, `isLiveContent`. Live streams and premieres never count in 2.0: the user declined counting them after some minutes or crediting the replay (R87).

**YT-AA-25: a stream or premiere that ends while it's open.**
- The table is checked again whenever the player reports new video data.
- From the moment the video has a fixed length, it counts like any other.
- Nothing watched while it was live counts.

### 2.3.6 Shorts

**YT-AA-26: what each playlist takes.** Each auto-add playlist takes **Videos**, **Shorts** or **Both**. The default is Videos for every playlist, carried-over ones included.

**YT-AA-27: what a Short is.** A Short is a video played in the Shorts player, at `/shorts/<id>`. The same video opened on a watch page counts as a video. A Short shown in a miniplayer, if YouTube ships that, is still a Short, because it stays in the Shorts player.

**YT-AA-28: same rule as videos.** A Short is added at the playlist's required percentage of the Short's length.
- The loop's wrap back to 0 is a jump: it starts a new stretch, and the 2 s slack (YT-AA-17) covers the moment before it.
- Watching a Short twice counts its parts once.
- Each swipe is its own playback. Swiping back to a Short continues its remembered progress.

**YT-AA-29: Shorts untracked when unwanted.** When no auto-add playlist of the account takes Shorts, nothing is tracked on Shorts at all.

### 2.3.7 Required percentage

**YT-AA-30: the default.** One default required percentage is shared by every account. It's a whole number from 0 to 100, and 50 by default.

**YT-AA-31: per-playlist override.** Each auto-add playlist can set its own required percentage, in the same per-playlist options as its channel filter.
- Left unset, the playlist uses the default.
- The override is part of the account setup and travels with the playlist.

**YT-AA-32: the ends of the range.**
- 0 % reads "As soon as it starts playing".
- 100 % reads "Only when watched in full". At 100 %, a video with skipped parts isn't added.

**YT-AA-33: changes apply at once.**
- A changed percentage applies straight away to videos already playing. Lowering it below a video's progress adds the video at once.
- A playlist that becomes an auto-add playlist mid-video is checked against that video's progress straight away.
- An add already under way finishes as it started (YT-ADD-03).

**YT-AA-34: no half-typed values.**
- The number field saves on Enter or when focus leaves it. Empty or out-of-range input reverts to the saved value.
- The slider saves when it's released.
- This fixes 1.x saving 0 % the moment the field was emptied.

### 2.3.8 Remembered progress, replays and coming back

**YT-AA-35: progress is remembered between visits,** so two sittings of 40 % add up to 80 %.
- It's kept per account, on this device only, and never synced.
- It lasts until auto-add has run for the video, or until 30 days after the video last played.
- It's never stored from a private window. There it lasts as long as the tab.
- If the video's length has changed by more than 2 s since, the remembered progress is dropped.

**YT-AA-36: dropped once auto-add has run.** Auto-add has *run* for a video once every playlist that takes it has been *added* or found *already in*. Its remembered progress is then dropped, and the next visit starts from zero. Only those two outcomes count: a session skip, *filtered out* or *failed* leaves the progress remembered (R23, R43).

**YT-AA-37: once per playback.**
- Within one playback, auto-add runs at most once per playlist. Replaying, seeking back or looping on the same page adds nothing new.
- A new playback starts again from its remembered progress: leaving and coming back, a reload, swiping back to a Short, or the miniplayer loading the video again.
- A video the user removed from a playlist on YouTube is auto-added again once it's watched past that playlist's goal again. If it's still there, auto-add says nothing (YT-ADD-27).

### 2.3.9 What auto-add shows about the current video

**YT-AA-38: one state per playback,** shown by the watch-page button (YT-WB) and the popup's This video status ([05-ui.md](05-ui.md)). The copy below is the watch-page button's, from [ticket 14](../issues/14-in-page-controls.md). The popup's wording is in [05-ui.md](05-ui.md). "Couldn't save “{title}”. Try again." is the button's status line when auto-add failed for any reason but being offline; it's never a toast, and the menu's Save rows don't use it (YT-WB-09; R70).

| State | Meaning | Button label | Status line (tooltip and menu) |
|---|---|---|---|
| Counting | Progress is below the lowest pending goal | ◔ Auto-adds at 50 % | Auto-adds at 50 % · 32 % watched |
| Partly added | Some playlists have had their outcome; others have higher goals | ◔ Auto-added · next at 90 % | Added to Music videos · Talks to watch at 90 % |
| Added | Every playlist that takes the video has had its outcome, and at least one added it | ✓ Auto-added | Auto-added to Music videos and Talks to watch |
| Already in | Every outcome was *already in* | ✓ Already in Music videos | Already in Music videos |
| Failed | An add failed | (error glyph) Couldn't auto-add | Offline: Couldn't auto-add to Music videos. Check your connection. Any other failure: Couldn't save “{title}”. Try again. (R27, R70) |
| Skipped | Session skip on every pending playlist | ⊘ Not auto-adding | Not auto-adding this video |
| Paused | Auto-add is paused | ⏸ Auto-add paused | Auto-add paused until you resume it or restart the browser |
| Live | Live, premiering, waiting room or post-live | (live glyph) Not auto-added | Live streams aren't auto-added |
| Can't measure | The lengths disagree (stitched ads) | ⚠ Can't follow progress | Auto-add can't follow this video's progress, so it won't be added |
| Ad | An ad is playing (momentary) | No change; counting resumes after the ad | |
| Not tracked | Clip, made for kids, no playlist takes this kind, nothing to add to, or auto-add off | Icon only, with the extension's mark | {Product}: save this video |

### 2.3.10 Auto-add's feedback

**YT-AA-39: auto-add's toasts name themselves,** e.g. "Auto-added …" and "Couldn't auto-add …", because they appear without the user doing anything. Their confirmations and notes carry the extension's mark, and their failures the error icon (YT-ADD-17). They wait while the tab is hidden (YT-ADD-20) and until fullscreen ends (YT-ADD-21).

**YT-AA-40: Show feedback** (default on) hides only "Auto-added …" and the filtered-out note. Failures always show, rate-limited per YT-ADD-25. "Already in" everywhere shows no toast, whatever the switch says.

**YT-AA-41: can't measure.** The first playback in a browser session that can't be measured shows a failure toast, even with Show feedback off:

> Auto-add can't follow this video's progress, so “{title}” won't be added.

Later ones are logged to the console only. YT-BRK-04 says when auto-add counts as partly working or not working because of this.

**YT-AA-42: the toolbar icon.** Auto-add has two options for it, both **on** by default and both switchable (R92, which amends R11):
- **"Tick the toolbar icon when this tab's video is auto-added":** a teal ✓ on that tab's icon once the tab's current video has been added to at least one auto-add playlist. It clears when the tab's current video changes.
- **"Show on the toolbar icon while auto-add is paused":** a slate "II" on every tab's icon while auto-add is paused, with the tooltip "Auto-add is paused".
- The toolbar's "!" always takes priority, then paused, then the tick ([04](04-features-accounts-data.md) FT-57). A key from any tab's 3 s answer shows over all of them (YT-ANY-06).

### 2.3.11 Carried over from 1.4.5

**YT-AA-43:**
- **The percentage carries over** under [ADR-0009](../../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md). A set value carries over, rounded and clamped to 0–100. An unset 1.4.5 value means 0 %, and only then does the upgrade note ask once about the 50 % / 0 % mismatch. A value that isn't a number counts as unset (R21). The exception is an upgrader whose 1.4.5 never stored a `refreshToken`: it never added anything, so an unset value becomes 50 % and the question defaults to it (R96). The note's copy and conditions are [08](08-release.md)'s (REL-MIG-11, REL-CON-05; R60).
- **Its meaning changes:** skipping ahead, `&t=` starts and resume points no longer count. Users on 0 % see no difference.
- **Carried-over auto-add playlists** take Videos only and use the default percentage.
- **1.4.5's toasts setting** becomes auto-add's Show feedback.

### 2.3.12 What tracking costs

Auto-add is the one feature that keeps working while a video plays, so it gets its own running-cost rules ([ADR-0012](../../../docs/adr/0012-automatic-work-is-event-driven-scoped-and-paced.md)). The numbers are [07 §7.6.8](07-quality.md#768-running-cost)'s.

**YT-AA-44: it listens only while there's a goal left.** Auto-add follows a player only while all of these hold:
- auto-add is on and not paused;
- the page is signed in (YT-AA-02);
- the video counts (§2.3.2, §2.3.5);
- at least one auto-add playlist of the account takes it and hasn't reached its goal in this playback. A session-skipped playlist still counts, because its progress keeps counting (YT-AA-04).

Otherwise it stops listening until the video, the setup or the pause changes. So once a video has reached every goal, the rest of its playback costs nothing. (R106)

**YT-AA-45: hidden tabs.** In a hidden tab, auto-add only counts. Readings, goals and adds go on as in a visible tab (YT-AA-07). What it shows waits until the tab is visible: the watch-page button and the toast (YT-ADD-20). (R106)

**YT-AA-46: a reading is cheap.** Each reading is arithmetic on the player's position. It makes no DOM query, layout read, storage call or message. A reading never turns into a write or a message by itself: progress goes to the background only at [DATA-27](04-features-accounts-data.md#46-watch-progress)'s checkpoints, and a goal reached goes to the add flow (YT-AA-18). The per-reading budget is [Q-PERF-30](07-quality.md#765-in-page-time)'s. (R105, R106)

---

## 2.4 Channel filters

Channel filters are an option inside auto-add. They carry over `.scratch/channel-filters/spec.md` with these rebuild changes:
- filters belong to the account setup;
- the channel is read from the page, with no Data API and no channel cache;
- `/c/` URLs are now accepted;
- filters apply to Shorts;
- the copy follows section 2.5;
- the editing UI is redrawn ([05-ui.md](05-ui.md)).

### 2.4.1 Rules

**YT-CF-01: one filter per playlist.** Each auto-add playlist has at most one **channel filter**, in **allowlist mode** (shown as "Allow only") or **denylist mode** (shown as "Deny"). A playlist never has both an allowlist and a denylist.

**YT-CF-02: on or off.** A filter is either switched on or switched off. Off isn't a third mode: a filter that's off lets every channel through, but keeps its mode and its listed channels.

**YT-CF-03: channels are matched by ID.** A **listed channel** is identified by its `UC…` channel ID. Its **channel label** (title and optional @handle) is for display only and is never used for matching.

**YT-CF-04: the decision.**

| Filter | Known, listed channel | Known, unlisted channel | Unknown channel |
|---|---|---|---|
| None, or switched off | passes | passes | passes |
| Allowlist mode | passes | filtered out | filtered out |
| Denylist mode | filtered out | passes | passes |

An allowlist with no listed channels lets nothing through to that playlist.

**YT-CF-05: auto-add only.** Filters change auto-add only. Playlist shortcuts, quick-save, the playlist picker, the watch-page menu's Save rows, the queue button and the card menu are never filtered. A key press or click is an explicit choice, and a key that silently refused some channels would look broken.

**YT-CF-06: where filters sit in the add flow.** Filters are checked after the session skip and before the membership read (YT-ADD-02). When every remaining playlist is filtered out, nothing is sent to YouTube. A playlist that is both filtered and already holding the video reports *filtered out*.

**YT-CF-07: which channel.** The filter checks the video's channel at the moment auto-add fires. A video moved to another channel gets no special handling. Filters apply to Shorts too, for playlists that take them.

### 2.4.2 Finding the video's channel

**YT-CF-08: the channel is read from the page.**
- **Watch page and miniplayer:** from YouTube's navigation event, else from the player response. **Shorts:** from the navigation event's reel data.
- It's accepted only if it belongs to the same video ID and is a `UC…` ID.
- **Fallback:** one request for the video's page data (`next` for watch pages, `reel/reel_item_watch` for Shorts; see [06-architecture.md](06-architecture.md)). It's sent only when at least one remaining playlist has a filter switched on.
- A video's channel is never stored, and no Data API is used.
- PROVISIONAL (ticket 25: L9) for Shorts.

**YT-CF-09: unknown channel.** When neither the page nor the fallback yields the channel of this video, the channel is unknown and YT-CF-04's last column applies.

**YT-CF-10: channel labels stay fresh.** Each read of a listed channel compares its title and handle with the stored label, and writes only on a change. Titles are cut at 100 characters and handles at 30.

### 2.4.3 Editing a filter

The editor sits in each auto-add playlist's options, in the popup and in Settings. Layout is in [05-ui.md](05-ui.md).

**YT-CF-11: the modes.** The controls are a switch plus **Allow only | Deny**. The hints read:
- Allow only: "Only videos from these channels are auto-added."
- Deny: "Videos from these channels are never auto-added."

**YT-CF-12: switching modes.**
- Switching between Allow only and Deny clears the list. If the list has at least one channel, the user confirms first, e.g. "Switch to Deny? This clears its 3 allowed channels." With an empty list, the remembered mode is only a default and nothing is asked.
- Switching the filter off keeps its list and mode. It reads: "every channel gets in. Its 3 denied channels are kept for when you turn it back on."
- Turning it back on in the same mode restores the list unchanged.
- Turning it back on in the other mode counts as a direct switch: the user confirms, then the list is cleared.

**YT-CF-13: an empty allowlist warns:** "With no channels listed, nothing is auto-added to {Playlist}."

**YT-CF-14: listed channels** show as removable chips, "Title · @handle". The editor offers to list the current video's channel ("Allow {Channel} (this video)" or "Deny …"), and has a field for typing a channel (YT-CF-16).

**YT-CF-15: "this channel" controls.** These are in the popup's This video details and in the watch-page button's menu (YT-WB-09). For each auto-add playlist of the account:
- **Filter off:** both modes are offered. The remembered mode's control (either one, if the list is empty) switches the filter on in that mode and lists the channel, keeping any kept channels. The other mode's control, when the kept list has channels, asks first, e.g. "Turn on Allow only for Music? This clears its 3 denied channels." Once confirmed, the filter is on in that mode with a new list holding just this channel.
- **Filter on:** only its mode's control is active. The other mode's is greyed out, with a tooltip naming the playlist's mode. The active control reads "Allowed" or "Denied" once the channel is listed, and choosing it again removes the channel.
- **While the channel is being read,** the controls are disabled and show "Looking up channel…". If it can't be read, they stay disabled and show "Channel unknown".
- These controls appear only where auto-add can fire: on a watch page, on a Short, and while the miniplayer plays.

**YT-CF-16: typing a channel.** This is the only way to type a channel, and only in the filter editor.
- **Accepted forms:**
  - a bare `UC…` ID or a `/channel/UC…` URL;
  - `@handle`, or a bare handle;
  - `youtube.com/@handle`;
  - `/user/name`;
  - `/c/name`, which 1.x refused and 2.0 accepts.
- **Resolving:** through YouTube's own URL resolution, following up to 3 redirects and accepting only a channel (`UC…`). The title and @handle are then read from the channel.
- **Any YouTube tab will do,** signed in or out.
- **With no YouTube tab open,** only `UC…` IDs and `/channel/UC…` URLs are accepted, parsed offline. Other forms show "Open YouTube to look up this channel".
- **Errors** reuse 1.5.0's wording (R27):
  - a channel that isn't found, or is terminated: "Couldn't find that channel on YouTube.";
  - anything else: "That doesn't look like a channel. Paste an @handle or a channel URL."

### 2.4.4 Lifecycle

**YT-CF-17:**
- **Unticked playlist:** its filter becomes a **kept filter**. It isn't applied or shown, and it returns unchanged when the playlist is ticked again.
- **Renamed playlist:** no effect, because filters are keyed by playlist ID.
- **Deleted playlist, or one missing from a refresh:** the filter becomes an **orphaned filter**. It's never shown, never pruned automatically, and still counts as listing its channels, so their labels are kept.
- **Removal:** a filter goes when its account setup is removed, with Clear all data, or with "Remove kept filters" when the synced copy is full.
- **Other accounts:** filters belong to their account's setup, and other accounts never see or apply them.
- **Sync:** with settings sync on, a filter change that doesn't fit the synced budget is refused and explained ([04 §3.5](04-features-accounts-data.md#35-budget-and-full), SYNC-14, SYNC-15).
- **Private windows:** filter edits are refused there (YT-GEN-10).

### 2.4.5 Feedback

**YT-CF-18:**
- **All remaining playlists filtered out:** "Didn't auto-add “{title}”: {Channel} is filtered out of {list}". It's a confirmation, so Show feedback hides it.
- **Unknown channel with an allowlist-mode filter:** the outcome is *filtered out*, with the reason "unknown channel", never *failed* (R26). It keeps its own toast, "Didn't auto-add “{title}” to {list}: couldn't tell which channel it's from." The toast is neutral, not a failure. It shows even with Show feedback off, once per browser session (YT-ADD-25).
- **Unknown channel with a denylist-mode filter:** the video is added as normal.
- **Console:** each filter decision is logged to the tab's console.
- **Mixed outcomes:** when some playlists were added and the rest filtered out, for whatever reason, one toast reads "Auto-added “{title}” to {n} playlists · filtered out of {m}", with Undo for the adds (YT-ADD-15; R27).

---

## 2.5 The add flow

Every playlist add goes through one flow, whatever triggers it:
- auto-add;
- a playlist shortcut;
- thumbnail quick-save, including the watch-page menu's quick-save row;
- the playlist picker;
- YouTube Music's Save to playlist (see the YouTube Music chapter);
- Gather tabs, into the gather playlist, as one batch (section 2.16.4; R126).

The thumbnail Add to queue button isn't an add, and shares only the feedback rules (section 2.10).

### 2.5.1 Order and membership

**YT-ADD-01: one flow.** Every add on YouTube follows YT-ADD-02 to YT-ADD-11.

**YT-ADD-02: the order of checks.**
1. **Signed in.** This check comes first, because a signed-out page has no account and so no setup to check (R25).
   - If not, auto-add does nothing and shows nothing.
   - An explicit add shows the failure "Sign in to YouTube to save videos." with **Sign in** (R3, R41).
2. **The feature has a target on this account.**
   - Auto-add with no target does nothing and shows nothing.
   - A playlist shortcut with no target answers with the neutral hint "{Shortcut} has no playlist on {Account} yet." and **Choose** (YT-KEY-13; R24, R56).
   - A quick-save with no quick-save playlist opens the picker in choose mode instead (YT-PK-09).
3. **Auto-add only: the session skip.** A playlist with a session skip for this video is *skipped*, silently.
4. **Auto-add only: channel filters** (section 2.4).
5. **Membership read and account guard.** *Already in* is settled here.
6. **The add,** to each remaining playlist.
   - Playlists are handled independently, one request at a time per tab.
   - One failure never stops the others. 1.5.0 silently skipped the rest after a network error.
7. **The report:** every outcome in one toast (YT-ADD-14).

**YT-ADD-03: settings are read once,** when the add starts. Turning a feature off, or changing its playlists, affects only later adds. An add already under way finishes and reports.

**YT-ADD-04: outcomes.** Each playlist in an add ends with one outcome: *added*, *already in*, *filtered out*, *skipped* or *failed*.

**YT-ADD-05: never a second copy.**
- The extension never puts a second copy of a video in a playlist. There's no "Prevent duplicates" or "Allow duplicates" setting.
- It never sends YouTube's skip-the-duplicate-check option and never offers "Add anyway".
- If YouTube itself rejects a duplicate add, that rejection reads as *already in*.

**YT-ADD-06: membership comes from YouTube, fresh.**
- Every add starts by asking YouTube which of the user's playlists already hold the video. One read covers every target playlist, and the add then goes only to playlists that don't have it.
- There's no local record of adds, so adds made elsewhere count, and a video removed on YouTube can be added again.
- 1.5.0's IndexedDB `cachedVideos` store and the older `localStorage.cachedVideos` are deleted on upgrade.

**YT-ADD-07: when membership can't be read.** PROVISIONAL (ticket 25: L6). This covers a read whose account part checks out but whose membership part is missing or unrecognised.
- An explicit add goes ahead. The user asked for it, and the worst case is one visible duplicate.
- Auto-add goes ahead only if L6 shows that youtube.com rejects duplicate adds itself. Otherwise it fails, because an unattended add would add a copy on every rewatch. Its toast then reads "Couldn't check “{title}”'s playlists, so auto-add didn't run." (R27). This proceed rule stays PROVISIONAL on L6.
- A read that fails outright (network, signed out, account mismatch) never leads to a write.

**YT-ADD-08: an unlisted playlist is still tried.** New playlists can take minutes to appear in YouTube's lists, so only the add's own answer can show a playlist is missing.

**YT-ADD-09: success means YouTube's `status`.** Success is read only from the `status` in YouTube's answer, never from the HTTP code. 1.4.5 reported "Added" even when an add had failed.

**YT-ADD-10: the account guard.** An add always uses the account of the tab it runs in, and that account's setup.
- **Before any write,** the membership read must answer for that same account (its `datasyncId`). Every later response is checked too.
- **Removals** (Undo, a picker untick) start with the same read.
- **On a mismatch:**
  - nothing is written;
  - the tab refuses every job that needs an account until it reloads, reads included, and auto-add is disarmed there;
  - the tab shows "Your YouTube account changed in another tab. Reload this page to keep saving here." with **Reload**: once per tab for auto-add, and on every later explicit add, without a request (R22, R55).
- Watch Later is why this matters: its ID means "this account's Watch Later", so a stale tab would otherwise save into the wrong account.

**YT-ADD-11: nothing shows twice.** YouTube's own toast or dialog never appears for one of the extension's actions, so YouTube can't show a toast the user switched off, or offer "Add anyway".

### 2.5.2 Feedback

**YT-ADD-12: Show feedback.** Each feature that raises toasts has its own Show feedback switch, the watch-page button included, shared by every account ([04](04-features-accounts-data.md) FT-23; R42).
- **Off hides confirmations only:** toasts saying an action did what was asked, and auto-add's filtered-out note.
- **Always shown:** failures; explicit actions that did nothing, such as *already in*; and the "has no playlist" hint (R56). An explicit click or key that silently does nothing is a defect.
- **Toasts only:** the switch never hides a control's own state (a picker row, a quick-save or queue button), or the *Missing* and *Full* marks in settings.

**YT-ADD-13: defaults.**

| Feature | Show feedback by default | 1.4.5 upgraders |
|---|---|---|
| Auto-add | On | From 1.4.5's toasts setting; unset means off ([ADR-0009](../../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md)) |
| Playlist shortcuts | On | Same as auto-add |
| Quick-save on thumbnails | On | — |
| Queue button on thumbnails | On, because its toast carries Undo. This supersedes ticket 12's "off". | — |
| Watch-page button | On. It covers its menu's Save rows (R27, R42). | — |
| Gather tabs | On. It covers automatic gathers and results that arrive after the popup closed; the popup row's own result always shows (YT-GT-31; R134). | — |

The card menu raises no toasts of its own, apart from YT-BRK notices, which Show feedback never hides, so it has no Show feedback switch (04 FT-23).

**YT-ADD-14: one toast at a time.**
- One add gets one toast covering every playlist, not one per playlist as in 1.x.
- One toast is on screen at a time, and the newest replaces the one showing.
- A sticky notice (YT-BRK) is set aside, not lost, when a newer toast arrives, and comes back afterwards.
- A toast carries at most one action: Undo, or a failure's fix.

**YT-ADD-15: partial results.**
- **Saved and failed:** the toast names both, saves first, and carries the failure's action instead of Undo. The picker can still undo.
- **Saved and filtered out** (auto-add only): one toast, "Auto-added “{title}” to {n} playlists · filtered out of {m}", with Undo for the adds. It's a confirmation, so Show feedback off hides it. (R27)

**YT-ADD-16: failures look different.** A failure carries an error icon and error treatment, is announced as an alert, and starts with "Couldn't …". Colour alone never marks it. *Already in* and other did-nothing answers are neutral, not failures.

**YT-ADD-17: the extension's mark.** A small mark starts only the toasts the user didn't ask for that aren't failures: auto-add's confirmations and notes. Failures, auto-add's and the not-working notices included, show the error icon in its place. Answers to the user's own click or key carry no mark. The look is [05](05-ui.md)'s (UI-TOAST-07).

**YT-ADD-18: copy rules.**
- Each toast is one sentence.
- The video title is in typographic double quotes, “{title}”, cut at 40 characters with "…". If no title is known, it reads "this video". Every quote in copy is typographic (R45).
- Playlist titles are unquoted, each also cut at 40. The one exception is "{Shortcut} now saves to “{Playlist}”.", where the quotes keep a shortcut's name and its playlist's title apart (R24, R77).
- Lists read "Music", "Music and Learning", "Music, Learning and Watch later", or "Music, Learning and 2 more".
- Failures start with "Couldn't …".
- YouTube's own words are used: "Saved to", "Watch later" (YouTube's capitalisation), "the queue".
- Titles come from YouTube's latest answer, else the cache. A playlist whose title isn't known reads "a playlist that's no longer available".
- In auto-add's toasts, "save" reads "auto-add".

**YT-ADD-19: duration.** A toast shows for 6 s. The timer pauses while the pointer or keyboard focus is on it.

**YT-ADD-20: hidden tabs.**
- A toast's timer runs only while its tab is visible.
- A toast raised while the tab is hidden waits for the tab to become visible.
- Only one waits: the newest failure if there is one, else the newest confirmation.

**YT-ADD-21: fullscreen.**
- Toasts answering the user's own click or key show over the video.
- Toasts the user didn't ask for (auto-add's confirmations and failures, and notices) wait until fullscreen ends.

**YT-ADD-22: pending.** A key-triggered add with no visible button and no outcome after 1 s shows "Saving “{title}” to {list}…". It then turns into the outcome in place. Buttons show their own busy state instead. With the feature's Show feedback off, the pending toast isn't shown either; only a failure shows when the outcome arrives (R7).

**YT-ADD-23: no answer.** An add with no answer after 10 s counts as failed.

**YT-ADD-24: navigation.** Toasts survive YouTube's in-app navigation, so Undo still works after moving on to the next video. A reload or closing the tab ends them.

**YT-ADD-25: rate-limited toasts.** These limits apply to auto-add only. Keys, clicks and the picker are explicit actions, so they get a toast every time (R22). Auto-add's repeats beyond these limits go to the console only.

| Auto-add's toast | Shown at most |
|---|---|
| *Missing* and *Full* failures | Once per playlist per browser session |
| The unknown-channel note (YT-CF-18); YouTube refusing a video | Once per browser session (R22) |
| Adds during a rate-limit pause (YT-ADD-37) | None, since the toast for the 429 that started the pause already said so (R22) |
| An account that can't use playlists; an account change | Once per tab (R55) |
| Can't measure (YT-AA-41) | Once per browser session |

**YT-ADD-26: console log.** Every add logs each playlist's outcome to the tab's console, whatever Show feedback says.

### 2.5.3 Copy

**YT-ADD-27: confirmations and did-nothing answers.**

| Situation | Toast | Action | Shown with Show feedback off |
|---|---|---|---|
| An explicit add saved it | Saved “{title}” to {list} | Undo | No |
| First pick in choose mode | Saved “{title}” to {list}. One click now saves there. | Undo | No |
| Auto-add saved it | Auto-added “{title}” to {list} | Undo | No |
| A playlist shortcut's playlist chosen through **Choose** (YT-KEY-13) | {Shortcut} now saves to “{Playlist}”. | Undo | No (R24, R45) |
| An explicit add found it already in | “{title}” is already in {list} | — | Yes |
| A playlist shortcut with no playlist on this account (a neutral hint) | {Shortcut} has no playlist on {Account} yet. | Choose (YT-KEY-13) | Yes (R24, R56) |
| Auto-add found it already in everywhere | *(no toast)* | | |
| Auto-add: every remaining playlist filtered out | Didn't auto-add “{title}”: {Channel} is filtered out of {list} | — | No |
| Auto-add: unknown channel, allowlist-mode filter (*filtered out*, YT-CF-18) | Didn't auto-add “{title}” to {list}: couldn't tell which channel it's from. | — | Yes, once per browser session (R26) |
| Auto-add: some saved, the rest filtered out | Auto-added “{title}” to {n} playlists · filtered out of {m} | Undo | No (R27) |
| Partial: some saved, some failed | e.g. Auto-added “{title}” to Music. Couldn't add it to Old stuff: it doesn't exist anymore. | The failure's action | Yes |
| Pending key-triggered add (YT-ADD-22) | Saving “{title}” to {list}… | — | No (R7) |

**YT-ADD-28: failures.** These all show with Show feedback off.

| Situation | Toast | Action |
|---|---|---|
| Signed out (every explicit add: shortcuts, quick-save, the picker, the watch-page menu's Save rows; auto-add stays silent) | Sign in to YouTube to save videos. | Sign in (R3, R41) |
| Offline, so nothing was sent | Couldn't save “{title}” to {list}. Check your connection. | Try again (auto-add only) |
| Sent, but no answer within 10 s | Couldn't confirm “{title}” was saved to {list}. YouTube didn't answer. | Try again (auto-add only) |
| Missing playlist | Couldn't save “{title}”: {Playlist} doesn't exist anymore. | Settings (auto-add, shortcuts); Choose (quick-save) |
| Full playlist | Couldn't save “{title}”: {Playlist} is full. | Settings; Choose (quick-save) |
| YouTube refuses the video (made for kids, private, removed, region-blocked) | YouTube doesn't allow saving “{title}” to playlists. | — |
| Rate-limited (HTTP 429) | Couldn't save “{title}”. YouTube is limiting requests, so try again in a minute. | — |
| Account changed in another tab (every explicit add; once per tab for auto-add) | Your YouTube account changed in another tab. Reload this page to keep saving here. | Reload (R55) |
| Account can't use playlists (supervised or Kids-style) | YouTube doesn't let this account save to playlists. | — |
| Auto-add, membership can't be read (YT-ADD-07, PROVISIONAL) | Couldn't check “{title}”'s playlists, so auto-add didn't run. | — (R27) |
| Unrecognised answer | Couldn't save “{title}” to {list}. Use YouTube's own Save for now. | Try again (auto-add only) |
| Undo failed | Couldn't undo. | — |

**YT-ADD-29: the actions.**
- **Try again** appears only on auto-add's toasts, because an explicit add is retried by pressing the button or key again. It re-runs the add for the failed playlists only, starting from the membership read, so an add that was slow but succeeded isn't doubled.
- **Settings** opens Settings at that feature's playlist, through the deep link `#feature-<id>&playlist=<playlistId>` (feature IDs per [04-features-accounts-data.md](04-features-accounts-data.md) FT-01 and FT-56, e.g. `auto-add`). It scrolls to the playlist's row and highlights it, where the playlist is marked *Missing* or *Full* with **Remove** (R32, R38).
- **Choose** opens the in-page picker in choose mode: for the quick-save playlist after a *Missing* or *Full* failure, or for that shortcut after a shortcut with no playlist. Either way the pick also saves the item, with Undo (R24, R45).
- **Sign in** opens YouTube's sign-in page, which returns to this page.
- **Reload** reloads the tab.

### 2.5.4 Undo

**YT-ADD-30: where Undo is offered.** Every toast for an add that saved something carries Undo, except a result that both saved and failed (YT-ADD-15). A result that saved and was filtered out elsewhere keeps Undo for the adds (R27).

**YT-ADD-31: what Undo removes.** Exactly the entries this add created, in every playlist it added to, and nothing else.
- It removes them by the entry IDs the add returned (`setVideoId`).
- If an entry ID is missing, it removes the video by ID instead. That's safe, because the add only happened where the video was absent.
- A video already removed elsewhere counts as removed.
- Undo starts with the membership read and account guard (YT-ADD-10).

**YT-ADD-32: Undo's result.** The toast closes once Undo succeeds. If Undo fails anywhere, the toast reads "Couldn't undo."

**YT-ADD-33: undoing an auto-add** also sets the session skip for that video on those playlists (YT-AA-05). This stops a rewatch a minute later from overriding the user's choice.

**YT-ADD-34: after the toast is gone,** the user undoes by unticking the playlist in the picker (YT-PK-05) or on YouTube. The undo key (YT-KEY-25) runs Undo on the toast showing. Recent adds in the popup lists what was added, so a missed toast can be looked up ([04](04-features-accounts-data.md) DATA-52; R84, R86).

### 2.5.5 Failures

**YT-ADD-35: how each failure is recognised and handled.**

| Situation | How it's recognised | What happens |
|---|---|---|
| Signed out | The tab's own sign-in state, before any request | YT-GEN-08 |
| Offline, or no answer in 10 s | The request couldn't be sent, or its answer never came (including an unconfirmed write) | *Failed*. It's never re-sent automatically, because a lost answer may hide a save that worked. Try again, or pressing the button or key again, starts with the membership read. |
| Missing playlist | YouTube's answer to the add says the playlist doesn't exist or isn't the user's. Absence from a list doesn't count. | YT-ADD-36 |
| Full playlist | YouTube's size-limit error (playlists hold 5,000 videos) | YT-ADD-36, marked *Full* |
| YouTube refuses the video | YouTube's answer, e.g. made for kids | *Failed*. Nothing is marked. Auto-add's toast is rate-limited (YT-ADD-25); explicit adds answer every time (R22). |
| Rate-limited | HTTP 429, or YouTube's rate-limit status | YT-ADD-37 |
| Account changed in another tab | A response answers for a different account | YT-ADD-10 |
| Account can't use playlists | The read or the add is refused for the account, not for a playlist or video | YT-ADD-38 |
| Just-created playlist | The extension created the target less than 30 s ago, and is adding to it separately | YT-ADD-39 |
| Unrecognised answer | No known `status` or shape | *Failed*, with the "Use YouTube's own Save for now" copy, plus a breakage signal (YT-BRK) |

**YT-ADD-36: missing and full playlists.**
- The playlist stays chosen, marked *Missing* (or *Full*) in settings, and is never removed automatically, since only the user removes their choices.
- Later adds keep trying it. Each try is one cheap request, and it heals a wrong mark.
- The *Missing* mark clears when the playlist appears in a YouTube list again. A successful add to a marked playlist clears its *Missing* or *Full* mark ([04](04-features-accounts-data.md) DATA-21).
- Auto-add's toast for it is rate-limited (YT-ADD-25).

**YT-ADD-37: rate limits.** After a 429, all adds for that account pause for 60 s. Adds that start during the pause fail at once, without a request. Auto-adds then show no further toast; every explicit add answers with the rate-limited toast (R22).

**YT-ADD-38: an account that can't use playlists.** The message shows once per tab. After that the tab stops trying for that account:
- auto-add stays silent;
- explicit adds and the picker show the message at once, without a request.

Nothing about it is stored.

**YT-ADD-39: a just-created playlist.** An add to a playlist the extension created less than 30 s ago waits, showing busy, until the playlist is 30 s old, then sends once. The picker's New playlist row avoids this by creating the playlist with the video already in it (YT-NEW-01).

### 2.5.6 Concurrency

**YT-ADD-40: one coordinator.** One coordinator per browser profile orders all adds. Adds for the same account, playlist and video run one at a time, and the later one resolves against the first one's result:
- an explicit add then reports *already in*;
- an auto-add then says nothing.

**YT-ADD-41: two tabs, one video.** Two tabs auto-adding the same video produce one add, and the second is silent. It stays silent for 60 s after the first finishes, in case YouTube's membership answer lags behind the add.

**YT-ADD-42: independent work.** Adds to different playlists or of different videos run independently. Tabs on different accounts each use their own account and setup.

**YT-ADD-43: repeated presses.** While an explicit add is pending, the same button or key is ignored, and so is key auto-repeat. Once it's done, pressing again reports *already in*.

**YT-ADD-44: no hidden toggles.** Shortcuts and one-click saves never take a video out of a playlist.

**YT-ADD-45: removals are ordered too.** Removals and adds of the same video and playlist are ordered by the coordinator. An untick pressed while that row's add is still pending runs after it.

**YT-ADD-46: nothing about individual adds is stored.** Locks, undo entries, session skips, the 60 s memory of recent adds, the popup's Recent adds list ([04](04-features-accounts-data.md) DATA-52; R86) and the "shown once" memory are kept for the tab or the browser session only, never on disk.

---

## 2.6 The playlist picker

The **playlist picker** is the extension's list of the user's playlists, with a check mark on each one that already holds the video. On YouTube it opens from:
- quick-save's ▾;
- the picker key (YT-KEY-04), for the pointed-at item, else the current video;
- the watch-page menu's "Save to…";
- a toast's **Choose**, in choose mode;
- the browser menu's **Choose a playlist…**, or its **Quick-save playlist** in choose mode (YT-BM-03; R91).

**YT-PK-01: contents.**
- It's titled "Save to…". Its header also holds ↻ "Refresh playlists" (YT-PK-13) and the "Sort A–Z" toggle (YT-PK-14).
- It lists the account's playlists in YouTube's own Save-dialog order, with Watch later first, unless Sort A–Z is on.
- A search field, focused on open, narrows the list by title.
- A "New playlist" row comes last (YT-NEW). (R39)

**YT-PK-02: loading.**
- Rows paint at once from the cached playlist list.
- If that cache is older than 5 minutes, the list refreshes by itself when the picker opens (R39).
- Membership is fetched fresh each time the picker opens. Until it arrives, the check marks show a loading state.
- Rows work before membership is known. If the video turns out to be in that playlist already, the row says so.

**YT-PK-03: a check mark means the video is already in that playlist.**

**YT-PK-04: ticking a row runs an add** for that playlist: membership read, account guard, then the add.
- It's an explicit add, never filtered.
- The row shows its own result: busy, then checked, "Already in it", or an inline "Couldn't save".
- The picker raises two toasts only: choose mode's first pick (YT-PK-09) and an untick (YT-PK-05). (R84)

**YT-PK-05: unticking** removes the video from that playlist, as YouTube's own Save dialog does. The user approved it (R84).
- It's an explicit removal: membership read and account guard first, never filtered, and ordered with any add of the same video and playlist.
- If this picker's own tick added the entry, it removes exactly that entry. Otherwise it removes what YouTube's own Save dialog removes for that playlist.
- The row shows busy, then unchecked, or reverts to checked with an inline "Couldn't remove".
- **Undo:** the untick shows one toast, "Removed “{title}” from {Playlist}", with **Undo**, which puts the video back at the end of the playlist. It's a confirmation under the Show feedback of the feature that opened the picker (YT-PK-09's list), and the undo key runs it. If Undo fails, the toast reads "Couldn't undo." In the popup's picker sheet, which shows no toasts, the row reads "Removed · **Undo**" in place for 6 s ([05](05-ui.md) UI-PICK-09).
- Ticking the row again also puts the video back, at the end of the playlist.
- Unticking an auto-add playlist also sets the session skip for that video (YT-AA-05). (R84)

**YT-PK-06: membership unreadable.** The rows show no check marks, and the picker notes "Couldn't check where this video already is." Ticking still adds, and *already in* is still reported on the row.

**YT-PK-07: keys on rows.** A playlist that a playlist shortcut targets on this account shows that shortcut's key at the end of its row, while Playlist shortcuts is on (YT-KEY-34).

**YT-PK-08: pins.**
- Each row has a pin, "Use for one-click save". It's visible on hover or focus, and always visible on the current quick-save playlist.
- Pinning makes that playlist YouTube's quick-save playlist for this account.
- In a private window, pins are disabled, because the quick-save playlist is part of the account setup (YT-GEN-10, [04](04-features-accounts-data.md) DATA-33). Their tooltip says why: "Quick-save playlists can't be changed in a private window." This holds even under 08 §13's private-window fallback (ACC-38; R58, R69, R83).

**YT-PK-09: choose mode.**
- It's titled "Save videos to…", with "One click will save here from now on."
- A pick saves the video, becomes the quick-save playlist, closes the picker, and shows "Saved “{title}” to {list}. One click now saves there." with Undo.
- Opened by a shortcut's **Choose**, the pick saves the video and becomes that shortcut's playlist instead, and its toast carries Undo for the save (YT-KEY-13; R24, R45).
- In a private window, the pick saves the video but isn't stored as the quick-save playlist.
- **Which Show feedback governs the first-pick toast:** that of the feature that opened the picker (R24, R27, R42):
  - quick-save's button, ▾ or **Choose**: Quick-save on thumbnails;
  - the watch-page menu: the watch-page button;
  - the picker key, or **Choose** on a playlist shortcut's toast: Playlist shortcuts;
  - the browser menu's items: Save from the browser's menu (R91).
- The same list governs an untick's toast (YT-PK-05; R84).

**YT-PK-10: closing and keys.**
- The picker closes on Esc, a click outside, or its ✕. It handles Esc itself.
- While it's open, shortcuts are ignored.
- Typing in it never reaches YouTube's own hotkeys.

**YT-PK-11: when it can't open.**
- **Signed out:** the picker doesn't open, and the sign-in toast shows.
- **Account can't use playlists:** the message (YT-ADD-38) shows at once.
- **The picker's code doesn't load within 5 s:** every explicit open gets the failure toast "Couldn't open the playlist list. Try again.", whether it came from ▾, the picker key, the watch-page menu's **Save to…** or a toast's **Choose**. Only a failed hover preload stays in the console, with no toast.

**YT-PK-12: where it opens.** From ▾ it opens below the split button, or above when there's no room. From the watch-page menu it opens on the button. From the picker key it opens beside the pointed-at card's thumbnail, else over the player, else at the top centre of the window. The measurements are in [05-ui.md](05-ui.md).

**YT-PK-13: Refresh.** ↻ "Refresh playlists" in the picker's header always refreshes the account's playlist list from YouTube. The same button sits in Settings' playlist lists ([05-ui.md](05-ui.md) UI-PICK-25). (R39)

**YT-PK-14: Sort A–Z.** A "Sort A–Z" toggle in the picker's header sorts the rows by title. Off, they keep YouTube's Save-dialog order with Watch later first. The choice is stored per device and never synced, and search works the same either way ([05-ui.md](05-ui.md) UI-PICK-26). (R39)

---

## 2.7 Creating playlists

**YT-NEW-01: where creating is offered.**
- **In the playlist picker,** as its "New playlist" row. It creates the playlist with the current video already in it, in one request.
  - The row appears checked.
  - The new playlist becomes the quick-save playlist only in choose mode, or if the user pins it.
- **In every playlist chooser in the extension:** auto-add playlists, a shortcut's playlist, and both quick-save playlists. There it creates an empty playlist and selects it for that use.
- **Nowhere else:** not in toasts, not in channel filters, and never automatically.

**YT-NEW-02: the title.**
- It's required and trimmed, up to 150 characters. PROVISIONAL (ticket 25: the title limit).
- `<` and `>` are refused inline with "Titles can't contain < or >".

**YT-NEW-03: visibility.**
- The choice is Private, Unlisted or Public.
- It's Private by default, then the last visibility picked on this device. The last pick isn't remembered from a private window.
- Description and YouTube's Collaborate switch are left to YouTube.

**YT-NEW-04: a repeated title** is allowed, as YouTube allows it. A non-blocking hint says "You already have a playlist called {title}."

**YT-NEW-05: one click, one playlist.** Create is disabled while a creation is pending.

**YT-NEW-06: after creating.**
- The new playlist is checked or selected at once.
- Its ID, title and visibility are kept locally and shown in every playlist list until YouTube's own list includes it, or for 24 h.
- Undoing the save, or unticking, removes only the video. The playlist stays, because deleting playlists isn't a capability.

**YT-NEW-07: failures** show inline in the form, which keeps the typed title.

| Situation | Message |
|---|---|
| Rate-limited | YouTube won't create more playlists right now. Try again in a few minutes. |
| Public daily cap, if YouTube's answer tells it apart | You've reached YouTube's daily limit for new public playlists. Make this one private or unlisted, or try again tomorrow. |
| No channel, known up front (the account's label has no @handle) | The New playlist row says "This account needs a YouTube channel to create playlists", with a **Create channel** link to `https://www.youtube.com/create_channel`, instead of opening the form |
| No channel, from YouTube's answer | The same message |
| Account can't use playlists | YouTube doesn't let this account create playlists. |
| Signed out | Creating isn't offered. The chooser says "Sign in to YouTube to create playlists." |
| No YouTube tab (popup or settings) | Open YouTube to create playlists, with **Open YouTube** |
| Anything else, including YouTube asking for another step first | Couldn't create the playlist. Try again, or create it on YouTube. |

Watch Later and existing playlists keep working when creating can't.

---

## 2.8 Playlist shortcuts, the picker key and the undo key

All shortcuts are caught by the site core's one key listener inside YouTube's pages ([ADR-0004](../../../docs/adr/0004-shortcuts-caught-in-page.md)). It listens for shortcut keys only while a shortcut feature is on, and for the undo key also while a toast with Undo is on screen (YT-KEY-05; R2, R44). The extension records and stores the keys itself.

### 2.8.1 The feature and its keys

**YT-KEY-01: the Playlist shortcuts feature** holds:
- up to 20 playlist shortcuts;
- the picker key;
- "Also on YouTube Music";
- Show feedback.

The undo key isn't part of it: it belongs to no feature (YT-KEY-05; R44).

**YT-KEY-02: presets.** The first time the feature is turned on, it presets:
- one playlist shortcut, **Alt+W** → Watch later, on every account;
- the picker key **Alt+Shift+P**;
- Also on YouTube Music: on;
- Show feedback: on.

The rules for presets ([04](04-features-accounts-data.md) FT-04):
- They apply once. Turning the feature off and on keeps what the user had, and removing every shortcut never brings the preset back.
- A preset never takes a key already used on the same site. It's left without a key, and its row says "No key: {Key} is used by {Other}".
- 1.4.5 upgraders get no Watch later preset (YT-KEY-33).
- The undo key isn't preset here: it's Alt+U from install (YT-KEY-05; R44).

**YT-KEY-03: where keys work.** Keys work only while a youtube.com page has keyboard focus. They don't work from another tab, from the address bar, or from YouTube's live-chat frame. Keys from any tab are a separate feature with the browser's own keys (section 2.14; R88). Settings says: "Shortcuts work while a YouTube or YouTube Music page is in focus. If one does nothing, the browser or another extension may be using that key."

**YT-KEY-04: the picker key** ("Save to playlist…") opens the playlist picker (section 2.6) for the pointed-at item, else the current video.

**YT-KEY-05: the undo key** belongs to no feature. It's a key used on every page, preset to **Alt+U** at install, and the user can change or clear it. It's one setting for both sites. It lives in Settings › Everywhere, which shows whenever any feature on either site is on ([04](04-features-accounts-data.md) FT-05; R2, R44).
- It works on a page whenever a toast with Undo is on screen there, whichever feature raised it. So it works with only the queue button, quick-save or auto-add on.
- While a shortcut feature is on there (on YouTube, Playlist shortcuts), the key is always caught. With no Undo toast on screen it then answers "Nothing to undo." (YT-KEY-25).
- While none is on, a press with no Undo toast on screen passes through untouched.
- Its listener is the site core's one key listener, so this costs nothing extra.
- The picker key isn't like this: it stays with Playlist shortcuts (YT-KEY-04).

**YT-KEY-06: the browser's own popup key.** The manifest declares the browser's "open the popup" entry, with no default key, so users can bind one in the browser's shortcut settings. Settings › Everywhere links there. Its only other commands are keys from any tab's three, also with no default key (YT-ANY-02; R88).

### 2.8.2 The playlist shortcut list

**YT-KEY-07: what a playlist shortcut is.** A key, an optional label, and a playlist for each account. The key and label are shared by every account; the playlist is chosen per account.

**YT-KEY-08: at most 20.** At 20, Add shortcut is disabled, with "You can have up to 20 playlist shortcuts."

**YT-KEY-09: Add shortcut** adds a row at the end and starts recording its key at once. The row's playlist chooser opens next, for the current account. Shortcuts keep the order they were added in, with no reordering.

**YT-KEY-10: Clear key** leaves the shortcut without a key. It's then inert and shows "No key", and keeps its label and playlists. There's no separate on/off switch per shortcut.

**YT-KEY-11: Remove** deletes the shortcut everywhere: its key, its label, and its playlist on every account. There's no confirmation. Instead, the row is replaced in place by an inline "Shortcut removed · Undo" for 6 s (R38).

**YT-KEY-12: Watch later works on every account.**
- Choosing Watch later for a shortcut makes it save to the current account's Watch later on every account that hasn't chosen another playlist for that shortcut. Accounts with their own choice keep it.
- Choosing any other playlist sets it for the current account only.
- Choosers show it as "Watch later (every account)".
- Choosing Watch later is allowed in a private window, because it's a shared choice ([04](04-features-accounts-data.md) DATA-32; R58, R83).

**YT-KEY-13: a shortcut with no playlist on this account** answers "{Shortcut} has no playlist on {Account} yet.", with a **Choose** action. It's a neutral hint, not a failure, and it always shows, even with Show feedback off. (R24, R56)
- **Choose** opens the in-page picker in choose mode for that shortcut. The pick saves the video, as any choose-mode pick does ([ticket 14](../issues/14-in-page-controls.md)), and becomes the shortcut's playlist on this account.
- The toast then reads "{Shortcut} now saves to “{Playlist}”.", with Undo for the saved video. The shortcut keeps its new playlist. It's a confirmation under Playlist shortcuts' Show feedback. The same holds on YouTube Music (R45).

**YT-KEY-14: labels.**
- A label is optional, trimmed, and up to 40 characters.
- It's the shortcut's own name, such as "Later" or "Recipes", and stays the same across accounts.
- It shows wherever shortcuts are listed, and as {Shortcut} in messages.
- Without a label, a shortcut shows the current account's playlist title, else its key.
- Toasts name the playlist the video went to, never the label.
- Playlists always show by their YouTube titles; 1.4.5 made users paste IDs. There are no local nicknames for playlists.

**YT-KEY-15: Also on YouTube Music** (on by default) makes playlist shortcuts work on music.youtube.com too, acting on songs ([03-youtube-music.md](03-youtube-music.md) YM-PS-1).
- **The section switch:** it takes effect only while the YouTube Music section is on. With the section off, nothing of ours runs there, and the option is kept for when it's back on (R1).
- **The undo key** doesn't depend on it: it works on any page while a toast with Undo is on screen (YT-KEY-05). While this option is on, Playlist shortcuts counts as a shortcut feature on YouTube Music, so a press there with nothing to undo answers "Nothing to undo." (R44).
- **Access on Chrome:** it needs YouTube Music access. That's asked from the click that switches it on while Playlist shortcuts is on, or that first switches Playlist shortcuts on, since the preset turns this option on. The section switch itself never asks ([04](04-features-accounts-data.md) FT-44; R53).
- **Without access,** the row reads "Needs site access" with **Give access**. The violet "!" shows on every tab while Playlist shortcuts and this option are both on and the section is on (04 FT-13, FT-46, FT-47; R53).
- **Access denied:**
  - from the click that switches Playlist shortcuts on, in the popup or Settings: Playlist shortcuts goes on, this option turns off, and "No access to YouTube Music, so shortcuts work on YouTube only." shows in place, under Playlist shortcuts' row (04 FT-52; R71);
  - from the click that switches this option on: it stays off (FT-52);
  - at first run's Agree: it's saved on but held with "Needs site access" and **Give access**, and shortcuts work on YouTube meanwhile (R14, R53).

### 2.8.3 What a key acts on

**YT-KEY-16: the target.** A key acts on the **pointed-at item** (YT-ITEM-06), else on the **current video** (YT-ITEM-05). If what's pointed at isn't supported, the key does nothing and says why. It never falls back, because the user pointed at something else.

**YT-KEY-17: the cases.**

| Situation | Result |
|---|---|
| Watch page, pointer on the player, the comments or nothing | The current video |
| Watch page, pointer on a sidebar card | That card's video |
| Pointer on an end-screen tile when a video ends | The video that just played |
| Shorts page | The Short on screen |
| Home, pointer on a card in a Shorts shelf | That Short |
| Home or search, miniplayer playing, pointer not on a card | The miniplayer's video |
| Home or search, no miniplayer, nothing pointed at | "Point at a video to save it." |
| Pointer on a playlist, mix, channel or post card | "Only videos can be saved to playlists." |
| Pointer on an ad | "Ads can't be saved." |
| Fullscreen | The current video |
| Live stream, premiere, members-only, private or made-for-kids video | Sent like any add; YouTube's answer decides, with the refusal copy (YT-ADD-28) |
| Pointer on something that looks like a video but isn't recognised | YT-ITEM-07 |

These messages answer an explicit key, so they show even with Show feedback off. They're neutral, not failures, except the unrecognised-item answer, which is a breakage failure (YT-ITEM-07, YT-BRK-06).

**YT-KEY-18: never filtered.** Playlist shortcuts are never channel-filtered.

### 2.8.4 When a key is ignored, and how it's matched

One engine serves every shortcut on both sites.

**YT-KEY-19: a key is ignored, and passes through untouched,** when any of these holds:
- **Typing:** the event's composed path holds an editable field. That's a text-type `input` (any type except checkbox, radio, range, button, submit, reset, image, color and file), a `textarea`, a `select`, anything contenteditable, or `role` textbox, searchbox, combobox or spinbutton.
- **IME:** a composition is under way (`isComposing`, or keyCode 229).
- **A menu or dialog is open:** YouTube's (including its own Save dialog) or the extension's, such as the picker.
- **Auto-repeat:** the event is an auto-repeat.
- **Pending:** the same shortcut's previous action hasn't finished.

**YT-KEY-20: matching.**
- The modifier set (Ctrl, Alt, Shift, Meta) must match exactly, and then the key must match.
- **Character first:** if the shortcut was recorded on a plain letter or digit, and this press produces a plain ASCII letter or digit, the two characters are compared. The presets therefore land on the key labelled W on AZERTY, QWERTZ and Dvorak keyboards.
- **Physical key otherwise:** everything else compares the physical key (`code`). That covers macOS Option (Option+W types "∑"), dead keys, non-Latin layouts, punctuation and named keys.
- AltGr never counts as Alt or Ctrl+Alt.
- Leftover edge: on a non-QWERTY Mac, a preset fires on its US position. Re-recording the key fixes it.

**YT-KEY-21: on a match,** the listener (capture phase, on `window`, in the top frame) calls both `preventDefault()` and `stopImmediatePropagation()`, so YouTube's own handlers, including the Shorts handler, never see the key. A key that matches nothing is never touched.

**YT-KEY-22: one key, one shortcut, per site.**
- Playlist shortcuts and the undo key count on both sites.
- The YouTube picker key counts on YouTube.
- YouTube Music's quick-action keys count on YouTube Music.
- A shortcut counts whether its feature is on or off, so turning a feature back on never creates a clash.

**YT-KEY-23: clashes with others.**
- **YouTube's own keys:** the user may take one, and ours then wins on YouTube. YouTube ignores presses with Ctrl or Alt held (except the arrows), so the presets clash with nothing.
- **Reserved browser keys** never reach the page, so they can't be recorded:
  - Chrome: Ctrl+T/N/W, Ctrl+Shift+N/T/W, Ctrl+Tab, Ctrl+PgUp/PgDn and Alt+F4;
  - Firefox: Ctrl+T/N/W, Ctrl+Shift+W/P, and Quit.
- **Other browser shortcuts** (Ctrl+D, Ctrl+S, Alt+D, F5 …) can be taken, on YouTube pages only. The recorder warns about them.
- **Other extensions' keyboard commands:** on Chrome theirs win and can't be detected; on Firefox ours win on YouTube pages.

### 2.8.5 Feedback and the undo key

**YT-KEY-24: playlist shortcuts are explicit adds** (section 2.5):
- they always answer, *already in* included;
- the pending toast shows after 1 s, unless Playlist shortcuts' Show feedback is off (YT-ADD-22; R7);
- they never toggle a video out of a playlist;
- a second press while one is pending is ignored.

There's no highlight on the card a key acted on, because the toast names the video.

**YT-KEY-25: the undo key** (Alt+U unless changed or cleared) runs Undo on the toast showing in this tab: any toast carrying Undo, whether from a save, an auto-add, the queue button or a YouTube Music quick action. It behaves exactly as clicking Undo, and works whichever feature raised the toast, even with both shortcut features off (YT-KEY-05; R2, R44).
- With no such toast on screen, and Playlist shortcuts on, it shows "Nothing to undo.", even with Show feedback off. With Playlist shortcuts off, the press passes through (R2, R44).
- With Show feedback off, confirmations are hidden, so there's then never anything to undo by key.

**YT-KEY-26: keys of a feature that isn't working** stay caught, and every press gets that feature's failure toast (YT-BRK-03).

### 2.8.6 The key recorder

The popup and Settings use one recorder for every shortcut. Its look is in [05-ui.md](05-ui.md).

**YT-KEY-27: idle.**
- A set key shows as keycaps in the platform's style, with a small × to clear it. Unset, it shows "No key". The look is [05](05-ui.md)'s (UI-PICK-23, UI-PICK-24).
- **Style:** on macOS, ⌃⌥⇧⌘ symbols, e.g. "⌥⇧P". Elsewhere, "Ctrl+Alt+Shift+Win+Key" in that order ("Super" on Linux), e.g. "Alt+Shift+P".
- **The key's label** is the character the layout gave when the key was recorded, else the key's name ("F2", "↑", "Page Down").

**YT-KEY-28: recording.**
- It shows "Press keys…", with the held modifiers shown live ("Alt+…"), and "Esc to cancel" ([05](05-ui.md) UI-PICK-23). The first non-modifier key, together with the modifiers held, is the result.
- **Esc** cancels and keeps the old key.
- **Tab** and Shift+Tab move focus as usual, and cancel.
- A click elsewhere, or the popup closing, cancels.

**YT-KEY-29: refused presses** keep the recorder recording, with a hint:

| Pressed | Hint |
|---|---|
| Enter or Space alone | Enter and Space can't be used alone: they press buttons. |
| Any Ctrl+Alt combination | Ctrl+Alt can't be used: many keyboards type characters with it. |
| A reserved browser key | {Key} is the browser's own key and never reaches the page. |
| Modifiers alone, or IME input | (keeps waiting) |

**YT-KEY-30: a key already used on the same site.** The recorder says "{Key} is already used by {Other}." {Other} names the other shortcut, plus its site when it's in the other feature, e.g. "Save to playlist (YouTube Music)".
- **Use it here** takes the key and leaves the other shortcut without one.
- **Cancel** keeps everything as it was.

**YT-KEY-31: clash warnings** keep the key, and the note stays under the row until the key changes:
- "YouTube uses K for Play/pause. This shortcut replaces it on YouTube."
- "YouTube Music uses Q for Toggle queue. This shortcut replaces it on YouTube Music."
- "Chrome uses Alt+D to go to the address bar. This shortcut replaces it on YouTube pages."
- "Your browser uses {Key} for {Command} (Keys from any tab), so this shortcut never reaches the page." Unlike the others, this one says the shortcut can't work: a key set in the browser for a command is taken before any page sees it. The keys are read with `commands.getAll()` (YT-ANY-03; R88).

The browser shortcut list ships in the package, per browser and OS.

**YT-KEY-32: saving** happens at once, with no Save button, and open tabs pick up the change without a reload.

### 2.8.7 Carried over from 1.4.5

**YT-KEY-33:** the migration and the upgrade note's copy and conditions are [08](08-release.md)'s (REL-MIG-16 to REL-MIG-24, REL-MIG-39, REL-CON-04; R60). In short:
- **Where it goes:** the 1.4.5 shortcut's key becomes shortcut 1's key, and its playlist goes into the unclaimed setup.
- **Converting the key:** split the stored value on "+" and de-duplicate the modifiers (`Control`, `Alt`, `Shift`, `Meta`, in any order). The last token is the key. It carries over if it's a letter, a digit, or a named key such as ARROWUP, HOME, PAGEDOWN, DELETE or F1–F12.
- **What doesn't carry over:**
  - punctuation and other characters;
  - Escape and Tab;
  - a bare Enter or Space;
  - a modifier as the last token;
  - any Ctrl+Alt combination.

  Shortcut 1 is then created with no key. The note's row is unticked and says "Your 1.x key ({raw}) can't be used in 2.0. Set a new one in Settings.", where {raw} is 1.4.5's stored value.
- **A playlist with no key:** if 1.4.5 had a shortcut playlist but no key, shortcut 1 is created with no key, its playlist goes into the unclaimed setup, and the upgrade note says "Your 1.x shortcut had no key. Its playlist is kept; set a key in Settings." (R21)
- **A key with no playlist:** the key carries over, and the note's row is unticked and says "Your 1.x key {Key} had no playlist. Choose one after you agree."
- **Bare keys and Ctrl keys carry over as they are,** because they were the user's choice. Bare keys no longer fire while typing. Ctrl keys never fired in 1.4.5, so when their playlist came over too, the note says "{Key} never worked in 1.4.5 because of a bug. It works now."
- **When the feature turns on:** only if both a converted key and a playlist carried over, once the user agrees on the upgrade note with its row still ticked (REL-MIG-23, REL-CON-07). Otherwise it stays off, and what carried over is kept.
- **The list:** an upgrader's list holds only their own shortcut, with no Watch later preset. The picker key is preset unless the carried key uses it. The undo key is Alt+U, as for every install, unless the carried key uses it ([04](04-features-accounts-data.md) FT-04; R44).

### 2.8.8 Key hints

**YT-KEY-34: a key is shown only while it's live.** Quick-save's ▾ tooltip, the watch-page menu's **Save to…** row and the picker's rows show the picker key or a shortcut's key only while Playlist shortcuts is on. With it off, they show the action alone. This is R6's YouTube Music rule, applied to YouTube so both sites behave alike. (R6)

---

## 2.9 Thumbnail quick-save

**YT-QS-01: the feature.** Quick-save on thumbnails has these options:
- "On Shorts shelves too", off by default (R11);
- Show feedback, on by default.

The account's quick-save playlist is chosen in the popup and in Settings.

**YT-QS-02: the split button.** It's drawn on each recognised item's thumbnail, on hover or keyboard focus.
- The main part saves the item's video to YouTube's quick-save playlist for this account, in one click.
- ▾ opens the playlist picker for that video.
- Tab reaches it right after YouTube's own thumbnail toggles.
- ▾'s tooltip shows the current picker key while Playlist shortcuts is on, e.g. "Save to… (Alt+Shift+P)", and "Save to…" otherwise (YT-KEY-34).

**YT-QS-03: the quick-save playlist** belongs to the account setup, and is separate from YouTube Music's.
- It's set in the popup and Settings, by choose mode's first pick, or by a pin in the picker.
- Picks made later through ▾ are one-off and never change it, so one mis-pick can't silently redirect later saves.

**YT-QS-04: no quick-save playlist yet.** This includes any account seen for the first time. The button is a single "Save to…" that opens the picker in choose mode (YT-PK-09).

**YT-QS-05: a click is an explicit add** (section 2.5), never filtered.

**YT-QS-06: states.**
- idle;
- busy;
- done (✓ for 1.5 s), then saved ("Saved to {list}") for the rest of the page view;
- failed (1.5 s), then idle.

Clicking a card that shows saved reports *already in*. States belong to the item, never to a recycled element.

**YT-QS-07: a missing or full quick-save playlist.** The failure toast carries **Choose**, which opens the picker in choose mode. The playlist stays chosen and is marked *Missing* or *Full*.

**YT-QS-08: made-for-kids cards** can't be told apart from their markup, so the button is drawn. Every click shows the failed state and the refusal toast, because a click is explicit (R22).

**YT-QS-09: signed out.** The button stays. A click answers "Sign in to YouTube to save videos." with **Sign in**, and the picker doesn't open (R3, R41).

**YT-QS-10: Shorts shelves** get quick-save only, and only when "On Shorts shelves too" is on. They never get a queue button.

**YT-QS-11: search's inline preview.** While the preview covers a search result, the buttons move into the preview's layer, so they stay on top.

**YT-QS-12: not working.** If quick-save isn't working (YT-BRK), it draws nothing, and the notice shows the first time a card is hovered.

---

## 2.10 The thumbnail Add to queue button

**YT-Q-01: the feature.** Queue button on thumbnails has one option: Show feedback, on by default (YT-ADD-13).

**YT-Q-02: what it does.** An Add to queue button sits on recognised items' thumbnails, on hover or keyboard focus, beside quick-save (placement: [05](05-ui.md) UI-YT-07). A click puts the card's video at the end of YouTube's queue, through YouTube's own queue command. The first add starts the queue in the miniplayer, as YouTube's own Add to queue does.

**YT-Q-03: Add to queue isn't an add.** It needs no sign-in, has no membership or duplicate check, is never channel-filtered, and ignores session skips. It works signed out, and it carries on when the account keys are missing (YT-BRK-05).

**YT-Q-04: it steps aside for YouTube's own.**
- On cards where YouTube draws its own hover Add to queue, ours isn't drawn. The overlay re-checks 150 ms and 900 ms after hover, and Tab then reaches only quick-save.
- Elsewhere ours fills the gap: other layouts, feeds without YouTube's toggles, and the playlist panel.
- Revisit if YouTube's own button ever covers every card.

**YT-Q-05: it's quiet.** When a queue already exists, the add uses YouTube's quiet route, so YouTube's own "Added to Queue" toast never shows beside ours. PROVISIONAL (ticket 25: [ticket 29](../issues/29-youtube-queue-undo.md)'s Q1–Q8, signed in; confirmed signed out). If the quiet route stops working:
- the add is kept, and our own toast is suppressed, so only YouTube's shows;
- once YouTube's own toast is detected after a quiet queue edit, an add or its Undo, a `quiet-route-noisy` breakage signal is recorded and the feature is marked partly working ([07](07-quality.md) Q-WATCH-24, Q-WATCH-28; R40, R51).

**YT-Q-06: success is confirmed.** Success is shown only once YouTube confirms the video is in the queue: it appears in the queue's own data within 2 s, or, for a first add, the miniplayer turns active. Without either signal, the result is *Sent, not confirmed*, never success. PROVISIONAL (ticket 25: L8).

**YT-Q-07: states.** Each state has an icon and an accessible label, never colour alone.

| State | Label | Click |
|---|---|---|
| Idle | Add to queue | Adds |
| Busy | Adding… | Ignored |
| Added | Added to queue. It stays on that card until the page changes, or until the add is undone (R27). | Does nothing, which guards against double-adds while browsing a grid |
| Sent, not confirmed | Sent, not confirmed. Click to send again | Sends again |
| Failed, for 1.5 s, then idle | Couldn't add | — |

States belong to the item, never to a recycled element.

**YT-Q-08: toasts.**

| Situation | Toast | Action | Shown with Show feedback off |
|---|---|---|---|
| Confirmed | Added “{title}” to the queue | Undo | No |
| Not confirmed | Couldn't confirm “{title}” was added to the queue. Check the miniplayer. | — | Yes |
| Failed | Couldn't add “{title}” to the queue. Try YouTube's ⋮ menu. | — | Yes |

**YT-Q-09: Undo** removes exactly the queue entry this click added. The entry is identified by its own queue entry ID (`playlistSetVideoId`), taken from the quiet add's answer or the queue's data once it has refreshed.
- Undo never removes by video ID, because that would remove every copy of the video from the queue.
- The removal is quiet: YouTube shows no "Removed from Queue" toast. If YouTube shows it anyway, the removal stands and `quiet-route-noisy` is recorded, as in YT-Q-05.
- The toast closes once Undo succeeds; otherwise it reads "Couldn't undo."
- The undo key works on it.
- PROVISIONAL (ticket 25: ticket 29's Q1–Q8, signed in).
- After Undo succeeds, the card's button returns to idle and can be clicked again (R27).

**YT-Q-10: not working.** If the button isn't working (YT-BRK), it isn't drawn, and the notice shows the first time a card is hovered.

---

## 2.11 The watch-page button

**YT-WB-01: the feature.** The watch-page button shows auto-add's state for the current video and opens a menu of this video's actions. Its options are:
- "On Shorts too", off by default (R11);
- Show feedback, for its menu's Save rows (YT-WB-09), on by default (R27, R42).

**YT-WB-02: where it sits.**
- In the watch page's action row, after Share and before Save. That's the only slot that survives YouTube's re-rendering.
- It re-places itself after YouTube's navigation, with bounded retries, and goes back if YouTube drops it.
- Measurements are in [05-ui.md](05-ui.md).

**YT-WB-03: its label** follows auto-add's state (YT-AA-38): the button label column, with the status line as its tooltip.
- With no status to show (Not tracked, or auto-add off), it's icon-only, with the extension's mark and the tooltip "{Product}: save this video".
- Progress shows as a pie inside a full outline, never as a ring, which would read as loading.

**YT-WB-04: it gives way to YouTube's Save.**
- Before YouTube's own fold logic runs on a resize, the button measures the row. If its full label plus YouTube's Save wouldn't fit, it goes icon-only at once.
- It unfolds again when both fit with 16 px to spare.
- If even its icon would push YouTube's Save into "…", the button hides.
- On a narrow first load where YouTube has already folded Save, the button folds and sends one synthetic `resize`, so YouTube re-measures its row.

**YT-WB-05: Shorts.** With "On Shorts too" on, the button is the last action in the Shorts action column, before the sound button.
- Its labels are "Save", the pie with "32 %", "Added", "Paused" and "Skipped".
- Its menu opens to the left.

**YT-WB-06: never in the miniplayer or fullscreen.** The status stays in the popup.

**YT-WB-07: the menu** shows the popup's This video card in YouTube's menu look:
- the status line, with the pie;
- each auto-add playlist's goal or outcome, e.g. "At 50 %", "Auto-added ✓", "Filtered out";
- **Don't auto-add this video**, or **Auto-add this video again** while it's skipped (YT-AA-04);
- **Pause auto-add**, or **Resume auto-add** while paused (YT-AA-03);
- **Channel filters · {Channel}:** one row per auto-add playlist with its mode, and a chip that lists or unlists this channel (YT-CF-15);
- **Save to {Playlist}:** one click to the quick-save playlist, which then reads "Saved to …". In choose mode it reads "Save to playlist…" and opens the picker in choose mode;
- **Save to…**, with the picker key while Playlist shortcuts is on (YT-KEY-34), which opens the picker on the same anchor;
- **{Product} settings**, which opens Settings › YouTube at the watch-page button (`#feature-watch-button`, R32).

The Save rows belong to the watch-page button, whether or not Quick-save on thumbnails is on (R27).

**YT-WB-08: with auto-add off,** only the Save rows and the settings row remain.

**YT-WB-09: rows answer in place.** Rows show their own results (busy, done, "Couldn't save"). Save rows are explicit adds (section 2.5), never filtered. The menu raises toasts only in these cases (R3, R27, R41, R42, R70):
- a Save row that fails shows "Couldn't save" in place and answers with the add flow's failure toast for that failure (YT-ADD-28, with its action), which always shows, as for every explicit add. Signed out, that's "Sign in to YouTube to save videos." with **Sign in**. The status line's "Couldn't save “{title}”. Try again." (YT-AA-38) is never used for a Save row;
- choose mode's first pick, started from the menu, shows its confirmation under the watch-page button's own Show feedback (YT-PK-09).

**YT-WB-10: it flips.** The menu opens above the button when there's no room below.

**YT-WB-11: not working.** If the button isn't working (YT-BRK), it isn't drawn, and the notice shows when it would be placed.

---

## 2.12 The right-click card menu

**YT-CM-01: the feature.** Right-click for the video menu has one option: "Links inside cards keep the browser's menu", off by default (R11).

**YT-CM-02: what a right-click does.** A right-click on a recognised card's thumbnail, title or empty area opens YouTube's own ⋮ menu for that card. The extension clicks the card's ⋮ button, which is exempt from "never drive YouTube's visible UI", since it's the feature itself. YouTube anchors the menu at the ⋮ button, as it does for its own clicks. The extension never moves YouTube's menu.

**YT-CM-03: what keeps the browser's menu.**
- Links inside a card to anything other than the card's video (the channel name, avatar, hashtags) always keep it. This fixes 1.5.0 taking right-click away from links.
- With "Links inside cards keep the browser's menu" on, the thumbnail and title links keep it too.
- Shift+right-click, ads, playlist and mix cards, unsupported items, and cards without a ⋮ always get the browser's menu.

**YT-CM-04: it needs nothing else.** The card menu works signed out, is never filtered, and carries on when the account keys are missing.

**YT-CM-05: not working.** If the card menu isn't working (YT-BRK), right-click gives the browser's menu, and the notice shows at the first right-click. The notice is a tiny kit-free one in the site core: plain DOM in the YouTube skin, about 0.5 KB. So the card menu alone still loads no UI kit (R28).

---

## 2.13 When YouTube changes something

This section covers only what the user sees on YouTube. The breakage-signal identifiers and thresholds are in [07-quality.md](07-quality.md) §7.5 (Q-WATCH-23 to Q-WATCH-30; R51). Status, the badge rules and diagnostics are in [04-features-accounts-data.md](04-features-accounts-data.md) §5. The detection mechanisms are in [06-architecture.md](06-architecture.md), and the popup, settings and badge surfaces in [05-ui.md](05-ui.md).

**YT-BRK-01: three statuses.** Status is per feature: each feature has one status per tab, **working**, **partly working** or **not working** ([04](04-features-accounts-data.md) HEALTH-07; R50).
- **Not working:** a job the feature needs has no route left, or an anchor it needs is missing where the page clearly has that content.
- **Partly working:** only an optional part is out. Examples:
  - the picker's check marks (membership);
  - queue confirmation, or the queue's quiet route (YT-Q-05);
  - auto-add failing to measure some videos;
  - shortcuts that can't recognise pointed-at cards but still work on the current video.
- **Card recognition** is required for quick-save, the queue button and the card menu, and optional for shortcuts.
- **The whole site:** if the site core can't start, every YouTube feature is not working.
- **Clearing:** a status clears when the job next succeeds, or on reload when the check passes. There's no manual reset.

**YT-BRK-02: the in-page notice.**
- **When:** once per browser session per feature, at the moment the feature would act: when its buttons would be drawn (the first hover over a card), when the watch-page button would be placed, when auto-add would arm, at a right-click, or when a key is pressed.
- **Where:** in the first visible tab where the problem is found.
- **Batching:** features found within 60 ms share one notice, which names them by their full feature names (YT-GEN-01), e.g. "Quick-save on thumbnails and Queue button on thumbnails aren't working right now because YouTube changed something. Use YouTube's own buttons for now." (R75)
- **Behaviour:**
  - It's the failure toast made sticky: it stays until dismissed with ✕.
  - Its action is **Details**, which opens Settings at Diagnostics.
  - Like any unprompted toast, it waits while the tab is hidden or fullscreen.
  - Show feedback never hides it.
- **A feature that isn't working draws nothing.**

**YT-BRK-03: explicit actions** on something that's not working get that action's own failure toast on every click or key press. Keys stay caught (YT-KEY-26). Ticket 12's unrecognised-answer toast is unchanged.

**YT-BRK-04: auto-add's "can't measure".**
- The first playback in a session shows the YT-AA-41 toast.
- Some playbacks that can't be measured make auto-add partly working.
- 3 in a row with none measured in between *(starting value)* make it not working.
- It's working again after the next playback that can be measured.

**YT-BRK-05: account keys missing.** If `DATASYNC_ID` or `LOGGED_IN` can't be read:
- auto-add, playlist shortcuts and quick-save stop, rather than act on an unknown account;
- the queue button and the card menu carry on.

**YT-BRK-06: copy.**

| Situation | Notice or toast |
|---|---|
| Auto-add | Auto-add isn't working right now because YouTube changed something. Videos you watch aren't being added for now. |
| Playlist shortcuts, quick-save | {Feature} isn't working right now because YouTube changed something. Use YouTube's own Save for now. |
| Add to queue button | The Add to queue button isn't working right now because YouTube changed something. Use YouTube's ⋮ menu for now. |
| Right-click card menu | The right-click menu isn't working right now because YouTube changed something. You'll get the browser's menu for now. |
| Watch-page button | The watch-page button isn't working right now because YouTube changed something. This video's status is still in the toolbar popup. |
| A key pointing at an unrecognised item | Couldn't tell which item you meant. Point at it again, or use the player. This action-neutral wording is shared with YouTube Music and replaces the save-only wording (R4). |
| Account keys missing | Saving isn't working right now because YouTube changed how it shows which account you're using. Nothing is saved, so nothing lands in the wrong account. |
| The whole site | {Product} isn't working on YouTube right now because YouTube changed something. An update should fix it. |

**YT-BRK-07: theme fallback.** If YouTube's theme variables are missing, in-page UI uses a built-in palette picked from YouTube's dark-mode attribute. Diagnostics alone shows this.

---

## 2.14 Keys from any tab

The user approved this on 2026-10-20 (R88). It's the one place 2.0 uses the browser's own keyboard commands; every other key is caught in the page ([ADR-0004](../../../docs/adr/0004-shortcuts-caught-in-page.md), amended). It serves both sites, so its YouTube Music actions also follow [03 §22](03-youtube-music.md#22-keys-from-any-tab).

**YT-ANY-01: the feature.** **Keys from any tab** (`any-tab-keys`) is a feature of its own, off until the user picks it at first run or in Settings › Everywhere. It has no popup row. Its footprint tag is "Keys only, doesn't change the page", and its Show feedback is **on** by default. It has no presets.

**YT-ANY-02: the keys it offers.** Three browser commands, none with a default key. Their names, as the browser's shortcut settings show them:
- "Save the playing song to your quick-save playlist (YouTube Music)";
- "Like or unlike the playing song (YouTube Music)";
- "Save the current video to Watch later (YouTube)".

**YT-ANY-03: setting the keys.** The user sets them in the browser's own shortcut settings: `chrome://extensions/shortcuts` on Chrome, about:addons › Manage Extension Shortcuts on Firefox.
- Settings › Everywhere lists each one with its key, read from the browser, or "No key", and a **Set keys in your browser** button that opens that page.
- The extension never sets, records or clears these keys.
- A key set there is taken by the browser before any page sees it, so the key recorder warns when an in-page shortcut uses the same key (YT-KEY-31).
- Where Chrome's page offers a Global scope for a key, that's the browser's own setting; nothing in 2.0 depends on it.

**YT-ANY-04: which tab a key acts in.** Each key acts in one tab, in a window of the focused window's kind (normal or private), chosen in this order:
1. the focused window's active tab of that site (for Watch later, a YouTube tab with a current video);
2. else the tab of that site playing audio;
3. else the most recently used tab of that site.

Discarded tabs are skipped. The job runs in that tab, as that tab's account, so jobs still run from an open YouTube or YouTube Music tab ([ADR-0001](../../../docs/adr/0001-youtube-access-through-the-users-session.md)). This is the order the popup's Playing now uses (R33, R88).

**YT-ANY-05: what each key does** is what the matching in-page action does:
- **Watch later:** an explicit add of the tab's current video to the account's Watch later, through the add flow (section 2.5): signed in first, then membership, then the add. It's never filtered. A tab with no current video doesn't count (YT-ANY-04).
- **The two YouTube Music keys:** [03 §22](03-youtube-music.md#22-keys-from-any-tab).

**YT-ANY-06: the answer.** A key pressed in another tab gets two answers:
- the toast in the tab that acted, with Undo where the action has one. It waits until that tab is visible (YT-ADD-20). Show feedback hides it if it's a confirmation;
- for 3 s, a ✓ (done, or already in) or a ✕ (failed, or nothing to act on) on the toolbar icon of the focused tab, with the answer's text as its tooltip, e.g. "Saved “{title}” to Watch later". This shows whatever Show feedback says, like a button's own state, and over anything else on the icon. Then the icon returns to what it showed.

With no tab to act in, only the ✕ and its tooltip show: "No YouTube tab is playing a video." or "No YouTube Music tab is open."

**YT-ANY-07: off costs nothing, honestly.**
- The three commands can only be declared in the manifest. So they're listed, without keys, in the browser's shortcut settings even while the feature is off, and on installs that never use it. No key is reserved until the user sets one, and declaring them shows no prompt on either browser.
- While the feature is off, held or waiting for consent, the background ignores a command: it reads nothing, injects nothing and answers nothing, as a switched-off in-page shortcut does. Its Settings card says: "These keys stay listed in your browser's shortcut settings, and do nothing while this is off."
- It registers no page script. On a key, the background injects the site's page half, core and kit into the chosen tab if that tab has none, runs the job there, and the injected code stays inert until the tab reloads ([04](04-features-accounts-data.md) FT-59).

**YT-ANY-08: what it needs.**
- **Consent**, like every feature (YT-GEN-03).
- **YouTube Music access (Chrome):** switching the feature on asks for it in the same click ([04](04-features-accounts-data.md) FT-44). If it's denied, the feature still goes on, and the two YouTube Music keys answer ✕ "No access to YouTube Music." until access is given (as R71).
- **The YouTube Music section switch:** while it's off, the two YouTube Music keys answer ✕ "YouTube Music is off in {Product}." (R1).

**YT-ANY-09: private windows.** In a private window, a key acts only on that window kind's tabs, and only where the user allows the extension. Nothing from the session is stored (YT-GEN-10).

---

## 2.15 Save from the browser's menu

The user approved this on 2026-10-20 (R91): a quick-save for people who want YouTube's page untouched.

**YT-BM-01: the feature.** **Save from the browser's menu** (`browser-menu`) is a YouTube feature, off until the user picks it. Its footprint tag is "Doesn't change the page", and its Show feedback is **on** by default. It uses YouTube's quick-save playlist, shared with quick-save on thumbnails and the watch-page menu.

**YT-BM-02: where the entry shows.** While it's on, the browser's own right-click menu on youtube.com shows **Save to ▸**:
- on a link to a video or a Short, such as a card's thumbnail or title;
- on a watch page or a Short, anywhere the browser's menu opens, for the current video.

It never shows on music.youtube.com, where Quick actions does this job, or outside youtube.com.

**YT-BM-03: its items.** They're the same everywhere, because the menu can't be rebuilt per tab before it opens on Chrome:
- **Quick-save playlist:** saves to this account's quick-save playlist. With none set, it opens the picker in choose mode (YT-PK-09).
- **Watch later:** saves to the account's Watch later.
- **Choose a playlist…:** opens the playlist picker in the page, placed as the picker key places it (YT-PK-12).

**YT-BM-04: what it does.** Each item is an explicit add through the add flow (section 2.5), in the tab where the menu opened, as that tab's account. It's never filtered, always answers, and its toast carries Undo. The video is the link's video, else the current video. Signed out, it answers with the sign-in failure (YT-GEN-08).

**YT-BM-05: with the card menu on.** Right-click for the video menu replaces the browser's menu on cards with YouTube's ⋮ menu (YT-CM-02). So Save to ▸ shows on cards only with Shift+right-click, or on the links the card menu leaves to the browser (YT-CM-03). It always shows on the watch page.

**YT-BM-06: feedback.** Its toasts are the add flow's (section 2.5.2), with its own Show feedback. The toast names the playlist.

**YT-BM-07: the permission.** The entry needs the browser's `contextMenus` permission, which is optional and asked for only when the feature is switched on.
- It's requested first, in the same click: the switch in Settings or the popup, or first run's Agree.
- Neither browser shows a prompt for it, so switching on looks no different. It adds no install or update prompt.
- Switching the feature off removes the entry and gives the permission back, so while it's off the permission isn't held at all.
- **Without it** (the feature arrived by sync, or the user removed the permission in the browser), the feature is held with "Needs your OK" and **Allow**, which asks for it ([04](04-features-accounts-data.md) FT-13).

**YT-BM-08: page code.** It registers no page script. A save injects the page half, core and kit into that one tab if it has none, as keys from any tab do (YT-ANY-07), and the picker loads on demand (YT-PK-11).

**YT-BM-09: private windows.** The entry shows there only where the user allows the extension, and saves as any explicit add does there (YT-GEN-10).

---

## 2.16 Gather tabs

The user approved this on 2026-10-20 ([ticket 31](../issues/31-gathertube.md); R120): a port of every capability of [GatherTube](https://github.com/karimelgazar/gathertube) by Karim Elgazar (MIT), which is no longer maintained, with exactly two additions: gathering into a playlist the user picks, and gathering by itself. Nothing of GatherTube's is copied. Its full inventory and where each item went are [09 §4](09-parity.md#4-gathertube); the research is [`docs/research/gathertube.md`](../../../docs/research/gathertube.md).

### 2.16.1 The feature and what it gathers

**YT-GT-01: the feature.** **Gather tabs** (`gather`) is a YouTube feature, off until the user picks it. Its footprint tag is "Doesn't change the page", and its Show feedback is **on** by default. It has a row in the popup's YouTube tab, a card in Settings › YouTube and a row at first run. Its options, shared by every account except the gather playlist:

| Option | Choices | Default |
|---|---|---|
| Gather into | YouTube's player, YouTube's queue, A playlist | YouTube's player |
| The gather playlist (per account, YT-GT-16) | Any playlist the account can add to | None |
| Order | Newest tabs first, Oldest tabs first, English videos first, Non-English videos first, Tabs from left to right, Tabs from right to left, Shuffled | Newest tabs first |
| Close gathered tabs | On, off | Off |
| Automatically (YT-GT-22) | Three choices, each on or off, with a time and a count | All off; a day; 10 tabs |
| Show feedback | On, off | On |

(R120, R137)

**YT-GT-02: what a gather does.** One action, Gather, collects the video tabs open in one window, puts their videos in the chosen order with each video once, and sends them to the destination: YouTube's player, YouTube's queue, or the gather playlist. With Close gathered tabs on, the tabs close once their videos are safely there. A gather is started from the popup (YT-GT-34), or by automatic gathering (section 2.16.5). (R120)

**YT-GT-03: video tabs.** A **video tab** is a tab on:
- a youtube.com watch page (`/watch?v=ID`, with or without `list=` or `t=`, which are dropped) or live page (`/live/ID`);
- a music.youtube.com watch page, while the YouTube Music section is on and has site access ([04](04-features-accounts-data.md) FT-06, FT-44).

Only the tab's address counts. (R121)

**YT-GT-04: what isn't gathered.**
- Shorts, embeds, channels, playlists, feeds, search and every other YouTube page.
- A tab whose address isn't a video's, whatever its title says. GatherTube guessed IDs from titles, and gathered, and could close, Reddit threads, news articles and channel pages; 2.0 doesn't.
- m.youtube.com tabs, which 2.0 doesn't cover and Chrome can't see.
- A `youtu.be` tab that hasn't reached youtube.com yet. A loaded one is already on a watch page.
- Tabs parked by a suspender extension under its own address. Reading those would need the `tabs` permission, whose "Read your browsing history" warning every user would see. The browser's own sleeping tabs (Chrome's Memory Saver, Firefox's unloaded tabs) keep their address and are gathered. (R121)

**YT-GT-05: gathered tabs are only read.** A gather reads each tab's address, title, place and when it was last switched to, and nothing else. It never messages, injects into, activates, reloads or wakes a tab it gathers. (R121)

**YT-GT-06: one window.** A gather reads only the window it was started from: the popup's own window, or, for automatic gathering, the window it's looking at. Any tab it opens opens in that window, and only that window's tabs close. Gathering from every window isn't offered, as GatherTube removed it. (R121)

**YT-GT-07: each video once.** A video open in several tabs is gathered once, at its first place after ordering. All its tabs close together. (R121)

### 2.16.2 Orders

**YT-GT-08: the orders.** GatherTube's six, plus Shuffled (the user's choice, so GatherTube's shuffle survives):

| Order | Puts first |
|---|---|
| Newest tabs first (default) | The tab switched to most recently; a tab never switched to counts from when it was opened |
| Oldest tabs first | The tab switched to longest ago |
| English videos first | Videos whose titles are in English (YT-GT-09) |
| Non-English videos first | Videos whose titles are in other languages (YT-GT-09) |
| Tabs from left to right | The leftmost tab |
| Tabs from right to left | The rightmost tab |
| Shuffled | A new random order each gather |

(R122)

**YT-GT-09: language orders.** English first and non-English first ask the browser's own language detection about each tab's title, without YouTube's " - YouTube" or " - YouTube Music" ending and the "(3) " notification count. Videos fall into three groups: English, no answer, then other languages. Non-English first reverses the groups. Within a group, tabs keep their left-to-right order. GatherTube's "mostly Latin letters" test, which counted Spanish, German and French titles as English, is gone. (R122)

**YT-GT-10: Shuffled.** Each gather shuffles anew, so gathering the same tabs twice gives two orders. YouTube's player also keeps YouTube's own Shuffle button. (R122)

### 2.16.3 Destinations

**YT-GT-11: three destinations.** **YouTube's player**, the default, as GatherTube's "YouTube Native"; **YouTube's queue**, in place of GatherTube's embedded player page; and **A playlist**, the gather playlist. The embedded player page doesn't come back in any form: extension pages get YouTube's Error 153, and embedding YouTube's player would put all of 2.0 under YouTube's API policies, which forbid the requests it's built on ([ADR-0001](../../../docs/adr/0001-youtube-access-through-the-users-session.md)). (R123)

**YT-GT-12: YouTube's player.** Up to 50 videos open as YouTube's own temporary list ("Untitled List"), in a new tab at the end of the window, which becomes the active tab. YouTube's watch page plays the list through, with its own Shuffle, Loop, next and previous. It needs no sign-in, and nothing of ours runs in that tab. (R123)

**YT-GT-13: more than 50 for YouTube's player.** YouTube keeps only the first 50 videos of such a list and silently drops the rest; GatherTube then closed the dropped videos' tabs too. A gather of more than 50 for YouTube's player goes to YouTube's queue instead, and its result says so (YT-GT-32). (R123)

**YT-GT-14: YouTube's queue.**
- The first video opens in a new tab at the end of the window, which becomes the active tab. Once it has loaded, the rest are added to YouTube's queue with one command, in gather order, the way YouTube's own Add to queue adds a video. If the tab hasn't loaded within 10 s, nothing is added and nothing closes.
- YouTube's queue panel then holds the list, with its own reorder, remove, clear and play now. It doesn't survive a reload, as YouTube's queue never does.
- It needs no sign-in.
- **Up to 200 videos a gather.** Beyond that, the first 200 in gather order go, the rest stay open, and the result says how many. PROVISIONAL (ticket 25: G3; 100 were tested signed out). (R123)

**YT-GT-15: a playlist.** The videos go into the account's gather playlist, through the add flow (section 2.16.4). Nothing opens. (R123, R125)

**YT-GT-16: the gather playlist.** Each account has at most one, in its account setup ([04](04-features-accounts-data.md) ACC-06).
- It's chosen with the usual chooser, Watch later and New playlist included, in the popup and Settings.
- A gather into a playlist, or switching on an automatic option, with no gather playlist for the account in view opens the chooser first, with "Choose a gather playlist for {Account} first." The gather starts once one is picked.
- It can be marked *Missing* or *Full*, with **Remove**, like any chosen playlist (YT-ADD-36).
- In a private window it can't be changed, because it's part of the account setup (YT-GEN-10). The chooser is disabled there, with "The gather playlist can't be changed in a private window." (R125)

**YT-GT-17: closing gathered tabs.** With **Close gathered tabs** on, a gather closes its tabs once their videos are confirmed in the destination, never before:
- **YouTube's player:** once the new tab's address shows YouTube's list, within 10 s. Otherwise nothing closes, and the result says so;
- **YouTube's queue:** once the queue panel holds every video sent. Otherwise nothing closes;
- **a playlist:** each video's tabs close once it's *added* or *already in*. A failed video's tabs stay open.

All its tabs close at once. As in GatherTube, the tab the user is on closes too if it's a video tab. Automatic gathering always closes what it saved, whatever this option says (YT-GT-22). (R124)

### 2.16.4 Gathering into a playlist

**YT-GT-18: one add flow, as a batch.** A gather into a playlist is the add flow (section 2.5), run once for all its videos, from one serving tab of the account ([06](06-architecture.md) ARC-ACC-73):
1. **Signed in.** Otherwise: "Sign in to YouTube to gather into a playlist." with **Sign in**, and nothing closes.
2. **The gather playlist** of that account (YT-GT-16).
3. **Membership read and account guard,** for each video in turn (YT-ADD-06, YT-ADD-10). *Already in* is settled here.
4. **The adds,** in gather order, in batches, up to 50 videos per request. PROVISIONAL (ticket 25: G1, G2).
5. **One report** (YT-GT-19).

It's never filtered and never skipped: channel filters and session skips belong to auto-add. A video is never added twice (YT-ADD-05). New videos go at the end of the playlist, in gather order; a playlist YouTube sorts by date or popularity shows YouTube's order. (R126)

**YT-GT-19: one report.** Each video ends *added*, *already in* or *failed*, and the gather reports them together, saves first: "Saved 9 videos to Later. 2 were already in it. Couldn't save 1: YouTube doesn't allow saving it." Long gathers show their progress ("Checking 12 of 40…"). The popup may close meanwhile; the gather still finishes, and its result shows as YT-GT-31 says. (R126, R134)

**YT-GT-20: failures.** A failure affects only its own videos, whose tabs stay open.
- **YouTube refuses a video** (made for kids, private, removed): that video fails.
- **No answer, or offline:** the videos not yet confirmed fail. They're never sent again by themselves (YT-ADD-35).
- **Rate-limited (HTTP 429):** the account pauses for 60 s, and the rest fail (YT-ADD-37).
- **Missing or Full playlist:** every video fails, and the playlist is marked (YT-ADD-36).
- **Account changed in another tab:** nothing is written, and that tab refuses until it reloads (YT-ADD-10). A gather from the popup tries the next serving tab.
- **Try again** reruns a gather's failed videos from the membership read, so nothing is doubled. It's offered in the popup row.
- **Two adds of one video at once,** such as auto-add and a gather, end with one add; the later reads *already in* (YT-ADD-40). (R126)

**YT-GT-21: Undo.** A gather into a playlist can be undone:
- Undo removes exactly the entries that gather added (YT-ADD-31), after one membership read for the account guard, and reopens the tabs it closed, at their old places in their window, in the background. If that window has closed, they open in a new window. Undoing only the add would leave the videos neither in the playlist nor open.
- Tabs Undo reopened are left out of automatic gathering until the user switches to them.
- It's offered until the browser closes, for the last 5 gathers: the popup row and the Settings card offer it for the newest gather, and a gather's own toast for its gather. The undo key runs it on that toast (YT-KEY-25).
- If Undo fails anywhere, it reads "Couldn't undo." and reopens nothing.
- A gather into YouTube's player or queue has no Undo, as in GatherTube: the videos are safe in the list, and YouTube's panel removes them. (R127)

### 2.16.5 Automatic gathering

**YT-GT-22: three choices, each its own.** Gather tabs can also gather by itself. The user picks any of three triggers, each switched on by itself, all **off** by default:
1. **Unvisited for a while** (YT-GT-23);
2. **Opened in the background** (YT-GT-24);
3. **A window reaching N video tabs** (YT-GT-25).

Every one of them:
- saves into the gather playlist only, whatever "Gather into" says, through the add flow (section 2.16.4);
- always closes the tabs it saved, whatever Close gathered tabs says, because filing a tab without closing it isn't gathering;
- never opens a tab, never touches a tab it doesn't gather, and never runs in a private window.

Automatic gathering is the second way videos are added without an explicit action, after auto-add. Closing a window isn't a trigger: by then the browser no longer says which tabs were in it. (R128)

**YT-GT-23: unvisited for a while.** Video tabs the user hasn't switched to for at least the chosen time: 1 hour, **1 day** (the default) or 1 week. A tab never switched to counts from when it was opened.
- No timer checks for them. They're looked for when {Product} is woken anyway: when one of its YouTube features loads in a page, when the popup or Settings opens, or when the browser starts. At most once a minute, across every normal window.
- So a tab can be gathered late, by hours if {Product} isn't woken. The option says so (YT-GT-32). (R129)

**YT-GT-24: opened in the background.** A video tab that loads without being shown, as a middle-clicked video does, is gathered a second after it loads, unless the user has switched to it by then.
- Only a tab's first load counts: a reload, or going back or forward, doesn't.
- Tabs the browser restores at start aren't tabs the user opened. Tabs that load in the first minute after the browser starts are never gathered this way. PROVISIONAL (ticket 25: G6).
- So a middle-click files that video into the gather playlist and closes its tab. The option says so. (R130)

**YT-GT-25: a window reaching N video tabs.** When a video tab loads and its window then holds **N** or more video tabs that automatic gathering may take (YT-GT-26), it gathers all of them. The tab the user is on stays.
- **N** is 5, 10, 15, 20, 30 or 50; **10** by default. Ten is well above the few videos someone opens to watch next, so ordinary browsing doesn't trip it.
- It's checked only when a video tab loads in that window. A window already over N when the option is switched on is gathered when its next video tab loads. (R131)

**YT-GT-26: never gathered automatically.**
- The active tab of any window.
- Pinned tabs.
- Tabs playing sound.
- Any tab in a private window.
- Tabs a gather's Undo reopened, until the user switches to them.
- A video that failed this session for a lasting reason, such as YouTube refusing it. Its tabs stay open.

(R132)

**YT-GT-27: when it runs.**
- **One gather per burst.** Video tabs that arrive together in a window are gathered once, a second after the last of them, and at most 10 s after the first.
- **At most once a minute per window.** A burst that arrives sooner waits for the next time {Product} is woken after that minute.
- **At most 50 videos a gather.** More wait for the next one.
- When more than one trigger is on, one gather in a window takes what each of them picks. (R132)

**YT-GT-28: where it saves from.** Automatic gathering saves from a signed-in YouTube tab that isn't being gathered: the focused window's active tab first, then the gathering window's YouTube tabs, then other normal windows', most recently used first. That tab's account's gather playlist receives the videos.
- An account with no gather playlist is passed over.
- With no such tab, nothing is gathered and nothing closes, and the popup row says "Waiting for a signed-in YouTube tab to save from." The next check tries again. (R132)

**YT-GT-29: when it fails.**
- A failed video's tabs stay open (YT-GT-20). A lasting failure leaves that video out for the rest of the session (YT-GT-26); a passing one, such as no answer or a 429, is tried again at the next gather.
- A gather playlist marked *Missing* or *Full* stops automatic gathering for its account until the mark clears or the user chooses another playlist. The toolbar's "!" already says a chosen playlist needs attention ([04](04-features-accounts-data.md) FT-57).
- Its failure toasts are limited as auto-add's are (YT-ADD-25): a Missing or Full gather playlist once per browser session, YouTube refusing a video once per session, and nothing more during a 429 pause. (R132, R134)

**YT-GT-30: private windows.** A gather the user starts in a private window gathers that window's tabs, where the user allows the extension there, and saves as any explicit add does there (YT-GEN-10): its Undo is kept in memory only, and it isn't listed in Recent adds. Automatic gathering never runs in a private window and never counts its tabs. (R132, R135)

### 2.16.6 Feedback, keys and copy

**YT-GT-31: where a result shows.**
- **A gather started in the popup** answers in its row, never as a toast: progress, the result with **Undo**, and failures with their fix. That's the control's own state, so Show feedback never hides it (YT-ADD-12).
- **When the popup has closed first** (YouTube's player and queue open a tab, which closes it; a long gather into a playlist can outlast it), **and for every automatic gather,** the result shows:
  - for a gather into a playlist, as the add flow's toast, with **Undo**, in the tab it saved from. That tab is picked visible first (YT-GT-28), so the toast usually shows at once; otherwise it waits until the tab is visible (YT-ADD-20). An automatic gather's toast is one the user didn't ask for: it carries the extension's mark and waits while fullscreen (YT-ADD-17, YT-ADD-21);
  - as a ✓ or ✕ on the focused tab's toolbar icon for 3 s, with the result as its tooltip, when the gathering window is focused. It's the mark keys from any tab use (YT-ANY-06);
  - in the popup row and the Settings card, as "Last gather", until the next gather or the browser closes;
  - for a gather into a playlist, as one entry in Recent adds ([04](04-features-accounts-data.md) DATA-52).
- **Show feedback** hides only confirmations: the toast and the ✓. Failures, their toast and the ✕ always show.
- Gather tabs sets no "!" of its own. (R134)

**YT-GT-32: results.**

| Situation | Popup row | Toast, when there is one | Action |
|---|---|---|---|
| Into YouTube's player | Gathered {n} videos into YouTube's player. | — | — |
| More than 50 for YouTube's player | Gathered {n} videos into YouTube's queue: YouTube's player takes 50. | — | — |
| Into YouTube's queue | Gathered {n} videos into YouTube's queue. | — | — |
| Over YouTube's queue's 200 | Gathered 200 videos into YouTube's queue. {m} tabs stay open: it takes 200 at a time. | — | — |
| Into the gather playlist | Saved {n} videos to {Playlist}. {m} were already in it. | Gathered {n} videos into {Playlist} | Undo |
| Into the gather playlist, tabs closed | Saved {n} videos to {Playlist} and closed their tabs. | Gathered {n} videos into {Playlist} and closed their tabs | Undo |
| Automatic | Gathered {n} videos into {Playlist} by itself, {2 h ago}. | Automatically gathered {n} videos into {Playlist} and closed their tabs | Undo |
| In progress | Checking {i} of {n}… / Saving {n} videos… | — | — |
| No video tabs in the window | No YouTube videos are open in this window. | — | — |
| No gather playlist yet | Choose a gather playlist for {Account} first. | — | The chooser opens |
| Automatic, waiting | Waiting for a signed-in YouTube tab to save from. | — | — |
| Undone | Removed {n} videos from {Playlist} and reopened their tabs. | (the toast closes) | — |
| "Last gather" line | Last gather: {n} videos into {destination}, {5 min ago} | — | Undo, while it's offered |

Counts read "1 video", "2 videos"; `{Playlist}` follows YT-ADD-18. Into the gather playlist, "{m} were already in it." shows only when some were. (R137)

**YT-GT-33: failures.** These always show.

| Situation | Popup row, or toast | Action |
|---|---|---|
| Some videos failed | Saved {n} videos to {Playlist}. Couldn't save {m}: {reason}. Their tabs stay open. | Try again (popup row) |
| YouTube refuses a video | …Couldn't save 1: YouTube doesn't allow saving it. | — |
| Rate-limited | Couldn't save {m}: YouTube is limiting requests, so try again in a minute. Their tabs stay open. | — |
| Missing gather playlist | Couldn't gather into {Playlist}: it doesn't exist anymore. No tabs were closed. | Choose (popup); Settings (toast) |
| Full gather playlist | Couldn't gather into {Playlist}: it's full. No tabs were closed. | Choose (popup); Settings (toast) |
| Signed out | Sign in to YouTube to gather into a playlist. | Sign in |
| No YouTube tab to save from (from the popup) | Open YouTube to gather into a playlist. Nothing was closed. | Open YouTube |
| YouTube's player showed no list in 10 s | Couldn't confirm YouTube made the list, so no tabs were closed. | — |
| YouTube's queue didn't take every video | Couldn't confirm all {n} videos reached YouTube's queue, so no tabs were closed. | — |
| The queue tab didn't load in 10 s | Couldn't build YouTube's queue: its tab didn't load in time. No tabs were closed. | — |
| Undo failed | Couldn't undo. | — |
| A destination isn't working (YT-GT-36) | Gathering into {YouTube's player \| YouTube's queue \| a playlist} isn't working right now because YouTube changed something. | — |

**Settings** opens Settings at the gather playlist (`#feature-gather&playlist=<playlistId>`, YT-ADD-29). (R137)

**YT-GT-34: keys.**
- **In the popup,** Enter gathers while Gather tabs is on and nothing in the popup has focus, which is how it opens. Enter on a focused control keeps its own meaning. It's our own page, so it's no in-page shortcut ([ADR-0004](../../../docs/adr/0004-shortcuts-caught-in-page.md)).
- **On YouTube,** none of ours. YouTube's own Shift+N and Shift+P step through YouTube's list. GatherTube's player-page keys lived on a page that doesn't come back.
- No browser command gathers. (R123)

**YT-GT-35: credit.** Gather tabs credits GatherTube where users look: "Based on GatherTube by Karim Elgazar" on its Settings card, linking to `https://github.com/karimelgazar/gathertube`, and a line in Settings › About ([05](05-ui.md) UI-SET-24, UI-SET-18). The name "GatherTube" appears only as credit, never as the feature's name or icon. The listings and release notes credit it too ([08](08-release.md) REL-STORE-38). (R138)

**YT-GT-36: when YouTube changes something.** Gather tabs' status follows its destinations ([04](04-features-accounts-data.md) HEALTH-29):
- **not working** while YouTube's player can't be reached: its tab keeps showing no list ([07](07-quality.md) Q-WATCH-24's `no-effect`);
- **partly working** while YouTube's queue or the playlist route isn't working; YouTube's player still works.

A gather into a destination that isn't working answers with YT-GT-33's line, and nothing closes. (R136)

---

## Superseded earlier text

Later amendments and main-session decisions take precedence. These were applied above, and are listed so nobody restores the older text:

- **Queue button Show feedback:** on, not off (ticket 12 → ticket 14's recommendation → ticket 15's decision).
- **Queue button Undo:** the button gets Undo, and adds are quiet (ticket 12's "no undo on YouTube" → ticket 29 amendment).
- **The undo key:** it works whenever a toast with Undo is on screen, whichever feature raised it (ticket 08's "only while a shortcut feature is on" → R2). It belongs to no feature: it's preset to Alt+U at install and set in Settings › Everywhere (ticket 08's shortcuts preset → R44).
- **Once-per-session toasts:** they apply to auto-add only, and explicit actions answer every time (ticket 12's limits, which ticket 14 applied to quick-save clicks → R22).
- **A shortcut with no playlist:** "{Shortcut} has no playlist on {Account} yet." with **Choose** (tickets 11 and 12's "… Choose one in the popup." → ticket 14's Choose action → R24).
- **A shortcut's Choose pick:** it saves the item as well as setting the shortcut's playlist, and its toast carries Undo, on both sites (→ R45).
- **The "has no playlist" toast:** a neutral hint that always shows (→ R56).
- **The order of checks:** signed in comes before "has a target" (ticket 12's order → ticket 11 → R25).
- **Signed out, auto-add stays silent:** R3's list of actions that show the sign-in toast named auto-add (R3 → R41).
- **"On Shorts too":** off by default (ticket 14's "on" → R11).
- **The watch-page button's Show feedback:** it has one, on by default, for its menu's Save rows. The chapters' first draft gave it none, because its rows answer in place (→ R27 → R42).
- **Pause:** until resumed or the browser restarts, and an extension update also ends it ("or the browser closes" → R57).
- **The picker's pin in a private window:** its tooltip says "Quick-save playlists can't be changed in a private window." (ticket 14's "Private windows don't save settings" → R58's "Changes made here are saved; nothing about this window's browsing is." → R69).
- **The watch-page button's "Couldn't save “{title}”. Try again.":** it's the status line when auto-add failed; a failing Save row answers with the add flow's failure toast (R27's generic failure, which 05 also used for a Save row → R70).
- **Batched not-working notices:** they use full feature names, "Quick-save on thumbnails and Queue button on thumbnails…" ("Quick-save and the Add to queue button…" → R75).
- **Playlist shortcuts switched on with YouTube Music access denied:** it goes on and "Also on YouTube Music" turns off (FT-52's "that switch stays off", which would have kept a YouTube feature off → R71).
- **"Also on YouTube Music" without access:** the row reads "Needs site access", and the "!" shows while it and Playlist shortcuts are on (this chapter's first draft: "Needs access to YouTube Music", and no badge → R53, 04 FT-13).
- **The 1.x shortcut's upgrade-note copy:** 08's wording and conditions (→ R60).
- **Copy:** typographic quotes, “{title}” (straight quotes → R45), and `{Product}` for the extension's name (`{Extension}` → R65).
- **The key recorder's look and copy:** keycaps with ×, and "Press keys…" with "Esc to cancel" (ticket 08's Change and Clear buttons and "Press a key combination…" → ticket 15, as 05 UI-PICK-23 has it).
- **The unrecognised-item copy:** action-neutral (ticket 18's save-only wording → R4).
- **Watch-page button slot:** after Share, before Save (ticket 09's "after Save" → ticket 14).
- **Watch-page button at narrow widths:** it hides where even its icon would push Save into "…" (ticket 14's runner-up → main-session decision).
- **Our Add to queue button stays,** stepping aside where YouTube draws its own (ticket 14's open question → main-session decision).
- **Made-for-kids quick-save:** the button is drawn, and a click is refused (ticket 12's "not drawn if detectable" → ticket 14: not detectable).
- **Channel source:** a page read, then a page-data request, with no Data API `videos.list` and no `storage.session` channel cache (channel-filters spec → tickets 10 and 16).
- **Typed channels:** `/c/` is accepted, and resolved through YouTube's URL resolution instead of `channels.list` (channel-filters spec → tickets 01 and 10).
- **Filter feedback:** follows YT-ADD-27 and YT-ADD-28. The unknown-channel toast now shows even with Show feedback off (channel-filters spec → ticket 12).
- **Filter order:** filters run before the duplicate check (1.5.0 and the channel-filters spec → ticket 12).
- **Watch-page labels:** ticket 07's draft copy → ticket 14's final in-page copy.
- **Unticking in the picker:** it removes, and its toast carries Undo (PROVISIONAL "if approved / if declined" → R84).
- **The toolbar tick:** on by default, beside "paused" on the icon, also on (R11's "off until D10" → R92).
- **Keys only in pages:** still true for every shortcut, but the user approved keys from any tab, three browser commands with no default key (ADR-0004's "no commands but `_execute_action`" → R88).

## Resolved during assembly

Every conflict and gap this chapter raised in its earlier drafts, apart from N13, was settled while the spec was assembled ([resolutions.md](resolutions.md)). The requirements above state the resolved behaviour.

- **C1. Rate limits against "explicit actions always answer":** the once-per-session limits apply to auto-add only (R22; YT-ADD-25, YT-ADD-37, YT-QS-08).
- **C2. A skipped outcome against undoing the skip:** a session skip doesn't count as auto-add having run, and undoing it checks the goal at once (R23; YT-AA-04, YT-AA-36).
- **C3. The shortcut no-target copy:** "{Shortcut} has no playlist on {Account} yet." with **Choose** (R24; YT-KEY-13).
- **C4. The order of checks on a signed-out page:** signed in comes first (R25; YT-ADD-02).
- **C5. An unknown channel's outcome:** *filtered out*, with its own toast (R26; YT-CF-18).
- **N1. The queue button after Undo:** back to idle and clickable (R27; YT-Q-09).
- **N2. "On Shorts shelves too":** off by default (R11; YT-QS-01).
- **N3. The watch-page menu's Save rows:** they belong to the watch-page button and use its Show feedback (R27; YT-WB-07, YT-WB-09).
- **N4. Mixed auto-add toasts:** "Auto-added … to {n} playlists · filtered out of {m}" with Undo, and an unknown channel counts as filtered out (R26, R27; YT-ADD-15, YT-CF-18).
- **N5. Auto-add when membership can't be read:** its copy is given; the proceed rule stays PROVISIONAL on L6 (R27; YT-ADD-07, YT-ADD-28).
- **N6. The confirmation after choosing a shortcut's playlist:** "{Shortcut} now saves to “{Playlist}”." (R24; YT-KEY-13).
- **N7. Show feedback for the picker key's choose mode:** Playlist shortcuts' switch (R24; YT-PK-09).
- **N8. Typed-channel errors:** 1.5.0's wording (R27; YT-CF-16).
- **N9. The watch-page button's generic failure:** "Couldn't save “{title}”. Try again.", the Failed state's status line when auto-add failed other than offline (R27, read per R70; YT-AA-38).
- **N10. Videos shorter than 3 s:** the goal is capped at the length, and the 2 s slack applies only from 3 s (R27; YT-AA-17).
- **N11. The card menu's not-working notice:** a kit-free notice in the site core (R28; YT-CM-05).

- **C6. Where the undo key is set:** it belongs to no feature. It's preset to Alt+U at install and set in Settings › Everywhere, which shows whenever any feature on either site is on (R44; YT-KEY-01, YT-KEY-02, YT-KEY-05, YT-KEY-33).
- **C7. What a shortcut's Choose pick does:** it sets the shortcut's playlist and saves the item, and the toast carries Undo, on both sites (R45; YT-KEY-13, YT-PK-09). [03](03-youtube-music.md) YM-PS-4 and [05](05-ui.md) UI-PICK-18 now say the same.
- **C8. Whether the watch-page button has a Show feedback switch:** it does, on by default, and it covers its menu's Save rows (R42; YT-ADD-13, YT-WB-01, YT-PK-09). [04](04-features-accounts-data.md) FT-01 and FT-23 now agree. The signed-out half is settled too: a Save row answers with the sign-in failure toast, as every explicit action does, while auto-add stays silent (R3, R41; YT-GEN-08, YT-WB-09).
- **N12. The watch-page button's Show feedback default:** on (R42; YT-ADD-13, YT-WB-01).

Also applied, first round: R1 (YT-GEN-11, YT-KEY-15), R2 (YT-KEY-05, YT-KEY-25), R3 (YT-GEN-08, YT-ADD-02, YT-WB-09), R4 (YT-BRK-06), R6 (YT-KEY-34, by analogy), R7 (YT-ADD-22, YT-KEY-24), R21 (YT-AA-43, YT-KEY-33), R32 and R38 (YT-ADD-29, YT-WB-07, YT-KEY-11), R39 (YT-PK-01, YT-PK-02, YT-PK-13, YT-PK-14) and R40 (YT-Q-05).

Also applied, second round:
- R41 (YT-GEN-01, YT-GEN-08, YT-ADD-02, YT-ADD-28, YT-QS-09, YT-WB-09);
- R42 (YT-ADD-12, YT-ADD-13, YT-PK-09, YT-WB-01, YT-WB-09);
- R43 (YT-AA-36);
- R44 (YT-GEN-01, §2.8's opening, YT-KEY-01, YT-KEY-02, YT-KEY-05, YT-KEY-15, YT-KEY-25, YT-KEY-33);
- R45 (YT-ADD-18, every quoted title in copy, YT-ADD-27, YT-ADD-29, YT-PK-09, YT-KEY-13);
- R50 (YT-BRK-01);
- R51 (YT-ITEM-07, YT-ITEM-08, YT-Q-05, §2.13's opening);
- R53 (YT-KEY-15);
- R54 (YT-GEN-06);
- R55 (YT-ADD-10, YT-ADD-25, YT-ADD-28);
- R56 (YT-ADD-02, YT-ADD-12, YT-ADD-27, YT-KEY-13);
- R57 (YT-AA-03, YT-AA-04, YT-AA-05);
- R58 (YT-GEN-10, YT-PK-08);
- R60 (YT-GEN-02, YT-AA-43, YT-KEY-33);
- R65 (the placeholders; `{Product}` in YT-AA-38, YT-WB-03, YT-WB-07 and YT-BRK-06).

The other second-round resolutions don't touch this chapter's topics.

Third round:
- **C9. The watch-page button's Show feedback in 05** (was Conflict): [05](05-ui.md) UI-SET-10 and UI-YT-22 now give the button Show feedback, on by default, covering its menu's Save rows (R42). Fixed in 05.
- **C10. The watch-page button's "generic failure"** (was Conflict): "Couldn't save “{title}”. Try again." is the Failed state's status line when auto-add failed. The menu's Save rows are explicit saves, so a failing row shows "Couldn't save" in place and answers with the add flow's failure toast (R70; YT-AA-38, YT-WB-09).
- **C11. The picker pin's private-window tooltip** (was Conflict): "Quick-save playlists can't be changed in a private window.", in 02, [03](03-youtube-music.md) and [05](05-ui.md) (R69; YT-PK-08).
- **C12. Creating a playlist with the video in it** (was Conflict): [06](06-architecture.md)'s `create` job takes `{ title, privacy, videoId? }` and creates the playlist with that video in it in one request, and PickerModel's `create(title, privacy)` puts the picker's item in the new playlist (YT-NEW-01, YT-ADD-39). Fixed in 06.
- **C13. This chapter's copy quoted elsewhere** (was Conflict): 06's AddFlow now cites YT-ADD-15's copy instead of quoting it, and 08 REL-STORE-21's reviewer step 3 reads "Auto-added “…” to Reviewer A" (YT-ADD-15, YT-ADD-27). Fixed in 06 and 08.
- **C14. The undo key in the upgrade note** (was Conflict): [08](08-release.md) REL-CON-04 now reads "Alt+U undoes a save while its message is on screen." (YT-KEY-25). Fixed in 08.
- **N14. The disabled pin's tooltip in a private window** (was Not pinned down): the tooltip says why the pin is off, "Quick-save playlists can't be changed in a private window." (R69; YT-PK-08).

Also applied, third round:
- R69 (YT-PK-08);
- R70 (YT-AA-38, YT-WB-09);
- R71 (YT-KEY-15);
- R75 (YT-BRK-02);
- R77 (the `{Playlist}` placeholder, YT-ADD-18; no other copy here quoted a playlist name).

R68, R72, R73, R74 and R76 don't touch this chapter's topics. YT-PK-11 now says outright that every explicit open, the picker key included, gets the loader-failure toast, which 06's popovers follow.

After the spec ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)):
- R83 (YT-GEN-10, YT-PK-08, YT-KEY-12): shared-settings changes made in a private window, Watch later's shared choice included, are saved as R58 decided, and are no longer PROVISIONAL on ticket 23's AMO question 3. [08 §13](08-release.md#13-if-an-amo-reviewer-objects) keeps the fallback if an AMO reviewer objects.

The user's decisions of 2026-10-20 ([R84–R99](resolutions.md#the-users-decisions-of-2026-10-20-r84r99)):
- R84 (YT-PK-04, YT-PK-05, YT-PK-09, YT-AA-05, YT-ADD-34): unticking removes, with Undo;
- R86 (YT-ADD-34): Recent adds;
- R87 (YT-AA-24): live streams and premieres keep not counting;
- R88 (YT-GEN-01, YT-GEN-04, YT-KEY-03, YT-KEY-06, YT-KEY-31, §2.14): keys from any tab;
- R91 (YT-GEN-01, YT-GEN-04, §2.6's list, YT-PK-09, §2.15): Save from the browser's menu;
- R92 (YT-AA-42): the toolbar tick and "paused" on the icon;
- R96 (YT-AA-43): never-authorised upgraders get 50 %.

R85, R89, R90, R93 to R95, R97, R98 and R99 change nothing on youtube.com that this chapter states.

GatherTube, folded in on 2026-10-20 ([R120–R139](resolutions.md#gathertube-r120r139)):
- R120 to R137 (§2.16, YT-GT-01 to YT-GT-36; YT-GEN-01, YT-GEN-04, §2.3's opening, §2.5's list, YT-ADD-13): Gather tabs, with the gather playlist and automatic gathering;
- R138 (YT-GT-35): the credit.

R139 changes nothing this chapter states: budgets and tests are [07](07-quality.md)'s.

## Conflicts found

None remain; see [Resolved during assembly](#resolved-during-assembly). Under the resolutions' ownership rule, this chapter owns YouTube behaviour and copy, and the other chapters now follow it.

## Not pinned down

- **N13. Choose mode's title for a shortcut.** The picker's choose-mode title and subtitle, "Save videos to…" and "One click will save here from now on.", fit only the quick-save playlist. No ticket or resolution gives wording for a shortcut's **Choose** (YT-PK-09). [03](03-youtube-music.md#not-pinned-down) and [05](05-ui.md#not-pinned-down) note the same gap.
