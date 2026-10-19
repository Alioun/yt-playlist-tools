# How do the controls inside YouTube look and behave?

Type: prototype
Status: resolved
Labels: wayfinder:prototype
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 09, 12

## Question

Prototype the controls inside YouTube, in YouTube's own look:
- thumbnail buttons: Add to queue, and quick-save with its playlist choice;
- the watch-page controls [ticket 09](09-where-things-live.md) puts there, such as this video's auto-add status and a quick add;
- Shorts;
- toasts with undo;
- the right-click card menu.

Once the static look is agreed, make a rough dev build and try it on real YouTube (settled while charting).

Also from [ticket 05](05-ui-stacks.md):
- **Theme source:** does in-page UI follow YouTube's own dark mode through its `--yt-sys-color-baseline--*` variables, ignoring the extension's theme setting? These variables are undocumented.
- **Sizing:** YouTube sets `<html>` to `font-size: 62.5%`, so use px or YouTube-style rem?
- **Fullscreen:** auto-add fires while watching, but anything outside the fullscreen player is invisible.

Also from [ticket 13](13-ui-stack.md): choose the toast component (shadcn-svelte's toast or another), and keep Tailwind's `@property` rules and any library CSS out of YouTube's `<head>`.

Scope: this ticket covers YouTube. YouTube Music's controls are [ticket 27](27-youtube-music-controls.md). Every control here belongs to a feature the user can switch off, and switching it off removes it from the page completely (map Notes).

Also from [ticket 01](01-youtube-requests.md): sending edits through YouTube's commands lets YouTube show its own error toast, and maybe a confirmation, alongside ours. The queue's create path appears to append, not replace (unverified).

Also from [ticket 11](11-accounts.md): in-page UI shows only the tab's own account's data. Optionally, offer an in-page "choose a playlist" for a shortcut that has none on this account.

Also from [ticket 26](26-youtube-music-quick-actions.md): share the toast component with YouTube Music, which gets its own skin. Confirm the term "quick-save playlist" for YouTube's thumbnail quick-save.

Also from [ticket 10](10-youtube-access.md): there are no web-accessible resources, so icons and fonts in in-page UI are inline. Every feature has a teardown that removes its elements, styles and listeners.

Also from [ticket 12](12-adding.md):
- **Toasts:** bottom left, one at a time, failures not marked by colour alone. Decide whether toasts show in fullscreen or wait until it ends.
- **Quick-save:** a split button in ticket 26's model, hidden on made-for-kids cards if that's detectable.
- **The queue button** has four states, including "Sent, not confirmed".
- **Open:** should our in-page toasts carry a small extension mark, so users can tell them from YouTube's own? That's "look like YouTube" against clarity.

Also from [ticket 07](07-watched.md): use its states table and draft copy for this video's auto-add status, the Shorts and miniplayer status (the miniplayer now counts), and fullscreen.

Also from [ticket 08](08-shortcuts.md):
- When the picker key (Alt+Shift+P) opens the picker, it anchors to the pointed-at card, else the player, else the window centre.
- Card recognition includes playlist-page rows and the watch page's playlist panel.
- Quick-save tooltips can show the picker key.
- Every in-page shadow root uses `isolateEvents: true` and `mode: "open"`.
- Verify in the dev build that Bits UI popovers still close on Escape with isolation on.

Also from [ticket 18](18-breakage.md): the "not working" notice is a sticky variant of the shared toast. You own the theme-variable fallback palette, the card selectors and the card self-check, and the anchor thresholds.

Also from [ticket 29](29-youtube-queue-undo.md): the YouTube queue button's toast gets Undo, removing exactly the entry it added. Prototype the queue toast with Undo.

Also from [ticket 24](24-performance-budget.md):
- **Eager UI** is plain Svelte with a YouTube skin; Bits UI popovers and menus load on first use.
- **One shadow host per page,** and one overlay for thumbnail buttons, not one per card. Keyboard reach for the overlay is unsolved, e.g. insert it after the focused card link.
- **The toast** is hand-written (about 3 KB, not svelte-sonner).
- **No Tailwind or shadcn styles in pages,** which closes ticket 13's `@property` question.
- **Budgets:** YouTube at most 49 KB gzip with everything on; watch-page controls about 5 KB up front.

Also from [ticket 09](09-where-things-live.md) and its [prototype](https://github.com/Alioun/yt-playlist-tools/tree/prototype/where-things-live/prototypes/where-things-live) (branch `prototype/where-things-live`):
- **Thumbnails:** try the stack (quick-save and queue at the top-left) drawn by one hover overlay.
- **Watch-page button:** its own feature, placed after YouTube's Save in the action row. Test it when YouTube folds the row into "…" at narrow widths, on the Shorts action column, with toasts at the bottom left, and in fullscreen. Its labels come from ticket 07's states, and its menu repeats the popup's "This video" card.
- **Not working:** a feature that isn't working draws nothing and shows a sticky notice.
- **Miniplayer:** gets nothing of ours.
- **Stack bugs found:** shadcn-svelte's generated components style `data-checked`/`data-open` but Bits UI 2.19 sets `data-state` (mapped in the prototype's `app.css`); vite-plugin-svelte 7 with rolldown 1.2 breaks `vite dev` (svelte excluded from SSR pre-bundling).

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up. This answer folds in ticket [17](17-modules.md), resolved while this was built: the prototype uses its folder layout, its linked kit and its runtime registration. Real-YouTube checks were made signed out, in headless Chromium 156, on 2026-10-19.

**Prototype:** [`prototypes/in-page-controls/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/in-page-controls/prototypes/in-page-controls) on branch `prototype/in-page-controls`.
- **What it is:** Svelte 5 with a hand-written YouTube skin; Bits UI only in the lazy `popovers.js`. No Tailwind and no shadcn.
- **Two hosts for the same code:**
  - **The hi-fi mock:** YouTube's pages faked in YouTube's own markup, light and dark.
  - **The rough dev build:** the real site core, kit, features and popovers, as an MV3 extension on real youtube.com.
- **Run the mock:** `cd prototypes/in-page-controls && bun install && bun run dev`, then open the URL it prints.
  - **The bottom bar** cycles 22 guided scenes (`?scene=`). The ← and → keys do too.
  - **Theme and variant:** the bar also switches YouTube's theme (`?theme=dark`) and the variant (`?variant=A|B|C`).
  - **The panel** switches every feature, "not working" state, answer and account state, and shows the live state.
- **Run the dev build:** `bun run build`, then load `dist-ext/` unpacked in Chrome.
  - `node scripts/live.mjs` drives it on real YouTube and writes `screenshots/live-*.png` and `live-report.json`.
  - `node scripts/shots.mjs` screenshots the mock.
  - Both need a Chromium (`CHROME=…`).
- **Variants:**
  - **A:** recommended.
  - **B:** pure YouTube look. No extension mark; the idle watch-page button reads "Save to…".
  - **C:** compact. The pill is always icon-only, and the thumbnail buttons sit in a row.
- **Screenshots:** [`screenshots/`](https://github.com/Alioun/yt-playlist-tools/tree/prototype/in-page-controls/prototypes/in-page-controls/screenshots). There are 36 of the mock (`NN-*`) and 47 from real YouTube (`live-*`).

### In short

- **One look:** every control copies the YouTube control it sits beside, measured on the live site:
  - thumbnail buttons copy YouTube's own hover toggles;
  - the watch-page button copies the action-row buttons;
  - the Shorts button copies the Shorts column;
  - the toast copies YouTube's snackbar;
  - the picker and menu copy YouTube's popup menus.
- **Theme:** colours come from YouTube's own `--yt-sys-color-baseline--*` variables, with a built-in palette as fallback. Type follows YouTube's rem.
- **Placement:**
  - **Watch page:** the button goes **after Share, before Save**. It's the only stable slot in YouTube's row (ticket 09 said "after Save").
  - **Thumbnails:** one overlay per page carries the queue and quick-save buttons at the top-left. It moves into the hovered or focused card, so it scrolls with the card and Tab reaches it.
  - **Shorts:** the button is the last action, above the sound button.
- **Two live surprises:**
  - YouTube's own lockups now draw a hover **Add to queue** (and Watch later), so ours steps aside on those cards.
  - YouTube's fullscreen element is `<html>`, so our toasts are visible in fullscreen without moving anything.
- **The ticket 17 shape works on real YouTube:**
  - Runtime registration: `pp-www-page` (MAIN) plus `pp-www` (core → kit → features, isolated).
  - Features linked to the kit's Svelte runtime.
  - `popovers.js` injected on first use.
  - Scope teardown leaves zero hosts.
- **Sizes:** everything eager comes to 39.6 KB gzip (49 budget, with 4 KB still kept for auto-add). Within that, the kit is 27.8 KB against its 18 KB line.

### Decisions

**Theme, type and sizing**
- **Colours follow YouTube's theme, never the extension's theme setting.**
  - Every colour reads YouTube's `--yt-sys-color-baseline--*` variables, which inherit into our shadow roots.
  - The fallback palette holds YouTube's light and dark values from `kevlar_base.css`. It's picked by the `dark` attribute, which one MutationObserver mirrors from `<html dark>` onto our hosts. (`:host-context()` would avoid the mirror, but Firefox lacks it.)
  - Missing variables raise ticket 18's `cosmetic` signal.
  - Live values checked: base `#fff` / `#0f0f0f`, text `#0f0f0f` / `#f1f1f1`, menu `#fff` / `#282828`.
  - *Runner-up:* the extension's theme setting. It lost because a dark menu on light YouTube breaks "look like YouTube".
- **Type uses YouTube's rem; boxes use px.** That's what YouTube's own CSS does: type such as `1.4rem` = 14 px under its `62.5%` root, and boxes such as the 40 px buttons in px. So our text follows the browser's font-size setting exactly as YouTube's does.
  - *Runner-up:* px everywhere. It lost because a user who enlarges the default font would see YouTube's text grow and ours stay put.
  - Ticket 27 must check YouTube Music's root size.
- **Font:** `Roboto, Arial, sans-serif`, which YouTube loads itself. Nothing is bundled.
- **Icons** are inline 24 px paths (ticket 10). Where YouTube has the same action, we use YouTube's glyph: its queue glyph, and its bookmark for Save.

**Hosts, isolation and teardown**
- **Hosts:**
  - **One layer host per page** (`pp-layer`, fixed, z-index 2300) for toasts, notices and the popovers' mount point.
  - **One overlay host** (`pp-overlay`) that moves between cards.
  - **One inline host per in-flow control** (`pp-inline`): the watch-page pill, the Shorts button.
  - The count is constant and never per card. All are built with `@webext-core/isolated-element` (`mode: "open"`, `isolateEvents: true`) and share one Svelte runtime.
  - This refines ticket 24's "one shadow host per page": an in-flow control must sit inside YouTube's own row.
- **The layer exists only while a running feature needs the kit.** The core tells the kit, through `setNeeded`. On live YouTube, switching every feature off left zero hosts (`live-report.json`).
- **Everything a control adds goes through its feature's scope** (ticket 17): listeners, observers, timers and hosts.
- **Escape:** each popover closes itself on Escape.
  - This was checked live: with `isolateEvents` on, Bits UI's `document` keydown listener never hears Escape, so a Bits UI popover does **not** close (ticket 08's check).
  - Typing "kk" in our picker's search left the player playing, so the isolation works.
  - *Runner-up:* let Escape through the isolation (ticket 08's fallback). It lost because Escape would then also reach YouTube's own handlers.

**Thumbnail buttons (Add to queue, quick-save)**
- **The overlay:**
  - It sits at the thumbnail's **top-left**, 4 px in, with the buttons stacked 4 px apart: queue above quick-save.
  - This mirrors YouTube's own hover toggles, which are top-right. Thumbnails under 100 px tall (the playlist panel's 56 px) get a row instead.
  - **Size and look,** measured from YouTube's toggles: 32 px round, `rgba(0,0,0,.3)` (`.6` on hover), white 24 px glyph.
  - **Split button:** 34 + 22 px with a 1 px divider; the ▾ glyph is 20 px.
  - **Tooltips:** YouTube's (`#616161` at .92, 12/18, 4 px radius). They show after 0.5 s, to the right so they never cover the stack. The ▾ tooltip teaches the key: "Save to… (Alt+Shift+P)".
- **Placement:** the overlay host is inserted **right after the thumbnail link** and positioned on the visible thumbnail box.
  - **Scrolling:** it moves with the card, with no scroll or rAF work.
  - **Keyboard reach:** focusing the thumbnail link attaches it, so Tab reaches our buttons right after YouTube's own toggles. Checked live: Tab goes Watch later → Add to queue (YouTube's) → ours.
  - *Runner-up:* the overlay inside the page layer, positioned by coordinates. It lost on scroll tracking and Tab order.
- **Search results:** YouTube's inline preview plays in a separate layer (`ytd-app › #video-preview › ytd-video-preview`) above anything inside the card, as the probe found. So while the preview covers the card, our host **moves into the preview element**. This was checked live, with our buttons on top in both themes.
- **Add to queue, five visuals:**

  | State | Glyph | Label |
  |---|---|---|
  | Add to queue | queue | Add to queue |
  | Adding… | spinner | Adding… |
  | Added to queue | check, which stays until the page changes; a click does nothing | Added to queue |
  | Sent, not confirmed | dots-in-circle; a click sends again | Sent, not confirmed. Click to send again |
  | Couldn't add | error glyph, for 1.5 s | Couldn't add |

  - The toast with **Undo** (ticket 29): Added "{title}" to the queue.
- **Ours steps aside where YouTube draws its own hover Add to queue.**
  - Live, signed out, lockup cards draw YouTube's own Watch later and Add to queue toggles at the top-right. They're labelled "Add to queue" and appear about 100 ms after hover.
  - So the queue slot isn't drawn on those cards. The overlay re-checks at 150 ms and 900 ms, and Tab order then reaches only quick-save.
  - Where YouTube draws none (other buckets, signed-in feeds that dropped them, the playlist panel), ours fills the gap.
  - *Runner-up:* always draw ours. It lost because two Add to queue buttons on one card is confusing (see `live-grid-hover-both-queues-*`).
- **Quick-save:**
  - **The split:** the main part saves to the quick-save playlist; ▾ opens the picker. The term "quick-save playlist" is confirmed (ticket 26).
  - **States:** idle (bookmark), busy, done ✓ (1.5 s), then a **filled bookmark** "Saved to {list}" for the rest of the page view, and failed (1.5 s). Clicking a saved card answers "already in".
  - **No quick-save playlist yet:** a single button, "Save to…", that opens the picker in choose mode.
  - **Shorts shelves:** quick-save only, when "On Shorts shelves too" is on. There's no queue on Shorts, because YouTube's own menu doesn't offer it there.
- **Made-for-kids cards** can't be told apart from their markup, so the button is drawn and a click gets ticket 12's refusal, once per session.
- **Signed out:** the buttons stay and answer "Sign in to YouTube to save videos." with **Sign in**; the picker doesn't open. The queue works signed out.

**The watch-page button**
- **Placement:** the end of `ytd-menu-renderer #top-level-buttons-computed`, which puts it **after Share and before Save**.
  - The probe tried four spots, and only this one survives YouTube's re-rendering. YouTube re-creates `#flexible-item-buttons` (where Save lives) on every fold change and deletes anything inserted there. Spots outside `ytd-menu-renderer` land on a line of their own.
  - This slot is also the only one YouTube's own folding counts.
  - It re-places itself after YouTube's navigation events, with bounded retries. One childList observer on the row puts it back if YouTube drops it.
  - *Runner-up:* after Save, as ticket 09 planned. It lost because it's deleted on the first resize.
- **Look:** YouTube's action button.
  - **Pill:** 40 px tall, 20 px radius, `additive-background` (`rgba(0,0,0,.05)` / `rgba(255,255,255,.1)`), 14 px/500, 24 px lead glyph, 8 px from its neighbour.
  - **Icon-only:** a 40 px circle.
  - **Tooltip:** below.
- **Labels,** the final in-page copy for ticket 07's table:

  | State | Pill | Status line (tooltip and menu) |
  |---|---|---|
  | Counting | ◔ pie · Auto-adds at 50 % | Auto-adds at 50 % · 32 % watched |
  | Partly added | ◔ pie · Auto-added · next at 90 % | Added to Music videos · Talks to watch at 90 % |
  | Added | ✓ Auto-added | Auto-added to Music videos and Talks to watch |
  | Already in | ✓ Already in Music videos | Already in Music videos |
  | Failed | error glyph · Couldn't auto-add | Couldn't auto-add to Music videos. Check your connection. |
  | Skipped | ⊘ Not auto-adding | Not auto-adding this video |
  | Paused | ⏸ Auto-add paused | Auto-add paused until you resume it or restart the browser |
  | Live | live glyph · Not auto-added | Live streams aren't auto-added |
  | Can't measure | ⚠ Can't follow progress | Auto-add can't follow this video's progress, so it won't be added |
  | Not tracked, or auto-add off | **icon only, the extension's mark** | "Playlist Pigeon: save this video" |

- **Progress is a pie inside a full outline.** A partial ring read as a loading spinner next to YouTube's buttons, especially icon-only.
- **No status to show: icon only, with the mark.**
  - *Runner-up (variant B):* a labelled "Save to…" pill. It lost because a second "Save" next to YouTube's own Save, two buttons apart, reads as a duplicate.
- **Narrow rows: our label folds before YouTube's Save has to.**
  - A **capture-phase** `resize` listener runs before YouTube's own fold logic. It measures the row, and if our full pill plus Save wouldn't fit, the pill goes icon-only at once.
  - It unfolds when both fit with 16 px to spare.
  - On a narrow first load, YouTube may already have folded Save. Then the pill folds too and sends one synthetic `resize`, so YouTube re-measures.
  - **Live sweep, both themes:**

    | Width | Our pill | YouTube's Save |
    |---|---|---|
    | 1400 | full | shown |
    | 1200 | icon-only | shown (before this rule, Save was folded) |
    | 1000 | full | shown |
    | 860 | icon-only | **folded** |
    | 700 | icon-only | folded (YouTube folds it there anyway) |
    | 560 | icon-only | shown |
    | 420 | icon-only | **folded** |

  - At 860 and 420, even our 40 px icon costs YouTube's Save. It stays one click away in YouTube's "…" and in our menu's "Save to…".
  - *Runner-up:* hide our button whenever it would cost Save. It lost because the feature would silently vanish at common widths, such as half a 1920 px screen. This is a question for the user (below).
- **Its menu** (lazy, Bits UI) is the popup's This video card in YouTube's menu look (12 px radius, 40 px rows):
  - the status line with the pie;
  - each auto-add playlist's goal or outcome ("At 50 %", "Auto-added ✓", "Filtered out");
  - **Don't auto-add this video** / **Auto-add this video again**;
  - **Pause auto-add** / **Resume auto-add**;
  - **Channel filters · {channel}**, one row per auto-add playlist with its mode and a Deny/Allow chip that toggles this channel;
  - **Save to {quick-save}** (one click; becomes "Saved to …"), or "Save to playlist…" in choose mode;
  - **Save to…** with its key, which opens the picker on the same anchor;
  - **Playlist Pigeon settings.**

  With auto-add off, only the Save rows and the settings link remain. The menu flips above the button when there's no room below, as YouTube's do. Rows show their own results, with no toasts.
- **Shorts (option "On Shorts too", on by default):**
  - **Placement:** the last action of `reel-action-bar-view-model`, just before the sound (pivot) button.
  - **Size:** 48 × 78, like YouTube's items: a 48 px circle and a 12/18 label 4 px below.
  - **Labels:** "Save" (bookmark), "32 %" (pie), "Added", "Paused", "Skipped".
  - **Menu:** opens to the left.
  - This bucket has no dislike and no "…" in the column.
- **Nothing of ours in the miniplayer** (ticket 09) **or in fullscreen.** The button lives outside the player; the status stays in the popup.

**Toasts** (hand-written, about 3 KB in the kit; shared with YouTube Music in its own skin)
- **Look:** YouTube's snackbar, measured live.
  - Bottom-left with a 16 px margin, at least 288 px wide, an 8 px radius, no border, shadow `0 0 24px rgba(0,0,0,.1)`, 14/20 Roboto with 12 px around the text.
  - **Inverted surface:** `#0f0f0f` on light YouTube, `#f1f1f1` on dark.
  - **The action** is a text button in the inverse call-to-action blue.
  - **Width:** ours wraps up to 568 px, because our copy is longer than YouTube's one-liners.
- **One at a time, 6 s.**
  - The timer pauses while the pointer or focus is on the toast, and while the tab is hidden.
  - The newest toast replaces the one showing.
  - A **sticky notice is set aside, not lost,** when a newer toast arrives, and comes back afterwards.
- **Hidden tab:** one toast waits, the newest failure first (checked in `33-hidden-tab-held-failure`).
- **Failures:** YouTube's error glyph (filled circle "!", inverse error colour), `role="alert"` and "Couldn't …" wording. Never colour alone. "Already in" and other did-nothing answers are neutral.
- **The mark (ticket 12's open question):** a small monochrome mark starts toasts the user didn't ask for, which are auto-add's and the "not working" notice. Answers to the user's own click or key carry none, and failures show the error glyph instead.
  - *Runner-up (variant B):* no mark anywhere, the purest YouTube look. It lost because an unexpected "Auto-added …" or notice needs a source the user can find in order to switch it off.
  - *Second runner-up:* a mark on every toast. It lost because it clutters the common case, where the user just clicked.
  - The mark is a placeholder pigeon until ticket 22 settles the name and icon.
- **Fullscreen (ticket 12's choice):**
  - **Toasts answering the user's own click or key show** over the video, at bottom 88 px and left 24 px, above YouTube's control bar.
  - **Toasts the user didn't ask for wait** until fullscreen ends: auto-add confirmations and failures, and notices.
  - Checked live: YouTube makes `<html>` the fullscreen element, so the layer stays visible and needs no moving. Alt+W in fullscreen showed its toast over the video, and the held auto-add toast appeared on exit (`live-watch-fullscreen-dark`, `live-watch-after-fullscreen-dark`).
  - The kit still moves its layer into a fullscreen element that doesn't contain `<body>`.
  - *Runner-ups:* hold everything, which lost because a key pressed in fullscreen would get no answer; show everything, which lost because auto-add would interrupt a film it was told to watch quietly.
- **The pending toast:** a key-triggered add with no answer after 1 s shows "Saving "{title}" to {list}…" with a spinner, and turns into the outcome in place.
- **Alt+U** runs Undo on the toast showing, else "Nothing to undo."
- **The queue toast's Show feedback (PROVISIONAL, for ticket 15):** recommend changing the default to **on**.
  - Ticket 12 set it off "because it has no undo", and ticket 29 gave it Undo.
  - YouTube's own queue adds show a toast too.
  - The mock runs with it on.

**The "not working" notice (ticket 18)**
- The sticky failure toast, with the mark's place taken by the error glyph, **Details** (settings › Diagnostics) and ✕.
- **When:** at the moment the feature would act: the first hover over a card for the thumbnail buttons, a placement for the watch-page button, a right-click for the card menu.
- **Batching:** features found within 60 ms share one notice, e.g. "Quick-save and the Add to queue button aren't working right now because YouTube changed something. Use YouTube's own buttons for now."
- **New row for ticket 18's table:** "The watch-page button isn't working right now because YouTube changed something. This video's status is still in the toolbar popup."

**The playlist picker** (lazy, in `popovers.js` with Bits UI)
- **Look:** YouTube's popup.
  - 320 px wide, `menu-background`, 12 px radius, shadow `0 4px 32px rgba(0,0,0,.1)` (`.5` in dark).
  - **Title:** "Save to…" (16/22). In choose mode: "Save videos to…" with "One click will save here from now on."
  - **Search field:** a 36 px pill, focused on open.
  - **Rows:** 40 px. Each has YouTube's square checkbox (filled with the text colour when checked), the title, a privacy glyph (lock, link or globe), a key chip (e.g. `Alt+W`), and a pin. The pin is visible on hover or focus, and always on the quick-save playlist ("Use for one-click save").
  - **Footer:** "+ New playlist" opens an inline form: Name (150 chars; `<`/`>` refused inline; "You already have a playlist called …"), Visibility (Private / Unlisted / Public, Private by default), Cancel and Create (disabled while creating).
- **Behaviour:**
  - **Check marks** pulse while membership loads. Rows work before membership arrives.
  - **Each row shows its own result:** busy, checked, or "Couldn't save". There are no toasts.
  - **Unticking removes:** still PROVISIONAL, as in tickets 12 and 26.
  - **Membership unreadable:** "Couldn't check where this video already is."
  - **Choose mode:** a pick saves, becomes the quick-save playlist, closes the picker and shows ticket 12's "… One click now saves there." toast with Undo.
- **Anchoring:**
  - **From ▾:** below the split button, flipping above when there's no room.
  - **From the watch-page menu:** on the pill.
  - **Alt+Shift+P (ticket 08):** beside the pointed-at card's thumbnail (side right); else over the player at its top centre; else the window's top centre.
  - Bits UI's `customAnchor` takes elements and virtual rects across shadow roots.
- **Loading:**
  - `popovers.js` is injected by the background with `scripting.executeScript` on first use. Hovering ▾ or the pill preloads it quietly.
  - **Failure:** if it doesn't load within 5 s, an explicit click gets "Couldn't open the playlist list. Try again." A hover preload's failure stays in the console.
- **Ticket 11's option is adopted:** "{Shortcut} has no playlist on {Name} yet" gets a **Choose** action that opens this picker in choose mode for that shortcut. It isn't drawn in the prototype.

**The right-click card menu**
- **What it opens:** right-click on a card's thumbnail, title or empty area opens **YouTube's own ⋮ menu**. The gateway job `openCardMenu` clicks the card's ⋮ (exempt: it is the feature). YouTube anchors the menu at the ⋮ button, flipping above when needed.
  - Checked live: signed out, the items are Add to queue, Save to playlist, Download and Share (`live-grid-right-click-light`).
  - *Runner-up:* the menu at the pointer. It lost because it means repositioning YouTube's own dropdown, which is fragile.
- **What keeps the browser's menu:**
  - Links to anything other than the card's video (channel name, avatar, hashtags) **always** do, which fixes 1.5.0's friction.
  - Settings' "Links inside cards keep the browser's menu" (off by default) extends this to the thumbnail and title links.
  - Shift+right-click, ads, playlist cards and cards without a ⋮ always get the browser's menu.
- **The card menu loads no kit** (ticket 24). It only borrows the kit's toaster for its notice when the kit is there (see the note for ticket 17).

**Item recognition (ticket 18 §5.1, `site/core/items-www.ts`)**
- **Selectors,** live: YouTube's lockups now use camelCase classes. The BEM spellings are kept as fallbacks.

  | Card | Thumbnail link · box | Title | ⋮ |
  |---|---|---|---|
  | `yt-lockup-view-model` (grids, watch sidebar, playlist page) | `a.ytLockupViewModelContentImage` · `yt-thumbnail-view-model` | `a.ytLockupMetadataViewModelTitle` | `.ytLockupMetadataViewModelMenuButton button` |
  | `ytd-video-renderer`, `ytd-rich-grid-media`, `ytd-grid-video-renderer`, `ytd-compact-video-renderer` | `a#thumbnail` · `ytd-thumbnail` | `a#video-title`, `a#video-title-link` | `#menu ytd-menu-renderer yt-icon-button#button button` |
  | `ytd-playlist-panel-video-renderer` | `a#thumbnail` · `#thumbnail-container` (the video from `a#wc-endpoint`) | `#video-title` | `#menu … button` |
  | `ytm-shorts-lockup-view-model` (Shorts shelves) | `a.shortsLockupViewModelHostEndpoint` · `yt-thumbnail-view-model` | `h3 a.shortsLockupViewModelHostOutsideMetadataEndpoint` | `.shortsLockupViewModelHostOutsideMetadataMenu button` |

  - **Unsupported:** ads (`ytd-ad-slot-renderer`, `ytd-in-feed-ad-layout-renderer`, …), playlist and mix lockups (a collection stack, a "Play all" scrim, or a `/playlist?list=` link), channel cards and posts.
  - **The player:** anything inside a player is that player's video.
- **The key-press self-check:** a link to `/watch?v=` or `/shorts/`, or an element holding exactly one such video, outside any player. If it says yes but nothing is recognised, the key does nothing and raises `item-unrecognised` with ticket 18's copy.
- **Search's inline preview:** the pointer over it resolves to the card underneath, through `elementsFromPoint`.
- **The page-settle check keeps ticket 18's starting values** (at least 6 distinct video links, at least half recognised). Live, every page recognised all of its links:

  | Page | Recognised |
  |---|---|
  | Channel grid | 30/30 |
  | Search | 29/29, 37/37, 38/38 |

**Keys (ticket 08), as wired here**
- **The listener:** one capture-phase `keydown` on `window` in the core: Alt+W, Alt+Shift+P and Alt+U.
- **Ignored:** typing, IME, auto-repeat, our open popover, and YouTube's open dropdowns or dialogs.
- **On a match:** the key is consumed.
- **Target:** the pointed-at item (pointer or focus, whichever moved last), else the current video.

### What the real-YouTube dev build showed

The setup, matching production as ticket 17 asks:
- **Registration:** the background registered `pp-www-page [MAIN] page-www.js @document_start` and `pp-www [ISOLATED] core-www.js → kit-www.js → feature-shortcuts-www.js → feature-quick-save.js → feature-queue-button.js → feature-watch-button.js → feature-card-menu.js @document_idle` at runtime. There are no manifest `content_scripts` and no web-accessible resources.
- **Builds:** plain Vite/Rolldown IIFE lib builds stood in for WXT unlisted scripts. WXT's wrapper would add about 253 B per file.
- **Linking:** features link `svelte/internal/client` and `$kit` to `__pp.svelte` and `__pp.kit.lib`, and the kit exports only the 19 Svelte names the features use.
- **Pages:** a channel grid (signed-out home is empty), search, a watch page and a Short, in light and dark, plus a width sweep from 1400 to 420.

**What worked:**
- **Theme:** both themes from YouTube's variables (`#fff` / `#0f0f0f`).
- **Placements:**
  - the overlay on top of lockups;
  - the pill after Share, matching YouTube's row (`live-watch-row-*`);
  - the Shorts button before the sound button, 48 × 78.
- **The card menu:** YouTube's ⋮ menu opened on right-click.
- **Keyboard and isolation:**
  - the Tab order YouTube toggles → ours;
  - typing in our picker didn't reach YouTube's hotkeys.
- **Fullscreen:** as decided.
- **Teardown:** switching features off left zero hosts.

**What broke, and the fix in the prototype:**
- **Placement:**
  1. **"After Save" isn't a stable slot.** We moved to after Share (probe).
  2. **YouTube folded its Save because of our full pill** (at 1200), and doesn't re-measure after our pill shrinks. Fixed with the pre-emptive capture-phase fold above.
  3. **Search's inline preview covered the overlay.** The preview element only exists after the first hover, so we watch it lazily, re-check at 150 and 900 ms, and move into its layer.
- **YouTube's own UI:**
  4. **YouTube's own lockups draw Add to queue on hover** (bucket-dependent). Ours steps aside on those cards.
  5. **Bits UI didn't close on Escape under `isolateEvents`.** The popovers now handle Escape themselves.
  6. **Fullscreen** is `<html>`, not the player, so nothing needs moving.
- **Lifecycle:**
  7. **The kit's layer host survived switching every feature off.** The kit now lives only while needed.
  8. **Two `$state` identity bugs:** slots never unregistered, and a re-check never fired, because `$state` proxies objects and we compared them by identity. Compare by id or element instead. This is worth a lint or a guard in ticket 17's kit.
  9. **One `popovers.js` load never resolved** in one run. The loader now times out at 5 s and the click gets a failure toast.
- **Test harness:**
  10. **YouTube ignores `prefers-color-scheme` after the first visit, and treats the HeadlessChrome user agent differently.** The live script uses a fresh profile per theme and a desktop user agent.

**Measured:**
- **Sizes,** gzip -9 against ticket 17 §5.1, with the dev build's prototype stand-ins (fake view and flows) inside the kit:

  | File | KB | Budget |
  |---|---|---|
  | `page-www` | 0.69 | 5 (a stub gateway) |
  | `core-www` | 4.12 | 8 |
  | `kit-www` | **27.84** | **18, over** |
  | `feature-shortcuts-www` | 0.96 | 1 |
  | `feature-quick-save` | 1.44 | 3 |
  | `feature-queue-button` | 0.82 | 3 |
  | `feature-watch-button` | 3.31 | 5 |
  | `feature-card-menu` | 0.39 | 2 |
  | **Eager total** | **39.6** | 49 (with auto-add's 4 KB still to come: 43.6) |
  | `popovers.js` | 48.92 | 50 |

  - **The kit:** Svelte runtime 72 %, kit code 19 %, prototype stand-ins 6 %.
  - **With the whole Svelte namespace exported,** as dev builds would, the kit is 44.9 KB and the total 56.5 KB, which is over.
  - **`popovers.js`:** Svelte 42 %, Bits UI and its helpers 30 %, Floating UI 12 %, ours 11 %.
- **Time:**
  - **Kit layer drawn:** 10–14 ms after `core-www` starts, on the live channel grid (ticket 24's ≤ 20 ms).
  - **Picker, first open:** 96–115 ms from click to dialog, including the message, `executeScript` and mount. Ticket 24's first-use budget is 60 ms. The hover preload is meant to hide most of this; PROVISIONAL.

**Not tried:** signed in, Firefox, the miniplayer, the playlist page, and the watch page's playlist panel live (only their markup is from the probe), plus a real gateway, real adds and auto-add's tracker. Saves are fake.

### Judgement calls and runner-ups

1. **The watch-page button sits after Share, not after Save.** The runner-up was after Save: YouTube deletes it on resize.
2. **Our label folds before YouTube's Save does.** It's pre-emptive, measured, with one resize nudge. The runner-up was to hide our button whenever it would cost Save.
3. **Idle watch-page button: icon only, with the mark.** The runner-up (variant B) was a labelled "Save to…".
4. **The mark only on toasts the user didn't ask for.** The runner-ups were none (variant B) and on every toast.
5. **Fullscreen:** the user's own answers show; unprompted toasts wait. The runner-ups were hold all, or show all.
6. **Our Add to queue steps aside where YouTube draws its own.** The runner-up was always drawing ours.
7. **The thumbnail buttons copy YouTube's own toggles,** at the top-left. The runner-up was ticket 09's 28 px square with a 4 px radius.
8. **Progress is a pie, not a ring.** The runner-up, a ring, read as loading.
9. **The card menu opens at YouTube's ⋮.** The runner-up was at the pointer.
10. **Hosts:** layer + one overlay + inline hosts per placement. The runner-up was literally one host, which can't sit in YouTube's row or keep Tab order.
11. **Popovers close themselves on Escape.** The runner-up was letting Escape through the isolation.
12. **Type in YouTube's rem.** The runner-up was px.

### PROVISIONAL

- **The kit's size:** 27.8 KB against 18. Ticket 24 should rebalance: the site total holds, and the features came in far under their lines.
- **The picker's first open:** 96–115 ms against 60 ms, headless. To re-measure with the hover preload, on the reference machine.
- **The fold's synthetic `resize` nudge,** used only on a narrow first load.
- **YouTube's hover toggles:** whether signed-in feeds draw them. The step-aside handles both cases.
- **The queue toast's Show feedback default:** on.
- **Unticking removes:** inherited from tickets 12 and 26.
- **The pigeon mark and the name "Playlist Pigeon":** placeholders for ticket 22.
- **Signed-in and Firefox behaviour,** which are untested.

### For other tickets

- **[15](15-popup-and-settings.md), popup and settings:**
  - **Settings rows:** "Links inside cards keep the browser's menu" (card menu, off); "On Shorts shelves too" (quick-save); "On Shorts too" (watch-page button). The queue's Show feedback default is on (PROVISIONAL, above).
  - **The extension's theme setting** covers only the popup, settings and onboarding; in-page UI follows YouTube.
  - **Links from the page:**
    - the watch-page menu's "Playlist Pigeon settings" lands on Settings › YouTube at the watch-page button;
    - a notice's **Details** lands on Diagnostics;
    - a failure toast's **Settings** lands at the feature's playlists.
  - **Shared model:** the popup's picker should share `PickerModel` with `popovers.js` (ticket 17). The New playlist form's copy and limits are the same as above.
- **[17](17-modules.md), modules:**
  - **Hosts:** "one shadow host per page" becomes layer + one overlay + an inline host per in-flow control. The kit owns all of them, and `scope.mount(…, where)` makes the inline ones.
  - **The kit's layer** lives only while a kit feature runs (`kit.setNeeded` from the core).
  - **The card menu has no kit,** so its "not working" notice needs one. Either the registrar injects the kit on demand (`ensure(tabId, { kit: true })`), or the core needs a kit-free notice. Decide which.
  - **Escape** is handled inside the popovers.
  - **`$state` proxies objects,** so never compare kit-held objects by identity.
  - **The generated Svelte export list** must use property access, because runtime names include reserved words (`$.if`).
  - **Sizes:** the kit runtime is about 20 KB gzip; full namespace 44.9 KB against 27.8 KB for the used names.
  - **The popovers loader** needs a timeout and a user-visible failure, and a quiet mode for hover preloads.
  - **The page-settle check and the self-check** work as specified. The pointer must see through search's preview layer.
  - **Scripts:** `$npm_execpath` is how a `bun run` script reaches Bun when Bun isn't on PATH.
- **[27](27-youtube-music-controls.md), YouTube Music controls:**
  - **Reusable:** `ToastView` and the toaster rules; the mark rule; the step-aside pattern for YouTube Music's own hover buttons; the pie for progress; Escape inside popovers; hover preload.
  - **To check:**
    - YouTube Music's root font size, since our type is in YouTube's rem;
    - which element YouTube Music makes fullscreen on `f`;
    - whether its toasts need moving there.
  - **Spacing:** copy each YouTube Music control's measured box, as here (48 × 78 Shorts items, 40 px rows).
- **[20](20-write-spec.md), spec:**
  - **Take:** the Decisions above as the in-page UI section, the selector table as `items-www`'s starting list, and the live-check findings as the in-page watch list.
  - **Additions for ticket 18's watch list:** `#top-level-buttons-computed`; `#flexible-item-buttons button[aria-label='Save to playlist']`; `reel-action-bar-view-model` and `pivot-button-view-model`; `#video-preview ytd-video-preview`; YouTube's hover toggles `[aria-label='Add to queue']`; the lockup classes `ytLockupViewModelContentImage`, `ytLockupMetadataViewModelTitle` and `ytLockupMetadataViewModelMenuButton`; `html[dark]` and the theme variables.

### New questions

- **Is our Add to queue button still wanted?** YouTube's own lockups now draw a hover Add to queue (and Watch later) at the top-right, at least signed out. With step-aside, ours only fills gaps: other buckets, feeds without the toggles, the playlist panel.
- **Should the watch-page button give way to YouTube's Save?** At some widths (860 and 420 px live), even our icon-only button pushes YouTube's Save into "…". Accept that, or hide our button there?
- **Is the synthetic `resize`, sent once to make YouTube re-measure its row, acceptable?** It's a tiny poke at YouTube's page, not at its visible UI.
- **Signed-in and Firefox checks:** run the dev build signed in (tickets 25 and 18) and in Firefox: `isolated-element`, Svelte 5 in content scripts, MAIN-world registration and the toggles' presence.

## Decisions on the open questions (main session, 2026-10-19)

- **Our Add to queue button stays, stepping aside where YouTube draws its own** hover Add to queue (lockup cards). It still fills the gaps YouTube leaves, and it carries our Undo and confirmation. Revisit if YouTube's own button covers every card.
- **The watch-page button hides at widths where even its icon would push YouTube's Save into "…".** YouTube's own controls keep their place; the popup and keys still offer everything. This follows the user's principle that changing YouTube's look is opt-in, and never at the cost of YouTube's own controls.
- **The one-off synthetic `resize` on a narrow first load is acceptable.** It asks YouTube to re-measure its own row; it isn't driving YouTube's UI to do work.

Also from [ticket 27](27-youtube-music-controls.md), which hit the same problems on YouTube Music. Reuse its fixes:
- the moving in-flow host;
- an inline `all: initial` reset on every host, because the site's CSS stretched hosts in cards;
- state keyed by the item's identity, because recycled elements showed stale states;
- re-measuring the toast's position and stacking it above the site's own promos;
- Escape inside popovers;
- a 5 s loader timeout.
