# Prototypes

[← 2.0 planning](README.md)

Throwaway Svelte apps, one per `prototype/*` branch, that settled the 2.0 UI. They're layout references only: where a screenshot and the spec differ, the spec wins ([chapter 05, §5.13](../../.scratch/rebuild/spec/05-ui.md#513-prototypes-and-screenshots)). Click a thumbnail for the full image.

To click through one locally, check its branch out beside the repo and start it:

```sh
git worktree add ../yt-prototypes/where-things-live prototype/where-things-live
cd ../yt-prototypes/where-things-live/prototypes/where-things-live
bun install && bun run dev   # then open the printed localhost URL
```

Swap in `popup-and-settings`, `in-page-controls` or `youtube-music-controls` for the others.

## Where things live

Low-fi map of where everything lives: placement and flow only, since its look predates the three prototypes below. [Ticket 09](../../.scratch/rebuild/issues/09-where-things-live.md) · [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live) · [all 33 screenshots](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live/screenshots) · run with `bun install && bun run dev`

<details>
<summary>6 of 33 screenshots</summary>

<table>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/where-things-live/prototypes/where-things-live/screenshots/01-map.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/where-things-live/prototypes/where-things-live/screenshots/01-map.png" alt="The map" width="200"></a><br><sub>The map</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/where-things-live/prototypes/where-things-live/screenshots/02-popup-on-a-video.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/where-things-live/prototypes/where-things-live/screenshots/02-popup-on-a-video.png" alt="Popup on a video" width="200"></a><br><sub>Popup on a video</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/where-things-live/prototypes/where-things-live/screenshots/12-settings.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/where-things-live/prototypes/where-things-live/screenshots/12-settings.png" alt="Settings" width="200"></a><br><sub>Settings</sub></td>
</tr>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/where-things-live/prototypes/where-things-live/screenshots/16-first-run-1-pick-features.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/where-things-live/prototypes/where-things-live/screenshots/16-first-run-1-pick-features.png" alt="First run: pick features" width="200"></a><br><sub>First run: pick features</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/where-things-live/prototypes/where-things-live/screenshots/22-youtube-watch-button-menu.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/where-things-live/prototypes/where-things-live/screenshots/22-youtube-watch-button-menu.png" alt="Watch-page button menu" width="200"></a><br><sub>Watch-page button menu</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/where-things-live/prototypes/where-things-live/screenshots/27-youtube-music-album.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/where-things-live/prototypes/where-things-live/screenshots/27-youtube-music-album.png" alt="YouTube Music album" width="200"></a><br><sub>YouTube Music album</sub></td>
</tr>
</table>

</details>

## Popup, settings and first run

Hi-fi popup, settings page, first-run page, upgrade note and brand. [Ticket 15](../../.scratch/rebuild/issues/15-popup-and-settings.md) · [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/popup-and-settings/prototypes/popup-and-settings) · [all 73 screenshots](https://github.com/Alioun/yt-playlist-tools/tree/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots) · run with `bun run dev`

<details>
<summary>6 of 73 screenshots</summary>

<table>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/01-popup-on-video-light.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/01-popup-on-video-light.png" alt="Popup on a video" width="140"></a><br><sub>Popup on a video</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/04-popup-youtube-music-dark.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/04-popup-youtube-music-dark.png" alt="Popup on YouTube Music, dark" width="140"></a><br><sub>Popup on YouTube Music, dark</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/12-popup-picker-save-to.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/12-popup-picker-save-to.png" alt="Playlist picker" width="140"></a><br><sub>Playlist picker</sub></td>
</tr>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/62-settings-playlist-shortcuts.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/62-settings-playlist-shortcuts.png" alt="Settings: playlist shortcuts" width="200"></a><br><sub>Settings: playlist shortcuts</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/68-settings-accounts-synced-dark.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/68-settings-accounts-synced-dark.png" alt="Settings: accounts, dark" width="200"></a><br><sub>Settings: accounts, dark</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/82-first-run-2-before-you-start.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/82-first-run-2-before-you-start.png" alt="First run: consent" width="200"></a><br><sub>First run: consent</sub></td>
</tr>
</table>

</details>

## In-page controls on YouTube

YouTube's in-page controls, built as mocks and then tried on real youtube.com. [Ticket 14](../../.scratch/rebuild/issues/14-in-page-controls.md) · [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/in-page-controls/prototypes/in-page-controls) · [all 83 screenshots](https://github.com/Alioun/yt-playlist-tools/tree/prototype/in-page-controls/prototypes/in-page-controls/screenshots) (36 mock, 47 live) · run with `bun run dev`, or `bun run build` and load `dist-ext/`

<details>
<summary>6 of 83 screenshots, all live on youtube.com</summary>

<table>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-grid-hover-crop-light.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-grid-hover-crop-light.png" alt="Card buttons on hover" width="200"></a><br><sub>Card buttons on hover</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-grid-picker-light.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-grid-picker-light.png" alt="Save to… picker from a card" width="200"></a><br><sub>Save to… picker from a card</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-grid-toast-ours-light.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-grid-toast-ours-light.png" alt="Saved toast with Undo" width="200"></a><br><sub>Saved toast with Undo</sub></td>
</tr>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-watch-light.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-watch-light.png" alt="Watch-page button" width="200"></a><br><sub>Watch-page button</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-watch-menu-dark.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-watch-menu-dark.png" alt="Watch-page auto-add menu, dark" width="200"></a><br><sub>Watch-page auto-add menu, dark</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-shorts-menu-dark.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/in-page-controls/prototypes/in-page-controls/screenshots/live-shorts-menu-dark.png" alt="Auto-add menu on Shorts, dark" width="200"></a><br><sub>Auto-add menu on Shorts, dark</sub></td>
</tr>
</table>

</details>

## In-page controls on YouTube Music

YouTube Music's in-page controls, built as mocks and then tried on real music.youtube.com. [Ticket 27](../../.scratch/rebuild/issues/27-youtube-music-controls.md) · [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/youtube-music-controls/prototypes/youtube-music-controls) · [all 49 screenshots](https://github.com/Alioun/yt-playlist-tools/tree/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots) (23 mock, 26 live) · run with `bun run dev`, or `bun run build` and load `dist/ext/`

<details>
<summary>6 of 49 screenshots, all live on music.youtube.com</summary>

<table>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r01-album-header-and-row.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r01-album-header-and-row.png" alt="Album header and row buttons" width="200"></a><br><sub>Album header and row buttons</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r03-playlist-header-and-row.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r03-playlist-header-and-row.png" alt="Playlist header and row buttons" width="200"></a><br><sub>Playlist header and row buttons</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r06-quick-picks-play-next-toast.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r06-quick-picks-play-next-toast.png" alt="Quick picks: Play next and its toast" width="200"></a><br><sub>Quick picks: Play next and its toast</sub></td>
</tr>
<tr>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r11-wiz-queue-every-button.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r11-wiz-queue-every-button.png" alt="Queue row buttons" width="200"></a><br><sub>Queue row buttons</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r13-classic-picker-from-queue.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r13-classic-picker-from-queue.png" alt="Save to playlist from the queue" width="200"></a><br><sub>Save to playlist from the queue</sub></td>
<td align="center"><a href="https://github.com/Alioun/yt-playlist-tools/blob/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r16-not-working-notice.png"><img src="https://raw.githubusercontent.com/Alioun/yt-playlist-tools/refs/heads/prototype/youtube-music-controls/prototypes/youtube-music-controls/screenshots/r16-not-working-notice.png" alt="Not-working notice" width="200"></a><br><sub>Not-working notice</sub></td>
</tr>
</table>

</details>

## Live-check probe

A throwaway extension that runs the checks the research couldn't do signed out, in your own YouTube and YouTube Music tabs, and gives one JSON report per browser. It becomes 2.0's live-check build. [Ticket 25](../../.scratch/rebuild/issues/25-live-checks.md) · [probe](https://github.com/Alioun/yt-playlist-tools/tree/task/live-checks/probes/live-checks) · [what to do](https://github.com/Alioun/yt-playlist-tools/blob/task/live-checks/probes/live-checks/CHECKLIST.md)
