# Do the request paths work in a signed-in browser?

Type: task
Status: open
Labels: wayfinder:task
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 01, 21

## Question

Several facts the access decision ([ticket 10](10-youtube-access.md)) depends on can only be checked in a real, signed-in Chrome and Firefox ([ticket 02](02-request-context.md), section 8 of its doc). The agent builds a throwaway probe extension; the user loads it in their own browsers and runs it, following a checklist. Check:
- **Headers:** which request headers each sending place produces.
- **Own client:** can YouTube's own client machinery (`resolveCommand` and its network layer) send every request [ticket 01](01-youtube-requests.md) lists, reads included, so no extension code builds an auth header?
- **Cookies only:** does a same-origin `youtubei/v1` request carrying cookies but no `Authorization` header succeed? Is the session hash checked against `X-Origin` or `Origin`?
- **SAPISID:** can it be read from `document.cookie` while signed in?
- **Hidden frame:** does a hidden youtube.com frame (`/embed/<id>` or `/robots.txt`) load in a Chrome offscreen document and the Firefox event page? Do content scripts run in it, are the signed-in cookies and `ytcfg` there, and does a playlist edit succeed?
- **YouTube Music:** the same answers on music.youtube.com, for [ticket 21](21-youtube-music-internals.md)'s commands.
- **Prompt text:** the exact Firefox prompt text for the final permission set.

Record what was run and the results.

Also: run `docs/research/youtube-music/live-check.js` (branch `research/youtube-music`) signed in, in Chrome, Firefox and the installed YouTube Music app windows.

Also from [ticket 01](01-youtube-requests.md):
- which response shape `get_add_to_playlist` returns;
- whether `resolveCommand` hands back the response when given callbacks;
- whether the `yt-service-request` route reads data without opening YouTube's UI;
- whether a request with cookies but no auth hash counts as signed out;
- what a duplicate add does;
- whether `DATASYNC_ID` survives sign-out;
- how `#shorts-player` behaves.

## Probe

Branch `task/live-checks`, folder [`probes/live-checks/`](https://github.com/Alioun/yt-playlist-tools/tree/task/live-checks/probes/live-checks); the full steps are in its `CHECKLIST.md`. Each report entry is labelled with its check ID from tickets 07, 08, 10 (L1–L9, M1–M5, P1–P2), 11, 12, 26, 28 and 29. The hidden-frame spike was left out, since ticket 10 made it optional. Reports never contain cookie values, auth hashes or the `DATASYNC_ID` value.

1. Load `probes/live-checks` unpacked in Chrome (`chrome://extensions`, Developer mode), and as a temporary add-on in Firefox (`about:debugging`, pick `manifest.json`).
2. On a signed-in youtube.com tab and a music.youtube.com tab, tick **Allow write checks** in the red panel and press **Run probe**. Then do the by-hand extras from the checklist.
3. Press **Copy report** in each browser and paste the JSON back.

### Signed-out validation (2026-10-19)

These ran in headless Chrome for Testing 155 against live YouTube, signed out: 103 entries, no page errors, and redaction verified.

- **`resolveCommand` has moved.** No element on youtube.com has `resolveCommand` any more, and `ytd-app.handleCommandWithCommandHandler` passes no `commandController`. 1.5.0's queue bridge looks for `element.resolveCommand`, so it **likely does nothing on today's YouTube**. The global resolver can be found by shape at `default_kevlar_base.<key>.instance.resolveCommand` (the key was `O5`, which is minified and changes), and it does call `onSuccess` with the response.
- **Ticket 29 confirmed, signed out:**
  - the 1.5.0 queue command shows YouTube's "Added to Queue" for later adds;
  - removal with `params: "IAE%3D"` is quiet, and `onSuccess` gets `STATUS_SUCCEEDED`;
  - removal without params shows "Removed from Queue";
  - the quiet add returns a `setVideoId` with no toast;
  - an immediate quiet Undo got HTTP 200.
- **YouTube Music, signed out:**
  - the menu-item route works on a detached element;
  - the cast state is readable at `state.castStatus`;
  - `get_queue` returned 200 of a 500-song radio;
  - the store-only `MOVE_ITEM` comparison was inconclusive, because there's no server queue copy when signed out.
- **The auth hash** matches yt-dlp's three-part construction, and every signed-out request reads as signed out.
- **The made-for-kids flag:** `PLAYBACK_MODE_PAUSED_ONLY` on a made-for-kids test video, `ALLOW` on an ordinary one.

**Status:** waiting for the user's signed-in reports from Chrome and Firefox.

Also from [ticket 17](17-modules.md): half of P2 is answered from browser source. Both browsers clear script registrations on every update, and the start-up reconcile restores them. The probe becomes 2.0's `src/livecheck/`, and YouTube's resolver-by-shape lives in the live adapter's `command()`.

Also from [ticket 19](19-upgrade-and-rollout.md): P1 should confirm the expected prompt strings, including Chrome's music.youtube.com prompt. These results also decide the cookie line in the consent text and privacy policy, and Chrome's "Authentication information" disclosure.

Also from [ticket 27](27-youtube-music-controls.md), signed in:
- the Wiz like bar, and our Save next to it;
- whether the like repaints after our like;
- a YouTube Music toast that has an action, to compare colours;
- the album header at stacked widths;
- the installed app window.

About 1 in 4 fresh signed-out profiles got the Wiz miniplayer; forcing the flag alone gives a Wiz bar with no like.
