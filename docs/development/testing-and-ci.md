# Tests and CI

[← Development](README.md)

## Tests

Tests use Vitest with three projects: `chrome`, `firefox` (`*.firefox.test.ts`) and `server`. `bun test` can't run them because it doesn't resolve WXT's imports. [`vitest.config.ts`](../../vitest.config.ts) sets `import.meta.env.FIREFOX` itself, since `WxtVitest()` doesn't under Vitest.

```bash
bun run test           # once
bun run test:watch
bun run test:coverage
```

## CI

[`ci.yml`](../../.github/workflows/ci.yml) runs on pushes to `dev` and `main` and on every PR. It typechecks, tests, builds both targets, checks the manifests with [`check-manifests.sh`](../../scripts/check-manifests.sh) (MV3, background type, version, gecko ID, `update_url`, host permissions), uploads both builds as artifacts, runs the [release decision](releasing.md) cases in [`release-meta.test.sh`](../../scripts/release-meta.test.sh), and smoke-tests the broker image. [Dependabot](../../.github/dependabot.yml) groups packages that must update together.

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
