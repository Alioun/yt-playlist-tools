# Exercise the page-bundle linker

This separate WXT project consumes `build/page-link.ts`. It builds independent page IIFEs and installs a synthetic extension in Playwright's bundled Chromium. HTTPS requests to both YouTube hostnames return routed fixture HTML. The browser checkers use temporary profiles. Production checks block other HTTP requests. Development also permits its local WXT server.

Run these commands from the repository root with Node 24 on PATH.

```sh
node --version
bun install --frozen-lockfile
node tools/fixtures/svelte-pilot/page-link/typecheck.mjs
node node_modules/wxt/bin/wxt.mjs build tools/fixtures/svelte-pilot/page-link
node node_modules/wxt/bin/wxt.mjs build tools/fixtures/svelte-pilot/page-link -b firefox
node tools/fixtures/svelte-pilot/page-link/check-build.mjs
node tools/fixtures/svelte-pilot/page-link/check-negative.mjs
bunx --no-install playwright install chromium
node tools/fixtures/svelte-pilot/page-link/check-regressions.mjs
node tools/fixtures/svelte-pilot/page-link/check-browser.mjs --browser chromium
node tools/fixtures/svelte-pilot/page-link/check-development.mjs
node tools/fixtures/svelte-pilot/page-link/check-source.mjs
```

The WXT builds also run with `bun --bun node_modules/wxt/bin/wxt.mjs`. The source checker requires Node 24 and system `unzip`. It creates a fresh Firefox source ZIP, checks the packaged linker bytes, installs locked dependencies in the extracted tree, then rebuilds production for both targets. The existing narrow source exclusion removes this whole fixture and keeps `build/page-link.ts`.

Each checker rejects unknown arguments. The type checker runs both `svelte-check --tsgo` and the installed native TypeScript checker. The browser checker requires completed Chrome output. The negative checker first saves complete added and removed fixture outputs. The browser checker exercises both saved states after its main run. Its optional `--fixture-root <generated-fixture>` argument selects one generated fixture without recursively checking the saved states. The control page uses WXT's already-locked `@wxt-dev/browser` API package so production-generated script-path types cannot constrain this separate project. Run builds and browser checks sequentially so rebuilding cannot remove files from an installed extension.

Firefox runtime verification has a separate prerequisite.

```sh
node tools/fixtures/svelte-pilot/page-link/check-browser.mjs --browser firefox
```

This command fails explicitly. The dependency owner must install Puppeteer 24.43.1 and Firefox 158, and a later increment must implement the native BiDi extension driver. A Firefox target build is not Firefox runtime verification.

## Linker behavior

`wxt.config.ts` creates one linker with absolute `siteRoot`, `kitIndex`, and `evidenceDir` paths. It installs `pageCompileOptions` through the public WXT Svelte module and passes the factory's hooks to WXT.

`src/registration.ts` declares the fixture's actual page consumers and derives an exact ownership map from the shared `pageLinkEntries` projection. The shared site-bundle description owns page, core, kit, and lazy bundle names. The linker requires ownership for every unlisted entry. It never infers a site from a filename. Declared kits build last. Extension pages and the background keep their normal WXT builds.

`feature-auto-add.ts` is an unsuffixed synthetic Svelte consumer. It mounts its own real component with a rune-backed list. Its `each` runtime export contributes to the www kit without changing the music kit. It is not production auto-add. The negative checker reproduces the old suffix classifier's page classification and requires its build to fail at `noFeatureRuntime feature-auto-add`. The normally classified artifact must build and run.

The collector parses every transformed feature module after component and rune-module compilation. Decoded specifiers determine collection, including escaped string literals. Contributions use the full transformed ID so executable, raw, and other query variants stay independent. It resolves namespace bindings through lexical scopes, keeps original named imports through aliases, and accepts static properties including `["if"]`. Foreign import and source re-export names are declaration syntax. Local namespace exports, production namespace escapes, and computed dynamic properties fail with the importer and expression. Unknown Svelte entrypoints fail closed. Named re-exports contribute their original names. Namespace re-exports cannot produce a finite production export set.

Each site's kit imports `virtual:page-link-svelte`, installs the generated namespace dictionaries, and exposes its compiled `Badge` through `$kit`. The default real `svelte/internal/disclose-version` side effect runs in the kit. The kit preserves the core. Development uses the actual WXT command to choose complete namespaces, even before production collection.

The public hooks keep WXT's native callback types. Existing external predicates and global mappings compose with linked mappings. Static imports accepted by the caller's external configuration pass the output guard. Native module metadata validates their input identities. Relative input IDs use the native resolver to recover their canonical identity. The final guard checks each chunk against its validated native rendered imports, so output path objects, callbacks, and native absolute-path normalization keep their original behavior. Output filenames and IIFE configuration remain WXT's.

Cached filesystem lookups identify each rendered module's package owner by its manifest name, including renamed installations and symlinks. Module provenance rejects bundled Svelte in consumers, cores, or page entries; direct kit implementation in consumers; and Bits UI outside the lazy page bundle. Every page group rejects CSS assets, dynamic chunks, and non-IIFE output.

## Evidence

The checkers write their artifacts under the ignored `.output` directory.

- `evidence/chrome-build` and `evidence/firefox-build` contain the exact collected sets, contributing modules, build order, and rendered module provenance.
- `browser/chromium.json` and the site screenshots record registrations, execution order, worlds, component and rune behavior, exact namespace keys, styles, lazy Bits UI focus, Escape, positioning, and later `executeScript` sharing. Runtime negatives capture the missing-export and absent-kit exceptions through Chromium's debugger protocol.
- `negative.json` records deliberate build failures, hook composition, lexical bindings, and the music-only construct added and removed across clean builds. Both mutated states also pass the installed-browser checks on both sites. Generated case trees and failure logs remain under `cases`.
- `regressions/results.json` records escaped specifiers, transformed-ID replacement and removal, query variants, later raw imports, foreign import and re-export names, copied and symlinked packages, composed externals with object and callback output paths, output arrays, accepted relative and resolved absolute IDs under every native normalization setting, forbidden static and dynamic externals, and escape controls. Copied WXT projects retain build logs and installed Chromium evidence. The checker runs every case before failing so a broken linker retains its runtime exceptions and working controls.
- `development.json` and `development.log` record the real WXT dev command, full namespace equality, and a consumer edit. The initial and rebuilt outputs run in separate fresh installed profiles. This checker does not test registration retention across WXT's extension reload.
- `source-rebuild.json` and `source-*.log` record the fresh source ZIP and extracted production rebuilds.
- `sizes.json` records byte counts and gzip level 9 sizes for every fixture script. These are fixture data, not final product budget results.

The control page calls the pure shared `desired` function with canonical synthetic settings. It installs the returned registrations with native register, list, and unregister APIs. The installed checker compares all effective fields to planner data. Native match order is normalized as a set. Script order is compared exactly.

The default selection registers MAIN at `document_start` and ISOLATED at `document_idle`. The isolated registration lists core, kit, and consumer in that order. MAIN behavior is checked independently. No execution order between worlds is assumed.

The `unsuffixed`, `off`, and `gather` selections exercise fresh future page loads. Gather installs only page and core on watch and live routes, with nothing on the homepage. Switching registration selections does not tear down scripts already running in a page. The checker keeps the unsuffixed page open across the off switch and verifies its component remains present. The control page's lazy button injects `popovers.js` only after the checker selects a synthetic tab and clicks. Real Bits UI mounts into plain DOM inside the kit's shadow layer with its own Svelte runtime.

The working React extension, original pilot, production registrar, shared contracts, and production WXT configuration are outside this fixture.

The focused planner suite uses synthetic declarations for all twelve canonical features. It covers consent, schema, access, musicSection, extra page predicates, no-page features, file-free Gather, kit-free card-menu, lazy exclusion, registry order, input immutability, and invalid declarations.

```sh
bun test ./src/shared/features/registration.bun-test.ts
bun test ./tests/guards/architecture.test.ts
bun run compile
```

Copied fixture projects rewrite only their shared source import prefix to the repository's absolute `src/shared` path. The standalone fixture TypeScript configuration permits those explicit `.ts` imports for Node 24's native type stripping. The source checker verifies that the packaged planner and linker exactly match the working source.
