# Qualify the Registrar candidate

This fixture imports the real Registrar engine and supplies a scripted browser-shaped set of ports. Its four-entry registry is fixture input. Its file inventories are scripted facts. It supplies no production bundles, native probe, Store binding, browser integration, or native durability evidence.

Authoring ran no product code, tests, compiler, build, fixture, browser, server, package manager, or network command. Every gate below is unexecuted. Only the Setup/session qualification owner can grant the sole runtime lease. These commands are a deferred plan for that executor after source installation and dependency qualification. Do not run the broad suite as a substitute for these gates. Do not retry an unchanged timeout.

## Run the focused behavior gates

Run this command from the installed candidate root under the runtime lease.

```sh
timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/shared/features/registration.bun-test.ts ./src/background/registrar/registrar.bun-test.ts ./src/background/adapters/registrar.bun-test.ts
```

The engine tests drive public APIs and assert actual port effects. They cover readiness, idempotent registration differences, intervening owner changes, consent and access revocation, unrelated IDs, partial and rejected calls, missing readback, exact injection order, tab pacing, frozen and discarded exclusion, Gather-only selection, current-build inventory, repeated ensure, lazy popovers, replacement builds, unavailable probes, navigation, and disposal.

## Compile the native adapter and intended-line negatives

Prepared dependencies and generated WXT declarations are required. This authoring checkout has no qualified native compiler installation. Compile the focused project with the pinned native compiler. Preserve its emitted file list as inclusion evidence.

```sh
timeout -k 10 540 node node_modules/@typescript/native/bin/tsc --noEmit -p tools/fixtures/registrar/tsconfig.json --listFiles > /tmp/registrar-native-files.txt
rg -n 'src/background/registrar/(ports|registrar|registrar.type-test)\.ts|src/background/adapters/registrar(\.type-test)?\.ts|tools/fixtures/registrar/(scripted|run)\.ts' /tmp/registrar-native-files.txt
```

Require all seven named production, type-negative, and consumer inputs in the file list. Both `registrar.type-test.ts` files require the native types to accept the real browser and reject the intended invalid calls. A compile failure or an unused `@ts-expect-error` fails qualification.

Run the repository compiler separately to check inclusion in its normal project.

```sh
timeout -k 10 540 node node_modules/@typescript/native/bin/tsc --noEmit --listFiles > /tmp/registrar-repository-files.txt
rg -n 'src/background/registrar/(ports|registrar|registrar.type-test)\.ts|src/background/adapters/registrar(\.type-test)?\.ts' /tmp/registrar-repository-files.txt
```

The focused project includes the compact consumer explicitly. The normal project's output must include the engine, native adapter, and both type-negative files. A filename search is inclusion evidence only after the compiler exits successfully.

## Run the architecture guard

```sh
timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./tests/guards/architecture.test.ts
```

No guard, runner, inventory, package file, lockfile, WXT configuration, or entrypoint changes are proposed. A new guard failure requires a fix within the source fence or an exact unapplied patch for the integration owner.

## Check fixture determinism

Run the compact consumer twice and compare every output byte.

```sh
timeout -k 10 540 bun --no-env-file tools/fixtures/registrar/run.ts > /tmp/registrar-consumer-1.json
timeout -k 10 540 bun --no-env-file tools/fixtures/registrar/run.ts > /tmp/registrar-consumer-2.json
cmp /tmp/registrar-consumer-1.json /tmp/registrar-consumer-2.json
```

The expected consumer state has four startup IDs, eleven executions, Gather's two narrowed registrations before revocation, only `unrelated` at the end, one maximum concurrent mutation, and no background failures. This is an authored expectation, not an observed result.

## Compile behavioral defect controls

The generator emits six byte patches and a manifest. It is not run during authoring.

```sh
timeout -k 10 60 python3 tools/fixtures/registrar/defect-controls.py --root . --output /tmp/registrar-defect-controls
```

The qualification owner must prepare a separate disposable executor copy for each control, using the candidate manifest. Never mutate the sealed source. For each named patch, apply it in that executor copy, compile the focused project successfully, then run the named public behavior test and require a behavioral assertion failure. A compiler failure, missing import, launch failure, or timeout provides no defect-detection credit.

The control names and exact focused commands are listed here. Use the same compile command above with the executor copy as its working directory.

| Patch | Focused command after successful compilation |
| --- | --- |
| `forget-intervening-change.patch` | `timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/background/registrar/registrar.bun-test.ts --test-name-pattern 'owner change arriving during register'` |
| `trust-registration-resolution.patch` | `timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/background/registrar/registrar.bun-test.ts --test-name-pattern 'resolved partial registration'` |
| `repeat-current-build.patch` | `timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/background/registrar/registrar.bun-test.ts --test-name-pattern 'repeated ensure leaves settings unchanged'` |
| `reverse-injection-order.patch` | `timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/background/registrar/registrar.bun-test.ts --test-name-pattern 'open tabs run page, core, kit and feature'` |
| `reverse-tab-priority.patch` | `timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/background/registrar/registrar.bun-test.ts --test-name-pattern 'open tabs run page, core, kit and feature'` |
| `bypass-consent.patch` | `timeout -k 10 540 bun test --no-env-file --isolate --conditions=browser ./src/background/registrar/registrar.bun-test.ts --test-name-pattern 'consent and supported schema gate ensure'` |

Apply exactly one control per executor copy with the following command, substituting its name. No Git operation is required.

```sh
patch -p1 -i /tmp/registrar-defect-controls/<name>.patch
```

Preserve compiler output, test exit codes and assertion output, patch identities, and candidate identities. First run the unchanged candidate successfully. No mutant result counts before that baseline succeeds.

## Keep native gates held

No meaningful production build or native browser integration command exists for this unit yet. The integration owner must provide production registry values, core and kit bundles, page and feature bundles, popovers, a document and build probe with an authenticated transport, the owner projection, and startup composition. Then qualify Chromium and Firefox for persistent registration, optional host requests, timing, top-frame behavior, update retirement, navigation races, frozen and discarded tabs, inert one-off loads, settings propagation, and consent revocation.

Those native gates are blocked by missing assembly. Synthetic tests cannot pass them. Native guarantees remain unproven, privacy approval is pending, and activation is held.
