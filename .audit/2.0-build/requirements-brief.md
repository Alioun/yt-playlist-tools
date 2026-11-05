# Requirement pass: match every 2.0 spec ID to code and tests

Read `/Users/alioun/.local/src/t3-pstack/plugins/pstack/agents/poteto-agent.md` in full and act as it says. Do not delegate, and run no reviews.

## Rules

- **Inspect only.** Change no source, test, spec or Git state. The only file you write is your report, at the path your task message names. Never delete anything.
- Work in `/Users/alioun/.t3/worktrees/yt-playlist-tools/t3-2.0-compose`, branch `2.0/compose-units` at commit `8563caea3`. Don't check out, commit or run tests that write to the tree. Running a single test file to confirm a claim is fine.
- No network, no `.env` reads, no installs.
- `.audit/2.0-build/status.md` and `decisions.json` describe the build and the owner's settled decisions (G1 to G18, R171 to R178). The spec is under `.scratch/rebuild/spec/`. `resolutions.md` and later R-numbers override older text. A requirement marked superseded, runner-up or historical isn't in scope; say so in one line.

## The goal

The whole test suite passes on this commit, but nobody knows how much of 2.0 is actually built. Your report turns "what's left" into a complete list for your chapter.

For every requirement ID defined in your chapter (a bold ID such as `**YT-ADD-12**` or `**DATA-07**` that opens its definition, not a mention), decide one status:

- **built**: production code under `src/` implements it, and a test or fixture gate checks the behavior. Cite the code `path:line` and the test.
- **untested**: code implements it, but nothing checks it. Cite the code.
- **partial**: some of it exists. Say exactly which part is missing.
- **unwired**: the code exists but nothing in the shipped extension reaches it (no entrypoint, SiteCore, route or composition calls it). Cite the code and the missing caller.
- **missing**: nothing implements it.
- **external**: it's satisfied outside the source (store listing, CI, release process, docs). Say where, or that you couldn't verify it.
- **held**: it depends on something the owner holds (production, rendering and axe, native behavior, live YouTube checks). Say which.

Trace through the real entrypoints in `src/entrypoints/` and composition files to decide unwired. Don't trust a README's claim; check the code. Fixture tests that build their own harness prove the module works, not that the extension reaches it.

## The report

Write Markdown at your report path:

1. A one-paragraph summary with counts per status.
2. A table: `| ID | Status | Evidence | Gap |`, one row per ID, in spec order. Keep each cell short.
3. "Work to do": the missing, partial, unwired and untested items grouped into buildable units of work. Each unit names its IDs, the files it would touch, its dependencies on other units, and a size (S, M or L).
4. "Questions": anything the spec leaves undecided that blocks a unit. A product decision is the owner's, so list it, don't decide it.

Return the counts and the "Work to do" list in your final message too.
