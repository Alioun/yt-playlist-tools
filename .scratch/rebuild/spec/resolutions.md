# Resolutions made while assembling the spec

While the chapters were being written, their authors flagged conflicts between tickets, and details no ticket pinned down. The main session settled each one here on 2026-10-19, under the user's delegation ("you have the shared understanding"). Every resolution follows the map's principles. The chapters apply them, and each one is cited by its R-number.

Items that are genuinely the user's call are **not** settled here; they stay in the spec's [Open items](../spec.md#open-items). The user's own answers of 2026-10-20 are recorded as [R84–R99](#the-users-decisions-of-2026-10-20-r84r99), the running-cost rules as [R100–R117](#running-costs-r100r117), the GatherTube fold as [R120–R139](#gathertube-r120r139), the icon as [R140](#the-icon-perch-r140), the name as [R141–R144](#the-name-perchling-r141r144), the wordmark and store images as [R145–R147](#wordmark-and-store-images-r145r147), releases from `main` as [R148](#releases-from-main-r148), and signed Firefox dev builds as [R149](#signed-firefox-dev-builds-r149). The user-confirmed policies of 2026-10-24 are [R150–R155](#user-confirmed-policies-of-2026-10-24-r150r155). The user-confirmed interim conversion policies of 2026-10-25 are [R156–R160](#user-confirmed-interim-conversion-policies-of-2026-10-25-r156r160). R118 and R119 are unused.

## Sites and features

- **R1 — The YouTube Music section switch.**
  - **Scope:** turning it off means nothing of ours runs on music.youtube.com. That includes playlist shortcuts' "Also on YouTube Music", so it overrides ticket 17's exception.
  - **Stored:** as a shared setting, `musicSection: boolean`, which is synced with the shared settings.
  - **Default:** on. It only gates the section; the features inside it start off.
  - **Registry:** the switch gates every music.youtube.com registration.
- **R2 — The undo key.** The undo key (Alt+U unless changed or cleared) works on a site whenever a toast with Undo is on screen there, whichever feature made it. The key listener lives in the site core (ticket 17), so this costs nothing extra. It supersedes ticket 08's "only while a shortcut feature is on".
- **R3 — Signed out.** Every action that needs a signed-in account shows the same failure toast with a **Sign in** action: Save, Like, playlist shortcuts, quick-save, auto-add and the queue actions that need an account. The wording is ticket 12's.
- **R4 — Unsupported or unrecognised items.**
  - **Saving a non-song:** a playlist shortcut, the Save key or the Save button on an album or playlist says "Only songs can be saved to playlists."
  - **Any other unsupported action:** "{Action} isn't available for {kind}.", e.g. "Play next isn't available for artists."
  - **An unrecognised pointed-at item:** "Couldn't tell which item you meant. Point at it again, or use the player." This wording is action-neutral and replaces the save-only wording.
- **R5 — Casting.** While casting, every YouTube Music queue edit is unavailable with one message: insert, move, Remove from queue, and their Undo. Save and Like still work.
- **R6 — Tooltips show a key** only while Quick-action shortcuts is on.
- **R7 — No pending toast with feedback off.** With a feature's Show feedback off, its pending ("Saving…") toast isn't shown either; only the eventual failure is.
- **R8 — Playing now (popup).**
  - **When it shows:** whenever the YouTube Music section is on and has site access, whichever in-page features are on, because it changes nothing on the page.
  - **Which tab it reads:** the focused window's active YouTube Music tab, else the one playing audio, else the most recently used. This is ticket 10's order, kept here only.
  - **Hidden** when nothing is playing.
  - **Signed out:** one line, "Sign in to YouTube Music to save songs."
- **R11 — Option names and defaults.** Chapter 04's names for the unnamed options are adopted.
  - Quick-save's "On Shorts shelves too": **off**.
  - The watch-page button's "On Shorts too": **off**.
  - The card menu's "Links inside cards keep the browser's menu": **off**.
  - Theme: **System**.
  - The toolbar tick: **off** until the user answers D10.
- **R12 — The toolbar "!" badge priority:** consent or upgrade pending > site access missing > not working > a Missing or Full playlist.
  - **Per tab:** site access and not working.
  - **For every tab:** consent and Missing/Full.
  - **Colours:** "needs you" (consent, site access, Missing/Full) is the brand violet; "not working" is amber.

## Accounts, sync and data

- **R9 — Settings sync before consent.**
  - At first run the synced copy may be read before Agree, to pre-tick the features the user already chose elsewhere. That's the user's own settings in the browser, not YouTube.
  - Nothing is pushed, and the sync switch isn't stored, until Agree. Without Agree, nothing is written.
- **R10 — The privacy policy and session storage.** The policy's session-storage line changes to: session skips and recent adds may name videos and playlists, but they stay in this browser's memory until it closes, and are never synced or sent anywhere. The storage choice stays.
- **R13 — Sync states.**
  - **`waiting`:** the join question hasn't been answered yet.
  - **`update-needed`:** refuses only edits to synced documents written by a newer version this browser can't read. Other edits go through.
- **R14 — YouTube Music access denied at first run (Chrome).** Consent and the other ticks still apply. YouTube Music features are saved on but show "Needs access" with a Grant button in the popup and settings, and nothing is injected until access is granted.
- **R15 — Check now with no YouTube tab:** disabled, with "Open YouTube to check" and a button.
- **R20 — Storage.sync while sync is off.** The migration doesn't touch `storage.sync` while sync is off, so it doesn't remove 1.5.0's stray `theme` key there. Only developer profiles ever wrote it.

## YouTube behaviour

- **R22 — Explicit actions always answer.** The once-per-session toast suppression (YouTube refusing a video; adds during a rate-limit pause) applies to auto-add only. Keys, clicks and the picker get a toast every time.
- **R23 — "Don't auto-add this video".**
  - A session skip doesn't count as "auto-add has run", so remembered progress isn't dropped. Only an actual add or "already in" does that.
  - Undoing "Don't auto-add this video" removes the skip and checks the goal at once.
- **R24 — A shortcut with no playlist on this account.**
  - Toast: "{Shortcut} has no playlist on {Account} yet." with a **Choose** action that opens the in-page picker in choose mode.
  - After choosing: "{Shortcut} now saves to “{Playlist}”."
  - The picker key in choose mode uses the playlist-shortcuts feature's feedback switch.
- **R25 — On a signed-out page, the sign-in check comes first** (ticket 11), before "has a playlist".
- **R26 — An unknown channel** blocking auto-add is the outcome *filtered out* (reason: unknown channel), not *failed*. It keeps its own toast copy.
- **R27 — YouTube details.**
  - **Queue button after Undo:** it returns to its idle state and is clickable again.
  - **The watch-page menu's Save rows** belong to the watch-page button feature, whether or not quick-save is on, and use its feedback switch.
  - **A partial result** (some playlists added, some filtered out) gives one toast, "Added to {n} playlists · filtered out of {m}", with Undo for the adds.
  - **Auto-add when membership can't be read:** "Couldn't check “{Title}”'s playlists, so auto-add didn't run." The proceed rule stays PROVISIONAL (ticket 12, live check L6).
  - **Typed-channel errors** reuse 1.5.0's wording: "Couldn't find that channel on YouTube." for not found or terminated, and "That doesn't look like a channel. Paste an @handle or a channel URL." for anything else.
  - **The watch-page button's generic failure:** "Couldn't save “{Title}”. Try again."
  - **Goal for very short videos:** goal = min(length, max(1 s, required percentage × length)), with the "≤ length − 2 s" bound applying only when length ≥ 3 s.

## UI

- **R28 — The card menu's "not working" notice** is a tiny kit-free notice in the site core: plain DOM in the YouTube skin, about 0.5 KB. The card menu alone still loads no kit.
- **R32 — Feature IDs** are kebab-case everywhere: registry, deep links (`#feature-watch-button`) and tests. Settings keys may stay camelCase internally.
- **R35 — YouTube Music row buttons** join the row on hover (ticket 27). What happens on narrow Quick picks rows stays the user's call.
- **R36 — Where the gradient appears:** seven places, adding the site tab's dot and the first-run page's background wash to ticket 15's five.
- **R37 — Copy uses "quick-save playlist"**, never "one-click playlist". The file stays `onboarding.html`, and prose says "the first-run page".
- **R38 — UI details.**
  - **Deep links to one playlist:** `#feature-<id>&playlist=<playlistId>` scrolls to the row and highlights it. Failure toasts use this.
  - **Undo after removing a shortcut:** an inline "Shortcut removed · Undo" row for 6 s, in place.
  - **Accessibility:**
    - automated axe-core checks in the real-browser layer for the popup, settings, the first-run page and the in-page hosts;
    - a manual screen-reader pass of the popup and settings before release;
    - with `prefers-reduced-motion`, no motion beyond opacity.
- **R39 — Gaps found by the parity chapter.**
  - **Refresh:** a ↻ "Refresh playlists" button in the picker header and in settings' playlist lists. Lists also refresh by themselves when opened if their cache is older than 5 minutes.
  - **Sort:** lists keep YouTube's Save-dialog order (Watch later first), with search, plus a "Sort A–Z" toggle in the picker header, stored per device.
  - **README:** it's rewritten for 2.0 as a whole, as part of the release.

## Architecture and quality

- **R29 — The picker's budget.**
  - Linking `popovers.js` to the kit's Svelte is **rejected**, keeping ADR-0008, so the kit doesn't grow on every page.
  - If the picker overruns, first trim its Bits UI use. If it still overruns, replace Bits UI in the picker with the native Popover API and a hand-written listbox.
  - The first-open budget measures the no-preload case, because the picker key opens it without a hover.
- **R30 — Kit rows rebalanced.** The kit's row is set from the measured builds: about 28 KB on YouTube and 27 KB on YouTube Music. Feature rows are adjusted so the site totals stay **49 KB (YouTube)** and **43 KB (YouTube Music)**. Chapter 07 sets the exact rows.
- **R31 — Timing gates run on Chromium.** Firefox gates sizes and behaviour, and records `performance.mark` timings for information only.
- **R33 — Ticket 10's tab-picking order is kept only for Playing now** (R8). Live check M4 no longer covers keyboard commands beyond `_execute_action`.
- **R34 — Finding the resolver.** It's found by shape on first use, cached for the page, and retried once. If several properties match, the first whose `resolveCommand` is a function is used, and a `resolver-ambiguous` breakage signal is recorded. Chapter 06's job and result names are adopted.
- **R40 — Quality details.**
  - **Breakage signal:** YouTube showing its own toast after a quiet queue edit records `quiet-route-noisy` and marks the feature *partly working*.
  - **Browser watch:** the daily watch runs on Chromium only; Firefox runs in the pre-release real-browser check.
  - **The `$state` identity guard** is a CI check (lint or test, the build's choice).
  - **Compile cache:** the test compile cache is added once the suite takes more than 60 s.
  - **The first-run page's budget:** 30 KB first frame.
  - **Dev reloads** with runtime registration get verified while scaffolding.

## Release

- **R17 — The reviewer notes** describe ADR-0008's two registrations per site, as chapter 08 corrected them.
- **R18 — The privacy policy** takes effect from the first beta (1.99.1) and covers "version 1.99 (beta) and later".
- **R19 — Store screenshots** come from the release candidate; the prototypes are layout references only.
- **R21 — Release details.**
  - **A non-numeric 1.4.5 `requiredWatchPercentage`** counts as unset: 0 %, and the note asks the 50 %/0 % question.
  - **The first Chrome upload** is `v1.99.1`, by hand, as Unlisted.
  - **The beta page:** a minimal `{site}/beta/` page with the signed XPI link and install steps.
  - **`FIREFOX_EXTENSION_ID`** is a variable in the `amo` environment.
  - **`schema: 1`** is written at the first background start, before consent; a schema marker isn't user data.
  - **A 1.4.5 shortcut playlist with no key:** the note says "Your 1.x shortcut had no key. Its playlist is kept; set a key in Settings."
  - **A Chrome resubmission during the soak** is done by hand, as Public with staged publishing.

## Second round (after applying R1–R40)

Applying the first round surfaced more cross-chapter contradictions, and a few places where a first-round resolution was wrong. Where a second-round resolution amends an earlier one, it wins.

### Ownership

When chapters disagree, the owning chapter wins:
- **02 and 03** own feature behaviour and copy on their site.
- **04** owns user-visible accounts, settings, data and status behaviour (R54).
- **05** owns layout and visuals.
- **06** owns mechanisms and interfaces.
- **07** owns budgets, test placement and breakage-signal identifiers (R51, R52).
- **08** owns migration, upgrade and consent copy and conditions (R60).

### Behaviour and copy

- **R41 (amends R3) — Auto-add stays silent when signed out,** with no toast, to avoid 1.5.0's toast-on-every-video defect. R3 applies to explicit actions only. Like keeps its own wording, "Sign in to YouTube Music to like songs.", as a failure toast with **Sign in**.
- **R42 (amends R27) — Every feature has a Show feedback switch,** the watch-page button included (default **on**). The watch-page menu's Save rows use it.
- **R43 (confirms R23) — Remembered progress.** Only *added* and *already in* drop it. *Filtered out*, *failed* and session skips keep it.
- **R44 — The undo key's home.**
  - The undo key lives in **Settings › Everywhere**, as a key used on every page. That section shows whenever any feature on either site is on.
  - It's preset to Alt+U at install.
  - It works while a toast with Undo is on screen. While a shortcut feature is on, a press with nothing to undo answers "Nothing to undo."
  - The picker key stays with its shortcut features.
- **R45 (details R24) — The Choose pick.** Choosing a playlist through the "has no playlist" toast's **Choose** sets it *and* saves the item, and the toast carries Undo, on both sites. User-facing copy uses typographic quotes (“ ”) throughout.
- **R46 (confirms R5) — Casting is strict.** Inserts are unavailable while casting too. Re-allowing them after live check M1 would need a new decision.
- **R55 — The account-change toast** answers every explicit press (R22). For auto-add it shows once per tab.
- **R56 — The "has no playlist" toast** is a neutral hint, not a failure. It's always shown, even with feedback off, and has **Choose**.
- **R57 — Pause** lasts until the user resumes it or the browser restarts. An extension update also clears it, because session memory is lost. The copy says "until you resume it or restart the browser".
- **R58 — Shared-settings changes made in a private window are saved** (PROVISIONAL on AMO question 3). The pin tooltip says: "Changes made here are saved; nothing about this window's browsing is."
- **R67 — The Remove key on an item that isn't queued** says "Point at a song in the queue to remove it." This replaces R4's general form, which reads wrongly there.

### Access, status and diagnostics

- **R50 — Status is per feature.** A YouTube Music feature with some actions unavailable is *partly working*; the status detail names those actions. Their buttons and keys hide in that tab (ticket 26).
- **R51 — Breakage-signal identifiers** are chapter 07's, kebab-case: `fell-back`, `quiet-route-noisy` (both sites), `resolver-ambiguous` (diagnostics only), and the rest. Chapter 04's HEALTH-01 lists them all.
- **R53 (amends R12) — Chrome's music.youtube.com prompt.**
  - It's asked from the click that switches on the first thing that needs it: a YouTube Music feature, or "Also on YouTube Music" while playlist shortcuts is on. The section switch itself never asks.
  - Missing YouTube Music access raises the "!" badge only while something that needs it is on.
  - The site-access "!" is shown on **every tab**, not per tab, because without host access the extension can't tell which tabs are that site's.
- **R54 — Accounts and settings mechanics follow chapter 04.**
  - The fallback for the account in view is ACC-13.
  - The sync switch lives in `Device.syncOn`, not in the registry's `Settings`.
  - The footprint type has four tags.
- **R59 (amends 07's zero-calls rule) — `storage.sync` while sync is off.** Exactly two calls are allowed: first run's read before Agree (R9), and Clear all data with its box ticked. 07's test allows these.

### Release and build

- **R47 — The first-run page's 30 KB budget** counts JavaScript; CSS is reported, not gated.
- **R48 — Disclosures follow the final route table.** If, after ticket 25, no shipped route reads the session cookie, the "Authentication information" disclosure and every cookie line in the consent text and privacy policy are removed.
- **R49 — The reviewer notes describe chapter 06's mechanisms:**
  - the two registrations per site;
  - `executeScript` for the on-demand check and the popovers;
  - the resolver found on first use.
- **R52 — Budgets and test placement follow chapter 07.** The watch-page button's row is 3.5 KB, and "every built page renders" is a real-browser test.
- **R60 — Upgrade-note copy and conditions follow chapter 08.** The popup banner and the note's "Kept" rows list only what actually carried over.
- **R61 — The browser watch, called from the release workflow,** tests the release artifacts and doesn't rebuild.
- **R62 — The hotfix lane** takes any fix, our own bugs included, that changes no permission, disclosure, consent version or data schema, and no user-visible behaviour beyond the fix.
- **R63 — Chapter 06's folder layout** adds `store/`, `site/`, `RELEASING.md`, `SOURCE_CODE_REVIEW.md` and the release scripts.
- **R64 (fixes R21's side effect) — How a 1.x upgrader is recognised.**
  - On every background start, if no consent and no upgrade-note record exist, and any 1.x key is present in `storage.local`, it's an upgrade: the note path. Otherwise it's a fresh install: the first-run path.
  - The 1.x keys are `playlists`, `addToPlaylistID`, `watchLaterShortcut`, `requiredWatchPercentage`, `toastEnabled`, `clientID`, `clientSecret`, `accessToken` and `refreshToken`.
  - It never relies on `onInstalled` (unreliable on Firefox, ticket 06) or on the schema marker. This replaces the `onInstalled`-based rewrite of REL-MIG-03 and DATA-49.
- **R65 — Placeholders and leftovers.**
  - Copy placeholders are `{Product}` and `{Account}` everywhere.
  - Diagnostics shows the version, including "(beta)".
  - The popup has a banner row for the "older than your settings" state (DATA-48).
  - The broken link in 05 to 07's old §7.6.6 anchor is fixed.
- **R66 (confirms R34) — An ambiguous resolver:** use the first property whose `resolveCommand` is a function. 06 and 07 align.

## Third round (final mop-up)

- **R68 (amends R50) — Never silent.** When a YouTube Music action is unavailable in a tab, its buttons hide there, but its key stays caught. Each press answers "{Action} isn't working right now. The popup shows why." This keeps ticket 18's rule that a key never does nothing silently.
- **R69 (amends R58) — The pin tooltip in a private window** says why the pin is disabled: "Quick-save playlists can't be changed in a private window."
- **R70 (settles R27's reading) — "Couldn't save" wording.**
  - "Couldn't save “{Title}”. Try again." is the watch-page button's status line when auto-add failed, as chapters 02 and 05 now have it.
  - The watch-page menu's Save rows are explicit saves, so their failures use the add flow's failure copy (02).
- **R71 — Chrome's YouTube Music prompt denied while switching on Playlist shortcuts.** Playlist shortcuts goes on, and "Also on YouTube Music" turns off, with "No access to YouTube Music, so shortcuts work on YouTube only."
- **R72 — Every release needs a signed-in live-check record,** hotfixes for our own bugs included. It takes a few minutes.
- **R73 — Chapter 06's interface gaps.**
  - The `nowPlaying` result carries the artwork URL.
  - YouTube Music membership rows carry the song count when YouTube returns one; otherwise the UI shows privacy only.
  - §6.10 gains `assets/brand/` for the icons and mark files.
- **R74 — Private-window copy.** 05's UI-POP-10 row 6 takes 04's ACC-40 copy: "{Account} has no setup yet. A private window can't save one, so set it up in a normal window."
- **R75 — Batched notices** use full feature names, e.g. "Quick-save on thumbnails".
- **R76 (confirms 08's reading of R64) — A 1.4.5 user with no 1.x key left** counts as a fresh install. No tab opens on update; the toolbar "!" and "Waiting for your OK" lead them to first run. REL-MIG-09's crash-recovery rule stands.
- **R77 — Quotes in copy.** Video and song titles take typographic quotes. Playlist names don't, except in R24's "{Shortcut} now saves to “{Playlist}”."

## Final gaps

These settle the remaining "not pinned down" copy and decisions. Where a chapter still lists one of them as a gap, this section governs.

- **R78 — Choose mode opened from a shortcut's Choose.** Title "Choose a playlist for {Shortcut}", subtitle "{Shortcut} will save here on {Account}."
- **R79 — Sync-status copy.**
  - `joining`: "Looking for your synced settings…"
  - `waiting`: "Choose which settings to keep."
  - `ok`: "Synced"
  - The join dialog uses ticket 16's two choices: "Use synced settings" and "Use this browser's settings".
  - When the first-run sync card finds nothing: "No synced settings yet. This browser's settings will be shared."
- **R80 — Check now before consent** is disabled, with "Agree first to check YouTube."
- **R81 — Chrome's YouTube Music prompt denied during first run's Agree.** Consent is still set. The YouTube Music features are held for access as in R14, and Playlist shortcuts follows R71.
- **R82 — Contrast.** Any future token change keeps WCAG AA: 4.5:1 for text and 3:1 for UI components and focus rings, in both themes. 07's axe-core check enforces it.

## After the spec: Firefox prompts and data collection (R83)

**R83 — Settled 2026-10-19 from Mozilla's own sources,** pointed to by the user:
- the KB articles ["Permission request messages for Firefox extensions"](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions) (updated 2026-06-11) and ["Extension data collection"](https://support.mozilla.org/en-US/kb/extension-data-collection);
- the Extension Workshop's ["Firefox built-in consent for data collection and transmission"](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) (updated 2026-03-12);
- the [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) §6;
- Firefox's own `extensionPermissions.ftl`, `extensions.ftl` and `Extension.sys.mjs` (main branch, read 2026-10-19).

**Firefox prompt strings (settles live check P1 for Firefox).**
- **Fresh install:**
  - header "Add {Product}", with no question mark;
  - "Required permissions:" followed by "Access your data for sites in youtube.com domains". This is the install prompt's full-domain-list form. about:addons lists the same grant as "Access your data for sites in the youtube.com domain".
  - `storage` and `scripting` have no message at all.
  - "Data collection:" followed by "The developer says this extension doesn't require data collection."
- **Update from 1.4.5:** no prompt. No message-bearing permission is new, and on update Firefox shows added required data permissions only, never `none`.
- **An optional data type requested at runtime** (not used, see below) would show "{Product} requests additional data collection", "New data collection:" and "The developer says the extension wants to collect: …".
- **The live check:** P1 now only glances at the real dialogs. Chrome's strings stay as chapter 08 §5 read them from Chromium's source.

**Data collection: 2.0 declares `required: ["none"]`.** This settles ticket 23 by decision; the drafted message to AMO isn't needed.

- **Why:**
  - Firefox presents data collection to users as data the extension *shares with its developer*: "Share … with extension developer", "The developer says this extension collects: …". 2.0 sends nothing to its developer or to any third party. Its only requests go to YouTube or YouTube Music, the site the user is on, carrying the user's own actions there.
  - Settings sync uses the browser's own sync, which the developer never sees. So it declares no data type (SYNC-26).
  - Listed extensions that work the same way declare `none` (ticket 03).
- **Residual risk:**
  - AMO's policy defines transmission broadly ("collected, used, transferred, shared, or handled outside of the add-on or the local browser"), and lists "access to and placement of cookies" as personal data.
  - A strict reviewer could apply that to the page-signed route, which reads YouTube's session cookie to sign requests sent only to YouTube.
- **Mitigations:**
  - The reviewer notes explain the route (R49).
  - If live checks L3/L4 show a cookie-free route works, the question disappears (R48).
  - If a reviewer objects anyway, chapter 08 §13's fallback applies. The Firefox 140 floor it needs is already in place.
- **AMO question 3 (settings changed in a private window):** allowed. A settings change the user makes isn't browsing data, and nothing about the window's browsing is stored (R58).
- **AMO question 4 (the Bun install step):** as planned in `SOURCE_CODE_REVIEW.md`, with the npm-lockfile fallback if a reviewer asks for it.

## The user's decisions of 2026-10-20 (R84–R99)

On 2026-10-20 the user answered the spec's open decisions D2–D11, the narrow-rows question and ticket 30's calls ("rest sounds good"), each worded so that yes is the recommendation. D7 came with one change: GitHub issues, but with a few prefilled choices and directions. The name (D1) is **not** settled: a second naming round runs in [ticket 22](../issues/22-name.md), and the spec keeps the provisional name. *(Settled later that day: Perchling for YouTube™, [R141–R144](#the-name-perchling-r141r144).)* These resolutions fold the answers into the chapters. Where they amend an earlier resolution, they say so, and they win.

### New capabilities and their details

- **R84 — Unticking in the picker removes, with Undo (D2).** It settles PAR-NEW-31 on both sites.
  - Unticking a checked row removes the item from that playlist, as YouTube's own Save dialog does. It's an explicit removal: membership read and account guard first, never filtered, and ordered with any add of the same item and playlist. It removes the entry this picker's own tick added, else what YouTube's Save dialog removes for that row.
  - **Undo:** in a page, the untick shows one toast, `Removed “{title}” from {Playlist}`, with **Undo**, which puts the item back at the end of the playlist. It's a confirmation under the Show feedback of the feature that opened the picker (as choose mode's first pick, YT-PK-09). The undo key runs it. In the popup's picker sheet, where results never show as toasts, the row reads "Removed · **Undo**" in place for 6 s (as R38). Ticking the row again also puts the item back.
  - So a picker raises two toasts: choose mode's first pick and an untick. Every other row result shows on the row.
  - Unticking an auto-add playlist still sets the session skip (YT-AA-05). Undoing the untick puts the video back and leaves the skip, which then changes nothing.
  - The "if declined" branches go.
- **R85 — Four more YouTube Music quick actions (D3).** Save to library, Start mix, Go to artist and Go to album are added to Quick actions (buttons) and Quick-action shortcuts (keys). It settles PAR-NEW-32.
  - **Off by default:** each button is off, and each key starts with no key. Presets never set them.
  - **Where:** offered exactly where YouTube Music's own ⋮ menu offers them for that item (YM-QA-1), matched by command: the library toggle, the mix's watch endpoint, and the artist or album browse endpoint. Narrowed like Like: no second library button where YouTube Music shows its own (album and playlist page headers), page headers keep only Play next and Add to queue, and nothing new goes on the player bar; keys reach the playing song.
  - **Order:** after the five existing actions: Save to library, Start mix, Go to album, Go to artist. A button the user already knows never moves when they switch one of these on.
  - **Save to library** toggles the item's library state, as YouTube Music's own item does, and behaves like Like: the icon shows the state, a click shows no toast, and a key shows `Saved “{title}” to your library` or `Removed “{title}” from your library` with **Undo**. It goes through YouTube Music's own handling with the endpoint the item carries. If YouTube Music shows its own toast for it, that toast stands in for ours. It needs a signed-in account and stops after an account change in another tab, as Save does.
  - **Start mix** plays a mix from the item and replaces the queue, exactly as YouTube Music's own Start mix does. It has no Undo and no confirmation toast: playback is the answer. Its tooltip says "Start mix (replaces the queue)". It replaces the queue, so it's unavailable while casting (R5's one rule). It works signed out.
  - **Go to artist** and **Go to album** open that page in the tab, as YouTube Music's own items do, with no reload and no toast. With nothing pointed at, a key opens the playing song's artist or album. They work signed out and while casting.
  - **Failures** follow the existing pattern: "Couldn't save “{title}” to your library. Try YouTube Music's ⋮ menu.", "Couldn't start a mix from “{title}”. Try YouTube Music's ⋮ menu." and "Couldn't open the artist page for “{title}”. Try YouTube Music's ⋮ menu." (album likewise). A navigation fails if the page hasn't changed within 10 s.
  - **Mechanism:** two YouTube Music jobs, `library` (`app.handleServiceEndpoint` with the item's own endpoint) and `navigate` (`app.handleNavigationEndpoint` with the item's own endpoint), from [ticket 21](../issues/21-youtube-music-internals.md)'s research §2.4, §2.6 and §2.7. Live check M3 also covers Save to library's signed-in shape and toast.
- **R86 — Recent adds (D4).** The popup gets a **Recent adds** list, kept only for the current browser session. It settles PAR-NEW-33.
  - **What's listed:** every add with the outcome *added* in this browser since it started, by any feature, for the account in view, newest first, up to 50. An add to several playlists is one entry. Each entry shows the title (linking to the video), the playlists (each linking to the playlist on YouTube), what made it (e.g. "Auto-add", "Alt+W", "Quick-save") and when. An undone add leaves the list. Removals and queue adds aren't adds, so they aren't listed.
  - **Where:** a Recent adds button in the popup's header, left of the gear, opens it as a sheet, loaded on demand. Empty: "Nothing added since the browser started."
  - **Kept:** in `storage.session` (`recentAdds`), so it's memory only. It ends when the browser closes or the extension updates, never syncs and is never sent. Nothing from a private window is listed. Removing a setup removes its entries; Clear all data removes them all.
  - **Switchable:** Settings › Privacy & data has "Keep a list of recent adds until the browser closes", **on** by default, for this browser only (`device.recentAdds`). Off, nothing is recorded, the list is cleared, and the header button hides. It's a setting, not a feature: it changes nothing on any page.
  - It replaces the privacy policy's "recent adds (one minute)" with the list kept until the browser closes. The add coordinator's 60 s memory (YT-ADD-41) is separate and unchanged.
- **R87 — Live streams and premieres keep not counting (D5).** PAR-NEW-34 is declined: auto-add never counts a live stream, a premiere while it plays, a waiting room or a post-live recording in 2.0 (YT-AA-24). Replays and finished premieres count, as before.
- **R88 — Keys from any tab (D6).** A new feature, in 2.0.0. It settles PAR-NEW-35 and amends [ADR-0004](../../../docs/adr/0004-shortcuts-caught-in-page.md), whose history stays as written.
  - **The feature:** **Keys from any tab** (`any-tab-keys`), Everywhere, "Keys only, doesn't change the page", Show feedback **on**, off until picked. It lives in Settings › Everywhere and at first run; it has no popup row.
  - **The commands:** the manifest declares three browser commands with no `suggested_key`:
    - `save-playing-song`: "Save the playing song to your quick-save playlist (YouTube Music)";
    - `like-playing-song`: "Like or unlike the playing song (YouTube Music)";
    - `watch-later-current-video`: "Save the current video to Watch later (YouTube)".
  - **Keys:** the user sets them in the browser's own shortcut settings (Chrome's `chrome://extensions/shortcuts`, Firefox's about:addons › Manage Extension Shortcuts). Settings opens that page. The extension never sets or records these keys. It reads them with `commands.getAll()` to list them and to warn the key recorder about a clash: a key the browser takes never reaches the page. Where Chrome's page offers a Global scope, that's the browser's own setting; nothing depends on it.
  - **Which tab:** each command goes to one tab, by ticket 10's order: the focused window's active YouTube Music tab (or YouTube tab with a current video), else the one playing audio, else the most recently used. Discarded tabs are skipped. The job runs there, as that tab's account, so ADR-0001's rule holds: jobs run from an open YouTube or YouTube Music tab. This amends R33: the order now serves Playing now and keys from any tab.
  - **What it does:** what the in-page action does on the playing song or current video. Save is YM-SAVE's quick-save; with no quick-save playlist on that account it answers "{Account} has no quick-save playlist on YouTube Music yet. Choose one in the popup." Like is YM-LIKE's toggle. Watch later is an explicit add through the add flow, never filtered.
  - **The answer:** the tab's own toast, held until the tab is visible (YT-ADD-20, YM-FB-3), and, for 3 s, a ✓ or ✕ on the toolbar icon of the focused tab, with the answer's text as its tooltip. With no matching tab, or with the YouTube Music section off, only the ✕ and its tooltip show: "No YouTube Music tab is open." / "No YouTube tab is playing a video." / "YouTube Music is off in {Product}."
  - **Off costs nothing, honestly:** commands can only be declared in the manifest, so the three are listed, unbound, in the browser's shortcut settings even while the feature is off, and on installs that never use it. No key is reserved until the user sets one, and declaring them shows no prompt on either browser. While the feature is off, held or waiting for consent, the background ignores a command: it reads nothing, injects nothing and answers nothing, as a switched-off in-page shortcut does. Settings says: "These keys stay listed in your browser's shortcut settings, and do nothing while this is off."
  - **Page code:** none is registered. On a command, the background injects the site's page half, core and kit into the chosen tab if it has none (`Registrar.ensure`, as the probe and the popovers do), runs the job, and the injected code stays inert until the tab reloads.
  - **Site access (Chrome):** the YouTube Music commands need music.youtube.com. Switching the feature on asks for it in the same click (R53). Denied, the feature still goes on, and the YouTube Music commands answer ✕ "No access to YouTube Music." until access is given (as R71).
  - **Disclosure:** its key line adds "and the keys you set in your browser for Keys from any tab". 2.0 hasn't shipped, so consent stays version 1.
- **R89 — Report a problem (D7).** Problem reports go to GitHub issues, with a few prefilled choices and directions. There's no support e-mail. It settles the support-e-mail item (HEALTH-22, REL-STORE-35, REL-STORE-17's Contact line).
  - **Where:** **Report a problem** in Settings › Diagnostics and Settings › About. A not-working notice's **Details** leads to Diagnostics, as before.
  - **The chooser:** a short dialog. Its lead says: "Reports go to GitHub, where they're public. You need a GitHub account. There's no support e-mail." Then three kinds, each with its direction:
    - **A feature says it isn't working:** "YouTube probably changed something. Check Known problems first: if it's listed there, a 👍 on it helps more than a new report." Opens the `not-working.yml` form.
    - **Something went wrong:** "Say what you did, what you expected and what happened instead. Paste the diagnostics report if you can." Opens `problem.yml`.
    - **An idea:** "Say what you'd like to do, and where you'd look for it." Opens `idea.yml`.

    Then a **Feature** choice (every feature, plus "Upgrade from 1.x", "The popup or Settings" and "Something else"), preselected when the dialog opens from a feature's status. Then a line naming exactly what goes into GitHub's address, e.g. "GitHub opens with: {Product} 2.0.0 · Firefox 141 · Auto-add · Not working.", **Copy diagnostics report** with "Paste it into the form's Diagnostics field if you want to share it.", and **Open GitHub**.
  - **The prefill:** **Open GitHub** opens `https://github.com/Alioun/yt-playlist-tools/issues/new` with `template`, `title`, and the form fields `version`, `browser`, `feature` and `status` as query parameters (GitHub prefills an issue form's field from the query parameter named by its `id`; it documents this for text fields, so every prefilled field is an `input`). The values are the extension's version ("(beta)" on betas), the browser and its major version, the chosen feature's name, and its status in this browser. Nothing else: never a video, playlist, channel or account, and never the diagnostics report, which goes in only if the user pastes it. Those few values reach GitHub when its page opens, and the developer only if the user submits.
  - **The forms** are YAML issue forms in `.github/ISSUE_TEMPLATE/`: `problem.yml`, `not-working.yml`, `idea.yml` and `config.yml` (blank issues off; contact links to Known problems and the 1.4.5 setup guide, and to the privacy policy once the site is live). They carry the directions themselves, and are worded for 1.4.5 and 1.5 users too, so they serve today's users before 2.0 ships. They're added to the repo with this resolution.
  - **Labels** the forms set (`problem`, `youtube-change`, `idea`) must already exist in the repo, or GitHub drops them; creating them is the user's setup.
  - **Nothing is sent by itself:** HEALTH-21 keeps "no error reporting, analytics or crash upload", with one user-started exception, this link. The privacy policy says so. AMO's `none` stays: the user starts it, sees every value first, and nothing reaches the developer unless they submit. If a reviewer counts it as technical data, the fallback drops `version` and `browser` from the address, and the form asks for them instead.
- **R90 — Export and import settings to a file (D8).** It settles PAR-NEW-36.
  - **Where:** Settings › Privacy & data, **Export settings** and **Import settings**.
  - **Export** saves `playlist-pigeon-settings-{YYYY-MM-DD}.json` (PROVISIONAL with the name; *now `perchling-settings-{YYYY-MM-DD}.json`, R142*) through the page's own download link, with no new permission. It holds a header (`format: 1`, the product, the version, the date), the shared settings, and every account setup with its channel filters, kept filters included: the documents settings sync carries. It never holds consent, the sync switch, anything else from `device`, caches, watch progress, session memory or the unclaimed 1.x setup. A line warns: "The file holds your playlist IDs, channel filters and account names. Keep it private."
  - **Import** reads a file the user picks, checks it, then confirms: "Import settings from {file}? Your shared settings, and the setups of the {N} accounts in the file, are replaced. Other accounts' setups are kept." with **Import** and **Cancel**. It's one store change, stamped as a fresh edit, so settings sync carries it like any edit, and a change too big for the synced copy is refused (SYNC-14).
  - **Never a shortcut around consent or access:** imported switches run only after this browser's consent and site access, as switches that arrive by sync do (FT-34, FT-49).
  - **Refused:** a newer format ("This file was made by a newer version of {Product}. Update it here first."), anything that isn't a settings file ("This isn't a {Product} settings file."), and any import from a private window ("Import settings in a normal window.").
- **R91 — Save from the browser's menu (D9).** A new YouTube feature, off by default. It settles PAR-NEW-37.
  - **The feature:** **Save from the browser's menu** (`browser-menu`), YouTube, "Doesn't change the page", Show feedback **on**.
  - **The entry:** while it's on, the browser's own right-click menu on youtube.com shows **Save to ▸** on a link to a video or Short, and on a watch page or Short itself. Its items are fixed, because a menu can't be rebuilt per tab before it shows on Chrome: **Quick-save playlist** (with none set on that account, it opens the picker in choose mode), **Watch later**, and **Choose a playlist…**, which opens the playlist picker in the page.
  - **What it does:** an explicit add through the add flow, in the tab where the menu opened, as that tab's account, with the usual toasts and Undo. It's never filtered. Signed out, it answers with the sign-in failure. It shares YouTube's quick-save playlist with quick-save and the watch-page menu.
  - **With the card menu on,** a right-click on a card opens YouTube's ⋮ menu instead, so Save to ▸ shows with Shift+right-click, on links the card menu leaves to the browser, and on the watch page.
  - **Not on YouTube Music,** where Quick actions does this job.
  - **The permission:** `contextMenus`, as an optional permission on both builds, requested first and synchronously in the click that switches the feature on, first run's Agree included. Neither browser shows a prompt for it: Chrome lists no warning for `contextMenus` and prompts only when warnings change, and Firefox has no message for it and grants an optional permission with no message without a dialog. So it adds no install or update prompt, and while the feature is off the permission isn't held at all. `menus` isn't used, because Firefox's optional permissions list `contextMenus`, not `menus`.
  - **Missing permission** (switched on in another browser and synced, or removed by the user): the feature is held with "Needs your OK" and **Allow**, which requests it.
  - **Page code:** none is registered. A save runs through the same on-demand injection as R88, and the picker loads as the popovers do.
- **R92 — The toolbar tick and "paused" on the icon (D10).** Both exist, both are on by default, and both are switchable. It settles PAR-NEW-38 and amends R11's "toolbar tick off".
  - Auto-add's options, for every account: "Tick the toolbar icon when this tab's video is auto-added" (**on**) and "Show on the toolbar icon while auto-add is paused" (**on**).
  - **The tick:** a teal ✓ on that tab's icon once the tab's current video has been added to at least one auto-add playlist. It clears when the tab's current video changes.
  - **Paused:** a slate "II" on every tab's icon while auto-add is paused, with the tooltip "Auto-add is paused".
  - **Priority:** the "!" first, then paused, then the tick. A key from any tab's 3 s answer (R88) shows over all of them, then the icon returns to what it showed.
  - Upgraders get both on, as everyone does.
- **R93 — Ready for translation, English only (D11).** It settles PAR-NEW-39.
  - Every user-facing string comes from one message catalogue, `_locales/en/messages.json`, read with `browser.i18n.getMessage`: the popup, Settings, the first-run page, in-page controls, toasts, the browser-menu entries, and the manifest's name, description, action title and command descriptions (`__MSG_…__`, with `default_locale: "en"`).
  - No string is built from translated fragments. Placeholders are named, plurals pick a message with `Intl.PluralRules`, and dates, times and numbers use `Intl`.
  - Layouts take text 40 % longer than English without clipping.
  - 2.0 ships English only: no other locale folder ships until a translation is reviewed. The UI language doesn't follow YouTube's, and the store listings stay English.
  - A guard test fails on a missing or unused message key, and a lint flags string literals in UI code.
- **R94 — Narrow Quick picks rows keep every button.** Settles YM-NARROW-1 and R35's open point: every switched-on button stays on narrow rows, and tooltips name the song (YM-NARROW-2). R85's extra buttons squeeze those rows more, which the Settings warning (YM-NARROW-4) already says.

### Ticket 30's calls

- **R95 — The store listings re-lead with saving.** The user took ticket 30's recommendation. It amends chapter 08 §9.
  - **Summaries:** AMO's is "Save YouTube videos to Watch Later or any playlist in one click or with a shortcut, auto-add the videos you actually watch, and get one-click Play next and Add to queue on YouTube Music. Every feature is opt-in. (Formerly YouTube Playlist Tools.)" (246 of 250). Chrome's `description` is "Save to Watch Later or any playlist in one click or a shortcut, auto-add what you actually watch, and Add to queue on YouTube Music." (132 of 132; "…and queue on YouTube Music." leaves 2 spare).
  - **Description:** it opens with saving to any playlist in one click or a named key. "Save" is the verb throughout, Watch Later appears two or three times, and there are no "only" or "first" claims. The bullets follow ticket 30's order: quick-save, playlist shortcuts, auto-add, the watch-page button, the queue button (with Undo), the card menu; then YouTube Music's Play next and Add to queue on songs, albums and playlists, then keys for the song you point at. The opener doesn't claim that YouTube's Save dialog closes after each pick, which is unverified.
  - **"No Google sign-in"** stays out of the summaries and the lead. It stays in "How it works", the release notes and the upgrade note.
  - **Screenshots:** 1 thumbnails and the picker ("Save to any playlist in one click."), 2 shortcuts, 3 YouTube Music, 4 auto-add, 5 Settings ("Everything starts off.").
  - **Scope stays whole:** nothing moves to 2.x.
- **R96 — Never-authorised upgraders default to "once half is watched" (S1).** It amends REL-CON-06 and R21's default for one group, and adds a dated amendment to [ADR-0009](../../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md).
  - The migration records whether 1.4.5 had a `refreshToken` stored, as `details.pct.authorised`, before it deletes the credentials. `refreshToken` stays one of R64's nine 1.x keys; S1 only reads whether it was there.
  - **Unset percentage and no `refreshToken`:** 1.4.5 never got access to the account, so it never added anything, and there's no behaviour to keep. The migration writes 50 %, and the note's question defaults to "Once half of it is watched". Its wording for them: "1.4.5 showed 50 % here, but it never got access to your account, so it never added anything. Which do you want?"
  - **Their Kept row** says "You chose {N} playlists in 1.x, but 1.x never got access to your account, so nothing has been added to them yet." instead of "Adds to {N} playlists you chose in 1.x."
  - **With a `refreshToken`,** nothing changes: 0 %, the first option, as 1.4.5 did (ADR-0009). A non-numeric value still counts as unset (R21).
- **R97 — The note reopens once if it was never seen, and asks to be pinned (S2).** It amends REL-CON-02's "never reopens".
  - The note page records `upgradeNote.seen` the first time it's actually visible (`document.visibilityState` is "visible").
  - At the next browser start (`runtime.onStartup`, not a mere restart of the background), if the note is still pending and was never seen, the background opens it once more, again in a background tab, and sets `upgradeNote.reopened`. It never opens a third time. A note that was seen never reopens. The badge and the popup's **Review** stay either way.
  - The note gains a line under its first paragraph: "**Pin Playlist Pigeon to your toolbar** to see when it needs you: click the Extensions button (the puzzle piece), then ⚙ › Pin to Toolbar." (PROVISIONAL with the name.) *Now "**Pin Perchling to your toolbar**" (R142).*
- **R98 — The note's tab title names the old name (S3).** It's "YouTube Playlist Tools is now Playlist Pigeon" (PROVISIONAL with the name), not "Playlist Pigeon 2.0". *Now "YouTube Playlist Tools is now Perchling" (R142).*

### Budgets

- **R99 — Budgets after R84–R98 ([ticket 24](../issues/24-performance-budget.md)).** No budget number changes.
  - **YouTube Music (R85):** the four actions add an estimated 1–1.5 KB to `feature-music-actions.js` (four icons and handlers), four bindings to `feature-music-keys.js`, and two small jobs to `page-music.js`. They're rebalanced within YouTube Music's 43 KB total (Q-PERF-16); the measured eager build is 35.2 KB. If they still don't fit, their code moves to a lazy file loaded the first time one of them is used. The total doesn't change.
  - **Keys from any tab (R88) and the browser menu (R91)** register nothing, so they add nothing eager to any page. In use, they inject the page half, core and kit, which have their own budgets. Their background code counts toward the background's 25 KB (PROVISIONAL).
  - **Recent adds (R86):** the popup's first view gains only the header button. The list is a lazy chunk (≤ 45 KB, expected under 4 KB). The YouTube Music popup has 0.6 KB of headroom, so Q-PERF-32's matching-cut rule applies; R93 moves copy out of the JavaScript into `messages.json`, which isn't counted, and is expected to cover it.
  - **The popup's feature rows:** R91 adds one row to the YouTube tab; R88 adds none.
  - **The toolbar tick and "paused" (R92)** are background code only.
## Running costs (R100–R117)

Settled 2026-10-20 for [ticket 33](../issues/33-resource-mindful-defaults.md), from the user's requirement that "with all of the automatic options added the default should be very mindful of browser resources and should never ever degrade the performance of the browser". The principle was the user's, so these settle only what follows from it. The evidence and measurements are in [`docs/research/running-costs.md`](../../../docs/research/running-costs.md), and the principle is [ADR-0012](../../../docs/adr/0012-automatic-work-is-event-driven-scoped-and-paced.md). Where these amend a requirement, it keeps its ID and ends with the R-number.

### The principle and the budgets

- **R100 — Automatic work is event-driven, scoped and paced** (ADR-0012). It runs only on an event it needs, only in the tabs that need it, never on a clock. It never turns a hot event into a message or a write, it yields to the page, and it's measured. Anything that can't meet a budget needs a measured exception, recorded in the spec with its number. No 2.0 feature needs a schedule, so 2.0 sets no alarm. Chapter 04 states it for features (FT-61); chapter 07 holds the numbers (§7.6.8).
- **R101 — Running-cost budgets** (07 §7.6.8, Q-PERF-45 to Q-PERF-58). They cover idle pages, playback (visible and hidden), long tasks, observers, hidden tabs, background wakes, work per wake, storage, requests nobody asked for, memory, and tabs that need nothing. Counts gate in both browsers; times gate in Chromium, as for load (Q-PERF-41). Q-PERF-30's five idle seconds become 60 s, hidden tabs and playback included.
- **R102 — Enforcement.** A `running-cost` guard on the source (Q-TEST-46), a static `check:runtime` on the store builds beside `check:budget` (Q-PERF-60, Q-CI-19), soaks in layer 3 with fake timers and in layer 4 in both browsers (Q-TEST-47, Q-TEST-48), and a running-cost check before each release (REL-CHK-27, Q-PERF-63). The live-check build fails if Firefox reports us slow (Q-PERF-64).
- **R103 — The background's listeners and timers** (ARC-MOD-39). A fixed list of listeners, none of them an event every tab or window fires. No interval and no alarm. One-shot timers only as an event's follow-up, at most 25 s; longer waits are timestamps.
- **R104 — Hidden tabs** (FT-62, Q-PERF-50). In a hidden tab only auto-add's counting runs, while a video plays. Discarded and frozen tabs are never woken, reloaded, injected into or messaged.

### Defaults that change

- **R105 — Watch progress is saved at checkpoints** (amends DATA-27 and 06's watch tracker). It's saved on leaving the video or closing the tab; on pause, end or hiding unless the last save was under a minute ago; and after 5 minutes of continuous playback. Nothing is saved when nothing new was played. Before, it was every 60 s: a background wake a minute per playing tab, each rewriting the account's whole record. A crash now loses at most 5 minutes of counting instead of 1.
  - A save rewrites one of 16 shards of the account's progress, not all of it (DATA-56; amends DATA-24 and 04 §4.3's `progress:<acct>` row), so its cost doesn't grow with the history.
- **R106 — Auto-add listens only while a goal is left** (YT-AA-44 to YT-AA-46, ARC-ACC-71). Once every playlist that takes the video has reached its goal in this playback, the tracker stops listening, so the rest of the video costs nothing. In a hidden tab it only counts. A reading never turns into a message or a write.
- **R107 — Progress isn't read on every wake** (amends DATA-26). Expired entries are pruned when the account's progress is next written, at most once a day. Before, every background start read and pruned all progress, whatever woke it.
- **R108 — Storage writes and listeners** (DATA-57, SYNC-27, Q-PERF-54). No write without a change. A sync push is one `set()` for every changed document, and an unchanged document is never pushed, so two browsers can't push back and forth. No page script listens to `storage.onChanged`; the background listens to the sync area only.
- **R109 — Cheap starts and paced injection** (ARC-MOD-37, ARC-MAN-22). A routine start makes at most 2 storage reads and registers nothing when nothing changed. Injecting into open tabs (switching a feature on, an update) goes one tab at a time, the active tab first, skipping discarded and frozen tabs.
- **R110 — Tabs and messages** (ARC-ACC-70, ARC-MSG-13, ARC-MSG-14). `tab.hello` once per page load; the registry capped at 200 tabs and cleaned without tab events; at most 3 pings and one injected core per job; a view pushed only to tabs whose view changed, at most every 250 ms; hot events never become messages.
- **R111 — Breakage checks in hidden tabs** (HEALTH-28). The anchor check waits until the tab is shown. Signals go out at most every 5 s per tab, and are written at most every 10 s, capped at 200.
- **R112 — The toolbar icon** (ARC-MOD-38), for R92's tick and "paused". `browser.action` is called only when the badge changes. "Every tab" states, paused included, use the tab-less value in one call. Per-tab states need no tab listener: the browser clears them on a full navigation, and a ticked tab sends one `tab.videoChanged` when its video changes in-app. Pausing clears the ticks so "paused" shows. Badge text and colour, not changing images.
- **R113 — The browser menu and keys from any tab** (ARC-MAN-23), for R88 and R91. Menu entries are created on switch-on and after an update, scoped by URL patterns, and never use `menus.onShown`, which in Firefox would wake the background on every right-click anywhere. One command listener, which returns after one read while the feature is off.
- **R114 — YouTube Music's state** (YM-Q-14, YM-BAR-9, YM-POP-14, ARC-ACC-71). The queue growth check re-reads on the app's own change, else at most 6 times with back-off within its 10 s. The player-bar Save follows the song only while it's drawn. Playing now reads when the popup opens, never while it's closed.
- **R115 — In-page UI is paced and bounded** (UI-RULE-44). Per-item state capped at 200 items; resize and scroll work at most once a frame; attribute observers name their attributes; no subtree observer on the app root (`ytd-app`, `ytmusic-app`), because the YouTube Music rough build's one was its only work while nothing was clicked, about 6–7 ms a minute during playback (Q-PERF-49); nothing connected or measured in a hidden tab.
- **R116 — Requests nobody asked for are a closed list** (Q-PERF-55, ACC-46): auto-add's membership read and adds at a goal, the 24 h label check, the claim check (now once per account per browser session, so it no longer fetches on every page load), and automatic gathering into a playlist if the user picks it.

### For ticket 31

- **R117 — Constraints on automatic triggers** (Q-PERF-58). Whichever trigger the user picks for automatic gathering, it is event-driven (no alarm or timer that checks tabs; conditions over time are evaluated when something else wakes the background), adds no browser-wide listener or permission with a warning (new YouTube tabs are learnt from our own page code, which says whether the page started hidden), reads tabs without waking them, gathers once per burst and at most once a minute per window, sends no request per tab, closes tabs in one call, costs nothing while off, and stays within 20 ms of background time with 50 tabs. Closing a window can't meet these: by then the browser reports only the window's ID.

### Already compliant

These settled behaviours already follow ADR-0012 and don't change: no polling and no WXT `locationchange` (Q-PERF-25, FT-22); tab recency from `lastAccessed` with no tab events (ARC-ACC-57); routing never wakes a tab (ARC-ACC-56); one-shot messages, no ports (ARC-MSG-04); content scripts never read storage (ARC-MOD-24); delegated pointer and focus listeners and no document-wide observer (Q-PERF-26, Q-PERF-27, UI-RULE-37); toasts wait while hidden (YT-ADD-20); sync's 2 s / 5 s push pace (SYNC-06); one request per user intent, no prefetch, and no membership or channel cache (ARC-ACC-43, DATA-22, DATA-23); breakage probes only at page load and before acting (Q-PERF-30); keys from any tab and the browser menu register no page code (R88, R91, R99); off means zero (Q-PERF-5).

## GatherTube (R120–R139)

Settled 2026-10-20 for [ticket 31](../issues/31-gathertube.md). The user decided to port every capability of [GatherTube](https://github.com/karimelgazar/gathertube) (MIT, by Karim Elgazar) as one opt-in feature, with exactly two additions (a playlist to gather into, and an automatic option), credit, YouTube's queue in place of its embedded player, a Shuffled order so its shuffle survives, all three automatic triggers, and closing whatever automatic gathering saved. These resolutions settle the rest within the user's principles and the running-cost rules (R100–R117, [ADR-0012](../../../docs/adr/0012-automatic-work-is-event-driven-scoped-and-paced.md)). The research is [`docs/research/gathertube.md`](../../../docs/research/gathertube.md). Where these amend a requirement, it keeps its ID and ends with the R-number. The behaviour is [02 §2.16](02-youtube.md#216-gather-tabs).

### The feature and what it reads

- **R120 — Gather tabs, one opt-in feature** (YT-GT-01, FT-01, PAR-NEW-42).
  - **Gather tabs** (`gather`) is a YouTube feature, off until the user picks it. Its footprint tag is "Doesn't change the page", and its Show feedback is **on**. It has a row in the popup's YouTube tab, a card in Settings › YouTube and a row at first run. 2.0 now has twelve features.
  - It ports every GatherTube 1.1.0 capability, option and setting, as the research's §4.2 maps them; [09 §4](09-parity.md#4-gathertube) lists every item. The two additions are the gather playlist (R125) and automatic gathering (R128). The Shuffled order (R122) is the user's own answer. Nothing else is added: the research's §10 list stays out.
  - Nothing of GatherTube's is copied: no code, strings, logo or icons. Credit is visible anyway (R138).
- **R121 — What a gather reads** (YT-GT-03 to YT-GT-07, ARC-ACC-72).
  - A **video tab** is a tab on a youtube.com watch page (`/watch?v=ID`) or live page (`/live/ID`), or on a music.youtube.com watch page while the YouTube Music section is on and has site access. Only the address counts: GatherTube's title fallback is dropped, because it gathered, and could close, tabs that weren't videos.
  - Not gathered: Shorts, embeds, channels, playlists, feeds and search; m.youtube.com (out of scope, and Chrome's host access can't see it); a `youtu.be` tab that hasn't reached youtube.com yet; and tabs parked by a suspender extension, which would need the `tabs` permission and its "Read your browsing history" warning (the user's answer 4).
  - A gather reads one window, the popup's, passed explicitly. Its tabs come from one `tabs.query({ windowId, url })` with host access, so no permission is added.
  - It never messages, injects into, activates, reloads or un-discards a gathered tab. Sleeping tabs are gathered as they are.
  - One video per ID: the first after ordering. Every tab of that video closes with it.
- **R122 — Gather orders** (YT-GT-08 to YT-GT-10).
  - GatherTube's six orders, with its default, Newest tabs first, plus **Shuffled**: a new random order each gather, standing in for the embedded player's Shuffle (the user's answer 1).
  - English first and non-English first use the browser's own language detection (`i18n.detectLanguage`) on each title, without YouTube's " - YouTube" or " - YouTube Music" ending and its "(3) " count. Tabs fall into three groups: English, no answer, then other languages (reversed for non-English first). Within a group they keep their left-to-right order. GatherTube's own test counted Spanish, German and French titles as English.

### Destinations and closing

- **R123 — Three destinations** (YT-GT-11 to YT-GT-14, ARC-ACC-74, ARC-ACC-75).
  - **YouTube's player** (the default): up to 50 videos open as YouTube's own temporary list, through `watch_videos`, in a new active tab in that window, as GatherTube did. It needs no page code, no job and no sign-in.
  - **YouTube's queue** replaces GatherTube's embedded player (the user's answer 1): a new active tab on the first video, then the rest added to YouTube's queue with one command. A gather of more than 50 for YouTube's player goes here too, because YouTube keeps only the first 50 of a `watch_videos` list and drops the rest silently. Up to 200 videos a gather; beyond that the rest stay open. PROVISIONAL (ticket 25: G3; 100 were tested signed out).
  - **A playlist:** the account's gather playlist (R125), through the add flow (R126). It opens nothing.
  - The embedded player page isn't rebuilt in any form. Extension pages get YouTube's Error 153, and embedding would bring all of 2.0 under YouTube's API policies, which forbid the internal requests it's built on ([ADR-0001](../../../docs/adr/0001-youtube-access-through-the-users-session.md)). Its keys don't come back either: YouTube's own Shift+N and Shift+P step through its list, and 2.0 adds no keys on YouTube's pages for this.
- **R124 — Closing gathered tabs** (YT-GT-17, ARC-ACC-76).
  - **Close gathered tabs** is an option, off by default, for the gathers the user starts. Automatic gathering always closes what it saved (R128).
  - A tab closes only once its video is confirmed in the destination: YouTube's player tab shows its list (`list=` in its address within 10 s); YouTube's queue holds every video sent; the playlist answered *added* or *already in*. Otherwise that video's tabs stay open, and the result says so. This fixes GatherTube losing videos past 50.
  - Every tab a gather closes goes in one `tabs.remove` call.
  - Like GatherTube, a gather the user starts closes every gathered tab, the one they're on included.

### The gather playlist

- **R125 — One gather playlist per account** (YT-GT-15, YT-GT-16, ACC-06, DATA-12, UI-PICK-27).
  - It's an account-setup choice ([ADR-0003](../../../docs/adr/0003-account-setups-keyed-by-datasync-id.md)): `Setup.gather`, which syncs with the setup. It's chosen with the usual chooser, Watch later and New playlist included. Missing and Full marks apply, with the "!" and **Remove**, as for any chosen playlist.
  - Gathering into a playlist, or switching an automatic option on, with no gather playlist for the account in view opens the chooser first, with "Choose a gather playlist for {Account} first."
  - A private window can't change it, because it's a setup edit. Its chooser is disabled there, with "The gather playlist can't be changed in a private window."
  - A setup holding only a gather playlist isn't empty (DATA-16).
- **R126 — A gather into a playlist is one batch through the add flow** (YT-GT-18 to YT-GT-20, ARC-ACC-73, the `addBatch` job).
  - **Order of checks:** signed in → the account has a gather playlist → the membership read and account guard, one video at a time, because a read of several videos only says whether *all* of them are in → the rest added in gather order, up to 50 per request, PROVISIONAL (ticket 25: G1, G2) → one report.
  - **Outcomes** per video: *added*, *already in* or *failed*. Never a second copy. New videos are appended at the end of the playlist, in gather order.
  - The coordinator's locks, the 60 s pause after a 429, and Missing and Full apply as to any add (YT-ADD-36, YT-ADD-37, YT-ADD-40).
  - It runs from one serving tab. Q-PERF-58's "no request per tab" means that requests never go through the gathered tabs and never one per tab: tabs of one video share one read, and the adds go in batches. Membership is still read once per video, as for every add (YT-ADD-06).
  - A gather the user starts may serve from one of the gathered tabs, which then closes last. Automatic gathering never does (R132).
  - Progress shows for long gathers. The popup may close; the gather still finishes.
- **R127 — Undo** (YT-GT-21, ARC-ACC-76).
  - It's offered for a gather into a playlist. It removes exactly the entries that gather added, by `setVideoId`, in batches, after one membership read for the account guard. Then it reopens the tabs the gather closed, at their old places in their window, in the background, or in a new window if that one has closed. Firefox reopens them unloaded; Chrome loads them, and YouTube holds their video until they're shown. PROVISIONAL (ticket 25: G7).
  - Tabs that Undo reopened are left out of automatic gathering until they're switched to, as undoing an auto-add sets a session skip.
  - Undo is kept for the last 5 gathers, until the browser closes. The popup row and the Settings card offer it for the newest; a gather's own toast offers it for that gather.
  - A gather into YouTube's player or queue has no Undo, as in GatherTube: the videos are safe in the list.

### Automatic gathering

- **R128 — Automatic gathering: three triggers, each its own choice** (YT-GT-22, FT-64).
  - The user chose all three, each a separate opt-in inside Gather tabs, all **off** by default: video tabs left unvisited for a while (R129), a video tab opened in the background (R130), and a window reaching N video tabs (R131).
  - Each saves into the gather playlist only, whatever destination the user's own gathers use, and always closes what it saved. It never opens a tab.
  - It's the second add path without an explicit user action, after auto-add. The glossary's Auto-add entry now says so. It's the fourth named request nobody clicked for (Q-PERF-55, item 4).
  - The window-close trigger is out: by then the browser reports only the window's ID (R117).
- **R129 — Unvisited for a while** (YT-GT-23).
  - Video tabs not switched to for at least the chosen time: 1 hour, **1 day** (the default) or 1 week. A tab never switched to counts from when it was opened (`lastAccessed`).
  - No alarm or timer checks it. This supersedes the research's "checked by one hourly alarm", which R117 rules out. It's checked when something already wakes the background: our page code loading in a YouTube tab (`tab.hello`), the popup or Settings opening, or the browser starting (`runtime.onStartup`). At most once a minute, across every normal window, with one `tabs.query`.
  - So it can run late, by hours if nothing wakes the background. The user accepts that, and the option says it plainly.
- **R130 — Opened in the background** (YT-GT-24, FT-63, ARC-MSG-15).
  - A video tab whose page started hidden, on its first load in that tab, is gathered a quiet second after it loads, if it still hasn't been switched to.
  - It's learnt from our own page code: the site core's `tab.hello` carries `hidden` (hidden from the page's start until the core started) and `fresh` (a first load, not a reload or a history step) (R133).
  - Tabs the browser restores are never tabs opened in the background: it ignores tabs that load in the first minute after the browser starts, and any tab switched to since its page started. How restored and reloaded tabs report themselves is PROVISIONAL (ticket 25: G6).
  - Middle-clicking a video then files it into the gather playlist and closes its tab. The option says so.
- **R131 — A window reaching N video tabs** (YT-GT-25).
  - When a video tab loads and its window then holds N or more video tabs that automatic gathering may take (R132), it gathers all of them. The tab the user is on stays.
  - **N defaults to 10,** from 5, 10, 15, 20, 30 and 50. Ten is well above the few videos someone opens to watch next, so ordinary browsing never trips it, and it's a fifth of the 50 one round takes, so a gather stays one batch. GatherTube had no count to follow.
  - It's checked only when a video tab loads, never on a clock and never when the popup opens. A window already over N is gathered when its next video tab loads.
- **R132 — Exclusions, pace and bounds** (YT-GT-26 to YT-GT-30, Q-PERF-66).
  - **Never gathered automatically:** the active tab of any window, pinned tabs, tabs playing sound, anything in a private window, tabs a gather's Undo reopened (until they're switched to), and videos that failed this session for a lasting reason, such as made for kids. Those tabs stay open.
  - **Pace:** one gather per window per burst, a quiet second after its last new video tab and at most 10 s after the first (one-shot timers); at most one gather a minute per window. A burst inside that minute waits for the next wake after it. At most 50 videos a round; the rest wait for the next round.
  - **Which tab and account:** it saves from a signed-in YouTube tab that isn't being gathered: the focused window's active tab first, then the gathering window's YouTube tabs, then other normal windows', most recently used first. That tab's account's gather playlist receives the videos. An account with no gather playlist is passed over. A gather playlist marked Missing or Full pauses automatic gathering for its account until the mark clears. With no such tab, nothing is gathered and nothing closes, and the popup row says it's waiting.
  - **Requests:** through the add flow, from that one tab (R126): at most 50 membership reads and two batched adds a round.

### Page code, feedback and data

- **R133 — Page code for triggers 2 and 3** (FT-63, ARC-MAN-24, ARC-REG-11, ARC-MOD-39).
  - While trigger 2 or 3 is on, Gather tabs needs the site core in video tabs, and nothing else. Its registry entry has no file of its own, needs no kit, and matches only `https://www.youtube.com/watch*` and `https://www.youtube.com/live/*`. The registrar registers the page half and the core for those pages, unless another YouTube feature already registers them for every page. Trigger 1 alone registers nothing.
  - Switching trigger 2 or 3 on injects nothing into open tabs: only tabs that load afterwards matter. Switching both off unregisters the entry, and open tabs keep the inert core until they reload.
  - The core's `tab.hello` gains `hidden` and `fresh`: two reads at start, with no listener, sent once per page load as before.
  - The background listens to `runtime.onStartup`, which R97's upgrade note already needs. ARC-MOD-39 now lists it, which settles its difference with R97. It wakes the background once per browser start, and returns after one storage read when neither the note nor trigger 1 needs it.
  - The footprint tag stays "Doesn't change the page": the core draws nothing.
  - No new budget row: with Gather tabs the only YouTube page need, video tabs load the page half and the core (10 KB, within their rows) and nothing else.
- **R134 — Where a gather's result shows** (YT-GT-31 to YT-GT-33, UI-POP-37, UI-TOAST-17).
  - **A gather started in the popup** answers in its row, never as a toast: progress, the result, failures and Undo. The row's result is the control's own state, so Show feedback never hides it.
  - **When the popup has closed first,** because YouTube's player or queue opened a tab or a long playlist gather outlasted it, **and for every automatic gather:**
    - a gather into a playlist shows the add flow's toast, with Undo, in the tab it saved from. The serving tab is picked visible first (R132), so the toast usually shows at once; otherwise it waits until that tab is visible (YT-ADD-20). An automatic gather's toast carries the extension's mark and waits while fullscreen (YT-ADD-17, YT-ADD-21);
    - the toolbar icon of the focused tab shows a ✓ or ✕ for 3 s, with the result as its tooltip, when the gathering window is focused. It's keys from any tab's mark (R88); the ✓ follows Show feedback and the ✕ always shows;
    - the popup row and the Settings card show the result and Undo as "Last gather", until the next gather or the browser closes;
    - a gather into a playlist is one Recent adds entry (R86).
  - Failures always show; only confirmations follow Show feedback. Automatic gathering's repeated failures are limited as auto-add's are (YT-ADD-25).
  - Gather tabs raises no "!" of its own. A Missing or Full gather playlist raises the existing one.
- **R135 — Settings and data** (DATA-03, DATA-05, DATA-11, DATA-12, DATA-58, ACC-47).
  - **Shared settings** (`gather`): on, Show feedback, the destination, the order, Close gathered tabs, and the three automatic options with their time and count. They sync with the other shared settings ([ADR-0006](../../../docs/adr/0006-local-truth-sync-copies-documents.md)), so an automatic option switched on in one browser also runs in the others, after their own consent.
  - **Account setup:** the gather playlist (R125). It syncs.
  - **Session memory** (`gather` in `storage.session`): the last 5 gathers for Undo (what was added and which tabs closed), each window's last gather time, the tabs Undo reopened, and the videos that failed for a lasting reason. It's written once per gather or Undo, never on a check that gathers nothing, never synced, and gone when the browser closes.
  - **Private windows:** a gather there keeps its Undo in the background's memory only, and nothing from it reaches storage or Recent adds. Automatic gathering never runs there, and never counts their tabs.
  - Clear all data removes all of it. Removing a setup removes its gather playlist and its session entries.

### Breakage, copy, release and budgets

- **R136 — Breakage and live checks** (HEALTH-29, Q-WATCH-8, Q-WATCH-35, Q-FIX-5, 06 §6.2.15).
  - Gather tabs' status follows its destinations: *partly working* while YouTube's queue or the playlist route isn't working, *not working* while YouTube's player isn't. A YouTube's player tab that shows no list is a `no-effect` signal.
  - The watch list gains `watch_videos` and its 50-video cap, the queue command carrying a list, and `edit_playlist` with several actions. The static watch checks `watch_videos` signed out.
  - Ticket 25 gains G1 to G7: batched adds (G1), a video already in a batch (G2), YouTube's queue built with one command, signed in, and how many it takes (G3), `watch_videos` signed in (G4), batched removals (G5), how tabs opened in the background, restored and reloaded report themselves, and whether `lastAccessed` survives a restart (G6), and reopening tabs for Undo (G7).
- **R137 — Copy** (YT-GT-01, YT-GT-32, YT-GT-33, 05 §5.2 to §5.4). The popup row, its unfolded options, the Settings card, the first-run row, results, errors and the credit line are written in the existing voice. GatherTube's order names are kept ("Newest tabs first"), "Gather into" names the destination, and the triggers read as plain choices ("Save and close video tabs I haven't switched to for a day"). Trigger 1 says it can run late.
- **R138 — Release and credit** (REL-CON-12, REL-STORE-17, REL-STORE-20, REL-STORE-21, REL-STORE-38, REL-STORE-39).
  - **Credit:** "Based on GatherTube by Karim Elgazar", linking to its repository, on the feature's Settings card; a line in Settings › About; both store descriptions; the 2.0.0 release notes; and, at release, `docs/features.md` and the README's credits. "GatherTube" appears only as credit, never as the feature's name or icon. No licence notice is needed, because nothing is copied; if code ever is, `THIRD-PARTY-NOTICES.md` carries GatherTube's MIT text.
  - **The disclosure** gains a bullet for reading a window's YouTube tabs and closing them, and "when auto-add or automatic gathering does". 2.0 hasn't shipped, so consent stays version 1.
  - **The privacy policy** says what a gather reads, and that only video IDs leave the browser, to YouTube.
  - **The listings:** one Gather tabs bullet at the end of "On YouTube", with the credit. The lead and the summaries don't change (R95).
  - **Chrome's single purpose** still holds: gathering puts the user's YouTube videos into their own playlists and queue. Its wording now names gathering, so a reviewer finds it there. The host permission's justification names reading YouTube tabs' addresses and titles.
  - **AMO's reviewer notes** describe gathering: no `tabs` permission, host access only, and page code on video pages only while trigger 2 or 3 is on.
- **R139 — Budgets and tests** (Q-PERF-51, Q-PERF-58, Q-PERF-63, Q-PERF-65 to Q-PERF-67, Q-TEST-14, Q-TEST-49, Q-TEST-50).
  - No budget number changes. The popup's first view gains one row, a few hundred bytes. The unfolded options and the Settings card are lazy chunks under 45 KB. The background code (gathering, ordering and the triggers), an estimated 3–4 KB gzip, counts toward the background's 25 KB (PROVISIONAL).
  - **Running cost:** off, or on with no trigger, nothing runs and nothing is registered; trigger 1 adds at most one `tabs.query` a minute to wakes that happen anyway; triggers 2 and 3 add no wake beyond `tab.hello`; a gather of 50 tabs takes at most 20 ms of background time; one session write per gather.
  - Q-PERF-51 lists the browser start. Q-PERF-58's rule 5 names YouTube's player, which is what opens `watch_videos`; automatic gathering never uses it. The release check's session opens video tabs in the background with every automatic option on.
  - **Tests:** layers 1 and 3 for the rules and triggers over the fake tabs, and layer 4 for tabs opened in the background, restored tabs, closing in one call, and the 20 ms.

## The icon: Perch (R140)

The user picked **Perch** on 2026-10-20 from [ticket 34](../issues/34-icon.md)'s five concepts. The name is still pending ([ticket 22](../issues/22-name.md)), so the mark has no wordmark yet. *(The name was settled later that day: Perchling for YouTube™, [R141](#the-name-perchling-r141r144).)*

- **R140 — The mark and the toolbar icon are Perch** (UI-BRAND-03, UI-BRAND-04, UI-BRAND-06, UI-BRAND-08, UI-BRAND-09, the token table; ARC-MAN-01's `icons` and `action`, 06 §6.10 and `wxt.config.ts`; 08 §9.1, REL-STORE-08, REL-STORE-11, REL-STORE-40; PAR-CAP-46).
  - **What it is:** a grey pigeon perched on top of a small cabinet of pigeonholes, not in one. The bird has a grey head and body, a folded wing, a tail over the ledge's edge, and the teal-to-violet gradient on its neck. It stands on a teal ledge over a light-violet cabinet of 3×2 pigeonholes holding cards. At 16 px it's a separate drawing with one row of three pigeonholes and a solid teal band over a violet one for the neck.
  - **Why it replaces the provisional pigeon:** ticket 15's slate side-view pigeon, with a wing of light lines, was close to PigeonPod's logo, a slate pigeon with a striped white wing. Perch's bird has no patterned wing, and the cabinet carries the pigeonhole idea.
  - **Files:** `assets/icon/` holds the sources, the exports, a README that maps each file to the build and the stores, and the sheet (`sheet.html`, with its light and dark renders). The sources are:
    - `icon.svg`, the master, used for 48 px and up;
    - `icon-16.svg` and `icon-32.svg`, drawn on their own pixel grids;
    - `icon-mono.svg`, the monochrome mark for pages.
  - **Built from those files, not generated:**
    - `@wxt-dev/auto-icons` leaves the build, because it scales one image over the hand-tuned 16 and 32 px.
    - The manifests name the PNGs per browser. Chrome's 128 is `store-128.png`, with 16 px of transparent padding; Firefox's is full bleed, plus a 96. `action.default_icon` is 16, 24 and 32 on both.
    - The PNGs sit in `brand/` in the public directory. `wxt.config.ts` sets `publicDir: "src/public"`, which §6.10's `src/public/_locales/` already assumed: WXT's default is the project root's `public/`, found while placing the icons.
  - **One drawing for light and dark:**
    - The silhouette's colours sit near 3:1 on Chrome's and Firefox's light and dark toolbars. The cabinet is a light tint of brand violet, `#8E74E2`, because brand violet falls to 2.3:1 on Chrome's dark toolbar.
    - There's no dark variant. Chrome can't switch, Firefox's `context-fill` is reserved for Mozilla's extensions, and a Firefox-only `theme_icons` pair would gain little.
  - **The gradient** stays in UI-BRAND-06's first place, the mark's neck, from 32 px up. The rest of the mark is flat.
  - **Badges** don't change (UI-IA-08). The pigeon's head sits top-left, clear of Chrome's bottom-right badge and Firefox's top-right one.
  - **Store icons:** Chrome takes `store-128.png` from the manifest. AMO's listing icon is a separate Developer Hub upload, `amo-128.png`, which AMO keeps at 32, 64 and 128.

## The name: Perchling (R141–R144)

The user chose **Perchling for YouTube™** on 2026-10-20, after five naming rounds ([ticket 22](../issues/22-name.md); [ADR-0013](../../../docs/adr/0013-named-perchling-for-youtube.md)). It replaces the provisional "Playlist Pigeon" everywhere the spec states current copy. The strings R90, R97 and R98 wrote change with it; nothing else in them does.

- **R141 — The name is Perchling for YouTube™** (UI-BRAND-01, ARC-MAN-01's `name` and `short_name`, `{Product}` in 02 to 04, 08 §0 and §9.1, REL-STORE-16, PAR-CAP-46).
  - **The manifest `name` and both store names:** "Perchling for YouTube™", 22 characters, well under AMO's 50 and Chrome's 75. AMO's listing name is also edited in the Developer Hub, as before.
  - **`short_name`:** "Perchling", 9 characters, within Chrome's recommended 12.
  - **In the product:** "Perchling", with no ™ where YouTube isn't named. It's what `{Product}` stands for in every chapter (R65).
  - **Unchanged:** AMO's slug `youtube-playlist-tools`, the gecko ID, the repo's name and the Pages URL ([ADR-0011](../../../docs/adr/0011-betas-from-github-pages.md)).
  - **A custom domain** stays optional (REL-STORE-16). `perchling.app` was free on 2026-10-20; `perchling.com` is taken.
  - **The glossary's title** is "Perchling (formerly YouTube Playlist Tools)". The name stays out of its body, because it's a product name, not a domain term.
- **R142 — The copy that carries the name** (REL-CON-02, REL-CON-04, REL-CON-12, REL-CON-15, REL-CON-18, 08 §2.11 and §5, REL-STORE-06, REL-STORE-09, REL-STORE-17, REL-STORE-20, REL-STORE-21, REL-STORE-27, 08 §9.2; UI-POP-06, UI-POP-10, UI-POP-36, UI-SET-01, UI-SET-16, UI-SET-18, UI-ONB-03, UI-ONB-04, UI-ONB-06, UI-ONB-08, UI-YT-18, UI-YT-22; DATA-53).
  - "Playlist Pigeon for YouTube™" becomes "Perchling for YouTube™", and "Playlist Pigeon" becomes "Perchling". The rest of each line stays as it was.
  - **The upgrade note's tab title and heading** (R98): "YouTube Playlist Tools is now Perchling".
  - **The Pin line** (R97): "**Pin Perchling to your toolbar** to see when it needs you: click the Extensions button (the puzzle piece), then ⚙ › Pin to Toolbar."
  - **Why the new name:** "…so YouTube Playlist Tools is now Perchling for YouTube™. It's the same add-on, and your settings came along."
  - **The privacy policy's title:** "Privacy policy: Perchling for YouTube™". It covers "the Perchling for YouTube™ browser extension (formerly YouTube Playlist Tools)".
  - **The 2.0.0 release notes:** "2.0 is a rebuild, and YouTube Playlist Tools is now Perchling for YouTube™."
  - **AMO's reviewer notes:** "…renamed Perchling for YouTube™ (same ID and slug)". `SOURCE_CODE_REVIEW.md` is titled "Building Perchling for YouTube™ from source".
  - **The prompts:** Firefox's install header is "Add Perchling for YouTube™"; Chrome's is Add "Perchling for YouTube™"?.
  - **The settings file** (R90): `perchling-settings-{YYYY-MM-DD}.json`.
  - **The screenshots' demo account** (REL-STORE-09): "Perchling Demo".
  - **Consent stays version 1.** The disclosure changes only in the name, and 2.0 hasn't shipped (REL-CON-17).
- **R143 — The listing text keeps R95's lead** (§9.1, REL-STORE-02, REL-STORE-03, REL-STORE-11).
  - **"Playlist" comes early.** The name doesn't say it, so the summaries must. AMO's has it at character 43 and Chrome's at 28, so neither changes.
  - **AMO's summary** stays: "Save YouTube videos to Watch Later or any playlist in one click or with a shortcut, auto-add the videos you actually watch, and get one-click Play next and Add to queue on YouTube Music. Every feature is opt-in. (Formerly YouTube Playlist Tools.)" (246 of 250).
  - **Chrome's `description`** stays: "Save to Watch Later or any playlist in one click or a shortcut, auto-add what you actually watch, and Add to queue on YouTube Music." (132 of 132). Its shorter form, "…and queue on YouTube Music.", is 125 characters, not 130 as R95 said.
  - **"Formerly YouTube Playlist Tools"** stays on AMO through 2.x (REL-STORE-02). Chrome has no "formerly" line, because 1.x was never on Chrome.
  - **The attribution lines** stay exactly as written (REL-STORE-03). They name Google's marks, not ours, so the name doesn't touch them.
  - **The promo tile** shows Perch and the name (REL-STORE-11).
- **R144 — A professional trademark search before launch** (REL-CHK-04, REL-CHK-18, REL-CHK-25).
  - **Why:** round 5 couldn't check the EU. TMview and EUIPO were blocked, and UKIPO, DPMA, IP Australia, Singapore and WIPO's Global Brand Database weren't checked either. "Perchling" also reads close to the "Perch" brands, one with a registered US mark for organising saved content.
  - **What:** a professional search covers those registers, the EU above all. It replaces "ticket 22 is confirmed" in the launch criteria. It's best done before the first beta, because the Chrome item and the beta testers already show the name.
  - **If it finds a blocking mark,** the user picks again from round 5's finalists. Pigeon Shelf has no "Perch" overlap at all, and Pigeon Perch only a low one. The swap stays mechanical: `{Product}` in chapters 02 to 04, and the strings 08 §0 lists.

## Wordmark and store images (R145–R147)

The name was decided as "Perchling for YouTube™" (short form "Perchling"; [ticket 22](../issues/22-name.md)), which unblocked the wordmark and the images that carry it. The files and their notes are in [`assets/brand/`](../../../assets/brand/README.md).

- **R145 — The wordmark** (UI-BRAND-10, UI-BRAND-11).
  - **The face:** "Perchling" in Nunito ExtraBold, weight 800, version 3.602. It's under the SIL Open Font License 1.1, from google/fonts, and converted to outlines. Only outlines ship; the font file isn't redistributed.
  - **Why Nunito:** the spec names no brand typeface, and the UI bundles none. Nunito's rounded stroke ends match Perch's round head and soft corners, and its even letterforms stay tidy and legible at small sizes. Rubik was the runner-up.
  - **The details:** light hand kerning, the i's dot in brand teal, ink `#262B36` on light, and paper `#F1F3F6` on dark. The lockup sets the icon beside the wordmark, the name's baseline level with the ledge.
  - **Where it appears:** images and documents only. The extension's pages keep writing the name as text in the system font stack, so nothing is bundled and no budget changes.
- **R146 — The store images** (REL-STORE-41, REL-STORE-42; amends REL-STORE-11's marquee sentence).
  - **Chrome Web Store:** the required 440 × 280 small promo tile and the optional 1400 × 560 marquee, both uploaded at launch.
  - **Google's image guidelines,** as they read on 2026-10-20: saturated colour filling the region, well-defined edges on the store's light grey, little or no text, no screenshot, and readable at half size.
  - **What they show:** the mark and the wordmark only, on a saturated violet (`#2B2170`), with a faint wall of pigeonholes behind.
  - **No YouTube:** no name, logo or red, so Google's branding guidelines don't apply, and no attribution line is needed on the images. The listing's name beside the tile carries "for YouTube™".
  - **AMO:** its listing takes only the icon and screenshots (Extension Workshop), so it gets no promotional images.
  - **Screenshots** still come from the release candidate at release (REL-STORE-07 to REL-STORE-10).
- **R147 — The GitHub social preview** (REL-STORE-43, §19).
  - A 1280 × 640 PNG, as GitHub recommends: the lockup, "for YouTube™" as plain text, and "Save to any playlist in one click."
  - It's the one image that writes the full name. It has no YouTube logo or red.
  - The user uploads it in the repository's settings; it's a one-time setup task.

## Releases from `main` (R148)

The user decided on 2026-10-21 that `dev` integrates and `main` releases ([ADR-0014](../../../docs/adr/0014-dev-integrates-main-releases-on-a-version-bump.md)). `dev` is the default branch, and every push to it builds dev builds: unsigned CI artifacts for the developer's own testing. A release is a version bump on `dev`, merged into `main`.

- **R148 — A push to `main` releases a new version; a pushed tag triggers nothing** (amends REL-CI-22, REL-CI-23, REL-CI-24, REL-CI-29, REL-CI-30, REL-CI-32, REL-CI-33, REL-CI-34, REL-CI-36, REL-CI-37, REL-CI-39, REL-CI-41, REL-CI-42, REL-CI-46, REL-CI-49, REL-CI-50, REL-CHK-04, REL-CHK-19, REL-CHK-26, REL-CHK-27, Q-CI-1, Q-CI-9, Q-CI-10, Q-CI-16, 08 §8.1's phase 2, §18 and §19; REL-CI-02 still holds).
  - **The trigger** (REL-CI-23): every push to `main`, and `workflow_dispatch` as a dry run only, which runs `meta` and `build` and never tags or submits.
    - The `stores` input is deferred: rejecting an environment holds that store for the run (REL-CI-47).
    - `allow_red_watch` and its `reason` return with the `watch` gate. A push-triggered run takes no inputs, so that ticket settles how the override is given.
  - **`meta` decides from tags only** (REL-CI-24), never from `github.event.before`, so force pushes, merges of several commits, an all-zero `before` and runs replaced in the concurrency queue can't confuse it.
    - **It releases only** on a push to `main` when the version is a strict `N.N.N`, `v{version}` doesn't exist, and the version is above the highest `v*` tag, compared numerically per part.
    - **With no `v*` tag yet,** the version must be exactly `1.99.1`. `1.5.0` is rejected outright (REL-CI-03).
    - **Otherwise it skips,** with the reason in the job summary. A version below the last release, or malformed, fails the run instead.
    - The kind is measured against the highest tag, or against 1.4.5 when there's none.
  - **The run creates the tag** (REL-CI-36). `github-release` runs after the gates and before the submit jobs. It makes the tag and the GitHub (pre-)release with `gh release create v{version} --target $GITHUB_SHA` and `GITHUB_TOKEN`. That's several requests, not one atomic step, so a re-run that finds the release checks its tag is the run's commit and finishes it: uploading the assets again and publishing the draft. A tag made with that token starts no other workflow.
    - So `submit-amo` attaches the signed beta `.xpi` to the existing pre-release itself, and needs `contents: write` too (REL-CI-32, REL-CI-37).
    - `submit-amo` and `submit-cws` lose the `stores` condition (REL-CI-29, REL-CI-33).
    - **Recovery** is "Re-run failed jobs", which keeps `meta`'s outputs and `build`'s artifact. "Re-run all jobs" isn't one: `meta` would see the tag and skip everything.
  - **A `main` ruleset replaces the `v*` tag ruleset** (REL-CI-49): PRs required, the CI `build` check required, no force pushes. The workflow's own token creates the tags.
  - **Hotfixes** (REL-CI-39, REL-CI-41, Q-CI-16): a PR from `hotfix/X.Y.Z`, cut from the last release tag, into `main`. Merging it releases the fix, and `main` is then merged back into `dev`.
  - **Branches:** `dev → main` is merged with a merge commit, never squashed. Dependabot's security updates land on `dev` and are promoted to `main` promptly; a merge with no version bump releases nothing.
  - **The §18 checklist:** "Tag `v{version}`" becomes "merge to `main` with the bumped version" in Every release, Beta, Hotfix and the 2.0 launch. "Tagged" in REL-CHK-04, REL-CHK-19, REL-CHK-26 and REL-CHK-27, "a release tag" in REL-CI-42, and "the tag" in the `live-check-record` gate's 7 days ([Q-CI-9](07-quality.md#773-release-gates-summary)) follow.
  - **The ARM `sources` job runs on pushes to `dev`** (REL-CI-22, Q-CI-1), since a push to `main` is now the release itself.
  - **AMO finds a GUID-style ID only with its braces** (checked against the live API on 2026-10-21: `{…}` answers 200, the bare GUID 404). publish-browser-extension 6.1.1 strips the braces, so `wxt submit` gets the slug `youtube-playlist-tools` (REL-CI-50). `scripts/amo-version.ts` and `web-ext` send the GUID with its braces. `release.yml` holds both, so the `amo` environment's `FIREFOX_EXTENSION_ID` variable goes (REL-CI-46).
  - **Store submissions are resumable** (REL-CI-30, REL-CI-32, REL-CI-34). `scripts/amo-version.ts status` reports a version as missing, created without its sources, or present. `submit-amo` uploads only a missing version, attaches the sources when they're missing, and then requires them. Chrome goes through `scripts/cws-submit.ts` instead of `wxt submit`: API v2 may answer an upload with `IN_PROGRESS` and expects `fetchStatus` to be polled, but publish-browser-extension (6.1.1 and 6.2.0) fails at once. The script also skips a version that's already submitted or published.
  - **Version parts are capped at 65535**, Chrome's limit, which also keeps `release-meta.sh`'s arithmetic exact. A version below the last release fails even if it was tagged once.
  - **What's built now:** the current `release.yml` is the pre-2.0 subset: `meta`, `build`, `github-release`, `submit-amo` and `submit-cws`. The `watch`, `live-check-record`, `budget`, `zip`, `browser`, `hotfix-freeze` and ARM `sources` gates are added by the 2.0 build tickets.

## Signed Firefox dev builds (R149)

The user asked on 2026-10-21 for CI to sign the dev builds, after first choosing unsigned temporary add-ons.

- **R149 — On `dev`, CI also signs the Firefox dev build on AMO's unlisted channel** (amends R148's "unsigned" dev builds, the glossary's **Dev build**, and REL-CI-18's `ci.yml` jobs).
  - **Job:** `ci.yml`'s `sign-firefox` runs after `build`, on pushes to `dev` only, and only while the repo variable `SIGN_DEV_BUILDS` is `true`. PRs aren't signed: fork PRs can't read secrets, and every signing uses up an AMO version number.
  - **Version:** `{package.json version}.{run number}`, for example `1.5.0.57`. AMO allows four parts (up to nine digits each), and release versions are always three, so the two never collide (REL-CI-05). The fourth part sorts just above the version it's built from, so a dev build of `1.99.2` sits between `1.99.2` and `1.99.3`. Only the copy that's signed gets this version; `check-manifests.sh` still sees `package.json`'s.
  - **What's signed is what was built:** the job unpacks the `build` job's Firefox artifact, sets the version, signs it with `web-ext sign --channel unlisted` and the sources zip, and hash-compares the signed files with the unpacked ones, ignoring `META-INF/`. A re-run keeps its run number, so it finds the version on AMO and downloads it instead (`scripts/amo-version.ts`, as in R148).
  - **Key:** the environment `amo-dev`, with no reviewer so pushes sign unattended, and deployments limited to the `dev` branch so no other branch can read the AMO key.
  - **No update URL:** a signed dev build never updates itself. The developer installs each one by hand, and it replaces an installed 1.4.5 or beta of the same ID.
  - **Chrome stays unsigned:** an unpacked Chrome extension survives restarts, and Chrome won't install a CRX from outside the store, so signing wouldn't help.

## User-confirmed policies of 2026-10-24 (R150–R155)

The user confirmed all six answers with "Confirmed. Implement this policy and continue 2.0." The session's confirmed answers supersede conflicting older clauses for these six policies only. Chapter ownership, the glossary, and ADR precedence still govern unrelated policy. Final route-correct privacy text needed the user's approval under REL-STORE-17. The user approved the drafted privacy policy on 2026-11-01, with its cookie bullet still provisional on ticket 25 (R48). Native and live checks remain waived and unproven. These resolutions specify the target contract, not completed implementation or a cleanup safety proof.

- **R150. Deleted migrated shortcut stays deleted.** Claiming never recreates the original row or rebinds its playlist to a replacement. Other eligible choices still claim. The notice reports the skipped shortcut separately, never as an unowned playlist (ACC-31, ACC-32; REL-MIG-36, REL-MIG-37).
- **R151. Safe cleanup uses a separate paced mutation opportunity.** All sync mutation attempts share at least 5 s spacing. This includes reset/clear and rejected or uncertain calls. Pushes take priority. Each push remains one combined `set`; a safe cleanup `remove` consumes another opportunity, never the same one. Unproven chunks stay and count toward actual occupancy; planned removal earns no credit. No eventual reclamation is promised. Cleanup adds no polling, new timer, or alarm. A safe protocol and minimum evidence for ownership and deletion safety under reordered delivery, multiple devices, interruption, and restart remain engineering obligations within existing local data lifetimes (SYNC-27, SYNC-14; ARC-MOD-21; Q-TEST-9, Q-TEST-47, Q-PERF-54). This amends R108's push-only accounting without changing quotas or reset semantics.
- **R152. Original shortcut identity survives name/key edits.** Migration retains the minimum validated original-ID association as local-only unclaimed bookkeeping, written with the initial canonical batch. It lasts only until claim, discard, or Clear all data. Claiming checks the current original row and fills only its empty target for that account. A replacement is a different identity, and the pending original ID is not reused. Compatible older records without valid provenance remain readable but never guess a row; the shortcut is skipped accurately while other eligible choices proceed. Exact additive local representation remains engineering work, with no new wire schema (ACC-31; DATA-12; REL-MIG-08, REL-MIG-34, REL-MIG-36).
- **R153. Later-history join stays visible without opening a tab.** A persistent pending indication in the popup and Settings links to the existing join dialog. It opens no tab automatically, chooses no side, and pushes nothing while waiting. Existing join choices, their default, account union, and Cancel behavior stay unchanged (SYNC-08 step 5, SYNC-24; UI-POP-10, UI-SET-12, UI-SET-13). This completes R79 for the later-history case.
- **R154. Denied feature access keeps explicit consent.** After Agree in "Before this feature can run", a denied site-access request leaves consent saved and the affected feature off, with an accurate missing-access explanation. First run's saved-on/held rule and Playlist shortcuts' YouTube-only exception stay unchanged (FT-32, FT-52; UI-ONB-09; ARC-ACC-61; REL-CON-16).
- **R155. Opaque sync-write failures permit conservative recovery.** Retain the original error in local diagnostics without inventing a category. Enforce a hold of at least 60 s across worker and browser restarts. Only a later external event after the deadline may permit one fresh-admission attempt using current state. Failure renews the hold. No polling, retry timer, or user-edit replay is allowed. This extends older kind-only retry text for opaque native failures only; known-kind handling, quotas, and full, sync-off, reset, version, consent, and privacy protections remain in force. The minimum local deadline representation and compatibility remain engineering work within existing data lifetimes, not a new recovery journal schema (SYNC-27; DATA-12; ARC-MOD-21, ARC-MOD-39; Q-TEST-9).

## User-confirmed interim conversion policies of 2026-10-25 (R156–R160)

These decisions apply only to the recognized interim session-access storage path described in [08 §2.12](08-release.md#212-interim-session-access-storage). They preserve GLOSSARY and ADR precedence, including [ADR-0009's amendment of 2026-10-25](../../../docs/adr/0009-upgraders-keep-what-1-4-5-did.md#amendment-2026-10-25-erased-authorization-on-the-interim-session-access-path). They do not change the original legacy known-authorization rules or prove that a production converter exists.

- **R156. Preserve interim account choices under the same account.** Q7 confirms carrying valid saved playlists, filters and shortcut targets under their existing account key. Create one deliberately shared shortcut row with account-specific targets, subject to R157. Preserve the effective interim required percentage and Show feedback. Keep old global choices separately unclaimed. Mapping an account body establishes no ownership of those globals. The conversion-created row is distinct from R152's original migrated shortcut association and never licenses resurrection or rebinding of a deleted row (REL-MIG-41 to REL-MIG-43; ACC-08; DATA-49).
- **R157. Canonical choices and deletions win collisions.** Q8 confirms that existing canonical 2.0 documents and tombstones remain authoritative. Retain conflicting interim choices inactive until explicit restore or discard. This includes shared Settings, so conversion never silently inserts a shared shortcut row into conflicting canonical Settings. Keep dependent interim targets inactive too. Do not guess edit order from timestamps, union missing fields, or destructively clean up unresolved source. Fine-grained collision UX and restore mechanics remain unspecified (REL-MIG-44).
- **R158. Require fresh canonical disclosure agreement.** Q9 confirms that saved interim choices remain inactive until the user agrees to the canonical 2.0 disclosure. Interim session consent and generation do not stand in for that agreement. Record the actual new agreement version and time, never an invented historical version or time. Retire old in-flight work before canonical activation (REL-MIG-45; REL-CON-16, REL-CON-17).
- **R159. Erased authorization history stays unknown.** Q10 confirms that historical authorization erased on the recognized interim path is neither known granted nor known denied. Preserve a saved required percentage. Otherwise use 50 % watched until an explicit immediate-add choice. Current credential absence, interim consent, account choices and caches do not prove prior absence or authorization. Keep the original legacy known branches unchanged and make no claim that credentials previously existed without evidence. The compatible local representation remains engineering work (REL-MIG-46; ADR-0009 amendment of 2026-10-25).
- **R160. Retained globals have explicit recovery.** Q11a confirms retaining globals left behind despite `legacyClaimed:true` inactive and showing an explicit recovery section. Nothing activates before review and explicit restore. Canonical choices and deletions remain protected, and account ownership must still be established. The marker proves neither ownership nor original shortcut provenance. Never automatically recreate or rebind a deleted migrated shortcut, or destructively remove unresolved source. This supersedes the earlier recommendation to keep the globals permanently consumed without recovery. Detailed UI, wire schema and ownership mechanisms remain unspecified (REL-MIG-47; UI-ONB-11).

## User-confirmed agreement admission policy of 2026-10-25 (R161)

- **R161. Sync admission refusal saves neither consent nor the setting.** Q12 confirms refusing the whole combined Agree and synced setting change when sync admission is blocked by a full quota or an addressed document with a newer version than this browser understands. Persist neither consent nor the requested setting. Show the blocker and allow explicit retry after the user resolves it. Never replay the action automatically or fall back to saving consent alone. R154's site-access denial behavior and its first-run and Playlist shortcuts exceptions remain unchanged. This preflight refusal is distinct from rejected storage IO or uncertain partial application and promises no cross-area atomicity ([REL-CON-16](08-release.md#43-consent-rules); [Q-TEST-9](07-quality.md#724-layer-3-fake-browser-and-dom)).

## User-confirmed recovery review policy of 2026-10-25 (R162)

- **R162. Review recovery items individually with nothing preselected.** Q13 confirms item-by-item review and selection of playlists, filters and shortcut targets for explicit restore or discard. Show each item's destination and any conflict. Retain unselected items inactive. This refines R157 and R160 only for review granularity, initial selection, disclosure and retention. R165 later settles selected-occurrence discard and retained-data lifetime. R166 later settles explicit destination choice among verified owners of an old global playlist choice with no saved account. Destinations outside R166, other conflict override or replacement semantics, ownership mechanisms, shortcut rebinding and the safe cleanup protocol remain unspecified. Existing canonical choices and deletions and shortcut provenance protections remain binding ([REL-MIG-47](08-release.md#212-interim-session-access-storage); [ACC-48](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming); [UI-ONB-11](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note); [Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)). Placement and copy for the recovery these resolutions describe were settled later, in Settings › Privacy & data ([R181](#plan-decisions-of-2026-11-01-r179r192)).

## User-confirmed filter replacement policy of 2026-10-25 (R163)

- **R163. Replace a conflicting retained filter only after separate confirmation.** Q14 confirms offering **Replace this filter** for a retained filter and a canonical filter for the same playlist and account. Show both versions and require separate confirmation before replacing the whole filter. Never merge channel lists. Keep the canonical filter until replacement succeeds, and retain unselected source inactive. This narrowly refines R157 and R162 for this filter conflict only. It grants no generic conflict override, revival of a deleted account, or shortcut rebinding. Ownership, readiness, quota, newer-version, reset, consent, R155, R161 and actual write-confirmation safeguards remain binding. R165 later settles selected-occurrence discard and retained-data lifetime, and R166 later settles explicit destination choice among verified owners of an old global playlist choice with no saved account. Destinations outside R166, ownership mechanisms, other recovery conflicts and the safe cleanup protocol remain unspecified ([REL-MIG-47](08-release.md#212-interim-session-access-storage); [ACC-48](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming); [UI-ONB-11](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)). Placement and copy for the recovery these resolutions describe were settled later, in Settings › Privacy & data ([R181](#plan-decisions-of-2026-11-01-r179r192)).

## User-confirmed unknown-provenance join policy of 2026-10-25 (R164)

- **R164. Unknown edit provenance requires the existing join choice.** Q15 confirms that an older local profile whose edit provenance is unknowable uses the existing **Use synced settings**, **Use this browser's settings**, and **Cancel** dialog when a synced copy exists. Sync stays off until a choice applies. Never silently replace local settings or invent a known edited or unedited fact. SYNC-08's proven same-history no-edit branch remains unchanged. The existing choice default, account union and Cancel behavior remain unchanged. Quota, newer-version, reset, consent, R155, R161 and actual write-confirmation safeguards still apply. This decision selects no marker schema or initialization that labels an unproven profile unedited ([SYNC-08](04-features-accounts-data.md#33-switching-on-the-join); [UI-SET-13](05-ui.md#sections); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)).

## User-confirmed recovery discard and destination policies of 2026-10-25 (R165–R166)

- **R165. Discard records only the selected occurrence and retains its data until safe cleanup.** Q16 confirms recording "do not restore" for only the selected source occurrence. Retain its original data until safe cleanup. Equal sibling occurrences and unselected source remain independently unresolved and inactive. Retained discarded data is recovery evidence pending safe cleanup, not authorization to re-offer or restore it automatically. Discard authorizes no immediate source erasure, bulk discard, hidden source consumption or new cleanup authority. No cleanup deadline or eventual reclamation is promised. R162's individual review with nothing preselected remains binding. Ownership, readiness, quota, newer-version, reset, consent, R155, R161 and actual write-confirmation safeguards still apply. This policy chooses no wire or storage schema ([ACC-48](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming); [UI-ONB-11](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note); [REL-MIG-47](08-release.md#212-interim-session-access-storage); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)). Placement and copy for the recovery these resolutions describe were settled later, in Settings › Privacy & data ([R181](#plan-decisions-of-2026-11-01-r179r192)).

- **R166. Choose a destination among verified owners before restoring an old global playlist choice.** Q17 confirms explicit destination choice among multiple verified owners when the old global playlist choice has no saved account. Revalidate the chosen account's ownership before restoring only to that account. Labels and cached data never establish ownership. This choice grants no account revival, original shortcut association, shortcut rebinding, cross-account copying, automatic restore, consent or site-access bypass, or generic conflict override. R162's individual review with nothing preselected and explicit restore, protected canonical choices and deletions, and R163's separately confirmed same-account and same-playlist whole-filter replacement remain binding. Ownership, readiness, quota, newer-version, reset, consent, R155, R161 and actual write-confirmation safeguards still apply. R169 later requires an existing account setup at the destination, and R170 later permits independent restores of separate equal occurrences. This policy chooses no wire or storage schema ([ACC-48](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming); [UI-ONB-11](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note); [REL-MIG-47](08-release.md#212-interim-session-access-storage); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)).

## User-confirmed withdrawal, clearing and recovery destination policies of 2026-10-26 (R167–R170)

The user answered Q18 to Q21 on 2026-10-26. These four resolutions specify the target contract only. Runtime withdrawal, newer-layout clearing and global recovery restore remain unimplemented and unverified. Native and live checks remain waived and unproven. These decisions grant no person-only step and no privacy publication approval. The user approved the drafted privacy policy separately on 2026-11-01 (REL-STORE-17). Placement and copy for the recovery these resolutions describe were settled later, in Settings › Privacy & data ([R181](#plan-decisions-of-2026-11-01-r179r192)).

- **R167. Withdrawal stops features at once and keeps unfinished work inactive.** Q18 confirms "Yes, withdraw and retain inactive work". Withdrawing consent stops every feature immediately, even when unfinished migration, account-removal or sync work is tied to the old agreement. Retain that work inactive. Never resume or discard it silently. Preserve its original evidence, accepted effects and tombstones. After a new agreement, the work stays inactive until the user explicitly recovers it. A new agreement alone does not authorize resuming it. This supersedes the lifecycle scope proposal to refuse withdrawal while those records bind consent. Engineering must build safe withdrawal and explicit recovery, and must never report immediate shutdown that rests on an unconfirmed write. FT-35's confirmation copy, private-window withdrawal (FT-37) and R154 remain unchanged. This policy chooses no recovery controls, wire or storage schema, or cleanup protocol ([FT-35](04-features-accounts-data.md#15-the-consent-gate); [UI-SET-16](05-ui.md#sections); [ARC-MOD-19](06-architecture.md#69-the-store-module-interface); [REL-CON-20](08-release.md#43-consent-rules); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)).

- **R168. Confirmed local Clear all stays available under a newer layout.** Q19 confirms "Yes, allow explicit local clearing". When this browser's data uses a layout newer than this build knows (DATA-48), confirmed Clear all data remains available as an explicit erase action. Stop this browser's writers first, then clear this browser's data. With "Also delete synced settings from all your browsers" unticked, leave synced settings untouched. This is a narrow exception to the rule that a newer layout writes nothing (DATA-48; ARC-MOD-25 step 3). It authorizes no ordinary edit, and no automatic downgrade or normalization of newer-layout data. DATA-36 to DATA-41, reachability from a private window (DATA-32) and explicit confirmation remain binding. This decision selects no protocol for the optional ticked synced reset under a newer layout and proves no native clear durability. R174 later settles the ticked case and R175 its confirmation ([DATA-36 to DATA-41](04-features-accounts-data.md#48-clear-all-data); [DATA-48](04-features-accounts-data.md#410-schema-versions-and-migrations); [UI-SET-16](05-ui.md#sections); [ARC-MOD-25](06-architecture.md#69-the-store-module-interface); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)).

- **R169. Restore an old global playlist choice only to an account with an existing setup.** Q20 confirms "Yes, require an existing setup". Global playlist recovery requires the selected account to already have a live 2.0 account setup. Show a verified owner without one as unavailable until the user creates a setup the normal way (ACC-20). Recovery never creates an account setup and never revives a removed one as a side effect. Removed setups stay protected. R166's fresh verified-owner selection and restore to that same account, consent, actual write confirmation, and quota and newer-version safeguards remain binding. This policy chooses no ownership mechanism and no wire or storage schema ([ACC-48](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming); [UI-ONB-11](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note); [REL-MIG-47](08-release.md#212-interim-session-access-storage); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)).

- **R170. Restore equal retained occurrences independently.** Q21 confirms "Yes, allow independent explicit restores". When two separate retained entries contain the same playlist, the user may restore each entry to a different freshly verified owner. Each explicit restore consumes only its own source occurrence and restores only to the account chosen for it. Nothing is copied automatically. One occurrence still cannot be restored twice. R165's distinct occurrence identities and R166's fresh ownership revalidation remain binding. Do not deduplicate occurrences by playlist value, and do not refuse a restore because a separate equal occurrence went to another account. R166's bar on cross-account copying still forbids copying one occurrence, or an existing canonical account's choices, to another account. This grants no account revival, shortcut rebinding or generic conflict override. R162's individual review with nothing preselected and R169's existing-setup requirement remain binding. This policy chooses no wire or storage schema ([ACC-48](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming); [UI-ONB-11](05-ui.md#54-the-first-run-page-first-run-and-the-upgrade-note); [REL-MIG-47](08-release.md#212-interim-session-access-storage); [Q-TEST-9 and Q-TEST-11](07-quality.md#724-layer-3-fake-browser-and-dom)).

## User-confirmed first-pick and newer-layout clearing policies of 2026-11-01 (R171–R175)

The user settled G9 to G14 on 2026-11-01. R171 to R175 record G9 to G13. G14 approves the drafted privacy policy in [08 §10.2](08-release.md#102-text) as drafted, and it's recorded in REL-STORE-17, 08 §19, [spec.md](../spec.md)'s decisions table and [for-the-user.md](../for-the-user.md). Its cookie bullet stays PROVISIONAL on ticket 25 and goes if no shipped route reads the session cookie (R48). These decisions publish nothing and grant no person-only step.

- **R171. A private-window first pick says the choice isn't kept.** G9. Choose mode's first pick in a private window saves the item and leaves the account's quick-save playlist unchanged (DATA-33). Its confirmation reads "Saved. Private windows don't keep your playlist choice." (`picker_pickedPrivate`) instead of "One click now saves there." No account-setup write starts ([UI-PICK-10](05-ui.md#57-the-shared-playlist-picker-and-key-recorder); [YT-PK-09](02-youtube.md#26-the-playlist-picker); YM-ACC-8).
- **R172. A refused choice after a confirmed save keeps the picker open.** G10. When a first pick's save is confirmed and the settings owner refuses to remember the chosen playlist, the picker stays open. The row shows the confirmed save ("Saved this video to {Playlist}", or "This video is already in {Playlist}" when it was there already) and the choice failure. It keeps **Undo** for the save. **Try again**, or ticking the row again, retries only the playlist choice and never saves the item a second time. A failed Undo reads "Couldn't undo." and keeps Try again. The first-pick confirmation shows only once a choice is stored ([UI-PICK-10](05-ui.md#57-the-shared-playlist-picker-and-key-recorder); [YT-PK-09](02-youtube.md#26-the-playlist-picker)).
- **R173. Closing the picker doesn't cancel a first pick under way.** G11. If the user closes the picker while a first pick is saving, both requested steps, the save and the playlist choice, still finish for the account the pick started on. The picker doesn't reopen. This holds while consent and that account's authority stay valid. If either becomes invalid, the step that hasn't started never starts, and the pick reports its choice as skipped. A pick created through New playlist in choose mode follows the same rule ([UI-PICK-10](05-ui.md#57-the-shared-playlist-picker-and-key-recorder); [YT-PK-09](02-youtube.md#26-the-playlist-picker)).
- **R174. A ticked Clear all under a newer layout clears this browser only.** G12 closes the gap R168 left. Under a layout newer than this build knows (DATA-48), a confirmed Clear all with "Also delete synced settings from all your browsers" ticked (`alsoSynced: true`) clears local data only. It stops this browser's writers, erases this browser's data as DATA-39's unticked column does, runs no synced reset and leaves `storage.sync` and other browsers untouched. The result reports `synced: "kept-newer-layout"`. R168's other limits stand. A newer layout can't be decoded, so engineering reads DATA-38's two facts raw to decide whether the checkbox shows there. It shows when the device record's `syncOn` is `true` or the sync record names a joined history. That reading is an engineering choice, not part of G12 ([DATA-36 to DATA-41](04-features-accounts-data.md#48-clear-all-data); [DATA-48](04-features-accounts-data.md#410-schema-versions-and-migrations); [ARC-MOD-25](06-architecture.md#69-the-store-module-interface)).
- **R175. The newer-layout ticked clear says what it left.** G13. The confirmation for R174's case reads "Cleared on this browser. Synced settings were left for the newer version of Perchling that saved them. Update Perchling here to clear them too." (`clearAll_syncedKeptNewer`). An unticked clear under a newer layout shows no such line ([DATA-36 to DATA-41](04-features-accounts-data.md#48-clear-all-data); UI-SET-16).

## The last account's own key, 2026-11-01 (R176)

- **R176. The last account is its own local key, not a Device field.** G16. A settings import wrote back the whole Device record it read before it started, so a consent withdrawal made during the import came back as agreed. The last account now lives in `storage.local` under `lastAccount`, an account key or `null`, and absent reads as `null`. A settings import, removing a setup, and a sync join that receives a setup's tombstone clear that key when it names the removed account. None of them writes `device`. 2.0 isn't released, so no installed 2.0 data needs a migration, `schema` stays `1`, and the 1.x migration writes no last account ([DATA-07, DATA-12](04-features-accounts-data.md#43-storage-layout); [ACC-13](04-features-accounts-data.md#23-which-account-is-shown); [ARC-ACC-52](06-architecture.md#6211-serving-tab-routing)).

## Receiving a removed setup by sync, 2026-11-01 (R177)

- **R177. A browser that receives a setup's tombstone removes that account's data too.** G17 built the receive, and these are the choices it made. A setup's tombstone that arrives by sync passes the ordinary receive checks first (SYNC-11). The receiving browser then also removes that account's playlist cache, watch progress and session memory, and sets `lastAccount` to `null` when it names the account. DATA-44 had listed these as "Here", for the browser where the user removed the setup. A filter's tombstone that arrives while its setup is still live here isn't applied, so auto-add never runs a playlist without its filter. It applies once the setup's tombstone is here, whichever arrives first. The receive keeps no removal journal. It removes the cache, the progress and the session memory first. One local write then stores the tombstone, its acknowledgement and the cleared `lastAccount`. A restart before that write finds the setup still live and repeats only what's left. If the browser stops at that one point and the user then edits that setup here before the receive runs again, the edit is newer, so the setup stays, without its cache, progress and session memory. That rare loss is accepted. This adds a fourth writer to R176's list of writers that clear the last account ([DATA-07](04-features-accounts-data.md#43-storage-layout); [DATA-44](04-features-accounts-data.md#49-removing-a-setup-and-smaller-removals); [SYNC-12](04-features-accounts-data.md#34-conflicts); [ARC-MOD-21](06-architecture.md#69-the-store-module-interface)).

## Expiring synced tombstones, 2026-11-01 (R178)

- **R178. Any browser expires a tombstone 30 days after its edit time.** G18. SYNC-12 and DATA-10 kept tombstones for 30 days but didn't say which browser removes them or when, and SYNC-27 allows no timer for cleanup. Any browser with sync on now expires a setup's tombstone during an automatic receive pass once 30 days have passed since its `at`, read from its own clock. It drops its local copy and its `pushed` entry first. A later paced opportunity of its own removes the synced copy, after any push that is waiting. The account's filter tombstones expire with their setup's, whatever their own `at`, so a filter tombstone under a live setup never expires. ARC-MOD-21 gains an exception for this one removal, because the tombstone may come from another browser. Engineering made these choices within G18. A browser expires only tombstones it has acknowledged, and only while sync holds the same deletion or nothing. It receives the documents before it expires anything, so a newer live setup or filter in sync replaces the tombstone as an ordinary edit (SYNC-11). The local turn removes the documents before it rewrites the history, and the next pass drops any `pushed` entry a restart left without its document. A synced tombstone that a browser no longer holds no longer blocks its pushes and edits. A rejected removal stops automatic sync work until the next start, which plans it again from what is stored. Two risks are accepted. Once the synced tombstone is gone, a browser that was offline for over 30 days and still holds a live copy of the setup or filter pushes it back when it returns (SYNC-07), and the removal is undone in sync. The other browsers no longer hold that document, and while remote-only documents stay excluded, they neither take it in nor sync their own edits while it is there. A browser whose clock runs behind can also push back a tombstone another browser just removed, and the removal repeats, one paced opportunity at a time, until its clock passes the 30 days too ([SYNC-07, SYNC-27](04-features-accounts-data.md#32-the-local-copy-comes-first); [SYNC-12](04-features-accounts-data.md#34-conflicts); [DATA-10](04-features-accounts-data.md#43-storage-layout); [ARC-MOD-21](06-architecture.md#69-the-store-module-interface)).

## Plan decisions of 2026-11-01 (R179–R192)

The owner settled G19 to G36 on 2026-11-01, while the 2.0 build was planned (`.audit/2.0-build/decisions.json`). R179 to R192 record the ones that change the spec. G23, the test runner, waits on research and changes nothing yet.

- **R179. Firefox asks for the same hosts as Chrome.** G21. Both builds declare `host_permissions: ["https://www.youtube.com/*"]` and `optional_host_permissions: ["https://music.youtube.com/*"]`. Firefox narrows from 1.4.5's `*://*.youtube.com/*`. Every rule that asked for YouTube Music access "on Chrome" now applies to both browsers, first run's hint and Agree click included. The 1.4.5 → 2.0 update still shows no prompt, because narrowing asks for nothing. Once Firefox revokes origins no longer declared (Bug 2022704), an upgrader who used YouTube Music may have to give that access again. The owner accepted that cost. The 1.4.5 history in 08 §1 stays as it was ([ARC-MAN-01, ARC-MAN-03](06-architecture.md#631-manifest-per-browser); [Q-CI-3](07-quality.md#771-ciyml); [REL-CON-08, REL-CON-14, REL-CON-22, REL-CON-24 and §5](08-release.md#5-permission-prompts-by-audience); [FT-44](04-features-accounts-data.md#17-site-access-and-youtube-tabs); [YM-FEAT-10, YM-PS-2](03-youtube-music.md); [UI-POP-32, UI-SET-23, UI-ONB-03, UI-ONB-04, UI-ONB-09](05-ui.md); [PAR-CAP-77, PAR-NEW-28](09-parity.md)).
- **R180. The store is per-operation owners.** G22. The spec described one `Store` with `change(origin, Change)` over a single `Change` union. The build has one owner operation per write instead: claim, discard, Agree, withdrawal, filter edits, settings edits, settings import, sync join, account removal, Clear all and session memory. Their results take two shapes: a small edit answers `{ kind: "result", result: ChangeResult }`, and a transaction answers a `kind`-tagged union (`committed`, `unchanged`, `refused`, `unavailable`, `failed`, `unconfirmed`). The router maps each to the reply its caller reads. The one-write-path guard (ARC-MOD-23) and `Origin` (ARC-MOD-20) stay ([ARC-MOD-19, ARC-MOD-21, ARC-MOD-22, ARC-MOD-24](06-architecture.md#69-the-store-module-interface)).
- **R181. Recovery lives in Settings › Privacy & data.** G24. Both kinds of recovery, work that withdrawal paused (R167) and choices an earlier version left behind (R162 to R170), sit in one section, "Waiting for your review", right after Consent. The upgrade note's **Review in Settings** opens it. The agent wrote its copy under unslop, with no separate review round. R162 to R170 left placement open, and this settles it; their rules stand ([UI-SET-16](05-ui.md#sections), [UI-ONB-11](05-ui.md#the-upgrade-note); [FT-35](04-features-accounts-data.md#15-the-consent-gate), [ACC-48](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming); [REL-MIG-47](08-release.md#212-interim-session-access-storage)).
- **R182. Choose mode for a shortcut is titled "Pick the shortcut's playlist".** G25, G32. A picker opened from a shortcut's **Choose** has that title on both sites and no line under it. This settles 02's N13 and the matching open items in 03 and 05 ([YT-PK-09, YT-KEY-13](02-youtube.md#26-the-playlist-picker); [YM-PICK-3](03-youtube-music.md); [UI-PICK-10, UI-PICK-18](05-ui.md)).
- **R183. YouTube Music's icons are Material Symbols.** G26. The build bundles Material Symbols paths matched to YouTube Music's icons, never YouTube Music's own paths. Ticket 27's PROVISIONAL row goes ([UI-YM-04](05-ui.md)).
- **R184. 2.0 replaces 1.4.5 directly, and 1.5.0 never ships.** G19, G20. The first cutover change deletes the 1.x React app and `src/lib`. From then on `main` carries 2.0 and ships nothing until 2.0 is usable. `package.json` stays `1.5.0` until the owner sets `1.99.1`, which is the release activation. No build ships while the interim safeguards are gone. The interim path in 08 §2.12 stays only as an upgrade source ([REL-CI-03](08-release.md#6-versioning), [REL-MIG-45](08-release.md#212-interim-session-access-storage); [09's intro](09-parity.md)).
- **R185. A parity row counts only when 2.0 code delivers it.** G27. Rows the interim build delivers stay open until 2.0 code does the same ([09, How to read this chapter](09-parity.md#how-to-read-this-chapter)).
- **R186. CI fills reviewer credentials only through an approved design.** G28. The agent writes the design and credential-free tests, and the owner approves them before anything runs. The approved version runs from a frozen copy, and any change to it needs the tests and the approval again ([REL-STORE-21, REL-STORE-24, REL-CI-46](08-release.md)).
- **R187. The interim conversion ships switched off.** G29. It turns on only after ticket 25's live checks verify production ownership and session contracts on a real signed-in account. The retained-globals recovery that belongs to it waits too ([08 §2.12, REL-MIG-46, REL-MIG-47](08-release.md#212-interim-session-access-storage)).
- **R188. All copy goes through unslop.** G30, G31. Every user-facing string goes through pstack's unslop rules, strings the spec pins word for word included, and the spec carries the new wording where it changes. Typographic quotes around titles and the "…" cut stay, because R45 makes them the product's format ([YT-ADD-18](02-youtube.md); [YM-FB-10](03-youtube-music.md); [UI-TOAST-11](05-ui.md); [08 §3.2](08-release.md#32-copy)). R193 on lists the strings that changed.
- **R189. The first beta waits until 2.0 is usable.** G33. The owner activates `1.99.1` only once every 2.0 feature is built (plan wave 8) and the full suite and both browser builds pass ([REL-CI-03](08-release.md#6-versioning)).
- **R190. Ticket 25 runs after the first beta.** G34. The first beta ships with the provisional cookie lines (R48). If ticket 25 changes them, the disclosure is re-pinned under a new consent version (FT-36) ([08 §0](08-release.md#0-provisional-inputs), §19).
- **R191. No check marks on YouTube Music until M2.** G35. The YouTube Music picker shows no check marks, and no "Couldn't check" line, until ticket 25's M2 check passes ([YM-PICK-6](03-youtube-music.md)).
- **R192. Collaborative playlists count as not owned until ACC-35's check.** G36. Claiming treats a collaborative playlist the user doesn't own as not owned until ticket 25 settles ACC-35 ([ACC-35](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming)).

R162 to R170 left the recovery section's placement and wording open. R181 now settles both.

## Copy after unslop, 2026-11-01 (R193–R194)

G31 put every user-facing string through unslop, pinned ones included. These record what changed. The chapters carry the new wording.

- **R193. Pinned strings that unslop changed.**
  - **A colon no longer joins two clauses.** Each failure that read "Couldn't save “{title}”: {Playlist} doesn't exist anymore." now reads "Couldn't save “{title}”, because {Playlist} doesn't exist anymore." The same holds for full playlists, the saved-and-failed second sentences ("Couldn't add it to {list}, because it's full."), the filtered and unknown-channel toasts ("Didn't auto-add “{title}”, because {Channel} is filtered out of {list}"; "…, because {Product} couldn't tell which channel it's from."), Gather's results and failures, first run's refusals ("Couldn't agree, because your synced settings are full. …") and the key recorder's refused presses ("Enter and Space can't be used alone, because they press buttons.") ([YT-ADD-28](02-youtube.md), [03 §13](03-youtube-music.md#13-feedback-toasts-and-undo), [YT-GT-32, YT-GT-33](02-youtube.md), [YT-KEY-29](02-youtube.md#286-the-key-recorder), [UI-PICK-23](05-ui.md#the-key-recorder)).
  - **Active voice where a passive hid the actor.** "Live streams aren't auto-added" became "Auto-add skips live streams". The can't-measure toast became "Auto-add can't follow this video's progress, so it won't add “{title}”." The channel filter hints became "Auto-add takes only videos from these channels." and "Auto-add never takes videos from these channels." "No tabs were closed" became "All tabs stay open". The upgrade note says "Perchling deleted the client ID, …" and "Perchling checked your choices from 1.x for {Account}." The withdrawal confirmation says "Every feature stops in this browser, and Perchling reads nothing from YouTube until you agree again. It keeps your settings." The newer-layout Clear all says "Cleared on this browser. Your synced settings stay as the newer version of Perchling saved them. Update Perchling here to clear them too." (R175's wording, revised.)
  - **Who holds a key.** "{Key} is already used by {Other}." became "{Other} already uses {Key}.", and a preset row's "No key: {Key} is used by {Other}" became "No key, because {Other} uses {Key}". The recorder's reserved-key hint became "That key belongs to the browser and never reaches the page.", because the recorder doesn't keep the refused key to name it.
  - **Smaller cuts.** "Why the new name:" became a question. The note's "Also new: …" line lost its label. "actually" left the note's auto-add line and its question. "{Product}: save this video" became "Save this video with {Product}".
  - **Kept as they are.** Typographic quotes around titles and the "…" cut stay (R45). The disclosure (UI-ONB-08, 08 §4.1) keeps its colons after the bold lead-ins, because `rendered-disclosure.ts` pins its version 1 text by digest, and changing it needs the owner's identity and version decision. "·" stays as a separator in status lines.
- **R194. The interim note's unknown-history copy.** REL-MIG-46 asked for truthful copy when earlier access can't be determined. The note's Auto-add row reads "You chose {N} playlists in an earlier version of Perchling. Perchling can't tell whether that version had access to your account." The credentials paragraph ends "This browser holds no Google sign-in for Perchling." With no saved percentage, the question reads "Perchling can't tell how an earlier version added your videos. Which do you want?", with "Once half of it is watched" as the default and "As soon as a video starts playing" ([REL-MIG-46](08-release.md#212-interim-session-access-storage)).
- **R195. The disclosure's colon-joined bullets, re-pinned as version 1.** G38. This replaces R193's "kept as they are" note on the disclosure. The first bullet reads "**reads what you watch and listen to there,** meaning the video or song, its channel, and how much of it you've played;". The second reads "**reads and changes your playlists as you,** using YouTube's own requests. It lists them, checks which ones already hold a video, and adds or removes videos when you ask, or when auto-add or automatic gathering does;". The third bullet's colon stays, because it introduces a list. `rendered-disclosure.ts` pins the new text as version 1 with new SHA-256 digests. 2.0 hasn't shipped, so nobody agreed to the old text and nobody has to agree again ([UI-ONB-08](05-ui.md#the-disclosure), [REL-CON-12](08-release.md#41-the-disclosure)).
- **R196. The store copy as shipped, after unslop.** The release work ran the store copy through unslop (G30, G31), so [08 §9 to §12](08-release.md#9-store-listings) now quote the files it wrote. Those files are the source, and the spec follows them:
  - §9.2 quotes `store/listing/description.md`. Each feature line ends its lead-in with a period instead of a colon, the section headings are plain lines, and the privacy, source and problem links sit on lines of their own.
  - §9.3 quotes `store/release-notes/2.0.0.md`. The credentials line says "Perchling … deletes your old client ID, secret and tokens", and the "Also new:" label is gone.
  - §11 quotes `store/cws-dashboard.md`, which splits the data-usage table's combined row into one row per category and ticks with Yes and No.
  - §12.1 quotes `store/notes/reviewer-full.md` as the plain text AMO shows. REL-STORE-22's hotfix template takes its first sentence, `{fix}`, from `store/notes/hotfix/{version}.md`, and both the hotfix and beta templates now name `SOURCE_CODE_REVIEW.md`.
  - §12.3 quotes `SOURCE_CODE_REVIEW.md`, which lists the layout as a table.
  - The privacy policy (§10.2) stays as the user approved it on 2026-11-01 (G14), and `site/privacy/` matches it word for word. §10.1's site layout already matches `site/`.

## Build follow-ups, 2026-11-02 (R197–R198)

- **R197. Copy the 2.0 build wrote after R196, as shipped.** G31 puts every string through unslop and has the spec follow the wording that ships. The build rounds after R196 wrote or changed these strings, and the chapters now quote them:
  - **The claim banner.** The popup's one-time claim result reads "Perchling set up your 1.x auto-add playlists and shortcut for {Account}." with **OK**, in the active voice. The upgrade note keeps "Your auto-add playlists and shortcut from 1.x are now set up for {Account}: {titles}." ([ACC-32](04-features-accounts-data.md#26-the-unclaimed-setup-and-claiming)).
  - **Paused-work job names.** Waiting for your review also names "Saving your settings changes" and "Importing your settings file", the two jobs R167's list didn't name ([UI-SET-16](05-ui.md#sections)).
  - **Left-behind choices while conversion is off.** One row says "Perchling can't restore or discard them yet, because it first has to confirm which of your accounts owns each playlist. Until then, it keeps them as they are." with **Restore** and **Discard** disabled, because R187 keeps the conversion and its ownership checks off ([UI-SET-16](05-ui.md#sections), ACC-48).
  - **Gather.** Undo of a gather that saved nothing reads "Reopened {n} tabs." Videos that failed for no one reason read "Couldn't save {m} videos. Their tabs stay open." A window whose tabs can't be read reads "Couldn't read this window's tabs, so nothing was gathered." With one video, "their tabs" reads "its tab" ([YT-GT-32, YT-GT-33](02-youtube.md#2166-feedback-keys-and-copy)).
  - **Check now.** Its line reads "Check now reads from an open YouTube tab. It changes nothing.", a result reads "{done} of {total} reads answered on {site}.", and a check that can't run reads "Couldn't run the check. Try again." ([HEALTH-23](04-features-accounts-data.md#55-diagnostics-check-now-and-the-report)).
  - **YouTube add's failure toast.** An add whose report never came back, because the background stopped or no tab answered, reads "Couldn't confirm the save. Check the playlist on YouTube before you try again." Keys from any tab and YouTube Music's quick actions use the same line ([YT-ADD-28](02-youtube.md#253-copy)).
  - **The watch-page button.** R193's "Auto-add skips live streams" and "Save this video with Perchling" now reach UI-YT-18's table. The menu's outcomes are "At 50 %", "Auto-added", "Already in it", "Filtered out", "Couldn't add" and "Not auto-adding" ([UI-YT-18, UI-YT-22](05-ui.md)).
  - **This video in the popup.** The meter's accessible name is "{n} % watched". **Don't auto-add this video** reads **Auto-add this video again** once skipped, beside the status line's **Undo**, and a change that fails reads "Couldn't change that. Try again." ([UI-POP-13, UI-POP-14](05-ui.md)).
  - **Keys from any tab on YouTube Music.** With YouTube Music switched off in Perchling a key answers ✕ "YouTube Music is off in Perchling.", and a tab that doesn't answer gives ✕ "YouTube Music didn't answer." ([YM-ANY-4](03-youtube-music.md)).
  - **Settings sync's switch.** The join dialog's title, lead and the two choices' lines, SYNC-09's refusal naming what takes the most room, and the switch's failure lines are quoted in [UI-SET-13](05-ui.md#sections) and [SYNC-09](04-features-accounts-data.md#33-switching-on-the-join). SYNC-09's refusal replaces SYNC-14's edit message for a join, because nothing is saved yet when the join is refused.
- **R198. Marks and labels past the sync limit wait for room.** G40 queued SYNC-16's second half, and this builds it. A Missing or Full mark, an account label refresh or a channel label refresh that doesn't fit even the browsers' own quota is saved in this browser anyway. The local `SyncState.deferred` records its document and gen in the same write. Admission leaves a deferred document out, so it never refuses the user's own changes. Each push adds the deferred documents that fit again, in key order, and leaves the rest for a later push. Acknowledging a document's push removes its entry, and a later ordinary edit to the document is pending as usual. Nothing is synced about the wait, and the status stays as SYNC-17 sets it ([SYNC-16](04-features-accounts-data.md#35-budget-and-full), DATA-12).

## The background budget, 2026-11-02 (R199)

- **R199. The background's budget is a 227.2 KB gzip ceiling.** G44. The provisional 25 KB came from 1.5.0's 7.5 KB background, before the 2.0 store's recovery, interim and sync-join code existed. Chrome's service worker can't load code lazily, so only removing code shrinks it. The 227.2 KB ceiling is the measured size at `ff2ca402` plus rounding, and `check:budget` fails any build above it. Q-PERF-31's other budgets stay as targets while the lazy jobs file and lazy picker are built (G41 to G43).

## The lazy jobs file, 2026-11-03 (R200)

- **R200. The gateway's jobs load from their own MAIN-world file on a page's first job.** G42. Before this, `page-www.js` and `page-music.js` were 26.6 and 25.2 KB gzip against 5 KB rows, because every job loaded with the page half. Now each site has a second page-world file, `page-jobs-www.js` or `page-jobs-music.js`, and a page that runs no job never loads it ([ARC-MAN-26](06-architecture.md#633-runtime-script-registration), ADR-0007's 2026-11-03 amendment):
  - **What stays in the page half.** The page channel, hello, the Registrar's presence check, the account pinned at load, and the streams the features watch from the start, with their parsers and the live read port. The reads that share the streams' code stay too: the account, the current video, the playing song and cast state. That makes 13.78 KB on YouTube and 14.00 KB on YouTube Music. Both rows stay over 5 KB with dated exceptions, because the streams must run from the start ([Q-PERF-12, Q-PERF-13](07-quality.md#763-in-page-weight)).
  - **What moved.** The requests, route tables, lanes, account guard, playlist and queue parsers, YouTube Music's handlers and queue-state code, the live request adapters, a pointed card's video or item, a video's channel, and the diagnostic probe. The jobs files are lazy rows of 20 and 18 KB, against 19.20 and 17.60 measured ([Q-PERF-14](07-quality.md#763-in-page-weight)).
  - **The load.** On a page's first job, the page half sends `need` to the core, and the core sends `tab.need { jobs: true }`. The background runs `Registrar.ensure(tabId, { jobs: true })`, which injects the file into that tab's page world once, only behind the current build's page half and core. The file offers itself to the page half of its build with a `ppt:jobs-offer` event. The page half takes it only while asking, and then answers the Registrar's `ppt:jobs` presence check. The core answers `need` with `loaded { ok }`.
  - **Waiting jobs.** None runs before both the file and the confirmation arrive. Each keeps what is left of its 10 s, so expired work never starts. A refusal, or no answer within 10 s, fails them as `unavailable`, never sent, and the next job asks again.
  - **Accounts, restarts and Clear all.** The jobs use the identity the page half pinned at load, so a file that arrives after an account switch answers `accountChanged` and sends nothing. The Registrar keeps no record of which tabs have the file. After a worker restart it probes again, so it finds the file a tab still has and loads it into a tab that lost it. Clear all disposes the Registrar, so `ensure` refuses until the next consent. A retire disposes the jobs with the page half.
  - **Size elsewhere.** The relay adds 0.08 KB to each core, so the `www/core` and `music/core` exceptions rise by 0.1 KB, to 28.3 and 28.8. The background's additions fit under its 227.2 KB ceiling (R199), at 227.20 KB, because the probe no longer re-checks the types of the isolated world's own records and the Registrar picks the page world by a file's `page-` name.

## Budgets re-baselined, 2026-11-03 (R201)

- **R201. The weight budgets are the sizes measured after the lazy jobs file and the lazy picker.** G45, after G41 to G43. The original rows were set against stubs and a rough build. With the page halves' job code lazy (R200) and the picker loaded on open, what remains is real code: the gateway's streams, the cores' contract validators (kept because the page world can forge messages) and Svelte's runtime. `perf-budget.json` is the authority, and `check:budget` fails any build above it. The rows:
  - `www/page`: 13.8 KB
  - `www/core`: 28.3 KB
  - `www/kit`: 28 KB
  - `www/auto-add`: 5.5 KB
  - `www/shortcuts`: 2.0 KB
  - `www/quick-save`: 3.6 KB
  - `www/queue-button`: 3.6 KB
  - `www/watch-button`: 4.5 KB
  - `www/card-menu`: 1.6 KB
  - `music/page`: 14.0 KB
  - `music/core`: 28.8 KB
  - `music/kit`: 31.7 KB
  - `music/shortcuts`: 1 KB
  - `music/music-actions`: 7.7 KB
  - `music/music-keys`: 1 KB
  - Totals: YouTube everything on 90.9 KB, YouTube Music everything on 84.2 KB.
  - Popup first view: 57.4 KB on YouTube, 67.6 KB on YouTube Music.
  - First run: 62.5 KB, and 66.3 KB with the upgrade note.
  - Lazy jobs files: 20 KB for YouTube and 18 KB for YouTube Music.
  - Background: a 230 KB ceiling (G46), replacing R199's 227.2 KB, for the queued sync follow-ups.

