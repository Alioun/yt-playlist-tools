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
