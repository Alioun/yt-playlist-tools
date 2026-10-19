# Write the rebuild spec

Type: task
Status: open
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
