# What does a kept list mean when a filter is turned back on in the other mode?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Channel filters](../map.md)

## Question

Found while writing the spec. Switching a filter to Off keeps its list (How does a user set up a playlist's channel filter?), and switching directly between Allow only and Deny clears the list after a confirmation. But a playlist that went Deny → Off → Allow only, either through the row switch or a card Allow click on an Off playlist, would silently turn its old denylist into an allowlist. That's the surprise the confirmation was meant to prevent. Does Off remember which mode its kept list belongs to, and what happens when the filter is turned back on in the other mode?

## Answer

Resolved with the user, 2026-10-05. **Off is a switch, not a mode.** A channel filter always has a mode (allowlist or denylist) and is separately on or off. A kept list always belongs to its mode.

- **Storage:** `{ mode: "allow" | "deny", enabled: boolean, channels: channelId[] }`, replacing `mode: "off"`.
- **Turning a filter back on in its remembered mode** restores the list unchanged.
- **Turning it on in the other mode** is treated like a direct Allow↔Deny switch: confirmation, then the list is cleared.
- **Confirmation only when the list has at least one channel.** That holds for direct switches and turning back on alike; with an empty list the remembered mode is only a default.
- **Card on an off playlist:** both buttons stay active. The remembered mode's button turns the filter on and adds the channel to the kept list. The other button asks first (e.g. "Turn on Allow only for Music? This clears its 3 denied channels.") and, if confirmed, starts a new list with just this channel. Greying out still applies only to playlists that are on.
- **Row label when off with a kept list:** "All channels · 3 denied kept" (or "· 2 allowed kept"); plain "All channels" when the list is empty.
- **UI wording unchanged:** the row editor keeps its Off / Allow only / Deny switch.
- **Glossary:** Channel filter now notes that a filter can be switched off and keeps its mode and listed channels; "Off" is not a mode.
