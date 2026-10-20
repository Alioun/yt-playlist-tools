# How does GatherTube's functionality fold into 2.0?

Type: research
Status: open
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

The user wants every feature of [GatherTube](https://github.com/karimelgazar/gathertube) (MIT, by Karim Elgazar, unmaintained since 2025-10) in 2.0, credited. It gathers a window's open YouTube video tabs into one queue: YouTube's own `watch_videos` queue or its own embedded player, sorted six ways, optionally closing the gathered tabs.

The user's rules (2026-10-20):
- **Port all of it.** Every capability, option, sort order, shortcut and setting survives, reshaped to fit 2.0's principles (opt-in feature, off costs nothing, look like YouTube inside YouTube, never drive YouTube's visible UI).
- **Exactly two additions:**
  - gathering into a playlist the user picks (the "vacuumed playlist");
  - an automatic option.
  - Nothing else. "It's not my product and I am not scope creeping this."
- **Credit GatherTube** visibly.
- **The automatic option must be very mindful of browser resources** and never degrade the browser's performance ([ticket 33](33-resource-mindful-defaults.md)).

Find out:
- **Inventory:** every feature, option, default, shortcut, message and edge case in GatherTube 1.1.0 (Chrome MV3 root and `firefox-build/` MV2), including what the listings promise.
- **What no longer works and why:** coordinate with [ticket 32](32-gathertube-upstream-fix.md). How 2.0 avoids the same breakage.
- **The fold:** how each item maps onto 2.0's features, permissions (GatherTube needs `tabs`; does 2.0?), architecture (ADR-0001/0007/0008), UI (popup, settings, a player page) and budgets (ticket 24).
- **The playlist target:** how gathering into a chosen playlist uses ticket 12's add flow (membership, outcomes, Undo, account in view).
- **The automatic option:** the candidate triggers, what each costs the browser, and a recommendation for the user to pick.

## Answer

(open)
