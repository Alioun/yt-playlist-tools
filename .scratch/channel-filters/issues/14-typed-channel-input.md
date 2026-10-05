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

- [ ] Every input form above is parsed and resolved as listed, and `/c/` is rejected with the exact message.
- [ ] The added channel is stored by its channel ID, with its label.
- [ ] Unit tests cover parsing every form, including surrounding whitespace, a missing `@`, and trailing paths or query strings. They also cover the not-found case.
- [ ] **Live check:** confirm whether `snippet.customUrl` holds the `@handle`. If it doesn't, keep the handle the user typed.
  - Run it in the built-in browser on a dev build.
  - Pause any video you start, and close the tab when done.
  - If no signed-in YouTube session is available, give the user the check as a checklist instead of skipping it.
- [ ] `bun run compile` and the full test suite pass.
