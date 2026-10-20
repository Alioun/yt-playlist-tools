# What may automatic work cost the browser?

Type: research
Status: open
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

The user (2026-10-20): "with all of the automatic options added the default should be very mindful of browser resources and should never ever degrade the performance of the browser".

[Ticket 24](24-performance-budget.md) budgets load cost (bytes, main-thread time at load). Nothing yet budgets the running cost of the automatic parts: auto-add's watch progress, breakage monitoring, settings sync, tab routing, YouTube Music state reading, and GatherTube's automatic gathering ([ticket 31](31-gathertube.md)).

Decide:
- the principle;
- the measurable budgets for steady-state CPU, wake-ups, timers, memory, storage writes and work in background tabs;
- which defaults change;
- how CI and the release check enforce it.

## Answer

(open)
