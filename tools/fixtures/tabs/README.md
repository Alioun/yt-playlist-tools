# Qualify canonical tabs under a later runtime lease

The authoring task executes none of these files. `run.ts` is a consumer of the real Tabs engine and canonical owner over scripted native, RPC-outcome, and Registrar ports. `tabs.bun-test.ts` and `owner.bun-test.ts` assert native calls, stored records, deadlines, removal races, privacy isolation, and transport outcomes. The adapter suite exercises the actual shared RPC caller over fake native browser methods.

`tsconfig.json` covers the new engine, adapter, contracts, fixture, and owner tests. Intended-line negatives live in `src/background/tabs/tabs.type-test.ts` and the appended tab cases in `src/background/store/session-memory.type-test.ts`. The projection's two browser-type negatives live in `tools/fixtures/tab-projection/native.type-test.ts`, where native imports are allowed. Its other nine cases remain in the store type-test file. Qualification must probe each suppression separately and verify its intended diagnostic line after removal. Restore exact bytes and modes after each probe.

`controls.json` defines nine behavior mutations. None has compiled or run yet. For one control, `controls.py` first requires a passing compiler and matching baseline test. It applies exactly one replacement, requires compilation, requires the test to fail, restores bytes and modes, and requires the baseline test to pass again. Its explicit runtime-lease argument prevents an accidental authoring invocation. The coordinator owns the actual lease grant.

The protected account-removal fixture and AddFlow session suite contain the old incomplete tab representation. The authoring handoff includes an exact unapplied proposal for those two paths. Apply that proposal in a separately authorized integration before broad regressions. Do not weaken tab validation or change account cleanup to retain the old expectation.

Use the already prepared dependencies and pinned Node and Bun binaries from the handoff. Do not install packages. Run Bun with `--no-env-file --no-install`. Each command needs a bounded deadline and a new evidence directory. The later executor must record and reap its own children.

Run the focused compiler, focused tests, consumer, intended-line negatives, and one control per bounded command. Then run the whole-project compiler and the applicable owner, AddFlow, native adapter, and architecture regressions. `deferred-commands.json` in the authoring handoff gives exact command arguments and deadlines. All gates remain unexecuted until a new runtime lease is granted.

The fixture view is an explicit synthetic projection. It is not the production ARC-MSG-05 projection. Native guarantees remain unproven. Privacy approval is pending, activation is held, and this unit does not complete 2.0.
