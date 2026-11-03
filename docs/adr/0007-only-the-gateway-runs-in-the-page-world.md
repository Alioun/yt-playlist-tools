# Only the gateway runs in YouTube's page world

Page-world code is one module per site: the gateway. It sends every request and does every page read. Every feature runs in the extension's isolated world and reaches YouTube only through gateway jobs and streams. This keeps one page port as the only way into YouTube's internals, which is what the recorded-response tests replay (ADR-0005). It also keeps settings and Svelte out of YouTube's own JavaScript.

## Considered options

- **A page-world part for each feature:** it bypasses the single page port that recorded tests rely on, and it pushes settings into the page.

## Consequences

- The gateway carries every job of its site and stays inert until asked. For example, with only auto-add on, a little unused job code still loads with the site core.

## Amendment (2026-11-03): the jobs load on first use

The owner decided (G42, rebuild spec R200) that the gateway's jobs load in their own file. The page world still runs only the gateway, and every request and page read still goes through its one page port, so the rest of this record holds. Only the consequence about unused job code changes.

- **Two files, one gateway:** `page-<site>.js` starts at `document_start` with the page channel, hello, the account and the streams. `page-jobs-<site>.js` holds the requests, lanes, account guard, playlist and queue parsers and live request adapters. On a page's first job, the background injects it into that one tab through the Registrar, and it hands itself to the page half of its own build.
- **Consequences:** a page that never runs a job never loads the job code, so the eager page half drops from about 26 KB to about 14 KB. The first job on a page waits for the injection, within its 10 s limit.
