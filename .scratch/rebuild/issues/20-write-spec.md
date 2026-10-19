# Write the rebuild spec

Type: task
Status: resolved
Labels: wayfinder:task
Part of: [Rebuild (2.0)](../map.md)
Blocked by: 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27

## Question

Assemble `.scratch/rebuild/spec.md` from every resolved ticket. It covers:
- each capability's behaviour, using inventory.md as the parity checklist and its friction list as the defects 2.0 fixes;
- the UI, linking the prototypes;
- YouTube access;
- architecture;
- storage;
- testing;
- upgrade and rollout.

Any gap found goes back on the map as a ticket.

Also from [ticket 07](07-watched.md): tickets 11 and 12 say "watch threshold"; standardise on "required percentage" (glossary).

Also from [ticket 17](17-modules.md):
- **Mapping:** sections 1–8 of its Answer are the architecture, 9 is testing, 10 is the build.
- **Suggested order for build tickets (for `/to-tickets` after the spec):**
  1. scaffold, tooling and guard tests;
  2. shared kernel and contracts;
  3. gateway with recorded fixtures for youtube.com;
  4. store and migrations;
  5. registrar, tabs, site core and kit;
  6. features, one at a time;
  7. popup, settings and onboarding;
  8. YouTube Music;
  9. real-browser layer and watch;
  10. live-check build.
- **For the spec's open items:**
  - accessibility testing (axe-core in a test layer?);
  - dev workflow with runtime-registered scripts (reloading open tabs after rebuilds);
  - a compile cache for the Svelte `bun test` plugin as the suite grows.

Also from [ticket 19](19-upgrade-and-rollout.md): its Answer is the spec's upgrade-and-rollout chapter: copy, listings, privacy policy, workflows, test matrix and release checklist.

Also from building [ticket 15](15-popup-and-settings.md)'s prototype: with ticket 24's clsx-only `cn` (no tailwind-merge), conflicting utilities between a component's base classes and its variants resolve silently by CSS order. For example, base `border-transparent` beat the outline variant's `border-border`, so light-mode outline buttons had no border. The spec needs a rule: no conflicting utilities across base and variants in generated shadcn-svelte components, ideally enforced by a lint or test. Also, the prototype's "fake" code-split group created an import cycle that blanked the settings page while its size numbers still looked fine, so the budget check must also assert that every page renders.

Also from ticket 15's prototype: switches and checkboxes must be controlled wherever a change can be refused or deferred (consent, the sync join question, site-access prompts, a refused store change). The generated shadcn-svelte switch flipped its own state before asking the parent, so a cancelled change left it showing "on". Make this a component rule, with a test.

Also from [ticket 14](14-in-page-controls.md): use its Answer's decisions, its card-selector table and the measured sizes. Its prototype's real-YouTube screenshots are on branch `prototype/in-page-controls`.

Also from [ticket 27](27-youtube-music-controls.md): carry its placement and anchor table, the measured tokens (root 10 px, 36 px row buttons, 32 px card circles, 40 px header circles, the `#f1f1f1` toast 12 px above the player bar), the narrow-row table, the copy additions and the runner-ups. Prototype with real-site screenshots on `prototype/youtube-music-controls`.

Also from [ticket 15](15-popup-and-settings.md): its Answer's Layout, Components, States, Copy, Brand tokens, Sizes and Rules sections are written to serve as the spec's UI chapter.

## Answer

The spec is at [`spec.md`](../spec.md), with chapters in [`spec/`](../spec/). It was assembled on 2026-10-19.

- **Size:** about 8,400 lines across nine chapters (YouTube, YouTube Music, features/accounts/data, UI, architecture, quality, release, parity), with about 1,470 requirement IDs to cite in build tickets.
- **How it was written:** eight agents wrote the chapters in parallel from the resolved tickets. Their flagged conflicts and gaps were settled in three rounds of resolutions plus a final gaps section, R1–R82 in [`spec/resolutions.md`](../spec/resolutions.md), each applied across every chapter it touched.
- **Checked mechanically:** links, anchors and requirement IDs resolve, with no duplicates, and no contradictions remain between chapters.
- **Parity:** [chapter 09](../spec/09-parity.md) maps every 1.5.0 capability (79) and defect (43) to where 2.0 handles it, and lists 40 new capabilities and improvements, 9 of them pending the user.
- **What's still open** is in the spec's [Open items](../spec.md#open-items):
  - the user's decisions (name, new-capability go-aheads, narrow rows, the privacy-policy approval);
  - ticket 25's signed-in live checks;
  - AMO's reply (ticket 23).

  None of them reopens the design: each has a stated default the spec uses until it's answered.
