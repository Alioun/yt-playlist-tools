# Where does each capability live?

Type: prototype
Status: resolved
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)

## Question

Where does each capability show up, so that everything is where a user would expect it? The surfaces are:
- YouTube's pages: the watch page, thumbnails, Shorts;
- the toolbar popup;
- the settings page;
- any other surface worth having, such as a side panel or the browser's context menu.

Cover these flows:
- first run, with nothing set up yet or with the user not signed in to YouTube;
- the one-time note for 1.4.5 upgraders;
- where per-account setups, channel filters and shortcuts are managed.

The prototype is low-fidelity, clickable and uses fake data. It's about placement and flow, not looks.

Also from [ticket 03](03-store-policy.md): the Chrome Web Store requires an in-product disclosure that the user explicitly accepts before any data is handled. Place it in first run.

Also from [ticket 06](06-upgrade-path.md): for upgraders, the one-time note doubles as the consent screen. Carried-over auto-add stays off until it's accepted.

Also from [ticket 02](02-request-context.md):
- With no YouTube tab open, the popup and settings may only have cached data plus an "Open YouTube" action, unless [ticket 25](25-live-checks.md) proves a hidden frame. Design for that state.
- Include asking for youtube.com access when it's missing or revoked (Firefox).

Also from the YouTube Music charting (Q20–Q21): YouTube Music gets its own tab or section, with its own on/off switch, button choices and shortcuts. Account, theme and sync stay shared at the top level. Map both sections, and the installed YouTube Music app.

Also from the modularity principle (map Notes): show where each feature is switched on and off, and what first run offers.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up. This answer folds in tickets [07](07-watched.md), [08](08-shortcuts.md), [10](10-youtube-access.md), [11](11-accounts.md), [12](12-adding.md), [16](16-storage-and-sync.md), [18](18-breakage.md), [24](24-performance-budget.md) and [26](26-youtube-music-quick-actions.md), all resolved while it was built.

**Prototype:** [`prototypes/where-things-live/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live) on branch `prototype/where-things-live`.
- **Run it:** `cd prototypes/where-things-live && bun install && bun run dev`, then open the URL it prints.
- **Drive it:**
  - The top bar switches surfaces; ← and → do too.
  - **Scenario** walks every state.
  - **What to look at** explains each surface.
  - **State** shows everything held in memory.
  - Switches are shared across surfaces, so a feature switched off in Settings disappears from the YouTube mocks.
- **Screenshots:** [`screenshots/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live/screenshots).
- **What it is:** throwaway code in Svelte 5, Tailwind v4 and shadcn-svelte, with fake data and no extension APIs.

### The rule of thumb

- **The popup is "this tab, this account, right now".** **Settings is "everything, for good".** The page shows only what a switched-on feature draws.
- **Per-account choices** (which playlists) are made in the popup, where the user is when they think of them. Settings shows them again. This matches ticket 11's "Choose one in the popup".
- **Shared behaviour** lives in Settings: feature switches, keys, labels, percentages, feedback and the YouTube Music buttons. The popup has one-click switches for the same features.
- **Features are switched in three places only:** first run (or the upgrade note), Settings and the popup. Never inside YouTube's pages; our in-page menus only link to Settings.

### Surfaces

- **Toolbar popup** (360 px; the same popup opens from the installed YouTube Music app's title bar):
  - **First view** (ticket 24: 40 KB up front and a first frame within 60 ms, painted from one storage read): the header, the strip or banner, the two tabs and the feature switch list. Each feature is one row with a one-line summary. Its playlist choices, This video's details and every picker unfold on demand.
  - **Top to bottom:**
    1. **Header:** the account the tab uses (avatar, name and @handle, with a placeholder while it's read), and a gear that opens Settings in a tab. With two or more setups the header becomes a **Showing** picker, which never says "switch".
    2. **Breakage strip** (ticket 18), with **Details**, while a feature isn't fully working.
    3. **One banner**, the most urgent first: consent or upgrade › reset from another browser (ticket 16) › site access (per site) › account changed in another tab › not signed in › private window › no YouTube tab › another account's tab not open › a sync problem (full, or update needed) › Missing or Full playlists › 1.x setup unclaimed › 1.x claim notice.
    4. **Two tabs, YouTube and YouTube Music**, preselected by the active site, else the last one used.
    5. **The tab's content:** a one-line This video status (YouTube) or a compact Playing now row (YouTube Music), then the feature rows.
    6. **Footer:** All settings.
- **Settings page** (`options_ui`, opens in a tab):
  - **Left nav:** YouTube, YouTube Music, Everywhere, Accounts, Appearance, Privacy & data, Diagnostics, About.
  - **Feature rows:** each feature is a row with its name, one line, a **footprint tag** and its switch. The tag says "Doesn't change the page", "Adds buttons to the page" or "Changes right-click on the page". Switching a feature on unfolds its settings under it. Off, it's that single row.
  - **Top strip:** repeats the popup's connection states.
  - **Lazy:** Diagnostics loads only when it's shown.
- **In-page controls:** only those of switched-on features (listed below). Toasts sit bottom-left, where YouTube's and YouTube Music's own appear.
- **First-run tab** and **upgrade-note tab:** each opens once.
- **Toolbar badge:**
  - "!" means the user must act: consent, site access, a Missing or Full playlist, or a feature that isn't working (ticket 18, amber; site access takes priority).
  - A per-tab tick when that tab's video was auto-added (PROVISIONAL).
- **Not used:** a side panel, entries in the browser's right-click menu, new-tab or dashboard pages, and switches inside YouTube's pages.

### Where each capability lives

- **Auto-add** (doesn't change the page):
  - **Switch:** the popup's YouTube tab and Settings › YouTube.
  - **Pause / Resume** (ticket 07): in the popup's Auto-add row and in the watch-page button's menu. Settings shows only "Paused until you resume or restart the browser · Resume", because it holds lasting choices.
  - **Auto-add playlists for the account:** in the popup, where the Auto-add row unfolds to show them, and again in Settings for any account with a setup.
  - **Per-playlist options:** a pill on each ticked playlist opens them: **Takes** (Videos / Shorts / Both), its own **required percentage**, and its **channel filter**.
  - **Settings only:** the default required percentage and Show feedback.
  - **This video** (popup), on a watch page, a Short, or YouTube's home while the miniplayer plays:
    - **The status line:** ticket 07's states, such as "Auto-adds at 50 % · 34 % watched", "Added to … · … at 90 %", "Auto-add paused · Resume" and "Not auto-adding this video · Undo". Its height is reserved, and it fills in when the serving tab answers.
    - **Details ›** unfolds:
      - each playlist's outcome;
      - **Don't auto-add this video**;
      - Allow / Deny this channel;
      - Save to….
    - **When nothing is tracked,** it says what's missing.
  - **On the page:** nothing but its toast, plus its status on the watch-page button when that feature is on. Nothing in the miniplayer.
- **Channel filters:** inside each auto-add playlist's options, in the popup and Settings. Allow / Deny this channel, per playlist, in This video's details and the watch-page button's menu.
- **Playlist shortcuts** (keys only):
  - **Popup:** the row's summary lists the keys. Unfolded, it shows each shortcut's key (ticket 08's recorder), its name and this account's playlist for it, plus Add shortcut, and Remove with Undo. Watch later is offered as "Watch later (every account)".
  - **Settings:**
    - up to 20 shortcuts, each with label, key and playlist;
    - the picker key (Alt+Shift+P) and the undo key (Alt+U);
    - Also on YouTube Music, and Show feedback;
    - a note about keys that the browser or another extension takes.
  - **YouTube Music:** the "here too" switch also sits in its tab and section.
  - **Pickers:** every playlist row shows its key.
  - **A key to open the popup:** Settings › Everywhere links to the browser's own shortcut settings.
- **Quick-save on thumbnails** (adds buttons): a split button at the thumbnail's top-left, on hover or focus, under the queue button. One click saves; ▾ opens the picker. Shorts shelves are covered too. The account's quick-save playlist is chosen in the popup and Settings; while it's unset, the next save asks.
- **Queue button on thumbnails** (adds buttons): the thumbnail's top-left. Its switch is in the popup and Settings; its toast option is in Settings.
- **Watch-page button** (adds buttons; a feature this ticket adds):
  - **Where:** a pill in YouTube's action row after Save, showing auto-add's state. On Shorts it's at the end of the action column, an option.
  - **Its menu** repeats the popup's This video card: the status, the outcomes, Don't auto-add this video, Pause auto-add, this channel's filter, Save to…, and a Settings link.
  - **Weight:** about 5 KB up front; the menu loads on first click (ticket 24).
- **Right-click for the video menu** (changes right-click): Settings has "Links inside cards keep the browser's menu". Shift always gives the browser's menu.
- **YouTube Music section switch:** at the top of the popup's YouTube Music tab and in the header of Settings › YouTube Music. Off means nothing of ours on music.youtube.com.
- **YouTube Music quick actions** (ticket 26's placements):
  - **On the page:** song rows (left of YouTube Music's like and ⋮), card overlays, album and playlist headers (always visible), and queue items. Save on the player bar is opt-in, and nothing depends on the bar.
  - **Popup:** the compact **Playing now** row, with Save; its ▾ picker loads on demand (ticket 26's proposal).
  - **Settings:** six button checkboxes, Show feedback, and the quick-save playlist, shown once under whichever YouTube Music feature is on.
- **Quick-action shortcuts:** the keys in Settings › YouTube Music, and a read-only list in the popup.
- **Settings sync** (ticket 16; a feature, off until switched on in each browser; feature switches and account setups sync):
  - **First run:** a card at the top of step 1 (below).
  - **Settings › Everywhere:** the switch, its help text ("Uses Firefox's own sync. Your settings reach your other browsers only if you're signed in to the browser and it syncs extensions…") and a status line: looking for synced settings, synced, "Synced settings are full. {Largest}: …" with **Remove kept filters**, or "Update Playlist Tools in this browser to keep syncing."
  - **Joining:** when both this browser and the synced copy have settings, switching on asks once: **Use synced settings** (the default) or **Use this browser's settings**, or Cancel. It's one dialog, wherever the switch was flipped.
  - **Popup:** no row. A sync problem becomes a banner with Details.
- **Account setups** (ticket 11):
  - **Picker:** the popup's header, and Settings' "Showing setup for". Both appear only with two or more setups.
  - **Settings › Accounts:** lists each setup with Remove. Sign in and Switch account link to YouTube's own pages.
  - **A new account:** its playlists show unticked, and its first choice creates the setup.
  - **A setup that only came by sync** (ticket 16): its choosers and summaries read "3 auto-add playlists · Open YouTube as {Name} to see them" until that account is opened in this browser.
- **Playlist choosers:** one picker everywhere.
  - **Contents:** Watch Later first, search, Missing / Full marks with Remove, each playlist's key, and **New playlist** (title plus Private / Unlisted / Public, Private by default).
  - **When creating can't work:** "Sign in to YouTube to create playlists" when signed out, and "Open YouTube to create playlists" with no tab.
- **Missing or full playlists** (ticket 12): marked with Remove in the popup's and Settings' choosers. A failure toast's **Settings** lands on that feature in Settings; quick-save's toast says **Choose**.
- **Feature health** (ticket 18):
  - a status line under the feature in the popup and Settings;
  - the popup's strip;
  - one sticky in-page notice per session per feature, with **Details**;
  - a feature that isn't working draws nothing;
  - Settings › Diagnostics: Check now, the report shown in full, Copy, Known problems / Report a problem, and the detailed-log switch.
- **Theme:** Settings › Appearance. It covers the popup, Settings and onboarding; in-page UI follows YouTube.
- **Privacy & data** (Settings):
  - **Consent:** read it again, or withdraw it.
  - **Clear all data:** ticket 16's confirmation. It resets this browser, and deletes the synced copy only if "Also delete synced settings from all your browsers" is ticked. First run shows again afterwards.
  - **1.x's Google access:** a link to remove it.

### First run

- **Opens once in a tab on install,** in three steps:
  1. **What should Playlist Tools do?**
     - **Settings sync comes first** (ticket 16): "Use Playlist Tools in another browser already? Turn on Settings sync to bring your settings here." Turning it on looks for synced settings for up to 10 s, then pre-ticks what they have, marked "From sync", for review.
     - **Then every other feature,** grouped YouTube / YouTube Music, all unticked, each with its footprint tag. A hint says that picking only "Doesn't change the page" features keeps YouTube as it is.
  2. **Before you start:** the store disclosure, with **Agree and turn on N features** and **Not now**. On Chrome, if a YouTube Music feature was ticked, the same click asks for YouTube Music site access (ticket 10).
  3. **Finish setting up:**
     - **First, the YouTube state:** Give access, Open YouTube, Sign in, or the account.
     - **Then a row per chosen feature:** auto-add's playlists, Alt+W's playlist (Watch later on every account), the quick-save playlist, or "Ready".
- **Not now:** nothing runs. The popup shows "Waiting for your OK", and switching any feature on asks for consent first.
- **Runner-up:** consent first, then features. It lost because the disclosure means more once the user knows what they picked, and nothing is handled before Agree either way.

### The 1.4.5 upgrade note (upgraders' consent)

- **Opens once in a tab** after the migration. The toolbar shows "!" until it's handled.
- **One page:**
  1. "No Google credentials needed anymore", with a link to remove 1.x's Google access.
  2. **Kept from 1.4.5:** auto-add and the shortcut, ticked and "Paused until you agree". It shows:
     - their values (ticket 19 decides them);
     - ticket 07's line, "Auto-add now counts only what you actually watch. Skipping ahead and ads don't count.";
     - ticket 08's line, "This key didn't work in 1.4.5. It does now."
  3. **New in 2.0:** every other feature, unticked.
  4. **Before you continue:** the same disclosure, with **Agree and turn on N features**. It comes last because Agree applies the ticks.
- **Agree** claims the 1.x playlists for the signed-in account that owns them, and shows the result in place, using ticket 11's copy.
- **Not now** keeps everything paused, and the popup keeps a Review banner.
- **Runner-up:** only the badge and a popup banner, with no tab. It lost because carried-over auto-add stops until the user agrees, so a quiet badge would read as "2.0 broke auto-add".

### No tab, no site access, signed out, another account

- **No YouTube tab** (ticket 10: no hidden frame):
  - **Popup and Settings:** they show the cached lists, read-only and stamped "saved data from 2 hours ago", with **Open YouTube**, or **Open YouTube Music** in that tab.
  - **What still works:** the switches.
  - **What needs a tab:** the picker and New playlist.
- **No site access** (per site):
  - **Copy:** "Playlist Tools doesn't have access to YouTube." with **Give access to YouTube**; the same for YouTube Music.
  - **The request:** `permissions.request` runs from that click.
  - **Affected features:** they stay on but read "Needs site access". The toolbar shows "!".
  - **Chrome:**
    - **YouTube Music access** is asked for from the click that switches a YouTube Music feature on, first run included.
    - **Playlist shortcuts' "Also on YouTube Music"** shows Give access but never raises the badge.
    - **Chrome 133+:** also call `permissions.addHostAccessRequest` on open YouTube and YouTube Music tabs while a feature for that site is on. Chrome's own extensions menu then offers the grant where the user is.
      - Runner-up: the popup only. It lost because the popup is rarely opened.
- **Not signed in:**
  - **Popup:** "You're not signed in to YouTube in this tab." with **Sign in**.
  - **In-page save buttons:** they stay, and answer "Sign in to YouTube to save videos."
  - **Auto-add:** silent.
  - **Other setups:** still reachable from the header.
- **Another account:** the header names it, its playlists show unticked, and its first choice creates its setup. Setups can't be copied (ticket 11).
- **Private window:** "Private window: {Name}'s setup is in use. You can change it only in a normal window." Setups are read-only there; shared switches stay editable.
- **Account changed in another tab:** a banner, plus failure toasts with Reload.

### Judgement calls and runner-ups

1. **Per-account choices live in the popup and are mirrored in Settings.**
   - **Runner-up:** all configuration in Settings, with the popup holding only "this video" and switches. It lost against ticket 11's "Choose one in the popup", and because 1.x users pick playlists in the popup.
   - **Second runner-up:** everything in the popup, as in 1.5.0. It lost because that is the Friction item "the popup holds every setting".
2. **The popup opens on the switch list; each feature's choices unfold on demand.**
   - **Runner-up:** switched-on features show their choices unfolded. It lost because it breaks ticket 24's first-view budget and makes the popup long.
3. **The popup has two tabs, preselected by site.**
   - **Runner-up:** one long page with both sections. It lost because it's twice as long, and most users never use one of the two sites.
4. **The watch-page button sits in YouTube's action row, after Save.**
   - **Runner-up:** an icon in the player's control bar, which would show in fullscreen. It lost because that bar is crowded and YouTube changes it more than anything else.
   - **Second runner-up:** a chip under the title.
5. **The watch-page button is a feature of its own, not an auto-add option.**
   - **Runner-up:** "Show status on the watch page" under auto-add. It lost because the button also saves and edits filters without auto-add, and every change to the page gets its own switch.
6. **Thumbnail buttons stack at the top-left.**
   - **Runner-up:** the top-right. It lost because YouTube's own hover buttons sit there.
7. **Pause lives in the popup and the watch-page menu; Settings only shows Resume.**
   - **Runner-up:** Pause in Settings too. It lost because Settings holds lasting choices.
8. **The miniplayer gets nothing of ours.** Its status shows in the popup and the toolbar tick.
   - **Runner-up:** a small status icon in the miniplayer, which ticket 14 can try.
9. **No side panel.**
   - **Runner-up:** a side panel for long playlist lists. It lost because it won't open in Chrome's installed-app windows (ticket 21), and it would be a third surface to maintain.
10. **No browser right-click entries.**
    - **Runner-up:** "Save to ▸" in the link menu, a quick-save that leaves YouTube's look alone. It lost for now because it adds `menus`/`contextMenus` and a second save path. It's raised as a question below.
11. **Only YouTube Music has a site switch** (map Q20–Q21).
    - **Runner-up:** a matching YouTube switch. It lost because it duplicates the per-feature switches, and disabling the extension does the same.
12. **The badge's "!" means "something needs you":** consent, site access, a Missing or Full playlist, or a feature that isn't working. One-off failures set no badge, because ticket 12 holds toasts in hidden tabs until they're visible. This answers ticket 12's badge question.
13. **Missed toasts:** This video shows each playlist's outcome for the tab's video, which needs no new capability. A **Recent adds** list at the bottom of the popup is sketched as a proposal. It's a new capability, so it needs the user's go-ahead. This answers ticket 12's second question.

### PROVISIONAL

- **The per-tab tick on the toolbar icon** for an auto-added video, offered as an auto-add option. Its default belongs to ticket 15.
- **The Recent adds list:** a proposal only.
- **Exact in-page positions** of the watch-page button, the thumbnail stack and the Shorts column, until ticket 14 tries them on real YouTube.
- **Quick-save on Shorts shelves,** as an option.
- **`addHostAccessRequest`** on Chrome 133+.
- **The Diagnostics links:** they point to GitHub until ticket 19 picks the support channel (ticket 18).

### Notes for the hi-fi prototypes

- **[Ticket 14](14-in-page-controls.md), in-page YouTube:**
  - **Try these placements on real YouTube:**
    - the thumbnail stack (queue above quick-save's split button) on every card type, drawn by one hover overlay rather than a button per card (ticket 24);
    - the watch-page pill after Save, including what happens when YouTube folds its action row into "…" at narrow widths;
    - the end of the Shorts action column;
    - toasts bottom-left, and fullscreen.
  - **The watch-page pill:**
    - its labels come from ticket 07's state table, and its menu equals the popup's This video card;
    - about 5 KB up front, with the menu loading on first click.
  - **Signed out:** buttons stay and answer.
  - **Not working:** a feature that isn't working draws nothing. Its notice is a sticky toast in the failure style (ticket 18).
  - **Dashed outlines:** they only mark placement in the prototype; they aren't a style.
- **[Ticket 15](15-popup-and-settings.md), popup and settings:**
  - **Keep this structure:**
    - the popup: header › breakage strip › one banner › YouTube | YouTube Music tabs › one status line › feature rows › footer;
    - Settings: a left nav, feature rows that unfold, and footprint tags;
    - one shared playlist picker and one key recorder.
  - **Ticket 24's first view:** only the switch list paints from storage. Unfolded rows, This video's details, the pickers and the account view load on demand.
  - **Settled here:** the banner order, and the "Showing" pickers appearing only with two or more setups.
  - **Ticket 16's pieces to draw:** the join question, the "full" message with Remove kept filters, the "Update" status, Clear all data's checkbox, and "Open YouTube as {Name}" for setups that only came by sync.
  - **Long lists:** test long playlist lists in an unfolded Auto-add row.
  - **Look:** the extension's own design system, never YouTube's look (ticket 03).
  - **Stack bug:** shadcn-svelte's generated components style `data-checked`, `data-open` and similar, but Bits UI 2.19 sets `data-state`. The prototype maps them with `@custom-variant` in `app.css`; the real build needs the same, or newer components.
  - **Dev server:** vite-plugin-svelte 7 with rolldown 1.2 breaks `vite dev` while pre-bundling svelte for SSR. The prototype excludes svelte from the SSR optimizer.
- **[Ticket 27](27-youtube-music-controls.md), in-page YouTube Music:**
  - **Placements:** ticket 26's, mocked as decided, with rows and cards sharing one hover overlay (ticket 24).
  - **Trailing slot:** reserve its width up front, so the buttons never cover a title in narrow queue panels (found while building).
  - **What isn't drawn:**
    - no Like of ours on album track rows;
    - queue items get only Save, Like and Remove;
    - Save on the player bar is opt-in and draws nothing when there's no bar.
  - **The popup's Playing now row** is in, reachable from the installed app's title bar.
  - **Switches:** the section switch off leaves nothing of ours on the page. Switching a feature on asks Chrome for access.

### New questions

- **"Save to ▸" in the browser's right-click menu:** a quick-save for people who want YouTube untouched. Wanted? It needs `menus`/`contextMenus`, so check its install and update prompts first (ticket 10).
- **Recent adds:** a go-ahead for the popup list?
- **The toolbar tick for auto-added videos:** wanted, and on or off by default?
- **A paused auto-add on the toolbar icon:** should it show there? Today only the popup and the watch-page button show it.

### Assumptions about open tickets

- **[22](22-name.md):** "Playlist Tools" and the "PT" icon are placeholders.
- **[19](19-upgrade-and-rollout.md):** decides the carried-over values and the support channel.

Also from [ticket 19](19-upgrade-and-rollout.md), after resolution: before Agree, the upgrade note can show only stored values ("{N} playlists you chose in 1.x", the real percentage, the 50 % / 0 % question). Showing playlist titles or signed-in state needs a YouTube request, and none is made before consent ([ADR-0010](../../../docs/adr/0010-one-consent-gates-every-feature.md)). The final copy is in ticket 19's §3–§4.
