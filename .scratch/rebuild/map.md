# Rebuild (2.0)

Labels: wayfinder:map

## Destination

A spec at `.scratch/rebuild/spec.md` for 2.0 of this extension: a ground-up rebuild that keeps every capability, works through the user's own YouTube session, and puts UI/UX first. Every decision is settled and it's ready to hand to `/to-tickets`.

## Notes

- **Domain:** vocabulary in `GLOSSARY.md`. Today's behaviour, YouTube usage and friction are in [inventory.md](inventory.md), the parity checklist. Read it instead of re-exploring the old code.
- **Skills:** grilling tickets call `grilling` + `domain-modeling`. The architecture tickets (17, 18) also call `codebase-design`. Research tickets call `research`; prototype tickets call `prototype`.
- **Working style:** use subagents freely for research, planning and implementation, and fan independent work out in parallel. When anything is unclear, ask the user rather than guess.
- **Settled while charting (2026-10-19):**
  - **Scope.** Only the functionality is fixed. Every capability a user has today survives; UI, placement, wording, defaults, architecture and libraries are all open. Improvements that make an existing capability easier or better are actively sought. A genuinely new capability needs the user's go-ahead first.
  - **Approved new capabilities:** Watch Later as a target; quick-save from thumbnails; a separate setup per YouTube account; several shortcuts, each to its own playlist; settings sync across browsers; auto-add on Shorts; creating playlists from the extension.
  - **AMO reviews 2.0 answers:** "Could you update it for latest Firefox and YouTube?" and "Would be cool to have multiple 'Add to playlist' shortcut options. And maybe with some manual labels/titles?"
  - **Same extension.** 2.0 ships from this repo as the next major version: an update on the same AMO listing and gecko ID, plus a first Chrome Web Store listing.
  - **Local first** ([ADR-0001](../../docs/adr/0001-youtube-access-through-the-users-session.md)). No server of ours: the token broker in `server/` retires. No Google Cloud app in the normal path. Settings stay in the browser. The Data API comes back only for a capability research shows can't be done through the user's YouTube session; that capability's ticket then picks a weaker local version, dropping it, or a fallback on the user's own Google credentials.
  - **Never drive YouTube's visible UI to do work.** Send the requests YouTube's own UI sends, as Add to queue does. (1.2 clicked through the Save dialog and broke with layout changes.) Opening YouTube's ⋮ menu on right-click is the feature itself, so it's exempt.
  - **Upgrading 1.4.5 users:** carry over auto-add playlists, the shortcut playlist and key, the watch percentage and the toasts setting; delete the tokens, client ID and secret; show a one-time "no Google credentials needed anymore" note.
  - **Inside YouTube, look like YouTube.** In-page UI follows YouTube's own theme, type, shapes and motion. The popup and settings use the extension's design system.
  - **UI is decided through clickable prototypes:** first throwaway pages with realistic fake data in the candidate component library, then a rough dev build on real YouTube for in-page parts once the look is agreed.
  - **Today's friction counts as defects** 2.0 must fix (inventory.md, "Friction").
  - **Browsers:** desktop Chrome and Firefox, MV3. Chromium browsers ride along on the Chrome build.
  - **Tooling:** WXT, TypeScript and Bun stay. Tests run on `bun test`, not Vitest. The UI stack (framework, component library, styling) is the user's call after research.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

- [What do store policies and YouTube's terms allow?](issues/03-store-policy.md): both stores allow working through the user's session (listed precedents exist). Chrome forbids "YouTube" as the name, which led to [ticket 22](issues/22-name.md). The Data API fallback is nearly unavailable under YouTube's API policies. No cookie reading and no remote config. Chrome needs a privacy policy, disclosures and an in-product consent. Detail on branch `research/store-policy`.

## Not yet specified

- Visual detail past what the prototypes settle: motion, iconography, empty-state and error copy.
- Edge cases the access research will expose: private, deleted, age-restricted or members-only videos; playlist size limits; brand accounts and channel switching.
- A performance budget for the popup and in-page UI. The popup opens in about 60 ms today.
- Accessibility beyond the component library's defaults.

## Out of scope

- Firefox for Android, Safari and m.youtube.com: 2.0 targets desktop browsers only (ruled while charting).
- Any server we run, and any shared Google Cloud app (ruled while charting; see ADR-0001).
- Building 2.0 and slicing the spec into build tickets: that starts after the destination.
