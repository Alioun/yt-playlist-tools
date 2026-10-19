# How do we find out when YouTube breaks us?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 04, 10

## Question

2.0 leans on YouTube internals that can change without notice. Decide how breakage gets caught and handled:
- **Recorded tests:** tests against recorded YouTube responses at the gateway seam.
- **Live check:** an on-demand check against real YouTube.
- **User-facing failures:** what the user sees when a request fails or a response changes shape, instead of a silent failure.
- **Diagnostics:** what's possible without telemetry, given `data_collection_permissions: none`.
- **Fix speed:** how fast a fix can reach users through AMO and Chrome Web Store review.

Use `codebase-design` for the seam.

Also from [ticket 05](05-ui-stacks.md): YouTube's `--yt-sys-color-baseline--*` theme variables are undocumented and belong on the breakage watch list, along with any real-browser checks.

Also from [ticket 04](04-bun-test.md): `bun test` can't reach real browsers, real YouTube or the built output (CSS, `injectScript`). Live and in-browser checks need a different tool.
