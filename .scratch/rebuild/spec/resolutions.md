# Resolutions made while assembling the spec

While the chapters were being written, their authors flagged conflicts between tickets, and details no ticket pinned down. The main session settled each one here on 2026-10-19, under the user's delegation ("you have the shared understanding"). Every resolution follows the map's principles. The chapters apply them, and each one is cited by its R-number.

Items that are genuinely the user's call are **not** settled here; they stay in the spec's [Open items](../spec.md#open-items).

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
