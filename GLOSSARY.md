# YouTube Playlist Tools

A browser extension that files the YouTube videos you watch into your own playlists, and puts YouTube Music's everyday actions one click away.

## Language

### The extension

**Feature**:
A part of the extension the user can switch on or off by itself, such as auto-add or YouTube Music's quick actions. A feature that's off leaves no trace on YouTube's pages.
_Avoid_: Module, plugin, tool

### Adding videos

**Auto-add**:
Adding the current video to every auto-add playlist once the user has watched the required percentage of it. The only add path that happens without an explicit user action.
_Avoid_: Auto-save, auto-playlist

**Auto-add playlist**:
A playlist the user has selected to receive auto-added videos.
_Avoid_: Target playlist, selected playlist

**Shortcut playlist**:
The single playlist the keyboard shortcut adds the current video to.

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
An action on a song, album or playlist that YouTube Music only offers through its ⋮ menu, made available in one click or one key.
_Avoid_: Hover action, menu shortcut

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

**Orphaned filter**:
A channel filter whose playlist no longer exists in the user's account. It is kept, never shown, and still counts as listing its channels.

**Unknown channel**:
The state where a video's channel can't be identified when auto-add fires. A filter in denylist mode lets the video through; one in allowlist mode does not.
_Avoid_: Unresolved channel, missing channel
