# Pointer and Keys qualification inputs

This fixture exercises the new shared services against the qualified Scope and canonical matcher. The consumer uses actual happy-dom elements, shadow roots and events. Its callback reads Pointer facts at invocation. It does not implement Items or a toaster.

`expected.jsonl` was authored independently before `run.ts`. Later qualification must compare complete stdout bytes through EOF twice and require empty stderr. A prefix comparison receives no credit.

`harness.ts` supplies hit-test stacks because happy-dom has no browser layout. It supplies focus-visible results because keyboard modality belongs to the browser. Its IME legacy and AltGraph cases supply the corresponding native event facts. These boundaries make synthetic behavior reproducible. They do not establish browser, rendering or accessibility behavior.

`controls.json` contains six proposed mutations. A future executor must first pass the compiler and named test, apply one exact mutation in a disposable copy, pass the mutated compiler, observe the named behavior failure, restore exact bytes and mode, and pass both baselines again. A compiler failure earns no sensitivity credit.

`type-probes.json` names every intended diagnostic line. A future executor must pass the baseline, remove one directive in a disposable copy, obtain the diagnostic at its intended statement, restore exact bytes and mode, and pass the compiler again. The negative files are compile-only inputs and must never be executed.

`qualify.py` authors both campaigns' execution mechanics. It requires a disposable candidate, the declared launcher hash and a new receipt directory. The `--runtime-lease` argument does not grant a lease or approve the launcher. The script itself remains unexecuted. An interrupted runtime candidate must be discarded or restored from the sealed source before reuse.

`unexecuted-gates.json` records exact command arguments for the later lease holder. Every command runs from a disposable complete candidate with prepared dependencies. Its declared launcher path is a future qualification location. No launcher is authored or approved by this unit. The coordinator must supply and validate a frozen credential-free bounded launcher there before execution. The previously released lifecycle launcher must not run or be reactivated.

Every Bun invocation, including descendants, requires `--no-env-file --no-install`. The launcher must pin executable identities, clear inherited credentials, use scratch paths, close stdin, bound execution and record child waits. This paragraph describes a future prerequisite, not a proven control in this authoring run.

All compiler, behavior, matcher, Scope, FeatureHost, guard, consumer, probe and control gates are unexecuted. The sole runtime lease belongs to the Backend/progressive UI worker. Reviews were not requested. No runtime lease, browser, installer, server, account operation, production assembly or activation is authorized here.
