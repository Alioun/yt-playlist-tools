# When does auto-add count a video as watched?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)

## Question

What does "watched" mean for auto-add, and what does the user control?

Today, details in inventory.md under "Auto-add":
- It measures the playhead position as a percentage of the duration, checked on every `timeupdate`.
- Seeking past the threshold counts, and a `&t=` start can fire immediately.
- Ads aren't excluded.
- Live streams, premieres and Shorts never fire.
- The miniplayer disarms it.
- There's no on/off switch.

Settle:
- playhead position vs time actually played;
- ads;
- live streams, premieres and stream replays;
- Shorts (approved), given that they loop and are short;
- replays and coming back to a video;
- background tabs and the miniplayer;
- the threshold's range, and whether it's per playlist;
- an on/off switch, and pausing auto-add for one video or session.

Also from [ticket 01](01-youtube-requests.md): Shorts play in `#shorts-player` and loop, so progress wraps to 0. Take the ID from the URL or YouTube's navigation event. Watch the right player, not the first `<video>`, since hover previews have their own player.

## Answer

Decided 2026-10-19 under the user's delegation; judgement calls name their runner-up. Folds in tickets [11](11-accounts.md) and [12](12-adding.md), resolved the same day.

**In one line:** a video is *watched* for an auto-add playlist once the user has actually played that playlist's **required percentage** of the video itself. Each part counts once, at any speed. Ads, skipped parts and jumps don't count. Live streams don't count. Shorts count only for playlists that take them.

Proposed terms (in the reply, not yet in `GLOSSARY.md`): **watch progress**, **required percentage**, **Short**, **session skip**, **paused** auto-add.

### What counts as watched

- **Watch progress, not the playhead.** Progress is the total length of the parts of the video the user has played, each part counted once, divided by the video's length.
  - Why: "watched half" should mean half was watched. 1.5.0's playhead measure fires on a seek, a `&t=` link or YouTube's resume point (inventory, "What counts as watched today").
  - *Runner-up:* the playhead position (today). It lost because it fires without any watching.
  - *Runner-up:* time spent playing (wall clock). It lost because it punishes people who watch at 1.5× or 2×, and it counts the same 10 seconds replayed ten times.
- **Speed doesn't matter.** At 2× a 10-minute video reaches 100 % after 5 minutes, because every part of it played. YouTube offers 0.25–2×, and Premium up to 4×. Other extensions can go up to 16×, and the rule works the same at any speed.
- **Jumps don't count.** None of these count: seeking, clicking a chapter, the arrow keys' 5 s jumps, Premium's "Jump ahead", automatic skips such as SponsorBlock's, a `&t=` start, or YouTube's own resume point. Only what plays through counts.
- **The exact rule:**
  - **Readings:** on each `timeupdate` of the right player's `<video>` (about four a second), read the player's own position (`getCurrentTime()`).
  - **What counts between two readings:** the stretch between them counts if all of these held:
    - the same video was loaded;
    - no ad showed;
    - no seek started;
    - the video was playing;
    - the position moved forward by at most (elapsed time × playback speed) + 1 s.
  - **Gaps:** a gap of 1 s or less between counted stretches counts as played. This absorbs timing jitter and tiny skips.
  - **The goal:** a playlist's goal is `clamp(required % × length, 1 s, length − 2 s)`, so that:
    - 0 % means "as soon as 1 second of the video itself has played";
    - 100 % works, because the last 2 s never block it;
    - a looping Short's wrap back to 0 never matters.
  - **Watched:** the video is watched for a playlist once its counted seconds reach that playlist's goal.
- **When it fires:** the moment progress reaches a goal, during playback, as today. It doesn't wait for the end. With several playlists at different goals, each fires when its own goal is reached.
- **The length** is the player's `getDuration()`, checked against the video's listed length (`videoDetails.lengthSeconds`) where the page has it.
  - While the length is unknown, playback is still counted in seconds, and the goal is checked once the length is known.
  - If the two lengths disagree by more than 2 s, this playback isn't counted (see stitched ads under Ads).
- **Paused, buffering, or YouTube's "Video paused. Continue watching?":** nothing counts, because nothing plays.
- **Same playback, still counts:** muted playback, fullscreen, theatre mode and picture-in-picture.

### Which playback counts

- **Counts:**
  - **The watch page's player** (`/watch`), including videos in playlists and mixes, and autoplayed next videos (parity).
  - **The miniplayer, including queue items played in it.** This is new: today, leaving `/watch` disarms auto-add.
    - It's the same player and the same `<video>`, moved into the miniplayer, still playing the same video. Losing it on navigation was a defect of the URL-based trigger.
    - The miniplayer's next video arrives without a page navigation, so it's picked up from the player (see "Which video").
  - **The Shorts player,** for playlists that take Shorts (see Shorts).
  - **Background tabs** (parity). Listening to a talk in another tab is watching it.
    - Browsers don't start media in a tab opened in the background until it's shown, so a background tab only counts once the user has played something there.
    - Chrome pauses a muted video in a hidden tab, so that doesn't count while hidden.
    - Auto-add's toasts wait until the tab is visible ([ticket 12](12-adding.md)).
- **Never counts:**
  - hover and inline previews, and Shorts-shelf previews;
  - the channel page's featured video or trailer;
  - the other special-purpose players YouTube runs (banner, masthead, promo, background audio);
  - clips (`/clip/…`);
  - YouTube embeds on other sites, which 2.0 has no access to;
  - music.youtube.com (settled: auto-add is YouTube-only);
  - anything played while an ad shows.
  - **Clips** play in the ordinary watch player, with the source video's ID and length, looping over a range. They're recognised by the player response's `clipConfig`, which also covers a clip continued in the miniplayer.
    - *Runner-up:* count a clip against its source video. It lost because a clip is someone's excerpt. At low percentages, watching a 10-second clip would add the 2-hour stream it came from.
- **Made-for-kids videos aren't tracked** ([ticket 12](12-adding.md): YouTube refuses to save them).
  - **How they're recognised:** the player response's `playabilityStatus.miniplayer.miniplayerRenderer.playbackMode` is `PLAYBACK_MODE_PAUSED_ONLY`, YouTube's "Miniplayer is off for videos made for kids". A made-for-kids video and an ordinary one were compared signed out on 2026-10-19.
  - **PROVISIONAL** until [ticket 25](25-live-checks.md) confirms the signal, signed in, is specific to made-for-kids. Without it, ticket 12's refusal toast (once per session) is the fallback.
- **Which player:** only the players with the ids `movie_player` (watch page and miniplayer) and `shorts-player` count. Every YouTube player has the same classes and inner `<video>`; only the id tells them apart. 1.5.0 used the document's first `<video>`, which fixes inventory "Unverified risks": an inline preview could drive the trigger.
- **Which video:** the video the player says it's playing (`getVideoData().video_id`), never the URL alone.
  - **Watch page and Shorts:** that ID must match the navigation's (`watchEndpoint.videoId` or `reelWatchEndpoint.videoId`). Until both agree, nothing counts. On Shorts the URL can change before the active Short does.
  - **Miniplayer:** there's no navigation, so the player's ID after it reports a new video is enough (`yt-player-updated` from the watch-context player, or `onVideoDataChange`).
  - **A new video in the same player** starts its own playback: autoplay, a queue item, a Shorts swipe, or a live stream reloaded as a replay.
- **What auto-add hands to the add flow** ([ticket 12](12-adding.md)):
  - the video ID;
  - the title (`videoDetails.title`);
  - the channel (ID, name and @handle) if the page gave it;
  - the playlists whose goal was just reached.

### Ads

- **Ads never count.** Neither an ad's progress nor its running time counts towards the video, and an ad can never set off auto-add. This fixes inventory "Unverified risks": "Ads … may drive the auto-add trigger".
- **Position and length come from the player, never from the `<video>` element.**
  - Ads play in the same `<video>` as the video, so its `currentTime` and `duration` are the ad's while an ad plays.
  - During an ordinary ad, the player's `getCurrentTime()`, `getDuration()` and `getVideoData()` still report the video itself.
- **Nothing is read while an ad shows.** An ad is showing if any of these holds:
  - the player element has the `ad-showing` class;
  - `getPresentingPlayerType()` returns 2;
  - the player has sent `onAdStart` and not yet `onAdEnd`.

  Counting picks up where the video resumes. The ad leaves no gap and earns no credit.
- **Stitched ads (PROVISIONAL until [ticket 25](25-live-checks.md)):** YouTube can splice ads into the video's own stream, so the stream's timeline includes them. It's unverified whether the player's position then still means "position in the video". Until a signed-in check settles it:
  - nothing counts while `ad-showing` is set, which stitched ads set too;
  - a length disagreement over 2 s means that playback isn't counted, and the status says so (see the states table).

  The worst case is a missed add, never a wrong one.
- **Shorts ads are their own items in the Shorts feed.** Each has its own video ID and plays in the same Shorts player. An item doesn't count if either of these holds:
  - its navigation marks it as an ad (`reelWatchEndpoint.adClientParams.isAd`);
  - the Shorts player shows `ad-showing`.

  **PROVISIONAL** until ticket 25 confirms how a Shorts ad looks on the page.
- **Pause ads** are overlays next to a paused video. Nothing plays, so nothing counts.

### Live streams, premieres and replays

What the player response says decides it (`videoDetails`, read from the player):

| What's playing | How it's recognised | Counts? |
|---|---|---|
| Ordinary video | none of the flags below | Yes |
| Live stream, with or without rewind | `isLive: true`, `isLiveContent: true` | No (parity). It has no fixed length, so "half of it" means nothing. |
| Premiere while it plays | `isLive: true`, `isLiveContent: false` | No. YouTube plays it as a live stream whose timeline includes the countdown, and nobody can skip ahead. |
| Upcoming stream or premiere (waiting room) | `isUpcoming: true` | No. Nothing is playing. |
| Stream recording still processing ("post-live") | `isPostLiveDvr: true` | No. Its length keeps changing, only about the last two hours may play, and it can stay in this state for months. |
| Stream replay | `isLiveContent: true`, no `isLive`, fixed length | Yes, like any video. |
| Premiere after it's over | `isLiveContent: false`, fixed length | Yes, like any video. |

- **When a stream or premiere ends while you watch,** the player may reload it in place, without a page navigation.
  - The table is checked again whenever the player reports new video data.
  - From the moment the video has a fixed length, it counts like any other.
  - Nothing watched while it was live counts.
- *Runner-up:* count a live stream after N minutes watched. It lost because it's a new capability (today a live stream never fires) and needs a second setting. It's raised as a question for the user instead.

### Shorts (approved: auto-add on Shorts)

- **Each auto-add playlist chooses what it takes: Videos, Shorts, or Both. The default is Videos** for every playlist, carried-over ones included, so nothing changes until the user asks.
  - Why: Shorts are watched by the dozen. Most people want them in a separate playlist, or nowhere, rather than mixed into "Watched".
  - *Runner-up:* one "Include Shorts" switch for every auto-add playlist. It lost because it forces Shorts into every auto-add playlist or none.
- **What's a Short:** a video played in the Shorts player, at `/shorts/<id>`. The same video opened on a watch page counts as a video.
  - Why: the user knows which player they were in, and no extra lookup is needed.
  - If YouTube's Shorts-in-miniplayer experiment ships, a Short there is still a Short, because it stays in the Shorts player.
- **The same rule as for videos:** the playlist's required percentage of the Short's length.
  - Shorts loop with the browser's own `loop`, so no `ended` event fires. The wrap back to 0 is a jump: it starts a new stretch, and the 2-second slack covers the last moment before it.
  - Watching a Short twice counts its parts once.
- **Each swipe is its own playback.** Swiping back to a Short continues its remembered progress (see "Coming back").
- **When no auto-add playlist takes Shorts,** nothing is tracked on Shorts at all.

### Required percentage

- **A default for all auto-add playlists: 0–100 %, in whole numbers. The default is 50 %.**
  - 50 % was 1.5.0's default, and what 1.4.5's popup showed.
  - The default is shared by every account, like other non-playlist settings ([ticket 11](11-accounts.md)).
  - 1.4.5 upgraders keep their value. [Ticket 19](19-upgrade-and-rollout.md) decides what an empty 1.4.5 value becomes.
- **Each auto-add playlist can override the default,** in the same per-playlist options as its channel filter.
  - Left unset, the playlist uses the default.
  - Like "takes Videos/Shorts/Both", the override names a playlist, so it lives in the account setup and travels with the playlist (ticket 11's rule).
  - Why: a low-percentage "everything I opened" playlist and a 90 % "finished" playlist are both natural. The override stays out of sight until it's wanted.
  - *Runner-up:* one global value only (today). It lost because those two kinds of playlist can't exist side by side with it.
- **The ends of the range:** 0 % reads "As soon as it starts playing"; 100 % reads "Only when watched in full" (copy for [ticket 15](15-popup-and-settings.md)). With 100 %, a video with skipped parts isn't added, which is what 100 % asks for.
- **Changes apply at once** to videos already playing. Lowering a percentage below a video's progress adds the video straight away, because unlike today's playhead, the progress is real watching. An add already under way finishes as it started ([ticket 12](12-adding.md)).
- **Editing never saves a half-typed value.** This fixes the Friction item "Emptying the percentage field stores 0 immediately".
  - The number field saves on Enter or when focus leaves it.
  - Empty or out-of-range input goes back to the saved value.
  - The slider saves when it's released.

### Coming back, and replays

- **Progress is remembered between visits** until auto-add has run for the video, or for 30 days after the video last played.
  - It's kept per account and on this device only. Two sittings of 40 % add up to 80 %.
  - Why: long videos are often watched over several days. With a high percentage, no single sitting may reach it.
  - It isn't synced: it changes every few seconds, and `storage.sync`'s write limits rule that out.
  - It's never stored from a private window ([ticket 03](03-store-policy.md), [ticket 11](11-accounts.md)); there it lasts as long as the tab.
  - If the video's length has changed by more than 2 s since, the remembered progress is dropped.
  - *Runner-up:* count each visit separately. It lost because a video "watched in full, in two sittings" would never count.
- **Once auto-add has run for a video, its remembered progress is dropped.** "Run" means every playlist that takes the video has had an outcome: added, already in, filtered out, skipped or failed.
  - The next visit starts from zero, so a rewatch must reach the goal again.
  - Then, as [ticket 12](12-adding.md) settled, auto-add re-adds a video the user had removed on YouTube, and says nothing if it's still there.
  - Why drop it: if progress stayed, just reopening a video the user had removed would put it straight back.
  - *Runner-up:* a permanent "auto-added once" record that never re-adds. It lost because ticket 12 made re-adding auto-add's definition, and a permanent per-video record brings back 1.5.0's "blocked forever" defect.
- **Within one playback, auto-add runs at most once per playlist** (parity). Replaying, seeking back or looping on the same page adds nothing new.
  - A new playback starts it again: leaving and coming back, a reload, swiping back to a Short, or the miniplayer loading the video again. YouTube answers "already in" silently ([ticket 12](12-adding.md)), so this is harmless.
- **A playlist that becomes an auto-add playlist mid-video** is checked against that video's progress straight away.

### Switching off, pausing, and leaving one video out

- **Auto-add is a feature with its own switch** (settled).
  - **Off:**
    - no tracking code is injected into YouTube's pages;
    - nothing is remembered;
    - switching it off deletes any remembered progress. That progress is watch data that exists only to serve auto-add. *Runner-up:* keep it for its 30 days. It lost because it would keep a watch log for a feature that's off.
  - **On, but with nothing to add to:** for example, no auto-add playlists for this account, no playlist taking this kind of video, or signed out.
    - It tracks nothing and shows nothing on the page. This fixes the Friction item about toasts like "No auto-add playlists selected" on every video.
    - The popup says what's missing instead.
  - **Account changed in another tab:** tracking stops in that tab ([tickets 11](11-accounts.md) and [12](12-adding.md)).
- **Pause:** "Pause auto-add" stops it in every tab until the user resumes it or the browser closes.
  - Nothing watched while paused counts, so resuming mid-video counts from then on.
  - Settings and the page script stay as they are. That's what separates pausing from switching off.
  - It's shown wherever auto-add's state is shown, with **Resume**. It's held in memory, like ticket 12's session skip.
  - *Runner-up:* timed pauses (1 hour, until tomorrow). They lost because picking a duration is one more decision every time, and "while I watch this other stuff" maps to a browser session.
  - *Runner-up:* no pause, only the feature switch. It lost because switching off collapses the settings, deletes progress, and is easy to forget to undo.
- **Leaving one video out:** "Don't auto-add this video" sets ticket 12's **session skip** for that video on all of the account's auto-add playlists.
  - Auto-add leaves the video alone until the browser restarts, however much of it is watched.
  - **Undo** clears the skip, and counting carries on from the progress so far.
  - Undoing an auto-add, or unticking it in the picker, sets the same skip for those playlists ([ticket 12](12-adding.md)).
  - It doesn't remove earlier adds; that's Undo's job.
  - *Runner-up:* remember the choice permanently. It lost to consistency with ticket 12: there's one mechanism, and nothing is stored about individual videos.
  - *Runner-up:* skip it for this visit only. It lost because a rewatch within minutes would add it anyway.
- **Placement** of the switch, Pause/Resume and "Don't auto-add this video" belongs to [ticket 09](09-where-things-live.md).

### What auto-add knows about the current video

There is one state per playback, for whatever status [ticket 09](09-where-things-live.md) and [ticket 14](14-in-page-controls.md) choose to show. The copy is a draft; ticket 14 owns the final wording. Toasts for outcomes are ticket 12's.

| State | Meaning | Draft copy |
|---|---|---|
| Counting | Progress is below the lowest pending goal | "Auto-adds at 50 % · 32 % watched" |
| Added | Every playlist that takes the video has had its outcome | "Auto-added to Watched", or "Already in Watched" |
| Partly added | Some playlists have had their outcome; others have higher goals | "Added to History · Watched at 90 %" |
| Skipped | Session skip on every pending playlist | "Not auto-adding this video · Undo" |
| Paused | Auto-add is paused | "Auto-add paused · Resume" |
| Live | Live, premiering, waiting room or post-live | "Live streams aren't auto-added" |
| Can't measure | The lengths disagree (stitched ads) | "Auto-add can't follow this video's progress" |
| Ad | An ad is playing (momentary) | (nothing; counting resumes after the ad) |
| Not tracked | Clip, made for kids, no playlist takes this kind, nothing to add to | (nothing shown) |

### 1.4.5 upgraders

- **The percentage carries over, but its meaning changes:** skipping ahead, `&t=` starts and resume points no longer count. Users on 0 % (1.4.5's real default) see no difference.
- **A suggested line for the one-time note** ([ticket 19](19-upgrade-and-rollout.md)): "Auto-add now counts only what you actually watch. Skipping ahead and ads don't count."
- **Carried-over playlists** take Videos only and use the default percentage.

### Player facts this relies on

The facts were gathered on 2026-10-19 from YouTube's player script (`/s/player/0229cd64/…/base.js`) and desktop app bundle (`kevlar_base…VRNYTIAj20w`), both fetched signed out, and from the code of SponsorBlock `454c2d8`, maze-utils `89005da`/`6b5b5be`, Return YouTube Dislike `639a30f`, ImprovedTube `9a156ee`, YouTube-Enhancer `6b1a2f6`, yt-dlp `8973412` and YouTube.js `c4a7b3f`. The minified files can change their names with any release.

- **Player elements:** every player is `div.html5-video-player#<id>` wrapping `video.html5-main-video`. The ids come from `ytcfg` `WEB_PLAYER_CONTEXT_CONFIGS`:
  - watch page: `movie_player`;
  - Shorts: `shorts-player`;
  - previews: `inline-preview-player`;
  - channel trailer: `c4-player`;
  - also `channel-banner-player`, `masthead-player`, `background-audio-player` and others.
- **The watch page** is `ytd-watch-flexy`, `-grid` or `-fixie`, each with `ytd-player#ytd-player[context=WEB_PLAYER_CONTEXT_CONFIG_ID_KEVLAR_WATCH]`.
- **The miniplayer moves the same `ytd-player`** into `ytd-miniplayer … #player-container` (app bundle, `getPlayerFromWatch` / `movePlayerToWatch`).
  - The URL stays on whatever page the user browses.
  - The next video loads through `loadVideoWithPlayerResponse`, with no `yt-navigate-finish`.
  - The redesigned miniplayer has no `.miniplayer` class, so SponsorBlock's and DeArrow's checks for it are probably dead.
- **Shorts use one `ytd-player`,** moved between `ytd-reel-video-renderer`s (`movePlayerToVideo`).
  - Looping is the `<video>`'s `loop` attribute (`setLoop`), unless the user has YouTube's auto-advance turned on.
  - `#shorts-player.getVideoData()` exists; Return YouTube Dislike calls it.
- **Player methods during an ordinary ad report the video, not the ad.** `getCurrentTime`, `getDuration` and `getVideoData` default to the content player (type 1; pass 2 for the ad). `getPresentingPlayerType()` returns 2 during an ordinary ad, but 1 in stitched mode.
- **Ad classes:**
  - `ad-showing` and `ad-interrupting` are set on the player root during ordinary ads.
  - Only `ad-showing` is set during stitched ads.
  - `ad-created` only means the ads module has loaded.
- **Ad events:** `onAdStart` / `onAdEnd`. maze-utils listens for `onAdFinish`, which doesn't exist in the current player.
- **`video.played` is unusable.** It resets whenever the element loads a new source (Chromium `html_media_element.cc`, Gecko `HTMLMediaElement.cpp`), so progress must be the extension's own union of counted stretches.
- **Live states** follow yt-dlp's live-status order (`_video.py:3861-3874`): `isPostLiveDvr` → `isLive` → `isUpcoming` → `isLiveContent`.
  - The player computes `isPremiere = !isLiveContent` while live or upcoming.
  - During live playback, `<video>.duration` is a moving placeholder, current time + 3600 s.
- **Clips** carry a top-level `clipConfig {startTimeMs, endTimeMs}` and loop through `setLoopRange`. maze-utils ignores clip pages on purpose.
- **Background tabs:**
  - `timeupdate` fires every 15–250 ms by the HTML spec, and media events aren't timer-throttled in Chrome.
  - Chrome (crbug 509135) and Firefox (`media.block-autoplay-until-in-foreground`) hold back media in tabs opened in the background.
  - Chrome pauses video that's been muted since it started when its tab is hidden.
- **Made for kids** (signed-out comparison, 2026-10-19): `playabilityStatus.miniplayer.miniplayerRenderer.playbackMode` is `PLAYBACK_MODE_PAUSED_ONLY`, with the popup "Miniplayer is off for videos made for kids". An ordinary video has `PLAYBACK_MODE_ALLOW`.

### Live checks for [ticket 25](25-live-checks.md)

1. **A pre-roll ad, signed in:**
   - from `<video>`: `currentTime`, `duration` and `src`;
   - from the player: `getCurrentTime()`, `getCurrentTime(2)` and `getPresentingPlayerType()`;
   - the player's class list;
   - whether `onAdStart` and `onAdEnd` fire through `movie_player.addEventListener`.
2. **Stitched ads:** does any account show `SSAP` or `SSDAI` in `getStatsForNerds().debug_info`? If so, do `getCurrentTime()` and `getDuration()` stay in the video's own time?
3. **A Shorts ad:** does the URL become `/shorts/<adId>`, and does `#shorts-player` get `ad-showing`?
4. **The miniplayer:**
   - do `pause` and `play` fire when the player moves into or out of it;
   - does its next video fire `yt-player-updated` and `onVideoDataChange`?
5. **Shorts:**
   - does every swipe fire `yt-navigate-finish`;
   - how does a loop look in `timeupdate` and `seeking`;
   - does `ended` fire with auto-advance on?
6. **A stream or premiere ending on an open page:** which events fire, and when the flags change.
7. **Made for kids:** is `PLAYBACK_MODE_PAUSED_ONLY` set on made-for-kids videos only, signed in too?
8. **A hidden tab after more than 5 minutes,** in both browsers:
   - how far apart `timeupdate` events are;
   - whether a muted watch-page video gets paused in Chrome.
9. **`getVideoData()` before playback starts:** Nova reports `isLive` as unreliable then.
