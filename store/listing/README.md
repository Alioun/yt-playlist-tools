# Store listings

The listing text and images for Firefox Add-ons (AMO) and the Chrome Web Store, as 08-release §9 specifies them. Patch releases may not change anything in this folder: the `hotfix-freeze` gate compares it with the previous release (REL-CI-38).

Both stores take their text from here by hand, in the AMO Developer Hub and the Chrome Web Store dashboard. Nothing uploads it automatically.

## Files

| File | Where it goes |
|---|---|
| `description.md` | Both stores' description. AMO adds the line `Formerly YouTube Playlist Tools.` and a blank line before it. Chrome takes it as it is. |
| `promo-small-440x280.png` | Chrome: Store listing › Graphic assets › Small promo tile. Required. A copy of `assets/brand/promo-small-440x280.png`. |
| `marquee-1400x560.png` | Chrome: Store listing › Graphic assets › Marquee promo tile. A copy of `assets/brand/marquee-1400x560.png`. |
| Screenshots | Not here yet. Five 1280×800 PNGs, taken from the release candidate in a clean profile with the demo account (REL-STORE-07 to REL-STORE-10). Both stores get the same five, in the order below. |

## Fields

| Field | AMO (the existing listing) | Chrome Web Store (the new item) |
|---|---|---|
| Name | Perchling for YouTube™. The manifest sets it, and it's also edited in the Developer Hub. The slug `youtube-playlist-tools` and the add-on ID don't change. | From the manifest: Perchling for YouTube™ |
| Summary | Save YouTube videos to Watch Later or any playlist in one click or with a shortcut, auto-add the videos you actually watch, and get one-click Play next and Add to queue on YouTube Music. Every feature is opt-in. (Formerly YouTube Playlist Tools.) | From the manifest's `description`: Save to Watch Later or any playlist in one click or a shortcut, auto-add what you actually watch, and Add to queue on YouTube Music. |
| Description | `description.md`, with the "Formerly" line first | `description.md` |
| Category | Photos, Music & Videos | Tools (Productivity) |
| Homepage | https://alioun.github.io/yt-playlist-tools/ | The same |
| Support | https://github.com/Alioun/yt-playlist-tools/issues/new/choose | Support URL: the same |
| Privacy policy | https://alioun.github.io/yt-playlist-tools/privacy/, in the description and in the Developer Hub's privacy-policy field | Privacy tab: https://alioun.github.io/yt-playlist-tools/privacy/ (see `../cws-dashboard.md`) |
| Icon | Upload `assets/icon/amo-128.png` in the Developer Hub. AMO doesn't use the manifest's icon. | From the manifest: `store-128.png` |
| License | MPL-2.0 | Not asked |
| Compatibility | Firefox desktop only. Firefox for Android stays unticked. | Not asked |

AMO's summary allows 250 characters and uses 246. Chrome's manifest `description` allows 132 and uses 132. If a translation needs room, end Chrome's with "…and queue on YouTube Music."

During the beta, AMO's description gets one more line at the end, `A rebuilt 2.0 is in beta: https://alioun.github.io/yt-playlist-tools/beta/`. It comes out at launch (REL-STORE-05).

## Screenshots

| # | Shows | Caption |
|---|---|---|
| 1 | The YouTube home page with the thumbnail stack, and the picker open with check marks and keys | Save to any playlist in one click. |
| 2 | Settings › YouTube › Playlist shortcuts, with three labelled shortcuts and the recorder | Your keys, your labels. |
| 3 | A YouTube Music album page with Play next and Add to queue in the header and on rows, and the toast after the header's Add to queue, with Undo | YouTube Music, one click away. |
| 4 | A watch page with the popup open, This video showing a partly added status line, and the auto-add playlists unfolded | Auto-add what you actually watch. |
| 5 | Settings › YouTube, with feature rows, footprint tags and two features on | Everything starts off. |

Each caption band uses the extension's own type and palette: Perch's grey with the teal-to-violet accent, never YouTube red. Use only videos the demo account owns or Creative Commons videos, the "Perchling Demo" account with neutral playlists ("Recipes to try", "Finished", "Music for work"), no real personal data, and YouTube's logo cropped or out of focus.

## Credits and attribution

The description credits GatherTube by Karim Elgazar on the Gather tabs line (REL-STORE-38). Its last paragraph is the trademark attribution, word for word (REL-STORE-03). Listing text writes "Shorts" on its own, never "YouTube Shorts", which would have to join the attribution.
