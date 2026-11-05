# Production feature registry

`registry.ts` supplies the twelve ordered `FeatureDef` records. Each extends the existing `RegistrationFeature` with a footprint and site-specific health dependencies. Settings keys come from `registration.ts`, IDs and jobs from the contracts vocabulary, and Music actions from `MusicAction` in the model. Feature display copy remains outside this module.

`features` is directly assignable to `RegistrarPorts.registry`. The fixture consumer checks that relationship, and the authored behavior test passes it into `createRegistrar` through the existing scripted ports. No production startup imports this registry yet.

## API

| Export | Meaning |
| --- | --- |
| `features` | Ordered definitions, including features without page files. The independent catalogue expectation fixes all twelve IDs, their order, switch paths, footprints and health data. |
| `libraries` | References to the existing `siteBundles` and `popoversBundle`. Bundle basenames have one owner in `registration.ts`. |
| `filesFor(site, settings)` | Eager `.js` files for that site's settings projection. MAIN page file first, then isolated core, kit if needed, then feature files in registry order. Dependencies occur once. The list includes libraries, and excludes lazy popovers. |
| `healthFor(id)` | Dependency facts for a feature by site. No route status, probe, permission, account or health claim. |
| `anchors`, `AnchorId` | Typed semantic anchor IDs owned by this unit until site-core and Monitor assembly consume the same definition. |

`filesFor` calls the real `desired` planner with consent, schema support and both site accesses assumed. It is suitable for budget and settings projections. It is not an authorization check. Registrar continues to call `desired` with actual authority. The Music section gate remains inside `desired`. The shortcuts Music predicate independently requires `settings.shortcuts.music`.

The registry uses extensionless production bundle basenames. Only the planner appends `.js`. The card menu requests no kit. Gather requests only the www core on watch and live pages when its base switch and trigger 2 or 3 are on. Trigger 1 alone registers nothing. Browser menu, any-tab keys and sync have empty `pages`.

Budget pieces are the seven library basenames and nine distinct file-backed feature basenames. File-free Gather, browser menu, any-tab keys and sync have no budget piece. The budget checker and production file guard remain unimplemented assembly work. This unit creates no entrypoint and relaxes no guard.

## Health meaning and sources

`required` jobs and `anchors` describe whole-feature prerequisites. `optional` jobs and `optionalAnchors` describe partial loss. `actions` describes the jobs whose absence removes that Music action while allowing other actions. Music action maps describe all supported options, including options that start off. The Monitor must consider the actions and anchors applicable to the current settings, page and item.

`optionalAnchors` extends the abridged ARC-REG-01 shape to encode HEALTH-07's explicit partial-anchor cases. Required and optional anchors cannot be flattened together. Future Monitor and site-core work must consume this field. The registry performs no selector query and contains no selector evidence.

The following references are relative to `.scratch/rebuild/spec/` in the frozen input.

| Definition | Source and interpretation |
| --- | --- |
| All footprints and switch paths | `04-features-accounts-data.md:29`, FT-01 and DATA-12. Sync alone uses the existing `device.syncOn` registration path. |
| Every page file, kit need and lazy popover | `06-architecture.md:839`, feature module table, `06-architecture.md:1210`, production bundles, and `07-quality.md:555`, Q-PERF-12 through Q-PERF-14. Shortcut Choose can open the picker on both sites even though its standalone picker key is www-only. |
| Gather matches, predicate and all health jobs | `06-architecture.md:710`, ARC-MAN-24, and `06-architecture.md:1184`, ARC-REG-11. The exact optional sequence is `queueAddList`, `membership`, `addBatch`, `removeBatch`. No required job or anchor is added. |
| Job support on each site | `src/shared/contracts/jobs.ts:226`. The authored test calls its real `supportsJob` for every declaration. |
| Required account and add or save | `02-youtube.md:543`, YT-ADD-02 and YT-ADD-10, `03-youtube-music.md:249`, YM-SAVE-5, and `04-features-accounts-data.md:1069`, HEALTH-09. Account availability is an operation dependency, never a declaration that an account is signed in. |
| Auto-add required membership | `02-youtube.md:577`, YT-ADD-07, and `06-architecture.md:839`. Unattended adding stays conservative while L6 is provisional. The player stream is not invented as a JobId or a DOM anchor. Measurement signals remain the Monitor's separate input under HEALTH-11. |
| Explicit-save optional membership | `02-youtube.md:577`, YT-ADD-07, `02-youtube.md:818`, YT-PK-06, and `03-youtube-music.md:249`, YM-SAVE. An unreadable membership shape can degrade ticks. This never permits writing after a failed account guard, network failure or account mismatch. |
| Optional `remove` and `unsave` | `02-youtube.md:721`, YT-ADD Undo, and `06-architecture.md:252`, Music save, unsave and their Undo. These affect Undo and picker untick without declaring the initial save route absent. |
| Optional `create` | `02-youtube.md:859`, YT-NEW-01, and `03-youtube-music.md:356`, YM-PICK-10. Creation is a secondary picker operation for shortcuts, Save and watch-menu Save. It is not a page dependency of the browser commands. |
| Optional `accountLabel` | `04-features-accounts-data.md:1066`, HEALTH-07, names account labels as partial loss. Add feedback and Choose can retain an action when the account label is unavailable. |
| Optional `channelOf` | `02-youtube.md:454`, YT-CF-06, and `02-youtube.md:1213`, YT-WB-07. Auto-add uses channel filters. The watch menu also exposes this channel's filter. Explicit shortcut and quick-save adds do not acquire a filter dependency. |
| Optional www shortcut `videoInfo` and optional card anchor | `06-architecture.md:842`, pointed-at or current video, and `04-features-accounts-data.md:1066`, HEALTH-07. Loss of either target source alone preserves the other. |
| Queue button `queueAdd`, optional `queueUndo`, required cards | `06-architecture.md:844`, `02-youtube.md:1170`, YT-Q-04 through YT-Q-10, and `04-features-accounts-data.md:1067`. Confirmation is part of `queueAdd`'s result, not a made-up job. |
| Card menu `openCardMenu`, required cards and no kit | `06-architecture.md:846`, ARC-MOD-32 at `06-architecture.md:735`, and HEALTH-07 at `04-features-accounts-data.md:1067`. |
| Watch anchor and optional Save jobs, `videoInfo` and channel read | `02-youtube.md:1213`, YT-WB-01 through YT-WB-09. Status and Settings remain useful when a menu operation is unavailable. Missing placement is a required-anchor failure. |
| Browser-menu health without a page entry | `06-architecture.md:447`, ARC-ACC-69, and `06-architecture.md:1183`, ARC-REG-10. A link target survives failure of the current-video `videoInfo` fallback. Choose uses the picker and its optional operations. |
| Music action common `itemInfo` | `03-youtube-music.md:108`, YM-QA-1, and `06-architecture.md:243`. Actions use the item's actual menu endpoints. This is required for the action features but only optional for playlist shortcuts' pointed-at targeting. |
| Music `next` and `queue` | `03-youtube-music.md:196`, YM-Q, `03-youtube-music.md:219`, YM-MOVE, and `06-architecture.md:244`. They need `queueInsert` for an item and `queueMove` for an existing queue entry. `castState` gates each queue edit under ARC-ACC-31 at `06-architecture.md:322`. |
| Music `save`, `like` and `library` | `06-architecture.md:249`, Music route table, `03-youtube-music.md:249`, YM-SAVE, and `03-youtube-music.md:767`, YM-MORE. Each depends on `account` and its write job. Membership and unsave remain optional partial capabilities. |
| Music `remove` and optional queue Undo | `03-youtube-music.md:241`, YM-RM, and `06-architecture.md:245`. `queueRemove` and `castState` govern the action. Optional `queueRemoveIds` supports insert Undo. Optional `queueReinsert` restores removals and owns repositioning through its specified route. A lost Undo must not remove every initial action. |
| Music `mix`, `album` and `artist` | `03-youtube-music.md:794`, YM-MORE-4 and YM-MORE-5, and `06-architecture.md:251`. All use `navigate`. Only mix replaces the queue and also needs `castState`. |
| Optional Music `nowPlaying` and item anchors | `03-youtube-music.md:172`, targeting, `03-youtube-music.md:639`, YM-BAR-1, and HEALTH-07. A lost playing-song fallback does not remove pointed-at actions. A lost card target does not remove the playing-song fallback. |
| Optional Music player-bar anchor | `03-youtube-music.md:639`, YM-BAR-1 through YM-BAR-4. An ineligible, narrow, signed-out, ad or absent Wiz action bar is not a failure. Only unexpectedly missing eligible content can signal. |
| Any-tab keys health on both sites | `06-architecture.md:447`, ARC-ACC-69. www requires `videoInfo` because its command has no link target. Music requires `nowPlaying`. Only save and like are exposed there, with `itemInfo` for the Like endpoint. No synthetic page file or eager dependency is added. |
| Sync has no site health | `06-architecture.md:850` and ARC-REG-10. It does not run a page job. Store and sync diagnostics remain outside page health. |

## Anchor ownership

| Anchor ID | Site | Semantic target |
| --- | --- | --- |
| `www-cards` | www | Recognised video cards in main content. Required for quick-save, queue button and card menu, optional for playlist shortcuts. |
| `www-watch-actions` | www | Watch-page action row or the enabled Shorts action column. Applicability follows watch-button settings and page type. |
| `music-items` | music | Recognised song rows, cards and queue items in main content. Optional where another target source or player-bar Save can remain. |
| `music-headers` | music | Album and playlist header action rows. Optional for Quick actions because other item kinds can remain. |
| `music-player-bar` | music | Eligible classic player-bar or Wiz action bar beside Like. Optional and subject to YM-BAR-3's exclusions. |

HEALTH-02 at `04-features-accounts-data.md:1051` owns visibility, settling and recognition thresholds. HEALTH-08 owns whole-site startup failure independently. No selector, current status or successful native probe is asserted here.

See `tools/fixtures/feature-registry/README.md` for the authored tests and deferred commands. The audit's `assembly-inventory.json` records every missing production entrypoint. Native guarantees remain unproven, privacy approval is pending, and activation is held. This unit does not complete 2.0.
