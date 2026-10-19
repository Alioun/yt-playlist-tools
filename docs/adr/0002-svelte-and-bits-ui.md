# 2.0's UI is built with Svelte 5, shadcn-svelte and Bits UI

1.x uses React 19 with shadcn/ui on Base UI. 2.0 rewrites every surface (the popup, settings and the UI inside YouTube and YouTube Music) in Svelte 5 with shadcn-svelte on Bits UI. In the [UI stack research](https://github.com/Alioun/yt-playlist-tools/blob/research/ui-stacks/docs/research/ui-stacks.md) it shipped about half the JS of the React stack (60 vs 121 KB gzip) and rendered 35–40% faster on first paint. That matters for an extension that injects into every YouTube page and is meant to stay light.

## Considered options

- **Keep React with shadcn/ui on Base UI:** the research's first pick. It has the best shadow-root support of the React libraries and `bun test` works with no setup, but it's twice the weight.
- **shadcn/ui on React Aria:** the best accessibility testing, but its shadow-DOM support is experimental.

## Consequences

- Every component and test is rewritten. Nothing from 1.x's UI carries over.
- Bits UI has one main maintainer, a supply risk the React options don't have.
- `bun test` needs a ~20-line Svelte plugin and `--conditions browser`. The research spike proved this setup.
