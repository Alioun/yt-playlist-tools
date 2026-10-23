# Run the architecture guards

With dependencies installed, run the exact test file from the repository root.

```sh
bun test ./tests/guards/architecture.test.ts
```

The toolchain's `test:bun` command discovers this file through `./tests`. This unit changes no runner configuration. The checker uses the JavaScript compiler API from the toolchain's pinned `typescript ~6.0.3`. TypeScript 7.0.2 exports version metadata without that API. The separate `@typescript/native` compiler alias is not the parser.

The tests cover `imports`, `env`, `page-console`, `entrypoints`, `storage-writes`, and `running-cost` from Q-TEST-30 and Q-TEST-46. They scan production scripts in `src/`, including TS, TSX, JS, and Svelte script blocks. Adjacent `*.test.*`, `*.spec.*`, `*.bun-test.*`, and `.d.ts` files are excluded. Synthetic forbidden and permitted programs exercise the checks without importing production modules or running extension code.

## Read the frozen inventory

[`legacy-inventory.ts`](legacy-inventory.ts) lists each admitted finding from base `ebd10bfd72a0de2ea047acf4632bd5a3ebf6ae02`. Each entry records its file, original line, rule, reason, and exact expression or import specifier. There are 15 findings.

| File | Rule | Original lines | Findings |
| --- | --- | --- | --- |
| `src/components/SessionAccess.tsx` | imports | 1 | 1 |
| `src/entrypoints/background.ts` | entrypoints | 1 | 1 |
| `src/entrypoints/options/App.tsx` | entrypoints | 1 | 1 |
| `src/entrypoints/popup/App.tsx` | entrypoints | 1 | 1 |
| `src/entrypoints/youtube.content.tsx` | entrypoints, running-cost | 1, 94 | 2 |
| `src/lib/queue-button.ts` | running-cost | 291 | 1 |
| `src/lib/session.ts` | imports | 1 | 1 |
| `src/lib/storage.ts` | imports, storage-writes | 1, 2, 191, 209, 210, 210 | 6 |
| `src/page/youtube-session.ts` | imports | 1 | 1 |

These are five import violations, four oversized entrypoint scripts, four direct storage writes, and two broad subtree observers. No current environment or page-console findings are admitted. Existing WXT storage-item `setValue()` calls are outside the direct storage API check.

Delete an inventory entry when its violation is resolved. Stale entries fail the current-tree comparison. New files, rules, expressions, and extra occurrences fail. Moving an unchanged finding to another line does not grant a new exception. Entrypoint line counts may fall below their original ceilings of 216, 34, 272, and 165, but may not exceed them. Once a script has at most 15 lines, delete its entry.

The test freezes admission hashes of each file, rule, reason, and evidence tuple. These hashes let entries disappear while rejecting additions, replacement expressions, duplicate entries, or raised ceilings. Do not regenerate the inventory or admission hashes to accept a failure. The guards and their frozen admission list remain reviewable code, so a deliberate edit of the enforcement code still needs review.

## Understand the analysis limits

- Imports include static imports, exports, `import type`, import types, import-equals, literal dynamic imports, and literal `require`. Relative paths and root `compilerOptions.paths` aliases are normalized. All configured fallback targets must remain in the permitted layer. `$kit` resolves to `src/site/kit/index.ts`. Inherited configs, custom `baseUrl`, package exports, symlinks, and generated bundler aliases are not resolved. Nonliteral module loads fail rather than bypass the dependency check.
- `shared/` and `page/` reject third-party imports, except Svelte in `shared/picker/`. Other target layers allow third-party libraries. WXT imports require an entrypoint or a documented browser-adapter location. WXT definition helpers require an entrypoint. `#imports` fails, as do unbound references to the enumerated WXT globals in `checker.ts`. This is not an exhaustive catalogue of every future WXT auto-import helper.
- Runtime checks follow same-file variable initializers, nested object destructuring, renamed or namespace `wxt/browser` imports, literal computed members, and constant string keys. Lexical symbols distinguish unrelated local bindings. They ignore erased type references. They do not perform whole-program dataflow, follow reassignment, function returns, object spreads, reflective calls, arbitrary runtime property names, or imported API aliases from other modules.
- Storage writes cover direct `browser.storage`, `chrome.storage`, or bare `storage` area calls to `set`, `remove`, and `clear`, including the aliases above. They do not infer an arbitrarily named injected storage port from its structural type or follow WXT storage-item methods. The only admitted write owner is `src/background/store/`. No future storage adapter path is invented here. When its owner creates the adapter, add its exact approved file to the rule with permitted and forbidden probes.
- Every production script under `src/entrypoints/`, including nested UI scripts, has a 15-physical-line ceiling. Blank lines and comments count. A trailing newline does not add a line. This is a conservative restriction and does not infer WXT's discovery rules or measure the complexity of a one-line expression.
- The running-cost check covers intervals, alarms, browser-wide events, page storage listeners, raw resource APIs in features and kit, and literal broad-root subtree observations. It recognizes `document`, `document.body`, `document.documentElement`, and literal app-root selections through `querySelector` or `getElementsByTagName`. More complex selectors and indirect option construction need further checks. Scope lifetimes, one-shot timer duration, quotas, budgets, and actual idle work still require behavioral tests.
- Svelte checks parse script blocks with original line offsets. Template expressions, HTML entrypoints, and build output are not analyzed. Syntax errors in parsed scripts fail with their source line. Parser compatibility with future syntax requires a fixture and an explicit toolchain update.

Registry, fixture-privacy, and watchlist guards are not implemented by this unit. Their authoritative artifacts do not exist yet. No placeholder artifacts are created.
