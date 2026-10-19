# How do keyboard shortcuts work?

Type: grilling
Status: open
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
