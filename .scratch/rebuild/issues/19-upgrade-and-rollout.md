# How do 1.4.5 users upgrade, and how does 2.0 roll out?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 06, 10, 16, 22, 23

## Question

With [ticket 06](06-upgrade-path.md), [ticket 10](10-youtube-access.md) and [ticket 16](16-storage-and-sync.md) answered, decide:
- the migration steps;
- the permission prompts 1.4.5 users will see, and how the one-time note explains them;
- the release order: the AMO update and the first Chrome Web Store listing;
- versioning;
- listing text and screenshots;
- retiring `server/` and the auth docs;
- whether a beta comes first.

Also from [ticket 03](03-store-policy.md):
- the privacy policy page and where it's hosted;
- the Chrome Web Store data disclosures, single-purpose statement and permission justifications;
- a reviewer README for the Bun build, plus an ARM64 rebuild check, because AMO's reviewer machines are ARM64 with Node and npm;
- a test account for reviewers.

Also from [ticket 06](06-upgrade-path.md):
- **Carry-over values:** carry over what 1.4.5 actually did (0 %, toasts off, Ctrl shortcuts dead) or what its popup showed (50 %, toasts on)?
- **Before consent:** what happens to carried-over auto-add before the user accepts the disclosure, which the one-time note doubles as?
- **Old Google access:** revoke the old OAuth tokens (needs a Google host permission) or link to myaccount.google.com/permissions?
- **Minimum Firefox:** 128, 140 or 153?
- **Upgrade testing:** test it before release with a self-hosted `update_url`.
- **CI:** move `release.yml` to Chrome Web Store API v2 and pass AMO notes through `FIREFOX_AMO_METADATA_FILE`.

Also from [ticket 11](11-accounts.md):
- 1.4.5 playlists become an unclaimed setup, claimed only after consent by the first account that owns them.
- The upgrade note gains "Sign in to YouTube and your 1.x playlists will be picked up."
- The store disclosures mention that account name, handle and avatar URL are stored locally, and synced if sync is on.

Also from [ticket 22](22-name.md):
- Both stores take the new name; the AMO slug and gecko ID stay.
- The AMO description says "(formerly YouTube Playlist Tools)", and the upgrade note mentions the rename.
- Add the attribution line: "YouTube and YouTube Music are trademarks of Google LLC. Use of these trademarks is subject to Google Permissions." plus "Not affiliated with or endorsed by YouTube or Google."
- Store screenshots use the user's own or Creative Commons videos.

Also from [ticket 10](10-youtube-access.md):
- **Manifests:** both are in its section 11.
- **Firefox:** the 1.4.5 → 2.0 update shows no prompt.
- **Chrome:** www.youtube.com only at install; YouTube Music access is requested when that feature is switched on.
- **Floors:** Chrome 121, Firefox 140.
- **Disclosures:** add "Authentication information" and the privacy-policy line if the page-signed request ships.
- **Listing:** the `scripting` justification is in section 11, and the reviewer notes list the routes and endpoints.
- **Removed:** `identity` and the Google hosts.

Also from [ticket 12](12-adding.md):
- 1.4.5's toasts on → Show feedback on; off → off. Failures now still show for them.
- Release note: auto-add no longer adds duplicates, and no longer claims "Added" when an add failed.

Also from [ticket 07](07-watched.md):
- The one-time note could say "Auto-add now counts only what you actually watch. Skipping ahead and ads don't count."
- The privacy policy mentions locally kept watch progress (up to 30 days).

Also from [ticket 08](08-shortcuts.md):
- the 1.4.5 key-conversion rules (in its Answer);
- the feature is on only if both a key and a playlist carry over;
- upgraders get no Watch later preset;
- the upgrade note names a carried Ctrl key (it never fired in 1.4.5) and explains unconvertible keys.

Also from [ticket 18](18-breakage.md):
- **Release gates:** the static watch green, the browser watch green or inconclusive, the signed-in live check run, and no live-check code in the zips.
- **Hotfix lane:** a CI check that the manifest is unchanged apart from `version`; per-store publish switches; Chrome hotfixes publish on approval (`skipReview` tried, never relied on); a reviewer-notes template.
- **Bad releases:** roll back first, then submit the fix (Chrome's rollback discards pending submissions).
- **Support channel:** for reports (PROVISIONAL: GitHub issues).
- **Watch alive:** GitHub disables scheduled workflows after 60 days of inactivity, so the checklist confirms the watch still runs.
- **Beta:** AMO has no pre-release channel. Consider a self-hosted unlisted beta.

Also from [ticket 24](24-performance-budget.md): the release checklist runs the timing test on the reference machine in both browsers, and `release.yml` runs the size check too.

Also from [ticket 16](16-storage-and-sync.md):
- **Migration table:** in its section 10.2, including cleaning typed playlist IDs and the 1.5.0 developer keys.
- **Old stores:** IndexedDB is deleted from the background; the old `localStorage` keys are removed by the first extension page.
- **Upgraders:** sync starts off, and the upgrade note is set to pending.
- **Privacy policy:** list what's stored locally (watch progress up to 30 days, playlist lists with thumbnails, account name, handle and avatar URL) and what syncs when sync is on.
- **Carry-over:** ticket 16 recommends carrying 1.4.5's real values (0 %, feedback off). Confirm, and plan for AMO's required-type case.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up and why it lost. This answer folds in every "Also from" note above, plus the Answers of tickets [03](03-store-policy.md), [06](06-upgrade-path.md), [07](07-watched.md), [08](08-shortcuts.md), [09](09-where-things-live.md) (resolved while this was written), [10](10-youtube-access.md), [11](11-accounts.md), [12](12-adding.md), [16](16-storage-and-sync.md), [17](17-modules.md) (resolved while this was written: build targets, CI jobs, `check:*` scripts, the live-check build, re-injection after updates), [18](18-breakage.md), [22](22-name.md), [23](23-ask-amo.md)'s final draft and [24](24-performance-budget.md). Store, browser and GitHub facts were re-read from primary sources on 2026-10-19 ([section 20](#20-facts-this-rests-on)).

**Three inputs are still open, and every part that depends on them is marked PROVISIONAL.** The plan works whichever way they land:
- **[22](22-name.md), the name.** Copy below uses the recommendation, "Playlist Pigeon for YouTube™" (in-product "Playlist Pigeon", `short_name` "Pigeon"). If the user picks the runner-up, swap in "Playlist Courier" / "Courier"; nothing else changes.
- **[23](23-ask-amo.md), AMO's reply** on `data_collection_permissions`, sync, private windows and Bun. [Section 11.4](#114-provisional-what-each-amo-reply-changes) gives the change for each possible reply.
- **[25](25-live-checks.md), the signed request.** The "Authentication information" disclosure and the cookie lines ship only if the signed request ships (ticket 10 §3). They're drafted in and marked.

**In short:**
- **Migration:** ticket 16 §10.2 confirmed, with real 1.4.5 values: feedback off unless `toastEnabled` was true, Ctrl keys carried, and the percentage as stored.
  - **One correction:** 1.4.5's popup showed toasts *off* too. Only the percentage showed one thing (50 %) and did another (0 %).
  - **The note asks:** for exactly that case, the upgrade note asks once, defaulting to what 1.4.5 did.
- **Consent first:** nothing carried over runs, and nothing is read from YouTube, until the upgrader agrees on the upgrade note. The note opens once in a tab and doubles as consent. One versioned consent of our own gates every feature on both browsers.
- **Old Google access:** deleted locally, plus a link to myaccount.google.com/permissions. Nothing is revoked over the network.
- **Prompts:** none for Firefox upgraders (under `none`). Chrome asks for www.youtube.com at install, and for music.youtube.com only from the click that first switches on a YouTube Music feature.
- **Release order:**
  1. **A two-week beta:** a self-hosted unlisted Firefox build of the *same* add-on, updated from this repo's GitHub Pages, plus the Chrome item uploaded as **Unlisted**, so its slow first review happens off the critical path.
  2. **Firefox listed 2.0.0:** the AMO update for the 66 users, with Chrome 2.0.0 submitted the same day as a staged (publish-later) release.
  3. **A 7-day Firefox soak.**
  4. **Chrome goes Public.**
- **Versioning:** numbers only, `MAJOR.MINOR.PATCH`, identical on both stores. 2.0's betas are `1.99.N`. Patch releases are the hotfix lane only.
- **Privacy policy and site:** the privacy policy, a one-page home and the beta update manifest are static pages on `https://alioun.github.io/yt-playlist-tools/`. No third-party scripts. The URL is a published contract, so the repo isn't renamed while betas are installed.
- **CI:**
  - **Chrome:** the release workflow moves to Chrome Web Store API v2 with a service account.
  - **Stores:** AMO and Chrome become separate jobs behind protected GitHub environments, with per-store switches.
  - **Gates:** ticket 18's release gates, ticket 24's size check, sources rebuilds on x86-64 *and* ARM64, and a frozen-manifest check for patch releases.
  - **Retired:** `server/`, the broker CI job and the auth docs go in the first slice of the build.

### 1. The design tree, answered

Worked under the delegation, frontier by frontier:
1. **Round 1, independent facts and policies:**
   - carry-over values (§2.2);
   - old Google access (§2.5);
   - the Firefox floor, confirmed at 140 (§7);
   - the consent model (§4.3);
   - the support channel (§16);
   - where public pages live (§9.1).
2. **Round 2, which depends on round 1:**
   - the upgrade note (§3);
   - the first-run disclosure (§4);
   - prompts per audience (§5);
   - listing text (§8);
   - the privacy policy (§9);
   - Chrome Web Store answers (§10);
   - AMO notes and the sources README (§11).
3. **Round 3, which depends on rounds 1–2:**
   - release order and the beta (§6);
   - versioning (§7);
   - workflows (§12);
   - retiring `server/` (§13);
   - upgrade testing (§14);
   - the checklist (§15).

Nothing in the frontier is left assumed. The three open inputs above are the only branches still waiting on the user or on AMO.

### 2. Migration from 1.4.5

#### 2.1 Steps

This is ticket 16 §10's design, made concrete. It runs at the top of every background start, before the reconciler, the replicator or any message handler.

1. **Trigger:**
   - `schema` is absent and any legacy key exists. That covers 1.4.5's nine keys, the 1.5.0 developer keys and `sync:theme`.
   - **Also:** `schema` is absent, no legacy key exists, and `runtime.onInstalled` reports `reason: "update"` with a `previousVersion` starting with `1.`. That's a 1.4.5 user who never set anything up. They get `schema: 1` and the note, with an empty "Kept" section.
   - **Neither applies** (a fresh install, or an empty profile updated while disabled): it's a fresh state. First run opens on `onInstalled` "install", or the popup shows "Waiting for your OK".
2. **Read and convert** in memory, with pure functions ([2.2](#22-values-confirmed)), into:
   - `doc:settings`;
   - `unclaimed`;
   - `device` (`consent: null`, `syncOn: false`, `upgradeNote: {state: "pending", details}` ([2.6](#26-what-the-note-is-built-from))).
3. **Write** all new keys in one `storage.local.set`.
4. **Remove:**
   - the legacy keys in one `storage.local.remove`, including `clientID`, `clientSecret`, `accessToken` and `refreshToken`, and the 1.5.0 developer keys;
   - `theme` from `storage.sync`;
   - IndexedDB `yt-playlist-tools`, with `indexedDB.deleteDatabase`;
   - the session `channelCache`.
5. **Write `schema: 1` last.** Every step is idempotent, so a crash between steps re-runs cleanly.
6. **Open the note:** if `upgradeNote.state` is `pending` and it hasn't been opened yet, open the note page (the `onboarding/` entrypoint's upgrade view, ticket 17) with `tabs.create({active: false})` next to the current tab, then set `upgradeNote.opened = true`.
   - It's a background tab, so a video that's playing isn't interrupted.
   - The toolbar "!" points to it.
   - It opens once only. Afterwards, the popup's banner reopens it.
7. **Until the user agrees,** `device.consent` stays `null`. The reconciler registers nothing, no site core is injected, and no probe runs ([2.4](#24-before-consent)).
8. **Agree** (the note's button) does three things, in one store change:
   - it applies the ticks to the feature switches and the percentage choice ([2.3](#23-the-one-question-the-note-asks));
   - it sets `consent = {v: 1, at}`;
   - it sets `upgradeNote.state = "done"`.

   Then the reconciler registers. Claiming the unclaimed setup ([ticket 11](11-accounts.md)) runs with the first signed-in normal-window tab that answers, and its outcome appears in the note if the note is still open, else as ticket 11's one-time popup notice.
9. **Not now** leaves everything as it was: consent `null`, the note pending, the badge, and the popup's "Review" banner.

#### 2.2 Values, confirmed

Checked against 1.4.5's code at `e96dbf7` (`src/popup/popup.html`, `popup.js`, `content.js`):

| 1.4.5 key | What 1.4.5 *did* | What its popup *showed* | 2.0 value |
|---|---|---|---|
| `requiredWatchPercentage` absent or `""` | Added at once (`… \|\| 0`) | **50** (the input's HTML default) | `0`, and the note asks ([2.3](#23-the-one-question-the-note-asks)) |
| `requiredWatchPercentage` `"0"`–`"100"` | That value | That value (`"0"` is truthy as a string, so it showed 0) | That number, rounded and clamped |
| `toastEnabled` absent | Off | **Off** (checkbox unchecked by default, `popup.html`) | Show feedback **off** for auto-add and playlist shortcuts |
| `toastEnabled` `true` / `false` | On / off | On / off | On / off |
| `watchLaterShortcut` with `Control` | Never fired (`event.controlKey`) | The key | Converted by ticket 08's rules. The note says it never worked. |
| other keys | Fired (any extra modifiers also matched) | The key | Ticket 08's conversion. Matching is exact in 2.0. |
| `playlists`, `addToPlaylistID` | Typed or pasted IDs | Same | `unclaimed`, cleaned as ticket 16 says (`^PL[A-Za-z0-9_-]{16,64}$` after extracting `list=`). The count of dropped entries goes into `details`. |
| credentials | Data API | — | Deleted |

- **Confirmed: carry what 1.4.5 did.** Users experienced 0 % and no toasts. 2.0's measure makes 0 % mean "as soon as 1 s plays", which matches.
  - *Runner-up:* what the popup showed (50 %, toasts on). It lost on two counts: it changes behaviour nobody asked to change, and on toasts it's simply wrong, because the popup showed them off. Ticket 06's "toasts on" came from 1.5.0's defaults.
- **Feedback off still shows failures** ([ticket 12](12-adding.md)). The note says so.
- **Carried playlists** take Videos only and use the default percentage ([ticket 07](07-watched.md)).
- **Shortcuts switch on only if both a key and a playlist came over** ([ticket 08](08-shortcuts.md)). There's no Watch later preset for upgraders. The picker key (Alt+Shift+P) and the undo key (Alt+U) are preset unless taken.

#### 2.3 The one question the note asks

Only when `requiredWatchPercentage` was absent or `""`, which is the one case where 1.4.5 showed one thing and did another:

> 1.4.5 showed 50 % here, but it was actually adding videos as soon as they started playing. Which do you want?
> (•) As soon as a video starts playing, like 1.4.5 did
> ( ) Once half of it is watched, as 1.4.5 showed

- The default is the first option. The choice is applied on Agree. Every other carried value is stated, not asked.
- *Runner-up:* state 0 % silently, as ticket 16 assumed. It lost because the note would show a number the user never saw. Since auto-add waits for Agree anyway, asking costs nothing, and the user's own choice beats either guess (map: "defaults never override what the user chose").
- *Second runner-up:* ask about every value. It lost as noise: the other values showed what they did.

#### 2.4 Before consent

- **Stored but inert:** carried auto-add playlists, the shortcut and every switch are stored, but nothing is registered on any page, so nothing is tracked, added or caught.
- **No request to YouTube is sent before Agree:** no claiming, no playlist titles, no account or signed-in probe.
  - **So before Agree, the note can show only what's stored:** "{N} playlists you chose in 1.x" and the key. Titles and the account appear in the outcome after Agree.
  - **Local checks are fine before Agree:** site access (`permissions.contains`) is a local check, so the note can show **Give access to YouTube** before Agree.
- **The badge is "!"** while the note is pending (ticket 09's "something needs you").
- *Runner-up:* let carried auto-add keep running and ask for consent only for new features. It lost because the map Notes and ticket 06 settle that upgraders keep their features "once they accept". The Chrome-style disclosure must precede handling, and 1.4.5's auto-add handled watch data through Google's API, not through YouTube's page, so it's a different handling.

#### 2.5 Old Google access

- **Delete locally, and link** to `https://myaccount.google.com/permissions` from the note and from Settings › Privacy & data. Add one line for those who made a Google Cloud project only for 1.x.
- *Runner-up:* revoke the refresh token with a fire-and-forget `POST https://oauth2.googleapis.com/revoke`. That needs no host permission (a no-cors simple request). It lost for three reasons:
  - it would be the only request 2.0 ever sends outside YouTube, and it would carry a credential to Google. That muddies AMO's `none` and the "only YouTube" promise;
  - it would itself need consent first;
  - most 1.4.5 users' refresh tokens have likely expired anyway. 1.4.5's own-credentials clients were unverified, and Google expires refresh tokens after 7 days for External apps in Testing (unverified for each user's project).
- *Second runner-up:* a Google host permission plus a proper revoke. It lost because it breaks ADR-0001 and Firefox never grants new origins on update.

#### 2.6 What the note is built from

`device.upgradeNote.details`, written by the migration (refines ticket 16's `unknown`):

```ts
type UpgradeDetails = {
  from: string                       // previousVersion when known, else "1.x"
  autoAdd: { kept: number; dropped: number } // IDs kept in `unclaimed`; entries left out by the clean-up
  pct: { value: number; wasUnset: boolean }  // wasUnset → the note asks (§2.3)
  feedback: boolean                  // from toastEnabled
  shortcut: {
    raw: string                      // 1.4.5's string, shown only when it can't be used
    key: Key | null                  // ticket 08's conversion
    playlist: boolean                // a cleaned playlist came over
    note: "ok" | "ctrl-never-fired" | "unconvertible" | "no-playlist" | "none"
    clash?: string                   // ticket 08's clash warning id, e.g. YouTube's K
  }
  credentialsDeleted: boolean
}
// plus device.upgradeNote.opened: boolean (§2.1 step 6)
```

#### 2.7 Edge cases

| Case | What happens |
|---|---|
| Update lands while the add-on is disabled, or at browser start | No `onInstalled`; the migration still runs from stored state at the next start, and the note opens then (ticket 06) |
| No youtube.com access (installed on Firefox 125/126, or revoked) | The silent update still installs. The note shows "Playlist Pigeon doesn't have access to YouTube in this browser, so nothing can run there yet." with **Give access to YouTube**, requested first in the click (ticket 06) |
| Firefox 128–139 | Stays on 1.4.5 silently; AMO offers 2.0 only to 140+ |
| Signed out, no YouTube tab, or another account at Agree | Ticket 11's outcomes (§3) |
| The user never agrees | Everything stays inert, with the badge. 1.4.5's carried choices are kept indefinitely. |
| AMO rollback of 2.0.0 | Lands on 1.4.5's code, which is **inert** (its credentials were deleted), and leaves 2.0's data alone. Hence §6.4: fix forward for 2.0.0. |
| A later downgrade below a `schema` bump | Ticket 16 §10.1: inert, "Update it to continue" |

### 3. The upgrade note (copy)

This is ticket 09's one page, in a tab. **PROVISIONAL name** (ticket 22). Copy rules:
- `{…}` are values from `details` and the store;
- one sentence per line;
- the glossary's words.

**Tab title:** Playlist Pigeon 2.0

> # YouTube Playlist Tools is now Playlist Pigeon
>
> **2.0 needs no Google credentials anymore.** It works through the YouTube account you're signed in to in this browser, the way YouTube's own buttons do. The client ID, client secret and sign-in tokens you set up for 1.x have been deleted from this browser.
> [Remove 1.x's access from your Google account ↗](https://myaccount.google.com/permissions) · If you made a Google Cloud project just for 1.x, you can delete that too.
>
> **Why the new name:** Google's rules don't allow extensions to be named after YouTube, so YouTube Playlist Tools is now Playlist Pigeon for YouTube™. It's the same add-on, and your settings came along.

*If site access is missing* (above "Kept"):
> ⚠ Playlist Pigeon doesn't have access to YouTube in this browser, so nothing can run there yet. **[Give access to YouTube]**

> ## Kept from 1.4.5 · *Paused until you agree below*

**[✓] Auto-add** · *Doesn't change the page*

Shown when any playlist came over; otherwise the row isn't shown.
- Adds to {N} playlists you chose in 1.x.
  - *If `dropped` > 0:* {M} entries weren't playlist IDs and were left out.
- *Set percentage:* Adds a video once you've watched {P} % of it.
  - *Unset:* the question from [2.3](#23-the-one-question-the-note-asks).
- Auto-add now counts only what you actually watch. Skipping ahead and ads don't count.
- It never adds a video twice, and it tells you when an add fails.
- Confirmations:
  - *feedback off:* Confirmations stay off, as in 1.x. Failures now always show.
  - *feedback on:* Confirmations stay on, as in 1.x.
- Your playlists take videos, not Shorts. You can add Shorts per playlist in Settings.

**[✓] Playlist shortcuts** · *Keys only, doesn't change the page*

Ticked only when `note` is `ok` or `ctrl-never-fired`.
- {Key} saves the video you're watching, or pointing at, to the playlist you chose in 1.x.
- *Ctrl:* {Key} never worked in 1.4.5 because of a bug. It works now.
- *Bare or Shift-only key:* It no longer fires while you type in a search box or a comment.
- *Clash:* ticket 08's warning, e.g. "YouTube uses K for Play/pause. This shortcut replaces it on YouTube."
- *If the presets got keys:* Also new: Alt+Shift+P opens a playlist picker, and Alt+U undoes the last save.
- *Unconvertible* (unticked): Your 1.x key ({raw}) can't be used in 2.0. Set a new one in Settings.
- *Key but no playlist* (unticked): Your 1.x key {Key} had no playlist. Choose one after you agree.

> ## New in 2.0
> All off. Tick any you want, or switch them on later in Settings.

Then one row per other feature, unticked, using ticket 09's names, blurbs and footprint tags: Quick-save on thumbnails, Queue button on thumbnails, Watch-page button, Right-click for the video menu, Quick actions and Quick-action shortcuts (YouTube Music), and Settings sync.

> ## Before you continue

Then the disclosure ([4.1](#41-the-disclosure-shared-copy)), followed by **[Agree and turn on {N} features]** (or **[Agree]** for N = 0) and **[Not now]**.
- If Settings sync is ticked on Firefox and AMO makes sync an optional data type ([11.4](#114-provisional-what-each-amo-reply-changes)), the same click first calls `permissions.request({data_collection: […]})`, before anything is awaited.

**After Agree** (in place; ticket 11's copy):

> ✓ **You're all set.**

Then one of:
- Your auto-add playlists and shortcut from 1.x are now set up for {Account}: {titles}. *(+ "{M} of them weren't on this account and were left out.")*
- Sign in to YouTube and your 1.x playlists will be picked up.
- Open YouTube and your 1.x playlists will be picked up. *(no tab open; new variant)*
- Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them. **[Switch account]**
- Your features are on. *(nothing carried)*

Then **[Open YouTube]** **[Open Settings]**.

**After Not now:**
> Everything stays paused. The toolbar icon keeps a ! until you decide. **[Agree and turn on {N} features]**

### 4. First run: consent and disclosure

Ticket 09's three steps (pick features › Before you start › Finish setting up) stand. This section gives the consent copy and rules.

#### 4.1 The disclosure (shared copy)

It's used in three places, each with its own heading:
- first run: "Before you start";
- the upgrade note: "Before you continue";
- Settings' dialog when a feature is switched on without consent: "Before this feature can run".

> Playlist Pigeon works inside your YouTube and YouTube Music tabs, as the account you're signed in to there. For the features you switch on, it:
> - **reads what you watch and listen to there:** the video or song, its channel, and how much of it you've played;
> - **reads and changes your playlists, as you:** it lists them, checks which ones already hold a video, and adds or removes videos when you ask or when auto-add does, using YouTube's own requests;
> - **signs those requests the way YouTube's page does,** with YouTube's sign-in cookie, inside the YouTube tab. It never stores that cookie or sends it anywhere else; *(PROVISIONAL, ticket 25: drop this line if no signed request ships)*
> - **watches for the shortcut keys you set** on YouTube and YouTube Music pages, and ignores every other key;
> - **keeps its settings in this browser,** including your account's name, @handle and picture, a list of your playlists, and how much of each video you've watched (for up to 30 days).
>
> Nothing is sent to us or to anyone but YouTube. There are no ads and no analytics. If you turn on Settings sync, your settings also travel through {Firefox's | Chrome's} own sync.
> [Privacy policy ↗]

- **Buttons:** **Agree and turn on {N} features** / **Agree** (N = 0) / **Not now**.
- **On Chrome,** if a YouTube Music feature is ticked, the same click calls `permissions.request` for music.youtube.com first (ticket 10). Step 1 says so beforehand: "Chrome will ask for access to music.youtube.com when you agree."
- **Why it reads this way:**
  - **Chrome:** it covers Chrome's categories in plain words (web history, user activity, website content, authentication, the account's name), says what each is for, and gets an explicit OK. That's the in-product prominent disclosure Chrome requires. The listing repeats it, because Chrome's two help pages disagree on whether the listing alone suffices (ticket 03).
  - **AMO:** it also meets AMO §6.2's "shown … immediately after the update" for upgraders.

#### 4.2 The rest of first run's copy

These are ticket 09's lines, final:
- **Step 1 heading:** What should Playlist Pigeon do? / Tick what you want. Everything else stays off.
- **Step 1 footer:** Nothing changes on YouTube until you pick it. You can change this any time in Settings. **[Continue with {N} features]** / **[Continue without features]**
- **Not now:** **Nothing is running.** Agree later from the toolbar icon or Settings. Until then, Playlist Pigeon does nothing on YouTube. **[Back]**
- **Popup while consent is missing:** Waiting for your OK. **[Review]**

#### 4.3 Consent rules

- **One consent of our own gates everything, on both browsers:** `device.consent = {v, at}`, per browser, never synced (ticket 16).
  - It applies on Firefox too, even when Firefox shows its own data-collection prompt. Firefox's prompt covers data types; ours covers what each feature does, and is the moment upgraders' choices take effect.
  - *Runner-up:* let Firefox's built-in consent stand in for ours on Firefox. It lost for three reasons: built-in consent exists only if AMO requires a type; it doesn't cover the feature choice or claiming 1.x playlists; and two consent flows mean two code paths.
- **Versioned.** 2.0 writes `v: 1`. The version is bumped only when the disclosure text changes, which a release must do whenever data handling changes (Chrome: "proactively disclose … if data handling practices change").
  - On a bump, features pause and the popup and note page show "Playlist Pigeon {version} handles your data in a new way. Review and agree to keep it running."
  - The hotfix lane can never bump it (§12.5).
- **Withdraw** in Settings › Privacy & data:
  - Copy: "**Withdraw your consent?** Every feature stops in this browser and nothing is read from YouTube until you agree again. Your settings are kept." with **[Withdraw]** **[Cancel]**.
  - It sets consent to `null`. The reconciler unregisters everything and tears down open tabs.
- **Settings › Privacy & data** shows: "You agreed on {date}." with **[Read it again]** **[Withdraw and pause everything]** (ticket 09).

### 5. Permission prompts by audience

Strings are read from Firefox's `extensions.ftl` and Chromium's `generated_resources.grd` (2026-10-19). Ticket 25's P1 confirms them on real browsers.

| Audience | When | What they see |
|---|---|---|
| **Firefox 1.4.5 upgrader** with youtube.com access (nearly all) | Update, within ~1 day | **Nothing from Firefox.** Then our note tab (§3). |
| Firefox 1.4.5 upgrader **without** access (125/126 installs, or revoked) | Update | Nothing from Firefox. The note's **Give access to YouTube** opens Firefox's permission prompt for the youtube.com domain. |
| Firefox 1.4.5 upgrader on Firefox < 140 | — | Nothing; stays on 1.4.5 |
| Firefox upgrader, **if AMO requires a data type** (PROVISIONAL fallback) | Update | The update is **held**: an app-menu badge, then about:addons: "You must approve new permissions before the updated version will install…", listing the type (e.g. "website activity"). Cancel keeps 1.4.5 and asks again at the next daily check. |
| **Firefox new install** (140+) | Install | "Add Playlist Pigeon for YouTube™?" with "Access your data for sites in youtube.com domains" and "Data collection: The developer says this extension doesn't require data collection." Then first run. |
| Firefox, Settings sync switched on, **if AMO makes sync an optional type** (PROVISIONAL) | That click | "Playlist Pigeon for YouTube™ requests additional data collection" / "The developer says the extension wants to collect: {type}", with Allow / Deny |
| **Chrome new install** | Install | Add "Playlist Pigeon for YouTube™"? / It can: **Read and change your data on www.youtube.com**. Then first run. |
| Chrome, first YouTube Music feature (first run or later) | That click | "Playlist Pigeon for YouTube™" has requested additional permissions. / It could: **Read and change your data on music.youtube.com**, with Allow / Deny |
| Chrome, the user restricted site access | Any time | No prompt by itself. Our **Give access** button calls Chrome's prompt; on Chrome 133+ also `addHostAccessRequest` (ticket 09). |
| Either browser, any later 2.x | Update | **Nothing.** The hotfix lane freezes the manifest. A minor release that adds a warning would disable the Chrome extension until it's accepted and hold Firefox updates, so it needs the checklist's sign-off (§15). |

- `storage` and `scripting` show no warning on either browser (ticket 10).
- `none` itself adds nothing that holds an update (ticket 06).

### 6. Release order and the beta

#### 6.1 Phases

| Phase | Firefox (AMO) | Chrome Web Store | Exit when |
|---|---|---|---|
| **0. Ready** | API key, listing edits drafted | Developer account. First zip uploaded **by hand** (the API can't create items), Store listing and Privacy tabs filled, visibility **Unlisted** | §15 "Once" items done |
| **1. Beta** (≥ 14 days) | Versions `1.99.N` **unlisted** on the *same* add-on ID, with `update_url` → `https://alioun.github.io/yt-playlist-tools/beta/updates.json`. Testers install from the site. | The same item, still Unlisted, gets each `1.99.N` through the API. Testers install from its link. | §6.3 |
| **2. Firefox release** | Tag `v2.0.0` → AMO **listed**. Auto-published within ~24 h; 1.4.5 users update over the following day. | Same day, **by hand** in the dashboard: visibility → Public, upload 2.0.0, "publish manually after approval" (staged). The API can't change visibility, and items publish with their existing visibility. | Released |
| **3. Soak** (7 days) | 66 real upgrades + beta testers; hotfixes ship here in 1–2 days | Review runs in parallel (days; up to weeks) | No open blocker; the watch is green |
| **4. Chrome public** | — | Publish the staged version. If a 2.0.x shipped during the soak, cancel the staged 2.0.0 and submit that version instead. Afterwards every Chrome release goes through the API. | — |

- **Why Firefox first:**
  - existing users and the upgrade path, the riskiest part, are Firefox-only;
  - AMO fixes reach users in 1–2 days, against days to weeks of Chrome review;
  - a Chrome listing's first reviews make or break it, so they should meet the soaked build.
  - *Runner-up:* both stores public on the same day. It lost because a launch bug on Chrome then waits days for its fix, in front of first-time users.
  - *Second runner-up:* Chrome first, since it has no existing users. It lost because Chrome review sets the pace either way, and the slower store would carry the untested build.
- **Why a beta at all:**
  - it's the only way to see the migration on other people's real 1.4.5 data, and YouTube's experiments on accounts other than the developer's;
  - it moves Chrome's slow first review of a new item (closer scrutiny for new developers and items) off the launch path;
  - it costs one static file and a CI channel switch, which later 2.x betas reuse.
  - *Runner-up:* no beta, with the developer's own upgrade tests only. It lost on those three counts.
  - *Second runner-up:* a separate Chrome "BETA" item. It lost because it takes the publisher's second of two default slots, needs "BETA" naming rules, and its testers wouldn't move to the real item.

#### 6.2 Beta channel mechanics

- **Firefox:**
  - `1.99.N` is built by `wxt build -b firefox --mode beta`, which outputs `firefox-mv3-beta` the way ticket 17's `livecheck` mode does. `build/manifest.ts` adds `browser_specific_settings.gecko.update_url` in that mode only; nothing else differs from the store build.
  - It's signed by AMO on the **unlisted** channel of the same add-on. AMO allows listed and unlisted versions under one ID, and AMO rejects `update_url` only in listed versions.
  - It's attached to a GitHub pre-release.
  - `beta/updates.json` is regenerated from the pre-releases, with each `.xpi` and its `sha256` (§12.3).
  - **Installing a beta over 1.4.5** is an upgrade for Firefox (ADDON_UPGRADE): access carries over and the migration runs, exactly as the real update will.
- **Hand-off to AMO:**
  - Firefox keeps using the *installed* version's `update_url`.
  - So once AMO publishes 2.0.0, its signed listed `.xpi` (downloaded from the Developer Hub) is attached to the `v2.0.0` GitHub release, and `updates.json` serves it as the last entry.
  - Testers move to 2.0.0, which has no `update_url`, and from then on follow AMO.
- **Unique numbers:** AMO version numbers are unique across channels, so a beta number is never reused.
- **Recruiting** (no spam, no new channel):
  - a line on the AMO listing during the beta: "A rebuilt 2.0 is in beta: {site}/beta";
  - the README;
  - the GitHub pre-release;
  - the developer's own browsers, daily.
- **In-product:** Diagnostics shows "{version} (beta)". Nothing else differs from the store build.

#### 6.3 Leaving the beta (launch criteria)

- [22](22-name.md) confirmed; [23](23-ask-amo.md) answered, with its outcome applied (§11.4); [25](25-live-checks.md)'s route table filled.
- The upgrade-test matrix (§14) is green on the release candidate.
- At least 14 days of beta, including at least one Chrome review of a `1.99.N` update.
- No open issue labelled `blocker`. The static watch is green; the browser watch is green or inconclusive.
- The signed-in live check and the timing figures are recorded for the candidate (§15).
- The privacy page is live, and the AMO and Chrome listings, screenshots and the dashboard privacy tab are final.

#### 6.4 Rollback rules (refines ticket 18)

- **The general rule stays:** roll back in the store first, then submit the fix.
  - Chrome's rollback discards pending and staged submissions.
  - AMO's rollback cancels pending reviews in the same channel.
- **AMO rollback** republishes the previous *approved listed* version's file under a new, higher number that you choose. Only the version immediately before the current one is offered. Use the next free patch number; the fix then takes the one after.
- **Exception: 2.0.0 on AMO.** Its predecessor is 1.4.5, which is inert after the migration (§2.7). So fix forward through the hotfix lane, and roll back only to *stop harm*: wrong-account writes, a request storm, or data loss. Users then sit on an inert 1.4.5 until the fix.
- **Chrome 2.0.0** rolls back to the last `1.99.N`, which is on the same item with the same `schema`, live within a minute, with no review. That's a side benefit of the beta living on the main item.
- **A release that bumps `schema`** makes rolling back past it inert (ticket 16 §10.1). The checklist flags it (§15).

### 7. Versioning

- **Format:** `MAJOR.MINOR.PATCH`, numbers only. AMO rejects letters for MV3 ("Letters are no longer allowed"), and Chrome allows only dotted integers. `version_name` isn't used, because Firefox ignores it.
- **One source:** `package.json` `version` → both manifests, tagged `v{version}`. The same number on both stores always means the same source.
- **2.0.0** is the first 2.x. 1.5.0 never ships: `package.json` goes from 1.5.0 to `1.99.1` at the first beta.
- **Betas sort below the release they precede:**
  - 2.0's betas are `1.99.N` (above 1.4.5, below 2.0.0);
  - a later 2.Y's betas are `2.(Y−1).9NN`;
  - CI derives the channel from this pattern.
  - Post-launch betas are Firefox-only, because the Chrome item is public by then.
- **PATCH** is the hotfix lane only: the manifest is identical apart from `version`, with no listing, privacy or consent change (§12.5).
- **MINOR** covers features, UI, dependency bumps and `schema` migrations. A permission, host, data-collection or disclosure change is allowed only in a minor, with §15's sign-off.
- **MAJOR** is reserved for a synced-copy layout break (`s:meta.v`, ticket 16) or anything that needs every user to see an upgrade note again.
- **Minimum versions:** Firefox `strict_min_version` "140.0" and `minimum_chrome_version` "121" (ticket 10), **confirmed** for ticket 06's question.
  - 128 lost because AMO's `websiteActivity` fallback would then need a custom consent screen.
  - 153 lost because it strands ESR 140 users mid-migration.

### 8. Listings

All text below is **PROVISIONAL on the name** (ticket 22). It lives in `store/listing/` so the hotfix check can freeze it (§12.5).

#### 8.1 Fields

| Field | AMO (existing listing) | Chrome Web Store (new item) |
|---|---|---|
| Name | **Playlist Pigeon for YouTube™**. Set it in the manifest *and* edit it in the Developer Hub. Slug `youtube-playlist-tools` and gecko ID unchanged. | From the manifest |
| Summary | "Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click away. Every feature is opt-in. (Formerly YouTube Playlist Tools.)" (181 of 250) | Manifest `description` (121 of 132): "Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click away." |
| Description | §8.2, with the "formerly" line first | §8.2, without the "formerly" line |
| Category | **Photos, Music & Videos** (today "Other") | **Tools** (Productivity). *Runner-up:* "Functionality & UI", which reads as page tweaks. |
| Homepage | `https://alioun.github.io/yt-playlist-tools/` | Same |
| Support | `https://github.com/Alioun/yt-playlist-tools/issues/new/choose` | Support URL: same |
| Privacy policy | `…/privacy/`, linked in the description; also pasted into AMO's privacy-policy field while the Developer Hub offers it | Privacy tab URL: `…/privacy/` |
| Icon | Upload the pigeon in the Developer Hub (the listing shows AMO's default today) | 128×128 (96×96 artwork) |
| License | MPL-2.0 (unchanged) | — |
| Compatibility | Firefox desktop only. Leave Firefox for Android unticked (map: out of scope). | — |

#### 8.2 Description (both stores)

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
> • Quick actions: Play next, Add to queue, Save to playlist, Like and Remove from queue, one click away on songs, albums and playlists. You pick which buttons show.
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

- "Shorts" stands alone, so "YouTube Shorts" never appears and the attribution line stays as ticket 22 set it.
- *PROVISIONAL, ticket 23 fallback only:* AMO adds "Firefox asks you to allow sharing 'website activity' because the extension sends YouTube the videos you save, through your own YouTube account. Nothing goes to the developer."

#### 8.3 Release notes for 2.0.0

These go in the AMO release notes (sent as `{"en-US": …}`, §12.2), the GitHub release and the site.

> 2.0 is a rebuild, and YouTube Playlist Tools is now Playlist Pigeon for YouTube™.
> • No Google Cloud credentials anymore: it works through the YouTube account you're signed in to. Your old client ID, secret and tokens are deleted from your browser.
> • Your auto-add playlists, shortcut, watch percentage and toast setting carry over. Nothing runs until you've reviewed them on the page that opens after the update.
> • Auto-add counts only what you actually watch, never adds a video twice, and no longer says "Added" when an add failed.
> • Shortcuts no longer fire while you type, can be cleared, and Ctrl shortcuts work.
> • New, and off until you switch them on: Watch Later, several named shortcuts, quick-save and queue buttons on thumbnails, a watch-page button, creating playlists, Shorts, YouTube Music quick actions, a setup per account, and settings sync.
> • Needs Firefox 140 or later.

#### 8.4 Screenshots and images

- **Five screenshots at 1280×800 PNG,** the same set on both stores. They replace AMO's two 2024 previews.
- **Each has a caption band** in the extension's own type and palette: the pigeon's grey with the teal-to-violet accent, never YouTube red.

| # | Shows | Caption |
|---|---|---|
| 1 | Settings › YouTube: feature rows with footprint tags, two on | Pick only what you want. Everything starts off. |
| 2 | A watch page with the popup: This video "Added to Finished · at 90 %", auto-add playlists unfolded | Auto-add what you actually watch. |
| 3 | YouTube home: the thumbnail stack, and the picker open with check marks and keys | Save from any thumbnail. |
| 4 | A YouTube Music album page: Play next / Add to queue on rows, and the toast "Added 12 songs to the queue · Undo" | YouTube Music, one click away. |
| 5 | Settings › Playlist shortcuts: three labelled shortcuts and the recorder | Your keys, your labels. |

- **Content (ticket 22):**
  - only videos the user owns or Creative Commons videos;
  - a demo account ("Pigeon Demo") with neutral playlists ("Recipes to try", "Finished", "Music for work");
  - no real personal data;
  - YouTube's logo cropped or out of focus.
- **When:** taken from the release candidate in a clean profile, light theme, at 100 % zoom.
- **Chrome small promo tile 440×280 (required):** the pigeon and "Playlist Pigeon" on the palette, with no YouTube imagery. The marquee (1400×560) is skipped at launch.

### 9. Privacy policy

#### 9.1 Hosting

- **Where:** GitHub Pages for this repo, deployed by a workflow from `site/` (§12.3).
  - `/` is a one-page home (what it is, store links, privacy, source, report a problem, beta while it runs).
  - `/privacy/` holds the policy.
  - `/beta/updates.json` is generated.
- **Static HTML:** no third-party scripts, fonts, analytics or cookies of ours.
- **Limited Use:** Chrome requires the statement on the homepage or one click from it, and `/` links `/privacy/`.
- **History:** the page's history is the repo's, and each change is dated on the page.
- **The URL is a published contract:**
  - it's in both stores' privacy fields;
  - it's baked into every installed beta's `update_url`;
  - **renaming the repo moves it, with no redirect.** So no rename while betas are installed. A later rename (ticket 22 calls it optional) updates both stores' fields the same day.
  - A custom domain (e.g. playlistpigeon.app) would decouple it. That's the user's call and costs a yearly fee.
- *Runner-up:* a `PRIVACY.md` viewed on github.com. It lost because Chrome asks for "a website belonging to your extension", and a blob page sits inside GitHub's own UI.
- *Second runner-up:* Pages from `/docs`. It lost because it would publish ADRs and agent docs as the site.

#### 9.2 Text

> # Privacy policy: Playlist Pigeon for YouTube™
>
> *Effective {2.0.0 release date}. Covers version 2.0 and later of the Playlist Pigeon for YouTube™ browser extension (formerly YouTube Playlist Tools) for Firefox and Chrome. Developer: Alioun (github.com/Alioun).*
>
> **In short:** Playlist Pigeon has no server. It works inside your YouTube and YouTube Music tabs, as the account you're signed in to there, and keeps its settings in your browser. Nothing is sent to the developer or to anyone else. No analytics, no ads, no tracking.
>
> ## What it handles, and why
> Only for features you switch on, and only after you agree to the notice the extension shows first:
> - **What you watch and listen to on YouTube and YouTube Music:** the video or song you're on, its channel, and how much of it you've actually played. Used by auto-add, channel filters, shortcuts and the watch-page button.
> - **Your playlists:** their names, privacy setting, number of items and thumbnail links, and which of them hold a given video. Used to let you choose playlists, to show where a video already is, and to never add it twice.
> - **Your YouTube account's name, @handle and picture link,** and a code derived from YouTube's internal account ID (the ID itself is never stored). Used to keep a separate setup per account and to show which one is in use.
> - **Keys you press on YouTube and YouTube Music pages:** only to recognise the shortcut keys you set. Other keys are ignored and never recorded.
> - **YouTube's sign-in cookie, inside your YouTube tab:** to sign the extension's requests to YouTube the same way YouTube's own page does, where YouTube's code can't send a request itself. It's used on the spot and never stored, logged or sent anywhere but YouTube. *(PROVISIONAL, ticket 25)*
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
> - Watch progress per video (which stretches you played, the length, when it last played). It's deleted once auto-add has run for that video, if the video's length changes, 30 days after it last played, or when you switch auto-add off.
> - Settings from 1.x that are waiting for their account.
> - Until the browser closes: pause, videos you chose not to auto-add, recent adds (one minute), and notes about YouTube changes that stop a feature. These never name a video, playlist, channel or account.
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

### 10. Chrome Web Store dashboard answers

These are kept in `store/cws-dashboard.md`, which the hotfix check freezes.

- **Single purpose:**
  > Playlist Pigeon organises what the user watches and listens to on YouTube and YouTube Music into their own playlists, queue and likes: automatically after a video is watched (optionally filtered by channel), with keyboard shortcuts, or with one-click buttons for YouTube's and YouTube Music's own save, queue and like actions.
- **Permission justifications:**
  - **`storage`:** "Keeps the user's settings in the browser: which features are on, the playlists each feature uses per YouTube account, shortcut keys and labels, channel filters, a cached list of the user's playlists, and auto-add's watch progress (deleted after 30 days)."
  - **`scripting`** (ticket 10): "Adds each feature's script to YouTube pages only while that feature is switched on, and reads data from an open YouTube tab when the popup or settings need it."
  - **`https://www.youtube.com/*`:** "The extension's features run on YouTube: they read which video is playing and how much has been played (auto-add), catch the user's shortcut keys, draw the buttons the user switched on, and send YouTube's own playlist requests from the user's YouTube tab, as the signed-in user."
  - **`https://music.youtube.com/*` (optional):** "Requested only when the user switches on a YouTube Music feature: it adds the quick-action buttons and keys to YouTube Music and runs YouTube Music's own queue, save and like actions in that tab."
- **Remote code:** "No, I am not using remote code." Everything ships in the package. The extension sends YouTube's own requests and hands YouTube's command objects back to YouTube's page code; it fetches and evaluates nothing.
- **Data usage**, following the policy text rather than the lightest precedent (ticket 03):

| Category | Tick | Because |
|---|---|---|
| Personally identifiable information | ✔ | The account's display name and @handle are stored, and synced if sync is on (ticket 11) |
| Health, Financial and payment, Personal communications, Location | — | Not handled |
| Authentication information | ✔ **PROVISIONAL (ticket 25)** | The page reads YouTube's sign-in cookie to sign requests (ticket 10 §3) |
| Web history | ✔ | Which videos were watched, kept as watch progress for up to 30 days |
| User activity | ✔ | Playback progress, the shortcut keys pressed, clicks on our controls |
| Website content | ✔ | Playlist names and thumbnails, video and channel titles |

- **Certifications:** all three ("I do not sell user data to third parties"; "…unrelated to my item's single purpose"; "…creditworthiness or for lending purposes").
- **Privacy policy URL:** `https://alioun.github.io/yt-playlist-tools/privacy/`.
- **Test instructions** (optional on Chrome; given briefly): "Sign in to youtube.com with any Google account that has a YouTube channel. On the first-run page, tick Auto-add and Playlist shortcuts, then Agree. Pick a playlist, play any video for a few seconds with the required percentage at 0 % (Settings › YouTube › Auto-add), and press Alt+W to save to Watch later. Add to queue on thumbnails and the YouTube Music queue actions work without signing in."
- **Distribution:** all regions. Visibility is Unlisted during the beta and Public at launch (§6.1).

### 11. AMO: reviewer notes, sources README, test account

#### 11.1 Reviewer notes (`approval_notes`)

The full template is used for 2.0.0 and every minor. CI fills `{…}` from `store/notes/` and the `amo` environment's secrets (§12.4).

> **What this is.** 2.0 is a ground-up rewrite of YouTube Playlist Tools, renamed Playlist Pigeon for YouTube™ (same ID and slug). 1.x used the YouTube Data API with users' own OAuth credentials; 2.0 drops that entirely: no `identity` permission, no Google hosts, no server.
>
> **How it works.**
> - Every request goes from an open youtube.com or music.youtube.com tab, through the user's own signed-in session, to youtube.com itself.
> - Two scripts per tab, both registered at runtime with `scripting.registerContentScripts` only while a feature for that site is on:
>   - an isolated-world bridge;
>   - a `world: "MAIN"` gateway that calls YouTube's own client code.
> - There are no static content scripts and no web-accessible resources.
>
> **Routes, in order of preference:**
> 1. YouTube's own command resolver (located by shape at page load: `default_kevlar_base.<key>.instance.resolveCommand`);
> 2. YouTube's `yt-service-request` action;
> 3. YouTube Music's own `ytmusic-app` handlers (`networkManager.fetch`, `app.queue`);
> 4. only where none of these can do a job quietly, a same-origin `fetch` to `/youtubei/v1/…` signed in the page from YouTube's session cookie exactly as YouTube's code does (`SAPISIDHASH`). *(PROVISIONAL, ticket 25)*
>
> No `cookies` permission, no Origin rewriting, no remote code, config or selectors.
>
> **Endpoints:** `playlist/get_add_to_playlist`, `browse` (`FEplaylist_aggregation`; channel pages), `browse/edit_playlist`, `playlist/create`, `account/account_menu`, `navigation/resolve_url`, `next`, `reel/reel_item_watch`, `music/get_queue`, and like / queue commands through YouTube Music's handlers. *(Final list: ticket 25's route table.)*
>
> **Permissions:**
> - `storage`: settings;
> - `scripting`: per-feature registration and reading from an open tab for the popup;
> - `*://*.youtube.com/*`: the only site. It's the exact pattern 1.x's content script was granted, kept so the update is silent.
>
> **Data collection: `none`.** Nothing is sent to the developer or any third party. The only requests are YouTube's own, from the user's YouTube tab, for actions the user takes or for auto-add, which the user switches on. A first-run screen discloses this and requires an explicit Agree before any feature runs. {PROVISIONAL: "As confirmed in {thread link} on {date}."}
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
> 3. Set Settings › YouTube › Auto-add › required percentage to 0 %, then open any video: "Added … to Reviewer A" appears.
> 4. Press Alt+W: "Saved … to Watch later", with Undo; Alt+U undoes.
> 5. On the home page, hover a thumbnail: the queue button adds it to the queue.
> 6. On music.youtube.com, switch on Quick actions (Settings › YouTube Music) and hover a song: Play next.
>
> Without signing in, the queue button and YouTube Music's queue actions still work.

- **Hotfix template** (ticket 18, unchanged): "Fixes {feature} after a YouTube change to {internal}. No permission, data or listing changes. Same build instructions as {previous version}." The test-account lines are appended.
- **Beta template** (unlisted): "Pre-release {version} of {next release}, self-distributed to testers. Same build instructions."
- **Credentials:** they go in through the `amo` environment secret `AMO_REVIEWER_LOGIN`, never into the repo. This isn't ADR-0005's "no Google account in CI": CI never signs in to anything; it only pastes text that AMO shows to reviewers.
  - *Runner-up:* "any Google account works", with no credentials. It lost because AMO §3 requires test credentials when an account is needed, and reviewers may not use personal accounts.
- **Google's sign-in check:** AMO reviewers sign in from unknown places, which triggers Google's verification. The account has 2-Step Verification with backup codes; two fresh codes go into each submission, and §15 has the user refresh them.

#### 11.2 Sources README (`SOURCE_CODE_REVIEW.md`, in the sources zip)

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
> **Layout** (ticket 17 §8):
> - `src/entrypoints/`: thin WXT entrypoints.
> - `src/background/`: storage, script registration, adds.
> - `src/page/`: the page-world gateway that calls YouTube's own client.
> - `src/site/`: the isolated-world core, the UI kit and the features.
> - `src/ui/`: the popup, settings and onboarding.
> - `src/shared/`: shared code.
> - `build/`: build helpers.
> - `src/livecheck/`: a developer-only page. `build/livecheck.ts` drops it from every store build, and CI's `check:zip` verifies that.
>
> License: MPL-2.0.

- **`package.json`** gains `"build-for-amo": "npx --yes bun@1.4.3 install --frozen-lockfile && npm run build:firefox"`.
  - Whether AMO's private automatic builder runs it, and with network access, is **unverified**. If it fails, the human reviewer follows the README.
  - CI checks that the Bun version in the README and in `build-for-amo` equals `packageManager` (`bun@1.4.3`, tickets 04 and 17).
- **Node 24 in CI:** the release build and both rebuild jobs pin Node 24, the reviewer's version, so the build runs on the same Node.
- **Excluded from the sources zip** (`zip.excludeSources`): `store/`, `site/` and `tools/`, none of which are needed to build. `src/livecheck/` stays in, so the sources match the repo; the README says what it is.

#### 11.3 Test account for reviewers

The user creates it (§15): a dedicated Google account that is used for nothing else, with:
- a YouTube channel (needed to create playlists);
- three playlists, "Reviewer A", "Reviewer B" and "Reviewer C";
- YouTube Music opened once;
- 2-Step Verification with backup codes.

The same account can be the screenshot demo account (§8.4).

#### 11.4 PROVISIONAL: what each AMO reply changes

These are [ticket 23](23-ask-amo.md)'s four questions.

| AMO says | Firefox manifest | 1.4.5 update | Copy and policy |
|---|---|---|---|
| **Q1 `none` is right; Q2 sync isn't transmission** (expected) | `required: ["none"]` | Silent | As drafted |
| Q1 `none`; **Q2 sync counts** (as an optional type) | `required: ["none"]`, plus `optional: [<type>]` | Silent | The sync switch asks Firefox first (ticket 16 §11). Privacy policy: "On Firefox, switching sync on first asks for Firefox's permission." The upgrade note's Agree requests it when sync is ticked (§3). |
| **Q1: YouTube requests count** | `required: ["websiteActivity"]` (or the type named), with the 140 floor kept | **Held** behind Firefox's prompt; Cancel keeps 1.4.5 | The §8.2 fallback line on AMO; release notes: "Firefox will ask you to approve sharing website activity: that's the videos you save, sent to YouTube through your own account." Our note is unchanged. |
| **Q3: settings changed in private windows must not be saved** | — | — | Ticket 16's write table refuses shared-settings writes from private windows too. The private-window popup copy says "Settings can't be changed in a private window." |
| **Q4: Bun accepted** | — | — | As drafted |
| **Q4: Bun not accepted** | — | — | Fallback: only the *install* step changes, because the build already runs on Node (ticket 17). Commit a `package-lock.json` that CI regenerates and checks against `bun.lock`'s resolved versions; the sources README then says `npm ci && npm run build:firefox`. Bun stays for development, tests and scripts. **It adds a second lockfile, so the user is told when it happens.** |

### 12. CI and release workflows

#### 12.1 `ci.yml`

**Ticket 17's jobs stand:**
- **`check`:** typecheck, then `test:coverage` with the guards.
- **`build`:** both builds, then `check:manifest` (ticket 10 §11 per browser), then `check:budget`.
- **`browser`:** the real-browser layer, with timings at 1.5×.

`watch.yml` is a separate scheduled workflow with `static`, `browser-watch` and `report`. This ticket adds:
- **Remove:**
  - the `broker` job, with `server/` (§13);
  - Vitest and the jq checks, replaced by ticket 17's `check` and `build`.
- **`check:manifest` also asserts:**
  - `commands` is only `_execute_action` (ticket 08);
  - no `update_url` unless the mode is `beta`;
  - the manifests' `version` equals `package.json`.
- **`check:manifest --report-against <last release tag>`** (report only, in `build`): it writes any manifest difference from the last release to the job summary. A permission or host change is then visible in the PR that makes it.
- **One more job, `sources`:** pushes to `main` only, on `ubuntu-24.04-arm`. It builds the Firefox sources zip and rebuilds it per `SOURCE_CODE_REVIEW.md` on Node 24, so ARM64 drift shows up before a release.
- **`watch.yml`** gets a `workflow_call` trigger, so `release.yml` can run it as a gate.

#### 12.2 `release.yml`

**Triggers:**
- a pushed tag `v*`;
- `workflow_dispatch` with inputs `stores` (choice: both / amo / cws / none) and `allow_red_watch` (boolean, which needs a reason in `reason`).

**Jobs:**

```
meta ─► build ─► gates (all must pass) ─┬─► submit-amo  (environment: amo)
                                        ├─► submit-cws  (environment: cws)
                                        └─► github-release
```

1. **`meta`:**
   - The tag must equal `v{package.json version}`, and the version must be above the last release tag.
   - It derives the **channel** (beta when the version is `1.99.N` or `X.Y.9NN`, §7) and the **kind** (major / minor / patch), and finds the previous release tag.
2. **`build`** (ubuntu-24.04, Node 24, Bun from `packageManager`, i.e. 1.4.3):
   - ticket 17's `check` steps (`typecheck`, `test:coverage`);
   - the Chrome zip, the Firefox zip and sources zip, and for betas the `--mode beta` Firefox zip;
   - upload them as artifacts, together with both built manifests.
   - **What's gated is what ships:** later jobs download these exact files (`actions/download-artifact@v8`).
3. **`gates`**, in parallel; every one is required:

| Gate | Check |
|---|---|
| `sources-x64`, `sources-arm64` (`ubuntu-24.04-arm`, free on public repos) | Unzip the sources zip, follow `SOURCE_CODE_REVIEW.md` exactly (`npx --yes bun@1.4.3 install --frozen-lockfile`, then `npm run build:firefox` on Node 24), and diff the output tree with `build`'s. Trees are compared rather than zips, because of zip timestamps. |
| `manifest` | `check:manifest` on the store builds: ticket 17's rules plus §12.1's. The beta build carries exactly the beta `update_url`. |
| `budget` | `check:budget` on the store builds (ticket 24); the table goes to the job summary |
| `zip` | `check:zip` (ticket 17): no `src/livecheck/` entrypoint and no recording adapter in any store zip (ticket 18) |
| `browser` | Ticket 17's real-browser layer on the store builds |
| `watch` | `watch.yml` through `workflow_call`, from **this commit's** watch list, so a fix's new needles are what's tested. `static` must be green and `browser-watch` green or inconclusive. A red `static` passes only with `allow_red_watch` and a reason, which the summary records. |
| `live-check-record` | `store/live-checks/{version}.json` exists. The live-check build (`build:livecheck`, `src/livecheck/`) exports it (redacted: version, commit, browser and version, date, pass/fail per check, no values). It must cover Chrome and Firefox, contain no failures, and be dated within 7 days of the tag. For patch releases a `scope: "hotfix"` record listing the affected jobs is accepted (ticket 18). |
| `hotfix-freeze` (patch only, §12.5) | The manifests are identical to the previous release's apart from `version`, and listing, policy and consent files are unchanged |

4. **`submit-amo`:**
   - **When:** `vars.PUBLISH_AMO == 'true'` and `stores` allows it; it waits for the `amo` environment's approval.
   - **Release:** `bunx wxt submit --firefox-zip … --firefox-sources-zip …` with `FIREFOX_CHANNEL=listed`, plus `FIREFOX_AMO_METADATA_FILE` built by `scripts/amo-metadata.ts` from `store/notes/` and `store/release-notes/{version}.md`.
     - **Gotcha:** AMO v5 wants `release_notes` as `{"en-US": "…"}`. publish-browser-extension's docs example uses a plain string, which AMO rejects.
   - **Beta:** `web-ext sign --channel=unlisted` with the sources zip and the same metadata. It waits for the signature and downloads the signed `.xpi`, which goes to `github-release`. The build confirms web-ext's source-upload flag.
5. **`submit-cws`:**
   - **When:** `vars.PUBLISH_CWS == 'true'` and `stores` allows it; it waits for the `cws` environment's approval.
   - **What:** `bunx wxt submit --chrome-zip …` with `CHROME_API_VERSION=v2` (it must be set explicitly, or the tool falls back to v1.1's variables) and `CHROME_PUBLISH_TYPE` from `vars.CWS_PUBLISH_TYPE`. Patch releases always use `DEFAULT_PUBLISH`.
   - **No `skipReview`:** API v2 skips review only for updates that change nothing but declarativeNetRequest rules, and it *errors* otherwise. Ticket 18's "try skipReview" is dropped.
   - **Not for 2.0.0:** v2.0.0 runs with `PUBLISH_CWS=false`, because that one Chrome submission is made by hand (§6.1).
6. **`github-release`:** creates the release (a pre-release for betas) with:
   - the zips and the sources zip;
   - the signed beta `.xpi`;
   - `manifest.chrome.json` and `manifest.firefox.json`, which later patch releases compare against;
   - the release notes.

   It then triggers `pages.yml`.
- **Permissions:** `contents: read` everywhere except `github-release` (`contents: write`).
- **`PUBLISH_TO_STORES` is retired.**

#### 12.3 `pages.yml`

- **Triggers:** pushes to `main` touching `site/**`, a published release, and dispatch.
- **What it does:** deploys `site/` with `actions/configure-pages@v6`, `upload-pages-artifact@v5` and `deploy-pages@v5`. Before that, it generates `beta/updates.json` from the GitHub releases:
  - every pre-release `.xpi`, with `update_link` (an HTTPS release-asset URL) and `update_hash` (`sha256:`);
  - then, as the hand-off, the newest release's AMO-signed `.xpi`, if one is attached (§6.2);
  - `applications.gecko.strict_min_version` is "140.0".
- **No bot commits:** the file is generated at deploy time and never committed.

#### 12.4 Secrets, variables and environments

- **Environments** (free on public repos), each with the developer as required reviewer and self-review allowed:
  - **`amo`:** `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `AMO_REVIEWER_LOGIN`.
  - **`cws`:** `CHROME_PUBLISHER_ID`, `CHROME_EXTENSION_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`. Store the PEM with real newlines; the submit path doesn't convert `\n`.
- **Repo variables:**
  - `PUBLISH_AMO` and `PUBLISH_CWS` are the standing per-store switches. The environment approval is the per-run "go", and **Reject** holds one store for that run.
  - `CWS_PUBLISH_TYPE` is `DEFAULT_PUBLISH`, or `STAGED_PUBLISH` when Chrome should wait for a manual publish.
- **Delete:** `PUBLISH_TO_STORES`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`, and any repo-level copies of the store secrets.
- **Tag ruleset:** "Restrict creations" on `v*` (free on public repos), so only the maintainer can trigger a release.
- **`.env.submit.example`** becomes:

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

#### 12.5 Hotfix lane checks (ticket 18, made mechanical)

- **Branch:** `hotfix/X.Y.Z` from the last release tag. CI runs on its PRs as usual.
- **`hotfix-freeze`** runs for any patch release:
  - `check:manifest --against v{previous}` (ticket 17) compares the new manifests with the previous release's, `version` removed, and any difference fails. It reads the old manifests from that tag's GitHub Release assets (§12.2 step 6) rather than rebuilding the tag;
  - `git diff --quiet {previous tag} -- store/listing store/cws-dashboard.md store/notes/reviewer-full.md site/privacy` must pass;
  - the consent version constant must be unchanged.
- **Gates:** the usual gates, with the hotfix-scope live-check record.
- **Chrome:** `DEFAULT_PUBLISH` (publish on approval).
- **Afterwards:** comment on the `youtube-change` issue, then merge back to `main`.

### 13. Retiring `server/` and the auth docs

- **When:** the first slice of the 2.0 build, one PR ("Retire the token broker"), before the first beta. Before it, tag the last commit that has them as `archive/token-broker`, so the code stays easy to find.
- **Delete:**
  - `server/` (`index.ts`, `handler.ts`, `handler.test.ts`, `Dockerfile`, both compose files, `.env.example`);
  - the root `.dockerignore`;
  - the root `.env.example` (`WXT_AUTH_SERVER_URL`);
  - the `server` and `server:dev` scripts;
  - the broker job in `ci.yml`;
  - the `docker` ecosystem in `.github/dependabot.yml`;
  - README's "Authentication", "Registering an OAuth client", "Token broker" (with its subsections) and the `.env` / `server/.env` rows under "Environment files".
  - The 1.x OAuth code (`src/lib/auth*`) goes with the 2.0 rewrite.
- **Replace** with:
  - a short README "How it works" that links ADR-0001;
  - a "Releasing" section that links `RELEASING.md` (§15's checklist, created by the build).
- **Outside the repo (the user):**
  - stop any deployed broker (e.g. the Dokploy service);
  - delete its Google OAuth "Web application" client, and the Cloud project if that was its only use;
  - after the v2 service account works, delete the Chrome Web Store API v1.1 OAuth client and its refresh token.

### 14. Upgrade testing plan

**Harness** (`scripts/upgrade-test/`, built with 2.0):
- `old.xpi`: 1.4.5's files from `e96dbf7`, with `browser_specific_settings.gecko.update_url` added, unsigned.
- `new.xpi`: the release candidate's Firefox build, same ID, unsigned.
- `updates.json`: lists `new.xpi` with its `sha256`, served over **HTTPS** on localhost with a locally trusted certificate (e.g. mkcert). Firefox requires HTTPS for update manifests.
- **Browsers:** Firefox ESR 140 (the floor), ESR 153 and Developer Edition. All three honour `xpinstall.signatures.required = false`; release builds don't.

**Scenarios:** each runs in a fresh profile, seeded by using 1.4.5's own popup and options page like a user.

| # | Seeded state | Must hold after "Check for Updates" |
|---|---|---|
| S1 | Two playlist entries (one pasted URL, one half-typed); key `Shift+S`; percentage and toasts untouched | **No prompt.** `schema: 1`; `unclaimed.autoAdd` has 1 ID, `dropped: 1`; `pct 0` with `wasUnset`; feedback off; shortcut on with Shift+S; every legacy key and credential gone; the note tab opens once (background), with the percentage question; badge "!" |
| S2 | Percentage `"75"`, toasts on, `Control+Shift+S`, dummy client ID and secret | `pct 75`, no question; feedback on; the note says Ctrl+Shift+S never worked; `credentialsDeleted` |
| S3 | 1.4.5 installed, nothing set | No migration keys. `schema: 1` and the note pending (from `onInstalled` "update" from 1.x), with no "Kept" rows |
| S4 | Key `Control+Alt+K` | Shortcut unticked with "can't be used in 2.0", and `raw` shown |
| S5 | youtube.com access removed in about:addons | Silent update; the note shows **Give access to YouTube**; after granting, Agree works |
| S6 | Add-on disabled during the update, enabled a day later | No `onInstalled`; the migration still runs on enable; the note opens |
| S7 | S1, then browser restart before and after Agree | The note doesn't reopen; no second migration; Agree survives |
| S8 | S1, with Agree while signed out / no YouTube tab / on an account that doesn't own the playlists | Ticket 11's three outcomes, in the note |
| S9 | S1 on ESR 140 vs ESR 153 vs DevEdition | Same results |
| S10 | (Optional) the AMO-rollback drill: serve "1.4.5's code as 2.0.1", then a fixed 2.0.2 | 1.4.5 stays inert; 2.0.2 finds `schema: 1` and keeps the data |
| S11 | S1, with a YouTube watch page and the home page already open (and a video playing) when the update lands | Before Agree: 1.4.5's leftover script in those tabs does nothing visible (its extension context is gone, so its sends fail), and nothing of 2.0 is injected. After Agree: the registrar injects into those open tabs **without a reload**, and auto-add and the shortcut work there. |
| S12 | 2.0 → 2.0 update with features on and YouTube and YouTube Music tabs open (the `1.99.N` → `1.99.N+1` beta updates on both browsers, and the harness on Firefox) | Both browsers clear registrations on update. The start-up reconcile registers them again and injects into the open tabs; the new core's `ppt:retire` makes the old core and gateway dispose themselves (ticket 17 §5.5). Check: no doubled buttons, toasts or key handling, auto-add keeps counting, and fresh tabs get the scripts. **PROVISIONAL until ticket 17's real-browser layer has run an update in both browsers.** |

**Checks for every scenario:**
- Before Agree, **nothing** runs on YouTube: no registered scripts (`scripting.getRegisteredContentScripts()` is empty) and no extension context in the page.
- After Agree, auto-add adds, the shortcut fires, and claiming shows its outcome.
- "Not now" keeps everything inert, with the banner.

**Fixtures:** each seeded profile's `storage.local` is dumped (about:debugging › Inspect › Storage) and committed as `src/…/migration/fixtures/1.4.5-S{n}.json`. The pure migration is then tested against these real snapshots in `bun test`, not hand-made ones.

**Signed paths on release Firefox:**
- **During the beta:** the developer installs AMO's real 1.4.5 in a release-Firefox profile, then installs `1.99.1` from the site (an upgrade-by-install), lets `1.99.N` arrive through `update_url`, and finally takes the hand-off to listed 2.0.0.
- **Unverified shortcut, to try once:** override the `extensions.update.url` pref so real 1.4.5 "updates" to a signed `1.99.N`.

**Chrome:** there are no 1.x users. The unlisted item's `1.99.N` → `1.99.N+1` store updates are scenario S12 on Chrome: registrations come back after the update (ticket 10's P2, answered from source by ticket 17), open tabs keep working through the `ppt:retire` handover, consent persists, and no note shows. One dashboard rollback is rehearsed during the beta.

### 15. Release checklist

This goes into `RELEASING.md` in the build; `release.yml`'s summary links to it.

**Once, before the first beta**
- [ ] Ticket 22's name confirmed: the manifest's `name`, `short_name`, `description` and icons.
- [ ] Ticket 23's reply recorded and §11.4 applied. Ticket 25's route table filled; Authentication-information lines kept or removed everywhere (disclosure, policy, dashboard, reviewer notes).
- [ ] The Chrome Web Store developer account is ready (2SV, fee, publisher name, verified contact e-mail, trader / non-trader). The first zip is uploaded by hand as **Unlisted**; the Store listing and Privacy tabs are filled from §8 and §10.
- [ ] The service account is created, the Chrome Web Store API is enabled, and the account is added under Account in the dashboard. The `amo` and `cws` environments, variables and tag ruleset are set up (§12.4); old secrets are deleted.
- [ ] Pages is enabled (source: GitHub Actions); `/` and `/privacy/` are live and read through.
- [ ] The reviewer test account is ready and `AMO_REVIEWER_LOGIN` is set.
- [ ] `server/` is retired, with any deployment shut down and its OAuth client deleted (§13).
- [ ] Screenshots and the promo tile are in `store/listing/`.

**Every release**
- [ ] `package.json` version bumped; `store/release-notes/{version}.md` written.
- [ ] **The watch is alive:** `gh workflow view watch.yml` shows it enabled, with a scheduled run in the last 2 days (if not, `gh workflow enable watch.yml`). GitHub disables schedules after 60 days without activity.
- [ ] The signed-in live check is run in Chrome and Firefox from this commit's live-check build; captures imported; `store/live-checks/{version}.json` committed.
- [ ] The timing test is run at 1× and 4× on the reference machine in Chromium and Firefox, with the figures in the release PR (ticket 24).
- [ ] **Manifest changed** (the `--report-against` table in the `build` summary)? List each change.
  - A new install warning disables Chrome until accepted and holds Firefox updates, so prefer none.
  - Data handling changed? Bump the consent `v`, and update the privacy policy and the dashboard privacy tab in the same release.
- [ ] **`schema` bumped?** Note in the release PR: "Rolling back past this version leaves the extension inert."
- [ ] Tag `v{version}`. Read the gate summary (sizes vs `main`, manifest diff, watch), then approve `amo` and `cws` (or reject one).
- [ ] Afterwards:
  - AMO shows the version public (≤ 24 h); Chrome shows it approved and published;
  - the GitHub release is out;
  - reviews and issues are watched for 48 h;
  - the reviewer account's backup codes are refreshed if they were used.

**Beta**
- [ ] Tag `v1.99.N`. The unlisted signature is downloaded and attached to the pre-release; `…/beta/updates.json` lists it; the Chrome unlisted item is updated through the API.

**Hotfix** (ticket 18)
- [ ] `hotfix/X.Y.Z` from the last tag; only the broken route, parser or anchor changes, plus its fixtures and watch-list entry.
- [ ] Gates with a hotfix-scope live-check record; tag `vX.Y.Z`; `hotfix-freeze` passes.
- [ ] Reviewer notes from the hotfix template. Afterwards, comment on the `youtube-change` issue and merge back.

**Bad release**
- [ ] Roll back first: AMO Developer Hub › Roll back, with the next patch number; the Chrome dashboard's rollback. Then submit the fix.
- [ ] Exception: 2.0.0 on AMO. Fix forward, and roll back only to stop harm (§6.4).

**The 2.0 launch, once**
- [ ] §6.3's criteria are met.
- [ ] Tag `v2.0.0` with `PUBLISH_CWS=false`; approve `amo`.
- [ ] By hand in the Chrome dashboard: visibility Public, upload the `v2.0.0` Chrome zip from the run's artifacts, choose "publish manually after approval".
- [ ] When AMO shows 2.0.0 public, on the AMO listing:
  - edit the name, summary, description, category, homepage, support URL, privacy policy, icon and screenshots (§8);
  - remove the beta line.
- [ ] Attach AMO's signed 2.0.0 `.xpi` to the `v2.0.0` GitHub release (the beta hand-off) and check `updates.json`.
- [ ] Soak for 7 days. If a 2.0.x ships meanwhile, cancel the staged Chrome 2.0.0 and submit 2.0.x.
- [ ] Publish on Chrome, add the Chrome link to `/` and the README, and set `PUBLISH_CWS=true` and `CWS_PUBLISH_TYPE=DEFAULT_PUBLISH`.

### 16. Support channel

- **GitHub issues is the one channel**, with two issue forms:
  - **Problem:** what happened, browser and version, and a "Diagnostics report" field for the report copied from Settings;
  - **Idea.**
- **Links:**
  - Diagnostics' **Report a problem** opens `issues/new?template=problem.yml`;
  - **Known problems** opens issues labelled `youtube-change` (ticket 18);
  - both stores' support fields and the privacy page link `issues/new/choose`.
- **People without a GitHub account** can use the stores' review sections, which the developer reads weekly.
- *Runner-up:* e-mail only. It lost because it gives no public "known problems" list and publishes a personal address.
- **PROVISIONAL:** adding an e-mail as a second channel stays the user's call (for-the-user.md). The Chrome Web Store's contact e-mail is the developer account's verified address either way.

### 17. Judgement calls at a glance

| Decision | Chosen | Runner-up, and why it lost |
|---|---|---|
| 1.4.5 values | What 1.4.5 did (0 %, feedback off unless set, Ctrl keys carried) | What the popup showed: changes behaviour nobody asked for, and wrong on toasts, which the popup showed off |
| The 50 % / 0 % mismatch | Ask once in the note, defaulting to what 1.4.5 did | State 0 % silently: a number the user never saw |
| Old OAuth tokens | Delete locally, link to Google's permissions page | A no-cors revoke: the only non-YouTube request 2.0 would ever send, carrying a credential |
| Consent | One versioned consent of our own on both browsers | Firefox's built-in consent stands in: exists only in the fallback, and covers neither feature choice nor claiming |
| Note tab | Opens once, in the background | Foreground tab: interrupts a playing video. Badge only: reads as "2.0 broke auto-add" (ticket 09). |
| Release order | Firefox listed → 7-day soak → Chrome public (staged during the soak) | Same day: Chrome fixes take days. Chrome first: the slow store carries the untested build. |
| Beta | Self-hosted unlisted Firefox builds of the same ID + the Chrome item Unlisted | No beta: no real-data migration, and Chrome's first review on the launch path. A separate Chrome BETA item: takes the second slot, and testers don't move over. |
| Beta numbers | `1.99.N` (later `X.(Y−1).9NN`) | Letters or pre-release tags: AMO rejects letters for MV3 |
| 2.0.0 rollback on AMO | Fix forward; roll back only to stop harm | Roll back first (ticket 18's rule): lands on an inert 1.4.5 |
| Chrome hotfixes | `DEFAULT_PUBLISH`, no `skipReview` | Try `skipReview`: v2 errors unless only DNR rules changed |
| Publishing control | Protected environments plus per-store variables | One `PUBLISH_TO_STORES`: can't hold one store or keep secrets per store |
| Gating | Gate and ship the same artifacts; sources rebuilt on ARM64 and x86-64 | Rebuild per job: what's gated isn't what ships. x86-64 only: AMO reviews on ARM64. |
| Live-check gate | A committed, redacted record per version | Trust the checklist tick: can't be verified |
| Privacy page | GitHub Pages from `site/`, static, no third parties | A github.com blob: not "a website belonging to your extension". Pages from `/docs`: publishes ADRs. |
| Reviewer credentials | In the `amo` environment secret, pasted into reviewer notes | "Any account works": AMO requires credentials |
| Support | GitHub issues with a Problem form | E-mail only: no public known-problems list |
| Chrome category | Tools | Functionality & UI: reads as page tweaks |

### 18. PROVISIONAL

| What | Waits on | If it changes |
|---|---|---|
| The name in every string: the manifest, note, disclosure, listings, policy and screenshots | [22](22-name.md) | Swap in "Playlist Courier" / "Courier" |
| `data_collection_permissions`, the Firefox prompts in §5, and the sync-switch prompt | [23](23-ask-amo.md) | §11.4 |
| Private-window settings writes | [23](23-ask-amo.md) Q3 | §11.4 |
| The Bun install in the source build | [23](23-ask-amo.md) Q4 | §11.4: an npm lockfile for the install step only; the user is told |
| The cookie line in the disclosure and policy, Chrome's "Authentication information" tick, and the reviewer notes' signed route | [25](25-live-checks.md) | Drop them if no signed request ships |
| The reviewer endpoint list | [25](25-live-checks.md) | Fill it from the route table |
| Exact prompt strings | [25](25-live-checks.md) P1 | Adjust §5 |
| A support e-mail | The user | Add it to the policy, the stores and Diagnostics |
| Whether going Unlisted → Public on Chrome triggers a full review | Unverified | The staged 2.0.0 submission covers both cases |
| AMO's automatic builder running `build-for-amo` | Unverified | The human reviewer follows the README |
| Open tabs surviving updates (S11, S12) | Ticket 17's real-browser layer running an update | Fix in the registrar or core before the beta ends |

### 19. For other tickets

- **[09](09-where-things-live.md) / [15](15-popup-and-settings.md):**
  - The prototype's note shows playlist titles, "Required percentage: 50 %" and a signed-in hint *before* Agree. Before consent only stored values exist: show "{N} playlists you chose in 1.x", the actual carried percentage, and the §2.3 question. Titles, the account and signed-in state appear in the outcome after Agree.
  - Final copy: §3 and §4.
  - The note tab opens in the background (§2.1).
  - Settings › Privacy & data gets "You agreed on {date}" and the withdraw confirmation (§4.3).
- **[11](11-accounts.md):** new outcome variant "Open YouTube and your 1.x playlists will be picked up." when no tab is open at Agree.
- **[16](16-storage-and-sync.md):**
  - `upgradeNote.details` has the shape in §2.6, plus `opened`;
  - the note is also set pending by `onInstalled` "update" from 1.x when no legacy key exists;
  - the percentage choice is applied at Agree;
  - `consent.v` starts at 1;
  - correction: 1.4.5's popup showed toasts off, so only the percentage mismatches.
  - If AMO answers Q3 "no", private-window writes of shared settings are refused too.
- **[17](17-modules.md)** (its notes for this ticket are folded in):
  - a `beta` mode next to `livecheck` (`build/manifest.ts` adds `update_url` only there);
  - `check:manifest` gains the `commands`, `update_url` and version assertions, `--against <tag>` (hotfix, failing) and `--report-against <tag>` (report only);
  - `scripts/amo-metadata.ts`;
  - `SOURCE_CODE_REVIEW.md` and `build-for-amo` (install with Bun, build with `npm run`, as `build/` is Node-only);
  - `zip.excludeSources` for `store/`, `site/` and `tools/`;
  - Node 24 pinned in the release and rebuild jobs;
  - one consent-version constant;
  - `watch.yml` also gets `workflow_call`;
  - the upgrade test's S11 and S12 depend on the registrar's open-tab injection and the `ppt:retire` handover.
- **[18](18-breakage.md):**
  - drop "`skipReview` tried": v2 only allows it for declarativeNetRequest-only updates, and it errors otherwise;
  - AMO rollback offers only the immediately previous listed version, and cancels pending reviews in its channel;
  - 2.0.0's predecessor is 1.4.5, which is inert after the migration, so fix forward (§6.4);
  - the live-check build exports the redacted `store/live-checks/{version}.json` the release gate reads;
  - `watch.yml` also gets `workflow_call`;
  - the support channel is settled as GitHub issues with a Problem form, with e-mail optional (§16).
- **[20](20-write-spec.md):** the spec's "Upgrade and rollout" chapter is this answer; `RELEASING.md` is §15.
- **[22](22-name.md):**
  - the repo can't be renamed while betas are installed: the Pages URL is both stores' privacy URL and the betas' `update_url`;
  - a custom domain would decouple it;
  - the AMO category moves to "Photos, Music & Videos".
- **[23](23-ask-amo.md):** record the reply against §11.4's rows.
- **[24](24-performance-budget.md):** `release.yml` runs `check:budget` on the exact store builds; the timing figures go in the release PR.
- **[25](25-live-checks.md):** P1 should check the expected strings in §5, including Chrome's optional-permission prompt for music.youtube.com.

### 20. Facts this rests on

All read on 2026-10-19. Research agents read the primary sources listed here.

- **1.4.5's code** (`e96dbf7`):
  - the percentage input's HTML default is 50, it's shown only when the stored value is truthy, and it's read as `… || 0`;
  - the toast checkbox is unchecked by default, and the stored value is applied only if defined;
  - modifiers are checked as `event[mod.toLowerCase()+"Key"]`, so `Control` never matches;
  - the manifest: `*://*.youtube.com/*`, excluding music, with `strict_min_version` 125.0.
- **AMO / Firefox** (Extension Workshop; addons-linter; addons-server; Firefox `main`, esr140 and esr153):
  - "Pre-release channels are not supported on addons.mozilla.org" (distribute-pre-release-versions). Listed and unlisted versions share one add-on, with the channel chosen per upload. `update_url` is an error for listed versions only.
  - AMO's update service serves only listed, approved versions. Firefox keeps using the installed version's `update_url`; without one it checks AMO.
  - `updates.json` needs HTTPS `update_link` or an `update_hash`.
  - MV3 versions: 1–4 dotted numbers, "Letters are no longer allowed". `version_name` isn't supported in Firefox.
  - Rollback republishes the previous approved listed version under a higher number you choose, and cancels pending reviews in that channel.
  - Unsigned installs work in Developer Edition, Nightly and ESR (`require_signing` excludes ESR).
  - Prompt strings: "Access your data for sites in youtube.com domains"; "The developer says this extension doesn't require data collection."; the runtime "requests additional data collection".
  - publish-browser-extension 6.2.0 supports `FIREFOX_CHANNEL` and `FIREFOX_AMO_METADATA_FILE`. AMO v5 `release_notes` must be a locale object.
  - AMO's automatic builder is private; its environment is unverified.
- **Chrome Web Store** (developer.chrome.com; Chromium `main`):
  - API v2 endpoints `…/publishers/*/items/*:upload|:publish|:fetchStatus|:cancelSubmission|:setPublishedDeployPercentage`.
  - `publishType` is `DEFAULT_PUBLISH` or `STAGED_PUBLISH`. `skipReview` "return[s] a validation error if the item requires review" and applies only to declarativeNetRequest-only updates.
  - Service accounts: "only add one service account to your publisher".
  - "The new API does not support creating new items" and no longer changes visibility. "Items are always published with the existing visibility settings."
  - Rollback is live "within a minute", needs no review, and discards pending and staged submissions.
  - Staged releases: "up to 30 days to publish".
  - Percentage rollout only above 10,000 seven-day users.
  - Two default item slots per publisher.
  - "Read and change your data on $1"; `storage` and `scripting` carry no warning.
  - The Limited Use sentence quoted in §9.2.
  - Privacy-tab categories and certifications as in §10.
  - Test instructions are optional.
  - wxt submit needs `CHROME_API_VERSION=v2` set explicitly.
- **GitHub** (docs.github.com, changelog):
  - `ubuntu-24.04-arm` is free on public repos (GA 2025-08-07).
  - Scheduled workflows are disabled after 60 days without activity in public repos; `gh workflow enable` re-enables them.
  - Environments, required reviewers and environment secrets are available on free public repos.
  - Pages can deploy via Actions to `https://<owner>.github.io/<repo>`; a custom domain is optional.
  - Rulesets can restrict tag creation on free public repos.
  - `setup-bun@v2` reads `packageManager` and supports aarch64.
  - Current majors: checkout v7, upload-artifact v7, download-artifact v8, configure-pages v6, upload-pages-artifact v5, deploy-pages v5.
- **Unverified:**
  - whether Chrome re-reviews an Unlisted → Public visibility change;
  - what AMO's automatic builder runs;
  - whether 1.4.5 users' own OAuth clients were in Testing (7-day refresh tokens);
  - the `extensions.update.url` override shortcut;
  - the Chrome Web Store fee amount (the docs' screenshot says US$5).
