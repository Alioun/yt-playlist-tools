# Vite+ for Perchling 2.0: what to integrate

Research date: 2026-11-01. Repo: `t3-2.0-compose`, branch `2.0/compose-units`. Every claim carries a label. **Sourced** means a cited page or registry entry says it. **Measured** means I ran it on this machine (Apple M1 Pro, 8 cores, macOS, Bun 1.4.3, Node 26.13.0) in scratch copies under `/tmp/vplus-research/`, never in the repo. **Inferred** means my reasoning from the other two.

## Recommendation

Don't adopt Vite+ as a toolchain: not the `vp` CLI, not the `vite` to `@voidzero-dev/vite-plus-core` override, and not `vp test`. The parts that matter for build speed and bundle size are already here. Vite 8 already builds with Rolldown and minifies with Oxc, and swapping in Vite+'s core changed the 2.0 pilot bundle by +12 bytes gzip and build time by nothing measurable (both measured). Take two Oxc tools on their own, pinned, run through `bun run`. Add oxlint (with `oxlint-tsgolint` for type-aware rules) now: the repo has no linter, it runs in 0.2 s (2.2 to 3.2 s type-aware), and it finds real classes of bug (147 floating promises, 97 awaits of non-promises). Add oxfmt at the 2.0 cutover, because it rewrites about 816 of 1,138 files even with a house-style config, and that churn only makes sense once 1.x is deleted and parallel branches have merged. Delete the 322 Vitest tests with 1.x and stay on `bun test`, as spec Q-TOOL-2 already says. The same 297 store tests took 262 s under Bun and 740 s under Vitest 5 on Node. Fix Bun's two traps in the scripts instead: pass `--timeout` on the command line, and set `AGENT=0` where output is parsed. Separately, the full Bun suite takes 19.5 minutes on one core, so splitting and parallelizing it matters far more for CI time than anything Vite+ offers.

## Vite+ as of November 2026

- **Sourced.** Vite+ 1.0 shipped 2026-09-28, after an alpha in March 2026 and a beta on 2026-07-02. It is one `vp` CLI over Vite 8, Rolldown, Vitest, Oxlint, Oxfmt, tsdown and Vite Task, plus Node version management (`vp env`) and package-manager dispatch (`vp install` uses the `packageManager` field: pnpm, npm, yarn or bun). Planned but not shipped: remote caching, `vp release`, `vp docs`. ([1.0 post](https://voidzero.dev/posts/announcing-vite-plus-1-0), 2026-09-28; [viteplus.dev](https://viteplus.dev/), read 2026-11-01; [InfoQ](https://www.infoq.com/news/2026/08/vite-plus-beta/), 2026-08-22)
- **Sourced.** License and price: MIT, free for everyone. The October 2025 announcement planned a source-available commercial license for larger companies, which was dropped before public release. ([original announcement](https://voidzero.dev/posts/announcing-vite-plus), 2025-10-13, with undated update notes)
- **Sourced.** Ownership: Cloudflare acquired VoidZero on 2026-06-04. VoidZero says Vite, Vitest, Rolldown, Oxc and Vite+ stay MIT-licensed. ([VoidZero post](https://voidzero.dev/posts/voidzero-cloudflare), 2026-06-04; [SiliconANGLE](https://siliconangle.com/2026/06/04/cloudflare-acquires-voidzero-maker-vite-javascript-toolchain/), 2026-06-04)
- **Sourced.** Current release: `vite-plus` 1.4.0, published to npm and last modified 2026-10-23. It pins `oxlint` 1.89.0, `oxfmt` 0.74.0, `oxlint-tsgolint` 7.0.2004 and `vitest` 5.0.5, and declares `vite` as `npm:@voidzero-dev/vite-plus-core@1.4.0`. It requires Node `^22.18.0 || ^24.11.0 || >=26.0.0` and ships native binaries for darwin, linux (gnu and musl, x64 and arm64) and windows. (npm registry, read 2026-11-01)
- **Measured.** `vp --version` in the scratch copy reports vite 8.3.5, rolldown 1.2.15, vitest 5.0.5, oxfmt 0.74.0, oxlint 1.89.0 and oxlint-tsgolint 7.0.2004. `@voidzero-dev/vite-plus-core`'s `bundledVersions` field says the same: Vite 8.3.5, Rolldown 1.2.15, tsdown 0.23.1. Its own `package.json` version is `1.4.0`, not a Vite version.
- **Sourced.** Migration aliases `vite` to `@voidzero-dev/vite-plus-core` through package-manager overrides. For Bun it also mirrors the alias as a direct `vite` dependency, and it rewrites `vitest` imports to `vite-plus/test`. ([migration rules](https://viteplus.dev/guide/migrate-rules), read 2026-11-01; [migration guide](https://viteplus.dev/guide/migrate), read 2026-11-01)
- **Sourced.** `vp check` runs Oxfmt, Oxlint and type checking. Type checking goes through Oxlint's type-aware path (tsgolint, built on TypeScript 7) when `lint.options.typeAware` and `typeCheck` are both on. The page doesn't mention `.svelte` files or svelte-check. ([check guide](https://viteplus.dev/guide/check), read 2026-11-01)
- **Sourced.** `vp test` always runs Vitest in a Node process managed by Vite+. VoidZero's answer for Bun-based tests is to keep them as a script and call it with `vp run test:bun`. ([vite-plus discussion #2852](https://github.com/voidzero-dev/vite-plus/discussions/2852), 2026-09-29)

### Compatibility with this stack

| Piece | Status | Label |
|---|---|---|
| WXT 0.21.4 | WXT peer-depends on `vite ^6.3.4 \|\| ^7 \|\| ^8.0.0-0`. With the core override, `wxt build` and the pilot build succeeded for Chrome and Firefox. WXT has no documented Vite+ support. WXT's own move to Vite+ (for its repo tooling, not for users) is [PR #2340](https://github.com/wxt-dev/wxt/pull/2340), open since 2026-05-08, and it lists an encoding e2e test "blocked on OXC ASCII charset support". | measured; sourced |
| Firefox MV3 | `build:firefox` and `build:pilot:firefox` built with the core override. The outputs are deterministic (3 rebuilds, identical tree hash). Builds were not loaded into Firefox. | measured |
| Svelte 5 | vite-plugin-svelte 7.3.1 builds the pilot unchanged under the core. Oxlint lints `.svelte` `<script>` blocks only, not templates. Oxfmt formats `.svelte` through a bundled Prettier plugin, and that support is labelled experimental. ([oxfmt language support](https://oxc.rs/docs/guide/usage/formatter/language-support.html), read 2026-11-01; [Oxlint JS plugins alpha](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html), 2026-03-11) | measured; sourced |
| Bun as package manager | Supported, with Bun-specific migration rules. `bun install` with the override worked. | sourced; measured |
| Bun as test runner | Not supported by `vp test`. It can only run as a `vp run` script. | sourced |
| tsgo | Vite+'s type check uses tsgolint, which is built on TypeScript 7.0.2 ([type-aware stable](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable), 2026-07-22). It doesn't replace `svelte-check --tsgo`, because it doesn't check `.svelte` files. | sourced; inferred |

## What the repo already has

- **Measured.** Installed today: Vite 8.2.2 with Rolldown 1.2.5, `lightningcss` 1.33.0, and no esbuild. Vite 8 maps `minify: true` to `"oxc"` (`node_modules/vite/dist/node/chunks/node.js:33635`). The bundler, transformer and minifier Vite+ would bring are already in the build.
- **Measured.** WXT 0.21.4 sets esbuild's `charset: "ascii"` only when Vite is not Rolldown (`node_modules/wxt/dist/core/builders/vite/index.mjs:58-61`). So the current build already emits some non-ASCII bytes: one JS file in each of the 1.x and pilot builds, for example `·` in `popup-*.js`. This happens with or without Vite+. Chrome needs content scripts to be valid UTF-8, so `check:zip` or `check:budget` could assert UTF-8 validity. That is a side finding for the build tickets.
- **Sourced (repo).** Spec Q-TOOL-2 already rules out Vitest, `@vitest/coverage-v8` and Vitest-style config. Q-TOOL-20 and REL-STORE-27 to REL-STORE-31 require the store build to run with npm on Node 24, with Bun used only to install. 07-quality lists `check:budget`, `check:manifest`, `check:zip`, `check:runtime` and `scripts/coverage.ts`, none of which exist yet. Q-TEST-33 and Q-TEST-44 leave the `$state` identity check and the string-literal check open as "lint or guard test".

## Measurements

All of these ran in scratch copies. `base` is the repo as is, `up` overrides Vite to upstream 8.3.5 (Rolldown 1.2.16), and `vp` overrides Vite to `@voidzero-dev/vite-plus-core@1.4.0` and adds `vite-plus@1.4.0`.

| What | base | up (Vite 8.3.5) | vp (Vite+ core) | Notes |
|---|---|---|---|---|
| `bun install` | 3.7 s (frozen) | 5.7 s | 6.8 s | `node_modules`: up 446 MB, vp 533 MB |
| `wxt build` (1.x app, Chrome), 3 runs | 2.05, 1.21, 1.23 s | 2.57, 1.36, 1.30 s | 3.63, 1.42, 1.34 s | first run is cold |
| `build:pilot` (2.0 Svelte pilot), 3 runs | 1.84, 1.83, 2.00 s | 2.37, 3.18, 5.45 s | 1.73, 1.72, 1.73 s | noise dominates |
| 1.x app total, gzip -9 | 235,274 B | 235,284 B | 235,287 B | Chrome and Firefox identical |
| 2.0 pilot total, gzip -9 | 42,868 B | 42,760 B | 42,772 B | Vite 8.2.2 to 8.3.5 saves 108 B (0.25 %) |

Byte differences between `up` and `vp` come from the Rolldown patch level. For example, `e.defaultPrevented||M()` is minified to `!e.defaultPrevented&&M()` (measured diff of `youtube.js`).

| Check | Time | Result |
|---|---|---|
| `oxlint` 1.90.0, default rules, 829 source files and 120,859 lines | 0.20 to 0.71 s | 281 warnings: 149 `no-unused-vars`, 86 `no-useless-spread`, 28 `no-unused-expressions` (all in `*.type-test.ts`), 9 `no-sparse-arrays`, 6 `no-new-array`, 2 `no-self-assign`, 1 `no-useless-escape` |
| `oxlint --type-aware` (tsgolint 7.0.2005), `src tests` | 4.05 s under load | 753 warnings, including 221 `unbound-method`, 147 `no-floating-promises`, 97 `await-thenable`, 24 `no-base-to-string` |
| `oxlint --type-aware --type-check` | 2.20 to 3.17 s | 0 type errors |
| tsgo `tsc --noEmit` (`compile`) | 2.62 to 2.81 s | 0 errors |
| `svelte-check --tsgo` | 4.88 s | not compared in detail |
| `oxfmt` 0.75.0 `--check`, 1,138 files | 0.7 to 1.35 s | defaults: 916 files would change. `semi:false`, `printWidth` 120: 827. `printWidth` 200: 816 |
| `vitest run` (322 legacy tests) | 7.2, 8.2 s | all pass |
| `bun test` full suite via `test:bun` | 1,171.6 s real, 893 s user | 3,774 tests, 133 files, 3,767 pass, 7 fail on the 5,000 ms default timeout (run under load from parallel builds) |
| one file, `consent-recovery.bun-test.ts`, Bun alone | 262 s | 297 pass |
| the same file, Vitest 5.0.5 on Node, `bun:test` aliased to `vitest` | 740 s with a 120 s test timeout | 297 pass. With the default 5 s timeout, 30 tests timed out. The median per-test ratio, Node to Bun, is 2.29 |
| `vp run build` with Vite Task | 1.85 s warm | prints "cache disabled": package.json scripts aren't cached unless configured |

The two heaviest Bun files take 603 s (`withdrawn-document-recovery.bun-test.ts`, 368 tests) and 200 s (`consent-recovery.bun-test.ts`) of the 1,229 s summed test time. Next come `account-removal-execution` at 121 s, `interim-recovery-execution` at 88 s and `picker` at 77 s (measured from the per-test times in the log). 259 tests take more than 1 s.

## Component table

| Component | Replaces or adds | Effect, with evidence | Cost | Risk | Recommendation |
|---|---|---|---|---|---|
| Vite 8 + Rolldown via `@voidzero-dev/vite-plus-core` | Replaces upstream `vite` through an override | None on build time (about 1.2 to 2 s either way) or size (+3 B and +12 B gzip against upstream 8.3.5). Measured. | Override plus a direct `vite` alias in `package.json`, and +87 MB of `node_modules` | AMO reviewers get a repackaged Vite with a vendored native Rolldown instead of upstream `vite`. Tools reading `vite/package.json` see version `1.4.0`. WXT has no stated support. Release cadence follows VoidZero, not Vite. Inferred from measured facts. | **No.** Upgrade upstream `vite` within 8.x as usual: 8.3.5 saved 108 B on the pilot. |
| Oxc transformer and minifier | Already in use through Vite 8 | Nothing to gain. Measured. | none | none | **No change needed** |
| Oxlint (standalone, pinned) | Adds the repo's first linter | 0.2 to 0.7 s, 281 default findings. Measured. Can host custom rules for Q-TEST-33 (`$state` identity) and the Q-TEST-44 string-literal lint through JS plugins, which are alpha and cover `.svelte` script blocks only ([JS plugins alpha](https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html), 2026-03-11). Sourced and inferred. | A small config, a CI step, and triage of 281 findings (mostly unused vars in fixtures) | Low. It can't see Svelte templates, so `no-unused-vars` skips `.svelte` (sourced, oxc docs). | **Adopt now**, with the default rules as errors after one cleanup PR and a `build`/`tools` override where fixtures need it |
| Oxlint type-aware (tsgolint) | Adds typescript-eslint-class rules | 2.2 to 3.2 s with `--type-check`. 147 `no-floating-promises` and 97 `await-thenable` findings, which matter for a store with async recovery paths. Measured. | Triage of 753 findings, `oxlint-tsgolint` pinned to the TypeScript 7.0.x it tracks | tsgolint versions are tied to TypeScript patch releases (sourced). `unbound-method` (221) is noisy with injected ports. | **Adopt now** with `no-floating-promises`, `await-thenable` and `no-misused-promises` on. Leave `unbound-method` off. |
| Oxlint `--type-check` as the type checker | Would replace `compile` (`tsc --noEmit`) | 2.2 to 3.2 s against 2.6 to 2.8 s. No gain. Measured. | none | Doesn't cover `.svelte` | **No.** Keep `svelte-check --tsgo` (Q-TOOL-18). |
| Oxfmt | Adds the repo's first formatter | About 1 s for 1,138 files. 816 to 916 files would change. Measured. | One reformat commit, plus `svelte` installed for `.svelte` formatting (sourced) | Merge conflicts across parallel worktrees. `.svelte` support is experimental and goes through Prettier (sourced). | **Adopt with the 2.0 cutover**, right after 1.x is deleted and open branches merge |
| Vitest 5 (`vp test`) | Would replace `bun test` | 2.8× slower on the store's heaviest tests (measured). See the next section. | Rewrite of 133 test files, 4 preloads, the Svelte test plugin, and the gate runner's `suite` and `negatives` kinds | Reverses Q-TOOL-2 and Q-TOOL-3 | **No.** Delete the 322 legacy tests with 1.x. |
| Vitest browser mode | Would replace layer 4 (Playwright and Puppeteer on the built extension) | Not measured. Layer 4 loads unpacked extensions into Chromium and Firefox, and Vitest browser mode runs tests in a page, not in an installed extension. Inferred. | high | high | **No** |
| tsdown (`vp pack`) | Library packaging | The repo publishes no library | none | none | **No** |
| Vite Task (`vp run`) | Script runner with caching | Scripts run uncached by default (measured). Builds are already under 2 s. The 19.5-minute test suite can't be cached between commits that touch `src/`. Inferred. | Config, and `vp` in CI | One more tool between CI and Bun | **No** for now. Reconsider if remote caching ships. |
| `vp env` | Node version manager | CI already pins Node 24 for AMO rebuilds (REL-STORE-31) | n/a | Conflicts with the Bun-only install path | **No** |
| `vp install` | Package-manager front end | Dispatches to Bun anyway (sourced) | n/a | Adds nothing | **No** |
| `vp staged` / `vp hooks` | Git hooks | Not measured | low | Agents in worktrees commit often, and hooks slow every commit | **Later**, if wanted. A plain `lefthook` or none does the same. |
| `setup-vp` GitHub Action | CI setup | Only useful with `vp` | n/a | n/a | **No** |

## Bun or Vitest

Delete the 322 Vitest tests with 1.x and keep everything on `bun test`. Don't move to Vitest through Vite+.

**Speed (measured).** On `consent-recovery.bun-test.ts`, run alone, Bun took 262 s and Vitest 5.0.5 on Node 26 took 740 s for the same 297 passing tests. The median per-test ratio is 2.29×. Vitest runs files in parallel, which Bun's single process doesn't. The suite's time is concentrated in one file, though: 603 s of `withdrawn-document-recovery` under Bun, so roughly 1,400 to 1,700 s under Node at the measured ratio. A parallel Vitest run would still take longer than today's serial Bun run (inferred). The legacy Vitest suite's 7 to 8 s says nothing about this, because those are small React tests.

**Cost (measured counts).** 133 Bun test files (3,774 tests), 17 test files that call `Bun.*`, the four preloads, the `Bun.plugin` Svelte compiler from Q-TOOL-14, `jest.useFakeTimers` in 18 places, and the fixture gate runner. That runner's `suite` gates spawn `bun test` and parse its output, and `scripts/run-bun-tests.ts` shards entries for `bun test`. WXT's Vitest plugin would work: the legacy suite proves it. But Q-TOOL-5 keeps WXT at the edges, so that integration buys nothing here.

**What Vitest would fix, and how to get it on Bun instead.**

1. *Timeouts.* Bun ignores `[test] timeout` in `bunfig.toml`. Measured on Bun 1.4.3: `timeout = 50` let a 200 ms test pass. The fix is open as [oven-sh/bun#39260](https://github.com/oven-sh/bun/pull/39260) (opened 2026-08-16, not merged). `setDefaultTimeout` in a preload applies only to the first file ([#43787](https://github.com/oven-sh/bun/issues/43787), 2026-09-22; [#45192](https://github.com/oven-sh/bun/issues/45192), 2026-10-13, both open). Bun doesn't interrupt a test busy in synchronous code: a 6 s busy loop ran to the end and was then reported as "timed out after 5000ms" (measured). Vitest's config timeout works (measured: the 5 s default failed 30 slow tests). Fix on Bun:
   - `scripts/run-bun-tests.ts` passes an explicit `--timeout`. The gate runner already does this for suites with `testTimeoutMs`.
   - The 7 tests that failed at 5 s under load get explicit timeouts or get faster. Most were `playlist …` cases. One earlier run also failed `new installation fixed documents subset 26, rejection true` at 6.2 s. GitHub's runners are slower than an M1 Pro, so these are CI flakes in waiting (inferred).
2. *Agent-quiet output.* When `CLAUDECODE` (and other variables) is set, `bun test` hides pass lines (measured; [#44459](https://github.com/oven-sh/bun/issues/44459), 2026-10-02, open). [PR #45388](https://github.com/oven-sh/bun/pull/45388) (opened 2026-10-15, not merged) would add `AI_AGENT`, `GEMINI_CLI`, `CODEX_THREAD_ID` and `CODEX_CI` as triggers and make `AGENT` a boolean (sourced). `scripts/run-fixture-gates.ts:15` strips `CLAUDECODE`, `AI_AGENT` and `CLAUDE_CODE_ENTRYPOINT` but not `REPL_ID`, and it doesn't set `AGENT`. Fix on Bun: every runner that parses Bun output sets `AGENT=0` in the child environment and keeps the stripping. `AGENT=0` turns detection off under both the current rules and PR #45388's (sourced from the PR and issue text). Parse the summary counts (`N pass`, `N fail`, `Ran N tests`), which Bun prints in both modes (measured).
3. *Wall time.* The serial Bun run used 893 s of CPU in 1,172 s, so it ran on one core (measured). `run-bun-tests.ts --shard i/n` already exists. Run the shards as concurrent processes or CI matrix jobs, and split `withdrawn-document-recovery.bun-test.ts` (603 s) and `consent-recovery.bun-test.ts` (200 s) into several files, so no shard waits on one file. With 4 to 8 balanced shards, the suite should fall from about 20 minutes toward 3 to 5 minutes (inferred from the per-file sums). This is the largest CI-time gain on the table, and it doesn't involve Vite+.
4. *Branch coverage.* Bun reports none. Q-TEST-40 and Q-TEST-3 accept that, and Vitest's v8 coverage would be the one real gain. It doesn't outweigh the cost and the 2.3 to 2.8× slowdown (inferred).

## Adoption plan

Now, on the 2.0 branches:

1. Add `oxlint` and `oxlint-tsgolint` as exact-pinned dev dependencies, matched to `@typescript/native` 7.0.x. Add `.oxlintrc.json` with the default `correctness` rules plus `typescript/no-floating-promises`, `typescript/await-thenable` and `typescript/no-misused-promises`, and `options.typeAware: true`. Turn off `no-unused-expressions` in `**/*.type-test.ts`.
2. Add a `lint` script, `oxlint --type-aware --deny-warnings src tests tools scripts build`. Add it to `ci.yml`'s `check` job before `typecheck`. It costs about 3 s.
3. Spend one PR on the 281 default findings and the floating-promise and await-thenable findings, then turn warnings into errors.
4. Write the Q-TEST-33 `$state` identity check as a guard test in `tests/guards/`, as the existing guards are. Oxlint's JS plugins are alpha and can't see Svelte templates, so a lint rule there would miss template comparisons (inferred). Revisit when oxc's framework support ships.
5. Fix the Bun runner. `scripts/run-bun-tests.ts` passes `--timeout` (start at 10,000 ms, matching the gates' common value) and sets `AGENT=0` for the child. `scripts/run-fixture-gates.ts` sets `AGENT=0` and also deletes `REPL_ID`. Add explicit timeouts to the 7 slow `playlist` cases, or make them faster.
6. Parallelize `bun test` in CI with a shard matrix over `run-bun-tests.ts --shard`, after splitting the two heaviest store test files.

With the 2.0 cutover, after 1.x is deleted:

7. Remove `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, `vitest.config.ts` and `vitest.setup.ts`, and the `test:legacy`, `test:watch` and current `test:coverage` scripts, as Q-TOOL-19 lists.
8. Add `oxfmt`, pinned, with a config matching the house style (`semi: false`, wide `printWidth`, `svelte: true`). Land the reformat as one commit while no other branch is open, and add its hash to `.git-blame-ignore-revs`. Add `fmt:check` to the `check` job.

Later, only if something changes:

9. Re-measure Vitest against Bun if Bun's runner regresses, or if the suite's cost moves from CPU-bound store tests to many small files. Reconsider Vite Task when it gains remote caching. Don't adopt the `vite-plus-core` override while AMO rebuilds from source, unless WXT documents Vite+ support.

Spec follow-ups for the owner: Q-TOOL-16 gains `lint` (and `fmt:check` at cutover). Q-TOOL-19's added list gains `oxlint` and `oxlint-tsgolint` (and `oxfmt`). Q-TOOL-15 gains `--timeout` and the `AGENT=0` rule.

## Method and scratch artefacts

- Copies: `/tmp/vplus-research/base`, `up` and `vp`, each an rsync of the worktree without `.git`, `node_modules`, `.output`, `.scratch` and `.audit`, installed with `bun install`. Tools went into `/tmp/vplus-research/tools`. The Vitest experiment used a scratch config `base/.vx/vitest.config.ts`, which aliases `bun:test` to a shim re-exporting `vitest`.
- Logs: `/tmp/vplus-research/bun-test-2.log` (full suite with `AGENT=0`), `vitest-consent.log` and `vitest-consent.json`.
- The full-suite run overlapped with about a minute of parallel builds, and the type-aware oxlint run overlapped with the Vitest experiment. The single-file Bun and Vitest runs and the build and lint timings ran without other load.
- In the scratch copy, the `fixture-gates` guard failed once because building the pilot creates `tools/fixtures/svelte-pilot/.wxt/tsconfig.json`, which the guard counts as an ungated type project. That is a side finding: the guard should ignore `.wxt/`.

## Sources

- VoidZero, "Announcing Vite+", 2025-10-13: https://voidzero.dev/posts/announcing-vite-plus
- VoidZero, "Announcing Vite+ Beta", 2026-07-02: https://voidzero.dev/posts/announcing-vite-plus-beta
- VoidZero, "Announcing Vite+ 1.0", 2026-09-28: https://voidzero.dev/posts/announcing-vite-plus-1-0
- VoidZero, "VoidZero is Joining Cloudflare", 2026-06-04: https://voidzero.dev/posts/voidzero-cloudflare
- SiliconANGLE, Cloudflare acquires VoidZero, 2026-06-04: https://siliconangle.com/2026/06/04/cloudflare-acquires-voidzero-maker-vite-javascript-toolchain/
- Vite+ site, read 2026-11-01: https://viteplus.dev/
- Vite+ migration guide, read 2026-11-01: https://viteplus.dev/guide/migrate
- Vite+ migration rules, read 2026-11-01: https://viteplus.dev/guide/migrate-rules
- Vite+ check guide, read 2026-11-01: https://viteplus.dev/guide/check
- InfoQ, "VoidZero Releases Vite+ Beta", 2026-08-22: https://www.infoq.com/news/2026/08/vite-plus-beta/
- vite-plus discussion #2852, Bun as a runtime, 2026-09-29: https://github.com/voidzero-dev/vite-plus/discussions/2852
- npm registry, `vite-plus@1.4.0` and `@voidzero-dev/vite-plus-core@1.4.0` metadata, read 2026-11-01: https://www.npmjs.com/package/vite-plus
- WXT PR #2340, "Migrate to Vite+ unified toolchain", opened 2026-05-08, open on 2026-11-01: https://github.com/wxt-dev/wxt/pull/2340
- Oxc, "Type-Aware Linting Stable", 2026-07-22: https://oxc.rs/blog/2026-07-22-type-aware-linting-stable
- Oxc, "Oxlint JS Plugins Alpha", 2026-03-11: https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha.html
- Oxc, formatter language support, read 2026-11-01: https://oxc.rs/docs/guide/usage/formatter/language-support.html
- Oxc, linter guide (framework files: script blocks only), read 2026-11-01: https://oxc.rs/docs/guide/usage/linter
- Vitest, "Vitest 5.0 is out!", 2026-09-03: https://vitest.dev/blog/vitest-5.html
- oven-sh/bun PR #39260, `test.timeout` in bunfig, opened 2026-08-16, open: https://github.com/oven-sh/bun/pull/39260
- oven-sh/bun issue #43787, `setDefaultTimeout` in a preload, 2026-09-22, open: https://github.com/oven-sh/bun/issues/43787
- oven-sh/bun issue #45192, preload timeout and sync blocks, 2026-10-13, open: https://github.com/oven-sh/bun/issues/45192
- oven-sh/bun issue #44459, `AGENT` and `AI_AGENT` detection, 2026-10-02, open: https://github.com/oven-sh/bun/issues/44459
- oven-sh/bun PR #45388, agent detection changes, opened 2026-10-15, open: https://github.com/oven-sh/bun/pull/45388
- oven-sh/bun issue #40842, `bun test` ignores a Vitest config, 2026-08-28, open: https://github.com/oven-sh/bun/issues/40842
