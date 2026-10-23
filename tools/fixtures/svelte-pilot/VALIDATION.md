# Svelte pilot validation

These results were measured on macOS arm64 from base `54cab5b` on 2026-10-24.
Bun was 1.4.3, the normal local Node was 25.0.0, and the transient Node was 24.22.1.
The transient Node archive came from nodejs.org and matched its published SHA-256 checksum.
The Node 24 run reported `{"node":"24.22.1","bun":null}`.
No production source file or production WXT config changed in this slice.

## Commands and results

| Exact command | Actual result |
| --- | --- |
| `bun install --frozen-lockfile` | Passed, no lockfile changes |
| `bun run compile` | Native TypeScript 7.0.2, exit 0 |
| `bun run typecheck:pilot` | `svelte-check found 0 errors and 0 warnings` |
| `bun run test` | Vitest 316 passed across 17 files, then Bun 5 passed across 2 files, 14 expectations |
| `bun --bun run build:pilot` | Chrome MV3 fixture built, 132.67 kB total |
| `bun --bun run build:pilot:firefox` | Firefox MV3 fixture built, 132.81 kB total |
| `bun run test:pilot:browser` | Both Bun-built artifacts passed in Chromium 156.0.8078.4 |
| `npm run build:pilot` with Node 24 on `PATH` | Chrome MV3 fixture built, 132.67 kB total |
| `npm run build:pilot:firefox` with Node 24 on `PATH` | Firefox MV3 fixture built, 132.81 kB total |
| `npm run test:pilot:browser` with Node 24 on `PATH` | Both Node-built artifacts passed in Chromium 156.0.8078.4 |
| `bun run build` | Existing Chrome MV3 React extension built, 16 files |
| `bun run build:firefox` | Existing Firefox MV3 React extension built, 16 files |
| `scripts/check-manifests.sh .output/chrome-mv3 .output/firefox-mv3` | `chrome-mv3: ok`, `firefox-mv3: ok`, `All manifest assertions passed.` |
| `bun run check:pilot` | Both fixture manifests and injected CSS passed; both production outputs excluded fixture code and filenames |
| `scripts/release-meta.test.sh` | `All release-meta cases passed.` |
| `scripts/check-signed-build.test.sh` | `All signed-build cases passed.` |
| `bun run zip:firefox` | Extension and sources archives built; extension ZIP had 16 entries and zero fixture entries |

The final 17-command verification log is generated locally at `.output/svelte-pilot-validation.log`.
The ZIP check is separate. File sizes above are WXT's uncompressed output, not gzip budgets.

## Native checker proof

Installed `svelte-check --help` lists `--tsgo`.
Its implementation resolves `@typescript/native` and spawns that package's `bin/tsc`.
The scoped command checks the fixture's TypeScript and Svelte files with `--fail-on-warnings`.

A temporary `NativeCheckProbe.svelte` assigned a string to a number.
The checker exited 1 with `Type 'string' is not assignable to type 'number'.` and `svelte-check found 1 error and 0 warnings in 1 file`.
After the probe was deleted, svelte-check 4.7.7 initially kept reporting its emitted type file.
The committed cleanup wrapper fixed this reproducible stale-output case.
The negative control then exited 1 for the invalid source and 0 after deletion.
There is no flag-support mismatch or fallback to the JavaScript checker.

## Browser observations

For all four artifact checks, the counter changed from **Count 0** to **Count 1**.
The counter color was `rgb(20, 80, 140)` despite a conflicting red `!important` rule in the outer document.
The popover background was `rgb(240, 245, 250)`.
Its floating wrapper used `position: fixed` inside the shadow root.
The trigger measured 128.65625 by 21 CSS pixels, and the popover measured 158.125 by 99 CSS pixels.
The measured gap was within one CSS pixel of the configured 8-pixel offset.
Escape hid the popover and restored focus to its trigger. No page errors occurred.

The native preview opened an incognito tab and navigated to the built fixture.
Two snapshot attempts failed with `Preview snapshot failed: Preview automation snapshot timed out after 15000ms.`
The fallback used the lockfile's official Playwright package and a new browser context per artifact, without a saved browser profile.
The check served compiled WXT HTML and chunks over loopback HTTP.
It did not exercise extension installation, Firefox runtime behavior, or YouTube sign-in.
Happy-dom results are limited to DOM interaction, injected style presence, and cleanup. They do not prove layout.

## Requirement coverage

| Requirement | Proven scope or deferral |
| --- | --- |
| Q-TOOL-1 | Bun 1.4.3 package-manager pin; CI reads it through setup-bun |
| Q-TOOL-4 | Bun matcher augmentation compiles; DOM matchers run in the component tests |
| Q-TOOL-11 | Required define table, preload order, ignore patterns, and coverage settings are present |
| Q-TOOL-13 | Exactly four setup files, ordered compiler, DOM, fake browser, Testing Library; reset and isolation tests pass |
| Q-TOOL-14 | Real Svelte components, our TypeScript rune module, and Bits UI's JavaScript rune modules compile; CSS is injected; dependency runes are not forced |
| Q-TOOL-15 | `test:bun` passes `--isolate --conditions=browser`; target discovery includes model tests and guards |
| Q-TOOL-18 | Native `--tsgo` invocation, alias dependency split, positive check, and Svelte semantic-error negative control pass for this fixture; whole-product Svelte checking remains deferred |
| Q-TOOL-19 | Needed pilot dependencies are pinned and locked; React, Vitest, IndexedDB, and their test dependencies remain for the bounded migration |
| Q-TOOL-20 | Separate WXT fixture config uses Node APIs and builds through npm on Node 24 for both targets; full production build-hook migration remains deferred |
| Q-TOOL-2 and Q-TOOL-16 | Whole-suite migration and final script names remain deferred; `test` deliberately runs legacy and target suites |
| ADR-0002 | Svelte 5 and real Bits UI pass component and built-artifact checks; no production UI rewrite or shadcn-svelte component is claimed |
| ADR-0008 and ARC-MOD-11 through ARC-MOD-14 | Injected shadow styles are exercised; runtime linking, kit exports, unlisted page-script ordering, and lazy production popovers remain deferred |
| R30 | No size-budget compliance is claimed for this deliberately self-contained fixture |
| R83 | Fixture Firefox manifest declares a synthetic ID and no data collection; production manifest assertions pass |
| R148 and R149 | Release triggers and signing configuration stay unchanged; their existing local case suites pass |
| REL-STORE-32 | Runtime outputs and Firefox extension ZIP exclude the fixture; AMO source exclusion of `tools/**` needs the production config owner's change |

The added tests cover only this slice. Model and guard tests from other workers are absent from this base worktree.
Guard `*.test.ts` files and model `*.test.ts` files are discovered recursively.
The actual model file, `src/shared/model/model.bun-test.ts`, is also named explicitly in the Bun command and Vitest exclusions.
A temporary probe with the same suffix proved that an explicit path executes it; the probe was then deleted.
The parent reported 48 passing model tests from commit `874c85e39b3fb6dd09827b6c1d78a0a8ec5bc21e`; that is parent evidence, not part of the five local pilot tests.
Independent Sol review and integration verification belong to the parent before landing.
