# 2.0 spec

The destination of the [Rebuild (2.0) map](map.md): a ground-up rebuild of this extension that keeps every capability, adds YouTube Music quick actions, works through the user's own YouTube session, puts UI/UX first, and lets the user switch off any part of it. Every decision below was made in the map's tickets; this spec assembles them so `/to-tickets` and implementers can work from it without reading the tickets.

Status: **assembled 2026-10-19.** Items marked PROVISIONAL wait on the user's inputs listed in [Open items](#open-items). Each one names the ticket and check that settles it.

## How to read this spec

- **Chapters** live in [`spec/`](spec/). Each requirement has a stable ID (e.g. `YT-AA-03`, `ARC-MOD-12`) to cite in build tickets.
- **Vocabulary** is the glossary's: [`GLOSSARY.md`](../../GLOSSARY.md). Where the spec and the glossary differ, the glossary wins.
- **Decisions that are hard to reverse** are recorded as ADRs in [`docs/adr/`](../../docs/adr/) (index below).
- **Detail:** the tickets in [`issues/`](issues/) hold the reasoning, runner-ups and exhaustive tables. Chapters link to them where they summarise.
- **Today's behaviour** (1.5.0) is in [`inventory.md`](inventory.md). [Chapter 09](spec/09-parity.md) maps every 1.5.0 capability and defect to where 2.0 handles it.

## Chapters

| # | Chapter | Covers |
|---|---|---|
| 01 | Overview (this page) | Scope, principles, approved capabilities, ADRs, open items |
| 02 | [YouTube capabilities](spec/02-youtube.md) | Auto-add, channel filters, the add flow and feedback, playlist shortcuts, quick-save, Add to queue, the watch-page button, the card menu |
| 03 | [YouTube Music capabilities](spec/03-youtube-music.md) | Quick actions, quick-action shortcuts, queue moves, Save to playlist, Playing now |
| 04 | [Features, accounts and data](spec/04-features-accounts-data.md) | The feature model, consent, accounts and setups, settings sync, the storage layout, Clear All Data, breakage status |
| 05 | [UI](spec/05-ui.md) | Where everything lives; popup, settings, onboarding; in-page controls on both sites; picker, toasts, brand, design rules; prototypes |
| 06 | [Architecture](spec/06-architecture.md) | YouTube access and routes, manifest and permissions, the module map, gateway, registry, bundles, messaging |
| 07 | [Quality](spec/07-quality.md) | Tooling, test layers, fixtures, breakage detection, performance budgets, CI |
| 08 | [Upgrade and release](spec/08-release.md) | 1.4.5 migration, consent copy, betas, release order, store listings, privacy policy, workflows, checklists |
| 09 | [Parity and defects](spec/09-parity.md) | 1.5.0 capabilities and friction items mapped to 2.0, plus new capabilities |

## Scope

**Only the functionality is fixed.** Every capability a 1.5.0 user has survives; its UI, placement, wording, defaults, architecture and libraries were all open. Improvements to existing capabilities were actively sought; genuinely new capabilities needed the user's go-ahead.

**Approved new capabilities:**
- Watch Later as a target;
- quick-save from thumbnails;
- a separate setup per YouTube account;
- several named shortcuts, each to its own playlist;
- settings sync across browsers;
- auto-add on Shorts;
- creating playlists from the extension;
- the YouTube Music section and its quick actions.

Further candidates await the user ([Open items](#open-items)).

**AMO reviews answered:** "Could you update it for latest Firefox and YouTube?" and "Would be cool to have multiple 'Add to playlist' shortcut options. And maybe with some manual labels/titles?" (playlist shortcuts with labels; titles instead of IDs everywhere).

**Targets:** desktop Chrome and Firefox, MV3; Chromium browsers ride along on the Chrome build. It ships as the next major version of the same extension: an update on the existing AMO listing (same gecko ID and slug) and a first Chrome Web Store listing.

**Out of scope:**
- Firefox for Android, Safari and m.youtube.com.
- Any server of ours, any shared Google Cloud app, and the YouTube Data API ([ADR-0001](../../docs/adr/0001-youtube-access-through-the-users-session.md)).
- Building 2.0 and slicing this spec into build tickets: that happens after this destination.

## Principles

These are the user's, and every chapter follows them.

1. **Modular, opt-in, never bloated.**
   - Every part is a **feature** the user can switch off, and everything starts off.
   - A feature that's off leaves no trace: no code, CSS or elements in YouTube's pages, and no settings in the way.
   - Changing how YouTube or YouTube Music looks is always the user's choice. Defaults never override what the user chose, and there's no behaviour the user can't turn off.
2. **UX first: everything where a user would expect it.**
   - Inside YouTube and YouTube Music, controls look and behave like the site's own.
   - The extension's own UI has its own brand and never imitates YouTube.
3. **Local first.**
   - The extension works through the user's own signed-in YouTube session, from inside their YouTube tabs, using YouTube's own client machinery.
   - It never drives YouTube's visible UI to do work.
   - No server, no telemetry, no remote config.
4. **Never silent.** Failures always show, even when a feature's confirmations are switched off. When YouTube changes something, the affected feature says it isn't working.
5. **Today's friction counts as defects** that 2.0 fixes ([chapter 09](spec/09-parity.md)).

## Stack

- WXT, TypeScript and Bun (≥ 1.4.3).
- Svelte 5 with shadcn-svelte / Bits UI ([ADR-0002](../../docs/adr/0002-svelte-and-bits-ui.md)).
- Tests on `bun test`, plus a real-browser layer (Playwright for Chromium, Puppeteer for Firefox).
- Minimum versions: Chrome 121, Firefox 140.

## Decision records

| ADR | Decision |
|---|---|
| [0001](../../docs/adr/0001-youtube-access-through-the-users-session.md) | YouTube access goes through the user's own session, from inside their YouTube tabs; no Data API, not even as a fallback |
| [0002](../../docs/adr/0002-svelte-and-bits-ui.md) | The UI is Svelte 5 + shadcn-svelte / Bits UI; Bits UI loads only on first use inside pages |
| [0003](../../docs/adr/0003-account-setups-keyed-by-datasync-id.md) | Account setups hold only playlist choices, keyed by a digest of YouTube's `DATASYNC_ID` |
| [0004](../../docs/adr/0004-shortcuts-caught-in-page.md) | Shortcuts are caught in YouTube's pages, not with the browser's keyboard commands |
| [0005](../../docs/adr/0005-breakage-caught-on-device-fixed-by-releases.md) | YouTube breakage is caught on the device and fixed only by releases |
| [0006](../../docs/adr/0006-local-truth-sync-copies-documents.md) | Each browser keeps its own settings; settings sync copies whole documents |
| [0007](../../docs/adr/0007-only-the-gateway-runs-in-the-page-world.md) | Only the gateway runs in YouTube's page world |
| [0008](../../docs/adr/0008-unlisted-scripts-one-ordered-registration-per-site.md) | Page scripts are unlisted scripts in one ordered registration per site, sharing one Svelte runtime |
| [0009](../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md) | Upgraders keep what 1.4.5 did, not what its popup showed |
| [0010](../../docs/adr/0010-one-consent-gates-every-feature.md) | One consent of our own gates every feature, in every browser |
| [0011](../../docs/adr/0011-betas-from-github-pages.md) | Betas are unlisted builds of the same add-on, served from this repo's GitHub Pages |

## Prototypes

All prototypes are throwaway Svelte apps; their screenshots are linked from [chapter 05](spec/05-ui.md).

| Branch | What |
|---|---|
| [`prototype/where-things-live`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live) | Low-fi map of where everything lives (ticket 09) |
| [`prototype/popup-and-settings`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/popup-and-settings/prototypes/popup-and-settings) | Hi-fi popup, settings and onboarding (ticket 15) |
| [`prototype/in-page-controls`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/in-page-controls/prototypes/in-page-controls) | In-page YouTube controls, tried on real youtube.com (ticket 14) |
| [`prototype/youtube-music-controls`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/youtube-music-controls/prototypes/youtube-music-controls) | In-page YouTube Music controls, tried on real music.youtube.com (ticket 27) |
| [`task/live-checks`](https://github.com/Alioun/yt-playlist-tools/tree/task/live-checks/probes/live-checks) | The signed-in live-check probe; it becomes 2.0's live-check build (ticket 25) |

## Suggested build order

From [ticket 17](issues/17-modules.md), for `/to-tickets`:
1. Scaffold, tooling and guard tests.
2. The shared kernel and contracts.
3. The gateway, with recorded fixtures for youtube.com.
4. The store and migrations.
5. The registrar, tabs, site core and kit.
6. Features, one at a time.
7. Popup, settings and onboarding.
8. YouTube Music.
9. The real-browser layer and the watch.
10. The live-check build.

## Open items

<!-- filled in once the chapters report their PROVISIONAL items and conflicts -->
