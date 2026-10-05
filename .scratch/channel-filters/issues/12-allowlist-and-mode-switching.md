# 12: Allowlist mode, the unknown-channel rule and mode switching

**What to build:** the row editor's switch gains Allow only, so it reads Off / Allow only / Deny.

- In allowlist mode, only videos from listed channels are auto-added. An empty allowlist auto-adds nothing to that playlist.
- When the channel is unknown:
  - allowlist playlists skip the video, with one toast such as "Couldn't identify the channel, so it was skipped for Music";
  - denylist playlists still get the video and show their normal "Added" toast.

Mode switching:
- Off is a switch, not a mode. Switching a filter off keeps its list and its mode, and turning it back on in the same mode restores the list unchanged.
- These both clear the list after a confirmation:
  - switching directly between Allow only and Deny;
  - turning the filter back on in the other mode.
- The confirmation is asked only when the list has at least one channel.
- Row labels:
  - "Allow only · N" or "Deny · N" when the filter is on;
  - "All channels" when it is off;
  - "All channels · N denied kept" or "· N allowed kept" when it is off with a non-empty list.

**Blocked by:** 11 (Denylist mode, end to end)

**Status:** ready-for-agent

**Base branch:** `main` if [Alioun/yt-playlist-tools#2](https://github.com/Alioun/yt-playlist-tools/pull/2) (WXT migration) has merged. Otherwise stack on ticket 11's branch and retarget to `main` once it merges. One branch and one PR for this ticket.

**Spec:** [Per-playlist channel filters](../spec.md), "Filter rules", "Playlist rows" and "Feedback". Decided in [What does a kept list mean when a filter is turned back on in the other mode?](09-off-list-mode.md). Terms are as defined in `GLOSSARY.md`.

- [x] Allowlist mode adds only videos from listed channels, and an empty allowlist adds nothing.
- [x] With an unknown channel, allowlist playlists skip the video and show the unknown-channel toast. Denylist playlists add it as normal.
- [x] Switching Allow↔Deny, and turning a filter back on in the other mode, both ask for confirmation and then clear the list. Neither asks when the list is empty.
- [x] Switching off and back on in the same mode restores the list. The labels match the spec, including the "kept" variants.
- [x] Unit tests for every combination of mode, enabled and list, and for the unknown-channel rule. Popup tests for the switch and the confirmation.
- [x] `bun run compile` and the full test suite pass.

## Comments

2026-10-05: implemented on branch `feat/channel-filters-allowlist`, based on `main` (#18 has merged).

- `isFilteredOut` covers both modes. `setDenylistEnabled` is replaced by `setFilterSetting(playlistId, "off" | "allow" | "deny")`; `clearsList(filter, setting)` says when the popup must ask first. All in `src/lib/channel-filters.ts`.
- The confirmation is inline in the editor (Clear and switch / Cancel), not `window.confirm`, which Firefox popups don't support. Wording: "Switch to Allow only? This clears the 3 denied channels." or "Turn on Allow only? …" from Off.
- Allow and deny blocks share the one "filtered out of" toast. With an unknown channel only allowlists block, and the toast is "Couldn't identify the channel, so it was skipped for …".
- An empty allowlist that is on says "No channels listed yet, so nothing is auto-added here."
- The live check is still open: the built-in browser can't load the extension or sign in.
