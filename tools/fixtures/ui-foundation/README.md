# Build the first-run UI fixture

This fixture builds the production first-run page from `src/ui/` on its own, over a synthetic owner.
The owner in `synthetic-owner.ts` is test data. It reads no storage, permissions, tabs or YouTube, and nothing from this folder ships.
The main WXT configuration, entries and package scripts stay unchanged.

None of the commands below has run yet. Run them from the repository root with the prepared dependencies, Bun 1.4.3 and Node 24 or newer.
Each one is bounded, and none needs network or credentials.

## Tests and type checks

```sh
timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/ui/onboarding/first-run.bun-test.ts ./src/ui/components/components.bun-test.ts
timeout -k 10 540 node tools/fixtures/ui-foundation/typecheck.mjs
timeout -k 10 540 bun run compile
timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./tests/guards
timeout -k 10 540 bun run test:bun
```

1. The focused Bun run names both `*.bun-test.ts` files, because Bun's directory scan doesn't match that suffix. It uses the existing preloads from `bunfig.toml`.
2. `typecheck.mjs` runs svelte-check over the fixture and `src/ui`. `ApiChecks.svelte` holds the component API's positive cases and its `@ts-expect-error` negatives. It is never imported or built.
3. `compile` is the whole-project native checker. It includes `src/ui/onboarding/owner.type-test.ts`, the Bun tests and this fixture's TypeScript, but not `.svelte` files.
4. The guard run checks that `src/ui` imports only `src/shared`, `src/ui` and packages, and that it has no WXT, environment or storage-write access.
5. `test:bun` confirms the runner discovers the new `*.bun-test.ts` files.

## Builds

```sh
timeout -k 10 540 node node_modules/wxt/bin/wxt.mjs build tools/fixtures/ui-foundation -b chrome
timeout -k 10 540 node node_modules/wxt/bin/wxt.mjs build tools/fixtures/ui-foundation -b firefox
timeout -k 10 540 node node_modules/wxt/bin/wxt.mjs build -b chrome
timeout -k 10 540 node node_modules/wxt/bin/wxt.mjs build -b firefox
timeout -k 10 540 node tools/fixtures/ui-foundation/check-build.mjs
```

The fixture builds go to `tools/fixtures/ui-foundation/.output/{chrome-mv3,firefox-mv3}`.
`check-build.mjs` needs both main builds as well. It checks the fixture's MV3 manifest (Chrome 121, Firefox 140, no permissions, no content scripts), the compiled page, its stylesheet tokens, and that no fixture text reached the production output.

## Rendered check

```sh
timeout -k 10 540 node tools/fixtures/ui-foundation/check-browser.mjs chromium
timeout -k 10 540 node tools/fixtures/ui-foundation/check-browser.mjs firefox
```

Each run serves the built page on loopback in fresh contexts with reduced motion. It renders the `denied` scenario at 360, 700 and 1280 px in light and dark, and walks all three steps.
It fails on page errors, off-origin requests, horizontal overflow, a column wider than 700 px or a missing wash.
Screenshots go to `.output/screens/<engine>/`. A person compares them with the approved prototype screens [ps-80] to [ps-84]. No visual match is claimed until then.
Playwright's prepared browser builds are needed. Installing them is a separate step that needs network.

## Scenarios

Open `onboarding.html` with `?scenario=` and optionally `&browser=firefox` and `&theme=light|dark|system`:

- `fresh`: no synced copy.
- `synced`: the synced copy ticks Auto-add and Quick actions.
- `denied`: Chrome's music.youtube.com prompt is denied. Agree still saves the ticked features on, and step 3 holds the YouTube Music ones with "Needs site access".
- `unconfirmed`: the agreement can't be confirmed, so step 2 reports it and step 3 never opens.
- `no-picker`: the playlist chooser reports that the picker is unavailable.
- `signed-out`: step 3 leads with Sign in.
