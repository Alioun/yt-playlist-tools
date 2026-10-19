# Which UI stacks are worth considering?

Type: research
Status: open
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

Shortlist UI stacks for 2.0's popup, settings page and in-page UI. Start from shadcn/ui on Base UI (today) and include serious alternatives: other React component libraries and design systems, and stacks on other frameworks such as Svelte or Solid if they beat React here.

Judge each on:
- polish out of the box;
- accessibility;
- bundle size and popup open time (about 60 ms today);
- theming: light and dark, plus a YouTube-like look inside YouTube;
- rendering inside a shadow root on YouTube's pages: portals, focus traps, CSS isolation;
- MV3 content-security-policy compatibility on Chrome and Firefox, and WXT support;
- testability with `bun test` (see [ticket 04](04-bun-test.md));
- maintenance health in 2026;
- how much hand-styling it leaves.

Recommend a top two or three with their trade-offs. The user decides in [ticket 13](13-ui-stack.md).
