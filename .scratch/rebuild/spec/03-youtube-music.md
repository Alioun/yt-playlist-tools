# 3. YouTube Music capabilities

This chapter specifies everything 2.0 does on music.youtube.com:
- the two YouTube Music features, Quick actions and Quick-action shortcuts;
- each quick action;
- playlist shortcuts carried over to YouTube Music;
- the popup's Playing now row;
- the installed YouTube Music app.

It covers behaviour only. Elsewhere:
- **The look,** sizes, anchors and measured tokens: [05-ui.md](05-ui.md) §5.6 (UI-YM-01 to UI-YM-19), the picker (UI-PICK-01 to UI-PICK-16, UI-PICK-25, UI-PICK-26), toasts (UI-TOAST-01 to UI-TOAST-16) and the popup's YouTube Music tab (UI-POP-16 to UI-POP-18).
- **The feature model,** consent, accounts, settings sync and breakage status: [04-features-accounts-data.md](04-features-accounts-data.md) (FT-, ACC-, SYNC-, DATA- and HEALTH- requirements).
- **YouTube's side** of what both sites share (the add flow, the picker, playlist shortcuts and the undo key): [02-youtube.md](02-youtube.md) §2.5 to §2.8.
- **Routes,** gateway jobs, the queue mechanics and page registrations: [06-architecture.md](06-architecture.md) §6.2.7, §6.2.8 and §6.6.
- **Budgets** and the breakage watch: [07-quality.md](07-quality.md) (Q-PERF-13, Q-PERF-14, §7.5).

The main session's resolutions ([resolutions.md](resolutions.md), both rounds, R1–R67) are applied. A requirement they changed keeps its ID and ends with its R-number; one they added has a new ID. Where chapters disagree, the owning chapter wins (resolutions.md's ownership rule): this chapter owns YouTube Music behaviour and copy.

**Sources**, all resolved on 2026-10-19:
- [26 Quick actions](../issues/26-youtube-music-quick-actions.md), the core, with its amendments after 28, 08, 18 and 25;
- [21 Internals](../issues/21-youtube-music-internals.md);
- [27 Controls](../issues/27-youtube-music-controls.md);
- [28 Queue reorder](../issues/28-queue-reorder.md);
- the YouTube Music parts of [08 Shortcuts](../issues/08-shortcuts.md), [12 Adding](../issues/12-adding.md), [11 Accounts](../issues/11-accounts.md), [09](../issues/09-where-things-live.md), [10](../issues/10-youtube-access.md), [15](../issues/15-popup-and-settings.md), [18](../issues/18-breakage.md) and [25](../issues/25-live-checks.md).

Later amendments, the main session's decisions and its resolutions supersede earlier text. Prototypes:
- `prototype/youtube-music-controls`, with 26 screenshots from real YouTube Music;
- `prototype/popup-and-settings`.

## Conventions

- **IDs.** Every requirement has a stable ID: `YM-<AREA>-<n>`. Each is written to be testable.
- **Terms** are [GLOSSARY.md](../../../GLOSSARY.md)'s, in particular: feature, quick action, queue, Play next, Add to queue, Remove from queue, playing song, Save to playlist, quick-save playlist, playlist picker, pointed-at item, quick-action shortcut, playlist shortcut, account, account setup, add, outcome, membership, already in, missing playlist, confirmation, not working, partly working, breakage signal, site access, serving tab.
- **A song** here is a single playable item: a song, a music video, an upload or an episode. Albums, playlists and artists aren't songs.
- **A queue item** is an entry in the queue panel. **Autoplay suggestions** are the items YouTube Music appends after the user's queue (`#automix-contents`). They are queue items too, but they can't be moved.
- **Copy examples** use the song "Get Lucky", the album "Random Access Memories" (13 songs), the queued song "Lady" and the quick-save playlist "Favourites". `{title}` and `{list}` are placeholders. `{Shortcut}`, `{Account}`, `{Playlist}`, `{Key}` and `{Other}` mean what they mean in [02-youtube.md](02-youtube.md#conventions), and `{Product}` is the extension's in-product name, as in every chapter (R65). `{Action}` is a quick action's name and `{kind}` an item kind in the plural ("albums", "artists"). Quotes inside copy are typographic (“ ”); straight quotes in this chapter's prose only mark where copy starts and ends (R45).
- **PROVISIONAL** marks a choice that is still open, with the ticket and check that settle it.
- **†** marks copy derived by applying ticket 12's copy rules to YouTube Music ("song" for "video", and "YouTube Music" for the site that answered). No ticket spells these out word for word.

## 1. Features, switches and settings

- **YM-FEAT-1** **Quick actions** is a feature. It is off after install and stays off until the user switches it on: at first run, in Settings or in the popup. Nothing on music.youtube.com can switch a feature.
- **YM-FEAT-2** Quick actions has these settings, with these defaults:
  - **Buttons**, each switched separately:
    - Play next: **on**;
    - Add to queue: **on**;
    - Save to playlist: off;
    - Like: off;
    - Remove from queue: off;
    - Save on the player bar: off.
  - **Show feedback:** **on**.
- **YM-FEAT-3** **Quick-action shortcuts** is a second feature, also off until switched on. It has:
  - one key per action: Play next, Add to queue, Save to playlist (quick-save), Save to playlist… (the picker), Like / unlike, and Remove from queue. Each key can be changed or cleared.
  - **Show feedback**, on by default.

  The undo key isn't part of it: it belongs to no feature, is preset at install, and is set in Settings › Everywhere (YM-KEY-4). (R44)
- **YM-FEAT-4** The **quick-save playlist** setting is shared by both features. It shows once, under whichever of them is on, because the Save key needs it even when the buttons are off. It's hidden while both are off.
- **YM-FEAT-5** The **YouTube Music section switch** ("On YouTube Music") is a shared setting, `musicSection: boolean`, synced with the other shared settings. It's **on** by default. It only gates the section: the features inside it still start off. It sits in two places:
  - at the top of the popup's YouTube Music tab (UI-POP-16);
  - in the header of Settings › YouTube Music (UI-SET-11).

  **Off** means nothing of the extension runs on music.youtube.com. That covers Quick actions, Quick-action shortcuts, and playlist shortcuts' "Also on YouTube Music" and the undo key there. It gates every music.youtube.com registration ([ARC-REG-03](06-architecture.md#66-the-feature-registry)). The user's choices are kept. A feature that's on but held by this switch shows a hatched switch with "YouTube Music is off". YouTube has no such site switch. (R1)
- **YM-FEAT-6** **Off leaves no trace.** In either of these cases, music.youtube.com gets no script, style, element or listener from the extension:
  - the section switch is off;
  - or Quick actions, Quick-action shortcuts and Playlist shortcuts' "Also on YouTube Music" are all off.

  The one exception is the second case's on-demand probe: with the section on and consent given, the popup's Playing now may inject the site core into one YouTube Music tab to read the playing song. It draws nothing and stays inert ([FT-16](04-features-accounts-data.md#13-off-costs-nothing), YM-POP-10; R8).
- **YM-FEAT-7** Each feature's page code loads only while that feature is on. Quick-action shortcuts alone adds no element to the page until a key shows a toast or opens the picker. The picker's code loads in either of two cases: the first time the pointer reaches a Save control (hover intent), or when the picker first opens.
- **YM-FEAT-8** Changes reach open YouTube Music tabs without a reload. That covers buttons, keys, Show feedback, the quick-save playlist and the switches. Switching a feature off removes its elements, styles and listeners from open tabs.
- **YM-FEAT-9** **Presets apply once,** the first time each feature is turned on: Quick actions' default buttons and Quick-action shortcuts' default keys ([FT-04](04-features-accounts-data.md#11-the-features)). Turning a feature off and on again keeps what the user had, and clearing a key never brings its preset back.
- **YM-FEAT-10** **Site access on Chrome:** YouTube Music access is optional ([FT-44](04-features-accounts-data.md#17-site-access-and-youtube-tabs)).
  - It's requested from the click that switches on the first thing that needs it, first run's Agree included: a YouTube Music feature, or Playlist shortcuts' "Also on YouTube Music" while Playlist shortcuts is on (YM-PS-2). The section switch itself never asks. (R53)
  - **Denied from a switch** in the popup or Settings: the switch stays off ([FT-52](04-features-accounts-data.md#17-site-access-and-youtube-tabs)).
  - **Denied at first run's Agree:** consent and the other ticks still apply. The ticked YouTube Music features are saved on but held with "Needs site access", with **Give access** in the popup and Settings. Nothing is registered or injected for them until access is granted. (R14)
  - **Switched on in another browser** and synced here: the same held state until access is granted here.
  - Missing YouTube Music access raises the violet "needs you" "!" only while something that needs it is on, with the section switch on. It shows on every tab, not only YouTube Music's, because without host access the extension can't tell which tabs those are. Only a pending consent or upgrade note comes before it ([UI-IA-08](05-ui.md#51-information-architecture), [FT-47](04-features-accounts-data.md#17-site-access-and-youtube-tabs); R12, R53).
  - On Firefox, the youtube.com access already covers YouTube Music.
- **YM-FEAT-11** Before consent ([ADR-0010](../../../docs/adr/0010-one-consent-gates-every-feature.md), [FT-30](04-features-accounts-data.md#15-the-consent-gate)), no YouTube Music feature runs and nothing is read from YouTube Music, Playing now included.

## 2. Accounts and private windows

- **YM-ACC-1** Every YouTube Music setting except the quick-save playlist is a shared setting: the section switch (`musicSection`), feature switches, buttons, keys and Show feedback. These are the same on every account and travel with settings sync ([ACC-44](04-features-accounts-data.md#28-youtube-music)). Chrome's YouTube Music site access doesn't sync. (R1)
- **YM-ACC-2** YouTube Music's quick-save playlist belongs to the account setup, keyed by `DATASYNC_ID`, which music.youtube.com exposes as youtube.com does. It is separate from YouTube's thumbnail quick-save playlist ([ADR-0003](../../../docs/adr/0003-account-setups-keyed-by-datasync-id.md)).
  - *Runner-up:* one quick-save playlist shared by both sites. It lost because music playlists and video playlists usually differ.
  - **PROVISIONAL** (ticket 25, ticket 11's checks): this assumes `DATASYNC_ID` is stable across sign-out and sign-in, and across browsers.
- **YM-ACC-3** A YouTube Music tab uses its own account and that account's setup. It reads the account from `ytcfg` at page load and keeps it until it reloads, even when a youtube.com tab is on a different account. The installed app's window counts as an ordinary tab.
- **YM-ACC-4** An account seen for the first time has no setup, so Save is in choose mode (YM-SAVE-3). Its first pick creates its account setup. Nothing about the account is stored before that.
- **YM-ACC-5** **Signed out** (`LOGGED_IN` false):
  - Play next, Add to queue, moves and Remove from queue work.
  - Save and Like aren't drawn, because YouTube Music's own menu items are sign-in prompts there.
  - Their keys, and playlist shortcuts, answer with the signed-out failure toast and its **Sign in** action (§13). Like keeps its own wording, "Sign in to YouTube Music to like songs." (R3, R41)
- **YM-ACC-6** **Account changed in another tab:** any response naming a different `datasyncId` than the tab's trips the tab's guard.
  - From then until reload, Save and Like do nothing in this tab. Their buttons show failed, and the toast reads "Your YouTube account changed in another tab. Reload this page to keep saving here.", with **Reload**. It answers every press, because every save and like on YouTube Music is explicit; the once-per-tab toast is auto-add's alone (R22, R55).
  - Play next, Add to queue, moves and Remove from queue keep working, because they change only this tab's queue.
  - A like returns nothing the guard can read, so it relies on an earlier response having tripped the guard.
  - **PROVISIONAL** (ticket 25, M2): if YouTube Music responses carry no `datasyncId`, the guard relies on `ytcfg` at page load only.
- **YM-ACC-7** **Account keys unreadable** (`DATASYNC_ID` or `LOGGED_IN` missing): Save and Like are unavailable in that tab, so nothing is written to an unknown account. Their buttons and keys hide, Quick actions and Quick-action shortcuts are partly working, and the notice is §13's "Account keys unreadable" row ([HEALTH-09](04-features-accounts-data.md#52-status); R50). Queue actions carry on. Playlist shortcuts, which only save, stop there too.
- **YM-ACC-8** **Private windows,** only where the user allows the extension:
  - An account with a quick-save playlist uses it for one-click saves.
  - Choose mode still saves the song, but the pick isn't stored as the quick-save playlist.
  - Pins are disabled, because the quick-save playlist belongs to the account setup. Their tooltip reads "Changes made here are saved; nothing about this window's browsing is." ([ACC-38](04-features-accounts-data.md#27-private-windows-and-containers); R58). **PROVISIONAL** (ticket 23, AMO question 3), with the shared-settings writes it describes.
  - Nothing from the session is stored: no Missing or Full marks, no remembered visibility, and new playlists stay in the tab's memory only.

## 3. Which items get which action

- **YM-QA-1** **The rule:** an action is offered on an item exactly when YouTube Music's own ⋮ menu for that item offers it.
  - Menu items are matched by their command, never by position or label: the queue-add command for each insert position, the remove-from-queue command, the add-to-playlist command and the like command.
  - The menu is read when the pointer or keyboard focus arrives on the item.
  - The rule covers songs, videos, episodes, uploads, artists, signed-out rows and item types YouTube Music adds later. It never offers something YouTube Music would refuse.
- **YM-QA-2** **Save to playlist and Like apply to songs only.** Albums and playlists get Play next and Add to queue.
  - *Runner-up:* Like on an album meaning "Save to library". It lost because that's a different YouTube Music concept, sits on its most-churned endpoint, and isn't an approved quick action.
- **YM-QA-3** **Remove from queue** is offered only on queue items. On the playing song's queue item, it's offered only if that item's ⋮ offers it.
- **YM-QA-4** **On a queue item, Play next and Add to queue move it** (§7) instead of adding a copy.
  - On the playing song's queue item and on autoplay suggestions, they aren't offered as buttons.
  - Keys behave differently on the playing song (YM-TGT-7).
- **YM-QA-5** **No second like button.** Our Like isn't drawn where YouTube Music already shows its own like for that item:
  - every song row, album and playlist track rows included;
  - the player bar.

  It is drawn on song and video cards and on queue items, where YouTube Music has no like.
- **YM-QA-6** A button is drawn only when all three hold:
  - its button is switched on in Quick actions;
  - YM-QA-1 to YM-QA-5 offer the action on that item;
  - YM-ACC-5 allows it.

| Item | Play next | Add to queue | Save to playlist | Like | Remove from queue |
|---|---|---|---|---|---|
| Song row (search, album, playlist, library, Home lists) | ✓ | ✓ | ✓ | — (YouTube Music's own) | — |
| Song or video card | ✓ | ✓ | ✓ | ✓ | — |
| Album or playlist card | ✓ (block) | ✓ (block) | — | — | — |
| Album or playlist page header | ✓ (block) | ✓ (block) | — | — | — |
| Queue item, user's queue | ✓ (move) | ✓ (move) | ✓ | ✓ | ✓ |
| Queue item, the playing song | — (keys insert a copy) | — (keys insert a copy) | ✓ | ✓ | if its ⋮ offers it |
| Queue item, autoplay suggestion | — | — | ✓ | ✓ | if its ⋮ offers it |
| Player bar (the playing song) | — | — | ✓ (opt-in, §16) | — (YouTube Music's own) | — |

✓ means offered, still subject to YM-QA-1 and YM-QA-6.

## 4. Where the controls appear

Exact placement and look are in [05-ui.md](05-ui.md) (UI-YM-09 to UI-YM-16, with the anchor table in UI-YM-16); ticket 27's anchor table is the source.

- **YM-QA-7** **Song rows:**
  - The buttons appear while the pointer is on the row, or while keyboard focus reached by keyboard (`:focus-visible`) is inside it. They leave 120 ms after the pointer leaves.
  - They join the row's own layout just before YouTube Music's like and ⋮, and the title narrows to make room. They never cover the title.
  - At rest, every row looks untouched: no space is reserved.
  - Joining the row on hover is settled, instead of ticket 09's reserved slot. What happens on narrow Quick picks rows is still the user's call (YM-NARROW-1). (R35)
- **YM-QA-8** **Cards** (Home, Explore, artist shelves): the buttons sit on the thumbnail's hover overlay, beside YouTube Music's own play button. They appear when that overlay does.
- **YM-QA-9** **Album and playlist page headers:** Play next and Add to queue sit among YouTube Music's header buttons, before its ⋮. Like those buttons, they're always visible.
  - Why: queueing the album you're looking at shouldn't need the ⋮ menu.
- **YM-QA-10** **Queue items:** the buttons appear on hover or keyboard focus, before the item's ⋮.
- **YM-QA-11** **Order** is the same everywhere: Play next, Add to queue, Save to playlist, Like, Remove from queue. That's YouTube Music's own menu order, and there's no setting to change it.
- **YM-QA-12** **Tooltip:** the action's name, plus its key when it has one. Examples:
  - "Play next (Alt+N)";
  - "Save to Favourites (Alt+P)";
  - the ▾: "Save to playlist… (Alt+Shift+P)";
  - choose mode: "Save to playlist…".

  The key is shown only while Quick-action shortcuts is on, because only then is it live; with the feature off the tooltip is the action alone. The accessible name is always the action plus the item's title, e.g. "Play next: Giorgio by Moroder". (R6)
- **YM-QA-13** **Keyboard:** tabbing into a row shows its buttons. The next Tabs reach our buttons, then YouTube Music's like and ⋮.
- **YM-QA-14** **Isolation:** these events stop at our controls: clicks, pointer and mouse down/up, contextmenu and keys. A click on our button therefore never plays the row, opens the card or expands the Wiz miniplayer. Typing in our picker never reaches YouTube Music's hotkeys.
- **YM-QA-15** **State follows the item, not the element.**
  - A control's busy, done or failed state is keyed by the item's identity: the queue item ID, else the element plus the title.
  - After every queue job, the controls re-read the item under the pointer.
  - Result: when YouTube Music re-renders a different song into the same element, no state or spinner carries over to it.

## 5. The playing song and the pointed-at item

- **YM-TGT-1** **The playing song** is the queue's current item, whether playing or paused, and never an ad. It's read from the page (the media session, the player and the queue), never from the player bar. So actions on the playing song work in every player UI.
- **YM-TGT-2** **The pointed-at item** is whichever the user moved to last: the item under the pointer, or the item holding keyboard focus reached by keyboard (`:focus-visible`).
  - Items are song rows, cards, queue items, album and playlist headers, and the player bar. The player bar means the playing song.
  - It's checked at the moment of the key press, so scrolling counts.
  - A pointer outside the page points at nothing.
- **YM-TGT-3** Something under the pointer that isn't a recognised item, and doesn't look like one, counts as nothing. The key then acts on the playing song.
- **YM-TGT-4** **Self-check.**
  - **When it trips:** the pointer or focus looks like it's on an item, but none was recognised. "Looks like an item" means one of two things:
    - an ancestor within 6 levels holds exactly one distinct `watch?v=`, `playlist?list=`, `browse/MPRE…` or `browse/VL…` link;
    - or it's inside the queue panel.
  - **What happens:** the key does nothing and shows the action-neutral failure "Couldn't tell which item you meant. Point at it again, or use the player.", and an `item-unrecognised` breakage signal is raised ([HEALTH-01](04-features-accounts-data.md#51-what-counts-as-breakage)). It never falls back to the playing song. (R4)
- **YM-TGT-5** **Unsupported item:** if the pointed-at item doesn't support the action, the key does nothing and says why. It never falls back to the playing song, because the user pointed at something else. (R4)
  - A Save key (Alt+P or Alt+Shift+P) or a playlist shortcut on an album, playlist or artist: "Only songs can be saved to playlists."
  - Any other action: "{Action} isn't available for {kind}.", e.g. "Like isn't available for albums." or "Play next isn't available for artists."
  - Two hints are more specific and stay: the Remove key's (YM-RM-5; R67) and a move key's on an autoplay suggestion (YM-MOVE-7).
- **YM-TGT-6** **Nothing pointed at:**
  - with nothing playing, the key answers "Nothing is playing";
  - while an ad plays, it answers "An ad is playing".
  - In fullscreen, items aren't visible, so keys act on the playing song.
- **YM-TGT-7** **Keys on the playing song** (nothing pointed at, the player bar, or the playing song's own queue item): Play next and Add to queue **insert a copy** of it ("play it again"), as YouTube Music's own ⋮ does there. They don't move it.
  - *Runner-up:* answer "That's the song that's playing". It lost because YouTube Music's own Play next inserts a copy there too, and "play this again next" is a real wish.

## 6. Play next and Add to queue

- **YM-Q-1** **Play next on a song** inserts it directly after the playing song.
- **YM-Q-2** **Add to queue on a song** inserts it where YouTube Music's own Add to queue would: at the end of the user's queue, before any autoplay suggestions YouTube Music has appended.
- **YM-Q-3** **On an album or playlist,** both actions insert every song YouTube Music's own menu item would insert, as one block, in the album's or playlist's own order. For example, a 101-song playlist goes in as one block of 101.
- **YM-Q-4** **Shuffle:** they never shuffle, whatever the queue's state. YouTube Music's shuffle is a one-off "Shuffle queue" action (`s`) that the user can run afterwards.
- **YM-Q-5** **Repeat-one:** with repeat-one on, the current song keeps repeating, as after YouTube Music's own Play next.
- **YM-Q-6** **Empty queue** (nothing loaded): both actions start playing the item, as YouTube Music's own menu does. The toast reads `Playing “Get Lucky”` (or `Playing “Random Access Memories”`) and has no Undo.
- **YM-Q-7** **Paused or finished queue:** a normal insert. Playback doesn't start, as with YouTube Music's own actions.
- **YM-Q-8** **Success is confirmed by effect.**
  - The action succeeds only once the queue has grown by the inserted count, within 10 s.
  - If it doesn't grow, the action has failed.
  - There's no "sent, not confirmed" state on YouTube Music. This fixes 1.5.0's unconfirmed queue success.
  - How the queue is read is ARC-ACC-24 ([06-architecture.md §6.2.8.1](06-architecture.md#6281-youtube-music-inserts)).
- **YM-Q-9** After an insert, the responsive-radio flag is turned off, as YouTube Music does after its own inserts.
- **YM-Q-10** An insert never makes YouTube Music show its own "added to queue" toast. Ours is the only one (YM-FB-2).
- **YM-Q-11** **Concurrency:**
  - Queue actions run one at a time per tab, in the order they were triggered. That covers Play next, Add to queue, moves, Remove from queue and their Undos.
  - A busy button ignores further clicks, and a held key's auto-repeat is ignored.
- **YM-Q-12** **Undo** removes the inserted entries that are still waiting. Any entry that has already started playing stays.
- **YM-Q-13** While casting, inserts and their Undo are unavailable (§15).

## 7. Moving queued items

YouTube Music's own Play next on a queued song inserts a second copy. 2.0 moves the existing entry instead ([ticket 28](../issues/28-queue-reorder.md)). It does this through YouTube Music's own reorder path, the queue panel's drag-drop handling, without clicking anything visible ([06-architecture.md §6.2.8.2](06-architecture.md#6282-youtube-music-moves), ARC-ACC-26 to ARC-ACC-29).

- **YM-MOVE-1** **What the move does:**
  - **Play next** on a queue item moves it to right after the playing song.
  - **Add to queue** on a queue item moves it to the end of the queue.
  - No copy is made.
  - Neither is offered on the playing song's queue item or on autoplay suggestions (YM-QA-4).
  - While casting, moves are unavailable (YM-CAST-4).
- **YM-MOVE-2** **Before firing,** the move checks that the item is still in the queue where it was read. A stale target is never moved; it fails (YM-MOVE-4). Reason: the reorder path moves the last item when it can't find its target.
- **YM-MOVE-3** **After firing,** the move confirms the item's new position.
- **YM-MOVE-4** **If the item didn't move:**
  - the move has failed: "Couldn't move “Lady”. Try YouTube Music's ⋮ menu.";
  - a `no-effect` breakage signal counts it (§14).
- **YM-MOVE-5** **Already there:** if the item already plays next, or is already last, nothing is moved. The neutral hint reads `“Lady” already plays next` or `“Lady” is already at the end of the queue`.
- **YM-MOVE-6** **Success** shows `Moved “Lady” to play next` or `Moved “Lady” to the end of the queue`, with **Undo**, which moves it back to its old position.
- **YM-MOVE-7** **Autoplay suggestions** can't be moved. A Play next or Add to queue key pointed at one answers: "Autoplay suggestions can't be moved. Use YouTube Music's ⋮ menu to add a copy."
- **YM-MOVE-8** **No done state:** after a move, the button shows no done check, only busy while the move runs. The toast confirms.
  - Why: YouTube Music re-renders every queue item, so a check would land on whichever song now fills that element.
- **YM-MOVE-9** **Server copy:** the move goes to YouTube's server copy of the queue exactly as YouTube Music's own drag does (never while casting, YM-CAST-4). That request is fire-and-forget: its failure never reaches the page, and the tab keeps the move. This is accepted.

## 8. Remove from queue

- **YM-RM-1** It removes that one entry from the queue, not every copy of the song. YouTube's server copy of the queue updates too.
- **YM-RM-2** It's offered on queue items under YM-QA-3. While casting it's unavailable (YM-CAST-2).
- **YM-RM-3** **Success** shows `Removed “Get Lucky” from the queue`, with **Undo**, which puts the song back at its old position (re-insert, then move).
- **YM-RM-4** After a remove, the button shows no done state; the toast confirms. The reason is YM-MOVE-8's.
- **YM-RM-5** **The Remove key** acts only on a pointed-at queue item. With anything else pointed at, or nothing, it answers "Point at a song in the queue to remove it." This replaces R4's general "{Action} isn't available for {kind}." there, which would wrongly say Remove isn't available for songs. It never removes the playing song by fallback. (R67)

## 9. Save to playlist

Save to playlist is an **add** through the shared add flow ([ticket 12](../issues/12-adding.md); YouTube's statement of it is [02-youtube.md §2.5](02-youtube.md#25-the-add-flow)). This section states the flow as it applies on YouTube Music.

- **YM-SAVE-1** **A split button:**
  - the main part saves the song to the quick-save playlist in one click;
  - the ▾ part opens the playlist picker.
- **YM-SAVE-2** **Choose mode:** an account with no quick-save playlist, including one seen for the first time, is in choose mode.
  - The button is a single "Save to playlist…" button.
  - It opens the picker in choose mode, titled "Save songs to…".
- **YM-SAVE-3** **The choose-mode pick:**
  - saves the song;
  - becomes the account's quick-save playlist (except in private windows, YM-ACC-8);
  - closes the picker;
  - shows `Saved “Get Lucky” to Favourites. One click now saves there.` with **Undo**.
- **YM-SAVE-4** **Later ▾ picks are one-off:** they never change the quick-save playlist. Only the picker's pin, or Settings, change it.
  - *Runner-up:* the last-used playlist becomes the one-click target. It lost because a single mis-pick would silently redirect every later save.
- **YM-SAVE-5** **Order of checks:**
  1. signed in: on a signed-out page, the signed-out failure (§13) comes before anything else;
  2. the feature has a quick-save playlist on this account (else choose mode);
  3. a membership read, which is also the account guard;
  4. the add;
  5. one toast.

  An explicit save is never channel-filtered. (R25)
- **YM-SAVE-6** **Already in:**
  - Nothing is added. The neutral hint `“Get Lucky” is already in Favourites` shows even with Show feedback off, and it isn't a failure.
  - YouTube Music's own duplicate rejection also reads as already in.
  - YouTube Music's own "This track is already in the playlist" toast, with its Add anyway, never shows.
  - The extension never sends the skip-duplicate-check option.
- **YM-SAVE-7** **When membership can't be read:**
  - If the membership read fails outright (network, signed out, account mismatch), nothing is written.
  - **PROVISIONAL** (ticket 25): if the account part checks out but membership is unreadable, the explicit save still goes ahead. YouTube Music's own duplicate rejection still catches a second copy.
- **YM-SAVE-8** **Missing quick-save playlist:**
  - The save fails with `Couldn't save “Get Lucky”: Favourites doesn't exist anymore.` and a **Choose** action, which opens the picker in choose mode.
  - The setting is kept, not cleared, and Settings marks it *Missing*. The mark also sets the violet "needs you" "!" on the toolbar, for every tab ([UI-IA-08](05-ui.md#51-information-architecture); R12).
  - Each later save tries it again.
  - The mark clears when the playlist appears in a listing again.
- **YM-SAVE-9** **Full quick-save playlist:** `Couldn't save “Get Lucky”: Favourites is full.` with **Choose**. It's marked *Full* the same way.
- **YM-SAVE-10** **Undo** removes exactly the entry this save created (by its `setVideoId`), and nothing else. The quick-save playlist setting stays as it is, including after a choose-mode first pick.
- **YM-SAVE-11** **Repeated presses:**
  - While a save is pending, the same button or key is ignored.
  - Once it's done, pressing again reports already in.
  - One-click saves and keys never toggle a song out of a playlist.
- **YM-SAVE-12** **Pending by key:** a key-triggered save with no visible button and no outcome after 1 s shows `Saving “Get Lucky” to Favourites…`. It then turns into the outcome in place. With that key's Show feedback off, the pending toast isn't shown either; only a failure shows. (R7)
- **YM-SAVE-13** **Just-created playlist:** a quick-save playlist the extension created less than 30 s earlier, in a settings chooser, is saved to only once it's 30 s old. The button stays busy meanwhile. Reason: YouTube Music refuses edits to a new playlist for about 20 s.
- **YM-SAVE-14** **Rate limits:** after a rate-limit answer (HTTP 429), all adds for that account pause for 60 s. Adds that start during the pause fail at once. Every save on YouTube Music is explicit, so each one still answers with the rate-limited failure toast; the once-per-session silence applies to auto-add only. (R22)
- **YM-SAVE-15** **Button states:**
  - idle;
  - busy as soon as it's clicked;
  - done (saved icon, 1.5 s) or failed (error icon, 1.5 s);
  - back to idle after "already in", whose hint is a toast.
- **YM-SAVE-16** Hovering the split button preloads the picker's code.
- **YM-SAVE-17** **Concurrency:** saves and removals of the same song and playlist are ordered by the background's add coordinator, across tabs and features. A later one resolves against the earlier one's result.

## 10. The playlist picker

The picker is shared with YouTube ([ticket 12](../issues/12-adding.md); [02-youtube.md §2.6](02-youtube.md#26-the-playlist-picker); its look is [UI-PICK-01 to UI-PICK-16](05-ui.md#57-the-shared-playlist-picker-and-key-recorder)). On YouTube Music it behaves as follows.

- **YM-PICK-1** **It opens from:**
  - a Save control's ▾;
  - the single Save button in choose mode;
  - Alt+Shift+P;
  - Alt+P in choose mode;
  - a playlist shortcut toast's **Choose**, in choose mode for that shortcut (YM-PS-4; R24, R45);
  - the popup's Playing now ▾, as the popup's own sheet (§17).
- **YM-PICK-2** **Position:**
  - Opened from a control, it's anchored to that control.
  - Opened by key, it's anchored to the target's Save button when one is shown. Otherwise it's centred above the player.
- **YM-PICK-3** **Contents, top to bottom:** (R39)
  1. The title "Save to playlist", with a ↻ "Refresh playlists" button, a "Sort A–Z" toggle and ✕. In choose mode, the title is "Save songs to…", with "The playlist you pick here becomes your one-click Save."
  2. The song: art, title, and artist · album, so a picker opened by key shows what it will save.
  3. A search field, focused on open, which narrows the list by title.
  4. The account's playlists, in the order YouTube Music's own Save dialog lists them, or A–Z while the toggle is on. The toggle is stored per device. Watch Later appears only if YouTube Music's list includes it.
  5. "+ New playlist".
- **YM-PICK-4** **Each playlist row shows:**
  - its check mark;
  - its title;
  - its privacy and song count, e.g. "Private · 214 songs";
  - the key of the playlist shortcut that saves to it on this account, if there is one and it's live here (Playlist shortcuts with "Also on YouTube Music" on), e.g. `Alt+J` (R6, as [YT-KEY-34](02-youtube.md#288-key-hints) applies it);
  - a pin, "Use for one-click save". The pin shows on hover or focus, and always on the quick-save playlist.
- **YM-PICK-5** **Loading:**
  - Rows paint at once from the cached playlist list.
  - If that cache is older than 5 minutes, the list refreshes by itself on open. ↻ always refreshes it. (R39)
  - Membership is fetched fresh on every open. The check marks show a loading state until it arrives.
  - Rows work before membership is known. An add then reports already in on the row if it was.
- **YM-PICK-6** **Check marks:** every playlist that already holds the song gets one.
  - Membership comes from YouTube Music's own answer if it carries membership.
  - Otherwise it comes from a youtube.com serving tab on the same account, in a window of the same kind.
  - If neither can be read:
    - the list still works, with no check marks;
    - it shows "Couldn't check where this song already is";
    - Quick actions is partly working.
  - **PROVISIONAL** (ticket 25, M2): whether YouTube Music's answer carries membership.
- **YM-PICK-7** **Ticking a row** saves the song there at once, through YM-SAVE-5's flow.
  - The row shows its own result: busy, then checked, or an inline "Couldn't save".
  - Nothing in the picker raises a toast. The one exception is the choose-mode pick (YM-SAVE-3).
- **YM-PICK-8** **Unticking a checked row: PROVISIONAL** (the user's go-ahead, tickets 12 and 26; listed in `for-the-user.md`). youtube.com's own Save dialog does this, but for the extension it's arguably a new capability.
  - **If approved,** unticking removes the song from that playlist:
    - It starts with the membership read and account guard, and is never filtered.
    - It's ordered with any add of the same song and playlist.
    - It removes exactly the entry this picker's own tick added, if it did. Otherwise it removes whatever YouTube's own Save dialog removes for that row.
    - The row shows busy, then unchecked, or reverts to checked with an inline "Couldn't remove".
    - Ticking again is the undo, and puts the song at the end of the playlist.
    - If the playlist is one of the account's auto-add playlists, the untick also sets the session skip for that song.
  - **If declined,** checked rows show "Already in" and do nothing.
  - *Runner-up:* checked rows can't be changed. It lost because a checklist you can't untick is surprising, and it forces a trip to the playlist page.
- **YM-PICK-9** **The pin** makes that playlist the account's quick-save playlist. In private windows the pins are disabled (YM-ACC-8).
- **YM-PICK-10** **New playlist** uses the shared create flow and opens an inline form:
  - **Title:** required and trimmed, up to 150 characters (**PROVISIONAL**, ticket 25). `<` and `>` are refused inline with "Titles can't contain < or >".
  - **Visibility:** Private, Unlisted or Public. The default is Private, then the last visibility picked on this device.
  - **Same title:** a title the account already uses is allowed, with the hint "You already have a playlist called {title}."
  - **Create** is disabled while a creation is pending.
  - **The result:** the playlist is created with the song already in it, in one request, which avoids YouTube Music's ~20 s edit refusal. Its row appears checked.
  - **One-click save:** it becomes the quick-save playlist only in choose mode, or if the user pins it.
  - **Listing:** it's kept locally and listed until YouTube lists it, or for 24 h. In private windows, only in the tab's memory.
  - **Failures** show inline and keep the typed title:
    - "YouTube won't create more playlists right now. Try again in a few minutes."
    - the public daily cap, "You've reached YouTube's daily limit for new public playlists. Make this one private or unlisted, or try again tomorrow.";
    - no channel, "This account needs a YouTube channel to create playlists", with a Create channel link;
    - "YouTube doesn't let this account create playlists.";
    - anything else, "Couldn't create the playlist. Try again, or create it on YouTube."
- **YM-PICK-11** **Closing:** Esc, a click outside, or ✕. The picker handles Esc itself and stops it there, so YouTube Music's own Esc doesn't also collapse the player page.
- **YM-PICK-12** **Keys inside the picker:**
  - ↓ from the search field moves into the rows;
  - ↑, ↓, Home and End move between rows;
  - Space or Enter ticks;
  - Enter in the search field ticks the first match.
- **YM-PICK-13** While the picker is open, quick-action keys, playlist shortcuts and the undo key are ignored.
- **YM-PICK-14** **Slow load:** an explicit open waits up to 5 s for the picker's code. After that, the toast reads "Couldn't open the playlist list. Try again."
- **YM-PICK-15** **Signed out:** the picker never opens (YM-ACC-5).

## 11. Like / unlike

- **YM-LIKE-1** **It toggles:**
  - a song that isn't liked, or is disliked, gets liked;
  - a liked song loses its like.
- **YM-LIKE-2** **The icon** is outlined or filled according to YouTube Music's own like state, and stays in step with it. That includes changes made with YouTube Music's own like button.
- **YM-LIKE-3** **By click,** success shows no toast; the icon is the feedback, as with YouTube Music's own like button. Busy and failed states show on the button.
- **YM-LIKE-4** **By key,** the toast shows `Liked “Get Lucky”` or `Unliked “Get Lucky”`, with **Undo**. There may be no button in view, which is why a key gets a toast.
- **YM-LIKE-5** **Undo** restores the previous state exactly: liked, not liked, or disliked.
- **YM-LIKE-6** **Scope:**
  - songs only (YM-QA-2), and never a second like button (YM-QA-5);
  - a key pointed at an album or playlist answers "Like isn't available for albums." or "Like isn't available for playlists." (R4);
  - signed out, the key answers with the failure "Sign in to YouTube Music to like songs." and **Sign in**: R3's failure, in Like's own wording (R3, R41).
- **YM-LIKE-7** **PROVISIONAL** (ticket 25, M3): likes go through YouTube Music's own like handling, which is the only route past its bot check. They are expected to show no YouTube Music toast.
  - If M3 finds that YouTube Music shows its own toast, there's no quiet route for likes. YouTube Music's toast then stands in for ours on likes, so only one shows.
  - M3 also checks that the Wiz miniplayer's like repaints after our like.

## 12. Keys (Quick-action shortcuts)

Keys use the one shortcut engine shared with YouTube ([ADR-0004](../../../docs/adr/0004-shortcuts-caught-in-page.md), [ticket 08](../issues/08-shortcuts.md), [02-youtube.md §2.8](02-youtube.md#28-playlist-shortcuts-the-picker-key-and-the-undo-key)). The key recorder is [UI-PICK-23](05-ui.md#the-key-recorder).

- **YM-KEY-1** **Default keys.** They're live as soon as the feature is turned on, and each one can be changed or cleared.

  | Action | Default key |
  |---|---|
  | Play next | Alt+N |
  | Add to queue | Alt+Q |
  | Save to playlist: the quick-save playlist, or the picker in choose mode if none is set | Alt+P |
  | Save to playlist… (the picker) | Alt+Shift+P |
  | Like / unlike | Alt+L |
  | Remove from queue | Alt+R |

  - **The undo key, Alt+U,** isn't one of these. It's preset at install and set in Settings › Everywhere (YM-KEY-4; R44).
  - **Why these keys:** every Alt combination is free on YouTube Music's side. These letters also avoid the browsers' menu keys: Firefox's Alt+F/E/V/S/B/T/H, Chrome's Alt+D/E/F, and Chrome's reserved Alt+Shift+A/B/I/N/R/T.
  - **Why set by default:** 1.x's unset-by-default shortcut is on the friction list, and keys leave no trace on the page.
- **YM-KEY-2** **A preset never takes a key** that another shortcut already uses on YouTube Music. That preset is left without a key, and its row says "No key: Alt+P is used by {Other}".
- **YM-KEY-3** **Where keys are caught:** in the music.youtube.com page's top frame, only while that page has focus. There are no browser keyboard commands. Settings says: "Shortcuts work while a YouTube or YouTube Music page is in focus. If one does nothing, the browser or another extension may be using that key."
- **YM-KEY-4** **The undo key** (Alt+U unless changed or cleared) belongs to no feature. It's one key for every page of both sites, preset to Alt+U at install and set in Settings › Everywhere, whose row for it shows whenever any feature on either site is on ([FT-05](04-features-accounts-data.md#11-the-features), [YT-KEY-05](02-youtube.md#281-the-feature-and-its-keys)). (R2, R44)
  - It works on YouTube Music whenever a toast with Undo is on screen there, whichever feature raised it. So it works with only Quick actions on. Its listener is the site core's one key listener, so this costs nothing extra.
  - It runs Undo on the toast showing in this tab, exactly as clicking Undo would.
  - While a shortcut feature is on there (Quick-action shortcuts, or Playlist shortcuts with "Also on YouTube Music"), the key is always caught. With no Undo toast on screen it then shows "Nothing to undo.", even with Show feedback off. (R44)
  - While neither is on, a press with no Undo toast on screen passes through untouched.
  - With the section switch off, it does nothing on YouTube Music (YM-FEAT-5).
- **YM-KEY-5** **A key is ignored, and passes through untouched, when:**
  - focus is in an editable field: a text-type input, a textarea or a select, anything contenteditable, or a textbox, searchbox, combobox or spinbutton role;
  - an IME composition is under way;
  - a menu or dialog is open, whether YouTube Music's or ours;
  - the event is an auto-repeat;
  - the same shortcut's previous action hasn't finished.
- **YM-KEY-6** **Matching:**
  - The modifier set must match exactly.
  - For a shortcut recorded on a plain letter or digit, a press that produces a plain ASCII letter or digit is compared by character. So Alt+N lands on the key labelled N on AZERTY, QWERTZ and Dvorak.
  - Everything else is compared by physical key.
  - AltGr never counts as Alt, and Ctrl+Alt combinations can't be recorded.
- **YM-KEY-7** **On a match,** the listener takes the key before any of YouTube Music's listeners, and YouTube Music never sees it. A key that matches nothing is never touched.
- **YM-KEY-8** **Clashes with YouTube Music's own keys:**
  - YouTube Music's keys are Space, `;`, j, k, l, h, s, r, =, -, m, q, Esc, f, +, _, ?, / and the g-sequences, plus a few Shift and Ctrl+Shift combinations.
  - When the user records one of these, the recorder names the clash: "YouTube Music uses Q for Toggle queue. This shortcut replaces it on YouTube Music." The user may keep it, and ours then wins on YouTube Music.
  - The defaults clash with nothing.
- **YM-KEY-9** **One key, one shortcut, per site.**
  - Quick-action keys, playlist shortcut keys and the undo key share YouTube Music's key space. A shortcut counts there whether its feature is on or off.
  - YouTube's own picker key doesn't count on YouTube Music.
  - Recording a key already used there shows "{Key} is already used by {Other}.", e.g. "Alt+P is already used by Save to playlist (YouTube Music)", with **Use it here** and **Cancel**.
- **YM-KEY-10** **What each key does** to the pointed-at item, else the playing song (§5):

  | Key | Song row or card | Album or playlist | Queue item | Nothing pointed at |
  |---|---|---|---|---|
  | Play next | insert after the playing song | insert as a block | move to play next; on the playing song, insert a copy; on an autoplay suggestion, the "can't be moved" hint | insert a copy of the playing song |
  | Add to queue | insert at the end | insert as a block | move to the end; on the playing song, insert a copy; on an autoplay suggestion, the hint | insert a copy of the playing song |
  | Save (Alt+P) | quick-save, or the picker in choose mode | "Only songs can be saved to playlists." | quick-save | quick-save the playing song |
  | Save… (Alt+Shift+P) | open the picker | "Only songs can be saved to playlists." | open the picker | open the picker for the playing song |
  | Like | toggle | "Like isn't available for albums." / "…for playlists." | toggle | toggle the playing song |
  | Remove | "Point at a song in the queue to remove it." | same | remove it | "Point at a song in the queue to remove it." |

  For an item whose ⋮ doesn't offer the action, the key does nothing and answers "{Action} isn't available for {kind}." (YM-TGT-5). The Remove key is the exception: it always answers with YM-RM-5's hint. (R4, R67)
- **YM-KEY-11** **Shared states:** if the pointed-at item shows the matching button, that button goes through the same busy, done or failed states as for a click.
- **YM-KEY-12** **Unavailable or not working:**
  - **An action unavailable in this tab** (its internals are missing, YM-FAIL-4) has its key withdrawn there: the key isn't caught and passes through untouched, as ticket 26 has it. The feature's notice (YM-FAIL-5) and status (YM-FAIL-6) say why. (R50)
  - **A feature that isn't working** in this tab (none of its actions left, YM-FAIL-4, or the whole site, YM-FAIL-9) keeps its keys caught. Each press answers with the failure, e.g. "Play next (Alt+N) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now." ([HEALTH-10](04-features-accounts-data.md#52-status)).
- **YM-KEY-13** **No highlight:** the acted-on item isn't highlighted. The toast names the song.

## 13. Feedback, toasts and Undo

- **YM-FB-1** **Our own toast,** made to look like YouTube Music's ([UI-TOAST-14](05-ui.md#skins)).
  - It appears where YouTube Music's toasts do: bottom left, above the player bar or Wiz miniplayer. It stacks above YouTube Music's own bottom-left surfaces.
  - Only one shows at a time, and the newest replaces the one showing.
  - *Runner-up:* YouTube Music's own toast (`handleAddToToastAction`). It lost because it can't carry an Undo that runs our code, or tell a failure apart from a success. Showing both lost because of the double toasts.
- **YM-FB-2** **Exactly one toast per action.** No action of ours makes YouTube Music show its own toast or dialog. The one exception is YM-LIKE-7's fallback.
- **YM-FB-3** **Timing:**
  - A toast stays 6 s.
  - It's held while the pointer or keyboard focus is on it.
  - Its timer runs only while the tab is visible, and a toast raised in a hidden tab waits until the tab is visible. Only one is held: the newest failure, else the newest confirmation.
- **YM-FB-4** **Fullscreen:** toasts that answer a click or key show in fullscreen, at the same spot. The sticky not-working notice waits until fullscreen ends.
- **YM-FB-5** **Navigation:** toasts survive YouTube Music's in-app navigation, so Undo still works on the next page. A reload or closing the tab ends them.
- **YM-FB-6** **Show feedback:**
  - A click follows Quick actions' switch, a quick-action key follows Quick-action shortcuts' switch, and a playlist shortcut follows Playlist shortcuts' switch.
  - Off hides confirmations only, and the pending "Saving…" toast with them (R7). Failures and "nothing happened" hints always show, because an explicit click or key that silently does nothing is a defect ([FT-24, FT-25](04-features-accounts-data.md#14-show-feedback)).
  - A control's own state always shows: button states and picker rows.
  - *Runner-up:* off hides everything. It lost because failures would go silent.
- **YM-FB-7** **Button states:**
  - idle;
  - busy as soon as it's clicked;
  - done (a check for 1.5 s) or failed (an error icon for 1.5 s);
  - with no answer after 10 s, failed.

  Moves and removes show no done state (YM-MOVE-8).
- **YM-FB-8** **What Undo does:**

  | Action | Undo |
  |---|---|
  | Play next or Add to queue (insert) | Removes the inserted entries still waiting. Entries that have started playing stay. |
  | Play next or Add to queue (move) | Moves the item back to its old position. |
  | Remove from queue | Puts the song back at its old position. |
  | Save | Removes exactly the entry the save created. |
  | Like or unlike by key | Restores the previous like state. |
  | Empty queue started playback | No Undo. |

- **YM-FB-9** **After Undo:** the toast closes once Undo succeeds. If Undo fails, the toast reads "Couldn't undo." While casting, the Undo of a queue edit answers "Not available while casting" instead (YM-CAST-2).
- **YM-FB-10** **Copy rules:**
  - Song, album and playlist titles are in typographic double quotes (“ ”), cut at 40 characters with "…" (R45).
  - Playlist names in save toasts are unquoted, also cut at 40. The one exception is `{Shortcut} now saves to “{Playlist}”.`, where the quotes keep the two names apart (R24, R45, as YT-ADD-18).
  - Failures start with "Couldn't …", and toasts say "song", not "video".
  - When an album's or playlist's song count is unknown, the count is dropped: `“Random Access Memories” will play next`.
  - Titles come from the item's data read at click time.
- **YM-FB-11** **Styling:** failures lead with the error icon, and hints are neutral. No YouTube Music toast carries the extension mark, because every one answers the user's own click or key.
- **YM-FB-12** **Console log:** every save logs its outcome to the tab's console, whatever Show feedback says.

**All toast copy on YouTube Music** (ticket 26's table, ticket 27's additions, ticket 12's add-flow rows, ticket 18's breakage rows, and resolutions R3, R4, R5, R7, R24, R41, R45, R50, R56 and R67):

| When | Toast | Action | Kind |
|---|---|---|---|
| Play next, song | “Get Lucky” will play next | Undo | Confirmation |
| Play next, album or playlist | 13 songs from “Random Access Memories” will play next | Undo | Confirmation |
| Add to queue, song | Added “Get Lucky” to the queue | Undo | Confirmation |
| Add to queue, album or playlist | Added 13 songs from “Random Access Memories” to the queue | Undo | Confirmation |
| Empty queue started playback | Playing “Get Lucky” | — | Confirmation |
| Queue item, Play next | Moved “Lady” to play next | Undo | Confirmation |
| Queue item, Add to queue | Moved “Lady” to the end of the queue | Undo | Confirmation |
| Remove from queue | Removed “Get Lucky” from the queue | Undo | Confirmation |
| Save | Saved “Get Lucky” to Favourites | Undo | Confirmation |
| Save, first pick in choose mode | Saved “Get Lucky” to Favourites. One click now saves there. | Undo | Confirmation |
| Like or unlike by key | Liked “Get Lucky” / Unliked “Get Lucky” | Undo | Confirmation |
| A playlist shortcut's playlist chosen through **Choose** (the song is saved too) | {Shortcut} now saves to “{Playlist}”. | Undo | Confirmation (R24, R45) |
| Save by key, pending after 1 s | Saving “Get Lucky” to Favourites… (turns into the outcome) | — | Progress: hidden with Show feedback off, like a confirmation (R7) |
| Save, already in | “Get Lucky” is already in Favourites | — | Hint |
| Queue item already there | “Lady” already plays next / “Lady” is already at the end of the queue | — | Hint |
| Key, nothing to act on | Nothing is playing | — | Hint |
| Key, nothing pointed at, during an ad | An ad is playing | — | Hint |
| Remove key with no queue item pointed at | Point at a song in the queue to remove it. | — | Hint (R67) |
| A Save key, the Save… key or a playlist shortcut on an album, playlist or artist | Only songs can be saved to playlists. | — | Hint (R4) |
| Any other key on an item that doesn't support its action | {Action} isn't available for {kind}. (e.g. Like isn't available for albums. / Play next isn't available for artists.) | — | Hint (R4) |
| Move key on an autoplay suggestion | Autoplay suggestions can't be moved. Use YouTube Music's ⋮ menu to add a copy. | — | Hint |
| A playlist shortcut with no playlist on this account | {Shortcut} has no playlist on {Account} yet. | Choose | Hint: neutral, shown even with Show feedback off (R24, R56) |
| Any queue edit while casting: insert, move, Remove from queue, or the Undo of one | Not available while casting | — | Hint (R5, R46) |
| Undo key with nothing to undo | Nothing to undo. | — | Hint |
| Signed out, Save key or a playlist shortcut | Sign in to YouTube Music to save songs. † | Sign in | Failure (R3) |
| Signed out, Like key | Sign in to YouTube Music to like songs. † | Sign in | Failure (R3, R41) |
| Play next or Add to queue failed (song, album or playlist) | Couldn't add “Get Lucky” to the queue. Try YouTube Music's ⋮ menu. | — | Failure |
| Move failed | Couldn't move “Lady”. Try YouTube Music's ⋮ menu. | — | Failure |
| Remove failed | Couldn't remove “Get Lucky” from the queue. Try YouTube Music's ⋮ menu. | — | Failure |
| Save failed (failed status or unrecognised answer) | Couldn't save “Get Lucky” to Favourites. Try YouTube Music's ⋮ menu. | — | Failure |
| Like failed | Couldn't like “Get Lucky”. Try YouTube Music's ⋮ menu. | — | Failure |
| Save, offline | Couldn't save “Get Lucky” to Favourites. Check your connection. | — | Failure |
| Save, no answer in 10 s | Couldn't confirm “Get Lucky” was saved to Favourites. YouTube Music didn't answer. † | — | Failure |
| Quick-save playlist deleted | Couldn't save “Get Lucky”: Favourites doesn't exist anymore. | Choose | Failure |
| Quick-save playlist full | Couldn't save “Get Lucky”: Favourites is full. | Choose | Failure |
| A playlist shortcut's playlist deleted or full | Couldn't save “Get Lucky”: Favourites doesn't exist anymore. / Couldn't save “Get Lucky”: Favourites is full. | Settings | Failure (R38) |
| YouTube Music refuses the song | YouTube Music doesn't allow saving “Get Lucky” to playlists. † | — | Failure |
| Rate-limited | Couldn't save “Get Lucky”. YouTube Music is limiting requests, so try again in a minute. † | — | Failure |
| Account can't use playlists | YouTube doesn't let this account save to playlists. | — | Failure |
| Account changed in another tab | Your YouTube account changed in another tab. Reload this page to keep saving here. | Reload | Failure |
| Undo failed | Couldn't undo. | — | Failure |
| Picker code didn't load in 5 s | Couldn't open the playlist list. Try again. | — | Failure |
| A key pointing at an unrecognised item | Couldn't tell which item you meant. Point at it again, or use the player. | — | Failure (R4) |
| A key while its feature isn't working (YM-KEY-12) | Play next (Alt+N) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now. | — | Failure (R50) |
| Notice for actions that aren't working or are unavailable (sticky, once per session; YM-FAIL-5) | Play next and Add to queue aren't working right now because YouTube Music changed something. Use its ⋮ menu for now. | Details, ✕ | Failure (R50) |
| Account keys unreadable | Saving isn't working right now because YouTube Music changed how it shows which account you're using. Nothing is saved, so nothing lands in the wrong account. † | Details | Failure |
| The whole site | {Product} isn't working on YouTube Music right now because YouTube Music changed something. An update should fix it. | Details | Failure |

- **Kinds:**
  - **Confirmation:** hidden when Show feedback is off.
  - **Hint:** neutral styling, always shown.
  - **Failure:** error icon, always shown.
- **Actions:**
  - **Choose** opens the picker in choose mode: for the quick-save playlist after a Missing or Full failure, or for that shortcut after a shortcut with no playlist, where the pick also saves the song (R24, R45).
  - **Sign in** opens YouTube's sign-in page, which returns to this page.
  - **Reload** reloads the tab.
  - **Details** opens Settings at Diagnostics (`#diagnostics`).
  - **Settings** opens Settings at the shortcut's playlist row, `#feature-shortcuts&playlist=<playlistId>` (R38).
- `{Product}` is the extension's in-product name, **PROVISIONAL** on [ticket 22](../issues/22-name.md) ("Playlist Pigeon"). Every chapter writes it `{Product}` (R65).

## 14. Failures and breakage

- **YM-FAIL-1** **A failed request:** when a request fails, times out after 10 s, or returns a failed status:
  - the button shows failed;
  - the failure toast says what didn't happen and points to YouTube Music's ⋮ menu, which keeps working when our path breaks.
  - Writes are never re-sent automatically. Pressing again starts over from the membership read, for saves.
  - *Runner-up:* an "Open menu" action in the toast. It lost because it means clicking YouTube Music's ⋮ for the user. That adds a markup dependency and stretches the "never drive the visible UI" exemption, to save one click on a ⋮ right beside our button.
- **YM-FAIL-2** **The item's data can't be read** when its control is clicked or its key is pressed: that counts as a failure for that item.
- **YM-FAIL-3** **Mid-action changes:** if the row is recycled, or the user navigates away, while an action runs, the action finishes on the data read at click time, and its toast still shows.
- **YM-FAIL-4** **YouTube Music changed.** When the page loads, the extension checks that each action's internals exist. Status is per feature, so an action whose internals are missing is *unavailable* in that tab, not a status of its own (R50):
  - its buttons and its key are withdrawn there: no button is drawn, and the key passes through untouched (YM-KEY-12; ticket 26);
  - the feature is *partly working* in that tab while some of its actions still work, and its status detail names the unavailable ones, e.g. "Partly working: Play next and Add to queue are unavailable." ([HEALTH-07](04-features-accounts-data.md#52-status));
  - with none of its actions left, the feature is *not working* there.
- **YM-FAIL-5** **The not-working notice:**
  - It's a sticky toast with the error icon, **Details** and ✕. It names the actions that are unavailable or not working, so it's ticket 26's one notice for withdrawn actions too, the only in-page sign that their keys now pass through (R50).
  - It shows once per browser session per feature on YouTube Music, at the moment the feature would act: when the first hover would have drawn the buttons, or when a key is pressed.
  - It appears in the first visible tab where the problem is found, and several actions found at once share one notice.
  - It waits while the tab is hidden or fullscreen.
- **YM-FAIL-6** **Status surfaces:** while a feature is partly working or not working in a tab:
  - the popup shows a strip under its header (UI-POP-09);
  - Settings shows a status line under the feature (UI-SET-09), naming the unavailable actions;
  - only *not working* sets the toolbar's amber "!", on that tab, unless a pending consent or missing site access takes priority. Partly working, unavailable actions included, sets no badge ([UI-IA-08](05-ui.md#51-information-architecture), [HEALTH-15](04-features-accounts-data.md#53-where-it-shows); R12, R50).

  Show feedback hides none of these ([HEALTH-13 to HEALTH-18](04-features-accounts-data.md#53-where-it-shows)).
- **YM-FAIL-7** **No effect:** a recognised answer whose effect never shows counts as failed. That covers a queue that doesn't grow (YM-Q-8) and a moved item that isn't where it should be (YM-MOVE-4). A `no-effect` breakage signal is raised after 2 in a row *(starting value)*.
- **YM-FAIL-8** **Anchors:**
  - The check runs 3 s after each navigation *(starting value)*. If the page holds at least 6 item links and fewer than half are recognised as items, an `anchor-missing` breakage signal is raised.
  - A missing player-bar anchor isn't breakage (YM-BAR-3).
- **YM-FAIL-9** **The whole site:** if YouTube Music's app can't be found (`ytmusic-app`), every YouTube Music feature is not working in that tab.
- **YM-FAIL-10** **Partly working** covers lost optional parts and unavailable actions:
  - the picker's check marks (YM-PICK-6);
  - the player-bar Save's anchor, when YouTube Music should be drawing it;
  - some of a feature's actions unavailable (YM-FAIL-4; R50);
  - Save and Like with the account keys unreadable (YM-ACC-7; R50).
- **YM-FAIL-11** A tab's status clears by itself when the job next succeeds, or on reload when the check passes.
- **YM-FAIL-12** **A quiet route turned noisy:** if YouTube Music shows its own toast after one of our queue edits, a `quiet-route-noisy` breakage signal is recorded and the feature that made the edit (Quick actions or Quick-action shortcuts) is *partly working* in that tab. The edit stands, and our own toast for it is suppressed, so only one shows ([Q-WATCH-28](07-quality.md#757-runtime-breakage-signals), [ARC-ACC-22](06-architecture.md#627-route-table-youtube-music)). The signal identifiers are chapter 07's ([Q-WATCH-24](07-quality.md#757-runtime-breakage-signals)). (R40, R51)

## 15. Casting

- **YM-CAST-1** Casting exists only in Chrome. On Firefox, the casting state never applies.
- **YM-CAST-2** **While casting, every queue edit is unavailable,** with one message (R5):
  - inserts by Play next and Add to queue, including inserting a copy of the playing song;
  - moves of a queued song;
  - Remove from queue;
  - the Undo of any of them.

  Casting is read from YouTube Music's own cast state ([ARC-ACC-31](06-architecture.md#6283-queue-jobs-and-casting)).
  - Their buttons are dimmed, with the tooltip "Not available while casting".
  - Their keys, and Undo on their toasts, answer "Not available while casting".
  - The reason: our insert, and Remove's Undo, which re-inserts, don't reach the cast device. One rule for every queue edit gives the user one message.
  - **PROVISIONAL** (ticket 25, M5): if the cast state can't be read, queue edits stay available, and their toasts say "this tab's queue" instead of "the queue", e.g. "Added “Get Lucky” to this tab's queue" ([06 §6.2.15](06-architecture.md#6215-live-checks-that-settle-the-provisional-rows)).
- **YM-CAST-3** **No exception for forwarded inserts:** whatever ticket 25's M1 shows about the menu-item route forwarding inserts to the cast device, inserts stay unavailable while casting ([ARC-ACC-31](06-architecture.md#6283-queue-jobs-and-casting)). M1 now only picks the insert route. Re-allowing inserts after M1 would need a new decision. (R5, R46)
- **YM-CAST-4** **Moves** are unavailable while casting too, although YouTube Music's own reorder path forwards a move to the cast device (ticket 28, not checked live). (R5)
- **YM-CAST-5** **Save and Like** don't touch the queue, so casting doesn't affect them. (R5)

## 16. The player bar and the Wiz miniplayer

YouTube Music has been A/B testing a player UI without the classic player bar (the "Wiz miniplayer") since 2026-09-29. Ticket 27 found it in about 1 in 4 fresh signed-out profiles.

- **YM-BAR-1** **Actions on the playing song never depend on the player bar.** They live in three places:
  1. keys with nothing pointed at (§5);
  2. the playing song's queue item (§3);
  3. the player bar, where there is one.
- **YM-BAR-2** **"Save on the player bar"** (off by default) puts a Save split button for the playing song immediately left of YouTube Music's own like button:
  - in the classic player bar;
  - in the Wiz miniplayer's action bar.

  Its Settings line reads "Shown beside YouTube Music's like, in the classic bar and the new miniplayer."
- **YM-BAR-3** **No anchor, nothing drawn.** Nothing is drawn and nothing errors, and none of these is breakage:
  - there's no like button to sit beside;
  - YouTube Music hides it in a narrow window;
  - the page is signed out;
  - an ad is playing (the bar shows no like then);
  - the Wiz miniplayer has no action bar.

  Keys and the queue panel still work.
- **YM-BAR-4** **Only Save goes on the player bar.**
  - Play next and Add to queue would only mean "play it again".
  - The bar already has YouTube Music's own Like.
  - Remove from queue belongs to the queue panel.
  - *Runner-up:* our own floating "now playing" pill. It lost because it invents a control YouTube Music doesn't have, covers content, and is bloat.
  - *Runner-up:* dropping the player-bar placement. It lost because most users still have the classic bar, and saving the song you're hearing belongs there.
- **YM-BAR-5** **Independent switches:** "Save on the player bar" and the Save to playlist button for rows, cards and queue items are separate switches. Either can be on without the other.
- **YM-BAR-6** **No expanding:** clicking our player-bar controls never expands the Wiz miniplayer.
- **YM-BAR-7** **Song changes:** the player-bar Save acts on the song that's playing when it's clicked, and follows song changes.
- **YM-BAR-8** **PROVISIONAL** (ticket 25): the Wiz anchor was seen only in signed-out sessions that had the action bar. It must be checked signed in.

## 17. Playing now in the popup

Its look is [UI-POP-17](05-ui.md#youtube-music-tab).

- **YM-POP-1** **The row:** the popup's YouTube Music tab shows a compact **Playing now** row under the section switch, with:
  - the playing song's art with an equaliser, its title and its artist;
  - a split **Save** / **▾** button.
- **YM-POP-2** **Account:** Playing now acts as its tab's own account. It never acts as the account in view.
- **YM-POP-3** **The split Save button:**
  - **States:** idle, busy, saved with Undo ("Saved to {Playlist}. Undo"), already in ("Already in {Playlist}."), or "Couldn't save: …".
  - **Under it:** "One click saves to {Playlist}" or, with no quick-save playlist, "Your first pick becomes the quick-save playlist." (R37)
  - It follows YM-SAVE's rules, choose mode included.
- **YM-POP-4** **The ▾** opens the playlist picker as the popup's sheet, loaded on demand. It behaves as in §10.
- **YM-POP-5** **Routing:** the popup's saves go from the popup through the background to the tab. If the popup closes mid-save, only the answer is lost, not the save.
- **YM-POP-6** **No YouTube Music tab:** the YouTube Music tab shows cached data with **Open YouTube Music**. Playing now and every quick action need a tab.
- **YM-POP-7** **No Playing now before consent.**
- **YM-POP-8** **Quick-action shortcuts in the popup:** the popup lists their keys read-only. Keys are changed in Settings › YouTube Music, which **Change keys** opens at `#feature-music-keys` (R32).
- **YM-POP-9** **Installed app:** Playing now is reachable from the installed app's title bar (§19).
- **YM-POP-10** **When it shows:** whenever the section switch is on and YouTube Music has site access, after consent, whichever in-page features are on, because Playing now changes nothing on the page. With no YouTube Music feature on, the popup reads the tab through the on-demand probe ([FT-16](04-features-accounts-data.md#13-off-costs-nothing)). (R8)
- **YM-POP-11** **Which tab it reads:** the focused window's active YouTube Music tab, else the one playing audio, else the most recently used. This is ticket 10's order, kept for Playing now only ([ARC-ACC-68](06-architecture.md#6211-serving-tab-routing); read with the `nowPlaying` job, ARC-MSG-11). (R8, R33)
- **YM-POP-12** **Nothing playing:** the row is hidden. (R8)
- **YM-POP-13** **Signed out:** the row is one line, "Sign in to YouTube Music to save songs." (R8)

## 18. Playlist shortcuts on YouTube Music

Playlist shortcuts are a YouTube feature ([ticket 08](../issues/08-shortcuts.md), [02-youtube.md §2.8](02-youtube.md#28-playlist-shortcuts-the-picker-key-and-the-undo-key)) that also works on YouTube Music.

- **YM-PS-1** **"Also on YouTube Music"** (on when Playlist shortcuts is first turned on; [YT-KEY-15](02-youtube.md#282-the-playlist-shortcut-list)): playlist shortcuts also work on music.youtube.com.
  - The undo key doesn't depend on it (YM-KEY-4). While it's on, though, Playlist shortcuts counts as a shortcut feature on YouTube Music, so a press there with nothing to undo answers "Nothing to undo." (R44)
  - The section switch holds it: with the section off, playlist shortcuts don't run on music.youtube.com, and the option is kept (YM-FEAT-5; R1).
  - *Runner-up:* off by default. It lost because a key that works on one site but not the other is surprising.
- **YM-PS-2** **Site access on Chrome:** "Also on YouTube Music" needs YouTube Music access.
  - It's asked from the click that makes the option apply: switching it on while Playlist shortcuts is on, or the click that first switches Playlist shortcuts on, since the preset turns the option on. The section switch never asks ([FT-44](04-features-accounts-data.md#17-site-access-and-youtube-tabs); R53).
  - A denial from the option's own switch leaves it off ([FT-52](04-features-accounts-data.md#17-site-access-and-youtube-tabs)). A denial at first run's Agree leaves it on but held. Playlist shortcuts keeps working on YouTube either way.
  - Without access, the row reads "Needs site access", with **Give access** ([FT-13](04-features-accounts-data.md#12-switching-features), [YT-KEY-15](02-youtube.md#282-the-playlist-shortcut-list)).
  - While Playlist shortcuts and the option are both on, with the section switch on, missing access raises the violet "!" on every tab (YM-FEAT-10; [FT-47](04-features-accounts-data.md#17-site-access-and-youtube-tabs); R53).
- **YM-PS-3** **What they act on:** songs only, the pointed-at song else the playing song.
  - A pointed-at album, playlist or artist answers "Only songs can be saved to playlists." (R4)
  - An unrecognised pointed-at item answers "Couldn't tell which item you meant. Point at it again, or use the player." (YM-TGT-4; R4)
  - Nothing pointed at answers "Nothing is playing" or "An ad is playing" (YM-TGT-6).
- **YM-PS-4** **Target:** each shortcut saves to the playlist chosen for it on the tab's account.
  - A shortcut set to Watch later saves to the account's Watch later on every account that hasn't chosen another playlist for it.
  - A shortcut with no playlist on this account answers "{Shortcut} has no playlist on {Account} yet." with **Choose**, which opens the in-page picker in choose mode for that shortcut (YM-PICK-1). It's a neutral hint, not a failure, and shows even with Show feedback off. (R24, R56)
  - The pick saves the song there, as any choose-mode pick does, and becomes that shortcut's playlist on this account. The toast reads `{Shortcut} now saves to “{Playlist}”.`, with **Undo** for the saved song; the shortcut keeps its new playlist. It's a confirmation under Playlist shortcuts' Show feedback. This is the same on both sites ([YT-KEY-13](02-youtube.md#282-the-playlist-shortcut-list)). (R24, R45)
- **YM-PS-5** **Saving:** a playlist shortcut is an explicit add through the shared add flow (§9's rules).
  - The sign-in check comes first (YM-SAVE-5; R25). Signed out, it answers with the failure "Sign in to YouTube Music to save songs." † and **Sign in** (R3, R41).
  - It always answers, already in included.
  - It shows the pending toast after 1 s, unless Playlist shortcuts' Show feedback is off (R7). It never toggles a song out, and is never channel-filtered.
  - The toast names the playlist, not the shortcut's label.
  - A shortcut's playlist that's missing or full fails as on YouTube, with **Settings**, which opens `#feature-shortcuts&playlist=<playlistId>` at that playlist's row ([YT-ADD-28](02-youtube.md#253-copy); R38).
- **YM-PS-6** **Show feedback** follows Playlist shortcuts' own switch.
- **YM-PS-7** **Picker key:** Playlist shortcuts' picker key works on YouTube only. On YouTube Music, Quick-action shortcuts' Alt+Shift+P does that job.
- **YM-PS-8** **Keys in the picker:** the picker shows each playlist's shortcut key (YM-PICK-4).
- **YM-PS-9** **YouTube-only features:** auto-add, channel filters, the thumbnail quick-save, the Add to queue button, the right-click card menu and the watch-page button stay off YouTube Music.

## 19. The installed app window, and Firefox

- **YM-APP-1** **Same behaviour:** everything in this chapter behaves the same in the installed YouTube Music app: Chrome and Edge, and Firefox web apps on Windows (143+). It's the same page, and keys are caught in the page.
- **YM-APP-2** **An ordinary tab:** the app's window counts as an ordinary YouTube Music tab. It has its own account (YM-ACC-3), and it can be the serving tab for the popup.
- **YM-APP-3** **The popup:** it opens from the app's title bar (in Edge, under the app's menu), and Playing now is reachable there. Nothing depends on the side panel, which doesn't open in app windows.
- **YM-APP-4** **PROVISIONAL** (ticket 25, M4): four checks in the app window:
  - the background finds the app's tab;
  - registered and injected scripts run there;
  - the popup's active tab is the app's;
  - toasts behave as in a tab.

  If any fails, the app gets only what reaches it, and the gap is recorded.
- **YM-APP-5** **Firefox** has no casting, so §15 never applies there.

## 20. Narrow rows

- **YM-NARROW-1** **PROVISIONAL** (the user; ticket 27's judgement call 2, listed in `for-the-user.md`): every switched-on button stays on narrow rows. On Home's Quick picks at common laptop widths, the row's title is squeezed while hovered, down to nothing.
  - *Runner-up:* drop buttons until the title keeps 48 px. It lost because at a 1366 px window no button would fit, so the feature would vanish from Quick picks at the most common laptop width.
  - *Second runner-up:* a combined queue split (Play next | ▾ Add to queue). It lost because Add to queue would take two clicks.
- **YM-NARROW-2** **Tooltips name the song** when a hovered row's title would drop under 48 px: "Play next: Shape of You (Alt+N)", with the key only while Quick-action shortcuts is on (R6). The accessible name always names the song.
- **YM-NARROW-3** **Nothing changes at rest:** narrow rows look untouched until hovered or focused, because nothing is reserved (YM-QA-7).
- **YM-NARROW-4** **Settings warning:** Settings › YouTube Music's button list carries the warning "Each extra button squeezes narrow rows more. On Home's Quick picks at common laptop widths, a hovered row's title can disappear; its tooltip still names the song."

Measured on real YouTube Music by ticket 27, Quick picks rows with the two default buttons:

| Window width | Row | Title with YouTube Music's own hover buttons | With ours too |
|---|---|---|---|
| 1280 px | 436 px | 202–214 px | 112–124 px |
| 1366 px | 289 px | 66 px | 0 px |
| 1440 px | 312–313 px | 90–91 px | 0–1 px |
| 1536 px | 345 px | 111 px | 21 px |
| 1920 px | 473 px | 251 px | 161 px |

Wide rows (album, playlist and search pages) lose about 82 px of title only while hovered. In the queue panel, the title keeps about 180 px with the two default buttons, and about 38 px with all five.

## 21. Not in 2.0

These need the user's go-ahead as new capabilities (`for-the-user.md`). 2.0 doesn't include them unless approved:
- **More quick actions:** Save to library, Start mix, and Go to artist / album.
- **Keys from another tab,** or system-wide on Chrome, e.g. liking the song in a background YouTube Music tab.
- **Translated UI.** English toasts stand out on a non-English YouTube Music.

## PROVISIONAL items in this chapter

| Item | Requirement | Settled by |
|---|---|---|
| Unticking in the picker removes the song | YM-PICK-8 | The user (tickets 12, 26) |
| Narrow Quick picks rows keep every button | YM-NARROW-1 | The user (ticket 27; R35 leaves it with the user) |
| YouTube Music's answer carries membership; YouTube Music responses carry `datasyncId` | YM-PICK-6, YM-ACC-6 | Ticket 25, M2 |
| Likes are quiet and repaint, including in the Wiz miniplayer | YM-LIKE-7 | Ticket 25, M3 |
| The installed app is first-class | YM-APP-4 | Ticket 25, M4 |
| The Wiz miniplayer's Save anchor, signed in | YM-BAR-8 | Ticket 25 |
| An explicit save goes ahead when membership is unreadable | YM-SAVE-7 | Ticket 25 |
| `DATASYNC_ID` is stable | YM-ACC-2 | Ticket 25 (ticket 11's checks) |
| Playlist titles are limited to 150 characters | YM-PICK-10 | Ticket 25 |
| Toasts name "this tab's queue" if the cast state can't be read | YM-CAST-2 | Ticket 25, M5 |
| Shared-settings changes in a private window are saved, and the pins' tooltip says so (R58) | YM-ACC-8 | [Ticket 23](../issues/23-ask-amo.md), AMO question 3 |
| The name in `{Product}` | §13 | [Ticket 22](../issues/22-name.md), the user |

Visual PROVISIONAL items (the toast action's blue, bundling YouTube Music's own icons) are in [05-ui.md](05-ui.md#provisional). The picker's 54.5 KB against its 50 KB budget, and R29's fix order, are in [07-quality.md](07-quality.md) (Q-PERF-14) and [UI-RULE-39](05-ui.md#budgets).

## Resolved during assembly

Settled by the main session in [resolutions.md](resolutions.md):
- **What the section switch gates** (was Conflict 1): everything on music.youtube.com, "Also on YouTube Music" included, overriding ticket 17's exception (YM-FEAT-5, YM-PS-1). R1.
- **The section switch's storage and default** (was Conflict 2): `musicSection`, a synced shared setting, on by default (YM-FEAT-5, YM-ACC-1). R1.
- **The undo key with only Quick actions on** (was Conflict 3): it works whenever a toast with Undo is on screen, whichever feature made it (YM-KEY-4). R2.
- **Signed-out Save and Like** (was Conflict 4): both answer with the same kind of failure toast, with **Sign in** (YM-ACC-5, YM-LIKE-6, YM-PS-5). R3.
- **Two hints for one situation** (was Conflict 5): every non-song save answers "Only songs can be saved to playlists." (YM-TGT-5, YM-KEY-10). R4.
- **Rows join on hover** (was PROVISIONAL on YM-QA-7): settled; only the narrow Quick picks rows stay with the user. R35.
- **Remove from queue while casting** (was Not pinned down 1): unavailable, as is every queue edit and its Undo (YM-CAST-2, YM-CAST-4). R5.
- **Inserts while casting if M1 shows they're forwarded** (was PROVISIONAL on YM-CAST-2 and YM-CAST-3): no exception; they stay unavailable (YM-CAST-3, as ARC-ACC-31). R5.
- **Copy for an unsupported item** (was Not pinned down 2): "{Action} isn't available for {kind}." (YM-TGT-5). R4.
- **The unrecognised-item copy** (was Not pinned down 3): "Couldn't tell which item you meant. Point at it again, or use the player." (YM-TGT-4). R4.
- **The tooltip key while Quick-action shortcuts is off** (was Not pinned down 4): shown only while the feature is on (YM-QA-12). R6.
- **The pending toast with Show feedback off** (was Not pinned down 5): not shown (YM-SAVE-12, YM-FB-6). R7.
- **Which tab Playing now reads** (was Not pinned down 6): ticket 10's order, kept for Playing now only (YM-POP-11). R8, R33.
- **Playing now's gaps** (was Not pinned down 7): it shows whenever the section is on and has access; hidden when nothing plays; one line when signed out (YM-POP-10, YM-POP-12, YM-POP-13). R8.

Second round:
- **Like's signed-out wording** (was Not pinned down 1): Like keeps "Sign in to YouTube Music to like songs." as a failure with **Sign in**; R3 covers explicit actions only, so auto-add stays silent (YM-ACC-5, YM-LIKE-6). R41.
- **The Remove key under R4** (was Not pinned down 2): it says "Point at a song in the queue to remove it." on anything that isn't a queue item (YM-RM-5, YM-KEY-10). R67.
- **How often the account-change toast shows** (was Conflict 1): it answers every explicit press; once per tab is for auto-add only (YM-ACC-6). R55.
- **Status per action** (was Conflict 2): status is per feature. An action whose internals are missing is unavailable: its buttons and keys hide in that tab, and the feature is partly working, with the status detail naming those actions (YM-FAIL-4, YM-FAIL-6, YM-FAIL-10, YM-KEY-12, YM-ACC-7). R50.
- **The undo key's preset and home** (was Conflict 3): it belongs to no feature, is preset to Alt+U at install, and is set in Settings › Everywhere. While a shortcut feature is on, a press with nothing to undo answers "Nothing to undo." (YM-FEAT-3, YM-KEY-1, YM-KEY-4, YM-PS-1). R44.
- **R24 in chapter 04** (was Conflict 4): the Choose pick sets the shortcut's playlist and saves the song, and its toast carries Undo, on both sites; copy uses typographic quotes (YM-PS-4, YM-FB-10, §13). R45.
- **`quiet-route-noisy` on YouTube Music** (was Conflict 5): the signal identifiers are chapter 07's, and `quiet-route-noisy` applies on both sites (YM-FAIL-12). R51.

Also applied here: R6 by analogy (shortcut keys in the picker: YM-PICK-4, as YT-KEY-34), R12 (badge priority and colours: YM-FEAT-10, YM-SAVE-8, YM-FAIL-6), R14 (access denied at first run: YM-FEAT-10), R22 (rate-limited saves always answer: YM-SAVE-14), R24 (a shortcut with no playlist: YM-PS-4), R25 (sign-in check first: YM-SAVE-5), R32 (kebab-case deep links: YM-POP-8), R37 ("quick-save playlist": YM-POP-3), R38 (a shortcut playlist's deep link: YM-PS-5), R39 (Refresh and Sort A–Z in the picker: YM-PICK-3, YM-PICK-5) and R40 (`quiet-route-noisy`: YM-FAIL-12). From the second round: R46 (no inserts while casting, even after M1: YM-CAST-3), R53 (who asks for YouTube Music access, and the "!" on every tab: YM-FEAT-10, YM-PS-2), R56 (the "has no playlist" toast is a hint: YM-PS-4, §13), R58 (private-window pins: YM-ACC-8) and R65 (`{Product}` and `{Account}`: Conventions, §13). R14's "Needs access" and "Grant" are written as the existing held reason "Needs site access" with **Give access** (FT-13, FT-46), as chapters 02, 04 and 05 do, now for "Also on YouTube Music" too (YM-PS-2).

## Conflicts found

### Unresolved

These remain between this chapter and the others after both rounds of resolutions. They're noted here, not edited there.

1. **Playing now's art.** YM-POP-1 shows the playing song's art. [06's `nowPlaying` result](06-architecture.md#625-job-catalogue), `{ videoId, title, artist, album?, pos, len }`, carries none. 06 owns the interface; the art can come from the media session's artwork or the video ID.
2. **Song counts in the picker.** YM-PICK-4's rows read "Private · 214 songs". On YouTube Music the list comes from 06's `membership` job, whose rows are `{ id, title, privacy?, contains }`, with no count; the `playlists` job, which has `count?`, is YouTube-only.
3. **08's store description.** [08 §9.2](08-release.md#92-description-both-stores) says Quick actions puts "Play next, Add to queue, Save to playlist, Like and Remove from queue, one click away on songs, albums and playlists". Save and Like are for songs only (YM-QA-2), and Remove from queue only for queue items (YM-QA-3).
4. **08's screenshot 4.** [08 §9.4](08-release.md#94-screenshots-and-images) pairs "Play next / Add to queue on rows" with the toast "Added {n} songs from “{album}” to the queue". A row adds one song ("Added “Get Lucky” to the queue"); the block toast comes from the album header or a card (YM-Q-3, YM-QA-9).
5. **Which titles take quotes.** 04's placeholder note says "Titles inside copy take typographic quotes, as in “{Playlist}”" (R45). Read literally, that quotes playlist names too. YM-FB-10, like [YT-ADD-18](02-youtube.md#252-feedback), quotes song, album and video titles, and a playlist name only in "{Shortcut} now saves to “{Playlist}”.". R45 sets the quote style, not which titles are quoted.

### Resolved by precedence (for the record)

- **Queue items:** ticket 26 kept Play next and Add to queue off queue items. Superseded by its amendment after ticket 28: they're moves.
- **Pointer or focus:** ticket 26 said "pointer first". Superseded by ticket 08's "whichever moved last".
- **Unarmed keys:** ticket 26's "no armed key" for missing internals. Ticket 18 superseded it (the key stays caught and answers), and R50 restored it for an action that's unavailable while its feature is partly working. A feature that isn't working keeps its keys caught (YM-KEY-12).
- **Casting:** ticket 10 softened it to "available if no cast signal". Superseded by ticket 25, which found `state.castStatus`, and then by R5, which makes every queue edit unavailable while casting, with no exception for inserts M1 might show forwarded (YM-CAST-3).
- **Row placement:** ticket 26 said buttons cover the trailing columns without reflow, and ticket 09 reserved a slot. Superseded by ticket 27's variant A, which ticket 26 allowed it to adjust, and settled by R35.
- **Deleted quick-save playlist copy:** ticket 26 had "Favourites doesn't exist anymore". Superseded by ticket 12's `Couldn't save “{title}”: {Playlist} doesn't exist anymore.`; ticket 12 folds in ticket 26 and keeps its Choose action.

## Not pinned down

1. **Choose mode's title for a shortcut.** YM-PICK-3's choose-mode title and line, "Save songs to…" and "The playlist you pick here becomes your one-click Save.", fit only the quick-save playlist. No wording is given for a playlist shortcut's **Choose** (YM-PS-4), on either site ([02's Not pinned down](02-youtube.md#not-pinned-down)).
2. **How R50's "keys hide" reads.** YM-KEY-12 reads it as ticket 26's "no armed key": an unavailable action's key passes through untouched, and only the once-per-session notice (YM-FAIL-5) and the status say why. That is the "silent key" ticket 18 had ruled out (YM-FB-6). Confirm, or keep such keys caught with a failure toast.
3. **The pins' private-window tooltip (R58).** The pins stay disabled there, because the quick-save playlist belongs to the account setup, yet R58's tooltip, "Changes made here are saved; nothing about this window's browsing is.", says what's saved rather than why the pin is off (YM-ACC-8, as [YT-PK-08](02-youtube.md#26-the-playlist-picker)).
4. **A denied prompt from Playlist shortcuts' own switch.** When the click that first switches Playlist shortcuts on asks for YouTube Music access (YM-PS-2) and the user denies it, what happens to "Also on YouTube Music" is open in [04's gaps](04-features-accounts-data.md#8-gaps) (FT-52).
