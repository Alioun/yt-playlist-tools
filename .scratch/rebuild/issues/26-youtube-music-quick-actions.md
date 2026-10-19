# How do YouTube Music quick actions behave?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 21

## Question

Settled while charting (Q14–Q21):
- **The quick actions:** Play next, Add to queue, Save to playlist (one click to a chosen playlist, plus a picker that shows where the song already is), Like / unlike, and Remove from queue.
- **Where they appear:** inline buttons on hover on every song row and card (search, albums, playlists, home shelves, the queue panel), on the player bar, and as keyboard shortcuts that act on the hovered row, else on the playing song.
- **Which buttons show:** the user picks; Play next and Add to queue are the default. Every action can have a shortcut.
- **Albums and playlists:** Play next and Add to queue work on whole album and playlist cards too.
- **Carried over:** playlist shortcuts and quick-save work on YouTube Music. Auto-add and channel filters stay YouTube-only.
- **Installed app:** supported first-class if [ticket 21](21-youtube-music-internals.md) shows extensions work there.

Decide the behaviour:
- **Feedback:** what each action shows. YouTube Music's own "added to queue" toast, ours, or both?
- **Undo.**
- **Albums and playlists:** what Play next and Add to queue do with them (order, shuffle state).
- **Empty player:** what happens when nothing is playing or the queue is empty.
- **Scope:** where Remove from queue applies. Whether Like applies to albums.
- **Keys:** default keys, and clashes with YouTube Music's own shortcuts (from ticket 21).
- **Placement:** where exactly the buttons sit on rows, cards and the player bar.
- **Failures:** what happens when an action fails.

Also from [ticket 21](21-youtube-music-internals.md):
- **Player bar:** the Q16 "player bar" placement is at risk. YouTube Music is A/B testing a player UI without one, so decide where the now-playing actions live when the bar is missing.
- **Feedback:** YouTube Music's own toast is reachable through `handleAddToToastAction`. Decide whether to use it.
- **Membership:** the Save-to-playlist picker's membership comes from youtube.com's answer, since YouTube Music's client never reads it.
- **Keys:** every Alt combination is free on YouTube Music's side.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names the runner-up and why it lost. This answer builds on [ticket 21's research](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-music/docs/research/youtube-music.md), cited as "research §n", and its [live-check snippet](https://github.com/Alioun/yt-playlist-tools/blob/research/youtube-music/docs/research/youtube-music/live-check.js).

### Features and their settings

- **Quick actions** is a feature, off until the user picks it at first run. It has these settings:
  - **Buttons**, each switched on or off separately: Play next (on), Add to queue (on), Save to playlist (off), Like (off), Remove from queue (off), and Save on the player bar (off). The defaults follow Q18.
  - **Show feedback** (on).
- **Quick-action shortcuts** is a second feature, also off until picked. It has one key per action, each changeable and clearable, plus **Show feedback** (on).
- **The quick-save playlist** (see Save to playlist) is shared by both features. It shows under whichever feature is on, because the Save key needs it even when the buttons are off.
- **Off means nothing on the page.** With both features off, and playlist shortcuts off too, nothing is injected into music.youtube.com. The picker's code loads the first time the picker opens.
- **Accounts** (per [ticket 11](11-accounts.md)):
  - Every setting above is shared by all accounts: the switches, button choices, shortcut keys and Show feedback.
  - Only the quick-save playlist belongs to the account setup, because it names one of that account's playlists. It's keyed by `DATASYNC_ID`, which music.youtube.com exposes just as youtube.com does.
  - A YouTube Music tab uses its own account's setup, even when a youtube.com tab is signed in as a different account.

### Which items get which action

- **The rule:** an action is offered on an item exactly when YouTube Music's own ⋮ menu offers it for that item. Menu items are matched by command and read when the pointer arrives.
  - Why: one rule covers songs, videos, episodes, uploads, artists, signed-out rows and item types YouTube Music adds later. It also never offers something YouTube Music would refuse.
- **Narrowed by:**
  - **Save to playlist and Like apply to songs only.** Albums and playlists get Play next and Add to queue.
    - Runner-up: Like on an album means "Save to library". It lost because that's a different YouTube Music concept with its own name, it sits on the most-churned endpoint (research §2.4), and it isn't an approved quick action.
  - **Remove from queue appears only on queue items.**
  - **Queue items don't get Play next or Add to queue.** On an item that's already queued, they'd add a second copy of the song. The queue's own drag handle already reorders.
    - Runner-up: on a queued song, Play next moves it up. It lost for now because it gives one name two meanings and needs a reorder path nobody has researched (see the new questions).
  - **No second like button.** Our Like isn't drawn where YouTube Music already shows its own like button for that item, such as album and playlist track rows, or the player bar.
- **Signed out:** Save and Like aren't drawn, because YouTube Music's own menu items are sign-in prompts there. Play next and Add to queue work signed out (research §2.1).

### Where the buttons sit

[Ticket 27](27-youtube-music-controls.md) prototypes the exact look and may adjust these positions after trying them on real YouTube Music.

- **Song rows** (search, album, playlist, library and the lists on Home):
  - They appear on hover, or when keyboard focus is inside the row.
  - They sit in the row's trailing area, immediately left of YouTube Music's own like and ⋮ buttons.
  - They cover the trailing columns (duration, plays) but never the title, and they don't reflow the row.
- **Cards** (Home, Explore and artist shelves): on the thumbnail's hover overlay, along the bottom edge beside YouTube Music's own play button, in that button's style.
- **Album and playlist page headers:** Play next and Add to queue sit among YouTube Music's own header buttons, left of its ⋮. Like those buttons, they're always visible.
  - Why: queueing the album you're looking at shouldn't need the ⋮ menu.
- **Queue items:** on hover, left of the item's ⋮. Whichever of Save, Like and Remove from queue are switched on.
- **Order:** the same everywhere: Play next, Add to queue, Save to playlist, Like, Remove from queue. That follows YouTube Music's own menu order, and the user can't reorder them because a setting for it isn't worth having.
- **Icons:** the ones YouTube Music's own ⋮ menu uses for each action.
- **Tooltip:** the action's name, plus its key when one is set, e.g. "Play next (Alt+N)". The accessible name is the action and the item's title.

### The playing song and the player-bar A/B test

- **The playing song** is the queue's current item, whether playing or paused. It's never an ad.
- **Actions on the playing song never depend on the player bar.** They live in three places:
  1. **Keys.** A quick-action shortcut pressed while the pointer isn't on any item acts on the playing song, so this works in every player UI.
  2. **The queue panel.** The playing song's queue item carries the same Save and Like buttons as every other queue item.
  3. **The player bar, when there is one.** With "Save on the player bar" on, a Save button (with its ▾) sits immediately left of YouTube Music's own like button for the playing song.
     - It anchors to that like button both in the classic player bar and in the A/B-tested Wiz miniplayer. Ticket 27 may find a better spot in the Wiz miniplayer.
     - If there's no anchor, or YouTube Music hides it in a narrow window, nothing is drawn and nothing errors. Places 1 and 2 still work.
- **Only Save goes on the player bar.** On the playing song, Play next and Add to queue only mean "play it again", the bar already has YouTube Music's own Like, and Remove from queue belongs to the queue panel.
- **Runner-ups for the player bar:**
  - Our own floating "now playing" pill. It lost because it invents a control YouTube Music doesn't have, covers content, and is bloat.
  - Dropping the player-bar placement. It lost because most users still have the classic bar, and saving the song you're hearing belongs there.

### Play next and Add to queue

- **A song:**
  - Play next puts it directly after the playing song.
  - Add to queue puts it where YouTube Music's own Add to queue would: the end of the user's queue, before any autoplay suggestions YouTube Music has appended (live check, [ticket 25](25-live-checks.md)).
- **An album or playlist:**
  - We insert every song YouTube Music's own menu item would insert, as one block, in the album's or playlist's own order.
  - We never shuffle. YouTube Music's shuffle is a one-off "Shuffle queue" action (`s`) that the user can run afterwards.
  - With repeat-one on, the current song keeps repeating, exactly as it does after YouTube Music's own Play next.
- **Empty queue:** with nothing loaded, both actions start playing the item, as YouTube Music's own menu does. The toast says "Playing …" and has no Undo.
- **Paused or finished queue:** a normal insert. Playback doesn't start, which is also YouTube Music's own behaviour.
- **Success:** confirmed only once the queue has actually grown by the inserted count. This fixes 1.5.0's unconfirmed queue success.
- **Casting (Chrome):**
  - Both actions are unavailable while casting: the buttons are dimmed with the tooltip "Not available while casting", and the keys show the same hint. The reason: our replayed insert doesn't reach the cast device (research, "What can't be done").
  - If ticket 25's menu-item spike shows that route forwards to the cast device, both actions work normally while casting.
- **Concurrency:**
  - Queue actions run one at a time per tab, in the order they were triggered.
  - A busy button ignores more clicks, and a held key's auto-repeat is ignored.

### Remove from queue

- It removes that one entry from the queue, not every copy of the song. The server-side queue updates too (research §2.2).
- It's offered on the playing item only if YouTube Music's own menu offers it there, under the rule above (live check).
- Undo puts the song back at its old position.

### Save to playlist

- **A split button.** The main part saves the song to the **quick-save playlist** in one click. The ▾ part opens the **playlist picker**.
- **The quick-save playlist** belongs to YouTube Music and is separate from YouTube's thumbnail quick-save. Each account setup holds its own (ticket 11).
  - Why separate from YouTube's: music playlists and video playlists usually differ, and the YouTube Music section has its own buttons (Q21).
  - Runner-up: one quick-save playlist shared by YouTube and YouTube Music. It lost for the same reason.
  - **An account with no quick-save playlist**, including any account seen for the first time, is in choose mode. Its first pick creates its account setup, as ticket 11 describes.
  - **Private windows** (only if the user allows the extension there): if the account has a quick-save playlist, one-click save uses it. Choose mode still saves the song, but the pick isn't stored as the quick-save playlist, and the pins are disabled with the tooltip "Private windows don't save settings". Nothing from a private session is stored (ticket 11).
- **Before a quick-save playlist is set:**
  - The button reads "Save to playlist…" and opens the picker in **choose mode**, titled "Save songs to…".
  - The pick saves the song and becomes the quick-save playlist.
  - After that, picks through ▾ are one-off and never change it. Only the picker's pin, or settings, change it.
  - Runner-up: the last-used playlist becomes the one-click target. It lost because a single mis-pick would silently redirect every later save, overriding the user's choice.
- **The playlist picker:**
  - **Look and position:** YouTube Music's look, anchored to the button. When a key opens it and there's no button, it opens centred above the player.
  - **Contents:** a search field (focused on open); the account's playlists in the order YouTube Music's own Save dialog lists them, with Watch Later only if that list includes it; then "New playlist".
  - **Check marks:**
    - Every playlist that already holds the song gets a check mark.
    - Membership comes from YouTube Music's answer if it carries one, otherwise from youtube.com's (ticket 21).
    - If neither can be read, the list still works without check marks and shows "Couldn't check where this song already is".
  - **Ticking and unticking:**
    - Ticking saves the song there at once.
    - **Unticking removes the song from that playlist. PROVISIONAL:** youtube.com's own Save dialog does this, but for the extension it's arguably a new capability, so it needs the user's go-ahead.
    - Runner-up: checked rows can't be changed. It lost because a checklist you can't untick is surprising, and it forces a trip to the playlist page.
  - **Pins:** each row has a pin, "Use for one-click save".
  - **New playlist:**
    - It uses ticket 12's create flow.
    - It creates the playlist with the song already in it, which avoids YouTube Music refusing edits to a new playlist for about 20 seconds (research §2.5).
  - **Closing:** Esc, a click outside, or its ✕.
  - **Feedback inside the picker:** each row shows its own result: busy, then checked or unchecked, or an inline "Couldn't save" on that row. Nothing in the picker raises a toast.
  - **Keys:** quick-action keys are off while the picker is open.
- **Already in the playlist:** nothing is added (YouTube Music rejects duplicates by default) and the toast says so. This isn't a failure. If ticket 12's duplicate rule says otherwise, ticket 12 wins.
- **Quick-save playlist deleted:** the save fails with "Favourites doesn't exist anymore" and a "Choose" action that opens the picker in choose mode. The setting is kept, not cleared, and settings show it as missing.

### Like

- **It toggles.** On a song that isn't liked, or is disliked, it likes it; on a liked song it removes the like.
- **State:** the icon is outlined or filled according to YouTube Music's own like state, and stays in step with it.
- **No toast on click:** the icon is the feedback, as with YouTube Music's own like button. A key press does show a toast, since there may be no button in view.

### Keys (quick-action shortcuts)

- **Which item a key acts on:** the **pointed-at item**, which is the first of these that applies:
  - the song row, card, queue item, album or playlist header, or player bar under the pointer at the moment the key is pressed (checked again then, so scrolling counts);
  - otherwise, the item holding keyboard focus that was reached by keyboard (`:focus-visible`);
  - otherwise, the playing song.
- **Unsupported item under the pointer:** if the item there doesn't support the action, the key does nothing and says why. It never falls back to the playing song, because the user pointed at something else.
- **Default keys.** They're live as soon as the feature is turned on, and each one can be changed or cleared.

  | Action | Key |
  |---|---|
  | Play next | Alt+N |
  | Add to queue | Alt+Q |
  | Save to playlist (quick-save; opens choose mode if none is set) | Alt+P |
  | Save to playlist… (the picker) | Alt+Shift+P |
  | Like / unlike | Alt+L |
  | Remove from queue | Alt+R |

  - Why these: every Alt combination is free on YouTube Music's side (ticket 21), and these letters avoid the browsers' menu keys (Firefox's Alt+F/E/V/S/B/T/H and Chrome's Alt+F/E/D).
  - Why preset rather than unset: 1.x's unset-by-default shortcut is on the friction list, and keys leave no trace on the page.
- **When keys are ignored:**
  - focus is in a text field, a select or a contenteditable;
  - a menu or dialog is open (YouTube Music's or our picker);
  - the key is an auto-repeat;
  - the modifiers don't match exactly. For example, AltGr (Ctrl+Alt) never fires an Alt key.
- **Clashes with YouTube Music's keys:**
  - Our listener takes a key only when it matches one of ours. Every other key reaches YouTube Music.
  - If the user records a key YouTube Music uses, such as a bare `q`, the recorder names the clash ("YouTube Music uses Q for Toggle queue") and lets them keep it. Ours then wins on YouTube Music.
- **What the pointed-at row shows:** if that row shows the matching button, the button goes through the same busy, done or failed states as for a click.

### Feedback and undo

- **Our own toast, made to look like YouTube Music's.** It appears where YouTube Music's toasts do (bottom left), one at a time, with the newest replacing the previous one.
  - We don't use YouTube Music's own toast (`handleAddToToastAction`), because only ours can carry an Undo that runs our code and tell a failure apart from a success.
  - Each action shows exactly one toast. Dispatch must not also set off YouTube Music's own toast.
  - Runner-up: YouTube Music's own toast. It lost because it can't offer undo and adds another internal to depend on. Showing both lost because of the double toasts.
- **How long it stays:** 6 seconds, and longer while the pointer is on it or it has focus.
- **Show feedback off** hides the confirmations. Failures and "nothing happened" hints still show, because an explicit click or key that silently does nothing is a defect.
  - Runner-up: "off" hides everything. It lost because failures would then go silent.
- **Button states:** idle, then busy as soon as it's clicked, then done (a check mark for 1.5 s) or failed (an error icon for 1.5 s). After 10 s without an answer it counts as failed.
- **What Undo does:**
  - **Play next or Add to queue:** removes the inserted entries that are still waiting. An entry that has already started playing stays.
  - **Remove from queue:** puts the song back at its old position.
  - **Save:** removes exactly the entry that the save created (ticket 12's rule).
  - **Like by key:** restores the previous like state.
  - **When there's no Undo:** after an empty queue starts playback.
  - **Afterwards:** the toast closes once Undo succeeds. If Undo fails, it says "Couldn't undo."
- **Copy.** Titles are in double quotes and cut at 40 characters with "…". When the song count is unknown, the album and playlist rows drop the count, e.g. `"Random Access Memories" will play next`.

  | When | Toast | Action |
  |---|---|---|
  | Play next, song | "Get Lucky" will play next | Undo |
  | Play next, album or playlist | 13 songs from "Random Access Memories" will play next | Undo |
  | Add to queue, song | Added "Get Lucky" to the queue | Undo |
  | Add to queue, album or playlist | Added 13 songs from "Random Access Memories" to the queue | Undo |
  | Empty queue started playback | Playing "Get Lucky" | — |
  | Remove from queue | Removed "Get Lucky" from the queue | Undo |
  | Save | Saved "Get Lucky" to Favourites | Undo |
  | Save, first pick in choose mode | Saved "Get Lucky" to Favourites. One click now saves there. | Undo |
  | Save, already there | "Get Lucky" is already in Favourites | — |
  | Like or unlike by key | Liked "Get Lucky" / Unliked "Get Lucky" | Undo |
  | Failure | Couldn't add "Get Lucky" to the queue. Try YouTube Music's ⋮ menu. (Likewise "Couldn't save … to Favourites", "Couldn't like …", "Couldn't remove … from the queue".) | — |
  | Quick-save playlist deleted | Favourites doesn't exist anymore | Choose |
  | Key, nothing to act on | Nothing is playing | — |
  | Key, Remove from queue with no queue item | Point at a song in the queue to remove it | — |
  | Key, Save or Like on an album or playlist | Save works on songs, not albums or playlists / Like works on songs, not albums or playlists | — |
  | Signed out | Sign in to YouTube Music to save songs / to like songs | — |
  | Casting | Not available while casting | — |
  | Key with nothing pointed at, during an ad | An ad is playing | — |

### Failures

- **A request fails, times out, or returns `STATUS_FAILED`:**
  - The button shows failed, and the failure toast says what didn't happen.
  - The toast points to YouTube Music's ⋮ menu, which keeps working when our path breaks (research §7).
  - Runner-up: an "Open menu" action in the toast. It lost because it means clicking YouTube Music's ⋮ button for the user. That's another markup dependency and stretches the "never drive the visible UI" exemption, all to save one click on a ⋮ that's right beside our button.
- **YouTube Music has changed:**
  - When the page loads, the YouTube Music page adapter checks that each action's internals exist.
  - An action whose internals are missing gets no buttons and no armed key in that tab.
  - The user gets one notice about it, not a toast per click. Where the notice shows is ticket 18's call.
- **The account changed in another tab** (ticket 11's `datasyncId` guard):
  - Save and Like stop in this tab, because they write to an account. Their buttons show failed, and the toast reads "Your YouTube account changed in another tab. Reload this page to keep saving here."
  - Play next, Add to queue and Remove from queue keep working, because they only change this tab's queue.
- **The row's data can't be read when it's clicked:** that counts as a failure for that item.
- **The row is recycled, or the user navigates away, mid-action:** the action finishes on the data read at click time, and the toast still shows.

### Installed app and Firefox

- **Installed app:** behaviour is identical in the installed YouTube Music app (Chrome and Edge, and Firefox web apps on Windows). It's the same page, and the keys are caught in the page. Ticket 25 checks this live.
- **Firefox:** it has no casting, so the casting state never applies there.

### Left to other tickets

These aren't decided here:
- how keys are caught: [08](08-shortcuts.md);
- the add, duplicate and create flow: [12](12-adding.md);
- dispatch, and where membership comes from: [10](10-youtube-access.md);
- the look and exact placement: [27](27-youtube-music-controls.md), [09](09-where-things-live.md) and [15](15-popup-and-settings.md);
- where the breakage notice shows: [18](18-breakage.md);
- what syncs: [16](16-storage-and-sync.md). The split between account and shared settings is ticket 11's, folded in above.

Also from [ticket 10](10-youtube-access.md), and accepted by the main session: if no cast signal can be read (live check M5), queue actions stay available while casting, and the toast says it changed this tab's queue. This softens "unavailable while casting". If M3 shows likes trigger YouTube Music's own toast, there's no quiet route for likes.

## Amendment after ticket 28 (main session, 2026-10-19)

[Ticket 28](28-queue-reorder.md) found that a queued item can be moved through YouTube Music's own reorder path, so this improvement is adopted. It improves an existing capability, so no check-in was needed. It supersedes "Queue items don't get Play next or Add to queue":
- On a queue item, **Play next** moves it to right after the playing song, and **Add to queue** moves it to the end. No second copy is made. The toast says "Moved …", and Undo moves it back.
- **Remove from queue's Undo** puts the item back at its old position the same way.
- Autoplay suggestions can't be moved, so they keep no Play next / Add to queue.
- **Every move:** check the item before firing, and confirm its new position afterwards; if it didn't move, show the failure toast.
- **After inserts:** our insert also turns off the responsive-radio flag, as YouTube Music does.

Also from [ticket 08](08-shortcuts.md), adopted:
- character-first key matching;
- "pointer or focus, whichever moved last";
- Ctrl+Alt can't be recorded;
- a key can't fire two shortcuts on one site (the recorder offers "Use it here");
- Alt+U undo also works on YouTube Music;
- presets skip keys that are already taken.
