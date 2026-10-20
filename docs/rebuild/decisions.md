# Decisions (ADRs)

[← 2.0 planning](README.md)

Decisions for 2.0 that are hard to reverse. The records live in [`docs/adr/`](../adr/).

| ADR | Decision |
| --- | --- |
| [0001](../adr/0001-youtube-access-through-the-users-session.md) | YouTube access goes through the user's own session, from inside their YouTube tabs; no server, no Google Cloud app, no Data API, not even as a fallback |
| [0002](../adr/0002-svelte-and-bits-ui.md) | The UI is Svelte 5 with shadcn-svelte / Bits UI: about half the JS of the React stack |
| [0003](../adr/0003-account-setups-keyed-by-datasync-id.md) | Account setups hold only playlist choices, keyed by YouTube's `DATASYNC_ID`; everything else is shared |
| [0004](../adr/0004-shortcuts-caught-in-page.md) | Shortcuts are caught in YouTube's pages, not with the browser's keyboard commands; amended 2026-10-20 for three unbound commands behind the opt-in Keys from any tab |
| [0005](../adr/0005-breakage-caught-on-device-fixed-by-releases.md) | YouTube breakage is caught on the device and fixed only by releases; no remote config or telemetry |
| [0006](../adr/0006-local-truth-sync-copies-documents.md) | Each browser keeps its own settings; settings sync copies whole documents through `storage.sync` |
| [0007](../adr/0007-only-the-gateway-runs-in-the-page-world.md) | Only the gateway runs in YouTube's page world; features stay in the isolated world |
| [0008](../adr/0008-unlisted-scripts-one-ordered-registration-per-site.md) | Page scripts are unlisted scripts in one ordered registration per site, sharing one Svelte runtime |
| [0009](../adr/0009-upgraders-keep-what-1-4-5-did.md) | Upgraders keep what 1.4.5 did, not what its popup showed; amended 2026-10-20 so upgraders whose 1.4.5 never got access default to 50 % |
| [0010](../adr/0010-one-consent-gates-every-feature.md) | One consent of our own gates every feature, in every browser |
| [0011](../adr/0011-betas-from-github-pages.md) | Betas are unlisted builds of the same add-on, served from this repo's GitHub Pages |
| [0012](../adr/0012-automatic-work-is-event-driven-scoped-and-paced.md) | Automatic work is event-driven, scoped to where it's needed, and paced; never on a clock, never in tabs that don't need it |
