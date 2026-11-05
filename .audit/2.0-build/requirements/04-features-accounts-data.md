# Requirement pass: 04 Features, accounts and data

Chapter `.scratch/rebuild/spec/04-features-accounts-data.md` at `f7898dcc8` on `2.0/compose-units`. Inspect only. One test file was run to confirm a claim (`src/background/monitor/monitor.bun-test.ts`, 31 pass).

## Summary

The chapter defines 226 IDs. None are marked superseded, runner-up or historical, so all are in scope. Statuses: **built 3**, **untested 11**, **partial 57**, **unwired 115**, **missing 32**, **external 4**, **held 4**. The deciding fact is that the shipped extension is still the 1.x build. `src/entrypoints/background.ts`, the React popup and options pages and `youtube.content.tsx` import `@/lib/*` and `@/components/*`. An import walk from the four entrypoints reaches only one 2.0 module, `src/background/adapters/sender-origin.ts`, plus `src/shared/model/*` through `src/lib/session.ts`. No composition root starts the Store, Registrar, Tabs, Monitor, sync driver, routers, site core or onboarding UI. Their READMEs say so ("No entrypoint imports or starts this Registrar yet", "Production startup does not install it"). `wxt.config.ts` is the 1.x manifest: name "YouTube Playlist Tools", only `https://www.youtube.com/*`, no optional permissions, no `commands`. So most of the 2.0 work exists as tested library code and is **unwired**. The three **built** rows are FT-22 (a static guard over all of `src`) and ACC-01/ACC-02, which the shipped interim code in `src/page/youtube-session.ts` already meets. Four areas have no code at all: the toolbar badge, the 2.0 popup and Settings pages (including Diagnostics), watch-progress persistence, and the Discard and Switch account paths. Every fixture test that proves a module builds its own harness, so none of them shows the extension reaching the module.

## Requirements

| ID | Status | Evidence | Gap |
|---|---|---|---|
| FT-01 | unwired | `src/shared/features/registry.ts` (12 `FeatureDef`s); `registry.bun-test.ts`, fixture `feature-registry` | No startup imports the registry; shipped manifest and UI are 1.x |
| FT-56 | unwired | Kebab IDs in `src/shared/contracts/vocabulary.ts`, `registry.ts`; `registry.bun-test.ts` | Deep links need the 2.0 Settings page, which doesn't exist |
| FT-02 | unwired | `src/shared/model/defaults.ts:3` all `on:false`; `model.bun-test.ts` | Shipped 1.x store used instead |
| FT-03 | unwired | `src/background/store/legacy.ts:70` `convertLegacy`, `legacy-startup.ts:107`; `legacy.bun-test.ts`; sync join `sync-join-execution.ts` | Neither runs at startup |
| FT-04 | unwired | `src/shared/keys/bindings.ts:94` `applyPresets`, `feature-settings.ts:17`; fixture `feature-switches/owner.bun-test.ts:167` | No shipped caller; "No key: … used by …" row copy has no UI |
| FT-05 | unwired | `defaults.ts:5` theme/undoKey, `src/ui/lib/theme.ts:4`, `src/site/core/keys.ts`; `site/core/keys.bun-test.ts` | No 2.0 page or site core loads; Settings › Appearance/Everywhere rows missing |
| FT-06 | unwired | `musicSection` in `defaults.ts`, gate in `registration.ts:72` `desired`; `feature-switches/owner.bun-test.ts:36` | Popup/Settings section switch UI missing |
| FT-07 | untested | Every behaviour has a stored option in `src/shared/model/types.ts` | Principle; no single check, relies on the other IDs |
| FT-08 | partial | UI-only writes enforced in `src/background/adapters/sender-origin.ts`, `feature-switches/owner.bun-test.ts:267` | 2.0 popup and Settings don't exist; only first run (unwired) can switch |
| FT-09 | unwired | Switches live in `doc:settings` (`types.ts`, `feature-settings.ts`) | Not reached by shipped code |
| FT-10 | unwired | `src/background/registrar/registrar.ts:55` injects into open tabs; `registrar.bun-test.ts` | No startup owner starts the Registrar |
| FT-11 | unwired | `src/background/store/feature-settings-progress.ts`; `feature-switches/owner.bun-test.ts:143,154` | Not reached |
| FT-12 | unwired | `feature-settings.ts:17` refusals; `feature-switches/owner.bun-test.ts:51`, `boundaries.bun-test.ts:93` | Not reached; popup/Settings display missing |
| FT-13 | partial | `registration.ts:72` registers nothing without consent/access; strings in `src/public/_locales/en/messages.json:156,159` | No code derives held reasons; popup/Settings held rows missing |
| FT-14 | missing | — | No 2.0 Settings page or popup exists in `src/ui` |
| FT-15 | unwired | `registration.ts:72` desired set; manifest has no `content_scripts` (`wxt.config.ts`) | 2.0 registrations not active; Q-PERF-5/6 never run (held) |
| FT-16 | unwired | `registrar.ts` `ensure()`, `src/background/tabs/tabs.ts` serve injection; `tabs.bun-test.ts` | No popup/Settings caller; no bundles |
| FT-17 | partial | `registry.ts` `filesFor`; `registry.bun-test.ts` | Production site-core/kit/feature bundle entrypoints don't exist (registry README) |
| FT-18 | partial | `src/site/core/*` (items, pointer, keys, feature-host); `site/core/*.bun-test.ts` | Not bundled as page/core entrypoints; not registered |
| FT-19 | unwired | `src/site/core/scope.ts`, `feature-host.ts:45`, registrar unregister; `scope.bun-test.ts`, `feature-host.bun-test.ts` | Not reached; Q-PERF-10 never run |
| FT-20 | unwired | `registration.ts:72` `desired()`; `registration.bun-test.ts` | Registrar not started |
| FT-21 | unwired | `sync-join-lookup.ts:78`, Clear-all synced path; guard `tests/guards/checker.ts` storage-writes rule | Q-PERF-11 real-browser count never run (held) |
| FT-22 | built | Guard `tests/guards/checker.ts:291` bans `setInterval`/`alarms` across `src`; `architecture.test.ts:269` | — |
| FT-59 | partial | `registrar.ts` `ensure()` | No `commands` in manifest, no `commands.onCommand` or `contextMenus` handler |
| FT-60 | partial | Request in click: `src/ui/backend/browser.ts`; release `src/background/adapters/shared-settings.ts:11`; `feature-switches/owner.bun-test.ts:80,96` | No menu entry created (`contextMenus.create` absent); held "Allow" UI missing |
| FT-61 | partial | Clock ban guard `checker.ts:291` | Running-cost budgets (07 §7.6.8) never measured (held: real browser) |
| FT-62 | partial | Tabs skip discarded/frozen (`tabs.ts`, `registrar.ts`); toaster waits while hidden `src/site/kit/toaster/model.ts:242` | Unwired; Q-PERF-57 never run |
| FT-63 | unwired | Gather page entry in `registry.ts` (www core on watch/live for triggers 2/3); `registry.bun-test.ts` | Registrar not started; triggers themselves missing |
| FT-64 | missing | — | Gather automatic triggers YT-GT-22 to 29 not started (`status.md`) |
| FT-23 | unwired | Per-feature `feedback` in `defaults.ts`; `src/shared/copy/toast.bun-test.ts` | Not reached |
| FT-24 | unwired | `src/site/kit/feedback/index.ts`, `src/shared/rules/outcomes.ts`; `outcomes.bun-test.ts`, fixture `add-feedback` | Not reached |
| FT-25 | unwired | `src/shared/rules/outcomes.ts`; `outcomes.bun-test.ts`, fixture `add-feedback` | Not reached; HEALTH-11 toast missing |
| FT-26 | unwired | Picker row and button states in `src/ui/picker/*`, `src/site/features/queue-button`; `picker.bun-test.ts` | Not reached |
| FT-27 | unwired | `legacy.ts:70` feedback only for literal `true` (store README); `legacy.bun-test.ts` | Migration not run at startup |
| FT-28 | unwired | `device.consent` in `types.ts`, `CONSENT_VERSION` `src/shared/model/documents.ts:6` | Shipped 1.x uses `sessionConsent` |
| FT-29 | unwired | `consent-withdrawal.ts:34` `isAgreement`, `key-settings.ts:22` checks `v`; `consent-withdrawal.bun-test.ts` | Not reached |
| FT-30 | partial | Registrar/tabs/first-run gate on consent (`registration.ts`, `ui-playlists/index.ts:98`) | Badge "!" and popup "Waiting for your OK"/Review missing; unwired |
| FT-31 | unwired | First-run reads only (`sync-join-lookup.ts:78`); `first-run.bun-test.ts:123` | Not reached |
| FT-32 | partial | First-run Agree `consent-agreement.ts:189`, `router/first-run.ts:19`; `boundaries.bun-test.ts:93` | Upgrade-note Agree and "Before this feature can run" dialog/sheet UIs missing; unwired |
| FT-33 | unwired | Own `device.consent` only; Firefox declaration `data_collection_permissions: none` in `wxt.config.ts` | 2.0 consent not reached |
| FT-34 | unwired | Per-browser `device` never syncs (`sync-codec.ts` encodes only `doc:*`) | Not reached |
| FT-35 | partial | `consent-withdrawal.ts:86`, retained work `consent-recovery.ts`; `consent-withdrawal.bun-test.ts`, `boundaries.bun-test.ts:27` | Privacy & data section and confirmation UI missing; unwired |
| FT-36 | partial | Version constant `documents.ts:6` | Popup/note "handles your data in a new way" copy missing; no CI check of the constant (REL-CON-19) found in `.github` or `scripts` |
| FT-37 | unwired | Private UI may agree/withdraw (`boundaries.bun-test.ts:111`) | Not reached |
| FT-38 | unwired | `src/background/router/clear-all.ts:26`; fixture `clear-all/owner.bun-test.ts:153` | Not reached |
| FT-39 | external | Disclosure text owned by 08 REL-CON-12; rendered in `first-run.bun-test.ts:263` "cookie line still provisional" | Cookie line awaits ticket 25 (held: live checks) |
| FT-40 | unwired | `src/ui/onboarding/FirstRun.svelte`, `store-lifecycle.ts:489` `openFirstRun`; `ui/onboarding/first-run.bun-test.ts` | No first-run HTML entrypoint; nothing opens it |
| FT-41 | unwired | `FirstRun.svelte`; `first-run.bun-test.ts:284` | No entrypoint |
| FT-42 | external | Copy owned by 05 UI-ONB and 08 REL-CON-15 | Out of this chapter |
| FT-43 | partial | Migration planner `legacy-startup.ts:107`, `device.upgradeNote`, claim held on note `claim-notice.ts:13` | Upgrade-note page, its Agree and popup Review banner missing |
| FT-44 | partial | Music access request in click (`first-run.bun-test.ts:306`, `feature-switches/owner.bun-test.ts:51`) | Shipped manifest lacks music host/optional permissions; Settings/popup missing |
| FT-45 | unwired | `src/background/adapters/registrar.ts:104` `permissions.onAdded/onRemoved`; `adapters/registrar.bun-test.ts` | Registrar not started |
| FT-46 | partial | Held registration in `registration.ts`; strings `messages.json:111,120` | Badge and popup/Settings banners missing |
| FT-47 | missing | — | Needs badge and Settings card; neither exists |
| FT-48 | unwired | Access read before consent in first-run backend (`src/ui/backend/browser.ts`) | Upgrade note page missing |
| FT-49 | unwired | Site access is native, never stored; held derivation partial | Held display missing |
| FT-50 | unwired | `browser.ts` requests before await; `feature-switches/owner.bun-test.ts:256` | Not reached |
| FT-51 | unwired | `registrar.ts` reconcile on access change; `registrar.bun-test.ts` | Registrar not started |
| FT-52 | partial | `feature-settings.ts:17` `limitedMusic`; `feature-switches/owner.bun-test.ts:51,66` | In-place popup/Settings messages missing |
| FT-53 | unwired | `adapters/registrar.ts:99` `addHostAccessRequest` | PROVISIONAL; not started; native behaviour held |
| FT-54 | missing | Cache read `src/background/playlists/playlists.ts:65` | Popup/Settings "saved data from" view and disabled Check now don't exist |
| FT-55 | unwired | `src/background/tabs/tabs.ts` `serve` skips discarded/frozen, no wake; `tabs.bun-test.ts`, fixture `tabs` | Not reached |
| FT-57 | missing | — | No badge code anywhere (`setBadge*` absent) |
| FT-58 | missing | — | No badge code |
| ACC-01 | built | Shipped `src/page/youtube-session.ts:79` reads whole `DATASYNC_ID`; 2.0 `src/page/gateway/account.ts:12`; `src/page/youtube-session.test.ts:302` | — |
| ACC-02 | built | Shipped `youtube-session.ts:79-85` requires `LOGGED_IN === true`; `youtube-session.test.ts:316` | — |
| ACC-03 | partial | Shipped key computed in the MAIN-world job `youtube-session.ts:75`; 2.0 isolated-core `src/site/core/page-link.ts:63`, `page-link.bun-test.ts` | Isolated-core version unwired; PROVISIONAL L7 (held: live checks) |
| ACC-04 | missing | — | No `channel_switcher` or Sign in link anywhere in `src` |
| ACC-05 | held | No special case in code (by design) | Needs live YouTube checks for channel-less and delegated accounts |
| ACC-06 | unwired | `Setup` vs `Settings` split in `src/shared/model/types.ts`, `defaults.ts:3,34`; `model.bun-test.ts` | Not reached |
| ACC-07 | unwired | `src/shared/model/account-cache.ts`; sync encodes only `doc:*` (`sync-codec.ts`) | Not reached |
| ACC-08 | unwired | `src/background/store/accounts.ts:71,143`; `background/accounts` creates nothing for new accounts; `accounts.bun-test.ts:181` | Not reached |
| ACC-09 | partial | Hint and "now saves to" strings `messages.json:509,528`; picker choose mode `src/shared/picker/model.svelte.ts`; `picker/model.bun-test.ts` | No site feature for playlist shortcuts or quick-save; unwired |
| ACC-10 | unwired | `watchLaterOnEveryAccount` in `decodeSettings.ts:11`; `accounts.bun-test.ts:348` | Not reached |
| ACC-11 | untested | No copy operation exists in `src/background/store` | Negative rule; nothing asserts it |
| ACC-12 | unwired | `src/background/store/tab-projection.ts`; `tab-projection.bun-test.ts:69,78` | Not reached |
| ACC-13 | unwired | `src/background/tabs/tabs.ts` `accountInView`; `tabs.bun-test.ts:124,137` | No popup consumer |
| ACC-14 | missing | — | No 2.0 Settings page |
| ACC-15 | missing | — | No popup header or Settings top-bar setup picker |
| ACC-16 | partial | `tabs.ts` `serve`; `tabs.bun-test.ts` | "isn't open in any tab" copy and popup missing |
| ACC-17 | missing | — | No popup account header |
| ACC-18 | unwired | `src/background/store/account-label.ts:11,49`, `src/background/accounts/accounts.ts`; `account-label-owner.bun-test.ts`, fixture `accounts-label` | Not reached |
| ACC-19 | unwired | Per-load `tab.hello` in `page-link.ts`; Tabs records reset on hello | Popup-follows-tab needs the missing popup |
| ACC-20 | partial | No storage for a new account (`background/accounts/README.md`) | Popup "Nothing is saved for {Account}" missing |
| ACC-21 | partial | Sign-in toasts `messages.json:602`; signed-out refusal in `youtube-session.ts:142` (shipped) and 2.0 gateway | Popup "not signed in" state missing; 2.0 path unwired |
| ACC-22 | partial | Shipped latch `youtube-session.ts:138-150`, `youtube-session.test.ts:338-362`; 2.0 gateway guard; copy `messages.json:717` | Shipped toast lacks the 2.0 copy and **Reload**; popup banner missing |
| ACC-23 | partial | Shipped returns `unavailable` without both values (`youtube-session.ts:83`) | HEALTH-09 health signal unwired (Monitor not started) |
| ACC-24 | missing | — | No Settings › Accounts |
| ACC-25 | partial | `src/background/store/account-removal-execution.ts:261`; `account-removal-execution.bun-test.ts` | Confirmation dialog and Remove control missing; unwired |
| ACC-26 | unwired | Private refusal in removal admission; fixture `account-removal-admission` | Not reached |
| ACC-27 | untested | No code expires setups | Negative rule; nothing asserts it |
| ACC-28 | unwired | `src/background/store/legacy.ts:70`, `legacy-startup.ts:107`; `legacy.bun-test.ts` | Migration not run at startup |
| ACC-29 | unwired | `unclaimed` is local-only (`decodeUnclaimed.ts`, never in `sync-codec.ts`) | Not reached |
| ACC-30 | partial | `local-claim-writer.ts:141` `executeLocalClaim`, owner `claim()` in `local-filter-writer.ts:340` | No caller triggers a claim on account seen; production ownership lookup host missing; README: fixture "does not establish production claim safety" |
| ACC-31 | unwired | `accounts.ts:200` `mergeUnclaimedChoices`; `accounts.bun-test.ts:311-375` | Trigger missing (ACC-30) |
| ACC-32 | partial | `src/background/store/claim-notice.ts`; `claim-notice.bun-test.ts` | Popup banner row 12 and note display missing |
| ACC-33 | missing | — | No unmatched copy, Switch account or Discard path |
| ACC-34 | missing | — | Upgrade note page missing |
| ACC-35 | held | — | Ticket 25 live check on collaborative playlists |
| ACC-48 | partial | `interim-recovery-review.ts:276`, `interim-recovery-execution.ts`; fixture `interim-recovery-review` | Recovery section UI missing; unwired |
| ACC-46 | unwired | Session budget in `local-claim-writer.ts`; `local-claim-writer.bun-test.ts:103` | Claim trigger missing |
| ACC-36 | untested | `wxt.config.ts` sets no `incognito` key | No manifest test asserts it |
| ACC-37 | unwired | Private skips across `playlists.ts`, `tabs.ts`, `add-flow`; `playlists.bun-test.ts:96`, `tabs.bun-test.ts:33`, `private-skip.bun-test.ts` | Not reached |
| ACC-38 | unwired | `shared-options/owner.bun-test.ts:181`, `boundaries.bun-test.ts:111`; tooltip `messages.json:2689` | Not reached; picker pin tooltip not rendered by a shipped page |
| ACC-39 | unwired | `tabs.ts` partitions; `tab-projection/native.bun-test.ts:32`, `ui-playlists/router.bun-test.ts:20` | Not reached |
| ACC-40 | missing | — | Private-window popup copy and disabled setup controls missing |
| ACC-41 | untested | No container ID is stored anywhere (`types.ts`) | Nothing asserts it |
| ACC-47 | partial | Private gather in memory: fixture `gather-controller/gather.bun-test.ts:154`; never counts `shared/rules/gather.bun-test.ts:332`; copy `messages.json:2692` | Gather adapter unwired; automatic gathering missing |
| ACC-42 | unwired | Music `page-link.ts` same digest; `items-music.ts` | Music site core not bundled or registered |
| ACC-43 | unwired | Per-tab account in `tabs.ts`, `tab-projection.ts` | Not reached |
| ACC-44 | unwired | `musicSave` in `Setup` (`defaults.ts:34`), Music options in `Settings` | Not reached |
| ACC-45 | held | — | Native behaviour of the installed YouTube Music app window |
| SYNC-01 | partial | `device.syncOn` in `types.ts`, `defaults.ts:44`; first-run sync card `src/ui/onboarding/PickStep.svelte`, `first-run.bun-test.ts:161` | Settings › Everywhere switch and popup banner with **Details** missing; unwired |
| SYNC-02 | missing | — | Help text "Uses {Chrome's \| Firefox's} own sync…" not in code or locales |
| SYNC-03 | unwired | `sync-codec.ts` encodes only `doc:settings`, `doc:setup:*`, `doc:filter:*`; `sync-codec.bun-test.ts` | Sync engine not installed |
| SYNC-04 | unwired | Switches in synced `doc:settings`; per-browser consent `device` | Not reached |
| SYNC-05 | unwired | Local-first owner `src/background/store/local-filter-writer.ts`; `sync-codec.ts` | Owner not started in production |
| SYNC-06 | partial | 2 s quiet `local-filter-writer.ts:1497`, 5 s spacing `sync-mutation-pacing.ts:11`, incoming adoption (README "Automatic incoming documents") | Remote-only documents are never created locally; no Store notifications or TabView delivery on adoption; not installed |
| SYNC-07 | partial | Disappearance accounting in `sync-write-admission.ts`; `sync-write-admission.bun-test.ts:42` | Push-back of vanished documents not shown end to end; engine not installed |
| SYNC-27 | unwired | `sync-mutation-pacing.ts`, R155 hold (README "Opaque native write recovery"), `sync-retention.bun-test.ts` | Cleanup protocol unspecified (README); not installed; Q-PERF-54 unmeasured |
| SYNC-08 | partial | `sync-join-execution.ts`, `sync-join-persistence.ts`, `sync-join-lookup.ts:78`; `sync-join-execution.bun-test.ts`, `first-run.bun-test.ts:161` | Join dialog (UI-SET-13) and popup/Settings pending indication missing; not installed |
| SYNC-09 | unwired | Join refuses over-budget inventories (`sync-join-execution.bun-test.ts:39`) | Message naming what to remove (SYNC-14 copy) missing |
| SYNC-10 | unwired | Per-document receive (README "Automatic incoming documents") | Not installed |
| SYNC-11 | partial | Newer edit adopted by `local-filter-writer.ts` receiver; `reverted` result `local-filter-writer.ts:166` | Equal-timestamp edits become a conflict instead of a device-ID tie-break (`status.md`); "reverted" not shown to users |
| SYNC-12 | partial | `tombstone-expiry.ts`, `received-setup-removal.ts`; `setup-tombstone-receive.bun-test.ts`, `tombstone-expiry.bun-test.ts` | A browser that expired a tombstone doesn't adopt a later remote-only live record (`status.md`); not installed |
| SYNC-13 | unwired | `sync-codec.ts` `readSyncDocument` returns `incomplete`; `sync-codec.bun-test.ts`, `sync-join-execution.bun-test.ts:176` | Not installed |
| SYNC-14 | partial | Budget `SYNC_BUDGET_BYTES`/`ITEMS` in `sync-codec.ts`; refusal in `sync-write-admission.ts`; `sync-write-admission.bun-test.ts:75` | "Synced settings are full. {Largest}" message, largest-item naming and **Remove kept filters** missing |
| SYNC-15 | unwired | Refused edits aren't saved (`sync-write-admission.ts`) | Not installed |
| SYNC-16 | missing | — | No headroom tier for labels and marks found in admission code |
| SYNC-17 | partial | Over-budget snapshots read as `full` (`sync-inventory.ts`); status type `types.ts:22` | No code sets `status: "full"` and stops pushing; status UI missing |
| SYNC-18 | unwired | Chunking at 7,600/8,192 bytes `sync-codec.ts`; `sync-codec.bun-test.ts` | Not installed |
| SYNC-19 | unwired | Off cancels listener without deletes (README "Event driver"); `tombstone-expiry.bun-test.ts:252` | No Settings switch; not installed |
| SYNC-20 | unwired | Proven same-history adopt branch in `sync-join-execution.ts` | Not installed |
| SYNC-21 | unwired | Only Clear all removes synced data (`clear-all.ts`) | Not installed |
| SYNC-22 | partial | Version on every envelope `documents.ts:4`; unknown fields preserved (`sync-codec.ts`, `accounts.bun-test.ts:201`) | In-memory upgrade path untested (only version 1 exists) |
| SYNC-23 | partial | `newer-version` refusal in `sync-codec.ts`, `sync-write-admission.bun-test.ts:161` | "Update {Product} in this browser to keep syncing." copy and `update-needed` status display missing |
| SYNC-24 | missing | Status enum only (`types.ts:22`, `decodeSyncState.ts:16`) | No Settings › Everywhere status, popup banner row 9, or later-history link |
| SYNC-25 | unwired | Private UI may change sync/clear (`clear-all/owner.bun-test.ts:20`) | Not installed |
| SYNC-26 | untested | `wxt.config.ts` declares `data_collection_permissions: { required: ["none"] }`; no permission request in sync code | AMO-objection fallback not built (conditional) |
| DATA-01 | partial | 2.0 uses only the three areas (`local-filter-writer.ts`, `session-memory.ts`, `sync-codec.ts`) | Shipped 1.x still runs; IndexedDB/`localStorage` cleanup of 1.x leftovers not wired (see DATA-49) |
| DATA-02 | unwired | Background-only writes via the canonical owner; tabs get `tab-projection.ts` views; guard `checker.ts` storage-writes rule | Not reached; shipped popup reads storage directly (`src/entrypoints/popup/App.tsx:20`) |
| DATA-03 | external | Privacy text in 08 REL-STORE-17 and Settings › Privacy & data | Privacy & data section missing in code |
| DATA-04 | unwired | Group placement in `types.ts`, `session-memory.ts`, `account-cache.ts`; `model.bun-test.ts` | Not reached |
| DATA-05 | unwired | `sync-codec.ts` carries only shared and account documents; `settings-file.bun-test.ts:25` excludes device fields | Not reached |
| DATA-06 | partial | Labels inside setup and filter (`types.ts`); label written only on change `account-label.ts` | "Open YouTube as {Account} to see them" copy and the account list missing |
| DATA-07 | unwired | Keys in `src/shared/model/keys.ts`; `lastAccount` own key `src/shared/model/lastAccount.ts` (R176); `model.bun-test.ts` | Store not started |
| DATA-08 | unwired | Absent reads as defaults (`decodeSettings.ts`, `defaults.ts:3`); `model.bun-test.ts:347` | Not reached |
| DATA-09 | unwired | `s:` keys and chunk names in `sync-codec.ts`; `sync-codec.bun-test.ts` | Not installed |
| DATA-10 | unwired | Envelopes, pointers and tombstones in `sync-codec.ts`; `tombstone-expiry.ts:6`; tests above | Not installed |
| DATA-11 | unwired | `session-memory.ts:78-97` edits for pause, skips, recent, cooldown, shown, monitor, tabs, gather; `session-memory.bun-test.ts` | Session store not started; Pause copy lives in the missing popup |
| DATA-12 | unwired | `src/shared/model/types.ts`, decoders `decode*.ts`; `model.bun-test.ts` | Not reached |
| DATA-13 | unwired | 20 shortcuts `key-settings.ts:50`, label 40 `key-settings.ts:65`, account name 100 `account-label.ts:49`, 6-char IDs `decodeSettings.ts:11` | Not reached |
| DATA-14 | unwired | Unknown fields preserved: `accounts.bun-test.ts:201`, `sync-codec.ts` | Not reached |
| DATA-15 | unwired | Save-time normalizer `src/shared/model/normalize.ts` via `write-preparation.ts`; `write-preparation.bun-test.ts` | Not reached |
| DATA-16 | unwired | Empty setup removal `accounts.ts:143`; `accounts.bun-test.ts:181` | Not reached |
| DATA-17 | untested | Constants in `sync-codec.ts` (7,600 / 8,192 / 98,304 / 480) | The measured size table isn't reproduced by a test |
| DATA-18 | unwired | Only `AccountKey` is stored (`identifiers.ts`, `session-memory.bun-test.ts:76` rejects raw identity) | Not reached |
| DATA-19 | unwired | No cache/label/lastAccount without setup (`background/accounts/README.md`, `tabs.bun-test.ts:137`, `progressive.bun-test.ts:141`) | Not reached |
| DATA-20 | partial | `account-cache.ts:21,31,32`, `playlist-cache.ts:96`, `background/playlists/playlists.ts`; `playlists.bun-test.ts`, fixture `playlists-cache` | Settings-page refresh path missing; unwired |
| DATA-21 | unwired | Merge rules in `playlist-cache.ts`; `playlist-cache.bun-test.ts` | Not reached |
| DATA-22 | untested | No membership cache exists; membership read per add in `src/page/gateway` | Negative rule; nothing asserts it |
| DATA-23 | untested | No channel cache in 2.0 code | Negative rule; nothing asserts it |
| DATA-57 | unwired | Compare-before-write in `playlist-cache.ts:96`, Tabs unchanged pings write nothing (`tabs/README.md`), single refresh in `playlists.ts`; `playlists.bun-test.ts:74` | Not reached |
| DATA-24 | missing | Tracker portions only (`src/site/features/auto-add/tracker.ts`, `tracker.bun-test.ts`) | No `Progress` type, no `progress:<acct>:<n>` writer or reader |
| DATA-25 | missing | — | No persisted progress to expire |
| DATA-26 | missing | — | No 2,000-video cap or daily prune |
| DATA-27 | missing | — | No checkpoint writer |
| DATA-28 | partial | Tracker keeps progress in the tab (`tracker.ts`) | Nothing persists progress, so the private rule has no writer to guard |
| DATA-29 | unwired | Deletion of `progress:*` shards: `feature-settings-progress.ts:26`, `account-removal-execution.ts`, Clear all; `feature-switches/owner.bun-test.ts:154` | Not reached |
| DATA-56 | missing | Shard names exist (`feature-settings-progress.ts:26`) | No shard hash, no per-shard save |
| DATA-30 | unwired | Sender-derived origin `src/background/adapters/sender-origin.ts`; `sender-origin.bun-test.ts` | Shipped background uses it only for 1.x routing |
| DATA-31 | unwired | Private refusals across owner routes; `boundaries.bun-test.ts:111` | Not reached |
| DATA-32 | unwired | Private-allowed shared edits: `shared-options/owner.bun-test.ts:181`, `key-settings/wire.bun-test.ts:8`, `clear-all/owner.bun-test.ts:20` | Pause/Resume route not found; not reached |
| DATA-33 | unwired | Private refusals: `first-run.bun-test.ts:163`, `settings-file.bun-test.ts:81`, `ui-playlists/router.bun-test.ts:20`, gather fixture | Not reached |
| DATA-34 | partial | Refusal answered as private in routes | Console log of refusals and surface disabling not found |
| DATA-35 | unwired | Incoming sync accepted regardless of window (`local-filter-writer.ts` receiver) | Not installed |
| DATA-36 | partial | `src/background/router/clear-all.ts:26`, newer-layout erase (R168/R174); fixture `clear-all` | Settings › Privacy & data control missing; unwired |
| DATA-37 | unwired | `clearAllText` `src/shared/contracts/clear-all.ts:5`; `ui/backend/clear-all.bun-test.ts` | No page renders it |
| DATA-38 | unwired | Checkbox logic and button `ui/backend/clear-all.ts:43`, `router/clear-all.ts:58` | No page renders it |
| DATA-39 | unwired | `router/clear-all.ts`, `sync-reset.ts`; `clear-all/owner.bun-test.ts` | Not reached |
| DATA-40 | unwired | `sync-reset-receive.ts:14,197` | Notice display missing; not installed |
| DATA-41 | unwired | `store-lifecycle.ts:509` opens first run after clear; `clear-all/owner.bun-test.ts:153` | No first-run entrypoint |
| DATA-42 | missing | — | No Discard operation for the unclaimed setup found |
| DATA-43 | unwired | `account-removal-execution.ts`; fixture `account-removal-admission` | Not reached |
| DATA-44 | unwired | `account-removal-execution.ts`, `account-removal-session.ts`, `received-setup-removal.ts`; `account-removal-execution.bun-test.ts`, `setup-tombstone-receive.bun-test.ts` | Not reached |
| DATA-45 | unwired | `feature-settings-progress.ts`, `accounts.ts:152` `removeSharedShortcut`, kept filters `accounts.ts:71`; `accounts.bun-test.ts:165` | 6 s shortcut Undo UI missing; not reached |
| DATA-46 | unwired | `STORAGE_SCHEMA_VERSION` `documents.ts:5`; fresh schema write in `legacy-startup.ts`/`store-lifecycle.ts`; `store-lifecycle.bun-test.ts` | Store lifecycle not started |
| DATA-47 | unwired | `legacy-execution.ts` ordered idempotent steps; `legacy-execution` tests | No startup runs it; `onInstalled` first-run opener missing |
| DATA-48 | partial | `newer-layout` result in `legacy-startup.ts`, `startup-readiness` | Popup banner "older than your settings" missing; unwired |
| DATA-49 | partial | `legacy.ts:5` trigger keys, `legacy-startup.ts:107`, interim profiles `interim-profile.ts`; `legacy.bun-test.ts`, `interim-profile.bun-test.ts` | Page-owned `localStorage` cleanup and IndexedDB deletion host missing; unwired |
| DATA-50 | unwired | `legacy.ts:70` switch and preset rules; `legacy.bun-test.ts` | Not run at startup |
| DATA-51 | external | Owned by 08 (REL-MIG-33, §3.2, §17) and 09 | Out of this chapter |
| DATA-52 | partial | `recentAdds` list capped at 50 `session-memory.ts:64,579`; `device.recentAdds` flag | Only gathers write entries; ordinary adds, undo removal, the switch and the popup list are missing |
| DATA-53 | partial | `src/shared/settings-file/index.ts:120` filename and contents; `settings-file.bun-test.ts:13,25,51` | Export button and "Keep it private" line missing; no page |
| DATA-54 | partial | `settings-import-plan.ts`, `settings-import-execution.ts`; `settings-file.bun-test.ts:60,81`, fixture `settings-import-execution` | Confirmation dialog and refusal copy missing; no page |
| DATA-55 | partial | Newer-format and invalid refusals `settings-file.bun-test.ts:91,101` | Refusal copy not in code |
| DATA-58 | partial | Gather records in `session-memory.ts:91-97`, G1/G5 in `background/gather/execution.ts`; fixture `gather-controller` | Gather execution adapter unwired (`status.md`) |
| HEALTH-01 | unwired | Signal kinds in `src/shared/contracts/diagnostics.ts`; gateway emits them `src/page/gateway.ts`; `diagnostics.bun-test.ts:54`, `gateway.bun-test.ts:225` | Page gateway and Monitor not shipped |
| HEALTH-02 | unwired | `observeAnchor` thresholds `src/background/monitor/thresholds.ts`; `monitor.bun-test.ts:78` | No site-side anchor measurement feeds it; not shipped |
| HEALTH-03 | unwired | Vocabulary rejects identity (`diagnostics.ts`); `diagnostics.bun-test.ts:66`, `gateway.bun-test.ts:225` | Not shipped |
| HEALTH-04 | unwired | Shape outline `src/shared/contracts/shape-outline.ts`; `diagnostics.bun-test.ts:90-147` | Not shipped |
| HEALTH-05 | unwired | `monitor-session.ts`; `monitor.bun-test.ts:203` | Not shipped |
| HEALTH-06 | held | Starting values in `thresholds.ts` | Tuning waits on ticket 25 and first weeks of use |
| HEALTH-28 | partial | 10 s write and 200 cap `thresholds.ts`, `monitor.bun-test.ts:222,260` | Tab-side 5 s signal throttle and visible-only anchor check not found in `src/site` |
| HEALTH-07 | unwired | `src/background/monitor/derive.ts`; `monitor.bun-test.ts:92,105,127` | Production health bindings absent (Monitor README) |
| HEALTH-08 | unwired | Core failure in `derive.ts`; `monitor.bun-test.ts:116` | Not shipped |
| HEALTH-09 | unwired | Account-key loss keeps queue actions; `monitor.bun-test.ts:116` | Not shipped |
| HEALTH-10 | partial | Queue button and card menu draw nothing when not working (`queue-button.bun-test.ts:371`, `card-menu.bun-test.ts:229`) | Other features (quick-save, watch button, Music) have no site feature; unwired |
| HEALTH-11 | partial | Cannot-measure statuses `monitor.bun-test.ts:61` | First-in-session failure toast and console line not built |
| HEALTH-12 | unwired | `succeeded`/`reloadPassed` clear state (Monitor README); `monitor.bun-test.ts:25` | Not shipped |
| HEALTH-29 | unwired | Gather destination health `monitor.bun-test.ts:143` | Gather adapter unwired |
| HEALTH-13 | partial | Notice producer and 60 ms batch `thresholds.ts`; kit-free notice `src/site/core/notice/plain.ts`; `site-toaster/dom.bun-test.ts:139,163` | **Details** has no Settings Diagnostics target; unwired |
| HEALTH-14 | partial | Not-working answers in `src/shared/rules/outcomes.ts` | Unwired; most features lack site code |
| HEALTH-15 | missing | — | No badge code |
| HEALTH-16 | missing | — | No 2.0 popup breakage strip |
| HEALTH-17 | missing | — | No Settings health line or Diagnostics |
| HEALTH-18 | unwired | Notices bypass feedback (`monitor.bun-test.ts:170` with feedback off) | Not shipped |
| HEALTH-19 | untested | No banner or "works again" toast exists in code | Negative rule; nothing asserts it |
| HEALTH-20 | partial | Notice strings `messages.json:2868-2887`; `owner-key-clear-reconciliation/owner.bun-test.ts:111` | Popup-strip and Settings wordings have no consumer; unwired |
| HEALTH-21 | untested | No telemetry or remote config code in `src` | Negative rule; no guard asserts it |
| HEALTH-22 | missing | — | No Settings › Diagnostics section |
| HEALTH-23 | missing | — | No Check now |
| HEALTH-24 | missing | — | No diagnostics report builder |
| HEALTH-25 | missing | — | No report to constrain |
| HEALTH-26 | missing | — | No `console.*` logging in 2.0 code; no Detailed console log consumer |
| HEALTH-27 | missing | — | No Report a problem chooser or GitHub link |

## Work to do

Units are ordered by dependency. "Unwired" IDs mostly need U1 alone. Sizes: S is under a day, M a few days, L a week or more.

### U1. 2.0 background composition root (L)

- **IDs.** FT-02, FT-03, FT-09, FT-10, FT-11, FT-12, FT-15, FT-19, FT-20, FT-21, FT-23, FT-24, FT-25, FT-26, FT-27, FT-28, FT-29, FT-31, FT-33, FT-34, FT-37, FT-38, FT-45, FT-49, FT-50, FT-51, FT-55; ACC-06, ACC-07, ACC-08, ACC-10, ACC-12, ACC-13, ACC-18, ACC-26, ACC-28, ACC-29, ACC-37, ACC-38, ACC-39, ACC-43, ACC-44; SYNC-03, SYNC-04, SYNC-05, SYNC-10, SYNC-13, SYNC-15, SYNC-18 to SYNC-21, SYNC-25, SYNC-27; DATA-02, DATA-04, DATA-05, DATA-07 to DATA-16, DATA-18, DATA-19, DATA-21, DATA-29 to DATA-33, DATA-35, DATA-39, DATA-40, DATA-43 to DATA-47, DATA-50, DATA-57.
- **Files.** Replace `src/entrypoints/background.ts`. Compose `src/background/adapters/store-lifecycle.ts`, `starting-owner.ts`, `local-filter-writer.ts`, `registrar.ts`, `tabs.ts`, `runtime.ts`, `ui-requester.ts`, `gather-browser.ts`; `src/background/router/*`; `src/background/registrar`, `tabs`, `tab-view`, `playlists`, `accounts`, `add-flow`; `legacy-execution.ts` at the top of every start; `startSync()` on the owner. Retire `src/lib/storage.ts` and `src/lib/session.ts` callers.
- **Depends on.** U2 for permissions. The owner's activation hold (Question 1).
- **Note.** This turns about 115 unwired rows into built rows only if each cited fixture is re-pointed at the composed background. Add one integration test that drives the real entrypoint.

### U2. 2.0 manifest, permissions and pages (M)

- **IDs.** FT-44, FT-59 (declared `commands`), FT-60 (optional `contextMenus`), ACC-36, SYNC-26, FT-15 (manifest half).
- **Files.** `wxt.config.ts` (name Perchling, optional `https://music.youtube.com/*` on Chrome, `*://*.youtube.com/*` on Firefox, optional `contextMenus`, three key-less commands, no `content_scripts` or `web_accessible_resources`). New HTML entrypoints for first run and the upgrade note, popup and Settings under `src/entrypoints/`. A manifest test.
- **Depends on.** Nothing.

### U3. Site bundles: page, core, kit and feature files (L)

- **IDs.** FT-16, FT-17, FT-18, FT-19 (in-tab teardown), FT-62, FT-63, ACC-03 (isolated-core key), ACC-19, ACC-42, HEALTH-01 to HEALTH-05, HEALTH-10, HEALTH-28 (tab-side 5 s throttle, visible-only anchor check).
- **Files.** New bundle entrypoints for the names in `src/shared/features/registration.ts` `siteBundles` and `popoversBundle`, built from `src/page/*`, `src/site/core/*`, `src/site/kit/*`, `src/site/features/*`. Budget checker and production file guard (registry README says both are unimplemented).
- **Depends on.** U1 (Registrar), U2.

### U4. Monitor production bindings (M)

- **IDs.** HEALTH-02, HEALTH-07, HEALTH-08, HEALTH-09, HEALTH-11, HEALTH-12, HEALTH-13, HEALTH-14, HEALTH-18, HEALTH-20, HEALTH-29, ACC-23.
- **Files.** `src/background/monitor/*` authority and health ports fed from Tabs, gateway signals and site anchor measurements; HEALTH-11's first-in-session toast through `src/site/kit/feedback`.
- **Depends on.** U1, U3.

### U5. Feature status and toolbar badge (M)

- **IDs.** FT-13 (held-reason derivation), FT-30 (badge), FT-43 (badge), FT-46, FT-47, FT-57, FT-58, HEALTH-15.
- **Files.** New `src/background/badge.ts` (or a `status` module) deriving consent and note, site access, Monitor not-working tabs, Missing/Full marks and auto-add's two marks; `browser.action.setBadgeText`/`setBadgeBackgroundColor`/`setTitle`. The same held-reason function feeds U6 and U7.
- **Depends on.** U1, U4.

### U6. 2.0 popup (L)

- **IDs.** FT-14 (popup), FT-30 (Review), FT-36, FT-54, ACC-04, ACC-13 (consumer), ACC-15, ACC-16, ACC-17, ACC-20, ACC-21, ACC-22 (banner), ACC-32, ACC-33, ACC-40, SYNC-01 (banner), SYNC-17, SYNC-23, SYNC-24 (banner), DATA-48, DATA-52 (list), HEALTH-16.
- **Files.** New `src/ui/popup/*` (Svelte, matching `src/ui/onboarding`), `src/ui/backend/*` routes, `src/entrypoints/popup/*`.
- **Depends on.** U1, U2, U5.

### U7. 2.0 Settings page (L)

- **IDs.** FT-05, FT-06, FT-08, FT-14, FT-32 ("Before this feature can run" dialog), FT-35, FT-52, FT-56 (deep links), FT-60 (Allow), ACC-14, ACC-15, ACC-24, ACC-25, ACC-48, SYNC-01, SYNC-02, SYNC-08 (join dialog and later-history link), SYNC-09, SYNC-14 (message, Remove kept filters), SYNC-24, DATA-03, DATA-06, DATA-34, DATA-36, DATA-37, DATA-38, DATA-45 (shortcut Undo), DATA-53, DATA-54, DATA-55, HEALTH-17.
- **Files.** New `src/ui/settings/*`, `src/entrypoints/options/*`; existing `src/ui/backend/clear-all.ts`, `shared-settings.ts`, `key-settings.ts`, `src/ui/keys/KeyRecorder.svelte`.
- **Depends on.** U1, U2, U5.

### U8. Diagnostics, Check now, report and console log (M)

- **IDs.** HEALTH-21 (add a guard), HEALTH-22, HEALTH-23, HEALTH-24, HEALTH-25, HEALTH-26, HEALTH-27.
- **Files.** Settings › Diagnostics in `src/ui/settings`, a report builder over Monitor and Store state, a Check now route through Tabs, a console logger honoring `device.detailedLog`, the GitHub issue link.
- **Depends on.** U4, U7.

### U9. First run and upgrade note wiring (M)

- **IDs.** FT-32 (note Agree), FT-40, FT-41, FT-43, FT-48, ACC-34, DATA-41, DATA-47 (`onInstalled` "install" opener), DATA-49 (IndexedDB host, page-owned `localStorage` cleanup and `device.legacyCleared`).
- **Files.** Mount `src/ui/onboarding/FirstRun.svelte` in a new entrypoint; build the upgrade note page; `store-lifecycle.ts` `openFirstRun` binding; the cleanup host in `legacy-execution.ts`.
- **Depends on.** U1, U2.

### U10. Claiming trigger and Discard (M)

- **IDs.** ACC-30, ACC-31, ACC-46, ACC-32 (notice delivery), ACC-33, DATA-42.
- **Files.** Call the owner's `claim()` (`local-filter-writer.ts:340`) when `src/background/accounts/accounts.ts` sees a signed-in normal account with a pending `unclaimed`; a production ownership `lookup` through the Tabs `playlists` job; a new Discard operation. The store README says the claim fixture "does not establish production claim safety".
- **Depends on.** U1. UI in U6 and U9. Question 3.

### U11. Watch-progress persistence (M)

- **IDs.** DATA-24, DATA-25, DATA-26, DATA-27, DATA-28, DATA-56.
- **Files.** A `Progress` type and decoder in `src/shared/model`, a shard hash, owner read and write paths for `progress:<acct>:<n>`, the 2,000 cap and daily prune, checkpoints from the auto-add site feature around `src/site/features/auto-add/tracker.ts`.
- **Depends on.** U1, and an auto-add site feature (chapter 02's work; only the pure tracker exists).

### U12. Settings sync completion (L)

- **IDs.** SYNC-06, SYNC-07, SYNC-11, SYNC-12, SYNC-14 (largest-item naming), SYNC-16, SYNC-17, SYNC-22, SYNC-23, DATA-35.
- **Files.** `local-filter-writer.ts` receiver and `sync-write-admission.ts`. Create remote-only documents locally. Break equal-time ties by device ID and report reverted edits. Write `full`, `update-needed` and `waiting` statuses and stop pushing on `full`. Add a headroom tier for labels and marks. Adopt a newer live record after tombstone expiry. Deliver Store notifications and TabView updates on adoption. Test an in-memory version upgrade.
- **Depends on.** U1. Status display in U6 and U7.

### U13. Recent adds (S)

- **IDs.** DATA-52.
- **Files.** `src/background/add-flow/add-flow.ts` writes an entry for each *added* outcome through `session-memory.ts`, removes it on Undo, honors and clears on `device.recentAdds` off.
- **Depends on.** U1. List in U6, switch in U7.

### U14. Injection on use: browser menu and any-tab keys (M)

- **IDs.** FT-59, FT-60.
- **Files.** `contextMenus.create`/`remove`/`onClicked` and `commands.onCommand` handlers in the background, running jobs through `registrar.ensure()`.
- **Depends on.** U1, U2, U3. The features themselves are chapter 02's.

### U15. Gather wiring (L, mostly chapter 02)

- **IDs.** FT-63, FT-64, ACC-47, DATA-58, HEALTH-29.
- **Files.** The Gather execution adapter (`src/background/gather/execution.ts`, `src/background/adapters/gather-browser.ts`), automatic triggers YT-GT-22 to 29, the `ui.gather*` routes.
- **Depends on.** U1, U3, U4.

### U16. Tests for negative and manifest rules (S)

- **IDs.** FT-07, ACC-11, ACC-27, ACC-36, ACC-41, DATA-17, DATA-22, DATA-23, HEALTH-19, HEALTH-21, SYNC-26.
- **Files.** `tests/guards/checker.ts` rules (no telemetry, no membership or channel cache, no container IDs), a size-table fixture reproducing DATA-17 through `sync-codec.ts`, a manifest test after U2.
- **Depends on.** U2 for the manifest rows.

### Held, not units

Real-browser and budget gates stay with the owner: Q-PERF-5 to Q-PERF-11, Q-PERF-54, Q-PERF-57 and the running-cost budgets behind FT-15, FT-19, FT-21, FT-61 and FT-62. Live YouTube checks cover ACC-03 (L7), ACC-05, ACC-35, FT-39 (L3/L4) and HEALTH-06. Native behaviour covers ACC-45 and FT-53.

## Questions

1. **Cutover.** Production activation is held (`decisions.json` standing, every module README). When should U1 replace the shipped 1.x entrypoints, and should that happen in one cutover or behind a staged switch? Every unwired row waits on this.
2. **Retained-work recovery controls.** FT-35 (R167) and ACC-48 (R162 to R170) leave the recovery controls and their storage unspecified. U7 can't build the withdrawal recovery or the recovery section until the owner picks the controls.
3. **Collaborative playlists.** ACC-35 leaves open whether collaborative playlists count as owned for claiming. Ticket 25 decides it. U10's ownership lookup needs the answer, or a default the owner accepts.
4. **Cross-browser account keys.** ACC-03's PROVISIONAL branch says re-attaching two setups for one account is an open question if `DATASYNC_ID` differs between browsers. It blocks nothing until ticket 25 L7 reports.
5. **Sync cleanup protocol.** SYNC-27 (R151) leaves chunk cleanup's minimum evidence as an engineering obligation. It isn't a product call, but U12 can't claim reclamation until someone owns that design.
