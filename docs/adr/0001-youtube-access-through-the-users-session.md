# YouTube access goes through the user's own session

2.0 reads and changes YouTube data through the YouTube account the user is already signed into in the browser, sending the same internal requests YouTube's own web client sends. There is no server of ours and no Google Cloud app (OAuth client or API key) in the normal path. The Data API returns only for a capability that can't be done this way, and then only on the user's own Google credentials.

We chose this because the Data API path never worked for ordinary users. A shared OAuth client stays limited until Google verifies it, so 1.4.5 asks every user to create their own Google Cloud project, and the token broker built to fix that never shipped. The Data API also costs 50 quota units per add, can't reach Watch Later, and can't tell what a playlist really contains.

## Considered options

- **Data API with a verified shared client and our token broker:** needs Google's scope verification, a server to run indefinitely, and one daily quota shared by every user (about 200 adds a day at the default 10,000 units).
- **Driving YouTube's visible UI**, as 1.2 did by clicking through the Save dialog: it broke with layout changes and matched playlists by name. 2.0 never drives YouTube's visible UI to do work. Opening YouTube's ⋮ menu on right-click is the feature itself, so it's exempt.

## Consequences

- 2.0 depends on undocumented requests YouTube can change at any time, so catching breakage is part of the design ([rebuild map](../../.scratch/rebuild/map.md), ticket 18).
- Which requests are sent, and from where, is decided in the rebuild map's ticket 10.
