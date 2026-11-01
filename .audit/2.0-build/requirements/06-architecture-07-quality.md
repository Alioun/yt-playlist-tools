# Requirement pass: 06 Architecture and 07 Quality

Read at commit `f7898dcc8` on `2.0/compose-units`, one commit past `8563caea3` that added only the brief. The three commits after it, up to `648be9dfb`, add only other chapters' reports under `.audit/`. Inspect only: no source, test or Git state was changed, and no test was run.

## Summary

Chapter 06 defines 169 IDs and chapter 07 defines 195, which makes 364 rows. The counts are **built 19, untested 16, partial 98, unwired 92, missing 120, external 13, held 6**. For 06 alone: built 6, untested 7, partial 44, unwired 87, missing 22, external 1, held 2. For 07 alone: built 13, untested 9, partial 54, unwired 5, missing 98, external 12, held 4. No ID in either chapter is marked superseded, runner-up or historical. Q-TOOL-10 and Q-WATCH-1 carry a runner-up note, but their main requirement stays in scope. §6.11 lists superseded ticket statements, which have no IDs.

One fact decides most rows. The shipped extension is still 1.x. `src/entrypoints/` holds only `background.ts`, `popup/`, `options/` and `youtube.content.tsx`, and `wxt.config.ts` is the 1.x React manifest. A reachability walk over static imports from every non-test file under `src/entrypoints/` reaches only `src/background/adapters/sender-origin.ts`, `src/page/youtube-session.ts`, `src/shared/contracts/{json,results,vocabulary}.ts` and `src/shared/model/*`. Nothing reaches the gateway, the site core, the kit, the features, the Registrar, Tabs, AddFlow, Gather, the Monitor, the TabView publication or the 2.0 UI. There are no `page-*`, `core-*`, `kit-*`, `feature-*`, `popovers` or `onboarding` entrypoints, and no `background/boot`. Several READMEs confirm it: the Registrar README says "No entrypoint imports or starts this Registrar yet", and the AddFlow README says "No entrypoint, gateway or picker calls it yet". So a module that exists and is tested is **unwired**. A row is **built** when the shipped code reaches it or a guard enforces it over all of `src/`.

Chapter 07 is mostly unbuilt tooling. None of these exist: `scripts/check-budget.ts`, `check-manifest.ts`, `check-zip.ts`, `check-runtime.ts`, `coverage.ts`, `perf-budget.json`, `bunfig.browser.toml`, `tests/browser/`, `tests/fakes/`, `fixtures/`, `tools/watch/`, `src/shared/watchlist.ts`, `src/shared/platform.ts`, `src/livecheck/`, `build/manifest.ts`, `build/livecheck.ts`, `.github/workflows/watch.yml`, `RELEASING.md` or `SOURCE_CODE_REVIEW.md`. No size, time or running-cost budget has a gate, so every budget row is missing or partial. The quality rows that are enforced come from `tests/guards/architecture.test.ts` (imports, env, page-console, entrypoints, storage-writes, running-cost), the Bun runner and preloads, and `scripts/check-manifests.sh`.

Abbreviations in the table:
- **No composition**: no 2.0 entrypoint or startup module calls this code.
- **Gate `X`**: a fixture gate in `tools/fixtures/X/`, run by `bun run test:fixtures` through `tools/fixtures/gates.ts`.
- **Guard**: `tests/guards/architecture.test.ts`, run by `bun run test:bun`.

## 06 Architecture

| ID | Status | Evidence | Gap |
|---|---|---|---|
| ARC-ACC-01 | unwired | `src/page/gateway.ts:56` is the only 2.0 sender | No `page-www`/`page-music` entrypoint; 1.x still sends via `src/lib/youtube.ts`, `src/page/youtube-session.ts` |
| ARC-ACC-02 | unwired | Tabs filters by job site, `src/background/tabs/tabs.ts:32`; `tabs.bun-test.ts` | No composition; installed-app case held on M4 |
| ARC-ACC-03 | unwired | `Tabs.runIn`, `tabs.ts:32`; "a gone original tab … never falls back" | No core endpoint or AddFlow executor bound |
| ARC-ACC-04 | partial | `Tabs.serve` in `tabs.ts` | Playing now's own-tab exception (ARC-ACC-68) missing; no popup/settings caller |
| ARC-ACC-05 | unwired | Job guards in `src/shared/contracts/jobs.ts`; `jobs-streams.bun-test.ts` | No composition |
| ARC-ACC-06 | unwired | Account pinned at load, `gateway.ts` `pinAccount`; signer re-reads `ytcfg` per job, gate `gateway-playlists` signer test | No page entrypoint |
| ARC-ACC-07 | untested | No remote fetch of config anywhere in `src/page` | No check asserts it |
| ARC-ACC-08 | unwired | Only click is the card menu, `src/page/adapters/live-www-queue.ts:34`; gate `gateway-www-queue` | No page entrypoint; no guard against other clicks |
| ARC-ACC-09 | unwired | Tabs `enabled()` admission ("held admission performs no … calls"); `desired()` empty without consent, `registration.bun-test.ts` | Not bound to real consent; no composition |
| ARC-ACC-10 | unwired | Qualifying routes encoded in `src/page/routes/www.ts:11` | No page entrypoint |
| ARC-ACC-11 | unwired | Command, service, signed order, `routes/www.ts:6`; gate `gateway-playlists` "preserve command service signed order" | No page entrypoint |
| ARC-ACC-12 | partial | `src/page/routes/www.ts`, `src/page/routes/music.ts` | Music table has no route for `queueInsert`, `queueRemove`, `queueRemoveIds`, `queueMove`, `queueReinsert`, `like`, `library`, `navigate` |
| ARC-ACC-13 | unwired | Shape scan of `default_kevlar_base`, `src/page/adapters/www-resolver.ts:20`; gate `gateway-playlists` live test "reports ambiguity" | No page entrypoint |
| ARC-ACC-14 | unwired | Cache and one rescan, `www-resolver.ts:20`; "rescans only once" | No page entrypoint |
| ARC-ACC-15 | unwired | Resolver dispatch with callbacks, `www-resolver.ts`; "command callbacks settle once" | No page entrypoint; L1 held |
| ARC-ACC-16 | partial | Watch ID `gateway.www.resolver`, `src/page/gateway/port.ts` | No watch list module or needle |
| ARC-ACC-17 | unwired | Signer reads cookies via port, `src/page/gateway/www-request.ts:59`; gate `gateway-playlists` signer tests | No page entrypoint |
| ARC-ACC-18 | unwired | "all dummy signer failure paths keep secret values out of results and diagnostics" | No page entrypoint |
| ARC-ACC-19 | untested | Shipped manifest has no `cookies`; no header rewriting in `src/` | `check-manifests.sh` doesn't assert `cookies` absent |
| ARC-ACC-20 | held | Signed request still sends `Authorization` | Waits on live check L3 |
| ARC-ACC-21 | partial | Music uses `networkManager` only, `src/page/adapters/live-music.ts:4`; "Music can never enter the www signer" | `ctx.can`, hidden buttons and the key's "isn't working" answer missing (no Music features) |
| ARC-ACC-22 | partial | Saves via `networkManager.fetch` without response actions, gate `gateway-playlists` live test | Menu-item route, queue replay and Music `quiet-route-noisy` missing |
| ARC-ACC-23 | missing | None | No Music queue insert |
| ARC-ACC-24 | missing | None | No queue-growth confirmation |
| ARC-ACC-25 | missing | None | No block insert or undo |
| ARC-ACC-26 | missing | None | No reorder drop or pre-checks |
| ARC-ACC-27 | missing | None | No move confirmation |
| ARC-ACC-28 | missing | None | No move undo |
| ARC-ACC-29 | missing | None | No `MusicPort` queue panel checks |
| ARC-ACC-30 | partial | App-state lane, `src/page/gateway/lanes.ts:19`; www queue uses it | Music queue jobs and likes don't exist |
| ARC-ACC-31 | partial | `castState` read with fallback, `routes/music.ts`; `gateway.bun-test.ts` "cast primary … fall back" | Nothing gates queue edits on casting |
| ARC-ACC-32 | unwired | `src/page/gateway/www-queue.ts:36`; gate `gateway-www-queue` "first add resolves the card's own queue command" | No page entrypoint |
| ARC-ACC-33 | unwired | Quiet TLPQ edit with `IAE%3D`; gate `gateway-www-queue` | No page entrypoint; T29 held |
| ARC-ACC-34 | unwired | "a noisy quiet route … records quiet-route-noisy once" | Monitor's *partly working* not bound |
| ARC-ACC-35 | unwired | `confirmWindow = 2_000`, `www-queue.ts:28`; miniplayer fallback test | No page entrypoint |
| ARC-ACC-36 | unwired | Undo remove, refresh, one retry; gate `gateway-www-queue` | No page entrypoint |
| ARC-ACC-37 | unwired | Undo by `setVideoId` only; "Undo removes exactly its entry" | No page entrypoint |
| ARC-ACC-38 | unwired | "two adds run one at a time in the app-state lane" | No page entrypoint |
| ARC-ACC-39 | unwired | Fallback loop in `gateway.ts` `send`; "HTTP and application rejections stop fallback" | No page entrypoint |
| ARC-ACC-40 | unwired | "uncertain writes never fall back after throws rejections or lost answers" | No page entrypoint |
| ARC-ACC-41 | unwired | `src/page/gateway/answers.ts`; "including HTTP 200 failure" | No page entrypoint |
| ARC-ACC-42 | unwired | `lanes.ts:19`; "direct reads bypass the request lane" | No page entrypoint |
| ARC-ACC-43 | unwired | 429 cooldown, `src/background/add-flow/add-flow.ts:396`; 5-minute cache, `src/background/playlists/playlists.ts:74` | No composition |
| ARC-ACC-44 | partial | Jobs 10 s (`lanes.ts`), queue confirm 2 s (`www-queue.ts:28`), ping 2 s in Tabs | Music queue-growth 10 s missing |
| ARC-ACC-45 | built | No `console` under `src/page`; page-console guard, `tests/guards/architecture.test.ts:106` | None |
| ARC-ACC-71 | unwired | Listener sharing and release, `src/page/live-reads.ts:34`; `live-reads.bun-test.ts` | No page entrypoint |
| ARC-ACC-46 | unwired | SHA-256 account key, `src/site/core/page-link.ts:59`; `page-link.bun-test.ts` | No `core-*` entrypoint |
| ARC-ACC-47 | unwired | Core check in PageLink; gateway latch, `src/page/gateway/account.ts:6`; "late identity mismatch stays latched" | No SiteCore assembly; the account-changed copy isn't shown anywhere |
| ARC-ACC-48 | held | Music answers allowed without `datasyncId`, `account.ts` `allowMissing` | M2 decides |
| ARC-ACC-49 | partial | Tabs pins the account per invocation | No `tab.add` receiver in any background router |
| ARC-ACC-50 | unwired | `account.ts` returns `unavailable`; "missing signed-out and mismatched identities refuse account jobs" | No page entrypoint |
| ARC-ACC-51 | missing | None | No Switch account or sign-in link in 2.0 UI |
| ARC-ACC-52 | unwired | `Tabs.accountInView`, `tabs.ts:32`; "cached last account requires a surviving Setup" | No popup or settings caller |
| ARC-ACC-53 | unwired | Site, privacy, discarded and frozen filters in `serve`; `tabs.bun-test.ts` | No composition |
| ARC-ACC-54 | unwired | "candidate order is active, matching account, unknown" | No composition |
| ARC-ACC-55 | unwired | 2 s per candidate with injection; "never-resolving injection ends at the same two-second candidate deadline" | No composition |
| ARC-ACC-56 | unwired | Tabs has no wake, reload or activate port; "discarded and frozen tabs are excluded" | No composition |
| ARC-ACC-57 | partial | Registry from `tab.hello` and pings, `tabs.ts` | Start-hidden facts for Gather's trigger 2 aren't kept |
| ARC-ACC-68 | missing | None | No YouTube Music tab picker and no `ui.playingNow` |
| ARC-ACC-69 | missing | None | No Commands or Menus module |
| ARC-ACC-70 | unwired | 200 cap, 3 pings, 1 injection, `tabs.bun-test.ts`; one `tab.hello`, `src/site/core/extlink.ts:138` | No composition |
| ARC-ACC-58 | partial | First run's Open YouTube, `src/ui/onboarding/FinishStep.svelte:70` | No 2.0 popup or settings, cached data stamp or banners |
| ARC-ACC-59 | untested | No offscreen or frame code in `src/` | No check |
| ARC-ACC-60 | partial | Gateway answers `signedOut`; queue add works signed out, gate `gateway-www-queue` | Sign in toast action not built |
| ARC-ACC-61 | partial | `permissions.contains` per site, `src/background/adapters/registrar.ts:97`; `addHostAccessRequest` at line 99 | Toolbar "!", popup and settings Give access missing |
| ARC-ACC-62 | untested | `wxt.config.ts` sets no `incognito` | `check-manifests.sh` doesn't check it |
| ARC-ACC-63 | unwired | Private tab records in Tabs; "private hello and routing never persist" | No composition |
| ARC-ACC-64 | unwired | Private memory in Tabs, AddFlow and Monitor; store private refusals | No composition |
| ARC-ACC-65 | built | `src/background/adapters/sender-origin.ts:51`, called by shipped `src/entrypoints/background.ts:32`; `sender-origin.bun-test.ts` | A window that can't be found is refused, not counted as private |
| ARC-ACC-66 | unwired | Tabs window-kind filter; "private and wrong-site original tabs fail before ping" | No composition |
| ARC-ACC-67 | built | No Google API host in `src/`; `check-manifests.sh` asserts no `identity` and only the youtube.com host | None |
| ARC-ACC-72 | partial | Window read, `src/background/gather/gather.ts:96`; gate `gather-controller` | Trigger 1's all-window read not built; no composition |
| ARC-ACC-73 | partial | Popup path through `Tabs.serve`, `src/background/gather/execution.ts` | Automatic gathering's own serving-tab pick missing |
| ARC-ACC-74 | unwired | `watch_videos` URL, `gather.ts:86`; two `tabs.get` checks; gate `gather-controller` | Gather execution adapter not wired |
| ARC-ACC-75 | unwired | Queue destination with `queueAddList`; gate `gather-controller` | Not wired; `Registrar.ensure` binding missing |
| ARC-ACC-76 | unwired | One `tabs.remove`, plan readback, reopen; gate `gather-controller` manual-completion tests | Not wired |
| ARC-MAN-01 | missing | `wxt.config.ts` is the 1.x manifest | No `build/manifest.ts`, no `__MSG_` name, `default_locale`, `optional_*`, `commands`; Firefox host is www only; `check-manifests.sh` asserts that www-only host |
| ARC-MAN-02 | partial | Shipped manifest is `storage`, `scripting`, www host | Gate checks only `identity` and hosts, not the full forbidden list |
| ARC-MAN-03 | partial | Synchronous `permissions.request` in `src/ui/backend/browser.ts:33` | No popup or settings switch, no Give access control |
| ARC-MAN-04 | unwired | Matches and Gather narrowing, `src/shared/features/registration.ts:72`; "Gather stays file-free and narrows again" | No composition |
| ARC-MAN-05 | partial | In-page keys in `src/site/core/keys.ts` | No `commands` in manifest; core keys unwired |
| ARC-MAN-19 | missing | None | No commands in manifest, no `onCommand`, no `commands.getAll` |
| ARC-MAN-20 | partial | `permissions.remove` for `contextMenus`, `src/background/adapters/shared-settings.ts:11` | Manifest entry, menu creation and `onRemoved` hold missing |
| ARC-MAN-21 | partial | `src/public/_locales/en/messages.json` (465 keys) | No `ext*`, `actionTitle` or command keys; manifest strings hard-coded |
| ARC-MAN-06 | untested | `minimum_chrome_version: "121"` in `wxt.config.ts` | No gate checks it |
| ARC-MAN-07 | untested | `strict_min_version: "140.0"` in `wxt.config.ts` | No gate checks it |
| ARC-MAN-08 | unwired | Fixed records, `registration.ts:30`; "real Registrar … preserves fixed registration records" | No composition |
| ARC-MAN-09 | unwired | Ordered `js` lists; "all twelve preserve supplied feature order" | No composition |
| ARC-MAN-10 | unwired | `runAt` values in the planner; `hello` from PageLink | No entrypoints; `runAt` held on layer 4 |
| ARC-MAN-11 | unwired | `desired()`, `registration.ts:72`; `registration.bun-test.ts` | No composition |
| ARC-MAN-12 | unwired | `reconcile`, `src/background/registrar/registrar.ts:215`; `registrar.bun-test.ts` | No startup owner binds it |
| ARC-MAN-13 | unwired | Injection order page, core, kit, feature, `registrar.ts:148` | No composition |
| ARC-MAN-14 | unwired | Registration rewrite; scope disposal in `src/site/core/feature-host.ts:45` | No composition; real-browser teardown held |
| ARC-MAN-15 | unwired | `ensure(tabId, { core })`, `registrar.ts:237` | No popup, settings or probe caller |
| ARC-MAN-16 | partial | `ensure({ popovers })` | No `popovers.js`, `ctx.popovers` or `tab.need` receiver |
| ARC-MAN-17 | unwired | `ppt:retire`, `page-link.ts:300`; orphan disposal on runtime identity in ExtLink | No entrypoints; update path held on layer 4 |
| ARC-MAN-18 | unwired | Planner takes settings, not accounts, `registration.ts:72` | No composition |
| ARC-MAN-22 | unwired | `paced()`, `registrar.ts:32` | No composition |
| ARC-MAN-23 | missing | None | No browser-menu entries or commands listener |
| ARC-MAN-24 | unwired | Gather entry, `src/shared/features/registry.ts`; registry and registration tests | No composition |
| ARC-MAN-25 | unwired | Gather uses `tabs.query` with `url`, `src/background/adapters/gather-browser.ts` | Not wired |
| ARC-MOD-01 | unwired | Gateway is the only 2.0 page-world code | Shipped MAIN-world code is still 1.x `youtube-session.ts` |
| ARC-MOD-02 | missing | `defineUnlistedScript` used only in `tools/fixtures/svelte-pilot/` | Shipped page code is a `defineContentScript` |
| ARC-MOD-03 | unwired | Store, Registrar, Tabs, AddFlow and Monitor are background modules | No background boot |
| ARC-MOD-04 | partial | Env guard allows `import.meta.env` only in `src/shared/platform.ts` | `platform.ts` and `Platform` don't exist |
| ARC-MOD-05 | unwired | Core adds nothing until asked: `scope.ts`, `keys.ts`, `pointer.ts` with tests | No SiteCore assembly |
| ARC-MOD-31 | unwired | `registerCoreUndo`, `keys.ts:188`; used by `src/site/kit/feedback/index.ts:47` | No SiteCore assembly |
| ARC-MOD-32 | unwired | Kit-free notice, `src/site/core/notice/index.ts:21`; gate `site-card-menu` | No core entrypoint |
| ARC-MOD-41 | unwired | `videoOf`, `order`, `pick`, `src/shared/rules/gather.ts:88`; 33 tests | `pick` has no caller |
| ARC-MOD-40 | partial | Manual half, `gather.ts:96` | Triggers 1 to 3, pacing and `ui.gather*` missing |
| ARC-MOD-34 | partial | `openFirstRun` dependency in `src/background/store/store-lifecycle.ts:100` | No `runtime.onInstalled` listener anywhere |
| ARC-MOD-37 | partial | Diff-only reconcile; one-read startup in starting owner | No gate counts startup reads; no boot |
| ARC-MOD-38 | missing | None | No Badge or `badgeFor` |
| ARC-MOD-39 | partial | Running-cost guard bans `tabs.on*`, `windows.on*`, `setInterval`, alarms, guard line 267 | The listener set itself isn't assembled |
| ARC-MOD-35 | partial | `src/shared/i18n/index.ts` over `getMessage`; gate `localization` | 1.x pages and manifest don't use the catalogue |
| ARC-MOD-36 | partial | `exportFile`, `createImportPlanner`, `src/shared/settings-file/index.ts:89`; `importCheck`, `src/background/store/settings-file-read.ts:23` | No settings page, `<a download>`, file input or `ui.importCheck` route |
| ARC-MOD-06 | missing | None | No livecheck mode, `src/livecheck/` or `check-zip.ts` |
| ARC-MOD-07 | untested | `zip.excludeSources` lists `tools/**`; nothing in `src/` imports `tools/` | No guard or zip check |
| ARC-MOD-08 | unwired | Job events on the element, `src/page/channel.ts:32`; "DOM item jobs run with their actual element" | No entrypoints |
| ARC-REG-01 | partial | Registry feeds Registrar and Monitor, `registry.ts:42` | `check-budget`, settings, popup and layer-4 consumers missing |
| ARC-REG-02 | missing | None | No `registry` guard, feature entrypoints or `perf-budget.json` |
| ARC-REG-03 | unwired | "site access and music section gates", `registration.bun-test.ts` | No composition |
| ARC-REG-10 | unwired | Empty `pages` for `browser-menu`, `any-tab-keys`, `sync` | The features don't exist |
| ARC-REG-11 | unwired | Gather entry and `health.www`, `registry.ts` | No composition |
| ARC-REG-04 | missing | None | No `definePageFeature`, `src/site/feature.ts` or feature entrypoints |
| ARC-REG-05 | unwired | FeatureHost starts on view with a fresh Scope, `feature-host.ts:45` | No SiteCore assembly |
| ARC-REG-06 | unwired | View subscription without restart; `feature-host.bun-test.ts` | No SiteCore assembly |
| ARC-REG-07 | unwired | Scope disposal, `src/site/core/scope.ts`; `scope.bun-test.ts` | No assembly; real-browser check held |
| ARC-REG-08 | missing | None | `ctx.run`, `watch`, `add`, `undo`, `change` and `progress` not built (feature-host README calls them future work) |
| ARC-REG-09 | missing | None | No guard checks that the eight parts agree |
| ARC-MOD-09 | partial | All-off selects no page code, `registration.bun-test.ts` | Most bundle files don't exist; layer-4 proof missing |
| ARC-MOD-10 | unwired | Gateway carries every job and waits for requests | No page entrypoint |
| ARC-MOD-11 | unwired | `__pp.svelte`, `__pp.kit.lib` linking, `build/page-link.ts:17` | Used only by the pilot build |
| ARC-MOD-12 | unwired | Externals and globals, `build/page-link.ts:215` | Store `wxt.config.ts` doesn't use it |
| ARC-MOD-13 | unwired | Name recording and kits last, `build/page-link.ts:201` | Pilot only |
| ARC-MOD-14 | unwired | `css: "injected"`, `runes: true`, `build/page-link.ts:199` | Store config has no Svelte module |
| ARC-MOD-15 | unwired | Four rules asserted in `tools/fixtures/svelte-pilot/page-link/check-build.mjs:33` | Checks the pilot, not the store build |
| ARC-MOD-16 | partial | `__pp` named in `build/page-link.ts` | No core or kit installs `globalThis.__pp` |
| ARC-MOD-17 | partial | Picker components, `src/ui/picker/` | No `popovers.js`, loader, hover preload or 5 s failure toast |
| ARC-MOD-18 | external | Fix order is a contingency rule | `popovers.js` never measured |
| ARC-MSG-01 | unwired | `ppt:req`/`ppt:res` with string detail, `src/shared/rpc/page-channel.ts:9`; `page-channel.bun-test.ts` | No entrypoints |
| ARC-MSG-02 | unwired | Answers validated, `channel.bun-test.ts` "an invalid snapshot never reaches the core" | No entrypoints |
| ARC-MSG-03 | unwired | `projectAccount`, `page-link.ts:59` | No entrypoints |
| ARC-MSG-04 | unwired | One-shot RPC, `src/shared/rpc/rpc.ts:107`; frame-0 `tabTarget` | No composition |
| ARC-MSG-05 | unwired | `createTabViewProducer`, `src/background/tab-view/producer.ts:33` | No composition |
| ARC-MSG-15 | unwired | `hidden`, `fresh`, `extlink.ts:138` | No core entrypoint |
| ARC-MSG-06 | built | Popup window ID check, `sender-origin.ts:60`, reached from shipped background | None |
| ARC-MSG-11 | missing | None | No `ui.playingNow` |
| ARC-MSG-12 | partial | `ui.syncedChoices` from first run, `src/ui/backend/first-run-owner.ts:70` | No background route on a shipped path; Clear-all call unwired |
| ARC-MSG-16 | missing | None | No `ui.gather`, `ui.gatherUndo`, `ui.gathers`, `ui.gatherProgress` |
| ARC-MSG-07 | partial | Sender checks reached via `sender-origin.ts`; payload guards in `rpc.ts` | Contract guards live only in the unwired 2.0 RPC |
| ARC-MSG-08 | unwired | Contract deadlines, `rpc.ts`; Tabs 2 s | No composition |
| ARC-MSG-09 | unwired | Envelope `{ v, build, id, kind }`, `rpc.ts:89` | No composition |
| ARC-MSG-10 | partial | Page world logs nothing (guard) | No prefixed log in isolated world or background |
| ARC-MSG-13 | unwired | `VIEW_PUBLICATION_MS = 250` and targets, `src/background/tab-view/publication.ts:8`; `publication.bun-test.ts` | No composition |
| ARC-MSG-14 | partial | One `tab.hello`; Monitor pacing | `tab.videoChanged` missing; 5 s tab signal batching not built in core |
| ARC-MOD-19 | partial | Per-operation owner methods: claim, withdrawal, edits, `src/background/store/` | No single `Change` union or `Store.change(origin, change)` |
| ARC-MOD-20 | built | Origin from sender, `sender-origin.ts:51`, reached from shipped background | None |
| ARC-MOD-33 | unwired | `update-needed` refusals, `src/background/store/sync-join-execution.ts:65` | No composition |
| ARC-MOD-21 | partial | Migrations, private guard, `sync-codec.ts`, pacing, tombstone receive and expiry | SYNC-11 device-ID tie-break and sync-only document adoption open (status.md) |
| ARC-MOD-22 | partial | Native areas in `src/background/adapters/starting-owner-area.ts` | No shared fake sync area with write rates and reordering; no fake sync server |
| ARC-MOD-23 | partial | storage-writes guard, guard line 234 | Four frozen direct writes in `src/lib/storage.ts` |
| ARC-MOD-24 | partial | Running-cost guard bans `storage.onChanged` in `src/site`, `src/page` | Shipped 1.x content script reads storage; 2.0 popup and settings missing |
| ARC-MOD-25 | unwired | `ready()`, `store-lifecycle.ts:219`; `planLegacyStartup`, `src/background/store/legacy-startup.ts:107` | Store README: startup doesn't use it yet |
| ARC-MOD-26 | partial | entrypoints guard, guard line 221; `imports: false` | Four oversized 1.x entrypoints frozen; no thin 2.0 entrypoints |
| ARC-MOD-27 | partial | imports guard, guard line 48 | Five frozen 1.x violations |
| ARC-MOD-28 | built | env and page-console guards, zero admitted findings | None |
| ARC-MOD-29 | partial | Adjacent `*.bun-test.ts` | Not `*.test.ts`; 1.x `src/tests/`; most layer-3 tests in `tools/fixtures/` |
| ARC-MOD-30 | unwired | Channel-filter rule, `src/shared/rules/channel-filter.ts:5`; typed channels in `playlists.ts`; queue command in `routes/www.ts` | Not reached; 1.x copies still ship |

## 07 Quality

| ID | Status | Evidence | Gap |
|---|---|---|---|
| Q-TOOL-1 | built | `packageManager: bun@1.4.3`; CI `bun-version-file: package.json`, `.github/workflows/ci.yml:25` | None |
| Q-TOOL-2 | partial | Bun tests use `bun:test` | Vitest, `vitest.config.ts`, 17 Vitest files and React remain |
| Q-TOOL-3 | untested | Bun tests use `bun:test` APIs | No check bans Vitest-only APIs in Bun tests |
| Q-TOOL-4 | built | `tests/matchers.d.ts`, checked by `bun run compile` | None |
| Q-TOOL-5 | built | `imports: false`; guard rejects `#imports` and WXT globals, `tests/guards/checker.ts` | None |
| Q-TOOL-6 | partial | entrypoints guard | Four frozen 1.x entrypoints over 15 lines |
| Q-TOOL-7 | untested | No `mock.module` in `src`, `tests` or `tools` | No guard |
| Q-TOOL-8 | partial | env guard allows only literal reads in `platform.ts` | `src/shared/platform.ts` missing |
| Q-TOOL-9 | missing | None | No `platform` export or `Platform` type |
| Q-TOOL-10 | missing | None | No per-`Platform` tests |
| Q-TOOL-11 | built | `bunfig.toml` matches the spec; every `test:bun` run loads it | None |
| Q-TOOL-12 | partial | `@/*` maps to `src/*` | `$kit` maps to the pilot kit; `src/site/kit/index.ts` missing |
| Q-TOOL-13 | built | Four preloads in order; `tests/integration/preload-isolation.test.ts` | None |
| Q-TOOL-14 | built | `tests/setup/svelte.ts` matches; every Svelte test compiles through it | None |
| Q-TOOL-15 | built | `--isolate --conditions=browser`, `scripts/run-bun-tests.ts:35`; `tests/integration/bun-runner.test.ts` | None |
| Q-TOOL-16 | partial | `test`, `build`, `zip`, `build:beta` exist | No `test:browser`, Bun `test:coverage`, `typecheck`, `build:livecheck`, `check:*`, `watch:static`; `test` runs Vitest too |
| Q-TOOL-17 | missing | None | No `bunfig.browser.toml` |
| Q-TOOL-18 | partial | `typescript ~6.0.3` and `@typescript/native` 7; `svelte-check` only for the pilot | No `typecheck` script with `svelte-check --tsgo` |
| Q-TOOL-19 | partial | Svelte, Bits UI, happy-dom, Testing Library, Playwright, web-ext present | Vitest, React, Base UI, sonner, `idb`, `fake-indexeddb` remain; `@webext-core/isolated-element` and Puppeteer missing |
| Q-TOOL-20 | untested | `wxt.config.ts` and `build/page-link.ts` use Node APIs | `scripts/check-source-rebuild.mjs` isn't run by CI or a script |
| Q-TEST-1 | partial | `tests/` has `setup`, `guards`, `integration` | No `fakes/` or `browser/`; 1.x `src/tests/`; tests in `tools/fixtures/` |
| Q-TEST-2 | partial | Unit tests for channel filter, outcomes, copy, keys, tracker, codecs, migrations, `desired()`, `deriveStatus` | No `badgeFor`, no 1.4.5 snapshots, no KeyRecorder runtime test |
| Q-TEST-3 | partial | Route-table and outcome tests row by row | No badge-priority table |
| Q-TEST-4 | partial | Gateway tested through `run`, `watch`, `probe` over in-code specimens | No recorded `PagePort` over `fixtures/youtube/**` |
| Q-TEST-5 | partial | Gate `gateway-playlists` and `gateway-www-queue` cover order, fallback, writes once, guard, lanes, 409 retry | Music queue growth and move effects untested (not built) |
| Q-TEST-6 | missing | None | No fixture table test |
| Q-TEST-7 | partial | "unknown shapes repeated continuations … fail" | No derived renamed-keys fixture per job |
| Q-TEST-8 | missing | None | No static watch or node adapter |
| Q-TEST-9 | partial | Store, Registrar, Tabs, AddFlow and Monitor tested over fakes | Two-browser fake sync server and several R-numbered future checks absent |
| Q-TEST-10 | partial | Core and features in happy-dom over `servePage`, `tools/fixtures/items-www/harness.ts:71` | Only three features exist |
| Q-TEST-11 | partial | First-run UI over `src/ui/backend/scripted.ts` | No `fake.ts`; no popup or settings tests |
| Q-TEST-12 | missing | None | No cross-context add-flow integration test |
| Q-TEST-13 | untested | Few Bits UI tests | No check |
| Q-TEST-14 | partial | Per-module fakes in tests | No `tests/fakes/` with `sync-area`, `sync-server`, `tabs`, `i18n`, `scripting`, `access`, `transport`, `core` |
| Q-TEST-15 | untested | WXT fake used for storage and runtime | No check |
| Q-TEST-47 | missing | None | No running-cost soaks |
| Q-TEST-49 | partial | Layer-1 rules, `src/shared/rules/gather.bun-test.ts`; manual Gather, gate `gather-controller` | Trigger tests and the integration test missing |
| Q-TEST-16 | missing | None | No layer 4 |
| Q-TEST-17 | missing | None | No `tests/browser/pages/` |
| Q-TEST-18 | missing | None | No layer 4; item 10 rendering is owner-held |
| Q-TEST-19 | missing | None | No Firefox layer 4 |
| Q-TEST-20 | held | None | axe and rendering are owner-held |
| Q-TEST-48 | missing | None | No layer-4 soak or counting build |
| Q-TEST-50 | missing | None | No Gather layer 4 |
| Q-TEST-30 | partial | storage-writes, imports, env, page-console, entrypoints guards | `registry`, `fixtures-privacy`, `watchlist` guards missing |
| Q-TEST-31 | missing | None | No class-conflict test |
| Q-TEST-32 | built | `src/ui/components/components.bun-test.ts` "keeps showing the held state" | None |
| Q-TEST-33 | missing | None | No `$state` identity check |
| Q-TEST-44 | partial | `tools/fixtures/localization/check-catalogue.ts`; pseudo text | Literal-string lint and clipping tests missing |
| Q-TEST-45 | partial | Settings-file and picker-untick tests | No `commands`/`contextMenus` fakes; the features don't exist |
| Q-TEST-46 | built | running-cost guard, guard line 267 | None |
| Q-FIX-1 | missing | Specimens live in code, `src/page/gateway.specimens.ts` | No `fixtures/youtube/` or `fixtures/markup/` |
| Q-FIX-2 | missing | None | No fixture records |
| Q-FIX-3 | partial | `tools/fixtures/gateway-reads/provenance.md` | No provenance field per fixture |
| Q-FIX-4 | missing | None | Markup is inline in tests |
| Q-FIX-5 | missing | None | No minimum set; signed-in captures owner-held |
| Q-FIX-6 | missing | None | No live-check build or `tools/fixtures/import.ts` |
| Q-FIX-7 | missing | None | No import redaction |
| Q-FIX-8 | missing | None | No capture path |
| Q-FIX-9 | missing | None | No shape-outline refresh |
| Q-FIX-10 | missing | None | No fixture set |
| Q-FIX-11 | missing | None | No 90-day warning |
| Q-FIX-12 | missing | None | No privacy lint |
| Q-TEST-40 | missing | None | Coverage runs only for Vitest |
| Q-TEST-41 | missing | None | No `scripts/coverage.ts` |
| Q-TEST-42 | partial | Exclusions in `bunfig.toml` | No coverage gate uses them |
| Q-TEST-43 | untested | `bunfig.toml` has no `coverageThreshold` | No check |
| Q-WATCH-1 | external | Workflows hold store secrets only | Not audited beyond `ci.yml` and `release.yml` |
| Q-WATCH-2 | external | Developer practice | Can't verify |
| Q-WATCH-3 | partial | Watch IDs in `src/page/read-port.ts`, `src/page/gateway/port.ts` | No `src/shared/watchlist.ts` with sites, jobs, features and probes |
| Q-WATCH-4 | partial | `Gateway.probe()` and watch IDs | No needles |
| Q-WATCH-5 | missing | None | No needles |
| Q-WATCH-6 | missing | None | No flag reporting |
| Q-WATCH-7 | missing | None | No `watchlist` guard |
| Q-WATCH-8 | partial | Subset of IDs | Most rows absent |
| Q-WATCH-9 | missing | None | No `tools/watch/static.ts` |
| Q-WATCH-10 | missing | None | No artifact |
| Q-WATCH-11 | missing | None | No inconclusive state |
| Q-WATCH-35 | missing | None | No Gather watch |
| Q-WATCH-12 | missing | None | No `tools/watch/browser.ts` |
| Q-WATCH-13 | missing | None | No browser watch |
| Q-WATCH-14 | missing | None | No browser watch |
| Q-WATCH-15 | missing | None | No `report` job |
| Q-WATCH-16 | missing | None | No watch gate |
| Q-WATCH-17 | missing | None | No `watch.yml` or `RELEASING.md` |
| Q-WATCH-18 | missing | None | No livecheck mode |
| Q-WATCH-19 | missing | None | No `build/livecheck.ts` or `check-zip.ts` |
| Q-WATCH-20 | missing | None | Probe not imported |
| Q-WATCH-21 | missing | None | No live-check page; the run itself is owner-held |
| Q-WATCH-22 | missing | None | No `store/live-checks/` record |
| Q-WATCH-23 | unwired | `createMonitor`, `src/background/monitor/monitor.ts:30`; gateway signals | No composition |
| Q-WATCH-24 | partial | Gateway raises `missing`, `threw`, `timeout`, `unrecognised`, `fell-back`, `quiet-route-noisy`, `resolver-ambiguous` | Music signals missing; nothing delivers signals to the Monitor |
| Q-WATCH-25 | partial | `observeAnchor` thresholds, `src/background/monitor/derive.ts:9` | No feature-side anchor check |
| Q-WATCH-26 | partial | `item-unrecognised` raised, `src/site/core/items-www.ts:261` | Key fallback and failure toast not assembled |
| Q-WATCH-27 | unwired | Cannot-measure thresholds in Monitor; `monitor.bun-test.ts` | No composition |
| Q-WATCH-28 | partial | www quiet edits, gate `gateway-www-queue` | Music side missing |
| Q-WATCH-29 | built | `src/background/monitor/thresholds.ts`; `monitor.bun-test.ts` | None |
| Q-WATCH-30 | unwired | `succeeded`, `reloadPassed` inputs in Monitor | No composition |
| Q-WATCH-31 | partial | `BreakageSignal` shape in `src/shared/contracts/` | Gateway sets `clientVersion: null` and `pageType: "other"` |
| Q-WATCH-32 | built | `MAX_DEPTH = 6`, `MAX_BYTES = 2048`, `src/shared/contracts/shape-outline.ts:12`; `diagnostics.bun-test.ts` | None |
| Q-WATCH-33 | unwired | Signals through the owner's session port; private memory separate | No composition |
| Q-WATCH-34 | partial | Nothing uploads | No `console.warn` line per fallback in the isolated world |
| Q-PERF-1 | missing | None | No gzip measurement gate |
| Q-PERF-2 | missing | None | No lazy-piece budgets |
| Q-PERF-3 | missing | None | No timing harness |
| Q-PERF-4 | missing | None | Unmeasured |
| Q-PERF-5 | partial | All-off planner selects nothing | No layer-4 check |
| Q-PERF-6 | partial | `check-manifests.sh` asserts no `content_scripts` | `web_accessible_resources` unchecked; no `check:budget` |
| Q-PERF-7 | built | running-cost guard bans `setInterval` and alarms in `src/` | None |
| Q-PERF-8 | partial | Planner selects only enabled files | No browser check |
| Q-PERF-9 | partial | `ensure({ core })` injects page and core only | Unmeasured |
| Q-PERF-10 | partial | Scope disposal tests in happy-dom | No real-browser check |
| Q-PERF-11 | partial | Store and sync tests with sync off | No single zero-call test with the two allowed exceptions |
| Q-PERF-12 | missing | Card menu measured once, ad hoc (1.18 KB) | No gate, no `perf-budget.json` |
| Q-PERF-13 | missing | None | No gate |
| Q-PERF-14 | missing | None | No `popovers.js` |
| Q-PERF-15 | external | Records how the rows were set | Nothing to build |
| Q-PERF-16 | missing | None | No `perf-budget.json` |
| Q-PERF-17 | held | None | Music time budgets wait on measurement |
| Q-PERF-44 | external | Statement that budgets didn't change | Nothing to build |
| Q-PERF-18 | partial | Linking proved in the pilot build | Store build doesn't link |
| Q-PERF-19 | partial | Pilot asserts Bits UI only in `popovers` | No store-build check |
| Q-PERF-20 | partial | Site code uses shadow-root CSS | No check on the store build |
| Q-PERF-21 | partial | Pilot asserts no `.css` | No store-build check |
| Q-PERF-22 | untested | Hand-written toast, `src/site/kit/toaster/model.ts:24` | No size check |
| Q-PERF-23 | untested | One overlay and one layer host in `src/site/kit/` | No host-count check |
| Q-PERF-24 | missing | None | Shipped page code is a WXT content script |
| Q-PERF-25 | partial | running-cost guard limits kit and feature timers to Scope | No check for timer chains or `wxt:locationchange` |
| Q-PERF-26 | partial | `pointerover` and `focusin`, `src/site/features/queue-button/feature.ts:228` | No check bans `pointermove` |
| Q-PERF-27 | partial | running-cost guard rejects whole-document subtree observers | 1 ms handler budget unmeasured |
| Q-PERF-28 | missing | None | No load timing |
| Q-PERF-29 | missing | None | No first-use timing |
| Q-PERF-30 | missing | None | No in-use timing |
| Q-PERF-31 | missing | None | No extension-page budgets |
| Q-PERF-32 | missing | None | No 2.0 popup |
| Q-PERF-33 | missing | None | No 2.0 settings |
| Q-PERF-34 | missing | None | No 2.0 popup |
| Q-PERF-35 | missing | None | No extension-page build checks |
| Q-PERF-36 | missing | None | No `perf-budget.json` |
| Q-PERF-37 | missing | None | No `scripts/check-budget.ts` |
| Q-PERF-38 | missing | None | No `check:budget` |
| Q-PERF-39 | missing | None | No job summary table |
| Q-PERF-40 | missing | None | No timing test |
| Q-PERF-41 | missing | None | No soft time gate |
| Q-PERF-42 | missing | None | No `popovers.js` |
| Q-PERF-43 | held | None | Signed-in real-page run owner-held |
| Q-PERF-45 | missing | None | No running-cost measurement |
| Q-PERF-46 | missing | None | No idle soak |
| Q-PERF-47 | missing | None | No playback soak |
| Q-PERF-48 | missing | None | No long-task check |
| Q-PERF-49 | partial | running-cost guard covers the subtree-observer part | Per-callback limits unmeasured |
| Q-PERF-50 | partial | Toaster skips work while `document.hidden`, `src/site/kit/toaster/render.ts:26` | No hidden-tab check |
| Q-PERF-51 | missing | None | No wake counting |
| Q-PERF-52 | missing | None | No per-wake check |
| Q-PERF-53 | partial | running-cost guard bans intervals and alarms | 25 s one-shot cap unchecked |
| Q-PERF-54 | missing | None | No write counting |
| Q-PERF-55 | missing | None | No request counting |
| Q-PERF-56 | missing | None | No memory check |
| Q-PERF-57 | partial | Registrar and Tabs skip discarded and frozen tabs, with tests | No soak |
| Q-PERF-58 | missing | None | Automatic gathering not built |
| Q-PERF-65 | missing | None | No measurement |
| Q-PERF-66 | missing | None | No measurement |
| Q-PERF-67 | external | Statement that budgets didn't change | Nothing to build |
| Q-PERF-59 | built | running-cost guard runs in every `test:bun` | None |
| Q-PERF-60 | missing | None | No `scripts/check-runtime.ts` |
| Q-PERF-61 | missing | None | No soaks |
| Q-PERF-62 | missing | None | No count gates |
| Q-PERF-63 | missing | None | No `RELEASING.md` session |
| Q-PERF-64 | missing | None | No live-check page |
| Q-CI-1 | partial | `ci.yml` `build` job: compile, tests, build, zip, `check-manifests.sh`; `svelte-pilot` job | No `check`, `browser` or `sources` jobs; no budget step |
| Q-CI-2 | partial | No `broker` job | Vitest and `jq` checks still run |
| Q-CI-3 | partial | `scripts/check-manifests.sh` checks MV3, version, no `identity`, no `content_scripts`, gecko ID, `update_url` | Asserts a www-only host on Firefox, against this table; most fields unchecked |
| Q-CI-19 | missing | None | No `check:runtime` |
| Q-CI-4 | missing | None | No `watch.yml` |
| Q-CI-5 | missing | None | No watch jobs |
| Q-CI-6 | partial | `release.yml` builds once and later jobs use its artifacts | The gates themselves don't exist |
| Q-CI-7 | missing | None | No `budget`, `zip`, `browser` or `manifest` gates |
| Q-CI-8 | missing | None | No `watch` gate |
| Q-CI-9 | missing | None | No `live-check-record` gate |
| Q-CI-18 | missing | None | No `RELEASING.md` |
| Q-CI-10 | external | Branch process | Not verified |
| Q-CI-11 | external | Review discipline | Not verified |
| Q-CI-12 | external | `scripts/release-meta.sh:108` classifies `kind=patch` | Not verified that only hotfixes are patches |
| Q-CI-13 | missing | None | No `hotfix-freeze` |
| Q-CI-14 | missing | None | Its gates don't exist |
| Q-CI-15 | external | `release.yml:306` uses `DEFAULT_PUBLISH` for patches and never sets `skipReview` | Workflow config, not tested |
| Q-CI-16 | external | Manual follow-up | Not verified |
| Q-CI-17 | external | Store dashboards | Not verified |
| Q-TOOL-30 | unwired | Development builds export full namespaces, `build/page-link.ts:115`; pilot `check-development.mjs` | Pilot only |
| Q-TOOL-31 | external | Measurement practice | Not verified |
| Q-TOOL-32 | missing | None | Store `wxt.config.ts` has no Svelte setup |
| Q-TOOL-33 | partial | Startup reconcile and `ppt:retire` exist | Unwired; native behavior held |
| Q-TOOL-36 | held | None | Dev-reload behavior is a native check |
| Q-TOOL-34 | untested | Bits UI tests are few | No check |
| Q-TOOL-35 | missing | None | No compile cache; the last full run took 40 minutes serially (`full-run-b7fce832.md`) |

## Work to do

Units are ordered so that each one builds on the ones before it. Sizes: S is under a day, M is a few days, L is a week or more.

1. **W1. 2.0 manifest and build config.** IDs: ARC-MAN-01, 02, 05, 06, 07, 19 (manifest half), 20 (manifest half), 21; ARC-ACC-19, 62; Q-TOOL-32. Files: `wxt.config.ts`, new `build/manifest.ts`, `src/public/_locales/en/messages.json` (`extName`, `extShortName`, `extDescription`, `actionTitle`, command descriptions), `src/public/brand/` (`store-128.png`, `icon-96.png`). Swap `@wxt-dev/module-react` and `auto-icons` for `@wxt-dev/module-svelte`, and set `publicDir`. Depends on Q1. Size M.
2. **W2. `check:manifest`, `check:zip` and CI jobs.** IDs: Q-CI-1, 2, 3, 7 (manifest, zip), Q-PERF-6, ARC-MOD-07, Q-WATCH-19 (zip half). Files: new `scripts/check-manifest.ts` replacing `scripts/check-manifests.sh`, new `scripts/check-zip.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`. Depends on W1. Size M.
3. **W3. Platform module.** IDs: ARC-MOD-04, Q-TOOL-8, 9, 10. Files: new `src/shared/platform.ts`; callers that differ per browser take `Platform`. Depends on nothing. Size S.
4. **W4. Page entrypoints and the page start.** IDs: ARC-ACC-01, 05, 06, 08, 10, 11, 13 to 18, 32 to 42, 46, 50, 71; ARC-MAN-10, 17; ARC-MOD-01, 02, 08, 10; ARC-MSG-01 to 03, 15; Q-PERF-24. Files: new `src/page/start.ts` (wraps `createLiveGateway` and `servePage` with `createDomPageChannel`), `src/entrypoints/page-www.ts`, `page-music.ts` (`defineUnlistedScript`, at most 15 lines). Depends on W1, W3. Size M.
5. **W5. SiteCore assembly and core entrypoints.** IDs: ARC-ACC-47, 70; ARC-MOD-05, 16, 31, 32; ARC-REG-05, 06, 07, 08; ARC-MSG-14; Q-WATCH-26, 34; ARC-MSG-10. Files: new `src/site/core/core.ts` that installs `globalThis.__pp.core` and composes ExtLink, PageLink, FeatureHost, Scope, Items, Pointer, Keys and Notice; `ctx.run`, `can`, `watch`, `add`, `undo`, `change`, `progress`, `popovers`; `src/entrypoints/core-www.ts`, `core-music.ts`. Depends on W4. Size L.
6. **W6. Kit entrypoints, `definePageFeature` and Svelte linking in the store build.** IDs: ARC-MOD-11 to 15; ARC-REG-04; Q-PERF-18, 19, 21; Q-TOOL-12, 30. Files: `src/site/kit/index.ts` (`$kit`), `src/site/feature.ts`, `src/entrypoints/kit-*.ts`, `feature-card-menu.ts`, `feature-queue-button.ts`, `wxt.config.ts` hooks through `build/page-link.ts`, `tsconfig.json` `$kit` path. Depends on W1, W5. Size M.
7. **W7. Background boot and composition.** IDs: ARC-ACC-02, 03, 09, 43, 49, 52 to 56, 63, 64, 66; ARC-MAN-04, 08, 09, 11 to 15, 18, 22, 24, 25; ARC-MOD-03, 25, 26, 33, 34, 37, 39; ARC-MSG-04 to 09, 13; ARC-REG-03, 10, 11; Q-WATCH-23, 27, 30, 33. Files: new `src/background/boot.ts`, `src/background/adapters/browser.ts`, a 2.0 `src/entrypoints/background.ts` (at most 15 lines), a router for `tab.*` and `ui.*` that binds Store lifecycle, Registrar, Tabs, AddFlow, Playlists, Accounts, Monitor and TabView publication. Add the one `runtime.onInstalled` listener. Retire `src/lib/*` and its frozen guard entries. Depends on W4 to W6. Size L.
8. **W8. Single `Store` interface.** IDs: ARC-MOD-19, 20 (2.0 router half), 21, 22, 23, 24. Files: `src/background/store/` (a `Store` with `ready`, `read`, `change(origin, Change)`, `subscribe`, `clearAll` over today's per-operation owners, or a recorded decision to keep them), `src/lib/storage.ts` removal. Close the two sync gaps in `status.md`. Depends on Q2. Size L.
9. **W9. YouTube Music queue, likes, library and navigate.** IDs: ARC-ACC-12 (music rows), 21 to 31, 44 (music half); Q-WATCH-24 (music signals), 28; Q-TEST-5 (music effects). Files: `src/page/adapters/live-music.ts` (`MusicPort`: `menuItem`, `queue`, `drop`, `serviceEndpoint`, `navigationEndpoint`), `src/page/routes/music.ts`, a music queue module beside `src/page/gateway/www-queue.ts`, a new fixture gate. Depends on W4. Size L.
10. **W10. Playing now, keys from any tab and the browser menu.** IDs: ARC-ACC-04, 68, 69; ARC-MAN-19, 20, 23; ARC-MSG-11; Q-TEST-45. Files: new `src/background/commands/`, `src/background/menus/`, a music-tab picker in `src/background/tabs/`, `ui.playingNow` and `ui.commandKeys` routes, `commands` and `contextMenus` fakes. Depends on W7, W9. Size M.
11. **W11. Badge.** IDs: ARC-MOD-38; ARC-ACC-61 (toolbar "!"); Q-TEST-2 (`badgeFor`), Q-TEST-3 (badge table). Files: new `src/background/badge/` with a pure `badgeFor` and its table test, `tab.videoChanged`. Depends on W7. Size M.
12. **W12. 2.0 popup and settings pages.** IDs: ARC-ACC-51, 58, 60, 61 (popup, settings); ARC-MAN-03, 16; ARC-MOD-17, 24, 35, 36; ARC-MSG-12; Q-PERF-32 to 34; Q-TEST-11, 44. Files: `src/ui/popup/`, `src/ui/settings/`, `src/ui/backend/fake.ts`, `src/entrypoints/popup/`, `options/`, `onboarding/`, `popovers.ts`. Depends on W7, Q3. Size L.
13. **W13. Gather automatic triggers and routes.** IDs: ARC-ACC-57, 72, 73; ARC-MOD-40, 41; ARC-MSG-16; Q-TEST-49; Q-PERF-58, 65, 66. Files: `src/background/gather/`, Tabs registry start-hidden facts, `ui.gather*` routes. Depends on W7. Size L.
14. **W14. Registry guard and `perf-budget.json`.** IDs: ARC-REG-01, 02, 09; Q-TEST-30 (registry); Q-PERF-16, 36. Files: `tests/guards/registry.test.ts`, `perf-budget.json`. Depends on W6. Size S.
15. **W15. `check:budget` and `check:runtime`.** IDs: Q-PERF-1, 2, 12 to 14, 37 to 39, 60; Q-CI-7 (budget), Q-CI-19; ARC-MOD-09, 18; Q-PERF-42. Files: `scripts/check-budget.ts`, `scripts/check-runtime.ts`, `ci.yml`, `release.yml`. Depends on W6, W14. Size M.
16. **W16. Recorded fixtures and the privacy lint.** IDs: Q-FIX-1 to 5, 7, 9 to 12; Q-TEST-4, 6, 7; Q-TEST-30 (fixtures-privacy). Files: `fixtures/youtube/<job>/<variant>.json` migrated from `src/page/gateway.specimens.ts` and `tools/fixtures/*/specimens.ts`, a recorded `PagePort` adapter, `tests/guards/fixtures-privacy.test.ts`. Depends on nothing for synthetic fixtures; captured ones depend on W19. Size M.
17. **W17. Watch list, static watch and `watch.yml`.** IDs: ARC-ACC-16; Q-WATCH-3 to 11, 15 to 17, 35; Q-TEST-8, Q-TEST-30 (watchlist); Q-CI-4, 5, 8. Files: `src/shared/watchlist.ts`, `tools/watch/needles.ts`, `tools/watch/static.ts`, a node `PagePort` adapter, `.github/workflows/watch.yml`. Depends on W4. Size L.
18. **W18. Layer 4, the browser watch and soaks.** IDs: Q-TEST-16 to 19, 48, 50; Q-TOOL-17; Q-WATCH-12 to 14; Q-PERF-3 to 5, 8 to 10, 28 to 31, 40, 41, 45 to 57, 61, 62; Q-CI-1 (`browser` job). Files: `bunfig.browser.toml`, `tests/browser/`, `tools/watch/browser.ts`, counting build flag. Depends on W7, W12, W15. Size L.
19. **W19. Live-check build and fixture import.** IDs: ARC-MOD-06; Q-WATCH-18 to 22; Q-FIX-6, 8; Q-PERF-64; Q-CI-9, 14. Files: `build/livecheck.ts`, `src/livecheck/`, the recording `PagePort`, `tools/fixtures/import.ts`, `store/live-checks/`. Depends on W4, W16. Size L. Running it signed in is owner-held.
20. **W20. Layer-3 soaks, fakes and the integration flow.** IDs: Q-TEST-1, 9, 12, 14, 47; Q-PERF-11. Files: `tests/fakes/` (`sync-area`, `sync-server`, `tabs`, `i18n`, `scripting`, `access`, `transport`, `core`), `tests/integration/add-flow.test.ts`, soak tests. Depends on W7. Size L.
21. **W21. Coverage gate.** IDs: Q-TEST-40 to 43. Files: `scripts/coverage.ts`, `test:coverage` script. Depends on Q2. Size S.
22. **W22. Toolchain cleanup.** IDs: Q-TOOL-2, 3, 7, 16, 18, 19, 20, 35; Q-CI-2; ARC-MOD-29, 30. Files: `package.json` scripts and dependencies, `typecheck` with `svelte-check --tsgo`, removal of Vitest and React once W12 replaces the 1.x pages, rename `*.bun-test.ts` to `*.test.ts`, run `check-source-rebuild.mjs` in CI, the Svelte compile cache. Add `@webext-core/isolated-element` (already flagged in `status.md`). Depends on W12 and Q2. Size M.
23. **W23. UI and kit guard tests.** IDs: Q-TEST-31, 33. Files: `tests/guards/` or a lint rule. Depends on nothing. Size S.
24. **W24. Release process files and hotfix gates.** IDs: Q-CI-9, 13, 14, 18; Q-WATCH-17; Q-PERF-63. Files: `RELEASING.md`, `SOURCE_CODE_REVIEW.md`, a `hotfix-freeze` job in `release.yml`. Depends on W2, W17, W19. Size M.

## Questions

1. **Q1. The Firefox host permission.** ARC-MAN-01's table and Q-CI-3 say the Firefox build keeps `*://*.youtube.com/*`, the pattern 1.4.5 was granted. Today's `wxt.config.ts` and `scripts/check-manifests.sh` ship and assert `https://www.youtube.com/*` on both builds. Is the narrower 1.5.0 host a deliberate change, or must W1 restore the spec's host? The spec's reason is that narrowing could strip every upgrader's access once Firefox revokes undeclared origins (Bug 2022704). This blocks W1 and W2.
2. **Q2. The `bun:test` file naming and the Vitest cutover.** ARC-MOD-29 and Q-TEST-1 want `*.test.ts`. The migration uses `*.bun-test.ts` so Vitest doesn't collect them. When does the owner want the Vitest suite retired: with the 2.0 pages (W12), or now with the 1.x tests rewritten? This blocks W21 and W22, and W8's removal of `src/lib/storage.ts`.
3. **Q3. Where the 2.0 store interface lands.** ARC-MOD-19 specifies one `Change` union behind `Store.change(origin, change)`. The build has grown per-operation owners (claim, withdrawal, filter writer, settings import, sync join), and `status.md` notes that write results have two shapes. Should W8 wrap them in the spec's five-member interface, or should the spec be amended to the per-operation design? This blocks W8 and the router half of W7.
4. **Q4. The order of activation.** Each module README says "activation is held" and "privacy approval is pending". Wiring W4 and W7 into the shipped entrypoints replaces 1.x. Should the 2.0 entrypoints land beside 1.x behind a build mode first, or replace 1.x in one change? This blocks W4, W7 and W12.
