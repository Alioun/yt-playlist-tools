# How do we find out when YouTube breaks us?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 04, 10

## Question

2.0 leans on YouTube internals that can change without notice. Decide how breakage gets caught and handled:
- **Recorded tests:** tests against recorded YouTube responses at the gateway seam.
- **Live check:** an on-demand check against real YouTube.
- **User-facing failures:** what the user sees when a request fails or a response changes shape, instead of a silent failure.
- **Diagnostics:** what's possible without telemetry, given `data_collection_permissions: none`.
- **Fix speed:** how fast a fix can reach users through AMO and Chrome Web Store review.

Use `codebase-design` for the seam.

Also from [ticket 05](05-ui-stacks.md): YouTube's `--yt-sys-color-baseline--*` theme variables are undocumented and belong on the breakage watch list, along with any real-browser checks.

Also from [ticket 04](04-bun-test.md): `bun test` can't reach real browsers, real YouTube or the built output (CSS, `injectScript`). Live and in-browser checks need a different tool.

Also include: YouTube Music's internals ([ticket 21](21-youtube-music-internals.md)) belong on the same breakage watch list.

Also from [ticket 21](21-youtube-music-internals.md): the queue path depends on `ytmusic-app.networkManager`, `/music/get_queue` and `app.queue` internals. YouTube Music's new-player A/B test (since 2026-09-29) already broke several YouTube Music tools.

Also from [ticket 01](01-youtube-requests.md): `docs/research/youtube-requests/bundle-check.mjs` (branch `research/youtube-requests`) checks that the live YouTube client still has what 2.0 relies on, and can seed the breakage check. The add-to-playlist response is the piece most likely to change.

Also from [ticket 11](11-accounts.md): if `ytcfg`'s identity keys disappear, account-dependent features stop rather than act on an unknown account. Add `DATASYNC_ID` and `LOGGED_IN` to the bundle check.

Also from [ticket 26](26-youtube-music-quick-actions.md):
- An action whose internals are missing hides its button and key in that tab, with one notice rather than a toast per click.
- Add to the watch list: both like-button anchors (classic bar and Wiz miniplayer), `ytmusic-player-queue-item`, and the header button area.
