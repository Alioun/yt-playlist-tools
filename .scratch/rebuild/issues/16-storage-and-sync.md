# Which settings sync, and how is everything stored?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 08, 11, 12, 23

## Question

Approved: settings sync across the user's browsers. Decide:
- **What syncs:** which settings sync and which stay per device.
- **Keys:** how per-account setups are keyed.
- **Storage areas:** which ones, and their limits, especially `storage.sync`'s quotas against channel filter lists.
- **Conflicts:** how they're handled.
- **Migrations:** schema versioning and migrations, including from 1.4.5.
- **Caches:** for playlists, channels and membership, and when they expire.
- **Clearing:** what "clear all data" clears.

Also from [ticket 03](03-store-policy.md): whether `storage.sync` fits AMO's `none` declaration is open ([ticket 23](23-ask-amo.md)). Nothing may be persisted from private windows.

Also from [ticket 04](04-bun-test.md): WXT's fake browser doesn't model `storage.sync`'s quota, so quota behaviour needs its own test double.

Also include:
- the YouTube Music section's settings;
- each feature's on/off state and its own settings;
- whether YouTube Music settings belong to the account or the device ([ticket 11](11-accounts.md)).
