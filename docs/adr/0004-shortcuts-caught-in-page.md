# Shortcuts are caught in YouTube's pages, not with the browser's keyboard commands

2.0 catches every shortcut with a key listener inside YouTube and YouTube Music pages. The listener is registered only while a shortcut feature is on, and the extension records and stores the keys itself. The manifest declares no keyboard commands except an unbound `_execute_action`.

The browser's `commands` API can't carry this design. Chrome lets an extension neither set nor clear a key, allows only four suggested keys, shows only fixed command names, and keeps a bound key reserved on every site even while the feature is off. 2.0's shortcuts are a list the user builds and names, and features must leave no trace when off.

## Considered options

- **Commands for a fixed set of shortcut slots:** they'd work from any tab, but Chrome users would have to set keys in chrome://extensions/shortcuts against fixed names, and 1.4.5's bare keys couldn't carry over.
- **Commands for a few slots, plus in-page keys for the rest:** two sets of rules for one thing.

## Consequences

- Keys work only while a YouTube or YouTube Music page has focus.
- On Chrome, another extension's command for the same key wins and can't be detected. On Firefox, ours wins on YouTube pages.

## Amendment (2026-10-20): keys from any tab

The user approved one exception (rebuild spec, R88): a separate, opt-in feature, **Keys from any tab**, made of three browser commands with no suggested key: save the playing song, like or unlike it, and save the current video to Watch later. The user sets their keys in the browser's own shortcut settings, and they work while YouTube or YouTube Music is in another tab. Everything above still holds for the shortcuts the user builds, names and records in the extension.

- **Not the rejected mix:** these aren't shortcut slots. They're a short fixed list of actions on the playing song or current video, with the browser's own names and key settings, so one thing still follows one set of rules.
- **Off costs nothing, honestly:** commands can only be declared in the manifest, so the three are listed, unbound, in the browser's shortcut settings even while the feature is off. No key is reserved until the user sets one, and neither browser shows a prompt for them. While the feature is off, the background ignores them.
- **ADR-0001 still holds:** each command runs as a job in one open YouTube or YouTube Music tab, chosen as the popup's Playing now chooses its tab, as that tab's account. With no such tab, nothing runs, and the toolbar icon says so.
- **Consequences:** the manifest's `commands` grows from `_execute_action` alone to four entries. A key set for one of them is taken by the browser before any page sees it, so the key recorder warns when an in-page shortcut uses the same key, reading the keys with `commands.getAll()`.
