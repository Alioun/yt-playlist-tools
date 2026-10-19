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

Also from [ticket 11](11-accounts.md): modules for the account reader (main world), the tab registry, the current-account resolver and the private-write guard. A tab only ever receives its own account's setup.

Also from [ticket 26](26-youtube-music-quick-actions.md): the YouTube Music page adapter
- reads availability from each item's menu at hover time;
- checks each action's internals when the page loads;
- serialises queue actions;
- loads only when a YouTube Music feature or playlist shortcuts is on.

The playlist picker loads lazily.

Also from [ticket 10](10-youtube-access.md):
- **The gateway:** one deep module with a `run(job)` interface. Its route table (job → route order) is a data constant.
- **Other modules:** the site core (bridge plus gateway) per site; a registration reconciler in the background; a serving-tab router; a one-at-a-time job queue per tab for YouTube Music queue actions.
- **Teardown:** every feature has one that removes its elements, styles and listeners.
- **Assets:** no web-accessible resources, so in-page assets are inline. WXT's `registration: "runtime"` content-script option likely fits (unverified).
- **Test seams:** recorded responses per job, plus fakes for `scripting.registerContentScripts` and `tabs.query` URL filtering. Check whether WXT's fake browser has them.

Also from [ticket 12](12-adding.md): a single background coordinator orders adds and removals per account, playlist and video. Session memory (undo-skip, recent outcomes) stays in memory only. The private-window write guard covers Missing/Full marks and new-playlist records.

Also from [ticket 07](07-watched.md): the watch tracker is a deep module. A pure core turns readings into counted seconds and the playlists now due, so `bun test` can cover it; a thin player adapter feeds it. Its page script runs on every YouTube page while auto-add is on, to follow the miniplayer.
