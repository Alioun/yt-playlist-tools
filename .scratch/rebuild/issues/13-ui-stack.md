# Which UI stack?

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 05

## Question

This is the user's call, made from [ticket 05](05-ui-stacks.md)'s shortlist. Settle the framework, component library and styling for the popup, the settings page and the in-page UI, including whether they share one stack or use two.

Also from [ticket 05](05-ui-stacks.md): settle the toast component (Base UI Toast or Sonner, which writes CSS into YouTube's `<head>`), and how to keep Tailwind's `@property` rules from leaking into YouTube's page. Weigh the shortlist against [ticket 24](24-performance-budget.md)'s budget.

## Answer

The user's call, 2026-10-19: **Svelte 5 with shadcn-svelte on Bits UI**, the option with half the JS and the faster first render from [ticket 05](05-ui-stacks.md). Recorded as [ADR-0002](../../../docs/adr/0002-svelte-and-bits-ui.md).

- **One stack, two skins:** shadcn-svelte's styles in the popup and settings, and the same primitives with a small YouTube / YouTube Music skin for in-page UI. The skin follows the settled rule "Inside YouTube, look like YouTube"; the extension's own UI must not imitate YouTube ([ticket 03](03-store-policy.md)).
- **Tests:** `bun test` needs a ~20-line Svelte plugin and `--conditions browser`. The ticket 05 spike proved it.
- **Still open:** the toast component, and keeping Tailwind's `@property` rules out of YouTube's `<head>`, are left to [ticket 14](14-in-page-controls.md) and [ticket 17](17-modules.md).
