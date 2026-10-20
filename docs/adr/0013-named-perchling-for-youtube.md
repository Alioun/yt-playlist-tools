# 2.0 is named Perchling for YouTube™ on both stores

From 2.0, the extension is "Perchling for YouTube™" on the Chrome Web Store and on AMO, and in the manifest's `name`. Its own pages and `short_name` say "Perchling". It's the same add-on: AMO's slug `youtube-playlist-tools`, the gecko ID and this repo's name stay, and the AMO listing says "Formerly YouTube Playlist Tools" through 2.x.

We chose this because the Chrome Web Store doesn't allow Google's trademarks as an extension's name, and asks for "… for YouTube™" with an attribution line. AMO allows the old name, but Google can still have it taken down. "Perchling" was the user's pick after five naming rounds ([ticket 22](../../.scratch/rebuild/issues/22-name.md)). It's one soft word that matches the Perch icon, it doesn't tie the product to playlists, and it was clean on the stores, the app stores, GitHub, USPTO, WIPO Madrid and the web.

## Considered options

- **Keep "YouTube Playlist Tools" on AMO only:** the stores would disagree, and a takedown on AMO would be a surprise outage.
- **"Playlist Pigeon for YouTube™"**, the placeholder through most of the spec: PigeonPod, an active YouTube-to-podcast tool, already brands the bird.
- **Round 5's other finalists**, such as Pigeon Perch and Pigeon Shelf: clean too, but the user preferred Perchling.

## Consequences

- The store summaries must carry the word "playlist", because the name doesn't.
- "Perchling" reads close to other "Perch" brands. A professional trademark search, the EU above all, is due before launch, because the EU registers couldn't be checked from here.
- The repo isn't renamed while betas are installed, because the Pages URL is a published contract ([ADR-0011](0011-betas-from-github-pages.md)).
