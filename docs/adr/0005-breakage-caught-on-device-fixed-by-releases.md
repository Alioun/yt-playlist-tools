# YouTube breakage is caught on the device and fixed only by releases

2.0 depends on YouTube internals that change without notice (ADR-0001), yet it has no server, no telemetry and no remote config. Every fallback ships in the package: alternative routes, every known response shape, alternate anchors and fallback colours. The extension detects breakage locally and tells the user which feature isn't working. It offers a diagnostics report the user copies by choice. Fixes reach users only as store releases, through a hotfix lane that never changes permissions or disclosures.

## Considered options

- **Remote selectors or a kill switch:** AMO bans remote code and config, and it would be a server in all but name that also leaks usage.
- **Opt-in error reporting:** needs a server, and ends `data_collection_permissions: none`.
- **Silent fallback:** silent failure is a defect on the 1.x friction list.
- **A Google test account in CI for signed-in checks:** Google flags automated sign-ins, session cookies rotate, a stored session is a credential to guard, and a bot on YouTube is "automated means".

## Consequences

- YouTube is tested through recorded, redacted responses replayed under one page port, plus a daily signed-out CI watch. Signed-in checks run only in the developer's own browsers, from a dev-only live-check build, before each release.
- A Chrome fix can take days, because the Chrome Web Store has no expedited review. A bad release is rolled back in the store dashboards first.
