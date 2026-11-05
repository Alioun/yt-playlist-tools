# Chrome Web Store dashboard answers

Paste these into the item's Privacy tab in the Chrome Web Store Developer Dashboard (REL-STORE-20). Patch releases may not change this file: the `hotfix-freeze` gate compares it with the previous release (REL-CI-38). A change to data handling updates this file, the privacy policy (`site/privacy/`) and the consent version in the same minor release (REL-STORE-19).

## Single purpose

> Perchling files what the user watches and listens to on YouTube and YouTube Music into their own playlists, queue and likes. It does this automatically after a video is watched (optionally filtered by channel), with keyboard shortcuts, with one-click buttons for YouTube's and YouTube Music's own save, queue and like actions, or by gathering the YouTube videos open in a window into one list or playlist.

## Permission justifications

`storage`

> Keeps the user's settings in the browser: which features are on, the playlists each feature uses for each YouTube account, shortcut keys and labels, channel filters, a cached list of the user's playlists, and auto-add's watch progress, which is deleted after 30 days.

`scripting`

> Adds each feature's script to YouTube pages only while that feature is switched on, and reads data from an open YouTube tab when the popup or settings need it.

`https://www.youtube.com/*`

> The extension's features run on YouTube. They read which video is playing and how much of it has been played (auto-add), catch the user's shortcut keys, draw the buttons the user switched on, and send YouTube's own playlist requests from the user's YouTube tab, as the signed-in user. For Gather tabs, they read the addresses and titles of the YouTube tabs open in a window, to collect their videos and close those tabs when the user asks.

`https://music.youtube.com/*` (optional)

> Requested only when the user switches on a YouTube Music feature, extends their playlist shortcuts to YouTube Music, or switches on keys from any tab. It adds the quick-action buttons and keys to YouTube Music, catches the shortcut keys there, and runs YouTube Music's own queue, save and like actions in that tab.

`contextMenus` (optional)

> Requested only when the user switches on Save from the browser's menu. It adds a Save to ▸ entry to the browser's right-click menu on YouTube video links and watch pages, and is given back when the user switches that off.

## Remote code

Choose "No, I am not using remote code." Everything ships in the package. The extension sends YouTube's own requests and hands YouTube's command objects back to YouTube's page code. It fetches and evaluates nothing.

## Data usage

These follow the privacy policy rather than the lightest precedent.

| Category | Tick | Because |
|---|---|---|
| Personally identifiable information | Yes | The account's display name and @handle are stored, and synced if sync is on |
| Health information | No | Not handled |
| Financial and payment information | No | Not handled |
| Authentication information | Yes | The page reads YouTube's sign-in cookie to sign requests |
| Personal communications | No | Not handled |
| Location | No | Not handled |
| Web history | Yes | Which videos were watched, kept as watch progress for up to 30 days, and the YouTube videos open in a window, read when the user gathers them |
| User activity | Yes | Playback progress, the shortcut keys pressed, and clicks on the extension's controls |
| Website content | Yes | Playlist names and thumbnails, and video and channel titles |

<!-- PROVISIONAL on ticket 25 (R48): untick Authentication information if no shipped route reads the session cookie. -->

Tick all three certifications: the item doesn't sell user data to third parties, doesn't use it for purposes unrelated to its single purpose, and doesn't use it to determine creditworthiness or for lending.

## Privacy policy URL

https://alioun.github.io/yt-playlist-tools/privacy/

## Test instructions

Optional on Chrome, so they're short.

> Sign in to youtube.com with any Google account that has a YouTube channel. On the first-run page, tick Auto-add and Playlist shortcuts, then click Agree. Pick a playlist, set the required percentage to 0 % (Settings › YouTube › Auto-add), play any video for a few seconds, and press Alt+W to save it to Watch later. Add to queue on thumbnails and the YouTube Music queue actions work without signing in.

## Distribution

All regions. Visibility is Unlisted during the beta and Public at launch (08-release §8.1).
