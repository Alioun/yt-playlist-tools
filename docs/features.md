# Features

[← Docs](README.md)

What Perchling for YouTube™ 2.0 does. Every feature starts off, and nothing runs until you agree to the notice on the first-run page and switch the feature on. Spec chapters [02](../.scratch/rebuild/spec/02-youtube.md) to [05](../.scratch/rebuild/spec/05-ui.md) describe each one in full.

## On YouTube

- **Quick-save on thumbnails.** One click saves a video to the playlist you pick. The arrow opens a picker that shows where the video already is, and unticking a playlist takes the video out, with Undo.
- **Playlist shortcuts.** Up to 20 keys, each saving to its own playlist, with your own labels. Alt+W saves to Watch Later. Shortcuts don't fire while you type, and Ctrl shortcuts work.
- **Auto-add.** Saves the videos you actually watch to playlists you pick, once you've watched enough of each. You set how much for each playlist, and channel filters allow or deny channels. Shorts too, if you want. It never adds a video twice.
- **Watch-page button.** Shows auto-add's status under the video, with Save to any playlist.
- **Queue button on thumbnails.** Adds a video to the end of the queue, with Undo.
- **Card menu.** Right-click a video for YouTube's own ⋮ menu.
- **Save from the browser's menu.** Adds Save to ▸ to the browser's right-click menu on YouTube video links and watch pages.
- **Create playlists** from any chooser.
- **Gather tabs.** Collects the YouTube videos open in a window into one list, YouTube's queue or a playlist, and can close their tabs, automatically too if you want. It's a port of [GatherTube](https://github.com/karimelgazar/gathertube) by Karim Elgazar.

## On YouTube Music

- **Quick actions.** Play next and Add to queue on songs, albums and playlists, Save to playlist and Like for songs, and Remove from queue for queued songs. Save to library, Start mix, Go to album and Go to artist are there if you want them, and you pick which buttons show.
- **Quick-action shortcuts.** A key for each action, for the song under your pointer.

## Everywhere

- **Keys from any tab.** Save or like the song that's playing, or save the current video to Watch Later, while YouTube is in another tab. You set these keys in your browser.
- **Undo** on every save, and a list of what you saved since the browser started.
- **Accounts.** Each of your YouTube accounts has its own setup.
- **Settings sync** through your browser's own sync, off until you turn it on, and settings files you can export and import.
- **Diagnostics** in Settings, with a report that names no video, playlist, channel or account, and Report a problem, which opens a prefilled GitHub issue.

## Upgrading from 1.4.5

Your auto-add playlists, shortcut, watch percentage and toast setting carry over. Nothing runs until you've reviewed them on the page that opens after the update. 2.0 deletes 1.x's Google client ID, secret and tokens from your browser.
