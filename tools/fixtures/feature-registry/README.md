# Qualify the production registry

This fixture imports the production registry and the real `desired` and `pageLinkEntries` planner functions. `registry.bun-test.ts` also supplies the registry to the real Registrar through its existing scripted ports. It never creates synthetic feature entrypoints.

Nothing in this fixture has run in this authoring unit. Compiling controls are proposals until a compiler accepts each mutation and its named behavior test fails. Type-negative comments are proposals until removing each one produces a diagnostic on its intended next line.

`cases.ts` fixes 30 settings and authority inputs independently of the registry. `expected.json` fixes the full catalogue, library metadata, ownership and complete registration records and eager file lists. It does not compute an expected result from the registry. `expected.stdout.json` contains the exact single-line JSON plus newline that `run.ts` must emit after its assertion succeeds. No timing, random ID or build path appears in that output.

The sync-alone case has no shared-settings switch because its switch belongs to Device. Its catalogue path and empty page definition are checked separately. `filesFor` intentionally projects settings independently of consent, schema and access. Therefore authority-held scenarios have no actual desired registrations while retaining their hypothetical eager file lists. Those lists confer no browser authority.

## Run the deferred bounded gates

Only an executor holding the coordinator's sole product runtime lease runs these commands. The authoring worktree has no `node_modules` or generated WXT config. Supply an already prepared dependency directory through `--dependencies` if it is not bound at this worktree's `node_modules`. Do not install dependencies for this unit.

The commands below use the worktree's `node_modules` default. They are exact proposals, all unexecuted.

```sh
timeout -k 10 540 python3 tools/fixtures/feature-registry/qualify.py positive
timeout -k 10 540 python3 tools/fixtures/feature-registry/qualify.py types
timeout -k 10 540 python3 tools/fixtures/feature-registry/qualify.py controls
```

The helper verifies the sealed candidate, copies source once per mode beneath this worktree's audit directory, and binds only the prepared dependencies. It refuses an existing run directory and preserves every log. Each child has a deadline, a recorded PID and a reap result. Exit code 124 stops that mode. An unchanged timeout is not retried.

`positive` runs the focused TypeScript project, registry and planner behavior tests, Registrar behavior tests, existing architecture guards, and the compact consumer. It compares consumer stdout byte-for-byte with `expected.stdout.json`. The TypeScript project is standalone and does not run WXT preparation.

`types` first requires the positive compile. It removes one `@ts-expect-error` comment at a time while preserving line numbers. A failure counts only when the compiler reports a diagnostic on the annotated declaration's line. It restores the source after each case.

`controls` first requires the positive compile and registry tests. For every mutation in `controls.json`, it requires a successful compile followed by the designated test's explicit failure. A compile failure, surviving mutation, unrelated failure or missing named failure is not a successful control. It restores the source after each case.

The underlying positive operations, also unexecuted, are:

```sh
timeout -k 10 90 node node_modules/typescript/bin/tsc -p tools/fixtures/feature-registry/tsconfig.json --pretty false
timeout -k 10 120 bun test ./src/shared/features/registry.bun-test.ts ./src/shared/features/registration.bun-test.ts ./src/background/registrar/registrar.bun-test.ts ./tests/guards/architecture.test.ts
timeout -k 10 90 bun tools/fixtures/feature-registry/run.ts
```

Run the consumer through `positive` to capture exact stdout and compare its bytes. The qualifier's `result.json` records all children, codes, diagnostic targets and control results.

## Compiling behavior control proposals

| Mutation | Test that must fail after a successful compile |
| --- | --- |
| Remove sync | `catalogue covers the twelve feature IDs once in specification order` |
| Use quickSave as auto-add's setting | `planner and eager files agree with fixed records for auto-add-alone` |
| Force the Music section on inside filesFor | `planner and eager files agree with fixed records for music-section-off` |
| Give Gather a feature file | `planner and eager files agree with fixed records for gather-alone` |
| Add kit to the card menu | `card menu remains kit-free and no scenario eagerly loads popovers` |
| Drop queueMove from Music Play next | `Music actions retain all action dependencies and separate optional Undo jobs` |

The Music-section control targets the newly authored helper. The real planner's protected gate is unchanged. Shortcut Music-off cases also prove that another enabled Music feature cannot cause shortcut registration.

Whole-product acceptance still requires startup binding, actual entrypoints, native probe transport, site core, features, libraries, Monitor, budget and file guards, Chrome and Firefox builds, archive checks and native qualification. Existing guards remain unchanged. No registry, fixture-privacy or watchlist guard is claimed to exist. Reviews were not requested. Native guarantees remain unproven, privacy approval is pending, and activation is held.
