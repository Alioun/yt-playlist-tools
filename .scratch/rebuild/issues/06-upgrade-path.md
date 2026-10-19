# What happens when a 1.4.5 user updates to 2.0?

Type: research
Status: resolved
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

## Answer

The update is mostly silent: 1.4.5 users get 2.0 without a prompt as long as every origin stays under `*://*.youtube.com/*`. Full findings: [`docs/research/upgrade-path.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/upgrade-path/docs/research/upgrade-path.md) on branch `research/upgrade-path`.

1. **The Firefox update installs within about a day without asking.** It's held for approval only if 2.0 adds a permission with a warning, or a *required* data-collection type other than `none`.
   - A held update waits behind an app-menu badge. Cancel keeps 1.4.5 and asks again at the next daily check.
   - AMO's linter rejects `has_previous_consent`.
2. **On an MV3 update, new host permissions are never prompted for or granted.** Firefox grants them only on a fresh install (Firefox source, the 127 release notes, bug 1893232). Access already granted carries over, and nearly every 1.4.5 user has `*://*.youtube.com/*` through the content script. Any other origin arrives ungranted, so 2.0 would have to request it from a button click.
3. **Users below a raised `strict_min_version` silently stay on 1.4.5.** Hardly anyone is affected: Firefox older than 128 can't use add-ons since the March 2025 root-certificate expiry, ESR 140 ended on 2026-09-29, and ESR 153 is current.
4. **Run the migration from stored state on every background start.** Firefox fires no `onInstalled` "update" if the add-on was disabled or the update is applied at browser startup. The one-time note comes from a flag the migration sets.
   - Don't add a `runtime.onUpdateAvailable` listener: it postpones updates and suppresses `onInstalled`.
5. **AMO:** an update to the listing is auto-published within about 24 h, and a human review can follow at any time.
   - It needs a sources zip whose README covers Bun 1.4.0, with a byte-identical rebuild. The reviewer machine is ARM64 Ubuntu 24.04.
   - It needs test-account credentials in the reviewer notes.
   - `data_collection_permissions` is still optional for updates, but should be added.
6. **Chrome Web Store:**
   - **Account:** 2-Step Verification, the fee and a trader declaration.
   - **Required:** the privacy tab, a privacy policy and an in-extension disclosure.
   - **Upload:** the first one is done by hand in the dashboard.
   - **Review:** "a few days, up to a few weeks".
   - **CI:** `release.yml` targets Web Store API v1.1, which was supported only until 2026-10-15, so it must move to v2.

**Conflicts found:**
- **Literal carry-over:** a literal copy of 1.4.5's values gives 0 % and toasts off to everyone who never touched those controls. An absent `toastEnabled` meant off in 1.4.5, and an absent or empty `requiredWatchPercentage` meant 0 %, stored as a string, even though the popup showed 50.
- **Ctrl shortcuts:** these never fired in 1.4.5, so carrying one over switches it on for the first time.
- **Auto-add before consent:** carried-over auto-add playlists can't fire until the user accepts the Chrome Web Store-style disclosure. The one-time note has to double as that disclosure.

These went to [ticket 19](19-upgrade-and-rollout.md). The inventory has been corrected.
