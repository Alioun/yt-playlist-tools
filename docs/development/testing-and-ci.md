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

Every CI run keeps both builds for 30 days, as `chrome-mv3-<sha>` and `firefox-mv3-<sha>`. The run's summary links them.

```bash
gh run list --branch dev --workflow ci.yml --limit 1   # find the run
gh run download <run-id>                               # unzips both into ./chrome-mv3-<sha>/ and ./firefox-mv3-<sha>/
```

- **Chrome:** open `chrome://extensions`, turn on Developer mode, then **Load unpacked** and pick the `chrome-mv3-<sha>` folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, then **Load Temporary Add-on…**. Pick the zip as downloaded from the run page, or `manifest.json` inside the folder `gh run download` made. It's unsigned, so it's gone when Firefox restarts.

The Firefox build has the same gecko ID as the AMO listing, so while it's loaded it replaces an installed 1.4.5 for that session.
