# How does a user set up a playlist's channel filter?

Type: prototype
Status: resolved
Labels: wayfinder:prototype
Part of: [Channel filters](../map.md)
Blocked by: 01

## Question

Where and how does a user switch an auto-add playlist's channel filter between off, allowlist mode and denylist mode, and add or remove channels from it? Candidates: a control on each row of the popup's auto-add playlist list, an "add this video's channel" action on the watch page or popup, and pasting an `@handle` or channel URL. The popup has no add/remove list today (only checkbox lists), so this is a new UI pattern.

Prototype: branch `prototype/channel-filter-ui` (commit 5284b41): `src/entrypoints/popup/channel-filters.prototype.tsx`, variants A/B/C via `?variant=` in dev builds.

## Answer

Resolved with the user, 2026-10-04, after trying the prototype. **Combine variant C's channel card with variant A's inline row editor**, both in the popup's auto-add section. Variant B (drill-in page) was dropped.

- **Channel card (from C), at the top:** shows this video's channel ("Title · @handle") and, for each auto-add playlist, Allow / Deny buttons. Clicking one lists the channel on that playlist. On an off playlist it also sets the mode. Clicking the active button again removes the channel. The card is always about the current video's channel and has no handle box.
  - If the playlist already has a mode, the other button is greyed out, with a tooltip naming the mode.
  - The card is hidden when the popup isn't on a watch page. On a watch page where the channel lookup failed, it shows "Channel unknown" with the buttons disabled.
- **Row editor (from A), below:** each checked auto-add playlist row has a label ("All channels" / "Allow only · 3" / "Deny · 2") that opens an editor under the row:
  - an Off / Allow only / Deny switch with a one-line hint;
  - listed channels as removable tags;
  - an "add this video's channel" button;
  - the only `@handle` / channel URL box. `/c/` URLs are rejected with a prompt to paste the handle or `/channel/` URL instead.
- **Mode changes:** switching between Allow only and Deny **clears the list, after a confirmation**. Switching to Off keeps the list, so turning the filter back on restores it.
