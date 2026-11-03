# Building Perchling for YouTube™ from source

Built and checked on Ubuntu 24.04 on ARM64 and x86-64 with Node 24, the AMO reviewer environment. The build needs no secrets, environment variables or network access beyond the npm registry.

Bun only installs the dependencies, because the lockfile is Bun's. The build itself runs on Node, with your own npm.

1. Install the exact dependencies pinned in `bun.lock` from the npm registry, with Bun 1.4.3 fetched through npm. Nothing is installed globally.

   ```sh
   npx --yes bun@1.4.3 install --frozen-lockfile
   ```

   Two other ways to get the same Bun are `npm install --global bun@1.4.3` and `curl -fsSL https://bun.com/install | bash -s "bun-v1.4.3"`.

2. Build the Firefox package on Node.

   ```sh
   npm run build:firefox
   ```

   This runs `wxt build -b firefox`. `wxt.config.ts` and `build/` use only Node APIs.

3. The output is in `.output/firefox-mv3/`. Compare it with the submitted package.

   ```sh
   diff -r .output/firefox-mv3 <unzipped submission>
   ```

`npm run build-for-amo` runs steps 1 and 2 for AMO's automatic builder.

## What the build does

WXT, on Vite, compiles the TypeScript and Svelte sources in `src/` and bundles each entrypoint. Every third-party package comes unmodified from npm and is listed in `package.json` and `bun.lock`. The output contains no native code, so it's the same on ARM64 and x86-64. CI checks this on both for every release.

## Layout

| Folder | What it holds |
|---|---|
| `src/entrypoints/` | Thin WXT entrypoints |
| `src/background/` | Storage, script registration and adds |
| `src/page/` | The page-world gateway that calls YouTube's own client. Its jobs build into a second file per site, which the background injects into a tab when that page runs its first job. |
| `src/site/` | The isolated-world core, the UI kit and the features |
| `src/ui/` | The popup, settings and the first-run page |
| `src/shared/` | Code the other folders share |
| `build/` | Build helpers |
| `src/livecheck/` | A page for the developer only. `build/livecheck.ts` drops it from every store build, and CI's `check:zip` verifies that. |

License: MPL-2.0.
