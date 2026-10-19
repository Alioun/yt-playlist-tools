# One consent of our own gates every feature, in every browser

Until the user agrees, on the first-run page or the upgrade note, no feature runs and nothing is read from YouTube. That includes features carried over from 1.4.5. The consent is the extension's own and is the same on Chrome and Firefox. It's versioned, re-asked whenever data handling changes, and never changed by a hotfix. Firefox's built-in data-collection prompt doesn't stand in for it.

We chose this because the Chrome Web Store requires an in-product disclosure the user accepts before data is handled. One consent everywhere keeps both browsers identical and the store copy simple.

## Considered options

- **Rely on Firefox's own data prompt on Firefox:** two consent models for one extension, and Firefox shows none at all under `none`.

## Consequences

- Upgraders' auto-add stays off until they agree, so the upgrade note opens once, in a background tab.
- Changing data handling means a new consent version, so it can't ship in a hotfix.
