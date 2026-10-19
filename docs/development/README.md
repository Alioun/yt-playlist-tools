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

## More

- [Gotchas](gotchas.md): config and build traps
- [How Add to queue works](add-to-queue.md)
- [Tests and CI](testing-and-ci.md)
- [Releasing](releasing.md)
- [Environment files](environment-files.md)
- [Google sign-in and the token broker](../legacy/README.md) (legacy, retiring in 2.0)
