# What's the performance budget for the popup and the in-page script?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)

## Question

2.0 must not be bloated, and a feature that's switched off should cost nothing. Set budgets for:
- **Popup:** how fast it must open. It's about 60 ms today; Svelte rendered 35–40% faster than React in [ticket 05](05-ui-stacks.md)'s benchmark.
- **In-page weight:** how much JS and CSS each feature may add to YouTube and YouTube Music pages, and in total with everything on. Today's content script adds 88 KB gzip of JS and 10 KB of CSS.
- **Off means zero:** a page with every page-changing feature off gets nothing injected beyond what the remaining features strictly need.
- **Enforcement:** how the budgets are enforced, for example a size check in CI.
