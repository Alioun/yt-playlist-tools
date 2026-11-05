# Thumbnail overlay

`createOverlayKit({ owner, document, onError })` owns the page's single `pp-overlay` host (UI-YT-05). Construction allocates nothing. `use(scope, slot)` leases the `queue` or `quick-save` slot to one feature Scope and returns null when the slot is taken or a Scope has ended. The first lease creates the host, its open shadow root and one attribute-only MutationObserver that mirrors `<html dark>` onto the host (UI-YT-02). The last release removes the host, so a page with every thumbnail feature off holds zero overlay hosts.

`place(anchor)` puts the host right after the thumbnail link, 4 px into its offset box, or 4 px into search's inline preview, and sizes it to that box less the inset. The anchor names the slot's corner, and the slot moves into that corner's group. Slots in one corner keep queue before quick-save. The host ignores pointer events, so only the buttons take hits and clicks, and the thumbnail under it stays clickable. Thumbnails under 100 px tall stack the slots in a row (UI-YT-07). Placement reads offsets only when a feature calls it, so the host scrolls with the card with no scroll or animation-frame work (UI-YT-10). `place(null)` hides that slot; when no slot has an anchor the host leaves the page.

`tooltip(target, label)` shows YouTube's tooltip 0.5 s after pointer entry or focus, to the right of the stack (UI-YT-09). The host stops click, auxclick, double-click and pointer and mouse press events from leaving itself, so YouTube's card handlers don't navigate. Context menus and keys pass through.

The `quick-save` slot is reserved below `queue` in the stack. This unit implements no quick-save behavior or state. Rendering, axe and live-site measurements are unexecuted.
