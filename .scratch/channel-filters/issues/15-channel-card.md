# 15: Channel card at the top of the popup

**What to build:** a card at the top of the popup's Auto-add playlists section. It shows this video's channel ("Title · @handle") and has no input box.

- **When it shows:** only where the content script reports a current video. It is hidden on non-YouTube tabs and on the home, search and Shorts pages.
- **While resolving:** "Looking up channel…", with the buttons disabled.
- **If the lookup fails:** "Channel unknown", with the buttons disabled.
- **Buttons:** each checked auto-add playlist gets Allow and Deny buttons.
  - **Filter on:** only the button for its mode is active. The other is greyed out, with a tooltip naming the mode. Clicking the active button while the channel is listed removes it.
  - **Filter off:** both buttons are active.
    - The button for the remembered mode switches the filter on and lists the channel, keeping any kept channels. If the list is empty, either button does this.
    - The other mode's button first asks, when the kept list has channels: "Turn on Allow only for Music? This clears its 3 denied channels." If confirmed, it starts a new list with just this channel.
- **README:** "Planned: channel denylist." becomes a features entry for per-playlist channel filters.

Until ticket 13 lands, the card shows titles without handles. That's expected.

**Blocked by:** 12 (Allowlist mode, the unknown-channel rule and mode switching)

**Status:** ready-for-agent

**Base branch:** `main` if [Alioun/yt-playlist-tools#2](https://github.com/Alioun/yt-playlist-tools/pull/2) (WXT migration) has merged. Otherwise stack on ticket 12's branch and retarget to `main` once it merges. One branch and one PR for this ticket.

**Spec:** [Per-playlist channel filters](../spec.md), "Channel card (top of the section)". Terms are as defined in `GLOSSARY.md`. Prototype (variant C): branch `prototype/channel-filter-ui`.

- [x] The card shows, hides, and shows its looking-up and unknown states as described above.
- [x] The buttons behave as described for filters that are on and off. Confirmation is asked only when the kept list isn't empty.
- [x] The card and the row editor stay in sync whichever one makes a change.
- [x] The README is updated.
- [x] Popup tests cover every card state and every button case.
- [x] `bun run compile` and the full test suite pass.

## Comments

2026-10-05: implemented on branch `feat/channel-filters-card`, based on `main` (#19 has merged).

- The card is `src/components/ChannelCard.tsx`, placed under the section heading in `App.tsx`. It reuses `lookUpCurrentChannel()` and the editor's `CurrentChannel` states, and shares `filterState` with the row editor, so both stay in sync.
- New `listChannelIn(playlistId, mode, channel)` in `src/lib/channel-filters.ts` switches a filter on with the channel listed in one save: it keeps a kept list in the same mode and replaces one in the other mode.
- The confirmation is the editor's inline `ConfirmClear`, now shared: "Turn on Allow only for Music? This clears its 3 denied channels."
- The greyed-out button's tooltip ("Music is set to Allow only") sits on a wrapper span, because some browsers show no tooltip on a disabled button.
- With no checked playlist, the card says "Check an auto-add playlist below to filter this channel."
- The editor's root is now a group named "Edit channel filter", which tests use to tell its buttons from the card's.
- The README's features entry already existed (tickets 11 and 12); it now mentions the card.
- The live check is still open: the built-in browser can't load the extension or sign in.
