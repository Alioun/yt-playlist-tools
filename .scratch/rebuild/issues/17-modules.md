# What modules does the rebuild have?

Type: grilling
Status: open
Labels: wayfinder:grilling
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 04, 07, 10, 16

## Question

Use `codebase-design` to design the module map: deep modules with small interfaces. Likely candidates are a YouTube gateway, the watch tracker, the add pipeline (filters and duplicates), the settings and account store, and the surfaces. Decide:
- where the seams go, so that `bun test` can cover them (see [ticket 04](04-bun-test.md));
- how WXT entrypoints stay thin;
- the folder layout.

Also from [ticket 05](05-ui-stacks.md): happy-dom can't see Tailwind v4 styles or element positions. Decide whether a real-browser test layer is needed, and where it sits.

Also from [ticket 04](04-bun-test.md):
- **Constraints:** keep WXT at the entrypoints; auto-imports off (`imports: false`) with real import paths, or keep `#imports` behind a Bun plugin; read `import.meta.env` in one platform module and pass it in; use injected dependencies as the test seam rather than `mock.module`; run `bun test --isolate`.
- **Bun version:** bump `packageManager` from `bun@1.4.0` to at least 1.4.3, since CI reads that field.
- **Per-browser runs:** inject the platform and run once, or keep separate Chrome and Firefox runs.
- **Coverage:** a policy that accepts no branch coverage.

Also from [ticket 13](13-ui-stack.md): the UI is Svelte 5 + shadcn-svelte / Bits UI ([ADR-0002](../../../docs/adr/0002-svelte-and-bits-ui.md)). The `bun test` setup needs the Svelte plugin and `--conditions browser` from the ticket 05 spike.

Also include:
- **YouTube Music:** its own page adapter, which shares the playlist operations.
- **Modularity:** each feature is an independently loadable unit. A feature that's switched off injects nothing into pages, for example through dynamic content-script registration.
