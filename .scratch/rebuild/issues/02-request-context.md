# Where can the extension send those requests from, and with which permissions?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

Where can an MV3 extension on Chrome and Firefox send YouTube's internal requests from? Compare:
- a MAIN-world script in a YouTube tab, either a `world: "MAIN"` content script or today's injected script;
- the content script's isolated world;
- the background (Chrome service worker, Firefox event page) using the user's cookies;
- an offscreen document (Chrome) or a hidden frame.

For each place:
- **Session:** does the request carry the user's session? Cover cookies, SameSite, Firefox Total Cookie Protection and container tabs.
- **Origin:** does YouTube accept the Origin and Referer it sends? Is header rewriting through `declarativeNetRequest` needed, and is it allowed?
- **No YouTube tab:** does it work when none is open? This matters for the popup, the settings page and sync.
- **Lifetime:** how long does it live (service-worker termination)?
- **Permissions:** what does it need (host permissions, `cookies`, `scripting`, `offscreen`, `declarativeNetRequest`), and what does each permission show in install and update prompts on both browsers?
- **Versions:** the minimum Chrome and Firefox version. Firefox needs 128+ for MAIN-world content scripts; say which Firefox ESR is current in October 2026.

[Ticket 01](01-youtube-requests.md) runs in parallel. Reason about a typical authenticated `youtubei/v1` POST (for example, editing a playlist) if its list isn't in yet.

## Answer

Send YouTube's internal requests from inside a YouTube tab. With no YouTube tab open, no proven path stays within [ticket 03](03-store-policy.md)'s rules. Full findings: [`docs/research/request-context.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/request-context/docs/research/request-context.md) on branch `research/request-context`, with curl probes in `docs/research/request-context/`.

- **YouTube rejects the extension's own origin.** A `youtubei/v1` POST with Origin `chrome-extension://…` or `moz-extension://…` gets 403, even with `X-Origin: https://www.youtube.com`. A YouTube Origin, or no Origin, gets 200. This was measured signed out, so it shows the Origin check, not auth.
- **YouTube tab open:** send from that tab's MAIN world, using a manifest `world: "MAIN"` content script driven by the isolated content script.
  - The request is indistinguishable from YouTube's own: same Origin, Referer and cookies.
  - It follows the tab's container, private window and account.
  - It's the only place YouTube's client code (`ytcfg`, its auth code, `resolveCommand`) can be reached.
- **Popup or settings open while some YouTube tab exists:** route through that tab (the active one if it's YouTube, else any). The background tracks live YouTube tabs from content-script messages, so no `tabs` permission is needed.
- **No YouTube tab:** show cached data and offer to open YouTube.
  - The background, popup and settings pages could only send requests by rewriting Origin (`declarativeNetRequest`, or Chrome 149+'s undocumented fetch-time override) and reading SAPISID through `cookies`. Ticket 03 rules out both, and that path also sees only the default cookie store.
  - A hidden youtube.com frame (a Chrome offscreen document, or the Firefox event page) is the only no-tab option without header rewriting. It's unproven: normal pages send `X-Frame-Options: SAMEORIGIN`, but `/embed/<id>` and `/robots.txt` don't. See [ticket 25](25-live-checks.md).
- **Permissions:**
  - Keep `storage` plus a content script on `https://www.youtube.com/*`, which counts as host access on both browsers.
  - Add `offscreen` (Chrome) only if the frame works.
  - Drop `identity`, `activeTab`, `scripting` and the googleapis hosts.
- **Prompts:**
  - Chrome shows only "Read and change your data on www.youtube.com".
  - Firefox shows one host line, and the 1.4.5 → 2.0 update shows no prompt.
  - Firefox MV3 users can revoke host access (and Firefox 125–126 installs didn't grant it), so 2.0 must check access at startup and ask from a click.
- **Versions:** Chrome 111+. Firefox 128+ for MAIN-world content scripts, up from 125. ESR 153 is current; ESR 140 ended on 2026-09-29.

**Open:**
- **Inside the tab:** "no cookie reading" holds only if YouTube's own client can send every request, or if same-origin requests carrying cookies need no `Authorization` header. Both are unverified. Otherwise the MAIN world reads SAPISID from `document.cookie` to build the header, as the listed Multiselect for YouTube does. [Ticket 10](10-youtube-access.md) decides; [ticket 25](25-live-checks.md) checks it live.
- **Real-browser checks:** section 8 of the doc lists checks that need a signed-in Chrome and Firefox.
