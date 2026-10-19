# 08 · Upgrade and release

Part of the [2.0 spec](../spec.md). This chapter covers how 1.4.5 users get to 2.0, and how 2.0 and every later version reach both stores:
- the 1.4.5 migration;
- the upgrade note and the consent copy;
- the permission prompts each audience sees;
- versioning and betas;
- release order, soak, rollback and fix-forward;
- both store listings, the privacy policy, and the Chrome Web Store dashboard answers;
- AMO's reviewer notes, `SOURCE_CODE_REVIEW.md` and the ARM64 rebuild;
- Firefox's data-collection declaration, and the fallback if an AMO reviewer objects;
- the CI and release workflows, and retiring `server/`;
- the upgrade-test matrix, the release checklist and the user's one-time setup.

**Sources:** tickets [19](../issues/19-upgrade-and-rollout.md) (the core), [06](../issues/06-upgrade-path.md), [16](../issues/16-storage-and-sync.md) §10, [03](../issues/03-store-policy.md), [22](../issues/22-name.md), [23](../issues/23-ask-amo.md) and [18](../issues/18-breakage.md). Refinements come from [08](../issues/08-shortcuts.md), [10](../issues/10-youtube-access.md) §11, [11](../issues/11-accounts.md), [15](../issues/15-popup-and-settings.md) and [17](../issues/17-modules.md). Decision records: [ADR-0009](../../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md), [ADR-0010](../../../docs/adr/0010-one-consent-gates-every-feature.md) and [ADR-0011](../../../docs/adr/0011-betas-from-github-pages.md). Where sources differ, the later one wins. Differences that are still open are listed in [Conflicts found](#conflicts-found).

**Neighbouring chapters:**
- [04](04-features-accounts-data.md): the storage layout ([§4.3](04-features-accounts-data.md#43-storage-layout)), migrations ([§4.10](04-features-accounts-data.md#410-schema-versions-and-migrations), DATA-46 to DATA-51), the consent model ([§1.5](04-features-accounts-data.md#15-the-consent-gate)), first run ([§1.6](04-features-accounts-data.md#16-first-run)), accounts and claiming ([§2.6](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming)).
- [05](05-ui.md): the first-run page's layout ([§5.4](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note), UI-ONB-01 to UI-ONB-09), the brand ([§5.9](05-ui.md#59-the-brand-provisional-ticket-22)) and every other piece of UI copy.
- [06](06-architecture.md): the manifests and registration ([§6.3](06-architecture.md#63-manifest-permissions-and-registration), ARC-MAN-01 to ARC-MAN-18), and the folder layout ([§6.10](06-architecture.md#610-folder-layout)).
- [07](07-quality.md): the test layers ([§7.2](07-quality.md#72-test-layers)), fixtures ([§7.3](07-quality.md#73-fixtures)), the watch and the live check ([§7.5](07-quality.md#75-breakage-detection)), the budgets ([§7.6](07-quality.md#76-performance-budgets)) and the CI jobs ([§7.7](07-quality.md#77-ci-jobs-and-the-hotfix-lane)).
- [09](09-parity.md): what 1.4.5 users had ([§1.12](09-parity.md#112-what-145-users-had), PAR-CAP-71 to PAR-CAP-79) and the platform and release rows ([§1.11](09-parity.md#111-platform-manifest-build-and-release)).

The main session's resolutions ([resolutions.md](resolutions.md)) are applied, all three rounds (R1–R40, R41–R67, then R68–R77). R83, settled after the spec, is applied too. A requirement they changed keeps its ID and ends with its R-number; one they added has a new ID. Following R37, prose calls `onboarding.html` "the first-run page", and copy says "quick-save playlist". Under the resolutions' ownership rule, this chapter owns the migration, the upgrade note, and consent copy and conditions (R60); where it shares another topic with a chapter that owns it, that chapter's text wins, and [Conflicts found](#conflicts-found) lists what still differs.

**Requirement IDs:**
- `REL-MIG-`: the 1.4.5 migration.
- `REL-CON-`: the upgrade note, consent and prompts.
- `REL-STORE-`: listings, privacy, the store dashboards and AMO.
- `REL-CI-`: versioning, betas, workflows and retiring `server/`.
- `REL-CHK-`: release order, rollback, upgrade tests, checklists and the user's setup.

## 0. PROVISIONAL inputs

The plan works whichever way these land. Each dependent item is marked inline. Rows marked **Settled** no longer wait on anything, and stay here for the record.

| Input | Waits on | What depends on it | If it changes |
|---|---|---|---|
| **The name** | [Ticket 22](../issues/22-name.md), the user's call | Every string that says "Playlist Pigeon": the manifest `name`, `short_name` and `description`, the note, the disclosure, both listings, the policy, the reviewer notes and the screenshots | Swap "Playlist Pigeon for YouTube™" / "Playlist Pigeon" / "Pigeon" for "Playlist Courier for YouTube™" / "Playlist Courier" / "Courier". Nothing else changes. |
| **Firefox data collection** (was AMO's reply) | **Settled** by decision ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)), from Mozilla's own documentation. [Ticket 23](../issues/23-ask-amo.md)'s message to AMO isn't sent. | Firefox's `data_collection_permissions` (`required: ["none"]`), the Firefox prompts (§5), the sync switch (it declares no data type), private-window settings writes (allowed), and the Bun install step (as planned) | Nothing, unless an AMO reviewer objects. Then the matching row of [§13](#13-if-an-amo-reviewer-objects)'s fallback applies. |
| **The session cookie** | [Ticket 25](../issues/25-live-checks.md)'s final route table | The **cookie lines**: the disclosure's cookie bullet, the policy's cookie bullet, Chrome's "Authentication information" tick, and the reviewer notes' signed route | If no shipped route reads the session cookie, remove all four together; the reviewer notes then describe the same-origin request without signing (R48) |
| **The reviewer endpoint list** | Ticket 25's route table | §12.1 | Fill it from the table |
| **Exact prompt strings** | **Settled** ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)): Firefox's from its own string files, code and support articles, and Chrome's from Chromium's source. Ticket 25's check P1 ([06 §6.2.15](06-architecture.md#6215-live-checks-that-settle-the-provisional-rows)) now only glances at the real dialogs. | §5 | If a real dialog differs, adjust §5 |
| **A support e-mail** | The user | The policy's Contact section, both stores and Diagnostics | Add it in all of them |
| **Open tabs surviving updates** (S11, S12) | Ticket 17's real-browser layer running a real update ([ARC-MAN-17](06-architecture.md#633-runtime-script-registration), [Q-TEST-18](07-quality.md#725-layer-4-real-browser) item 5) | §17 | Fix in the registrar or core before the beta ends |

Ticket 23's message was corrected on 2026-10-19 and then never sent: R83 settled its four questions from Mozilla's own documentation the same day ([§13](#13-if-an-amo-reviewer-objects)).

**Unverified facts the plan already covers:**
- whether Chrome re-reviews an Unlisted → Public change (the staged 2.0.0 submission covers both cases);
- what AMO's automatic builder runs (the human reviewer follows `SOURCE_CODE_REVIEW.md`);
- whether 1.4.5 users' own OAuth clients were in Testing mode, which gives 7-day refresh tokens;
- the `extensions.update.url` override shortcut (§17);
- the Chrome Web Store fee (the docs' screenshot says US$5).

All copy in this chapter uses ticket 22's recommendation: "Playlist Pigeon for YouTube™" on the stores, "Playlist Pigeon" in the product, and `short_name` "Pigeon". **Every occurrence is PROVISIONAL on ticket 22.** This chapter writes the name out, because its store and policy texts are published as they stand; the other chapters' copy writes it `{Product}`, and the account `{Account}` (R65). Quotes in copy are typographic (“ ”, R45).

## 1. What 1.4.5 is

These facts come from inventory.md, ticket 06 and 1.4.5's code at `e96dbf7`.

- **Where it is:** AMO only. It was published on 2024-06-21 and has about 66 daily users. Nothing newer has shipped, and the Chrome Web Store has never listed the extension, so **every upgrader is a Firefox user.**
- **Its manifest:**
  - permissions `activeTab`, `storage`, `identity` and `scripting`, with no host permissions;
  - one content script on `*://*.youtube.com/*`, excluding music.youtube.com;
  - `strict_min_version` 125.0;
  - gecko ID `{cc70cd21-2cc6-444b-bd89-496909346091}`.
- **Its data:** nine keys in `storage.local`: `playlists`, `addToPlaylistID`, `watchLaterShortcut`, `requiredWatchPercentage`, `toastEnabled`, `clientID`, `clientSecret`, `accessToken` and `refreshToken`. Playlist IDs were typed or pasted by hand: empty entries were filtered out, but half-typed IDs and pasted URLs can occur.
- **Where its popup and behaviour disagree:**
  - **The percentage input's HTML default is 50.** It's shown only when the stored value is truthy, and read as `… || 0`. So an absent or `""` value showed **50** and acted at **0 %**.
  - **The toast checkbox is unchecked by default,** and the stored value is applied only if defined. So an absent `toastEnabled` showed **off** and was off.
  - **Modifiers are checked as `event[mod.toLowerCase()+"Key"]`.** `Control` becomes `event.controlKey`, which doesn't exist, so any shortcut with Ctrl **never fired**. Other shortcuts fired, and extra modifiers also matched.
- **1.5.0** (WXT, the token broker, channel filters) never shipped. Its keys exist only in developer profiles.

## 2. The 1.4.5 migration

### 2.1 When it runs

- **REL-MIG-01** The migration runs at the top of every background start, before the reconciler, the replicator and any message handler. Every other background module awaits the store's `ready()`; the popup, settings and the first-run page only read `storage.local`, and follow its changes ([ARC-MOD-24, ARC-MOD-25](06-architecture.md#69-the-store-module-interface)).
- **REL-MIG-02** **Recognising an upgrader.** At every background start, if there's no consent and no upgrade-note record (`device.consent` and `device.upgradeNote` absent or `null`), and any **1.x key** is present in `storage.local`, it's an upgrade: the migration runs and the note follows (the note path). Otherwise it's a fresh install: the first-run path (REL-MIG-04). ([DATA-49](04-features-accounts-data.md#410-schema-versions-and-migrations); R64)
  - The 1.x keys are 1.4.5's nine: `playlists`, `addToPlaylistID`, `watchLaterShortcut`, `requiredWatchPercentage`, `toastEnabled`, `clientID`, `clientSecret`, `accessToken` and `refreshToken`.
  - The check never relies on `onInstalled`, which Firefox can skip (REL-MIG-05; ticket 06), or on the `schema` marker, which the first background start may already have written (REL-MIG-04).
  - When the migration runs, it also converts and removes the 1.5.0 developer keys: `authMode`, `authServerURL`, `cachedPlaylists`, `preventDuplicates`, `queueButtonEnabled`, `cardContextMenu`, `channelFilters` and `channelLabels`. On their own, without a 1.x key, they don't make an upgrade; only developer profiles ever wrote them.

  It never reads `storage.sync`, because sync is off ([FT-21](04-features-accounts-data.md#13-off-costs-nothing)). 1.5.0's stray `theme` key there, which only developer profiles ever wrote, is left alone. (R20, R64)
- **REL-MIG-03** A 1.4.5 user with no 1.x key left, such as one who never set anything up, counts as a fresh install under REL-MIG-02: no migration and no note. Their update fires `onInstalled` with "update", not "install", so no tab opens on the update; the toolbar shows the "!" and the popup "Waiting for your OK" with **Review**, which lead them to first run (REL-MIG-04). This replaces R21's `onInstalled` "update" trigger, which gave them an empty note. (R64, R76)
- **REL-MIG-04** If REL-MIG-02 finds no upgrade, the state is fresh: a new install, an empty profile that updated while disabled, or a 1.4.5 user with no 1.x key.
  - The first background start writes `schema: 1` at once, before consent. A schema marker isn't user data ([DATA-46](04-features-accounts-data.md#410-schema-versions-and-migrations)). It never decides whether a start is an upgrade.
  - First run opens on `onInstalled` "install".
  - Otherwise no tab opens: the toolbar "!" and the popup's "Waiting for your OK" lead to first run. (R21, R64, R76)
- **REL-MIG-05** The migration never depends on `onInstalled`. Firefox fires no `onInstalled` "update" when the add-on was disabled or the update was applied at browser start. In those cases the migration runs from stored state at the next background start, and the note opens then.
  - `onInstalled` is used only for work tied to the event: the first-run tab on "install". (R64)
- **REL-MIG-06** The extension registers no `runtime.onUpdateAvailable` listener. One would postpone updates and suppress `onInstalled`.
- **REL-MIG-07** WXT's per-item `version` and `migrations` aren't used: they run per key in every context and skip absent values, while this migration spans keys.

### 2.2 Steps

- **REL-MIG-08** The migration runs these steps in this order:
  1. **Read and convert** in memory, with pure functions ([2.3](#23-the-mapping)), into:
     - `doc:settings`;
     - `unclaimed`;
     - `device`, with `consent: null`, `syncOn: false` and `upgradeNote: {state: "pending", details, opened: false}` ([2.9](#29-what-the-note-is-built-from)).
  2. **Write** all the new keys in one `storage.local.set`.
  3. **Remove the old stores:**
     - every 1.x key and 1.5.0 developer key (REL-MIG-02) in one `storage.local.remove`, including `clientID`, `clientSecret`, `accessToken` and `refreshToken`;
     - nothing in `storage.sync`, which the migration never touches (R20);
     - the IndexedDB database `yt-playlist-tools`, with `indexedDB.deleteDatabase` from the background;
     - `channelCache` from `storage.session`.
  4. **Write `schema: 1` last.**
  5. **Open the note** ([3.1](#31-opening-the-note)). (R20)
- **REL-MIG-09** Every step is idempotent, and new keys are written before old ones are removed. A crash between any two steps re-runs cleanly at the next start and gives the same result. A test injects a failure at each step boundary.
  - A crash after step 2 leaves the note's record written while 1.x keys remain, so REL-MIG-02 no longer sees an upgrade. A start that finds the note pending while a 1.x key is still present therefore finishes steps 3 and 4, and leaves the written keys as they are. This crash-recovery rule stands alongside R76's fresh-install reading, which applies only when no note record exists. (R64, R76)
- **REL-MIG-10** The old `localStorage` keys (`cachedVideos`, `playlists` and `preventDuplicates`, on the extension's own origin, left by unreleased builds) are removed by the first extension page that opens, because a service worker has no `localStorage`. That page then asks the background to set `device.legacyCleared = true`, since only the background writes storage ([ARC-MOD-23](06-architecture.md#69-the-store-module-interface)). Once the flag is set, no page touches `localStorage` again.

### 2.3 The mapping

This table merges ticket 16 §10.2 with ticket 19 §2.2. Ticket 19 confirms carrying over what 1.4.5 **did**, not what its popup **showed** ([ADR-0009](../../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md)).

| Old key (area) | What 1.4.5 did | What its popup showed | 2.0 value |
|---|---|---|---|
| `playlists` (local) | Added to each listed ID | The same IDs | `unclaimed.autoAdd`, cleaned ([2.4](#24-cleaning-typed-playlist-ids)). `details.autoAdd` records how many were kept and dropped. |
| `addToPlaylistID` (local) | Free text, not trimmed | The same | `unclaimed.shortcutPlaylist`, cleaned the same way; `null` if nothing survives |
| `watchLaterShortcut` (local), with `Control` | **Never fired** | The key | Converted by [2.5](#25-converting-the-1x-shortcut). The note says it never worked. |
| `watchLaterShortcut` (local), other keys | Fired; extra modifiers also matched | The key | Converted by [2.5](#25-converting-the-1x-shortcut). Matching is exact in 2.0. |
| `requiredWatchPercentage` (local) absent or `""` | **Added at once** (`… \|\| 0`) | **50** | `settings.autoAdd.pct = 0`, with `details.pct.wasUnset = true`, so the note asks ([3.3](#33-the-one-question-the-note-asks)) |
| `requiredWatchPercentage` `"0"`–`"100"` | That value | That value (`"0"` is a truthy string, so it showed 0) | That number, rounded |
| `requiredWatchPercentage`, any other value | — | — | A number is rounded and clamped to 0–100. Anything that isn't a number counts as unset: **0**, with `details.pct.wasUnset = true`, so the note asks the 50 % / 0 % question (R21). |
| `toastEnabled` (local) absent | **Off** | **Off** (checkbox unchecked) | Show feedback **off** for auto-add and playlist shortcuts |
| `toastEnabled` `true` / `false` | On / off | On / off | `true` → on. Anything else → off. |
| `clientID`, `clientSecret`, `accessToken`, `refreshToken` (local) | The Data API credentials | — | **Deleted.** `details.credentialsDeleted = true` if any existed. |
| `authMode`, `authServerURL`, `cachedPlaylists`, `preventDuplicates`, `queueButtonEnabled`, `cardContextMenu` (local; 1.5.0, developer profiles only) | — | — | Deleted. New features start off. |
| `channelFilters` and `channelLabels` (local; 1.5.0) | — | — | `unclaimed.filters`, with the labels embedded. They're claimed with the setup. |
| `theme` (sync; 1.5.0) | — | — | Not read and not removed: the migration doesn't touch `storage.sync` while sync is off (R20). `settings.theme` starts at System. |
| `channelCache` (session; 1.5.0) | — | — | Removed |
| IndexedDB `yt-playlist-tools` (1.5.0) | — | — | Deleted with `indexedDB.deleteDatabase` |
| `localStorage` `cachedVideos`, `playlists`, `preventDuplicates` (unreleased builds) | — | — | Removed by the first extension page (REL-MIG-10) |

- **REL-MIG-11** The migration writes exactly the 2.0 values in the table's last column. Most notably:
  - an absent, empty or non-numeric percentage becomes 0 with `wasUnset: true`;
  - an absent `toastEnabled` becomes Show feedback off;
  - a Ctrl key is carried over. (R21)
- **REL-MIG-12** Show feedback off hides only **confirmations**. Failures still show, which 1.4.5 never did ([ticket 12](../issues/12-adding.md)). The note says so.
- **REL-MIG-13** Each carried auto-add playlist takes **Videos** only and has no override, so it uses the default required percentage ([ticket 07](../issues/07-watched.md)).
- **Why 1.4.5's real values:** users experienced 0 % and no toasts. In 2.0, 0 % means "as soon as 1 s of the video plays", which matches what they had.
  - *Runner-up:* the popup's values (50 %, toasts on). It lost on two counts: it changes behaviour nobody asked to change, and on toasts it's simply wrong, because the popup showed them off too. Ticket 06's "toasts on" came from 1.5.0's defaults.
  - **The one mismatch is the percentage.** The note asks about it once, defaulting to what 1.4.5 did ([3.3](#33-the-one-question-the-note-asks)).

### 2.4 Cleaning typed playlist IDs

- **REL-MIG-14** The migration cleans each entry of `playlists`, and the single `addToPlaylistID`, in this order:
  1. if the entry contains `list=`, take that parameter's value;
  2. trim whitespace;
  3. keep it only if it matches `^PL[A-Za-z0-9_-]{16,64}$`;
  4. de-duplicate, keeping the first occurrence's order.
- **REL-MIG-15** `details.autoAdd.kept` is the number of IDs written to `unclaimed.autoAdd`. `details.autoAdd.dropped` is the number of non-empty entries left out because they weren't playlist IDs. A duplicate of a kept ID isn't counted, because the note's copy says the dropped ones "weren't playlist IDs".
- **Test:** for scenario S1, the entries "a pasted playlist URL" and "a half-typed ID" give `kept: 1` and `dropped: 1`.

### 2.5 Converting the 1.x shortcut

From ticket 08.

- **REL-MIG-16** Split `watchLaterShortcut` on "+". De-duplicate the modifiers, which are `Control`, `Alt`, `Shift` and `Meta` in any order. The last token is the key.
- **REL-MIG-17** The key carries over if it's a letter, a digit, or a named key such as ARROWUP, HOME, PAGEDOWN, DELETE or F1–F12. It becomes shortcut 1's key, in ticket 08's `Key` shape.
- **REL-MIG-18** These don't carry over:
  - punctuation and other characters;
  - Escape and Tab;
  - a bare Enter or Space;
  - a modifier as the last token;
  - **any Ctrl+Alt combination.**

  Shortcut 1 is then created with `key: null`, and `details.shortcut.raw` keeps 1.4.5's string for the note.
- **REL-MIG-19** Bare keys and Ctrl keys carry over as they are, because they were the user's choice. In 2.0, bare and Shift-only keys no longer fire while the user types. Ctrl keys work for the first time.
- **REL-MIG-20** `details.shortcut.note` takes the first of these that applies:

| `note` | When |
|---|---|
| `"none"` | `watchLaterShortcut` is absent or empty, and no cleaned shortcut playlist survived |
| `"no-key"` | `watchLaterShortcut` is absent or empty, but a cleaned shortcut playlist survived (REL-MIG-39; R21) |
| `"unconvertible"` | REL-MIG-18 applies |
| `"no-playlist"` | A key was converted, but no cleaned shortcut playlist survived |
| `"ctrl-never-fired"` | A key with `Control` was converted, and a playlist came over |
| `"ok"` | Any other converted key, and a playlist came over |

  (R21)
- **REL-MIG-21** If the converted key matches one of ticket 08's clash warnings (for example YouTube's K for Play/pause), `details.shortcut.clash` holds that warning's ID.
- **REL-MIG-39** **A shortcut playlist with no key.** If `addToPlaylistID` survives cleaning but `watchLaterShortcut` is absent or empty, the playlist is kept: shortcut 1 is created with `key: null`, its playlist goes into `unclaimed.shortcutPlaylist`, and claiming makes it that shortcut's playlist. Playlist shortcuts stays off (REL-MIG-23). The note says "Your 1.x shortcut had no key. Its playlist is kept; set a key in Settings." (REL-CON-04). (R21)

### 2.6 Switches after the migration

- **REL-MIG-22** Auto-add is switched on if at least one auto-add playlist was kept.
- **REL-MIG-23** Playlist shortcuts are switched on only if **both** a converted key and a cleaned playlist came over (`note` is `ok` or `ctrl-never-fired`). Otherwise the feature stays off, and whatever came over is kept.
- **REL-MIG-24** Upgraders get **no Watch later preset**: their list holds only their own shortcut, and `shortcuts.preset` is `true`, so the preset is never added later.
  - The picker key (Alt+Shift+P) is preset as for anyone, unless the carried key already uses it.
  - The undo key belongs to no feature and is Alt+U from install, for upgraders as for anyone, unless the carried key already uses it ([FT-05](04-features-accounts-data.md#11-the-features); R44).
- **REL-MIG-25** Every other feature is off, settings sync is off (`device.syncOn: false`), and `device.consent` is `null`.
- **REL-MIG-26** None of these switches takes effect until consent ([2.8](#28-before-consent)). Agree on the note applies the note's ticks over these values ([3.4](#34-agree-and-not-now)).

### 2.7 Old Google access

- **REL-MIG-27** The 1.x credentials are deleted locally and **nothing is revoked over the network.** 2.0 never sends a request to any host but YouTube.
- **REL-MIG-28** The note and Settings › Privacy & data link to `https://myaccount.google.com/permissions`, with one line for users who made a Google Cloud project only for 1.x.
- *Runner-up:* a fire-and-forget `POST https://oauth2.googleapis.com/revoke`, which needs no host permission. It lost for three reasons:
  - it would be the only non-YouTube request 2.0 ever sends, carrying a credential to Google, which muddies AMO's `none` and the "only YouTube" promise;
  - it would itself need consent first;
  - most refresh tokens have likely expired already, since unverified External apps in Testing get 7-day tokens (unverified).
- *Second runner-up:* a Google host permission with a proper revoke. It lost because it breaks ADR-0001, and Firefox never grants new origins on update.

### 2.8 Before consent

- **REL-MIG-29** Until the user agrees, everything carried over is **stored but inert**:
  - `scripting.getRegisteredContentScripts()` returns nothing;
  - no site core is injected into any tab;
  - no probe runs, so nothing is tracked, added or caught.
- **REL-MIG-30** No request reaches YouTube before Agree: no claiming, no playlist titles, and no account or signed-in probe.
  - So the note shows only stored values: "{N} playlists you chose in 1.x", the carried percentage and the key.
  - Titles and the account appear in the outcome after Agree.
- **REL-MIG-31** Local checks are allowed before Agree. Site access (`permissions.contains`) is one, so the note can show **Give access to YouTube** before Agree.
- **REL-MIG-32** While the note is pending, the toolbar badge is the violet "!" on every tab, ticket 09's "something needs you". It outranks every other reason ([FT-57, FT-58](04-features-accounts-data.md#18-the-toolbar-badge)). (R12)
- *Runner-up:* let carried auto-add keep running and ask for consent only for new features. It lost because the map and ticket 06 settle that upgraders keep their features "once they accept". 1.4.5 handled watch data through Google's API; 2.0 handles it through YouTube's page, which is a new kind of handling, and the disclosure must come first.

### 2.9 What the note is built from

- **REL-MIG-33** The migration writes `device.upgradeNote` as `{state: "pending", details: UpgradeDetails, opened: false}`:

```ts
type UpgradeDetails = {
  from: "1.4.5" | "1.5.0"                   // as unclaimed.from: read from the keys found, never from onInstalled (R64)
  autoAdd: { kept: number; dropped: number } // IDs kept in `unclaimed`; entries left out by the clean-up
  pct: { value: number; wasUnset: boolean }  // wasUnset → the note asks (§3.3)
  feedback: boolean                          // from toastEnabled
  shortcut: {
    raw: string                              // 1.4.5's string, shown only when it can't be used
    key: Key | null                          // §2.5's conversion
    playlist: boolean                        // a cleaned playlist came over
    note: "ok" | "ctrl-never-fired" | "unconvertible" | "no-playlist" | "no-key" | "none"   // R21
    clash?: string                           // ticket 08's clash warning ID, e.g. YouTube's K
  }
  credentialsDeleted: boolean
}
// device.upgradeNote = { state: "pending" | "done"; details: UpgradeDetails; opened: boolean } | null
```

- **REL-MIG-34** `unclaimed` has ticket 16's shape:
  - `from`, which is `"1.4.5"` or `"1.5.0"`;
  - `autoAdd`, a list of IDs;
  - `shortcutPlaylist`;
  - `filters`;
  - `at`.

  It stays in this browser, never syncs, and is kept until it's claimed or discarded.

### 2.10 Claiming the unclaimed setup

The full rules are in [04 §2.6](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming) (ACC-28 to ACC-35, from ticket 11). Summary:
- **REL-MIG-35** Claiming runs only after consent, with the first signed-in, normal-window tab that answers.
  - The claiming account is the first one seen whose own playlist list holds any of the setup's playlist IDs.
  - Matching is by playlist ID, never by title.
- **REL-MIG-36** IDs the claiming account doesn't own are dropped and counted.
  - If the account already has a setup, the claimed choices are merged in without replacing anything: missing auto-add playlists are added.
  - The shortcut's playlist is used only if that shortcut has none.
- **REL-MIG-37** The outcome shows in the note if the note is still open ([3.4](#34-agree-and-not-now)). Otherwise it shows as ticket 11's one-time popup notice ([ACC-32](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming)): "Your auto-add playlists and shortcut from 1.x are now set up for {Account}." plus, if any were dropped, "{N} of them weren't on this account and were left out."
- **REL-MIG-38** An unclaimed setup is never used.
  - On an account that doesn't own its playlists, the popup says "Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them, or set up {Account} below.", with **Switch account** and **Discard**.
  - Claiming is refused from private windows.

### 2.11 Edge cases

| Case | What happens |
|---|---|
| The update lands while the add-on is disabled, or at browser start | No `onInstalled`. The migration still runs from stored state at the next start, and the note opens then (R64). |
| 1.4.5 installed, but no 1.x key left (e.g. nothing ever set) | A fresh install: no migration, no note, and no tab opens on the update. The "!" and the popup's "Waiting for your OK" lead to first run (REL-MIG-03; R64, R76). |
| No youtube.com access (installed on Firefox 125/126, or revoked) | The update still installs silently. The note shows "Playlist Pigeon doesn't have access to YouTube in this browser, so nothing can run there yet." with **Give access to YouTube**, which requests access first thing in the click. |
| Firefox 125–139 (1.4.5's floor is 125) | Stays on 1.4.5 silently. AMO offers 2.0 only to Firefox 140 and later. |
| Signed out, no YouTube tab, or another account at Agree | Ticket 11's outcomes, shown in the note (§3.4) |
| The user never agrees | Everything stays inert, with the badge. 1.4.5's carried choices are kept indefinitely. |
| AMO rolls back 2.0.0 | It lands on 1.4.5's code, which is **inert** because its credentials were deleted, and it leaves 2.0's data alone. Hence fix forward for 2.0.0 (REL-CHK-08). |
| A later downgrade below a `schema` bump | Inert. The popup says "This version of Playlist Pigeon is older than your settings. Update it to continue." ([DATA-48](04-features-accounts-data.md#410-schema-versions-and-migrations)) |

## 3. The upgrade note

### 3.1 Opening the note

- **REL-CON-01** After the migration, if `upgradeNote.state` is `pending` and `opened` is false, the background opens the first-run page's upgrade view (`onboarding.html`) with `tabs.create({active: false})` next to the current tab. It then sets `upgradeNote.opened = true`.
  - The tab opens in the background, so a playing video isn't interrupted.
  - The toolbar "!" points to it. (R37)
- **REL-CON-02** The note opens **once.** After that, the popup's banner reopens it with **Review**.
  - Restarting the browser before or after Agree never reopens it (S7).
  - The banner's title is "Playlist Pigeon 2.0 is waiting for your OK". Its line names only what actually carried over, the same features the note's "Kept" section shows ticked (R60):
    - auto-add and the shortcut: "Auto-add and your shortcut are paused until you agree.";
    - auto-add only: "Auto-add is paused until you agree.";
    - the shortcut only: "Your shortcut is paused until you agree.";
    - neither: "Nothing runs until you agree."

    Then, in every case: "No Google credentials needed anymore." The banner's place among the others is [05's UI-POP-10](05-ui.md#banners) row 1.
- **REL-CON-03** The note is decided when the page opens. After Agree it shows its outcome in place, and doesn't switch to first run (ticket 15).
- *Runner-ups:*
  - a foreground tab, which interrupts a playing video;
  - only a badge and a popup banner, which reads as "2.0 broke auto-add" (ticket 09).

### 3.2 Copy

**PROVISIONAL name** (ticket 22). The copy rules:
- `{…}` are values from `details` and the store;
- one sentence per line;
- the glossary's words.

**REL-CON-04** The note renders this copy, with its conditions. Its layout is [05's upgrade note](05-ui.md#the-upgrade-note) (UI-ONB-06, UI-ONB-07).

**Tab title:** Playlist Pigeon 2.0

> # YouTube Playlist Tools is now Playlist Pigeon
>
> **2.0 needs no Google credentials anymore.** It works through the YouTube account you're signed in to in this browser, the way YouTube's own buttons do. The client ID, client secret and sign-in tokens you set up for 1.x have been deleted from this browser.
> [Remove 1.x's access from your Google account ↗](https://myaccount.google.com/permissions) · If you made a Google Cloud project just for 1.x, you can delete that too.
>
> **Why the new name:** Google's rules don't allow extensions to be named after YouTube, so YouTube Playlist Tools is now Playlist Pigeon for YouTube™. It's the same add-on, and your settings came along.

*Only if site access is missing* (placed above "Kept"):

> ⚠ Playlist Pigeon doesn't have access to YouTube in this browser, so nothing can run there yet. **[Give access to YouTube]**

> ## Kept from 1.4.5 · *Paused until you agree below*

This section lists only what actually carried over, and shows only when at least one of its rows does (R60).

**[✓] Auto-add** · *Doesn't change the page*

The row shows only when a playlist came over (`autoAdd.kept` > 0).
- Adds to {N} playlists you chose in 1.x.
  - *If `dropped` > 0:* {M} entries weren't playlist IDs and were left out.
- *Percentage set (`wasUnset` false):* Adds a video once you've watched {P} % of it.
  - *Unset:* the question in [3.3](#33-the-one-question-the-note-asks).
- Auto-add now counts only what you actually watch. Skipping ahead and ads don't count.
- It never adds a video twice, and it tells you when an add fails.
- *Feedback off:* Confirmations stay off, as in 1.x. Failures now always show.
- *Feedback on:* Confirmations stay on, as in 1.x.
- Your playlists take videos, not Shorts. You can add Shorts per playlist in Settings.

**[✓] Playlist shortcuts** · *Keys only, doesn't change the page*

The row is ticked only when `note` is `ok` or `ctrl-never-fired`. It's shown whenever `note` isn't `none`.
- *Ticked:* {Key} saves the video you're watching, or pointing at, to the playlist you chose in 1.x.
- *`ctrl-never-fired`:* {Key} never worked in 1.4.5 because of a bug. It works now.
- *A bare or Shift-only key:* It no longer fires while you type in a search box or a comment.
- *`clash` set:* ticket 08's warning, e.g. "YouTube uses K for Play/pause. This shortcut replaces it on YouTube."
- *If the picker and undo keys got their keys:* Also new: Alt+Shift+P opens a playlist picker, and Alt+U undoes a save while its message is on screen. (R44; [YT-KEY-25](02-youtube.md#285-feedback-and-the-undo-key))
- *`unconvertible` (unticked):* Your 1.x key ({raw}) can't be used in 2.0. Set a new one in Settings.
- *`no-playlist` (unticked):* Your 1.x key {Key} had no playlist. Choose one after you agree.
- *`no-key` (unticked):* Your 1.x shortcut had no key. Its playlist is kept; set a key in Settings. (R21)

> ## New in 2.0
> All off. Tick any you want, or switch them on later in Settings.

Then one unticked row per other feature, with [FT-01](04-features-accounts-data.md#11-the-features)'s names and footprint tags and 05's one-line descriptions ([UI-SET-08, UI-SET-09](05-ui.md#feature-cards)):
- Quick-save on thumbnails;
- Queue button on thumbnails;
- Watch-page button;
- Right-click for the video menu;
- Quick actions and Quick-action shortcuts (YouTube Music);
- Settings sync.

> ## Before you continue

Then the disclosure ([4.1](#41-the-disclosure)), followed by **[Agree and turn on {N} features]** (**[Agree]** when N = 0) and **[Not now]**. N counts the ticked rows.

### 3.3 The one question the note asks

- **REL-CON-05** The question shows only when `details.pct.wasUnset` is true. That's the one case where 1.4.5 showed one thing and did another.

> 1.4.5 showed 50 % here, but it was actually adding videos as soon as they started playing. Which do you want?
> (•) As soon as a video starts playing, like 1.4.5 did
> ( ) Once half of it is watched, as 1.4.5 showed

- **REL-CON-06** The first option is the default. The choice is applied on Agree: the first option keeps `settings.autoAdd.pct = 0`, and the second sets 50. Every other carried value is stated, not asked.
- *Runner-up:* state 0 % silently, as ticket 16 assumed. It lost because the note would show a number the user never saw. Since auto-add waits for Agree anyway, asking costs nothing, and the user's own choice beats either guess.
- *Second runner-up:* ask about every value. It lost as noise: the other values showed what they did.

### 3.4 Agree and Not now

- **REL-CON-07** **Agree** makes one store change that:
  1. applies the note's ticks to the feature switches, and the percentage choice ([3.3](#33-the-one-question-the-note-asks));
  2. sets `device.consent = {v: 1, at}`;
  3. sets `upgradeNote.state = "done"`.

  The reconciler then registers, and claiming ([2.10](#210-claiming-the-unclaimed-setup)) starts.
- **REL-CON-08** On Chrome, if a YouTube Music feature is ticked, or Playlist shortcuts with "Also on YouTube Music" on, the same click calls `permissions.request` for music.youtube.com **first**, before anything is awaited ([ARC-MAN-03](06-architecture.md#631-manifest-per-browser)). (Chrome has no upgraders; the rule is shared with first run, REL-CON-14; R53.)
- **REL-CON-09** On Firefox, Settings sync declares no data type ([SYNC-26](04-features-accounts-data.md#39-firefoxs-data-collection-declaration)), so a ticked Settings sync makes Agree ask Firefox for nothing. Only under [§13](#13-if-an-amo-reviewer-objects)'s fallback, if a reviewer made sync an optional data type, would the same click first call `permissions.request({data_collection: […]})`, before anything is awaited. (R83)
- **REL-CON-10** After Agree the note shows, in place:

> ✓ **You're all set.**

Then one of these, from ticket 11's outcomes:
- Your auto-add playlists and shortcut from 1.x are now set up for {Account}: {titles}. *(If any were dropped: "{M} of them weren't on this account and were left out.")*
- Sign in to YouTube and your 1.x playlists will be picked up. *(Signed out.)*
- Open YouTube and your 1.x playlists will be picked up. *(No YouTube tab open.)*
- Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them. **[Switch account]**
- Your features are on. *(Nothing carried over.)*

Then **[Open YouTube]** **[Open Settings]**.

- **REL-CON-11** **Not now** changes nothing: consent stays `null`, the note stays pending, and the badge and the popup's Review banner stay. The note shows:

> Everything stays paused. The toolbar icon keeps a ! until you decide. **[Agree and turn on {N} features]**

## 4. First run and consent

### 4.1 The disclosure

- **REL-CON-12** One disclosure text is used in three places, each with its own heading ([UI-ONB-08](05-ui.md#the-disclosure)):
  - first run: "Before you start";
  - the upgrade note: "Before you continue";
  - Settings' dialog, or the popup's sheet, when a feature is switched on without consent: "Before this feature can run" ([FT-32](04-features-accounts-data.md#15-the-consent-gate), [UI-ONB-09](05-ui.md#the-disclosure)).

> Playlist Pigeon works inside your YouTube and YouTube Music tabs, as the account you're signed in to there. For the features you switch on, it:
> - **reads what you watch and listen to there:** the video or song, its channel, and how much of it you've played;
> - **reads and changes your playlists, as you:** it lists them, checks which ones already hold a video, and adds or removes videos when you ask or when auto-add does, using YouTube's own requests;
> - **signs those requests the way YouTube's page does,** with YouTube's sign-in cookie, inside the YouTube tab. It never stores that cookie or sends it anywhere else; *(PROVISIONAL, ticket 25: removed if no shipped route reads the session cookie, R48)*
> - **watches for the shortcut keys you set** on YouTube and YouTube Music pages, and ignores every other key;
> - **keeps its settings in this browser,** including your account's name, @handle and picture, a list of your playlists, and how much of each video you've watched (for up to 30 days).
>
> Nothing is sent to us or to anyone but YouTube. There are no ads and no analytics. If you turn on Settings sync, your settings also travel through {Firefox's | Chrome's} own sync.
> [Privacy policy ↗]

- **REL-CON-13** On first run and the upgrade note, the buttons are **Agree and turn on {N} features**, **Agree** (when N = 0) and **Not now**. "Before this feature can run" has **Agree and turn on {Feature}** and **Cancel** (UI-ONB-09).
- **REL-CON-14** On Chrome, when a YouTube Music feature is ticked, or Playlist shortcuts, whose preset turns "Also on YouTube Music" on ([FT-44](04-features-accounts-data.md#17-site-access-and-youtube-tabs); R53):
  - Agree calls `permissions.request` for music.youtube.com first in the click;
  - step 1 says beforehand: "Chrome will ask for access to music.youtube.com when you agree.";
  - if the user denies it, consent and the other ticks still apply. The ticked YouTube Music features, and Playlist shortcuts' "Also on YouTube Music", are saved on but held with "Needs site access", with **Give access** in the popup and Settings. Playlist shortcuts runs on YouTube, and nothing is registered or injected on music.youtube.com until access is granted ([FT-40](04-features-accounts-data.md#16-first-run), [FT-52](04-features-accounts-data.md#17-site-access-and-youtube-tabs)). (R14, R53)
- **Why it reads this way:**
  - **Chrome:** it names Chrome's categories in plain words (web history, user activity, website content, authentication, the account's name), says what each is for, and gets an explicit OK. That's the prominent in-product disclosure Chrome requires. The listing repeats it, because Chrome's two help pages disagree on whether the listing alone is enough (ticket 03).
  - **AMO:** it also meets AMO §6.2's "shown … immediately after the update" for upgraders.

### 4.2 The rest of first run's copy

First run's three steps (pick features › Before you start › Finish setting up) are [FT-40](04-features-accounts-data.md#16-first-run), and their layout is [05's first-run page](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note) (UI-ONB-01 to UI-ONB-05). **REL-CON-15** These lines are final:
- **Step 1 heading:** What should Playlist Pigeon do? / Tick what you want. Everything else stays off.
- **Step 1 footer:** Nothing changes on YouTube until you pick it. You can change this any time in Settings. **[Continue with {N} features]** / **[Continue without features]**
- **After Not now:** **Nothing is running.** Agree later from the toolbar icon or Settings. Until then, Playlist Pigeon does nothing on YouTube. **[Back]**
- **The popup while consent is missing:** Waiting for your OK. **[Review]** (for upgraders: "Playlist Pigeon 2.0 is waiting for your OK")

### 4.3 Consent rules

- **REL-CON-16** One consent of our own gates every feature, on both browsers ([ADR-0010](../../../docs/adr/0010-one-consent-gates-every-feature.md)). It's stored as `device.consent = {v, at}`, per browser, and never synced.
  - It applies on Firefox too, even when Firefox shows its own data-collection prompt. Firefox's prompt covers data types; ours covers what each feature does, and it's the moment upgraders' choices take effect.
  - *Runner-up:* let Firefox's built-in consent stand in on Firefox. It lost for three reasons: it exists only when a data type is required, and 2.0 declares `none` (R83); it covers neither the feature choice nor claiming; and two consent flows mean two code paths.
- **REL-CON-17** Consent is versioned through one constant, and 2.0 writes `v: 1`.
  - The version is bumped only when the disclosure text changes.
  - A release must change the disclosure whenever data handling changes (Chrome: "proactively disclose … if data handling practices change").
- **REL-CON-18** When the stored `v` is lower than the build's, features pause. The popup and the note page then show "Playlist Pigeon {version} handles your data in a new way. Review and agree to keep it running."
- **REL-CON-19** A patch release can never change the consent version constant. `hotfix-freeze` enforces this (REL-CI-38).
- **REL-CON-20** Settings › Privacy & data shows "You agreed on {date}." with **[Read it again]** and **[Withdraw and pause everything]**.
  - Withdraw asks: "**Withdraw your consent?** Every feature stops in this browser and nothing is read from YouTube until you agree again. Your settings are kept." with **[Withdraw]** **[Cancel]**.
  - Withdraw sets consent to `null`. The reconciler unregisters everything, and open tabs tear down.
- **REL-CON-21** Consent may be given from a private window ([DATA-32](04-features-accounts-data.md#47-the-private-window-write-guard), ticket 16's write table).

## 5. Permission prompts by audience

The manifests are in [06 §6.3.1](06-architecture.md#631-manifest-per-browser) (ARC-MAN-01 to ARC-MAN-05, from ticket 10 §11), and the floors in [§6.3.2](06-architecture.md#632-version-floors). In short:
- **Both builds:** `permissions: ["storage", "scripting"]`.
- **Chrome:**
  - `host_permissions: ["https://www.youtube.com/*"]`;
  - `optional_host_permissions: ["https://music.youtube.com/*"]`;
  - `minimum_chrome_version: "121"`.
- **Firefox:**
  - `host_permissions: ["*://*.youtube.com/*"]`, the exact pattern 1.4.5's content script was granted;
  - `strict_min_version: "140.0"`;
  - `data_collection_permissions: {required: ["none"]}` (R83).
- **Removed:** `identity`, `activeTab` and every Google host.

The strings below are **settled** ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)), all read on 2026-10-19:
- **Firefox's** come from its own `extensionPermissions.ftl`, `extensions.ftl` and `Extension.sys.mjs` (main branch), and Mozilla's support article "Permission request messages for Firefox extensions".
- **Chrome's** come from Chromium's `generated_resources.grd`, and stay as read there.

Ticket 25's check P1 now only glances at the real dialogs. If one differs, this table is adjusted.

| Audience | When | What they see |
|---|---|---|
| **Firefox 1.4.5 upgrader** with youtube.com access (nearly all) | The update, within about a day | **Nothing from Firefox** (REL-CON-22). Then our note tab (§3). |
| Firefox 1.4.5 upgrader **without** access (125/126 installs, or revoked) | The update | Nothing from Firefox. The note's **Give access to YouTube** opens Firefox's permission prompt for the youtube.com domain. |
| Firefox 1.4.5 upgrader on Firefox < 140 | — | Nothing. They stay on 1.4.5. |
| Firefox upgrader, **only under [§13](#13-if-an-amo-reviewer-objects)'s fallback**, if a reviewer requires a data type | The update | The update is **held**: an app-menu badge, then about:addons: "You must approve new permissions before the updated version will install…", listing the type (e.g. "website activity"). Cancel keeps 1.4.5 and asks again at the next daily check. |
| **Firefox new install** (140+) | Install | The header "Add Playlist Pigeon for YouTube™", with no question mark. Under "Required permissions:", one line: "Access your data for sites in youtube.com domains". `storage` and `scripting` have no line at all. Under "Data collection:": "The developer says this extension doesn't require data collection." Then first run. (about:addons later lists the same grant as "Access your data for sites in the youtube.com domain".) (R83) |
| Firefox, Settings sync switched on | That click | **Nothing from Firefox:** sync declares no data type ([SYNC-26](04-features-accounts-data.md#39-firefoxs-data-collection-declaration); R83). Only under §13's fallback, with sync as an optional type, would it show "Playlist Pigeon for YouTube™ requests additional data collection", then "New data collection:" with "The developer says the extension wants to collect: {type}", and Allow / Deny. |
| **Chrome new install** | Install | Add "Playlist Pigeon for YouTube™"? / It can: **Read and change your data on www.youtube.com**. Then first run. |
| Chrome, the first thing that needs music.youtube.com: a YouTube Music feature, or Playlist shortcuts' "Also on YouTube Music" (at first run or later; R53) | That click | "Playlist Pigeon for YouTube™" has requested additional permissions. / It could: **Read and change your data on music.youtube.com**, with Allow / Deny |
| Chrome, the user restricted site access | Any time | No prompt by itself. Our **Give access** button calls Chrome's prompt. On Chrome 133+, while a feature for that site is on, the extension also calls `addHostAccessRequest` on the site's open tabs, so Chrome's extensions menu offers the grant ([FT-53](04-features-accounts-data.md#17-site-access-and-youtube-tabs), [ARC-ACC-61](06-architecture.md#6212-no-tab-not-signed-in-no-site-access); PROVISIONAL). |
| Either browser, any later 2.x | The update | **Nothing.** The hotfix lane freezes the manifest. A minor release that adds a warning would disable the Chrome extension until it's accepted and hold Firefox updates, so it needs the checklist's sign-off (REL-CHK-21). |

- **REL-CON-22** The Firefox 1.4.5 → 2.0 update shows no Firefox prompt. This holds because:
  - `storage` and `scripting` were already held, and neither has a message;
  - dropping `identity` and `activeTab` is silent;
  - the origin is unchanged, so no message-bearing permission is new;
  - on update, Firefox shows only added *required* data types, never `none`. (R83)
- **REL-CON-23** Neither `storage` nor `scripting` shows an install warning on either browser. On Firefox they have no message at all (R83).
- **REL-CON-24** Chrome asks only for www.youtube.com at install. Music.youtube.com is requested only from the click that switches on the first thing that needs it, whether that's first run's Agree, Settings or the popup: a YouTube Music feature, or "Also on YouTube Music" while Playlist shortcuts is on, which includes switching Playlist shortcuts on with that option preset on. The YouTube Music section switch never asks ([FT-44](04-features-accounts-data.md#17-site-access-and-youtube-tabs); R53).
  - If the user denies the prompt raised by switching Playlist shortcuts on in Settings or the popup, Playlist shortcuts goes on and "Also on YouTube Music" turns off, with "No access to YouTube Music, so shortcuts work on YouTube only." shown in place ([FT-52](04-features-accounts-data.md#17-site-access-and-youtube-tabs)). First run's Agree keeps REL-CON-14's rule. (R71)

## 6. Versioning

- **REL-CI-01** Versions are `MAJOR.MINOR.PATCH`, numbers only. AMO rejects letters for MV3 ("Letters are no longer allowed"), and Chrome allows only dotted integers. `version_name` isn't used, because Firefox ignores it.
- **REL-CI-02** `package.json`'s `version` is the one source. It feeds both manifests, and the release is tagged `v{version}`. The same number on both stores always means the same source.
- **REL-CI-03** 2.0.0 is the first 2.x, and 1.5.0 never ships: `package.json` goes from 1.5.0 straight to `1.99.1` at the first beta.
- **REL-CI-04** Betas sort below the release they precede:
  - 2.0's betas are `1.99.N`, above 1.4.5 and below 2.0.0;
  - a later 2.Y's betas are `2.(Y−1).9NN`;
  - CI derives the channel from this pattern (REL-CI-24);
  - betas after the launch are Firefox-only, because the Chrome item is public by then.
- **REL-CI-05** A beta number is never reused, because AMO version numbers are unique across channels.
- **REL-CI-06** **PATCH** is the hotfix lane only (REL-CI-39). The manifest is identical apart from `version`, the listing, privacy and consent files are unchanged, and so is the storage `schema` (REL-CI-38; R62).
- **REL-CI-07** **MINOR** covers features, UI, dependency bumps and `schema` migrations. A change to a permission, a host, data collection or the disclosure is allowed only in a minor release, with the checklist's sign-off (REL-CHK-21).
- **REL-CI-08** **MAJOR** is reserved for a break in the synced copy's layout (`s:meta.v`, ticket 16), or for anything that needs every user to see an upgrade note again.
- **REL-CI-09** The floors are Firefox `strict_min_version` "140.0" and `minimum_chrome_version` "121" (ticket 10), confirmed for ticket 06's question.
  - 128 lost because AMO's `websiteActivity` fallback would then need a custom consent screen.
  - 153 lost because it would strand ESR 140 users mid-migration.

## 7. Betas

Recorded as [ADR-0011](../../../docs/adr/0011-betas-from-github-pages.md): betas are unlisted builds of the same add-on, served from this repo's GitHub Pages.

### 7.1 Firefox

- **REL-CI-10** The `build:beta` script, `wxt build -b firefox --mode beta` ([Q-TOOL-16](07-quality.md#718-scripts)), builds `1.99.N` into `.output/firefox-mv3-beta/`, the way ticket 17's `livecheck` mode does. In that mode only, `build/manifest.ts` adds `browser_specific_settings.gecko.update_url = "https://alioun.github.io/yt-playlist-tools/beta/updates.json"`. Nothing else differs from the store build.
- **REL-CI-11** AMO signs the beta on the **unlisted** channel of the same add-on ID. AMO allows listed and unlisted versions under one ID, and rejects `update_url` only in listed versions.
- **REL-CI-12** The signed `.xpi` is attached to a GitHub pre-release. `beta/updates.json` is regenerated from the pre-releases at deploy time, with each `.xpi`'s HTTPS asset URL and its `sha256` (REL-CI-44).
- **REL-CI-13** Installing a beta over 1.4.5 counts as an upgrade for Firefox (ADDON_UPGRADE). Site access carries over and the migration runs, exactly as the real update will.
- **REL-CI-14** **The hand-off.** Firefox keeps using the *installed* version's `update_url`. So once AMO publishes 2.0.0, AMO's signed listed `.xpi` (downloaded from the Developer Hub) is attached to the `v2.0.0` GitHub release, and `updates.json` serves it as the last entry. Testers move to 2.0.0, which has no `update_url`, and follow AMO from then on.
- **REL-CI-15** Diagnostics shows "{version} (beta)" for a beta, derived from the version pattern ([HEALTH-22](04-features-accounts-data.md#55-diagnostics-check-now-and-the-report); R65). Nothing else in the product differs from the store build.

### 7.2 Chrome

- **REL-CI-16** The Chrome beta is the **main store item** with visibility **Unlisted**. Each `1.99.N` reaches it through the API, and testers install it from its link.
  - Beta builds of the Chrome zip are ordinary store builds.
  - This moves Chrome's slow first review of a new item off the launch path.
  - It also gives 2.0.0 a rollback target on the same item with the same `schema` (REL-CHK-09).
- *Runner-up:* a separate "BETA" Chrome item. It lost because it takes the publisher's second of two default slots, needs "BETA" naming rules, and its testers wouldn't move to the real item.

### 7.3 Recruiting

- **REL-CI-17** Testers are recruited without spam and without new channels:
  - a line on the AMO listing during the beta: "A rebuilt 2.0 is in beta: {site}/beta";
  - the README;
  - the GitHub pre-release;
  - the developer's own browsers, daily.

## 8. Release order, soak and rollback

### 8.1 Phases

| Phase | Firefox (AMO) | Chrome Web Store | Exit when |
|---|---|---|---|
| **0. Ready** | API key; listing edits drafted | Developer account ready; the Store listing and Privacy tabs drafted | §18's "Once" items are done |
| **1. Beta** (≥ 14 days) | Versions `1.99.N`, **unlisted**, on the *same* add-on ID, with `update_url` pointing at `https://alioun.github.io/yt-playlist-tools/beta/updates.json`. Testers install from the site's `/beta/` page. | The first Chrome upload is `v1.99.1`'s Chrome zip, **by hand** as **Unlisted** (the API can't create items), with the Store listing and Privacy tabs filled. From `1.99.2` on, the same item gets each `1.99.N` through the API. Testers install from its link. | REL-CHK-04 |
| **2. Firefox release** | Tag `v2.0.0`, which goes to AMO **listed**. It's auto-published within about 24 h, and 1.4.5 users update over the following day. | The same day, **by hand** in the dashboard: visibility → Public, upload 2.0.0, and "publish manually after approval" (staged). The API can't change visibility, and items publish with their existing visibility. | Released |
| **3. Soak** (7 days) | 66 real upgrades plus the beta testers. Hotfixes ship here in 1–2 days. | Review runs in parallel (days, up to weeks) | No open blocker; the static watch is green, and the browser watch green or inconclusive ([Q-CI-8](07-quality.md#773-release-gates-summary)) |
| **4. Chrome public** | — | Publish the staged version. If a 2.0.x shipped during the soak, cancel the staged 2.0.0 and submit that version instead, by hand in the dashboard, with visibility Public and "publish manually after approval" (staged), as in phase 2 (R21). After this, every Chrome release goes through the API. | — |

- **REL-CHK-01** Releases follow these phases in order. Chrome 2.0.0 is never published before the 7-day Firefox soak ends.
- **REL-CHK-02** `PUBLISH_CWS` follows the hand-made Chrome submissions:
  - `v1.99.1` runs with `PUBLISH_CWS=false`, and its Chrome zip is uploaded by hand as Unlisted, since the API can't create the item. From `v1.99.2` on, `PUBLISH_CWS=true`.
  - The `v2.0.0` run, and any 2.0.x during the soak, have `PUBLISH_CWS=false`, because those Chrome submissions are made by hand as Public with staged publishing.
  - After phase 4, `PUBLISH_CWS=true` and `CWS_PUBLISH_TYPE=DEFAULT_PUBLISH`. (R21)
- **REL-CHK-03** A beta lasts at least 14 days.
- **Why Firefox first:**
  - existing users and the upgrade path, the riskiest part, are Firefox-only;
  - AMO fixes reach users in 1–2 days, against days to weeks of Chrome review;
  - a Chrome listing's first reviews make or break it, so they should meet the soaked build.
  - *Runner-up:* both stores public on the same day. It lost because a launch bug on Chrome would then wait days for its fix, in front of first-time users.
  - *Second runner-up:* Chrome first, since it has no existing users. It lost because Chrome review sets the pace either way, and the slower store would carry the untested build.
- **Why a beta at all:**
  - it's the only way to see the migration on other people's real 1.4.5 data, and YouTube's experiments on accounts other than the developer's;
  - it moves Chrome's slow first review off the launch path;
  - it costs one static file and a CI channel switch, which later 2.x betas reuse.
  - *Runner-up:* no beta, with only the developer's own upgrade tests. It lost on those three counts.

### 8.2 Leaving the beta (launch criteria)

- **REL-CHK-04** 2.0.0 is tagged only when all of these hold:
  - ticket 22 is confirmed;
  - the Firefox manifest declares R83's `data_collection_permissions: {required: ["none"]}`, or §13's matching fallback row if a reviewer has objected;
  - ticket 25's route table is filled;
  - the upgrade-test matrix (§17) is green on the release candidate;
  - at least 14 days of beta have run, including at least one Chrome review of a `1.99.N` update;
  - no issue labelled `blocker` is open, the static watch is green, and the browser watch is green or inconclusive;
  - the signed-in live check is recorded for the candidate, and so are the timing figures: within budget in Chromium, which gates them, while Firefox's `performance.mark` timings are recorded for information only ([Q-PERF-40, Q-PERF-41](07-quality.md#767-enforcement); R31);
  - the manual screen-reader pass of the popup and settings is done on the candidate (R38);
  - the README is rewritten for 2.0 (REL-CI-54; R39);
  - the AMO and Chrome listings, screenshots and the dashboard's privacy tab are final. The privacy page has been live since the first beta (REL-STORE-17; R18). (R18, R31, R38, R39, R83)

### 8.3 Rollback and fix-forward

- **REL-CHK-05** The general rule (ticket 18): **roll back in the store first, then submit the fix.**
  - Chrome's rollback discards pending and staged submissions.
  - AMO's rollback cancels pending reviews in the same channel.
- **REL-CHK-06** AMO's rollback republishes the previous *approved listed* version's file under a new, higher number that you choose. Only the version immediately before the current one is offered.
  - Use the next free patch number for the rollback; the fix then takes the one after.
  - Users get it within 24 h.
- **REL-CHK-07** Chrome's rollback goes back to the previous published version with no review, and it's live within a minute.
- **REL-CHK-08** **The exception is 2.0.0 on AMO.** Its predecessor is 1.4.5, which is inert after the migration. So 2.0.0 is **fixed forward** through the hotfix lane, which takes our own bugs too (REL-CI-39; R62). It's rolled back only to stop harm: writes to the wrong account, a request storm, or data loss. Users then sit on an inert 1.4.5 until the fix.
- **REL-CHK-09** Chrome 2.0.0 rolls back to the last `1.99.N`, which is on the same item with the same `schema`. One dashboard rollback is rehearsed during the beta.
- **REL-CHK-10** A release that bumps `schema` makes rolling back past it inert (ticket 16 §10.1). The release PR says so (REL-CHK-22).
- **Fix speed** (ticket 18):
  - **AMO:** about 1–2 days, since Firefox checks for updates every 24 h.
  - **Chrome:** review is usually a few days and can take weeks. There's no expedited review.
  - **Partial rollout:** only above 10,000 seven-day users, so not available at launch.

## 9. Store listings

All text in this section is **PROVISIONAL on the name** (ticket 22).

- **REL-STORE-01** The listing text lives in `store/listing/`, so the hotfix check can freeze it (REL-CI-38). The screenshots and promo tile live there too.

### 9.1 Fields

| Field | AMO (existing listing) | Chrome Web Store (new item) |
|---|---|---|
| Name | **Playlist Pigeon for YouTube™**. Set it in the manifest *and* edit it in the Developer Hub. The slug `youtube-playlist-tools` and the gecko ID stay unchanged. | From the manifest |
| Summary | "Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click away. Every feature is opt-in. (Formerly YouTube Playlist Tools.)" (181 of 250) | Manifest `description` (121 of 132): "Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click away." |
| Description | §9.2, with the "formerly" line first | §9.2, without the "formerly" line |
| Category | **Photos, Music & Videos** (today "Other") | **Tools** (Productivity). *Runner-up:* "Functionality & UI", which reads as page tweaks. |
| Homepage | `https://alioun.github.io/yt-playlist-tools/` | Same |
| Support | `https://github.com/Alioun/yt-playlist-tools/issues/new/choose` | Support URL: the same |
| Privacy policy | `https://alioun.github.io/yt-playlist-tools/privacy/`, linked in the description, and also pasted into AMO's privacy-policy field while the Developer Hub offers it | Privacy tab URL: `https://alioun.github.io/yt-playlist-tools/privacy/` |
| Icon | Upload the pigeon in the Developer Hub (today the listing shows AMO's default) | 128×128, with 96×96 artwork |
| License | MPL-2.0 (unchanged) | — |
| Compatibility | Firefox desktop only. Firefox for Android stays unticked (out of scope). | — |

- **REL-STORE-02** Through 2.x, AMO's summary and description carry "Formerly YouTube Playlist Tools" (ticket 22).
- **REL-STORE-03** Both listings keep the attribution exactly as written: "Not affiliated with or endorsed by YouTube or Google. YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions."
  - The same lines appear in Settings › About and in the README.
  - Listing text writes "Shorts" on its own and never "YouTube Shorts". If it ever does, "YouTube Shorts" joins the trademark line, because it's a listed mark of its own.

### 9.2 Description (both stores)

> *(AMO only)* Formerly YouTube Playlist Tools.
>
> Playlist Pigeon files what you watch into your own YouTube playlists, the way you set it up. Every feature starts off: switch on only what you want, and YouTube looks exactly as before until you do.
>
> **On YouTube**
> • Auto-add: adds the videos you actually watch to playlists you pick, once you've watched enough of each. You choose how much, per playlist, and can filter by channel. Shorts too, if you want.
> • Playlist shortcuts: up to 20 keys, each saving to its own playlist, with your own labels. Alt+W saves to Watch later.
> • Quick-save on thumbnails: one click saves a video to your quick-save playlist; the arrow opens a picker that shows where it already is.
> • Queue button on thumbnails: adds a video to the end of the queue.
> • Watch-page button: shows auto-add's status under the video, with Save to any playlist.
> • Right-click a video for YouTube's own ⋮ menu.
> • Create playlists from any chooser. Watch Later works everywhere.
>
> **On YouTube Music**
> • Quick actions: Play next and Add to queue for songs, albums and playlists; Save to playlist and Like for songs; Remove from queue for queued songs. Each is one click away, and you pick which buttons show.
> • Quick-action shortcuts: a key for each.
>
> **Everywhere**
> • A separate setup for each of your YouTube accounts.
> • Undo on every save.
> • Settings sync across your browsers, through your browser's own sync, off until you turn it on.
>
> **How it works**
> It works inside your YouTube and YouTube Music tabs, as the account you're signed in to there, using the same requests YouTube's own buttons send. It needs no Google sign-in, API key or password. Nothing is sent to the developer or to anyone other than YouTube, and there are no analytics or ads. Your settings stay in your browser, and in your browser's own sync if you turn it on.
> It relies on how YouTube's website works today, so a YouTube change can stop a feature until an update ships. Playlist Pigeon tells you when that happens.
>
> Privacy policy: https://alioun.github.io/yt-playlist-tools/privacy/ · Source code: https://github.com/Alioun/yt-playlist-tools · Problems and ideas: https://github.com/Alioun/yt-playlist-tools/issues
>
> Not affiliated with or endorsed by YouTube or Google. YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions.

- **REL-STORE-04** *Only under [§13](#13-if-an-amo-reviewer-objects)'s fallback, not at launch (R83):* if a reviewer requires a data type, AMO's description adds "Firefox asks you to allow sharing 'website activity' because the extension sends YouTube the videos you save, through your own YouTube account. Nothing goes to the developer."
- **REL-STORE-05** During the beta, the AMO listing adds "A rebuilt 2.0 is in beta: {site}/beta". The line is removed at launch.

### 9.3 Release notes for 2.0.0

- **REL-STORE-06** These notes go to AMO's release notes (sent as `{"en-US": …}`, REL-CI-31), the GitHub release and the site. They live in `store/release-notes/2.0.0.md`.

> 2.0 is a rebuild, and YouTube Playlist Tools is now Playlist Pigeon for YouTube™.
> • No Google Cloud credentials anymore: it works through the YouTube account you're signed in to. Your old client ID, secret and tokens are deleted from your browser.
> • Your auto-add playlists, shortcut, watch percentage and toast setting carry over. Nothing runs until you've reviewed them on the page that opens after the update.
> • Auto-add counts only what you actually watch, never adds a video twice, and no longer says "Added" when an add failed.
> • Shortcuts no longer fire while you type, can be cleared, and Ctrl shortcuts work.
> • New, and off until you switch them on: Watch Later, several named shortcuts, quick-save and queue buttons on thumbnails, a watch-page button, creating playlists, Shorts, YouTube Music quick actions, a setup per account, and settings sync.
> • Needs Firefox 140 or later.

- *Only under §13's fallback, not at launch (R83):* add "Firefox will ask you to approve sharing website activity: that's the videos you save, sent to YouTube through your own account."

### 9.4 Screenshots and images

- **REL-STORE-07** Both stores get the same five screenshots, at 1280×800 PNG. They replace AMO's two 2024 previews.
- **REL-STORE-08** Each screenshot has a caption band in the extension's own type and palette ([05 §5.9](05-ui.md#59-the-brand-provisional-ticket-22), UI-BRAND-03 to UI-BRAND-07): the pigeon's grey with the teal-to-violet accent, and never YouTube red.

| # | Shows | Caption |
|---|---|---|
| 1 | Settings › YouTube: feature rows with footprint tags, two of them on | Pick only what you want. Everything starts off. |
| 2 | A watch page with the popup open: This video shows a partly-added status line, e.g. "Added to Finished · Music for work at 90 %" ([UI-YT-18](05-ui.md#the-watch-page-button)), with the auto-add playlists unfolded | Auto-add what you actually watch. |
| 3 | The YouTube home page: the thumbnail stack, and the picker open with check marks and keys | Save from any thumbnail. |
| 4 | A YouTube Music album page: Play next / Add to queue in the album header and on rows, and, after the header's Add to queue, the toast "Added {n} songs from “{album}” to the queue" with **Undo** (R45; [YM-QA-9](03-youtube-music.md#4-where-the-controls-appear), [YM-Q-3](03-youtube-music.md#6-play-next-and-add-to-queue), [03 §13](03-youtube-music.md#13-feedback-toasts-and-undo)) | YouTube Music, one click away. |
| 5 | Settings › YouTube › Playlist shortcuts: three labelled shortcuts and the recorder | Your keys, your labels. |

- **REL-STORE-09** The screenshots' content (ticket 22):
  - only videos the user owns, or Creative Commons videos;
  - a demo account, "Pigeon Demo", with neutral playlists ("Recipes to try", "Finished", "Music for work");
  - no real personal data;
  - YouTube's logo cropped or out of focus.
- **REL-STORE-10** The screenshots are taken from the release candidate in a clean profile, in the light theme at 100 % zoom. The prototypes are layout references only, never the source: [05's catalogue](05-ui.md#513-prototypes-and-screenshots) gives [ps-60](https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/60-settings-youtube.png) for shot 1, and [ps-62](https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/62-settings-playlist-shortcuts.png) with [ps-08](https://github.com/Alioun/yt-playlist-tools/blob/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots/08-popup-key-recorder-recording.png) for shot 5. (R19)
- **REL-STORE-11** Chrome's small promo tile (440×280) is required. It shows the pigeon and "Playlist Pigeon" on the palette, with no YouTube imagery. The 1400×560 marquee is skipped at launch.
- **Icon brief (ticket 22):**
  - **Shape:** a small, round, perched grey pigeon in profile. Its wing is three stacked list lines; at 16 px it's the body plus two lines.
  - **Colours:** a slate body (about `#5E6875`) with a teal-to-violet neck (about `#14A39A` to `#7B5CD6`). No red, and no play triangle.
  - **Size:** 96×96 artwork inside 128×128, shipped at 16, 32, 48 and 128 px. Test it on light and dark toolbars.

## 10. Privacy policy

### 10.1 Hosting

- **REL-STORE-12** The policy is a static page on GitHub Pages for this repo, deployed from `site/` by `pages.yml` (REL-CI-43). The site has:
  - `/`: a one-page home with what the extension is, store links, privacy, source, how to report a problem, and the beta while it runs;
  - `/privacy/`: the policy;
  - `/beta/`: a minimal page for the beta, with the signed `.xpi`'s link (the newest pre-release's asset) and how to install it. The AMO listing's beta line and REL-CI-17's recruiting links point here (R21);
  - `/beta/updates.json`: generated at deploy time. (R21)
- **REL-STORE-13** The site is static HTML: no third-party scripts, fonts, analytics, or cookies of ours.
- **REL-STORE-14** `/` links to `/privacy/`. That satisfies Chrome's rule that the Limited Use statement sits on the homepage or one click from it.
- **REL-STORE-15** The page's history is the repo's, and each change is dated on the page.
- **REL-STORE-16** **The URL `https://alioun.github.io/yt-playlist-tools/` is a published contract.**
  - It's in both stores' privacy fields, and baked into every installed beta's `update_url`.
  - Renaming the repo moves it, and Pages leaves no redirect. So **the repo isn't renamed while betas are installed.**
  - A later rename (ticket 22 calls it optional) updates both stores' fields the same day.
  - A custom domain (e.g. playlistpigeon.app) would decouple the URL from the repo name. That's the user's call, and it costs a yearly fee.
- *Runner-ups:*
  - a `PRIVACY.md` viewed on github.com: Chrome asks for "a website belonging to your extension", and a blob page sits inside GitHub's own UI;
  - Pages from `/docs`: it would publish ADRs and agent docs as the site.

### 10.2 Text

- **REL-STORE-17** `/privacy/` publishes this text. It's published under the user's name, so the user reads and approves it before it goes live (§19). It takes effect from the first beta, 1.99.1, because Chrome's Privacy tab needs it for the first Unlisted upload and beta testers run 1.99.N (R18). Its "What's kept" lines match [DATA-03](04-features-accounts-data.md#41-where-data-lives) (R10, R43, R57). The cookie bullet is PROVISIONAL (ticket 25): it's removed if no shipped route reads the session cookie (R48). The Contact line's e-mail is PROVISIONAL (the user). (R10, R18, R43, R48, R57)

> # Privacy policy: Playlist Pigeon for YouTube™
>
> *Effective {1.99.1 release date}. Covers version 1.99 (beta) and later of the Playlist Pigeon for YouTube™ browser extension (formerly YouTube Playlist Tools) for Firefox and Chrome. Developer: Alioun (github.com/Alioun).*
>
> **In short:** Playlist Pigeon has no server. It works inside your YouTube and YouTube Music tabs, as the account you're signed in to there, and keeps its settings in your browser. Nothing is sent to the developer or to anyone else. No analytics, no ads, no tracking.
>
> ## What it handles, and why
> Only for features you switch on, and only after you agree to the notice the extension shows first:
> - **What you watch and listen to on YouTube and YouTube Music:** the video or song you're on, its channel, and how much of it you've actually played. Used by auto-add, channel filters, shortcuts and the watch-page button.
> - **Your playlists:** their names, privacy setting, number of items and thumbnail links, and which of them hold a given video. Used to let you choose playlists, to show where a video already is, and to never add it twice.
> - **Your YouTube account's name, @handle and picture link,** and a code derived from YouTube's internal account ID (the ID itself is never stored). Used to keep a separate setup per account and to show which one is in use.
> - **Keys you press on YouTube and YouTube Music pages:** only to recognise the shortcut keys you set. Other keys are ignored and never recorded.
> - **YouTube's sign-in cookie, inside your YouTube tab:** to sign the extension's requests to YouTube the same way YouTube's own page does, where YouTube's code can't send a request itself. It's used on the spot and never stored, logged or sent anywhere but YouTube. *(PROVISIONAL, ticket 25: removed if no shipped route reads the session cookie, R48)*
> - **Channels you add to channel filters:** their IDs, names and @handles.
>
> ## What leaves your browser
> - **Requests to YouTube (youtube.com and music.youtube.com), as you.** They're the requests YouTube's own buttons send: listing your playlists, checking which playlists hold a video, adding or removing a video, creating a playlist, the queue, and likes. They're sent from your YouTube tab with your YouTube session, when you act or when auto-add adds a video you watched. YouTube's own privacy policy applies to them: https://policies.google.com/privacy.
> - **Settings sync, only if you switch it on,** through your browser's own sync (Chrome Sync or Firefox Sync, under your browser account). It carries which features are on and their options, your shortcut keys and labels, and for each account: its code, name, @handle and picture link, the playlists you chose, and your channel filters. Watch progress, cached lists and your consent never sync. The developer can't see synced data.
> - **Nothing else.** No error or crash reports, no analytics, no remote configuration. The extension downloads no code.
>
> ## What's kept in your browser
> - Your settings and each account's setup, and your consent.
> - A list of each account's playlists (names, counts, thumbnail links), refreshed when it's shown and more than 5 minutes old; playlists you created in the last 24 hours.
> - Watch progress per video (which stretches you played, the length, when it last played). It's deleted once auto-add has added the video or found it already there, if the video's length changes, 30 days after it last played, or when you switch auto-add off.
> - Settings from 1.x that are waiting for their account.
> - Until the browser closes, or the extension updates: pause, videos you chose not to auto-add, recent adds (one minute), and notes about YouTube changes that stop a feature. Skipped videos and recent adds may name videos and playlists, but they stay in this browser's memory until it closes, and are never synced or sent anywhere. The notes about YouTube changes name no video, playlist, channel or account.
>
> ## Private windows
> The extension runs there only if you allow it in your browser. Nothing from a private session is stored: no setups, lists, watch progress or account details.
>
> ## Diagnostics report
> Settings › Diagnostics can show a report about the extension's state. It names no video, playlist, channel or account. It's shown only to you, and leaves your browser only if you copy and share it yourself.
>
> ## Your choices
> - Switch any feature off in the popup or Settings.
> - Withdraw your consent in Settings › Privacy & data: everything stops.
> - Remove one account's setup in Settings › Accounts.
> - **Clear all data** in Settings › Privacy & data deletes everything the extension keeps in this browser. Tick the box to also delete the synced copy.
> - Uninstalling deletes all of it.
> - Your playlists on YouTube are yours, on YouTube; the extension never deletes them.
> - Upgraded from 1.x? 2.0 deleted 1.x's Google credentials from your browser. You can remove 1.x's access at https://myaccount.google.com/permissions.
>
> ## Chrome Web Store: Limited Use
> The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements. That covers everything the extension handles: it's used only for the features described here. It's never sold, never used for advertising or to determine creditworthiness, and never transferred to anyone.
>
> ## Changes
> Changes are dated on this page; earlier versions are in the project's history on GitHub. If a new version handles your data in a new way, the extension asks for your agreement again before it does.
>
> ## Contact
> Questions and problems: https://github.com/Alioun/yt-playlist-tools/issues *(PROVISIONAL: an e-mail address, if the user adds one)*
>
> Not affiliated with or endorsed by YouTube or Google. YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions.

- **REL-STORE-18** The policy needs no Firefox data-collection line: settings sync declares no data type, and settings changed in a private window are saved (R83). Only [§13](#13-if-an-amo-reviewer-objects)'s fallback adds lines, if a reviewer objects:
  - **If sync is made an optional type:** "On Firefox, switching sync on first asks for Firefox's permission."
  - **If settings saved from private windows are refused:** the Private windows section also says settings can't be changed there.
- **REL-STORE-19** A change to data handling updates this page, the dashboard's privacy tab and the consent version in the same minor release (REL-CON-17, REL-CHK-21).

## 11. Chrome Web Store dashboard answers

- **REL-STORE-20** These answers are kept in `store/cws-dashboard.md`, which the hotfix check freezes (REL-CI-38). They're pasted into the dashboard's Privacy tab.

**Single purpose:**
> Playlist Pigeon organises what the user watches and listens to on YouTube and YouTube Music into their own playlists, queue and likes: automatically after a video is watched (optionally filtered by channel), with keyboard shortcuts, or with one-click buttons for YouTube's and YouTube Music's own save, queue and like actions.

**Permission justifications:**
- **`storage`:** "Keeps the user's settings in the browser: which features are on, the playlists each feature uses per YouTube account, shortcut keys and labels, channel filters, a cached list of the user's playlists, and auto-add's watch progress (deleted after 30 days)."
- **`scripting`:** "Adds each feature's script to YouTube pages only while that feature is switched on, and reads data from an open YouTube tab when the popup or settings need it."
- **`https://www.youtube.com/*`:** "The extension's features run on YouTube: they read which video is playing and how much has been played (auto-add), catch the user's shortcut keys, draw the buttons the user switched on, and send YouTube's own playlist requests from the user's YouTube tab, as the signed-in user."
- **`https://music.youtube.com/*` (optional):** "Requested only when the user switches on a YouTube Music feature, or lets their playlist shortcuts work on YouTube Music too: it adds the quick-action buttons and keys to YouTube Music, catches the shortcut keys there, and runs YouTube Music's own queue, save and like actions in that tab." (R53)

**Remote code:** "No, I am not using remote code." Everything ships in the package. The extension sends YouTube's own requests and hands YouTube's command objects back to YouTube's page code; it fetches and evaluates nothing.

**Data usage.** These follow the policy text rather than the lightest precedent (ticket 03):

| Category | Tick | Because |
|---|---|---|
| Personally identifiable information | ✔ | The account's display name and @handle are stored, and synced if sync is on (ticket 11) |
| Health, Financial and payment, Personal communications, Location | — | Not handled |
| Authentication information | ✔ **PROVISIONAL (ticket 25)**: unticked if no shipped route reads the session cookie (R48) | The page reads YouTube's sign-in cookie to sign requests (ticket 10 §3) |
| Web history | ✔ | Which videos were watched, kept as watch progress for up to 30 days |
| User activity | ✔ | Playback progress, the shortcut keys pressed, clicks on our controls |
| Website content | ✔ | Playlist names and thumbnails, video and channel titles |

**Certifications:** all three:
- "I do not sell user data to third parties";
- "…unrelated to my item's single purpose";
- "…creditworthiness or for lending purposes".

**Privacy policy URL:** `https://alioun.github.io/yt-playlist-tools/privacy/`.

**Test instructions** (optional on Chrome, so given briefly):
> Sign in to youtube.com with any Google account that has a YouTube channel. On the first-run page, tick Auto-add and Playlist shortcuts, then Agree. Pick a playlist, play any video for a few seconds with the required percentage at 0 % (Settings › YouTube › Auto-add), and press Alt+W to save to Watch later. Add to queue on thumbnails and the YouTube Music queue actions work without signing in.

**Distribution:** all regions. Visibility is Unlisted during the beta and Public at launch (§8.1).

## 12. AMO

### 12.1 Reviewer notes (`approval_notes`)

- **REL-STORE-21** 2.0.0 and every minor release send the full template below.
  - It lives in `store/notes/reviewer-full.md`.
  - CI fills the `{…}` placeholders from `store/notes/` and the `amo` environment's secrets (REL-CI-46).
  - The notes describe chapter 06's mechanisms, not ticket 19's draft wording, because reviewer notes must describe the shipped package (R17, R49):
    - ADR-0008's two registrations per site ([§6.3.3](06-architecture.md#633-runtime-script-registration), ARC-MAN-08 to ARC-MAN-12);
    - `scripting.executeScript` for switching on in open tabs, the on-demand check when the popup or settings needs an account or fresh data (Playing now's read included), and the popovers (ARC-MAN-13, ARC-MAN-15, ARC-MAN-16);
    - the start-up reconcile that registers again and re-injects into open tabs after an update ([ARC-MAN-17](06-architecture.md#633-runtime-script-registration));
    - the routes of [06 §6.2.2](06-architecture.md#622-routes) (ARC-ACC-10, ARC-ACC-11), and the resolver found by shape on first use and cached for the page ([§6.2.3](06-architecture.md#623-the-command-resolver-found-by-shape), ARC-ACC-13, ARC-ACC-14; R34, R66).
  - If no shipped route reads the session cookie, route 4 is described as the same same-origin request without signing, and the `SAPISIDHASH` wording goes (R48).
  - **The residual risk the notes answer** (R83). 2.0 declares data collection `none` without asking AMO first. AMO's policy defines transmission broadly ("collected, used, transferred, shared, or handled outside of the add-on or the local browser"), and lists "access to and placement of cookies" as personal data. A strict reviewer could apply that to route 4, which reads YouTube's session cookie to sign requests sent only to YouTube. So:
    - the **Data collection** paragraph explains route 4 before the reviewer has to ask (R49);
    - if live checks L3/L4 leave no shipped route reading the cookie, the point disappears with the cookie lines, and that sentence goes too (R48);
    - if a reviewer objects anyway, [§13](#13-if-an-amo-reviewer-objects)'s fallback applies. The Firefox 140 floor it needs is already in place.

  (R17, R34, R48, R49, R66, R83)

> **What this is.** 2.0 is a ground-up rewrite of YouTube Playlist Tools, renamed Playlist Pigeon for YouTube™ (same ID and slug). 1.x used the YouTube Data API with users' own OAuth credentials; 2.0 drops that entirely: no `identity` permission, no Google hosts, no server.
>
> **How it works.**
> - Every request goes from an open youtube.com or music.youtube.com tab, through the user's own signed-in session, to youtube.com itself.
> - Per site, two registrations, both made at runtime with `scripting.registerContentScripts` and only while a feature for that site is on:
>   - a `world: "MAIN"` gateway that calls YouTube's own client code;
>   - an isolated-world list: the site core, the UI kit (only if a switched-on feature draws), then one file per switched-on feature.
> - When a feature is switched on, `scripting.executeScript` injects the same files into already-open tabs of that site, so no reload is needed. It also loads the playlist picker (`popovers.js`) on first use, and, only when the popup or settings needs an account or fresh data (playlists, or the song playing) from a tab that has none of our code, the gateway and site core alone into that one tab; that core draws nothing. After an extension update, the start-up run registers the scripts again and injects the current files into open tabs, and the older copies there retire themselves. Nothing is injected before the user's Agree.
> - There are no static content scripts and no web-accessible resources.
>
> **Routes, in order of preference:**
> 1. YouTube's own command resolver (found by shape on first use and cached for the page: the first `default_kevlar_base.<key>` whose `instance.resolveCommand` is a function);
> 2. YouTube's `yt-service-request` action;
> 3. YouTube Music's own `ytmusic-app` handlers (`networkManager.fetch`, `app.queue`);
> 4. only where none of these can do a job quietly, a same-origin `fetch` to `/youtubei/v1/…` signed in the page from YouTube's session cookie exactly as YouTube's code does (`SAPISIDHASH`). *(PROVISIONAL, ticket 25: without signing if no shipped route reads the session cookie, R48)*
>
> Public data that needs no account (looking up a typed channel, or a video's channel when the page doesn't show it) uses the same same-origin `fetch` without signing.
>
> No `cookies` permission, no Origin rewriting, no remote code, config or selectors.
>
> **Endpoints:** `playlist/get_add_to_playlist`, `browse` (`FEplaylist_aggregation`; channel pages), `browse/edit_playlist`, `playlist/create`, `account/account_menu`, `navigation/resolve_url`, `next`, `reel/reel_item_watch`, `music/get_queue`, YouTube's queue commands through its resolver (`addToPlaylistCommand` for the queue, `playlistEditEndpoint` on the queue list, `refreshPlaylistCommand`), and like / queue commands through YouTube Music's handlers. *(PROVISIONAL: the final list is ticket 25's route table, [06 §6.2.6](06-architecture.md#626-route-table-youtubecom) and [§6.2.7](06-architecture.md#627-route-table-youtube-music).)*
>
> **Permissions:**
> - `storage`: settings;
> - `scripting`: per-feature registration and reading from an open tab for the popup;
> - `*://*.youtube.com/*`: the only site. It's the exact pattern 1.x's content script was granted, kept so the update is silent.
>
> **Data collection: `none`.** Nothing is sent to the developer or any third party. The only requests are YouTube's own, from the user's YouTube tab, for actions the user takes or for auto-add, which the user switches on. Route 4 reads YouTube's session cookie in that tab only to sign requests that go to YouTube itself; the cookie is never stored, logged or sent anywhere else. *(PROVISIONAL, ticket 25: this sentence goes if no shipped route reads the session cookie, R48)* Settings sync, off by default, uses the browser's own `storage.sync`, which the developer never sees. A first-run screen discloses this and requires an explicit Agree before any feature runs.
>
> **Private windows:** nothing from a private session is written to any storage area (one guarded write path in the background).
>
> **Source:** see `SOURCE_CODE_REVIEW.md` in the sources zip. Bun 1.4.3 installs the dependencies (`npx --yes bun@1.4.3 install --frozen-lockfile`); the build itself is `npm run build:firefox` on Node. CI rebuilds the sources zip this way on ARM64 and x86-64 and checks that the output is identical.
>
> **Test account:**
> - {email} / {password}, with backup codes {code1}, {code2} for Google's sign-in check. It's a throwaway account with a YouTube channel and three playlists.
> - Any Google account with a YouTube channel also works.
>
> **Try it (5 minutes):**
> 1. On the first-run page, tick Auto-add, Playlist shortcuts and Queue button on thumbnails, then Agree.
> 2. Sign in to youtube.com. In "Finish setting up", tick the playlist "Reviewer A".
> 3. Set Settings › YouTube › Auto-add › required percentage to 0 %, then open any video: "Auto-added “…” to Reviewer A" appears.
> 4. Press Alt+W: "Saved “…” to Watch later", with Undo; Alt+U undoes it while that message is on screen.
> 5. On the home page, hover a thumbnail: the queue button adds it to the queue.
> 6. On music.youtube.com, switch on Quick actions (Settings › YouTube Music) and hover a song: Play next.
>
> Without signing in, the queue button and YouTube Music's queue actions still work.

- **REL-STORE-22** Patch releases send the **hotfix template**, with the test-account lines appended: "Fixes {feature} after a YouTube change to {internal}. No permission, data or listing changes. Same build instructions as {previous version}." For a bug of our own (REL-CI-39), the first sentence is "Fixes {what went wrong} in {feature}." (R62)
- **REL-STORE-23** Unlisted betas send the **beta template**: "Pre-release {version} of {next release}, self-distributed to testers. Same build instructions."
- **REL-STORE-24** The reviewer credentials reach CI only through the `amo` environment secret `AMO_REVIEWER_LOGIN`, and never appear in the repo.
  - This isn't ADR-0005's "no Google account in CI": CI never signs in to anything. It only pastes text that AMO shows to reviewers.
  - *Runner-up:* "any Google account works", with no credentials. It lost because AMO requires test credentials when an account is needed, and reviewers may not use personal accounts.
- **REL-STORE-25** AMO reviewers sign in from unfamiliar places, which triggers Google's verification. So the account has 2-Step Verification with backup codes, and two fresh codes go into each submission. The checklist has the user refresh them (REL-CHK-24).

### 12.2 Test account for reviewers

- **REL-STORE-26** The user creates a dedicated Google account that's used for nothing else, with:
  - a YouTube channel (needed to create playlists);
  - three playlists: "Reviewer A", "Reviewer B" and "Reviewer C";
  - YouTube Music opened once;
  - 2-Step Verification with backup codes.

  The same account can be the screenshot demo account (REL-STORE-09).

### 12.3 `SOURCE_CODE_REVIEW.md` (in the sources zip)

- **REL-STORE-27** The sources zip contains this file, `SOURCE_CODE_REVIEW.md`, at its root. It's separate from the repo's README (REL-CI-54):

> # Building Playlist Pigeon for YouTube™ from source
>
> Built and checked on Ubuntu 24.04 **ARM64** and x86-64 with Node 24 (the AMO reviewer environment). No secrets, environment variables or network access are needed beyond the npm registry.
>
> **Bun is used only to install the dependencies, because the lockfile is Bun's. The build itself runs on Node, with your own npm.**
>
> 1. Install the exact dependencies pinned in `bun.lock`, from the npm registry, with Bun 1.4.3 fetched through npm (nothing is installed globally):
>    `npx --yes bun@1.4.3 install --frozen-lockfile`
>    (Alternatives: `npm install --global bun@1.4.3`, or `curl -fsSL https://bun.com/install | bash -s "bun-v1.4.3"`.)
> 2. Build the Firefox package on Node:
>    `npm run build:firefox`
>    This runs `wxt build -b firefox`; `wxt.config.ts` and `build/` use only Node APIs.
> 3. The output is in `.output/firefox-mv3/`. Compare it with the submitted package: `diff -r .output/firefox-mv3 <unzipped submission>`.
>
> `npm run build-for-amo` runs steps 1–2 for AMO's automatic builder.
>
> **What the build does:** WXT (Vite) compiles the TypeScript and Svelte sources in `src/` and bundles each entrypoint. Every third-party package comes unmodified from npm and is listed in `package.json` and `bun.lock`. The output contains no native code, so it's the same on ARM64 and x86-64; CI checks this on both for every release.
>
> **Layout:**
> - `src/entrypoints/`: thin WXT entrypoints.
> - `src/background/`: storage, script registration, adds.
> - `src/page/`: the page-world gateway that calls YouTube's own client.
> - `src/site/`: the isolated-world core, the UI kit and the features.
> - `src/ui/`: the popup, settings and the first-run page.
> - `src/shared/`: shared code.
> - `build/`: build helpers.
> - `src/livecheck/`: a developer-only page. `build/livecheck.ts` drops it from every store build, and CI's `check:zip` verifies that.
>
> License: MPL-2.0.

### 12.4 The Bun and ARM64 build

- **REL-STORE-28** `package.json` has `"packageManager": "bun@1.4.3"` and `"build-for-amo": "npx --yes bun@1.4.3 install --frozen-lockfile && npm run build:firefox"`.
  - Whether AMO's private automatic builder runs it, and with network access, is **unverified**. If it fails, the human reviewer follows `SOURCE_CODE_REVIEW.md`.
  - The Bun install step stays as planned, without asking AMO first. If a reviewer asks for an npm lockfile, [§13](#13-if-an-amo-reviewer-objects)'s lockfile row applies. (R83)
- **REL-STORE-29** `wxt.config.ts` and `build/` use only Node APIs, so `npm run build:firefox` builds on Node 24 with no Bun at build time (ticket 17).
- **REL-STORE-30** CI fails if the Bun version in `SOURCE_CODE_REVIEW.md` or in `build-for-amo` differs from `packageManager`.
- **REL-STORE-31** The release build and both source-rebuild jobs pin Node 24, the reviewers' version.
- **REL-STORE-32** The sources zip leaves out `store/`, `site/` and `tools/` (`zip.excludeSources`), none of which are needed to build. `src/livecheck/` stays in, so the sources match the repo, and `SOURCE_CODE_REVIEW.md` says what it is.
- **REL-STORE-33** Every release proves that the sources zip, unzipped and built per `SOURCE_CODE_REVIEW.md` on both ARM64 and x86-64, gives a tree identical to the shipped Firefox build (REL-CI-28).

## 13. If an AMO reviewer objects

Ticket 23 is **settled by decision** ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)), from Mozilla's own documentation, so the drafted message to AMO isn't sent. Its four questions are answered like this:
- **Q1, `none`:** 2.0 declares `data_collection_permissions: {required: ["none"]}`. Firefox presents data collection to users as data the extension *shares with its developer* ("The developer says this extension collects: …"). 2.0 sends nothing to its developer or to any third party: its only requests go to YouTube or YouTube Music, the site the user is on, carrying the user's own actions there. Listed extensions that work the same way declare `none` (ticket 03).
- **Q2, settings sync:** it declares no data type, because it uses the browser's own sync, which the developer never sees ([SYNC-26](04-features-accounts-data.md#39-firefoxs-data-collection-declaration)).
- **Q3, settings changed in a private window:** allowed. A settings change the user makes isn't browsing data, and nothing about the window's browsing is stored ([ACC-38](04-features-accounts-data.md#27-private-windows-and-containers), [DATA-32](04-features-accounts-data.md#47-the-private-window-write-guard); R58).
- **Q4, the Bun install step:** as planned in `SOURCE_CODE_REVIEW.md` (REL-STORE-27 to REL-STORE-29). The draft's Q4 had been corrected on 2026-10-19 to say Bun installs and Node builds ([ticket 23](../issues/23-ask-amo.md)).

**The residual risk:**
- AMO's policy defines transmission broadly ("collected, used, transferred, shared, or handled outside of the add-on or the local browser"), and lists "access to and placement of cookies" as personal data.
- A strict reviewer could apply that to the page-signed route, which reads YouTube's session cookie to sign requests sent only to YouTube.
- **Mitigations:**
  - the reviewer notes explain the route ([§12.1](#121-reviewer-notes-approval_notes), REL-STORE-21; R49);
  - if live checks L3/L4 show a cookie-free route works, no shipped route reads the cookie and the question disappears (R48);
  - if a reviewer objects anyway, the table below applies. The Firefox 140 floor it needs is already in place (REL-CI-09).

**REL-STORE-34** The table below is a **fallback that stays ready**. It's applied only if an AMO reviewer objects to one of the points above: the objection is recorded in ticket 23, and the matching row ships in the release that answers the reviewer. A change to the data-collection declaration follows REL-CHK-21. (R83)

| If a reviewer… | Firefox manifest | 1.4.5 update | Copy and policy |
|---|---|---|---|
| **raises nothing** (what ships; R83) | `data_collection_permissions: {required: ["none"]}` | Silent | As drafted |
| **counts settings sync** as an optional type | `required: ["none"]`, plus `optional: [<type>]` | Silent (an optional type never holds an update) | The sync switch asks Firefox first (ticket 16 §11); declining keeps sync off with "Sync needs your permission to send settings through Firefox Sync." The policy adds "On Firefox, switching sync on first asks for Firefox's permission." The note's Agree requests the type when sync is ticked (REL-CON-09). `permissions.onRemoved` switches sync off in that browser. |
| **counts the requests to YouTube**, the page-signed route included | `required: ["websiteActivity"]` (or the type named), keeping the 140 floor | **Held** behind Firefox's prompt; Cancel keeps 1.4.5 | AMO's description gets the fallback line (REL-STORE-04). The release notes get "Firefox will ask you to approve sharing website activity: that's the videos you save, sent to YouTube through your own account." Our note is unchanged. |
| **refuses settings saved from private windows** | — | — | Ticket 16's write table also refuses shared-settings writes from private windows. The private-window popup says "Settings can't be changed in a private window." |
| **asks for an npm lockfile** instead of the Bun install | — | — | Only the *install* step changes, because the build already runs on Node. Commit a `package-lock.json` that CI regenerates and checks against `bun.lock`'s resolved versions; `SOURCE_CODE_REVIEW.md` then says `npm ci && npm run build:firefox`. Bun stays for development, tests and scripts. **This adds a second lockfile, so the user is told when it happens.** |

- If a reviewer counts account names as `personallyIdentifyingInfo`, that type joins the optional list. The mechanism is the same.
- If a reviewer insists a sync type is *required*, it moves to `required`, the runtime step disappears, and 1.4.5 updates are held as in the requests-to-YouTube row.

## 14. CI and release workflows

### 14.1 `ci.yml`

- **REL-CI-18** `ci.yml` runs ticket 17's jobs, as [Q-CI-1](07-quality.md#771-ciyml) details them:
  - `check`: setup-bun from `packageManager`, `bun install --frozen-lockfile`, `typecheck`, then `test:coverage` with the guard tests, then the Bun-version check (REL-STORE-30);
  - `build`: both builds, then `check:manifest`, then `check:budget` (with its table in the job summary), then both `.output` folders uploaded;
  - `browser`: the real-browser layer, with timings gated at 1.5× ticket 24's budgets in Chromium only; Firefox records its `performance.mark` timings for information ([Q-PERF-41](07-quality.md#767-enforcement)). (R31)
- **REL-CI-19** `ci.yml` no longer has the `broker` job, Vitest or the `jq` manifest checks.
- **REL-CI-20** `check:manifest` asserts ticket 10 §11 per browser: permissions, hosts, floors, the gecko ID, `data_collection_permissions`, no `content_scripts` and no `web_accessible_resources`. It also asserts that:
  - `commands` holds only `_execute_action` (ticket 08);
  - there's no `update_url` unless the mode is `beta`;
  - each manifest's `version` equals `package.json`'s.
- **REL-CI-21** In `build`, `check:manifest --report-against <last release tag>` reports without failing: it writes any manifest difference from the last release to the job summary. A permission or host change is then visible in the PR that makes it.
- **REL-CI-22** A `sources` job runs on pushes to `main` only, on `ubuntu-24.04-arm`. It builds the Firefox sources zip and rebuilds it per `SOURCE_CODE_REVIEW.md` on Node 24, so ARM64 drift shows up before a release.

### 14.2 `release.yml`

- **REL-CI-23** **Triggers:**
  - a pushed tag `v*`;
  - `workflow_dispatch`, with the inputs `stores` (a choice: `both` / `amo` / `cws` / `none`), `allow_red_watch` (boolean) and `reason` (required when `allow_red_watch` is true).
- **Job graph:**

```
meta ─► build ─► gates (all must pass) ─┬─► submit-amo  (environment: amo)
                                        ├─► submit-cws  (environment: cws)
                                        └─► github-release
```

- **REL-CI-24** **`meta`:**
  - fails unless the tag equals `v{package.json version}` and the version is above the last release tag;
  - derives the **channel** (beta when the version matches `1.99.N` or `X.Y.9NN`) and the **kind** (major, minor or patch);
  - finds the previous release tag.
- **REL-CI-25** **`build`** runs on ubuntu-24.04 with Node 24 and the Bun from `packageManager` (1.4.3). It:
  1. runs ticket 17's `check` steps (`typecheck`, `test:coverage`);
  2. builds the zips with the `zip` script (the Chrome zip, `wxt zip`), `zip:firefox` (the Firefox zip and, as WXT does for Firefox, the sources zip, `wxt zip -b firefox`) and, for betas, `zip:beta` (the `--mode beta` Firefox zip, `wxt zip -b firefox --mode beta`; REL-CI-10). The scripts are listed in [Q-TOOL-16](07-quality.md#718-scripts);
  3. uploads them as artifacts, together with both built manifests.
- **REL-CI-26** **What's gated is what ships.** Every later job downloads these exact files (`actions/download-artifact@v8`). No job rebuilds what it ships.
- **REL-CI-27** **`gates`** run in parallel, and every one is required:

| Gate | Check |
|---|---|
| `sources-x64`, `sources-arm64` (`ubuntu-24.04-arm`, free on public repos) | Unzip the sources zip, follow `SOURCE_CODE_REVIEW.md` exactly (`npx --yes bun@1.4.3 install --frozen-lockfile`, then `npm run build:firefox` on Node 24), and diff the output tree with `build`'s. Trees are compared, not zips, because of zip timestamps. |
| `manifest` | `check:manifest` on the store builds, with ticket 17's rules plus REL-CI-20. The beta build carries exactly the beta `update_url`. |
| `budget` | `check:budget` on the store builds (ticket 24); the table goes to the job summary |
| `zip` | `check:zip` (ticket 17): no live-check page, no `src/livecheck/` code and no recording adapter in any store zip (ticket 18; [Q-WATCH-19](07-quality.md#756-the-signed-in-live-check-and-the-live-check-build)) |
| `browser` | Ticket 17's real-browser layer, on the store builds, with timings gated at 1.5× a budget in Chromium only, as in `ci.yml` ([Q-CI-7](07-quality.md#773-release-gates-summary); R31) |
| `watch` | `watch.yml` through `workflow_call`, from **this commit's** watch list, so a fix's new needles are what's tested ([Q-CI-8](07-quality.md#773-release-gates-summary)). `static` must be green, and `browser-watch` (Chromium only, R40) green or inconclusive. Called from here, `browser-watch` tests this run's release artifacts and doesn't rebuild (REL-CI-26; R61). A red `static` passes only with `allow_red_watch` and a reason, which the summary records. |
| `live-check-record` | `store/live-checks/{version}.json` exists. The live-check build (`build:livecheck`, `src/livecheck/`) exports it, redacted: version, commit, browser and its version, date, and pass or fail per check, with no values. It must cover Chrome and Firefox, contain no failures, and be dated within 7 days of the tag. Every release needs one, hotfixes for our own bugs included; the check is run signed in and takes a few minutes. For a patch release that fixes a YouTube change, a `scope: "hotfix"` record listing the affected jobs is accepted (ticket 18). A fix of our own that touches no YouTube job runs the whole check, and a record with no checks in it never passes (R72). |
| `hotfix-freeze` (patch only) | REL-CI-38 |

  The gates this chapter shares with 07 are summarised in [§7.7.3](07-quality.md#773-release-gates-summary) (Q-CI-6 to Q-CI-9). (R31, R40, R61, R72)

- **REL-CI-28** Both `sources-*` gates must report identical trees. A difference on either architecture fails the release.
- **REL-CI-29** **`submit-amo`** runs only when `vars.PUBLISH_AMO == 'true'` and `stores` is `both` or `amo`. It waits for the `amo` environment's approval.
- **REL-CI-30** For a release, `submit-amo` runs `bunx wxt submit --firefox-zip … --firefox-sources-zip …`, with `FIREFOX_CHANNEL=listed` and `FIREFOX_AMO_METADATA_FILE` set.
  - `scripts/amo-metadata.ts` builds the metadata file from `store/notes/` and `store/release-notes/{version}.md`.
  - The reviewer notes are the full template for major and minor releases, and the hotfix template for patches.
- **REL-CI-31** AMO's v5 API wants `release_notes` as a locale object, `{"en-US": "…"}`. The metadata script never sends a plain string; publish-browser-extension's docs example does, and AMO rejects it.
- **REL-CI-32** For a beta, `submit-amo` runs `web-ext sign --channel=unlisted` (`web-ext` is a dev dependency, [Q-TOOL-19](07-quality.md#719-type-checking-and-dependencies)) with the `--mode beta` zip, the sources zip and the same metadata, using the beta template. It waits for the signature and downloads the signed `.xpi` for `github-release`. The build confirms web-ext's flag for uploading sources.
- **REL-CI-33** **`submit-cws`** runs only when `vars.PUBLISH_CWS == 'true'` and `stores` is `both` or `cws`, and never for a post-launch beta (`X.Y.9NN`). It waits for the `cws` environment's approval.
- **REL-CI-34** `submit-cws` runs `bunx wxt submit --chrome-zip …` with `CHROME_API_VERSION=v2`.
  - The variable must be set explicitly, or the tool falls back to v1.1's variables. v1.1 was supported only until 2026-10-15.
  - `CHROME_PUBLISH_TYPE` comes from `vars.CWS_PUBLISH_TYPE`, except that patch releases always use `DEFAULT_PUBLISH`.
  - **The exception is the 2.0.0 soak.** `PUBLISH_CWS` is false then, so this job doesn't run: Chrome goes by hand in the dashboard, as Public with staged publishing (§8.1, REL-CHK-02, REL-CI-40; [Q-CI-15](07-quality.md#774-the-hotfix-lane); R21).
- **REL-CI-35** `submit-cws` never sets `skipReview`. API v2 skips review only for updates that change nothing but declarativeNetRequest rules, and it errors otherwise. Ticket 18's "try `skipReview`" is dropped.
- **REL-CI-36** **`github-release`** creates the GitHub release, or a pre-release for betas. It attaches:
  - the zips and the sources zip;
  - the signed beta `.xpi`;
  - `manifest.chrome.json` and `manifest.firefox.json`, which later patch releases compare against;
  - the release notes.

  It then triggers `pages.yml`.
- **REL-CI-37** Permissions are `contents: read` everywhere except `github-release` (`contents: write`). `PUBLISH_TO_STORES` is retired.

### 14.3 The hotfix lane

From ticket 18, made mechanical.

- **REL-CI-38** **`hotfix-freeze`** runs for every patch release, and fails on any of these:
  - `check:manifest --against v{previous}` finds a difference between the new manifests and the previous release's, with `version` removed. It reads the old manifests from that tag's GitHub release assets (REL-CI-36) rather than rebuilding the tag. "Previous" is the release tag the hotfix branch was cut from.
  - `git diff --quiet {previous tag} -- store/listing store/cws-dashboard.md store/notes/reviewer-full.md site/privacy` fails;
  - the consent version constant changed;
  - the storage layout version the build writes (`schema`, [DATA-46](04-features-accounts-data.md#410-schema-versions-and-migrations)) changed. (R62)
- **REL-CI-39** A hotfix branch is `hotfix/X.Y.Z`, cut from the last release tag. (R62)
  - **What it takes:** any fix, our own bugs included (a migration bug, for example), that changes no permission, disclosure, consent version or data schema, and no user-visible behaviour beyond the fix.
  - A fix for a YouTube change also updates its fixtures and watch-list entry.
  - It bumps no dependencies and refactors nothing: Chrome reviews "significant code changes" more closely, and AMO's queue ranks by the size of the change.
  - CI runs on its PRs as usual.
- **REL-CI-40** A hotfix passes the usual gates, with a signed-in live-check record: hotfix scope for a YouTube change, the whole check for a bug of our own that touches no YouTube job (REL-CI-27; R72).
  - Chrome uses `DEFAULT_PUBLISH`, so it publishes on approval.
  - Both stores are submitted in one run.
  - **The exception is the 2.0.0 soak.** `PUBLISH_CWS` is false then, so the run publishes to AMO only. The Chrome resubmission is made by hand in the dashboard, as Public with staged publishing, replacing the staged 2.0.0 (§8.1, REL-CHK-02, §18; [Q-CI-15](07-quality.md#774-the-hotfix-lane); R21).
- **REL-CI-41** After a hotfix, the developer comments on its issue (for a YouTube change, the `youtube-change` issue): "Firefox users get it within about a day; Chrome users after review". Then the branch is merged back to `main`. (R62)

### 14.4 `watch.yml`

- **REL-CI-42** `watch.yml` is a separate workflow with three triggers: a daily schedule, `workflow_dispatch` and `workflow_call`, so `release.yml` can run it as a gate.
  - **Jobs:** `static`, `browser-watch` (on Chromium only; Firefox is covered by the pre-release real-browser check, R40), then `report` ([Q-CI-4](07-quality.md#772-watchyml)).
  - On a schedule or dispatch, `browser-watch` builds the store extension itself. Through `workflow_call` from `release.yml`, it takes the caller's artifacts instead and doesn't rebuild (R61).
  - `report` has `issues: write`. It opens, updates or closes the single `youtube-change` issue: opened on a red watch, or after three inconclusive days in a row; closed when the watch is green again.
  - A red watch never blocks merges. It blocks a release tag unless that release is the fix.
  - The checklist confirms the schedule is still alive (REL-CHK-18), because GitHub disables scheduled workflows in public repos after 60 days without activity. (R40, R61)

The watch itself, with its needles, the browser watch and the inconclusive rules, is specified in [07](07-quality.md): [§7.5.2 the watch list](07-quality.md#752-the-watch-list) (Q-WATCH-3 to Q-WATCH-8); the static and browser watches (Q-WATCH-9 to Q-WATCH-14, in [§7.5.3](07-quality.md#753-the-static-watch) and [§7.5.4](07-quality.md#754-the-browser-watch)); and [§7.5.5 alerting](07-quality.md#755-alerting) (Q-WATCH-15 to Q-WATCH-17).

### 14.5 `pages.yml`

- **REL-CI-43** `pages.yml` runs on pushes to `main` that touch `site/**`, on a published release, and on dispatch. It deploys `site/` with `actions/configure-pages@v6`, `actions/upload-pages-artifact@v5` and `actions/deploy-pages@v5`.
- **REL-CI-44** Before deploying, it generates `beta/updates.json` from the GitHub releases:
  - every pre-release `.xpi`, with `update_link` (an HTTPS release-asset URL) and `update_hash` (`sha256:…`);
  - then, as the hand-off, the newest release's AMO-signed `.xpi`, if one is attached (REL-CI-14);
  - `applications.gecko.strict_min_version` "140.0".
- **REL-CI-45** `updates.json` is generated at deploy time and never committed, so no bot commits.

### 14.6 Secrets, variables and environments

- **REL-CI-46** There are two GitHub environments. Both are free on public repos, have the developer as required reviewer, and allow self-review.
  - **`amo`:** the secrets `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` and `AMO_REVIEWER_LOGIN`, and the variable `FIREFOX_EXTENSION_ID` (`{cc70cd21-2cc6-444b-bd89-496909346091}`), which is public, so it isn't a secret (R21).
  - **`cws`:** `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` and `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`. Store the PEM with real newlines, because the submit path doesn't convert `\n`. (R21)
- **REL-CI-47** Repo variables:
  - `PUBLISH_AMO` and `PUBLISH_CWS` are the standing per-store switches. The environment approval is the per-run "go", and **Reject** holds one store for that run.
  - `CWS_PUBLISH_TYPE` is `DEFAULT_PUBLISH`, or `STAGED_PUBLISH` when Chrome should wait for a manual publish.
- **REL-CI-48** These are deleted: `PUBLISH_TO_STORES`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`, and any repo-level copies of the store secrets.
- **REL-CI-49** A tag ruleset, "Restrict creations" on `v*` (free on public repos), means only the maintainer can trigger a release.
- **REL-CI-50** `.env.submit.example` becomes:

```sh
# Copy to .env.submit for `bunx wxt submit`. CI reads the same names from its environments.
# Chrome Web Store API v2: a service account added under Account in the Developer Dashboard.
CHROME_API_VERSION=v2
CHROME_PUBLISHER_ID=
CHROME_EXTENSION_ID=
CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL=
CHROME_SERVICE_ACCOUNT_PRIVATE_KEY=
CHROME_PUBLISH_TYPE=DEFAULT_PUBLISH

# AMO: JWT pair from addons.mozilla.org > Tools > Manage API Keys. The ID must match the gecko ID.
FIREFOX_EXTENSION_ID={cc70cd21-2cc6-444b-bd89-496909346091}
FIREFOX_JWT_ISSUER=
FIREFOX_JWT_SECRET=
FIREFOX_CHANNEL=listed
FIREFOX_AMO_METADATA_FILE=.output/amo-metadata.json
```

- **Action versions** current on 2026-10-19: checkout v7, upload-artifact v7, download-artifact v8, configure-pages v6, upload-pages-artifact v5, deploy-pages v5, and setup-bun v2 (which reads `packageManager` and supports aarch64).

## 15. Retiring `server/` and the auth docs

- **REL-CI-51** This is the first slice of the 2.0 build: one PR, "Retire the token broker", merged before the first beta. Before it merges, the last commit that still has the broker is tagged `archive/token-broker`.
- **REL-CI-52** The PR deletes:
  - `server/`: `index.ts`, `handler.ts`, `handler.test.ts`, `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml` and `.env.example`;
  - the root `.dockerignore`;
  - the root `.env.example` (`WXT_AUTH_SERVER_URL`);
  - the `server` and `server:dev` scripts in `package.json`;
  - the `broker` job in `ci.yml`;
  - the `docker` ecosystem in `.github/dependabot.yml`;
  - the `docs/legacy/` pages (`README.md`, `authentication.md`, `token-broker.md`), which hold what used to be the README's "Authentication", "Registering an OAuth client" and "Token broker" sections, and their links in `docs/README.md` and the README;
  - the `.env` / `server/.env` rows in `docs/development/environment-files.md`.

  The docs were restructured into a nested `docs/` section on 2026-10-19.
- **REL-CI-53** The 1.x OAuth code (`src/lib/auth*`) goes with the 2.0 rewrite.
- **REL-CI-54** **The README and the nested `docs/` section are rewritten for 2.0 as a whole,** as part of the 2.0 release, rather than patched section by section after REL-CI-52's deletions. The rewrite is one of the launch criteria (REL-CHK-04). It includes:
  - a short "How it works" that links ADR-0001;
  - a "Releasing" section that links `RELEASING.md` (§18's checklist, created by the build);
  - the trademark attribution (REL-STORE-03);
  - the beta line while the beta runs (REL-CI-17), and the Chrome Web Store link once Chrome is public (§18).

  09 tracks this as [PAR-DEF-31](09-parity.md#21-the-inventorys-friction-list). (R39)
- The user's tasks outside the repo are in §19.

## 16. Support channel

- **REL-STORE-35** GitHub issues is the one support channel, with two issue forms:
  - **Problem:** what happened, the browser and its version, and a "Diagnostics report" field for the report copied from Settings;
  - **Idea.**
- **REL-STORE-36** The links:
  - Diagnostics' **Report a problem** opens `https://github.com/Alioun/yt-playlist-tools/issues/new?template=problem.yml`;
  - **Known problems** opens the issues labelled `youtube-change`;
  - both stores' support fields and the privacy page link `issues/new/choose`.

  The links are plain and attach nothing.
- People without a GitHub account can use the stores' review sections, which the developer reads weekly.
- *Runner-up:* e-mail only. It lost because it gives no public list of known problems, and it publishes a personal address.
- **PROVISIONAL:** adding an e-mail as a second channel is the user's call. The Chrome Web Store's contact e-mail is the developer account's verified address either way.

## 17. Upgrade-test matrix

### 17.1 Harness

- **REL-CHK-11** `scripts/upgrade-test/` provides:
  - `old.xpi`: 1.4.5's files from `e96dbf7`, with `browser_specific_settings.gecko.update_url` added, unsigned;
  - `new.xpi`: the release candidate's Firefox build, with the same ID, unsigned;
  - `updates.json`: lists `new.xpi` with its `sha256`, served over **HTTPS** on localhost with a locally trusted certificate (e.g. mkcert), because Firefox requires HTTPS for update manifests.
- **REL-CHK-12** The matrix runs on Firefox ESR 140 (the floor), ESR 153 and Developer Edition. All three honour `xpinstall.signatures.required = false`; release builds don't.
- **REL-CHK-13** Each scenario runs in a fresh profile, seeded by using 1.4.5's own popup and options page as a user would. Then it triggers "Check for Updates".

### 17.2 Scenarios

**REL-CHK-14** The upgrade test passes when every row holds on the release candidate.

| # | Seeded state | Must hold after "Check for Updates" |
|---|---|---|
| S1 | Two playlist entries (one pasted URL, one half-typed); key `Shift+S`; percentage and toasts untouched | **No prompt.** `schema: 1`; `unclaimed.autoAdd` has 1 ID and `dropped: 1`; `pct 0` with `wasUnset`; feedback off; shortcut on with Shift+S; every legacy key and credential gone; the note tab opens once, in the background, with the percentage question; the badge is "!" |
| S2 | Percentage `"75"`, toasts on, `Control+Shift+S`, a dummy client ID and secret | `pct 75` with no question; feedback on; the note says Ctrl+Shift+S never worked; `credentialsDeleted` |
| S3 | 1.4.5 installed, nothing set | No 1.x key, so a fresh install (REL-MIG-03; R64, R76): `schema: 1`, no migration keys, no upgrade note, and no tab opens. The "!" shows on every tab, and the popup's "Waiting for your OK" **Review** opens first run. |
| S4 | Key `Control+Alt+K` | Shortcut unticked, with "can't be used in 2.0" and `raw` shown |
| S5 | youtube.com access removed in about:addons | Silent update; the note shows **Give access to YouTube**; after granting, Agree works |
| S6 | Add-on disabled during the update, enabled a day later | No `onInstalled`; the migration still runs on enable, recognised from the 1.x keys (REL-MIG-02), and the note opens |
| S7 | S1, then a browser restart before and after Agree | The note doesn't reopen; no second migration; Agree survives |
| S8 | S1, with Agree while signed out / with no YouTube tab / on an account that doesn't own the playlists | Ticket 11's outcomes, in the note |
| S9 | S1 on ESR 140, ESR 153 and DevEdition | The same results |
| S10 | (Optional) the AMO rollback drill: serve "1.4.5's code as 2.0.1", then a fixed 2.0.2 | 1.4.5 stays inert; 2.0.2 finds `schema: 1` and keeps the data |
| S11 | S1, with a YouTube watch page and the home page already open (a video playing) when the update lands | Before Agree: 1.4.5's leftover script in those tabs does nothing visible (its extension context is gone, so its sends fail), and nothing of 2.0 is injected. After Agree: the registrar injects into those open tabs **without a reload**, and auto-add and the shortcut work there. |
| S12 | A 2.0 → 2.0 update with features on and YouTube and YouTube Music tabs open: the `1.99.N` → `1.99.N+1` beta updates on both browsers, and the harness on Firefox | Both browsers clear registrations on update. The start-up reconcile registers them again and injects into the open tabs. The new core's `ppt:retire` makes the old core and gateway dispose of themselves. No doubled buttons, toasts or key handling; auto-add keeps counting; fresh tabs get the scripts. **PROVISIONAL until ticket 17's real-browser layer has run an update in both browsers.** |

- **REL-CHK-15** Every scenario also checks that:
  - before Agree, **nothing** runs on YouTube: `scripting.getRegisteredContentScripts()` is empty, and the page has no element, request or listener of ours. Firefox has no execution-context check, so the matrix uses DOM, network and registration checks ([Q-TEST-19](07-quality.md#725-layer-4-real-browser));
  - after Agree, auto-add adds, the shortcut fires, and claiming shows its outcome;
  - "Not now" keeps everything inert, with the banner, whose line names only what carried over (REL-CON-02; R60).

### 17.3 Fixtures, signed paths and Chrome

- **REL-CHK-16** Each seeded profile's `storage.local` is dumped (about:debugging › Inspect › Storage) and committed as `src/background/store/fixtures/1.4.5-S{n}.json`, beside the store module that runs the migration ([§6.10](06-architecture.md#610-folder-layout)), as 07 places them ([Q-FIX-12](07-quality.md#735-the-privacy-lint)). `bun test` runs the pure migration against these real snapshots, not hand-made ones.
- **REL-CHK-17** **Signed paths on release Firefox,** during the beta:
  1. the developer installs AMO's real 1.4.5 in a release-Firefox profile;
  2. installs `1.99.1` from the site (an upgrade by install);
  3. lets later `1.99.N` arrive through `update_url`;
  4. finally takes the hand-off to listed 2.0.0.
  - An unverified shortcut, to try once: override the `extensions.update.url` pref so the real 1.4.5 "updates" to a signed `1.99.N`.
- **Chrome** has no 1.x users. The Unlisted item's `1.99.N` → `1.99.N+1` store updates are S12 on Chrome:
  - registrations come back after the update;
  - open tabs keep working through the `ppt:retire` handover;
  - consent persists, and no note shows.

  One dashboard rollback is rehearsed during the beta (REL-CHK-09).

## 18. Release checklist (`RELEASING.md`)

- **REL-CHK-18** The build creates `RELEASING.md` with the checklist below, and `release.yml`'s job summary links to it. Each item is a checkbox.

**Once, before the first beta**
- [ ] Ticket 22's name is confirmed: the manifest's `name`, `short_name`, `description` and icons.
- [ ] The Firefox manifest declares `data_collection_permissions: {required: ["none"]}` (R83); §13's fallback is applied only if a reviewer has objected. Ticket 25's route table is filled, and the cookie lines are kept or removed everywhere: the disclosure, the policy, the dashboard and the reviewer notes. They're removed if no shipped route reads the session cookie (R48).
- [ ] The Chrome Web Store developer account is ready: 2-Step Verification, the fee, the publisher name, a verified contact e-mail, and the trader / non-trader declaration. The Store listing and Privacy tabs are drafted from §9 and §11; the first upload is `v1.99.1` (see Beta).
- [ ] The service account is created, the Chrome Web Store API is enabled, and the account is added under Account in the dashboard. The `amo` and `cws` environments, the variables and the tag ruleset are set up (§14.6), and the old secrets are deleted.
- [ ] Pages is enabled (source: GitHub Actions); `/`, `/privacy/` and `/beta/` are live and have been read through. The policy is effective from 1.99.1 (R18, R21).
- [ ] The reviewer test account is ready, and `AMO_REVIEWER_LOGIN` is set.
- [ ] `server/` is retired, any deployment is shut down, and its OAuth client is deleted (§15).
- [ ] The screenshots and the promo tile are in `store/listing/`.

**Every release**
- [ ] `package.json`'s version is bumped, and `store/release-notes/{version}.md` is written.
- [ ] **The watch is alive:** `gh workflow view watch.yml` shows it enabled, with a scheduled run in the last 2 days. If not, run `gh workflow enable watch.yml`. GitHub disables schedules after 60 days without activity.
- [ ] The signed-in live check is run in Chrome and Firefox from this commit's live-check build, the captures are imported, and `store/live-checks/{version}.json` is committed. Every release needs it, hotfixes for our own bugs included; it takes a few minutes (R72).
- [ ] The timing test is run at 1× and 4× on the reference machine, and the figures are in the release PR (ticket 24). Chromium's must be within budget; Firefox's `performance.mark` figures are recorded for information only (R31).
- [ ] The manual screen-reader pass of the popup and settings is done (REL-CHK-26; R38).
- [ ] **Has the manifest changed?** Check the `--report-against` table in the `build` summary, and list each change.
  - A new install warning disables Chrome until it's accepted and holds Firefox updates, so prefer none.
  - Has data handling changed? Then bump the consent `v`, and update the privacy policy and the dashboard's privacy tab in the same release.
- [ ] **Has `schema` been bumped?** Then note in the release PR: "Rolling back past this version leaves the extension inert."
- [ ] Tag `v{version}`. Read the gate summary (sizes against `main`, the manifest diff, the watch), then approve `amo` and `cws`, or reject one.
- [ ] Afterwards:
  - AMO shows the version public (within 24 h), and Chrome shows it approved and published;
  - the GitHub release is out;
  - reviews and issues are watched for 48 h;
  - the reviewer account's backup codes are refreshed if they were used.

**Beta**
- [ ] The first beta only: tag `v1.99.1` with `PUBLISH_CWS=false`, upload that run's Chrome zip by hand as **Unlisted**, fill the Store listing and Privacy tabs, then set `PUBLISH_CWS=true` (REL-CHK-02; R21).
- [ ] Tag `v1.99.N`. The unlisted signature is downloaded and attached to the pre-release, `…/beta/updates.json` and the `/beta/` page list it, and from `1.99.2` on the Unlisted Chrome item is updated through the API.

**Hotfix** (ticket 18; R62)
- [ ] Cut `hotfix/X.Y.Z` from the last tag. Make only the fix: a YouTube change or a bug of our own, with no change to permissions, the disclosure, the consent version, the data schema, or any user-visible behaviour beyond the fix (REL-CI-39). A fix for a YouTube change also updates its fixtures and watch-list entry.
- [ ] Run the signed-in live check: hotfix scope for a YouTube change, the whole check for a bug of our own (REL-CI-40; R72). Pass the gates, tag `vX.Y.Z`, and check that `hotfix-freeze` passes.
- [ ] Use the hotfix template for the reviewer notes. Afterwards, comment on the fix's issue (the `youtube-change` issue for a YouTube change) and merge back.

**Bad release**
- [ ] Roll back first: AMO Developer Hub › Roll back, with the next patch number; then the Chrome dashboard's rollback. Then submit the fix.
- [ ] The exception is 2.0.0 on AMO: fix forward, and roll back only to stop harm (REL-CHK-08).

**The 2.0 launch, once**
- [ ] REL-CHK-04's criteria are met.
- [ ] Tag `v2.0.0` with `PUBLISH_CWS=false`, and approve `amo`.
- [ ] By hand in the Chrome dashboard: set visibility to Public, upload the `v2.0.0` Chrome zip from the run's artifacts, and choose "publish manually after approval".
- [ ] When AMO shows 2.0.0 public, edit the AMO listing:
  - the name, summary, description, category, homepage, support URL, privacy policy, icon and screenshots (§9);
  - remove the beta line.
- [ ] Attach AMO's signed 2.0.0 `.xpi` to the `v2.0.0` GitHub release (the beta hand-off), and check `updates.json`.
- [ ] Soak for 7 days. If a 2.0.x ships meanwhile (with `PUBLISH_CWS=false`), cancel the staged Chrome 2.0.0 and submit 2.0.x by hand, with visibility Public and "publish manually after approval" (R21).
- [ ] Publish on Chrome, add the Chrome link to `/` and the README, and set `PUBLISH_CWS=true` and `CWS_PUBLISH_TYPE=DEFAULT_PUBLISH`.

The IDs these items rest on:
- **REL-CHK-19** A release is tagged only after the "Every release" items are done, hotfixes included. The `live-check-record` and `watch` gates enforce two of them mechanically. (R72)
- **REL-CHK-20** The timing test's figures (ticket 24) appear in the release PR for every release. Chromium's gate the release; Firefox's are for information ([Q-PERF-41](07-quality.md#767-enforcement)). (R31)
- **REL-CHK-21** A release that changes a permission, host pattern, data-collection declaration or the disclosure is a minor or major release. Its PR lists each manifest change, and if data handling changed, it bumps the consent version and updates the policy and the dashboard's privacy tab in the same release.
- **REL-CHK-22** A release that bumps `schema` says so in its PR.
- **REL-CHK-23** After every release, the developer watches store reviews and issues for 48 h.
- **REL-CHK-24** After every submission whose backup codes were used, the reviewer account's codes are refreshed.
- **REL-CHK-26** Before each release is tagged, the developer does a manual screen-reader pass of the popup and settings. It's a release step, not a gate ([Q-CI-18](07-quality.md#773-release-gates-summary)); the automated axe-core checks run in the real-browser layer ([Q-TEST-20](07-quality.md#725-layer-4-real-browser)). (R38)

## 19. The user's one-time setup

**REL-CHK-25** These are the tasks only the user can do. They're tracked in [for-the-user.md](../for-the-user.md) until done.

**Decisions:**
- Confirm the name (ticket 22): Playlist Pigeon, or the runner-up, Playlist Courier.
- Read and approve the privacy policy (§10.2), which is published under the user's name.
- Decide whether to add a support e-mail (§16).
- Optionally, choose a custom domain (§10.1).

**Actions before the beta:**
- Run ticket 25's live-check probe, signed in, in Chrome and Firefox, and paste the reports back.

Ticket 23's message to AMO isn't sent: R83 settled its questions from Mozilla's own documentation (§13).

**Chrome Web Store:**
- Create a developer account: a dedicated Google account, 2-Step Verification, the one-time fee, the publisher name, a verified contact e-mail, and the trader declaration.
- Upload `v1.99.1`'s Chrome zip by hand as Unlisted, and fill the Store listing and Privacy tabs (R21).
- Create a service account, enable the Chrome Web Store API, and add the account under Account in the dashboard.

**AMO:**
- Check the API keys.
- At launch, edit the listing: name, summary, description, category, homepage, support link, privacy policy, icon and screenshots.
- Create the dedicated reviewer Google account (REL-STORE-26).

**GitHub:**
- Enable Pages, with GitHub Actions as the source.
- Create the `amo` and `cws` environments with the user as approver, and move the store secrets into them.
- Set `PUBLISH_AMO`, `PUBLISH_CWS` and `CWS_PUBLISH_TYPE`, and add the `v*` tag ruleset.
- Delete the old secrets: `PUBLISH_TO_STORES` and the Chrome v1.1 client ID, secret and refresh token.

**Cleanup:**
- Stop any deployed token broker (e.g. the Dokploy service).
- Delete its Google OAuth "Web application" client, and its Cloud project if that was its only use.
- Once the v2 service account works, delete the Chrome Web Store API v1.1 OAuth client and its refresh token.

**Before each release:**
- Run the signed-in live check (every release, hotfixes included; a few minutes, R72) and the timing test.
- Take screenshots only with videos the user owns or Creative Commons videos.
- Optionally, recruit beta testers.

## Conflicts found

### Resolved during assembly

Settled by the main session in [resolutions.md](resolutions.md), or by the ticket's own correction:
- **The reviewer notes' registrations** (was Open 1): they describe ADR-0008's two registrations per site, as this chapter corrected them (REL-STORE-21). R17.
- **The privacy policy's scope and date** (was Open 2): it takes effect from the first beta, 1.99.1, and covers "version 1.99 (beta) and later" (REL-STORE-17). R18.
- **Ticket 23's Q4** (was Open 3): corrected on 2026-10-19, before sending, to say Bun installs and Node builds (§0, §13). No R-number: the fix is in [ticket 23](../issues/23-ask-amo.md) itself. The message was then never sent (R83, below).
- **Where the screenshots come from** (was Open 4): the release candidate; the prototypes are layout references only (REL-STORE-10). R19.
- **The migration reading `storage.sync`** (was Open 5): it doesn't touch `storage.sync` while sync is off, so 1.5.0's stray `theme` stays there (REL-MIG-02, REL-MIG-08, §2.3). R20.
- **A non-numeric `requiredWatchPercentage`** (was Not pinned down): it counts as unset, 0 %, and the note asks the 50 % / 0 % question (§2.3, REL-MIG-11). R21.
- **The first Chrome upload** (was Not pinned down): `v1.99.1`, by hand, as Unlisted (§8.1, REL-CHK-02, §18). R21.
- **A `/beta/` page** (was Not pinned down): a minimal `{site}/beta/` page with the signed `.xpi` link and install steps (REL-STORE-12). R21.
- **`FIREFOX_EXTENSION_ID` in CI** (was Not pinned down): a variable in the `amo` environment (REL-CI-46). R21.
- **When a fresh install writes `schema: 1`** (was Not pinned down): at the first background start, before consent (REL-MIG-04). R21. Its side effect on REL-MIG-03's `onInstalled` trigger is fixed by R64, below.
- **A shortcut playlist with no key** (was Not pinned down): the note says "Your 1.x shortcut had no key. Its playlist is kept; set a key in Settings." (REL-MIG-20, REL-MIG-39, REL-CON-04). R21.
- **Chrome's soak resubmission** (was Not pinned down): by hand, as Public with staged publishing (§8.1, REL-CHK-02, §18). R21.

Settled in the second round:
- **How a 1.x upgrader is recognised** (fixes R21's side effect): at every background start, by a 1.x key in `storage.local` with no consent and no note record; never by `onInstalled` or the `schema` marker. A 1.4.5 user with no key is a fresh install (REL-MIG-02 to REL-MIG-05, REL-MIG-09, `UpgradeDetails.from`, §2.11, S3, S6). R64.
- **Who asks Chrome for music.youtube.com access** (was Open 1): the click that switches on the first thing that needs it, a YouTube Music feature or "Also on YouTube Music" while Playlist shortcuts is on; never the section switch (REL-CON-08, REL-CON-14, REL-CON-24, §5, the dashboard's justification). R53.
- **The upgrade note's "Kept" rows** (was Open 3): this chapter's conditions win, and the section lists only what carried over (REL-CON-04). R60.
- **The popup's upgrade banner** (was Open 4): its line names only what carried over (REL-CON-02). R60.
- **The watch gate rebuilding the extension** (was Open 5): called from `release.yml`, `browser-watch` tests the release artifacts and doesn't rebuild (REL-CI-27, REL-CI-42). R61.
- **The hotfix lane and fix-forward** (was Open 6): the lane takes any fix, our own bugs included, that changes no permission, disclosure, consent version or data schema, and no user-visible behaviour beyond the fix; `hotfix-freeze` also checks `schema` (REL-CI-06, REL-CI-38 to REL-CI-41, REL-STORE-22, REL-CHK-08, §18). R62.
- **Repo-root files in 06's layout** (was Open 7): 06's folder layout has `store/`, `site/`, `RELEASING.md`, `SOURCE_CODE_REVIEW.md` and the release scripts. R63.
- **The version in Diagnostics** (was Open 8): shown there with "(beta)" (REL-CI-15). R65.
- **The cookie lines** (was a PROVISIONAL input): removed together if, after ticket 25, no shipped route reads the session cookie (§0, REL-CON-12, REL-STORE-17, §11, REL-STORE-21, §18). Whether they go is still PROVISIONAL on ticket 25. R48.
- **What the reviewer notes describe** (detail of R17): chapter 06's mechanisms, `executeScript` for the on-demand check and the popovers, and the resolver found on first use (REL-STORE-21). R49, with R66 for an ambiguous resolver.
- **06's manifest table** (was Open 2): [ARC-MAN-01](06-architecture.md#631-manifest-per-browser)'s table now has `short_name`, `description` and `icons`, so `check:manifest` (REL-CI-20) can pass with §0's, §9.1's and §18's values. No R-number: 06 fixed it.
- **`onInstalled` and the reconcile** (was Open 9): [ARC-MAN-12](06-architecture.md#633-runtime-script-registration) no longer reconciles on install and update, because its start-up run covers both, and nothing relies on `onInstalled` but first run's tab (REL-MIG-05). R64.
- **The release `browser` gate's timing threshold** (was Not pinned down): it gates at 1.5× a budget in Chromium, as `ci.yml` does ([Q-CI-7](07-quality.md#773-release-gates-summary), REL-CI-27). No R-number: 07 owns budgets (R52).
- **Corrections the owning chapters asked for:** the reviewer notes' on-demand check and re-injection after an update (06; REL-STORE-21), the reviewer steps' toast copy (02; REL-STORE-21), the note's undo-key line (02; REL-CON-04), the store description's Quick actions line and screenshot 4 (03; §9.2, REL-STORE-08), the soak exception for patch releases (07; REL-CI-34, REL-CI-40), and the links to 05's first-run page (05; §4.2). No R-numbers.

Third round:
- **The live-check record for a fix of our own** (was Not pinned down): every release needs a signed-in live-check record, hotfixes for our own bugs included. A fix that touches no YouTube job runs the whole check, which takes a few minutes, and a record with no checks never passes (REL-CI-27, REL-CI-40, REL-CHK-19, §18, §19). R72.
- **A 1.4.5 user with no 1.x key left** (confirms this chapter's reading of R64): a fresh install. No tab opens on the update; the toolbar "!" and "Waiting for your OK" lead to first run, and REL-MIG-09's crash recovery stands (REL-MIG-03, REL-MIG-04, REL-MIG-09, §2.11, S3). R76.
- **Denying Chrome's YouTube Music prompt from Playlist shortcuts' switch:** Playlist shortcuts goes on and "Also on YouTube Music" turns off, with "No access to YouTube Music, so shortcuts work on YouTube only."; first run's Agree keeps REL-CON-14 (REL-CON-24). R71.
- **The soak exception in `submit-cws`** (07's Still open 1): REL-CI-34 now says, as REL-CI-40 does, that during the 2.0.0 soak Chrome goes by hand, as Public with staged publishing. R21; fixed in 08.
- **The reviewer notes' probe and injection scope** (06's Still open 1): REL-STORE-21 names the on-demand check for an account or fresh data, Playing now's read included, and the re-injection into open tabs after an update ([ARC-MAN-15](06-architecture.md#633-runtime-script-registration), ARC-MAN-17). R49; fixed in 08.
- **The upgrade view's budget and first-view test** (was Not pinned down): the first-run page's 30 KB budget and its first-view test cover both of its views, first run and the upgrade note ([Q-PERF-31](07-quality.md#766-popup-settings-the-first-run-page-and-background), [Q-TEST-18](07-quality.md#725-layer-4-real-browser) item 10). Fixed in 07.
- **The upgrade snapshots' path** (was Not pinned down): `src/background/store/fixtures/1.4.5-S{n}.json`, beside the store module (REL-CHK-16, [Q-FIX-12](07-quality.md#735-the-privacy-lint)). Fixed in 07 and 08.
- **Script names** (was Not pinned down): the `build:beta`, `zip`, `zip:firefox` and `zip:beta` scripts (REL-CI-10, REL-CI-25), and `web-ext` as a dev dependency (REL-CI-32), as [Q-TOOL-16](07-quality.md#718-scripts) and [Q-TOOL-19](07-quality.md#719-type-checking-and-dependencies) list them. Fixed in 07 and 08.

Also applied here: R10 (the policy's session-memory line: REL-STORE-17), R12 (the pending note's badge: REL-MIG-32), R14 (Chrome access denied at first run's Agree: REL-CON-14), R31 (timings gated in Chromium only: REL-CI-18, REL-CI-27, REL-CHK-04, REL-CHK-20, §18), R34 (the resolver found on first use: REL-STORE-21), R37 ("the first-run page": REL-CON-01 and prose), R38 (the screen-reader pass: REL-CHK-04, REL-CHK-26, §18), R39 (the README rewritten as a whole: REL-CI-54, REL-CHK-04) and R40 (the browser watch on Chromium only: REL-CI-27, REL-CI-42). From the second round: R43 (the policy's watch-progress line: REL-STORE-17), R44 (the undo key from install: REL-MIG-24, REL-CON-04), R45 (typographic quotes: §0, REL-STORE-08), R57 (session memory ends at an update too: REL-STORE-17) and R65 (`{Product}` and `{Account}` elsewhere: §0).

Also applied, third round: R71 (REL-CON-24), R72 (REL-CI-27, REL-CI-40, REL-CHK-19, §18's "Every release" and "Hotfix" items, §19) and R76 (REL-MIG-03, REL-MIG-04, REL-MIG-09, §2.11, S3). R68, R69, R70, R73, R74, R75 and R77 change no copy this chapter quotes: its copy quotes only video and album titles, and never a playlist name.

After the spec ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)):
- **Firefox's prompt strings** (was a PROVISIONAL input, live check P1): settled from Firefox's own string files and code and Mozilla's support articles. The install header is "Add Playlist Pigeon for YouTube™", with no question mark; the one required line is "Access your data for sites in youtube.com domains"; `storage` and `scripting` have no message; the data-collection line is "The developer says this extension doesn't require data collection."; the 1.4.5 update shows no prompt. Chrome's strings stay as read from Chromium's source, and P1 only glances at the real dialogs (§0, §5, REL-CON-22, REL-CON-23). R83.
- **AMO's reply** (was a PROVISIONAL input, ticket 23): settled by decision, and the message isn't sent. 2.0 declares `data_collection_permissions: {required: ["none"]}`; settings sync declares no data type; settings changed in a private window are saved; the Bun install stays as planned. §13 is now the fallback if a reviewer objects, and the residual cookie risk, which L3/L4 can make moot (R48), stays visible in §12.1 and §13 (§0, §5, REL-CON-09, REL-CON-16, REL-CHK-04, REL-STORE-04, §9.3, REL-STORE-18, REL-STORE-21, REL-STORE-28, REL-STORE-34, §18, §19). R83.

### Open

None remain after all three rounds. Every contradiction listed here before is settled above, and the other chapters now follow this one on the migration, the upgrade note and the consent copy (R60).

### Settled by precedence (no action)

- **The Bun version in `SOURCE_CODE_REVIEW.md`:** ticket 06 says Bun 1.4.0, which is today's `packageManager`. Tickets 17 and 19 say 1.4.3, and this chapter uses 1.4.3.
- **`skipReview`:** ticket 18 says to try it; ticket 19 drops it (REL-CI-35).
- **The hotfix reviewer template:** ticket 19 adds "Same build instructions as {previous version}." to ticket 18's text.
- **Diagnostics' Report a problem:** ticket 18 says it opens a blank form; ticket 19 says it opens `template=problem.yml`.
- **The Ctrl-key line:** ticket 09's prototype says "This key didn't work in 1.4.5. It does now."; ticket 19's final copy is used.
- **Repo renames:** ticket 22 says a rename is fine because GitHub redirects. That holds for github.com URLs, but not for the Pages URL. ADR-0011: no rename while betas are installed.
- **The toasts default:** ticket 06 says 1.4.5's popup showed toasts on. Ticket 19 corrects it to off, so only the percentage mismatches.

### Not pinned down

None remain; see [Resolved during assembly](#resolved-during-assembly). What still waits on the user or ticket 25's live checks is marked PROVISIONAL inline and listed in [§0](#0-provisional-inputs). Ticket 23 no longer waits: R83 settled it.
