# Perchling 2.0 build plan

Written 2026-11-01 on `2.0/compose-units` at `ed426b086`. Sources: `status.md`, `decisions.json` (G1 to G30) and the six reports in `requirements/`. This plan merges the reports' "Work to do" units into one list (B1 to B84) and orders it into waves. No code was changed and no test was run.

Report unit names used below: **YT** `02-youtube.md` (W1–W14), **YM** `03-music-09-parity.md` (U0–U15), **FA** `04-features-accounts-data.md` (U1–U16), **UI** `05-ui.md` (U1–U14), **AQ** `06-architecture-07-quality.md` (W1–W24), **RL** `08-release.md` (U1–U18).

## 1. Ground rules

- **G19 cutover first.** B1 deletes 1.x. From then on, main ships nothing until 2.0 works. `scripts/release-meta.sh` already refuses to release while `package.json` says `1.5.0` (REL-CI-03, `NEVER_SHIPS`), so no release can start until the owner sets `1.99.1`. That bump is the release activation, and it stays held (G20).
- **Between B1 and B13 the tree has no working background.** That's accepted under G19. The interim safeguards (`removeLegacyCredentials`, `retireLegacyVideoCache`) go with `src/lib`, and B13 replaces them with the 2.0 migration. No build may ship between the two (REL-MIG-45).
- **The integration branch** is `2.0/compose-units`. Each unit gets its own worktree and branch, and one unit merges at a time, as before. Merging to `main` and any PR wait for the owner.
- **Statuses count only 2.0 code (G27).** A unit closes an ID when the shipped 2.0 entrypoints reach the code and a test checks it. A fixture that builds its own harness doesn't count.
- **Copy (G30).** All user-facing copy that an agent writes goes through pstack unslop. Strings the spec pins are copied verbatim (see open question 2).

### Shared files: one editor per wave

Units in the same wave never edit the same file. The hot files are handled like this:

| File or folder | Rule |
|---|---|
| `src/public/_locales/en/messages.json`, `src/shared/copy/` | B3 (wave 1) and B15 (wave 2) write every string the spec pins. From wave 3 on, a unit that needs a new string adds it to `src/shared/copy/staged/<B-id>.json`. After the wave merges, one copy pass runs the staged strings through unslop and folds them into `messages.json`. |
| `src/background/boot.ts`, `src/background/router/index.ts` | B13 creates them with one stub module per later unit: `src/background/compose/<name>.ts` and `src/background/router/<route>.ts`. A later unit edits only its own stub, never `boot.ts` or the route table. |
| `src/ui/popup/`, `src/ui/settings/` | B37 and B38 create the frames with one stub file per section. Section units edit only their section file. |
| `wxt.config.ts` | Edited by B1 (wave 1), B12 (wave 2), B33 (wave 4) and B74 (wave 7) only. |
| `package.json` | One editor per wave: B1, B12, B29, B41, B58, B68, B74, B78. B82 and B83 go into a wave with no other editor. |
| `.github/workflows/ci.yml`, `release.yml` | One editor per wave: B12, B29, B68, B74, B78, B80. |
| `src/background/store/` | Each unit owns named files, listed in its row. B6 (wave 1) is the only unit that edits `local-filter-writer.ts`. |
| `src/site/kit/` | One editor per wave: B33 (wave 4), B42 (wave 5), B62 (wave 6), B69 (wave 7), B76 (wave 8). |

## 2. Units

Sizes: S is under a day, M a few days, L a week or more. "Owner" means the unit, or part of it, needs something the owner holds. The tags are explained in §5.

| ID | Goal | Touches | Depends on | Size | Constraints, owner |
|---|---|---|---|---|---|
| B1 | Delete 1.x and switch the build to Svelte | delete `src/lib/`, `src/components/`, `src/tests/`, React `src/entrypoints/popup/` and `options/`, `youtube.content.tsx`; `src/entrypoints/background.ts` becomes an empty shell; `wxt.config.ts` (module-svelte, no React, auto-icons or Tailwind, `emitCss: false`, SSR exclusion, `publicDir`); `package.json` (drop React, Base UI, sonner, Tailwind, tailwind-merge, lucide, shadcn, cva, clsx; declare `@webext-core/isolated-element`); `vitest.config.ts` (drop the React plugin); 1.x entries in `tests/guards/` | — | M | G19, G20, REL-MIG-45. G23: Vitest keeps running whatever is left. |
| B2 | Add the Platform module | `src/shared/platform.ts` | — | S | — |
| B3 | Catalogue the site and manifest strings the spec pins | `messages.json`, `src/shared/copy/`, `src/shared/i18n/parameters.ts`, the hard-coded strings in `src/site/core/items-music.ts` | — | M | G25, G30 |
| B4 | Add the Music page port, the route seams and the queue insert | `src/page/adapters/live-music.ts`, `src/page/routes/music.ts` (one stub module per job), `src/page/gateway/music-queue.ts`, `src/page/read-parsers.ts` | — | M | Owner: live checks M1, M5 |
| B5 | Add recorded fixtures and the privacy lint, and refresh the pinned hashes | `fixtures/youtube/`, `src/page/gateway.specimens.ts`, `tools/fixtures/*/specimens.ts`, `tools/fixtures/gates.ts`, a recorded `PagePort` adapter, `tests/guards/fixtures-privacy.test.ts`, the pinned hash manifests | — | M | — |
| B6 | Close the sync receive gaps | the receiver in `src/background/store/local-filter-writer.ts`, `tombstone-expiry.ts`, `received-setup-removal.ts` | — | M | G18 |
| B7 | Write recent adds | `src/background/add-flow/add-flow.ts`, `session-memory.ts` | — | S | — |
| B8 | Write the store listing, reviewer notes and `SOURCE_CODE_REVIEW.md` | `store/listing/`, `store/release-notes/`, `store/notes/`, `store/cws-dashboard.md`, `SOURCE_CODE_REVIEW.md` | — | M | G14, G21 (host text), G30. Owner: ticket 25 cookie lines |
| B9 | Build the site and `pages.yml` | `site/`, `.github/workflows/pages.yml`, an `updates.json` generator in `scripts/` | — | M | G14. Owner: enabling and publishing Pages |
| B10 | Finish retiring the broker docs | `.dockerignore`, `docs/legacy/{README,authentication,token-broker}.md`, links in `docs/README.md` and `README.md` | — | S | Owner: remote check of the `archive/token-broker` tag (network) |
| B11 | Apply the spec amendments in §6 | `.scratch/rebuild/spec/*.md`, `resolutions.md` (R179 on) | — | M | G19–G22, G24–G30 |
| B12 | Build the 2.0 manifest and `check:manifest` | new `build/manifest.ts`, `wxt.config.ts`, new `scripts/check-manifest.ts` (replaces `check-manifests.sh`), `package.json`, `ci.yml`, `src/public/brand/` | B1, B3 | M | G21 |
| B13 | Boot the background: store start, migration, sync, router and compose seams | new `src/background/boot.ts`, `src/background/compose/*` stubs, `src/background/adapters/browser.ts`, `store-lifecycle.ts`, `starting-owner.ts`, `startup-source.ts`, `src/background/router/index.ts` and route stubs, `src/entrypoints/background.ts` (at most 15 lines), one test that drives the real entrypoint | B1, B2, B6 | M | G22 (the router normalizes both write-result shapes), G29 (conversion off). Owner: native behaviour ACC-45, FT-53 |
| B14 | Add the page entrypoints and page start | new `src/page/start.ts`, `src/entrypoints/page-www.ts`, `page-music.ts`; page-owned `localStorage` cleanup | B1, B2, B4 | M | — |
| B15 | Catalogue the extension-page strings | `messages.json`, `src/shared/copy/`, `src/ui/onboarding/copy.ts` | B3, B11 | M | G24, G30 |
| B16 | Finish the shared page components | `src/ui/components/` (AutoAddList, ChannelFilterEditor, PercentField, SiteTabs, held Switch), `src/ui/keys/KeyRecorder.svelte`, `controller.ts`, a KeyRecorder render test | B3 | M | Owner: rendering and axe |
| B17 | Add the Music queue edits | `src/page/gateway/music-queue-edit.ts` and its route module | B4 | M | Owner: live checks M1, M5 |
| B18 | Add Music like, library and navigate | `src/page/gateway/music-library.ts` and its route modules | B4 | M | Owner: live check M3 |
| B19 | Finish sync admission and status, and design chunk cleanup | `sync-write-admission.ts`, `sync-inventory.ts`, `sync-codec.ts`, an ADR for SYNC-27 | B6 | M | — |
| B20 | Add the channel-edit operation and handle parsing | new `src/background/store/channel-edit.ts`, `src/page/gateway/requests.ts`, an offline UC-ID parser in `src/shared/` | B6 | M | — |
| B21 | Add the watch-progress store | `src/shared/model/progress.ts`, new `src/background/store/progress.ts` | B6 | M | — |
| B22 | Add the guard tests | `tests/guards/` | B1 | S | — |
| B23 | Design the reviewer credentials in CI | a design doc in `docs/development/`, `scripts/amo-metadata.ts` and its credential-free tests | B8 | S | G28 and `secrets.md`. Owner: approval before anything runs; no `release.yml` wiring until then |
| B24 | Compose the tab runtime: Tabs, Registrar, Monitor, TabView, Accounts | `compose/tab-runtime.ts`, `src/background/{registrar,tabs,monitor,tab-view,accounts}/`; wire B21's daily prune | B13, B21 | M | Owner: live checks ACC-03 (L7), ACC-05, FT-39 (L3, L4) |
| B25 | Add the store-backed UI routes | route modules for first run, shared settings, clear all, key settings, settings import and export, withdrawal, removal; `src/ui/backend/` | B13 | M | G12, G13, G17 |
| B26 | Add the shared page bootstrap and the legacy-cleanup route | new `src/ui/bootstrap.ts`, `router/legacy-cleanup.ts`, the cleanup host in `legacy-execution.ts` | B13, B14 | S | — |
| B27 | Assemble SiteCore and `core-www` | new `src/site/core/core.ts`, `src/entrypoints/core-www.ts`, the `WwwItems` binding | B14 | M | — |
| B28 | Model feature status and notices | new `src/background/status/`, the notices model the popup and Settings share | B13 | M | — |
| B29 | Add `check:zip` and the CI job layout | new `scripts/check-zip.ts`, `package.json`, `ci.yml`, `release.yml` | B12 | M | — |
| B30 | Add the watch list and the static watch | `src/shared/watchlist.ts`, `tools/watch/{needles,static}.ts`, a node `PagePort` adapter | B14 | M | — |
| B31 | Cut the settings-import CPU cost | the settings-import owner in `src/background/store/` | B19, B20, B21 | S | — |
| B32 | Add `core-music` and bind MusicItems | `src/entrypoints/core-music.ts`, `src/site/core/items-music.ts` | B27, B4 | S | — |
| B33 | Add the kit entrypoints, page features and the queue-button and card-menu bundles | `src/site/kit/index.ts`, layer host (`pp-layer`), overlay host through `createIsolatedElement`, YouTube fallback palette, `src/site/feature.ts`, `src/entrypoints/kit-*.ts`, `feature-card-menu.ts`, `feature-queue-button.ts`, `build/page-link.ts`, `wxt.config.ts`, `tsconfig.json` | B12, B27 | M | G15 (measured in B68) |
| B34 | Compose the actions: Playlists, AddFlow and its execution port | `compose/actions.ts`, `router/ui-playlists.ts`, `src/background/playlists/`, AddFlow adapters, console log of add outcomes | B24, B7 | M | — |
| B35 | Bind Monitor in production | `src/background/monitor/` authority and health ports, `compose/monitor.ts`; Monitor stops replaying every pending operation | B24, B27 | M | Owner: live check HEALTH-06 |
| B36 | Compose Gather execution and its routes | `src/background/gather/execution.ts`, `adapters/gather-browser.ts`, `compose/gather.ts`, `router/gather.ts` | B24 | M | G1, G5 |
| B37 | Build the popup frame | `src/ui/popup/` frame and section stubs, `src/entrypoints/popup/` | B15, B16, B25, B26, B28 | M | G21. Owner: rendering and axe |
| B38 | Build the Settings frame | `src/ui/settings/` frame and section stubs, hash routing, deep-link ring, `src/entrypoints/options/` | B15, B16, B25, B26, B28 | M | Owner: rendering and axe |
| B39 | Wire the first-run page | new `src/entrypoints/onboarding/`, `src/ui/backend/first-run-owner.ts`, `compose/first-run-opener.ts` | B15, B16, B25, B26 | M | G9, G11, G14, G21 |
| B40 | Add the layer-3 fakes | `tests/fakes/` (sync area, sync server, tabs, i18n, scripting, access, transport, core) | B24 | M | — |
| B41 | Add the watch workflow | `.github/workflows/watch.yml`, `package.json` | B30 | S | — |
| B42 | Build `popovers.js` and the YouTube page picker | `src/site/popovers/www/`, `src/ui/picker/`, `src/shared/picker/source.ts`, `compose/popovers-loader.ts`, placement in `src/site/kit/` | B33, B34 | M | G10, G25 |
| B43 | Build the auto-add site feature | `src/site/features/auto-add/feature.ts`, `src/page/live-reads.ts`, `src/shared/rules/outcomes.ts` | B33, B34 | M | — |
| B44 | Build the badge and toolbar icon | new `src/background/badge/` (a pure `badgeFor` and its table test), `compose/badge.ts` | B28, B35 | M | — |
| B45 | Trigger claiming and add Discard | `compose/claiming.ts`, a Discard owner in `src/background/store/`, `router/discard.ts`, ownership lookup through the Tabs `playlists` job | B24, B34 | M | Owner: ticket 25 ACC-35 (collaborative playlists) |
| B46 | Add the registry guard and `perf-budget.json` | `tests/guards/registry.test.ts`, `perf-budget.json` | B33 | S | — |
| B47 | Build the popup's This video card | `src/ui/popup/youtube/this-video` | B37, B34 | M | — |
| B48 | Build the popup's YouTube feature rows | `src/ui/popup/youtube/features` | B37 | M | — |
| B49 | Build the popup overlays: Recent adds, picker sheet, consent sheet | `src/ui/popup/overlays/` | B37, B7 | M | — |
| B50 | Build Settings › YouTube | `src/ui/settings/sections/youtube` | B38, B20 | M | — |
| B51 | Build Settings › YouTube Music and Everywhere | `src/ui/settings/sections/{music,everywhere}` | B38 | M | G21 |
| B52 | Build Settings › Sync, import and export, Clear all | `src/ui/settings/sections/sync-data` | B38, B19 | M | G12, G13 |
| B53 | Build Settings › Privacy & data, including the recovery controls | `src/ui/settings/sections/privacy`, the `Disclosure.svelte` host dialog | B38 | M | G24, G30. Conversion stays off (G29) |
| B54 | Build Diagnostics, Check now, the report and the console log | `src/ui/settings/sections/diagnostics`, `src/background/diagnostics/`, `router/check-now.ts`, a logger that honours `device.detailedLog` | B38, B35 | M | — |
| B55 | Build About, the beta label and Report a problem | `src/ui/settings/sections/about`, a version-pattern helper, the prefilled-address builder | B38 | S | — |
| B56 | Build the upgrade note and its opener | `src/ui/onboarding/UpgradeNote.svelte`, `compose/note-opener.ts` | B39 | M | G24 (the recovery review links to Privacy & data), G29 |
| B57 | Add the Playing now probe and the audible tab choice | `src/background/tabs/tabs.ts` (audible ranking), `compose/probe.ts`, `router/playing-now.ts` | B24, B32 | S | — |
| B58 | Add the live-check build and fixture import | `build/livecheck.ts`, `src/livecheck/`, a recording `PagePort`, `tools/fixtures/import.ts`, `store/live-checks/`, `package.json` | B5, B14 | M | Owner: the signed-in run (ticket 25) |
| B59 | Add the layer-3 integration flow and soaks | `tests/integration/`, the soak tests | B40, B34 | M | — |
| B60 | Add the Music picker skin | `src/site/popovers/music/` | B42, B32 | S | Owner: YM-PICK-6 waits on ticket 25 M2 |
| B61 | Build playlist shortcuts on YouTube | `src/site/features/shortcuts/www/` | B42 | M | G25 |
| B62 | Build quick-save on thumbnails | `src/site/features/quick-save/`, the overlay's `quick-save` slot in `src/site/kit/` | B42 | M | — |
| B63 | Wire auto-add progress and its state model | `src/site/features/auto-add/{progress,state}.ts`, `router/progress.ts` | B43, B21 | M | — |
| B64 | Build keys from any tab | new `src/background/commands/`, `compose/commands.ts`, `router/command-keys.ts`, the `commands.getAll` source in `src/ui/keys/` | B34, B44, B57 | M | — |
| B65 | Build Save from the browser's menu | new `src/background/menus/`, `compose/menus.ts`, `src/background/adapters/shared-settings.ts` | B34, B42 | M | — |
| B66 | Build Gather's automatic triggers | `src/background/gather/triggers/`, the start-hidden facts in `src/background/tabs/tabs.ts` | B36 | L | Kept L: wake points, bursts, pacing and the serving-tab order share one scheduler state, so there's no real seam |
| B67 | Build the popup's YouTube Music tab | `src/ui/popup/music/` | B37, B57 | M | — |
| B68 | Add `check:budget` and `check:runtime` | `scripts/check-budget.ts`, `scripts/check-runtime.ts`, `package.json`, `ci.yml`, `release.yml` | B33, B46 | M | G15 |
| B69 | Build Music actions: row, card, header and queue-item buttons | `src/site/features/music-actions/`, the Music overlay skin in `src/site/kit/` | B32, B17, B18, B60 | M | G26 |
| B70 | Build Music keys | `src/site/features/music-keys/` | B32, B17, B18, B60 | M | — |
| B71 | Build playlist shortcuts on YouTube Music | `src/site/features/shortcuts/music/` | B61, B60 | S | G25 |
| B72 | Build the watch-page button | `src/site/features/watch-button/` | B43, B63, B42 | M | — |
| B73 | Build Gather's UI | the popup gather section, the Settings gather section | B36, B37, B38, B33, B44 | M | — |
| B74 | Build the real-browser harness | `bunfig.browser.toml`, `tests/browser/`, a counting build flag, `wxt.config.ts`, `package.json`, the `ci.yml` browser job | B33, B37, B38 | M | G23. Owner: every run (rendering and axe, native behaviour) |
| B75 | Add the 1.4.5 upgrade fixtures | `src/background/store/fixtures/1.4.5-S{n}.json` and a Bun test over them | B56 | M | — |
| B76 | Build the Music player bar and narrow layout | `src/site/features/music-actions/bar/`, the bar host in `src/site/kit/` | B69 | M | G26 |
| B77 | Build the watch-page menu | the watch menu in `src/site/popovers/www/` | B72, B20 | M | — |
| B78 | Add the release gates | `ci.yml`, `release.yml`, `package.json` (`build-for-amo`), x64 and ARM64 sources rebuild through `check-source-rebuild.mjs` | B29, B68, B41, B58, B74 | M | Owner: release activation |
| B79 | Run the upgrade test on real Firefox | `scripts/upgrade-test/` (`old.xpi` from `e96dbf7`, `new.xpi`, HTTPS `updates.json`) | B75 | M | Owner: native behaviour |
| B80 | Add `hotfix-freeze` | a gate script, a `release.yml` job | B78, B8, B9 | M | Owner: release activation |
| B81 | Rewrite the README and docs, and add `RELEASING.md` | `README.md`, `docs/`, `RELEASING.md` (with the screen-reader step) | B78, B10 | M | G30 |
| B82 | Retire Vitest and settle the toolchain | `package.json`, `vitest.config.ts`, the `*.bun-test.ts` names, `typecheck` with `svelte-check --tsgo`, the Svelte compile cache, CI | the G23 answer, B74 | M | **G23 decision point** |
| B83 | Add the coverage gate | `scripts/coverage.ts`, `test:coverage` | the G23 answer | S | **G23 decision point** |
| B84 | Turn on the interim conversion | conditions in the note and the Privacy & data recovery section over `interim-recovery-review.ts` and `interim-recovery-execution.ts` | B53, B56 | M | G29. Owner: ticket 25's signed-in checks first |

## 3. Requirement IDs by unit

Each unit closes the union of the IDs its source units named. Where one report unit was split across B units, its IDs were assigned by module. The agent who claims a unit re-checks that split against the chapter table.

| ID | Sources | IDs closed |
|---|---|---|
| B1 | UI U1, AQ W7/W8/W22 (the 1.x parts), FA U1 (the `src/lib` part) | UI-IA-01, UI-BRAND-05, UI-RULE-12 (tailwind-merge), UI-RULE-14, 15, 16, 20, 23, 27, 28, 29, UI-TOAST-01 |
| B2 | AQ W3 | ARC-MOD-04; Q-TOOL-8, 9, 10 |
| B3 | YT W14, YM U7 | ARC-MAN-21 (strings); copy parts of YT-AA-32, 38, 41, YT-CF-11 to 16, YT-KEY-02, 03, 08, 11, 17, YT-NEW-07, YT-GT-32, 33, YT-BRK-06; YM-FB-2, 8, 9, 10, YM-KEY-8, YM-PICK-10, YM-MORE-8, YM-SAVE-8, 9 (copy); UI-PICK-10, UI-PICK-18 (title, G25); UI-RULE-43 (keys) |
| B4 | YM U2 (insert), AQ W9 | YM-Q-1 to 14, YM-APP-5, YM-FAIL-7, 12, YM-QA-4, PAR-NEW-17; ARC-ACC-12 (Music rows), ARC-ACC-21 to 31 and 44 (Music half; shared with B17, B18); Q-WATCH-28; Q-TEST-5 (Music effects) |
| B5 | AQ W16 | Q-FIX-1 to 5, 7, 9 to 12; Q-TEST-4, 6, 7; Q-TEST-30 (fixtures privacy) |
| B6 | FA U12 (receiver), status.md open work | SYNC-06, 07, 11, 12, 22 |
| B7 | FA U13 | DATA-52 (write side), YT-ADD-34 (data) |
| B8 | RL U11 | REL-STORE-01, 02, 06, 11, 20 to 23, 27, 38 (listing and notes credit), 41; REL-CI-30 (inputs), 36; UI-BRAND-10, 11 |
| B9 | RL U12 | REL-STORE-12 to 15, 17; REL-CI-12, 14, 43 to 45 |
| B10 | RL U16 | REL-CI-51, 52 |
| B11 | decisions | none directly: every ID in §6 changes text |
| B12 | AQ W1, FA U2, RL U8, YM U0 (manifest), FA U16 (manifest rows) | ARC-MAN-01, 02, 05, 06, 07, 19 (manifest half), 20 (manifest half), 21; ARC-ACC-19, 62; Q-TOOL-32; Q-CI-3; FT-15 (manifest half), FT-44, FT-59 and FT-60 (declarations); ACC-36; SYNC-26; PAR-CAP-26, 46, 66, 68; PAR-DEF-30; PAR-NEW-26, 39; YM-FEAT-6 (manifest), YM-FEAT-10 (manifest), YM-FEAT-11, YM-ACC-1; REL-CON-22, 24; REL-STORE-40; REL-CHK-18 (name, short name, description); UI-BRAND-01, 04; UI-IA-02 |
| B13 | FA U1 (store, sync, data), RL U1, AQ W7 (boot, router), AQ W8 (remainder) | SYNC-03, 04, 05, 10, 13, 15, 18 to 21, 25, 27; DATA-02, 04, 05, 07 to 16, 18, 19, 21, 29 to 33, 35, 39, 40, 43 to 47, 50, 57; REL-MIG-01, 02, 09, 11, 13 to 27, 29, 33 to 36, 39 to 45; REL-CON-07, 16, 17, 21; ARC-MAN-08, 09, 11 to 15, 18, 22, 24, 25; ARC-MOD-03, 20, 25, 26, 33, 34; ARC-MSG-04 to 09, 13; ARC-ACC-63, 64, 66 |
| B14 | AQ W4, FA U9 (page-owned cleanup), YT W14 | ARC-ACC-01, 05, 06, 08, 10, 11, 13 to 18, 32 to 42, 46, 50, 71; ARC-MAN-10, 17; ARC-MOD-01, 02, 08, 10; ARC-MSG-01 to 03, 15; Q-PERF-24; DATA-49 (page-owned `localStorage`, including `cachedVideos`) |
| B15 | UI U3 to U5 (copy), RL U3 and U5 (copy) | copy parts of UI-ONB-06, 07, 11, REL-MIG-28, 46, REL-CON-01 to 06, SYNC-14, SYNC-23, FT-35, ACC-48 (recovery copy, G24), YT-ADD-26 (Switch account) |
| B16 | UI U6, YT W14 | UI-PICK-20 to 23; UI-POP-21; UI-RULE-01, 05, 07, 21, 43; YT-KEY-29 |
| B17 | YM U2 (edits) | YM-MOVE-1 to 9, YM-RM-1 to 4, YM-CAST-1 to 4, YM-TGT-7 |
| B18 | YM U3 | YM-LIKE-1 to 6, YM-MORE-3 to 5, YM-ACC-6 (like part) |
| B19 | FA U12 (admission), FA question 5 | SYNC-14 (largest-item naming), 16, 17, 23; SYNC-27 (cleanup design, as an ADR) |
| B20 | YT W9 (backend), FA U7 (Remove kept filters operation) | YT-CF-10, 14, 15 (turn-on and confirm flows), 16, 17, 18 |
| B21 | FA U11 (store side) | DATA-24, 25, 26, 28, 56 |
| B22 | FA U16, RL untested rows, AQ W23, UI U14 (guards) | FT-07; ACC-11, 27, 41; DATA-17, 22, 23; HEALTH-19, 21; REL-MIG-06, 07; REL-CON-09; REL-CI-53; Q-TEST-31, 33, 44; UI-RULE-17, 33, 39, 42 |
| B23 | RL U13 | REL-STORE-21 (placeholders), 24; REL-CI-46 (design only) |
| B24 | YT W1, FA U1 (FT, ACC), AQ W7 (registry, tabs), YM U0 (background) | YT-GEN-01 to 03, 06, 09 to 11; FT-02, 03, 09 to 12, 15, 19 to 21, 23 to 29, 31, 33, 34, 37, 38, 45, 49 to 51, 55; ACC-06 to 08, 10, 12, 13, 18, 26, 28, 29, 37 to 39, 43, 44; ARC-ACC-02, 03, 09, 43, 49, 52 to 56; ARC-MOD-37, 39; ARC-REG-03, 10, 11; ARC-MAN-04; Q-WATCH-23, 27, 30, 33 |
| B25 | UI U5 (handlers), YT W1 (key settings) | YT-KEY-07, 12, 14, 18, 32, 33; the route halves of SYNC-08, DATA-36 to 38, DATA-53 to 55, ACC-24, 25 |
| B26 | RL U6, FA U9 (DATA-49 host) | REL-MIG-10; DATA-49 (`device.legacyCleared`, IndexedDB host) |
| B27 | YT W2, AQ W5, YM U1 (shared), FA U3 (core) | YT-GEN-04 (core bundles), YT-ITEM-01 to 06, 08; YT-ADD-14 to 22, 24, 26; YT-KEY-19 to 23, 25; YT-BRK-02, 05; ARC-ACC-47, 70; ARC-MOD-05, 16, 31, 32; ARC-REG-05 to 08; ARC-MSG-10, 14; Q-WATCH-26, 34; ACC-03 (isolated-core key), ACC-19, 42 |
| B28 | FA U5 (held reasons) | FT-13, 46, 47, 57, 58 |
| B29 | AQ W2, RL U9 (CI layout) | Q-CI-1, 2, 7 (manifest, zip); Q-PERF-6; ARC-MOD-07; Q-WATCH-19 (zip half); REL-CI-18, 20, 21, 22 |
| B30 | AQ W17 (static) | ARC-ACC-16; Q-WATCH-3 to 11, 15 to 17, 35; Q-TEST-8; Q-TEST-30 (watch list) |
| B31 | status.md follow-up | none (running cost) |
| B32 | YM U1 | YM-TGT-1 to 3, 5; YM-KEY-4 to 7; YM-FB-1, 3 to 6, 11; YM-FAIL-2, 5, 11; YM-PICK-13; YM-PS-6, 7; YM-RM-5; YM-MOVE-7 |
| B33 | AQ W6, YT W2 (bundles, services), UI U8, FA U3 (bundles), status.md | ARC-MOD-11 to 15; ARC-REG-04; Q-PERF-18, 19, 21; Q-TOOL-12, 30; YT-Q-01 to 10; YT-CM-01 to 05; UI-YT-02 to 07, 10 to 13, 24, 25, 26 (queue button, card menu); UI-TOAST-02 to 16; UI-RULE-08, 09, 30, 36, 37, 44; UI-BRAND-08 (toast mark); FT-16, 17, 18, 19 (in-tab teardown), 62, 63; HEALTH-01 to 05, 10, 28 |
| B34 | YT W1 (add flow), YT W14 | YT-AA-01, 05, 06, 43; YT-ADD-01 to 13, 23, 25, 27, 28, 30 to 33, 35 to 46; YT-CF-01 to 09; YT-GEN-05 |
| B35 | FA U4, YT W1 (breakage) | HEALTH-02, 07, 08, 09, 11 to 14, 18, 20, 29; ACC-23; YT-BRK-01, 04 |
| B36 | YT W1 (gather), FA U15, YM U14, AQ W13 (routes) | YT-GT-02 to 15, 17 to 21, 30; FT-63 (gather), 64; ACC-47; DATA-58; ARC-ACC-57; ARC-MSG-16; PAR-NEW-42, 44; PAR-GT-38 |
| B37 | UI U4a, FA U6 (frame), RL U4 (banners), AQ W12 (popup) | UI-POP-01 to 11, 25, 26, 31, 33; UI-IA-07; UI-BRAND-06; UI-RULE-25; FT-14 (popup), 36, 54; ACC-04, 13 (consumer), 15 to 17, 20 to 22, 32, 33, 40; SYNC-01 (banner), 17, 23, 24 (banner); HEALTH-16; REL-MIG-32, 37 (popup notice); REL-CON-02 (banner), 15 (popup line), 18; ARC-ACC-51, 58, 60, 61 (popup); ARC-MAN-03, 16; ARC-MOD-17, 35, 36; ARC-MSG-12; Q-TEST-11; PAR-CAP-55, 60, 61; PAR-DEF-01, 15, 16, 20, 21; PAR-NEW-33 |
| B38 | UI U5a, FA U7 (frame) | UI-SET-01 to 09, 19; UI-IA-09; FT-05, 06, 08, 56; ARC-ACC-61 (Settings); HEALTH-17 |
| B39 | UI U2, FA U9, RL U2 | UI-ONB-01 to 05, 08, 10; UI-PICK-19; UI-RULE-24, 26; FT-40, 41, 43, 48; ACC-34; DATA-41, DATA-47 (install opener); REL-MIG-04; REL-CON-12 to 15 (first-run parts) |
| B40 | AQ W20 (fakes) | Q-TEST-9, 12, 14 |
| B41 | AQ W17 (CI), RL U14 | Q-CI-4, 5, 8; REL-CI-42; the `watch` gate of REL-CI-27 |
| B42 | YT W4, YM U6 (shared), UI U10 | YT-PK-01 to 14; YT-NEW-01 to 07 (page side); YT-ADD-29 (Choose); YT-KEY-13; YT-QS-04, 07 (choose mode); UI-PICK-02, 03, 07, 08, 09, 10 (page toasts), 13 to 18; UI-RULE-06, 18, 31, 34, 35; PAR-NEW-03, 31 |
| B43 | YT W3 (feature) | YT-AA-07 to 30, 33, 35 to 37, 39, 40, 44 to 46; YT-GEN-07; PAR-CAP-01, 02, 04 to 12; PAR-DEF-25 to 27; PAR-NEW-07 |
| B44 | YT W10, YM U11, FA U5 (badge), UI U7, AQ W11, RL U4 (badge) | YT-AA-42; YT-ANY-06; YT-GT-31; YM-FEAT-10 (badge), YM-FAIL-6 (badge), YM-PS-2, YM-ANY-4; PAR-NEW-23, 38; FT-30, 43 (badge); HEALTH-15; UI-IA-08; ARC-MOD-38; ARC-ACC-61 (toolbar "!"); Q-TEST-2, 3; REL-MIG-03, 38 |
| B45 | FA U10 | ACC-30, 31, 32 (notice delivery), 33, 46; DATA-42 |
| B46 | AQ W14 | ARC-REG-01, 02, 09; Q-TEST-30 (registry); Q-PERF-16, 36 |
| B47 | UI U4b (This video), YT W8 | UI-POP-12 to 15; YT-AA-03, 04 (popup Pause and Skip); DATA-48 |
| B48 | UI U4b (rows), YT W8 | UI-POP-19 to 24, 27 to 30, 32; UI-IA-04; YT-ADD-12 (switch UI); YT-AA-02, 26, 31, 32, 34; PAR-CAP-16 |
| B49 | UI U4d, FA U6 (list) | UI-POP-34; UI-PICK-02 (sheet), UI-PICK-09 (inline Undo); UI-ONB-09; DATA-52 (list); YT-ADD-34 (list) |
| B50 | UI U5b (YouTube), YT W8, YT W9 (UI), YM U10 (parity) | UI-SET-10, 12; UI-PICK-25; YT-KEY-02, 03, 05, 08 to 11, 15, 27; YT-CF-11 to 13; YT-ADD-29 (deep link); YT-ANY-03; FT-14 (Settings), 32 (dialog), 52; DATA-45; PAR-CAP-03, 22, 30, 43 to 45, 62; PAR-DEF-08 to 14, 18 |
| B51 | UI U5b (Music, Everywhere), YM U10 | UI-SET-11, 23; YM-FEAT-2 to 5; YM-KEY-2, 3; YM-BAR-5; YM-NARROW-4; YM-SAVE-8, 9 (marks); the Everywhere undo key |
| B52 | UI U5c (sync, data), FA U7 | UI-SET-13, 14, 15, 20, 22; UI-IA-06; SYNC-01, 02, 08, 09, 14 (message, Remove kept filters), 24; DATA-03, 06, 34, 36, 37, 38, 53, 54, 55 |
| B53 | UI U5c (privacy), RL U5, FA U7 (recovery) | UI-SET-16; UI-ONB-11 (moved here by G24); FT-35; ACC-14, 15, 24, 25, 48; FT-60 (Allow); REL-CON-12, 13 (feature dialog), 20, 24 (denial path); REL-MIG-28 (link); REL-MIG-47 (placement only) |
| B54 | FA U8, UI U5d (Diagnostics), YT W14 | HEALTH-22 to 27; UI-SET-17; YT-BRK-07 |
| B55 | UI U5d (About), RL U18 | UI-SET-18, 21; UI-BRAND-02; REL-STORE-03 (About), 36, 37, 38 (card, About credit); REL-CI-15; PAR-NEW-41 |
| B56 | UI U3, RL U3 | UI-ONB-06, 07; REL-MIG-05, 08 (step 5), 30, 31, 37 (in-note outcome); REL-CON-01 to 06, 08, 10, 11, 25; FT-32 (note Agree) |
| B57 | YM U9, AQ W10 (Playing now) | YM-POP-10, 11; YM-ANY-1; YM-FEAT-6; ARC-ACC-04 |
| B58 | AQ W19 | ARC-MOD-06; Q-WATCH-18 to 22; Q-FIX-6, 8; Q-PERF-64; Q-CI-9, 14 (live-check parts) |
| B59 | AQ W20 (flow, soaks) | Q-TEST-47; Q-PERF-11 |
| B60 | YM U6 (Music) | YM-PICK-1 to 12, 14, 15; YM-SAVE-3 |
| B61 | YT W5, YM U13 | YT-KEY-01, 04, 16, 17, 24, 26; YT-ITEM-07; YT-BRK-03, 06; YT-GEN-08 (shortcuts); PAR-CAP-31; PAR-NEW-30 |
| B62 | YT W6, UI U9, YM U13 | YT-QS-01 to 12; YT-KEY-34 (▾ tooltip); YT-GEN-08 (quick-save); UI-YT-04, 08, 09, 14, 15; PAR-NEW-02 |
| B63 | YT W3 (progress, state), FA U11 (checkpoints) | YT-AA-02 to 04 (state source), 38 (model), 41; DATA-27 |
| B64 | YT W11, YM U12, FA U14 (commands), AQ W10 (commands) | YT-ANY-01, 02, 04, 05, 07 to 09; YT-KEY-06, 31; YM-ANY-2 to 5; PAR-NEW-35; FT-59; ARC-ACC-68, 69; ARC-MAN-19 (runtime half); ARC-MSG-11; Q-TEST-45 |
| B65 | YT W12, FA U14 (menus), AQ W10 (menus) | YT-BM-01 to 09; FT-60 (runtime); ARC-MAN-20 (runtime half), 23; PAR-NEW-37 |
| B66 | YT W13 (triggers), AQ W13 (triggers) | YT-GT-22 to 29; ARC-ACC-72, 73; ARC-MOD-40, 41; Q-TEST-49; Q-PERF-58, 65, 66 |
| B67 | UI U4c, YM U8 | UI-POP-16 to 18; UI-IA-05; YM-POP-1 to 9, 12 to 14; YM-FEAT-1, 5; YM-APP-3; YM-FAIL-6 (popup) |
| B68 | AQ W15, UI U14 (size check), YM U15 | Q-PERF-1, 2, 12 to 14, 37 to 39, 42, 60; Q-CI-7 (budget), Q-CI-19; ARC-MOD-09, 18; PAR-NEW-29 |
| B69 | YM U4 (in-list), UI U12 | YM-QA-1 to 3, 5 to 15; YM-SAVE-1, 2, 13, 15, 16; YM-KEY-11; YM-FB-7, 12; YM-MORE-1, 2, 6; YM-ACC-5, 7; YM-FEAT-7, 8; YM-FAIL-1, 3, 4, 8, 9, 10; YM-CAST-2 (buttons); PAR-NEW-10, 32; UI-YM-01 to 19 (except the bar rows); UI-RULE-02, 03, 04, 10, 32 |
| B70 | YM U5 (keys) | YM-KEY-1, 10, 12, 13; YM-TGT-4, 6; YM-SAVE-11, 12; YM-MORE-7; PAR-NEW-11 |
| B71 | YM U5 (shortcuts) | YM-PS-1 to 5, 8; PAR-NEW-12 |
| B72 | YT W7 (button), UI U11 | the YT-WB and UI-YT-16 to 23 rows for placement, re-placement, fold, Shorts column, label, pie and hiding; UI-YT-26 (watch-page notice); UI-BRAND-08 (icon-only mark); UI-RULE-38; YT-AA-38 (display); PAR-NEW-21 |
| B73 | UI U13, YT W13 (UI), YM U8 (Gather row) | YT-GT-01, 16, 32 to 36; UI-POP-35 to 37; UI-SET-24; UI-TOAST-17; UI-PICK-27; PAR-GT-01, 11, 25 |
| B74 | AQ W18, UI U14 (render checks) | Q-TEST-16 to 19, 48, 50; Q-TOOL-17; Q-WATCH-12 to 14; Q-CI-1 (browser job); UI-POP-03, 05; UI-SET-06; PAR-DEF-32. Runs held: Q-PERF-3 to 5, 8 to 10, 28 to 34, 40, 41, 45 to 57, 61, 62; UI-RULE-40 |
| B75 | RL U15 (fixtures) | REL-CHK-11 to 16 (fixture half) |
| B76 | YM U4 (bar) | YM-BAR-1 to 7, 9; YM-NARROW-1 to 3; the UI-YM bar rows |
| B77 | YT W7 (menu) | the YT-WB rows for menu rows and the flip; YT-AA-03, 04 (menu controls); YT-CF-15 (menu side); YT-KEY-34 (menu row) |
| B78 | RL U9 (gates), YM U15, AQ W24 (gates) | REL-CI-25, 27, 28, 40; REL-STORE-28 to 31, 33; PAR-CAP-70; Q-CI-13, 18 |
| B79 | RL U15 (real runs) | REL-CHK-11 to 16 (real-Firefox half) |
| B80 | RL U10, AQ W24 | REL-CI-06, 38; REL-CON-19; Q-WATCH-17 (hotfix); Q-PERF-63 |
| B81 | RL U17, AQ W24 (files), UI outside-the-source | REL-CI-17, 54; REL-CHK-18 (README); REL-STORE-03 (README), 38 (README, `docs/features.md`); UI-RULE-41; PAR-DEF-31 |
| B82 | AQ W22, RL U9 (Vitest) | Q-TOOL-2, 3, 7, 16, 18, 19, 20, 35; Q-CI-2; ARC-MOD-29, 30; Q-TEST-1; REL-CI-19; PAR-CAP-69 |
| B83 | AQ W21 | Q-TEST-40 to 43 |
| B84 | RL U7 | REL-MIG-46, 47 (activation) |

## 4. Waves

A unit starts once every unit it depends on has merged. Units in one wave touch no common file.

| Wave | Units | Notes |
|---|---|---|
| 1 | **B1**, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11 | Starts from the cutover. B1 is the only editor of `wxt.config.ts`, `package.json` and `src/entrypoints/`. |
| 2 | **B12**, **B13**, **B14**, B15, B16, B17, B18, B19, B20, B21, B22, B23 | B13 creates the compose and route stubs every later background unit fills. |
| 3 | **B24**, B25, B26, **B27**, B28, B29, B30, B31 | — |
| 4 | B32, **B33**, **B34**, B35, B36, B37, B38, B39, B40, B41 | Milestone: queue button and card menu reach users, and the popup, Settings and first run render. |
| 5 | **B42**, **B43**, B44, B45, B46, B47, B48, B49, B50, B51, B52, B53, B54, B55, B56, B57, B58, B59 | Milestone: the first end-to-end YouTube add from the page and the popup. |
| 6 | **B60**, B61, B62, **B63**, B64, B65, B66, B67, B68 | — |
| 7 | **B69**, B70, B71, **B72**, B73, B74, B75 | B74 could start in wave 5. It waits for wave 7 because B58 and B68 hold `package.json` and `ci.yml` in waves 5 and 6. |
| 8 | **B76**, **B77**, B78, B79 | All 2.0 features built. |
| 9 | B80, B81 | Release machinery complete. Activation stays with the owner. |
| any | B82, B83 (after the G23 answer), B84 (after ticket 25) | B82 and B83 join the first wave with no other `package.json` or `ci.yml` editor. |

**Critical path (8 waves to feature-complete).** Two chains tie, and both run through the background:

- YouTube: B1 → B13 → B24 → B34 → B43 → B63 → B72 → B77
- YouTube Music: B1 → B13 → B24 → B34 → B42 → B60 → B69 → B76

B14 → B27 → B33 runs beside B13 → B24 → B34 with no slack, because B42 and B43 need both. Bold units in the wave table are on one of these chains. The release tail adds one wave: B74 → B78 → B80 ends in wave 9.

## 5. Units that need the owner

| Hold | Units | What the owner does |
|---|---|---|
| Production | none scheduled | No unit touches production. |
| Release activation | B78, B80, B9 (Pages), B8 (listing upload), the `1.99.1` version bump | Sets `1.99.1`, enables Pages, uploads the first Chrome zip by hand (§8 of 08). |
| Live YouTube checks (ticket 25) | B4 and B17 (M1, M5), B18 (M3), B60 (M2), B24 (L3, L4, L7, ACC-05), B35 (HEALTH-06), B45 (ACC-35), B58 (the signed-in run), B8 (cookie lines), B84 | Runs ticket 25 signed in. The code lands first, and each PROVISIONAL row stays open until its check passes. |
| Native behaviour | B13 (ACC-45, FT-53), B74 (runs), B79 | Runs on real Firefox and Chrome. |
| Rendering and axe | B16, B37, B38 and their sections, B74 (runs) | Runs the real-browser layer and axe. |
| Approval (G28) | B23 | Approves the design and its tests before anything runs, as `secrets.md` requires. |
| Ticket 25 (G29) | B84 | Supplies the signed-in evidence before the conversion turns on. |

## 6. Spec amendments (B11)

Each amendment also gets an R-number in `resolutions.md`, starting at R179.

| Decision | Change | Spec IDs and places |
|---|---|---|
| G21 | Firefox narrows to `https://www.youtube.com/*` and gets `optional_host_permissions: ["https://music.youtube.com/*"]`, as Chrome does. Every "on Chrome" Music-access rule applies to both browsers. The 1.4.5 → 2.0 update still shows no prompt, because narrowing asks nothing. Upgraders may need to grant access again if Firefox revokes undeclared origins. | 06: the manifest table, "Why the hosts differ per browser", ARC-MAN-01, ARC-MAN-03. 07: Q-CI-3. 08: REL-CON-08, 14, 22, 24, the target manifest (§5), the §5 audience rows, the reviewer-note host line (§12), the no-access rows of the upgrade table. 04: FT-44 and the FT rows on the Agree click, "one grant covers both sites" (§1.7). 03: YM-FEAT-10, YM-PS-2. 02: "Access on Chrome" (§2.11). 05: UI-SET's Music-access line, UI-ONB's Agree-click lines. 09: PAR-CAP-77, PAR-NEW-28. The 1.4.5 history in 08 §1 stays. |
| G22 | Replace the single `Store` with `change(origin, Change)` by the per-operation owners as built (claim, discard, withdrawal, filter writer, settings import, sync join, account removal, clear all). State their two write-result shapes and say the router normalizes them. Keep the one-write-path guard. | 06 §6.9: the `Store` interface block, ARC-MOD-19, 21, 22, 24 (ARC-MOD-20 and 23 stay). 04: any row naming `Store.change`. |
| G24 | The recovery controls live in Settings › Privacy & data. The upgrade note's recovery review links there. | 04: FT-35, ACC-48. 05: UI-SET-16, UI-ONB-11 and the matching "Not pinned down" placement lines. 08: REL-MIG-47. `resolutions.md`: a note on R162 to R170. |
| G25 | Choose mode opened from a shortcut's **Choose** is titled "Pick the shortcut's playlist", on both sites. | 02: YT-PK-09, YT-KEY-13, N13 (moves to resolved). 03: YM-PICK-3 and "Not pinned down" 1. 05: UI-PICK-10, UI-PICK-18 and the "Not pinned down" entry. |
| G26 | YouTube Music icons use Material Symbols. Drop the PROVISIONAL on ticket 27. | 05: UI-YM-04 (the "matching Material Symbols paths unless…" line). |
| G19, G20 | 1.5.0 never ships, and 2.0 replaces 1.4.5. From the cutover on, main carries 2.0 and `package.json` stays `1.5.0` until the owner sets `1.99.1`. No build ships while the interim safeguards are gone. The interim path in §2.12 remains only as an upgrade source. | 08: §6 (next to REL-CI-03), REL-MIG-45, the §2.12 intro. 09: the intro sentence on 1.5.0 (call it the unreleased interim build). |
| G27 | A parity row counts as delivered only when 2.0 code delivers it. Rows the interim build delivers stay open. | 09: "How to read this chapter". |
| G28 | CI fills reviewer credentials only through a design with credential-free tests that the owner approved, run from a frozen copy. | 08: REL-STORE-21, REL-STORE-24, REL-CI-46. |
| G29 | The interim conversion ships switched off. It turns on only after ticket 25's live checks verify production ownership and session contracts on a real signed-in account. | 08: §2.12 intro, REL-MIG-46, REL-MIG-47. |
| G30 | All user-facing copy goes through pstack unslop. | 02: YT-ADD-18. 03: YM-FB-10. 05: UI-TOAST-11. 08: "The copy rules" (§3). |
| G23 | No amendment until decided. The answer touches ARC-MOD-29, Q-TEST-1, REL-CI-19 and the Q-TOOL rows. | — |

## 7. Open questions for the owner

1. **The 237 uncommitted changes in `t3-8e91ff1c`** (`feat/2.0-store-write-preparation`) touch the store files that B6, B13, B19 and B20 edit, such as `local-filter-writer.ts`, `sync-join-execution.ts` and `account-removal-execution.ts`. Should an agent compare them with `2.0/compose-units` and land or drop them before wave 1's store units start?
2. **Spec-pinned strings under G30.** Should strings the spec already pins be copied verbatim, with unslop applied only to copy the agent writes, or should every pinned string go through unslop too? The second changes spec text, including G6's and G13's settled wording.
3. **The subtitle under "Pick the shortcut's playlist" (G25).** G25 sets the title only. Should the agent write the line with unslop, or does the owner want to pick it?
4. **What "usable" means for activating 1.99.1.** Does the first beta wait for wave 8 (every feature), or can it go out at an earlier milestone, such as wave 5, with the rest following in later betas?
5. **Ticket 25 before the first beta?** The disclosure's cookie line (G14, UI-ONB-08) is pinned in agreement version 1. If ticket 25 runs after users have agreed, dropping that line changes the agreement. Should ticket 25 run before the owner activates 1.99.1?
6. **The Music picker before ticket 25 M2 (YM-PICK-6).** Until M2 runs, should the Music picker read check marks from a youtube.com tab, or show none?
7. **Collaborative playlists before ticket 25 (ACC-35).** Until the check runs, should claiming treat a collaborative playlist as owned or not owned?
8. **G23, the test runner.** The Vite+ research is still pending. B74, B82 and B83 wait on the answer, and B74 assumes `bun:test` (`bunfig.browser.toml`) until then.
