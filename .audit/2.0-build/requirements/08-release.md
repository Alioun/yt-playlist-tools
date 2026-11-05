# Requirement pass: 08 · Upgrade and release

Checked at `2.0/compose-units` HEAD `f7898dcc8` (one commit after `8563caea3`, docs only). Spec: `.scratch/rebuild/spec/08-release.md`, 196 IDs.

## Summary

Of 196 IDs: built 0, untested 4, partial 44, unwired 36, missing 44, external 28, held 40. None are superseded. REL-STORE-04, REL-STORE-18 and REL-STORE-34 describe the §13 fallback that ships only if an AMO reviewer objects, and are marked held or external.

The chapter's main gap is wiring. `src/entrypoints/background.ts` still runs the interim 1.5.0 runtime (`@/lib/storage`, `@/lib/session`). It imports only `sender-origin` from `src/background/`. The 2.0 Store, the legacy migration, Agree, claiming, withdrawal and the interim conversion are built and well tested, but only `tools/fixtures/*` harnesses and unit tests reach them (`createBrowserStoreLifecycle`, `createBrowserStartingLocalFilterWriter`). The extension has no `onboarding.html` entrypoint, so the tested Svelte first run (`src/ui/onboarding/`) is never mounted. The upgrade note, badge, 2.0 popup banners and Settings › Privacy & data don't exist. The manifest still ships `name: "YouTube Playlist Tools"`, version 1.5.0 and the old icon. On the release side, `release.yml` and `scripts/` cover the meta decision, build, tag, AMO and CWS submission. Missing: every gate (sources diffs on x64 and ARM64, budget, zip, browser, watch, live-check record, hotfix-freeze), `watch.yml`, `pages.yml`, `site/`, `store/`, `SOURCE_CODE_REVIEW.md`, `RELEASING.md` and the upgrade-test harness. `release-meta.test.sh` passed when run here. `legacy.bun-test.ts` and `legacy-execution.bun-test.ts` passed: 228 tests.

**Shorthand used in the table.**
- **W** means no shipped caller. The code is reached only from tests and `tools/fixtures/*`, because `src/entrypoints/background.ts` composes the interim runtime, not the 2.0 Store.
- **O** means no `onboarding.html` entrypoint. `src/entrypoints/` has only `background.ts`, `popup/`, `options/` and `youtube.content.tsx`.
- **CI-verified** means the behavior lives in `.github/workflows/` or `scripts/`, and was confirmed by reading it. Those rows are `external`.

## Table

| ID | Status | Evidence | Gap |
|---|---|---|---|
| REL-MIG-01 | unwired | Starting owner runs `executeLegacyStartup` first on its lane, `src/background/store/local-filter-writer.ts:772`; `ready()` contract in store README:564 | W. Background start never runs it |
| REL-MIG-02 | unwired | `legacy-startup.ts:107-146`, trigger keys `legacy.ts:5-13`; tests `legacy.bun-test.ts:44-136` ("developer keys alone never trigger…") | W |
| REL-MIG-03 | partial | Fresh classification `legacy-startup.ts:146` | W; toolbar "!" and popup "Waiting for your OK" with Review missing |
| REL-MIG-04 | partial | Fresh writes `schema` only, `legacy-execution.ts:48-53`; test `legacy.bun-test.ts:45` | W; no `onInstalled` "install" first-run tab anywhere; badge/popup missing; O |
| REL-MIG-05 | partial | Plan reads stored state only, no `onInstalled` (`legacy-startup.ts`) | W; "the note opens then" missing (no note opener) |
| REL-MIG-06 | untested | No `onUpdateAvailable` in `src/` | Satisfied by absence; no guard test |
| REL-MIG-07 | untested | 2.0 Store doesn't use WXT items; `src/lib/storage.ts` items have no `version`/`migrations` | Satisfied by absence; no guard |
| REL-MIG-08 | partial | Steps 1–4 in order, `legacy-execution.ts:58-90`; test `legacy-execution.bun-test.ts:203` | W; step 5 (open the note) missing |
| REL-MIG-09 | unwired | Crash-boundary convergence tests `legacy.bun-test.ts:467`, `:734`; resume path `legacy-startup.ts:129-140` | W |
| REL-MIG-10 | missing | `device.legacyCleared` exists in model `src/shared/model/types.ts:138` | No page clears `localStorage`; no message sets the flag |
| REL-MIG-11 | unwired | `convertLegacy` `legacy.ts:93-104`; tests S1/S2 `legacy.bun-test.ts:146`, `:180` | W |
| REL-MIG-12 | partial | `feedback` carried, `legacy-startup.ts:80,83` | Note line missing; "failures still show" belongs to the toaster chapters |
| REL-MIG-13 | unwired | Claim writer `local-claim-writer.ts:141` merges `unclaimed.autoAdd`; `claim-transaction` fixture | W; Videos-only/no-override default not separately asserted here |
| REL-MIG-14 | unwired | `cleanPlaylist` `legacy.ts:37-46`, de-dup `:86-91`; test `legacy.bun-test.ts:207` | W |
| REL-MIG-15 | unwired | `legacy.ts:88-92`; test `legacy.bun-test.ts:207` | W |
| REL-MIG-16 | unwired | `legacy-shortcut.ts:18-24`; tests `legacy.bun-test.ts:251` | W |
| REL-MIG-17 | unwired | `legacy-shortcut.ts:27-35` | W |
| REL-MIG-18 | unwired | `legacy-shortcut.ts:21,24,36` (Ctrl+Alt, bare Enter/Space, modifier last) | W |
| REL-MIG-19 | unwired | Keys carried as given, `legacy-shortcut.ts:37` | W; typing suppression is chapter 02's |
| REL-MIG-20 | unwired | `legacy-shortcut.ts:67-70` | W |
| REL-MIG-21 | unwired | `legacy-shortcut.ts:71-72`; test `legacy.bun-test.ts:293` | W |
| REL-MIG-39 | unwired | Row with `key: null` when note ≠ none, `legacy-startup.ts:78-85`; claim fills original row | W; note copy missing |
| REL-MIG-22 | unwired | `legacy-startup.ts:80` | W |
| REL-MIG-23 | unwired | `legacy-startup.ts:83` | W |
| REL-MIG-24 | unwired | `preset: true`, picker/undo collision `legacy-startup.ts:81-87`; test `legacy.bun-test.ts:282` | W |
| REL-MIG-25 | unwired | `defaultSettings`/`defaultDevice` in `legacy-startup.ts:79,88` | W |
| REL-MIG-26 | unwired | Registrar consent gate `src/background/registrar/registrar.ts:77,92`; Agree applies ticks `consent-agreement.ts:206-241` | W |
| REL-MIG-27 | unwired | Credentials in `LEGACY_DELETE_KEYS` `legacy.ts:13-14`; no revoke request anywhere | W. The shipped interim start deletes credentials (`background.ts:16`) without recording `authorised` |
| REL-MIG-28 | missing | None | No `myaccount.google.com/permissions` link in note or Settings |
| REL-MIG-29 | unwired | Registrar refuses without consent `registrar.ts:77`; test `registrar.bun-test.ts:53` | W |
| REL-MIG-30 | partial | Consent gates exist (W) | Note view showing stored values missing |
| REL-MIG-31 | missing | First run checks access (`src/ui/backend/first-run-owner.ts:84`) | Note's pre-Agree Give access missing |
| REL-MIG-32 | missing | None | No badge code (`action.setBadgeText` absent) |
| REL-MIG-33 | unwired | `upgradeNote` written `legacy-startup.ts:88-96`; type `types.ts:126-132` | W |
| REL-MIG-34 | unwired | `originalShortcutId` `legacy-startup.ts:100-103`; tests `legacy.bun-test.ts:592-706` | W |
| REL-MIG-35 | unwired | Normal-window signed-in authority `local-claim-writer.ts:77-80`; `tools/fixtures/claim-transaction` | W; no tab trigger starts a claim |
| REL-MIG-36 | unwired | Claim writer; outcome kinds `types.ts:111-120` | W |
| REL-MIG-37 | partial | `ClaimNotice` data with skip reasons `types.ts:111-120`; `claim-notice.ts` | W; none of the outcome strings exist; popup notice UI missing |
| REL-MIG-38 | partial | Private refusal `local-claim-writer.ts:77` | W; "belong to another YouTube account" banner, Switch account and Discard missing |
| REL-MIG-40 | unwired | `legacy.ts:93-103`; test S13 `legacy.bun-test.ts:174` | W; same interim-deletion caveat as REL-MIG-27 |
| REL-MIG-41 | unwired | Interim recognition refuses legacy path `legacy-startup.ts:124`; retention `interim-persistence.ts` (README:669-681); `tools/fixtures/interim-conversion` | W |
| REL-MIG-42 | unwired | `interim-conversion.ts`; `interim-conversion` fixture | W |
| REL-MIG-43 | unwired | `interim-conversion.ts` shared row; fixture | W |
| REL-MIG-44 | unwired | `interim-canonical-authority.ts`; fixture collision cases | W |
| REL-MIG-45 | unwired | Retained-disclosure Agree (store README:700-702); fixture | W |
| REL-MIG-46 | partial | Unknown history retained (store README:671) | W; truthful note copy missing |
| REL-MIG-47 | partial | `interim-recovery-review.ts`, `interim-recovery-execution.ts` (destinations, occurrences, discard, filter replace); `interim-recovery-review` fixture | W; recovery section UI missing; spec's production ownership/session contracts unmet |
| REL-CON-01 | missing | None | No opener: `tabs.create({active:false})`, `opened = true` |
| REL-CON-02 | missing | None | Open-once rule and the banner's four lines missing |
| REL-CON-03 | missing | None | No note view |
| REL-CON-25 | partial | `seen`/`reopened` fields `types.ts:129-131`, written `legacy-startup.ts:90` | No visibility write; no `onStartup` reopen |
| REL-CON-04 | missing | Only `disclosure_heading_upgrade_note` in `src/public/_locales/en/messages.json` | Whole note copy missing |
| REL-CON-05 | partial | `wasUnset`/`authorised` recorded; Agree accepts a choice only when unset `consent-agreement.ts:239` | Question UI and copy missing |
| REL-CON-06 | partial | Apply on Agree `consent-agreement.ts:240`; fixture `claim-transaction/run.ts:132,230` | W; default radio UI missing |
| REL-CON-07 | unwired | One plan for ticks, `consent` and `state: "done"` `consent-agreement.ts:206-241`; fixture `original-upgrade-agree` | W |
| REL-CON-08 | partial | First-run prompt in click, test `src/ui/onboarding/first-run.bun-test.ts:306` | Note's Agree has no UI; O |
| REL-CON-09 | untested | No data-collection request in code; manifest `required: ["none"]` `wxt.config.ts:43` | Satisfied by absence |
| REL-CON-10 | partial | `ClaimNotice` outcome data | W; "You're all set" view and lines missing |
| REL-CON-11 | partial | Cancellation is read-only (`consent-agreement.bun-test.ts:130`); first-run Not now copy | Note's "Everything stays paused" line missing |
| REL-CON-12 | partial | `src/ui/components/Disclosure.svelte`, `src/ui/onboarding/copy.ts:9-37`, three headings in messages; test `first-run.bun-test.ts:263` | O; note and Settings/popup hosts missing |
| REL-CON-13 | partial | First-run buttons `firstRun_agree_*`; test `first-run.bun-test.ts:257` | Feature dialog's Agree and turn on {Feature}/Cancel missing |
| REL-CON-14 | unwired | Warning, in-click prompt, denied-keeps-consent: `first-run.bun-test.ts:207,306,408` | O |
| REL-CON-15 | partial | Step 1 heading/footer, Continue, Not now lines in messages | O; popup "Waiting for your OK" lines missing |
| REL-CON-16 | unwired | `device.consent {v,at}` `types.ts:124`; interim consent not carried `legacy-startup.ts:124`; R161 refusals `copy.ts:68-69` | W |
| REL-CON-17 | unwired | `CONSENT_VERSION = 1` `src/shared/model/documents.ts:6` | W; shipped code uses interim `store.CONSENT_VERSION` |
| REL-CON-18 | partial | Lower `v` refused (`local-filter-writer.bun-test.ts:1556` "stale-consent") | W; pause message missing |
| REL-CON-19 | missing | None | No `hotfix-freeze` (REL-CI-38) |
| REL-CON-20 | partial | `consent-withdrawal.ts`; tests `consent-withdrawal.bun-test.ts:8-243` | W; Settings › Privacy & data line, Read it again and Withdraw dialog missing |
| REL-CON-21 | unwired | Private origin Agree, fixture `claim-transaction/run.ts:384` | W |
| REL-CON-22 | partial | `storage`/`scripting` only `wxt.config.ts:31`; `data_collection_permissions` `:43` | Firefox host is `https://www.youtube.com/*` (`:33-34`), not 06 §6.3's `*://*.youtube.com/*`; the real dialog is held (native) |
| REL-CON-23 | held | Permissions `wxt.config.ts:31` | Install warnings need the real dialogs (native) |
| REL-CON-24 | partial | First run asks in click (test above) | Chrome manifest lacks `optional_host_permissions` for music; Settings/popup denial path and R71 line missing |
| REL-CI-01 | external | CI-verified `scripts/release-meta.sh:44,72`; cases in `release-meta.test.sh` | |
| REL-CI-02 | external | CI-verified `check-manifests.sh:27-29`; tag `release.yml:151` | |
| REL-CI-03 | external | CI-verified `release-meta.sh:40-42,112-120`; tested | Bump to `1.99.1` at the first beta is a release step (`package.json:5` is 1.5.0) |
| REL-CI-04 | external | CI-verified `release-meta.sh:87-98`; case `2.1.901` | |
| REL-CI-05 | external | AMO status check `scripts/amo-version.ts`; tagged versions skip | Process rule |
| REL-CI-06 | partial | `kind=patch` derived | Nothing enforces identical manifest, listing, consent or schema (REL-CI-38) |
| REL-CI-07 | partial | Process rule | No `--report-against` table or checklist sign-off |
| REL-CI-08 | external | Process rule | |
| REL-CI-09 | external | `wxt.config.ts:32,41` | Floors not asserted by `check-manifests.sh` |
| REL-CI-10 | external | `package.json:13`; beta `update_url` `wxt.config.ts:48`; asserted `check-manifests.sh:58-61` | Lives in `wxt.config.ts`, not `build/manifest.ts` |
| REL-CI-11 | external | CI-verified `release.yml:223-234` | |
| REL-CI-12 | partial | Signed `.xpi` attached `release.yml:271-273` | `beta/updates.json` generation missing (`pages.yml`) |
| REL-CI-13 | held | Firefox behavior | Live upgrade check |
| REL-CI-14 | missing | None | Hand-off entry in `updates.json` needs `pages.yml`; attaching the AMO `.xpi` is an owner step |
| REL-CI-15 | missing | None | No Diagnostics "(beta)" label |
| REL-CI-16 | held | `cws-submit.ts` targets the item | Unlisted item is an owner dashboard step |
| REL-CI-17 | held | Owner listing edits and pre-release | README beta line missing (REL-CI-54) |
| REL-CI-18 | partial | `ci.yml:18-104` one `build` job: compile, `bun run test`, builds, manifest check, uploads | No `check` split, `test:coverage`, Bun-version check, `check:budget` or `browser` job |
| REL-CI-19 | partial | No `broker` job | Vitest still runs (`package.json:18,22`); jq manifest checks remain |
| REL-CI-20 | partial | `check-manifests.sh:23-66`: MV3, version, no `identity`, hosts, no `content_scripts`, gecko ID, `update_url` | Missing floors, `data_collection_permissions`, `web_accessible_resources`, `commands`, `optional_permissions`; Firefox host rule contradicts spec |
| REL-CI-21 | missing | None | No `--report-against` |
| REL-CI-22 | missing | Local `scripts/check-source-rebuild.mjs` (Node 24) | No `sources` job on `ubuntu-24.04-arm` |
| REL-CI-23 | external | CI-verified `release.yml:6-9` | |
| REL-CI-24 | external | CI-verified `release-meta.sh`; 20 cases pass | |
| REL-CI-25 | partial | Zips and manifests uploaded `release.yml:69-126` | `ubuntu-latest`, Node 24 not pinned, `bun run test` instead of `test:coverage` |
| REL-CI-26 | external | CI-verified `release.yml:121-126,139-142,189-192` | |
| REL-CI-27 | partial | Manifest check inside `build`; an x64 sources build `release.yml:87-98` | No `gates` job: sources diffs, budget, zip, browser, watch, live-check-record, hotfix-freeze |
| REL-CI-28 | missing | None | No tree diff; no ARM64 |
| REL-CI-29 | external | CI-verified `release.yml:167-169` | Approval reviewers are a GitHub setting (held) |
| REL-CI-30 | partial | `release.yml:210-220`; `scripts/amo-metadata.ts:30-35` | `store/notes/` and `store/release-notes/` absent, so a strict release fails |
| REL-CI-31 | external | `amo-metadata.ts:51` | No test |
| REL-CI-32 | external | CI-verified `release.yml:223-273` | |
| REL-CI-33 | external | CI-verified `release.yml:277` | |
| REL-CI-34 | external | `cws-submit.ts:93` polls `fetchStatus`; publish type `release.yml:306` | Manual `CHROME_API_VERSION=v2` line not checked (`.env.submit.example` unread per brief) |
| REL-CI-35 | external | `cws-submit.ts` sets no `skipReview` (`:14`) | |
| REL-CI-36 | partial | Tag and release with zips and manifests `release.yml:148-163` | Release notes not attached (`--generate-notes`); no `pages.yml` trigger |
| REL-CI-37 | external | `release.yml:13-14,132-133,170-172`; no `PUBLISH_TO_STORES` in repo | |
| REL-CI-38 | missing | None | No `hotfix-freeze` |
| REL-CI-39 | external | `docs/development/releasing.md:44-46` | Process |
| REL-CI-40 | partial | Patch publish type `release.yml:306` | Live-check gate missing |
| REL-CI-41 | held | Developer process | |
| REL-CI-42 | missing | None | No `watch.yml` |
| REL-CI-43 | missing | None | No `pages.yml` or `site/` |
| REL-CI-44 | missing | None | No `updates.json` generator |
| REL-CI-45 | missing | None | Same as REL-CI-44 |
| REL-CI-46 | held | Workflows use `amo`/`cws` environments and secrets | Environments are owner settings; `AMO_REVIEWER_LOGIN` used nowhere |
| REL-CI-47 | held | Workflows read `PUBLISH_AMO`, `PUBLISH_CWS`, `CWS_PUBLISH_TYPE` | Owner settings |
| REL-CI-48 | held | No references in repo | Deleting secrets is an owner step |
| REL-CI-49 | held | None | Ruleset is an owner setting |
| REL-CI-50 | external | `.env.submit.example` exists | Contents unverified (brief forbids `.env` reads) |
| REL-CI-51 | partial | `server/` gone (commit `110ade6b0`) | `archive/token-broker` tag unverified (no tags in checkout, no network) |
| REL-CI-52 | partial | `server/`, root `.env.example`, server scripts, broker job, docker ecosystem, env-file rows gone | `.dockerignore`, `docs/legacy/{README,authentication,token-broker}.md` and links (`docs/README.md:19-21`, `README.md:35`) remain |
| REL-CI-53 | untested | `src/lib/auth*` absent | Removal; no guard |
| REL-CI-54 | missing | `README.md:20` still says 1.5.0 | 2.0 README and docs rewrite |
| REL-CHK-01 | held | Release process | |
| REL-CHK-02 | held | Workflow honors `PUBLISH_CWS` | Owner toggles |
| REL-CHK-03 | held | Release process | |
| REL-CHK-04 | held | Launch criteria | Trademark search, route table, matrix, live check, README all outstanding |
| REL-CHK-05 | held | Store process | |
| REL-CHK-06 | held | Store process | |
| REL-CHK-07 | held | Store process | |
| REL-CHK-08 | held | Store process | |
| REL-CHK-09 | held | Rollback rehearsal | |
| REL-CHK-10 | held | Release PR note | |
| REL-CHK-11 | missing | None | No `scripts/upgrade-test/` |
| REL-CHK-12 | missing | None | Harness missing; real Firefox runs are native (held) |
| REL-CHK-13 | missing | None | Harness missing |
| REL-CHK-14 | partial | Pure conversion for S1, S2, S13 in `legacy.bun-test.ts:146-206` | End-to-end scenarios S1 to S14 missing |
| REL-CHK-15 | missing | Registrar consent unit test only | End-to-end DOM, network and registration checks missing |
| REL-CHK-16 | missing | Tests use synthetic evidence | No `src/background/store/fixtures/1.4.5-S{n}.json` |
| REL-CHK-17 | held | Developer runs signed paths | |
| REL-CHK-18 | partial | `docs/development/releasing.md` covers the release flow | No `RELEASING.md` checklist; job summary doesn't link it |
| REL-CHK-19 | held | Process | Its two mechanical gates are missing (REL-CI-27) |
| REL-CHK-20 | held | Process | |
| REL-CHK-21 | held | Process | `--report-against` missing |
| REL-CHK-22 | held | Process | |
| REL-CHK-23 | held | Process | |
| REL-CHK-24 | held | Process | |
| REL-CHK-26 | held | Manual screen-reader pass | Rendering and axe are held |
| REL-CHK-27 | held | Running-cost check | |
| REL-CHK-25 | held | Owner's list; policy approved (G14) | |
| REL-STORE-01 | missing | Assets in `assets/brand/`, `assets/icon/` | No `store/listing/` |
| REL-STORE-02 | missing | None | No listing text in repo; AMO edit is an owner step |
| REL-STORE-03 | missing | None | Attribution absent from repo, Settings › About and README |
| REL-STORE-04 | held | Fallback only | Applies only if an AMO reviewer objects |
| REL-STORE-05 | held | Owner listing edit | |
| REL-STORE-06 | missing | None | `store/release-notes/2.0.0.md` |
| REL-STORE-07 | held | None | Screenshots from the release candidate (rendering) |
| REL-STORE-08 | held | None | Same |
| REL-STORE-09 | held | None | Demo account is an owner step |
| REL-STORE-10 | held | None | Same |
| REL-STORE-11 | external | `assets/brand/promo-small-440x280.png` (440×280 verified) | Not copied into `store/listing/` |
| REL-STORE-40 | partial | `assets/icon/store-128.png`, `amo-128.png` (128×128) | Manifest icons come from `src/assets/icon.png` (old icon; hash differs from `store-128.png`) |
| REL-STORE-41 | partial | Promo tile and marquee (1400×560 verified) | Not copied into `store/listing/` |
| REL-STORE-42 | external | Rule; nothing to build | |
| REL-STORE-43 | held | `assets/brand/social-preview-1280x640.png` (1280×640 verified) | Owner uploads it |
| REL-STORE-38 | missing | None | No credit in a Settings card or About (no 2.0 Settings), listings, release notes, `docs/features.md` or README |
| REL-STORE-39 | external | No GatherTube code in `src/` | |
| REL-STORE-12 | missing | None | No `site/` or `pages.yml` |
| REL-STORE-13 | missing | None | Same |
| REL-STORE-14 | missing | None | Same |
| REL-STORE-15 | missing | None | Same |
| REL-STORE-16 | held | `policyUrl` `src/ui/onboarding/copy.ts:7` | Owner rule: no repo rename |
| REL-STORE-17 | missing | Text approved (G14); URL `copy.ts:7` | Not published; cookie bullet PROVISIONAL on ticket 25 |
| REL-STORE-18 | external | Nothing to add at launch | |
| REL-STORE-19 | held | Process | |
| REL-STORE-20 | missing | None | `store/cws-dashboard.md` |
| REL-STORE-21 | missing | `amo-metadata.ts` reads the template file as is | `store/notes/reviewer-full.md`; no placeholder fill |
| REL-STORE-22 | missing | None | `reviewer-hotfix.md` |
| REL-STORE-23 | missing | None | `reviewer-beta.md` |
| REL-STORE-24 | partial | No credentials in repo | `AMO_REVIEWER_LOGIN` not wired into `submit-amo` |
| REL-STORE-25 | held | Owner's 2SV and codes | |
| REL-STORE-26 | held | Owner creates the account | |
| REL-STORE-27 | missing | None | `SOURCE_CODE_REVIEW.md` |
| REL-STORE-28 | partial | `packageManager` `package.json:2` | No `build-for-amo` script |
| REL-STORE-29 | partial | No Bun APIs in `wxt.config.ts` or `build/` (searched) | No CI job builds the extension on Node 24 |
| REL-STORE-30 | missing | None | Bun-version check |
| REL-STORE-31 | missing | Only `svelte-pilot` pins Node 24 (`ci.yml:111-113`) | Release and source jobs don't |
| REL-STORE-32 | external | `wxt.config.ts:9`; pilot exclusion asserted `ci.yml:53-54` | `src/livecheck/` doesn't exist yet |
| REL-STORE-33 | partial | x64 rebuild with Bun, no diff, `release.yml:87-98` | Tree diff and ARM64 missing |
| REL-STORE-34 | external | Fallback table; nothing ships at launch | |
| REL-STORE-35 | external | `.github/ISSUE_TEMPLATE/{problem,not-working,idea,config}.yml`: labels, input IDs, blank issues off, links | Labels must exist on GitHub (owner) |
| REL-STORE-36 | missing | None | No Report a problem chooser (no 2.0 Diagnostics or About) |
| REL-STORE-37 | missing | Forms carry `version`, `browser`, `feature`, `status` inputs | No prefilled-address builder in `src/` |

## Work to do

Each unit lists its IDs, files, dependencies and size.

**U1. Compose the 2.0 background.** Size L. No dependencies.
- IDs. REL-MIG-01, 02, 09, 11, 13 to 27, 29, 33 to 36, 39 to 45; REL-CON-07, 16, 17, 21.
- Files. `src/entrypoints/background.ts`, `src/background/adapters/store-lifecycle.ts`, `starting-owner.ts`, `startup-source.ts` (native sanitized startup observation that computes `refreshTokenWasNonempty` before any deletion), `src/background/registrar/`.
- Notes. Retire the interim `removeLegacyCredentials()` and `retireLegacyVideoCache()` start calls, which erase REL-MIG-40's evidence. Keep the interim safeguards until their replacements are verified (REL-MIG-45). This unit spans chapters 04 and 06 too. Their reports name the same gap.

**U2. Mount the first-run page and open it on install.** Size M. Depends on U1.
- IDs. REL-MIG-04, REL-CON-12 to 15 (first-run parts), REL-CON-14.
- Files. New `src/entrypoints/onboarding/` (`index.html`, `main.ts` mounting `src/ui/onboarding/FirstRun.svelte`), an `onInstalled` "install" handler in the background composition.

**U3. Build the upgrade note.** Size L. Depends on U1, U2.
- IDs. REL-MIG-05, 08 (step 5), 28, 30, 31, 46 (copy); REL-CON-01 to 06, 08, 10, 11, 25; REL-MIG-37 (in-note outcome).
- Files. New `src/ui/onboarding/UpgradeNote.svelte` and copy in `copy.ts` and `src/public/_locales/en/messages.json`. A background note opener with `tabs.create({active:false})`, `opened`, a `seen` write on first visibility, and the `runtime.onStartup` reopen.

**U4. Badge and popup consent banners.** Size M. Depends on U1 and chapter 05's 2.0 popup.
- IDs. REL-MIG-03, 32, 37 (popup notice), 38; REL-CON-02 (banner), 15 (popup line), 18.
- Files. A badge adapter (`action.setBadgeText`/`setBadgeBackgroundColor`), popup banner components, messages.

**U5. Consent controls in Settings and feature dialogs.** Size M. Depends on U1 and chapter 05's Settings.
- IDs. REL-CON-12, 13 (feature dialog), 20, 24 (Settings/popup denial path), REL-MIG-28 (Privacy & data link), REL-STORE-03 (About attribution), REL-STORE-38 (card and About credit).
- Files. Settings › Privacy & data and About sections, `Disclosure.svelte` host dialog, messages.

**U6. `localStorage` cleanup.** Size S. Depends on U1.
- IDs. REL-MIG-10.
- Files. Shared page bootstrap for popup, options and onboarding; a background message that sets `device.legacyCleared`.

**U7. Activate the interim conversion.** Size L. Depends on U1, U3 and the owner question Q3.
- IDs. REL-MIG-46 (note copy), 47 (recovery section).
- Files. Recovery UI over `interim-recovery-review.ts`/`interim-recovery-execution.ts`; note conditions.

**U8. Align the manifest.** Size M. No dependencies; coordinate with chapter 06 ARC-MAN.
- IDs. REL-CON-22, 24 (optional music host); REL-STORE-40 (Perch icon); REL-CHK-18's name, `short_name` and description.
- Files. `wxt.config.ts` (or a new `build/manifest.ts`), `src/assets/icon.png` replaced by Perch, `scripts/check-manifests.sh`.
- Notes. Blocked on Q1 for the Firefox host pattern.

**U9. Restructure `ci.yml` and `release.yml` gates.** Size L. Depends on U8 and chapter 07 (budget, zip, browser layer, live-check build).
- IDs. REL-CI-18 to 22, 25, 27, 28, 40; REL-STORE-29 to 31, 33.
- Files. Both workflows; `package.json` scripts `check:manifest` (with `--report-against`), `check:budget`, `check:zip`, `test:coverage`, `build-for-amo` (REL-STORE-28); reuse `scripts/check-source-rebuild.mjs` for the x64 and ARM64 tree diffs.
- Notes. Dropping Vitest (REL-CI-19) waits on U1 retiring the interim runtime its 322 tests cover.

**U10. `hotfix-freeze`.** Size M. Depends on U9, U11, U12.
- IDs. REL-CI-38, 06; REL-CON-19.
- Files. A gate script comparing manifests from release assets, `git diff` over `store/` and `site/privacy`, the consent constant and the schema constant; a `release.yml` job.

**U11. `store/` content and `SOURCE_CODE_REVIEW.md`.** Size M. No dependencies. Cookie lines stay PROVISIONAL on ticket 25.
- IDs. REL-STORE-01, 02, 06, 11, 20 to 23, 27, 38 (listing and notes credit), 41; REL-CI-30 (inputs), 36 (attach notes).
- Files. `store/listing/*` (text plus copies of the promo images), `store/release-notes/{1.99.1,2.0.0}.md`, `store/notes/reviewer-{full,hotfix,beta}.md`, `store/cws-dashboard.md`, `SOURCE_CODE_REVIEW.md` at the sources-zip root.

**U12. Site and `pages.yml`.** Size M. No dependencies.
- IDs. REL-STORE-12 to 15, 17; REL-CI-12, 14, 43 to 45.
- Files. `site/index.html`, `site/privacy/index.html`, `site/beta/index.html`, `.github/workflows/pages.yml`, an `updates.json` generator script.

**U13. Reviewer-credential fill.** Size S. Depends on U11 and Q2.
- IDs. REL-STORE-21 (placeholders), 24; REL-CI-46 (`AMO_REVIEWER_LOGIN`).
- Files. `scripts/amo-metadata.ts`, `release.yml`.
- Notes. This is secret-handling code. It needs credential-free tests, a separate review and owner approval before it runs.

**U14. `watch.yml`.** Size L. Depends on chapter 07's watch list.
- IDs. REL-CI-42; REL-CI-27's `watch` gate.

**U15. Upgrade-test harness and real snapshots.** Size L. Depends on U1 to U3. Real Firefox runs are native behavior (held).
- IDs. REL-CHK-11 to 16.
- Files. `scripts/upgrade-test/` (`old.xpi` from `e96dbf7`, `new.xpi`, HTTPS `updates.json`), `src/background/store/fixtures/1.4.5-S{n}.json`, a Bun test over them.

**U16. Finish retiring the broker.** Size S. No dependencies.
- IDs. REL-CI-51, 52.
- Files. Delete `.dockerignore` and `docs/legacy/{README,authentication,token-broker}.md`, and their links in `docs/README.md` and `README.md`. Keep `docs/legacy/1.4.5-setup.md`. The `archive/token-broker` tag needs a remote check.

**U17. README, docs and `RELEASING.md`.** Size M. Best done near launch.
- IDs. REL-CI-54, 17 (beta line); REL-CHK-18; REL-STORE-03 (README), 38 (README and `docs/features.md` credits).

**U18. Diagnostics beta label and Report a problem.** Size M. Depends on chapter 04 Diagnostics (HEALTH) and chapter 05 Settings.
- IDs. REL-CI-15; REL-STORE-36, 37.
- Files. A version-pattern helper, the chooser, the prefilled-address builder with URL encoding.

**Untested rows** (REL-MIG-06, 07, REL-CON-09, REL-CI-53) are satisfied by absence. One S unit can add a source guard (no `onUpdateAvailable`, no WXT `migrations`, no `src/lib/auth*`, no data-collection request) to the existing architecture guard.

## Questions

1. **Firefox host pattern.** The spec (06 §6.3, REL-CON-22, reviewer notes) keeps `*://*.youtube.com/*` on Firefox, so the 1.4.5 update stays silent. `wxt.config.ts:33-34` ships `https://www.youtube.com/*` on both browsers, and `check-manifests.sh:33-34` asserts it as "only YouTube site access". Which one does the owner want? This blocks U8 and the reviewer-notes text in U11.
2. **Reviewer credentials in CI.** REL-STORE-21 has CI fill `{email}`, `{password}` and backup codes from `AMO_REVIEWER_LOGIN`. Under the owner's secrets rule this is new secret-handling code. Does the owner approve building it, and in what format does the secret hold the four values? This blocks U13.
3. **Interim conversion go-ahead.** §2.12 says conversion can't run until "verified production ownership/session contracts" exist. What evidence counts as verified, and is the owner the one to supply it? This blocks U7.
4. **Ticket 25's route table.** The cookie lines (disclosure bullet 4, the policy bullet, Chrome's Authentication tick, reviewer route 4) and the endpoint list stay PROVISIONAL until it's filled. It doesn't block U11's drafts, but it blocks their final text and REL-CHK-04.
