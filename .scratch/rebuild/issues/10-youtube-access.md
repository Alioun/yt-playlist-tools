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
