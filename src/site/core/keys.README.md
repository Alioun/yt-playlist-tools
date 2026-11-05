# Shared key dispatch

`Keys` installs one capture-phase `keydown` listener on the supplied document's window while an enabled binding exists. Every feature supplies its actual qualified `Scope`. Disabling the last binding removes the listener. Enabling a binding can reacquire it.

`register(scope, action, state)` fixes a semantic `ShortcutTarget` and a typed callback. Its handle updates the current key or disables the binding. Updates do not change the semantic target. Releasing one registration leaves other registrations live.

The canonical `shared/keys.match` receives real event facts, composed-path descriptors, current blockers and pending semantic targets. Its typing, IME, AltGraph, repeat and conflict rules remain authoritative. Suppressed or unmatched events pass through. A match calls `preventDefault()` and `stopImmediatePropagation()` before the callback.

Registrations with the same `sameTarget` action share one pending token. Their first enabled registration supplies the key and callback. Different semantic actions remain separate even when their callbacks are the same function. The matcher keeps the first conflicting key's precedence while it is pending.

`KeyBlockers` is required. The site integration must read current menus, dialogs and the extension popover. DOM role and native dialog checks supplement that collaborator. The collaborator must cover closed shadow roots and site-specific blockers that the shared DOM checks cannot see. This unit supplies no production blocker adapter and assumes no closed state by default.

`onError` is required for context failures and rejected or throwing actions. Rejection clears the original group's pending token. A late settlement cannot clear a replacement group's token or reinstall resources. A throwing error collaborator cannot escape the native listener.

`registerCoreUndo` derives `undoKey` from the complete `TabView`. A visible Undo toast or enabled shortcut feature activates its binding when the key is non-null. A shortcut with no stored Undo still calls `undoCurrent()`. The later toaster owns "Nothing to undo." and any storage receipt. A callback count proves neither storage success nor a rendered toast.

All authored compiler, behavior, consumer and control gates remain unexecuted. No existing product file imports these services.
