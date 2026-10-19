# Shortcuts are caught in YouTube's pages, not with the browser's keyboard commands

2.0 catches every shortcut with a key listener inside YouTube and YouTube Music pages. The listener is registered only while a shortcut feature is on, and the extension records and stores the keys itself. The manifest declares no keyboard commands except an unbound `_execute_action`.

The browser's `commands` API can't carry this design. Chrome lets an extension neither set nor clear a key, allows only four suggested keys, shows only fixed command names, and keeps a bound key reserved on every site even while the feature is off. 2.0's shortcuts are a list the user builds and names, and features must leave no trace when off.

## Considered options

- **Commands for a fixed set of shortcut slots:** they'd work from any tab, but Chrome users would have to set keys in chrome://extensions/shortcuts against fixed names, and 1.4.5's bare keys couldn't carry over.
- **Commands for a few slots, plus in-page keys for the rest:** two sets of rules for one thing.

## Consequences

- Keys work only while a YouTube or YouTube Music page has focus.
- On Chrome, another extension's command for the same key wins and can't be detected. On Firefox, ours wins on YouTube pages.
