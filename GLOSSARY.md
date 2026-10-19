# YouTube Playlist Tools

A browser extension that files the YouTube videos you watch into your own playlists, and puts YouTube Music's everyday actions one click away.

## Language

### The extension

**Feature**:
A part of the extension the user can switch on or off by itself, such as auto-add or YouTube Music's quick actions. A feature that's off leaves no trace on YouTube's pages.
_Avoid_: Module, plugin, tool

**Site access**:
The browser's permission for the extension to run on YouTube or on YouTube Music, which the user can withhold or revoke.
_Avoid_: Host permission (in user-facing text), grant

**Serving tab**:
The YouTube or YouTube Music tab the extension works through for the popup or settings, chosen because it's signed in to the account being shown.
_Avoid_: Host tab, proxy tab

**Breakage signal**:
A note, kept only in the browser, that something the extension relies on in YouTube or YouTube Music is missing or answered in a way the extension doesn't recognise. It never leaves the browser.
_Avoid_: Error report, telemetry event, crash

**Not working**:
The state of a switched-on feature, or one of its actions, that can't do its job in a tab because YouTube or YouTube Music changed something it relies on. It's always shown, and clears by itself once the feature works again.
_Avoid_: Broken, disabled, unavailable (which is by design, e.g. while casting)

**Partly working**:
The state of a feature that still does its job but has lost an optional part, such as the playlist picker's check marks.
_Avoid_: Degraded, limited

**Diagnostics report**:
A plain-text summary of the extension's state and recent breakage signals, which the user reads and copies to share by choice. It never names a video, playlist, channel or account.
_Avoid_: Bug report, log dump, telemetry

**Shared settings**:
The settings every account uses: each feature's switch and options, the shortcuts' keys and labels, the default required percentage, and the theme.
_Avoid_: Global settings, preferences

**Settings sync**:
The feature that keeps shared settings and account setups the same in every browser where the user switches it on, through the browser's own sync.
_Avoid_: Cloud sync, backup

**Synced copy**:
The shared settings and account setups held in the browser's own sync storage, which every browser with settings sync on reads and writes.
_Avoid_: Cloud copy, server copy

**Clear all data**:
Removing everything the extension keeps in this browser, so it starts as if just installed. The synced copy is deleted only if the user asks.
_Avoid_: Reset, factory reset

**Job**:
One thing the extension asks YouTube or YouTube Music to do or tell it, such as adding a video to a playlist or reading which playlists hold it. A job is done in one tab, as that tab's account.
_Avoid_: Request (one job may send several requests, or none), call, task

### Accounts

**Account**:
The YouTube identity a page is signed in as: a Google account, or a brand account it has switched to. Each account has its own playlists, Watch Later and account setup; a signed-out page has none.
_Avoid_: Channel (a video's channel), profile, user, identity, Google account (when a brand account may be meant)

**Account setup**:
The settings that belong to one account: every choice that names one of its playlists, such as its auto-add playlists, their channel filters and the playlist each shortcut adds to. All other settings are shared by every account.
_Avoid_: Profile, per-account settings, account config

**Unclaimed setup**:
An account setup that doesn't know its account yet, such as the one carried over from 1.x. It's never used until an account that owns its playlists claims it.
_Avoid_: Legacy setup, orphaned setup

**Account in view**:
The account whose playlists and setup the popup or settings are showing. It changes only what the extension shows, never which account YouTube uses.
_Avoid_: Current account, selected account, active account

### Adding videos

**Auto-add**:
Adding the current video to each auto-add playlist once its watch progress reaches that playlist's required percentage. The only add path that happens without an explicit user action.
_Avoid_: Auto-save, auto-playlist

**Auto-add playlist**:
A playlist the user has selected to receive auto-added videos. Each one takes videos, Shorts or both, and may set its own required percentage.
_Avoid_: Target playlist, selected playlist

**Watch progress**:
How much of a video the user has actually played, as a share of its length. Each part counts once, at any speed; ads and anything skipped over don't count.
_Avoid_: Playhead position, watch time, watched percentage

**Required percentage**:
The watch progress at which auto-add adds a video to an auto-add playlist. One default is shared by every account; an auto-add playlist can set its own.
_Avoid_: Watch threshold, threshold, trigger point

**Short**:
A video played in YouTube's Shorts player. The same video opened on a watch page is a video, not a Short.
_Avoid_: Reel

**Session skip**:
A video that auto-add leaves out of some or all of an account's auto-add playlists until the browser restarts, because the user undid or unticked its auto-add or chose "Don't auto-add this video". Explicit adds ignore it.
_Avoid_: Excluded video, blocklist, ignore list

**Paused auto-add**:
Auto-add stopped by the user until they resume it or the browser restarts; nothing watched meanwhile counts. Unlike switching the feature off, its settings and page code stay.
_Avoid_: Disabled, off

**Add**:
One video put into one or more of the user's playlists by a single action of one feature: auto-add, a playlist shortcut, quick-save or Save to playlist. Putting a video in the queue is Add to queue, not an add.
_Avoid_: Insert, save request

**Outcome**:
What an add did for one playlist: added, already in, filtered out, skipped or failed.
_Avoid_: Result, status

**Membership**:
Which of the user's playlists contain a given video, as YouTube itself reports it at that moment.
_Avoid_: Duplicate cache, saved state

**Already in**:
The outcome for a playlist that already contains the video. Nothing is added, because the extension never puts a second copy of a video in a playlist. It isn't a failure.
_Avoid_: Duplicate (as an outcome)

**Missing playlist**:
A playlist chosen for a feature that YouTube no longer accepts adds to, because it was deleted or isn't the user's. It stays chosen, marked missing, until the user removes it.
_Avoid_: Dead playlist, invalid playlist

**Confirmation**:
A toast saying an action did what was asked. It's the only kind a feature's Show feedback switch hides.
_Avoid_: Success toast

### Queue

**Queue**:
The list of videos or songs that play after the current one, on YouTube or YouTube Music.
_Avoid_: Up next (YouTube Music's tab label), playlist

**Play next**:
Putting a song, album or playlist into the queue directly after what's playing.

**Add to queue**:
Putting a video, song, album or playlist at the end of the queue.
_Avoid_: Enqueue, append

**Quick action**:
One of YouTube Music's own actions on a song, album or playlist (Play next, Add to queue, Save to playlist, Like, Remove from queue), offered by the extension in one click or one key.
_Avoid_: Hover action, menu shortcut

**Remove from queue**:
Taking one entry out of the queue.
_Avoid_: Dequeue, delete from queue

**Playing song**:
The song YouTube Music is on, playing or paused: the queue's current item. Never an ad.
_Avoid_: Current track, now playing

**Save to playlist**:
YouTube Music's quick action that adds a song to one of the user's playlists: to its quick-save playlist in one click, or to any playlist through the playlist picker.
_Avoid_: Add to playlist (on YouTube Music), bookmark

**Quick-save playlist**:
The playlist a one-click save adds to. YouTube's thumbnail quick-save and YouTube Music's Save to playlist each have their own, per account.
_Avoid_: Default playlist, one-click playlist, target playlist

**Playlist picker**:
The extension's list of the user's playlists, with a check mark on each one that already holds the song or video.
_Avoid_: Save dialog (YouTube's own), playlist menu

### Shortcuts

**Shortcut**:
A key the user gives one of the extension's actions on YouTube and YouTube Music pages: a playlist shortcut, a quick-action shortcut, the picker key or the undo key. It works only while one of those pages has keyboard focus.
_Avoid_: Hotkey, keybinding, keyboard command (the browser's own)

**Playlist shortcut**:
A shortcut that saves the pointed-at item, else the current video or playing song, to the playlist chosen for it on the current account. Its key and label are shared by every account.
_Avoid_: Shortcut playlist, hotkey

**Shortcut label**:
The user's own name for a playlist shortcut, shown instead of its playlist's title wherever the shortcut is listed. Toasts still name the playlist.
_Avoid_: Shortcut name, shortcut title

**Quick-action shortcut**:
A key that runs one quick action on the pointed-at item, else on the playing song.
_Avoid_: Hotkey, music shortcut

**Pointed-at item**:
The video, Short, song, album, playlist, channel or post under the pointer or holding keyboard focus when a key is pressed, whichever the user moved to last.
_Avoid_: Hovered row, target, selection

**Current video**:
The video a YouTube tab is on, playing or paused: the watch page's video, the Short on screen, or the miniplayer's video. Ads never count.
_Avoid_: Playing video, active video

### Channel filters

**Channel filter**:
An auto-add playlist's rule about which channels' videos may be auto-added to it. Each auto-add playlist has at most one, in either allowlist mode or denylist mode. A filter can be **switched off**: it then lets every channel through but keeps its mode and listed channels.
_Avoid_: Channel blocklist, channel exclusions; "Off" as a third mode

**Allowlist mode**:
A channel filter mode in which only videos from listed channels are auto-added.

**Denylist mode**:
A channel filter mode in which videos from listed channels are never auto-added.
_Avoid_: Blocklist, block mode

**Listed channel**:
A channel on a channel filter's list, identified by its channel ID. In allowlist mode it is allowed; in denylist mode it is denied.
_Avoid_: Denied channel, allowed channel (as entry names), filter entry

**Channel label**:
The title and optional @handle shown for a listed channel. Display only; never used to identify the channel.
_Avoid_: Channel name (as an identifier)

**Kept filter**:
A channel filter whose playlist isn't an auto-add playlist right now, because it was unticked or no longer exists. It isn't applied or shown, and returns unchanged when the playlist is ticked again.
_Avoid_: Inactive filter, stale filter

**Orphaned filter**:
A kept filter whose playlist no longer exists in the user's account. It is never shown, and still counts as listing its channels.

**Unknown channel**:
The state where a video's channel can't be identified when auto-add fires. A filter in denylist mode lets the video through; one in allowlist mode does not.
_Avoid_: Unresolved channel, missing channel
