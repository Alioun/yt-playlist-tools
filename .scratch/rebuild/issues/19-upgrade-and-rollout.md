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
