# What do store policies and YouTube's terms allow?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

Can 2.0 send YouTube's undocumented internal requests on the user's behalf, through their own session, and stay listed?

- **AMO and Chrome Web Store policies:** remote-code rules, data use and privacy disclosures, single purpose, permission justifications, and AMO's source-code submission for a Bun build. Does AMO's `data_collection_permissions: none` still hold?
- **YouTube's Terms of Service and developer policies:** what they say about automated access through a user's session, and the practical risk to a user's account.
- **Precedent:** listed extensions on either store that do this today.
- **Naming:** can a new Chrome Web Store listing be called "YouTube Playlist Tools", or do Google's branding rules require something like "Playlist Tools for YouTube"? Does AMO have a similar rule?

## Answer

Both stores allow 2.0 to work through the user's own YouTube session; the name is what has to change. Full findings: [`docs/research/store-policy.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/store-policy/docs/research/store-policy.md) on branch `research/store-policy`.

- **AMO: allowed.** Multiselect for YouTube™ (MV3) sends the same internal requests and is listed. 2.0 must ship all code in the package, unobfuscated, with buildable sources, minimal permissions, nothing stored from private windows, and test credentials for reviewers. AMO's docs mention npm and yarn but never Bun, so whether reviewers accept a Bun build is unconfirmed.
- **`data_collection_permissions: none` probably holds**, but it isn't confirmed. The definition doesn't exempt requests to the site the user is on, yet listed add-ons doing the same declare `none`. Whether `storage.sync` counts as transmission is also open. The fallback would be declaring `websiteActivity`, which needs Firefox 140+.
- **Chrome Web Store: allowed in practice.** PocketTube, Multiselect and several Watch Later tools do this with 1,000 to 400,000 users. The residual risk is the Developer Agreement's "knowingly violate a third party's terms of service" clause. 2.0 also needs:
  - a privacy policy page with the Limited Use statement;
  - data disclosures (web history, user activity, website content);
  - a single-purpose statement and per-permission justifications;
  - an in-product disclosure the user explicitly accepts before any data is handled.
- **YouTube's terms are a grey zone for users, not the stores.** The ToS bans "automated means", and robots.txt disallows `/youtubei/`. No accounts are known to have been actioned for using such extensions.
- **Naming:**
  - Chrome forbids Google trademarks as an extension's name and requires "… for YouTube™" plus an attribution line. A "YouTube Tweaks" listing was removed for this.
  - Another developer already has a Chrome listing named exactly "YouTube Playlist Tools".
  - AMO has no such rule, but Google could still file a takedown there.
- **Requirements this puts on 2.0:**
  - No remote config or selectors fetched at runtime.
  - No reading of session cookies (no `cookies` permission). Let YouTube's own page authenticate requests, and never fake request origins.
  - Drop unused permissions.
- **Conflict with the map:** the Data API fallback is nearly unavailable. YouTube's API developer policies forbid an API client that also uses undocumented APIs, and forbid "YouTube" in its name. [Ticket 10](10-youtube-access.md) settles this against ADR-0001.
- **Tension, not a conflict:** Google's trademark rules forbid imitating YouTube's look and feel in the extension's own icon, store images and popup. 1.5.0's popup uses YouTube red. In-page UI matching YouTube's theme is common among listed extensions.
