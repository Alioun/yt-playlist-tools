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
