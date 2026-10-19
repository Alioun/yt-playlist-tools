# Each browser keeps its own settings; settings sync copies whole documents through storage.sync

2.0's settings and account setups live in `storage.local`, which is the truth for each browser. Settings sync, when the user switches it on in a browser, copies whole documents through `storage.sync`: the shared settings, one document per account setup, and one per channel filter. The newest edit of a document wins, deletions travel as tombstones, and when two separately synced histories meet, the user picks a side.

We chose this because `storage.sync` can't be the store. Both browsers delete the synced copy when the extension is uninstalled anywhere, and Chrome's first sync after sign-in deletes keys that exist only locally. Its quotas (about 100 KB, 8 KB per item, 512 items) and write limits also need a single owner, which is the background's store module.

## Considered options

- **`storage.sync` as the store while sync is on:** one uninstall anywhere would wipe every browser's settings.
- **A field-level automatic merge:** a quick edit in one browser could silently beat an older, careful setup in another.
- **Syncing only what fits the quota:** browsers would differ without anyone noticing.

## Consequences

- The synced copy has a budget of 96 KiB and 480 items, about 1,060 listed channels beside 20 shortcuts and 5 accounts. While sync is on, a change that doesn't fit is refused and explained.
- Caches, consent, watch progress, session memory and the unclaimed 1.x setup never sync.
- Only the background writes storage. Content scripts get a per-tab view from it.
- Clear All Data resets this browser. It deletes the synced copy only if the user ticks that.
