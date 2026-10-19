# How does the extension talk to YouTube?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 01, 02, 03, 21, 25

## Question

With [ticket 01](01-youtube-requests.md), [ticket 02](02-request-context.md) and [ticket 03](03-store-policy.md) answered, decide:
- for each job, which request is sent, from where, and with what fallback;
- whether any Data API fallback remains, under ADR-0001's rule;
- what happens when the user isn't signed in to YouTube, or no YouTube tab is open;
- the permission set;
- the minimum Chrome and Firefox versions.

Update ADR-0001 if the mechanism changes it.

Also from [ticket 03](03-store-policy.md):
- No `cookies` permission and no faked request origins. Let YouTube's own page authenticate requests where possible.
- Fetch no remote config or selectors.
- A Data API fallback is nearly unavailable, because YouTube's API policies forbid mixing it with undocumented APIs. Settle the fallback clause of ADR-0001 accordingly.

Also from [ticket 06](06-upgrade-path.md): if every origin stays under `*://*.youtube.com/*`, upgrading Firefox users need no grant step. Any other origin means a grant flow for every upgrading user, because MV3 updates never grant new host permissions.

Also from [ticket 02](02-request-context.md):
- **Where requests go from:** send from the YouTube tab's MAIN world, and route popup and settings requests through a live YouTube tab.
- **No tab:** choose the behaviour: cached data plus "Open YouTube", a hidden frame if [ticket 25](25-live-checks.md) proves it, or reopen ticket 03's rule against rewriting Origin.
- **Cookies:** may the MAIN world read SAPISID from `document.cookie` if YouTube's own client can't send everything? Ticket 03 rules out the `cookies` permission and rewriting Origin, not this.
- **Several tabs:** which tab is used when YouTube tabs differ in account or container (with [ticket 11](11-accounts.md)), and what happens with discarded or frozen tabs.
- **Version floors:** Chrome 111 or higher; Firefox 128, 140 or 153.
- **Host access:** detect missing or withheld youtube.com access at startup.

Also: 2.0 runs on music.youtube.com too. Check that the final content-script matches stay inside the `*://*.youtube.com/*` access 1.4.5 users already granted, so the Firefox upgrade stays silent ([ticket 06](06-upgrade-path.md)).
