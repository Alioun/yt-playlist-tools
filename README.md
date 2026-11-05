<picture>
  <source srcset="assets/brand/lockup-on-dark.svg" media="(prefers-color-scheme: dark)">
  <img src="assets/brand/lockup-on-light.svg" alt="Perchling" width="236" height="64">
</picture>

# Perchling for YouTube™

[![CI](https://github.com/Alioun/yt-playlist-tools/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Alioun/yt-playlist-tools/actions/workflows/ci.yml)

A browser extension for Firefox and Chrome that saves the video or song you're on to Watch Later or any of your playlists, with one click or one key, right where you are on YouTube and YouTube Music. Every feature starts off, and nothing runs until you switch it on. It was called YouTube Playlist Tools until 2.0.

## Status

2.0 is a ground-up rebuild, and it's being built on `dev`. The first beta, 1.99.1, isn't out yet. When it is, [the beta page](https://alioun.github.io/yt-playlist-tools/beta/) has it.

[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/youtube-playlist-tools/) still serves 1.4.5 as YouTube Playlist Tools. It needs Google credentials you create yourself, as the [1.4.5 setup guide](docs/legacy/1.4.5-setup.md) explains. 2.0 replaces it as an ordinary update. The Chrome Web Store listing follows about a week after the Firefox release.

## What it does

On YouTube:
- quick-save on thumbnails, where one click saves a video to the playlist you pick and a picker shows where it already is;
- up to 20 playlist shortcuts, each a key that saves to its own playlist, and Alt+W for Watch Later;
- auto-add, which saves the videos you actually watch to playlists you pick, with channel filters;
- a watch-page button, a queue button on thumbnails, Save to ▸ in the browser's right-click menu, and creating playlists from any chooser;
- Gather tabs, which collects the YouTube videos open in a window into one list, YouTube's queue or a playlist.

On YouTube Music, Play next, Add to queue, Save to playlist and Like are one click or one key away. Everywhere, keys from any tab save or like what's playing while YouTube is in another tab, every save has Undo, each YouTube account has its own setup, and settings can sync through your browser.

[docs/features.md](docs/features.md) lists every feature.

## How it works

Perchling works inside your YouTube and YouTube Music tabs, as the account you're signed in to there, and sends the same requests YouTube's own buttons send ([ADR-0001](docs/adr/0001-youtube-access-through-the-users-session.md)). It needs no Google sign-in, API key or password, and it has no server. Nothing goes to the developer. The [privacy policy](https://alioun.github.io/yt-playlist-tools/privacy/) says exactly what it handles.

Perchling depends on how YouTube's website works today, so a change at YouTube can stop a feature until an update ships. Perchling tells you when that happens, and [Known problems](https://github.com/Alioun/yt-playlist-tools/issues?q=is%3Aissue%20label%3Ayoutube-change) lists them.

## Problems and ideas

[Open an issue](https://github.com/Alioun/yt-playlist-tools/issues/new/choose). The forms ask for what the developer needs. There's no support e-mail.

## Working on it

- [Development](docs/development/README.md): setup, commands, tests and CI
- [The 2.0 spec](.scratch/rebuild/spec.md), and the [planning hub](docs/rebuild/README.md) for its chapters, decisions and research
- [All docs](docs/README.md)

## Releasing

[RELEASING.md](RELEASING.md) is the checklist for every release, beta and hotfix. [docs/development/releasing.md](docs/development/releasing.md) explains how `release.yml` decides, builds and submits. The listing text and reviewer notes are in [store/](store/listing/README.md), and the website with the privacy policy is in [site/](site/).

## Credits

Gather tabs is a port of [GatherTube](https://github.com/karimelgazar/gathertube) by Karim Elgazar. The wordmark is drawn in Nunito, under the SIL Open Font License ([assets/brand/](assets/brand/README.md)).

## License

[MPL-2.0](LICENSE).

Not affiliated with or endorsed by YouTube or Google. YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions.
