# Run the architecture guards

With dependencies installed, run the exact test file from the repository root.

```sh
bun test ./tests/guards/architecture.test.ts
```

The toolchain's `test:bun` command discovers this file through `./tests`. This unit changes no runner configuration. The checker uses the JavaScript compiler API from the toolchain's pinned `typescript ~6.0.3`. TypeScript 7.0.2 exports version metadata without that API. The separate `@typescript/native` compiler alias is not the parser.

The tests cover `imports`, `env`, `page-console`, `entrypoints`, `storage-writes`, and `running-cost` from Q-TEST-30 and Q-TEST-46. They scan production scripts in `src/`, including TS, TSX, JS, and Svelte script blocks. Adjacent `*.test.*`, `*.spec.*`, `*.bun-test.*`, and `.d.ts` files are excluded. Synthetic forbidden and permitted programs exercise the checks without importing production modules or running extension code.

## Read the frozen inventory

[`legacy-inventory.ts`](legacy-inventory.ts) listed each admitted finding from base `ebd10bfd72a0de2ea047acf4632bd5a3ebf6ae02`: 15 findings in the 1.x React app, `src/lib/` and the 1.x page session. The 2.0 cutover (G19) deleted those files, so the inventory is empty and every rule now applies to the whole tree.

Delete an inventory entry when its violation is resolved. Stale entries fail the current-tree comparison. New files, rules, expressions, and extra occurrences fail. Moving an unchanged finding to another line does not grant a new exception.

The test freezes admission hashes of each file, rule, reason, and evidence tuple. These hashes let entries disappear while rejecting additions, replacement expressions, duplicate entries, or raised ceilings. Do not regenerate the inventory or admission hashes to accept a failure. The guards and their frozen admission list remain reviewable code, so a deliberate edit of the enforcement code still needs review.

## Understand the analysis limits

- Imports include static imports, exports, `import type`, import types, import-equals, literal dynamic imports, and literal `require`. Relative paths and root `compilerOptions.paths` aliases are normalized. All configured fallback targets must remain in the permitted layer. `$kit` resolves to `src/site/kit/index.ts`. Inherited configs, custom `baseUrl`, package exports, symlinks, and generated bundler aliases are not resolved. Nonliteral module loads fail rather than bypass the dependency check.
- `shared/` and `page/` reject third-party imports, except Svelte in `shared/picker/`. Other target layers allow third-party libraries. WXT imports require an entrypoint or a documented browser-adapter location. WXT definition helpers require an entrypoint. `#imports` fails, as do unbound references to the enumerated WXT globals in `checker.ts`. This is not an exhaustive catalogue of every future WXT auto-import helper.
- Runtime checks follow same-file variable initializers, nested object destructuring, renamed or namespace `wxt/browser` imports, literal computed members, and constant string keys. Lexical symbols distinguish unrelated local bindings. They ignore erased type references. They do not perform whole-program dataflow, follow reassignment, function returns, object spreads, reflective calls, arbitrary runtime property names, or imported API aliases from other modules.
- Environment extraction is checked at the binding declaration, including unused exported, nested, and aliased bindings. Only direct literal `import.meta.env.VALUE` reads are allowed in `src/shared/platform.ts`.
- Storage writes cover direct `browser.storage`, `chrome.storage`, or bare `storage` area calls to `set`, `remove`, and `clear`, including the aliases above. They do not infer an arbitrarily named injected storage port from its structural type or follow WXT storage-item methods. The only admitted write owner is `src/background/store/`. No future storage adapter path is invented here. When its owner creates the adapter, add its exact approved file to the rule with permitted and forbidden probes.
- Every production script under `src/entrypoints/`, including nested UI scripts, has a 15-physical-line ceiling. Blank lines and comments count. A trailing newline does not add a line. This is a conservative restriction and does not infer WXT's discovery rules or measure the complexity of a one-line expression.
- The running-cost check covers intervals, alarms, browser-wide events, page storage listeners, raw resource APIs in features and kit, and literal broad-root subtree observations. It recognizes `document`, `document.body`, `document.documentElement`, and literal app-root selections through `querySelector`, plus nonnegative integer literal indexes and `item()` calls on `getElementsByTagName` and `querySelectorAll` collections. Same-file aliases of collections, indexes, and selected roots are followed. More complex selectors and indirect option construction need further checks. Scope lifetimes, one-shot timer duration, quotas, budgets, and actual idle work still require behavioral tests.
- Svelte's installed parser locates instance and module scripts, including TypeScript generic attributes, and ignores script tags inside HTML comments. The checker copies those script ranges at their original offsets for TypeScript analysis. Template expressions, HTML entrypoints, and build output are not analyzed for architecture violations. Component parse errors and script syntax errors fail with their source line. Parser compatibility with future syntax requires a fixture and an explicit toolchain update.

Registry, fixture-privacy, and watchlist guards are not implemented by this unit. Their authoritative artifacts do not exist yet. No placeholder artifacts are created.

## The forbidden-API guards

[`forbidden.test.ts`](forbidden.test.ts) scans the same production scripts with [`forbidden.ts`](forbidden.ts). Each rule names the spec ID it enforces:

| Rule | Fails when |
|---|---|
| `update-listener` | `onUpdateAvailable` appears anywhere (REL-MIG-06) |
| `item-migrations` | a `defineItem` call passes `version` or `migrations` (REL-MIG-07) |
| `oauth` | `browser.identity`, `chrome.identity`, `getAuthToken`, `launchWebAuthFlow` or `removeCachedAuthToken` appears, or `src/lib` exists (REL-CI-53) |
| `outbound` | `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource` or `RTCPeerConnection` appears, or a global `fetch` is called anywhere except `src/page/adapters/live-www.ts` (HEALTH-21) |
| `container-id` | `cookieStoreId` appears, as a name or a string key (ACC-41) |
| `state-identity` | kit or feature code compares a proxied `$state` value by identity (Q-TEST-33, UI-RULE-33) |

`state-identity` treats a `$state` binding as proxied when it starts as an object, array or `new` value, or when its type argument isn't a primitive or a DOM type. `$state.raw` doesn't proxy. Elements read through `for...of` or an array callback such as `find` count as proxied too. It fails on `===`, `!==`, `==` or `!=` against the binding or an element access on it, and on `includes`, `indexOf` or `lastIndexOf` with a non-literal argument. A property read such as `row.id` passes, so comparing by ID passes. Svelte templates aren't scanned.
