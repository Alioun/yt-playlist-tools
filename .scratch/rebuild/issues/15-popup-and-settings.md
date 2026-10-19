# How do the popup and settings look?

Type: prototype
Status: resolved
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 08, 09, 11, 13

## Question

Prototype the popup and the settings page in the chosen stack, with realistic fake data. Cover:
- picking playlists: search, Watch Later, and a long list;
- channel filters;
- shortcuts and their labels;
- per-account setups;
- sync;
- theme;
- resetting data;
- first run;
- the upgrade note.

Also from [ticket 03](03-store-policy.md):
- Include the first-run disclosure and consent screen.
- The extension's own UI must not imitate YouTube's look and feel, so YouTube red can't stay as the primary colour.

Also include:
- the YouTube Music tab: its on/off switch, the choice of inline buttons, and its shortcuts;
- the feature switches from the modularity principle (map Notes).

Also from [ticket 21](21-youtube-music-internals.md): a side panel won't open in Chrome's installed-app windows, so YouTube Music app users need everything reachable from the popup.

Also from [ticket 01](01-youtube-requests.md): a picker with thumbnails and counts needs two requests (`get_add_to_playlist` plus `FEplaylist_aggregation`) and a cache.

Also from [ticket 11](11-accounts.md):
- **Account header:** avatar, name and @handle, with a placeholder while loading (never a signed-out flash).
- **Viewing another account's setup:** a picker only when two or more setups exist, only in normal windows, and never worded as "switch".
- **Settings:** an Accounts list with Remove.
- **States:** signed out, private-window read-only, the unclaimed 1.4.5 setup (Switch account / Discard) and the claim notice. The copy is in ticket 11's answer.

Also from [ticket 22](22-name.md) (name PROVISIONAL: "Playlist Pigeon for YouTube™"):
- Replace 1.5.0's YouTube play-button logo (`src/components/YouTubeIcon.tsx`) and its YouTube-red primary colour.
- The extension's own brand is a grey pigeon with a teal-to-violet accent: no red and no play triangle.
- Show the attribution line where the extension names YouTube.

Also from [ticket 26](26-youtube-music-quick-actions.md):
- **YouTube Music features:** Quick actions has six button checkboxes; Play next and Add to queue are on by default. Quick-action shortcuts has the key list.
- **Quick-save playlist:** shows under whichever of the two is on.
- **Proposed:** a "playing" row in the popup with Save and the picker, reachable from the installed app's title bar.

Also from [ticket 10](10-youtube-access.md):
- **No tab:** cached data plus "Open YouTube" / "Open YouTube Music".
- **Site access:** a "needs access" state per site.
- **Chrome's YouTube Music access:** requested from the click that switches a YouTube Music feature on, including on the first-run screen.

Also from [ticket 12](12-adding.md):
- a Show feedback switch per feature;
- the New playlist form: title rules, Private/Unlisted/Public defaulting to Private, a hint for an existing title, inline errors, and the no-channel state;
- Missing/Full marks with Remove in the playlist lists;
- a quick-save playlist per site, per account;
- adds started from the popup report inline.

Also from [ticket 07](07-watched.md):
- **Default required percentage:** a 0–100 slider plus a field that saves on Enter, on leaving the field, or on slider release, labelled "As soon as it starts playing" / "Only when watched in full".
- **Per playlist:** Takes (Videos / Shorts / Both) and a percentage override.
- **In the popup:** Pause auto-add and "Don't auto-add this video".

Also from [ticket 08](08-shortcuts.md):
- **Playlist shortcuts list:** label, playlist per account (Watch later applies to every account), key, Remove with Undo, at most 20. Managed in the popup and in settings.
- **Recorder:** its states and copy; Esc cancels, Clear, clash warnings, "Use it here".
- **Keys:** shown in each platform's style, with the help line.
- **Also on YouTube Music:** the switch is reachable from the YouTube Music section.

Also from [ticket 18](18-breakage.md):
- a status line under each feature: working / partly working / not working;
- a popup strip when something isn't working;
- the amber "!" badge (the missing-access badge takes priority);
- a Diagnostics section: Check now, report preview, Copy, "Known problems" / "Report a problem" links, and a detailed-log toggle.

Also from [ticket 24](24-performance-budget.md):
- **The popup's first view** is the switch list, painted from one storage read, in at most 40 KB and a 60 ms first frame. Pickers, search, the account view and Diagnostics load lazily.
- **Lighter helpers:** `tailwind-variants/lite` and `clsx`, not shadcn's full helpers.
- **Settings page:** 60 KB and a 100 ms first frame (PROVISIONAL), with Diagnostics a lazy section.

Also from [ticket 16](16-storage-and-sync.md):
- **Sync:** the settings sync switch with its help text, and the join question ("Use synced settings" / "Use this browser's settings"). First run waits up to 10 s for synced settings.
- **States:** "Synced settings are full", naming what takes the room, with "Remove kept filters"; and "Update {Name}" for a version mismatch.
- **Clear All Data:** this browser only, with a checkbox to also delete the synced copy.
- **Accounts not loaded here:** "3 auto-add playlists · Open YouTube as {Name}".

Also from [ticket 09](09-where-things-live.md) and its [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live) (branch `prototype/where-things-live`): keep its structure.
- **Popup:** "this tab, this account, right now": account header, breakage strip, one banner at a time (fixed priority order), YouTube / YouTube Music tabs chosen by the site you're on, a status line, and feature rows that unfold. Per-account playlist choices are made here.
- **Settings:** in a tab, with a left nav (YouTube, YouTube Music, Everywhere, Accounts, Appearance, Privacy & data, Diagnostics, About). Each feature is one row with a "changes the page" tag; it unfolds when on.
- **Shared pieces:** one playlist picker and one key recorder.
- **Ticket 16's pieces:** the join question, the "full" message, the update status and Clear All Data's checkbox.
- **Stack bugs to carry over:** map `data-state` for shadcn-svelte vs Bits UI 2.19, and exclude svelte from Vite's SSR pre-bundling with rolldown 1.2.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up. This answer folds in the "Also from" notes above, plus tickets [14](14-in-page-controls.md), [17](17-modules.md), [19](19-upgrade-and-rollout.md) and [27](27-youtube-music-controls.md), which resolved while it was built.

**Prototype:** [`prototypes/popup-and-settings/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/popup-and-settings/prototypes/popup-and-settings) on branch `prototype/popup-and-settings`.
- **Run it:** `cd prototypes/popup-and-settings && bun install && bun run dev`, then open the printed URL; the harness is `/`. Alternatively, `bun run build` (this also runs the size check) and then `bun run preview`.
- **Pages:** `popup.html`, `settings.html`, `onboarding.html` (first run and the 1.4.5 note, a separate page as ticket 17 says), and `index.html`, the harness.
- **The harness:**
  - **Surfaces:** Popup, Popup states (a gallery), Settings, First run, Upgrade note, Brand.
  - **Controls:** 30 scenarios; Light / Dark / Both; Windows / macOS / Linux keys; Chrome / Firefox.
  - **Panels:** the popup variant bar (←/→), "What to look at", and the live fake storage document.
  - **URL parameters** on every page: `s`, `theme`, `os`, `browser`, `variant`, and `open=` to start with a part unfolded.
- **Screenshots:** [`screenshots/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/popup-and-settings/prototypes/popup-and-settings/screenshots), 73 at 2×:
  - 01–22: the popup and what unfolds;
  - 30–47: banners and states;
  - 50–52: the variants;
  - 60–77: settings;
  - 80–88: onboarding;
  - 90: the brand sheet;
  - 91–92: the harness.

  `node scripts/shots.mjs` regenerates them against `bun run preview`.
- **What it is:**
  - **Stack:** throwaway Svelte 5.57 + shadcn-svelte on Bits UI 2.19.5, Tailwind 4.3, Vite 8.3 (rolldown 1.2), Bun 1.4.3.
  - **Shaped on ticket 17's seams, so views can carry over:**
    - `ui/backend/backend.ts`: the `Backend` interface, with `load`, `watch`, `change`, `call` and `access`;
    - `ui/backend/fake.ts`: the fake adapter, scripted by scenario, whose pages follow each other the way `storage.onChanged` would;
    - `shared/picker/model.svelte.ts`: the one `PickerModel`;
    - `shared/keys/display.ts` and `recorder.ts`: the one key recorder's rules.

### In short

- **Popup:** ticket 09's structure, drawn hi-fi.
  - **Order:** header › breakage strip › one banner › YouTube | YouTube Music › This video or Playing now › feature rows.
  - **Unfolding:** rows unfold in place (variant A). The runner-ups, B (drill in) and C (status first), are behind `?variant=`.
- **First view:**
  - **Popup on YouTube:** 35.8 KB JS gzip + 7.7 KB CSS.
  - **Popup on YouTube Music:** 39.4 KB + 7.7 KB.
  - **Settings:** 38.8 KB + 8.5 KB.
  - All are inside ticket 24's 40 + 8 and 60 + 10. The popup's cold first frame is about 42 ms here (see [Sizes](#sizes)).
- **One picker, one recorder:** popup, settings and onboarding share one playlist picker (a sheet in the popup, a popover elsewhere, `PickerModel` underneath) and one key recorder.
- **Brand:** a grey pigeon whose wing is three list lines, with a teal-to-violet neck.
  - **Where the gradient goes:** the mark's neck, switches that are on, the header hairline, progress fills and first run's main button.
  - **Everything else:** violet acts, teal confirms, amber asks, crimson destroys.
  - **Never:** YouTube red or a play triangle.
- **Rules for the build:** building it turned up eleven rules (see [Rules for the build](#rules-for-the-build)). Among them:
  - with `clsx`-only `cn`, a component's base must never set a property its variants set;
  - switches and checkboxes stay controlled;
  - each page builds on its own, with its first view in one chunk;
  - entries use no top-level await.

### Layout

**Popup** (360 px wide, at most 600 px tall; screenshots 01–04, 91):
1. **Header** (58 px), over a gradient hairline:
   - the mark and "Playlist Pigeon";
   - the account in view: avatar, name and @handle;
     - a pulsing placeholder while it's read, never a signed-out flash;
     - nothing at all before consent;
   - with two or more setups, the account becomes a menu, "Show the setup for", which never says "switch" (15);
   - the gear opens Settings.
   - Ticket 09's footer is gone: its "All settings" is the header's gear.
2. **Breakage strip** (amber, with Details → Settings › Diagnostics). The text is ticket 18's: "{Feature} isn't working in this tab because YouTube changed something." / "{N} features aren't working in this tab." / "{Feature} is partly working in this tab."
3. **One banner**, in ticket 09's order:
   - It's an inset card with an icon per tone (attention amber, info slate-blue, done teal), a title, at most one line, and its actions.
   - The full list and copy are in `src/ui/lib/notices.ts`, which settings' top strip reuses.
4. **YouTube | YouTube Music**: a segmented control; a small gradient dot marks the site you opened it on.
5. **YouTube tab:**
   - **This video:**
     - **The card:** "THIS VIDEO · {title}", ticket 07's status line, and Details ›.
     - **A watched meter:** a gradient fill with a tick per goal (50 %, and Talks to watch's 90 %); a goal turns teal once reached.
     - **Its height is reserved** while the tab answers.
   - **Then six feature rows.**
6. **YouTube Music tab:**
   - **"On YouTube Music":** the section's switch ("Off: nothing of ours runs there. Your choices are kept.").
   - **Playing now:**
     - the art with an equaliser, the title and the artist;
     - a split **Save | ▾** in ticket 27's states: idle, busy, saved with Undo, already in, or "Couldn't save: …";
     - "One click saves to {playlist}" under it, or "Your first pick becomes the one-click playlist."
   - **Then the rows:** Quick actions, Quick-action shortcuts, "Playlist shortcuts here too", and the quick-save playlist row, which shows only while a YouTube Music feature is on.
7. **A feature row:**
   - **Contents:** the glyph tile (violet on, grey off), the name, a chevron when it can unfold, a one-line summary, the health line, and the switch.
   - **Unfolding:** it unfolds in place, indented under the name (54 px). Off, it's one row and never unfolds.
   - **Held:** a feature that's on but held shows a hatched switch and a reason: "Waiting for your OK", "Needs site access" or "YouTube Music is off".
   - **Auto-add's row** carries Pause / Resume.
8. **Overlays:**
   - the picker, a sheet that slides up under the header;
   - the account menu;
   - "Before this feature can run", the consent sheet that a switch raises before consent.

**Settings** (in a tab; 60–77):
- **Top bar:**
  - the mark, "Playlist Pigeon" and "Settings";
  - the account in view: "Playlists shown for {Name}", or a "Showing setup for {Name} ▾" menu with two or more setups (normal windows only).
- **A connection strip,** with the popup's states.
- **A sticky left nav** with amber dots where something needs you.
- **One section at a time,** hash-routed (`#youtube`, `#music`, `#everywhere`, `#accounts`, `#appearance`, `#privacy`, `#diagnostics`, `#about`).
  - `#feature-<id>` scrolls to that card and rings it for 1.8 s. The deep links from ticket 14's page menu, notices and failure toasts land here.
- **Feature cards:** glyph, name, footprint tag, one line, switch, and a held or health line. A card's options show only while it's on.
- **Section contents:**
  - **YouTube:**
    - **Auto-add:**
      - this account's playlists;
      - "For every account": the default percentage, Show feedback, and the toolbar tick (default off).
    - **Playlist shortcuts:**
      - a Key / Name / "Saves to on {Name}" table, 3 of 20;
      - "Two more keys": the picker key and the undo key;
      - Also on YouTube Music, Show feedback, and the help line.
    - **The other cards:** quick-save (with "On Shorts shelves too"), the queue button, the watch-page button ("On Shorts too") and the card menu ("Links inside cards keep the browser's menu", off).
  - **YouTube Music:** the section switch; the six button choices with ticket 27's narrow-row warning; the keys; the quick-save playlist under whichever feature is on.
  - **Everywhere:** settings sync (help text, status line, "full" with Remove kept filters, "update") and the browser's shortcut settings for opening the popup.
  - **Accounts:**
    - each setup, with a summary and Remove;
    - setups that came by sync ("3 auto-add playlists · Open YouTube as {Name} to see them");
    - the unclaimed 1.x setup, with Switch account / Discard.
  - **Appearance:** System / Light / Dark cards with mini popups. "Covers the popup, settings and first run. On YouTube, our buttons follow YouTube's own look."
  - **Privacy & data:**
    - **Consent:** "You agreed on {date}." with Read it again, and Withdraw and pause everything (ticket 19 §4.3's confirmation);
    - **What's kept in this browser;**
    - **1.x's Google access;**
    - **Clear all data** with its checkbox. The button names the scope: "Clear" or "Clear here and everywhere".
  - **Diagnostics (lazy):** each feature's status per site, Check now, the full report in a monospace block with Copy, Known problems / Report a problem (GitHub issues), and the detailed console log.
  - **About:** the mark, "Playlist Pigeon for YouTube™", the version, "formerly YouTube Playlist Tools", the attribution line and "Not affiliated…".

**Onboarding** (`onboarding.html`; 80–88):
- **Layout:** one centred column of about 700 px, under a faint teal-to-violet wash, with a three-step indicator.
- **First run:**
  1. "What should Playlist Pigeon do?"
     - Settings sync comes first: turning it on looks for synced settings for up to 10 s, then marks what it finds "From sync".
     - Then the features as whole-card checkboxes, grouped YouTube / YouTube Music, each with its footprint tag.
     - Chrome's line "Chrome will ask for access to music.youtube.com when you agree." shows when a YouTube Music feature is ticked.
     - A sticky footer: "Continue with {N} features".
  2. "Before you start":
     - the chips of what was picked, the disclosure (ticket 19 §4.1), **Agree and turn on {N} features** (gradient) and Not now;
     - "Nothing is running." after Not now.
  3. "Finish setting up":
     - the YouTube account;
     - auto-add's playlists in a contained list;
     - Alt+W's playlist (Watch later on every account), and both quick-save playlists;
     - Open YouTube and Open Settings.
- **Upgrade note** (ticket 19 §3 verbatim):
  - **Before Agree, only stored values:** "Adds to 3 playlists you chose in 1.x", the real percentage, or §2.3's 50 % / 0 % question (default "like 1.4.5 did"), and the key with its lines (Ctrl never fired, bare key, clash, presets).
  - **After Agree,** ticket 11's outcome in place, with its own main button.

### Components

- **Switch:** shadcn-svelte's look and API (`checked`, `onCheckedChange`, `data-state`), hand-written on `<button role="switch">`.
  - It's controlled whenever the caller listens.
  - **Its states:** gradient when on, and a hatched track when on but held.
  - **Runner-up:** Bits UI's Switch. It added 5.3 KB to the popup's first view, for a control the platform already gives.
- **Button:** shadcn-svelte's API with its variants as a plain lookup joined by `clsx`.
  - **Variants:** default (violet), brand (gradient, first run's main button only), outline, secondary, ghost, destructive, destructive-soft and link.
  - **Runner-up:** `tailwind-variants/lite`, which costs 3.7 KB in the first view for a two-key lookup. `lite` stays in Badge, Alert and Toggle, which no first view uses.
- **Site tabs:** hand-written ARIA tabs with arrow keys, in shadcn's look. Runner-up: Bits UI's Tabs, at +3 KB in the first view.
- **The one picker** (`components/picker/PlaylistPicker.svelte` on `PickerModel`; 12, 13, 14, 17, 63):
  - **Header and search:** a title and subtitle, then the search, focused on open.
  - **The status line:** "Checking where this video already is…", "Already in {N} playlists", "Couldn't check where this video already is" or "Saved list from 2 hours ago".
  - **The rows:** Watch later first, then YouTube's order.
    - Each row shows a 16:9 thumb, the title, and a line with visibility · size, or "New, YouTube lists it soon", or "No longer on YouTube, or not this account's";
    - its shortcut's key;
    - Missing / Full with Remove (in choosers);
    - a pin, "Use for one-click save" (filled: "One-click save goes here").
  - **Feedback:** each row answers in place: busy, a check, "Already in it", or "Couldn't save: …".
  - **New playlist** sits in a sticky footer. Its form is ticket 12's:
    - the title, with "Titles can't contain < or >" and "You already have a playlist called {title}.";
    - Private / Unlisted / Public, Private first, then the last pick;
    - Create, which is disabled while it works;
    - the reasons it can't be used: signed out, no tab, or no channel ("Create channel").
  - **Check colours:**
    - **Save mode:** a **teal** check means "already in it", a fact (membership).
    - **Choose mode:** a **violet** check means "chosen".
  - **Containers:** a sheet in the popup; in settings and onboarding, a popover from `PlaylistChooser` (a button showing the choice; Watch later reads "Watch later (every account)").
- **Auto-add list** (`AutoAddList`, the picker model in "many" mode; 05, 06, 22, 42, 60):
  - **Above the list:** a sticky search once there are more than 8 playlists, and New.
  - **Missing or Full first:** chosen playlists marked Missing or Full sit at the top, so a deleted one isn't lost at the end of 48.
  - **Each ticked playlist's options:**
    - **Takes:** Videos / Shorts / Both.
    - **Adds at:** "Default · 50 %" / "Its own" (with a slider and field).
    - **Channel filter.**
  - **Where the options open:**
    - **Popup:** the summary replaces the second line ("Shorts too · Allow only · 3") and a sliders button opens the options.
    - **Settings:** a pill.
  - **Before consent:** "Agree first, then choose playlists here. Until then nothing is read from YouTube."
- **Channel filter editor:**
  - **Controls:** a switch, then **Allow only | Deny**, with "Only videos from these channels are auto-added." / "Videos from these channels are never auto-added.".
  - **Listed channels:** chips ("Tiny Science · @tinyscience" ×), plus "Allow Byte Sized (this video)".
  - **Adding by hand:** an "@handle or channel link" field with Add, and inline errors.
  - **Mode switches:** switching mode with channels listed asks "Switch to Deny? This clears its 3 allowed channels." first.
  - **The warning:** an empty allow list warns "With no channels listed, nothing is auto-added to {playlist}."
  - **Off:** "every channel gets in. Its 3 denied channels are kept for when you turn it back on."
  - **In This video's details:** per playlist, **Allow** or **Deny** this channel (**Allowed** / **Denied** once listed; **Allow only** / **Deny** while the filter is off).
- **The one key recorder** (`KeyRecorder`; 08, 09, 10, 62):
  - **The key field:** it shows the key as keycaps, with a small × inside to clear it.
  - **Recording:**
    - "Press keys…", with held modifiers live ("Alt+…") and "Esc to cancel";
    - Tab, Esc and a click elsewhere cancel.
  - **Refusals keep it recording:**
    - "Enter and Space can't be used alone: they press buttons.";
    - "Ctrl+Alt can't be used: many keyboards type characters with it.";
    - "{Key} is the browser's own key and never reaches the page.".
  - **Clash:** "{Key} is already used by {Other}." with Use it here / Cancel.
  - **The note under a key YouTube, YouTube Music or the browser use:** ticket 08's sentences ("YouTube uses K for Play/pause. This shortcut replaces it on YouTube.").
  - **A new shortcut** starts recording at once.
- **Keycaps:** "Alt+Shift+P" on Windows and Linux (Super on Linux), "⌥⇧P" on macOS. Summaries use one compact cap ("Alt+W").
- **Percent field:** a slider with a brand fill, plus a number field.
  - The field saves on Enter or blur; empty or out-of-range input goes back.
  - The slider saves on release.
  - "As soon as it starts playing" / "Only when watched in full".
- **Footprint tags:** "Doesn't change the page", "Keys only, doesn't change the page" (ticket 19's wording), "Adds buttons to the page" and "Changes right-click on the page". The last two are tinted violet.
- **Glyph:** the first view's 21 icons as Lucide's own path data (ISC), drawn by a 10-line component. The lazy parts use `@lucide/svelte`.
- **Disclosure:** ticket 19 §4.1's text, in sm and md sizes. Its cookie line is PROVISIONAL (ticket 25).

### States

- **Before consent** (fresh install, upgrade pending; 30, 31):
  - Nothing is read from YouTube: no account in the header, no This video, no Playing now, no playlist lists, no choosers.
  - Rows show "Waiting for your OK" on a hatched switch.
  - The banner reads "Waiting for your OK" or "Playlist Pigeon 2.0 is waiting for your OK", with Review.
  - This reflects ticket 19 §2.4. Ticket 09's prototype showed the account here.
- **Account in view vs the tab's account:** This video and Playing now always act as the tab's own account. Picking another setup changes only the setups shown (39).
- **Banners drawn** (30–47):
  - consent and upgrade;
  - reset from another browser;
  - site access on Firefox ("Give access to YouTube") and Chrome's YouTube Music access;
  - account changed in another tab (Reload tab);
  - not signed in;
  - private window, both variants;
  - no YouTube tab ("This is saved data from 2 hours ago. Switches still work; saving and new playlists need a tab.");
  - account in view not open;
  - sync full and sync update;
  - Missing or Full;
  - 1.x unclaimed (Switch account / Discard) and 1.x claimed (+ "1 of them wasn't on this account and was left out.").
- **Also drawn:**
  - the account read (placeholder);
  - a setup that came by sync;
  - a new account ("Nothing is saved for {Name} until you tick one.");
  - paused auto-add;
  - a Short;
  - partly added;
  - the installed YouTube Music app;
  - the consent sheet;
  - the simulated browser permission prompts, with ticket 19 §5's strings and marked as browser chrome.

### Copy decided here

- **Row summaries:**
  - "3 playlists · adds at 50 %";
  - "Paused until you resume or restart the browser";
  - "No playlists for {Name} yet";
  - "Sign in to YouTube to choose playlists";
  - keycaps plus shortcut names;
  - "One click saves to {playlist}" / "Asks where to save the first time";
  - "Adds to the end of the queue";
  - "Under the video, before YouTube's Save" (ticket 14's placement);
  - "Right-click a video for YouTube's ⋮ menu".
- **Feature names:**
  - Auto-add, Playlist shortcuts, Quick-save on thumbnails, Queue button on thumbnails, Watch-page button and Right-click for the video menu;
  - Quick actions and Quick-action shortcuts.

  These are ticket 09's names. Their one-line descriptions sit apart from the registry (`shared/features/blurbs.ts`), so the popup doesn't carry them.
- **Channel filters:** the modes are "Allow only" / "Deny" everywhere. The pill reads "Allow only · 3", "Deny · 1" or "All channels · 3 kept". This fixes 1.5.0's pill saying "Allow" where the editor said "Allow only".
- **Account menu:** "Show the setup for" › "This only changes what you see here. YouTube stays on the account you're signed in as." › "Manage account setups".
- **Toolbar tick option:** "Tick the toolbar icon when this tab's video is auto-added", **off by default**. Its note says the "!" always comes first.
- **YouTube Music:**
  - "Save on the player bar" reads "Shown beside YouTube Music's like, in the classic bar and the new miniplayer."
  - Ticket 27's warning: "Each extra button squeezes narrow rows more. On Home's Quick picks at common laptop widths, a hovered row's title can disappear; its tooltip still names the song."
- **Ticket 14's defaults:** the queue button's confirmation is **on** by default, because it carries Undo; "Links inside cards keep the browser's menu" is **off** by default.

### Brand tokens (placeholder until ticket 22 is confirmed)

| Token | Light | Dark | Use |
|---|---|---|---|
| Brand teal / violet / slate | `#14A39A` / `#7B5CD6` / `#5E6875` | same | the mark, the gradient (`linear-gradient(120deg, teal, violet)`) |
| Primary (violet) | `oklch(0.52 0.2 288)` ≈ #6949d2, 6.0:1 on white | `oklch(0.74 0.14 290)` ≈ #aa9afc, dark text 7.6:1 | actions, focus rings, selection checks |
| Success (teal) | `oklch(0.5 0.09 182)` ≈ #007467, 5.7:1 | `oklch(0.78 0.11 182)` | "already in it", working, done |
| Warning (amber) | `oklch(0.47 0.1 65)` on `oklch(0.972 0.04 85)`, 6.4:1 | `oklch(0.85 0.12 80)` on `oklch(0.255 0.028 75)` | banners that ask, the strip, held reasons |
| Destructive (crimson) | `oklch(0.53 0.19 15)` ≈ #c02447, 5.9:1 | `oklch(0.72 0.16 15)` with dark text | Clear, Remove; never YouTube's #FF0033 |
| Info | `oklch(0.47 0.09 250)` | `oklch(0.8 0.08 250)` | neutral banners |
| Neutrals | hue 255, chroma ≤ 0.02 (the pigeon's slate); background `oklch(0.985 0.003 255)` | background `oklch(0.175 0.012 262)` | surfaces |

- **Type:** the system stack (`-apple-system`, Segoe UI, Ubuntu Sans, …), with no bundled fonts. Popup body 13 px, settings 13.5–15 px.
- **Shape:** 10 px base radius, 14–16 px cards, popup rows at least 54 px. Shadows are tinted slate.
- **The mark** (`components/PigeonMark.svelte`, plus `public/pigeon.svg` and `pigeon-dark.svg`):
  - a perched pigeon in profile, its wing three list lines and its neck the gradient;
  - below 20 px it drops the perch and feet and keeps two lines;
  - dark mode lightens the body to #8b95a4.
  - The brand sheet (90) shows 16–128 px on light and dark, the toolbar with and without the amber "!", each token's contrast, and the components.

### Sizes

`bun run build` builds each page on its own and runs `scripts/size.ts` (ticket 24's method: gzip -9, following the HTML's scripts and each chunk's static imports). The fake Backend (5.7 KB) is counted as a 2 KB browser adapter, an estimate.

| Page | First view JS | CSS | Budget | As built (with the fake) |
|---|---|---|---|---|
| Popup, on YouTube | **35.8 KB** | 7.7 KB | 40 + 8 | 39.5 KB, 2 files |
| Popup, on YouTube Music (its tab chunk loads before the first frame) | **39.4 KB** | 7.7 KB | 40 + 8 | 43.2 KB, 3 files |
| Settings (first frame) | **38.8 KB** | 8.5 KB | 60 + 10 (PROVISIONAL) | 42.5 KB |
| Onboarding | 23.2 KB | 8.2 KB | none set | 26.9 KB |

- **Lazy chunks** (all inside ticket 24's 45 KB):
  - popup: AutoAddPart +22.2 KB, ShortcutsPart +5.2, This video's details +4.8, the picker sheet +4.2;
  - settings: ShortcutsBody +33.5, AutoAddBody +25.9, Privacy +11.5;
  - onboarding: step 3 +39.1.
- **Settings loads its YouTube options right after the first frame,** with no click: 106 KB JS and 18.7 KB CSS in 2.5 s, fake included. The runner-up, all eager, measured 109 KB up front.
- **First frame, cold** (a new context each run, navigation start to the first frame after mount, median of 10):
  - **Popup on YouTube:** 42 ms at 1×, 151 ms at 4×.
  - **Popup on YouTube Music:** 42 ms and 144 ms.
  - **Budgets:** 60 ms and 220 ms.
  - **The setup:** measured on the development machine (WSL2, headless Chromium 156, over localhost HTTP), not ticket 24's reference rig.
- **What it took to fit:**
  - per-page builds (a multi-page build added about 10 KB of shared chunks to the popup);
  - one first-view chunk (about 5 KB was lost to small chunks);
  - the hand-written Switch and tabs (−8 KB);
  - a lookup Button (−3.7 KB);
  - Glyph icons and the mark as an image (−1.7 KB);
  - feature descriptions and the key-owner table out of the popup (−0.8 KB);
  - the YouTube Music tab as its own chunk.

  The popup on YouTube Music keeps only 0.6 KB of headroom.

### Rules for the build

1. **No class conflicts, inside components or from callers.**
   - **The cause:** with `clsx`-only `cn` (ticket 24), two utilities for one property resolve by Tailwind's CSS order, not by the class string.
   - **Found:**
     - Button's and Badge's base `border-transparent` beat outline's `border-border`, so outline buttons had no border in light mode;
     - Button's base radius, font size and icon size fought its sizes;
     - Switch's `bg-none` fought the held hatching;
     - Input's `text-base md:text-sm` gave 16 px text in the 360 px popup;
     - Dialog's `sm:max-w-sm` couldn't be widened from outside.
   - **Checked clean:** Toggle, Tabs list and Alert.
   - **The rule:** a component's base never sets a property its variants set. Callers add only margins and layout, and anything else is a variant or prop (`flush` on PopoverContent, `size` on Disclosure).
2. **Switches and checkboxes are controlled.** When the caller listens, they never flip themselves, so a refused or deferred change shows the stored state. That covers:
   - consent first;
   - the join question;
   - a denied access prompt;
   - sync full;
   - a private window.
3. **Build each extension page on its own,** or give the popup its own build. In one multi-page build, the pages share chunks: the popup then carries Svelte runtime only settings uses, in dozens of files.
4. **Group each page's first view into one chunk** (rolldown `codeSplitting.groups` with `tags: ["$initial"]`).
   - Groups must not import each other. A fake ↔ first-view cycle let the HTML run the fake first, and pages rendered blank.
5. **No top-level await in an entry whose chunk lazy chunks import.** The first view's chunk waited on a lazy chunk that waited on it, and the page rendered blank.
6. **Focus with `preventScroll`** inside popovers. The picker's search was focused before the popover was positioned, and the page jumped to the top.
7. **First-view icons:** inline path data (`Glyph`); the mark is the packaged SVG as an `<img>`. Lucide's components stay in lazy parts.
8. **Two stylesheets per page:** the first view, plus one that loads with the lazy parts (`parts.css`, `settings-more.css`, `onboarding-more.css`). They share Tailwind's layers by name.
9. **Nothing is read from YouTube before consent** (ticket 19 §2.4): the view layer asks for the account and the tab's video only once consent is in.
10. **This video and Playing now act as the tab's account.** The account in view changes only which setups are shown.
11. **Carried from ticket 09:** the `@custom-variant` map for Bits UI's `data-state`, and svelte excluded from the SSR optimiser.

### Judgement calls and runner-ups

1. **The popup unfolds in place (A).**
   - *Runner-up:* B, drill in (each feature gets a full-width page, 50). It's roomier for long lists, but costs a tap and hides the list while editing.
   - *Second runner-up:* C, status first (a large "right now" card with a progress ring, and features as switch tiles, 51 and 52). It loses ticket 09's one line per feature.
2. **No popup footer;** the header's gear opens Settings. *Runner-up:* ticket 09's "All settings" footer, which took 36 px for a duplicate.
3. **Switches that are on show the brand gradient.** *Runner-up:* solid violet, which leaves the brand only in the mark.
4. **Teal for "already in it", violet for "chosen".** *Runner-up:* one colour, which can't tell a fact from a choice.
5. **The picker is a sheet in the popup and a popover elsewhere.** *Runner-up:* a popover in the popup, which has no room beside its button at 360 px.
6. **In the popup, auto-add options open from a sliders button,** with the summary on the second line. *Runner-up:* settings' pill, which cut "Kids – approved" to "Kid…".
7. **Hand-written Switch and tabs;** Bits UI for what floats or traps focus (popover, dialog, checkbox, slider, radio). *Runner-up:* Bits UI everywhere, at +8 KB in the first view.
8. **Button variants as a lookup.** *Runner-up:* `tailwind-variants/lite`, at +3.7 KB in the first view.
9. **The YouTube Music tab is its own chunk,** loaded before the first frame on YouTube Music. *Runner-up:* both tabs in the first view, about 42 KB, over budget.
10. **"Allow only" / "Deny" everywhere.** *Runner-up:* "Only these channels" / "All but these channels", which reads well alone but doesn't match the glossary's Allow/Deny.
11. **The toolbar tick is off by default** (ticket 09 left the default here). *Runner-up:* on. The toast already confirms, and the user's principle is quiet defaults.
12. **Settings shows one section at a time.** *Runner-up:* one long page, which is heavy to load and hides the nav's dots.
13. **Settings' options load right after the first frame.** *Runner-up:* all eager, 109 KB up front.
14. **Settings' account menu is hand-written.** *Runner-up:* Bits UI's DropdownMenu, whose floating layer would land on first load.
15. **First run's features are whole-card checkboxes.** *Runner-up:* rows with a small checkbox, where the footprint tags got too little weight.
16. **Step 3's auto-add list is contained** (it scrolls at 340 px). *Runner-up:* a compact chooser, which hides how many are ticked.
17. **The upgrade note is decided when the page opens** and shows its outcome in place. *Runner-up:* re-deciding from live state, which would swap the page for first run on Agree.
18. **The join question is two large choices that apply on click,** plus Cancel. *Runner-up:* radios with Continue.
19. **The header's mark is the packaged SVG.** *Runner-up:* the inline component, about 1 KB of first-view JS.
20. **Remove a shortcut with a trash icon; clear its key with an × inside the key.** *Runner-up:* two × buttons, which were easy to confuse.
21. **The popup shows linear progress with goal ticks.** *Runner-up:* ticket 14's pie, which is right for the cramped in-page button. The popup has room for a meter that marks each playlist's goal.

### PROVISIONAL

- **The name and mark:** "Playlist Pigeon", the pigeon and the palette, until ticket 22 is confirmed.
- **The disclosure's cookie line** (ticket 25).
- **Unticking a checked playlist removes the video** (tickets 12, 26).
- **Ticket 24's settings budget:** proposed as the first frame only (now 38.8 + 8.5 KB), with each lazy part ≤ 45 KB.
- **The 2 KB browser-adapter allowance** in the size check: an estimate until `ui/backend/browser.ts` exists.
- **The first-frame timings:** measured on the development machine, not the reference rig.
- **The toolbar tick's default (off).**
- **The popup's 0.6 KB headroom on YouTube Music:** any first-view addition there needs a matching cut.

### Notes for other tickets

- **[14](14-in-page-controls.md), in-page controls:**
  - **Shared picker:** the in-page picker should use the same `PickerModel` as the popup (source interface in `shared/picker/model.svelte.ts`). New playlist's copy and limits are the same.
  - **Deep links settings answers:** `#feature-watchButton` (the page menu's settings link), `#diagnostics` (a notice's Details), and `#feature-<id>` (a failure toast's Settings).
  - **Theme:** settings now says the extension's theme covers only its own pages.
  - **The ticket's rows** are in settings.
- **[17](17-modules.md), modules:** the prototype's `ui/` mirrors your layout.
  - **Change kinds:** take the prototype's from `backend.ts`.
  - **Rules for the build:** take 3–5 and 7–8 above.
  - **Consent gating:** gate reads from the YouTube tab at the view layer (`readYouTube()` after consent).
  - **Accounts:** the views need both the account in view and the tab's account.
  - **Picker sources:** `PickerSource` (list, membership, add, remove, create, keys, marks, pin) is what the popovers need too.
- **[19](19-upgrade-and-rollout.md), upgrade and rollout:**
  - The note and first run use §3 and §4 as written.
  - **Store screenshots** at 1280×800 can come from 01, 03, 60, 80 and 85, re-shot at 1× with captions.
  - About shows "formerly YouTube Playlist Tools" and the attribution.
- **[27](27-youtube-music-controls.md), YouTube Music controls:**
  - **Playing now** reuses the split's states and copy ("One click saves to…", "Saved to {playlist}. Undo", "Already in {playlist}.", "Couldn't save: …").
  - **Settings** carries your narrow-row warning and the player-bar line.
- **[20](20-write-spec.md), spec:** take Layout, Components, States, Copy, Brand tokens, Sizes and Rules for the build as the UI chapter. The screenshots are the visual reference.

### New questions

- **Ticket 24's popup budget on YouTube Music:** 0.6 KB of headroom is thin for a build that will gain real error handling.
  - Raise the popup's budget to 44 KB, or keep 40 and require another cut?
  - The cut on the table: banner copy loaded only when a banner shows.
- **Settings' first load:** is "60 KB" the first frame (as proposed) or everything the YouTube section shows without a click (106 KB here)?
- **The name:** this prototype is the clearest view yet of "Playlist Pigeon" in use (90, 80), so it's a good moment to confirm ticket 22.

## Decisions on the open questions (main session, 2026-10-19)

- **The popup's budget stays at 40 KB on both sites.** Banner copy loads only when a banner shows, which buys the YouTube Music popup its headroom; never bloated beats a quiet budget raise.
- **Settings' 60 KB means the first frame.** Section options load right after it, without a click.
