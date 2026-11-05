# Tests and CI

[← Development](README.md)

## Tests

Every test runs under `bun test`; the repo has no other runner. Unit and component tests sit beside their code as `*.bun-test.ts`, and the cross-cutting ones live under `tests/` as `*.test.ts`. [`bunfig.toml`](../../bunfig.toml) preloads Svelte compilation, happy-dom and the fake browser.

```bash
bun run test                    # test:bun, then test:fixtures
bun run test:bun                # every Bun test
bun run test:bun --shard 2/8    # the second of eight slices, as one CI job runs it
bun run test:fixtures           # the gates in tools/fixtures/gates.ts
bun run lint                    # oxlint, with the type-aware promise rules
bun run format                  # oxfmt, rewriting files in place
bun run format:check            # oxfmt, failing on any file it would change
```

Bun ignores `[test] timeout` in `bunfig.toml`, so both runners pass `--timeout` themselves. A test gets 30 s unless the test or its gate sets its own. Bun also hides passing tests when it detects an agent, so both runners set `AGENT=0` for the child. One Bun process uses one core, so the whole suite takes about 20 minutes serially. Keep a test file to about a minute, and split a file that grows past that, as the store's recovery tests are split.

[`.oxlintrc.json`](../../.oxlintrc.json) makes floating promises and awaits of non-promises errors. Its other rules only warn for now.

`bun run compile` and the fixture `tsc` gates check with TypeScript 7 through `@typescript/native`. TypeScript 7's npm package has no compiler API, so `package.json` also installs TypeScript 6 as `typescript6`. svelte-check 4.7 accepts only TypeScript 5 or 6, so run it through [`scripts/svelte-check.mjs`](../../scripts/svelte-check.mjs), which serves its `typescript` imports from `typescript6`. Its `--tsgo` flag still finds TypeScript 7. The seven test files that parse source with the compiler API import `typescript6` directly. They are five `*.bun-test.ts` files in `src/background/store/`, plus `tests/guards/checker.ts` and `tests/guards/forbidden.ts`. Remove the alias and the launcher once svelte-check supports TypeScript 7 and those tests have moved off the compiler API.

[`.oxfmtrc.json`](../../.oxfmtrc.json) holds the house style: no semicolons, double quotes, no trailing commas, lines up to 200 characters. It leaves Svelte files alone, because oxfmt's Svelte support is experimental, and it skips prose, fixture records and the files the G28 approval covers. The one commit that reformatted the repo is listed in [`.git-blame-ignore-revs`](../../.git-blame-ignore-revs). Run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once, and `git blame` skips it.

## CI

[`ci.yml`](../../.github/workflows/ci.yml) runs on pushes to `dev` and `main` and on every PR. It lints, checks formatting, typechecks, runs the fixture gates, runs `test:bun` as eight parallel jobs, builds both targets, checks that every built text file is valid UTF-8, checks the manifests with [`check-manifest.ts`](../../scripts/check-manifest.ts) (each built manifest must equal the 2.0 table exactly, with the beta `update_url` only in the Firefox beta build), uploads both builds as artifacts and runs the [release decision](releasing.md) cases in [`release-meta.test.sh`](../../scripts/release-meta.test.sh). The tests under `tests/release/` cover the AMO metadata and the Pages site builds. [Dependabot](../../.github/dependabot.yml) groups packages that must update together.

## Installing a dev build

Every CI run keeps both builds for 30 days, as `chrome-mv3-<sha>` and `firefox-mv3-<sha>`. On pushes to `dev`, the Firefox build is also signed. The run's summary links them.

```bash
gh run list --branch dev --workflow ci.yml --limit 1   # find the run
gh run download <run-id>                               # unzips both into ./chrome-mv3-<sha>/ and ./firefox-mv3-<sha>/
```

- **Chrome:** open `chrome://extensions`, turn on Developer mode, then **Load unpacked** and pick the `chrome-mv3-<sha>` folder.
- **Firefox, signed** (pushes to `dev`): download `yt-playlist-tools-<version>-firefox-signed.xpi` from the run, then in `about:addons` click the gear and **Install Add-on From File…**. It stays installed across restarts. Its version is `package.json`'s plus the run number, for example `1.5.0.57`, and it never updates itself: install the next one by hand.
- **Firefox, unsigned** (every run, PRs included): open `about:debugging#/runtime/this-firefox`, then **Load Temporary Add-on…**. Pick the zip as downloaded from the run page, or `manifest.json` inside the folder `gh run download` made. It's gone when Firefox restarts.

The Firefox build has the same gecko ID as the AMO listing, so either one replaces an installed 1.4.5. A signed dev build replaces it for good, until you install 1.4.5 or a beta again.

Signing ([R149](../../.scratch/rebuild/spec/resolutions.md#signed-firefox-dev-builds-r149)) runs only while the repo variable `SIGN_DEV_BUILDS` is `true`, with the AMO key in the `amo-dev` environment ([GitHub setup](releasing.md#github-setup)). Each signing uses up an AMO version number for good, which is why PRs aren't signed. Chrome needs no signing: an unpacked extension survives restarts.
