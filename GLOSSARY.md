# YouTube Playlist Tools

A browser extension that files the YouTube videos you watch into your own playlists.

## Language

### Adding videos

**Auto-add**:
Adding the current video to every auto-add playlist once the user has watched the required percentage of it. The only add path that happens without an explicit user action.
_Avoid_: Auto-save, auto-playlist

**Auto-add playlist**:
A playlist the user has selected to receive auto-added videos.
_Avoid_: Target playlist, selected playlist

**Shortcut playlist**:
The single playlist the keyboard shortcut adds the current video to.

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

**Unknown channel**:
The state where a video's channel can't be identified when auto-add fires. A filter in denylist mode lets the video through; one in allowlist mode does not.
_Avoid_: Unresolved channel, missing channel
