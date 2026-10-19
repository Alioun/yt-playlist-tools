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
