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

[`ci.yml`](../../.github/workflows/ci.yml) typechecks, tests, builds both targets, checks the manifests (MV3, background type, gecko ID, host permissions) and smoke-tests the broker image. [Dependabot](../../.github/dependabot.yml) groups packages that must update together.
