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

- [ ] The card shows, hides, and shows its looking-up and unknown states as described above.
- [ ] The buttons behave as described for filters that are on and off. Confirmation is asked only when the kept list isn't empty.
- [ ] The card and the row editor stay in sync whichever one makes a change.
- [ ] The README is updated.
- [ ] Popup tests cover every card state and every button case.
- [ ] `bun run compile` and the full test suite pass.
