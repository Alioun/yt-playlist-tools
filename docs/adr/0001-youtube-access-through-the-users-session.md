# YouTube access goes through the user's own session, from inside their YouTube tabs

Revised on 2026-10-19 (rebuild map, ticket 10): the mechanism is specified and the Data API fallback is withdrawn.

2.0 reads and changes YouTube data through the YouTube account the user is signed in to in the browser. It sends the same internal requests YouTube's own web client sends, from the page of an open youtube.com or music.youtube.com tab, as that tab's account. YouTube's own client builds and signs each request wherever it can hand back the result without showing anything. Where it can't, the extension signs the request in the page from YouTube's session cookie, exactly as YouTube's code does. There is no server of ours, no Google Cloud app (OAuth client or API key), and no YouTube Data API, not even as a fallback. With no YouTube tab open, the extension shows cached data and offers to open YouTube.

We chose this because the Data API path never worked for ordinary users. A shared OAuth client stays limited until Google verifies it, so 1.4.5 asks every user to create their own Google Cloud project, and the token broker built to fix that never shipped. The Data API also costs 50 quota units per add, can't reach Watch Later, and can't tell what a playlist really contains. It can't return as a fallback either: YouTube's API Developer Policies forbid an API client that also uses undocumented YouTube APIs (§III.D, §III.E), and 2.0 uses them for everything.

## Considered options

- **Data API with a verified shared client and our token broker:** needs Google's scope verification, a server to run indefinitely, and one daily quota shared by every user (about 200 adds a day at the default 10,000 units).
- **Data API as a fallback on the user's own Google credentials** (this ADR's first version): withdrawn. Alongside session requests it breaches YouTube's API policies, and their branding rules forbid "YouTube" in the app's name. No job needs it.
- **Requests from the background, popup or settings page:** YouTube answers the extension's own origin with 403. Working around that means rewriting Origin and reading cookies through the `cookies` permission. That fakes YouTube's own security check and sees only the default cookie store, so it misses containers and private windows.
- **A hidden youtube.com frame when no tab is open:** unproven, heavy, and limited to the default cookie store. It can be added later without a permission prompt if it's ever needed.
- **Driving YouTube's visible UI**, as 1.2 did by clicking through the Save dialog: it broke with layout changes and matched playlists by name. 2.0 never drives YouTube's visible UI to do work. Opening YouTube's ⋮ menu on right-click is the feature itself, so it's exempt.

## Consequences

- 2.0 depends on undocumented requests and client internals that YouTube can change at any time, so catching breakage is part of the design (rebuild map, ticket 18).
- Fresh data needs an open YouTube tab. The popup and settings work from cache otherwise.
- Where the extension signs requests itself, it reads the session cookie in the page. This is declared as "Authentication information" on the Chrome Web Store and explained to AMO reviewers. It never uses the `cookies` permission or rewrites a request's origin.
- The only permissions are `storage`, `scripting` and YouTube's own hosts. The routes, the tab choice and the manifest are specified in the rebuild map's ticket 10.
- Amended 2026-10-20 (rebuild spec, R88 and R91): two opt-in features the user approved keep this rule. Keys from any tab and the browser menu's Save to ▸ start in the background, but each runs its job in one open YouTube or YouTube Music tab, as that tab's account. The menu adds `contextMenus` as an optional permission, held only while it's on; it gives no access to any site.
