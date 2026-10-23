# Run the Svelte tooling pilot

Run these commands from the repository root with Bun 1.4.3 and Node 24 or newer.
The fixture builds separately from the working React extension.

## Run the tests and type checker

```sh
bun install --frozen-lockfile
bun run compile
bun run typecheck:pilot
bun run test
```

`test` runs `test:legacy` and then `test:bun`. Both must pass in the existing CI build job.
The pilot adds five Bun tests in `tests/integration`.

Use `*.test.ts` for target tests. Bun discovers all tests below `./tests` and `./src/shared/model`.
This includes `tests/guards/**/*.test.ts` without another script change.
The command also names `src/shared/model/model.bun-test.ts` explicitly because Bun does not discover that suffix through its directory scan. `bunfig.toml` excludes `tests/browser/**` from this DOM runner.
Vitest discovers only `src/**` and explicitly excludes `src/shared/model/**/*.test.ts` and `src/shared/model/model.bun-test.ts`.
The model and guard owners can add tests without changing dependencies or config.
When another source directory migrates, add its Bun discovery root and its Vitest exclusion in the same change.
Do not use bare `bun test` during this migration, because it also discovers the retained Vitest tests.
`test:watch` and `test:coverage` still operate on the legacy suite only.

`typecheck:pilot` invokes the following checker after clearing only this fixture's generated `.svelte-check` directory.
The cleanup prevents stale diagnostics from deleted Svelte files in svelte-check 4.7.7.

```sh
svelte-check --tsgo --workspace tools/fixtures/svelte-pilot --tsconfig ./tsconfig.json --fail-on-warnings
```

`typescript@~6.0.3` supplies the JavaScript API required by Svelte tooling.
`@typescript/native@npm:typescript@7.0.2` supplies the native checker.
The existing `compile` script selects the native binary explicitly to avoid the two packages' shared `tsc` executable name.

## Build and inspect the fixture

Build both targets with the Bun runtime. `--bun` also applies to the WXT executable's Node shebang.

```sh
bun --bun run build:pilot
bun --bun run build:pilot:firefox
bunx --no-install playwright install chromium
bun run test:pilot:browser
```

Then put Node 24 on `PATH` and rebuild with npm.

```sh
node --version
npm run build:pilot
npm run build:pilot:firefox
npm run test:pilot:browser
```

The outputs are `tools/fixtures/svelte-pilot/.output/chrome-mv3` and `firefox-mv3`.
The browser script starts its own loopback server and fresh Chromium contexts.
It checks the built page's counter, shadow-root styles, real popover dimensions and offset, Escape dismissal, and focus restoration.
It writes an open-popover screenshot to `browser-check.png` in each output directory.
Both target artifacts run in Chromium here. This command does not test the Firefox browser or install the fixture as an extension.

To inspect the built page manually, serve one output directory and open `pilot.html`.

```sh
python3 -m http.server 41873 --bind 127.0.0.1 --directory tools/fixtures/svelte-pilot/.output/chrome-mv3
```

## Check the production boundary

```sh
bun run build
bun run zip:firefox
scripts/check-manifests.sh .output/chrome-mv3 .output/firefox-mv3
bun run check:pilot
```

The fixture config has its own source root, entrypoints, and output directory under `tools/`.
Production WXT still discovers `src/entrypoints` and keeps its React module.
`check:pilot` requires both fixture and production builds and fresh Firefox archives. It checks injected fixture CSS, fixture manifests, and the absence of fixture code and filenames in both production outputs.

The production config excludes only `tools/fixtures/svelte-pilot/**` from the AMO sources ZIP through `zip.excludeSources`.
Other files under `tools/` remain eligible for source packaging.
Both the Firefox runtime ZIP and AMO sources ZIP exclude the fixture.

Run the archive check separately after `bun run zip:firefox` with `node tools/fixtures/svelte-pilot/check-archives.mjs`.
The checker uses system `unzip` to inspect archive entries, requires both archive types, and fails for missing, unreadable, or contaminated archives.
Its optional argument selects an output directory for synthetic archive checks.
The main CI build job runs it immediately after ZIP generation.

The `svelte-pilot` CI job repeats the fixture builds and Chromium checks with Bun and Node 24.
It then builds the production extension and checks the boundary.
See [validation evidence](VALIDATION.md) for the measured results and deferred requirements.
