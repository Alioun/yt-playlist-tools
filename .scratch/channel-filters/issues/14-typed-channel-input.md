# 14: Typing a channel into a filter

**What to build:** an input box in the row editor where the user types or pastes a channel, which is then added to the playlist's list. This is the only input box; the channel card never gets one.

How each input form is handled:
- **A `/channel/UC…` URL or a bare `UC…` ID:** parsed offline, then checked with `channels.list?id=` for the title and handle.
- **`@handle` or `youtube.com/@handle`** (the `@` is optional): looked up with `channels.list?forHandle=` (1 unit).
- **`/user/name`:** looked up with `channels.list?forUsername=`.
- **`/c/name`:** rejected with "Custom /c/ URLs can't be looked up. Paste the channel's @handle or /channel/ URL."
- **A channel that can't be found:** shows an inline error, and nothing is added.

**Blocked by:** 11 (Denylist mode, end to end)

**Status:** ready-for-agent

**Base branch:** `main` if [Alioun/yt-playlist-tools#2](https://github.com/Alioun/yt-playlist-tools/pull/2) (WXT migration) has merged. Otherwise stack on ticket 11's branch and retarget to `main` once it merges. One branch and one PR for this ticket.

**Spec:** [Per-playlist channel filters](../spec.md), "Typed channel input". Terms are as defined in `GLOSSARY.md`.

- [x] Every input form above is parsed and resolved as listed, and `/c/` is rejected with the exact message.
- [x] The added channel is stored by its channel ID, with its label.
- [x] Unit tests cover parsing every form, including surrounding whitespace, a missing `@`, and trailing paths or query strings. They also cover the not-found case.
- [ ] **Live check:** confirm whether `snippet.customUrl` holds the `@handle`. If it doesn't, keep the handle the user typed.
  - Run it in the built-in browser on a dev build.
  - Pause any video you start, and close the tab when done.
  - If no signed-in YouTube session is available, give the user the check as a checklist instead of skipping it.
- [x] `bun run compile` and the full test suite pass.

## Comments

2026-10-05: implemented on branch `feat/channel-filters-typed-input`, based on `main` (#20 has merged).

- Parsing is `parseChannelInput` in `src/lib/channel-input.ts`. It returns a `channels.list` query (`id`, `handle` or `username`) or an error message. URLs work with or without the scheme, on any `*.youtube.com` host, with trailing paths and query strings. Anything else, such as a watch URL or a name with a space, gets "That doesn't look like a channel. Paste an @handle or a channel URL."
- The lookup is `fetchChannel(query, token)` in `src/lib/youtube.ts`, which answers found, not found or failed and never throws. The popup sends `{action: "lookUpChannel", query}` and the background runs it with the stored token.
- The handle comes from `snippet.customUrl` when it starts with `@`. Otherwise a handle lookup keeps the handle as typed, and an ID or username lookup stores no handle (ticket 13's page read fills it in on the next auto-add).
- The input box is the last thing in the row editor, shown only while the filter is on. Errors are inline (`role="alert"`): the exact `/c/` message, "Couldn't find that channel on YouTube.", "Couldn't look up the channel. Try again." and "<Title> is already listed." Nothing is added on any error, and the typed text stays.
- The channel is added through `addListedChannel(playlistId, channel)`, so its label goes through `updateFilter` as before.
- The live check is still open: confirming what `snippet.customUrl` holds needs a signed-in API call. Google's reference only says "The channel's custom URL". The code handles both answers.
