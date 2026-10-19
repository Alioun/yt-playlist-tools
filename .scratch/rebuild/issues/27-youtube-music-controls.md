# How do the controls inside YouTube Music look and behave?

Type: prototype
Status: resolved
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 09, 21, 26

## Question

Prototype the quick-action controls in YouTube Music's own look: inline buttons on song rows, album and playlist cards and the queue panel; the player bar; the save-to-playlist picker; and feedback. Once the static look is agreed, make a rough dev build and try it on real music.youtube.com, including the installed YouTube Music app if [ticket 21](21-youtube-music-internals.md) shows extensions run there.

Also from [ticket 21](21-youtube-music-internals.md): don't hang controls off the player bar, because the A/B-tested new player UI removes it. The side panel doesn't open in Chrome's installed-app windows.

Also from [ticket 11](11-accounts.md): the YouTube Music section's choices are shared by every account; only Save to playlist's one-click target is per account.

Also from [ticket 26](26-youtube-music-quick-actions.md):
- Start from its placements.
- Prototype the split Save button and the picker, anchored to the button or centred when opened by key, using YouTube Music's own icons.
- In fullscreen (`f`), toasts must render inside the fullscreen element.

Also from [ticket 10](10-youtube-access.md): in-page icons and fonts are inline, since there are no web-accessible resources.

Also from [ticket 12](12-adding.md): toasts wait while their tab is hidden or in fullscreen. A picker untick sets the undo-skip.

Also from [ticket 28](28-queue-reorder.md) (adopted into ticket 26): queue items get Play next / Add to queue as moves. Prototype the "Moved" feedback and Undo.

Also from [ticket 08](08-shortcuts.md): the undo key (Alt+U) works on YouTube Music toasts.

Also from [ticket 18](18-breakage.md): the "not working" notice is a sticky variant of the shared toast. You own YouTube Music's item selectors, the row self-check and the anchor thresholds.

Also from [ticket 24](24-performance-budget.md): one hover overlay per page, not buttons on every row. Inject the picker when the pointer reaches Save, to hide its first-open delay. YouTube Music budget: at most 43 KB with everything on (PROVISIONAL, sized by analogy).

Also from [ticket 09](09-where-things-live.md) and its [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live) (branch `prototype/where-things-live`):
- **Rows:** reserve the button slot's width on song rows, so buttons never cover titles in narrow queue panels.
- **Album track rows:** no Like of ours.
- **Queue items:** Save, Like and Remove, plus ticket 28's moves.
- **Popup:** the "Playing now" row is in.
- **YouTube Music site-wide switch:** only YouTube Music gets one.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up. This answer builds on tickets [26](26-youtube-music-quick-actions.md) (with its 08, 18 and 28 amendments), [17](17-modules.md) and [14](14-in-page-controls.md), which resolved while it was built. Real-YouTube-Music checks were made signed out, in headless Chromium 156, on 2026-10-19.

**Prototype:** [`prototypes/youtube-music-controls/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/youtube-music-controls/prototypes/youtube-music-controls) on branch `prototype/youtube-music-controls` (built on `prototype/where-things-live`).
- **What it is:** Svelte 5 with a hand-written YouTube Music skin; Bits UI only in the lazy picker. No Tailwind, no shadcn. YouTube Music's own icons, captured from the live page.
- **Two hosts for the same kit components:**
  - **The hi-fi mock:** YouTube Music's Home, search, album, playlist and player pages faked full-window, in its measured dark look.
  - **The rough dev build:** an MV3 extension shaped like ticket 17 (runtime registration, gateway in MAIN, core → kit → feature in the isolated world, lazy `popovers.js`), run on real music.youtube.com.
- **Run the mock:** `cd prototypes/youtube-music-controls && bun install && bun run dev`, then open the URL it prints.
  - **The yellow bottom bar** switches the row variant (`?variant=A|B|C`); ← and → do too.
  - **The prototype panel** (top right) switches scenes (`?scene=home|search|album|playlist|playing|states`), the player (classic bar or Wiz miniplayer), fullscreen, each button, Save on the player bar, choose mode, shortcuts, signed in, casting, private window, failures, slow answers, unreadable membership and "YouTube Music changed". It shows the live queue and the toast log.
  - **Keys:** Alt+N, Alt+Q, Alt+P, Alt+Shift+P, Alt+L, Alt+R, Alt+U, on the pointed-at item, else the playing song.
- **Run the dev build:** `bun run build`, then load `dist/ext/` unpacked in Chrome. `CHROMIUM=… node scripts/shoot-real.cjs` drives it on real YouTube Music and writes `screenshots/r*.png` and `real-run.json`; `node scripts/shoot-mock.cjs` screenshots the mock (`m*.png`).
- **Screenshots:** [`screenshots/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots): 23 of the mock (`m*`) and 26 from real YouTube Music (`r*`).

### In short

- **Every control copies the YouTube Music control it sits beside**, measured on the live site: 36 px row buttons, YouTube Music's card play button, its 40 px header circles, its player-bar like, the Wiz miniplayer's tonal pills, its ⋮ menu for the picker and its light toast.
- **Rows and queue items: our buttons join the item's own layout on hover or focus** (variant A), just before YouTube Music's like and ⋮, the way its own hover buttons do. The title narrows; nothing is covered and nothing is reserved at rest.
- **One moving host per page** carries the buttons for rows, cards and queue items. Headers and the player-bar Save each get one small in-flow host.
- **The surprise:** at common laptop widths (about 1350–1650 px windows) Home's Quick picks rows are so narrow that YouTube Music's own hover buttons already leave ~66–111 px of title. Ours squeeze it to 0–21 px. Kept anyway; the tooltips then name the song. **This needs the user's eye** (see the judgement calls).
- **The Wiz miniplayer is live:** about 1 in 4 fresh signed-out profiles got it (5 of 18), with a like/dislike action bar. Our Save sits left of that like, as ticket 26 planned. Forcing the flag alone gives a Wiz bar *without* the action bar, where nothing is drawn, as designed.
- **Everything ran for real, signed out:** Play next and Add to queue from rows, cards (a 101-song playlist as one block) and the album header; queue moves (ticket 28's drop) and Remove, each with Undo; Alt+U; a toast in fullscreen.
- **Sizes:** eager on YouTube Music 35.2 KB gzip (budget 43). The lazy picker is **54.5 KB, over its 50 KB budget**.

### Decisions

**Look: measured on music.youtube.com and copied**
- **Root and type:** YouTube Music's root font size is **10 px** (62.5 %, like YouTube's). Our text uses rem (14 px = 1.4rem), boxes use px, as ticket 14 decided. Fonts are the page's own Roboto and YouTube Sans; nothing is bundled.
- **Colours:** YouTube Music is always dark, so the skin is fixed: page `#030303`, surfaces `#212121`, text `#fff`, secondary `rgba(255,255,255,.7)`, hover `rgba(255,255,255,.1)`, pressed `.2`, focus a 2 px white outline. No theme switch is needed.
- **Icons:** YouTube Music's own, captured through its `yt-icon` loader and its menus, inline (ticket 10):

  | Use | YouTube Music icon |
  |---|---|
  | Play next | `QUEUE_PLAY_NEXT` (its ⋮ menu's) |
  | Add to queue | `ADD_TO_REMOTE_QUEUE` |
  | Save to playlist | `PLAYLIST_ADD`; saved: `PLAYLIST_ADD_CHECK`; ▾: `ARROW_DROP_DOWN` |
  | Like / liked | `LIKE` / `LIKE_FILLED` |
  | Remove from queue | `REMOVE_CIRCLE` (its queue menu's) |
  | Done / failed / not confirmed | `CHECK` / `ERROR_OUTLINE` / `HOURGLASS` |
  | Picker | `SEARCH`, `CHECK_BOX` / `CHECK_BOX_OUTLINE_BLANK`, `KEEP` / `KEEP_FILLED`, `PRIVACY_PRIVATE` / `_UNLISTED` / `_PUBLIC`, `ADD`, `CLOSE` |

  The real build should use the matching Material Symbols paths unless bundling YouTube Music's own is confirmed fine (they look the same).
- **Tooltips:** YouTube's (`rgba(97,97,97,.92)`, 12/18, 4 px radius), after 0.5 s, above the button, drawn in the kit's top-level layer so carousels can't clip them. Text: the action and its key, e.g. "Play next (Alt+N)", "Save to Favourites (Alt+P)", "Save to playlist… (Alt+Shift+P)".

**Song rows** (`ytmusic-responsive-list-item-renderer`: Home, search, album, playlist, library)
- **Where:** the moving host is inserted in the row's own flex row, **just before the row's `ytmusic-menu-renderer`** (which holds YouTube Music's like, dislike and ⋮), on hover or keyboard focus (`:focus-visible`). It leaves when the pointer leaves the row (120 ms grace).
- **Size:** 36 × 36 px round buttons, 24 px icons, 2 px apart, 8 px margins: YouTube Music's own row buttons, measured. Transparent; hover `rgba(255,255,255,.1)`.
- **Layout:** the title column narrows to make room, exactly as it already does for YouTube Music's own hover buttons. Nothing is covered, and at rest every row looks untouched.
  - Wide rows (album, playlist, search; 483 px titles at 1440) lose 82 px only while hovered, which only long titles notice.
  - **Narrow rows** (Home's Quick picks carousel), real widths with our two default buttons:

    | Window | Row | Title with YouTube Music's own hover buttons | With ours too |
    |---|---|---|---|
    | 1280 | 436 | 202–214 px | 112–124 px |
    | 1366 | 289 | 66 | 0 |
    | 1440 | 312–313 | 90–91 | 0–1 |
    | 1536 | 345 | 111 | 21 |
    | 1920 | 473 | 251 | 161 |

  - **Every chosen button stays** in narrow rows. When the title would drop under 48 px, the tooltips name the song ("Play next: Shape of You (Alt+N)"). The accessible name always does.
- **Which buttons:** the user's choice (Play next and Add to queue by default), each only where YouTube Music's own ⋮ offers it (ticket 26), read by `itemInfo`. **No Like on rows**: every row already has YouTube Music's like (it steps aside, as ticket 14's rule says).

**Cards** (`ytmusic-two-row-item-renderer`)
- **Where:** inside the card's `ytmusic-item-thumbnail-overlay-renderer`, **bottom-left, 8 px in**, centred on the same line as YouTube Music's play button (bottom-right, 40 px).
- **Size:** **32 px** circles in the play button's own surface (`rgba(0,0,0,.6)`, `.85` on hover, scale 1.08), 20 px icons, 4 px apart: one size smaller than YouTube Music's play, which stays the main action. They fit the narrowest cards (145 px at 1440).
- **Which:** Play next and Add to queue on albums and playlists (as a block). Song and video cards also get Save (a 32 px split) and Like when switched on, since YouTube Music draws no like there.

**Album and playlist headers** (`ytmusic-responsive-header-renderer`)
- **Where:** in `#action-buttons`, **before YouTube Music's ⋮**: Save to library · Play · **Play next · Add to queue** · ⋮. Always visible, like YouTube Music's own.
- **Size:** YouTube Music's 40 px tonal circles (`rgba(255,255,255,.1)`), 12 px apart. YouTube Music's own spacing around its 64 px Play is kept.
- **Note:** the row (304 px) is wider than the 261 px header column at 1440; it stays centred and overhangs evenly, which looked fine live.

**Queue items** (`ytmusic-player-queue-item`, Up next, 392 px wide at 1440)
- **Where:** the same moving host, before the item's `ytmusic-menu-renderer` (YouTube Music swaps the duration for its ⋮ on hover).
- **Which, in order:** Play next and Add to queue (**moves**, ticket 28), Save (split), Like, Remove from queue, each only when switched on.
  - None of the moves on the playing item or on autoplay suggestions.
  - With all five on, the title keeps ~38 px; with the default two, ~180 px.
- **After a move or a remove, the button shows no done state:** the toast confirms. YouTube Music re-renders every queue item, so the item under the pointer is now another song; the cluster re-reads it (found live).

**Save to playlist: the split button**
- **Shape:** one pill (36 px tall, 18 px radius): **main 36 px** (`PLAYLIST_ADD`) + **▾ 22 px** (`ARROW_DROP_DOWN`, 20 px), a 1 px divider shown on hover or focus. Each half has its own hover.
- **Choose mode** (no quick-save playlist): a single round button, tooltip "Save to playlist…", which opens the picker in choose mode.
- **States:** busy (spinner), done (`PLAYLIST_ADD_CHECK`, 1.5 s), failed (error, 1.5 s). "Already in" is a neutral toast.
- **Hover intent:** pointer on the split preloads `popovers.js` (ticket 24). Live, injection took 18–25 ms.

**Save on the player bar** (opt-in, signed in)
- **Classic bar:** before `#like-button-renderer` inside `.middle-controls-buttons`: the 36 px split, 8 px before YouTube Music's like.
- **Wiz miniplayer:** before `yt-video-action-bar-view-model` in `.ytMusicMiniPlayerRightSection` (time · **Save** · like/dislike · volume · ⋮), as a **32 px tonal pill** (`rgba(255,255,255,.1)`) shaped like its segmented like/dislike.
- **No anchor, nothing drawn:** a narrow window, signed out, or a Wiz bar without the action bar. That isn't breakage (ticket 18).
- **Our controls are `<button>`s** and stop clicks at their host: the Wiz miniplayer expands on any click that isn't on a button, input or link (read in its code).

**The playlist picker** (lazy `popovers.js`, Bits UI Popover)
- **Look:** YouTube Music's ⋮ menu surface: `#212121`, 1 px `rgba(255,255,255,.1)` border, 48 px rows, 14 px text, hover `rgba(255,255,255,.05)`; with an 8 px radius and a soft shadow. 360 px wide; as tall as the room on its side allows (`--bits-floating-available-height`, at most 560 px); the list scrolls.
- **Contents, top to bottom:**
  1. Title "Save to playlist" with ✕; in choose mode "Save songs to…" and "The playlist you pick here becomes your one-click Save."
  2. The song: 32 px art, title, artist · album (so a key-opened picker shows its target).
  3. A search field (YouTube Music's search-box look, 40 px), focused on open.
  4. Rows: checkbox · title · privacy glyph and "Private · 214 songs" · the playlist shortcut's key chip (e.g. `Alt+J`) · pin. The pin shows on hover or focus, and always on the quick-save playlist.
  5. "+ New playlist", which opens an inline form: title, Private / Unlisted / Public (Private first), Cancel, Create.
  - "Couldn't check where this song already is" when membership can't be read; check marks pulse while it loads.
- **Anchoring:**
  - **From ▾:** below the split, aligned to its end; flips above when there's no room (common in the queue panel and the player bar).
  - **By key** (Alt+Shift+P, or Alt+P in choose mode) with no Save button for the target: **centred horizontally, 16 px above the player bar** (ticket 26).
- **Rows answer in place** (busy, checked, "Couldn't save"); no toasts. A choose-mode pick saves, becomes the quick-save playlist, closes the picker and shows "… One click now saves there." with Undo. Unticking stays PROVISIONAL (tickets 12 and 26); an untick also sets the session skip (ticket 12).
- **Keys:** ↓ from the search moves into the rows; ↑/↓/Home/End move; Space or Enter ticks; Enter in the search ticks the first match; **Escape is handled by the picker itself** and stopped there (see "What the dev build showed").
- **Loading:** injected on hover intent; an explicit click waits up to 5 s, then "Couldn't open the playlist list. Try again." (ticket 14's rule). Live, the first open painted in 32–45 ms after a click (budget 60).

**Toasts**
- **Look:** YouTube Music's own `tp-yt-paper-toast`, measured: **`#f1f1f1`, `#030303` text, 8 px radius, shadow `0 2px 5px rgba(0,0,0,.26)`, 1.4rem Roboto**, at least 288 px (YouTube Music's own is at most 288; ours wraps up to 568 px for longer copy).
- **Where:** **12 px from the left, 12 px above the player bar or Wiz miniplayer**, the same spot as YouTube Music's own toast. Re-measured 0.4 s and 1.2 s after showing, because the player bar slides up after a first song starts.
  - **It stacks above YouTube Music's own bottom-left surfaces**, its toast and its "Install YouTube Music" promo (`ytmusic-mealbar-promo-renderer`), which share the spot (found live).
- **Action:** a text button in YouTube's inverse call-to-action blue (`#065fd4`), as ticket 14's snackbar. Failures lead with the error icon (`#c00`); "did nothing" answers are neutral.
- **Rules (kit):** one at a time, 6 s, held on hover or focus and while the tab is hidden; Alt+U runs Undo, else "Nothing to undo.".
- **The mark rule (ticket 14):** on YouTube Music every toast answers the user's own click or key, so none carries the mark. The notice shows the error icon.
- **Fullscreen:** YouTube Music fullscreens **`<html>`** (checked live, like YouTube), so the kit's host is already inside it. Toasts answering a click or key **show** in fullscreen, at the same spot over the overlaid bar; the sticky notice waits until fullscreen ends (ticket 14's split).
- **Copy:** ticket 26's table, plus:

  | When | Toast | Action |
  |---|---|---|
  | Queue item, Play next | Moved "Lady" to play next | Undo (moves it back) |
  | Queue item, Add to queue | Moved "Lady" to the end of the queue | Undo |
  | Queue item already there | "Lady" already plays next / "Lady" is already at the end of the queue | — |
  | Autoplay suggestion, by key | Autoplay suggestions can't be moved. Use YouTube Music's ⋮ menu to add a copy. | — |
  | Couldn't move | Couldn't move "Lady". Try YouTube Music's ⋮ menu. | — |
  | Picker didn't load | Couldn't open the playlist list. Try again. | — |

**The "not working" notice** (ticket 18): the sticky toast with the error icon, ticket 18's copy ("Play next and Add to queue aren't working right now because YouTube Music changed something. Use its ⋮ menu for now."), **Details** and ✕. It appears when the first hover would have drawn the buttons; those actions then draw nothing, and their keys answer with ticket 18's key copy.

**Keyboard**
- **Pointed-at item:** pointer or focus, whichever moved last (ticket 08). Anything under the pointer that isn't a recognised item counts as nothing, so keys fall back to the playing song.
- **Focus shows the buttons:** Tab into a row (its play button or links) and the cluster appears in the row; the next Tabs reach our buttons, then YouTube Music's like and ⋮. Checked live: Tab reached "Play next: Giorgio by Moroder".
- **Keys on the playing song** (nothing pointed at, or pointing at its queue item): **Play next and Add to queue insert a copy** ("play it again"), as YouTube Music's own ⋮ does on that item; a move makes no sense there.
- **Isolation:** key and click events stop at our hosts (keydown, keyup, keypress, click, pointer and mouse down/up, contextmenu). Typing "jazz" in the picker didn't skip the song (YouTube Music's `j`).

**Item recognition, anchors and thresholds** (for `site/core/items-music.ts`)

| Item | Selector | Our anchor |
|---|---|---|
| Song row (also album, playlist, artist rows in search) | `ytmusic-responsive-list-item-renderer` | before `:scope > ytmusic-menu-renderer` |
| Card | `ytmusic-two-row-item-renderer` | appended to its `ytmusic-item-thumbnail-overlay-renderer`, absolute bottom-left |
| Queue item | `ytmusic-player-queue-item` (autoplay ones under `#automix-contents`) | before `:scope > ytmusic-menu-renderer` |
| Album / playlist header | `ytmusic-responsive-header-renderer` | `#action-buttons`, before its `ytmusic-menu-renderer` |
| Classic bar like | `ytmusic-player-bar #like-button-renderer` | before it |
| Wiz action bar | `ytmusic-miniplayer yt-video-action-bar-view-model` | before it |

- **What each item offers** comes from `itemInfo` (gateway, targeted at the element): the menu's endpoints (`queueAddEndpoint` by insert position, `removeFromQueueEndpoint`, `addToPlaylistEndpoint`, `likeEndpoint`), the kind (`musicVideoType` or the browse `pageType`), the top-level like, the queue item ID (`watchEndpoint.index`), `selected`, and the header's song count.
- **Self-check (markup-independent):** the pointer looks like it's on an item when an ancestor within 6 levels holds exactly one distinct `watch?v=`, `playlist?list=`, `browse/MPRE…` or `browse/VL…` link, or it's inside the queue panel. Live, rows hold 3 links (title, artist, album) of which one is a `watch?v=`; queue items hold none.
- **Page-settle check:** ticket 18's starting values kept (3 s; ≥ 6 links; less than half recognised raises `anchor-missing`). Live: Home 60/60, album 35/35, playlist 107/107 recognised.
- **Narrow threshold:** 48 px of title (the tooltip-names-the-song switch).
- **Our hosts reset YouTube Music's rules** with an inline `all: initial` first: inside a card's overlay, YouTube Music's own child rules stretched our host to 133 × 120 px (found live).
- **State is keyed by the item's identity** (queue item ID, else element plus title), never by the element, and `itemInfo` is re-read after every queue job: YouTube Music recycles item elements (found live).

### Judgement calls and runner-ups

1. **Rows: buttons join the row's own layout on hover (variant A).**
   - *Runner-up B, the reserved slot* (ticket 09's note): an empty slot in every row so nothing moves on hover. It lost because every title is shorter all the time, YouTube Music looks changed at rest, and narrow rows still lose their title on hover. A achieves ticket 09's goal (never cover a title) without reserving.
   - *Runner-up C, a floating pill* (ticket 26's first idea): no reflow, but it covers the title in narrow rows and looks foreign.
2. **Narrow rows keep every chosen button** and the title is squeezed out while hovered (0–21 px at 1366–1536 px windows). Tooltips then name the song.
   - *Runner-up:* drop buttons until the title keeps 48 px. It lost because at 1366 px no button fits at all, so the pet feature would vanish from Home's Quick picks at the most common laptop width.
   - *Second runner-up:* a combined queue split (Play next | ▾ Add to queue). It lost because Add to queue would take two clicks.
   - **For the user:** this is the one place our buttons visibly cost YouTube Music something. See `r05`, `r17-*`.
3. **Cards: bottom-left 32 px circles** in the play button's style.
   - *Runner-up:* 40 px like the play button. It lost because three 40 px circles don't fit a 145 px card.
4. **Headers: before YouTube Music's ⋮**, overhanging the narrow header column.
   - *Runner-up:* after the ⋮. It lost because it breaks the "ours, then YouTube Music's like and ⋮" order every other place keeps.
5. **No done state after a move or remove;** the toast confirms.
   - *Runner-up:* a check on the button. It lost because, live, the check landed on the next song YouTube Music re-rendered into that element.
6. **Picker: the ⋮ menu's surface with an 8 px radius.**
   - *Runner-up:* the menu's exact 2 px radius. It lost because YouTube Music's newer surfaces (toast, cards, chips, dialogs) use 8 px.
   - The picker has no key-hint footer: it read as clutter in YouTube Music's look; the ▾ tooltip teaches Alt+Shift+P.
7. **Toast action in YouTube's blue,** matching ticket 14.
   - *Runner-up:* dark text, YouTube Music's monochrome. It lost on consistency with YouTube's toast and on findability. No signed-out YouTube Music toast carries an action, so its own action colour is unverified.
8. **Keys on the playing song insert a copy.**
   - *Runner-up:* "That's the song that's playing". It lost because YouTube Music's own Play next does insert a copy there, and "play this again next" is a real wish.

### What the real-YouTube-Music dev build showed

**Set-up:** the background registered `pp-music-page [MAIN] page-music.js @document_start` and `pp-music [ISOLATED] core-music.js → kit-music.js → feature-music-actions.js @document_idle` at runtime; no manifest content scripts, no web-accessible resources. `popovers.js` came by `scripting.executeScript` on hover intent. Rough-build shortcut: the kit carried the controls' components itself (ticket 17's D4 runner-up). Signed out, so Save and Like were drawn with a dev flag and sent nothing.

**What worked** (screenshots `r01`–`r17`, numbers in `real-run.json`):
- **Placement:** row clusters before YouTube Music's like (`r01`, `r03`, `r04`), the album and playlist headers (`r01`, `r03`), cards (`r07`), queue items (`r11-*`), the classic bar Save (`r10-classic`) and the Wiz Save beside its live like (`r10-wiz`).
- **Real actions, signed out, confirmed by the queue:**
  - Play next from a Quick picks row: 50 → 51 (`r06`).
  - Add to queue on a playlist card: 101 songs as one block, 51 → 152; **Alt+U** took them all out again (`r08`).
  - Play next on the album header with nothing playing started the album: "Playing "Random Access Memories"" (`r02`).
  - Queue moves through ticket 28's drop, with Undo moving it back (`r12-*`); Remove, with Undo putting it back at its old place (get_queue, then a move).
  - Alt+N in fullscreen with nothing pointed at inserted a copy of the playing song; its toast showed over the video (`r15`).
- **The picker:** anchored to a queue item's ▾ and to the bar's ▾, and centred by key (`r13-*`, `r14-*`); first paint 32–45 ms after the click, 13–17 ms when already loaded.
- **Keyboard and isolation:** focus brought the cluster (`r09`); typing in the picker didn't reach YouTube Music's hotkeys.
- **Recognition:** every page settled with all its item links recognised.
- **Fullscreen:** the fullscreen element is `<html>` and our host stays inside it.
- **YouTube Music's own Play next on a queue item inserts a second copy**, as ticket 26 said; ours moves.
- **Ads:** signed-out sessions got an ad before the first song. During it, YouTube Music's bar shows "Sponsored · Video will play after ad" with no like, so the bar Save has no anchor and isn't drawn. That matches "the playing song is never an ad" (`r02`).

**What broke, and the fix in the prototype:**
1. **Bits UI's Escape never fired** under the hosts' key isolation, so the picker stayed open. The picker now handles Escape itself and stops it, so YouTube Music's own Esc (which collapses the player page) doesn't fire either. Same finding as ticket 14.
2. **YouTube Music's rules reached into our host** inside a card's overlay (stretched to 133 × 120 px, buttons mid-card). Fixed with an inline `all: initial` reset on every host.
3. **Recycled elements:** after a move or remove, the done check and a stale busy spinner showed on the song that YouTube Music re-rendered into the same element. Fixed by keying state by item identity and re-reading `itemInfo` after queue jobs.
4. **The toast sat on the player bar** when the first song started (the bar slides up after the toast appears). Fixed by re-measuring at 0.4 and 1.2 s.
5. **YouTube Music's own "Install YouTube Music" promo** sits in the toast's spot. The toast now stacks above it.
6. **Narrow Quick picks rows** lose their title (table above). Not "fixed"; it's judgement call 2.
7. **The picker flipped above its anchor and ran off the top** of the window in the queue panel. Fixed by sizing it to Bits UI's reported room.

**Wiz miniplayer:** served naturally to about 1 in 4 fresh signed-out profiles (5 of 18 checked). Those sessions had `ytmusic-app[is-miniplayer-enabled]`, `ytmusic-miniplayer` and a `yt-video-action-bar-view-model` with a segmented like (with count) and dislike, between the time and the volume. Forcing `music_web_enable_wiz_miniplayer` into the page config gave the Wiz bar but no action bar (the server sends `playerOverlayRenderer.videoActionBar` only to sessions in the test), so nothing of ours was drawn there, as designed.

**Not tested:** signed in (the real Save, Like and membership requests; whether the Wiz like repaints, ticket 25); the installed app window; Firefox; casting (the mock shows its state; ticket 25 found `state.castStatus`); a screen reader.

**Weight** (gzip 9, the rough build): page-music 2.7, core-music 1.3, kit-music 26.6, feature 4.6 → **35.2 KB eager** (budget 43). **popovers.js 54.5 KB, over its 50 KB budget**: Bits UI's floating layer plus the picker's search, form and states.

### PROVISIONAL

- **Narrow rows keep every button** (judgement call 2): for the user to confirm.
- **Variant A instead of ticket 09's reserved slot:** for the user to confirm.
- **The toast action's blue on YouTube Music:** unverified against a YouTube Music toast with an action (none show signed out).
- **The Wiz Save's anchor signed in:** seen only in signed-out Wiz sessions, where the action bar was present.
- **The picker's weight:** 54.5 KB against 50.
- **Bundling YouTube Music's own icon paths** versus Material Symbols equivalents.
- **Unticking removes** (tickets 12 and 26).

### Notes for other tickets

- **[14](14-in-page-controls.md):** both sites now share: in-flow hosts that move into the item, the `all: initial` reset on hosts placed inside the host page's elements, state keyed by item identity, toasts re-measured after showing and stacked above the host's own bottom-left surfaces, Escape in the popovers, the 5 s loader. YouTube Music's toast copies its own light `tp-yt-paper-toast` (12 px from the left, 12 px above the bar), not YouTube's snackbar values.
- **[15](15-popup-and-settings.md):**
  - Settings › YouTube Music's button list could warn that narrow rows (Home's Quick picks at 1350–1650 px) squeeze titles while hovered; more buttons, more squeeze.
  - "Save on the player bar" needs the line "Shown beside YouTube Music's like, in the classic bar and the new miniplayer."
  - The Playing now row's Save can reuse the split's states and copy (in the extension's own design system, not this skin).
- **[17](17-modules.md):**
  - **The kit's Overlay needs two modes:** in-flow (`attach(anchor, content, { before })`, joining the host page's flex layout) and corner (absolute inside an anchor). "One shadow host" becomes one top-level layer plus a constant few in-flow hosts, as ticket 14 also found.
  - **Isolation:** stop clicks, pointer and mouse down/up and contextmenu at our hosts as well as keys (YouTube Music rows play on click, cards ripple and navigate, the Wiz bar expands), and let popovers own Escape.
  - **Gateway jobs** proven live: `itemInfo` (as above), `queueInsert` (returns the inserted item IDs for Undo), `queueRemoveIds`, `queueRemove`, `queueMove` (to next, end or an index), `queueReinsert` (get_queue, then a move), `nowPlaying`, `castState`, `probe`.
  - **`popovers.js`:** use `strategy: "fixed"` and Bits UI's `--bits-floating-available-height`; it's 54.5 KB, so ticket 24's fallbacks apply (link it to the kit's runtime, about 38 KB, or drop Bits UI for the Popover API).
  - **Svelte `$state` proxies:** no identity comparisons are needed in this prototype's flow (keys are strings), but the kit's slot props are proxies, as ticket 14 warned.
- **[20](20-write-spec.md):** carry the placement and anchor table, the measured tokens (sizes, colours, toast spot), the narrow-row table, the copy additions, and the eight runner-ups. Mark the PROVISIONAL list.

### New questions

- **Narrow rows:** is a squeezed-out title while hovering acceptable on Home's Quick picks at common laptop widths, or should those rows show fewer buttons (or only keys)? A question for the user.
- **The picker over budget (54.5 KB):** link `popovers.js` to the kit's runtime, or replace Bits UI there with the Popover API? For ticket 17 or 24.
- **Signed-in live checks for ticket 25:** the Wiz action bar signed in, the like's repaint after our Like, a YouTube Music toast with an action (its colour), and the header row at widths where YouTube Music stacks its header above the list.
- **Installed app window:** still unchecked (headless can't install it).

Also from [ticket 15](15-popup-and-settings.md): the popup's Playing now row reuses the split Save button's states and copy. Settings carries the narrow-row warning and the player-bar line.
