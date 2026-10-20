# 04 · Features, accounts and data

This chapter covers the user-visible model and behaviour of features, consent, accounts, settings sync, stored data and breakage status. It assembles tickets [09](../issues/09-where-things-live.md), [10](../issues/10-youtube-access.md), [11](../issues/11-accounts.md), [16](../issues/16-storage-and-sync.md), [17](../issues/17-modules.md), [18](../issues/18-breakage.md) and [19](../issues/19-upgrade-and-rollout.md), with the defaults from [07](../issues/07-watched.md), [08](../issues/08-shortcuts.md), [12](../issues/12-adding.md), [14](../issues/14-in-page-controls.md), [15](../issues/15-popup-and-settings.md) and [26](../issues/26-youtube-music-quick-actions.md). It also covers ADRs [0003](../../../docs/adr/0003-account-setups-keyed-by-datasync-id.md), [0006](../../../docs/adr/0006-local-truth-sync-copies-documents.md) and [0010](../../../docs/adr/0010-one-consent-gates-every-feature.md).

**Elsewhere:**
- What each feature does on the page: [02 YouTube](02-youtube.md) ([§2.1](02-youtube.md#21-rules-shared-by-every-youtube-feature), YT-GEN-01, and one section per feature) and [03 YouTube Music](03-youtube-music.md) ([§1](03-youtube-music.md#1-features-switches-and-settings), YM-FEAT-1 to YM-FEAT-11).
- Layouts, banners, the picker and the remaining copy: [05 UI](05-ui.md): [the popup](05-ui.md#52-the-toolbar-popup) and its [banners](05-ui.md#banners) (UI-POP-10), [the settings page](05-ui.md#53-the-settings-page), [the first-run page](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note) and [the picker](05-ui.md#57-the-shared-playlist-picker-and-key-recorder).
- The store, registrar, tab router, gateway and messaging: [06 Architecture](06-architecture.md): [the store](06-architecture.md#69-the-store-module-interface), [registration](06-architecture.md#633-runtime-script-registration), [serving-tab routing](06-architecture.md#6211-serving-tab-routing), [the gateway](06-architecture.md#651-the-gateway) and [messaging](06-architecture.md#68-messaging-contracts).
- Budgets, test layers, fixtures and the breakage watch: [07 Quality](07-quality.md): [§7.2](07-quality.md#72-test-layers), [§7.3](07-quality.md#73-fixtures), [§7.5](07-quality.md#75-breakage-detection) and [§7.6](07-quality.md#76-performance-budgets).
- The upgrade note's copy, the disclosure text and the release process: [08 Upgrade and release](08-release.md).
- What 1.4.5 did and how 2.0 covers it: [09 Parity](09-parity.md).

The main session's resolutions ([resolutions.md](resolutions.md)) are applied, all three rounds (R1–R40, R41–R67, then R68–R77). R83, settled after the spec, is applied too. A requirement they changed keeps its ID and ends with its R-number; one they added has a new ID, placed where it belongs. Under the resolutions' ownership rule, this chapter owns user-visible accounts, settings, data and status behaviour (R54); where it shares a topic with another chapter, the owner's text wins. [§9](#9-conflicts-found) records that no difference remains.

**Placeholders in copy** (every chapter uses `{Product}` and `{Account}`, R65):
- `{Product}` is the extension's in-product name. **PROVISIONAL** ([ticket 22](../issues/22-name.md)): "Playlist Pigeon", with "Playlist Courier" as the runner-up. The tickets wrote `{Name}` for both the product and the account; the spec splits them.
- `{Account}` is the account label's name, else "Unnamed account".
- `{Feature}` is the feature's name from [FT-01](#11-the-features).
- `{Shortcut}` is a playlist shortcut's label, else its playlist's title on this account, else its key ([02's placeholders](02-youtube.md#conventions); ACC-10).
- `{Key}` and `{Other}` are a key and the name of what already uses it.
- Quotes in copy are typographic (“ ”) (R45). Video and song titles take them, as in “{title}”. Playlist names don't, except in R24's "{Shortcut} now saves to “{Playlist}”.", where the quotes keep the two names apart (R77). The site chapters own the rule on their sites, album titles included ([YT-ADD-18](02-youtube.md#252-feedback), [YM-FB-10](03-youtube-music.md#13-feedback-toasts-and-undo)).

Requirements are numbered `FT-`, `ACC-`, `SYNC-`, `DATA-` and `HEALTH-`. Each is a testable statement. Where tickets disagreed, the later decision is written here, and [§7](#7-precedence-applied) lists what it overrode.

## 1. The feature model

### 1.1 The features

- **FT-01** The extension has exactly these nine features. Each one is switched on and off by itself, and nothing else in the extension acts by itself.

| Feature (name as shown) | Registry ID | Site | Footprint tag | Show feedback default | Options and their defaults |
|---|---|---|---|---|---|
| **Auto-add** | `auto-add` | YouTube | Doesn't change the page | On | Default required percentage **50 %**. Toolbar tick for an auto-added video **off** until the user decides whether it exists (PROVISIONAL, see [§6](#6-provisional-items); R11). Per account: auto-add playlists, each with Takes, an optional percentage override and a channel filter. |
| **Playlist shortcuts** | `shortcuts` | YouTube, and YouTube Music while "Also on YouTube Music" and the YouTube Music section switch are both on (FT-06; R1) | Keys only, doesn't change the page | On | Preset on first switch-on (FT-04): one shortcut, **Alt+W** → Watch later on every account; picker key **Alt+Shift+P**; Also on YouTube Music **on**. Up to 20 shortcuts, each with a key and an optional label. Per account: each shortcut's playlist. The undo key isn't part of the preset: it belongs to no feature (FT-05; R44). |
| **Quick-save on thumbnails** | `quick-save` | YouTube | Adds buttons to the page | On | "On Shorts shelves too": **off** (R11). Per account: the quick-save playlist. |
| **Queue button on thumbnails** | `queue-button` | YouTube | Adds buttons to the page | On | — |
| **Watch-page button** | `watch-button` | YouTube | Adds buttons to the page | On, for its menu's Save rows (R42) | "On Shorts too": **off** (R11). Its menu's Save rows belong to this feature whether or not Quick-save on thumbnails is on, use its Show feedback, and save to YouTube's quick-save playlist ([YT-WB-07](02-youtube.md#211-the-watch-page-button); R27, R42). |
| **Right-click for the video menu** | `card-menu` | YouTube | Changes right-click on the page | None: it raises no toasts of its own, only breakage notices, which Show feedback never hides ([YT-ADD-13](02-youtube.md#252-feedback)) | "Links inside cards keep the browser's menu": **off** (R11). Shift+right-click always gives the browser's menu. |
| **Quick actions** | `music-actions` | YouTube Music | Adds buttons to the page | On | Buttons: Play next **on**, Add to queue **on**, Save to playlist off, Like off, Remove from queue off, Save on the player bar off. Per account: YouTube Music's quick-save playlist, shared with quick-action shortcuts. |
| **Quick-action shortcuts** | `music-keys` | YouTube Music | Keys only, doesn't change the page | On | Preset on first switch-on: Play next **Alt+N**, Add to queue **Alt+Q**, Save to playlist **Alt+P**, the picker **Alt+Shift+P**, Like **Alt+L**, Remove from queue **Alt+R**. The undo key works here too, but isn't part of this preset (FT-05; R44). |
| **Settings sync** | `sync` | Everywhere | Doesn't change the page | — | Its switch is per browser, lives in `Device.syncOn` rather than the shared settings, and never syncs ([§3](#3-settings-sync); R54). |

  There are exactly four footprint tags, the ones in the table: "Doesn't change the page", "Keys only, doesn't change the page", "Adds buttons to the page" and "Changes right-click on the page". Settings sync has one too. (R1, R11, R27, R42, R44, R54)

- **FT-56** **Feature IDs** are the registry IDs above, in kebab-case everywhere: the feature registry ([§6.6](06-architecture.md#66-the-feature-registry)), deep links (`#feature-watch-button`, [UI-IA-09](05-ui.md#51-information-architecture)) and tests. Settings keys may stay camelCase internally (DATA-12). (R32)
- **FT-02** Every feature starts off. An absent shared-settings document reads as every feature off, so nothing on YouTube or YouTube Music changes until the user picks a feature.
- **FT-03** Only two things switch features on without a pick in this browser, and neither runs anything before this browser's consent ([FT-30](#15-the-consent-gate)):
  - **the 1.4.5 migration** ([§4.10](#410-schema-versions-and-migrations)): auto-add is on if any auto-add playlist carried over, and playlist shortcuts are on if both a key and a playlist carried over;
  - **settings sync**, which brings the switches set in the user's other browsers ([SYNC-03](#31-the-feature)).
- **FT-04** Presets apply once, the first time a feature is switched on. The "preset applied" flag is a shared setting, so it syncs.
  - Switching a feature off and on again keeps what the user had.
  - Removing every playlist shortcut never brings the preset back.
  - A preset never takes a key already used on the same site. It's left without a key, and its row says "No key: {Key} is used by {Other}".
  - Upgraders get no Watch later preset. The migration sets the flag, and presets the picker key unless the carried 1.x key uses it. The undo key is Alt+U for them as for everyone, unless the carried key uses it (FT-05; R44).
- **FT-05** Two shared settings belong to no feature:
  - the **theme** (System, Light or Dark; **System** by default), which covers only the popup, settings and the first-run page; in-page UI follows YouTube. It's set in Settings › Appearance ([UI-SET-15](05-ui.md#sections));
  - the **undo key**, a key used on every page. It's preset to **Alt+U** at install, and the user can change or clear it. It lives in Settings › Everywhere, where its row shows whenever any feature on either site is on ([UI-SET-12](05-ui.md#sections)). The picker key isn't like this: it stays with its shortcut features.
    - It works on a site whenever a toast with Undo is on screen there, whichever feature raised it. Its listener is the site core's one key listener (FT-18), so this costs nothing extra.
    - While a shortcut feature is on there, the key is always caught, and a press with nothing to undo answers "Nothing to undo."; while neither is, a press with no Undo toast on screen passes through to the page ([YT-KEY-05](02-youtube.md#281-the-feature-and-its-keys), [YM-KEY-4](03-youtube-music.md#12-keys-quick-action-shortcuts)). (R2, R11, R37, R44)
- **FT-06** **The YouTube Music section switch** is a gate, not a feature.
  - It sits at the top of the popup's YouTube Music tab ([UI-POP-16](05-ui.md#youtube-music-tab)) and in the header of Settings › YouTube Music ([UI-SET-11](05-ui.md#sections)).
  - It's a shared setting, `musicSection`, synced with the other shared settings (DATA-05). It's **on** by default, and it gates only the section: the features inside it still start off (FT-02).
  - **Off,** nothing of ours runs on music.youtube.com. That includes playlist shortcuts' "Also on YouTube Music", overriding [ticket 17](../issues/17-modules.md)'s exception, and the undo key there. It gates every music.youtube.com registration ([ARC-REG-03](06-architecture.md#66-the-feature-registry)), the on-demand probe there (FT-16) and Playing now ([YM-POP-10](03-youtube-music.md#17-playing-now-in-the-popup); R8).
  - Off, Quick actions and Quick-action shortcuts are held with the reason "YouTube Music is off" (FT-13). Their choices are kept, and so is "Also on YouTube Music". Playlist shortcuts keeps working on YouTube.
  - YouTube has no matching switch. (R1)
- **FT-07** Every behaviour can be turned off, and no default ever overrides a choice the user made.

### 1.2 Switching features

- **FT-08** Features are switched in three places only: first run (or the upgrade note), Settings and the popup. Nothing on a YouTube or YouTube Music page switches a feature. In-page menus link to Settings instead.
- **FT-09** Switches are shared settings. They apply to every account and sync with settings sync. There are no per-account switches: an account with no choices leaves its features idle ([ACC-09](#22-account-setups-and-shared-settings)).
- **FT-10** Switching a feature on takes effect in open matching tabs without a reload. Switching it off removes it from open tabs at once ([FT-19](#13-off-costs-nothing)).
- **FT-11** Switching a feature off keeps its settings, and switching it on again restores them. The one exception: switching auto-add off deletes all remembered watch progress, for every account. Its playlists, filters and percentages stay.
- **FT-12** A switch change that's refused or deferred isn't saved, and the switch keeps showing the stored state. That covers:
  - no consent yet (FT-32);
  - the sync join question (SYNC-08);
  - a denied site-access prompt (FT-52), except from Playlist shortcuts' own switch, which goes on with "Also on YouTube Music" off (R71);
  - a refusal because sync is full (SYNC-14);
  - a refusal because a newer version wrote the synced document being edited (SYNC-23). (R13, R71)
- **FT-13** **Held:** a feature that's on but can't run shows as on but held, with its reason: "Waiting for your OK", "Needs site access" or "YouTube Music is off". A held feature registers nothing.
- **FT-14** A feature that's off takes one row in Settings: its name, footprint tag, one-line description and switch. Its options show only while it's on. In the popup, an off feature's row never unfolds. YouTube Music's quick-save playlist row shows only while a YouTube Music feature is on.

### 1.3 Off costs nothing

- **FT-15** **Every feature for a site off or held:** nothing is registered or injected there. That means no script in either world, and no CSS, element, listener, timer or request. The manifest has no `content_scripts` and no `web_accessible_resources`.
- **FT-16** **The on-demand probe** is the only exception to FT-15.
  - It runs only after consent, and only when the popup or settings needs an account or fresh data from a tab that has no site core. Playing now uses it when no YouTube Music feature is on ([YM-POP-10](03-youtube-music.md#17-playing-now-in-the-popup); R8).
  - It injects the site core (gateway and isolated core) into that one tab ([ARC-MAN-15](06-architecture.md#633-runtime-script-registration)).
  - It draws nothing and stays inert until the tab reloads.
  - It never runs on music.youtube.com while the YouTube Music section switch is off (FT-06). (R1, R8)
- **FT-17** **Some features on:** only those features' files load, plus what they share: the site core, and the UI kit if one of them draws. The card menu draws nothing of its own and needs no kit; its not-working notice is the site core's tiny kit-free notice (HEALTH-13). A switched-off feature's own files never load. (R28)
- **FT-18** **The shared site core** ([ticket 17](../issues/17-modules.md) D1, D6) isn't split per feature.
  - Its page half, the gateway, carries every job of its site, including jobs that only switched-off features use.
  - Its isolated half carries the machinery several features share: item recognition, pointer and focus tracking, and the one key listener.
  - So while any feature on a site is on, a switched-off feature's share of that code is present but inert. "Off costs nothing" holds by effect: the core adds no listener, observer or element until a feature that's on asks for one. A switched-off feature leaves no element, style, listener, observer, timer or request.
  - The core's code loads only while some feature on that site is on, or through the probe (FT-16).
- **FT-19** **Switching off in an open tab** removes the feature's elements, styles, listeners, observers and timers at once. Its parsed code stays until the tab reloads, because a browser can't unload a script. When the last feature on a site goes off, both registrations for that site go, and the core disposes of everything it added.
- **FT-20** Script registration is derived from the switches, the YouTube Music section switch, consent, the storage layout version and site access ([ARC-MAN-11](06-architecture.md#633-runtime-script-registration)). It's never stored, and it's per browser, never per account. (R1)
- **FT-21** With settings sync off, nothing reads or writes `storage.sync`, with two explicit exceptions:
  - at first run, before Agree, the lookup that reads the synced copy to pre-tick the features the user already chose elsewhere. It reads only; nothing is written (SYNC-08 step 4);
  - Clear all data with "Also delete synced settings from all your browsers" ticked (DATA-39).

  Those two are the only calls allowed, and the test expects exactly them. The 1.x migration isn't an exception: it doesn't touch `storage.sync` while sync is off, so it leaves 1.5.0's stray `theme` key there (DATA-49). Only developer profiles ever wrote it. The test is [Q-PERF-11](07-quality.md#762-off-means-zero). (R9, R20, R59)
- **FT-22** The background never polls. There's no `setInterval`, and no alarm unless a feature that's on needs a schedule.
- **FT-61** **Automatic work never degrades the browser** ([ADR-0012](../../../docs/adr/0012-automatic-work-is-event-driven-scoped-and-paced.md)). What a feature does without a click runs only on an event it needs, only in the tabs that need it, and never on a clock. It stays within the running-cost budgets of [07 §7.6.8](07-quality.md#768-running-cost), with its defaults and with every option. No 2.0 feature needs a schedule, so 2.0 sets no alarm at all (FT-22). (R100)
- **FT-62** **Hidden tabs.** In a tab the user can't see, features do only what can't wait: auto-add keeps counting a video that's playing ([YT-AA-45](02-youtube.md#2312-what-tracking-costs)). Drawing, anchor checks, observers and toast timers wait until the tab is shown. Discarded and frozen tabs are never woken, reloaded, injected into or messaged ([Q-PERF-57](07-quality.md#768-running-cost)). (R104)

The size and timing budgets that enforce this, and the real-browser "off means zero" test, are in [07 Quality](07-quality.md): [§7.6.2 Off means zero](07-quality.md#762-off-means-zero) (Q-PERF-5 to Q-PERF-11: FT-15 ↔ Q-PERF-5/6, FT-16 ↔ Q-PERF-9, FT-17 ↔ Q-PERF-8, FT-19 ↔ Q-PERF-10, FT-21 ↔ Q-PERF-11, FT-22 ↔ Q-PERF-7), [§7.6.3 In-page weight](07-quality.md#763-in-page-weight), [§7.6.5 In-page time](07-quality.md#765-in-page-time) and the real-browser layer, [§7.2.5](07-quality.md#725-layer-4-real-browser) (Q-TEST-18).

### 1.4 Show feedback

- **FT-23** Toasts aren't a feature. Each feature that raises toasts has its own **Show feedback** switch, the watch-page button included (R42). It's a shared setting (one value for every account) that syncs. Defaults are in FT-01's table. The card menu and Settings sync raise no toasts of their own, so they have none.
- **FT-24** Show feedback off hides **confirmations** only. A confirmation is a toast saying an action did what was asked, plus auto-add's "filtered out" note (but not its unknown-channel note, FT-25). With Show feedback off, the pending ("Saving…") toast isn't shown either; only the eventual failure is. (R7)
- **FT-25** These always show, whatever Show feedback says:
  - **failures** of every kind, including the signed-out failure with **Sign in** for explicit actions (ACC-21; R3, R41), the account-change toast (ACC-22) and an Add to queue that YouTube didn't confirm, which isn't an add ([YT-Q-03](02-youtube.md#210-the-thumbnail-add-to-queue-button), [YT-Q-08](02-youtube.md#210-the-thumbnail-add-to-queue-button));
  - **explicit actions that did nothing:** "already in" and "Nothing to undo.";
  - **the "has no playlist" hint:** "{Shortcut} has no playlist on {Account} yet." with **Choose**. It's a neutral hint, not a failure (ACC-09; R24, R56);
  - **auto-add's unknown-channel note:** an unknown channel blocked by an allowlist filter is *filtered out* with the reason "unknown channel", not *failed*, and keeps its own toast, once per browser session ([YT-CF-18](02-youtube.md#245-feedback); R26);
  - **breakage:** notices, the badge and statuses ([§5](#5-breakage-status));
  - **auto-add's first "can't measure" toast** in a browser session (HEALTH-11). (R3, R24, R26, R41, R56)
- **FT-26** Show feedback governs toasts only. A control's own state always shows: picker rows, the busy, saved and failed states of buttons, and the Missing and Full marks.
- **FT-27** For 1.4.5 upgraders, Show feedback for auto-add and playlist shortcuts is on only if 1.4.5's `toastEnabled` was `true`. Otherwise it's off.

Toast copy, timing, hidden tabs and fullscreen are in [02 YouTube](02-youtube.md) ([§2.5.2 Feedback](02-youtube.md#252-feedback), YT-ADD-12 to YT-ADD-26; [§2.5.3 Copy](02-youtube.md#253-copy), YT-ADD-27 to YT-ADD-29; [§2.3.10](02-youtube.md#2310-auto-adds-feedback), YT-AA-39 to YT-AA-41) and [03 YouTube Music](03-youtube-music.md) ([§13 Feedback, toasts and Undo](03-youtube-music.md#13-feedback-toasts-and-undo)). Their look is [05's §5.8](05-ui.md#58-toasts-and-notices).

### 1.5 The consent gate

- **FT-28** **Consent** is stored per browser as `device.consent = {v, at}` and never syncs. The build holds one constant for the current version, which starts at 1.
- **FT-29** Consent counts only if its `v` equals the current version. A missing record, or one with a lower `v`, means no consent.
- **FT-30** **Until there's consent:**
  - no feature runs, including features carried over from 1.4.5 or arriving by sync;
  - nothing is registered, no site core is injected, and no probe runs;
  - no request goes to YouTube or YouTube Music, and nothing is read from their tabs;
  - the popup and settings show no account, no This video, no Playing now, no playlist lists and no choosers;
  - every switched-on feature is held with "Waiting for your OK";
  - the toolbar shows the violet "!" on every tab, ahead of every other reason (FT-57), and the popup shows "Waiting for your OK" with **Review**. (R12)
- **FT-31** These are allowed before consent, because they read nothing from YouTube:
  - local storage reads;
  - the site-access check and the **Give access** request (FT-48, FT-50);
  - at first run, reading the synced copy to pre-tick the features the user already chose elsewhere (SYNC-08 step 4). That's the user's own settings in the browser, not YouTube. Nothing is pushed to the synced copy, and the sync switch isn't stored, until Agree; without Agree, nothing is written. (R9)
- **FT-32** Consent is given only by an explicit **Agree**, in one of three places:
  - first run's "Before you start" ([FT-40](#16-first-run));
  - the upgrade note's "Before you continue" (FT-43);
  - "Before this feature can run", raised when the user switches on a feature without consent (a dialog in Settings, a sheet in the popup; [UI-ONB-09](05-ui.md#the-disclosure)). Its Agree sets consent and switches that feature on in one change. Cancel leaves the feature off.
- **FT-33** It's one consent of our own, the same on Chrome and Firefox. Firefox's built-in data-collection prompt never stands in for it.
- **FT-34** Each browser gives its own consent. Switches that arrive by sync run only once that browser has consented.
- **FT-35** **Withdrawing**, in Settings › Privacy & data:
  - The section shows "You agreed on {date}." with **Read it again** and **Withdraw and pause everything**.
  - The confirmation reads: "**Withdraw your consent?** Every feature stops in this browser and nothing is read from YouTube until you agree again. Your settings are kept." with **Withdraw** and **Cancel**.
  - Withdrawing sets consent to `null`, unregisters every page script and tears down every open tab. All settings stay.
- **FT-36** **A new consent version.**
  - The version goes up only when the disclosure text changes, and a release must change the disclosure, and so the version, whenever data handling changes.
  - After such an update, features pause. The popup and the note page show "{Product} {version} handles your data in a new way. Review and agree to keep it running."
  - A patch (hotfix) release never changes the version, and CI checks the constant ([REL-CON-19](08-release.md#43-consent-rules), [Q-CI-13](07-quality.md#774-the-hotfix-lane)).
- **FT-37** Consent can be given or withdrawn from a private window.
- **FT-38** Clear all data removes consent, and first run opens again (DATA-41).
- **FT-39** The disclosure text, used in all three places, is in [08 Upgrade and release](08-release.md#41-the-disclosure) (REL-CON-12). Its cookie line is **PROVISIONAL** ([ticket 25](../issues/25-live-checks.md) L3/L4): if, after ticket 25, no shipped route reads the session cookie, it's removed, together with the privacy policy's cookie lines and Chrome's "Authentication information" disclosure (R48).

### 1.6 First run

- **FT-40** First run is the path for a **fresh install**: a start with no consent record, no upgrade-note record and no 1.x key in `storage.local`. That's decided from stored state at every background start, never from `onInstalled` or the `schema` marker ([ARC-MOD-25](06-architecture.md#69-the-store-module-interface), DATA-49; R64).
  - First run opens once, in a tab, on `onInstalled` with reason "install", and again after Clear all data (DATA-41).
  - A fresh state reached without that event opens no tab. That's a 1.4.5 user with no 1.x key left, whose update fires "update" (R76), or an empty profile updated while the extension was disabled. The toolbar's "!" (FT-30) and the popup's "Waiting for your OK" with **Review** lead them to first run.

  It has three steps:
  1. **"What should {Product} do?"**
     - Settings sync comes first, as a card: "Use {Product} in another browser already? Turn on Settings sync to bring your settings here." Turning it on looks for synced settings for up to 10 s, then pre-ticks the features they have switched on, marked "From sync", for review (SYNC-08). It only reads: nothing is pushed, and the sync switch isn't stored, until Agree (FT-31; R9).
     - Then every other feature, grouped YouTube and YouTube Music, all unticked, each with its footprint tag. A hint says that picking only "Doesn't change the page" features keeps YouTube as it is.
     - On Chrome, ticking a YouTube Music feature, or Playlist shortcuts (whose preset turns "Also on YouTube Music" on, FT-01), shows "Chrome will ask for access to music.youtube.com when you agree." ([REL-CON-14](08-release.md#41-the-disclosure); R53).
     - The step ends with **Continue with {N} features** or **Continue without features**.
  2. **"Before you start":**
     - the disclosure, with **Agree and turn on {N} features** (**Agree** when N is 0) and **Not now**;
     - **Agree** sets consent and applies the ticks in one change, the sync switch included. Presets apply for each feature switched on (FT-04), and page scripts register;
     - **on Chrome, with a YouTube Music feature or Playlist shortcuts ticked,** the same click first calls the site-access request for music.youtube.com, before anything is awaited (FT-44). If the user denies it, consent and the other ticks still apply. The ticked YouTube Music features are saved on but held with "Needs site access" (FT-13), and so is Playlist shortcuts' "Also on YouTube Music", while Playlist shortcuts runs on YouTube. **Give access** shows in the popup and Settings, and nothing is registered or injected on music.youtube.com until access is granted (R14, R53).
  3. **"Finish setting up":**
     - first, the YouTube state: **Give access**, **Open YouTube**, **Sign in**, or the signed-in account; and, when something ticked lacks YouTube Music access, **Give access to YouTube Music** (R14, R53);
     - then a row per chosen feature: auto-add's playlists, Alt+W's playlist (Watch later on every account), both quick-save playlists, or "Ready";
     - **Open YouTube** and **Open Settings**.

     Choices made here are account-setup writes for the account seen, so a private window refuses them (DATA-33). (R9, R14, R53, R64, R76)
- **FT-41** **Not now** leaves consent `null`, so nothing runs. Nothing from step 1 is stored, the sync switch included, and nothing has been pushed to the synced copy. The page shows "**Nothing is running.** Agree later from the toolbar icon or Settings. Until then, {Product} does nothing on YouTube." with **Back**. Afterwards, switching any feature on asks for consent first (FT-32). (R9)
- **FT-42** First-run copy beyond the strings above is in [05 UI](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note) (UI-ONB-01 to UI-ONB-05, and [the disclosure](05-ui.md#the-disclosure), UI-ONB-08) and [08 Upgrade and release](08-release.md#42-the-rest-of-first-runs-copy) (REL-CON-15).
- **FT-43** **1.x upgraders get the upgrade note instead of first run.** A start is an upgrade when there's no consent and no upgrade-note record, and a 1.x key is in `storage.local` (DATA-49; R64). The note's copy and conditions and the migration's steps are 08's ([§2](08-release.md#2-the-145-migration) and [§3](08-release.md#3-the-upgrade-note); R60); its layout is [05's upgrade note](05-ui.md#the-upgrade-note) (UI-ONB-06, UI-ONB-07). Its behaviour:
  - it opens once, in a background tab, after the migration, and the toolbar shows the violet "!" on every tab until it's handled (FT-57; R12);
  - its "Kept" rows, and the popup's banner while it's pending, list only what actually carried over (R60). Kept features show ticked and "Paused until you agree", new features show unticked, and the disclosure comes last;
  - before Agree it shows only stored values, because nothing is read from YouTube;
  - **Agree**, in one change, applies the ticks and the percentage choice, sets consent, and marks the note done. Claiming the unclaimed setup follows ([ACC-30](#26-the-unclaimed-setup-and-claiming));
  - **Not now** keeps everything paused, with the badge and a popup **Review** banner, for as long as the user leaves it. The carried choices are kept. (R12)

### 1.7 Site access and YouTube tabs

- **FT-44** **Site access** is per site:
  - **Chrome:** www.youtube.com is asked for at install. music.youtube.com is optional. It's asked for from the click that switches on the first thing that needs it, first run's Agree included (R53):
    - a YouTube Music feature;
    - or "Also on YouTube Music" while Playlist shortcuts is on. Since the shortcuts preset turns that option on, the click that first switches on Playlist shortcuts asks too. If that prompt is denied, Playlist shortcuts still goes on, on YouTube only (FT-52; R71).

    The YouTube Music section switch itself never asks. (R53, R71)
  - **Firefox:** one grant for `*://*.youtube.com/*` covers both sites.
- **FT-45** Site access is checked per site at every background start, and whenever the browser reports a permission added or removed.
- **FT-46** **A site without access:**
  - its switched-on features stay on but are held with "Needs site access", and nothing is registered there;
  - the toolbar shows the violet "!" on every tab, not only on that site's tabs, because without host access the extension can't tell which tabs are that site's (FT-57, FT-58; R53);
  - the popup's banner ([UI-POP-10](05-ui.md#banners), row 3) and settings' connection strip ([UI-SET-02](05-ui.md#frame)) say "{Product} doesn't have access to YouTube." with **Give access to YouTube**, or the same for YouTube Music. (R12, R53)
- **FT-47** **Missing YouTube Music access** raises the "!" only while something that needs it is on: a YouTube Music feature, or "Also on YouTube Music" while Playlist shortcuts is on (FT-44), with the YouTube Music section switch on. "Also on YouTube Music" without access shows **Give access** ([YM-PS-2](03-youtube-music.md#18-playlist-shortcuts-on-youtube-music)). A prompt denied from Playlist shortcuts' own switch turns "Also on YouTube Music" off, so it raises no "!" (FT-52). (R53, R71)
- **FT-48** The site-access check is local, so it also runs before consent. The upgrade note can show **Give access to YouTube** before Agree.
- **FT-49** A feature that's on in a browser without that site's access, for example one switched on by sync, shows "Needs site access" until access is granted there. Site access never syncs.
- **FT-50** **Give access** calls the browser's permission request first, synchronously in the click handler.
- **FT-51** When access is granted, the switched-on features for that site register and are injected into its open tabs without a reload. When it's revoked, they unregister and tear down.
- **FT-52** If the user denies the access prompt raised by switching a YouTube Music feature, or "Also on YouTube Music", on in the popup or Settings, that switch stays off. Two cases differ:
  - **Playlist shortcuts' own switch** (its preset turns "Also on YouTube Music" on, FT-44): Playlist shortcuts goes on, "Also on YouTube Music" turns off, and "No access to YouTube Music, so shortcuts work on YouTube only." shows in place, under Playlist shortcuts' row where the switch was clicked (R71).
  - **First run's Agree:** consent and the other ticks still apply, and whatever ticked needs the access is saved on but held with "Needs site access" until access is granted (FT-40 step 2). (R14, R53, R71)
- **FT-53** **PROVISIONAL** ([ticket 09](../issues/09-where-things-live.md), Chrome 133+): while a feature for a site is on and that site's access is missing, the extension also calls `permissions.addHostAccessRequest` on that site's open tabs, so Chrome's extensions menu offers the grant.
- **FT-54** **No YouTube tab:**
  - The popup and settings show the account's cached data, stamped with its age (for example "This is saved data from {2 hours ago}.": [UI-POP-10](05-ui.md#banners) row 7, [UI-POP-27](05-ui.md#overlays-and-states)), with **Open YouTube**, or **Open YouTube Music** in that tab, which opens the site's home page in a new tab.
  - The switches still work.
  - These need a tab: the playlist picker and **↻ Refresh playlists** (DATA-20); creating a playlist ("Open YouTube to create playlists"); looking up a typed channel, other than a `UC…` ID or a `/channel/UC…` URL ("Open YouTube to look up this channel"); every quick action; This video; Playing now; and **Check now**, which is disabled with "Open YouTube to check" and **Open YouTube** (HEALTH-23; R15).
  - Settings stays open and refreshes when a tab of the account in view answers.
  - There's no hidden frame and no YouTube Data API, ever ([§6.2.14](06-architecture.md#6214-no-data-api)). (R15, R39)
- **FT-55** Fresh data for the popup and settings comes through a **serving tab**: an open tab of the account in view, in a window of the same kind (normal or private). Getting it never wakes, reloads, activates or undiscards a tab. How it's chosen is in [06's serving-tab routing](06-architecture.md#6211-serving-tab-routing) (ARC-ACC-52 to ARC-ACC-57). Playing now picks its YouTube Music tab by its own order ([YM-POP-11](03-youtube-music.md#17-playing-now-in-the-popup); R8, R33).

### 1.8 The toolbar badge

- **FT-57** **The toolbar "!"** shows when the user must act. Only one shows at a time: the first of these that applies ([UI-IA-08](05-ui.md#51-information-architecture)):
  1. consent or the upgrade note is pending, including a new consent version (FT-30, FT-36, FT-43);
  2. site access is missing for a site with a switched-on feature (FT-46); for YouTube Music, only while something that needs it is on (FT-47);
  3. a feature isn't working (HEALTH-15);
  4. a playlist in a setup is marked Missing or Full (ACC-06).

  Partly working sets no badge. The "!" always wins over auto-add's toolbar tick (FT-01; [ticket 15](../issues/15-popup-and-settings.md)). (R12, R53)
- **FT-58** **Scope and colour:**
  - **Per tab:** "not working" shows only on the tabs it concerns.
  - **Every tab:** consent, missing site access and Missing or Full. Site access is on every tab because, without it, the extension can't tell which tabs are that site's (R53).
  - **Colour:** the "needs you" reasons (consent, site access, Missing or Full) use the brand violet; "not working" is amber. (R12, R53)

## 2. Accounts

### 2.1 What an account is

- **ACC-01** An **account** is whatever the page's `ytcfg.DATASYNC_ID` identifies: a Google account's own identity, or a brand account it has switched to. Each has its own playlists, Watch Later and account setup.
  - The ID is used whole and never parsed.
  - It isn't `SESSION_INDEX` / `authuser`, which shift as accounts sign in and out.
  - It isn't the Google account alone, which would merge a person's own channel with their brand channels.
- **ACC-02** A page is **signed in** only when `ytcfg.LOGGED_IN` is true. A signed-out page's visitor ID (`V…||`) never becomes an account key.
- **ACC-03** **Account key:** the first 16 characters of the base64url SHA-256 of the whole `DATASYNC_ID`.
  - It's computed in the tab's isolated core. The raw ID never leaves its tab, and is never stored or synced.
  - The same account gets the same key in every browser, so its setups meet in the synced copy.
  - **PROVISIONAL** ([ticket 25](../issues/25-live-checks.md) L7): this assumes `DATASYNC_ID` survives sign-out and sign-in and is the same in every browser and on both sites.
    - If it's unstable within a browser, setups are re-attached by matching playlist ownership, as for 1.x setups.
    - If it differs between browsers, each browser makes its own setup for that account, and the two appear side by side with the same label. Re-attaching them is an open question.
- **ACC-04** The extension never switches accounts. It links to YouTube's own pages:
  - **Switch account** opens `https://www.youtube.com/channel_switcher`;
  - **Sign in** opens YouTube's sign-in page, which returns to the same page.
- **ACC-05** **Edge cases:**
  - an account without a channel is still an account; Watch later works, but creating a playlist may fail;
  - a delegated channel manager is whatever its `DATASYNC_ID` says, with no special case.

### 2.2 Account setups and shared settings

- **ACC-06** **The rule:** a choice belongs to the **account setup** only if it names one of that account's playlists. Everything else is a **shared setting**.

| Account setup (one per account) | Shared settings (every account) |
|---|---|
| Auto-add playlists, each with Takes and an optional required-percentage override | Every feature's switch, options and Show feedback |
| Their channel filters, kept and orphaned filters included, with their channel labels | The playlist shortcuts' keys, labels and "Watch later on every account"; the picker key; the undo key; Also on YouTube Music |
| Each playlist shortcut's playlist | The default required percentage |
| The quick-save playlist on YouTube, and the one on YouTube Music | Quick actions' buttons and the quick-action keys |
| Missing and Full marks | Whether presets were applied; the theme |
| The account label: name, @handle and avatar URL | |

- **ACC-07** Caches of an account's playlists are per account but outside the setup. Each browser keeps its own and never syncs it (DATA-20).
- **ACC-08** **A new account has no setup.** Nothing about it is stored (no setup, cache or label, and it never becomes the last account) until the user makes a choice for it, such as ticking a playlist or choosing a shortcut's playlist. That choice creates the setup.
  - A setup is deleted, with its label, cache and synced copy, once it holds nothing: no auto-add playlists, targets, quick-save playlists or kept filters.
  - Kept filters count as choices, so re-ticking a playlist brings its filter back unchanged.
- **ACC-09** **An account with no choices is idle:**
  - auto-add tracks nothing there;
  - nothing beyond what its switched-on features normally draw appears on the page;
  - explicit actions still answer, after the sign-in check (ACC-21; R25):
    - a playlist shortcut with no playlist on this account shows the hint "{Shortcut} has no playlist on {Account} yet." with **Choose**, which opens the in-page picker in choose mode for that shortcut. It always shows, even with Show feedback off, because it's a neutral hint, not a failure (FT-25; R56);
    - the pick both becomes the shortcut's playlist on this account and saves the item there, on both sites. The toast reads "{Shortcut} now saves to “{Playlist}”." with **Undo** for that save. The picker key in choose mode follows Playlist shortcuts' Show feedback ([YT-KEY-13](02-youtube.md#282-the-playlist-shortcut-list), [YM-PS-4](03-youtube-music.md#18-playlist-shortcuts-on-youtube-music); R45);
    - quick-save with no quick-save playlist asks where to save. (R24, R25, R45, R56)
- **ACC-10** There are no per-account feature switches and no per-account shortcut lists.
  - A shortcut's key and label are shared; its playlist is per account.
  - A shortcut with no label shows the current account's playlist title.
  - "Watch later on every account" makes a shortcut target the Watch later of every account that hasn't chosen another playlist for it. An account with its own choice keeps it ([YT-KEY-12](02-youtube.md#282-the-playlist-shortcut-list)).
- **ACC-11** Setups can't be copied between accounts.

### 2.3 Which account is shown

- **ACC-12** **In a tab:** the tab's own account, read at every page load. A tab keeps that account until it reloads.
  - In-page features use only that account's setup.
  - A tab receives the shared settings, its own account's setup, filters and session skips, and the device-wide fields it needs, such as this browser's Sort A–Z, Pause and the tab's own feature statuses ([ARC-MSG-05](06-architecture.md#682-tab--background)). It never receives anything about another account.
- **ACC-13** **The account in view** in the popup is the first of these that applies:
  1. the active tab's account, or its signed-out state, when that tab is YouTube or YouTube Music;
  2. else the account of the most recently active YouTube or YouTube Music tab, among windows of the same kind (normal or private);
  3. else, in a normal window with no YouTube tab open, the last account with a setup that was current in a normal window (`Device.lastAccount`), shown from cache (FT-54). An account without a setup has no cache (DATA-19), so it's never this fallback. A private window has none.

  This order is the one every chapter follows (R54).
- **ACC-14** Settings shows the account the user picks in it, from its "Showing setup for {Account}" menu.
- **ACC-15** **Showing another setup:** with two or more setups, the popup's header and settings' top bar can show any of them, in normal windows only.
  - It changes only what's shown, never YouTube's account, so the copy never says "switch": "Show the setup for" › "This only changes what you see here. YouTube stays on the account you're signed in as."
  - This video and Playing now always act as the tab's own account.
  - With one setup there's no picker, only the label.
- **ACC-16** Requests for the account in view go through an open tab of that account, in a window of the same kind; the order tabs are tried in is [ARC-ACC-54](06-architecture.md#6211-serving-tab-routing). Containers don't matter, because the account decides. If no tab answers, the popup shows cached data and "{Account} isn't open in any tab. Open YouTube and switch to this account to refresh its playlists."
- **ACC-17** The account header always names the account, with its avatar, name and @handle.
  - While the account is being read, it shows a placeholder, never the signed-out state.
  - Before consent it shows nothing (FT-30).
- **ACC-18** **Account labels:**
  - they come from YouTube's account menu;
  - they're stored only for accounts with a setup, inside the setup, so they sync;
  - they're checked when the account is seen in a normal window, at most once per 24 h per browser, and written only when they change;
  - names are cut to 100 characters, and the fallback is "Unnamed account".

### 2.4 Account changes

- **ACC-19** **Switching account or channel in a tab** is a full page load on YouTube. The page picks up the new account's setup, and an open popup follows the tab it's showing. Other open tabs keep their account until they reload.
- **ACC-20** **A new account's first visit:** nothing happens on the page and nothing is stored. The popup shows the account with its playlists unticked and "Nothing is saved for {Account} until you tick one."
- **ACC-21** **Signing out keeps every setup.** On a signed-out page:
  - jobs that need an account aren't sent;
  - auto-add stays silent, with no toast, so 1.5.0's toast on every video doesn't come back ([YT-GEN-08](02-youtube.md#21-rules-shared-by-every-youtube-feature); R41);
  - the sign-in check comes first, before "has a playlist" (R25);
  - every explicit action that needs an account shows the same failure toast with **Sign in**, in ticket 12's wording: Save, playlist shortcuts, quick-save, the picker, the watch-page menu's Save rows, and the queue actions that need an account. On YouTube it reads "Sign in to YouTube to save videos."; on YouTube Music, "Sign in to YouTube Music to save songs." ([YM-ACC-5](03-youtube-music.md#2-accounts-and-private-windows)). Like keeps its own wording, "Sign in to YouTube Music to like songs.", as a failure toast with **Sign in**. They're failures, so Show feedback never hides them (FT-25; R41);
  - Add to queue, the card menu and YouTube Music's queue actions keep working, because they need no account;
  - the popup says "You're not signed in to YouTube in this tab." with **Sign in**, and other setups stay reachable from the account header.

  After signing back in, the same setup resumes. (R3, R25, R41)
- **ACC-22** **The account guard** catches a sign-out or account switch in another tab, which leaves an open tab believing it has its old account.
  - Every YouTube response names the account it answered for (`datasyncId`). **PROVISIONAL** ([ticket 25](../issues/25-live-checks.md) M2): if YouTube Music's answers carry none, the YouTube Music guard has only the page-load `ytcfg` check ([ARC-ACC-48](06-architecture.md#6210-the-account-check)).
  - The guard checks before each job, before every write (the membership read before every add must name the same account), and after every response ([ARC-ACC-47](06-architecture.md#6210-the-account-check)).
  - On a mismatch, the tab refuses every job that needs an account until it reloads: no further adds, saves or likes, and auto-add is disarmed. Queue actions, which need no account, keep working ([YM-ACC-6](03-youtube-music.md#2-accounts-and-private-windows)).
  - It shows "Your YouTube account changed in another tab. Reload this page to keep saving here." with **Reload**: on every explicit press that needs an account, because explicit actions always answer (R22), and once per tab for auto-add. The popup shows the same state as a banner. (R55)
  - YouTube Music likes return nothing to check, so they rely on the tab having tripped on an earlier response.
  - Why it matters: Watch Later's ID means "the current account's Watch Later", so a stale tab's add would land in the wrong account.
- **ACC-23** If YouTube stops exposing `DATASYNC_ID` or `LOGGED_IN`, account-dependent features stop rather than act on an unknown account (HEALTH-09).

### 2.5 Removing a setup

- **ACC-24** Settings › Accounts lists every account that has a setup, each with a summary and **Remove**. It also lists:
  - setups that only came by sync, as "3 auto-add playlists · Open YouTube as {Account} to see them" until that account is opened in this browser;
  - the unclaimed 1.x setup, with **Switch account** and **Discard** (ACC-33).

  **Sign in** and **Switch account** link to YouTube's own pages.
- **ACC-25** **Remove** asks first: "Remove {Account}'s setup? Its auto-add playlists, channel filters, shortcut playlists and quick-save playlists are deleted from {this browser | every browser that syncs your settings}. Your playlists on YouTube aren't touched." with **Remove** and **Cancel**. What it deletes is DATA-44: the marks and the label go with the setup, and this browser's cache, watch progress and session memory for the account go too.
- **ACC-26** Removing a setup is refused from a private window.
- **ACC-27** A deleted account's setup stays, dormant, until the user removes it. The account starts a new setup with its next choice.

### 2.6 The unclaimed setup and claiming

- **ACC-28** The 1.x migration puts 1.4.5's auto-add playlists and shortcut playlist, plus 1.5.0's channel filters with their labels, into the **unclaimed setup**. 1.4.5 wrote to whichever account authorised its OAuth client, which may not be the account signed in to YouTube.
- **ACC-29** The unclaimed setup is never used. It stays in this browser only, never syncs, and is kept until it's claimed or discarded.
- **ACC-30** **Claiming:**
  - **When:** only after consent, so no request is sent first.
  - **Who:** the first signed-in account seen in a normal window whose own playlist list holds any of the setup's playlist IDs. Matching is by playlist ID, never by title.
  - **Never** from a private window (DATA-33).
- **ACC-31** **What claiming does:**
  - playlist IDs that account doesn't own are dropped; they never worked, since 1.4.5 only ever added to one account;
  - the rest become that account's choices: auto-add playlists taking Videos and using the default percentage, the first playlist shortcut's playlist, and their channel filters;
  - if the account already has a setup, the claimed choices are merged in without replacing anything the user chose. Missing auto-add playlists are added, the shortcut's playlist is used only if that shortcut has none on this account, and an existing filter is kept;
  - the result then syncs like any setup.
- **ACC-32** **The claim result** shows once: in the upgrade note if it's still open, else in the popup ([UI-POP-10](05-ui.md#banners) row 12). "Your auto-add playlists and shortcut from 1.x are now set up for {Account}." In the note, the playlists' titles follow: "…set up for {Account}: {titles}." ([REL-CON-10](08-release.md#34-agree-and-not-now)). If any were dropped, it adds "{N} of them weren't on this account and were left out."
- **ACC-33** **Unmatched:** on an account that doesn't own its playlists, the popup says "Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them, or set up {Account} below." with **Switch account** and **Discard**. Discard deletes the unclaimed setup.
- **ACC-34** **At Agree with nothing to claim from yet:** the upgrade note says "Sign in to YouTube and your 1.x playlists will be picked up." when not signed in, and "Open YouTube and your 1.x playlists will be picked up." when no tab is open.
- **ACC-35** Ticket 25 checks whether YouTube's playlist list includes collaborative playlists, which decides whether those count as owned for claiming.
- **ACC-46** **Claiming looks once per account.** The playlist-list read that claiming needs (ACC-30) happens at most once per account per browser session. "Checked, no match" is kept in session memory, so an account that doesn't own the playlists isn't fetched again on every page load. (R116)

### 2.7 Private windows and containers

- **ACC-36** The extension runs in private and incognito windows only if the user allows it in the browser, which is off by default in both. The manifest leaves `incognito` at its default.
- **ACC-37** **When allowed:**
  - an account that already has a setup works as in a normal window: auto-add, playlist shortcuts, quick-save and YouTube Music. Auto-add isn't paused there;
  - nothing that comes from the private session is written to any storage area. That rules out new setups, setup edits, labels, marks, caches, newly created playlists, watch progress, the last account, the last visibility, claiming and session memory;
  - fetched data (playlist lists, membership, undo entries, progress) lives only in that tab's memory and goes with it.
- **ACC-38** **Shared-settings changes made in a private window are saved:** switches, options, keys, labels, the theme and the default percentage. They're the user's own configuration and carry nothing from the session (R58). The picker's pins stay disabled there, because the quick-save playlists belong to the account setup (DATA-33), and their tooltip says why: "Quick-save playlists can't be changed in a private window." (R69). This is settled: a settings change the user makes isn't browsing data, and nothing about the window's browsing is stored, so [ticket 23](../issues/23-ask-amo.md)'s question 3 isn't put to AMO. Only if an AMO reviewer objects does [08 §13](08-release.md#13-if-an-amo-reviewer-objects)'s fallback refuse those writes too, with the private-window popup saying "Settings can't be changed in a private window." (R58, R69, R83)
- **ACC-39** **Routing:** a normal window's popup or settings never works through a private tab. A private window's popup works only through private tabs.
- **ACC-40** **Private-window popup copy:**
  - for an account with a setup: "Private window: {Account}'s setup is in use. You can change it only in a normal window.";
  - for one without: "{Account} has no setup yet. A private window can't save one, so set it up in a normal window." Shared-settings changes made there are saved (ACC-38), so the copy doesn't say the window saves nothing (R58).

  Setup controls are disabled there, and a refused write is answered as "private".
- **ACC-41** **Containers** need no special handling. A container is just another place an account can be signed in. The same account in two containers shares one setup, a different account gets its own, and no container ID is stored.

### 2.8 YouTube Music

- **ACC-42** YouTube Music uses the same accounts and setups. A YouTube Music tab reports `DATASYNC_ID` like a YouTube tab, and its playlists are the account's YouTube playlists.
- **ACC-43** If youtube.com and music.youtube.com tabs are on different accounts, each uses its own account's setup.
- **ACC-44** YouTube Music's choices are shared settings: the section switch, the buttons and the quick-action keys. Only Save to playlist's quick-save playlist belongs to the account setup.
- **ACC-45** The installed YouTube Music app's window counts as an ordinary tab.

### 2.9 Scenarios

| Scenario | What happens |
|---|---|
| Two Google accounts in two tabs | Each tab uses its own setup. The popup follows the active tab, and its header can show the other account. |
| A brand channel | It's its own account with its own setup, separate from the Google account's own channel. |
| Switching mid-session | The reload picks up the new account's setup. Other open tabs keep theirs until they reload. |
| Signing out, then back in | Setups are kept and the signed-out behaviour applies. After signing back in, the same setup resumes. |
| Sign-out or switch in another tab | The account guard stops the stale tab and asks for a reload. |
| A container tab with a second account | It gets its own setup. The same account in two containers shares one setup. |
| A private window | Off unless the user allows it. When allowed, existing setups are used and nothing from the session is saved. |
| A 1.4.5 setup whose playlists belong to another account | It stays unclaimed until its owner appears. The popup explains and offers Switch account or Discard. |
| A new account's first visit | Nothing on the page and nothing stored. The first choice creates its setup. |
| YouTube and YouTube Music on different accounts | Each site uses its own account's setup. |
| The same account in two syncing browsers | Both use the same setup document (ACC-03's PROVISIONAL applies). |
| A deleted account | Its setup stays dormant until the user removes it. |

## 3. Settings sync

### 3.1 The feature

- **SYNC-01** **Settings sync** is a feature with one switch per browser.
  - It's off until the user switches it on in that browser, and the switch itself never syncs. It's stored as `Device.syncOn` (DATA-12), not in the shared settings, so the feature registry treats it as the one feature whose switch is per browser (R54).
  - It's offered first on first run's step 1, and lives in Settings › Everywhere.
  - The popup has no row for it; a sync problem appears there as a banner with **Details**.
- **SYNC-02** **It uses the browser's own sync:**
  - **Chrome** syncs extension settings while the user is signed in to Chrome with Extensions sync on, including when signed in without full sync;
  - **Firefox** syncs them while the user is signed in to a Mozilla account with **Add-ons** ticked, every 10 minutes or on Sync Now.

  Whether the browser actually syncs can't be detected, so the switch's help text says so: "Uses {Chrome's | Firefox's} own sync. Your settings reach your other browsers only if you're signed in to the browser and it syncs extensions{| (Add-ons in Firefox Sync)}." With the browser's own sync off, the synced copy simply stays in this browser.
- **SYNC-03** **What syncs:** the shared settings, feature switches and Show feedback included, and every account setup with its channel filters, channel labels and account label. **What never syncs:** consent, the sync switch, the upgrade note, the unclaimed setup, caches, watch progress, session memory, the last account, the last visibility and Detailed console log. The full table is DATA-05.
- **SYNC-04** Synced feature switches mean a browser with sync on gets the same features switched on. Each browser still needs its own consent (FT-34) and its own site access (FT-49). A user who wants different features in one browser switches sync off there, and that browser keeps its own copy.

### 3.2 The local copy comes first

- **SYNC-05** Each browser's `storage.local` is always its truth. The **synced copy** in `storage.sync` is a copy, kept as whole documents: the shared settings, one document per account setup, and one per channel filter.
- **SYNC-06** **Changes travel within seconds** on Chrome, and within Firefox's sync interval there. This browser pushes a changed document 2 s after the last change, and at most once every 5 s. Documents arriving from other browsers apply as ordinary local changes: open pages and tabs pick them up without a reload.
- **SYNC-07** **A synced copy that vanishes isn't a deletion.** If the synced copy loses documents without a tombstone (an uninstall in another browser, a reset of the browser's own sync, or Chrome's first sync after sign-in), this browser pushes its own documents back. Nothing local is lost.
- **SYNC-27** **One write per push.** A push writes every changed document, with its chunks, in one `storage.sync.set()` call. So SYNC-06's pace keeps sync at no more than 12 writes a minute, a tenth of Chrome's 120 (Firefox doesn't limit the rate). A document whose synced copy is already the same is never pushed, so two browsers can't keep pushing the same documents back and forth (SYNC-07). The background listens only to the sync area's own change event, and ignores it while sync is off in this browser ([Q-PERF-54](07-quality.md#768-running-cost)). (R108)

### 3.3 Switching on: the join

- **SYNC-08** When a browser switches sync on, its documents and the synced copy are joined:
  1. **No synced copy yet:** wait up to 10 s, because a new browser may still be downloading one. If none arrives, start one from this browser's documents.
  2. **A synced copy exists, and this browser has nothing of its own:** adopt the synced copy silently. "Nothing of its own" means no document was ever edited here, or nothing was edited here since this browser last synced with the same synced copy.
  3. **Both sides have settings:** ask once, in one dialog wherever the switch was flipped ([UI-SET-13](05-ui.md#sections)):
     - **Use synced settings** (the default): the synced shared settings replace this browser's; for an account both sides have, the synced setup and its filters win; setups only this browser has are added to the synced copy;
     - **Use this browser's settings:** the reverse; setups only the synced copy has are added here;
     - **Cancel** leaves sync off.

     Either way, nothing is lost for an account only one side has. Until the question is answered, the sync status is `waiting` (SYNC-24; R13).
  4. **At first run:** if a synced copy arrives within the 10 s, first run shows its features ticked and marked "From sync" instead of the defaults, for the user to review before Agree. This lookup may run before consent, because it reads only the user's own settings in the browser, not YouTube. Nothing is pushed, and the sync switch isn't stored, until Agree; without Agree, nothing is written (FT-31, FT-41). Consent is still this browser's own. (R9)
  5. **Two histories meet later:** if the synced copy is replaced by a different history under a browser that's already syncing (Chrome's sign-in merge, or two browsers that each started one), the browser that last joined the replaced history asks step 3's question. The other carries on. Until it's answered, the asking browser pushes nothing, and its status is `waiting`. (R9, R13)
- **SYNC-09** Turning sync on with more than fits the budget is refused, with SYNC-14's message naming what to remove.

### 3.4 Conflicts

- **SYNC-10** The unit of conflict is the document. Two browsers editing different documents never conflict.
- **SYNC-11** For the same document, **the newest edit wins**, by the time of the user's edit, with the device ID breaking ties. The losing edit shows as reverted. It takes edits to one document in two browsers within one sync interval.
- **SYNC-12** **Deletions are tombstones,** kept for 30 days, so an older edit can't bring back a removed setup or filter.
- **SYNC-13** A document too large for one sync item is applied only once every part of the same write has arrived. Until then, the last good local copy stays.

### 3.5 Budget and "full"

- **SYNC-14** **The synced copy stays under 96 KiB and 480 items,** counted the way the browsers count (the UTF-8 key plus the JSON value, plus 4 bytes per item). That's the browsers' 100 KiB and 512 items, less headroom: about 1,060 listed channels beside 20 shortcuts and 5 account setups.
  - **While sync is on, a user change that would go over is refused, and nothing is saved.**
  - The message: "Synced settings are full. {Largest}: remove some, or turn off sync in this browser to keep more here." {Largest} names what takes the most room, for example "Music's channel filter uses 39 KB".
  - If kept filters take room, it offers **Remove kept filters**, described as "Filters of playlists you no longer auto-add to".
- **SYNC-15** A refused change is never kept locally and left unsynced. Browsers never differ silently.
- **SYNC-16** Label refreshes and Missing/Full marks may use the headroom. If even that's gone, they stay local until room frees up.
- **SYNC-17** If the synced copy goes over anyway (a browser-side merge ignores quotas), this browser stops pushing, and the status says "Synced settings are full". It recovers as soon as the user removes something.
- **SYNC-18** The per-item limit (8,192 bytes) never reaches the user: larger documents are split.

### 3.6 Switching off

- **SYNC-19** Switching sync off stops this browser reading and writing the synced copy, and **deletes nothing**. This browser keeps every setting as it was, and the synced copy stays for the other browsers.
- **SYNC-20** Switching on again later is a join. With no edits here in the meantime, it adopts the synced copy silently.
- **SYNC-21** Deleting the synced copy is Clear all data's job (DATA-40), never a side effect of switching off.

### 3.7 Different 2.x versions: "update needed"

- **SYNC-22** Every synced document carries its own version.
  - A browser that reads an older version upgrades the document in memory and writes the new form at its next edit of that document. Older browsers keep syncing until they update.
  - Within one version, changes are additive only, and fields a browser doesn't know are kept unchanged when it writes.
- **SYNC-23** **A document with a newer version than this browser understands** isn't adopted. This browser stops pushing that document, and shows "Update {Product} in this browser to keep syncing." Extensions update within a day, so this is brief.
  - **`update-needed`** refuses only edits to the synced documents a newer version wrote, which this browser can't read. They're refused and not saved (FT-12, SYNC-15), answered as `update-needed` ([§6.9's `ChangeResult`](06-architecture.md#69-the-store-module-interface)).
  - Every other edit goes through. (R13)

### 3.8 Status

- **SYNC-24** Settings › Everywhere shows the sync status under the switch ([UI-SET-12](05-ui.md#sections)):
  - looking for synced settings (`joining`);
  - waiting for the join question to be answered (`waiting`: SYNC-08 steps 3 and 5);
  - synced (`ok`);
  - "Synced settings are full. {Largest}: …" with **Remove kept filters** (`full`, SYNC-14);
  - "Update {Product} in this browser to keep syncing." (`update-needed`, SYNC-23).

  "Full" and "update needed" also show as the popup's sync banner ([UI-POP-10](05-ui.md#banners) row 9). The status is never synced. (R13)
- **SYNC-25** Settings sync switches, the join choice and Clear all data are allowed from a private window. Documents arriving from the synced copy come from the user's other browsers, never from a private session, so they're accepted.

### 3.9 Firefox's data-collection declaration

- **SYNC-26** **Settings sync declares no Firefox data type.** It uses the browser's own sync, which the developer never sees, while Firefox presents data collection as data the extension shares with its developer. So switching sync on in Firefox asks Firefox for nothing, and neither does the upgrade note's Agree with sync ticked. This settles [ticket 23](../issues/23-ask-amo.md)'s question 2 by decision, without asking AMO. (R83)
  - **Only if an AMO reviewer objects**, and sync becomes an optional data type ([08 §13](08-release.md#13-if-an-amo-reviewer-objects)'s fallback):
    - switching sync on in Firefox first asks for Firefox's data-collection permission;
    - if the user declines, sync stays off with "Sync needs your permission to send settings through Firefox Sync.";
    - if the permission is revoked later in about:addons, sync switches off in that browser and its settings stay;
    - with sync ticked, the upgrade note's Agree requests the permission in the same click, before anything is awaited.
  - Chrome is unaffected either way.

## 4. Data

### 4.1 Where data lives

- **DATA-01** **Three storage areas:**
  - `storage.local` holds the settings and choices, and is always this browser's truth;
  - `storage.session` holds memory for the current browser session;
  - `storage.sync` holds only the synced copy, and only while settings sync is on.

  There's no IndexedDB, no `localStorage` and no cookie of ours.
- **DATA-02** Only the background writes storage. Pages and tabs send changes as messages, and content scripts never read storage. Each tab gets a view instead: the shared settings, its own account's setup, filters and session skips, and the device-wide fields it needs, such as this browser's Sort A–Z and Pause (ACC-12; [ARC-MSG-05](06-architecture.md#682-tab--background)). The store's interface is in [06 Architecture](06-architecture.md).
- **DATA-03** **What's kept in this browser,** as Settings › Privacy & data and the privacy policy describe it:
  - the user's settings and each account's setup, and their consent;
  - a list of each account's playlists (names, counts and thumbnail links), refreshed when it's shown and more than 5 minutes old, plus playlists created in the last 24 hours;
  - watch progress per video, for up to 30 days ([§4.6](#46-watch-progress));
  - settings from 1.x that are waiting for their account;
  - until the browser closes, or the extension updates (DATA-11): Pause, videos the user chose not to auto-add, recent adds (one minute), and breakage signals. Session skips and recent adds may name videos and playlists, but they stay in this browser's memory until it closes, and are never synced or sent anywhere. Breakage signals name nothing (HEALTH-03).

  Nothing is sent anywhere except the requests to YouTube and, if switched on, settings sync. The privacy policy's matching lines are in [REL-STORE-17](08-release.md#102-text). (R10, R57)
- **DATA-04** **Groups:**

| Group | Examples | Area | Syncs while settings sync is on |
|---|---|---|---|
| **Shared settings** | Feature switches and options, Show feedback, the YouTube Music section switch, the shortcuts' keys and labels, the default required percentage, the theme | `storage.local` | Yes |
| **Account setups** | Auto-add playlists (Takes, percentage override), channel filters with their channel labels, shortcut targets, both quick-save playlists, Missing/Full marks, the account label | `storage.local` | Yes |
| **This browser** | Consent, the sync switch, the upgrade note, the unclaimed 1.x setup, the last account, the last visibility, the picker's Sort A–Z, Detailed console log | `storage.local` | Never |
| **Caches** (per account) | Playlist list, thumbnails, counts, Save-dialog order, newly created playlists, the label check stamp | `storage.local` | Never |
| **Watch progress** (per account) | The played stretches of each video, for up to 30 days | `storage.local` | Never |
| **Session memory** | Pause, session skips, recent adds, 429 pauses, shown-once memory, breakage signals and notices, the tab registry | `storage.session` | Never |
| **Memory only** | Undo entries, locks, the picker's membership, anything from a private tab | The tab, or the background's own variables | Never |
| **Not stored** | Script registrations (derived from the switches, consent and site access), membership, a video's channel | — | — |
| **The browser's own** | Site access (YouTube Music is optional on Chrome), Firefox data-collection grants | Browser permissions | Never |

  (R1, R39)

### 4.2 What syncs, setting by setting

- **DATA-05**

| Setting or data | Scope | Syncs |
|---|---|---|
| Each feature's switch | Shared | Yes |
| Each feature's Show feedback | Shared | Yes |
| The default required percentage | Shared | Yes |
| Playlist shortcuts: key, label, Watch later on every account | Shared | Yes |
| The picker key, the undo key, Also on YouTube Music | Shared | Yes |
| The YouTube Music section switch (R1) | Shared | Yes |
| Quick actions' buttons, quick-action keys | Shared | Yes |
| Whether each feature's presets were applied | Shared | Yes |
| Theme | Shared | Yes |
| Auto-add playlists, their Takes and percentage override | Account | Yes |
| Channel filters: mode, on/off, listed channels and their channel labels; kept filters included | Account | Yes |
| Shortcut targets | Account | Yes |
| Quick-save playlists for YouTube and YouTube Music | Account | Yes |
| Missing and Full marks | Account | Yes |
| The account label: name, @handle, avatar URL | Account | Yes |
| Settings sync on/off | This browser | Never |
| Consent, the upgrade note, the claim notice | This browser | Never |
| The unclaimed 1.x setup | This browser | Never |
| The last account | This browser | Never |
| The last visibility picked for new playlists | This browser | Never |
| The picker's Sort A–Z ([UI-PICK-26](05-ui.md#contents-and-behaviour-every-container); R39) | This browser | Never |
| Detailed console log | This browser | Never |
| The playlist cache and newly created playlists | This browser, per account | Never |
| Watch progress | This browser, per account | Never |
| Pause, session skips, recent adds, 429 pauses, shown-once memory | Browser session | Never |
| Breakage signals, notice memory, feature statuses | Browser session | Never |

- **DATA-06** **Labels sync; playlist titles don't.**
  - Channel labels sync inside their filter, so no browser has to look up each channel again.
  - The account label syncs inside its setup, so a browser that never saw that account can still name it in the account list and in Remove's confirmation.
  - Titles of chosen playlists come from each browser's own cache, filled by one request per account. Until then, a setup that came by sync reads "3 auto-add playlists · Open YouTube as {Account} to see them".
  - Labels are written only when they change, so they never cause sync churn.

### 4.3 Storage layout

#### `storage.local`

- **DATA-07**

| Key | Holds | Shape | Lifetime |
|---|---|---|---|
| `schema` | This browser's storage layout version | number (2.0 writes `1`) | Always. A fresh install writes it at the first background start, before consent; each migration writes it last (DATA-46; R21) |
| `device` | This browser's own state | `Device` | Until Clear all data |
| `doc:settings` | The shared settings | `Stamped<Settings>` | Until Clear all data |
| `doc:setup:<acct>` | One account setup | `Stamped<Setup>` | Until the setup is empty or removed |
| `doc:filter:<acct>:<playlistId>` | One channel filter of that account, kept filters included | `Stamped<Filter>` | Until removed with its setup, or by Clear all data |
| `unclaimed` | The 1.x setup waiting for its account | `Unclaimed` | Until claimed or discarded |
| `cache:<acct>` | The account's playlist cache | `AccountCache` | While the account has a setup |
| `progress:<acct>:<n>` | The account's remembered watch progress, in 16 shards, `n` 0–15 (DATA-56; R105) | `Progress` | Per video: until auto-add has added it or found it already in (DATA-25), the length changes, or 30 days pass |
| `sync` | The replicator's bookkeeping | `SyncState` | Once sync has been on |

  (R21, R23, R43)

- **DATA-08** `<acct>` is the account key (ACC-03). An absent `doc:settings` reads as the defaults: every feature off, the YouTube Music section switch on (R1), and the undo key Alt+U (R44). An absent setup reads as "no choices". Every key has a prefix, so none reuses a 1.x name for a new shape.

#### `storage.sync`, only while settings sync is on

- **DATA-09**

| Key | Holds |
|---|---|
| `s:meta` | `{v, id, created, reset?}`: which synced history this is |
| `s:settings` | The shared-settings document |
| `s:setup:<acct>` | One account setup document |
| `s:filter:<acct>:<playlistId>` | One channel filter document |
| `s:<document>@<gen>.<i>` | Chunk `i` of a document too large for one item |

- **DATA-10** A document of up to 7,600 bytes is one item, `{v, gen, at, by, data}`. A larger one is a pointer `{v, gen, at, by, n}` plus `n` chunks named after its `gen`. A removed document is a tombstone, `{v, gen, at, by, deleted: true}`, for 30 days; while sync is on, the local copy keeps the tombstone too, and readers treat it as absent.

#### `storage.session`

- **DATA-11** Session storage is memory only. It's cleared when the browser closes or the extension updates, reloads or is disabled, so Pause and session skips also end when the extension updates. Pause lasts until the user resumes it or the browser restarts, and its copy says "until you resume it or restart the browser" (R57). Nothing in it comes from a private tab.

| Key | Holds |
|---|---|
| `paused` | Auto-add's Pause |
| `skips:<acct>` | Session skips: video ID → `"all"` or a list of playlist IDs |
| `recent` | Adds in the last 60 s, each `{acct, playlist, video, at}` |
| `cooldown:<acct>` | When a 429 pause ends |
| `shown` | Which once-per-session toasts were shown: auto-add's only, because explicit actions answer every time ([YT-ADD-25](02-youtube.md#252-feedback); R22) |
| `breakage` | Breakage signals, feature statuses, the notice-shown memory, the can't-measure run and the last Check now result |
| `tabs` | The tab registry: tab ID → `{site, acct, signedIn}` |

#### Shapes

- **DATA-12** The stored documents have these shapes. The four options marked `// options:` and the section switch were decided in tickets 09, 14 and 15, which didn't name their fields. The field names here are this chapter's, adopted with the defaults in the comments (R1, R11). Settings keys stay camelCase; feature IDs are kebab-case (FT-56; R32). (R1, R11, R13, R32, R39, R42, R44, R54)

```ts
// v: document version. gen: random ID of this write. at: when the user's edit happened (ms).
// by: this browser's random device ID.
type Stamp = { v: number; gen: string; at: number; by: string }
type Stamped<T> = Stamp & { data: T }

type Key = { char?: string; code: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }

type Settings = {
  theme: "system" | "light" | "dark"       // default "system" (R11)
  undoKey: Key | null                      // belongs to no feature; Alt+U at install (FT-05; R44)
  autoAdd: { on: boolean; feedback: boolean; pct: number /* default required percentage, 0–100 */
             toolbarTick: boolean }        // options: toolbar tick, default false (PROVISIONAL, R11)
  shortcuts: {
    on: boolean; feedback: boolean; music: boolean /* Also on YouTube Music */; preset: boolean
    picker: Key | null
    list: { id: string; key: Key | null; label: string; watchLaterOnEveryAccount: boolean }[] // ≤ 20
  }
  quickSave: { on: boolean; feedback: boolean; shortsShelves: boolean } // options: On Shorts shelves too, default false (R11)
  queueButton: { on: boolean; feedback: boolean }
  watchButton: { on: boolean; feedback: boolean; shorts: boolean }     // feedback default true (R42); options: On Shorts too, default false (R11)
  cardMenu: { on: boolean; keepLinkMenu: boolean }                     // options: Links inside cards keep the browser's menu, default false (R11)
  musicSection: boolean                                                // the YouTube Music section switch, default true (FT-06; R1)
  musicActions: {
    on: boolean; feedback: boolean; preset: boolean
    buttons: { next: boolean; queue: boolean; save: boolean; like: boolean; remove: boolean; bar: boolean }
  }
  musicKeys: {
    on: boolean; feedback: boolean; preset: boolean
    keys: Record<"next" | "queue" | "save" | "picker" | "like" | "remove", Key | null>
  }
}

type Setup = {
  label: { name: string; handle?: string; avatar?: string } | null
  autoAdd: { pl: string; takes: "videos" | "shorts" | "both"; pct?: number }[] // in the order ticked
  targets: Record<string /* shortcut ID */, string /* playlist ID */>
  quickSave: string | null // YouTube's thumbnail quick-save playlist
  musicSave: string | null // YouTube Music's Save to playlist
  marks: Record<string /* playlist ID */, "missing" | "full">
}

type Filter = { mode: "allow" | "deny"; on: boolean; channels: [id: string, title: string, handle?: string][] }

type Device = {
  id: string // random; appears only in stamps
  consent: { v: number; at: number } | null
  syncOn: boolean // Settings sync's switch: per browser, never in Settings (SYNC-01; R54)
  upgradeNote: { state: "pending" | "done"; details: UpgradeDetails; opened: boolean } | null // UpgradeDetails: 08-release
  claimNotice: { acct: string; dropped: number } | null // shown once
  lastAccount: string | null // the last account with a setup that was current, normal windows only
  newPlaylistVisibility: "PRIVATE" | "UNLISTED" | "PUBLIC" | null // the last pick here
  pickerSortAZ: boolean // the picker's Sort A–Z, default false; this browser only (R39)
  detailedLog: boolean
  legacyCleared: boolean // 1.x localStorage keys removed
}

type Unclaimed = {
  from: "1.4.5" | "1.5.0"; autoAdd: string[]; shortcutPlaylist: string | null
  filters: Record<string, Filter>; at: number
}

type AccountCache = {
  listAt: number | null // when the playlist list was last read
  playlists: { id: string; title: string; privacy?: "PRIVATE" | "UNLISTED" | "PUBLIC"; count?: number; thumb?: string }[]
  order: { www?: string[]; music?: string[] } // each site's Save-dialog order, from its last membership read
  created: { id: string; title: string; privacy: "PRIVATE" | "UNLISTED" | "PUBLIC"; at: number }[] // ≤ 24 h
  labelAt: number | null // when this browser last checked the account's label
}

// len and parts in seconds at 0.1 s precision; parts merged; at: when it last played
type Progress = Record<string /* video ID */, { len: number; parts: [number, number][]; at: number }>

type SyncState = {
  joined: string | null // the s:meta id this browser last synced with
  pushed: Record<string /* document */, string /* gen */>
  status: "off" | "joining" | "ok" | "full" | "update-needed" | "waiting" // SYNC-24 (R13)
  editedSinceOff: boolean
}
```

- **DATA-13** **Limits stored with the data:** at most 20 playlist shortcuts; a shortcut label up to 40 characters; a channel title up to 100 and a handle up to 30; an account name up to 100. Longer values are cut when saved. Shortcut IDs are random, 6 characters long.
- **DATA-14** **Unknown fields are kept.** A browser that reads a document with fields it doesn't know writes them back unchanged.
- **DATA-15** **Dangling references are ignored.** A target for a shortcut ID that no longer exists, and a mark for a playlist that's no longer chosen, are skipped when read and dropped at that document's next write.
- **DATA-16** **A setup is deleted when it holds nothing:** no auto-add playlists, targets, quick-save playlists or kept filters.

#### Sizes against the sync quotas

- **DATA-17** Measured sizes, counted as in SYNC-14:

| Document | Bytes | Items |
|---|---|---|
| Shared settings, presets only | 1,371 | 1 |
| Shared settings, 20 shortcuts with 40-character labels, half emoji | 6,126 | 1 |
| Account setup: 10 auto-add playlists, 20 targets | 2,025 | 1 |
| Account setup: 50 auto-add playlists, 20 targets | 4,582 | 1 |
| Channel filter, 100 channels | 7,367 | 1 |
| Channel filter, 500 channels | 39,623 | 7 |
| Channel filter, 1,000 channels | 79,000 | 12 |
| Tombstone | 136 | 1 |

  Each listed channel costs about 79 bytes. 20 shortcuts, 5 accounts with 10 auto-add playlists and 20 targets each, one 500-channel filter and ten 20-channel filters fit, at 68.6 KiB in 24 items. 20 shortcuts, 3 accounts and twelve 100-channel filters (96.6 KiB) are refused at their last few channels. `storage.local` allows 10 MB on Chrome, and Firefox sets no quota beyond IndexedDB's.

### 4.4 Account keys and stored identity

- **DATA-18** Storage holds account keys (ACC-03), never the raw `DATASYNC_ID`.
- **DATA-19** Nothing is stored about an account without a setup: no cache and no label, and it never becomes the last account. Its playlist list is fetched each time it's shown.

### 4.5 Caches and expiry

- **DATA-20** Caches are per account and per browser, stamped with when they were fetched, and never synced. An account without a setup has none.

| Cache | Where | Fresh for | Refreshed by | Removed when |
|---|---|---|---|---|
| **Playlist list:** IDs, titles, privacy, counts, thumbnail URLs | `cache:<acct>.playlists`, stamped `listAt` | 5 min | A popup, settings page or chooser that shows a staler list refreshes it once, through a serving tab, when it opens. Also the **↻ Refresh playlists** button in the picker's header and in settings' playlist lists, always ([UI-PICK-25](05-ui.md#contents-and-behaviour-every-container); R39), and every membership read. | The setup is removed or emptied, or Clear all data |
| **Save-dialog order,** per site | `cache:<acct>.order` | — | Each membership read on that site | As above |
| **Newly created playlists** | `cache:<acct>.created`, stamped per entry | Up to 24 h | Creating one | YouTube lists it, or it's 24 h old |
| **Account label check** | `cache:<acct>.labelAt` | 24 h | Seeing the account in a normal window | As above |
| **Account label** | In the setup | — | The check above; written only on change | With the setup |
| **Channel labels** | In each filter | — | Each read of that channel; written only on change | With the filter |

  (R39)

- **DATA-21** **Rules:**
  - paint from the cache at once, then refresh if it's stale, never more than once per open;
  - a membership read replaces the set of playlists, their titles and privacy, and that site's order, keeping thumbnails and counts for IDs still present;
  - a list read replaces thumbnails and counts;
  - lists show the site's Save-dialog order (Watch later first on YouTube), with search, unless this browser's Sort A–Z is on ([UI-PICK-04](05-ui.md#contents-and-behaviour-every-container), UI-PICK-26; R39);
  - Watch later is always present on YouTube as a fixed entry;
  - only playlists the account can add to are cached;
  - thumbnails are stored as URLs, never as image data;
  - with no YouTube tab, the cached data shows with its stamp (FT-54);
  - a Missing mark clears when the playlist appears in a list read again, and a successful add to a marked playlist clears its mark ([YT-ADD-36](02-youtube.md#255-failures)). That's a setup write, so it syncs. (R39)
- **DATA-22** **No membership cache.** Membership is read fresh before every add and every time the picker opens. A list of which videos are in which playlists would be a record of what was watched, and stale ticks mislead.
- **DATA-23** **No channel cache.** A video's channel is read from the page; a fallback request's answer lives only as long as the add or popup that asked for it.
- **DATA-57** **No write without a change.** The store compares before it writes. A membership read or list read that leaves the cache as it was, a tab registry entry that's the same, or a setting set to its current value writes nothing. Only one refresh of an account's playlist list is in flight at a time; a second view that opens meanwhile waits for it. (R108)

### 4.6 Watch progress

- **DATA-24** Remembered watch progress is kept in `progress:<acct>:<n>`, 16 shards per account (DATA-56). For each video it holds the length, the merged stretches that were played (at most 100; beyond that the shortest are dropped, which can only undercount), and when it last played.
- **DATA-25** A video's progress is kept until whichever comes first:
  - auto-add has run for it, which means only *added* or *already in*. *Filtered out*, *failed* and a session skip ("Don't auto-add this video") don't count, so they keep remembered progress; undoing the skip checks the goal at once ([YT-AA-04](02-youtube.md#231-switching-off-pausing-and-leaving-a-video-out));
  - its length changes by more than 2 s;
  - 30 days pass since it last played. (R23, R43)
- **DATA-26** At most 2,000 videos per account are kept, oldest dropped first. Expired entries are pruned when the account's progress is next written, at most once a day per account; a background start that doesn't write progress never reads it. (R107)
- **DATA-27** **Checkpoints.** It's written:
  - when the tab leaves the video or closes;
  - when playback pauses or ends, or the tab is hidden, unless the last save was under a minute ago;
  - after 5 minutes of continuous playback since the last save.

  Nothing is written when nothing new was played. So a playing tab saves at most once a minute, and about once every 5 minutes while a video simply plays; a crash loses at most 5 minutes of counting. (R105)
- **DATA-28** It never syncs and is never written from a private tab; there, progress lives in the tab.
- **DATA-29** It's deleted when auto-add is switched off (every account), when a setup is removed (that account), and by Clear all data.
- **DATA-56** **A save rewrites one shard.** Each account's progress is split into 16 shards by a small hash of the video ID. Loading a video's progress reads its shard, and saving rewrites only that shard, so a save doesn't grow with the history: a shard holds about a sixteenth of the account's videos. The daily prune and the 2,000-video cap (DATA-26) read the account's 16 shards in one call and rewrite only the shards that changed. (R105, R107)

### 4.7 The private-window write guard

- **DATA-30** One write path. Only the background writes, and it decides where a write comes from from the sender, never from the message. A write whose window can't be found counts as private.
- **DATA-31** A write from a private window is refused if it would store anything that comes from the private session. The user's own configuration carries nothing from the session, so it's allowed.
- **DATA-32** Allowed from a private window:
  - shared settings: switches, options, keys, labels, Watch later on every account, the theme, the default percentage (ACC-38; R58, R83);
  - removing a playlist shortcut, including its target in every setup;
  - settings sync on or off, the join choice, Detailed console log;
  - Pause and Resume;
  - consent, given or withdrawn;
  - Clear all data.
- **DATA-33** Refused from a private window:
  - any account-setup change: ticks, Takes, percentages, filters, targets, quick-save (including choose mode's first pick), creating, claiming or removing a setup;
  - labels, Missing and Full marks;
  - caches and newly created playlists;
  - watch progress;
  - the last account and the last visibility;
  - session memory (skips, recent adds, 429 pauses, shown-once memory, breakage signals, tab registry entries), which stays in the tab's or the background's memory instead.
- **DATA-34** A refusal is answered as "private", so the surface can explain it (ACC-40). Surfaces disable those controls first. A refusal is also logged to the console.
- **DATA-35** Documents arriving from the synced copy are accepted (SYNC-25).

### 4.8 Clear all data

- **DATA-36** Clear all data is in Settings › Privacy & data, always reachable, signed in or not, and always confirmed.
- **DATA-37** The confirmation: "Clear all data? {Product} forgets everything it keeps in this browser: features, shortcuts, account setups, channel filters, cached playlists and watch progress. It starts again as if just installed. Your playlists on YouTube aren't touched." with **Clear** and **Cancel**.
- **DATA-38** It has a checkbox, "Also delete synced settings from all your browsers", off by default.
  - It shows when sync is on, or when this browser has synced before. That's decided from local state, so the synced copy isn't read while sync is off.
  - Ticked, the button reads "Clear here and everywhere".
- **DATA-39**

| What | Unticked | Ticked |
|---|---|---|
| `storage.local` | Everything, consent and the sync switch included | Same |
| `storage.session` | Everything | Same |
| `storage.sync` | Untouched. Sync is switched off first, so nothing is pushed. | Every key is removed, and `s:meta` becomes `{reset: true, id, created}` |
| Other syncing browsers | Unaffected | Reset (DATA-40) |
| Registered page scripts | Unregistered; open tabs tear down | Same |
| Untouched | YouTube's playlists, site access, Firefox data-collection grants | Same |

- **DATA-40** **After a ticked clear,** every other syncing browser:
  - drops its shared settings, account setups and filters, and those setups' caches and progress;
  - shows "Your synced settings were deleted in another browser, so {Product} was reset here.";
  - keeps its consent, its sync switch and its unclaimed setup.
- **DATA-41** Afterwards, this browser shows first run again.

### 4.9 Removing a setup and smaller removals

- **DATA-42** **Discard** (ACC-33) deletes the unclaimed setup.
- **DATA-43** Removing an account setup (ACC-25) is separate from Clear all data and is refused from a private window.
- **DATA-44**

| Removed | Where |
|---|---|
| The setup: auto-add playlists, Takes, overrides, targets, quick-save playlists, marks, label | Here, and with sync on, in every syncing browser (as a tombstone) |
| All its channel filters, kept filters included | Same |
| Its playlist cache and newly created playlists | Here |
| Its watch progress | Here |
| Its session memory: skips, recent adds, 429 pause | Here |
| The last account, if it was this account | Here |

  Shared settings stay: the shortcuts keep their keys and labels, and only this account's targets go. Other setups and YouTube are untouched.
- **DATA-45** **Smaller removals:**
  - switching auto-add off deletes all watch progress and keeps its playlists, filters and percentages;
  - removing a playlist shortcut deletes its entry in the shared settings and its target in every setup; its 6 s Undo is held in memory;
  - unticking an auto-add playlist removes its entry; its filter is kept as a kept filter, which counts toward the sync budget;
  - switching any other feature off keeps its settings.

### 4.10 Schema versions and migrations

- **DATA-46** **Versions:**
  - `schema` in `storage.local` is this browser's layout version. 2.0 writes `1`. An absent marker means pre-2.0, or a fresh install before its first background start.
  - On a fresh install (no marker, and not a 1.x upgrade by DATA-49), the first background start writes `schema: 1` at once, before consent. A schema marker isn't user data, so this needs no consent (FT-30). (R21)
  - The marker never decides whether a start is a 1.x upgrade: DATA-49's check doesn't read it, because the first background start may already have written it (R64).
  - Every synced document carries its own version `v` (SYNC-22), and `s:meta.v` is the synced copy's layout version.
- **DATA-47** **The migration runs at the top of every background start,** before registration, sync or any message handling ([ARC-MOD-25](06-architecture.md#69-the-store-module-interface)), and never relies on `onInstalled` alone, which Firefox can skip.
  - Every step is idempotent. New keys are written before old ones are removed, and `schema` is written last, so a crash between steps re-runs cleanly. A start that finds the upgrade note pending while a 1.x key is still present finishes the 1.x migration's removals and writes `schema` ([REL-MIG-09](08-release.md#22-steps)).
  - 2.x steps each take `schema` from N to N+1, as pure functions of the stored data, in order.
  - `onInstalled` is used only to open first run on "install". An update opens no tab, and recognising a 1.x upgrader never uses it (DATA-49). (R21, R64, R76)
- **DATA-48** **A layout newer than this build knows** (a manual downgrade, or a rollback past a `schema` bump) leaves the build inert: it changes nothing and registers nothing, and the popup's banner says "This version of {Product} is older than your settings. Update it to continue." ([UI-POP-10](05-ui.md#banners); R65)
- **DATA-49** **Recognising a 1.x upgrader.** At every background start, if there's no consent and no upgrade-note record (`device.consent` and `device.upgradeNote` absent or `null`), and any 1.x key is present in `storage.local`, it's an upgrade: the migration below runs and sets the note pending, and the user gets the note path (FT-43). With neither record and no 1.x key, it's a fresh install: the first-run path (FT-40). This is [ARC-MOD-25](06-architecture.md#69-the-store-module-interface)'s check. (R64)
  - The 1.x keys are 1.4.5's nine: `playlists`, `addToPlaylistID`, `watchLaterShortcut`, `requiredWatchPercentage`, `toastEnabled`, `clientID`, `clientSecret`, `accessToken` and `refreshToken`.
  - The check never relies on `onInstalled`, which Firefox can skip (ticket 06), or on the `schema` marker (DATA-46).
  - So a 1.4.5 user with no 1.x key left counts as a fresh install. Their update opens no tab; the toolbar "!" and the popup's "Waiting for your OK" lead them to first run (FT-40; R76).
  - A start that finds the note pending while a 1.x key is still present is a migration that crashed part-way, not an upgrade or a fresh install: it finishes the removals and writes `schema` (DATA-47, [REL-MIG-09](08-release.md#22-steps)).
  - When the migration runs, it also converts and removes 1.5.0's developer keys (the table below). On their own, without a 1.x key, they don't make an upgrade; only developer profiles ever wrote them.
  - It never reads `storage.sync` (FT-21; R20). The steps and the note's conditions are [08's §2](08-release.md#2-the-145-migration) (REL-MIG-02 to REL-MIG-39). (R20, R21, R64, R76)

| Old key | How 1.x behaved | Becomes |
|---|---|---|
| `playlists` | IDs typed by hand | `unclaimed.autoAdd`: take `list=` out of URLs, trim, keep only IDs matching `^PL[A-Za-z0-9_-]{16,64}$`, de-duplicate. The count dropped goes to the note. Each will take Videos and use the default percentage. |
| `addToPlaylistID` | Free text, not trimmed | `unclaimed.shortcutPlaylist`, with the same clean-up |
| `watchLaterShortcut` | A key; `Control` never fired | Shortcut 1's key in shared settings, by [ticket 08](../issues/08-shortcuts.md)'s conversion; `null` if it can't be converted. If a shortcut playlist came over with no key at all, shortcut 1 is still created, with `key: null`, and the note says so ([REL-MIG-20](08-release.md#25-converting-the-1x-shortcut); R21) |
| `requiredWatchPercentage` | A string; absent or `""` meant 0 % | `settings.autoAdd.pct`: rounded and clamped to 0–100. Absent, empty or not a number counts as unset: it becomes **0**, and the upgrade note asks once whether to keep "as soon as a video starts playing" or use 50 %; the answer applies at Agree (R21). |
| `toastEnabled` | Absent meant off | Show feedback for auto-add and playlist shortcuts: `true` → on, anything else → off |
| `clientID`, `clientSecret`, `accessToken`, `refreshToken` | Data API credentials | Deleted locally; nothing is revoked over the network |
| `authMode`, `authServerURL`, `cachedPlaylists`, `preventDuplicates`, `queueButtonEnabled`, `cardContextMenu` (1.5.0 developer keys) | — | Deleted. New features start off. |
| `channelFilters`, `channelLabels` (1.5.0) | — | `unclaimed.filters`, labels embedded; claimed with the setup |
| `theme` in `storage.sync` (1.5.0) | — | Not read and not removed: the migration doesn't touch `storage.sync` while sync is off, and sync is always off here. The theme starts at System. Only developer profiles ever wrote this key (R20). |
| `channelCache` in `storage.session` (1.5.0) | — | Removed |
| IndexedDB `yt-playlist-tools` (1.5.0) | — | Deleted by the background |
| `localStorage` `cachedVideos`, `playlists`, `preventDuplicates` (unreleased builds) | — | Removed by the first extension page that opens, then `device.legacyCleared` is set |

- **DATA-50** **Switches after the 1.x migration:**
  - auto-add is on if any auto-add playlist was carried over;
  - playlist shortcuts are on if both a key and a playlist were carried over; the picker key is preset unless the carried key uses it, and `preset` is set so no Watch later preset is added later;
  - the undo key is Alt+U, as at any install, unless the carried key uses it (R44);
  - everything else is off, and sync is off;
  - consent stays `null` and the upgrade note is set to pending, so nothing runs until Agree (FT-43).
- **DATA-51** The upgrade note's `details` shape ([REL-MIG-33](08-release.md#29-what-the-note-is-built-from)), the note's copy ([§3.2](08-release.md#32-copy)) and the upgrade test matrix ([§17](08-release.md#17-upgrade-test-matrix)) are in 08 Upgrade and release. What 1.4.5 users had is [09's §1.12](09-parity.md#112-what-145-users-had) (PAR-CAP-71 to PAR-CAP-79).

## 5. Breakage status

### 5.1 What counts as breakage

- **HEALTH-01** A **breakage signal** is raised when something YouTube or YouTube Music relies on is missing or answers in a way the extension doesn't recognise. [07's Q-WATCH-24](07-quality.md#757-runtime-breakage-signals) owns this table and the signals' kebab-case identifiers; it's repeated here, every identifier included, for the user-facing side (R51):

| What happened | What the job does | Signal |
|---|---|---|
| A hook is missing, or throws before sending | Tries the next shipped route | `missing` or `threw` |
| No answer within the budget | Reads try the next route; a write that may have been sent is reported failed or unconfirmed, never retried | `timeout`; it makes a job not working only after 3 in a row on that job while the tab is online and other requests are answered |
| HTTP 400 or 404 to our request, or 401/403 while the page is signed in | Fails | `rejected` |
| An answer with no recognised shape or status | Fails | `unrecognised`, with the answer's shape outline |
| A recognised answer whose effect never shows (the YouTube Music queue doesn't grow; a moved item isn't where it should be) | Fails | `no-effect`, after 2 in a row |
| A page anchor missing where the page clearly has that content | The control isn't drawn | `anchor-missing` |
| A key points at something that looks like a video or song, but no item is recognised | Nothing is done, and the failure "Couldn't tell which item you meant. Point at it again, or use the player." shows (R4). It never falls back to the current video or playing song | `item-unrecognised` |
| Theme variables missing | In-page UI uses a built-in palette | `cosmetic`, diagnostics only |
| Auto-add can't measure a playback (the lengths disagree, e.g. stitched ads) | That playback isn't counted | `cannot-measure` |
| A route fell back and the job succeeded | Succeeds | `fell-back`, diagnostics only |
| Several properties match the command resolver's shape | The first whose `resolveCommand` is a function is used, and the job goes ahead ([ARC-ACC-13](06-architecture.md#623-the-command-resolver-found-by-shape); R34, R66) | `resolver-ambiguous`, diagnostics only |
| YouTube or YouTube Music shows its own toast after one of our quiet queue edits (an add, a removal or their Undo) | The edit stands, and our own toast for it is suppressed; the feature that made the edit is partly working (HEALTH-07; R40) | `quiet-route-noisy`, on both sites |
| Signed out, account changed, 429, 5xx, offline, or a recognised `STATUS_FAILED` | As in 02 ([YT-GEN-08](02-youtube.md#21-rules-shared-by-every-youtube-feature), [YT-ADD-10](02-youtube.md#251-order-and-membership), [YT-ADD-35 to YT-ADD-37](02-youtube.md#255-failures)) and 03 ([YM-ACC-5, YM-ACC-6](03-youtube-music.md#2-accounts-and-private-windows), [YM-FAIL-1](03-youtube-music.md#14-failures-and-breakage)) | None: not breakage |

  (R4, R34, R40, R51, R66)

- **HEALTH-02** **Anchors** are checked once the page settles, 3 s after navigation (a starting value). A feature signals `anchor-missing` only when the page shows that kind of content and none of it, or too little, was recognised: at least 6 distinct video links in the main content (not the player, description or comments), with fewer than half of them recognised as cards. On YouTube Music the same numbers apply to its item links. A YouTube Music player-bar anchor missing in a narrow window, signed out, or in a new-player bar without its action bar isn't breakage ([Q-WATCH-25](07-quality.md#757-runtime-breakage-signals), [YM-BAR-3](03-youtube-music.md#16-the-player-bar-and-the-wiz-miniplayer)).
- **HEALTH-03** **A signal carries no user data.** It holds the site, feature, job, route, kind and watch-list ID; a shape outline; YouTube's client version; the page type; and a count with the first and last time seen. It never holds a video, playlist, channel or account ID, a title, a URL or a setting.
- **HEALTH-04** A shape outline records keys and value types to depth 6, merges array items, keeps no values, writes keys that don't look like schema names as `<key>`, and is capped at 2 KB.
- **HEALTH-05** Signals live in `storage.session` and never leave the browser. Signals from private tabs stay in memory.
- **HEALTH-06** Starting values (3 timeouts, 2 no-effects, 3 can't-measure, 3 s settle, 6 links, one half; [Q-WATCH-29](07-quality.md#757-runtime-breakage-signals)) are tuned after ticket 25 and the first weeks of use.
- **HEALTH-28** **Checking costs little.**
  - The anchor check (HEALTH-02) runs only in a visible tab. In a hidden tab it waits until the tab is shown, then runs once.
  - A tab sends signals at most every 5 s, and only new ones, or a success for a job that has a signal in that tab ([ARC-MSG-14](06-architecture.md#684-rules-for-every-channel)).
  - The monitor counts them in memory and writes `storage.session` at most every 10 s. It keeps at most 200 distinct signals, dropping the oldest first. (R111)

### 5.2 Status

- **HEALTH-07** Status is per feature: each feature has one status per site and per tab, **working**, **partly working** or **not working**, derived from what the feature declares it needs (required jobs, optional jobs, page anchors). (R50)
  - **Not working:** a required job has no route left, or a required anchor is missing.
  - **Partly working:** only an optional job is out, or, on YouTube Music, some of the feature's actions are unavailable while others still work. The status detail names what's out, those actions included. An unavailable action's buttons hide in that tab ([YM-FAIL-4](03-youtube-music.md#14-failures-and-breakage); ticket 26), but its key stays caught, and each press answers "{Action} isn't working right now. The popup shows why." ([YM-KEY-12](03-youtube-music.md#12-keys-quick-action-shortcuts)), so a key never does nothing silently (ticket 18; R68).
  - Partly-working examples: the picker's check marks, queue confirmation, YouTube's or YouTube Music's own toast showing after a quiet queue edit (`quiet-route-noisy`, R40), account labels, playlist thumbnails, the player-bar Save anchor, auto-add failing to measure some videos, shortcuts that can't recognise pointed-at cards but still work on the current video, and Quick actions with Play next unavailable.
  - Card recognition is required for quick-save, the queue button and the card menu, and optional for playlist shortcuts. (R40, R50, R68)
- **HEALTH-08** **The whole site:** if the site core can't start (`ytcfg`, `ytd-app` or `ytmusic-app` is missing), every feature on that site is not working.
- **HEALTH-09** **Account keys missing** (`DATASYNC_ID` or `LOGGED_IN`): auto-add, playlist shortcuts, quick-save, and YouTube Music's Save and Like stop. Add to queue, the card menu and YouTube Music's queue actions carry on.
- **HEALTH-10** **A not-working feature draws nothing:** its buttons aren't drawn. Its keys stay caught on either site, and every press gets the failure toast. A YouTube Music action that's unavailable while its feature is partly working hides its buttons too, and its key stays caught with R68's answer, "{Action} isn't working right now. The popup shows why." (HEALTH-07; R50, R68).
- **HEALTH-11** **Auto-add's "can't measure":**
  - the first such playback in a browser session shows a failure toast, even with Show feedback off: "Auto-add can't follow this video's progress, so “{title}” won't be added." ([YT-AA-41](02-youtube.md#2310-auto-adds-feedback); R45). Later ones are logged to the console only;
  - some playbacks can't be measured: auto-add is partly working;
  - 3 in a row with none measured in between: auto-add is not working. It's working again after the next playback that can be measured.
- **HEALTH-12** **Clearing:** a tab's status clears when the job next succeeds, or on reload when the probe passes. There's no manual reset.

### 5.3 Where it shows

- **HEALTH-13** **In-page notice** ([YT-BRK-02](02-youtube.md#213-when-youtube-changes-something), [UI-TOAST-15](05-ui.md#the-not-working-notice)):
  - once per browser session per feature and site, at the moment the feature would act (when its buttons would be drawn, when the watch-page button would be placed, when auto-add would arm, at a right-click, or when a key is pressed);
  - in the first visible tab where the problem is found; features found within 60 ms share one notice, which names each by its full name from FT-01 (R75);
  - it uses the site's toast with the failure styling, and stays until dismissed. With only the card menu on, it's the site core's tiny kit-free notice instead, with the same copy and actions, so the card menu alone still loads no kit ([UI-TOAST-16](05-ui.md#the-not-working-notice); R28);
  - like any unprompted toast, it waits while the tab is hidden or fullscreen;
  - its action, **Details**, opens Settings at Diagnostics. (R28, R75)
- **HEALTH-14** **Explicit actions:** every click or key press on something not working gets that action's failure toast.
- **HEALTH-15** **Toolbar badge:** while any feature is not working in a tab, that tab shows an amber "!", titled "{Feature} isn't working in this tab". Consent or upgrade pending and missing site access take priority over it, and it takes priority over Missing or Full (FT-57, FT-58). Partly working sets no badge, so neither does a YouTube Music action that's unavailable on its own (R50). (R12)
- **HEALTH-16** **Popup:** while a feature is not working or partly working, a strip under the header with **Details** ([UI-POP-09](05-ui.md#breakage-strip)). Over a YouTube or YouTube Music tab it covers that tab; over any other tab, every open tab of the site.
- **HEALTH-17** **Settings:** a status line under each affected feature's switch, always ([UI-SET-07](05-ui.md#feature-cards), which calls it the health line), and the Diagnostics section.
- **HEALTH-18** Show feedback hides none of this. A user who doesn't want the notice switches the feature off.
- **HEALTH-19** No banner across YouTube's page, no notice for a fallback that worked, and no "works again" toast: the status line simply clears.

### 5.4 Wording

- **HEALTH-20** Each message is two sentences, uses YouTube's capitalisation, and says "YouTube Music" on that site.

| Situation | Notice or status |
|---|---|
| Auto-add | Auto-add isn't working right now because YouTube changed something. Videos you watch aren't being added for now. |
| Playlist shortcuts, quick-save | {Feature} isn't working right now because YouTube changed something. Use YouTube's own Save for now. |
| Queue button | The Add to queue button isn't working right now because YouTube changed something. Use YouTube's ⋮ menu for now. |
| Watch-page button | The watch-page button isn't working right now because YouTube changed something. This video's status is still in the toolbar popup. |
| Several YouTube features in one notice, by their full names (R75) | Quick-save on thumbnails and Queue button on thumbnails aren't working right now because YouTube changed something. Use YouTube's own buttons for now. |
| Right-click menu | The right-click menu isn't working right now because YouTube changed something. You'll get the browser's menu for now. |
| A YouTube Music action unavailable (its feature partly working, R50) | Play next isn't working right now because YouTube Music changed something. Use its ⋮ menu for now. Several: "Play next and Add to queue aren't working…" |
| A key while its feature isn't working | Play next (Alt+N) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now. |
| A key for a YouTube Music action unavailable in this tab (its feature partly working, R68) | {Action} isn't working right now. The popup shows why. |
| A key pointing at an unrecognised item | Couldn't tell which item you meant. Point at it again, or use the player. The same action-neutral wording on both sites (R4). |
| Account keys missing | Saving isn't working right now because YouTube changed how it shows which account you're using. Nothing is saved, so nothing lands in the wrong account. |
| The whole site | {Product} isn't working on YouTube right now because YouTube changed something. An update should fix it. |
| Popup strip | {Feature} isn't working in this tab because YouTube changed something. / {N} features aren't working in this tab. / {Feature} is partly working in this tab. |
| Settings, not working | Not working right now: YouTube changed something it relies on. |
| Settings, partly working | Partly working: {gap}. For example "it can't show where a video is already saved", "it can't confirm queue adds", "it can't follow some videos' progress". On YouTube Music, {gap} names the unavailable actions (R50). |

  The copy matches [YT-BRK-06](02-youtube.md#213-when-youtube-changes-something), 03's [§14](03-youtube-music.md#14-failures-and-breakage) and [UI-TOAST-15](05-ui.md#the-not-working-notice), which own it on their sites. (R4, R50, R68, R75)

### 5.5 Diagnostics, Check now and the report

- **HEALTH-21** **Nothing is ever sent:** no error reporting, analytics or crash upload, opt-in or not. Fixes reach users only as releases; there's no remote config or kill switch ([ADR-0005](../../../docs/adr/0005-breakage-caught-on-device-fixed-by-releases.md)).
- **HEALTH-22** **Settings › Diagnostics** loads only when shown. It holds:
  - each feature's status per site;
  - **Check now**;
  - the diagnostics report, shown in full, with **Copy**;
  - **Known problems**, which opens the public issues labelled `youtube-change`, and **Report a problem**, which opens the GitHub Problem form. Both are plain links and attach nothing;
  - **Detailed console log**, off by default, this browser only;
  - the version, with "(beta)" on beta builds ([REL-CI-15](08-release.md#71-firefox)), and a note that updates install by themselves. There's no update button. (R65)
- **HEALTH-23** **Check now** runs only when clicked. It runs the runtime probes plus one read per read job in a serving tab, writes nothing, and works even if no feature has run this session. Its result is kept for the session and feeds the report.
  - **With no YouTube tab open,** it's disabled, with "Open YouTube to check" and **Open YouTube** ([UI-SET-17](05-ui.md#sections)).
  - **Before consent** it can't run, because nothing is read from YouTube (FT-30). (R15)
- **HEALTH-24** **The diagnostics report** is plain text. It contains:
  - the extension's version and build;
  - the browser, its major version and the OS family;
  - the YouTube and YouTube Music client versions and UI language seen;
  - which features are on, and site access per site;
  - settings sync on or off, the sync status, and the `schema` version;
  - whether the tab is signed in;
  - each feature's status per site;
  - the session's breakage signals, with their shape outlines;
  - the last Check now result.
- **HEALTH-25** The report never contains account IDs, names or handles; video, playlist or channel IDs or titles; URLs; setting values (keys, filters, setups); cookies; or the country. It leaves the browser only if the user copies it.
- **HEALTH-26** **The console log:**
  - every add logs each playlist's outcome;
  - every fallback and every breakage signal logs one `console.warn` line naming the route, the reason and the watch-list ID;
  - the prefix is the extension's name;
  - the page world never logs; the isolated world and the background do ([ARC-MSG-10](06-architecture.md#684-rules-for-every-channel), [Q-WATCH-34](07-quality.md#758-what-a-signal-holds));
  - Detailed console log adds a line for every route attempt, with timings.

How breakage is caught before release is in [07 Quality](07-quality.md#751-the-checks-at-a-glance): recorded answers ([§7.2.3](07-quality.md#723-layer-2-recorded-responses), Q-TEST-4 to Q-TEST-8), the daily watch ([§7.5.3](07-quality.md#753-the-static-watch), Q-WATCH-9 to Q-WATCH-11, and [§7.5.4](07-quality.md#754-the-browser-watch), Q-WATCH-12 to Q-WATCH-14) and the signed-in live check ([§7.5.6](07-quality.md#756-the-signed-in-live-check-and-the-live-check-build), Q-WATCH-18 to Q-WATCH-22).

## 6. PROVISIONAL items

| Requirement | What | Settled by |
|---|---|---|
| Placeholders, FT-36, HEALTH-20 | The name `{Product}` ("Playlist Pigeon") | [Ticket 22](../issues/22-name.md) |
| ACC-03, ACC-35, §2.9 | `DATASYNC_ID` stability across sign-out and browsers; collaborative playlists in claiming | [Ticket 25](../issues/25-live-checks.md) L7 and ticket 11's claiming check |
| FT-39 | The disclosure's cookie line, removed if no shipped route reads the session cookie (R48) | [Ticket 25](../issues/25-live-checks.md) L3/L4 and its final route table |
| FT-53 | `addHostAccessRequest` on Chrome 133+ | [Ticket 09](../issues/09-where-things-live.md), at build |
| FT-01, DATA-12, FT-57 | Auto-add's toolbar tick: whether it exists. It's off until the user answers (R11) | The user: D10 ([for-the-user.md](../for-the-user.md); [ticket 09](../issues/09-where-things-live.md)'s new question; [ticket 15](../issues/15-popup-and-settings.md)) |
| HEALTH-22 | A support e-mail beside GitHub issues | The user ([ticket 19](../issues/19-upgrade-and-rollout.md) §16) |
| HEALTH-06 | Breakage thresholds | Ticket 25 and the first weeks of use |
| ACC-22 | YouTube Music's answers carry `datasyncId` for the account guard | [Ticket 25](../issues/25-live-checks.md) M2 |

## 7. Precedence applied

Later decisions overrode earlier text in these places; nothing here is open.
- **Caches** are outside the account setup, per browser, and never sync ([ticket 16](../issues/16-storage-and-sync.md) §3 over [ticket 11](../issues/11-accounts.md)'s table). There's no membership cache.
- **The account digest** is computed in the tab, not the background ([ticket 17](../issues/17-modules.md) D10 over ticket 16 §3).
- **The queue button's Show feedback** defaults to on ([ticket 15](../issues/15-popup-and-settings.md), confirming [ticket 14](../issues/14-in-page-controls.md), over [ticket 12](../issues/12-adding.md)'s off), because it now carries Undo.
- **The required percentage:** a shared default with a per-playlist override in the setup ([ticket 07](../issues/07-watched.md)), replacing ticket 11's "watch threshold, shared".
- **Labels** are checked at most once per 24 h per browser and written only on change (ticket 16), refining ticket 11's "whenever the account is seen".
- **Nothing is read before consent:** the popup shows no account before consent ([tickets 15](../issues/15-popup-and-settings.md) and [19](../issues/19-upgrade-and-rollout.md) over [ticket 09](../issues/09-where-things-live.md)'s prototype).
- **Keys of a not-working feature** stay caught and answer with a failure toast ([ticket 18](../issues/18-breakage.md) over [ticket 26](../issues/26-youtube-music-quick-actions.md)'s "no armed key"). R50 brought ticket 26's rule back for one case, a YouTube Music action that's unavailable while its feature is partly working, and R68 narrows it again: that action's buttons hide in that tab, but its key stays caught and answers "{Action} isn't working right now. The popup shows why.", so no key ever does nothing silently (HEALTH-07, HEALTH-10).
- **Registrations** are two per site, an ordered list ([ticket 17](../issues/17-modules.md) over [ticket 10](../issues/10-youtube-access.md)'s per-feature IDs). The behaviour, "a feature's file loads only while it's on", is unchanged.
- **The support channel** is GitHub issues with a Problem form ([ticket 19](../issues/19-upgrade-and-rollout.md) §16 over ticket 18's PROVISIONAL links).
- **The last account** is the last account *with a setup* that was current in a normal window (ticket 16 §3, refining ticket 11).

## 8. Gaps

These couldn't be pinned down from the tickets or the resolutions, and stay open:
- **Re-attaching setups** if `DATASYNC_ID` differs between browsers (ACC-03) is an open question for after ticket 25.
- **Copy for the sync statuses.** SYNC-24 names `joining`, `waiting` and `ok`, but no ticket or chapter writes their status lines, the join dialog's title and text, the first-run sync card's "nothing found" state, or where SYNC-08 step 5's question appears when no settings page is open. [05](05-ui.md#sections) (UI-SET-12, UI-SET-13) has the same gap.
- **Check now before consent.** It can't run (FT-30, HEALTH-23), but what Diagnostics shows instead isn't written.
- **"Before this feature can run" on Chrome with a YouTube Music feature,** when the access prompt is denied: R14 covers only first run's Agree, and FT-52 keeps the switch off, but whether that Agree still sets consent isn't decided. For Playlist shortcuts the outcome follows R71 (FT-52): it goes on, on YouTube only, so its Agree does set consent.

## Resolved during assembly

Settled by the main session in [resolutions.md](resolutions.md):
- **What the YouTube Music section switch holds** (was Conflict C1): everything on music.youtube.com, "Also on YouTube Music" included; `musicSection`, a synced shared setting, on by default (FT-06, DATA-12). R1.
- **Settings sync before consent at first run** (was Conflict C2): the synced copy may be read before Agree; nothing is pushed and the switch isn't stored until Agree (FT-31, FT-41, SYNC-08). R9.
- **The privacy policy's session-memory line** (was Conflict C3): corrected to say session skips and recent adds may name videos and playlists, but stay in memory and are never synced or sent; the storage choice stays (DATA-03, [REL-STORE-17](08-release.md#102-text)). R10.
- **Option defaults** (was a gap): "On Shorts shelves too" off, "On Shorts too" off, "Links inside cards keep the browser's menu" off, theme System, toolbar tick off until D10 (FT-01, FT-05, DATA-12). R11.
- **Badge precedence** (was a gap): consent or upgrade > site access > not working > Missing or Full, with per-tab and every-tab scopes and two colours (FT-57, FT-58, HEALTH-15). R12.
- **The `waiting` sync status** (was a gap): the join question is unanswered (SYNC-08, SYNC-24). R13.
- **The `update-needed` refusal** (was a gap): only edits to synced documents a newer version wrote are refused (SYNC-23, FT-12). R13.
- **First-run Agree on Chrome with YouTube Music access denied** (was a gap): consent and the other ticks apply, and the YouTube Music features are saved on but held with "Needs site access" (FT-40, FT-52). R14.
- **Check now with no serving tab** (was a gap): disabled, with "Open YouTube to check" and **Open YouTube** (HEALTH-23, FT-54). R15.

Settled in the second round:
- **Auto-add and the sign-in toast** (was Conflict C4): auto-add stays silent when signed out; R3's toast is for explicit actions only, and Like keeps "Sign in to YouTube Music to like songs." (ACC-21, FT-25). R41.
- **The watch-page button's Show feedback** (was Conflict C5): it has one, on by default, and its menu's Save rows use it (FT-01, FT-23, DATA-12). R42.
- **Who asks Chrome for music.youtube.com access, and the badge** (was Conflict C6): the click that switches on the first thing that needs it, a YouTube Music feature or "Also on YouTube Music" while Playlist shortcuts is on; never the section switch. Missing YouTube Music access raises the "!" only while something needs it, and the site-access "!" is on every tab (FT-40, FT-44, FT-46, FT-47, FT-52, FT-57, FT-58). R53.
- **The account in view's fallback** (was Conflict C7): ACC-13's, the last account *with a setup* (ACC-13). R54.
- **Where the sync switch lives** (was Conflict C8): `Device.syncOn`, not the registry's `Settings` (FT-01, SYNC-01, DATA-12). R54.
- **Footprint tags** (was Conflict C9): four, Settings sync's included (FT-01). R54.
- **The undo key's preset and home** (was Conflict C10): preset to Alt+U at install, belonging to no feature, in Settings › Everywhere; "Nothing to undo." while a shortcut feature is on (FT-01, FT-04, FT-05, DATA-08, DATA-12, DATA-50). R44.
- **How often the account-change toast shows** (was Conflict C11): on every explicit press, and once per tab for auto-add (ACC-22). R55.
- **The kind of the "has no playlist" toast** (was Conflict C12): a neutral hint, always shown, with **Choose** (FT-25, ACC-09). R56.
- **How long Pause lasts** (was Conflict C13): until the user resumes it or the browser restarts; an extension update also clears it; the copy says "until you resume it or restart the browser" (DATA-03, DATA-11). R57.
- **Private-window settings writes** (was Conflict C14): shared-settings changes are saved, and the pins' tooltip says so (ACC-38). R58. They were PROVISIONAL on ticket 23 Q3 until R83 settled it (below).
- **`storage.sync` while sync is off** (was Conflict C15): exactly FT-21's two calls are allowed, and 07's test allows them (FT-21). R59.
- **Placeholders, the version in Diagnostics, and a banner for an older build** (were three items of Conflict C16): `{Product}` and `{Account}` everywhere; Diagnostics shows the version with "(beta)"; the popup has a banner row for DATA-48 (placeholders, HEALTH-22, DATA-48). R65.
- **"Needs site access"** (was an item of Conflict C16): [YM-PS-2](03-youtube-music.md#18-playlist-shortcuts-on-youtube-music) now uses FT-13's "Needs site access" with **Give access**. No R-number: 03 followed this chapter.
- **`onInstalled` and the reconcile** (was an item of Conflict C16): [ARC-MAN-12](06-architecture.md#633-runtime-script-registration) no longer reconciles on install and update, because its start-up run covers both (DATA-47). R64.
- **Points other chapters raised:** which titles take quotes is the site chapters' rule, not this chapter's (03; placeholders); the private-window banner no longer says nothing is saved (05; ACC-40, R58); and FT-42's link points at the whole first-run page (05). No R-numbers.
- **How a 1.x upgrader is recognised** (replaces R21's `onInstalled` trigger): by a 1.x key in `storage.local` with no consent and no note record, at every background start, never by `onInstalled` or the `schema` marker (FT-40, FT-43, DATA-46, DATA-47, DATA-49). R64.

Settled in the third round:
- **`{Feature}` in batched notices** (was Conflict C16): batched notices use FT-01's full names, "Quick-save on thumbnails and Queue button on thumbnails aren't working…" (HEALTH-13, HEALTH-20). R75. [YT-BRK-02](02-youtube.md#213-when-youtube-changes-something) and [05's not-working notice](05-ui.md#the-not-working-notice) take the same example this pass.
- **The private-window banner's copy** (was Conflict C17): [UI-POP-10](05-ui.md#banners) row 6 takes ACC-40's "{Account} has no setup yet. A private window can't save one, so set it up in a normal window." (ACC-40). R74.
- **Denying YouTube Music access from Playlist shortcuts' own switch** (was a gap): Playlist shortcuts goes on, "Also on YouTube Music" turns off, and "No access to YouTube Music, so shortcuts work on YouTube only." shows in place (FT-12, FT-44, FT-47, FT-52). R71.
- **Remove's confirmation** (was a gap): ACC-25's confirmation now names the quick-save playlists as well, and says the marks, label, cache, progress and session memory go with the setup, as DATA-44 deletes them (ACC-25). No R-number: fixed in 04.
- **The pins' private-window tooltip** (R58's sentence said what's saved, not why the pin is off): "Quick-save playlists can't be changed in a private window." (ACC-38). R69.
- **Which titles take quotes** (03's Conflict 5 on the placeholder note): video and song titles do; playlist names don't, except in R24's "{Shortcut} now saves to “{Playlist}”." (placeholders). R77.
- **What a tab's view holds** (ACC-12 and DATA-02 said "only" the shared settings and the account's setup): the view also carries device-wide fields, such as this browser's Sort A–Z, Pause and the tab's statuses, as [ARC-MSG-05](06-architecture.md#682-tab--background) lists (ACC-12, DATA-02). No R-number: fixed in 04.
- **A 1.4.5 user with no 1.x key left** (confirms 08's reading of R64): a fresh install; no tab opens on update, and the toolbar "!" and "Waiting for your OK" lead to first run. The fresh-install wording now matches [ARC-MOD-25](06-architecture.md#69-the-store-module-interface): no consent record, no note record and no 1.x key (FT-40, DATA-47, DATA-49). R76.

Also applied here: R2 (the undo key: FT-05), R3 (signed out: ACC-21, FT-25), R4 (unrecognised items: HEALTH-01, HEALTH-20), R7 (no pending toast with feedback off: FT-24), R8 (Playing now: FT-06, FT-16, FT-55), R20 (`storage.sync` untouched while sync is off: FT-21, DATA-49), R21 (`schema: 1` at first start, the unset percentage, a playlist with no key: DATA-07, DATA-46, DATA-47, DATA-49), R22 (DATA-11), R23 (DATA-25), R24 (ACC-09, FT-25), R25 (ACC-09, ACC-21), R26 (FT-25), R27 (FT-01), R28 (FT-17, HEALTH-13), R32 (FT-56, DATA-12), R33 (FT-55), R34 (HEALTH-01), R37 (FT-05), R39 (Refresh and Sort A–Z: DATA-04, DATA-05, DATA-12, DATA-20, DATA-21, FT-54) and R40 (`quiet-route-noisy`: HEALTH-01, HEALTH-07). From the second round: R43 (remembered progress: DATA-07, DATA-25), R45 (the Choose pick saves, with Undo; typographic quotes: ACC-09, HEALTH-11, placeholders), R48 (the cookie lines: FT-39, §6), R50 (status per feature: HEALTH-07, HEALTH-10, HEALTH-15, HEALTH-20, §7), R51 (signal identifiers: HEALTH-01), R60 (the note's copy and conditions are 08's: FT-43) and R66 (an ambiguous resolver: HEALTH-01).

Also applied, third round: R68 (an unavailable YouTube Music action's key stays caught and answers: HEALTH-07, HEALTH-10, HEALTH-20, §7), R69 (the pins' private-window tooltip: ACC-38), R71 (a denied prompt from Playlist shortcuts' own switch: FT-12, FT-44, FT-47, FT-52, §8), R74 (ACC-40's copy in 05: §9's C17), R75 (full names in batched notices: HEALTH-13, HEALTH-20), R76 (a 1.4.5 user with no 1.x key: FT-40, DATA-47, DATA-49) and R77 (which titles take quotes: placeholders). R70, R72 and R73 don't touch this chapter's topics.

After the spec ([R83](resolutions.md#after-the-spec-firefox-prompts-and-data-collection-r83)):
- **Firefox's data-collection declaration for settings sync** (was PROVISIONAL on ticket 23 Q2): sync declares no data type, because the browser's own sync is invisible to the developer. The optional-type flow stays only as the fallback if an AMO reviewer objects (SYNC-26, §6). R83.
- **Private-window settings writes** (were PROVISIONAL on ticket 23 Q3): allowed, as R58 decided, now no longer provisional. A settings change the user makes isn't browsing data, and nothing about the window's browsing is stored (ACC-38, DATA-32, §6). R83.

## 9. Conflicts found

None remain after all three rounds of resolutions; see [Resolved during assembly](#resolved-during-assembly). C1 to C17 are all settled there. What's still open in this chapter is a PROVISIONAL item waiting on a check or a decision ([§6](#6-provisional-items)) or a gap no ticket or resolution wrote ([§8](#8-gaps)).
