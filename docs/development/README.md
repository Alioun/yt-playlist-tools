# Development (1.5.0)

[← Docs](../README.md)

WXT (Chrome MV3 + Firefox MV3), React 19, Tailwind v4, shadcn/ui on Base UI.

```bash
bun install
bun run dev            # Chrome
bun run dev:firefox    # Firefox
bun run compile        # typecheck
bun run test           # unit tests (test:watch, test:coverage)
bun run build          # Chrome
bun run build:firefox  # Firefox
bun run zip            # Chrome package
bun run zip:firefox    # Firefox package + AMO sources zip
```

Judge popup speed with `bun run build`. `wxt dev` serves unbundled modules and takes seconds to open the popup; the production build takes ~60 ms.

None of the [environment files](environment-files.md) is needed for `bun run dev`.

## Branches

`dev` is the default branch: PRs target it, and every push builds installable [dev builds](testing-and-ci.md#installing-a-dev-build). `main` is what's released: merging `dev` into it with a version bump publishes that version ([Releasing](releasing.md)).

Some things follow the default branch, so they land on `dev` first:
- **Dependabot**, including its security updates for the GitHub Actions the workflows use. Promote those to `main` straight away; a `dev` → `main` merge with no version bump releases nothing.
- **Scheduled workflows** run from `dev`.

## More

- [Gotchas](gotchas.md): config and build traps
- [How Add to queue works](add-to-queue.md)
- [Tests and CI](testing-and-ci.md)
- [Releasing](releasing.md)
- [Environment files](environment-files.md)
- [Google sign-in and the token broker](../legacy/README.md) (legacy, retiring in 2.0)
