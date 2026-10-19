# How do the controls inside YouTube look and behave?

Type: prototype
Status: open
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
