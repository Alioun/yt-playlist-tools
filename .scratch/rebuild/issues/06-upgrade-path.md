# What happens when a 1.4.5 user updates to 2.0?

Type: research
Status: open
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

1.4.5 is the version on AMO, from June 2024. Its relevant setup (details in inventory.md):
- **Permissions:** `activeTab, storage, identity, scripting`, and no host permissions.
- **Content script:** runs on `*://*.youtube.com/*`, excluding music.youtube.com.
- **Minimum version:** `strict_min_version: 125.0`.
- **Stored data:** `playlists`, `addToPlaylistID`, `watchLaterShortcut`, `requiredWatchPercentage`, `toastEnabled`, `clientID`, `clientSecret`, `accessToken` and `refreshToken`, all in `storage.local`.

Answer these:
- What happens on Firefox when an update changes permissions: adding host permissions, dropping `identity`, raising the minimum version? Is the update held until the user approves? Are MV3 host permissions off until granted, and how does the user grant them?
- How do we run a one-time migration (`runtime.onInstalled` with `reason: "update"`) and show a one-time note?
- What does AMO review need for a major update: the source zip for a Bun build, and the data-collection declaration?
- What does a first Chrome Web Store submission need: developer account, privacy practices, permission justifications, review time?
