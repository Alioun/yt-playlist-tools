# How does the extension talk to YouTube?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 01, 02, 03

## Question

With [ticket 01](01-youtube-requests.md), [ticket 02](02-request-context.md) and [ticket 03](03-store-policy.md) answered, decide:
- for each job, which request is sent, from where, and with what fallback;
- whether any Data API fallback remains, under ADR-0001's rule;
- what happens when the user isn't signed in to YouTube, or no YouTube tab is open;
- the permission set;
- the minimum Chrome and Firefox versions.

Update ADR-0001 if the mechanism changes it.

Also from [ticket 03](03-store-policy.md):
- Don't read session cookies, and don't fake request origins. Let YouTube's own page authenticate requests.
- Fetch no remote config or selectors.
- A Data API fallback is nearly unavailable, because YouTube's API policies forbid mixing it with undocumented APIs. Settle the fallback clause of ADR-0001 accordingly.

Also from [ticket 06](06-upgrade-path.md): if every origin stays under `*://*.youtube.com/*`, upgrading Firefox users need no grant step. Any other origin means a grant flow for every upgrading user, because MV3 updates never grant new host permissions.
