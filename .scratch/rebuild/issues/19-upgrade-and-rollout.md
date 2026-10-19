# How do 1.4.5 users upgrade, and how does 2.0 roll out?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 06, 10, 16, 22, 23

## Question

With [ticket 06](06-upgrade-path.md), [ticket 10](10-youtube-access.md) and [ticket 16](16-storage-and-sync.md) answered, decide:
- the migration steps;
- the permission prompts 1.4.5 users will see, and how the one-time note explains them;
- the release order: the AMO update and the first Chrome Web Store listing;
- versioning;
- listing text and screenshots;
- retiring `server/` and the auth docs;
- whether a beta comes first.

Also from [ticket 03](03-store-policy.md):
- the privacy policy page and where it's hosted;
- the Chrome Web Store data disclosures, single-purpose statement and permission justifications;
- a reviewer README for the Bun build, plus an ARM64 rebuild check, because AMO's reviewer machines are ARM64 with Node and npm;
- a test account for reviewers.

Also from [ticket 06](06-upgrade-path.md):
- **Carry-over values:** carry over what 1.4.5 actually did (0 %, toasts off, Ctrl shortcuts dead) or what its popup showed (50 %, toasts on)?
- **Before consent:** what happens to carried-over auto-add before the user accepts the disclosure, which the one-time note doubles as?
- **Old Google access:** revoke the old OAuth tokens (needs a Google host permission) or link to myaccount.google.com/permissions?
- **Minimum Firefox:** 128, 140 or 153?
- **Upgrade testing:** test it before release with a self-hosted `update_url`.
- **CI:** move `release.yml` to Chrome Web Store API v2 and pass AMO notes through `FIREFOX_AMO_METADATA_FILE`.

Also from [ticket 11](11-accounts.md):
- 1.4.5 playlists become an unclaimed setup, claimed only after consent by the first account that owns them.
- The upgrade note gains "Sign in to YouTube and your 1.x playlists will be picked up."
- The store disclosures mention that account name, handle and avatar URL are stored locally, and synced if sync is on.

Also from [ticket 22](22-name.md):
- Both stores take the new name; the AMO slug and gecko ID stay.
- The AMO description says "(formerly YouTube Playlist Tools)", and the upgrade note mentions the rename.
- Add the attribution line: "YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions." plus "Not affiliated with or endorsed by YouTube or Google."
- Store screenshots use the user's own or Creative Commons videos.

Also from [ticket 10](10-youtube-access.md):
- **Manifests:** both are in its section 11.
- **Firefox:** the 1.4.5 → 2.0 update shows no prompt.
- **Chrome:** www.youtube.com only at install; YouTube Music access is requested when that feature is switched on.
- **Floors:** Chrome 121, Firefox 140.
- **Disclosures:** add "Authentication information" and the privacy-policy line if the page-signed request ships.
- **Listing:** the `scripting` justification is in section 11, and the reviewer notes list the routes and endpoints.
- **Removed:** `identity` and the Google hosts.

Also from [ticket 12](12-adding.md):
- 1.4.5's toasts on → Show feedback on; off → off. Failures now still show for them.
- Release note: auto-add no longer adds duplicates, and no longer claims "Added" when an add failed.

Also from [ticket 07](07-watched.md):
- The one-time note could say "Auto-add now counts only what you actually watch. Skipping ahead and ads don't count."
- The privacy policy mentions locally kept watch progress (up to 30 days).

Also from [ticket 08](08-shortcuts.md):
- the 1.4.5 key-conversion rules (in its Answer);
- the feature is on only if both a key and a playlist carry over;
- upgraders get no Watch later preset;
- the upgrade note names a carried Ctrl key (it never fired in 1.4.5) and explains unconvertible keys.

Also from [ticket 18](18-breakage.md):
- **Release gates:** the static watch green, the browser watch green or inconclusive, the signed-in live check run, and no live-check code in the zips.
- **Hotfix lane:** a CI check that the manifest is unchanged apart from `version`; per-store publish switches; Chrome hotfixes publish on approval (`skipReview` tried, never relied on); a reviewer-notes template.
- **Bad releases:** roll back first, then submit the fix (Chrome's rollback discards pending submissions).
- **Support channel:** for reports (PROVISIONAL: GitHub issues).
- **Watch alive:** GitHub disables scheduled workflows after 60 days of inactivity, so the checklist confirms the watch still runs.
- **Beta:** AMO has no pre-release channel. Consider a self-hosted unlisted beta.

Also from [ticket 24](24-performance-budget.md): the release checklist runs the timing test on the reference machine in both browsers, and `release.yml` runs the size check too.

Also from [ticket 16](16-storage-and-sync.md):
- **Migration table:** in its section 10.2, including cleaning typed playlist IDs and the 1.5.0 developer keys.
- **Old stores:** IndexedDB is deleted from the background; the old `localStorage` keys are removed by the first extension page.
- **Upgraders:** sync starts off, and the upgrade note is set to pending.
- **Privacy policy:** list what's stored locally (watch progress up to 30 days, playlist lists with thumbnails, account name, handle and avatar URL) and what syncs when sync is on.
- **Carry-over:** ticket 16 recommends carrying 1.4.5's real values (0 %, feedback off). Confirm, and plan for AMO's required-type case.
