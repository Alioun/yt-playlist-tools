# Where can the extension send those requests from, and with which permissions?

Type: research
Status: open
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
