# Can `bun test` cover a WXT extension?

Type: research
Status: resolved
Labels: wayfinder:research
Part of: [Rebuild (2.0)](../map.md)

## Question

The README says `bun test` can't run today's tests because it doesn't resolve WXT's imports, which is why Vitest is used. What does it take to test a WXT extension with Bun's own test runner?

- Resolving WXT's aliases (`@/`, `#imports`, auto-imports) and `import.meta.env`, including per-browser values (Chrome vs Firefox builds).
- A fake `browser` API (`@webext-core/fake-browser`, `wxt/testing`).
- DOM tests: happy-dom through `@happy-dom/global-registrator`, Testing Library.
- Module mocking and coverage.

Say what the design has to allow for, for example keeping WXT-specific imports at the edges, and what can't work. Prove it with a minimal spike on the research branch if that's cheap.

## Answer

Yes. The spike passes on Bun 1.4.3; Bun 1.4.0, which `package.json` pins, has a bug that breaks per-browser runs. Full findings and a rerunnable spike (`docs/research/bun-test-spike/run.sh`): [`docs/research/bun-test.md`](https://github.com/Alioun/yt-playlist-tools/blob/research/bun-test/docs/research/bun-test.md) on branch `research/bun-test`.

- **Setup:** one `bunfig.toml` and three preloads.
  - `[define]` sets `import.meta.env.BROWSER`/`FIREFOX` as real booleans. The `@/` alias works because Bun reads tsconfig paths.
  - One preload installs WXT's fake `browser` and resets it before each test.
  - One registers happy-dom.
  - One adds the jest-dom matchers and Testing Library cleanup. The cleanup has to be registered in a preload, or components leak between files.
- **Proven on:** the real 1.x storage and auth modules, and a React 19 component (user-event, jest-dom). Today's Vitest files, unedited and with a small shim, gave 360 of 371 passing; the 11 failures use Vitest-only APIs.
- **WXT gives no help.** Its test integration is Vitest-only, and the Bun request was closed as won't-fix (#1150). `#imports` works through a short Bun plugin. Auto-imports only work through untyped WXT internals, so turn them off.
- **Pitfalls:**
  - Bun 1.4.0's transpiler cache ignores `define`. A Chrome run followed by a Firefox run tested Chrome's code. Fixed in 1.4.1; 1.4.3 also fixes a fake-timer hang and several `--isolate` bugs.
  - `mock.module` lasts for the whole process (`mock.restore()` doesn't undo it), so run `bun test --isolate`.
  - Coverage is lines and functions only, with no branch coverage, and only for files a test actually loads.
- **Constraints this puts on 2.0:**
  - keep WXT at the entrypoints;
  - set `imports: false` and import from real paths (`wxt/browser`, `wxt/utils/storage`);
  - read `import.meta.env` in one platform module and pass the values in;
  - use injected dependencies rather than `mock.module`;
  - write tests in `bun:test`.
- **What can't work:**
  - anything that needs the build: CSS imports load as `{}`, plus `?inline`, `import.meta.glob` and the built `injectScript` output;
  - real browsers or real YouTube;
  - branch coverage.
- **Fake-browser gaps:** WXT's fake browser lacks `commands`, `contextMenus`, `scripting` and `permissions`, and doesn't model `storage.sync`'s quota.
