# What is 2.0 called?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)

## Question

The Chrome Web Store won't accept "YouTube Playlist Tools": Google's branding rules forbid its trademarks as an extension's name and require "… for YouTube™" plus an attribution line ([ticket 03](03-store-policy.md)). Another developer's Chrome listing already uses exactly that name. AMO allows the current name, but Google can still file a takedown there.

Decide:
- the 2.0 name on both stores;
- whether AMO keeps the old name or both stores match;
- the attribution line;
- how the icon and store images avoid imitating YouTube's look and feel.

## Answer

**PROVISIONAL, pending the user's confirmation. The name is the user's call; everything below is a recommendation.**

**Recommended: Playlist Pigeon for YouTube™** on both stores. **Runner-up: Playlist Courier for YouTube™.**

The name says what the extension does: it carries each video to the right playlist, and pigeonholes are the classic filing slots. It keeps "Playlist", the word people search for, and the job it names covers YouTube Music too. It's 28 characters, under AMO's 50 and Chrome's 75. Neither the name nor a pigeon icon needs anything from YouTube's red, play-button look. It is the only candidate with no collision on any store, on GitHub, in either trademark register or on the web. The runner-up is equally clean and uses the same idea in a more sober tone, for a user who finds a bird too playful.

The AMO listing takes the same name. The slug `youtube-playlist-tools` and the gecko ID stay unchanged. The attribution line is: "YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions."

### How the names were checked

All checks ran on 2026-10-19. Store searches are fuzzy, and a register search isn't legal clearance.

- **Chrome Web Store:** results scraped from `chromewebstore.google.com/search/<name>`.
- **AMO:** the `api/v5/addons/search` API.
- **Edge Add-ons:** the store's own `addons/v4/getfilteredorderedsearch` API.
- **GitHub:** `gh search repos`.
- **US marks:** USPTO's `tmsearch` backend.
- **Other registers:** TMview (EU, national offices, CN, CA, JP and more).
- **Elsewhere:** a web search, and DNS for the `.com` and `.app` domains.

About 60 names were screened in total. Rules that shaped the list:
- Google's trademark list has "YouTube™ video community", "YouTube Shorts™" and "Google Keep™".
- TMview shows "YOUTUBE MUSIC" registered to Google LLC in CN and CA.
- brand.youtube asks that "Tuber" not appear in official names.
- YouTube's API branding rules ban "YT" and "You-Tube" derivatives in names.
- So no candidate uses Tube, Tuber, YT or Keep.

### Shortlist

| Name | Stores (CWS · AMO · Edge) | GitHub | Marks (USPTO · TMview) and web | Verdict |
|---|---|---|---|---|
| **Playlist Pigeon for YouTube™** | No listing with the phrase on any store. Listings called just "Pigeon" are wallpapers, a forum-insights tool and "PigeonHole" (a Gmail account switcher); none is about video or music | No repo | No mark on either register. About 120 live US marks contain PIGEON (e.g. DIGITAL PIGEON, MESSENGER PIGEON); these are compounds that coexist. No product found on the web. playlistpigeon.com and .app have no DNS | **Recommended** |
| **Playlist Courier for YouTube™** | None on any store | No repo | No mark on either register. "Courier" alone is a busy software word (the Courier notification API, the Courier typeface). Nothing on the web. The domain has no DNS | **Runner-up** |
| Playlist Pilot for YouTube™ | None on any store, but "-pilot" names crowd all three stores as AI assistants (Copilot Sidebar, aiPilot, Webpilot, "Video Pilot") | About 15 `PlaylistPilot` repos, mostly AI playlist generators | No mark | Reads as an AI playlist generator, which misleads for a no-AI tool |
| Playlist Kit for YouTube™ | None on any store; "Tube Flash Kit - YouTube Toolkit" is nearby on Chrome | `suno-playlist-kit` only | No compound mark; KIT is registered by Kit Inc. playlistkit.com is a live music-playlist product | Same-field collision, and it sounds like an SDK |
| Playlist Butler for YouTube™ | None on any store | One empty repo | No compound mark; dozens of "X BUTLER" US marks. Music-space neighbours: SongButler (which also works with YouTube), TuneButler, Butler Music | Crowded in music, and dated |
| Listmark for YouTube™ | None on any store | A few tiny repos | LISTMARK is a live US filing by Listmark LLC (class 35, online marketplace) | Trademark hazard, and the name says nothing about video or music |
| Playlist Tools for YouTube™ (keeps continuity) | Chrome: "YouTube Playlist Tools" (another developer), "YT Playlist Tools — Reverse, Shuffle & Reorder" (also on AMO, 264 users), "playlist.tools - YouTube Playlist Manager", and "Playlist Tools for Spotify", which uses the very same "… for X" pattern | Several `playlist-tools` repos | No mark | Complies with the rules, but is confusable with four live listings |

**Dropped while screening, because the name is taken or too close:**
- **Taken on the stores:** Stow, Shelve, Tuck, Crate, Stash, Cue, Quicksave, Listwise, Setlist, Docket, Hopper, Lineup, Cubby and Pigeonhole.
- **Close to existing YouTube listings:**
  - "Playlist Wrangler: Manager for YouTube" is on all three stores.
  - "YT Playlist Plus" is on Chrome and Edge.
  - Playlist Sorter has 4+ YouTube listings.
  - "YouTube Playlist Helper" is on AMO.
  - Playlist Shelf would sit next to TubeShelf and Tubekeep.
- **Other hazards:**
  - Playlist Keeper: a GitHub desktop app that rescues YouTube playlists, plus nearness to Google Keep™.
  - Playwise: PLAYWISE is a live US mark for online games.

### Design tree, answered

1. **Rename at all?** Yes, on both stores.
   - Chrome forces it.
   - Google's general rule against putting its marks in product names applies on AMO too, and a takedown there would be a surprise outage.
   - The AMO listing's equity is small: 66 average daily users, 2 ratings, and no uploaded icon (it shows AMO's default).
   - A ground-up 2.0 that adds YouTube Music is the natural moment.
2. **Form?** "<Name> for YouTube™", exactly the pattern Chrome's branding page prescribes. YouTube Music stays out of the name: a second mark doubles the exposure and the length, and YouTube Music is part of YouTube. The summary and description name it.
3. **Keep "Playlist" as the first word?** Yes.
   - It's the search term.
   - It names the core job, on both YouTube and YouTube Music.
   - It keeps a thread to "YouTube Playlist Tools".
   - The second word does the distinguishing.
4. **Which second word?** Pigeon. It's the only one of about 60 names that is clean on every check. It fits the job (filing and delivering), and a simple, small bird suits a light, opt-in tool. It also gives an icon with no YouTube cue.
   - Courier, the runner-up, carries the same idea but is less memorable, and its natural icon (a parcel) reads as a shipping app.
   - Pilot fails on its AI connotation.
5. **Where the name appears:**
   - Manifest `name`: "Playlist Pigeon for YouTube™", one string for both builds in `wxt.config.ts`.
   - `short_name`: "Pigeon" (Chrome recommends 12 characters or fewer).
   - The popup and settings header say just "Playlist Pigeon". No ™ is needed where YouTube isn't named.
   - Suggested manifest `description` (121 of Chrome's 132 characters): "Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click away."
6. **AMO: keep the old name or match?** Match.
   - **Name:** set the 2.0 manifest name, and also edit the listing name in the Developer Hub, so the listing changes whether or not AMO takes the name from the manifest.
   - **Slug:** `youtube-playlist-tools` stays for URL continuity and the existing reviews. It's a URL, not the name.
   - **Gecko ID:** `{cc70cd21-2cc6-444b-bd89-496909346091}` stays, so updates keep flowing.
   - **Transition:**
     - Through 2.x, the AMO summary or description says "(formerly YouTube Playlist Tools)".
     - The 2.0 release notes state the rename.
     - The one-time note for 1.4.5 upgraders ([ticket 19](19-upgrade-and-rollout.md)) should mention the new name next to "no Google credentials needed anymore".
7. **Attribution line:** "YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions."
   - It follows Google's own sentence, in the plural for two marks.
   - It goes last in both store descriptions, in the settings page's About section, and in the README, together with ticket 03's "Not affiliated with or endorsed by YouTube or Google."
   - If any listing text writes "YouTube Shorts" (for auto-add on Shorts), add it to the line, because it's a listed mark of its own; otherwise write "Shorts".
8. **GitHub repo and domain:**
   - `yt-playlist-tools` can stay: a repo name isn't a product name. Renaming it to `playlist-pigeon` later is optional, and GitHub redirects the old URLs.
   - Chrome's required privacy-policy page can live on GitHub Pages. playlistpigeon.com and .app look unregistered if a domain is ever wanted.

### Icon and store-image brief

Avoid YouTube's identity:
- **Colours:** brand.youtube lists YouTube Red `#FF0033`, Almost Black `#212121` and White. Avoid red or red-orange as the main colour, and avoid that three-colour combination.
- **Shapes:**
  - no rounded-rectangle "screen" shape;
  - no play triangle (▶) anywhere in the mark;
  - no red circle-with-ring, which is YouTube Music's icon;
  - no YouTube logo or wordmark;
  - no YouTube Sans as display type.
- **Style:** the brand page also forbids recoloured, outlined, shadowed or skewed versions of YouTube's icon, so don't adapt it in any form.

The icon:
- **Concept:** a small, round, perched pigeon in profile. Its wing is three stacked list lines, the "playlist add" glyph 1.x already uses, which reads as a pigeon carrying your list.
- **At 16 px:** reduce it to the body silhouette plus two lines.
- **Not Twitter's bird:** make it perched, rounded and grey, never a flying blue bird, which recalls Twitter's old logo.
- **Palette:** taken from the bird itself. Dove or slate grey body (around `#5E6875`) with the iridescent neck as a teal-to-violet accent (around `#14A39A` to `#7B5CD6`). Nothing red.
- **Chrome's rules:** 96×96 artwork inside 128×128 with 16 px of transparent padding and no border. It must work on light and dark backgrounds; test on Firefox's dark toolbar and Chrome's dark mode. Ship 16, 32, 48 and 128 px.

Store images:
- **Promo images:**
  - **Sizes:** Chrome's 440×280 small promo tile (required) and the optional 1400×560 marquee.
  - **Content:** brand first, so the pigeon and "Playlist Pigeon" on the extension's palette, with little text, as Chrome advises.
  - **No YouTube imagery:** no YouTube logo or red. "for YouTube™" appears only as plain text, if at all.
- **Screenshots:** 1280×800, up to 5. Reuse the same set on AMO.
  - Show the popup and settings in the extension's own design system.
  - In-page features on real YouTube and YouTube Music pages are fine, since that's the product. Crop so YouTube's logo isn't a focal point, and add captions in the extension's own type and colours.
  - Use thumbnails from videos you own or from Creative Commons videos. brand.youtube says promotional material needs the content owners' approval.

The extension's own UI:
- 1.5.0's popup and settings header uses YouTube's play-button logo as the app's mark: `src/components/YouTubeIcon.tsx`, used in `src/entrypoints/popup/App.tsx` and `src/entrypoints/options/App.tsx`.
- Its `--primary` is YouTube red, in `src/assets/tailwind.css`.
- 2.0 replaces both with the pigeon mark and palette. That's where the "don't use Google marks as your logo" rule bites hardest.
- In-page UI still follows YouTube's theme, per the map's "Inside YouTube, look like YouTube".

### After the user confirms

Not done here, because this ticket may not touch those files:
- **Ticket:** set `Status: resolved` and add the map line.
- **Glossary:** retitle `GLOSSARY.md` from "YouTube Playlist Tools", and keep "Playlist Pigeon" out of its body; it's a product name, not a domain term.
- **ADR:** record "2.0 is named Playlist Pigeon for YouTube™ on both stores; AMO slug and gecko ID unchanged". It is:
  - hard to reverse once users learn the name;
  - surprising without context ("why not keep YouTube Playlist Tools?");
  - the result of a real trade-off.
- **Downstream tickets:** [ticket 15](15-popup-and-settings.md) carries the popup and settings branding, [ticket 19](19-upgrade-and-rollout.md) the rename note, and [ticket 20](20-write-spec.md) the listing text.
- **If the user picks the runner-up:** swap in "Playlist Courier for YouTube™" everywhere above. The brief's rules stay the same; only the concept changes, to something like a list in motion. Avoid a parcel, which reads as a shipping app.

Also from [ticket 19](19-upgrade-and-rollout.md): all drafted copy uses "Playlist Pigeon", so choosing Courier is a straight swap. Don't rename the GitHub repo while betas are installed ([ADR-0011](../../../docs/adr/0011-betas-from-github-pages.md)).
