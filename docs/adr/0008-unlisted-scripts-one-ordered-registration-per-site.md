# Page scripts are unlisted scripts in one ordered registration per site, sharing one Svelte runtime

Page code is built as WXT unlisted scripts and registered by the background at runtime. Each site gets two registrations: one page-world entry (the gateway), and one isolated-world entry listing the site core, the UI kit, and each feature that's on, in that order. The kit carries Svelte and exposes the names features use on an isolated-world global; feature builds link to it instead of bundling Svelte.

We chose this for four reasons:
- WXT builds every page script as a self-contained file, and a Svelte copy per feature would break the size budget.
- Only files within one registration have a guaranteed order, and compiled Svelte needs the kit loaded first.
- WXT's content-script wrapper costs 3 KB per file.
- That wrapper also posts a message the page can see.

There are no manifest content scripts and no web-accessible resources.

## Considered options

- **WXT content scripts with `registration: "runtime"`:** they keep the 3 KB wrapper and a Svelte copy each.
- **One registration per piece:** no guaranteed order between them.
- **The kit owning every component:** a switched-off feature's UI would still load.

## Consequences

- Two build hooks, and a generated export list for the kit, which is built last.
- The lazy popovers (picker, watch-page menu) carry their own Svelte and Bits UI, so a page briefly holds two Svelte copies once a popover opens.
- Both browsers clear registrations on every extension update; the background restores them at start-up and re-injects open tabs.
