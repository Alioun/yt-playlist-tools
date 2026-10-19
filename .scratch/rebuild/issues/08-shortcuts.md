# How do keyboard shortcuts work?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)

## Question

How should 2.0's keyboard shortcuts work?

Today (inventory.md, "Keyboard shortcut"):
- There's one shortcut, unset by default, recorded in the popup and matched by a key listener inside YouTube pages.
- It targets one playlist.
- It fires while you type in comments, swallows the key, and can't be cleared.

Approved: several shortcuts, each to its own playlist, and Watch Later as a target.

Settle:
- **Where keys are caught:** browser-level `commands` (work anywhere in the browser and are managed by the browser, but Chrome limits suggested keys), a listener inside YouTube pages, or both.
- **Count:** how many shortcuts there are, and how they're added and removed.
- **Defaults.**
- **"Manual labels/titles":** what the AMO reviewer's phrase means for us. A name for each shortcut? A custom label for each playlist?
- **No watch page:** what happens on Shorts, with a thumbnail under the pointer, or with no video at all.
- **Conflicts:** with YouTube's own keys, and with typing in fields.
- **Feedback.**
- **Channel filters:** do shortcuts respect them? Today they never do.

Also from [ticket 05](05-ui-stacks.md): how in-page key events are isolated from YouTube's player hotkeys, using WXT's `isolateEvents` or relying on `preventDefault`. For example, typeahead in a menu must not trigger player shortcuts.

Also from [ticket 06](06-upgrade-path.md): Firefox's `commands.update` requires Ctrl or Alt, so with manifest `commands` a carried-over bare-key or Shift-only shortcut can't be kept as is.

Also from [ticket 04](04-bun-test.md): WXT's fake browser doesn't implement `commands` or `contextMenus`, so shortcuts and any context-menu entries need their own port or fake to be testable.

Also from the YouTube Music charting (Q16–Q19):
- every YouTube Music quick action can have a shortcut, acting on the hovered row, else the playing song;
- playlist shortcuts work on YouTube Music too;
- avoid clashes with YouTube Music's own keys ([ticket 21](21-youtube-music-internals.md)).

Also from [ticket 21](21-youtube-music-internals.md): YouTube Music binds Space, `;`, j, k, l, h, s, r, =, -, m, q, Esc, f, +, _, ?, /, g-sequences and a few Shift and Ctrl+Shift combinations. Every Alt combination is free on its side. In Chrome and Edge app windows, keyboard commands reach the installed YouTube Music app.

## Answer

Resolved 2026-10-19. The user delegated the decisions, so each judgement call names its runner-up and why it lost. This answer folds in tickets [10](10-youtube-access.md), [11](11-accounts.md), [12](12-adding.md) and [26](26-youtube-music-quick-actions.md), all resolved the same day. The browser facts were read from primary sources; see [Browser facts](#browser-facts-this-rests-on).

**In short:**
- **Where keys are caught:** every shortcut is caught by a key listener inside YouTube and YouTube Music pages. That listener exists only while a shortcut feature is on.
- **Who manages keys:** the extension records and stores them itself. The manifest declares no keyboard commands, except the browser's own "open the popup" entry, which has no key.
- **Playlist shortcuts** is a feature: a list of up to 20 shortcuts. Each has a key, an optional label, and a playlist per account. Turning the feature on presets one shortcut: **Alt+W** saves to Watch later, on every account.
- **Two keys come with the shortcut features:**
  - **Alt+Shift+P** opens the playlist picker on YouTube. YouTube Music already has the same key from ticket 26.
  - **Alt+U** undoes the toast on screen.
- **What a key acts on:** the pointed-at item, else the current video or playing song. Text fields, open menus and auto-repeat are ignored, and channel filters never apply.
- **"Manual labels/titles"** covers three things:
  - playlists show by their real titles (1.4.5 made users paste IDs);
  - each shortcut can have its own name;
  - the picker shows each playlist's key.

### Where keys are caught

- **In the page, for every shortcut, on both browsers.**
  - **The listener:** a `keydown` listener on `window`, in the capture phase, in the top frame of youtube.com and music.youtube.com tabs.
  - **Lifetime:** it lives in each shortcut feature's page script, which is registered only while that feature is on ([ticket 10](10-youtube-access.md) §8). A switched-off feature leaves no listener.
  - **Why:** it's the only design that does all of these at once:
    - a shortcut list the user builds and names;
    - keys managed from the extension's own settings on both browsers;
    - nothing left behind when switched off.

    It's also how ticket 26 already catches YouTube Music's keys.
  - **Runner-up: browser `commands`**, as a fixed set of "Playlist shortcut 1…N" slots. It lost for five reasons:
    - Chrome can't set or clear a key from the extension. Users would have to go to chrome://extensions/shortcuts, which can't be deep-linked to our entries.
    - Slot names are fixed in the manifest, so labels can't show there.
    - Chrome allows only 4 suggested keys, and ticket 26 alone presets 6.
    - Chrome consumes a bound key on every site, even while our feature is off, and we can't unbind it. That breaks "off leaves no trace" and takes Alt keys away from every other website.
    - 1.4.5's bare-key and Shift-only shortcuts couldn't carry over ([ticket 06](06-upgrade-path.md)).
  - **Second runner-up: both**, with commands for a few slots and in-page keys for the rest. It lost because the same thing would follow two sets of rules.
  - **What we give up:** keys work only while a YouTube or YouTube Music page has focus. They don't work from another tab, from the address bar, or from YouTube's live-chat frame, which holds its own focus. Acting on a background tab is a new question for the user.
- **Manifest `commands`:** only `_execute_action`, with no `suggested_key` and no listener.
  - It lets users bind a key to open the popup in the browser's own shortcut settings, on both browsers.
  - It does nothing until they do. This fills ticket 10's manifest row.
- **No `commands` API at runtime.**
  - Tests need no `commands` port or fake ([ticket 04](04-bun-test.md)).
  - Firefox's Ctrl-or-Alt rule for `commands.update` ([ticket 06](06-upgrade-path.md)) no longer applies.

### The shortcut features and their keys

| Feature | What it holds | Preset the first time it's turned on |
|---|---|---|
| **Playlist shortcuts** (YouTube, plus YouTube Music when "Also on YouTube Music" is on) | The playlist shortcuts; the picker key (YouTube only); the undo key; Also on YouTube Music; Show feedback | One shortcut: Watch later, **Alt+W**. Picker **Alt+Shift+P**. Undo **Alt+U**. Also on YouTube Music on. Show feedback on. |
| **Quick-action shortcuts** (YouTube Music, [ticket 26](26-youtube-music-quick-actions.md)) | One key per quick action; the undo key; Show feedback | Ticket 26's six keys. Undo **Alt+U**. |

- **Presets apply once,** the first time a feature is turned on.
  - Turning it off and on again keeps what the user had.
  - Removing every shortcut never brings the preset back.
- **A preset never takes a key that's already used** on the same site. It's left without a key, and its row says "No key: Alt+P is used by {other}". Presets never override the user.
- **Why these keys:**
  - YouTube ignores presses with Ctrl or Alt held, except the arrows (ticket 05's research). YouTube Music ignores every Alt combination (ticket 21).
  - W, P and U avoid the browsers' own Alt keys:
    - Firefox's menu letters: F, E, V, S, B, T and H;
    - Chrome's Alt+D, Alt+E and Alt+F;
    - Chrome's Alt+Shift with A, B, I, N, R or T.
  - Alt+Z lost for Undo because NVIDIA's GeForce overlay takes it system-wide on many Windows PCs.
- **The undo key** is one setting shared by both shortcut features. It's shown with each, and changing it in one place changes both. It's active on a page whenever either feature is on there.
- **The picker key (Save to playlist…)** opens the [ticket 12](12-adding.md) playlist picker on YouTube, for the pointed-at item, else the current video.
  - On YouTube Music, ticket 26's picker key does the same job and has the same default.
  - **Why:** a few playlist shortcuts can't cover every playlist. The picker, with its search field focused, reaches all of them from the keyboard.
  - **Runner-up:** no picker key on YouTube. It lost because keyboard users would need the mouse for every playlist that has no key of its own.
- **First-run copy** (ticket 09 places it): "Playlist shortcuts: keys that save the video you're pointing at or watching. Alt+W saves to Watch later."

### Playlist shortcuts: the list

- **What a playlist shortcut is:** a key, an optional label, and a playlist for each account. Per [ticket 11](11-accounts.md), the key and label are shared by every account, and the playlist is chosen per account.
- **Up to 20 shortcuts.** At 20, Add shortcut is disabled, with "You can have up to 20 playlist shortcuts."
  - **Why:** it bounds what syncs ([ticket 16](16-storage-and-sync.md)), and nobody remembers more keys than that.
  - **Runner-up:** no limit. It lost because what syncs would have no upper bound.
- **Add shortcut** adds a row at the end and starts recording its key at once. The row's playlist chooser opens next, for the current account.
- **Order:** the order they were added. There's no reordering, because it isn't worth a control.
- **Clear key** leaves the shortcut without a key.
  - It's then inert and shows "No key". Its label and playlists are kept.
  - This fixes the Friction item "can't be cleared". There's no separate on/off switch per shortcut.
- **Remove** deletes the shortcut everywhere: its key, its label, and its playlist on every account.
  - An inline "Removed {Shortcut}. Undo" shows for 6 s.
  - There's no confirmation, because Undo covers it.
- **Watch later works on every account.**
  - **The rule:** choosing Watch later for a shortcut makes it save to the current account's Watch later on every account that hasn't chosen another playlist for that shortcut.
    - Accounts with their own choice keep it.
    - Choosing any other playlist sets it for the current account only, as ticket 11 says.
    - So the preset works everywhere without storing anything per account.
  - **Why:** Watch later is the one playlist every account has, and its ID means "this account's Watch later". Without this rule, every new account would answer "Alt+W has no playlist on {Name} yet" for a target it already has.
  - **Runner-up:** choosing Watch later per account, like any other playlist. It lost for that reason.
  - **Private windows:** choosing Watch later there is allowed, because it's a shared choice. Per-account choices made there aren't stored (ticket 11).
- **Also on YouTube Music** (default on): playlist shortcuts and the undo key also work on music.youtube.com, acting on songs (see below).
  - **Access:** it takes effect only where the extension has YouTube Music access, which is optional on Chrome ([ticket 10](10-youtube-access.md)).
    - Without access, the row reads "Needs access to YouTube Music", with **Give access**.
    - That alone never raises the missing-access badge, because the user hasn't asked for YouTube Music.
  - **Runner-up:** off by default. It lost because the map carries playlist shortcuts over to YouTube Music, and a key that works on one site but not the other is surprising.

### Labels: the AMO request

The AMO request was: "Would be cool to have multiple 'Add to playlist' shortcut options. And maybe with some manual labels/titles?" Read generously, it means three things:

1. **Playlists by title, never by ID.**
   - 1.4.5 made users paste playlist IDs.
   - 2.0 shows every playlist by its YouTube title, from the account's own list.
2. **A label per shortcut.**
   - It's optional, trimmed, and up to 40 characters.
   - It's the shortcut's own name, such as "Later" or "Recipes", and it stays the same across accounts even when their playlists differ.
   - **Where it shows:** wherever shortcuts are listed (popup, settings, the "already used" message), and as {Shortcut} in messages.
   - **Fallbacks:** with no label, a shortcut shows the current account's playlist title. With no playlist either, it shows its key (ticket 11).
   - **Not in toasts:** "Saved … to {list}" names the playlist the video went to, because that's the result.
3. **Keys shown next to playlists.**
   - In the playlist picker, a playlist with a playlist shortcut on this account shows that shortcut's key at the end of its row.
   - That teaches the keys where the user already chooses playlists.

**Rejected reading:** local nicknames for playlists. Renaming belongs on YouTube, and a second name for the same playlist would confuse.

### What a key acts on

**The rule, on both sites:** a key acts on the **pointed-at item**, else on the **current video** (YouTube) or the **playing song** (YouTube Music).
- If what's pointed at isn't supported, the key does nothing and says why.
- It never falls back, because the user pointed at something else (ticket 26).

**Pointer or focus: whichever moved last.**
- The item under the pointer counts if the pointer moved more recently than keyboard focus. Otherwise the item holding keyboard focus (`:focus-visible`) counts.
- This refines ticket 26's "pointer first", so a mouse resting on one card doesn't overrule a keyboard user tabbing through a grid.
- It's checked at the moment of the press, so scrolling counts. A pointer outside the page points at nothing.

**What counts as an item on YouTube:**
- **Items:** any card or row YouTube draws for a single video:
  - Home, search and subscriptions;
  - the watch page's sidebar and its playlist panel;
  - Shorts shelves;
  - playlist-page rows.

  Ticket 14 keeps the selector list, which quick-save and Add to queue share.
- **Unsupported items:** playlist, mix, channel and post cards, and ad slots.
- **Anything inside a player counts as that player's video:** its end-screen tiles, cards and overlays.
  - Why: at the end of a video the pointer usually rests on the player, and the user means the video they just watched.

**The current video** is the video a YouTube tab is on, playing or paused:
- the watch page's video, even while an ad plays (ads never count);
- the Short on screen on `/shorts/`;
- on any other page, the miniplayer's video.

It's read the way ticket 07 reads it: the player's own video ID, and YouTube's navigation event for Shorts. Never the URL alone.

**On YouTube Music,** playlist shortcuts follow ticket 26's rule and act on songs only: the pointed-at song, else the playing song. Albums, playlists and artists are unsupported.

| Situation (YouTube unless stated) | Result |
|---|---|
| Watch page, pointer on the player, the comments or nothing | The current video |
| Watch page, pointer on a sidebar card | That card's video |
| Pointer on an end-screen tile when a video ends | The video that just played |
| Shorts page | The Short on screen |
| Home, pointer on a card in a Shorts shelf | That Short |
| Home or search, miniplayer playing, pointer not on a card | The miniplayer's video |
| Home or search, no miniplayer, nothing pointed at | "Point at a video to save it." |
| Pointer on a playlist, mix, channel or post card | "Only videos can be saved to playlists." |
| Pointer on an ad | "Ads can't be saved." |
| Fullscreen | The current video (cards aren't visible) |
| YouTube Music, pointer on an album, playlist or artist | "Only songs can be saved to playlists." |
| YouTube Music, nothing pointed at and nothing playing | "Nothing is playing" (ticket 26) |
| YouTube Music, nothing pointed at, an ad playing | "An ad is playing" (ticket 26) |
| Live stream, premiere, members-only, private or made-for-kids video | Sent like any add. YouTube's answer decides, with ticket 12's refusal copy. |

These messages answer an explicit key, so they show even with Show feedback off. They're neutral, not failures (ticket 12).

### When a key is ignored, and how it's matched

One engine serves every shortcut on both sites, YouTube Music's quick-action shortcuts included.

**A key is ignored, and passes through untouched, when:**
- **Typing:** the event's composed path holds an editable field. That fixes 1.x firing in comments. Editable fields are:
  - a text-type `input`, meaning any type except checkbox, radio, range, button, submit, reset, image, color and file;
  - a `textarea` or a `select`;
  - anything contenteditable;
  - `role` textbox, searchbox, combobox or spinbutton.
- **IME:** a composition is under way (`isComposing`, or keyCode 229).
- **A menu or dialog is open:** YouTube's or YouTube Music's (including YouTube's own Save dialog), or ours, such as the picker.
- **Auto-repeat:** the event is an auto-repeat (`event.repeat`).
- **Pending:** the same shortcut's previous action hasn't finished (ticket 12).

**Matching:** the modifier set (Ctrl, Alt, Shift, Meta) must match exactly, and then the key must match.
- **Character first:** if the shortcut was recorded on a plain letter or digit, and this press produces a plain ASCII letter or digit, the two characters are compared.
- **Physical key otherwise:** everything else compares the physical key (`code`):
  - macOS Option, which changes the character (Option+W types "∑");
  - dead keys and non-Latin layouts;
  - punctuation and named keys.
- **Why character first:** the presets then land on the key labelled W on AZERTY, QWERTZ and Dvorak keyboards on Windows and Linux. Pure physical matching would put Alt+W on AZERTY's Z key.
  - This refines ticket 26's "match by physical key", and macOS Option keeps working.
  - **Leftover edge:** on a non-QWERTY Mac, a preset fires on its US position. Re-recording fixes it, and the display shows the recorded label.
- **AltGr** never counts as Alt or Ctrl+Alt, and Ctrl+Alt can't be recorded (see the recorder).

**On a match,** the listener calls both `preventDefault()` and `stopImmediatePropagation()`.
- Both are needed: YouTube's Shorts handler acts on the physical M, K, Space, ↑ and ↓ keys with any modifier, and ignores `preventDefault`.
- The capture phase on `window` runs before every listener of YouTube and YouTube Music.
- A key that matches nothing is never touched.

**Clashes with YouTube's and YouTube Music's own keys:** the user may keep one, and ours then wins on that site. The recorder says so. The presets clash with nothing.

**Clashes with the browser:**
- **Reserved keys never reach the page,** so they can't be shortcuts:
  - Chrome: Ctrl+T/N/W, Ctrl+Shift+N/T/W, Ctrl+Tab, Ctrl+PgUp/PgDn and Alt+F4;
  - Firefox: Ctrl+T/N/W, Ctrl+Shift+W/P, and Quit.
- **Other browser shortcuts** (Ctrl+D, Ctrl+S, Alt+D, F5…) can be taken, on YouTube pages only. The recorder warns and lets the user keep them.

**Other extensions' keyboard commands:**
- On Chrome, theirs win and can't be detected. On Firefox, ours win on YouTube pages.
- Settings say: "Shortcuts work while a YouTube or YouTube Music page is in focus. If one does nothing, the browser or another extension may be using that key."

**One key, one shortcut, per site.**
- Playlist shortcuts and the undo key count on both sites.
- The YouTube picker key counts on YouTube.
- Quick-action keys count on YouTube Music.
- A shortcut counts whether its feature is on or off, so turning a feature back on never creates a clash.

### The recorder

The popup and settings use it for every shortcut. Ticket 15 draws it.

- **Idle:**
  - A set key shows in the platform's style, with **Change** and **Clear** (×). Unset, it shows "No key" with **Set key**.
  - **Style:** on macOS, the symbols ⌃⌥⇧⌘, e.g. "⌥⇧P". Elsewhere, Ctrl+Alt+Shift+Win (Super on Linux)+Key, in that order, e.g. "Alt+Shift+P".
  - **The key's label:** the character the layout gave at recording time, else the key's name ("F2", "↑", "Page Down").
- **Recording:**
  - It shows "Press a key combination… (Esc to cancel)". The first non-modifier key, with the modifiers held, is the result.
  - **Esc** cancels and keeps the old key.
  - **Tab** and Shift+Tab move focus as usual, and cancel.
  - A click elsewhere, or the popup closing, cancels.
  - This fixes the Friction items "no cancel" and "Escape and Tab can be recorded".
- **Refused presses:** the recorder stays in recording and shows a hint.

  | Pressed | Hint |
  |---|---|
  | Enter or Space alone | "Enter and Space can't be used alone: they press buttons." |
  | Any Ctrl+Alt combination | "Ctrl+Alt can't be used: many keyboards type characters with it." |
  | Modifiers alone, or IME input | (keeps waiting) |

- **A key already used on the same site:** "{Key} is already used by {Other}." {Other} is the other shortcut's name, plus its site when it's in the other feature, e.g. "Save to playlist (YouTube Music)".
  - **Use it here** takes the key and leaves the other shortcut without one.
  - **Cancel** keeps everything as it was.
  - The user always decides, and one key never fires two shortcuts.
- **A clash warning** keeps the key. The note stays under the row until the key changes:
  - "YouTube uses K for Play/pause. This shortcut replaces it on YouTube."
  - "YouTube Music uses Q for Toggle queue. This shortcut replaces it on YouTube Music."
  - "Chrome uses Alt+D to go to the address bar. This shortcut replaces it on YouTube pages."
  - The browser shortcut list ships in the package, per browser and OS. It comes from Chromium's accelerator table and Firefox's key sets.
- **Saving** happens at once, with no Save button. Open tabs pick up the change without a reload.

### Feedback and undo

- **Ticket 12's add flow and copy apply unchanged.** Playlist shortcuts are explicit adds, so:
  - they always answer, "already in" included;
  - a key-triggered add with no outcome after 1 s shows "Saving "{title}" to {list}…";
  - they never toggle a video out of a playlist;
  - a second press while one is pending is ignored.
- **Show feedback** for playlist shortcuts is on by default. 1.4.5 upgraders take it from `toastEnabled` (tickets 12 and 19).
- **The undo key (Alt+U)** runs Undo on the toast showing in this tab: any toast that carries Undo, from a save, an auto-add or a quick action. It answers ticket 12's open "keyboard path to Undo".
  - Undo then behaves exactly as clicking the button would.
  - With no such toast on screen, it shows "Nothing to undo." That happens even with Show feedback off, which hides confirmations, so then there's never anything to undo by key.
  - **Runner-up:** no undo key, only the toast's button. It lost because a mis-save by key, which the pointed-at rule makes likelier, would need the mouse to fix.
- **No highlight on the acted-on card.**
  - The toast names the video, which is enough to spot a wrong target.
  - A flash on the card would change the page more, for little gain.

### Channel filters

Shortcuts are never channel-filtered, on either site, as in 1.x.
- Why: a key press is an explicit choice, and filters are auto-add's rule (ticket 12).
- **Runner-up:** respect filters. It lost because a key that silently refuses some channels would look broken.

### Keys and the in-page UI (from ticket 05)

- **Isolation:** every in-page shadow root uses WXT's `isolateEvents: true`, so keydown, keyup and keypress stop at the root. It also uses `mode: "open"`.
  - So typing or typeahead in the picker never reaches the hotkeys of YouTube or YouTube Music.
  - Our own listener runs in `window`'s capture phase, so the isolation doesn't affect it. It ignores keys while our picker or dialog is open anyway.
- **Runner-up:** rely on `preventDefault` in each component. It lost for two reasons:
  - the primitives don't prevent typeahead letters in widgets that aren't inputs;
  - every component would have to remember to do it.
- **Verify in ticket 14's dev build:** Bits UI popovers must still close on Escape with the isolation on.
  - Ticket 05's spike showed this for Base UI and React Aria in happy-dom.
  - If Bits UI doesn't, the root stops every key except Escape.

### Upgrading from 1.4.5 (values for ticket 19)

- **Where the 1.4.5 shortcut goes:** its key becomes shortcut 1's key ([ticket 11](11-accounts.md)). Its playlist goes into the unclaimed setup.
- **Converting the key:**
  - Split `watchLaterShortcut` on "+", and de-duplicate the modifiers: `Control`, `Alt`, `Shift`, `Meta`, in any order.
  - The last token is the key. It carries over if it's a letter, a digit, or a named key such as ARROWUP, HOME, PAGEDOWN, DELETE or F1–F12.
- **Not carried over:**
  - punctuation and other characters;
  - Escape and Tab;
  - a bare Enter or Space;
  - a modifier as the last token;
  - any Ctrl+Alt combination.

  Shortcut 1 is then created with no key, and the upgrade note says "Your 1.x shortcut key can't be used in 2.0. Set a new one in Settings."
- **Bare keys and Ctrl keys carry over as they are,** because they were the user's choice.
  - Bare keys no longer fire while typing.
  - Ctrl keys never fired in 1.4.5, so the upgrade note names the key and its playlist.
- **When the feature turns on:** after the user accepts the upgrade note, and only if both a converted key and a playlist were carried over. Otherwise it stays off, and whatever was carried over is kept.
- **The list:** an upgrader's list holds only their own shortcut, with no Watch later preset, because the list is the user's data. The picker and undo keys are preset as for anyone, unless those keys are taken.

### For the build

- **One shortcut engine** ([ticket 17](17-modules.md)) with three parts:
  - a pure matcher: the event's fields in, a shortcut out;
  - pure recorder rules;
  - a target resolver per site, which reads the DOM.

  All three are testable under `bun test` with happy-dom, using events from `new KeyboardEvent`. No browser API is involved.
- **Stored shape** ([ticket 16](16-storage-and-sync.md)):
  - **Shared:**
    - the shortcuts, each `{id, key: {char?, code, ctrl, alt, shift, meta}, label, watchLaterOnEveryAccount}`;
    - the picker key and the undo key;
    - Also on YouTube Music;
    - Show feedback.
  - **Per account setup:** a map from each shortcut's ID to a playlist ID.

### Browser facts this rests on

Read from primary sources on 2026-10-19.

**Chrome.** Sources: [Chrome commands API](https://developer.chrome.com/docs/extensions/reference/api/commands), and in Chromium `extensions/common/api/commands/commands_handler.cc`, `chrome/browser/extensions/commands/command_service.cc` and `chrome/browser/ui/views/frame/browser_view.cc`.
- **Suggested keys:** at most 4, and a 5th is an install error. A suggested key that clashes is left unset without warning.
- **Allowed keys:** Ctrl+Alt and F-keys are refused.
- **Control from the extension:**
  - there's no API to set, clear or disable a key, and no `onChanged`;
  - `tabs.create` can open chrome://extensions/shortcuts, but there's no deep link to one extension.
- **Who gets the key:** in normal tabs, a bound key is consumed before the page, even in text fields. In installed-app windows, commands are registered too, but the page sees keys first.
- **Global scope:** only Ctrl+Shift+0–9 is assigned automatically, it isn't offered on ChromeOS, and global commands get no tab.

**Firefox.** Sources: [MDN commands](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands), and in Firefox `toolkit/components/extensions/ExtensionShortcuts.sys.mjs` and `dom/events/GlobalKeyListener.cpp`.
- **Limits:** no limit on the number of commands.
- **API versions:**
  - `commands.update` since 60, clearing a key with "" since 74;
  - `onChanged` since 115, `openShortcutSettings` since 137.
- **User changes** survive updates.
- **Who gets the key:** the page sees a command's key first, and can block it with `preventDefault`.
- **Global scope:** none.

**Pages.**
- **Reserved browser keys** never reach the page: Chromium's `accelerator_table.cc` `kReservedCommandIds`, and the keys marked `reserved="true"` in Firefox's `browser-sets.inc.xhtml`.
- **Other browser shortcuts:** the page's `preventDefault` wins.
- **Where keys don't arrive:** iframes, such as live chat, and the address bar don't pass keys to the top page.
- **YouTube's own handlers** (desktop bundle, 2026-10-19):
  - the main hotkey manager drops keys with Ctrl or Alt held, except the arrows;
  - the Shorts handler doesn't.
- **WXT `isolateEvents`** stops key events at the shadow root, in the bubble phase (webext-core isolated-element v3.0.0, `src/index.ts:89-97`).

Also from [ticket 14](14-in-page-controls.md)'s real-YouTube build:
- With key isolation on, Bits UI popovers don't close on Escape, so the popovers handle Escape themselves.
- Typing in our picker never reached YouTube's hotkeys.
