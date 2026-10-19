# Only the gateway runs in YouTube's page world

Page-world code is one module per site: the gateway. It sends every request and does every page read. Every feature runs in the extension's isolated world and reaches YouTube only through gateway jobs and streams. This keeps one page port as the only way into YouTube's internals, which is what the recorded-response tests replay (ADR-0005). It also keeps settings and Svelte out of YouTube's own JavaScript.

## Considered options

- **A page-world part for each feature:** it bypasses the single page port that recorded tests rely on, and it pushes settings into the page.

## Consequences

- The gateway carries every job of its site and stays inert until asked. For example, with only auto-add on, a little unused job code still loads with the site core.
