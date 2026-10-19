# Which UI stacks are worth considering?

Type: research
Status: resolved
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

## Answer

The recommendation is to keep shadcn/ui on Base UI, with Svelte as the one real alternative. Full findings, with benchmarks of 12 stacks in headless Chrome and a `bun test` spike: [`docs/research/ui-stacks.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/ui-stacks/docs/research/ui-stacks.md) on branch `research/ui-stacks`.

1. **shadcn/ui on Base UI (today's stack).**
   - It handles shadow roots best of the React primitive libraries: every portal accepts a `ShadowRoot`, and about ten shadow fixes have shipped.
   - It has been shadcn's default since July 2026 and ships monthly.
   - It runs under `bun test` + happy-dom with no setup.
   - Its own Toast can replace Sonner, which writes CSS into YouTube's `<head>`.
   - Cost: primitives about 1.7–1.9× Radix's size, on top of React's 66 KB gzip.
2. **shadcn/ui on React Aria.** The same styles, and the best published accessibility testing of any candidate. But its shadow-DOM support is an experimental, undocumented flag, it injects `<style>` into YouTube's `<head>`, and it renders slower than Base UI.
3. **Svelte 5 + shadcn-svelte / Bits UI.**
   - About half the JS (60 vs 121 KB gzip) and a 35–40% faster first render.
   - Cost: everything is rewritten, there's one main maintainer, and `bun test` needs a ~20-line plugin plus `--conditions browser` (proven in the spike).

**Other findings:**
- **Rejected:** Mantine, HeroUI, Chakra and Radix Themes took 105–193 ms for the first render against Base UI's 87 ms, and each has shadow-root or maintenance problems. The doc also covers Radix, Ark/Park UI, Headless UI, Solid + Kobalte, Vue + Reka UI and Preact.
- **One stack, two skins:** shadcn's styles in the popup and settings, and the same primitives with a small hand-written YouTube skin for in-page UI (YouTube's colour variables, its fonts, px sizing). A second stack would only pay off for weight: today's content script adds 88 KB gzip of JS and 10 KB of CSS to every YouTube page.
- **Stale facts:**
  - YouTube no longer defines the `--yt-spec-*` colour variables; the live ones are `--yt-sys-color-baseline--*`, which are undocumented.
  - The README is out of date: WXT's shadow root has no `<html>`/`<body>` anymore, Preact partly works with Base UI now, and the popup still preloads the SettingsPanel chunk.
- **Follow-ups added:** [ticket 24](24-performance-budget.md) (performance budget). In-page theme source, sizing and fullscreen toasts went to [ticket 14](14-in-page-controls.md); keyboard isolation in-page to [ticket 08](08-shortcuts.md); the toast component and Tailwind leaking into YouTube's page to [ticket 13](13-ui-stack.md); a real-browser test layer to [ticket 17](17-modules.md) and [ticket 18](18-breakage.md).
