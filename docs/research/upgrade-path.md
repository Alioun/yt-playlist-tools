# What happens when a 1.4.5 user updates to 2.0

Research for ticket 06 (`.scratch/rebuild/issues/06-upgrade-path.md`), done 2026-10-19.

**How the sources are cited**
- **Firefox source:** `FF/` means `https://github.com/mozilla-firefox/firefox/blob/d0d4af3c69ea85c292cbbdf68ae00126d5bae45b/`, Mozilla's official Firefox repository (Firefox 160.0a1, 2026-10-18). Line numbers were also checked against `main` on 2026-10-19.
- **1.4.5 code:** cited as `e96dbf7:<path>:<lines>` (`git show e96dbf7:<path>`).
- **Unverified claims** are marked **unverified**.
- **My own reasoning from a source**, rather than something the source says outright, is marked *(inference)*.

## Answer

### What a 1.4.5 user will experience

The ~66 users are all on Firefox. On Chrome, 2.0 is a fresh install.

1. **The update installs silently, unless 2.0 adds something that has a warning.**
   - **When it arrives.** Firefox checks AMO once a day. Within about a day of 2.0 going public, it installs 2.0 in the background with no prompt.
   - **What can't hold it:** dropping `identity`, `activeTab` and `scripting`; adding no-warning permissions (`storage`, `cookies`); adding host permissions; adding `data_collection_permissions: { required: ["none"] }`.
   - **What does hold it:** an API permission that has a warning string, or a *required* data-collection type other than `none`. The update then waits behind an app-menu badge ("requires new permissions") until the user accepts it in about:addons.
   - **Cancel** keeps 1.4.5, and the prompt comes back at the next daily check.
   - **No skipping the consent.** AMO rejects `has_previous_consent`, the manifest flag that would otherwise skip the data-collection prompt.
2. **New host permissions are not granted by the update.**
   - In MV3, Firefox grants host permissions only on a fresh install. An update that adds origins neither prompts nor grants them; they stay ungranted until the user grants them.
   - **What survives:** grants already made persist. That covers `*://*.youtube.com/*`, which 1.4.5's content script asked for. Nearly every 1.4.5 user should have it: anyone who installed an MV2 version (1.2–1.4.3) or installed on Firefox 127+, unless they revoked it.
   - **The consequence:** if 2.0 needs anything beyond `*.youtube.com`, every upgrading user lands in a 2.0 that can't work until they click to grant it.
3. **After the update:** their auto-add playlists, shortcut playlist and key, watch percentage and toasts setting are carried over. The client ID, secret and tokens are deleted, and a one-time note explains why. This is 2.0's job; nothing in Firefox does it.
4. **Users on a Firefox older than the new `strict_min_version` stay on 1.4.5.**
   - AMO's update service only offers versions compatible with their Firefox. The listing shows them "Download the new Firefox" instead of an install button.
   - In practice that's nobody at 128 and very few at 140. Since the root-certificate expiry of March 2025, Firefox older than 128 can't use add-ons at all. ESR 128 ended in September 2025, and ESR 140 on 2026-09-29. The current ESR is 153.

### What 2.0 must do on update

1. **Run the migration from stored state on every background start,** not only from `runtime.onInstalled`. Firefox fires no `onInstalled` "update" when the update lands while the extension is disabled, or when it's applied at browser startup. Write a schema marker last and keep every step idempotent (§2.2).
2. **Map 1.4.5's values as they really are** (§2.1):
   - `requiredWatchPercentage` is a string.
   - An absent `toastEnabled` meant **off**.
   - An absent percentage meant **0 %**, although the popup showed 50.
   - Ctrl shortcuts never fired in 1.4.5.
   - Playlist fields may hold URLs or half-typed IDs.
   - Delete `clientID`, `clientSecret`, `accessToken` and `refreshToken`.
3. **Check host access** with `permissions.contains` on every start and on `permissions.onRemoved`.
   - **When something is missing:** badge the toolbar button and show a "Give access to YouTube" button.
   - **The button handler** calls `permissions.request` *first and synchronously*, best from an extension tab.
   - **Chrome too:** users there can also withhold site access (§1.4, §4.5).
4. **Show the one-time note from a stored flag** that the migration sets: in the popup until dismissed, plus a badge. Optionally also open a tab on `onInstalled` `"update"` from a `1.x` version, as Mozilla's upboarding guide does (§2.3).
5. **Keep the update silent:**
   - no new API permissions with warnings;
   - origins only under `*://*.youtube.com/*`, if ticket 02 allows;
   - `data_collection_permissions` either `none` or optional-only. Ticket 03 recommends `none`, pending AMO's answer.
   - Otherwise, accept a held update and design the note around the grant or consent step.
   - Ticket 03 also asks for a first-run disclosure with an explicit OK before handling any data. For upgrading users, the one-time note is the natural place for it. Until they accept, their carried-over auto-add can't run (§2.3).
6. **Keep the gecko ID and a version above 1.4.5.** Don't add a `runtime.onUpdateAvailable` listener: it postpones future updates to the next browser start, which suppresses `onInstalled` (§2.2).

### AMO submission checklist (2.0 as an update to the existing listing)

- **Version:** upload as a new version of `youtube-playlist-tools`, with the same gecko ID `{cc70cd21-2cc6-444b-bd89-496909346091}` and a version above 1.4.5.
- **`strict_min_version`:**
  - At least 128, for MAIN-world content scripts (ticket 02).
  - 140 is Mozilla's advice for `data_collection_permissions`. Lower values only cause linter warnings.
  - 153 matches the only live ESR.
- **`data_collection_permissions`:** declare it, and get it right. Ticket 03 decides `none` versus categories. It isn't yet *required* for updates to existing add-ons, but once added it must stay in every later version.
- **Sources zip** (`wxt zip -b firefox` already makes one):
  - `README.md` or `SOURCE_CODE_REVIEW.md` covering the OS, how to install Bun 1.4.0, `bun install --frozen-lockfile`, `bun run build:firefox`, and the output path;
  - `bun.lock` included; `server/` excluded or deleted; no secrets;
  - under 200 MB;
  - the rebuild must be byte-identical (CI already checks this on x86-64; the reviewer uses ARM64 Ubuntu 24.04).
  - Optionally, an npm `build-for-amo` script for AMO's new automatic rebuild.
- **Notes for Reviewers:**
  - a test Google/YouTube account;
  - what the YouTube requests are and why the MAIN-world bridge exists;
  - a reason for each permission;
  - the build notes.
- **Listing:**
  - release notes;
  - a description saying what the add-on sends where;
  - new screenshots;
  - a privacy policy URL if any data counts as transmitted.
- **Tooling:** CI should pass reviewer and release notes through `FIREFOX_AMO_METADATA_FILE` (supported by `wxt submit` / publish-browser-extension ≥ 6.1.0). Dry-run first.
- **What to expect:** auto-signed and public within about 24 h. A human review can follow at any time, and a ground-up rewrite will likely draw one *(inference)*. If 2.0 is rejected, 1.4.5 stays the public version.

### Chrome Web Store first-submission checklist

- **Account:**
  - a dedicated Google account (the email can never be changed), with 2-Step Verification;
  - register and pay the one-time fee (amount not stated by Google; commonly US$5, **unverified**);
  - a publisher name and verified contact email;
  - the trader or non-trader declaration. A trader's name, address and phone are shown publicly.
- **Name:** must not start with a Google trademark. "… for YouTube™" plus an attribution line is the documented form. Ticket 22 picks the name.
- **Listing:**
  - description, category and language;
  - a 128×128 icon (96×96 artwork);
  - 1–5 screenshots at 1280×800;
  - the 440×280 small promo tile;
  - a manifest `description` of 132 characters or fewer.
- **Privacy tab:**
  - a single-purpose statement;
  - a justification for every permission and host;
  - remote code "No";
  - data-use disclosures. 2.0 "handles" authentication cookies, website content and browsing activity even though nothing reaches us;
  - the certifications;
  - a privacy-policy URL. One is required for any product that handles user data, and the site must also carry a Limited Use statement.
- **In-extension disclosure.** From 2026-08-01, data collection must be "prominently disclosed to the user", even when core to the single purpose. A first-run disclosure screen covers it if 2.0's use counts.
- **First upload by hand** in the dashboard; that creates the extension ID. Choose manual publishing to time the release (30 days after approval).
- **Review time:** "a few days", up to "a few weeks". New developers and new items get closer review. Contact support after 3 weeks.
- **CI:** move to CWS API v2 before automating. v1.1, which `release.yml`'s secrets target, was supported only until 2026-10-15.
- **Final permission set first time.** On Chrome, a later update that adds a warning *disables* the extension until each user re-approves.

## 1. Firefox: what the update does to permissions

### 1.1 Which changes hold the update

**How Firefox decides:**
- **The diff.** Every update, automatic or a manual "Check for Updates", goes through `AddonManagerInternal.updatePromptHandler` (`FF/toolkit/mozapps/extensions/AddonManager.sys.mjs#L1297-L1345`). It compares the old and new `userPermissions` with `Extension.comparePermissions` (`FF/toolkit/components/extensions/Extension.sys.mjs#L1416-L1436`). With nothing new: "If there are no new permissions, just go ahead with the update" → `return Promise.resolve()`.
- **Silent without warning strings.** `ExtensionsUI` turns the diff into warning strings. "If we don't prompt for any new permissions, just apply it" (`FF/browser/modules/ExtensionsUI.sys.mjs#L314`). Permissions declared `PermissionNoPrompt` / `OptionalPermissionNoPrompt` have no string. `cookies` is one: `"$extend": "OptionalPermissionNoPrompt"` (`FF/toolkit/components/extensions/schemas/cookies.json#L5-L10`).
- **Held updates:**
  - Otherwise the update waits. It's added to `ExtensionsUI.updates`, the app menu gets a badge (`showBadgeOnlyNotification("addon-alert")`, `ExtensionsUI.sys.mjs#L132`), and the prompt opens in about:addons (`showUpdate`, `#L190-L207`).
  - The user-facing text: "You must approve new permissions before the updated version will install. Choosing "Cancel" will maintain your current extension version." (`toolkit/locales/en-US/toolkit/global/extensions.ftl`).
  - If declined: "At the moment, this prompt will re-appear next time we do an update check. See bug 1332360" (`ExtensionsUI.sys.mjs#L203-L204`; [bug 1332360](https://bugzilla.mozilla.org/show_bug.cgi?id=1332360) is still open).
  - Extension Workshop agrees: "if an extension update requires additional permissions the user is prompted to approve the permissions before the updated version is installed" ([Request the right permissions](https://extensionworkshop.com/documentation/develop/request-the-right-permissions/)).
- **Removals never prompt.** `comparePermissions` lists only additions. `ExtensionData.migratePermissions` cleans up settings for removed permissions on update (`Extension.sys.mjs#L1472+`). Dropping `identity`, `activeTab` and `scripting` is silent.
- **Data collection:**
  - `comparePermissions` diffs `data_collection` and skips `"none"`. Adding `required: ["none"]` is silent.
  - Adding a required type such as `websiteActivity` holds the update. Extension Workshop: on update "Firefox only shows the added required data permissions", except `none` ([Firefox built-in consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)).
  - `has_previous_consent` would skip that prompt (`updateIsMigratingToDataCollectionPerms`, `AddonManager.sys.mjs#L1311-L1326`), but AMO's linter rejects it: `if (has_previous_consent) { this.collector.addError(messages.HAS_PREVIOUS_CONSENT_IS_RESERVED)` ([addons-linter `src/parsers/manifestjson.js` L1422-1426](https://github.com/mozilla/addons-linter/blob/master/src/parsers/manifestjson.js)).
- **Update checks:** `pref("extensions.update.interval", 86400)` (`FF/browser/app/profile/firefox.js#L236`), so a rollout reaches active users over about a day.

### 1.2 MV3 host permissions are not in that diff, and aren't granted on update

**How Firefox handles MV3 origins:**
- **Treated as optional.** In MV3, all origins are treated as optional: `originControls: this.manifestVersion >= 3 && this.type === "extension"`, commented "Whether to treat all origin permissions (including content scripts) from the manifest as optional" (`Extension.sys.mjs#L1995`).
- **Left out of the diff.** `getRequiredPermissions()` returns `origins: this.originControls ? [] : this.getManifestOrigins()` (`#L1215-L1236`). The update diff only sees `userPermissions`, so **new MV3 host permissions never prompt and never hold an update**.
- **Granted only on install.** The grant happens only when `this.startupReason === "ADDON_INSTALL"`, or `ADDON_UPGRADE` for add-ons forced by enterprise policy (`#L4414-L4425`). It's gated on the pref `extensions.originControls.grantByDefault`, `true` since Firefox 127 ("Include origin permissions in the install prompt for MV3 extensions", `FF/modules/libpref/init/all.js#L3114-L3115`).
- **Mozilla says so too:**
  - MDN, Firefox 127: "`host_permissions` for Manifest V3 extensions are now displayed to users during installation (Firefox bug 1889402). However, if an extension update requests new host permissions, these are not shown to the user. See (Firefox bug 1893232)" ([Firefox 127 for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/127)).
  - Rob Wu in [bug 1893232](https://bugzilla.mozilla.org/show_bug.cgi?id=1893232) ("Consider including origins in update prompt for mv3 extensions", NEW): "in MV3 the extension is updated without adding the requested host permission".
- **Content-script matches count as origins.** `getManifestOrigins()` adds every `content_scripts[].matches` pattern (`#L1267-L1283`), and MV3 content scripts only run where that origin is granted ([bug 1745819](https://bugzilla.mozilla.org/show_bug.cgi?id=1745819), Firefox 100).
- **Grants survive updates.** They live in `ExtensionPermissions` and are only removed on uninstall (`clearOnUninstall` → `ExtensionPermissions.removeAll`, `Extension.sys.mjs#L504-L519`).

| 2.0 asks for | User with `*://*.youtube.com/*` granted | User without it |
|---|---|---|
| Origins only under `*://*.youtube.com/*` (host permission or content script) | Works right after the silent update. Adding the same pattern as a `host_permission` isn't "new" anyway. | 1.4.5 didn't run for them either. 2.0 must ask. |
| Plus other origins (`*.google.com`, `*.googlevideo.com`, `accounts.google.com`…) | Silent update; **the extra origins are not granted**. 2.0 must ask. | Same, for everything. |
| Plus an API permission with a warning | **Held** until accepted in about:addons. | Same. |
| Plus a required data-collection type other than `none` | **Held** for consent. | Same. |

### 1.3 Who has YouTube access today

AMO lists six versions, all published 2024-06-19 to 2024-06-21: 1.2, 1.4.1, 1.4.2, 1.4.3, 1.4.4 and 1.4.5 ([AMO API, versions of the add-on](https://addons.mozilla.org/api/v5/addons/addon/%7Bcc70cd21-2cc6-444b-bd89-496909346091%7D/versions/); [add-on](https://addons.mozilla.org/api/v5/addons/addon/%7Bcc70cd21-2cc6-444b-bd89-496909346091%7D/): 66 average daily users, no privacy policy).

**The cases:**
- **MV2 versions (1.2–1.4.3, e.g. `3296daa:manifest.json`, `224a85c^:manifest.json`).** They listed `*://*.youtube.com/*` as a required permission, which MV2 grants at install. When those users updated to MV3, `migratePermissions` moved it into the granted optional set: "If a permission is optional in this version and was mandatory in the previous version, it was already accepted by the user at install time so add it to the list of granted optional permissions now" (`Extension.sys.mjs#L1472-L1487`) *(inference from code; not tested)*.
- **Fresh 1.4.4/1.4.5 installs on Firefox 127+** (127 shipped 2024-06-11, ten days before 1.4.5; [Mozilla release data](https://whattrainisitnow.com/api/firefox/releases/)). The content-script origin was granted at install.
- **Fresh MV3 installs on Firefox 125/126.** Nothing was granted. The Firefox 127 change only touched the install path, and no migration for already-installed add-ons was found ([changeset](https://hg.mozilla.org/mozilla-central/raw-rev/a069d7806c9b); **unverified** beyond reading it). These users would have had to grant access by hand; 2.0 can't tell them apart from users who revoked it.
- **Anyone can revoke it any time,** from the extensions button ("Always Allow on {domain}", "Only When Clicked") or about:addons → Permissions. Extension Workshop: "Users can grant or revoke any host permission on an ad-hoc basis" ([MV3 migration guide](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)).

### 1.4 Detecting and asking for missing access

- **Which origins can be requested.** Since MV3 origins are optional, `permissions.request({ origins: [...] })` works for any origin listed in `host_permissions` or `content_scripts`. Origins not declared are refused ("since it was not declared in the manifest", `FF/toolkit/components/extensions/parent/ext-permissions.js#L107-L218`).
- **Check and listen.** `permissions.contains` reports the current grant, and `permissions.onAdded` / `onRemoved` have existed since Firefox 77 ([browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/permissions.json)).
- **Request inside the click.** `permissions.request` needs a user action, and Firefox loses it if anything is `await`ed first, including `permissions.contains` ([bug 1398833](https://bugzilla.mozilla.org/show_bug.cgi?id=1398833)). Check before rendering the button; call `request` first in the click handler.
- **The popup is fragile:**
  - Requesting from a popup has worked since Firefox 75 ([bug 1432083](https://bugzilla.mozilla.org/show_bug.cgi?id=1432083)), but the prompt is anchored to the toolbar button.
  - Since Firefox 151, clicks right after a popup closes are ignored ([bug 1940116](https://bugzilla.mozilla.org/show_bug.cgi?id=1940116)).
  - Whether the popup's promise resolves if the popup closes is **unverified**.
- **Where to ask instead:** an extension tab (the note page) is the safer place. Either way, the background should listen to `permissions.onAdded` rather than trust the popup's promise.
- **Without access, nothing on the page runs.** The content script doesn't run (§1.2), so 2.0 can't tell the user inside YouTube. Only the popup, a badge or a tab can.
- **Chrome:** see §4.5. It grants at install, but the user can withhold access later.

### 1.5 Users below the new `strict_min_version`

- **They stay on 1.4.5.**
  - Firefox sends `appVersion` with every check (`extensions.update.url`, `firefox.js#L234-L235`).
  - AMO returns only a version whose minimum is at or below it: "The version we return _always_ need to have a min appversion set lower or equal to the appversion passed by the client" ([addons-server `src/olympia/versions/update.py`](https://github.com/mozilla/addons-server/blob/master/src/olympia/versions/update.py)).
  - Users on older Firefox therefore stay on 1.4.5 silently, as long as it stays public. The AMO page shows them a "Download the new Firefox and get the extension" button instead of Install (addons-frontend `GetFirefoxButton`, read from source, not seen live). Old versions stay reachable through "See all versions" ([Extension Workshop](https://extensionworkshop.com/documentation/publish/distribute-manifest-versions/)).
- **Compatibility comes from the manifest:** "the extension's browser compatibility settings in AMO are set from the browser_specific_settings" ([Version compatibility](https://extensionworkshop.com/documentation/publish/version-compatibility/)).
- **Who that would actually affect:**
  - **Firefox below 128:** can't run add-ons since the add-on signing root expired on 2025-03-14. The update was needed for "all Firefox users running versions earlier than 128 (or ESR versions earlier than ESR 115.13)" ([Mozilla Add-ons blog, 2025-03-10](https://blog.mozilla.org/addons/2025/03/10/root-certificate-will-expire-on-14-march-users-need-to-update-firefox-to-prevent-add-on-breakage/); [SUMO](https://support.mozilla.org/en-US/kb/root-certificate-expiration)). 1.4.5 already needs 125+, so a 128 floor strands nobody who can still use 1.4.5.
  - **ESRs in October 2026** ([whattrainisitnow.com](https://whattrainisitnow.com/release/?version=esr), run by Mozilla release management):
    - 128 ended with 128.15 (2025-09-16).
    - 140 ended with 140.17 (2026-09-29).
    - **153 is the current ESR** (153.5.0, 2026-10-13); the next is 175.
    - 115 lives on only for Windows 7–8.1 and macOS 10.12–10.14, "up to March 2027", and is below 1.4.5's own minimum anyway.
  - **Release channel:** 158 shipped 2026-10-13, now on a two-week cadence ([calendar](https://whattrainisitnow.com/calendar/)).
- **`data_collection_permissions` needs Firefox 140 desktop / 142 Android** ([Firefox 140 for developers](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/140); Extension Workshop: "Set `strict_min_version` to 140 and 142").

## 2. Migration on update

### 2.1 What 1.4.5 actually stored

Only `storage.local` is used, with bare keys. WXT's `local:` prefix is stripped before the key reaches `storage.local` (`resolveKey` in [`@wxt-dev/storage`](https://github.com/wxt-dev/wxt/blob/main/packages/storage/src/index.ts)), so `local:playlists` is 1.4.5's `playlists`.

| Key | How 1.4.5 wrote it | How 1.4.5 read it | What the migration must handle |
|---|---|---|---|
| `playlists` | Text inputs, trimmed, empties dropped, saved on **every keystroke** (`e96dbf7:src/popup/popup.js:13-20`) | Auto-add targets | Half-typed IDs and pasted URLs; empty strings can't occur. Pull `list=` out of URLs, drop non-IDs, de-duplicate. |
| `addToPlaylistID` | Free text, **not trimmed**, saved on every keystroke (`popup.js:126-129`) | Shortcut playlist | Whitespace, `""`, URLs. Same clean-up. |
| `watchLaterShortcut` | Each `keydown`'s `event.key` in press order, joined with `+`, last key upper-cased (`popup.js:44-58`) | Split on `+`; modifiers checked as `event[mod.toLowerCase() + "Key"]` (`src/content.js:63-90`) | Modifiers in any order and possibly repeated (auto-repeat while held), e.g. `Shift+Control+Control+S`. **`Control` never matched**: it looked for `event.controlKey`, but the property is `ctrlKey`. Every Ctrl shortcut silently did nothing in 1.4.5. |
| `requiredWatchPercentage` | The input's `value`, a **string** (`"75"`), and `""` gets through the field's 0–100 check (`popup.js:103-120`) | `result.requiredWatchPercentage \|\| 0` (`content.js:102-104`) | Convert to a number and clamp. **Absent or `""` meant 0 %** (fire at once), while the popup displayed 50 (`popup.html:37-51`). |
| `toastEnabled` | Checkbox, unchecked by default (`popup.html:59`) | Toast only `if (data.toastEnabled)` (`content.js:4-6`) | **Absent meant off.** Treating absent as "2.0's default" (on) turns toasts on for everyone who never touched it. |
| `clientID`, `clientSecret`, `accessToken`, `refreshToken` | Options page (`options.js:63-71,116-119`) | Data API | Delete (settled in the map). |

**Other things the migration should know:**
- **The `localStorage.cachedVideos` cache (`d73027e`) never shipped.** That commit isn't an ancestor of `e96dbf7` (`git merge-base --is-ancestor d73027e e96dbf7` fails).
- **The 1.5.0 keys exist only in developer profiles,** because 1.5.0 never shipped: `authMode`, `authServerURL`, `cachedPlaylists`, `channelFilters`, `channelLabels`, and the IndexedDB cache. The migration may as well delete `authMode` and `authServerURL`.
- **Deleting the tokens doesn't revoke them.** Google revokes with `POST https://oauth2.googleapis.com/revoke` and `token=` ("The token can be an access token or a refresh token"), and users can remove access at `https://myaccount.google.com/permissions` ([Google OAuth 2.0 for web server apps, "Revoking a token"](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)). Calling it needs a Google origin ADR-0001 wants to drop, so linking from the note is the cheaper option.
- **The 1.4.5 playlist IDs may not belong to the signed-in account.** They belong to whichever Google account authorised the user's own OAuth client, which may not be the account or brand channel signed in to YouTube. Only a playlist load can tell.

### 2.2 How reliable `runtime.onInstalled` is

Both browsers fire `reason: "update"` with `previousVersion` ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onInstalled): "This is only present if the `reason` value is `update`"; [Chrome](https://developer.chrome.com/docs/extensions/reference/api/runtime#event-onInstalled)). On Firefox it is not a safe *only* trigger for the migration:

- **What fires it.** Firefox fires `"update"` only for `startupReason === "ADDON_UPGRADE"`, on `background-first-run` (`FF/toolkit/components/extensions/parent/ext-runtime.js#L41-L71`).
- **Updated while disabled: no event.** The new version isn't started (`.update(this.addon, !this.addon.disabled, install)`, `FF/toolkit/mozapps/extensions/internal/XPIInstall.sys.mjs#L2044-L2046`). When the user enables it later, it starts with `ADDON_ENABLE` (`FF/toolkit/mozapps/extensions/internal/XPIDatabase.sys.mjs#L3121-L3123`), which `onInstalled` ignores.
- **Applied at browser startup: no `"update"` event.** `BootstrapScope.update`: "For updates that happen during startup, such as sideloads and staged updates, the extension startupReason will be APP_STARTED" (`Extension.sys.mjs#L3305-L3311`). It only sets `updateReason`, which `onInstalled` doesn't read.
  - **When updates get staged:** when the running version has a `runtime.onUpdateAvailable` listener ("has an upgrade listener, postponing upgrade until restart", `XPIInstall.sys.mjs#L1878-L1886`).
  - **For this hop:** 1.4.5 has no such listener, so 1.4.5 → 2.0 is normally applied live and does fire `onInstalled`, unless the add-on was disabled.
- **Register the listener synchronously in the background's first run.** WXT's background `main` "CANNOT BE ASYNC" ([WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints.html)), so register it at the top of `main`.
- **Chrome defers instead of dropping.** "This extension might be disabled before it has a chance to load, e.g. if the extension increased its permissions. So instead of trying to send the onInstalled event here, we remember the fact in prefs and fire the event when the extension is actually loaded" ([`runtime_api.cc` @65da63c42](https://chromium.googlesource.com/chromium/src/+/65da63c42/extensions/browser/api/runtime/runtime_api.cc); test `UpdateDispatchesOnInstalledAfterEnablement`, [`events_apitest.cc` @a753229](https://chromium.googlesource.com/chromium/src/+/a753229/chrome/browser/extensions/events_apitest.cc)). These are old revisions; I didn't find the same code in today's `main`, so the current mechanism is **unverified**. It only matters for later 2.x updates.

**So key the migration on stored state:**
- At the top of the background `main`, on every start: if there's no `schemaVersion` marker and any 1.4.5 key exists, migrate. Write the new keys, remove the old ones, write the marker **last**, and make every step idempotent.
- Use `onInstalled` only for event-shaped work: onboarding on `"install"`, and on `"update"` with `previousVersion` starting with `1.` an early nudge for the note.
- **WXT's per-item `version`/`migrations` don't fit this cross-key migration:**
  - They run "as soon as `storage.defineItem` is called" ([WXT storage](https://wxt.dev/storage)), in every context that defines the item.
  - They run per key, with the version stored under `key + "$"`.
  - They skip absent values (`if (value == null) return;`, `packages/storage/src/index.ts`).
  - They suit 2.0's own keys from here on.
- **Don't reuse a 1.4.5 key name for a differently shaped value,** such as a per-account `playlists`.

### 2.3 The one-time note

- **Mozilla's upboarding pattern:** `runtime.onInstalled`, `case "update"`, `browser.tabs.create({ url })` ([Extension Workshop, "Onboard, upboard, and offboard users"](https://extensionworkshop.com/documentation/develop/onboard-upboard-offboard-users/), "Detecting an upgrade"). Neither store's policy forbids opening a tab on update. AMO's policies only require that data-transmission changes in an update be "shown to all new and upgrading users immediately after the update" (§6.2.2, [Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)).
- **Drive the note from a flag.** The event can be missing (§2.2), so the migration sets an `upgradeNote: "pending"` flag. The popup shows the note until it's dismissed, and a badge (`action.setBadgeText`) draws the eye.
- **Put the access button in the note.** When access is missing (§1.4), the note holds the "Give access to YouTube" button, and a tab is the more reliable place for it.
- **The note can also be the disclosure.** Ticket 03 asks for a first-run disclosure with an explicit OK before 2.0 handles any data (`research/store-policy`, "What 2.0 must do to comply", item 5). For a 1.4.5 user that's the one-time note: the carried-over auto-add playlists are there, but auto-add shouldn't fire until they've said OK. If a required data-collection type is ever declared, the update is already held for Firefox's own consent (§1.1), and AMO requires the disclosure "immediately after the update" (§6.2.2).
- **Draft wording, for ticket 19:** "Playlist Tools 2.0 works through the YouTube account you're signed in to. It no longer needs a Google Cloud client ID or secret, so those have been deleted from this browser. You can remove the old access at myaccount.google.com/permissions."
- **Test the upgrade before release.** Extension Workshop's recipe self-hosts both XPIs and an updates manifest with `update_url`, sets `xpinstall.signatures.required` to `false` on Nightly or Developer Edition, and uses about:addons → "Check for Updates" ([Test permission requests](https://extensionworkshop.com/documentation/develop/test-permission-requests/)).

## 3. AMO: what the 2.0 update needs

### 3.1 Review

- **No separate track for a major version.** "It can take up to 24 hours for your submission to be signed and published, or longer if your submission is selected for manual review" ([Signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)). Human review "can take place at any time, sometimes before publication" ([What does review rejection mean to users](https://extensionworkshop.com/documentation/publish/what-does-review-rejection-mean-to-users/)).
- **Auto-approval doesn't consider version size or permissions.** Its verdict fields are `has_auto_approval_disabled`, `is_locked`, `is_promoted_prereview`, `should_be_delayed`, `is_blocked`, `is_pending_rejection` and `is_waiting_on_scanners` ([addons-server `src/olympia/reviewers/models.py`](https://github.com/mozilla/addons-server/blob/master/src/olympia/reviewers/models.py)).
  - The risk weight that orders the review queue counts "Size of code changes: 5kB is one point, up to a max of 100", so a rewrite ranks high *(inference)*.
- **If rejected:** "If an earlier version of your extension is public, this becomes the one seen by visitors". Policy also warns: "Reviews may result in the rejection of current or previous versions of your add-on, or in your add-on being blocked."
- **Policies 2.0 touches** ([Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), updated 2026-04-30):
  - "Add-ons must only request those permissions that are necessary".
  - "must be self-contained and not load remote code for execution".
  - The description must say what the add-on transmits.
  - "if an account is needed for any part of the add-on's functionality, testing credentials to allow use of the add-on" must be provided. 2.0 needs a signed-in Google account.
- **Notes for Reviewers** hold "log in details for a dummy account, source code information" ([Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)).

### 3.2 Source code for a Bun/WXT build

- **Required.** Source must be uploaded when code is made with minifiers or "tools that generate a single file from other files, such as browserify or webpack" ([Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)). Vite output qualifies, and matching source "must be attached to every extension version".
- **The reviewer rebuilds it:** "There must be no differences."
- **The reviewer's default machine:** "Ubuntu 24.04.4 LTS (Desktop edition)", "ARM64 CPU architecture", "10GB of system memory (RAM), 6 cores of vCPU", "Node 24.14.0 and npm 11.9.0", "35GB of free disk space".
- **Tools:** they "must be open source", and "cannot be web-based: all review builds are run locally". Include "the lockfile", and give instructions ("include a README file"). Size limit: "The maximum file size for source code files is 200MB."
- **Policy §3.1:** "All dependencies must either be included in the source code package directly or downloaded only through the respective official package managers during the build process. Build tools or environments that no longer appear to be supported by their maintainers are not accepted."
- **Bun isn't named anywhere.** It's open source and runs locally, so it should be acceptable if documented *(inference)*. The README must say how to install `bun@1.4.0`.
- **AMO's automatic rebuild (since July 2026):**
  - "AMO now attempts to build your extensions from the submitted source code … When the two match, reviewers don't have to verify the build manually. … this applies only if you submit source code that includes a package.json file".
  - An npm script `build-for-amo`, "when present, the builder invokes this script instead of guessing" ([Firefox 153 WebExtensions API updates, 2026-07-23](https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/)).
  - Whether that Node-based builder copes with a Bun project is **unverified**. If it can't, the human reviewer uses the README.
- **What WXT already does:**
  - **The sources zip.** `wxt zip -b firefox` already makes it, and it excludes `node_modules`, tests, the output directory and hidden files ([WXT `InlineConfig.zip`](https://wxt.dev/api/reference/wxt/interfaces/InlineConfig.md)). So `bun.lock` is in, and so is `server/` until it's deleted or put in `zip.excludeSources`.
  - **WXT's own guidance:** "a README.md or SOURCE_CODE_REVIEW.md" and "Make sure the build output is the exact same" ([WXT publishing](https://wxt.dev/guide/essentials/publishing.html)).
  - **CI's rebuild check.** `release.yml` already unzips the sources zip, runs `bun install --frozen-lockfile` and `bun run build:firefox`, and checks the result. It does so on x86-64; byte-identical output on ARM64 is likely for pure JS but **unverified**.
- **Submission:** `wxt submit` is publish-browser-extension. It uploads the sources zip through AMO API v5. Reviewer and release notes go in the JSON file named by `FIREFOX_AMO_METADATA_FILE` (`{"version":{"approval_notes":…,"release_notes":…}}`, since 6.1.0; read from the package source on [unpkg](https://unpkg.com/publish-browser-extension@6.2.0/)). AMO documents `approval_notes` as "Information for Mozilla reviewers" ([addons-server API](https://mozilla.github.io/addons-server/topics/api/addons.html)).

### 3.3 `data_collection_permissions`

- **The key:**
  - `browser_specific_settings.gecko.data_collection_permissions` with `required` and `optional` lists.
  - Types: `personallyIdentifyingInfo`, `healthInfo`, `financialAndPaymentInfo`, `authenticationInfo`, `personalCommunications`, `locationInfo`, `browsingActivity`, `websiteContent`, `websiteActivity`, `searchTerms`, `bookmarksInfo`, and the optional-only `technicalAndInteraction` ([Firefox built-in consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/), updated 2026-03-12).
  - `none` must stand alone (`NONE_DATA_COLLECTION_IS_EXCLUSIVE`, [addons-linter messages](https://github.com/mozilla/addons-linter/blob/master/src/messages/manifestjson.js)).
- **Not yet required for updates to existing add-ons:**
  - The 2025 announcement said "In the first half of 2026, Mozilla will require all extensions to adopt this framework" ([blog, 2025-10-23](https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/)). That hasn't happened.
  - Extension Workshop: "New versions and updates for add-ons created before November 3 don't need to use this feature", but they "will have to at a later date".
  - Linter: "is required for all new Firefox extensions, and will be required for new versions of existing extensions in the future" (`MISSING_DATA_COLLECTION_PERMISSIONS`).
  - AMO escalates it to an error only for new add-ons: `waffle.switch_is_active('enforce-data-collection-for-new-addons') and upload.source == amo.UPLOAD_SOURCE_DEVHUB and not upload.addon` ([addons-server `src/olympia/devhub/tasks.py`](https://github.com/mozilla/addons-server/blob/master/src/olympia/devhub/tasks.py) L402-416).
- **Add it anyway.** It's coming, and the repo already has it. Once added, "it will need to continue using them for all subsequent versions" (2025 blog).
- **Minimum version:** Extension Workshop advises `strict_min_version` 140 / 142. Lower values give `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` warnings, which a Mozilla engineer called "technically correct, but not really relevant" ([addons-linter#5989](https://github.com/mozilla/addons-linter/issues/5989)).
- **Whether `none` is accurate decides the upgrade UX:**
  - The policy defines transmission as "any data that is collected, used, transferred, shared, or handled outside of the add-on or the local browser", with no exception for the site the user is on.
  - Implicit consent only covers transmission that is "a direct, immediate consequence of a single, deliberate user command"; "Any passive, continuous, or background transmission requires explicit consent" (§6.2.2.2). Auto-add is passive.
  - Ticket 03 (branch `research/store-policy`, `docs/research/store-policy.md` §1.3) recommends keeping `none`, as the listed precedents do, and asking AMO first. Its fallback is `required: ["websiteActivity"]` with `strict_min_version` 140.
  - **What the fallback costs for upgrades.** A required type holds every 1.4.5 user's update behind the consent prompt (§1.1), and `has_previous_consent` can't avoid that on AMO. So if AMO says no to `none`, the 2.0 rollout to existing users depends on each of them accepting a prompt in about:addons.
  - No primary source settles it (**unverified**).
- **Privacy policy.** It no longer has to be hosted on AMO ([blog, 2025-06-23](https://blog.mozilla.org/addons/2025/06/23/updated-add-on-policies-simplified-clarified/)), but "if any data is being transmitted from the user's device, a privacy policy … is required" ([Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)).

## 4. Chrome Web Store: what a first submission needs

### 4.1 Developer account

- **Registration and fee.** "First agree to the developer agreement and policies then pay the registration fee"; "After an account is created, you cannot change its email address" ([Register](https://developer.chrome.com/docs/webstore/register)). The fee is "a one-time registration fee, in an amount determined in Google's sole discretion" ([Developer agreement](https://developer.chrome.com/docs/webstore/program-policies/terms)); the amount is **unverified**.
- **2-Step Verification:** "2-Step Verification is required for all developer accounts prior to publishing an extension" ([Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)).
- **Publisher name and contact email.** The name shows under "Offered by:", and the contact email must be verified ([Set up your developer account](https://developer.chrome.com/docs/webstore/set-up-account)).
- **Trader declaration.** "All developers on the Chrome Web Store are required to declare if they are a Trader or Non-Trader". A trader's details "will be posted publicly at the bottom of your extension listing" ([Trader verification FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)).
- **Slots:** "a default of two extension slots" per publisher ([CWS review updates, 2026-08-20](https://developer.chrome.com/blog/cws-review-updates-2026)).

### 4.2 Store listing

- **Required images:** "Only the extension icon, a small promotional image, and a screenshot are mandatory".
  - The icon is 128×128 with 96×96 artwork.
  - Screenshots: 1280×800 or 640×400, up to 5.
  - The small promo tile is 440×280; the marquee is optional ([Images](https://developer.chrome.com/docs/webstore/images), [Store listing tab](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)).
- **Required fields:** description, category and language.
- **Manifest `description`:** "no more than 132 characters" ([manifest `description`](https://developer.chrome.com/docs/extensions/reference/manifest/description)).
- **Before publishing a new item:** "Before you can publish a new item, you have to fill out the Store listing and Privacy tabs in the Developer Dashboard" ([Using the API](https://developer.chrome.com/docs/webstore/using-api)).
- **Name:** "Don't use any Google trademarks or any confusingly similar marks as the name of your extension". Use "for", "for use with" or "compatible with" plus ™, with an attribution line, e.g. "Highlight local shops for Google Maps™" ([Branding guidelines](https://developer.chrome.com/docs/webstore/branding)).

### 4.3 Privacy practices tab

- **The fields** ([Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)):
  - a single purpose;
  - per-permission justifications ("tell the reviewers why your extension needs to use each permission");
  - remote code;
  - data-use disclosures and certifications;
  - a privacy policy URL.
  - Exact labels exist only in screenshots (**unverified**).
- **2.0 handles user data even though nothing reaches us** ([User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)):
  - "by "handle" we mean collecting, transmitting, using, or sharing user data".
  - The examples include "data in a website's browser storage (like cookies)", "Authentication information (such as logins, password, and authentication cookies)", "Website content and resources" and "Web browsing activity".
  - "Extensions are required to disclose how they handle user data, even when data is processed or stored locally".
  - "This policy requires all Products that handle user information to post a privacy policy".
- **Limited Use:** the statement "must be disclosed on a website belonging to your extension" ([Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)).
- **Since 2026-08-01** ([CWS policy updates 2026](https://developer.chrome.com/blog/cws-policy-updates-2026)):
  - Collected data must be "strictly necessary to the extension's disclosed single purpose".
  - "all data collection be prominently disclosed to the user", "regardless of whether the data is closely related to the extension's single purpose".
  - Developers must "proactively disclose to users if their data handling practices change".
- **Remote code: "No".** All JS, including the MAIN-world bridge, ships in the package; remote code "does not include data or things like JSON or CSS" ([Remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)).

### 4.4 Review time

- **Typical:** "For most extensions, review is completed within a few days, but it can take up to a few weeks. … If your extension is pending review for more than three weeks, please contact developer support" ([Review process](https://developer.chrome.com/docs/webstore/review-process)).
- **Closer review for:**
  - new developers and new extensions;
  - powerful permissions and significant code changes;
  - "broad host permissions", with the examples `*://*/*`, `https://*/*` and `<all_urls>`. `*://*.youtube.com/*` isn't among them, so it probably isn't "broad" *(inference)*.
- **Code:** "Obfuscation is disallowed"; minification is fine.
- **Rejection:** the email names the policy; appeals are filed from the dashboard ([appeals, 2026-04-08](https://developer.chrome.com/blog/cws-new-appeals-process)).
- **Manual publish:** "you will have up to 30 days to publish" ([Publish](https://developer.chrome.com/docs/webstore/publish)).
- **Visibility:** Public, Unlisted or Private ([Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)).
- **Verified CRX uploads** are optional ([Verified uploads](https://developer.chrome.com/blog/verified-uploads-cws)).

### 4.5 Install prompt, withheld access and later updates

- **Install grants hosts:** "Extensions will continue to be granted access to all requested hosts at install time" ([extensions menu](https://developer.chrome.com/blog/new-extensions-menu-testing)). Users can later restrict access to on click or specific sites ([Chrome Web Store help](https://support.google.com/chrome_webstore/answer/2664769)).
- **Detecting withheld access:** `chrome.permissions.contains({ origins })`. On Chrome 133+, `permissions.addHostAccessRequest` asks from the tab ([permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)).
- **Warnings:** each host pattern gets a "Read and change your data on …" warning (exact wording **unverified**). `cookies` and `storage` get none ([Permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)).
- **Later updates:**
  - If an update adds a warning, "the extension will be disabled until the user accepts the new permission" ([Permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)).
  - "Adding or changing match patterns in the "host_permissions" and "content_scripts.matches" fields … will also trigger a warning" ([Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)).
  - So 2.0's Chrome permission set should be final.

### 4.6 Tooling

- **The first upload has to be manual.**
  - "The new API does not support creating new items" ([CWS API v2, 2025-10-15](https://developer.chrome.com/blog/cws-api-v2)).
  - WXT: "If you're publishing an extension to a store for the first time, you must manually navigate the process" ([WXT publishing](https://wxt.dev/guide/essentials/publishing.html)).
  - Upload the first zip through the dashboard; that assigns `CHROME_EXTENSION_ID`.
- **CI targets an API that just expired.**
  - "We plan to support the old API until 15th October 2026" (same post).
  - `release.yml` and `.env.submit.example` pass v1.1-style `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` and `CHROME_REFRESH_TOKEN`, which `wxt submit` marks "[Deprecated: API v1.1 only]". `--chrome-publisher-id` is "[API v2 only]" ([wxt submit](https://wxt.dev/api/cli/wxt-submit)).
  - v2 takes OAuth or one service account per publisher ([Service accounts](https://developer.chrome.com/docs/webstore/service-accounts)).

## Open points and unverified claims

- **Data transmission (AMO) and collection (CWS).** Do requests to YouTube through the user's own session count? No primary source settles it. The answer decides whether the Firefox update is held for consent (§1.1, §3.3) and what the CWS privacy tab and in-extension disclosure must say (§4.3).
- **AMO's automatic rebuild.** Whether it handles a Bun project, and whether the reviewers' ARM64 build is byte-identical to CI's x86-64 build.
- **Firefox 125/126 installs.** Whether Firefox ever granted YouTube access retroactively to MV3 users who installed on 125/126. None found.
- **Popups.** Whether `permissions.request` from a closing popup resolves.
- **Chromium today.** The current `main` mechanism that defers `onInstalled` for an extension disabled during update.
- **CWS details:** the fee amount, the exact privacy-tab labels, and the exact host-permission warning wording.
